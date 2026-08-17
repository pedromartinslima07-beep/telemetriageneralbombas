---
tags:
  - projeto
  - fluxo
aliases:
  - Ordens de Serviço
  - O.S.
  - Orçamentos
  - GPS
---
# Fluxo: Ordens de Serviço, Orçamentos e GPS

## Ordem de Serviço (O.S.) digital

Documento de execução preenchido pelo técnico no campo, geralmente vinculado a
um chamado.

### Ciclo

1. **Criação** — `POST /ordens-servico` (adminOnly) vincula `chamado_id`,
   `condominio_id`, `tecnico_id`.
2. **Preenchimento** (técnico dono, guard `osDonoOuAdmin({forWrite:true})`):
   - `PATCH /ordens-servico/:id` — dados da execução.
   - **Fotos:** `POST /:id/fotos/upload` ou `/:id/fotos` (base64 comprimido
     client-side ~150-300KB; `express.json` aceita até 8mb). `os_fotos`.
   - **Peças:** `POST/PATCH/DELETE /:id/pecas[/:peca_id]`. `os_pecas`.
   - Sinaliza se há orçamento necessário (`orcamento_necessario`,
     `orcamento_observacoes`).
3. **Finalização** — `POST /:id/finalizar` (assinatura) marca `finalizada_em` e
   **gera o PDF** (`os-pdf.service.js`, Puppeteer).
4. **Acesso ao PDF** — `GET /:id/pdf` (dono ou admin);
   `GET /cliente/ordens-servico/:id/pdf` (cliente do condomínio).

Uploads servidos em `/uploads` (estático, cacheável). Regerar PDFs em lote:
`scripts/regenerar-pdfs-os.js`.

## Orçamentos (sistema unificado)

> **Contexto histórico:** até a migration 030 coexistiam dois sistemas paralelos
> — colunas `orcamento_*` na O.S. + `orcamento_itens` (A) e as tabelas
> `orcamentos`/`orcamento_linhas` (B). A 030 unificou em B (com backfill em
> transação) e removeu A. A O.S. **mantém** só `orcamento_necessario` e
> `orcamento_observacoes` (input do técnico, semente do orçamento). As rotas
> ainda usam `:os_id` na URL, mas resolvem o `orcamento_id` via
> `_garantirOrcamentoDaOs` (cria com número `OR-XXXXXX` se não existir).

Hoje existe **um** sistema: tabela `orcamentos` + `orcamento_linhas`. A `origem`
distingue a procedência:

- **`os`** — orçamento derivado de uma O.S. (`os_id`).
- **`ia`** — solicitação criada pela IA via WhatsApp (entra como rascunho +
  email à equipe comercial).
- **`admin`** — orçamento avulso criado no painel.

### Endpoints (`/admin/orcamentos*`)

- Ligados a O.S.: `GET/PATCH /admin/orcamentos[/:os_id]`, itens em
  `/admin/orcamentos/:os_id/itens`, PDF em `/admin/orcamentos/:os_id/pdf`.
- **Avulsos:** `GET/POST/PATCH/DELETE /admin/orcamentos/avulsos[/:id]`, linhas
  em `/avulsos/:id/linhas`, PDF em `/avulsos/:id/pdf`.

Estados: rascunho → enviado/pendente → aprovado (`aprovado_em`/`aprovado_por`)
ou rejeitado (`motivo_rejeicao`). PDF via `orcamento-pdf.service.js`
(Puppeteer **singleton** — sem cold start no Railway).

### Tipo de orçamento (`tipo`, migration 060)

O modelo de peças (tabela de itens com qtd/valor unitário) não fazia sentido
pra orçamento de serviço — vira só texto descritivo genérico. A coluna `tipo`
(`pecas` default | `limpeza_reservatorio` | `dedetizacao` |
`limpeza_dedetizacao`) faz o PDF **ramificar pra um layout diferente**
conforme o tipo, mas ainda dentro do mesmo `orcamentos`/`orcamento_linhas`,
mesmo timbrado (`papel-timbrado.png`) e mesmo fluxo do admin (avulso).

