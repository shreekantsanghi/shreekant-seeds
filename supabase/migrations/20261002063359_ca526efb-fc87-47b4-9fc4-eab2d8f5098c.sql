CREATE OR REPLACE FUNCTION public.admin_list_sessions()
RETURNS TABLE(session_id uuid, created_at timestamptz, last_active_at timestamptz,
              user_agent text, ip text, is_current boolean, within_limit boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
  WITH active AS (
    SELECT s.id, s.created_at, s.refreshed_at, s.updated_at, s.user_agent, s.ip,
           row_number() OVER (ORDER BY s.created_at DESC) AS rn
    FROM auth.sessions s
    WHERE s.user_id = auth.uid() AND (s.not_after IS NULL OR s.not_after > now())
  )
  SELECT a.id, a.created_at,
         COALESCE(a.refreshed_at::timestamptz, a.updated_at, a.created_at),
         a.user_agent, host(a.ip),
         a.id = (auth.jwt() ->> 'session_id')::uuid,
         a.rn <= 4
  FROM active a
  WHERE public.admin_session_allowed()
  ORDER BY a.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_sessions(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE
  v_current uuid := (auth.jwt() ->> 'session_id')::uuid;
  v_count integer;
BEGIN
  IF NOT public.admin_session_allowed() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((auth.jwt() ->> 'aal'), '') <> 'aal2'
     AND EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified') THEN
    RAISE EXCEPTION 'MFA_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NOT NULL AND p_session_id = v_current THEN
    RAISE EXCEPTION 'CANNOT_REVOKE_CURRENT';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.user_id = auth.uid()
    AND s.id <> v_current
    AND (p_session_id IS NULL OR s.id = p_session_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, metadata)
  VALUES (auth.uid(), 'admin_sessions_revoked', 'auth_session',
          jsonb_build_object('target', COALESCE(p_session_id::text, 'all_others'), 'count', v_count));
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_sessions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_sessions(uuid) TO authenticated;