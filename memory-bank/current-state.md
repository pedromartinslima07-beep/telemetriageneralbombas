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
│   chamado-historico · chamado-mensagens · orcamento-pdf · os-pdf            │
│                                                                              │
│  Controllers: whatsapp.controller (webhook → background → IA)               │
│                                                                              │
│  Jobs (setTimeout recursivo, lêem config dinâmica a cada tick):             │
│   offline · planos-manutencao · gps-cleanup · leituras-cleanup ·            │
│   alertas-cleanup · conversas-cleanup · conversas-timeout                    │
│                                                                              │
│  Extras embutidos no app.js: proxy de tiles /tiles/:z/:x/:y.png (cache em   │
│   memória + dedupe inflight) · página /admin/reset-cache (limpa PWA) ·      │
│   handlers finais de 404 e de erro respondendo JSON (413/400 do body-parser)│
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
  update last_seen + auto-resolve offline) → geração/resolução de alertas →
  nível baixo/muito baixo **novo** também abre chamado automático via
  `abrirChamadoAuto` (categoria `nivel_baixo`, P3/P2, dedup por
  condomínio+categoria — ver [chamados-sla.md](../docs/modulos/chamados-sla.md)).
- **Alertas de nível são estado, não histórico:** rodam em toda request (mesmo
  nas que o threshold não gravou), o nível vigente sai dos **alertas abertos**
  do device — nunca da última leitura gravada — e sair de faixa exige histerese
  de 5 pontos (`TELEMETRIA_HISTERESE_PCT`). Na página de Alertas o alerta de
  telemetria e o chamado `[AUTO]` do mesmo evento aparecem **como um item só**.
  Ver [telemetria.md](../docs/modulos/telemetria.md).

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
| **tecnicos / tecnicos-localizacao** | Cadastro técnicos + GPS + ETA. A **janela de expediente** (`gps.expediente_*`, default 8–18, fuso `America/Sao_Paulo`) é aplicada **no backend**: fora dela o POST não grava e o GET devolve `[]`. App e serviço Java também a aplicam, mas só o backend é fonte da verdade — ver [app-mobile.md](../docs/modulos/app-mobile.md) |
| **ordens-servico** | O.S. digital (fotos, assinatura, orçamento) + PDF. Fotos persistidas em `os_fotos.dados_base64` (banco), servidas via `GET /ordens-servico/:osId/fotos/:fotoId/imagem` — não dependem mais de disco efêmero. |
| **planos-manutencao** | Planos preventivos recorrentes |
| **contratos** | Contratos por condomínio. Assinatura eletrônica própria por link de e-mail (sem ZapSign/D4Sign — ver `decisions.md`): exige código de 6 dígitos antes de assinar (2FA equivalente ao login) e grava um protocolo (hash SHA-256 auditável) impresso no PDF junto com IP e data/hora |
| **orçamentos** | Sistema unificado (tabela `orcamentos` + `orcamento_linhas`); `tipo` (060) ramifica o PDF avulso entre tabela de peças (padrão) e layout descritivo por cláusulas para limpeza de reservatório/dedetização/combo, mesmo timbrado. Item sem `valor_unitario` some da coluna de valor no PDF em vez de virar "R$ 0,00"; `orcamentos.valor` serve de override manual do total (062) e, quando preenchido, **remove do PDF as colunas Valor Unit./Total por item** — só o box VALOR TOTAL aparece |
| **relatorio / relatorios** | PDF de telemetria (Puppeteer) pro cliente/app; painel ao vivo (chamados em risco + workload) e exportação CSV de chamados/alertas/telemetria pro admin |
| **equipamentos** | Identidade permanente de bomba/motor/painel + etiqueta QR (migration 070). Guard próprio `equipeInterna` (inclui **técnico**, que não passa em `adminOnly`). Ficha em `/e/:codigo`, folha A4 de etiquetas via Puppeteer + `qrcode`. Fluxo em [equipamentos.md](../docs/modulos/equipamentos.md) |
| **admin** | Usuários, status agregado, histórico, geocode, configurações |
| **status / leituras / jobs** | Endpoints auxiliares e disparo manual de jobs |
| **leads** | Contatos da landing pública. `POST /leads` é público (rate limit + honeypot `site` + truncagem); leitura e funil exigem `gestaoOnly`. Fluxo em [landing-publica.md](../docs/modulos/landing-publica.md) |

