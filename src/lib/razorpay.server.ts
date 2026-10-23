import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Phase 5B Part 2C — server-only Razorpay helpers.
 *
 * Nothing in this file may be imported from browser code: it reads the
 * Razorpay key secret and webhook secret from the server environment. Secrets
 * are never returned to a caller and never logged.
 */

/** Constant-time comparison of two hex signatures. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a ?? "", "utf8");
  const right = Buffer.from(b ?? "", "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key secret).
 * The order id passed here must be the one stored server-side, never the one
 * the browser sent.
 */
export function verifyCheckoutSignature(args: {
  serverRazorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const expected = createHmac("sha256", args.keySecret)
    .update(`${args.serverRazorpayOrderId}|${args.razorpayPaymentId}`)
    .digest("hex");
  return safeEqualHex(expected, args.signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  status: string; // created | authorized | captured | refunded | failed
  amount: number; // paise
  currency: string;
  method?: string;
};

/** Reads the authoritative payment record from Razorpay. */
export async function fetchRazorpayPayment(
  paymentId: string,
  keyId: string,
  keySecret: string,
): Promise<RazorpayPayment | null> {
  try {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
    });
    const body = (await response.json()) as RazorpayPayment & { error?: { description?: string } };
    if (!response.ok || !body?.id) {
      console.error("[razorpay] payment fetch failed", {
        status: response.status,
        description: body?.error?.description ?? "unknown",
      });
      return null;
    }
    return body;
  } catch (cause) {
    console.error("[razorpay] payment fetch threw", cause instanceof Error ? cause.message : "unknown");
    return null;
  }
}

export const toPaise = (amount: number) => Math.round(Number(amount) * 100);

export type RazorpayRefund = {
  id: string;
  payment_id: string;
  amount: number; // paise
  status: string; // pending | processed | failed
  notes?: Record<string, string> | unknown[];
};

export type RefundCallResult =
  | { kind: "created"; refund: RazorpayRefund }
  | { kind: "rejected"; reason: string }
  | { kind: "ambiguous"; reason: string };

const authHeader = (keyId: string, keySecret: string) => `Basic ${btoa(`${keyId}:${keySecret}`)}`;

/**
 * Lists refunds Razorpay already holds for a payment. Used before (re)sending
 * a refund so a lost earlier response never leads to a second refund.
 */
export async function listRazorpayRefunds(
  paymentId: string,
  keyId: string,
  keySecret: string,
): Promise<RazorpayRefund[] | null> {
  try {
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refunds?count=100`,
      { headers: { Authorization: authHeader(keyId, keySecret) } },
    );
    if (!response.ok) {
      console.error("[razorpay] refund list failed", { status: response.status });
      return null;
    }
    const body = (await response.json()) as { items?: RazorpayRefund[] };
    return Array.isArray(body.items) ? body.items : [];
  } catch (cause) {
    console.error("[razorpay] refund list threw", cause instanceof Error ? cause.message : "unknown");
    return null;
  }
}

/**
 * POST /v1/payments/:id/refund. The local refund row id travels in `receipt`
 * and `notes.refund_row_id` so the webhook and retries can match it. A 4xx
 * is a definitive rejection; network errors and 5xx are ambiguous.
 */
export async function createRazorpayRefund(args: {
  paymentId: string;
  amountPaise: number;
  refundRowId: string;
  keyId: string;
  keySecret: string;
}): Promise<RefundCallResult> {
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(args.paymentId)}/refund`, {
      method: "POST",
      headers: { Authorization: authHeader(args.keyId, args.keySecret), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: args.amountPaise,
        speed: "normal",
        receipt: args.refundRowId,
        notes: { refund_row_id: args.refundRowId },
      }),
    });
  } catch (cause) {
    return { kind: "ambiguous", reason: cause instanceof Error ? cause.message : "network error" };
  }

  let body: (RazorpayRefund & { error?: { description?: string; code?: string } }) | null = null;
  try {
    body = (await response.json()) as RazorpayRefund & { error?: { description?: string; code?: string } };
  } catch {
    body = null;
  }

  if (response.ok && body?.id) return { kind: "created", refund: body };
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
    return { kind: "rejected", reason: (body?.error?.description ?? `Razorpay rejected the refund (${response.status})`).slice(0, 300) };
  }
  return { kind: "ambiguous", reason: `Razorpay response ${response.status}` };
}

