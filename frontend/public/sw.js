const CACHE_NAME = 'gradely-cache-v4-20261029';
const STATIC_PRECACHE = [
  '/',
  '/favicon.svg?v=4',
  '/pwa-192x192.png?v=4',
  '/pwa-512x512.png?v=4',
  '/pwa-maskable-512x512.png?v=4',
  '/apple-touch-icon.png?v=4',
  '/manifest.webmanifest?v=4'
];

// Precache essential assets on install and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch((err) => {
        console.warn('PWA precache notice:', err);
      });
    })
  );
});

// Clean up old caches on activation and claim all open tabs immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for skip waiting messages from the application
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Intercept requests with smart caching strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Never intercept Supabase, POST/PUT/DELETE requests, or external APIs
  if (
    req.method !== 'GET' ||
    url.origin.includes('supabase.co') ||
    url.pathname.startsWith('/rest/v1') ||
    url.pathname.startsWith('/auth/v1')
  ) {
    return;
  }

  // 2. Navigation / HTML pages: NETWORK-FIRST with cache fallback
  // Ensures user always gets the latest deployed index.html when online without stale caching
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // 3. Versioned build assets (/assets/*): CACHE-FIRST with network fallback
  // Hashed bundle files never change, so serving from cache makes app load instantaneously
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) return cachedRes;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 4. Other static images/fonts/manifest: STALE-WHILE-REVALIDATE
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req, { cache: 'no-cache' })
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => cachedRes);
      return cachedRes || fetchPromise;
    })
  );
});
