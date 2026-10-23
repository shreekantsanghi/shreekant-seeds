import { Link } from "@tanstack/react-router";
import { Heart, Trash2, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ImageFrame, LoadingGrid, PageIntro, StockBadge, money, useProductStock } from "./core";
import { useProducts, type Product } from "@/lib/catalog";
import { useCopy, useStore } from "@/lib/store-context";
import { useWishlist } from "@/lib/use-wishlist";

function WishlistRow({ product, onRemove }: { product: Product; onRemove: () => void }) {
  const copy = useCopy();
  const { addToCart, cart } = useStore();
  const { outOfStock } = useProductStock(product.id);
  const inCart = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
  return (
    <article className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-lg bg-card p-3 ring-1 ring-border sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
      <Link to="/products/$id" params={{ id: product.id }}>
        <ImageFrame src={product.imageUrl} alt={copy(product.name)} ratio="aspect-square" className="rounded-md" />
      </Link>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-sage">{product.categoryName ? copy(product.categoryName) : ""}</p>
        <Link to="/products/$id" params={{ id: product.id }} className="font-semibold leading-snug">{copy(product.name)}</Link>
        <p className="text-sm text-muted-foreground">{copy(product.pack)}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-xl font-semibold">{money(product.price)}</span>
          {product.mrp && product.mrp > product.price && <span className="text-sm text-muted-foreground line-through">{money(product.mrp)}</span>}
        </div>
        <div className="mt-1"><StockBadge productId={product.id} /></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="h-11 rounded-full" disabled={outOfStock} onClick={() => addToCart(product.id, 1, copy(product.name))}>
            <ShoppingBasket />
            {outOfStock
              ? copy({ hi: "अभी उपलब्ध नहीं", en: "Not available" })
              : inCart > 0
                ? copy({ hi: `कार्ट में और जोड़ें (${inCart})`, en: `Add one more (${inCart} in cart)` })
                : copy({ hi: "कार्ट में डालें", en: "Move to cart" })}
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-full">
            <Link to="/products/$id" params={{ id: product.id }}>{copy({ hi: "जानकारी देखें", en: "View details" })}</Link>
          </Button>
          <Button variant="ghost" className="h-11 rounded-full text-destructive" onClick={onRemove}>
            <Trash2 />{copy({ hi: "हटाएँ", en: "Remove" })}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function WishlistPage() {
  const copy = useCopy();
  const wishlist = useWishlist();
  const productsQuery = useProducts();
  const products = productsQuery.data ?? [];
  // Only active catalogue products resolve, so removed or hidden items simply drop out.
  const rows = wishlist.productIds.flatMap((id) => {
    const product = products.find((item) => item.id === id);
    return product ? [product] : [];
  });

  return (
    <main>
      <PageIntro
        title={copy({ hi: "विशलिस्ट", en: "Wishlist" })}
        description={copy({ hi: "आपके सहेजे हुए बीज और कीटनाशक।", en: "The seeds and pesticides you have saved." })}
      />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {!wishlist.isSignedIn ? (
          <div>
            <EmptyState
              title={copy({ hi: "विशलिस्ट देखने के लिए साइन इन करें", en: "Sign in to see your wishlist" })}
              description={copy({ hi: "विशलिस्ट आपके खाते से जुड़ी होती है, इसलिए हर डिवाइस पर सुरक्षित रहती है।", en: "Your wishlist is saved to your account, so it stays with you on every device." })}
            />
            <Button asChild className="mx-auto mt-5 flex w-fit rounded-full">
              <Link to="/customer-login" search={{ redirect: "/wishlist" }}>{copy({ hi: "साइन इन करें", en: "Sign in" })}</Link>
            </Button>
          </div>
        ) : wishlist.isLoading || productsQuery.isLoading ? (
          <LoadingGrid count={2} />
        ) : wishlist.isError || productsQuery.isError ? (
          <ErrorState onRetry={() => { wishlist.refetch(); productsQuery.refetch(); }} />
        ) : rows.length === 0 ? (
          <div>
            <EmptyState
              title={copy({ hi: "आपकी विशलिस्ट खाली है", en: "Your wishlist is empty" })}
              description={copy({ hi: "किसी भी उत्पाद पर ❤️ दबाकर उसे यहाँ सहेजें।", en: "Tap the ❤️ on any product to save it here." })}
            />
            <Button asChild className="mx-auto mt-5 flex w-fit rounded-full">
              <Link to="/products"><Heart />{copy({ hi: "उत्पाद देखें", en: "Browse products" })}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((product) => (
              <WishlistRow key={product.id} product={product} onRemove={() => wishlist.toggle(product.id, copy(product.name))} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
