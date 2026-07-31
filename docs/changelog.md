---
tags:
  - projeto
  - doc/changelog
aliases:
  - Changelog
---
# Changelog

Histórico técnico do projeto: evolução do schema (`migrations/NNN_*.sql`) e
marcos de produto por fase. O "porquê" das decisões está em
[`../memory-bank/decisions.md`](../memory-bank/decisions.md); o roadmap em
[`../memory-bank/roadmap.md`](../memory-bank/roadmap.md).

## Schema base (2026-03)

`database/schema.sql` + `database/migrations/` (datadas): telemetria pura —
`condominios`, `reservatorios`, `leituras`, `alertas`, `usuarios`. Depois:
`last_seen`, `nivel_pct`, remoção de device_key de condomínio, timestamps →
`timestamptz`, role `admin_viewer`, `login_codes` (OTP), `trusted_devices`,
calibração ADC, `bomba_rms`/`limiar_bomba`.

## Migrations numeradas (módulo WhatsApp/IA em diante)

| # | Migration | O que mudou |
|---|---|---|
| 001 | whatsapp_ia | `clientes_whatsapp`, `conversas_whatsapp`, `mensagens_whatsapp`, `chamados`; `usuarios.telefone` |
| 002 | mapa_categoria | `condominios.lat/lng`; `chamados.categoria` (enum) |
| 003 | condominio_cep | `condominios.cep` |
| 004 | alerta_comentarios | tabela `alerta_comentarios` (telemetria|chamado) |
| 005 | conversas_assumida | `conversas.assumida_por_id/assumida_em` (humano assume) |
| 006 | mensagens_lida | `mensagens.lida_em` (não-lidas) |
| 007 | conversa_em_atendimento | status `em_atendimento` |
| 008 | tecnicos | tabela `tecnicos` |
| 009 | chamados_tecnico_id | `chamados.tecnico_id` |
| 010 | configuracoes | tabela `configuracoes` (config dinâmica) |
| 015 | ordens_servico | `ordens_servico`, `os_fotos`, `os_pecas`; FK em chamados |
| 016 | tecnico_localizacoes | GPS atual + histórico; `tecnicos.usuario_id` |
| 017 | role_tecnico | role `tecnico` no CHECK de usuários |
| 018 | os_orcamento | `ordens_servico.orcamento_necessario/observacoes` |
| 019 | chamado_mensagens | `alerta_comentarios.foto_url`, texto opcional |
| 020 | chamado_avaliacao | `chamados.avaliacao_nota/comentario/em` (1-5) |
| 021 | chamados_alerta_atraso | `chamados.alerta_atraso_enviado_em` |
| 022 | chamados_sla | `chamados.primeira_resposta_em`, `tempo_resolucao_seg` |
| 023 | sla_definicoes | tabela `sla_definicoes` (ttfr/ttr) |
| 024–025 | orcamentos / orcamento_itens | sistema de orçamento A (depois unificado) |
| 026–027 | orcamentos_avulsos / os_link | sistema de orçamento B (`orcamentos`, `orcamento_linhas`) |
| 028 | sla_p1p4 | prioridade `p1-p4`; `tecnico_a_caminho_em/chegou_em`; `sla_chegada_min` |
| 029 | tecnico_perfil | perfil do técnico (foto, cpf, rg, ...) |
| 030 | unificar_orcamentos | **unifica** A+B em `orcamentos`; remove `orcamento_itens` e colunas formais de OS |
| 031 | ia_urgencia_p1p4 | `mensagens.ia_urgencia` → p1-p4 |
| 032 | planos_manutencao | tabela `planos_manutencao`; `chamados.plano_manutencao_id` |
| 033 | historico_chamados | auditoria de chamados |
| 034 | remove_fk_redundante | remove FK bidirecional chamados↔OS |
| 035 | contratos | tabela `contratos` |
| 036 | orcamento_origem | `orcamentos.origem` (admin|ia|os) |
| 037 | clientes_whatsapp_contexto | `tipo` (B2B/PF), `cadastrado_por`, `observacoes` |
| 038 | qualidade_conversas | curadoria de atendimento p/ treino da IA |
| 039 | conversa_aguardando_atendente | flag de escalonamento |
| 040 | conversa_aguardando_avaliacao | flag de avaliação pendente |
| 041 | ia_sem_avanco | contador anti-loop |
| 042 | conversa_state_machine | `estado_conversa` + `pendente_acao JSONB` |
| 043 | conversa_canal | `canal` (multi-canal futuro) |
| 044 | condominios_nome_fantasia | `condominios.nome_fantasia TEXT` (nome principal de exibição) |
| 045 | condominios_email | `condominios.email VARCHAR(255)` (e-mail para orçamentos) |
| 046 | multi_contratos | remove `idx_contratos_ativo_uniq` — permite múltiplos contratos ativos por condomínio |
| 047 | orcamento_envio_email | `orcamentos.enviado_em/enviado_para`; `condominios.email` → TEXT (múltiplos e-mails por vírgula) |
| 048 | colaboradores_cargo | `tecnicos.cargo` (tecnico/adm/gestor/ti) |
| 049 | usuarios_roles_novos | novos roles; `usuarios.condominio_id` |
| 050 | usuarios_email_template | template de e-mail por usuário |
| 051 | usuarios_assinatura_blob | assinatura digital em blob |
| 052 | trusted_devices_indefinido | trusted_devices sem expiração (permanente) |
| 053 | os_fotos_dados_base64 | `os_fotos.dados_base64 TEXT` — persiste imagem no banco para sobreviver a restarts do Railway (antes era salvo em disco efêmero) |
| 054 | contratos_zapsign | colunas de assinatura digital: `signatario_nome/email`, `signatario_geral_nome/email`, `descricao_servico`, `zapsign_token/status/url_cliente/url_geral/doc_url`, `enviado_assinatura_em`, `assinado_em` |
| 060 | orcamentos_tipo | `orcamentos.tipo` (`pecas` default \| `limpeza_reservatorio` \| `dedetizacao` \| `limpeza_dedetizacao`) — orçamento de serviço reaproveitando mesma tabela/PDF/timbrado |
| 061 | orcamento_data_documento | `orcamentos.data_documento DATE` (nullable) — data exibida no PDF, editável no admin sem mexer em `criado_em` |
| 062 | orcamento_valor_opcional | `orcamento_linhas.valor_unitario` vira nullable (era `NOT NULL DEFAULT 0`) — item sem preço some da coluna de valor no PDF em vez de virar "R$ 0,00" |
| 063 | contratos_assinatura_verificacao | `contratos.assinatura_cliente/geral_codigo` + `_expira` + `_tentativas` + `_enviado_em` (código de 6 dígitos por e-mail antes de assinar) e `assinatura_cliente/geral_protocolo` (hash SHA-256 auditável, impresso no PDF) |
| 064 | contratos_remove_signatario_geral_default | remove `DEFAULT 'Ana Paula Martins Lima'` de `signatario_geral_nome` (054) e limpa valores existentes ainda não assinados |

## Marcos de produto (fases do plano)

- **2026-07-31** — **Menu lateral com barra de rolagem em notebook + card
  "Status do sistema" removido**
  - **Medido no painel real** (harness montado na própria origem, com o
    `admin.css` de produção): a `.nav` precisa de **643px** de conteúdo, mais
    **60px** de header e **169px** de rodapé = **872px de viewport** pra caber
    sem rolar. Notebook 1366×768 entrega ~660px → faltavam **212px**. Em
    monitor 1080p (~945px) nunca aparecia, o que explica só se ver em
    notebook.
  - O `overflow-y: auto` da `.nav` continua como rede de segurança, mas
    rolagem em menu lateral não é experiência aceitável quando o que sobra é
    respiro. Duas faixas de **modo compacto por altura de viewport**:
    `max-height: 900px` (item 34px, header 56px) e `max-height: 760px`
    (item 30px, ícone 17px, header 50px).
  - **Não confundir com o bug de 2026-07-30**, em que o flexbox *esmagava* os
    itens sem ninguém mandar (38px viravam 23px). Aqui a redução é explícita e
    o `flex-shrink: 0` do `.nav-item` continua no lugar — é justamente ele que
    garante que só estes valores mandem.
  - **Verificado**: faixa 1 precisa de 707px, faixa 2 de **628px** — cabe nos
    ~660px do notebook com 32px de folga.
  - **Card "Status do sistema" removido do admin** (economiza 50px do rodapé).
    Era um resumo de `offline_count`/alertas com dois problemas: a bolinha era
    verde fixa em CSS, então exibia verde pulsante ao lado de "1 offline", e o
    card não era clicável, não levando a lugar nenhum. `atualizarStatusSistema()`
    saiu junto.
  - **Saiu do painel do cliente também**, onde era pior: "Operacional" escrito
    no HTML, sem nada atualizando — afirmava que estava tudo bem mesmo com o
    reservatório offline. Com os dois painéis sem o card, o CSS
    `.sidebar-status*` foi removido.
  - ⚠️ O `@keyframes statusPulse` **ficou**: apesar do nome, não era exclusivo
    do card — anima também o ponto de alerta da topbar
    (`.icon-btn-dot::before`). Removê-lo junto quebraria essa animação.

- **2026-07-31** — **Buracos pretos retangulares no mapa de condomínios**
  - **Causa real: o fade de tile do Leaflet em aba de segundo plano.** Com
    `fadeAnimation` ligado (o padrão), cada tile nasce em `opacity: 0` e sobe
    pra 1 dentro de um loop de `requestAnimationFrame`. Se a página renderiza
    com a aba em background, o Chrome **não dispara rAF**, o ramp nunca roda e
    a tile fica invisível — carregada, posicionada e transparente. Os vãos
    pretos são as tiles que ficaram para trás nesse ramp.
  - **Medido no painel real** antes de mexer em qualquer coisa: 8 tiles no
    DOM, **8 carregadas, 0 falhas**, cobrindo o container inteiro (x de -35 a
    989 num container de 775px), **todas em `opacity: 0`**, com
    `document.visibilityState === "hidden"`. Forçar `opacity: 1` via console
    fez o mapa aparecer completo e correto.
  - **Correção:** `fadeAnimation: false` nos três mapas (Mission Control,
    mini-mapas do formulário e o mapa do modal de perfil). Sem o fade, a tile
    aparece assim que carrega, sem depender de rAF.
  - **Diagnóstico anterior estava errado** e foi revertido: a primeira leitura
    (tile que falha e nunca é repedida) levou a baixar o `keepBuffer` de 4 pra
    2 — desfeito, já que a rajada de requests não tinha nada a ver. O retry de
    `tileerror` em `_criarTileLayer` **ficou**, mas como proteção genuína
    contra rede instável, não como correção deste bug; o comentário foi
    reescrito pra não induzir a erro de novo.
  - Corrigido também um comentário que dizia "CDN do Carto" enquanto a URL é
    a do OpenStreetMap.

- **2026-07-31** — **"Reservatórios Críticos" vazando do card + ícone de
  offline ilegível**
  - **Texto escapando da linha — duas causas somadas.**
    - `.tel-crit-title` e `.tel-crit-sub` são `<span>`, e `overflow`/
      `text-overflow` **não se aplicam a elemento inline**. O `white-space:
      nowrap`, esse sim, se aplica — então o nome do reservatório e o subtítulo
      ("condomínio · OFFLINE há Xmin") ficavam numa linha só, sem nunca
      reticenciar. `display: block` nos dois resolve.
    - A trilha do meio era `1fr`, cujo mínimo automático é o **min-content** —
      com o texto em nowrap, isso equivale à largura do texto inteiro, e a
      linha crescia empurrando o `%` pra fora do card. Passou a
      `minmax(0, 1fr)`.
  - **A grade da lista também vazava**: `minmax(300px, 1fr)` numa coluna
    (`.tel-col-right`, o `1fr` de `1.7fr/1fr`) que fica **abaixo de 300px** em
    notebook. `minmax(min(300px, 100%), 1fr)` limita a trilha à largura
    disponível.
  - `.tel-crit-row` é `<button>`, que centraliza texto por padrão —
    `text-align: left` explícito.
  - **Mesmo par de bugs em "Últimos Eventos"** (`.tel-evt-row` com `1fr` +
    `.tel-evt-txt` inline), corrigido junto.
  - **Ícone de dispositivo offline.** Havia **cinco** variantes do wi-fi
    cortado espalhadas por `admin.html`/`admin.js`/`cliente.js`, três delas
    com os arcos externos removidos — sobrava um arco solto, um ponto e um
    risco de canto a canto (`1,1 → 23,23`), que em 14–15px lia como um
    rabisco. Trocadas pela arte do Lucide atual, com os arcos **recortados em
    volta da diagonal** e a diagonal parando em `2,2 → 22,22`. Fonte única:
    `ICON_WIFI_OFF` (`admin.js`) e `ICO_WIFI_OFF` (`cliente.js`).
  - **Linha travada em 300px com o card largo** — a lista usava
    `repeat(auto-fill, ...)`, e o `auto-fill` **mantém as trilhas vazias**: com
    1 ou 2 críticos o item ficava preso na primeira trilha de 300px e sobrava
    um vão enorme à direita. `auto-fit` colapsa a trilha vazia e o item estica
    até a largura do card.
  - **A linha deixou de ser `<button>`.** Clicar num reservatório crítico abria
    o modal do **condomínio** (`data-action="ver-condo"`), que não é o que se
    espera do clique. Virou `<div>` informativo; `cursor: pointer` e o `:hover`
    com `translateX` saíram junto — no painel do cliente a linha já era `<div>`
    e herdava esse hover sem ter clique nenhum.
  - **"OFFLINE há ?min"** — `minutos_sem_atualizar` vem `null` do
    `/admin/status` quando o reservatório **nunca recebeu leitura**
    (`last_seen` vazio); o front imprimia o fallback `"?"` e afirmava um tempo
    que não existe. Passa a dizer **"SEM LEITURA"** nesse caso. Mesma correção
    no painel do cliente e no detalhe da lista de offline
    ("nunca enviou leitura" no lugar de "- min sem atualizar").
  - **Verificado no painel real** (Telemetria, 1568px): linha ocupando os
    558px úteis do card, `scrollWidth == clientWidth`, elemento `DIV`,
    `cursor: auto` e sem `data-action`.
  - Assets bumpados: `admin.css?v=158`, `admin.js?v=249`, `cliente.js?v=28`.

