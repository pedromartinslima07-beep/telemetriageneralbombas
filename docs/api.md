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
  - `adminOnly` — `admin`, `gerente` ou `operador`. Desde 27/08/2026 significa
    literalmente **o Monitor e os chamados**: é o guard das quatro telas do
    operador (alertas, telemetria, mapa, chamados) e de nada mais.
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

Dois eixos, porque **IP é barato** e teto por IP sozinho não protege uma conta
nomeada de quem aluga proxy aos milhares:

| Endpoint | Por IP | Por e-mail |
|---|---|---|
| `/auth/metodo` | 40 / 15 min | — (quem varre usa e-mails diferentes) |
| `/auth/login` | 20 / 15 min | 10 / 15 min |
| `/auth/codigo` | 20 / 15 min | 5 / 15 min |
| `/auth/verify-otp` | 10 / 15 min | **5 por código** (`login_codes.tentativas`) |
| `/telemetria` | telemetriaLimiter | — |

A chave do teto por e-mail é normalizada (`trim` + minúsculas): sem isso a
mesma conta com outra grafia teria cota própria e o teto seria de mentira.
Detalhes e o preço assumido em
[modulos/autenticacao.md](modulos/autenticacao.md).

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
| POST | `/auth/metodo` | **passo 1 da tela de login** — só `email`, responde `{ metodo: "senha" \| "codigo" }` para a tela saber qual campo mostrar. **Não autentica**: sem token, sem senha, sem e-mail enviado. `role` interno → `senha`; cliente **e e-mail desconhecido** → `codigo` |
| POST | `/auth/login` | **equipe interna** — email+senha → envia OTP por email |
| POST | `/auth/codigo` | **cliente (síndico), sem senha** — só `email`; exige `role='cliente'`, manda o código de 6 dígitos e devolve o mesmo `{ pending, otp_token }` do login. Resposta **neutra** para e-mail desconhecido. Aparelho confiável → JWT direto |
| POST | `/auth/verify-otp` | valida OTP → JWT + cookie trusted device. **Serve aos dois caminhos** |
| POST | `/telemetria` | ingestão de leitura (auth via header `X-Device-Key`) |
| GET | `/whatsapp/webhook` | verificação do webhook da Meta (`hub.challenge`) |
| POST | `/whatsapp/webhook` | recebe eventos da Meta API (valida verify token) |
| GET | `/tiles/:z/:x/:y.png` | proxy de tiles do mapa (Carto), cache em memória |
| GET | `/` `/login` `/admin/painel` `/cliente/painel` `/operador/painel` | páginas HTML (no-cache) |
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

| POST | `/chamados` | **adminOnly** (criação manual; aceita `tecnico_id` opcional — nasce já despachado) |
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

⚠️ **`POST /auth/trocar-senha` é `authRequired` PURO** — qualquer usuário
logado, sem guard de papel. É o que permite a mesma rota servir o admin (aba
Configurações) e o painel do operador ("Minha senha", 02/09/2026) sem
backend novo. Ela **não** revoga `trusted_devices`, ao contrário do
`POST /admin/usuarios/:id/reset-senha`, que é do master admin e devolve uma
senha temporária em texto puro.

---

## Ordens de Serviço (`/ordens-servico`)

Guard `osDonoOuAdmin()` — técnico dono da O.S. ou admin; `{forWrite:true}`
restringe escrita.

| POST · GET | `/ordens-servico` | adminOnly |
| GET | `/ordens-servico/:id` · `/:id/pdf` | dono ou admin |
| GET | `/ordens-servico/:id/assinatura` | dono ou admin |
| PATCH | `/ordens-servico/:id` | dono/admin (escrita) |
| POST | `/:id/fotos/upload` · `/:id/fotos` | dono/admin (base64) |
| DELETE | `/:id/fotos/:foto_id` | dono/admin |
| POST/PATCH/DELETE | `/:id/pecas[/:peca_id]` | dono/admin |
| POST | `/:id/finalizar` | dono/admin (gera PDF) |

