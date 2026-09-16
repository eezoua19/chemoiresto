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
      data: payload.url ? { url: payload.url } : undefined,
    })
  );
});

/**
 * Un clic sur la notification ramène au poste déjà ouvert, sinon en ouvre un.
 * Notification du personnel (pas d'URL ciblée) : n'importe quel onglet ouvert
 * convient, on ne le redirige pas. Notification client (data.url = jeton de
 * suivi) : on cible cette page précise - un onglet déjà dessus est focus tel
 * quel, un autre onglet ouvert y est redirigé, sinon on en ouvre un nouveau.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      if (!url) {
        const existing = clientsList.find((client) => 'focus' in client);
        return existing ? existing.focus() : self.clients.openWindow('/');
      }

      const exact = clientsList.find((client) => new URL(client.url).pathname === url);
      if (exact) return exact.focus();

      const any = clientsList.find((client) => 'navigate' in client);
      if (any) return any.focus().then(() => any.navigate(url));

      return self.clients.openWindow(url);
    })
  );
});
