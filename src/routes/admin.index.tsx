import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/core";
export const Route = createFileRoute("/admin/")({ head: () => ({ meta: [{ title: "Admin dashboard | Shreekant Seeds" }, { name: "description", content: "Demo admin dashboard foundation." }, { property: "og:title", content: "Admin dashboard | Shreekant Seeds" }, { property: "og:description", content: "Demo merchant workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: AdminDashboard });
