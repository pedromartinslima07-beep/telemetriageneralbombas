# Arquitetura, Estrutura de Pastas, Dependências e Integrações

## Visão geral

Monólito Node.js/Express servindo API REST + frontend estático (HTML/CSS/JS
puro) + app mobile (Capacitor). Banco PostgreSQL. Deploy no Railway. Sem build
step, sem framework de frontend — **decisão deliberada** (ver
`../memory-bank/decisions.md`).

```
ESP32 ──HTTPS POST /telemetria (X-Device-Key)──┐
Cliente WhatsApp ──Meta API──webhook───────────┤
Navegador (admin/cliente) ──JWT───────────────┤
App mobile (Capacitor) ──JWT──fetch───────────┤
                                               ▼
                    ┌──────── Express (src/app.js) ────────┐
                    │ helmet+CSP · compression · cors(env)  │
                    │ json(8mb) · cookieParser · static     │
                    │ rate limit · _htmlNoCache             │
                    │                                       │
                    │ 19 routers → services → pool pg       │
                    │ controllers (whatsapp) · 8 jobs       │
                    │ proxy de tiles · reset-cache do PWA   │
                    └───────────────┬───────────────────────┘
                                    ▼
                              PostgreSQL (Railway)
       integrações externas: OpenAI · Meta WhatsApp · Resend · Nominatim/CEP · Carto
```

- **Bootstrap:** `server.js` carrega `.env` (só fora de produção), sobe o
  `app`, registra graceful shutdown (SIGTERM/SIGINT → fecha pool).
- **Multi-tenancy** por `condominio_id`, isolado em middleware por role.
- **Jobs** em `setTimeout` recursivo (não `setInterval`), auto-iniciados pelo
  `app.js`, lendo config dinâmica a cada tick.

---

## Estrutura de pastas

```
.
├── server.js                 # bootstrap: .env + listen + shutdown
├── simulador.js              # simula um ESP32 enviando leituras
├── Procfile                  # comando de start no Railway
├── package.json
│
├── src/
│   ├── app.js                # Express: middleware, routers, jobs, proxy tiles, reset-cache
│   ├── config.js             # constantes de ambiente (OFFLINE_MINUTES)
│   ├── db.js                 # pool pg (DATABASE_URL ou PG*)
│   ├── routes/               # 19 routers (ver docs/api.md)
│   ├── controllers/          # whatsapp.controller.js (webhook → background → IA)
│   ├── middleware/           # authRequired, adminOnly, masterAdminOnly, clienteOnly
│   ├── services/             # regras de negócio + integrações (ver abaixo)
│   └── jobs/                 # 8 jobs em background
│
├── public/                   # frontend web (servido em /static e nas rotas HTML)
│   ├── admin.html/.js/.css   # painel admin "Mission Control"
│   ├── cliente.html/.js      # painel do cliente
│   ├── login.html/.js/.css   # login + OTP
│   ├── sw.js, register-sw.js, manifest.json   # PWA
│   ├── leaflet.*, apexcharts.min.js, chart.umd.min.js, lucide.min.js  # libs locais
│   └── *.png                 # logos, ícones, mockups de referência (front-*.png)
│
├── app/                      # app mobile Capacitor
│   ├── capacitor.config.json
│   └── public/               # app.html/js/css (HTML/CSS/JS puro, herda admin.css)
│
├── firmware/
│   └── esp32_telemetria.ino  # firmware do dispositivo
│
├── database/
│   ├── schema.sql            # schema base (7 tabelas)
│   └── migrations/           # migrations datadas originais (histórico)
│
├── migrations/               # migrations ATIVAS numeradas 001..043 + scripts de limpeza
├── scripts/                  # migrate.js, regenerar-pdfs-os.js, check-tecnicos.js
│
├── docs/                     # esta documentação
├── memory-bank/              # brief, estado, decisões, roadmap (contexto p/ devs/IA)
├── CLAUDE.md                 # convenções e pegadinhas
├── README.md
└── INSTALACAO.md             # guia de instalação física (sonda + sensor)
```

### Services (`src/services/`)

| Arquivo | Responsabilidade |
|---|---|
| `alertas.service.js` | Geração/resolução de alertas de telemetria |
| `email.js` | Envio de email via **Resend** (OTP, alerta crítico) |
| `ia.service.js` | Orquestra **OpenAI** function calling, system prompt, contexto |
| `evolution.service.js` | Envia mensagens via **Meta WhatsApp Business API** (nome histórico) |
| `config.service.js` | Config dinâmica (whitelist `CHAVES`, cache 30s) |
| `chamado-historico.service.js` | Registra mudanças de chamado em `historico_chamados` |
| `chamado-mensagens.service.js` | Chat interno do chamado |
| `orcamento-pdf.service.js` | PDF de orçamento (Puppeteer) |
| `os-pdf.service.js` | PDF de Ordem de Serviço (Puppeteer) |
| `relatorio-pdf.service.js` | PDF de relatório de telemetria (Puppeteer) |

### Jobs (`src/jobs/`) — `setTimeout` recursivo

