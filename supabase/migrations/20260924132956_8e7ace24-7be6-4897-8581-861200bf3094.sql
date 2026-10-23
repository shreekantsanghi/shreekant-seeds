ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories(parent_id);

UPDATE public.categories SET name='Fertilizers', name_hi='उर्वरक / खाद', sort_order=20, parent_id=NULL WHERE slug='fertilizer';

INSERT INTO public.categories (slug, name, name_hi, sort_order, is_active) VALUES
 ('seeds','Seeds','बीज',10,true),
 ('crop-protection','Pesticides / Crop Protection','कीटनाशक / फसल सुरक्षा',30,true),
 ('other','Other','अन्य',40,true)
ON CONFLICT (slug) DO UPDATE SET is_active=true, parent_id=NULL, sort_order=EXCLUDED.sort_order;

INSERT INTO public.categories (slug, name, name_hi, sort_order, is_active, parent_id)
SELECT v.slug, v.name, v.name_hi, v.sort, true, p.id
FROM (VALUES
 ('field-crop-seeds','Field Crop Seeds','फसल के बीज',12,'seeds'),
 ('other-seeds','Other Seeds','अन्य बीज',13,'seeds'),
 ('water-soluble-fertilizers','Water-Soluble Fertilizers','पानी में घुलनशील उर्वरक',22,'fertilizer'),
 ('granular-fertilizers','Granular Fertilizers','दानेदार उर्वरक',23,'fertilizer'),
 ('organic-bio-fertilizers','Organic / Bio Fertilizers','जैविक / बायो उर्वरक',24,'fertilizer'),
 ('other-fertilizers','Other Fertilizers','अन्य उर्वरक',25,'fertilizer'),
 ('insecticides','Insecticides','कीटनाशक (इन्सेक्टिसाइड)',32,'crop-protection'),
 ('herbicides','Herbicides','खरपतवारनाशी',33,'crop-protection'),
 ('other-crop-protection','Other Crop Protection','अन्य फसल सुरक्षा',34,'crop-protection'),
 ('other-agricultural-products','Other Agricultural Products','अन्य कृषि उत्पाद',41,'other')
) AS v(slug,name,name_hi,sort,parent)
JOIN public.categories p ON p.slug=v.parent
ON CONFLICT (slug) DO NOTHING;

UPDATE public.categories SET parent_id=(SELECT id FROM public.categories WHERE slug='seeds'), sort_order=11 WHERE slug='vegetable-seeds';
UPDATE public.categories SET parent_id=(SELECT id FROM public.categories WHERE slug='fertilizer'), sort_order=21 WHERE slug='micronutrients';
UPDATE public.categories SET parent_id=(SELECT id FROM public.categories WHERE slug='crop-protection'), sort_order=31 WHERE slug='fungicides';