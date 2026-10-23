import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminHeading } from "@/components/admin/core";
import { money } from "@/components/store/core";
import { Button } from "@/components/ui/button";
import { getAdminReport, type ReportPeriod } from "@/lib/admin-reports.functions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDate } from "@/lib/orders-shared";
import type { AdminReport } from "@/lib/admin-reports.functions";
import { useCopy, useStore } from "@/lib/store-context";

const PERIOD_LABELS: { value: ReportPeriod; hi: string; en: string }[] = [
  { value: "today", hi: "आज", en: "Today" },
  { value: "week", hi: "इस सप्ताह", en: "This week" },
  { value: "month", hi: "इस महीने", en: "This month" },
  { value: "quarter", hi: "इस तिमाही", en: "This quarter" },
  { value: "year", hi: "इस साल", en: "This year" },
  { value: "custom", hi: "अपनी तारीख़", en: "Custom range" },
];

function Tile({ label, value, detail, onClick }: { label: string; value: string; detail?: string | undefined; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </>
  );
  if (!onClick) return <div className="rounded-lg bg-card p-5 ring-1 ring-border">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="rounded-lg bg-card p-5 text-left ring-1 ring-border transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </button>
  );
}

type Metric = "gross" | "paid" | "average" | "delivery" | "refunds" | "net";

