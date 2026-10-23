-- Item 14: optional search fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_terms text;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS name_hi text;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS search_terms text;

-- Item 13: remove only the CANCEL_BLOCKED_INVENTORY guard; all status
-- restrictions, is_admin() authorization, row lock, payment and stock
-- behaviour remain exactly as before.
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status order_status)
 RETURNS order_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_allowed order_status;
  v_title text;
  v_message text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status = p_status THEN
    RETURN v_order.status;
  END IF;

  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_DELIVERED';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;

  IF p_status = 'delivered' THEN
    RAISE EXCEPTION 'DELIVERY_CONFIRMATION_REQUIRED';
  END IF;

  IF p_status = 'cancelled' THEN
    IF v_order.status NOT IN ('pending', 'confirmed', 'processing') THEN
      RAISE EXCEPTION 'CANCEL_NOT_ALLOWED';
    END IF;
  ELSE
    v_allowed := CASE v_order.status
      WHEN 'pending' THEN 'confirmed'
      WHEN 'confirmed' THEN 'processing'
      WHEN 'processing' THEN 'ready_for_delivery'
      WHEN 'ready_for_delivery' THEN 'out_for_delivery'
      ELSE NULL
    END::order_status;

    IF v_allowed IS NULL OR p_status <> v_allowed THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;

    IF v_order.payment_status::text NOT IN ('paid', 'partially_refunded') THEN
      RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED';
    END IF;

    IF p_status = 'out_for_delivery' AND v_order.inventory_fulfilled_at IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_NOT_FULFILLED';
    END IF;
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'order_status_changed', 'order', p_order_id,
          jsonb_build_object('order_number', v_order.order_number,
                             'previous_status', v_order.status,
                             'new_status', p_status));

  v_title := CASE p_status
    WHEN 'confirmed' THEN 'Order confirmed'
    WHEN 'processing' THEN 'Your order is being prepared'
    WHEN 'ready_for_delivery' THEN 'Your order is ready for delivery'
    WHEN 'out_for_delivery' THEN 'Your order is out for delivery'
    WHEN 'cancelled' THEN 'Order cancelled'
    ELSE NULL END;
  v_message := CASE p_status
    WHEN 'confirmed' THEN 'Your order ' || v_order.order_number || ' has been confirmed by Shreekant Seeds.'
    WHEN 'processing' THEN 'Your order ' || v_order.order_number || ' is now being prepared.'
    WHEN 'ready_for_delivery' THEN 'Your order ' || v_order.order_number || ' is ready for delivery.'
    WHEN 'out_for_delivery' THEN 'Your order ' || v_order.order_number || ' is on the way. Keep your delivery code ready.'
    WHEN 'cancelled' THEN 'Your order ' || v_order.order_number || ' has been cancelled.'
    ELSE NULL END;

  IF v_title IS NOT NULL THEN
    PERFORM public.notify_user(v_order.user_id, 'customer', 'order_' || p_status::text, 'order',
      CASE WHEN p_status IN ('out_for_delivery', 'cancelled') THEN 'important' ELSE 'normal' END,
      v_title, v_message, p_order_id, NULL, NULL,
      '/orders/' || p_order_id::text, 'View Order', false,
      'order_status:' || p_order_id::text || ':' || p_status::text);
  END IF;

  -- Email only for confirmed / out_for_delivery / cancelled. Preparing and
  -- ready-for-delivery stay in-app only. The merchant is never emailed here.
  IF p_status IN ('out_for_delivery', 'cancelled') THEN
    PERFORM public.queue_email(v_order.user_id, 'customer', 'order_' || p_status::text,
      'order_status:' || p_order_id::text || ':' || p_status::text,
      jsonb_build_object('order_number', v_order.order_number,
                         'amount', v_order.total_amount,
                         'status', p_status::text),
      p_order_id, NULL);
  END IF;

  RETURN p_status;
END;
$function$;

