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
| **orçamentos** | Sistema unificado (tabela `orcamentos` + `orcamento_linhas`); `tipo` (060) ramifica o PDF avulso entre tabela de peças (padrão) e layout descritivo por cláusulas para limpeza de reservatório/dedetização/combo, mesmo timbrado. Item sem `valor_unitario` some da coluna de valor no PDF em vez de virar "R$ 0,00"; `orcamentos.valor` serve de override manual do total (062) |
| **relatorio / relatorios** | PDF de telemetria (Puppeteer) pro cliente/app; painel ao vivo (chamados em risco + workload) e exportação CSV de chamados/alertas/telemetria pro admin |
| **equipamentos** | Identidade permanente de bomba/motor/painel + etiqueta QR (migration 070). Guard próprio `equipeInterna` (inclui **técnico**, que não passa em `adminOnly`). Ficha em `/e/:codigo`, folha A4 de etiquetas via Puppeteer + `qrcode`. Fluxo em [equipamentos.md](../docs/modulos/equipamentos.md) |
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
  A assinatura do e-mail (`POST /admin/me/assinatura` → `usuarios.assinatura_blob`,
  embutida como data URI) é **redimensionada no navegador** antes do upload —
  máx. 600 px de largura / ~180 KB. As artes originais têm 7-8 MB, o que
  estourava o limite de 8 mb do `express.json` e faria o Gmail aparar a mensagem.
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
