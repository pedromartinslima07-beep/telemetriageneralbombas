---
tags:
  - projeto
  - contexto/roadmap
aliases:
  - Roadmap
---
# Roadmap

> Status: ✅ concluído · 🟡 em andamento · 📋 planejado · ⏸️ adiado · ❌ descartado.
> O "porquê" de cada decisão está em [`decisions.md`](decisions.md); o histórico
> técnico por migration está em [`../docs/changelog.md`](../docs/changelog.md).

## Linha do tempo das fases (já entregue)

| Fase | Tema | Status |
|---|---|---|
| 1 | Fundação WhatsApp (webhook, tabelas, sem IA) | ✅ |
| 2 | IA com function calling (gpt-4o-mini) | ✅ |
| 3A | Redesign dashboard (cards por condomínio) | ✅ |
| 3A.1 | Redesign visual "Mission Control" | ✅ |
| 3A.2 | Seção Telemetria avançada | ✅ |
| 3B | Mapa interativo Leaflet + geocoding híbrido + proxy de tiles | ✅ |
| 3C | Página /alertas unificada (telemetria + chamados) | ✅ |
| 3D | Ações recomendadas + análise IA + comentários | ✅ |
| 3E | Polimento da animação da sidebar | ✅ |
| 3F | WhatsApp como central de atendimento (Fases A-D) | ✅ |
| 4 | Integração telemetria automática (chamado anexa leitura) | ✅ |
| 5 | Polimento e gestão de conversas | ✅ |
| 6 | Hardening de segurança + configurações dinâmicas | ✅ |
| 7A-7F, 7H, 7I-A, 7K | App mobile Capacitor (técnico + cliente) + O.S. + GPS | ✅ |
| 7F-bg | GPS background no APK (`@capacitor-community/background-geolocation`) | ✅ |
| 7 (UI) | App mobile: camada visual HUD "Painel de comando" | ✅ |
| 7 (UI-2) | App mobile: telas de entrada (splash/login/código) portadas para o Chapa — **só o visual**, ver ressalva abaixo | ✅ |
| 7 (UI-3) | App mobile: migração do técnico para o Chapa (4 etapas: tokens, lista, detalhe, O.S., Roteiro/Conta) | ✅ |
| 8 | Analytics e SLA (métricas, SLA configurável, dashboard) | ✅ |
| 9C, 9E | Política de retenção + limpeza retroativa | ✅ |
| 10A | Curadoria de conversas resolvidas | ✅ |
| 11 | Política de criticidade P1–P4 e SLA de chegada | ✅ |
| 12A | Equipamentos: identidade + etiqueta QR + histórico | ✅ |

## Em andamento / pendente

- ✅ **As preventivas do mês ganham tela no operador** (03/09/2026). Terceira
  tela (`/operador/painel/preventivas`): o mês inteiro por zona, separado entre
  o que falta e o que já saiu, com despacho **por região ou prédio a prédio**
  (migration 082, `planos_atribuicoes`). A escala **ganha da zona e desvia** —
  prédio escalado para um técnico sai do roteiro dos outros. Passou por um passe
  Impeccable depois que o Pedro duvidou do nível: a placa lia plana (16,3/700
  contra 21,6/800 da irmã) e a tela tinha âmbar em uma peça só. Detalhe em
  [`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md).
  - ⏳ **Migration 082 aplicada só em TESTE** — falta produção.
  - ⚠️ **Os 72 planos de produção estão INATIVOS**, todos mensais: a tela nasce
    vazia lá até alguém reativá-los em Planos, no admin.
  - 📋 **Só 1 zona tem responsável** para 11 técnicos ativos. Enquanto isso, o
    despacho depende da escala manual desta tela — que é o que ela resolve.

- ✅ **A prioridade do chamado vem do contrato** (03/09/2026). Pedido do Pedro,
  a partir da minuta do Saint Antoine: *"com o que tem nela dá para setar um
  padrão para o sistema? e na abertura de chamados, em vez de ficar 100% pro
  usuário escolher, ele ir trocando sozinho dependendo do serviço?"*. Os prazos
  já conferiam; a tela é que os escrevia à mão (com um "24-48h" que a cláusula
  não dá) e não trazia o enquadramento. Hoje a régua é
  `src/services/prioridade.service.js`, a categoria **sugere** (cláusula 7.1.c
  autoriza a reclassificação) e a recorrência deixou de subir a prioridade em
  silêncio. Migration 081 (`melhoria`) aplicada em teste e em **produção**.
  Detalhe em [`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md).
  - 📋 **SLA por contrato**: `sla_definicoes` é global. Se as minutas antigas
    divergirem da nova, o sistema promete a régua do Saint Antoine para os 86.
  - 📋 **A suspensão do prazo** (cláusula 7.1.d — acesso negado, portaria sem
    liberação, terceiros, força maior) não é modelada: o relógio corre.
  - ❓ **Quatro colunas órfãs em `chamados`** nos dois bancos —
    `triagem_risco_imediato`, `triagem_redundancia`, `prioridade_piso`,
    `prioridade_motivo`. Vazias, sem migration e sem código.

