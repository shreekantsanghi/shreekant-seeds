import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminMfaState } from "@/lib/admin-mfa";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/** The authenticated context supplied by requireSupabaseAuth. */
export type AdminContext = { supabase: Client; userId: string; claims: unknown };

/**
 * Server-side admin check. The profile row is read as the signed-in user
 * (RLS applies), so the browser can never claim to be an admin.
 * Every write below is additionally enforced by the existing RLS policies.
 *
 * When the admin has an enrolled TOTP factor, the session must also have
 * completed two-step verification (aal2); a password-only session is rejected
 * here, not merely hidden by the login screen.
 */
export async function assertAdmin(context: AdminContext): Promise<void> {
  const { supabase, userId, claims } = context;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "admin" || data.is_active !== true) {
    throw new Error("Forbidden: admin access required");
  }

  const mfa = await getAdminMfaState(supabase, claims);
  if (!mfa.satisfied) {
    throw new Error("Forbidden: MFA_REQUIRED");
  }
}

export async function logAudit(
  supabase: Client,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> | null,
): Promise<void> {
  // Audit logging must never block the merchant's actual work.
  const { error } = await supabase.from("audit_logs").insert({
    actor_user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata as never,
  });
  if (error) console.error("[audit_logs]", error.message);
}

/* ------------------------------------------------------------------ categories */

export type AdminCategory = {
  id: string;
  name: string;
  nameHi: string;
  slug: string;
  description: string | null;
  descriptionHi: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};

export const listAdminCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCategory[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("categories")
      .select("id, name, name_hi, slug, description, description_hi, image_url, sort_order, is_active, products(count)")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const counts = row.products as unknown as { count: number }[] | null;
      return {
        id: row.id,
        name: row.name,
        nameHi: row.name_hi,
        slug: row.slug,
        description: row.description,
        descriptionHi: row.description_hi,
        imageUrl: row.image_url,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        productCount: counts?.[0]?.count ?? 0,
      };
    });
  });

const categoryInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  nameHi: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase words separated by hyphens"),
  description: z.string().trim().nullable().optional(),
  descriptionHi: z.string().trim().nullable().optional(),
  imageUrl: z.string().trim().url().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => categoryInput.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const row = {
      name: data.name,
      name_hi: data.nameHi,
      slug: data.slug,
      description: data.description ?? null,
      description_hi: data.descriptionHi ?? null,
      image_url: data.imageUrl ?? null,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    };
    if (data.id) {
      const { error } = await context.supabase.from("categories").update(row).eq("id", data.id);
      if (error) throw error;
      await logAudit(context.supabase, context.userId, "category.updated", "category", data.id, { slug: data.slug });
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("categories")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "category.created", "category", created.id, { slug: data.slug });
    return { id: created.id };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { count, error: countError } = await context.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) throw new Error("CATEGORY_IN_USE");
    const { error } = await context.supabase.from("categories").delete().eq("id", data.id);
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "category.deleted", "category", data.id, null);
    return { ok: true };
  });

/* ------------------------------------------------------------------- products */

export type AdminProductImage = { id: string; imageUrl: string; sortOrder: number };

export type AdminProductDetail = {
  id: string;
  name: string;
  nameHi: string;
  slug: string;
  productType: Database["public"]["Enums"]["product_type"];
  categoryId: string | null;
  brand: string | null;
  sku: string | null;
  hsnCode: string | null;
  description: string | null;
  descriptionHi: string | null;
  unit: string;
  packSize: string | null;
  price: number;
  mrp: number | null;
  primaryImageUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  images: AdminProductImage[];
  inventory: { quantity: number; lowStockThreshold: number; batchNumber: string | null; expiryDate: string | null } | null;
};

