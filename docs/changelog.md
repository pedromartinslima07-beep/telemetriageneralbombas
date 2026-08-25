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
| 065 | orcamento_cliente_avulso | `orcamentos.cliente_nome/documento/endereco/email` — orçamento para pessoa física não cadastrada (sem condomínio) |
| 066 | zona_multiplos_responsaveis | `planos_zona_responsavel` deixa de ter `zona` como PK — vários técnicos por zona |
| 067 | idx_chamados_tecnico | índice para `GET /chamados/meus`, a consulta mais chamada do app do técnico |
| 068 | orcamento_linha_tipo_servico | `orcamento_linhas.tipo_servico` — marca a linha que vira cláusula no PDF, no lugar do regex na descrição |
| 069 | leads_landing | tabela `leads` — contatos da landing pública |
| 074 | orcamento_resposta_cliente | `orcamentos.cliente_comentario/respondido_em/respondido_por (SET NULL)` + índice parcial `(condominio_id, status)` — o cliente responde ao orçamento pelo painel; `respondido_por` é sempre o CLIENTE, separado de `aprovado_por`, que continua podendo ser quem digitou no escritório |
| 075 | login_codes_tentativas | `login_codes.tentativas SMALLINT` — teto de 5 erros **por código**, porque o teto por IP não segura quem tem muitos IPs |
| 076 | orcamento_quem_respondeu | `orcamentos.respondido_nome/respondido_cargo` (quem decidiu, não qual conta) + `resposta_vista_em` (nulo = ninguém do escritório abriu) + índice parcial do aviso |
| 077 | orcamento_respostas_antigas_vistas | marca respostas pré-existentes como vistas, para o aviso não nascer gritando sobre trabalho já feito |
| 073 | fk_usuarios_on_delete_set_null | toda FK → `usuarios` que estava em NO ACTION vira `ON DELETE SET NULL` (autoria em `sla_definicoes`, `orcamentos`, `planos_manutencao`, `contratos`) — era o que travava a remoção de usuário |
| 072 | os_equipamento | `ordens_servico.equipamento_id (SET NULL)` — fecha o triângulo O.S./equipamento/orçamento; + `UPDATE` acertando `orcamentos.origem = 'os'` nos orçamentos de O.S. que nasciam como `'admin'` |
| 071 | orcamento_bancada | `orcamentos.origem` aceita `'bancada'`; `orcamentos.equipamento_id (SET NULL)` — liga a bomba na bancada ao orçamento, sem tabela de peças própria |
| 070 | equipamentos | `equipamentos` (identidade permanente + `codigo` do QR), `equipamento_movimentacoes` (linha do tempo, com snapshot do autor), `equipamento_fotos` (`dados_base64` no banco); `chamados.equipamento_id`. Ver [equipamentos.md](modulos/equipamentos.md) |

## Marcos de produto (fases do plano)

- **2026-08-18** — **Fase 12C: a O.S. entra no circuito**. `chamados` e
  `orcamentos` já apontavam para `equipamentos`; a O.S., que é onde o técnico
  registra a retirada no campo, não apontava — então orçamento nascido de uma
  O.S. de conserto de bomba não movia nada na bancada.
  - Seletor de equipamento no modal de O.S. do admin; `_garantirOrcamentoDaOs`
    propaga o `equipamento_id`, e aprovar move a bomba pelo mesmo serviço que a
    bancada já usava. Os dois caminhos chegam no mesmo lugar.
  - ⚠️ O seletor **sempre inclui o equipamento já vinculado**, mesmo de outro
    condomínio: sem isso o `<select>` caía em "nenhum" e salvar a O.S. apagava
    o vínculo em silêncio. O defeito apareceu no primeiro teste.
  - Campo novo no detalhe da O.S. precisa entrar no SELECT explícito de
    `GET /ordens-servico/:id` — ele não usa `os.*`, para não arrastar a
    assinatura base64 em toda abertura.
  - **Bug pré-existente corrigido:** orçamento criado a partir de O.S. nascia
    com `origem = 'admin'` desde a migration 036, porque o INSERT não setava o
    campo. Código corrigido + `UPDATE` de acerto na 072.
  - Migrations 071 e 072 aplicadas em teste e **produção** em 18/08.

- **2026-08-18** — **Fase 12B: orçamento da bancada**. A ficha do equipamento
  passou a criar orçamento, e o orçamento passou a mover a bomba de volta.
  - **Sem tabela de peças própria**: o orçamento da bancada é um `orcamentos`
    comum com as peças como `orcamento_linhas` — assim PDF, envio por e-mail e
    aprovação vêm de graça do sistema que já existia (migration 030).
  - O técnico lista **peça e quantidade, não preço**: quem está na bancada sabe
    o que falta, quem precifica é o comercial. Sem valor lançado a linha fica
    `NULL` (migration 062) e o PDF omite a coluna daquele item.
  - **Aprovar/recusar no painel move a bomba** (`equipamento-bancada.service.js`):
    aprovado → `em_conserto`, recusado → volta para `oficina`. O reflexo nunca
    derruba a atualização do orçamento — o documento comercial é a fonte da
    verdade, o estado do equipamento é consequência.
  - **O pedido da bancada aparece em "Solicitados pelos técnicos"** (18/08, a
    pedido do Pedro depois de ver o teste): foi um técnico que pediu, ainda que
    sem O.S. A aba passou a juntar duas fontes — O.S. com orçamento necessário
    e orçamentos `origem = 'bancada'` — via duas consultas concatenadas em JS,
    não UNION. Clicar numa linha da bancada abre o modal do avulso.
  - **Um conserto, um orçamento** (18/08): a mesma bomba podia ser pedida pela
    O.S. em campo E pela etiqueta na bancada, gerando dois orçamentos abertos
    para o mesmo serviço — reproduzido em teste, três registros apontando a
    mesma bomba. Agora a ficha reaproveita orçamento aberto, ou nasce vinculada
    à O.S. pendente; e `_garantirOrcamentoDaOs` adota o pedido da bancada em vez
    de abrir um segundo. Os três cenários verificados.
  - Ciclo verificado ponta a ponta no banco de teste: solicitar pela ficha →
    aparecer em Orçamentos › Avulsos com o condomínio certo → aprovar → bomba
    em `em_conserto` com a movimentação registrada.

- **2026-08-18** — **Ficha do equipamento redesenhada: "próxima ação única"**.
  A v1 era quatro caixas de peso igual (Registrar/Fotos/Dados/Histórico) — o
  Pedro apontou como "100% genérico", e estava certo: é o layout que qualquer
  CRUD produz. Agora um único bloco elevado responde *o que aconteceu com essa
  bomba agora* e oferece **uma** ação, com as demais recolhidas.
  - **Trilho do ciclo** (No prédio → Oficina → Pronta → Devolvida) como
    conteúdo, não enfeite: a posição vem das movimentações e acende ao carregar.
  - **Tempo no estado virou sinal**: 7 dias na oficina acende âmbar, 15 vermelho.
  - O relato do defeito ganhou **procedência** ("relatado por X ao retirar") —
    relato sem autor vira boato.
  - Correções de craft: `--muted2` em texto dava ~2,5:1 de contraste (piso é
    4,5:1); `<img>` sem `src` piscava ícone quebrado até o blob chegar;
    delegado de clique em `$root` empilhava um handler por recarga.
  - Continua **Mission Control**, não "Chapa": a fronteira é cliente × operação.
    O detector do Impeccable acusa ~20 desvios de DESIGN.md por comparar com o
    sistema errado — falsos positivos estruturais, documentados no módulo.

- **2026-08-17** — **Equipamentos com etiqueta QR (Fase A)**. Migration 070,
  router `/equipamentos`, `etiquetas-pdf.service.js` (Puppeteer + `qrcode`),
  ficha `/e/:codigo` e seção Equipamentos no admin. Fluxo e pegadinhas em
  [equipamentos.md](modulos/equipamentos.md).
  - **A dor**: bomba na bancada da oficina sem ninguém saber de qual prédio veio
    nem qual era o defeito. Até aqui só `reservatorios` tinha identidade.
  - **Etiqueta permanente do equipamento**, não da passagem pela oficina — a
    mesma bomba volta várias vezes e é o histórico anterior que se perde.
  - **Etiqueta nasce em branco**: a bomba chega antes do cadastro existir. O
    lote é impresso e fica na van; o vínculo acontece na retirada.
  - **Sem plugin de scanner**: a câmera nativa do Android abre a URL do QR.
    Mexer no build Android competiria com o prazo da Play Store (7J).
  - **Código aleatório** (base32 Crockford, 8 caracteres, sem I/L/O/U) — a ficha
    revela endereço de cliente, uma URL sequencial exporia o parque inteiro.
  - Novo guard **`equipeInterna`** (admin, gerente, operador, técnico): quem
    escaneia na bancada é o técnico, que não passa em `adminOnly`.
  - `?next=` no `login.js` com allowlist estreita — sem isso o técnico escaneia,
    loga e cai no painel, tendo que escanear de novo.
  - ⚠️ **Foto servida por rota autenticada**, carregada com `fetch` + object URL.
    A rota equivalente de `os_fotos` é pública "para compatibilidade com
    `<img src>`"; aqui não dava, porque o id da foto é sequencial e o conteúdo é
    o interior da casa de máquinas de um cliente.
  - ⚠️ O gerador de etiquetas **recusa** QR apontando para host local. Etiqueta
    é física e permanente: um QR com `localhost` vira lixo colado numa bomba.
  - Validado contra o backend real (banco de **teste**) e no navegador: lote,
    PDF, vínculo, ciclo de movimentações, upload de foto e os guards de 401/403/404.
    Migration aplicada em **teste e produção** no mesmo dia.

- **2026-08-06** — **Painel de detalhe gruda no topo nas 5 telas master-detail**
  (só CSS)
  - **Sintoma (relatado pelo Pedro, na aba Orçamentos):** para ver os
    orçamentos salvos é preciso clicar no condomínio e ler o painel da direita.
    Se o condomínio estiver lá embaixo, rolar até ele levava o painel junto
    para fora da tela — e ver o resultado do clique exigia rolar tudo de volta.
  - **Medido no harness** (cadeia real `.content > .section.is-active >
    .ch-layout`, `admin.css` real, 28 condomínios, 1440×900): depois de rolar
    até o fim, o painel ficava em `top: -430px`, com **56px de 486 visíveis**.
  - ⚠️ **Achado do diagnóstico:** a lista **não rola por dentro**, apesar do
    `overflow-y: auto` em `.ch-list-col .tableWrap`. `.ch-list-col` é
    `align-self: stretch` numa linha de altura automática, então nada limita a
    altura dele e o `auto` nunca engata — quem rola é o `.content`. Foi por
    isso que a correção é `position: sticky` no painel, e não "fazer a lista
    rolar sozinha": mexer na altura da coluna esquerda mudaria as 5 telas.
  - **Correção:** `.ch-detail-col` ganhou `position: sticky; top: 0` e
    `max-height: calc(100vh - var(--topbar-h) - 44px)` (com o `overflow-y:
    auto` que já tinha, painel comprido rola por dentro em vez de nascer com o
    rodapé fora da tela). `.ch-detail-col.al-painel` trocou `max-height: none`
    pelo mesmo teto — 700px fixos herdados de `.al-painel` deixariam o pé do
    painel inalcançável agora que ele é sticky.
  - **Depois:** 486 de 486px visíveis com a lista rolada até o fim. Com painel
    comprido (14 orçamentos) o teto segura tudo dentro da viewport e o painel
    rola por dentro — conferido em 1440×900, 1366×768 e 1280×700.
  - **Vale para as 5 telas que usam `.ch-layout`:** Alertas, Clientes,
    Chamados, Orçamentos (os dois modos) e Colaboradores. O `@media
    (max-width: 1100px)` que já existia neutraliza `sticky` e o teto quando o
    layout empilha — conferido a 1024×800.
  - **Painel do cliente entrou junto.** Usa as mesmas classes em Alertas e
    Chamados e carrega o mesmo `admin.css`, mas estava preso em
    `admin.css?v=159` — alinhado em `v=189`. O `?v=` é só chave de cache (o
    servidor sempre entrega o arquivo atual), então quem chegava com cache
    frio **já recebia** o CSS novo; o alinhamento serve para quem tinha cópia
    velha. Medido com 80 alertas: sem o fix o painel ia para `top: -2717px`,
    **0 de 381px visíveis**; com o fix, 381 de 381. Igual em Alertas e
    Chamados, a 1440×900 e 1366×768.
    ⚠️ Quem estava preso no `v=159` pula 30 versões de `admin.css` de uma vez.
    Compartilhado e consumido pelo cliente: `.modalBox` (fio âmbar no topo),
    `.modalBody`/`.modalTools`/`.modal-sec-title`, `.f span`, `.input`,
    `.tel-select`/`.tel-historico-ctrls`/`.tel-filtros`. Nada disso foi
    conferido no painel do cliente — vale uma passada visual.
  - ⚠️ **Central de Atendimento (WhatsApp) tem o mesmo defeito e ficou de
    fora.** Usa `.wa-grid` (grid de 3 colunas), não `.ch-layout`, então não
    herdou nada. Medido com 60 conversas: a página rola 3087px, a coluna da
    lista não rola por dentro (3838px) e a de info estica junto — depois de
    rolar até o fim ela fica em `top: -2975px`. Não corrigido porque a seção
    está escondida do menu desde `c825f66` e porque o conserto ali não é
    "gruda o aside": as 3 colunas esticam juntas, é preciso limitar a altura
    do `.wa-grid` para cada uma rolar por dentro — mudança maior, que pede o
    módulo rodando para validar.
  - `sw.js` intocado: `.css`/`.js` já são **network first** lá (`cache:
    "reload"`), então mudança de conteúdo de CSS não exige bump de
    `CACHE_NAME` nem de `register-sw.js`.
  - Cache-bust: `admin.css?v=189` (admin **e** cliente), `admin.js?v=280`.

- **2026-08-06** — **Modal do histórico tremia com o mouse na ponta direita do
  gráfico** (só frontend)
  - **Sintoma (relatado pelo Pedro):** passando o mouse na extrema direita do
    gráfico, o modal tremia e a informação do tooltip aparecia e sumia.
  - **Causa, medida em harness (markup real + `admin.css` real + ApexCharts
    real, 1440×900):** o `.apexcharts-xaxistooltip` — o rótulo de data que o
    Apex desenha **abaixo** do eixo X — é centrado no cursor e o Apex não o
    prende à caixa do gráfico. Na ponta direita ele saía **5px pela direita**
    e 14px por baixo do `.modalBody`.
  - **O que transformou 5px num laço:** `.modalBody` tem `overflow-y: auto`, e
    pela regra do CSS, quando um eixo não é `visible`, o outro computa de
    `visible` para **`auto`** — confirmado com `getComputedStyle`
    (`overflowX: "auto"`). Então o corpo era rolável na horizontal também.
    Ciclo: barra de rolagem aparece → come ~15px de altura → o
    `.tel-historico-chart` (`flex: 1`) encolhe → o ApexCharts (`height:
    "100%"`) se redesenha → o hover se perde → o rótulo some → o overflow
    acaba → a barra some → tudo cresce de volta → recomeça. Em Windows a
    barra clássica ocupa espaço de layout, por isso o efeito aparece lá.
  - **Correção (duas linhas):** `xaxis.tooltip.enabled: false` no `admin.js` —
    o rótulo repetia a data que o cabeçalho do tooltip já mostra em
    `dd MMM HH:mm` — e `.tel-hist-modal .modalBody { overflow-x: hidden }`
    como rede, para qualquer outro overlay do Apex que resolva vazar.
  - **Medição antes → depois**, mesmo harness, varrendo o gráfico até a borda
    e parando 1,5s na ponta: frames com overflow horizontal **90 → 0**,
    vertical **92 → 0**, `scrollHeight == clientHeight`, tooltip sem piscar.
    Repetido em 1440×900, 1366×768 e 1280×720.
  - ⚠️ **Tentativa descartada, e por quê:** a primeira correção deu altura fixa
    à `.tel-hist-box` e `overflow: hidden` no corpo. Matava o tremor, mas
    **cortava a linha de datas do eixo X** — o canvas do Apex é **47px mais
    alto que o contêiner** com `height: "100%"` (constante, medido em 4
    combinações; `chart.parentHeightOffset` não altera isso), e era a rolagem
    vertical do corpo que mantinha esses 47px alcançáveis. Por isso a rolagem
    vertical continua `auto` de propósito: só a horizontal foi bloqueada.
  - ⚠️ **O mesmo `xaxis.tooltip` duplicado existe no painel do cliente**
    (`telCliHistChart`, `public/cliente.js`). Lá **não treme** — o gráfico mora
    num `.card`, que tem `overflow: hidden` e não é contêiner de rolagem — mas
    o rótulo é cortado na borda. Não mexido nesta sessão: `cliente.html` tem
    cache-bust próprio (`admin.css?v=159`) e pede a sua própria conferência.
  - Cache-bust: `admin.css?v=188`, `admin.js?v=279`.

- **2026-08-06** — **Um nível baixo parava de virar dezenas de alertas** (3
  correções independentes)
  - **Sintoma relatado:** o reservatório de teste gerava "2 alertas diferentes"
    ao chegar em percentual baixo.
  - **(1) Alerta de telemetria + chamado `[AUTO]` eram o mesmo evento em duas
    linhas.** `POST /telemetria` grava o alerta e chama `abrirChamadoAuto`; a
    página de Alertas listava os dois sem correlacionar (`TEL-1783` e `CH-65`
    lado a lado). Agora `_alChamadoDoAlerta` agrupa por condomínio+categoria: o
    chamado é o card, com selo "+ telemetria". Badge e KPI passaram a contar
    pela mesma lista (`_alertasAtivosUnificados`) — antes diziam 2 para o que a
    tela mostrava como 1. Chamado que absorve telemetria conta como alerta
    mesmo sendo P3/P4 e herda a maior severidade das duas origens.
  - **(2) `nivel_baixo` e `nivel_muito_baixo` ficavam abertos ao mesmo tempo.**
    O `if (nivelMudou)` comparava com `last_nivel` — o nível da última leitura
    **gravada** — mas o write-threshold descarta a maioria das leituras, então
    o UPDATE de "resolvido" era pulado. Confirmado: 5 pares coexistindo em
    produção, o maior por 2min40s. O estado de nível agora vem dos **alertas
    abertos do device** (carregados na mesma query, sem round-trip extra) e a
    resolução roda em toda leitura. Auto-cura os registros já inconsistentes.
  - **(3) Histerese de 5 pontos** (`TELEMETRIA_HISTERESE_PCT`): piorar de faixa
    vale na fronteira nua, melhorar exige folga. Sem ela, um nível parado sobre
    uma fronteira gera alerta a cada ~10s, porque os alertas são reprocessados
    em toda request e o ruído do ADC decide o lado. Medido: uma descida de 37%
    a 0% criou **17 alertas** (deveriam ser 2); em simulação a lógica nova fica
    em 2, e no cenário "parado na fronteira por 20 min" cai de 35 para 1.
    `leituras.nivel` continua cru — a histerese governa só os alertas.
  - Sem migration. `POST /telemetria` passou a devolver também `nivel_alerta`.
  - **Diagnóstico de hardware (não virou código):** o ruído do ADC é de ±1,7%,
    não os ±6,9% que a tabela `leituras` sugeria — ela só guarda amostras que
    saltaram ≥5%, o que enviesa qualquer estatística tirada dela. A série crua
    do Serial Monitor mostra ruído branco (autocorrelação -0,127), então **não
    há aliasing** e a amostragem do firmware está correta. Fica pendente só a
    recalibração: 25 de 76 amostras cruas passam do topo da escala e são
    achatadas em 100% pelo `Math.min` de `calcularNivelPct`.

- **2026-08-06** — **Modal "Editar condomínio" ganha o padrão de trilho do
  orçamento** (só frontend, sem migration e sem endpoint novo)
  - **Medido antes:** 14 campos em `.formGrid` de 2 colunas dentro de um
    `.modalBox` de 1100px, com o mini-mapa de 280px empilhado no fim. O corpo
    rolava ~520px, e as duas coisas mais usadas da tela — o mapa e o "Salvar
    alterações" — só apareciam depois de rolar até o fim. Conferir se o pino
    bateu com o endereço digitado exigia subir, corrigir e descer de novo.
  - **Casca compartilhada nova:** `.modalBox.is-split` + `.modal-split` +
    `.modal-split-form` + `.modal-rail` (em `admin.css`, ao lado do
    `.modal-2col`) generalizam o que o modal de orçamento fez em `#avModal`:
    janela de altura fixa, uma coluna que rola e um trilho que não sai da
    vista. Serve pra qualquer modal com muito campo e uma ou duas coisas que
    precisam ficar sempre visíveis. Disponível pros outros; aplicada só aqui.
  - **O trilho recebeu o mapa, o status e as ações.** O mapa absorve a sobra de
    altura do trilho (`flex: 1`, mín. 190px) — é o bloco que mais ganha com
    espaço e o único que encolhe sem perder função. Lat/lng viraram leitura em
    mono embaixo dele, como todo dado numérico do painel.
  - **"Ativo" saiu do meio do formulário** (estava entre "Zona" e
    "Observações") e virou a primeira coisa do trilho, com a consequência
    declarada antes do clique: desmarcar tira o condomínio do painel **e**
    derruba o login do cliente (`clienteOnly` valida `condominios.ativo` a cada
    request desde 30/07). Antes era uma checkbox sem nenhum aviso.
  - **"Excluir permanentemente" perdeu a cara de botão** — era um `.btnDanger`
    sólido do mesmo tamanho do "Salvar", duas ações de peso visual igual e
    consequências opostas. Virou `.modalFoot-danger` no pé do trilho, como o
    "Excluir orçamento". O aviso "esta ação é irreversível" saiu: quem clica
    cai no modal de confirmação, que já lista os logins que serão apagados.
  - **Grade de 6 colunas** no lugar das 2 iguais: "UF" (2 caracteres) ganhava
    os mesmos ~520px que "E-mail". Agora cada campo ocupa a largura que o
    conteúdo pede (UF 1/6, CEP 2/6, Logradouro 4/6, Observações 6/6).
  - **A faixa de abas com uma aba só ("Dados") saiu** — 37px de altura para
    nenhuma escolha. O `.edit-tab-pane` e o `_editAtivarTab` continuam no
    lugar, intactos, para quando voltar a existir mais de uma aba.
  - **Mensagem de estado foi pro trilho, ao lado do botão que a provoca**
    (estava no topo do corpo, fora da vista de quem acabou de clicar em
    Salvar) e ganhou cor: `_editMsg(texto, tipo)` pinta erro em vermelho e
    sucesso em verde. Antes o erro do backend saía em cinza claro do lado de
    um botão amber. Textos reescritos na voz da interface — "Não deu para
    salvar (erro 409)" no lugar de "Erro ao salvar (409)", "Preencha a razão
    social" no lugar de "Nome é obrigatório", "Alterações salvas."
  - **Camada compartilhada, efeito em todos os `.f`:** `.f span em` (dica
    dentro do rótulo, fora da caixa alta), `.f span b` (asterisco de
    obrigatório em amber) e `.f span.cep-msg` — esta última corrige o retorno
    do CEP, que herdava caixa alta e peso 700 do rótulo e saía gritando mais
    que o nome do campo.
  - **Removidos** `.loc-block` / `.loc-head` / `.loc-coords` do `admin.css`:
    o bloco de localização virou o trilho e o modal de novo cliente já montava
    o próprio painel. Sem consumidor em `public/`, `app/public/` ou nos
    serviços de PDF — conferido por grep no repo inteiro antes de remover.
  - **Contrato com o JS preservado:** todos os ids continuam os mesmos
    (`editCnpj`, `editCep` com `data-cep-target-prefix`, `editMiniMapa`,
    `editLat`/`editLng`, `editAtivo`, `btnHardDeleteNoEdit`…). O "Salvar"
    ficou dentro do `<form id="editForm">`, que agora envolve as duas colunas —
    submit nativo, sem atributo `form=`.
  - ⚠️ **Pegadinha repetida:** `.edit-tab-pane` fica **entre** o `.modalBody` e
    o `.modal-split`. Sem repassar o flex nele, o `flex: 1` do layout não
    alcança e o formulário vaza pra fora da janela de altura fixa — exatamente
    o que o `#avModalBody` fez no modal de orçamento. Vale pra qualquer
    wrapper intermediário que entrar nessa cadeia.
  - **Verificado em harness estático** (Puppeteer + o markup real recortado do
    `admin.html`, com o `admin.css` real): 1440×900, 1366×768, 1440×720 e
    1024×900. Em 1440×900 e 1366×768 **nada rola** — os 14 campos e o trilho
    inteiro cabem na janela. Em 1440×720 sobram 37px de rolagem no formulário.
    Abaixo de 1080px vira coluna única: o `.modalBody` volta a `display: block`
    porque, como flex, a compressão da janela fixa criava **dois** scrollers
    empilhados (522px presos no formulário + o trilho rolando por conta
    própria). Nada rodou com backend real nem com o Leaflet carregado.
  - Cache-bust: `admin.css?v=187`, `admin.js?v=278`. Nenhum endpoint novo →
    `sw.js` e `register-sw.js` intocados.

