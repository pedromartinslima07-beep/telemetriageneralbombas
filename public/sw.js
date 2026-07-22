// ⚠️ AO ADICIONAR UM ENDPOINT NOVO NO BACKEND (ex: /chamados, /tecnicos),
// inclua o prefixo na lista de "network first" abaixo (busque por "isHtml ||")
// E bumpe o CACHE_NAME aqui + o ?v=N do register-sw.js no HTML que registra
// este SW. Sem essa lista, o SW intercepta o GET com cache first e serve
// resposta antiga — sintoma clássico: dado aparece em Ctrl+Shift+R mas some
// em F5. Ver CLAUDE.md raiz pro racional completo.
const CACHE_NAME = "telemetria-v39";

// Permite que a página force a ativação imediata desta versão (sem esperar
// todos os clients fecharem). Pareado com o postMessage no register-sw.js.
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

const STATIC_ASSETS = [
  "/login",
  "/static/login.css",
  "/static/login.js",
  "/static/admin.css",
  "/static/favicon.png",
  // login-logo.png removido do precache — é asset que pode mudar e causava
  // o sintoma "Ctrl+Shift+R atualiza, F5 volta pra antiga"
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
  // Cache API só suporta GET. POST/PUT/DELETE passam direto pra rede.
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Qualquer request cross-origin (ex: tiles de mapa do Carto CDN) passa
  // direto para a rede — o SW não intercepta. Respostas opacas (status 0)
  // do cache causavam o mapa sumir no F5.
  if (url.origin !== self.location.origin) return;

  // HTML e API: sempre network first, sem cache
  const isHtml = e.request.headers.get("accept")?.includes("text/html");
  if (isHtml ||
      url.pathname.startsWith("/auth") ||
      url.pathname.startsWith("/cliente") ||
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/telemetria") ||
      url.pathname.startsWith("/alertas") ||
      url.pathname.startsWith("/reservatorios") ||
      url.pathname.startsWith("/condominios") ||
      url.pathname.startsWith("/relatorio") ||
      url.pathname.startsWith("/relatorios") ||
      url.pathname.startsWith("/status") ||
      url.pathname.startsWith("/jobs") ||
      url.pathname.startsWith("/ultima-leitura") ||
      url.pathname.startsWith("/health") ||
      url.pathname.startsWith("/whatsapp") ||
      url.pathname.startsWith("/chamados") ||
      url.pathname.startsWith("/tecnicos") ||
      url.pathname.startsWith("/ordens-servico") ||
      url.pathname.startsWith("/planos-manutencao") ||
      url.pathname.startsWith("/contratos") ||
      url.pathname.startsWith("/tiles") ||
      url.pathname.startsWith("/app")) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ error: "Sem conexão" }),
      { headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  // JS/CSS: network first (evita servir arquivo stale do cache)
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    e.respondWith(
      fetch(e.request, { cache: "reload" }).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Demais assets (imagens, fontes): cache first
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
