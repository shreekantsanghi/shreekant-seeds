import { createFileRoute } from "@tanstack/react-router";
import { CustomerInvoicePage } from "@/components/invoice";

export const Route = createFileRoute("/orders/$id/invoice")({
  head: () => ({
    meta: [
      { title: "Invoice | Shreekant Seeds" },
      { name: "description", content: "Printable GST invoice for your Shreekant Seeds order." },
      { property: "og:title", content: "Invoice | Shreekant Seeds" },
      { property: "og:description", content: "Printable GST invoice for your Shreekant Seeds order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoiceRoute,
});

function InvoiceRoute() {
  const { id } = Route.useParams();
  return <CustomerInvoicePage id={id} />;
}
