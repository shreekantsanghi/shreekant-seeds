/* Background web push worker. Configuration arrives in the registration query
   string because a service worker cannot read build-time env variables. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(Object.fromEntries(new URL(self.location).searchParams));
firebase.messaging();

// Clicks on notifications the page itself displayed while focused (background
// pushes shown by Firebase carry their own click handling via fcm_options).
self.addEventListener('notificationclick', (event) => {
  var data = event.notification && event.notification.data;
  if (data && data.FCM_MSG) return; // Firebase already handles its own clicks
  event.notification.close();
  var url = (data && data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
