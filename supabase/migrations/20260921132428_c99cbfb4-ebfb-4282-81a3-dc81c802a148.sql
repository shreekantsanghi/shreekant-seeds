ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_cleared_at timestamptz;

CREATE OR REPLACE FUNCTION public.consume_order_cart(p_order_id uuid)
RETURNS TABLE(result text, removed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_removed integer := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, 0;
    RETURN;
  END IF;

  IF v_order.cart_cleared_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_cleared'::text, 0;
    RETURN;
  END IF;

  IF v_order.payment_status <> 'paid' THEN
    RETURN QUERY SELECT 'not_eligible'::text, 0;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.product_id, SUM(oi.quantity)::integer AS purchased
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    UPDATE public.cart_items c
       SET quantity = c.quantity - v_item.purchased,
           updated_at = now()
     WHERE c.user_id = v_order.user_id
       AND c.product_id = v_item.product_id
       AND c.quantity > v_item.purchased;

    DELETE FROM public.cart_items c
     WHERE c.user_id = v_order.user_id
       AND c.product_id = v_item.product_id
       AND c.quantity <= v_item.purchased;
    IF FOUND THEN
      v_removed := v_removed + 1;
    END IF;
  END LOOP;

  UPDATE public.orders SET cart_cleared_at = now() WHERE id = p_order_id;

  RETURN QUERY SELECT 'cleared'::text, v_removed;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_order_cart(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_cart(uuid) TO service_role;