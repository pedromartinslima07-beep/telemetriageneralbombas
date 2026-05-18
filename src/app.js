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
      // Auto-preenchimento de endereço por CEP (ViaCEP, gratuito, sem chave)
      "connect-src": [
        "'self'",
        "https://viacep.com.br",
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