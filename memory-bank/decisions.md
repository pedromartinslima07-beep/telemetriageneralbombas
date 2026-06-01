# Decisões Arquiteturais

Decisões deliberadas identificadas no código e no `../PLANO_WHATSAPP_IA.md`.
Cada uma custou tempo ou foi tomada conscientemente — não reverter sem motivo.

## Stack e frontend

- **HTML/CSS/JS puro, sem framework/build.** Backend Express serve o frontend
  como estático. Decisão explícita: **não migrar para Next/React/Vite**, nem em
  redesigns. ApexCharts/Chart.js/Leaflet/Lucide vêm como arquivos locais em
  `public/static/`.
- **App mobile = Capacitor sobre HTML/CSS/JS puro** (`app/public/`). Em dev o
  Express serve `/app/*`; em prod o Capacitor empacota e faz fetch direto ao
  backend (capacitor://). Reusa tokens e componentes de `public/admin.css`.
- **Visual "Mission Control" único.** Brand amber (`--accent: #f0b014`). Toda
  tela herda a paleta dark do admin — **nunca criar paleta paralela**. Redesigns
  adaptam a referência visual ao Mission Control já implementado (preservar
  cores, performance de animação, logos, padrões de polling).
- **Animações compositor-friendly.** Transições da sidebar usam `will-change` +
  `contain: layout paint`, opacity/max-width em vez de display none/block, tudo
  unificado em 280ms `cubic-bezier(.4,0,.2,1)` (material standard easing) para
  evitar reflow cascateado e "estalos".

## Cache (a pegadinha nº 1 do projeto)

- **3 camadas de cache** que precisam ser sincronizadas ao mexer no admin:
  (1) browser HTTP cache via `?v=N` nos assets; (2) **Service Worker**
  network-first list + `CACHE_NAME`; (3) HTML cache via `Cache-Control:
  no-cache` (middleware `_htmlNoCache`). Detalhes operacionais em `../CLAUDE.md`.
- **JS/CSS servidos com `no-cache`** (revalida via ETag, 304 quando não mudou) —
  elimina a classe inteira de bug de asset stale.
- **`/admin/reset-cache`** propositalmente dentro de `/admin/*` (que o SW antigo
  trata como network-first) para nunca ser servido do cache quebrado.

## Telemetria e dados

- **Write threshold no pipeline de ingestão:** só grava leitura se Δnível ≥
  `TELEMETRIA_PCT_THRESHOLD` ou passou `TELEMETRIA_HEARTBEAT_MIN`. ESP32 envia a
  cada 10s, banco grava só o que importa.
- **Calibração e limiar da bomba ficam no banco, não no firmware.** Firmware só
  envia `adc_raw` + `bomba_rms`; conversão e decisão acontecem no backend
  (ajustável pelo painel sem regravar o ESP32).
- **CTE única** combina insert da leitura + update de last_seen + auto-resolve de
  alerta offline em um round-trip.
- **Sem tabelas agregadas** (Fases 9A/9B/9D descartadas). Agregação por bucket
  é feita on-the-fly nas queries de histórico; o write-threshold já controla
  volume. Retenção por job de limpeza (Fase 9C).
- **`timestamptz` em tudo** (timezone-aware).

## Jobs em background

- **`setTimeout` recursivo, não `setInterval`.** Cada job lê config dinâmica via
  `config.service.js` a cada tick — permite ajustar intervalo no admin sem
  deploy. Auto-iniciados pelo `app.js`, sem processo separado.
- Toda config dinâmica precisa estar na whitelist `CHAVES` de
  `config.service.js` (com tipo + min/max) para ser editável via
  `PATCH /admin/configuracoes`.

## WhatsApp + IA

- **Gateway: Meta WhatsApp Business API** — escolhido após abandonar Evolution
  API (complexa de hospedar no Railway) e Z-API (risco de ban). Número
  verificado, zero risco de ban, custo por conversa.
- **Webhook nunca bloqueia:** responde 200 imediato, processa em background
  (`setImmediate`). A Meta reenvia se demorar.
- **Idempotência por `message_id`** (constraint UNIQUE + `ON CONFLICT DO NOTHING`).
- **A IA interpreta/consulta/sugere; o backend executa.** Ações não-P1
  (`abrir_chamado`, `criar_solicitacao_orcamento`) ficam em `pendente_acao` e
  só executam após confirmação explícita do cliente. P1 (emergência) executa
  direto.
- **Contexto operacional pré-injetado** (telemetria/alertas/chamados) antes de
  cada chamada à OpenAI — a IA entra sabendo o estado real, gastando menos
  function calls.
- **State machine formal** (triagem → aguardando_confirmação → chamado_aberto /
  escalado / finalizado) + **anti-loop** (3 trocas sem avanço escala para
  humano).
- **Assumir conversa cala a IA:** com `assumida_por_id` setado, a IA não
  responde (mas as mensagens continuam sendo salvas).
- **gpt-4o-mini** por custo (~20x menor que GPT-4o), suficiente para
  classificação/atendimento. Mensagens triviais filtradas antes da API.
- **System prompt editável** via Configurações → IA (config dinâmica) — base
  para a estratégia de especialização (Fase 10).
- **Sessão WhatsApp com timeout** (8h configurável): job fecha conversa inativa
  e pede avaliação 1–4 pelo próprio WhatsApp, alimentando a curadoria.

## Mapas

- **Leaflet local** (sem CDN externo, ~150kb) + **tiles dark Carto via proxy
  próprio** (`/tiles/:z/:x/:y.png`) — resolve bloqueio por adblock/firewall
  corporativo (tudo vem do mesmo origin). Proxy tem cache em memória (4000 tiles,
  24h TTL) + dedupe de requisições inflight + rotação de subdomínios.
- **OSM fallback removido** (Carto é estável; OSM proíbe proxy em apps).
- **Geocoding híbrido:** ViaCEP (texto) + BrasilAPI + AwesomeAPI (coords) +
  Nominatim (fallback, fila de 1 req/s respeitando ToS). Reverse geocode ao
  arrastar o pino sobrescreve os campos.
- **Sem markercluster por enquanto** — adicionar quando o nº de condomínios
  justificar.
- **Classificação por zona de SP** usa mapa de ~80 bairros conhecidos (a divisão
  oficial não é simétrica; quadrante lat/lng puro falhava — ex: Capão Redondo).

## Segurança e RBAC

- **Envs obrigatórias em produção** com `process.exit(1)` se ausentes
  (`JWT_SECRET`, `CORS_ORIGINS`).
- **2FA por email obrigatório** no login (desabilitável em dev via `OTP_DISABLED`,
  lido com `.trim()` para tolerar comentário inline no .env).
- **device_key por reservatório** (não há chave global de devices).
- **Hierarquia de roles real:** admin / admin_viewer / tecnico / cliente. O
  `master_admin` foi removido (existia no código mas nunca foi atribuído).
- **`em_atendimento` só via app do técnico com GPS** (`/iniciar-atendimento`);
  `PATCH /chamados/:id` bloqueia esse status — garante que o status reflita
  presença física no campo.

## Operação / banco

- **DELETE explícito em scripts de limpeza, nunca `TRUNCATE ... CASCADE`** — no
  Postgres o CASCADE propaga para TODAS as tabelas com FK ignorando
  `ON DELETE SET NULL`, arrastando logins junto.
- **Migrations idempotentes** (`IF NOT EXISTS` / `IF EXISTS`), aplicadas com
  `node scripts/migrate.js NNN_nome.sql`. Rodar **imediatamente** ao mexer no
  schema, mesmo em dev (lição da Fase 7E: marcar fase como concluída antes de
  rodar a migration causou bug silencioso de tabela inexistente).
- **Puppeteer singleton** para PDFs — browser reutilizado entre requisições
  elimina o cold start de 10-20s no Railway; `waitUntil: domcontentloaded`
  (HTML gerado localmente, sem requests externos).
- **Upload de fotos de O.S. em base64** com `express.json({ limit: "8mb" })`;
  comprimidas client-side (~150-300KB, base64 infla ~33%).
