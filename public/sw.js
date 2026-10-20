// Service worker: makes the game load fast and work offline once visited (GitHub Pages or the local server).
// Network-first for the game's own files, so a new deploy is picked up on the next load; the cache is the fallback
// when offline. API calls (./api/*) and other origins (openrouter.ai, r.jina.ai) are never touched.
const CACHE = 'saas-sim-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || /\/api\//.test(url.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && res.type === 'basic') e.waitUntil(cache.put(req, res.clone()).catch(() => {})); // quota full: just not cached
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: url.pathname.endsWith('/') || url.pathname.endsWith('.html') });
      if (hit) return hit;
      throw err;
    }
  })());
});
