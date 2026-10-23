import { createFileRoute, notFound } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/core";
import { AdminGuard } from "@/components/admin/auth";
import { adminSupabase as supabase } from "@/integrations/supabase/admin-client";

export const Route = createFileRoute("/admin")({
  // The Supabase session lives in browser storage, so the gate runs client-side only.
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Signed-out visitors get a plain not-found page; the merchant sign-in lives elsewhere and is never advertised.
      throw notFound();
    }
  },
  head: () => ({
    meta: [
      { title: "Admin | Shreekant Seeds" },
      { name: "description", content: "Merchant workspace for Shreekant Seeds." },
      { property: "og:title", content: "Store Admin | Shreekant Seeds" },
      { property: "og:description", content: "Merchant management workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminArea,
});

function AdminArea() {
  return (
    <AdminGuard>
      <AdminShell />
    </AdminGuard>
  );
}
