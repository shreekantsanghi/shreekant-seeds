import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/components/store/pages";
export const Route = createFileRoute("/orders/")({ head: () => ({ meta: [{ title: "My Orders | Shreekant Seeds" }, { name: "description", content: "View clearly marked example order history." }, { property: "og:title", content: "My Orders | Shreekant Seeds" }, { property: "og:description", content: "View clearly marked example order history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: OrdersPage });
