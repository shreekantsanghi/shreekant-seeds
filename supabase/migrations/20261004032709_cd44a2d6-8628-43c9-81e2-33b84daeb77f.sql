-- #1 Customers may only create their own profile as an active customer.
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id AND role = 'customer'::user_role AND is_active = true);

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Trusted provisioning (service role / SQL, no end-user JWT) and verified admins may set any role.
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM 'customer'::user_role OR NEW.is_active IS DISTINCT FROM true)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Creating a privileged or inactive profile is not allowed';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privileged_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_insert ON public.profiles;
CREATE TRIGGER profiles_prevent_privileged_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_insert();

-- #7 Cart quantity must be positive (verified: no existing rows violate this).
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0);

-- #5 Product images: only JPG/JPEG/PNG/WebP file names may be stored.
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
CREATE POLICY "Admins can upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin()
    AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
CREATE POLICY "Admins can update product images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin()
    AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));