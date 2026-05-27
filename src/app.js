// src/app.js

// JWT_SECRET — obrigatório em prod; fallback só em dev.
// DEVE rodar antes dos requires de rotas/middleware, que capturam
// process.env.JWT_SECRET em constantes de módulo no load.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET não definido em produção.");
    process.exit(1);
  }
  console.warn("AVISO: JWT_SECRET não definido, usando valor padrão de desenvolvimento");
  process.env.JWT_SECRET = "dev-secret-local-apenas";
}

const helmet = require("helmet");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const cookieParser = require("cookie-parser");

const { authRouter } = require("./routes/auth.routes");
const { alertasRouter } = require("./routes/alertas.routes");
const { condominiosRouter } = require("./routes/condominios.routes");
const { telemetriaRouter } = require("./routes/telemetria.routes");

// Rotas que ainda estavam no server.js (cliente/admin/status etc)
const { clienteRouter } = require("./routes/cliente.routes");
const { adminRouter } = require("./routes/admin.routes");
const { leiturasRouter } = require("./routes/leituras.routes");
const { statusRouter } = require("./routes/status.routes");
const { jobsRouter } = require("./routes/jobs.routes");
const { reservatoriosRouter } = require("./routes/reservatorios.routes");
const { relatorioRouter } = require("./routes/relatorio.routes");
const { relatoriosRouter } = require("./routes/relatorios.routes");
const { whatsappRouter } = require("./routes/whatsapp.routes");
const { chamadosRouter } = require("./routes/chamados.routes");
const { tecnicosRouter } = require("./routes/tecnicos.routes");
const { tecnicosLocalizacaoRouter } = require("./routes/tecnicos-localizacao.routes");
const { ordensServicoRouter } = require("./routes/ordens-servico.routes");
const { planosManutencaoRouter } = require("./routes/planos-manutencao.routes");
const { startOfflineScheduler } = require("./jobs/offline.job");
const { startPlanosManutencaoScheduler } = require("./jobs/planos-manutencao.job");
const { startGpsCleanupScheduler } = require("./jobs/gps-cleanup.job");
const { startLeiturasCleanupScheduler } = require("./jobs/leituras-cleanup.job");
const { startAlertasCleanupScheduler } = require("./jobs/alertas-cleanup.job");
const { startConversasCleanupScheduler } = require("./jobs/conversas-cleanup.job");
const { startChamadosAtrasoScheduler } = require("./jobs/chamados-atraso.job");

const app = express();

// qnd for usar Render/NGINX/Cloudflare, isso ajuda o rate limit a pegar o IP certo
app.set("trust proxy", 1);

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Tiles do mapa — Leaflet baixa imagens diretamente do CDN público.
      // Carto Dark é o preferido (tema dark), com fallback pro OpenStreetMap
      // padrão caso o Carto seja bloqueado por adblock / rede / etc.
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://*.basemaps.cartocdn.com",
        "https://*.tile.openstreetmap.org",
      ],
      // Auto-preenchimento de endereço por CEP:
      //   ViaCEP      — texto granular
      //   BrasilAPI   — lat/lng (cobertura limitada)
      //   AwesomeAPI  — lat/lng com cobertura melhor pra CEPs urbanos
      "connect-src": [
        "'self'",
        "https://viacep.com.br",
        "https://brasilapi.com.br",
        "https://cep.awesomeapi.com.br",
      ],
    },
  },
}));

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3001", "http://127.0.0.1:3001"];

if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS) {
  console.error("FATAL: CORS_ORIGINS não definido em produção (fallback é localhost).");
  process.exit(1);
}

app.use(cors({ origin: corsOrigins }));
// Limit aumentado pra 8mb pra aceitar fotos da O.S. em base64
// (comprimidas client-side pra ~150-300KB cada; base64 infla ~33%).
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());

// Uploads (fotos de O.S.) — público e cacheável
app.use("/uploads", express.static(path.join(__dirname, "../uploads"), {
  etag: true,
  maxAge: "30d",
  immutable: true,
}));

