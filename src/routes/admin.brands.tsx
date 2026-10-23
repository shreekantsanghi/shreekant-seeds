import { createFileRoute } from "@tanstack/react-router";
import { AdminBrands } from "@/components/admin/brands";

export const Route = createFileRoute("/admin/brands")({
  head: () => ({
    meta: [
      { title: "Manage brands | Shreekant Seeds" },
      { name: "description", content: "Create and manage product brands and company names." },
      { property: "og:title", content: "Manage brands | Shreekant Seeds" },
      { property: "og:description", content: "Merchant brand management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBrands,
});
