import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Bell, LogOut, BadgeIndianRupee, Boxes, ChartNoAxesCombined, ClipboardList, Cog, LayoutDashboard, MapPinned, Menu, PackagePlus, Percent, ShoppingBag, Store, Tags, UsersRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brand, DemoNotice, money } from "@/components/store/core";
import { DeliveryCredentialsPanel } from "@/components/delivery";
import { NotificationBell } from "@/components/notifications";
import { getAdminDashboardStats, getAdminOrder, listAdminDeliveryApprovalRequests, listAdminOrders, setAddressDeliveryApproval, updateAdminOrderStatus } from "@/lib/admin-orders.functions";
import { CANCELLABLE_STATUSES, NEXT_ORDER_STATUS, ORDER_STATUS_ERRORS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatAddress, formatDate } from "@/lib/orders-shared";
import { useCopy, useStore } from "@/lib/store-context";
import { useAdminSession, useAdminSignOut } from "@/lib/use-admin-session";
import { cn } from "@/lib/utils";
import { RefundPanel } from "@/components/admin/refunds";

const nav = [
  ["/admin", LayoutDashboard, "डैशबोर्ड", "Dashboard"], ["/admin/categories", Boxes, "श्रेणियाँ", "Categories"], ["/admin/brands", Tags, "ब्रांड", "Brands"], ["/admin/products", ShoppingBag, "उत्पाद", "Products"], ["/admin/inventory", Boxes, "स्टॉक", "Inventory"], ["/admin/orders", ClipboardList, "ऑर्डर", "Orders"], ["/admin/customers", UsersRound, "ग्राहक", "Customers"], ["/admin/discounts", Percent, "छूट", "Discounts"], ["/admin/delivery", MapPinned, "डिलीवरी", "Delivery"], ["/admin/reports", ChartNoAxesCombined, "रिपोर्ट", "Reports"], ["/admin/notifications", Bell, "सूचनाएँ", "Notifications"], ["/admin/settings", Cog, "सेटिंग", "Settings"],
] as const;
function AdminSignOutButton() { const copy = useCopy(); const signOut = useAdminSignOut(); return <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => void signOut()}><LogOut className="size-4" />{copy({ hi: "लॉगआउट", en: "Sign out" })}</Button>; }
function AdminAccountPanel() { const copy = useCopy(); const { data } = useAdminSession(); const signOut = useAdminSignOut(); return <div className="mx-4 mb-4 mt-2 shrink-0 rounded-md border border-sidebar-border p-3 text-xs text-sidebar-foreground/60"><p className="truncate font-semibold text-sidebar-foreground">{data?.fullName ?? data?.email ?? copy({ hi: "संचालक", en: "Merchant" })}</p><p className="mt-1 truncate">{data?.email ?? ""}</p><button type="button" onClick={() => void signOut()} className="mt-2 font-semibold text-sidebar-foreground underline">{copy({ hi: "लॉगआउट करें", en: "Sign out" })}</button></div>; }
export function AdminShell() { const copy = useCopy(); const path = useRouterState({ select: (s) => s.location.pathname }); const [open, setOpen] = useState(false); return <div className="min-h-screen bg-surface text-foreground">{open && <button type="button" aria-label={copy({ hi: "मेनू बंद करें", en: "Close menu" })} className="fixed inset-0 z-40 bg-foreground/35 lg:hidden" onClick={() => setOpen(false)} />}<aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}><div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-5"><Brand inverse /><Button variant="ghost" size="icon" aria-label={copy({ hi: "मेनू बंद करें", en: "Close menu" })} className="text-sidebar-foreground lg:hidden" onClick={() => setOpen(false)}><X /></Button></div><nav aria-label={copy({ hi: "एडमिन नेविगेशन", en: "Admin navigation" })} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">{nav.map(([to, Icon, hi, en]) => <Link key={to} to={to} activeOptions={{ exact: to === "/admin" }} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", (to === "/admin" ? path === to : path.startsWith(to)) && "bg-sidebar-accent text-sidebar-accent-foreground")}><Icon className="size-5" />{copy({ hi, en })}</Link>)}</nav><AdminAccountPanel /></aside><div className="lg:pl-72"><header className="sticky top-0 z-30 grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6"><Button variant="ghost" size="icon" aria-label={copy({ hi: "मेनू खोलें", en: "Open menu" })} onClick={() => setOpen(true)} className="lg:hidden"><Menu /></Button><Button variant="ghost" size="icon" aria-label={copy({ hi: "वापस जाएँ", en: "Go back" })} onClick={() => window.history.back()} className="hidden lg:inline-flex"><ArrowLeft /></Button><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">Shreekant Seeds</p><p className="truncate font-semibold">{copy({ hi: "दुकान प्रबंधन", en: "Store management" })}</p></div><div className="ml-auto flex items-center gap-1"><NotificationBell allTo="/admin/notifications" /><AdminSignOutButton /></div></header><main className="p-4 sm:p-6 lg:p-8"><Outlet /></main></div></div>; }
export function AdminHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="min-w-0"><p className="eyebrow text-accent">SHREEKANT SEEDS</p><h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}</div>{action}</header>; }
export function Kpi({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Store }) { return <div className="h-full rounded-lg bg-card p-5 ring-1 ring-border"><div className="flex items-start justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className="size-5 text-accent" /></div><p className="mt-3 font-display text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function AdminDashboardStats() {
  const copy = useCopy();
  const load = useServerFn(getAdminDashboardStats);
  const statsQuery = useQuery({ queryKey: ["admin-dashboard-stats"], queryFn: () => load(), retry: false });
  if (statsQuery.isLoading) return <p className="mt-6 text-sm text-muted-foreground">{copy({ hi: "आँकड़े लोड हो रहे हैं…", en: "Loading figures…" })}</p>;
  if (statsQuery.isError || !statsQuery.data) return <p role="alert" className="mt-6 rounded-lg bg-card p-5 text-sm text-destructive ring-1 ring-border">{copy({ hi: "आँकड़े लोड नहीं हो सके।", en: "Could not load the figures." })}</p>;
  const s = statsQuery.data;
  const tile = "block h-full rounded-lg transition hover:ring-2 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  return <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Link to="/admin/orders" search={{ view: "today" }} className={tile}><Kpi label={copy({ hi: "ऑर्डर", en: "Orders" })} value={String(s.todayOrders)} detail={copy({ hi: "आज", en: "Today" })} icon={ShoppingBag} /></Link>
    <Link to="/admin/reports" search={{ period: "today" }} className={tile}><Kpi label={copy({ hi: "आमदनी", en: "Revenue" })} value={money(s.todayRevenue)} detail={copy({ hi: "आज, भुगतान हो चुके ऑर्डर", en: "Today, paid orders" })} icon={BadgeIndianRupee} /></Link>
    <Link to="/admin/orders" search={{ view: "action" }} className={tile}><Kpi label={copy({ hi: "कार्रवाई वाले ऑर्डर", en: "Orders needing action" })} value={String(s.pendingOrders)} detail={copy({ hi: "लंबित, पुष्ट, तैयारी में, तैयार — सभी समय", en: "Pending, confirmed, preparing, ready — all time" })} icon={ClipboardList} /></Link>
    <Link to="/admin/inventory" search={{ filter: "low" }} className={tile}><Kpi label={copy({ hi: "कम स्टॉक", en: "Low stock" })} value={String(s.lowStock)} detail={copy({ hi: "उत्पाद कम स्टॉक पर", en: "Products at low stock" })} icon={Boxes} /></Link>
  </div>;
}

function AdminDeliveryApprovals() {
  const copy = useCopy();
  const { language } = useStore();
  const load = useServerFn(listAdminDeliveryApprovalRequests);
  const requestsQuery = useQuery({ queryKey: ["admin-delivery-approvals"], queryFn: () => load(), retry: false });
  const title = (count?: number) =>
    copy({ hi: "डिलीवरी स्वीकृति अनुरोध", en: "Delivery Approval Requests" }) + (count === undefined ? "" : ` (${count})`);
  return <section className="mt-6 rounded-lg bg-card ring-1 ring-border">
    <div className="border-b border-border p-5"><h2 className="font-display text-2xl font-semibold">{requestsQuery.data ? title(requestsQuery.data.length) : title()}</h2></div>
    {requestsQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">{copy({ hi: "अनुरोध लोड हो रहे हैं…", en: "Loading requests…" })}</p>}
    {(requestsQuery.isError || (!requestsQuery.isLoading && !requestsQuery.data)) && <p role="alert" className="p-5 text-sm text-destructive">{copy({ hi: "अनुरोध लोड नहीं हो सके।", en: "Could not load the requests." })}</p>}
    {requestsQuery.data && requestsQuery.data.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy({ hi: "कोई डिलीवरी स्वीकृति अनुरोध नहीं", en: "No delivery approval requests" })}</p>}
    {requestsQuery.data && requestsQuery.data.length > 0 && <ul className="divide-y divide-border">
      {requestsQuery.data.map((r) => {
        const addressLine = formatAddress(r.address).join(", ");
        return <li key={r.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold">#{r.orderNumber} · {r.customerName ?? copy({ hi: "ग्राहक", en: "Customer" })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(r.createdAt, language)}</p>
            {addressLine && <p className="mt-1 truncate text-sm text-muted-foreground">{addressLine}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {r.estimateDistanceKm !== null && <span>{copy({ hi: "अनुमानित दूरी", en: "Estimated" })}: ~{r.estimateDistanceKm} km{r.estimateDurationMin !== null ? ` · ~${r.estimateDurationMin} min` : ""}</span>}
              {r.gpsDistanceKm !== null && <span>{copy({ hi: "ग्राहक GPS", en: "Customer GPS" })}: ~{r.gpsDistanceKm} km{r.gpsDurationMin !== null ? ` · ~${r.gpsDurationMin} min` : ""}{r.gpsAccuracyM !== null ? ` · ±${r.gpsAccuracyM} m` : ""}</span>}
              {r.suggestedDeliveryCharge !== null && <span>{copy({ hi: "सुझाया शुल्क", en: "Suggested charge" })}: {money(r.suggestedDeliveryCharge)}</span>}
              <span className="font-medium text-accent">{copy({ hi: "आपकी समीक्षा बाकी", en: "Needs your review" })}</span>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0"><Link to="/admin/orders/$id" params={{ id: r.id }}>{copy({ hi: "अनुरोध देखें", en: "Review Request" })}</Link></Button>
        </li>;
      })}
    </ul>}
  </section>;
}
export function AdminDashboard() { const copy = useCopy(); return <><AdminHeading title={copy({ hi: "डैशबोर्ड", en: "Dashboard" })} description={copy({ hi: "आज की दुकान गतिविधि।", en: "Today’s shop activity." })} /><AdminDashboardStats /><AdminDeliveryApprovals /><div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-lg bg-card ring-1 ring-border"><div className="flex items-center justify-between border-b border-border p-5"><h2 className="font-display text-2xl font-semibold">{copy({ hi: "नए ऑर्डर", en: "Recent orders" })}</h2><Link to="/admin/orders" className="text-sm font-semibold text-primary">{copy({ hi: "सभी देखें", en: "View all" })}</Link></div><AdminOrderRows limit={5} /></section><section className="rounded-lg bg-card p-5 ring-1 ring-border"><h2 className="font-display text-2xl font-semibold">{copy({ hi: "त्वरित काम", en: "Quick actions" })}</h2><div className="mt-4 grid gap-2"><Button asChild className="justify-start"><Link to="/admin/products/new"><PackagePlus />{copy({ hi: "नया उत्पाद", en: "New product" })}</Link></Button><Button asChild variant="outline" className="justify-start"><Link to="/admin/inventory"><Boxes />{copy({ hi: "स्टॉक देखें", en: "Review inventory" })}</Link></Button><Button asChild variant="outline" className="justify-start"><Link to="/admin/delivery"><MapPinned />{copy({ hi: "डिलीवरी सेटिंग", en: "Delivery settings" })}</Link></Button></div></section></div></>; }
function StatusChip({ status }: { status: string }) {
  const copy = useCopy();
  const label = ORDER_STATUS_LABELS[status];
  return <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-strong">{label ? copy(label) : status}</span>;
}

function InventoryFlag({ order }: { order: { needsInventoryReview: boolean; inventoryFulfilledAt: string | null; paymentStatus: string } }) {
  const copy = useCopy();
  if (order.needsInventoryReview)
    return <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">{copy({ hi: "स्टॉक घटाया नहीं गया — मैन्युअल मिलान ज़रूरी", en: "Stock not deducted — manual reconciliation required" })}</span>;
  if (order.inventoryFulfilledAt)
    return <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{copy({ hi: "स्टॉक घटाया गया", en: "Stock deducted" })}</span>;
  return <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{copy({ hi: "स्टॉक लंबित", en: "Stock pending" })}</span>;
}

/** Dashboard view filters — same IST day and same four actionable statuses as the dashboard tiles. */
export type AdminOrdersView = "all" | "today" | "action";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDayStartIso = (): string => {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST_OFFSET_MS).toISOString();
};

/** Real order rows, newest first. `limit` is used by the dashboard preview. */
export function AdminOrderRows({ limit, view = "all", search = "", status = "all" }: { limit?: number; view?: AdminOrdersView; search?: string; status?: string }) {
  const copy = useCopy();
  const { language } = useStore();
  const list = useServerFn(listAdminOrders);
  const ordersQuery = useQuery({ queryKey: ["admin-orders"], queryFn: () => list(), retry: false });
  if (ordersQuery.isLoading) return <p className="p-5 text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>;
  if (ordersQuery.isError) return <p role="alert" className="p-5 text-sm text-destructive">{copy({ hi: "ऑर्डर लोड नहीं हो सके।", en: "Could not load orders." })}</p>;
  const all = ordersQuery.data ?? [];
  const since = istDayStartIso();
  const actionable = Object.keys(NEXT_ORDER_STATUS);
  const viewFiltered = view === "today" ? all.filter((o) => o.createdAt >= since) : view === "action" ? all.filter((o) => actionable.includes(o.status)) : all;
  const filtered = status === "all" ? viewFiltered : viewFiltered.filter((o) => o.status === status);
  const needle = search.trim().toLowerCase();
  const searched = needle ? filtered.filter((o) => o.orderNumber.toLowerCase().includes(needle) || (o.customerName ?? "").toLowerCase().includes(needle)) : filtered;
  if (!searched.length && status !== "all" && !needle) return <p className="p-5 text-sm text-muted-foreground">{copy({ hi: "इस स्थिति में कोई ऑर्डर नहीं है।", en: "No orders with this status." })}</p>;
  const rows = limit ? searched.slice(0, limit) : searched;
  if (!rows.length && needle) return <p className="p-5 text-sm text-muted-foreground">{copy({ hi: "कोई मेल खाता ऑर्डर नहीं मिला।", en: "No matching orders found." })}</p>;
  if (!rows.length) return <p className="p-5 text-sm text-muted-foreground">{copy({ hi: "अभी कोई ऑर्डर नहीं है।", en: "There are no orders yet." })}</p>;
  return <div className="divide-y divide-border">{rows.map((o) => <Link key={o.id} to="/admin/orders/$id" params={{ id: o.id }} className="grid grid-cols-[1fr_auto] gap-4 p-5 hover:bg-surface">
    <div className="min-w-0">
      <p className="truncate font-semibold">{o.orderNumber}</p>
      <p className="truncate text-xs text-muted-foreground">{formatDate(o.createdAt, language)} · {o.customerName ?? ""} {o.customerPhone ?? ""}</p>
      <div className="mt-2 flex flex-wrap gap-2"><StatusChip status={o.status} /><InventoryFlag order={o} /></div>
    </div>
    <div className="text-right">
      <p className="font-semibold">{money(o.totalAmount)}</p>
      <p className="text-xs text-muted-foreground">{copy(PAYMENT_STATUS_LABELS[o.paymentStatus] ?? { hi: o.paymentStatus, en: o.paymentStatus })}</p>
    </div>
  </Link>)}</div>;
}

export function AdminOrders({ view = "all" }: { view?: AdminOrdersView }) {
  const copy = useCopy();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const description = view === "today"
    ? copy({ hi: "आज के ऑर्डर।", en: "Today's orders." })
    : view === "action"
      ? copy({ hi: "आपकी कार्रवाई वाले ऑर्डर — लंबित, पुष्ट, तैयारी में, तैयार।", en: "Orders needing your action — pending, confirmed, preparing, ready." })
      : copy({ hi: "ग्राहकों के असली ऑर्डर, भुगतान स्थिति और स्टॉक स्थिति।", en: "Real customer orders with payment and stock status." });
  const statusOptions: Array<[string, { hi: string; en: string }]> = [["all", { hi: "सभी", en: "All" }], ...Object.entries(ORDER_STATUS_LABELS)];
  return <><AdminHeading title={copy({ hi: "ऑर्डर", en: "Orders" })} description={description} action={view === "all" ? undefined : <Button asChild variant="outline" size="sm"><Link to="/admin/orders" >{copy({ hi: "सभी ऑर्डर", en: "All orders" })}</Link></Button>} /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label={copy({ hi: "ऑर्डर नंबर या ग्राहक का नाम खोजें", en: "Search by order number or customer name" })} placeholder={copy({ hi: "ऑर्डर नंबर या ग्राहक का नाम खोजें…", en: "Search order number or customer name…" })} className="h-12 w-full rounded-md border border-input bg-background px-3 sm:max-w-md" /><div role="group" aria-label={copy({ hi: "स्थिति के अनुसार देखें", en: "Filter by status" })} className="mt-3 flex gap-2 overflow-x-auto pb-1">{statusOptions.map(([value, label]) => <Button key={value} type="button" size="sm" variant={status === value ? "default" : "outline"} aria-pressed={status === value} onClick={() => setStatus(value)} className="shrink-0">{copy(label)}</Button>)}</div><div className="mt-4 rounded-lg bg-card ring-1 ring-border"><AdminOrderRows view={view} search={search} status={status} /></div></>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <p className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></p>;
}

/**
 * Phase 8 — merchant status control. One forward step plus cancel when allowed.
 * Every decision is re-validated by the database routine; this is only the button.
 */
function OrderStatusControl({ order }: { order: { id: string; status: string } }) {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const update = useServerFn(updateAdminOrderStatus);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (status: string) => update({ data: { orderId: order.id, status } }),
    onSuccess: (result) => {
      if (result.ok) {
        setError(null);
        void queryClient.invalidateQueries({ queryKey: ["admin-order", order.id] });
        void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      } else {
        setError(copy(ORDER_STATUS_ERRORS[result.code] ?? { hi: "यह कार्रवाई अभी संभव नहीं है।", en: "This action is not possible right now." }));
      }
    },
    onError: () => setError(copy({ hi: "स्थिति नहीं बदली जा सकी।", en: "The status could not be changed." })),
  });

  const next = NEXT_ORDER_STATUS[order.status];
  const canCancel = CANCELLABLE_STATUSES.includes(order.status);
  const awaitingDeliveryConfirmation = order.status === "out_for_delivery";

  return <div className="rounded-lg bg-card p-5 ring-1 ring-border">
    <h2 className="font-display text-xl font-semibold">{copy({ hi: "ऑर्डर की स्थिति", en: "Order status" })}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{copy({ hi: "अभी: ", en: "Current: " })}<span className="font-medium text-foreground">{copy(ORDER_STATUS_LABELS[order.status] ?? { hi: order.status, en: order.status })}</span></p>
    {awaitingDeliveryConfirmation
      ? <p className="mt-3 rounded-md bg-surface p-3 text-sm text-muted-foreground">{copy({ hi: "डिलीवरी पूरी होने की पुष्टि ग्राहक के डिलीवरी QR और डिलीवरी कोड से होगी।", en: "Delivery completion will be confirmed with the customer delivery QR and delivery code." })}</p>
      : null}
    <div className="mt-4 flex flex-wrap gap-2">
      {next && <Button size="sm" className="rounded-full" disabled={mutation.isPending} onClick={() => mutation.mutate(next)}>
        {copy({ hi: `आगे बढ़ाएँ: ${ORDER_STATUS_LABELS[next]?.hi ?? next}`, en: `Advance to ${ORDER_STATUS_LABELS[next]?.en ?? next}` })}
      </Button>}
      {canCancel && <Button size="sm" variant="outline" className="rounded-full" disabled={mutation.isPending} onClick={() => {
        const typed = window.prompt(copy({ hi: "क्या आप यह ऑर्डर रद्द करना चाहते हैं? पुष्टि के लिए ठीक-ठीक cancel लिखें:", en: "Cancel this order? Type exactly cancel to confirm:" }));
        if (typed === null) return;
        if (typed.trim() !== "cancel") { window.alert(copy({ hi: "पुष्टि शब्द सही नहीं है। ऑर्डर रद्द नहीं हुआ।", en: "Confirmation text did not match. The order was not cancelled." })); return; }
        mutation.mutate("cancelled");
      }}>
        {copy({ hi: "ऑर्डर रद्द करें", en: "Cancel order" })}
      </Button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>;
}

/**
 * Phase 10A — the shop's reusable delivery decision for the saved address this
 * order used. Approving fills in the charge for orders still waiting for it.
 * Withdrawing only affects future orders from that address.
 */
function DeliveryApprovalControl({ order }: { order: { id: string; addressId: string | null; deliveryApprovalRequired: boolean; addressDeliveryApproved: boolean; addressApprovedCharge: number | null; addressApprovedAt: string | null; tier1Charge: number; tier2Charge: number; addressEstimateStatus: string | null; addressEstimatedDistanceKm: number | null; addressEstimatedDurationMin: number | null; addressEstimatedAt: string | null; suggestedDeliveryCharge: number | null; gpsDistanceKm: number | null; gpsDurationMin: number | null; gpsAccuracyM: number | null; gpsSource: string | null } }) {
  const copy = useCopy();
  const { language } = useStore();
  const queryClient = useQueryClient();
  const apply = useServerFn(setAddressDeliveryApproval);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { approved: boolean; charge: number | null }) =>
      apply({ data: { addressId: order.addressId as string, approved: input.approved, charge: input.charge } }),
    onSuccess: (result) => {
      if (result.ok) {
        setError(null);
        void queryClient.invalidateQueries({ queryKey: ["admin-order", order.id] });
        void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-customer-addresses"] });
      } else {
        setError(copy({ hi: "यह कार्रवाई अभी संभव नहीं है।", en: "This action is not possible right now." }));
      }
    },
    onError: () => setError(copy({ hi: "डिलीवरी मंज़ूरी सहेजी नहीं जा सकी।", en: "The delivery approval could not be saved." })),
  });

  if (!order.addressId) return null;

  return <div className="rounded-lg bg-card p-5 ring-1 ring-border">
    <h2 className="font-display text-xl font-semibold">{copy({ hi: "पते की डिलीवरी मंज़ूरी", en: "Address delivery approval" })}</h2>
    {order.deliveryApprovalRequired && <p className="mt-2 text-sm font-semibold text-accent-strong">{copy({ hi: "इस ऑर्डर के लिए डिलीवरी मंज़ूरी चाहिए", en: "Delivery approval required for this order" })}</p>}
    {order.addressDeliveryApproved
      ? <p className="mt-2 text-sm text-muted-foreground">{copy({ hi: "मंज़ूर शुल्क", en: "Approved charge" })}: <span className="font-medium text-foreground">{order.addressApprovedCharge === 0 ? copy({ hi: "मुफ़्त", en: "FREE" }) : money(order.addressApprovedCharge ?? 0)}</span>{order.addressApprovedAt ? ` · ${formatDate(order.addressApprovedAt, language)}` : ""}</p>
      : <p className="mt-2 text-sm text-muted-foreground">{copy({ hi: "इस पते के लिए अभी कोई मंज़ूरी नहीं है।", en: "This address has no approval yet." })}</p>}
    <p className="mt-2 text-xs text-muted-foreground">{copy({ hi: "यह फैसला इसी सहेजे पते के आगे के ऑर्डर पर भी लागू होगा।", en: "This decision is reused for future orders from this saved address." })}</p>
    {(order.addressEstimateStatus === "ok" || order.addressEstimateStatus === "out_of_range") && order.addressEstimatedDistanceKm !== null && (
      <p className="mt-3 rounded-md bg-surface p-3 text-sm text-muted-foreground">
        {copy({
          hi: `सड़क दूरी (अनुमान): लगभग ${order.addressEstimatedDistanceKm} किमी${order.addressEstimatedDurationMin !== null ? ` · ~${order.addressEstimatedDurationMin} मिनट` : ""}`,
          en: `Road distance (estimate): about ${order.addressEstimatedDistanceKm} km${order.addressEstimatedDurationMin !== null ? ` · ~${order.addressEstimatedDurationMin} min` : ""}`,
        })}
        {order.addressEstimateStatus === "out_of_range" && (
          <span className="font-medium text-accent-strong">{copy({ hi: " — स्तर 2 सीमा से आगे", en: " — beyond the tier 2 limit" })}</span>
        )}
        {order.suggestedDeliveryCharge !== null && (
          <span className="block mt-1">
            {copy({ hi: "नियमों के अनुसार सुझाव", en: "Suggested by your rules" })}:{" "}
            <span className="font-medium text-foreground">{money(order.suggestedDeliveryCharge)}</span>
          </span>
        )}
        <span className="block mt-1 text-xs">{copy({ hi: "यह केवल सहायता है — अंतिम फैसला आपका है।", en: "Decision support only — the final call is yours." })}</span>
      </p>
    )}
    {order.gpsDistanceKm !== null && (
      <p className="mt-3 rounded-md bg-surface p-3 text-sm text-muted-foreground">
        {copy({
          hi: `सड़क दूरी: लगभग ${order.gpsDistanceKm} किमी${order.gpsDurationMin !== null ? ` · ~${order.gpsDurationMin} मिनट` : ""}`,
          en: `Road distance: about ${order.gpsDistanceKm} km${order.gpsDurationMin !== null ? ` · ~${order.gpsDurationMin} min` : ""}`,
        })}
        <span className="block mt-1">
          {copy({
            hi: `लोकेशन स्रोत: ग्राहक का GPS${order.gpsAccuracyM !== null ? ` · सटीकता ~${order.gpsAccuracyM} मीटर` : ""}`,
            en: `Location source: Customer GPS${order.gpsAccuracyM !== null ? ` · accuracy ~${order.gpsAccuracyM} m` : ""}`,
          })}
        </span>
        <span className="block mt-1 text-xs">{copy({ hi: "यह केवल सहायता है — अंतिम फैसला आपका है।", en: "Decision support only — the final call is yours." })}</span>
      </p>
    )}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" className="rounded-full" disabled={mutation.isPending} onClick={() => { setError(null); mutation.mutate({ approved: true, charge: 0 }); }}>{copy({ hi: "मुफ़्त डिलीवरी", en: "FREE DELIVERY" })}</Button>
      <Button size="sm" variant="outline" className="rounded-full" disabled={mutation.isPending} onClick={() => { setError(null); mutation.mutate({ approved: true, charge: order.tier1Charge }); }}>{money(order.tier1Charge)}</Button>
      <Button size="sm" variant="outline" className="rounded-full" disabled={mutation.isPending} onClick={() => { setError(null); mutation.mutate({ approved: true, charge: order.tier2Charge }); }}>{money(order.tier2Charge)}</Button>
      {order.addressDeliveryApproved && <Button size="sm" variant="outline" className="rounded-full" disabled={mutation.isPending} onClick={() => { setError(null); mutation.mutate({ approved: false, charge: null }); }}>{copy({ hi: "मंज़ूरी हटाएँ", en: "Remove approval" })}</Button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>;
}



