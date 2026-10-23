import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getDeliveryPrintData } from "@/lib/delivery.functions";
import { formatAddress } from "@/lib/orders-shared";
import { useCopy } from "@/lib/store-context";

const ERRORS: Record<string, { hi: string; en: string }> = {
  ORDER_NOT_OUT_FOR_DELIVERY: { hi: "यह ऑर्डर अभी डिलीवरी पर नहीं है।", en: "This order is not out for delivery." },
  PAYMENT_NOT_CONFIRMED: { hi: "भुगतान की पुष्टि नहीं हुई है।", en: "Payment is not confirmed." },
  INVENTORY_NOT_FULFILLED: { hi: "इस ऑर्डर का स्टॉक अभी घटा नहीं है।", en: "Stock has not been deducted for this order." },
  DELIVERY_ALREADY_CONFIRMED: { hi: "इस ऑर्डर की डिलीवरी पहले ही पूरी हो चुकी है।", en: "This delivery is already confirmed." },
  FORBIDDEN: { hi: "केवल दुकान ही यह कर सकती है।", en: "Only the shop can do this." },
  ORDER_NOT_FOUND: { hi: "ऑर्डर नहीं मिला।", en: "Order not found." },
};

/** High-resolution QR (vector-quality PNG, high error correction) for paper scanning. */
function PrintQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, { margin: 2, width: 1024, errorCorrectionLevel: "M" }).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [value]);
  if (!src) return null;
  return <img src={src} alt="Delivery QR" className="mx-auto h-[8cm] w-[8cm] bg-white" style={{ imageRendering: "pixelated" }} />;
}

/** Merchant-only printable sheet: current active QR + the order's address snapshot. No PIN, no code. */
export function DeliveryPrintPage({ id }: { id: string }) {
  const copy = useCopy();
  const fetchData = useServerFn(getDeliveryPrintData);
  // Always fetched fresh so a reissued QR is printed, never a cached old one.
  const query = useQuery({
    queryKey: ["admin-delivery-print", id],
    queryFn: () => fetchData({ data: { orderId: id } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const data = query.data;

  return <div className="px-4 py-6">
    <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3">
      <Button asChild variant="outline" className="rounded-full">
        <Link to="/admin/orders/$id" params={{ id }}>{copy({ hi: "ऑर्डर पर वापस", en: "Back to order" })}</Link>
      </Button>
      <Button className="rounded-full" disabled={!data || "error" in data} onClick={() => window.print()}>
        <Printer />
        {copy({ hi: "प्रिंट करें", en: "Print" })}
      </Button>
    </div>

    {query.isLoading && <p className="text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">{copy({ hi: "QR लोड नहीं हो सका।", en: "Could not load the QR." })}</p>}
    {data && "error" in data && <p role="alert" className="text-sm text-destructive">{copy(ERRORS[data.error] ?? { hi: "अभी यह संभव नहीं है।", en: "This is not possible right now." })}</p>}

    {data && !("error" in data) && <article className="print-sheet mx-auto max-w-3xl rounded-lg bg-card p-8 ring-1 ring-border">
      <p className="text-center text-sm">Shreekant Seeds · {copy({ hi: "ऑर्डर", en: "Order" })} {data.orderNumber}</p>
      <div className="mt-6"><PrintQr value={`${origin}/d/${data.token}`} /></div>
      <p className="mt-2 text-center text-xs">{copy({ hi: "डिलीवरी पर यह QR स्कैन करें", en: "Scan this QR at delivery" })}</p>
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">{copy({ hi: "डिलीवरी पता", en: "Delivery address" })}</h2>
        {data.address ? <div className="mt-2 space-y-1 text-base">
          {data.address.full_name && <p className="font-semibold">{data.address.full_name}</p>}
          {data.address.phone && <p>{data.address.phone}</p>}
          {formatAddress(data.address).map((line) => <p key={line}>{line}</p>)}
        </div> : <p className="mt-2 text-sm">{copy({ hi: "पता दर्ज नहीं", en: "Address not recorded" })}</p>}
      </div>
    </article>}
  </div>;
}
