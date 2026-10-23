-- Phase 12 — Email notifications: provider-ready outbox + event wiring.

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  recipient_type text NOT NULL CHECK (recipient_type IN ('customer', 'merchant')),
  event_type text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_dedupe_key_idx ON public.email_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON public.email_outbox (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS email_outbox_order_idx ON public.email_outbox (order_id);

GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS email_outbox_updated_at ON public.email_outbox;
CREATE TRIGGER email_outbox_updated_at BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.email_of_user(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT u.email::text FROM auth.users u WHERE u.id = p_user_id $$;
REVOKE ALL ON FUNCTION public.email_of_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_email(
  p_recipient_user_id uuid,
  p_recipient_type text,
  p_event_type text,
  p_dedupe_key text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_order_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_email text;
BEGIN
  IF p_recipient_user_id IS NULL OR p_dedupe_key IS NULL THEN RETURN; END IF;
  v_email := public.email_of_user(p_recipient_user_id);
  IF v_email IS NULL OR length(v_email) = 0 THEN RETURN; END IF;

  INSERT INTO public.email_outbox (
    recipient_email, recipient_user_id, recipient_type, event_type,
    order_id, product_id, payload, dedupe_key)
  VALUES (v_email, p_recipient_user_id, p_recipient_type, p_event_type,
    p_order_id, p_product_id, COALESCE(p_payload, '{}'::jsonb), p_dedupe_key)
  ON CONFLICT (dedupe_key) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  -- Email must never break the business operation that queued it.
  RAISE WARNING 'queue_email failed for % (%): %', p_event_type, p_dedupe_key, SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_email(uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_email_admins(
  p_event_type text,
  p_dedupe_key text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_order_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_admin record;
BEGIN
  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND is_active = true LOOP
    PERFORM public.queue_email(v_admin.id, 'merchant', p_event_type,
      p_dedupe_key || ':' || v_admin.id::text, p_payload, p_order_id, p_product_id);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_email_admins failed for % (%): %', p_event_type, p_dedupe_key, SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_email_admins(text, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit integer DEFAULT 20)
RETURNS SETOF public.email_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_outbox e
     SET status = 'sending', attempts = e.attempts + 1, updated_at = now()
   WHERE e.id IN (
     SELECT x.id FROM public.email_outbox x
      WHERE x.status = 'queued' AND x.attempts < 5
      ORDER BY x.created_at
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50))
      FOR UPDATE SKIP LOCKED)
  RETURNING e.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_email_batch(integer) FROM PUBLIC, anon, authenticated;

-- ============ Event wiring (Phase 11 in-app behaviour unchanged) ============

CREATE OR REPLACE FUNCTION public.notify_order_paid()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.user_id, 'customer', 'payment_successful', 'payment', 'normal',
      'Payment successful',
      'Payment for order ' || NEW.order_number || ' was received successfully.',
      NEW.id, NULL, NULL, '/orders/' || NEW.id::text, 'View Order', false,
      'payment_successful:' || NEW.id::text);
    PERFORM public.notify_admins('payment_received', 'payment', 'important',
      'Payment received',
      'Payment for order ' || NEW.order_number || ' has been successfully received.',
      NEW.id, NULL, '/admin/orders/' || NEW.id::text, 'View Order', false,
      'payment_received:' || NEW.id::text);

    PERFORM public.queue_email(NEW.user_id, 'customer', 'payment_successful',
      'payment_successful:' || NEW.id::text,
      jsonb_build_object('order_number', NEW.order_number, 'amount', NEW.total_amount),
      NEW.id, NULL);
    PERFORM public.queue_email_admins('payment_received',
      'payment_received:' || NEW.id::text,
      jsonb_build_object('order_number', NEW.order_number, 'amount', NEW.total_amount,
                         'customer_name', NEW.customer_name),
      NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_payment_failed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND OR v_order.payment_status = 'paid' OR v_order.status = 'cancelled' THEN
      RETURN NEW;
    END IF;
    PERFORM public.notify_user(v_order.user_id, 'customer', 'payment_failed', 'payment', 'action_required',
      'Payment failed',
      'Your payment for order ' || v_order.order_number || ' was not completed. You can try again.',
      v_order.id, NULL, NULL, '/orders/' || v_order.id::text, 'Retry Payment', true,
      'payment_failed:' || v_order.id::text);

    -- One email per order, however many attempts fail.
    PERFORM public.queue_email(v_order.user_id, 'customer', 'payment_failed',
      'payment_failed:' || v_order.id::text,
      jsonb_build_object('order_number', v_order.order_number, 'amount', v_order.total_amount),
      v_order.id, NULL);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_inventory_state()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_available integer;
  v_name text;
  v_stamp text := to_char(now(), 'YYYYMMDDHH24MISS');
BEGIN
  v_available := GREATEST(0, NEW.quantity - NEW.reserved_quantity);
  SELECT name INTO v_name FROM public.products WHERE id = NEW.product_id;
  IF v_name IS NULL THEN RETURN NEW; END IF;

  IF v_available <= 0 THEN
    IF NOT NEW.out_of_stock_notified THEN
      PERFORM public.notify_admins('out_of_stock', 'inventory', 'action_required',
        'Out of stock', v_name || ' is now out of stock.',
        NULL, NEW.product_id, '/admin/products/' || NEW.product_id::text, 'Manage Product', true, NULL,
        jsonb_build_object('product_name', v_name));
      PERFORM public.queue_email_admins('out_of_stock',
        'out_of_stock:' || NEW.product_id::text || ':' || v_stamp,
        jsonb_build_object('product_name', v_name, 'available', v_available),
        NULL, NEW.product_id);
      NEW.out_of_stock_notified := true;
      NEW.low_stock_notified := true;
    END IF;
  ELSIF v_available <= NEW.low_stock_threshold THEN
    NEW.out_of_stock_notified := false;
    IF NOT NEW.low_stock_notified THEN
      PERFORM public.notify_admins('low_stock', 'inventory', 'important',
        'Low stock', v_name || ' is now at or below its low-stock threshold.',
        NULL, NEW.product_id, '/admin/inventory', 'Manage Inventory', false, NULL,
        jsonb_build_object('product_name', v_name, 'available', v_available));
      PERFORM public.queue_email_admins('low_stock',
        'low_stock:' || NEW.product_id::text || ':' || v_stamp,
        jsonb_build_object('product_name', v_name, 'available', v_available,
                           'threshold', NEW.low_stock_threshold),
        NULL, NEW.product_id);
      NEW.low_stock_notified := true;
    END IF;
  ELSE
    NEW.low_stock_notified := false;
    NEW.out_of_stock_notified := false;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status order_status)
 RETURNS order_status LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_allowed order_status;
  v_title text;
  v_message text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status = p_status THEN
    RETURN v_order.status;
  END IF;

  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_DELIVERED';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;

  IF p_status = 'delivered' THEN
    RAISE EXCEPTION 'DELIVERY_CONFIRMATION_REQUIRED';
  END IF;

  IF p_status = 'cancelled' THEN
    IF v_order.status NOT IN ('pending', 'confirmed', 'processing') THEN
      RAISE EXCEPTION 'CANCEL_NOT_ALLOWED';
    END IF;
    IF v_order.inventory_fulfilled_at IS NOT NULL THEN
      RAISE EXCEPTION 'CANCEL_BLOCKED_INVENTORY';
    END IF;
  ELSE
    v_allowed := CASE v_order.status
      WHEN 'pending' THEN 'confirmed'
      WHEN 'confirmed' THEN 'processing'
      WHEN 'processing' THEN 'ready_for_delivery'
      WHEN 'ready_for_delivery' THEN 'out_for_delivery'
      ELSE NULL
    END::order_status;

    IF v_allowed IS NULL OR p_status <> v_allowed THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;

    IF v_order.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED';
    END IF;

    IF p_status = 'out_for_delivery' AND v_order.inventory_fulfilled_at IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_NOT_FULFILLED';
    END IF;
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'order_status_changed', 'order', p_order_id,
          jsonb_build_object('order_number', v_order.order_number,
                             'previous_status', v_order.status,
                             'new_status', p_status));

  v_title := CASE p_status
    WHEN 'confirmed' THEN 'Order confirmed'
    WHEN 'processing' THEN 'Your order is being prepared'
    WHEN 'ready_for_delivery' THEN 'Your order is ready for delivery'
    WHEN 'out_for_delivery' THEN 'Your order is out for delivery'
    WHEN 'cancelled' THEN 'Order cancelled'
    ELSE NULL END;
  v_message := CASE p_status
    WHEN 'confirmed' THEN 'Your order ' || v_order.order_number || ' has been confirmed by Shreekant Seeds.'
    WHEN 'processing' THEN 'Your order ' || v_order.order_number || ' is now being prepared.'
    WHEN 'ready_for_delivery' THEN 'Your order ' || v_order.order_number || ' is ready for delivery.'
    WHEN 'out_for_delivery' THEN 'Your order ' || v_order.order_number || ' is on the way. Keep your delivery code ready.'
    WHEN 'cancelled' THEN 'Your order ' || v_order.order_number || ' has been cancelled.'
    ELSE NULL END;

  IF v_title IS NOT NULL THEN
    PERFORM public.notify_user(v_order.user_id, 'customer', 'order_' || p_status::text, 'order',
      CASE WHEN p_status IN ('out_for_delivery', 'cancelled') THEN 'important' ELSE 'normal' END,
      v_title, v_message, p_order_id, NULL, NULL,
      '/orders/' || p_order_id::text, 'View Order', false,
      'order_status:' || p_order_id::text || ':' || p_status::text);
  END IF;

  -- Email only for confirmed / out_for_delivery / cancelled. Preparing and
  -- ready-for-delivery stay in-app only. The merchant is never emailed here.
  IF p_status IN ('confirmed', 'out_for_delivery', 'cancelled') THEN
    PERFORM public.queue_email(v_order.user_id, 'customer', 'order_' || p_status::text,
      'order_status:' || p_order_id::text || ':' || p_status::text,
      jsonb_build_object('order_number', v_order.order_number,
                         'amount', v_order.total_amount,
                         'status', p_status::text),
      p_order_id, NULL);
  END IF;

  RETURN p_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_delivery(p_token text, p_pin text, p_code text)
 RETURNS TABLE(ok boolean, reason text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.order_deliveries%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reason text;
BEGIN
  IF p_token IS NULL OR p_pin IS NULL OR p_code IS NULL
     OR length(p_token) < 16 OR p_pin !~ '^[0-9]{6}$' OR p_code !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.order_deliveries
    WHERE token_hash = public.sha256_hex(p_token)
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_row.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  IF v_row.verified_at IS NOT NULL THEN
    v_reason := 'ALREADY_VERIFIED';
  ELSIF v_row.locked_at IS NOT NULL OR v_row.attempt_count >= 5 THEN
    v_reason := 'LOCKED';
  ELSIF v_row.expires_at <= now() THEN
    v_reason := 'EXPIRED';
  ELSIF v_order.status <> 'out_for_delivery' THEN
    v_reason := 'NOT_OUT_FOR_DELIVERY';
  ELSIF v_row.delivery_pin_hash <> public.sha256_hex(p_pin)
        OR v_row.code_hash <> public.sha256_hex(p_code) THEN
    v_reason := 'WRONG_CODE';
  END IF;

  IF v_reason IS NOT NULL THEN
    IF v_reason = 'WRONG_CODE' THEN
      UPDATE public.order_deliveries
        SET attempt_count = attempt_count + 1,
            locked_at = CASE WHEN attempt_count + 1 >= 5 THEN now() ELSE locked_at END
        WHERE order_id = v_row.order_id
        RETURNING * INTO v_row;
    END IF;

    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (NULL, 'delivery_code_failed', 'order', v_row.order_id,
            jsonb_build_object('order_number', v_order.order_number,
                               'attempt_count', v_row.attempt_count,
                               'reason', v_reason));

    RETURN QUERY SELECT false, v_reason;
    RETURN;
  END IF;

  UPDATE public.orders
    SET status = 'delivered', updated_at = now()
    WHERE id = v_row.order_id AND status = 'out_for_delivery';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  UPDATE public.order_deliveries
    SET verified_at = now()
    WHERE order_id = v_row.order_id AND verified_at IS NULL;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'delivery_code_verified', 'order', v_row.order_id,
          jsonb_build_object('order_number', v_order.order_number,
                             'attempt_count', v_row.attempt_count));

  PERFORM public.notify_user(v_order.user_id, 'customer', 'order_delivered', 'delivery', 'normal',
    'Order delivered',
    'Your order ' || v_order.order_number || ' has been successfully delivered.',
    v_order.id, NULL, NULL, '/orders/' || v_order.id::text, 'View Order', false,
    'order_status:' || v_order.id::text || ':delivered');

  PERFORM public.notify_admins('order_delivered', 'delivery', 'normal',
    'Order delivered',
    'Order ' || v_order.order_number || ' has been successfully delivered.',
    v_order.id, NULL, '/admin/orders/' || v_order.id::text, 'View Order', false,
    'order_status:' || v_order.id::text || ':delivered');

  -- Customer email only: the merchant's delivery-completed notice stays in-app.
  PERFORM public.queue_email(v_order.user_id, 'customer', 'order_delivered',
    'order_status:' || v_order.id::text || ':delivered',
    jsonb_build_object('order_number', v_order.order_number, 'amount', v_order.total_amount),
    v_order.id, NULL);

  RETURN QUERY SELECT true, 'CONFIRMED'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_address_delivery_approval(p_address_id uuid, p_approved boolean, p_charge numeric DEFAULT NULL::numeric)
 RETURNS TABLE(approved boolean, charge numeric, orders_updated integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_settings public.delivery_settings%ROWTYPE;
  v_addr public.addresses%ROWTYPE;
  v_charge numeric;
  v_updated integer := 0;
  v_order record;
  v_new_total numeric;
  v_new_charge numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_addr FROM public.addresses a WHERE a.id = p_address_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
  END IF;

  SELECT * INTO v_settings FROM public.delivery_settings s WHERE s.is_active = true
    ORDER BY s.created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_SETTINGS_MISSING';
  END IF;

  IF p_approved THEN
    v_charge := COALESCE(p_charge, -1);
    IF v_charge NOT IN (0, v_settings.tier1_charge, v_settings.tier2_charge) THEN
      RAISE EXCEPTION 'INVALID_CHARGE';
    END IF;
  ELSE
    v_charge := NULL;
  END IF;

  UPDATE public.addresses a SET
    delivery_approved = p_approved,
    approved_delivery_charge = v_charge,
    updated_at = now()
  WHERE a.id = p_address_id;

  IF p_approved THEN
    FOR v_order IN
      SELECT o.id, o.user_id, o.order_number, o.subtotal, o.discount_amount,
             o.delivery_override_free, o.delivery_charge_base
      FROM public.orders o
      WHERE o.address_id = p_address_id
        AND o.delivery_approval_required = true
        AND o.payment_status = 'created'
        AND o.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM public.payments pay
          WHERE pay.order_id = o.id AND pay.status <> 'failed'
        )
      FOR UPDATE
    LOOP
      v_new_charge := CASE WHEN v_order.delivery_override_free THEN 0 ELSE v_charge END;
      v_new_total := round(v_order.subtotal - v_order.discount_amount + v_new_charge, 2);

      UPDATE public.orders o SET
        delivery_approval_required = false,
        delivery_charge = v_new_charge,
        delivery_charge_base = CASE WHEN v_order.delivery_override_free THEN v_charge ELSE v_order.delivery_charge_base END,
        total_amount = v_new_total,
        updated_at = now()
      WHERE o.id = v_order.id;
      v_updated := v_updated + 1;

      PERFORM public.notify_user(v_order.user_id, 'customer', 'delivery_approved', 'delivery', 'action_required',
        'Delivery approved — payment ready',
        CASE WHEN v_new_charge = 0
          THEN 'Your delivery address has been approved with FREE delivery. Your final order total is ₹'
               || trim(to_char(v_new_total, 'FM999999990.00')) || '. You can now complete payment.'
          ELSE 'Your delivery charge has been confirmed at ₹' || trim(to_char(v_new_charge, 'FM999999990'))
               || '. Your final order total is ₹' || trim(to_char(v_new_total, 'FM999999990.00'))
               || '. You can now complete payment.'
        END,
        v_order.id, p_address_id, NULL, '/orders/' || v_order.id::text, 'Continue to Payment', true,
        'delivery_approved:' || v_order.id::text,
        jsonb_build_object('delivery_charge', v_new_charge, 'total_amount', v_new_total));

      -- Customer email only; the merchant took this action themselves.
      PERFORM public.queue_email(v_order.user_id, 'customer', 'delivery_approved',
        'delivery_approved:' || v_order.id::text,
        jsonb_build_object('order_number', v_order.order_number,
                           'delivery_charge', v_new_charge,
                           'amount', v_new_total),
        v_order.id, NULL);
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'address_delivery_approval', 'address', p_address_id,
          jsonb_build_object('approved', p_approved, 'charge', v_charge, 'orders_updated', v_updated));

  RETURN QUERY SELECT p_approved, v_charge, v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fulfill_order_inventory(p_order_id uuid)
 RETURNS TABLE(result text, details jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_available integer;
  v_shortfall jsonb := '[]'::jsonb;
  v_deducted jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, '{}'::jsonb;
    RETURN;
  END IF;

  IF v_order.inventory_fulfilled_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_fulfilled'::text,
      jsonb_build_object('fulfilled_at', v_order.inventory_fulfilled_at);
    RETURN;
  END IF;

  IF v_order.payment_status <> 'paid' OR v_order.status = 'cancelled' THEN
    RETURN QUERY SELECT 'not_eligible'::text,
      jsonb_build_object('payment_status', v_order.payment_status, 'status', v_order.status);
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.product_id, SUM(oi.quantity)::integer AS required,
           MIN(oi.product_name) AS product_name
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    SELECT GREATEST(0, i.quantity - i.reserved_quantity) INTO v_available
    FROM public.inventory i WHERE i.product_id = v_item.product_id
    FOR UPDATE;

    v_available := COALESCE(v_available, 0);
    IF v_available < v_item.required THEN
      v_shortfall := v_shortfall || jsonb_build_object(
        'product_id', v_item.product_id,
        'product_name', v_item.product_name,
        'required', v_item.required,
        'available', v_available
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_shortfall) > 0 THEN
    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (NULL, 'inventory_shortfall', 'order', p_order_id,
            jsonb_build_object('order_number', v_order.order_number, 'lines', v_shortfall));

    PERFORM public.notify_admins('inventory_shortfall', 'inventory', 'action_required',
      'Stock issue on a paid order',
      'Order ' || v_order.order_number || ' is paid but stock could not be deducted. Manual reconciliation is required.',
      p_order_id, NULL, '/admin/orders/' || p_order_id::text, 'View Order', true,
      'inventory_shortfall:' || p_order_id::text);

    PERFORM public.queue_email_admins('inventory_shortfall',
      'inventory_shortfall:' || p_order_id::text,
      jsonb_build_object('order_number', v_order.order_number, 'lines', v_shortfall),
      p_order_id, NULL);

    RETURN QUERY SELECT 'insufficient_stock'::text, jsonb_build_object('lines', v_shortfall);
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.product_id, SUM(oi.quantity)::integer AS required
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    UPDATE public.inventory i
      SET quantity = i.quantity - v_item.required
    WHERE i.product_id = v_item.product_id
      AND i.quantity - i.reserved_quantity >= v_item.required;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_RACE';
    END IF;
    v_deducted := v_deducted || jsonb_build_object('product_id', v_item.product_id, 'quantity', v_item.required);
  END LOOP;

  UPDATE public.orders SET inventory_fulfilled_at = now() WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'inventory_deducted', 'order', p_order_id,
          jsonb_build_object('order_number', v_order.order_number, 'lines', v_deducted));

  RETURN QUERY SELECT 'fulfilled'::text, jsonb_build_object('lines', v_deducted);
END;
$function$;