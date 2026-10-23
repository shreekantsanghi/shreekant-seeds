/**
 * Security headers added to every response from the server entry.
 * Frame/HSTS protection applies only on the production domain so the
 * editor preview (which embeds the site in a frame) keeps working.
 * The CSP is deliberately restrictive only where it cannot break Razorpay,
 * Firebase, Supabase or images: no plugins, no <base> hijack, no framing.
 */
const PRODUCTION_HOSTS = new Set(["shreekantseeds.in", "www.shreekantseeds.in"]);

export function securityHeadersFor(hostname: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), payment=(self \"https://api.razorpay.com\"), geolocation=(self)",
  };
  if (PRODUCTION_HOSTS.has(hostname)) {
    headers["Content-Security-Policy"] = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    headers["X-Frame-Options"] = "DENY";
    headers["Strict-Transport-Security"] = "max-age=31536000";
  }
  return headers;
}

export function withSecurityHeaders(request: Request, response: Response): Response {
  let hostname = "";
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    // keep defaults
  }
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(securityHeadersFor(hostname))) {
    if (!out.headers.has(k)) out.headers.set(k, v);
  }
  return out;
}
