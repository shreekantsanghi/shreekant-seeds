import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listAdminProducts } from "@/lib/admin-catalog.functions";

export type LocalText = { hi: string; en: string };

export type Category = {
  id: string;
  slug: string;
  name: LocalText;
  description: LocalText;
  imageUrl: string | null;
};

export type Product = {
  id: string;
  slug: string;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: LocalText | null;
  name: LocalText;
  description: LocalText;
  pack: LocalText;
  brand: string | null;
  price: number;
  mrp: number | null;
  imageUrl: string | null;
  images: string[];
  isFeatured: boolean;
  productType: ProductType;
  /** Active merchant offer; when set, `price` is already the discounted GST-inclusive price. */
  offer: ProductOffer | null;
};

export type ProductOffer = { percent: number; originalPrice: number; endsAt: string; reason: LocalText | null };

export type ProductType = "seed" | "fertilizer" | "pesticide" | "other";
export const PRODUCT_TYPES: { value: ProductType; name: LocalText; icon: string }[] = [
  { value: "seed", name: { hi: "बीज", en: "Seeds" }, icon: "🌱" },
  { value: "fertilizer", name: { hi: "उर्वरक / खाद", en: "Fertilizers" }, icon: "🌾" },
  { value: "pesticide", name: { hi: "कीटनाशक / फसल सुरक्षा", en: "Pesticides / Crop Protection" }, icon: "🛡️" },
  { value: "other", name: { hi: "अन्य", en: "Other" }, icon: "🧺" },
];

const text = (hi: string | null | undefined, en: string | null | undefined): LocalText => ({
  hi: hi ?? en ?? "",
  en: en ?? hi ?? "",
});

const PRODUCT_SELECT =
  "id, slug, name, name_hi, description, description_hi, pack_size, unit, brand, price, mrp, primary_image_url, is_featured, product_type, category_id, categories(slug, name, name_hi), product_images(image_url, sort_order)";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  name_hi: string;
  description: string | null;
  description_hi: string | null;
  pack_size: string | null;
  unit: string;
  brand: string | null;
  price: number;
  mrp: number | null;
  primary_image_url: string | null;
  is_featured: boolean;
  product_type: ProductType;
  category_id: string | null;
  categories: { slug: string; name: string; name_hi: string } | null;
  product_images: { image_url: string; sort_order: number }[] | null;
};

function mapProduct(row: ProductRow): Product {
  const gallery = (row.product_images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => image.image_url);
  const images = [row.primary_image_url, ...gallery].filter((url): url is string => Boolean(url));
  const pack = row.pack_size ?? row.unit;
  return {
    id: row.id,
    slug: row.slug,
    categoryId: row.category_id,
    categorySlug: row.categories?.slug ?? null,
    categoryName: row.categories ? text(row.categories.name_hi, row.categories.name) : null,
    name: text(row.name_hi, row.name),
    description: text(row.description_hi, row.description),
    pack: { hi: pack, en: pack },
    brand: row.brand,
    price: Number(row.price),
    mrp: row.mrp === null ? null : Number(row.mrp),
    imageUrl: images[0] ?? null,
    images: Array.from(new Set(images)),
    isFeatured: row.is_featured,
    productType: row.product_type,
    offer: null,
  };
}

type DiscountRow = { product_id: string; percent: number; discounted_price: number; ends_at: string; reason: string | null; reason_hi: string | null };

/** Active product/brand offers computed in the database (public.active_product_discounts). */
async function fetchOffers(): Promise<Map<string, DiscountRow>> {
  const { data, error } = await supabase.rpc("active_product_discounts");
  if (error) {
    console.error("[catalog] offers read failed", error.message);
    return new Map();
  }
  return new Map(((data ?? []) as DiscountRow[]).map((row) => [row.product_id, row]));
}

function applyOffer(product: Product, offers: Map<string, DiscountRow>): Product {
  const row = offers.get(product.id);
  if (!row) return product;
  const discounted = Number(row.discounted_price);
  if (!(discounted > 0) || discounted >= product.price) return product;
  const reason = row.reason || row.reason_hi ? text(row.reason_hi, row.reason) : null;
  return {
    ...product,
    mrp: product.mrp && product.mrp > product.price ? product.mrp : product.price,
    price: discounted,
    offer: { percent: Number(row.percent), originalPrice: product.price, endsAt: row.ends_at, reason },
  };
}

