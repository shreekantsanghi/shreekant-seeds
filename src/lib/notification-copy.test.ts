import { describe, expect, test } from "bun:test";
import { localizeNotification, type LocalizableNotification } from "./notification-copy";

const n = (over: Partial<LocalizableNotification>): LocalizableNotification => ({
  audience: "customer",
  notification_type: "order_delivered",
  category: "delivery",
  title: "Order delivered",
  message: "Your order SKS-20260928-661EBC has been successfully delivered.",
  action_label: "View Order",
  metadata: {},
  ...over,
});

describe("notification wording", () => {
  test("Hindi delivered notice keeps the order number", () => {
    const t = localizeNotification(n({}), "hi");
    expect(t.title).toBe("ऑर्डर डिलीवर हो गया");
    expect(t.message).toContain("SKS-20260928-661EBC");
    expect(t.actionLabel).toBe("ऑर्डर देखें");
  });

  test("required Hindi titles for order stages", () => {
    const hi = (type: string) => localizeNotification(n({ notification_type: type, category: "order" }), "hi").title;
    expect(hi("order_out_for_delivery")).toBe("आपका ऑर्डर डिलीवरी के लिए निकल चुका है");
    expect(hi("order_ready_for_delivery")).toBe("आपका ऑर्डर डिलीवरी के लिए तैयार है");
    expect(hi("order_processing")).toBe("आपका ऑर्डर तैयार किया जा रहा है");
  });

  test("refund amount is preserved from the stored message", () => {
    const t = localizeNotification(
      n({ notification_type: "refund_processed", message: "A refund of ₹10.00 for order SKS-20260928-661EBC has been processed." }),
      "hi",
    );
    expect(t.message).toContain("₹10.00");
    expect(t.message).toContain("SKS-20260928-661EBC");
  });

  test("merchant product name comes from metadata", () => {
    const t = localizeNotification(
      n({ audience: "merchant", notification_type: "out_of_stock", message: "PAGER-25GM is now out of stock.", metadata: { product_name: "PAGER-25GM" } }),
      "hi",
    );
    expect(t.message).toBe("PAGER-25GM का स्टॉक खत्म हो गया है।");
  });

  test("English mode reproduces the stored English text", () => {
    const t = localizeNotification(n({}), "en");
    expect(t.message).toBe("Your order SKS-20260928-661EBC has been successfully delivered.");
    expect(t.actionLabel).toBe("View Order");
  });

  test("unknown type never shows English in Hindi mode", () => {
    const t = localizeNotification(n({ notification_type: "something_new", category: "payment", title: "Hello", message: "World" }), "hi");
    expect(t.title).toBe("भुगतान अपडेट");
  });
});
