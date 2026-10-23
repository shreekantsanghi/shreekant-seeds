import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, FolderOpen, Heart, Home, Menu, Search, ShoppingBasket, UserRound, Phone, MessageCircle, MapPin, Clock, ChevronRight, PackageOpen, Minus, Plus, Trash2, Share2, Sprout, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useAvailability, useProducts, type Category, type Product } from "@/lib/catalog";
import { NotificationBell } from "@/components/notifications";
import { useCopy, useStore } from "@/lib/store-context";
import { SearchSuggestions } from "./search-suggestions";
import { useWishlist } from "@/lib/use-wishlist";
import { cn } from "@/lib/utils";
import logoSrc from "@/assets/shreekant-logo.png";

/** Opens the shop location in Google Maps (app on phones, browser elsewhere). */
export const SHOP_MAP_URL = "https://www.google.com/maps/search/?api=1&query=27.74032,75.7825";

export const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useStore();
  return <div className="flex shrink-0 items-center rounded-full bg-primary/8 p-0.5 ring-1 ring-primary/20" role="group" aria-label="भाषा / Language">
    <button type="button" aria-pressed={language === "hi"} onClick={() => setLanguage("hi")} className={cn("min-h-10 rounded-full px-2.5 text-xs font-semibold transition-colors sm:px-3", language === "hi" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground")}>हिन्दी</button>
    <span aria-hidden="true" className="text-border">|</span>
    <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")} className={cn("min-h-10 rounded-full px-2.5 text-xs font-semibold transition-colors sm:px-3", language === "en" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground")}>{compact ? "EN" : "English"}</button>
  </div>;
}

export function Brand({ inverse = false, mobileCompact = false }: { inverse?: boolean; mobileCompact?: boolean }) {
  return <Link to="/" aria-label="Shreekant Seeds home" className={cn("flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5", inverse && "text-primary-foreground")}>
    <img src={logoSrc} alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0 rounded-lg object-contain" />
    <span className="min-w-0 leading-tight">
      {mobileCompact && <span className="block font-display text-[13px] font-semibold leading-[1.05] sm:hidden">Shreekant<br />Seeds</span>}
      <span className={cn("font-display text-sm font-semibold sm:text-base", mobileCompact ? "hidden sm:block" : "block truncate")}>Shreekant Seeds</span>
      <span className={cn("block truncate text-xs text-sage", mobileCompact && "hidden sm:block", inverse && "text-primary-foreground/70")}>श्रीकान्त सीड्स</span>
    </span>
  </Link>;
}