- **2026-07-30** — **Admin em tela de notebook: menu esmagado e KPI cortado**
  - **Menu com os ícones colados — a causa não era espaçamento.** `.nav-item`
    tem `height: 38px`, mas `.nav` é flex column e todo flex item nasce com
    `flex-shrink: 1`: em tela baixa o flexbox **espremia os itens** em vez de
    deixar a lista rolar. Medido: 38px em 1080p, 29px em 800, **27px em 768**,
    **23px em 720** — com ícone de 18px, sobravam 2,5px de cada lado. Em
    monitor 1080p nada aparecia, e é por isso que só se via em notebook.
    `flex-shrink: 0` no `.nav-item` e no `.nav-section-label` (que sofria do
    mesmo mal — 32px viravam 20px e o `overflow: hidden` cortava "MONITOR"
    no meio). O `overflow-y: auto` que a `.nav` já tinha passa a funcionar.
  - **`.rc-label` quebra em vez de truncar** — era `white-space: nowrap` +
    ellipsis, e "COND. COM ALERTA" virava "COND. COM ALE…" em 1366px (coluna
    de 194px) e em 1152px. Rótulo cortado num card cujo único papel é rotular
    um número não informa nada.
  - **Última linha quebrada nas faixas de KPI.** O `auto-fit` decide quantas
    colunas cabem sem saber quantos cards existem: 5 KPIs em 4 colunas viram
    4 + 1, e 6 viram 4 + 2, sempre com um buraco ao lado. Em notebook
    (1280–1366px) isso pegava quase toda seção do admin.
  - O admin tem faixas de **4, 5 e 6** KPIs, então regra por id não resolvia
    (a primeira tentativa mirou só o `#resumoGrid` e deixou Chamados, com 6,
    quebrado). A regra passou a detectar a quantidade com
    `:has(> .rc:nth-child(N):last-child)` e escolher uma divisão exata:
    **5 → 3 + 2**, **6 → 3 + 3**. Grades de 4 ficam de fora, porque 4 colunas
    já fecham certo. Os limites (1300px e 1500px) saem da conta do próprio
    `auto-fit` — piso de 190px + gap de 14px, descontando sidebar e respiro.
  - Tentativa descartada: subir o piso do `minmax`. Em 1280 falta **4px** para
    as 5 colunas entrarem — limiar frágil demais para depender dele.
  - **Grades de 4 também quebram**, só que mais estreito: quando o `auto-fit`
    desce para 3 colunas sobra 3 + 1. Vale para O.S., Contratos, Planos e
    Orçamentos avulsos. Entre 769px e 1100px passam a 2 + 2 — com
    `!important`, porque o próprio bloco de tablet (769–1024px) força
    `repeat(3, …) !important` em toda `.resumo-grid` e é ele que produz o
    órfão nessa faixa.
  - **Cobertura final** (harness isolado, 4/5/6 KPIs × 12 larguras de 900 a
    1920px): **nenhum órfão em nenhuma combinação**. 4 cards ficam em 4
    colunas até 1152 e 2 + 2 abaixo; 5 numa linha até 1366 e 3 + 2 abaixo;
    6 numa linha a partir de 1600 e 3 + 3 abaixo. Conferido também no app
    real (seção Planos em 1024px → 2 + 2).
  - O painel do cliente não é afetado: as faixas dele têm 3 e 4 cards, e as
    de 4 só entram na regra abaixo de 1100px, onde 2 + 2 já era o desejado.
  - **Verificado** em 1920×1080, 1440×900, 1366×768, 1280×720, 1152×864 e
    1024×768, nos **dois** painéis: item de menu 38px em todos, nenhum rótulo
    cortado, nenhum card órfão.
  - `admin.css?v=154`, `cliente.css?v=9`.

- **2026-07-30** — **Card de KPI do cliente engordou de 58px para 77px (regressão)**
  - Introduzida ao dar suporte ao `.rc-hint`: troquei o `grid-row` do ícone de
    `1 / span 2` para `1 / -1`. **`-1` aponta para o fim do grid explícito** —
    e ali não há `grid-template-rows`, as linhas são implícitas. O `-1`
    colapsava para a linha 1, o ícone deixava de atravessar e forçava a
    primeira linha aos seus 30px.
  - Corrigido para `1 / span 3`; nos cards de 2 linhas o terceiro trilho fica
    vazio e colapsa. Dashboard voltou a 58px e Alertas/Chamados (3 linhas)
    ficaram em 72px.

- **2026-07-30** — **Service worker respondia 200 quando estava sem conexão**
  - **Sintoma:** com o servidor fora do ar, o painel do admin cuspia uma pilha
    de erros de tipo sem relação aparente com rede —
    `TypeError: _alertasAbertos is not iterable`,
    `TypeError: _chamadosData.filter is not a function`.
  - **Causa:** o fallback offline do `sw.js` monta
    `new Response(JSON.stringify({error:"Sem conexão"}), { headers })`.
    **`new Response` sem `status` responde 200.** Então `r.ok` era `true`, o
    `if (!r.ok) throw ...` que já existe em `carregarAlertas`/`carregarChamados`
    passava batido, e `{error:"Sem conexão"}` era atribuído a variáveis que o
    resto do código trata como array.
  - **Correção:** `status: 503` + `statusText` no fallback. `r.ok` passa a ser
    `false` e todo o tratamento de erro existente volta a funcionar — a tela
    mostra o erro de carga em vez de quebrar em `TypeError`.
  - **Alcance:** vale para admin, cliente e app — o fallback é o mesmo para
    todos os prefixos da lista network-first. Ninguém consumia o payload
    `"Sem conexão"`, então não há dependência quebrada.
  - `CACHE_NAME` → `telemetria-v41` e `register-sw.js?v=32` nos três HTMLs,
    conforme o checklist de cache do `CLAUDE.md`.

- **2026-07-30** — **Job de offline derrubava o processo em soluço do banco**
  - **Sintoma:** o servidor morreu inteiro com
    `Error: Connection terminated due to connection timeout`, empilhado em
    `scheduleProximo → getConfigInt → getConfig`. Apareceu rodando local contra
    o Postgres da Railway (conexão ociosa derrubada pelo proxy), mas a falha
    não é exclusiva de dev.
  - **Causa:** `scheduleProximo()` (`src/jobs/offline.job.js`) é `async` e era
    chamado de dentro do `finally` do `tick()` — ou seja, **fora** do try/catch
    que protege o job. Uma rejeição ali virava `unhandledRejection` e derrubava
    o processo. Havia um segundo efeito, pior e silencioso: sem chegar no
    `setTimeout`, o job **nunca mais reagendava**, e a detecção de dispositivo
    offline parava sem ninguém perceber.
  - **Correção:** `try/catch` na leitura da config, com o `setTimeout` **fora**
    do `try` — falhar a leitura passa a só usar `INTERVALO_PADRAO_MIN` (1 min)
    e registrar o erro, nunca interromper o ciclo.
  - **Só este job tinha o problema.** `gps-cleanup`, `alertas-cleanup`,
    `conversas-cleanup` e `leituras-cleanup` têm `scheduleProximo` **síncrono**
    com intervalo fixo; `offline.job` é o único que lê config para decidir o
    intervalo, e por isso o único com `await` nesse ponto.
  - **Verificado** apontando o banco para um host inalcançável e rodando o
    scheduler real: com a correção o processo sobrevive e reagenda em 60000ms;
    com o código anterior (via `git stash`) morre em `unhandledRejection` e não
    reagenda.

- **2026-07-30** — **Painel do cliente: dashboard, identidade e mobile**
  - **Contexto:** o painel do cliente ficou parado enquanto o foco esteve no
    admin. Foco definido: **navegador** (o app Capacitor não tem previsão de
    chegar aos clientes), com prioridade em tela pequena.
  - **`public/cliente.css` (novo)** — só overrides, carregado depois do
    `admin.css` e usando os mesmos tokens. Existe para as proporções do
    cliente divergirem sem risco de mexer no painel do admin, que compartilha
    o `admin.css`.
  - **CSS do cliente estava 42 versões atrás:** `cliente.html` pedia
    `admin.css?v=107`, `admin.html` pedia `v=149`. Mesmo arquivo, chave de
    cache diferente (a query faz parte da URL) — quem tinha o v107 salvo nunca
    recebeu nenhum refinamento posterior. Sincronizado.
  - **Identidade real:** topbar e sidebar mostravam "Cliente / Meu Condomínio"
    fixo no HTML, igual pra todo cliente. `_aplicarIdentidade()` preenche com
    nome do usuário (localStorage) e do condomínio (`/cliente/status`).
  - **Tanque SVG do admin no cliente** — `_telTanqueSVG`/`_telBandaAgua`
    portados de `admin.js`. O dashboard usava bar chart do ApexCharts e o
    `tankHtml()` do `cliente.js` era a versão antiga em divs, **nunca chamada**
    (removida). A aba **Telemetria** recebeu a mesma grade; markup unificado em
    `_cliTanqueTile()`. O ApexCharts continua no **Histórico de níveis**, onde
    série temporal é o componente certo.
    ⚠️ O SVG ficou **duplicado** em `admin.js` e `cliente.js` (não há módulo
    compartilhado). Extrair para `public/tanque.js` ficou acordado para depois.
  - **Cliente sem telemetria tinha dashboard vazio:** `_dashRenderKpis` só era
    chamado `if (temTelemetria)`, então sobrava a tabela de chamados e ~70% de
    tela preta. Agora os KPIs sempre aparecem e **mudam de conteúdo** — sem
    telemetria viram abertos/em atendimento/resolvidos/última movimentação, em
    vez de "0 Online" em verde, que é o zero de quem não tem o produto. Somado
    a isso, bloco `#dashSemTelemetria` com dois cards (o que é o monitoramento
    + atalho para Chamados).
  - **Altura da linha do Mission Control:** os três cards herdavam a altura de
    "Atividade recente", que cresce com o número de eventos, e o card de
    tanques (conteúdo de altura fixa) ficava com um vão morto. Altura fixa de
    330px + `align-content: stretch`; as listas passam a rolar pelo
    `overflow-y` que já tinham.
  - **Mobile:** stat card de **104px → 58px** — `display: contents` no
    `.rc-head` dissolve o wrapper e reorganiza em grid (ícone à esquerda,
    label+valor à direita) **sem tocar no HTML que o admin também usa**.
    Tabela de chamados vira lista de cards. `admin.css` escondia a coluna de
    data no `.layout-cli` (remendo de quando era tabela apertada) — revertido,
    a data volta.
  - **Dois remendos antigos do `admin.css` neutralizados** (por override, sem
    editar o arquivo): `.layout-cli #chCliKpiGrid { repeat(3,…) !important }`,
    que em 414px dava colunas de 122px e cortava "Em atendimento"; e o
    `nth-child(4) { display:none }` da tabela de bombas. Como são seletores de
    ID/`!important`, o override repete o ID e depende de `cliente.css` carregar
    depois.
  - **KPI órfão:** Alertas e Chamados têm 3 KPIs; em 2 colunas o terceiro ficava
    com meia linha vazia. `:last-child:nth-child(odd)` estica ele.
    ⚠️ A regra é **exclusiva do mobile** — solta, ela pega o desktop (onde o
    `auto-fit` cria 7 trilhas) e o "órfão" vira um card de 1606px cruzando a
    tela. Foi um bug real introduzido e corrigido nesta sessão.
  - **Verificado no navegador** (servidor local + banco de TESTE) em 1920px,
    414px e 360px, nos dois perfis (com e sem telemetria).
  - Versões: `cliente.css?v=8`, `cliente.js?v=26`, `admin.css?v=149` no cliente.
  - **Não feito ainda:** as seções **Alertas** e **Chamados** só receberam o
    ajuste de KPI — o conteúdo delas não foi repensado.

- **2026-07-30** — **Soft delete de condomínio passa a revogar o acesso do cliente**
  - **Motivação:** `DELETE /condominios/:id` marcava `condominios.ativo = false`
    e não tocava em mais nada. O cliente do condomínio "excluído" continuava
    logando normalmente — `/cliente/status` nunca filtrou por `ativo`. Você
    excluía o cliente no painel e ele seguia com acesso.
  - **`clienteOnly` deixa de ser síncrono** e passa a validar o condomínio a cada
    request: 403 se `ativo = false` **ou** se o id não existe mais (JWT antigo
    apontando pra condomínio que sofreu hard delete). Mensagem única exportada
    como `MSG_INATIVO`.
  - ⚠️ **Por que a cada request e não só no login:** o JWT vale 7 dias e carrega
    o `condominio_id` de quando foi emitido. Revogar só no login deixaria um
    cliente já logado com acesso por até uma semana depois da exclusão. O custo
    é um `SELECT ativo ... WHERE id = $1` (PK) por request de `/cliente/*`.
  - **`condominio_id` nulo continua caindo no handler da rota**, que responde
    "Cliente sem condomínio vinculado". Barrar no middleware daria a mensagem
    errada (falaria em cadastro encerrado, quando nunca houve vínculo).
  - **`POST /auth/login`** barra o cliente antes de emitir qualquer sessão.
    ⚠️ A checagem vem **antes do atalho de dispositivo confiável** — senão quem
    marcou "lembrar deste dispositivo" pularia direto pro JWT e a revogação não
    valeria nada. Também evita mandar e-mail de OTP pra quem não vai entrar.
  - **`POST /auth/verify-otp`** recheca: o condomínio pode ser encerrado nos 15
    min de validade do `otp_token`, entre a senha e o código.
  - **Admin:** o `confirm()` de "Inativar" agora diz que os logins de cliente
    perdem o acesso na hora e que "Reativar" devolve. `admin.js?v=245`.
  - **Reativação já existia** e volta a liberar o acesso sozinha — o botão
    "Reativar" manda `PATCH /condominios/:id {ativo:true}`.
  - **Verificado** contra o banco de teste chamando o middleware real (não uma
    cópia da lógica): admin barrado por role, cliente ativo passa, inativo e
    inexistente tomam 403, `condominio_id` nulo segue pro handler, e — o caso
    que importa — **o mesmo JWT perde o acesso logo após o soft delete e o
    recupera após reativar**, sem novo login.
  - **Não fechado:** reativar o condomínio **não reativa os reservatórios**
    (o soft delete desativa os dois, o `PATCH` só mexe no condomínio). O cliente
    volta a entrar mas vê o painel vazio até alguém reativar os reservatórios.
    Comportamento anterior à mudança, apenas mais visível agora.

