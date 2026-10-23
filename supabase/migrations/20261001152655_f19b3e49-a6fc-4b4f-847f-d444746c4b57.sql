CREATE OR REPLACE FUNCTION public.admin_session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT public.is_admin() AND EXISTS (
    SELECT 1 FROM (
      SELECT s.id FROM auth.sessions s
      WHERE s.user_id = auth.uid() AND (s.not_after IS NULL OR s.not_after > now())
      ORDER BY s.created_at DESC LIMIT 4
    ) recent WHERE recent.id = (auth.jwt() ->> 'session_id')::uuid
  );
$$;
REVOKE EXECUTE ON FUNCTION public.admin_session_allowed() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_session_allowed() TO authenticated;