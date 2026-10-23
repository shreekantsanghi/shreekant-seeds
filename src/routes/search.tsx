import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SearchPage } from "@/components/store/pages";
export const Route = createFileRoute("/search")({ validateSearch: (search) => z.object({ q: z.string().catch("") }).parse(search), head: () => ({ meta: [{ title: "Search Products | Shreekant Seeds" }, { name: "description", content: "Search the demo seeds and pesticides catalog." }, { property: "og:title", content: "Product Search | Shreekant Seeds" }, { property: "og:description", content: "Search products from Shreekant Seeds." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: SearchRoute });
function SearchRoute() { const { q } = Route.useSearch(); return <SearchPage query={q} />; }