async function fetchProducts(): Promise<Product[]> {
  const [{ data, error }, offers] = await Promise.all([
    supabase.from("products").select(PRODUCT_SELECT).eq("is_active", true).order("name", { ascending: true }),
    fetchOffers(),
  ]);
  if (error) throw error;
  return ((data ?? []) as unknown as ProductRow[]).map((row) => applyOffer(mapProduct(row), offers));
}

async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, name_hi, description, description_hi, image_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: text(row.name_hi, row.name),
    description: text(row.description_hi, row.description),
    imageUrl: row.image_url,
  }));
}

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: fetchProducts, staleTime: 60_000 });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });
}

export type Availability = { inStock: boolean; isLow: boolean };

/** Customer-safe stock signal: no quantities leave the database. */
export function useAvailability() {
  return useQuery({
    queryKey: ["availability"],
    queryFn: async (): Promise<Record<string, Availability>> => {
      const { data, error } = await supabase.rpc("product_availability");
      if (error) throw error;
      const map: Record<string, Availability> = {};
      for (const row of data ?? []) map[row.product_id] = { inStock: row.in_stock, isLow: row.is_low };
      return map;
    },
    staleTime: 30_000,
  });
}

export function useProduct(idOrSlug: string) {
  return useQuery({
    queryKey: ["product", idOrSlug],
    queryFn: async (): Promise<Product | null> => {
      const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
      const [{ data, error }, offers] = await Promise.all([
        supabase.from("products").select(PRODUCT_SELECT).eq("is_active", true).eq(isUuid ? "id" : "slug", idOrSlug).maybeSingle(),
        fetchOffers(),
      ]);
      if (error) throw error;
      return data ? applyOffer(mapProduct(data as unknown as ProductRow), offers) : null;
    },
  });
}

export type InventoryRow = {
  id: string;
  productId: string;
  productName: LocalText;
  sku: string | null;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  batchNumber: string | null;
  expiryDate: string | null;
};

export function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async (): Promise<InventoryRow[]> => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_id, quantity, reserved_quantity, low_stock_threshold, batch_number, expiry_date, products(name, name_hi, sku)")
        .order("quantity", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const product = row.products as unknown as { name: string; name_hi: string; sku: string | null } | null;
        return {
          id: row.id,
          productId: row.product_id,
          productName: text(product?.name_hi, product?.name),
          sku: product?.sku ?? null,
          quantity: row.quantity,
          reservedQuantity: row.reserved_quantity,
          lowStockThreshold: row.low_stock_threshold,
          batchNumber: row.batch_number,
          expiryDate: row.expiry_date,
        };
      });
    },
    retry: false,
  });
}

/**
 * Admin listing: all products including inactive ones. Goes through the
 * admin-verified server function so the merchant's RLS policy applies —
 * the browser's public catalogue read only ever returns active products.
 */
export function useAdminProducts() {
  return useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const rows = await listAdminProducts();
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: text(row.nameHi, row.name),
        sku: row.sku,
        price: row.price,
        mrp: row.mrp,
        isActive: row.isActive,
        brand: row.brand,
        productType: row.productType,
        pack: row.pack,
        category: row.categoryName ? text(row.categoryNameHi, row.categoryName) : null,
      }));
    },
    retry: false,
  });
}

export function productsByIds(products: Product[], ids: string[]) {
  return ids.flatMap((id) => products.filter((product) => product.id === id));
}

type RankedRow = { product_id: string };

/**
 * Smart search: ranking and matching happen in the database
 * (public.search_products), so Hindi, English, Hinglish and misspellings
 * all resolve server-side. The browser only receives an ordered id list.
 */
export function useProductSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ["product-search", term.toLowerCase()],
    enabled: term.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("search_products" as never, {
        p_query: term,
        p_limit: 60,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as RankedRow[]).map((row) => row.product_id);
    },
  });
}

/** Similar products for a product page; ranking comes from public.similar_products. */
export function useSimilarProductIds(productId: string | undefined) {
  return useQuery({
    queryKey: ["similar-products", productId ?? ""],
    enabled: Boolean(productId),
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("similar_products" as never, {
        p_product_id: productId,
        p_limit: 4,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as RankedRow[]).map((row) => row.product_id);
    },
  });
}
