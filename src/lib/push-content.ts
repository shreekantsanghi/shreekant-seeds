/**
 * Bilingual copy for the twelve transactional push events.
 *
 * Nothing here is generated or guessed: the order number and product name are
 * read from the order/product rows that already exist. When a fact is missing
 * the sentence simply omits it instead of inventing one.
 */

export type PushLanguage = "hi" | "en";
export type PushAudience = "customer" | "merchant";

export type PushFacts = {
  orderNumber?: string | null;
  productName?: string | null;
};

export type PushCopy = { title: string; body: string };

/** The exact event names emitted by the existing notification system. */
export const CUSTOMER_PUSH_TYPES = [
  "delivery_approved",
  "payment_successful",
  "payment_failed",
  "order_out_for_delivery",
  "order_delivered",
  "order_cancelled",
] as const;

export const MERCHANT_PUSH_TYPES = [
  "delivery_approval_required",
  "new_order",
  "payment_received",
  "low_stock",
  "out_of_stock",
  "inventory_shortfall",
] as const;

type Builder = (facts: PushFacts) => PushCopy;

const orderHi = (facts: PushFacts) => (facts.orderNumber ? `ऑर्डर ${facts.orderNumber}` : "आपका ऑर्डर");
const orderEn = (facts: PushFacts) => (facts.orderNumber ? `Order ${facts.orderNumber}` : "Your order");
const shopOrderHi = (facts: PushFacts) => (facts.orderNumber ? `ऑर्डर ${facts.orderNumber}` : "एक ऑर्डर");
const shopOrderEn = (facts: PushFacts) => (facts.orderNumber ? `Order ${facts.orderNumber}` : "An order");
const productHi = (facts: PushFacts) => facts.productName ?? "एक प्रोडक्ट";
const productEn = (facts: PushFacts) => facts.productName ?? "A product";

const COPY: Record<PushAudience, Record<string, Record<PushLanguage, Builder>>> = {
  customer: {
    delivery_approved: {
      hi: (f) => ({
        title: "ज़रूरी: भुगतान बाकी है",
        body: `${orderHi(f)} की डिलीवरी मंज़ूर हो गई है। अभी भुगतान पूरा करें।`,
      }),
      en: (f) => ({
        title: "Action required: payment is ready",
        body: `Delivery for ${orderEn(f).toLowerCase()} is approved. Complete the payment now.`,
      }),
    },
    payment_successful: {
      hi: (f) => ({ title: "भुगतान सफल", body: `${orderHi(f)} का भुगतान मिल गया है।` }),
      en: (f) => ({ title: "Payment successful", body: `Payment for ${orderEn(f).toLowerCase()} has been received.` }),
    },
    payment_failed: {
      hi: (f) => ({ title: "भुगतान नहीं हुआ", body: `${orderHi(f)} का भुगतान पूरा नहीं हो सका। दोबारा कोशिश करें।` }),
      en: (f) => ({
        title: "Payment failed",
        body: `Payment for ${orderEn(f).toLowerCase()} did not go through. Please try again.`,
      }),
    },
    order_out_for_delivery: {
      hi: (f) => ({ title: "ऑर्डर डिलीवरी के लिए निकल गया", body: `${orderHi(f)} रास्ते में है। डिलीवरी कोड तैयार रखें।` }),
      en: (f) => ({ title: "Out for delivery", body: `${orderEn(f)} is on the way. Keep your delivery code ready.` }),
    },
    order_delivered: {
      hi: (f) => ({ title: "ऑर्डर डिलीवर हो गया", body: `${orderHi(f)} डिलीवर हो चुका है। धन्यवाद!` }),
      en: (f) => ({ title: "Order delivered", body: `${orderEn(f)} has been delivered. Thank you!` }),
    },
    order_cancelled: {
      hi: (f) => ({ title: "ऑर्डर रद्द", body: `${orderHi(f)} रद्द कर दिया गया है।` }),
      en: (f) => ({ title: "Order cancelled", body: `${orderEn(f)} has been cancelled.` }),
    },
  },
  merchant: {
    delivery_approval_required: {
      hi: (f) => ({
        title: "ज़रूरी: डिलीवरी मंज़ूरी बाकी",
        body: `${shopOrderHi(f)} के पते की डिलीवरी मंज़ूरी बाकी है। अभी देखें।`,
      }),
      en: (f) => ({
        title: "Action required: approve delivery",
        body: `${shopOrderEn(f)} is waiting for delivery approval. Review it now.`,
      }),
    },
    new_order: {
      hi: (f) => ({ title: "नया ऑर्डर आया", body: `${shopOrderHi(f)} मिला है।` }),
      en: (f) => ({ title: "New order received", body: `${shopOrderEn(f)} has been placed.` }),
    },
    payment_received: {
      hi: (f) => ({ title: "भुगतान मिला", body: `${shopOrderHi(f)} का भुगतान मिल गया है।` }),
      en: (f) => ({ title: "Payment received", body: `Payment for ${shopOrderEn(f).toLowerCase()} has been received.` }),
    },
    low_stock: {
      hi: (f) => ({ title: "स्टॉक कम है", body: `${productHi(f)} का स्टॉक कम रह गया है।` }),
      en: (f) => ({ title: "Low stock", body: `${productEn(f)} is running low.` }),
    },
    out_of_stock: {
      hi: (f) => ({ title: "स्टॉक खत्म", body: `${productHi(f)} का स्टॉक खत्म हो गया है।` }),
      en: (f) => ({ title: "Out of stock", body: `${productEn(f)} is now out of stock.` }),
    },
    inventory_shortfall: {
      hi: (f) => ({ title: "स्टॉक कम पड़ा", body: `${shopOrderHi(f)} के लिए स्टॉक पूरा नहीं है। तुरंत देखें।` }),
      en: (f) => ({ title: "Stock shortfall", body: `${shopOrderEn(f)} could not be fully stocked. Check it now.` }),
    },
  },
};

export function pushCopy(
  audience: string,
  notificationType: string,
  language: PushLanguage,
  facts: PushFacts,
): PushCopy | null {
  const byType = COPY[audience as PushAudience];
  const builder = byType?.[notificationType]?.[language];
  return builder ? builder(facts) : null;
}