- **2026-07-30** — **Hard delete de condomínio apaga também os logins de cliente**
  - **Motivação:** a FK `usuarios_condominio_id_fkey` é `ON DELETE SET NULL`, então
    "excluir permanentemente" um condomínio **não apagava o usuário** — deixava uma
    credencial válida apontando pra lugar nenhum. A pessoa logava normalmente
    (e-mail + senha + OTP) e só então tomava 403 `Cliente sem condomínio vinculado`.
    Órfão invisível: não aparecia em nenhuma tela do cadastro de condomínios.
  - **`DELETE /condominios/:id/hard`** ganha a etapa 8, `DELETE FROM usuarios`,
    **antes** do `DELETE FROM condominios` (etapa 9, renumerada).
  - ⚠️ **A ordem é obrigatória.** Depois que o condomínio sai, o `SET NULL` já
    zerou `usuarios.condominio_id` e não há mais como saber quem era de lá.
  - **Escopo estreito de propósito** — `WHERE condominio_id = $1 AND role =
    'cliente' AND id <> req.user.id`. O filtro de `role` protege admin/gerente/
    operador/técnico que tenham `condominio_id` preenchido por dado antigo; o
    `id <>` impede o master de se auto-apagar.
  - **`login_codes` e `trusted_devices` saem por CASCADE** — a exclusão também
    revoga os dispositivos confiáveis do cliente.
  - **Erro 23503 (foreign_key_violation)** passa a responder **409** com texto
    explicando que nada foi apagado, em vez de 500 genérico. Cobre o caso de um
    login referenciado por coluna de autoria sem `ON DELETE` (`orcamentos
    .criado_por`, `contratos.criado_por`, `sla_definicoes.atualizado_por` — todas
    `NO ACTION`). Não deve acontecer (são ações de admin), mas o rollback
    preserva tudo e o master fica sabendo o porquê.
  - **Consentimento informado no modal:** `_hardDeleteCarregarLogins()` busca
    `/admin/usuarios?role=cliente` ao abrir a confirmação e lista nome + e-mail
    de cada login que será apagado, em destaque vermelho. Sem isso o master
    confirmaria uma exclusão de credencial sem ver que ela existia.
    `admin.js?v=244`.
  - **Resposta** passa a incluir `usuarios_removidos` (contagem) e `usuarios`
    (id/nome/e-mail); o servidor também loga os e-mails removidos.
  - **Verificado** contra o banco de teste em transação com `ROLLBACK`: os 2
    clientes do condomínio saem; gerente com `condominio_id`, o admin executor e
    cliente de outro condomínio ficam; `trusted_devices` e `login_codes` somem
    por CASCADE.
  - **Não fechado:** o **soft delete** (`DELETE /condominios/:id`) continua sem
    revogar acesso — marca `ativo = false` e o cliente segue logando (o
    `/cliente/status` não filtra `condominios.ativo`). Ver
    [`../memory-bank/active-work.md`](../memory-bank/active-work.md).