- **2026-08-06** — **Atribuir técnico/responsável passa a contar como primeira
  resposta (TTFR)**
  - **Sintoma:** chamado atribuído a um técnico continuava com badge `⚠ SLA` e
    aparecia como alerta crítico, porque `primeira_resposta_em` seguia `NULL`.
  - **Causa:** em `PATCH /chamados/:id` (`src/routes/chamados.routes.js`), o
    hook de `primeira_resposta_em` estava dentro do `if (status)`. Como o PATCH
    só aceita status `aberto`/`fechado` (`em_atendimento` é exclusivo de
    `/iniciar-atendimento`), na prática **só fechar o chamado** marcava TTFR
    por essa rota — e o front manda a atribuição num PATCH com apenas
    `tecnico_id` no body.
  - **Correção:** flag `tocouOChamado` acumulada ao montar o UPDATE; além da
    transição de status, `tecnico_id` e `responsavel_id` **não-nulos** marcam
    TTFR. Desatribuir (`null`) não marca — ninguém passou a olhar pro chamado
    por causa disso. O `COALESCE(primeira_resposta_em, NOW())` continua
    garantindo que reatribuição não sobrescreve o primeiro toque.
  - Alinha o comportamento ao que a própria UI já prometia em Configurações ›
    SLA ("atribuir, responder, iniciar atendimento"). Sem migration.
  - ⚠️ **Pendência conhecida:** `sla_definicoes.sla_chegada_min` (criado na 028)
    continua sem uso — não é editável na tela de SLA e nenhuma query calcula
    estouro de chegada, apesar de `docs/modulos/chamados-sla.md` dizer que o
    SLA mede chegada do técnico.

- **2026-07-31** — **Janela de expediente do GPS sai do WebView e vira regra do
  backend** (pin de técnico aparecia no mapa às 19h)
  - **Sintoma:** pin de técnico no mapa fora das 08h–18h. Como
    `GET /tecnicos/localizacao` filtra por `atualizada_em > NOW() - 30 min`, o
    pin visível às 19:32 significava ping recente — não resíduo das 18h.
  - **Causa (regressão de 2026-06-10, `975a30a`):** a janela nasceu correta em
    22/05, quando quem coletava GPS era o `watchPosition` da própria WebView —
    JS coletava, JS postava, JS policiava o horário, uma camada só. Ao mover a
    coleta pro `NativeGpsService` (Java) pra sobreviver à tela apagada, **a
    janela ficou pra trás no JS**: o `setInterval` de 60s só manda um `stop()`
    pro serviço, e o Android congela os timers da WebView com o app em
    background. Pior, o serviço é `START_STICKY` — se o sistema mata o processo,
    ele volta sozinho a partir do SharedPreferences, sem WebView pra pará-lo.
  - **Backend passou a ser a fonte única** (`tecnicos-localizacao.routes.js`):
    `janelaExpediente()` + `dentroDoExpediente()`. `POST /tecnicos/localizacao`
    fora da janela responde `{ok:true, ignorado:"fora_do_expediente"}` **sem
    gravar** — 200 de propósito, como o ramo de precisão ruim, pra não pôr o
    serviço Java em retry. `GET /tecnicos/localizacao` devolve `[]` fora da
    janela (senão uma posição das 17:59 ficava pinada até 18:29).
  - **Fuso fixo em `America/Sao_Paulo`**, via `Intl.DateTimeFormat` com
    `hourCycle: "h23"` (sem ele meia-noite vira "24" em algumas versões do ICU).
    O Railway roda em UTC — `getHours()` daria 22 às 19h de SP.
  - **Config inválida (`inicio >= fim`) cai no default 8–18, nunca em "sem
    janela"** — um valor errado no banco não pode desligar o rastreamento em
    silêncio. `0–24` continua sendo a forma documentada de desligar.
    `GET /tecnicos/config` passou a servir pelo mesmo helper, pra app e servidor
    não discordarem sobre o que é config inválida.
  - **`NativeGpsService` ganhou a janela** (`EXTRA_EXP_INI`/`EXTRA_EXP_FIM`,
    persistidos em SharedPreferences junto do resto, senão o START_STICKY
    ressuscitaria o serviço sem janela): `dentroDoExpediente()` com
    `Calendar` em `America/Sao_Paulo` barra o POST na origem. O JS passa os
    valores no `NativeGps.start()` e **reabre o watch** quando a janela muda em
    `aplicarConfigOperacional` — sem isso o serviço seguiria com a janela antiga
    gravada, e é ele quem posta em background.
  - `migrations/restaurar-defaults.sql` passou a incluir `gps.expediente_inicio`
    e `gps.expediente_fim`: eram o caminho documentado de voltar ao padrão, mas
    não tocavam nessas duas chaves (que `seed-teste.js` grava como 0/24).
  - ⚠️ **Não recupera bateria:** o serviço continua com o GPS ligado fora da
    janela, só não posta. Desligar o hardware e religar às 08h exige
    `AlarmManager` (`setExactAndAllowWhileIdle`) — `Handler.postDelayed` usa
    `uptimeMillis`, que congela em deep sleep, e um religamento tardio custaria
    rastreamento em horário de trabalho. Ficou como escolha conservadora.
  - Validado com 22 asserções sobre a lógica de janela (conversão UTC→SP,
    bordas 07:59/08:00/17:59/18:00, meia-noite, 0–24, configs inválidas).

- **2026-07-31** — **KPI do dashboard vira atalho de navegação (sai o modal do
  meio do caminho)**
  - **O caminho era:** KPI → tooltip de prévia → **modal-tabela** → botão "Ver
    detalhes" → **drawer**. Três camadas sobrepostas pra mesma informação, com
    dois padrões visuais empilhados (modal centralizado, depois drawer lateral).
    No caso mais comum — 1 item — o modal era uma tabela de **uma linha**, com
    busca e contador: um clique a mais pra chegar onde já se queria. E ao abrir
    o drawer o modal fechava, sem caminho de volta pra lista.
  - **Agora o KPI leva direto à seção que já sabe listar aquilo, filtrada.**
    Some uma camada, cai-se num lugar onde dá pra trabalhar (buscar, ordenar,
    abrir vários) e o "voltar" existe de graça: fechar o drawer devolve a lista.
  - Destinos escolhidos pra que **o número clicado seja o número de linhas**:
    `offline` → Telemetria com "Somente offline" (mesmo `_statusData` do KPI);
    `nivel_baixo`/`nivel_muito_baixo` → Alertas filtrado por tipo (mesmo
    `_alertasAbertos`); `com_alerta` → Alertas sem filtro de tipo.
    Não derivar o filtro de telemetria de `nivel_pct`: os KPIs de nível contam
    alertas abertos e a conta daria diferente.
  - **Filtros novos, permanentes** (servem sozinhos, não só como destino):
    select de **tipo** em Alertas e de **situação** em Telemetria.
  - Os contadores das tabs de Alertas passaram a respeitar o filtro de tipo —
    senão a tab dizia "Todos 2" ao lado de uma tabela com 1 linha. Verificado no
    painel real: sem filtro 2/2, muito baixo 1/1, offline 0/0, chamados 1/1.
  - **"Condomínios OK" deixou de ser clicável** e sai como `<div rc-static>`:
    não existe drill-down útil pra "está tudo certo", e mandar pra uma lista sem
    filtro correspondente seria mentir sobre o número do card. A prévia no hover
    continua.
  - O rodapé do tooltip virou "Clique para abrir em «destino»" no lugar de
    "Clique para ver a lista completa".
  - ⚠️ **Código morto assumido:** `abrirModal`/`fecharModal`/`renderModalLista`
    e o `#modalOverlay` do HTML ficaram sem uso, marcados com comentário. Não
    foram apagados no mesmo commit por serem um componente inteiro — decisão à
    parte. `getListaPorKey` **não** é órfã: alimenta a prévia do hover.

- **2026-07-31** — **Mapa do dashboard abre em zoom fixo 11**
  - O enquadramento inicial era `fitBounds` sobre todos os condomínios com teto
    de zoom 13. Medido no painel real: dava **zoom 9** — região metropolitana
    inteira, com os 80 pinos empilhados num nó ilegível. Um único condomínio
    isolado ao norte (Bragança) estica o retângulo e afasta os outros 79.
  - Agora **zoom fixo 11**, centrado na **mediana** das coordenadas — não no
    centro do retângulo, que sofre do mesmo outlier. A mediana o ignora.
  - Medido no painel real, centro `[-23.5605, -46.6631]`: zoom 11 deixa **79
    dos 80** no enquadramento, com bairros legíveis. Referência descartada:
    zoom 10 pegava 71 e ainda ficava largo; zoom 12 só 50.
  - `MC_ZOOM_INICIAL` é constante no topo de `renderMcMap()` — trocar o
    enquadramento é mudar um número.

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

- **2026-08-04** — **Cards do dashboard esticavam com o conteúdo e
  desalinhavam a linha inteira.** Com 52 chamados abertos de uma vez, o card
  "Alertas Críticos" cresceu, o grid igualou a altura da linha e o mapa foi
  junto — layout todo torto.
  - Causa real não era o `overflow-y: auto` (já existia nas listas): era o
    `flex: 1` delas herdando **`min-height: auto`**, que impede um item flex de
    encolher abaixo do próprio conteúdo. A lista empurrava o card, que só tinha
    `min-height` e nenhum teto. O scroll interno nunca chegava a disparar.
  - Correção: `min-height` → **`height` fixo** nos seis cards (`.mc-map`,
    `.mc-alerts`, `.mc-activity` = 420px; `.mc-conv`, `.mc-telem` = 320px),
    `min-height: 0` nas listas e `flex: 0 0 auto` nos `.cardHead`.
  - No breakpoint mobile a regra também passou de `min-height` para `height`
    — `min-height` não vence altura fixa, então os cards empilhados ficariam
    presos nos 420px do desktop.
  - `.mc-map-canvas` perdeu o `min-height: 240px` do mobile: com o card em
    altura definida ele preenche por `flex: 1`, e o mínimo antigo só criaria
    overflow.

- **2026-08-04** — **Filtros desalinhados na toolbar de Contratos e Planos.**
  As duas telas reusam `.wa-tabs`, classe nascida na sidebar do WhatsApp, onde
  ela fica sob um campo de busca e por isso carrega `margin-top: 10px`. Dentro
  da `.al-toolbar` — um flex row com `align-items: center` — essa margem
  derrubava as abas 10px abaixo do eixo dos filtros.
  - Efeito colateral: `.wa-tabs` não tem `flex: 1` (a `.al-tabs`, feita pra
    essa toolbar, tem — mas não é usada em nenhum lugar do HTML). Sem isso
    `.al-filters` não era empurrada pra direita e ficava espremida ao lado das
    abas, a ponto de `select` e `input` quebrarem em duas linhas mesmo sobrando
    largura na tela.
  - Correção escopada em `.al-toolbar .wa-tabs` (`margin-top: 0`, `flex: 1`,
    `min-width: 0`), pra não afetar a sidebar do WhatsApp, que é o uso original
    e legítimo da classe.

- **2026-08-04** — **App dizia "GPS ativo" sem coletar nada quando a permissão
  era "só ao usar o app".** Investigação partiu de "a localização parou": o
  backend estava íntegro (janela 8–18 no default, 12h em SP, POST chegando), o
  que descartava regressão do `d05a0ac`.
  - Causa: `NativeGpsService.startLocationUpdates()` engolia o
    `SecurityException` de `requestLocationUpdates` num `Log.w`. O serviço
    subia, mostrava a notificação obrigatória e nunca entregava posição.
  - O pre-check de `_gpsAbrirWatch()` não pega o caso: `navigator.permissions`
    só reporta a permissão de primeiro plano, que com "ao usar o app" está
    concedida. O que falha é o serviço recriado **em background** pelo
    `START_STICKY` — aí o Android nega localização.
  - Agora o serviço emite o broadcast `ACTION_ERR`, o plugin relaia como evento
    `gpsError` (com `retainUntilConsumed`, pois o `start()` é assíncrono e o
    erro pode preceder o listener) e o JS mostra chip **"Sem permissão"** +
    aviso explicando trocar para "Permitir o tempo todo".
  - Aviso sem botão de propósito: o CTA existente chama `getCurrentPosition`,
    que pede permissão de **primeiro plano** — já concedida aqui, retornaria
    sucesso sem resolver. No Android 11+ o "o tempo todo" só existe nas
    Configurações do sistema.
  - `locationUpdate` passou a religar `GPS.active`: sem isso o chip ficaria
    preso em "aguardando" depois de o técnico corrigir a permissão.
  - Escopo deliberado: **não** foi implementada a detecção na abertura do app
    com atalho para as Configurações — fica em
    [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md).

- **2026-08-04** — **Edição de itens já lançados no orçamento.** Os endpoints
  `PATCH /admin/orcamentos/itens/:item_id` e
  `PATCH /admin/orcamentos/avulsos/linhas/:linha_id` já existiam e já aceitavam
  os quatro campos — **a lacuna era só de UI**. Nenhuma mudança de backend.
  - **Avulso**: `descricao` era uma `<div>` fixa. Dava pra editar ficha técnica,
    quantidade e valor, mas não o nome do item. Virou `<input>`.
  - **Por O.S.**: não deixava editar **nada** — a linha era texto puro com um
    `✕` de remover. Agora descrição, ficha técnica, quantidade e valor são
    editáveis, no mesmo padrão do avulso (salva no `change`, sem botão próprio,
    pra não criar um segundo estado sujo dentro de um formulário que já tem o
    seu).
  - Descrição vazia restaura o valor anterior no próprio campo em vez de deixar
    o 400 do backend voltar — o item não pode ficar sem nome.
  - Operador e visualizador continuam vendo texto puro: `viewer-only-hide` é
    CSS e aqui esconderia o dado junto com o campo, então a checagem virou
    `_orcSomenteLeitura()`, lendo as mesmas classes de `<body>` que a CSS usa.
  - Ambas as tabelas já usavam `.orc-itens-table`, então os inputs herdaram o
    estilo existente — sem CSS novo.

- **2026-08-05** — **Controles sumindo em tela de notebook (toolbars que não
  quebravam linha).** Sintoma relatado: na aba de Reservatórios o botão
  "+ Novo" simplesmente não aparecia. Não era `display:none` nem permissão —
  era **recorte silencioso**.
  - **Medido** com harness estático (markup real do `admin.html` + `admin.css`
    real, sem backend, Chrome headless via Puppeteer) em 1280/1366/1440/1536px.
    Em 1366px o card "Níveis dos Reservatórios" termina em `x=936`, mas o
    `.cardHead` precisava de **764px** pra 643px disponíveis — o "+ Novo"
    começava em `x=992`, **56px além da borda**. Como `.card` tem
    `overflow: hidden` e o `.cardHead` só ganhava `flex-wrap` em
    `max-width: 768px`, entre ~1280px e 1536px o botão era cortado inteiro,
    **sem scroll pra alcançá-lo**.
  - **Não era só a telemetria.** A varredura achou o mesmo padrão em 6 abas:
    `.wa-tabs` (Chamados, Orçamentos, WhatsApp, Colaboradores, Clientes) e
    `.mp-tabs` (Mapa) escondiam filtros como "P1 Crítico", "Resolvidos", "TI",
    "Gestor", "Aprovado", "Em atendimento" e a aba "Chamados". Nesses casos o
    `overflow-x: auto` dava scroll, mas **sem nenhuma affordance visual** —
    na prática ninguém descobria que dava pra rolar. WhatsApp quebrava até em
    1536px.
  - **Correção:** `flex-wrap: wrap` em `.cardHead`, `.wa-tabs` e `.mp-tabs`.
    Recorte nunca é o comportamento desejado; quebrar linha é estritamente
    melhor e só entra em ação quando o conteúdo não caberia mesmo.
  - **Pegadinha do flexbox** (custou duas tentativas): o empacotamento em
    linhas acontece **antes** do encolhimento e consulta o `flex-basis`, não o
    quanto o item poderia espremer. Com `basis: auto` o grupo `.tel-filtros`
    media 599px, estourava a linha e empurrava o "+ Novo" pra uma **terceira**
    linha sem nunca tentar encolher os selects. Baixar pra `flex: 1 1 115px`
    (com o `max-width: 180px` que já existia) faz o grupo medir 513px, caber
    numa linha só, e o `flex-grow` devolver a sobra.
  - **Segunda pegadinha:** `margin-left: auto` no `.tel-filtros` consumia o
    espaço livre **antes** do `flex-grow`, deixando o grupo 40px mais estreito
    que a linha — o "+ Novo" quebrava por 7px. Trocado por
    `justify-content: flex-end`, que alinha à direita sem roubar espaço.
  - **Verificado:** zero controles cortados em 1280/1366/1440/1536px, contra
    13 antes. Os dois "achados" restantes da varredura são falsos positivos
    conhecidos e propositais: `.rc::before` (brilho decorativo com
    `right: -20%`, recortado de propósito) e `.sr-only` (1px, leitor de tela).
  - Cache-bust: `admin.css` v163, `admin.js` v257.

- **2026-08-05** — **Modal de orçamento avulso reestruturado + polimento dos
  campos de formulário.** Só estrutura e hierarquia: paleta, fontes e raios
  continuam os mesmos do painel.
  - **Campos (`.input` / `.select`, globais).** O fundo era `rgba(255,255,255,.04)`,
    mais claro que o card; virou `var(--bg-soft)`, mais escuro — campo vazio é
    espaço a preencher, e afundar lê melhor que levantar. O foco trocou o anel
    de 3px por um sublinhado amber, porque o anel engordava a caixa e brigava
    com campos vizinhos em formulário denso (o modal de orçamento era o caso
    pior). Hover passou a acender a borda, que antes não dava retorno nenhum.
    O sublinhado é `box-shadow: inset`, **não** `border-bottom`: 2px de borda
    mudariam a altura do campo em 1px e desalinhariam as filter-bars que põem
    input e botão na mesma linha. Alcança também os `<textarea class="input">`.
    Ajustados junto os dois seletores que definiam fundo próprio e ficariam
    destoando: `.filter-bar .input/.select` e `.tel-select`.
  - **Modal (`_avRenderPainel`).** Problemas corrigidos:
    1. **O total não aparecia.** O número que decide o orçamento só existia
       como "Soma dos itens" no rodapé da tabela, ou escondido atrás do
       checkbox "definir valor total manualmente". Agora tem um **trilho
       sticky** à direita com o total em corpo grande, sempre visível.
    2. **O tipo tinha o peso de um campo qualquer**, num grid `1.4fr 1fr 1fr`
       ao lado de "data" — mas é ele que ramifica o PDF entre tabela de peças
       e texto por cláusulas. Virou escolha de documento no topo, 4 cards com
       uma linha dizendo o que cada um gera.
    3. **"Status" morava em Condições Comerciais** e duplicava a pill do
       cabeçalho. Foi pro trilho, junto de validade e tipo.
    4. **As 4 ações do rodapé eram indistinguíveis.** "Gerar PDF" (inócuo) e
       "Enviar por e-mail" (sai pra cliente real) tinham o mesmo botão, e
       "Excluir" ficava no canto esquerdo, no caminho. Agora: Salvar (amber) e
       Gerar PDF no trilho; envio em bloco próprio; Excluir discreto no pé.
    5. **"Cliente avulso" era checkbox** para uma troca de modo — virou
       segmentado Cadastrado / Avulso.
  - **Envio mostra o destinatário antes do clique** (`Vai para X com o PDF
    anexo`), e o botão fica desabilitado sem e-mail. Para isso o
    `GET /admin/condominios/lista` passou a devolver `email` — sem esse campo o
    destinatário ficaria congelado no condomínio original e mostraria o e-mail
    errado quando o operador trocasse o select.
  - **⚠️ Contrato preservado:** `avInputTipo`, `avToggleAvulso` e
    `avToggleValorManual` continuam existindo como `<select>`/`<checkbox>`, só
    que ocultos (`.av-hidden-ctl`). Os cards e o segmentado apenas setam o
    valor e disparam `change`. Todos os 20 ids que `_avAcao` lê por
    `getElementById` e as 5 `data-av-action` seguem idênticos — o salvamento
    não foi tocado.
  - A "Soma dos itens" do rodapé da tabela saiu: seria a mesma informação que
    o trilho, em dois lugares.
  - **Layout em zonas, não coluna vertical.** Primeira versão ainda era uma
    coluna rolável de 900px dentro de um modal de tela cheia — desperdiçava a
    largura e obrigava a rolar até o fim pra ver tudo. Reorganizado em:
    faixa de configuração no topo (tipo | cliente + constatação, duas colunas),
    **itens com a largura toda** absorvendo a sobra de altura, e condições
    comerciais em 5 campos numa linha no rodapé. A janela tem altura fixa
    (`min(92vh, 880px)`) e **só a zona de itens rola por dentro** — tipo,
    cliente, condições e trilho ficam sempre à vista, com 3 ou 30 itens.
    Largura foi de 900px para 1360px.
    Abaixo de 1280px as condições viram 3+2; abaixo de 1080px a altura fixa
    deixa de compensar e tudo volta a ser coluna única com rolagem de página.
  - **Ajuste fino medido no harness** (Puppeteer + markup real extraído do
    `admin.js`, mesmo padrão da varredura de responsividade). Sete correções,
    todas encontradas *olhando o render*, não lendo o código:
    1. **O conteúdo vazava 246px pra fora do diálogo.** `#avModalBody` é um
       wrapper entre o diálogo e o layout; sem torná-lo flex, o `flex:1` do
       `.av-layout` não alcançava e as condições comerciais ficavam abaixo da
       borda inferior. Some `min-height: 0` no `.av-col-form` — item de grid
       nasce com `min-height: auto` e se recusa a encolher.
    2. **320px de espaço morto na tabela de itens.** Qtd tinha 148px pra um
       input de 52px; Unit. 213px pra 82px; Total 183px pra um texto de ~90px —
       larguras fixas do tempo em que o modal tinha 900px. Com `<colgroup>`
       (84/122/122/40) a descrição foi de 434px para 648px.
    3. **Moldura dupla.** `.av-modal-dialog .ap-section` desenha borda + fundo,
       mas `.ap-section-title` já tem régua embaixo — e só as 3 seções do topo
       eram `.ap-section`, então elas viravam caixa e Itens/Condições não.
       Agora é régua-sob-título nas 5 zonas, alinhadas no mesmo eixo.
    4. **Cards de tipo em 2×2 ficavam com 184px**, títulos quebrando em duas
       linhas e descrições em três, alturas desiguais. Em coluna única usam os
       410px inteiros numa linha só — e a faixa de configuração caiu de 323px
       para 257px, altura que foi direto pra zona de itens.
    5. **Vão de ~280px no meio do trilho**, causado por `margin-top: auto` no
       bloco de excluir.
    6. **"+ Adicionar item" saía da vista** a partir do 3º item. Virou barra
       sticky no pé da área rolável — e, pra caber, perdeu o textarea de ficha
       técnica, que a linha criada já tem logo abaixo da descrição.
       `_avAcao` lê `avNewFicha` com `?.` + `|| null`, então some sem quebrar.
    7. **A linha de adicionar ficava 59px fora do eixo das colunas.** Virou
       grid com o mesmo template do `<colgroup>` e 8px de margem por campo —
       o mesmo `padding: 6px 8px` das células.
    Resultado medido em 1440px: colunas da faixa equilibradas (257/257
    cadastrado, 319/319 avulso), zona de itens com 275px (212px no avulso),
    nada vazando o diálogo. Conferido também em 1920, 1600 e 1366.
  - Cache-bust: `admin.css` v167, `admin.js` v261.

