import { createFileRoute } from "@tanstack/react-router";
import { PublicDeliveryConfirm } from "@/components/delivery";

export const Route = createFileRoute("/d/$token")({
  head: () => ({
    meta: [
      { title: "Confirm Delivery | Shreekant Seeds" },
      { name: "description", content: "Enter the customer's delivery code to complete this Shreekant Seeds delivery." },
      { property: "og:title", content: "Confirm Delivery | Shreekant Seeds" },
      { property: "og:description", content: "Enter the customer's delivery code to complete this delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeliveryConfirmRoute,
});

function DeliveryConfirmRoute() {
  const { token } = Route.useParams();
  return <PublicDeliveryConfirm token={token} />;
}
