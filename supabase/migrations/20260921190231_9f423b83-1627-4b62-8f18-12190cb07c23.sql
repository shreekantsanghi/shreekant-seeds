
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============ 1. Registration preferences (additive) ============
ALTER TABLE public.push_registrations
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'hi';
DO $$ BEGIN
  ALTER TABLE public.push_registrations ADD CONSTRAINT push_registrations_language_check CHECK (language IN ('hi','en'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.push_registrations
  ADD COLUMN IF NOT EXISTS promotional_enabled boolean NOT NULL DEFAULT false;

-- ============ 2. Event catalogue ============
CREATE TABLE IF NOT EXISTS public.push_event_types (
  notification_type text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('customer','merchant')),
  kind text NOT NULL DEFAULT 'transactional' CHECK (kind IN ('transactional','promotional')),
  urgent boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (notification_type, audience)
);
GRANT SELECT ON public.push_event_types TO authenticated;
GRANT ALL ON public.push_event_types TO service_role;
ALTER TABLE public.push_event_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read the push event catalogue" ON public.push_event_types;
CREATE POLICY "Signed-in users read the push event catalogue" ON public.push_event_types
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.push_event_types (notification_type, audience, kind, urgent) VALUES
  ('delivery_approved',           'customer', 'transactional', true),
  ('payment_successful',          'customer', 'transactional', false),
  ('payment_failed',              'customer', 'transactional', false),
  ('order_out_for_delivery',      'customer', 'transactional', false),
  ('order_delivered',             'customer', 'transactional', false),
  ('order_cancelled',             'customer', 'transactional', false),
  ('delivery_approval_required',  'merchant', 'transactional', true),
  ('new_order',                   'merchant', 'transactional', false),
  ('payment_received',            'merchant', 'transactional', false),
  ('low_stock',                   'merchant', 'transactional', false),
  ('out_of_stock',                'merchant', 'transactional', false),
  ('inventory_shortfall',         'merchant', 'transactional', false)
ON CONFLICT (notification_type, audience) DO NOTHING;

-- ============ 3. Send queue (backend only) ============
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  audience text NOT NULL,
  notification_type text NOT NULL,
  kind text NOT NULL DEFAULT 'transactional',
  urgent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_outbox_pending_idx ON public.push_outbox (status, created_at);
GRANT ALL ON public.push_outbox TO service_role;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.push_outbox(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','invalid')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outbox_id, registration_id)
);
GRANT ALL ON public.push_deliveries TO service_role;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

-- ============ 4. Dispatch configuration (no hard-coded URL) ============
CREATE TABLE IF NOT EXISTS public.push_dispatch_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  endpoint_url text,
  preview_endpoint_url text,
  shared_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_dispatch_config TO service_role;
ALTER TABLE public.push_dispatch_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.push_dispatch_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============ 5. Fire-and-forget dispatch request ============
CREATE OR REPLACE FUNCTION public.request_push_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'extensions'
AS $function$
DECLARE
  c public.push_dispatch_config%ROWTYPE;
  v_url text;
BEGIN
  SELECT * INTO c FROM public.push_dispatch_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Production endpoint always wins; the preview endpoint is only used while
  -- no production deployment has registered itself.
  v_url := COALESCE(c.endpoint_url, c.preview_endpoint_url);
  IF v_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', c.shared_secret),
    body := jsonb_build_object('source','notification'),
    timeout_milliseconds := 5000);
EXCEPTION WHEN OTHERS THEN
  -- Push delivery must never fail the business operation that created the notification.
  RETURN;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_push_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_push_dispatch() FROM anon;
REVOKE ALL ON FUNCTION public.request_push_dispatch() FROM authenticated;

-- ============ 6. Batch claim (backend only) ============
CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit integer DEFAULT 20)
RETURNS SETOF public.push_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.push_outbox o
     SET status = 'sending', attempts = o.attempts + 1, updated_at = now()
   WHERE o.id IN (
     SELECT p.id FROM public.push_outbox p
      WHERE p.status = 'queued' AND p.attempts < 5
      ORDER BY p.created_at
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50))
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM authenticated;
