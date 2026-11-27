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
| POST | `/whatsapp/webhook` | recebe eventos da Meta API; exige `X-Hub-Signature-256` válida com `WHATSAPP_APP_SECRET`, senão 403 |
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
| GET | `/auth/painel` | autenticado. `{ painel: "novo" \| "antigo" }` e grava/apaga o cookie `gb_painel` que escolhe a página do `/admin/painel` (ver [painel-novo.md](modulos/painel-novo.md)) |
| POST | `/auth/trocar-senha` | autenticado |
| GET | `/auth/dispositivos` | autenticado (lista trusted devices) |
| DELETE | `/auth/dispositivos/:id` · `/auth/dispositivos` | autenticado (revoga 1 / todos) |

---

## Telemetria e infraestrutura

**Condomínios** (`/condominios`)
| Método | Rota | Acesso |
|---|---|---|
| GET | `/condominios` · `/condominios/:id` | adminOnly |
| GET | `/condominios/cnpj/:cnpj` | **gestao** — consulta pública do CNPJ para auto-preencher o cadastro. Tenta BrasilAPI → OpenCNPJ → CNPJ.ws (`cnpj.service.js`) e responde no formato da BrasilAPI (`razao_social`, `nome_fantasia`, `logradouro`, `numero`, `complemento`, `bairro`, `municipio`, `uf`, `cep`, `ddd_telefone_1`, `descricao_situacao_cadastral`) + `fonte`. `400` inválido · `404` não encontrado · `502` nenhuma fonte respondeu. Declarada antes de `/:id` |
| POST | `/condominios` | **gestao** (aceita lat/lng/cep/cnpj) |
| PATCH | `/condominios/:id` | **gestao** |
| DELETE | `/condominios/:id` | masterAdmin (soft/inativar). `ativo = false` no condomínio e nos reservatórios — **revoga o acesso dos logins de cliente** (contas preservadas). `PATCH {ativo:true}` devolve |
| DELETE | `/condominios/:id/hard` | masterAdmin (remoção física). Exige `{ senha }` do admin logado. **Apaga junto os `usuarios` com `role='cliente'` do condomínio** (e por CASCADE seus `login_codes`/`trusted_devices`) — responde `{ ok, usuarios_removidos, usuarios[] }`. `409` se alguma FK de autoria bloquear (nada é apagado) |

**Reservatórios** (`/reservatorios`)
| GET | `/reservatorios` · `/reservatorios/:id` | adminOnly |
| POST · PATCH · DELETE | `/reservatorios[/:id]` | masterAdmin (calibração + limiar; o PATCH aceita `altura_extravasor_m`, migration 106) |
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