- **`tipo = 'pecas'`** (padrão): comportamento original, sem mudanças —
  tabela de itens (`orcamento_linhas.ficha_tecnica`) com paginação two-pass
  medida via Puppeteer (`_gerarPdf`/`renderHTML`/`renderMeasureHTML`).
- **`tipo` de serviço** (`limpeza_reservatorio`/`dedetizacao`/
  `limpeza_dedetizacao`): PDF descritivo por **cláusulas** (`_gerarPdfServico`/
  `renderHTMLServico`), no mesmo estilo dos contratos — texto corrido flui
  naturalmente entre páginas via `headerTemplate`/`footerTemplate` do
  Puppeteer (timbrado fatiado em header/footer + camada fixa central), sem
  paginação manual. Cada serviço tem cláusulas fixas de **Objeto**, **Escopo
  dos Serviços** e **Normas/Garantia** (`clausulasLimpezaReservatorio()` /
  `clausulasDedetizacao()` em `orcamento-pdf.service.js`); no combo, os dois
  blocos aparecem em sequência ("Serviço 1 – ...", "Serviço 2 – ..."). No
  final, seção **"Valores dos Serviços"** lista cada `orcamento_linha`
  (descrição + valor) e soma o total — os valores continuam separados, não
  viram texto de cláusula.
  - **Data do orçamento editável** (migration 061, `orcamentos.data_documento
    DATE`, nullable): a "Data" mostrada no PDF sempre veio de `criado_em`
    (timestamp automático, sem forma de ajustar). Agora tem um campo "Data do
    orçamento" no modal (ao lado de "Válido até"); se vazio, comportamento
    igual a sempre (usa `criado_em`). `criado_em` não é tocado — continua
    intacto pra auditoria de quando o registro foi criado de fato.
  - **Seção "Valores dos Serviços" nunca quebra entre páginas**
    (`.valores-sec { page-break-inside: avoid; }` envolvendo título + caixa de
    valores + total como um bloco só). Existiu uma versão sem esse `avoid`
    (pra evitar um vão em branco quando a seção não cabia no que sobrava da
    página) — mas com a margem do timbrado recalibrada (item abaixo) o vão
    que sobra ao empurrar a seção inteira pra página seguinte ficou pequeno,
    e nunca mais quebrar a tabela no meio passou a valer mais a pena.
  - **Margens do timbrado calibradas pela imagem real** (não copiadas do
    contrato sem checar): medindo os pixels de `public/papel-timbrado.png`
    (script pontual, não versionado), o logo termina a ~36mm do topo e o
    endereço do rodapé começa a ~22,5mm do fundo. Por isso o header/footer
    usa `38mm`/`25mm` (com pequena folga), bem mais justo que o `42mm`/`40mm`
    do contrato — evita desperdiçar ~15mm de conteúdo útil por página, que
    antes empurrava a seção de valores inteira pra página seguinte com um
    vão em branco visível.
- No admin (avulso), o seletor "Tipo de orçamento" fica no topo do modal. Ao
  trocar pra um tipo de serviço, a(s) linha(s) de valor correspondente(s) são
  adicionadas **automaticamente** (`_avPreencherPadrao(tipo)` em
  `public/admin.js`, chamada no `change` do `#avInputTipo` — sem botão
  manual). `_avItensPadrao` define só `descricao` + `valor_unitario = 0` — o
  texto técnico não vem mais do input do admin, é fixo no PDF. Deduplicação
  por descrição: alternar entre tipos não duplica linha já existente nem
  remove a de outro tipo (ex.: ir de combo pra "só reservatório" mantém a
  linha de dedetização, que o admin remove manualmente com "✕" se não quiser
  mais). Também roda ao abrir um orçamento de serviço já salvo sem nenhuma
  linha (dado legado). A seção "Itens" vira "Valores dos Serviços" quando
  `tipo !== 'pecas'`. Descrição/Ficha técnica e Valor são editáveis direto na
  tabela (`input` com `change` → `PATCH
  /admin/orcamentos/avulsos/linhas/:linha_id`, rota nova) — é assim que se
  ajusta o valor de R$ 0,00 que a linha padrão entra.
