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

  -- Repeating the current status is a safe no-op (no audit entry).
  IF v_order.status = p_status THEN
    RETURN v_order.status;
  END IF;

  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_DELIVERED';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;

  -- Delivery completion is reserved for the upcoming QR + delivery-code flow.
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
    -- Only the single next step forward is permitted.
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

    -- Payment is never faked from here; anything past pending needs real payment.
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

  RETURN p_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, order_status) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, order_status) TO authenticated;