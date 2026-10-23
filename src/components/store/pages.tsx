import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Check, ChevronRight, MessageCircle, Search, ShoppingBasket, Sprout, Store, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { CartContent, CategoryCard, ContactStrip, DemoNotice, DetailActions, EmptyState, ErrorState, ImageFrame, LoadingGrid, OfferNote, PageIntro, ProductCard, ProductGrid, money } from "./core";
import { getMyOrder, listMyOrders } from "@/lib/customer-orders.functions";
import { CustomerDeliveryCard } from "@/components/delivery";
import { ContinueToPaymentButton } from "./pay-now";
import { CUSTOMER_TIMELINE, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatAddress, formatDate } from "@/lib/orders-shared";
import { PRODUCT_TYPES, productsByIds, useCategories, useProduct, useProducts, useProductSearch, useSimilarProductIds, type Product } from "@/lib/catalog";
import { useCopy, useStore } from "@/lib/store-context";
import { SearchSuggestions } from "./search-suggestions";
import { useAvailability } from "@/lib/catalog";

/** Touch-friendly horizontal row on phones, grid on larger screens. */
function FeaturedRow({ items, isLoading, isError, refetch, empty }: { items: Product[]; isLoading: boolean; isError: boolean; refetch: () => void; empty: { title: string; description: string } }) {
  if (isLoading) return <LoadingGrid />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!items.length) return <EmptyState title={empty.title} description={empty.description} />;
  return <SwipeRow items={items} />;
}

/** Phone-only: the card nearest the row's centre gets a very subtle lift while swiping. */
function SwipeRow({ items }: { items: Product[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const row = ref.current; if (!row) return;
    let frame = 0;
    const update = () => { frame = 0; const mid = row.scrollLeft + row.clientWidth / 2; let best = 0, dist = Infinity; Array.from(row.children).forEach((child, i) => { const el = child as HTMLElement; const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } }); setActive(best); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); row.addEventListener("scroll", onScroll, { passive: true });
    return () => { row.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [items.length]);
  return <div ref={ref} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pt-0 lg:grid-cols-4">{items.map((p, i) => <div key={p.id} className={`w-[46%] shrink-0 snap-start transition-transform duration-300 ease-out motion-reduce:transition-none sm:w-auto sm:!scale-100 sm:!translate-y-0 ${i === active ? "scale-[1.02] -translate-y-0.5" : "scale-100"}`}><ProductCard product={p} /></div>)}</div>;
}

function CatalogSection({ items, isLoading, isError, refetch, empty }: { items: Product[]; isLoading: boolean; isError: boolean; refetch: () => void; empty: { title: string; description: string } }) {
  if (isLoading) return <LoadingGrid />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!items.length) return <EmptyState title={empty.title} description={empty.description} />;
  return <ProductGrid items={items} />;
}

