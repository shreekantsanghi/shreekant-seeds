import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 5B Part 2A — secure order foundation.
 *
 * Order creation happens entirely inside the database routine
 * `create_pending_order`, which re-reads the signed-in customer, their cart,
 * live product prices and availability, their own saved address, the
 * merchant-confirmed distance, the current delivery rules and GST rates, and
 * calculates every amount itself. Nothing the browser sends is trusted except
 * which of the customer's own addresses to use, and an idempotency key that
 * prevents repeated clicks from creating duplicate orders.
 *
 * No payment is created, no inventory is deducted or reserved.
 */

type FailureReason =
  | "stock_changed"
  | "delivery_not_confirmed"
  | "cart_empty"
  | "address_invalid"
  | "minimum_not_met"
  | "location_required"
  | "failed";

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      totalAmount: number;
      /** True when the shop must confirm the delivery charge before payment. */
      deliveryApprovalRequired: boolean;
    }
  | { ok: false; reason: FailureReason };

const REASONS: Record<string, FailureReason> = {

  STOCK_CHANGED: "stock_changed",
  DELIVERY_NOT_CONFIRMED: "delivery_not_confirmed",
  CART_EMPTY: "cart_empty",
  ADDRESS_NOT_FOUND: "address_invalid",
  MINIMUM_ORDER_NOT_MET: "minimum_not_met",
};

export const placePendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        addressId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(100),
        /** Phase 14 extension — the exact location snapshot the customer used, if any. */
        locationSnapshotId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PlaceOrderResult> => {
    const { supabase, userId } = context;

    // A valid delivery location (current, or reused last location) is required
    // for every new order. Checked on the server so it cannot be skipped.
    if (!data.locationSnapshotId) return { ok: false, reason: "location_required" };
    {
      const { isValidOrderLocation } = await import("@/lib/geo-location.server");
      const valid = await isValidOrderLocation({ snapshotId: data.locationSnapshotId, userId, addressId: data.addressId });
      if (!valid) return { ok: false, reason: "location_required" };
    }

    const { data: result, error } = await supabase.rpc("create_pending_order", {
      p_address_id: data.addressId,
      p_idempotency_key: data.idempotencyKey,
    });

    if (error) {
      const message = error.message ?? "";
      const matched = Object.keys(REASONS).find((key) => message.includes(key));
      if (matched) return { ok: false, reason: REASONS[matched]! };
      console.error("[order] create_pending_order failed", message);
      return { ok: false, reason: "failed" };
    }

    const row = (Array.isArray(result) ? result[0] : result) as
      | { order_id: string; order_number: string; total_amount: number; delivery_approval_required?: boolean }
      | undefined;
    if (!row) return { ok: false, reason: "failed" };

    // Phase 14 extension: attach EXACTLY the snapshot the customer used. Best
    // effort only — a failure here is logged and never breaks order creation.
    if (data.locationSnapshotId) {
      const { attachDeliveryLocationToOrder } = await import("@/lib/geo-location.server");
      await attachDeliveryLocationToOrder({
        snapshotId: data.locationSnapshotId,
        userId,
        addressId: data.addressId,
        orderId: row.order_id,
      });
    }

    return {
      ok: true,
      orderId: row.order_id,
      orderNumber: row.order_number,
      totalAmount: Number(row.total_amount),
      deliveryApprovalRequired: row.delivery_approval_required === true,
    };
  });
