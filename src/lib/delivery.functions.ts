import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-catalog.functions";
import type { Database } from "@/integrations/supabase/types";

/**
 * Phase 9 — QR + delivery code confirmation.
 *
 * All authority lives in two database routines:
 *  - issue_delivery_credentials: admin only, never called automatically on render
 *  - confirm_delivery: public (the delivery person has no account), atomic,
 *    attempt-limited, one-time, and returns nothing about the order
 *
 * Only hashes are stored, so the plaintext token and code exist exactly once:
 * in the response of an explicit merchant issue/reissue action.
 */

export type IssuedDeliveryCredentials =
  | { issued: boolean; token: string; code: string; pin: string; expiresAt: string }
  | { error: string };

export const issueDeliveryCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), reissue: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<IssuedDeliveryCredentials> => {
    await assertAdmin(context);

    const { data: rows, error } = await context.supabase.rpc("issue_delivery_credentials", {
      p_order_id: data.orderId,
      p_reissue: data.reissue ?? false,
    });
    if (error) {
      const known = ISSUE_ERROR_CODES.find((code) => error.message.includes(code));
      return { error: known ?? "UNKNOWN" };
    }
    const row = (rows ?? [])[0];
    if (!row) return { error: "UNKNOWN" };
    return { issued: row.issued, token: row.token, code: row.code, pin: row.pin, expiresAt: row.expires_at };
  });

const ISSUE_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "FORBIDDEN",
  "ORDER_NOT_FOUND",
  "PAYMENT_NOT_CONFIRMED",
  "INVENTORY_NOT_FULFILLED",
  "ORDER_NOT_OUT_FOR_DELIVERY",
  "DELIVERY_ALREADY_CONFIRMED",
  "CREDENTIAL_NOT_ISSUED",
  "CREDENTIAL_LOCKED",
  "CREDENTIAL_EXPIRED",
];

export type MyDeliveryCredentials = { token: string; code: string; expiresAt: string } | { error: string };

/**
 * Customer-side read of the shop's active credential. The database routine
 * reproduces the same token and code from a server-only secret, so refreshing
 * the page never replaces the QR, resets attempts or extends the expiry.
 */
export const getMyDeliveryCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<MyDeliveryCredentials> => {
    const { data: rows, error } = await context.supabase.rpc("get_my_delivery_credentials", {
      p_order_id: data.orderId,
    });
    if (error) {
      const known = ISSUE_ERROR_CODES.find((code) => error.message.includes(code));
      return { error: known ?? "UNKNOWN" };
    }
    const row = (rows ?? [])[0];
    if (!row) return { error: "UNKNOWN" };
    return { token: row.token, code: row.code, expiresAt: row.expires_at };
  });

/**
 * Lightweight per-instance throttle for the public endpoint. The real
 * protection is the database's 5-attempt lock; this only slows down a flood.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 500) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export type ConfirmDeliveryResult = { ok: boolean; reason: string };

/**
 * Public: the delivery person scans the QR and enters their own PIN, the
 * customer gives the delivery code. All three secrets are required, so neither
 * the customer nor the delivery person can complete a delivery alone.
 * Returns only a generic outcome — never any order or customer information.
 */
export const confirmDelivery = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(16).max(128),
        pin: z.string().regex(/^[0-9]{6}$/),
        code: z.string().regex(/^[0-9]{6}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ConfirmDeliveryResult> => {
    const ip = getRequestHeader("x-forwarded-for") ?? getRequestHeader("cf-connecting-ip") ?? "unknown";
    if (throttled(ip)) return { ok: false, reason: "RATE_LIMITED" };

    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabasePublic = createClient<Database>(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: rows, error } = await supabasePublic.rpc("confirm_delivery", {
      p_token: data.token,
      p_pin: data.pin,
      p_code: data.code,
    });
    if (error) return { ok: false, reason: "INVALID" };
    const row = (rows ?? [])[0];
    return { ok: Boolean(row?.ok), reason: row?.reason ?? "INVALID" };
  });

export type DeliveryPrintData =
  | {
      orderNumber: string;
      token: string;
      expiresAt: string;
      address: import("@/lib/orders-shared").OrderAddressSnapshot | null;
    }
  | { error: string };

/**
 * Merchant-only data for the "Print QR & Address" sheet. Reuses the existing
 * issue_delivery_credentials routine without reissue, so it returns the
 * current active QR token (the same one the panel shows). The PIN and the
 * customer code are dropped here and never reach the browser.
 * The address is the snapshot stored on the order, not the saved address.
 */
export const getDeliveryPrintData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DeliveryPrintData> => {
    await assertAdmin(context);

    const { data: order, error: orderError } = await context.supabase
      .from("orders")
      .select("order_number, status, delivery_address")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderError || !order) return { error: "ORDER_NOT_FOUND" };
    if (order.status !== "out_for_delivery") return { error: "ORDER_NOT_OUT_FOR_DELIVERY" };

    const { data: rows, error } = await context.supabase.rpc("issue_delivery_credentials", {
      p_order_id: data.orderId,
      p_reissue: false,
    });
    if (error) {
      const known = ISSUE_ERROR_CODES.find((code) => error.message.includes(code));
      return { error: known ?? "UNKNOWN" };
    }
    const row = (rows ?? [])[0];
    if (!row?.token) return { error: "UNKNOWN" };
    return {
      orderNumber: order.order_number,
      token: row.token,
      expiresAt: row.expires_at,
      address: (order.delivery_address as import("@/lib/orders-shared").OrderAddressSnapshot | null) ?? null,
    };
  });
