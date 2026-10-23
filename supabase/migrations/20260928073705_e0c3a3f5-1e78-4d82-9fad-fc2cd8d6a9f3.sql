CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX brands_name_lower_key ON public.brands (lower(trim(name)));
GRANT SELECT, INSERT, UPDATE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchants can view brands" ON public.brands FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Merchants can add brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Merchants can edit brands" ON public.brands FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Preserve every brand already on products (one record per name, ignoring letter case).
INSERT INTO public.brands (name)
SELECT DISTINCT ON (lower(trim(brand))) trim(brand)
FROM (SELECT brand, count(*) AS c FROM public.products WHERE brand IS NOT NULL AND trim(brand) <> '' GROUP BY brand) s
ORDER BY lower(trim(brand)), c DESC
ON CONFLICT DO NOTHING;