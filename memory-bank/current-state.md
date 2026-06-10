---
tags:
  - projeto
  - contexto/estado
aliases:
  - Estado Atual
---
# Estado Atual — Arquitetura, Módulos e Funcionalidades Prontas

## Arquitetura atual

```
ESP32 (sonda 4-20mA + SCT-013)
   │  HTTPS POST /telemetria  (X-Device-Key)
   ▼
┌─────────────────────────── Express (src/app.js) ───────────────────────────┐
│  Middleware: helmet (CSP p/ Leaflet+CEP) · compression · cors(env) ·        │
│              express.json(8mb p/ fotos base64) · cookieParser ·             │
│              static /static, /app, /uploads · _htmlNoCache nas HTMLs        │
│                                                                              │
│  Routers (19): auth · telemetria · alertas · condominios · reservatorios ·  │
│   cliente · relatorio · relatorios · admin · leituras · status · jobs ·     │
│   whatsapp · chamados · tecnicos · tecnicos-localizacao · ordens-servico ·  │
│   planos-manutencao · contratos                                              │
│                                                                              │
│  Services: alertas · email · ia · evolution(Meta API) · config ·            │
│   chamado-historico · chamado-mensagens · orcamento-pdf · os-pdf ·          │
│   relatorio-pdf                                                              │
│                                                                              │
│  Controllers: whatsapp.controller (webhook → background → IA)               │
│                                                                              │
│  Jobs (setTimeout recursivo, lêem config dinâmica a cada tick):             │
│   offline · planos-manutencao · gps-cleanup · leituras-cleanup ·            │
│   alertas-cleanup · conversas-cleanup · chamados-atraso · conversas-timeout │
│                                                                              │
│  Extras embutidos no app.js: proxy de tiles /tiles/:z/:x/:y.png (cache em   │
│   memória + dedupe inflight) · página /admin/reset-cache (limpa PWA)        │
└──────────────────────────────────┬───────────────────────────────────────┘
                                    ▼
                              PostgreSQL (multi-tenant por condominio_id)
```

- **Bootstrap:** `server.js` carrega `.env` (só em dev) e sobe `app`. Graceful
  shutdown em SIGTERM/SIGINT fecha o pool `pg`.
- **Multi-tenancy:** `condominios` → `reservatorios` → `leituras` → `alertas`;
  isolamento aplicado por middleware (`authRequired` + guards por role).
- **Pipeline de telemetria** (`POST /telemetria`): valida device → auth por
  `X-Device-Key` → query única com `LEFT JOIN LATERAL` → conversão ADC→% por
  calibração → decisão da bomba por `limiar_bomba` → **write threshold** (só
  grava se Δ% ≥ threshold ou passou heartbeat) → CTE única (insert leitura +
  update last_seen + auto-resolve offline) → geração/resolução de alertas.

## Módulos existentes (por router)

| Módulo | Responsabilidade |
|---|---|
| **auth** | Login email+senha → OTP → JWT + trusted device cookie |
| **telemetria** | Ingestão de leituras dos ESP32 |
| **condominios / reservatorios** | CRUD + calibração + limiar + lat/lng/CEP/CNPJ/nome_fantasia |
| **cliente** | Status e histórico do próprio condomínio |
| **alertas** | Página unificada telemetria+chamados, comentários, análise IA |
| **whatsapp** | Webhook Meta, conversas, central de atendimento, curadoria IA (contatos WhatsApp removidos da UI até módulo ser ativado) |
| **chamados** | Ciclo do chamado, P1–P4, SLA, recorrência, a-caminho/chegou |
| **tecnicos / tecnicos-localizacao** | Cadastro técnicos + GPS + ETA |
| **ordens-servico** | O.S. digital (fotos, assinatura, orçamento) + PDF. Fotos persistidas em `os_fotos.dados_base64` (banco), servidas via `GET /ordens-servico/:osId/fotos/:fotoId/imagem` — não dependem mais de disco efêmero. |
| **planos-manutencao** | Planos preventivos recorrentes |
| **contratos** | Contratos por condomínio |
| **orçamentos** | Sistema unificado (tabela `orcamentos` + `orcamento_linhas`) |
| **relatorio / relatorios** | PDFs (Puppeteer) + dashboards de relatório |
| **admin** | Usuários, status agregado, histórico, geocode, configurações |
| **status / leituras / jobs** | Endpoints auxiliares e disparo manual de jobs |

## Funcionalidades prontas (✅)

**Telemetria & alertas**
- Ingestão ESP32 com write-threshold e auto-resolve de offline.
- Job offline (alerta após N min sem leitura, idempotente).
- Seção **Telemetria avançada** (5 KPIs, bar chart de níveis, críticos, status
  das bombas, histórico 24h/3d/7d com export PDF).
- Página **/alertas unificada** (telemetria + chamados): KPIs clicáveis, tabela
  unificada, painel lateral com gauge/histórico, ações recomendadas hardcoded,
  **análise IA sob demanda**, comentários.

