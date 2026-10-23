import { createFileRoute, redirect } from "@tanstack/react-router";
import { AddressesPage } from "@/components/store/account";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/addresses")({
  // The Supabase session lives in browser storage, so the gate runs client-side only.
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/customer-login", search: { redirect: "/addresses" } });
  },
  head: () => ({
    meta: [
      { title: "Delivery Addresses | Shreekant Seeds" },
      { name: "description", content: "Manage your saved delivery addresses for Shreekant Seeds orders." },
      { property: "og:title", content: "Delivery Addresses | Shreekant Seeds" },
      { property: "og:description", content: "Manage your saved delivery addresses for Shreekant Seeds orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AddressesPage,
});