- **2026-07-30** — **Painel do cliente: 403 deixa de virar logout silencioso**
  - **Sintoma:** o cliente fazia login, digitava o OTP, o painel abria por um
    instante e voltava sozinho para a tela de login — sem nenhuma mensagem de
    erro. Loop infinito, impossível de diagnosticar pela tela.
  - **Causa:** `public/cliente.js` tratava **401 e 403 como a mesma coisa** nos
    dois pontos que consomem a API (`carregar()` → `/cliente/status` e o
    histórico → `/cliente/historico`): qualquer um dos dois fazia
    `location.href = "/login"`. Mas 403 não é sessão inválida — vem do
    `clienteOnly` (role diferente de `cliente`) ou do guard
    `condominio_id` ausente em `cliente.routes.js` ("Cliente sem condomínio
    vinculado"). Como `/cliente/status` é a primeira chamada do
    `DOMContentLoaded`, o 403 derrubava o painel antes de renderizar qualquer
    coisa, e o `redirectByRole` mandava de volta pro painel no login seguinte.
  - **Correção:** só **401** desloga (agora limpando o `token` e indo para
    `/login?motivo=expirado`, que já tem mensagem em `login.js`). **403** passa
    a exibir o `error` do backend na tela via `setStatusMsg`. Novo helper
    `_erroDaResposta(r)` extrai o campo `error` do JSON com fallback pro texto
    cru (cobre o caso de HTML de erro do proxy). `cliente.js?v=22`.
  - **Nota:** a correção torna o problema visível, mas não cria o vínculo
    faltante — se a mensagem for "Cliente sem condomínio vinculado", o usuário
    precisa de `usuarios.condominio_id` preenchido. Ver
    [`modulos/autenticacao.md`](modulos/autenticacao.md).

- **2026-07-30** — **Login avisa quando o usuário não tem painel (fim do `else` catch-all)**
  - **Origem:** desdobramento do item acima. Corrigir o `cliente.js` mostra o
    403, mas tarde demais — a pessoa já digitou senha e código pra só então
    receber um erro. O lugar certo de barrar é o roteamento pós-login.
  - **Causa:** `redirectByRole` em `public/login.js` terminava num `else` que
    mandava **qualquer role não mapeada** pra `/cliente/painel`. Uma role sem
    painel próprio (caso do `admin_viewer`, morto em `src/` mas ainda aceito no
    CHECK de `usuarios.role`) virava "cliente" por omissão e batia no 403 do
    `clienteOnly`.
  - **Correção:** `else` substituído pelo mapa explícito `PAINEL_POR_ROLE`
    (`admin`/`gerente`/`operador` → admin, `tecnico`, `cliente`). Role fora do
    mapa **não redireciona**: `_abortarLogin()` limpa `token`/`user`, volta pro
    passo 1 e mostra *"Seu usuário não tem um painel liberado (perfil: X)"*.
  - **Segundo guard:** `role === "cliente"` sem `condominio_id` também para no
    login, com *"Seu usuário não está vinculado a nenhum condomínio"*. Dá pra
    checar aí porque o `condominio_id` vem no payload de `/auth/login` e
    `/auth/verify-otp`.
  - **Mensagem deliberadamente não é "usuário não encontrado":** o usuário
    existe e a senha conferiu. Dizer que a credencial falhou mandaria a pessoa
    resetar senha atrás de um problema que é de cadastro.
  - **Versionamento:** `login.js` não tinha `?v=` nenhum e está no
    `STATIC_ASSETS` do `sw.js` (precache) — agora `login.js?v=2`. `CACHE_NAME`
    → `telemetria-v40` e `register-sw.js?v=31` nos três HTMLs (`login`,
    `admin`, `cliente` — os dois últimos também estavam sem `?v=`).

- **2026-07-27** — **Planos de manutenção: edição em massa (periodicidade, próxima execução, status)**
  - Motivação: a seleção múltipla de 2026-07-22 só ativava/desativava. Mudar a
    periodicidade ou reagendar a próxima execução de uma zona inteira ainda
    era um plano por vez, no modal individual.
  - Barra de seleção ganhou **"Editar selecionados"**, que abre o `#pmModal`
    (mesmo modal do criar/editar) em modo massa: periodicidade (presets +
    personalizado), próxima execução e status — **todos opcionais**, com
    "— manter atual —" como default. Só o que muda entra no PATCH.
  - O modal mostra um resumo do que está selecionado (nº de planos,
    condomínios, periodicidade atual ou "N periodicidades diferentes") pra
    não sobrescrever no escuro.
  - Backend: `PATCH /planos-manutencao/bulk` deixa de ser só `{ ids, ativo }` e
    passa a aceitar `periodicidade_dias` e `proxima_em` (pelo menos 1 campo).
    Reusa o `_validarPayload` do PATCH individual e **filtra o body** pros 3
    campos editáveis em massa — `condominio_id`/`titulo` não passam, pra um
    body errado não mover 500 planos de prédio. `SET` montado dinamicamente,
    ainda uma query só (`WHERE id = ANY($1::int[])`).
  - "Ativar/Desativar selecionados" continuam como atalho; ambos passaram a
    usar o helper `_pmBulkPatch(campos)`.
  - `admin.css?v=142`, `admin.js?v=236`. Sem endpoint GET novo → `sw.js` e
    `register-sw.js` intocados.

- **2026-07-24** — **Orçamento para cliente avulso (pessoa física, sem CNPJ)**
  - Migration **065**: `orcamentos` ganha `cliente_nome`, `cliente_documento`
    (CPF/CNPJ), `cliente_endereco`, `cliente_email`.
  - No modal, toggle **"Cliente avulso (pessoa física / não cadastrado)"**:
    ligado → some o select de condomínio + O.S. e aparecem os campos livres
    (nome / CPF-CNPJ / endereço / e-mail). Salva `condominio_id` **ou** os
    campos de cliente, nunca os dois.
  - Backend (`admin.routes.js`): POST/PATCH aceitam os campos; GET lista devolve
    e usa `COALESCE(c.nome, o.cliente_nome)` como nome de exibição (agrupa o
    avulso pelo nome do cliente no master-detail). PDF (`orcamento-pdf.service`):
    bloco "Cliente" usa os dados avulsos quando não há condomínio, com rótulo
    `CPF`/`CNPJ` automático. Envio por e-mail pré-preenche com `cliente_email`.

- **2026-07-24** — **Orçamento novo: rascunho descartável (não fica salvo vazio)**
  - Só frontend (`admin.js`). "Novo orçamento" ainda cria o registro no servidor
    (necessário porque itens/PDF dependem do `id`), mas ele passa a ser um
    **rascunho descartável**: se o usuário **fechar sem salvar** (× / backdrop /
    Esc), aparece um `confirm` avisando que vai perder tudo e, se confirmar, o
    orçamento é **apagado** (DELETE). Só "gruda" de verdade ao clicar **Salvar**.
  - Estado `_avNovoPendente` (id do rascunho não-salvo); nova função
    `_avTentarFechar` substitui `_avFecharModal` nos gatilhos de fechar; limpo ao
    salvar/excluir. Assim não sobra mais orçamento vazio na lista.

- **2026-07-24** — **Modal de orçamento: reorganizado em seções (cards)**
  - Só frontend (`admin.js`, `admin.css`). O modal de criação/edição
    (`_avRenderPainel`) era um bloco único; virou **cabeçalho com ícone
    temático** (número + status + data) e **4 seções em cards** — "Dados
    gerais", "Escopo do serviço", "Itens/Valores", "Condições Comerciais" —
    seguindo o visual `.ap-section` do painel do OS. Rodapé de ações (Excluir /
    PDF / E-mail / Salvar) virou faixa própria fora das seções. Todos os IDs e
    `data-av-action` preservados (nenhuma lógica mudou). Novos estilos
    `.av-modal-head*` / `.av-modal-sections` / `.av-modal-dialog .ap-section`.

- **2026-07-24** — **Orçamentos (Criar orçamento): master-detail condomínio → orçamentos**
  - Evolução do agrupamento anterior. O modo avulso deixou de ser uma tabela
    única (com cabeçalhos de grupo) e virou **duas colunas** no padrão
    Chamados/OS (`ch-layout`): **esquerda** = lista de condomínios (nome +
    contagem + total + dots de status rascunho/enviado/aprovado); **direita** =
    orçamentos do condomínio selecionado. Clicar num orçamento abre o modal de
    detalhe/edição de sempre (`avModal`). Barra de filtros (tabs de status +
    busca + "+ Novo orçamento") virou uma faixa acima das colunas.
  - Estado `_avCondoSel` guarda o condomínio selecionado (auto-seleciona o
    primeiro; segue o condomínio ao criar/editar um orçamento). Removidos o
    `#avFiltroCondo` (a lista à esquerda substitui o filtro), a tabela
    `#avTableBody`, o `_avPopularFiltroCondos` e o CSS `.orc-group-*` (órfão).
    Novos: `_avRenderCondoDetail`, `.av-condo-*`, `.av-orc-*`.
  - **Distribuição alinhada à aba "Solicitados pelos técnicos":** toolbar (tabs
    + busca + "+ Novo") movida pra dentro do card da lista (`.ch-toolbar`, não
    mais uma faixa flutuante) e proporções padrão do `ch-layout` (lista larga à
    esquerda + painel 360px à direita), sem override de largura.

- **2026-07-24** — **Envio de orçamento: "Para" pré-preenchido com o e-mail do cliente**
  - Só frontend (`admin.js`). O modal "Enviar orçamento por e-mail" (`avEnvioPara`)
    começava vazio; agora vem preenchido com o(s) e-mail(s) cadastrado(s) do
    condomínio do orçamento (`_condominios[...].email`, que o `GET /condominios`
    já retorna). Continua editável. Fallback pra vazio se o condomínio não tiver
    e-mail. O backend já aparava espaços (`split(",").map(trim)`), então vírgula
    com ou sem espaço tanto faz.

- **2026-07-24** — **Removido form legado oculto de "novo condomínio"**
  - Só frontend. O `<section>` "Cadastro de condomínio" (inputs `novo*` +
    `btnCadastrarCondominio`) vivia dentro do bloco `display:none`
    ("mantidos para compatibilidade") e não aparecia na tela — criar cliente é
    feito pelo modal "Criar cliente" (`cliModalEmail`, com e-mail). Removidos o
    HTML, a função órfã `criarCondominio()`, o binding do botão, o init do
    mini-mapa `"novo"` e o `_bindCepInput("novo")` (todos mortos). O form oculto
    de **reservatório** (`res*`, ainda usado por `criarReservatorio()`) foi
    mantido.

- **2026-07-24** — **Removidos 2 e-mails automáticos (atraso de chamado + orçamento IA)**
  - **Chamado em atraso:** feature inteira removida (existia só pra mandar
    e-mail). Deletado `src/jobs/chamados-atraso.job.js`; removidos o scheduler
    no `app.js`, o endpoint `POST /admin/jobs/chamados-atraso/run` + status
    `job_chamados_atraso` (`admin.routes.js`), as chaves de config
    `chamados.alerta_atraso_horas/_enabled` (`config.service.js` +
    `restaurar-defaults.sql`), o card "Alerta de chamado parado" da UI de
    Configurações (`admin.html`) e o load/save/handler correspondentes
    (`admin.js`). A coluna `chamados.alerta_atraso_enviado_em` fica no schema
    (histórica, sem uso). Monitorar chamado que passou do prazo agora é só via
    **SLA estourado → alerta crítico** (mudança anterior).
  - **Orçamento via IA:** removido o disparo `sendOrcamentoIAEmail` em
    `ia.service.js` (o pedido continua sendo registrado como rascunho normal).
  - Ambas as funções (`sendChamadoAtrasoEmail`, `sendOrcamentoIAEmail`) saíram
    de `src/services/email.js`. E-mails automáticos que **permanecem**: alerta
    de telemetria (offline / nível baixo), OTP de login, código de assinatura,
    solicitação de assinatura de contrato e envio de orçamento ao cliente.

- **2026-07-24** — **Chamado com SLA estourado vira alerta crítico**
  - Só frontend (`public/admin.js`). Antes, um chamado que estourava o SLA
    (TTFR sem primeira resposta / TTR além do prazo — flags `sla_ttfr_estourado`
    / `sla_ttr_risco`, já calculadas em tempo real pelo `GET /chamados`) só
    aparecia como badge na página de Chamados; na agregação de Alertas a
    severidade vinha só da prioridade, então um P3/P4 estourado ficava "normal".
  - Agora `_chamadoSlaEstourado(ch)` centraliza a regra e o chamado estourado é
    elevado a **crítico** em toda a agregação: página **Alertas** (`_alUnificar`
    — severidade crítica + pill "SLA estourado"), **badge** do menu, **feed do
    Mission Control** (kind "bad" + "SLA estourado" no subtítulo) e **KPI de
    alertas** do Dashboard. Novo helper `_chamadosAlertaAbertos()` (P1/P2 abertos
    **ou** SLA estourado) substitui o antigo `_chamadosP12Abertos()`.
  - Atualiza a cada ~20s junto com `carregarAtendimento` (que refaz o
    `GET /chamados`). Sem mudança de backend/schema — as flags de SLA já
    existiam.

- **2026-07-24** — **Orçamentos (Criar orçamento): lista agrupada por condomínio**
  - Só frontend (`public/admin.html`, `admin.css`, `admin.js`). A lista de
    orçamentos criados (modo **avulso**) era plana e misturava todos os
    condomínios. Agora as linhas são **agrupadas por condomínio**: cada grupo
    tem um cabeçalho (`.orc-group-row`) com nome do condomínio + contagem +
    **soma dos valores** do grupo; itens do grupo ordenados por data (mais
    recentes primeiro) e grupos em ordem alfabética.
  - **Filtro de condomínio** (`#avFiltroCondo`) adicionado à toolbar do modo
    avulso — derivado dos próprios orçamentos, igual ao do modo OS. Bind em
    `_avBindEventos`; populado em `_avPopularFiltroCondos`.
  - A coluna redundante "Condomínio" da tabela virou **"Tipo"** (o grupo já
    mostra o condomínio); tipo exibido como pill quando houver.

- **2026-07-24** — **Orçamentos "Solicitados pelos técnicos": layout igual ao de Chamados**
  - Só frontend (`public/admin.html`, `admin.css`). O container do modo **OS**
    (`#orcModoOS`) estava com o padrão `.al-*` (card único envolvendo header +
    toolbar + grid tabela/painel), destoando do resto. Passou a espelhar o
    **padrão de Chamados**: `.ch-layout` com `.ch-list-col` (card da lista +
    `.ch-toolbar` com abas/busca/filtro) e `.ch-detail-col` (card de detalhe),
    dois cards separados lado a lado. KPIs (`#orcKpiGrid`) seguem acima.
  - O painel de detalhe reusa os estilos `.ap-*` (escopados a `.al-painel`):
    o `<aside id="orcPainel">` leva **as duas classes** (`ch-detail-col
    al-painel`) e um override (`.ch-detail-col.al-painel`) dá o visual de card
    do padrão Chamados mantendo o padding/scoping do painel. Nenhum JS mudou —
    todos os IDs preservados (`orcTableBody`, `orcPainel`, `orcBusca`,
    `orcFiltroCondo`, `orcCt*`, `orcEmpty`).
  - Removidos o `<h2>` "Solicitados pelos técnicos" + hint de dentro do card
    (a aba principal já rotula o modo), para ficar igual a Chamados.

- **2026-07-24** — **Mapa: painel lateral do condomínio (3 ajustes)**
  - **Botão "Abrir Painel" removido** do cabeçalho do painel lateral (HTML +
    handler + referências no `_mpAtualizarPainel` + CSS órfão de fullscreen).
    Abrir o drawer completo pelo mapa deixou de existir; o painel lateral já
    traz o essencial.
  - **Aba Reservatórios:** lista texto (nome + `%`) trocada por **grade de
    ícones de tanque SVG** reusando `_telTanqueSVG(pct, offline)` da Telemetria
    (novo `.mp-tank-grid`/`.mp-tank-cell`/`.mp-tank-visual`/`.mp-tank-nome`).
    O `%` já aparece dentro do tanque; nome do reservatório abaixo. **Clicar
    num tanque** leva pra aba **Telemetria já filtrada** pelo condomínio
    escolhido (`_mpIrParaTelemetria` → `showSection('telemetria')` +
    `telFiltroCondominio`). Ícone maior e card com hover (cursor pointer).
  - **Aba Bombas:** passa a listar **apenas reservatórios com `limiar_bomba`
    cadastrado** (sem limiar não há como inferir o estado da bomba com
    confiança). Backend: `GET /admin/status` agora inclui `limiar_bomba` no
    objeto de cada reservatório.

- **2026-07-23** — **Dashboard e Telemetria: ajustes de layout**
  - **Dashboard:** removido o card "IA Insights" (linha inferior) — mostrava
    insights derivados genéricos ("IA pronta 24/7" etc.), baixo valor. A linha
    ficou com 2 colunas (Conversas + Telemetria ao vivo). Removidos HTML, o
    render `renderMcIaInsights` e todo o CSS `.mc-ia*`/`.mc-brain*`.
  - **Telemetria — layout (mockup):** linha principal = card "Reservatórios
    monitorados" (esq) + coluna direita com "Reservatórios Críticos" +
    **"Últimos Eventos"** (feed derivado de leituras/alertas/offline). Cada
    reservatório virou **card horizontal detalhado** (tanque SVG volumétrico +
    `%` grande + badge Online + barra + nível + metadados última leitura/bomba/
    device). KPIs mantidos (só a distribuição mudou).
  - **Histórico de Níveis** virou **modal** (abre ao clicar num tanque / no
    ícone de gráfico), em vez de card fixo — não ocupa altura na página.
  - **Histórico (no modal):** título com o nome do reservatório clicado; linhas
    de limiar (baixo 45% / crítico 20%, os mesmos `TEL_LIMIARES` dos tanques)
    como anotações; chips de estatística (atual / mín / méd / máx em mono);
    range 24h–60d, selects de condomínio/reservatório e export PDF; fecha no
    X / backdrop / Esc. Gráfico com altura fixa (300px).

- **2026-07-23** — **KPIs unificados em todas as abas (estilo único)**
  - Só frontend. Os cards de KPI (`.rc`) de todas as seções — Dashboard,
    Telemetria, Chamados, Alertas, Orçamentos, OS, Contratos, Planos, Clientes,
    Mapa — passaram a compartilhar **um estilo único**: card neutro (mesma
    borda, sem glow colorido `::before`), **número grande em mono** e a cor
    semântica (ok/warn/bad/neutral) carregada **só pelo ícone**.
  - Feito no CSS base (`.rc-value` + bloco de variantes `.rc-*`), sem precisar
    editar as ~9 funções de render — todas já emitiam a mesma estrutura
    (`.rc-head > .rc-icon + .rc-label` + `.rc-value`). Cards clicáveis
    (Dashboard) mantêm o hover; os estáticos usam `rc-static`.
  - **Dedup do markup:** as ~8 cópias locais do helper `kpi()` (uma por seção)
    + `resumoCard` passaram a delegar pra um único `kpiCard()` — fonte única do
    HTML do card. Sem mudança visual, só remove a duplicação (que era o risco de
    os cards divergirem de novo).
  - Motivação: os KPIs tinham fundos/bordas/valores coloridos que variavam
    entre abas (e dentro da mesma aba), destoando entre si. Alinha com a
    estética "sem gradientes chamativos, mono pra dados técnicos".

- **2026-07-23** — **Telemetria: redesign da aba (tanques SVG no lugar do bar chart)**
  - Só frontend (`public/admin.html`, `admin.css`, `admin.js`) — nenhum
    endpoint ou lógica de backend mudou. Bar chart ApexCharts do card "Níveis
    dos Reservatórios" **removido** (a lib segue no Histórico de Níveis).
  - **Grade de caixas d'água cilíndricas em SVG**, uma por reservatório:
    corpo com elipses topo/base, água preenchendo de baixo p/ cima com elipse
    de superfície, `%` grande em mono, ticks 25/50/75/100, cor por faixa
    (azul normal / âmbar baixo / vermelho crítico). Componente reutilizável
    `_telTanqueSVG(pct, offline, thresholds)`; faixas alinhadas aos limiares
    de alerta do backend (`nivelFromPct`: crítico `<20`, baixo `<45`) e
    passadas como parâmetro (`TEL_LIMIARES`). Grid responsivo
    `minmax(160px, 1fr)`; **modo compacto** (sem elipse de superfície nem
    rótulos de tick) via `@container` quando o tile fica estreito.
  - **Clicar num tanque** seleciona o reservatório no card "Histórico de
    Níveis" (`_telSelecionarNoHistorico`) e rola até ele.
  - **KPIs padronizados** (escopado a `.tel-kpi-grid`): mesmo fundo/borda
    neutros, só o ícone com cor semântica, número em mono. "Bombas ativas"
    exibe **0** em vez de traço quando nenhuma bomba ligada.
  - **"Reservatórios Críticos"** vazio: empty state compacto com ícone de
    check + texto secundário (antes ocupava altura fixa de 360px).
  - **Selects nativos** dos filtros (topo + Histórico) viraram custom dark
    (chevron SVG próprio), consistentes com a aba Relatórios.
  - **Fusão dos cards "Níveis" + "Reservatórios":** a tabela de reservatórios
    era redundante com os tanques (nome, condomínio, bomba, nível, atualização).
    Removida; as ações de admin (Editar / Nova Key / Excluir) viraram ícones
    em cada tanque (`.tel-tank-actions`, só master) e o "+ Novo" foi pro header
    da grade. Clique de seleção isolado em `.tel-tank-hit` pra não conflitar
    com os botões de ação. Histórico passou a ocupar a largura toda.
  - **"Ver todos":** botão no header abre overlay em tela cheia com todos os
    tanques (respeitando os filtros), fecha no X / backdrop / Esc / ao
    selecionar um tanque.
  - As classes `.tel-bombas-*` / `.tel-bomba-*` foram **mantidas** no CSS: o
    painel do cliente (`cliente.html`/`cliente.js`, que carrega `admin.css`)
    ainda renderiza a tabela.
  - Cache bump: `admin.css?v=134`, `admin.js?v=224`. Sem `sw.js`.
  - Unificação global dos KPIs feita em seguida (marco separado acima).

- **2026-07-23** — **Relatórios: redesign da aba (card único de exportação + painel colapsável)**
  - Só frontend (`public/admin.html`, `admin.css`, `admin.js`) — nenhum
    endpoint, coluna de CSV ou lógica de backend mudou.
  - Os 3 cards de exportação (Chamados/Alertas/Telemetria), que repetiam o
    mesmo formulário, viraram **1 card "Exportar relatórios"** com segmented
    control por tipo. De/Até/Condomínio são filtros comuns fixos; só os
    específicos trocam por tab. Um único botão "Exportar CSV" primário.
  - **Chips de preset** de período (7 dias, 30 dias, este mês, mês anterior)
    acima dos date pickers; editar a data na mão desmarca o chip.
  - **Selects e date inputs custom** (`appearance:none` + chevron/calendário
    SVG próprios, datas em monospace) — some o controle nativo claro que
    quebrava o tema escuro. Escopados sob `.filter-bar` só na aba Relatórios.
  - **Painel ao vivo colapsável:** sem chamados em risco nem técnicos com
    abertos, colapsa numa linha "Tudo operacional — 0 em risco · 0 abertos"
    (com toggle pra expandir). Empty states com ícone + texto secundário no
    lugar de célula de tabela vazia.
  - Cache bump: `admin.css?v=133`, `admin.js?v=223`. Sem endpoint novo → não
    mexe em `sw.js`/`register-sw.js`.

- **2026-07-23** — **Chamado automático no alerta de nível baixo/muito baixo**
  - `POST /telemetria` agora abre chamado automaticamente (via
    `abrirChamadoAuto`, `src/services/chamados.service.js`) quando o alerta
    de nível baixo/muito baixo é novo, além do e-mail já existente.
    Categoria `nivel_baixo`, prioridade `p3` (baixo) / `p2` (muito baixo).
  - Dedup por `condominio_id + categoria`: nunca abre um 2º chamado
    enquanto já existir um aberto — se o nível piora de baixo pra muito
    baixo com o chamado ainda aberto, só escalona a prioridade.
  - Sem migration nova (categoria `nivel_baixo` já existia desde a 002).

- **2026-07-22** — **Planos de manutenção: seleção em massa (ativar/desativar vários de uma vez)**
  - Motivação: reativar planos inativos só dava pra fazer um por um (abrir
    modal de edição, marcar "Plano ativo", salvar, repetir).
  - Checkbox por linha + "selecionar todos" no cabeçalho da tabela; barra de
    ações aparece quando 1+ planos estão marcados, com "Ativar
    selecionados" / "Desativar selecionados" / "Limpar seleção".
  - Backend: nova rota `PATCH /planos-manutencao/bulk` (`{ ids, ativo }`,
    até 500 ids por chamada, `UPDATE ... WHERE id = ANY($1)` — uma query só).
  - Seleção é limpa ao trocar de aba (Todos/Vencidos/Vencendo/Em dia/Inativos)
    pra evitar confusão com itens selecionados fora de vista.
  - `admin.css?v=131`, `admin.js?v=221`, `register-sw.js?v=29`, `sw.js`
    `CACHE_NAME` → `telemetria-v38`.

- **2026-07-22** — **Relatórios: painel ao vivo + exportação CSV (fim do dashboard de gráficos)**
  - Motivação: a aba Relatórios (3 abas — Chamados, Reservatórios, Dashboard
    SLA — cada uma com KPI cards + ~10 gráficos ApexCharts) tinha ficado
    confusa de usar. Decisão: manter só o que é estado operacional "agora"
    num painel ao vivo, e deixar toda análise histórica pra fora do app via
    CSV (Excel/planilha).
  - Nova estrutura: card **Painel ao vivo** (chamados em risco de estourar
    SLA + workload por técnico, sem filtro de período) + 3 cards **Exportar**
    (Chamados / Alertas / Telemetria) — cada um só com os filtros de sempre e
    um botão "Exportar CSV" (sem gráfico/preview na tela).
  - Backend (`src/routes/relatorios.routes.js`): nova rota `GET
    /relatorios/painel-vivo`; `GET /relatorios/chamados` passa a incluir
    `primeira_resposta_em` e `tempo_resolucao_seg` (colunas cruas pra dar pra
    montar TTFR/TTR/conformidade de SLA numa tabela dinâmica do Excel).
    Removidas as rotas `/pdf-chamados`, `/insights`, `/sla-metricas` e
    `/sla-dashboard` — as duas primeiras (`/insights`, e o link "Ver análise
    completa" do Mission Control) já estavam órfãs, sem nenhum HTML
    conectado; `/sla-dashboard` foi substituída pelo painel ao vivo +
    exportação CSV; `/pdf-chamados` (e `src/services/relatorio-pdf.service.js`,
    seu único consumidor) saiu porque CSV cobre a necessidade de análise —
    apagado.
  - Frontend: `public/admin.html`/`admin.js` — ~1240 linhas de estado, KPI
    cards, gráficos ApexCharts e troca de abas trocadas por um módulo enxuto
    (`renderRelatorios`, `_relCarregarPainelVivo`, `_relToCsv`,
    `_relBaixarCsv`, `_relExportarCsv`). CSV usa `;` como separador e BOM
    UTF-8 (Excel PT-BR usa `,` como separador decimal).
  - `admin.css?v=130`, `admin.js?v=220`, `register-sw.js?v=28`,
    `sw.js` `CACHE_NAME` `telemetria-v37`.

- **2026-07-03** — **Assinatura de contratos: código de verificação + protocolo auditável**
  - Fecha 3 pontos fracos do fluxo próprio de assinatura por e-mail (migration 056):
    até então, só o link (sem 2FA) já bastava pra assinar, e o PDF final não
    trazia nenhuma evidência (IP/data-hora/hash) — só ficava no banco.
  - Migration 063 (ver acima). `src/services/email.js`: `sendAssinaturaCodigo`.
  - `src/routes/assinatura.routes.js`: `GET /assinar/:token` agora sempre passa
    por uma tela de código antes do formulário; novas rotas `POST
    /:token/verificar-codigo` (máx. 5 tentativas, emite `verify_token` JWT de
    15 min) e `POST /:token/reenviar-codigo` (cooldown 60s, rate limit por IP).
    O `POST /:token` final exige o `verify_token` — sem ele, quem só tem o link
    não completa a assinatura.
  - `src/services/contrato-pdf.service.js`: bloco de assinatura passa a
    imprimir data/hora completa, IP e protocolo (hash) de cada parte, mais uma
    nota explicando a base legal (MP 2.200-2/2001, art. 10 §2º) e o método de
    verificação usado.

- **2026-07-01** — **Orçamento avulso — tipo de serviço (limpeza de reservatório / dedetização)**
  - Migration 060: `orcamentos.tipo` (`pecas` default | `limpeza_reservatorio` |
    `dedetizacao` | `limpeza_dedetizacao`), com CHECK. Mesma tabela
    `orcamentos`/`orcamento_linhas`, mesmo timbrado — mas o PDF ramifica pra
    um layout diferente conforme o tipo.
  - Backend (`src/routes/admin.routes.js`): rotas `POST`/`PATCH
    /admin/orcamentos/avulsos[/:id]` aceitam e validam `tipo`; `GET` retorna
    junto na listagem.
  - PDF (`src/services/orcamento-pdf.service.js`): `tipo === 'pecas'` mantém
    o fluxo original (tabela de itens, paginação two-pass via Puppeteer,
    zero mudanças). Para os 3 tipos de serviço, novo caminho
    `_gerarPdfServico`/`renderHTMLServico` — descritivo por **cláusulas**
    (Objeto / Escopo dos Serviços / Normas e Garantia, fixas por tipo em
    `clausulasLimpezaReservatorio()`/`clausulasDedetizacao()`), texto fluindo
    naturalmente entre páginas via `headerTemplate`/`footerTemplate` do
    Puppeteer (mesmo esquema de timbrado fatiado que `contrato-pdf.service.js`
    já usava — sem paginação manual). No combo, os dois blocos de cláusulas
    aparecem em sequência ("Serviço 1"/"Serviço 2"). Seção final "Valores dos
    Serviços" lista cada linha (descrição + valor) e soma o total — valores
    continuam separados por serviço, fora do texto das cláusulas.
  - Margem do timbrado recalibrada medindo os pixels reais de
    `papel-timbrado.png` (logo termina a ~36mm do topo, endereço do rodapé
    começa a ~22,5mm do fundo): header/footer ajustados de `42mm`/`40mm`
    (valor copiado do contrato, sem checar contra a imagem) pra `38mm`/`25mm`
    — corrige um vão em branco visível no fim da página 1 antes do rodapé
    quando o conteúdo (ex.: combo com 6 cláusulas) empurrava a seção de
    valores inteira pra página seguinte por falta desse espaço.
  - Especificação do reservatório (quantidade, superior/inferior etc.): campo
    "ficha técnica" da linha de reservatório virou editável na tabela e é
    inserido como parágrafo extra na Cláusula Primeira quando preenchido —
    vazio, mantém o texto padrão sem nenhuma mudança.
  - Removida a distinção Qtd/Valor Unit. da tabela de valores pra tipo de
    serviço (não faz sentido "quantidade × unitário" pra um serviço) — fica
    só "Valor", já como total daquele serviço. `quantidade` continua fixo em
    1 no banco, nunca exposto na UI pra esses tipos. Tabela muda de formato
    ao vivo conforme o "Tipo de orçamento" selecionado, antes de salvar.
  - Migration 061: `orcamentos.data_documento DATE` — campo "Data do
    orçamento" editável no modal, ao lado de "Válido até"; se vazio, o PDF
    continua usando `criado_em` como sempre.
  - Removido o formulário livre "+ Adicionar item" pra tipo de serviço (um
    item digitado à mão ali não gera cláusula no PDF, só um valor solto) —
    sobra só "+ Preencher item(ns) padrão do tipo" e o botão de remover linha.
    Tipo `pecas` mantém o formulário normalmente.
  - Seção "Valores dos Serviços" voltou a ser atômica (`page-break-inside:
    avoid` no bloco título+caixa+total) — nunca mais quebra no meio entre
    páginas. Só fazia sentido remover esse `avoid` quando a margem do rodapé
    estava errada (40mm em vez de 25mm) e desperdiçava espaço; recalibrada a
    margem, o vão que sobra ao empurrar a seção inteira pra página seguinte é
    pequeno o bastante pra valer a pena nunca quebrar a tabela.
  - Removido o botão manual "+ Preencher item(ns) padrão do tipo": a(s)
    linha(s) de valor do serviço agora são adicionadas automaticamente ao
    trocar o "Tipo de orçamento" (`_avPreencherPadrao`, `change` do
    `#avInputTipo`), com deduplicação por descrição pra não duplicar nem
    apagar nada ao alternar entre tipos. Roda também ao abrir um orçamento de
    serviço salvo sem nenhuma linha (dado legado). Corrigida uma corrida
    (trocar o tipo rápido demais duplicava a linha) com `_avLinhasPromise` +
    `_avPreencherPadraoAtivo`.
  - Modal de orçamento avulso compactado (`#avModal` em `admin.css`, escopado
    só nele): campos do topo e Condições Comerciais viraram uma linha só cada
    (eram 2), Constatação encolheu, padding reduzido — cabe em 1280×720 sem
    precisar rolar. Reajustado em seguida (ficou apertado demais na primeira
    versão) e corrigido um `margin-top:4px` inline redundante nos `<select>`
    do modal que desalinhava a linha do topo (ex.: "Data do orçamento" vs
    "Tipo de orçamento").
  - PDF de peças: fontes aumentadas de novo (primeira leva ficou parecida
    demais com o corpo do PDF de serviço — que usa 11px de base — e não deu
    pra notar diferença). Valores finais: Constatação (`.constata-text`)
    13.5px, descrição do item (`.it-desc-text`, agora `font-weight:700`)
    12px, títulos de seção (`.sec-title` — Constatação/Itens/Condições
    Comerciais) 9px→11px, badge numerado (`.sec-num`) 8px→9px, cabeçalho da
    tabela (`.tabela-itens th`) 8.5px→10px, corpo da tabela (`.tabela-itens`)
    9.5px→11px, ficha técnica (`.ficha`) 8.5px→9.5px — títulos cresceram
    junto pra manter a hierarquia (título > conteúdo). Mudança espelhada em
    `renderHTML` e `renderMeasureHTML` (a paginação two-pass precisa medir
    com o mesmo CSS do render final, senão desalinha).
  - Mesma leva, PDF de peças: data no topo (`.doc-date`) 9px→11px, nome do
    cliente (`.cliente-nome`) 12px→14px, razão social/CNPJ/endereço
    (`.cliente-det`) 9px→11px, condições comerciais (`.cond-item`/valores)
    9.5px→11.5px e labels (`.cond-key`) 8.5px→10px. Só o template de peças —
    o de serviço (`renderHTMLServico`) ficou com os tamanhos originais, não
    foi pedido.
  - Ajuste de hierarquia: os títulos de seção (`.sec-title` — Cliente/
    Constatação/Itens/Condições Comerciais) tinham ficado *menores* que o
    próprio conteúdo (11px de título vs 13.5px da Constatação, 12px da
    descrição do item) — só pareciam maiores por causa do negrito/maiúsculo/
    borda. Corrigido para 15px (`.sec-title` e `.cliente-box .sec-title`),
    maior que qualquer conteúdo da seção; badge numerado (`.sec-num`)
    9px→10px. Espelhado em `renderHTML` e `renderMeasureHTML`.
  - Admin (`public/admin.js`/`admin.html`, `?v=202`/`?v=121`): seletor "Tipo de
    orçamento" no modal de orçamento avulso; seção "Itens" vira "Valores dos
    Serviços" quando `tipo !== 'pecas'`; botão "+ Preencher item(ns) padrão do
    tipo" adiciona apenas a linha de valor (descrição + valor unitário) — o
    texto técnico não vem mais de input do admin, é fixo no PDF. No combo as
    duas linhas entram separadas, cada uma com seu valor. Badge de tipo na
    lista de orçamentos avulsos.

- **2026-07-02** — **Orçamento de peças — valor unitário opcional + total manual**
  - Migration 062: `orcamento_linhas.valor_unitario` deixa de ser `NOT NULL
    DEFAULT 0` — vira nullable, sem default. Item sem preço lançado agora fica
    `NULL` de verdade, em vez de virar `0` silenciosamente.
  - PDF (`src/services/orcamento-pdf.service.js`, `renderHTML` — tipo `pecas` —
    e `renderHTMLServico`): item com `valor_unitario == null` mostra "—" nas
    colunas Valor Unit./Total em vez de "R$ 0,00" (`fmtMoeda` já tratava
    `null` como "—", só faltava parar de coagir pra `0` antes de chegar lá).
    `totalGeral` passa a usar `orcamentos.valor` como override manual quando
    preenchido; senão soma os itens como antes (itens sem valor não entram na
    soma).
  - `orcamentos.valor` (coluna que já existia, herdada do fluxo antigo de
    aprovação por O.S.) virou também o campo de "Valor total (manual)" do
    orçamento avulso — não foi criada coluna nova pra isso.
  - Backend (`src/routes/admin.routes.js`): rotas de item (`POST`/`PATCH
    /admin/orcamentos/:os_id/itens`, `.../avulsos/:id/linhas`,
    `.../avulsos/linhas/:linha_id`) aceitam `valor_unitario` vazio/`null` sem
    coagir pra `0`. `PATCH /admin/orcamentos/avulsos/:id` ganhou o campo
    `valor` (override manual, `null` volta a somar os itens). As 3 queries que
    calculavam `valor_total` por `SUM(quantidade * valor_unitario)` (listagem,
    envio de e-mail, histórico do condomínio) passaram a fazer
    `COALESCE(o.valor, SUM(...), 0)`.
  - Admin (`public/admin.js`, `?v=212`): campo "Valor total (manual)" no modal
    de orçamento avulso, abaixo da tabela de itens — vazio usa a soma
    automática. Inputs de "Unit." aceitam ficar em branco (antes só permitiam
    número ≥ 0, forçando `0`). Label da soma dos itens mostra aviso quando o
    valor manual está ativo e vai sobrepor no PDF.
  - Ficha técnica com múltiplas linhas na edição de item já existente (`?v=213`):
    o campo, na tabela de itens do modal avulso, era um `<input type="text">`
    de uma linha só — trocado por `<textarea rows="2">` (mesmo padrão já usado
    no formulário "+ Adicionar item"). O PDF já suportava múltiplas linhas
    (`.replace(/\n/g, "<br>")` em `orcamento-pdf.service.js`); só faltava dar
    pra digitar depois que o item já existia.

- **2026-06-17** — **Admin — Seção dedicada de Contratos**
  - Nova seção `data-section="contratos"` na sidebar entre Orçamentos e Planos.
  - **Tabela completa** com colunas: Cliente, Serviço, Periodicidade, Valor/mês, Início, Vencimento, Status.
  - **Filtros:** 4 abas de status (Todos/Ativos/Vencendo/Vencidos) + select de tipo de serviço (Bombas/Piscina) + busca por nome do cliente.
  - **KPIs:** 4 cards no topo (Ativos, Vencendo em 30d, Vencidos, MRR total).
  - **Badge na sidebar** mostra contagem de contratos vencendo + vencidos.
  - **"+ Novo contrato"** abre picker de cliente (mini-modal av-modal com busca em `_condominios`) → chama `_ctrAbrirModal({ condoId })`.
  - **Clique em linha** abre o modal de edição existente (`_ctrAbrirModal({ condoId, contratoId })`).
  - **Refresh automático:** após salvar/encerrar contrato, a seção recarrega se estiver ativa.
  - Funções JS: `_ctrsCarregar`, `_ctrsRender`, `_ctrsRenderKpi`, `_ctrsGetStatusKey`, `_ctrsAbrirPicker`, `_ctrsBindEventos`.
  - `public/admin.html` + `public/admin.js?v=183`.

- **2026-06-17** — **PDF de orçamento — paginação por medição real (Puppeteer two-pass)**
  - **Problema original:** `estimarMmTexto()` estimava a altura do cabeçalho por contagem de caracteres; errava ±1-2 itens por página e criava espaço branco visível abaixo dos itens.
  - **Problema raiz descoberto na sessão:** `padding-bottom` estava em 49mm (pág 1) / 45mm (pág 2+), mas o endereço do timbrado fica apenas ~22mm do fundo. O excesso de ~24mm era o espaço branco que aparecia entre o último item e o endereço.
  - **Solução implementada em `src/services/orcamento-pdf.service.js`:**
    1. **Passagem 1 (medição):** viewport 794px, `renderMeasureHTML()` renderiza cabeçalho + elementos de calibração (sec-title+thead da seção de itens, linha de item com e sem ficha). `page.evaluate()` extrai 5 alturas em px; converte para mm via `MM_PER_PX = 25.4/96`.
    2. **Passagem 2 (PDF final):** `renderHTML(dados, areaP1, medidas)` usa valores medidos: `ohP1` (overhead seção itens pág 1), `ohPn` (pág 2+), `mmItemBase`, `mmItemFicha1`. `paginar()` calcula `rowsP1 = areaP1 - ohP1` e `mmItem = mmBase + fichaLines * mmFicha1` — zero estimativas.
  - **`padding-bottom` corrigido:** 49mm → 25mm (pág 1), 45mm → 25mm (pág 2+). `pagina-body` agora tem **244mm** (pág 1) e **224mm** (pág 2+). `AREA_P2 = 224mm`. `areaP1 = 244 - headerMm`.
  - Overhead medido **sem** `margin-bottom` do `.sec` (2.1mm de cauda clipada pelo `overflow:hidden` não deve penalizar a contagem de itens).

- **2026-06-16** — **PDF de orçamento — paginação manual com papel timbrado**
  - **Abordagem adotada:** paginação manual com `<div class="pagina">` de `210mm × 297mm` com timbrado como `background-image` inline. Abandona `headerTemplate/footerTemplate`, `position:fixed` e `@page background-image` — todas incompatíveis com Puppeteer 24 de forma confiável.
  - **Algoritmo de paginação:** constantes `MM_ITEM=7`, `AREA_P1=108`, `AREA_P2=185`, `MM_RODAPE=50`. Página 1 tem cabeçalho fixo (doc-info + cliente + constatação) + até 15 itens; páginas seguintes têm até 26 itens; última página adiciona total + condições comerciais.
  - **Primeira página:** `padding-top: 28mm; padding-bottom: 49mm` (classe `.pagina--primeira`). Demais páginas: `padding: 48mm 20mm 45mm 20mm` — alinha o início do conteúdo com a caixa de clientes da página 1 visualmente.
  - **Fontes:** base 10px; títulos de seção 9px; tabela de itens 9.5px; total 12px; condições 9.5px.

- **2026-06-15** — **Contratos — assinatura digital via ZapSign + animation sidebar**
  - **Sidebar — animação corrigida e acelerada:** `contain: layout paint` removido do `.sidebar`; choreografia redesenhada: labels e seções fade-first no fechar / geometry-first no abrir. Classe `is-animating` desabilita `backdrop-filter: blur()` via JS durante a transição (~220ms) — eliminava jank de GPU. `admin.css?v=117`, `admin.js?v=179`.
  - **Trusted devices — texto corrigido:** "30 dias" removido de `login.html` e `admin.html` (expiração é indefinida/NULL).
  - **Email OTP separado:** `src/services/email.js` adiciona `_emailFromOTP()` que lê `SMTP_FROM_OTP` → OTP usa remetente separado do fluxo de orçamentos.
  - **Módulo de Contratos + ZapSign** — integração completa de assinatura digital:
    - `migrations/054_contratos_zapsign.sql` — 12 novas colunas na tabela `contratos`.
    - `src/services/contrato-pdf.service.js` — gera PDF com papel timbrado (Puppeteer), 11 cláusulas, página de assinaturas. Mesmo padrão dos orçamentos.
    - `src/services/zapsign.service.js` — `criarDocumento`, `buscarDocumento`, `mapStatus`; usa `ZAPSIGN_API_TOKEN`.
    - `src/routes/contratos.routes.js` — 4 novos endpoints: `GET /:id/pdf`, `POST /:id/enviar-assinatura`, `GET /:id/status-assinatura`, `POST /webhook/zapsign`.
    - `public/admin.html` — modal de contrato expandido: campos de signatários, descrição dos serviços, painel de assinatura com links de cliente/General Bombas, badge de status, botões PDF/Enviar/Status.
    - `public/admin.js?v=179` — `_ctrAbrirModal`, `_ctrSalvar`, `_ctrEncerrar` atualizados para novos campos; novas funções `_ctrEnviarAssinatura`, `_ctrAtualizarStatus`, `_ctrAtualizarBadge`.
  - **Pendente:** aplicar migration 054 em produção (`node scripts/migrate.js 054_contratos_zapsign.sql`) + adicionar `ZAPSIGN_API_TOKEN` no Railway.

- **2026-06-15** — **App mobile — correções de crash e UX no APK Android**
  - **Crash no primeiro login corrigido:** `NativeGpsService.LocalBinder.configure()` chamava `startForeground()` na binder thread sem try-catch. Exceções Java (ex.: `SecurityException` por permissão de localização ainda não concedida em runtime) escapavam para o processo e derrubavam o app silenciosamente. Solução: envolvido em `try-catch(Exception)` com log; erros são absorvidos sem matar o processo.
  - **`NativeGpsPlugin.start()` protegido:** bloco try-catch adicionado ao método `start()` do plugin para que qualquer exceção inesperada seja convertida em `call.reject()` em vez de crash.
  - **Permissões obrigatórias adicionadas ao `AndroidManifest.xml`:** `FOREGROUND_SERVICE` (exigida desde Android 9 / API 28) e `FOREGROUND_SERVICE_LOCATION` (exigida desde Android 14 / API 34 quando `foregroundServiceType="location"` está declarado). A ausência dessas permissões causava `SecurityException` no `startForeground()`.
  - **`requestBatteryExemption` com try-catch:** `NativeGpsPlugin.requestBatteryExemption()` agora envolve `startActivity(intent)` em try-catch — previne `ActivityNotFoundException` em ROMs que não suportam `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (ex.: MIUI, OneUI).
  - **Chip GPS "Fora do expediente" corrigido:** `gpsRenderChip()` mostrava "Fora do expediente" sempre que `GPS.active = false`, mesmo dentro do horário (08h–18h). Ocorria durante a inicialização assíncrona do GPS. Corrigido: o ramo `else` agora verifica `gpsDentroDoHorario()` — fora do horário mostra "Fora do expediente", dentro do horário mostra "GPS aguardando…".
  - **Chip GPS demora para atualizar para "GPS ativo" corrigido:** `_gpsAbrirWatch()` é async, mas `_gpsAplicarJanela()` chamava `gpsRenderChip()` sem await, antes de `GPS.active = true` ser setado. Adicionado `gpsRenderChip()` imediatamente após `GPS.active = true` nos três caminhos (NativeGps, BgGeo, watchPosition).
  - **Auto-login com retry:** IIFE de inicialização agora tenta `/auth/me` até 2 vezes com 2s de espera entre tentativas — cobre casos de rede instável logo após cold start do app.

- **2026-06-10** — **Melhorias de UX — admin e app mobile**
  - **Admin — modal de O.S. redesenhado:** layout flat com `os-vsec-title` (uppercase, muted, border-bottom) em vez de cards com borda. Grade de 2 colunas para Identificação + Check-in e Itens + Correntes. `admin.css?v=113`, `admin.js?v=174`.
  - **Admin — novo chamado:** wizard de triagem Q1-Q3 substituído por seletor direto de 4 cards (P1/P2/P3/P4 com cor, nome e prazo). P3 selecionado por padrão. `admin.js?v=173`.
  - **Admin — atribuir técnico (mapa):** select filtrado só por `cargo=tecnico`. Feedback visual ao atribuir: botão "Salvando…" → "✓ Atribuído". Estado persistente "Técnico: Nome [Alterar]" com botão para editar. `admin.js?v=176`.
  - **Hard delete de condomínio corrigido:** `DELETE FROM alerta_comentarios WHERE chamado_id` → `WHERE alerta_origem='chamado' AND alerta_id` (coluna não existia; causava 500 em condomínios com comentários de alerta).
  - **App mobile — card de mensagens:** oculto quando não há mensagens (antes mostrava "Nenhuma mensagem" mesmo sem o cliente ter escrito).
  - **App mobile — fluxo de atendimento simplificado:** botão "Chegou ao local" removido. "Iniciar atendimento" registra a chegada automaticamente via `POST /chegou` para SLA antes de chamar `/iniciar-atendimento`.
  - **App mobile — tela de assinatura:** ícone flutuante `#tcFooterGps` ocultado ao abrir o overlay fullscreen; restaurado ao fechar.
  - **App mobile — crash GPS no Android 14:** `_gpsAbrirWatch()` agora verifica `navigator.permissions.query({name:'geolocation'})` antes de chamar `NativeGps.start()`. Se `state === 'denied'`, define `GPS.lastError = 1` e chama `gpsRenderAviso()` sem acionar o plugin nativo — evita a `SecurityException` da camada Java que derrubava o app inteiro quando o técnico negava permissão de localização.
  - **App mobile — foto na O.S. (chooser câmera/galeria):** dois inputs hidden separados (`capture="environment"` para câmera, sem capture para galeria) acionados por bottom sheet (`_mostrarFotoChooser`) — resolve Android WebView abrindo direto a galeria sem oferecer câmera. Botão exibe "Enviando…" durante upload (`_uploadFotoFile`). Compressão reduzida para 1200px/72% (antes 1600px/75%). `comprimirFoto` agora rejeita com `Error` em vez de `ProgressEvent`, eliminando `err.message === undefined` na mensagem de erro.

- **2026-06-10** — **Fotos de OS persistidas no banco de dados**
  - `os_fotos.dados_base64 TEXT` adicionado (migration 053).
  - Upload (`POST /ordens-servico/:id/fotos/upload`) salva o conteúdo base64 no banco em vez de gravar em disco.
  - Novo endpoint público `GET /ordens-servico/:osId/fotos/:fotoId/imagem` serve a imagem a partir do banco — compatível com `<img src="...">` sem header de auth.
  - URL armazenada na coluna `url` agora aponta para esse endpoint (`/ordens-servico/{osId}/fotos/{fotoId}/imagem`).
  - PDF (`os-pdf.service.js`): `fotoToDataUrl` usa `dados_base64` do row; fallback para disco (registros legados).
  - `GET /ordens-servico/:id` exclui `dados_base64` da query de fotos para não inflar respostas.
  - **Motivo:** Railway usa sistema de arquivos efêmero — `uploads/` é apagado a cada deploy/restart, perdendo todas as fotos.

- **2026-06-10** — **GPS background no APK (Fase 7G-pre)**
  - Instalado `@capacitor-community/background-geolocation@1.2.26` em `app/`.
  - `ACCESS_BACKGROUND_LOCATION` adicionado ao `AndroidManifest.xml` (serviço foreground e demais permissões já declarados pelo plugin e mergeados via Gradle).
  - `_gpsAbrirWatch()` detecta `window.Capacitor.isNativePlatform()` e usa `BackgroundGeolocation.addWatcher()` quando no APK; fallback para `watchPosition` no browser/PWA.
  - `_gpsFecharWatch()` chama `BackgroundGeolocation.removeWatcher()` ao parar o GPS nativo.
  - `GPS.bgWatcherId` adicionado ao estado. Toda lógica de horário (8h–18h), throttle, fallback de ping e chip de UI foi preservada — só o backend de captura mudou.

- **2026-06-08** — **GPS técnicos: indicador visual de pin desatualizado + remoção de "Top 5" redundante**
  - **Pin de técnico "stale":** pins no mapa (MC e Mapa) ficam cinza/opacos quando a última atualização GPS tem mais de 3 minutos. Função `_tecStale(capturadaEm)` + classe `.tec-pin.is-stale` (fundo cinza, sem animação pulse). Tooltip mostra "⚠ sem sinal (X min atrás)"; popup do Mapa exibe aviso em vermelho.
  - **"Top 5 condomínios" removido** da aba Chamados do Dashboard SLA — redundante com "Condomínios mais problemáticos" que já existe na mesma página.
  - **Hard delete de condomínio corrigido:** exclusão em cascata de chamados, OS, orçamentos, leituras, alertas, comentários, WhatsApp. `usuarios.condominio_id` recebe `SET NULL` (usuários não são deletados). `admin.js?v=147`, `admin.css?v=103`.

- **2026-06-08** — **App mobile (Capacitor): APK de teste gerado + correções**
  - **Projeto Android gerado** (`app/android/`) via `@capacitor/android@6.1.0`; permissões de GPS adicionadas ao `AndroidManifest.xml`.
  - **Ícone do app** gerado com `@capacitor/assets` a partir de `public/favicon.png` (74 arquivos — ícones adaptativos + splash em todas as densidades).
  - **`API_BASE` corrigido para Capacitor com `androidScheme: "https"`:** com esse scheme, `window.location.protocol` é `"https:"` (não `"capacitor:"`), então a detecção anterior falhava e todas as chamadas iam para `https://localhost` (interceptado pelo WebView). Fix: adiciona cheque `|| origin === "https://localhost"` em `app/public/app.js`.
  - **Chip GPS reposicionado no app mobile:** `.gps-chip` era `position: fixed; top: 10px` e sobrepunha o header com o nome do técnico. Corrigido para `top: calc(env(safe-area-inset-top, 0px) + 72px)` em `app/public/app.css`.
  - **Footer "GPS aguardando..." corrigido:** `watchPosition` atualizava `GPS.last` mas nunca `TC.geo`; o footer checava `TC.geo` para exibir "GPS ativo". Fix: sincroniza `TC.geo` a partir de `GPS.last` a cada fix válido do watch.
  - **`OTP_DISABLED` temporariamente sem guarda de prod** (`&& !isProd` removido em `src/routes/auth.routes.js`) para facilitar testes do APK. Reverter após testes.
  - Railway configurado para deployar branch `feature/app-mobile` (em vez da `main` desatualizada). `CORS_ORIGINS` precisa incluir `https://localhost`.

- **2026-06-05** — **GPS técnicos: correções de rota, feedback de sinal e UX**
  - **Conflito de rotas corrigido:** `tecnicosLocalizacaoRouter` agora registrado antes de `tecnicosRouter` em `src/app.js`. O `DELETE /:id` do router de CRUD interceptava `DELETE /tecnicos/localizacao` (logout), impedindo a remoção do pin ao sair.
  - **Endpoint `/tecnicos/me`** movido para `tecnicos-localizacao.routes.js` e **`DELETE /localizacao`** adicionado ao mesmo router (ficavam faltando).
  - **Filtro de precisão GPS com feedback:** posições com `precisao_m > 15 km` continuam bloqueadas (geolocalização por IP pura), mas agora disparam `GPS.lastError = "low_accuracy"`. O chip mostra "Sinal fraco" e o banner exibe mensagem orientando o técnico a ativar o GPS do celular. Antes o chip mostrava "GPS ativo" sem nenhum aviso.
  - **`maximumAge` revertido de 0 → 30 000 ms** — valor zero forçava fix GPS fresco a cada callback; em áreas com sinal ruim travava a emissão do primeiro ping.
  - **Ícone de pin de técnico unificado:** mapa do dashboard (Mission Control) e seção Mapa agora usam a mesma função `_tecPinIcon()` — círculo roxo 32×32 com glow e animação pulse. Antes o MC usava div inline amb
er sem animação.
  - **Botões de ações de usuários redesenhados** (Configurações → Usuários): três botões de texto ("Editar / Resetar senha / Remover") substituídos por ícones quadrados 28×28 px com tooltip nativo. Classe `.cfg-icon-btn` adicionada ao `admin.css`.
  - **`<meta name="mobile-web-app-capable">`** adicionado ao `app/public/index.html` (padrão atual, ao lado da tag Apple que permanece para iOS).
  - `admin.js?v=144`, `admin.css?v=102`.

- **2026-06-05** — **Ajustes de layout — painel de detalhes e lista ch-layout**
  - `.content` passou a ser flex container (`display: flex; flex-direction: column`) para propagar altura às seções filhas.
  - `.section.is-active` ganhou `flex: 1` — ocupa todo o espaço disponível no `.content`.
  - `.ch-layout` mudou de `align-items: stretch` para `align-items: flex-start`; `.ch-list-col` recebeu `align-self: stretch` explícito.
  - Resultado: lista (esquerda) vai até o fundo da página; painel de detalhes (direita) tem apenas a altura do conteúdo — pequeno quando vazio, cresce com o item selecionado.
  - Aplica a todas as telas com `.ch-layout`: Alertas, Chamados, Clientes, Colaboradores.
  - `admin.css?v=101`.

- **2026-06-05** — **Seção Técnicos → Colaboradores**
  - Migration 048: `tecnicos.cargo TEXT NOT NULL DEFAULT 'tecnico'` — valores: `tecnico | adm | gestor | ti`.
  - Nav/seção renomeada de "Técnicos" para "Colaboradores".
  - Tabs de filtro alteradas para cargo (Todos / Técnico / Adm / Gestor / TI).
  - Modal agora tem campo "Cargo" (select); "Especialidade" renomeada para "Especialidade / Função".
  - Tabela: coluna Cargo substituiu Telefone+Chamados; Status (disponível/ocupado) mostra apenas para técnicos.
  - Detalhe: seção "Chamados" e botão "Marcar disponível/ocupado" visíveis só para técnicos.
  - KPIs: Total colaboradores | Técnicos | Técnicos disponíveis | Chamados em aberto.
  - Backend: `GET /tecnicos` inclui `cargo`; `POST` e `PATCH` aceitam e persistem `cargo`.
  - `admin.js?v=124`.
  - **Rodar migration:** `node scripts/migrate.js 048_colaboradores_cargo.sql`.

- **2026-06-05** — **RBAC 3 tipos de login no painel admin**
  - Adicionados roles `gerente` e `operador` ao sistema.
  - **Gerente**: acesso total ao painel (todas as seções, escrita habilitada), porém em Configurações enxerga apenas a aba "Conta" (sem acesso a Usuários, IA, Notificações, Operacional, SLA, Manutenção, Integrações).
  - **Operador**: acesso restrito a Monitor (Dashboard, Telemetria, Mapa, Alertas) + Chamados + Configurações → "Conta". Seções ocultas: Atendimento (exceto Chamados), O.S., Orçamentos, Planos, Clientes, Técnicos, Relatórios.
  - Role `admin_viewer` mantido para compatibilidade retroativa (viewer-only-hide).
  - Arquivos alterados: `src/middleware/adminOnly.js`, `src/routes/auth.routes.js`, `src/routes/admin.routes.js`, `src/routes/ordens-servico.routes.js`, `src/routes/relatorio.routes.js`, `public/login.js`, `public/admin.js?v=123`, `public/admin.html`.
  - Card de criação de acesso no painel (Clientes) agora tem select de role (Gerente / Operador / Visualizador legado) em vez de criar sempre `admin_viewer`.


- **2026-06-04** — **Envio de orçamento por e-mail ao cliente.**
  - Novo endpoint `POST /admin/orcamentos/avulsos/:id/enviar-email` — gera o PDF
    (`gerarPdfAvulso`), anexa e envia via Resend (`sendOrcamentoCliente` em
    `src/services/email.js`), marca o orçamento como `enviado` e grava
    `enviado_em`/`enviado_para` (migration 047).
  - Destinatário vem de `condominios.email` (cadastro do cliente), que agora aceita
    **múltiplos e-mails separados por vírgula** (normalização/validação no
    `condominios.routes.js`; coluna virou TEXT). O modal de envio pré-preenche com
    esses e-mails e permite editar antes de confirmar.
  - Admin — modal de orçamento: botão **"Enviar por e-mail"** no footer + overlay de
    confirmação. Versões: `admin.css?v=99`, `admin.js?v=122`.
  - **Remetente padrão** alterado de `telemetria@generalbombas.com` para
    `comercial@generalbombas.com` (`_emailFrom` em `email.js`; vale para todos os
    envios — atualizar `SMTP_FROM` no ambiente para o mesmo valor).


- **Fase 2** — IA com function calling (gpt-4o-mini) atendendo no WhatsApp.
- **Fase 3** — Painel admin "Mission Control": dashboard, mapa Leaflet,
  /alertas unificada, central WhatsApp estilo CRM.
- **Fase 4–5** — Integração telemetria↔chamado automática; gestão de conversas.
- **Fase 6** — Hardening (envs obrigatórias, RBAC) + configurações dinâmicas.
- **Fase 7** — App mobile Capacitor (técnico + cliente), O.S. digital, GPS.
- **Fase 8** — Analytics e SLA (métricas TTFR/TTR, dashboard).
- **Fase 9** — Política de retenção (jobs de cleanup).
- **Fase 10** — Curadoria de conversas (10A) → few-shot/fine-tuning (pendente).
- **Fase 11** — Política de criticidade P1–P4 + SLA de chegada.
- **2026-05-28** — Migração do gateway WhatsApp Evolution → **Meta Business API**
  (código pronto, pendente configuração); remoção do role `master_admin`;
  Puppeteer singleton; ambiente limpo para deploy.
- **2026-06-03** — **PDF de orçamento: correção de dois bugs**
  - `buscarDadosAvulso` agora usa `COALESCE(nome_fantasia, nome)` — o PDF exibia
    a razão social mesmo quando havia nome fantasia cadastrado (regressão pós-migration 044).
    Quando os dois campos diferem, a razão social aparece como subtítulo no PDF.
  - Puppeteer args em `orcamento-pdf.service.js` e `os-pdf.service.js`: adicionados
    `--disable-gpu` e `--no-zygote`. Com Puppeteer v22+ (novo headless Chrome), ausência
    de `--disable-gpu` em containers sem GPU (Railway) derrubava o processo do Chrome.

- **2026-06-03** — **Remoção da aba "Contatos" do modal de cliente**
  - A aba "Contatos" no modal de edição de condomínio era exclusiva para pré-cadastro
    de números WhatsApp. Como o módulo WhatsApp ainda não está ativo, a seção
    gerava confusão (texto "A IA vai pedir identificação" sem contexto real).
  - Removidos: tab + pane no `admin.html`, modal `wcOverlay`, ~150 linhas de JS
    (`_cliContatosWppCache`, `_wcAbrirModal/Salvar/Remover`, `_editRenderTabContatos`,
    handlers `novo/editar-contato-wpp`), e 4 rotas backend
    `GET/POST/PATCH/DELETE /admin/whatsapp/contatos`.
  - Tabela `clientes_whatsapp` preservada no banco para quando o WhatsApp for
    ativado.

- **2026-06-03** — **Mapa: migração de tiles CartoDB → OpenStreetMap**
  - `_criarTileLayer` em `public/admin.js` trocado de
    `basemaps.cartocdn.com/dark_all` para `tile.openstreetmap.org`.
  - Tema dark mantido via `className: "map-tiles-dark"` + regra CSS
    `filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)`
    em `public/admin.css` — aplica só ao container de tiles (pane separado),
    marcadores e controles não são afetados.
  - Motivação: CartoDB retornava erros intermitentes (rate-limit silencioso em
    produção); o browser cacheava essas respostas de erro, causando mapa
    completamente em branco no F5. OSM é sem limites de taxa para uso normal
    e tem cobertura nativa até z=19.
  - Versões bumpeadas: `admin.css?v=81`, `admin.js?v=97`.

- **2026-06-02** — **Cadastro de clientes — Nome Fantasia e CNPJ persistido.**
  - Migration 044: coluna `nome_fantasia TEXT` em `condominios`.
  - Backend: `nome_fantasia` e `cnpj` incluídos em todos os endpoints
    (`POST /condominios`, `GET /condominios`, `GET /condominios/:id`,
    `PATCH /condominios/:id`) — antes o CNPJ era apenas buscado na BrasilAPI
    mas nunca gravado no banco.
  - Admin — modal "Novo cliente": redesenho em dois painéis horizontais
    (campos à esquerda em grid 2 colunas, mini-mapa à direita); modal
    ampliado para 1 100 px; campos Razão Social + Nome Fantasia lado a lado.
  - Admin — modal "Editar": campo "Razão Social" renomeado (era "Nome"); novo
    campo "Nome Fantasia"; `editCnpj` pré-preenchido com o valor salvo e
    incluído no payload do PATCH.
  - Painel lateral do cliente: CNPJ exibido formatado (`XX.XXX.XXX/XXXX-XX`)
    na seção Informações; nome fantasia como título principal com razão
    social como subtítulo quando ambos preenchidos; tabela e busca também
    usam `nome_fantasia` como nome primário.

- **2026-06-01** — **App mobile: camada visual HUD "Painel de comando"**
  (`app/public/app.css`, só mobile — não toca admin/site). Bloco aditivo no fim
  do CSS + 6 tokens `--hud-*` no `:root`. Grid técnico + scanline de fundo
  (estáticos), tipografia monospace nos dados
  (KPIs/timer/IDs/relógio), headers em uppercase tracked com tique âmbar,
  hairline nas barras, indicador de aba ativa no bottom-nav, linha de dados
  animada no login e anel de varredura no splash. Perf preservada (única
  animação contínua nova é cheap e desligada em `prefers-reduced-motion`).
  Reversível removendo o bloco + tokens.

- **2026-07-28** — **Fix: envio de orçamento por e-mail quebrava com
  "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"**. A assinatura
  usada pela empresa (`Nati 500.png`, 7,6 MB) virava um POST de 10,1 MB em
  base64 para `/admin/me/assinatura`, estourando o limite de 8 mb do
  `express.json`; o body-parser respondia 413 em **HTML** e o `.json()` do
  front morria escondendo o erro real.
  - `public/admin.js`: a assinatura agora é redimensionada no navegador antes
    do upload (`_avPrepararAssinatura` — canvas, largura máx. 600 px, PNG e
    fallback JPEG até ~180 KB). Medido: 7,6 MB → 89 KB. Isso também evita o
    "[Mensagem aparada]" do Gmail, já que o e-mail embute a imagem como data
    URI. O preview do modal passa a mostrar a imagem já reduzida.
  - `public/admin.js`: helper `lerRespostaJson(resp, contexto)` — lê a
    resposta como texto e traduz HTML de erro em mensagem legível
    (413/404/502/503/504) em vez de estourar no `JSON.parse`.
  - `src/app.js`: handler de 404 e handler de erro finais respondendo
    **JSON** (`entity.too.large` → 413 legível, `entity.parse.failed` → 400).
    Requests de página (GET com `Accept: text/html`) seguem no 404 padrão.
  - `public/admin.html`: `admin.js`/`admin.css` → `?v=242`/`?v=148`.

- **2026-07-28** — **App mobile: upgrade Capacitor 6 → 8 (preparação da Fase 7J)**.
  Motivador: a Play Store passa a exigir **target API 36** para apps novos e
  atualizações a partir de **31/08/2026** (apps já publicados precisam de no
  mínimo API 35 para continuar visíveis). O projeto estava em `targetSdk 34`,
  abaixo dos dois patamares — sem isso não há publicação.
  - `app/package.json`: `@capacitor/core`, `@capacitor/android` e
    `@capacitor/cli` → **8.4.2** (eram 6.x).
  - `app/android/variables.gradle`: `minSdk 22 → 24`, `compileSdk`/`targetSdk`
    `34 → 36`, e as libs androidx alinhadas aos defaults do Capacitor 8
    (activity 1.11.0, appcompat 1.7.1, coordinatorlayout 1.3.0, core 1.17.0,
    fragment 1.8.9, webkit 1.14.0, junit-ext 1.3.0, espresso 3.7.0,
    cordova-android 14.0.1). Valores lidos de
    `node_modules/@capacitor/android/capacitor/build.gradle`, não escolhidos à mão.
  - `app/android/build.gradle`: AGP `8.2.1 → 8.13.0`.
  - `app/android/gradle/wrapper/`: Gradle `8.2.1 → 8.14.3`.
  - `app/android/app/capacitor.build.gradle` (**gerado**, não editar):
    o `cap sync` mudou `sourceCompatibility`/`targetCompatibility` de **17 para
    21** sozinho. Não é preciso declarar `compileOptions` no
    `app/android/app/build.gradle` — esse arquivo gerado é aplicado depois e
    já cobre o módulo `app`.
  - **Sem alteração no código nativo próprio.** `NativeGpsPlugin` /
    `NativeGpsService` usam só APIs estáveis do bridge (`Plugin`, `PluginCall`,
    `notifyListeners`), que não mudaram de 6 para 8.
    `@capacitor-community/background-geolocation@1.2.26` seguiu compatível
    (peer `@capacitor/core >=3.0.0`), sem troca de plugin.
  - Verificado: `assembleDebug` OK e **manifesto final** conferido —
    `targetSdkVersion="36"`, `minSdkVersion="24"`, `NativeGpsService` com
    `foregroundServiceType="location"` e as permissões
    `ACCESS_BACKGROUND_LOCATION` / `FOREGROUND_SERVICE_LOCATION` /
    `POST_NOTIFICATIONS` mergeadas.
  - ⚠️ **Falta teste em aparelho real** — build passar não prova que o
    rastreamento em background sobreviveu à mudança de target API (as regras de
    localização com tela apagada endurecem a cada versão do Android).
  - ⚠️ `minSdk 24` **derruba Android 5.0/5.1** (era 22). Sem impacto conhecido,
    mas é perda de compatibilidade.

- **2026-07-28** — **Fix (app mobile): barra de ações do chamado sumia pra sempre
  depois de finalizar uma O.S.** Sintoma: o técnico abria qualquer chamado
  `aberto` e não aparecia botão nenhum — nem "A caminho", nem "Iniciar
  atendimento". Reiniciar o app resolvia até a próxima O.S. finalizada.
  - Causa: a tela "O.S. finalizada!" esconde a barra com
    `document.querySelector(".td-cta-bar").style.display = "none"`
    (`app/public/app.js`) e **só restaura dentro do clique do botão "Voltar pra
    minha lista"**. Saindo por qualquer outro caminho (gesto de voltar,
    bottom-nav), o `display` inline sobrevivia. Como o app é página única e há
    **uma só** `.td-cta-bar` no `index.html`, reusada por todos os chamados, o
    `bar.hidden = false` de `configurarCTA` não vencia o inline — e a barra
    ficava morta pro app inteiro.
  - Correção em `configurarCTA`: limpa `bar.style.display` ao exibir, tornando
    essa função a fonte única da verdade independente de como a tela anterior
    foi abandonada. A tela de sucesso ficou como estava (o fix cobre todos os
    caminhos de saída, inclusive os que ainda não existem).
  - **Não tem relação com o upgrade do Capacitor 8** — defeito pré-existente,
    exposto ao rodar o ciclo completo de O.S. pela primeira vez em produção.
  - Diagnóstico confirmado no aparelho: fechar e reabrir o app restaura os
    botões (o estado sujo vive só em memória).

- **2026-07-28** — **Orçamentos · aba "Solicitados pelos técnicos": formulário
  sai do painel lateral e vai para o modal de tela cheia.** A aba herdou o
  master-detail da aba "Criar orçamento" para manter a identidade visual, mas o
  painel da direita acabou recebendo o formulário inteiro do orçamento formal
  (nº, validade, constatação, tabela de itens e 4 campos de condições
  comerciais) espremido numa coluna estreita.
  - `public/admin.js`: o bloco do formulário saiu de `_orcRenderPainel` para
    `_orcFormalHtml(o)`, renderizado no **mesmo `#avModal`** usado pela aba
    "Criar orçamento" (`_orcAbrirFormal` / `_orcFecharFormal`). O painel lateral
    passa a mostrar só o resumo (nº, validade, valor) + botão "Preencher/Editar
    orçamento", mantendo dados, observação do técnico e as ações
    aprovar/rejeitar — conteúdo que cabe na coluna.
  - Os ids dos campos foram preservados (`orcInputNumero` etc.): `_orcAcao` lê
    tudo por `getElementById`, então trocar de container não afetou o
    salvamento. A delegação de clique foi extraída para `_orcTratarClique` e
    ligada ao painel **e** ao `#avModalBody`; fecha no backdrop e no Esc.
  - Os itens do orçamento passaram a ser buscados só ao abrir o modal — antes
    havia um `GET /admin/orcamentos/:id/itens` a cada seleção na lista, mesmo
    sem ninguém editar.
  - Fix junto: `orcamento_valido_ate` é `DATE` (sem fuso) e passava por
    `new Date()`, o que exibiria **um dia a menos** no Brasil. Novo
    `_orcFmtDataSemFuso` fatia a string, mesmo tratamento de `_pmFmtData`.
  - `admin.js?v=243`, `admin.css?v=149`. Sem endpoint novo → `sw.js` intocado.

- **2026-07-29** — **App · telas de login e OTP ficam só com a logo.** Removidos
  o título `TELEMETRIA`, o subtítulo "Sistema de monitoramento de
  reservatórios" (bloco `.login-title`) e o rodapé "General Engenharia da
  Manutenção" com a linha de diagnóstico (`.login-footer` + `.diag-line`, que
  mostrava a URL da API e `Capacitor (nativo)` / `Browser (dev)`). O card de
  autenticação passa a ser logo + formulário.
  - **Pegadinha:** o rodapé de diagnóstico era preenchido no bootstrap do
    `app/public/app.js` com `document.getElementById("apiBase").textContent`
    **sem guard de null**. Apagar só o HTML derrubaria o app inteiro no boot
    (`TypeError`) — nem a tela de login apareceria. As duas linhas foram
    removidas junto; eram meramente informativas, nenhuma lógica dependia
    delas.
  - Aplicado nas **duas** telas do fluxo (`data-screen="login"` e
    `data-screen="otp"`) para não ficar inconsistente no meio do login.
  - CSS órfão removido de `app/public/app.css`: `.login-title`,
    `.login-footer`, `.diag-line` e a entrada de `.diag-line` na regra de fonte
    monoespaçada. O espaçamento se resolve pelo `margin-bottom: 36px` que a
    `.login-logo-wrap` já tinha.
  - **Só o app.** O login do site (`public/login.html` / `public/login.css`)
    tem marcação equivalente e ficou **intacto**.
  - Verificado no navegador (login e OTP renderizando, console sem erros) e
    APK `assembleDebug` reconstruído após `npx cap sync android`.