-- Item 14: search_products also matches products.search_terms and the
-- brands table's Hindi name and search terms. Ranking, filters and limits unchanged.
CREATE OR REPLACE FUNCTION public.search_products(p_query text, p_limit integer DEFAULT 60)
 RETURNS TABLE(product_id uuid, matched integer, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text := public.search_norm(p_query);
  v_tokens text[];
  v_count integer;
BEGIN
  IF v_norm = '' THEN RETURN; END IF;
  SELECT array_agg(DISTINCT t) INTO v_tokens FROM unnest(string_to_array(v_norm, ' ')) t
   WHERE length(t) >= 2 OR t ~ '[0-9]';
  IF v_tokens IS NULL THEN RETURN; END IF;
  v_count := array_length(v_tokens, 1);

  RETURN QUERY
  WITH tokens AS (SELECT unnest(v_tokens) AS token),
  expanded AS (
    SELECT tk.token, tk.token AS term, 1.0::numeric AS w FROM tokens tk
    UNION
    SELECT tk.token, public.search_norm(a.expansion), 0.5 FROM tokens tk JOIN search_aliases a ON public.search_norm(a.alias) = tk.token
    UNION
    SELECT tk.token, public.search_norm(a.alias), 0.5 FROM tokens tk JOIN search_aliases a ON public.search_norm(a.expansion) = tk.token
  ),
  docs AS (
    SELECT p.id,
      public.search_norm(concat_ws(' ', p.name, p.name_hi, p.slug)) AS n_name,
      public.search_norm(p.name) AS n_en, public.search_norm(p.name_hi) AS n_hi,
      public.search_norm(concat_ws(' ', p.brand, b.name_hi, b.search_terms)) AS n_brand,
      public.search_norm(concat_ws(' ', c.name, c.name_hi)) AS n_cat,
      public.search_norm(CASE p.product_type
        WHEN 'seed' THEN 'seed seeds बीज'
        WHEN 'pesticide' THEN 'pesticide pesticides crop protection कीटनाशक फसल सुरक्षा'
        WHEN 'fertilizer' THEN 'fertilizer fertilizers उर्वरक खाद'
        ELSE 'other अन्य' END) AS n_type,
      public.search_norm(concat_ws(' ', p.pack_size, p.unit)) AS n_pack,
      public.search_norm(concat_ws(' ', p.description, p.description_hi, p.sku, p.search_terms,
        (SELECT string_agg(k.keyword, ' ') FROM search_keywords k WHERE k.product_id = p.id OR k.category_id = p.category_id))) AS n_other,
      COALESCE((SELECT (i.quantity - i.reserved_quantity) > 0 FROM inventory i WHERE i.product_id = p.id LIMIT 1), false) AS in_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.name = p.brand
    WHERE p.is_active = true
  ),
  hits AS (
    SELECT d.id AS pid, e.token AS tok, max(e.w * GREATEST(
      CASE WHEN d.n_name ~ ('(^| )' || e.term || '( |$)') THEN 100
           WHEN d.n_name ~ ('(^| )' || e.term) THEN 80
           WHEN length(e.term) >= 3 AND position(e.term in d.n_name) > 0 THEN 60
           WHEN e.w = 1 AND length(e.term) >= 4 AND word_similarity(e.term, d.n_name) >= 0.6 THEN 35
           ELSE 0 END,
      CASE WHEN d.n_brand ~ ('(^| )' || e.term) THEN 50
           WHEN e.w = 1 AND length(e.term) >= 4 AND word_similarity(e.term, d.n_brand) >= 0.6 THEN 25
           ELSE 0 END,
      CASE WHEN d.n_cat ~ ('(^| )' || e.term) THEN 40
           WHEN e.w = 1 AND length(e.term) >= 4 AND EXISTS (
             SELECT 1 FROM unnest(string_to_array(d.n_cat, ' ')) AS cw(word)
             WHERE length(cw.word) >= 4 AND left(cw.word, 1) = left(e.term, 1)
               AND abs(length(cw.word) - length(e.term)) <= 2
               AND similarity(e.term, cw.word) >= 0.5
           ) THEN 18 ELSE 0 END,
      CASE WHEN d.n_type ~ ('(^| )' || e.term) THEN 30
           WHEN e.w = 1 AND length(e.term) >= 4 AND EXISTS (
             SELECT 1 FROM unnest(string_to_array(d.n_type, ' ')) AS tw(word)
             WHERE length(tw.word) >= 4 AND left(tw.word, 1) = left(e.term, 1)
               AND abs(length(tw.word) - length(e.term)) <= 2
               AND similarity(e.term, tw.word) >= 0.5
           ) THEN 14 ELSE 0 END,
      CASE WHEN d.n_pack ~ ('(^| )' || e.term || '( |$)') THEN 20 ELSE 0 END,
      CASE WHEN length(e.term) >= 3 AND d.n_other ~ ('(^| )' || e.term) THEN 10 ELSE 0 END
    )) AS s
    FROM docs d CROSS JOIN expanded e
    GROUP BY d.id, e.token
  ),
  ranked AS (
    SELECT h.pid, count(*) FILTER (WHERE h.s > 0)::integer AS m, sum(h.s) AS total
    FROM hits h GROUP BY h.pid
  )
  SELECT r.pid, r.m,
    round(r.total
      + CASE WHEN d.n_en = v_norm OR d.n_hi = v_norm THEN 500
             WHEN d.n_en LIKE v_norm || '%' OR d.n_hi LIKE v_norm || '%' THEN 150 ELSE 0 END
      + CASE WHEN d.in_stock THEN 15 ELSE 0 END, 2)
  FROM ranked r JOIN docs d ON d.id = r.pid
  WHERE r.m = v_count
  ORDER BY 3 DESC
  LIMIT greatest(1, coalesce(p_limit, 60));
END;
$function$;