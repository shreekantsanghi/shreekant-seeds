import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminHeading } from "@/components/admin/core";
import { useCopy } from "@/lib/store-context";
import {
  listAdminCustomerAddresses,
  listAdminCustomers,
  setAddressDistance,
  type AdminCustomer,
  type AdminCustomerAddress,
} from "@/lib/admin-customers.functions";
import { recalculateAddressEstimate } from "@/lib/geo-distance.functions";

const inputClass = "h-10 w-28 rounded-md border border-input bg-background px-3";

/** Phase 14 — read-only road-distance estimate, shown as decision support. */
function EstimateLine({ address, userId, onUse }: { address: AdminCustomerAddress; userId: string; onUse: (km: number) => void }) {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const recalculate = useServerFn(recalculateAddressEstimate);

  const mutation = useMutation({
    mutationFn: () => recalculate({ data: { addressId: address.id } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-customer-addresses", userId] });
      if (result) {
        toast.success(copy({ hi: "अनुमान अपडेट हो गया।", en: "Estimate updated." }));
      } else {
        toast.error(copy({ hi: "अनुमान अपडेट नहीं हो सका।", en: "Could not update the estimate." }));
      }
    },

    onError: () =>
      toast.error(copy({ hi: "अनुमान अपडेट नहीं हो सका।", en: "Could not update the estimate." })),
  });

  const text =
    address.estimateStatus === "ok" || address.estimateStatus === "out_of_range"
      ? copy({
          hi: `सड़क दूरी (अनुमान): लगभग ${address.estimatedDistanceKm} किमी${address.estimatedDurationMin !== null ? ` · ~${address.estimatedDurationMin} मिनट` : ""}`,
          en: `Road distance (estimate): about ${address.estimatedDistanceKm} km${address.estimatedDurationMin !== null ? ` · ~${address.estimatedDurationMin} min` : ""}`,
        })
      : address.estimateStatus === "geocode_failed" || address.estimateStatus === "route_failed"
        ? copy({ hi: "सड़क दूरी का अनुमान नहीं लग सका।", en: "The road distance could not be estimated." })
        : copy({ hi: "सड़क दूरी का अनुमान अभी बाकी है।", en: "Road-distance estimate pending." });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>
        {text}
        {address.estimateStatus === "out_of_range" && (
          <span className="ml-1 font-medium text-accent-strong">
            {copy({ hi: "— स्तर 2 सीमा से आगे", en: "— beyond the tier 2 limit" })}
          </span>
        )}
      </span>
      <Button type="button" variant="ghost" size="sm" className="h-8" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? copy({ hi: "जाँच हो रही है…", en: "Checking…" }) : copy({ hi: "फिर से जाँचें", en: "Recalculate" })}
      </Button>
      {address.estimatedDistanceKm !== null && (address.estimateStatus === "ok" || address.estimateStatus === "out_of_range") && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onUse(address.estimatedDistanceKm as number)}>
          {copy({ hi: "यह दूरी लें", en: "Use this distance" })}
        </Button>
      )}
    </div>
  );
}

function DistanceControl({ address, userId }: { address: AdminCustomerAddress; userId: string }) {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const save = useServerFn(setAddressDistance);
  const [value, setValue] = useState(address.distanceKm === null ? "" : String(address.distanceKm));

  const mutation = useMutation({
    mutationFn: (distanceKm: number | null) => save({ data: { addressId: address.id, distanceKm } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-customer-addresses", userId] });
      toast.success(copy({ hi: "दूरी सहेज दी गई।", en: "Distance saved." }));
    },
    onError: () =>
      toast.error(copy({ hi: "दूरी सहेजी नहीं जा सकी। दोबारा कोशिश करें।", en: "Could not save the distance. Please try again." })),
  });

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed === "") {
      mutation.mutate(null);
      return;
    }
    const distance = Number(trimmed);
    if (!Number.isFinite(distance) || distance < 0 || distance > 500) {
      toast.error(copy({ hi: "दूरी 0 से 500 किमी के बीच होनी चाहिए।", en: "Distance must be between 0 and 500 km." }));
      return;
    }
    mutation.mutate(distance);
  };

  return (
    <div className="mt-3">
      <EstimateLine address={address} userId={userId} onUse={(km) => setValue(String(km))} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium">{copy({ hi: "पुष्टि की गई दूरी (किमी)", en: "Confirmed distance (km)" })}</span>
        <input
          type="number"
          min={0}
          max={500}
          step="0.1"
          className={inputClass}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <Button type="button" className="h-10 rounded-full" disabled={mutation.isPending} onClick={submit}>
        {mutation.isPending ? copy({ hi: "सहेजा जा रहा है…", en: "Saving…" }) : copy({ hi: "सहेजें", en: "Save" })}
      </Button>
      {address.distanceKm !== null && (
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          disabled={mutation.isPending}
          onClick={() => {
            setValue("");
            mutation.mutate(null);
          }}
        >
          {copy({ hi: "हटाएँ", en: "Clear" })}
        </Button>
      )}
      </div>
    </div>
  );
}