- **2026-07-29** — **RBAC: novo nível `gestaoOnly` e redivisão admin master ×
  gerente.** O master passa a guardar só o que é irreversível; a operação do
  negócio fica com o gerente.
  - **Novo `src/middleware/gestaoOnly.js`** (`admin` + `gerente`). Existe porque
    `adminOnly` **também deixa o operador passar** — usar `adminOnly` para
    "liberar pro gerente" liberaria pro operador junto. Hierarquia final:
    `adminOnly` (3 roles) ⊃ `gestaoOnly` (2) ⊃ `masterAdminOnly` (1).
  - **Liberado pro gerente:** planos de manutenção (9 rotas — estava tudo em
    master **inclusive o `GET`**, então o gerente via o menu e tomava 403 ao
    abrir); contratos, inclusive `enviar-assinatura`; criar/editar condomínio;
    export de conversas do WhatsApp.
  - **Liberado pro gerente + operador** (`adminOnly`): criar e editar chamado
    (era master — o gerente não conseguia mudar status nem atribuir técnico) e
    `PATCH /alertas/:id/fechar` (o operador via o Monitor sem poder fechar).
  - **Continua master:** reservatórios (criar/editar/excluir/device-key),
    **excluir** condomínio (`DELETE` e `/hard`), usuários + `/auth/registrar`,
    configurações, SLA, integrações e jobs de manutenção. A fronteira que
    sobrou é limpa: **credencial de login é do master**.
  - **Técnicos** (`POST`/`PATCH`/`DELETE`) também foram para `gestaoOnly` —
    decisão tomada depois, no mesmo dia. Vale registrar que
    `DELETE /tecnicos/:id` é **hard delete** sem checar vínculos: chamados,
    O.S. e zonas sobrevivem (`ON DELETE SET NULL`), mas `tecnico_localizacoes`
    e o histórico de GPS são `ON DELETE CASCADE` e **somem junto**.
  - Orçamentos e O.S. já eram `adminOnly` — nada mudou lá.
  - `public/admin.js` **não foi tocado** → sem bump de `?v=N`. Muda só backend,
    logo **só vale após deploy**.
  - Fica registrado: a restrição do **operador** é só de UI (`display:none` no
    menu); no backend ele passa em `adminOnly` e alcança orçamentos, O.S. e
    relatórios pela API. Não foi alterado porque **restringir** quebraria quem
    usa hoje — decisão pendente.

