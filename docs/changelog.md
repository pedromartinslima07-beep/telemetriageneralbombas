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
| 079 | chamado_orcamento | `chamados.orcamento_id (SET NULL)` + índice parcial — o chamado que EXECUTA um orçamento aprovado sabe de qual orçamento saiu. Ver [painel-operador.md](modulos/painel-operador.md) |
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

### 2026-08-26 · O link do orçamento voltava a cair em /login

*"Cliquei no link de orçamento pelo e-mail e caí na tela de login com a
mensagem de desconexão por tempo de inatividade."*

A tela de orçamentos declara, desde 25/08, que o corte por inatividade **abre o
cartão de entrada** em vez de ir para `/login` — é a mesma decisão que fez o
login virar cartão ali: quem chega veio de um link sobre UM documento, e trocar
a página por um formulário perde o documento e a URL com `?orc=N`. A declaração
estava lá e mesmo assim era ignorada.

**Era a ordem das tags `<script>`.** Em `cliente-orcamentos.html` o
`inatividade.js` vem **antes** do `cliente-orcamentos.js`, e os dois são
`defer` — executam nessa ordem. O corte de carregamento (o de quem volta com os
30 minutos já estourados) roda na execução do primeiro, quando o
`window.aoExpirarInatividade` do segundo **ainda não foi declarado**. O `return`
do hook nunca acontecia e sobrava o `location.href = "/login?motivo=inatividade"`
— justamente para quem vem do e-mail, que é quem quase nunca tem sessão viva.

**A correção não depende da ordem das tags:** sem hook declarado, o corte é
adiado um tique de timer. A fila de timers só roda depois que **todo** script
`defer` executou, então o hook já existe quando o corte é aplicado. Trocar a
ordem das tags resolveria o sintoma, mas deixaria a armadilha armada para a
próxima página — e faria a página buscar dados com o token prestes a morrer.

- A sessão é apagada **antes** do adiamento: o `cliente-orcamentos.js` boota já
  sem token, abre o cartão e não dispara fetch nenhum.
- Para quem vai mesmo para `/login` (admin e painel do cliente, que não declaram
  hook) o atraso de um tique é invisível.

**Testado** com a ordem real dos `defer` reproduzida em `vm`: sessão estourada
com hook declarado depois → cartão aberto e URL `?orc=42` intacta; página sem
hook → segue indo para `/login?motivo=inatividade`; sessão viva → nada acontece.

Cache-bust: `inatividade.js?v=3` nas três telas que o carregam.

### 2026-08-26 · A resposta do cliente vira pendência com baixa (078)

*"O alerta de orçamento aprovado está fraco, digamos que alguém clica lá para
ver uma vez e fecha, ou a tela recarrega antes da pessoa ver qual o orçamento
é, a informação se perde."*

**"Abriu a ficha" estava valendo como "resolveu".** Era a escolha da v1, e o
raciocínio dela está no código: *"um aviso que exige duas ações para sumir vira
aviso que ninguém tira"*. O que ele não pesou é que os dois erros não custam o
mesmo — tirar o aviso sem querer é irreversível; deixá-lo aceso a mais custa um
segundo olhar. E a faixa era **o único lugar onde a pendência existia**: some
ela, some tudo, e não sobra nem o número do orçamento.

**Migration 078 separa os dois estados:**

| Coluna | O que significa | Como preenche |
|---|---|---|
| `resposta_vista_em` (076) | alguém **abriu** | automático, ao abrir a ficha |
| `resposta_tratada_em` (078) | alguém **deu baixa** | botão na ficha; é o que apaga o aviso |

`resposta_tratada_por` guarda a conta que deu a baixa (FK `ON DELETE SET NULL`,
regra da 073) — aqui a conta basta, é gente do escritório com login individual,
ao contrário de `respondido_por`, que é a conta compartilhada do condomínio.
Backfill segue a lição da 077: o que já estava visto nasce tratado, na data em
que foi visto, e com autor nulo — ninguém deu baixa de fato.

**A pendência passa a morar em três lugares**, e é isso que responde ao risco
original de um botão manual:

