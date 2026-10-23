import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCategories, useProducts, useProductSearch } from "@/lib/catalog";
import { useCopy } from "@/lib/store-context";

/** Mirrors the database normaliser: case, punctuation, Hindi digits, "250 ml" -> "250ml". */
export function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
    .replace(/[^a-z0-9\u0900-\u097F]+/g, " ")
    .replace(/(\d) (ml|l|ltr|litre|liter|g|gm|gms|gram|grams|kg|mg)(?= |$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function useDebounced(value: string, ms = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Autocomplete dropdown; render inside a `relative` container. */
export function SearchSuggestions({ query, open, onPick }: { query: string; open: boolean; onPick: () => void }) {
  const copy = useCopy();
  const term = useDebounced(query.trim());
  const n = normalizeSearch(term);
  const enabled = open && n.length >= 2;
  const search = useProductSearch(enabled ? term : "");
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();

  const productHits = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return (search.data ?? []).slice(0, 6).flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
  }, [search.data, products]);

  const startsWord = (text: string) => ` ${normalizeSearch(text)}`.includes(` ${n}`);
  const categoryHits = enabled
    ? categories.filter((c) => products.some((p) => p.categoryId === c.id) && (startsWord(c.name.en) || startsWord(c.name.hi))).slice(0, 3)
    : [];
  const brandHits = enabled
    ? Array.from(new Map(products.filter((p) => p.brand && startsWord(p.brand)).map((p) => [p.brand!.toLowerCase(), p.brand!])).values()).slice(0, 3)
    : [];

  if (!enabled || (!productHits.length && !categoryHits.length && !brandHits.length)) return null;

  const row = "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface focus:bg-surface focus:outline-none";
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-lg bg-card py-2 text-foreground shadow-lg ring-1 ring-border">
      {productHits.map((p) => (
        <Link key={p.id} role="option" to="/products/$id" params={{ id: p.id }} onMouseDown={keep} onClick={onPick} className={row}>
          {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-9 shrink-0 rounded object-cover" /> : <span className="size-9 shrink-0 rounded bg-surface" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{copy(p.name)}</span>
            <span className="block truncate text-xs text-muted-foreground">{copy(p.pack)}{p.brand ? ` · ${p.brand}` : ""}</span>
          </span>
        </Link>
      ))}
      {(categoryHits.length > 0 || brandHits.length > 0) && productHits.length > 0 && <div className="my-1 border-t border-border" />}
      {categoryHits.map((c) => (
        <Link key={c.id} role="option" to="/categories/$category" params={{ category: c.slug }} onMouseDown={keep} onClick={onPick} className={row}>
          <span className="text-xs font-semibold text-sage">{copy({ hi: "श्रेणी", en: "Category" })}</span>
          <span className="truncate">{copy(c.name)}</span>
        </Link>
      ))}
      {brandHits.map((b) => (
        <Link key={b} role="option" to="/search" search={{ q: b }} onMouseDown={keep} onClick={onPick} className={row}>
          <span className="text-xs font-semibold text-sage">{copy({ hi: "ब्रांड", en: "Brand" })}</span>
          <span className="truncate">{b}</span>
        </Link>
      ))}
    </div>
  );
}
