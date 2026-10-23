import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type ProductMeta = { name: string; description: string; image: string | null; url: string };

/**
 * Public, read-only product data for link previews (WhatsApp, social). Uses the
 * publishable key, so the same RLS that lets shoppers browse active products applies.
 */
export const getProductMeta = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }): Promise<ProductMeta | null> => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return null;
    try {
      const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const isUuid = /^[0-9a-f-]{36}$/i.test(data.id);
      const { data: row } = await supabase
        .from("products")
        .select("id, name, description, primary_image_url")
        .eq("is_active", true)
        .eq(isUuid ? "id" : "slug", data.id)
        .maybeSingle();
      if (!row) return null;
      const site = (process.env["SITE_URL"] ?? "https://shreekantseeds.in").replace(/\/+$/, "");
      const image = row.primary_image_url && /^https:\/\//.test(row.primary_image_url) ? row.primary_image_url : null;
      return { name: row.name, description: (row.description ?? "").slice(0, 200), image, url: `${site}/products/${data.id}` };
    } catch {
      return null;
    }
  });