## Funcionalidades prontas (✅)

**Telemetria & alertas**
- Ingestão ESP32 com write-threshold e auto-resolve de offline.
- Job offline (alerta após N min sem leitura, idempotente).
- Seção **Telemetria avançada** (5 KPIs, bar chart de níveis, críticos, status
  das bombas, histórico 24h/3d/7d com export PDF).
- Página **/alertas unificada** (telemetria + chamados): KPIs clicáveis, tabela
  unificada, painel lateral com gauge/histórico, ações recomendadas hardcoded,
  **análise IA sob demanda**, comentários.

**Painel admin — sistema "Chapa", registro de operação** (migrado em 20–21/08/2026)
- As 15 telas usam o mesmo sistema visual da landing, do login e do painel do
  cliente: marinho como material, `#fbb329` institucional, chanfro de 45°,
  Archivo + Martian Mono. O "Mission Control" (âmbar `#f0b014`, aurora, vidro)
  **não existe mais** — regras e fronteiras em [`../DESIGN.md`](../DESIGN.md).
- **Placa clara é o que abre por cima** (modal, drawer); o que fica lado a lado
  com o conteúdo é superfície de trabalho e continua marinho.
- **Selo de estado:** preenchido pede ação, de fio em repouso — e só uma
  dimensão preenche por linha (prioridade x status, severidade x status).
- **Paleta de gráfico:** três slots em ordem fixa, com degrau próprio para
  campo escuro e claro. O teto de três é medido, não estilístico.
- ⚠️ O **app do técnico** (`app/public/app.css`) não migrou e mantém
  `--accent: #f0b014` — quarta identidade, dívida conhecida.
- Sidebar colapsável, topbar, mission control grid, feed em tempo real.
- **A nav da sidebar cabe inteira na tela** (24/08/2026): as faixas de
  `@media (max-height)` foram recalculadas por medição (Puppeteer varrendo
  de 1 em 1px, confirmado no Chrome real). Com os 15 itens visíveis a nav
  não rola acima de 598px de viewport. São **oito degraus de densidade**, e
  a granularidade fina é o ponto: com faixas largas, quem estava em 889px
  levava o aperto calculado para 801px e sobravam ~139px de vão morto no pé
  da lista. Os rótulos de seção são texto (8.8px mono) em todas as faixas
  menos a mais apertada (614–700px, notebook com barra de tarefas), onde
  viram filete de 1px. Ver [decisions.md](decisions.md).
- **Mapa interativo Leaflet** (tiles OpenStreetMap + filtro CSS dark): pinos por
  status, painel lateral com tabs, KPIs, donuts, classificação por zona de SP.
- Cadastro de coordenadas com **geocoding híbrido** (ViaCEP + AwesomeAPI +
  BrasilAPI + Nominatim) e reverse geocode ao arrastar o pino. A coordenada da
  BrasilAPI só vale quando o `service` da resposta não é `open-cep` — esse
  provider devolve o centroide do município e jogava todo pino no centro da
  cidade (25/08/2026). Ver
  [../docs/modulos/mapa-geocoding.md](../docs/modulos/mapa-geocoding.md).
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
- **SLA configurável** + métricas TTFR/TTR (`primeira_resposta_em`,
  `tempo_resolucao_seg`) + **painel ao vivo** de chamados em risco/workload
  na aba Relatórios; análise histórica de SLA é feita via export CSV.
  O TTFR é marcado por qualquer primeiro toque da equipe — atribuir técnico ou
  responsável, mudar status, mensagem/comentário, iniciar atendimento ou chegar
  (lista completa em [chamados-sla.md](../docs/modulos/chamados-sla.md)).
