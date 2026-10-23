import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-catalog.functions";
import { toItem } from "@/lib/customer-orders.functions";
import { NEXT_ORDER_STATUS } from "@/lib/orders-shared";
import type { OrderAddressSnapshot, OrderItemSnapshot, OrderTotals } from "@/lib/orders-shared";

/**
 * Phase 5B Part 2E — real merchant orders.
 *
 * Reads run as the signed-in merchant through requireSupabaseAuth plus the
 * existing assertAdmin check, so the is_admin() RLS policies apply. Read-only:
 * no status editing, no inventory change, no payment change.
 */

export type AdminOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
  inventoryFulfilledAt: string | null;
  needsInventoryReview: boolean;
  /** True while the shop still has to confirm this order's delivery charge. */
  deliveryApprovalRequired: boolean;
};

export type AdminOrderPayment = {
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: number;
  status: string;
  signatureVerified: boolean;
  createdAt: string;
};

export type AdminOrderDetailData = OrderTotals & {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: OrderAddressSnapshot | null;
  deliveryDistanceKm: number | null;
  customerNote: string | null;
  inventoryFulfilledAt: string | null;
  needsInventoryReview: boolean;
  deliveryOverrideFree: boolean;
  /** Normal charge kept aside while the override is on; null when it is off. */
  deliveryChargeBase: number | null;
  /** True once any non-failed payment attempt exists — the override is then frozen. */
  hasPaymentAttempt: boolean;
  /** True while the shop still has to confirm this order's delivery charge. */
  deliveryApprovalRequired: boolean;
  /** The saved address this order used, with the shop's reusable decision. */
  addressId: string | null;
  addressDeliveryApproved: boolean;
  addressApprovedCharge: number | null;
  addressApprovedAt: string | null;
  /** The two configured delivery charges the shop may approve (besides FREE). */
  tier1Charge: number;
  tier2Charge: number;
  /** Phase 14 — decision support only: the saved address's road-distance estimate. */
  addressEstimateStatus: string | null;
  addressEstimatedDistanceKm: number | null;
  addressEstimatedDurationMin: number | null;
  addressEstimatedAt: string | null;
  /** Charge the existing tier rules would suggest for the estimate; null when the shop must decide. */
  suggestedDeliveryCharge: number | null;
  /** Phase 14 extension — the customer's one-time location snapshot for this order, if any. */
  gpsDistanceKm: number | null;
  gpsDurationMin: number | null;
  gpsAccuracyM: number | null;
  gpsSource: string | null;
  items: OrderItemSnapshot[];
  payments: AdminOrderPayment[];
  refunds: AdminOrderRefund[];
};

export type AdminOrderRefund = {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  failureReason: string | null;
  razorpayRefundId: string | null;
  createdAt: string;
  processedAt: string | null;
};

const num = (value: number | string | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

const ITEM_COLUMNS =
  "id, product_name, product_name_hi, product_type, pack_size, unit, sku, hsn_code, quantity, unit_price, tax_rate, tax_amount, total_price";

/** True when money was taken but stock was never deducted for this order. */
const needsReview = (paymentStatus: string, fulfilledAt: string | null, status: string) =>
  paymentStatus === "paid" && !fulfilledAt && status !== "cancelled";

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOrderRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total_amount, customer_name, customer_phone, created_at, inventory_fulfilled_at, delivery_approval_required",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      totalAmount: num(row.total_amount),
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      createdAt: row.created_at,
      inventoryFulfilledAt: row.inventory_fulfilled_at,
      needsInventoryReview: needsReview(row.payment_status, row.inventory_fulfilled_at, row.status),
      deliveryApprovalRequired: row.delivery_approval_required === true,
    }));
  });

