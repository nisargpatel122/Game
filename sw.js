// This address (/Game/) used to host a game directly, and that game's offline copy
// could keep showing here on phones that had visited before. This replacement
// removes that old offline copy once and then switches itself off, so the menu page
// loads normally. It only deletes the old "angryflock-*" caches and never touches the
// caches of the games in their own folders or on their own links.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('angryflock-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: 'window' });
    for (const p of pages) p.navigate(p.url);
  })());
});
