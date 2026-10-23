import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopy, useStore } from "@/lib/store-context";
import { isMerchantSurface } from "@/integrations/supabase/admin-client";
import { useNotificationClient } from "@/lib/notifications";
import { deletePushToken, enablePush, existingPushToken, isPushConfigured } from "@/lib/firebase-push";
import { disablePushToken, getPushRegistration, registerPushToken } from "@/lib/push.functions";
import { sendPushTest, syncPushDispatchEndpoint } from "@/lib/push-admin.functions";

/**
 * Phase 20 — browser push registration only.
 *
 * The permission prompt never opens on its own: it appears only after the
 * person presses "Enable notifications". Existing in-app notifications and the
 * bell are untouched; this card just stores the browser token so pushes can be
 * sent in a later step.
 */
export function PushNotificationCard() {
  const copy = useCopy();
  const { language } = useStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const audience = isMerchantSurface(pathname) ? "merchant" : "customer";
  const client = useNotificationClient();
  const register = useServerFn(registerPushToken);
  const disable = useServerFn(disablePushToken);
  const read = useServerFn(getPushRegistration);
  const syncEndpoint = useServerFn(syncPushDispatchEndpoint);
  const testPush = useServerFn(sendPushTest);

  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      if (!hasSession || !isPushConfigured()) return;
      // The shop workspace records the live address the database should call.
      if (audience === "merchant") {
        try {
          await syncEndpoint({});
        } catch {
          /* best effort; pushes simply stay queued until it succeeds */
        }
      }
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied") {
        setBlocked(true);
        return;
      }
      // Foreground pushes are shown by ForegroundPushListener in the app shell.
      // Token refresh: whenever permission is already granted we re-read the
      // current token and store it again, so a rotated token stays registered.
      const current = await existingPushToken();
      if (cancelled || !current) return;
      setToken(current);
      try {
        const state = await read({ data: { token: current } });
        if (cancelled) return;
        if (state.registered && state.enabled) {
          setEnabled(true);
          await register({ data: { token: current, audience, userAgent: navigator.userAgent, language } });
        }
      } catch {
        /* reading the registration is best-effort; the button still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, audience, language, read, register, syncEndpoint]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result.status === "registered" && result.token) {
        await register({ data: { token: result.token, audience, userAgent: navigator.userAgent, language } });
        setToken(result.token);
        setEnabled(true);
        toast.success(copy({ hi: "इस ब्राउज़र पर सूचनाएँ चालू हो गईं।", en: "Notifications are on for this browser." }));
        return;
      }
      if (result.status === "denied") {
        setBlocked(true);
        toast.error(
          copy({
            hi: "ब्राउज़र ने अनुमति नहीं दी। ब्राउज़र सेटिंग में इस साइट के लिए सूचनाएँ चालू करें।",
            en: "Permission was refused. Allow notifications for this site in your browser settings.",
          }),
        );
        return;
      }
      if (result.status === "open-in-new-tab") {
        toast.info(
          copy({
            hi: "अनुमति के लिए ऐप को नए टैब में खोलें।",
            en: "Open the app in its own tab to allow notifications.",
          }),
        );
        return;
      }
      if (result.status === "unsupported") {
        toast.error(copy({ hi: "यह ब्राउज़र पुश सूचनाएँ नहीं चला सकता।", en: "This browser cannot show push notifications." }));
        return;
      }
      toast.error(copy({ hi: "सूचनाएँ चालू नहीं हो सकीं। दोबारा कोशिश करें।", en: "Could not turn notifications on. Please try again." }));
    } finally {
      setBusy(false);
    }
  }, [audience, copy, language, register]);

  const onTest = useCallback(async () => {
    setBusy(true);
    try {
      const result = await testPush({ data: { audience } });
      if (result.sent > 0) {
        // Firebase accepted the push; whether Chrome showed it is decided on
        // the device itself and cannot be confirmed from the server.
        toast.success(
          copy({
            hi: `Firebase ने टेस्ट पुश स्वीकार किया (${result.sent} ब्राउज़र)। दिखना इस डिवाइस पर तय होता है — अगर सूचना न दिखे तो Chrome ने उसे दबा दिया है।`,
            en: `Firebase accepted the test push for ${result.sent} browser(s). Display is decided on the device — if no notification appeared, Chrome suppressed it.`,
          }),
        );
      } else {
        toast.error(copy({ hi: "टेस्ट सूचना नहीं भेजी जा सकी।", en: "The test notification could not be sent." }));
      }
    } catch {
      toast.error(copy({ hi: "टेस्ट सूचना नहीं भेजी जा सकी।", en: "The test notification could not be sent." }));
    } finally {
      setBusy(false);
    }
  }, [audience, copy, testPush]);

  const onDisable = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      await disable({ data: { token } });
      await deletePushToken();
      setEnabled(false);
      setToken(null);
      toast.success(copy({ hi: "इस ब्राउज़र पर सूचनाएँ बंद कर दी गईं।", en: "Notifications are off for this browser." }));
    } catch {
      toast.error(copy({ hi: "बंद नहीं हो सका। दोबारा कोशिश करें।", en: "Could not turn them off. Please try again." }));
    } finally {
      setBusy(false);
    }
  }, [copy, disable, token]);

  if (!signedIn || !isPushConfigured()) return null;

  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          {enabled ? <BellRing className="size-5" /> : <BellOff className="size-5" />}
        </span>
        <div className="min-w-[12rem] flex-1">
          <h3 className="font-display text-base font-semibold">
            {copy({ hi: "ब्राउज़र सूचनाएँ", en: "Browser notifications" })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {blocked
              ? copy({
                  hi: "इस ब्राउज़र में सूचनाएँ ब्लॉक हैं। साइट सेटिंग से अनुमति दें।",
                  en: "Notifications are blocked in this browser. Allow them in the site settings.",
                })
              : enabled
                ? copy({ hi: "यह ब्राउज़र सूचनाओं के लिए जुड़ा है।", en: "This browser is registered for notifications." })
                : copy({
                    hi: "इस ब्राउज़र पर ऑर्डर और भुगतान की सूचनाएँ पाएँ।",
                    en: "Get order and payment updates on this browser.",
                  })}
          </p>
        </div>
        {enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="rounded-full" disabled={busy} onClick={() => void onTest()}>
              {copy({ hi: "टेस्ट सूचना भेजें", en: "Send test notification" })}
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => void onDisable()}>
              {copy({ hi: "इस ब्राउज़र पर बंद करें", en: "Turn off for this browser" })}
            </Button>
          </div>
        ) : (
          <Button className="rounded-full" disabled={busy || blocked} onClick={() => void onEnable()}>
            {copy({ hi: "सूचनाएँ चालू करें", en: "Enable notifications" })}
          </Button>
        )}
      </div>
    </section>
  );
}