export const getAdminOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AdminOrderDetailData | null> => {
    await assertAdmin(context);

    const { data: row, error } = await context.supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, created_at, updated_at, customer_name, customer_phone, address_id, delivery_approval_required, delivery_address, delivery_distance_km, customer_note, inventory_fulfilled_at, subtotal, discount_amount, delivery_charge, delivery_override_free, delivery_charge_base, taxable_value, cgst_amount, sgst_amount, igst_amount, tax_amount, total_amount",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;

    const address = row.address_id
      ? await context.supabase
          .from("addresses")
          .select("id, delivery_approved, approved_delivery_charge, delivery_approved_at, estimate_status, estimated_distance_km, estimated_duration_min, estimated_at")
          .eq("id", row.address_id)
          .maybeSingle()
      : { data: null, error: null };
    if (address.error) throw address.error;

    // Phase 14 extension — the location snapshot attached to this exact order.
    const gps = await context.supabase
      .from("delivery_locations")
      .select("distance_km, duration_min, accuracy_m, source, status")
      .eq("order_id", data.orderId)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gps.error) throw gps.error;

    const settings = await context.supabase
      .from("delivery_settings")
      .select("tier1_charge, tier2_charge, tier1_max_km, tier2_max_km")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (settings.error) throw settings.error;

    const [items, payments, refunds] = await Promise.all([
      context.supabase.from("order_items").select(ITEM_COLUMNS).eq("order_id", row.id).order("created_at", { ascending: true }),
      context.supabase
        .from("payments")
        .select("provider, provider_order_id, provider_payment_id, amount, status, signature_verified, created_at")
        .eq("order_id", row.id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("refunds")
        .select("id, amount, status, reason, failure_reason, razorpay_refund_id, created_at, processed_at")
        .eq("order_id", row.id)
        .order("created_at", { ascending: false }),
    ]);
    if (items.error) throw items.error;
    if (payments.error) throw payments.error;
    if (refunds.error) throw refunds.error;

    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      deliveryAddress: (row.delivery_address as OrderAddressSnapshot | null) ?? null,
      deliveryDistanceKm: row.delivery_distance_km === null ? null : Number(row.delivery_distance_km),
      customerNote: row.customer_note,
      inventoryFulfilledAt: row.inventory_fulfilled_at,
      needsInventoryReview: needsReview(row.payment_status, row.inventory_fulfilled_at, row.status),
      deliveryOverrideFree: row.delivery_override_free,
      deliveryChargeBase: row.delivery_charge_base === null ? null : Number(row.delivery_charge_base),
      hasPaymentAttempt: (payments.data ?? []).some((p) => p.status !== "failed"),
      deliveryApprovalRequired: row.delivery_approval_required === true,
      addressId: row.address_id,
      addressDeliveryApproved: address.data?.delivery_approved === true,
      addressApprovedCharge:
        address.data?.delivery_approved === true && address.data?.approved_delivery_charge !== null
          ? Number(address.data?.approved_delivery_charge)
          : null,
      addressApprovedAt: address.data?.delivery_approved === true ? (address.data?.delivery_approved_at ?? null) : null,
      tier1Charge: num(settings.data?.tier1_charge ?? 30),
      tier2Charge: num(settings.data?.tier2_charge ?? 50),
      addressEstimateStatus: address.data?.estimate_status ?? null,
      addressEstimatedDistanceKm:
        address.data?.estimated_distance_km === null || address.data?.estimated_distance_km === undefined
          ? null
          : Number(address.data.estimated_distance_km),
      addressEstimatedDurationMin:
        address.data?.estimated_duration_min === null || address.data?.estimated_duration_min === undefined
          ? null
          : Number(address.data.estimated_duration_min),
      addressEstimatedAt: address.data?.estimated_at ?? null,
      suggestedDeliveryCharge: (() => {
        if (address.data?.estimate_status !== "ok" || address.data?.estimated_distance_km === null || address.data?.estimated_distance_km === undefined || !settings.data) {
          return null;
        }
        const distance = Number(address.data.estimated_distance_km);
        return distance <= num(settings.data.tier1_max_km) ? num(settings.data.tier1_charge) : num(settings.data.tier2_charge);
      })(),
      gpsDistanceKm: gps.data?.distance_km === null || gps.data?.distance_km === undefined ? null : Number(gps.data.distance_km),
      gpsDurationMin: gps.data?.duration_min === null || gps.data?.duration_min === undefined ? null : Number(gps.data.duration_min),
      gpsAccuracyM: gps.data?.accuracy_m === null || gps.data?.accuracy_m === undefined ? null : Number(gps.data.accuracy_m),
      gpsSource: gps.data?.source ?? null,
      subtotal: num(row.subtotal),
      discountAmount: num(row.discount_amount),
      deliveryCharge: num(row.delivery_charge),
      taxableValue: num(row.taxable_value),
      cgstAmount: num(row.cgst_amount),
      sgstAmount: num(row.sgst_amount),
      igstAmount: num(row.igst_amount),
      taxAmount: num(row.tax_amount),
      totalAmount: num(row.total_amount),
      items: ((items.data ?? []) as Parameters<typeof toItem>[0][]).map(toItem),
      payments: (payments.data ?? []).map((p) => ({
        provider: p.provider,
        providerOrderId: p.provider_order_id,
        providerPaymentId: p.provider_payment_id,
        amount: num(p.amount),
        status: p.status,
        signatureVerified: p.signature_verified,
        createdAt: p.created_at,
      })),
      refunds: (refunds.data ?? []).map((r) => ({
        id: r.id,
        amount: num(r.amount),
        status: r.status,
        reason: r.reason,
        failureReason: r.failure_reason,
        razorpayRefundId: r.razorpay_refund_id,
        createdAt: r.created_at,
        processedAt: r.processed_at,
      })),
    };
  });

