import { createFileRoute } from "@tanstack/react-router";
import { NotificationCenter } from "@/components/notifications";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications | Shreekant Seeds shop" },
      { name: "description", content: "Order, payment, delivery approval and stock alerts for the shop." },
      { property: "og:title", content: "Notifications | Shreekant Seeds shop" },
      { property: "og:description", content: "Order, payment, delivery approval and stock alerts for the shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationCenter,
});
