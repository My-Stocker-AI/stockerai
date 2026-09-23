// Stocker AI Service Worker — self-cleaning recovery build.
//
// Purpose: break the "stuck old app" deadlock. A previous service worker cached
// the old app shell + JS, so devices kept running pre-February code (which called
// the retired n8n backend) even after uninstall/clear-history — because clearing
// history does NOT remove a service worker or its caches.
//
// This worker caches NOTHING and intercepts NOTHING (every request goes straight
// to the network, always fresh). On activation it purges ALL old caches and, if
// any existed, reloads open windows ONCE so they pick up fresh code immediately.
// The "hadOldCaches" guard prevents a reload loop on subsequent loads.
//
// The browser always re-checks this script from the network on navigation
// (registration uses updateViaCache:'none'), so a stuck device gets this update
// the next time the app is opened — no manual data-clearing required.

const SW_VERSION = 'stocker-ai-v10-voice-state';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', () => {
  // Take over as soon as possible.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge every cache this origin holds (old app shells, old JS, everything).
    const names = await caches.keys();
    const hadOldCaches = names.length > 0;
    await Promise.all(names.map((n) => caches.delete(n)));

    await self.clients.claim();

    // If we just cleared stale caches, the open page is still running old code in
    // memory — reload it ONCE so the device immediately loads fresh code. The guard
    // means a clean device (no old caches) never triggers a reload, so no loop.
    if (hadOldCaches) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (e) { /* best effort */ }
      }
    }
  })());
});

// No 'fetch' handler on purpose: nothing is ever served from cache, so the app can
// never be stale again. (Offline shell-caching can be reintroduced later, carefully,
// once everyone is off the stuck build.)
