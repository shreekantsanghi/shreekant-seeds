REVOKE INSERT, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.discounts FROM authenticated;
REVOKE DELETE ON public.profiles FROM authenticated;