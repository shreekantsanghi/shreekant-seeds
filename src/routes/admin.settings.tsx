import { createFileRoute } from "@tanstack/react-router";
import { AdminSettings } from "@/components/admin/settings";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Shreekant Seeds" },
      { name: "description", content: "Merchant settings and account security." },
      { property: "og:title", content: "Settings | Shreekant Seeds" },
      { property: "og:description", content: "Merchant settings and account security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminSettings,
});
