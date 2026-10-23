INSERT INTO public.search_aliases (alias, expansion) VALUES
 ('muli','radish'),('muli','मूली'),('mooli','radish'),('mooli','मूली'),('मूली','radish'),
 ('gehun','wheat'),('gehun','गेहूं'),('gehu','wheat'),('गेहूं','wheat'),
 ('tamatar','tomato'),('tamatar','टमाटर'),('टमाटर','tomato'),
 ('pyaz','onion'),('pyaz','प्याज'),('प्याज','onion'),
 ('aloo','potato'),('aloo','आलू'),('आलू','potato'),
 ('mirch','chilli'),('mirch','मिर्च'),('मिर्च','chilli'),
 ('baingan','brinjal'),('baingan','बैंगन'),('बैंगन','brinjal'),
 ('gobhi','cauliflower'),('gobhi','गोभी'),('गोभी','cauliflower'),
 ('patta','cabbage'),('bandgobhi','cabbage'),
 ('kheera','cucumber'),('kheera','खीरा'),('खीरा','cucumber'),
 ('bhindi','okra'),('bhindi','भिंडी'),('भिंडी','okra'),
 ('palak','spinach'),('palak','पालक'),('पालक','spinach'),
 ('gajar','carrot'),('gajar','गाजर'),('गाजर','carrot'),
 ('dhaniya','coriander'),('dhaniya','धनिया'),('धनिया','coriander'),
 ('matar','peas'),('matar','मटर'),('मटर','peas'),
 ('sarso','mustard'),('sarso','सरसों'),('सरसों','mustard'),
 ('bajra','बाजरा'),('बाजरा','bajra'),
 ('makka','maize'),('makka','मक्का'),('मक्का','maize'),
 ('chana','gram'),('chana','चना'),('चना','gram'),
 ('jau','barley'),('jau','जौ'),
 ('kapas','cotton'),('kapas','कपास'),('कपास','cotton'),
 ('lehsun','garlic'),('lehsun','लहसुन'),('लहसुन','garlic'),
 ('methi','fenugreek'),('methi','मेथी'),('मेथी','fenugreek'),
 ('lauki','gourd'),('lauki','लौकी'),('लौकी','gourd'),
 ('kaddu','pumpkin'),('kaddu','कद्दू'),('कद्दू','pumpkin'),
 ('tarbooj','watermelon'),('tarbooj','तरबूज'),('तरबूज','watermelon'),
 ('kharbooja','muskmelon'),('kharbuja','muskmelon'),('खरबूजा','muskmelon'),
 ('beej','seed'),('beej','बीज'),('बीज','seed'),
 ('dawa','pesticide'),('dawa','कीटनाशक'),('dawai','pesticide'),('dawai','कीटनाशक'),('davai','pesticide'),
 ('keetnashak','pesticide'),('keetnashak','कीटनाशक'),('कीटनाशक','pesticide'),
 ('insecticide','pesticide'),('kitnashak','pesticide'),
 ('kavaknashi','fungicide'),('कवकनाशी','fungicide'),
 ('kharpatwar','herbicide'),('खरपतवार','herbicide'),
 ('khad','fertilizer'),('खाद','fertilizer')
ON CONFLICT (alias, expansion) DO NOTHING;

