CREATE OR REPLACE FUNCTION public.product_availability()
RETURNS TABLE (product_id uuid, in_stock boolean, is_low boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.product_id,
         (i.quantity - i.reserved_quantity) > 0 AS in_stock,
         (i.quantity - i.reserved_quantity) > 0
           AND (i.quantity - i.reserved_quantity) <= i.low_stock_threshold AS is_low
  FROM public.inventory i
  JOIN public.products p ON p.id = i.product_id
  WHERE p.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.product_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_availability() TO anon, authenticated, service_role;