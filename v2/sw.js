/* v2's service worker.
 *
 * Two jobs, and the first one is still the more important of the two.
 *
 * ## 1. The scope cap
 *
 * This file is served from /v2/, so the browser caps its scope at /v2/ and it
 * cannot control anything above it: whatever this grows into can never take
 * over the live app at /. That cap is the BROWSER's rule rather than ours,
 * which is why it is the protection worth relying on. It depends on two
 * absences and this file must preserve both — no `scope` option at the
 * registration (that is in index.html) and no Service-Worker-Allowed header
 * anywhere. `scripts/check-v2-isolation.sh` holds thirteen invariants over
 * this; v1's worker passes /v2/ straight through from its own side.
 *
 * ## 2. Offline
 *
 * Until now there was no fetch handler at all. A worker with no fetch handler
 * is transparent — the network behaves exactly as if it were not installed —
 * which was the right behaviour for a shell nobody had built, and is the wrong
 * behaviour now: /v2 did not open offline AT ALL, on an offline-first app for a
 * yard at 20:00 where the signal is one shed wall away from gone.
 *
 * CACHE-FIRST for the shell, and nothing else cached at all:
 *
 *  - the shell's own files answer from the cache immediately, which is also
 *    what makes a cold open fast — the whole shell is served by a Python
 *    serverless function whose cold start was measured at ~9s, and v1 learnt
 *    the hard way that a slow fetch does not reject, it just takes as long as
 *    it takes;
 *  - every cached entry is refreshed behind the page afterwards, so a deploy
 *    lands on the next open. Without that, cache-first pins the build on the
 *    device until the worker's own bytes change, and "I deployed the fix and
 *    they still see the bug" is a failure this app has already had once;
 *  - a request that is NOT one of the shell's files goes to the network and is
 *    not cached, ever. That is deliberate: /pull and /push must never be served
 *    from a cache (the contract sends them `no-store`), a photo in /uploads is
 *    large and immutable and belongs to the browser's own cache, and this
 *    worker holds nothing it cannot name;
 *  - and this file is excluded by name. A worker that can serve itself from a
 *    cache is a device that can pin an old worker, which is the one failure
 *    that has no way out from the user's side. It is served `no-cache` by the
 *    server (isolation invariant 5) and it is not in SHELL either.
 *
 * Data is in IndexedDB (`garage-saathi-v2`), so the shell is all there is to
 * cache.
 */

/* SHELL is index.html's `<link>` and `<script>` list, in the same order, plus
 * the document itself. The two lists are THE SAME LIST: a file served but not
 * precached breaks offline and nothing else notices, so one slice owns both
 * files and test_v2_boot.js compares them entry for entry against what is on
 * disk. Adding a script to index.html without adding it here is a check
 * failure, by design. */
const CACHE = 'garage-saathi-v2-1';
const SHELL = [
  './',
  'index.html',
  'ui/tokens.css',
  'ui/components.css',
  'ui/screens.css',
  'ui/shell.css',
  'ui/today.css',
  'ui/attention.css',
  'ui/work.css',
  'ui/duty.css',
  'ui/gate.css',
  'ui/me.css',
  'ui/login.css',
  'ui/icons.js',
  'ui/words.js',
  'ui/states.js',
  'ui/overlay.js',
  'ui/photos.js',
  'ui/nav.js',
  'db.js',
  'sync.js',
  'pullapply.js',
  'night.js',
  'fmt.js',
  'odo.js',
  'cost.js',
  'caps.js',
  'router.js',
  'cache.js',
  'shell.js',
  'screens/attention.js',
  'screens/duty.js',
  'screens/gate.js',
  'screens/jobcard.js',
  'screens/jobs.js',
  'screens/me.js',
  'screens/today.js',
  'boot.js',
];

// Resolved once, against this worker's own URL, so every comparison below is
// between absolute paths and a relative entry cannot quietly mean two things.
const SHELL_PATHS = new Set(SHELL.map((u) => new URL(u, self.location.href).pathname));
const INDEX_PATH = new URL('index.html', self.location.href).pathname;
const SELF_PATH = self.location.pathname;

self.addEventListener('install', (e) => {
  /* Resilient (non-atomic) precache: one failed or slow asset must NOT fail the
   * whole install, or the old worker gets stuck and the device is left on
   * whatever it had. `reload` skips the browser's HTTP cache, so the install
   * cannot store a five-minute-old tokens.css beside a new screen and render
   * the new screen with the previous build's stylesheet. */
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting())
    .catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // Drop any cache from an earlier v2 build, then take over open pages. Only
  // v2's own caches are touched by name: v1's cache is on the same origin and
  // deleting it would log the whole office out of a working app.
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('garage-saathi-v2-') && k !== CACHE)
    .map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

/* Refresh one cached entry behind the page. Failure is the normal case — this
 * runs offline too — and is silent on purpose: the cached copy stands, and the
 * page has already been answered by the time this starts. */
async function revalidate(request) {
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (!res || !res.ok) return;
    const c = await caches.open(CACHE);
    await c.put(request, res.clone());
  } catch (e) { /* offline, or quota: the cached copy stands */ }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    revalidate(request);                    // deliberately not awaited
    return cached;
  }
  // Nothing cached yet (a first load, or an entry the install could not fetch).
  // The network is the only answer, and what comes back is kept so the next
  // open works offline even if the install was partial.
  const res = await fetch(request);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const request = e.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // the sync server, uploads: pass through
  if (url.pathname === SELF_PATH) return;            // never serve this worker from a cache

  /* A navigation anywhere under /v2/ is the one document. v2 has no URL routing
   * at all (`v2-ux.md §2.1`) — the route is a variable in router.js and there is
   * no address bar to read — so every navigation here resolves to index.html,
   * and an offline open of /v2/anything draws the app rather than the browser's
   * dinosaur. */
  const key = request.mode === 'navigate' ? INDEX_PATH : url.pathname;
  if (!SHELL_PATHS.has(key)) return;                 // not the shell: straight to the network

  e.respondWith(request.mode === 'navigate'
    ? cacheFirst(new Request(INDEX_PATH, { cache: 'no-store' }))
    : cacheFirst(request));
});
