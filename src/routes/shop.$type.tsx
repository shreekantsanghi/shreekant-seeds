import { createFileRoute } from "@tanstack/react-router";
import { ProductTypePage } from "@/components/store/pages";
const names: Record<string, string> = { seed: "Seeds", fertilizer: "Fertilizers", pesticide: "Pesticides / Crop Protection", other: "Other products" };
export const Route = createFileRoute("/shop/$type")({
  head: ({ params }) => {
    const n = names[params.type] ?? "Products";
    return { meta: [{ title: `${n} | Shreekant Seeds` }, { name: "description", content: `Browse ${n.toLowerCase()} by category at Shreekant Seeds, Neem Ka Thana.` }, { property: "og:title", content: `${n} | Shreekant Seeds` }, { property: "og:description", content: `Browse ${n.toLowerCase()} by category.` }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] };
  },
  component: ShopType,
});
function ShopType() { const { type } = Route.useParams(); return <ProductTypePage type={type} />; }
