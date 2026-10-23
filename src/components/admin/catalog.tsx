import { Link, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Loader2, PackagePlus, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, ErrorState, ImageFrame, money } from "@/components/store/core";
import { AdminHeading } from "@/components/admin/core";
import { useAdminBrands } from "@/components/admin/brands";
import {
  slugify,
  uploadProductImage,
  useAddProductImage,
  useAdminCategories,
  useAdminInventory,
  useAdminProduct,
  useDeleteCategory,
  useDeleteProduct,
  useDeleteProductImage,
  useSaveCategory,
  useSaveInventory,
  useSaveProduct,
  useSetProductActive,
} from "@/lib/admin-catalog";
import type { AdminCategory } from "@/lib/admin-catalog.functions";

const PRODUCT_TYPE_LABELS: Record<string, { hi: string; en: string }> = {
  seed: { hi: "बीज", en: "Seed" },
  pesticide: { hi: "कीटनाशक", en: "Pesticide" },
  fertilizer: { hi: "उर्वरक", en: "Fertilizer" },
  other: { hi: "अन्य", en: "Other" },
};
import { useAdminProducts as useAdminProductRows } from "@/lib/catalog";
import { useCopy } from "@/lib/store-context";
import { cn } from "@/lib/utils";

type Copy = ReturnType<typeof useCopy>;

const inputClass = "h-12 w-full rounded-md border border-input bg-background px-3";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function errorMessage(copy: Copy, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("CATEGORY_IN_USE"))
    return copy({ hi: "इस श्रेणी में उत्पाद हैं, इसलिए इसे हटाया नहीं जा सकता।", en: "This category still has products, so it cannot be deleted." });
  if (raw.includes("PRODUCT_IN_USE"))
    return copy({ hi: "यह उत्पाद किसी ऑर्डर में है, इसलिए हटाया नहीं जा सकता। इसे बंद करें।", en: "This product is used in an order, so it cannot be deleted. Deactivate it instead." });
  if (raw.includes("duplicate key") || raw.includes("unique"))
    return copy({ hi: "यह पहचान-नाम (slug) पहले से मौजूद है। दूसरा चुनें।", en: "This slug already exists. Please choose another." });
  if (raw.includes("Forbidden") || raw.includes("Unauthorized") || raw.includes("row-level security"))
    return copy({ hi: "आपके पास यह बदलाव करने की अनुमति नहीं है।", en: "You are not allowed to make this change." });
  return copy({ hi: "सेव नहीं हो सका। दोबारा कोशिश करें।", en: "Could not save. Please try again." });
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const copy = useCopy();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy({ hi: "रहने दें", en: "Cancel" })}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ categories */

type CategoryDraft = {
  id?: string;
  nameHi: string;
  name: string;
  slug: string;
  descriptionHi: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

const emptyCategory: CategoryDraft = { nameHi: "", name: "", slug: "", descriptionHi: "", description: "", imageUrl: "", sortOrder: 0, isActive: true };

const upperLatin = (v: string) => v.replace(/[a-z]/g, (c) => c.toUpperCase());
const lowerLatin = (v: string) => v.replace(/[A-Z]/g, (c) => c.toLowerCase());
/** Case-only transform (same length), then restore the caret so typing mid-text isn't disrupted. */
function normalizeInput(e: React.ChangeEvent<HTMLInputElement>, transform: (v: string) => string): string {
  const input = e.target;
  const { selectionStart, selectionEnd } = input;
  const next = transform(input.value);
  if (next !== input.value && selectionStart !== null) {
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(selectionStart, selectionEnd);
    });
  }
  return next;
}

