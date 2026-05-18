// src/app.js

// Fallback de JWT_SECRET em dev — DEVE rodar antes dos requires de rotas/middleware,
// que capturam process.env.JWT_SECRET em constantes de módulo no load.
if (!process.env.JWT_SECRET) {
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
const { whatsappRouter } = require("./routes/whatsapp.routes");
const { chamadosRouter } = require("./routes/chamados.routes");
const { startOfflineScheduler } = require("./jobs/offline.job");

const app = express();

// qnd for usar Render/NGINX/Cloudflare, isso ajuda o rate limit a pegar o IP certo
app.set("trust proxy", 1);

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Tiles do mapa (Carto dark) — Leaflet baixa imagens diretamente do CDN público
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://*.basemaps.cartocdn.com",
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

app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use(cookieParser());
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

// Pagina publica para forcar reset do PWA (desregistra SW, limpa caches e
// localStorage). Util quando o usuario fica preso em uma versao antiga e
// nao consegue acessar o DevTools. Headers explicitos pra nao ser cacheada.
// CSP relaxado pra permitir o script inline (essa pagina nao carrega nada
// externo, entao 'unsafe-inline' nao expoe nada — e ela e isolada).
app.get("/reset-cache", (req, res) => {
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
});

// páginas
app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/login.html"))
);
app.get("/admin/painel", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin.html"))
);
app.get("/cliente/painel", (req, res) =>
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
app.use("/admin", adminRouter);
app.use(leiturasRouter); // ex: /ultima-leitura/:device_id
app.use("/status", statusRouter);
app.use("/jobs", jobsRouter);
app.use("/whatsapp", whatsappRouter);
app.use("/chamados", chamadosRouter);

startOfflineScheduler();

module.exports = { app };