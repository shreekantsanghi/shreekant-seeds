import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/store/pages";
export const Route = createFileRoute("/products/")({ head: () => ({ meta: [{ title: "All Products | Shreekant Seeds" }, { name: "description", content: "Browse the Demo demo product catalog." }, { property: "og:title", content: "All Products | Shreekant Seeds" }, { property: "og:description", content: "Browse the Demo demo product catalog." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: ProductsPage });
