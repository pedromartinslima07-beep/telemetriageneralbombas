---
tags:
  - projeto
  - doc/api
aliases:
  - API REST
  - Endpoints
---
# API REST

API Express montada em `src/app.js`. Todas as respostas são JSON salvo PDFs
(Puppeteer) e tiles de mapa (PNG).

## Autenticação e roles

- **JWT** (válido 7 dias) no header `Authorization: Bearer <token>`, obtido após
  login + verificação de OTP. Trusted devices via cookie httpOnly (30 dias)
  pulam o OTP.
- Middlewares (`src/middleware/`):
  - `authRequired` — exige JWT válido; popula `req.user`.
  - `adminOnly` — `admin`, `gerente` ou `operador` (acesso ao painel).
  - `gestaoOnly` — `admin` ou `gerente` (operação do negócio, sem o operador).
  - `masterAdminOnly` — apenas `admin` (sensível/irreversível; o nome é
    histórico, hoje equivale a `admin`).
  - `clienteOnly` — role `cliente`, escopo do próprio `condominio_id`. É
    **async**: consulta `condominios.ativo` a cada request e responde 403 se o
    condomínio foi inativado ou apagado.
- Convenção: o que é **irreversível** (apagar cliente, mexer em reservatório,
  usuários, config) é `masterAdminOnly`; o que é **operação do negócio**
  (planos, contratos, cadastro de cliente) é `gestaoOnly`; o resto do painel é
  `adminOnly`. Divisão completa em
  [modulos/autenticacao.md](modulos/autenticacao.md).

## Rate limiting

`express-rate-limit` em: `/auth/login` (loginLimiter), `/auth/verify-otp`
(otpLimiter) e `/telemetria` (telemetriaLimiter).

## Erros e 404

No fim de `src/app.js` há um handler de 404 e um handler de erro que sempre
respondem `{ error }` em JSON — inclusive nos erros que nunca chegam às rotas:
`entity.too.large` (413, body acima do limite de 8 mb do `express.json`) e
`entity.parse.failed` (400, JSON malformado). Sem eles o Express responde a
página HTML padrão e o front quebra com `Unexpected token '<', "<!DOCTYPE "`,
escondendo o erro real. Só o 404 de **página** (GET com `Accept: text/html`)
segue no comportamento padrão do Express.

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
| POST | `/condominios` | **gestao** (aceita lat/lng/cep/cnpj) |
| PATCH | `/condominios/:id` | **gestao** |
| DELETE | `/condominios/:id` | masterAdmin (soft/inativar). `ativo = false` no condomínio e nos reservatórios — **revoga o acesso dos logins de cliente** (contas preservadas). `PATCH {ativo:true}` devolve |
| DELETE | `/condominios/:id/hard` | masterAdmin (remoção física). Exige `{ senha }` do admin logado. **Apaga junto os `usuarios` com `role='cliente'` do condomínio** (e por CASCADE seus `login_codes`/`trusted_devices`) — responde `{ ok, usuarios_removidos, usuarios[] }`. `409` se alguma FK de autoria bloquear (nada é apagado) |

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
| PATCH | `/alertas/:id/fechar` | **adminOnly** |
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
| GET | `/conversas/export` | **gestao** (NDJSON + PII scrubbing) |
| DELETE | `/conversas/:id` | adminOnly |

---

## Chamados (`/chamados`)

| POST | `/chamados` | **adminOnly** (criação manual) |
| GET | `/chamados` · `/chamados/:id` · `/:id/historico` | adminOnly |
| PATCH | `/chamados/:id` | **adminOnly** (status/responsável; bloqueia `em_atendimento`) |
| GET | `/chamados/meus` · `/meus/:id` | técnico autenticado |
| GET/POST | `/chamados/meus/:id/mensagens` | técnico (chat do chamado) |
| POST | `/chamados/:id/iniciar-atendimento` | técnico (com GPS → `em_atendimento`) |
| POST | `/chamados/:id/a-caminho` · `/:id/chegou` | técnico (SLA de chegada) |

---

## Técnicos (`/tecnicos`)

| GET | `/tecnicos` | adminOnly |
| POST · PATCH · DELETE | `/tecnicos[/:id]` | **gestao** (DELETE e hard delete; GPS do técnico vai junto por CASCADE) |
| GET | `/tecnicos/config` | autenticado (frequência de GPS + janela de expediente) |
| POST | `/tecnicos/localizacao` | autenticado (app envia GPS) |
| GET | `/tecnicos/localizacao` | adminOnly (posições atuais) |

