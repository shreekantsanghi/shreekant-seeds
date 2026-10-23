import { createFileRoute } from "@tanstack/react-router";
import { AdminInventory } from "@/components/admin/catalog";

export const Route = createFileRoute("/admin/inventory")({
  validateSearch: (search: Record<string, unknown>): { filter?: "low" } => (search["filter"] === "low" ? { filter: "low" } : {}),
  head: () => ({ meta: [{ title: "Manage inventory | Shreekant Seeds" }, { name: "description", content: "Demo manage inventory foundation." }, { property: "og:title", content: "Manage inventory | Shreekant Seeds" }, { property: "og:description", content: "Demo merchant workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: function AdminInventoryRoute() {
    const { filter } = Route.useSearch();
    return <AdminInventory filter={filter ?? "all"} />;
  },
});
