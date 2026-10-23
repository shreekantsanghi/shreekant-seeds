import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotificationCenter } from "@/components/notifications";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/notifications")({
  // The Supabase session lives in browser storage, so the gate runs client-side only.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/customer-login", search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Notifications | Shreekant Seeds" },
      { name: "description", content: "Order, payment and delivery updates from Shreekant Seeds." },
      { property: "og:title", content: "Notifications | Shreekant Seeds" },
      { property: "og:description", content: "Order, payment and delivery updates from Shreekant Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <NotificationCenter />
    </main>
  ),
});
