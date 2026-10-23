import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminMfaState } from "@/lib/admin-mfa";

export type AdminSession = {
  userId: string;
  email: string | null;
  fullName: string | null;
  hasProfile: boolean;
  isAdmin: boolean;
  isActive: boolean;
  /** Authenticator assurance level of the verified token: "aal1" or "aal2" (MFA verified). */
  assuranceLevel: string | null;
  /** The account has a verified TOTP factor. */
  mfaEnrolled: boolean;
  /** Two-step verification is complete for this session (or none is enrolled). */
  mfaSatisfied: boolean;
  /** This session is one of the merchant's 4 most recently started active sessions. */
  sessionAllowed: boolean;
};

/**
 * Server-side authorization check. The bearer token is validated by
 * requireSupabaseAuth and the profile row is read as that user (RLS applies),
 * so the browser can never supply its own role.
 */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSession> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("role, is_active, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;

    const claims = context.claims as unknown as Record<string, unknown>;
    const email = typeof claims["email"] === "string" ? (claims["email"] as string) : null;
    const mfa = await getAdminMfaState(context.supabase, context.claims);
    const { data: sessionAllowed, error: sessionError } = await context.supabase.rpc("admin_session_allowed");
    if (sessionError) throw sessionError;

    return {
      userId: context.userId,
      email,
      fullName: data?.full_name ?? null,
      hasProfile: Boolean(data),
      isAdmin: data?.role === "admin",
      isActive: data?.is_active === true,
      assuranceLevel: mfa.assuranceLevel,
      mfaEnrolled: mfa.enrolled,
      mfaSatisfied: mfa.satisfied,
      sessionAllowed: sessionAllowed === true,
    };
  });
