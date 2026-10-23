CREATE OR REPLACE FUNCTION public.cart_change(p_product_id uuid, p_quantity integer, p_mode text)
RETURNS TABLE(quantity integer, adjusted boolean, out_of_stock boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active boolean;
  v_available integer := 0;
  v_current integer := 0;
  v_wanted integer;
  v_final integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_mode NOT IN ('add', 'set') THEN
    RAISE EXCEPTION 'INVALID_MODE';
  END IF;

  SELECT p.is_active INTO v_active FROM public.products p WHERE p.id = p_product_id;

  SELECT GREATEST(0, i.quantity - i.reserved_quantity) INTO v_available
  FROM public.inventory i WHERE i.product_id = p_product_id;
  v_available := COALESCE(v_available, 0);

  IF COALESCE(v_active, false) = false OR v_available <= 0 THEN
    DELETE FROM public.cart_items c WHERE c.user_id = v_uid AND c.product_id = p_product_id;
    RETURN QUERY SELECT 0, true, true;
    RETURN;
  END IF;

  SELECT c.quantity INTO v_current FROM public.cart_items c
  WHERE c.user_id = v_uid AND c.product_id = p_product_id;
  v_current := COALESCE(v_current, 0);

  IF p_mode = 'add' THEN
    v_wanted := LEAST(v_current + GREATEST(p_quantity, 0), 99);
  ELSE
    v_wanted := LEAST(GREATEST(p_quantity, 0), 99);
  END IF;

  IF v_wanted < 1 THEN
    DELETE FROM public.cart_items c WHERE c.user_id = v_uid AND c.product_id = p_product_id;
    RETURN QUERY SELECT 0, false, false;
    RETURN;
  END IF;

  v_final := LEAST(v_wanted, v_available);

  INSERT INTO public.cart_items (user_id, product_id, quantity)
  VALUES (v_uid, p_product_id, v_final)
  ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  RETURN QUERY SELECT v_final, (v_final < v_wanted), false;
END;
$$;

REVOKE ALL ON FUNCTION public.cart_change(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cart_change(uuid, integer, text) TO authenticated;