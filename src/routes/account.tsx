import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountPage } from "@/components/store/account";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  // The Supabase session lives in browser storage, so the gate runs client-side only.
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/customer-login", search: { redirect: "/account" } });
  },
  head: () => ({
    meta: [
      { title: "My Account | Shreekant Seeds" },
      { name: "description", content: "View and update your Shreekant Seeds customer profile." },
      { property: "og:title", content: "My Account | Shreekant Seeds" },
      { property: "og:description", content: "View and update your Shreekant Seeds customer profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});
