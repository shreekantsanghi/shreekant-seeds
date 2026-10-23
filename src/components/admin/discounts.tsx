import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/store/core";
import { AdminHeading } from "@/components/admin/core";
import { useAdminBrands } from "@/components/admin/brands";
import { PRODUCT_TYPES, useAdminProducts } from "@/lib/catalog";
import { useAdminCategories } from "@/lib/admin-catalog";
import { listAdminDiscounts, saveDiscount, setDiscountActive, type AdminDiscount } from "@/lib/admin-discounts.functions";
import { useCopy } from "@/lib/store-context";

const key = ["admin-discounts"] as const;
const inputClass = "h-12 w-full rounded-md border border-input bg-background px-3";

type Draft = {
  id?: string;
  targetType: AdminDiscount["targetType"];
  targetId: string;
  percent: string;
  reason: string;
  reasonHi: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

/** ISO -> value for <input type="datetime-local"> in the device's local time. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyDraft(): Draft {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return { targetType: "product", targetId: "", percent: "", reason: "", reasonHi: "", startsAt: toLocalInput(start.toISOString()), endsAt: toLocalInput(end.toISOString()), isActive: true };
}

function statusOf(d: AdminDiscount): "active" | "scheduled" | "expired" | "off" {
  if (!d.isActive) return "off";
  const now = Date.now();
  if (now < new Date(d.startsAt).getTime()) return "scheduled";
  if (now >= new Date(d.endsAt).getTime()) return "expired";
  return "active";
}

const TARGET_LABELS = {
  product: { hi: "उत्पाद", en: "Product" },
  brand: { hi: "ब्रांड", en: "Brand" },
  category: { hi: "श्रेणी", en: "Category" },
  product_type: { hi: "उत्पाद प्रकार", en: "Product type" },
} as const;

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function AdminDiscounts() {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const list = useServerFn(listAdminDiscounts);
  const save = useServerFn(saveDiscount);
  const toggle = useServerFn(setDiscountActive);
  const discounts = useQuery({ queryKey: key, queryFn: () => list(), retry: false });
  const products = useAdminProducts();
  const brands = useAdminBrands();
  const categories = useAdminCategories();
  const [draft, setDraft] = useState<Draft | null>(null);

  const productOptions = useMemo(() => (products.data ?? []).filter((p) => p.isActive).map((p) => ({ id: p.id, label: copy(p.name) })), [products.data, copy]);
  const brandOptions = useMemo(() => (brands.data ?? []).map((b) => ({ id: b.id, label: b.name })), [brands.data]);
  const categoryOptions = useMemo(() => (categories.data ?? []).map((c) => ({ id: c.id, label: copy({ hi: c.nameHi, en: c.name }) })), [categories.data, copy]);
  const typeOptions = useMemo(() => PRODUCT_TYPES.map((t) => ({ id: t.value, label: copy(t.name) })), [copy]);
  const optionsFor = (t: Draft["targetType"]) => (t === "product" ? productOptions : t === "brand" ? brandOptions : t === "category" ? categoryOptions : typeOptions);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const mutation = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          id: d.id,
          targetType: d.targetType,
          targetId: d.targetId,
          percent: Number(d.percent),
          reason: d.reason.trim() || undefined,
          reasonHi: d.reasonHi.trim() || undefined,
          startsAt: new Date(d.startsAt).toISOString(),
          endsAt: new Date(d.endsAt).toISOString(),
          isActive: d.isActive,
        },
      }),
    onSuccess: () => {
      toast.success(copy({ hi: "छूट सेव हो गई।", en: "Discount saved." }));
      setDraft(null);
      refresh();
    },
    onError: () => toast.error(copy({ hi: "सेव नहीं हो सका। जानकारी जाँचें।", en: "Could not save. Please check the details." })),
  });

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => toggle({ data: v }),
    onSuccess: refresh,
    onError: () => toast.error(copy({ hi: "बदलाव नहीं हो सका।", en: "Could not update." })),
  });

  // Extra merchant safeguard: typing "discount" is required before a discount
  // is created, changed while on, or switched on. Server rules are unchanged.
  const confirmDiscount = (): boolean => {
    const typed = window.prompt(copy({
      hi: "चेतावनी: यह छूट ग्राहकों को दिखने वाली कीमतें बदल देगी।\nपुष्टि के लिए ठीक-ठीक discount लिखें:",
      en: "Warning: this discount will change the prices customers see.\nType exactly discount to confirm:",
    }));
    if (typed === null) return false;
    if (typed.trim() !== "discount") { toast.error(copy({ hi: "पुष्टि शब्द सही नहीं है। छूट लागू नहीं हुई।", en: "Confirmation text did not match. Discount not applied." })); return false; }
    return true;
  };

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!draft) return;
    const pct = Number(draft.percent);
    if (!draft.targetId) { toast.error(copy({ hi: "छूट किस पर देनी है, चुनें।", en: "Choose what the discount applies to." })); return; }
    if (!(pct > 0 && pct < 100)) { toast.error(copy({ hi: "छूट 0% से अधिक और 100% से कम रखें।", en: "Discount must be between 0% and 100%." })); return; }
    if (!draft.startsAt || !draft.endsAt || new Date(draft.endsAt) <= new Date(draft.startsAt))
      { toast.error(copy({ hi: "समाप्ति समय शुरुआत के बाद होना चाहिए।", en: "End time must be after start time." })); return; }
    if (draft.isActive && !confirmDiscount()) return;
    mutation.mutate(draft);
  };

  const statusLabel = { active: { hi: "चालू", en: "Active" }, scheduled: { hi: "आने वाली", en: "Scheduled" }, expired: { hi: "समाप्त", en: "Expired" }, off: { hi: "बंद", en: "Off" } } as const;
  const statusClass = { active: "bg-success/15 text-success", scheduled: "bg-accent/15 text-accent-foreground", expired: "bg-muted text-muted-foreground", off: "bg-muted text-muted-foreground" } as const;

  return (
    <>
      <AdminHeading
        title={copy({ hi: "छूट", en: "Discounts" })}
        description={copy({ hi: "किसी उत्पाद, ब्रांड, श्रेणी या उत्पाद प्रकार पर प्रतिशत छूट दें। कीमतें GST सहित रहती हैं; एक से ज़्यादा छूट हो तो सबसे बड़ी लागू होती है।", en: "Give a percentage off a product, brand, category or product type. Prices stay GST-inclusive; if several apply, the biggest one wins." })}
        action={<Button className="rounded-full" onClick={() => setDraft(emptyDraft())}><Plus className="size-4" />{copy({ hi: "नई छूट", en: "New discount" })}</Button>}
      />

      {draft && (
        <form onSubmit={submit} className="mt-6 grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {(["product", "brand", "category", "product_type"] as const).map((t) => (
              <Button key={t} type="button" variant={draft.targetType === t ? "default" : "outline"} className="rounded-full" onClick={() => setDraft({ ...draft, targetType: t, targetId: "" })}>
                {copy(TARGET_LABELS[t])}
              </Button>
            ))}
          </div>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
            {copy({ hi: `${TARGET_LABELS[draft.targetType].hi} चुनें`, en: `Choose ${TARGET_LABELS[draft.targetType].en.toLowerCase()}` })}
            <select className={inputClass} value={draft.targetId} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}>
              <option value="">—</option>
              {optionsFor(draft.targetType).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy({ hi: "छूट (%)", en: "Discount (%)" })}
            <input className={inputClass} type="number" inputMode="decimal" min="0.01" max="99.99" step="0.01" value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            {copy({ hi: "चालू", en: "Active" })}
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy({ hi: "कारण (हिंदी, वैकल्पिक)", en: "Reason (Hindi, optional)" })}
            <input className={inputClass} maxLength={120} value={draft.reasonHi} onChange={(e) => setDraft({ ...draft, reasonHi: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy({ hi: "कारण (English, वैकल्पिक)", en: "Reason (English, optional)" })}
            <input className={inputClass} maxLength={120} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy({ hi: "शुरू", en: "Starts" })}
            <input className={inputClass} type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy({ hi: "समाप्त", en: "Ends" })}
            <input className={inputClass} type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" className="rounded-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{copy({ hi: "सेव करें", en: "Save" })}</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDraft(null)}><X className="size-4" />{copy({ hi: "रद्द करें", en: "Cancel" })}</Button>
          </div>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {discounts.isLoading ? (
          <div className="grid place-items-center py-10"><Loader2 className="size-6 animate-spin" /></div>
        ) : discounts.isError ? (
          <ErrorState onRetry={() => void discounts.refetch()} />
        ) : (discounts.data ?? []).length === 0 ? (
          <EmptyState title={copy({ hi: "अभी कोई छूट नहीं", en: "No discounts yet" })} description={copy({ hi: "“नई छूट” दबाकर किसी उत्पाद या ब्रांड पर छूट जोड़ें।", en: "Tap “New discount” to add one for a product or brand." })} />
        ) : (
          (discounts.data ?? []).map((d) => {
            const st = statusOf(d);
            return (
              <article key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">{copy(TARGET_LABELS[d.targetType])}</p>
                  <p className="font-semibold">{d.targetType === "product_type" ? copy(PRODUCT_TYPES.find((t) => t.value === d.productType)?.name ?? { hi: d.targetName, en: d.targetName }) : copy({ hi: d.targetNameHi || d.targetName, en: d.targetName })} · <span className="text-success">{d.percent}% {copy({ hi: "छूट", en: "off" })}</span></p>
                  {(d.reason || d.reasonHi) && <p className="text-sm text-muted-foreground">{copy({ hi: d.reasonHi || d.reason || "", en: d.reason || d.reasonHi || "" })}</p>}
                  <p className="text-xs text-muted-foreground">{fmt(d.startsAt)} → {fmt(d.endsAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[st]}`}>{copy(statusLabel[st])}</span>
                  <Button size="sm" variant="outline" className="rounded-full" disabled={toggleMutation.isPending} onClick={() => { if (!d.isActive && !confirmDiscount()) return; toggleMutation.mutate({ id: d.id, isActive: !d.isActive }); }}>
                    {d.isActive ? copy({ hi: "बंद करें", en: "Turn off" }) : copy({ hi: "चालू करें", en: "Turn on" })}
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-full" aria-label={copy({ hi: "बदलें", en: "Edit" })} onClick={() => setDraft({ id: d.id, targetType: d.targetType, targetId: (d.targetType === "product" ? d.productId : d.targetType === "brand" ? d.brandId : d.targetType === "category" ? d.categoryId : d.productType) ?? "", percent: String(d.percent), reason: d.reason ?? "", reasonHi: d.reasonHi ?? "", startsAt: toLocalInput(d.startsAt), endsAt: toLocalInput(d.endsAt), isActive: d.isActive })}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
