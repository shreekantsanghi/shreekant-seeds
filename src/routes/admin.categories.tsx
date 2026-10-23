import { createFileRoute } from "@tanstack/react-router";
import { AdminCategories } from "@/components/admin/catalog";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({
    meta: [
      { title: "Manage categories | Shreekant Seeds" },
      { name: "description", content: "Create and manage the seed and pesticide categories." },
      { property: "og:title", content: "Manage categories | Shreekant Seeds" },
      { property: "og:description", content: "Merchant category management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCategories,
});
