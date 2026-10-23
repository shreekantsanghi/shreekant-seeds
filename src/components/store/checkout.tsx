import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AlertTriangle, CreditCard, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ImageFrame, LoadingGrid, PageIntro, money } from "./core";
import { useCopy } from "@/lib/store-context";
import { reviewCheckout, type CheckoutReview } from "@/lib/checkout.functions";
import { placePendingOrder } from "@/lib/order.functions";
import { estimateGpsDelivery, getLastDeliveryLocation, reuseLastDeliveryLocation } from "@/lib/geo-location.functions";
import { startRazorpayPayment, verifyRazorpayPayment } from "@/lib/razorpay.functions";

type RazorpayCheckout = { open: () => void };
type RazorpaySuccess = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

/** Loads Razorpay's hosted Checkout script once. */
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

/**
 * Unique key for ONE checkout attempt. It is generated once per checkout
 * visit and stays stable for every click/retry within that attempt, so the
 * database returns the same pending order instead of creating duplicates —
 * while a brand-new checkout visit (even with an identical cart and address)
 * always gets a brand-new order.
 */
function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `attempt-${crypto.randomUUID()}`;
  }
  return `attempt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}


const SHOP_PHONE = "9414466727";
const SHOP_WHATSAPP = "https://wa.me/919414466727";

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-5 ring-1 ring-border">
      <h2 className="font-display text-2xl font-semibold">
        {step}. {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CheckoutPage() {
  const copy = useCopy();
  const review = useServerFn(reviewCheckout);
  const placeOrder = useServerFn(placePendingOrder);
  const startPayment = useServerFn(startRazorpayPayment);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [phase, setPhase] = useState<"idle" | "order" | "payment" | "opening">("idle");
  const [placed, setPlaced] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  /** Phase 10A — the shop must confirm the delivery charge before payment. */
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  /** Post-payment state. Only the server may move this to "paid". */
  const [payState, setPayState] = useState<"none" | "verifying" | "paid" | "awaiting" | "failed">("none");
  const [payError, setPayError] = useState<string | null>(null);
  /** One key per checkout visit; reused by every retry inside that visit. */
  const attemptKeyRef = useRef<string | null>(null);
  /**
   * Phase 14 extension — optional one-time device location. Nothing is
   * requested until the customer presses the button, and the result is tied to
   * the address it was taken for, so switching address discards it.
   */
  const gpsEstimate = useServerFn(estimateGpsDelivery);
  const [gpsBusy, setGpsBusy] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);
  const [locationWarn, setLocationWarn] = useState(false);
  const [locationFlash, setLocationFlash] = useState(false);
  const [gpsResult, setGpsResult] = useState<
    { addressId: string; snapshotId: string | null; distanceKm: number; durationMin: number; accuracyM: number; approximate: boolean } | null
  >(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const lastLocationFn = useServerFn(getLastDeliveryLocation);
  const reuseLocationFn = useServerFn(reuseLastDeliveryLocation);
  const locationRequiredText = copy({
    hi: "डिलीवरी के लिए स्थान ज़रूरी है। कृपया फ़ोन/ब्राउज़र में लोकेशन की अनुमति दें और दोबारा कोशिश करें।",
    en: "Location is required for delivery. Please allow location access in your phone/browser settings and try again.",
  });

  async function useLastLocation(selectedAddressId: string) {
    setGpsMessage(null);
    setGpsResult(null);
    setGpsBusy(true);
    try {
      const result = await reuseLocationFn({ data: { addressId: selectedAddressId } });
      if (result.ok) setGpsResult({ addressId: selectedAddressId, ...result });
      else setGpsMessage(copy({ hi: "पिछला स्थान उपलब्ध नहीं है। कृपया वर्तमान स्थान इस्तेमाल करें।", en: "No previous location is available. Please use your current location." }));
    } catch {
      setGpsMessage(copy({ hi: "पिछला स्थान उपलब्ध नहीं है। कृपया वर्तमान स्थान इस्तेमाल करें।", en: "No previous location is available. Please use your current location." }));
    } finally {
      setGpsBusy(false);
    }
  }

  async function useCurrentLocation(selectedAddressId: string) {
    setGpsMessage(null);
    setGpsResult(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsMessage(locationRequiredText);
      return;
    }
    setGpsBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const accuracyM = position.coords.accuracy;
      if (!Number.isFinite(accuracyM) || accuracyM <= 0) {
        setGpsMessage(copy({ hi: "आपकी लोकेशन अभी पर्याप्त सटीक नहीं है। कृपया दोबारा कोशिश करें।", en: "Your location isn't precise enough right now. Please try again." }));
        return;
      }
      if (accuracyM > 250) {
        setGpsMessage(copy({ hi: "आपकी लोकेशन अभी पर्याप्त सटीक नहीं है। कृपया दोबारा कोशिश करें।", en: "Your location isn't precise enough right now. Please try again." }));
        return;
      }
      const result = await gpsEstimate({
        data: {
          addressId: selectedAddressId,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyM,
        },
      });
      if (result.ok) {
        setGpsResult({ addressId: selectedAddressId, ...result });
      } else if (result.reason === "accuracy") {
        setGpsMessage(copy({ hi: "आपकी लोकेशन अभी पर्याप्त सटीक नहीं है। कृपया दोबारा कोशिश करें।", en: "Your location isn't precise enough right now. Please try again." }));
      } else if (result.reason === "route_failed") {
        setGpsMessage(copy({ hi: "इस लोकेशन से दूरी नहीं निकाली जा सकी।", en: "We couldn't calculate the distance from this location." }));
      } else {
        setGpsMessage(locationRequiredText);
      }
    } catch {
      setGpsMessage(locationRequiredText);
    } finally {
      setGpsBusy(false);
    }
  }

  const query = useQuery<CheckoutReview>({
    queryKey: ["checkout-review", addressId],
    queryFn: () => review({ data: { addressId } }),
    retry: false,
    staleTime: 0,
  });
  const selectedForLocation = query.data?.selectedAddressId ?? null;
  const lastLocation = useQuery({
    queryKey: ["last-delivery-location", selectedForLocation],
    queryFn: () => lastLocationFn({ data: { addressId: selectedForLocation! } }),
    enabled: Boolean(selectedForLocation),
    retry: false,
  });

  /**
   * Razorpay's success callback. The identifiers it hands over are NOT proof of
   * payment: they go straight to the server, which checks the signature, the
   * amount and the capture state before anything is marked paid.
   */
  async function confirmPayment(orderId: string, response: RazorpaySuccess) {
    setOrderError(null);
    setPaymentNote(null);
    setPayError(null);
    setPayState("verifying");

    if (!response?.razorpay_payment_id || !response.razorpay_order_id || !response.razorpay_signature) {
      setPayState("awaiting");
      setPayError(
        copy({
          hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।",
          en: "Payment received. We are confirming your payment.",
        }),
      );
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

      if (result.ok && result.state === "paid") {
        setPayState("paid");
        return;
      }
      if (result.ok && result.state === "awaiting_stock") {
        setPayState("awaiting");
        setPayError(
          copy({
            hi: "भुगतान मिल गया है। दुकान उपलब्धता की पुष्टि कर रही है।",
            en: "Payment received. The shop is confirming availability.",
          }),
        );
        return;
      }
      if (result.ok) {
        setPayState("awaiting");
        setPayError(
          copy({
            hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।",
            en: "Payment received. We are confirming your payment.",
          }),
        );
        return;
      }

      setPayState("failed");
      setPayError(
        result.reason === "invalid_signature"
          ? copy({
              hi: "भुगतान की पुष्टि नहीं हो सकी। यह ऑर्डर अभी अवैतनिक है। कृपया दुकान से संपर्क करें।",
              en: "This payment could not be verified. The order is still unpaid. Please contact the shop.",
            })
          : result.reason === "amount_mismatch"
            ? copy({
                hi: "भुगतान की राशि ऑर्डर की राशि से मेल नहीं खाती। कृपया दुकान से संपर्क करें।",
                en: "The paid amount does not match the order amount. Please contact the shop.",
              })
            : result.reason === "duplicate_payment"
              ? copy({
                  hi: "यह भुगतान किसी दूसरे ऑर्डर से जुड़ा है। कृपया दुकान से संपर्क करें।",
                  en: "This payment belongs to another order. Please contact the shop.",
                })
              : result.reason === "not_captured"
                ? copy({
                    hi: "भुगतान पूरा नहीं हुआ। ऑर्डर अभी अवैतनिक है।",
                    en: "The payment did not complete. The order is still unpaid.",
                  })
                : result.reason === "not_found"
                  ? copy({
                      hi: "यह ऑर्डर नहीं मिला। कृपया दुकान से संपर्क करें।",
                      en: "This order could not be found. Please contact the shop.",
                    })
                  : copy({
                      hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।",
                      en: "Payment received. We are confirming your payment.",
                    }),
      );
    } catch {
      // Verification unreachable — the payment may well have succeeded, so we
      // never call it a failure and never mark the order paid here.
      setPayState("awaiting");
      setPayError(
        copy({
          hi: "भुगतान मिल गया है। हम इसकी पुष्टि कर रहे हैं।",
          en: "Payment received. We are confirming your payment.",
        }),
      );
    }
  }

  /**
   * Opens Razorpay Checkout for an existing local order. Opening or closing
   * the window proves nothing about payment: the order stays pending until
   * the server verifies the payment.
   */
  async function openPayment(orderId: string, orderNumber: string) {
    setPhase("payment");
    setPayError(null);
    try {
      const started = await startPayment({ data: { orderId } });
      if (!started.ok) {
        if (started.reason === "approval_required") {
          setAwaitingApproval(true);
          setOrderError(null);
          return;
        }
        if (started.reason === "already_paid") {
          // The order is paid — show the paid state, not an unpaid error.
          setOrderError(null);
          setPaymentNote(null);
          setPayError(null);
          setPayState("paid");
          return;
        }
        setOrderError(copy({ hi: "भुगतान शुरू नहीं हो सका। कृपया दोबारा कोशिश करें।", en: "Unable to start payment. Please try again." }));
        return;
      }

      setPhase("opening");
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setOrderError(copy({ hi: "भुगतान शुरू नहीं हो सका। कृपया दोबारा कोशिश करें।", en: "Unable to start payment. Please try again." }));
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
      handler: (response: RazorpaySuccess) => void confirmPayment(orderId, response),
      modal: {
        ondismiss: () => {
          if (payState === "paid" || payState === "verifying") return;
          setPaymentNote(
            copy({ hi: "भुगतान रद्द किया गया। ऑर्डर अभी अवैतनिक है।", en: "Payment cancelled. Your order is still unpaid." }),
          );
        },
      },
    });
      checkout.open();
    } catch {
      setOrderError(copy({ hi: "भुगतान शुरू नहीं हो सका। कृपया दोबारा कोशिश करें।", en: "Unable to start payment. Please try again." }));
    } finally {
      setPhase("idle");
    }
  }

  async function submit(data: CheckoutReview) {
    if (placing || placed || !data.selectedAddressId) return;
    setPlacing(true);
    setPhase("order");
    setOrderError(null);
    setPaymentNote(null);
    try {
      if (!attemptKeyRef.current) attemptKeyRef.current = newAttemptKey();
      const result = await placeOrder({
        data: {
          addressId: data.selectedAddressId,
          idempotencyKey: attemptKeyRef.current,
          locationSnapshotId:
            gpsResult && gpsResult.addressId === data.selectedAddressId ? gpsResult.snapshotId : null,
        },
      });
      if (result.ok) {
        setPlaced({ orderId: result.orderId, orderNumber: result.orderNumber });
        if (result.deliveryApprovalRequired) {
          // No Razorpay order is created: the final amount is not settled yet.
          setAwaitingApproval(true);
        } else {
          await openPayment(result.orderId, result.orderNumber);
        }
      } else {
        setOrderError(
          result.reason === "location_required"
            ? copy({ hi: "ऑर्डर के लिए डिलीवरी स्थान ज़रूरी है। कृपया स्थान चुनें।", en: "A delivery location is required for the order. Please choose a location." })
            : result.reason === "stock_changed"
            ? copy({
                hi: "स्टॉक बदल गया है। कृपया कार्ट दोबारा देखें और फिर कोशिश करें।",
                en: "Stock has changed. Please review your cart and try again.",
              })
            : result.reason === "delivery_not_confirmed"
              ? copy({
                  hi: "डिलीवरी शुल्क अभी दुकान द्वारा पुष्ट नहीं है।",
                  en: "The delivery charge has not been confirmed by the shop yet.",
                })
              : result.reason === "cart_empty"
                ? copy({ hi: "आपकी कार्ट खाली है।", en: "Your cart is empty." })
                : result.reason === "address_invalid"
                  ? copy({ hi: "यह पता उपलब्ध नहीं है। कृपया दूसरा पता चुनें।", en: "That address is not available. Please choose another one." })
                  : result.reason === "minimum_not_met"
                    ? copy({ hi: "न्यूनतम ऑर्डर राशि पूरी नहीं हुई है।", en: "The minimum order amount has not been reached." })
                    : copy({ hi: "ऑर्डर नहीं बन सका। कृपया दोबारा कोशिश करें।", en: "The order could not be created. Please try again." }),
        );
        await query.refetch();
      }
    } catch {
      setOrderError(copy({ hi: "ऑर्डर नहीं बन सका। कृपया दोबारा कोशिश करें।", en: "The order could not be created. Please try again." }));
    } finally {
      setPlacing(false);
      setPhase("idle");
    }
  }


  const data = query.data;
  // A valid location snapshot for the currently selected address is required.
  const locationReady = Boolean(data?.selectedAddressId && gpsResult && gpsResult.addressId === data.selectedAddressId && gpsResult.snapshotId);
  const selectedAddr = data?.addresses.find((a) => a.id === data.selectedAddressId) ?? null;
  const selectedNeedsApproval = Boolean(selectedAddr && !selectedAddr.deliveryApproved && selectedAddr.distanceKm === null);
  const hasApprovedAlternative = Boolean(data?.addresses.some((a) => a.id !== data.selectedAddressId && (a.deliveryApproved || a.distanceKm !== null)));

  return (
    <main>
      <PageIntro
        title={copy({ hi: "चेकआउट", en: "Checkout" })}
        description={copy({
          hi: "डिलीवरी पता चुनें, स्टॉक और कुल राशि जाँचें। भुगतान अगले चरण में जुड़ेगा।",
          en: "Choose a delivery address, check stock and totals. Payment arrives in the next step.",
        })}
      />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {query.isLoading ? (
          <LoadingGrid count={2} />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : !data || !data.lines.length ? (
          <div>
            <EmptyState
              title={copy({ hi: "आपकी कार्ट खाली है", en: "Your cart is empty" })}
              description={copy({
                hi: "चेकआउट के लिए कार्ट में कम से कम एक उत्पाद होना चाहिए।",
                en: "Add at least one product to your cart before checking out.",
              })}
            />
            <Button asChild className="mx-auto mt-5 flex w-fit rounded-full">
              <Link to="/products">{copy({ hi: "उत्पाद देखें", en: "Browse products" })}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-5">
              {(data.stockChanged || data.removed.length > 0) && (
                <div className="flex gap-3 rounded-lg bg-accent/10 p-4 ring-1 ring-accent/30">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
                  <p className="text-sm">
                    {copy({
                      hi: "स्टॉक बदल गया है। कुछ उत्पादों की मात्रा उपलब्ध स्टॉक के अनुसार कर दी गई है या कार्ट से हटा दी गई है। नीचे सूची दोबारा देखें।",
                      en: "Stock has changed. Some quantities were adjusted to what is available, or removed from the cart. Please review the list below.",
                    })}
                  </p>
                </div>
              )}

              <Section step={1} title={copy({ hi: "डिलीवरी पता", en: "Delivery address" })}>
                {!data.addresses.length ? (
                  <div className="rounded-md bg-surface p-4 text-sm">
                    <p>
                      {copy({
                        hi: "अभी कोई सहेजा हुआ पता नहीं है। डिलीवरी के लिए एक पता जोड़ें।",
                        en: "No saved address yet. Add one so we can deliver your order.",
                      })}
                    </p>
                    <Button asChild className="mt-4 rounded-full">
                      <Link to="/addresses">{copy({ hi: "पता जोड़ें", en: "Add an address" })}</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.addresses.map((address) => {
                      const active = address.id === data.selectedAddressId;
                      return (
                        <label
                          key={address.id}
                          className={`flex cursor-pointer gap-3 rounded-md p-4 ring-1 ${active ? "bg-surface ring-primary" : "ring-border"}`}
                        >
                          <input
                            type="radio"
                            name="checkout-address"
                            className="mt-1 size-4"
                            checked={active}
                            onChange={() => {
                              setAddressId(address.id);
                              setGpsResult(null);
                              setGpsMessage(null);
                            }}
                          />
                          <span className="text-sm">
                            <strong className="block">{address.fullName} · {address.phone}</strong>
                            <span className="block text-muted-foreground">
                              {[address.addressLine1, address.addressLine2, address.landmark, address.villageTown, address.district, address.state, address.pincode]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {address.distanceKm === null
                                ? copy({ hi: "डिलीवरी दूरी की पुष्टि दुकान करेगी", en: "The shop will confirm the delivery distance" })
                                : copy({
                                    hi: `दुकान से दूरी: ${address.distanceKm} किमी (दुकान द्वारा पुष्ट)`,
                                    en: `Distance from the shop: ${address.distanceKm} km (confirmed by the shop)`,
                                  })}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {data.selectedAddressId && (
                      <div ref={locationRef} className={`scroll-mt-24 rounded-md bg-surface p-4 text-sm transition-shadow duration-300 ${locationFlash ? "ring-2 ring-destructive/70" : locationWarn && !locationReady ? "ring-1 ring-destructive/50" : ""}`}>
                        {locationWarn && !locationReady && (
                          <p role="alert" className="mb-3 rounded-md bg-destructive/10 px-3 py-2 font-semibold text-destructive">
                            डिलीवरी के लिए अपना स्थान चुनना अनिवार्य है।<br /><span className="font-normal">Please select your delivery location to place the order.</span>
                          </p>
                        )}
                        <p className="font-semibold">{copy({ hi: "डिलीवरी के लिए अपना स्थान चुनें", en: "Choose your delivery location" })}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {copy({
                            hi: "ऑर्डर करने से पहले डिलीवरी स्थान ज़रूरी है।",
                            en: "A delivery location is required before placing the order.",
                          })}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lastLocation.data && (
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              disabled={gpsBusy}
                              onClick={() => { const id = data.selectedAddressId; if (id) void useLastLocation(id); }}
                            >
                              {copy({ hi: "पिछला स्थान इस्तेमाल करें", en: "Use last location" })}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full"
                            disabled={gpsBusy}
                            onClick={() => { const id = data.selectedAddressId; if (id) void useCurrentLocation(id); }}
                          >
                            {gpsBusy
                              ? copy({ hi: "लोकेशन ली जा रही है…", en: "Getting your location…" })
                              : copy({ hi: "📍 वर्तमान स्थान इस्तेमाल करें", en: "📍 Use current location" })}
                          </Button>
                        </div>
                        {gpsResult && gpsResult.addressId === data.selectedAddressId && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {copy({
                              hi: `लोकेशन मिल गई · लगभग ${gpsResult.distanceKm} किमी · ~${gpsResult.durationMin} मिनट`,
                              en: `Location received · about ${gpsResult.distanceKm} km · ~${gpsResult.durationMin} min`,
                            })}
                            {gpsResult.approximate
                              ? ` ${copy({ hi: "यह लोकेशन अनुमानित है।", en: "This location is approximate." })}`
                              : ""}
                          </p>
                        )}
                        {gpsMessage && <p className="mt-2 text-xs text-muted-foreground">{gpsMessage}</p>}
                      </div>
                    )}
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/addresses">{copy({ hi: "पते प्रबंधित करें", en: "Manage addresses" })}</Link>
                    </Button>
                  </div>
                )}
              </Section>

              <Section step={2} title={copy({ hi: "डिलीवरी", en: "Delivery" })}>
                <div className="flex gap-3 rounded-md bg-surface p-4 text-sm">
                  <Truck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-medium">
                      {copy({ hi: "कुल पीस", en: "Total pieces" })}: {data.pieces}
                    </p>
                    {data.delivery.state === "free" && (
                      <p className="mt-1 text-primary">{copy({ hi: "डिलीवरी मुफ़्त है।", en: "Delivery is free." })}</p>
                    )}
                    {data.delivery.state === "charged" && (
                      <p className="mt-1">
                        {copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" })}: {money(data.delivery.charge)}
                      </p>
                    )}
                    {(data.delivery.state === "distance_unknown" || data.delivery.state === "merchant_approval") && (
                      <div className="mt-1">
                        <p>
                          {data.delivery.state === "merchant_approval"
                            ? copy({
                                hi: "आपका पता दुकान की तय दूरी से बाहर है। डिलीवरी के लिए दुकान की पुष्टि ज़रूरी है।",
                                en: "Your address is beyond the shop's set distance. Delivery needs the shop's confirmation.",
                              })
                            : copy({
                                hi: "आपके पते तक की दूरी अभी अपने आप नहीं निकाली जा सकती, इसलिए डिलीवरी शुल्क दुकान तय करेगी।",
                                en: "The distance to your address cannot be worked out automatically yet, so the shop will confirm the delivery charge.",
                              })}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button asChild variant="outline" className="rounded-full">
                            <a href={`tel:${SHOP_PHONE}`}>
                              <Phone />
                              {copy({ hi: "दुकान को कॉल करें", en: "Call the shop" })}
                            </a>
                          </Button>
                          <Button asChild variant="outline" className="rounded-full">
                            <a href={SHOP_WHATSAPP} target="_blank" rel="noreferrer">
                              <MessageCircle />
                              {copy({ hi: "WhatsApp करें", en: "WhatsApp the shop" })}
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}
                    <p className="mt-3 text-muted-foreground">
                      <MapPin aria-hidden="true" className="mr-1 inline size-4" />
                      {data.delivery.rules.serviceArea}
                      {" · "}
                      {copy({
                        hi: data.delivery.rules.estimatedTextHi ?? "",
                        en: data.delivery.rules.estimatedText ?? "",
                      })}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {copy({
                        hi: `${data.delivery.rules.freeDeliveryMinPieces} या अधिक पीस और ${data.delivery.rules.freeDeliveryMaxKm} किमी तक — मुफ़्त · ${data.delivery.rules.tier1MaxKm} किमी तक ${money(data.delivery.rules.tier1Charge)} · ${data.delivery.rules.tier2MaxKm} किमी तक ${money(data.delivery.rules.tier2Charge)} · इससे आगे दुकान की पुष्टि ज़रूरी`,
                        en: `${data.delivery.rules.freeDeliveryMinPieces}+ pieces within ${data.delivery.rules.freeDeliveryMaxKm} km — free · up to ${data.delivery.rules.tier1MaxKm} km ${money(data.delivery.rules.tier1Charge)} · up to ${data.delivery.rules.tier2MaxKm} km ${money(data.delivery.rules.tier2Charge)} · beyond that the shop must confirm`,
                      })}
                    </p>
                  </div>
                </div>
              </Section>

              <Section step={3} title={copy({ hi: "अंतिम जाँच", en: "Final review" })}>
                <ul className="space-y-3">
                  {data.lines.map((line) => (
                    <li key={line.productId} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-md p-3 ring-1 ring-border">
                      <ImageFrame src={line.imageUrl} alt={copy({ hi: line.nameHi, en: line.name })} ratio="aspect-square" className="rounded-md" />
                      <div className="min-w-0">
                        <p className="font-semibold">{copy({ hi: line.nameHi, en: line.name })}</p>
                        <p className="text-sm text-muted-foreground">{line.pack}</p>
                        <p className="mt-1 text-sm">
                          {money(line.unitPrice)} × {line.quantity} = <strong>{money(line.lineTotal)}</strong>
                        </p>
                        {line.adjusted && (
                          <p className="mt-1 text-xs text-accent-strong">
                            {copy({
                              hi: `मात्रा ${line.requestedQuantity} से घटाकर ${line.quantity} कर दी गई है।`,
                              en: `Quantity reduced from ${line.requestedQuantity} to ${line.quantity}.`,
                            })}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="mt-4 rounded-full">
                  <Link to="/cart">{copy({ hi: "कार्ट बदलें", en: "Edit cart" })}</Link>
                </Button>
              </Section>

              <Section step={4} title={copy({ hi: "ऑनलाइन भुगतान", en: "Online payment" })}>
                <div className="flex items-start gap-3 rounded-md bg-surface p-4">
                  <CreditCard aria-hidden="true" className="mt-0.5 size-5" />
                  <p className="text-sm text-muted-foreground">
                    {copy({
                      hi: "केवल ऑनलाइन भुगतान उपलब्ध होगा। भुगतान अगले चरण में सुरक्षित रूप से जोड़ा जाएगा। Cash on Delivery उपलब्ध नहीं है।",
                      en: "Online payment only. Secure payment will be added in the next step. Cash on Delivery is not available.",
                    })}
                  </p>
                </div>
                {placed ? (
                  awaitingApproval ? (
                    <div className="mt-4 rounded-md bg-accent/10 p-4 text-sm ring-1 ring-accent/30">
                      <p className="font-semibold">
                        {copy({ hi: "डिलीवरी की पुष्टि आवश्यक है", en: "Delivery confirmation required" })}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {copy({
                          hi: `ऑर्डर ${placed.orderNumber} बन गया है। भुगतान से पहले दुकान आपका डिलीवरी शुल्क पक्का करेगी।`,
                          en: `Order ${placed.orderNumber} has been created. The shop will confirm your delivery charge before payment.`,
                        })}
                      </p>
                      <Button asChild variant="outline" className="mt-3 rounded-full">
                        <Link to="/orders/$id" params={{ id: placed.orderId }}>
                          {copy({ hi: "ऑर्डर देखें", en: "View order" })}
                        </Link>
                      </Button>
                    </div>
                  ) : payState === "paid" ? (
                    <div className="mt-4 rounded-md bg-primary/10 p-4 text-sm ring-1 ring-primary/30">
                      <p className="font-semibold text-primary">
                        {copy({ hi: "भुगतान सफल रहा", en: "Payment successful" })}
                      </p>
                      <p className="mt-1">
                        {copy({
                          hi: `आपका ऑर्डर ${placed.orderNumber} पक्का हो गया है।`,
                          en: `Your order ${placed.orderNumber} is confirmed.`,
                        })}
                      </p>
                      <Button asChild className="mt-3 rounded-full">
                        <Link to="/orders">{copy({ hi: "ऑर्डर देखें", en: "View order" })}</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-md bg-primary/10 p-4 text-sm ring-1 ring-primary/30">
                      <p className="font-semibold">
                        {copy({
                          hi: `ऑर्डर बन गया — ${placed.orderNumber}`,
                          en: `Order created — ${placed.orderNumber}`,
                        })}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {payState === "verifying"
                          ? copy({
                              hi: "भुगतान की पुष्टि की जा रही है…",
                              en: "Confirming your payment…",
                            })
                          : copy({
                              hi: "यह ऑर्डर अभी अवैतनिक (pending) है।",
                              en: "This order is still unpaid (pending).",
                            })}
                      </p>
                      {payError && (
                        <p className={`mt-2 ${payState === "failed" ? "text-destructive" : "text-accent-strong"}`}>{payError}</p>
                      )}
                      {payState === "none" && paymentNote && <p className="mt-2 text-accent-strong">{paymentNote}</p>}
                      {payState === "none" && orderError && <p className="mt-2 text-destructive">{orderError}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {payState !== "verifying" && payState !== "awaiting" && (
                          <Button
                            variant="outline"
                            className="rounded-full"
                            disabled={phase === "payment" || phase === "opening"}
                            onClick={() => void openPayment(placed.orderId, placed.orderNumber)}
                          >
                            {phase === "payment"
                              ? copy({ hi: "भुगतान तैयार हो रहा है…", en: "Creating payment…" })
                              : phase === "opening"
                                ? copy({ hi: "भुगतान विंडो खुल रही है…", en: "Opening payment…" })
                                : copy({ hi: "भुगतान करें", en: "Pay now" })}
                          </Button>
                        )}
                        <Button asChild variant="outline" className="rounded-full">
                          <Link to="/orders">{copy({ hi: "ऑर्डर देखें", en: "View order" })}</Link>
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    <Button
                      className="mt-4 h-12 w-full rounded-full"
                      disabled={!data.canPlaceOrder || placing}
                      aria-disabled={!locationReady || undefined}
                      onClick={() => {
                        if (!locationReady) {
                          // Order/payment stay blocked; just guide the customer to the location step.
                          setLocationWarn(true);
                          setLocationFlash(true);
                          window.setTimeout(() => setLocationFlash(false), 2200);
                          locationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          return;
                        }
                        void submit(data);
                      }}
                    >
                      {phase === "payment"
                        ? copy({ hi: "भुगतान तैयार हो रहा है…", en: "Creating payment…" })
                        : phase === "opening"
                        ? copy({ hi: "भुगतान विंडो खुल रही है…", en: "Opening payment…" })
                        : placing
                        ? copy({ hi: "ऑर्डर बनाया जा रहा है…", en: "Creating your order…" })
                        : copy({ hi: "ऑर्डर बनाएँ / भुगतान की ओर बढ़ें", en: "Place order / Continue to payment" })}
                    </Button>
                    {!locationReady && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {copy({ hi: "आगे बढ़ने के लिए ऊपर डिलीवरी स्थान चुनें।", en: "Choose your delivery location above to continue." })}
                      </p>
                    )}
                    {orderError && (
                      <p className="mt-3 text-sm text-destructive">{orderError}</p>
                    )}
                  </>
                )}
              </Section>

            </div>

            <aside className="h-fit rounded-lg bg-card p-5 ring-1 ring-border">
              <h2 className="font-display text-2xl font-semibold">{copy({ hi: "ऑर्डर सारांश", en: "Order summary" })}</h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt>{copy({ hi: "उत्पाद उप-योग", en: "Product subtotal" })}</dt>
                  <dd>{money(data.subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" })}</dt>
                  <dd className="text-right">
                    {data.delivery.confirmed
                      ? data.delivery.charge === 0
                        ? copy({ hi: "मुफ़्त", en: "Free" })
                        : money(data.delivery.charge)
                      : copy({ hi: "दुकान तय करेगी", en: "Shop will confirm" })}
                  </dd>
                </div>
                {data.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <dt>{copy({ hi: "छूट", en: "Discount" })}</dt>
                    <dd>−{money(data.discountAmount)}</dd>
                  </div>
                )}
                {data.tax.available && (
                  <div className="rounded-md bg-surface p-3">
                    <p className="font-medium">{copy({ hi: "इसमें GST शामिल है", en: "Includes GST" })}</p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p className="flex justify-between">
                        <span>{copy({ hi: "कर योग्य मूल्य", en: "Taxable value" })}</span>
                        <span>{money(data.tax.taxableValue)}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>CGST</span>
                        <span>{money(data.tax.cgst)}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>SGST</span>
                        <span>{money(data.tax.sgst)}</span>
                      </p>
                      {data.tax.linesWithoutRate > 0 && (
                        <p>
                          {copy({
                            hi: "कुछ उत्पादों पर GST दर अभी दर्ज नहीं है।",
                            en: "Some products do not have a GST rate recorded yet.",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-3 text-base font-bold">
                  <dt>{copy({ hi: "कुल देय", en: "Total payable" })}</dt>
                  <dd>
                    {money(data.total)}
                    {!data.delivery.confirmed && ` + ${copy({ hi: "डिलीवरी", en: "delivery" })}`}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {copy({
                  hi: "कीमत, स्टॉक, डिलीवरी शुल्क और कर हर बार सर्वर पर दोबारा जाँचे जाते हैं।",
                  en: "Price, stock, delivery charge and tax are re-checked on the server every time.",
                })}
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
