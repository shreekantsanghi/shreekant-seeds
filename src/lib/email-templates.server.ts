/**
 * Phase 12 — branded, transactional-only email templates.
 *
 * Server-only. No marketing content, no tracking, no provider specifics.
 * Every template renders from the queued payload alone, so a message can be
 * re-rendered later (Phase 20) without touching business tables.
 */

export type EmailPayload = Record<string, unknown>;

export type RenderedEmail = { subject: string; html: string; text: string };

const BRAND = "Shreekant Seeds";
const BRAND_HI = "श्रीकान्त सीड्स";

function str(payload: EmailPayload, key: string, fallback = ""): string {
  const value = payload[key];
  return value === null || value === undefined ? fallback : String(value);
}

function money(payload: EmailPayload, key: string): string {
  const value = payload[key];
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toFixed(2)}` : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(heading: string, lines: string[], link?: { url: string; label: string }): RenderedEmail["html"] {
  const body = lines
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#1f2a24;">${escapeHtml(line)}</p>`)
    .join("");
  const action = link
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:10px 18px;background:#1f6b3a;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;">${escapeHtml(
        link.label,
      )}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f3;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e6e0;border-radius:10px;">
<tr><td style="padding:20px 24px;border-bottom:1px solid #eef0ec;">
<div style="font-size:17px;font-weight:bold;color:#1f6b3a;">${BRAND}</div>
<div style="font-size:14px;color:#5b6660;">${BRAND_HI}</div>
</td></tr>
<tr><td style="padding:22px 24px;">
<h1 style="margin:0 0 14px;font-size:18px;color:#12211a;">${escapeHtml(heading)}</h1>
${body}${action}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eef0ec;font-size:12px;color:#7b857f;">
${BRAND}, Neem Ka Thana, Sikar, Rajasthan 332713. This is an automated transactional message about your order.
</td></tr>
</table></body></html>`;
}

function toText(heading: string, lines: string[], link?: { url: string; label: string }): string {
  return [`${BRAND} / ${BRAND_HI}`, "", heading, "", ...lines.filter(Boolean), link ? `\n${link.label}: ${link.url}` : ""]
    .join("\n")
    .trim();
}

type Builder = (payload: EmailPayload, siteUrl: string) => {
  subject: string;
  heading: string;
  lines: string[];
  link?: { url: string; label: string };
};

const orderLink = (siteUrl: string, payload: EmailPayload, admin = false) => {
  const id = str(payload, "order_id");
  const path = admin ? "/admin/orders" : "/orders";
  return { url: `${siteUrl}${path}${id ? `/${id}` : ""}`, label: admin ? "View order" : "View your order" };
};

const BUILDERS: Record<string, Builder> = {
  // ---------- Customer ----------
  delivery_approved: (p, s) => ({
    subject: `Delivery approved — order ${str(p, "order_number")}`,
    heading: "Delivery approved — you can now pay",
    lines: [
      `Order ${str(p, "order_number")}`,
      Number(p["delivery_charge"] ?? 0) === 0
        ? "Delivery charge: FREE"
        : `Delivery charge: ${money(p, "delivery_charge")}`,
      `Order total: ${money(p, "amount")}`,
      "You can now complete payment for this order.",
    ],
    link: orderLink(s, p),
  }),
  payment_successful: (p, s) => ({
    subject: `Payment successful — order ${str(p, "order_number")}`,
    heading: "Payment successful",
    lines: [`Order ${str(p, "order_number")}`, `Amount paid: ${money(p, "amount")}`, "Payment status: Paid"],
    link: orderLink(s, p),
  }),
  payment_failed: (p, s) => ({
    subject: `Payment not completed — order ${str(p, "order_number")}`,
    heading: "Payment failed",
    lines: [
      `Order ${str(p, "order_number")}`,
      `Amount due: ${money(p, "amount")}`,
      "Your payment was not completed. You can try again from your order page.",
    ],
    link: orderLink(s, p),
  }),
  refund_processed: (p, s) => ({
    subject: `Refund processed — order ${str(p, "order_number")}`,
    heading: "Refund processed",
    lines: [
      `Order ${str(p, "order_number")}`,
      `Refund amount: ${money(p, "amount")}`,
      "Your refund has been processed. It may take a few working days to reach your account.",
    ],
    link: orderLink(s, p),
  }),
  order_confirmed: (p, s) => ({
    subject: `Order confirmed — ${str(p, "order_number")}`,
    heading: "Order confirmed",
    lines: [`Order ${str(p, "order_number")}`, `Order total: ${money(p, "amount")}`, "Your order has been confirmed."],
    link: orderLink(s, p),
  }),
  order_out_for_delivery: (p, s) => ({
    subject: `Out for delivery — order ${str(p, "order_number")}`,
    heading: "Your order is out for delivery",
    lines: [
      `Order ${str(p, "order_number")}`,
      "Keep your delivery code ready. Share it only with the delivery person at handover.",
    ],
    link: orderLink(s, p),
  }),
  order_delivered: (p, s) => ({
    subject: `Delivered — order ${str(p, "order_number")}`,
    heading: "Order delivered",
    lines: [`Order ${str(p, "order_number")}`, `Order total: ${money(p, "amount")}`, "Thank you for shopping with us."],
    link: orderLink(s, p),
  }),
  order_cancelled: (p, s) => ({
    subject: `Order cancelled — ${str(p, "order_number")}`,
    heading: "Order cancelled",
    lines: [`Order ${str(p, "order_number")}`, "This order has been cancelled."],
    link: orderLink(s, p),
  }),

  // ---------- Merchant ----------
  new_order: (p, s) => ({
    subject: `New order received — ${str(p, "order_number")}`,
    heading: "New order received",
    lines: [
      `Order ${str(p, "order_number")}`,
      `Customer: ${str(p, "customer_name", "—")}`,
      `Order total: ${money(p, "amount")}`,
    ],
    link: orderLink(s, p, true),
  }),
  delivery_approval_required: (p, s) => ({
    subject: `Delivery approval required — order ${str(p, "order_number")}`,
    heading: "Delivery approval required",
    lines: [
      `Order ${str(p, "order_number")}`,
      `Customer: ${str(p, "customer_name", "—")}`,
      "This order is waiting for a delivery-charge decision before the customer can pay.",
    ],
    link: { url: `${s}/admin/orders`, label: "Review and approve" },
  }),
  payment_received: (p, s) => ({
    subject: `Payment received — order ${str(p, "order_number")}`,
    heading: "Payment received",
    lines: [
      `Order ${str(p, "order_number")}`,
      `Customer: ${str(p, "customer_name", "—")}`,
      `Amount: ${money(p, "amount")}`,
    ],
    link: orderLink(s, p, true),
  }),
  merchant_refund_processed: (p, s) => ({
    subject: `Refund processed — order ${str(p, "order_number")}`,
    heading: "Refund processed",
    lines: [
      `Order ${str(p, "order_number")}`,
      `Customer: ${str(p, "customer_name", "—")}`,
      `Refund amount: ${money(p, "amount")}`,
      "Razorpay has confirmed this refund as processed.",
    ],
    link: orderLink(s, p, true),
  }),
  low_stock: (p, s) => ({
    subject: `Low stock — ${str(p, "product_name")}`,
    heading: "Low stock",
    lines: [
      `Product: ${str(p, "product_name")}`,
      `Available: ${str(p, "available")}`,
      `Low-stock threshold: ${str(p, "threshold")}`,
    ],
    link: { url: `${s}/admin/inventory`, label: "Manage inventory" },
  }),
  out_of_stock: (p, s) => ({
    subject: `Out of stock — ${str(p, "product_name")}`,
    heading: "Out of stock",
    lines: [`Product: ${str(p, "product_name")}`, "Available: 0", "This product can no longer be ordered."],
    link: { url: `${s}/admin/inventory`, label: "Manage inventory" },
  }),
  inventory_shortfall: (p, s) => ({
    subject: `Stock issue on paid order ${str(p, "order_number")}`,
    heading: "Paid order could not be stock-deducted",
    lines: [
      `Order ${str(p, "order_number")}`,
      "The order is paid but there is not enough stock to fulfil it. Manual reconciliation is required.",
      ...(Array.isArray(p["lines"])
        ? (p["lines"] as Array<Record<string, unknown>>).map(
            (line) => `${String(line["product_name"] ?? "Item")}: required ${String(line["required"])}, available ${String(line["available"])}`,
          )
        : []),
    ],
    link: orderLink(s, p, true),
  }),
};

export function renderEmail(eventType: string, payload: EmailPayload, siteUrl: string): RenderedEmail | null {
  const builder = BUILDERS[eventType];
  if (!builder) return null;
  const { subject, heading, lines, link } = builder(payload ?? {}, siteUrl.replace(/\/$/, ""));
  return { subject, html: layout(heading, lines, link), text: toText(heading, lines, link) };
}

export const SUPPORTED_EMAIL_EVENTS = Object.keys(BUILDERS);
