/**
 * Browser side of web push.
 *
 * Only the public Firebase web values (API key, project, app id, VAPID key)
 * are used here — they come from the connected Firebase Cloud Messaging
 * connector. The Firebase service-account credential is server-only and never
 * touches this file.
 */

const appId = import.meta.env['VITE_FIREBASE_MESSAGING_APP_ID'] as string | undefined;
const vapidKey = import.meta.env['VITE_FIREBASE_MESSAGING_VAPID_KEY'] as string | undefined;

const firebaseConfig = {
  apiKey: import.meta.env['VITE_FIREBASE_MESSAGING_WEB_API_KEY'] as string | undefined,
  projectId: import.meta.env['VITE_FIREBASE_MESSAGING_PROJECT_ID'] as string | undefined,
  appId,
  // Not published as its own variable: it is the segment after "1:" in the app id.
  messagingSenderId: appId?.split(':')[1] ?? '',
};

export type PushStatus =
  | 'registered'
  | 'not-configured'
  | 'unsupported'
  | 'open-in-new-tab'
  | 'denied'
  | 'failed';

export type PushResult = { status: PushStatus; token?: string };

export function isPushConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && appId && vapidKey && firebaseConfig.messagingSenderId);
}

async function messagingHandles() {
  const [{ initializeApp, getApps, getApp }, { getMessaging, getToken, deleteToken, isSupported }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  return { messaging: getMessaging(app), getToken, deleteToken, isSupported };
}

function localChecks(): PushStatus | null {
  if (!isPushConfigured()) return 'not-configured';
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  // Browsers may reject notification permission requests inside cross-origin
  // iframes, so ask users to open the site in a new tab.
  if (window.top !== window.self) return 'open-in-new-tab';
  return null;
}

/** Resolves once this registration has an active worker (first install can take a moment). */
async function waitForActive(registration: ServiceWorkerRegistration, timeoutMs = 10000): Promise<void> {
  if (registration.active) return;
  const worker = registration.installing ?? registration.waiting;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const done = () => { clearTimeout(timer); resolve(); };
    if (!worker) { done(); return; }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || registration.active) done();
    });
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function currentToken(): Promise<string | null> {
  const { messaging, getToken, isSupported } = await messagingHandles();
  if (!(await isSupported())) return null;
  const query = new URLSearchParams(firebaseConfig as Record<string, string>).toString();
  const serviceWorkerRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  // On a first-time setup the worker is still installing; requesting a token
  // before it is active is what made the very first click fail.
  await waitForActive(serviceWorkerRegistration);
  try {
    return (await getToken(messaging, { vapidKey: vapidKey!, serviceWorkerRegistration })) || null;
  } catch (error) {
    // One short retry covers the push-subscription race right after activation.
    console.warn('[push] first token request failed, retrying once', error);
    await delay(1500);
    return (await getToken(messaging, { vapidKey: vapidKey!, serviceWorkerRegistration })) || null;
  }
}

/** Called from a click handler: browsers ignore permission requests without a user gesture. */
export async function enablePush(): Promise<PushResult> {
  const blocked = localChecks();
  if (blocked) return { status: blocked };
  try {
    // Ask for permission first, while the click's user gesture is still valid
    // (loading Firebase first can expire it on some browsers).
    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return { status: 'denied' };
    const { isSupported } = await messagingHandles();
    if (!(await isSupported())) return { status: 'unsupported' };
    const token = await currentToken();
    return token ? { status: 'registered', token } : { status: 'failed' };
  } catch (error) {
    console.error('[push] enable failed', error);
    return { status: 'failed' };
  }
}

/** Silent refresh: returns the current token only when permission is already granted. */
export async function existingPushToken(): Promise<string | null> {
  if (localChecks()) return null;
  if (Notification.permission !== 'granted') return null;
  try {
    return await currentToken();
  } catch (error) {
    console.error('[push] token refresh failed', error);
    return null;
  }
}

/**
 * Foreground messages: FCM only displays pushes automatically while the tab is
 * in the background. While the site tab is focused, this listener shows the
 * same payload through the already-registered service worker instead. The
 * background worker does not fire for a focused tab, so each push is shown
 * exactly once; the shared tag collapses any accidental overlap. Clicking a
 * foreground notification is handled by the worker's notificationclick event.
 */
export async function listenForegroundPush(): Promise<() => void> {
  const noop = () => {};
  if (localChecks()) return noop;
  if (Notification.permission !== 'granted') return noop;
  try {
    const { messaging, isSupported } = await messagingHandles();
    if (!(await isSupported())) return noop;
    const { onMessage } = await import('firebase/messaging');
    const query = new URLSearchParams(firebaseConfig as Record<string, string>).toString();
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
    return onMessage(messaging, (payload) => {
      const title = payload.notification?.title;
      const body = payload.notification?.body ?? '';
      if (!title) return;
      const data = (payload.data ?? {}) as Record<string, string>;
      // Test pushes share one stable tag with renotify, so a repeated test
      // replaces the previous entry and Chrome alerts again. Real transactional
      // pushes keep their per-notification tag behaviour exactly as before.
      const isTest = data['type'] === 'test';
      void registration
        .showNotification(title, {
          body,
          ...(isTest
            ? { tag: 'test-push', renotify: true }
            : { tag: data['notification_id'] ?? '' }),
          requireInteraction: data['priority'] === 'urgent',
          data: { url: data['path'] || '/' },
        })
        .catch((error) => console.error('[push] foreground display failed', error));
    });
  } catch (error) {
    console.error('[push] foreground listener failed', error);
    return noop;
  }
}

/** Removes this browser's token from Firebase so it stops being targetable. */
export async function deletePushToken(): Promise<void> {
  if (localChecks()) return;
  try {
    const { messaging, deleteToken, isSupported } = await messagingHandles();
    if (!(await isSupported())) return;
    await deleteToken(messaging);
  } catch (error) {
    console.error('[push] delete failed', error);
  }
}
