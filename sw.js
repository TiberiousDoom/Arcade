/* Arcade service worker — precaches the whole app so it runs with no network.

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ BUMP CACHE_VERSION WHENEVER ANY PRECACHED FILE CHANGES.                  │
   │ Nothing does this automatically. Forget, and returning players keep      │
   │ getting the old build from cache indefinitely, because the fetch handler │
   │ is cache-first and never revalidates.                                    │
   └─────────────────────────────────────────────────────────────────────────┘

   Cache-first is the right strategy here despite that footgun: every asset is
   static, versioned by hand, and the whole point is offline play. Stale-while-
   revalidate would spare the version bump but would also serve one stale run
   after every update, which is worse for a game than a manual discipline. */
const CACHE_VERSION = 'arcade-v2';

/* Relative URLs, resolved against this file's location — so the app still
   works when served from a subpath (a GitHub Pages project site, say) rather
   than a domain root. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',

  './shared/theme.css',
  './shared/fit.js',
  './shared/fx.js',
  './shared/help.js',
  './shared/pwa.js',

  './shared/fonts/chivo-mono-latin.woff2',
  './shared/fonts/archivo-black-latin.woff2',

  './shared/icons/icon-192.png',
  './shared/icons/icon-512.png',
  './shared/icons/icon-maskable-512.png',
  './shared/icons/apple-touch-icon.png',
  './shared/icons/favicon-32.png',

  './games/serpent-battery/serpent-battery.html',
  './games/serpent-battery/engine.js',
  './games/angle-iron/angle-iron.html',
  './games/angle-iron/engine.js',
  './games/live-wire/live-wire.html',
  './games/live-wire/engine.js',
];
/* Deliberately absent: serpent-battery-standalone.html. It is a distribution
   artifact that carries its own inlined copy of everything — caching it would
   add ~136 KB for a file the app never navigates to. */

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // addAll is atomic: if any file 404s the install fails outright, which is
    // what we want. A half-populated cache is worse than no service worker.
    await cache.addAll(PRECACHE);
    // take over without waiting for every existing tab to close, so an update
    // lands on the next reload rather than whenever the user closes the app
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only GETs, and only our own origin. Anything else falls through to the
  // network untouched — though the app makes no cross-origin requests at all.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const res = await fetch(req);
      // Cache anything same-origin we did not precache (a game added later,
      // an icon size we forgot) so the second visit works offline too.
      if (res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // Offline and not cached. For a page navigation, the cabinet is a more
      // useful answer than a browser error page.
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
