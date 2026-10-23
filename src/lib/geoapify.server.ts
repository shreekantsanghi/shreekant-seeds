/**
 * Phase 14 — Geoapify geocoding + road routing. Server-only: both API keys are
 * read from the runtime environment inside each function and never reach the
 * browser. Every call has an 8-second timeout and throws on failure; callers
 * treat a throw as "estimate unavailable", never as a user-facing error.
 */

const GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search";
const ROUTE_URL = "https://api.geoapify.com/v1/routematrix";

const TIMEOUT_MS = 8000;

export type GeocodeResult = {
  lat: number;
  lon: number;
  confidence: number | null;
  formatted: string | null;
  postcode: string | null;
  district: string | null;
  locality: string | null;
  resultType: string | null;
  /** Straight-line km from the shop — plausibility only, never a delivery figure. */
  shopKm: number;
};

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
};

/**
 * Geocoding sanity radius around the shop. This is ONLY used to reject
 * far-away namesakes and district-headquarters fallbacks; it has nothing to do
 * with the 10 km / 20 km delivery tiers or merchant approval.
 */
const PLAUSIBILITY_RADIUS_KM = 60;

/** Round stored coordinates to 4 decimals (~100 m) — no unnecessary precision. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

const norm = (value: string | null | undefined) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** Loose name match: either side containing the other counts (Kerawali / Kerwali Colony). */
const nameMatches = (a: string, b: string) => {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

type AddressParts = {
  line1: string;
  line2: string | null;
  landmark: string | null;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
};

async function fetchCandidates(
  query: string,
  apiKey: string,
  shop: { lat: number; lon: number } | undefined,
): Promise<GeocodeResult[]> {
  const areaFilter = shop
    ? `&filter=circle:${shop.lon},${shop.lat},${PLAUSIBILITY_RADIUS_KM * 1000}&bias=proximity:${shop.lon},${shop.lat}`
    : "&filter=countrycode:in";
  const url = `${GEOCODE_URL}?text=${encodeURIComponent(query)}&limit=5&lang=en${areaFilter}&apiKey=${apiKey}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GEOCODE_HTTP_${response.status}`);
  const body = (await response.json()) as {
    features?: Array<{
      properties?: {
        lat?: number;
        lon?: number;
        formatted?: string;
        postcode?: string;
        city?: string;
        town?: string;
        village?: string;
        suburb?: string;
        county?: string;
        state_district?: string;
        result_type?: string;
        rank?: { confidence?: number };
      };
    }>;
  };

  const results: GeocodeResult[] = [];
  for (const feature of body.features ?? []) {
    const props = feature.properties;
    if (typeof props?.lat !== "number" || typeof props?.lon !== "number") continue;
    const point = { lat: round4(props.lat), lon: round4(props.lon) };
    results.push({
      ...point,
      confidence: typeof props.rank?.confidence === "number" ? props.rank.confidence : null,
      formatted: typeof props.formatted === "string" ? props.formatted : null,
      postcode: typeof props.postcode === "string" ? props.postcode : null,
      district:
        typeof props.state_district === "string"
          ? props.state_district
          : typeof props.county === "string"
            ? props.county
            : null,
      locality: props.village ?? props.town ?? props.city ?? props.suburb ?? null,
      resultType: typeof props.result_type === "string" ? props.result_type : null,
      shopKm: shop ? Math.round(haversineKm(shop, point) * 10) / 10 : 0,
    });
  }
  return results;
}

/**
 * Returns plausible geocoding candidates, best first.
 *
 * Query ladder (noisy colony/landmark/"dhani" text is dropped as we widen):
 *   1. street + village + district + state + pincode
 *   2. village + district + state + pincode
 *   3. pincode + state
 *
 * Every rung is searched inside the plausibility radius around the shop, and
 * results that are far-away namesakes or a plain district-headquarters/city
 * fallback (when the customer entered a village) are rejected outright. When
 * no plausible candidate survives, this throws so the caller records a review
 * state instead of inventing a 70-80 km distance.
 */