- **2026-07-29** — **GPS parava com a tela apagada: `NativeGpsService` era um
  bound service.** Sintoma: o pin do técnico congelava no mapa, e ao abrir o app
  aparecia "localização a 76 min" seguida de "GPS ativo" logo depois. A
  notificação persistente **sumia** da barra com a tela apagada — prova de que o
  serviço estava sendo encerrado, não de que o GPS falhava.
  - Causa: o serviço só era criado por `bindService(..., BIND_AUTO_CREATE)`,
    nunca por `startForegroundService()`. Um serviço **apenas-bound** tem o
    ciclo de vida preso à Activity, e chamar `startForeground()` dentro dele
    **não** muda isso. Quando o Android reciclava a Activity (Doze / gerenciador
    de bateria do fabricante), o serviço morria junto.
  - Pior: dois caminhos desligavam o rastreio **de propósito** —
    `NativeGpsPlugin.handleOnDestroy()` chamava `service.stop()` e
    `NativeGpsService.onUnbind()` chamava `stopTracking()` + `stopSelf()`.
  - Correção: virou *started service*. Binder removido (`onBind` → `null`),
    comunicação por `Intent` com ação (`GPS_START`/`GPS_STOP`/
    `GPS_UPDATE_TOKEN`), `onStartCommand` devolvendo **`START_STICKY`**.
    `handleOnDestroy` não para mais o serviço — só o `stop()` explícito do JS
    (logout, fora da janela 8h–18h) encerra o rastreio.
  - Detalhe que era fácil errar: com `START_STICKY` o sistema recria o serviço
    com **Intent nulo**. A config (endpoint, token, intervalo) foi para
    `SharedPreferences`; sem isso o serviço voltaria com a notificação na tela
    e sem mandar nada.
  - `startForeground` passou a declarar `FOREGROUND_SERVICE_TYPE_LOCATION` no
    Android 10+ — obrigatório no 14+ (`targetSdk 36`).
  - `postLocation` engolia tudo em `catch (Exception ignored)`: um 401 de token
    expirado ou queda de rede congelava o pin **sem deixar rastro**. Agora loga
    status HTTP fora de 2xx e falhas em `Log.w("NativeGps", ...)`
    (`adb logcat -s NativeGps`).
  - **Nada mudou no JS** — a API `start`/`stop`/`addListener` é a mesma.
    Exige APK novo. Não confundir com a janela de operação **8h–18h**
    (`app.js`), em que o GPS desliga por design.

