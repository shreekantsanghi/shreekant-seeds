CREATE TABLE public.push_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  audience text NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer','merchant')),
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_registrations_user_id_idx ON public.push_registrations (user_id) WHERE enabled;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_registrations TO authenticated;
GRANT ALL ON public.push_registrations TO service_role;

ALTER TABLE public.push_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_registrations_select_own" ON public.push_registrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "push_registrations_insert_own" ON public.push_registrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_registrations_update_own" ON public.push_registrations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_registrations_delete_own" ON public.push_registrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER push_registrations_set_updated_at
  BEFORE UPDATE ON public.push_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();