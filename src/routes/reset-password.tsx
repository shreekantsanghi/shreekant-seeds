import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/store/account";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a New Password | Shreekant Seeds" },
      { name: "description", content: "Choose a new password for your Shreekant Seeds customer account." },
      { property: "og:title", content: "Set a New Password | Shreekant Seeds" },
      { property: "og:description", content: "Choose a new password for your Shreekant Seeds customer account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});
