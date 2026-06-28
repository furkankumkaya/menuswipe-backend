/**
 * MenuSwipe Service Worker v2.2.0
 * Simple network-first for HTML, cache-first for static assets
 */

const CACHE_VERSION = "menuswipe-v2.2.0";
const CACHE_NAME = "menuswipe-" + CACHE_VERSION;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("menuswipe-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests from same origin
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Never cache API calls
  if (url.pathname.startsWith("/api/")) return;

  // HTML files: always network-first, no cache interference
  if (url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/dashboard") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  const STATIC_EXTS = [".js", ".css", ".png", ".svg", ".ico", ".woff", ".woff2", ".json"];
  if (STATIC_EXTS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Revalidate in background
          fetch(req).then((resp) => {
            if (resp && resp.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resp));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(req).then((resp) => {
          if (resp && resp.ok) {
            const toCache = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, toCache));
          }
          return resp;
        });
      })
    );
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
