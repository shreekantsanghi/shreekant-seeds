import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/store-context";
import { startRazorpayPayment, verifyRazorpayPayment } from "@/lib/razorpay.functions";

/**
 * Phase 10A — "Continue to Payment" for an order that already exists.
 *
 * The browser only sends the order id. The amount, the Razorpay order and the
 * verification all happen on the server, exactly as at checkout: this button
 * cannot choose or influence what is charged.
 */

type RazorpayCheckout = { open: () => void };
type RazorpaySuccess = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset["razorpay"] = "1";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function ContinueToPaymentButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const startPayment = useServerFn(startRazorpayPayment);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["customer-order", orderId] });

  async function confirm(response: RazorpaySuccess) {
    if (!response?.razorpay_payment_id || !response.razorpay_order_id || !response.razorpay_signature) {
      setNote(copy({ hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।", en: "Payment received. We are confirming your payment." }));
      refresh();
      return;
    }
    try {
      const result = await verifyPayment({
        data: {
          orderId,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId: response.razorpay_order_id,
          razorpaySignature: response.razorpay_signature,
        },
      });
      setNote(
        result.ok && result.state === "paid"
          ? copy({ hi: "भुगतान सफल रहा।", en: "Payment successful." })
          : copy({ hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।", en: "Payment received. We are confirming your payment." }),
      );
    } catch {
      setNote(copy({ hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।", en: "Payment received. We are confirming your payment." }));
    } finally {
      refresh();
    }
  }

  async function open() {
    setBusy(true);
    setNote(null);
    try {
      const started = await startPayment({ data: { orderId } });
      if (!started.ok) {
        setNote(
          started.reason === "already_paid"
            ? copy({ hi: "यह ऑर्डर पहले ही चुकाया जा चुका है।", en: "This order has already been paid." })
            : started.reason === "approval_required"
              ? copy({
                  hi: "दुकान अभी आपका डिलीवरी शुल्क पक्का कर रही है।",
                  en: "The shop is still confirming your delivery charge.",
                })
              : copy({ hi: "भुगतान शुरू नहीं हो सका। कृपया दोबारा कोशिश करें।", en: "Unable to start payment. Please try again." }),
        );
        refresh();
        return;
      }
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setNote(copy({ hi: "भुगतान शुरू नहीं हो सका। कृपया दोबारा कोशिश करें।", en: "Unable to start payment. Please try again." }));
        return;
      }
      const checkout = new window.Razorpay({
        key: started.keyId,
        order_id: started.razorpayOrderId,
        amount: started.amount,
        currency: started.currency,
        name: "Shreekant Seeds",
        description: orderNumber,
        prefill: {
          ...(started.customerName ? { name: started.customerName } : {}),
          ...(started.customerPhone ? { contact: started.customerPhone } : {}),
        },
        theme: { color: "#2f6b2f" },
        handler: (response: RazorpaySuccess) => void confirm(response),
      });
      checkout.open();
    } catch {
      setNote(copy({ hi: "भुगतान शुरू नहीं हो सका। कृपया दोबारा कोशिश करें।", en: "Unable to start payment. Please try again." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <Button className="rounded-full" disabled={busy} onClick={() => void open()}>
        {busy
          ? copy({ hi: "भुगतान तैयार हो रहा है…", en: "Creating payment…" })
          : copy({ hi: "भुगतान की ओर बढ़ें", en: "Continue to Payment" })}
      </Button>
      {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
