import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Customer wishlist. Every read and write goes through the signed-in user's
 * own session, so row-level security keeps one customer out of another's list.
 */

const productInput = z.object({ productId: z.string().uuid() });

export const listWishlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const { data, error } = await context.supabase
      .from("wishlist_items")
      .select("product_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[wishlist] read failed", { message: error.message, code: error.code });
      throw new Error("WISHLIST_READ_FAILED");
    }
    return ((data ?? []) as { product_id: string }[]).map((row) => row.product_id);
  });

export const addWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => productInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Unique (user_id, product_id) plus ignoreDuplicates (INSERT ... ON CONFLICT DO NOTHING,
    // no UPDATE privilege needed) keeps a second click harmless.
    const { error } = await context.supabase
      .from("wishlist_items")
      .upsert(
        { user_id: context.userId, product_id: data.productId },
        { onConflict: "user_id,product_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("[wishlist] add failed", { message: error.message, code: error.code });
      throw new Error("WISHLIST_UPDATE_FAILED");
    }
    return { ok: true };
  });

export const removeWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => productInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", context.userId)
      .eq("product_id", data.productId);
    if (error) {
      console.error("[wishlist] remove failed", { message: error.message, code: error.code });
      throw new Error("WISHLIST_UPDATE_FAILED");
    }
    return { ok: true };
  });
