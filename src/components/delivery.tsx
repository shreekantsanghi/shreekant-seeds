import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/store/core";
import { confirmDelivery, getMyDeliveryCredentials, issueDeliveryCredentials } from "@/lib/delivery.functions";
import { useCopy } from "@/lib/store-context";

/** Renders a QR whose only content is the public confirmation URL. */
function QrImage({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, { margin: 1, width: 220 }).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [value]);
  if (!src) return null;
  return <img src={src} alt={label} width={220} height={220} className="rounded-md bg-white p-2" />;
}

const ISSUE_ERRORS: Record<string, { hi: string; en: string }> = {
  ORDER_NOT_OUT_FOR_DELIVERY: { hi: "यह ऑर्डर अभी डिलीवरी पर नहीं है।", en: "This order is not out for delivery." },
  PAYMENT_NOT_CONFIRMED: { hi: "भुगतान की पुष्टि नहीं हुई है।", en: "Payment is not confirmed." },
  INVENTORY_NOT_FULFILLED: { hi: "इस ऑर्डर का स्टॉक अभी घटा नहीं है।", en: "Stock has not been deducted for this order." },
  DELIVERY_ALREADY_CONFIRMED: { hi: "इस ऑर्डर की डिलीवरी पहले ही पूरी हो चुकी है।", en: "This delivery is already confirmed." },
  FORBIDDEN: { hi: "केवल दुकान ही यह कर सकती है।", en: "Only the shop can do this." },
};

/**
 * Merchant panel. Credentials are created only when the shop presses a button —
 * never on page load — because only hashes are stored and a new credential
 * immediately invalidates the previous QR and code.
 */
export function DeliveryCredentialsPanel({ orderId }: { orderId: string }) {
  const copy = useCopy();
  const issue = useServerFn(issueDeliveryCredentials);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ token: string; code: string; pin: string; expiresAt: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (reissue: boolean) => issue({ data: { orderId, reissue } }),
    onSuccess: (data) => {
      setError(null);
      if ("error" in data) {
        setResult(null);
        setError(copy(ISSUE_ERRORS[data.error] ?? { hi: "अभी यह संभव नहीं है।", en: "This is not possible right now." }));
        return;
      }
      setResult({ token: data.token, code: data.code, pin: data.pin, expiresAt: data.expiresAt });
    },
    onError: () => setError(copy({ hi: "डिलीवरी कोड नहीं बन सका।", en: "The delivery code could not be created." })),
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return <div className="rounded-lg bg-card p-5 ring-1 ring-border">
    <h2 className="font-display text-xl font-semibold">{copy({ hi: "डिलीवरी QR और कोड", en: "Delivery QR and code" })}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{copy({
      hi: "डिलीवरी करने वाले को केवल डिलीवरी-पर्सन PIN दें। ग्राहक का कोड ग्राहक के पास ही रहेगा। डिलीवरी तभी पूरी होगी जब दोनों मिलेंगे।",
      en: "Give only the delivery-person PIN to the delivery person. The customer keeps their own code. Delivery completes only when both are entered together.",
    })}</p>

    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" className="rounded-full" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
        {copy({ hi: "डिलीवरी QR/कोड दिखाएँ", en: "Show delivery QR/code" })}
      </Button>
      <Button size="sm" variant="outline" className="rounded-full" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
        {copy({ hi: "नया QR/कोड जारी करें", en: "Reissue delivery QR/code" })}
      </Button>
    </div>

    {result && <div className="mt-4 space-y-3 rounded-md bg-surface p-4">
      <QrImage value={`${origin}/d/${result.token}`} label={copy({ hi: "डिलीवरी QR", en: "Delivery QR" })} />
      <div>
        <p className="text-sm text-muted-foreground">{copy({ hi: "ग्राहक का डिलीवरी कोड", en: "Customer delivery code" })}</p>
        <p className="font-display text-3xl font-semibold tracking-[0.3em]">{result.code}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{copy({ hi: "डिलीवरी-पर्सन PIN", en: "Delivery-person PIN" })}</p>
        <p className="font-display text-3xl font-semibold tracking-[0.3em]">{result.pin}</p>
        <p className="text-xs text-muted-foreground">{copy({
          hi: "यह PIN केवल डिलीवरी करने वाले को दें। ग्राहक को यह कभी न दिखाएँ।",
          en: "Give this PIN only to the delivery person. Never show it to the customer.",
        })}</p>
      </div>
      <p className="text-xs text-muted-foreground">{copy({ hi: "वैध रहेगा", en: "Valid until" })}: {new Date(result.expiresAt).toLocaleString("en-IN")}</p>
      <p className="text-xs text-muted-foreground">{copy({
        hi: "ग्राहक को केवल QR और उसका अपना कोड दिखता है। “नया QR/कोड जारी करें” दबाने पर पुराना QR, कोड और PIN तुरंत बेकार हो जाएंगे।",
        en: "The customer sees only the QR and their own code. Pressing “Reissue delivery QR/code” makes the old QR, code and PIN stop working immediately.",
      })}</p>
    </div>}

    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>;
}

/**
 * Public confirmation page. It shows nothing about the order — not even whether
 * the scanned token belongs to a real one — until a correct code is entered,
 * and then only a generic success message.
 */