/** Reads the local refund row id Razorpay echoes back in notes. */
export function refundRowIdFromNotes(notes: RazorpayRefund["notes"]): string | null {
  if (!notes || Array.isArray(notes)) return null;
  const value = (notes as Record<string, unknown>)["refund_row_id"];
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/**
 * Marks a verified payment as paid and confirms the local order. Safe to call
 * more than once (retry, webhook after checkout handler, duplicate delivery):
 * both updates are conditional, and the audit entry is only written when the
 * order actually transitions.
 */
/** Outcome of the authoritative stock deduction performed in the database. */
export type InventoryOutcome = "fulfilled" | "already_fulfilled" | "shortfall" | "not_eligible" | "error";

export async function markOrderPaid(
  admin: AdminClient,
  args: {
    orderId: string;
    paymentRowId: string;
    providerPaymentId: string;
    eventReference: string | null;
    actorUserId: string | null;
    source: "checkout_handler" | "webhook";
  },
): Promise<{ ok: boolean; changed: boolean; inventory: InventoryOutcome }> {
  const paymentUpdate = await admin
    .from("payments")
    .update({
      provider_payment_id: args.providerPaymentId,
      status: "paid",
      signature_verified: true,
      ...(args.eventReference ? { raw_event_reference: args.eventReference } : {}),
    })
    .eq("id", args.paymentRowId)
    .neq("status", "paid");

  if (paymentUpdate.error) {
    console.error("[razorpay] payment row update failed", paymentUpdate.error.message);
    return { ok: false, changed: false, inventory: "error" };
  }

  const orderUpdate = await admin
    .from("orders")
    .update({ payment_status: "paid", status: "confirmed" })
    .eq("id", args.orderId)
    .neq("payment_status", "paid")
    .select("id");

  if (orderUpdate.error) {
    console.error("[razorpay] order update failed", orderUpdate.error.message);
    return { ok: false, changed: false, inventory: "error" };
  }

  const changed = (orderUpdate.data?.length ?? 0) > 0;
  if (changed) {
    const audit = await admin.from("audit_logs").insert({
      action: "payment_verified",
      entity_type: "order",
      entity_id: args.orderId,
      actor_user_id: args.actorUserId,
      metadata: {
        provider: "razorpay",
        provider_payment_id: args.providerPaymentId,
        source: args.source,
        event_reference: args.eventReference,
      },
    });
    if (audit.error) console.error("[razorpay] audit insert failed", audit.error.message);
  }

  // Both payment paths (browser success handler and webhook) converge here, so
  // stock is deducted in exactly one place. The database routine locks the
  // order row and the affected stock rows, so concurrent or repeated calls can
  // never deduct twice and can never drive stock negative.
  const inventory = await fulfillInventory(admin, args.orderId);

  // Cart cleanup runs last and only for a paid order. The database routine
  // locks the order row and stamps cart_cleared_at, so a repeated webhook or a
  // retried browser verification can never subtract the same quantities twice.
  // Called as a direct method on admin so the Supabase client context (this)
  // is preserved. Cast on the arguments only: the routine is newer than the
  // generated database types.
  const cleanup = await admin.rpc("consume_order_cart", { p_order_id: args.orderId } as never);
  if (cleanup.error) console.error("[razorpay] cart cleanup failed", cleanup.error.message);

  return { ok: true, changed, inventory };
}

async function fulfillInventory(admin: AdminClient, orderId: string): Promise<InventoryOutcome> {
  const { data, error } = await admin.rpc("fulfill_order_inventory", { p_order_id: orderId });
  if (error) {
    console.error("[razorpay] inventory fulfilment failed", error.message);
    return "error";
  }
  const row = (Array.isArray(data) ? data[0] : data) as { result?: string } | undefined;
  switch (row?.result) {
    case "fulfilled":
      return "fulfilled";
    case "already_fulfilled":
      return "already_fulfilled";
    case "insufficient_stock":
      console.warn("[razorpay] inventory shortfall for paid order", orderId);
      return "shortfall";
    case "not_eligible":
    case "not_found":
      return "not_eligible";
    default:
      return "error";
  }
}