- **O.S. digital** completa (fotos base64 comprimidas, assinatura, orçamento) +
  PDF via Puppeteer; página de O.S. no admin.
- Histórico de chamados, mensagens do chamado, avaliação.
- **Orçamentos unificados** (Migration 030) + encaminhamento via IA por email.
  **Envio do orçamento ao cliente por e-mail** (PDF anexo via Resend, botão no modal;
  destinatário de `condominios.email` — múltiplos por vírgula; marca `enviado` +
  `enviado_em/enviado_para`, migration 047). Remetente: `comercial@generalbombas.com`.
  **Corpo fixo desde 24/08/2026**, com a identidade da casa: faixa marinho com o
  logo embutido, etiqueta "Orçamento comercial", caixa com Número/Cliente/Data/
  Válido até (sem o valor — ele fica no PDF) e rodapé de contato. O modal de
  envio ficou só com o campo "Para": o campo de mensagem e o upload de
  assinatura por usuário saíram. As rotas `/admin/me/email-template` e
  `/admin/me/assinatura` e as colunas `usuarios.email_mensagem` /
  `assinatura_blob` continuam no ar **sem chamador** — a remoção foi da
  interface, não do dado.
  O logo vai como data URI reduzido (`public/logo-email.png`, 20 KB, gerado por
  `scripts/gerar-logo-email.js`): o original de 68 KB vira 91 KB em base64 e o
  Gmail apara a mensagem acima de ~102 KB de corpo — o anexo não conta nesse
  limite, o data URI conta. Corpo atual: 31 KB.
- Planos de manutenção preventiva + contratos. Na aba Planos, seleção múltipla
  (checkbox por linha + "todos" no cabeçalho) com **edição em massa** de
  periodicidade / próxima execução / status via `PATCH /planos-manutencao/bulk`.

**Equipamentos e etiqueta QR (Fase 12A)** — `migrations/070`,
`src/routes/equipamentos.routes.js`, `src/services/etiquetas-pdf.service.js`,
`public/equipamento.{html,css,js}`
- Etiqueta **permanente do equipamento** (não da passagem pela oficina) e que
  **nasce em branco** — a bomba chega antes do cadastro existir, então o vínculo
  com o condomínio acontece no ato da retirada, com a bomba na mão.
- Código do QR é **aleatório** (base32 Crockford, 8 caracteres, sem I/L/O/U): a
  ficha revela endereço de cliente, e URL sequencial exporia o parque inteiro.
- **Sem plugin de scanner** — a câmera nativa do Android abre a URL. Mexer no
  build Android competiria com o prazo de 31/08 da Play Store.
- Folha A4 em dois formatos (papel comum com marcas de corte · Pimaco 6180).
  ⚠️ O gerador **recusa** QR com host local — etiqueta é física e permanente.
  Depende de `PUBLIC_BASE_URL` nas envs.
- ⚠️ **A foto usa rota autenticada** (`fetch` + object URL), diferente da
  equivalente em `os_fotos`, que é pública: aqui o id é sequencial e o conteúdo
  é o interior da casa de máquinas de um cliente.
- Migration 070 aplicada em **teste e produção** (2026-08-17).
- Diagnóstico, peças, orçamento e painel da bancada são Fase 12B.

**App mobile (Capacitor 8)** — `app/public/`
- **Capacitor 8.4.2** desde 2026-07-28 (`targetSdk 36`, `minSdk 24`, AGP 8.13.0,
  Gradle 8.14.3, Java 21) — piso exigido pela Play Store a partir de 31/08/2026.
  Requisitos de build em [app-mobile.md](../docs/modulos/app-mobile.md).
