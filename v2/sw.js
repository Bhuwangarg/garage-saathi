/* v2's service worker.
 *
 * Deliberately almost empty until the build stage knows what the shell is. It
 * exists now so that the scope cap is real from the first load: a worker served
 * from /v2/ cannot control anything above /v2/, so whatever this grows into can
 * never take over the live app at /. v1's worker passes /v2/ straight through
 * for the same reason, from its own side.
 *
 * No fetch handler yet. A worker with no fetch handler is transparent -- the
 * network behaves exactly as if it were not installed -- which is the correct
 * behaviour for a shell nobody has built. Adding caching before there is
 * something to cache is how a device pins a half-written app.
 */
const CACHE = 'garage-saathi-v2-0';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // Drop any cache from an earlier v2 build, then take over open pages.
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('garage-saathi-v2-') && k !== CACHE)
    .map((k) => caches.delete(k)));
  await self.clients.claim();
})()));
