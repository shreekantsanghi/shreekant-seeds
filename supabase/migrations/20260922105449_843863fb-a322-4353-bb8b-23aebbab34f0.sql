ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'fertilizer' AFTER 'pesticide';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'other' AFTER 'fertilizer';