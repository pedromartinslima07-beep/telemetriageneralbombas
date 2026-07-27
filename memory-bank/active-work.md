---
tags:
  - projeto
  - contexto/em-andamento
aliases:
  - Trabalho em Andamento
---
# Trabalho em Andamento

> Branch atual: `feature/app-mobile`. Última sessão registrada: **2026-07-27**.
> Roadmap completo em [`roadmap.md`](roadmap.md); decisões em [`decisions.md`](decisions.md).

## Sessão 2026-07-27 — Planos: edição em massa

Pedido do usuário: na aba Planos, poder selecionar vários (ou todos) e editar
periodicidade, próxima execução e se o plano está ativo.

A seleção múltipla já existia desde 2026-07-22, mas só servia pra
ativar/desativar — o que faltava era o **edit**.

- **`PATCH /planos-manutencao/bulk`** virou edição genérica:
  `{ ids, ativo?, periodicidade_dias?, proxima_em? }`, pelo menos 1 campo.
  Reusa `_validarPayload(..., { exigirObrigatorios: false })` do PATCH
  individual e monta o `SET` dinamicamente (continua 1 query só).
  O body é **filtrado** pros 3 campos antes de validar — `condominio_id` e
  `titulo` não entram em massa de propósito (são individuais por natureza).
- **Modal em massa** (`_pmAbrirModalBulk` / `_pmSalvarBulk`, `admin.js`) reusa
  o `#pmModal` do criar/editar: todo campo com "— manter atual —" e só o que
  muda vai no PATCH. Cabeçalho do modal resume a seleção (nº de planos,
  condomínios, periodicidade atual ou "N periodicidades diferentes").
- `_pmBulkPatch(campos)` centralizou o fetch; "Ativar/Desativar selecionados"
  agora chamam esse helper (atalho mantido, não foi removido).
- `admin.css?v=142`, `admin.js?v=236`. Sem endpoint GET novo → `sw.js` intocado.

## Sessão 2026-07-23 — Telemetria: redesign da aba (só frontend)

Pedido do usuário: trocar o bar chart genérico do card "Níveis dos
Reservatórios" por uma visualização de **caixas d'água cilíndricas em SVG**,
mais melhorias secundárias na página. Aprovado remover o bar chart de vez e
usar container query pro modo compacto.

Descoberta: reservatórios **não têm limiar de nível configurável** no banco
(só `limiar_bomba`, corrente da bomba). As faixas de alerta são fixas no
backend (`nivelFromPct`: crítico `<20`, baixo `<45`). Aliei as cores da água a
esses valores e passei como parâmetro (`TEL_LIMIARES`) pro componente já ficar
pronto se um dia existir limiar por reservatório — sem inventar config no
backend agora.

- **`_telTanqueSVG(pct, offline, thresholds)`** (`admin.js`): SVG cilíndrico
  reutilizável — clipPath do corpo, água (rect + elipse de superfície), `%`
  em mono, ticks 25/50/75/100. `_telBandaAgua` decide a cor. `renderTelTanques`
  substituiu `renderTelBarChart` (removida, junto da var `_telBarChart`).
  Grid `minmax(160px,1fr)`; compacto via `@container (max-width:176px)` no tile
  (`.tel-tank { container-type: inline-size }`) — some elipse/rótulos.
- **Clique no tanque → Histórico** (`_telSelecionarNoHistorico`): seta os dois
  selects, popula reservatórios, chama `carregarHistoricoTelemetria`, marca
  `.is-selected` e rola até o card. Handler `tel-tanque` no delegation do body.
- **KPIs padronizados** via `.tel-kpi-grid .rc` (fundo/borda neutros, `::before`
  glow off, valor em mono) — sem tocar os `.rc` do Mapa/Dashboard. Ícone segue
  semântico. "Bombas ativas" agora mostra `bombasAtivas` (0, nunca traço) +
  hint "de N monitoradas".
- **Críticos vazio:** `.tel-criticos-empty` (ícone check + texto), classe
  `is-empty` no card reduz `min-height` no layout empilhado.
- **`.tel-select`** ganhou chevron SVG custom (`appearance:none`), igual à aba
  Relatórios.
- `admin.css?v=134`, `admin.js?v=224`. Sem `sw.js` (nenhum endpoint novo).

**Fusão dos cards + "Ver todos" (mesma sessão, depois do 1º corte):**
- Tabela "Reservatórios" removida (redundante com os tanques). Ações de admin
  viraram ícones por tanque (`.tel-tank-actions`, master); "+ Novo" foi pro
  header dos tanques; `renderTelBombas` deletada (+ helpers órfãos `_telCorPct`
  / `_telLvClassDeNivel`). Clique isolado em `.tel-tank-hit`.
- "Ver todos": overlay fullscreen (`_telAbrirVerTodos`/`_telFecharVerTodos`),
  fecha no X/backdrop/Esc/seleção. Tiles do overlay sem ações (`comAcoes=false`)
  pra evitar z-index com modais.