export function HomePage() { const copy = useCopy(); const navigate = useNavigate(); const [query, setQuery] = useState(""); const productsQuery = useProducts(); const allProducts = productsQuery.data ?? []; const availability = useAvailability().data; const available = allProducts.filter((p) => availability?.[p.id]?.inStock === true); const featured = available.filter((p) => p.isFeatured); const hasFeatured = featured.length > 0; const popular = (hasFeatured ? featured : available).slice(0, 8); return <main>
<section className="bg-primary text-primary-foreground"><div className="mx-auto max-w-7xl px-4 py-11 sm:px-6 sm:py-16 lg:py-20"><div className="reveal max-w-3xl"><p className="text-sm font-medium text-primary-foreground/75">{copy({ hi: "कपिल मंडी, नीम का थाना, सीकर", en: "Kapil Mandi, Neem Ka Thana, Sikar" })}</p><h1 className="mt-4 max-w-[18ch] font-display text-5xl font-semibold leading-[0.98] sm:text-6xl lg:text-7xl">{copy({ hi: "श्रीकान्त सीड्स — आपके स्थानीय कृषि उत्पादों की दुकान", en: "Shreekant Seeds — your local agricultural shop" })}</h1><p className="mt-5 max-w-xl text-base text-primary-foreground/75 sm:text-lg">{copy({ hi: "100% असली बीज और कीटनाशक खोजें, हमारे अपने दुकान के गोदाम से स्थानीय डिलीवरी के साथ।", en: "Find 100% original seeds and pesticides, with local delivery from our own shop godown." })}</p><form onSubmit={(e) => { e.preventDefault(); navigate({ to: "/search", search: { q: query } }); }} role="search" className="mt-7 flex max-w-xl overflow-hidden rounded-full bg-background ring-2 ring-primary-foreground/20 focus-within:ring-accent"><Search aria-hidden="true" className="ml-4 size-5 self-center text-muted-foreground" /><input aria-label={copy({ hi: "बीज या कीटनाशक खोजें", en: "Search seeds or pesticides" })} className="h-14 min-w-0 flex-1 bg-transparent px-3 text-foreground outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={copy({ hi: "बीज या कीटनाशक खोजें…", en: "Search seeds or pesticides…" })} /><Button className="h-14 rounded-full bg-accent px-6 text-accent-foreground hover:bg-accent/90">{copy({ hi: "खोजें", en: "Search" })}</Button></form><div className="mt-6 flex flex-wrap gap-3"><Button asChild className="h-12 rounded-full bg-accent px-6 text-accent-foreground hover:bg-accent/90"><Link to="/products">{copy({ hi: "उत्पाद देखें", en: "Browse products" })}</Link></Button><Button asChild variant="outline" className="h-12 rounded-full border-primary-foreground/30 bg-transparent px-6 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><a href="https://wa.me/919414466727" target="_blank" rel="noreferrer"><MessageCircle />{copy({ hi: "WhatsApp पर संपर्क करें", en: "Contact on WhatsApp" })}</a></Button></div><p className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-2 text-sm"><span className="size-2 rounded-full bg-accent" />{copy({ hi: "स्थानीय डिलीवरी · शुल्क चेकआउट पर तय होगा · केवल ऑनलाइन भुगतान", en: "Local delivery · Charge confirmed at checkout · Online payment only" })}</p></div></div></section>
<section className="bg-surface"><div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 sm:pb-12 sm:pt-16"><div className="mb-6 flex items-end justify-between gap-4"><h2 className="font-display text-2xl font-semibold sm:text-3xl">{copy({ hi: "उत्पाद प्रकार से देखें", en: "Shop by product type" })}</h2><Link to="/categories" className="text-sm font-semibold text-primary">{copy({ hi: "सभी श्रेणियाँ", en: "All categories" })}</Link></div><div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">{PRODUCT_TYPES.map((t) => <ProductTypeCard key={t.value} type={t} />)}</div></div></section>
<section className="field-edge bg-background"><div className="reveal-on-view mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pb-16 sm:pt-12"><div className="mb-5"><h2 className="font-display text-2xl font-semibold sm:text-3xl">{hasFeatured ? copy({ hi: "चुने हुए उत्पाद", en: "Featured products" }) : copy({ hi: "दुकान से उत्पाद", en: "From our shop" })}</h2><p className="mt-1 text-sm text-muted-foreground">{hasFeatured ? copy({ hi: "दुकान द्वारा चुने गए, स्टॉक में उपलब्ध", en: "Picked by the shop, in stock now" }) : copy({ hi: "अभी स्टॉक में उपलब्ध उत्पाद", en: "Products in stock now" })}</p></div><FeaturedRow items={popular} isLoading={productsQuery.isLoading} isError={productsQuery.isError} refetch={() => productsQuery.refetch()} empty={{ title: copy({ hi: "अभी कोई उत्पाद नहीं", en: "No products yet" }), description: copy({ hi: "दुकान जैसे ही उत्पाद जोड़ेगी, वे यहाँ दिखाई देंगे।", en: "Products will appear here as soon as the shop adds them." }) }} /></div></section>
<section className="bg-surface"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16"><h2 className="font-display text-2xl font-semibold sm:text-3xl">{copy({ hi: "श्रीकान्त सीड्स क्यों", en: "Why Shreekant Seeds" })}</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[BadgeCheck, "100% असली उत्पाद", "100% Original Products", "सिर्फ़ असली, भरोसेमंद कंपनियों के उत्पाद", "Only genuine products from trusted companies"], [Store, "स्थानीय दुकान", "A local shop", "कपिल मंडी, नीम का थाना में स्थित", "Located in Kapil Mandi, Neem Ka Thana"], [Truck, "स्थानीय डिलीवरी", "Local delivery", "दुकान के गोदाम से स्थानीय डिलीवरी", "Local delivery from the shop godown"], [MessageCircle, "सीधा संपर्क", "Direct contact", "फोन और WhatsApp पर दुकान से बात करें", "Talk directly with the shop by phone or WhatsApp"]].map(([Icon, hi, en, dhi, den]) => { const C = Icon as typeof Store; return <div key={hi as string} className="rounded-lg bg-card p-5 ring-1 ring-border transition-transform duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-md"><C className="size-7 text-accent" /><h3 className="mt-4 font-display text-2xl font-semibold">{copy({ hi: hi as string, en: en as string })}</h3><p className="mt-2 text-sm text-muted-foreground">{copy({ hi: dhi as string, en: den as string })}</p></div>; })}</div></div></section><ContactStrip /></main>; }

export function ProductsPage({ category }: { category?: string }) {
  const copy = useCopy();
  const productsQuery = useProducts();
  const categoriesQuery = useCategories();
  const all = productsQuery.data ?? [];
  const current = category ? (categoriesQuery.data ?? []).find((item) => item.slug === category) : undefined;
  const filtered = category ? all.filter((p) => p.categorySlug === category) : all;
  const title = current ? copy(current.name) : category ? category : copy({ hi: "सभी उत्पाद", en: "All products" });
  return <main><PageIntro title={title} description={current ? copy(current.description) : copy({ hi: "श्रीकान्त सीड्स की दुकान सूची से बीज और कीटनाशक।", en: "Seeds and pesticides from the Shreekant Seeds catalog." })} /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><CatalogSection items={filtered} isLoading={productsQuery.isLoading || categoriesQuery.isLoading} isError={productsQuery.isError} refetch={() => productsQuery.refetch()} empty={{ title: copy({ hi: "अभी कोई उत्पाद नहीं", en: "No products yet" }), description: copy({ hi: "इस सूची में अभी कोई उत्पाद नहीं है। दुकान से संपर्क करें या बाद में देखें।", en: "There are no products in this list yet. Contact the shop or check back later." }) }} /></div></main>;
}
export function CategoriesPage() {
  const copy = useCopy();
  const { data: categories = [], isLoading, isError, refetch } = useCategories();
  return <main><PageIntro title={copy({ hi: "उत्पाद श्रेणियाँ", en: "Product categories" })} description={copy({ hi: "श्रीकान्त सीड्स अभी केवल बीज और कीटनाशक बेचता है।", en: "Shreekant Seeds currently sells only seeds and pesticides." })} /><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{isLoading ? <LoadingGrid count={2} /> : isError ? <ErrorState onRetry={() => refetch()} /> : categories.length ? <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">{categories.map((c) => <CategoryCard key={c.id} category={c} />)}</div> : <EmptyState title={copy({ hi: "अभी कोई श्रेणी नहीं", en: "No categories yet" })} description={copy({ hi: "दुकान द्वारा श्रेणियाँ जोड़ते ही वे यहाँ दिखेंगी।", en: "Categories will appear here as soon as the shop adds them." })} />}</div></main>;
}
export function ProductDetailPage({ id }: { id: string }) {
  const copy = useCopy();
  const { data: product, isLoading, isError, refetch } = useProduct(id);
  const { data: allProducts = [] } = useProducts();
  const { data: similarIds = [] } = useSimilarProductIds(product?.id);
  if (isLoading) return <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><LoadingGrid count={2} /></main>;
  if (isError) return <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><ErrorState onRetry={() => refetch()} /></main>;
  if (!product) return <main className="mx-auto max-w-7xl px-4 py-16"><EmptyState title={copy({ hi: "उत्पाद नहीं मिला", en: "Product not found" })} description={copy({ hi: "यह उत्पाद अभी उपलब्ध नहीं है।", en: "This product is not available." })} /></main>;
  const related = productsByIds(allProducts, similarIds).filter((p) => p.id !== product.id).slice(0, 4);
  return <main><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground sm:mb-6"><Link to="/products">{copy({ hi: "उत्पाद", en: "Products" })}</Link><ChevronRight className="size-4" /><span>{copy(product.name)}</span></nav><div className="grid gap-8 lg:grid-cols-2"><div><ImageFrame src={product.imageUrl} alt={copy(product.name)} ratio="aspect-[4/3] sm:aspect-square" className="rounded-lg" />{product.images.length > 1 && <div className="mt-3 grid grid-cols-3 gap-3">{product.images.slice(1, 4).map((url) => <div key={url} className="overflow-hidden rounded-md ring-1 ring-border"><ImageFrame src={url} alt={copy(product.name)} ratio="aspect-square" /></div>)}</div>}</div><section><p className="text-sm font-semibold text-sage">{product.categoryName ? copy(product.categoryName) : ""}{product.brand ? ` · ${product.brand}` : ""}</p><h1 className="mt-2 break-words font-display text-4xl font-semibold sm:text-5xl">{copy(product.name)}</h1><div className="mt-5 flex items-baseline gap-3"><span className="font-display text-3xl font-semibold">{money(product.price)}</span>{product.mrp && product.mrp > product.price && <span className="text-muted-foreground line-through">{money(product.mrp)}</span>}</div>{product.offer && <OfferNote offer={product.offer} className="mt-2" />}<p className="mt-2 text-sm font-semibold">{copy(product.pack)}</p><div className="mt-6"><DetailActions product={product} /></div>{copy(product.description) && <div className="mt-6 border-y border-border py-5"><h2 className="font-display text-2xl font-semibold">{copy({ hi: "उत्पाद जानकारी", en: "Product information" })}</h2><p className="mt-2 text-muted-foreground">{copy(product.description)}</p></div>}<div className="mt-6 rounded-lg bg-surface p-4 text-sm"><p className="font-semibold">{copy({ hi: "स्थानीय डिलीवरी", en: "Local delivery" })}</p><p className="mt-1 text-muted-foreground">{copy({ hi: "डिलीवरी शुल्क ऑर्डर के समय तय होगा। केवल ऑनलाइन भुगतान उपलब्ध होगा।", en: "Delivery charge will be confirmed with the order. Online payment only will be available." })}</p></div></section></div>{related.length > 0 && <section className="mt-14"><h2 className="font-display text-2xl font-semibold sm:text-3xl">{copy({ hi: "संबंधित उत्पाद", en: "Related products" })}</h2><div className="mt-5"><ProductGrid items={related} /></div></section>}</div></main>;
}
export function SearchPage({ query }: { query: string }) {
  const copy = useCopy();
  const [value, setValue] = useState(query);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const navigate = useNavigate();
  const normalized = query.trim().toLowerCase();
  const productsQuery = useProducts();
  const categoriesQuery = useCategories();
  const all = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const searchQuery = useProductSearch(query);
  const results = useMemo(() => productsByIds(all, searchQuery.data ?? []), [all, searchQuery.data]);
  return <main><PageIntro title={copy({ hi: "उत्पाद खोजें", en: "Search products" })} description={copy({ hi: "नाम, श्रेणी या पैक से बीज और कीटनाशक खोजें।", en: "Find seeds and pesticides by name, category or pack." })} /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="relative max-w-2xl"><form role="search" onSubmit={(e) => { e.preventDefault(); setSuggestOpen(false); navigate({ to: "/search", search: { q: value.trim() } }); }} className="grid max-w-2xl grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden rounded-full bg-card ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"><Search aria-hidden="true" className="ml-4 size-5 text-muted-foreground" /><input aria-label={copy({ hi: "बीज या कीटनाशक खोजें", en: "Search seeds or pesticides" })} placeholder={copy({ hi: "बीज या कीटनाशक खोजें…", en: "Search seeds or pesticides…" })} value={value} onChange={(e) => { setValue(e.target.value); setSuggestOpen(true); }} onFocus={() => setSuggestOpen(true)} onBlur={() => setSuggestOpen(false)} className="h-14 min-w-0 bg-transparent px-3 outline-none" /><Button className="h-14 rounded-full px-5 sm:px-7">{copy({ hi: "खोजें", en: "Search" })}</Button></form><SearchSuggestions query={value} open={suggestOpen && value.trim() !== query.trim()} onPick={() => setSuggestOpen(false)} /></div><p className="my-6 text-sm text-muted-foreground">{normalized ? copy({ hi: `“${query}” के लिए ${results.length} परिणाम`, en: `${results.length} results for “${query}”` }) : copy({ hi: "खोजने के लिए उत्पाद या श्रेणी का नाम लिखें।", en: "Enter a product or category name to search." })}</p>{productsQuery.isLoading || searchQuery.isLoading ? <LoadingGrid /> : productsQuery.isError || searchQuery.isError ? <ErrorState onRetry={() => { productsQuery.refetch(); searchQuery.refetch(); }} /> : normalized && results.length ? <ProductGrid items={results} /> : normalized ? <><EmptyState title={copy({ hi: "कोई उत्पाद नहीं मिला", en: "No products found" })} description={copy({ hi: "दूसरा नाम लिखें या सभी उत्पाद देखें।", en: "Try another name or browse all products." })} /><Button asChild className="mx-auto mt-5 flex w-fit rounded-full"><Link to="/products">{copy({ hi: "सभी उत्पाद देखें", en: "Browse all products" })}</Link></Button>{categories.length > 0 && <div className="mt-8 grid gap-4 sm:grid-cols-2">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>}</> : <div className="grid gap-4 sm:grid-cols-2">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>}</div></main>;
}
export function CartPage() { const copy = useCopy(); return <main><PageIntro title={copy({ hi: "आपकी कार्ट", en: "Your cart" })} description={copy({ hi: "मात्रा और कीमत जाँचें, फिर चेकआउट पर जाएँ। साइन इन करने पर आपकी कार्ट सुरक्षित रहती है।", en: "Review quantities and prices, then continue to checkout. Sign in and your cart stays saved." })} /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><CartContent /></div></main>; }
export { CheckoutPage } from "./checkout";
export { AccountPage, AddressesPage } from "./account";
function OrderStatus({ status }: { status: string }) {
  const copy = useCopy();
  const label = ORDER_STATUS_LABELS[status];
  return <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-strong">{label ? copy(label) : status}</span>;
}

/** Phase 8 — customer-facing progress steps. Display only; no merchant detail. */
function OrderTimeline({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  const copy = useCopy();
  if (status === "cancelled")
    return <p className="mt-4 text-sm font-medium text-destructive">{copy(ORDER_STATUS_LABELS["cancelled"] ?? { hi: "रद्द", en: "Cancelled" })}</p>;
  if (paymentStatus !== "paid")
    return <p className="mt-4 rounded-md bg-surface p-3 text-sm text-muted-foreground">{copy({ hi: "यह ऑर्डर भुगतान की प्रतीक्षा में है। भुगतान पूरा होते ही तैयारी शुरू होगी।", en: "This order is awaiting payment. Preparation starts once payment is complete." })}</p>;

  const currentIndex = CUSTOMER_TIMELINE.indexOf(status as (typeof CUSTOMER_TIMELINE)[number]);
  return <ol className="mt-4 space-y-3">{CUSTOMER_TIMELINE.map((step, index) => {
    const done = currentIndex >= index;
    return <li key={step} className="flex items-center gap-3">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span>
      <span className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>{copy(ORDER_STATUS_LABELS[step] ?? { hi: step, en: step })}</span>
    </li>;
  })}</ol>;
}

function PaymentStatus({ status }: { status: string }) {
  const copy = useCopy();
  const label = PAYMENT_STATUS_LABELS[status];
  return <span className="text-xs text-muted-foreground">{label ? copy(label) : status}</span>;
}

export function OrdersPage() {
  const copy = useCopy();
  const { language } = useStore();
  const list = useServerFn(listMyOrders);
  const ordersQuery = useQuery({ queryKey: ["customer-orders"], queryFn: () => list(), retry: false });
  const orders = ordersQuery.data ?? [];
  return <main>
    <PageIntro title={copy({ hi: "मेरे ऑर्डर", en: "My orders" })} description={copy({ hi: "आपके श्रीकान्त सीड्स ऑर्डर और उनकी स्थिति।", en: "Your Shreekant Seeds orders and their current status." })} />
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {ordersQuery.isLoading ? <LoadingGrid count={2} /> : ordersQuery.isError ? <ErrorState onRetry={() => ordersQuery.refetch()} /> : orders.length === 0 ? <EmptyState title={copy({ hi: "अभी कोई ऑर्डर नहीं", en: "No orders yet" })} description={copy({ hi: "आपका पहला ऑर्डर पूरा होते ही यहाँ दिखाई देगा।", en: "Your first order will appear here once it is placed." })} /> : <div className="space-y-3">{orders.map((order) => <Link key={order.id} to="/orders/$id" params={{ id: order.id }} className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-card p-5 ring-1 ring-border hover:bg-surface">
        <div>
          <h2 className="font-semibold">{order.orderNumber}</h2>
          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt, language)} · {order.itemCount} {copy({ hi: "उत्पाद", en: "items" })}</p>
          <PaymentStatus status={order.paymentStatus} />
        </div>
        <div className="text-right">
          <OrderStatus status={order.status} />
          <p className="mt-2 font-semibold">{money(order.totalAmount)}</p>
        </div>
      </Link>)}</div>}
    </div>
  </main>;
}
function AmountRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <p className={`flex justify-between text-sm ${strong ? "font-semibold text-base" : "text-muted-foreground"}`}><span>{label}</span><span>{value}</span></p>;
}