- ✅ **O orçamento aprovado sabe que o serviço foi feito** (03/09/2026).
  Relato do Pedro: *"um técnico foi ao condomínio fez o serviço, tínhamos a
  O.S. no sistema porém estava lá em aprovados como se o serviço ainda
  estivesse em aberto"*. Dois defeitos: o chamado aberto pelo modal do admin
  nascia sem `orcamento_id` (só a rota do operador preenchia a coluna, que
  existe desde a 079), e a lista de Aprovados só considerava "feito" a
  marcação à mão — com o chamado fechado, a placa dizia "fechado" e continuava
  na fila. Hoje o modal tem o bloco "Serviço já autorizado", e a tela mostra a
  O.S. que executou. Sem migration. Detalhe em
  [`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md).
  - ✅ **O "Ver O.S." na placa, e o RBAC que ele pediu** (03/09). O operador
    passou a **ler** O.S. — a linha em `osDonoOuAdmin` é o `forWrite`, e
    editar continua sendo do técnico que esteve no prédio. Provado nos dois
    sentidos em `scripts/testes/operador-le-os.test.js`.
  - ✅ **Prévia da tela: `/dev/_aprovados-preview.html`**, com os cinco
    estados da placa. A tela só se olhava com sessão, e o login é handoff.
  - 📋 **Serviço feito sem chamado apontando o orçamento** continua exigindo o
    "Já foi feito" manual. O que fecharia: o app do técnico perguntar, ao
    finalizar a O.S. num prédio com orçamento aprovado pendente, se aquele
    serviço é esse.

- ✅ **O pedido de orçamento do técnico pode ser apagado** (03/09/2026). Relato
  do Pedro: um pedido repetido, de orçamento já enviado, que *"não sai nem a
  pau"*. A linha da aba é a **O.S. com `orcamento_necessario`**, não o
  documento: o "Excluir orçamento" do modal apagava o papel e a linha voltava
  como SOLICITADO — e clicar nela criava outro rascunho. Nova rota
  `DELETE /admin/orcamentos/:os_id` (desliga a flag + apaga o orçamento
  vinculado, numa statement) e uma lixeira em cada linha. O avulso sem `os_id`
  não é tocado. De quebra, o "Excluir orçamento" do modal deixou de "apagar" na
  tela quando o servidor recusava. Sem migration. Detalhe em
  [`../docs/modulos/painel-admin.md`](../docs/modulos/painel-admin.md).

- ✅ **A barra do painel do operador voltou a caber no celular** (03/09/2026).
  Achado ao mover "Minha senha": a 390px (iPhone 12–15) o wordmark pintava
  **83px por cima de "Aprovados"** em produção, e ninguém tinha visto — a barra
  do operador só se olha com sessão, e quase sempre na mesa. Resolvido pela
  **gaveta de conta** (o nome virou botão que abre trocar senha e sair, −50px)
  mais a marca cedendo altura. Fecha de **360px para cima**; 320px é limite
  conhecido. Detalhe em
  [`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md).
  - ⏳ **A tela de Aprovados ficou com a barra antiga** — carrega o mesmo
    `operador.css` e ainda monta "nome (texto) + Sair". Nada quebrado, mas as
    duas barras do operador divergem. Ver [`active-work.md`](active-work.md).

- ✅ **Orçamentos passam a mostrar o nome fantasia do condomínio** (02/09/2026).
  As duas rotas da seção liam `c.nome` (razão social) enquanto o PDF e o e-mail
  já usavam `nome_fantasia`: o painel dizia "ELVIRA FERRAZ EMPREENDIMENTOS
  IMOBILIARIOS LTDA" e o cliente recebia "AURI FARIA LIMA". A razão social
  passou a viajar junto (`condominio_razao_social`), alimentando a busca e o
  cabeçalho do painel. Sem migration. Detalhe em
  [`../docs/modulos/painel-admin.md`](../docs/modulos/painel-admin.md).
  - 📋 **Alinhar o resto do sistema à migration 044** — chamados, O.S.,
    contratos, relatórios, WhatsApp e alertas ainda leem `c.nome` puro e
    mostram a razão social. Enquanto isso durar, o mesmo condomínio se chama
    de dois jeitos conforme a tela. É troca mecânica (`COALESCE(NULLIF(
    c.nome_fantasia,''), c.nome)`), mas cada rota com `GROUP BY` precisa da
    coluna nova no `GROUP BY`, sob pena de `42803` no parse.