- **faixa no topo** — o chamado. Com uma só pendência ela **nomeia o
  documento** ("Condomínio X aprovou o OR-000123 — Fulano, há 2 h · aberto, sem
  baixa"), que é exatamente o que faltava para quem recarregava antes de ler.
- **selo na linha do orçamento** — o endereço. "Resposta nova" enquanto ninguém
  abriu, "Sem baixa" depois. Sai só com a baixa.
- **ponto âmbar no card do condomínio** — o caminho até a linha.

O `resposta-vista` continua existindo e virou informação em vez de gatilho: é o
que deixa a tela dizer "aberto há 2 h, ainda sem baixa". A baixa tem "Reabrir"
ao lado — baixa por engano é outro jeito de perder a informação.

⚠️ **`_avRenderPainel()` não pode ser chamado ao dar baixa**: ele reconstrói a
ficha inteira e leva junto o que estiver digitado e não salvo. Só o bloco da
baixa é redesenhado (`_avAtualizarBaixaUI`).

⚠️ **Quarta vez que a crase dentro de template literal morde** — desta vez num
comentário SQL dentro do `SELECT` da lista, que fechou o template e derrubou o
`node --check`.

**Testado exercitando as rotas** (Express com os dois routers, JWT assinado,
banco de teste): o cliente responde → nasce pendência; a lista do admin carrega
a baixa; abrir a ficha marca visto e **a pendência sobrevive**; a baixa grava e
é idempotente no segundo clique; `desfazer` reabre; o cliente responder de novo
zera baixa e vista; rascunho não vira pendência; id inexistente → 404.

✅ **Aplicada em teste e em produção** (26/08, o Pedro rodou com `--prod`),
junto com a 077 que estava pendente. Conferido no banco de produção: as duas
colunas, o índice `idx_orcamentos_resposta_sem_baixa` e o backfill de pé.
⚠️ A parte visual não foi vista logada.

Cache-bust: `admin.js?v=318`, `admin.css?v=235`.

### 2026-08-26 · Três acertos na ficha do orçamento

Print do Pedro com três coisas na mesma tela.

**1. Fora o "Vai para fulano@…".** A linha nasceu quando o botão mandava o
e-mail direto para `condominios.email`. Hoje ele abre o **modal de envio**, que
é onde os destinatários são escolhidos — e no modo "painel" quem recebe são os
*usuários* do condomínio, não aquele endereço. O trilho prometia um destino que
o envio podia não usar. As duas mensagens de campo vazio ficaram: elas explicam
por que o botão está desabilitado.

**2. O total manual formata enquanto se digita.** O campo era `type="number"` e
mostrava `1234.5` — ponto decimal, nenhum separador de milhar — no mesmo lugar
onde um segundo antes estava escrito "R$ 1.234,50". Agora é `type="text"` com
`inputmode="decimal"` (o teclado do celular continua numérico) e máscara pt-BR:
dígitos, **uma** vírgula, duas casas, ponto de milhar a cada três. Sair do campo
fecha o número — "1.200" vira "1.200,00".

- ⚠️ **Toda leitura do campo passa a usar `_avParseMoeda`.** `Number("1.234,56")`
  é `NaN`, e `NaN` gravado é R$ 0,00 — a mesma perda silenciosa que já levou
  três orçamentos a zero em produção.
- ⚠️ **O cursor não pode pular para o fim.** Reescrever `value` recoloca o
  cursor sozinho; contamos os dígitos à esquerda dele e devolvemos depois do
  mesmo tanto, ignorando os pontos que a máscara inseriu.
- Testado recortando as funções do `admin.js` (nunca copiando): máscara dígito a
  dígito, corte da terceira casa, segunda vírgula, ida e volta de 0,01 a
  12.345.678,90 e o cursor no meio do número.

**3. O ícone de calendário estava invisível** em "Data do orçamento" e "Válido
até". Causa: `:root` declara `color-scheme: dark`, e é isso que faz o Chrome
desenhar o indicador nativo do `input[type="date"]` **claro** — dentro dos
modais, onde o campo é branco, ele ficava branco no branco. A correção diz a
verdade sobre o campo (`color-scheme: light`), escopada no próprio input, e vale
para os três contêineres claros (`.modalBox`, `.av-modal-dialog`,
`.drawer-panel`) — o mesmo defeito estava em todo `date` de modal. De quebra, o
calendário que abre vem claro, igual ao campo de onde saiu.

Cache-bust: `admin.js?v=319`, `admin.css?v=236`.

### 2026-08-26 · A lista diz quem aprovou, e ganha a aba Respondidos

Saiu de um teste do Pedro: *"acha um orçamento que eu acabei de aprovar pelo
painel de cliente, sem trapacear"*. Achei — mas só depois de abrir ficha por
ficha dos aprovados, porque ele tinha dado baixa antes e a faixa já estava
apagada. O teste expôs o buraco: **na lista, um aprovado pelo síndico e um
aprovado no escritório eram idênticos.** A diferença existia só dentro da ficha.

**A linha passa a dizer quem respondeu.** No lugar da data de criação, quando a
resposta veio do cliente: "Aprovado por Pedro · 26/08/2026" (ou "Recusado
por…"). Relógio diferente por estado, de propósito — pendência é sobre *há
quanto tempo espera* ("há 26 min"), resposta tratada é histórico, e histórico se
lê em data.

**Aba "Respondidos"**, ao lado de Rascunho/Enviado/Aprovado. ⚠️ **É a única aba
que não é um `status`**: filtra `respondido_em`, que atravessa aprovado E
recusado — comparar com `o.status` ali devolve lista vazia. É a pergunta que o
escritório faz de verdade ("o que voltou do síndico?"). Dentro dela a lista
deixa de ser cadastro e vira fila: quem ainda espera baixa sobe, no grupo e
dentro dele.

**A faixa passa a agir conforme o formato do trabalho.** Com UMA pendência, o
"Ver" abre a ficha — é um documento, e a faixa já disse qual. Com VÁRIAS, abrir
a primeira é decidir a ordem pela pessoa; agora o "Ver" abre a aba Respondidos e
deixa a escolha com quem trabalha. Fila de um em um serve para duas ou três, não
para dez.

**E o "Enviado" ganhou legenda.** Marcar Situação = Enviado é o que faz o
orçamento aparecer no painel do síndico (`_ORC_VISIVEIS_AO_CLIENTE`) — o seletor
registrava um fato **e** abria uma porta, calado. Agora tem uma linha embaixo
dele: *"Visível no painel do cliente."* Nada mudou no comportamento; o que mudou
é a tela avisar. Separar registro (o e-mail saiu) de publicação (o cliente pode
ver) de vez continua em aberto — o caminho padrão é o botão de e-mail, que já
faz as duas coisas certo.

⚠️ **Quinta vez que a crase dentro de template literal morde** — agora num
comentário HTML dentro do markup do modal.

**Verificado no painel local, logado**, com a pendência reaberta pelo botão
"Reabrir": faixa nomeando o documento, ponto âmbar no condomínio, selo "Sem
baixa" na linha, aba Respondidos com contagem, e a nota do "Enviado" na ficha.

Cache-bust: `admin.js?v=320`, `admin.css?v=237`.

### 2026-08-26 · A tela de Mapa abre no mesmo enquadramento do dashboard

*"Hoje o dashboard já mostra o mapa com um certo zoom, porém na tela de mapa
isso não acontece."*

O dashboard trocou `fitBounds` por **centro na mediana + zoom fixo 11** quando
se descobriu que UM condomínio isolado ao norte (Bragança) estica o retângulo:
o teto de `maxZoom: 13` nunca chegava a valer, e o mapa abria em **zoom 9** —
região metropolitana inteira, os outros 79 pinos empilhados num nó. A tela de
Mapa ficou com a regra antiga, nos dois pontos onde ela enquadra (o primeiro
render e o reparo de quando o mapa nasce com container de tamanho zero).

Agora as duas telas usam `_mcCentroMediano` + `MC_ZOOM_INICIAL`, através de um
`_mpEnquadrar()` que também absorveu a duplicação dos dois pontos. **Mediana e
não centro do retângulo** é o ponto todo: a mediana ignora o outlier, o centro
do retângulo é refém dele.

⚠️ A tela de Mapa tem canvas maior que o card do dashboard, então o mesmo zoom
11 mostra **mais** área — que é o desejado aqui: ali o mapa é a tela inteira,
não um cartão de canto.

**Verificado no painel local, logado**, nas duas telas.

Cache-bust: `admin.js?v=321`.

### 2026-08-26 · O selo de orçamentos no painel do cliente nascia vazio

*"No cabeçalho tem 'Orçamentos' e do lado uma coisa amarela; quando tem um
orçamento fica um número dentro e aí beleza, mas quando não tem nada essa coisa
amarela podia sair."*

A lógica sempre esteve certa: `pintarSeloOrc` só tira o `hidden` quando há
orçamento aguardando, justamente porque contador que mostra zero vira ruído
permanente. Quem mantinha o selo na tela era o **CSS**: `.conta-selo` declara
`display: inline-flex`, e isso **vence o atributo `hidden`** — que é só um
`display: none` vindo do stylesheet do navegador. O resultado era um quadrado
âmbar de 19px, vazio, aceso o tempo todo.

Uma linha: `.conta-selo[hidden] { display: none; }`.

⚠️ **É a segunda vez que esta armadilha morde neste arquivo** — a primeira foi
o campo "Qual?" do cargo, e o comentário que ficou lá diz a regra: o
`cliente.css` trata `[hidden]` caso a caso (`.ficha-fundo`, `.aviso`, `.campo`,
`.orcs-lista`), então **todo componente com `display` próprio precisa declarar
a sua**. `.conta-selo` foi o que faltou. Os outros quatro elementos que o
`cliente.js` liga e desliga por `hidden` foram conferidos: estão cobertos.

Cache-bust: `cliente.css?v=47` nas duas páginas que a carregam (o painel e a
tela de orçamentos — deixar uma em v=46 serviria CSS velho para ela).

### 2026-08-26 · O estado vazio dos orçamentos vira peça, com o mesmo texto

Pedido do Pedro: melhorar **o visual** da página de orçamentos quando não há
nenhum. Era um retângulo com contorno de 1px e, dentro, um título e um parágrafo
soltos — a única forma da tela que não pertencia ao sistema.

Agora é a **mesma peça da primeira tela do painel**: chapa de duas camadas com o
anel em `background` + `::before` (nunca `box-shadow: inset` sob `clip-path`
chanfrado, que é recortado nos cantos), gradiente de marinho, e o cabeçalho
separado do corpo pelo par `--rasgo` + `--luz` — o corte gravado, sempre duas
linhas e nesta ordem.

⚠️ **EU TINHA REESCRITO A COPY, E O PEDIDO ERA DE APARÊNCIA.** A primeira versão
trocou o texto por um percurso de três passos ("no e-mail do prédio", "item a
item", "você aprova ou recusa") mais uma linha de saída com WhatsApp e telefone
— e mudou a linha de apoio da abertura junto. O Pedro cortou: *"esse tanto de
texto, tinha pedido pra você arrumar só o visual"*.

A regra que eu tinha lido e não segui está na própria skill: **refinamento
preserva, redesenho substitui** — e refinamento mantém identidade, comportamento
e **copy**, perguntando antes de trocar texto factual. Vale como lição além
deste caso: pedido de visual não autoriza mexer no que a tela diz.

**Depois disso, o corte de texto foi pedido — e aí sim.** *"Acho que o texto
está redundante, deixe direto e reto."* O mesmo fato aparecia duas vezes na
mesma dobra: a linha de apoio dizia "todo orçamento que fizermos aparece aqui" e
a placa repetia com outras palavras. Sobrou o essencial, uma frase por papel:

| | Antes | Agora |
|---|---|---|
| Linha de apoio | "Todo orçamento que fizermos para o seu prédio aparece aqui." | *(some — quem fala do vazio é a placa)* |
| Cabeçalho | "Nenhum orçamento por aqui" | igual |
| Corpo | "Quando um serviço precisar de orçamento, mandamos por e-mail e ele aparece nesta tela para você aprovar ou recusar." | "Quando houver um, ele aparece nesta tela e no e-mail do prédio." |

⚠️ **Quem esconde tem que lembrar de mostrar.** A linha de apoio agora sai de
cena com `hidden` quando a lista está vazia — e as outras duas mensagens que
escrevem nela (o cartão de entrada e a falha de carregamento) rodam DEPOIS
disso. As duas voltaram a ligar o elemento antes de escrever; sem isso a
mensagem existiria no DOM e ninguém veria.

**Verificado em harness** pela rota `/dev/_*.html` (que só existe fora de
produção), com o CSS real, a 1544px e a 412px.

⚠️ **O harness carregava o JS real da página** e o cartão de entrada abriu por
cima do que eu queria ver — quem monta harness a partir do HTML de uma página
precisa cortar os `<script>` junto com o conteúdo.

Cache-bust: `cliente.css?v=48` nas duas páginas, `cliente-orcamentos.js?v=14`.

### 2026-08-26 · A ficha do orçamento diz quem o montou

*"Queria que ficasse salvo no painel de orçamento que usuário fez ele."*

**Já estava salvo.** `orcamentos.criado_por` existe desde o schema e é gravado
em toda criação — no modal do admin, na bancada da oficina e no orçamento que a
IA abre sozinha. O que faltava era a tela: a coluna não aparecia em lugar
nenhum, e a pergunta "quem fez este orçamento?" só se respondia no banco.

A lista do admin passa a trazer `criado_por` + `uc.nome AS criado_por_nome`, e a
ficha ganha um "Criado por" no trilho, **acima de "Aprovado por"** — a ordem ali
é a dos fatos: alguém monta, o cliente responde, o escritório dá baixa. São três
pessoas diferentes, e a ficha precisa mantê-las separadas.

⚠️ **Traço onde não há nome, e isso é honesto.** Em produção 52 dos 56
orçamentos têm autor; os quatro sem são anteriores ao preenchimento da coluna.
O que a IA cria também pode chegar sem — ali quem "fez" não é um usuário.

**Conferido pela rota real** (Express com o router, JWT assinado, banco de
teste): os 9 orçamentos voltam com `criado_por_nome` preenchido.

⚠️ **A parte visual não foi vista logada nesta rodada** — a sessão do painel
caiu pelo corte de 30 min no meio da verificação, e o login é handoff.

Cache-bust: `admin.js?v=322`.

### 2026-08-26 · O atalho do iPhone abria aba do Safari

*"Adicionei à tela inicial no iPhone mas ele está abrindo uma aba no navegador
normal."*

**Quem manda no modo app é a página aberta na hora de "Adicionar à Tela de
Início"** — o Safari lê os metadados dela, não do site. As quatro telas do
sistema (`/login`, admin, painel do cliente, orçamentos) têm manifest e
`apple-mobile-web-app-capable` desde sempre; **a landing não tinha**. Quem
adicionava a partir do site ganhava o ícone certo e uma aba comum.

Agora a landing declara os dois, mais `apple-mobile-web-app-title`. O
`start_url` continua `/login`, então o atalho criado do site abre no login — a
landing é peça de venda, não a casca do app.

⚠️ **`black`, e não `black-translucent` como nas outras quatro.** O translúcido
estende a página por baixo da barra de status e depende de `viewport-fit=cover`
+ `env(safe-area-inset-*)`, que a landing não tem — o tratamento de 18/08 cobriu
admin, painel, login e o app do técnico, não ela. Com `black` a barra é opaca e
o conteúdo começa abaixo dela.

⚠️ **O service worker continua fora da landing**, de propósito: site público
preso em versão cacheada é pior que segundo carregamento lento.

**As cores do manifest estavam de uma paleta anterior** — `theme_color`
`#F5A623` e `background_color` `#0A1628`. São a barra do sistema e a splash do
app instalado, ou seja, a primeira coisa que aparece ao abrir. Agora as duas são
`#050f38`, o mesmo marinho do `theme-color` das páginas.

⚠️ **E o manifest caía no cache first do service worker.** Ele não é HTML e não
batia com nenhum prefixo da lista network-first, então a primeira versão baixada
valia para sempre: trocar nome, cor de splash ou ícone não chegava a quem já
tinha instalado. Entrou na lista, com o bump obrigatório de `CACHE_NAME`
(v59 → v60) e do `?v=N` do `register-sw.js` (49 → 50) nas quatro páginas.

**Conferido no servidor local:** `/manifest.json` responde 200 com as cores
novas, e a landing serve o `rel="manifest"` e o `apple-mobile-web-app-capable`
sem registrar o SW.

⚠️ **Não verificado em iPhone** — não há aparelho iOS neste ambiente. O teste é
seu: adicionar à tela inicial a partir do site e ver se abre sem a barra do
Safari.

### 2026-08-26 · "Total aprovado" somava tudo, inclusive rascunho

Pergunta do Pedro — *"a conta de orçamentos aprovados está certa?"* — e não
estava.

O cartão da aba de orçamentos avulsos fazia `_avData.reduce(...)` sobre a lista
**inteira**: rascunho, enviado e rejeitado entravam na conta do que foi
aprovado. Não é arredondamento, é outra pergunta sendo respondida.

O tamanho do erro em produção:

| | Valor |
|---|---|
| O que o cartão mostrava | **R$ 113.393,54** |
| Aprovado de verdade (6 orçamentos) | **R$ 5.139,00** |
| Enviados que entravam indevidamente (34) | R$ 76.006,35 |
| Rascunhos que entravam indevidamente (12) | R$ 32.248,19 |

⚠️ **Vinte e duas vezes o valor real**, num número que serve para dizer quanto
de serviço foi fechado. E o defeito era só desta aba: a de "Solicitados pelos
técnicos" filtra por `orcamento_status === "aprovado"` desde sempre.

Os totais por condomínio (`N orçamentos · R$ X`) continuam somando o que estiver
no filtro — ali o rótulo não promete "aprovado", promete o grupo.

**Verificado recortando a expressão do próprio `admin.js`** (nunca copiando) e
rodando sobre o payload real de `GET /admin/orcamentos/avulsos`: 12.947,00 no
banco de teste, contra 13.747,00 da soma de tudo.

⚠️ Sobrou um defeito de layout, não corrigido: o rótulo do cartão aparece
truncado na tela ("TOTAL APROVA…").

Cache-bust: `admin.js?v=323`.

### 2026-08-27 · A restrição do operador deixa de ser só de UI

Desde 2026-06-05 o perfil **operador** era um menu com itens escondidos, e nada
mais: no backend ele passava em `adminOnly` como qualquer admin. Quem digitasse
a URL da API — ou abrisse o DevTools — alcançava orçamentos, O.S., relatórios,
contratos, as conversas do WhatsApp e a ficha da oficina. Estava anotado em três
documentos como *"decisão pendente"* desde 29/07/2026, com o argumento de que
restringir quebraria quem usa hoje.

**Metade do trabalho já estava feita e ninguém tinha percebido.** Duas checagens
antigas não são guards e por isso nunca apareceram nas auditorias por
`grep adminOnly`: `osDonoOuAdmin` (todo o `/ordens-servico/:id/*`) e
`GET /relatorio/pdf` (allowlist `cliente`/`admin`/`gerente`) **já barravam o
operador** dentro do handler. Sobrou trocar o guard de 49 rotas.

| Foi para | O quê | Nº |
|---|---|---|
| `gestaoOnly` | `/admin/orcamentos*` | 20 |
| `gestaoOnly` | `/whatsapp/conversas*` (o `export` já era) | 13 |
| `gestaoOnly` | `GET` de `/contratos` (as de escrita já eram) | 5 |
| `gestaoOnly` | `/relatorios/*` | 4 |
| `gestaoOnly` | `GET`+`POST /ordens-servico` (o resto é `osDonoOuAdmin`) | 2 |
| `gestaoOnly` | `GET /admin/usuarios` | 1 |
| `gestaoOnly` | `/equipamentos/etiquetas.pdf` e `DELETE` de foto | 2 |
| `gestaoOnly` | `/admin/geocode` e `/admin/reverse-geocode` | 2 |
| `masterAdminOnly` | `POST /jobs/verificar-offline` — os outros três jobs já eram | 1 |
| fora de `equipeInterna` | as 10 rotas de `/equipamentos` que o técnico usa | 10 |

**Contratos e Dashboard saíram também**, a pedido. Contrato é peça comercial e
era o último item de Cadastro no menu do perfil. O Dashboard é a visão de quem
responde pelo negócio (MRR, atividade, N condomínios de relance), não a de quem
está de turno — e como `dashboard` nasce `is-active` no HTML, o bloco
`if (_isOperador)` passou a chamar `showSection("alertas")`: a primeira tela
agora é o que está errado agora.

Os dois geocoders foram atrás pelo mesmo raciocínio — servem só ao mini-mapa do
cadastro de condomínio; o mapa principal usa as coordenadas que o cadastro já
gravou.

**O menu do operador ficou: Alertas · Chamados · Telemetria · Mapa ·
Configurações → "Conta".** A gaveta por condomínio **não** some com o Dashboard:
ela também abre do popup do mapa e da ficha do chamado.

Resultado: **24 rotas alcançáveis contra 118 bloqueadas** — e as 24 são
exatamente alertas, chamados, telemetria e mapa.

A medição virou script versionado, **`scripts/auditar-rbac.js <role>`**: ele
percorre o `stack` real dos 17 routers (a mesma estrutura que o Express
consulta no request) e roda cada guard com um `req` de mentira. Não abre
conexão com o banco — guard que responde 403 nunca chega na query. Imprime três
listas, e a terceira é a que importa: as **32 rotas sem guard de role**, cuja
checagem mora no corpo do handler e que nenhuma leitura por prefixo enxerga.

#### O que fecha no backend precisa sumir da tela no mesmo commit

Restringir sem podar a UI não produz segurança, produz tela que só sabe dar 403.
Três pontos do front tocavam rota recém-fechada **de dentro de seções que o
operador continua vendo**:

- **A gaveta do dashboard.** Ela abre da tela mais usada do perfil e tem cinco
  abas — três delas (Atendimento, O.S., Orçamentos) agora batem em 403. Foi a
  pegadinha: esconder item de nav não alcança a gaveta.
- **A faixa financeira do dashboard** (`.mc-fin`: MRR, ativos, vencendo,
  vencidos) vinha de `/contratos/metricas`. Some junto — o MRR da empresa nunca
  foi informação de turno.
- **O boot** pedia `/whatsapp/conversas` e `/admin/usuarios` em toda carga.
  Estavam sob `.catch(() => {})`, então não quebravam nada — só enfeitavam o
  console com dois 403 por refresh. Hoje `carregarConversas` e
  `carregarUsuarios` devolvem lista vazia sem sair à rede.

`getMyRole()`/`_isOperador` **subiram para o topo do `admin.js`** (estavam na
linha 6.659). O boot precisa decidir por eles quais coleções nem chega a pedir,
e as funções de carga são declaradas antes disso. A outra fonte de verdade —
`body.role-{role}`, aplicada pelo `GET /admin/me` — só existe depois de uma
volta na rede, tarde demais para essa decisão.

Cache-bust: `admin.css?v=238`, `admin.js?v=324`. Nenhum endpoint novo, então o
`sw.js` não foi tocado.

⚠️ **Só vale após deploy** — a maior parte da mudança é backend.

⚠️ **Nenhum usuário `operador` existe em produção** (confirmado pelo Pedro em
27/08/2026). Não há a quem tirar acesso — mas também significa que estas quatro
telas **nunca rodaram sob a role real**. O primeiro operador cadastrado é quem
vai exercitar o corte pela primeira vez; vale acompanhar o console dele na
estreia. E fica o registro: a pendência ficou aberta três meses com a
justificativa *"restringir quebraria quem usa hoje"*, sobre zero usuários.

### 2026-08-27 · O operador ganha painel próprio: a fila do turno

Fecha a pergunta que a restrição de RBAC (entrada acima) deixou em aberto: o
painel do operador é **outra tese**, não o admin podado. `/operador/painel` é a
**fila do turno**, ordenada pelo **SLA que estoura primeiro** — um P3 com 20
minutos de prazo vem antes de um P2 recém-aberto. A lista de chamados do admin
ordena por data; essa é a única diferença que justifica a tela existir.

**Backend — um endpoint monta a tela inteira.** `GET /operador/fila`
(`src/routes/operador.routes.js`, guard `adminOnly`) devolve numa resposta só:
os chamados abertos com o SLA **já resolvido**, os reservatórios do condomínio
de cada um e a equipe com posição atual.

⚠️ **O SLA é calculado com o relógio do SERVIDOR.** A ordenação *é* o
`resta_min`; o relógio do navegador do operador pode estar minutos fora e
reordenaria o turno inteiro sem ninguém perceber. O front só decide **como
escrever** o número. Chamado sem `sla_definicoes` para a prioridade vai para o
fim — não dá para prometer prazo que não existe.

`origem` (whatsapp · preventiva · telemetria · manual) é **heurística**:
`chamados` não tem essa coluna, e a procedência é deduzida por efeito colateral
(`conversa_id`, `plano_manutencao_id`, categoria automática). O caso ambíguo é
conhecido — um `nivel_baixo` aberto à mão aparece como "telemetria". `origemDe()`
é a fonte única dessa leitura, para o erro ficar num lugar só.

**Front — `public/operador.html/.js/.css`, folha própria.** Não carrega
`admin.css` nem importa nada de `admin.js`: as duas telas mostram os mesmos
chamados e foi exatamente essa tentação que deixou o painel do cliente refém do
admin até 13/08/2026. `lerJson` e `escapar` estão duplicados de propósito.

- A **evidência mora dentro do item**: colunas d'água quando há telemetria, a
  fala de quem relatou quando não há, com o mesmo peso visual. Prédio sem sensor
  não é item pobre — é item com outra prova. Foi isso que derrubou a v1 do comp
  ("parede de instrumentos"): não havia o que desenhar para metade da carteira.
- Três ações: **despachar** (`PATCH /chamados/:id { tecnico_id }`, que marca
  `primeira_resposta_em` e para o TTFR), **abrir ficha** (`GET /chamados/:id` +
  `/historico`) e **novo chamado** (`POST /chamados`). O mapa do despacho abre
  só na decisão — aberto o turno inteiro seria papel de parede. Sem coordenada
  do prédio e sem ninguém com GPS, vira uma frase: Leaflet centrado no oceano é
  pior que texto.
- A lista de prédios do modal vem de `GET /condominios`, **não da fila** —
  chamado novo costuma ser num prédio que ainda não tem chamado aberto.
- Recarga a cada 30s por `setTimeout` recursivo (nunca `setInterval` — request
  lenta empilharia a próxima). O **pulso** da barra fica vermelho após 3 ciclos
  sem sucesso: numa tela de turno, silêncio e falha não podem se parecer. Erro é
  faixa, nunca `alert()`.
- `PAINEL_POR_ROLE` no `login.js`: `operador` → `/operador/painel`.

**Cache.** `/operador` entrou na lista **network-first** do `sw.js` (servida do
cache, a fila mostraria o turno de meia hora atrás), `CACHE_NAME` v60 → **v61** e
`register-sw.js?v=51` nas **cinco** HTMLs — as outras quatro estavam em `v=50`
com o SW já bumpado, que é o meio-caminho que o CLAUDE.md manda não deixar.

`scripts/auditar-rbac.js` ganhou o novo router no `MOUNTS` (é a única parte dele
que não se descobre sozinha): o operador passa de 24 para **25 rotas**
alcançáveis.

✅ **Rota exercitada de verdade** contra o banco de teste, subindo um Express só
com o router e assinando um JWT de `operador` — HTTP 200, 6 chamados, ordenação
por SLA restante conferida e agregação de telemetria (4 reservatórios) no item.

⚠️ **A tela não foi vista logada e nunca rodou sob a role real** — não existe
usuário `operador` em produção. Fluxo completo em
[`modulos/painel-operador.md`](modulos/painel-operador.md).

### 2026-08-27 · O painel do operador ganha o acabamento das outras superfícies

Passe de qualidade (skill `impeccable`) para o painel entregue na entrada
acima. **Nada de copy mudou e nenhuma funcionalidade saiu** — o que mudou foi
composição, contraste, estados e acabamento de teclado.

**O comp aprovado carregava os defeitos, e a implementação era fiel a ele.**
Medido na tela, não estimado:

- **Item da fila: 318px → 258px.** Cabiam dois por tela num painel cuja tese é
  varrer o turno. A pilha do tanque mandava na altura (tubo 40×132 → **34×110**,
  mesma razão da peça), e o `h3` do título trazia **29px de margem do
  navegador** — que, em item de flex, **não colapsa**.
- **Medida de linha: 110–140 caracteres → 68ch.** O relato atravessava a tela
  inteira; o sistema declara medida em `ch` desde a landing.
- **As ações viraram coluna própria**, no mesmo x em toda a fila. Antes eram o
  fim de uma linha que variava com o comprimento do texto.
- **`--muted2` saiu de todo texto desta folha.** Era a tinta de quase toda
  etiqueta mono — **3,05:1** em caixa alta de 8–9px, o pior caso possível.
  Piso agora: **5,2:1**. Vale para o `admin.css` também, e está registrado como
  regra no `DESIGN.md`.
- **Rótulo do tanque**: 8px e truncado ("Caixa S…") → 9,6px, célula do tamanho
  do nome, e quebra em duas linhas no celular. O brief do painel do cliente já
  registrava que rótulo a 8px é ilegível.
- **O nome do prédio saiu do mono de 9,3px** para Archivo 12,5px: é por ele que
  se acha o item quando o técnico liga perguntando o endereço. O bairro segue
  como etiqueta gravada.

**Estados que estavam errados:**

- **O pulso da barra nascia vermelho.** Como `_ultimoOk` começa nulo e o rótulo
  era binário, todo carregamento abria com *"Sem atualizar — verifique a
  conexão"* aceso até a primeira resposta: alarme falso na tela cuja única
  função é avisar de verdade. São **três** estados agora, com um neutro.
- **`+ Novo chamado` era `display:none` no celular** — a única porta de entrada
  do chamado que chega por telefone, escondida justamente longe da mesa. Hoje
  some o rótulo e fica o ícone, com alvo de 40px.
- **O dia calmo perdia o trilho da equipe.** Fila vazia não é tela vazia.
- **`.fala`** — o bloco de relato citado — existia no CSS e **nunca era
  renderizado**. Volta para origem `manual` e `whatsapp`; frase escrita pelo
  próprio sistema (telemetria, preventiva) não é fala de ninguém e segue em
  texto corrido. Sem autor inventado: a API não devolve quem falou.
- A sobrancelha do dia calmo desceu para **baixo** do título, no papel que de
  fato tem — marcador de estado. O texto é o mesmo.

**Teclado e mapa:** diálogos com `aria-modal`, foco que entra no diálogo e
**volta para o botão de origem** ao fechar, Tab preso dentro. O mapa ganhou
fallback quando o Leaflet não carrega (eram 326px de buraco preto sem uma
palavra), reenvio da tile que falha (a mesma correção que o `admin.js` já tinha)
e o **crédito do OpenStreetMap**, que tinha sido removido junto com o controle.

Limpeza: `.ficha-abas`/`.ficha-aba` (estilo de um controle que nunca existiu no
código), `.fala-quem` sem dado que a alimente, e o `#63d8a0` cravado no
`operador.js` — a linha do mapa lê `--ok` da folha.

**A marca era a palavra "General" composta em Archivo, não o wordmark.** A
landing, o login, o painel do cliente e o admin usam todos o PNG da marca; só
esta tela digitava o nome. Entrou o `logo-topo.png` (o wordmark **sem** a
assinatura — o mesmo que a barra do painel do cliente usa, porque o lockup do
`login-logo.png` fica ilegível em escala de barra), a 30px numa barra de 60 —
a mesma proporção do painel do cliente (40 em 74). ⚠️ **Isto passou batido no
passe de qualidade**: a verificação foi da tela contra ela mesma — composição,
contraste, estados — e não da tela contra as superfícies irmãs, que era o
pedido.

Cache-bust: `operador.css?v=3`, `operador.js?v=3`. O `sw.js` **não** foi tocado:
nenhum endpoint novo, e os assets saem por URL nova.

⚠️ Verificado em harness (CSS e JS reais, dados de mentira) a **1528px e 500px**,
com os três estados — fila cheia, dia calmo e carregando — e os dois diálogos.
**A tela continua sem ter rodado logada e sob a role real.**

### 2026-08-27 · O painel do operador entra no sistema das outras superfícies

Correção do Pedro: *"em todos os cantos que eu pedi para você usar de
inspiração tem a logo em cima e não 'General' escrito"*. A comparação que o
pedido exigia — a tela **contra** o `cliente.html`/`.css` e a landing, elemento
por elemento — não tinha sido feita; o passe anterior mediu a tela contra ela
mesma. Feita agora, achou **13 divergências**, e o logo era só a primeira.

**Marca e cabeça do documento**

- `<b>General</b>` composto em Archivo → **`logo-topo.png`**, o wordmark sem a
  assinatura (o mesmo da barra do painel do cliente, e pelo mesmo motivo
  registrado lá: o lockup do `login-logo` não aguenta escala de barra). 30px
  numa barra de 60 — a proporção do cliente (40 em 74); 26px no celular.
- `apple-mobile-web-app-title` era **"Turno"**; nas outras quatro é "General".
  Na tela de início quem se identifica é a marca, não a tela.
- `<title>` era `Turno · General` → **`GENERAL • Turno`**, o formato do painel
  do cliente. Favicon ganhou o `?v=3` que as irmãs já tinham.

**Tokens do sistema que esta folha não usava**

- **`--fonte` e `--mono`**: a família estava escrita por extenso em vinte e
  poucas regras — e com um fallback diferente do das irmãs (faltava
  `"SFMono-Regular"`). Agora é token, como no `cliente.css`.
- **`--corte` / `--corte-p`**: o `polygon()` do chanfro estava cru em **oito**
  lugares. O `DESIGN.md` manda cortar toda peça com o token, redeclarando
  `--ch` local — é o que passou a fazer.
- **`--saida`**: a curva de saída do sistema não existia aqui; as transições
  usavam `ease-out` genérico.
- **`--barra-h`, `--area-max`, `--trilho-w`, `--gut`**: os números da barra e
  da coluna eram literais soltos. Os nomes agora são os mesmos das irmãs; os
  valores é que são do registro de operação (barra de 60 contra 74, área de
  1040 ao lado de um trilho de 300).

**A barra passou a dividir a tela como o corpo divide**

Ela era `flex` com recuo de 20px enquanto a fila é centrada: a marca caía em
x=20 e o primeiro item em x=117. Acima de **1340px** (`--area-max` +
`--trilho-w`) a barra vira o mesmo grid do corpo — marca alinhada ao item,
ações alinhadas aos cartões da equipe. Abaixo disso o centramento é zero e as
duas já batem pelo próprio `--gut`, então a regra é condicional: um grid
permanente obrigaria as ações a caber em 300px.

**As partes que o navegador desenha** (foco, seleção, rolagem) foram para os
valores das irmãs:

- anel de foco `outline` → **`box-shadow: inset 2px`** amarelo, como no
  `cliente.css` (e `outline` num elemento com `clip-path` é recortado nos dois
  chanfros).
- ⚠️ **Isso revelou dois furos que o sistema tem e ninguém tinha visto:** um
  anel `inset` é engolido por qualquer peça que já tenha um `inset` próprio (o
  botão de fio ficava **sem foco visível**), e um anel amarelo sobre botão
  amarelo é invisível. Corrigido aqui: sobre amarelo o anel é marinho — a
  Regra do Amarelo Cego aplicada ao foco. **O `cliente.css` tem o mesmo furo
  latente.**
- barra de rolagem: polegar branco a 22% com hover amarelo (era escada de
  marinho), e `scrollbar-width`/`-color` que faltavam por completo — no
  Firefox esta tela mostrava a barra padrão do sistema.

**Diálogo**: fundo `rgba(2,6,22,.76)` **sem** `backdrop-filter` (vidro como
decoração é recusado pelo sistema), entrada `sobe .22s` com a mesma curva do
painel do cliente, e `body.com-ficha` travando a fila atrás — sem isso o toque
encadeia e a lista rola por baixo do diálogo.

**`prefers-reduced-motion`** virou a regra global das irmãs, no lugar de dois
seletores: transição nova passa a estar coberta por construção.

Cache-bust: `operador.css?v=4`, `operador.js?v=4`. Detector: 34 achados, todos
`advisory` de `font-size` (a dívida das cinco folhas, registrada no
`DESIGN.md`) — os de cor zeraram.

⚠️ Verificado em harness a **1528px, 1184px e 500px** — as duas faixas da barra
(grid e flex), os dois diálogos e o teclado.

### 2026-08-27 · As peças do sistema que faltavam no painel do operador

Terceira correção do Pedro na mesma tela, e a que expôs a causa: *"tem coisas
q sao padrao das duas telas q eu te falei como a engrenagem ao fundo, um
cabeçalho organizado, modais ou partes q sao brancos, o zebrado, animações em
botoes, e nada disso vc puxou, qual a razao?"*

**A razão, registrada porque vale para o próximo perfil:** o `DESIGN.md` diz
que o registro de operação não tem gestos retóricos (engrenagem, revelação por
corte, inversão de campo ficam do lado do cliente/landing). Eu usei essa linha
como **licença para não trazer** exatamente as peças que o pedido mandava
trazer — deixei o documento decidir contra a instrução. Junto com isso, as duas
passadas anteriores foram atrás do que é **mensurável** (contraste, foco,
alinhamento, rolagem) e evitaram o que é **compositivo**, que não tem métrica.

Entraram, todas portadas do `landing.css`/`cliente.css`:

- **A engrenagem em escala arquitetônica** — duas rodas girando em sentidos
  opostos (96s e 64s), `--mar-500` a .34/.26, sangrando por trás do trilho.
  ⚠️ `position:absolute` sem ancestral posicionado **estica a página**: 97px de
  rolagem horizontal e a tela inteira deslocada, porque o bloco de contenção
  vira o viewport e o `overflow-x: clip` do body não alcança. `body{position:
  relative}` é o que faz a regra do cliente.css valer aqui.
- **O cabeçalho organizado** — o placar saiu da barra (onde era uma fileira de
  11px espremida ao lado da marca) e virou **uma placa dividida por cortes
  gravados**, com o par `--rasgo` + `--luz`. É a resposta que o sistema dá para
  "três coisas paralelas" (a `.vigia` da landing), e não uma fileira de KPI: o
  número é medição em mono tabular e os rótulos são os que já existiam.
  No celular as células empilham e o corte vira horizontal.
- **Os diálogos viraram PLACA CLARA** (`--chapa` com tinta `--tinta`), como a
  ficha do painel do cliente. Entrou a família clara inteira que esta folha não
  tinha (`--chapa`, `--chapa-cl`, `--tinta`, `--tinta-2`, `--fio-esc` e a
  família `-t` de estado). Campos brancos, anel de foco `--tinta`, barra de
  rolagem escura sobre claro. ⚠️ **O mapa continua escuro dentro da placa** —
  instrumento é placa marinho pelo próprio DESIGN.md, e ali ele lê como visor
  embutido.
- **A fita zebrada** — `repeating-linear-gradient(-45deg)` de 6px, o mesmo
  ângulo, passo e altura da landing e do painel do cliente. Marca a única troca
  de registro da tela: acima o que espera alguém, abaixo o que já está andando.
- **Botões em chapa de duas camadas** — fundo = anel, `::before` embutido
  1,5px e re-chanfrado, e **hover que inverte o botão inteiro para amarelo**.
  Era `box-shadow: inset` (recortado nos chanfros) com hover que só trocava a
  cor do texto.

Correções de alinhamento que a comparação lado a lado revelou: a placa do
cabeçalho centrava contra a **página** e não contra a coluna da fila (144px de
desvio), e o trilho não cobria a coluna inteira, deixando a engrenagem passar
por trás dos cartões da equipe.

Cache-bust: `operador.css?v=5`, `operador.js?v=5`. Detector: 36 achados, todos
`advisory` de `font-size`.

⚠️ Verificado abrindo a **landing e o painel do operador lado a lado** no mesmo
navegador, a 1528px e 500px, com os dois diálogos.

### 2026-08-27 · A carta volta a ser carta: dois templates, não um

*"com carta e anexo só quero o texto, e a imagem da assinatura, nada mais"* —
o Pedro conferiu os dois formatos de e-mail e achou a mistura.

**O que estava errado:** desde 25/08 a rota separava `painel` de `carta`, mas
separava só as **entradas** — destinatário, texto, anexo, link.
`sendOrcamentoCliente` tinha **um único HTML**, o estruturado, e o modo nunca
tocava na forma. A carta escrita pelo operador saía embrulhada na moldura do
painel: faixa marinho com a sobrancelha "Orçamento comercial" por cima, caixa
cinza "Informações do orçamento" logo abaixo do texto — repetindo número,
cliente e validade que a carta já dizia e que o PDF anexo traz inteiros —, um
`"Atenciosamente,"` fixo com **"General Bombas"** em negrito, e o rodapé
institucional. A assinatura pessoal do operador entrava *ensanduichada* no
fecho da empresa, e quem escrevia o próprio fecho no textarea recebia dois.

**Onde se perdeu:** até `e891f35` ("e-mail com a cara da casa") o template era
exatamente o simples — texto, convite e assinatura dentro de uma `div`. Esse
commit trocou o template por um só, o estruturado, para todo mundo. `80cd1f5`
trouxe os dois modos de volta, mas **o template nunca foi dividido junto**. Os
comentários no código descreviam a divisão; o HTML não a executava.

**A correção:** `sendOrcamentoCliente` monta `cartaHtml` ou
`estruturadoHtml` conforme `dados.modo`, que a rota agora passa. A carta é uma
`div` com o texto e a imagem da assinatura, e acaba aí — **621 bytes contra os
~31 KB do estruturado**. A versão em texto puro segue a mesma divisão.

- ⚠️ **A carta não tem fecho da casa, e isso é a decisão.** Quem escolheu
  escrever escolheu dizer as coisas do jeito dele; se quer assinar com o nome
  além da imagem, o lugar é o textarea.
- ⚠️ **O texto puro da carta não leva nada além do que foi digitado.** A
  assinatura é imagem e não tem equivalente ali — inventar um fecho seria pôr
  na boca do operador palavra que ele não escreveu.
- ⚠️ **Sem `modo`, cai no estruturado.** Cliente com JS em cache continua
  recebendo o que já recebia.

Verificado exercitando o serviço com o SDK do Resend trocado no cache do
`require`: os três caminhos (carta, painel, legado sem modo) conferidos bloco
a bloco no HTML e no texto puro.

### 2026-08-27 · O operador entre 660 e 1090: a faixa que ninguém tinha aberto

*"deixar a tela do operador com a mesma identidade da landing e da tela de
cliente… todos os atributos visuais"* — terceiro passe na mesma tela, e o
primeiro feito com as três abertas lado a lado no navegador.

**O que a camada de tokens já resolvia.** Paleta, família `-t`, `--fonte`,
`--mono`, `--corte`, `--saida`, foco `inset`, seleção, rolagem, fita listrada,
hachura do sensor mudo, coluna d'água, diálogo em placa clara: tudo conforme
desde o passe de conformidade. O detector confirmou — 36 achados, **todos**
`font-size`, a advertência conhecida que vale para as cinco folhas. E a
varredura de contraste na tela inteira não achou texto abaixo de AA.

**O que sobrou era comportamento e forma, e nenhum detector pega:**

- **A faixa de 660 a ~1090px não existia** — o defeito mais grave. Havia UMA
  quebra (celular) num arranjo de duas colunas com trilho rígido de 300px:
  entre ele e o item de largura fixa (92px de régua + 172px de ações), só o
  texto podia ceder. Medido a 900px: a descrição caía para ~90px de caixa
  (**10ch**, contra os 68ch do passe anterior), o título quebrava em duas
  linhas, o selo descia sozinho, o bairro deixava o bullet órfão e o item ia
  de 258px para mais de 330 — a densidade comprada em 27/08 se perdia inteira
  na primeira janela não maximizada. Entrou uma quebra em **1080px** (o número
  da primeira quebra da landing) onde o trilho desce e vira faixa de duas
  seções lado a lado. Medido depois: item de volta a 258px, texto em **57ch**.
- **A quebra de celular passou de 660 para 760px**, o número da landing e do
  painel do cliente. A jornada não troca de layout em larguras diferentes.
- **A barra não tinha o comportamento de rolagem das irmãs.** Landing e cliente
  chegam translúcidas com `blur(14px)` e fio inferior transparente, e endurecem
  em `is-rolada` acima de 12px — é a única desfocagem do sistema, registrada no
  DESIGN.md. Aqui era marinho opaco com o fio já desenhado desde o primeiro
  pixel. Entrou o CSS e o listener no `operador.js`.
- **Três peças com canto reto** — `.conta`, `.tec-av` e `.ficha-x`. A mesma
  varredura no painel do cliente acha **zero**: ali toda peça é chanfrada. As
  duas primeiras ganharam o corte (a `.conta` em chapa de duas camadas, porque
  `border` sob `clip-path` sai recortado nos chanfros); a `.ficha-x` virou
  ícone solto de 44px, que é a construção do `.fechar` do cliente — resolve a
  forma e o alvo de toque (era 34) de uma vez.
- **Todo ícone tinha ponta arredondada.** Quinze `stroke-linecap="round"` /
  `linejoin="round"` no `operador.js` e no HTML, num sistema cuja regra é traço
  esquadrado (`square`/`miter`) e cuja única curva é a lâmpada de estado. O
  `cliente.html` já vinha esquadrado; a landing declara em CSS.
- **A engrenagem lia como artefato.** Na landing e no cliente ela fica atrás de
  UMA superfície contínua e aparece inteira na margem; aqui, atrás de uma pilha
  de cartões separados, o que se via era um dente em cada fresta, mudando de
  lugar conforme ela gira. Ganhou máscara que a devolve à faixa de campo aberto
  (barra + placar) e a apaga antes do primeiro item — e o topo virou `px`,
  porque em `vw` o corte da máscara subia e descia com a janela. A opacidade
  desceu de .34/.26 para .26/.20: estava **acima** do painel do cliente.
- **A barra tinha número mágico de volta e `env()` sem fallback.**
  `calc(60px + env(safe-area-inset-top))` com o `.trilho` grudando em
  `top:var(--barra-h)`: no celular a barra media 54 e o trilho colava em 60,
  então ele deslizava por baixo dela — e no iOS instalado a diferença era o
  entalhe. Agora o celular **redeclara `--barra-h`** e o `env()` tem o `, 0px`
  que o cliente sempre teve (sem ele, navegador que não conhece `env()` descarta
  a declaração inteira e a barra perde a altura, não o entalhe).
- Miudezas da mesma família: `100dvh` ao lado do `100vh` no trilho, `100svh` na
  ficha, `scroll-padding-top` para a barra sticky,
  `animation-iteration-count: 1` no `prefers-reduced-motion` (só encurtar a
  duração não para o que é `infinite` — a engrenagem seguia girando a mil
  voltas por segundo), ficha em tela cheia no celular como a do cliente, com o
  rodapé colado no pé, e o botão "Novo chamado" do celular de 40 para 44px.

**⚠️ O achado que não foi consertado, e o motivo.** Medindo o chanfro no
navegador: **todo `--ch` local é morto**. Custom property tem o `var()`
substituído no elemento onde é DECLARADA — `--corte` resolve `--ch` no
`:root`, e os filhos herdam o polígono já pronto. `.item` declara 16px,
`.ficha` declara 22, `.selo-mudo` declara 4: todos saem com o número do
`:root`. Vale nas cinco folhas (cliente sai 10px em tudo, landing 22), ou
seja, **a rampa de chanfro que o DESIGN.md descreve não existe em superfície
nenhuma**. Consertar é mudar as cinco de uma vez; fazer só no operador tornaria
ESTA a folha fora do padrão — a mesma razão já registrada para a rampa de tipo.
O que entrou foi só alinhar o número global: `--ch` de 8 para **10px**, que é o
do `cliente.css` e do `admin.css`.

**Um achado meu que estava errado:** o `theme-color` `#030a26` não é
divergência. As irmãs usam `#050f38` porque é o marinho **delas**; aqui a barra
é `--mar-900`, e trocar criaria costura acima dela no app instalado.

Verificado com as três telas montadas no navegador contra dados de teste
(`/operador/painel` e `/cliente/painel` exigem login real), em 1544, 900, 620 e
430px, mais o diálogo nos dois registros.

### 2026-08-27 · A coluna d'água deita, e a etiqueta mono tem um tamanho só

*"muito espaço livre com um monte de coisa escrito pequeninho"* — o Pedro
apontou o item da fila num recorte de tela. Medido, ele tinha razão duas vezes.

**O espaço vazio, em números.** O item era um grid de três colunas cuja altura
saía inteira da pilha do tanque (tubo 110 + número + rótulo = 153px). Nenhuma
das outras regiões tinha altura para acompanhar:

| item | altura | régua de SLA | coluna de ações |
|---|---|---|---|
| #4821 | 258px | **87% vazia** | 73% vazia |
| #4820 | 258px | 82% vazia | 73% vazia |
| #4815 | 258px | 82% vazia | 73% vazia |
| sem telemetria | 156px | 81% vazia | 55% vazia |

A pilha do tanque sozinha custava **100px por item** — a diferença entre os
itens com e sem telemetria.

**A decisão foi do Pedro: a coluna deita em toda largura**, não só no celular.
Em pé ela é a peça vertical da landing e do painel do cliente; aqui ela mandava
na altura de um item que é largo e baixo por natureza. Deitada, a barra usa a
largura — que é o que sobra nesta tela — e devolve altura. É a mesma troca que
a landing faz a 760px e o cliente a 820, pelo mesmo motivo escrito lá.

Depois: **258 → 161px** no item de dois reservatórios, **258 → 126** no de um,
**258 → 119** no mudo. Três itens completos na primeira tela em vez de dois, e
alturas que variam 119–161 em vez de 156–258. Ganho colateral: existe **uma**
renderização do tanque, não duas — as trinta e poucas linhas que invertiam os
eixos da lâmina, da crista, das faixas e do limiar saíram do bloco de celular e
viraram a base.

**O tipo minúsculo.** Havia **cinco** degraus abaixo de 11px convivendo na
mesma tela: 8,8px (régua, origem, selo), 8,96 (a frase "prédio sem telemetria"),
9,28 (bairro), 9,6 (rótulo do tanque), 10,88 (número do chamado) — mais 8,8 e
9,6 no trilho e nos diálogos. Nenhum era escolha; eram chutes na mesma faixa.
O passe de 21/08 tinha corrigido o **contraste** dessas etiquetas (piso de
5,2:1) e não o **tamanho**.

Agora a etiqueta mono tem **um tamanho só, 10,5px**, nas quatorze ocorrências
da folha. Duas saíram da família: o rótulo do tanque virou Archivo de 12px
(*"Caixa Superior 1"* é nome próprio do cadastro, não etiqueta de sistema) e o
número do chamado ficou meio degrau acima, em 11,5px, porque é por ele que se
procura o item quando o técnico liga.

**Duas mudanças de composição no mesmo passe:**

- **A régua de SLA alinha ao topo**, não ao centro. Centrada, o tempo de cada
  item caía numa altura diferente do título a que pertence; no topo ela lê como
  a etiqueta do item, e varrer a coluna da esquerda passa a funcionar. O campo
  de cor continua cheio, que é o que faz o item estourado acender por inteiro.
- **A origem subiu para o fim da linha do prédio.** Ela tinha linha própria no
  pé do item — 23px de altura em todo item para carregar 175px de etiqueta,
  enquanto a linha do prédio usava 200 dos seus 703. Encostada à direita ela
  cai no mesmo x em toda a fila, e a linha responde as duas perguntas de
  contexto de uma vez. `.item-pe` virou CSS morto e saiu.

E a trilha dos tanques virou largura fixa (320px): com `max-content` o texto da
prova começava num x diferente conforme o número de reservatórios — numa fila
que se lê varrendo de cima para baixo, é o começo da linha fugindo do olho.

⚠️ **Uma regressão apareceu e foi corrigida no mesmo passe:** com a etiqueta a
10,5px, `"DISPONÍVEL · NO MAPA"` deixou de caber na coluna de candidatos do
diálogo de despacho e o `ellipsis` cortava em `"DISPONÍVEL · N…"` — justamente
a metade que diz se dá para achar o técnico. Passou a quebrar em duas linhas;
o cartão tem altura.

Verificado na prévia (`/dev/_operador-preview.html`) em 1544, 900 e 430px, com
os dois diálogos abertos: nenhum texto abaixo de 10px fora do crédito do
OpenStreetMap, nenhum contraste abaixo de AA, sem rolagem horizontal, e nada
truncado.

⚠️ O detector passou de 36 para 44 advertências de `font-size` — e isso é
efeito da consolidação, não regressão: os valores que estavam em `rem` viraram
literais em `px`, que é o que o registro de operação usa. A advertência
continua sendo a conhecida das cinco folhas.

### 2026-08-28 · O painel do operador vira um painel só

Passe de acabamento na prévia (`/dev/_operador-preview.html`), com a tela
medida em 430, 761, 900, 1090, 1339, 1340, 1440 e 1920px. Quatro correções,
nenhuma delas de escala — todas de arranjo.

**1. O par fila+trilho passa a centrar junto.** `.comB` era
`1fr var(--trilho-w)`: a fila centrava dentro da primeira coluna e o trilho
ficava colado na borda direita da janela. Num monitor de mesa de 1920 — que é
a cena principal desta tela, não a exceção — sobravam **285px de campo morto
entre as duas colunas**, exatamente a largura da margem esquerda. As duas
metades deixavam de ler como um painel só, e o trilho ("Equipe agora",
"Despachados hoje"), que é justamente o que responde à fila, parecia outra
página. Com a coluna da fila limitada a `--area-max` e o grid centrado, o
bloco de 1340 (1040 + 300) fica no meio e o vão some.

⚠️ **A fila não se move um pixel com isso** — centrar 1040 dentro de (W − 300)
dá o mesmo x que centrar o par de 1340 (`W/2 − 650` nos dois), então o placar,
o cabeçalho e a fita continuam alinhados sem conta nova. Quem anda é só o
trilho. E só funciona porque o fundo do trilho é o **mesmo `--mar-900` do
campo**: ele não é faixa de cor colada na borda, é um fio e um conteúdo.
A barra ganhou o mesmo recuo (em `padding`, para o fundo continuar sangrando),
e de brinde o `.conta` passou a bater exatamente no x do cartão do técnico —
antes eram 6px de diferença.

Como consequência direta, o **fio do trilho subiu de `--fio-fraco` para
`--fio`**: enquanto havia 285px de vazio separando as colunas, ele era
acabamento; agora é a junta, e a .07 sobre `--mar-900` não se enxerga na tela.
Fio que não se vê não é usinagem.

**2. A prova deita entre o celular e a mesa.** A quebra de 1080 (27/08) tinha
resolvido o **colapso** e não a **medida**, e o que sobrou era não-monotônico —
o pior resultado possível. Medido: a descrição do chamado tinha **33
caracteres por linha a 900px, 16 a 1090px e 50 a partir de 1340**. Ou seja,
alargar a janela de 1080 para 1090 piorava a leitura pela metade, e nenhuma
das duas larguras é exótica (1090 é a janela lado a lado num monitor de 1440;
900 é o tablet deitado).

A causa é a mesma que o passe de 27/08 achou: a trilha dos tanques é fixa em
320px e, num item estreito, só o texto tem para onde ceder — a quebra tirou o
trilho do caminho, mas não mexeu no arranjo **dentro** do item. Entre 761 e
1339px a prova agora deita, como o celular já fazia: tanques em cima, relato
embaixo, com o teto de 68ch do `.prova-txt` mandando na linha. A trilha ganhou
`max-width:340px` porque ali o item tem 730–920px e, sem isso, a coluna d'água
esticaria para o dobro do tamanho que tem em qualquer outra largura — a peça
deita, não estica.

1340 não é número novo: é `--area-max` + `--trilho-w`, o mesmo limite que a
barra já usava, e é exatamente onde o item chega aos seus 1000px e as duas
colunas voltam a caber. **760 e 1080 continuam sendo os números da landing** —
esta faixa não move nenhum dos dois, só troca o arranjo interno do item entre
eles. Resultado: nenhuma largura, de 430 a 1920, fica abaixo de 49ch. O item
custa 191px em vez de 161 na faixa do meio; na mesa a densidade comprada em
27/08 está intacta.

**3. A leitura centra na chapa do turno.** As três células do placar ficavam
50%, 53% e 65% vazias (medido, células de 333px) com a leitura encostada à
esquerda — o mesmo *"muito espaço livre com coisa pequenininha"* que foi
apontado no item da fila, sobrevivendo na primeira peça da tela. A chapa não
pode encolher (a largura dela é o que a alinha ao item), então o que mudou foi
a posição: centrada, o vazio vira margem dos dois lados e a peça lê como
mostrador dividido. **No celular ela volta a encostar à esquerda**: numa pilha
de três linhas, centrar põe cada número num x diferente, e pilha se lê por uma
margem comum.

**4. A ficha mostrava a chave do banco.** O campo Categoria imprimia
`nivel_baixo` e `bomba_falha` crus — e no **mesmo arquivo** o `<select>` de
"Novo chamado" já escrevia "Nível baixo" e "Falha de bomba". A mesma tela dizia
o valor de dois jeitos: humano quando o operador digita, cru quando ele lê.
Agora há um `CATEGORIA_ROT` (os rótulos do `_chCatNome` do admin mais as
variantes que a API devolve e que lá não estão mapeadas), e o caso sem
correspondência não sai cru: `_` vira espaço e a primeira letra sobe.

Detector: **44 advertências de `font-size` e 2 de cor**, exatamente as mesmas
de antes do passe — as duas conhecidas das cinco folhas (a rampa de tipo e o
`#000` das máscaras da engrenagem, que é canal alfa e não cor). Nenhuma
advertência nova.

Fluxo em [`modulos/painel-operador.md`](modulos/painel-operador.md).

### 2026-08-28 · O painel do operador ganha o acabamento da landing

O Pedro pediu refino visual, não estrutura: *"tem muita coisa escrita, pouca
hierarquia"*, *"esse lugar que mostra a equipe agora está meio feio"* e *"o
cabeçalho está longe da qualidade da landing"*. **Nenhuma palavra saiu da tela
e nenhum elemento foi removido** — o que mudou foi fabricação e escala.

O diagnóstico, medido na tela e não deduzido: a primeira dobra tem **106
blocos de texto, e 85 deles (80%) entre 10,5 e 12,5px** — quatro degraus que
ninguém distingue. **45 são etiqueta mono em caixa alta.** O maior tipo da
tela inteira tinha 28px. A landing, ao lado, trabalha com **razão de 3:1**
entre etiqueta (10,24px) e leitura (24–31px). Era a mesma gramática, achatada.

**1. As peças passam a ser chapa de duas camadas.** A construção do `.instr`
da landing — fundo do elemento = anel de 1,5px, `::before` embutido = placa
com **gradiente diagonal** de `--mar-700` a `--mar-900` — vale agora para a
placa do turno, para o trilho e para o item da fila. Era a diferença entre
"a mesma cor" e "a mesma peça": o gradiente é o que faz a chapa pegar luz e
virar objeto.

⚠️ **O ângulo NÃO é o mesmo da landing, e a razão é geometria.** O comprimento
da linha do gradiente é `|L·sen α| + |A·cos α|`: no card de ≈470×470 da
landing, 168° é quase todo vertical. Na placa do turno (1000×86) os mesmos
168° dão **208px de percurso horizontal contra 84 de vertical** — vira um
gradiente da esquerda para a direita, e das três leituras a primeira nasce
acesa e a terceira apagada. A placa larga usa **176°**; a chapa alta do
trilho mantém os 168°.

**2. O item da fila estava com `border` + `clip-path` — a construção que o
próprio passe de 27/08 proibiu.** Sob `clip-path` a borda sai recortada nos
dois chanfros, então o item tinha o contorno interrompido nos cantos. Passava
despercebido enquanto as vizinhas eram chapadas; assim que a placa e o trilho
ganharam anel, ele virou a única peça sem aresta da tela. `padding:1px` no
lugar do `border:1px` — a caixa não muda de tamanho.

**3. O trilho deixou de ser parede de cards.** Cada técnico era uma caixa
própria, fio de 1px e 6px de respiro, com fundo `--surface` (#06154b) sobre
`--mar-900` (#030a26) — meio degrau de diferença, ou seja, quatro retângulos
pálidos empilhados. Agora é **uma chapa dividida por cortes gravados**
(`--rasgo` + `--luz`), que é o divisor deste sistema. O selo de iniciais virou
chapa de duas camadas como o `.conta` da barra (os dois são o mesmo objeto e
estavam construídos diferente) e o tipo dele virou mono, porque inicial é
código.

⚠️ **A tinta do trilho estava invertida:** `.tec-est` (o estado, que decide se
dá para despachar) saía em `--muted`, e `.tec-dist` ("no mapa", que não decide
nada) em `--text-dim`, que é **mais claro**. Quem lia a coluna via primeiro a
nota de GPS. Trocado.

**4. O cabeçalho ganhou o degrau.** O número do placar foi de 1,75 para
**2,5rem** contra a frase de 13px — razão de 3,1:1, a da landing. E o canto
direito da barra tinha quatro elementos com o mesmo peso: agora segue o
`.instr-cab` da landing, com a identificação em `--muted` pequena e o
**relógio em 1,05rem mono 700 branco**. É a única leitura ao vivo da barra.

**5. A rampa do item abriu:** título 14,5 → **16px**, nome do prédio 12,5 →
13px. O corpo do item passa a ser 16 / 13 / 12,5 / 10,5. Não é a quantidade
de texto que fazia a fila parecer cheia — é a ausência de degrau entre papéis.

⚠️ **E o maior tipo do item vazava da caixa dele, sem ninguém ter medido:**
"+37min" ocupa 91px numa área útil de 68 (coluna de 92 menos 2×12 de recuo).
Sem `overflow` declarado, ele pintava por cima do recuo dos dois lados — no
item estourado o campo é vermelho inteiro e não se nota. Resolvido em duas
partes: o **eixo variável do Martian Mono** (75–112,5%, que a folha carrega e
nunca usou) a 82% leva o número para 82px sem perder altura, e a coluna foi de
92 para 100px com o recuo de 12 para 8. Área útil final 84px.

⚠️ **Um defeito criado e corrigido no mesmo passe:** o selo do técnico
disponível nasceu com preenchimento `--ok` a 46% e as iniciais em `--ok` por
cima — verde sobre verde, **3,20:1**, reprovado como texto e a 10,5px. É a
Regra do Amarelo Cego valendo para o verde. O estado foi para o **anel**, que
é o que a chapa de duas camadas oferece de graça: aresta verde de 1px, tinta
em `--text-dim` sobre `--mar-600` (6,6:1).

Medido depois: **altura dos itens inalterada** (162/127/120/142/144 contra
161/126/119/142/144), medida de linha em 49ch, contraste com piso de 4,6:1 na
tela toda, três faixas conferidas em 430/900/1090px, sem rolagem horizontal e
sem erro de console. Detector: 46 `font-size` + 2 cor, todas advisory — os
dois degraus a mais são o `2.5rem` do placar e o `16px` do título, e caem na
advertência conhecida das cinco folhas.

🐛 **Pegadinha que custou tempo e virou regra no [`../CLAUDE.md`](../CLAUDE.md):**
crase dentro de template literal — inclusive em comentário HTML — fecha a
string e transforma o resto em *tagged template*. O sintoma é
`X is not a function` em runtime, com `node --check` passando limpo e a tela
parada em "Carregando a fila do turno…".

Fluxo em [`modulos/painel-operador.md`](modulos/painel-operador.md).

### 2026-08-28 · O mapa sai do diálogo e vira protagonista do turno

Pedido do Pedro: *"o mapa precisa ser um protagonista — ou ele fica em outra
tela, que dá pra abrir em tela cheia igual no admin, ou arrumamos protagonismo
pra ele nessa tela mesmo"*. Foi a segunda opção, e **sem tocar no backend**:
`GET /operador/fila` já devolve `condominio.lat/lng` por chamado e `lat/lng`
por técnico.

**O argumento não é tamanho, é ORDEM DA PERGUNTA.** Até aqui o mapa só existia
dentro do diálogo de despacho — ou seja, abria **depois** que o chamado já
tinha sido escolhido, um de cada vez. Mas a decisão geográfica é da **fila
inteira**: mandar alguém no #4821 pode ser errado se o #4820 fica ao lado dele.
Agora ele fica aberto **enquanto** se lê a fila.

⚠️ **Não é uma segunda tela, e isso é deliberado.** O topo do `operador.css`
registra desde 27/08 que "a tela é UMA, não há para onde navegar", e que a
necessidade de uma segunda seção seria conversa de produto. A tela cheia é um
**modo da peça** — o padrão do `.mp-map-card.is-fullscreen` do admin —, não um
destino. Um mapa em tela cheia como página esconderia a fila que está
queimando, e as duas perguntas do turno (o que estoura, quem vai) se fazem
juntas.

**O trilho foi de 300 para 400px** e trocou de papel: o mapa toma o topo e a
lista de equipe desce para baixo dele. A lista era, afinal, a mesma informação
contada sem geografia. ⚠️ **Quem rola agora é a lista, não a coluna** — a
coluna inteira tinha `overflow-y:auto`, e com o mapa no topo dela rolar a
equipe levaria o mapa para fora da tela, ou seja, ele deixaria de ser
protagonista exatamente no minuto em que se precisa dele.

**O pino do chamado carrega duas informações e nenhuma é nova:** a etiqueta é a
prioridade (mesmas cores e mesma construção do `.selo`) e o preenchimento é o
estado do relógio (o mesmo grau que pinta a régua do item). É o par que a fila
já mostra lado a lado, aqui virado posição. Só o que **já estourou** ganha halo,
e ele não pisca: alarme animado numa tela que se olha o turno inteiro vira
ruído em dez minutos. Clicar num pino abre o **mesmo** diálogo de despacho do
botão da fila — o mapa é outra porta para a decisão que já existe.

⚠️ **O nó do mapa é PERSISTENTE, e isso não dá para improvisar.** `render()`
reescreve o `innerHTML` do `#tela` inteiro a cada 30 segundos. Com o mapa
dentro desse HTML, ele seria destruído e recriado a cada ciclo: perderia o pan
e o zoom que o operador acabou de fazer e baixaria os tiles de novo. O elemento
vive fora do ciclo e o `render()` só o **move** para o lugar de um
`#slotMapa` — mover um nó preserva a instância do Leaflet; o que ele precisa
depois é de `invalidateSize()`. Conferido: mesma instância e zoom preservado
depois do render.

⚠️ **`z-index` na peça não bastou para a tela cheia.** `.mapa-turno` mora dentro
do `#tela`, que é `position:relative; z-index:1` — então o `z-index:70` dela é
resolvido dentro de um contexto que vale 1, e a barra (z-index 20, filha do
body) continuava desenhando **por cima** do mapa em tela cheia; o cabeçalho do
mapa ficava escondido atrás dela. Quem sobe é o contexto inteiro, e só enquanto
dura o modo: `body.com-mapa-fs`, que também tranca a rolagem atrás, como o
`body.com-ficha` já faz pelos diálogos.

⚠️ **Enquadrar uma vez só, mas re-enquadrar na troca de tamanho** — são dois
gatilhos e a diferença é quem pediu. O ciclo de 30s é do sistema: refazer o
`fitBounds` ali arrancaria o mapa da mão de quem acabou de dar zoom num bairro.
Entrar em tela cheia é do operador, e aí **manter** o enquadramento é que fica
errado: ele tinha sido calculado numa coluna de 368px, e a mesma escala num
viewport de 1920 mostrava de Cabreúva a Cubatão com os pinos espremidos no meio.

Mais: a camada de tiles (com o reenvio de tile que falha) virou `camadaTiles()`,
compartilhada pelos dois mapas da tela — eram duas cópias a partir do momento
em que existiu um segundo mapa. O Esc sai da tela cheia **antes** de cair no
`fechar()`, senão o operador ficaria preso num mapa de tela inteira quando o
modo veio pelo caminho de classe.

Conferido em 430 / 900 / 1920px: o mapa é faixa de largura cheia abaixo de
1080 (espremido numa célula de 300px ao lado das listas ele voltaria a ser a
miniatura que deixou de ser), 44px de alvo de toque no celular, sem rolagem
horizontal, sem erro de console. Detector: 47 `font-size` + 2 cor, todas
advisory.

Fluxo em [`modulos/painel-operador.md`](modulos/painel-operador.md).

### 2026-08-28 · A sessão recém-criada sobrevive ao carimbo da sessão anterior

Relato: "fiz o login, quando fui clicar em orçamento está pedindo o e-mail
novamente". Três defeitos independentes no mesmo caminho, todos no
[`public/inatividade.js`](../public/inatividade.js).

**1. O carimbo sobrevive à sessão que o criou.** `tg_ultima_atividade` só é
apagado pelo `limparSessao()` do próprio corte. O `logout()` do painel e o
`pedirEntrada()` dos orçamentos removem apenas `token` e `user`; e **nenhum
caminho de login carimba** — nem o `login.js`, nem o `_concluirEntrada` do
cartão de orçamentos. Quem saiu ontem e entra hoje traz o carimbo de ontem, e a
primeira tela que carrega o arquivo mata a sessão recém-nascida antes de pintar
qualquer dado: no painel, salto para `/login`; nos orçamentos, o cartão pedindo
o e-mail de novo.

O conserto não foi espalhar `removeItem` pelos 13 pontos que gravam ou apagam
sessão — a prova de que espalhar apodrece é que o `_concluirEntrada`, escrito
depois, já tinha esquecido. O `iat` do JWT diz **quando esta sessão nasceu**, e
carimbo anterior ao nascimento é carimbo de sessão morta: não conta como
inatividade. Vale para todo caminho de entrada, inclusive os que ainda não
existem.

**2. O corte de carregamento não podia esperar pelo hook.** A correção de
26/08 adiava o corte um tique de `setTimeout(…, 0)` apostando que "a fila de
timers só roda depois que todo `defer` executou". **Não roda:** os `defer`
executam em ordem, mas o navegador ainda precisa *baixar* o próximo, e nessa
espera o laço de eventos está livre. O `inatividade.js` é pequeno e vem do
cache; o `cliente-orcamentos.js` tem 800 linhas — o timer ganhava a corrida em
**100% das cargas medidas no navegador**, e a tela de orçamentos voltava a cair
em `/login`. A correção de 26/08 nunca funcionou.

Esperar o `DOMContentLoaded` (garantia de especificação, não aposta de timing)
consertava os orçamentos e **quebrava o painel**: com o corte adiado, o
`cliente.js` rodava antes, pedia sem token, tomava 401 e mandava para
`/login?motivo=`**`expirado`** — mesmo destino, motivo errado na tela. Trocar
uma corrida por outra não é conserto.

**3. Script inline morre calado na CSP.** A tentativa seguinte foi declarar o
hook num `<script>` inline antes dos dois `defer`. O `helmet` desta casa serve
`script-src 'self'` sem nonce: o script fica no DOM, **não executa**, e nada
quebra — falha silenciosa, a pior forma de falhar.

A solução é atributo, não script: `data-corte="cartao"` no `<body>` do
[`cliente-orcamentos.html`](../public/cliente-orcamentos.html). Está no DOM
antes de qualquer `defer` rodar, custa zero requisição e não depende de CSP. O
`inatividade.js` lê o atributo, deixa a marca `window._tgCorteAoCarregar` e
**não** redireciona; o `cliente-orcamentos.js` lê a marca no bootstrap e abre o
cartão com a mensagem de inatividade. O corte volta a ser **síncrono**, então o
painel recupera o `motivo=inatividade` correto.

Conferido no navegador, com sessão de verdade nos quatro cenários:

| Cenário | Antes | Agora |
|---|---|---|
| Login novo + carimbo de ontem, clicando "Orçamentos" no painel | cartão pedindo o e-mail | lista com os 2 orçamentos, sessão viva |
| Inatividade real, link do e-mail com `?orc=58` | `/login`, URL e documento perdidos | cartão por cima, `?orc=58` na barra |
| Inatividade real no painel | `/login?motivo=inatividade` | igual (com o `motivo` certo de volta) |
| Sem sessão, link do e-mail | cartão sem mensagem | igual |

Backend conferido e ileso: `GET /cliente/orcamentos` e `GET /cliente/status`
respondem 200 com JWT de cliente válido. O defeito era só de front.

Prazos da sessão em
[`modulos/autenticacao.md`](modulos/autenticacao.md).


### 2026-08-28 · Moldura marca o que é único (correção do passe anterior)

O Pedro olhou a tela depois dos três passes do dia e disse: *"ficou
bagunçado"*. Tinha razão, e o erro foi de **dosagem, não de direção**.

**A causa, contada:** a construção do `.instr` da landing — anel de 1,5px +
gradiente diagonal — foi aplicada na placa do turno, no trilho, no item da
fila e no mapa. Na landing ela veste **um** instrumento cercado de campo
aberto; aqui virou o tratamento padrão, e a primeira dobra passou a ter
**nove peças com anel e gradiente**. Quando tudo é peça usinada, o anel deixa
de significar "peça" e vira textura de fundo. Pior: o gradiente do item se
repete **cinco vezes**, e cinco chapas acendendo em cima e apagando embaixo,
empilhadas com 9px de vão, produzem um ritmo de faixas que não significa nada.

**A regra que faltava, e que agora vale para a folha inteira:**
**moldura marca o que é único; o que se repete é superfície.**

| Peça | Antes | Agora |
|---|---|---|
| Placa do turno | anel + gradiente | **mantém** — é peça única |
| Mapa | anel | **mantém** — é peça única |
| Item da fila (×5) | anel + gradiente | cor chapada; mantém a chapa de duas camadas com anel `--fio-fraco` |
| Chapas do trilho (×2) | anel + gradiente | fundo `--surface` liso com os cortes gravados |

⚠️ **O item mantém a chapa de duas camadas mesmo sem o gradiente**, e isso não
é sobra: ela não era enfeite, é o que impede o fio de sair recortado nos dois
chanfros sob `clip-path`. Construção certa, expressão quieta. E o que resolveu
a "parede de cartõezinhos" do trilho continua de pé — não era o anel, era
**agrupar** as linhas numa peça só separadas por corte gravado. Saiu a moldura
externa, ficou o agrupamento. Resultado: de nove peças com anel visível para
**duas**.

**O amarelo passou a apontar.** Com o resto quieto, os quatro "Despachar" em
campo cheio viraram o elemento mais forte da tela — uma coluna amarela
vertical competindo com a régua vermelha do item estourado, que o brief define
como o único campo cheio da tela. Agora vale a **Regra do Selo** que o
`DESIGN.md` já tinha e que o botão era a única peça de ação a não seguir:
*preenchido quando pede ação, de fio em repouso*. Estourado e apertado
preenchem; o resto fica com **anel amarelo e texto amarelo** sobre miolo
marinho. ⚠️ O botão não muda de lugar, de texto, de tamanho nem de ordem, e
não fica igual ao "Abrir ficha" ao lado — em repouso a ação primária continua
reconhecível pela cor, só deixa de ser um campo.

**Dois defeitos de estado achados na varredura:**

- **No dia calmo a placa tinha 96% de vazio.** O grid é fixo em `repeat(3,1fr)`
  e a célula única ("0 chamados abertos") caía no primeiro terço, com dois
  terços de chapa atravessando a tela. Ganhou `data-so="1"`: uma coluna, e a
  chapa fecha no tamanho do que tem a dizer.
- **"Ninguém despachado ainda." saía como texto solto** enquanto a seção irmã
  logo acima era um bloco — duas seções gêmeas com formas diferentes,
  justamente no estado (dia calmo) em que as duas ficam vazias. Estado vazio é
  estado, não ausência de peça: agora ocupa a mesma caixa da lista cheia.

Medido depois: altura dos itens **inalterada** (162/127/120/142/144), contraste
com piso de 5,7:1, três faixas conferidas em 430/900/1920, console limpo,
detector 47 `font-size` + 2 cor, todas advisory.

📋 **Fica em aberto, e é copy:** no dia calmo a tela diz a mesma coisa duas
vezes — a placa escreve "0 chamados abertos" e o título logo abaixo escreve
"Nenhum chamado aberto." em 40px.

### 2026-08-28 · A barra do operador vai a 68px

O Pedro perguntou se o cabeçalho desta tela não era bem menor que o das
outras. Era, e a comparação que justificava isso estava errada:

| | barra | celular | logo na barra |
|---|---|---|---|
| landing · painel do cliente | 74px | 64px | 40px (32) |
| admin | 60px | — | **nenhum** (marca fica na sidebar) |
| operador (antes) | 60px | 54px | 30px (26) |
| **operador (agora)** | **68px** | **60px** | **36px (30)** |

⚠️ **A topbar do admin tem 60px porque carrega SÓ CONTROLES** — a marca dele
mora na sidebar. O operador não tem sidebar, então a mesma altura estava
levando logo + "Turno" + "Novo chamado" + pulso + relógio + avatar. A barra
daqui faz o trabalho da topbar do admin **mais** o da marca; copiar o número
dela era copiar a medida sem o conteúdo.

E a outra metade da justificativa tinha caído no mesmo dia: o comentário dizia
*"60 contra 74 porque esta tela é densa e tem trilho de **300px** ao lado"*, e
o trilho passou a ter 400 no passe do mapa. A densidade continua valendo — por
isso 68, e não os 74 das irmãs.

**O logo não estava só menor, estava proporcionalmente menor:** 30 em 60 dá
0,50, enquanto landing e cliente fazem 40 em 74, que é 0,54. Agora são 36 em
68 (0,53), a razão das irmãs.

⚠️ **Efeito colateral que a mudança expôs: a máscara da engrenagem ficou para
trás.** Ela prende a peça à faixa de campo aberto (barra + placar + cabeçalho
da fila) e a apaga antes do primeiro item, com valores em `px` medidos a
partir do `top` da peça. Mas a faixa cresceu **duas vezes** em 28/08 — o
placar foi de 67 para 89px quando a leitura subiu para 2,5rem, e agora a barra
de 60 para 68 — e a máscara continuava nos 210/265 do dia anterior, apagando a
engrenagem em y=177, no meio do vão, **antes do fim do cabeçalho da fila**.
Refeita nas duas faixas: desktop 268/308 (opaca até y=180, transparente em
y=220, três pixels antes do primeiro item) e celular 310/355.
**A conta é `y desejado + |top| da peça`. Mexeu na barra ou no placar? Refaça.**

### 2026-08-28 · O operador escrito para quem vai usar

O Pedro: *"essa tela vai ser usada por pessoas que não têm tanta familiaridade
com tecnologia e computador"*. A tela estava calibrada para o oposto — ela
herdou o **registro de operação do admin** (corpo 13px, densidade de tabela de
40 linhas), que é feito para quem usa o sistema o dia inteiro e conhece cada
abreviação.

**Medido antes:** 64% do texto (76 de 118 blocos) abaixo de 12px; 47 blocos a
10,5px, dos quais **39 em mono CAIXA ALTA**; e **nenhum dos 11 botões** chegava
aos 44px de alvo — "Despachar" tinha 35, "Novo chamado" 31.

| | Antes | Depois |
|---|---|---|
| Texto abaixo de 12px | 64% | **10%** |
| Corpo | 13px | **15px** |
| Etiqueta mono | 10,5px | **12px** |
| Botões abaixo de 44px | 11 de 11 | **0** |
| Blocos em CAIXA ALTA | 39 | 21 |

Custou densidade (≈3 → ≈2 itens na primeira tela), e foi decisão explícita do
Pedro: **rolar é mais fácil que espremer os olhos.**

⚠️ **A caixa alta pesa tanto quanto o tamanho** e quase não é lembrada: frase
inteira em CAIXA ALTA é o tratamento mais lento de ler que existe — o olho
perde o contorno da palavra e soletra letra a letra. Saiu da régua do relógio,
do estado do técnico, de "Prédio sem telemetria instalada", da linha de origem
e do cabeçalho da fila. Ficou onde classifica em uma ou duas palavras (bairro,
prioridade, título de seção).

**E o vocabulário virou assunto de sistema, não de tela.** O Pedro ampliou o
pedido: *"na verdade eu queria fazer isso para o sistema inteiro, até eu me
perco nas siglas muitas vezes"*. Nasceu daí o
[`vocabulario.md`](vocabulario.md), com uma regra que a varredura revelou:
**nem toda sigla é igual.**

- **Vocabulário do ramo fica** — a equipe fala "passa a O.S. pro Marcos",
  "isso é P1". Decisão do Pedro. `P1` ganha a palavra ao lado (`P1 Crítico`),
  com os nomes do `_chPrioNome` do admin, porque as duas telas mostram os
  mesmos chamados e não podem chamar a mesma coisa de dois jeitos.
- **Sigla de software sai** — `TTFR`, `TTR`, `KPI` não existem fora deste
  sistema. Prova: o admin já precisou escrever uma legenda *"TTFR = tempo até
  primeira resposta · TTR = tempo até resolução"* embaixo da tabela. **Rótulo
  que precisa de legenda é rótulo errado.**
- **`SLA` vira palavra:** "com SLA estourado" → "fora do prazo"; "SEM SLA" →
  "sem prazo definido"; "ATÉ ESTOURAR" → "para vencer"; "+37min" → "37min
  atrasado"; "DISPONÍVEL" → "Livre agora"; "sem GPS" → "sem posição".

⚠️ **Uma troca proposta foi RECUSADA na revisão, e o motivo vale a regra:**
`EM ATENDIMENTO → "Técnico a caminho"` estava errada. `em_atendimento` é o
status do **chamado**; se o técnico já chegou, "a caminho" vira mentira — o
item já distingue "atribuído" · "a caminho" · "no local" num campo próprio. O
que atrapalhava ali era a caixa alta, não as palavras. **Texto mais claro que
diz coisa errada é pior que sigla.**

A varredura também mostrou que o problema era mais concentrado do que
parecia: **painel do cliente, orçamentos, landing e login já estavam limpos** —
nasceram escritos para o síndico. Falta o **admin** (maior volume) e uma
revisão do **app do técnico**.

⚠️ **O detector CAIU de 47 para 40** advertências de `font-size`: consolidar a
rampa eliminou degraus em vez de criar. Aumentar tipo não custou entropia.

Console limpo, sem rolagem horizontal, faixas conferidas em 430/900/1920.

Glossário: [`vocabulario.md`](vocabulario.md) · Fluxo:
[`modulos/painel-operador.md`](modulos/painel-operador.md).

### 2026-08-28 · O que a mudança de escala quebrou (e ninguém veria)

Passe de verificação depois de subir a rampa ~15%. **As quebras de layout e a
hierarquia tinham sido calibradas com o corpo de 13px**, e nenhum dos três
defeitos abaixo dá erro, aparece no console ou reprova no detector — todos
passariam.

**1. A quebra do trilho estava 100px baixa demais.** Medido: a 1090px o item
caía para **640×332**, contra **1000×198** logo abaixo, em 1080. Alargar a
janela piorava — o mesmo defeito não-monotônico que a faixa da prova já tinha
corrigido, reaparecendo por outra causa. E a causa era conhecida: o **trilho
foi de 300 para 400px** quando o mapa entrou nele, mas o `1080` (o número da
landing) ficou parado. A conta é `740 (item mínimo) + 400 (trilho) + 40
(gutters) = 1180`. ⚠️ **Mexeu no `--trilho-w`? Refaça esta conta.**
Medido depois: de 430 a 1920, nenhuma largura fica abaixo de **43ch**, e a
progressão voltou a ser monotônica.

**2. As leituras em `rem` ficaram para trás e a hierarquia se desfez.** O
passe de legibilidade escalou os valores em `px` (13→15) e **não os em `rem`**
— então o número do relógio, que é a tese desta tela (*"a fila do turno,
medida pelo relógio"*), caiu de **1,42× para 1,26×** o título. Ele não
encolheu: o resto cresceu e o alcançou, que dá no mesmo. Dez leituras
reescaladas (régua, leitura do tanque, relógio da barra, título da ficha);
razão de volta a **1,47**. ⚠️ **O que se preserva numa troca de escala é a
RAZÃO, não o número** — e misturar `px` com `rem` na mesma rampa é como isso
passa despercebido.

**3. O formulário de "Novo chamado" não recebeu o passe.** **7 dos 11
controles** continuavam abaixo de 44px enquanto a fila já estava corrigida — e
é ali que o operador **digita**, que é a interação mais difícil para quem tem
pouca familiaridade com computador. Campos e botões de prioridade a 44px,
corpo do campo a 15px, e "O QUE FOI RELATADO" saiu da caixa alta (quatro
palavras é frase). Agora **zero** controles abaixo do piso, no diálogo e na
tela.

⚠️ **O detector CAIU de 47 para 35** advertências de `font-size` ao longo dos
dois passes: consolidar a rampa eliminou doze degraus. Aumentar o tipo não
custou entropia — reduziu.

### 2026-08-28 · O item da fila fica SIMPLES (não só maior)

⚠️ **Correção de rumo, e o erro foi de leitura do pedido.** O Pedro tinha dito
que a tela seria usada por pessoas mais velhas, com pouca familiaridade com
computador, e pediu para *"dar uma simplificada para ajudar"*. O passe anterior
respondeu com **escala** — corpo 13→15px, alvos 44px, caixa alta fora. Ele
olhou e disse: *"não mudou praticamente nada"*. Estava certo: **deixar maior e
deixar mais simples são coisas diferentes**, e o item continuava com as mesmas
quinze informações e os mesmos dois botões, só que em corpo 15px.

**O que mudou de verdade:**

| | Antes | Agora |
|---|---|---|
| Colunas do item | 3 (régua · corpo · ações) | **2** (urgência · resto) |
| Botões por item | 2, do mesmo peso | **1 botão + 1 link** |
| Peças na face | 15 | **10** |

- **A prioridade desceu para a régua**, junto do relógio. As duas respondem à
  mesma pergunta — *quão urgente é* — e estavam em pontas opostas do item: o
  tempo à esquerda, o selo no meio da linha do título, empurrando o título para
  a direita e fazendo **cada item começar num x diferente**.
- **O título abre o item.** Vinha depois do número do chamado e do selo: era a
  terceira coisa da linha sendo a primeira em importância.
- **A coluna de ações saiu.** Ela existia para o botão cair sempre no mesmo x —
  problema real, resolvido — mas cobrava um preço que só apareceu com o público
  novo: o olho varria esquerda → meio → direita em cada item, e a leitura de
  cima para baixo era interrompida duas vezes. Agora a ação **fecha** o item, e
  o botão segue no mesmo x porque a coluna é a mesma.
- **"Abrir ficha" virou o link "Ver detalhes".** Cinco itens com dois botões
  iguais viravam **dez botões**, e cada um pedia uma escolha *antes* da decisão
  de verdade. Um botão e um link dizem qual é a ação e qual é a saída.
  ⚠️ **Nada foi removido** — mudou o peso. O link mantém 44px de alvo e
  sublinhado permanente (link sem sublinhado é texto que ninguém clica).
- **Saíram da face, e continuam na ficha:** o selo de status (nesta seção
  **todo** item está "Aberto" — era ruído puro; na seção de baixo o nome do
  técnico já diz mais), a origem e o bairro. O número do chamado ficou, porque
  é por ele que se acha o item quando o técnico liga — mas no fim da linha do
  prédio, não na frente do título.

### 2026-08-31 · O orçamento aprovado vira chamado, e o item da fila para de desenhar ausência (079)

Duas coisas na mesma sessão, as duas pedidas pelo Pedro olhando a tela.

**1. O item da fila: reservatório mudo não desenha tubo.**

O que ele apontou foi o item do chamado #9 em produção — quatro caixas d'água
sem sensor vivo, e quatro barras hachuradas idênticas empilhadas dizendo "—".
Medido: **item de 222px, com a trilha de tanques 100% vazia**; 76px de hachura
e ~130px de item para não informar nada. Desenho de ausência ocupava o tamanho
do instrumento e não era instrumento.

| | Antes | Agora |
|---|---|---|
| Reservatório com leitura | coluna d'água | coluna d'água (tubo de 156 → ~250px) |
| Reservatório mudo | barra hachurada, 34px de altura cada | **uma linha**, todos os nomes juntos |
| Item com 4 mudos | 222px | **189px** |
| Região da evidência | 82px (trilha de 76 vazios) | **49px** (a linha, 20) |
| Trilha da prova | `320px` fixos | `minmax(320px, 1fr)` |

⚠️ **Nada saiu da tela** — os nomes dos reservatórios continuam todos escritos,
na mesma frase que o painel do cliente já usa ("Sem leitura de X e Y"). O que
mudou foi o tamanho do que não tem o que mostrar.

⚠️ **A trilha virou `1fr` sem perder o motivo do valor fixo.** Ele existia para
o texto da prova começar no mesmo x em toda a fila; como todo item tem a mesma
largura, a fração resolve igual em todos. O que o fixo não preservava era o
instrumento: num item de 1000px sobravam **~490px de campo morto** à direita da
prova, em todo item com telemetria.

Na mesma passada, a **largura virou estrutura**: o número do chamado encosta na
borda direita (a linha do prédio atravessa a placa e vira o cabeçalho dela) e
"Ver detalhes" faz o mesmo embaixo — as duas emolduram a evidência, em vez de
tudo ficar empacotado no terço esquerdo. E o cabeçalho de seção subiu de 12 para
15px em `--text`: ele saía menor que a própria legenda e 6px abaixo do título do
item, e a fila abria sem nada dizendo "aqui começa".

**2. Aprovados: clicar no orçamento abre o chamado que o executa.**

A tela dizia o que foi autorizado e parava aí. O operador lia "o Bosque Verde
aprovou a troca do selo" e ia abrir o chamado na outra tela, digitando de novo
prédio, serviço e constatação — e depois ninguém tinha onde olhar para saber se
aquele orçamento chegou a ser executado.

- **Migration 079** — `chamados.orcamento_id (SET NULL)` + índice parcial.
  Não é UNIQUE: um orçamento pode legitimamente gerar mais de um chamado (o
  serviço volta). Quem impede o clique duplo é o endpoint, não o schema.
- **`POST /operador/orcamentos/:id/chamado`** — o prédio vem do ORÇAMENTO, nunca
  do corpo da requisição: aceitar do front permitiria abrir, a partir do
  orçamento de um prédio, um chamado em outro, e o vínculo passaria a mentir.
  Havendo chamado aberto do mesmo orçamento, devolve o que já existe (200,
  `ja_existia`) em vez de criar outro.
- **`GET /operador/orcamentos`** passa a devolver `chamado_id`/`chamado_status`
  (o mais recente, priorizando o aberto): a linha mostra "Chamado #N aberto" em
  vez de oferecer abrir de novo como se nada tivesse acontecido.
- **A linha inteira é um `<button>`**, com um chip "Abrir chamado" sempre
  visível — affordance que só aparece no hover não existe para quem não sabe
  que devia passar o mouse, e essa é a calibragem desta superfície desde 28/08.
  O chip é de fio em repouso e preenche no hover/foco (Regra do Selo): quinze
  linhas com quinze chips âmbar seriam uma coluna de âmbar que não aponta.
- **P4 é o padrão da prioridade**, não o P2 do "novo chamado": serviço aprovado
  é trabalho agendado, e entrando como P2 ele passaria na frente de bomba parada
  numa fila ordenada pelo prazo que estoura primeiro.
- **Sem o bump de recorrência** de `POST /chamados`. Lá ele detecta problema que
  volta; aqui subiria a prioridade de uma limpeza agendada porque houve outra
  limpeza no mês passado.

⚠️ **A migration 079 rodou no banco de TESTE. Falta rodar em produção**
(`node scripts/migrate.js 079_chamado_orcamento.sql` com o `DATABASE_URL` de
prod). Sem ela, o `INSERT` do endpoint estoura — é a lição da Fase 7E.

Verificado com sessão real contra o banco de teste, a 430 / 1090 / 1920: os
seis caminhos do endpoint (201, 200 `ja_existia`, 409 não-aprovado, 404, 400 de
validação, 401), o diálogo abrindo e fechando por teclado, e a lista trocando
para "Chamado #N aberto" sem recarregar a página. `node --check` limpo nos dois
fronts; os chamados de teste foram removidos do banco.

### 2026-08-31 (2ª rodada) · Aprovados sai do registro de operação, e a régua vira placa

O Pedro pôs lado a lado o print da lista de orçamentos do **painel do cliente**
e a tela de Aprovados, e perguntou se eu achava que estavam no mesmo nível.
Não estavam, e a resposta honesta era: a fila chegou perto, o diálogo já estava
lá, e **Aprovados não estava nem perto — e era a que menos motivo tinha**.

Medido antes: a tela inteira vivia numa faixa de **12 a 17px**, o maior tipo
dela era o nome do prédio, e não havia **uma** superfície clara. Marinho sobre
marinho sobre marinho, num painel de 7 itens que não tem a densidade da fila
para justificar isso. Foi ele quem nomeou o que faltava: *"nas telas que falei
pra você usar de exemplo existem palavras em amarelo, campos totalmente em
branco, coisas que quebram esse negócio monocromático"*.

**A gramática agora é a daquele print, elemento por elemento:**

| Print de referência | Aprovados |
|---|---|
| manchete branca com "aguardam" em âmbar | `7 orçamentos **aprovados** em 6 prédios` — a palavra âmbar é "aprovados" |
| lede em `--sobre-2`, duas linhas curtas | idem |
| cartão claro por orçamento | placa `--chapa` por orçamento |
| `R$ 2.332,00` como a leitura grande | **o serviço aprovado**, Archivo 800 · aqui não há dinheiro |
| selo âmbar "AGUARDANDO VOCÊ" | selo âmbar **"PODE EXECUTAR"** |
| botão âmbar "Aprovar orçamento" | botão âmbar **"Abrir chamado"** |
| `1 item · enviado em 26/08/2026` | `1 item · aprovado em 26/08/2026 por Pedro · Gerente predial` |

⚠️ **A palavra âmbar só existe no campo marinho.** Sobre a placa clara o
amarelo reprova contraste até como forma (~2:1, Regra do Amarelo Cego) — ali
ele é só preenchimento com tinta marinho por cima, que é o selo e o botão. O
print de referência faz exatamente isso, e foi lendo o print que a regra ficou
óbvia.

⚠️ **Isso NÃO quebra A Regra da Superfície** — a regra ganhou a fronteira que
sempre teve e nunca foi escrita. Ver a tabela nova em `DESIGN.md`: o que ela
proíbe é placa clara **disputando a tela** com conteúdo marinho ao lado; aqui a
placa **é** o conteúdo. A fila do turno continua marinho porque é tabela.

**A pilha de metadados virou uma frase.** A coluna da direita (`OR-000058` /
data / quem aprovou / cargo, em mono, empilhados) mandava na altura de toda
linha e não era lida por ninguém em ordem. Virou o rodapé de uma linha do
print. A placa perdeu a segunda coluna inteira.

**A placa deixou de ser `<button>`.** Ela virou botão de manhã; à tarde ganhou
a ação em âmbar dentro dela, e botão dentro de botão é HTML inválido. Não é
perda: um botão âmbar escrito "Abrir chamado" é mais claro para quem tem pouca
familiaridade do que uma área grande que reage ao clique sem dizer onde começa.

**Os três estados, pela Regra do Selo:**

| Estado | Selo | Ação | Placa |
|---|---|---|---|
| livre | **PODE EXECUTAR**, âmbar cheio | botão âmbar "Abrir chamado" | `--chapa` |
| chamado aberto | `CHAMADO #N ABERTO`, de fio em `--normal-t` | **nenhuma** | `--chapa` |
| chamado fechado | `CHAMADO #N FECHADO`, de fio | botão de fio "Abrir de novo" | `--chapa-es` |

⚠️ O recuo do "feito" é de **material** (`--chapa-es`), nunca de `opacity`:
opacidade sobre texto é queda de contraste disfarçada de hierarquia, e
`--tinta-2` cairia abaixo do piso justo na linha que se lê para conferir o que
já foi feito.

**A régua do item da fila: o vermelho pela metade.**

O Pedro: *"qual o sentido de estar pintado de vermelho só até a metade?"*. Ele
estava certo, e o defeito era de **forma**, não de decisão. A decisão continua
certa — o campo cheio não pode esticar com o item, senão o prédio de 4 caixas
d'água ganha 43% mais alarme que o de 1 com o mesmo atraso. O que estava errado
é que a faixa encostava nas três arestas da coluna e terminava num corte reto
no meio: lia como pintura que acabou a tinta. Recuada dos quatro lados e com o
chanfro da casa, a **mesma área** lê como objeto — a etiqueta vermelha do item.

**Dois defeitos achados exercitando o fluxo (nenhum aparece lendo código):**

1. **`fechar()` antes de `await carregar()` engolia o erro.** Fechado o
   diálogo, `#cmMsg` não existe mais e o `catch` escrevia num nó nulo — a
   falha sumia sem rastro. E, com o banco de teste atrás do proxy da Railway,
   a lista levava **mais de 2,5s** para voltar, com a placa ainda dizendo
   "Abrir chamado". Agora a placa vira **na hora** (o endpoint já devolve o id
   do chamado), a faixa avisa, e a recarga vai atrás para reconciliar — com
   `.catch` próprio.
2. **`flex-basis` muda de eixo com `flex-direction`.** No celular o `.orc-pe`
   vira coluna, e o `flex:1 1 260px` da frase passou a valer como **altura**:
   placa de 480px para três linhas de texto, medido a 390px. Só aparece
   abrindo o celular.

E a ação só ocupa a linha inteira **abaixo de 560px**, não em toda a faixa de
celular: a 760 ainda cabem frase e botão lado a lado, e um botão âmbar de 690px
vira o segundo campo cheio da tela, que a Regra do Campo Único recusa.

**E o botão de fio estava com dois defeitos herdados, os dois do mesmo lugar.**
O Pedro pediu para melhorar a aparência do "Aprovados" na barra; medido, o
problema não era do botão, era da regra: só `.btn-novo` declarava
`inline-flex`, então **todo `.btn` que é `<a>`** caía no `display:block` do
navegador — com `text-decoration: underline` de link e o ícone pousado na linha
de base em vez de centrado. Ao lado do "+ Novo chamado", que é `<button>` e
estava certo, a diferença saltava. E o anel do `.btn-fio` estava em `--fio`
(.14 de branco) contra os `--fio-forte` (.34) que o `DESIGN.md` especifica: a
peça lia como texto solto num retângulo escuro, não como controle.

As duas correções são no `.btn`/`.btn-fio` e valem para a superfície inteira —
o "A fila do turno" da barra dos aprovados tinha o mesmo sublinhado. **Quem
decide se a peça é link ou botão é a semântica** (navegação de verdade vira
`<a>`), e a aparência não pode depender disso.

⚠️ **A prévia mentiu por um dia.** O `_operador-preview.html` é cópia gerada do
`operador.html` e ficou parado antes de o link "Aprovados" existir — foi olhando
a prévia que o Pedro perguntou onde estavam os orçamentos. Sincronizada, e com
o aviso no arquivo: prévia que diverge do original não serve para conferir nada.

Verificado a 390 / 560 / 760 / 1000 / 1544, com sessão real contra o banco de
teste, nos três estados. Console limpo, `node --check` limpo, chamados de teste
removidos do banco.

### 2026-08-31 (3ª rodada) · A ajuda, e os prazos que já estavam errados

Pedido do Pedro: *"tem como colocar um botão de ajuda em algum canto explicando
o que é P1, P2 etc, quanto tempo essas coisas têm... quem vai usar são pessoas
que não são tão entendidas"*. E, na sequência: *"dá para isso ser dinâmico, se
os prazos mudarem aí muda também?"*.

**Sim, e era obrigatório que fosse.** Ao ir buscar os números para escrever a
ajuda, os que já estavam na tela **não batiam com o banco**:

| | A dica dizia | `sla_definicoes` diz |
|---|---|---|
| P2 | "24–48h" | `ttr_min` **1440** (24h) |
| P4 | "conforme agenda" | `ttr_min` **14400** (10 dias) |

Prazo escrito à mão vira documentação que envelhece em silêncio, e
`sla_definicoes` é editável pelo admin — qualquer número fixo no front volta a
mentir na próxima mudança. **Ajuda errada é pior que ajuda nenhuma**, ainda
mais para quem a abriu justamente por não saber.

- **`GET /operador/prazos`** (novo) — devolve `sla_definicoes` inteiro mais as
  faixas de nível e a janela do sensor mudo, todas as três lidas das MESMAS
  constantes que classificam a fila. A ajuda não tem versão própria de nada.
- **Buscado só quando o diálogo abre.** A tese "uma request monta a tela
  inteira" é sobre montar a tela; um diálogo que a maioria dos turnos nunca
  abre não entra no caminho crítico da fila.
- **Os números saíram das duas dicas de diálogo** ("Novo chamado" e "Abrir
  chamado do orçamento), que agora apontam para a tabela.

**O diálogo** vive na `.ficha` (placa clara, o registro que este público lê
melhor) e explica: por que a fila está naquela ordem, as prioridades com os
três relógios e o que faz cada um parar, as faixas de 45% e 20%, o que
"Sem leitura" quer dizer — e o que **não** quer ("não é que falta água, é que
não estamos conseguindo medir") —, as ações da tela e o ciclo de 30 s. Em
Aprovados: os três selos, o que o "Abrir chamado" preenche sozinho e por que o
padrão é P4.

**E o texto foi cortado no mesmo dia.** A primeira versão explicava certo e
explicava demais: frases de três orações, travessão no meio, e o "porquê" de
cada regra junto com o "o quê". O Pedro: *"tira o bloco 'o que é esta tela' e o
restante tente explicar da maneira mais simples possível"*.

A regra que ficou: **uma ideia por frase, e nada que não sirva para usar a
tela**. Se a frase explica por que o sistema é assim, ela não é ajuda — é
documentação, e o lugar dela é o `docs/`.

- Saiu **"O que é esta tela"** de Aprovados: quem abre a ajuda já está olhando a
  tela, e descrevê-la de volta gastava a primeira dobra do diálogo com o que a
  pessoa não veio buscar. Com ele fora, a ajuda inteira cabe sem rolagem.
- Saiu a **sublinha do cabeçalho** ("os prazos abaixo são os que estão valendo
  no sistema agora"): garantia sobre a procedência do dado é assunto de quem
  mantém, não de quem opera.
- Os três relógios viraram lista de três linhas, uma frase cada. "Cada barra é
  uma caixa d'água do prédio" no lugar de "cada barra é um reservatório".

| | Regra que passou a valer |
|---|---|
| Rótulo | **"Ajuda" não some no celular**, ao contrário dos outros botões da barra. Ponto de interrogação solto é o primeiro a não ser achado por quem mais precisa dele |
| Corpo | 1rem, medida de 66ch. Encolher o texto da ajuda cobra o preço no pior momento possível |
| Tabela | Prazo é medição — mono e `tabular-nums`; a coluna de prioridade é nome e sai do mono. O **invólucro** rola, não a tabela |

⚠️ **Duas armadilhas conhecidas que a rodada cobrou de novo:**

1. **Crase dentro de template literal.** O comentário que eu inseri na dica
   citava `` `ttr_min` `` com crase, dentro de um template de dezenas de
   linhas — `node --check` acusou na hora, mas é exatamente o caso que o
   CLAUDE.md registra como capaz de passar despercebido.
2. **Rota nova precisa de fixture na prévia.** Sem a entrada de
   `/operador/prazos` no `_operador-preview.js`, o diálogo caía no `fetch`
   nativo, levava o token falso, tomava 401 e o interceptador de sessão
   **derrubava a prévia inteira para o `/login`**. Abrir a ajuda derrubava a
   tela.

**E a prévia estava deslogando do sistema** (achado no mesmo dia, pelo Pedro:
*"sempre que eu clico em Aprovados a tela cai"*). Ela escrevia
`token = "preview"` no `localStorage` e ia embora; como mora no MESMO ORIGIN do
painel, aquele valor ficava valendo para todas as telas, e a próxima request
real tomava 401 e mandava para o `/login?motivo=expirado`. O efeito aparecia no
clique seguinte, longe da causa — eu culpei o `inatividade.js` três vezes.
Agora a prévia **empresta** o storage: guarda as três chaves na entrada e
devolve no `pagehide` (`beforeunload` não dispara em navegação por link no iOS,
e `unload` já não é garantido).

### 2026-08-31 (4ª rodada) · O "RECEBENDO · hh:mm" sai da barra

O Pedro perguntou o que era aquilo. **A pergunta foi o achado**: se o dono do
sistema não sabe, o operador não vai saber. Fui ler o que estava lá:

- a palavra **"RECEBENDO" era FIXA** — não mudava nem quando o ponto ficava
  vermelho. A falha ficava escrita com a palavra do sucesso;
- o texto certo ("Sem atualizar — verifique a conexão") existia só no `title`,
  que é hover: **no celular não aparece nunca**;
- o relógio era a hora do computador, não a da última atualização — mas colado
  em "Recebendo" parecia "recebido às 13:55".

Ou seja: ocupava a barra o turno inteiro para dizer "está tudo bem", que é o
que não precisa ser dito, e emudecia justamente na hora de falar. O Pedro:
*"cara sinceramente eu tiraria"*. Saiu.

⚠️ **Mas não podia sumir sem substituto.** A fila se recarrega sozinha a cada
30s; sem aviso nenhum, uma queda de conexão deixa o operador despachando de uma
lista velha sem ter como saber. O `avisar()` que já existe é faixa de 6
segundos — quem saiu da mesa perde.

No lugar entrou uma **faixa vermelha de largura cheia, logo abaixo da barra,
que só existe quando a tela parou de atualizar**: *"A lista não atualiza desde
as 13:44. Verifique a conexão."* Com a hora da última atualização de verdade —
o dado útil que o relógio antigo justamente não mostrava.

É A Regra do Crítico Silencioso do `DESIGN.md` aplicada aqui: estado de risco
não aparece em repouso, e quando aparece, aparece **com palavra**, não com uma
bolinha de 7px.

Saiu junto a media query de 380px: ela existia para esconder o dígito da hora
quando a barra não cabia, e com o bloco fora sobraram ~95px.

### 2026-08-31 (5ª rodada) · "Já foi feito", e o que é feito sai da lista (080)

Pedido do Pedro: *"nos orçamentos, além de abrir chamado, tem como colocar que
já foi executado?"*. A lacuna era real — um orçamento executado **sem chamado**
(o técnico já estava no prédio e resolveu na hora, ou o orçamento é anterior à
tela existir) ficava dizendo "Pode executar" para sempre.

**Migration 080** — `orcamentos.executado_em` + `executado_por (SET NULL)` +
índice parcial. ⚠️ **Não mexe em `status`**, que continua `aprovado`:
"executado" é fato do atendimento, não estado do documento. Um status novo
obrigaria a revisar todo `WHERE status = 'aprovado'` do sistema (admin, painel
do cliente, PDF) para descobrir quais ainda querem incluir os executados.

**Quatro estados agora**, e "marcado à mão" ganha de todos na hora de decidir:
alguém disse, com nome e hora, que o serviço foi feito — isso vence qualquer
dedução a partir do estado de um chamado. E **"Já foi feito" só aparece no
estado livre**: com chamado aberto quem conclui é o chamado, e oferecer os dois
caminhos criaria duas verdades sobre o mesmo serviço.

**E o que é marcado SAI da lista** — segunda mensagem do Pedro, na mesma
rodada: *"se não vai ficar pra sempre e vai ficar tudo poluído"*. Certo: a tela
responde "o que a gente pode executar aqui", e um executado não responde mais
nada.

⚠️ **Mas não some para sempre.** A marcação é de um clique e sem confirmação;
se o que sai não tem volta, o erro só se conserta no banco. Duas saídas, as
duas nesta tela: a **faixa com "Desfazer"** que aparece na hora (10 s, contra
os 6 s da faixa de erro — ler a frase é rápido, decidir que clicou errado não)
e a linha **"N já feitos · mostrar"** no fim da lista, permanente.

⚠️ **Sem confirmação, com desfazer** — a troca é deliberada. "Tem certeza?" a
cada marcação cobra de todo mundo o preço do erro de alguns; o desfazer cobra
só de quem errou.

⚠️ **A faixa de aviso ganhou uma segunda voz.** Ela era vermelha sempre, porque
só existia para erro; confirmar em vermelho ensinaria o operador a não olhar
para o vermelho — `--risco` é estado crítico e não aparece por outro motivo
(A Regra do Crítico Silencioso). A confirmação virou **superfície**: placa
marinho com anel de 1px, `role="status"` em vez de `alert`.

⚠️ **A manchete passou a contar o que está na tela**, não o total do banco.
Ela diria "7 orçamentos aprovados" com 5 na lista, e número que não bate com o
que se vê embaixo dele é pior que número nenhum. Com zero pendentes ela vira
"Nada **esperando** execução".

⏳ **A migration 080 rodou só no banco de teste. Falta produção** —
`node scripts/migrate.js 080_orcamento_executado.sql`.

### 2026-08-31 (6ª rodada) · O admin passa a VER o desfecho do orçamento

O Pedro: *"quero entender como que essa tela muda o status de orçamentos no
painel de admin"*. Resposta: **não muda, e é de propósito** — mas a
consequência era ruim e ele pediu a correção.

`orcamentos.status` tem quatro valores (`rascunho · enviado · aprovado ·
rejeitado`) e é lido pelo admin, pelo painel do cliente e pelo PDF. Um
`executado` novo obrigaria a auditar **todo `WHERE status = 'aprovado'`** do
sistema para decidir, caso a caso, se ainda quer incluir os executados — e um
deles é o próprio `GET /operador/orcamentos`, que sumiria com a lista inteira.
Além disso "executado" é fato do **atendimento**, não estado do **documento**:
o orçamento continua aprovado depois de o serviço ser feito.

O preço disso era o admin não ter como responder "esse orçamento chegou a ser
executado?" — a informação existia no banco (`executado_em`,
`chamados.orcamento_id`) e só a tela do operador lia. Escolhida a saída de
**leitura pura**, sem schema novo:

- `GET /admin/orcamentos/avulsos` passa a devolver `executado_em`,
  `executado_por_nome`, `chamado_id` e `chamado_status`. O `LEFT JOIN LATERAL`
  do chamado é **o mesmo** do endpoint do operador: se as duas telas mostram o
  mesmo selo, elas têm de escolher a mesma linha.
- **Selo na lista** (`.av-selo-exec`): `FEITO` em verde, ou `CHAMADO #N`.
- **Duas linhas na ficha**, logo depois de "Criado por": *Feito em 31/08/2026 ·
  marcado por Marina Técnica* e *Chamado #24 · na fila do turno*. A ordem da
  ficha é a dos fatos — alguém monta, o cliente responde, o escritório dá
  baixa, o serviço acontece —, e faltava justamente o último.

⚠️ **DE FIO, NUNCA PREENCHIDO** (Regra do Selo). Nesta lista o preenchimento é
de `.av-selo-pend` (resposta sem baixa), que é a única coisa que pede alguém;
um segundo selo cheio ao lado tiraria dele o poder de apontar. E nenhum é
vermelho: nada ali é problema.

⚠️ **SÓ LEITURA, e isso é regra.** Quem escreve `executado_em` é a tela do
operador. Um controle no admin criaria dois lugares para dizer a mesma coisa —
e nenhum dos dois seria a verdade.

⚠️ **Crase em comentário dentro de template literal, de novo.** Terceira vez no
dia; o `node --check` pegou nas três. O comentário que eu escrevi para avisar
sobre o problema continha o problema.

### 2026-08-31 (7ª rodada) · O mapa do turno deixa de nascer vazio

O Pedro: *"o mapa no painel de operador só funciona com chamados abertos?"* —
e depois *"não dá só para copiar o mesmo mapa do admin e colocar aí?"*.

Ele tinha razão sobre o sintoma. O mapa só desenhava dois tipos de ponto:
chamado com prédio geocodificado, e técnico com GPS dos últimos 30 min. Em
produção `tecnico_localizacoes` tem **3 linhas no total**, a última de 17/08 —
então num turno calmo o operador abria a tela e via uma frase no lugar do mapa.

`GET /operador/fila` passou a devolver a **carteira** (condomínios ativos com
coordenada), e ela vira o **fundo** do mapa: quadradinho de 10px, cinza, sem
clique. ~4 KB por ciclo de 30 s com os 86 prédios reais.

⚠️ **Isto não transforma a peça no "Mapa de Condomínios" do admin**, e a
diferença é de PAPEL: lá cada prédio é o assunto e a cor dele é o estado da
telemetria; aqui a carteira é de onde a decisão acontece, e quem tem cor e
clique continua sendo o chamado.

⚠️ **A COR DO ADMIN FICOU DE FORA, e é decisão em aberto do Pedro.** Pintar os
86 prédios pelo estado da telemetria daria à tela **dois vermelhos com
significados diferentes**: prazo estourado (a tese desta tela) e reservatório
crítico. E os dois quase sempre são o mesmo prédio, porque nível crítico abre
chamado automático — onde não coincidem, é um prédio sobre o qual o operador
não pode fazer nada daqui. A distinção entre os três pinos é por **forma**:
quadradinho de 10 (carteira) · placa chanfrada com ícone de prédio (chamado) ·
círculo de 26 com iniciais (técnico).

| | Regra que passou a valer |
|---|---|
| Ordem de desenho | A carteira entra **primeiro**. O Leaflet empilha por inserção, e desenhá-la depois poria pontinhos por cima dos pinos que se clicam — o mesmo defeito que o `zIndexOffset` do chamado corrigiu com os técnicos |
| Clique | A carteira **não tem**. Prédio sem chamado não abre nada nesta tela, e um pino que reage sem fazer nada ensina a não clicar em pino |
| Enquadramento | Da **decisão**, nunca do fundo. Com a carteira dentro, o mapa abriria na Grande São Paulo e o chamado que estoura viraria um ponto de 3px. Sem chamado nem técnico, aí sim cai para a carteira |
| Duplicata | O prédio que já está na fila **sai** da carteira: um ponto pequeno debaixo do pino grande não acrescenta nada e ainda parece sombra |

Verificado com sessão real: 5 pinos de carteira com zero chamados, e — com uma
coordenada temporária num prédio DEMO, revertida depois — 4 pinos de chamado
com o enquadramento no ponto certo (zoom 14), não na carteira.

📋 **Continua em aberto** (era pendência do brief desde 28/08 e agora tem um
tipo de pino a mais): a **legenda** do mapa. É copy, então é decisão do Pedro.

### 2026-08-31 (8ª rodada) · A carteira do mapa ganha estado, e o zoom segue o tamanho

O Pedro mandou o print do mapa em tela cheia com a carteira real: **a Grande
São Paulo coberta de quadradinhos cinzas idênticos**, de Barueri a Mauá.
*"o mapa está assim"*. Estava certo, e o erro foi meu — dimensionei a camada de
fundo contra os **5 prédios do banco de teste** e soltei contra **86 reais**. É
exatamente a lição que o brief da superfície já registrava desde 28/08 ("ao
trazer uma construção, pergunte quantas vezes ela vai aparecer na tela") e que
eu não apliquei nesta.

Dois defeitos, e nenhum era "a camada não devia existir":

**1. Os pontos não diziam nada.** 86 cinzas iguais informam "temos prédios" e
nada mais. Agora cada prédio leva a **pior banda dos reservatórios dele**
(crítico > baixo > mudo; `ok` e sem-telemetria ficam neutros). O mapa fica
quieto onde está tudo em ordem e **acende** onde tem coisa — A Regra do Crítico
Silencioso. Não custou consulta nenhuma: o `porCondo` já estava montado para os
reservatórios da fila.

⚠️ **O aceso também é MAIOR** (11px contra 9). Cor sozinha não separa para quem
tem daltonismo, e esta folha já decidiu duas vezes que forma separa mais rápido
que cor.

⚠️ **`mudo` não é o pior.** Não saber é diferente de saber que está ruim — a
mesma distinção que o painel do cliente faz desde 14/08.

**2. O enquadramento não olhava o tamanho do mapa.** `fitBounds` sobre 86
prédios abre a região metropolitana inteira. Agora a regra escolhe:

| Caixa | Enquadramento |
|---|---|
| Coluna do trilho (400px) | centro na **mediana** da carteira, zoom 12 — escala de bairro |
| Tela cheia / faixa (>800px) | `fitBounds` da carteira com respiro, `maxZoom` 13 |

Mediana e não média: um prédio no litoral puxaria a média para o mar. É a mesma
saída que o admin já usava (`_mcCentroMediano` + `MC_ZOOM_INICIAL`) — o
comentário estava lá o tempo todo e eu não fui ler antes de escrever o meu.

⚠️ **DOIS `requestAnimationFrame` ao entrar em tela cheia**, e o segundo não é
paranoia: a classe acaba de ser trocada, e no primeiro quadro o navegador pode
não ter recalculado o estilo — o `invalidateSize()` mede a caixa ANTIGA e o
Leaflet guarda esse valor em `_size`. Medido: **368px logo depois de entrar em
tela cheia, quando a caixa real já era 1910**. Não incomodava enquanto o
enquadramento era sempre `fitBounds`; com a regra que ESCOLHE pelo tamanho,
medir errado escolhe errado.

⚠️ **Tela cheia nativa só se testa com clique de verdade** — o comentário do
`abrirFundo` já avisava e eu caí de novo: `requestFullscreen()` exige gesto do
usuário, então chamar `mapaFs(true)` do console cai no fallback por classe e a
verificação passa medindo outra coisa. Com o clique real: 1920px, zoom 13.

### 2026-08-31 (9ª rodada) · O pino da carteira vira o pino do admin

O Pedro, depois de duas correções minhas que não resolveram: *"pelo amor de
deus chat, abre o painel de admin e vê o mapa, ícones de condomínios
coloridos, se tiver um técnico ícones redondos, aqui no operador é tudo
quadradinhos transparentes"*.

Ele estava certo desde a primeira vez que pediu, e eu insisti duas vezes num
ponto neutro de 9px. **O argumento que eu usava — cor de carteira competiria
com a cor do relógio do chamado — era hipótese minha. "É tudo quadradinho
transparente" era o fato na tela.** Hipótese não ganha de fato observado.

O `.mc-pin-condo` do admin veio inteiro, menos o que não cabe nesta folha:

| Veio | Não veio |
|---|---|
| ícone de prédio branco sobre campo colorido | `border-radius: 7px` — esta folha é de raio zero, então o campo é a placa chanfrada da casa |
| sombra projetada do pino | o `pulse` do `warn`/`bad` — o halo aqui já é do chamado estourado |
| a escada de estado (ok · baixo · crítico) | — |

⚠️ **VERDE É "NADA ERRADO AQUI", inclusive no prédio sem telemetria** — é o
que o `_mcStatusKind` do admin faz (sem alerta e sem chamado → `ok`). Foi o que
destravou o caso real: em produção **não há um único reservatório cadastrado**,
então pela regra anterior os 87 prédios ficavam todos neutros e o mapa
continuava idêntico ao print. Um mapa todo cinza parece erro de carregamento;
um mapa todo verde parece um mapa.

⚠️ **22px contra os 28 do pino de chamado**, e é essa diferença que separa
fundo de decisão. Mesmo desenho, escalas diferentes — e o de chamado continua
sendo o único que abre alguma coisa no clique.

⚠️ **`maxZoom` do enquadramento de 14 para 13.** Com UM chamado, o 14 colava o
mapa nele e varria a vizinhança da tela — justamente o que a carteira passou a
ter para mostrar, e justamente a pergunta que o mapa responde.

**O que a produção tem hoje**, medido em leitura direta do banco enquanto eu
diagnosticava: 87 condomínios com coordenada, **0** chamados abertos, **0**
técnicos com GPS recente, **0** reservatórios cadastrados. O mapa vai ser 87
prédios verdes até o produto entrar em uso — e agora isso parece um mapa.

### 2026-08-31 (10ª rodada) · "Cliquei em despachar e nada aconteceu"

Relato do Pedro. **Não era erro: o despacho sempre funcionou** (confirmei o
`PATCH /chamados/:id` por fora, 200 e o técnico gravado). Era a soma de duas
esperas silenciosas, as duas medidas nesta tela:

1. **O PATCH levou 3,8 s** contra o banco de teste (Railway, via proxy). Nesse
   tempo o único sinal era o cartão do técnico com `opacity: .5` — que lê como
   "botão desabilitado", não como "botão trabalhando".
2. **Despachado, o chamado TROCA DE SEÇÃO**: sai de "Esperando alguém" e vai
   para "Já tem técnico". Medido no caso real: o item foi parar em **y = 1258
   numa janela de 709px** — duas dobras abaixo, fora da tela.

Juntas: quase quatro segundos de nada, o diálogo fecha, e o item desaparece de
onde a pessoa estava olhando. **"Nada aconteceu" é a leitura correta do que a
tela mostrava.** Três correções, nenhuma no backend:

| | |
|---|---|
| Durante | O cartão do técnico acende em âmbar com listra que anda. Movimento é a única coisa que distingue "esperando" de "morto" |
| Depois | A faixa diz o que aconteteceu **e para onde o item foi** — sem a segunda metade, quem procura no lugar de antes não acha |
| E então | A tela rola até o item (`block:"center"`, `smooth`) e ele pisca. Salto instantâneo não ensina onde a lista o pôs |

⚠️ **A faixa de confirmação não é vermelha.** Ela era, porque só existia para
erro; dizer "despachado com sucesso" em `--risco` ensina o operador a não olhar
para o vermelho. Mesma correção que a tela de Aprovados recebeu hoje mais cedo,
agora também aqui: `data-t="ok"` e `role="status"` em vez de `alert`.

⚠️ **`setTimeout`, NÃO `requestAnimationFrame`, para rolar até o item.** O rAF
**não dispara em aba em segundo plano** — e este trecho roda depois de um
`await` que leva segundos, tempo de sobra para alguém trocar de aba enquanto
espera. É a mesma armadilha que deixou os tiles do mapa do admin invisíveis
(ver `fadeAnimation: false` no `admin.js`), e ela custou uma investigação
inteira aqui: com a aba fora de foco o scroll simplesmente não acontecia, sem
erro nenhum no console e com o seletor correto.

### 2026-08-31 (11ª rodada) · A barra ganha "Sair" e a gramática da landing

Duas coisas do Pedro na mesma rodada: *"precisa de um botão de sair nessa
tela"* e *"tente deixar o cabeçalho parecido com cliente e landing"*.

**Não havia como sair.** A barra tinha só o quadradinho com as INICIAIS — que
diz quem está logado para quem já sabe e não oferece saída nenhuma. Entrou o
par **nome + Sair** do `cliente.html`, inteiro: o nome é TEXTO (um alvo que
não leva a lugar nenhum ensina a duvidar dos outros alvos da barra) e o Sair é
a ação, com a porta e a seta desenhadas no traço desta folha.

⚠️ **"Sair" não é vermelho.** É a única coisa da barra que ninguém veio fazer;
em vermelho puxaria o olho o turno inteiro. Tom secundário, ênfase no hover —
mesma decisão e mesmas palavras do `cliente.css`.

⚠️ **`userRole` vai junto no logout.** O `cliente.js` limpa só token e user
porque nunca grava a role; aqui ela é gravada no login e, deixada para trás, o
próximo a entrar nesta máquina começa com a role de quem saiu.

⚠️ **PRIMEIRO NOME, não o nome inteiro** — e ele vem do `localStorage` antes
de o `/admin/me` responder. Esta barra carrega marca, rótulo do turno, duas
navegações e duas ações; "Marina Aparecida da Silva Técnica" comeria o espaço
dos alvos que a pessoa veio usar. O nome completo fica no `title`.

**E a barra virou a barra da landing.** Antes eram **quatro chips em fila** —
Ajuda, Aprovados, Novo chamado, Sair — todos com o mesmo peso de placa. Uma
parede de botões não diz qual é a ação: **com tudo em destaque, nada está.**

A regra da landing é: **navegação é texto; só ação é botão, e são duas por
barra — uma de fio e uma âmbar.** Aplicada aqui:

| Antes | Agora |
|---|---|
| chip "Aprovados" | link de texto, com o sublinhado âmbar que cresce da esquerda |
| chip "Ajuda" | idem |
| chip "+ Novo chamado" | continua âmbar cheio — é a ação da tela |
| chip "Sair" | continua de fio — é a saída |

⚠️ **O "Ajuda" é `<button>` com aparência de texto**, não `<a href="#">`: ele
abre um diálogo, não navega. Um link que não leva a lugar nenhum mente para o
teclado e para o leitor de tela.

⚠️ **A nav NÃO some no celular**, ao contrário do que a barra faz com os
rótulos dos botões: ela é o único caminho para a outra tela e para a ajuda, e
o celular é justamente a cena de quem está longe da mesa. O que cede é o
respiro entre os dois links. Verificado a 390px: cabe, com alvo de 44px.

**O que continua diferente das irmãs, e é deliberado:** barra de 68px (contra
74) e logo de 36 (contra 40) — a razão 0,53 é a mesma, e a densidade menor tem
dono desde 28/08.

### 2026-08-31 (12ª rodada) · A placa do orçamento inverte a hierarquia

O Pedro: *"a visualização do orçamento em si não está tão boa do jeito que
você está mostrando as informações"*. Olhando a placa com dado real, o defeito
era claro e era meu:

```
OR-000026                          [PODE EXECUTAR]
Peças e serviços                    ← o MAIOR tipo da placa
– Rolamento 6205 ZZ
– Selo mecânico 1.1/4
| Bomba 3 — recalque. Faz barulho alto e desarma o    ← itálico cinza, no pé
  disjuntor depois de 10 minutos.
```

**"Peças e serviços" é rótulo de categoria do banco e não informa nada** — e
era a leitura grande. Enquanto isso, a frase que diz o **equipamento**, o
**defeito** e o **sintoma** — a que o operador repete ao telefone — estava
tratada como nota de rodapé.

A ordem agora é a da pergunta que a tela responde:

| | |
|---|---|
| 1. o que foi diagnosticado | a **constatação**, na leitura grande |
| 2. o que foi autorizado | os itens, sob a etiqueta **ITENS** |
| 3. quando e por quem | o rodapé |

⚠️ **Sem constatação, a leitura grande volta a ser o serviço**: em orçamento
por cláusula o tipo informa ("Limpeza de reservatório") e em orçamento de peças
com uma linha só a peça É o serviço. O genérico "Peças e serviços" só aparece
quando não há frase melhor no banco.

⚠️ **A lista aparece mesmo com uma linha só** quando a constatação ocupou o
título — antes ela sumia abaixo de dois itens porque a peça virava o título.
Com o diagnóstico em cima, esconder a única peça aprovada esconderia
justamente o que foi autorizado.

⚠️ **A etiqueta ITENS existe porque a lista mudou de papel.** Ela deixou de ser
o assunto da placa e virou a resposta de uma segunda pergunta; sem rótulo, duas
linhas soltas embaixo de um diagnóstico parecem continuação da frase. Uma
palavra em caixa alta é o teto desta superfície, e "Itens" é o mesmo rótulo da
ficha do admin.

⚠️ **`.orc-const` saiu, e a regra do "relato citado" continua valendo no item
da fila** (`.fala`), onde o texto É fala de quem ligou. Aqui era diagnóstico
técnico, que não é citação de ninguém — tratá-lo como fala foi o que o empurrou
para o pé da placa.

**E o tipo caiu um degrau** (1,6 → 1,35rem) com a medida indo de 34 para 46ch:
a leitura deixou de ser um nome de peça de duas palavras e virou uma frase, e
na escala antiga ela saía em quatro linhas de manchete.

**"2 items" → "2 itens".** O plural saía em inglês desde que a linha nasceu
(`item` + `s`), em toda placa da tela.

### 2026-08-31 (13ª rodada) · A barra dos Aprovados nunca endurecia, e as três viram uma só

O Pedro: *"o cabeçalho da tela de orçamento é translúcido?"*. Era — **e nunca
deixava de ser.**

A folha define `.barra` translúcida (`--mar-900` a 88% + `blur(14px)`) e
`.barra.is-rolada` sólida com fio inferior. Quem troca a classe é um listener
de `scroll` que existia no `operador.js` e **nunca foi copiado** para o
`operador-orcamentos.js` — o mesmo tipo de divergência que este par de telas
já cobrou duas vezes hoje (a prévia sem o link, a prévia sem a fixture).

O efeito era pior aqui do que seria no painel do turno: esta tela tem **placas
claras** passando por baixo da barra, então o cabeçalho ficava sobre um borrão
claro e o topo da placa aparecia atravessando a marca.

⚠️ **E faltava o ESTADO INICIAL, nas duas telas.** O navegador restaura a
posição de rolagem ao recarregar: quem dá F5 no meio da lista volta com a
página rolada e um `scroll` que nunca aconteceu — a barra nascia translúcida
com conteúdo por baixo até a pessoa rolar de novo. O listener virou uma função
nomeada, chamada também no boot.

### E a barra parou de ser diferente das irmãs

Pedido, na mesma mensagem: *"deixe ela igual aos outros cabeçalhos, não tem por
que ser diferente"*.

| | Antes | Agora |
|---|---|---|
| Altura | 68px (60 no celular) | **74 (64)** — a da landing e do painel do cliente |
| Logo | 36px (30) | **40 (32)** |

⚠️ **O 68 era meu, e a defesa dele não se sustentou.** O argumento era a
densidade da fila — real, mas custava 6px de estranheza em quem passa das
outras telas para esta, e **densidade se resolve no item, não na barra**. As
etapas ficam registradas no CSS porque a segunda foi eu defendendo uma
diferença que ninguém pediu.

⚠️ **O admin continua em 60, e isso não é divergência**: a marca dele mora na
sidebar e a topbar leva só controles. Foi a comparação injusta que produziu o
60 original desta tela.

Conferido: o `.trilho` continua colado embaixo da barra (74/74) — ele gruda em
`top: var(--barra-h)`, e é por isso que a altura tem de ser sempre o token.

### 2026-08-31 (14ª rodada) · O dia calmo vira texto livre, e a engrenagem para de ser cortada

Pedido do Pedro com os prints do painel do cliente ao lado: *"dá uma melhorada
nesse texto, e deixe o visual dele assim"*.

**O texto dizia três vezes a mesma coisa.** O título: "Nenhum chamado aberto".
O parágrafo abria com "A fila está vazia". A etiqueta embaixo repetia
"NADA PEDE ALGUÉM AGORA". Três formas de dizer que não há nada — e nenhuma de
dizer **o que há**, que é a pergunta que uma tela vazia levanta sozinha.

⚠️ **E EU CONSTRUÍ UMA PLACA QUE ELE RECUSOU.** Primeira tentativa: chapa de
duas camadas com anel, gradiente e segunda coluna dividida por corte gravado.
Ele: *"não quero esse bloco que você está fazendo, faça algo realmente igual
esse texto, livre"*. Certíssimo, e o print prova — no painel do cliente a
manchete e a lede pousam **direto no campo marinho**; quem tem placa ali são os
**cartões**, que são o conteúdo. **Numa tela sem conteúdo, embrulhar o aviso
numa peça é dar corpo justamente ao que não tem.**

O que ficou, tudo livre no campo e **centrado nos dois eixos** — encostado no
topo à esquerda o aviso ficava com uma coluna inteira de vazio embaixo, e num
dia calmo essa coluna é a tela toda; centrado, o vazio vira respiro em volta em
vez de sobra abaixo:

| | |
|---|---|
| Manchete | `Nenhum chamado **esperando**.` — **escolha do Pedro**. Eu tinha promovido a antiga etiqueta ("Nada pede alguém agora") a título; "esperando" já está no cabeçalho da fila, e reaproveitar a palavra que a pessoa acabou de ler custa menos que ensinar uma construção nova |
| Lede | "Assim que um chamado for aberto, ele entra aqui no topo — com o prazo já contando." |
| Números | `87 prédios no mapa · 2 técnicos livres agora`, em texto corrido |
| Nota | o ciclo de 30 s, fora do grupo em destaque (A Regra da Nota Honesta) |

⚠️ Descartada também **"Tudo em dia por aqui"**: numa tela de turno, afirmar
calma que ninguém verificou é o pior erro possível.

⚠️ **A LEDE NÃO CITA MAIS A TELEMETRIA** (correção do Pedro: *"tire o foco da
palavra telemetria aí, são chamados no geral"*). Ela dizia "Quando a telemetria
abrir um chamado, ou alguém ligar relatando alguma coisa" — e isso põe UMA das
cinco origens na frente das outras quatro. Um chamado nasce da telemetria, do
WhatsApp com IA, do plano de preventiva, do painel do cliente ou de alguém
digitando (ver `origemDe`). A frase agora vale para todas, e ficou mais curta
por consequência.

⚠️ **Os números são os da própria tela** — os prédios são os pinos do mapa e os
técnicos são os do trilho. E é **"prédios no mapa", não "monitorados"**: a
carteira é quem tem coordenada, não quem tem sensor, e em produção não há
reservatório cadastrado.

### E a engrenagem parou de ser cortada

O Pedro, na mesma mensagem: *"o final da engrenagem na parte da esquerda dela
está ficando cortada"*. Estava, **por construção**: o `.eng` era um RECORTE
(`overflow:hidden` sobre a coluna do trilho) e o corte caía no meio do anel,
numa reta vertical que nenhuma peça de metal tem.

O recorte existia para a roda não encostar na coluna da fila. **Mas ela não
precisa disso**: `#tela` tem `z-index:1` e cada item tem fundo próprio, então a
roda passa POR TRÁS — que é exatamente o que a landing faz com a mesma peça. O
que me impedia era ter herdado a solução de um dia em que o empilhamento ainda
não estava resolvido.

Conferido: sem rolagem horizontal (o `overflow-x:clip` de `html,body` já
segurava), e a roda passa atrás dos itens sem aparecer por cima de nenhum.

### 2026-08-31 (13ª rodada) · A barra dos Aprovados nunca endurecia, e as três viram uma só

O Pedro: *"o cabeçalho da tela de orçamento é translúcido?"*. Era — **e nunca
deixava de ser.**

A folha define `.barra` translúcida (`--mar-900` a 88% + `blur(14px)`) e
`.barra.is-rolada` sólida com fio inferior. Quem troca a classe é um listener
de `scroll` que existia no `operador.js` e **nunca foi copiado** para o
`operador-orcamentos.js` — o mesmo tipo de divergência que este par de telas
já cobrou duas vezes hoje (a prévia sem o link, a prévia sem a fixture).

O efeito era pior aqui do que seria no painel do turno: esta tela tem **placas
claras** passando por baixo da barra, então o cabeçalho ficava sobre um borrão
claro e o topo da placa aparecia atravessando a marca.

⚠️ **E faltava o ESTADO INICIAL, nas duas telas.** O navegador restaura a
posição de rolagem ao recarregar: quem dá F5 no meio da lista volta com a
página rolada e um `scroll` que nunca aconteceu — a barra nascia translúcida
com conteúdo por baixo até a pessoa rolar de novo. O listener virou uma função
nomeada, chamada também no boot.

### E a barra parou de ser diferente das irmãs

Pedido, na mesma mensagem: *"deixe ela igual aos outros cabeçalhos, não tem por
que ser diferente"*.

| | Antes | Agora |
|---|---|---|
| Altura | 68px (60 no celular) | **74 (64)** — a da landing e do painel do cliente |
| Logo | 36px (30) | **40 (32)** |

⚠️ **O 68 era meu, e a defesa dele não se sustentou.** O argumento era a
densidade da fila — real, mas custava 6px de estranheza em quem passa das
outras telas para esta, e **densidade se resolve no item, não na barra**. As
etapas ficam registradas no CSS porque a segunda foi eu defendendo uma
diferença que ninguém pediu.

⚠️ **O admin continua em 60, e isso não é divergência**: a marca dele mora na
sidebar e a topbar leva só controles. Foi a comparação injusta que produziu o
60 original desta tela.

Conferido: o `.trilho` continua colado embaixo da barra (74/74) — ele gruda em
`top: var(--barra-h)`, e é por isso que a altura tem de ser sempre o token.

### 2026-08-31 (14ª rodada) · O dia calmo vira placa, e o nome sai de fatia

Pedido do Pedro com os dois prints do painel do cliente ao lado: *"dá uma
melhorada nesse texto, e deixe o visual dele assim"*.

**O texto dizia três vezes a mesma coisa.** O título: "Nenhum chamado aberto".
O parágrafo abria com "A fila está vazia". A etiqueta embaixo repetia
"NADA PEDE ALGUÉM AGORA". Três formas de dizer que não há nada — e nenhuma de
dizer **o que há**, que é a pergunta que uma tela vazia levanta sozinha.

E era texto centrado no vazio, não uma peça. Virou **placa**, na gramática dos
prints, elemento por elemento: manchete branca com uma palavra em âmbar, lede
em `--sobre-2`, segunda coluna com etiqueta mono e linhas separadas por fio.

| | |
|---|---|
| Manchete | `Nada **pede alguém** agora.` — a frase que era etiqueta subiu para o lugar que ela merecia |
| Lede | "Quando a telemetria abrir um chamado, ou alguém ligar relatando alguma coisa, ele entra aqui no topo — com o prazo já contando." |
| 2ª coluna | **Enquanto isso** · `87 prédios no mapa` · `2 técnicos livres agora` · e a nota do ciclo de 30 s |

⚠️ **Os números são os da própria tela** — os prédios são os pinos do mapa e os
técnicos são os do trilho, ambos de `DADOS`. Se um dia deixarem de bater com o
que está ao lado, é aqui que a mentira aparece primeiro.

⚠️ **"prédios no mapa", não "monitorados".** A carteira é quem tem COORDENADA,
não quem tem sensor — em produção não há reservatório cadastrado, e
"monitorados" seria promessa que o dado não sustenta.

⚠️ **Esta placa ganha anel e gradiente**, e não contradiz "moldura marca o que
é único": ela aparece uma vez e só quando não há mais nada na tela. E a divisão
entre as colunas é **corte gravado** (`--rasgo` + `--luz`), que no celular
deita junto — em pilha, um `border-left` deixaria as duas células sem divisão.

### E o "caractere perdido" na barra

O Pedro: *"no cabeçalho também parece que tem um caractere perdido entre Novo
chamado e Sair"*. Era o **nome**, espremido: `flex-shrink: 1` + `min-width: 0`
deixavam ele ceder espaço até virar uma fatia — medido, **4px de renderização
para 29px de texto**, ou seja, um pedaço da primeira letra encostado no botão.

Fragmento de glifo não é "menos informação", é sujeira. Com `flex-shrink: 0`
ele ou cabe inteiro ou some (abaixo de 760px o bloco de celular já o esconde);
quem cede no aperto é a marca, que tem a regra de 420px para isso.

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).

### 2026-08-31 · O trilho responde "quem pode ir" com duas peças

Continuação do corte de 28/08, agora na coluna da direita. Cada técnico
mostrava **quatro coisas** — selo de iniciais, nome, estado e uma nota de GPS
("no mapa" / "sem posição") — para responder **uma** pergunta: *quem pode ir*.
Duas dessas quatro não respondiam nada.

| | Antes | Agora |
|---|---|---|
| Peças por linha | 4 | **2** (nome · estado) |
| Colunas da linha | 3 (flex) | **nenhuma** — nome, e o estado embaixo |
| Sinais de disponibilidade | 2 (anel verde + tinta) | **1** (a tinta do estado) |

- **O selo de iniciais saiu.** Ele não identifica ninguém que o operador já não
  reconheça pelo nome — é a equipe dele, quatro pessoas. Um "MR" chanfrado ao
  lado de "Marcos Ribeiro" é decoração ocupando a primeira posição da linha,
  que é justamente onde o olho entra.
- **"no mapa" saiu.** Aparecia em quase toda linha, **logo abaixo do mapa que
  já mostra o pino** — a nota repetia o que o instrumento acima diz melhor.
  Ficou só a **exceção**: quando falta posição, isso se diz, em tinta apagada
  (`--muted`, medido em 5,7:1 sobre a chapa).
- **O anel verde foi junto com o selo**, e isso é ganho, não perda: a
  disponibilidade tinha dois lugares para morar (o anel e a cor do estado) e
  agora tem um. `.tec[data-liv="1"] .tec-av` era a única regra viva desse anel;
  o `.tec-av` que sobrou serve só ao diálogo de despacho, que ainda não passou
  pelo corte.
- **"Despachados hoje" perdeu o ícone de rota**, que se repetia idêntico em
  toda linha. O cabeçalho da seção já diz que ali é rota.
- `.tec` deixou de ser `flex` de três colunas e virou bloco: sem selo e sem
  nota, não havia mais eixo horizontal nenhum para distribuir.

⚠️ **O "·" da ressalva é TEXTO, não `content` de `::before`.** Como
pseudo-elemento ele sumia do `innerText`: quem copiasse a linha — e quem a
ouvisse num leitor de tela — recebia *"Ocupadosem posição"* numa palavra só. O
defeito não aparece em screenshot nenhum; apareceu ao ler o `innerText` na
prévia. **Separador que o usuário lê é conteúdo, e conteúdo mora no markup.**

Verificado em `/dev/_operador-preview.html` (mesa a 1440 e celular a 390, por
iframe): render correto nos quatro estados da fixture — ocupado com posição,
livre com posição, e livre/ocupado **sem** posição —, console limpo,
`node --check` limpo, detector do impeccable sem achado novo.

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).

### 2026-08-31 · O placar de três números sai, e a engrenagem muda de casa

Segundo passe do dia, na mesma direção. O Pedro deixou a decisão em aberto
("some, ou vira uma linha só?") e delegou a escolha. **Escolhido: some.**

**Por que "some" e não "uma linha":** uma linha ainda seria um terceiro lugar
dizendo o mesmo. Os dois cabeçalhos de seção **já são** essa linha, e são
melhores por estarem colados na lista que contam — número a 400px de distância
da coisa contada é um placar que se precisa memorizar.

Dos três números, dois eram repetição literal, com as mesmas palavras, a 40px
de distância:

| Placar dizia | O que já estava na tela |
|---|---|
| `4` esperando alguém | cabeçalho **"Esperando alguém — 4 chamados"** |
| `1` com técnico | cabeçalho **"Já tem técnico — 1 chamado"** |
| `1` fora do prazo | *nada* — este era o único que valia |

E no dia calmo o placar dizia **"0 chamados abertos"** em miniatura logo acima
do **"Nenhum chamado aberto."** em corpo de manchete: a mesma frase, dois
tamanhos, 40px de distância. Era esta duplicação que abriu o item.

- **"fora do prazo" desceu para o cabeçalho da seção**, em `--risco` (6,3:1) —
  a mesma tinta da régua do item estourado, para o cabeçalho e os itens que ele
  conta dizerem a mesma coisa com a mesma cor. **Nenhuma palavra nova entrou na
  tela:** "fora do prazo" é o rótulo que o placar já usava.
- **E ficou mais preciso ali.** O placar somava a fila inteira; agora cada
  seção conta os seus. Um chamado estourado que **já tem técnico** não é
  pendência de despacho, e contá-lo junto com os que esperam era enganoso.
  Quando o número é zero, o trecho não aparece.
- **Ganho de primeira tela:** o primeiro item subiu de **y=225 para y=120** na
  mesa, e de y=302 para ~y=105 no celular. Quem abre o painel cai na fila.

⚠️ **A ENGRENAGEM DE FUNDO MUDOU DE CASA, e o campo aberto mudou de eixo.**
A máscara em px do `.eng` a continha numa faixa HORIZONTAL — barra + placar +
cabeçalho da fila. Sem o placar essa faixa caiu de **157px para 49** (a barra
é opaca por cima), e o que sobrava não era engrenagem: era uma mancha, o topo
de um círculo de 720px. **A conclusão errada seria "a peça não cabe mais
nesta tela".** Ela cabe — o campo aberto virou vertical. Medido a 1920: o
conteúdo ocupa x=255..1675 (fila de 1000 + trilho de 400), sobrando **245px de
margem à direita correndo a altura inteira do viewport**, mais área contínua
do que a faixa antiga jamais teve.

**Ela passou a abraçar o mapa** — pedido do Pedro, e foi o terceiro arranjo da
peça no mesmo dia. Os dois anteriores ficam registrados porque falharam pelo
mesmo motivo, e o motivo é a lição:

| Arranjo | Por que caiu |
|---|---|
| Faixa horizontal no topo, contida por máscara em px | A faixa dependia do placar; caiu de 157px para 49 |
| Margem direita da janela, sangrando pela borda | Só existia acima de 1800px — a margem é `(largura − 1420) / 2` e some no notebook |

**Os dois ancoravam a peça na JANELA.** Ancorada no **conteúdo** ela para de
depender do tamanho do monitor. Hoje são dois elementos: `.eng` é o **recorte**
— a coluna do trilho, com `overflow:hidden` — e `.eng-roda` é a peça, centrada
no mapa. Com isso **a engrenagem não encosta na coluna da fila em largura
nenhuma**, e o dente aparecendo nas frestas entre cartões deixou de ser
possível **por construção, não por calibragem**. Quem corta a roda por dentro é
o **mapa**, que é opaco e fica por cima: ela emerge acima, à direita e abaixo
dele. Não há máscara em px em lugar nenhum deste bloco — a oclusão virou
geometria de layout. É `fixed`, e funciona porque o trilho é `sticky`: a
posição do mapa no viewport não muda enquanto a fila rola por baixo.

⚠️ **A roda NÃO fica no centro do mapa.** Centrada nele (`left: -179px`, a
conta exata) ela sumia quase inteira atrás da peça — foi o que o Pedro apontou.
Puxada 99px para a direita (`-80px`), ela emerge à direita do mapa sem perder o
abraço: o anel continua passando acima e abaixo dele. Testei o extremo (`0px`)
e ali ela lê como peça **ao lado** do mapa, não abraçando.

⚠️ **Pré-requisito: `.trilho` perdeu o `background`.** Ele era `--mar-900`,
EXATAMENTE a cor do `body` — pintava por cima da engrenagem sem mudar um pixel
do que se via. Quem devolver aquele fundo faz a peça sumir sem nenhum outro
sintoma.

⚠️ **A borda esquerda do recorte é um `min()` de duas expressões**, porque o
trilho muda de regime: acima de ~1340 o par centra (`50% + 315px`), abaixo
disso o conteúdo encosta no gutter (`100% − trilho − 10px`). Com só a primeira,
o recorte ficava 120px à direita do trilho a 1200px e comia a peça; com só a
segunda, avançaria sobre a fila a 1920.

⚠️ **Abaixo de 1180 ela não entra** — a quebra exata em que o trilho vira faixa
horizontal. **Eu tinha escrito 1080** (o número da landing), e a 1150 a
engrenagem aparecia por cima dos itens. Nenhum screenshot pegou: só apareceu
comparando o retângulo do `.eng` com o do `.trilho` na mesma medição.

Saíram com a máscara os dois falsos positivos de cor do detector (o `#000` das
máscaras), que o comentário do CSS já registrava como falsos.

Verificado em `/dev/_operador-preview.html`, mesa a 1440 e celular a 390: dia
cheio, **dia calmo** (a frase agora aparece uma vez só), estourado na fila,
estourado com técnico e zero estourados (o trecho some). Console limpo,
`node --check` limpo, detector sem achado novo — 31 advertências de
`font-size`, contra 34 antes, e nenhuma de cor.

### 2026-08-31 (15ª rodada) · Os pinos crescem quando o mapa cresce

> "Abri ele em uma tela grande e os ícones não estão muito bonitos, são muito
> pequeninhos, então a leitura não fica muito boa." — o Pedro, sobre o mapa do
> painel do operador.

Os três pinos do mapa nasceram medidos para a caixa em que foram desenhados: a
coluna do trilho, 400px de largura. Em **tela cheia** (ou na faixa abaixo de
1180px, onde o trilho deixa de ser coluna) a caixa vira a janela inteira e os
mesmos 22 · 28 · 26px viram confete — o mapa continua certo e deixa de ser
legível, que é o pior tipo de defeito porque não parece defeito.

**A escala segue a largura do MAPA, não a da janela.** `escalaPinos()` mede o
próprio Leaflet depois do `invalidateSize()` e escreve `data-esc="g"` no
`.mapa-tela` acima de **800px** — o mesmo limiar que já escolhia o
enquadramento, agora extraído em `MAPA_LARGO` para não haver dois números
querendo dizer "mapa largo". Acima dele os pinos vão para **30 · 40 · 36px**,
com face, chanfro e halo do estourado na mesma proporção, e a legenda ganha 6px
de respiro para não encostar na face maior.

⚠️ **Um `@media` de largura de janela seria o caminho errado**, e a razão é
`--trilho-w`: ele é **fixo em 400px**. Num monitor de 2560 a coluna continua com
400, então a regra de janela cresceria o pino exatamente onde ele não pode
crescer — 86 prédios empilhados uns sobre os outros na tela que o operador olha
o turno inteiro — e a tela cheia é que ficaria certa por acidente.

⚠️ **O tamanho do pino deixou de depender do `iconSize`.** O `iconSize` /
`iconAnchor` do divIcon posiciona a **caixa**; a face agora é centrada nela por
`transform` no `.pin`, então crescer a face cresce **em volta do ponto** e o
pino continua marcando a coordenada certa. Sem isso, um pino maior que a caixa
escorregaria para baixo e para a direita da posição real — e a alternativa
(crescer a caixa) desalinharia tudo, porque o `iconAnchor` é escrito no JS.

⚠️ **O transbordo não custa o clique do chamado** — o único pino que abre
alguma coisa. O Leaflet escuta na caixa e o evento sobe da face por bubbling;
`.leaflet-marker-icon` **não** recorta (o `overflow:hidden` do `leaflet.css` é
do `.leaflet-container`, não do marcador), e `pointer-events` é herdado, então a
face é clicável em toda a área.

⚠️ **Nenhuma regra de pino pode declarar `position` daqui em diante.** O
`.pin-ch` e o `.pin-tec` tinham `position:relative` para a chapa de duas
camadas; o `::before` só precisa de um pai **posicionado**, e `absolute`
também é. Os dois `relative` saíram: eles ganhavam do `.pin` na cascata (mesma
especificidade, regra posterior) e tirariam a face do centro da coordenada — em
um dos dois casos silenciosamente, porque a ordem no arquivo decidia qual pino
quebrava.

Sem mudança de dado, de rota ou de schema: `operador.css` e `operador.js`,
`?v=` bumpado nos dois (72 / 68) no `operador.html` e no
`_operador-preview.html`. `node --check` limpo.

### 2026-08-31 · O app do técnico aponta a bomba, e a O.S. dele para de nascer órfã

A Fase 12C (18/08) ligou a O.S. ao equipamento e pôs o seletor no modal do
admin. **O app do técnico ficou de fora** — e é lá que a O.S. de campo é
escrita. Quem digita a O.S. na casa de máquinas não tinha como dizer qual bomba
atendeu; quem tinha o campo era quem não estava lá.

O `equipamento_id` da O.S. paga duas contas, e as duas ficavam sem pagar:

1. **O orçamento chega na bancada colado na bomba.**
   `_garantirOrcamentoDaOs` usa o vínculo pra adotar um pedido que a bancada já
   tenha aberto pela etiqueta, em vez de abrir um segundo pro mesmo serviço.
2. **A O.S. entra no histórico da ficha** (`GET /equipamentos/:id` filtra por
   `os.equipamento_id`), que é o que sustenta o contador de idas à oficina — o
   número que justifica trocar a bomba em vez de consertar de novo.

**Nada de backend.** O `PATCH /ordens-servico/:id` já aceitava
`equipamento_id`, o `GET /:id` já devolvia `equipamento_id` **e**
`condominio_id` (o app recebia os dois e ignorava), e `GET /equipamentos` já
passa em `equipeInterna` — o guard que existe justamente porque o técnico não
passa em `adminOnly`. Era só a camada web do app.

⚠️ **A seção só existe se houver bomba etiquetada no condomínio** (ou se a O.S.
já tiver uma vinculada). Sem essa condição, todo prédio sem etiqueta ganharia
uma seção vazia — e hoje isso é **todo prédio**: `equipamentos` está zerada em
produção. A seção nasce sozinha no dia em que as etiquetas subirem, sem APK
novo.

⚠️ **Ela é "•", não numerada.** `atualizarProgresso` conta 7 seções com lógica
de completude e a barra é calibrada nesse 7 — uma oitava marcando `complete`
passaria de 100%. E numerar teria dois efeitos ruins: renumeraria todas as
outras e, como a seção é condicional, o mesmo passo teria número diferente em
prédio com e sem etiqueta. Segue o precedente da seção de orçamento, que já é
opcional e já é "•".

⚠️ **A pegadinha do vínculo apagado em silêncio, de novo.** É a mesma que
apareceu no admin em 18/08, e reaparece aqui por outro caminho: a bomba
vinculada pode não vir no `GET /equipamentos?condominio_id=` porque trocou de
prédio **ou porque está inativa** (a listagem filtra `ativo = true`). Nos dois
casos o `<select>` cairia em "Não vinculada" e o primeiro toque em qualquer
outro campo salvaria o apagamento. `_osCarregarEquipamentos` busca a ficha
avulsa e a acrescenta com o rótulo "(outro condomínio)".

⚠️ **`Number("")` é `0`, não `null`.** "Não vinculada" tem `value=""`; sem o
ternário, desvincular gravaria `equipamento_id = 0`, que não é id de bomba
nenhuma.

**Nome:** a seção se chama **"Bomba atendida"**, não "Equipamento" — a O.S. já
tem uma seção "Equipamentos verificados" logo abaixo, que é checklist genérico
(comando elétrico, bombas de recalque…) e vive em `itens_verificados`. Dois
"equipamento" na mesma tela seriam duas coisas diferentes com o mesmo nome.

**CSS:** `.os-select` (44px de alvo, corpo 14px) em vez do `.input` base, que
tem 36px e corpo 12,5px — dimensão de formulário de mesa. Quem toca nesse
select está de pé na casa de máquinas, muitas vezes de luva.

**Verificado exercitando as rotas** contra o banco de TESTE, com JWT de técnico
e O.S. criada e removida no fim: `GET /equipamentos?condominio_id=` responde
200 ao técnico e traz a bomba; `PATCH { equipamento_id }` grava; o `GET` relê;
a ficha avulsa de outro condomínio responde 200; e `{ equipamento_id: null }`
desvincula. Mais 20 verificações de render no app real (`/app/` em navegador
headless, 390px) lendo o **`innerText`** e o estado do `<select>`, não
screenshot — a lição do "Ocupadosem posição" de hoje mais cedo: ordem das
seções, marcador "•", código formatado `XXXX-XXXX`, fallback marca+modelo
quando não há apelido, altura real do alvo **com a seção aberta** (fechada ela
mede 0 e o teste passaria achando que mediu algo), gravação como `number`,
desvínculo como `null`, e a bomba de fora chegando selecionada. Console limpo,
`node --check` limpo.

📋 **Fica em aberto:** escanear o QR direto do app, que é o gesto natural na
bancada. Não há plugin de leitura de código no `app/package.json` (só
geolocation, filesystem e share) — exige `@capacitor-mlkit/barcode-scanning` e
mexida no nativo. O seletor resolve o vínculo sem isso.

⚠️ **Só chega no técnico com APK novo:** o web do app é empacotado
(`webDir: public`), então isto exige `npm run build:apk` e reinstalação. Não há
`?v=N` a bumpar — o app não versiona assets — e o SW já trata `/app` e
`/equipamentos` como network-first.

### 2026-08-31 (16ª rodada) · O chamado pode nascer já despachado

> *"Queria que quando fosse criar o chamado já desse para atribuir o técnico,
> por exemplo na tela de orçamento, ou no botão novo chamado."* — o Pedro.

Os dois diálogos de criação ganharam um seletor **Técnico**, opcional: o
**Novo chamado** da fila e o **Abrir chamado** dos Aprovados. Antes o chamado
nascia sempre sem ninguém — quem já sabia quem ia (e no telefone quase sempre
sabe) tinha de gravar, achar o item na fila e despachar. Dois passos para uma
decisão só.

**Backend, e as regras são iguais nas duas portas** porque são a mesma decisão:

- `POST /chamados` e `POST /operador/orcamentos/:id/chamado` aceitam
  `tecnico_id` opcional.
- Quem valida é o **`chamado-atribuicao.service.js`**, novo: `ativo` **e**
  `cargo = 'tecnico'`, senão `400` com frase que o operador resolve sozinho
  ("Este técnico não está mais disponível. Recarregue a tela."). A FK já
  barraria um id inexistente, mas com `23503` traduzido em `500` — FK é rede de
  segurança, não mensagem de erro. ⚠️ **Não checa `disponivel`**: ocupado não é
  impedimento, e num P1 às 18h quem está ocupado às vezes é quem está perto.
- **Atribuir marca `primeira_resposta_em`**, a mesma regra do `PATCH`. Se o
  operador despachou no ato de abrir, a resposta foi imediata — deixar o
  relógio do TTFR correndo cobraria uma resposta que já veio.
- **O status continua `aberto`.** `em_atendimento` é do app do técnico, com
  GPS. Atribuir não é começar.
- A atribuição entra no `historico_chamados` como linha `tecnico_id`,
  **indistinguível de um despacho feito depois** — a ficha responde "quem
  mandou e quando" do mesmo jeito nos dois casos.

⚠️ **`$7::int` NAS DUAS APARIÇÕES nos dois INSERT.** O mesmo parâmetro entra
como valor de coluna e dentro do `CASE` que decide o `primeira_resposta_em`;
sem o cast explícito o Postgres deduz tipos diferentes e recusa a query **no
parse** (42P08). É exatamente o defeito que derrubou
`POST /cliente/orcamentos/:id/responder` desde o dia em que nasceu — e que só
aparece quando alguém usa a rota de verdade. Por isso as duas foram
**exercitadas**, não só `node --check`: Express de pé, JWT assinado, 20 casos
contra o banco de teste (com técnico, sem técnico, id inexistente, id inválido,
string vazia, clique duplo nas duas variantes), tudo verde e as linhas de teste
removidas no fim.

⚠️ **No clique duplo dos Aprovados a escolha PREENCHE VAZIO e nunca troca.**
Chamado que já existe sem técnico recebe o escolhido (`tecnico_atribuido:
true`); com técnico, nada muda e a faixa diz isso, em vez de afirmar um
despacho que não houve. Sobrescrever seria o outro extremo: o segundo clique
desfazendo, sem aviso, o despacho do primeiro — ou o de outro operador.

**Endpoint novo: `GET /operador/tecnicos`** — id, nome, `disponivel`,
`abertos`, GPS de 30 min. ⚠️ Existe para a tela de Aprovados **não** chamar
`GET /tecnicos`, que devolve a ficha inteira do funcionário (CPF, RG, endereço,
data de nascimento) porque serve o cadastro do admin. Uma tela que só precisa de
nomes não tem por que receber isso — dado que não trafega não vaza. A consulta
é a **mesma** da fila, agora em `SQL_EQUIPE`: tela que oferece um técnico que a
gravação recusa é o pior sintoma possível. (O prefixo `/operador` já está na
lista network-first do `sw.js` — nada a bumpar lá.)

**Front:**

- O seletor vem **depois da descrição**, que é a ordem da conversa ao telefone:
  onde · o que · quanto corre · o que foi dito · **quem vai**.
- O padrão é **"Despachar depois"**, nunca o primeiro da lista: formulário que
  já vem com alguém escolhido atribui por inércia.
- Cada opção traz o **mesmo estado do cartão de despacho** (livre agora · N
  chamados · ocupado) e a **mesma ordem** (livre primeiro, depois menos
  carregado). Um nome só não é escolha informada, e ordem diferente em cada
  tela ensinaria que a primeira posição não quer dizer nada.
- A faixa de confirmação passou a dizer **para qual seção o chamado foi** —
  mesma correção do despacho de mais cedo: o item nasce em "Já tem técnico" ou
  em "Esperando alguém" e pode cair abaixo da dobra.
- ⚠️ De quebra, o `operador-orcamentos.html` estava com `operador.css?v=71`
  enquanto as outras duas telas já tinham ido para 72 — as três foram para 73.

Sem migration: `chamados.tecnico_id` existe desde a 009.

### 2026-09-01 · O técnico ganha a pele do admin no mapa do operador

Pedido do Pedro depois de olhar as duas telas lado a lado: *"analisa todos os
atributos de cor e visuais do mapa de admin e leve para o operador"*.

**O achado que mudou o escopo: a paleta já era a mesma.** `--ok`/`--warn`/
`--danger`/`--muted` do `admin.css` e `--verde`/`--amarelo`/`--vermelho`/
`--muted` do `operador.css` são os mesmos quatro valores (`#63d8a0`, `#fbb329`,
`#ff5a4d`, `#8294c2`), e o filtro de tile (`.map-tiles-dark`) é idêntico ao
caractere. Não havia divergência de cor a corrigir — a divergência era de
**presença**, e estava concentrada num pino só.

**O pino de técnico.** Era um círculo de `--fio-forte` (branco a 34% sobre
marinho) — a mesma construção de "presença sem sinal" da carteira de fundo.
Num mapa em que ele é a única peça que se **move** e a única que responde
"quem pode ir agora", isso o deixava com menos presença que os 87 prédios de
fundo. Ganhou a pele do `.tec-pin`: gradiente de identidade, anel branco de
2px, glow da própria cor, sombra de apoio e o `@keyframes pinPulse`.

⚠️ **O `data-liv` não se perdeu no caminho.** No admin o técnico é sempre
violeta, porque aquele mapa não sabe quem está livre; aqui livre e ocupado
precisam se distinguir. Mas **dentro da identidade**: matiz violeta constante,
estado na luminosidade. O glow segue a cor por `--tec-gl`.

⚠️ **Isto foi corrigido no mesmo dia, e o erro merece registro.** A primeira
versão pintou "livre agora" de verde (`#7ce8b8`→`#3fae7c`), e o prédio em ordem
é `--verde` `#63d8a0` — que cai no **meio** desse gradiente: **ΔE 7,8**, contra
o piso de 15 do DESIGN.md. E no par pior possível, porque são os dois estados
**normais**: "livre" é o comum do técnico e "em ordem" é o dos 87 prédios de
fundo. No dia a dia o mapa ficava com técnicos verdes perdidos num campo verde
— o mesmo defeito que a pele nova tinha acabado de corrigir, refeito por outro
caminho uma hora depois. O Pedro viu na hora: *"o pin do técnico do mapa com a
mesma cor dos condomínios, sério?"*.

A regra que fica: **cor de estado (verde/âmbar/vermelho) é dos prédios.** Estado
de técnico se faz dentro da matiz dele, pela luminosidade — que é o mesmo
princípio que o DESIGN.md já usa onde a matiz colapsa sob daltonismo.

| | tinta | contraste | ΔE do vizinho mais próximo |
|---|---|---|---|
| livre | violeta claro `#c4b5fd`→`#a78bfa`, marinho | 9,09:1 | 29 (prédio mudo) |
| ocupado | violeta fundo `#6d28d9`→`#4c1d95`, branca | 8,87:1 | 82 |
| sem sinal | cinza `#64748b`→`#475569`, branca | 6,02:1 | 33 (prédio mudo) |

Separação entre os três estados do técnico: ΔE 58 · 47 · 79.

⚠️ **Os degraus são daqui, a matiz é do admin.** Lá o técnico é sempre
`#8b5cf6`→`#6d28d9` porque aquele mapa não tem o estado a mais; esse violeta não
serve para nenhum dos dois extremos daqui (branco sobre ele dá 3,7:1 e marinho,
3,4:1).

⚠️ **O tamanho não veio.** No admin o técnico tem 32px contra 28 do prédio;
aqui o maior continua sendo o pino de chamado, que é o único que abre alguma
coisa no clique. Pele é cor; tamanho é hierarquia.

**Estado novo: "sem sinal" (`_gpsParado`, 10 min — o número do `_tecStale` do
admin, que é do Android e não do produto).** É a faixa **entre** os 10 minutos
e a janela de 30 do backend: a posição ainda vem, mas já não é "agora". A tela
não distinguia isso — um GPS parado há 25 minutos pulsava igual a quem acabou
de mandar posição, e o operador despachava para onde o técnico **estava**. O
pino fica cinza, opaco e **parado** (o pulse quer dizer "ao vivo"), e a legenda
diz há quanto tempo, via `haQuanto`.

**Pulse: só o técnico.** A regra da tela — *"halo só no estourado, e não
pisca"* — continua valendo para prédio e chamado. 87 pontos piscando na coluna
de 400px apagariam os 3 que pedem alguém. O técnico é a exceção porque é o
único que se move e o único que a tela precisa que seja **achado**, não
vigiado. Guardado por `prefers-reduced-motion`.

**Também vieram do admin:** hover `scale` nos três pinos (a tela não tinha
nenhum feedback de ponteiro) e os três parâmetros de tile que faltavam —
`keepBuffer: 4`, `updateWhenIdle: false`, `updateInterval: 100`. Arrastar o
mapa deixa de abrir buraco cinza na direção do gesto, que é exatamente o
momento em que o operador olha o que tem em volta do chamado.

⚠️ **`transform` no hover REESCREVE o `translate(-50%,-50%)` do `.pin`.** É uma
propriedade só: escrever apenas `scale()` apaga o translate que centra a face
na coordenada, e o pino salta um quarto de si mesmo no meio do gesto de apontar
para ele. O admin não corre esse risco porque lá a face não é centrada por
transform.

⚠️ **`zIndexOffset: 500` no técnico** — entre a carteira (0/400) e o chamado
(1000). O Leaflet empilha por latitude, então um prédio de fundo ao sul cobria
o técnico. Continua abaixo do chamado, pelo mesmo motivo que deu 1000 a ele.

**Cor nova nesta folha:** o violeta do técnico (`#8b5cf6` → `#6d28d9`) não está
no DESIGN.md. Ele não é estado e não entra na paleta categórica — é a cor de
**identidade** do técnico, herdada do `admin.css` justamente para que as duas
telas digam a mesma coisa. Se um dia virar token, é nas cinco folhas.

### 2026-09-01 · O mapa do operador para de perder quem entra em campo depois

Relatado pelo Pedro: *"tem um técnico hoje sendo rastreado e aparecendo no mapa
do painel de admin, mas no painel de operador ele não [aparece]"*.

**Não era o backend.** As duas consultas devolvem o mesmo técnico, com a mesma
coordenada e o mesmo horário — conferido contra produção. `SQL_EQUIPE` filtra
`cargo = 'tecnico'` e `GET /tecnicos/localizacao` não, mas o técnico em questão
**é** cargo técnico, então essa divergência (real, e ainda de pé) não era esta.
Também não era o `sw.js`: `/operador` já está na lista network-first.

**Era o enquadramento, e o gatilho estava errado.** `if (!_mapaEnquadrado)`
enquadrava **uma vez por carregamento de página** e nunca mais. A intenção era
boa — não arrancar a vista da mão de quem acabou de dar zoom num bairro —, mas
numa tela que fica aberta o turno inteiro isso faz o enquadramento ser decidido
pelo estado do sistema às 8h da manhã.

O caso, com os números medidos em produção:

| | |
|---|---|
| Fila às 8h | **zero** chamado aberto, nenhum técnico com GPS → `_pontos` vazio |
| Enquadramento aplicado | mediana dos 87 prédios (`-23,5567 / -46,6571`), zoom 12 |
| Alcance na coluna de 400px | **±7,01 km** (35,05 m/px) |
| Técnico às 12h53 | `-23,5350 / -46,5803` — **7,84 km a leste** |
| Resultado | 830 m além da borda direita, e a vista nunca mais recalculada |

O pino era desenhado a cada ciclo de 30s e o trilho listava o nome; só F5 ou o
botão de tela cheia (que chama `enquadrarMapa` de novo) traziam ele de volta.

**A correção troca o gatilho, não a regra.** `_operadorMexeu` substitui
`_mapaEnquadrado` no `if`: enquanto ninguém tocou no mapa ele é automático; no
primeiro gesto, congela para sempre naquela sessão. O motivo original fica
intacto — só passou a ser disparado por quem ele sempre quis proteger.

⚠️ **`zoomstart`/`movestart` do Leaflet NÃO servem para detectar o gesto** — o
próprio `fitBounds` os dispara, e o mapa se travaria sozinho no primeiro
enquadramento, de volta ao bug por um caminho mais difícil de enxergar.
`_ouvirGestos` escuta só os cinco que exigem a mão do operador: `dragstart`,
`wheel`, `dblclick`, `keydown` e `touchstart` com dois dedos. (`zoomControl` é
`false` nesta tela, então não há botão +/- a escutar.)

⚠️ **O critério é "fora da vista", não "mudou de lugar"** (`_precisaEnquadrar`).
Reenquadrar a cada ciclo daria um tranco de 30 em 30 segundos enquanto um
técnico anda pela mesma quadra. O que precisa de correção é o ponto que o
operador **não consegue ver**.

Cenários verificados com a vista real da coluna: tela aberta vazia → enquadra ·
técnico entra fora da vista → reenquadra · mesmo técnico andando dentro da
vista → **não** mexe · depois do gesto → nunca mais mexe · mapa recriado →
volta ao automático.

### 2026-09-01 · O chamado novo leva o mapa até ele, e abre um balão

Pedido do Pedro: *"qnd tiver uma questão com um condomínio além dele mudar de
cor, a tela focar nele, e dele sair um balão com as informações"*.

**Metade já existia.** `_vistos` (no `render()`) compara a fila deste ciclo com
a do anterior desde sempre — é o que destaca o item recém-chegado na lista. O
gatilho de "questão nova num condomínio" estava pronto; só não chegava no mapa.
Agora o mesmo conjunto vira `_novos` e o mapa lê dali.

**O foco.** `flyTo` até o prédio, `ZOOM_FOCO` 13 — o mesmo teto do
`enquadrarMapa`, porque um zoom a mais cola no prédio e varre a vizinhança da
tela, e a pergunta que o mapa responde ("quem pode ir") é sobre o que está em
volta. O voo é o que faz o operador **perceber** que a tela se moveu; um salto
instantâneo desorienta quem estava olhando outra região. Em
`prefers-reduced-motion`, `setView` seco.

⚠️ **ISTO PASSA POR CIMA DO `_operadorMexeu`, e é a única coisa que passa.** O
gesto do operador trava o reenquadramento do ciclo de 30s porque aquilo é ruído
do sistema; um chamado novo é o evento mais importante que a tela tem. A
concessão é limitada: interrompe uma vez, quando o chamado nasce, e nunca mais.

⚠️ **Um alvo, não vários.** Se entram três no mesmo ciclo, foca no mais urgente
— `DADOS.fila` já vem ordenada pelo SLA que estoura primeiro, então o primeiro
que casar é ele. Focar em três é não focar em nenhum; os outros seguem pinados
e na fila, onde já eram visíveis.

⚠️ **Na abertura da tela não foca em nada**, de propósito: `_vistos` é `null` no
primeiro ciclo e `novos` sai vazio. Um painel que acabou de carregar com cinco
chamados abertos não pode dar zoom em coisa velha antes de o operador olhar a
fila. Esse comportamento já estava codificado — só passou a ter consequência.

**O balão.** `L.popup` standalone, **não** `bindPopup`. ⚠️ O `bindPopup`
registra o próprio handler de clique no marcador, e o pino de chamado já tem um
(`dlgDespacho`): os dois disparariam juntos, e a regra da tela — *"clique no
pino abre o mesmo diálogo de despacho"* — viraria "abre duas coisas". Com o
popup solto, o clique continua sendo só o despacho e o balão é exclusivamente
automático.

⚠️ **Ele abre ANTES do voo**, ancorado na coordenada, e viaja junto. Abrir no
`moveend` teria um buraco: `flyTo` para um ponto onde o mapa já está não dispara
evento nenhum, e o balão simplesmente não apareceria. `autoPan:false` porque
quem enquadra é o voo — os dois juntos brigam pelo centro.

⚠️ **O balão sobrevive ao ciclo de 30s** (não vive no `_pinos`, que é limpo a
cada volta), mas `_sincronizarBalao` não o deixa congelar: o relógio dentro dele
continua correndo, e um chamado que saiu da fila fecha o balão em vez de seguir
oferecendo "Despachar". Fechado pelo operador, fica fechado — o ciclo seguinte
já não o considera novo.

**Visual:** mesma construção do `.pin-rot` (marinho, fio de 1px, chanfro, raio
zero), com o `.selo` da fila e o mesmo `data-s` — o balão não inventa
vocabulário, reposiciona o que a lista já diz. A descrição corta em duas linhas:
ela existe aqui para reconhecer o caso, não para lê-lo. O relógio pinta pelo
grau, e só atrasado/apertado acendem (Regra do Crítico Silencioso).

O botão "Despachar" do balão funciona em tela cheia sem nada novo: `abrirFundo`
já usa `<dialog>` + `showModal()`, que põe o diálogo no **top layer**.

Verificado por execução (não só `node --check`, que não pega crase mal fechada
em template literal): `_balaoChamado` renderiza nos três casos — P1 atrasado sem
técnico, P3 folgado com técnico, e sem SLA nem condomínio — sem vazar
`undefined`. `_chamadoParaFocar` passa nos cinco: `_novos` nulo · nenhum novo ·
um novo · dois novos (pega o mais urgente) · novo sem coordenada.

Sem migration e sem endpoint novo — nada a bumpar no `sw.js`.
`operador.css` 73 → **74**, `operador.js` 69 → **70**, nos três HTMLs (as três
entregas de hoje saem no mesmo bump).

### 2026-09-01 · A tela de login do app troca o âmbar pelo Chapa

O app do técnico abria numa tela que não se parecia com nada: cartão escuro
centrado, âmbar `#f0b014`, filete HUD animado no topo, anel de varredura no
splash. O comentário no `index.html` dizia "visual idêntico ao site" e estava
desatualizado desde **25/08**, quando o `/login` foi redesenhado. Pedido do
Pedro: "colocar a tela de login do app igual à do PWA".

**Só o visual — o mecanismo não mudou, e isso foi escolha dele.** O app segue
pedindo **e-mail e senha juntos** no `POST /auth/login`. O PWA hoje pergunta só
o e-mail e deixa o `/auth/metodo` decidir se mostra senha (equipe) ou dispara
`/auth/codigo` (síndico). Consequência conhecida e aceita: **o app não chama
`/auth/codigo`**, então quem não tem senha continua sem entrar por ele. Hoje
isso não atinge ninguém — produção não tem nenhum usuário `cliente` (1 admin,
2 gerentes, 1 operador, 4 técnicos, todos com senha) —, mas abre no dia em que
o primeiro síndico for cadastrado. O `abrirTelaCliente()` já existe no app,
esperando por gente que não consegue chegar nele.

**Arquivo próprio, não sobrescrita.** `app/public/login.css` (novo, ~19 KB) é o
porte do `public/login.css`, e os 281 blocos de auth saíram do `app.css`. Tudo
escopado em `.screen-auth`: os tokens do Chapa **não** vão para o `:root`, ou o
marinho vazaria para as telas do técnico logo depois do login. O resto do app
continua Mission Control âmbar.

⚠️ **Quatro adaptações que o porte exigiu, e o porquê de cada uma:**

- **Sem `color-mix()` e sem `clamp()` de fonte.** Isto roda no WebView do
  aparelho, não num Chrome atual: `color-mix` só existe do Chrome 111 em
  diante e, num WebView velho, a declaração inteira cai — o anel do botão
  secundário sumiria sem nenhum outro sintoma. Valores literais e medidos.
- **Caminhos relativos.** No APK a origem é o esquema do Capacitor
  (`https://localhost`), não o servidor: um `/static/...` daria 404 mudo —
  fonte sem erro visível, foto sem imagem.
- **`:active` junto de `:hover` no varrimento do botão.** O gesto do amarelo
  entrando pelo chanfro é o único momento de movimento da tela, e `:hover` não
  dispara em toque: sem isso ele nunca tocaria no aparelho onde roda.
- **Layout empilhado, sem o grid de duas colunas.** A superfície é sempre um
  celular; carregar o layout de 861px seria fidelidade ao arquivo, não à tela.

⚠️ **A frase da faixa da marca NÃO foi portada, e é decisão, não esquecimento.**
No PWA ela diz "O nível dos **seus** reservatórios..." — escrita para o
síndico, dono do prédio. Quem abre este app é o técnico: os reservatórios não
são dele. Uma frase para ele é copy nova, que é decisão do Pedro. Sem frase, a
faixa faz o que o próprio `login.css` do PWA diz que ela faz no celular:
identifica.

⚠️ **`showAlert()` faz `el.className = "alert " + tipo`** — apaga a lista de
classes inteira. A caixa de erro do Chapa teve de pegar por `.alert` sozinho;
qualquer classe extra permanente nela sumiria no primeiro erro.

**Um defeito de contraste corrigido só aqui:** o placeholder do PWA é
`color-mix(--tinta-2 62%, transparent)` sobre branco = **3,11:1**, abaixo do
piso de 4,5:1. No app virou `#6b7693` (78%), que dá **4,53:1** e continua bem
distante do valor digitado (8,1:1). **O PWA segue com o defeito** — mexer nele
é outra tarefa.

**Alvo de toque:** o link "Fale com a gente no WhatsApp" media 39px como link em
linha corrida. Cresceu por `padding: 11px` com `margin: -11px` devolvendo o
espaço ao parágrafo — o desenho não muda, muda a área que aceita o dedo. É o
link de quem já não está conseguindo entrar.

**Verificado renderizando**, a 390×844 e 360×640, lendo valores computados e
`innerText` — não screenshot: sem rolagem horizontal, foto e as duas fontes
carregando (200, não 404), h1 15,6:1 · subtítulo 6,8:1 · campo 18,6:1 ·
placeholder 4,53:1, e todo alvo de toque ≥ 44px. Os únicos 404 são
`/app/manifest.json` e `/static/favicon.png` — caminhos absolutos do `<head>`,
**anteriores a este trabalho**, que só resolvem quando o Express serve o app em
`/app`. No APK empacotado eles falham; não foi mexido.

Detector da skill: dois achados, os dois falso positivo. A faixa listrada de
6px é a assinatura de limite do Chapa (a mesma da base do hero da landing), não
"borda de destaque em card"; e os 23 travessões estão em **comentários** de
HTML, não na copy — a copy visível não tem nenhum.

**Nada de backend, nada de migration, nada a bumpar no `sw.js`** — o app não
registra service worker. **Só chega no técnico com APK novo:** 5,8 → **6,17 MB**
(as duas fontes, 214 KB, e a foto, 215 KB).


### 2026-09-01 · A tela de fim de O.S. para de oferecer o que não faz sentido

Relato do Pedro: depois de finalizar a O.S. no app sobra o botão "Baixar PDF",
que ele não quer, e **"lá embaixo confirmar e finalizar O.S., que é um botão
que não faz sentido já que já foi finalizado, inclusive acho que nem
funciona"**. O palpite estava certo, e a causa é mais boba do que parece.

**A causa: `querySelector` pega o primeiro do documento.** `mostrarOSSucesso()`
fazia `document.querySelector(".td-cta-bar").style.display = "none"`, mas
existem **duas** `.td-cta-bar` no `index.html` — a da tela de detalhe do chamado
(`#tdCtaBar`, linha 376) vem antes da tela da O.S. (linha 435). A linha
escondia a errada. E como a errada já é `[hidden]`, e `[hidden]` é
`display: none !important` (`app.css:96`), a linha **não fazia absolutamente
nada**: a barra de finalizar continuava na tela de uma O.S. já finalizada.

E ele não funcionava mesmo: tocar nele chamava `finalizarOS()` de novo, e o
`POST /ordens-servico/:id/finalizar` recusa uma O.S. já fechada — o toque só
produzia mensagem de erro.

**Um terceiro defeito da mesma família, que ninguém tinha relatado.** A mesma
função esconde o card do timer/progresso (`document.querySelector(".os-shell
.td-card")` — esse seletor está certo), e **nada nunca o restaurava**. Depois
de finalizar uma O.S., **todas as seguintes abriam sem timer e sem barra de
progresso** até o app ser reaberto.

**A correção não foi só trocar o seletor.** As duas peças moram no
`index.html` e são reusadas por toda O.S.; restaurá-las no handler do "Voltar
pra minha lista" não bastava, porque o cabeçalho tem uma **segunda porta** (a
seta `#osBack`) — quem saísse por ela abriria a O.S. seguinte quebrada. O
restauro foi para a **entrada** (`abrirFormularioOS`), onde nenhuma rota de
saída o contorna. A barra ganhou `id="osCtaBar"`, que mata a ambiguidade de vez.

**O botão de PDF saiu** a pedido do Pedro. A função `baixarPdfOS()` **ficou**,
sem chamador e marcada como tal: ela carrega a integração nativa de
salvar/compartilhar (Filesystem + Share do Capacitor), que não é trivial de
reescrever, e religar é uma linha. Apagar de vez é decisão dele.

**Verificado exercitando o fluxo** em `?demo=tecnico` (sem rede), a 390×844, nos
quatro passos: O.S. aberta (barra e timer visíveis) → finalizada (as duas
somem, sem botão de PDF, "Voltar pra minha lista" no lugar) → **saída pela seta
do cabeçalho, não pelo botão** → O.S. seguinte (barra e timer de volta). Zero
erro de JS; os únicos 404 são `/app/manifest.json` e `/static/favicon.png`,
anteriores a este trabalho.

**Sem backend, sem migration, nada no `sw.js`.** Só chega no técnico com APK
novo — 6,17 MB, gerado e conferido por dentro.

### 2026-09-01 · O app do técnico entra no Chapa (etapa 1: paleta + lista de chamados)

Pedido do Pedro, depois de eu abrir o app no navegador ao lado dos painéis:
"trazer o front do app próximo a eles". As telas de cliente do app **saíram do
escopo** — ele confirmou que não existem em uso.

**Etapa 1 de 4.** Esta entrega faz duas coisas: remapeia os tokens do `:root`
(o que move o app **inteiro** de paleta de uma vez) e recompõe a **lista de
chamados**, que é a porta de entrada e onde moram as peças reusadas pelo resto.
Faltam: detalhe do chamado (2), formulário da O.S. (3), Conta e Roteiro (4).

Arquivo próprio: `app/public/tecnico.css`, carregado depois do `app.css` e do
`login.css`. Mesmas restrições do porte do login (sem `color-mix`, caminhos
relativos, `:active` junto de `:hover`).

**Três defeitos estruturais corrigidos, e nenhum era de paleta:**

1. **A barra colorida de 3px na lateral do item** — o padrão "side-tab", o tell
   que o detector da skill marca e que o Chapa não usa em superfície nenhuma.
2. **A prioridade existia SÓ COMO COR.** O filete e o tom do ícone eram os
   únicos portadores de P1/P2/P3/P4 — nenhum texto dizia. A regra do DESIGN.md
   é que estado nunca aparece sem rótulo escrito; a cor é reforço, nunca a
   informação. Virou selo com "P1" escrito.
3. **Categoria e status preenchidos lado a lado.** Categoria é classificação,
   não estado, e nunca preenche (Regra do Selo). Virou etiqueta gravada;
   status virou selo de fio; só a prioridade preenche.

**O placar de 4 números saiu** (autorizado pelo Pedro). Dois deles — "Abertos"
e "Fechados hoje" — eram repetição literal dos contadores das abas 40px abaixo
(Hoje · Próximos · Histórico). É o mesmo padrão que saiu do painel do operador
em 31/08, pelo mesmo motivo. "Críticos", o único que não se repetia, virou uma
linha que **só existe quando há crítico** e diz o que fazer: "1 chamado crítico
esperando".

⚠️ **A faixa do ROTEIRO usa a mesma classe e NÃO saiu.** Lá os números são
Prédios · Serviços · Atrasadas · Em curso, que não se repetem em lugar nenhum
da tela — não é o mesmo defeito. A regra de esconder foi escopada em
`#tcKpiGrid`, não em `.tec-kpi-strip`. Decidir o Roteiro é a etapa 4.

**O item virou duas colunas:** a RÉGUA (prioridade + distância) e o CORPO. É a
gramática do item do operador comprimida para 390px — a régua responde às duas
perguntas de quem está com a van na rua. O ícone de prédio saiu: toda linha é
um condomínio, então ele não distinguia nada e custava 44px de uma tela de 390.

⚠️ **Três armadilhas de especificidade, todas encontradas na tela:**

- **`.ch-row-mob[data-pri="p1"]::before` (0,2,1) vencia a chapa de duas camadas
  da folha nova (0,1,1)** e pintava o ITEM INTEIRO de vermelho/âmbar — eu
  reusei o mesmo pseudo-elemento que antes era o filete de 3px. Conserto:
  remover os 163 blocos superados do `app.css`, não brigar por especificidade.
- **`#tcRefresh` era o único seletor por ID da tela** (1,0,0) e vencia
  silenciosamente a regra de classe: o botão ficava com a caixa arredondada do
  Mission Control e alvo de 30px numa tela toda em 44.
- **Remapear `--font-mono` para Martian Mono transbordou o cabeçalho da O.S.**
  em 22px de uma tela de 375, cortando o selo de andamento. Martian Mono é bem
  mais largo, e o token é usado por regras de telas que ainda não foram
  recompostas. `--font-mono` ficou como estava; Martian entra por `var(--mono)`,
  peça por peça, onde a largura já foi medida. **Diagnosticado desligando a
  folha nova no navegador e remedindo** — com ela `+22px`, sem ela `-19px`.

**Verificado no navegador a 390px** (`?demo=tecnico` dentro de um `<iframe>`,
porque o Chrome desta máquina não obedece resize — nota do `active-work.md`),
lendo valores computados: título 14,4:1 · endereço 7,7:1 · mono 5,2:1 · selos
preenchidos 6,3 a 10,8:1; nenhum alvo abaixo de 44px; sem rolagem horizontal; e
**nenhum transbordo de cabeçalho em nenhuma das três telas** (lista 0, detalhe
−132, O.S. −19, idêntico ao estado sem a folha).

Detector: só o aviso de travessões, que estão em **comentários** de HTML — a
copy visível não tem nenhum.

**Sem backend, sem migration, nada no `sw.js`.** APK 6,17 MB, gerado e
conferido por dentro.


### 2026-09-01 (2ª rodada) · O app do técnico fecha no Chapa — e a placa é clara

Continuação da etapa 1. Entraram as etapas 2, 3 e 4 (detalhe do chamado, O.S.,
Conta e Roteiro) e um passe de polimento. **No meio do trabalho o Pedro mandou
a tela de orçamentos do cliente como referência** — *"leve em consideração esse
tipo de tela, com palavras em amarelo, e campos brancos"* — e isso corrigiu a
direção.

⚠️ **A CORREÇÃO QUE VALE MAIS QUE O RESTO DESTA ENTRADA.** As etapas 1 a 4
tinham montado **placa escura sobre campo escuro**. Está errado, e o DESIGN.md
já dizia: *"o marinho é tratado como MATERIAL, não como fundo: a tela é o campo,
e as superfícies claras são PLACAS POUSADAS sobre ele para os trechos de leitura
densa."* O `.orc-item` do `cliente.css` faz exatamente isso — `--chapa` de
fundo, anel `inset 1px --fio-esc`, chanfro de 14px, tinta `--tinta`, selo
amarelo preenchido com tinta marinho. Eu tinha lido a regra como "escureça
tudo". Item da lista, cards do detalhe, seções da O.S. e cards do Roteiro
viraram placa clara.

**O mecanismo da placa clara:** ela **redeclara os tokens de tinta
localmente**. Como as regras de dentro usam `var(--text)`, `var(--muted)` etc.,
elas viram tinta escura sozinhas — sem caçar cor por cor em cinquenta
seletores. É a "Regra do Preenchimento Cru" do operador, e a contrapartida dela
importa: **fundo de selo usa o token CRU** (`--amarelo`, `--vermelho`,
`--verde`, que não flipam, para preencher com tinta marinho por cima) e **texto
e borda usam o semântico** (`--risco`, `--ok`, `--warn`, `--accent`, que flipam
para a família `-t`, porque sobre claro nenhum sinal saturado passa contraste
como texto — Regra do Amarelo Cego). Sem essa separação o selo P4 ficaria
`#414f74` sobre `#414f74`.

**A palavra em amarelo.** O segundo pedido. Uma por tela, e só sobre o campo
marinho — sobre placa clara o amarelo não é tinta. O único lugar da lista onde
uma frase é o conteúdo é o estado vazio: *"Você está **em dia**"*. Junto, a
linha de apoio **deixou de ser âmbar**: com a palavra da manchete em amarelo,
dois acentos na mesma tela matam o primeiro.

**Emojis viraram ícones** (pedido do Pedro, e a skill proíbe emoji fazendo papel
de ícone). Saíram 📍🔥🕒 dos rótulos de ordenação, o ⚠ do aviso de desvio do
Roteiro e o ✓ do botão de confirmar assinatura.
⚠️ **O ícone de ordenação teve de sair de dentro do `<select>`**: um `<option>`
aceita só texto, não SVG. Virou peça própria ao lado do campo.
⚠️ **E a junta dos ícones foi endireitada de uma vez.** O Chapa é chapa de aço
cortada — ponta reta, canto vivo. Os SVGs do app vinham com
`stroke-linecap="round"` como **atributo**, e atributo de apresentação perde
para CSS: uma regra endireitou os oitenta ícones sem editar nenhum.

**Outros achados corrigidos no caminho:**

- **O botão "A caminho" era estilo INLINE** (azul a 20%, borda e cor), aplicado
  pelo `app.js`. Inline vence qualquer folha — o botão ficava fora do sistema e
  não havia como tematizá-lo. Virou a classe `.btn-caminho`, com o mesmo papel
  (fase 1 pesa menos que a fase 2, que é a amarela).
- **`opacity: .5` no botão desabilitado deixava o CTA ilegível.** Sobre marinho
  o amarelo a 50% vira oliva e a tinta some — justamente quando o rótulo mais
  importa ("Confirmar e finalizar O.S." é o que diz o que falta alcançar).
  Virou anel amarelo apagado + interior marinho + tinta clara: **9,6:1**,
  obviamente inativo e ainda legível. WCAG isenta controle desabilitado; quem
  usa isto é gente mais velha numa casa de máquinas mal iluminada.
- **`.tc-empty-sub` tinha `!important` no `app.css`** — colocado para vencer
  `.tc-empty p` (0,1,1), que tem especificidade maior que `.tc-empty-sub`
  (0,1,0). Remédio errado para problema de seletor. Resolvido com
  `.tc-empty p.tc-empty-sub` (0,1,2), sem `!important`.
- **O tique âmbar de 2px à esquerda dos cabeçalhos de seção** (`.cardHead
  ::before`) saiu — o mesmo "side-tab" que saiu do item na etapa 1.
- **A barra do reservatório seguia a Regra da Água Visível**: era um gradiente
  verde→amarelo→vermelho por faixa, contando a mesma história duas vezes (cor
  e comprimento) e gastando o vermelho num estado que ainda não é emergência.
  Agora a lâmina abre em `--agua` e só escurece para vinho no **crítico**; no
  **baixo** a água continua azul e quem avisa é a crista âmbar.
- **O timer da O.S. NÃO virou placa clara**: ele é instrumento, e instrumento
  neste sistema é sempre marinho fundo. É o único bloco escuro da tela da O.S.,
  e é isso que faz o tempo saltar.
- **Cabeçalho da O.S. transbordava 9px a 360px** — número da O.S. mais selo de
  andamento. Passaram a quebrar em duas linhas.

**Verificado no navegador**, 4 telas × 2 larguras (390×844 e 360×640), lendo
valores computados: sem rolagem horizontal, nenhum cabeçalho transbordando,
nenhum alvo de toque abaixo de 44px, zero erro de JS e nenhum 404 novo. Sobre a
placa clara: título 15,6:1 · endereço, id, categoria, status e meta 6,8:1 ·
selos preenchidos 8,1 a 10,8:1 — nada abaixo do piso. Detector da skill:
**zero achados**.

⚠️ **Sobraram emojis em três lugares, todos FORA do fluxo do técnico**: o 👋 e
o ✓/✗ da tela `home` (o placeholder de admin/cliente) e o 📄 e o ✓ das telas
`cliente-*`. Saem junto com a remoção dessas telas, que continua pendente.

**Sem backend, sem migration, nada no `sw.js`.** APK 6,19 MB.


### 2026-09-01 (3ª rodada) · "Mais próximos" mentia, e o menu dele era branco no branco

Três defeitos no mesmo controle, achados a pedido do Pedro ("veja a
funcionalidade e a visibilidade do 'mais próximos'") mais um que ele viu na
tela.

**1. O rótulo mentia — e era o caso comum, não a exceção.**

`ordenarChamados` tinha `if (TC.sort === "proximidade" && TC.geo)`. **Sem
`TC.geo` o código caía no `else` final, que é o ramo da ordenação POR DATA.** O
controle dizia "Mais próximos", a lista vinha por mais recente, e nada avisava.
"proximidade" é o padrão do app.

Não é caso de canto: o GPS **só opera das 8h às 18h** (`gpsDentroDoHorario`),
então toda abertura fora do expediente caía nisso — e também toda abertura sem
a permissão concedida, que hoje é quase todo aparelho (o roadmap registra que
só o técnico de teste tem a permissão correta).

O ramo virou explícito e a queda passou a ser para **prioridade**, não data:
data é ordem arbitrária para quem está com a van na rua; prioridade é a ordem
operacional. `TC.ordemReal` registra o que foi de fato aplicado — `TC.sort`
continua sendo o que foi **pedido**.

⚠️ **E a tela passou a dizer.** `#tcAvisoOrdem` aparece só quando o pedido não
pôde ser cumprido: *"Sem GPS · ordenado por prioridade"* + **"Tentar de novo"**.
É **botão**, não texto: o erro tem conserto (`obterGPS({force:true})` — `force`
porque o cache de 5 minutos faria o toque não fazer nada visível), e a regra é
que aviso nomeia o problema **e** a saída. Fora do expediente o texto muda e o
botão desabilita, porque ali tocar não resolveria.

⚠️ **O aviso é renderizado DEPOIS de `ordenarChamados`, nunca antes** — é ele
que define `TC.ordemReal`. Chamado no topo do render, mostraria o resultado da
renderização anterior e ficaria um passo atrás a cada troca.

**2. O menu do `<select>` era branco sobre branco.** Achado do Pedro. O app
**nunca estilizou `<option>` e não declarava `color-scheme` em lugar nenhum**:
o menu nativo é pintado claro pelo sistema enquanto as opções herdam a cor
quase-branca do `<select>`. Abria e não se lia nada. **Defeito antigo, não
regressão do redesenho** — já era assim no âmbar.

⚠️ **Não dá para resolver só com `color-scheme: dark` na raiz.** O app tem
`<select>` nos dois campos: os de ordenação vivem sobre o marinho (menu
escuro) e o `.os-select` da O.S. vive **dentro da placa clara** (menu claro).
Um `color-scheme` global acertaria um e quebraria o outro — trocaria branco
sobre branco por escuro sobre escuro. Cada select declara o seu, e as `option`
levam cor explícita em vez de herdar. Agora **16,4:1**.

**3. O controle não parecia um controle.** Texto solto com um chevron, corpo de
10,5px em mono, sem fundo nem contorno — e é ele que decide a ordem da rota do
dia. Ganhou a mesma peça dos outros campos: chanfro, anel de fio e alvo de
44px. O chevron era um data-URI com `stroke='%237a7e9c'` (cinza fixo do Mission
Control, que não acompanha a paleta) e ponta arredondada; foi redesenhado no
tom da paleta e com junta reta.

**4. A barra amarela do menu inferior estava descentralizada.** Achado do
Pedro, e o erro era meu.

⚠️ **A LIÇÃO: numa sobrescrita de pseudo-elemento, o que você não redeclara
continua valendo.** O `app.css` já centrava a barra com
`transform: translateX(-50%)`. A regra nova sobrescreveu `left`, `width` e cor
e acrescentou `margin-left: -13px` — mas **não zerou o transform**. A barra
levou os dois deslocamentos (−13 de margem −13 de transform) e saiu **uma
largura inteira** à esquerda do ícone.

⚠️ **E a minha medição não pegou**, o que é a parte que interessa: eu conferi
`left` e `margin-left`, somei, deu centrado, e concluí que estava certo — sem
olhar o `transform` herdado. Quem viu foi o Pedro, na tela. Medir só as
propriedades que você escreveu não mede nada; **a verificação passou a somar
`left + margin-left + transform` e comparar com o centro do ícone**.

**Verificado**, 4 telas × 2 larguras: sem rolagem horizontal, sem cabeçalho
transbordando, nenhum alvo < 44px, barra do nav com **0px de desvio**, menu do
select com fundo explícito, zero erro de JS. Detector: **zero achados**.
APK regerado.


### 2026-09-01 (4ª rodada) · A O.S. preenchida no subsolo para de evaporar

Pergunta do Pedro: dá para terminar a O.S. sem internet e o app enviar quando o
sinal voltar? "muitas vezes a O.S. é feita em subsolo ou lugares com o sinal
ruim". A resposta era **não — e pior que não: o app perdia o que já tinha sido
digitado.** Esta entrada é a **etapa 1** do conserto: parar de perder.

**O defeito, exato.** Em `_osEnviarPatchPendente` a linha
`OS.pendingPatch = null` rodava **antes** do `try`. Quando o PATCH falhava por
falta de sinal, o patch acumulado era **descartado** — não havia fila nem
repetição. E nada gravava rascunho no aparelho: o `Storage` do app só guardava
token, usuário e device token. O que o técnico digitava vivia **só em memória**,
e `sairFormularioOS` zera `OS.data` — sair da tela ou o Android matar o app em
segundo plano levava a O.S. inteira. Ele refazia do zero.

**O conserto.** O patch pendente passa a ser gravado em `localStorage` por id de
O.S. (`gb_os_rascunho_<id>`) **antes** de tentar a rede — é o disco que garante,
não o servidor. Ao falhar, o patch **volta** para `OS.pendingPatch` (com o que
chegou durante o voo por cima, que é mais novo). Ao reabrir a O.S., o rascunho é
aplicado **por cima** do que o `GET` devolveu, antes do render, e sobe sozinho.
Sai de cena quando o servidor confirma, e quando a O.S. é finalizada.

⚠️ **"Sem sinal" deixou de ser erro vermelho.** Antes cada campo digitado offline
pintava um alerta de falha. Isso é estado, não erro do técnico — e quem trabalha
em subsolo veria vermelho o dia inteiro, o que ensina a **não olhar** o aviso que
importa. Virou uma linha âmbar entre o timer e as seções: "Salvo no aparelho ·
envia quando o sinal voltar".

⚠️ **MAS ERRO DO SERVIDOR CONTINUA VERMELHO — e essa distinção não existia.**
O `api()` estourava o mesmo `Error` para falha de rede e para recusa HTTP, então
não dava para separar "vale tentar de novo" de "vai recusar igual". Guardar um
400 numa fila seria uma repetição infinita silenciosa. Agora o `api()` marca
`err.httpStatus` nas respostas do servidor; o `fetch` estoura `TypeError` quando
não há rede e nem chega lá, então **a ausência de `httpStatus` é o sinal de falha
de rede**. Rede → guarda e reenvia; servidor → mostra.

⚠️ **A assinatura é o único campo grande, e é a primeira a sair se a cota
estourar.** `assinatura_b64` (data URL do canvas) passa pelo mesmo auto-save, e
`localStorage` tem ~5 MB. Se a gravação falhar, o rascunho é regravado **sem a
assinatura** e a reabertura avisa para refazê-la: perder a assinatura e manter o
formulário é muito melhor que perder os dois — e quem redesenha é o cliente, que
ainda está na frente do técnico.

⚠️ **O auto-save no debounce precisava de `.catch()`.** `_osEnviarPatchPendente`
relança de propósito (o `finalizarOS` aborta com isso antes de fechar a O.S.),
mas o caminho do debounce não capturava: cada campo digitado sem sinal virava uma
promessa rejeitada sem tratamento. Apareceu no teste, não na leitura.

**Verificado exercitando a rede caindo e voltando** (não no modo demo — o demo
curto-circuita justamente este caminho): O.S. aberta com rede → rede cai → três
campos preenchidos → os três no rascunho e na fila, linha de estado visível, **sem
alerta vermelho** → **app fechado e reaberto** → rascunho sobreviveu, os três
campos voltam na tela, um único PATCH leva os três, rascunho apagado, linha some.
E um quarto caso: PATCH recusado com 400 **aparece em vermelho** e não vira fila.
Layout conferido nas 4 telas × 2 larguras, sem regressão.

⚠️ **O QUE ESTA ETAPA NÃO COBRE**, e o técnico precisa saber: **fotos e o envio
da assinatura continuam exigindo rede no momento do toque**, e **finalizar a O.S.
continua exigindo rede**. Fotos vão em base64 e não cabem em `localStorage` —
exigem IndexedDB e envio uma a uma (etapa 2). Finalizar offline exige backend: o
`POST /:id/finalizar` grava `finalizada_em = NOW()`, então uma O.S. terminada às
14h no subsolo e sincronizada às 17h ficaria registrada como 17h — e isso alimenta
o `tempo_resolucao_seg`, que é o SLA (etapa 3).

Sem migration. Só chega no técnico com APK novo.


### 2026-09-01 (5ª rodada) · A foto e a assinatura do subsolo entram na fila (etapa 2)

Pergunta do Pedro depois da etapa 1: *"no final de todas as etapas meu pedido vai
ser realizado, ou vamos continuar perdendo assinatura e foto?"* — e ela obrigou
duas correções ao que eu mesmo tinha dito, além desta etapa.

**Correção 1: eu exagerei o risco da assinatura.** Ela é um PNG do canvas de
~120 KB (o próprio código anota isso), contra ~5 MB de cota do `localStorage` —
**3%**. Na etapa 1 ela sobrevivia normalmente; o descarte que programei era uma
rede de segurança para cota já cheia, não o caminho comum. Apresentei como
rotina e não era.

**Correção 2: a etapa 2 precisava ser maior do que eu descrevi.** Eu tinha dito
"fila de fotos"; o certo é **mover para o IndexedDB tudo que é grande** — fotos
E assinatura. É isso que faz o problema de cota desaparecer em vez de ficar
administrado.

── DOIS ARMAZÉNS, POR DURABILIDADE ──────────────────────────────────────

| | O quê | Por quê |
|---|---|---|
| `localStorage` | campos | escrita **síncrona**: quando `setItem` retorna, já gravou. O Android mata o app sem avisar e os campos mudam a cada tecla |
| IndexedDB (`gb_os`) | assinatura, fotos | assíncrono, mas cabe muito mais que 5 MB. Peças grandes e raras |

Não é organização, é durabilidade: para o que muda a cada tecla, a gravação
instantânea vale mais que o espaço; para o que é grande e raro, o contrário.

── A FILA DE FOTOS ──────────────────────────────────────────────────────

A foto tirada sem sinal vai para o IndexedDB e **aparece na tela marcada como
"na fila"**, com um id **local** (`loc_…`). Antes ela era descartada com um
alerta vermelho, e o técnico tinha de voltar ao local para fotografar de novo —
quando dava.

⚠️ **Mostrar a foto pendente não é enfeite.** Escondida, o técnico tira de novo
achando que perdeu, e a O.S. termina com a mesma foto duplicada.

⚠️ **`Number(card.dataset.fotoId)` quebraria tudo.** O id local é string;
`Number("loc_…")` é `NaN`, o filtro não removeria nada e o DELETE iria para
`/fotos/NaN`. A comparação passou a ser por string, e `_ehFotoLocal(id)` decide
entre tirar da fila e chamar o servidor.

⚠️ **Uma foto por vez, nunca em lote.** Cada uma vai em base64 no corpo do POST
e o `express.json` corta em 8 MB (CLAUDE.md). O laço **para no primeiro erro de
rede**, o que também preserva a ordem em que foram tiradas. Recusa do servidor
(não de rede) tira a foto da fila e avisa — senão vira reenvio infinito.

⚠️ **`finalizarOS` descarrega a fila antes de fechar.** Finalizar exige rede de
qualquer forma; se ela está de pé, é a última chance das fotos subirem. Fechar
com foto na fila a deixaria órfã — o backend recusa envio em O.S. finalizada, e
o técnico teria fotografado à toa. Sobrando alguma, a finalização é **barrada**
com a contagem.

── VERIFICAÇÃO ──────────────────────────────────────────────────────────

Vinte checagens com a rede caindo e voltando de verdade: duas fotos e a
assinatura offline → as duas na fila do IndexedDB e visíveis como pendentes, a
assinatura no IndexedDB e **fora** do `localStorage` (o rascunho lá ficou com
**63 caracteres**), a linha de estado contando "2 fotos" → **app morto e
reaberto**, tudo sobreviveu → rede volta: fila esvazia, as duas chegam ao
servidor, a assinatura sobe no PATCH, os cartões deixam de ser pendentes, a
linha some, a assinatura sai do IndexedDB → apagar foto da fila **não** chama o
servidor → finalizar com foto na fila é **barrado** com a razão certa. Zero erro
de JS. Layout conferido nas 4 telas × 2 larguras; detector zerado.

── O BURACO QUE FICA (etapa 5, registrado no roadmap) ───────────────────

⚠️ **Se a O.S. for finalizada ou fechada do outro lado enquanto o técnico está
offline, a fila dele chega e não tem onde pousar** — o backend recusa edição e
envio de foto em O.S. finalizada. Hoje a foto sairia da fila com um alerta.
Precisa de caminho definido: ou o backend aceita sincronização atrasada, ou o
app mostra "isto não conseguiu subir" com o conteúdo à mão. É a diferença entre
"não perde" e "não perde nunca". Levantado pelo Pedro, não por mim.

⚠️ **E um limite que nenhuma etapa remove:** desinstalar o app ou limpar o
armazenamento leva o rascunho junto. É local, não é backup.

Faltam ainda a etapa 3 (finalizar offline — **exige backend**, por causa do
`finalizada_em = NOW()`) e a 4 (abrir a O.S. offline).

Sem migration. Só chega no técnico com APK novo.


### 2026-09-01 (6ª rodada) · O PWA parecia deslogar ao fechar, e a sessão estava lá o tempo todo

Relato do Pedro: *"estou fazendo login no painel de operador, fechando e quando
abro logo em seguida o PWA está na tela de login novamente"*. **Nada desconectava
ninguém.** O token seguia no `localStorage`, dentro da validade — a tela de login
é que nunca olhou para ele.

**Os dois fatos que se somam.** O `start_url` do manifest é lido **uma vez, na
instalação**, e até 31/08/2026 valia `/login` para todas as superfícies (o
`src/app.js` passou a gerar um por app via `?app=`, mas isso só vale para quem
instalar o ícone **depois** — e no iOS nem isso, porque lá o `start_url` é
ignorado em favor da página aberta na hora de instalar). Do outro lado, o
`login.js` só chamava `redirectByRole` **depois** de um POST bem-sucedido: não
havia nenhuma checagem de sessão no carregamento. Ícone antigo abre em `/login`,
`/login` desenha o formulário por cima de uma sessão viva.

⚠️ **O comentário do `src/app.js` afirmava o contrário** — *"com sessão válida o
/login redireciona sozinho"* — e era falso desde sempre. Foi escrito descrevendo
o comportamento pretendido, e ninguém conferiu: quem instala o PWA raramente é
quem lê essa linha. Agora é verdade, e o comentário passou a dizer isso sem
prometer o que o arquivo não faz.

**O conserto**: `public/login.js` decide no carregamento. Token no storage, `exp`
no futuro, `role` no `PAINEL_POR_ROLE` → `location.replace` para o painel, sem
pintar formulário nenhum. `replace` e não `href`: com `href` o botão "voltar" cai
no `/login`, que redireciona de novo, e o histórico vira parede.

⚠️ **AS DUAS GUARDAS SÃO CONTRA LOOP, e o loop é real:** login manda pro painel →
painel pede dado → 401 → painel manda pro login → login manda pro painel, para
sempre, com a tela piscando. Fecham o ciclo (1) o `motivo` na URL — quem chegou
com `?motivo=expirado` ou `?motivo=inatividade` foi mandado para cá de propósito
e vê o formulário com a mensagem, nunca um redirect — e (2) o `exp` lido do
próprio JWT, a mesma leitura que o `inatividade.js` faz do `iat`. Token vencido
não vai a lugar nenhum.

⚠️ **O carimbo de inatividade NÃO é conferido aqui, de propósito.** Repetir os 30
minutos e a chave `tg_ultima_atividade` no `login.js` criaria uma segunda cópia da
regra para alguém esquecer de mudar junto — o mesmo apodrecimento que o
`inatividade.js` evita concentrando o corte num arquivo só. Quem volta com o tempo
estourado é redirecionado, cortado antes de qualquer dado pintar e devolvido com
`?motivo=inatividade`: a mensagem certa, ao custo de um flash, e a guarda 1 impede
que vire ida e volta.

⚠️ **Cliente sem `condominio_id` no token fica no login** — mesma barreira que o
`redirectByRole` aplica depois do login. Mandá-lo ao painel seria trocar a tela por
um 403 (o vínculo pode ter sido removido depois de o token nascer).

**Verificado exercitando o arquivo**, não lendo: `login.js` carregado num contexto
com `localStorage`, `location` e DOM falsos, 14 casos, todos passando — operador,
admin e cliente com token vivo vão para o painel certo; token vencido, `?motivo=`
(os dois), storage vazio, token que não é JWT (`harness`), `admin_viewer` e cliente
sem condomínio **ficam** no login; o `?next=` do QR leva o técnico ao equipamento e
é ignorado para o cliente; o `?next=` de orçamento leva o síndico ao documento com
`?orc=`; e `next=//evil.com` continua barrado pela allowlist.

⚠️ **O que isto NÃO resolve:** o ícone instalado antes de 31/08 continua abrindo em
`/login` — agora ele apenas atravessa a tela em vez de parar nela. Reinstalar o PWA
pega o `start_url` certo e economiza o salto.

Sem migration. Bump de `login.js?v=8` no `login.html`.


### 2026-09-01 (6ª rodada) · A O.S. fecha no subsolo (etapa 3, migration 081)

Terceira das cinco etapas do trabalho offline, e a primeira que mexe no
**backend**. O técnico agora **finaliza** a O.S. sem sinal; ela sobe sozinha
depois. Com isso o pedido original do Pedro está atendido para o caminho
principal.

⚠️ **O HORÁRIO GRAVADO É O DO SERVIÇO, NÃO O DO ENVIO — e é aqui que estava o
risco real.** O `POST /:id/finalizar` gravava `finalizada_em = NOW()`, e o mesmo
`NOW()` fechava o chamado e calculava `tempo_resolucao_seg`. Uma O.S. resolvida
em 40 minutos no subsolo e sincronizada 3h depois entraria no **SLA como 3h40**.
Agora o app manda `finalizada_em` e o backend usa esse instante nos dois lugares.

**Migration 081 — `ordens_servico.sincronizada_em`** (+ índice parcial). NULL =
finalizada online; preenchida = o app mandou o próprio horário, e o valor é
quando chegou.

⚠️ **Por que a coluna precisa existir:** a partir daqui o `finalizada_em` vem do
**relógio do celular**, que pode estar errado. E `ordens_servico` **não tem
`atualizado_em`** — sem esta coluna não sobraria nem rastro indireto de que
aquele horário não veio do servidor. Ela é o que torna aceitável confiar no
cliente.

⚠️ **Horário inválido NÃO recusa o envio.** Sanidade: futuro além de 5 min, mais
velho que 7 dias, ou anterior à `chegada_em` → cai para `NOW()`. Recusar
deixaria o trabalho do técnico preso na fila do aparelho para sempre, que é o
pior desfecho possível. `sincronizada_em` é marcada mesmo no descarte, então a
auditoria vê que veio do app com horário rejeitado.

⚠️ **`$n` REPETIDO COM CAST EXPLÍCITO EM TODOS OS USOS.** O mesmo parâmetro é
valor de duas colunas na O.S. **e** entra num `EXTRACT` no UPDATE do chamado —
exatamente o `42P08 inconsistent types deduced for parameter` do CLAUDE.md, que
o Postgres recusa no PARSE, antes de olhar valor nenhum. `node --check` e UPDATE
manual não pegam: **a rota foi exercitada de verdade**, com Express, JWT de
técnico e fixtures criadas e removidas no banco de teste.

── NO APP ───────────────────────────────────────────────────────────────

⚠️ **ORDEM OBRIGATÓRIA: campos → fotos → finalizar.** O backend recusa `PATCH` e
envio de foto em O.S. já finalizada; inverter deixa as fotos órfãs.
`_osEnviarFinalizacaoPendente(osId)` faz as três e **recebe o id** em vez de
olhar `OS.data` — o técnico pode ter fechado três O.S. antes de o sinal voltar,
e nenhuma delas está aberta na tela. Por isso `_osSubirFotosDaFila(osId)` foi
separada da versão que atualiza a interface.

⚠️ **`finalizarOS` parou de abortar em falha de rede.** O auto-save estourando
sem sinal derrubava a finalização inteira — que é justamente o que o técnico do
subsolo precisava fazer. Agora só a recusa do **servidor** interrompe.

⚠️ **A tela de conclusão não mente:** enquanto está na fila diz "Guardada no
aparelho · envia sozinha", não "chamado fechado". O técnico juraria que enviou,
e é ele que responde quando o escritório não acha a O.S.

⚠️ **A lista marca "Aguardando envio" MESMO COM O `GET` FALHANDO**, e isso foi
achado no teste. A marcação estava dentro do `try` do carregamento: como é
justamente no subsolo que o `GET` falha, ela só apareceria quando já não fosse
necessária — e o técnico veria o chamado que acabou de fechar como "Em
atendimento", e refaria o serviço. Passou para o `finally`.

⚠️ **Reabrir a O.S. finalizada consulta a fila ANTES do `GET`** — depois não
funcionaria offline: ele receberia "erro ao carregar" numa O.S. que ele mesmo
fechou.

── VERIFICAÇÃO ──────────────────────────────────────────────────────────

**Rota** (Express + JWT + banco de teste, 15 checagens): finalização normal
deixa `sincronizada_em` NULL; offline de 3h atrás grava o horário do app em
`finalizada_em` e `saida_em`, marca `sincronizada_em`, e o
**`tempo_resolucao_seg` deu 3601s** — contando do chamado até o serviço, não até
a sincronização; relógio adiantado e horário anterior à chegada caem para
`NOW()` **sem recusar**; O.S. já finalizada continua recusada com 400.

**App** (rede caindo e voltando, 17 checagens): foto + campo + finalizar sem
sinal → tudo na fila, tela em modo pendente, nada no servidor; a lista marca
"Aguardando envio"; reabrir mostra a conclusão sem botão de finalizar; a rede
volta e a ordem observada foi exatamente **patch → foto → finalizar**, com o
servidor recebendo o horário do subsolo.

Layout conferido nas 4 telas × 2 larguras.

**Migration 081 aplicada em teste e em PRODUÇÃO** (01/09/2026), nessa ordem e
**antes** do deploy do código — que é a lição da Fase 7E: esta entrada escreve
em `sincronizada_em`, e o backend subindo antes da coluna existir quebraria
**toda** finalização, não só as offline.

Faltam a etapa 4 (abrir a O.S. offline) e a 5 (O.S. fechada do outro lado).


### 2026-09-01 (7ª rodada) · O app abre no subsolo (etapa 4) e a marca do cabeçalho lê

**Etapa 4 de 5.** O app já abria sem rede — é APK, o HTML vem do bundle — mas
**toda chamada de dado morria**: lista, detalhe do chamado, O.S. e equipamentos.
Quem descia sem as telas já abertas não trabalhava.

Agora as leituras passam por `apiComCache(path)`, que grava a resposta no
IndexedDB e, **só em falha de rede**, serve o que está guardado.

⚠️ **A PRÉ-CARGA É O QUE FAZ A ETAPA FUNCIONAR.** Cachear apenas o que ele já
abriu não resolveria nada: o problema é abrir, no subsolo, a O.S. que ele
**ainda não tinha aberto**. Depois de cada carga da lista **com rede**,
`_preCarregarParaOffline()` busca em segundo plano o detalhe de cada chamado
aberto (até 12) e, quando a O.S. já existe, ela e os equipamentos do prédio.
Roda solta e nunca derruba a lista.

⚠️ **A CHAVE DO CACHE É O PRÓPRIO CAMINHO**, e isso não é preguiça: chave
inventada à parte abre espaço para descasamento silencioso — a pré-carga
gravando em `chamado_12` e a leitura procurando `chamado_meus_12`, com o cache
existindo e nunca sendo encontrado. **Aconteceu comigo aqui**: pré-carreguei
`/chamados/:id` enquanto a tela lê `/chamados/meus/:id`. Com a chave derivada do
path, esse erro deixa de ser possível.

⚠️ **Só falha de REDE cai para o cache.** Um 403 ou 404 é resposta legítima do
servidor: servir dado velho ali esconderia, por exemplo, um chamado que deixou
de ser deste técnico. Está coberto por teste.

⚠️ **`IDB_VERSAO` SUBIU PARA 2, e sem isso nada funcionaria.** O
`onupgradeneeded` do IndexedDB só dispara quando a versão pedida é maior que a
gravada no aparelho — quem já abriu o app com a v1 **nunca ganharia o store
`cache`**. E a falha seria silenciosa: as escritas estouram numa transação para
um store inexistente, o `.catch()` engole, e o técnico simplesmente fica sem
cache, sem nada na tela dizendo isso.

⚠️ **Uma linha de aviso só, e ela prioriza.** Sem sinal os dois avisos são
verdadeiros — a lista veio do cache E o GPS não respondeu. Duas barras âmbar
empilhadas no topo não são o dobro do aviso, são metade da atenção: "você está
sem sinal" explica o outro, e o contrário não. Na O.S., os dois fatos (dado
guardado + coisa por enviar) são compostos num recado só, porque ao abrir
offline **sempre** há algo pendente — o próprio render dispara um save antes de
o técnico digitar.

⚠️ **O QUE A ETAPA 4 NÃO RESOLVE, e é preciso dizer:** **começar um atendimento
novo**. A O.S. nasce de `POST /chamados/:id/iniciar-atendimento`, e sem rede não
há como criar — todo o resto (rascunho, fotos, finalização) depende desse id.
Fazer isso offline exigiria id local e uma camada de reconciliação de ids. Na
prática: o técnico precisa tocar em **"Iniciar atendimento" enquanto ainda tem
sinal** (na rua, na portaria); dali para baixo tudo funciona.

**A marca do cabeçalho estava errada** (apontado pelo Pedro). Era o
`login-logo.png`, o lockup **com a assinatura** embaixo — 867×288, proporção
3:1: a 26px de altura a assinatura sai com ~5px e vira borrão. Virou
`logo-topo.png`, o wordmark (826×180, 4,6:1), nos 12 cabeçalhos. É a mesma
escolha que o `operador.html` já documentava — "a versão SEM a assinatura, que é
a que aguenta escala de barra". O lockup continua nas telas de entrada, onde
aparece grande. Saiu junto o `border-radius: 8px` que recortava os cantos da
marca.

**Verificado:** 20 checagens do fluxo offline (lista carrega com rede e
pré-carrega; app morto e reaberto no subsolo; lista, detalhe e **formulário da
O.S.** abrem do cache, com equipamentos; preencher continua guardando; e um 403
aparece em vez de dado velho). Mais 12 de regressão das etapas 1 a 3 depois do
refactor — a ordem de sincronização segue **campos → fotos → finalizar**. Marca
conferida no render: arquivo certo, 826×180, sem raio, cabendo na barra. Layout
nas 4 telas × 2 larguras.

**Sem migration** — a etapa 4 é só front. APK 6,4 MB.

Falta a **etapa 5**: a O.S. fechada do outro lado enquanto o técnico estava sem
sinal.


### 2026-09-01 (8ª rodada) · "Failed to fetch" ao abrir a O.S. no subsolo

Relato do Pedro testando a etapa 4: *"cliquei para preencher ordem de serviço sem
internet e deu failed to fetch"*. **Reproduzido e corrigido** — e a reprodução
achou um segundo defeito, este meu e ainda não visto por ninguém.

**A causa: a O.S. nasce DEPOIS da pré-carga.** A sequência real é

1. a lista carrega **com sinal** — e a pré-carga guarda o detalhe do chamado,
   que naquele instante está `aberto` e **sem O.S. nenhuma**;
2. o técnico toca **"Iniciar atendimento"** (ainda com sinal) e o
   `POST /chamados/:id/iniciar-atendimento` **cria** a O.S.;
3. ele desce para o subsolo;
4. toca "Preencher Ordem de Serviço" → `GET /ordens-servico/:id` → não está no
   cache, porque quando o cache foi montado a O.S. não existia.

A pré-carga estava certa; o que faltava era **guardar a O.S. no instante em que
ela nasce**, que é justamente quando o técnico ainda tem sinal — ele está na
portaria e vai descer. `iniciarAtendimento` passou a cachear a O.S. nova, o
detalhe atualizado do chamado e os equipamentos do prédio antes de devolver a
tela. Segurar o botão por mais um instante é barato perto de perder a O.S.

⚠️ **O SEGUNDO DEFEITO, ACHADO AO CONSERTAR O PRIMEIRO — E ERA MEU.** A lista faz
**polling a cada 30 segundos**, e eu disparava a pré-carga em **toda** carga
bem-sucedida. Isso são até 12 chamados × 3 requisições **a cada meio minuto** —
milhares por hora nos dados móveis e na bateria do técnico, e no servidor. Nunca
teria aparecido numa tela; aparece na conta dele no fim do mês.

Freio de 5 minutos, com o refresh **manual** ignorando (`forcar: true`): quem
toca em atualizar normalmente está prestes a sair, e ali garantir o cache vale o
tráfego. Medido: quatro ciclos do polling = **4 requisições**, não 4 × 20.

**Verificado** reproduzindo a sequência exata do relato — antes: "Failed to
fetch", 0 seções, O.S. ausente do cache. Depois: sem erro, 9 seções, O.S. no
cache. Mais 4 checagens do freio.

Sem migration. APK novo.


### 2026-09-01 (9ª rodada) · A fila só subia se o navegador avisasse — e ele não avisa

Relato do Pedro, na **terceira instalação**: *"terminei a os off, voltei para a
página inicial, liguei a internet, mas continua lá escrito aguardando envio"*.

**A causa: os únicos gatilhos da sincronização eram o evento `online` e reabrir
a O.S.** Nenhum dos dois acontece nessa sequência.

⚠️ **E O EVENTO `online` NÃO É CONFIÁVEL NO APARELHO.** No subsolo o rádio
continua *conectado* — `navigator.onLine` fica `true` — e só os **dados** é que
não passam. Quando eles voltam **não há transição**, logo não há evento. O
técnico finalizava, voltava para a lista, ligava a internet e ficava para sempre
em "Aguardando envio".

**O conserto: uma chamada que deu certo é a prova de que há rede.** A lista já
faz polling a cada 30s; cada volta bem-sucedida dela passou a descarregar a
fila. É um sinal melhor que qualquer flag do navegador, e já existia.

Junto veio uma trava de reentrada: quando algo sobe, a sincronização recarrega a
lista — e a carga da lista chama a sincronização. Sem a trava seria um laço.

⚠️ **A LIÇÃO É SOBRE O TESTE, NÃO SOBRE O CÓDIGO — E É MINHA.** Os testes das
etapas 1 a 4 chamavam `_osSincronizarTudoPendente()` **à mão**. Eles provavam
que a função sincroniza, e nunca que **alguém a chama**. Por isso passaram
verdes enquanto o app falhava no bolso do técnico, três instalações seguidas.

A regra que fica: **teste de sincronização não pode invocar o sincronizador.**
Só toque de botão e o que dispara sozinho. Foi assim que este bug apareceu no
primeiro segundo do teste novo — e é assim que ele fica pego daqui para frente.

**Verificado** reproduzindo a sequência exata do relato, sem simular o evento
`online`: finaliza sem sinal → volta para a lista → liga a internet → **só o
polling roda**. Antes: 0 enviadas, fila cheia, selo "Aguardando envio". Depois:
1 enviada, fila vazia, selo sumiu.

Sem migration. APK novo.

### 2026-09-02 · A O.S. assinada aparecia como "Não assinada" no admin

Relato do Pedro, com a tela aberta na OS-2026-0016: *"foi assinado, está no
PDF a assinatura, porém ali aparece 'não assinada'"*.

**A causa está no jeito certo de servir a assinatura, aplicado pela metade.**
`GET /ordens-servico/:id` deixa `assinatura_b64` de fora de propósito — são
~120KB de PNG que o técnico rebaixaria no 4G a cada abertura — e manda só o
booleano `tem_assinatura`; a imagem sai por `GET /:id/assinatura`, sob demanda.
O app mobile faz essa segunda chamada. **O painel admin nunca fez:** lia
`os.assinatura_b64` direto do detalhe, recebia `undefined` e caía no ramo
"Não assinada." — para toda O.S., assinada ou não.

⚠️ **O PDF ESCONDIA O DEFEITO EM VEZ DE DENUNCIÁ-LO.** `os-pdf.service.js` lê a
coluna direto do banco, então a assinatura sempre saiu no documento. O dado
nunca esteve perdido; só a tela não sabia pedi-lo. Quem conferia pelo PDF —
que é o que vale para o cliente — não tinha como notar.

⚠️ **O MESMO `SELECT` DERRUBAVA MAIS QUATRO CAMPOS, E UM DELES APAGAVA DADO.**
A lista de colunas não trazia `saida_em`, `chegada_lat/lng`, `saida_lat/lng`
nem `necessario_retorno` — todos renderizados pela view, todos saindo como
"—". O grave é o último: `_osEditsFromOS` monta o rascunho de edição com
`!!os.necessario_retorno`, que sem o campo é **sempre `false`**. Abrir uma O.S.
que pedia retorno, mexer em qualquer outra coisa e salvar **desmarcava o
retorno em silêncio** — o PATCH mandava `necessario_retorno: false`.

Junto foi o mapa `_OS_ITENS_VERIFICADOS`: a seção "Verificações" imprimia a
chave crua do JSONB (`comando_eletrico: Sim`) porque só o app e o PDF tinham
os rótulos.

**Verificado** contra o banco, exercitando as duas rotas com JWT de admin:
`GET /ordens-servico/1` agora responde `tem_assinatura: true`,
`necessario_retorno`, `saida_em` e as coordenadas, e segue **sem**
`assinatura_b64`; `GET /ordens-servico/1/assinatura` devolve o data URI.

Sem migration. `?v=N` do `admin.js` bumpado (325 → 326).

### 2026-09-02 (2ª rodada) · Três ajustes no painel do operador

Relato do Pedro, os três na mesma frase: *"às vezes quando o mapa está em tela
cheia ele simplesmente fecha sozinho"*, *"essa tela em específico não pode
desconectar por inatividade, porque o objetivo é deixar o mapa aberto"* e
*"quando clica em um condomínio no mapa que já tem técnico atribuído, acho que
hoje a funcionalidade não faz sentido"*.

**1. A tela cheia fechava sozinha — e quem fechava era o ciclo de 30s.**
O nó do mapa é persistente para atravessar o `render()` (comentário antigo em
`mapaTurnoNo`), mas ele mora **dentro** do `#tela`: o `innerHTML` o arranca do
documento e o `replaceWith` o devolve no instante seguinte. O Leaflet atravessa
esse vaivém — pan, zoom e tiles ficam de pé, que é o que o comentário promete e
cumpre. **A tela cheia não atravessa.** Por especificação, tirar do documento o
elemento em tela cheia encerra a tela cheia, e devolvê-lo no mesmo instante não
desfaz nada; o `fullscreenchange` via `fullscreenElement === null` e o mapa
fechava. Não era "às vezes": era **toda** volta do polling — o "às vezes" é
onde do ciclo a pessoa abriu.

⚠️ **MOVER O NÓ PARA OUTRO LUGAR ANTES DO `innerHTML` NÃO RESOLVERIA** — mover
é remover e inserir, e é a remoção que encerra. Em tela cheia o ciclo passou a
pular o HTML e atualizar só o mapa, que é a única coisa que o navegador pinta
ali; o `#tela` é reposto na saída (`_renderAdiado`).

**2. A tela não desconecta mais por inatividade.** `<body data-corte="nunca">`,
lido pelo `inatividade.js` — mesmo mecanismo do `data-corte="cartao"` da tela
de orçamentos: atributo no `<body>`, que já está no DOM quando aquele `defer`
roda e não esbarra na CSP `script-src 'self'`.

⚠️ **O CARIMBO CONTINUA SENDO GRAVADO, e isso não é sobra.** O
`tg_ultima_atividade` é compartilhado entre as telas. Se esta parasse de
carimbar, um dia de trabalho no operador deixaria o carimbo velho e abrir o
`/admin/painel` na mesma máquina cortaria a sessão no ato — o corte de
carregamento dispara antes de a tela pintar. Só o **corte** foi dispensado.
Vale só para o `/operador/painel`; a tela de Aprovados segue cortando.

**3. O clique no pino segue o estado do chamado.** Todo pino abria o diálogo de
despacho, inclusive o de chamado que já tinha técnico — e era a **única** peça
da tela que oferecia isso: na fila, o item com técnico não tem botão
"Despachar", e o próprio balão já troca o botão pelo nome de quem foi. Só o
mapa perguntava "quem pode ir" sobre um chamado onde alguém já estava indo, com
a lista inteira da equipe e nenhuma palavra sobre o técnico atual — clicar num
nome dali **reatribuía em silêncio**. Agora: sem técnico → despacho (como
sempre); com técnico → o **balão**, no próprio mapa. O Pedro escolheu entre
quatro opções, e o motivo é o item 2: com a tela aberta o turno inteiro, sair
do mapa para ler quem foi é o que não se quer.

⚠️ **E O BALÃO ESTAVA COM 132px DE LARGURA — achado ao verificar o item 3.**
O `width:auto!important` do `.balao-pop .leaflet-popup-content` anula
exatamente a linha em que o Leaflet aplica `minWidth`/`maxWidth`
(`_updateLayout` mede sem quebra, limita e escreve `style.width`). O balão
virava shrink-to-fit: 132px para um mínimo pedido de 214, nome do prédio em três
linhas, **438px de altura num mapa de 391** — o pé, e com ele o "Ver detalhes",
ficava fora da caixa. Valia para o balão do chamado novo desde sempre; o clique
só o pôs na frente. A largura passou para o `.balao` (`width:268px`, o mesmo
`maxWidth` que o JS pede): **271 × 337 com a seta**, dentro dos 391 da coluna.

⚠️ **E A LARGURA SOZINHA NÃO BASTAVA.** Na faixa em que o trilho deixa de ser
coluna o mapa fica largo e BAIXO — medido, **947 × 292** numa janela de 1000px
—, e ali nem os 318 do balão corrigido cabiam. `autoPan` não resolve: não há
para onde panar quando o conteúdo é mais alto que o contêiner. Entrou um
`maxHeight` calculado do tamanho do mapa ao abrir; naquela faixa o balão fecha
em 270 e rola por dentro, e na coluna de 1920 e em tela cheia a conta nem morde
— nenhuma rolagem aparece.

**Verificado no Chrome, com tela cheia NATIVA de verdade** — que é a única
forma de testar isto, porque o caminho por classe (o plano B) não reproduz o
defeito: a classe vive no próprio nó e sobrevive à mudança. Entrou por clique
real no botão; o vaivém do `render()` antigo derruba o `fullscreenElement` para
`null` e limpa o `is-fs`, e com o desvio a tela cheia atravessa o ciclo com o
balão aberto, o mapa recebendo pino novo (5 → 6) e o `#tela` reposto na saída
com o chamado que chegou. Mais: pino com técnico → balão sem "Despachar", com
"Marcos Ribeiro" e "Ver detalhes" dentro da caixa; pino sem técnico → despacho
com os 4 candidatos, igual a antes; console limpo.

O `inatividade.js` foi verificado fora do navegador (a extensão bloqueia
escrever a chave `token`, e sem sessão o arquivo não roda): 14 checagens
cobrindo as duas telas — a que corta segue cortando aos 45 min e ao voltar para
a aba com 3h, a que não corta não arma timer e sobrevive a 26h paradas, e o
cartão de orçamentos segue no caminho dele.

Sem migration. `?v=N`: `operador.js` 70 → 73, `operador.css` 75 → 77,
`inatividade.js` 8 → 9 nas cinco páginas que o carregam.

### 2026-09-02 (3ª rodada) · O pedido de orçamento do técnico deixa de ser invisível

Pergunta do Pedro: *"se no app o técnico colocar que é necessário orçamento,
essa informação chega onde?"*. Rastreando: o app salva
`orcamento_necessario` + `orcamento_observacoes` na O.S. (PATCH com debounce,
enquanto ele digita), e daí a informação aparece em **quatro lugares, todos no
admin** — a aba "Solicitados pelos técnicos", o drawer do condomínio, o
detalhe da O.S. e a ficha do equipamento. **Não dispara notificação nenhuma**
(nem e-mail, nem WhatsApp), **não sai no PDF da O.S.**, não chega ao operador
(a tela Aprovados filtra `status = 'aprovado'`) e não chega ao cliente.

⚠️ **E O CONTADOR NÃO CONTAVA JUSTAMENTE ESSE ESTADO.** O pedido recém-chegado
tem `orcamento_status` **NULO** — o orçamento formal ainda não existe. A tabela
já sabia desenhá-lo (`_orcStatusLabel(null)` devolve SOLICITADO, com comentário
dizendo que é *"o estado que mais precisa aparecer nesta aba"*), mas o KPI
"Pendentes", os contadores das abas e os DOIS badges contavam
`status === 'rascunho'`. Nulo não é rascunho: **o pedido novo não entrava em
contador nenhum**, e sob a aba "Pendentes" nem aparecia.

⚠️ **E O BADGE SÓ EXISTIA DEPOIS DE ABRIR A SEÇÃO.** `_orcAtualizarBadge` só
roda dentro de `carregarOrcamentos`, chamada apenas ao ENTRAR em Orçamentos.
Abrir o admin e olhar a barra lateral não mostrava nada — que é exatamente o
que um badge existe para evitar.

Os dois consertados: o estado ganhou nome (`_orcSolicitado`) e aba própria, o
badge soma **solicitado + rascunho**, e `carregarTudo` carrega a lista no boot
— uma requisição a mais na primeira carga e nenhuma no polling.

**E a tela foi unificada com a aba irmã**, a pedido do Pedro. As duas vivem na
mesma seção, a um clique uma da outra, e eram coisas diferentes: "Criar
orçamento" já era master-detail agrupado por condomínio, "Solicitados pelos
técnicos" era tabela de 7 colunas. A pergunta das duas é a mesma — *o que este
prédio está esperando de orçamento?* — e agrupar é o que permite respondê-la de
uma vez: um técnico que pediu três coisas no mesmo prédio virava três linhas
soltas. Reaproveitou `.av-condo-row`, `.av-dot`, `.av-orc-pane-head` e
`.av-orc-item` **inteiros**; a única classe nova é `.av-orc-item-obs`, a
observação do técnico na linha — ela não é metadado, é o texto que a aba existe
para entregar.

A ficha por O.S. não se perdeu: virou o modal de tela cheia, que já era o
destino do botão "Preencher orçamento" e já carregava a observação. **Aprovar
e Rejeitar foram junto**, e isso conserta um defeito de caminho: o `_orcAcao`
escreve o resultado em `#orcFormMsg`, que só existe dentro do modal — aprovar
pelo painel era ação sem confirmação e sem mensagem de erro.

⚠️ **DOIS DEFEITOS ANTIGOS APARECERAM AO OLHAR O MODAL NA TELA.** O título saía
**"Orçamento formal · OS OS-2026-0042"** (o `numero` já traz o prefixo), e o
botão "Gerar PDF" usava `#f0b014` como **texto** sobre a placa clara: **1,6:1**
medido, contra os 4,5 do piso. É a Regra do Amarelo Cego do DESIGN.md, e a
correção é o token — `--warn` vira `--warn-t` dentro do `.av-modal-dialog` e
mede **4,67:1**.

⚠️ **A CRASE DENTRO DE TEMPLATE LITERAL ME PEGOU DUAS VEZES NESTA RODADA**, nos
comentários `<!-- -->` que escrevi dentro do HTML do modal. É o item do
CLAUDE.md, e o sintoma é o de lá: erro apontando para identificador solto,
longe da linha real. Fica o reforço: dentro de template literal, nome de
função e de classe vai **sem marcação nenhuma**.

**Verificado no Chrome**, numa prévia sem sessão criada para isto
(`/dev/_orcamentos-preview.html`, mesmo molde do `_operador-preview.html`):
badge da barra e da aba em **3** (2 solicitados + 1 rascunho, o número que
antes era 1); KPIs Total 6 · Solicitados 2 · Em orçamento 1 · Total aprovado;
aba "Solicitados" filtrando para os 2 condomínios com pedido não atendido;
troca de condomínio, busca por técnico, clique no pedido abrindo o modal com a
observação, o formulário e as quatro ações; selo sem colidir com o ×; PDF a
4,67:1; e as duas abas lado a lado com o mesmo esqueleto. Console limpo.

Sem migration. `?v=N`: `admin.js` 326 → 328, `admin.css` 239 → 240.

### 2026-09-02 (4ª rodada) · O modal que faz o orçamento, desenhado

Reclamação do Pedro, com o print: *"mas o modal para fazer o orçamento você não
arrumou né?"*. Estava certo. Na rodada anterior eu tinha consertado três
defeitos pontuais dele — título duplicado, selo colidindo com o ×, contraste do
botão de PDF — e nunca desenhado a tela. Ela é onde o orçamento é feito de
verdade e era a menos cuidada do fluxo.

**A CAUSA: OS DOIS MODAIS DE ORÇAMENTO DIVIDEM O `#avModal`.** Em algum momento
o avulso ganhou layout de duas colunas, e o shell foi ajustado para ele —
`padding: 0`, `display: flex`, `height: min(92vh, 880px)`, `max-width: 1360px`.
**Só o avulso tem a marcação desse layout.** O modal da O.S. despejava
`.av-modal-head` + `.orc-form-section` num diálogo sem padding nenhum: rótulo
colado na borda esquerda e campo na direita (medido, **0px**), o cabeçalho
recuado 20px por regra própria e o corpo em zero, 1360px de largura gastos com
campos de 660, e nenhuma zona de rolagem — o formulário inteiro era uma coluna
só. Era dano colateral, não desenho.

Agora ele usa os mesmos componentes do avulso (`.av-layout`, `.av-col-form`,
`.av-itens-zone`, `.av-itens-scroll`, `.av-cond`, `.av-rail`) e herda o que já
tinha sido resolvido lá: só a zona de itens rola, o "+ Adicionar item" gruda no
pé dela, e as condições comerciais nascem fechadas com o resumo no sumário.

⚠️ **O QUE ESTE MODAL TEM E O AVULSO NÃO: um documento de origem.** O trilho da
direita mostra o PEDIDO DO TÉCNICO — a observação dele, quem foi, de qual
chamado veio, quando a O.S. fechou. É material de consulta enquanto se escreve,
e por isso fica AO LADO e não acima: como faixa no topo ele rolava para fora da
vista exatamente quando o operador começava a lançar os itens.

⚠️ **O TOTAL MUDOU DE LUGAR PELO MESMO MOTIVO.** Era uma linha de 12px no fim
da tabela — dentro da zona que rola —, então sumia a partir do quarto item, que
é justo quando o número começa a importar. No trilho é o `.av-total` do avulso:
mono, 29px, sempre visível, com subtítulo contando os itens e avisando quantos
estão **sem valor** (o caso que faz o PDF sair errado).

⚠️ **E O TRILHO REPROVAVA CONTRASTE — NOS DOIS MODAIS.** `.av-rail` tinha
`background: rgba(0,0,0,.22)`, sobra de quando este modal era marinho. Sobre a
placa clara aquilo resolve para rgb(181,183,189), um cinza médio, e as duas
famílias de tinta do modal foram calibradas contra `--chapa`, não contra ele:
`--tinta-2` media **4,04:1** (rótulo, chave, e agora a observação do técnico) e
`--atencao-t` media **2,78:1** ("definir manualmente", "Enviar ao cliente").

⚠️ **E O DEGRAU TEM DE SER PARA CIMA — a primeira tentativa errou o lado.**
Usar `--surface2` (o degrau ESCURO) consertava a tinta (5,78) e deixava o âmbar
em 3,98: melhor que 2,78, ainda reprovado. O motivo é aritmético — a família
`-t` do DESIGN.md é calibrada contra `--chapa`, que é o TETO DE ESCURIDÃO em
que ela passa; qualquer fundo mais escuro quebra o âmbar antes da tinta. O
trilho virou placa POUSADA sobre o formulário (`--surface`, `--chapa-cl`):
**7,55** e **5,20**, e o avulso vai junto. Nos dois modais não sobrou nenhum
texto abaixo de 4,5 — pior caso medido, 5,03 no avulso e 7,54 no da O.S. Mais
duas trocas de `--muted2` (3,59:1) por `--text-dim` (6,78:1) no estado vazio da
tabela e na observação ausente.

A tabela de itens ganhou `<colgroup>` com as mesmas larguras (84/122/122/40) do
grid do "+ Adicionar item" — sem ele as colunas numéricas se auto-dimensionam e
os campos caem fora da vertical das colunas que preenchem.

**Verificado na prévia**, nos dois estados que importam. Vazio: padding real em
toda volta, duas colunas (1060 + 300 em 1360), a observação do técnico legível
no trilho, estado vazio dizendo o próximo passo. Cheio, com 4 itens: total
**R$ 1.491,00** no trilho com "4 itens · 1 sem valor", a zona de itens rolando
com o "+ Adicionar item" grudado (`position: sticky`), e as colunas do formulário
de adicionar caindo na vertical das da tabela — cabeçalhos em 300/940/1024,
campos em 308/948/1032, os 8px do padding das células. Contrastes remedidos no
DOM, varrendo TODO texto dos dois trilhos: nenhum abaixo de 4,5 (pior caso 5,03
no avulso, 7,54 no da O.S.); estado vazio da tabela 6,78. Console limpo.

Sem migration. `?v=N`: `admin.js` 328 → 329, `admin.css` 240 → 243.

---

### 2026-09-02 · O condomínio aparecia com a razão social na lista e com o fantasia no PDF

Pergunta do Pedro: *"por que o condomínio que tem o nome fantasia AURI FARIA
LIMA está aparecendo na lista como ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS
LTDA?"*

**A [migration 044](#migrations-numeradas-módulo-whatsappia-em-diante) declarou
`condominios.nome_fantasia` como "nome principal de exibição" e só metade do
sistema foi atrás.** O PDF (`orcamento-pdf.service.js`), o e-mail de envio e o
painel do cliente usavam o fantasia; as duas rotas que alimentam a seção de
Orçamentos do admin — `GET /admin/orcamentos` e `GET /admin/orcamentos/avulsos`
— liam só `c.nome`, a razão social.

O resultado: o painel dizia "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA" e
o síndico recebia um PDF escrito "AURI FARIA LIMA". Mesmo orçamento, dois nomes.
**71 dos 86 condomínios** em produção têm fantasia diferente da razão social, e
**44 das 61 linhas** da lista trocavam de nome entre a tela e o documento.

É a mesma regressão pós-044 que o `buscarDadosAvulso` já tinha sofrido — só que
desta vez do lado da tela.

| Rota / arquivo | Agora |
|---|---|
| `GET /admin/orcamentos` (as duas consultas) | `COALESCE(NULLIF(c.nome_fantasia,''), c.nome)` + `c.nome AS condominio_razao_social` |
| `GET /admin/orcamentos/avulsos` | idem, com `o.cliente_nome` fechando o `COALESCE` |
| `orcamento-pdf.service.js`, e-mail de envio, `cliente.routes.js` | ganharam o `NULLIF` que faltava |

⚠️ **`NULLIF` não é enfeite:** `COALESCE(c.nome_fantasia, …)` aceita string
vazia, e um fantasia salvo como `''` apagaria o nome da tela. As rotas de
equipamentos, planos de manutenção e do select de condomínios já faziam assim.

⚠️ **A busca passou a aceitar os dois nomes.** O blob de
`_avFiltrados`/`_orcFiltrados` só olhava `condominio_nome`; com o fantasia ali,
procurar por "Elvira" — o nome que consta no CNPJ, no contrato e na nota —
pararia de achar o prédio. A razão social viaja em `condominio_razao_social`,
entra no blob e aparece na linha `.av-orc-pane-razao` do cabeçalho do painel,
**só quando difere** do fantasia. Mesmo par que o PDF imprime.

⚠️ **A segunda consulta do `GET /admin/orcamentos` tem `GROUP BY`** e ler
`c.nome_fantasia` no `SELECT` sem adicioná-lo ali derruba a query inteira com
`42803` no parse — irmão do `42P08` do [CLAUDE.md](../CLAUDE.md), e igualmente
invisível para `node --check`. Não há agregação sobre `condominios` (o único
`SUM` é o dos itens), então a linha por orçamento não muda.

**Verificado exercitando as rotas**, não só lendo o SQL: Express com o
`adminRouter`, JWT assinado com o `JWT_SECRET`, `GET` nas duas contra o banco de
produção. 200 nas duas; `tela="AURI FARIA LIMA"` / `razao="ELVIRA FERRAZ
EMPREENDIMENTOS IMOBILIARIOS LTDA"`. O orçamento sem condomínio vinculado
(`GENOVA E BARCELONA`, razão social nula) atravessa sem a linha extra.

⚠️ **`.env` aponta para o banco de TESTE por padrão**, não para produção como
diz o CLAUDE.md: `src/db-url.js` só escolhe `DATABASE_URL` com
`NODE_ENV=production` ou sem `DATABASE_URL_TESTE`. A primeira rodada do teste
voltou com os condomínios de demonstração ("Ed. Aurora") e quase passou por
"nenhuma linha desse condomínio".

**E verificado em tela**, em `/dev/_orcamentos-preview.html` a 1920px, nas
**duas** abas: nome fantasia no título, "Razão social: …" abaixo, e a linha
**ausente** no Edifício Aurora Paulista, que a fixture ganhou com os dois
campos iguais justamente para cobrir o condomínio sem fantasia. Busca por
"administradora" e por "empreendimentos" — palavras que só existem na razão
social — acha o prédio pelo nome de tela. Console limpo depois de recarregar.

⚠️ **A primeira versão da linha usava `opacity: .8` e reprovou contraste:
3,26:1 medido no DOM.** O painel é `rgba(255,255,255,.14)` sobre `--chapa`
(fundo efetivo rgb(40,49,84)) e a opacidade compõe contra ele, comendo o que o
token tinha. Sem opacidade, `--text-dim` dá **6,22:1**. A hierarquia fica por
conta do tamanho (11px contra os 14px do título) e do rótulo — é o nome do
CNPJ, ninguém deveria apertar os olhos para conferir com quem vai contratar.

📋 **Achado de passagem, NÃO corrigido:** `.av-orc-pane-sub` (a contagem de
orçamentos, logo abaixo) mede **4,22:1** com `--muted` — abaixo do piso de 4,5
do [DESIGN.md](../DESIGN.md). É anterior a esta sessão e aparece nas duas abas;
trocar por `--text-dim` resolveria, mas mexe em texto que não é desta mudança.

Sem migration — nenhuma coluna mudou, só quem as lê. `?v=N`: `admin.js`
329 → 330, `admin.css` 243 → 244, `_orcamentos-preview.js` 6 → 7.

### 2026-09-02 (5ª rodada) · Os dois modais de orçamento, iguais de verdade

O Pedro pôs os dois prints lado a lado: *"está do mesmo jeito para você?"*. Não
estava. Na rodada anterior eu reaproveitei o **esqueleto** do modal avulso e
parei ali — o acabamento seguia divergente, e é o que salta ao ver as duas
telas juntas.

| | Antes | Agora |
|---|---|---|
| Ações | rodapé com 5 botões (o avulso não tem rodapé) | no trilho, empilhadas, Salvar em âmbar |
| Zonas nomeadas | só ITENS e CONDIÇÕES | O DOCUMENTO · CONSTATAÇÃO · ITENS · CONDIÇÕES |
| Cabeçalho | `<h3>` com estilo inline | placa do cifrão + `.av-modal-num` + `.av-modal-meta` |
| "+ Adicionar" | botão neutro numa linha abaixo | âmbar, na 4ª coluna da linha |

⚠️ **AS AÇÕES FORAM ESCOLHA DO PEDRO entre três arranjos**, e não é só layout:
o avulso muda de estado por um select "Situação" no trilho, e este modal tem
Aprovar/Rejeitar como botões. Mantê-los como botões e mudá-los de lugar
preserva o comportamento — o motivo da rejeição continua sendo pedido no ato —
e alinha a posição.

⚠️ **E OS DOIS BOTÕES ERAM DO CAMPO ESCURO.** `.orc-btn-approve` e
`.orc-btn-reject` usam `#4ade80` e `#f87171`, cores claras feitas para o painel
marinho. Ao saírem do rodapé para o trilho passaram a viver na PLACA CLARA,
onde medem **1,9:1** e **2,6:1** — o rótulo some. Dentro do diálogo agora usam
a família de tinta (`--ok-t`, `--risco-t`).

⚠️ **TERCEIRA OCORRÊNCIA DO PRETO TRANSLÚCIDO.** Depois do `.av-rail`, o
`.av-seg` — o seletor Cadastrado/Avulso do modal avulso — tinha
`rgba(0,0,0,.3)` pela mesma razão histórica. A aba **ATIVA** era a pior das
duas (**3,27:1**), porque o âmbar é o que menos aguenta fundo escuro. Mesmo
conserto, mesmo motivo: degrau para cima (`--surface`), agora **4,65:1**.

**Verificado na prévia**, abrindo os dois modais em sequência e comparando
campo a campo: mesmo cabeçalho, mesmas quatro zonas nomeadas, ações no trilho
nos dois, nenhum rodapé, "+ Adicionar" âmbar na linha. Varredura de contraste
em TODO texto dos dois diálogos: **nenhum abaixo de 4,5** — pior caso 4,65 no
avulso e 5,78 no da O.S. Console limpo.

Sem migration. `?v=N`: `admin.js` 329 → 330, `admin.css` 243 → 245.

### 2026-09-02 (6ª rodada) · Um modal de orçamento, não dois

Pergunta do Pedro depois de comparar as duas telas: *"por que você só não
reaproveita o modal com os mesmos elementos que já existe na tela de orçamento
normal?"*. Não havia motivo. Nas duas rodadas anteriores eu aproximei o modal
da aba dos técnicos do modal do avulso — esqueleto, depois acabamento — quando
o certo era **não existir um segundo modal**.

⚠️ **O CAMINHO JÁ EXISTIA NO CÓDIGO, para outro caso.** `_orcAbrirDaBancada`
pega o orçamento em `_avData` e abre o modal do avulso — era assim que o pedido
nascido na oficina já era editado. E funciona porque
`GET /admin/orcamentos/avulsos` **não tem `WHERE`**: a lista já contém os
orçamentos nascidos de O.S. Eu construí um modal paralelo em vez de seguir por
ali.

**Saíram 13 funções e uma delegação de eventos** — `_orcFormalHtml`,
`_orcRenderItens`, `_orcAcao`, `_orcCarregarItens`, `_orcAdicionarItem`,
`_orcEditarItem`, `_orcRemoverItem`, `_orcGerarPdf`, `_orcSincronizarModal`,
`_orcAbrirFormal`/`_orcFecharFormal`/`_orcFormalAberto`/`_orcSomenteLeitura`.
**−525 linhas, +129.**

⚠️ **E HAVIA DUAS DELEGAÇÕES NO MESMO `#avModalBody`** — a desta aba e a do
`_avBindEventos`. As duas escutavam clique e change no mesmo elemento, e qual
respondia dependia da ordem de registro. Não deu defeito visível porque os
`data-*` diferiam (`data-orc-action` × `data-av-action`), mas era um risco
calado que saiu junto.

**O que o pedido de O.S. ganhou de graça**, por passar a usar o modal completo:
**envio por e-mail** (o passo que leva o orçamento ao síndico, e que faltava
aqui), **tipo de documento** (peças / limpeza de reservatório / dedetização —
sem ele um orçamento de limpeza nascido de O.S. saía com o layout de peças no
PDF), valor manual, Excluir, baixa da resposta do cliente e a Situação como
select.

⚠️ **O PEDIDO DO TÉCNICO ENTROU NO TRILHO DO MODAL ÚNICO**, condicionado a
`os_id`. É a única coisa que o modal da O.S. tinha e o avulso não, e virou um
bloco de dez linhas em vez de um modal inteiro. Os campos vêm do próprio
`GET /avulsos` (`orcamento_observacoes`, `os_tecnico_nome`, `os_chamado_id`) —
a rota já fazia o `LEFT JOIN` com `ordens_servico`; buscar à parte seria uma
request por abertura de modal.

⚠️ **O PEDIDO AINDA `SOLICITADO` NÃO TEM LINHA EM `orcamentos`**, e o modal
precisa de um registro. Ele passa a **nascer na abertura**: um PATCH
`acao:"salvar"` faz o backend rodar `_garantirOrcamentoDaOs`, que já trata o
caso de a bancada ter pedido primeiro (adota o orçamento solto em vez de abrir
um segundo). **Decisão do Pedro** entre isso e exigir um clique em "Criar
orçamento" dentro da linha: nada nasceria por engano, ao custo de um passo a
mais em toda abertura.

**Verificado na prévia, nos dois caminhos.** Pedido com orçamento
(OS-2026-0041) → abre `OR-000501` com o pedido do técnico no trilho, os 2
itens, Enviar por e-mail, Tipo, Situação e Excluir. Pedido SOLICITADO
(OS-2026-0042) → materializa, nasce `OR-000700`, o modal abre já com o pedido
no trilho, e o selo na lista atrás vira PENDENTE sem recarregar. Console limpo.

Sem migration. `?v=N`: `admin.js` 330 → 331.

### 2026-09-02 (7ª rodada) · Achar o prédio para abrir um chamado

Relato do Pedro: *"o filtro para achar um condomínio no modal para abrir um
chamado está muito ruim"* — e, perguntado onde, *"admin, mas talvez no operador
esteja igual"*. Estava, e eram **dois** problemas.

**1. Não existia filtro.** É um `<select>` nativo com a carteira inteira
dentro — **86 prédios** em produção. Sobra rolar, ou a digitação-por-prefixo
do navegador, que casa só o COMEÇO do texto e se perde a cada tecla lenta.

⚠️ **2. E NO ADMIN OS NOMES ESTAVAM ERRADOS**, que é o que tornava o filtro
inútil de verdade. A lista era montada com `c.nome` — desde a migration 044 a
**razão social**. Quem atende o telefone ouve "Auri Faria Lima" e procura numa
lista que diz "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA": um nome que
não está escrito. Em produção **71 dos 86** cadastros têm os dois diferentes.
O operador não tinha esse defeito (já usava `nome_fantasia || nome`), só o do
filtro.

Entrou `public/condo-picker.js` — **arquivo compartilhado pelos dois painéis**,
no molde do `inatividade.js`, que eles já carregam. Isso não fere a regra de
que "`operador.js` não importa nada de `admin.js`": a regra existe para o
operador não virar refém do admin, e um terceiro arquivo sem dono é o
contrário disso. Só o CSS é duplicado nas duas folhas, como todo o Chapa.

Ele busca em **fantasia + razão social + bairro + cidade**, sem acento e sem
caixa, com todos os termos casando em qualquer ordem ("mariana vila" acha
"Residencial Vila Mariana"). Na linha, o nome de tela em cima e a razão social
embaixo — **só quando difere**, senão é a mesma frase duas vezes.

⚠️ **O CAMPO ORIGINAL NÃO SOME: vira `<input type="hidden">` com o MESMO id.**
Todo o código de gravação (`getElementById("ncCondo").value`) continua valendo
sem uma linha de mudança, nas duas telas. É o que torna a troca segura numa
tela que grava chamado.

⚠️ **E O REALCE DA LISTA NASCEU REPROVANDO CONTRASTE — a terceira vez nesta
casa.** Eu tinha pintado o nome do item marcado de `--accent`; dentro do modal,
que é placa clara, isso vira `--atencao-t` e mede **3,41:1** sobre o fundo do
realce. Ou seja: o item selecionado ficava MENOS legível que os outros. É a
Regra do Amarelo Cego do DESIGN.md, e a correção é a mesma de sempre — o âmbar
**preenche** (cru, 18%) e o texto continua tinta: **15,7:1** no nome, **6,8:1**
na razão social. O item marcado ganhou uma barra de 2px à esquerda para se
distinguir do item sob o mouse.

⚠️ E a lista abre com `--surface` no admin (o degrau CLARO, porque ali ela
pousa sobre placa clara) e `--surface2` no operador (campo marinho). Mesma
lição do trilho do orçamento, aplicada antes de cobrar de novo.

**Verificado por teste, não por tela.** `scripts/testes/condo-picker.test.js`
(novo, roda com `node`) monta o componente sobre um DOM mínimo e cobre 14
casos: buscar "elvira" acha o prédio que a tela chama de "Auri Faria Lima";
"sao caetano" acha "São Caetano"; "edis" acha "Édis Center"; bairro e cidade
filtram; o hidden guarda o id enquanto o campo mostra o nome. Mais a conferência
estática de que as 8 classes do JS têm regra nas duas folhas, e o cálculo de
contraste acima.

⚠️ **O DESENHO E O TECLADO NÃO FORAM VISTOS EM NAVEGADOR.** A extensão do
Chrome caiu no meio da sessão e não voltou em cinco tentativas. Setas, Enter,
Esc, o fechamento no blur e o encaixe da lista dentro do modal seguem
**não verificados** — o teste acima não abre navegador. Para olhar sem sessão:
`/dev/_operador-preview.html`, cuja fixture ganhou 40 prédios com a mesma
proporção de nomes divergentes da produção (era dois, sem fantasia — com
aquilo nenhuma das duas coisas se testava).

Sem migration. `?v=N`: `admin.js` 331 → 332, `admin.css` 245 → 247,
`operador.js` 73 → 74, `operador.css` 77 → 79.

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).
