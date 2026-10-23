import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckoutPage } from "@/components/store/pages";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout")({
  // The Supabase session lives in browser storage, so the gate runs client-side only.
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/customer-login", search: { redirect: "/checkout" } });
  },
  head: () => ({
    meta: [
      { title: "Checkout | Shreekant Seeds" },
      { name: "description", content: "Choose a delivery address, check stock and see your order total before payment." },
      { property: "og:title", content: "Checkout | Shreekant Seeds" },
      { property: "og:description", content: "Choose a delivery address, check stock and see your order total before payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});
