/**
 * Phase 14 extension — one-time customer location snapshots.
 *
 * Server-only. Writes go through the privileged client because customers must
 * never be able to write a distance themselves: the server routes the distance
 * with Geoapify and stores the result.
 *
 * Stored precision is deliberately reduced: numeric(6,3) keeps 3 decimal
 * places, i.e. roughly 100 m granularity. The FULL coordinates received from
 * the browser are used for the routing call; only the persisted snapshot is
 * rounded. The browser-reported accuracy is kept separately in metres.
 */

const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** ~100 m granularity for storage only — never used for routing. */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

type LooseClient = { from: (table: string) => any };

async function admin(): Promise<LooseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseClient;
}

export type SnapshotInsert = {
  userId: string;
  addressId: string;
  lat: number;
  lon: number;
  accuracyM: number;
  status: "ok" | "route_failed";
  distanceKm: number | null;
  durationMin: number | null;
  error: string | null;
};

/** Stores one snapshot and returns its id (null when the write fails). */
export async function insertDeliveryLocation(input: SnapshotInsert): Promise<string | null> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from("delivery_locations")
      .insert({
        user_id: input.userId,
        address_id: input.addressId,
        lat: round3(input.lat),
        lon: round3(input.lon),
        accuracy_m: Math.round(input.accuracyM),
        source: "customer_gps",
        status: input.status,
        distance_km: input.distanceKm,
        duration_min: input.durationMin,
        error: input.error,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("[geo-location] snapshot write failed", error?.message);
      return null;
    }
    return data.id as string;
  } catch (cause) {
    console.error("[geo-location] snapshot write threw", cause instanceof Error ? cause.message : cause);
    return null;
  }
}

/**
 * Attaches EXACTLY the snapshot the customer used at checkout to the order
 * they just placed. Never searches for another snapshot. Every failure is
 * logged and swallowed: order creation must never break because of this.
 */
export async function attachDeliveryLocationToOrder(input: {
  snapshotId: string;
  userId: string;
  addressId: string;
  orderId: string;
}): Promise<boolean> {
  try {
    const db = await admin();
    const { data: snapshot, error } = await db
      .from("delivery_locations")
      .select("id, user_id, address_id, order_id, status, distance_km, created_at")
      .eq("id", input.snapshotId)
      .maybeSingle();
    if (error || !snapshot) {
      console.error("[geo-location] snapshot not found for attach", error?.message);
      return false;
    }
    const reject = (reason: string) => {
      console.error("[geo-location] snapshot rejected for attach", { reason, snapshot: input.snapshotId });
      return false;
    };
    if (snapshot.user_id !== input.userId) return reject("wrong_owner");
    if (snapshot.address_id !== input.addressId) return reject("wrong_address");
    if (snapshot.order_id && snapshot.order_id !== input.orderId) return reject("already_attached");
    if (snapshot.status !== "ok" || snapshot.distance_km === null) return reject("invalid_status");
    if (Date.now() - new Date(snapshot.created_at).getTime() > SNAPSHOT_MAX_AGE_MS) return reject("stale");

    const { error: updateError } = await db
      .from("delivery_locations")
      .update({ order_id: input.orderId })
      .eq("id", input.snapshotId)
      .is("order_id", null);
    if (updateError) {
      console.error("[geo-location] snapshot attach failed", updateError.message);
      return false;
    }
    return true;
  } catch (cause) {
    console.error("[geo-location] snapshot attach threw", cause instanceof Error ? cause.message : cause);
    return false;
  }
}

/** Latest successful snapshot this customer took for this address (any age). */
async function latestOkSnapshot(userId: string, addressId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("delivery_locations")
    .select("id, lat, lon, accuracy_m, distance_km, duration_min, created_at")
    .eq("user_id", userId)
    .eq("address_id", addressId)
    .eq("status", "ok")
    .not("distance_km", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[geo-location] last snapshot read failed", error.message);
    return null;
  }
  return data as
    | { id: string; lat: number; lon: number; accuracy_m: number; distance_km: number; duration_min: number | null; created_at: string }
    | null;
}

/** Whether a previous location exists for this address — no coordinates are returned. */
export async function lastLocationSummary(userId: string, addressId: string) {
  const row = await latestOkSnapshot(userId, addressId);
  return row ? { distanceKm: Number(row.distance_km), durationMin: row.duration_min === null ? null : Number(row.duration_min), takenAt: row.created_at } : null;
}

/**
 * "Use last location": copies the customer's previous successful snapshot for
 * this address into a fresh, unattached snapshot for the new order. Old
 * snapshots (and the orders they belong to) are never modified.
 */
export async function reuseLastLocation(userId: string, addressId: string) {
  const row = await latestOkSnapshot(userId, addressId);
  if (!row) return null;
  const db = await admin();
  const { data, error } = await db
    .from("delivery_locations")
    .insert({
      user_id: userId,
      address_id: addressId,
      lat: row.lat,
      lon: row.lon,
      accuracy_m: row.accuracy_m,
      source: "customer_gps_reused",
      status: "ok",
      distance_km: row.distance_km,
      duration_min: row.duration_min,
      error: null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[geo-location] reuse snapshot write failed", error?.message);
    return null;
  }
  return { snapshotId: data.id as string, distanceKm: Number(row.distance_km), durationMin: row.duration_min === null ? 0 : Number(row.duration_min), accuracyM: Number(row.accuracy_m) };
}

/** Server-side gate: the order may only be placed with a valid, fresh snapshot of this customer for this address. */
export async function isValidOrderLocation(input: { snapshotId: string; userId: string; addressId: string }): Promise<boolean> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from("delivery_locations")
      .select("user_id, address_id, status, distance_km, created_at")
      .eq("id", input.snapshotId)
      .maybeSingle();
    if (error || !data) return false;
    return (
      data.user_id === input.userId &&
      data.address_id === input.addressId &&
      data.status === "ok" &&
      data.distance_km !== null &&
      Date.now() - new Date(data.created_at).getTime() <= SNAPSHOT_MAX_AGE_MS
    );
  } catch {
    return false;
  }
}
