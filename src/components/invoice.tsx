import { Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { money } from "@/components/store/core";
import { getAdminInvoice, getMyInvoice } from "@/lib/invoice.functions";
import { SHOP, type InvoiceData } from "@/lib/invoice-shared";
import { PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS, formatAddress, formatDate } from "@/lib/orders-shared";
import { useCopy, useStore } from "@/lib/store-context";

/**
 * Phase 6 — printable invoice for one order.
 *
 * Everything shown comes from the order snapshot. Selling prices are
 * GST-inclusive, so the per-line GST shown is extracted from the line total and
 * never added on top. Order-level tax figures are the stored snapshot values.
 */

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 text-sm ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InvoiceSheet({ invoice }: { invoice: InvoiceData }) {
  const copy = useCopy();
  const { language } = useStore();
  const gstTotal = invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount;
  const addressLines = formatAddress(invoice.deliveryAddress);
  // GST-inclusive selling prices: when a rate was never recorded the stored
  // taxable/GST figures cannot be trusted (a missing rate is not 0% GST).
  const missingGstRate = invoice.items.some((item) => item.taxRate === null);
  const allGstRatesMissing = invoice.items.length > 0 && invoice.items.every((item) => item.taxRate === null);
  const notRecorded = copy({ hi: "दर्ज नहीं", en: "Not recorded" });
  const gstIncluded = copy({ hi: "शामिल है", en: "Included" });

  return (
    <article className="print-sheet mx-auto max-w-3xl rounded-lg bg-card p-5 ring-1 ring-border sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-3xl font-semibold">{copy(SHOP.name)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy(SHOP.address)}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-display text-xl font-semibold">{copy({ hi: "चालान", en: "Invoice" })}</p>
          {invoice.invoiceNumber ? (
            <>
              <p className="mt-1">{invoice.invoiceNumber}</p>
              {invoice.invoiceIssuedAt && (
                <p className="text-muted-foreground">{formatDate(invoice.invoiceIssuedAt, language)}</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {copy({
                hi: "भुगतान की पुष्टि के बाद चालान संख्या जारी होगी।",
                en: "An invoice number is issued once payment is confirmed.",
              })}
            </p>
          )}
        </div>
      </header>

      <section className="grid gap-5 py-5 sm:grid-cols-2">
        <div>
          <p className="eyebrow">{copy({ hi: "ग्राहक", en: "Customer" })}</p>
          <p className="mt-1 font-medium">{invoice.customerName ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{invoice.customerPhone ?? "—"}</p>
          {addressLines.map((line) => (
            <p key={line} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
          {invoice.deliveryDistanceKm !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {copy({ hi: "दूरी", en: "Distance" })}: {invoice.deliveryDistanceKm} km
            </p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="eyebrow">{copy({ hi: "ऑर्डर", en: "Order" })}</p>
          <p className="mt-1 font-medium">{invoice.orderNumber}</p>
          <p className="text-sm text-muted-foreground">{formatDate(invoice.orderDate, language)}</p>
          <p className="mt-2 text-sm">
            {copy(ORDER_STATUS_LABELS[invoice.status] ?? { hi: invoice.status, en: invoice.status })}
          </p>
          <p className={`text-sm ${invoice.isPaid ? "text-[var(--color-success)]" : "text-muted-foreground"}`}>
            {copy(PAYMENT_STATUS_LABELS[invoice.paymentStatus] ?? { hi: invoice.paymentStatus, en: invoice.paymentStatus })}
          </p>
        </div>
      </section>

      <section className="overflow-x-auto border-y border-border py-2">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">{copy({ hi: "उत्पाद", en: "Item" })}</th>
              <th className="py-2 px-2 font-medium">HSN</th>
              <th className="py-2 px-2 text-right font-medium">{copy({ hi: "मात्रा", en: "Qty" })}</th>
              <th className="py-2 px-2 text-right font-medium">{copy({ hi: "दर", en: "Rate" })}</th>
              <th className="py-2 px-2 text-right font-medium">GST</th>
              <th className="py-2 pl-2 text-right font-medium">{copy({ hi: "कुल", en: "Amount" })}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => {
              return (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="py-2 pr-2">
                    <p className="font-medium">{language === "hi" ? item.productNameHi : item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.productType, item.packSize, item.unit, item.sku].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {item.hsnCode ?? copy({ hi: "दर्ज नहीं", en: "Not recorded" })}
                  </td>
                  <td className="px-2 py-2 text-right">{item.quantity}</td>
                  <td className="px-2 py-2 text-right">{money(item.unitPrice)}</td>
                  <td className="px-2 py-2 text-right">
                    <span className="text-muted-foreground">{gstIncluded}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {copy({ hi: "GST सूचीबद्ध मूल्य में शामिल है।", en: "GST included in the listed price." })}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right font-semibold">{money(item.totalPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="ml-auto mt-5 max-w-xs space-y-1">
        <Line label={copy({ hi: "उप-योग (GST सहित)", en: "Subtotal (incl. GST)" })} value={money(invoice.subtotal)} />
        {invoice.discountAmount > 0 && (
          <Line label={copy({ hi: "छूट", en: "Discount" })} value={`- ${money(invoice.discountAmount)}`} />
        )}
        <Line label={copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" })} value={money(invoice.deliveryCharge)} />
        {/*
          Tax figures come from the order snapshot. When NO item has a recorded
          GST rate, the stored taxable/GST figures are meaningless (a missing
          rate is not 0% GST), so the tax summary is hidden entirely rather
          than showing "Not recorded" or implying ₹0. When any rate IS
          recorded, the breakdown shows the stored snapshot amounts and the
          totals below are never recalculated.
        */}
        {!allGstRatesMissing && (
          <>
            <Line
              label={copy({ hi: "कर योग्य मूल्य", en: "Taxable value" })}
              value={missingGstRate ? notRecorded : money(invoice.taxableValue)}
            />
            <Line label="CGST" value={money(invoice.cgstAmount)} />
            <Line label="SGST" value={money(invoice.sgstAmount)} />
            <Line label="IGST" value={money(invoice.igstAmount)} />
            <Line label={copy({ hi: "कुल GST", en: "Total GST" })} value={money(gstTotal)} />
          </>
        )}
        <div className="border-t border-border pt-1">
          <Line strong label={copy({ hi: "कुल राशि", en: "Total amount" })} value={money(invoice.totalAmount)} />
        </div>
      </section>

      <footer className="mt-6 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>
          {copy({
            hi: "सभी उत्पाद मूल्य GST सहित हैं। GST सूचीबद्ध मूल्यों में शामिल है और अलग से नहीं जोड़ा जाता।",
            en: "All product prices are GST-inclusive. GST is included in the listed prices and is not added separately.",
          })}
        </p>
        {!invoice.isPaid && (
          <p>
            {copy({
              hi: "यह चालान अभी भुगतान प्राप्त नहीं दर्शाता है।",
              en: "This invoice does not represent a received payment.",
            })}
          </p>
        )}
      </footer>
    </article>
  );
}

function PrintBar({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  const copy = useCopy();
  return (
    <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3">
      <Button asChild variant="outline" className="rounded-full">
        <Link to={backTo as never}>{backLabel}</Link>
      </Button>
      <Button className="rounded-full" onClick={() => window.print()}>
        <Printer />
        {copy({ hi: "प्रिंट / PDF सेव करें", en: "Print / Save as PDF" })}
      </Button>
    </div>
  );
}

function InvoiceBody({
  invoice,
  isLoading,
  isError,
}: {
  invoice: InvoiceData | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const copy = useCopy();
  if (isLoading) return <p className="text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>;
  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {copy({ hi: "चालान लोड नहीं हो सका।", en: "Could not load this invoice." })}
      </p>
    );
  if (!invoice)
    return (
      <p className="text-sm text-muted-foreground">
        {copy({ hi: "यह चालान उपलब्ध नहीं है।", en: "This invoice is not available." })}
      </p>
    );
  return <InvoiceSheet invoice={invoice} />;
}

export function CustomerInvoicePage({ id }: { id: string }) {
  const copy = useCopy();
  const fetchInvoice = useServerFn(getMyInvoice);
  const query = useQuery({
    queryKey: ["customer-invoice", id],
    queryFn: () => fetchInvoice({ data: { orderId: id } }),
    retry: false,
  });
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PrintBar backTo="/orders" backLabel={copy({ hi: "ऑर्डर पर वापस", en: "Back to orders" })} />
      <InvoiceBody invoice={query.data} isLoading={query.isLoading} isError={query.isError} />
    </main>
  );
}

export function AdminInvoicePage({ id }: { id: string }) {
  const copy = useCopy();
  const fetchInvoice = useServerFn(getAdminInvoice);
  const query = useQuery({
    queryKey: ["admin-invoice", id],
    queryFn: () => fetchInvoice({ data: { orderId: id } }),
    retry: false,
  });
  return (
    <>
      <PrintBar backTo="/admin/orders" backLabel={copy({ hi: "ऑर्डर पर वापस", en: "Back to orders" })} />
      <InvoiceBody invoice={query.data} isLoading={query.isLoading} isError={query.isError} />
    </>
  );
}
