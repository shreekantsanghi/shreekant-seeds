import { createFileRoute } from "@tanstack/react-router";

/**
 * Phase 5B Part 2C — Razorpay webhook (TEST MODE).
 *
 * Razorpay calls this endpoint directly, so nothing here comes from a signed-in
 * browser. The raw body is verified with HMAC SHA-256 against
 * RAZORPAY_WEBHOOK_SECRET before it is parsed. Deliveries are idempotent: the
 * order is only transitioned once, and the Razorpay event id is stored on the
 * payment row.
 */

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } };
    order?: { entity?: { id?: string } };
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        status?: string;
        notes?: Record<string, string> | unknown[];
      };
    };
  };
};

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"];
        if (!webhookSecret) {
          console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured");
          return new Response("not configured", { status: 500 });
        }

        // Raw body first — never parse before verifying.
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature") ?? "";

        const { verifyWebhookSignature, fetchRazorpayPayment, markOrderPaid, toPaise } = await import(
          "@/lib/razorpay.server"
        );

        if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
          console.error("[razorpay-webhook] invalid signature");
          return new Response("invalid signature", { status: 401 });
        }

        let payload: WebhookPayload;
        try {
          payload = JSON.parse(rawBody) as WebhookPayload;
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        const event = payload.event ?? "";
        const eventId = request.headers.get("x-razorpay-event-id");
        const entity = payload.payload?.payment?.entity;

        // Refund lifecycle. apply_refund_status() only moves a pending refund
        // to a final state once, so duplicate deliveries are no-ops. Stock and
        // delivery status are never touched.
        if (event === "refund.processed" || event === "refund.failed") {
          const refund = payload.payload?.refund?.entity;
          if (!refund?.id || !refund.payment_id || !/^rfnd_[A-Za-z0-9]+$/.test(refund.id)) {
            console.error("[razorpay-webhook] missing refund identifiers", event);
            return new Response("ok", { status: 200 });
          }
          const { refundRowIdFromNotes } = await import("@/lib/razorpay.server");
          const rowId = refundRowIdFromNotes(refund.notes);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Verify the amount against the local reservation before applying.
          const lookup = supabaseAdmin.from("refunds").select("id, amount, razorpay_payment_id");
          const local = await (rowId
            ? lookup.or(`razorpay_refund_id.eq.${refund.id},id.eq.${rowId}`)
            : lookup.eq("razorpay_refund_id", refund.id)
          )
            .limit(1)
            .maybeSingle();
          if (local.error) {
            console.error("[razorpay-webhook] refund lookup failed", local.error.message);
            return new Response("retry", { status: 500 });
          }
          if (!local.data) {
            console.info("[razorpay-webhook] refund not initiated from this store", event);
            return new Response("ok", { status: 200 });
          }
          if (local.data.razorpay_payment_id !== refund.payment_id || toPaise(local.data.amount) !== refund.amount) {
            console.error("[razorpay-webhook] refund does not match local record", event);
            return new Response("ok", { status: 200 });
          }

          const applied = await supabaseAdmin.rpc("apply_refund_status", {
            p_refund_row_id: local.data.id,
            p_razorpay_refund_id: refund.id,
            p_razorpay_payment_id: refund.payment_id,
            p_status: event === "refund.processed" ? "processed" : "failed",
            p_event_id: eventId,
            p_failure_reason: event === "refund.failed" ? "Razorpay reported the refund as failed" : null,
            p_source: "razorpay_webhook",
          } as never);
          if (applied.error) {
            console.error("[razorpay-webhook] refund apply failed", applied.error.message);
            return new Response("retry", { status: 500 });
          }
          return new Response("ok", { status: 200 });
        }

        // A failed attempt only marks the payment row failed. It never touches
        // the order, stock or cart; the existing DB trigger sends the one-per-
        // order "payment failed" notification/email.
        if (event === "payment.failed") {
          if (!entity?.id || !entity.order_id) {
            console.error("[razorpay-webhook] missing payment identifiers", event);
            return new Response("ok", { status: 200 });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const row = await supabaseAdmin
            .from("payments")
            .select("id, order_id, status, raw_event_reference")
            .eq("provider", "razorpay")
            .eq("provider_order_id", entity.order_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (row.error) {
            console.error("[razorpay-webhook] payment lookup failed", row.error.message);
            return new Response("retry", { status: 500 });
          }
          if (!row.data) return new Response("ok", { status: 200 });
          if (eventId && row.data.raw_event_reference === eventId) {
            return new Response("duplicate", { status: 200 });
          }
          // Paid is final: a late failure never overrides it.
          if (row.data.status === "paid" || row.data.status === "failed") {
            return new Response("ok", { status: 200 });
          }
          const order = await supabaseAdmin
            .from("orders")
            .select("payment_status")
            .eq("id", row.data.order_id)
            .maybeSingle();
          if (order.error) {
            console.error("[razorpay-webhook] order lookup failed", order.error.message);
            return new Response("retry", { status: 500 });
          }
          if (!order.data || order.data.payment_status === "paid") {
            return new Response("ok", { status: 200 });
          }
          // Conditional on the row not being paid/failed, so a concurrent
          // capture that lands first always wins.
          const update = await supabaseAdmin
            .from("payments")
            .update({
              status: "failed",
              provider_payment_id: entity.id,
              ...(eventId ? { raw_event_reference: eventId } : {}),
            })
            .eq("id", row.data.id)
            .not("status", "in", "(paid,failed)");
          if (update.error) {
            console.error("[razorpay-webhook] failed-status update failed", update.error.message);
            return new Response("retry", { status: 500 });
          }
          return new Response("ok", { status: 200 });
        }

        // Only successful one-time payment events move money forward.
        if (event !== "payment.captured" && event !== "order.paid") {
          console.info("[razorpay-webhook] ignored event", event);
          return new Response("ignored", { status: 200 });
        }
        if (!entity?.id || !entity.order_id) {
          console.error("[razorpay-webhook] missing payment identifiers", event);
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const paymentRow = await supabaseAdmin
          .from("payments")
          .select("id, order_id, status, raw_event_reference, provider_payment_id")
          .eq("provider", "razorpay")
          .eq("provider_order_id", entity.order_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (paymentRow.error) {
          console.error("[razorpay-webhook] payment lookup failed", paymentRow.error.message);
          return new Response("retry", { status: 500 });
        }
        if (!paymentRow.data) {
          console.error("[razorpay-webhook] no local payment for razorpay order");
          return new Response("ok", { status: 200 });
        }

        // Duplicate delivery of the same event, or an already confirmed payment.
        if (eventId && paymentRow.data.raw_event_reference === eventId) {
          return new Response("duplicate", { status: 200 });
        }
        if (
          paymentRow.data.status === "paid" &&
          paymentRow.data.provider_payment_id &&
          paymentRow.data.provider_payment_id !== entity.id
        ) {
          console.error("[razorpay-webhook] different payment for an already paid order");
          return new Response("ok", { status: 200 });
        }

        const order = await supabaseAdmin
          .from("orders")
          .select("id, order_number, total_amount, payment_status")
          .eq("id", paymentRow.data.order_id)
          .maybeSingle();

        if (order.error || !order.data) {
          console.error("[razorpay-webhook] order lookup failed", order.error?.message ?? "missing");
          return new Response("ok", { status: 200 });
        }

        const keyId = process.env["RAZORPAY_KEY_ID"];
        const keySecret = process.env["RAZORPAY_KEY_SECRET"];
        if (!keyId || !keySecret) {
          console.error("[razorpay-webhook] missing razorpay credentials");
          return new Response("retry", { status: 500 });
        }

        // Read the payment back from Razorpay rather than trusting the payload.
        const remote = await fetchRazorpayPayment(entity.id, keyId, keySecret);
        if (!remote) return new Response("retry", { status: 500 });

        if (remote.order_id !== entity.order_id || remote.status !== "captured") {
          console.error("[razorpay-webhook] payment not captured", { status: remote.status });
          return new Response("ok", { status: 200 });
        }
        if (remote.currency !== "INR" || remote.amount !== toPaise(order.data.total_amount)) {
          console.error("[razorpay-webhook] amount mismatch", {
            orderNumber: order.data.order_number,
            expected: toPaise(order.data.total_amount),
            received: remote.amount,
          });
          return new Response("ok", { status: 200 });
        }

        const marked = await markOrderPaid(supabaseAdmin, {
          orderId: order.data.id,
          paymentRowId: paymentRow.data.id,
          providerPaymentId: remote.id,
          eventReference: eventId,
          actorUserId: null,
          source: "webhook",
        });
        if (!marked.ok) return new Response("retry", { status: 500 });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
