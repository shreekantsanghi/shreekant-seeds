CREATE TABLE IF NOT EXISTS public.order_deliveries (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT order_deliveries_attempts_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT order_deliveries_expiry_after_creation CHECK (expires_at > created_at)
);

-- Deliberately NO grants and NO policies for anon or authenticated: the only
-- application access is through the SECURITY DEFINER routines below.
REVOKE ALL ON public.order_deliveries FROM anon, authenticated;
GRANT ALL ON public.order_deliveries TO service_role;

ALTER TABLE public.order_deliveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sha256_hex(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT encode(sha256(convert_to(p_value, 'UTF8')), 'hex') $$;

REVOKE ALL ON FUNCTION public.sha256_hex(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Merchant: issue or explicitly reissue delivery credentials.
-- Only hashes are stored, so existing plaintext cannot be recovered. Rendering
-- the order page must never call this with p_reissue = true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_delivery_credentials(p_order_id uuid, p_reissue boolean DEFAULT false)
RETURNS TABLE(issued boolean, token text, code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.order_deliveries%ROWTYPE;
  v_found boolean := false;
  v_token text;
  v_code text;
  v_expires timestamptz;
  v_bytes bytea;
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

  -- A usable credential already exists: keep it untouched. Its plaintext is
  -- not recoverable, so a new one requires an explicit reissue.
  IF v_found
     AND NOT p_reissue
     AND v_existing.locked_at IS NULL
     AND v_existing.expires_at > now() THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, v_existing.expires_at;
    RETURN;
  END IF;

  -- 256 bits of strong randomness; never derived from order or customer data.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_bytes := uuid_send(gen_random_uuid());
  v_code := lpad((((get_byte(v_bytes, 0) << 16) | (get_byte(v_bytes, 1) << 8) | get_byte(v_bytes, 2)) % 1000000)::text, 6, '0');
  v_expires := now() + interval '24 hours';

  INSERT INTO public.order_deliveries (order_id, token_hash, code_hash, expires_at, created_by)
  VALUES (p_order_id, public.sha256_hex(v_token), public.sha256_hex(v_code), v_expires, auth.uid())
  ON CONFLICT (order_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        code_hash = EXCLUDED.code_hash,
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

  RETURN QUERY SELECT true, v_token, v_code, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_delivery_credentials(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_delivery_credentials(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public: confirm delivery with the scanned token plus the customer's code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_delivery(p_token text, p_code text)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.order_deliveries%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reason text;
BEGIN
  IF p_token IS NULL OR p_code IS NULL OR length(p_token) < 16 OR p_code !~ '^[0-9]{6}$' THEN
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
  ELSIF v_row.code_hash <> public.sha256_hex(p_code) THEN
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
$$;

REVOKE ALL ON FUNCTION public.confirm_delivery(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(text, text) TO anon, authenticated;