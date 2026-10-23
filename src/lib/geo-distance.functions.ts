import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-catalog.functions";
import { runAddressEstimate, type AddressEstimate } from "@/lib/geo-distance.server";

export type { AddressEstimate };

export type DeliverySuggestion = {
  status: AddressEstimate["status"];
  distanceKm: number | null;
  durationMin: number | null;
  estimatedAt: string | null;
  /** Suggested charge from the existing tier rules, or null when the shop must decide. */
  suggestedCharge: number | null;
  /** True when the estimate is beyond tier 2 — the shop's own decision is required. */
  outOfRange: boolean;
};

/**
 * Merchant-only "Recalculate": forces a fresh estimate for one address. Still
 * subject to the runner's 10-minute floor, so repeated clicks cost nothing.
 */
export const recalculateAddressEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ addressId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AddressEstimate | null> => {
    await assertAdmin(context);
    return runAddressEstimate(data.addressId, { force: true });
  });

/**
 * Merchant-only, read-only decision support: the stored estimate plus the
 * charge the existing tier rules would suggest. Nothing here writes anything
 * or influences checkout — the merchant's approval stays authoritative.
 */
export const getAddressDeliverySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ addressId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DeliverySuggestion | null> => {
    await assertAdmin(context);

    const { data: address, error } = await context.supabase
      .from("addresses")
      .select("estimate_status, estimated_distance_km, estimated_duration_min, estimated_at")
      .eq("id", data.addressId)
      .maybeSingle();
    if (error) throw error;
    if (!address) return null;

    const { data: settings, error: settingsError } = await context.supabase
      .from("delivery_settings")
      .select("tier1_max_km, tier1_charge, tier2_max_km, tier2_charge")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const status = address.estimate_status as AddressEstimate["status"];
    const distanceKm = address.estimated_distance_km === null ? null : Number(address.estimated_distance_km);
    const outOfRange = status === "out_of_range";

    let suggestedCharge: number | null = null;
    if (status === "ok" && distanceKm !== null && settings) {
      suggestedCharge =
        distanceKm <= Number(settings.tier1_max_km)
          ? Number(settings.tier1_charge)
          : Number(settings.tier2_charge);
    }

    return {
      status,
      distanceKm,
      durationMin: address.estimated_duration_min === null ? null : Number(address.estimated_duration_min),
      estimatedAt: address.estimated_at,
      suggestedCharge,
      outOfRange,
    };
  });
