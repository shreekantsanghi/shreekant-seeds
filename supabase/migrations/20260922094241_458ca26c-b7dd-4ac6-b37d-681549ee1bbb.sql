CREATE TABLE public.delivery_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address_id uuid REFERENCES public.addresses(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  lat numeric(6,3) NOT NULL,
  lon numeric(6,3) NOT NULL,
  accuracy_m integer NOT NULL CHECK (accuracy_m > 0),
  source text NOT NULL DEFAULT 'customer_gps',
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','route_failed')),
  distance_km numeric(6,1),
  duration_min integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_locations_user_address_idx ON public.delivery_locations (user_id, address_id, created_at DESC);
CREATE INDEX delivery_locations_order_idx ON public.delivery_locations (order_id);

GRANT SELECT ON public.delivery_locations TO authenticated;
GRANT ALL ON public.delivery_locations TO service_role;

ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers read their own delivery locations"
  ON public.delivery_locations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER delivery_locations_set_updated_at
  BEFORE UPDATE ON public.delivery_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();