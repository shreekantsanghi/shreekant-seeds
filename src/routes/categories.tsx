import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/categories")({ head: () => ({ meta: [{ title: "Categories | Shreekant Seeds" }, { name: "description", content: "Browse seeds and pesticides categories." }, { property: "og:title", content: "Categories | Shreekant Seeds" }, { property: "og:description", content: "Browse seeds and pesticides categories." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: () => <Outlet /> });