export function PublicDeliveryConfirm({ token }: { token: string }) {
  const copy = useCopy();
  const confirm = useServerFn(confirmDelivery);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => confirm({ data: { token, pin, code } }),
    onSuccess: (data) => {
      if (data.ok) {
        setDone(true);
        setMessage(copy({ hi: "डिलीवरी की पुष्टि हो गई।", en: "Delivery confirmed successfully." }));
      } else {
        setMessage(copy({ hi: "डिलीवरी की पुष्टि नहीं हो सकी।", en: "Delivery confirmation could not be completed." }));
      }
    },
    onError: () => setMessage(copy({ hi: "डिलीवरी की पुष्टि नहीं हो सकी।", en: "Delivery confirmation could not be completed." })),
  });

  const valid = /^[0-9]{6}$/.test(code) && /^[0-9]{6}$/.test(pin);

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
    <Brand />
    <h1 className="font-display text-3xl font-semibold">{copy({ hi: "डिलीवरी की पुष्टि करें", en: "Confirm delivery" })}</h1>
    {done ? <p role="status" className="rounded-md bg-primary/10 p-4 text-sm font-medium text-primary">{message}</p> : <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !mutation.isPending) mutation.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">{copy({
        hi: "अपना डिलीवरी-पर्सन PIN भरें और ग्राहक से 6 अंकों का डिलीवरी कोड पूछकर भरें।",
        en: "Enter your delivery-person PIN, then ask the customer for their 6-digit delivery code and enter it.",
      })}</p>
      <label className="block text-sm font-medium" htmlFor="delivery-pin">{copy({ hi: "डिलीवरी-पर्सन PIN", en: "Delivery-person PIN" })}</label>
      <input
        id="delivery-pin"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, ""))}
        className="h-14 w-full rounded-md bg-card px-4 text-center font-display text-2xl tracking-[0.4em] ring-1 ring-border outline-none focus:ring-2 focus:ring-ring"
      />
      <label className="block text-sm font-medium" htmlFor="delivery-code">{copy({ hi: "ग्राहक का डिलीवरी कोड", en: "Customer delivery code" })}</label>
      <input
        id="delivery-code"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
        className="h-14 w-full rounded-md bg-card px-4 text-center font-display text-2xl tracking-[0.4em] ring-1 ring-border outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" className="h-12 w-full rounded-full" disabled={!valid || mutation.isPending}>
        {copy({ hi: "डिलीवरी पूरी करें", en: "Confirm delivery" })}
      </Button>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </form>}
  </main>;
}

const CUSTOMER_ERRORS: Record<string, { hi: string; en: string }> = {
  CREDENTIAL_NOT_ISSUED: {
    hi: "दुकान ने अभी डिलीवरी QR और कोड जारी नहीं किया है। थोड़ी देर बाद देखें या दुकान से संपर्क करें।",
    en: "The shop has not issued the delivery QR and code yet. Check again shortly or contact the shop.",
  },
  CREDENTIAL_EXPIRED: {
    hi: "इस ऑर्डर का डिलीवरी QR/कोड समाप्त हो गया है। कृपया दुकान से संपर्क करें।",
    en: "The delivery QR/code for this order has expired. Please contact the shop.",
  },
  CREDENTIAL_LOCKED: {
    hi: "बहुत बार गलत कोड डालने के कारण यह डिलीवरी कोड बंद हो गया है। कृपया दुकान से संपर्क करें।",
    en: "This delivery code is locked after too many wrong attempts. Please contact the shop.",
  },
};

/**
 * Customer view of the shop's active credential. The database reproduces the
 * same token and code from a server-only secret, so opening this card never
 * replaces the QR, resets attempts, or extends the expiry.
 */
export function CustomerDeliveryCard({ orderId }: { orderId: string }) {
  const copy = useCopy();
  const fetchCredentials = useServerFn(getMyDeliveryCredentials);
  const query = useQuery({
    queryKey: ["my-delivery-credentials", orderId],
    queryFn: () => fetchCredentials({ data: { orderId } }),
    retry: false,
    staleTime: 60_000,
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const data = query.data;

  return <div className="mt-4 rounded-md bg-surface p-4">
    <p className="font-display text-lg font-semibold">{copy({ hi: "डिलीवरी की पुष्टि", en: "Delivery confirmation" })}</p>
    <p className="mt-1 text-sm text-muted-foreground">{copy({
      hi: "डिलीवरी करने वाले को यह QR दिखाएँ और नीचे दिया 6 अंकों का कोड बताएँ।",
      en: "Show this QR code to the delivery person and tell them the 6-digit code below.",
    })}</p>

    {query.isLoading && <p className="mt-3 text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>}

    {data && "error" in data && <p className="mt-3 text-sm text-muted-foreground">{copy(
      CUSTOMER_ERRORS[data.error] ?? { hi: "अभी डिलीवरी कोड उपलब्ध नहीं है। कृपया दुकान से संपर्क करें।", en: "The delivery code is not available right now. Please contact the shop." },
    )}</p>}

    {data && !("error" in data) && <div className="mt-3 space-y-3">
      <QrImage value={`${origin}/d/${data.token}`} label={copy({ hi: "डिलीवरी QR", en: "Delivery QR" })} />
      <p className="text-sm text-muted-foreground">{copy({ hi: "डिलीवरी कोड", en: "Delivery code" })}</p>
      <p className="font-display text-3xl font-semibold tracking-[0.3em]">{data.code}</p>
      <p className="text-xs text-muted-foreground">{copy({
        hi: "डिलीवरी करने वाला QR स्कैन करके यही कोड भरेगा, तभी डिलीवरी पूरी मानी जाएगी।",
        en: "The delivery person will scan the QR and enter this code to confirm delivery.",
      })}</p>
      <p className="text-xs text-muted-foreground">{copy({ hi: "वैध रहेगा", en: "Valid until" })}: {new Date(data.expiresAt).toLocaleString("en-IN")}</p>
    </div>}
  </div>;
}
