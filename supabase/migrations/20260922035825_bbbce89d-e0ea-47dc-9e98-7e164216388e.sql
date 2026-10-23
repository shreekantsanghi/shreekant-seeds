-- Phase 14 — automatic road distance (decision support only)

-- 1. Shop origin on the existing settings row
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS origin_lat numeric(8,5),
  ADD COLUMN IF NOT EXISTS origin_lon numeric(8,5),
  ADD COLUMN IF NOT EXISTS origin_label text;

UPDATE public.delivery_settings
   SET origin_lat = 27.74032,
       origin_lon = 75.78250,
       origin_label = COALESCE(origin_label, 'Shreekant Seeds, Neem Ka Thana')
 WHERE origin_lat IS NULL AND origin_lon IS NULL;

-- 2. Estimate columns on addresses (system-written, never customer-written)
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS geo_lat numeric(7,4),
  ADD COLUMN IF NOT EXISTS geo_lon numeric(7,4),
  ADD COLUMN IF NOT EXISTS geo_confidence numeric,
  ADD COLUMN IF NOT EXISTS geo_formatted text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_distance_km numeric,
  ADD COLUMN IF NOT EXISTS estimated_duration_min integer,
  ADD COLUMN IF NOT EXISTS estimate_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS estimate_error text,
  ADD COLUMN IF NOT EXISTS estimated_at timestamptz;

ALTER TABLE public.addresses
  DROP CONSTRAINT IF EXISTS addresses_estimate_status_check;
ALTER TABLE public.addresses
  ADD CONSTRAINT addresses_estimate_status_check
  CHECK (estimate_status IN ('pending','ok','geocode_failed','route_failed','out_of_range'));

-- 3. INSERT guard: a customer may never seed an estimate
CREATE OR REPLACE FUNCTION public.addresses_block_insert_distance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.distance_km IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can set a confirmed delivery distance';
  END IF;
  IF NEW.distance_km IS NULL THEN
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;
  IF (NEW.delivery_approved OR NEW.approved_delivery_charge IS NOT NULL) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can approve a delivery charge';
  END IF;
  IF NOT NEW.delivery_approved THEN
    NEW.approved_delivery_charge := NULL;
    NEW.delivery_approved_at := NULL;
    NEW.delivery_approved_by := NULL;
  END IF;

  -- Phase 14: estimates are system-written only.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.geo_lat := NULL; NEW.geo_lon := NULL; NEW.geo_confidence := NULL;
    NEW.geo_formatted := NULL; NEW.geocoded_at := NULL;
    NEW.estimated_distance_km := NULL; NEW.estimated_duration_min := NULL;
    NEW.estimate_error := NULL; NEW.estimated_at := NULL;
    NEW.estimate_status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. UPDATE guard: editing the location invalidates the estimate too
CREATE OR REPLACE FUNCTION public.addresses_guard_distance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_location_changed boolean;
  v_distance_changed boolean;
  v_approval_changed boolean;
  v_estimate_changed boolean;
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
  v_approval_changed := (
    NEW.delivery_approved IS DISTINCT FROM OLD.delivery_approved OR
    NEW.approved_delivery_charge IS DISTINCT FROM OLD.approved_delivery_charge
  );
  v_estimate_changed := (
    NEW.geo_lat IS DISTINCT FROM OLD.geo_lat OR
    NEW.geo_lon IS DISTINCT FROM OLD.geo_lon OR
    NEW.geo_confidence IS DISTINCT FROM OLD.geo_confidence OR
    NEW.geo_formatted IS DISTINCT FROM OLD.geo_formatted OR
    NEW.geocoded_at IS DISTINCT FROM OLD.geocoded_at OR
    NEW.estimated_distance_km IS DISTINCT FROM OLD.estimated_distance_km OR
    NEW.estimated_duration_min IS DISTINCT FROM OLD.estimated_duration_min OR
    NEW.estimate_status IS DISTINCT FROM OLD.estimate_status OR
    NEW.estimate_error IS DISTINCT FROM OLD.estimate_error OR
    NEW.estimated_at IS DISTINCT FROM OLD.estimated_at
  );

  IF v_distance_changed AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can set a confirmed delivery distance';
  END IF;
  IF v_approval_changed AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can approve a delivery charge';
  END IF;
  -- Estimates: writable by the server (no auth.uid()) or the shop; a customer's
  -- own edit silently keeps the stored values instead of failing their save.
  IF v_estimate_changed AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.geo_lat := OLD.geo_lat; NEW.geo_lon := OLD.geo_lon;
    NEW.geo_confidence := OLD.geo_confidence; NEW.geo_formatted := OLD.geo_formatted;
    NEW.geocoded_at := OLD.geocoded_at;
    NEW.estimated_distance_km := OLD.estimated_distance_km;
    NEW.estimated_duration_min := OLD.estimated_duration_min;
    NEW.estimate_status := OLD.estimate_status;
    NEW.estimate_error := OLD.estimate_error;
    NEW.estimated_at := OLD.estimated_at;
    v_estimate_changed := false;
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

  IF v_location_changed AND NOT v_approval_changed THEN
    NEW.delivery_approved := false;
    NEW.approved_delivery_charge := NULL;
    NEW.delivery_approved_at := NULL;
    NEW.delivery_approved_by := NULL;
  END IF;

  IF v_approval_changed AND NEW.delivery_approved THEN
    NEW.delivery_approved_at := now();
    NEW.delivery_approved_by := auth.uid();
  END IF;
  IF v_approval_changed AND NOT NEW.delivery_approved THEN
    NEW.approved_delivery_charge := NULL;
    NEW.delivery_approved_at := NULL;
    NEW.delivery_approved_by := NULL;
  END IF;

  -- Phase 14: ANY location edit always invalidates the stored estimate,
  -- even if the same request also tried to modify estimate fields. This runs
  -- after the customer protection above, so a customer cannot preserve or
  -- inject an estimate while changing their address.
  IF v_location_changed THEN
    NEW.geo_lat := NULL; NEW.geo_lon := NULL; NEW.geo_confidence := NULL;
    NEW.geo_formatted := NULL; NEW.geocoded_at := NULL;
    NEW.estimated_distance_km := NULL; NEW.estimated_duration_min := NULL;
    NEW.estimate_error := NULL; NEW.estimated_at := NULL;
    NEW.estimate_status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$;