export function AdminOrderDetail({ id }: { id: string }) {
  const copy = useCopy();
  const { language } = useStore();
  const fetchOrder = useServerFn(getAdminOrder);
  const orderQuery = useQuery({ queryKey: ["admin-order", id], queryFn: () => fetchOrder({ data: { orderId: id } }), retry: false });

  if (orderQuery.isLoading) return <p className="text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>;
  if (orderQuery.isError) return <p role="alert" className="text-sm text-destructive">{copy({ hi: "ऑर्डर लोड नहीं हो सका।", en: "Could not load this order." })}</p>;
  const order = orderQuery.data;
  if (!order) return <><AdminHeading title={copy({ hi: "ऑर्डर नहीं मिला", en: "Order not found" })} /><p className="text-sm text-muted-foreground">{copy({ hi: "यह ऑर्डर मौजूद नहीं है।", en: "This order does not exist." })}</p></>;

  const addressLines = formatAddress(order.deliveryAddress);
  return <>
    <AdminHeading title={order.orderNumber} description={formatDate(order.createdAt, language)} />
    <div className="mb-4 flex flex-wrap items-center gap-2"><StatusChip status={order.status} /><InventoryFlag order={order} /><Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/admin/orders/$id/invoice" params={{ id }}>{copy({ hi: "चालान देखें", en: "View invoice" })}</Link></Button>{order.status === "out_for_delivery" && <Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/admin/orders/$id/print-delivery" params={{ id }}>{copy({ hi: "QR और पता प्रिंट करें", en: "Print QR & Address" })}</Link></Button>}</div>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="rounded-lg bg-card p-5 ring-1 ring-border lg:col-span-2">
        <h2 className="font-display text-2xl font-semibold">{copy({ hi: "उत्पाद", en: "Items" })}</h2>
        <ul className="mt-4 divide-y divide-border">{order.items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">{language === "hi" ? item.productNameHi : item.productName}</p>
            <p className="text-xs text-muted-foreground">{[item.packSize, item.sku, item.hsnCode ? `HSN ${item.hsnCode}` : null].filter(Boolean).join(" · ")}</p>
            <p className="text-xs text-muted-foreground">{item.quantity} × {money(item.unitPrice)}{item.taxRate !== null ? ` · GST ${item.taxRate}% (${money(item.taxAmount)})` : ""}</p>
          </div>
          <p className="font-semibold">{money(item.totalPrice)}</p>
        </li>)}</ul>
        <div className="mt-5 space-y-1 border-t border-border pt-4">
          <Row label={copy({ hi: "उप-योग", en: "Subtotal" })} value={money(order.subtotal)} />
          {order.discountAmount > 0 && <Row label={copy({ hi: "छूट", en: "Discount" })} value={`- ${money(order.discountAmount)}`} />}
          <Row label={copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" })} value={order.deliveryCharge === 0 ? copy({ hi: "मुफ़्त", en: "FREE" }) : money(order.deliveryCharge)} />
          <Row label={copy({ hi: "कुल", en: "Total" })} value={money(order.totalAmount)} />
        </div>
      </section>
      <aside className="space-y-5">
        <OrderStatusControl order={order} />
        <DeliveryApprovalControl order={order} />
        {order.status === "out_for_delivery" && <DeliveryCredentialsPanel orderId={order.id} />}
        <div className="rounded-lg bg-card p-5 ring-1 ring-border">
          <h2 className="font-display text-xl font-semibold">{copy({ hi: "ग्राहक और डिलीवरी", en: "Customer and delivery" })}</h2>
          <p className="mt-2 text-sm font-medium">{order.customerName}</p>
          <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
          {addressLines.length ? <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">{addressLines.map((line) => <p key={line}>{line}</p>)}</div> : null}
          {order.deliveryDistanceKm !== null && <p className="mt-2 text-xs text-muted-foreground">{copy({ hi: "पुष्ट दूरी", en: "Confirmed distance" })}: {order.deliveryDistanceKm} km</p>}
          {order.customerNote && <p className="mt-3 text-sm text-muted-foreground">{copy({ hi: "ग्राहक का संदेश: ", en: "Customer note: " })}{order.customerNote}</p>}
        </div>
        <div className="rounded-lg bg-card p-5 ring-1 ring-border">
          <h2 className="font-display text-xl font-semibold">{copy({ hi: "भुगतान", en: "Payment" })}</h2>
          <p className="mt-2 text-sm">{copy(PAYMENT_STATUS_LABELS[order.paymentStatus] ?? { hi: order.paymentStatus, en: order.paymentStatus })}</p>
          {order.payments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{copy({ hi: "कोई भुगतान रिकॉर्ड नहीं।", en: "No payment record." })}</p> : <ul className="mt-3 space-y-3 text-xs">{order.payments.map((p) => <li key={`${p.providerOrderId}-${p.createdAt}`} className="rounded-md bg-surface p-3">
            <p className="font-semibold">{money(p.amount)} · {p.status}</p>
            <p className="mt-1 break-all text-muted-foreground">Order ID: {p.providerOrderId ?? "—"}</p>
            <p className="break-all text-muted-foreground">Payment ID: {p.providerPaymentId ?? "—"}</p>
            <p className="text-muted-foreground">{p.signatureVerified ? copy({ hi: "सत्यापित", en: "Verified" }) : copy({ hi: "असत्यापित", en: "Not verified" })} · {formatDate(p.createdAt, language)}</p>
          </li>)}</ul>}
        </div>
        <RefundPanel order={order} />
        <div className="rounded-lg bg-card p-5 ring-1 ring-border">

          <h2 className="font-display text-xl font-semibold">{copy({ hi: "स्टॉक", en: "Stock" })}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{order.inventoryFulfilledAt
            ? `${copy({ hi: "स्टॉक घटाया गया", en: "Stock deducted" })} · ${formatDate(order.inventoryFulfilledAt, language)}`
            : order.needsInventoryReview
              ? copy({ hi: "भुगतान हो चुका है पर स्टॉक अपने आप नहीं घटा। स्टॉक स्वयं जाँचकर ठीक करें।", en: "Payment received but stock was not deducted automatically. Please check and correct the stock yourself." })
              : copy({ hi: "भुगतान की पुष्टि के बाद स्टॉक घटेगा।", en: "Stock will be deducted once payment is confirmed." })}</p>
        </div>
      </aside>
    </div>
  </>;
}
export function AdminPlaceholder({ kind }: { kind: "customers" | "discounts" | "delivery" | "reports" | "settings" }) { const copy = useCopy(); const map = { customers: { hi: "ग्राहक", en: "Customers" }, discounts: { hi: "छूट", en: "Discounts" }, delivery: { hi: "स्थानीय डिलीवरी", en: "Local delivery" }, reports: { hi: "रिपोर्ट", en: "Reports" }, settings: { hi: "सेटिंग", en: "Settings" } }; const desc = kind === "delivery" ? copy({ hi: "डिलीवरी क्षेत्र, पिन कोड और शुल्क बाद में तय और कॉन्फ़िगर होंगे।", en: "Delivery areas, PIN codes and charges will be configured later." }) : copy({ hi: "यह डेमो संरचनात्मक पेज है। वास्तविक डेटा और कार्रवाई अगले चरण में आएँगे।", en: "This is a demo structural page. Real data and actions will arrive later." }); return <><AdminHeading title={copy(map[kind])} description={desc} /><DemoNotice /><div className="mt-6 grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-card p-8 text-center"><div><Store className="mx-auto size-10 text-accent" /><h2 className="mt-3 font-display text-2xl font-semibold">{copy({ hi: "बनावट तैयार है", en: "Foundation ready" })}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{desc}</p></div></div></>; }
