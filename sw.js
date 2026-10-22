// Complaain Service Worker
const CACHE_NAME = "complaain-v1.3.0";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/pii-engine.js",
  "./js/spreadsheet-redactor.js",
  "./js/pdf-redactor.js",
  "./js/offline-packager.js",
  "./js/app.js",
  "./js/vendor/xlsx.full.min.js",
  "./version.json",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  // Never cache external non-GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache for next time (stale-while-revalidate)
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Offline, ignore network errors
        });
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

// Periodic or triggered check for updates
self.addEventListener("message", event => {
  if (event.data === "CHECK_FOR_UPDATE") {
    fetch("./version.json?t=" + Date.now())
      .then(r => r.json())
      .then(remote => {
        caches.match("./version.json").then(cached => {
          if (cached) {
            cached.json().then(local => {
              if (remote.version !== local.version) {
                self.clients.matchAll().then(clients => {
                  clients.forEach(c => c.postMessage({ type: "UPDATE_AVAILABLE", version: remote.version }));
                });
              }
            });
          }
        });
      })
      .catch(() => {});
  }
});
