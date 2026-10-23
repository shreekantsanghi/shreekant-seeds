ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  razorpay_payment_id text NOT NULL,
  razorpay_refund_id text UNIQUE,
  razorpay_status text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  idempotency_key text NOT NULL UNIQUE,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  failure_reason text,
  last_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX refunds_payment_id_idx ON public.refunds(payment_id);
CREATE INDEX refunds_order_id_idx ON public.refunds(order_id);
CREATE INDEX refunds_razorpay_payment_id_idx ON public.refunds(razorpay_payment_id);

GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchants can view refunds" ON public.refunds FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.push_event_types (notification_type, audience, kind, urgent, is_enabled)
VALUES ('refund_processed', 'customer', 'transactional', false, true)
ON CONFLICT DO NOTHING;

-- p_amount NULL = full refund of the remaining refundable amount.
CREATE OR REPLACE FUNCTION public.reserve_refund(
  p_order_id uuid, p_amount numeric, p_idempotency_key text, p_actor uuid, p_reason text
) RETURNS TABLE(result text, refund_id uuid, razorpay_payment_id text, razorpay_refund_id text, refund_status text, amount numeric, remaining numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_existing public.refunds%ROWTYPE;
  v_used numeric;
  v_remaining numeric;
  v_amount numeric;
  v_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 100 THEN
    RETURN QUERY SELECT 'invalid_key'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_pay FROM public.payments p
   WHERE p.order_id = p_order_id AND p.provider = 'razorpay'
     AND p.status IN ('paid','partially_refunded','refunded')
     AND p.signature_verified = true
   ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_pay.provider_payment_id IS NULL THEN
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_existing FROM public.refunds r WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.payment_id <> v_pay.id OR v_existing.order_id <> p_order_id
       OR (p_amount IS NOT NULL AND v_existing.amount <> p_amount) THEN
      RETURN QUERY SELECT 'key_conflict'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric; RETURN;
    END IF;
    RETURN QUERY SELECT 'existing'::text, v_existing.id, v_existing.razorpay_payment_id, v_existing.razorpay_refund_id, v_existing.status, v_existing.amount, NULL::numeric; RETURN;
  END IF;

  SELECT coalesce(sum(r.amount), 0) INTO v_used FROM public.refunds r
   WHERE r.payment_id = v_pay.id AND r.status IN ('pending','processed');
  v_remaining := v_pay.amount - v_used;
  v_amount := coalesce(p_amount, v_remaining);

  IF v_amount IS NULL OR v_amount <= 0 OR round(v_amount, 2) <> v_amount THEN
    RETURN QUERY SELECT 'invalid_amount'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::numeric, v_remaining; RETURN;
  END IF;
  IF v_amount > v_remaining THEN
    RETURN QUERY SELECT 'exceeds_remaining'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::numeric, v_remaining; RETURN;
  END IF;

  INSERT INTO public.refunds (payment_id, order_id, razorpay_payment_id, amount, idempotency_key, initiated_by, reason)
  VALUES (v_pay.id, p_order_id, v_pay.provider_payment_id, v_amount, p_idempotency_key, p_actor, nullif(btrim(p_reason), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id, metadata)
  VALUES ('refund_requested', 'order', p_order_id, p_actor, jsonb_build_object(
    'refund_id', v_id, 'amount', v_amount, 'full_refund', p_amount IS NULL, 'reason', nullif(btrim(p_reason), '')));

  RETURN QUERY SELECT 'reserved'::text, v_id, v_pay.provider_payment_id, NULL::text, 'pending'::text, v_amount, v_remaining - v_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_razorpay_refund_id(p_refund_row_id uuid, p_razorpay_refund_id text, p_razorpay_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.refunds SET razorpay_refund_id = p_razorpay_refund_id,
         razorpay_status = coalesce(p_razorpay_status, razorpay_status)
   WHERE id = p_refund_row_id AND (razorpay_refund_id IS NULL OR razorpay_refund_id = p_razorpay_refund_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_refund_status(
  p_refund_row_id uuid, p_razorpay_refund_id text, p_razorpay_payment_id text,
  p_status text, p_event_id text, p_failure_reason text, p_source text
) RETURNS TABLE(result text, refund_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref public.refunds%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_processed numeric;
  v_new_status public.payment_status;
BEGIN
  IF p_status NOT IN ('processed','failed') THEN
    RETURN QUERY SELECT 'invalid_status'::text, NULL::uuid; RETURN;
  END IF;

  IF p_razorpay_refund_id IS NOT NULL THEN
    SELECT * INTO v_ref FROM public.refunds r WHERE r.razorpay_refund_id = p_razorpay_refund_id FOR UPDATE;
  END IF;
  IF v_ref.id IS NULL AND p_refund_row_id IS NOT NULL THEN
    SELECT * INTO v_ref FROM public.refunds r
     WHERE r.id = p_refund_row_id
       AND (r.razorpay_refund_id IS NULL OR r.razorpay_refund_id = p_razorpay_refund_id)
     FOR UPDATE;
  END IF;
  IF v_ref.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid; RETURN;
  END IF;
  IF p_razorpay_payment_id IS NOT NULL AND v_ref.razorpay_payment_id <> p_razorpay_payment_id THEN
    RETURN QUERY SELECT 'payment_mismatch'::text, v_ref.id; RETURN;
  END IF;
  IF v_ref.status <> 'pending' THEN
    RETURN QUERY SELECT 'already_final'::text, v_ref.id; RETURN;
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = v_ref.payment_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id = v_ref.order_id FOR UPDATE;
  IF v_pay.order_id <> v_ref.order_id THEN
    RETURN QUERY SELECT 'payment_mismatch'::text, v_ref.id; RETURN;
  END IF;

  IF p_status = 'failed' THEN
    UPDATE public.refunds SET status = 'failed', razorpay_status = 'failed',
      razorpay_refund_id = coalesce(razorpay_refund_id, p_razorpay_refund_id),
      failure_reason = left(p_failure_reason, 500), last_event_id = p_event_id
     WHERE id = v_ref.id;
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id, metadata)
    VALUES ('refund_failed', 'order', v_ref.order_id, v_ref.initiated_by, jsonb_build_object(
      'refund_id', v_ref.id, 'razorpay_refund_id', coalesce(v_ref.razorpay_refund_id, p_razorpay_refund_id),
      'amount', v_ref.amount, 'initiated_by', v_ref.initiated_by, 'processed_by', coalesce(p_source, 'unknown'),
      'failure_reason', left(p_failure_reason, 500), 'event_id', p_event_id));
    RETURN QUERY SELECT 'failed'::text, v_ref.id; RETURN;
  END IF;

  UPDATE public.refunds SET status = 'processed', razorpay_status = 'processed', processed_at = now(),
    razorpay_refund_id = coalesce(razorpay_refund_id, p_razorpay_refund_id), last_event_id = p_event_id
   WHERE id = v_ref.id;

  SELECT coalesce(sum(r.amount), 0) INTO v_processed FROM public.refunds r
   WHERE r.payment_id = v_pay.id AND r.status = 'processed';
  v_new_status := CASE WHEN v_processed >= v_pay.amount THEN 'refunded'::public.payment_status
                       ELSE 'partially_refunded'::public.payment_status END;

  UPDATE public.payments SET status = v_new_status WHERE id = v_pay.id;
  UPDATE public.orders SET payment_status = v_new_status WHERE id = v_order.id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id, metadata)
  VALUES ('refund_processed', 'order', v_ref.order_id, v_ref.initiated_by, jsonb_build_object(
    'refund_id', v_ref.id, 'razorpay_refund_id', coalesce(v_ref.razorpay_refund_id, p_razorpay_refund_id),
    'amount', v_ref.amount, 'total_refunded', v_processed, 'payment_status', v_new_status,
    'initiated_by', v_ref.initiated_by, 'processed_by', coalesce(p_source, 'unknown'), 'event_id', p_event_id));

  PERFORM public.notify_user(v_order.user_id, 'customer', 'refund_processed', 'payment', 'important',
    'Refund processed',
    'A refund of ₹' || to_char(v_ref.amount, 'FM999999990.00') || ' for order ' || v_order.order_number || ' has been processed.',
    v_order.id, NULL, NULL, '/orders/' || v_order.id::text, 'View Order', false,
    'refund_processed:' || v_ref.id::text,
    jsonb_build_object('refund_id', v_ref.id, 'amount', v_ref.amount));
  PERFORM public.queue_email(v_order.user_id, 'customer', 'refund_processed',
    'refund_processed:' || v_ref.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'amount', v_ref.amount, 'order_id', v_order.id),
    v_order.id, NULL);

  RETURN QUERY SELECT 'processed'::text, v_ref.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_refund(uuid, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_razorpay_refund_id(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_refund_status(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_refund(uuid, numeric, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_razorpay_refund_id(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_refund_status(uuid, text, text, text, text, text, text) TO service_role;