app.use("/static", express.static("public", {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // JS/CSS: browser sempre revalida com o servidor (usa ETag),
    // mas não re-baixa se o arquivo não mudou — evita cache stale
    if (filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

// App mobile (Capacitor): em dev o Express serve /app/* a partir de app/public.
// Em produção o app é empacotado pelo Capacitor e roda em capacitor://,
// fazendo fetch direto pro backend. CORS pra capacitor:// é configurado
// separadamente quando empacotamos o app.
app.use("/app", express.static(path.join(__dirname, "../app/public"), {
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

// health check para monitoramento e balanceadores de carga
app.get("/health", (req, res) => res.json({ status: "ok" }));

// PWA — manifest e service worker precisam estar na raiz
app.get("/manifest.json", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/manifest.json"))
);
app.get("/sw.js", (req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "../public/sw.js"));
});

// Proxy de tiles do mapa — busca do Carto Dark e serve pelo nosso domínio.
// Resolve quando adblockers/firewalls do cliente bloqueiam tile servers
// publicos. Cache em memória + HTTP cache forte (1 dia) reduzem latência.
const _tileCache = new Map(); // key "z/x/y" → { buf, type, ts }
const _TILE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const _TILE_CACHE_MAX = 4000;
// Inflight: dedupe quando vários clientes pedem o mesmo tile ao mesmo tempo
const _tileInflight = new Map();

async function _baixarTileUpstream(z, x, y) {
  // Rotaciona subdomínios pro paralelismo (Carto aceita a/b/c/d)
  const sub = "abcd"[(Number(z) + Number(x) + Number(y)) % 4];
  const url = `https://${sub}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "TelemetriaGeneralBombas/1.0 (tiles proxy)" },
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get("content-type") || "image/png";
    return { buf, type };
  } catch (e) {
    return null;
  }
}

app.get("/tiles/:z/:x/:y.png", async (req, res) => {
  const { z, x, y } = req.params;
  // Sanity: só dígitos pra evitar SSRF
  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return res.status(400).end();
  }
  const zoom = Number(z);
  if (zoom > 19 || zoom < 0) return res.status(400).end();

  const key = `${z}/${x}/${y}`;
  const enviar = ({ buf, type }) => {
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.send(buf);
  };

  const cached = _tileCache.get(key);
  if (cached && (Date.now() - cached.ts) < _TILE_TTL_MS) {
    return enviar(cached);
  }

  // Se outro request pro mesmo tile já está baixando, espera ele
  if (_tileInflight.has(key)) {
    try {
      const tile = await _tileInflight.get(key);
      if (tile) return enviar(tile);
    } catch (e) {}
    return res.status(502).end();
  }

  const p = _baixarTileUpstream(z, x, y);
  _tileInflight.set(key, p);
  try {
    const tile = await p;
    if (!tile) return res.status(502).end();
    _tileCache.set(key, { ...tile, ts: Date.now() });
    if (_tileCache.size > _TILE_CACHE_MAX) {
      const primeira = _tileCache.keys().next().value;
      _tileCache.delete(primeira);
    }
    enviar(tile);
  } finally {
    _tileInflight.delete(key);
  }
});

// Pagina publica para forcar reset do PWA (desregistra SW, limpa caches e
// localStorage). Util quando o usuario fica preso em uma versao antiga e
// nao consegue acessar o DevTools.
//
// IMPORTANTE: a rota fica DENTRO de /admin/* de proposito — o SW antigo
// (v11) trata todo /admin/* como "network first", entao sempre busca a
// versao nova do servidor, ignorando qualquer versao cacheada. Se ficasse
// fora desse prefixo, cairia em "cache first" e o SW antigo serviria a
// versao quebrada cacheada na primeira tentativa.
function _resetCacheHandler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <title>Atualizando o aplicativo…</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { background:#0b0f1f; color:#e6e9f5; font-family: system-ui, sans-serif; margin:0;
           display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
    .box { max-width: 460px; text-align:center; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p  { color:#94a3b8; font-size: 14px; line-height:1.5; }
    .ok { color:#4ade80; font-weight:700; }
    .err { color:#f87171; font-weight:700; }
    button { margin-top: 18px; background:#3b82f6; border:none; color:#fff;
             padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer; }
    .log { margin-top:18px; text-align:left; background:rgba(255,255,255,.04);
           border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:10px 12px;
           font-family: monospace; font-size:11.5px; max-height: 220px; overflow:auto; }
    .log div { padding: 2px 0; color:#94a3b8; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Atualizando o aplicativo</h1>
    <p>Limpando cache e service worker. Em instantes você será redirecionado.</p>
    <div class="log" id="log"></div>
    <button id="btnVoltar" style="display:none;" onclick="location.href='/admin/painel'">Ir para o painel</button>
  </div>
  <script>
  (async () => {
    const log = document.getElementById("log");
    const add = (msg, cls) => {
      const d = document.createElement("div");
      if (cls) d.className = cls;
      d.textContent = msg;
      log.appendChild(d);
    };
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        add("Service workers encontrados: " + regs.length);
        for (const r of regs) {
          await r.unregister();
          add("✓ Desregistrado: " + (r.scope || "(escopo)"), "ok");
        }
      } else {
        add("Service worker indisponível (ok)");
      }
      if ("caches" in window) {
        const names = await caches.keys();
        add("Caches encontrados: " + names.length);
        for (const n of names) {
          await caches.delete(n);
          add("✓ Cache apagado: " + n, "ok");
        }
      }
      try { localStorage.removeItem("token"); add("✓ Token removido", "ok"); } catch (e) {}
      add("✓ Pronto — recarregando em 2s…", "ok");
      setTimeout(() => {
        // bust de cache total: query string única + reload forçado
        location.href = "/admin/painel?_=" + Date.now();
      }, 2000);
      document.getElementById("btnVoltar").style.display = "inline-block";
    } catch (e) {
      add("Erro: " + e.message, "err");
    }
  })();
  </script>
</body>
</html>`);
}
// Rota recomendada (dentro de /admin/* → network-first no SW antigo)
app.get("/admin/reset-cache", _resetCacheHandler);
// Mantém /reset-cache como atalho compatível (mas pode pegar do cache antigo
// em navegadores que ja acessaram antes do fix do CSP).
app.get("/reset-cache", _resetCacheHandler);

// páginas
// HTMLs principais — `Cache-Control: no-cache` força o browser a sempre
// revalidar antes de servir do cache. Sem isso, o navegador às vezes serve
// um admin.html antigo (com `?v=N` defasado), o que faz o admin.js velho
// continuar sendo carregado mesmo após F5. Revalidar é barato (304 quando
// não mudou) e elimina a classe inteira de bug.
function _htmlNoCache(req, res, next) {
  res.setHeader("Cache-Control", "no-cache");
  next();
}
app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", _htmlNoCache, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/login.html"))
);
app.get("/admin/painel", _htmlNoCache, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin.html"))
);
app.get("/cliente/painel", _htmlNoCache, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/cliente.html"))
);

// routers
app.use("/auth", authRouter);
app.use(alertasRouter);
app.use("/condominios", condominiosRouter);
app.use("/telemetria", telemetriaRouter);
app.use("/reservatorios", reservatoriosRouter);

app.use("/cliente", clienteRouter);
app.use("/relatorio", relatorioRouter);
app.use("/relatorios", relatoriosRouter);
app.use("/admin", adminRouter);
app.use(leiturasRouter); // ex: /ultima-leitura/:device_id
app.use("/status", statusRouter);
app.use("/jobs", jobsRouter);
app.use("/whatsapp", whatsappRouter);
app.use("/chamados", chamadosRouter);
app.use("/tecnicos", tecnicosRouter);
app.use("/tecnicos", tecnicosLocalizacaoRouter);
app.use("/ordens-servico", ordensServicoRouter);
app.use("/planos-manutencao", planosManutencaoRouter);

startOfflineScheduler();
startGpsCleanupScheduler();
startLeiturasCleanupScheduler();
startAlertasCleanupScheduler();
startConversasCleanupScheduler();
startChamadosAtrasoScheduler();
startPlanosManutencaoScheduler();

module.exports = { app };