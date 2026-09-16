/**
 * Service worker minimal : uniquement les notifications push.
 * Pas de mise en cache, pas de mode hors-ligne - le but est de recevoir les
 * alertes du personnel meme onglet fermé, rien d'autre.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'CHEMOIRESTO', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'CHEMOIRESTO', {
      body: payload.body || '',
      tag: 'chemoiresto-notification',
      renotify: true,
    })
  );
});

/** Un clic sur la notification ramène au poste déjà ouvert, sinon en ouvre un. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
