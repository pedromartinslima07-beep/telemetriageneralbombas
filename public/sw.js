// ⚠️ AO ADICIONAR UM ENDPOINT NOVO NO BACKEND (ex: /chamados, /tecnicos),
// inclua o prefixo na lista de "network first" abaixo (busque por "isHtml ||")
// E bumpe o CACHE_NAME aqui + o ?v=N do register-sw.js no HTML que registra
// este SW. Sem essa lista, o SW intercepta o GET com cache first e serve
// resposta antiga — sintoma clássico: dado aparece em Ctrl+Shift+R mas some
// em F5. Ver CLAUDE.md raiz pro racional completo.
// ⚠️ v44 = merge de duas gerações que existiram em paralelo: v42 (equipamentos
// com QR) e v43 (landing pública + painel do cliente). Ficar com qualquer uma
// das duas deixaria metade dos navegadores achando que já tem a versão nova.
const CACHE_NAME = "telemetria-v57";

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
      // Ficha do equipamento: a foto vem por /equipamentos/:id/fotos/:id/imagem
      // e a ficha muda a cada movimentação. Cache first aqui mostraria a bomba
      // no estado da semana passada — exatamente o que o módulo existe pra evitar.
      url.pathname.startsWith("/equipamentos") ||
      url.pathname.startsWith("/leads") ||
      url.pathname.startsWith("/tiles") ||
      url.pathname.startsWith("/app")) {
    // ⚠️ O status 503 é essencial. `new Response(body)` sem status responde
    // 200 — e aí todo `if (!r.ok) throw` do front passa batido, o código
    // segue e atribui `{error:"Sem conexão"}` a variáveis que deveriam ser
    // array. O sintoma vira uma pilha de TypeError sem relação aparente com
    // rede ("_alertasAbertos is not iterable", "_chamadosData.filter is not
    // a function"), e ninguém descobre que o problema era o servidor fora.
    // Com 503, `r.ok` é false e o tratamento de erro que já existe funciona.
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ error: "Sem conexão" }),
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "application/json" },
      }
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
