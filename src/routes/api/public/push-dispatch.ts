import { createFileRoute } from "@tanstack/react-router";

/**
 * Web push dispatch endpoint.
 *
 * Called by the database (pg_net) right after a push-eligible notification is
 * stored, and callable by an external scheduler as a safety net. The caller is
 * verified against the secret held in push_dispatch_config — no signed-in
 * browser can reach this.
 *
 * It always answers 200 once the caller is verified: push problems must never
 * make the database call look like a failure.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented = request.headers.get("x-push-secret") ?? "";
        if (!presented) return new Response("unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as {
          from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
        };

        const config = await db.from("push_dispatch_config").select("shared_secret").maybeSingle();
        const expected: string | undefined = config.data?.shared_secret;
        if (!expected || !timingSafeEqual(presented, expected)) {
          return new Response("unauthorized", { status: 401 });
        }

        try {
          const { dispatchQueuedPushes } = await import("@/lib/push-dispatch.server");
          const summary = await dispatchQueuedPushes(20);
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          console.error("[push-dispatch] failed", error instanceof Error ? error.message : error);
          return Response.json({ ok: false }, { status: 200 });
        }
      },
    },
  },
});
