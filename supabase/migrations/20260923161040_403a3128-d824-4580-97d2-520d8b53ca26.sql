-- Create the approved customer-facing categories that are needed by real products
INSERT INTO public.categories (name, name_hi, slug, sort_order, is_active)
VALUES
  ('Vegetable Seeds', 'सब्ज़ी के बीज', 'vegetable-seeds', 10, true),
  ('Micronutrients', 'सूक्ष्म पोषक तत्व', 'micronutrients', 20, true),
  ('Fungicides', 'कवकनाशी', 'fungicides', 30, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      name_hi = EXCLUDED.name_hi,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- Reassign the four existing products
UPDATE public.products SET category_id = (SELECT id FROM public.categories WHERE slug = 'vegetable-seeds')
WHERE slug IN ('ellora-milky-white-50-radish-seeds', 'ivory-white-radish-hybrid-seed');

UPDATE public.products SET category_id = (SELECT id FROM public.categories WHERE slug = 'micronutrients')
WHERE slug = 'multiplex-iron';

UPDATE public.products SET category_id = (SELECT id FROM public.categories WHERE slug = 'fungicides')
WHERE slug = 'kasu-b';

-- Hide the old categories now that no product references them
UPDATE public.categories SET is_active = false
WHERE slug IN ('wheat-seeds', 'radish-seeds', 'fungicide', 'fertilizer')
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = categories.id);