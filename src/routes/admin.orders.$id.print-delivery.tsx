import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPrintPage } from "@/components/delivery-print";

export const Route = createFileRoute("/admin/orders/$id/print-delivery")({
  head: () => ({
    meta: [
      { title: "Print QR & Address | Shreekant Seeds" },
      { name: "description", content: "Merchant print sheet with the delivery QR and order address." },
      { property: "og:title", content: "Print QR & Address | Shreekant Seeds" },
      { property: "og:description", content: "Merchant print sheet with the delivery QR and order address." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrintDeliveryRoute,
});

function PrintDeliveryRoute() {
  const { id } = Route.useParams();
  return <DeliveryPrintPage id={id} />;
}
