/**
 * Direct Firebase Cloud Messaging (HTTP v1) authentication for the server.
 *
 * Runs on Cloudflare Workers: uses only Web Crypto + fetch (no firebase-admin,
 * no filesystem, no Node crypto). The service-account JSON is read from the
 * server-only FIREBASE_SERVICE_ACCOUNT_JSON variable and never logged or
 * returned; errors carry only a short, credential-free reason.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export class FcmConfigError extends Error {}

export type FcmAuth = { projectId: string; accessToken: string };

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

let cached: { key: string; token: string; expiresAt: number } | null = null;

function readConfig(): { projectId: string; account: ServiceAccount } {
  const projectId = process.env["FIREBASE_PROJECT_ID"]?.trim();
  if (!projectId) throw new FcmConfigError("FIREBASE_PROJECT_ID is not configured");
  if (!/^[a-z0-9-]+$/i.test(projectId)) throw new FcmConfigError("FIREBASE_PROJECT_ID is malformed");

  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!raw) throw new FcmConfigError("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FcmConfigError("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  const a = parsed as Partial<ServiceAccount> | null;
  if (!a || typeof a.client_email !== "string" || typeof a.private_key !== "string" || !a.private_key.includes("PRIVATE KEY")) {
    throw new FcmConfigError("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return { projectId, account: a as ServiceAccount };
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    throw new FcmConfigError("Service account private key is malformed");
  }
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      der as BufferSource,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new FcmConfigError("Service account private key could not be imported");
  }
}

/** Returns a cached Google access token, refreshing ~5 minutes before expiry. */
export async function getFcmAuth(): Promise<FcmAuth> {
  const { projectId, account } = readConfig();
  const cacheKey = `${projectId}:${account.client_email}`;
  const now = Date.now();
  if (cached && cached.key === cacheKey && cached.expiresAt - 5 * 60_000 > now) {
    return { projectId, accessToken: cached.token };
  }

  const iat = Math.floor(now / 1000);
  const tokenUri = account.token_uri || TOKEN_URL;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 }),
  );
  const key = await importKey(account.private_key);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) {
    // Google's error body names the failure (e.g. invalid_grant) without echoing credentials.
    let reason = "";
    try {
      const body = (await response.json()) as { error?: string };
      reason = typeof body.error === "string" ? body.error : "";
    } catch {
      /* ignore */
    }
    throw new FcmConfigError(`Google token exchange failed [${response.status}]${reason ? `: ${reason}` : ""}`);
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new FcmConfigError("Google token exchange returned no access token");
  cached = { key: cacheKey, token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
  return { projectId, accessToken: data.access_token };
}

/** Drops the cached token (e.g. after FCM rejects it with 401). */
export function clearFcmAuthCache(): void {
  cached = null;
}
