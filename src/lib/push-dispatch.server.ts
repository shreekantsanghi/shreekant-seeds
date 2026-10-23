/**
 * Server-only web push dispatcher.
 *
 * Drains the push_outbox queue that the notifications table fills, and sends
 * one Firebase Cloud Messaging message per enabled browser registration.
 *
 * Guarantees:
 * - one push per notification per browser (push_deliveries is unique on
 *   (outbox_id, registration_id)), so retried webhooks never double-send;
 * - the Firebase service credential stays server-side: messages are sent
 *   directly to Firebase Cloud Messaging using Google OAuth access tokens;
 * - a failure here never propagates: callers always answer 200 so the in-app
 *   notification and the business operation continue untouched.
 */

import { pushCopy, type PushLanguage } from "./push-content";

import { FcmConfigError, clearFcmAuthCache, getFcmAuth, type FcmAuth } from "./fcm.server";

const FCM_URL = "https://fcm.googleapis.com/v1/projects";

async function resolveFcmAuth(): Promise<{ auth: FcmAuth } | { error: string }> {
  try {
    return { auth: await getFcmAuth() };
  } catch (error) {
    const reason = error instanceof FcmConfigError ? error.message : "FCM authentication failed";
    console.error(`[push] ${reason}`);
    return { error: reason };
  }
}

type OutboxJob = {
  id: string;
  notification_id: string;
  recipient_user_id: string;
  audience: string;
  notification_type: string;
  urgent: boolean;
};

type Registration = {
  id: string;
  fcm_token: string;
  language: string | null;
};

type LooseResult<T> = { data: T | null; error: { message: string } | null };
type LooseClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<LooseResult<unknown>>;
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type DispatchSummary = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  prunedTokens: number;
};

/** Reads the configured site origin so deep links are absolute. */
function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

type SendOutcome = "sent" | "invalid" | "failed";

