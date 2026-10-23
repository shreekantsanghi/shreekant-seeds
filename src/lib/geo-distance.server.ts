/**
 * Phase 14 — the address estimate runner. Server-only. Writes go through the
 * privileged client because the database guards allow estimate writes only
 * from the server (no signed-in user) or the shop; a customer's own session
 * can never write them.
 *
 * Cost control (per the approved design): an address whose estimate is already
 * "ok"/"out_of_range" is never re-estimated unless forced, and any estimate
 * made in the last 10 minutes is reused even when forced. A location edit
 * resets the estimate to "pending" in the database, which is what makes a
 * changed address eligible again.
 */

import { geocodeCandidates, roadDistance, type GeocodeResult } from "@/lib/geoapify.server";

const REESTIMATE_FLOOR_MS = 10 * 60 * 1000;

export type EstimateStatus = "pending" | "ok" | "geocode_failed" | "route_failed" | "out_of_range";

export type AddressEstimate = {
  status: EstimateStatus;
  distanceKm: number | null;
  durationMin: number | null;
  estimatedAt: string | null;
  error: string | null;
};

type AddressRow = {
  id: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  village_town: string;
  district: string;
  state: string;
  pincode: string;
  estimate_status: string;
  estimated_distance_km: number | null;
  estimated_duration_min: number | null;
  estimated_at: string | null;
  estimate_error: string | null;
};

const toEstimate = (row: AddressRow): AddressEstimate => ({
  status: row.estimate_status as EstimateStatus,
  distanceKm: row.estimated_distance_km === null ? null : Number(row.estimated_distance_km),
  durationMin: row.estimated_duration_min === null ? null : Number(row.estimated_duration_min),
  estimatedAt: row.estimated_at,
  error: row.estimate_error,
});

type LooseClient = {
  from: (table: string) => any;
};

const ESTIMATE_COLUMNS =
  "id, address_line1, address_line2, landmark, village_town, district, state, pincode, estimate_status, estimated_distance_km, estimated_duration_min, estimated_at, estimate_error";

/**
 * Estimates the road distance for one address and stores it. Never throws:
 * every failure is recorded on the address (or logged) so address saving,
 * checkout, and the merchant screens are never affected.
 */
export async function runAddressEstimate(addressId: string, options?: { force?: boolean }): Promise<AddressEstimate | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as LooseClient;

    const { data: address, error: addressError } = await db
      .from("addresses")
      .select(ESTIMATE_COLUMNS)
      .eq("id", addressId)
      .maybeSingle();
    if (addressError || !address) return null;
    const row = address as AddressRow;

    // Cache: a current estimate is reused unless forced.
    if (!options?.force && (row.estimate_status === "ok" || row.estimate_status === "out_of_range")) {
      return toEstimate(row);
    }
    // 10-minute floor: nothing is re-estimated within 10 minutes.
    if (row.estimated_at && Date.now() - new Date(row.estimated_at).getTime() < REESTIMATE_FLOOR_MS) {
      return toEstimate(row);
    }

    const { data: settings, error: settingsError } = await db
      .from("delivery_settings")
      .select("origin_lat, origin_lon, tier2_max_km")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (settingsError || !settings || settings.origin_lat === null || settings.origin_lon === null) {
      // No shop origin configured: leave the estimate pending, try nothing.
      return toEstimate(row);
    }
    const origin = { lat: Number(settings.origin_lat), lon: Number(settings.origin_lon) };
    const tier2MaxKm = Number(settings.tier2_max_km);

    const write = async (fields: Record<string, unknown>) => {
      const { error } = await db.from("addresses").update(fields).eq("id", addressId);
      if (error) console.error("[geo] estimate write failed", error.message);
    };

    let candidates: GeocodeResult[];
    try {
      candidates = await geocodeCandidates(
        {
          line1: row.address_line1,
          line2: row.address_line2,
          landmark: row.landmark,
          villageTown: row.village_town,
          district: row.district,
          state: row.state,
          pincode: row.pincode,
        },
        origin,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "GEOCODE_FAILED";
      await write({
        estimate_status: "geocode_failed",
        estimate_error: message,
        estimated_at: new Date().toISOString(),
      });
      return { status: "geocode_failed", distanceKm: null, durationMin: null, estimatedAt: null, error: message };
    }

    // Try the best plausible candidate; if it has no road route, try the next ones.
    let geocode = candidates[0]!;
    let route;
    let lastError = "ROUTE_FAILED";
    for (const candidate of candidates.slice(0, 3)) {

      try {
        route = await roadDistance(origin, { lat: candidate.lat, lon: candidate.lon });
        geocode = candidate;
        break;
      } catch (cause) {
        lastError = cause instanceof Error ? cause.message : "ROUTE_FAILED";
      }
    }
    if (!route) {
      await write({
        geo_lat: geocode.lat,
        geo_lon: geocode.lon,
        geo_confidence: geocode.confidence,
        geo_formatted: geocode.formatted,
        geocoded_at: new Date().toISOString(),
        estimate_status: "route_failed",
        estimate_error: lastError,
        estimated_at: new Date().toISOString(),
      });
      return { status: "route_failed", distanceKm: null, durationMin: null, estimatedAt: null, error: lastError };
    }


    // out_of_range means ONLY: estimated distance is beyond tier 2.
    const status: EstimateStatus = route.distanceKm > tier2MaxKm ? "out_of_range" : "ok";
    await write({
      geo_lat: geocode.lat,
      geo_lon: geocode.lon,
      geo_confidence: geocode.confidence,
      geo_formatted: geocode.formatted,
      geocoded_at: new Date().toISOString(),
      estimated_distance_km: route.distanceKm,
      estimated_duration_min: route.durationMin,
      estimate_status: status,
      estimate_error: null,
      estimated_at: new Date().toISOString(),
    });
    return { status, distanceKm: route.distanceKm, durationMin: route.durationMin, estimatedAt: null, error: null };
  } catch (cause) {
    // Estimation must never break the operation that triggered it.
    console.error("[geo] estimate failed", cause instanceof Error ? cause.message : cause);
    return null;
  }
}
