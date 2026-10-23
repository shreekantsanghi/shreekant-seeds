ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS free_delivery_min_pieces integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS free_delivery_max_km numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS tier1_max_km numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS tier1_charge numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tier2_max_km numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS tier2_charge numeric NOT NULL DEFAULT 50;

GRANT SELECT ON public.delivery_settings TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view active delivery settings" ON public.delivery_settings;
CREATE POLICY "Public can view active delivery settings"
ON public.delivery_settings
FOR SELECT
TO anon, authenticated
USING (is_active = true);