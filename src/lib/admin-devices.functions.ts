import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminDeviceSession = {
  sessionId: string;
  createdAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ip: string | null;
  isCurrent: boolean;
  withinLimit: boolean;
};

/**
 * Lists the merchant's own signed-in devices. The database function enforces
 * admin + allowed-session checks and never returns tokens.
 */
export const listAdminDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDeviceSession[]> => {
    const { data, error } = await context.supabase.rpc("admin_list_sessions");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      sessionId: row.session_id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      userAgent: row.user_agent,
      ip: row.ip,
      isCurrent: row.is_current,
      withinLimit: row.within_limit,
    }));
  });

/**
 * Signs out one other device (sessionId) or every other device (null).
 * The current device can never be revoked here; the database enforces that,
 * requires two-step verification, and writes an audit log entry.
 */
export const revokeAdminDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ sessionId: z.string().uuid().nullable() }).parse(data))
  .handler(async ({ data, context }): Promise<{ revoked: number }> => {
    const { data: count, error } = await context.supabase.rpc("admin_revoke_sessions", {
      // NULL means "all other devices"; the generated type only models the single-device case.
      p_session_id: data.sessionId as string,
    });
    if (error) throw error;
    return { revoked: typeof count === "number" ? count : 0 };
  });
