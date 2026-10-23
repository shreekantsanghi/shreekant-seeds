import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin-catalog.functions";

export type AdminDiscount = {
  id: string;
  targetType: "product" | "brand" | "category" | "product_type";
  productId: string | null;
  brandId: string | null;
  categoryId: string | null;
  productType: "seed" | "pesticide" | "fertilizer" | "other" | null;
  targetName: string;
  targetNameHi: string | null;
  percent: number;
  reason: string | null;
  reasonHi: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export const listAdminDiscounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDiscount[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("product_discounts")
      .select("id, target_type, product_id, brand_id, percent, reason, reason_hi, starts_at, ends_at, is_active, category_id, product_type, products(name, name_hi), brands(name, name_hi), categories(name, name_hi)")
      .order("starts_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const product = row.products as unknown as { name: string; name_hi: string } | null;
      const brand = row.brands as unknown as { name: string; name_hi: string | null } | null;
      const category = row.categories as unknown as { name: string; name_hi: string } | null;
      return {
        id: row.id,
        targetType: row.target_type as AdminDiscount["targetType"],
        productId: row.product_id,
        brandId: row.brand_id,
        categoryId: row.category_id,
        productType: row.product_type,
        targetName: product?.name ?? brand?.name ?? category?.name ?? row.product_type ?? "",
        targetNameHi: product?.name_hi ?? brand?.name_hi ?? category?.name_hi ?? null,
        percent: Number(row.percent),
        reason: row.reason,
        reasonHi: row.reason_hi,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: row.is_active,
      };
    });
  });

const PRODUCT_TYPE_VALUES = ["seed", "pesticide", "fertilizer", "other"] as const;

const saveSchema = z
  .object({
    id: z.string().uuid().optional(),
    targetType: z.enum(["product", "brand", "category", "product_type"]),
    targetId: z.string().min(1),
    percent: z.number().gt(0).lt(100),
    reason: z.string().trim().max(120).optional(),
    reasonHi: z.string().trim().max(120).optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    isActive: z.boolean(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), { message: "END_BEFORE_START" })
  .refine((d) => d.targetType === "product_type"
    ? PRODUCT_TYPE_VALUES.includes(d.targetId as (typeof PRODUCT_TYPE_VALUES)[number])
    : z.string().uuid().safeParse(d.targetId).success, { message: "INVALID_TARGET" });

export const saveDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = {
      target_type: data.targetType,
      product_id: data.targetType === "product" ? data.targetId : null,
      brand_id: data.targetType === "brand" ? data.targetId : null,
      category_id: data.targetType === "category" ? data.targetId : null,
      product_type: data.targetType === "product_type" ? (data.targetId as (typeof PRODUCT_TYPE_VALUES)[number]) : null,
      percent: Math.round(data.percent * 100) / 100,
      reason: data.reason || null,
      reason_hi: data.reasonHi || null,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      is_active: data.isActive,
    };
    const result = data.id
      ? await context.supabase.from("product_discounts").update(row).eq("id", data.id).select("id").single()
      : await context.supabase.from("product_discounts").insert({ ...row, created_by: context.userId }).select("id").single();
    if (result.error) throw result.error;
    await logAudit(context.supabase, context.userId, data.id ? "discount_updated" : "discount_created", "product_discount", result.data.id, row);
    return { id: result.data.id };
  });

export const setDiscountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("product_discounts").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw error;
    await logAudit(context.supabase, context.userId, data.isActive ? "discount_enabled" : "discount_disabled", "product_discount", data.id, {});
    return { ok: true };
  });
