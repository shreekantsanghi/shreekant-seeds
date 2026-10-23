import { createFileRoute } from "@tanstack/react-router";
import { ProductDetailPage } from "@/components/store/pages";
import { getProductMeta } from "@/lib/product-meta.functions";

export const Route = createFileRoute("/products/$id")({
  loader: async ({ params }) => ({ meta: await getProductMeta({ data: { id: params.id } }) }),
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;
    const title = meta ? `${meta.name} | Shreekant Seeds` : "Product | Shreekant Seeds";
    const description = meta?.description || "Seeds and crop products from Shreekant Seeds, Neem Ka Thana, with local delivery.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:site_name", content: "Shreekant Seeds" },
        ...(meta ? [{ property: "og:url", content: meta.url }] : []),
        ...(meta?.image ? [{ property: "og:image", content: meta.image }, { name: "twitter:image", content: meta.image }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: ProductRoute,
});

function ProductRoute() {
  const { id } = Route.useParams();
  return <ProductDetailPage id={id} />;
}