| Job | Função | Config dinâmica |
|---|---|---|
| `offline.job.js` | Alerta `dispositivo_offline` após N min sem leitura | `jobs.offline_intervalo_min` |
| `chamados-atraso.job.js` | Email quando chamado em atendimento estoura prazo | `chamados.alerta_atraso_horas/_enabled` |
| `conversas-timeout.job.js` | Fecha conversa WhatsApp inativa + pede avaliação | `whatsapp.sessao_timeout_horas` |
| `planos-manutencao.job.js` | Gera chamado P4 quando plano vence | `planos.geracao_enabled` |
| `gps-cleanup.job.js` | Limpa histórico GPS antigo | `gps.retencao_horas` |
| `leituras-cleanup.job.js` | Retenção de leituras | `leituras.retencao_dias`, `_dry_run` |
| `alertas-cleanup.job.js` | Retenção de alertas resolvidos | `alertas.retencao_dias`, `_dry_run` |
| `conversas-cleanup.job.js` | Retenção de conversas fechadas | `conversas.retencao_dias`, `_dry_run` |

---

## Configuração dinâmica (`config.service.js`)

Tabela `configuracoes` (key-value). Editável via `PATCH /admin/configuracoes`
(masterAdmin), com validação por whitelist `CHAVES` (tipo + min/max/enum) e
cache em memória de 30s. Chaves atuais:

`ia.enabled`, `ia.modelo` (gpt-4o-mini|gpt-4o), `ia.system_prompt`,
`alertas.email_destinatario`, `jobs.offline_intervalo_min`,
`gps.retencao_horas`, `gps.frequencia_segundos`, `leituras.retencao_dias`,
`leituras.cleanup_dry_run`, `alertas.retencao_dias`, `alertas.cleanup_dry_run`,
`conversas.retencao_dias`, `conversas.cleanup_dry_run`,
`chamados.alerta_atraso_horas`, `chamados.alerta_atraso_enabled`,
`planos.geracao_enabled`, `whatsapp.sessao_timeout_horas`.

> Ao adicionar config dinâmica nova, registrar em `CHAVES` com tipo + limites.

---

## Dependências (`package.json`)

**Runtime:**

| Pacote | Uso |
|---|---|
| `express` ^4.19 | Servidor HTTP / roteamento |
| `pg` ^8.12 | Cliente PostgreSQL (pool) |
| `jsonwebtoken` ^9 | Emissão/verificação de JWT |
| `bcrypt` ^6 | Hash de senhas |
| `cookie-parser` ^1.4 | Cookies de trusted device |
| `cors` ^2.8 | CORS restrito por env |
| `helmet` ^8 | Headers de segurança + CSP |
| `compression` ^1.8 | Gzip das respostas |
| `express-rate-limit` ^8 | Rate limit (login, OTP, telemetria) |
| `dotenv` ^17 | Carrega `.env` em dev |
| `openai` ^6 | IA (function calling, gpt-4o-mini) |
| `resend` ^6 | Envio de email transacional |
| `puppeteer` ^24 | Geração de PDFs (browser singleton) |

**Scripts npm:** `start` (`node server.js`), `dev` (`--watch`),
`sim` (`simulador.js`), `migrate` (`scripts/migrate.js`).

**Frontend:** libs servidas localmente em `public/` (ApexCharts, Chart.js,
Leaflet, Lucide) — sem CDN, sem npm no frontend.

**Mobile:** Capacitor (ver `app/package.json`).

---

## Integrações externas

| Integração | Onde | Variáveis de ambiente | Notas |
|---|---|---|---|
| **OpenAI** | `ia.service.js`, `/alertas/analisar-ia` | `OPENAI_API_KEY` | gpt-4o-mini, function calling, `response_format: json_object` na análise |
| **Meta WhatsApp Business API** | `evolution.service.js`, `whatsapp.controller.js` | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | `POST graph.facebook.com/v.../{phone_id}/messages`; webhook verificado por GET |
| **Resend** | `email.js` | `RESEND_API_KEY`, `SMTP_FROM` | OTP de login + email de alerta crítico |
| **Nominatim (OSM)** | `/admin/geocode`, `/admin/reverse-geocode` | — | proxy server-side, fila 1 req/s (ToS) |
| **ViaCEP / BrasilAPI / AwesomeAPI** | frontend (CEP → endereço/coords) | — | liberados na CSP (`connect-src`) |
| **Carto (tiles dark)** | proxy `/tiles/:z/:x/:y.png` | — | cache em memória 4000 tiles/24h + dedupe inflight; resolve adblock/firewall |
| **ESP32 (entrada)** | `POST /telemetria` | `X-Device-Key` (por reservatório) | não é serviço externo, mas é a fonte primária de dados |

### Variáveis de ambiente (referência)

```
# Servidor
PORT, NODE_ENV
# Banco (uma das duas formas)
DATABASE_URL  |  PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSL  + PG_POOL_MAX
# Auth
JWT_SECRET (obrigatório em prod) · OTP_DISABLED (dev) · CORS_ORIGINS (obrigatório em prod)
# Telemetria
OFFLINE_MINUTES · TELEMETRIA_PCT_THRESHOLD · TELEMETRIA_HEARTBEAT_MIN
# Integrações
OPENAI_API_KEY · RESEND_API_KEY · SMTP_FROM
WHATSAPP_ACCESS_TOKEN · WHATSAPP_PHONE_NUMBER_ID · WHATSAPP_VERIFY_TOKEN
```

`JWT_SECRET` e `CORS_ORIGINS` ausentes em produção → `process.exit(1)`.

---

## Cache (3 camadas) — atenção

Bug mais comum do projeto. Resumo: (1) `?v=N` nos assets em `admin.html`;
(2) lista network-first + `CACHE_NAME` no `sw.js`; (3) `Cache-Control:no-cache`
nas HTMLs (`_htmlNoCache`). Detalhes em `../CLAUDE.md`. Saída de emergência:
`GET /admin/reset-cache`.

Ver também: `banco-de-dados.md`, `api.md`, `modulos/` (fluxos de negócio),
`changelog.md`.