export function AdminCategories() {
  const copy = useCopy();
  const { data: rows = [], isLoading, isError, refetch } = useAdminCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const startEdit = (row: AdminCategory) =>
    setDraft({
      id: row.id,
      nameHi: row.nameHi,
      name: row.name,
      slug: row.slug,
      descriptionHi: row.descriptionHi ?? "",
      description: row.description ?? "",
      imageUrl: row.imageUrl ?? "",
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.nameHi.trim() || !draft.name.trim()) {
      toast.error(copy({ hi: "हिन्दी और English दोनों नाम भरें।", en: "Please fill both the Hindi and English name." }));
      return;
    }
    const slug = slugify(draft.slug || draft.name);
    if (!slug) {
      toast.error(copy({ hi: "पहचान-नाम (slug) सही नहीं है।", en: "The slug is not valid." }));
      return;
    }
    save.mutate(
      {
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name.trim(),
          nameHi: draft.nameHi.trim(),
          slug,
          description: draft.description.trim() || null,
          descriptionHi: draft.descriptionHi.trim() || null,
          imageUrl: draft.imageUrl.trim() || null,
          sortOrder: draft.sortOrder,
          isActive: draft.isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success(copy({ hi: "श्रेणी सेव हो गई।", en: "Category saved." }));
          setDraft(null);
        },
        onError: (error) => toast.error(errorMessage(copy, error)),
      },
    );
  };

  return (
    <>
      <AdminHeading
        title={copy({ hi: "श्रेणियाँ", en: "Categories" })}
        description={copy({ hi: "बीज और कीटनाशक की श्रेणियाँ जोड़ें और बदलें।", en: "Add and manage the seed and pesticide categories." })}
        action={
          <Button onClick={() => setDraft({ ...emptyCategory })}>
            <PackagePlus />
            {copy({ hi: "नई श्रेणी", en: "New category" })}
          </Button>
        }
      />
      {draft && (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-lg bg-card p-5 ring-1 ring-border sm:grid-cols-2">
          <Field label={copy({ hi: "हिन्दी नाम", en: "Hindi name" })}>
            <input className={inputClass} value={draft.nameHi} onChange={(e) => setDraft({ ...draft, nameHi: e.target.value })} required />
          </Field>
          <Field label={copy({ hi: "English नाम", en: "English name" })}>
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slug || slugify(e.target.value) })}
              required
            />
          </Field>
          <Field label={copy({ hi: "पहचान-नाम (slug)", en: "Slug" })} hint={copy({ hi: "वेब पते में दिखने वाला नाम", en: "Used in the web address" })}>
            <input className={inputClass} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          </Field>
          <Field label={copy({ hi: "क्रम संख्या", en: "Sort order" })}>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label={copy({ hi: "हिन्दी विवरण", en: "Hindi description" })}>
            <textarea className="min-h-24 w-full rounded-md border border-input bg-background p-3" value={draft.descriptionHi} onChange={(e) => setDraft({ ...draft, descriptionHi: e.target.value })} />
          </Field>
          <Field label={copy({ hi: "English विवरण", en: "English description" })}>
            <textarea className="min-h-24 w-full rounded-md border border-input bg-background p-3" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <Field label={copy({ hi: "श्रेणी चित्र का लिंक", en: "Category image link" })}>
            <input className={inputClass} value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} placeholder="https://" />
          </Field>
          <label className="flex items-center gap-3 self-end pb-3 text-sm font-medium">
            <input type="checkbox" className="size-5" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            {copy({ hi: "ग्राहकों को दिखाएँ", en: "Show to customers" })}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {copy({ hi: "सेव करें", en: "Save" })}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              {copy({ hi: "रहने दें", en: "Cancel" })}
            </Button>
          </div>
        </form>
      )}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-card ring-1 ring-border" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={copy({ hi: "अभी कोई श्रेणी नहीं", en: "No categories yet" })}
          description={copy({ hi: "ऊपर “नई श्रेणी” से पहली श्रेणी जोड़ें।", en: "Use “New category” above to add the first one." })}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-border">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-4">{copy({ hi: "श्रेणी", en: "Category" })}</th>
                <th className="p-4">slug</th>
                <th className="p-4">{copy({ hi: "उत्पाद", en: "Products" })}</th>
                <th className="p-4">{copy({ hi: "स्थिति", en: "Status" })}</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-4 font-semibold">
                    {copy({ hi: row.nameHi, en: row.name })}
                  </td>
                  <td className="p-4 text-muted-foreground">{row.slug}</td>
                  <td className="p-4">{row.productCount}</td>
                  <td className="p-4">{row.isActive ? copy({ hi: "सक्रिय", en: "Active" }) : copy({ hi: "बंद", en: "Inactive" })}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                        {copy({ hi: "बदलें", en: "Edit" })}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={save.isPending}
                        onClick={() =>
                          save.mutate(
                            {
                              data: {
                                id: row.id,
                                name: row.name,
                                nameHi: row.nameHi,
                                slug: row.slug,
                                description: row.description,
                                descriptionHi: row.descriptionHi,
                                imageUrl: row.imageUrl,
                                sortOrder: row.sortOrder,
                                isActive: !row.isActive,
                              },
                            },
                            {
                              onSuccess: () => toast.success(copy({ hi: "स्थिति बदल दी गई।", en: "Status updated." })),
                              onError: (error) => toast.error(errorMessage(copy, error)),
                            },
                          )
                        }
                      >
                        {row.isActive ? copy({ hi: "बंद करें", en: "Deactivate" }) : copy({ hi: "चालू करें", en: "Activate" })}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmId(row.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title={copy({ hi: "श्रेणी हटाएँ?", en: "Delete category?" })}
        description={copy({ hi: "यह वापस नहीं किया जा सकता। जिस श्रेणी में उत्पाद हैं वह नहीं हटेगी।", en: "This cannot be undone. A category that still has products will not be deleted." })}
        confirmLabel={copy({ hi: "हटाएँ", en: "Delete" })}
        onConfirm={() => {
          const id = confirmId;
          setConfirmId(null);
          if (!id) return;
          remove.mutate(
            { data: { id } },
            {
              onSuccess: () => toast.success(copy({ hi: "श्रेणी हटा दी गई।", en: "Category deleted." })),
              onError: (error) => toast.error(errorMessage(copy, error)),
            },
          );
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------- products */

export function AdminProducts({ brand }: { brand?: string | undefined } = {}) {
  const brandKey = (brand ?? "").trim().toLowerCase();
  const copy = useCopy();
  const { data: rows = [], isLoading, isError, refetch } = useAdminInventory();
  const products = useAdminProductRows();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "seed" | "pesticide" | "fertilizer" | "other">("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const setActive = useSetProductActive();
  const remove = useDeleteProduct();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  void rows;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => {
      if (brandKey && (p.brand ?? "").trim().toLowerCase() !== brandKey) return false;
      if (type !== "all" && p.productType !== type) return false;
      if (status === "active" && !p.isActive) return false;
      if (status === "inactive" && p.isActive) return false;
      if (!term) return true;
      return `${p.name.hi} ${p.name.en} ${p.sku ?? ""} ${p.category ? `${p.category.hi} ${p.category.en}` : ""}`.toLowerCase().includes(term);
    });
  }, [products.data, search, type, status, brandKey]);

  return (
    <>
      <AdminHeading
        title={copy({ hi: "उत्पाद", en: "Products" })}
        description={copy({ hi: "दुकान की असली उत्पाद सूची जोड़ें और बदलें।", en: "Add and manage the shop's real product list." })}
        action={
          <Button asChild>
            <Link to="/admin/products/new">
              <PackagePlus />
              {copy({ hi: "नया उत्पाद", en: "New product" })}
            </Link>
          </Button>
        }
      />
      {brandKey ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span>{copy({ hi: "ब्रांड:", en: "Brand:" })} <strong className="break-words">{brand}</strong></span>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/admin/products">{copy({ hi: "फ़िल्टर हटाएँ", en: "Clear filter" })}</Link>
          </Button>
        </div>
      ) : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={copy({ hi: "नाम या SKU से खोजें…", en: "Search by name or SKU…" })}
          aria-label={copy({ hi: "उत्पाद खोजें", en: "Search products" })}
        />
        <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label={copy({ hi: "प्रकार", en: "Type" })}>
          <option value="all">{copy({ hi: "सभी प्रकार", en: "All types" })}</option>
          <option value="seed">{copy({ hi: "बीज", en: "Seeds" })}</option>
          <option value="pesticide">{copy({ hi: "कीटनाशक", en: "Pesticides" })}</option>
          <option value="fertilizer">{copy({ hi: "उर्वरक", en: "Fertilizers" })}</option>
          <option value="other">{copy({ hi: "अन्य", en: "Other" })}</option>
        </select>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={copy({ hi: "स्थिति", en: "Status" })}>
          <option value="all">{copy({ hi: "सभी स्थिति", en: "All statuses" })}</option>
          <option value="active">{copy({ hi: "सक्रिय", en: "Active" })}</option>
          <option value="inactive">{copy({ hi: "बंद", en: "Inactive" })}</option>
        </select>
      </div>
      {products.isLoading || isLoading ? (
        <div className="h-56 animate-pulse rounded-lg bg-card ring-1 ring-border" />
      ) : products.isError || isError ? (
        <ErrorState
          onRetry={() => {
            void products.refetch();
            void refetch();
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={copy({ hi: "कोई उत्पाद नहीं मिला", en: "No products found" })}
          description={copy({ hi: "“नया उत्पाद” से पहला उत्पाद जोड़ें या खोज बदलें।", en: "Add your first product with “New product”, or change the search." })}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-border">
          <table className="w-full min-w-200 text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-4">{copy({ hi: "उत्पाद", en: "Product" })}</th>
                <th className="p-4">{copy({ hi: "श्रेणी", en: "Category" })}</th>
                <th className="p-4">{copy({ hi: "प्रकार", en: "Type" })}</th>
                <th className="p-4">{copy({ hi: "कीमत", en: "Price" })}</th>
                <th className="p-4">{copy({ hi: "स्थिति", en: "Status" })}</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="p-4 font-semibold">
                    {copy(p.name)}
                    {p.sku && <span className="block text-xs font-normal text-muted-foreground">SKU: {p.sku}</span>}
                  </td>
                  <td className="p-4">{p.category ? copy(p.category) : "—"}</td>
                  <td className="p-4">{(() => { const label = PRODUCT_TYPE_LABELS[p.productType]; return label ? copy(label) : p.productType; })()}</td>
                  <td className="p-4">{money(p.price)}</td>
                  <td className="p-4">{p.isActive ? copy({ hi: "सक्रिय", en: "Active" }) : copy({ hi: "बंद", en: "Inactive" })}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/admin/products/$id" params={{ id: p.id }}>{copy({ hi: "बदलें", en: "Edit" })}</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setActive.isPending}
                        onClick={() =>
                          setActive.mutate(
                            { data: { id: p.id, isActive: !p.isActive } },
                            {
                              onSuccess: () => toast.success(copy({ hi: "स्थिति बदल दी गई।", en: "Status updated." })),
                              onError: (error) => toast.error(errorMessage(copy, error)),
                            },
                          )
                        }
                      >
                        {p.isActive ? copy({ hi: "बंद करें", en: "Deactivate" }) : copy({ hi: "चालू करें", en: "Activate" })}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmId(p.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title={copy({ hi: "उत्पाद हटाएँ?", en: "Delete product?" })}
        description={copy({ hi: "यह वापस नहीं किया जा सकता। किसी ऑर्डर में इस्तेमाल हुआ उत्पाद नहीं हटेगा — उसे बंद करें।", en: "This cannot be undone. A product used in an order will not be deleted — deactivate it instead." })}
        confirmLabel={copy({ hi: "हटाएँ", en: "Delete" })}
        onConfirm={() => {
          const id = confirmId;
          setConfirmId(null);
          if (!id) return;
          remove.mutate(
            { data: { id } },
            {
              onSuccess: () => toast.success(copy({ hi: "उत्पाद हटा दिया गया।", en: "Product deleted." })),
              onError: (error) => toast.error(errorMessage(copy, error)),
            },
          );
        }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- product form */

type ProductDraft = {
  nameHi: string;
  name: string;
  slug: string;
  productType: "seed" | "pesticide" | "fertilizer" | "other";
  categoryId: string;
  brand: string;
  sku: string;
  hsnCode: string;
  descriptionHi: string;
  description: string;
  unit: string;
  packSize: string;
  price: string;
  mrp: string;
  primaryImageUrl: string;
  isActive: boolean;
  isFeatured: boolean;
};

const emptyProduct: ProductDraft = {
  nameHi: "",
  name: "",
  slug: "",
  productType: "seed",
  categoryId: "",
  brand: "",
  sku: "",
  hsnCode: "",
  descriptionHi: "",
  description: "",
  unit: "",
  packSize: "",
  price: "",
  mrp: "",
  primaryImageUrl: "",
  isActive: true,
  isFeatured: false,
};

const UNIT_OPTIONS = ["milliliter", "litre", "milligram", "gram", "kilogram", "piece"];

export function AdminProductForm({ id }: { id?: string }) {
  const copy = useCopy();
  const navigate = useNavigate();
  const product = useAdminProduct(id);
  const categories = useAdminCategories();
  const brands = useAdminBrands();
  const save = useSaveProduct();
  const [draft, setDraft] = useState<ProductDraft>(emptyProduct);
  const loadedIdRef = useRef<string | null>(null);

  // Load saved values once per product; later refetches (e.g. after an image
  // upload) must not overwrite what the merchant is currently typing.
  useEffect(() => {
    const row = product.data;
    if (!row || loadedIdRef.current === row.id) return;
    loadedIdRef.current = row.id;
    setDraft({
      nameHi: row.nameHi,
      name: row.name,
      slug: row.slug,
      productType: row.productType,
      categoryId: row.categoryId ?? "",
      brand: row.brand ?? "",
      sku: row.sku ?? "",
      hsnCode: row.hsnCode ?? "",
      descriptionHi: row.descriptionHi ?? "",
      description: row.description ?? "",
      unit: row.unit,
      packSize: row.packSize ?? "",
      price: String(row.price),
      mrp: row.mrp === null ? "" : String(row.mrp),
      primaryImageUrl: row.primaryImageUrl ?? "",
      isActive: row.isActive,
      isFeatured: row.isFeatured,
    });
  }, [product.data]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const price = Number(draft.price);
    if (!draft.nameHi.trim() || !draft.name.trim()) {
      toast.error(copy({ hi: "हिन्दी और English दोनों नाम भरें।", en: "Please fill both the Hindi and English name." }));
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error(copy({ hi: "कीमत सही भरें।", en: "Please enter a valid price." }));
      return;
    }
    if (!draft.unit) {
      toast.error(copy({ hi: "इकाई चुनें।", en: "Please select a unit." }));
      return;
    }
    const mrp = draft.mrp.trim() === "" ? null : Number(draft.mrp);
    if (mrp !== null && (!Number.isFinite(mrp) || mrp < 0)) {
      toast.error(copy({ hi: "MRP सही भरें।", en: "Please enter a valid MRP." }));
      return;
    }
    const slug = slugify(draft.slug || draft.name);
    save.mutate(
      {
        data: {
          ...(id ? { id } : {}),
          name: draft.name.trim(),
          nameHi: draft.nameHi.trim(),
          slug,
          productType: draft.productType,
          categoryId: draft.categoryId || null,
          brand: draft.brand.trim() || null,
          sku: draft.sku.trim() || null,
          hsnCode: draft.hsnCode.trim() || null,
          description: draft.description.trim() || null,
          descriptionHi: draft.descriptionHi.trim() || null,
          unit: draft.unit,
          packSize: draft.packSize.trim() || null,
          price,
          mrp,
          primaryImageUrl: draft.primaryImageUrl.trim() || null,
          isActive: draft.isActive,
          isFeatured: draft.isFeatured,
        },
      },
      {
        onSuccess: (result) => {
          toast.success(copy({ hi: "उत्पाद सेव हो गया।", en: "Product saved." }));
          if (!id) void navigate({ to: "/admin/products/$id", params: { id: result.id } });
        },
        onError: (error) => toast.error(errorMessage(copy, error)),
      },
    );
  };

  if (id && product.isLoading) return <div className="h-96 animate-pulse rounded-lg bg-card ring-1 ring-border" />;
  if (id && product.isError) return <ErrorState onRetry={() => product.refetch()} />;

  return (
    <>
      <AdminHeading
        title={id ? copy({ hi: "उत्पाद बदलें", en: "Edit product" }) : copy({ hi: "नया उत्पाद", en: "New product" })}
        description={copy({ hi: "केवल वही जानकारी भरें जो दुकान की असली जानकारी है।", en: "Enter only factual information about the shop's own product." })}
      />
      <form onSubmit={submit} className="grid max-w-4xl gap-4 rounded-lg bg-card p-5 ring-1 ring-border sm:grid-cols-2">
        <Field label={copy({ hi: "हिन्दी नाम", en: "Hindi name" })}>
          <input className={inputClass} value={draft.nameHi} onChange={(e) => setDraft({ ...draft, nameHi: normalizeInput(e, upperLatin) })} required />
        </Field>
        <Field label={copy({ hi: "English नाम", en: "English name" })}>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => {
              const name = normalizeInput(e, upperLatin);
              setDraft({ ...draft, name, slug: draft.slug || slugify(name) });
            }}
            required
          />
        </Field>
        <Field label={copy({ hi: "पहचान-नाम (slug)", en: "Slug" })}>
          <input className={inputClass} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: normalizeInput(e, lowerLatin) })} />
        </Field>
        <Field label={copy({ hi: "प्रकार", en: "Type" })}>
          <select className={inputClass} value={draft.productType} onChange={(e) => setDraft({ ...draft, productType: e.target.value as ProductDraft["productType"] })}>
            <option value="seed">{copy({ hi: "बीज", en: "Seed" })}</option>
            <option value="pesticide">{copy({ hi: "कीटनाशक", en: "Pesticide" })}</option>
            <option value="fertilizer">{copy({ hi: "उर्वरक", en: "Fertilizer" })}</option>
            <option value="other">{copy({ hi: "अन्य", en: "Other" })}</option>
          </select>
        </Field>
        <Field label={copy({ hi: "श्रेणी", en: "Category" })}>
          <select className={inputClass} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
            <option value="">{copy({ hi: "कोई नहीं", en: "None" })}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {copy({ hi: c.nameHi, en: c.name })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy({ hi: "ब्रांड", en: "Brand" })}>
          {(() => {
            const list = (brands.data ?? []).filter((b) => b.isActive || b.name.trim().toLowerCase() === draft.brand.trim().toLowerCase());
            const match = list.find((b) => b.name.trim().toLowerCase() === draft.brand.trim().toLowerCase());
            // Keep the saved text exactly as-is (even if its letter case differs) until the merchant picks another brand.
            const value = draft.brand && match && match.name !== draft.brand ? draft.brand : draft.brand;
            return (
              <select className={inputClass} value={value} onChange={(e) => setDraft({ ...draft, brand: e.target.value })}>
                <option value="">{copy({ hi: "कोई ब्रांड नहीं", en: "No brand" })}</option>
                {draft.brand && (!match || match.name !== draft.brand) ? <option value={draft.brand}>{draft.brand}</option> : null}
                {list.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            );
          })()}
        </Field>
        <Field label="SKU">
          <input className={inputClass} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
        </Field>
        <Field label={copy({ hi: "HSN कोड", en: "HSN code" })} hint={copy({ hi: "वैकल्पिक — भविष्य के चालान के लिए", en: "Optional — for future invoices" })}>
          <input className={inputClass} value={draft.hsnCode} onChange={(e) => setDraft({ ...draft, hsnCode: e.target.value })} />
        </Field>
        <Field label={copy({ hi: "इकाई", en: "Unit" })}>
          <select className={inputClass} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} required>
            <option value="" disabled>{copy({ hi: "इकाई चुनें", en: "Select unit" })}</option>
            {draft.unit && !UNIT_OPTIONS.includes(draft.unit) ? <option value={draft.unit}>{draft.unit}</option> : null}
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </Field>
        <Field label={copy({ hi: "पैक साइज़", en: "Pack size" })}>
          <input className={inputClass} value={draft.packSize} onChange={(e) => setDraft({ ...draft, packSize: e.target.value })} />
        </Field>
        <Field label={copy({ hi: "कीमत (₹)", en: "Price (₹)" })}>
          <input type="number" min={0} step="0.01" className={inputClass} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} required />
        </Field>
        <Field label={copy({ hi: "MRP (₹)", en: "MRP (₹)" })}>
          <input type="number" min={0} step="0.01" className={inputClass} value={draft.mrp} onChange={(e) => setDraft({ ...draft, mrp: e.target.value })} />
        </Field>
        <Field label={copy({ hi: "हिन्दी विवरण", en: "Hindi description" })}>
          <textarea className="min-h-28 w-full rounded-md border border-input bg-background p-3" value={draft.descriptionHi} onChange={(e) => setDraft({ ...draft, descriptionHi: e.target.value })} />
        </Field>
        <Field label={copy({ hi: "English विवरण", en: "English description" })}>
          <textarea className="min-h-28 w-full rounded-md border border-input bg-background p-3" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-5" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
          {copy({ hi: "ग्राहकों को दिखाएँ", en: "Show to customers" })}
        </label>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-5" checked={draft.isFeatured} onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })} />
          {copy({ hi: "मुख्य पेज पर दिखाएँ", en: "Feature on the home page" })}
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {copy({ hi: "सेव करें", en: "Save" })}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/admin/products">{copy({ hi: "सूची पर लौटें", en: "Back to list" })}</Link>
          </Button>
        </div>
      </form>
      {id ? (
        <>
          <ProductImageManager
            productId={id}
            images={product.data?.images ?? []}
            primaryImageUrl={product.data?.primaryImageUrl ?? null}
            onSetPrimary={(url) => setDraft((current) => ({ ...current, primaryImageUrl: url }))}
          />
          <ProductStockCard productId={id} />
        </>
      ) : (
        <p className="mt-5 max-w-4xl text-sm text-muted-foreground">
          {copy({ hi: "उत्पाद सेव करने के बाद फोटो और स्टॉक जोड़ सकेंगे।", en: "You can add photos and stock after saving the product." })}
        </p>
      )}
    </>
  );
}

function ProductImageManager({
  productId,
  images,
  primaryImageUrl,
  onSetPrimary,
}: {
  productId: string;
  images: { id: string; imageUrl: string }[];
  primaryImageUrl: string | null;
  onSetPrimary: (url: string) => void;
}) {
  const copy = useCopy();
  const addImage = useAddProductImage();
  const removeImage = useDeleteProductImage();
  const saveProductMutation = useSaveProduct();
  const product = useAdminProduct(productId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    const result = await uploadProductImage(file);
    setUploading(false);
    if ("error" in result) {
      toast.error(
        result.error === "type"
          ? copy({ hi: "केवल JPG, PNG या WEBP फोटो चलेंगी।", en: "Only JPG, PNG or WEBP images are allowed." })
          : result.error === "size"
            ? copy({ hi: "फोटो 5 MB से छोटी होनी चाहिए।", en: "The image must be smaller than 5 MB." })
            : copy({ hi: "फोटो अपलोड नहीं हुई। दोबारा कोशिश करें।", en: "The image did not upload. Please try again." }),
      );
      return;
    }
    addImage.mutate(
      { data: { productId, imageUrl: result.url } },
      {
        onSuccess: () => {
          toast.success(copy({ hi: "फोटो जुड़ गई।", en: "Image added." }));
          if (!primaryImageUrl) setPrimary(result.url);
        },
        onError: (error) => toast.error(errorMessage(copy, error)),
      },
    );
  };

  const setPrimary = (url: string) => {
    const row = product.data;
    if (!row) return;
    onSetPrimary(url);
    saveProductMutation.mutate(
      {
        data: {
          id: row.id,
          name: row.name,
          nameHi: row.nameHi,
          slug: row.slug,
          productType: row.productType,
          categoryId: row.categoryId,
          brand: row.brand,
          sku: row.sku,
          hsnCode: row.hsnCode,
          description: row.description,
          descriptionHi: row.descriptionHi,
          unit: row.unit,
          packSize: row.packSize,
          price: row.price,
          mrp: row.mrp,
          primaryImageUrl: url,
          isActive: row.isActive,
          isFeatured: row.isFeatured,
        },
      },
      {
        onSuccess: () => toast.success(copy({ hi: "मुख्य फोटो बदल दी गई।", en: "Cover image updated." })),
        onError: (error) => toast.error(errorMessage(copy, error)),
      },
    );
  };

  return (
    <section className="mt-6 max-w-4xl rounded-lg bg-card p-5 ring-1 ring-border">
      <h2 className="font-display text-2xl font-semibold">{copy({ hi: "उत्पाद की फोटो", en: "Product photos" })}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy({ hi: "JPG, PNG या WEBP · अधिकतम 5 MB", en: "JPG, PNG or WEBP · up to 5 MB" })}
      </p>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <Button type="button" variant="outline" className="mt-4" disabled={uploading || addImage.isPending} onClick={() => fileInput.current?.click()}>
        {uploading || addImage.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {copy({ hi: "फोटो अपलोड करें", en: "Upload photo" })}
      </Button>
      {images.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{copy({ hi: "अभी कोई फोटो नहीं जुड़ी है।", en: "No photos added yet." })}</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <div key={image.id} className={cn("overflow-hidden rounded-md ring-1 ring-border", primaryImageUrl === image.imageUrl && "ring-2 ring-primary")}>
              <ImageFrame src={image.imageUrl} alt="" ratio="aspect-square" />
              <div className="flex items-center justify-between gap-1 p-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setPrimary(image.imageUrl)} aria-label={copy({ hi: "मुख्य फोटो बनाएँ", en: "Make cover photo" })}>
                  <Star className={cn("size-4", primaryImageUrl === image.imageUrl && "fill-accent text-accent")} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    removeImage.mutate(
                      { data: { id: image.id } },
                      {
                        onSuccess: () => toast.success(copy({ hi: "फोटो हटा दी गई।", en: "Image removed." })),
                        onError: (error) => toast.error(errorMessage(copy, error)),
                      },
                    )
                  }
                  aria-label={copy({ hi: "फोटो हटाएँ", en: "Remove photo" })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProductStockCard({ productId }: { productId: string }) {
  const copy = useCopy();
  const product = useAdminProduct(productId);
  const save = useSaveInventory();
  const stock = product.data?.inventory;
  const [quantity, setQuantity] = useState("");
  const [threshold, setThreshold] = useState("");

  useEffect(() => {
    if (!product.data) return;
    setQuantity(String(product.data.inventory?.quantity ?? 0));
    setThreshold(String(product.data.inventory?.lowStockThreshold ?? 5));
  }, [product.data]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(quantity);
    const low = Number(threshold);
    if (!Number.isInteger(value) || value < 0) {
      toast.error(copy({ hi: "स्टॉक 0 या उससे ज़्यादा पूरी संख्या होनी चाहिए।", en: "Stock must be a whole number of 0 or more." }));
      return;
    }
    if (!Number.isInteger(low) || low < 0) {
      toast.error(copy({ hi: "कम स्टॉक की सीमा सही भरें।", en: "Please enter a valid low-stock level." }));
      return;
    }
    save.mutate(
      { data: { productId, quantity: value, lowStockThreshold: low } },
      {
        onSuccess: () => toast.success(copy({ hi: "स्टॉक सेव हो गया।", en: "Stock saved." })),
        onError: (error) => toast.error(errorMessage(copy, error)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="mt-6 grid max-w-4xl gap-4 rounded-lg bg-card p-5 ring-1 ring-border sm:grid-cols-3">
      <h2 className="font-display text-2xl font-semibold sm:col-span-3">{copy({ hi: "स्टॉक", en: "Stock" })}</h2>
      <Field label={copy({ hi: "उपलब्ध मात्रा", en: "Quantity available" })}>
        <input type="number" min={0} step={1} className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label={copy({ hi: "कम स्टॉक की सीमा", en: "Low stock level" })}>
        <input type="number" min={0} step={1} className={inputClass} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </Field>
      <div className="self-end pb-1">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {copy({ hi: "स्टॉक सेव करें", en: "Save stock" })}
        </Button>
      </div>
      {stock && stock.batchNumber && (
        <p className="text-sm text-muted-foreground sm:col-span-3">
          {copy({ hi: "बैच", en: "Batch" })}: {stock.batchNumber}
        </p>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------- inventory */

export function AdminInventory({ filter = "all" }: { filter?: "all" | "low" }) {
  const copy = useCopy();
  const { data: allRows = [], isLoading, isError, refetch } = useAdminInventory();
  const save = useSaveInventory();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">(filter);
  // Uses the existing available = quantity − reserved and low-stock threshold logic
  // (low matches the dashboard tile: in stock but at or below the threshold).
  const avail = (r: { quantity: number; reservedQuantity: number }) => r.quantity - r.reservedQuantity;
  const baseRows = stockFilter === "low"
    ? allRows.filter((r) => avail(r) > 0 && avail(r) <= r.lowStockThreshold)
    : stockFilter === "out"
      ? allRows.filter((r) => avail(r) <= 0)
      : stockFilter === "in"
        ? allRows.filter((r) => avail(r) > r.lowStockThreshold)
        : allRows;
  const needle = search.trim().toLowerCase();
  const rows = needle ? baseRows.filter((r) => r.name.toLowerCase().includes(needle) || r.nameHi.toLowerCase().includes(needle)) : baseRows;
  const stockOptions: Array<["all" | "in" | "low" | "out", { hi: string; en: string }]> = [
    ["all", { hi: "सभी", en: "All" }],
    ["in", { hi: "स्टॉक में", en: "In stock" }],
    ["low", { hi: "कम स्टॉक", en: "Low stock" }],
    ["out", { hi: "स्टॉक खत्म", en: "Out of stock" }],
  ];

  return (
    <>
      <AdminHeading
        title={copy({ hi: "स्टॉक", en: "Inventory" })}
        description={copy({ hi: "हर उत्पाद की उपलब्ध मात्रा यहाँ से बदलें।", en: "Update the available quantity for every product here." })}
      />
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label={copy({ hi: "उत्पाद का नाम खोजें", en: "Search by product name" })} placeholder={copy({ hi: "उत्पाद का नाम खोजें…", en: "Search product name…" })} className="mb-3 h-12 w-full rounded-md border border-input bg-background px-3 sm:max-w-md" />
      <div role="group" aria-label={copy({ hi: "स्टॉक के अनुसार देखें", en: "Filter by stock" })} className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {stockOptions.map(([value, label]) => <Button key={value} type="button" size="sm" variant={stockFilter === value ? "default" : "outline"} aria-pressed={stockFilter === value} onClick={() => setStockFilter(value)} className="shrink-0">{copy(label)}</Button>)}
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-card ring-1 ring-border" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 && (needle || stockFilter !== "all") ? (
        <p className="text-sm text-muted-foreground">{copy({ hi: "कोई मेल खाता उत्पाद नहीं मिला।", en: "No matching products found." })}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={copy({ hi: "अभी कोई उत्पाद नहीं", en: "No products yet" })}
          description={copy({ hi: "पहले उत्पाद जोड़ें, फिर उनका स्टॉक यहाँ दिखेगा।", en: "Add products first and their stock will appear here." })}
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const value = edits[row.productId] ?? String(row.quantity);
            const available = row.quantity - row.reservedQuantity;
            const low = available <= row.lowStockThreshold;
            return (
              <form
                key={row.productId}
                onSubmit={(event) => {
                  event.preventDefault();
                  const quantity = Number(value);
                  if (!Number.isInteger(quantity) || quantity < 0) {
                    toast.error(copy({ hi: "स्टॉक 0 या उससे ज़्यादा पूरी संख्या होनी चाहिए।", en: "Stock must be a whole number of 0 or more." }));
                    return;
                  }
                  save.mutate(
                    { data: { productId: row.productId, quantity, lowStockThreshold: row.lowStockThreshold } },
                    {
                      onSuccess: () => toast.success(copy({ hi: "स्टॉक सेव हो गया।", en: "Stock saved." })),
                      onError: (error) => toast.error(errorMessage(copy, error)),
                    },
                  );
                }}
                className="grid gap-3 rounded-lg bg-card p-5 ring-1 ring-border sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{copy({ hi: row.nameHi, en: row.name })}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.sku ? `SKU: ${row.sku} · ` : ""}
                    {row.isActive ? copy({ hi: "सक्रिय", en: "Active" }) : copy({ hi: "बंद", en: "Inactive" })}
                    {" · "}
                    <span className={cn(low && "text-destructive")}>
                      {available <= 0
                        ? copy({ hi: "स्टॉक खत्म", en: "Out of stock" })
                        : low
                          ? copy({ hi: "कम स्टॉक", en: "Low stock" })
                          : copy({ hi: "उपलब्ध", en: "In stock" })}
                    </span>
                  </p>
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{copy({ hi: "मात्रा", en: "Quantity" })}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="h-12 w-28 rounded-md border border-input bg-background px-3"
                    value={value}
                    onChange={(e) => setEdits({ ...edits, [row.productId]: e.target.value })}
                  />
                </label>
                <Button type="submit" variant="outline" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  {copy({ hi: "सेव", en: "Save" })}
                </Button>
              </form>
            );
          })}
        </div>
      )}
    </>
  );
}