**Janela de expediente do GPS** — os três endpoints acima respeitam
`gps.expediente_inicio` / `gps.expediente_fim` (default 8–18, `0`–`24` desliga),
avaliados em `America/Sao_Paulo`, **não** no fuso do servidor:

- `POST /tecnicos/localizacao` fora da janela responde `200 {ok:true,
  ignorado:"fora_do_expediente"}` **sem gravar**. É 200 de propósito — um erro
  colocaria o ForegroundService Java em retry por algo que não é falha.
- `GET /tecnicos/localizacao` devolve `[]` fora da janela.
- Config inválida (`inicio >= fim`) cai no default 8–18, nunca em "sem janela".

O backend é a fonte única dessa regra: o app também a aplica, mas o Android
congela os timers da WebView em background. Ver
[`modulos/app-mobile.md`](modulos/app-mobile.md).
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

**Planos** (`/planos-manutencao`) — todos **gestao** (admin + gerente):
GET (lista/`:id`), POST, PATCH, DELETE, `POST /:id/executar-agora`,
`PATCH /bulk` — edição em massa: `{ ids: number[], ativo?, periodicidade_dias?,
proxima_em? }`, até 500 ids por chamada e pelo menos 1 campo além de `ids`.
Campos ausentes ficam intocados; só esses 3 são editáveis em massa (o body é
filtrado antes de validar). Responde `{ ok, atualizados, campos }`.

**Contratos** (`/contratos`):
GET `/`, `/metricas`, `/:id`, `/:id/pdf` (adminOnly); POST/PATCH/DELETE
(**gestao**); `POST /:id/enviar-assinatura` (**gestao**, gera tokens +
manda e-mail); `GET /:id/status-assinatura` (adminOnly, lê status sem API
externa — ver seção "Assinatura de contratos" abaixo).

---

## Assinatura de contratos

Rotas públicas (sem JWT) em `/assinar`. Fluxo próprio de assinatura eletrônica
por link de e-mail (migrations 056/063 — substitui dependência de
ZapSign/D4Sign). O token UUID na URL identifica o signatário (cliente ou
General Bombas); antes de assinar, é exigido um código de 6 dígitos enviado
ao e-mail cadastrado (2FA equivalente ao do login).

| Método | Rota | Descrição |
|---|---|---|
| GET | `/assinar/:token` | página do fluxo — gera/reenvia código se necessário e mostra a tela de verificação |
| POST | `/assinar/:token/reenviar-codigo` | reenvia código (cooldown 60s); rate limit por IP |
| POST | `/assinar/:token/verificar-codigo` | confirma o código (máx. 5 tentativas); emite `verify_token` (JWT, 15 min) e libera o formulário de assinatura |
| GET | `/assinar/:token/pdf` | PDF do contrato sem autenticação |
| POST | `/assinar/:token` | confirma a assinatura — exige `verify_token` válido; grava nome/doc/IP/imagem + `protocolo` (hash SHA-256 auditável, impresso no PDF) |

---

## Admin (`/admin`)

| GET | `/admin/status` | adminOnly (status agregado por condomínio + lat/lng/endereço) |
| GET | `/admin/historico?device_ids=A,B&horas=N` | adminOnly (até 10 devices) |
| GET | `/admin/geocode?q=` · `/admin/reverse-geocode?lat=&lon=` | adminOnly (proxy Nominatim) |
| GET/POST/PATCH/DELETE | `/admin/usuarios[/:id]` | GET adminOnly; escrita masterAdmin |
| POST | `/admin/usuarios/:id/reset-senha` | masterAdmin |
| GET/PATCH | `/admin/configuracoes` | masterAdmin (config dinâmica) |
| GET | `/admin/integracoes/status` | masterAdmin (OpenAI/WhatsApp/Resend configurados?) |
| POST | `/admin/jobs/{leituras-cleanup,alertas-cleanup,conversas-cleanup}/run` | masterAdmin |
| GET/PATCH | `/admin/sla[/:prioridade]` | masterAdmin |
| ... | `/admin/orcamentos*` e `/admin/orcamentos/avulsos*` | adminOnly (CRUD + PDF) |
| GET | `/admin/orcamentos/avulsos` | adminOnly — lista. Devolve **as duas** formas do total: `valor` (coluna crua; `null` = somar os itens) e `valor_total` (`COALESCE(valor, soma dos itens, 0)`). O modal do admin edita `valor`, então **tirar essa coluna do SELECT faz o campo do total manual abrir vazio e o próximo `PATCH` apagar o valor no banco** — ver [`changelog.md`](changelog.md) 24/08 |
| POST | `/admin/orcamentos/avulsos/:id/enviar-email` | adminOnly — gera o PDF, envia ao cliente (Resend) e marca como `enviado`. Body `{ emails }` **obrigatório** (o front pré-preenche com `condominios.email`). O corpo do e-mail é fixo desde 24/08/2026: um `mensagem` no body é ignorado |
| GET/PATCH | `/admin/me/email-template` | ⏸️ **sem uso desde 24/08/2026** — mensagem padrão do usuário logado. O corpo do e-mail de orçamento virou fixo e nenhuma tela chama mais esta rota; ela e a coluna continuam de pé porque a remoção foi só da interface |
| POST | `/admin/me/assinatura` | ⏸️ **sem uso desde 24/08/2026** — upload da assinatura em base64 (`data:image/...`) → `usuarios.assinatura_blob`. O admin **reduzia a imagem no navegador** antes de enviar (máx. 600 px / ~180 KB): o limite do `express.json` é 8 mb e o e-mail embutia a imagem como data URI |
| GET | `/admin/assinatura/:userId` | ⏸️ **sem uso desde 24/08/2026** — serve a imagem de assinatura (pública, era usada nos e-mails) |
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