- **Pegadinha:** `.tel-bombas-*`/`.tel-bomba-*` NÃO são código morto — o painel
  do cliente (`cliente.html`/`cliente.js`) carrega `admin.css` e usa. Removi por
  engano e restaurei; deixei comentário no CSS avisando. `cliente.js` tem o
  próprio `_telCliCorPct`, então independe do admin.

**KPIs unificados (mesma sessão):** os `.rc` de todas as abas ganharam estilo
único — card neutro, número em mono, cor semântica só no ícone. Feito no CSS
base (`.rc-value` + variantes `.rc-*` reduzidas a só `.rc-X .rc-icon`), sem
editar as ~9 funções de render (todas já emitiam `.rc-head/.rc-icon/.rc-value`).
`renderTelKpis` passou a usar `rc-static`. As ~8 cópias do helper `kpi()`
continuam duplicadas no JS (dedup fica pra depois; o alinhamento visual já veio
todo do CSS).

**Dashboard + Telemetria — ajustes de layout (mesma sessão):**
- Dashboard: card "IA Insights" removido (HTML + `renderMcIaInsights` + CSS
  `.mc-ia*`/`.mc-brain*`); `.mc-bottom` de 3 → 2 colunas. Estava ligado, mas o
  conteúdo era filler derivado — o usuário pediu pra tirar.
- Telemetria: Histórico ↔ Críticos trocados de lugar. Histórico agora em
  `tel-row-main` (ao lado dos tanques — clique no tanque atualiza ali); Críticos
  em `tel-row-bottom` largura total, com `.tel-criticos-list` virando grade
  `auto-fill minmax(300px,1fr)`.
- Histórico melhorado: `annotations.yaxis` com os limiares (`TEL_LIMIARES`),
  chips `.tel-hist-stats` (atual/mín/méd/máx, só com 1 reservatório),
  empty state com ícone (`_telHistMostrarVazio`/`_telHistEsconderVazio`).
- Distribuição do container do histórico: PDF subiu pro `cardHead` (topo-dir);
  botões de período viraram segmented full-width com `flex:1` (linha própria);
  os 2 selects dividem o espaço igual (`flex:1`); chips de stats centralizados
  (`justify-content:center`). Só HTML/CSS, sem tocar JS.
- **Altura reduzida** (histórico + tanques estavam altos): como os dois estão
  na mesma `tel-row` (grid stretch), o mais alto puxava o outro. Ajustes:
  `.tel-tanques-grid` max-height 420→340, `.tel-row > .card` min-height
  360→300, paddings dos controles apertados. "Ver todos" cobre muitos tanques.
- **Espaço vazio embaixo dos tanques (screenshot 12:44):** causa real = o
  ApexCharts do histórico estava com `height:"100%"`, que não resolve dentro do
  flex e caía num padrão ~400px → card do histórico ~600px, e o card dos tanques
  (grid stretch) esticava junto.

**Reestruturação final (decisão do usuário):** o Histórico virou **modal** em
vez de card fixo na página — resolve o problema de altura de vez.
- Layout: `tel-row-main` agora = Tanques + **Reservatórios Críticos** lado a
  lado (voltou pro layout tipo original); `tel-row-bottom` removida.
- Histórico: `<div class="tel-hist-modal" id="telHistModal">` com o card dentro
  (range + selects + stats + legenda + gráfico + PDF + botão X). Abre ao clicar
  num tanque (`_telAbrirHistorico`/`_telFecharHistorico`; fecha no X/backdrop/
  Esc). Título do modal mostra o nome do reservatório clicado.
  `chart.height` fixo em **300px**. Não carrega no load da seção (só ao abrir).
- Mantidos os selects e toda a lógica de `popularFiltrosHistorico` (agora dentro
  do modal); `align-items:start` revertido (histórico saiu da linha).

**Redesign do layout (mockup 13:18):**
- Distribuição nova: linha principal = card "Reservatórios monitorados" (esq,
  1.7fr) + coluna direita (1fr) com **Reservatórios Críticos** (cima) +
  **Últimos Eventos** (baixo). KPIs intocados (só distribuição, como pedido).
- Reservatório virou **card horizontal detalhado** (`.tel-resv-card`): tanque +
  ações à esquerda; nome/condomínio/badge Online/`%` grande/barra/label de nível
  no meio; metadados (última leitura/bomba/device com ícones) à direita.
  `_telTanqueTile` reescrito; a grade virou pilha vertical (`.tel-tanques-grid`
  flex column). Overlay "Ver todos" ajustado pra colunas de 440px.
- **Tanque SVG melhorado** (`_telTanqueSVG`): gradiente de volume no corpo,
  água com gradiente + brilho na superfície, sombra no chão, realce vertical,
  escala 0–100. Não é foto 3D (precisaria de PNG) mas bem mais volumétrico.
- **Últimos Eventos** (`renderTelUltimosEventos`): feed derivado (leituras +
  alertas + offline), horário curto + ícone; "Ver todos os eventos" → alertas.
  Não é log granular de eventos (não há endpoint) — deriva do estado atual.