function MetricDialog({ metric, report, onClose }: { metric: Metric; report: AdminReport; onClose: () => void }) {
  const copy = useCopy();
  const { language } = useStore();
  const { sales, refunds, paidOrderRows } = report;
  const titles: Record<Metric, { hi: string; en: string }> = {
    gross: { hi: "कुल (ग्रॉस) आमदनी", en: "Gross revenue" },
    paid: { hi: "भुगतान वाले ऑर्डर", en: "Paid orders" },
    average: { hi: "औसत ऑर्डर मूल्य", en: "Average order value" },
    delivery: { hi: "डिलीवरी शुल्क", en: "Delivery charges" },
    refunds: { hi: "रिफंड", en: "Refunds" },
    net: { hi: "शुद्ध आमदनी", en: "Net revenue" },
  };
  const th = "pb-2 pr-3";
  const td = "py-2 pr-3";
  const empty = (t: { hi: string; en: string }) => <p className="text-sm text-muted-foreground">{copy(t)}</p>;

  const orders = (showDelivery: boolean) =>
    paidOrderRows.length === 0 ? (
      empty({ hi: "इस अवधि में कोई भुगतान वाला ऑर्डर नहीं।", en: "No paid orders in this period." })
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className={th}>{copy({ hi: "ऑर्डर", en: "Order" })}</th>
              <th className={th}>{copy({ hi: "तारीख़", en: "Date" })}</th>
              <th className={th}>{copy({ hi: "ग्राहक", en: "Customer" })}</th>
              <th className={`${th} text-right`}>{showDelivery ? copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" }) : copy({ hi: "कुल", en: "Total" })}</th>
              {!showDelivery && <th className={th}>{copy({ hi: "भुगतान", en: "Payment" })}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paidOrderRows.map((o) => (
              <tr key={o.id}>
                <td className={td}>{o.orderNumber}</td>
                <td className={td}>{formatDate(o.date, language)}</td>
                <td className={td}>{o.customer || "—"}</td>
                <td className={`${td} text-right`}>{money(showDelivery ? o.deliveryCharge : o.total)}</td>
                {!showDelivery && <td className={td}>{copy(PAYMENT_STATUS_LABELS[o.paymentStatus] ?? { hi: o.paymentStatus, en: o.paymentStatus })}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const refundList =
    refunds.rows.length === 0 ? (
      empty({ hi: "इस अवधि में कोई रिफंड नहीं।", en: "No refunds in this period." })
    ) : (
      <ul className="space-y-2 text-sm">
        {refunds.rows.map((r) => (
          <li key={r.id} className="rounded-md bg-surface p-3">
            <p className="font-semibold">{r.orderNumber} · {copy({ hi: "रिफंड हो गया", en: "Refund processed" })}</p>
            <p>{copy({ hi: "मूल ऑर्डर", en: "Original order" })}: {money(r.orderAmount)}</p>
            <p>{copy({ hi: "रिफंड", en: "Refund" })}: {money(r.amount)}</p>
            <p>{copy({ hi: "बची (शुद्ध) राशि", en: "Retained / net amount" })}: {money(Math.max(0, r.orderAmount - r.amount))}</p>
            <p className="text-muted-foreground">{formatDate(r.date, language)}{r.reason ? ` · ${r.reason}` : ""}</p>
          </li>
        ))}
      </ul>
    );

  const line = (label: { hi: string; en: string }, value: string, strong = false) => (
    <p className={strong ? "font-semibold" : undefined}>{copy(label)}: {value}</p>
  );

  let content: ReactNode;
  if (metric === "gross" || metric === "paid") content = orders(false);
  else if (metric === "delivery") content = orders(true);
  else if (metric === "refunds") content = refundList;
  else if (metric === "average")
    content = (
      <>
        <div className="space-y-1 rounded-md bg-surface p-3 text-sm">
          {line({ hi: "कुल आमदनी", en: "Gross revenue" }, money(sales.totalRevenue))}
          {line({ hi: "भुगतान वाले ऑर्डर", en: "Paid orders" }, String(sales.paidOrders))}
          {line({ hi: "औसत", en: "Average" }, `${money(sales.totalRevenue)} ÷ ${sales.paidOrders} = ${money(sales.averageOrderValue)}`, true)}
        </div>
        {orders(false)}
      </>
    );
  else
    content = (
      <>
        <div className="space-y-1 rounded-md bg-surface p-3 text-sm">
          {line({ hi: "कुल आमदनी", en: "Gross revenue" }, money(sales.totalRevenue))}
          {line({ hi: "− रिफंड", en: "− Refunds" }, money(refunds.totalRefunded))}
          {line({ hi: "= शुद्ध आमदनी", en: "= Net revenue" }, money(refunds.netRevenue), true)}
        </div>
        <h3 className="text-sm font-semibold">{copy({ hi: "ऑर्डर", en: "Orders" })}</h3>
        {orders(false)}
        <h3 className="text-sm font-semibold">{copy({ hi: "रिफंड", en: "Refunds" })}</h3>
        {refundList}
      </>
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy(titles[metric])}</DialogTitle>
          <DialogDescription>{copy({ hi: "चुनी हुई अवधि के अनुसार।", en: "For the selected period." })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">{content}</div>
      </DialogContent>
    </Dialog>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-card ring-1 ring-border">
      <div className="border-b border-border p-5">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function AdminReports({ initialPeriod }: { initialPeriod?: ReportPeriod }) {
  const copy = useCopy();
  const { language } = useStore();
  const [metric, setMetric] = useState<Metric | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod ?? "month");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const load = useServerFn(getAdminReport);
  const customReady = period !== "custom" || (start !== "" && end !== "");

  const reportQuery = useQuery({
    queryKey: ["admin-report", period, period === "custom" ? start : "", period === "custom" ? end : ""],
    queryFn: () => load({ data: { period, start: start || undefined, end: end || undefined } }),
    enabled: customReady,
    retry: false,
  });

  const report = reportQuery.data;
  const statusKeys = Object.keys(ORDER_STATUS_LABELS);

  return (
    <>
      <AdminHeading
        title={copy({ hi: "रिपोर्ट", en: "Reports" })}
        description={copy({
          hi: "चुनी हुई अवधि की असली बिक्री, ऑर्डर, उत्पाद, स्टॉक, ग्राहक और डिलीवरी जानकारी।",
          en: "Real sales, orders, products, stock, customers and delivery figures for the selected period.",
        })}
      />

      <div className="flex flex-wrap gap-2">
        {PERIOD_LABELS.map((p) => (
          <Button key={p.value} size="sm" variant={period === p.value ? "default" : "outline"} onClick={() => setPeriod(p.value)}>
            {copy({ hi: p.hi, en: p.en })}
          </Button>
        ))}
      </div>

      {period === "custom" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground">
            {copy({ hi: "शुरू", en: "From" })}
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="ml-2 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
          </label>
          <label className="text-sm text-muted-foreground">
            {copy({ hi: "अंत", en: "To" })}
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="ml-2 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
          </label>
        </div>
      )}

      {!customReady && <p className="mt-6 text-sm text-muted-foreground">{copy({ hi: "दोनों तारीख़ें चुनें।", en: "Choose both dates." })}</p>}
      {customReady && reportQuery.isLoading && <p className="mt-6 text-sm text-muted-foreground">{copy({ hi: "रिपोर्ट बन रही है…", en: "Loading the report…" })}</p>}
      {customReady && reportQuery.isError && (
        <p role="alert" className="mt-6 rounded-lg bg-card p-5 text-sm text-destructive ring-1 ring-border">
          {copy({ hi: "रिपोर्ट लोड नहीं हो सकी।", en: "Could not load the report." })}
        </p>
      )}

      {report && (
        <div className="mt-6 grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile onClick={() => setMetric("gross")} label={copy({ hi: "कुल (ग्रॉस) आमदनी", en: "Gross revenue" })} value={money(report.sales.totalRevenue)} detail={copy({ hi: "भुगतान हो चुके ऑर्डर, GST सहित संग्रहित कुल", en: "Paid orders, stored GST-inclusive totals" })} />
            <Tile onClick={() => setMetric("paid")} label={copy({ hi: "भुगतान वाले ऑर्डर", en: "Paid orders" })} value={String(report.sales.paidOrders)} detail={copy({ hi: "रद्द ऑर्डर शामिल नहीं", en: "Cancelled orders excluded" })} />
            <Tile onClick={() => setMetric("average")} label={copy({ hi: "औसत ऑर्डर मूल्य", en: "Average order value" })} value={money(report.sales.averageOrderValue)} />
            <Tile onClick={() => setMetric("delivery")} label={copy({ hi: "डिलीवरी शुल्क", en: "Delivery charges" })} value={money(report.sales.deliveryCharges)} detail={copy({ hi: "कुल आमदनी में शामिल, अलग से दिखाया गया", en: "Included in revenue, shown separately" })} />
            <Tile onClick={() => setMetric("refunds")} label={copy({ hi: "रिफंड", en: "Refunds" })} value={money(report.refunds.totalRefunded)} detail={copy({ hi: `${report.refunds.refundedOrders} ऑर्डर में सफल रिफंड`, en: `${report.refunds.refundedOrders} orders with a processed refund` })} />
            <Tile onClick={() => setMetric("net")} label={copy({ hi: "शुद्ध आमदनी", en: "Net revenue" })} value={money(report.refunds.netRevenue)} detail={copy({ hi: "कुल आमदनी − सफल रिफंड", en: "Total revenue − processed refunds" })} />
          </div>

          <Card title={copy({ hi: "ऑर्डर स्थिति", en: "Order status" })} note={copy({ hi: `इस अवधि में कुल ${report.orders.total} ऑर्डर। स्थिति और डिलीवरी गिनती में इस अवधि के सभी ऑर्डर शामिल हैं; आमदनी सिर्फ़ भुगतान हो चुके, बिना रद्द ऑर्डर की है।`, en: `${report.orders.total} orders in this period. Status and delivery counts include all orders in the selected period; revenue uses paid, non-cancelled orders.` })}>
            {report.orders.total === 0 ? (
              <p className="text-sm text-muted-foreground">{copy({ hi: "इस अवधि में कोई ऑर्डर नहीं।", en: "No orders in this period." })}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {statusKeys.map((key) => (
                  <div key={key} className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">{copy(ORDER_STATUS_LABELS[key]!)}</p>
                    <p className="mt-1 font-display text-xl font-semibold">{report.orders.byStatus[key] ?? 0}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={copy({ hi: "उत्पाद प्रदर्शन", en: "Product performance" })}
            note={copy({
              hi: "ऑर्डर के समय सहेजे गए विवरण से — बाद में उत्पाद बदलने पर भी पुराना ऑर्डर सही रहता है।",
              en: "From the item details saved with each order, so past orders stay accurate even if a product is edited later.",
            })}
          >
            {report.products.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy({ hi: "इस अवधि में कोई बिक्री नहीं।", en: "No sales in this period." })}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2">{copy({ hi: "उत्पाद", en: "Product" })}</th>
                        <th className="pb-2 text-right">{copy({ hi: "मात्रा", en: "Quantity" })}</th>
                        <th className="pb-2 text-right">{copy({ hi: "आमदनी", en: "Revenue" })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.products.rows.map((row) => (
                        <tr key={row.productName}>
                          <td className="py-2 pr-3">{row.productName}</td>
                          <td className="py-2 text-right">{row.quantity}</td>
                          <td className="py-2 text-right">{money(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {copy({ hi: "बिक्री वाले उत्पाद", en: "Products with sales" })}: {report.products.withSales} · {copy({ hi: "बिना बिक्री के सक्रिय उत्पाद", en: "Active products with no sales" })}: {report.products.withoutSales}
                </p>
              </>
            )}
          </Card>

          <Card
            title={copy({ hi: "स्टॉक", en: "Inventory" })}
            note={copy({
              hi: "स्टॉक के आँकड़े आज की मौजूदा स्थिति हैं, स्टॉक आने-जाने का इतिहास नहीं। इतिहास दर्ज नहीं होता, इसलिए वह नहीं दिखाया जा सकता।",
              en: "Inventory figures are current stock snapshots, not historical stock movement. Stock in/out history is not recorded, so it cannot be reported.",
            })}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label={copy({ hi: "सक्रिय उत्पाद", en: "Active products" })} value={String(report.inventory.activeProducts)} />
              <Tile label={copy({ hi: "कम स्टॉक", en: "Low stock" })} value={String(report.inventory.lowStock)} />
              <Tile label={copy({ hi: "स्टॉक खत्म", en: "Out of stock" })} value={String(report.inventory.outOfStock)} />
            </div>
          </Card>

          <Card
            title={copy({ hi: "ग्राहक", en: "Customers" })}
            note={copy({
              hi: "कुल ग्राहक अब तक की पूरी गिनती है; नए और ऑर्डर करने वाले ग्राहक चुनी हुई अवधि के हैं।",
              en: "Total customers is a current all-time count; new and ordering customers follow the selected period.",
            })}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label={copy({ hi: "कुल ग्राहक", en: "Total customers" })} value={String(report.customers.total)} />
              <Tile label={copy({ hi: "नए ग्राहक", en: "New customers" })} value={String(report.customers.newInPeriod)} detail={copy({ hi: "इस अवधि में", en: "In this period" })} />
              <Tile label={copy({ hi: "ऑर्डर करने वाले ग्राहक", en: "Customers who ordered" })} value={String(report.customers.orderedInPeriod)} detail={copy({ hi: "इस अवधि में", en: "In this period" })} />
            </div>
          </Card>

          <Card
            title={copy({ hi: "डिलीवरी", en: "Delivery" })}
            note={copy({
              hi: "इस अवधि के सभी ऑर्डर शामिल हैं; आमदनी सिर्फ़ भुगतान हो चुके, बिना रद्द ऑर्डर की है। पुष्ट दूरी दुकान की तय की हुई दूरी है। अपने आप लगा अनुमान और ग्राहक की GPS दूरी सिर्फ़ सहायक जानकारी है।",
              en: "Delivery counts include all orders in the selected period; revenue uses paid, non-cancelled orders. Confirmed distance is the shop-approved figure. Automatic estimates and customer GPS readings are decision support only.",
            })}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Tile label={copy({ hi: "मुफ़्त डिलीवरी ऑर्डर", en: "Free delivery orders" })} value={String(report.delivery.freeOrders)} />
              <Tile label={`${money(report.delivery.tier1Charge)} ${copy({ hi: "शुल्क ऑर्डर", en: "charge orders" })}`} value={String(report.delivery.tier1Orders)} />
              <Tile label={`${money(report.delivery.tier2Charge)} ${copy({ hi: "शुल्क ऑर्डर", en: "charge orders" })}`} value={String(report.delivery.tier2Orders)} />
              {report.delivery.otherChargeOrders > 0 && (
                <Tile label={copy({ hi: "अन्य शुल्क ऑर्डर", en: "Other charge orders" })} value={String(report.delivery.otherChargeOrders)} />
              )}
              <Tile label={copy({ hi: "स्वीकृति बाकी ऑर्डर", en: "Orders needing approval" })} value={String(report.delivery.approvalRequired)} />
              <Tile
                label={copy({ hi: "पुष्ट दूरी वाले ऑर्डर", en: "Orders with confirmed distance" })}
                value={String(report.delivery.confirmedDistanceOrders)}
                detail={report.delivery.confirmedDistanceAvgKm !== null ? `${copy({ hi: "औसत", en: "Average" })} ${report.delivery.confirmedDistanceAvgKm} km` : undefined}
              />
            </div>
          </Card>

          <Card title={copy({ hi: "रिफंड", en: "Refunds" })} note={copy({ hi: "इस अवधि में सफलतापूर्वक हुए रिफंड।", en: "Successfully processed refunds in the selected period." })}>
            {report.refunds.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy({ hi: "इस अवधि में कोई रिफंड नहीं।", en: "No refunds in this period." })}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2">{copy({ hi: "ऑर्डर", en: "Order" })}</th>
                      <th className="pb-2 text-right">{copy({ hi: "ऑर्डर राशि", en: "Order amount" })}</th>
                      <th className="pb-2 text-right">{copy({ hi: "रिफंड राशि", en: "Refunded" })}</th>
                      <th className="pb-2 pl-3">{copy({ hi: "तारीख़", en: "Date" })}</th>
                      <th className="pb-2">{copy({ hi: "कारण", en: "Reason" })}</th>
                      <th className="pb-2">{copy({ hi: "स्थिति", en: "Status" })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.refunds.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3">{r.orderNumber}</td>
                        <td className="py-2 text-right">{money(r.orderAmount)}</td>
                        <td className="py-2 text-right">{money(r.amount)}</td>
                        <td className="py-2 pl-3">{formatDate(r.date, language)}</td>
                        <td className="py-2 pr-3">{r.reason || "—"}</td>
                        <td className="py-2">{copy({ hi: "रिफंड हो गया", en: "Refund processed" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {metric && <MetricDialog metric={metric} report={report} onClose={() => setMetric(null)} />}
        </div>
      )}
    </>
  );
}
