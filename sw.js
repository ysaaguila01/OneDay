/* Wedding invite — service worker
   Saves only photos, icons and fonts on the guest's device (so repeat visits are fast).
   Text files (the page, CSS, JS, gallery.json) are NEVER saved — they always come
   fresh from the live site, so any text edit shows up right away.
   Bump CACHE_VERSION to clear everything saved on guests' devices. */
const CACHE_VERSION = 'v2';
const CACHE = 'invite-' + CACHE_VERSION;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('invite-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const TEXT_EXT = /\.(html?|css|js|mjs|json|txt|xml|webmanifest)$/i;
const MEDIA_EXT = /\.(jpe?g|png|webp|gif|svg|avif|ico|woff2?|ttf|otf|mp3|m4a|ogg|mp4|webm)$/i;

// Show the saved copy immediately, refresh it quietly in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const sameOrigin = url.origin === location.origin;

  // Text (page, scripts, styles, gallery.json): always straight from the network, never saved
  if (sameOrigin && (req.mode === 'navigate' || TEXT_EXT.test(url.pathname) || url.pathname.endsWith('/'))) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Photos, icons, audio, fonts: saved for faster repeat visits
  if ((sameOrigin && MEDIA_EXT.test(url.pathname)) || isFont) {
    event.respondWith(staleWhileRevalidate(req));
  }
  // anything else: left alone (normal browser behaviour)
});
