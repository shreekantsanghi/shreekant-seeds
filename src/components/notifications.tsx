import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCopy, useStore } from "@/lib/store-context";
import { PushNotificationCard } from "@/components/push-notifications";
import { cn } from "@/lib/utils";
import {
  relativeTime,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
  type AppNotification,
  type NotificationCategory,
} from "@/lib/notifications";
import { localizeNotification } from "@/lib/notification-copy";

/**
 * Phase 11 — shared notification UI for both the storefront header and the
 * merchant workspace. Which notifications appear is decided entirely by
 * row-level security on the signed-in session, not by anything in this file.
 */

/** Action links carry a server-built path; the router resolves it at runtime. */
type ToPath = "/notifications";

const PRIORITY_STYLE: Record<AppNotification["priority"], string> = {
  action_required: "bg-destructive/10 text-destructive ring-destructive/25",
  important: "bg-accent/15 text-accent-strong ring-accent/30",
  normal: "bg-muted text-muted-foreground ring-border",
};

function PriorityTag({ priority }: { priority: AppNotification["priority"] }) {
  const copy = useCopy();
  const label =
    priority === "action_required"
      ? copy({ hi: "कार्रवाई ज़रूरी", en: "Action required" })
      : priority === "important"
        ? copy({ hi: "ज़रूरी", en: "Important" })
        : copy({ hi: "सूचना", en: "Normal" });
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", PRIORITY_STYLE[priority])}>
      {label}
    </span>
  );
}

function ActionLink({
  item,
  label,
  onNavigate,
}: {
  item: AppNotification;
  label: string | null;
  onNavigate?: (() => void) | undefined;
}) {
  if (!item.action_url || !label) return null;
  return (
    <Button asChild size="sm" variant={item.requires_action ? "default" : "outline"} className="mt-2 rounded-full">
      <Link to={item.action_url as ToPath} onClick={onNavigate}>
        {label}
      </Link>
    </Button>
  );
}

function NotificationRow({
  item,
  compact = false,
  onNavigate,
}: {
  item: AppNotification;
  compact?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const copy = useCopy();
  const { language } = useStore();
  const markRead = useMarkNotificationsRead();
  const text = localizeNotification(item, language);
  return (
    <article
      className={cn(
        "border-b border-border px-4 py-3 last:border-b-0",
        !item.is_read && "bg-primary/[0.04]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PriorityTag priority={item.priority} />
        {!item.is_read && <span className="size-2 rounded-full bg-accent" aria-label={copy({ hi: "नया", en: "Unread" })} />}
        <span className="ml-auto text-xs text-muted-foreground">{relativeTime(item.created_at, language)}</span>
      </div>
      <h3 className={cn("mt-1.5 font-semibold", compact ? "text-sm" : "text-base")}>{text.title}</h3>
      <p className={cn("mt-0.5 text-muted-foreground", compact ? "line-clamp-2 text-xs" : "text-sm")}>{text.message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ActionLink item={item} label={text.actionLabel} onNavigate={onNavigate} />
        {!item.is_read && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 rounded-full text-xs"
            onClick={() => markRead.mutate([item.id])}
          >
            {copy({ hi: "पढ़ा हुआ चिह्नित करें", en: "Mark as read" })}
          </Button>
        )}
      </div>
    </article>
  );
}

/** Header bell with unread badge and a compact dropdown. */
export function NotificationBell({ allTo = "/notifications" }: { allTo?: string }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useNotifications();
  const unread = useUnreadCount();
  const markAll = useMarkAllNotificationsRead();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const recent = data.slice(0, 6);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={copy({ hi: "सूचनाएँ", en: "Notifications" })}
        className="relative grid size-11 place-items-center rounded-full hover:bg-primary/8"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-88 sm:max-w-[22rem]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="font-display text-lg font-semibold">{copy({ hi: "सूचनाएँ", en: "Notifications" })}</h2>
            {unread > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto rounded-full text-xs"
                onClick={() => markAll.mutate()}
              >
                <CheckCheck className="size-4" />
                {copy({ hi: "सब पढ़ा हुआ", en: "Mark all as read" })}
              </Button>
            )}
          </div>
          {isLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
          ) : recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {copy({ hi: "अभी कोई सूचना नहीं है।", en: "No notifications yet." })}
            </p>
          ) : (
            recent.map((item) => (
              <NotificationRow key={item.id} item={item} compact onNavigate={() => setOpen(false)} />
            ))
          )}
          <div className="border-t border-border p-3">
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to={allTo as ToPath} onClick={() => setOpen(false)}>
                {copy({ hi: "सभी सूचनाएँ देखें", en: "View all notifications" })}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const FILTERS: { key: string; hi: string; en: string; match: (item: AppNotification) => boolean }[] = [
  { key: "all", hi: "सभी", en: "All", match: () => true },
  { key: "action", hi: "कार्रवाई ज़रूरी", en: "Action required", match: (i) => i.priority === "action_required" },
  ...(["order", "payment", "delivery", "inventory"] as const).map((category) => ({
    key: category as string,
    hi: { order: "ऑर्डर", payment: "भुगतान", delivery: "डिलीवरी", inventory: "स्टॉक" }[category],
    en: { order: "Orders", payment: "Payments", delivery: "Delivery", inventory: "Inventory" }[category],
    match: (item: AppNotification) => item.category === (category as NotificationCategory),
  })),
];

/** Full notification centre, used by both /notifications and /admin/notifications. */
export function NotificationCenter() {
  const copy = useCopy();
  const [filter, setFilter] = useState("all");
  const { data = [], isLoading, isError } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const active = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0]!;
  const rows = data.filter(active.match);
  const unread = data.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl font-semibold">{copy({ hi: "सूचनाएँ", en: "Notifications" })}</h1>
        {unread > 0 && (
          <Button variant="outline" size="sm" className="ml-auto rounded-full" onClick={() => markAll.mutate()}>
            <CheckCheck className="size-4" />
            {copy({ hi: "सब पढ़ा हुआ चिह्नित करें", en: "Mark all as read" })}
          </Button>
        )}
      </div>

      <PushNotificationCard />

      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={entry.key === filter}
            onClick={() => setFilter(entry.key)}
            className={cn(
              "min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-border",
              entry.key === filter ? "bg-primary text-primary-foreground ring-primary" : "bg-surface text-foreground/75",
            )}
          >
            {copy({ hi: entry.hi, en: entry.en })}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-lg bg-card ring-1 ring-border">
        {isLoading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
        ) : isError ? (
          <p className="px-4 py-8 text-sm text-destructive">
            {copy({ hi: "सूचनाएँ लोड नहीं हो सकीं।", en: "Notifications could not be loaded." })}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            {copy({ hi: "इस श्रेणी में कोई सूचना नहीं है।", en: "No notifications in this list." })}
          </p>
        ) : (
          rows.map((item) => <NotificationRow key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}