⚠️ **`GET /:id` não devolve `assinatura_b64`** — são ~120KB de PNG que o
técnico rebaixaria no 4G a cada abertura da O.S. O detalhe manda só o
booleano **`tem_assinatura`**; a imagem sai por `GET /:id/assinatura`, sob
demanda. Quem exibe assinatura precisa das **duas** chamadas — ler
`assinatura_b64` do detalhe dá `undefined`, e o front cai no ramo "não
assinada" numa O.S. assinada (foi o bug de 02/09/2026 no painel admin).

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
| GET/POST/PATCH/DELETE | `/admin/usuarios[/:id]` | GET adminOnly; escrita masterAdmin. **`senha` é opcional para `role='cliente'`** (25/08/2026): ele entra por código no e-mail, e nasce com hash de 32 bytes aleatórios. Para acesso interno a senha segue obrigatória |
| POST | `/admin/usuarios/:id/reset-senha` | masterAdmin. **Não vale para cliente** — ele não tem senha; o botão some da lista |
| GET/PATCH | `/admin/configuracoes` | masterAdmin (config dinâmica) |
| GET | `/admin/integracoes/status` | masterAdmin (OpenAI/WhatsApp/Resend configurados?) |
| POST | `/admin/jobs/{leituras-cleanup,alertas-cleanup,conversas-cleanup}/run` | masterAdmin |
| GET/PATCH | `/admin/sla[/:prioridade]` | masterAdmin |
| ... | `/admin/orcamentos*` e `/admin/orcamentos/avulsos*` | adminOnly (CRUD + PDF) |
| DELETE | `/admin/orcamentos/:os_id` | gestaoOnly — apaga o **PEDIDO** do técnico, não só o documento: desliga `ordens_servico.orcamento_necessario` **e** apaga o orçamento com aquele `os_id` (itens vão por CASCADE), numa statement só. É o que tira a linha da aba — o `DELETE /orcamentos/avulsos/:id` apaga o documento e a linha **volta** no próximo carregamento, porque quem a sustenta é a flag. ⚠️ **Não alcança o avulso sem `os_id`** (o enviado por fora fica intacto). A `orcamento_observacoes` do técnico é preservada. O.S. inexistente → 404. Ver [`changelog.md`](changelog.md) 03/09 |
| GET | `/admin/orcamentos/avulsos` | adminOnly — lista. Devolve **as duas** formas do total: `valor` (coluna crua; `null` = somar os itens) e `valor_total` (`COALESCE(valor, soma dos itens, 0)`). O modal do admin edita `valor`, então **tirar essa coluna do SELECT faz o campo do total manual abrir vazio e o próximo `PATCH` apagar o valor no banco** — ver [`changelog.md`](changelog.md) 24/08 |
| POST | `/admin/orcamentos/avulsos/:id/resposta-vista` | marca que alguem do escritorio ABRIU a resposta do cliente. ⚠️ **Nao apaga mais o aviso** (078) — quem apaga e a baixa abaixo. Idempotente: nao reescreve a data da primeira vez |
| POST | `/admin/orcamentos/avulsos/:id/resposta-baixa` | da baixa na resposta do cliente — e **isto** que tira a pendencia da aba. Body `{ desfazer?: true }` reabre. Idempotente: um segundo clique nao reescreve a data nem troca o autor. Devolve `{ resposta_tratada_em, resposta_tratada_por_nome }`. Sem `respondido_em` na linha, nao grava nada; id inexistente → 404 |
| GET | `/admin/orcamentos/avulsos/:id/destinatarios` | as DUAS listas do modal de envio: `usuarios` (quem tem login de cliente) e `cadastrados` (`condominios.email`). São diferentes de propósito — ver [modulos/orcamentos-envio.md](modulos/orcamentos-envio.md) |
| POST | `/admin/orcamentos/avulsos/:id/enviar-email` | adminOnly — envia o orçamento ao cliente (Resend) e marca como `enviado`. Body `{ emails }` **obrigatório** (o front pré-preenche com `condominios.email`). O corpo do e-mail é fixo desde 24/08/2026: um `mensagem` no body é ignorado. **Desde 25/08/2026 o e-mail leva o link do painel OU o PDF anexado, nunca os dois**: com condomínio que tenha usuário `cliente`, vai o link e o PDF nem chega a ser gerado; sem isso, vai o anexo como antes. A resposta traz `link_painel` e `anexo` dizendo o que saiu. Kill-switch: `ORCAMENTO_LINK_PAINEL=0`  Body: `{ modo: "painel"｜"carta", emails?, mensagem? }`. `painel` ignora `emails` e usa os usuários do condomínio; `carta` usa `emails` e leva mensagem, assinatura e PDF |
| GET/PATCH | `/admin/me/email-template` | ⏸️ **sem uso desde 24/08/2026** — mensagem padrão do usuário logado. O corpo do e-mail de orçamento virou fixo e nenhuma tela chama mais esta rota; ela e a coluna continuam de pé porque a remoção foi só da interface |
| POST | `/admin/me/assinatura` | ⏸️ **sem uso desde 24/08/2026** — upload da assinatura em base64 (`data:image/...`) → `usuarios.assinatura_blob`. O admin **reduzia a imagem no navegador** antes de enviar (máx. 600 px / ~180 KB): o limite do `express.json` é 8 mb e o e-mail embutia a imagem como data URI |
| GET | `/admin/assinatura/:userId` | ⏸️ **sem uso desde 24/08/2026** — serve a imagem de assinatura (pública, era usada nos e-mails) |
| GET | `/admin/condominios/:id/historico` · `/condominios/lista` | adminOnly |
| GET/POST/PATCH/DELETE | `/admin/whatsapp/contatos[/:id]` | adminOnly (pré-cadastro) |

