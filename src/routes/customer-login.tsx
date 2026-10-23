import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CustomerAuthPage } from "@/components/store/account";

export const Route = createFileRoute("/customer-login")({
  ssr: false,
  validateSearch: (search) => z.object({ redirect: z.string().catch("/account") }).parse(search),
  head: () => ({
    meta: [
      { title: "Customer Login | Shreekant Seeds" },
      { name: "description", content: "Sign in or create a customer account to save delivery addresses at Shreekant Seeds." },
      { property: "og:title", content: "Customer Login | Shreekant Seeds" },
      { property: "og:description", content: "Sign in or create a customer account at Shreekant Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomerLoginRoute,
});

function CustomerLoginRoute() {
  const { redirect } = Route.useSearch();
  const safe = redirect.startsWith("/") && !redirect.startsWith("//") && !redirect.startsWith("/admin") ? redirect : "/account";
  return <CustomerAuthPage redirectTo={safe} />;
}
