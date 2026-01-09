// Stocker AI Service Worker
const CACHE_NAME = 'stocker-ai-v6-NEVER-CACHE-JS';

// Handle skip waiting message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // NEVER cache JavaScript or CSS - always fetch fresh from network
  // This prevents stale code from being served by PWA
  const isCodeFile = url.pathname.endsWith('.js') ||
                     url.pathname.endsWith('.css') ||
                     url.pathname.includes('/assets/');

  if (isCodeFile) {
    // Network only - no caching for code files
    return;
  }

  // Skip API calls and webhooks (always go to network)
  if (url.pathname.startsWith('/api') ||
      url.hostname.includes('supabase') ||
      url.hostname.includes('n8n')) {
    return;
  }

  // For non-code files (icons, manifest, etc): cache them
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses (only icons/manifest/etc)
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});
