# Telemetria General Bombas

Plataforma de telemetria IoT para monitoramento remoto de reservatórios e bombas hidráulicas em condomínios. Ingere leituras de dispositivos ESP32 via HTTPS, gera alertas automáticos, e expõe painéis web para administração e clientes finais.

**Em produção:** [telemetria.ggeneral.com.br](https://telemetria.ggeneral.com.br)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js, Express 4, PostgreSQL 18 (`pg`) |
| Auth | JWT (7 dias) + 2FA por email (OTP 6 dígitos via Resend) + trusted devices (cookie httpOnly) |
| Frontend | HTML/CSS/JS puro, PWA instalável (manifest + service worker) |
| Visualização | Chart.js + ApexCharts |
| Firmware | ESP32 (Arduino C++), sonda 4-20mA, SCT-013 para corrente da bomba |
| Hardening | Helmet, CORS por env, rate limiting (`express-rate-limit`), bcrypt |
| Relatórios | Puppeteer (PDF) |
| Deploy | UOL Host + domínio próprio + HTTPS |

---

## Arquitetura

```
┌──────────────┐   HTTPS POST /telemetria       ┌─────────────────┐
│  ESP32       │  ─────────────────────────────▶│   API Express   │
│  + sonda     │  X-Device-Key (auth)           │                 │
│  + SCT-013   │                                │  ┌───────────┐  │
└──────────────┘                                │  │ rate limit│  │
                                                │  │ helmet    │  │
┌──────────────┐                                │  │ CORS env  │  │
│ Painel Admin │ ──── JWT + cookie 2FA ───────▶│  └───────────┘  │
│ Painel Clien.│                                │       │         │
└──────────────┘                                │       ▼         │
                                                │  ┌───────────┐  │
┌──────────────┐                                │  │ Routes    │  │
│ Job offline  │ ── setInterval 60s ──────────▶│  │ Services  │  │
│ (alertas)    │                                │  │ Jobs      │  │
└──────────────┘                                │  └───────────┘  │
                                                │       │         │
                                                │       ▼         │
                                                │  PostgreSQL     │
                                                │  (multi-tenant) │
                                                └─────────────────┘
```

### Multi-tenancy
- `condominios` → `reservatorios` (1:N) → `leituras` (1:N) → `alertas` (gerados por regras)
- Roles: `admin` (acesso total), `admin_viewer` (somente leitura), `cliente` (escopo do próprio `condominio_id`)
- Isolamento aplicado nas queries via middleware (`authRequired` + role-specific guards)

---

## Pipeline de telemetria

O endpoint `POST /telemetria` é otimizado para alto volume e baixa latência:

1. **Validação** de `device_id`, `adc_raw` (sonda) e `bomba_rms` (sensor de corrente)
2. **Auth do dispositivo** via header `X-Device-Key` comparada à `device_key` do reservatório
3. **Query única** com `LEFT JOIN LATERAL` traz reservatório + última leitura em um round-trip
4. **Conversão ADC → percentual** usando calibração por reservatório (`adc_zero`, `adc_por_metro`, `altura_total_m`)
5. **Decisão da bomba** comparando `bomba_rms` ao `limiar_bomba` configurado no painel (sem regravar firmware)
6. **Write threshold** — só persiste leitura se `Δ nivel_pct ≥ TELEMETRIA_PCT_THRESHOLD` ou se passou `TELEMETRIA_HEARTBEAT_MIN` minutos
7. **CTE única** combina `INSERT leituras` + `UPDATE last_seen` + `UPDATE alertas SET status='resolvido'` (offline auto-resolve)
8. **Geração/resolução de alertas de nível** baseada em transição de estado (alto/médio/baixo/muito_baixo)

Resultado: ESP32 envia a cada 10s, banco grava só o que importa.

---

## Banco de dados

```
condominios ──┬── reservatorios ──── leituras
              │       │
              └── usuarios          alertas (uniq partial idx por device + tipo aberto)

usuarios ──┬── login_codes (OTP 6 dígitos, expira 10min)
           └── trusted_devices (cookie de 30 dias)
```

- Schema completo em `database/schema.sql`
- Migrations versionadas em `database/migrations/` (9 migrations aplicadas)
- Índices estratégicos: `idx_leituras_device_criado` (DESC), `uniq_alerta_aberto` (parcial WHERE status='aberto')
- Timestamps em `timestamptz` (timezone-aware)

---

## API REST

### Públicas
- `POST /auth/login` — email + senha → envia OTP por email
- `POST /auth/verify-otp` — valida OTP, retorna JWT + cookie de trusted device
- `POST /telemetria` — ingestão de leituras (auth via `X-Device-Key`)
- `GET /health` — health check

### Cliente (JWT cliente)
- `GET /cliente/status` — estado atual dos reservatórios do condomínio
- `GET /cliente/historico?device_id=X&dias=N` — série temporal agregada em buckets (5min/1h/4h/12h conforme janela)
- `POST /cliente/trocar-senha`

### Admin (JWT admin)
- `GET|POST|PATCH|DELETE /condominios` — CRUD de condomínios
- `GET|POST|PATCH|DELETE /reservatorios` — CRUD + calibração + limiar da bomba
- `GET|POST|PATCH /admin/usuarios` — gestão de usuários e roles
- `GET|PATCH /alertas` — listagem e resolução manual
- `GET /relatorio/...` — geração de PDFs via Puppeteer
- `POST /jobs/run-offline` — disparo manual do job de offline

---

## Segurança

- Senhas com bcrypt (cost padrão da lib)
- JWT assinado com `JWT_SECRET` (obrigatório em produção)
- 2FA por email obrigatório no login (desabilitável em dev via `OTP_DISABLED=true`)
- Cookies httpOnly + SameSite para trusted devices
- Helmet (headers de segurança) + CORS restrito por env (`CORS_ORIGINS`)
- Rate limit no endpoint de telemetria (120 req/min por IP)
- Validação de `device_key` por reservatório (não há chave global de devices)
- Roles checadas em middleware antes de chegar nas queries

---

## Frontend

Painéis construídos em HTML/CSS/JS puro (sem framework), servidos como static via Express:

- **Login** (`/login`) — fluxo email + senha + OTP, identidade visual com gradiente azul/amarelo
- **Painel Admin** (`/admin/painel`) — sidebar dark estilo Grafana, seções para condomínios, reservatórios, alertas, usuários, relatórios
- **Painel Cliente** (`/cliente/painel`) — visualização do próprio condomínio, gauge visual dos tanques, gráfico de histórico (Chart.js), cartões de estatísticas
- **PWA** — `manifest.json` + service worker (`sw.js`), instalável em mobile

Cache estratégico via `Cache-Control: no-cache` em JS/CSS (browser revalida via ETag, não re-baixa se nada mudou).

---

## Firmware ESP32

Arquivo: `firmware/esp32_telemetria.ino`

- Lê sonda 4-20mA no pino ADC 34 (12 bits, 10 amostras com média)
- Lê sensor de corrente SCT-013 no pino 35 (500 amostras → cálculo RMS)
- Envia JSON via HTTPS a cada 10s com `device_id`, `adc_raw`, `bomba_rms`
- Sem lógica de calibração ou threshold no firmware — tudo configurável remotamente pelo painel

---

## Background jobs

`src/jobs/offline.job.js` roda via `setInterval` a cada 60s:

- Compara `last_seen` de cada reservatório com `OFFLINE_MINUTES` (default 10)
- Se ultrapassou, faz upsert do alerta `dispositivo_offline` (idempotente via `uniq_alerta_aberto`)
- Auto-iniciado pelo `app.js` (não precisa de processo separado)
- Endpoint `POST /jobs/run-offline` permite disparo manual

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

# Banco
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=
PGDATABASE=telemetria

# Auth
JWT_SECRET=troque-isto-em-producao
OTP_DISABLED=true                    # dev: desativa o 2FA

# Email (Resend)
RESEND_API_KEY=re_xxx                # opcional em dev se OTP_DISABLED=true
SMTP_FROM=telemetria@seudominio.com

# CORS
CORS_ORIGINS=http://localhost:3001

# Telemetria
OFFLINE_MINUTES=10                   # alerta após N min sem leitura
TELEMETRIA_PCT_THRESHOLD=5           # só grava se Δ% >= N
TELEMETRIA_HEARTBEAT_MIN=10          # ou se passou N min desde última gravação
```

Crie o banco e aplique o schema:

```bash
createdb telemetria
psql telemetria < database/schema.sql
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

---

## Estrutura do projeto

```
.
├── server.js                   # bootstrap (carrega .env e inicia app)
├── src/
│   ├── app.js                  # Express + middleware + routers + jobs
│   ├── config.js               # config compartilhada
│   ├── db.js                   # pool pg
│   ├── routes/                 # 11 routers (auth, telemetria, cliente, admin, ...)
│   ├── middleware/             # authRequired, adminOnly, clienteOnly, masterAdminOnly
│   ├── services/               # alertas, email
│   └── jobs/                   # offline.job
├── public/                     # frontend (admin, cliente, login, PWA, libs)
├── firmware/
│   └── esp32_telemetria.ino    # firmware do dispositivo
├── database/
│   ├── schema.sql              # schema completo
│   └── migrations/             # 9 migrations versionadas
├── INSTALACAO.md               # guia de instalação física (sonda + sensor)
└── simulador.js                # simulador de dispositivo para testes
```

---

## Roadmap

- [ ] Notificações por WhatsApp (Twilio / Z-API) para alertas críticos
- [ ] Multi-empresa (revenda white-label)
- [ ] Painel de health do sistema (uptime do device, qualidade de sinal)
- [ ] Histórico de comandos/configurações (audit log)
- [ ] Suporte a múltiplas sondas por reservatório

---

## Autor

**Pedro Martins** — Engenharia da Manutenção, General Bombas
[github.com/pedromartinslima07-beep](https://github.com/pedromartinslima07-beep)
