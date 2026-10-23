import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminSupabase } from "@/integrations/supabase/admin-client";
import { listenForegroundPush } from "@/lib/firebase-push";

/**
 * Shows pushes that arrive while the site tab is focused, no matter which page
 * the signed-in person is on. Lives in the app shell so it stays active across
 * every route and unmounts (stops listening) when the session ends.
 *
 * Customer and merchant sessions are checked independently; the listener
 * itself only displays what Firebase already scoped to this browser's token,
 * so recipients stay isolated.
 */
export function ForegroundPushListener() {
  useEffect(() => {
    let stop: (() => void) | null = null;
    let listening = false;
    let cancelled = false;

    const sync = async () => {
      const [customer, merchant] = await Promise.all([
        supabase.auth.getSession(),
        adminSupabase.auth.getSession(),
      ]);
      if (cancelled) return;
      const signedIn = Boolean(customer.data.session || merchant.data.session);
      if (signedIn && !listening) {
        listening = true;
        stop = await listenForegroundPush();
        if (cancelled) stop();
        return;
      }
      if (!signedIn && listening) {
        listening = false;
        stop?.();
        stop = null;
      }
    };

    void sync();
    const customerSub = supabase.auth.onAuthStateChange(() => void sync());
    const merchantSub = adminSupabase.auth.onAuthStateChange(() => void sync());
    return () => {
      cancelled = true;
      customerSub.data.subscription.unsubscribe();
      merchantSub.data.subscription.unsubscribe();
      stop?.();
    };
  }, []);

  return null;
}
