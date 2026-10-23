import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminProducts } from "@/components/admin/catalog";
export const Route = createFileRoute("/admin/products/")({ validateSearch: (search) => z.object({ brand: z.string().optional().catch(undefined) }).parse(search), head: () => ({ meta: [{ title: "Manage products | Shreekant Seeds" }, { name: "description", content: "Demo manage products foundation." }, { property: "og:title", content: "Manage products | Shreekant Seeds" }, { property: "og:description", content: "Demo merchant workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: AdminProductsRoute });
function AdminProductsRoute() { const { brand } = Route.useSearch(); return <AdminProducts brand={brand} />; }
