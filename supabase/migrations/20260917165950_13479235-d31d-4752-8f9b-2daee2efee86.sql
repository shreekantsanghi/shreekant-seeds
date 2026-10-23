ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inventory_fulfilled_at timestamptz;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_quantity_non_negative CHECK (quantity >= 0);

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
  -- (a) Serialise concurrent confirmations (browser handler + webhook) on this order.
  SELECT * INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, '{}'::jsonb;
    RETURN;
  END IF;

  -- (c) Idempotency marker.
  IF v_order.inventory_fulfilled_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_fulfilled'::text,
      jsonb_build_object('fulfilled_at', v_order.inventory_fulfilled_at);
    RETURN;
  END IF;

  -- (b) Only a genuinely paid, non-cancelled order may consume stock.
  IF v_order.payment_status <> 'paid' OR v_order.status = 'cancelled' THEN
    RETURN QUERY SELECT 'not_eligible'::text,
      jsonb_build_object('payment_status', v_order.payment_status, 'status', v_order.status);
    RETURN;
  END IF;

  -- (d)+(e)+(f) Lock every inventory row in deterministic product order and
  -- check availability from the authoritative order_items snapshot first, so a
  -- shortfall never produces a partial deduction and the audit row survives.
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
    RETURN QUERY SELECT 'insufficient_stock'::text, jsonb_build_object('lines', v_shortfall);
    RETURN;
  END IF;

  -- (g) Guarded atomic deduction; rows are already locked above.
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
      -- Cannot happen while holding the locks; abort everything rather than
      -- risk a partial deduction.
      RAISE EXCEPTION 'INVENTORY_RACE';
    END IF;
    v_deducted := v_deducted || jsonb_build_object('product_id', v_item.product_id, 'quantity', v_item.required);
  END LOOP;

  -- (h) Mark fulfilled once, log once.
  UPDATE public.orders SET inventory_fulfilled_at = now() WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'inventory_deducted', 'order', p_order_id,
          jsonb_build_object('order_number', v_order.order_number, 'lines', v_deducted));

  RETURN QUERY SELECT 'fulfilled'::text, jsonb_build_object('lines', v_deducted);
END;
$function$;

REVOKE ALL ON FUNCTION public.fulfill_order_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_order_inventory(uuid) TO service_role;