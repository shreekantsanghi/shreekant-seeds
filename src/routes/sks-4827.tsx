import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MerchantLogin } from "@/components/admin/auth";

export const Route = createFileRoute("/sks-4827")({
  ssr: false,
  validateSearch: (search) => z.object({ redirect: z.string().catch("/admin") }).parse(search),
  head: () => ({
    meta: [
      { title: "Merchant Login | Shreekant Seeds" },
      { name: "description", content: "Secure sign-in for the Shreekant Seeds shop owner workspace." },
      { property: "og:title", content: "Merchant Login | Shreekant Seeds" },
      { property: "og:description", content: "Secure sign-in for the Shreekant Seeds shop owner workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MerchantLoginRoute,
});

function MerchantLoginRoute() {
  const { redirect } = Route.useSearch();
  const safe = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/admin";
  return <MerchantLogin redirectTo={safe} />;
}
