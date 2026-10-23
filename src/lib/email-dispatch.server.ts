/**
 * Phase 20 — shared, server-only email dispatch loop.
 *
 * Used by the merchant manual action and the protected cron endpoint.
 * Never returns or logs recipient addresses or credentials.
 */

export type DispatchResult = {
  claimed: number;
  sent: number;
  failed: number;
  released: number;
  recovered: number;
  providerConfigured: boolean;
};

export async function runEmailDispatch(limit = 20): Promise<DispatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { renderEmail } = await import("@/lib/email-templates.server");
  const { sendEmail, isEmailProviderConfigured } = await import("@/lib/email-sender.server");

  const admin = supabaseAdmin as any;
  const providerConfigured = isEmailProviderConfigured();

  // Return rows stuck in "sending" > 10 min to the queue (attempt limit respected; failed rows untouched).
  const { data: recoveredCount } = await admin.rpc("recover_stuck_emails", { p_stale_minutes: 10 });
  const recovered = typeof recoveredCount === "number" ? recoveredCount : 0;

  // Nothing to do without a provider: leave everything queued, burn no attempts.
  if (!providerConfigured) {
    return { claimed: 0, sent: 0, failed: 0, released: 0, recovered, providerConfigured };
  }

  const { data: claimed, error } = await admin.rpc("claim_email_batch", { p_limit: limit });
  if (error) return { claimed: 0, sent: 0, failed: 0, released: 0, recovered, providerConfigured };

  const rows = (claimed ?? []) as Array<{
    id: string;
    recipient_email: string;
    event_type: string;
    payload: Record<string, unknown>;
    order_id: string | null;
    attempts: number;
  }>;

  const siteUrl = process.env["SITE_URL"] ?? "https://shreekantseeds.in";
  let sent = 0;
  let failed = 0;
  let released = 0;

  for (const row of rows) {
    const payload = { ...(row.payload ?? {}), order_id: row.order_id ?? undefined };
    const rendered = renderEmail(row.event_type, payload, siteUrl);

    if (!rendered) {
      await admin
        .from("email_outbox")
        .update({ status: "failed", last_error: `no template for ${row.event_type}` })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    const result = await sendEmail({
      to: row.recipient_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: row.id,
    });

    if (result.status === "sent") {
      await admin
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.providerMessageId,
          last_error: null,
        })
        .eq("id", row.id);
      sent += 1;
    } else if (result.status === "not_configured") {
      await admin
        .from("email_outbox")
        .update({ status: "queued", attempts: Math.max(0, row.attempts - 1), last_error: "provider not configured" })
        .eq("id", row.id);
      released += 1;
    } else {
      await admin
        .from("email_outbox")
        .update({ status: row.attempts >= 5 ? "failed" : "queued", last_error: result.error })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed, released, recovered, providerConfigured };
}
