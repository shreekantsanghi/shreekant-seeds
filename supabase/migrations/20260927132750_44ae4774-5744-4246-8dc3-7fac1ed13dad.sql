ALTER TABLE public.notifications DROP CONSTRAINT notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
  CHECK (category = ANY (ARRAY['order'::text, 'payment'::text, 'delivery'::text, 'inventory'::text, 'account'::text, 'general'::text]));