import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-catalog.functions";

/**
 * Merchant-initiated Razorpay refunds (backend only, no UI yet).
 *
 * Flow: merchant + MFA check → reserve_refund() locks the payment and reserves
 * the amount → Razorpay refund API with the stored payment id → Razorpay
 * refund id saved, refund stays `pending` → the refund webhook sets the final
 * state. Stock and delivery status are never touched.
 */

export type MerchantRefundResult =
  | { ok: true; refundId: string; status: "pending" | "processed" | "failed"; amount: number; razorpayRefundId: string | null }
  | { ok: false; code: string; remaining?: number };

const inputSchema = z.object({
  orderId: z.string().uuid(),
  /** Rupees. Omit (or null) for a full refund of the remaining amount. */
  amount: z.number().positive().max(10_000_000).multipleOf(0.01).nullable().optional(),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const issueMerchantRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MerchantRefundResult> => {
    // Same merchant + MFA gate as every other merchant action.
    await assertAdmin(context);

    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) return { ok: false, code: "NOT_CONFIGURED" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createRazorpayRefund, listRazorpayRefunds, refundRowIdFromNotes, toPaise } = await import(
      "@/lib/razorpay.server"
    );

    // 1. Reserve. The payment id comes from the database, never the browser.
    const reserved = await supabaseAdmin.rpc("reserve_refund", {
      p_order_id: data.orderId,
      p_amount: data.amount ?? null,
      p_idempotency_key: data.idempotencyKey,
      p_actor: context.userId,
      p_reason: data.reason ?? null,
    } as never);
    if (reserved.error) {
      console.error("[refund] reservation failed", reserved.error.message);
      return { ok: false, code: "RESERVATION_FAILED" };
    }
    const row = (Array.isArray(reserved.data) ? reserved.data[0] : reserved.data) as
      | {
          result: string;
          refund_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_refund_id: string | null;
          refund_status: string | null;
          amount: number | null;
          remaining: number | null;
        }
      | undefined;

    if (!row || (row.result !== "reserved" && row.result !== "existing")) {
      const code = (row?.result ?? "unknown").toUpperCase();
      return { ok: false, code, ...(row?.remaining != null ? { remaining: Number(row.remaining) } : {}) };
    }

    const refundId = row.refund_id!;
    const paymentId = row.razorpay_payment_id!;
    const amount = Number(row.amount);

    // 2. Retry of a request that already has a Razorpay refund or a final state.
    if (row.result === "existing" && (row.razorpay_refund_id || row.refund_status !== "pending")) {
      return {
        ok: true,
        refundId,
        status: (row.refund_status as "pending" | "processed" | "failed") ?? "pending",
        amount,
        razorpayRefundId: row.razorpay_refund_id,
      };
    }

    // 3. A pending row with no Razorpay id may mean an earlier call reached
    //    Razorpay but the response was lost. Look it up before sending again.
    if (row.result === "existing") {
      const known = await listRazorpayRefunds(paymentId, keyId, keySecret);
      if (known === null) return { ok: true, refundId, status: "pending", amount, razorpayRefundId: null };
      const match = known.find((r) => refundRowIdFromNotes(r.notes) === refundId);
      if (match) {
        await supabaseAdmin.rpc("attach_razorpay_refund_id", {
          p_refund_row_id: refundId,
          p_razorpay_refund_id: match.id,
          p_razorpay_status: match.status,
        } as never);
        return { ok: true, refundId, status: "pending", amount, razorpayRefundId: match.id };
      }
    }

    // 4. Send to Razorpay.
    const call = await createRazorpayRefund({
      paymentId,
      amountPaise: toPaise(amount),
      refundRowId: refundId,
      keyId,
      keySecret,
    });

    if (call.kind === "created") {
      const attach = await supabaseAdmin.rpc("attach_razorpay_refund_id", {
        p_refund_row_id: refundId,
        p_razorpay_refund_id: call.refund.id,
        p_razorpay_status: call.refund.status,
      } as never);
      if (attach.error) console.error("[refund] could not save razorpay refund id", attach.error.message);
      await supabaseAdmin.from("audit_logs").insert({
        action: "refund_submitted",
        entity_type: "order",
        entity_id: data.orderId,
        actor_user_id: context.userId,
        metadata: { refund_id: refundId, razorpay_refund_id: call.refund.id, amount, razorpay_status: call.refund.status },
      });
      // Still pending: only the webhook marks it processed.
      return { ok: true, refundId, status: "pending", amount, razorpayRefundId: call.refund.id };
    }

    if (call.kind === "rejected") {
      // Definitive rejection: release the reservation. Payment/order untouched.
      await supabaseAdmin.rpc("apply_refund_status", {
        p_refund_row_id: refundId,
        p_razorpay_refund_id: null,
        p_razorpay_payment_id: paymentId,
        p_status: "failed",
        p_event_id: null,
        p_failure_reason: call.reason,
        p_source: "merchant_request",
      } as never);
      return { ok: false, code: "RAZORPAY_REJECTED" };
    }

    // Ambiguous: keep the reservation pending; never send a second refund here.
    console.error("[refund] ambiguous razorpay response", call.reason);
    await supabaseAdmin.from("audit_logs").insert({
      action: "refund_submission_unconfirmed",
      entity_type: "order",
      entity_id: data.orderId,
      actor_user_id: context.userId,
      metadata: { refund_id: refundId, amount, reason: call.reason },
    });
    return { ok: true, refundId, status: "pending", amount, razorpayRefundId: null };
  });
