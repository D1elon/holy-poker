// ============ HOLY POKER — service worker: offline home-screen play ============
// Strategy: stale-while-revalidate. Cached copy serves instantly (and offline);
// a background fetch refreshes the cache so the next launch is up to date.
const CACHE = 'holy-poker-v7';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/vendor/three.min.js',
  './js/util.js',
  './js/save.js',
  './js/audio.js',
  './js/cardart.js',
  './js/uiart.js',
  './js/poker.js',
  './js/cards.js',
  './js/scene3d.js',
  './js/game.js',
  './js/ui.js',
  './js/main.js',
  './fonts/PressStart2P.woff2',
  './fonts/VT323.woff2',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // dev /shot POSTs pass through
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      const refresh = fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
