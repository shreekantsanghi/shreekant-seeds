import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/store/pages";
export const Route = createFileRoute("/categories/$category")({ head: ({ params }) => ({ meta: [{ title: `${params.category === "seeds" ? "Seeds" : "Pesticides"} | Shreekant Seeds` }, { name: "description", content: `Browse the demo ${params.category} catalog.` }, { property: "og:title", content: `${params.category} | Shreekant Seeds` }, { property: "og:description", content: "Browse the Demo category foundation." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: CategoryRoute });
function CategoryRoute() { const { category } = Route.useParams(); return <ProductsPage category={category} />; }
