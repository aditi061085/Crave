importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

const CACHE = 'pwabuilder-page';
const OFFLINE_URL = 'offline.html';

// Let a newly installed service worker activate immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Pre-cache the offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// Take control of existing clients as soon as activated
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Enable navigation preload when available
if (workbox && workbox.navigationPreload && workbox.navigationPreload.isSupported()) {
  workbox.navigationPreload.enable();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only return offline.html for page navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }

          const networkResponse = await fetch(request);
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(CACHE);
          const cachedResponse = await cache.match(OFFLINE_URL);
          return cachedResponse || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        }
      })()
    );
    return;
  }

  // For JS, CSS, images, fonts, etc:
  // never send offline.html as a fallback
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        return await fetch(request);
      } catch (error) {
        return new Response('', {
          status: 504,
          statusText: 'Gateway Timeout'
        });
      }
    })()
  );
});