- **2026-07-29** — **PDF de orçamento saía com a data um dia atrasada.**
  `fmtDateBR` aplicava `toLocaleDateString("pt-BR", { timeZone:
  "America/Sao_Paulo" })` em **todas** as datas, inclusive nas colunas `DATE`.
  - `orcamentos.valido_ate` e `orcamentos.data_documento` são **`DATE`** — dia
    de calendário, sem fuso. O servidor roda em **UTC**, o driver entrega
    `2026-07-29` como meia-noite UTC, e converter para `America/Sao_Paulo`
    (UTC-3) devolve **28/07**. Reproduzido: banco `2026-07-29` → PDF
    `28/07/2026`; na virada de mês, `01/08` virava `31/07`.
  - Novo `fmtDateOnlyBR` lê os componentes crus (sem conversão), tratando tanto
    `Date` quanto string `YYYY-MM-DD`. `fmtDateBR` **continua** sendo usado para
    `criado_em` (`timestamptz`), onde converter fuso é o comportamento correto.
  - `data_documento` (DATE) e `criado_em` (timestamptz) eram coalescidos com um
    `||` cru e formatados igual — tipos diferentes exigem formatadores
    diferentes, agora separados em `fmtDataDocumento`.
  - Mesmo defeito que `_orcFmtDataSemFuso` já resolvia no `admin.js`: a correção
    tinha sido feita só no front, o gerador de PDF ficou para trás.
  - **O mesmo defeito foi corrigido em `contrato-pdf.service.js` e
    `os-pdf.service.js`** na mesma passagem:
    - **Contrato** — `inicio_em` e `fim_em` (`DATE`) apareciam um dia atrasados
      na **cláusula 6.1, a de vigência**: um contrato de 01/08/2026 a
      31/07/2027 era impresso como 31/07/2026 a 30/07/2027. Novo
      `fmtBRDateOnly`; o placeholder `___/___/______` de campo vazio foi
      preservado. Seguro de aplicar porque **ainda não há contratos
      assinados** — do contrário, regenerar o PDF mudaria a data de um
      documento já firmado.
    - **O.S.** — `retorno_sugerido_em` (`DATE`). `chegada_em` e `criado_em` são
      `timestamptz` e continuam com o formatador de fuso.
  - Auditoria conferiu os três serviços de PDF; colunas `DATE` que ainda não
    passam por PDF (`data_nascimento`, `proxima_em`, `ultima_em`) ficam
    registradas em [`../memory-bank/active-work.md`](../memory-bank/active-work.md).

- **2026-07-29** — **PDF de orçamento dizia "60 dias" fixo, qualquer que fosse
  a validade.** O texto estava literal no template
  (`` `60 dias (até ${...})` ``), então um orçamento com validade de 30 dias
  saía com o **texto e a data se contradizendo**.
  - Não existe coluna de "validade em dias" — o banco só tem `valido_ate`
    (`DATE`). O prazo agora é **derivado**: dias de calendário entre a data do
    documento (`data_documento`, ou `criado_em` quando vazia) e `valido_ate`.
  - A subtração usa `Date.UTC` sobre os componentes `[ano, mês, dia]` dos dois
    lados, para que fuso e horário de verão não entrem na conta. O lado
    `timestamptz` é primeiro reduzido ao dia de calendário **em São Paulo**
    (via `toLocaleDateString("en-CA", { timeZone })`), senão um orçamento criado
    de madrugada contaria um dia a mais.
  - Casos de borda cobertos: singular ("1 dia"), virada de ano, ano bissexto,
    e validade no passado ou no mesmo dia — nesses dois últimos afirmar "X dias"
    seria errado, então imprime só "até DD/MM/AAAA". Sem `valido_ate`, mantém o
    padrão comercial "60 dias".

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).
