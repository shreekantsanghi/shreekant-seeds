ALTER TABLE public.product_discounts
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  ADD COLUMN product_type public.product_type;

ALTER TABLE public.product_discounts DROP CONSTRAINT product_discounts_target_type_check;
ALTER TABLE public.product_discounts DROP CONSTRAINT product_discounts_check;
ALTER TABLE public.product_discounts
  ADD CONSTRAINT product_discounts_target_type_check
    CHECK (target_type IN ('product','brand','category','product_type')),
  ADD CONSTRAINT product_discounts_check CHECK (
       (target_type = 'product'      AND product_id IS NOT NULL AND brand_id IS NULL AND category_id IS NULL AND product_type IS NULL)
    OR (target_type = 'brand'        AND brand_id IS NOT NULL AND product_id IS NULL AND category_id IS NULL AND product_type IS NULL)
    OR (target_type = 'category'     AND category_id IS NOT NULL AND product_id IS NULL AND brand_id IS NULL AND product_type IS NULL)
    OR (target_type = 'product_type' AND product_type IS NOT NULL AND product_id IS NULL AND brand_id IS NULL AND category_id IS NULL));

CREATE INDEX product_discounts_category_idx ON public.product_discounts(category_id);
CREATE INDEX product_discounts_type_idx ON public.product_discounts(product_type);

CREATE OR REPLACE FUNCTION public.product_discount_percent(p_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(max(d.percent), 0)
  FROM public.products p
  JOIN public.product_discounts d ON d.is_active AND now() >= d.starts_at AND now() < d.ends_at
  LEFT JOIN public.brands b ON b.id = d.brand_id
  WHERE p.id = p_product_id
    AND (d.product_id = p.id
         OR (d.target_type = 'brand' AND p.brand IS NOT NULL
             AND lower(btrim(b.name)) = lower(btrim(p.brand)))
         OR (d.target_type = 'category' AND d.category_id = p.category_id)
         OR (d.target_type = 'product_type' AND d.product_type = p.product_type));
$$;
REVOKE ALL ON FUNCTION public.product_discount_percent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_discount_percent(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.active_product_discounts()
RETURNS TABLE(product_id uuid, percent numeric, discounted_price numeric, ends_at timestamptz, reason text, reason_hi text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id) p.id, d.percent,
         round(p.price * (1 - d.percent / 100), 2), d.ends_at, d.reason, d.reason_hi
  FROM public.products p
  JOIN public.product_discounts d ON d.is_active AND now() >= d.starts_at AND now() < d.ends_at
  LEFT JOIN public.brands b ON b.id = d.brand_id
  WHERE p.is_active
    AND (d.product_id = p.id
         OR (d.target_type = 'brand' AND p.brand IS NOT NULL
             AND lower(btrim(b.name)) = lower(btrim(p.brand)))
         OR (d.target_type = 'category' AND d.category_id = p.category_id)
         OR (d.target_type = 'product_type' AND d.product_type = p.product_type))
  ORDER BY p.id, d.percent DESC, d.ends_at ASC;
$$;
REVOKE ALL ON FUNCTION public.active_product_discounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_product_discounts() TO anon, authenticated, service_role;