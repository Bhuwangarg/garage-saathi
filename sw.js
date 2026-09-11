/* Service worker — installable, fully usable offline, and instant to open.
 *
 * STALE-WHILE-REVALIDATE for the app shell (same-origin GETs): answer from the
 * cache immediately, then refresh it from the network in the background.
 *
 * This used to be network-first, and that is what made the app slow to open.
 * Network-first only falls back to the cache when the fetch REJECTS — a fetch
 * that is merely slow does not reject, it just takes as long as it takes. The
 * whole shell, app.js included, is served by a Python serverless function whose
 * cold start was measured at ~9s, and the CDN only holds it for 300s. So the
 * first person to open the app after a quiet spell waited out a cold container
 * while holding a device with a perfect copy of every byte already on it.
 *
 * The cost of the swap is that a load can serve the previous build. That is
 * handled rather than accepted: the revalidation compares what came back with
 * what was cached, and tells the page when the code actually changed, so the
 * app can reload itself at a moment that is not in the middle of somebody's
 * job card. Being one load behind is not the same as being stale.
 *
 * Data lives in IndexedDB, so the shell is all this caches. Cross-origin
 * requests (the sync server, uploads, the Anthropic API) are NOT intercepted.
 */
const CACHE = 'garage-saathi-v77';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './seed-data.js',
  './seed-docs.js',
  './db.js',
  './sync.js',
  './app.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  // Resilient (non-atomic) precache: one failed/slow asset (e.g. the large
  // seed-data.js) must NOT fail the whole install, or the old worker gets stuck.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Web-push: show the notification the server sent, and focus the app on tap. */
self.addEventListener('push', (e) => {
  let d = { title: 'Garage Saathi', body: '', url: '/' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: './icon-192.png', badge: './icon-192.png',
    data: { url: d.url || '/' }, tag: d.tag, renotify: true,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
    for (const c of cls) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  }));
});

/* Tell every open tab that the code on disk has moved on.
 *
 * Pushing the message is not enough on its own. Revalidation starts the moment
 * the worker serves app.js and can finish before the page has finished parsing
 * it — so on a fast connection the message is posted before the page exists to
 * hear it, and the update is never announced. The flag below is the other half:
 * the page asks as well as listens, and the answer survives the race. */
let pendingUpdate = '';

async function notifyUpdated(path) {
  pendingUpdate = path;
  const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of cls) c.postMessage({ type: 'shell-updated', path });
}

/* The worker can be shut down between events, taking `pendingUpdate` with it.
 * That is survivable and deliberately not worked around: the new bytes are
 * already in the cache by then, so the next ordinary open runs them. Losing the
 * flag costs a reload that would have been a convenience, never the update. */
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'ask-update') return;
  const reply = { type: 'shell-updated', path: pendingUpdate };
  if (e.ports && e.ports[0]) e.ports[0].postMessage(pendingUpdate ? reply : { type: 'none' });
  else if (pendingUpdate && e.source) e.source.postMessage(reply);
});

/* Refresh one cached entry, and say so if the bytes actually changed.
 *
 * The comparison is on the response body, not on headers: this shell is served
 * by a function that sets no ETag or Last-Modified, so there is nothing else
 * to compare. Only the files that carry behaviour are worth announcing — a
 * changed icon is not a reason to reload anybody's screen.
 *
 * `oldText` is read by the CALLER, before the cached response is handed to the
 * page. A Response body can be consumed once: cloning it here, after the page
 * has already started reading it, throws — and because that throw looked
 * exactly like "the file is unchanged", updates stopped being announced at all
 * while the cache underneath was refreshing perfectly correctly. */
const ANNOUNCE = /\/(app|sync|db)\.js$|\/styles\.css$|\/index\.html$|\/$/;

async function revalidate(request, oldText) {
  let res;
  try {
    res = await fetch(request, { cache: 'no-store' });
  } catch (e) {
    return;                                    // offline: the cached copy stands
  }
  if (!res || !res.ok) return;
  const copy = res.clone();
  let changed = false;
  if (oldText != null && ANNOUNCE.test(new URL(request.url).pathname)) {
    try {
      changed = (await res.clone().text()) !== oldText;
    } catch (e) { changed = false; }
  }
  try {
    const c = await caches.open(CACHE);
    await c.put(request, copy);
  } catch (e) { /* quota or opaque — the app still works */ }
  if (changed) notifyUpdated(new URL(request.url).pathname);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;   // API / uploads / Anthropic → pass through to network

  e.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      // Read the old bytes BEFORE handing the response over — see revalidate().
      // Only for the files worth announcing; everything else skips the read.
      let oldText = null;
      if (ANNOUNCE.test(url.pathname)) {
        try { oldText = await cached.clone().text(); } catch (err) { oldText = null; }
      }
      // Answer now; catch up in the background. waitUntil keeps the worker
      // alive for the refresh without the page waiting on a byte of it.
      e.waitUntil(revalidate(request, oldText));
      return cached;
    }
    // Nothing cached (first run, or a file added since install): this one has
    // to go to the network, and is cached on the way through.
    try {
      const res = await fetch(request);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      // Offline with nothing cached. For a navigation, the shell is the only
      // useful answer — without this a deep link opens the browser's dinosaur
      // instead of the app that is sitting in the cache.
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