const STATUS_VALUES = [
  "pending",
  "confirmed",
  "processing",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type UpdateOrderStatusResult = { ok: true; status: string } | { ok: false; code: string };

/**
 * Phase 8 — merchant status change.
 *
 * All authority lives in the database routine `set_order_status`: it re-checks
 * is_admin(), locks the order, validates the transition, enforces payment and
 * inventory rules and writes the audit entry. The browser is never trusted.
 */
export const updateAdminOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), status: z.enum(STATUS_VALUES) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<UpdateOrderStatusResult> => {
    await assertAdmin(context);

    const { data: result, error } = await context.supabase.rpc("set_order_status", {
      p_order_id: data.orderId,
      p_status: data.status,
    });

    if (error) {
      const known = STATUS_ERROR_CODES.find((code) => error.message.includes(code));
      return { ok: false, code: known ?? "UNKNOWN" };
    }
    return { ok: true, status: (result as string) ?? data.status };
  });

const STATUS_ERROR_CODES = [
  "PAYMENT_NOT_CONFIRMED",
  "INVENTORY_NOT_FULFILLED",
  "INVALID_TRANSITION",
  "ORDER_ALREADY_DELIVERED",
  "ORDER_CANCELLED",
  "CANCEL_NOT_ALLOWED",
  "CANCEL_BLOCKED_INVENTORY",
  "DELIVERY_CONFIRMATION_REQUIRED",
  "ORDER_NOT_FOUND",
  "FORBIDDEN",
  "NOT_AUTHENTICATED",
];

export type DeliveryOverrideResult =
  | { ok: true; deliveryCharge: number; totalAmount: number; overrideFree: boolean }
  | { ok: false; code: string };

/**
 * Phase 10 — merchant free-delivery override.
 *
 * All authority lives in the database routine `set_order_delivery_override`:
 * it re-checks is_admin(), locks the order, refuses cancelled or paid orders
 * and refuses any order that already has a payment attempt, then recomputes
 * the total. The browser never supplies an amount.
 */
export const setAdminDeliveryOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid(), free: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<DeliveryOverrideResult> => {
    await assertAdmin(context);

    const { data: result, error } = await context.supabase.rpc("set_order_delivery_override", {
      p_order_id: data.orderId,
      p_free: data.free,
    });

    if (error) {
      const known = OVERRIDE_ERROR_CODES.find((code) => error.message.includes(code));
      return { ok: false, code: known ?? "UNKNOWN" };
    }
    const row = (Array.isArray(result) ? result[0] : result) as
      | { delivery_charge: number | string; total_amount: number | string; override_free: boolean }
      | undefined;
    return {
      ok: true,
      deliveryCharge: num(row?.delivery_charge),
      totalAmount: num(row?.total_amount),
      overrideFree: row?.override_free ?? data.free,
    };
  });