- ✅ **RBAC: o operador virou restrição de verdade** (27/08/2026). 49 rotas
  saíram de `adminOnly` para `gestaoOnly` e o perfil saiu de `equipeInterna`;
  Contratos **e Dashboard** saíram do menu dele — o perfil ficou em quatro
  telas. Fecha a pendência aberta em 29/07/2026. Sobram 24 rotas, contra 118
  bloqueadas. Detalhe em
  [`../docs/modulos/autenticacao.md`](../docs/modulos/autenticacao.md).
  - 📋 **Confirmar em produção com um login `operador` real** — é backend, só
    vale após deploy, e nenhum teste automatizado cobre RBAC hoje.
  - ✅ **Superfície própria pro operador** (27/08/2026). A pergunta ("outra
    tese ou o admin podado?") foi respondida por **outra tese**: `/operador/painel`
    é a *fila do turno*, ordenada pelo SLA que estoura primeiro, com a evidência
    dentro do item. Arquivos próprios (`public/operador.*`), zero import de
    `admin.js`, e **um** endpoint novo (`GET /operador/fila`). Fluxo em
    [`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md).
    - ✅ **Aprovados vira porta de execução** (31/08/2026, migration 079).
      `/operador/painel/orcamentos` deixou de ser só leitura: clicar no
      orçamento abre o chamado que o executa, vinculado por
      `chamados.orcamento_id`. Fecha o buraco de "esse orçamento chegou a ser
      executado?", que antes não tinha onde ser respondido.
      - ⏳ **Rodar a migration 079 em produção** —
        `node scripts/migrate.js 079_chamado_orcamento.sql`. Sem ela o
        endpoint estoura no `INSERT` (lição da Fase 7E).
    - ✅ **Identidade alinhada com a landing e o painel do cliente**
      (27/08/2026, terceiro passe — o primeiro feito com as três telas abertas
      lado a lado). Fechou a faixa de 660–1090px, que não existia e onde a tela
      desmontava; a barra ganhou o `is-rolada` com `blur` das irmãs; sumiram as
      três peças de canto reto e os quinze ícones de ponta arredondada; a
      engrenagem ganhou máscara para parar de aparecer como dente solto entre
      os cartões.
    - 📋 **Chanfro: `--ch` local é morto nas CINCO folhas** (medido em 27/08).
      A rampa que o `DESIGN.md` descreve não renderiza em superfície nenhuma —
      cada tela tem um chanfro só. Conserto é nas cinco de uma vez, senão a
      folha consertada vira a fora do padrão. Mesmo raciocínio da rampa de tipo.
    - 📋 **Nunca rodou sob a role real** — exercitada com JWT assinado à mão
      contra o banco de teste; o visual não foi visto logado.
    - 📋 Coluna `origem` em `chamados`: hoje a procedência do chamado é
      deduzida por efeito colateral (`conversa_id`, `plano_manutencao_id`,
      categoria automática), e um `nivel_baixo` aberto à mão aparece como
      "telemetria".
    - ✅ **Abrir chamado já atribuindo o técnico** (31/08/2026, pedido do
      Pedro). Seletor opcional nos dois diálogos de criação — o "Novo chamado"
      da fila e o "Abrir chamado" dos Aprovados —, com `tecnico_id` aceito por
      `POST /chamados` e `POST /operador/orcamentos/:id/chamado`, validação em
      `chamado-atribuicao.service.js` e endpoint novo `GET /operador/tecnicos`.
      Sem migration. Fecha o "abri o chamado e agora tenho de achá-lo na fila
      para despachar".
    - 📋 ETA no despacho — o cartão do candidato mostra "no mapa"/"—", não
      distância nem tempo. ⚠️ No **trilho** essa nota já saiu (31/08); aqui ela
      continua porque o diálogo de despacho ainda não passou pelo corte, e é
      justamente onde a distância teria valor.
    - 🟡 **Simplificar a tela para quem vai usar** — pedido do Pedro: pessoas
      mais velhas, com pouca familiaridade com computador. A régua é *o que sai
      da tela*, não *quanto cresce* (o passe de escala foi devolvido com "não
      mudou praticamente nada"). ✅ o **item da fila** (28/08), o **trilho**
      (31/08, 4 peças por linha → 2) e o **placar de 3 números** (31/08, saiu
      da tela; a engrenagem de fundo mudou de casa junto — da faixa horizontal
      do topo para dentro do trilho, abraçando o mapa) e os **pinos do mapa**
      (31/08, duas escalas: no mapa largo — tela cheia ou abaixo de 1180 — eles
      crescem, porque 22px desenhados para a coluna de 400 somem numa janela de
      1900). 📋 falta a **ficha**, o **diálogo de despacho** e **"Já tem
      técnico"**. A fila detalhada e as pendências de copy que são decisão do
      Pedro estão em [`active-work.md`](active-work.md).

- ✅ **Migrations 077 e 078 aplicadas em produção** (26/08/2026). A 078
  (`resposta_tratada_em`/`resposta_tratada_por`) era pré-requisito do painel
  novo de orçamentos: sem ela, o `SELECT` da lista derruba a aba inteira.
  Rodaram **antes** do deploy do código, que é a lição da Fase 7E no
  [`../CLAUDE.md`](../CLAUDE.md).

- **Fase 12 — Equipamentos e bancada da oficina** 🟡 — 12A entregue em
  2026-08-17 na branch `feature/equipamentos-qr`. Fluxo e pegadinhas em
  [`../docs/modulos/equipamentos.md`](../docs/modulos/equipamentos.md).
  - ✅ **12A (identidade)**: migration 070, router `/equipamentos`, folha A4 de
    etiquetas QR, ficha `/e/:codigo` e seção Equipamentos no admin. Responde
    "de quem é essa bomba e o que ela tem", que era a dor original.
  - ✅ **Migration 070 aplicada em teste e em produção** (2026-08-17,
    `--prod`). Lembrete: em dev o `migrate.js` vai pro banco de teste por
    padrão — produção exige a flag `--prod` (ver `src/db-url.js`).
  - 📋 **`PUBLIC_BASE_URL` nas envs do Railway** — sem ela o gerador de
    etiquetas recusa imprimir (deriva a URL do request e barra host local).
    É pré-requisito pra primeira folha real sair da impressora.
  - ✅ **12B (orçamento da bancada)** — 2026-08-18, migration 071. Botão
    "Solicitar orçamento" na ficha cria `orcamentos` com `origem = 'bancada'` e
    as peças como linhas; aprovar ou recusar no painel move a bomba de volta
    (`em_conserto` / `oficina`). Verificado ponta a ponta no banco de teste.
    Migration 071 aplicada em teste e **produção** (18/08).
  - 📋 **12B-2 (painel da bancada)**: a lista por estado com **dias parados** —
    a tela que responde "o que está parado na oficina e por quê" sem escanear
    bomba por bomba. Hoje isso só se vê uma bomba de cada vez, pela ficha.
  - ✅ **12C (O.S. no circuito)** — 2026-08-18, migration 072.
    `ordens_servico.equipamento_id`, seletor no modal de O.S., propagação do
    vínculo para o orçamento e reflexo da aprovação na bancada.
    Migration 072 aplicada em teste e **produção** (18/08) — inclui o `UPDATE`
    que acertou `orcamentos.origem = 'os'` nos orçamentos nascidos de O.S.
    - ✅ **A outra metade, 31/08:** o seletor entrou também no **app do
      técnico** (seção "Bomba atendida"). Até então o campo existia só para
      quem não estava na casa de máquinas — a O.S. de campo nascia sempre sem
      vínculo. Sem backend novo. **Só chega ao técnico com APK novo.**

  - 📋 **12D (opcional, depois de 31/08)**: scanner dentro do app
    (`@capacitor-mlkit/barcode-scanning`) — o gesto natural na bancada, hoje
    substituído pelo seletor; inventário do parque instalado; alerta de
    garantia.

- **Fase 13 — Ativos Técnicos (VRP, piscina e além)** 📋 — plano recebido de
  fora em 2026-09-01: o chefe do Pedro mandou o `Prompt_Mestre` (28 seções, em
  `.txt` e `.docx` — mesmo conteúdo), o resumo com mapa visual e, horas depois,
  o **`orientacao_inventario_tags_qrcode_general_v3`**, que respondeu duas
  perguntas, encolheu uma fase e **contradiz o primeiro no padrão de TAG**.
  Análise completa, censo de produção e o **placar das 11 perguntas** estão em
  [`active-work.md`](active-work.md). ⚠️ Os três originais vivem em
  `Downloads/` e **não estão versionados**.
  - 🔑 **A Fase 12 tem zero linhas em produção** (censo de 01/09): nenhuma
    etiqueta impressa, nenhum equipamento cadastrado, nenhuma movimentação.
    **Não existe retrofit** — o cadastro pode ser remodelado com liberdade, e
    é o que torna esta fase barata agora e cara depois.
  - 🔑 **O inventário nasce no comercial** (v3 §2): o levantamento do lead já
    dá condomínio, sistemas e quantidade aproximada — o bastante para criar o
    **pré-inventário**, gerar TAGs e preparar QRs. O técnico escaneia em campo
    e completa. O piloto deixa de ser "65 cadastros manuais" e vira "65
    esqueletos preenchidos estação por estação".
  - 📋 **A (fundação, `migration 081`)**: `tag`, `sistema`, `agrupador_id`,
    **`ativo_pai_id`**, `funcao`, `condicao`, **`no_escopo`**,
    `especificacoes JSONB` e `substituiu_id`/`substituido_por_id` em
    `equipamentos`; tabela `ativo_agrupadores` (estação · conjunto · casa de
    bombas · shaft); `condominios.codigo_curto` para compor a TAG. Tipos novos:
    `vrp`, `alv`, `vcb`, `filtro`, `vaso_expansao`.
    ⚠️ `condicao` é coluna **nova**, não substitui `status` — são eixos
    diferentes (papel do equipamento × onde ele está), e misturar quebra a
    bancada.
    ⚠️ **`ativo_pai_id` não é opcional** (mudança do v3): o **conjunto
    motobomba** — bomba + motor + retenção + válvula de pé + registros — é como
    o inventário de bomba nasce, não um refinamento futuro. Era a §19
    ("preparar a arquitetura, não obrigar o uso") no primeiro documento.
  - 📋 **B (medições e pré-inventário, `migration 082`)**: `ativo_medicoes` com
    `momento` (antes/depois) e **`fonte`** (levantamento × encontrado em campo
    × placa × projeto). É o que falta para VRP existir de verdade — hoje
    pressão vira texto em observações. ⚠️ **O valor do levantamento não é
    sobrescrito pelo de campo**: os dois coexistem e a divergência é o dado
    (v3 §2).
  - 📋 **C (tipos e checklist por definição)**: `OS_TIPOS`/`OS_EQUIPAMENTOS`
    saem das listas fixas de `app/public/app.js` e viram definição por tipo no
    backend. ⚠️ **Janela curta**: só 1 O.S. finalizada existe; depois é
    retrabalho em documento assinado.
  - 📋 **D (contrato ↔ sistema, `migration 083`)** — **encolheu com o v3**: a
    cobertura é **por sistema**, não equipamento a equipamento (§1), então
    `contrato_sistemas` + `no_escopo` no ativo, em vez da `contrato_ativos`
    datada. **Ainda depende da pergunta 3**: se a cobertura muda no meio da
    vigência, as datas voltam.
  - 📋 **E (planos por tipo de ativo)**: `planos_manutencao` ganha `tipo_ativo`
    e `ativo_id`. Os 72 planos existentes estão **todos desligados** desde
    04/08, então não há nada rodando para quebrar. Inclui o **filtro de
    piscina**, cuja troca de meio filtrante tem periodicidade própria.
  - 📋 **F (dashboard + relatório mensal)** e **G (triagem de reclamação de
    pressão)** — depois do campo.
  - ❌ **QR sequencial (`/ativos/{id}`) não entra**: a ficha revela endereço de
    cliente e URL adivinhável expõe o parque inteiro. TAG legível e `codigo`
    aleatório **convivem** — um é para ler, o outro para escanear.
    ⚠️ **O v3 pede dois níveis de acesso pelo mesmo QR** (consulta sem login ×
    colaborador autenticado). Dá para fazer, mas exige decidir o que o nível
    aberto mostra: com nome e endereço do condomínio, o código aleatório deixa
    de proteger o parque.
  - ⚠️ **Contradição de TAG entre os documentos:** o doc 1 pede
    `VNT-BMB-001` (cliente + tipo), o v3 desenha `REC-01` / `PIS-FIL-01`
    (função, sem cliente) — e sem o cliente a TAG repete nos 87 prédios, contra
    a regra de unicidade do próprio doc 1. **Sugestão na mesa: `VNT-REC-01`.**
  - ❌ **Renomear a tabela para `ativos`** — zero linhas no banco, mas caro no
    código. "Ativos Técnicos" é o nome na tela; no banco segue `equipamentos`.
  - ⚠️ **Pré-requisito herdado da 12A**: `PUBLIC_BASE_URL` nas envs do Railway.
    Sem ela nenhuma etiqueta sai da impressora, e é o que trava o piloto.

- **Landing pública** 🟡 — redesenhada em 2026-08-11 na branch
  `feature/landing-publica` (direção "Chapa"; a primeira versão, em formato de
  demonstrativo de despesas, foi rejeitada). Em 2026-08-13 a linha do tempo da
  madrugada foi trocada por uma chamada única de 24 h e toda a copy passou para
  primeira pessoa do plural. Fluxo e pegadinhas em
  [`../docs/modulos/landing-publica.md`](../docs/modulos/landing-publica.md).
  Pendente antes do merge:
  - **Preço / termos da assinatura** — Pedro definiu "assinatura mensal, sem
    vagas limitadas", mas o **valor não existe**. A página fala em proposta caso
    a caso e **não cita número nenhum**. Não inventar.
  - **Texto de LGPD** sob o botão de envio — escrito para descrever só o que
    `leads.routes.js` faz; falta o Pedro validar.
  - **"400+ avaliações cinco estrelas no Google"** continua não verificada e por
    isso está fora da página (ver `PRODUCT.md`).
  - `POST /leads` **não foi exercitado contra o backend real** nesta sessão —
    só a validação de campo vazio no front.
- **Painel do cliente** 🟡 — **v3 implementada em 14/08**, a partir da comp
  [`../docs/comps/painel-cliente-v3.html`](../docs/comps/painel-cliente-v3.html).
  A v1 (13/08) foi rejeitada por manter a casca do admin; a v3 removeu
  navegação, KPIs, abas, buscas e tabelas, e tudo que sobrou virou ficha.
  Fluxo e pegadinhas em
  [`../docs/modulos/painel-cliente.md`](../docs/modulos/painel-cliente.md);
  estratégia em `.impeccable/surfaces/public-cliente-html.md`.
  Pendente antes do merge:
  - **Abrir com backend real** (servidor de teste + conta de cliente demo). Até
    aqui só houve harness estático — 8 estados × 2 tamanhos, `fetch` dublado.
  - **Ver o cliente sem telemetria contratada com um cliente real** (sem
    reservatórios no banco). No harness o caminho renderiza.
  - **Decidir o âmbar no estado "atenção"**: ali a palavra que nomeia o
    problema, o número, o anel do tanque **e** o botão são todos âmbar — quatro
    regiões, contra a regra de "uma vez por tela". Veio assim da comp aprovada;
    não mexi sozinho.
  - 📋 **`ja_avaliado` no `SELECT` de `GET /cliente/chamados`** — uma linha
    (`(ch.avaliacao_nota IS NOT NULL) AS ja_avaliado`) elimina as requisições
    de detalhe que hoje existem só para saber se o convite a avaliar aparece na
    história. Aditivo, sem rota nova, sem tocar no `sw.js`.
  - 📋 **`alertas_recentes` em `/cliente/status`** — alertas resolvidos dos
    últimos 30 dias, para a história parar de mostrar alerta que abre e nunca
    fecha. Aditivo: sem rota nova, sem tocar no `sw.js`. Aguarda o Pedro
    liberar mexer no backend.
  - 📋 **O prédio em corte** ([`../docs/comps/predio-em-corte.html`](../docs/comps/predio-em-corte.html))
    continua como exploração, não como decisão: exige campo novo de posição do
    reservatório no banco.
- **Gateway Meta WhatsApp** — código pronto, pendente configuração externa
  (ver [`active-work.md`](active-work.md)).
- **Fase 10 (treinar IA)** 🟡 — 10A feito; 10B-E aguardam ~500+ conversas
  curadas.
- **7G — Push notifications nativas** 📋 — **destravada**: não depende da 7J
  (ver seção própria abaixo). Pedido do usuário em 2026-07-28.
- **7J — Publicação Play Store** 🟡 — **prazo firme: 31/08/2026** (target API 36
  obrigatório para apps novos e atualizações; extensão possível até 01/11/2026).
  - ✅ Upgrade Capacitor 6 → 8 feito em 2026-07-28 (`targetSdk 36`, AGP 8.13.0,
    Gradle 8.14.3) — ver [`../docs/changelog.md`](../docs/changelog.md).
  - 📋 Pendente: teste do GPS background em aparelho real; keystore de release +
    `signingConfig`; `versionCode`/`versionName` reais (hoje `1` / `"1.0"`);
    build `bundleRelease` (.aab); política de privacidade; e o **formulário de
    declaração de permissão de localização em background da Play Store**, que
    exige vídeo demonstrativo e passa por revisão manual.

- ✅ **App do técnico no Chapa** — as quatro etapas entraram em 01/09/2026
  (`app/public/tecnico.css`). ⚠️ A lição que custou uma refação: **a placa é
  CLARA** (`--chapa` sobre o campo marinho, como o `.orc-item` do painel do
  cliente), não escura sobre escura. E ao recompor tela, **remova os blocos
  superados do `app.css`** em vez de sobrescrever. Ver
  [`../docs/modulos/app-mobile.md`](../docs/modulos/app-mobile.md).
  - 📋 **Nunca foi visto logado** — tudo conferido em `?demo=tecnico` e no
    banco de teste; o app com dado real de produção não foi aberto.
  - 📋 **Emojis restantes** no `home` (placeholder de admin/cliente) e nas telas
    `cliente-*`: saem junto com a remoção delas.

- **O.S. offline — etapas 3 a 5** 🟡 — ✅ **etapa 1** (01/09): os campos do
  formulário sobrevivem à falta de sinal. ✅ **etapa 2** (01/09): fotos e
  assinatura vão para o **IndexedDB**, e a foto tirada sem sinal aparece na tela
  marcada como "na fila" e sobe sozinha quando a rede volta. 📋 Faltam:
  - ✅ **3 — finalizar offline** (01/09, **migration 081**). O app manda
    `finalizada_em`; o backend usa esse instante na O.S. **e no chamado**
    (`fechado_em`, `tempo_resolucao_seg`), com sanidade que cai para `NOW()` sem
    recusar o envio. `sincronizada_em` guarda quando chegou.
    - ✅ **Migration 081 aplicada em teste e em PRODUÇÃO** (01/09/2026, rodada
      pelo Pedro **antes** do deploy do código — a ordem que a Fase 7E ensinou:
      o código escreve em `sincronizada_em`, e o backend subindo antes da coluna
      quebraria toda finalização, não só as offline).
  - ✅ **4 — abrir sem sinal** (01/09). Lista, detalhe, O.S. e equipamentos saem
    do cache do IndexedDB, pré-carregado enquanto há rede. ⚠️ **NÃO cobre
    começar um atendimento novo**: a O.S. nasce de um `POST`, e todo o resto
    depende do id que ele devolve. O técnico precisa tocar em "Iniciar
    atendimento" ainda com sinal; dali para baixo tudo funciona.
  - **5 — a O.S. fechada do outro lado enquanto o técnico estava offline.**
    ⚠️ **Este é o buraco que as outras etapas NÃO cobrem**, levantado pelo Pedro
    em 01/09 ("vamos continuar perdendo assinatura e foto?"). Se um admin
    finalizar ou fechar a O.S. enquanto o técnico está sem sinal, a fila dele
    chega e **não tem onde pousar**: o backend recusa edição e envio de foto em
    O.S. finalizada. Hoje isso viraria uma foto descartada com um alerta. Precisa
    de caminho definido — ou o backend aceita sincronização atrasada, ou o app
    mostra "isto não conseguiu subir" com o conteúdo à mão. É a diferença entre
    "não perde" e "não perde nunca".
  - ⚠️ **Limite que nenhuma etapa remove:** se o app for desinstalado ou o
    armazenamento limpo, o rascunho vai junto. É local, não é backup.

- **Apagar as telas de cliente do app** 📋 — o Pedro confirmou em 01/09/2026 que
  `cliente-*` não existe em uso e autorizou remover ("se quiser ignorar ou
  apagar fique à vontade"). São ~7 telas de markup + CSS + JS
  (`cliente-home`, `cliente-telemetria`, `cliente-chamados`,
  `cliente-chamado-detalhe`, `cliente-novo-chamado`, `cliente-suporte`,
  `cliente-conta`). **Deliberadamente não misturado com o redesenho**: diff
  grande de exclusão junto de recomposição vira commit impossível de revisar.

- **O login do app não tem o caminho do síndico** 📋 — em 01/09/2026 as telas de
  entrada do app foram portadas para o Chapa, mas **só o visual**: o app segue
  pedindo e-mail + senha juntos no `POST /auth/login` e **não chama
  `/auth/codigo` em lugar nenhum**. Quem não tem senha — o síndico, cujo método
  o `/auth/metodo` responde como `codigo` — **não entra pelo app**, apesar de o
  `abrirTelaCliente()` já existir lá dentro. Hoje isso não atinge ninguém
  (produção não tem usuário `cliente`: 1 admin, 2 gerentes, 1 operador, 4
  técnicos, todos com senha), e o Pedro escolheu o visual com essa informação
  na mesa. **Abre no dia em que o primeiro síndico for cadastrado.** Fechar =
  portar o fluxo identifier-first (`/auth/metodo` + `/auth/codigo`), sem
  backend novo — a tela de OTP do app já funciona. Ver
  [`../docs/modulos/app-mobile.md`](../docs/modulos/app-mobile.md).

- **Dois assets do app com caminho absoluto** 📋 — `/app/manifest.json` e
  `/static/favicon.png?v=3` no `<head>` do `app/public/index.html` dão **404 no
  APK empacotado** (a origem lá é `https://localhost`, não o Express). Anterior
  a 01/09; `href` relativo resolveria nos dois casos, porque de `/app/index.html`
  o relativo cai no mesmo lugar.

- **Onboarding de permissão de localização em background** 📋 — em 2026-08-04 o
  app passou a **avisar** quando a permissão é só "ao usar o app" (chip "Sem
  permissão" + texto com o caminho). Falta a outra metade: detectar na abertura
  e oferecer um atalho para as Configurações do sistema
  (`ACTION_APPLICATION_DETAILS_SETTINGS`, como já é feito em
  `requestBatteryExemption`). Sem isso cada técnico precisa ser instruído na
  mão — hoje só o técnico de teste (id 9) tem a permissão correta. Encosta no
  formulário de declaração da Play Store da 7J.

- **Varredura de responsividade do admin em telas pequenas** 🟡 — em 2026-08-05
  foi corrigido o **recorte de controles** em toolbars (`.cardHead`,
  `.wa-tabs`, `.mp-tabs`), que escondia botões e filtros entre ~1280px e
  1536px em 6 abas. A varredura automatizada (harness estático + Puppeteer,
  ver [`../docs/changelog.md`](../docs/changelog.md)) cobriu **overflow
  horizontal**; ficou de fora o que ela não mede:
  - **Altura** — tabelas e modais longos em 768px de viewport.
  - **Painel do cliente** (`public/cliente.css`) — a varredura só rodou no
    admin, e o redesenho do painel do cliente mira justamente o navegador.
  - Faixa estreita entre ~1100px e ~1223px, onde a toolbar de telemetria
    ainda usa 3 linhas (nada some, só fica mais alta).

- **Orçamento respondido pelo cliente** 🟢 — a tela está em produção
  (`/cliente/painel/orcamentos`) e virou o caminho padrão:
  1. ✅ **migration 074 aplicada em produção** em 24/08/2026;
  2. ✅ **convite religado** em 25/08/2026 — agora é padrão, e
     `ORCAMENTO_LINK_PAINEL=0` é que desliga;
  3. ✅ **e-mail com link não leva mais o PDF anexado** (25/08/2026).
  4. ✅ **os dois modos de envio ganharam templates separados** (27/08/2026)
     — `carta` saía embrulhada na moldura do estruturado; agora é só o
     texto do operador e a assinatura dele.

  Falta percorrer a tela logado com calma — aprovar, recusar (exige comentário)
  e o retorno do `next=` do login — e ver o primeiro envio real chegar.

  Fica de fora por escopo: **pessoa física não responde por aqui** — quem não
  tem condomínio não tem login. Ainda sem aviso ao escritório quando a resposta
  entra (hoje só aparece no admin quem for olhar).
- **Padronização visual dos modais do admin** 🟡 — o modal de orçamento é a
  referência e o padrão está se espalhando um modal por vez.
  - ✅ 2026-08-05: camada compartilhada (`.modalBox` com fio no topo,
    `.is-perigo`, `.modal-sec-title`, `.modalFoot-danger`, `.modal-2col`,
    `.is-sobreposto`) + 8 cascas inline convertidas. Restam 0 cascas inline.
  - ✅ 2026-08-06: **Editar condomínio** reestruturado; nasceu daí a casca
    `.modalBox.is-split` / `.modal-split` / `.modal-rail` — janela de altura
    fixa com trilho, generalizada a partir do `#avModal`.
  - 📋 **Próximos candidatos ao trilho** (muito campo + algo que precisa ficar
    à vista): **Contrato** (`#ctrOverlay`, 1000px, o painel de assinatura rola
    junto), **O.S.** (`#osModalOverlay`) e **Editar reservatório**
    (`#editResOverlay`, onde a device key e o "Nova chave" competem com 7
    campos de calibração).
  - 📋 Falta rodar os modais reestruturados **contra o backend real** — tudo
    até aqui foi verificado em harness estático (markup real + CSS real, sem
    Leaflet e sem dados do banco).

- **SLA de chegada nunca saiu do papel** 📋 — a Migration 028 criou
  `sla_definicoes.sla_chegada_min` (P1=180min, P2/P3=1440/4320, P4=NULL) e as
  colunas `tecnico_a_caminho_em`/`tecnico_chegou_em`, mas nada consome: a tela
  Configurações › SLA só edita TTFR/TTR (o PATCH manda só os dois) e nenhuma
  query calcula estouro de chegada. Enquanto isso
  [`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md) afirma
  que "SLA mede chegada do técnico, não resolução" — hoje o código mede o
  contrário. Achado em 2026-08-06, ao corrigir o TTFR de atribuição.

- **Recalibrar o reservatório de teste (`Res_Gen_Sup`)** 📋 — a escala satura:
  `adc_zero=603` + `adc_por_metro=462` × `altura_total_m=0.50` faz **ADC 834 já
  ser 100%**, e 25 de 76 amostras cruas do Serial Monitor passam disso (máx.
  850 ≈ 107%), achatadas pelo `Math.min` de `calcularNivelPct`. Em 48h foram 75
  leituras acima do topo, até 35 counts (~7,6 cm de coluna d'água). O método de
  calibração usado está correto (sonda fora d'água para o zero,
  `(cheio − vazio) / 0,50` para a inclinação) — o ponto "cheio" é que foi
  capturado com a caixa abaixo do máximo de operação. Efeito: escala ~13%
  comprimida, o sistema alerta aos ~17% reais em vez de 20% (conservador, não
  perigoso). Correção: refazer o ponto "cheio" com a caixa no máximo e tirar
  cada ponto como **média de ~10 leituras** (uma leitura isolada carrega ±3,9
  counts de ruído = ±1,7% de nível). Achado em 2026-08-06.
  - ❌ **Não é** ruído de amostragem do firmware: a série crua dá autocorrelação
    -0,127 (ruído branco) e tem amostras consecutivas idênticas — não há
    aliasing, o `delay(20)` do `lerSonda()` está adequado.
  - ⚠️ **Armadilha:** não medir ruído pela tabela `leituras`. O write-threshold
    só grava o que saltou ≥5%, o que inflou a estimativa de ±1,7% para ±6,9% e
    fabricou uma falsa "alternância sistemática" (autocorrelação -0,434).

- ✅ **O PWA parou de mostrar a tela de login para quem já entrou**
  (01/09/2026). O `login.js` confere sessão (token + `exp` + `role`) no
  carregamento e salta para o painel; as guardas `?motivo=` e `exp` existem
  contra loop login↔painel. Ver
  [`../docs/modulos/autenticacao.md`](../docs/modulos/autenticacao.md).
  - 📋 **Reinstalar o PWA nos aparelhos que já têm o ícone** — o `start_url` é
    lido uma vez, na instalação, e o ícone criado antes de 31/08/2026 aponta
    para `/login`. Com o conserto ele só atravessa a tela; reinstalar economiza
    o salto. No iOS o `start_url` é sempre ignorado, então lá o redirect é a
    única solução.
  - 📋 **Ninguém encerra sessão de verdade** — apagar o token no navegador não
    invalida o JWT do outro lado (7 dias, sem revogação). Vale desde sempre, não
    é regressão desta mudança, mas continua sendo o buraco real de segurança de
    sessão.

## Descartado (decisões conscientes)

- **9A — Tabela agregada horária** ❌ — write-threshold já reduz volume o
  suficiente; agregação on-the-fly por bucket atende.
- **9B — Tabela agregada diária** ❌ — mesmo motivo.
- **9D — Adaptar queries para tabelas agregadas** ❌ — sem as tabelas, sem
  necessidade.
- **WebSocket no WhatsApp** ⏸️/❌ — polling de 5s suficiente para o volume atual.
- **leaflet.markercluster** — adiado até o nº de condomínios justificar.

## Backlog de schema (já resolvido)

- Sistema de orçamentos **unificado** (Migration 030 — eliminou os dois sistemas
  paralelos A e B).
- FK bidirecional `chamados ↔ ordens_servico` redundante removida (Migration 034).
- `mensagens_whatsapp.ia_urgencia` migrado para p1-p4 (Migration 031).
- Tabelas `planos_manutencao` (032), `historico_chamados` (033), `contratos`
  (035) criadas.
- Encaminhamento de orçamento via IA (036), contexto cliente B2B vs PF (037),
  pré-cadastro de contatos WhatsApp (037).
- State machine de conversa (042), anti-loop (041), canal (043).
- Orçamento avulso de serviço — limpeza de reservatório de água potável,
  dedetização, ou combo dos dois (Migration 060, `orcamentos.tipo`),
  mesma tabela/timbrado do orçamento de peças mas PDF descritivo por
  cláusulas (Objeto/Escopo/Garantia) com valores separados no final.
- Valor unitário opcional em item de orçamento de peças + total manual
  (Migration 062, `orcamento_linhas.valor_unitario` nullable) — item sem
  preço lançado some da coluna de valor no PDF em vez de "R$ 0,00";
  `orcamentos.valor` vira override manual do total quando a soma automática
  não reflete o total real.

- FKs de autoria → `usuarios` sem `ON DELETE` (023, 026, 030, 032, 035)
  convertidas para `ON DELETE SET NULL` (Migration 073) — eram o que impedia
  remover qualquer usuário que já tivesse criado ou aprovado algo.

## Push notifications no app (Fase 7G) — planejado 📋

**Contexto:** pedido do usuário em 2026-07-28 — o técnico não fica sabendo de
chamado novo. Hoje o app **não tem notificação nenhuma**: o único mecanismo é o
polling de 30s em `app/public/app.js` (`TC.polling`), que só roda **enquanto a
tela de chamados está aberta**. Celular no bolso = técnico não sabe de nada.

**Correção de premissa:** esta fase estava marcada como "⏸️ depende da 7J
(publicação nas lojas)". **Não depende** — FCM funciona em APK instalado na mão,
sem loja. A dependência era falsa e travava a fase à toa.

**Decisão de abordagem:** push real via **FCM**, não notificação local disparada
pelo polling. O porquê está em [`decisions.md`](decisions.md#app-mobile).

**Escopo no código:**
- Plugin `@capacitor/push-notifications`; registro do token do aparelho no login
  e limpeza no logout.
- Migration nova: tabela de tokens por técnico (um técnico pode ter mais de um
  aparelho; token do FCM rotaciona, então precisa de upsert + expurgo dos
  inválidos devolvidos pelo envio).
- Serviço de envio no backend, disparado quando um chamado **ganha
  `tecnico_id`**. São **três** caminhos, todos precisam do gatilho:
  1. atribuição manual (`PATCH /chamados/:id`);
  2. chamado automático de telemetria (`abrirChamadoAuto` em
     `src/services/chamados.service.js`);
  3. preventiva de plano (`executarPlano` em `src/jobs/planos-manutencao.job.js`,
     quando a zona resolve um responsável).
- Permissão `POST_NOTIFICATIONS` em runtime — obrigatória desde o Android 13 e
  inescapável agora que o app targeta API 36.

**Pré-requisitos externos (fora do código):**
1. Projeto no Firebase + `google-services.json` em `app/android/app/`.
2. Credencial de servidor do FCM nas envs do Railway.

Facilitador já pronto: `app/android/app/build.gradle` aplica o plugin
`com.google.gms.google-services` **se** o `google-services.json` existir — o
bloco está lá desde o início, nunca foi usado.

**Ordem sugerida:** fechar a 7J primeiro (o app precisa estar publicável e com o
GPS validado); push é feature nova e não deve competir com o prazo de 31/08.

## Nota fiscal (NFS-e) — planejado 📋

**Contexto:** emissão de NFS-e (Nota Fiscal de Serviço Eletrônica) vinculada
ao orçamento aprovado. Viável via gateway que abstrai as APIs municipais.

**Como funcionaria no sistema:**
- Botão "Emitir NFS-e" no orçamento aprovado → chama API do gateway → salva número, XML e PDF da nota vinculados ao orçamento/cliente.
- Reenvio por e-mail junto com o PDF do orçamento (Resend já integrado).
- Campo `nota_fiscal_numero`, `nota_fiscal_pdf_url`, `nota_fiscal_emitida_em` na tabela `orcamentos` (nova migration).

**Gateways candidatos:** Focus NFe, eNotas, NFe.io (~R$0,10–0,50/nota).
Todos expõem REST simples; a integração no backend é de 1–2 dias após setup.

**Pré-requisitos externos (fora do código):**
1. CNPJ ativo com regime tributário definido (contador).
2. Contratação e configuração do gateway (chave API + dados fiscais).
3. Credenciais do município (alguns exigem login no portal da prefeitura).

**NF-e de produto:** possível no futuro se houver venda de peças além do
serviço. Mais padronizada (SEFAZ federal) mas exige certificado digital A1.

---

## Backlog futuro (ideias não-MVP já mapeadas)

Itens levantados durante o desenvolvimento, conscientemente deixados para
depois. Nenhum é bloqueante.

- **Job de email de renovação de contrato** (60/30/15 dias antes de `fim_em`) —
  Resend já integrado, é trivial adicionar.
- **Notificação à equipe comercial** quando entra orçamento `origem='ia'
  status='rascunho'` (hoje só aparece na aba; falta email/push ativo).
- **Histórico de contratos** do mesmo condomínio (listar inativos) — basta o
  filtro `?ativo=false&condominio_id=X` no endpoint atual.
- **Carimbo do tempo de terceiro independente pra assinatura de contratos** —
  hoje a evidência (protocolo/IP/hora) usa só o relógio do próprio servidor.
  Toda autoridade certificadora acreditada ICP-Brasil (RFC 3161) é paga; se
  quiser reforçar sem custo, dá pra avaliar algo como OpenTimestamps (âncora
  em blockchain, gratuito, mas com confirmação não-instantânea). Ver
  [`decisions.md`](decisions.md#segurança-e-rbac).

## Visão de produto de longo prazo

- IA especializada no domínio via few-shot → fine-tuning (Fase 10).
- App nas lojas com push nativo.
- Possível: multi-empresa white-label, health do device (qualidade de sinal),
  múltiplas sondas por reservatório (itens do roadmap original do README).
