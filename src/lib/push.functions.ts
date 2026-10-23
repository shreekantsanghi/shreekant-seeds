import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Web push registrations (infrastructure only — nothing sends a push yet).
 *
 * Every read and write runs as the signed-in user, so row-level security keeps
 * one person's browser registrations out of everyone else's list.
 */

const registerInput = z.object({
  token: z.string().min(20).max(4096),
  audience: z.enum(["customer", "merchant"]),
  userAgent: z.string().max(400).optional(),
  // The reading language is stored per browser so each push is written in the
  // language that browser is actually being used in.
  language: z.enum(["hi", "en"]).optional(),
});

const tokenInput = z.object({ token: z.string().min(20).max(4096) });

export type PushRegistrationState = { registered: boolean; enabled: boolean };

/** Is this browser's token already registered and switched on for the caller? */
export const getPushRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data, context }): Promise<PushRegistrationState> => {
    const { data: row, error } = await context.supabase
      .from("push_registrations")
      .select("enabled")
      .eq("user_id", context.userId)
      .eq("fcm_token", data.token)
      .maybeSingle();
    if (error) {
      console.error("[push] read failed", { message: error.message, code: error.code });
      throw new Error("PUSH_READ_FAILED");
    }
    return { registered: Boolean(row), enabled: Boolean(row?.enabled) };
  });

/** Store or refresh this browser's registration token and switch it on. */
export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => registerInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // (user_id, fcm_token) is unique, so a refreshed token inserts and a
    // repeated token updates the same row (and re-enables it) instead of
    // duplicating devices. The same browser can be registered for the
    // customer account and the merchant account — each row stays its own.
    const { error } = await context.supabase.from("push_registrations").upsert(
      {
        user_id: context.userId,
        fcm_token: data.token,
        audience: data.audience,
        user_agent: data.userAgent ?? null,
        language: data.language ?? "hi",
        enabled: true,
      } as never,
      { onConflict: "user_id,fcm_token" },
    );
    if (error) {
      console.error("[push] register failed", { message: error.message, code: error.code });
      throw new Error("PUSH_REGISTER_FAILED");
    }
    return { ok: true };
  });

/** Turn this browser off again; other devices of the same person stay untouched. */
export const disablePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("push_registrations")
      .delete()
      .eq("user_id", context.userId)
      .eq("fcm_token", data.token);
    if (error) {
      console.error("[push] disable failed", { message: error.message, code: error.code });
      throw new Error("PUSH_DISABLE_FAILED");
    }
    return { ok: true };
  });
