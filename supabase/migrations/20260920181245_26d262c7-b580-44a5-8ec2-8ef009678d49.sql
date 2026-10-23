-- ============ 1. Table ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer','merchant')),
  notification_type text NOT NULL,
  category text NOT NULL CHECK (category IN ('order','payment','delivery','inventory','general')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('action_required','important','normal')),
  title text NOT NULL,
  message text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  address_id uuid REFERENCES public.addresses(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  action_url text,
  action_label text,
  is_read boolean NOT NULL DEFAULT false,
  requires_action boolean NOT NULL DEFAULT false,
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uniq
  ON public.notifications (recipient_user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (recipient_user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS notifications_order_idx ON public.notifications (order_id);

GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own notifications" ON public.notifications;
CREATE POLICY "Users read their own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = (SELECT auth.uid()));

-- Stock alert state so one transition sends one alert, and restocking resets it.
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS low_stock_notified boolean NOT NULL DEFAULT false;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS out_of_stock_notified boolean NOT NULL DEFAULT false;

-- Realtime delivery (RLS still applies per subscriber).
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications')
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- ============ 2. Writers (backend only) ============
CREATE OR REPLACE FUNCTION public.notify_user(
  p_recipient uuid, p_audience text, p_type text, p_category text, p_priority text,
  p_title text, p_message text,
  p_order_id uuid DEFAULT NULL, p_address_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL,
  p_action_url text DEFAULT NULL, p_action_label text DEFAULT NULL,
  p_requires_action boolean DEFAULT false, p_dedupe_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (
    recipient_user_id, audience, notification_type, category, priority, title, message,
    order_id, address_id, product_id, action_url, action_label, requires_action, dedupe_key, metadata)
  VALUES (
    p_recipient, p_audience, p_type, p_category, p_priority, p_title, p_message,
    p_order_id, p_address_id, p_product_id, p_action_url, p_action_label,
    p_requires_action, p_dedupe_key, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_admins(
  p_type text, p_category text, p_priority text, p_title text, p_message text,
  p_order_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL,
  p_action_url text DEFAULT NULL, p_action_label text DEFAULT NULL,
  p_requires_action boolean DEFAULT false, p_dedupe_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_exclude_user uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin record;
BEGIN
  FOR v_admin IN
    SELECT id FROM public.profiles
    WHERE role = 'admin' AND is_active = true
      AND (p_exclude_user IS NULL OR id <> p_exclude_user)
  LOOP
    PERFORM public.notify_user(v_admin.id, 'merchant', p_type, p_category, p_priority,
      p_title, p_message, p_order_id, NULL, p_product_id, p_action_url, p_action_label,
      p_requires_action, p_dedupe_key, p_metadata);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_user(uuid,text,text,text,text,text,text,uuid,uuid,uuid,text,text,boolean,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(text,text,text,text,text,uuid,uuid,text,text,boolean,text,jsonb,uuid) FROM PUBLIC, anon, authenticated;

-- ============ 3. Reader-side actions ============
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  UPDATE public.notifications
    SET is_read = true, read_at = COALESCE(read_at, now())
  WHERE recipient_user_id = auth.uid() AND is_read = false AND id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  UPDATE public.notifications
    SET is_read = true, read_at = COALESCE(read_at, now())
  WHERE recipient_user_id = auth.uid() AND is_read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ============ 4. Payment events ============
CREATE OR REPLACE FUNCTION public.notify_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_notify_paid ON public.orders;
CREATE TRIGGER orders_notify_paid AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_paid();

CREATE OR REPLACE FUNCTION public.notify_payment_failed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND OR v_order.payment_status = 'paid' OR v_order.status = 'cancelled' THEN
      RETURN NEW;
    END IF;
    -- One actionable notification per order, however many attempts fail.
    PERFORM public.notify_user(v_order.user_id, 'customer', 'payment_failed', 'payment', 'action_required',
      'Payment failed',
      'Your payment for order ' || v_order.order_number || ' was not completed. You can try again.',
      v_order.id, NULL, NULL, '/orders/' || v_order.id::text, 'Retry Payment', true,
      'payment_failed:' || v_order.id::text);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS payments_notify_failed ON public.payments;
CREATE TRIGGER payments_notify_failed AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_failed();

-- ============ 5. Stock events ============
CREATE OR REPLACE FUNCTION public.notify_inventory_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available integer;
  v_name text;
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
      NEW.low_stock_notified := true;
    END IF;
  ELSE
    -- Restocked above the threshold: future transitions may notify again.
    NEW.low_stock_notified := false;
    NEW.out_of_stock_notified := false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS inventory_notify_state ON public.inventory;
CREATE TRIGGER inventory_notify_state BEFORE INSERT OR UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.notify_inventory_state();

-- ============ 6. Order creation ============
CREATE OR REPLACE FUNCTION public.create_pending_order(p_address_id uuid, p_idempotency_key text)
 RETURNS TABLE(order_id uuid, order_number text, total_amount numeric, delivery_approval_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_addr public.addresses%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_settings public.delivery_settings%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_item record;
  v_count integer := 0;
  v_pieces integer := 0;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax numeric := 0;
  v_line_base numeric;
  v_delivery numeric := 0;
  v_distance numeric;
  v_needs_approval boolean := false;
  v_order_id uuid;
  v_number text;
  v_total numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  SELECT * INTO v_existing FROM public.orders o
    WHERE o.user_id = v_uid AND o.idempotency_key = p_idempotency_key
    LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_amount,
                        v_existing.delivery_approval_required;
    RETURN;
  END IF;

  SELECT * INTO v_addr FROM public.addresses a WHERE a.id = p_address_id AND a.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
  END IF;

  v_distance := v_addr.distance_km;

  SELECT * INTO v_settings FROM public.delivery_settings s WHERE s.is_active = true
    ORDER BY s.created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_CONFIRMED';
  END IF;

  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = v_uid;

  FOR v_item IN
    SELECT c.product_id, c.quantity, p.price,
           COALESCE(GREATEST(0, i.quantity - i.reserved_quantity), 0) AS available
    FROM public.cart_items c
    JOIN public.products p ON p.id = c.product_id AND p.is_active = true
    LEFT JOIN public.inventory i ON i.product_id = c.product_id
    WHERE c.user_id = v_uid
    ORDER BY c.created_at
  LOOP
    IF v_item.quantity < 1 OR v_item.quantity > v_item.available THEN
      RAISE EXCEPTION 'STOCK_CHANGED';
    END IF;
    v_count := v_count + 1;
    v_pieces := v_pieces + v_item.quantity;
    v_subtotal := v_subtotal + round(v_item.price * v_item.quantity, 2);
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CART_EMPTY';
  END IF;
  IF v_count <> (SELECT count(*) FROM public.cart_items c WHERE c.user_id = v_uid) THEN
    RAISE EXCEPTION 'STOCK_CHANGED';
  END IF;
  IF v_subtotal < COALESCE(v_settings.minimum_order_amount, 0) THEN
    RAISE EXCEPTION 'MINIMUM_ORDER_NOT_MET';
  END IF;

  -- 1. A merchant-approved saved address always wins.
  IF v_addr.delivery_approved AND v_addr.approved_delivery_charge IS NOT NULL THEN
    v_delivery := v_addr.approved_delivery_charge;
    v_needs_approval := false;

  -- 2. Otherwise the existing automatic rules, unchanged.
  ELSIF v_distance IS NOT NULL
        AND NOT (v_distance > v_settings.free_delivery_max_km AND v_distance > v_settings.tier2_max_km) THEN
    IF v_pieces >= v_settings.free_delivery_min_pieces AND v_distance <= v_settings.free_delivery_max_km THEN
      v_delivery := 0;
    ELSE
      v_delivery := CASE WHEN v_distance <= v_settings.tier1_max_km THEN v_settings.tier1_charge ELSE v_settings.tier2_charge END;
    END IF;
    v_needs_approval := false;

  -- 3. Otherwise the shop must confirm before payment.
  ELSE
    v_delivery := 0;
    v_needs_approval := true;
  END IF;

  v_number := 'SKS-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    order_number, user_id, address_id, status, payment_status,
    subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
    customer_name, customer_phone, delivery_address, delivery_distance_km,
    taxable_value, cgst_amount, sgst_amount, igst_amount, idempotency_key,
    delivery_approval_required
  ) VALUES (
    v_number, v_uid, v_addr.id, 'pending', 'created',
    v_subtotal, 0, v_delivery, 0, round(v_subtotal + v_delivery, 2),
    COALESCE(v_addr.full_name, v_profile.full_name), COALESCE(v_addr.phone, v_profile.phone),
    jsonb_build_object(
      'full_name', v_addr.full_name, 'phone', v_addr.phone,
      'address_line1', v_addr.address_line1, 'address_line2', v_addr.address_line2,
      'landmark', v_addr.landmark, 'village_town', v_addr.village_town,
      'district', v_addr.district, 'state', v_addr.state, 'pincode', v_addr.pincode
    ),
    v_distance, 0, 0, 0, 0, p_idempotency_key,
    v_needs_approval
  ) RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT c.product_id, c.quantity, p.name, p.name_hi, p.sku, p.price, p.tax_rate,
           p.product_type, p.pack_size, p.unit, p.hsn_code
    FROM public.cart_items c
    JOIN public.products p ON p.id = c.product_id AND p.is_active = true
    WHERE c.user_id = v_uid
    ORDER BY c.created_at
  LOOP
    IF v_item.tax_rate IS NULL THEN
      v_line_base := round(v_item.price * v_item.quantity, 2);
      v_taxable := v_taxable + v_line_base;
      INSERT INTO public.order_items (order_id, product_id, product_name, product_name_hi, sku,
        quantity, unit_price, total_price, product_type, pack_size, unit, hsn_code, tax_rate, tax_amount)
      VALUES (v_order_id, v_item.product_id, v_item.name, v_item.name_hi, v_item.sku,
        v_item.quantity, v_item.price, round(v_item.price * v_item.quantity, 2),
        v_item.product_type, v_item.pack_size, v_item.unit, v_item.hsn_code, NULL, 0);
    ELSE
      v_line_base := round((v_item.price * v_item.quantity) / (1 + v_item.tax_rate / 100), 2);
      v_taxable := v_taxable + v_line_base;
      v_tax := v_tax + round(v_item.price * v_item.quantity, 2) - v_line_base;
      INSERT INTO public.order_items (order_id, product_id, product_name, product_name_hi, sku,
        quantity, unit_price, total_price, product_type, pack_size, unit, hsn_code, tax_rate, tax_amount)
      VALUES (v_order_id, v_item.product_id, v_item.name, v_item.name_hi, v_item.sku,
        v_item.quantity, v_item.price, round(v_item.price * v_item.quantity, 2),
        v_item.product_type, v_item.pack_size, v_item.unit, v_item.hsn_code, v_item.tax_rate,
        round(v_item.price * v_item.quantity, 2) - v_line_base);
    END IF;
  END LOOP;

  UPDATE public.orders SET
    taxable_value = round(v_taxable, 2),
    tax_amount = round(v_tax, 2),
    cgst_amount = round(v_tax / 2, 2),
    sgst_amount = round(v_tax - round(v_tax / 2, 2), 2),
    igst_amount = 0
  WHERE id = v_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'order_created', 'order', v_order_id,
          jsonb_build_object('order_number', v_number, 'total_amount', round(v_subtotal + v_delivery, 2),
                             'delivery_approval_required', v_needs_approval));

  -- Notifications. The idempotent repeat path above returns before reaching here,
  -- so one order-creation event produces exactly one notification per recipient.
  IF v_needs_approval THEN
    PERFORM public.notify_user(v_uid, 'customer', 'delivery_approval_pending', 'delivery', 'important',
      'Delivery confirmation pending',
      'The shop is confirming the delivery charge for your address. We''ll notify you when payment is ready.',
      v_order_id, v_addr.id, NULL, '/orders/' || v_order_id::text, 'View Order', false,
      'delivery_pending:' || v_order_id::text);
    PERFORM public.notify_admins('delivery_approval_required', 'delivery', 'action_required',
      'Delivery approval required',
      'Order ' || v_number || ' is waiting for delivery-charge approval for the customer''s saved address.',
      v_order_id, NULL, '/admin/orders/' || v_order_id::text, 'Review & Approve', true,
      'delivery_approval:' || v_order_id::text);
  ELSE
    PERFORM public.notify_user(v_uid, 'customer', 'order_created', 'order', 'normal',
      'Order placed', 'Your order ' || v_number || ' has been created.',
      v_order_id, v_addr.id, NULL, '/orders/' || v_order_id::text, 'View Order', false,
      'order_created:' || v_order_id::text);
    PERFORM public.notify_admins('new_order', 'order', 'important',
      'New order received', 'Order ' || v_number || ' has been placed.',
      v_order_id, NULL, '/admin/orders/' || v_order_id::text, 'View Order', false,
      'new_order:' || v_order_id::text);
  END IF;

  SELECT o.total_amount INTO v_total FROM public.orders o WHERE o.id = v_order_id;
  RETURN QUERY SELECT v_order_id, v_number, v_total, v_needs_approval;
END;
$function$;

-- ============ 7. Delivery approval ============
CREATE OR REPLACE FUNCTION public.set_address_delivery_approval(p_address_id uuid, p_approved boolean, p_charge numeric DEFAULT NULL::numeric)
 RETURNS TABLE(approved boolean, charge numeric, orders_updated integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

      -- Customer can now pay. The merchant is never notified of their own action.
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
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'address_delivery_approval', 'address', p_address_id,
          jsonb_build_object('approved', p_approved, 'charge', v_charge, 'orders_updated', v_updated));

  RETURN QUERY SELECT p_approved, v_charge, v_updated;
END;
$function$;

-- ============ 8. Order status changes (customer only) ============
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status order_status)
 RETURNS order_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Only the customer hears about a status the merchant set themselves.
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

  RETURN p_status;
END;
$function$;

-- ============ 9. Delivery confirmed ============
CREATE OR REPLACE FUNCTION public.confirm_delivery(p_token text, p_pin text, p_code text)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  RETURN QUERY SELECT true, 'CONFIRMED'::text;
END;
$function$;

-- ============ 10. Stock shortfall on a paid order ============
CREATE OR REPLACE FUNCTION public.fulfill_order_inventory(p_order_id uuid)
 RETURNS TABLE(result text, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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