---
tags:
  - projeto
  - fluxo
aliases:
  - Painel Admin
  - Mission Control
  - Painel de operação
  - Admin
---
# Painel admin (`/admin/painel`)

A superfície interna de operação: quem olha N condomínios ao mesmo tempo. Serve
as roles **admin**, **gerente** e **operador** (divisão em
[`autenticacao.md`](autenticacao.md)). É uma SPA de arquivo único —
`public/admin.html` (147 KB), `public/admin.js`, `public/admin.css` (8.273
linhas) — sem build e sem framework, servida pelo Express.

Não confundir com o [painel do cliente](painel-cliente.md), que é outra folha,
outro público e outro sistema visual.

---

## As 15 telas

Não há rota por tela: tudo é `showSection(nome)` alternando `.section` no mesmo
documento. Os nomes abaixo são os `data-section` reais.

| Grupo na nav | Seções |
|---|---|
| **Agora** | `alertas` · `whatsapp` (Atendimento) · `chamados` |
| **Em curso** | `ordens-servico` · `orcamentos` |
| **Cadastro** | `cadastros` (Clientes) · `tecnicos` (Colaboradores) · `equipamentos` · `contratos` · `planos` |
| **Análise** | `dashboard` · `telemetria` · `mapa` · `relatorios` |
| **Sistema** | `config` |

> ⚠️ **O perfil `operador` vê cinco:** `alertas`, `chamados`, `telemetria`,
> `mapa` e `config` (só a aba "Conta"). Desde 27/08/2026 as outras dez não são
> apenas escondidas — as rotas delas respondem 403 pra ele. Lista e método de
> conferência em [`autenticacao.md`](autenticacao.md).

