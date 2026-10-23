CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.search_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alias text NOT NULL,
  expansion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias, expansion)
);
GRANT SELECT ON public.search_aliases TO anon;
GRANT SELECT ON public.search_aliases TO authenticated;
GRANT ALL ON public.search_aliases TO service_role;
ALTER TABLE public.search_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "search_aliases_read_anon" ON public.search_aliases;
CREATE POLICY "search_aliases_read_anon" ON public.search_aliases FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "search_aliases_read_auth" ON public.search_aliases;
CREATE POLICY "search_aliases_read_auth" ON public.search_aliases FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "search_aliases_admin_all" ON public.search_aliases;
CREATE POLICY "search_aliases_admin_all" ON public.search_aliases FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.search_keywords (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_keywords_one_target CHECK (((product_id IS NOT NULL)::int + (category_id IS NOT NULL)::int) = 1),
  UNIQUE (product_id, category_id, keyword)
);
GRANT SELECT ON public.search_keywords TO anon;
GRANT SELECT ON public.search_keywords TO authenticated;
GRANT ALL ON public.search_keywords TO service_role;
ALTER TABLE public.search_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "search_keywords_read_anon" ON public.search_keywords;
CREATE POLICY "search_keywords_read_anon" ON public.search_keywords FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "search_keywords_read_auth" ON public.search_keywords;
CREATE POLICY "search_keywords_read_auth" ON public.search_keywords FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "search_keywords_admin_all" ON public.search_keywords;
CREATE POLICY "search_keywords_admin_all" ON public.search_keywords FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_search_aliases_updated_at ON public.search_aliases;
CREATE TRIGGER set_search_aliases_updated_at BEFORE UPDATE ON public.search_aliases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_search_keywords_updated_at ON public.search_keywords;
CREATE TRIGGER set_search_keywords_updated_at BEFORE UPDATE ON public.search_keywords FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_hi_trgm ON public.products USING gin (name_hi gin_trgm_ops);