const OVERRIDE_ERROR_CODES = [
  "PAYMENT_ALREADY_STARTED",
  "ORDER_CANCELLED",
  "ORDER_NOT_FOUND",
  "FORBIDDEN",
  "NOT_AUTHENTICATED",
];

export type AddressApprovalResult =
  | { ok: true; approved: boolean; charge: number | null; ordersUpdated: number }
  | { ok: false; code: string };

/**
 * Phase 10A — the shop's reusable delivery decision for one saved address.
 *
 * All authority lives in the database routine `set_address_delivery_approval`:
 * it re-checks is_admin(), accepts only FREE / the two configured charges, and
 * fills in the charge only for orders that are still waiting for it, unpaid and
 * without a payment attempt. Withdrawing an approval never changes an existing
 * order — it only affects future orders from that address.
 */
export const setAddressDeliveryApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        addressId: z.string().uuid(),
        approved: z.boolean(),
        charge: z.number().nonnegative().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AddressApprovalResult> => {
    await assertAdmin(context);

    const args =
      data.approved && typeof data.charge === "number"
        ? { p_address_id: data.addressId, p_approved: true, p_charge: data.charge }
        : { p_address_id: data.addressId, p_approved: data.approved };
    const { data: result, error } = await context.supabase.rpc("set_address_delivery_approval", args);

    if (error) {
      const known = APPROVAL_ERROR_CODES.find((code) => error.message.includes(code));
      return { ok: false, code: known ?? "UNKNOWN" };
    }
    const row = (Array.isArray(result) ? result[0] : result) as
      | { approved: boolean; charge: number | string | null; orders_updated: number }
      | undefined;
    return {
      ok: true,
      approved: row?.approved ?? data.approved,
      charge: row?.charge === null || row?.charge === undefined ? null : Number(row.charge),
      ordersUpdated: row?.orders_updated ?? 0,
    };
  });

const APPROVAL_ERROR_CODES = [
  "INVALID_CHARGE",
  "ADDRESS_NOT_FOUND",
  "DELIVERY_SETTINGS_MISSING",
  "FORBIDDEN",
  "NOT_AUTHENTICATED",
];

/**
 * Step 2 — real merchant dashboard summary.
 *
 * One authorized read for the four dashboard tiles. Runs as the signed-in
 * merchant through requireSupabaseAuth + assertAdmin, so the existing
 * is_admin() RLS policies apply. No service-role key, no new table.
 */
export type AdminDashboardStats = {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  lowStock: number;
};

/** Start of today in shop local time (IST), as an ISO instant. */
const istDayStartIso = (): string => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const startIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
  return new Date(startIst - IST_OFFSET_MS).toISOString();
};

export const getAdminDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboardStats> => {
    await assertAdmin(context);
    const since = istDayStartIso();

    const [todayRes, pendingRes, stockRes] = await Promise.all([
      context.supabase
        .from("orders")
        .select("total_amount, payment_status, status")
        .gte("created_at", since),
      context.supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", Object.keys(NEXT_ORDER_STATUS) as ("pending" | "confirmed" | "processing" | "ready_for_delivery")[]),
      context.supabase.from("inventory").select("quantity, low_stock_threshold"),
    ]);
    if (todayRes.error) throw todayRes.error;
    if (pendingRes.error) throw pendingRes.error;
    if (stockRes.error) throw stockRes.error;

    const todayRows = todayRes.data ?? [];
    return {
      todayOrders: todayRows.length,
      // Authoritative stored order total (GST inclusive); paid, non-cancelled only.
      todayRevenue: todayRows
        .filter((r) => r.payment_status === "paid" && r.status !== "cancelled")
        .reduce((sum, r) => sum + num(r.total_amount), 0),
      pendingOrders: pendingRes.count ?? 0,
      // Same definition as Reports: in stock but at or below the threshold (zero stock is not low stock).
      lowStock: (stockRes.data ?? []).filter((r) => num(r.quantity) > 0 && num(r.quantity) <= num(r.low_stock_threshold)).length,
    };
  });

