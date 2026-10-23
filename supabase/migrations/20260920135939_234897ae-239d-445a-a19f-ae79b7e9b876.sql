-- 1. Storage for the delivery-person PIN fingerprint (never plaintext).
ALTER TABLE public.order_deliveries ADD COLUMN IF NOT EXISTS delivery_pin_hash text;

-- 2. Derivation now yields three secrets from the same server-only secret + nonce.
DROP FUNCTION IF EXISTS public.derive_delivery_credentials(uuid, text);

CREATE FUNCTION public.derive_delivery_credentials(p_order_id uuid, p_nonce text)
RETURNS TABLE(token text, code text, pin text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_token text;
  v_code_digest text;
  v_pin_digest text;
BEGIN
  SELECT s.value INTO v_secret FROM public.app_secrets s WHERE s.name = 'delivery_credential_secret';
  IF v_secret IS NULL OR p_nonce IS NULL THEN
    RAISE EXCEPTION 'CREDENTIAL_NOT_ISSUED';
  END IF;

  v_token := public.sha256_hex(v_secret || '|' || p_order_id::text || '|' || p_nonce || '|token');
  v_code_digest := public.sha256_hex(v_secret || '|' || p_order_id::text || '|' || p_nonce || '|code');
  v_pin_digest := public.sha256_hex(v_secret || '|' || p_order_id::text || '|' || p_nonce || '|pin');

  RETURN QUERY SELECT
    v_token,
    lpad(((('x' || substr(v_code_digest, 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0'),
    lpad(((('x' || substr(v_pin_digest, 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.derive_delivery_credentials(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. Backfill existing credential versions, drop anything underivable.
DELETE FROM public.order_deliveries WHERE credential_nonce IS NULL;

UPDATE public.order_deliveries d
SET delivery_pin_hash = public.sha256_hex(
  (SELECT c.pin FROM public.derive_delivery_credentials(d.order_id, d.credential_nonce) c)
)
WHERE d.delivery_pin_hash IS NULL AND d.credential_nonce IS NOT NULL;

ALTER TABLE public.order_deliveries ALTER COLUMN delivery_pin_hash SET NOT NULL;

-- 4. Issuing returns the PIN to the shop only.
DROP FUNCTION IF EXISTS public.issue_delivery_credentials(uuid, boolean);

CREATE FUNCTION public.issue_delivery_credentials(p_order_id uuid, p_reissue boolean DEFAULT false)
RETURNS TABLE(issued boolean, token text, code text, pin text, expires_at timestamp with time zone)
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
    RETURN QUERY SELECT false, v_creds.token, v_creds.code, v_creds.pin, v_existing.expires_at;
    RETURN;
  END IF;

  -- New credential version; the previous token, code and PIN stop working at once.
  v_nonce := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  SELECT * INTO v_creds FROM public.derive_delivery_credentials(p_order_id, v_nonce);
  v_expires := now() + interval '24 hours';

  INSERT INTO public.order_deliveries (order_id, token_hash, code_hash, delivery_pin_hash, expires_at, created_by, credential_nonce)
  VALUES (p_order_id, public.sha256_hex(v_creds.token), public.sha256_hex(v_creds.code),
          public.sha256_hex(v_creds.pin), v_expires, auth.uid(), v_nonce)
  ON CONFLICT (order_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        code_hash = EXCLUDED.code_hash,
        delivery_pin_hash = EXCLUDED.delivery_pin_hash,
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

  RETURN QUERY SELECT true, v_creds.token, v_creds.code, v_creds.pin, v_expires;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_delivery_credentials(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_delivery_credentials(uuid, boolean) TO authenticated;

-- 5. Public confirmation now needs all three secrets.
DROP FUNCTION IF EXISTS public.confirm_delivery(text, text);

CREATE FUNCTION public.confirm_delivery(p_token text, p_pin text, p_code text)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.order_deliveries%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reason text;
BEGIN
  IF p_token IS NULL OR p_pin IS NULL OR p_code IS NULL
     OR length(p_token) < 16 OR p_pin !~ '^[0-9]{6}$' OR p_code !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.order_deliveries
    WHERE token_hash = public.sha256_hex(p_token)
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_row.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  IF v_row.verified_at IS NOT NULL THEN
    v_reason := 'ALREADY_VERIFIED';
  ELSIF v_row.locked_at IS NOT NULL OR v_row.attempt_count >= 5 THEN
    v_reason := 'LOCKED';
  ELSIF v_row.expires_at <= now() THEN
    v_reason := 'EXPIRED';
  ELSIF v_order.status <> 'out_for_delivery' THEN
    v_reason := 'NOT_OUT_FOR_DELIVERY';
  ELSIF v_row.delivery_pin_hash <> public.sha256_hex(p_pin)
        OR v_row.code_hash <> public.sha256_hex(p_code) THEN
    -- A wrong PIN and a wrong customer code are indistinguishable on purpose.
    v_reason := 'WRONG_CODE';
  END IF;

  IF v_reason IS NOT NULL THEN
    IF v_reason = 'WRONG_CODE' THEN
      UPDATE public.order_deliveries
        SET attempt_count = attempt_count + 1,
            locked_at = CASE WHEN attempt_count + 1 >= 5 THEN now() ELSE locked_at END
        WHERE order_id = v_row.order_id
        RETURNING * INTO v_row;
    END IF;

    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (NULL, 'delivery_code_failed', 'order', v_row.order_id,
            jsonb_build_object('order_number', v_order.order_number,
                               'attempt_count', v_row.attempt_count,
                               'reason', v_reason));

    RETURN QUERY SELECT false, v_reason;
    RETURN;
  END IF;

  UPDATE public.orders
    SET status = 'delivered', updated_at = now()
    WHERE id = v_row.order_id AND status = 'out_for_delivery';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  UPDATE public.order_deliveries
    SET verified_at = now()
    WHERE order_id = v_row.order_id AND verified_at IS NULL;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'delivery_code_verified', 'order', v_row.order_id,
          jsonb_build_object('order_number', v_order.order_number,
                             'attempt_count', v_row.attempt_count));

  RETURN QUERY SELECT true, 'CONFIRMED'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_delivery(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(text, text, text) TO anon, authenticated;