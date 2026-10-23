import { createFileRoute } from "@tanstack/react-router";
import { OrderDetailPage } from "@/components/store/pages";
export const Route = createFileRoute("/orders/$id/")({ head: () => ({ meta: [{ title: "Order Details | Shreekant Seeds" }, { name: "description", content: "Your order items, GST breakdown, delivery details and payment status." }, { property: "og:title", content: "Order Details | Shreekant Seeds" }, { property: "og:description", content: "Your order items, GST breakdown and payment status." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: OrderRoute });
function OrderRoute() { const { id } = Route.useParams(); return <OrderDetailPage id={id} />; }
