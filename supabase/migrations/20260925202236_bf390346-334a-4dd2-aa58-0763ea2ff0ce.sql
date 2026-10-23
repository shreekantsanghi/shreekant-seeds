CREATE OR REPLACE FUNCTION public.search_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            translate(lower(coalesce(p, '')), '०१२३४५६७८९', '0123456789'),
            '[^a-z0-9\u0900-\u097F]+', ' ', 'g'),
          '([0-9]) (ml|l|ltr|litre|liter|g|gm|gms|gram|grams|kg|mg)( |$)', '\1\2\3', 'g'),
        '([0-9])(ltr|litre|liter)( |$)', '\1l\3', 'g'),
      '([0-9])(g|gms|gram|grams)( |$)', '\1gm\3', 'g'),
    '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.search_products(p_query text, p_limit integer DEFAULT 60)
RETURNS TABLE(product_id uuid, matched integer, score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
      public.search_norm(p.brand) AS n_brand,
      public.search_norm(concat_ws(' ', c.name, c.name_hi)) AS n_cat,
      public.search_norm(CASE p.product_type
        WHEN 'seed' THEN 'seed seeds बीज'
        WHEN 'pesticide' THEN 'pesticide pesticides crop protection कीटनाशक फसल सुरक्षा'
        WHEN 'fertilizer' THEN 'fertilizer fertilizers उर्वरक खाद'
        ELSE 'other अन्य' END) AS n_type,
      public.search_norm(concat_ws(' ', p.pack_size, p.unit)) AS n_pack,
      public.search_norm(concat_ws(' ', p.description, p.description_hi, p.sku,
        (SELECT string_agg(k.keyword, ' ') FROM search_keywords k WHERE k.product_id = p.id OR k.category_id = p.category_id))) AS n_other,
      COALESCE((SELECT (i.quantity - i.reserved_quantity) > 0 FROM inventory i WHERE i.product_id = p.id LIMIT 1), false) AS in_stock
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
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
      CASE WHEN d.n_cat ~ ('(^| )' || e.term) THEN 40 ELSE 0 END,
      CASE WHEN d.n_type ~ ('(^| )' || e.term) THEN 30 ELSE 0 END,
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