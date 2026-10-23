import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-catalog.functions";

/**
 * Reports step — real merchant reports from existing data only.
 *
 * Same authorization as every other merchant read (requireSupabaseAuth +
 * assertAdmin, is_admin() RLS applies, no service key). Reads only existing
 * tables: orders, order_items, products, inventory, profiles. No new tables,
 * no new permissions, no recalculated prices — stored order totals are the
 * authority and they are already GST-inclusive.
 */

const num = (v: number | string | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

/** A refund never removes an order from the paid count. */
const PAID_STATUSES = ["paid", "partially_refunded", "refunded"];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Shop-local (IST) calendar parts for an instant. */
const istParts = (ms: number) => {
  const d = new Date(ms + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
/** An IST wall-clock midnight expressed as a UTC instant. */
const istMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);

const PERIODS = ["today", "week", "month", "quarter", "year", "custom"] as const;
export type ReportPeriod = (typeof PERIODS)[number];

/** Start (inclusive) and end (exclusive) instants for a period, in shop local time. */
function periodRange(period: ReportPeriod, start?: string, end?: string): { from: Date; to: Date } {
  const now = Date.now();
  const { y, m, d } = istParts(now);
  const todayStart = istMidnight(y, m, d);
  const tomorrow = istMidnight(y, m, d + 1);

  switch (period) {
    case "today":
      return { from: todayStart, to: tomorrow };
    case "week": {
      // Week starts Monday, shop local.
      const dow = new Date(now + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
      const back = (dow + 6) % 7;
      return { from: istMidnight(y, m, d - back), to: tomorrow };
    }
    case "month":
      return { from: istMidnight(y, m, 1), to: tomorrow };
    case "quarter":
      return { from: istMidnight(y, Math.floor(m / 3) * 3, 1), to: tomorrow };
    case "year":
      return { from: istMidnight(y, 0, 1), to: tomorrow };
    case "custom": {
      const s = (start ?? "").split("-").map(Number);
      const e = (end ?? "").split("-").map(Number);
      const from = s.length === 3 ? istMidnight(s[0]!, s[1]! - 1, s[2]!) : todayStart;
      const to = e.length === 3 ? istMidnight(e[0]!, e[1]! - 1, e[2]! + 1) : tomorrow;
      return { from, to };
    }
  }
}

export type AdminReport = {
  from: string;
  to: string;
  sales: { totalRevenue: number; paidOrders: number; averageOrderValue: number; deliveryCharges: number };
  paidOrderRows: { id: string; orderNumber: string; date: string; customer: string | null; total: number; deliveryCharge: number; paymentStatus: string }[];
  refunds: {
    totalRefunded: number;
    refundedOrders: number;
    netRevenue: number;
    rows: { id: string; orderNumber: string; orderAmount: number; amount: number; date: string; reason: string | null; status: string }[];
  };
  orders: { total: number; byStatus: Record<string, number> };
  products: {
    rows: { productName: string; quantity: number; revenue: number }[];
    withSales: number;
    withoutSales: number;
  };
  inventory: { activeProducts: number; lowStock: number; outOfStock: number };
  customers: { total: number; newInPeriod: number; orderedInPeriod: number };
  delivery: {
    freeOrders: number;
    tier1Orders: number;
    tier2Orders: number;
    otherChargeOrders: number;
    tier1Charge: number;
    tier2Charge: number;
    approvalRequired: number;
    confirmedDistanceOrders: number;
    confirmedDistanceAvgKm: number | null;
  };
};

export const getAdminReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        period: z.enum(PERIODS),
        start: z.string().optional(),
        end: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminReport> => {
    await assertAdmin(context);
    const { from, to } = periodRange(data.period, data.start, data.end);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const [ordersRes, productsRes, inventoryRes, customersRes, settingsRes] = await Promise.all([
      context.supabase
        .from("orders")
        .select("id, user_id, order_number, customer_name, created_at, status, payment_status, total_amount, delivery_charge, delivery_approval_required, delivery_distance_km")
        .gte("created_at", fromIso)
        .lt("created_at", toIso),
      context.supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      context.supabase.from("inventory").select("product_id, quantity, low_stock_threshold"),
      context.supabase.from("profiles").select("id, created_at").eq("role", "customer"),
      context.supabase
        .from("delivery_settings")
        .select("tier1_charge, tier2_charge")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (productsRes.error) throw productsRes.error;
    if (inventoryRes.error) throw inventoryRes.error;
    if (customersRes.error) throw customersRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const orderRows = ordersRes.data ?? [];
    const paidRows = orderRows.filter((o) => PAID_STATUSES.includes(o.payment_status) && o.status !== "cancelled");
    const totalRevenue = paidRows.reduce((sum, o) => sum + num(o.total_amount), 0);
    const deliveryCharges = paidRows.reduce((sum, o) => sum + num(o.delivery_charge), 0);

    const byStatus: Record<string, number> = {};
    for (const o of orderRows) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

    // Product performance uses the immutable order-item snapshot of paid orders.
    const paidIds = paidRows.map((o) => o.id);
    let itemRows: { product_id: string | null; product_name: string; quantity: number; total_price: number | string }[] = [];
    if (paidIds.length > 0) {
      const itemsRes = await context.supabase
        .from("order_items")
        .select("product_id, product_name, quantity, total_price")
        .in("order_id", paidIds);
      if (itemsRes.error) throw itemsRes.error;
      itemRows = itemsRes.data ?? [];
    }

    // Successfully processed refunds dated inside the same period (refund date = processed time, else created time).
    const refundsRes = await context.supabase
      .from("refunds")
      .select("id, order_id, amount, status, reason, created_at, processed_at")
      .eq("status", "processed")
      // Dated by the refund itself, never by the original order's date.
      .or(
        `and(processed_at.gte."${fromIso}",processed_at.lt."${toIso}"),and(processed_at.is.null,created_at.gte."${fromIso}",created_at.lt."${toIso}")`,
      );
    if (refundsRes.error) throw refundsRes.error;
    const refundRows = (refundsRes.data ?? []).filter((r) => {
      const at = r.processed_at ?? r.created_at;
      return at >= fromIso && at < toIso;
    });
    const refundOrderIds = [...new Set(refundRows.map((r) => r.order_id))];
    const refundOrders = new Map<string, { order_number: string; total_amount: number | string }>();
    if (refundOrderIds.length > 0) {
      const ro = await context.supabase.from("orders").select("id, order_number, total_amount").in("id", refundOrderIds);
      if (ro.error) throw ro.error;
      for (const o of ro.data ?? []) refundOrders.set(o.id, o);
    }
    const totalRefunded = Math.round(refundRows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100;

    const perProduct = new Map<string, { productName: string; quantity: number; revenue: number }>();
    const soldProductIds = new Set<string>();
    for (const item of itemRows) {
      if (item.product_id) soldProductIds.add(item.product_id);
      const key = item.product_id ?? item.product_name;
      const entry = perProduct.get(key) ?? { productName: item.product_name, quantity: 0, revenue: 0 };
      entry.quantity += Number(item.quantity);
      entry.revenue += num(item.total_price);
      perProduct.set(key, entry);
    }
    const productRows = [...perProduct.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);

    const inventoryRows = inventoryRes.data ?? [];
    const activeProducts = productsRes.count ?? 0;

    const customerRows = customersRes.data ?? [];
    const orderedCustomers = new Set(orderRows.map((o) => o.user_id).filter((v): v is string => Boolean(v)));

    const tier1 = num(settingsRes.data?.tier1_charge ?? 30);
    const tier2 = num(settingsRes.data?.tier2_charge ?? 50);
    const confirmed = orderRows
      .map((o) => (o.delivery_distance_km === null ? null : Number(o.delivery_distance_km)))
      .filter((v): v is number => v !== null);

    return {
      from: fromIso,
      to: toIso,
      sales: {
        totalRevenue,
        paidOrders: paidRows.length,
        averageOrderValue: paidRows.length > 0 ? totalRevenue / paidRows.length : 0,
        deliveryCharges,
      },
      paidOrderRows: paidRows
        .map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          date: o.created_at,
          customer: o.customer_name,
          total: num(o.total_amount),
          deliveryCharge: num(o.delivery_charge),
          paymentStatus: o.payment_status,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      refunds: {
        totalRefunded,
        refundedOrders: refundOrderIds.length,
        netRevenue: totalRevenue - totalRefunded,
        rows: refundRows
          .map((r) => ({
            id: r.id,
            orderNumber: refundOrders.get(r.order_id)?.order_number ?? "—",
            orderAmount: num(refundOrders.get(r.order_id)?.total_amount),
            amount: num(r.amount),
            date: r.processed_at ?? r.created_at,
            reason: r.reason,
            status: r.status,
          }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      },
      orders: { total: orderRows.length, byStatus },
      products: {
        rows: productRows.slice(0, 20),
        withSales: soldProductIds.size,
        withoutSales: Math.max(activeProducts - soldProductIds.size, 0),
      },
      inventory: {
        activeProducts,
        lowStock: inventoryRows.filter((r) => num(r.quantity) > 0 && num(r.quantity) <= num(r.low_stock_threshold)).length,
        outOfStock: inventoryRows.filter((r) => num(r.quantity) <= 0).length,
      },
      customers: {
        total: customerRows.length,
        newInPeriod: customerRows.filter((c) => c.created_at >= fromIso && c.created_at < toIso).length,
        orderedInPeriod: orderedCustomers.size,
      },
      delivery: {
        freeOrders: orderRows.filter((o) => num(o.delivery_charge) === 0).length,
        tier1Orders: orderRows.filter((o) => num(o.delivery_charge) === tier1).length,
        tier2Orders: orderRows.filter((o) => num(o.delivery_charge) === tier2).length,
        otherChargeOrders: orderRows.filter((o) => {
          const c = num(o.delivery_charge);
          return c !== 0 && c !== tier1 && c !== tier2;
        }).length,
        tier1Charge: tier1,
        tier2Charge: tier2,
        approvalRequired: orderRows.filter((o) => o.delivery_approval_required === true).length,
        confirmedDistanceOrders: confirmed.length,
        confirmedDistanceAvgKm:
          confirmed.length > 0 ? Math.round((confirmed.reduce((a, b) => a + b, 0) / confirmed.length) * 10) / 10 : null,
      },
    };
  });