CREATE OR REPLACE FUNCTION public.search_products(p_query text, p_limit integer DEFAULT 60)
RETURNS TABLE(product_id uuid, matched integer, score numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_norm text;
  v_tokens text[];
BEGIN
  v_norm := lower(trim(coalesce(p_query, '')));
  v_norm := regexp_replace(v_norm, '[^[:alnum:][:space:]]+', ' ', 'g');
  v_norm := regexp_replace(v_norm, '\s+', ' ', 'g');
  v_norm := trim(v_norm);
  IF v_norm = '' THEN
    RETURN;
  END IF;
  v_tokens := string_to_array(v_norm, ' ');

  RETURN QUERY
  WITH tokens AS (
    SELECT DISTINCT t AS token FROM unnest(v_tokens) AS t WHERE length(t) >= 2
  ),
  expanded AS (
    SELECT tk.token, tk.token AS term, 1.0::numeric AS weight FROM tokens tk
    UNION
    SELECT tk.token, lower(a.expansion), 0.85::numeric
    FROM tokens tk JOIN public.search_aliases a ON lower(a.alias) = tk.token
    UNION
    SELECT tk.token, lower(a.alias), 0.85::numeric
    FROM tokens tk JOIN public.search_aliases a ON lower(a.expansion) = tk.token
  ),
  docs AS (
    SELECT p.id,
      lower(concat_ws(' ',
        p.name, p.name_hi, p.slug, p.brand, p.sku, p.pack_size, p.unit,
        p.description, p.description_hi, p.product_type::text,
        c.name, c.name_hi, c.slug,
        (SELECT string_agg(k.keyword, ' ') FROM public.search_keywords k WHERE k.product_id = p.id),
        (SELECT string_agg(k.keyword, ' ') FROM public.search_keywords k WHERE k.category_id = p.category_id)
      )) AS doc
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE p.is_active = true
  ),
  hits AS (
    SELECT d.id AS pid, e.token AS tok,
      max(
        CASE
          WHEN d.doc ~ ('(^|\s)' || regexp_replace(e.term, '([\.\^\$\*\+\?\(\)\[\]\{\}\|\\])', '\\\1', 'g') || '($|\s)') THEN e.weight
          WHEN length(e.term) >= 3 AND position(e.term in d.doc) > 0 THEN e.weight * 0.7
          WHEN word_similarity(e.term, d.doc) >= 0.5 THEN e.weight * 0.45
          ELSE 0
        END
      ) AS token_score
    FROM docs d CROSS JOIN expanded e
    GROUP BY d.id, e.token
  )
  SELECT h.pid,
         count(*) FILTER (WHERE h.token_score > 0)::integer,
         round(sum(h.token_score)::numeric, 4)
  FROM hits h
  GROUP BY h.pid
  HAVING count(*) FILTER (WHERE h.token_score > 0) > 0
  ORDER BY 2 DESC, 3 DESC
  LIMIT greatest(1, coalesce(p_limit, 60));
END;
$fn$;

REVOKE ALL ON FUNCTION public.search_products(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.similar_products(p_product_id uuid, p_limit integer DEFAULT 4)
RETURNS TABLE(product_id uuid, score numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cat uuid;
  v_type product_type;
  v_brand text;
  v_price numeric;
BEGIN
  SELECT p.category_id, p.product_type, p.brand, p.price
    INTO v_cat, v_type, v_brand, v_price
  FROM public.products p WHERE p.id = p_product_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  WITH base_kw AS (
    SELECT lower(k.keyword) AS kw FROM public.search_keywords k WHERE k.product_id = p_product_id
  )
  SELECT p.id,
    round((
      (CASE WHEN v_cat IS NOT NULL AND p.category_id = v_cat THEN 3.0 ELSE 0 END)
      + (CASE WHEN p.product_type = v_type THEN 2.0 ELSE 0 END)
      + (COALESCE((SELECT count(*) FROM public.search_keywords k2 JOIN base_kw b ON lower(k2.keyword) = b.kw WHERE k2.product_id = p.id), 0)::numeric * 0.5)
      + (CASE WHEN v_brand IS NOT NULL AND p.brand IS NOT NULL AND lower(p.brand) = lower(v_brand) THEN 0.4 ELSE 0 END)
      + (CASE WHEN v_price IS NOT NULL AND v_price > 0 AND p.price BETWEEN v_price * 0.6 AND v_price * 1.4 THEN 0.3 ELSE 0 END)
      + (CASE WHEN p.is_featured THEN 0.1 ELSE 0 END)
    )::numeric, 4)
  FROM public.products p
  WHERE p.is_active = true AND p.id <> p_product_id
  ORDER BY 2 DESC, p.is_featured DESC, p.created_at DESC
  LIMIT greatest(1, coalesce(p_limit, 4));
END;
$fn$;

REVOKE ALL ON FUNCTION public.similar_products(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.similar_products(uuid, integer) TO anon, authenticated, service_role;