/**
 * Phase 12 — provider-agnostic email sender.
 *
 * Server-only. No provider is configured yet: Phase 20 will supply real
 * credentials. Until then `sendEmail` reports "not_configured" and the caller
 * leaves the message queued — nothing is lost and no attempt is wasted.
 *
 * Credentials are read from the server environment inside the function, never
 * at module scope, and are never returned or logged.
 */

export type SendResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable per-message key (email_outbox.id) so provider retries never duplicate. */
  idempotencyKey?: string;
};

/** True when provider credentials are configured. */
export function isEmailProviderConfigured(): boolean {
  return Boolean(
    process.env["EMAIL_PROVIDER_API_KEY"] &&
      process.env["EMAIL_FROM_ADDRESS"] &&
      process.env["EMAIL_PROVIDER_ENDPOINT"],
  );
}

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  if (!isEmailProviderConfigured()) return { status: "not_configured" };

  const endpoint = process.env["EMAIL_PROVIDER_ENDPOINT"];
  const apiKey = process.env["EMAIL_PROVIDER_API_KEY"]!;
  const from = process.env["EMAIL_FROM_ADDRESS"]!;
  if (!endpoint) return { status: "not_configured" };

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      return { status: "failed", error: `provider responded ${response.status}` };
    }
    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { status: "sent", providerMessageId: body?.id ?? null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "send failed" };
  }
}
