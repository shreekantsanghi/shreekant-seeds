import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminHeading } from "@/components/admin/core";
import { useCopy } from "@/lib/store-context";
import {
  getMerchantDeliverySettings,
  saveMerchantDeliverySettings,
  type MerchantDeliverySettings,
} from "@/lib/delivery-settings.functions";

const key = ["admin-delivery-settings"] as const;

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const id = `delivery-${label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-md border border-input bg-background px-3"
      />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = `delivery-${label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="block sm:col-span-2">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-input bg-background px-3"
      />
    </label>
  );
}

export function AdminDelivery() {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const load = useServerFn(getMerchantDeliverySettings);
  const save = useServerFn(saveMerchantDeliverySettings);
  const query = useQuery<MerchantDeliverySettings | null>({ queryKey: key, queryFn: () => load(), retry: false });
  const [form, setForm] = useState<MerchantDeliverySettings | null>(null);

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (input: MerchantDeliverySettings) =>
      save({
        data: {
          id: input.id,
          serviceArea: input.serviceArea,
          estimatedText: input.estimatedText,
          estimatedTextHi: input.estimatedTextHi,
          minimumOrderAmount: input.minimumOrderAmount,
          freeDeliveryMinPieces: input.freeDeliveryMinPieces,
          freeDeliveryMaxKm: input.freeDeliveryMaxKm,
          tier1MaxKm: input.tier1MaxKm,
          tier1Charge: input.tier1Charge,
          tier2MaxKm: input.tier2MaxKm,
          tier2Charge: input.tier2Charge,
          originLat: input.originLat,
          originLon: input.originLon,
          originLabel: input.originLabel,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success(copy({ hi: "डिलीवरी सेटिंग सहेज दी गई।", en: "Delivery settings saved." }));
    },
    onError: () =>
      toast.error(copy({ hi: "सेटिंग सहेजी नहीं जा सकी। दोबारा कोशिश करें।", en: "Could not save the settings. Please try again." })),
  });

  const set = <K extends keyof MerchantDeliverySettings>(field: K, value: MerchantDeliverySettings[K]) =>
    setForm((previous) => (previous ? { ...previous, [field]: value } : previous));

  return (
    <>
      <AdminHeading
        title={copy({ hi: "स्थानीय डिलीवरी", en: "Local delivery" })}
        description={copy({
          hi: "पीस और दूरी के अनुसार डिलीवरी नियम यहाँ बदलें। यही नियम ग्राहक के चेकआउट पर लागू होते हैं।",
          en: "Edit the piece and distance delivery rules here. These same rules apply on customer checkout.",
        })}
      />
      {query.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
      ) : query.isError ? (
        <p className="mt-6 text-sm text-destructive">
          {copy({ hi: "सेटिंग लोड नहीं हो सकी।", en: "Could not load the settings." })}
        </p>
      ) : !form ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {copy({ hi: "कोई डिलीवरी सेटिंग नहीं मिली।", en: "No delivery settings found." })}
        </p>
      ) : (
        <form
          className="mt-6 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(form);
          }}
        >
          <section className="rounded-lg bg-card p-5 ring-1 ring-border">
            <h2 className="font-display text-xl font-semibold">{copy({ hi: "सेवा क्षेत्र", en: "Service area" })}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField
                label={copy({ hi: "सेवा क्षेत्र", en: "Service area" })}
                value={form.serviceArea}
                onChange={(value) => set("serviceArea", value)}
              />
              <TextField
                label={copy({ hi: "डिलीवरी सूचना (हिन्दी)", en: "Delivery note (Hindi)" })}
                value={form.estimatedTextHi ?? ""}
                onChange={(value) => set("estimatedTextHi", value)}
              />
              <TextField
                label={copy({ hi: "डिलीवरी सूचना (English)", en: "Delivery note (English)" })}
                value={form.estimatedText ?? ""}
                onChange={(value) => set("estimatedText", value)}
              />
              <NumberField
                label={copy({ hi: "न्यूनतम ऑर्डर राशि (₹)", en: "Minimum order amount (₹)" })}
                value={form.minimumOrderAmount}
                onChange={(value) => set("minimumOrderAmount", value)}
              />
            </div>
          </section>

          <section className="rounded-lg bg-card p-5 ring-1 ring-border">
            <h2 className="font-display text-xl font-semibold">{copy({ hi: "डिलीवरी नियम", en: "Delivery rules" })}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <NumberField
                label={copy({ hi: "मुफ़्त डिलीवरी के लिए न्यूनतम पीस", en: "Free delivery minimum pieces" })}
                value={form.freeDeliveryMinPieces}
                onChange={(value) => set("freeDeliveryMinPieces", value)}
              />
              <NumberField
                label={copy({ hi: "मुफ़्त डिलीवरी अधिकतम दूरी (किमी)", en: "Free delivery maximum distance (km)" })}
                value={form.freeDeliveryMaxKm}
                onChange={(value) => set("freeDeliveryMaxKm", value)}
              />
              <NumberField
                label={copy({ hi: "स्तर 1 अधिकतम दूरी (किमी)", en: "Tier 1 maximum distance (km)" })}
                value={form.tier1MaxKm}
                onChange={(value) => set("tier1MaxKm", value)}
              />
              <NumberField
                label={copy({ hi: "स्तर 1 शुल्क (₹)", en: "Tier 1 charge (₹)" })}
                value={form.tier1Charge}
                onChange={(value) => set("tier1Charge", value)}
              />
              <NumberField
                label={copy({ hi: "स्तर 2 अधिकतम दूरी (किमी)", en: "Tier 2 maximum distance (km)" })}
                value={form.tier2MaxKm}
                onChange={(value) => set("tier2MaxKm", value)}
              />
              <NumberField
                label={copy({ hi: "स्तर 2 शुल्क (₹)", en: "Tier 2 charge (₹)" })}
                value={form.tier2Charge}
                onChange={(value) => set("tier2Charge", value)}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {copy({
                hi: "स्तर 2 की दूरी से आगे डिलीवरी के लिए दुकान की पुष्टि ज़रूरी होती है — ग्राहक को कॉल और WhatsApp के विकल्प दिखते हैं।",
                en: "Beyond the tier 2 distance, delivery needs the shop's confirmation — the customer is shown call and WhatsApp options.",
              })}
            </p>
          </section>

          <section className="rounded-lg bg-card p-5 ring-1 ring-border">
            <h2 className="font-display text-xl font-semibold">{copy({ hi: "दुकान / गोदाम का स्थान", en: "Shop / godown location" })}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {copy({
                hi: "इसी स्थान से हर पते की सड़क दूरी का अनुमान लगता है। यह केवल दुकान को दिखता है और कभी भी शुल्क अपने आप नहीं बदलता।",
                en: "Road-distance estimates for every address are measured from here. Only the shop can see this, and it never changes a charge by itself.",
              })}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField
                label={copy({ hi: "स्थान का नाम", en: "Location label" })}
                value={form.originLabel ?? ""}
                onChange={(value) => set("originLabel", value.trim() === "" ? null : value)}
              />
              <TextField
                label={copy({ hi: "अक्षांश (latitude)", en: "Latitude" })}
                value={form.originLat === null ? "" : String(form.originLat)}
                onChange={(value) => {
                  const parsed = Number(value);
                  set("originLat", value.trim() === "" || !Number.isFinite(parsed) ? null : parsed);
                }}
              />
              <TextField
                label={copy({ hi: "देशांतर (longitude)", en: "Longitude" })}
                value={form.originLon === null ? "" : String(form.originLon)}
                onChange={(value) => {
                  const parsed = Number(value);
                  set("originLon", value.trim() === "" || !Number.isFinite(parsed) ? null : parsed);
                }}
              />
            </div>
          </section>

          <Button type="submit" disabled={mutation.isPending} className="h-12 rounded-full px-8">
            {mutation.isPending ? copy({ hi: "सहेजा जा रहा है…", en: "Saving…" }) : copy({ hi: "सेटिंग सहेजें", en: "Save settings" })}
          </Button>
        </form>
      )}
    </>
  );
}