- Telas técnico: chamados, detalhe, O.S., conta; ciclo com GPS.
- Telas cliente/síndico: home, telemetria, chamados (KPIs clicáveis), conta,
  suporte, novo chamado, detalhe.
- Auth + onboarding; rastreamento GPS; herda visual do admin.
- **Login e OTP são só logo + formulário** (jul/2026): sem título `TELEMETRIA`,
  sem subtítulo e sem o rodapé de diagnóstico que exibia a URL da API. O login
  do **site** (`public/login.html`) mantém os textos — as duas telas deixaram de
  ser espelhadas de propósito.
- **Camada visual HUD "Painel de comando"** (jun/2026): grid técnico + scanline
  de fundo, dados em monospace, headers
  uppercase tracked, indicador de aba no bottom-nav. Bloco aditivo no fim de
  `app/public/app.css` + tokens `--hud-*`; só mobile, não afeta admin/site.

- **Toolbars do admin quebram linha** (ago/2026): `.cardHead`, `.wa-tabs` e
  `.mp-tabs` têm `flex-wrap: wrap`. Antes só quebravam em `max-width: 768px` e,
  entre ~1280px e 1536px, o `overflow: hidden` do `.card` **recortava
  controles inteiros sem deixar scroll** — o "+ Novo" da telemetria era o caso
  visível. Ao acrescentar filtro/botão numa toolbar, confira em 1366px: é a
  largura de notebook onde a folga acaba primeiro. Medição em
  [changelog.md](../docs/changelog.md) (2026-08-05).

- **Duas cascas de modal, não uma** (ago/2026). Ao criar ou reformar um modal
  do admin, escolha antes de escrever markup:
  - **`.modalBox`** (padrão) — `.modalHead` / `.modalBody` que rola inteiro /
    `.modalFoot`. Serve pra tabela, detalhe e formulário curto.
  - **`.modalBox.is-split`** — janela de **altura fixa** com `.modal-split`
    (grid), `.modal-split-form` (rola) e `.modal-rail` (fixo, 360px). Para
    formulário longo que tem algo que não pode sair da vista: o total no
    orçamento, o mapa e o "Salvar" no Editar condomínio. Colapsa em coluna
    única abaixo de 1080px.
  - ⚠️ **Todo wrapper entre `.modalBody` e `.modal-split` precisa repassar o
    flex** (`flex: 1; min-height: 0; display: flex`), senão o formulário vaza
    pra fora da janela. Já mordeu duas vezes: `#avModalBody` no orçamento e
    `.edit-tab-pane` no Editar condomínio.
  - Rótulo de campo tem gramática própria: `.modal-sec-title` (seção),
    `.f span em` (dica dentro do rótulo), `.f span b` (asterisco de
    obrigatório), `.modalFoot-danger` (ação destrutiva sem cara de botão).

- **Nas telas master-detail (`.ch-layout`), quem rola é o `.content`, não a
  lista** (ago/2026). `.ch-list-col .tableWrap` tem `overflow-y: auto`, mas
  `.ch-list-col` é `align-self: stretch` numa linha de altura automática —
  nada limita a altura dele, então o `auto` nunca engata e a página inteira
  rola. Por isso o painel de detalhe é `position: sticky; top: 0` com teto de
  viewport: sem isso ele saía da tela junto com a rolagem da lista. Vale para
  Alertas, Clientes, Chamados, Orçamentos (2 modos) e Colaboradores.
  Se um dia a lista precisar rolar por dentro, é a altura da coluna esquerda
  que muda — e isso mexe nas 5 telas de uma vez.