- Imagem do tanque: **abandonada** a pedido do usuário (o acabamento de render
  3D com água azul volumétrica não dá pra reproduzir por código com nível
  dinâmico). Removidos `_telTanqueImg`, CSS `.tel-tankimg*` e o PNG.
- **Tanque:** o usuário propôs um SVG (água por `scaleY`), integramos, mas ele
  **não gostou** → revertido pro **cilindro volumétrico** (`_telTanqueSVG` com
  `.tank-*`, água por rect+clip, gradiente de corpo/água, escala 0–100).
  Removidos `_TEL_AGUA_CORES` e o CSS `.tel-tanque*`.
- **Fix do "100" cortado:** o rótulo da escala 100 vazava na borda esquerda.
  viewBox agora `-8 0 108 126` (folga à esquerda) com ticks/labels em x=10-15/7.5.
- **Tamanho dos containers:** `.tel-row-main` com `align-items: start` (card de
  níveis na altura de conteúdo, não estica pra igualar a coluna direita).
  Ajuste fino pendente de feedback visual do usuário.

**Ajustes pós-feedback "tela vazia":**
- Ações do tanque agora: Editar / **Ver histórico** / Excluir. O "Nova chave"
  saiu do tanque e virou botão no rodapé do modal de editar reservatório
  (`btnRegenKeyRes` → `regenerarDeviceKeyReservatorio(editResId)`). O ícone do
  meio (`TEL_ACT_ICONS.historico`) dispara `tel-tanque` (abre o modal).
- Tela menos vazia: grade de tanques `auto-fit minmax(170,210)` +
  `justify-content:center` (centraliza quando há poucos), max-height 340→380.
- Modal do histórico melhorado: mais largo (780→900px), gráfico 300→340px,
  título com nome do reservatório · condomínio.
- Handler de delegação `regen-res-key` (10189) ficou órfão mas inofensivo —
  agora a chave é regerada pelo botão do modal (chamada direta).

**Dedup dos helpers de KPI (feito):** criado `kpiCard(icon, value, label,
kindCls, attrs, button)` — fonte única do markup. As ~8 cópias locais de
`kpi()` (Dashboard/Alertas/Clientes/Chamados/Contratos/OS/Avulsos/Orçamentos/
Planos) viraram aliases finos que delegam pra ele; `resumoCard` também delega
(button clicável). `renderTelKpis` mantém template próprio (tem linha de hint).
Zero mudança visual — só remove a duplicação de markup.

**Pendentes desta linha de trabalho:**
- **Validação visual:** `node -c` OK e revisão lógica, mas sem screenshot
  (usuário não quer servidor em background — [[feedback_inline_questions]]).
  Preview estático atualizado em scratchpad pra ele abrir. Falta conferir a
  geometria do SVG e o overlay renderizados.

## Sessão 2026-07-23 — Relatórios: redesign da aba (só frontend)

Pedido do usuário: a aba Relatórios tinha 3 cards de exportação idênticos
(Chamados/Alertas/Telemetria) ocupando muito espaço, controles nativos que
quebravam o tema escuro, 3 botões amarelos sem hierarquia e um Painel ao Vivo
enorme só pra mostrar 2 empty states. (Redesign começado com o modelo Fable,
que ficou sem tokens no meio; terminado aqui.)

Decisão de estética: manter HTML/CSS/JS vanilla + **fontes do sistema**
(Segoe UI / Cascadia) em vez de baixar Inter/IBM Plex — o pedido citava essas
fontes, mas o sistema inteiro já usa o stack nativo e o resultado visual é
equivalente sem download. Ver [`decisions.md`](decisions.md) se virar recorrente.

- **Card único "Exportar relatórios"**: segmented control (`.rel-seg`) troca
  só os filtros específicos; De/Até/Condomínio comuns e fixos (ids únicos
  `relExpIni`/`relExpFim`/`relExpCondo`). Um botão CSV primário. `_REL_EXPORT`
  agora separa `_REL_IDS_COMUNS` dos ids por tab; `_relExportarCsv()` usa a
  tab ativa (`_relTabAtiva`). **Endpoints e colunas intocados.**
- **Chips de preset** de período (`_relAplicarPreset`); editar data desmarca.
- **Controles custom** (`.rel-sel` chevron SVG, `.rel-date` calendário SVG +
  mono) escopados sob `.filter-bar` pra vencer a especificidade de
  `.filter-bar .input` (que zerava o background-image via shorthand).
- **Painel ao vivo colapsável** (`.is-collapsed` + linha `.rel-vivo-status`
  com dot verde/vermelho); auto-colapsa quando tudo operacional, respeitando
  expansão manual. Empty states via `_relEmptyCell` (ícone + texto).
- Validado visualmente com preview estático + screenshot (selects, chips,
  datas, colapso e empty state renderizando certo no tema dark).
- `admin.css?v=133`, `admin.js?v=223`. Sem `sw.js` (nenhum endpoint novo).

## Sessão 2026-07-23 — Chamado automático no alerta de nível baixo

