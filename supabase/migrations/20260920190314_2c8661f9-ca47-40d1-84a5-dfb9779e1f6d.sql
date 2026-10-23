-- 1. Merchant notification on successful delivery confirmation
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

  -- Merchant notification on the same authoritative delivery-confirmation event.
  PERFORM public.notify_admins('order_delivered', 'delivery', 'normal',
    'Order delivered',
    'Order ' || v_order.order_number || ' has been successfully delivered.',
    v_order.id, NULL, '/admin/orders/' || v_order.id::text, 'View Order', false,
    'order_status:' || v_order.id::text || ':delivered');

  RETURN QUERY SELECT true, 'CONFIRMED'::text;
END;
$function$;

-- 2. Merchant notification when a new customer account is created
CREATE OR REPLACE FUNCTION public.notify_new_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'customer' THEN
    PERFORM public.notify_admins('new_customer', 'account', 'normal',
      'New customer registered',
      COALESCE(NEW.full_name, 'A new customer') || ' has created an account.',
      NULL, NULL, '/admin/customers', 'View Customers', false,
      'new_customer:' || NEW.id::text,
      '{}'::jsonb, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER profiles_notify_new_customer
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_customer();