/* Angry Flock service worker: caches every game file so it runs offline.
 * Other games live on the same github.io site, so this only ever reads and
 * deletes caches named "angry-flock-v<number>" (plus "angryflock-*", this game's caches
 * from before it moved into its own folder).
 * Bump VERSION whenever any file changes so phones pick up the update. */
const GAME_ID = 'angry-flock';
const VERSION = 8;
const CACHE = `${GAME_ID}-v${VERSION}`;
const ours = (k) => k.startsWith(`${GAME_ID}-v`) || k.startsWith('angryflock-');
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
  './js/install.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ours(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first (the game never needs the network), falling back to the network.
// Only this game's own cache is consulted.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) => cache.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? cache.match('./index.html') : Response.error()))))
  );
});