export const getAdminProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<AdminProductDetail | null> => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("products")
      .select(
        "id, name, name_hi, slug, product_type, category_id, brand, sku, hsn_code, description, description_hi, unit, pack_size, price, mrp, primary_image_url, is_active, is_featured, product_images(id, image_url, sort_order), inventory(quantity, low_stock_threshold, batch_number, expiry_date)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const images = (row.product_images ?? []) as unknown as { id: string; image_url: string; sort_order: number }[];
    const inventoryRows = (row.inventory ?? []) as unknown as {
      quantity: number;
      low_stock_threshold: number;
      batch_number: string | null;
      expiry_date: string | null;
    }[];
    const stock = inventoryRows[0];
    return {
      id: row.id,
      name: row.name,
      nameHi: row.name_hi,
      slug: row.slug,
      productType: row.product_type,
      categoryId: row.category_id,
      brand: row.brand,
      sku: row.sku,
      hsnCode: row.hsn_code,
      description: row.description,
      descriptionHi: row.description_hi,
      unit: row.unit,
      packSize: row.pack_size,
      price: Number(row.price),
      mrp: row.mrp === null ? null : Number(row.mrp),
      primaryImageUrl: row.primary_image_url,
      isActive: row.is_active,
      isFeatured: row.is_featured,
      images: images
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((image) => ({ id: image.id, imageUrl: image.image_url, sortOrder: image.sort_order })),
      inventory: stock
        ? {
            quantity: stock.quantity,
            lowStockThreshold: stock.low_stock_threshold,
            batchNumber: stock.batch_number,
            expiryDate: stock.expiry_date,
          }
        : null,
    };
  });

export type AdminProductListRow = {
  id: string;
  slug: string;
  name: string;
  nameHi: string;
  sku: string | null;
  price: number;
  mrp: number | null;
  isActive: boolean;
  isFeatured: boolean;
  productType: Database["public"]["Enums"]["product_type"];
  pack: string | null;
  categoryName: string | null;
  categoryNameHi: string | null;
  brand: string | null;
};

/**
 * Merchant product list. Runs as the signed-in user after assertAdmin, so the
 * existing admin RLS policy (not the public active-only one) applies and
 * inactive products are visible for management.
 */
export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminProductListRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("products")
      .select("id, slug, name, name_hi, sku, price, mrp, is_active, is_featured, product_type, pack_size, unit, brand, categories(name, name_hi)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const category = row.categories as unknown as { name: string; name_hi: string } | null;
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        nameHi: row.name_hi,
        sku: row.sku,
        price: Number(row.price),
        mrp: row.mrp === null ? null : Number(row.mrp),
        isActive: row.is_active,
        isFeatured: row.is_featured,
        productType: row.product_type,
        pack: row.pack_size ?? row.unit,
        categoryName: category?.name ?? null,
        categoryNameHi: category?.name_hi ?? null,
        brand: row.brand,
      };
    });
  });

const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  nameHi: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase words separated by hyphens"),
  productType: z.enum(["seed", "pesticide", "fertilizer", "other"]),
  categoryId: z.string().uuid().nullable().optional(),
  brand: z.string().trim().nullable().optional(),
  sku: z.string().trim().nullable().optional(),
  hsnCode: z.string().trim().max(20).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  descriptionHi: z.string().trim().nullable().optional(),
  unit: z.string().trim().min(1).default("piece"),
  packSize: z.string().trim().nullable().optional(),
  price: z.number().nonnegative(),
  mrp: z.number().nonnegative().nullable().optional(),
  primaryImageUrl: z.string().trim().url().nullable().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => productInput.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const row = {
      name: data.name,
      name_hi: data.nameHi,
      slug: data.slug,
      product_type: data.productType,
      category_id: data.categoryId ?? null,
      brand: data.brand || null,
      sku: data.sku || null,
      hsn_code: data.hsnCode || null,
      description: data.description || null,
      description_hi: data.descriptionHi || null,
      unit: data.unit,
      pack_size: data.packSize || null,
      price: data.price,
      mrp: data.mrp ?? null,
      primary_image_url: data.primaryImageUrl ?? null,
      is_active: data.isActive,
      is_featured: data.isFeatured,
    };
    if (data.id) {
      const { error } = await context.supabase.from("products").update(row).eq("id", data.id);
      if (error) throw error;
      await logAudit(context.supabase, context.userId, "product.updated", "product", data.id, { slug: data.slug });
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase.from("products").insert(row).select("id").single();
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "product.created", "product", created.id, { slug: data.slug });
    return { id: created.id };
  });

export const setProductActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("products").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw error;
    await logAudit(
      context.supabase,
      context.userId,
      data.isActive ? "product.activated" : "product.deactivated",
      "product",
      data.id,
      null,
    );
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { count, error: countError } = await context.supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) throw new Error("PRODUCT_IN_USE");
    const { error: imageError } = await context.supabase.from("product_images").delete().eq("product_id", data.id);
    if (imageError) throw imageError;
    const { error: stockError } = await context.supabase.from("inventory").delete().eq("product_id", data.id);
    if (stockError) throw stockError;
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "product.deleted", "product", data.id, null);
    return { ok: true };
  });

/* --------------------------------------------------------------- product images */