- **Sem Qtd/Valor Unit. pra serviço:** não faz sentido "quantidade × valor
  unitário" pra um serviço (é sempre o valor total daquele serviço) — a
  tabela em `_avRenderLinhas` (`public/admin.js`) esconde as colunas
  Qtd/Unit./Total e mostra só "Valor" quando `tipo !== 'pecas'` (lido do
  select `#avInputTipo` ao vivo, não do orçamento salvo — muda a tabela na
  hora, antes até de clicar Salvar). No banco a linha continua com
  `quantidade = 1` fixo (nunca exposto na UI pra serviço), então
  `valor_unitario` já é o total. Tipo `pecas` continua idêntico a sempre.
- **Sem "+ Adicionar item" livre pra serviço:** um item digitado à mão nesse
  formulário não gera cláusula nenhuma no PDF (só o texto fixo de
  `clausulasLimpezaReservatorio()`/`clausulasDedetizacao()` vira cláusula) —
  viraria um valor solto sem descrição técnica, então o formulário some
  quando `tipo !== 'pecas'`, sobrando só a linha adicionada automaticamente
  (ver acima) e o botão de remover linha existente. Tipo `pecas` mantém o
  formulário livre normalmente.
- **Corrida entre carregamento inicial e troca de tipo:** se o admin troca o
  tipo rapidíssimo depois de clicar "Novo" (antes do GET inicial de linhas
  terminar), duas rotinas podiam disparar `_avPreencherPadrao` quase ao mesmo
  tempo e duplicar a linha (cada uma via `_avLinhas` ainda vazio e inseria de
  novo). Corrigido com `_avLinhasPromise` (quem chama `_avPreencherPadrao`
  espera o fetch em andamento terminar antes de checar duplicidade) +
  `_avPreencherPadraoAtivo` (trava síncrona — sem `await` entre checar e
  marcar — garante que só uma chamada de fato insere).
- **Modal compactado:** com tipo/data/valores o modal cresceu e passou a
  precisar rolar em telas menores. Os 5 campos do topo (Tipo, Condomínio,
  O.S., Data do orçamento, Válido até) e os 4 de Condições Comerciais (Forma
  de Pagamento, Prazo, Garantia, Status) viraram uma linha só cada (eram 2),
  a Constatação encolheu, e o padding do modal (`#avModal`/`#avModal
  .av-modal-dialog` em `admin.css`, escopado só nesse modal — não afeta os
  outros que usam `.av-modal`) diminuiu (depois reajustado um pouco pra cima —
  ficou apertado demais na primeira versão). Cabe inteiro em 1366×768 sem
  rolar (~725px de altura de diálogo).
- **Desalinhamento entre `<select>` e `<input>` na mesma linha** (ex.: "Data
  do orçamento" ficava ~4px mais alto que "Tipo de orçamento"/"O.S.
  vinculada"): os 4 `<select>` do modal (`avInputTipo`, `avInputCondo`,
  `avInputOs`, `avInputStatus`) tinham um `style="margin-top:4px;"` inline
  redundante — sobra de antes do `.orc-form-label` ter `gap:5px` no flex
  column, que já cuida do espaçamento entre o texto do label e o campo
  sozinho. Removido; não tem nada a ver com quirk de renderização do
  navegador (isso foi hipótese errada, testada e descartada antes de achar o
  `margin-top` sobrando).