export async function geocodeCandidates(
  parts: AddressParts,
  bias?: { lat: number; lon: number },
): Promise<GeocodeResult[]> {
  const apiKey = process.env["GEOAPIFY_GEOCODING_API_KEY"];
  if (!apiKey) throw new Error("GEOCODING_NOT_CONFIGURED");

  const tail = [parts.villageTown, parts.district, parts.state, parts.pincode].filter(Boolean);
  const ladder = [
    [parts.line1, ...tail, "India"],
    [...tail, "India"],
    [parts.pincode, parts.state, "India"],
  ]
    .map((segments) => segments.filter(Boolean).join(", "))
    .filter((query, index, all) => query.length > 0 && all.indexOf(query) === index);

  const wantedPincode = norm(parts.pincode);
  const wantedLocality = norm(parts.villageTown);
  const wantedDistrict = norm(parts.district);

  const plausible = (candidate: GeocodeResult) => {
    if (bias && candidate.shopKm > PLAUSIBILITY_RADIUS_KM) return false;
    const pincodeMatch = !!norm(candidate.postcode) && norm(candidate.postcode) === wantedPincode;
    const localityMatch = nameMatches(norm(candidate.locality), wantedLocality);
    // District-headquarters / city fallback: the API gave a city that is not the
    // place the customer typed, and the pincode does not back it up either.
    if (candidate.resultType === "city" && !localityMatch && !pincodeMatch) return false;
    if (!pincodeMatch && !localityMatch && candidate.resultType !== "postcode") {
      // Nothing but a district-level match — only acceptable when close by.
      if (!nameMatches(norm(candidate.district), wantedDistrict)) return false;
      if (candidate.shopKm > PLAUSIBILITY_RADIUS_KM / 2) return false;
    }
    return true;
  };

  const score = (candidate: GeocodeResult) => {
    const pincodeMatch = !!norm(candidate.postcode) && norm(candidate.postcode) === wantedPincode;
    const localityMatch = nameMatches(norm(candidate.locality), wantedLocality);
    if (pincodeMatch && localityMatch) return 0;
    if (localityMatch) return 1;
    if (pincodeMatch) return 2;
    if (nameMatches(norm(candidate.district), wantedDistrict)) return 3;
    return 4;
  };

  let lastError: Error | null = null;
  for (const query of ladder) {
    let found: GeocodeResult[];
    try {
      found = await fetchCandidates(query, apiKey, bias);
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error("GEOCODE_FAILED");
      continue;
    }
    const kept = found.filter(plausible);
    if (kept.length === 0) continue;
    return kept
      .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.candidate.shopKm - b.candidate.shopKm ||
          (b.candidate.confidence ?? 0) - (a.candidate.confidence ?? 0) ||
          a.index - b.index,
      )
      .map((entry) => entry.candidate);
  }

  if (lastError) throw lastError;
  throw new Error("GEOCODE_NO_PLAUSIBLE_MATCH");
}



export async function roadDistance(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }): Promise<RouteResult> {
  const apiKey = process.env["GEOAPIFY_ROUTING_API_KEY"];
  if (!apiKey) throw new Error("ROUTING_NOT_CONFIGURED");

  const response = await fetch(`${ROUTE_URL}?apiKey=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      mode: "drive",
      sources: [{ location: [origin.lon, origin.lat] }],
      targets: [{ location: [destination.lon, destination.lat] }],
    }),
  });
  if (!response.ok) throw new Error(`ROUTE_HTTP_${response.status}`);
  const body = (await response.json()) as {
    sources_to_targets?: Array<Array<{ distance?: number; time?: number }>>;
  };
  const leg = body.sources_to_targets?.[0]?.[0];
  if (typeof leg?.distance !== "number" || typeof leg?.time !== "number") throw new Error("ROUTE_NO_RESULT");

  return {
    distanceKm: Math.round((leg.distance / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round(leg.time / 60)),
  };
}
