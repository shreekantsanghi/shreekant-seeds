import { createFileRoute } from "@tanstack/react-router";
import { AdminInvoicePage } from "@/components/invoice";

export const Route = createFileRoute("/admin/orders/$id/invoice")({
  head: () => ({
    meta: [
      { title: "Order invoice | Shreekant Seeds" },
      { name: "description", content: "Merchant view of the GST invoice for a customer order." },
      { property: "og:title", content: "Order invoice | Shreekant Seeds" },
      { property: "og:description", content: "Merchant view of the GST invoice for a customer order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminInvoiceRoute,
});

function AdminInvoiceRoute() {
  const { id } = Route.useParams();
  return <AdminInvoicePage id={id} />;
}
