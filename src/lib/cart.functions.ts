import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type CartItem = { productId: string; quantity: number };
export type CartResult = { items: CartItem[]; adjusted: boolean };

const MAX_QUANTITY = 99;

type AuthedSupabase = { supabase: SupabaseClient<Database>; userId: string };

type CartChangeRow = { quantity: number; adjusted: boolean; out_of_stock: boolean };

/**
 * Stock validation happens entirely inside the database routine, so the exact
 * inventory level never reaches the server function or the browser.
 */
async function applyCartChange(
  context: AuthedSupabase,
  productId: string,
  quantity: number,
  mode: "add" | "set",
): Promise<{ adjusted: boolean; outOfStock: boolean }> {
  const { data, error } = await context.supabase.rpc("cart_change", {
    p_product_id: productId,
    p_quantity: quantity,
    p_mode: mode,
  });
  if (error) {
    console.error("[cart] cart_change failed", { productId, mode, message: error.message, code: error.code });
    throw new Error("CART_UPDATE_FAILED");
  }
  const row = (Array.isArray(data) ? data[0] : data) as CartChangeRow | undefined;
  return { adjusted: Boolean(row?.adjusted), outOfStock: Boolean(row?.out_of_stock) };
}

async function readCart(context: AuthedSupabase): Promise<CartItem[]> {
  const { data, error } = await context.supabase
    .from("cart_items")
    .select("product_id, quantity, created_at")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[cart] read failed", { message: error.message, code: error.code });
    throw new Error("CART_READ_FAILED");
  }
  return ((data ?? []) as { product_id: string; quantity: number }[]).map((row) => ({
    productId: row.product_id,
    quantity: row.quantity,
  }));
}

export const getCart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CartResult> => ({
    items: await readCart(context),
    adjusted: false,
  }));

const itemInput = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

export const addCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => itemInput.parse(data))
  .handler(async ({ data, context }): Promise<CartResult> => {
    const result = await applyCartChange(context, data.productId, data.quantity, "add");
    if (result.outOfStock) throw new Error("OUT_OF_STOCK");
    return { items: await readCart(context), adjusted: result.adjusted };
  });

export const setCartQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ productId: z.string().uuid(), quantity: z.number().int().min(0).max(MAX_QUANTITY) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<CartResult> => {
    const result = await applyCartChange(context, data.productId, data.quantity, "set");
    return { items: await readCart(context), adjusted: result.adjusted || result.outOfStock };
  });

export const removeCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<CartResult> => {
    const { error } = await context.supabase
      .from("cart_items")
      .delete()
      .eq("user_id", context.userId)
      .eq("product_id", data.productId);
    if (error) {
      console.error("[cart] remove failed", { message: error.message, code: error.code });
      throw new Error("CART_UPDATE_FAILED");
    }
    return { items: await readCart(context), adjusted: false };
  });

/** Moves a guest (session-only) cart into the saved cart after sign-in. */
export const mergeGuestCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ items: z.array(itemInput).max(50) }).parse(data))
  .handler(async ({ data, context }): Promise<CartResult> => {
    let adjusted = false;
    for (const item of data.items) {
      const result = await applyCartChange(context, item.productId, item.quantity, "add");
      if (result.adjusted || result.outOfStock) adjusted = true;
    }
    return { items: await readCart(context), adjusted };
  });