async function sendOne(args: {
  token: string;
  title: string;
  body: string;
  link: string | null;
  path: string | null;
  urgent: boolean;
  notificationId: string;
  notificationType: string;
  /** Test pushes only: one stable tag + renotify so repeated tests alert again. */
  stableTestTag?: boolean;
  auth: FcmAuth;
}): Promise<{ outcome: SendOutcome; error?: string }> {
  const message: Record<string, unknown> = {
    token: args.token,
    notification: { title: args.title, body: args.body },
    data: {
      path: args.path ?? "/",
      notification_id: args.notificationId,
      type: args.notificationType,
      priority: args.urgent ? "urgent" : "normal",
    },
    webpush: {
      headers: { Urgency: args.urgent ? "high" : "normal", TTL: args.urgent ? "3600" : "86400" },
      notification: {
        // One visible entry per notification, so a repeated delivery replaces
        // rather than stacks. Test pushes share one stable tag with renotify
        // so every repeated test is alerted again.
        ...(args.stableTestTag ? { tag: "test-push", renotify: true } : { tag: args.notificationId }),
        requireInteraction: args.urgent,
      },
      ...(args.link ? { fcm_options: { link: args.link } } : {}),
    },
  };

  let response: Response;
  try {
    response = await fetch(`${FCM_URL}/${encodeURIComponent(args.auth.projectId)}/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
  } catch (error) {
    return { outcome: "failed", error: error instanceof Error ? error.message : "network error" };
  }

  if (response.ok) return { outcome: "sent" };

  const text = await response.text();
  console.error(`[push] FCM send failed [${response.status}]: ${text}`);
  // Authentication/configuration problems (bad token, wrong project, missing
  // permission) are never treated as dead device tokens — nothing is pruned.
  if (response.status === 401 || response.status === 403) {
    if (response.status === 401) clearFcmAuthCache();
    return { outcome: "failed", error: `${response.status}: FCM authentication or permission error` };
  }
  // A token that Firebase no longer recognises is dead — prune it.
  const unregistered =
    (response.status === 404 && !/project/i.test(text)) ||
    (response.status === 400 && /INVALID_ARGUMENT/i.test(text) && /token/i.test(text)) ||
    /UNREGISTERED/i.test(text);
  return { outcome: unregistered ? "invalid" : "failed", error: `${response.status}: ${text.slice(0, 300)}` };
}

export async function dispatchQueuedPushes(limit = 20): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, prunedTokens: 0 };

  // Resolved before claiming, so a configuration problem leaves the queue untouched.
  const resolved = await resolveFcmAuth();
  if ("error" in resolved) return summary;
  const auth = resolved.auth;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as LooseClient;

  const config = await db.from("push_dispatch_config").select("endpoint_url, preview_endpoint_url").maybeSingle();
  const siteOrigin = originOf(config.data?.endpoint_url) ?? originOf(config.data?.preview_endpoint_url);

  const claimed = (await db.rpc("claim_push_batch", { p_limit: limit })) as LooseResult<OutboxJob[]>;
  if (claimed.error) {
    console.error("[push] claim failed", claimed.error.message);
    return summary;
  }
  const jobs = claimed.data ?? [];
  summary.claimed = jobs.length;

  for (const job of jobs) {
    try {
      const notification = await db
        .from("notifications")
        .select("id, order_id, product_id, action_url, metadata")
        .eq("id", job.notification_id)
        .maybeSingle();

      if (notification.error || !notification.data) {
        await db
          .from("push_outbox")
          .update({ status: "skipped", last_error: "notification missing", updated_at: new Date().toISOString() })
          .eq("id", job.id);
        summary.skipped += 1;
        continue;
      }

      // Facts come from real rows only.
      let orderNumber: string | null = null;
      if (notification.data.order_id) {
        const order = await db
          .from("orders")
          .select("order_number")
          .eq("id", notification.data.order_id)
          .maybeSingle();
        orderNumber = order.data?.order_number ?? null;
      }
      let productName: string | null =
        (notification.data.metadata as Record<string, unknown> | null)?.["product_name"] as string | null ?? null;
      if (!productName && notification.data.product_id) {
        const product = await db.from("products").select("name").eq("id", notification.data.product_id).maybeSingle();
        productName = product.data?.name ?? null;
      }

      const registrations = await db
        .from("push_registrations")
        .select("id, fcm_token, language")
        .eq("user_id", job.recipient_user_id)
        .eq("audience", job.audience)
        .eq("enabled", true);

      const devices = (registrations.data ?? []) as Registration[];
      if (!devices.length) {
        await db
          .from("push_outbox")
          .update({ status: "skipped", last_error: "no enabled registrations", updated_at: new Date().toISOString() })
          .eq("id", job.id);
        summary.skipped += 1;
        continue;
      }

      const path = notification.data.action_url ?? null;
      const link = siteOrigin && path ? `${siteOrigin}${path}` : null;

      let anySent = false;
      let lastError: string | null = null;

      for (const device of devices) {
        // Per-device dedupe: claiming the slot first means a retry of the same
        // job can never send the same notification to the same browser twice.
        const claim = await db
          .from("push_deliveries")
          .insert({ outbox_id: job.id, registration_id: device.id, status: "sent" });
        if (claim.error) {
          // Unique violation = already delivered to this browser.
          continue;
        }

        const language: PushLanguage = device.language === "en" ? "en" : "hi";
        const copy = pushCopy(job.audience, job.notification_type, language, { orderNumber, productName });
        if (!copy) {
          await db
            .from("push_deliveries")
            .update({ status: "failed", error: "no copy for event" })
            .eq("outbox_id", job.id)
            .eq("registration_id", device.id);
          lastError = "no copy for event";
          continue;
        }

        const result = await sendOne({
          token: device.fcm_token,
          title: copy.title,
          body: copy.body,
          link,
          path,
          urgent: job.urgent,
          notificationId: job.notification_id,
          notificationType: job.notification_type,
          auth,
        });

        if (result.outcome === "sent") {
          anySent = true;
          continue;
        }

        lastError = result.error ?? result.outcome;
        await db
          .from("push_deliveries")
          .update({ status: result.outcome === "invalid" ? "invalid" : "failed", error: lastError })
          .eq("outbox_id", job.id)
          .eq("registration_id", device.id);

        if (result.outcome === "invalid") {
          await db.from("push_registrations").delete().eq("id", device.id);
          summary.prunedTokens += 1;
        }
      }

      if (anySent) {
        await db
          .from("push_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: lastError })
          .eq("id", job.id);
        summary.sent += 1;
      } else {
        // Left as failed; attempts < 5 rows can be re-queued deliberately.
        await db
          .from("push_outbox")
          .update({ status: "failed", last_error: lastError ?? "no device accepted the push", updated_at: new Date().toISOString() })
          .eq("id", job.id);
        summary.failed += 1;
      }
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error("[push] job failed", { job: job.id, message });
      await db
        .from("push_outbox")
        .update({ status: "failed", last_error: message, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    }
  }

  return summary;
}

/** One-off send used by the merchant "send a test notification" action. */
export async function sendTestPush(userId: string, audience: "customer" | "merchant") {
  const resolved = await resolveFcmAuth();
  if ("error" in resolved) return { devices: 0, sent: 0, error: resolved.error };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as LooseClient;

  const registrations = await db
    .from("push_registrations")
    .select("id, fcm_token, language")
    .eq("user_id", userId)
    .eq("audience", audience)
    .eq("enabled", true);

  const devices = (registrations.data ?? []) as Registration[];
  let sent = 0;
  let error: string | null = null;

  for (const device of devices) {
    const hindi = device.language !== "en";
    const result = await sendOne({
      token: device.fcm_token,
      title: hindi ? "टेस्ट सूचना" : "Test notification",
      body: hindi ? "ब्राउज़र सूचनाएँ सही काम कर रही हैं।" : "Browser notifications are working.",
      link: null,
      path: audience === "merchant" ? "/admin/notifications" : "/notifications",
      urgent: false,
      notificationId: `test-${Date.now()}`,
      notificationType: "test",
      stableTestTag: true,
      auth: resolved.auth,
    });
    if (result.outcome === "sent") sent += 1;
    else {
      error = result.error ?? result.outcome;
      if (result.outcome === "invalid") await db.from("push_registrations").delete().eq("id", device.id);
    }
  }

  return { devices: devices.length, sent, error };
}
