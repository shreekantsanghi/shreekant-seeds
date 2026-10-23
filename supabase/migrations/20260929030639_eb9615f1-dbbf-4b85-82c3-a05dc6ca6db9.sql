CREATE OR REPLACE FUNCTION public.apply_refund_status(p_refund_row_id uuid, p_razorpay_refund_id text, p_razorpay_payment_id text, p_status text, p_event_id text, p_failure_reason text, p_source text)
 RETURNS TABLE(result text, refund_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.queue_email_admins('merchant_refund_processed',
    'refund_processed_admin:' || v_ref.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'customer_name', v_order.customer_name, 'amount', v_ref.amount, 'order_id', v_order.id),
    v_order.id, NULL);

  RETURN QUERY SELECT 'processed'::text, v_ref.id;
END;
$function$;