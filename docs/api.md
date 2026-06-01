# API REST

API Express montada em `src/app.js`. Todas as respostas são JSON salvo PDFs
(Puppeteer) e tiles de mapa (PNG).

## Autenticação e roles

- **JWT** (válido 7 dias) no header `Authorization: Bearer <token>`, obtido após
  login + verificação de OTP. Trusted devices via cookie httpOnly (30 dias)
  pulam o OTP.
- Middlewares (`src/middleware/`):
  - `authRequired` — exige JWT válido; popula `req.user`.
  - `adminOnly` — `admin` ou `admin_viewer` (leitura).
  - `masterAdminOnly` — apenas `admin` (escrita/admin sensível; o nome é
    histórico, hoje equivale a `admin`).
  - `clienteOnly` — role `cliente`, escopo do próprio `condominio_id`.
- Convenção observada: **GET de admin** usa `adminOnly` (viewer enxerga);
  **POST/PATCH/DELETE** sensíveis usam `masterAdminOnly` (só admin escreve).

## Rate limiting

`express-rate-limit` em: `/auth/login` (loginLimiter), `/auth/verify-otp`
(otpLimiter) e `/telemetria` (telemetriaLimiter).

---

## Públicas (sem JWT)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check (`{status:"ok"}`) |
| POST | `/auth/login` | email+senha → envia OTP por email |
| POST | `/auth/verify-otp` | valida OTP → JWT + cookie trusted device |
| POST | `/telemetria` | ingestão de leitura (auth via header `X-Device-Key`) |
| GET | `/whatsapp/webhook` | verificação do webhook da Meta (`hub.challenge`) |
| POST | `/whatsapp/webhook` | recebe eventos da Meta API (valida verify token) |
| GET | `/tiles/:z/:x/:y.png` | proxy de tiles do mapa (Carto), cache em memória |
| GET | `/` `/login` `/admin/painel` `/cliente/painel` | páginas HTML (no-cache) |
| GET | `/admin/reset-cache`, `/reset-cache` | limpa SW/caches do PWA |
| GET | `/manifest.json`, `/sw.js` | PWA |

---

## Auth (`/auth`)

| Método | Rota | Acesso |
|---|---|---|
| POST | `/auth/registrar` | masterAdmin (cadastra usuário) |
| GET | `/auth/me` | autenticado (dados do usuário logado) |
| POST | `/auth/trocar-senha` | autenticado |
| GET | `/auth/dispositivos` | autenticado (lista trusted devices) |
| DELETE | `/auth/dispositivos/:id` · `/auth/dispositivos` | autenticado (revoga 1 / todos) |

---

## Telemetria e infraestrutura

**Condomínios** (`/condominios`)
| Método | Rota | Acesso |
|---|---|---|
| GET | `/condominios` · `/condominios/:id` | adminOnly |
| POST | `/condominios` | masterAdmin (aceita lat/lng/cep/cnpj) |
| PATCH/DELETE | `/condominios/:id` | masterAdmin (DELETE = soft/inativar) |
| DELETE | `/condominios/:id/hard` | masterAdmin (remoção física) |

**Reservatórios** (`/reservatorios`)
| GET | `/reservatorios` · `/reservatorios/:id` | adminOnly |
| POST · PATCH · DELETE | `/reservatorios[/:id]` | masterAdmin (calibração + limiar) |
| POST | `/reservatorios/:id/regenerar-device-key` | masterAdmin |

**Leituras / status / jobs**
| GET | `/ultima-leitura/:device_id` | adminOnly |
| GET | `/status/:device_id` | adminOnly |
| POST | `/jobs/verificar-offline` | adminOnly (dispara job offline) |

---

## Alertas (`/alertas`) — telemetria

| GET | `/alertas-abertos` | adminOnly |
| GET | `/alertas/:device_id` | adminOnly (histórico do device) |
| PATCH | `/alertas/:id/fechar` | masterAdmin |
| GET | `/alertas/comentarios/:origem/:id` | adminOnly |
| POST | `/alertas/comentarios` | adminOnly |
| POST | `/alertas/analisar-ia` | adminOnly (análise sob demanda, gpt-4o-mini) |

---

## WhatsApp + IA (`/whatsapp`)

Webhook em **Públicas**. Demais exigem admin:

| GET | `/whatsapp/conversas` · `/conversas/:id` | adminOnly |
| PATCH | `/conversas/:id/fechar` · `/reabrir` | adminOnly |
| PATCH | `/conversas/:id/assumir` · `/devolver-ia` | adminOnly (IA cala / volta) |
| PATCH | `/conversas/:id/vincular-condominio` | adminOnly |
| POST | `/conversas/:id/responder` | adminOnly (envia via Meta API) |
| POST | `/conversas/:id/resumir` · `/sugerir-resposta` | adminOnly (IA assistiva) |
| PATCH | `/conversas/:id/qualidade` | adminOnly (curadoria) |
| GET | `/conversas/curadoria/stats` | adminOnly |
| GET | `/conversas/export` | masterAdmin (NDJSON + PII scrubbing) |
| DELETE | `/conversas/:id` | adminOnly |

