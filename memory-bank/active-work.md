---
tags:
  - projeto
  - contexto/em-andamento
aliases:
  - Trabalho em Andamento
---
# Trabalho em Andamento

> Branch atual: `feature/app-mobile`. Última sessão registrada: **2026-07-02**.
> Roadmap completo em [`roadmap.md`](roadmap.md); decisões em [`decisions.md`](decisions.md).

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
