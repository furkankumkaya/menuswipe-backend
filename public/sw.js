/**
 * MenuSwipe Admin PWA Service Worker
 * 
 * Strategy:
 * - HTML/CSS/JS/icons → cache-first, network-fallback
 * - API requests (/api/*) → network-only (siparişler hep güncel)
 * - Images → cache-first
 */

const CACHE_VERSION = "menuswipe-v1.3.1";
const STATIC_CACHE = "menuswipe-static-" + CACHE_VERSION;
const IMAGE_CACHE = "menuswipe-images-v1";

// Yükleme sırasında cache'lenecek temel dosyalar
const PRECACHE_URLS = [
  "/",
  "/admin",
  "/admin.html",
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
    caches.open(STATIC_CACHE).then((cache) => {
      // Hata olursa hangileri başarılı oldu görelim
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      );
    })
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
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  
  // Sadece GET istekleri cache'lenir
  if (req.method !== "GET") return;
  
  // Cross-origin istekleri (Cloudinary, vs) bypass et
  if (url.origin !== self.location.origin) return;
  
  // API istekleri network-only (siparişler güncel kalsın)
  if (url.pathname.startsWith("/api/")) {
    return; // browser default davranışı
  }
  
  // Müşteri menü sayfaları (slug-based) bypass - cache'lenmesin
  // Admin sayfaları sabit URL'lerde: /admin, /admin.html, /editor.html, /index.html, /
  const ADMIN_PATHS = ["/", "/admin", "/admin.html", "/editor.html", "/index.html", "/pwa.js"];
  const STATIC_EXTS = [".js", ".css", ".png", ".svg", ".json", ".ico", ".woff", ".woff2"];
  const isAdmin = ADMIN_PATHS.includes(url.pathname);
  const isStatic = STATIC_EXTS.some(ext => url.pathname.endsWith(ext));
  
  // Restoran müşteri menüleri (/:slug, /:slug/:branch) cache dışı
  if (!isAdmin && !isStatic) {
    return; // browser default davranışı (network'ten al)
  }
  
  // Görüntüler: cache-first
  if (req.destination === "image") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req)
            .then((resp) => {
              if (resp.ok) cache.put(req, resp.clone());
              return resp;
            })
            .catch(() => cached);
        })
      )
    );
    return;
  }
  
  // HTML/CSS/JS: cache-first, network fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const cloned = resp.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, cloned));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Skip waiting message
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
