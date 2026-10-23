import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Runtime configuration and manual controls for web push delivery.
 *
 * The dispatch address is never hard-coded: the running deployment records its
 * own origin. A production origin always wins, and a preview origin is only
 * kept while no production deployment has registered itself, so opening the
 * preview can never divert live pushes.
 */

function isPreviewOrigin(host: string): boolean {
  return (
    host.includes("localhost") ||
    host.startsWith("127.0.0.1")
  );
}

export const syncPushDispatchEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; scope?: "production" | "preview" }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const request = getRequest();
    let origin: string;
    try {
      origin = new URL(request.url).origin;
    } catch {
      return { ok: false };
    }
    const host = new URL(origin).host;
    const endpoint = `${origin}/api/public/push-dispatch`;
    const preview = isPreviewOrigin(host);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    const patch = preview ? { preview_endpoint_url: endpoint } : { endpoint_url: endpoint };
    const { error } = await db
      .from("push_dispatch_config")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) {
      console.error("[push] endpoint sync failed", error.message);
      return { ok: false };
    }
    return { ok: true, scope: preview ? "preview" : "production" };
  });

/** Manual drain — a safety net if the database call could not reach the app. */
export const drainPushQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");
    const { dispatchQueuedPushes } = await import("@/lib/push-dispatch.server");
    return dispatchQueuedPushes(20);
  });

/** Sends a test push to the caller's own registered browsers only. */
export const sendPushTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ audience: z.enum(["customer", "merchant"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const { sendTestPush } = await import("@/lib/push-dispatch.server");
    return sendTestPush(context.userId, data.audience);
  });
