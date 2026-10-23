import { createFileRoute } from "@tanstack/react-router";
import { AdminProductForm } from "@/components/admin/catalog";
export const Route = createFileRoute("/admin/products/new")({ head: () => ({ meta: [{ title: "Add product | Shreekant Seeds" }, { name: "description", content: "Demo add product foundation." }, { property: "og:title", content: "Add product | Shreekant Seeds" }, { property: "og:description", content: "Demo merchant workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: AdminProductForm });