Pedido do usuário (retomado após queda de conexão na sessão anterior):
`POST /telemetria` abrir chamado automaticamente junto do alerta de
reservatório com nível baixo/muito baixo, sem duplicar. A extração de
`_abrirChamadoAuto` (antes local em `offline.job.js`) para o módulo genérico
`src/services/chamados.service.js` — com dedup por `condominio_id +
categoria` e escalonamento de prioridade — já tinha sido feita antes da
queda; faltava só ligar isso na rota de telemetria.

- `src/routes/telemetria.routes.js`: `_notificarSeNovo` (chamada só quando o
  alerta é novo — `action === 'inserted'`, evita spam a cada leitura) agora
  também chama `abrirChamadoAuto` além do e-mail. Categoria `nivel_baixo`
  (único valor do enum pra nível, não existe `nivel_muito_baixo` separado);
  prioridade `p3` pra "baixo" e `p2` pra "muito_baixo" — se o chamado de P3
  ainda estiver aberto quando o nível cai pra muito_baixo, é escalonado pra
  P2 em vez de abrir um segundo chamado (mecanismo já existente em
  `abrirChamadoAuto`).
- Nenhuma migration nova — categoria `nivel_baixo` já existia no CHECK
  constraint desde a migration 002.

Ver [`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md).

## Sessão 2026-07-22 — Planos de manutenção: seleção em massa

Pedido do usuário: reativar planos inativos só dava pra fazer um por um
(modal de edição individual). Adicionado checkbox por linha + "selecionar
todos" + barra de ações em massa (Ativar/Desativar selecionados) na tabela
de Planos. Backend ganhou `PATCH /planos-manutencao/bulk` (`{ ids, ativo }`,
uma única query `UPDATE ... WHERE id = ANY($1)`). Seleção limpa ao trocar de
aba. `admin.css?v=131`, `admin.js?v=221`, `register-sw.js?v=29`,
`CACHE_NAME` → `telemetria-v38`.

## Sessão 2026-07-22 — Relatórios: painel ao vivo + exportação CSV

Redesenho pedido pelo usuário: achava a aba Relatórios (3 abas, KPI cards,
~10 gráficos ApexCharts) confusa e queria só exportar CSV pra analisar no
Excel, mantendo um painel ao vivo enxuto pro que é estado operacional "agora"
(não faz sentido virar CSV histórico).

- **Painel ao vivo:** chamados em risco de estourar SLA (≥50% do TTR usado) +
  workload por técnico, sem filtro de período — nova rota `GET
  /relatorios/painel-vivo` (extraída do antigo `/sla-dashboard`).
- **Exportar CSV:** 3 cards (Chamados / Alertas / Telemetria), cada um só com
  filtros + botão, sem gráfico/preview na tela. `GET /relatorios/chamados`
  ganhou `primeira_resposta_em`/`tempo_resolucao_seg` crus pra permitir
  montar métricas de SLA (TTFR/TTR) via tabela dinâmica no Excel — decisão
  de não duplicar essa agregação no backend.
- **Removido:** rota + botão "Exportar PDF" de chamados (`/pdf-chamados`,
  `src/services/relatorio-pdf.service.js` — apagado, único consumidor);
  rotas órfãs `/insights` e `/sla-metricas` (já sem HTML conectado antes
  desta sessão) e `/sla-dashboard`. Link "Ver análise completa" do card IA
  Insights do Mission Control (`data-rel-tab-go="insights"`) corrigido —
  apontava pra uma aba que não existia mais.
- Cache bump: `admin.css?v=130`, `admin.js?v=220`, `register-sw.js?v=28`,
  `sw.js` `CACHE_NAME` → `telemetria-v37`.

Ver [`../docs/changelog.md`](../docs/changelog.md),
[`../docs/api.md`](../docs/api.md) e
[`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md).

## Sessão 2026-07-03 — Remove nome fixo do representante General Bombas

Migration 064: `contratos.signatario_geral_nome` tinha `DEFAULT 'Ana Paula
Martins Lima'` (054) — todo contrato novo já nascia com esse nome de pessoa
pré-preenchido no modal, sem ninguém ter escolhido isso. Removido o default
e limpos os valores existentes que ainda carregavam o default sem confirmação
de assinatura (nenhum contrato tinha sido assinado sob esse nome ainda,
conferido antes de rodar). Campo `signatario_geral_email` mantém o default
(`comercial@generalbombas.com`) — é e-mail real da empresa, não nome de
pessoa.

## Sessão 2026-07-03 — Assinatura de contratos: código de verificação + protocolo

