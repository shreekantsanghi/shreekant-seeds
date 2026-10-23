import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { roadDistance } from "@/lib/geoapify.server";
import { insertDeliveryLocation } from "@/lib/geo-location.server";

/**
 * Phase 14 extension — "Use my current location".
 *
 * Decision support only. The customer's written address is untouched, the
 * merchant-confirmed distance and the FREE/₹30/₹50 approval stay authoritative,
 * and no distance supplied by the browser is ever trusted: the server routes it
 * itself with the existing Geoapify implementation, server-side keys only.
 */

/** Above this the reading is too coarse to be useful — the customer retries. */
const MAX_ACCURACY_M = 250;
/** Between this and MAX the estimate is shown, clearly marked approximate. */
const APPROXIMATE_ACCURACY_M = 100;

export type GpsEstimateResult =
  | {
      ok: true;
      snapshotId: string | null;
      distanceKm: number;
      durationMin: number;
      accuracyM: number;
      approximate: boolean;
    }
  | { ok: false; reason: "accuracy" | "invalid" | "address" | "not_configured" | "route_failed" };

export const estimateGpsDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        addressId: z.string().uuid(),
        lat: z.number().finite().min(-90).max(90),
        lon: z.number().finite().min(-180).max(180),
        accuracyM: z.number().finite().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GpsEstimateResult> => {
    const { supabase, userId } = context;

    if (data.accuracyM > MAX_ACCURACY_M) return { ok: false, reason: "accuracy" };

    // The address must be one of this customer's own saved addresses (RLS also enforces it).
    const address = await supabase.from("addresses").select("id").eq("id", data.addressId).maybeSingle();
    if (address.error || !address.data) return { ok: false, reason: "address" };

    const settings = await supabase
      .from("delivery_settings")
      .select("origin_lat, origin_lon")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (settings.error || !settings.data || settings.data.origin_lat === null || settings.data.origin_lon === null) {
      return { ok: false, reason: "not_configured" };
    }
    const origin = { lat: Number(settings.data.origin_lat), lon: Number(settings.data.origin_lon) };

    // Routing uses the exact coordinates the browser reported (no rounding).
    try {
      const route = await roadDistance(origin, { lat: data.lat, lon: data.lon });
      const snapshotId = await insertDeliveryLocation({
        userId,
        addressId: data.addressId,
        lat: data.lat,
        lon: data.lon,
        accuracyM: data.accuracyM,
        status: "ok",
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        error: null,
      });
      return {
        ok: true,
        snapshotId,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        accuracyM: Math.round(data.accuracyM),
        approximate: data.accuracyM > APPROXIMATE_ACCURACY_M,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "ROUTE_FAILED";
      console.error("[geo-location] gps routing failed", message);
      await insertDeliveryLocation({
        userId,
        addressId: data.addressId,
        lat: data.lat,
        lon: data.lon,
        accuracyM: data.accuracyM,
        status: "route_failed",
        distanceKm: null,
        durationMin: null,
        error: message,
      });
      return { ok: false, reason: "route_failed" };
    }
  });

/** Does this customer have a previous location for the address? (no coordinates returned) */
export const getLastDeliveryLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ addressId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { lastLocationSummary } = await import("@/lib/geo-location.server");
    return lastLocationSummary(context.userId, data.addressId);
  });

/** "Use last location" — creates a fresh snapshot from the previous one for this address. */
export const reuseLastDeliveryLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ addressId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<GpsEstimateResult> => {
    const address = await context.supabase.from("addresses").select("id").eq("id", data.addressId).maybeSingle();
    if (address.error || !address.data) return { ok: false, reason: "address" };
    const { reuseLastLocation } = await import("@/lib/geo-location.server");
    const reused = await reuseLastLocation(context.userId, data.addressId);
    if (!reused) return { ok: false, reason: "invalid" };
    return { ok: true, ...reused, approximate: reused.accuracyM > APPROXIMATE_ACCURACY_M };
  });
