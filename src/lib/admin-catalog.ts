import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminSupabase as supabase } from "@/integrations/supabase/admin-client";
import {
  addProductImage,
  deleteCategory,
  deleteProduct,
  deleteProductImage,
  getAdminProduct,
  listAdminCategories,
  listAdminInventory,
  saveCategory,
  saveInventory,
  saveProduct,
  setProductActive,
} from "@/lib/admin-catalog.functions";

export const PRODUCT_IMAGE_BUCKET = "product-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
import { IMAGE_EXTENSIONS, sniffImageType } from "@/lib/admin-catalog-image";
export { IMAGE_EXTENSIONS, sniffImageType };

export type ImageUploadError = "type" | "size" | "upload";

/** Uploads with the signed-in merchant's own session; storage RLS allows admins and JPG/PNG/WebP names only. */
export async function uploadProductImage(file: File): Promise<{ url: string } | { error: ImageUploadError }> {
  if (file.size > MAX_IMAGE_BYTES) return { error: "size" };
  const detected = sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!detected) return { error: "type" };
  const path = `products/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[detected]}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: detected,
    upsert: false,
  });
  if (error) {
    console.error("[storage]", error.message);
    return { error: "upload" };
  }
  return { url: supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

export const adminCategoriesKey = ["admin-categories"] as const;
export const adminInventoryKey = ["admin-inventory"] as const;
export const adminProductKey = (id: string) => ["admin-product", id] as const;

function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminCategoriesKey });
    void queryClient.invalidateQueries({ queryKey: adminInventoryKey });
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-product"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["product"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["availability"] });
  };
}

export function useAdminCategories() {
  const fetchCategories = useServerFn(listAdminCategories);
  return useQuery({ queryKey: adminCategoriesKey, queryFn: () => fetchCategories(), retry: false });
}

export function useSaveCategory() {
  const call = useServerFn(saveCategory);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useDeleteCategory() {
  const call = useServerFn(deleteCategory);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useAdminProduct(id: string | undefined) {
  const call = useServerFn(getAdminProduct);
  return useQuery({
    queryKey: adminProductKey(id ?? "new"),
    queryFn: () => call({ data: { id: id as string } }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useSaveProduct() {
  const call = useServerFn(saveProduct);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useSetProductActive() {
  const call = useServerFn(setProductActive);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useDeleteProduct() {
  const call = useServerFn(deleteProduct);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useAddProductImage() {
  const call = useServerFn(addProductImage);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useDeleteProductImage() {
  const call = useServerFn(deleteProductImage);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function useAdminInventory() {
  const call = useServerFn(listAdminInventory);
  return useQuery({ queryKey: adminInventoryKey, queryFn: () => call(), retry: false });
}

export function useSaveInventory() {
  const call = useServerFn(saveInventory);
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: call, onSuccess: invalidate });
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
