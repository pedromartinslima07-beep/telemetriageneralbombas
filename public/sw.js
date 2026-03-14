const CACHE_NAME = "telemetria-v1";

const STATIC_ASSETS = [
  "/login",
  "/static/login.css",
  "/static/login.js",
  "/static/admin.css",
  "/static/favicon.png",
  "/static/login-logo.png",
  "/static/icons/icon-192x192.png",
  "/static/icons/icon-512x512.png",
];

// Instala e faz cache dos assets estáticos
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Remove caches antigos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API: network first, sem cache
  if (url.pathname.startsWith("/auth") ||
      url.pathname.startsWith("/cliente") ||
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/telemetria") ||
      url.pathname.startsWith("/alertas") ||
      url.pathname.startsWith("/reservatorios") ||
      url.pathname.startsWith("/health")) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ error: "Sem conexão" }),
      { headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  // Assets estáticos: cache first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return res;
    }))
  );
});
