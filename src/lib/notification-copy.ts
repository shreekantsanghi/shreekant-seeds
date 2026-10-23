/**
 * Display-time wording for in-app notifications.
 *
 * The database stores each notification with a stable `notification_type`
 * plus English text. Here we rebuild the title, message and button label in
 * the visitor's chosen language from that type and the facts saved with the
 * row (order number, amounts, product or customer name). Rows are never
 * edited, so switching language changes only what is shown.
 */

export type CopyLanguage = "hi" | "en";

export type LocalizableNotification = {
  audience: "customer" | "merchant";
  notification_type: string;
  category: string;
  title: string;
  message: string;
  action_label: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LocalizedText = { title: string; message: string; actionLabel: string | null };

type Facts = {
  order: string | null;
  amount: string | null;
  total: string | null;
  charge: number | null;
  product: string | null;
  customer: string | null;
};

const num = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
const money = (value: number | null) => (value === null ? null : value.toFixed(2));

/** Pull dynamic values from metadata first, then from the stored English text. */
export function extractFacts(item: LocalizableNotification): Facts {
  const meta = item.metadata ?? {};
  const msg = item.message ?? "";
  const rupees = [...msg.matchAll(/₹\s?([0-9]+(?:\.[0-9]+)?)/g)].map((m) => Number(m[1]));
  const metaProduct = typeof meta["product_name"] === "string" ? (meta["product_name"] as string) : null;
  const productFromMsg = msg.match(/^(.+?) is now (?:out of stock|at or below)/)?.[1] ?? null;
  const customer = msg.match(/^(.+?) has created an account\.?$/)?.[1] ?? null;

  const charge = num(meta["delivery_charge"]) ?? (/FREE delivery/i.test(msg) ? 0 : (rupees.length > 1 ? rupees[0]! : null));
  const total = num(meta["total_amount"]) ?? (rupees.length ? rupees[rupees.length - 1]! : null);
  const amount = num(meta["amount"]) ?? (rupees.length ? rupees[0]! : null);

  return {
    order: msg.match(/SKS-[A-Z0-9]+(?:-[A-Z0-9]+)*/)?.[0] ?? null,
    amount: money(amount),
    total: money(total),
    charge,
    product: metaProduct ?? productFromMsg,
    customer: customer && customer !== "A new customer" ? customer : null,
  };
}

type Builder = (f: Facts) => { title: string; message: string };

const ord = (f: Facts, hi: string, en: string) => ({ hi: f.order ? `ऑर्डर ${f.order}` : hi, en: f.order ? `order ${f.order}` : en });

const CUSTOMER: Record<string, Record<CopyLanguage, Builder>> = {
  order_created: {
    hi: (f) => ({ title: "ऑर्डर मिल गया", message: `आपका ${ord(f, "ऑर्डर", "").hi} बन गया है।` }),
    en: (f) => ({ title: "Order placed", message: `Your ${ord(f, "", "order").en} has been created.` }),
  },
  delivery_approval_pending: {
    hi: () => ({
      title: "डिलीवरी की पुष्टि बाकी है",
      message: "दुकान आपके पते का डिलीवरी शुल्क तय कर रही है। भुगतान के लिए तैयार होते ही हम आपको सूचना देंगे।",
    }),
    en: () => ({
      title: "Delivery confirmation pending",
      message: "The shop is confirming the delivery charge for your address. We'll notify you when payment is ready.",
    }),
  },
  delivery_approved: {
    hi: (f) => ({
      title: "डिलीवरी मंज़ूर — अब भुगतान करें",
      message:
        (f.charge === 0
          ? "आपके पते पर डिलीवरी मुफ़्त मंज़ूर हुई है।"
          : f.charge !== null
            ? `आपका डिलीवरी शुल्क ₹${f.charge} तय हुआ है।`
            : "आपके पते की डिलीवरी मंज़ूर हो गई है।") +
        (f.total ? ` ऑर्डर की कुल राशि ₹${f.total} है।` : "") +
        " अब आप भुगतान कर सकते हैं।",
    }),
    en: (f) => ({
      title: "Delivery approved — payment ready",
      message:
        (f.charge === 0
          ? "Your delivery address has been approved with FREE delivery."
          : f.charge !== null
            ? `Your delivery charge has been confirmed at ₹${f.charge}.`
            : "Your delivery address has been approved.") +
        (f.total ? ` Your final order total is ₹${f.total}.` : "") +
        " You can now complete payment.",
    }),
  },
  payment_successful: {
    hi: (f) => ({ title: "भुगतान सफल", message: `${ord(f, "आपके ऑर्डर", "").hi} का भुगतान सफलतापूर्वक मिल गया है।` }),
    en: (f) => ({ title: "Payment successful", message: `Payment for ${ord(f, "", "your order").en} was received successfully.` }),
  },
  payment_failed: {
    hi: (f) => ({ title: "भुगतान नहीं हो पाया", message: `${ord(f, "आपके ऑर्डर", "").hi} का भुगतान पूरा नहीं हुआ। आप दोबारा कोशिश कर सकते हैं।` }),
    en: (f) => ({ title: "Payment failed", message: `Your payment for ${ord(f, "", "your order").en} was not completed. You can try again.` }),
  },
  order_confirmed: {
    hi: (f) => ({ title: "ऑर्डर पक्का हो गया", message: `श्रीकांत सीड्स ने आपका ${ord(f, "ऑर्डर", "").hi} पक्का कर दिया है।` }),
    en: (f) => ({ title: "Order confirmed", message: `Your ${ord(f, "", "order").en} has been confirmed by Shreekant Seeds.` }),
  },
  order_processing: {
    hi: (f) => ({ title: "आपका ऑर्डर तैयार किया जा रहा है", message: `आपका ${ord(f, "ऑर्डर", "").hi} अभी तैयार किया जा रहा है।` }),
    en: (f) => ({ title: "Your order is being prepared", message: `Your ${ord(f, "", "order").en} is now being prepared.` }),
  },
  order_ready_for_delivery: {
    hi: (f) => ({ title: "आपका ऑर्डर डिलीवरी के लिए तैयार है", message: `आपका ${ord(f, "ऑर्डर", "").hi} डिलीवरी के लिए तैयार है।` }),
    en: (f) => ({ title: "Your order is ready for delivery", message: `Your ${ord(f, "", "order").en} is ready for delivery.` }),
  },
  order_out_for_delivery: {
    hi: (f) => ({
      title: "आपका ऑर्डर डिलीवरी के लिए निकल चुका है",
      message: `आपका ${ord(f, "ऑर्डर", "").hi} रास्ते में है। अपना डिलीवरी कोड तैयार रखें।`,
    }),
    en: (f) => ({ title: "Your order is out for delivery", message: `Your ${ord(f, "", "order").en} is on the way. Keep your delivery code ready.` }),
  },
  order_delivered: {
    hi: (f) => ({ title: "ऑर्डर डिलीवर हो गया", message: `आपका ${ord(f, "ऑर्डर", "").hi} सफलतापूर्वक डिलीवर हो गया है।` }),
    en: (f) => ({ title: "Order delivered", message: `Your ${ord(f, "", "order").en} has been successfully delivered.` }),
  },
  order_cancelled: {
    hi: (f) => ({ title: "ऑर्डर रद्द हो गया", message: `आपका ${ord(f, "ऑर्डर", "").hi} रद्द कर दिया गया है।` }),
    en: (f) => ({ title: "Order cancelled", message: `Your ${ord(f, "", "order").en} has been cancelled.` }),
  },
  refund_processed: {
    hi: (f) => ({
      title: "रिफ़ंड हो गया",
      message: `${ord(f, "आपके ऑर्डर", "").hi} के लिए${f.amount ? ` ₹${f.amount} का` : ""} रिफ़ंड कर दिया गया है।`,
    }),
    en: (f) => ({
      title: "Refund processed",
      message: `A refund${f.amount ? ` of ₹${f.amount}` : ""} for ${ord(f, "", "your order").en} has been processed.`,
    }),
  },
};

const MERCHANT: Record<string, Record<CopyLanguage, Builder>> = {
  new_order: {
    hi: (f) => ({ title: "नया ऑर्डर आया", message: `${ord(f, "एक नया ऑर्डर", "").hi} आया है।` }),
    en: (f) => ({ title: "New order received", message: `${f.order ? `Order ${f.order}` : "A new order"} has been placed.` }),
  },
  delivery_approval_required: {
    hi: (f) => ({
      title: "डिलीवरी मंज़ूरी ज़रूरी",
      message: `${ord(f, "एक ऑर्डर", "").hi} ग्राहक के पते के डिलीवरी शुल्क की मंज़ूरी का इंतज़ार कर रहा है।`,
    }),
    en: (f) => ({
      title: "Delivery approval required",
      message: `${f.order ? `Order ${f.order}` : "An order"} is waiting for delivery-charge approval for the customer's saved address.`,
    }),
  },
  payment_received: {
    hi: (f) => ({ title: "भुगतान मिला", message: `${ord(f, "एक ऑर्डर", "").hi} का भुगतान सफलतापूर्वक मिल गया है।` }),
    en: (f) => ({ title: "Payment received", message: `Payment for ${ord(f, "", "an order").en} has been successfully received.` }),
  },
  order_delivered: {
    hi: (f) => ({ title: "ऑर्डर डिलीवर हो गया", message: `${ord(f, "एक ऑर्डर", "").hi} सफलतापूर्वक डिलीवर हो गया है।` }),
    en: (f) => ({ title: "Order delivered", message: `${f.order ? `Order ${f.order}` : "An order"} has been successfully delivered.` }),
  },
  inventory_shortfall: {
    hi: (f) => ({
      title: "भुगतान हुए ऑर्डर में स्टॉक की समस्या",
      message: `${ord(f, "एक ऑर्डर", "").hi} का भुगतान हो गया है, पर स्टॉक घटाया नहीं जा सका। इसे हाथ से मिलान करना ज़रूरी है।`,
    }),
    en: (f) => ({
      title: "Stock issue on a paid order",
      message: `${f.order ? `Order ${f.order}` : "An order"} is paid but stock could not be deducted. Manual reconciliation is required.`,
    }),
  },
  low_stock: {
    hi: (f) => ({ title: "स्टॉक कम है", message: `${f.product ?? "एक प्रोडक्ट"} का स्टॉक तय सीमा तक या उससे कम हो गया है।` }),
    en: (f) => ({ title: "Low stock", message: `${f.product ?? "A product"} is now at or below its low-stock threshold.` }),
  },
  out_of_stock: {
    hi: (f) => ({ title: "स्टॉक खत्म", message: `${f.product ?? "एक प्रोडक्ट"} का स्टॉक खत्म हो गया है।` }),
    en: (f) => ({ title: "Out of stock", message: `${f.product ?? "A product"} is now out of stock.` }),
  },
  new_customer: {
    hi: (f) => ({ title: "नया ग्राहक जुड़ा", message: `${f.customer ?? "एक नए ग्राहक"} ने खाता बनाया है।` }),
    en: (f) => ({ title: "New customer registered", message: `${f.customer ?? "A new customer"} has created an account.` }),
  },
};

const ACTION_LABELS: Record<string, string> = {
  "View Order": "ऑर्डर देखें",
  "Continue to Payment": "भुगतान करें",
  "Retry Payment": "फिर से भुगतान करें",
  "Review & Approve": "जाँचें और मंज़ूर करें",
  "Manage Inventory": "स्टॉक देखें",
  "Manage Product": "प्रोडक्ट देखें",
  "View Customers": "ग्राहक देखें",
};

/** Hindi fallback for any future type not yet listed, so English never leaks into Hindi mode. */
const HI_CATEGORY_FALLBACK: Record<string, { title: string; message: string }> = {
  order: { title: "ऑर्डर अपडेट", message: "आपके ऑर्डर में नया अपडेट है।" },
  payment: { title: "भुगतान अपडेट", message: "भुगतान से जुड़ा नया अपडेट है।" },
  delivery: { title: "डिलीवरी अपडेट", message: "डिलीवरी से जुड़ा नया अपडेट है।" },
  inventory: { title: "स्टॉक अपडेट", message: "स्टॉक से जुड़ा नया अपडेट है।" },
  account: { title: "खाता अपडेट", message: "खाते से जुड़ा नया अपडेट है।" },
};

export function isKnownNotificationType(audience: string, type: string) {
  return Boolean((audience === "merchant" ? MERCHANT : CUSTOMER)[type]);
}

export function localizeNotification(item: LocalizableNotification, language: CopyLanguage): LocalizedText {
  const table = item.audience === "merchant" ? MERCHANT : CUSTOMER;
  const builder = table[item.notification_type]?.[language];
  const facts = extractFacts(item);

  let text: { title: string; message: string };
  if (builder) text = builder(facts);
  else if (language === "en") text = { title: item.title, message: item.message };
  else {
    const base = HI_CATEGORY_FALLBACK[item.category] ?? { title: "नई सूचना", message: "आपके लिए एक नया अपडेट है।" };
    text = { title: base.title, message: facts.order ? `${base.message} (ऑर्डर ${facts.order})` : base.message };
  }

  const label = item.action_label;
  const actionLabel = label === null ? null : language === "hi" ? (ACTION_LABELS[label] ?? "देखें") : label;
  return { ...text, actionLabel };
}
