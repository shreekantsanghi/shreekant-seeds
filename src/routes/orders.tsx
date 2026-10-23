import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/orders")({
  // The Supabase session lives in browser storage, so the gate runs client-side only.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/customer-login", search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Orders | Shreekant Seeds" },
      { name: "description", content: "Your Shreekant Seeds orders, payment status and delivery details." },
      { property: "og:title", content: "Orders | Shreekant Seeds" },
      { property: "og:description", content: "Your Shreekant Seeds orders, payment status and delivery details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
