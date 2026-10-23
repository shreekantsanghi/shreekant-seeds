import { createFileRoute } from "@tanstack/react-router";
import { AdminCustomers } from "@/components/admin/customers";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers | Shreekant Seeds" },
      { name: "description", content: "Customer accounts, saved addresses and confirmed delivery distances." },
      { property: "og:title", content: "Customers | Shreekant Seeds" },
      { property: "og:description", content: "Customer accounts, saved addresses and confirmed delivery distances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminCustomers,
});
