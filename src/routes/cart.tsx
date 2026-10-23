import { createFileRoute } from "@tanstack/react-router";
import { CartPage } from "@/components/store/pages";
export const Route = createFileRoute("/cart")({ head: () => ({ meta: [{ title: "Cart | Shreekant Seeds" }, { name: "description", content: "Review demo cart items and totals." }, { property: "og:title", content: "Cart | Shreekant Seeds" }, { property: "og:description", content: "Review demo cart items and totals." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: CartPage });