- **Gráfico dentro de contêiner rolável precisa de `overflow-x: hidden`**
  (ago/2026). `overflow-y: auto` sozinho **também** torna o eixo X rolável — a
  regra do CSS diz que, quando um eixo não é `visible`, o outro computa de
  `visible` para `auto`. Os overlays do ApexCharts (`.apexcharts-xaxistooltip`
  em especial) são posicionados no cursor e vazam nas bordas: bastam 5px pra
  abrir uma barra de rolagem, que come altura, que redimensiona o gráfico
  (`height: "100%"`), que perde o hover — e o modal treme. Diagnóstico completo
  em [changelog.md](../docs/changelog.md) (2026-08-06).
  ⚠️ Não feche o eixo Y junto: o canvas do Apex é ~47px mais alto que o
  contêiner com `height: "100%"`, e é a rolagem vertical que mantém a linha de
  datas alcançável.

**Landing pública** — `public/index.html` + `landing.css` + `landing.js`
- Rota `/` é a página de apresentação para síndicos (não é mais redirect para
  `/login`). Formulário posta em `POST /leads`; o funil é lido no admin.
- Sistema visual **próprio**, chamado "Chapa" — derivado do chanfro do wordmark
  da General. **Não compartilha nada com `admin.css`** e não deve passar a
  compartilhar: o admin é ferramenta de operação, a landing é peça de venda.
- Fontes auto-hospedadas (Archivo variável + Martian Mono) em `public/fonts/`,
  porque a CSP `script-src 'self'` do helmet não permite CDN.
- ⚠️ **Não registra service worker**, de propósito. Mas o `?v=N` de
  `landing.css`/`landing.js` continua valendo.
- ⚠️ O painel do hero é **demonstração com dados simulados** e diz isso na
  própria placa. As faixas 45% / 20% são as mesmas do backend — se mudarem lá,
  mudam aqui. Detalhe e demais pegadinhas em
  [landing-publica.md](../docs/modulos/landing-publica.md).
