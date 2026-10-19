/* Angry Flock service worker: caches every game file so it runs offline.
 * Bump VERSION whenever any file changes so phones pick up the update. */
const VERSION = 'angryflock-v2';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/lilita-one.woff2',
  './js/vendor/planck.min.js',
  './js/sim.js',
  './js/levels.js',
  './js/audio.js',
  './js/render.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first (the game never needs the network), falling back to the network.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
