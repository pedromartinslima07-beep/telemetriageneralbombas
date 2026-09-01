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
const { enviarHtml } = require("./html-limpo");

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
const { contratosRouter } = require("./routes/contratos.routes");
const { assinaturaRouter } = require("./routes/assinatura.routes");
const { equipamentosRouter } = require("./routes/equipamentos.routes");
const { operadorRouter } = require("./routes/operador.routes");
const { leadsRouter } = require("./routes/leads.routes");
const { startOfflineScheduler } = require("./jobs/offline.job");
const { startPlanosManutencaoScheduler } = require("./jobs/planos-manutencao.job");
const { startGpsCleanupScheduler } = require("./jobs/gps-cleanup.job");
const { startLeiturasCleanupScheduler } = require("./jobs/leituras-cleanup.job");
const { startAlertasCleanupScheduler } = require("./jobs/alertas-cleanup.job");
const { startConversasCleanupScheduler } = require("./jobs/conversas-cleanup.job");
const { startConversasTimeoutScheduler } = require("./jobs/conversas-timeout.job");

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

// ⚠️ `/static` NÃO SERVE .html (25/08/2026).
// Ele expõe `public/` inteiro, então `/static/cliente.html` entregava o
// arquivo cru — com todos os comentários — mesmo depois de as rotas de página
// passarem a limpar. Fechar aqui é o que faz a limpeza valer: cada página tem
// rota própria (`/`, `/login`, `/admin/painel`, ...) e nada referencia um
// .html por baixo de /static. Os estudos `public/_*.html` também param de ser
// alcançáveis, o que é ganho: eram versões antigas de tela, servidas ao vivo.
//
// ⚠️ O filtro embrulha o `express.static` em vez de vir antes dele: um
// middleware separado teria de escolher entre `next()` — que cairia no
// static logo abaixo e serviria o arquivo assim mesmo — e `next("router")`,
// que só existe dentro de um Router e é ignorado no app. Embrulhando, o
// `.html` simplesmente nunca chega ao static e segue para o 404.
const _publicEstatico = express.static("public", {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // JS/CSS: browser sempre revalida com o servidor (usa ETag),
    // mas não re-baixa se o arquivo não mudou — evita cache stale
    if (filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
});

app.use("/static", (req, res, next) => {
  if (req.path.toLowerCase().endsWith(".html")) return next();
  return _publicEstatico(req, res, next);
});

// Telas de estudo e previews (`public/_*.html`) — SÓ FORA DE PRODUÇÃO.
//
// Elas viviam em `/static/_estudo.html` até o bloqueio acima, e perder o
// acesso foi efeito colateral, não intenção: são úteis para olhar uma tela
// sem subir sessão nem disparar e-mail de verdade. Voltam por uma porta que
// diz o que é, com duas travas: o prefixo `_` no nome e o ambiente.
//
// ⚠️ Em produção a rota não existe — nem 403, nem 404 diferente: ela
// simplesmente não é registrada, então cai no 404 comum e não conta a
// ninguém que há algo ali.
if (process.env.NODE_ENV !== "production") {
  app.get("/dev/:arquivo", (req, res) => {
    const nome = String(req.params.arquivo || "");
    // `_` obrigatório e nada de caminho: barra, `..` e afins nem chegam aqui,
    // mas a allowlist é o que garante — filtro de bloqueio vaza por padrão.
    if (!/^_[a-z0-9-]{1,60}\.html$/i.test(nome)) return res.status(404).end();
    return res.sendFile(path.join(__dirname, "../public", nome));
  });
}

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

// PWA — manifest e service worker precisam estar na raiz.
//
// ⚠️ O MANIFEST É UM SÓ, MAS O `start_url` NÃO PODE SER (31/08/2026).
// O arquivo tinha `"start_url": "/login"`, escrito quando o login era a única
// superfície instalável. Hoje são cinco, e o efeito só aparece no Android:
//
//   iOS      → ignora o `start_url` e abre a PÁGINA que estava aberta na hora
//              de "Adicionar à Tela de Início". Por isso as metas
//              `apple-mobile-web-app-*` em cada HTML.
//   Android  → o `start_url` MANDA. Quem instalava do painel do operador
//              ganhava um ícone que abre no /login, toda vez.
//
// Com sessão válida o /login redireciona sozinho, então na prática era um
// passo a mais e um flash de tela — não uma parede. Mas é diferença entre
// sistemas que ninguém pediu, e o custo de corrigir é este bloco.
//
// ⚠️ POR QUE GERAR EM VEZ DE TER CINCO ARQUIVOS: os ícones são oito entradas
// idênticas em todos. Copiadas cinco vezes, trocar um ícone vira cinco
// edições — e a quinta é a que alguém esquece.
//
// ⚠️ E POR QUE QUERY, NÃO CAMINHO (`/manifest-operador.json`): o service
// worker trata `/manifest.json` como network-first por PATHNAME (ver sw.js),
// e um caminho novo cairia em cache-first — o manifest ficaria congelado na
// primeira versão que o navegador buscasse, que é exatamente o bug que
// aquela regra existe para evitar.
const MANIFEST_BASE = require("../public/manifest.json");
const MANIFEST_APPS = {
  operador: { start_url: "/operador/painel",  name: "General Turno",      short_name: "Turno" },
  admin:    { start_url: "/admin/painel",     name: "General Admin",      short_name: "Admin" },
  cliente:  { start_url: "/cliente/painel",   name: "General Telemetria", short_name: "Telemetria" },
};
app.get("/manifest.json", (req, res) => {
  const extra = MANIFEST_APPS[String(req.query.app || "")] || {};
  // ⚠️ `no-cache`, e não é excesso: o manifest é lido UMA vez, no momento da
  // instalação, e o que ele disser fica valendo no ícone até alguém
  // reinstalar. Um manifest velho servido do cache do navegador é um atalho
  // errado que ninguém consegue diagnosticar depois.
  res.setHeader("Cache-Control", "no-cache");
  res.type("application/manifest+json");
  return res.json({ ...MANIFEST_BASE, ...extra });
});
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
// `/` é a landing pública (apresentação do produto para síndicos), não mais um
// redirect para /login. Quem chega por indicação/anúncio precisa entender o que
// é o produto antes de ver um formulário de senha.
// O login continua em /login — e era ele que o `manifest.json` usava como
// `start_url` para todo mundo até 31/08/2026, então o ícone instalado antes
// disso ainda abre lá (e no iOS o `start_url` nem manda). Desde 01/09/2026 o
// `login.js` confere a sessão no carregamento e salta para o painel do role —
// antes ele só redirecionava DEPOIS de um POST, e quem abria o PWA via o
// formulário por cima de uma sessão válida. Ver docs/modulos/autenticacao.md.
app.get("/", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/index.html"))
);
app.get("/login", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/login.html"))
);
app.get("/admin/painel", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/admin.html"))
);
app.get("/cliente/painel", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/cliente.html"))
);
// Painel do operador — superfície própria, não o admin com itens escondidos.
// Mesma convenção das outras: a PÁGINA é o nome da tela (`/operador/painel`),
// a API é o nome do recurso (`/operador/fila`), então esta rota não sombreia
// o router registrado lá embaixo.
app.get("/operador/painel", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/operador.html"))
);
// Aprovados — a segunda tela do operador: os orçamentos já aprovados, com o
// prédio e o serviço autorizado, SEM valor (o endpoint não devolve dinheiro).
// ⚠️ O PATH É `/operador/painel/orcamentos`, NÃO `/operador/orcamentos`.
// Esse segundo é a API, registrada no `operadorRouter` — mesma convenção e
// mesmo motivo do par `/cliente/painel/orcamentos` (página) e
// `/cliente/orcamentos` (API): página é o NOME DA TELA, API é o recurso.
// Trocar isso faz a rota HTML sombrear o endpoint e a tela carrega vazia.
app.get("/operador/painel/orcamentos", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/operador-orcamentos.html"))
);
// Orçamentos do síndico — página própria, não um modal do painel. É o destino
// do link que vai no e-mail do orçamento, então a URL é pública e estável; o
// login é pedido pelo JS num cartão SOBRE a própria página — nunca em /login,
// nem quando a sessão morre por inatividade (ver `public/cliente-orcamentos.js`
// e o hook `aoExpirarInatividade`) — e o dado é escopado no backend pelo
// condominio_id do usuário.
//
// ⚠️ O PATH É `/cliente/painel/orcamentos`, NÃO `/cliente/orcamentos`. Estas
// rotas de página são registradas ANTES do `app.use("/cliente", clienteRouter)`
// lá embaixo, então `/cliente/orcamentos` aqui sombrearia o GET da API com o
// mesmo nome — o fetch da lista receberia o HTML da própria página e o front
// estouraria o clássico `Unexpected token '<'`. A convenção do repo já
// separava os dois: página é o NOME DA TELA (`/cliente/painel`), API é o nome
// do RECURSO (`/cliente/status`, `/cliente/chamados`, `/cliente/orcamentos`).
app.get("/cliente/painel/orcamentos", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/cliente-orcamentos.html"))
);
// ⚠️ REDE DE SEGURANÇA PARA A URL SEM `/painel`.
// `/cliente/orcamentos` é a API. Aberta no navegador — link digitado à mão,
// e-mail antigo, alguém tirando o `/painel` do meio — ela responde
// `{"error":"Token ausente"}` em JSON cru, que para o síndico é uma tela
// branca com uma frase técnica. Quando o pedido é NAVEGAÇÃO (Accept com
// text/html, que `fetch` nunca manda: ele manda `*/*`), mandamos para a
// página equivalente preservando a query. O `fetch` da tela não passa por
// aqui e continua recebendo o 401 que ele sabe tratar.
app.get("/cliente/orcamentos", (req, res, next) => {
  if (!String(req.headers.accept || "").includes("text/html")) return next();
  const qs = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  return res.redirect(302, "/cliente/painel/orcamentos" + qs);
});

// Ficha do equipamento — é o que a etiqueta QR abre. O path é curto de
// propósito: menos caractere na URL = QR com menos módulos = etiqueta legível
// mesmo suja ou amassada. O código não é validado aqui (o HTML é estático);
// quem resolve é o `equipamento.js` chamando GET /equipamentos/codigo/:codigo.
app.get("/e/:codigo", _htmlNoCache, (req, res) =>
  enviarHtml(res, path.join(__dirname, "../public/equipamento.html"))
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
app.use("/tecnicos", tecnicosLocalizacaoRouter);
app.use("/tecnicos", tecnicosRouter);
app.use("/ordens-servico", ordensServicoRouter);
app.use("/planos-manutencao", planosManutencaoRouter);
app.use("/contratos", contratosRouter);
app.use("/assinar", assinaturaRouter);
app.use("/equipamentos", equipamentosRouter);
app.use("/operador", operadorRouter);
// Contatos da landing. `POST /leads` é público (rate-limited + honeypot);
// a leitura exige gestão. Ver src/routes/leads.routes.js.
app.use("/leads", leadsRouter);

// 404 e erros em JSON — sem isto o Express responde a página HTML padrão
// (`<!DOCTYPE html>…`) e o front, que faz `.json()` na resposta, morre com
// "Unexpected token '<'" escondendo o erro de verdade. O caso mais comum é o
// 413 do body-parser em upload de imagem grande (limite de 8mb acima).
// Requests de página (GET aceitando text/html) seguem com o 404 padrão.
app.use((req, res, next) => {
  const querHtml = req.method === "GET" && (req.headers.accept || "").includes("text/html");
  if (querHtml) return next();
  return res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Arquivo muito grande — o limite é 8 MB por requisição." });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Corpo da requisição não é um JSON válido." });
  }
  const status = err.status || err.statusCode || 500;
  console.error(`[app] erro não tratado em ${req.method} ${req.originalUrl}:`, err);
  return res.status(status).json({
    error: status >= 500 ? "Erro interno do servidor" : (err.message || "Requisição inválida"),
  });
});

startOfflineScheduler();
startGpsCleanupScheduler();
startLeiturasCleanupScheduler();
startAlertasCleanupScheduler();
startConversasCleanupScheduler();
startPlanosManutencaoScheduler();
startConversasTimeoutScheduler();

module.exports = { app };