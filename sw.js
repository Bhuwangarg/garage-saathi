/* Service worker — installable + fully usable offline.
 *
 * NETWORK-FIRST for the app shell (same-origin GETs): when online we always
 * fetch the latest code and refresh the cache, so a new build is picked up on
 * the next load with no manual cache-clear. When offline we serve the last
 * cached copy. Data lives in IndexedDB, so the shell is all this caches.
 * Cross-origin requests (the sync server, uploads, the Anthropic API) are NOT
 * intercepted — they go straight to the network.
 */
const CACHE = 'garage-saathi-v31';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './sync.js',
  './app.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;   // API / uploads / Anthropic → pass through to network
  // Network-first: fresh code wins; cache is the offline fallback.
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request))
  );
});
