/* Wedding invite — service worker
   Keeps photos, fonts and the page itself on the guest's device so repeat visits
   open instantly (and still open with a weak connection).
   Bump CACHE_VERSION to force everyone to drop old cached files. */
const CACHE_VERSION = 'v1';
const CACHE = 'invite-' + CACHE_VERSION;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('invite-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Show the cached copy immediately, refresh it in the background for next time.
async function staleWhileRevalidate(request, cacheKey) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey || request);
  const network = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(cacheKey || request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

// Try the network first (so edits/new uploads show up right away), fall back to cache.
async function networkFirst(request, cacheKey, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);
    if (res && res.ok) cache.put(cacheKey || request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(cacheKey || request);
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: network first, cached copy if offline / slow
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, url.origin + url.pathname, 4000));
    return;
  }

  // Photo list: always try fresh, ignore the ?t= cache-buster for the cached copy
  if (url.origin === location.origin && url.pathname.endsWith('/assets/gallery.json')) {
    event.respondWith(networkFirst(req, url.origin + url.pathname, 4000));
    return;
  }

  // Photos, audio, other local assets, and Google Fonts: cached first, refreshed quietly
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin === location.origin || isFont) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
