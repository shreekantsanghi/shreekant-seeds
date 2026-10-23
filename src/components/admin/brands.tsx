import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/store/core";
import { AdminHeading } from "@/components/admin/core";
import { listAdminBrands, saveBrand } from "@/lib/admin-catalog.functions";
import { useCopy } from "@/lib/store-context";

export const adminBrandsKey = ["admin-brands"] as const;

export function useAdminBrands() {
  const list = useServerFn(listAdminBrands);
  return useQuery({ queryKey: adminBrandsKey, queryFn: () => list() });
}

const inputClass = "h-12 w-full rounded-md border border-input bg-background px-3";

export function AdminBrands() {
  const copy = useCopy();
  const brands = useAdminBrands();
  const queryClient = useQueryClient();
  const save = useServerFn(saveBrand);
  const [draft, setDraft] = useState<{ id?: string; name: string; isActive: boolean } | null>(null);

  const mutation = useMutation({
    mutationFn: (d: { id?: string; name: string; isActive: boolean }) => save({ data: d }),
    onSuccess: () => {
      toast.success(copy({ hi: "ब्रांड सेव हो गया।", en: "Brand saved." }));
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: adminBrandsKey });
    },
    onError: (error) => {
      const raw = error instanceof Error ? error.message : "";
      toast.error(
        raw.includes("duplicate") || raw.includes("unique")
          ? copy({ hi: "यह ब्रांड पहले से मौजूद है।", en: "This brand already exists." })
          : copy({ hi: "सेव नहीं हो सका। दोबारा कोशिश करें।", en: "Could not save. Please try again." }),
      );
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !draft.name.trim()) return;
    mutation.mutate({ ...draft, name: draft.name.trim() });
  };

  return (
    <>
      <AdminHeading
        title={copy({ hi: "ब्रांड", en: "Brands" })}
        description={copy({ hi: "उत्पादों के लिए कंपनी/ब्रांड नाम। उत्पाद फ़ॉर्म में इन्हीं में से चुनें।", en: "Company / brand names for products. Pick from these in the product form." })}
        action={
          <Button className="rounded-full" onClick={() => setDraft({ name: "", isActive: true })}>
            <Plus className="size-4" />
            {copy({ hi: "नया ब्रांड", en: "New brand" })}
          </Button>
        }
      />
      {draft && (
        <form onSubmit={submit} className="mb-5 grid max-w-2xl gap-3 rounded-lg bg-card p-5 ring-1 ring-border">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{copy({ hi: "ब्रांड का नाम", en: "Brand name" })}</span>
            <input className={inputClass} value={draft.name} maxLength={120} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-5" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            {copy({ hi: "उत्पाद फ़ॉर्म में दिखाएँ", en: "Show in product form" })}
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="rounded-full" disabled={mutation.isPending || !draft.name.trim()}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save className="size-4" />}
              {copy({ hi: "सेव करें", en: "Save" })}
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDraft(null)}>
              <X className="size-4" />
              {copy({ hi: "रहने दें", en: "Cancel" })}
            </Button>
          </div>
        </form>
      )}
      {brands.isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-card ring-1 ring-border" />
      ) : brands.isError ? (
        <ErrorState onRetry={() => brands.refetch()} />
      ) : !brands.data?.length ? (
        <EmptyState title={copy({ hi: "अभी कोई ब्रांड नहीं", en: "No brands yet" })} description={copy({ hi: "नया ब्रांड जोड़ें।", en: "Add a new brand." })} />
      ) : (
        <ul className="divide-y divide-border rounded-lg bg-card ring-1 ring-border">
          {brands.data.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link to="/admin/products" search={{ brand: b.name }} className="break-words font-medium underline-offset-4 hover:underline">{b.name}</Link>
                <p className="text-xs text-muted-foreground">
                  {b.productCount} {copy({ hi: "उत्पाद", en: "products" })}
                  {!b.isActive && ` · ${copy({ hi: "छिपा हुआ", en: "Hidden" })}`}
                </p>
              </div>
              <Button variant="outline" size="sm" className="min-h-11 rounded-full" onClick={() => setDraft({ id: b.id, name: b.name, isActive: b.isActive })}>
                <Pencil className="size-4" />
                {copy({ hi: "बदलें", en: "Edit" })}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
