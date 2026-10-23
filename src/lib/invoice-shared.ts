/**
 * Phase 6 — Invoice foundation (browser-safe shapes only).
 *
 * Every value on an invoice comes from the order / order_items snapshot taken
 * at order time. Nothing here re-reads current product prices, HSN codes or
 * GST rates, and nothing adds GST on top of a price: selling prices are
 * GST-inclusive, so tax is extracted, never added.
 */
import type { OrderAddressSnapshot, OrderItemSnapshot, OrderTotals } from "@/lib/orders-shared";

export type InvoiceData = OrderTotals & {
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  paymentStatus: string;
  isPaid: boolean;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: OrderAddressSnapshot | null;
  deliveryDistanceKm: number | null;
  items: OrderItemSnapshot[];
};

export const SHOP = {
  name: { hi: "श्रीकान्त सीड्स", en: "Shreekant Seeds" },
  address: { hi: "नीम का थाना, सीकर, राजस्थान 332713", en: "Neem Ka Thana, Sikar, Rajasthan 332713" },
};

/**
 * Taxable value extracted from a GST-inclusive amount.
 * Returns null when the GST rate was never recorded — we never guess a rate.
 */
export function extractTaxable(inclusiveAmount: number, taxRate: number | null): number | null {
  if (taxRate === null) return null;
  return Math.round((inclusiveAmount / (1 + taxRate / 100)) * 100) / 100;
}

/** GST contained in a GST-inclusive amount, or null when the rate is unknown. */
export function extractGst(inclusiveAmount: number, taxRate: number | null): number | null {
  const taxable = extractTaxable(inclusiveAmount, taxRate);
  return taxable === null ? null : Math.round((inclusiveAmount - taxable) * 100) / 100;
}