Os nomes dos grupos aparecem na sidebar aberta (mono, caixa alta) em quase
toda janela — só somem, virando um filete de 1px, quando a janela do
navegador tem menos de 700px de altura (notebook com barra de tarefas) ou
quando a sidebar está recolhida (ícones só, sem espaço pra letra). Em
qualquer um dos dois casos o texto continua no HTML — o `admin.js` varre
esses elementos pra esconder grupo órfão no perfil operador, e o leitor de
tela continua lendo. Esse perfil esvazia **dois** grupos inteiros hoje ("Em
curso" e "Cadastro"), então a varredura não é hipótese: sem ela sobram dois
cabeçalhos sem nenhum item embaixo.

⚠️ A densidade da sidebar tem **oito degraus de `@media (max-height)`**
(base, 1000, 940, 890, 850, 800, 750, 700), e a granularidade é
intencional: faixa larga obriga os valores a caber no pior viewport dela, e
foi o que já deixou o menu espremido com vão morto no pé. Ao mexer em altura
de item, padding da `.nav` ou margem do rótulo, **remeça a escada inteira** —
cada degrau é conferido no piso da própria faixa com o pior caso de 15 itens.
Motivo, tabelas e método no [changelog](../changelog.md) e em
[decisions.md](../../memory-bank/decisions.md).

Mais **10 overlays de modal**, **1 gaveta** (`drawer-panel`, por condomínio,
aberta a partir do dashboard) e **6 colunas de ficha** (`ch-detail-col`).

⚠️ `whatsapp` é o item **"Atendimento"** da nav e nasce `display: none` no
HTML — só aparece quando a integração está ligada. É por isso que a nav tem
dois tamanhos (14 ou 15 itens); o dimensionamento da sidebar sempre usa o pior
caso, 15.

## Os três moldes

Perfilando o markup, as 15 telas caem em três esqueletos. Isso é o fato mais
útil deste documento: **9 telas são a mesma tela**.

| Molde | Telas | Esqueleto |
|---|---|---|
| **A · Lista → ficha** | alertas, cadastros, chamados, ordens-servico, orcamentos, contratos, tecnicos, equipamentos, planos — **9** | faixa de KPI → barra (abas + busca + ação) → tabela → coluna de ficha |

⚠️ **`orcamentos` saiu do molde A nas DUAS abas** (a de avulsos primeiro, a de
"Solicitados pelos técnicos" em 02/09/2026): lá a tabela virou lista de
**condomínios**, a coluna de ficha virou a lista de documentos daquele prédio,
e a ficha foi para o modal de tela cheia. Ver a seção própria abaixo.
| **B · Superfície viva** | dashboard, mapa, telemetria, whatsapp — **4** | mapa/gráfico/conversa ocupa a área, controles pousam por cima |
| **C · Formulário** | relatorios, config — **2** | campos agrupados + ação |

## O campo de escolher prédio (`condo-picker.js`, 02/09/2026)

⚠️ **`<select>` com a carteira dentro não serve, e o motivo é dado, não gosto:**
são **86 prédios** em produção e **71 deles** têm nome fantasia diferente da
razão social. O select não filtra, e mostrava `c.nome` — a razão social. Quem
atende o telefone ouve o nome da porta e procurava por um nome que não está
escrito na tela.

`public/condo-picker.js` é **compartilhado com o painel do operador**, no molde
do `inatividade.js`. Não fere a regra de que `operador.js` não importa de
`admin.js` — um terceiro arquivo sem dono é o contrário de virar refém.

| | |
|---|---|
| Busca em | fantasia · razão social · bairro · cidade |
| Normalização | sem acento, sem caixa; todos os termos casam em qualquer ordem |
| Na linha | nome de tela em cima; razão social **só quando difere** |
| Realce | âmbar de **preenchimento** + barra de 2px — nunca tinta (ver abaixo) |

⚠️ **O campo original vira `<input type="hidden">` com o MESMO id.** Todo
`getElementById("ncCondo").value` que já existia continua valendo. É o seam que
torna a troca segura numa tela que grava chamado — e o caminho para adotar o
componente nos outros seis selects de condomínio do painel, que seguem nativos.

⚠️ **E POR ISSO O `id` TROCA DE DONO: tudo o que o componente guarda "no
campo" tem de ir no hidden.** O original sai da montagem SEM id, então de
`montar` em diante `getElementById(campoId)` devolve o **hidden** — inclusive
no guard de "já montado". Marcar o original deixava esse guard cego a partir da
segunda chamada: o admin abre o modal com HTML fixo e chama `montar` a cada
abertura sobre o mesmo elemento, e o resultado eram pickers aninhados, um por
abertura (relato de 03/09/2026: *"está aparecendo 3 seletores"*), com só o
último ligado ao valor que o `salvar` lê. O operador escapou por acidente:
redesenha o modal inteiro a cada vez, com um `<select>` novo em folha.

Pelo mesmo motivo, um `<label for="…">` externo é reapontado para o campo de
busca (`<id>_busca`) — deixado no id antigo ele rotularia o hidden, que não
recebe foco.

⚠️ **O fundo da lista muda por superfície:** `--surface` no admin (ela abre
dentro de modal, que é placa clara, e o degrau tem de ser para CIMA) e
`--surface2` no operador (campo marinho). Terceira vez que essa conta aparece
nesta casa — ver a nota do trilho do orçamento.

⚠️ **`.f span` ALCANÇA OS SPANS DA LISTA** (03/09/2026). O campo mora dentro de
um `<label class="f">`, e `.f span` é seletor descendente (0,2,0): ele pintava
`.cbx-nome` e `.cbx-sub` (0,1,0) de rótulo — 11px, peso 700, caixa alta — e o
nome do prédio saía idêntico à razão social. As regras do picker são
`.cbx-lista .cbx-item .cbx-nome`/`.cbx-sub` por isso, e não por estilo de
escrita. **Terceira vez que esse seletor cobra o mesmo**: `.f span em` e
`.f span.cep-msg` são as anteriores. Componente novo com `<span>` dentro de um
`.f` paga de novo.

### Como olhar o modal sem entrar no painel

`/dev/_novo-chamado-preview.html` (só fora de produção, pela rota
`/dev/:arquivo`). Ela **recorta o `#novoChamadoOverlay` do `/admin/painel`
servido na hora** — markup e CSS de produção, sem cópia — e traz um botão
"abrir e fechar 3×" com placar de campos de busca na tela. Existe porque os
dois defeitos desta seção só apareciam depois do login, que é como eles
chegaram ao Pedro em vez de morrer no desenvolvimento.

⚠️ O `<script>` dela é **arquivo externo** (`_novo-chamado-preview.js`): o
helmet usa `script-src 'self'`, e script embutido não executa nem avisa.

Teste: `scripts/testes/condo-picker.test.js` (`node`, sem navegador, 16
checagens). ⚠️ **O `getElementById` do DOM falso precisa procurar pelo `id` de
verdade** — enquanto ele devolvia o `<select>` original para toda chamada, o
teste vivia um DOM em que o id não troca de dono, que é exatamente a condição
de que o bug dos três seletores dependia. E ⚠️ **teste sem navegador não vê
nada de aparência** — o atropelo do `.f span` acima passou por ele inteiro.

---

## O vocabulário está com o nome errado

`admin.css` tem **22 prefixos de classe próprios** — `tel-` (169 seletores),
`ch-` (119), `mp-` (116), `av-` (107), `al-` (104), `wa-` (83), `mc-` (83),
`os-` (68), `rel-` (57), `orc-`, `cfg-`, `pm-`, `edit-`, `cc-`, `rc-`, `tec-`,
`sla-`, `ctr-`, `dp-`, `wz-`, `nav-`, `tank-`.

Só que o vocabulário compartilhado **já existe**, batizado com o nome da tela
que nasceu primeiro:

- `.wa-tabs` / `.wa-tab` / `.wa-count` — nome de *WhatsApp* — usado em **10 das
  15 seções**.
- `.ch-layout` / `.ch-detail-col` / `.ch-toolbar` — nome de *Chamados* — usado
  em **6**.

Ao mexer aqui, saiba que renomear um desses quebra várias telas de uma vez.

---

## Defeitos medidos (18/08/2026)

Levantados percorrendo o painel em execução contra o banco de teste, não lendo
o código. Ficam registrados porque são a base da direção proposta abaixo.

**A faixa de KPI domina 10 das 15 telas.**

| Tela | KPIs | Altura antes do conteúdo | Linhas visíveis |
|---|---|---|---|
| `chamados` | **6, em 2 fileiras** | **~330px** | **5** |
| `telemetria` | 5 | ~140px | 1 reservatório |
| `dashboard` · `alertas` · `cadastros` | 5 | ~120px | 7 |
| `mapa` · `ordens-servico` · `contratos` · `planos` · `orcamentos` | 4 | ~120px | 0 a 5 |
| `tecnicos` · `equipamentos` · `relatorios` · `config` · `whatsapp` | 0 | — | — |

`ordens-servico` gasta 4 cards para 1 registro; `contratos` mostra 4 cards com
`0 · 0 · 0 · R$ 0,00` sobre uma tabela vazia. ⚠️ As duas telas **mais novas**
(`equipamentos`, `tecnicos`) não têm faixa e são as mais limpas do painel — o
padrão já está sendo abandonado na prática.

**O mesmo rótulo significa coisas diferentes.** `dashboard` diz `OFFLINE 4`
(dispositivos), `mapa` diz `OFFLINE 1` (condomínios). `telemetria` diz
`ALERTAS CRÍTICOS 8`, `alertas` diz `CRÍTICOS 7`, `mapa` diz `CRÍTICO 0`.
Não é bug — são unidades diferentes, e **nenhum rótulo declara a unidade**.

**A coluna de ficha nasce vazia ocupando ~28% da largura**, preenchida por
ícone-placeholder: chave de 160px em `tecnicos`, avatar de 130px em
`cadastros`, documento de 130px em `chamados`. `whatsapp` tem duas colunas
vazias mais a lista vazia.

**Seis vocabulários de estado para o mesmo conceito:** `P2 Alta` ·
`SLA ESTOURADO` · `Finalizada` · `AGUARDANDO ORÇAMENTO` · `ETIQUETA EM BRANCO`
(texto puro, sem pill) · `Disponível`.

**Colunas mortas:** `cadastros` tem `CNPJ` inteira em `—` e `CONTRATO` inteira
em `…`; `alertas` tem `AÇÕES` com um único ícone.

**`relatorios` tem uma barra âmbar de 4px na borda esquerda** do "Painel ao
vivo" — único lugar do painel com isso, e é o padrão que o
[`DESIGN.md`](../../DESIGN.md) proíbe por escrito.

**`planos` é a melhor tabela do painel e ninguém copiou:** agrupa por zona e
técnico, mostra data absoluta **e** relativa (`23/01/2027 · em 158 dias`,
`vencido há 2 dias` em vermelho) e tem seleção em lote.

---

## As duas abas de Orçamentos passaram a ser a mesma tela (02/09/2026)

Pergunta do Pedro: *"se no app o técnico colocar que é necessário orçamento,
essa informação chega onde?"*. A resposta era **uma tela só** — a aba
"Solicitados pelos técnicos" — e ela tinha dois problemas.

### ⚠️ O estado que a tela existe para mostrar não era contado

O técnico marca `orcamento_necessario` na O.S. e o escritório ainda não abriu
nada: a O.S. vem do `GET /admin/orcamentos` (o `LEFT JOIN` existe justamente
para isso — o comentário está na rota desde que virou LEFT), mas com
`orcamento_status` **NULO**.

A tabela já sabia desenhá-lo: `_orcStatusLabel(null)` devolve **SOLICITADO**, e
o `.orc-status-req` é âmbar de propósito. **Quem não sabia era todo o resto** —
o KPI "Pendentes", os contadores das abas e os **dois** badges contavam
`status === 'rascunho'`, e nulo não é rascunho. O pedido recém-chegado do
técnico não entrava em contador nenhum.

Somando o segundo defeito, o efeito era este: **o badge da barra lateral só
existia depois de alguém abrir a seção** — `_orcAtualizarBadge` só roda dentro
de `carregarOrcamentos`, e essa só era chamada ao ENTRAR em Orçamentos. Um
pedido do técnico ficava sem sinal em lugar nenhum até alguém entrar na aba,
na aba interna certa e na sub-aba "Todos" (sob "Pendentes" ele nem aparecia).

Hoje: `_orcSolicitado(o)` nomeia o estado, existe a aba **Solicitados**, o KPI
conta, o badge soma **solicitado + rascunho** (os dois estados abertos) e
`carregarTudo` carrega a lista no boot — uma requisição a mais na primeira
carga e nenhuma no polling, porque `carregarTudo` não roda em intervalo.

### O layout: as duas abas usam o mesmo esqueleto

Elas vivem na mesma seção, a um clique uma da outra, e eram coisas diferentes:
"Criar orçamento" já era master-detail agrupado por condomínio; "Solicitados
pelos técnicos" era uma tabela de 7 colunas. A pergunta das duas é a mesma —
**"o que este prédio está esperando de orçamento?"** — e agrupar é o que
permite respondê-la de uma vez: um técnico que pediu três coisas no mesmo
prédio virava três linhas soltas na tabela.

| Peça | Vem de |
|---|---|
| Coluna esquerda | `.av-condo-row` + `.av-dot` — os mesmos da aba irmã |
| Painel | `.av-orc-pane-head` + `.av-orc-list` + `.av-orc-item` |
| Ficha | o modal de tela cheia `#avModal`, que **já** era o destino do botão "Preencher orçamento" e já carregava a observação do técnico |

Nenhuma classe nova de estrutura. A única acrescentada é `.av-orc-item-obs`,
a **observação do técnico na linha** — ela não é metadado, é o texto que a aba
existe para entregar, e quem lê esta lista decide o que orçar por ele. Teto de
duas linhas para a lista seguir varrível; o texto inteiro está no modal.

⚠️ **A ORDEM NÃO É ALFABÉTICA, e é a única diferença deliberada em relação à
aba irmã.** Lá a lista é cadastro; aqui é fila de trabalho, e a tela responde
"por onde começo" — quem tem pedido sem orçamento sobe, no grupo e dentro dele.

⚠️ **Aprovar e Rejeitar mudaram do painel para o rodapé do modal**, e não foi
arrumação: o `_orcAcao` escreve o resultado em `#orcFormMsg`, que **só existe
dentro do modal**. Aprovar pelo painel era uma ação sem confirmação e sem
mensagem de erro. Rejeitar só aparece em `rascunho` ou `aprovado` — não se
recusa o que ninguém orçou ainda.

⚠️ **Dois defeitos antigos apareceram ao verificar o modal:** o título saía
"Orçamento formal · OS OS-2026-0042" (o `numero` já traz o prefixo), e o botão
"Gerar PDF" usava `#f0b014` como **texto** sobre a placa clara — **1,6:1**
medido, contra os 4,5 do piso. É a Regra do Amarelo Cego do
[DESIGN.md](../../DESIGN.md): trocado pelo token `--warn`, que vira `--warn-t`
(#886116) dentro do `.av-modal-dialog` e mede **4,67:1**.

### O chamado aberto por aqui não sabia que executava um orçamento (03/09/2026)

`chamados.orcamento_id` existe desde a migration 079, mas só a rota do painel
do operador escrevia nela. O `POST /chamados` — o que este modal usa, e o
caminho normal de despacho — não aceitava o campo.

Efeito: o técnico ia, fazia, fechava a O.S., e o orçamento continuava em
"Aprovados" dizendo "Pode executar". Não era desfecho perdido, era vínculo que
nunca existiu. Ver [painel-operador.md](painel-operador.md) para o outro lado.

O modal ganhou o bloco **"Serviço já autorizado"** (`#ncOrcBloco`), alimentado
por `GET /admin/condominios/:id/orcamentos-pendentes` quando o prédio é
escolhido — o `change` do hidden do [`condo-picker`](../../public/condo-picker.js)
borbulha até o overlay, e é por isso que a delegação sobrevive ao `montar()` de
cada abertura, que troca o elemento.

⚠️ **O bloco só existe quando há o que escolher.** A maioria dos chamados não
tem orçamento por trás; um bloco vazio permanente ensina a ignorá-lo.

⚠️ **A escolha desmarca no clique.** Sem isso, escolher por engano só se desfaz
fechando o modal — e perdendo o que já foi digitado.

⚠️ **Selecionado é fio de tinta cheia, não âmbar.** O amarelo desta tela é do
"Criar chamado". É a mesma regra que tirou o `btnAccent` do seletor de modo no
modal de envio de orçamento.

⚠️ **`.nc-orc` usa os tokens de PLACA CLARA.** `.modalBox` remapeia `--muted` e
`--border` para a família `--tinta`/`--fio-esc`; cor crua ali dá azul-claro
sobre cinza. Regra dos Dois Campos de Estado do [DESIGN.md](../../DESIGN.md).

### O pedido do técnico só saía da fila por um checkbox escondido (03/09/2026)

Relato do Pedro: *"um técnico fez a solicitação de um orçamento via O.S., mas
esse orçamento já havia sido enviado, e eu não consigo apagar ele nem a pau"*.

**A linha desta aba não é o orçamento — é a O.S.** com
`orcamento_necessario = TRUE`. O **"Excluir orçamento"** do modal apaga o
*documento*, e a flag continua ligada: a linha volta no próximo carregamento,
agora como SOLICITADO e sem o orçamento que existia. Clicar nela de novo chama
`_orcMaterializarEAbrir` e **cria** um rascunho — a tela em que ele tentava
limpar a fila era a mesma que a realimentava.

O único lugar que desligava a flag era o checkbox `#osEdOrcamento`, dentro do
editor da O.S. Ninguém adivinha que é ali o botão de "tirar isto da fila de
orçamentos", e a aba inteira não tinha ação nenhuma além de abrir o documento.

Hoje cada linha de pedido tem uma **lixeira** (`.av-orc-item-del`) que chama
`DELETE /admin/orcamentos/:os_id` — ver [`../api.md`](../api.md).

⚠️ **A lixeira é SEMPRE VISÍVEL, não aparece no hover.** A saída daqui não
existia; escondê-la atrás do mouse seria repetir o problema de outro jeito. Ela
fica cinza-fraca e só ganha `--danger` quando apontada, para não competir com o
selo de status, que é o que a linha comunica.

⚠️ **Ela não aparece no pedido da bancada** (`fonte === "bancada"`): esse não
tem O.S. por trás, e a exclusão dele é a do próprio orçamento, no modal.

⚠️ **O confirm diz qual dos dois casos está na frente.** Pedido sem orçamento
("a O.S. continua no sistema, ela só sai desta fila") e pedido com orçamento
ENVIADO ("excluir APAGA esse orçamento junto") não podem fazer a mesma
pergunta: o segundo destrói um documento.

⚠️ **O avulso enviado por fora não é tocado** — ele não tem `os_id`. Foi o que
o Pedro pediu, e é o que impede que limpar uma fila destrua um documento que o
cliente já recebeu.

#### E o "Excluir orçamento" do modal mentia

`_avAcaoModal("deletar")` **não olhava `r.ok`**: desse 500 ou não, a lista local
era filtrada, o modal fechava e a tela redesenhava. O orçamento sumia na hora e
voltava no F5 — a outra metade do "nem a pau", e do tipo que não deixa rastro
para depurar. Agora ele para na `.orc-form-msg` do trilho com o erro do
servidor.

### ⚠️ Existe UM modal de orçamento, e ele é o do avulso (02/09/2026)

A aba "Solicitados pelos técnicos" é **lista**; o documento se edita no modal
de `#avModal`, o mesmo da aba "Criar orçamento". Não há um segundo modal.

O caminho é o `_orcAbrirDaBancada`, que já existia para o pedido nascido na
oficina: acha o orçamento em `_avData` e chama `_avRenderPainel()`. Funciona
porque **`GET /admin/orcamentos/avulsos` não tem `WHERE`** — a lista já contém
os orçamentos nascidos de O.S.

| Estado do pedido | O que o clique faz |
|---|---|
| Já tem `orcamento_id` | abre o modal direto |
| `SOLICITADO` (sem orçamento) | `_orcMaterializarEAbrir` → PATCH `acao:"salvar"` cria a linha, recarrega `_avData`, abre |

⚠️ **O rascunho nasce na abertura** — decisão do Pedro. Quem cria é o backend
(`_garantirOrcamentoDaOs`), que já trata o caso de a bancada ter pedido antes:
adota o orçamento solto em vez de abrir um segundo para o mesmo serviço.

⚠️ **O trilho mostra o pedido do técnico quando há `os_id`.** É a única coisa
que o modal descontinuado tinha e este não — dez linhas condicionais. Os campos
(`orcamento_observacoes`, `os_tecnico_nome`, `os_chamado_id`) viajam no próprio
`GET /avulsos`, que já faz o `LEFT JOIN` com `ordens_servico`.

### ⚠️ "Vinculo a O.S. e volta para 'Nenhuma'" — era a RESPOSTA, não a escrita (03/09/2026)

Relato do Pedro: *"fiz um orçamento e estou tentando vincular ele a uma os e
nao estou conseguindo, qnd eu salvo o orçamento volta para 'nenhuma'"*.

**O vínculo sempre foi gravado.** O `UPDATE` do
`PATCH /admin/orcamentos/avulsos/:id` incluía `os_id` desde o começo e o banco
ficava certo — dava para provar com um `SELECT`, e é por isso que o defeito
sobreviveu. O que faltava era `os_id` **no `RETURNING`**.

O `_avSalvar()` do `admin.js` faz:

```js
Object.assign(_avData[idx], j);   // j = a resposta da rota
_avRenderPainel();                // redesenha do estado LOCAL
```

⚠️ **`Object.assign` não toca em chave ausente.** Sem `os_id` na resposta, o
estado local continuava com o valor de antes do salvamento — `null` —, e o
redesenho montava o `<select>` em "Nenhuma". A tela dizia que o vínculo tinha
sido recusado enquanto ele estava gravado. **Um F5 mostrava o vínculo certo**,
porque o `GET /avulsos` sempre trouxe `o.os_id`.

**A lição, que vale para toda rota `PATCH` deste painel:** quando o front
reconstrói a tela a partir do que a rota devolve, **o `RETURNING` é contrato de
interface**, não conveniência de log. Campo que o formulário edita e não volta
na resposta vira "não salvou" aos olhos de quem usa.

Junto vieram os campos derivados da O.S. (`os_numero`, `os_tecnico_nome`,
`os_chamado_id`, `os_finalizada_em`, `orcamento_observacoes`), que só existiam
no `LEFT JOIN` do `GET`. É o que faz o trilho "O que o técnico pediu" aparecer
**no mesmo salvamento**, em vez de só depois de recarregar.

⚠️ **As chaves derivadas vêm SEMPRE, com `null` quando não há O.S.** Devolvidas
só quando há vínculo, o `Object.assign` deixaria as antigas e o trilho seguiria
mostrando o técnico de uma O.S. que não está mais ligada — desvincular pela
metade.

⚠️ **E `os_id` saiu do ramo genérico do `PATCH`**, onde caía em
`String(v).slice(0, 255)`: o vínculo chegava como a **string** `"102"` numa
coluna `integer`. O cast implícito do parâmetro salvava o caso comum, mas
string vazia estoura `22P02` (`pg_strtoint32_safe`) e derruba o salvamento
inteiro em 500. Agora anda com `condominio_id`, como inteiro.

Teste: `scripts/testes/orcamento-vincula-os.test.js` (rota de verdade contra o
banco de teste, 15 checagens). ⚠️ **Ele simula o `Object.assign` do front** —
um teste que só conferisse a tabela passaria verde com o bug de pé, que é
exatamente o que a tela fez. Rodado contra o código anterior: 6/15.

### ⚠️ Vínculo NÃO é pedido do técnico (03/09/2026)

Segundo relato do Pedro, no mesmo dia: *"em um orçamento dps q eu vinculei a OS
tinha isso 'O que o técnico pediu / Marcou que precisa de orçamento e não
escreveu o quê. Vale ligar para José Glebson.' MAS ELE N TAVA NA TELA DE
'SOLICITADOS PELOS TECNICOS' PQ?"*.

**Porque são dois campos diferentes, e o trilho tratava um como o outro:**

| | O que significa | Campo |
|---|---|---|
| Aba "Solicitados pelos técnicos" | o técnico marcou "precisa de orçamento" na O.S. | `ordens_servico.orcamento_necessario` |
| Trilho "O que o técnico pediu" | este orçamento está **vinculado** a uma O.S. | `orcamentos.os_id` |

O trilho aparecia só olhando `os_id` e daí **afirmava** o pedido. O nome do
técnico também não era escolha: é quem assinou a O.S., pelo `LEFT JOIN
tecnicos`. Resultado: a tela mandava ligar para alguém sobre um pedido que ele
nunca fez.

⚠️ **A premissa era verdadeira até o dia anterior.** Enquanto a única forma de
existir `os_id` era o backend criar o orçamento a partir de um pedido
(`_garantirOrcamentoDaOs`), "tem vínculo ⇒ houve pedido" valia. O conserto do
`<select>` (ver a seção acima) fez o **vínculo manual** funcionar, e a premissa
quebrou no mesmo dia — o bug latente virou visível.

Dois caminhos levam ao que o Pedro viu:

1. a O.S. nunca teve pedido, e o vínculo foi feito à mão — o caso dele;
2. a O.S. teve pedido e alguém o resolveu (a lixeira da aba, ou o checkbox
   `#osEdOrcamento`, desligam a flag), enquanto o orçamento seguiu vinculado.
   O texto no presente mentiria igual.

**O que passou a valer:** o trilho depende de `orcamento_necessario`, não de
`os_id`.

- **Com pedido** → "O que o técnico pediu", como antes.
- **Sem pedido** → "O.S. vinculada", com *"Vinculada aqui pelo escritório. O
  técnico não pediu orçamento nesta O.S."*

⚠️ **O bloco não some quando não há pedido** — a O.S. vinculada é informação
útil (número, técnico, chamado). Ele só para de alegar que alguém pediu.

⚠️ **Flag ausente não é tratada como pedido.** Registro antigo em cache, ou uma
rota que ainda não devolva o campo, cai no ramo "sem pedido": a alegação é que
precisa de prova, não o contrário.

O campo viaja como `os_orcamento_necessario` **nas duas rotas** —
`GET /admin/orcamentos/avulsos` e `PATCH /admin/orcamentos/avulsos/:id` —,
porque o modal é montado pelas duas.

Testes: `scripts/testes/trilho-os-vinculada.test.js` (13 checagens, renderiza o
bloco direto do `admin.js`) e as 7 checagens novas em
`orcamento-vincula-os.test.js`. A prévia
[`/dev/_orcamentos-preview.html`](#para-olhar-sem-sessão-dev_orcamentos-previewhtml)
ganhou o orçamento **605** exatamente neste estado.

#### O que foi removido, e por que existia

Havia um segundo modal, com 13 funções paralelas (`_orcFormalHtml`,
`_orcRenderItens`, `_orcAcao`, `_orcCarregarItens`, `_orcAdicionarItem`,
`_orcEditarItem`, `_orcRemoverItem`, `_orcGerarPdf`…). Ele fazia **menos** que
o original: sem envio por e-mail e sem tipo de documento — então um orçamento
de limpeza de reservatório nascido de O.S. saía com o layout de peças no PDF.

⚠️ **E havia duas delegações de evento no mesmo `#avModalBody`**, a desta aba e
a do `_avBindEventos`. Não deu defeito visível porque os `data-*` diferiam
(`data-orc-action` × `data-av-action`), mas qual responderia dependia da ordem
de registro. Saiu junto.

**−525 linhas, +129.** As notas abaixo descrevem o modal descontinuado e ficam
como registro do que custou chegar aqui.

---

### ⚠️ O modal do orçamento era dano colateral do modal avulso

Reclamação do Pedro, com o print: *"mas o modal para fazer o orçamento você
não arrumou né?"*. Estava certo — eu tinha consertado três defeitos pontuais
(título duplicado, selo colidindo com o ×, contraste do PDF) e nunca desenhado
a tela.

**Os dois modais de orçamento dividem o `#avModal`.** Em algum momento o
avulso ganhou layout de duas colunas, e o shell foi ajustado para ele:
`padding: 0`, `display: flex`, `height: min(92vh, 880px)`, `max-width: 1360px`.
**Só o avulso tem a marcação desse layout.** O modal da O.S. despejava
`.av-modal-head` + `.orc-form-section` num diálogo sem padding nenhum:

- rótulo colado na borda esquerda, campo colado na direita — medido, **0px**;
- cabeçalho recuado 20px por regra própria, corpo em zero: os dois desalinhados;
- 1360px de largura gastos com campos de 660, metade da faixa vazia;
- sem zona de rolagem: o formulário inteiro era uma coluna só, e o total
  ficava numa linha de 12px no fim da tabela.

Agora ele usa os mesmos componentes do avulso — `.av-layout`, `.av-col-form`,
`.av-itens-zone`, `.av-itens-scroll`, `.av-cond`, `.av-rail` — e herda de graça
o que já tinha sido resolvido lá: só a zona de itens rola, o "+ Adicionar
item" gruda no pé dela, e as condições comerciais nascem fechadas com o resumo
escrito no sumário.

⚠️ **O QUE ESTE MODAL TEM E O AVULSO NÃO: um documento de origem.** O trilho
da direita mostra **o pedido do técnico** — a observação dele, quem foi, de
qual chamado veio, quando a O.S. fechou. É material de consulta enquanto se
escreve, e por isso fica **ao lado** e não acima: como faixa no topo ele rolava
para fora da vista exatamente quando o operador começava a lançar os itens.

⚠️ **O total mudou de lugar pelo mesmo motivo.** Ele era uma linha de 12px no
fim da tabela — **dentro da zona que rola**, então sumia a partir do quarto
item, que é justo quando o número começa a importar. No trilho é o
`.av-total` do avulso: mono, 29px, sempre visível, com um subtítulo que conta
os itens e avisa quantos estão **sem valor** (o caso que faz o PDF sair errado).

⚠️ **A tabela de itens ganhou `<colgroup>`** com as mesmas larguras
(84/122/122/40) do grid de `.av-itens-scroll .orc-add-item-row`. Sem ele as
colunas numéricas se auto-dimensionam e os campos de adicionar caem fora da
vertical das colunas que preenchem — verificado: cabeçalhos em 300/940/1024 e
campos em 308/948/1032, os 8px do `padding` das células.

#### O acabamento também, não só o esqueleto

Segunda passada, depois de o Pedro pôr os dois prints lado a lado: *"está do
mesmo jeito para você?"*. Não estava. Eu tinha reaproveitado o **esqueleto** e
parado ali — o acabamento seguia divergente, e é o que salta ao ver as duas
telas juntas.

| | Antes | Agora |
|---|---|---|
| Ações | rodapé com 5 botões (o avulso não tem rodapé) | **no trilho**, empilhadas, Salvar em âmbar |
| Zonas nomeadas | só ITENS e CONDIÇÕES | O DOCUMENTO · CONSTATAÇÃO · ITENS · CONDIÇÕES |
| Cabeçalho | `<h3>` com estilo inline | `.av-modal-head-icon` + `.av-modal-num` + `.av-modal-meta` |
| "+ Adicionar" | botão neutro numa linha abaixo | âmbar, **na 4ª coluna da linha** |

⚠️ **AS AÇÕES FORAM ESCOLHA DO PEDRO, entre três arranjos** — e não é decisão
de layout apenas: o avulso muda de estado por um **select "Situação"** no
trilho, e este modal tem **Aprovar/Rejeitar como botões**. Manter os botões e
mudá-los de lugar preserva o comportamento (o motivo da rejeição continua sendo
pedido no ato) e alinha a posição. O `#orcFormMsg` foi junto: é nele que o
`_orcAcao` escreve o resultado, e ele precisa estar ao lado do botão que
disparou.

⚠️ **`.orc-btn-approve` e `.orc-btn-reject` são do CAMPO ESCURO** (`#4ade80`,
`#f87171`). Ao saírem do rodapé para o trilho eles passaram a viver na placa
clara, onde medem **1,9:1** e **2,6:1** — o rótulo some. Dentro do
`.av-modal-dialog` eles agora usam a família de tinta (`--ok-t`, `--risco-t`),
com o preenchimento mais leve porque ali é fundo de botão, não de selo.

#### O contraste: três ocorrências do mesmo defeito

Preto translúcido sobrando de quando o modal era marinho, em três lugares —
`.av-rail` (`rgba(0,0,0,.22)`), o mesmo trilho no avulso, e `.av-seg`
(`rgba(0,0,0,.3)`), o seletor Cadastrado/Avulso. Sobre a placa clara todos
viram cinza médio.

As duas famílias de tinta do modal são calibradas contra `--chapa`, não contra
esse cinza:

| No trilho | Antes | Depois |
|---|---|---|
| `--tinta-2` — rótulo, chave, observação do técnico | 4,04:1 | **7,55:1** |
| `--atencao-t` — "definir manualmente", "Enviar ao cliente" | 2,78:1 | **5,20:1** |
| `.av-seg` — a aba ATIVA do seletor de cliente | 3,27:1 | **4,65:1** |

⚠️ **O DEGRAU TEM DE SER PARA CIMA, NÃO PARA BAIXO — e a primeira tentativa
errou o lado.** Usar `--surface2` (`--chapa-es`, o degrau escuro) consertava
`--tinta-2` (5,78) e deixava o âmbar em **3,98** — melhor que 2,78 e ainda
reprovado. O motivo é aritmético: a família `-t` do
[DESIGN.md](../../DESIGN.md) é calibrada contra `--chapa`, que é o **teto de
escuridão** em que ela passa. Qualquer fundo mais escuro que a placa quebra o
âmbar antes de quebrar a tinta.

Então trilho e seletor são placas **pousadas** sobre o formulário, não afundadas
nele: `--surface` (`--chapa-cl`). **Vale para o avulso também** — ele tinha os
mesmos defeitos. Varrendo todo o texto dos dois diálogos no DOM, **nenhum
abaixo de 4,5**: pior caso 4,65 no avulso e 5,78 no da O.S.

Junto foram duas trocas de `--muted2` (3,59:1) por `--text-dim` (6,78:1) no
estado vazio da tabela e na observação ausente: são frases que se leem, não
rótulos decorativos.

### Para olhar sem sessão: `/dev/_orcamentos-preview.html`

Mesma ideia do `_operador-preview.html`: a página carrega o `admin.css` e o
`admin.js` de verdade e só troca o `fetch` por uma fixture com os cinco
estados. A rota `/dev/:arquivo` não é registrada em produção.

⚠️ **A prévia EMPRESTA o `localStorage`, não o toma** — as três chaves de
sessão são devolvidas no `pagehide`. É a pegadinha já registrada no
`_operador-preview.js`: deixar `token = "preview"` para trás desloga o painel
de verdade no clique seguinte.

⚠️ **A prévia precisa de sete elementos que ela não usa** (`hardDeleteOverlay`
e companhia). O `admin.js` tem `getElementById(x).addEventListener` no topo,
**sem `?.`**: faltando um, o script estoura ali e as 8 mil linhas seguintes
nunca executam, deixando os `let` em TDZ. O sintoma foi uma tela vazia com um
erro apontando para 4 mil linhas depois da causa.

---

## O condomínio nas duas abas passa a ser o nome fantasia (02/09/2026)

Pergunta do Pedro: *"por que o condomínio que tem o nome fantasia AURI FARIA
LIMA está aparecendo na lista como ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS
LTDA?"*

Porque as duas rotas que alimentam a seção liam só `c.nome` — a **razão
social** — enquanto o PDF e o e-mail já usavam `nome_fantasia` desde a
[migration 044](../changelog.md). A regressão é a mesma que o
`orcamento-pdf.service.js` já tinha sofrido e corrigido: a 044 declarou
`nome_fantasia` como "nome principal de exibição" e metade do sistema não foi
atrás.

**O efeito era pior do que um rótulo feio.** O painel dizia "ELVIRA FERRAZ
EMPREENDIMENTOS IMOBILIARIOS LTDA" e o síndico recebia um PDF escrito "AURI
FARIA LIMA" — mesmo orçamento, dois nomes —, e quem procurava o prédio pelo
nome que a empresa usa no dia a dia não achava. Não era caso isolado: em
produção **71 dos 86 condomínios** têm fantasia diferente da razão social, e
**44 das 61 linhas** da lista de orçamentos mudavam de nome entre a tela e o
PDF (`CONDOMINIO EDIFICIO OSCAR IBIRAPUERA` → `OSCAR IBIRAPUERA`,
`BSP EMPREENDIMENTOS IMOBILIARIOS D131 LTDA.` → `BRADESCO - JOAQUIM FLORIANO`).

| Onde | Antes | Agora |
|---|---|---|
| `GET /admin/orcamentos` (as duas consultas) | `c.nome` | `COALESCE(NULLIF(c.nome_fantasia,''), c.nome)` + `c.nome AS condominio_razao_social` |
| `GET /admin/orcamentos/avulsos` | `COALESCE(c.nome, o.cliente_nome)` | idem, com `o.cliente_nome` no fim |
| PDF, e-mail, painel do cliente | já usavam fantasia | ganharam o `NULLIF` |

⚠️ **`NULLIF` não é enfeite.** `COALESCE(c.nome_fantasia, …)` aceita string
vazia: um fantasia salvo como `''` apagaria o nome da tela. As rotas de
equipamentos, planos e do select de condomínios já faziam assim — as de
orçamento eram a exceção.

⚠️ **Nome de tela ≠ nome jurídico, e a busca tem de aceitar os dois.** O blob
de `_avFiltrados`/`_orcFiltrados` só olhava `condominio_nome`; com o fantasia
ali, procurar por "Elvira" (o nome do CNPJ, do contrato e da nota) pararia de
achar. As duas rotas mandam `condominio_razao_social` junto, e ele entra no
blob e na linha `.av-orc-pane-razao` do cabeçalho do painel — só quando difere
do fantasia, porque para quem não tem fantasia cadastrado os dois textos são
iguais e repetir é ruído. É o mesmo par que o PDF imprime.

⚠️ **A perna B do `GET /admin/orcamentos` tem `GROUP BY`**, e ler
`c.nome_fantasia` no `SELECT` sem adicioná-lo ali derruba a query inteira com
`42803` no parse — irmão do `42P08` registrado no [CLAUDE.md](../../CLAUDE.md).
Não há agregação sobre `condominios` (o único `SUM` é o dos itens), então a
linha por orçamento continua a mesma.

⚠️ **A linha da razão social não pode ser apagada com `opacity`.** A primeira
versão era `--muted` a `.8` e mediu **3,26:1** no DOM: o painel é
`rgba(255,255,255,.14)` sobre `--chapa` (fundo efetivo rgb(40,49,84)), e a
opacidade compõe contra ele, comendo o contraste que o token tinha.
`--text-dim` sem opacidade dá **6,22:1**. Quem separa a linha do título é o
tamanho (11px contra 14px) e o rótulo, não a tinta.

📋 **Achado de passagem, não corrigido:** `.av-orc-pane-sub` — a contagem logo
abaixo — mede **4,22:1** com `--muted`, sob o piso de 4,5 do
[DESIGN.md](../../DESIGN.md). Anterior a esta mudança, nas duas abas.

**Verificado exercitando as rotas de verdade** — Express com o `adminRouter`,
JWT assinado com o `JWT_SECRET`, `GET` nas duas contra o banco de **produção**:
200 nas duas, e `tela="AURI FARIA LIMA" / razao="ELVIRA FERRAZ
EMPREENDIMENTOS IMOBILIARIOS LTDA"`. O orçamento sem condomínio vinculado
(`GENOVA E BARCELONA`, razão social nula) atravessa sem a linha extra.

**E em tela**, na prévia `/dev/_orcamentos-preview.html` a 1920px, nas duas
abas. A fixture ganhou `condominio_razao_social` nos quatro condomínios, com o
Aurora Paulista **igual** ao nome de exibição de propósito: é o caso "sem
fantasia cadastrado", e nele a linha não aparece. Buscar por "administradora"
ou "empreendimentos" — palavras que só existem na razão social — acha o prédio.
Console limpo após recarregar.

---

## O desfecho do orçamento, vindo da tela do operador (31/08/2026)

A lista de orçamentos (`avulsos`) e a ficha passaram a mostrar **o que
aconteceu depois do "Aprovado"**:

| Selo na lista | Quando aparece |
|---|---|
| `FEITO`, verde de fio | alguém marcou à mão na tela do operador (`orcamentos.executado_em`) |
| `CHAMADO #N`, de fio | existe chamado ligado a este orçamento (`chamados.orcamento_id`) |

E na ficha, duas linhas logo depois de "Criado por": *Feito em … marcado por …*
e *Chamado #N · na fila do turno*. A ordem da ficha é a dos fatos — alguém
monta, o cliente responde, o escritório dá baixa, o serviço acontece.

⚠️ **É LEITURA PURA. `orcamentos.status` não muda.** Quem escreve o desfecho é
[o painel do operador](painel-operador.md); um controle aqui criaria dois
lugares para dizer a mesma coisa, e nenhum dos dois seria a verdade. E o
motivo de não existir um status `executado`: ele obrigaria a auditar todo
`WHERE status = 'aprovado'` do sistema — "executado" é fato do atendimento,
não estado do documento.

⚠️ **De fio, nunca preenchido** (Regra do Selo). Nesta lista o preenchimento é
de `.av-selo-pend` (resposta sem baixa), a única coisa que pede alguém; um
segundo selo cheio ao lado tiraria dele o poder de apontar.

⚠️ **O `LEFT JOIN LATERAL` do chamado é o MESMO do `GET /operador/orcamentos`.**
Se as duas telas mostram o mesmo selo, têm de escolher a mesma linha — senão o
admin diz uma coisa e o operador diz outra sobre o mesmo orçamento.

## Direção — IMPLEMENTADA em 20–21/08/2026

⚠️ Esta seção dizia "não implementada" até 20/08. As 15 telas foram migradas
na branch `feature/admin-chapa`; o que segue é o que foi feito, não o que se
pretendia. Os defeitos medidos acima ficam como **registro do antes** — não
descrevem mais a tela.

Registrada aqui porque é o que orienta qualquer mexida futura. O "porquê", as
direções descartadas e o contrato de mundo visual estão em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

Vestir o painel com o sistema **"Chapa"** da [landing](landing-publica.md) e do
[painel do cliente](painel-cliente.md), em registro de operação — mantendo
densidade, que é a função desta superfície.

1. **A faixa vira uma linha** — de 120–330px para ~56px.
2. **A ficha só existe quando há ficha** — a coluna colapsa a zero e abre na
   seleção.
3. **Um selo de estado** — placa chanfrada, preenchida quando pede ação, de fio
   em repouso; tinta da família `-t` sobre placa clara.
4. **O rótulo declara a unidade** — `OFFLINE · dispositivos`.
5. **`planos` vira o molde da tabela** — agrupamento, data relativa, lote.

Regra de superfície, tirada da tela de login que já está em produção:
**marinho é moldura; placa clara é onde se lê e se edita** (ficha, modal,
formulário).

**Ordem de execução seguida:** pele (tokens + `@font-face`) → faixa, selo e
rótulo → ficha colapsável → tabela padrão → placa clara nos modais → tela a
tela.

### O que cada decisão virou

| # | Decisão | Resultado |
|---|---|---|
| 1 | Faixa de KPI em uma linha | 120–330px → **54px**, e virou **uma placa dividida por cortes**, não seis cartões |
| 2 | Ficha só quando há ficha | Colapsa e desliza; gatilho `:has()` no placeholder, vale nas 6 telas de `.ch-*` + Atendimento |
| 3 | Um selo de estado | Preenchido pede ação, de fio em repouso; **só uma dimensão preenche por linha** |
| 4 | Rótulo declara a unidade | Unidade ao lado do NÚMERO (leitura de instrumento), não dentro do rótulo |
| 5 | `planos` como molde | Aplicado em Chamados, Alertas, Clientes e no painel ao vivo de Relatórios |

### O que a migração achou, e que o estudo não tinha visto

- **"ALERTAS CRÍTICOS" na Telemetria era rótulo errado**, não ambíguo: o número
  vem de `_alertasAtivosUnificados()`, que conta todos os alertas ativos. O
  "8 aqui, 7 em Alertas" eram medidas diferentes, e uma mentia.
- **A faixa de KPI de Alertas era uma segunda cópia da barra de abas** — mesmos
  números, e clicar num card só trocava a aba. Removida; o tempo médio, único
  número que as abas não davam, virou leitura na barra.
- **Três KPIs de Chamados repetiam as abas logo abaixo.** Removidos. A divisão
  agora é de pergunta: abas respondem "o que está na lista", faixa responde
  "como estamos indo".
- **"Uso do TTR" mostrava `12750%`.** Virou "estourou há 21 dias". O percentual
  segue no `title`; a ordenação continua no `ORDER BY pct_ttr DESC`.
- **A barra de estado do feed do Dashboard era ELEMENTO, não `border-left`** —
  por isso o detector nunca a pegou.
- **Papel de usuário e tipo de serviço estavam preenchidos**; categoria não é
  estado. E "Etiqueta em branco" e "Baixada" estavam, respectivamente, sem selo
  nenhum e em vermelho cheio.

### Armadilhas que custaram tempo (não repetir)

- **`clip-path` faz do elemento bloco de contenção para `position: fixed`.**
  Chanfrar o `.main` quebrava o `#cfgModalOverlay` e o mapa em tela cheia, que
  vivem dentro dele. Por isso **a moldura é esquadrada e só as peças são
  cortadas**.
- **`:has()` ignora `display: none`.** `.ch-layout:has(.al-empty)` com
  descendente solto casava com um placeholder escondido na coluna da LISTA em
  Orçamentos, e zerava o gap daquela tela. Caminho exato, sempre.
- **Crase dentro de template literal fecha o template.** Um comentário HTML com
  o nome de uma tag entre crases, dentro do render do modal de orçamento, virou
  código: o modal abriu em branco e o `alert()` do catch travou o navegador.
- **Tokens translúcidos sem `backdrop-filter` vazam.** `--surface` virou `rgba`
  na troca de pele e o modal de histórico deixou a página aparecer através
  dele. Os três de superfície agora são opacos.

⚠️ O risco está na consolidação do vocabulário, não na pele: 8.273 linhas e 22
prefixos, com `.wa-*` e `.ch-*` atravessando 10 e 6 telas. Renomear com alias
temporário (`.wa-tabs, .abas { … }`) é o que torna a mudança reversível.

---

Ver também: [`painel-cliente.md`](painel-cliente.md) ·
[`landing-publica.md`](landing-publica.md) ·
[`chamados-sla.md`](chamados-sla.md) · [`../arquitetura.md`](../arquitetura.md)
· [`../../CLAUDE.md`](../../CLAUDE.md) (cache em 3 camadas — obrigatório ao
mexer em `admin.css`).
