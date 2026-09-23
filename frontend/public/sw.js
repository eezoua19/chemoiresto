/**
 * Service worker : notifications push et carte consultable hors connexion.
 *
 * La carte est servie réseau d'abord : une rupture de stock ou un prix qui
 * vient de changer doit toujours primer sur ce qui est en mémoire. Le cache
 * n'intervient que si le réseau ne répond pas dans le délai ci-dessous, ce qui
 * permet à un client sous un réseau instable de continuer à lire le menu.
 */

const VERSION = 'v1';
const CACHE_COQUILLE = `chemoiresto-coquille-${VERSION}`;
const CACHE_CARTE = `chemoiresto-carte-${VERSION}`;
const CACHE_ASSETS = `chemoiresto-assets-${VERSION}`;
const CACHE_IMAGES = `chemoiresto-images-${VERSION}`;
const CACHES_ACTUELS = [CACHE_COQUILLE, CACHE_CARTE, CACHE_ASSETS, CACHE_IMAGES];

/** Au-delà, on considère le réseau perdu et on sert ce qu'on a sous la main. */
const DELAI_RESEAU_MS = 3500;

/** Les photos de plats sont lourdes : on en garde un nombre fini. */
const MAX_IMAGES = 60;

/**
 * Chaque mise en ligne apporte un nouveau jeu de fichiers, sous de nouveaux
 * noms. On plafonne pour que les anciens finissent par sortir - d'où un cache
 * à part : dans celui de la coquille, le plafond aurait chassé « / », entrée
 * la plus ancienne et pourtant la seule indispensable hors connexion.
 */
const MAX_ASSETS = 80;

/**
 * Seules ces deux routes sont mises en cache. Le « $» final est essentiel :
 * les sous-routes (/orders, /service-requests) portent l'état en direct de la
 * table et ne doivent jamais être servies depuis la mémoire.
 */
const ROUTE_CARTE = /^\/api\/menu\/(table|emporter)\/[^/]+$/;

self.addEventListener('install', (event) => {
  // La coquille de l'application suffit à afficher la page hors connexion :
  // le routage se fait ensuite côté navigateur.
  event.waitUntil(
    caches
      .open(CACHE_COQUILLE)
      .then((cache) => cache.add('/'))
      .catch(() => {
        // Première visite hors connexion : rien à mettre de côté, tant pis.
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((nom) => nom.startsWith('chemoiresto-') && !CACHES_ACTUELS.includes(nom))
            .map((nom) => caches.delete(nom))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Passer une commande, appeler une serveuse : rien de tout cela ne se
  // rejoue depuis un cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (ROUTE_CARTE.test(url.pathname)) {
    event.respondWith(reseauPuisCache(request, CACHE_CARTE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }

  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(cacheDabord(request, CACHE_IMAGES, MAX_IMAGES));
    return;
  }

  // Les fichiers produits par le build portent une empreinte dans leur nom :
  // un contenu différent a toujours une autre URL, le cache ne périme pas.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheDabord(request, CACHE_ASSETS, MAX_ASSETS));
  }
});

/** Laisse au réseau le temps imparti, puis se rabat sur la dernière copie. */
async function reseauPuisCache(request, nomCache) {
  const cache = await caches.open(nomCache);

  const reseau = fetch(request).then((reponse) => {
    if (reponse.ok) cache.put(request, reponse.clone());
    return reponse;
  });
  // Si on finit par servir le cache, plus personne n'attend cette promesse :
  // sans ce rattrapage, son échec remonterait en rejet non géré.
  reseau.catch(() => {});

  try {
    return await avecDelai(reseau, DELAI_RESEAU_MS);
  } catch {
    const enCache = await cache.match(request);
    // Rien en mémoire : on laisse le réseau aller au bout pour que la page
    // reçoive la vraie erreur plutôt qu'un échec prématuré.
    return enCache || reseau;
  }
}

async function cacheDabord(request, nomCache, max) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(request);
  if (enCache) return enCache;

  const reponse = await fetch(request);
  // Une balise <img> vers l'API part sans CORS : la réponse revient opaque,
  // donc sans statut lisible. La refuser reviendrait à laisser des images
  // cassées hors connexion ; on l'accepte, le plafond ci-dessus bornant ce
  // qu'une éventuelle réponse vide pourrait occuper.
  if (reponse.ok || reponse.type === 'opaque') {
    await cache.put(request, reponse.clone());
    if (max) await limiter(cache, max);
  }
  return reponse;
}

/** Les entrées les plus anciennes partent en premier. */
async function limiter(cache, max) {
  const cles = await cache.keys();
  if (cles.length <= max) return;
  await Promise.all(cles.slice(0, cles.length - max).map((cle) => cache.delete(cle)));
}

async function navigation(request) {
  try {
    const reponse = await fetch(request);
    if (reponse.ok) {
      const cache = await caches.open(CACHE_COQUILLE);
      // Toutes les routes renvoient la même coquille : une seule entrée suffit.
      cache.put('/', reponse.clone());
    }
    return reponse;
  } catch (erreur) {
    const coquille = await caches.match('/', { cacheName: CACHE_COQUILLE });
    if (coquille) return coquille;
    throw erreur;
  }
}

function avecDelai(promesse, ms) {
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => rejeter(new Error('Délai réseau dépassé')), ms);
    promesse.then(resoudre, rejeter).finally(() => clearTimeout(minuteur));
  });
}

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