export function StoreHeader() {
  const copy = useCopy();
  const { cartCount, isSignedIn } = useStore();
  const [menu, setMenu] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSuggestOpen(false); navigate({ to: "/search", search: { q: query } }); };
  const suggestProps = { onFocus: () => setSuggestOpen(true), onBlur: () => setSuggestOpen(false) };
  const closeMenu = () => setMenu(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 4); onScroll(); window.addEventListener("scroll", onScroll, { passive: true }); return () => window.removeEventListener("scroll", onScroll); }, []);
  useEffect(() => {
    if (!menu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>("button")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeMenu(); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [menu]);
  const mobileLinks = [
    { to: "/", label: copy({ hi: "मुखपृष्ठ", en: "Home" }), icon: Home },
    { to: "/products", label: copy({ hi: "सभी उत्पाद", en: "Products" }), icon: PackageOpen },
    { to: "/categories", label: copy({ hi: "श्रेणियाँ", en: "Categories" }), icon: FolderOpen },
    { to: "/orders", label: copy({ hi: "मेरे ऑर्डर", en: "My orders" }), icon: ShoppingBasket },
    { to: "/wishlist", label: copy({ hi: "विशलिस्ट", en: "Wishlist" }), icon: Heart },
    { to: "/notifications", label: copy({ hi: "सूचनाएँ", en: "Notifications" }), icon: Bell },
    { to: "/account", label: copy({ hi: "मेरा खाता", en: "My account" }), icon: UserRound },
  ] as const;
  return <header className={cn("sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur transition-shadow duration-300", scrolled && "shadow-[0_6px_18px_-14px_color-mix(in_oklab,var(--color-foreground)_45%,transparent)]")}>
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-1 py-2 sm:min-h-17 sm:gap-3 lg:flex">
        <Brand mobileCompact />
        <nav className="ml-5 hidden items-center gap-6 text-sm font-medium lg:flex" aria-label="Main navigation">
          <Link to="/products" activeProps={{ className: "text-accent" }}>{copy({ hi: "सभी उत्पाद", en: "All products" })}</Link>
          <Link to="/categories" activeProps={{ className: "text-accent" }}>{copy({ hi: "श्रेणियाँ", en: "Categories" })}</Link>
          <Link to="/orders" activeProps={{ className: "text-accent" }}>{copy({ hi: "मेरे ऑर्डर", en: "My orders" })}</Link>
        </nav>
        <form onSubmit={submit} role="search" className="relative ml-auto hidden max-w-sm flex-1 md:block"><label className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"><Search aria-hidden="true" className="size-4 text-muted-foreground" /><input aria-label={copy({ hi: "बीज या कीटनाशक खोजें", en: "Search seeds or pesticides" })} value={query} onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true); }} {...suggestProps} className="w-full bg-transparent text-sm outline-none" placeholder={copy({ hi: "बीज या कीटनाशक खोजें…", en: "Search seeds or pesticides…" })} /></label><SearchSuggestions query={query} open={suggestOpen} onPick={() => { setSuggestOpen(false); setQuery(""); }} /></form>
        <LanguageSwitch compact />
        <div className="lg:hidden">{isSignedIn && <NotificationBell />}</div>
        <Link to="/cart" aria-label={copy({ hi: "कार्ट", en: "Cart" })} className="relative grid size-11 place-items-center rounded-full hover:bg-primary/8"><ShoppingBasket className="size-5" /><span className="absolute right-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground">{cartCount}</span></Link>

        <div className="hidden items-center lg:flex"><WishlistHeaderLink />{isSignedIn && <NotificationBell />}<Link to="/account" aria-label={copy({ hi: "खाता", en: "Account" })} className="grid size-11 place-items-center rounded-full hover:bg-primary/8"><UserRound className="size-5" /></Link></div>
        <Button variant="ghost" size="icon" onClick={() => setMenu(true)} className="lg:hidden" aria-expanded={menu} aria-controls="mobile-navigation" aria-label={copy({ hi: "मेनू खोलें", en: "Open menu" })}><Menu /></Button>
      </div>
      <form onSubmit={submit} role="search" className="relative pb-2 md:hidden"><label className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"><Search aria-hidden="true" className="size-5 text-muted-foreground" /><input aria-label={copy({ hi: "बीज या कीटनाशक खोजें", en: "Search seeds or pesticides" })} value={query} onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true); }} {...suggestProps} className="w-full bg-transparent text-base outline-none" placeholder={copy({ hi: "बीज या कीटनाशक खोजें…", en: "Search seeds or pesticides…" })} /></label><SearchSuggestions query={query} open={suggestOpen} onPick={() => { setSuggestOpen(false); setQuery(""); }} /></form>
    </div>
    {menu && createPortal(<div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" className="absolute inset-0 h-full w-full bg-foreground/55" onClick={closeMenu} aria-label={copy({ hi: "मेनू के बाहर बंद करें", en: "Close menu backdrop" })} />
      <div ref={drawerRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title" aria-describedby="mobile-navigation-description" className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col overflow-y-auto border-l border-border bg-background shadow-xl">
        <div className="relative border-b border-border bg-surface px-5 py-5 pr-16 text-left">
          <h2 id="mobile-navigation-title" className="font-display text-2xl font-semibold">{copy({ hi: "दुकान मेनू", en: "Store menu" })}</h2>
          <p id="mobile-navigation-description" className="mt-1 text-sm text-muted-foreground">{copy({ hi: "श्रीकान्त सीड्स के सभी पेज", en: "All Shreekant Seeds pages" })}</p>
          <Button variant="ghost" size="icon" onClick={closeMenu} className="absolute right-3 top-3" aria-label={copy({ hi: "मेनू बंद करें", en: "Close menu" })}><X /></Button>
        </div>
        <nav aria-label={copy({ hi: "मुख्य नेविगेशन", en: "Main navigation" })} className="grid gap-1 p-4">
          {mobileLinks.map(({ to, label, icon: Icon }) => <Link key={to} to={to} onClick={closeMenu} className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 font-semibold hover:bg-surface"><Icon aria-hidden="true" className="size-5 text-sage" /><span>{label}</span><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" /></Link>)}
        </nav>
      </div>
    </div>, document.body)}
  </header>;
}

export function StoreFooter() {
  const copy = useCopy();
  return <footer className="border-t border-border bg-surface"><div className="mx-auto grid max-w-7xl gap-6 px-4 py-9 sm:grid-cols-2 sm:gap-8 sm:px-6 sm:py-12 lg:grid-cols-4">
    <div><Brand /><p className="mt-4 max-w-xs text-sm text-muted-foreground">{copy({ hi: "स्थानीय कृषि दुकान, अब ऑनलाइन। बीज और कीटनाशक।", en: "Your local agricultural shop, now online. Seeds and pesticides." })}</p></div>
    <div><h2 className="eyebrow">{copy({ hi: "दुकान", en: "Shop" })}</h2><a href={SHOP_MAP_URL} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-foreground/75 hover:underline">Kapil Mandi,<br />Neem Ka Thana, Sikar,<br />Rajasthan — 332713</a><p className="mt-3 flex items-center gap-2 text-sm"><Clock className="size-4" /> 9:00 AM – 7:00 PM</p></div>
    <div><h2 className="eyebrow">{copy({ hi: "संपर्क", en: "Contact" })}</h2><a href="tel:9414466727" className="mt-3 flex min-h-10 items-center gap-2 text-sm font-medium"><Phone className="size-4" />9414466727</a><a href="https://wa.me/919414466727" target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 text-sm font-medium"><MessageCircle className="size-4" />WhatsApp</a><Link to="/account" className="flex min-h-10 items-center gap-2 text-sm font-medium"><UserRound className="size-4" />{copy({ hi: "खाता", en: "Account" })}</Link><Link to="/orders" className="flex min-h-10 items-center gap-2 text-sm font-medium"><PackageOpen className="size-4" />{copy({ hi: "ऑर्डर", en: "Orders" })}</Link></div>
    <div><h2 className="eyebrow">{copy({ hi: "भाषा व जानकारी", en: "Language & information" })}</h2><div className="mt-3"><LanguageSwitch /></div><div className="mt-4 flex gap-4 text-sm font-medium"><Link to="/privacy" className="underline-offset-4 hover:underline">{copy({ hi: "गोपनीयता नीति", en: "Privacy Policy" })}</Link><Link to="/terms" className="underline-offset-4 hover:underline">{copy({ hi: "नियम व शर्तें", en: "Terms" })}</Link></div></div>
  </div><div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">© 2026 Shreekant Seeds · {copy({ hi: "डिलीवरी शुल्क चेकआउट पर तय होगा · केवल ऑनलाइन भुगतान", en: "Delivery charge confirmed at checkout · Online payment only" })}</div></footer>;
}

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="border-b border-border bg-surface"><div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-12">{eyebrow && <p className="eyebrow text-accent">{eyebrow}</p>}<div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{title}</h1>{description && <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>}</div>{actions}</div></div></header>;
}

export function ImageFrame({ src, alt, className, ratio = "aspect-[4/3]" }: { src: string | null; alt: string; className?: string; ratio?: string }) {
  if (!src) return <div className={cn(ratio, "grid w-full place-items-center bg-surface text-muted-foreground", className)}><PackageOpen aria-hidden="true" className="size-8" /><span className="sr-only">{alt}</span></div>;
  return <img src={src} alt={alt} loading="lazy" className={cn(ratio, "w-full object-cover", className)} />;
}

export function CategoryCard({ category }: { category: Category }) {
  const copy = useCopy();
  const isSeed = category.slug.includes("seed") || category.slug.includes("बीज");
  const name = copy(category.name);
  return <div className="flex flex-col items-start gap-3 py-3"><div className="min-w-0 max-w-full"><h3 className="font-display text-2xl font-semibold break-words">{isSeed ? <Sprout aria-hidden="true" className="mr-1 inline size-6 align-[-0.15em] text-success" /> : <span aria-hidden="true">🧴</span>} {name}</h3>{copy(category.description) && <p className="mt-1 text-sm text-muted-foreground">{copy(category.description)}</p>}</div><Link to="/categories/$category" params={{ category: category.slug }} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"><span className="break-words">{copy({ hi: `${name} देखें`, en: `Browse ${name}` })}</span><ChevronRight aria-hidden="true" className="size-4 shrink-0" /></Link></div>;
}

/** Customer-facing stock signal. Absent data means the shop has not tracked stock for this item. */
export function useProductStock(productId: string) {
  const { data } = useAvailability();
  const row = data?.[productId];
  return { outOfStock: row ? !row.inStock : false, low: row ? row.inStock && row.isLow : false };
}

export function StockBadge({ productId }: { productId: string }) {
  const copy = useCopy();
  const { outOfStock, low } = useProductStock(productId);
  if (outOfStock) return <span className="text-xs font-semibold text-destructive">{copy({ hi: "स्टॉक खत्म", en: "Out of stock" })}</span>;
  if (low) return <span className="text-xs font-semibold text-accent-strong">{copy({ hi: "थोड़ा ही बचा है", en: "Only a few left" })}</span>;
  return null;
}

/** Header shortcut to the customer's saved products. */
export function WishlistHeaderLink() {
  const copy = useCopy();
  const { count, isSignedIn } = useWishlist();
  return <Link to="/wishlist" aria-label={copy({ hi: "विशलिस्ट", en: "Wishlist" })} className="relative grid size-11 place-items-center rounded-full hover:bg-primary/8"><Heart className="size-5" />{isSignedIn && count > 0 && <span className="absolute right-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground">{count}</span>}</Link>;
}

/** Shared heart toggle. Guests are sent to the existing customer login flow. */
export function WishlistButton({ product, className }: { product: Product; className?: string }) {
  const copy = useCopy();
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(product.id);
  return <button type="button" onClick={() => toggle(product.id, copy(product.name))} aria-pressed={saved} aria-label={saved ? copy({ hi: "विशलिस्ट से हटाएँ", en: "Remove from wishlist" }) : copy({ hi: "विशलिस्ट में जोड़ें", en: "Add to wishlist" })} className={cn("grid size-10 place-items-center rounded-full bg-background/90 ring-1 ring-border transition hover:bg-background", className)}><Heart className={cn("size-5 transition", saved ? "fill-destructive text-destructive" : "text-foreground/60")} /></button>;
}

export function ProductCard({ product }: { product: Product }) {
  const copy = useCopy(); const { addToCart, setQuantity, cart } = useStore();
  const { outOfStock } = useProductStock(product.id);
  // The cart is the only source of truth for the number shown here.
  const cartQuantity = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
  const discount = product.mrp && product.mrp > product.price ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0;
  return <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg bg-card ring-1 ring-border transition duration-300 hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/35"><Link to="/products/$id" params={{ id: product.id }} className="overflow-hidden"><ImageFrame src={product.imageUrl} alt={copy(product.name)} className="transition duration-500 group-hover:scale-[1.03]" /></Link><WishlistButton product={product} className="absolute right-1.5 top-1.5 z-10" /><div className="flex flex-1 flex-col p-3.5 sm:p-4"><p className="text-xs font-semibold text-sage">{product.categoryName ? copy(product.categoryName) : ""}</p><Link to="/products/$id" params={{ id: product.id }} className="mt-1 font-semibold leading-snug">{copy(product.name)}</Link><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{copy(product.pack)}</p><div className="mt-2 flex flex-wrap items-baseline gap-x-2"><span className="font-display text-xl font-semibold text-primary sm:text-2xl">{money(product.price)}</span>{product.mrp && product.mrp > product.price && <span className="text-sm text-muted-foreground line-through">{money(product.mrp)}</span>}{discount > 0 && <span className="text-xs font-semibold text-success">{discount}% {copy({ hi: "कम", en: "off" })}</span>}</div>{product.offer && <OfferNote offer={product.offer} />}<div className="mt-1.5"><StockBadge productId={product.id} /></div><div className="mt-auto grid gap-2 pt-3">{cartQuantity > 0 ? <div className="flex justify-center"><QuantityControl value={cartQuantity} onChange={(next) => setQuantity(product.id, Math.max(0, Math.min(99, next)))} /></div> : <Button onClick={() => addToCart(product.id, 1, copy(product.name))} disabled={outOfStock} className="h-11 rounded-full transition-colors">{outOfStock ? copy({ hi: "अभी उपलब्ध नहीं", en: "Not available" }) : copy({ hi: "कार्ट में डालें", en: "Add to cart" })}</Button>}<Button asChild variant="ghost" className="h-10 rounded-full text-primary"><Link to="/products/$id" params={{ id: product.id }}>{copy({ hi: "जानकारी देखें", en: "View details" })}</Link></Button></div></div></article>;
}

export function ProductGrid({ items }: { items: Product[] }) { return <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>; }

export function LoadingGrid({ count = 4 }: { count?: number }) { const copy = useCopy(); return <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" aria-busy="true" aria-live="polite"><span className="sr-only">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</span>{Array.from({ length: count }).map((_, index) => <div key={index} className="h-64 animate-pulse rounded-lg bg-surface ring-1 ring-border" />)}</div>; }

export function ErrorState({ onRetry }: { onRetry?: () => void }) { const copy = useCopy(); return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"><h2 className="font-display text-2xl font-semibold">{copy({ hi: "जानकारी लोड नहीं हो सकी", en: "Could not load information" })}</h2><p className="mt-2 text-sm text-muted-foreground">{copy({ hi: "कृपया दोबारा कोशिश करें या दुकान से संपर्क करें।", en: "Please try again or contact the shop." })}</p>{onRetry && <Button variant="outline" className="mt-4 rounded-full" onClick={onRetry}>{copy({ hi: "दोबारा कोशिश करें", en: "Try again" })}</Button>}</div>; }

export function DemoNotice({ children }: { children?: ReactNode }) { const copy = useCopy(); return <div className="border-l-4 border-accent bg-accent/10 px-4 py-3 text-sm text-foreground/80">{children ?? copy({ hi: "यह हिस्सा अभी नमूना है — असली जानकारी अगले चरण में जुड़ेगी।", en: "This section is still a sample — real information will be connected in a later phase." })}</div>; }

export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border bg-surface p-8 text-center"><div><PackageOpen className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-3 font-display text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p></div></div>; }

export function QuantityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) { const copy = useCopy(); return <div className="inline-flex h-12 items-center rounded-full border border-border" role="group" aria-label={copy({ hi: "मात्रा", en: "Quantity" })}><Button variant="ghost" size="icon" className="size-11 rounded-full" onClick={() => onChange(value - 1)} aria-label={copy({ hi: "मात्रा कम करें", en: "Decrease quantity" })}><Minus /></Button><span className="w-10 text-center font-semibold" aria-live="polite">{value}</span><Button variant="ghost" size="icon" className="size-11 rounded-full" onClick={() => onChange(value + 1)} aria-label={copy({ hi: "मात्रा बढ़ाएँ", en: "Increase quantity" })}><Plus /></Button></div>; }

export function CartContent({ compact = false }: { compact?: boolean }) {
 const copy = useCopy(); const { cart, setQuantity, removeFromCart, isSignedIn, cartLoading, cartError } = useStore(); const { data: products = [], isLoading } = useProducts(); const rows = cart.flatMap((item) => { const product = products.find((p) => p.id === item.productId); return product ? [{ ...item, product }] : []; }); const subtotal = rows.reduce((sum, row) => sum + row.product.price * row.quantity, 0);
 if (cartError) return <ErrorState />;
 if (cartLoading || (isLoading && cart.length)) return <LoadingGrid count={2} />;
 if (!rows.length) return <div><EmptyState title={copy({ hi: "आपकी कार्ट खाली है", en: "Your cart is empty" })} description={copy({ hi: "बीज या कीटनाशक चुनकर कार्ट में डालें।", en: "Choose seeds or pesticides and add them to your cart." })} /><Button asChild className="mx-auto mt-5 flex w-fit rounded-full"><Link to="/products">{copy({ hi: "उत्पाद देखें", en: "Browse products" })}</Link></Button></div>;
 return <div className={cn("grid gap-6", !compact && "lg:grid-cols-[minmax(0,1fr)_22rem]")}><div className="space-y-3">{rows.map(({ product, quantity }) => <article key={product.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-lg bg-card p-3 ring-1 ring-border sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4"><ImageFrame src={product.imageUrl} alt={copy(product.name)} ratio="aspect-square" className="rounded-md" /><div className="min-w-0"><h3 className="font-semibold">{copy(product.name)}</h3><p className="text-sm text-muted-foreground">{copy(product.pack)}</p><div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-sm"><span>{copy({ hi: "कीमत", en: "Price" })}: {money(product.price)}</span><strong>{copy({ hi: "उप-योग", en: "Subtotal" })}: {money(product.price * quantity)}</strong></div><div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-2"><QuantityControl value={quantity} onChange={(next) => setQuantity(product.id, next)} /><Button variant="ghost" onClick={() => removeFromCart(product.id)} className="ml-auto text-destructive" aria-label={copy({ hi: `${copy(product.name)} हटाएँ`, en: `Remove ${copy(product.name)}` })}><Trash2 />{copy({ hi: "हटाएँ", en: "Remove" })}</Button></div></div></article>)}</div><OrderSummary subtotal={subtotal} /></div>;
}

export function OrderSummary({ subtotal, checkout = false }: { subtotal: number; checkout?: boolean }) { const copy = useCopy(); return <aside className="h-fit rounded-lg bg-card p-5 ring-1 ring-border"><h2 className="font-display text-2xl font-semibold">{copy({ hi: "ऑर्डर सारांश", en: "Order summary" })}</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt>{copy({ hi: "उप-योग", en: "Subtotal" })}</dt><dd>{money(subtotal)}</dd></div><div className="flex justify-between"><dt>{copy({ hi: "छूट", en: "Discount" })}</dt><dd>—</dd></div><div className="flex justify-between gap-3"><dt>{copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" })}</dt><dd className="text-right text-muted-foreground">{copy({ hi: "चेकआउट पर तय होगा", en: "To be confirmed" })}</dd></div><div className="flex justify-between border-t border-border pt-3 text-base font-bold"><dt>{copy({ hi: "कुल", en: "Total" })}</dt><dd>{money(subtotal)}</dd></div></dl>{!checkout && <Button asChild className="mt-5 h-12 w-full rounded-full"><Link to="/checkout">{copy({ hi: "चेकआउट पर जाएँ", en: "Proceed to checkout" })}</Link></Button>}<p className="mt-3 text-xs text-muted-foreground">{copy({ hi: "अंतिम कीमत और स्टॉक बाद में सर्वर पर जाँचे जाएँगे।", en: "Final price and stock will later be verified securely on the server." })}</p></aside>; }

export function DetailActions({ product }: { product: Product }) { const copy = useCopy(); const { addToCart, setQuantity: setCartQuantity, cart } = useStore(); const { outOfStock } = useProductStock(product.id); const cartQuantity = cart.find((item) => item.productId === product.id)?.quantity ?? 0; const [pending, setPending] = useState(1); const [shareUrl, setShareUrl] = useState(""); useEffect(() => setShareUrl(window.location.href), []); const share = async () => { if (navigator.share) await navigator.share({ title: copy(product.name), text: copy(product.description), url: shareUrl }); else if (navigator.clipboard && shareUrl) await navigator.clipboard.writeText(shareUrl); }; return <div><div className="mb-2 flex items-center justify-between gap-3"><StockBadge productId={product.id} /><WishlistButton product={product} className="ml-auto" /></div><p className="mb-2 text-sm font-medium">{cartQuantity > 0 ? copy({ hi: "कार्ट में मात्रा", en: "Quantity in cart" }) : copy({ hi: "मात्रा चुनें", en: "Choose quantity" })}</p>{cartQuantity > 0 ? <div className="flex items-center gap-3"><QuantityControl value={cartQuantity} onChange={(value) => setCartQuantity(product.id, Math.max(0, Math.min(99, value)))} /><Button className="h-12 min-w-0 flex-1 rounded-full" disabled={outOfStock || cartQuantity >= 99} onClick={() => addToCart(product.id, 1, copy(product.name))}>{outOfStock ? copy({ hi: "अभी उपलब्ध नहीं", en: "Not available" }) : copy({ hi: "कार्ट में डालें", en: "Add to cart" })}</Button></div> : <div className="flex items-center gap-3"><QuantityControl value={pending} onChange={(value) => setPending(Math.max(1, Math.min(99, value)))} /><Button className="h-12 min-w-0 flex-1 rounded-full" disabled={outOfStock} onClick={() => addToCart(product.id, pending, copy(product.name))}>{outOfStock ? copy({ hi: "अभी उपलब्ध नहीं", en: "Not available" }) : copy({ hi: "कार्ट में डालें", en: "Add to cart" })}</Button></div>}<div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-full" onClick={share}><Share2 />{copy({ hi: "लिंक शेयर करें", en: "Share link" })}</Button><Button asChild variant="outline" className="rounded-full"><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${copy(product.name)} — ${copy(product.pack)} — ${money(product.price)} ${shareUrl}`)}`}><MessageCircle />WhatsApp</a></Button></div></div>; }

export function ContactStrip() { const copy = useCopy(); return <section className="bg-primary text-primary-foreground" aria-labelledby="contact-heading"><div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-3"><div className="flex gap-3"><MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" /><div><h2 id="contact-heading" className="font-semibold">Shreekant Seeds · श्रीकान्त सीड्स</h2><a href={SHOP_MAP_URL} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-primary-foreground/75 hover:underline">Kapil Mandi, Neem Ka Thana, Sikar, Rajasthan — 332713</a><p className="mt-2 flex items-center gap-2 text-sm text-primary-foreground/75"><Clock aria-hidden="true" className="size-4" />9:00 AM – 7:00 PM</p></div></div><a href="tel:9414466727" className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-primary-foreground/10"><Phone aria-hidden="true" className="size-5 text-accent" /><span><small className="block text-primary-foreground/70">{copy({ hi: "फोन करें", en: "Call the shop" })}</small>9414466727</span></a><a href="https://wa.me/919414466727" target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-primary-foreground/10"><MessageCircle aria-hidden="true" className="size-5 text-accent" /><span><small className="block text-primary-foreground/70">WhatsApp</small>{copy({ hi: "WhatsApp पर संपर्क करें", en: "Contact on WhatsApp" })}</span></a></div></section>; }

export function OfferNote({ offer, className }: { offer: import("@/lib/catalog").ProductOffer; className?: string }) {
  const copy = useCopy();
  const until = new Date(offer.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return <p className={cn("mt-1 inline-flex w-fit flex-wrap items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success", className)}>{copy({ hi: `ऑफ़र ${Number(offer.percent)}% छूट`, en: `Offer ${Number(offer.percent)}% off` })}{offer.reason ? ` · ${copy(offer.reason)}` : ""}<span className="font-normal">· {copy({ hi: `${until} तक`, en: `till ${until}` })}</span></p>;
}
