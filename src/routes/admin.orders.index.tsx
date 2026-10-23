import { createFileRoute } from "@tanstack/react-router";
import { AdminOrders, type AdminOrdersView } from "@/components/admin/core";

const VIEWS: AdminOrdersView[] = ["all", "today", "action"];

export const Route = createFileRoute("/admin/orders/")({
  validateSearch: (search: Record<string, unknown>): { view?: AdminOrdersView } => {
    const raw = search["view"];
    return typeof raw === "string" && VIEWS.includes(raw as AdminOrdersView) && raw !== "all" ? { view: raw as AdminOrdersView } : {};
  },
  head: () => ({ meta: [{ title: "Manage orders | Shreekant Seeds" }, { name: "description", content: "Demo manage orders foundation." }, { property: "og:title", content: "Manage orders | Shreekant Seeds" }, { property: "og:description", content: "Demo merchant workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: function AdminOrdersRoute() {
    const { view } = Route.useSearch();
    return <AdminOrders view={view ?? "all"} />;
  },
});
