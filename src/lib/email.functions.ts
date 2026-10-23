import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-catalog.functions";

/**
 * Phase 12 — email dispatch.
 *
 * The queue (public.email_outbox) is written only by database routines that
 * already own the business event, so nothing here decides *whether* an email is
 * owed. This function only drains the queue.
 *
 * Until Phase 20 supplies provider credentials, claimed rows are released back
 * to "queued" with their attempt counter restored: no message is lost or burnt.
 */

export type EmailQueueStatus = {
  providerConfigured: boolean;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
};

export const getEmailQueueStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailQueueStatus> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isEmailProviderConfigured } = await import("@/lib/email-sender.server");

    const { data } = await (supabaseAdmin as any).from("email_outbox").select("status");
    const rows = (data ?? []) as Array<{ status: string }>;
    const count = (status: string) => rows.filter((row) => row.status === status).length;
    return {
      providerConfigured: isEmailProviderConfigured(),
      queued: count("queued"),
      sending: count("sending"),
      sent: count("sent"),
      failed: count("failed"),
    };
  });

export type { DispatchResult } from "@/lib/email-dispatch.server";

export const dispatchQueuedEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runEmailDispatch } = await import("@/lib/email-dispatch.server");
    return runEmailDispatch(data.limit ?? 20);
  });