- ⚠️ **Toda a copy é primeira pessoa do plural** ("Monitoramos", "a gente
  sabe"). Terceira pessoa ("A General monitora") faz a página soar como um
  terceiro apresentando a empresa — ver [decisions.md](decisions.md).
- ⚠️ A seção `#servico` (`.vigia`) é **uma placa dividida por cortes
  gravados**, não três cards. Substituiu a linha do tempo da madrugada em
  2026-08-13.

**Painel do cliente** — `public/cliente.html` + `cliente.css` + `cliente.js`

É a **v3**, implementada em 2026-08-14 a partir da comp
[`../docs/comps/painel-cliente-v3.html`](../docs/comps/painel-cliente-v3.html).
A v1 (13/08) foi rejeitada por manter a casca do admin — ver
[decisions.md](decisions.md). Fluxo e pegadinhas em
[painel-cliente.md](../docs/modulos/painel-cliente.md).

- **Folha autônoma no sistema "Chapa"**: `cliente.html` **não carrega
  `admin.css`**, em volume mais baixo que a landing. Era o defeito central — o
  painel do síndico não era inspirado no admin, era o admin.
- **O cabeçalho é o mesmo da landing**, desde 14/08 literalmente: tokens com os
  mesmos nomes e valores (`--barra-h`, `--area-max`, `--gut`, `--saida`),
  mesma quebra de 760px, `sticky` também no celular. O nome do prédio **não
  fica na barra** — é o `.placa-topo`, cabeçalho do instrumento. Mudou a barra?
  Mude em `landing.css` e `login.css` também.
- **Não há seções nem navegação.** Sumiram sidebar, colapso, topbar, KPIs,
  abas, buscas e tabelas. A página é: **a resposta** (uma frase + os
  reservatórios como prova + uma ação) ocupando a primeira tela, **a história**
  agrupada por dia abaixo, e um rodapé. Todo o resto abre como **ficha**
  (placa clara sobre o marinho): pedir ajuda, chamado, todos os reservatórios,
  reservatório e sua conta. **Nenhuma funcionalidade saiu.**
- **O veredito tem cinco ramos** (semtel → crítico → mudo → baixo → normal), e
  o ramo normal foi partido em dois: com chamado aberto aparece a **linha de
  atendimento**, com ponto azul e o título do chamado.
- **A prova são no máximo três colunas**, tenha o prédio 3 ou 30 reservatórios.
  O resto vira frase com a faixa real, que abre a lista completa.
- **Cilindro no desktop, coluna no celular.** Sem limiar desenhado dentro do
  tanque — ele vive no gráfico da ficha do reservatório. As faixas de 45%/20%
  são as do backend: mudou lá, muda na landing e aqui.
- **Sem ApexCharts**: o gráfico da ficha é SVG no próprio `cliente.js`.
- ⚠️ A **ponte de tokens** do admin (`--muted`/`--text`/`--accent`) **não
  existe mais** — o JS foi reescrito e não usa token do admin.
- ⚠️ **Alerta resolvido não aparece na história** — `/cliente/status` só
  devolve os abertos. É buraco conhecido, não bug.
- ⚠️ **`ja_avaliado` só vem do detalhe do chamado**: o painel busca os 3
  fechados mais recentes uma vez e guarda. Uma linha no SELECT da lista
  elimina isso (roadmap).
- ⚠️ **Nada foi verificado contra o backend real**; a validação foi em harness
  estático, contact sheet de 8 estados × 2 tamanhos (1920px e 390px).

**Orçamentos do cliente** — `public/cliente-orcamentos.{html,js}`, rota de
página `/cliente/painel/orcamentos?orc=N` 🟡 **no ar, nunca visto logado**

Segunda página do painel do cliente (21/08/2026), onde o síndico aprova, recusa
ou comenta um orçamento — antes a resposta voltava por telefone/WhatsApp e quem
registrava era o escritório.

- **É PÁGINA, NÃO MODAL.** Lista e documento são dois estados da mesma página,
  trocados por `history.pushState`. A v1, em fichas abertas por um card do
  painel, foi recusada: orçamento é documento que a pessoa lê, pensa e mostra
  para outra antes de responder — pede URL própria, rolagem inteira e o voltar
  do celular. Ver [decisions.md](decisions.md).
- **Material: papel.** Chapas claras sobre o campo marinho, ao contrário do
  painel, que é instrumento. Barra e rodapé seguem marinho, senão a pessoa acha
  que saiu do sistema. Usa a mesma `cliente.css` — é o mesmo produto, não um
  lugar novo.
- ⚠️ **A página não pode morar em `/cliente/orcamentos`**: as rotas de página
  são registradas antes do `app.use("/cliente", ...)` e ela sombrearia o `GET`
  da API de mesmo nome. Página é nome de tela, API é nome de recurso.
- ⚠️ **Nada aqui pode ser `<a href>` para rota autenticada.** O `authRequired`
  lê só o header `Bearer`; não há cookie de sessão. Foi assim que o botão do
  PDF nasceu quebrado (consertado em 24/08 — ver
  [../docs/changelog.md](../docs/changelog.md)).
- ✅ **O convite no e-mail está LIGADO** desde 25/08/2026 —
  `ORCAMENTO_LINK_PAINEL` virou kill-switch (`=0` desliga). Com link, o e-mail
  **não leva o PDF anexado**: o documento está aqui, e o anexo competindo com o
  botão fazia o síndico ler e nunca responder. Sem login no painel, o e-mail
  sai com o PDF como antes.
- ✅ **Migration 074 aplicada em produção** em 24/08/2026.
**Tela de login** — `public/login.html` + `login.css` + `login.js`
- Desde 2026-08-13 segue o sistema **"Chapa"** da landing (split screen,
  marinho + `#fbb329`, chanfro de 45°), **não** o âmbar do painel: `/login` é a
  costura entre o site e o painel e não pode parecer outra empresa.
- ⚠️ `login.css` **duplica** os tokens da landing de propósito (as páginas não
  compartilham CSS). Mudou a paleta? Mude nos dois.
- ⚠️ Os passos login/OTP alternam por atributo `hidden`, nunca por
  `style.display`. Detalhes em
  [autenticacao.md](../docs/modulos/autenticacao.md).
- ⚠️ A foto do painel (`public/fotos/reservatorios.jpg`) tem a marca do
  **fabricante do tanque com telefones legíveis** no canto superior esquerdo —
  o enquadramento corta esse canto de propósito.

**Segurança & operação**
- Envs obrigatórias em produção (JWT_SECRET, CORS_ORIGINS) com `process.exit(1)`.
- RBAC com **5 roles ativas**: **admin** (master — tudo), **gerente** (operação
  do negócio, sem as partes irreversíveis), **operador** (Monitor + Chamados +
  config "conta"), **tecnico**, **cliente**. `admin_viewer` continua no CHECK do
  banco mas está **morto** — sumiu de `src/`, quem tiver essa role toma 403 no
  painel inteiro.
- **Três níveis no painel** (jul/2026): `adminOnly` (admin+gerente+operador) ·
  `gestaoOnly` (admin+gerente) · `masterAdminOnly` (só admin). Divisão em
  [autenticacao.md](../docs/modulos/autenticacao.md).
- ⚠️ A restrição do **operador** é só de UI — no backend ele passa em `adminOnly`
  e alcança orçamentos/O.S./relatórios pela API.
- **Configurações dinâmicas** editáveis pelo admin (whitelist `CHAVES` em
  `config.service.js`) — intervalos de job, modelo IA, timeouts, sem deploy.
- Email de alerta crítico (Resend).
- Cache em 3 camadas documentado (ver [`../CLAUDE.md`](../CLAUDE.md)).
- **Área segura do iOS tratada nas quatro superfícies instaláveis** (18/08/2026): admin, painel do cliente, login e app do técnico. A pegadinha
  é que `env(safe-area-inset-*)` só devolve valor com `viewport-fit=cover` no
  `<meta viewport>`. Mecanismo em [`../docs/arquitetura.md`](../docs/arquitetura.md). ⚠️ Não verificado em
  iPhone — não há aparelho iOS no ambiente.

## Banco de dados

- `database/schema.sql` tem o schema base (condominios, reservatorios, leituras,
  alertas, usuarios, login_codes, trusted_devices).
- **Toda a evolução está em `migrations/001..073`** (WhatsApp, mapa, chamados,
  técnicos, O.S., orçamentos, SLA P1-P4, planos, contratos, state machine, etc.).
- **FK de autoria → `usuarios` sempre com `ON DELETE` explícito** (073, 19/08/2026):
  sem cláusula o Postgres assume `NO ACTION` e a remoção do usuário quebra com
  `23503`. Regra e tabela de padrões em
  [`../docs/banco-de-dados.md`](../docs/banco-de-dados.md), seção "Remoção de usuário".
- Aplicar com `node scripts/migrate.js NNN_nome.sql` (lê `DATABASE_URL`).
  `migrations/migrate.js` em `scripts/`.
- Scripts utilitários: `limpar-dados-teste.sql`, `restaurar-defaults.sql`.
- **Banco de teste:** `scripts/seed-teste.js` monta o mínimo (admin, técnicos,
  condomínios, planos) e `scripts/seed-cenario-telemetria.js` dá variedade à
  telemetria do condomínio DEMO — sem ele os 4 reservatórios ficam todos
  offline com o mesmo `last_seen`. Os dois recusam rodar em produção
  (`src/db-url.js`). Ver
  [`../docs/modulos/painel-cliente.md`](../docs/modulos/painel-cliente.md).

> ⚠️ Há **duas** pastas de migrations: `migrations/` (numeradas 001-044, atuais)
> e `database/migrations/` (datadas, do schema original de 2026-03/04). As ativas
> são as numeradas.
