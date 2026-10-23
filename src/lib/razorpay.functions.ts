import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 5B Part 2B — Razorpay TEST MODE order creation only.
 *
 * This creates (or re-uses) a Razorpay order for an existing local pending
 * order. It never marks anything paid, never touches inventory, and never
 * accepts an amount from the browser: the amount is read from the local order
 * row after verifying it belongs to the signed-in customer.
 *
 * The Razorpay key secret is only read inside this handler from the server
 * environment and is never returned or logged.
 */

export type StartPaymentResult =
  | {
      ok: true;
      razorpayOrderId: string;
      keyId: string;
      amount: number; // paise
      currency: "INR";
      orderNumber: string;
      customerName: string | null;
      customerPhone: string | null;
    }
  | { ok: false; reason: "not_found" | "already_paid" | "approval_required" | "not_configured" | "failed" };

const toPaise = (amount: number) => Math.round(Number(amount) * 100);

export const startRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<StartPaymentResult> => {
    const { supabase, userId } = context;

    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) {
      console.error("[razorpay] missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET");
      return { ok: false, reason: "not_configured" };
    }

    // 1. Ownership + state check through the customer's own session (RLS).
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, user_id, status, payment_status, total_amount, customer_name, customer_phone, delivery_approval_required",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (error) {
      console.error("[razorpay] order read failed", error.message);
      return { ok: false, reason: "failed" };
    }
    if (!order || order.user_id !== userId) return { ok: false, reason: "not_found" };
    if (order.payment_status === "paid") return { ok: false, reason: "already_paid" };
    if (order.status === "cancelled") return { ok: false, reason: "not_found" };
    // Phase 10A — the shop has not confirmed the delivery charge yet, so the
    // order total is not final. No payment attempt may exist for such an order.
    if (order.delivery_approval_required === true) return { ok: false, reason: "approval_required" };

    const amountPaise = toPaise(order.total_amount);
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      console.error("[razorpay] invalid amount for order", order.order_number);
      return { ok: false, reason: "failed" };
    }

    // Privileged client: the payments table is admin-managed by policy, and the
    // caller's ownership has already been verified above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2. Duplicate protection — re-use an existing Razorpay order.
    const existing = await supabaseAdmin
      .from("payments")
      .select("id, provider_order_id, amount, status")
      .eq("order_id", order.id)
      .eq("provider", "razorpay")
      .not("provider_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      console.error("[razorpay] payment lookup failed", existing.error.message);
      return { ok: false, reason: "failed" };
    }

    if (
      existing.data?.provider_order_id &&
      existing.data.status !== "failed" &&
      toPaise(existing.data.amount) === amountPaise
    ) {
      return {
        ok: true,
        razorpayOrderId: existing.data.provider_order_id,
        keyId,
        amount: amountPaise,
        currency: "INR",
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
      };
    }

    // 3. Create the Razorpay order server-side.
    let razorpayOrderId: string;
    try {
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt: order.order_number.slice(0, 40),
          notes: { local_order_id: order.id, order_number: order.order_number },
        }),
      });
      const body = (await response.json()) as { id?: string; error?: { description?: string } };
      if (!response.ok || !body.id) {
        console.error("[razorpay] order creation failed", {
          status: response.status,
          description: body?.error?.description ?? "unknown",
          orderNumber: order.order_number,
        });
        return { ok: false, reason: "failed" };
      }
      razorpayOrderId = body.id;
    } catch (cause) {
      console.error("[razorpay] order creation threw", cause instanceof Error ? cause.message : "unknown");
      return { ok: false, reason: "failed" };
    }

    // 4. Record the attempt. Still unpaid: status stays 'created'.
    const insert = await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: razorpayOrderId,
      amount: order.total_amount,
      status: "created",
      signature_verified: false,
    });
    if (insert.error) {
      console.error("[razorpay] payment record insert failed", insert.error.message);
      return { ok: false, reason: "failed" };
    }

    return {
      ok: true,
      razorpayOrderId,
      keyId,
      amount: amountPaise,
      currency: "INR",
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
    };
  });

/**
 * Phase 5B Part 2C — server-side verification of a completed Razorpay payment.
 *
 * The browser's success handler only forwards identifiers. Nothing it sends is
 * trusted: the Razorpay order id used for the signature is the one this server
 * stored when it created the Razorpay order, the amount comes from the local
 * order row, and the capture state is read back from Razorpay's API.
 */
