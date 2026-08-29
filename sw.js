// ============ HOLY POKER — service worker: offline home-screen play ============
// App shell (ASSETS) is served cache-first from the install-time snapshot so a
// launch always gets a MATCHED set of files — mixed old/new HP.* modules can
// crash. Updates ship by bumping CACHE, which re-precaches everything with
// cache:'no-cache' (GitHub Pages sends max-age=600; without the bypass a
// version bump could re-cache stale bytes). Non-shell requests get
// stale-while-revalidate. Cache names are prefix-scoped: github.io project
// pages share one origin, so we must never touch other apps' caches.
const PREFIX = 'holy-poker-';
const CACHE = PREFIX + 'v8';
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
const SHELL = new Set(ASSETS.map(u => new URL(u, self.registration.scope).pathname));

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // dev /shot POSTs pass through
  const path = new URL(e.request.url).pathname;
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(e.request, { ignoreSearch: true }).then(cached => {
        if (cached && SHELL.has(path)) return cached; // atomic shell: no live swap
        const refresh = fetch(e.request, { cache: 'no-cache' }).then(resp => {
          if (resp && resp.ok && !SHELL.has(path)) c.put(e.request, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || refresh;
      })
    )
  );
});