- **2026-08-05** — **Migration 068: `orcamento_linhas.tipo_servico` + a troca de
  tipo passa a ser visível.**
  - **O bug silencioso.** Nos orçamentos por cláusulas (limpeza / dedetização /
    combo), o `ficha_tecnica` da linha do serviço é o texto injetado na
    **Cláusula Primeira** do PDF. O `orcamento-pdf.service` achava essa linha
    por **regex na descrição** (`/reservat[oó]rio/i`). Bastava alguém reescrever
    "Limpeza e Higienização de Reservatório…" como "Higienização da caixa
    d'água" e a especificação **sumia do PDF sem erro e sem aviso** — o cliente
    recebia a cláusula incompleta. A coluna `tipo_servico` dá à linha uma chave
    estável; o regex fica como fallback pras linhas antigas, e a migration faz
    backfill das que ainda casam com o padrão.
    **Verificado** contra o banco de teste, com a query real do serviço:
    descrição padrão + chave ✓ · **descrição reescrita + chave ✓** (era o caso
    que quebrava) · descrição reescrita sem chave ✗ (legado, comportamento
    inalterado).
  - **Escopo:** migration 068 (coluna + CHECK + backfill + índice parcial);
    `POST /admin/orcamentos/avulsos/:id/linhas` aceita e valida o campo (valor
    fora da lista vira `NULL` em vez de estourar o CHECK); `GET .../linhas` e a
    query do PDF passam a devolvê-lo; o preset `_avItensPadrao` grava a chave
    (o combo herda, porque é composto dos dois presets).
  - **A troca de tipo virou visível.** Escolher outro tipo reorganiza a tabela
    (colunas Qtd/Unit. somem, o formulário de adicionar vira aviso) **e grava
    linhas novas no servidor** — tudo isso acontecia sem sinal nenhum e parecia
    bug. Sinal: a zona de itens pisca em amber por 1,2s (única animação do
    modal, com `prefers-reduced-motion` respeitado), o valor "Tipo" do trilho
    pisca junto, e o título alterna entre "Itens" e "Valores dos serviços".
  - **Excesso de texto explicativo, cortado no mesmo dia.** A primeira versão
    dizia a mesma coisa em quatro lugares — descrição sob cada card de tipo,
    subtítulo "· define o layout do PDF", nota em prosa na zona de itens e o
    aviso da tabela. Repetição vira ruído, não ajuda. Ficou: card só com o
    título; nenhuma nota; uma frase curta onde a ausência do formulário de
    adicionar seria confusa ("Linhas definidas pelo tipo do documento"); e a
    Cláusula Primeira mencionada **só** no placeholder do campo que a alimenta.
    Efeito colateral bom: os cards viraram uma linha e a faixa de configuração
    encolheu.
  - **Trocar de tipo agora limpa as linhas do tipo antigo.** Antes, escolher
    "Limpeza de reservatório" e voltar para "Peças" deixava a linha
    "Limpeza e Higienização de Reservatório…" na tabela como se fosse item de
    peça — somando no total e saindo no PDF. `_avLimparServicosForaDoTipo`
    remove pela **chave** `tipo_servico`, com uma regra que evita os dois erros
    opostos:
    • linha **intocada** (sem valor e sem especificação) é a que o sistema
      inseriu e ninguém preencheu — sai calada, não há nada a perder;
    • linha **com valor ou especificação** é trabalho de alguém — só sai depois
      de um confirm que **lista o que será removido**.
    A pergunta vem **antes** de mexer em qualquer coisa: cancelar não deixa
    rastro (o tipo não muda, o card não troca). "Continuar?" significa
    continuar a troca inteira, não só a exclusão.
    Linha sem `tipo_servico` (peça comum, ou serviço anterior à migration 068)
    nunca é tocada — apagar por heurística de texto seria o mesmo erro que a
    068 veio corrigir.
    **8 cenários testados** com as funções reais extraídas do `admin.js`:
    intocada · com valor · com especificação · limpeza→combo (não sai) ·
    combo→dedetização (só a limpeza sai) · peça comum · linha legado ·
    cancelar bloqueia. Todos passaram.
  - **`_avPreencherPadrao` deduplica pela chave**, não pela descrição. Comparar
    texto tinha o mesmo defeito do regex do PDF: renomear a linha e ir para o
    combo inseria o preset duplicado. `descricao` segue como fallback pras
    linhas sem chave.
  - **O campo "especificação" agora é decidido por LINHA, não por tipo** — e o
    de dedetização sumiu, porque não fazia nada. Levantamento do papel real do
    `ficha_tecnica` no `orcamento-pdf.service`:
    | linha | o que o PDF faz com o texto |
    |---|---|
    | peça | imprime sob o item (`renderHTML`) |
    | limpeza de reservatório | injeta na Cláusula Primeira |
    | **dedetização** | **nada** — `clausulasDedetizacao()` não recebe argumento, e `renderHTMLServico` monta o bloco de valores só com descrição e total |
    O texto digitado numa linha de dedetização era gravado no banco e **nunca
    saía em lugar nenhum**, enquanto o placeholder afirmava que ia para a
    Cláusula Primeira. Agora: linha de limpeza mantém o placeholder da
    cláusula; linha de dedetização **não mostra o campo**, a menos que já
    tenha texto gravado — nesse caso aparece com "Anotação interna — não sai
    no PDF", para que dado antigo não fique inacessível nem minta sobre o
    próprio destino. No combo isso é obrigatório: as duas linhas convivem na
    mesma tabela com papéis diferentes.
    A detecção espelha a do PDF (chave `tipo_servico` primeiro, regex na
    descrição como fallback pras linhas anteriores à 068). **5 cenários
    testados** com a função real: peça · limpeza com chave · limpeza legado ·
    dedetização vazia (oculta) · dedetização com texto legado.
  - ⚠️ **Migration aplicada só no banco de TESTE.** Rodar em produção com
    `node scripts/migrate.js 068_orcamento_linha_tipo_servico.sql --prod`.
  - Cache-bust: `admin.css` v169→v170, `admin.js` v263→v265.

- **2026-08-05** — **Orçamentos por cláusulas: nome do serviço travado e
  especificação da dedetização passando a existir no PDF.**
  - **O problema.** A descrição da linha de serviço vira o rótulo ao lado do
    preço no PDF — e **só isso**. Outros três pontos do documento derivam do
    `orcamentos.tipo`, não da linha: o texto das cláusulas
    (`clausulasDedetizacao` / `clausulasLimpezaReservatorio`), o cabeçalho
    "Serviço 1/2 –" do combo, e o subtítulo (`TIPO_SUBTITULO`). Dava para
    emitir um orçamento com o valor rotulado "Controle de cupins" enquanto as
    cláusulas falavam de baratas e formigas e o subtítulo dizia "Dedetização e
    Controle de Pragas Urbanas" — três afirmações se contradizendo no mesmo
    documento, sem nenhum erro no caminho.
  - **A — nome travado.** Em linha de serviço a descrição vira texto, não
    campo. Renderizado como texto e não como input desabilitado: campo cinza
    convida a clicar e frustra. Trava **só quando há `tipo_servico`** — a chave
    é sinal confiável; linha anterior à migration 068 continua editável, porque
    é justamente a que pode precisar de conserto, e restringir por heurística
    de texto seria o erro que a 068 veio corrigir.
  - **C — a dedetização ganhou especificação de verdade.**
    `clausulasDedetizacao()` não recebia argumento: o texto digitado ia pro
    banco e nunca saía. Agora recebe e imprime na **Cláusula Primeira**, no
    mesmo formato `<strong>Especificação:</strong>` que a limpeza já usava — as
    duas ficam simétricas no combo. Busca via `acharEspecificacaoDedetizacao`
    (chave `dedetizacao`, com regex `/dedetiza|praga/i` de fallback pras linhas
    antigas); a lógica comum saiu para `_especificacaoDaLinha`.
  - O campo de especificação, que na versão anterior ficava oculto na
    dedetização por não alimentar nada, voltou — agora com destino real. O
    exemplo do placeholder muda por serviço ("2 superiores e 1 inferior" para
    reservatório, "3 blocos e garagem" para dedetização).
  - **10 cenários testados** com as funções reais dos dois arquivos: chave ·
    fallback legado · ausência de especificação · combo (cada serviço pega a
    sua, sem trocar) · trava por chave · legado editável · peça editável.
  - **Modo serviço visto pela primeira vez no harness.** Até aqui o harness
    cravava `tipoAtivo = "pecas"`, então tudo que é exclusivo do modo serviço
    (tabela de 3 colunas, aviso no lugar do formulário de adicionar, nome
    travado, placeholder da especificação) tinha sido escrito sem nunca ter
    sido renderizado. Um `shot-servico.js` cobre o combo agora.
  - **Notebook 1366×768 estava apertado demais.** A janela é fatia da altura da
    viewport, então toda folga sai da zona de itens — a última a receber.
    Medido: **153px** para os itens, e um combo com apenas 2 serviços já
    nascia rolando, com a especificação do segundo cortada. Um
    `@media (max-height: 820px)` reduz padding, gaps e a altura dos cards de
    tipo; a zona vai para **234px** e os 2 serviços cabem inteiros. Só folga
    encolhe — nenhum tamanho de fonte ou alvo de clique muda (menor alvo
    continua 24px em peças, 27px em serviço).
  - Cache-bust: `admin.css` v172, `admin.js` v266.

- **2026-08-05** — **Camada de modal compartilhada (etapa 1 de 2).** O modal de
  orçamento virou referência; esta etapa leva pros outros 13 tudo que dá pra
  levar **por CSS, sem tocar em marcação**.
  - **Ponto de partida melhor que o esperado:** os 11 `.modalOverlay` já
    compartilham `.modalBox / .modalHead / .modalBody / .modalFoot`, com a
    estrutura certa (flex column, corpo rolando por dentro, `max-height: 90vh`).
    Faltava tratamento, não arquitetura.
  - **Fio no topo** marcando o modal como foco da tela. ⚠️ Amber é cor de
    **marca e ação** — num modal de exclusão permanente ele diz o oposto do que
    a tela quer dizer. Por isso `.modalBox.is-perigo` deixa o fio vermelho;
    aplicado no `hardDeleteOverlay`. (`osFotoLightbox` apareceu como destrutivo
    numa varredura minha e era **falso positivo** — é lightbox de foto, nem tem
    `.modalBox`; o recorte de 1800 caracteres pegou o texto do modal seguinte.)
  - **`@media (max-height: 820px)` para todos os modais**, mesmo racional do
    orçamento: só folga encolhe, nenhuma fonte e nenhum alvo de clique.
    Verificado — `ctrOverlay` vai de 810px para 730px em viewport de 768 e
    passa a caber inteiro na tela.
  - **Ferramentas prontas para a etapa 2**, ainda **não aplicadas** em nenhum
    modal: `.modal-sec-title` (rótulo de seção com régua, hoje cada modal usa
    `<div>` com estilo inline), `.modalFoot-danger` (destrutivo discreto, fora
    do caminho) e `.modal-consequencia` (bloco que declara o destino de uma
    ação externa antes do clique).
  - **Etapa 2 (marcação, por modal) — não feita.** O caso pior é o
    `ctrOverlay`: **12 campos empilhados numa coluna de 640px**, rolando, numa
    tela de 1440 — o mesmo problema que o orçamento tinha. E "Enviar para
    assinatura", que dispara e-mail para o cliente, está escondido dentro de
    "Mais ações" sem declarar destinatário.
  - Cache-bust: `admin.css` v173.

- **2026-08-05** — **Camada de modal, etapa 2: `ctrOverlay` reorganizado.**
  - **Era o pior caso do sistema:** 12+ campos empilhados numa coluna de 640px,
    rolando, numa tela de 1440 — o mesmo problema que o modal de orçamento
    tinha. Passou a **1000px em duas colunas**: "Dados do contrato" (termos
    comerciais) à esquerda, "Conteúdo do contrato" + "Signatários" +
    "Assinatura digital" à direita.
    **Medido: de 640×810 rolando para 1000×558 sem rolagem** — e continua sem
    rolar em viewport de 768px (1000×530).
  - Os 3 rótulos de seção com estilo inline viraram `.modal-sec-title`; os 5
    grids `1fr 1fr` inline viraram `.modal-fields-2`; **43 ids preservados**.
  - **"Enviar para assinatura" agora declara os destinatários.** A ação dispara
    e-mail para pessoas reais e vive escondida dentro do menu "Mais ações".
    `_ctrAtualizarDestinatarios()` preenche um `.modal-consequencia` lendo dos
    **campos** (não do contrato salvo), então quem acabou de digitar o e-mail vê
    o destino na hora. `.modal-consequencia:empty` esconde o bloco enquanto não
    há texto, pra não virar faixa amber vazia.
  - `novoChamadoOverlay`: 3 rótulos inline → `.modal-sec-title`.
  - `hardDeleteOverlay`: `.modalBox.is-perigo` (fio vermelho).

  > ⚠️ **Cicatriz desta sessão — recorte de string com índices invertidos.**
  > Um `s[:ini] + s[ini:fim] + s[fim:]` em que `fim` vinha **antes** de `ini`
  > (`ctrsPickerModal` na linha 836, `ctrOverlay` na 2324) produziu `trecho`
  > vazio e concatenou `P + Q + Q + R`: **1.488 linhas duplicadas** e 268 ids
  > repetidos no `admin.html`. Não deu erro nenhum — o script imprimiu
  > "grids convertidos: 0" e seguiu. Só apareceu numa varredura de ids
  > duplicados feita por outro motivo.
  > **Lição:** ao fatiar arquivo por marcadores de texto, **afirmar
  > `ini < fim`** antes de concatenar, e conferir contagem de linhas depois.
  > Um `assert` de duas palavras teria evitado. Reparado removendo uma cópia
  > do bloco; verificado: 0 ids duplicados, 588 `<div>` para 588 `</div>`,
  > diff contra HEAD com apenas as 49 inserções pretendidas.
  - Cache-bust: `admin.css` v175, `admin.js` v267.

- **2026-08-05** — **Camada de modal, etapa 3: os 13 no mesmo padrão.** As
  etapas 1 e 2 tinham deixado 11 modais só com a casca (fio no topo e respiro),
  sem o tratamento de verdade. Esta etapa fecha isso.
  - **A causa raiz:** 5 modais **reimplementavam a casca** com estilo inline
    (`padding:20px 24px 16px;border-bottom…` para cabeçalho,
    `padding:14px 24px;border-top…` para rodapé) em vez de usar
    `.modalHead` / `.modalBody` / `.modalFoot`. Por isso não herdavam nada.
    Convertidos: modal de **usuário**, **dispositivos confiáveis**, **senha
    temporária**, **colaborador** (`admin.js`) e **planos** + **seletor de
    cliente** (`admin.html`). Restam **0** cascas inline nos dois arquivos.
  - **19 rótulos de seção** com estilo inline viraram `.modal-sec-title`
    (9 no `admin.js`, 10 no `admin.html`), ganhando a régua embaixo. Restou 1
    no JS, e de propósito: é rótulo de campo ("Reservatório"), não de seção.
  - **`.av-modal-dialog` ganhou o fio amber** — sem isso os três que usam
    `.av-modal` (orçamento, planos, seletor) ficavam fora do padrão, **inclusive
    o de orçamento, que serviu de referência para ele**.
  - **`ctrViewerOverlay`**: 2 rótulos inline convertidos.
  - **`editOverlay`**: ganhou seções "Endereço" e "Contato e operação" — eram
    13 campos seguidos sem nenhuma divisão.
  - **`.modalFoot-danger` aplicado pela primeira vez:** "Revogar todos os
    dispositivos" derruba o acesso de todos os aparelhos do usuário e dividia
    peso visual com o botão de fechar; agora sai do caminho, à esquerda.
  - **`.modalBody.modal-secoes`**: corpo dividido em seções cujos wrappers são
    mostrados/escondidos por JS. Como cada `.modal-sec-title` é primeiro filho
    do seu wrapper, o `:not(:first-child)` não pegava e as seções ficavam
    coladas.
  - **Limite do harness estático, declarado:** a auditoria mede o HTML servido;
    dos 13 modais, 7 têm o corpo montado por JS e aparecem com "0 seções"
    porque a casca nasce vazia. Para esses, a verificação foi feita contando
    as classes nos **templates** do `admin.js`, não no render.
  - Cache-bust: `admin.css` v178, `admin.js` v269.

