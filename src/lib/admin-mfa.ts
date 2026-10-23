import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Phase 15 fix #1 — server-side MFA enforcement for the merchant workspace.
 *
 * The browser's TOTP step is a convenience, not a control: a password-only
 * sign-in already produces a valid "aal1" session. This helper reads the
 * assurance level from the verified token claims and the enrolled factors from
 * Supabase Auth, so the server is the final word on whether two-step
 * verification was actually completed.
 */

export type AdminMfaState = {
  /** The admin has at least one verified TOTP factor. */
  enrolled: boolean;
  /** No factor enrolled, or the current session reached aal2. */
  satisfied: boolean;
  assuranceLevel: string | null;
};

export function assuranceLevelOf(claims: unknown): string | null {
  const record = (claims ?? {}) as Record<string, unknown>;
  return typeof record["aal"] === "string" ? (record["aal"] as string) : null;
}

export async function getAdminMfaState(
  supabase: SupabaseClient<Database>,
  claims: unknown,
): Promise<AdminMfaState> {
  const assuranceLevel = assuranceLevelOf(claims);

  const { data, error } = await supabase.auth.mfa.listFactors();
  // Fail closed: an unknown factor list must never be read as "no MFA needed".
  if (error) throw new Error("Forbidden: MFA_CHECK_FAILED");

  const factors = [...(data.totp ?? []), ...(data.all ?? [])];
  const enrolled = factors.some((factor) => factor.status === "verified");

  return { enrolled, satisfied: !enrolled || assuranceLevel === "aal2", assuranceLevel };
}
