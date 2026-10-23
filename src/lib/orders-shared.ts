/**
 * Shared, browser-safe shapes for the Orders screens (Phase 5B Part 2E).
 * No database access here — only the types and formatting helpers used by both
 * the customer and merchant order views.
 */

export type OrderAddressSnapshot = {
  full_name?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string | null;
  landmark?: string | null;
  village_town?: string;
  district?: string;
  state?: string;
  pincode?: string;
};

export type OrderItemSnapshot = {
  id: string;
  productName: string;
  productNameHi: string;
  productType: string | null;
  packSize: string | null;
  unit: string | null;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number | null;
  taxAmount: number;
  totalPrice: number;
};

export type OrderSummaryRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
};

export type OrderTotals = {
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export function formatAddress(snapshot: OrderAddressSnapshot | null): string[] {
  if (!snapshot) return [];
  const lines = [
    snapshot.address_line1,
    snapshot.address_line2,
    snapshot.landmark,
    [snapshot.village_town, snapshot.district].filter(Boolean).join(", "),
    [snapshot.state, snapshot.pincode].filter(Boolean).join(" "),
  ];
  return lines.filter((line): line is string => Boolean(line && line.trim()));
}

export const ORDER_STATUS_LABELS: Record<string, { hi: string; en: string }> = {
  pending: { hi: "लंबित", en: "Pending" },
  confirmed: { hi: "पुष्ट", en: "Confirmed" },
  processing: { hi: "तैयारी में", en: "Preparing" },
  ready_for_delivery: { hi: "डिलीवरी के लिए तैयार", en: "Ready for delivery" },
  out_for_delivery: { hi: "डिलीवरी पर निकला", en: "Out for delivery" },
  delivered: { hi: "डिलीवर हो गया", en: "Delivered" },
  cancelled: { hi: "रद्द", en: "Cancelled" },
};

export const PAYMENT_STATUS_LABELS: Record<string, { hi: string; en: string }> = {
  created: { hi: "भुगतान बाकी", en: "Payment pending" },
  pending: { hi: "भुगतान की पुष्टि हो रही है", en: "Payment confirming" },
  paid: { hi: "भुगतान हो गया", en: "Paid" },
  failed: { hi: "भुगतान विफल", en: "Payment failed" },
  refunded: { hi: "रिफंड किया गया", en: "Refunded" },
  partially_refunded: { hi: "आंशिक रिफंड किया गया", en: "Partially refunded" },
};

/**
 * Phase 8 — fulfilment workflow, display only.
 * The database routine `set_order_status` is the authority; this map only
 * decides which single button the merchant sees. `delivered` is deliberately
 * absent: delivery completion is reserved for the upcoming QR + code flow.
 */
export const NEXT_ORDER_STATUS: Record<string, string | undefined> = {
  pending: "confirmed",
  confirmed: "processing",
  processing: "ready_for_delivery",
  ready_for_delivery: "out_for_delivery",
};

/** Statuses the merchant may cancel from (mirrors the database rule). */
export const CANCELLABLE_STATUSES = ["pending", "confirmed", "processing"];

/** Customer-facing progress steps. */
export const CUSTOMER_TIMELINE = [
  "confirmed",
  "processing",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
] as const;

export const ORDER_STATUS_ERRORS: Record<string, { hi: string; en: string }> = {
  PAYMENT_NOT_CONFIRMED: { hi: "भुगतान की पुष्टि होने तक यह ऑर्डर आगे नहीं बढ़ सकता।", en: "This order cannot move forward until payment is confirmed." },
  INVENTORY_NOT_FULFILLED: { hi: "इस ऑर्डर का स्टॉक अपने आप नहीं घटा। पहले स्टॉक स्वयं मिलाएँ, तभी यह डिलीवरी पर भेजा जा सकेगा।", en: "Stock was not deducted for this order. Reconcile the stock manually before it can go out for delivery." },
  INVALID_TRANSITION: { hi: "यह स्थिति सीधे नहीं बदली जा सकती। एक-एक चरण आगे बढ़ें।", en: "This status cannot be set directly. Move one step at a time." },
  ORDER_ALREADY_DELIVERED: { hi: "यह ऑर्डर डिलीवर हो चुका है; अब स्थिति नहीं बदल सकती।", en: "This order is delivered; its status can no longer change." },
  ORDER_CANCELLED: { hi: "यह ऑर्डर रद्द हो चुका है।", en: "This order is cancelled." },
  CANCEL_NOT_ALLOWED: { hi: "इस चरण पर ऑर्डर रद्द नहीं किया जा सकता।", en: "This order can no longer be cancelled at this stage." },
  CANCEL_BLOCKED_INVENTORY: { hi: "स्टॉक घट चुका है, इसलिए यह ऑर्डर यहाँ से रद्द नहीं किया जा सकता।", en: "Stock has already been deducted, so this order cannot be cancelled here." },
  DELIVERY_CONFIRMATION_REQUIRED: { hi: "डिलीवरी की पुष्टि ग्राहक के QR और डिलीवरी कोड से होगी।", en: "Delivery completion will be confirmed with the customer QR and delivery code." },
  FORBIDDEN: { hi: "केवल दुकान ही स्थिति बदल सकती है।", en: "Only the shop can change the status." },
  ORDER_NOT_FOUND: { hi: "ऑर्डर नहीं मिला।", en: "Order not found." },
};

export function formatDate(value: string, language: "hi" | "en"): string {
  return new Date(value).toLocaleString(language === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