⚠️ **`GET /admin/orcamentos` e `GET /admin/orcamentos/avulsos` devolvem DOIS
nomes de condomínio** (02/09/2026): `condominio_nome` é o **nome de exibição**
— `COALESCE(NULLIF(c.nome_fantasia,''), c.nome, o.cliente_nome)`, o mesmo que
o PDF imprime — e `condominio_razao_social` é `condominios.nome` cru. Não é
redundância: o front usa o primeiro para mostrar e **os dois** na busca, senão
procurar pelo nome do CNPJ deixa de achar o prédio. Até 02/09 só existia o
`c.nome`, e a lista mostrava a razão social enquanto o cliente recebia um PDF
com o fantasia. Ver [`modulos/painel-admin.md`](modulos/painel-admin.md).

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

## Operador (`/operador`) — a fila do turno

Guard `adminOnly` (admin, gerente, **operador**). Fluxo, tese da tela e
pendências em [painel-operador.md](modulos/painel-operador.md).

| Método | Rota | Acesso / observação |
|---|---|---|
| GET | `/operador/fila` | adminOnly — **uma request monta a tela inteira**: chamados abertos (`aberto`, `em_atendimento`) com o SLA já resolvido, os reservatórios do condomínio de cada um e a equipe com posição atual |
| GET | `/operador/tecnicos` | adminOnly — a equipe que pode receber um chamado (id, nome, `disponivel`, `abertos`, GPS dos últimos 30 min). É a lista do seletor **Técnico** dos diálogos de abrir chamado |
| GET | `/operador/prazos` | adminOnly — os prazos de `sla_definicoes` + as faixas de nível e a janela do sensor mudo. É o que a **Ajuda** das duas telas mostra |
| GET | `/operador/orcamentos` | adminOnly — os orçamentos **aprovados**, por prédio, para a tela `/operador/painel/orcamentos`. Traz `chamado_id`/`chamado_status` do chamado que executa cada um (079) |
| POST | `/operador/orcamentos/:id/executado` | adminOnly — marca o orçamento como **já feito** (sem chamado). Migration 080 |
| DELETE | `/operador/orcamentos/:id/executado` | adminOnly — desfaz a marcação |
| POST | `/operador/orcamentos/:id/chamado` | adminOnly — abre o chamado que EXECUTA um orçamento aprovado, já vinculado (`chamados.orcamento_id`) |

Resposta de `/fila`: `{ agora, fila[], tecnicos[], limiares: { baixo, critico } }`.

⚠️ **`GET /operador/prazos` existe para a ajuda não mentir.** Os prazos são
editáveis pelo admin; escritos à mão no front eles viram documentação que
envelhece em silêncio — e isso já tinha acontecido: a dica do "Novo chamado"
dizia "P2 24–48h" quando o `ttr_min` de P2 é 1440 (24h), e "P4 conforme agenda"
quando P4 tem 14400 (10 dias). É pedido **só quando o diálogo de ajuda abre**,
nunca na carga da tela.