export const addProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        imageUrl: z.string().trim().url(),
        altText: z.string().trim().nullable().optional(),
        altTextHi: z.string().trim().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const { count, error: countError } = await context.supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.productId);
    if (countError) throw countError;
    const { data: created, error } = await context.supabase
      .from("product_images")
      .insert({
        product_id: data.productId,
        image_url: data.imageUrl,
        alt_text: data.altText ?? null,
        alt_text_hi: data.altTextHi ?? null,
        sort_order: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "product.image_added", "product", data.productId, {
      image_url: data.imageUrl,
    });
    return { id: created.id };
  });

export const deleteProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { data: image, error: readError } = await context.supabase
      .from("product_images")
      .select("product_id, image_url")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    const { error } = await context.supabase.from("product_images").delete().eq("id", data.id);
    if (error) throw error;
    if (image) {
      // Keep the product's cover image consistent when the cover is removed.
      await context.supabase
        .from("products")
        .update({ primary_image_url: null })
        .eq("id", image.product_id)
        .eq("primary_image_url", image.image_url);
      await logAudit(context.supabase, context.userId, "product.image_removed", "product", image.product_id, {
        image_url: image.image_url,
      });
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ inventory */

export type AdminInventoryRow = {
  productId: string;
  name: string;
  nameHi: string;
  sku: string | null;
  isActive: boolean;
  inventoryId: string | null;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  batchNumber: string | null;
  expiryDate: string | null;
};

export const listAdminInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminInventoryRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("products")
      .select("id, name, name_hi, sku, is_active, inventory(id, quantity, reserved_quantity, low_stock_threshold, batch_number, expiry_date)")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => {
      type StockRow = {
        id: string;
        quantity: number;
        reserved_quantity: number;
        low_stock_threshold: number;
        batch_number: string | null;
        expiry_date: string | null;
      };
      const related = row.inventory as StockRow[] | StockRow | null;
      const stock: StockRow | undefined = Array.isArray(related) ? related[0] : (related ?? undefined);
      return {
        productId: row.id,
        name: row.name,
        nameHi: row.name_hi,
        sku: row.sku,
        isActive: row.is_active,
        inventoryId: stock?.id ?? null,
        quantity: stock?.quantity ?? 0,
        reservedQuantity: stock?.reserved_quantity ?? 0,
        lowStockThreshold: stock?.low_stock_threshold ?? 5,
        batchNumber: stock?.batch_number ?? null,
        expiryDate: stock?.expiry_date ?? null,
      };
    });
  });

export const saveInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(0),
        lowStockThreshold: z.number().int().min(0).default(5),
        batchNumber: z.string().trim().nullable().optional(),
        expiryDate: z.string().trim().min(1).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { data: existing, error: readError } = await context.supabase
      .from("inventory")
      .select("id")
      .eq("product_id", data.productId)
      .maybeSingle();
    if (readError) throw readError;
    const row = {
      product_id: data.productId,
      quantity: data.quantity,
      low_stock_threshold: data.lowStockThreshold,
      batch_number: data.batchNumber || null,
      expiry_date: data.expiryDate || null,
    };
    if (existing) {
      const { error } = await context.supabase.from("inventory").update(row).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("inventory").insert(row);
      if (error) throw error;
    }
    await logAudit(context.supabase, context.userId, "inventory.updated", "product", data.productId, {
      quantity: data.quantity,
    });
    return { ok: true };
  });

/* --------------------------------------------------------------------- brands */

export type AdminBrand = { id: string; name: string; isActive: boolean; productCount: number };

export const listAdminBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBrand[]> => {
    await assertAdmin(context);
    const [brands, products] = await Promise.all([
      context.supabase.from("brands").select("id, name, is_active").order("name", { ascending: true }),
      context.supabase.from("products").select("brand"),
    ]);
    if (brands.error) throw brands.error;
    if (products.error) throw products.error;
    const counts = new Map<string, number>();
    for (const p of products.data ?? []) {
      const key = (p.brand ?? "").trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return (brands.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      isActive: b.is_active,
      productCount: counts.get(b.name.trim().toLowerCase()) ?? 0,
    }));
  });

export const saveBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), isActive: z.boolean().default(true) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const row = { name: data.name, is_active: data.isActive, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await context.supabase.from("brands").update(row).eq("id", data.id);
      if (error) throw error;
      await logAudit(context.supabase, context.userId, "brand.updated", "brand", data.id, { name: data.name });
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase.from("brands").insert(row).select("id").single();
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "brand.created", "brand", created.id, { name: data.name });
    return { id: created.id };
  });
