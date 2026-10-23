-- audit_logs: append-only. Records are written once and can never be
-- modified or removed through the Data API, even by the shop admin.

DROP POLICY "Admins can manage audit logs" ON public.audit_logs;

CREATE POLICY "Admins can read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can append audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Remove write privileges beyond INSERT from the authenticated role;
-- the security-definer RPC writers (payments, delivery, orders) run as
-- the function owner and are unaffected. service_role keeps full access
-- for privileged server code.
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;