⚠️ **`GET /operador/orcamentos` não devolve valor nenhum** — nem `valor`, nem
`valor_unitario`, nem soma de linhas. Não é ocultação no front: o operador
precisa saber **o que** foi aprovado e **onde**, não quanto custou, e esconder
no CSS deixaria o número viajando na resposta, visível na aba Network. Ao
mexer na query, não traga coluna de dinheiro "porque é fácil somar depois".

⚠️ **`POST /operador/orcamentos/:id/executado` não aceita data nem autor no
corpo.** `executado_em` é `NOW()` e `executado_por` é quem está logado — o
valor do registro é ser carimbo, não digitação. Marcar duas vezes **não
reescreve a data da primeira** (`COALESCE`, a mesma regra de
`primeira_resposta_em` no SLA). O `DELETE` existe porque a marcação é de um
clique e sem confirmação: sem ele, um clique errado só se conserta no banco.

⚠️ **`POST /operador/orcamentos/:id/chamado` NÃO aceita o prédio no corpo** —
ele vem do orçamento. Aceitar do front permitiria abrir, a partir do orçamento
de um prédio, um chamado em outro, e o vínculo passaria a mentir. Corpo:
`{ titulo, descricao, categoria?, prioridade?, tecnico_id? }` (padrões
`manutencao` e **`p4`** — serviço aprovado é trabalho agendado, não incidente).
Respostas: `201` com o chamado novo; `200 { id, ja_existia: true,
tecnico_atribuido }` quando já há chamado aberto do mesmo orçamento (clique
duplo é o caso normal — a lista não recarrega sozinha); `409` se o orçamento não
está aprovado; `404`, `400`, `401` no resto.
E **sem o bump de recorrência** de `POST /chamados`: lá ele detecta problema que
volta, aqui subiria a prioridade de uma limpeza agendada por causa de outra
limpeza no mês passado.

⚠️ **`tecnico_id` é opcional nas DUAS portas de criação** (`POST /chamados` e
esta) desde 31/08/2026. Regras iguais nas duas, porque são a mesma decisão:
o técnico precisa estar `ativo` e com `cargo = 'tecnico'` (senão `400`);
atribuir **marca `primeira_resposta_em`**, a mesma regra do
`PATCH /chamados/:id`; o `status` continua `aberto` — `em_atendimento` só vem
do app do técnico, via `/iniciar-atendimento`; e a atribuição entra no
`historico_chamados` como linha `tecnico_id`, indistinguível de um despacho
feito depois.

⚠️ **No clique duplo, o técnico escolhido PREENCHE VAZIO e nunca troca.** Se o
chamado que já existe está sem técnico, ele recebe o escolhido e a resposta vem
com `tecnico_atribuido: true`; se já tem outro, nada muda (`false`) e a tela
diz isso. Ignorar a escolha em silêncio faria a tela afirmar um despacho que
não houve; sobrescrever faria o segundo clique desfazer, sem aviso, o despacho
do primeiro — ou o de outro operador.

⚠️ **O SLA vem calculado do servidor** (`sla.resta_min`, negativo quando
estourado) e a fila já chega **ordenada por ele** — chamado sem
`sla_definicoes` para a prioridade vai para o fim. O front não recalcula: o
relógio do navegador do operador pode estar minutos fora, e reordenaria o
turno inteiro. `origem` (`whatsapp` · `preventiva` · `telemetria` · `manual`)
é **heurística** — `chamados` não tem essa coluna; ver o módulo.

As ações da tela não são deste router: despacho é
`PATCH /chamados/:id { tecnico_id }`, abertura é `POST /chamados`, ficha é
`GET /chamados/:id` + `/historico`, e a lista de prédios do modal é
`GET /condominios`. **`/operador/painel`** (fora deste router) serve o HTML.

---

## Equipamentos (`/equipamentos`) — etiqueta QR

Guard `equipeInterna` (admin, gerente, **técnico**) na leitura e no
registro; `cliente` toma 403 em tudo, e o `operador` saiu em 27/08/2026 —
oficina não é tela dele. Fluxo em
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