- **2026-08-13** — **Landing: fora o foco na madrugada, e a empresa passa a
  falar em primeira pessoa.** Dois pedidos do Pedro sobre a página já
  redesenhada.
  - **A madrugada encolheu para uma chamada.** A seção `#noite` (cinco eventos
    numa linha do tempo com trilho preso ao scroll) era a mais alta da página e
    gastava tudo isso dramatizando uma noite. O Pedro: *"entendo o que quer
    passar, mas não queria esse foco todo — uma chamada dizendo que o
    atendimento é 24 h seria o suficiente."* Removidos: `#noiteTrilho`,
    `.noite-*` (~120 linhas de CSS) e o handler de scroll do trilho — o
    listener ficou, porque é ele que cola a barra do topo.
  - **A seção que entrou no lugar passou por duas versões.** A primeira ("A
    boia liga a bomba. / Ela não conta o que deu errado." + três falhas) foi
    recusada pelo Pedro por escrita indireta *e* por redundância: as três
    falhas eram sonda / sensor de corrente / central com outro nome, ou seja, a
    seção "Três peças no prédio" repetida. A versão que ficou é `#servico` —
    **"A gente mede, avisa e atende."**, o ciclo do serviço em três passos
    numerados, com o painel do condomínio no fecho da placa (era a única parte
    do serviço que o visitante só descobria lá embaixo, nas dúvidas).
    ⚠️ **`#servico` é o serviço; `#instalado` é o hardware.** Não voltar a
    descrever sensores no primeiro. Item de navegação "A noite" → "O serviço".
  - **Nenhuma frase pode servir só a quem já é cliente.** *"Não somos o
    aplicativo de uma empresa que você nunca viu"* foi recusada — *"pode ser
    alguém que acabou de conhecer a empresa sim, e tem que servir pra ela
    também"*. Todo texto que pressupunha vínculo existente ("a mesma equipe
    que já troca a sua bomba", "o mesmo telefone que o seu prédio já usa",
    "somado à manutenção que já fazemos") passou a **condicional**.
  - **⚠️ Contrato de posicionamento fechado — a causa das quatro rodadas.** A
    substituição seguinte ("Não somos uma empresa de software. Somos
    manutenção predial desde 2005.") também foi recusada, e o Pedro parou o
    trabalho: cada correção de frase estava expondo uma decisão de
    posicionamento que nunca tinha sido tomada. Decidido por ele e gravado em
    [`../PRODUCT.md`](../PRODUCT.md): **(1) o produto é o protagonista** — os
    20 anos são garantia, não abertura, o que **inverte** o princípio anterior
    "a credibilidade vem da empresa, não do produto"; **(2) a página não se
    posiciona contra ninguém** — sem definição por negação e sem categoria
    concorrente, mas explicar por que a boia não basta continua permitido.
    Aplicado numa passada só: h2 de `#equipe` → **"Quem instala, calibra e
    atende é a nossa equipe."**, `og:description`, o parágrafo do "aplicativo
    que manda notificação", a comparação com planilha na FAQ de internet e a
    comparação com o zelador em `#servico`.
  - 🐛 **A página falava mal da boia, e isso estava errado.** Correção do
    Pedro: *"o sistema não serve pra substituir boias"* — e a própria General
    instala e mantém boia, então pôr a boia como vilã é falar mal do próprio
    serviço. A causa não foi uma frase solta: o contrato de posicionamento no
    `PRODUCT.md` tinha uma **exceção que eu inferi** ("explicar por que a boia
    não basta não viola a regra de não se posicionar contra ninguém"), e foi
    ela que autorizou o texto. Corrigidos o contrato e as duas ocorrências na
    página:
    - peça "Sonda de nível": saiu *"É outra coisa que a boia, que só sabe dizer
      cheio ou não cheio — e não diz nada quando ela mesma falha"*; entrou a
      descrição do que a sonda faz (medir sem parar, virar histórico);
    - dúvida "Meu prédio já tem boia": reescrita sobre **a boia age / o
      monitoramento mostra**, dizendo que a boia faz parte da manutenção que a
      General já presta e que o sistema avisa quando alguma peça — ela
      inclusive — precisa de atenção.
  - **Tela de login redesenhada em split screen, no mundo "Chapa".** Pedido do
    Pedro: *"não ficar estranho a pessoa entrar na landing com um visual e
    parar em um login com outro completamente diferente"*. `/login` é a costura
    entre o site e o painel, e usava o âmbar `#f0b014` do Mission Control,
    cantos arredondados, sombra projetada, gradiente e fonte de sistema — tudo
    o que o sistema visual da landing recusa. Agora: campo marinho com a marca
    e a engrenagem em escala arquitetônica à esquerda, placa clara com o
    formulário à direita, faixa listrada na costura das duas metades, chanfro
    de 45° em campos e botões, Archivo + Martian Mono. No mobile empilha — a
    marca vira faixa de 270px e o formulário fica inteiro na primeira dobra.
    Ganhou também um link **"Voltar para o site"**, que não existia.
    - 🐛 **`login.js` alternava os passos com `style.display`.** O `"block"`
      inline sobrescrevia o `display` do CSS e o formulário voltava do passo do
      código sem espaçamento entre os campos. Trocado por `_mostrarPasso()`,
      que mexe só no atributo `hidden`.
    - ⚠️ **Anel de foco:** os dois anéis precisam ser `inset`. `outline` e
      `box-shadow` normal são pintados fora da caixa e o `clip-path` do chanfro
      recorta ambos — o indicador é calculado e não aparece. Escrevi errado na
      primeira vez seguindo a descrição do `DESIGN.md`, que dizia "o anel
      amarelo fica por fora, a 3px" enquanto o `landing.css` sempre usou
      `inset`. **A `DESIGN.md` foi corrigida** para não induzir ao mesmo erro.
    - Cache: `login.css` e `login.js` → `?v=3`, `register-sw.js` → `?v=34`,
      `CACHE_NAME` do `sw.js` → `telemetria-v43` (a tela de login registra o
      service worker, diferente da landing).
    - **Painel esquerdo, segunda passada.** A primeira versão era campo marinho
      com a engrenagem girando — o Pedro apontou que a divisão parecia "meio a
      meio" e pediu para pensar o lado esquerdo junto. Diagnóstico: 40% de vão
      morto no topo, engrenagem como papel de parede (segunda aparição da mesma
      peça, sem função aqui) e uma frase que era a lede do hero da landing pela
      quarta vez. Resolvido com:
      - **Foto real sangrada** (`public/fotos/reservatorios.jpg`, escolhida pelo
        Pedro do Dropbox) com véu marinho, no lugar da engrenagem. É a única
        foto do acervo que mostra **reservatório** e a única em retrato.
      - **Texto no rodapé, à esquerda, e véu fechando forte no pé** — as duas
        coisas são preferência do Pedro. Duas alternativas foram testadas e
        recusadas: levar o texto ao topo, e clarear o pé do véu para `.68`/
        `.78` (proposta minha, porque com `.90`/`.97` os últimos 25% viram
        faixa preta e os dois técnicos ficam partidos ao meio pela frase).
      - **O que resolveu foi subir o bloco, não mexer no véu.** O
        `padding-bottom` do `.marca-lado` passou a ser maior que as outras
        margens — `clamp(80px, 14vh, 130px)` contra 56px — e tira o texto de
        dentro do trecho mais fechado: ele fecha a ~86% da altura em vez de
        ~93%. ⚠️ Véu e `padding-bottom` agora são interdependentes; mexer nos
        dois juntos. O wordmark ganhou `drop-shadow` e encolheu um pouco
        (268px → 236px), o que também ajuda a encurtar o bloco.
      - **Frase nova:** "O nível dos seus reservatórios, o estado das bombas e
        os chamados do prédio" — diz o que há atrás da porta em vez de repetir
        a promessa que o site já fez três vezes.
      - **Proporção `1.12fr / .88fr`**, folga para a foto. Era `.86/1.14`:
        perto demais de meio a meio para ler como decisão, e com o espaço no
        lado errado — o formulário tinha 820px para uma placa de 440px.
      - ⚠️ **Lição do enquadramento, que custou três tentativas.** A marca do
        **fabricante do tanque** (dois telefones legíveis) fica no TOPO da
        foto. Tentei cortá-la *pela lateral*, o que exigia ampliar a imagem;
        somado ao recorte vertical que o `cover` já fazia num painel quase
        quadrado, sobrava **menos da metade da foto** — virava close, sem os
        tanques nem o corredor, que são o motivo de ela ter sido escolhida.
        A solução é o contrário: **painel mais largo + `cover` puro alinhado
        pela base**, e aí o recorte vertical cai justamente sobre a marca do
        fabricante. Regra registrada: o recorte é vertical, a escala é
        `cover`. A única exceção é o mobile, onde a faixa larga e baixa não
        tem sobra horizontal e a ampliação de `112%` é obrigatória para aparar
        o extintor.
    - **Texto do painel, ajuste final do Pedro.** Saiu a etiqueta "Acesso do
      condomínio e da equipe" (e a regra `.marca-eti`, que ficou sem uso). O
      subtítulo do formulário passou de "Use o e-mail e a senha cadastrados no
      sistema" para **"Entre com seu e-mail e senha"** — decisão do Pedro por
      simplicidade. Cheguei a propor uma linha avisando do código por e-mail do
      segundo passo; foi recusada, e o registro fica porque a ideia pode voltar
      se aparecer abandono no passo do OTP.
    - Documentado em [`modulos/autenticacao.md`](modulos/autenticacao.md).
  - **Passada de redundância — mapa de donos.** O Pedro pediu para procurar
    repetição; a primeira varredura foi lexical e achou pouco. A varredura
    **funcional** (que pergunta cada bloco responde) mostrou que *nenhuma*
    pergunta era respondida uma vez só. Corrigido definindo um dono por
    pergunta (tabela em
    [`modulos/landing-publica.md`](modulos/landing-publica.md)):
    - a lede de `#servico` era a lede do hero reescrita — virou uma linha só
      que apresenta as três etapas;
    - a célula 1 narrava nível/coluna/corrente, que **o instrumento do hero já
      mostra ao vivo** — passou a ser dona da frequência e do histórico;
    - a célula 3 disputava "equipe própria" com `#equipe` — virou "Atendemos
      sem você precisar ligar", sobre o chamado já nascer pronto;
    - a condicional "se já é cliente, mesmo contrato" estava em `#equipe`, na
      FAQ e no fecho → só no fecho;
    - "proposta" 3× → 1×; "você fica sabendo que parou de saber" era literal
      em duas seções → só na FAQ de internet; "desde 2005" 3× → 2×;
    - duas legendas de foto de `#equipe` anunciavam peças de `#instalado`;
    - o `aria-label` do diagrama enumerava as três posições que cada
      `.peca-onde` repete logo depois — leitor de tela ouvia tudo duas vezes.
    Mantidos de propósito: repetição dentro da **FAQ** e a **lista do fecho**
    como resumo antes do formulário.
  - **Diagrama do prédio redesenhado.** Eram oito retângulos lisos com cantos
    retos — o único elemento da página que não falava a língua do chanfro,
    contra a regra de forma única do `DESIGN.md`. Agora: chanfro de 45° nos
    equipamentos (caixa, cisterna, motor, corpo da bomba, quadro) e só no topo
    do prédio, como recorte de cobertura; **janelas** no lugar das quatro
    linhas de andar, que davam "retângulo riscado" e não "prédio"; a bomba
    virou **conjunto motobomba** (base, motor, caixa de bornes e corpo) em vez
    de uma caixinha; a água ganhou **crista**, o mesmo gesto da lâmina do
    instrumento; e o traço ganhou hierarquia (2px estrutura / 1–1,5px
    detalhe), onde antes era tudo 2px. Marcadores de `r=16` → `r=13` e
    **fora** das peças pequenas: sobre um motor de 56 unidades o círculo
    amarelo cobria a peça que estava apontando.
  - **Diagrama do prédio comprimido.** A torre estava em escala (410 unidades,
    7 linhas de andar) e mais da metade do desenho era retângulo vazio — as
    três peças moram nas pontas, uma na caixa e duas na casa de máquinas.
    `viewBox` de `460 700` → `460 520`, torre de 410 → 230 unidades, 7 linhas
    de andar → 4, e todo o bloco abaixo do solo subiu 180 unidades junto
    (cisterna, bomba, quadro, sucção, prumada e marcadores 2 e 3). Altura do
    SVG de 660px → 500px. A seção caiu de 1077px para 1004px e passou a ser
    limitada pela lista de peças, não pelo vão do desenho. Hover e pulso dos
    marcadores conferidos depois da mudança.
  - 🐛 **Corrigido um `*/` a mais em `landing.css`** que vinha do commit
    `6130562`: fechava o comentário da "armadilha do chanfro" cedo demais, e o
    texto solto que sobrava era consumido como seletor inválido — levando junto
    a regra `.btn:focus-visible, .pular:focus-visible, .duvida
    summary:focus-visible { outline: none }`. Efeito prático pequeno (os
    indicadores de foco reais são `box-shadow: inset` e continuavam
    funcionando), mas o CSS estava malformado e a regra era descartada em
    silêncio. Confirmado no CSSOM depois da correção.
  - ⚠️ **`.vigia` é UMA placa, não três cards.** A primeira tentativa foi três
    caixas iguais de título + parágrafo lado a lado, e isso é o contêiner
    preguiçoso — o mesmo vício da versão rejeitada em agosto. A forma que ficou
    é uma peça chanfrada dividida por **cortes gravados**: par `--rasgo`
    (`rgba(2,6,22,.55)`, o fundo do sulco) + `--luz` (`rgba(255,255,255,.10)`,
    a aresta pegando luz), sempre os dois — com uma linha só a divisão lê como
    borda de card. Anatomia emprestada do instrumento do hero. No mobile o
    sulco deita (`border-left` → `border-top`).
  - **Toda a copy passou para primeira pessoa do plural.** "A General monitora"
    → "Monitoramos"; "a equipe da General instala" → "Somos nós que
    instalamos". O texto era **inconsistente** — abria em terceira pessoa e no
    meio virava primeira ("a gente sabe", "Fale com a gente"). Motivo em
    [`../memory-bank/decisions.md`](../memory-bank/decisions.md): a terceira
    pessoa põe um narrador entre a empresa e o síndico, e o argumento de venda
    é exatamente que quem fala já é o fornecedor de confiança do prédio.
  - **Verificado no navegador** (servidor estático só de `public/`, 1440×960 e
    500×860): coluna e leitura do instrumento **concordam** com o movimento
    rodando (`nível 47` com `--n: 46.84%`) — resolve a única pendência que a
    revisão de 11/08 deixou em aberto, que era um artefato de captura pausada.
    Sem estouro horizontal no mobile.
  - **Detector do Impeccable:** 54 achados, **nenhum do código novo** (as duas
    faixas listradas já tinham sido julgadas e mantidas; os avisos de escala
    tipográfica são pré-existentes).
  - **Documentação:** `DESIGN.md` + `.impeccable/design.json` (a madrugada
    aparecia em 9 pontos e ficou factualmente errada), `PRODUCT.md` (regra de
    voz), [`modulos/landing-publica.md`](modulos/landing-publica.md).
  - Cache-bust: `landing.css` v6, `landing.js` v6.

- **2026-08-11** — **Landing pública redesenhada ("Chapa").** A primeira versão
  da página `/` (commit `446d1c7`) foi rejeitada pelo Pedro: tinha sido
  construída como um **demonstrativo de despesas de condomínio** — folha de
  papel, tabela de conta, carimbo "documento ilustrativo", Courier Prime. O
  pedido foi "mais bonito, com animações mais bonitas", mais a observação de
  que o logo aparecia 3× e as três minúsculas (26px, 30px, 30px).
  - **Direção nova:** o wordmark da General já é chapa de aço cortada — cantos
    chanfrados, contraformas quadradas, a lasca amarela dentro do G. Essa lógica
    de corte virou a gramática da página inteira: chanfro de 45° em placa,
    botão, foto e campo; fios de 1px como usinagem; marinho `#071b5c` como
    material; amarelo `#fbb329` tomando a seção de fecho inteira.
  - **Fontes trocadas:** saíram Barlow e Courier Prime; entraram **Archivo
    variável** (peso 400–900, largura 62–125%) para display e corpo e **Martian
    Mono** só para leitura de instrumento e etiqueta. Auto-hospedadas em
    `public/fonts/` (a CSP não permite CDN).
  - **Peças novas construídas:** o instrumento do hero (coluna d'água viva com
    roteiro de uma madrugada, respeitando as faixas reais de 45%/20%), o corte
    esquemático do prédio em SVG ligando as 3 peças ao lugar onde são
    instaladas, a foto anotada com linhas-guia e as engrenagens da marca em SVG
    próprio (não há vetor da marca).
  - **`public/logo-topo.png` (novo, gerado):** o lockup oficial traz
    "ENGENHARIA DA MANUTENÇÃO" embaixo, que a 40px vira borrão cinza. O arquivo
    novo é o mesmo logo com essa linha apagada por cor, preservando as
    engrenagens. Detalhe em
    [`modulos/landing-publica.md`](modulos/landing-publica.md).
  - **Bugs corrigidos durante o build** (todos com comentário no fonte):
    máscara de revelação que não cobria elemento alto e deixava faixa
    translúcida sobre o botão "Enviar"; dois tweens concorrentes do instrumento
    brigando pelo mesmo número; `box-shadow: inset` recortado pelo `clip-path`,
    apagando a borda do botão exatamente nos chanfros; `.peca dd p` vencendo
    `.peca-onde` por especificidade e jogando a etiqueta para 20px; ausência de
    rótulo "sem monitoramento"/"com a General" para leitor de tela em qualquer
    largura; "Entrar" sumindo abaixo de 760px e obrigando cliente a rolar a
    página toda para achar o painel.
  - **Backend intocado.** `POST /leads` e o contrato do formulário são os
    mesmos; `/login` continua funcionando; a landing segue sem registrar o
    service worker.
  - **Documentação:** [`modulos/landing-publica.md`](modulos/landing-publica.md)
    (novo — a landing nunca tinha sido documentada), `PRODUCT.md` e `DESIGN.md`
    na raiz.
  - Cache-bust: `landing.css` v5, `landing.js` v5.


### 2026-08-13 — Painel do cliente reconstruído: "Meu prédio" (frontend)

Redesenho completo de `/cliente/painel`, pedido pelo Pedro logo depois da
landing e do login. Diagnóstico dele: *"está muito ruim, e o principal problema
foi tentar copiar o painel de admin"*. Estava certo, e o problema era mais
estrutural que visual. O "porquê" em
[`../memory-bank/decisions.md`](../memory-bank/decisions.md); o fluxo completo
em [`modulos/painel-cliente.md`](modulos/painel-cliente.md).

- **`cliente.html` não carrega mais `admin.css`.** Era a raiz de tudo: 265 KB
  de Mission Control mais 385 linhas de override tentando desfazer proporções.
  `cliente.css` virou **folha autônoma** no sistema "Chapa" — o mesmo da
  landing e do login. Os ~225 nomes de classe que o `cliente.js` emite foram
  mantidos, então **o contrato de markup não mudou**: trocou-se o mundo, não a
  API. Ponte de tokens no bloco 2 do CSS (`--muted`/`--text`/`--accent`) para
  os 15 `style=` que o JS ainda escreve.
- **Quatro seções viraram três.** *Dashboard* e *Telemetria* mostravam os
  MESMOS 3–5 reservatórios duas vezes, com componentes diferentes para o mesmo
  dado — o admin tem as duas porque olha N condomínios; o cliente tem um.
  Fundidas em **"Meu prédio"** (`data-section="predio"`). Nada removido:
  histórico 24h/7d/30d/90d, seleção de reservatório e PDF continuam.
- **A estrutura virou uma linha do tempo**, não uma grade de cards: trilho
  vertical em corte gravado, com a estação **AGORA** no topo (instrumento +
  contagens do que está aberto), a estação **HISTÓRICO** em seguida, e os
  eventos reais descendo agrupados por dia (alerta aberto, chamado aberto,
  técnico designado, atendimento concluído, O.S. finalizada). Clicar num evento
  de chamado abre o chamado.
- **O tanque cilíndrico em SVG saiu; entrou a coluna d'água da landing.**
  O cilindro era o componente do admin, portado de `admin.js` — o sintoma que o
  Pedro diagnosticou. A coluna já traz as faixas de 45%/20% desenhadas e é o
  objeto que o síndico viu na página pública. ⚠️ A lâmina abre em `#2f6fe0`, e
  não no `--mar-500` da landing: com três tubos de 176px lado a lado a rampa
  original lia como retângulo preto.
- **Funções removidas do `cliente.js` (todas duplicadas ou órfãs):**
  `_dashRenderChamados`, `_dashRenderNiveis`, `_dashRenderCriticos`,
  `_dashRenderActivity`, `_dashRenderBombas`, `_cliTanqueTile`,
  `_telTanqueSVG`, `_telBandaAgua`, `_telCliAtualizar`, `_telCliRenderKpis`,
  `_telCliRenderNiveisChart`, `_telCliRenderCriticos`, `_telCliRenderBombas`,
  `histResumoCard`, `badge`/`nivelBadge`/`bombaBadge`/`tipoBadge`,
  `pickMaisRecente`, `pickMaisCritico`, `algumOffline`, `_telCliCorPct`,
  `_telCliFmtTempoRel`, `ICO_WIFI_OFF`. Novas: `_agoraRender`, `_agoraColuna`,
  `_predioVeredito`, `_linhaRender`, `_predioKpis`, `_predioAtualizar`,
  `_estadoDoReservatorio`, `_agoraRelogio`.
- **Bugs reais corrigidos no caminho:**
  - `cliente.html` mandava para `wa.me/5511999990000` — **número inventado**.
    Trocado pelo real (`11966536110`).
  - `.mob-topbar` era `position: sticky` estando no **fim do `<body>`**: ela só
    aparecia depois de rolar a página inteira. Virou `fixed`.
  - "Em atendimento" era `rc-bad` (vermelho) no KPI de Chamados. Chamado com
    técnico designado é boa notícia; pintá-lo de vermelho ensina o síndico a se
    assustar com o serviço funcionando.
  - As tabelas de Alertas e Chamados não tinham tratamento mobile — cinco
    colunas em 390px só se liam arrastando de lado. Viraram lista de placas.
  - No modo recolhido a sidebar ficava só com ícones e **sem rótulo nenhum**.
    Ganhou rótulo flutuante a partir do `data-label` que já existia no HTML.
  - Faixa de cor de 3px na borda dos KPIs (o tell clássico de UI gerada por IA,
    apontado pelo detector do Impeccable) trocada por placa de ícone
    preenchida.
- **`chart.umd.min.js` (Chart.js) saiu do `cliente.html`** — o painel só usa
  ApexCharts. ~200 KB a menos por carga.
- **`mob-sidebar.js`** (compartilhado com o admin) ganhou a chave `predio` no
  mapa de títulos do topo mobile. Aditivo; o admin não tem essa seção.
- **Backend intocado.** Nenhuma rota, nenhum campo, nenhuma migration. Como não
  há endpoint novo, o **`sw.js` não foi tocado** — `/cliente` já é network-first
  e `.css`/`.js` também.
- Cache-bust: `cliente.css` v10, `cliente.js` v29.

⚠️ **Verificação:** harness estático (o `cliente.html`/`cliente.css`/
`cliente.js` reais, com `fetch` dublado), a 1440px e num iframe de 390px.
**Nada rodou contra o backend real**, e o caminho do cliente sem telemetria
contratada não foi visto renderizado.

### 2026-08-14 — Painel do cliente v3: "a resposta, não o painel" (frontend)

A v1 acima foi **rejeitada** como direção em 13/08 (mantinha a casca do admin).
A v2 virou comp, a v3 refinou a comp por várias passadas, e **esta entrada é a
v3 virando código**: `public/cliente.html`, `cliente.css` e `cliente.js` foram
reescritos a partir de
[`comps/painel-cliente-v3.html`](comps/painel-cliente-v3.html).

- **A navegação inteira saiu.** Não há mais sidebar, botão de colapso, topbar
  com avatar e "atualizar", fileira de KPIs, abas, campos de busca nem tabelas.
  As três seções (`predio`/`alertas`/`chamados`) deixaram de existir: **alertas
  e chamados não são mais lugares para onde navegar**. É essa remoção, e não a
  paleta, que separa este painel do admin.
- **A página tem duas partes e um rodapé.** A **resposta** ocupa a primeira
  tela (uma frase + os reservatórios como prova + uma ação); a **história**
  vem abaixo, agrupada por dia num trilho de datas grudento; o rodapé fecha com
  o lockup completo e os contatos reais.
- **Tudo que sobrou virou ficha** (diálogo em placa clara sobre o marinho):
  pedir ajuda, chamado (passos + conversa + avaliação), todos os
  reservatórios, reservatório (histórico + PDF) e sua conta (troca de senha +
  sair). **Uma ficha por vez**, com pilha de um nível: o X devolve para a ficha
  de origem em vez de fechar as duas.
- **O ramo "normal" do veredito foi partido em dois.** Antes, o dia calmo e o
  dia com técnico no prédio recebiam a mesma frase gigante — chamado aberto não
  tirava de "Tudo normal". Agora existe a **linha de atendimento**, com ponto
  azul (`--crista`, não âmbar: chamado em curso não é alarme) e o **título do
  chamado** junto, para que num prédio com sensor mudo e chamado sobre outra
  coisa ninguém leia "alguém já está cuidando do sensor".
- **A prova são no máximo três colunas**, tenha o prédio 3 ou 30
  reservatórios: aparecem os que estão fora do normal ou, se tudo está normal,
  os três mais baixos. O resto vira frase honesta com a faixa real ("Mais 8
  reservatórios, todos entre 77% e 93%") que abre a lista completa.
- **O cilindro voltou** — escolha do Pedro em 14/08, vendo o estudo lado a lado
  ([`comps/reservatorio-estudo.html`](comps/reservatorio-estudo.html)). É o
  `_telTanqueSVG` do admin **reproporcionado** (50×94 em vez de 62×94), sem os
  ticks e **sem limiar desenhado dentro do tanque**. No celular ele dá lugar à
  coluna chata: os dois markups são emitidos juntos e a media query decide.
- **ApexCharts saiu do `cliente.html`.** O gráfico da ficha do reservatório é
  SVG desenhado no próprio `cliente.js` (~8 linhas de path), como na comp.
  ~200 KB a menos por carga; some o tooltip interativo do gráfico.
- **Frases fechadas:** o dia normal é *"Seu prédio está abastecido."* Não
  reabrir frase a frase — se mudar, muda por mudança de produto.
- **Bugs reais corrigidos na verificação:**
  - `overflow-x: clip` **só no `body` não segura**: a engrenagem que sangra
    para a margem fazia a página rolar 66px na horizontal a 390px (medido).
    Precisa estar em `html` **e** `body`. `clip`, nunca `hidden` — `hidden`
    quebraria o `sticky` da barra e do trilho de datas.
  - A prova era reconstruída a cada tick de 10s, e a lâmina d'água **voltava a
    zero e subia de novo**: num painel de nível de água, tanques esvaziando
    sozinhos a cada dez segundos é a leitura errada. Agora só redesenha quando
    a assinatura da leitura muda.
  - `desdeQuando` arredondava: leitura de 40 segundos virava "há 1 min". Virou
    piso — "agora mesmo".
- **Backend intocado.** Nenhuma rota, campo ou migration; e como não houve
  endpoint novo, o **`sw.js` não foi tocado** (`/cliente` e `/relatorio` já são
  network-first).

#### Passada de celular, no mesmo dia

O Pedro arrastou a página para o lado no celular e mandou a captura. Duas
coisas saíram daí:

- ⚠️ **A comp tinha o mesmo bug de rolagem horizontal** e ficou sem a correção
  quando o código foi corrigido. Medido: 42px a 320, 59px a 390, 87px a 540.
  `docs/comps/painel-cliente-v3.html` recebeu o mesmo `html,body{overflow-x:clip}`
  — a comp é o artefato que ele abre para revisar e não podia continuar
  mentindo. O painel implementado já estava correto (`scrollW === clientW` em
  320/360/375/390/412/430/540/768).
- ⚠️ **"Preciso de ajuda" caía abaixo da dobra no celular** nos estados de
  alarme — a 390px começava a **787px** no sem sinal, **729px** no de atenção,
  **700px** no crítico. Num painel cuja tese é *"a primeira tela é a resposta,
  com UMA ação"*, a ação sumia justamente quando o síndico está aflito.
  Corrigido em três frentes: `order` na quebra de 820px sobe a ação para antes
  da linha de atendimento (que responde à 2ª pergunta, não à 1ª, e segue na
  primeira tela); o apoio encurtou e a nota "nossa equipe é avisada
  automaticamente" só aparece **quando não há chamado aberto** (havendo, a
  linha de atendimento já diz quem cuida); e a linha de atendimento virou
  **duas linhas** (título + referência do chamado em `<small>`) em vez de uma
  frase corrida que quebrava em 3–4 linhas.
  Base do botão a 390px, antes → depois: 522→462 (calmo), 672→462
  (atendimento), 729→462 (atenção), 700→434 (crítico), 787→491 (sem sinal),
  579→564 (sem telemetria). A 320px o pior caso fica em 569px.
  ⚠️ **Quem acrescentar algo acima da ação precisa refazer essa medição.**

- Cache-bust: `cliente.css` v12, `cliente.js` v31.

⚠️ **O convite a avaliar na história depende de `ja_avaliado`, que só o
detalhe devolve** — `GET /cliente/chamados` (lista) não traz o campo. Em vez de
N requisições por tick, o painel busca o detalhe dos **3 chamados fechados mais
recentes** uma vez e guarda a resposta. Com uma linha no SELECT da lista
(`(ch.avaliacao_nota IS NOT NULL) AS ja_avaliado`) essas requisições somem —
está no roadmap, aguardando liberação para mexer no backend.

⚠️ **Verificação:** harness estático (os arquivos reais com `fetch` dublado),
contact sheet de **8 estados × 2 tamanhos** (1920px e 390px), com geometria
medida por `getBoundingClientRect` e não por captura reduzida. **Nada rodou
contra o backend real.**

### 2026-08-14 — O cabeçalho do painel vira o cabeçalho da landing (frontend)

Pedido do Pedro: *"deixar o cabeçalho igual o da landing page, mesmo tamanho,
tamanho de logo etc"*. A barra do painel tinha nascido inspirada na da landing
e havia divergido em sete pontos — o desktop batia em altura **por acidente**
(padding 17 + logo 40 + 17), e o celular era outra construção.

- **Tokens compartilhados, com os mesmos nomes do `landing.css`:** `--barra-h`
  (74px / 64px abaixo de 760px), `--area-max`, `--gut`
  (`clamp(20px, 5vw, 56px)`) e `--saida`. `--h-barra`, que era local e estava
  com o nome trocado, virou `--barra-h`.
  ⚠️ A altura agora é **declarada** (`height: var(--barra-h)`), não derivada de
  padding: era exatamente assim que ela saía do número documentado sozinha.
- **A coluna inteira foi alinhada à landing** — barra, `.folha` e rodapé
  passaram de `clamp(22px, 5vw, 40px)` para `var(--gut)`. O conteúdo do painel
  agora tem a mesma largura útil da `.area` da landing (1128px contra 1160px
  antes). Escolha do Pedro entre alinhar a coluna ou manter o recuo antigo.
- Alinhados também: fundo da barra (86% → **88%**), easing (`ease` → `--saida`),
  limiar do `is-rolada` (8px → **12px**, o do `landing.js`), logo no celular
  (34px → **32px**) e `scroll-padding-top`, que não existia.
- ⚠️ **O nome do prédio saiu da barra** e virou `.placa-topo`, o **cabeçalho do
  instrumento** — a anatomia que a DESIGN.md já descreve (cabeçalho / corpo /
  estado / nota separados por sulco gravado), com o corte de duas linhas
  (`--rasgo` + `--luz`) e o papel "título de tela" da rampa de UI (1.32rem /
  800 / Archivo). Era ele que forçava a segunda linha no celular (~107px contra
  os 64 documentados) e obrigava a barra a **não grudar**; a alternativa,
  truncar com reticências, tinha sido recusada em 14/08 por esconder
  justamente o que precisava ter peso.
  **Com ele fora, a barra do celular volta aos 64px e volta a grudar**, como a
  da landing. `.barra { position: static }` foi removida.
- ⚠️ **Regressão silenciosa evitada:** com o cabeçalho novo, a célula de texto
  deixou de ser `:first-child` da placa. `container-type: inline-size` e o
  `padding-bottom` da placa empilhada foram remapeados para
  `.placa-topo + .placa-cel`. Com `:first-child`, a contenção cairia na célula
  errada e a `.frase` perderia a referência de `cqi`.
- Cache-bust: `cliente.css` v13.

⚠️ **Verificação — contra o backend real desta vez** (servidor local na 3001,
banco de TESTE, `demo-cliente@teste.local`, estado "sem sinal"), com geometria
por `getBoundingClientRect`, nunca por captura:

| | Landing @1920 | Painel @1920 |
|---|---|---|
| Altura da barra | 74px | **74px** |
| `.barra-in` | 1240px, `padding-left` 56px | **1240px, 56px** |
| Logo | 40px | **40px** |

No celular (iframes de largura real — `resize_window` do Chrome não pegou, de
novo): barra **64px e `sticky`** de 320 a 760px, logo **32px**, e o logo
alinhado com a borda da placa em todas as larguras (20 / 20 / 20 / 21,5 / 27 /
38px). Sem transbordo horizontal em nenhuma.

⚠️ **A medição de "altura até a ação" mudou** — a regra manda refazê-la a cada
acréscimo acima do botão. Base de "Preciso de ajuda" no estado sem sinal:
**568,9px a 390px** (era 491) e **586,1px a 320px** (o pior caso documentado
era 569). O saldo é ~+5px a 390px e ~+17px a 320px: a barra devolveu 43px, o
cabeçalho da placa consumiu ~50, e a 320px o nome do prédio quebra em duas
linhas. A 390px folga; a 320px o botão fica parcialmente abaixo da dobra num
viewport de 568px — **em aberto**, ver
[`../memory-bank/active-work.md`](../memory-bank/active-work.md).

### 2026-08-17 — Cenário de telemetria variado no banco de teste (tooling)

`scripts/seed-cenario-telemetria.js` — novo. O `seed-teste.js` deixa os 4
reservatórios do condomínio DEMO com o mesmo `last_seen`, e como ele envelhece,
**todos aparecem offline**: a tela do cliente vira quatro cards idênticos e não
dá pra avaliar layout, alerta nem gráfico. O script regrava 72h de leituras
(1 a cada 10 min, com ruído de ±0,8 pp e PRNG determinístico) dando um estado
diferente a cada reservatório:

| Device | Reservatório | Estado | Alerta aberto |
|---|---|---|---|
| `DEMO-SUP1` | Caixa Superior 1 | online · ~88% · bomba desligada | — |
| `DEMO-SUP2` | Caixa Superior 2 | online · ~34% · bomba enchendo | `nivel_baixo` |
| `DEMO-CIST` | Cisterna | online · ~8% | `nivel_muito_baixo` |
| `DEMO-INCE` | Reserva Incêndio | **offline há 3h** · última ~70% | `dispositivo_offline` |

- **O offline é de verdade, não um flag** — cada cenário tem `ateHoras`, e o
  `last_seen` sai da última leitura gerada. É o mesmo caminho que
  `GET /cliente/status` e o `offline.job` leem.
- As curvas são **piecewise explícitas** (dente de serra de consumo, queda
  contínua na cisterna), não simulação: o valor final é previsível, que é o
  ponto de um dado de demonstração.
- Resolve os alertas abertos antes de abrir o alvo — o índice parcial
  `uniq_alerta_aberto` só admite um aberto por (device, tipo), e é alerta velho
  empilhado que polui a tela.
- Recusa rodar em produção pelo mesmo resolvedor do servidor (`src/db-url.js`).
- ⚠️ Com `node server.js` no ar, o `offline.job` derruba os três "online" depois
  de `OFFLINE_MINUTES` (default 10). Rodar o script de novo antes de demonstrar,
  ou subir com `OFFLINE_MINUTES=1440`.

Nada de schema, nada de código de produção. Detalhe do ambiente em
[`modulos/painel-cliente.md`](modulos/painel-cliente.md).

### 2026-08-17 — A primeira tela ganha teto: a placa parou de boiar (frontend)

O Pedro apontou que "em alguns casos o espaço em cima e em baixo do campo dos
reservatórios está imenso". Medido no `getBoundingClientRect`, com o CSS real
nos seis estados (nunca por captura), são **dois vazios diferentes**:

| | Antes | Depois |
|---|---|---|
| Acima/abaixo da placa (viewport 949px) | 137 / 149px | **67 / 79px** |
| Em volta do tubo, estado sem telemetria | 137 / 137px | **99 / 99px** |

- ⚠️ **A banda em volta da placa crescia 1:1 com a altura do monitor.** A placa
  tem altura de conteúdo (589px nos estados com telemetria); a `.resposta` tinha
  a altura da janela (`100dvh - --barra-h`) e centrava — todo o resto virava
  banda morta dividida em duas. Numa tela de 809px dava 67/79px e ninguém
  reclamou; numa de 949px, 137/149px. Agora o `min-height` tem **teto de
  46rem**: `min(calc(100dvh - var(--barra-h)), 46rem)`.
  **Efeito colateral aceito:** em telas altas o começo da história aparece
  abaixo da fita. Isso relativiza "a primeira tela INTEIRA é a resposta" — mas
  o vazio era o preço dessa afirmação, e o convite a rolar é melhor que a
  banda morta. Reversível em uma linha se o Pedro preferir o contrário.
- **No estado sem telemetria o vazio era do tubo mesmo.** Em duas colunas as
  células da placa têm a mesma altura (grade) e centram o conteúdo, então a
  diferença entre elas vira vazio simétrico — e ali a diferença é a maior de
  todas: bloco de 299px contra célula de texto de 465px. O tubo em contorno
  cresce para **105×344**, a mesma proporção da peça (.306) **escalada, não
  esticada** — esticar só a altura (testado a 82×373) transforma o cilindro
  num filete.
- É a **única regra `min-width` da folha** (`@media (min-width: 1001px)`), e o
  comentário diz por quê: empilhado cada célula tem a sua altura e não há
  disparidade, e no celular o `.tubo` de 210px vale para todos.
- Cache-bust: `cliente.css` v18.

⚠️ **Verificação** — seis estados × `getBoundingClientRect`, em harness que
carrega o `cliente.html/.css/.js` **reais** com `fetch` dublado (o CSP
`script-src 'self'` mata script inline: o dublê tem de ser arquivo servido).
Larguras 390 / 900 / 1180 em iframes de largura real: no celular o tubo segue
82×210 e a seção segue sem `min-height`; a 900px (empilhado) a placa é mais
alta que o teto e ele nunca morde; nenhum transbordo horizontal em nenhuma.

### 2026-08-17 — O estado "sem sinal" vira instrumento (frontend)

Três defeitos no mesmo estado, todos de acabamento, nenhum de conceito — o
conceito (hachura, nunca tubo vazio; "não sei" ≠ "está vazio") continua igual:

- ⚠️ **A hachura era invisível.** `#08133f` sobre `--mar-900` (#030a26) dá
  **1,1:1**: o tubo lia como um retângulo preto chapado, e o gesto que carrega
  o sentido do estado era justamente o único que não aparecia. Agora é
  `--sobre-2` a 20% (1,43:1 — textura, não texto), no mesmo −45° da fita de
  segurança e do chanfro. O estado passa a usar o vocabulário da casa em vez
  de um cinza herdado.
- **A coluna de leituras colapsava para um traço solto.** Todo estado tem duas
  leituras (Nível + Bomba); o mudo tinha só "NÍVEL —", porque sem leitura não
  há bomba a reportar. Um traço sozinho ao lado de um tubo hachurado é o
  desenho de uma tela inacabada. A segunda leitura volta medindo **tempo**:
  `SEM RESPOSTA HÁ / 3h`, no mesmo tratamento do nível (mono grande + unidade
  pequena). Não é leitura inventada — sai de `ultima_leitura.criado_em`, e é o
  único número honesto que sobra: o nível não se sabe, mas há quanto tempo não
  se sabe, sabe-se com precisão.
- **A linha ao lado do botão saiu, e é remoção de duplicata.** Com o
  instrumento dizendo "há 3h", `Última leitura desse sensor há 3h` repetia o
  mesmo dado do outro lado da placa. ⚠️ Ela **volta quando há 2+ sensores
  mudos**: aí o instrumento mostra só o pior e a linha é a única que fala do
  conjunto.
- `semSinalHa()` em `cliente.js` — o mesmo relógio do `desdeQuando`, partido em
  número e unidade porque no instrumento o tempo é medição, não frase.
- Cache-bust: `cliente.css` v21, `cliente.js` v35.

**O selo de sem sinal** (pedido do Pedro na sequência: *"era bom colocar um
símbolo de sem sinal pra ficar mais visual"*) — uma chapa chanfrada de 44px
carimbada no meio do tubo, com barras de sinal cortadas. A hachura diz "não
estamos medindo" para quem já conhece a peça; o selo diz para quem está vendo
pela primeira vez, que é o caso do síndico.

⚠️ **A geometria é a do `wifi-off` do Lucide** (já em `public/lucide.min.js`),
e isso é a correção de **dois desenhos meus que saíram tortos** — os dois
descobertos ampliando o ícone, não olhando a tela:

- **Três barrinhas cortadas** (o Pedro: *"tá mal feito esse símbolo"*). O corte
  tem de descer — subindo, acompanha as barras e o conjunto lê como **seta de
  crescimento**. Só que, descendo, **nenhuma reta cruza as três**: ela passa
  por cima da barra baixa sem tocá-la e retalha as outras duas em alturas
  diferentes. A 8×, o que sobrava eram tocos soltos. Não é ajuste fino, é
  impossível: barras que sobem e corte que desce não se encontram.
- **Triângulo cheio com uma vala.** O corte de 45° cai exatamente no eixo de
  simetria do triângulo retângulo e o parte em duas metades espelhadas — vira
  **gravata-borboleta**, não medidor cancelado.

O Lucide resolve o mesmo problema do jeito certo: os arcos são **desenhados
já interrompidos** onde o corte passa. Os vãos fazem parte da geometria, em
vez de serem abertos por cima com um traço grosso da cor do fundo. ⚠️ Não
"arrumar" os arcos fechando os vãos.

- **O leque de wi-fi é literal:** o ESP32 fala por wi-fi, e o que parou foi o
  rádio dele — não a água. As curvas são exceção assumida ao "traço sempre
  esquadrado" (o ícone de conta, na barra, já tem círculo e arco); a
  alternativa toda reta (`antenna` do Lucide) recai no problema das barras.
- ⚠️ **`stroke-linecap: square` é o que faz o ponto de baixo existir.**
  `M12 20h.01` é subcaminho de comprimento zero: com `butt` ele simplesmente
  não é desenhado, e some sem erro nenhum no console.
- SVG a **22px** dentro da chapa de 44: o desenho vai de canto a canto do
  viewBox e o `square` ainda avança meio traço em cada ponta — a 24px o corte
  encostava no chanfro da chapa.
- Chapa **opaca** e construção de duas camadas (fundo = fio, `::before`
  embutido 1px = chapa), como a `.placa` e o `.resto`: `box-shadow: inset`
  como borda sairia recortado nos dois chanfros, e chapa translúcida deixaria
  a hachura atravessar o desenho.

⚠️ **Nada de crista no tubo mudo.** Uma linha horizontal ali seria lida como
nível — a confusão que este estado existe para evitar. O selo não tem esse
risco: é centralizado, não tem altura que se leia como medida. Pelo mesmo
motivo o nível da última leitura conhecida **não** volta como fantasma, ainda
que a API o traga: a decisão de 14/08 (sem limiar, sem faixa, sem nada que
sugira um valor sobre a hachura) continua valendo.

Verificado nos seis estados e a 390px: o dt `SEM RESPOSTA HÁ` cabe em uma linha
no celular, e a ação não se move — a leitura nova entra na célula da prova, que
no empilhado vem **depois** de "Preciso de ajuda".

### 2026-08-17 — Total manual tira as colunas de valor unitário do PDF (backend)

Preencher **"Valor total (manual)"** (`orcamentos.valor`) sempre significou que
o preço **não** vem da soma dos itens. Mas o PDF continuava imprimindo as
colunas **Valor Unit.** e **Total** — cheias de "—" quando nenhum item tinha
preço, ou pior: com valores parciais que não fechavam com o VALOR TOTAL logo
abaixo, dando ao cliente uma conta que não bate.

Agora, quando `os.valor != null`:

- **Orçamento de peças** (`renderHTML`): a tabela de itens fica com `#`,
  Descrição/Especificações e Qtd. O `colspan` do estado vazio acompanha (3 em
  vez de 5). O box **VALOR TOTAL** continua igual.
- **Orçamento de serviço** (`renderHTMLServico`): cada `.valor-row` perde o
  `.valor-num` — a caixa vira a relação dos serviços cobertos, e o preço
  aparece só no VALOR TOTAL.
- ⚠️ **`renderMeasureHTML` espelha a condição** (thead + as duas linhas de
  amostra `item-base`/`item-ficha1`). É ele que mede a altura real da linha pro
  Puppeteer paginar; sem as colunas de moeda a descrição fica mais larga e a
  linha encolhe — medir com as colunas e imprimir sem elas erraria a quebra de
  página.

Sem total manual, nada muda: as colunas voltam e `fmtMoeda(null)` segue
imprimindo "—" no item sem preço (comportamento da migration 062).

### 2026-08-17 — No celular a coluna DEITA, como na landing (frontend)

Pedido do Pedro: *"no landing page quando vai para o mobile, o reservatório
fica na horizontal, acho que ficaria melhor assim no painel também"*. Era
inconsistência real — a landing tem o tratamento deitado desde 14/08 e o
painel, que reusa a mesma peça, só encurtava a coluna de 268 para 210px.

Abaixo de **820px** (onde este painel vira celular; na landing o ponto é 760)
o tubo passa a **100% × 132px**, os mesmos valores do `landing.css`, e as
leituras deixam de ser uma coluna ao lado para virar uma **fileira embaixo**
(`repeat(auto-fit, minmax(126px, 1fr))`, o `.instr-leituras` de lá).

⚠️ **Deitada, todo eixo do desenho troca** — cada regra tem par no
`landing.css`, e mudou lá, muda aqui:

| | Em pé | Deitada |
|---|---|---|
| lâmina | `translateY(100% - --n)` | `translateX(--n - 100%)` |
| crista | borda de cima | borda da direita |
| faixas | `bottom` / `height` | `left` / `width` |
| limiar | `border-top` | `border-left` |

- O gradiente da lâmina inverte para `to left`, senão o tom claro fica na
  ponta errada e a crista perde o encaixe.
- ⚠️ **O VINHO DO CRÍTICO VOLTOU, e isso reverte uma decisão.** De 14/08 a
  17/08 valeu aqui "a água é sempre azul" (argumento: água colorida vira
  imagem estranha, quem sinaliza é a crista). Eu apliquei a regra de novo ao
  deitar a coluna e o Pedro reabriu — *"pode mudar isso"*. Abaixo de 20% a
  lâmina volta a escurecer para `#7a1e2c → #4a1220`, os mesmos dois valores
  do `.coluna-agua` da landing, nos dois eixos.
  **Só no crítico:** no `baixo` a água continua azul e quem avisa é a crista
  âmbar — abaixo de 45% a bomba costuma repor sozinha, e pintar a lâmina ali
  transformaria rotina em alarme. Caiu metade da decisão de 14/08, não ela
  inteira. O que o argumento original não previa era a peça vista **lado a
  lado com a landing**, que foi o que a virada horizontal expôs.
- Ganho de altura: a prova sai de 210px de tubo + coluna de leituras para
  132px + fileira — sobra que vai direto para a dobra do celular.
- Cache-bust: `cliente.css` v23.

Medido a 390 / 760 / 900 / 1180 / 1440: deitada nas duas primeiras (297×132 e
631×132, crista exatamente no percentual da leitura), em pé de 900 para cima
(82×268, `prova-in` em duas trilhas), nenhum transbordo horizontal. A faixa de
**821–1000px** — placa já empilhada, tubo ainda em pé — ficou como estava; é
banda estreita (o iPad retrato tem 768 e cai no deitado, o paisagem tem 1024 e
cai nas duas colunas).

### 2026-08-17 — O tanque em branco do "sem telemetria" saiu (frontend)

Pedido do Pedro: *"não faz sentido ficar um reservatório lá em branco"*. Saiu o
`.sem-sensor` inteiro — o `<span class="tubo">` em contorno puro mais a
etiqueta "Sem medição".

**Por que ele não tinha conserto:** um contorno vazio no lugar do instrumento é
exatamente a leitura que este painel gasta uma tela inteira evitando —
*"seus reservatórios estão secos"*. A defesa registrada em 14/08 era ter
cortado de três tubos para um, mas isso tratou a **quantidade**, não a
**forma**: um tanque vazio afirma a mesma coisa falsa que três. E aqui é pior
que no sensor mudo, onde ao menos existe um reservatório real que parou de
responder — neste estado **o backend não conhece reservatório nenhum**, não há
tanque para desenhar nem cheio nem vazio.

- **Sem prova a mostrar, a célula da prova deixa de existir**: `display: none`
  na segunda `.placa-cel` e `grid-column: 1 / -1` na primeira. A placa vira uma
  peça só, e o estado passa a ser a frase + o motivo + as ações.
- **A oferta subiu de link para chapa.** "Quero monitorar meu prédio" era um
  link sublinhado solto acima do botão; agora é chapa de duas camadas ao lado
  de "Preciso de ajuda", dentro da `.rodape-resposta`. A placa perdeu a prova,
  não a segunda ação — e um link de uma linha não sustentava sozinho o estado.
  ⚠️ Continua **secundária**: o amarelo aparece uma vez por tela e é da ação de
  sempre. Quem separa as duas é a chapa contra o amarelo.
- ⚠️ **Tipo e recuo idênticos aos do `.ajuda`**, não os do `.resto`: lado a
  lado, .95rem contra 1,06rem davam 55 contra 56px de caixa e os dois chanfros
  desalinhavam 1px na base. Medido, corrigido, medido de novo.
- Saiu junto a **única regra `min-width` da folha** (o tubo do semtel crescendo
  para 105×344 acima de 1000px, de manhã). A lição fica no comentário: o vazio
  em volta era sintoma, o defeito era o tanque vazio existir.


Verificado nos seis estados (só o `semtel` esconde a segunda célula) e a 390 /
760 / 1180: os dois botões dividem a linha acima de 760px e quebram em duas no
celular, sem transbordo.

**Passada de composição na sequência** (`/impeccable onboard` — este estado é um
empty state de ativação, não uma tela de operação):

- ⚠️ **A placa encolhe para 720px.** Tirar a prova sem mexer na largura só
  troca o vazio de lugar: 1240px de peça para um bloco de texto de 425px é a
  mesma banda morta que o tanque deixava, agora dentro da placa. 720px é a
  largura em que o elemento mais largo do estado — a linha das duas ações,
  609px — enche a peça. A borda esquerda continua alinhada com a `.folha`:
  ela **encurta, não se desloca**.
- **Encolhendo, a placa descobre a engrenagem.** O que passa a ocupar a
  direita da tela é a marca em escala arquitetônica, que já estava atrás. O
  vazio virou material sem desenho novo e sem copy nova.
- **O apoio vira a mensagem.** Sem número e sem tanque, é essa frase que diz o
  que falta: sobe de 1,16rem/`--sobre-2` para 1,22rem/#cfd9f5, medida de 38ch,
  três linhas. Nos outros cinco estados ela continua secundária de propósito,
  porque lá quem fala é a leitura — verificado que a regra não vaza.
- **A dobra do celular melhorou:** base de "Preciso de ajuda" a 390px caiu de
  **564 para 543px** neste estado (o tanque removido devolveu mais altura do
  que o apoio maior consumiu). A 320px fica em 570px. Regra da casa cumprida:
  mexeu acima da ação, mediu de novo.
- Cache-bust: `cliente.css` v26.

⚠️ **Armadilha de sessão, não de código:** o service worker registrado em
`localhost:3001` sequestrou o harness de conferência e devolveu
`{"error":"Sem conexão"}` no lugar da página — a mesma armadilha de cache do
[`../CLAUDE.md`](../CLAUDE.md), agora vista de fora do admin. Em página nova
servida por `/static` durante desenvolvimento, se o conteúdo não bater com o
arquivo, **conferir o SW antes de procurar bug**.

### 2026-08-17 — Sem telemetria: a prova vira a OFERTA (frontend)

Veredito do Pedro sobre a passada de composição de tarde: *"estou achando essa
tela muito ruim"*. Ele estava certo, e o diagnóstico do que eu tinha feito:

- **A engrenagem gigante não era "marca em escala arquitetônica", era
  decoração tapando buraco.** Eu criei um vazio (tirando o tanque, o que
  estava certo) e deixei um ornamento preencher.
- **A manchete gritava uma AUSÊNCIA em 70px** — nos outros estados aquele
  volume é a resposta sobre a água; aqui era o que o cliente NÃO tem, no topo
  de uma tela cujo trabalho é tranquilizar.
- **O estado não tinha conteúdo**, então qualquer composição virava buraco.
  Isso não se resolve movendo caixa.

Quatro caminhos foram postos lado a lado (mesmo método que decidiu o cilindro
em 14/08), e **o Pedro escolheu o B — "a oferta"**:

> A célula da prova **não some: ela troca o que prova.** Este é o único estado
> em que o produto ainda não foi entregue, então a prova é o que o sensor
> passaria a mostrar — e a tela deixa de ser sobre o que falta para ser sobre
> o que vem.

- **`.oferta`** no lugar da `.prova`: rótulo mono ("Com o sensor, esta tela
  passa a mostrar") e três linhas — nível de cada reservatório · bomba ligada
  ou parada · aviso antes de faltar água. Separadas pelo **sulco gravado da
  casa** (`--luz` em cima, `--rasgo` embaixo), o mesmo par do cabeçalho da
  placa.
- ⚠️ **Nenhum número, nenhum tanque, nenhuma leitura de exemplo.** Um
  instrumento com valor inventado no painel de um cliente é o pior erro
  possível num produto que vende medição. A oferta é texto.
- ⚠️ **A numeração 01/02/03 do estudo NÃO entrou**, por dois motivos: os três
  itens são paralelos, não uma sequência — número que não ordena nada é
  ornamento —, e em âmbar seriam o **segundo** amarelo da tela.
- ⚠️ **O amarelo troca de botão.** Continua uma vez por tela, mas aqui a ação
  que importa é a oferta, não o socorro: "Quero monitorar meu prédio" fica
  âmbar e "Preciso de ajuda" vira contorno, do mesmo tamanho. **O DOM troca
  junto** (`cliente.html`) — ordem visual que não bate com ordem de tabulação
  é defeito de teclado, não detalhe.
- **A manchete baixa de volume** para `clamp(2rem, 9cqi, 3rem)`: com a célula
  da direita cheia, ela não precisa mais carregar a tela sozinha.
- **Revertidos** a placa de 720px e o apoio de 1,22rem/#cfd9f5 da passada de
  tarde. A placa volta a 1240 e a duas colunas, como em todos os outros
  estados.
- Cache-bust: `cliente.css` v27.

**Dobra do celular a 390px** (a regra manda medir sempre que algo muda acima da
ação): base da ação principal em **508px** — era 564 antes de hoje e 543 na
passada de tarde. A ação secundária termina em 586 e a oferta começa em 625,
abaixo da dobra de propósito: é conteúdo de apoio, não a ação.

Verificado que nada vaza: nos outros cinco estados `.oferta` fica `none`,
`.quero` fica `none`, "Preciso de ajuda" segue âmbar e a `.prova` segue no
lugar. Sem transbordo horizontal a 320 / 390 / 760 / 1180.

### 2026-08-18 · Área segura do iOS no admin

Continuação do conserto feito no painel do cliente no mesmo dia. O `admin.html`
declarava `black-translucent` sem `viewport-fit=cover` — mesma causa, mesma
faixa descoberta acima da `.mob-topbar` no PWA instalado.

- `viewport-fit=cover` no `<meta viewport>` do `admin.html`.
- `.mob-topbar` cresce com `env(safe-area-inset-top)` e ganha `padding-top`
  igual; `.main` e `.layout-cli .main` descontam a altura nova.
- `.drawer-head` idem: no celular o drawer é tela cheia (`top: 0; bottom: 0`)
  e o cabeçalho dele caía na mesma armadilha.
- Cache-bust: `admin.css` v191, `register-sw.js` v37 nas três HTMLs que
  registram o SW, `CACHE_NAME` → **telemetria-v46** (`admin.css` está no
  precache).
- ⚠️ **Não verificado em iPhone** — não há aparelho iOS neste ambiente. Em tela
  sem entalhe `env()` vale 0 e o resultado é idêntico ao anterior.

Detalhe do mecanismo em [`arquitetura.md`](arquitetura.md), seção "Área segura
do iOS".

### 2026-08-19 · Remover usuário voltou a funcionar

`DELETE /admin/usuarios/:id` respondia **"Erro ao remover usuário"** (500) para
qualquer usuário que já tivesse criado ou aprovado alguma coisa no sistema.

- **Causa:** as colunas de autoria criadas nas migrations 023, 026, 030, 032 e
  035 referenciavam `usuarios(id)` **sem cláusula `ON DELETE`**. O padrão do
  Postgres é `NO ACTION`, que bloqueia o `DELETE` com erro `23503`; o `catch`
  genérico do endpoint transformava isso num 500 sem explicação.
- **Migration 073:** varre o catálogo (`pg_constraint`) e converte toda FK →
  `usuarios` ainda em NO ACTION/RESTRICT para `ON DELETE SET NULL` — o
  orçamento/contrato/plano continua existindo, só perde o autor. Varrer o
  catálogo em vez de listar nomes fixos era necessário porque a coluna
  `ordens_servico.orcamento_aprovado_por` (023) foi dropada pela 030 e os nomes
  de constraint gerados pelo Postgres podem divergir entre bancos.
- **Endpoint:** `23503` agora responde **409** nomeando a tabela que segura o
  vínculo, em vez de 500 mudo. O front (`_cfgRemoverUsuario`) já exibia
  `data.error`, então a mensagem chega na tela sem alteração no `admin.js` —
  e sem bump de `?v=N`.

Detalhe das FKs em [`banco-de-dados.md`](banco-de-dados.md), seção
"Remoção de usuário".

### 2026-08-21 · O envio de e-mail dizia "enviado" sem ter enviado

Sintoma relatado pelo Pedro: clicar em enviar o orçamento demorava, aparecia
"enviado", e o e-mail não chegava.

**Causa: o SDK do Resend não lança em erro de API.** `emails.send()` devolve
`{ data, error }` — numa falha o `error` vem preenchido e a Promise **resolve
normalmente**. As seis chamadas em `src/services/email.js` faziam
`await getResend().emails.send({...})` e descartavam o retorno. Com isso o
endpoint marcava `status = 'enviado'`, gravava `enviado_em` e respondia
`ok: true` para qualquer um destes: `invalid_from_address`,
`validation_error`, `invalid_attachment`, `monthly_quota_exceeded`,
`daily_quota_exceeded`, `rate_limit_exceeded`, `invalid_api_key`…

O front estava correto o tempo todo — ele checa `r.ok` e mostraria o erro.
Quem mentia era o backend.

**Correção:** todo envio passa por `_enviar(payload, contexto)`, que checa o
`error`, lança com o **código do provedor** na mensagem (é ele que diz o que
fazer: cota, domínio não verificado, anexo grande demais) e loga o id da
mensagem no sucesso, para rastrear a entrega no painel do Resend.

A demora é outra coisa e continua: o PDF é gerado com Puppeteer antes do
envio.

### 2026-08-20/21 · O painel admin veste o Chapa

As 15 telas do admin saíram do sistema "Mission Control" (âmbar `#f0b014`,
aurora radial, vidro, raio 12px) e passaram a usar o **Chapa** da landing, do
login e do painel do cliente, em registro de operação. Branch
`feature/admin-chapa`, 11 commits. Direção e direções descartadas em
[`../memory-bank/decisions.md`](../memory-bank/decisions.md); o antes/depois
medido em [`modulos/painel-admin.md`](modulos/painel-admin.md); as regras
novas do sistema em [`../DESIGN.md`](../DESIGN.md).

**As cinco decisões do plano, todas implementadas:** faixa de KPI de 120–330px
para 54px (e virando uma placa dividida, não seis cartões) · ficha que colapsa
e desliza · um selo de estado (preenchido pede ação, de fio em repouso) ·
unidade ao lado do número · `planos` como molde da tabela.

**Regras novas que a migração obrigou a criar** (todas em `DESIGN.md`):

- **A Regra da Superfície** — "placa clara é o que ABRE POR CIMA": modal,
  drawer, lightbox. O que fica lado a lado com o conteúdo continua marinho.
- **A Regra do Preenchimento Cru** — fundo de selo usa `--amarelo`/
  `--vermelho`/`--verde` (que não flipam); texto e borda usam os semânticos
  (que viram tinta na placa clara).
- **A Regra da Paleta Categórica** — três slots, em ordem fixa, validados com
  o validador da skill `dataviz` contra a superfície real do gráfico. O teto
  de três é medido: uma quarta matiz fria dá ΔE 1,9 sob protanopia.

**Correções de conteúdo, não de pele:** "ALERTAS CRÍTICOS" na Telemetria era
rótulo errado (conta todos os alertas ativos) · "Uso do TTR" mostrava
`12750%` e virou "estourou há 21 dias" · três KPIs de Chamados e a faixa
inteira de Alertas repetiam as abas logo abaixo, e saíram.

**Nav reagrupada** em Agora / Em curso / Cadastro / Análise / Sistema — por
quando se abre, não pela ordem em que os módulos nasceram.

**Detector da skill `impeccable`:** 947 → 822 achados; as 7 barras de cor na
borda foram a zero.

⚠️ O app mobile do técnico (`app/public/app.css`) **não** migrou: tem cópia
própria dos tokens com `--accent: #f0b014`. É a quarta identidade do produto
até ser tratado.

### 2026-08-21 · As cores de estado sobre placa clara eram a mesma cor

`--atencao-t` (#8a5300) e `--risco-t` (#b3241a) tinham **luminosidade
praticamente idêntica** — L .494 e .499 em OKLCH — e as duas matizes são
quentes. Sob deuteranopia a matiz colapsa e não sobra nada: **ΔE 1,2**. Ou
seja, "atenção" e "crítico" eram indistinguíveis para quem tem daltonismo
vermelho-verde, justamente nos dois estados cuja confusão muda uma decisão.

Isso valia nas quatro superfícies (landing, login, painel do cliente e admin),
e o painel do cliente está em produção.

**A separação passou a vir da luminosidade**, que sobrevive ao daltonismo:

| | antes | agora |
|---|---|---|
| `--risco-t` | `#b3241a` L .499 | `#790000` L .34 · 9,7:1 |
| `--normal-t` | `#145c33` L .421 | `#105c31` L .42 · 6,8:1 |
| `--atencao-t` | `#8a5300` L .494 | `#886116` L .52 · 4,7:1 |

Crítico ↔ atenção foi de **ΔE 1,2 para 15,4**. Os outros dois pares (5,9 e
6,9) seguem na faixa de piso por falta de espaço — os três precisam de ≥ 4,5:1
como texto sobre a placa, o que trava L em ~.52 — e isso é aceitável porque
estado neste sistema nunca aparece sem rótulo escrito. Detalhe e prioridade em
[`../DESIGN.md`](../DESIGN.md), Regra dos Dois Campos de Estado.

Saiu junto o `#a81b12` das mensagens de erro de formulário (login e landing):
era um quarto vermelho escrito à mão, e agora aponta para `--risco-t`.

### 2026-08-24 · O documento de orçamento fica completo, e ganha porta no cabeçalho

Duas correções pedidas pelo Pedro depois de ver a tela.

**1. O acesso estava enterrado.** O único caminho permanente para os
orçamentos era um link *dentro* da ficha "Sua conta" — que é onde moram
trocar senha e sair, ou seja, gaveta de configuração. Agora existe um ícone
no cabeçalho do painel (`.conta-orc`), ao lado de "Sua conta", com **selo de
contagem** que só aparece quando há orçamento aguardando (`pintarSeloOrc` em
`cliente.js`). Contador que mostra zero vira ruído permanente e ensina a
pessoa a ignorar o lugar onde o número aparece. O link antigo continua onde
estava.

**2. O documento era esparso.** Referência trazida pelo Pedro: a página
pública de NF-e do Omie. O que foi adotado é a **arquitetura da informação**,
não a pele — a tela segue Chapa, em marinho com chanfro, e não ganhou cantos
arredondados, verde-menta nem coluna lateral.

| Antes | Agora |
|---|---|
| Tipo de serviço como título, número em mono de .68rem por cima | **O número é o título**; o tipo é a legenda — é o número que identifica o documento no telefone, no e-mail e na capa do PDF |
| "Válido até" como sufixo do total | **Faixa de metadados** (`.orc-meta`): Prédio · Enviado em · Válido até, cada um com rótulo mono gravado |
| Condições numa frase corrida com `·` e travessão no que faltava | Três células rotuladas; **o que não existe não aparece** |
| Tabela de 3 colunas | 4 colunas, com **total por linha** e rodapé de soma — sem ele a pessoa multiplica de cabeça para conferir |
| Especificação da linha só no PDF | `ficha_tecnica` entra sob a descrição |
| PDF como botão solto no fim de "Condições" | Painel **Documentos**, com nome, descrição e a linha do arquivo |
| `<h4>` sem contexto | Cada seção tem título e uma linha que diz o que ela é |

**Dois casos-limite que a verificação em tela encontrou** (andaime estático,
quatro cenários, 1440px e 390px):

- **Item sem preço lançado** — legítimo desde a migration 062, que tornou
  `valor_unitario` nullable de propósito. Quando NENHUM item tem preço, a
  soma dava `R$ 0,00` e a nota de divergência disparava dizendo que o valor
  real era outro: o documento parecia quebrado justamente para quem está
  decidindo se confia nele. Agora as duas colunas de dinheiro **somem** (o
  mesmo que o `orcamento-pdf.service` já faz) e a linha de apoio explica: "O
  valor é fechado no total, sem preço por item."
- **Soma parcial** (alguns itens com preço, outros não) — a divergência é
  esperada e apontá-la seria alarme falso. O rodapé passa a dizer "Soma dos
  itens com valor" e a nota não aparece.

⚠️ **Quatro colunas não cabem em 390px.** Em vez de encolher a fonte ou
deixar a tabela rolar de lado — o que esconde justamente a coluna de total —,
cada linha vira um bloco e cada célula recebe o rótulo da sua coluna via
`data-rot`. Mesmo HTML, sem duplicação: o `thead` é que sai.

**Segunda rodada, depois de o Pedro abrir a tela.** Três defeitos que a
verificação anterior não pegou porque foi estreita — só o documento, só a
1440px, e nunca a lista:

- **O rodapé flutuava no meio da tela.** Com um orçamento só, a página é mais
  curta que a viewport e o `body` terminava onde o conteúdo terminava. O
  `<body>` da página ganhou `.pagina-orcs` (flex column + `min-height:
  100dvh`), e o rodapé passou a ser o fim da página.
- **A coluna única era uma tira.** 780px fixos numa tela de 1900 deixavam
  ~800px de campo morto e empilhavam tudo. O documento agora usa a área
  inteira e se divide em **duas colunas a partir de 1000px** — o mesmo que a
  tela de referência faz. O critério da divisão é o que se LÊ (constatação,
  itens, a conta) contra o que se precisa ter à mão para DECIDIR (condições,
  PDF, resposta), não o tamanho dos blocos.
- **Folga do topo grande demais.** `5vw` batia no teto de 56px e somava com o
  botão de voltar.

⚠️ **`display: flex` no `<body>` encolheu o `.folha` de 1240px para 740px.**
Num contêiner flex, a `margin: 0 auto` do filho consome o espaço livre e
**desliga o stretch** do `align-items` — o main vira shrink-to-fit. Só
apareceu porque as caixas foram medidas no DOM; a olho, a página "parecia"
certa. A correção é `width: 100%` explícito, que não é redundante aqui.

⚠️ **`auto-fit` com o gap pintado deixa buraco.** A faixa de metadados
desenhava as divisórias pintando o fundo do contêiner e deixando o `gap` de
1px vazar. Elegante enquanto a última fileira está cheia — e um **bloco
cinza morto** assim que sobra célula, que foi o que aconteceu com
"Condições" (3 células) na coluna de 447px, onde `auto-fit` resolvia para 2
colunas. Agora o número de colunas é sempre explícito e a divisória é borda
de célula: sem fileira parcial, não há buraco possível.

**Voz corrigida na tela toda.** "a General agenda o serviço", "a General
envia por e-mail" e "tudo o que a General orçar" violavam a regra de
primeira pessoa do plural do [`PRODUCT.md`](../PRODUCT.md) — falar de si na
terceira pessoa faz a tela soar como um terceiro apresentando a empresa.
Viraram "agendamos", "mandamos" e "todo orçamento que fizermos".

O botão do PDF virou **"Baixar o PDF"**: nomeia a ação que executa (ele
baixa, não abre), e o número do orçamento saiu do rótulo porque já é o
título da página.

**Ferramenta:** [`scripts/preview-orcamentos.js`](../scripts/preview-orcamentos.js)
sobe a tela sem banco e sem login, com cinco cenários (`completo`, `minimo`,
`aprovado`, `divergente`, `varios`). Serve para desenho e casos-limite; não
prova nada sobre o backend.

Cache-bust: `cliente.css` v39, `cliente-orcamentos.js` v6, `cliente.js` v38.

### 2026-08-24 · `migrate.js` passa a imprimir os `RAISE NOTICE`

Migration que trabalha dentro de um bloco `DO $$` não casa com o
`/ALTERs+TABLEs+(w+)/` que o script usa para listar colunas depois de
aplicar — ela reporta o que fez por `RAISE NOTICE`, e o `node-postgres` só
entrega isso a quem escuta o evento `notice` no **client** (o `pool.query` não
dá acesso a ele). A 073 avisava disso num comentário no próprio `.sql`.

Resultado prático: a 073 saía como `✓ Migration aplicada com sucesso` e mais
nada, fosse ela ter convertido cinco FKs ou nenhuma — os dois casos
indistinguíveis. Agora a execução usa um client dedicado com listener, e cada
notice sai como `ⓘ ...`.

Com isso, **a 073 foi confirmada como já aplicada** em 24/08: rodou em silêncio,
o que significa que não achou FK em NO ACTION para converter.

### 2026-08-21/24 · O síndico responde ao orçamento na tela dele

Até aqui o orçamento saía por e-mail com o PDF anexado e a resposta voltava
**por fora do sistema** — telefone, WhatsApp, e-mail solto. Quem registrava o
"aprovado" era alguém do escritório, no admin, então `aprovado_por` sempre
apontava para um usuário interno e não havia registro de que o cliente, ele
mesmo, tinha dito sim.

**Página nova:** `/cliente/painel/orcamentos?orc=N`
(`public/cliente-orcamentos.{html,js}`). Lista e documento são dois estados da
**mesma página**, trocados por `history.pushState` — não é modal, porque um
orçamento é documento que a pessoa lê, pensa e às vezes mostra para outra antes
de responder, o que pede URL própria, rolagem inteira e o voltar do celular
funcionando.

**Backend** (`src/routes/cliente.routes.js`): `GET /cliente/orcamentos`,
`GET /cliente/orcamentos/:id`, `POST /cliente/orcamentos/:id/responder`,
`GET /cliente/orcamentos/:id/pdf` — todas escopadas por `condominio_id` e
filtradas por `_ORC_VISIVEIS_AO_CLIENTE` (`enviado`, `aprovado`, `rejeitado`).
**Rascunho responde 404, não 403**: um 403 confirmaria que existe orçamento em
preparo, informação que o cliente não deve ter.

**Dois riscos de produção evitados no desenho:**

- a página **não** pode morar em `/cliente/orcamentos`. As rotas de página são
  registradas antes do `app.use("/cliente", clienteRouter)`, então ela
  sombrearia o `GET` da API de mesmo nome e o fetch da lista receberia HTML —
  o `Unexpected token '<'` do `CLAUDE.md`.
- o `/login` precisou aceitar `next=` para cliente, com allowlist estreita
  (`public/login.js`). Sem isso o link do e-mail — que quase sempre abre sem
  sessão, no celular — fazia o síndico entrar e cair no painel, tendo que caçar
  o orçamento que o e-mail já apontava.

#### 2026-08-24 · O convite no e-mail foi DESLIGADO, e o PDF estava quebrado

Revisão da tela antes de ela encontrar cliente real achou um caminho que
falhava **sempre**: o botão "Abrir o PDF" era `<a href>` para
`GET /cliente/orcamentos/:id/pdf`, que é `authRequired`. O `authRequired` lê
**só** o header `Authorization: Bearer` (não há cookie de sessão neste
sistema), e navegação por link não manda header nenhum — o cliente abria uma
aba com `{"error":"Token ausente"}`.

- **Correção:** virou `<button data-pdf>` → `baixarPdf()`, que busca com
  `fetch` + `authHeaders()` e entrega o blob por âncora com `download`, mesmo
  caminho do `baixarPDF` do painel (`public/cliente.js`). Download em vez de
  aba nova de propósito: `window.open` depois de um `await` cai no bloqueador
  de pop-up do celular, que é justamente onde o link do e-mail é aberto.
- `.orc-pdf` no `cliente.css` ganhou os resets que um `<a>` não precisava
  (`border`, `cursor`, `font`) e estado `[disabled]`.
- Cache-bust: `cliente.css` v32 nos dois HTMLs, `cliente-orcamentos.js` v2.
  `CACHE_NAME` do SW **não** subiu — não entrou endpoint novo, e `/cliente` já
  estava na lista network-first.

**O convite no e-mail saiu do ar por ora.** `linkPainel` em
`POST /admin/orcamentos/avulsos/:id/enviar-email` passou a depender de
`_linkPainelLigado()`, que lê `ORCAMENTO_LINK_PAINEL` do ambiente e está
**desligado por padrão**. Motivo: a tela nunca foi vista logada e este e-mail
vai para síndico de cliente real. Com a chave desligada o e-mail sai como
sempre saiu — só com o PDF anexado — porque `sendOrcamentoCliente` já trata
`linkPainel: null` removendo o convite do HTML e do texto puro.

**Para religar:** `ORCAMENTO_LINK_PAINEL=1` no Railway. É variável de ambiente
e não constante no código para que religar não exija deploy, e desligar de novo
seja questão de segundos.

✅ **Migration 074 aplicada em produção em 24/08/2026** — confirmada pela
listagem de colunas que o `scripts/migrate.js` imprime depois de aplicar.
#### 2026-08-24 · O menu lateral do admin não cabia na própria tela

O painel admin tem **15 itens de navegação** (14 quando o WhatsApp está
desligado) e a nav caía no `overflow-y: auto` — menu com barra de rolagem.
Medido com Puppeteer sobre a `public/admin.html` real, varrendo viewport de
1040 a 620px de altura: **22 dos 28 cenários rolavam**, inclusive o monitor
mais comum. Em 936px (janela maximizada em 1080p) a nav pedia 814px e tinha
727px — faltavam 87px.

Duas causas, e a segunda é a que importa:

1. As duas faixas de `@media (max-height)` da sidebar tinham **buraco entre
   elas**: a faixa de 900px não cabia mais em 780–860px, e a próxima só
   começava em 760px. Nessa janela a lista rolava mesmo em tela grande.
2. Os **cinco rótulos de seção** (`AGORA`, `EM CURSO`, `CADASTRO`,
   `ANÁLISE`, `SISTEMA`) custavam 136px — três itens e meio de menu — em
   texto de 10px que ninguém clica.

**Rótulo virou filete.** O `.nav-section-label` agora é uma aresta de 1px
(`background: var(--border)`) em vez de etiqueta em caixa alta. O texto
**continua no HTML**: `admin.js` varre `.nav-section-label` para esconder
grupo que ficou órfão no perfil operador, e o leitor de tela continua lendo os
nomes — some da tela por `font-size: 0` + `text-indent`, não por
`display: none`. O primeiro filete é omitido (`:first-child`) porque o
header já tem borda embaixo, e na barra recolhida ele **fica**, agrupando os
ícones onde antes só havia vão morto.

**Três faixas de altura em vez de duas.** Medido de 1 em 1px, de 980 a 590px
de viewport, no pior caso (15 itens):

| Faixa | Item | Conteúdo | Header | Rodapé | Viewport |
|---|---|---|---|---|---|
| base | 38px | 678px | 60 | 119 | 901 … ∞ |
| `max-height: 900px` | 34px | 588px | 56 | 109 | 801 … 900 |
| `max-height: 800px` | 30px | 500px | 50 | 96 | 701 … 800 |
| `max-height: 700px` | 28px | 447px | 48 | 91 | 614 … 700 |

Resultado: **uma única transição na varredura inteira** — abaixo de 614px a nav
volta a rolar, e aí o `overflow-y: auto` faz o papel dele. Nenhum buraco entre
faixas. O notebook 1366×768 (~637px reais) cabe.

⚠️ **Duas armadilhas de medição**, registradas porque as duas custaram uma
rodada de correção:

1. **Sem `await document.fonts.ready` o rodapé mede 102px em vez de 119px** —
   o `.sidebar-user` encolhe com a fonte de fallback. Piso de faixa calculado
   assim sai ~16px otimista.
2. **Amostra esparsa não prova ausência de buraco.** A primeira medição usou
   alturas fixas (936, 900, 860, 800…), deu 28 de 28 cenários verdes e mesmo
   assim havia uma janela de 5px — **882 a 886** — em que a faixa base valia e
   os 678px não cabiam. Só a varredura de 1 em 1px achou. Por isso o
   breakpoint é 900 e não 880.

Cache-bust: `admin.css?v=223` e `admin.js?v=308`. Sem endpoint novo, então
o `CACHE_NAME` do `sw.js` **não** subiu.

#### 2026-08-24 · Filete revertido para texto: rótulo sem letra "espalhava" os ícones

Pedro olhou o resultado do filete (entrada acima, mesmo dia) e não gostou:
sem legenda, a folga que sobrava entre grupos (distribuída por
`margin-top: auto` nas quatro arestas) lia como "ícones espalhados sem por
quê", não como respiro. `margin-top: auto` saiu — a sobra de altura, quando
existe, agora fica onde o flexbox já bota por padrão: um único vão embaixo
de "Configurações", antes do rodapé, em vez de repetido quatro vezes no
meio da lista.

`.nav-section-label` volta a mostrar "EM CURSO", "CADASTRO", "ANÁLISE",
"SISTEMA" — mono, `8.8px` (o piso documentado no DESIGN.md pra etiqueta
gravada, `.55rem`; não dá pra descer mais sem ficar ilegível, mesmo
problema que o `.rc-label` já tinha resolvido antes). O texto nunca saiu do
HTML, só o CSS escondia — mesma base de acessibilidade da versão filete.

**Depois disso o Pedro mandou o print: "está mt compactado".** E estava — só
que a causa não era o rótulo, era a **largura das faixas de `@media`**.

Com três faixas largas, os valores de cada uma tinham de caber no **pior
viewport da faixa**. Quem estivesse em 889px (janela de navegador comum, não
maximizada) levava o aperto calculado para 801px. Medido no painel real
nessa altura: a lista ocupava 563px dentro de 702px disponíveis — **139px de
vão morto** entre "Configurações" e o rodapé, com a lista espremida no topo.
Aperto dimensionado para o pior caso vira desconforto no caso comum.

**A escada foi de 3 degraus para 8.** Cada altura passa a receber a
densidade que comporta, conferida no **piso** de cada faixa (o viewport mais
baixo em que ela ainda vale), sempre no pior caso de 15 itens:

| Faixa | Item | Margem do rótulo | Conteúdo | Folga no piso |
|---|---|---|---|---|
| base (1001…∞) | 40px | 16px | 759px | 31px |
| `max-height: 1000px` | 38px | 14px | 717px | 15px |
| `max-height: 940px` | 36px | 13px | 683px | 15px |
| `max-height: 890px` | 35px | 12px | 644px | 17px |
| `max-height: 850px` | 33px | 9px | 600px | 13px |
| `max-height: 800px` | 32px | 9px | 566px | 5px |
| `max-height: 750px` | 29px | 7px | 513px | 13px |
| `max-height: 700px` | 27px | **filete** | 433px | 15px |

Só a faixa mais apertada (614–700px, notebook com barra de tarefas e
favoritos) fica com o filete sem letra — nem com o item em 27px sobra altura
pra letra.

**Onde o respiro do rótulo mora:** `margin-top`, não `padding` nos dois
lados. O rótulo pertence ao grupo que abre, então a folga tem de separá-lo
do grupo **anterior**; com padding simétrico ele flutuava no meio do vão e a
lista lia como um bloco só. Zero embaixo cola a legenda no primeiro item do
seu grupo. Pelo mesmo motivo o `gap` entre itens do mesmo grupo é sempre bem
menor que a margem do rótulo — se as duas distâncias competem, o
agrupamento some.

Varredura contínua de **1100 a 590px, 1 em 1px**: overflow só abaixo de
598px (antes era 613px), e nenhum buraco entre as oito faixas. No painel
real em 889px o vão morto caiu de 139px para 93px e o item subiu de 34 para
35px.

Cache-bust: `admin.css?v=228`.

### 2026-08-24 · O valor manual é editado no lugar do total

No trilho do modal de orçamento, "definir manualmente" abria **um segundo
campo** embaixo, rotulado "Valor total (manual)", com a nota "Sobrepõe a soma
dos itens no PDF". O resultado é que o trilho passava a mostrar **dois totais
ao mesmo tempo** — o somado, grande, em cima; o digitado, pequeno, embaixo —
e o único jeito de saber qual dos dois ia pro PDF era ler a nota.

Agora o campo **ocupa o lugar do número**. Clicar em "definir manualmente"
troca o total por um input com a mesma fonte, o mesmo corpo (29px mono 800) e
o mesmo canto da tela, com uma régua âmbar embaixo e o cursor dentro. Não há
segundo total em lugar nenhum: `#avRailTotal` e `#avValorManualWrap` são
mutuamente exclusivos, e quem decide é o mesmo `#avToggleValorManual` de
sempre — a troca de visibilidade mora em `_avAtualizarTotalRail`, junto com o
cálculo, e não espalhada pelos listeners.

A linha de apoio embaixo muda de papel junto: fora do modo manual continua
`4 itens · definir manualmente`; dentro dele vira
`soma dos itens: R$ 6.460,00 · voltar a somar`. A soma não some da tela — ela
é justamente o número que está sendo sobreposto, e é por ele que se decide o
que digitar. Foi para onde foi parar a nota "sobrepõe a soma dos itens": em
vez de explicar a regra, o trilho mostra o número.

**Duas armadilhas de layout, as duas medidas no DOM:**

- **O trilho pulava 6px** a cada clique. A régua âmbar (2px de borda + 2px de
  padding) deixa o campo mais alto que o número sozinho, e tudo abaixo descia.
  `.av-total` ganhou a **mesma régua, transparente**: os dois estados medem
  36px de altura e começam no mesmo `y` (medido: `120/36` nos dois).
- **O "R$" alinhado por `baseline`** com o número somava mais 2px, porque as
  caixas de linha de 17px e 29px têm alturas diferentes. Com `line-height`
  igual nos dois, `align-items: flex-end` dá o mesmo resultado visual sem
  mexer na altura.

`max-width: 260px` no bloco de edição: abaixo de 1080px o trilho vira faixa de
largura inteira, e sem o teto a régua atravessaria a janela toda. No trilho de
300px o bloco já mede 259px — lá não muda nada.

O placeholder é `--muted2`, não âmbar transparente: **dentro do modal o
`--accent` é reescrito** para o âmbar escuro da placa clara (`#886116`), e
âmbar a 34% em cima dela simplesmente some.

O salvamento não mudou uma linha: `_avAcao` continua lendo
`avInputValorManual`, e desmarcar continua limpando o campo, o que manda
`valor: null` e devolve o total pra soma dos itens.

**Ferramenta:**
[`scripts/preview-total-orcamento.js`](../scripts/preview-total-orcamento.js)
(padrão do [`scripts/preview-orcamentos.js`](../scripts/preview-orcamentos.js)):
serve `public/` e monta só o trilho, sem banco e sem login, **extraindo do
`admin.js` real** o `_orcFmtValor` e o `_avAtualizarTotalRail` em vez de
copiá-los. Os dois defeitos de altura acima só apareceram medindo
`getBoundingClientRect` nos dois estados — em captura de tela, nenhum dos dois
se vê.

Cache-bust: `admin.css?v=229`, `admin.js?v=311`.

### 2026-08-24 · O total manual sumia do sistema (e era apagado no banco)

Sintoma relatado: *"quando defini manualmente, muitas vezes salva no PDF o
valor, mas no sistema continua 0,00."* Não era problema de exibição — era
**perda de dado**, e o PDF certo era o que disfarçava.

A cadeia inteira:

1. `GET /admin/orcamentos/avulsos` devolvia `valor_total`
   (`COALESCE(o.valor, soma dos itens, 0)`) e **não** devolvia a coluna
   `orcamentos.valor`.
2. O modal decide se o modo manual está ligado por `o.valor != null`. Com a
   chave ausente, todo orçamento aberto pela lista nascia **com o campo do
   total manual vazio e o modo desligado**, mesmo havendo valor no banco.
3. O trilho passava a mostrar a soma dos itens. Como o total manual existe
   justamente para o caso de item sem preço lançado, essa soma é `NULL` → o
   painel mostrava **R$ 0,00**.
4. O "Salvar" seguinte mandava `valor: null` e **apagava** o total manual.
   Até esse salvamento, o PDF (que lê o banco) continuava correto — daí a
   impressão de que "o PDF salva e o sistema não".

**Conserto:** a lista voltou a trazer `o.valor` ao lado do `valor_total`, com o
comentário de contrato na própria query. E `_avAcao` só manda `valor` no
`PATCH` quando a chave existe no registro (`"valor" in _avSelecionado`) — o
rascunho novo nasce com `valor: null` explícito para caber nessa regra. Se um
payload futuro deixar de trazer a coluna, o efeito passa a ser "não atualizou"
com aviso no console, não perda silenciosa.

**Estrago já feito, e não recuperável:** três orçamentos **aprovados** estão
com total R$ 0,00 no banco — `OR-000170` (Condomínio Collori), `OR-000169` e
`OR-000105` (Vivaz Penha). Todos têm itens sem preço lançado e `valor` nulo.
Não há tabela de auditoria com o valor antigo; os PDFs já enviados por e-mail
são a única cópia. Precisam ser redigitados à mão.

Verificado rodando a query real da rota (fatiada do próprio
`admin.routes.js`) contra o banco de produção, em leitura: a coluna `valor`
volta na resposta, e `OR-000164` traz `valor = 1690.00` junto com
`valor_total = 1690.00`. Conferido também que `numeric` do Postgres chega ao
front como **string** (`"1690.00"`) e que o `input type=number` aceita esse
formato (`valueAsNumber = 1690`, `checkValidity() = true`) — é dele que o
modo manual é reconstruído.

Sem migration e sem bump de `CACHE_NAME`: mudou só o SELECT de uma rota que já
estava na lista network-first do SW.

### 2026-08-24 · O e-mail do orçamento ganhou a cara da casa (e perdeu o campo de mensagem)

O e-mail que leva o orçamento ao cliente era um bloco de texto em branco: a
mensagem que o operador tivesse digitado no modal, o botão do painel quando
ligado, e uma imagem de assinatura por usuário. Nenhum sinal da marca, nenhum
dado do documento — quem recebia via um parágrafo solto com um PDF anexo.

**Agora é um e-mail transacional com identidade**, no formato de nota fiscal
eletrônica que o Pedro trouxe como referência: faixa marinho (`#030a26`) com o
logo, etiqueta âmbar "ORÇAMENTO COMERCIAL", saudação, o parágrafo de
encaminhamento, o botão de responder (quando há painel), a caixa
**Informações do orçamento** — Número, Cliente, Data, Válido até — e o rodapé
com o nome, os telefones e o e-mail comercial.

**Sem o valor total, de propósito.** A caixa mostra o que identifica o
documento, não o preço: o valor é assunto do PDF, e mandá-lo no corpo do
e-mail o espalha por caixas de entrada e encaminhamentos que ninguém controla.

**O campo "Mensagem" e o upload de assinatura saíram do modal de envio.** O
documento é o PDF; o e-mail é a carta de encaminhamento, e carta reescrita a
cada envio é carta que uma hora sai errada para cliente real. Quem precisar
dizer algo específico responde o e-mail depois de enviado. O modal ficou com
um campo só — "Para" — já pré-preenchido com o `condominios.email`.

A remoção foi **só da interface**: `/admin/me/email-template`,
`/admin/me/assinatura`, `/admin/assinatura/:userId` e as colunas
`usuarios.email_mensagem` / `assinatura_blob` continuam de pé, sem chamador.
Nada de migration, e as assinaturas já cadastradas não se perderam — religar é
devolver os campos ao modal. `_avPrepararAssinatura` (a redução de imagem no
navegador) ficou junto, marcada como parada, para não ter de ser reescrita.

**Três armadilhas de e-mail, todas conhecidas e todas tratadas:**

- **Logo embutido, e reduzido antes.** URL externa é bloqueada por padrão no
  Outlook (o próprio e-mail de referência chegou com o logo em branco), então
  o logo vai como data URI. Mas `public/logo-topo.png` tem 68 KB, que viram
  91 KB em base64, e o Gmail **apara** a mensagem acima de ~102 KB de corpo —
  o anexo não conta nesse limite, o data URI conta. Novo
  [`scripts/gerar-logo-email.js`](../scripts/gerar-logo-email.js) gera o
  `public/logo-email.png` reduzido (20 KB → 27 KB em base64); o corpo inteiro
  fica em **31 KB**, medido. Mesma lição do `_avPrepararAssinatura`: reduzir a
  imagem antes de embutir, não aumentar o limite do outro lado.
- **O estilo do `<img>` é o estilo do `alt`.** Com a imagem bloqueada, o que
  aparece é o texto alternativo, que herda cor e corpo do próprio `<img>`. Sem
  `color:#ffffff` ali, o topo ficaria com "General Bombas" em preto sobre a
  faixa marinho — ou seja, invisível. Conferido com a imagem bloqueada de
  propósito: o nome aparece em branco, e a etiqueta âmbar (que é texto) segura
  o resto.
- **Layout em `<table>` aninhada, estilo inline.** O Outlook renderiza com o
  motor do Word: ignora flex, grid, `max-width` em `div` e folha em `<style>`.

**Duas datas, dois formatadores.** `data_documento` e `valido_ate` são DATE —
dia de calendário, sem fuso; `criado_em` é timestamptz. Passar um DATE por
`toLocaleDateString` com `timeZone` joga a data um dia pra trás (servidor em
UTC, driver entrega meia-noite, conversão pra UTC-3 volta pro dia anterior).
Mesma regra de `fmtDateOnlyBR`/`fmtDateBR` no `orcamento-pdf.service.js`.

**Ferramenta:**
[`scripts/preview-email-orcamento.js`](../scripts/preview-email-orcamento.js) —
sobe o e-mail no navegador sem banco, sem Resend e sem enviar nada: o SDK é
dublado e devolve o payload que *teria* sido enviado, então o que aparece na
tela é o `sendOrcamentoCliente` de verdade. Tem as duas variantes (com e sem o
botão do painel), a versão em texto puro e o tamanho do corpo em KB no topo.

Cache-bust: `admin.js?v=311`. Sem migration e sem bump de `CACHE_NAME`.

### 2026-08-25 · O pino do cadastro caía no centro da cidade (culpa da BrasilAPI)

Cliente cadastrado na Penha aparecia com o pino na Sé. Não foi regressão do
código: a **BrasilAPI trocou o provider de coordenada** do `/api/cep/v2`. Com o
`service: "open-cep"`, o `location.coordinates` deixou de ser a coordenada do
CEP e passou a ser o **centroide do município** — todo CEP de São Paulo volta
`-23.5475, -46.63611`, todo CEP do Rio volta `-22.90642, -43.18223`, e os
valores repetem CEP a CEP. Como a BrasilAPI era a primeira da fila de
coordenadas, o pino ia sempre para o centro; a AwesomeAPI, segunda, continuava
com a coordenada certa (Penha: `-23.5244, -46.5476`) e nunca era consultada.

Agora `_coordsDeCep(brasilData, awesomeData)` decide a coordenada num lugar só:
prefere a **AwesomeAPI** (nível de rua) e aceita a BrasilAPI apenas quando o
`service` não está em `_CEP_SERVICES_SEM_COORD_REAL` (hoje, `open-cep`). Sem
nenhuma coordenada confiável, o fluxo cai no Nominatim como antes. Os dois
caminhos que geocodificam por CEP — a busca por CEP e o auto-preenchimento por
CNPJ, que tinha a escolha duplicada — passaram a usar o mesmo helper.

Os condomínios cadastrados enquanto isso valia ficaram gravados no centroide;
reposicionar é reabrir o cliente e arrastar o pino (ou apagar o CEP e digitar
de novo, que agora vem certo). Detalhes e a armadilha em
[`modulos/mapa-geocoding.md`](modulos/mapa-geocoding.md).

Cache-bust: `admin.js?v=312`, `admin.css?v=230`. Sem migration e sem bump de
`CACHE_NAME`.

### 2026-08-25 · O orçamento passa a chegar pelo painel, não pelo anexo

Primeiro envio real (OR-000175) mostrou três coisas erradas no e-mail novo.

**O logo chegava esticado.** O `<img>` tinha `width="190"` e `height:auto` —
e o Outlook renderiza com o motor do Word, que ignora `height:auto`: ele
combinou a largura forçada (190 px) com a altura **nativa** do arquivo (83 px)
e achatou o logo. Agora a altura vai declarada no atributo **e** no estilo, e é
calculada em `_logoEmail()` a partir do IHDR do próprio PNG (bytes 16..24) —
190×42 para o `logo-email.png` atual. Trocar o logo por um de outra proporção
não reabre o defeito.

**Não havia link para o sistema.** O convite estava desligado por padrão desde
24/08 (`ORCAMENTO_LINK_PAINEL`), esperando a tela do cliente ser vista logada.
Agora o padrão inverteu: **sai ligado**, e a variável virou kill-switch
(`=0` volta ao formato antigo, sem deploy). Duas armadilhas resolvidas junto:

- O link exigia `APP_URL` configurada. Sem ela, o e-mail saía sem link e em
  silêncio. Novo `_baseUrlPublica(req)` tenta `APP_URL`, depois
  `PUBLIC_BASE_URL`, e por fim deriva do próprio request — o app roda com
  `trust proxy`, então protocolo e host chegam certos atrás do Railway.
- O link só é montado quando o condomínio **tem usuário `cliente`**. Botão que
  leva a um `/login` onde ninguém entra é pior que botão nenhum; nesse caso o
  e-mail sai como antes, com o PDF.

**O PDF não faz sentido junto com o link.** Anexo e botão competindo davam ao
síndico um caminho que termina sem resposta: ele lê o anexo, fecha o e-mail, e
a decisão nunca chega. Agora **é um ou outro** — com painel, o link; sem
painel, o anexo. O documento continua acessível: a tela do cliente tem o botão
"Baixar o PDF" (`GET /cliente/orcamentos/:id/pdf`, que gera sob demanda) — e o
texto dessa seção, que dizia "o mesmo documento que foi anexado no e-mail",
foi corrigido: mandava a pessoa procurar na caixa de entrada um arquivo que não
foi. Agora diz o que o arquivo é ("o orçamento completo, com timbrado, para
guardar ou imprimir"). Efeito
colateral bem-vindo: **o caminho comum de envio não depende mais do Puppeteer**,
que era a etapa que mais falhava em container apertado.

A rota passou a devolver `link_painel` e `anexo`, e o admin usa isso para dizer
o que saiu ("Enviado com o link do painel" × "Enviado com o PDF em anexo") em
vez de afirmar sempre "com o PDF anexo" — o front não tem como saber sozinho,
já que a decisão depende de uma consulta a `usuarios`.

`scripts/preview-email-orcamento.js` acompanha: `/` mostra a variante com link
(sem anexo) e `/?link=0` a com PDF.

Cache-bust: `admin.js?v=313`, `admin.css?v=231`. Sem migration e sem bump de
`CACHE_NAME`.

### 2026-08-25 · O login do orçamento vira cartão na própria página

O link do e-mail levava para `/cliente/painel/orcamentos?orc=N`, e a página
mandava quem não tivesse sessão para `/login?next=…`. Funcionava, mas trocava o
documento que a pessoa veio ver por um formulário em outra página — e este link
é justamente o de quem quase nunca tem sessão aberta, lendo no celular.

Agora a entrada acontece **por cima da própria página**: `#entradaFundo`, um
cartão que reusa `.ficha-fundo` / `.ficha` do painel (o mesmo gesto de "abre por
cima" que o síndico já viu na história do prédio). A URL com `?orc=N` fica na
barra, e fechar o cartão é estar no documento. Referência apontada pelo Pedro:
a página pública de documento do Omie.

**Nenhuma rota nova.** O fluxo é o de `login.js`, porque o backend é o mesmo:
`POST /auth/login` → token direto (OTP desligado) ou `pending` + `otp_token` →
`POST /auth/verify-otp`. O aparelho confiável já viaja em cookie de mesma
origem.

O que o cartão resolve e o redirect não resolvia: **401 no meio do caminho**
reabre o cartão em vez de trocar de página (inclusive no `responder`, onde
perder o documento logo depois de decidir era o pior momento possível);
**conta do escritório** é barrada com a razão dita (`role !== "cliente"` passa
no login e levaria 403 silencioso); e **quem nunca teve senha** encontra
WhatsApp e telefone no pé do cartão, em vez de um formulário que não tem como
preencher.

**Rede de segurança:** `GET /cliente/orcamentos` aberta no navegador (Accept
com `text/html` — `fetch` manda `*/*`) passou a redirecionar 302 para
`/cliente/painel/orcamentos` com a query preservada. Sem isso, a URL sem o
`/painel` responde `{"error":"Token ausente"}` em JSON cru; foi o que apareceu
no primeiro teste do link.

**Desenho.** Cartão de 430px, campos e botões do sistema, sem etiqueta gravada
acima do título (na ficha do painel a `.id` carrega o número do chamado; aqui
seria só enfeite). O código de 6 dígitos é mono tabular com folga entre as
figuras — é medição conferida dígito a dígito contra o e-mail aberto ao lado. E
a entrada **não vira folha cheia no celular** como as outras fichas: são dois
campos, e o cartão centrado é o que diz "falta só isto"; folha cheia voltaria a
parecer outra página, que é o que saímos de fazer. Verificado em 1440px e em
390px.

Cache-bust: `cliente.css?v=40` (nos dois HTMLs), `cliente-orcamentos.js?v=7`.
Sem migration e sem bump de `CACHE_NAME` — nenhum endpoint novo.

### 2026-08-25 · O síndico deixa de ter senha

O problema que abriu o assunto era prático: para mandar um orçamento com link,
o Pedro precisava antes criar o usuário e mandar login **e senha** por e-mail.
Ao olhar o código, apareceu o fato que resolve isso sozinho: **em produção o
OTP já era obrigatório em todo login** — o atalho `OTP_DISABLED` só vale fora
de produção (`if (!isProd && ...)` em `auth.routes.js`). A senha do síndico
nunca foi o que protegia a conta; quem controla o e-mail entra de qualquer
jeito. Ela só somava trabalho para o escritório e esquecimento para o cliente,
e o sistema **não tem recuperação de senha em lugar nenhum**.

Agora: o escritório cria o usuário com o e-mail (sem senha) e **o e-mail é a
credencial**. Entrar é digitar o e-mail e o código de 6 dígitos que chega nele.

- **`POST /auth/codigo`** (nova, `loginLimiter`): recebe só `email`, exige
  `role = 'cliente'`, recusa condomínio encerrado, e devolve o **mesmo**
  `{ pending, otp_token }` do login com senha — o segundo passo é o
  `/auth/verify-otp` de sempre, sem fluxo paralelo para manter. Aparelho
  confiável continua valendo: ali ela devolve o JWT direto.
- **Resposta neutra:** e-mail desconhecido recebe o mesmo "enviamos", com um
  `otp_token` apontando para ninguém (`id: null`). O código não casa e a
  resposta é "Código inválido ou expirado". Sem isso o endpoint viraria um
  verificador de quem é cliente da casa.
- **Só cliente passa por lá.** Para qualquer outro papel seria um atalho que
  dispensa a senha do admin.
- **`POST /admin/usuarios`:** `senha` virou opcional para `role='cliente'` — e
  o cliente nasce com bcrypt de **32 bytes aleatórios**. `usuarios.senha_hash`
  continua `NOT NULL`: sem migration, sem coluna nova, e o login com senha
  nunca casa para ele.
- **Modal de usuário do admin:** o campo de senha some quando o tipo é Cliente,
  substituído pela nota do código; a lista esconde o botão de resetar senha
  para clientes (ele geraria uma senha temporária que ninguém usa e revogaria
  os aparelhos confiáveis do síndico).
- **`/login` ganhou dois modos na mesma placa:** "Sou do condomínio — entrar
  sem senha" esconde o campo de senha (e tira o `required`, que travaria o
  submit em silêncio) e troca o botão para "Receber o código". A equipe segue
  com senha — para quem entra todo dia, código por login é pedágio.
- **O cartão da página de orçamentos** virou e-mail → código, com o mesmo par
  de rotas. O rodapé do login deixou de falar em "esqueceu a senha", que no
  modo código não quer dizer nada.

Efeito colateral que resolve um buraco antigo: **"esqueci a senha" deixa de
existir** para o cliente. Não havia recuperação; agora não há o que recuperar.

Cache-bust: `admin.js?v=314`, `admin.css?v=232`, `login.js?v=5`,
`cliente-orcamentos.js?v=8`. Sem migration e sem bump de `CACHE_NAME`.

### 2026-08-25 · A landing passa a reconhecer quem já entrou

Relato do Pedro: clicar em "Ver como funciona" no painel do cliente leva para a
landing, e lá o cabeçalho diz "Entrar" — parecia que o sistema tinha
desconectado a pessoa. Não desconectava: a landing só nunca olhou a sessão.

O botão agora vira **"Meu prédio"** (cliente) ou **"Meu painel"** (equipe),
apontando para o painel do papel, e o "Acessar o sistema" do rodapé acompanha.
Tudo local: o papel vem do `user` no `localStorage` e a validade do `exp` do
próprio JWT — pendurar um `/auth/me` no carregamento de uma peça de venda por
causa de um rótulo seria caro à toa. Token vencido, `localStorage` bloqueado ou
JSON corrompido mantêm o "Entrar" de sempre, para não mandar ninguém a um
painel que o devolveria ao login.

Verificado nos três estados: sessão de cliente (vira "Meu prédio" →
`/cliente/painel`), token expirado (volta a "Entrar" → `/login`) e sem sessão.

Cache-bust: `landing.js?v=7`.

### 2026-08-25 · O rodapé do painel para de repetir a marca

Relato do Pedro: como a barra do topo é fixa, ao chegar no rodapé aparecem
**duas marcas na mesma tela** — o wordmark em cima e o lockup completo embaixo.
O lockup estava ali como "a única aparição do lockup com a assinatura",
argumento que valia enquanto a barra rolasse junto com a página.

Reorganizado com `/impeccable layout` (modo Operate). O rodapé do painel não
fecha uma peça de venda como o da landing: ele devolve o **canal humano**, e
agora é isso que lidera. Saiu o logo; entrou `.rodape-chamada` ("Prefere falar
com a gente?") na âncora esquerda que era dele — sem ela o `space-between`
deixaria os canais colados numa borda e um buraco na outra. A chamada é
**secundária** de propósito (`--sobre-2`, peso 700) e os números subiram para
1,1rem/700: quem lidera é o telefone, não a pergunta; em branco e 800 os dois
pesavam igual. A frase ainda distingue este caminho do "Preciso de ajuda", que
abre chamado dentro do sistema.

A marca continua no rodapé — como **assinatura em texto** na `.rodape-fim`,
entre o contexto da tela e o ano, que é o que uma assinatura de rodapé precisa
ser. No celular ela desce para a própria linha.

Verificado nas duas páginas que usam a folha (`/cliente/painel` e
`/cliente/painel/orcamentos`), em 1440px e 412px; scan mecânico da skill
(`--scope layout`) sem achados. **A landing manteve o lockup**: lá o rodapé
fecha o argumento de venda, e a decisão é outra.

Cache-bust: `cliente.css?v=41` nos dois HTMLs.

### 2026-08-25 · A ficha "Sua conta" perde o que ficou sem função

Consequência direta das duas mudanças do dia, apontada pelo Pedro: os
orçamentos viraram ícone fixo na barra e o cliente deixou de ter senha — então
a ficha "Sua conta" estava hospedando dois caminhos mortos.

Saíram o link "Meus orçamentos" e o formulário "Trocar a senha". O formulário
não era só redundante: para um síndico criado do jeito novo, a "senha atual"
dele é o hash aleatório que ninguém conhece — ele **nunca** conseguiria
completar a troca. No lugar entrou "Como você entra", uma linha explicando que
não há senha para guardar e que o código chega no e-mail.

Na sequência, o Pedro pediu o passo seguinte — **"não dá para colocar o botão
de sair no cabeçalho?"** — e a ficha deixou de existir. A barra ficou com o
nome de quem está logado (em `<span>`, não em botão: alvo que não leva a lugar
nenhum ensina a duvidar dos outros alvos) e o **Sair** ao lado, com ícone de
porta. No celular o nome some junto com os rótulos e sobra só o ícone.

Saíram do front `#fConta`, `prepararConta()`, a chave `conta` do mapa `FICHAS`
e a classe `.conta-link`. O `#btnSair` já era tratado pelo handler global de
clique, então mudou de lugar sem mudar de lógica. Testado logado: o botão sai,
limpa a sessão e cai no `/login`.

`POST /cliente/trocar-senha` continua no backend, sem chamador: saiu a
interface, não o dado — mesmo tratamento de `/admin/me/email-template`.
`.conta-link` saiu do CSS por não ter mais uso, e o `trocarSenha()` e seu
listener saíram do `cliente.js`. Verificado logado, sem erro no console.

Cache-bust: `cliente.css?v=43`, `cliente.js?v=40`.

### 2026-08-25 · A tela de login para de perguntar quem você é

O Pedro trouxe o incômodo: os dois públicos entram pela mesma
`telemetria.generalbombas`, e por isso o login tinha um botão perguntando se a
pessoa era de condomínio ou não. A pergunta que ele fez junto era a resposta —
**"existe a chance de fazer um jeito onde você coloca o e-mail primeiro?"**.

Existe, e era o caminho certo. O que a tela pedia é que a pessoa se
classificasse dentro da nossa modelagem de dados antes de digitar qualquer
coisa; quem cai ali vindo do link do orçamento sabe o próprio e-mail, não sabe
se é "condomínio" ou "equipe". O `role` já decidia o caminho no servidor.

Entrou `POST /auth/metodo`: recebe só o e-mail, responde
`{ metodo: "senha" | "codigo" }`, **não autentica nada** — não emite token, não
lê senha, não dispara e-mail. A tela virou três passos (`email` → `senha` ou
`otp`) no lugar de dois modos. Saiu o botão `#modoToggle`; saíram `_modoCodigo`,
`_aplicarModo` e `_mostrarPasso` do `login.js`, que viraram `_irPara`.

E-mail desconhecido responde `codigo`, não erro: "esse e-mail não existe" na
tela de login é um verificador de quem tem conta. Ele segue para o passo do
código, o `/auth/codigo` devolve o `otp_token` que aponta para ninguém e o
código nunca casa — mesma resposta neutra que já existia. O que o endpoint
revela e por que isso é aceitável está documentado em
[modulos/autenticacao.md](modulos/autenticacao.md).

No visual, o e-mail confirmado não volta como campo desabilitado: vira etiqueta
gravada (`.identidade`) — rótulo em Martian Mono caixa-alta, valor como dado, e
um "trocar" com peso de link, porque duas ações primárias na mesma placa
brigariam. Ela aparece nos passos da senha e do código, e toma o lugar do
subtítulo, que depois do e-mail dado não tem mais o que instruir. O botão ganhou
estado travado ("Verificando…" / "Enviando código…") com o varrimento fechado.

Quem cai em `codigo` pula direto para o OTP, sem clique extra — não há segundo
campo para preencher. E `/login?email=...` agora pré-preenche o campo, deixando
o foco no botão: avançar sozinho faria um GET disparar e-mail de código.

**Descartado: separar os domínios.** Custa DNS, certificado, sessão que não
atravessa domínio, service worker duplicado e o dobro do `?v=N` — e não resolve,
porque quem salvou o link errado continua caindo no lugar errado, agora sem
botão para corrigir. Separar move a escolha para a URL em vez de eliminá-la.

Cache-bust: `login.css?v=6`, `login.js?v=6`, `sw.js` → `telemetria-v50`,
`register-sw.js?v=40` nos três HTMLs que o registram.

### 2026-08-25 · Os tetos de tentativa deixam de depender do IP

O Pedro perguntou se a mudança do login tinha aberto falha. Tinha uma coisa
minha para dizer — a enumeração de colaborador, que é o preço do
identifier-first — e, olhando o fluxo inteiro em vez de só o meu diff,
apareceu uma **anterior e mais séria**.

**O código de 6 dígitos não tinha teto próprio.** A única proteção era o
`otpLimiter`: 10 tentativas por IP a cada 15 min. Quem tem muitos IPs — proxy
residencial se aluga aos milhares — comprava mais 10 chutes por endereço, com
o código válido pelos 10 minutos inteiros. São 1.000.000 de combinações e não
é preciso cobrir todas para ter chance boa; um código errado não invalidava
nada. Migration **075** adiciona `login_codes.tentativas`: ao 5º erro o código
é queimado e a pessoa pede outro. O teto passa a ser **do código**, e quantos
IPs o atacante tem deixa de importar.

Na mesma linha, `/auth/login` e `/auth/codigo` ganharam um segundo limitador
chaveado pelo **e-mail** (10 e 5 por 15 min), normalizado com `trim` +
minúsculas — sem normalizar, a mesma conta com outra grafia teria cota própria
e o teto seria de mentira. Protege contra chute de senha distribuído e contra
encher a caixa de entrada da vítima de códigos. O preço, assumido: dá para
travar o login de alguém conhecido por 15 minutos. É melhor que a alternativa.

A comparação do código virou `_codigoConfere`, em tempo constante — o ganho
aqui é pequeno, mas `===` em segredo é o que se copia para onde o ganho não é.
⚠️ `login_codes.code` é `CHAR(6)` e volta do Postgres **com padding de
espaço**: sem `trim` dos dois lados, todo código legítimo seria reprovado.

**Verificado contra o banco de teste**, com a migration aplicada: 5 erros
queimam o código e o código certo depois já não entra; errar 2 e acertar
continua entrando; o teto por e-mail bloqueia o 6º pedido e trata
`Sindico@Predio.com` e `  sindico@predio.com  ` como a mesma cota.

**O que continua exposto, de propósito:** `/auth/metodo` diz se um e-mail é de
colaborador interno. É um vazamento novo (antes nenhum endpoint distinguia um
e-mail do outro) e não dá para fechar sem devolver a tela ao botão de
auto-classificação. A existência da conta continua protegida — cliente e
inexistente respondem igual. Superfície inteira tabelada em
[modulos/autenticacao.md](modulos/autenticacao.md).

### 2026-08-25 · "Enviamos um código de 6 dígitos para comer"

O Pedro viu isso na tela de orçamentos e perguntou o que era. A palavra veio de
quem digitou — mas quem deixou passar era código nosso.

O `<form>` da entrada tem **`novalidate`**, e isso desliga a validação do
navegador: o `type="email"` do campo vira só o teclado do celular, não uma
regra. Do lado do JS a checagem era `if (!email)` — "está vazio?" —, nunca
"isto parece um endereço?". Aí `comer` seguia para o `/auth/codigo`, que
responde neutro por design, e a tela anunciava com toda a confiança
`Enviamos um código de 6 dígitos para ${email}`.

A frase absurda é o sintoma; o defeito é a entrada não validada, e ele existia
desde que o cartão nasceu. Entrou `_RE_EMAIL` no `cliente-orcamentos.js`, com
a mensagem falando do que a PESSOA escreveu ("Isso não parece um e-mail") sem
mencionar cadastro — a neutralidade quanto a existir conta continua intacta.

A mesma checagem foi para o `login.js` por consistência. Lá o form **não** tem
`novalidate` e o navegador já barrava; é o cinto que sobrevive a alguém
acrescentar `novalidate` um dia.

**O app do técnico não tinha o furo**: lá o login exige senha, então nunca se
chega ao passo do código com um e-mail que não existe.

**A lição, que vale para todo `novalidate` do projeto:** o atributo não é
cosmético — ele transfere para o JS a obrigação inteira de validar, e
`if (!campo)` não é validar. Ver
[modulos/painel-cliente.md](modulos/painel-cliente.md).

Cache-bust: `cliente-orcamentos.js?v=9`, `login.css?v=7`, `login.js?v=7`,
`telemetria-v51`, `register-sw.js?v=41`.

### 2026-08-25 · A tela sem telemetria passa a nomear o produto

O Pedro percorreu o caminho do e-mail de orçamento até o painel e parou nesta
tela: *"estou achando essa tela fraca, não ficou muito claro o que é o produto
para dar vontade de clicar em ver como funciona"*.

A manchete era **"Ainda não medimos o seu prédio."** — uma negação sobre a
NOSSA ausência, que informava uma lacuna administrativa em vez de dizer o que
existe para ele. Propus trocar por manchete de dor ("se faltar água amanhã,
você descobre pelo interfone") e ele recusou na hora: *"a landing já está cheia
dessas frasesinhas de impacto"*. Aqui o síndico tem segundos antes de fechar a
página, e o que ele precisa nesses segundos é saber **o que é** — não sentir.

Ficou:

> **_Telemetria_ para o seu reservatório.**
> Um sensor mede o nível o tempo todo e avisa antes de faltar água.

- **"Telemetria" em âmbar**, a pedido dele. Não precisou de CSS novo:
  `.frase em` já era o grifo que os outros estados usam para nomear o
  reservatório. ⚠️ É o **segundo** amarelo da tela, contra a regra de um por
  tela — aceito porque os dois apontam para o mesmo objeto (a palavra e o
  botão dizem "telemetria"), e a regra existe contra regiões que **disputam**
  atenção. O estado "atenção" já estica a mesma regra com quatro regiões.
- **O botão passa a repetir o nome** — "Conhecer a telemetria" no lugar de
  "Ver como funciona", que é rótulo de quem já decidiu que quer.
- **"Seu contrato de manutenção continua igual"** saiu do apoio e virou nota
  abaixo dos três itens. Não pode sumir: responde ao medo de quem vê oferta de
  quem já presta serviço no prédio. Só não abre mais a tela.
- ⚠️ **Nada de "mais novo", "lançamento", "agora", "novidade"** — o Pedro pegou
  isso na primeira versão ("nosso produto mais novo"): são datas disfarçadas de
  adjetivo, que envelhecem sozinhas e ninguém volta para trocar.

**Verificado no Chrome, desktop e 390px.** A manchete quebra em duas linhas nos
dois. No celular o botão principal **subiu para ~370px** (era 508px), porque o
apoio perdeu uma linha.

**Tentado e revertido:** com a copy mais curta a placa encolheu e sobrou folga
desigual na primeira tela (84px acima, 96 abaixo). Soltei o `min-height` desse
estado para dar 53px simétricos; o Pedro viu e recusou. A tela cheia continua.

Cache-bust: `cliente.css?v=44`, `cliente.js?v=41`, `telemetria-v52`,
`register-sw.js?v=42` — este último alinhado nos **quatro** HTMLs que o
registram. ⚠️ O `cliente-orcamentos.html` tinha ficado em `v=39`: cada `sed` de
bump procurava a versão anterior, e quem estava atrasado nunca era alcançado.
Conferir os quatro juntos, não um por vez.

### 2026-08-25 · O F12 para de entregar os comentários do código

*"No F12 que dá pra ver o HTML dá pra ver um monte de comentários, gostaria que
tirasse."* — e ele tem razão: os `<!-- -->` do projeto carregam raciocínio
interno de produto e decisões de negócio, e vão junto para o navegador.

**A limpeza é na entrega, não no arquivo.** Apagar do fonte custaria caro: é
neles que moram as armadilhas do projeto, e o CLAUDE.md trata comentário no
código como documentação de primeira classe. Entrou `src/html-limpo.js` com
`enviarHtml(res, caminho)`, que as seis rotas de página passaram a usar no
lugar de `res.sendFile`. Cache em memória, invalidado por `mtime` em dev.
Páginas 9% a 62% menores.

⚠️ **`/static` deixou de servir `.html`** — sem isso a limpeza não valeria
nada, porque `/static/cliente.html` entregava o arquivo cru. Nada referenciava
`.html` por baixo de `/static`; de quebra os estudos `public/_*.html` (telas
antigas servidas ao vivo) pararam de ser alcançáveis.

**O bug que o próprio projeto plantou:** a primeira versão do parser procurava
os blocos `<script>`/`<style>` antes de olhar os comentários. A linha 15 do
`admin.html` tem um comentário que **menciona** `<script>` — "bumpe o `?v=N`
aqui E no `<script>` lá embaixo" — e o parser tomou aquilo por abertura de
bloco, protegendo 136 KB até o `</script>` seguinte, 2.400 linhas adiante. O
teste pegou: 135 comentários continuavam saindo e o admin encolhia 1% em vez
de 9%. Agora é varredura única, e quem vem primeiro no texto ganha — comentário
e bloco se aninham nos dois sentidos.

Testado: `<!--` dentro de `<script>`, `<script>` dentro de comentário,
condicional de IE (que sobrevive de propósito — é marcação disfarçada),
comentário sem fechamento, e as seis páginas reais conferindo contagem de tags
e de scripts antes/depois. Login e painel do cliente abertos no Chrome, sem
erro de console.

⚠️ **Vale só para HTML.** `admin.js`, `cliente.js` e os `.css` continuam com os
comentários deles, também legíveis no F12. Tirar exigiria minificação de
verdade, que é build — e o projeto não tem build por escolha. Em aberto.

Cache-bust: `telemetria-v53`, `register-sw.js?v=43` nos quatro HTMLs.

### 2026-08-25 · O envio do orçamento vira duas opções, com listas diferentes

*"Agora a função enviar por e-mail enviará ainda para todos e-mails cadastrados
ou só para quem tem usuário?"* — a pergunta do Pedro expôs um furo que a
mudança do dia anterior tinha aberto.

**O furo:** o e-mail ia para todos os endereços de `condominios.email`, e o
formato era escolhido por `SELECT 1 ... LIMIT 1` — "existe **algum** usuário
cliente neste condomínio?". Num prédio com síndico, zelador e administradora
onde só o síndico tem login, os três recebiam o e-mail **com link e sem
anexo**; dois deles clicavam, caíam no `/login` e o código nunca chegava. O
acesso de um decidia pelos outros. Nos três orçamentos mais recentes do banco
de teste, as duas listas divergem em **todos**.

**A correção, como o Pedro pediu:** duas opções no modal, cada uma com a sua
lista.

- **Pelo painel** — vai só para quem tem login, com os e-mails na tela, e o
  modal avisa quem está no cadastro e **ficaria de fora**. A lista vem do
  banco e não é editável: aceitá-la do corpo da requisição deixaria este modo
  mandar link para qualquer endereço digitado, que é o defeito que ele fecha.
- **Com carta e anexo** — os endereços cadastrados, editáveis, com a
  **mensagem e a assinatura de volta** e o PDF junto. Não leva link: quem não
  entra ficaria sem o documento.

Mensagem e assinatura tinham saído em 24/08, quando o corpo virou fixo. Voltam
como **metade de uma escolha**, não como padrão — no modo painel continuam
fora. As rotas `/admin/me/email-template` e `/admin/me/assinatura` e as colunas
nunca tinham sido removidas: só a interface saíra.

Entrou `GET /admin/orcamentos/avulsos/:id/destinatarios` com as duas listas, e
`POST .../enviar-email` passou a aceitar `modo`. **Sem `modo` o comportamento
antigo continua valendo** — cliente com JS em cache não pode começar a receber
erro.

**Três defeitos que só o navegador pegou** (visto em `/dev/_preview-envio.html`):

1. **A lista de e-mails saiu ilegível** — texto escuro sobre fundo escuro. Usei
   `--muted` e `--border`, que são do campo ESCURO, dentro de um modal que é
   placa clara. Regra dos Dois Campos de Estado; a dupla certa é `--tinta-2` /
   `--fio-esc`.
2. **"EDMILSON ROCHA"** — `.f span` é rótulo de campo e vem em caixa alta. O
   remédio já existia no arquivo (`.f span.cep-msg`), e `.avOpt` segue o mesmo
   padrão e a mesma especificidade.
3. **Dois amarelos no modal** — eu marcava o modo ativo com `btnAccent`, que é
   a classe da ação, competindo com o "Enviar". É um por tela, e ele é do
   "Enviar". Selecionado virou tinta marinho cheia. De quebra, `btnAccent`
   dentro de `.f` nem pintava de amarelo: o indicador mentia sobre o estado.

**Preview sem sessão e sem enviar nada:** `scripts/preview-modal-envio.js`
recorta a função do `admin.js` **em tempo de geração** — markup duplicado
começa fiel e mente na primeira edição — e o `fetch` é dublê. Abre em
`/dev/_preview-envio.html`, rota que **só existe fora de produção** e só aceita
nomes começando com `_`. Ela também devolve o acesso aos estudos
`public/_*.html`, que o bloqueio de `.html` no `/static` tinha derrubado junto
mais cedo hoje.

⚠️ **O JS do preview vai em arquivo separado:** o helmet manda
`script-src 'self'`, e script inline é bloqueado sem aviso no console — a
página abre vazia como se nada tivesse acontecido.

Fluxo completo em [modulos/orcamentos-envio.md](modulos/orcamentos-envio.md).

Cache-bust: `admin.css?v=233`, `admin.js?v=315`, `telemetria-v54`,
`register-sw.js?v=44`. O prefixo `/admin` já estava na lista network-first do
`sw.js`, então o endpoint novo entrou coberto.

### 2026-08-25 · O campo de resposta do orçamento perde o exemplo

*"Tire essa frase."* O `placeholder` do comentário sugeria
*"Ex.: pode fazer, mas só depois do dia 10."* — um exemplo que, no lugar onde o
síndico aprova ou recusa um serviço, funciona menos como ajuda e mais como
sugestão de resposta. O campo continua igual; saiu só o texto de dentro.

Cache-bust: `cliente-orcamentos.js?v=10`, `telemetria-v55`,
`register-sw.js?v=45`.

### 2026-08-25 · A resposta do cliente deixa de ser muda, e passa a ter dono

*"Hoje um orçamento aprovado no painel, ou um comentário, vai para onde?"* —
investigado: ia para o banco e para o log. Para mais ninguém. Sem e-mail, sem
alerta, sem contagem. E a tela do cliente **promete**, depois que ele aprova:
*"Entramos em contato para agendar o serviço"* — uma promessa que dependia de
alguém, por conta própria, reparar que um status tinha mudado.

O caminho antigo tinha um acaso a favor: sem painel, o síndico respondia o
**e-mail**, e aquilo caía na caixa de alguém. Ao organizar a resposta, ela
ficou silenciosa junto.

**1. Quem assumiu a decisão** (migration 076). `aprovado_por` sempre guardou o
id da CONTA, e a conta é do condomínio — o sistema sabia que "a conta do
Edifício Solar aprovou", nunca quem. Agora nome e cargo são digitados na hora,
na aprovação **e na recusa**, e a ficha do admin mostra "Aprovado por Edmilson
Rocha · Síndico" com **data e hora** (registro de autorização pede hora; "dia
25" é fraco numa conversa em que a ordem dos fatos importa).

O cargo é **lista fechada** com "Outro" como escape — texto livre viraria
"sindico", "Síndico" e "SÍNDICO", três grafias e nenhum agrupamento. A ordem é
de frequência, não alfabética: quem responde orçamento é quase sempre o síndico.

**2. E-mail para `manutencao@generalbombas.com`** (`ORCAMENTO_RESPOSTA_EMAIL`
sobrescreve). Não vai para quem enviou o orçamento: quem enviou pode estar de
férias, e o caminho que sempre tem alguém do outro lado é a manutenção.

⚠️ **O aviso não pode derrubar a resposta.** O envio fica em `try/catch`
próprio: a decisão do cliente já está gravada quando o e-mail sai. Sem isso,
Resend fora do ar faria o síndico ver "erro ao registrar a resposta" para algo
JÁ registrado, clicar de novo e tomar "este orçamento já foi respondido".

**3. O alerta no painel.** Não virou linha em `alertas`: aquela tabela é
amarrada a `device_id`, existe para telemetria, e um orçamento não tem sensor —
forjar um seria dívida disfarçada de solução. O aviso mora no próprio orçamento
(`resposta_vista_em`) e vira uma faixa âmbar no topo de Orçamentos, com um
"Ver" que leva ao primeiro. **Some ao abrir a ficha** — não há "marcar como
lido": aviso que exige duas ações para sumir vira aviso que ninguém tira.

A migration **077** marca as respostas que já existiam como vistas, senão o
deploy acenderia o aviso para dezenas de casos antigos já tratados por telefone
— e um aviso que nasce gritando sobre trabalho feito ensina a ignorar o aviso.

**O que o teste pegou.** Contra o banco de teste: grava nome e cargo, vira
aviso, e a marcação de visto é **idempotente** (reabrir não reescreve a data da
primeira vez). E o navegador pegou um bug de verdade — o campo "Qual?" do cargo
aparecia **mesmo com `hidden`**, porque `.campo { display: block }` vence o
atributo, que é só um `display:none` do stylesheet do navegador. O
`cliente.css` trata `[hidden]` caso a caso em vez de ter regra global, então
todo componente com `display` próprio precisa declarar a sua.

Cache-bust: `admin.css?v=234`, `admin.js?v=316`, `cliente.css?v=46`,
`cliente-orcamentos.js?v=11`, `telemetria-v56`, `register-sw.js?v=46`.

### 2026-08-25 · O modal de envio para de mostrar quem não vai receber

*"Deveria tirar o 'vai para', porque hoje mostra o condomínio que está no
cadastro do cliente, mas dependendo da forma que você escolher enviar não vai
exatamente para aqueles."*

O modo "Pelo painel" avisava, embaixo da lista de usuários: *"o condomínio tem
sindico@…, portaria@… no cadastro"*. O problema é maior que o ruído visual —
mostrar endereços **dentro do modo em que eles não recebem** faz a pessoa ler
uma lista em destaque e entender que o envio vai para ela. Era um aviso que
funcionava como promessa.

Ficou a **regra**, sem endereços: "quem não tem login não recebe por este
caminho — use 'Com carta e anexo' para alcançar todos". Quem precisa alcançar
todos troca de modo, e lá os endereços aparecem no campo "Para", que é onde de
fato valem e onde dá para editar. `emailsCadastrados` agora só é usado ali.

**A lista de cargos caiu para quatro** — Síndico, Gerente predial, Zelador,
Administradora — mais o "Outro". Saíram Subsíndico e Conselheiro, por decisão
do Pedro: lista de escolha não é lista de possibilidades, e cada item a mais é
uma leitura a mais no celular de quem só quer aprovar um orçamento. Quem já
respondeu com um cargo que saiu **continua com ele gravado**: a lista governa o
que se pode escolher daqui em diante, não reescreve histórico.

⚠️ De novo a armadilha da crase: comentário com crase dentro de template
literal **fecha o template**. Terceira vez na mesma sessão — está anotado nos
arquivos onde mordeu.

Cache-bust: `admin.js?v=317`, `cliente-orcamentos.js?v=12`, `telemetria-v57`,
`register-sw.js?v=47`.

### 2026-08-25 · A tela para de piscar, e o corte de 30 min passa a valer fechado

Duas coisas que o Pedro trouxe: *"às vezes o sistema pisca e reseta tudo,
principalmente no primeiro momento que você entra"* e *"ainda existe
desconexão por muito tempo fechado, ou sempre fica logado?"*.

**A piscada era o service worker.** `register-sw.js` recarregava a página em
`controllerchange` — e o `sw.js` faz `clients.claim()` no activate, então numa
aba que ainda não tinha SW ele tomava o controle na hora e disparava o mesmo
evento. **Todo primeiro acesso num navegador recarregava sozinho**, junto com
quem limpa dados do site, usa janela anônima ou troca de navegador. Recarregar
ali nunca fez sentido: não havia versão anterior para substituir, a página já
estava rodando o código mais novo, e o reload só jogava fora o que estava na
tela. Agora o reload exige que houvesse controlador antes.

⚠️ **Isso foi agravado por mim hoje:** sete bumps de `CACHE_NAME` (v49→v57) são
sete reloads forçados para quem estivesse usando o sistema.

**Verificado no Chrome**, os dois caminhos: primeiro acesso → `navigation.type`
= `navigate` (não recarrega) com o SW assumindo o controle; `CACHE_NAME` novo →
`type` = `reload` (o comportamento de deploy segue de pé).

**O corte por inatividade era só de aba aberta.** Um `setTimeout` em memória
morria junto com a aba: quem fechava o navegador e voltava dias depois entrava
direto. Agora o instante da última atividade vai para `localStorage` e é
conferido também no carregamento e ao voltar para a aba — 30 minutos de
inatividade **real**, fechado ou não.

- Escrita com folga de 15s: `mousemove` dispara dezenas de vezes por segundo, e
  gravar a cada evento é escrita síncrona no meio da rolagem — trava a máquina
  fraca, que é justamente a da portaria.
- O `user` sai junto com o `token`. Antes só o token era removido, e o `user`
  órfão fazia a tela seguinte mostrar o nome de quem já não está logado.
- **Passou a valer na tela de orçamentos**, que não tinha o script: o síndico
  era cortado no painel e ficava logado indefinidamente ali, com a mesma
  sessão. Lá o corte **abre o cartão de entrada** em vez de ir para `/login` —
  o hook `window.aoExpirarInatividade` preserva a decisão de que quem chega por
  link de e-mail não perde o documento.

⚠️ **É conveniência, não barreira.** O JWT segue válido no servidor pelos 7
dias de `JWT_EXPIRES_IN`; apagar o token do navegador não o invalida do outro
lado. Serve para o aparelho compartilhado, não contra quem já copiou o token —
encerrar sessão de verdade exigiria revogação no backend, que não existe.

**Os quatro casos testados** em página isolada: 31 min → corta e limpa token e
user; 29 min → mantém; sem carimbo → mantém; sem sessão → nem age.

Cache-bust: `inatividade.js?v=2`, `cliente-orcamentos.js?v=13`,
`register-sw.js?v=49`, `telemetria-v59`.

### 2026-08-25 · Aprovar orçamento no painel nunca funcionou — 42P08

*"Está dando erro ao registrar resposta ao tentar aprovar ou recusar um
orçamento."* O log de produção deu a causa exata:

```
error: inconsistent types deduced for parameter $2
code: 42P08 · detail: 'text versus character varying'
```

`$2` (o status) era usado como **valor de coluna** — `SET status = $2`, onde a
coluna é `varchar` — e dentro de **comparação** — `CASE WHEN $2 = 'aprovado'`,
onde o literal força `text`. Dois tipos para o mesmo parâmetro, e o Postgres
recusa a query inteira no **parse**, antes de olhar qualquer valor. Agora tem
`::varchar` explícito nos quatro usos.

⚠️ **O DEFEITO É ANTERIOR ÀS MUDANÇAS DE HOJE** — confirmado rodando a query
antiga contra o banco: falha idêntica. A rota nasceu quebrada, e o recurso "o
síndico responde na tela dele" nunca funcionou em produção.

⚠️ **E isso corrige uma leitura errada minha, do mesmo dia.** Ao conferir
produção para a migration 077, vi "zero orçamentos respondidos" e concluí que
era porque o painel de resposta era recente. Era porque **ninguém conseguia
responder**. A pista estava na tela e foi lida ao contrário.

O erro ficou invisível por duas razões que valem além deste caso: só aparece
quando alguém responde de verdade, e o front dizia "Erro ao registrar a
resposta" — que soa como falha passageira de rede, não como rota que nunca
funcionou.

**Validado pela rota real** (Express com o router, JWT assinado, sem
`RESEND_API_KEY` para não disparar e-mail): aprovar → 200 com nome, cargo,
`aprovado_em` e o aviso aceso; recusar → 200 com `motivo_rejeicao`; segundo
clique → 409; sem nome → 400.

A lição foi para o [`CLAUDE.md`](../CLAUDE.md): `node --check` não pega e
`UPDATE` direto no banco não pega — query com parâmetro repetido só se testa
exercitando a rota.

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).
