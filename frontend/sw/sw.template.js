/* StockDesk service worker: keeps the whole app on the device so the till
 * opens and sells with no internet. Generated at build time from
 * sw/sw.template.js: the build fills in the version and the list of files,
 * so every deploy installs a fresh copy of the complete app. */
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `stockdesk-${CACHE_VERSION}`;
const PRECACHE = __PRECACHE_FILES__;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // One by one, so a single failed file doesn't abort the install.
      await Promise.all(
        [...APP_SHELL, ...PRECACHE].map((path) =>
          fetch(path, { cache: 'reload' })
            .then((response) => (response.ok ? cache.put(path, response) : undefined))
            .catch(() => undefined)
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('stockdesk-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses here; the app keeps its own offline copies.
  if (url.pathname.startsWith('/api/')) return;

  // Pages: network first so the app stays fresh, cached app when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Built files are content-hashed and never change: cache first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