function CustomerRow({ customer }: { customer: AdminCustomer }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const load = useServerFn(listAdminCustomerAddresses);
  const addresses = useQuery<AdminCustomerAddress[]>({
    queryKey: ["admin-customer-addresses", customer.id],
    queryFn: () => load({ data: { userId: customer.id } }),
    enabled: open,
    retry: false,
  });

  return (
    <li className="rounded-lg bg-card ring-1 ring-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <span>
          <span className="block font-semibold">
            {customer.fullName || copy({ hi: "नाम दर्ज नहीं", en: "No name recorded" })}
          </span>
          <span className="block text-sm text-muted-foreground">
            {customer.phone || copy({ hi: "फोन नहीं", en: "No phone" })} ·{" "}
            {copy({ hi: `${customer.addressCount} पते`, en: `${customer.addressCount} addresses` })}
          </span>
          <span className="block break-all text-sm text-muted-foreground">
            {customer.email || copy({ hi: "ईमेल नहीं", en: "No email" })}
          </span>
        </span>
        {open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
      </button>

      {open && (
        <div className="border-t border-border p-4">
          {addresses.isLoading ? (
            <p className="text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
          ) : addresses.isError ? (
            <p className="text-sm text-destructive">
              {copy({ hi: "पते लोड नहीं हो सके।", en: "Could not load the addresses." })}
            </p>
          ) : !(addresses.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">
              {copy({ hi: "इस ग्राहक का कोई सहेजा हुआ पता नहीं है।", en: "This customer has no saved address." })}
            </p>
          ) : (
            <ul className="space-y-3">
              {(addresses.data ?? []).map((address) => (
                <li key={address.id} className="rounded-md p-3 ring-1 ring-border">
                  <p className="font-medium">
                    {address.fullName} · {address.phone}
                    {address.isDefault && (
                      <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent-strong">
                        {copy({ hi: "मुख्य पता", en: "Default" })}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <MapPin aria-hidden="true" className="mr-1 inline size-4" />
                    {[address.addressLine1, address.addressLine2, address.landmark, address.villageTown, address.district, address.state, address.pincode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-2 text-sm">
                    {address.distanceKm === null
                      ? copy({ hi: "डिलीवरी दूरी की पुष्टि बाकी है", en: "Delivery distance not confirmed yet" })
                      : copy({
                          hi: `पुष्टि: ${address.distanceKm} किमी · ${address.distanceConfirmedAt ? new Date(address.distanceConfirmedAt).toLocaleString("hi-IN") : ""}`,
                          en: `Confirmed: ${address.distanceKm} km · ${address.distanceConfirmedAt ? new Date(address.distanceConfirmedAt).toLocaleString("en-IN") : ""}`,
                        })}
                  </p>
                  <DistanceControl address={address} userId={customer.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function AdminCustomers() {
  const copy = useCopy();
  const load = useServerFn(listAdminCustomers);
  const customers = useQuery<AdminCustomer[]>({ queryKey: ["admin-customers"], queryFn: () => load(), retry: false });

  return (
    <>
      <AdminHeading
        title={copy({ hi: "ग्राहक", en: "Customers" })}
        description={copy({
          hi: "ग्राहक और उनके सहेजे हुए पते देखें, और हर पते की डिलीवरी दूरी की पुष्टि करें।",
          en: "View customers and their saved addresses, and confirm the delivery distance for each address.",
        })}
      />
      {customers.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
      ) : customers.isError ? (
        <div className="mt-6">
          <p className="text-sm text-destructive">{copy({ hi: "ग्राहक लोड नहीं हो सके।", en: "Could not load customers." })}</p>
          <Button variant="outline" className="mt-3 rounded-full" onClick={() => customers.refetch()}>
            {copy({ hi: "दोबारा कोशिश करें", en: "Try again" })}
          </Button>
        </div>
      ) : !(customers.data ?? []).length ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {copy({ hi: "अभी कोई ग्राहक खाता नहीं है।", en: "There are no customer accounts yet." })}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {(customers.data ?? []).map((customer) => (
            <CustomerRow key={customer.id} customer={customer} />
          ))}
        </ul>
      )}
    </>
  );
}