**`/relatorios`** (adminOnly): `/chamados`, `/alertas`, `/telemetria` — dados
crus em JSON, usados pra exportar CSV no painel (ver
[chamados-sla.md](modulos/chamados-sla.md)). `/chamados` inclui
`primeira_resposta_em` e `tempo_resolucao_seg` pra permitir calcular
TTFR/TTR/conformidade de SLA no Excel. `/painel-vivo` retorna o estado
operacional agora (chamados em risco de estourar SLA + workload por
técnico), sem filtro de período.

---

## Equipamentos (`/equipamentos`) — etiqueta QR

Guard `equipeInterna` (admin, gerente, operador, **técnico**) na leitura e no
registro; `cliente` toma 403 em tudo. Fluxo em
[equipamentos.md](modulos/equipamentos.md).

| Método | Rota | Acesso / observação |
|---|---|---|
| POST | `/equipamentos/lote` | gestaoOnly — cria N etiquetas em branco (1 a 200). Body `{ quantidade }`. Devolve `{ lote, quantidade, equipamentos }` |
| GET | `/equipamentos/etiquetas.pdf?lote=…\|ids=…&formato=` | adminOnly — folha A4 em memória. `formato`: `corte` (padrão) ou `pimaco6180`. **Recusa** gerar se a URL pública for local (defina `PUBLIC_BASE_URL`; `&forcar=1` ignora, só para teste) |
| GET | `/equipamentos?status=&condominio_id=&lote=&q=&limit=` | lista o parque etiquetado |
| GET | `/equipamentos/condominios` | id + nome apenas — `GET /condominios` é adminOnly e o técnico não passa nele |
| GET | `/equipamentos/codigo/:codigo` | **a ficha que o QR abre**. Aceita hífen e minúsculas; normaliza I/L→1, O→0, U→V |
| GET | `/equipamentos/:id` | mesma ficha, por id |
| POST | `/equipamentos/:id/vincular` | vincula a etiqueta em branco: `{ condominio_id, destino: 'oficina'\|'instalado', ...dados }`. Numa transação grava os dados **e** a primeira movimentação |
| PATCH | `/equipamentos/:id` | corrige dados cadastrais. **Não** mexe em status — status só muda por movimentação, para nunca existir mudança sem rastro |
| POST | `/equipamentos/:id/movimentacoes` | `{ tipo, observacao?, chamado_id?, os_id? }`. O status novo é derivado do tipo; `anotacao` não muda status e exige texto |
| POST | `/equipamentos/:id/fotos` | `{ dados_base64 }` (data URL, máx. ~2 MB — o front comprime para 1280px antes) |
| GET | `/equipamentos/:id/fotos/:fotoId/imagem` | **autenticada** (diferente da equivalente em `os_fotos`, que é pública) — o front busca com header e usa object URL |
| DELETE | `/equipamentos/:id/fotos/:fotoId` | adminOnly |
| DELETE | `/equipamentos/:id` | gestaoOnly — apaga de verdade só etiqueta nunca usada; com histórico, **inativa** e registra movimentação `baixa` |

**`GET /e/:codigo`** (fora deste router) serve o HTML da ficha. Path curto de
propósito: menos caractere na URL = QR com menos módulos = etiqueta legível
mesmo suja. Sem sessão, a página manda para `/login?next=/e/CODIGO`.