---

## Chamados (`/chamados`)

| POST | `/chamados` | masterAdmin (criação manual) |
| GET | `/chamados` · `/chamados/:id` · `/:id/historico` | adminOnly |
| PATCH | `/chamados/:id` | masterAdmin (status/responsável; bloqueia `em_atendimento`) |
| GET | `/chamados/meus` · `/meus/:id` | técnico autenticado |
| GET/POST | `/chamados/meus/:id/mensagens` | técnico (chat do chamado) |
| POST | `/chamados/:id/iniciar-atendimento` | técnico (com GPS → `em_atendimento`) |
| POST | `/chamados/:id/a-caminho` · `/:id/chegou` | técnico (SLA de chegada) |

---

## Técnicos (`/tecnicos`)

| GET | `/tecnicos` | adminOnly |
| POST · PATCH · DELETE | `/tecnicos[/:id]` | masterAdmin |
| GET | `/tecnicos/config` | autenticado (frequência de GPS) |
| POST | `/tecnicos/localizacao` | autenticado (app envia GPS) |
| GET | `/tecnicos/localizacao` | adminOnly (posições atuais) |
| GET | `/tecnicos/:id/historico-gps` | adminOnly |

---

## Ordens de Serviço (`/ordens-servico`)

Guard `osDonoOuAdmin()` — técnico dono da O.S. ou admin; `{forWrite:true}`
restringe escrita.

| POST · GET | `/ordens-servico` | adminOnly |
| GET | `/ordens-servico/:id` · `/:id/pdf` | dono ou admin |
| PATCH | `/ordens-servico/:id` | dono/admin (escrita) |
| POST | `/:id/fotos/upload` · `/:id/fotos` | dono/admin (base64) |
| DELETE | `/:id/fotos/:foto_id` | dono/admin |
| POST/PATCH/DELETE | `/:id/pecas[/:peca_id]` | dono/admin |
| POST | `/:id/finalizar` | dono/admin (gera PDF) |

---

## Planos de manutenção e contratos

**Planos** (`/planos-manutencao`) — todos masterAdmin:
GET (lista/`:id`), POST, PATCH, DELETE, `POST /:id/executar-agora`.

**Contratos** (`/contratos`):
GET `/`, `/metricas`, `/:id` (adminOnly); POST/PATCH/DELETE (masterAdmin).

---

## Admin (`/admin`)

| GET | `/admin/status` | adminOnly (status agregado por condomínio + lat/lng/endereço) |
| GET | `/admin/historico?device_ids=A,B&horas=N` | adminOnly (até 10 devices) |
| GET | `/admin/geocode?q=` · `/admin/reverse-geocode?lat=&lon=` | adminOnly (proxy Nominatim) |
| GET/POST/PATCH/DELETE | `/admin/usuarios[/:id]` | GET adminOnly; escrita masterAdmin |
| POST | `/admin/usuarios/:id/reset-senha` | masterAdmin |
| GET/PATCH | `/admin/configuracoes` | masterAdmin (config dinâmica) |
| GET | `/admin/integracoes/status` | masterAdmin (OpenAI/WhatsApp/Resend configurados?) |
| POST | `/admin/jobs/{chamados-atraso,leituras-cleanup,alertas-cleanup,conversas-cleanup}/run` | masterAdmin |
| GET/PATCH | `/admin/sla[/:prioridade]` | masterAdmin |
| ... | `/admin/orcamentos*` e `/admin/orcamentos/avulsos*` | adminOnly (CRUD + PDF) |
| GET | `/admin/condominios/:id/historico` · `/condominios/lista` | adminOnly |
| GET/POST/PATCH/DELETE | `/admin/whatsapp/contatos[/:id]` | adminOnly (pré-cadastro) |

---

## Cliente / síndico (`/cliente`) — role `cliente`

| GET | `/cliente/status` | reservatórios do próprio condomínio |
| GET | `/cliente/historico` | série temporal agregada |
| POST | `/cliente/trocar-senha` | |
| GET | `/cliente/chamados` · `/chamados/:id` | chamados do condomínio |
| GET/POST | `/cliente/chamados/:id/mensagens` | chat do chamado |
| POST | `/cliente/chamados/:id/avaliar` | nota 1-5 pós-atendimento |
| POST | `/cliente/chamados` | abre chamado |
| GET | `/cliente/ordens-servico/:id/pdf` | PDF da O.S. |
| GET/POST | `/cliente/chat` · `/chat/mensagens` · `/chat/mensagem` | suporte interno |

---

## Relatórios

**`/relatorio/pdf`** — autenticado (admin geral; cliente restrito ao seu
condomínio). Gera PDF de telemetria via Puppeteer.

**`/relatorios`** (adminOnly): `/chamados`, `/pdf-chamados`, `/alertas`,
`/telemetria`, `/insights`, `/sla-metricas`, `/sla-dashboard`.
