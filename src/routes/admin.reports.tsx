import { createFileRoute } from "@tanstack/react-router";
import { AdminReports } from "@/components/admin/reports";
import type { ReportPeriod } from "@/lib/admin-reports.functions";

const PERIODS: ReportPeriod[] = ["today", "week", "month", "quarter", "year", "custom"];

export const Route = createFileRoute("/admin/reports")({
  validateSearch: (search: Record<string, unknown>): { period?: ReportPeriod } => {
    const raw = search["period"];
    return typeof raw === "string" && PERIODS.includes(raw as ReportPeriod) ? { period: raw as ReportPeriod } : {};
  },
  head: () => ({ meta: [{ title: "Reports | Shreekant Seeds" }, { name: "description", content: "Real sales, order, product, stock, customer and delivery reports for the shop." }, { property: "og:title", content: "Reports | Shreekant Seeds" }, { property: "og:description", content: "Real sales, order, product, stock, customer and delivery reports for the shop." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: function AdminReportsRoute() {
    const { period } = Route.useSearch();
    return period ? <AdminReports initialPeriod={period} /> : <AdminReports />;
  },
});