| GET | `/chamados/prioridades` | adminOnly — a régua do contrato para a tela: as quatro prioridades com rótulo, enquadramento (cláusula 7 da minuta) e **prazo lido de `sla_definicoes`**, mais o mapa categoria → prioridade. ⚠️ **O prazo não se escreve no HTML** — os botões traziam "≤ 3h"/"24-48h"/"≤ 72h" à mão, e o segundo prometia janela que o contrato não dá. `sla_chegada_min` **nulo** é o P4 ("Agendamento"), e nulo não é zero |
| POST | `/chamados` | **adminOnly** (criação manual; aceita `tecnico_id` opcional — nasce já despachado). Aceita **`orcamento_id`** desde 03/09/2026: o chamado que EXECUTA um orçamento aprovado. Recusa o não aprovado (409) e o de outro condomínio (409) — o vínculo errado só apareceria na hora de cobrar a nota. Até aqui só `POST /operador/orcamentos/:id/chamado` escrevia nessa coluna, e o chamado aberto pelo admin — o caminho normal — nascia sem vínculo: o serviço era feito e o orçamento seguia em "Aprovados" . Sem `prioridade` no corpo, **a categoria decide** (`prioridade.service.js`, ancorado na cláusula 7) — antes era um `p3` fixo. Aceita a categoria `melhoria` desde a migration 081. A resposta traz **`prioridade_ajustada`** quando a regra de recorrência subiu o nível; até 03/09/2026 ela fazia isso calada |
| GET | `/chamados` · `/chamados/:id` · `/:id/historico` | adminOnly |
| PUT / DELETE | `/chamados/:id/escritorio` | **gestão** (admin/gerente). "Pedido do escritório" para o turno: `{ motivo }` (1–300). Selo no painel do turno; **não** reordena a fila. 409 em chamado que não está em aberto. Vai para o histórico (`pedido_escritorio`). Migration 098 |
| PUT / DELETE | `/chamados/:id/pede-escritorio` | **adminOnly** (inclui o operador). "Precisa do escritório": `{ motivo }`. Entra no "Precisa de você" do Hoje do admin até o DELETE ("Pedido atendido"). DELETE sem marca responde `{ ok, ja_estava }`. Histórico: `precisa_escritorio` |
| PATCH | `/chamados/:id` | **adminOnly** (status/responsável; bloqueia `em_atendimento`). `status` aceita `aberto`, `fechado` e — desde a migration 083 — **`cancelado`**, este restrito à **gestão** (admin/gerente; operador leva 403) e exigindo **`motivo`** no corpo, mín. 5 caracteres. ⚠️ **Cancelar não é fechar:** não grava `fechado_em`, `tempo_resolucao_seg` nem `primeira_resposta_em` — o chamado sai da fila sem entrar em métrica nenhuma. Grava `cancelado_em` + `cancelado_motivo`. Cancelar um chamado **já fechado** é **409** (fechado é serviço prestado, com O.S. e talvez avaliação penduradas; o caminho é reabrir e então cancelar). Reabrir um cancelado é `status: "aberto"` normal, e **não** apaga o motivo |
| GET | `/chamados/meus` · `/meus/:id` | técnico autenticado. ⚠️ `?abertos=1` é `status NOT IN ('fechado','cancelado')`; **sem query nenhuma a rota devolve tudo**, cancelado incluído — quem separa na tela do técnico é o `chEmAberto` do `app/public/app.js` |
| GET/POST | `/chamados/meus/:id/mensagens` | técnico (chat do chamado) |
| POST | `/chamados/:id/iniciar-atendimento` | técnico → `em_atendimento` + O.S. rascunho. Corpo `{lat?, lng?, precisao_m?}`. ⚠️ **A coordenada é OPCIONAL desde 11/09/2026** — subsolo e casa de máquinas são onde o técnico trabalha, e o 400 de "lat e lng são obrigatórios" travava justamente quem estava no lugar certo sem sinal. Sem coordenada, `chegada_lat/lng` ficam **NULL** e a ficha da O.S. no admin mostra **"sem GPS"**; `chegada_em` é gravada do mesmo jeito (a hora é fato, o lugar não). ⚠️ **Os dois, ou nenhum**: `lat` sem `lng` é payload quebrado, não "sem GPS", e leva 400 — como leva não-numérico e fora de range. A escrita em `tecnico_localizacoes` só acontece quando há coordenada (as colunas são NOT NULL lá). Idempotente pelo UNIQUE em `ordens_servico.chamado_id` |
| POST | `/chamados/:id/a-caminho` · `/:id/chegou` | técnico (SLA de chegada) |
| POST | `/chamados/:id/devolver` | **técnico dono do chamado** (11/09/2026). Devolve o chamado à fila em qualquer ponto — a caminho ou já em atendimento —, exigindo **`motivo`** no corpo (mín. 5 caracteres). Volta o `status` a `aberto`, zera `tecnico_id` e `tecnico_a_caminho_em`, e **apaga a O.S. rascunho** (a finalizada não: 409). ⚠️ **`tecnico_chegou_em` e `primeira_resposta_em` FICAM** — o técnico chegou de verdade, e zerar isso reescreveria o SLA a favor da empresa. ⚠️ **O cliente não é avisado**, ao contrário do cancelamento: devolver é rodízio interno de equipe. 403 para qualquer um que não seja o técnico dono (admin incluído); 409 se o chamado estiver `fechado`/`cancelado`. O motivo fica em `historico_chamados` (`campo_alterado = 'devolvido'`) |

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
| GET | `/ordens-servico?limit=&offset=` | **gestão**. Lista **paginada** (13/11/2026): `limit` 1–500 (padrão 200), `offset` ≥ 0, mais recentes primeiro; o total do filtro vem no header **`X-Total-Count`**. Filtros `chamado_id`, `condominio_id`, `tecnico_id`, `finalizada`. ⚠️ Antes era um `LIMIT 200` fixo, e com 226 O.S. as mais antigas sumiam da tela como se tivessem sido apagadas. Quem precisa de todas pede página a página |
| GET | `/ordens-servico/:id` · `/:id/pdf` | dono ou admin — **e o operador desde 03/09/2026** (só leitura). A tela de Aprovados nomeia a O.S. que executou cada orçamento, e ele precisava chegar nela |
| GET | `/ordens-servico/:id/assinatura` | dono ou admin (idem operador) |
| PATCH | `/ordens-servico/:id` | dono/admin (escrita). ⚠️ **O operador NÃO passa aqui** — a linha em `osDonoOuAdmin` é o `forWrite`: editar O.S. é do técnico que esteve no prédio |
| POST | `/:id/fotos/upload` · `/:id/fotos` | dono/admin (base64) |
| DELETE | `/:id/fotos/:foto_id` | dono/admin |
| POST/PATCH/DELETE | `/:id/pecas[/:peca_id]` | dono/admin |
| POST | `/:id/finalizar` | dono/admin (gera PDF). Recusa assinatura **sem tinta** (400 "chegou em branco") desde 05/10/2026 |
| POST · DELETE | `/:id/pedir-assinatura` | **gestao** — liga/desliga o pedido de nova assinatura de O.S. **finalizada** (`assinatura_refazer_em`, migration 088) |
| PUT | `/:id/assinatura` | admin/gerente, ou **técnico dono só com pedido aberto** — grava `assinatura_b64` + `recebido_nome` (+ `recebido_tipo?`) em O.S. finalizada, consome o pedido, marca `assinatura_refeita_em` e invalida o PDF. Recusa quadro sem tinta. Operador 403 |
| GET | `/:id/destinatarios` | **gestao** — os `condominios.email` do prédio da O.S., ponto de partida do modal de envio |
| POST | `/:id/enviar-email` | **gestao** — manda a O.S. finalizada ao cliente com o PDF em anexo. Body `{ emails, mensagem? }` |
| POST | `/ordens-servico/enviar-email-lote` | **gestao** — várias O.S. de uma vez, **cada uma para o e-mail do seu próprio condomínio**. Body `{ ids, mensagem? }`, até 40 por chamada |

⚠️ **`GET /:id` não devolve `assinatura_b64`** — são ~120KB de PNG que o
técnico rebaixaria no 4G a cada abertura da O.S. O detalhe manda só o
booleano **`tem_assinatura`**; a imagem sai por `GET /:id/assinatura`, sob
demanda. Quem exibe assinatura precisa das **duas** chamadas — ler
`assinatura_b64` do detalhe dá `undefined`, e o front cai no ramo "não
assinada" numa O.S. assinada (foi o bug de 02/09/2026 no painel admin).
Desde 05/10/2026 o detalhe da O.S. **finalizada** também traz
**`assinatura_em_branco`** (o servidor mede a tinta do PNG) e os campos da 088.
O `PATCH` grava quadro sem tinta como NULL, e o envio por e-mail recusa O.S.
com assinatura em branco ou com pedido de nova assinatura aberto.

`GET /chamados/meus` traz `os_assinatura_refazer_em` e `GET /chamados/meus/:id`
traz `ordem_servico.assinatura_refazer_em` + `recebido_nome`: é o que põe o
chamado fechado de volta na aba Hoje do técnico.

**Estrutura nova do app (26/11/2026)** — campos acrescentados, todos ignorados
pelo APK antigo:

- `GET /chamados/meus`: `os_numero`, `os_resultado` (`servico_realizado`),
  `os_finalizada_em` (o Histórico por dia) e `sla_ttr_min` (o prazo da fila:
  `criado_em + ttr_min`, de `sla_definicoes`).
- `GET /chamados/meus/:id`: `sla_ttr_min` e `ultima_visita` — a O.S.
  finalizada mais recente do condomínio, de qualquer técnico, fora a do próprio
  chamado (`numero`, `finalizada_em`, `servico_realizado`, `tipos_servico`,
  `observacoes` cortada em 160, `tecnico_nome`), ou `null`.
- `GET /planos-manutencao/meu-roteiro`: `feitos_mes` — os chamados de
  preventiva que ESTE técnico fechou no mês corrente (`chamado_id`,
  `fechado_em`, `condominio_nome`, `bairro`, `os_numero`). É o que dá o
  progresso da aba Mês.