Reforça o fluxo próprio de assinatura por e-mail (migration 056) depois de
mapear 3 pontos fracos: (1) só o link bastava pra assinar, sem 2FA; (2) o PDF
final não trazia nenhuma evidência (IP/hora/hash), só o banco tinha; (3) sem
carimbo do tempo de terceiro. Migration 063 aplicada em produção. Decisão de
não usar ZapSign/D4Sign (pagos) nem a API de assinatura do gov.br (hoje só
pra órgão público) documentada em [`decisions.md`](decisions.md#segurança-e-rbac).

- `src/routes/assinatura.routes.js`: `GET /assinar/:token` agora sempre exige
  código de 6 dígitos (enviado ao e-mail cadastrado, não a quem tiver o link)
  antes de mostrar o formulário. Novo `POST /:token/verificar-codigo` (máx. 5
  tentativas) emite um `verify_token` (JWT 15 min) exigido pelo `POST /:token`
  final; `POST /:token/reenviar-codigo` com cooldown de 60s. Rate limit por
  IP nas duas rotas novas.
- `src/services/email.js`: `sendAssinaturaCodigo`.
- `src/services/contrato-pdf.service.js`: bloco de assinatura passa a
  imprimir data/hora completa + IP + protocolo (hash SHA-256) de cada parte,
  com nota da base legal (MP 2.200-2/2001 art. 10 §2º).
- Item pendente (avaliado, não implementado): carimbo do tempo de terceiro
  independente do servidor. Toda autoridade certificadora acreditada
  ICP-Brasil é paga; alternativa gratuita seria algo como OpenTimestamps
  (âncora em blockchain) — não implementado por enquanto, considerado
  desproporcional pro caso de uso atual.

Ver [`../docs/changelog.md`](../docs/changelog.md), [`../docs/api.md`](../docs/api.md)
e [`../docs/banco-de-dados.md`](../docs/banco-de-dados.md).

## Sessão 2026-07-02 — Orçamento de peças: valor unitário opcional + total manual

Migration 062 aplicada em produção: `orcamento_linhas.valor_unitario` deixou
de ser `NOT NULL DEFAULT 0` (item sem preço lançado vira `NULL` de verdade,
não `0`). PDF de peças (e de serviço) omite a coluna de valor pra item sem
preço em vez de mostrar "R$ 0,00". `orcamentos.valor` (coluna que já
existia) virou também o campo **"Valor total (manual)"** no modal de
orçamento avulso — sobrepõe a soma dos itens no PDF e nas listagens quando
preenchido; vazio, mantém a soma automática de sempre. Ver
[`../docs/changelog.md`](../docs/changelog.md) e
[`../docs/modulos/ordens-servico.md`](../docs/modulos/ordens-servico.md).

## Sessão 2026-07-01 — Orçamento avulso: tipo de serviço

Migration 060 (`orcamentos.tipo`) concluída e aplicada em produção. Orçamento
avulso agora suporta peças/serviço (padrão), limpeza de reservatório de água
potável, dedetização, ou os dois combinados — mesma tabela e timbrado do
orçamento de peças, mas o PDF ramifica pra um layout descritivo por cláusulas
(Objeto/Escopo/Garantia, fixas por tipo) com valores separados por serviço no
final, em vez da tabela de itens. Ver [`../docs/changelog.md`](../docs/changelog.md) e
[`../docs/modulos/ordens-servico.md`](../docs/modulos/ordens-servico.md).

## Foco atual — Pendentes pós-sessão 2026-06-15 (ZapSign + deploy)

---

## Foco anterior — Contratos ZapSign + preparação para deploy

O grosso das funcionalidades está concluído. Novo módulo de assinatura digital
de contratos via ZapSign foi implementado nesta sessão — falta rodar a migration
e configurar o token no Railway.

### Pendente pós-sessão 2026-06-15
- Rodar `node scripts/migrate.js 054_contratos_zapsign.sql` em produção.
- Criar conta ZapSign e adicionar `ZAPSIGN_API_TOKEN` no Railway.
- Configurar webhook ZapSign: `POST /contratos/webhook/zapsign` (sem auth).
- Reverter `OTP_DISABLED` para produção (ver `memory/project_otp_disabled.md`).

- **Banco de produção (Railway) limpo** de dados de teste — sobrevivem apenas
  logins e configurações. Scripts: `migrations/limpar-dados-teste.sql` (DELETE
  explícito, sem TRUNCATE CASCADE) + `migrations/restaurar-defaults.sql`.
- Branch `feature/app-mobile` precisa ser **mergeada/deployada na main** para o
  Railway.

## Funcionalidades em desenvolvimento / pendentes

### Gateway WhatsApp — Meta Business API · CÓDIGO PRONTO, PENDENTE CONFIGURAÇÃO
Código migrado de Evolution API → **Meta WhatsApp Business API** (número
verificado, zero risco de ban). Falta só a configuração externa:
1. Criar app no developers.facebook.com (tipo Business) + produto WhatsApp.
2. Cadastrar número e obter `WHATSAPP_PHONE_NUMBER_ID`.
3. Gerar token permanente `WHATSAPP_ACCESS_TOKEN` (Usuário do Sistema).
4. Configurar webhook na Meta: `https://SEU_DOMINIO/whatsapp/webhook`,
   verify token `general-bombas-verify-2026`.
5. Testar fluxo completo com número real.

Envs necessárias: `OPENAI_API_KEY`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

### Fase 10 — Treinar IA com histórico · 🟡 EM ANDAMENTO
- **10A — Curadoria** ✅ concluída (Migration 038): qualidade do atendimento +
  export NDJSON com PII scrubbing.
- **Bloqueio de volume:** few-shot/fine-tuning só fazem sentido com ~500+
  conversas curadas. Hoje há ~1 conversa (WhatsApp real ainda não conectado).
  A infra está pronta; o dataset cresce com o uso.
- **10B (few-shot por categoria)**, 10C (A/B), 10D (fine-tuning), 10E
  (guardrails) — aguardando massa crítica de conversas.

### Itens adiados conscientemente
- **GPS background no APK** ✅ `@capacitor-community/background-geolocation@1.2.26` instalado; `_gpsAbrirWatch()` usa o plugin nativo no APK e `watchPosition` como fallback web. Detalhes em [docs/modulos/app-mobile.md](../docs/modulos/app-mobile.md).
- **7G — Push notifications nativas** ⏸️ depende da 7J (publicação nas lojas).
- **7J — Publicação Play Store** — pendente.
- **WebSocket no WhatsApp** — adiado; polling de 5s suficiente para o volume.

## Próximos passos (da última sessão, 2026-05-28)

1. Cadastrar demais usuários (técnicos, admin_viewer) via Configurações →
   Usuários.
2. Cadastrar condomínios e reservatórios reais.
3. Configurar Meta for Developers (credenciais WhatsApp).
4. Subir branch `feature/app-mobile` para Railway.
5. Testar fluxo completo com número WhatsApp real.
6. 10B — few-shot por categoria (aguardar volume de conversas curadas).
7. 7J — publicação Play Store.

## Melhorias recentes (sessão 2026-06-17 — Seção Contratos no admin)

- **Nova seção "Contratos"** na sidebar (entre Orçamentos e Planos): tabela com filtros (status + tipo + busca), 4 KPIs (Ativos / Vencendo / Vencidos / MRR), badge de alertas na nav. `admin.js?v=183`.
- **"+ Novo contrato"** via mini-modal picker de cliente (av-modal). Clique na linha abre modal de edição existente.
- Seção recarrega automaticamente ao salvar/encerrar contrato.

## Melhorias recentes (sessão 2026-06-17 — PDF orçamento: paginação por medição real)

- **Puppeteer two-pass em `orcamento-pdf.service.js`:** passagem 1 mede 5 valores reais via DOM (altura do cabeçalho, overhead seção itens pág 1 e pág 2+, altura de linha com/sem ficha); passagem 2 usa esses valores em `renderHTML(dados, areaP1, medidas)` — zero constantes chutadas.
- **Correção raiz do espaço branco:** `padding-bottom` estava em 49mm/45mm mas o endereço do timbrado fica a ~22mm do fundo. Reduzido para 25mm → `pagina-body` 244mm (pág 1) e 224mm (pág 2+). `AREA_P2 = 224mm`.

## Melhorias recentes (sessão 2026-06-15 — contratos ZapSign + sidebar)

- **Módulo de contratos + assinatura digital (ZapSign):** migration 054, `contrato-pdf.service.js` (PDF com papel timbrado, 11 cláusulas), `zapsign.service.js` (API), 4 novos endpoints em `contratos.routes.js`, modal admin expandido com signatários/descrição/painel de assinatura. `admin.js?v=179`.
- **Sidebar animation:** choreografia redesenhada; `is-animating` desabilita backdrop-filter no CSS durante a transição. `admin.css?v=117`.
- **Texto "30 dias" trusted devices corrigido** em `login.html` e `admin.html`.
- **Email OTP separado:** `SMTP_FROM_OTP` env var para remetente do OTP.

## Melhorias recentes (sessão 2026-06-15 — correções de crash APK)

- **Crash no primeiro login corrigido:** `NativeGpsService.configure()` chamava `startForeground()` na binder thread sem try-catch. Exceções Java escapavam para o processo e matavam o app silenciosamente. Envolvido em try-catch.
- **Permissões Android faltando adicionadas:** `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_LOCATION` ausentes do `AndroidManifest.xml` causavam `SecurityException` no `startForeground()`. Ambas adicionadas.
- **`NativeGpsPlugin.start()` protegido:** try-catch para converter exceções em `call.reject()` em vez de crash.
- **`requestBatteryExemption` com try-catch:** previne crash em ROMs sem suporte a `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
- **Chip GPS "Fora do expediente" durante inicialização corrigido:** `gpsRenderChip()` agora distingue "fora do horário" de "dentro do horário aguardando GPS".
- **Chip GPS demora atualizar corrigido:** `gpsRenderChip()` adicionado após `GPS.active = true` nos três caminhos de `_gpsAbrirWatch()`.
- **Auto-login com retry:** tenta `/auth/me` até 2 vezes com 2s de espera entre tentativas.

## Melhorias recentes (sessão 2026-06-10 — UX admin e app mobile)

- **Modal de O.S. (admin) redesenhado:** layout flat com `os-vsec-title` (border-bottom, uppercase) em vez de cards com borda. 2 colunas para Identificação+Check-in e Itens+Correntes. `admin.css?v=113`, `admin.js?v=174`.
- **Novo chamado — seletor P1-P4:** wizard Q1-Q3 removido; 4 cards diretos com cor e prazo. `admin.js?v=173`.
- **Atribuir técnico no mapa:** filtrado por `cargo=tecnico`; feedback visual; estado "Técnico: Nome [Alterar]". `admin.js?v=176`.
- **Hard delete de condomínio corrigido:** bug na coluna `alerta_comentarios.chamado_id` (não existe; correto é `alerta_origem + alerta_id`).
- **App mobile — 4 melhorias:** card de mensagens oculto quando vazio; botão "Chegou ao local" removido (iniciar atendimento registra chegada); GPS oculto na tela de assinatura fullscreen.
- **App mobile — crash GPS Android 14 corrigido:** `_gpsAbrirWatch()` verifica permissão via `navigator.permissions.query` antes de chamar `NativeGps.start()` — evita `SecurityException` nativa que derrubava o app.
- **App mobile — foto na O.S. (chooser + loading + erro):** bottom sheet com opções Câmera/Galeria; estado "Enviando…" durante upload; compressão 1200px/72%; erros agora exibem mensagem legível.

## Melhorias recentes (sessão 2026-06-08 — GPS staleness + ajustes admin)

- **Pin de técnico "stale":** `_tecStale()` retorna `true` quando `capturada_em` tem mais de 3 min. Pin cinza/opaco + sem pulse. Tooltip/popup indicam quando foi o último sinal. Aplicado tanto no MC map quanto na seção Mapa.
- **"Top 5 condomínios" removido** (redundante com "Condomínios mais problemáticos").
- **Hard delete de condomínio:** cascata completa — chamados, OS, orçamentos, leituras, alertas, WhatsApp. Usuários recebem `SET NULL` (não deletados).
- `admin.js?v=147`, `admin.css?v=103`.

## Melhorias recentes (sessão 2026-06-08 — APK de teste)

- **Projeto Android gerado** (`app/android/`) — `@capacitor/android@6.1.0`, permissões GPS no manifesto, ícone via `@capacitor/assets` (favicon.png).
- **`API_BASE` corrigido:** `androidScheme: "https"` fazia o protocolo ser `"https:"` em vez de `"capacitor:"`, desviando todas as chamadas para `https://localhost`. Fix: `|| origin === "https://localhost"` no detector em `app/public/app.js`.
- **Chip GPS reposicionado:** `top: 10px` sobrepunha o header do técnico → `top: calc(env(safe-area-inset-top, 0px) + 72px)`.
- **Footer "GPS aguardando..." corrigido:** `watchPosition` não atualizava `TC.geo`; agora sincroniza a cada fix válido.
- **`OTP_DISABLED` sem guarda de prod** — temporário para testes, reverter após.
- **Railway** configurado para branch `feature/app-mobile`; `CORS_ORIGINS` inclui `https://localhost`.

## Melhorias recentes (sessão 2026-06-05 — tarde)

- **GPS técnicos — correções e UX de sinal fraco.**
  - Conflito de rotas corrigido: `tecnicosLocalizacaoRouter` antes de `tecnicosRouter` em `app.js`.
  - `GPS.lastError = "low_accuracy"` quando `acc > 15 km`; chip "Sinal fraco" + banner orientando o técnico.
  - `maximumAge` revertido para 30 000 ms.
  - Ícone de pin de técnico unificado entre MC map e mapa normal (`_tecPinIcon()`).
  - Botões de ações em Configurações → Usuários viram ícones 28×28 px.
  - `<meta name="mobile-web-app-capable">` adicionado ao app mobile.
  - `admin.js?v=144`, `admin.css?v=102`.

## Melhorias recentes (sessão 2026-06-05)

- **Ajustes de layout — ch-layout (Alertas, Chamados, Clientes, Colaboradores).**
  - `.content` virou flex container; `.section.is-active` ganhou `flex: 1`.
  - Lista da esquerda (`.ch-list-col`) vai até o fundo da página via `align-self: stretch`.
  - Painel de detalhes (`.ch-detail-col`) tem altura do conteúdo — pequeno quando vazio.
  - `admin.css?v=101`.

- **Seção "Técnicos" virou "Colaboradores".** Migration 048 adicionou `cargo` (tecnico | adm | gestor | ti) à tabela `tecnicos`. Tabs de filtro por cargo, modal com select de cargo, detalhe e KPIs adaptados. Chamados/disponibilidade só aparecem para cargo=tecnico.

- **RBAC: 3 tipos de login no painel admin.**
  - Novos roles: `gerente` (acesso total + config restrita a "conta") e `operador` (só Monitor + Chamados + config "conta").
  - `admin_viewer` removido do fluxo de cadastro; roles TEXT livres na tabela `usuarios`.
  - Card de criação de acesso atualizado para selecionar o role.

## Melhorias recentes (sessão 2026-06-03 — tarde)

- **Migrations 045 e 046 aplicadas.**
  - 045: `condominios.email VARCHAR(255)` — campo de e-mail para envio de orçamentos.
  - 046: remove `idx_contratos_ativo_uniq` — agora um condomínio pode ter múltiplos
    contratos ativos simultaneamente.
- **admin.css:** estilos para lista de contratos (`.ctr-list`, `.ctr-row`, etc.),
  spinner de loading do mapa (`.mp-map-loading`), ajuste de cor do `thead` e
  proporção da coluna `.cc-info` na lista de clientes.

- **Remoção da aba "Contatos" do modal de cliente.**
  - Aba era exclusiva para pré-cadastro de contatos WhatsApp; sem WhatsApp ativo
    só gerava confusão. Removidos: tab/pane no HTML, modal wcOverlay, ~150 linhas
    de JS e 4 rotas backend. Tabela `clientes_whatsapp` preservada no banco.

## Melhorias recentes (sessão 2026-06-03)

- **PDF de orçamento: dois bugs corrigidos.**
  - `buscarDadosAvulso` usava só `c.nome`; agora usa `COALESCE(nome_fantasia, nome)` —
    regressão pós-migration 044 que fazia o PDF mostrar a razão social como nome principal.
  - Puppeteer v22+ (novo headless) precisa de `--disable-gpu` + `--no-zygote` em
    containers sem GPU; sem elas o Chrome crashava no Railway. Corrigido em
    `orcamento-pdf.service.js` e `os-pdf.service.js`.

- **Mapa: troca de tiles CartoDB → OpenStreetMap.**
  - CartoDB causava mapa em branco no F5 (rate-limit silencioso em prod → browser
    cacheava respostas de erro) e tiles faltando em blocos no Ctrl+Shift+R.
  - `_criarTileLayer` agora usa `tile.openstreetmap.org`; tema dark preservado
    por `className: "map-tiles-dark"` + CSS `filter: invert/hue-rotate` só no
    pane de tiles. Marcadores não são afetados.
  - `admin.css?v=81`, `admin.js?v=97`.

## Melhorias recentes (sessão 2026-06-02)

- **Cadastro de clientes — Nome Fantasia + CNPJ persistido.**
  - Migration 044: `condominios.nome_fantasia TEXT` (nome principal de exibição).
  - `nome` passa a ser tratado como razão social (obrigatório); `nome_fantasia`
    é opcional e tem prioridade na UI (tabela, detalhe lateral, modal).
  - CNPJ agora é **gravado no banco** (antes era só lookup): incluído nos
    endpoints POST/GET/PATCH e no payload dos dois modais (novo e editar).
  - Modal "Novo cliente" redesenhado em **dois painéis horizontais** (campos
    em grid 2 col + mini-mapa ao lado); largura 1 100 px.
  - Painel lateral: CNPJ formatado, razão social como subtítulo quando há
    nome fantasia; busca por texto inclui `nome_fantasia`.

## Melhorias recentes (sessão 2026-06-01)

- **App mobile — camada visual HUD "Painel de comando"** (`app/public/app.css`,
  só mobile, não toca admin/site). Bloco aditivo no fim do CSS + tokens
  `--hud-*` no `:root`: grid técnico + scanline de fundo (estáticos), números/IDs
  em monospace, headers uppercase tracked com tique âmbar + glow no head-icon,
  hairline âmbar nos headers, indicador de aba ativa no bottom-nav, linha de
  dados animada no login e anel de varredura no splash. Reversível.
- **Corner-brackets âmbar descartados** após review visual (poluíam — pareciam
  "cantos de quadradinho amarelo" repetidos em todo card). Ver
  [`decisions.md`](decisions.md).
- **Pegadinha corrigida:** redefinir `position: relative` em `.cli-nav` /
  `.app-header*` quebra o `position: sticky` original (mesma especificidade,
  regra do HUD vinha depois) → menu/header "desciam" com o scroll. Pseudos de
  HUD funcionam direto sobre o `sticky`, sem precisar de `relative`.
- **Legibilidade dos KPIs:** labels dos `.rc` ficam na fonte normal; só os
  valores numéricos em monospace.

## Melhorias recentes (sessão 2026-05-28)

- Role `master_admin` **removido** (nunca foi atribuído; hierarquia real é
  admin / admin_viewer / tecnico / cliente).
- App cliente: botão Suporte no nav da Conta + KPIs clicáveis de chamados.
- Chamados: "Em atendimento" só via app do técnico com GPS (`/iniciar-atendimento`);
  `PATCH /chamados/:id` bloqueado para esse status.
- IA: function `buscar_status_tecnico` (ETA via GPS+Haversine), escalada por
  frustração/compromisso comercial, anti-duplicata de chamado.
- Admin: lógica de badges de notificação corrigida.
- PDF de orçamento: **Puppeteer singleton** (sem cold start de 10-20s no Railway)
  + `waitUntil: domcontentloaded`.
- Auth: `OTP_DISABLED` lido com `.trim()`; `redirectByRole` inclui
  `tecnico → /tecnico/painel`.
