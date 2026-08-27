// Melbourne Trip Planner — offline caching service worker
// Scope: this only ever intercepts network requests (GET requests for the page,
// fonts, manifest, icons). It never touches localStorage, the JSON backup/restore
// flow, or CSV export — those are all handled client-side in index.html and never
// go through fetch/this worker.

const CACHE_VERSION = 'melbourne-trip-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Best-effort precache — if one URL 404s (e.g. path differs on your host),
      // don't fail the whole install.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('Precache skipped for', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever handle simple GETs. Never intercept anything else (there is no
  // POST/PUT traffic in this app anyway — all data stays local).
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' ||
    (req.destination === 'document');

  if (isNavigation) {
    // Network-first for the app page itself: whenever you're online you always
    // get the latest version, and it's cached as a fallback for offline opens.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Everything else (fonts, manifest, icons): cache-first, then fall back to the
  // network and quietly cache what comes back for next time. If both fail (e.g.
  // offline and never loaded before), just let it fail — the app's CSS already
  // has system-font fallbacks, so missing web fonts never break functionality.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