Ver [app-mobile.md](modulos/app-mobile.md#a-estrutura-nova-do-app-26112026).

⚠️ **O envio por e-mail não tem dois modos, e o orçamento tem** — não é
esquecimento. O orçamento oferece "pelo painel" porque existe uma tela onde o
cliente aprova ou recusa; a O.S. não tem tela nenhuma no painel do cliente, só
menção no histórico do chamado. Aqui o documento vai **sempre em anexo**, a
lista de destinatários é **editável** e quem não tem login recebe igual. A
moldura do e-mail é a mesma do orçamento, por `_molduraEstruturada`. Ver
[modulos/ordens-servico.md](modulos/ordens-servico.md).

⚠️ **Rascunho não sai daqui** (400): sem a assinatura do responsável o papel
não vale como comprovante do atendimento.

⚠️ **O lote responde 200 com relatório, não erro.** `{ enviadas, falhas }`: uma
O.S. que falha (rascunho, prédio sem e-mail, provedor fora) não pode fazer a
tela dizer que nada saiu quando as outras foram. E o lote **não aceita
endereço digitado** — o destino vem do cadastro de cada condomínio, porque um
campo de texto valeria para todos os prédios de uma vez.

⚠️ **`GET /` devolve `enviado_em`, `enviado_para` e `condominio_email`.** Os
dois primeiros pintam o selo da coluna E-mail; o terceiro é o que diz se a O.S.
pode ir em lote.

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

**Contratos do Omie** (`/contratos/omie`, **gestao**, migration 096 — só a
cópia do banco, nada chama nem grava no Omie;
[omie-integracao.md](modulos/omie-integracao.md)):
- `GET /contratos/omie` → `{ contratos, sincronizacao }`. Cada contrato traz
  `situacao`/`situacao_rotulo`/`ativo`, `valor_mensal`, `dia_faturamento`,
  vigência e `vigencia_vencida`, `cliente` (documento, razão social, e-mail),
  `condominio_id`/`condominio_nome`, `ligacao` (`manual`, `cnpj`,
  `cnpj-repetido`, `sem-cnpj`, `cnpj-sem-predio`, `sem-cliente`) e a
  `ultima_nota`.
- `PUT /contratos/omie/clientes/:codigo/condominio` `{ condominio_id }` → liga
  à mão (vale para todos os contratos do cliente; 404 se o prédio ou o cliente
  não existir).
- `DELETE /contratos/omie/clientes/:codigo/condominio` → desfaz o elo à mão.
- Desde a migration 109, cada contrato do `GET` traz também `plano_id`,
  `plano_titulo`, `plano_ativo`, `plano_ligacao` (`manual`, `predio`,
  `nenhum`, `escolher`, `sem-plano`, `sem-predio`) e `planos_do_predio`
  (`[{ id, titulo }]`, as preventivas ativas do prédio).
- `PUT /contratos/omie/:codigo/plano` `{ plano_id }` → diz à mão qual
  preventiva o contrato paga; `plano_id: null` = "não é de preventiva". 400 sem
  o campo; 404 se o contrato ou a preventiva não existe; 409 se a preventiva é
  de outro prédio ou o contrato não tem prédio.
- `DELETE /contratos/omie/:codigo/plano` → volta ao automático (a preventiva
  ativa do prédio, se houver uma só).

**Lote do faturamento** (`GET /agenda/faturamento/lote`, desde 27/11/2026): cada
item traz `avisos` (`[{ tipo, texto }]`, tipos `dobro`, `sem_preventiva`,
`escolher`, `sem_predio`) e `plano_id`/`plano_titulo`/`plano_ligacao`; o
resumo traz `com_aviso` e `preventivas_sem_contrato`; a resposta traz
`preventivas_sem_contrato` (`[{ plano_id, titulo, condominio_id,
condominio_nome }]`). Aviso não muda o `estado` de ninguém.

**O que a preventiva cobre** (migration 110): `GET
/planos-manutencao/sistemas` (qualquer usuário logado) → `{ sistemas: [{
chave, rotulo }] }`, a lista fixa na ordem de leitura. `POST`/`PATCH
/planos-manutencao` aceitam `sistemas` (lista de chaves; desconhecida = 400;
gravada na ordem da lista e sem repetir; PATCH sem o campo não mexe).
`GET /planos-manutencao` traz `sistemas`; `/meu-roteiro` e `GET
/operador/preventivas` trazem também `sistemas_rotulos` (o texto pronto).

**Cobrança** (`/admin/cobranca`, **só admin** (`masterAdminOnly`), migration
099 — os títulos em atraso **das notas que o sistema emitiu**; nada grava no
Omie; [omie-integracao.md](modulos/omie-integracao.md#3-contas-a-receber-quem-pagou-quem-atrasou)):
- `GET /admin/cobranca` → `{ titulos, sincronizacao, hoje }`. Cada título:
  `omie_codigo`, `origem` (`orcamento`｜`contrato`), `orcamento_id`, `contrato`
  `{ omie_codigo, numero, competencia }`, `documento`, `parcela`,
  `numero_nf`, `valor`, `emissao`, `vencimento`, `dias` (de atraso, no relógio
  de SP), `banco` (`Sicredi`/`Bradesco`), `boleto_numero` (null = sem boleto),
  `cliente` `{ omie_codigo, nome, razao_social, documento, email, telefone,
  telefone2, contato }`, `condominio` `{ id, nome, telefone, responsavel }`
  (o do orçamento; no contrato, elo à mão ou CNPJ único) e `pago` (a marca à
  mão, ou null). Só lê o banco.
- `POST /admin/cobranca/atualizar` → refaz a sincronização inteira do Omie
  (a mesma do "Atualizar do Omie" dos contratos, só leitura lá; intervalo
  mínimo de 2 min → `{ pulado: true }`); 502 se o Omie não responder.
- `GET /admin/cobranca/:codigo/boleto` → `{ link }` do PDF (`ObterBoleto` na
  primeira vez, depois do banco). 404 se o título não está na lista ou não tem
  boleto.
- `PUT /admin/cobranca/:codigo/pago` `{ pago_em?: "AAAA-MM-DD", observacao? }`
  → "já pagou", **só no sistema** (some de "A cobrar"). 400 data inválida ou
  futura; 404 título fora da lista.
- `DELETE /admin/cobranca/:codigo/pago` → desfaz (404 se não estava marcado).

**Avisos de cobrança** (`/admin/cobranca/avisos`, **só admin** + **só o painel
novo**, migration 102; [cobranca-avisos.md](modulos/cobranca-avisos.md)):
- `GET /admin/cobranca/avisos` → refaz a fila do dia e devolve `{ avisos,
  regras, envio_ligado, hoje, fila }`. Cada aviso: `id`, `omie_titulo`,
  `etapa` (`antes`｜`dia`｜`atraso1`｜`atraso2`), `etapa_nome`, `vencimento`,
  `valor`, `numero_nf`, `origem`, `cliente`, `destinatarios`, `status`
  (`pendente`, `enviando`, `enviado`, `erro`, `sem_email`, `expirado`,
  `ignorado`), `erro`, `boleto`, `enviado_em`/`enviado_por`.
- `PUT /admin/cobranca/avisos/regras` `{ dias_antes?, atraso_1?, atraso_2?,
  automatico? }` → `{ regras }` (as chaves `cobranca.*`; 2ª antes da 1ª = 400).
- `GET /admin/cobranca/avisos/:id/email` → `{ assunto, html, para, anexo }`: o
  e-mail como vai sair.
- `POST /admin/cobranca/avisos/enviar` `{ ids }` → ⚠️ **manda e-mail ao
  cliente**, com o PDF do boleto → `{ enviados, falhas }`. **503 sem
  `COBRANCA_EMAIL=1`**. Refaz a fila antes: pago ou fora de etapa não sai.
- `POST /admin/cobranca/avisos/:id/ignorar` · `PUT /admin/cobranca/avisos/:id/para`
  `{ destinatarios }` (só neste aviso; inválido = 400).

**Guias de tributos** (`/admin/guias`, **só admin** + **só o painel novo**
(`masterAdminOnly` + `painelNovoOnly`), migration 100;
[guias-tributos.md](modulos/guias-tributos.md)):
- `GET /admin/guias` → `{ guias, regras, envio_ligado, hoje }`. Cada guia:
  `id`, `tipo`, `descricao`, `competencia`, `vencimento`, `valor`,
  `linha_digitavel`, `linha_formatada`, `codigo_barras`, `numero_documento`,
  `cnpj`, `avisos`, `arquivo_nome`, `tem_pdf`, `status`, `omie` `{ fornecedor,
  fornecedor_nome, categoria, conta, codigo, erro, anexo_ok, anexo_erro }`,
  `enviado_em`/`enviado_por`, `criado_em`/`criado_por`; desde 24/11 (migration
  107) também `emissor` `{ chave, nome, cnpj, regra }` (null nos tributos) e
  `origem_destino` (`emissor` | `cnpj` | `cnpj_mascara` | `nome` | `tipo` | null).
- `GET /admin/guias/sugestao?fornecedor=` → `{ fornecedor, titulos, categoria,
  categoria_vezes, conta, conta_vezes }`: a categoria e a conta mais usadas
  nos títulos do fornecedor no Omie, sem os cancelados (**só leitura**, a mesma
  consulta do lançamento, guardada 3 min). 400 fornecedor inválido; 502 o
  Omie não respondeu.
- `GET /admin/guias/opcoes` → `{ categorias, contas, erro }` do Omie (só
  leitura, guardadas 6 h; só categorias de despesa ativas e não totalizadoras).
- `GET /admin/guias/fornecedores?q=` → `{ fornecedores }` da cópia
  `omie_clientes` (não chama o Omie).
- `POST /admin/guias` `{ nome, pdf_base64 }` → 201 `{ guias, repetidas,
  sem_codigo }`. 400 se não é PDF; 413 acima de 4 MB.
- `GET /admin/guias/:id/pdf` → o PDF.
- `PATCH /admin/guias/:id` `{ tipo?, competencia?, vencimento?, valor?,
  linha_digitavel?, numero_documento?, omie_fornecedor?, omie_categoria?,
  omie_conta?, lembrar? }` → `{ guia }`. 400 linha com DV errado ou valor
  diferente do código de barras; 409 guia já lançada. Trocar o tipo sem
  mandar o destino traz a regra do tipo novo (virar "outro" traz a do
  emissor); `lembrar` grava a regra: numa conta "outro" com emissor, em
  `guias_emissores`; senão, a do tipo.
- `POST /admin/guias/:id/lancar` `{ forcar? }` → ⚠️ **grava no Omie**
  (`IncluirContaPagar` + `IncluirAnexo`) → `{ guia, anexo, ja_existia? }`.
  503 sem `OMIE_EMISSAO=1`; 400 falta campo; **409 `{ error, parecidas }`** se
  o Omie já tem a guia (mesmo código de barras ou mesmo valor e vencimento no
  fornecedor) — `forcar: true` passa; 409 já lançada; 504 queda sem resposta
  (a guia fica `incerto`).
- `POST /admin/guias/:id/anexo` → ⚠️ grava no Omie: tenta anexar o PDF de novo.
- `POST /admin/guias/:id/descartar` · `POST /admin/guias/:id/restaurar`.

---

## Agenda (`/agenda`) — gestão

Ver [agenda.md](modulos/agenda.md). `authRequired` + `gestaoOnly` em tudo;
faturamento só `masterAdminOnly`.

| Método | Rota | O quê |
|---|---|---|
| GET | `/agenda?de=&ate=` | itens do período (até 100 dias): compromissos expandidos, retornos de O.S., contratos terminando, preventivas, faturamento Omie (admin) |
| POST | `/agenda/compromissos` | cria; `pagamento`/`financeiro` só admin |
| PATCH | `/agenda/compromissos/:id` | edita |
| DELETE | `/agenda/compromissos/:id` | marca apagado |
| GET | `/agenda/faturamento?competencia=AAAA-MM` | retrato do faturamento dos contratos do Omie |
| POST | `/agenda/faturamento/atualizar` | copia de novo do Omie (intervalo mínimo 2 min) |
| GET | `/agenda/faturamento/lote?competencia=AAAA-MM` | o lote do mês (migration 097): `itens` com `estado` (`entra`, `tirado`, `fora` + `motivo`/`motivo_tipo`, `enviando`, `faturado`, `erro`, `incerto`), `resumo`, `dia_proposto`, `dia_configurado`, `emissao_ligada`, `rodando` |
| POST | `/agenda/faturamento/lote/tirar` | `{ competencia, omie_contrato, tirar }`: tira do lote (ou devolve); 409 se já foi enviado |
| POST | `/agenda/faturamento/lote/confirmar` | ⚠️ **grava no Omie**. `{ competencia, contratos, valor_total }` → 202 e o envio segue (um `FaturarContrato` por vez; a tela acompanha pelo GET). 503 sem `OMIE_EMISSAO=1`; 409 se a lista ou o total não batem com o lote de agora, ou se já há lote rodando; 400 fora do mês corrente; 502 se o Omie não diz quem está pendente |
| POST | `/agenda/faturamento/lote/boleto` | ⚠️ **grava no Omie**. `{ competencia, omie_contrato }`: gera o boleto do título que saiu sem boleto (antes pergunta ao Omie se já tem; se tem, só guarda: `ja_tinha`). 503 sem `OMIE_EMISSAO=1`; 409 se já tem boleto, foi pago/cancelado ou o pedido está em andamento; 502 recusa do Omie; 504 sem resposta |
| POST | `/agenda/faturamento/lote/liberar` | `{ competencia, omie_contrato }`: o `incerto` sem nota volta ao lote |

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

| GET | `/admin/status` | adminOnly (status agregado por condomínio + lat/lng/endereço/zona) |
| GET | `/admin/historico?device_ids=A,B&horas=N` | adminOnly (até 10 devices) |
| GET | `/admin/geocode?q=` · `/admin/reverse-geocode?lat=&lon=` | adminOnly (proxy Nominatim) |
| GET/POST/PATCH/DELETE | `/admin/usuarios[/:id]` | GET adminOnly; escrita masterAdmin. **`senha` é opcional para `role='cliente'`** (25/08/2026): ele entra por código no e-mail, e nasce com hash de 32 bytes aleatórios. Para acesso interno a senha segue obrigatória |
| POST | `/admin/usuarios/:id/reset-senha` | masterAdmin. **Não vale para cliente** — ele não tem senha; o botão some da lista |
| GET/PATCH | `/admin/configuracoes` | masterAdmin (config dinâmica) |
| GET | `/admin/integracoes/status` | masterAdmin (OpenAI/WhatsApp/Resend configurados?) |
| POST | `/admin/jobs/{leituras-cleanup,alertas-cleanup,conversas-cleanup}/run` | masterAdmin |
| GET/PATCH | `/admin/sla[/:prioridade]` | masterAdmin |
| ... | `/admin/orcamentos*` e `/admin/orcamentos/avulsos*` | adminOnly (CRUD + PDF) |
| GET | `/admin/orcamentos?status=&condominio_id=&data_ini=&data_fim=&limit=&offset=` | gestaoOnly — os **pedidos** dos técnicos (O.S. com `orcamento_necessario`, com ou sem orçamento) + os pedidos da bancada. **Paginada** (20/11/2026): são duas consultas e cada uma pagina com o mesmo `limit` (1–500, padrão 200) e `offset`; os totais saem em **`X-Total-Count-OS`** e **`X-Total-Count-Bancada`** (somados em `X-Total-Count`). Quem quer tudo segue até `offset` ≥ o maior dos dois. Sem parâmetro responde como antes |
| DELETE | `/admin/orcamentos/:os_id` | gestaoOnly — apaga o **PEDIDO** do técnico, não só o documento: desliga `ordens_servico.orcamento_necessario` **e** apaga o orçamento com aquele `os_id` (itens vão por CASCADE), numa statement só. É o que tira a linha da aba — o `DELETE /orcamentos/avulsos/:id` apaga o documento e a linha **volta** no próximo carregamento, porque quem a sustenta é a flag. ⚠️ **Não alcança o avulso sem `os_id`** (o enviado por fora fica intacto). A `orcamento_observacoes` do técnico é preservada. O.S. inexistente → 404. Ver [`changelog.md`](changelog.md) 03/09 |
| GET | `/admin/orcamentos/avulsos?limit=&offset=` | gestaoOnly — lista de **todos** os orçamentos, **paginada** (20/11/2026): `limit` 1–500 (padrão 300, o corte de antes), `offset` ≥ 0, mais novo primeiro (desempate por id); total no header **`X-Total-Count`**. Sem parâmetro responde como antes. Devolve **as duas** formas do total: `valor` (coluna crua; `null` = somar os itens) e `valor_total` (`COALESCE(valor, soma dos itens, 0)`). O modal do admin edita `valor`, então **tirar essa coluna do SELECT faz o campo do total manual abrir vazio e o próximo `PATCH` apagar o valor no banco** — ver [`changelog.md`](changelog.md) 24/08 |
| — | orçamento que vence (migration 103) | `GET /admin/orcamentos/avulsos` traz também `arquivado_em` (o enviado vencido sem resposta que o job arquivou; o status continua `enviado`) e `lembrete_em` (quando saiu o último lembrete ao cliente). `PATCH /admin/orcamentos/avulsos/:id` e `PATCH /admin/orcamentos/:os_id` (`salvar`) com `valido_ate` hoje/futuro ou vazio **desarquivam**; o reenvio (`enviar-email`) desarquiva só com a validade em dia. Ver [orcamentos-vencimento.md](modulos/orcamentos-vencimento.md) |
| POST | `/admin/orcamentos/avulsos/:id/resposta-vista` | marca que alguem do escritorio ABRIU a resposta do cliente. ⚠️ **Nao apaga mais o aviso** (078) — quem apaga e a baixa abaixo. Idempotente: nao reescreve a data da primeira vez |
| POST | `/admin/orcamentos/avulsos/:id/resposta-baixa` | da baixa na resposta do cliente — e **isto** que tira a pendencia da aba. Body `{ desfazer?: true }` reabre. Idempotente: um segundo clique nao reescreve a data nem troca o autor. Devolve `{ resposta_tratada_em, resposta_tratada_por_nome }`. Sem `respondido_em` na linha, nao grava nada; id inexistente → 404 |
| GET | `/admin/orcamentos/avulsos/:id/nota` | gestaoOnly — **prévia da nota, sem chamar o Omie**: `linhas` (com `natureza` gravada e `natureza_sugerida`; nas peças, `produto` escolhido e `sugestoes` do catálogo, com `lembrado: true` no da última vez), `itens` exatamente como iriam para a nota (rateados; na DANFE com `codigo_produto`, `ncm` e `cfop`), `total`, `tipo` (`nfse`/`nfe`), `servico_embutido`, `bloqueio` (frase ou null), `cliente`, `emissao_ligada`, `catalogo` (`total`, `atualizado_em`, `sincronizando`), `nota` (estado atual). Catálogo com mais de 24 h se atualiza em segundo plano. Ver [modulos/nota-fiscal.md](modulos/nota-fiscal.md) |
| POST | `/admin/orcamentos/avulsos/:id/nota/previa` | gestaoOnly — a mesma prévia, com o que está marcado no modal e ainda não foi gravado: body `{ naturezas, produtos: { [linha_id]: codigo_produto }, pagamento: { parcelas, vencimentos? } }`. **Não grava nada** (POST só por levar corpo). A página da nota (23/11/2026) não usa esta rota; o `GET` devolve também `orcamento`, `destinatario`, `rascunho`, `info_adicional_padrao`, `impostos` (a simulação válida) e `impostos_vencidos`. Desde 23/11/2026 manda-se só `{ pagamento }` (peça/serviço e produto são gravados no orçamento). A prévia devolve `bloqueio_pendencia` (true quando o `bloqueio` é peça sem produto ou produto inativo, que o modal mostra como pendência do orçamento) e `pagamento` (`parcelas`, `do_orcamento` lido do texto, `forma_pagamento`, `lista` com `vencimento` AAAA-MM-DD, `valor`, `percentual`) |
| POST | `/admin/orcamentos/avulsos/:id/nota/emitir` | gestaoOnly — body `{ naturezas: { [linha_id]: "servico"｜"peca" }, produtos: { [linha_id]: codigo_produto }, pagamento: { parcelas: 1..12, vencimentos?: ["AAAA-MM-DD"] }, emails?: "a@x, b@y", info_adicional?: "texto" }` (`info_adicional` vai nas informações complementares da nota, `cDadosAdicNF`/`dados_adicionais_nf`; sem ela, a do rascunho; sem rascunho, "Orçamento OR-…". Antes de emitir, a rota grava cobrança, e-mails e informações no rascunho, migration 104) (os destinatários da nota, migration 102: vão no bloco `Email` da O.S. / `utilizar_emails` do pedido e ficam em `orcamentos.nota_emails`; inválido = 400; sem o campo, a lista da prévia, que traz `emails { lista, fonte, numero, data }`); naturezas e produtos, opcionais (o modal não manda desde 23/11/2026: a emissão lê o gravado no orçamento), gravados antes de tudo quando vêm, o pagamento só vai na emissão (2+ parcelas = código `999` com a lista; vencimento no passado ou fora de ordem = 409) (422 se o produto não estiver no catálogo). 422 se alguma linha cobrável ficar sem natureza; 409 com o `bloqueio` (peça sem produto, fora de SP, OS/pedido de tentativa anterior do outro tipo, já emitida, não aprovado, tipo limpeza/dedetização…) ou emissão em andamento; **503 sem `OMIE_EMISSAO=1`** (kill-switch: o Omie não tem ambiente de teste). Cliente (cache → CNPJ → `UpsertCliente`); só serviço: OS `ORC-<id>` + `FaturarOS`; com peça: pedido de venda `ORC-<id>` (acha antes de criar) + `FaturarPedidoVenda`, e a escolha de produto vai para `omie_produto_vinculos`. Devolve o estado da nota |
| POST | `/admin/orcamentos/avulsos/:id/nota/atualizar` | gestaoOnly — relê no Omie e grava número, link e status (`processando`/`emitida`/`erro`/`cancelada`). NFS-e: `StatusOS`. DANFE: `ConsultarNF` por `nIdPedido` + `ObterNfe` (PDF em `cPdf`). ⚠️ Com a nota emitida e `boleto_status = 'pendente'` (e `OMIE_EMISSAO=1`), **gera o boleto das parcelas** (ver a linha abaixo). A resposta traz `banco`, `remessa`, `boleto_status`, `boleto_erro` e `boletos[]` |
| GET | `/admin/orcamentos/avulsos/:id/fotos` | gestaoOnly — fotos do orçamento (migration 105): `{ fotos: [{ id, os_foto_id, legenda, ordem, url }], os_fotos: [{ id, legenda, tipo, url, incluida }] (da O.S. vinculada, só as com imagem no banco), os_numero, max: 12 }` |
| POST | `/admin/orcamentos/avulsos/:id/fotos` | gestaoOnly — `{ os_foto_id }` (só da O.S. vinculada) ou `{ image_base64: "data:image/jpeg;base64,…", legenda? }` (até ~1,5 MB; a tela reduz para 1600 px). 409 acima de 12; devolve a lista |
| PATCH | `/admin/orcamentos/avulsos/fotos/:fotoId` | gestaoOnly — `{ legenda }`; devolve a lista |
| DELETE | `/admin/orcamentos/avulsos/fotos/:fotoId` | gestaoOnly — tira do orçamento (a foto da O.S. fica); devolve a lista |
| GET | `/admin/orcamentos/fotos/:chave/imagem` | **pública** (o `<img>` não manda token), como a imagem da O.S.; chave aleatória de 32 hex |
| PUT | `/admin/orcamentos/avulsos/:id/nota/rascunho` | gestaoOnly — salva o rascunho da nota (migration 104): body com qualquer um de `{ pagamento, emails, info_adicional }`, por merge em `orcamentos.nota_rascunho`. Devolve `{ salvo_em, salvo_por_nome }`. 409 se a nota já foi pedida ao Omie |
| DELETE | `/admin/orcamentos/avulsos/:id/nota/rascunho` | gestaoOnly — descarta o rascunho (cobrança, e-mails e informações voltam ao padrão) e devolve a prévia. 409 depois de pedida |
| POST | `/admin/orcamentos/avulsos/:id/nota/impostos` | gestaoOnly — impostos antes de emitir. DANFE: `SimularImpostos` do Omie (só leitura), guardado em `nota_rascunho.impostos` com a assinatura dos itens; mesma assinatura = devolve o guardado sem chamar o Omie; 429 se pedida de novo em menos de 65 s; 409 se alguma peça está sem produto ou o cliente não está no Omie fora de São Paulo. Devolve `{ tipo, assinatura, em, itens: [{ cfop, icms_cst, icms, icms_st, ipi, pis, pis_cst, cofins, cofins_cst, ibs, cbs, valor_total }], totais, simples_nacional }`. NFS-e: não chama o Omie (`{ tipo: "nfse", servico, iss_retido }`) |
| POST | `/admin/orcamentos/avulsos/:id/nota/boletos` | gestaoOnly + painel novo — ⚠️ **grava no Omie** (`GerarBoleto`). Acha os títulos da nota (`ListarContasReceber`, casados por `nCodOS`/`nCodPedido`) e gera o boleto dos que não têm. 409 se a nota não está emitida ou se houve pedido há menos de 70 s; 503 sem `OMIE_EMISSAO=1`. Recusa numa parcela → `boleto_status: 'erro'` com o motivo (200) |
| GET | `/admin/orcamentos/avulsos/:id/nota/boletos/:titulo/link` | gestaoOnly — `{ link }` do PDF do boleto da parcela (`ObterBoleto`, só leitura; o link vale 24 h). 404 se a parcela não é do orçamento |
| GET | `/admin/omie/produtos?q=` | gestaoOnly — busca no catálogo **local** do Omie (`omie_produtos`), por nome ou código exato: até 15 produtos com `codigo`, `descricao`, `ncm`, `unidade`, `vezes_faturado`, `cfop`. Catálogo vazio: sincroniza antes de responder (~1 min). **`&historico=1`** (editor de itens, 20/11/2026): `limite` 1–15 (padrão 6), cada produto com `ultima_vez` `{ valor, orcamento_id, numero, em }` de orçamento aprovado (`orcamento_id=` tira o próprio), o lembrado para o texto em cima com `lembrado: true`, e catálogo vazio devolve `[]` sem sincronizar. Ver [modulos/pecas-no-orcamento.md](modulos/pecas-no-orcamento.md) |
| GET/POST/PATCH | `/admin/orcamentos/avulsos/:id/linhas` · `/admin/orcamentos/avulsos/linhas/:id` | gestaoOnly — as três devolvem a linha no mesmo formato, com `natureza`, `omie_produto_codigo` e o produto (`produto_codigo`, `produto_descricao`, `produto_ncm`, `produto_unidade`, `produto_inativo`). POST e PATCH aceitam `omie_produto_codigo` (null tira; produto escolhido sem natureza vira `peca`) e `natureza` (`peca`, `servico` ou vazio). 422 produto fora do catálogo/inativo; 400 natureza inválida; **409 se a nota estiver emitida ou processando** (só produto e natureza; valor e descrição continuam) |
| POST | `/admin/omie/produtos/sincronizar` | gestaoOnly — recarrega o catálogo do Omie (`ListarProdutos` + `ListarPedidos` faturados, **só leitura** lá; ~1 min 10 s, em série). Devolve `{ total, atualizado_em }` |
| GET | `/admin/orcamentos/avulsos/:id/destinatarios` | as DUAS listas do modal de envio: `usuarios` (quem tem login de cliente) e `cadastrados` (`condominios.email`). São diferentes de propósito — ver [modulos/orcamentos-envio.md](modulos/orcamentos-envio.md) |
| POST | `/admin/orcamentos/avulsos/:id/enviar-email` | adminOnly — envia o orçamento ao cliente (Resend) e marca como `enviado`. Body `{ emails }` **obrigatório** (o front pré-preenche com `condominios.email`). O corpo do e-mail é fixo desde 24/08/2026: um `mensagem` no body é ignorado. **Desde 25/08/2026 o e-mail leva o link do painel OU o PDF anexado, nunca os dois**: com condomínio que tenha usuário `cliente`, vai o link e o PDF nem chega a ser gerado; sem isso, vai o anexo como antes. A resposta traz `link_painel` e `anexo` dizendo o que saiu. Kill-switch: `ORCAMENTO_LINK_PAINEL=0`  Body: `{ modo: "painel"｜"carta", emails?, mensagem? }`. `painel` ignora `emails` e usa os usuários do condomínio; `carta` usa `emails` e leva mensagem, assinatura e PDF |
| GET/PATCH | `/admin/me/email-template` | ⏸️ **sem uso desde 24/08/2026** — mensagem padrão do usuário logado. O corpo do e-mail de orçamento virou fixo e nenhuma tela chama mais esta rota; ela e a coluna continuam de pé porque a remoção foi só da interface |
| POST | `/admin/me/assinatura` | ⏸️ **sem uso desde 24/08/2026** — upload da assinatura em base64 (`data:image/...`) → `usuarios.assinatura_blob`. O admin **reduzia a imagem no navegador** antes de enviar (máx. 600 px / ~180 KB): o limite do `express.json` é 8 mb e o e-mail embutia a imagem como data URI |
| GET | `/admin/assinatura/:userId` | ⏸️ **sem uso desde 24/08/2026** — serve a imagem de assinatura (pública, era usada nos e-mails) |
| GET | `/admin/condominios/:id/historico` · `/condominios/lista` | adminOnly |
| GET | `/admin/condominios/:id/orcamentos-pendentes` | adminOnly — os orçamentos **aprovados** daquele prédio que ainda esperam execução. Alimenta o bloco "Serviço já autorizado" do modal de novo chamado. ⚠️ **"Pendente" aqui é a chave `livre` de `execucao()`**, não o `status`: com chamado aberto o serviço está andando, com chamado fechado já foi feito — oferecer os dois convidaria a abrir um segundo chamado para o mesmo serviço. **Chamado cancelado volta a ser pendente** desde 10/09/2026: a condição era `NOT EXISTS` sobre `chamados`, e cancelado é um chamado que existe — o orçamento sumia do aviso justamente porque o serviço deixou de ser feito. **Serve as DUAS telas** (modal do admin e diálogo de novo chamado do operador): um endpoint só para o operador foi escrito e descartado no mesmo dia, porque as duas versões da regra já discordavam. **Sem valor**, mesma regra do `GET /operador/orcamentos` |
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
| GET | `/operador/fila` | adminOnly — **uma request monta a tela inteira**: chamados abertos (`aberto`, `em_atendimento`) com o SLA já resolvido, os reservatórios do condomínio de cada um e a equipe com posição atual. Desde 20/11/2026 cada item traz `escritorio` e `pede_escritorio` (`{ motivo, em, por }` ou `null`), e a resposta traz `agenda_hoje` (compromissos de hoje que não são `so_admin` e retornos de O.S.; `null` se a leitura falhou) |
| GET | `/operador/tecnicos` | adminOnly — a equipe que pode receber um chamado (id, nome, `disponivel`, `abertos`, GPS dos últimos 30 min). É a lista do seletor **Técnico** dos diálogos de abrir chamado |
| GET | `/operador/prazos` | adminOnly — os prazos de `sla_definicoes` + as faixas de nível e a janela do sensor mudo. É o que a **Ajuda** das duas telas mostra |
| GET | `/operador/preventivas?mes=YYYY-MM` | adminOnly — os planos de manutenção que vencem no mês (mais os **vencidos de meses anteriores**, com `atrasada`), cada um com `estado` (`a_fazer`/`escalada`/`em_campo`/`feita`), o responsável e a origem dele (`escala` ou `zona`), e a equipe para o diálogo de despacho. Desde 10/09/2026 traz também `baixa_manual_em`/`baixa_manual_por_nome` (a baixa dada à mão, migration 085) e `exec_os_id`/`exec_os_numero`/`exec_os_finalizada_em` — **a O.S. que executou a preventiva**, achada pelo chamado do plano que fechou. ⚠️ Não confundir com `baixa_os_id`/`baixa_os_numero`, que são a O.S. de OUTRO chamado que deu a baixa de carona (084): quando existem as duas, quem a placa mostra é a que executou. O `LEFT JOIN LATERAL` da O.S. depende do chamado fechado e tem de vir depois dele. Sem `mes`, o mês corrente. ⚠️ Lista **planos, não chamados**: o chamado P4 só nasce quando o serviço começa, e a tela precisa mostrar o que FALTA |
| POST | `/operador/preventivas/atribuir` | adminOnly — escala um lote para um técnico neste mês. Body `{ plano_ids: [], tecnico_id, mes? }`; `tecnico_id` **nulo desescala** (devolve o prédio à régua da zona). É a mesma rota para os dois caminhos da tela — "a zona inteira" é ela mandando os ids de uma zona, "prédio a prédio" são os marcados. Upsert numa transação, máx. 200 por vez. Migration 082 |
| POST | `/operador/preventivas/:id/feita` | adminOnly — a visita **já aconteceu**: dá baixa à mão na preventiva do mês. Body `{ mes? }`. Rola o ciclo do plano (`ultima_em`, `proxima_em`), cancela o chamado P4 órfão do mês se houver, e grava a baixa com quem marcou. **409 quando a preventiva está em campo** (chamado aberto com técnico): ali quem fecha é a O.S. Migration 085 |
| DELETE | `/operador/preventivas/:id/feita?mes=YYYY-MM` | adminOnly — desfaz a baixa: devolve as datas anteriores do plano e reabre o chamado que a marcação cancelou (só se ele continuar cancelado) |
| GET | `/operador/orcamentos` | adminOnly — os orçamentos **aprovados**, por prédio, para a tela `/operador/painel/orcamentos`. Traz `chamado_id`/`chamado_status` do chamado que executa cada um (079) e, desde 03/09/2026, `exec_os_id`/`exec_os_numero`/`exec_os_finalizada_em` — **a O.S. daquele chamado**, que é o que de fato aconteceu no prédio. ⚠️ **Não confundir com `os_id`/`os_numero`**, que são a O.S. de ORIGEM (aquela em que o técnico pediu o orçamento). O segundo `LEFT JOIN LATERAL` depende do primeiro e tem de vir depois dele |
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

⚠️ **Marcar a preventiva como feita é destrutivo, e por isso o desfazer é
completo.** O `POST` rola `proxima_em` para o ciclo seguinte — sem isso o job
reabriria o chamado do mês na madrugada seguinte e a preventiva marcada
voltaria como "em campo". Como a marcação é de **um clique sem confirmação**, a
linha em `planos_baixas_manuais` guarda as datas anteriores do plano e o id do
chamado cancelado; o `DELETE` devolve os dois. Ver
[banco-de-dados.md](banco-de-dados.md).

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
| GET | `/equipamentos/etiquetas.pdf?lote=…\|ids=…&formato=` | adminOnly — folha A4 em memória. `formato`: `corte` (padrão), `grande` (130 × 80 mm, 3/folha, papel comum p/ recortar e plastificar) ou `pimacoA4263` (A4263 / Avery L7163, 14/folha, 99 × 38,1 mm). `dx`/`dy` (mm, ±5) deslocam a grade e `escala` (%, 90–110) compensa driver que reduz a página — calibração do registro da impressora. **Recusa** gerar se a URL pública for local (defina `PUBLIC_BASE_URL`; `&forcar=1` ignora, só para teste) |
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
| POST | `/equipamentos/:id/desfazer-cadastro` | **masterAdminOnly** — devolve a etiqueta a `etiqueta_livre` pra ser reaproveitada (cadastro feito na etiqueta errada). Body `{ codigo }` **precisa bater** com o do equipamento. Zera condomínio, dados cadastrais, `vinculado_em` e a linha do tempo; mantém `codigo`, `lote` e `criado_em`. **409 com `impedimentos`** se houver foto, chamado, orçamento, O.S. ou movimentação além do `cadastro`/`retirada` de abertura. `{ forcar: true }` passa por cima **só das movimentações** (o 409 avisa com `pode_forcar`); foto, chamado, orçamento e O.S. recusam mesmo forçando |
| DELETE | `/equipamentos/lote/:lote` | **masterAdminOnly** — descarta o lote de etiquetas em branco (folha impressa errada). Apaga só as virgens (`etiqueta_livre` sem movimentação); devolve `{apagados, preservados[]}` com as que tinham uso e ficaram intactas |

**`GET /e/:codigo`** (fora deste router) serve o HTML da ficha. Path curto de
propósito: menos caractere na URL = QR com menos módulos = etiqueta legível
mesmo suja. Sem sessão, a página manda para `/login?next=/e/CODIGO`.

## Páginas legais para a Meta (24/11/2026, preparadas localmente)

`GET /app/privacidade.html` e `GET /app/exclusao-de-dados.html` são páginas HTML públicas servidas pelo mount `/app` existente, sem JWT, banco ou exclusão automática. Ainda precisam de revisão e publicação. Ver [Meta Tech Provider](modulos/meta-tech-provider.md).