/**
 * Step 3 — current delivery-approval requests for the merchant dashboard.
 *
 * Same authorization pattern as the other merchant reads (requireSupabaseAuth +
 * assertAdmin, is_admin() RLS applies). Reuses the existing approval flag,
 * address estimate, GPS snapshot and delivery settings — no new approval path.
 */
export type AdminDeliveryApprovalRequest = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  createdAt: string;
  address: OrderAddressSnapshot | null;
  estimateStatus: string | null;
  estimateDistanceKm: number | null;
  estimateDurationMin: number | null;
  gpsDistanceKm: number | null;
  gpsDurationMin: number | null;
  gpsAccuracyM: number | null;
  suggestedDeliveryCharge: number | null;
};

export const listAdminDeliveryApprovalRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDeliveryApprovalRequest[]> => {
    await assertAdmin(context);

    const { data: orders, error } = await context.supabase
      .from("orders")
      .select("id, order_number, customer_name, created_at, address_id, delivery_address")
      .eq("delivery_approval_required", true)
      .not("status", "in", '("delivered","cancelled")')
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = orders ?? [];
    if (rows.length === 0) return [];

    const orderIds = rows.map((r) => r.id);
    const addressIds = [...new Set(rows.map((r) => r.address_id).filter((v): v is string => Boolean(v)))];

    const [addressRes, gpsRes, settingsRes] = await Promise.all([
      addressIds.length
        ? context.supabase
            .from("addresses")
            .select("id, estimate_status, estimated_distance_km, estimated_duration_min")
            .in("id", addressIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase
        .from("delivery_locations")
        .select("order_id, distance_km, duration_min, accuracy_m")
        .in("order_id", orderIds)
        .eq("status", "ok"),
      context.supabase
        .from("delivery_settings")
        .select("tier1_charge, tier2_charge, tier1_max_km")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (addressRes.error) throw addressRes.error;
    if (gpsRes.error) throw gpsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const addressById = new Map((addressRes.data ?? []).map((a) => [a.id, a]));
    const gpsByOrder = new Map((gpsRes.data ?? []).map((g) => [g.order_id, g]));
    const settings = settingsRes.data;

    return rows.map((row) => {
      const address = row.address_id ? addressById.get(row.address_id) : undefined;
      const estimateOk =
        address?.estimate_status === "ok" &&
        address.estimated_distance_km !== null &&
        address.estimated_distance_km !== undefined;
      const gps = gpsByOrder.get(row.id);
      return {
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        createdAt: row.created_at,
        address: (row.delivery_address as OrderAddressSnapshot | null) ?? null,
        estimateStatus: address?.estimate_status ?? null,
        estimateDistanceKm: estimateOk ? Number(address!.estimated_distance_km) : null,
        estimateDurationMin:
          estimateOk && address!.estimated_duration_min !== null && address!.estimated_duration_min !== undefined
            ? Number(address!.estimated_duration_min)
            : null,
        gpsDistanceKm: gps && gps.distance_km !== null && gps.distance_km !== undefined ? Number(gps.distance_km) : null,
        gpsDurationMin: gps && gps.duration_min !== null && gps.duration_min !== undefined ? Number(gps.duration_min) : null,
        gpsAccuracyM: gps && gps.accuracy_m !== null && gps.accuracy_m !== undefined ? Number(gps.accuracy_m) : null,
        suggestedDeliveryCharge:
          estimateOk && settings
            ? Number(address!.estimated_distance_km) <= num(settings.tier1_max_km)
              ? num(settings.tier1_charge)
              : num(settings.tier2_charge)
            : null,
      };
    });
  });
