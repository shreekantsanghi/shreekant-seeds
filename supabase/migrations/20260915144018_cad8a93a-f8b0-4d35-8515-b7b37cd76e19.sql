ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS distance_km numeric,
  ADD COLUMN IF NOT EXISTS distance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS distance_confirmed_by uuid;

ALTER TABLE public.addresses
  ADD CONSTRAINT addresses_distance_km_non_negative CHECK (distance_km IS NULL OR distance_km >= 0);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hsn_code text;

CREATE OR REPLACE FUNCTION public.addresses_guard_distance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_changed boolean;
  v_distance_changed boolean;
BEGIN
  v_location_changed := (
    NEW.address_line1 IS DISTINCT FROM OLD.address_line1 OR
    NEW.address_line2 IS DISTINCT FROM OLD.address_line2 OR
    NEW.landmark IS DISTINCT FROM OLD.landmark OR
    NEW.village_town IS DISTINCT FROM OLD.village_town OR
    NEW.district IS DISTINCT FROM OLD.district OR
    NEW.state IS DISTINCT FROM OLD.state OR
    NEW.pincode IS DISTINCT FROM OLD.pincode
  );
  v_distance_changed := NEW.distance_km IS DISTINCT FROM OLD.distance_km;

  IF v_distance_changed AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can set a confirmed delivery distance';
  END IF;

  IF v_location_changed AND NOT v_distance_changed THEN
    NEW.distance_km := NULL;
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;

  IF v_distance_changed AND NEW.distance_km IS NOT NULL THEN
    NEW.distance_confirmed_at := now();
    NEW.distance_confirmed_by := auth.uid();
  END IF;

  IF v_distance_changed AND NEW.distance_km IS NULL THEN
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.addresses_guard_distance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS addresses_guard_distance ON public.addresses;
CREATE TRIGGER addresses_guard_distance
BEFORE UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.addresses_guard_distance();

CREATE OR REPLACE FUNCTION public.addresses_block_insert_distance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.distance_km IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can set a confirmed delivery distance';
  END IF;
  IF NEW.distance_km IS NULL THEN
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.addresses_block_insert_distance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS addresses_block_insert_distance ON public.addresses;
CREATE TRIGGER addresses_block_insert_distance
BEFORE INSERT ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.addresses_block_insert_distance();