export type VerifyPaymentResult =
  | { ok: true; state: "paid"; orderNumber: string }
  | { ok: true; state: "pending"; orderNumber: string }
  /** Paid and verified, but the shop could not set the goods aside from stock. */
  | { ok: true; state: "awaiting_stock"; orderNumber: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "invalid_signature"
        | "amount_mismatch"
        | "duplicate_payment"
        | "not_captured"
        | "not_configured"
        | "failed";
    };

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        razorpayPaymentId: z.string().min(4).max(100),
        razorpayOrderId: z.string().min(4).max(100),
        razorpaySignature: z.string().min(16).max(256),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VerifyPaymentResult> => {
    const { supabase, userId } = context;

    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) {
      console.error("[razorpay] verify: missing credentials");
      return { ok: false, reason: "not_configured" };
    }

    // 1. Ownership through the customer's own session (RLS).
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_number, user_id, status, payment_status, total_amount")
      .eq("id", data.orderId)
      .maybeSingle();

    if (error) {
      console.error("[razorpay] verify: order read failed", error.message);
      return { ok: false, reason: "failed" };
    }
    if (!order || order.user_id !== userId) return { ok: false, reason: "not_found" };
    if (order.payment_status === "paid") return { ok: true, state: "paid", orderNumber: order.order_number };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyCheckoutSignature, fetchRazorpayPayment, markOrderPaid, toPaise: paise } = await import(
      "@/lib/razorpay.server"
    );

    // 2. The trusted Razorpay order id is the one stored at creation time.
    const paymentRow = await supabaseAdmin
      .from("payments")
      .select("id, provider_order_id, provider_payment_id, status, amount")
      .eq("order_id", order.id)
      .eq("provider", "razorpay")
      .not("provider_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentRow.error) {
      console.error("[razorpay] verify: payment lookup failed", paymentRow.error.message);
      return { ok: false, reason: "failed" };
    }
    const stored = paymentRow.data;
    if (!stored?.provider_order_id) return { ok: false, reason: "not_found" };
    if (stored.provider_order_id !== data.razorpayOrderId) {
      console.error("[razorpay] verify: browser order id did not match stored order id", order.order_number);
      return { ok: false, reason: "invalid_signature" };
    }

    // 3. Signature check against the stored order id.
    if (
      !verifyCheckoutSignature({
        serverRazorpayOrderId: stored.provider_order_id,
        razorpayPaymentId: data.razorpayPaymentId,
        signature: data.razorpaySignature,
        keySecret,
      })
    ) {
      console.error("[razorpay] verify: signature mismatch", order.order_number);
      return { ok: false, reason: "invalid_signature" };
    }

    // 4. The same Razorpay payment must not be attached to another local order.
    const clash = await supabaseAdmin
      .from("payments")
      .select("id, order_id")
      .eq("provider_payment_id", data.razorpayPaymentId)
      .neq("order_id", order.id)
      .limit(1)
      .maybeSingle();
    if (clash.error) {
      console.error("[razorpay] verify: duplicate check failed", clash.error.message);
      return { ok: false, reason: "failed" };
    }
    if (clash.data) return { ok: false, reason: "duplicate_payment" };

    // 5. Authoritative state from Razorpay itself.
    const remote = await fetchRazorpayPayment(data.razorpayPaymentId, keyId, keySecret);
    if (!remote) return { ok: false, reason: "failed" };

    if (remote.order_id !== stored.provider_order_id) {
      console.error("[razorpay] verify: payment belongs to a different razorpay order", order.order_number);
      return { ok: false, reason: "invalid_signature" };
    }
    if (remote.currency !== "INR" || remote.amount !== paise(order.total_amount)) {
      console.error("[razorpay] verify: amount mismatch", {
        orderNumber: order.order_number,
        expected: paise(order.total_amount),
        received: remote.amount,
      });
      return { ok: false, reason: "amount_mismatch" };
    }

    if (remote.status !== "captured") {
      console.warn("[razorpay] verify: payment not captured yet", {
        orderNumber: order.order_number,
        status: remote.status,
      });
      // Authorised but not captured: leave the order pending; the webhook will
      // confirm it when capture completes.
      return remote.status === "authorized"
        ? { ok: true, state: "pending", orderNumber: order.order_number }
        : { ok: false, reason: "not_captured" };
    }

    const marked = await markOrderPaid(supabaseAdmin, {
      orderId: order.id,
      paymentRowId: stored.id,
      providerPaymentId: remote.id,
      eventReference: null,
      actorUserId: userId,
      source: "checkout_handler",
    });
    if (!marked.ok) return { ok: false, reason: "failed" };

    // The payment is genuinely paid either way. When the goods could not be set
    // aside from stock we never claim fulfilment; the shop resolves it.
    if (marked.inventory === "shortfall" || marked.inventory === "error") {
      return { ok: true, state: "awaiting_stock", orderNumber: order.order_number };
    }

    return { ok: true, state: "paid", orderNumber: order.order_number };
  });