**Painel admin "Mission Control"**
- Redesign premium (sidebar colapsável, topbar, cards de métrica com sparkline,
  mission control grid, feed em tempo real, IA Insights).
- **Mapa interativo Leaflet** (tiles OpenStreetMap + filtro CSS dark): pinos por
  status, painel lateral com tabs, KPIs, donuts, classificação por zona de SP.
- Cadastro de coordenadas com **geocoding híbrido** (ViaCEP + BrasilAPI +
  AwesomeAPI + Nominatim) e reverse geocode ao arrastar o pino.
- Polling independente por tipo (telemetria 7s / chamados+WhatsApp 20s), badges
  de notificação que somem ao entrar na seção.

**WhatsApp + IA (central de atendimento)**
- Webhook Meta (formato `entry[].changes[].value.messages[]`) + verificação GET.
- Processamento em background (responde 200 imediato), idempotência por
  message_id, segurança por verify token.
- **IA com function calling** (gpt-4o-mini): busca telemetria, abre chamados,
  vincula condomínio, busca status do técnico (ETA via GPS+Haversine).
- **Contexto operacional pré-injetado** (telemetria/alertas/chamados) antes de
  cada chamada à OpenAI.
- **State machine** (triagem → aguardando_confirmação → chamado_aberto /
  escalado / finalizado) + **anti-loop** (3 trocas sem avanço → escala humano).
- Central CRM 3 colunas: lista/chat/info, assumir conversa (IA cala), envio
  manual, IA assistiva (resumir / sugerir resposta), fechar/reabrir/apagar.
- **Timeout de sessão** (8h, configurável) → fecha + pede avaliação 1–4 no
  WhatsApp → alimenta curadoria.
- **Curadoria** (Migration 038): qualidade do atendimento + export NDJSON com
  PII scrubbing para futuro fine-tuning.

**Chamados, SLA e O.S.**
- Criticidade **P1–P4** com SLA de chegada do técnico, regra de recorrência
  (mesma falha no mês sobe 1 nível), endpoints `/a-caminho` e `/chegou`.
- **SLA configurável** + métricas TTFR/TTR + **Dashboard SLA**.
- **O.S. digital** completa (fotos base64 comprimidas, assinatura, orçamento) +
  PDF via Puppeteer; página de O.S. no admin.
- Histórico de chamados, mensagens do chamado, avaliação.
- **Orçamentos unificados** (Migration 030) + encaminhamento via IA por email.
  **Envio do orçamento ao cliente por e-mail** (PDF anexo via Resend, botão no modal;
  destinatário de `condominios.email` — múltiplos por vírgula; marca `enviado` +
  `enviado_em/enviado_para`, migration 047). Remetente: `comercial@generalbombas.com`.
- Planos de manutenção preventiva + contratos.

**App mobile (Capacitor)** — `app/public/`
- Telas técnico: chamados, detalhe, O.S., conta; ciclo com GPS.
- Telas cliente/síndico: home, telemetria, chamados (KPIs clicáveis), conta,
  suporte, novo chamado, detalhe.
- Auth + onboarding; rastreamento GPS; herda visual do admin.
- **Camada visual HUD "Painel de comando"** (jun/2026): grid técnico + scanline
  de fundo, dados em monospace, headers
  uppercase tracked, indicador de aba no bottom-nav. Bloco aditivo no fim de
  `app/public/app.css` + tokens `--hud-*`; só mobile, não afeta admin/site.

**Segurança & operação**
- Envs obrigatórias em produção (JWT_SECRET, CORS_ORIGINS) com `process.exit(1)`.
- RBAC com 5 roles: **admin** (tudo), **gerente** (tudo exceto config → só "conta"), **operador** (Monitor + Chamados + config "conta"), **admin_viewer** (legado, viewer-only-hide), **tecnico**, **cliente**.
- **Configurações dinâmicas** editáveis pelo admin (whitelist `CHAVES` em
  `config.service.js`) — intervalos de job, modelo IA, timeouts, sem deploy.
- Email de alerta crítico (Resend).
- Cache em 3 camadas documentado (ver [`../CLAUDE.md`](../CLAUDE.md)).

## Banco de dados

- `database/schema.sql` tem o schema base (condominios, reservatorios, leituras,
  alertas, usuarios, login_codes, trusted_devices).
- **Toda a evolução está em `migrations/001..046`** (WhatsApp, mapa, chamados,
  técnicos, O.S., orçamentos, SLA P1-P4, planos, contratos, state machine, etc.).
- Aplicar com `node scripts/migrate.js NNN_nome.sql` (lê `DATABASE_URL`).
  `migrations/migrate.js` em `scripts/`.
- Scripts utilitários: `limpar-dados-teste.sql`, `restaurar-defaults.sql`.

> ⚠️ Há **duas** pastas de migrations: `migrations/` (numeradas 001-044, atuais)
> e `database/migrations/` (datadas, do schema original de 2026-03/04). As ativas
> são as numeradas.
