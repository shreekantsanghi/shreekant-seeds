import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminSupabase, isMerchantSurface } from "@/integrations/supabase/admin-client";

/**
 * Attaches the current Supabase access token to every server-function call so
 * that requireSupabaseAuth can validate the caller server-side.
 *
 * Merchant and customer sessions live in separate storage slots, so the client
 * is chosen by surface: calls made from the merchant workspace use the merchant
 * session, everything else uses the customer session.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const client =
    typeof window !== "undefined" && isMerchantSurface(window.location.pathname) ? adminSupabase : supabase;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return next();
  return next({ headers: { Authorization: `Bearer ${token}` } });
});
