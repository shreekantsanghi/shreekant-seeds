-- 1. Credential version (nonce). No plaintext token or code is ever stored.
ALTER TABLE public.order_deliveries ADD COLUMN IF NOT EXISTS credential_nonce text;

-- 2. Server-only secret store: RLS on, no grants to anon/authenticated, reachable
--    only from SECURITY DEFINER routines owned by the database owner.
CREATE TABLE IF NOT EXISTS public.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_secrets (name, value)
VALUES ('delivery_credential_secret',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') ||
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- 3. Deterministic derivation. Same order + same nonce + same server secret
--    always reproduces the same token and code; without the secret neither is
--    predictable. Not callable by app roles.
CREATE OR REPLACE FUNCTION public.derive_delivery_credentials(p_order_id uuid, p_nonce text)
RETURNS TABLE(token text, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_token text;
  v_digest text;
BEGIN
  SELECT s.value INTO v_secret FROM public.app_secrets s WHERE s.name = 'delivery_credential_secret';
  IF v_secret IS NULL OR p_nonce IS NULL THEN
    RAISE EXCEPTION 'CREDENTIAL_NOT_ISSUED';
  END IF;

  -- 256 bits of derived entropy for the QR token.
  v_token := public.sha256_hex(v_secret || '|' || p_order_id::text || '|' || p_nonce || '|token');
  v_digest := public.sha256_hex(v_secret || '|' || p_order_id::text || '|' || p_nonce || '|code');

  RETURN QUERY SELECT v_token,
    lpad((( ('x' || substr(v_digest, 1, 8))::bit(32)::bigint ) % 1000000)::text, 6, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.derive_delivery_credentials(uuid, text) FROM PUBLIC, anon, authenticated;

-- 4. Merchant routine: stable credential; only an explicit reissue rotates it.
CREATE OR REPLACE FUNCTION public.issue_delivery_credentials(p_order_id uuid, p_reissue boolean DEFAULT false)
RETURNS TABLE(issued boolean, token text, code text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.order_deliveries%ROWTYPE;
  v_found boolean := false;
  v_nonce text;
  v_creds record;
  v_expires timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED';
  END IF;
  IF v_order.inventory_fulfilled_at IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_NOT_FULFILLED';
  END IF;
  IF v_order.status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'ORDER_NOT_OUT_FOR_DELIVERY';
  END IF;

  SELECT * INTO v_existing FROM public.order_deliveries WHERE order_id = p_order_id FOR UPDATE;
  v_found := FOUND;

  IF v_found AND v_existing.verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_CONFIRMED';
  END IF;

  -- A usable credential exists: reproduce it untouched. Attempts, lock state and
  -- expiry are never reset by simply opening the page.
  IF v_found
     AND NOT p_reissue
     AND v_existing.credential_nonce IS NOT NULL
     AND v_existing.locked_at IS NULL
     AND v_existing.expires_at > now() THEN
    SELECT * INTO v_creds FROM public.derive_delivery_credentials(p_order_id, v_existing.credential_nonce);
    RETURN QUERY SELECT false, v_creds.token, v_creds.code, v_existing.expires_at;
    RETURN;
  END IF;

  -- New credential version; the previous token and code stop working at once.
  v_nonce := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  SELECT * INTO v_creds FROM public.derive_delivery_credentials(p_order_id, v_nonce);
  v_expires := now() + interval '24 hours';

  INSERT INTO public.order_deliveries (order_id, token_hash, code_hash, expires_at, created_by, credential_nonce)
  VALUES (p_order_id, public.sha256_hex(v_creds.token), public.sha256_hex(v_creds.code), v_expires, auth.uid(), v_nonce)
  ON CONFLICT (order_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        code_hash = EXCLUDED.code_hash,
        credential_nonce = EXCLUDED.credential_nonce,
        expires_at = EXCLUDED.expires_at,
        attempt_count = 0,
        locked_at = NULL,
        verified_at = NULL,
        created_at = now(),
        created_by = EXCLUDED.created_by
    WHERE public.order_deliveries.verified_at IS NULL;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'delivery_credentials_issued', 'order', p_order_id,
          jsonb_build_object('order_number', v_order.order_number,
                             'reissued', p_reissue,
                             'expires_at', v_expires));

  RETURN QUERY SELECT true, v_creds.token, v_creds.code, v_expires;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_delivery_credentials(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_delivery_credentials(uuid, boolean) TO authenticated;

-- 5. Customer routine: read-only view of the shop's active credential.
--    It never creates, replaces, resets or extends anything.
CREATE OR REPLACE FUNCTION public.get_my_delivery_credentials(p_order_id uuid)
RETURNS TABLE(token text, code text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_row public.order_deliveries%ROWTYPE;
  v_creds record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  -- Ownership is the whole authorisation: no other customer can reach this.
  IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED';
  END IF;
  IF v_order.inventory_fulfilled_at IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_NOT_FULFILLED';
  END IF;
  IF v_order.status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'ORDER_NOT_OUT_FOR_DELIVERY';
  END IF;

  SELECT * INTO v_row FROM public.order_deliveries WHERE order_id = p_order_id;
  IF NOT FOUND OR v_row.credential_nonce IS NULL THEN
    RAISE EXCEPTION 'CREDENTIAL_NOT_ISSUED';
  END IF;
  IF v_row.verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_CONFIRMED';
  END IF;
  IF v_row.locked_at IS NOT NULL OR v_row.attempt_count >= 5 THEN
    RAISE EXCEPTION 'CREDENTIAL_LOCKED';
  END IF;
  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'CREDENTIAL_EXPIRED';
  END IF;

  SELECT * INTO v_creds FROM public.derive_delivery_credentials(p_order_id, v_row.credential_nonce);
  RETURN QUERY SELECT v_creds.token, v_creds.code, v_row.expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_delivery_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_delivery_credentials(uuid) TO authenticated;