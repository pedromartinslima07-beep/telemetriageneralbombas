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

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).
