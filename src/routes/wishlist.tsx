import { createFileRoute } from "@tanstack/react-router";
import { WishlistPage } from "@/components/store/wishlist";

export const Route = createFileRoute("/wishlist")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wishlist | Shreekant Seeds" },
      { name: "description", content: "Seeds and pesticides you have saved to your Shreekant Seeds wishlist." },
      { property: "og:title", content: "Wishlist | Shreekant Seeds" },
      { property: "og:description", content: "Seeds and pesticides you have saved to your Shreekant Seeds wishlist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WishlistPage,
});
