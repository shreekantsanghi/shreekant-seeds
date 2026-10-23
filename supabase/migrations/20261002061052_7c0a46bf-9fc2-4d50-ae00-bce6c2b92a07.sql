-- Smart Search improvement (approved by user)
-- Adds: case-insensitive brand linking, legal-suffix-free brand matching,
-- spelling-tolerant brand matching (Latin + Devanagari folding), joined-letter
-- brand search, Hindi filler-word removal, and Hindi/English brand + category aliases.
-- Existing products/brands rows are NOT modified. Only new alias rows are added.

-- 1) Spelling-folding helper: makes common spelling variants identical.
CREATE OR REPLACE FUNCTION public.search_fold(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT regexp_replace(
    translate(
      replace(replace(replace(replace(replace(
        public.search_norm(p),
        'ph', 'f'), 'oo', 'u'), 'ee', 'i'), 'ck', 'k'), 'w', 'v'),
      'yczqीूॉंँ़्', 'ikjkिुो'),
    '(.)\1+', '\1', 'g');
$$;

-- 2) Word-level fuzzy match: true when any word of p_doc is a close/partial
--    spelling of p_tok. Guards (same first letter, similar length) prevent
--    unrelated words from matching.
CREATE OR REPLACE FUNCTION public.search_word_fuzzy(p_tok text, p_doc text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT length(p_tok) >= 3 AND EXISTS (
    SELECT 1 FROM unnest(string_to_array(public.search_fold(p_doc), ' ')) AS w(word),
                  LATERAL (SELECT public.search_fold(p_tok) AS t) f
    WHERE length(w.word) >= 3 AND (
      w.word LIKE f.t || '%'
      OR (length(f.t) = 3 AND left(w.word, 2) = left(f.t, 2)
          AND position(substr(f.t, 3, 1) in substr(w.word, 3, 3)) > 0)
      OR (length(f.t) >= 4 AND left(w.word, 1) = left(f.t, 1)
          AND abs(length(w.word) - length(f.t)) <= 2
          AND similarity(f.t, w.word) >= 0.3)
    ));
$$;

-- 3) Aliases (insert-only, skip if already present).
INSERT INTO public.search_aliases (alias, expansion)
SELECT v.alias, v.expansion FROM (VALUES
  ('सिंजेंटा','syngenta'),('सिंगेंटा','syngenta'),('सिजेंटा','syngenta'),
  ('बायर','bayer'),('धानुका','dhanuka'),('एग्रीटेक','agritech'),
  ('महिको','mahyco'),('महायको','mahyco'),('अंकुर','ankur'),('नामधारी','namdhari'),
  ('वीएनआर','vnr'),('एडवांटा','advanta'),('कोरटिवा','corteva'),('कोर्टेवा','corteva'),
  ('एलोरा','ellora'),('मल्टीप्लेक्स','multiplex'),('एनएसीएल','nacl'),
  ('नाथ','nath'),('डॉक्टर','doctor'),('dr','doctor'),('सीड्स','seeds'),('सीड','seed'),
  ('seeds','seed'),('fertiliser','fertilizer'),('उर्वरक','fertilizer'),
  ('fungicide','फफूंदनाशक'),('फफूंदनाशक','fungicide'),('फफूंद','fungicide'),
  ('herbicide','खरपतवार'),('weedicide','herbicide'),('नाशक','pesticide'),
  ('कीड़ा','pesticide'),('pest','pesticide'),('कीट','pesticide')
) AS v(alias, expansion)
WHERE NOT EXISTS (SELECT 1 FROM public.search_aliases a
                  WHERE a.alias = v.alias AND a.expansion = v.expansion);

-- 4) search_products: same signature, same output, same security; extended scoring.
CREATE OR REPLACE FUNCTION public.search_products(p_query text, p_limit integer DEFAULT 60)
 RETURNS TABLE(product_id uuid, matched integer, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text := public.search_norm(p_query);
  v_compact text;
  v_tokens text[];
  v_count integer;
BEGIN
  IF v_norm = '' THEN RETURN; END IF;
  v_compact := public.search_fold(replace(v_norm, ' ', ''));
  SELECT array_agg(DISTINCT t) INTO v_tokens FROM unnest(string_to_array(v_norm, ' ')) t
   WHERE (length(t) >= 2 OR t ~ '[0-9]')
     AND t NOT IN ('का','की','के','को','में','वाला','वाली','वाले','और','ka','ki','ke','wala','wali','vala','for','and','the','of');
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
      trim(regexp_replace(public.search_norm(concat_ws(' ', p.brand, b.name_hi, b.search_terms)),
        '(^| )(pvt|private|ltd|limited|co|company)(?= |$)', ' ', 'g')) AS n_brand,
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
    LEFT JOIN brands b ON lower(b.name) = lower(p.brand)
    WHERE p.is_active = true
  ),
  hits AS (
    SELECT d.id AS pid, e.token AS tok, max(e.w * GREATEST(
      CASE WHEN d.n_name ~ ('(^| )' || e.term || '( |$)') THEN 100
           WHEN d.n_name ~ ('(^| )' || e.term) THEN 80
           WHEN length(e.term) >= 3 AND position(e.term in d.n_name) > 0 THEN 60
           WHEN e.w = 1 AND length(e.term) >= 4 AND word_similarity(e.term, d.n_name) >= 0.6 THEN 35
           WHEN e.w = 1 AND public.search_word_fuzzy(e.term, d.n_name) THEN 30
           ELSE 0 END,
      CASE WHEN d.n_brand ~ ('(^| )' || e.term || '( |$)') THEN 110
           WHEN d.n_brand ~ ('(^| )' || e.term) THEN 90
           WHEN e.w = 1 AND public.search_word_fuzzy(e.term, d.n_brand) THEN 45
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
  ),
  scored AS (
    SELECT r.pid, r.m, r.total, d.n_en, d.n_hi, d.in_stock,
      (v_count > 1 AND length(v_compact) >= 3 AND EXISTS (
         SELECT 1 FROM unnest(string_to_array(public.search_fold(d.n_brand), ' ')) bw(word)
         WHERE bw.word = v_compact)
       OR EXISTS (SELECT 1 FROM search_aliases a
                  WHERE public.search_fold(a.alias) = v_compact
                    AND d.n_brand ~ ('(^| )' || public.search_norm(a.expansion) || '( |$)'))
      ) AS compact_brand
    FROM ranked r JOIN docs d ON d.id = r.pid
  )
  SELECT s.pid, CASE WHEN s.compact_brand THEN v_count ELSE s.m END,
    round(s.total
      + CASE WHEN s.compact_brand THEN 110 ELSE 0 END
      + CASE WHEN s.n_en = v_norm OR s.n_hi = v_norm THEN 500
             WHEN s.n_en LIKE v_norm || '%' OR s.n_hi LIKE v_norm || '%' THEN 150 ELSE 0 END
      + CASE WHEN s.in_stock THEN 15 ELSE 0 END, 2)
  FROM scored s
  WHERE s.m = v_count OR s.compact_brand
  ORDER BY 3 DESC
  LIMIT greatest(1, coalesce(p_limit, 60));
END;
$function$;

-- Same access as before: helpers are internal; search_products keeps its existing grants.
REVOKE ALL ON FUNCTION public.search_fold(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_word_fuzzy(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_fold(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_word_fuzzy(text, text) TO authenticated, service_role;