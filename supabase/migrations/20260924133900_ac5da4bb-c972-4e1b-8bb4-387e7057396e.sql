UPDATE public.categories SET parent_id = NULL WHERE parent_id IS NOT NULL;
UPDATE public.categories c SET is_active = false
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.search_keywords k WHERE k.category_id = c.id);
DROP INDEX IF EXISTS public.categories_parent_id_idx;
ALTER TABLE public.categories DROP COLUMN IF EXISTS parent_id;