- **Especificação do reservatório (superior/inferior, quantidade etc.):** o
  campo "ficha técnica" da linha cuja descrição contenha "reservatório" é
  reaproveitado como texto livre pro admin descrever a composição (ex.: "2
  superiores e 1 inferior"). `acharEspecificacaoReservatorio(itens)` em
  `orcamento-pdf.service.js` acha essa linha por regex na descrição e passa
  o texto pra `clausulasLimpezaReservatorio(especificacao)`, que insere um
  parágrafo extra "Especificação: ..." logo após o objeto na Cláusula
  Primeira — **se vazio, a cláusula fica exatamente como o texto padrão**
  (nenhuma mudança). Funciona tanto no tipo `limpeza_reservatorio` sozinho
  quanto no combo (a linha de dedetização não bate no regex).
- Só existe no fluxo **avulso** (criado direto no admin) — orçamentos vindos
  de O.S./IA continuam com `tipo = 'pecas'`.

### Valor unitário opcional + total manual (migration 062, tipo `pecas`)

- **Item sem preço não vira "R$ 0,00" no PDF.** Antes, `valor_unitario` era
  `NOT NULL DEFAULT 0` em `orcamento_linhas` — deixar o campo "Unit." em
  branco no admin salvava `0`, indistinguível de um item realmente gratuito,
  e o PDF mostrava "R$ 0,00" nas colunas Valor Unit./Total. Migration 062
  tirou o `NOT NULL DEFAULT 0`; agora fica `NULL` de verdade, e
  `fmtMoeda(null)` (que já tratava `null` como "—") passa a valer pro caso
  real — a coluna de valor daquele item some, só sobra descrição/ficha
  técnica/qtd.
- **Total manual (override):** `orcamentos.valor` (coluna que já existia,
  herdada do fluxo antigo de aprovação por O.S., nunca usada pelo avulso até
  agora) virou o campo **"Valor total (manual)"** no modal — abaixo da
  tabela de itens. Preenchido, sobrepõe a soma de `orcamento_linhas` tanto no
  PDF (`totalGeral` em `renderHTML`/`renderHTMLServico`) quanto nas listagens
  (`valor_total` em `GET /admin/orcamentos/avulsos`, envio por e-mail,
  histórico do condomínio — todos viraram `COALESCE(o.valor, SUM(...), 0)`).
  Vazio, comportamento idêntico a sempre (soma os itens). Existe justamente
  pro caso de orçamento com item(ns) sem preço lançado, onde a soma
  automática não reflete o total real cobrado.
- Inputs de "Unit." no admin (`_avRenderLinhas`, tabela de itens do modal
  avulso, e `orcNewValor`/`avNewVal` nos formulários "+ Adicionar item")
  aceitam ficar em branco — antes só aceitavam número ≥ 0 e forçavam `0` via
  `Math.max(0, Number(v) || 0)`.
- **Total manual esconde as colunas de valor por item no PDF.** Preencher
  "Valor total (manual)" (`orcamentos.valor != null`) significa que o preço não
  vem da soma dos itens — então `renderHTML` omite as colunas **Valor Unit.** e
  **Total** da tabela (`#`, Descrição, Qtd apenas) e `renderHTMLServico` omite o
  `.valor-num` de cada linha; só o box **VALOR TOTAL** aparece. Antes as colunas
  vinham do mesmo jeito, cheias de "—" ou com valores parciais que não fechavam
  com o total. `renderMeasureHTML` espelha a mesma condição (thead e linhas de
  amostra) — se divergir, a medição de altura erra a paginação.

## Rastreamento GPS dos técnicos

- App do técnico envia posição periodicamente: `POST /tecnicos/localizacao`
  (frequência via `gps.frequencia_segundos`, default 60s).
- Posição atual em `tecnico_localizacoes` (1 linha por técnico); trilha em
  `tecnico_localizacoes_historico`.
- Admin: `GET /tecnicos/localizacao` (mapa de posições),
  `GET /tecnicos/:id/historico-gps`.
- Retenção do histórico via `gps-cleanup.job.js` (`gps.retencao_horas`).
- A IA usa o GPS para estimar ETA (`buscar_status_tecnico` → Haversine).

## Planos de manutenção e contratos

- **`planos_manutencao`** — preventiva recorrente por condomínio
  (`periodicidade_dias`); `planos-manutencao.job.js` gera chamado **P4** ao
  vencer (`planos.geracao_enabled`). `POST /planos-manutencao/:id/executar-agora`
  força a geração.
- **`contratos`** — `tipo` (mensal/anual/avulso), `valor_mensal`,
  `dia_vencimento`; métricas em `GET /contratos/metricas`. Índice único de
  contrato ativo por condomínio.
