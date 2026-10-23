import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  adminSupabase,
  isMerchantSurface,
} from "@/integrations/supabase/admin-client";

/**
 * Phase 11 — central in-app notifications.
 *
 * Notification rows are written only by the database (order, payment, delivery
 * and stock routines). The browser can read its own rows and mark them read;
 * it can never create or edit one. Row-level security scopes every read and
 * every realtime event to the signed-in user, so changing an id in the browser
 * reveals nothing.
 */

export type NotificationPriority = "action_required" | "important" | "normal";
export type NotificationCategory =
  | "order"
  | "payment"
  | "delivery"
  | "inventory"
  | "general";

export type AppNotification = {
  id: string;
  audience: "customer" | "merchant";
  notification_type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  order_id: string | null;
  product_id: string | null;
  action_url: string | null;
  action_label: string | null;
  is_read: boolean;
  requires_action: boolean;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
};

const PAGE_SIZE = 50;

type Row = Record<string, unknown>;
type PostgrestError = { message: string } | null;

type Builder = {
  select: (columns: string) => Builder;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => Builder;
  limit: (
    count: number,
  ) => Promise<{ data: Row[] | null; error: PostgrestError }>;
};

type LooseClient = {
  from: (table: string) => Builder;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: PostgrestError }>;
};

const loose = (client: unknown) => client as unknown as LooseClient;

/** Merchant pages use the merchant session; other pages use the customer session. */
export function useNotificationClient() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return isMerchantSurface(pathname) ? adminSupabase : supabase;
}

export const notificationsKey = ["notifications"] as const;

export function useNotifications() {
  const client = useNotificationClient();
  const queryClient = useQueryClient();

  const query = useQuery<AppNotification[]>({
    queryKey: [
      ...notificationsKey,
      client === adminSupabase ? "merchant" : "customer",
    ],
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: sessionData } = await client.auth.getSession();

      if (!sessionData.session) return [];

      const { data, error } = await loose(client)
        .from("notifications")
        .select(
          "id, audience, notification_type, category, priority, title, message, order_id, product_id, action_url, action_label, is_read, requires_action, created_at, read_at, metadata",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      return (data ?? []) as unknown as AppNotification[];
    },
  });

  useEffect(() => {
    let cancelled = false;
    let ownedChannel:
      | ReturnType<typeof client.channel>
      | undefined;

    void (async () => {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user.id;

      if (!userId || cancelled) return;

      const topic = `notifications:${userId}`;

      // Do not add callbacks to or subscribe again to an active channel.
      const existing = client.getChannels().find(
        (candidate) => candidate.topic === topic,
      );

      if (
        existing &&
        (existing.state === "joined" || existing.state === "joining")
      ) {
        return;
      }

      // Create and configure a channel only when no active channel exists.
      const channel = client
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_user_id=eq.${userId}`,
          },
          () => {
            void queryClient.invalidateQueries({
              queryKey: notificationsKey,
            });
          },
        );

      ownedChannel = channel;

      if (cancelled) {
        void client.removeChannel(channel);
        return;
      }

      channel.subscribe();
    })();

    return () => {
      cancelled = true;

      // Remove only the channel this effect created.
      if (ownedChannel) {
        void client.removeChannel(ownedChannel);
      }
    };
  }, [client, queryClient]);

  return query;
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();

  return data.reduce(
    (count, item) => count + (item.is_read ? 0 : 1),
    0,
  );
}

export function useMarkNotificationsRead() {
  const client = useNotificationClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return 0;

      const { error } = await loose(client).rpc(
        "mark_notifications_read",
        { p_ids: ids },
      );

      if (error) throw error;

      return ids.length;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: notificationsKey,
      }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useNotificationClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await loose(client).rpc(
        "mark_all_notifications_read",
        {},
      );

      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: notificationsKey,
      }),
  });
}

/** Short relative time, bilingual-safe (numbers + a unit word chosen by caller copy). */
export function relativeTime(
  iso: string,
  language: "hi" | "en",
): string {
  const then = new Date(iso).getTime();
  const minutes = Math.max(
    0,
    Math.round((Date.now() - then) / 60000),
  );

  if (minutes < 1) {
    return language === "hi" ? "अभी" : "just now";
  }

  if (minutes < 60) {
    return language === "hi"
      ? `${minutes} मिनट पहले`
      : `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return language === "hi"
      ? `${hours} घंटे पहले`
      : `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 30) {
    return language === "hi"
      ? `${days} दिन पहले`
      : `${days}d ago`;
  }

  return new Date(iso).toLocaleDateString(
    language === "hi" ? "hi-IN" : "en-IN",
  );
}