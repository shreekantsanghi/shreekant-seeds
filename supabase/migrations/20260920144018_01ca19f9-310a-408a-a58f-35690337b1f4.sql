CREATE OR REPLACE FUNCTION public.set_order_delivery_override(p_order_id uuid, p_free boolean)
RETURNS TABLE(delivery_charge numeric, total_amount numeric, override_free boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_charge numeric;
  v_total numeric;
  v_attempts integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF v_order.payment_status <> 'created' THEN RAISE EXCEPTION 'PAYMENT_ALREADY_STARTED'; END IF;

  SELECT count(*) INTO v_attempts
  FROM public.payments
  WHERE order_id = p_order_id AND status <> 'failed';
  IF v_attempts > 0 THEN RAISE EXCEPTION 'PAYMENT_ALREADY_STARTED'; END IF;

  IF p_free THEN
    UPDATE public.orders o
       SET delivery_override_free = true,
           delivery_charge_base = COALESCE(o.delivery_charge_base, o.delivery_charge),
           delivery_charge = 0,
           total_amount = round(o.subtotal - o.discount_amount, 2),
           updated_at = now()
     WHERE o.id = p_order_id
     RETURNING o.delivery_charge, o.total_amount INTO v_charge, v_total;
  ELSE
    UPDATE public.orders o
       SET delivery_override_free = false,
           delivery_charge = COALESCE(o.delivery_charge_base, o.delivery_charge),
           delivery_charge_base = NULL,
           total_amount = round(o.subtotal - o.discount_amount + COALESCE(o.delivery_charge_base, o.delivery_charge), 2),
           updated_at = now()
     WHERE o.id = p_order_id
     RETURNING o.delivery_charge, o.total_amount INTO v_charge, v_total;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'order_delivery_override', 'order', p_order_id,
          jsonb_build_object('order_number', v_order.order_number, 'enabled', p_free,
                             'delivery_charge', v_charge, 'total_amount', v_total));

  RETURN QUERY SELECT v_charge, v_total, p_free;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_order_delivery_override(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_delivery_override(uuid, boolean) TO authenticated;