import { createFileRoute } from "@tanstack/react-router";
import { AdminDelivery } from "@/components/admin/delivery";

export const Route = createFileRoute("/admin/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery | Shreekant Seeds" },
      { name: "description", content: "Merchant local delivery rules: pieces, distance limits and charges." },
      { property: "og:title", content: "Delivery | Shreekant Seeds" },
      { property: "og:description", content: "Merchant local delivery rules: pieces, distance limits and charges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDelivery,
});
