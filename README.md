# Telemetria General Bombas

Plataforma de **telemetria IoT + gestão de manutenção predial** para condomínios. Monitora reservatórios de água e bombas hidráulicas em tempo real (dispositivos ESP32 via HTTPS), gera alertas automáticos, e expande para todo o ciclo de manutenção: atendimento via **WhatsApp com IA**, **chamados com SLA P1–P4**, **Ordens de Serviço digitais**, **rastreamento GPS de técnicos** e **app mobile** (técnico e cliente).

**Em produção:** [telemetria.ggeneral.com.br](https://telemetria.ggeneral.com.br) · Deploy no **Railway**.

> A IA **interpreta, consulta e sugere — o backend executa**. Ações não-emergenciais só acontecem após confirmação explícita do cliente.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js, Express 4, PostgreSQL (`pg`) |
| Banco/Deploy | PostgreSQL + Node no **Railway** |
| Auth | JWT (7 dias) + 2FA por email (OTP 6 dígitos via Resend) + trusted devices (cookie httpOnly) |
| Frontend | HTML/CSS/JS **puro** (sem framework/build), PWA instalável |
| App mobile | **Capacitor** empacotando HTML/CSS/JS puro (`app/public/`) |
| IA | OpenAI `gpt-4o-mini` (function calling) |
| WhatsApp | **Meta WhatsApp Business API** (número oficial verificado) |
| Visualização | Chart.js + ApexCharts + Leaflet (mapas, tiles dark Carto via proxy) |
| Firmware | ESP32 (Arduino C++), sonda 4-20mA + SCT-013 (corrente da bomba) |
| Relatórios/PDF | Puppeteer (browser singleton) |
| Hardening | Helmet, CORS por env, rate limiting, bcrypt |

> **Frontend é vanilla por decisão deliberada — não migrar para Next/React/Vite**, nem nos redesigns. Visual unificado "Mission Control" (paleta dark, brand amber `#f0b014`); o app mobile herda os tokens de `public/admin.css`.

---

## Arquitetura

```
ESP32 (sonda 4-20mA + SCT-013)
   │  HTTPS POST /telemetria  (X-Device-Key)
   ▼
┌──────────────────────── API Express (src/app.js) ───────────────────────┐
│  helmet (CSP p/ Leaflet+CEP) · compression · cors(env) · rate limit ·    │
│  express.json(8mb p/ fotos O.S.) · cookieParser · static · _htmlNoCache  │
│                                                                          │
│  Routers (19) · Services (10) · Controllers · Jobs (8, setTimeout)       │
│  Extras: proxy de tiles /tiles/:z/:x/:y.png · /admin/reset-cache (PWA)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
                          PostgreSQL (multi-tenant por condominio_id)
                          jobs em background  ──▶ alertas, limpeza, SLA, IA
```

### Multi-tenancy
- `condominios` → `reservatorios` (1:N) → `leituras` (1:N) → `alertas`
- Roles: `admin` (total), `admin_viewer` (somente leitura), `tecnico` (campo + GPS + O.S.), `cliente` (escopo do próprio `condominio_id`)
- Isolamento aplicado nas queries via middleware (`authRequired` + guards por role)

---

## Módulos

| Módulo (router) | Responsabilidade |
|---|---|
| **auth** | Login email+senha → OTP → JWT + trusted device |
| **telemetria** | Ingestão de leituras dos ESP32 |
| **condominios / reservatorios** | CRUD + calibração + limiar da bomba + lat/lng/CEP |
| **cliente** | Status e histórico do próprio condomínio |
| **alertas** | Página unificada (telemetria + chamados), comentários, análise IA |
| **whatsapp** | Webhook Meta, central de atendimento CRM, curadoria de IA |
| **chamados** | Ciclo do chamado, criticidade P1–P4, SLA, recorrência |
| **tecnicos / tecnicos-localizacao** | Cadastro de técnicos + GPS + ETA |
| **ordens-servico** | O.S. digital (fotos, assinatura, orçamento) + PDF |
| **planos-manutencao** | Planos preventivos recorrentes |
| **contratos** | Contratos por condomínio |
| **relatorio / relatorios** | PDFs (Puppeteer) + dashboards |
| **admin** | Usuários, status agregado, histórico, geocode, configurações dinâmicas |
| **status / leituras / jobs** | Endpoints auxiliares e disparo manual de jobs |

---

## Pipeline de telemetria

O endpoint `POST /telemetria` é otimizado para alto volume e baixa latência:

1. **Validação** de `device_id`, `adc_raw` (sonda) e `bomba_rms` (sensor de corrente)
2. **Auth do dispositivo** via header `X-Device-Key` comparada à `device_key` do reservatório
3. **Query única** com `LEFT JOIN LATERAL` traz reservatório + última leitura em um round-trip
4. **Conversão ADC → percentual** usando calibração por reservatório (`adc_zero`, `adc_por_metro`, `altura_total_m`)
5. **Decisão da bomba** comparando `bomba_rms` ao `limiar_bomba` configurado no painel (sem regravar firmware)
6. **Write threshold** — só persiste leitura se `Δ nivel_pct ≥ TELEMETRIA_PCT_THRESHOLD` ou se passou `TELEMETRIA_HEARTBEAT_MIN` minutos
7. **CTE única** combina `INSERT leituras` + `UPDATE last_seen` + auto-resolve de alerta offline
8. **Geração/resolução de alertas de nível** baseada em transição de estado

Resultado: ESP32 envia a cada 10s, banco grava só o que importa.

---

## WhatsApp + IA

Assistente de atendimento que conversa com clientes em linguagem natural e consulta dados reais do backend.

- **Gateway:** Meta WhatsApp Business API (webhook `POST /whatsapp/webhook`, verificação `GET`). Migrado da Evolution API.
- **Webhook não bloqueia** — responde `200` imediato e processa em background (`setImmediate`). Idempotência por `message_id` (`ON CONFLICT DO NOTHING`).
- **IA com function calling** (`gpt-4o-mini`): busca telemetria, abre chamados, vincula condomínio, estima ETA do técnico via GPS+Haversine.
- **Contexto operacional pré-injetado** (telemetria/alertas/chamados) antes de cada chamada à OpenAI.
- **State machine** (triagem → aguardando_confirmação → chamado_aberto / escalado / finalizado) + **anti-loop** (3 trocas sem avanço → escala para humano).
- **Central CRM** de 3 colunas no admin: lista / chat / info. Atendente pode **assumir a conversa** (a IA cala), responder manualmente, pedir resumo/sugestão à IA, fechar/reabrir/apagar.
- **Timeout de sessão** (8h, configurável) → fecha a conversa e pede avaliação 1–4 pelo próprio WhatsApp → alimenta a curadoria para treino futuro da IA.

Fluxo de exemplo:

```
Cliente: "a bomba parou, estamos sem água"
IA → buscar_telemetria → { bomba_ligada: false, nivel_pct: 18 }
IA → "Confirmei: bomba desligada, reservatório em 18%. Posso abrir um chamado de emergência?"
Cliente: "sim"  →  backend abre chamado P1, equipe notificada
```

---

## Chamados, SLA e Ordens de Serviço

- **Criticidade P1–P4** com SLA de **chegada do técnico** (não de resolução):
  | Nível | SLA chegada | Descrição |
  |---|---|---|
  | P1 Crítico | ≤ 3h | sem água, alagamento, risco imediato |
  | P2 Alta | 24–48h | funciona parcialmente, risco de agravar |
  | P3 Controlado | ≤ 72h | funciona, precisa de inspeção |
  | P4 Agendado | conforme agenda | preventiva, instalação planejada |
- Recorrência (mesma falha no mês) **sobe 1 nível** automaticamente.
- Ciclo: `aberto → técnico atribuído → em atendimento (GPS chegada) → O.S. digital → concluído (PDF)`.
- **`em_atendimento` só via app do técnico** (`/iniciar-atendimento` com GPS) — garante presença física.
- **Métricas TTFR/TTR** + **Dashboard SLA** por técnico / prioridade / período.
- **O.S. digital:** fotos (base64 comprimido), assinatura, orçamento → PDF via Puppeteer.
- **Orçamentos unificados** + encaminhamento via IA por email; planos de manutenção preventiva; contratos.

---

## App mobile (Capacitor)

`app/public/` — HTML/CSS/JS puro empacotado pelo Capacitor, herdando o visual do admin.

- **Técnico:** lista de chamados, detalhe, ciclo de atendimento com GPS, O.S. digital, conta.
- **Cliente/síndico:** home, telemetria do condomínio, chamados (KPIs clicáveis), abertura de chamado, suporte, conta.

Em dev o Express serve `/app/*` a partir de `app/public/`. Em produção o Capacitor empacota e faz fetch direto ao backend.

---

## Banco de dados

```
condominios ──┬── reservatorios ──── leituras
              ├── usuarios          alertas (uniq partial idx por device + tipo aberto)
              ├── chamados ──── ordens_servico / historico_chamados / orcamentos
              ├── conversas_whatsapp ──── mensagens_whatsapp
              ├── planos_manutencao
              └── contratos
usuarios ──┬── login_codes (OTP, expira 10min)
           ├── trusted_devices (cookie 30 dias)
           └── tecnico_localizacoes (GPS)
```

- Schema base em `database/schema.sql` (condominios, reservatorios, leituras, alertas, usuarios, login_codes, trusted_devices).
- **A evolução está nas migrations numeradas `migrations/001..043`** (WhatsApp, mapa, chamados, técnicos, O.S., orçamentos, SLA P1-P4, planos, contratos, state machine, ...).
- Aplicar com `node scripts/migrate.js NNN_nome.sql` (lê `DATABASE_URL` do `.env`). Usar `IF NOT EXISTS`/`IF EXISTS` (idempotente).
- Timestamps em `timestamptz` (timezone-aware).

> ⚠️ Existe também `database/migrations/` (arquivos datados de 2026-03/04) com o schema original. As migrations **ativas** são as numeradas em `migrations/`.

---

## API REST (resumo)

### Públicas
- `POST /auth/login` — email + senha → envia OTP por email
- `POST /auth/verify-otp` — valida OTP, retorna JWT + cookie de trusted device
- `POST /telemetria` — ingestão de leituras (auth via `X-Device-Key`)
- `GET|POST /whatsapp/webhook` — verificação + eventos da Meta API
- `GET /health` — health check
- `GET /tiles/:z/:x/:y.png` — proxy de tiles do mapa

### Cliente (JWT cliente)
- `GET /cliente/status` · `GET /cliente/historico` · chamados do próprio condomínio

### Admin (JWT admin)
- CRUD de `condominios`, `reservatorios`, usuários, chamados, técnicos, O.S., orçamentos, planos, contratos
- `/alertas`, `/whatsapp/conversas`, `/admin/status`, `/admin/historico`, `/admin/geocode`, `/admin/configuracoes`
- `GET /relatorio/...` — PDFs via Puppeteer

---

## Background jobs

`setTimeout` recursivo (não `setInterval`), auto-iniciados pelo `app.js`. Cada tick lê config dinâmica via `config.service.js` — permite ajustar intervalos no admin **sem deploy**.

- `offline.job` — alerta `dispositivo_offline` após `OFFLINE_MINUTES` sem leitura
- `chamados-atraso.job` — alerta de SLA estourado / email automático
- `conversas-timeout.job` — fecha conversa WhatsApp inativa e pede avaliação
- `planos-manutencao.job` — gera chamados preventivos
- `gps-cleanup` · `leituras-cleanup` · `alertas-cleanup` · `conversas-cleanup` — retenção

---

## Segurança

- Senhas com bcrypt; JWT assinado com `JWT_SECRET` (**obrigatório** em produção — `process.exit(1)` se ausente, idem `CORS_ORIGINS`)
- 2FA por email obrigatório no login (desabilitável em dev via `OTP_DISABLED=true`)
- Cookies httpOnly + SameSite para trusted devices
- Helmet + CORS restrito por env + rate limit no endpoint de telemetria
- `device_key` por reservatório (não há chave global de devices)
- RBAC checado em middleware: `admin` / `admin_viewer` / `tecnico` / `cliente`

---

## Cache (atenção)

Existem **3 camadas de cache** que precisam ser sincronizadas ao mexer no admin — é o bug mais comum do projeto. Resumo: bumpe `?v=N` em `admin.html` ao mexer em `admin.js`/`admin.css`; ao criar endpoint backend adicione-o à lista network-first do `sw.js` e bumpe `CACHE_NAME`. Detalhes completos em [`CLAUDE.md`](CLAUDE.md). Saída de emergência: `GET /admin/reset-cache`.

---

## Setup local

```bash
git clone https://github.com/pedromartinslima07-beep/telemetriageneralbombas.git
cd telemetriageneralbombas
npm install
```

Crie `.env` na raiz:

```env
PORT=3001

# Banco (use DATABASE_URL ou as PG* separadas)
DATABASE_URL=postgres://user:pass@host:5432/telemetria

# Auth
JWT_SECRET=troque-isto-em-producao
OTP_DISABLED=true                    # dev: desativa o 2FA

# Email (Resend)
RESEND_API_KEY=re_xxx
SMTP_FROM=telemetria@seudominio.com

# CORS
CORS_ORIGINS=http://localhost:3001

# Telemetria
OFFLINE_MINUTES=10
TELEMETRIA_PCT_THRESHOLD=5
TELEMETRIA_HEARTBEAT_MIN=10

# IA + WhatsApp (Meta Business API)
OPENAI_API_KEY=sk-...
WHATSAPP_VERIFY_TOKEN=general-bombas-verify-2026
WHATSAPP_ACCESS_TOKEN=token-permanente-do-sistema-meta
WHATSAPP_PHONE_NUMBER_ID=id-do-numero-no-meta
```

Aplique o schema e as migrations:

```bash
psql "$DATABASE_URL" < database/schema.sql
node scripts/migrate.js 001_whatsapp_ia.sql   # ... e demais migrations em ordem
```

Suba a API:

```bash
npm run dev    # com --watch
# ou
npm start
```

Simulador de dispositivo (sem firmware):

```bash
npm run sim
```

### Ativar WhatsApp (Meta for Developers)

1. developers.facebook.com → criar app **Business** → adicionar produto **WhatsApp**
2. Obter `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp > Configuração da API)
3. Gerar `WHATSAPP_ACCESS_TOKEN` permanente (Usuário do Sistema no Business Manager)
4. Definir `WHATSAPP_VERIFY_TOKEN` (mesmo valor no painel de webhook da Meta)
5. Registrar webhook na Meta: `https://SEU_DOMINIO/whatsapp/webhook`

---

## Firmware ESP32

Arquivo: `firmware/esp32_telemetria.ino`

- Lê sonda 4-20mA no pino ADC 34 (12 bits, média de amostras)
- Lê sensor de corrente SCT-013 no pino 35 (cálculo RMS)
- Envia JSON via HTTPS a cada 10s com `device_id`, `adc_raw`, `bomba_rms`
- **Sem lógica de calibração ou threshold no firmware** — tudo configurável remotamente pelo painel

Guia de instalação física (sonda + sensor) em [`INSTALACAO.md`](INSTALACAO.md).

---

## Estrutura do projeto

```
.
├── server.js                   # bootstrap (.env + listen + graceful shutdown)
├── src/
│   ├── app.js                  # Express + middleware + routers + jobs + proxy de tiles
│   ├── db.js                   # pool pg
│   ├── routes/                 # 19 routers
│   ├── controllers/            # whatsapp.controller (webhook → IA)
│   ├── middleware/             # authRequired, adminOnly, clienteOnly, masterAdminOnly
│   ├── services/               # ia, evolution(Meta), alertas, email, config, PDFs, ...
│   └── jobs/                   # 8 jobs em background
├── public/                     # frontend web (admin, cliente, login, PWA, libs locais)
├── app/                        # app mobile Capacitor (app/public/ = HTML/CSS/JS)
├── firmware/esp32_telemetria.ino
├── database/schema.sql         # schema base
├── migrations/                 # migrations numeradas 001..043 (ativas)
├── scripts/migrate.js          # aplicador de migrations
├── CLAUDE.md                   # convenções e pegadinhas do projeto
├── PLANO_WHATSAPP_IA.md        # histórico detalhado fase a fase
├── memory-bank/                # brief, estado atual, decisões, roadmap
└── simulador.js                # simulador de dispositivo
```

---

## Roadmap

**Entregue:** telemetria + alertas · WhatsApp + IA · chamados P1–P4 + SLA · O.S. digital · GPS de técnicos · mapa interativo · app mobile (técnico + cliente) · dashboard SLA · curadoria de conversas para treino da IA.

**Pendente / em andamento:**
- [ ] Configurar credenciais Meta e ativar WhatsApp em produção (código pronto)
- [ ] Treinar IA com histórico — few-shot/fine-tuning (aguarda volume de conversas curadas)
- [ ] Push notifications nativas (depende da publicação nas lojas)
- [ ] Publicação na Play Store

Histórico completo e decisões em [`PLANO_WHATSAPP_IA.md`](PLANO_WHATSAPP_IA.md) e [`memory-bank/`](memory-bank/).

---

## Autor

**Pedro Martins** — Engenharia da Manutenção, General Bombas
[github.com/pedromartinslima07-beep](https://github.com/pedromartinslima07-beep)
