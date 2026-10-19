/* Service worker — offline app-shell cache.
 * Hosted PWA: enables offline play + installability.
 * Android APK: served from the secure appassets origin, so it activates there
 * too; offline play also works without it, since assets ship with the app. */
const CACHE = "tic-tac-toe-v3";

const ASSETS = [
  "./",
  "./index.html",
  "./script.js",
  "./style.css",
  "./icon.svg",
  "./manifest.webmanifest",
];

// Cache the app shell on install.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Drop old caches on activate.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

// Serve from cache first, fall back to network (and cache successful GETs).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful same-origin responses — never cache 404/500
        // errors, otherwise a transient failure is served forever.
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match("./index.html"));   // network failed: offline navigation fallback
    })
  );
});
