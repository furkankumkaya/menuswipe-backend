/**
 * MenuSwipe Admin PWA Service Worker v2
 * 
 * Strategy:
 * - HTML files → network-first (always get latest, fall back to cache offline)
 * - JS/CSS/icons → stale-while-revalidate (serve cache, update in background)
 * - API requests (/api/*) → network-only
 * - Images → cache-first
 */

const CACHE_VERSION = "menuswipe-v2.1.0";
const STATIC_CACHE = "menuswipe-static-" + CACHE_VERSION;
const IMAGE_CACHE = "menuswipe-images-v1";

const PRECACHE_URLS = [
  "/",
  "/admin",
  "/admin.html",
  "/admin.js",
  "/editor.html",
  "/index.html",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/logo-light.svg",
  "/logo-dark.svg",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("menuswipe-") && k !== STATIC_CACHE && k !== IMAGE_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const ADMIN_PATHS = ["/", "/admin", "/admin.html", "/editor.html", "/index.html"];
  const STATIC_EXTS = [".js", ".css", ".png", ".svg", ".json", ".ico", ".woff", ".woff2"];
  const isAdmin = ADMIN_PATHS.includes(url.pathname);
  const isStatic = STATIC_EXTS.some(ext => url.pathname.endsWith(ext));
  const isHTML = url.pathname.endsWith(".html") || isAdmin;

  if (!isAdmin && !isStatic) return;

  // Images: cache-first
  if (req.destination === "image") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((resp) => {
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // HTML pages: network-first (always get latest, cache as fallback for offline)
  if (isHTML) {
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // JS/CSS/static: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((resp) => {
        if (resp.ok) {
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resp.clone()));
        }
        return resp;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