export function OrderDetailPage({ id }: { id: string }) {
  const copy = useCopy();
  const { language } = useStore();
  const fetchOrder = useServerFn(getMyOrder);
  const orderQuery = useQuery({ queryKey: ["customer-order", id], queryFn: () => fetchOrder({ data: { orderId: id } }), retry: false });

  if (orderQuery.isLoading) return <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><LoadingGrid count={2} /></main>;
  if (orderQuery.isError) return <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><ErrorState onRetry={() => orderQuery.refetch()} /></main>;

  const order = orderQuery.data;
  if (!order) return <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><EmptyState title={copy({ hi: "ऑर्डर नहीं मिला", en: "Order not found" })} description={copy({ hi: "यह ऑर्डर आपके खाते में उपलब्ध नहीं है।", en: "This order is not available on your account." })} /></main>;

  const addressLines = formatAddress(order.deliveryAddress);
  const gstTotal = order.cgstAmount + order.sgstAmount + order.igstAmount;

  return <main>
    <PageIntro title={order.orderNumber} description={`${formatDate(order.createdAt, language)}`} />
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-6">
        <div className="rounded-lg bg-card p-5 ring-1 ring-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">{copy({ hi: "ऑर्डर स्थिति", en: "Order status" })}</h2>
            <OrderStatus status={order.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{copy(PAYMENT_STATUS_LABELS[order.paymentStatus] ?? { hi: order.paymentStatus, en: order.paymentStatus })}</p>
          <OrderTimeline status={order.status} paymentStatus={order.paymentStatus} />
          {order.status === "out_for_delivery" && <CustomerDeliveryCard orderId={id} />}
          {order.deliveryApprovalRequired ? (
            <div className="mt-4 rounded-md bg-accent/10 p-4 text-sm ring-1 ring-accent/30">
              <p className="font-semibold">{copy({ hi: "डिलीवरी की पुष्टि आवश्यक है", en: "Delivery confirmation required" })}</p>
              <p className="mt-1 text-muted-foreground">{copy({ hi: "दुकान द्वारा डिलीवरी शुल्क पक्का करने के बाद आपका ऑर्डर आगे बढ़ेगा।", en: "The shop will confirm your delivery charge before payment." })}</p>
            </div>
          ) : order.paymentStatus === "created" && order.status !== "cancelled" ? (
            <ContinueToPaymentButton orderId={order.id} orderNumber={order.orderNumber} />
          ) : null}
          {order.customerNote && <p className="mt-3 text-sm text-muted-foreground">{copy({ hi: "आपका संदेश: ", en: "Your note: " })}{order.customerNote}</p>}
          <Button asChild variant="outline" className="mt-4 rounded-full"><Link to="/orders/$id/invoice" params={{ id }}>{copy({ hi: "चालान देखें", en: "View invoice" })}</Link></Button>
        </div>
        <div className="rounded-lg bg-card p-5 ring-1 ring-border">
          <h2 className="font-display text-2xl font-semibold">{copy({ hi: "उत्पाद", en: "Items" })}</h2>
          <ul className="mt-4 divide-y divide-border">{order.items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{language === "hi" ? item.productNameHi : item.productName}</p>
              <p className="text-xs text-muted-foreground">{[item.packSize, item.sku].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">{item.quantity} × {money(item.unitPrice)}{item.taxRate !== null ? ` · GST ${item.taxRate}%` : ""}</p>
            </div>
            <p className="font-semibold">{money(item.totalPrice)}</p>
          </li>)}</ul>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-lg bg-card p-5 ring-1 ring-border">
          <h2 className="font-display text-xl font-semibold">{copy({ hi: "डिलीवरी", en: "Delivery" })}</h2>
          <p className="mt-2 text-sm font-medium">{order.customerName}</p>
          <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
          {addressLines.length ? <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">{addressLines.map((line) => <p key={line}>{line}</p>)}</div> : null}
          {order.deliveryDistanceKm !== null && <p className="mt-2 text-xs text-muted-foreground">{copy({ hi: "दूरी", en: "Distance" })}: {order.deliveryDistanceKm} km</p>}
        </div>
        <div className="space-y-2 rounded-lg bg-card p-5 ring-1 ring-border">
          <AmountRow label={copy({ hi: "उप-योग", en: "Subtotal" })} value={money(order.subtotal)} />
          {order.discountAmount > 0 && <AmountRow label={copy({ hi: "छूट", en: "Discount" })} value={`- ${money(order.discountAmount)}`} />}
          <AmountRow label={copy({ hi: "डिलीवरी शुल्क", en: "Delivery charge" })} value={order.deliveryCharge === 0 ? copy({ hi: "मुफ़्त", en: "FREE" }) : money(order.deliveryCharge)} />
          {gstTotal > 0 && <>
            {order.cgstAmount > 0 && <AmountRow label="CGST" value={money(order.cgstAmount)} />}
            {order.sgstAmount > 0 && <AmountRow label="SGST" value={money(order.sgstAmount)} />}
            {order.igstAmount > 0 && <AmountRow label="IGST" value={money(order.igstAmount)} />}
          </>}
          <div className="border-t border-border pt-2"><AmountRow strong label={copy({ hi: "कुल", en: "Total" })} value={money(order.totalAmount)} /></div>
        </div>
      </aside>
    </div>
  </main>;
}

function ProductTypeCard({ type }: { type: (typeof PRODUCT_TYPES)[number] }) {
  const copy = useCopy();
  const name = copy(type.name);
  return <div className="flex flex-col items-start gap-3 py-3"><h3 className="max-w-full font-display text-2xl font-semibold break-words">{type.value === "seed" ? <Sprout aria-hidden="true" className="mr-1 inline size-6 align-[-0.15em] text-success" /> : type.value === "other" ? <ShoppingBasket aria-hidden="true" className="mr-1 inline size-6 align-[-0.15em] text-accent-strong" /> : <span aria-hidden="true">{type.icon}</span>} {name}</h3><Link to="/shop/$type" params={{ type: type.value }} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"><span className="break-words">{copy({ hi: `${name} देखें`, en: `Browse ${name}` })}</span><ChevronRight aria-hidden="true" className="size-4 shrink-0" /></Link></div>;
}
export function ProductTypePage({ type }: { type: string }) {
  const copy = useCopy();
  const productsQuery = useProducts();
  const info = PRODUCT_TYPES.find((t) => t.value === type);
  const items = (productsQuery.data ?? []).filter((p) => p.productType === type);
  const cats = new Map<string, NonNullable<Product["categoryName"]>>();
  for (const p of items) if (p.categorySlug && p.categoryName) cats.set(p.categorySlug, p.categoryName);
  return <main><PageIntro title={info ? copy(info.name) : type} description={copy({ hi: "इस प्रकार की श्रेणियाँ और उत्पाद", en: "Categories and products of this type" })} /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{cats.size > 0 && <nav aria-label={copy({ hi: "श्रेणियाँ", en: "Categories" })} className="mb-6 flex flex-wrap gap-2">{[...cats].map(([slug, name]) => <Link key={slug} to="/categories/$category" params={{ category: slug }} className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-border hover:bg-secondary">{copy(name)}</Link>)}</nav>}<CatalogSection items={items} isLoading={productsQuery.isLoading} isError={productsQuery.isError} refetch={() => productsQuery.refetch()} empty={{ title: copy({ hi: "अभी कोई उत्पाद नहीं", en: "No products yet" }), description: copy({ hi: "इस प्रकार में अभी कोई उत्पाद नहीं है। दुकान से संपर्क करें या बाद में देखें।", en: "There are no products of this type yet. Contact the shop or check back later." }) }} /></div></main>;
}
