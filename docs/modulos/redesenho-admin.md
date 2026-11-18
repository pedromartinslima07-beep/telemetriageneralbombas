---
tags:
  - projeto
  - fluxo
aliases:
  - Redesenho do admin
  - Ficha do condomínio
  - Admin por condomínio
  - Admin claro
---
# Redesenho do painel admin — o condomínio como eixo (✅ fases 1 a 5 prontas, 18/11/2026)

Plano aprovado pelo Pedro em 18/11/2026. **As cinco fases estão implementadas
na branch `feature/admin-condominio`** (sem merge, sem deploy) — ver as seções
"O que foi implementado" no fim. O
estado atual do painel está em [painel-admin.md](painel-admin.md); o "porquê"
das escolhas, em [decisions.md](../../memory-bank/decisions.md) (seção
"Painel admin — o condomínio como eixo e fundo claro").

Pedido de origem, nas palavras dele: *"o sistema está completamente bagunçado e
pouco profissional, além de estar pesado visualmente"* e *"diversas telas para
coisas que são parecidas — podia ter uma tela de condomínios, selecionando um
condomínio você teria acesso a todos os orçamentos, contrato, O.S., NF etc."*

---

## Diagnóstico (medido em 18/11/2026, banco de teste, 1440×900)

1. **O condomínio existe em três pedaços, e nenhum é inteiro.**
   - Gaveta do Dashboard (`drawer-panel`): Telemetria · Chamados · WhatsApp ·
     O.S. · Orçamentos.
   - Coluna de ficha em Clientes: cadastro, chamados, contrato, responsáveis.
   - Orçamentos: a tabela já virou lista de **prédios**, por conta própria.

   Contrato, plano, nota fiscal e equipamentos não aparecem em nenhuma delas.
   Ver a vida de um prédio exige 6–7 telas e escolher o prédio de novo em cada
   uma.
2. **15 itens no menu, 9 deles no mesmo molde** (faixa → abas → tabela →
   ficha, ver "Os três moldes" em [painel-admin.md](painel-admin.md)). Muda só
   o documento. A sidebar precisou de 8 degraus de `@media (max-height)` só
   para caber.
3. **O peso visual vem de repetição:**
   - faixa de números que repete as abas logo abaixo (O.S.: "Total 2 ·
     Finalizadas 1 · Em rascunho 1 · A enviar 1" na faixa **e** nas abas);
   - mono em caixa alta em quase todo rótulo;
   - card dentro de card, cada número com o ícone em caixinha própria;
   - âmbar em tudo (aba ativa, botão, prédio selecionado, contador, menu), e
     por isso ele deixa de dizer "olhe aqui".

## O que o mercado faz (pesquisa de 18/11/2026)

Referências: Jobber e ServiceTitan (gestão de serviço de campo, EUA), Auvo e
Field Control (Brasil). O padrão é o mesmo nos quatro:

- **O cliente é o registro central.** No Jobber, pedidos, orçamentos, serviços e
  faturas ligam ao cliente, e a página do imóvel tem abas com o trabalho em
  andamento, os pedidos, os orçamentos e os serviços daquele local.
- **O menu mantém uma lista por tipo de documento** (Clientes, Pedidos,
  Orçamentos, Serviços, Faturas). Cada uma é uma lista simples da carteira
  inteira.
- **A tela inicial mostra o que pede ação**, não um painel de números.

Daí a regra deste plano: **a ficha do prédio e a lista da carteira são o mesmo
componente**, um com filtro de condomínio, o outro sem.

Fontes: [Jobber — Client basics](https://help.getjobber.com/en/articles/client-basics/) ·
[Jobber — Navigating Jobber](https://help.getjobber.com/en/articles/navigating-jobber/) ·
[ServiceTitan — Customer portal](https://help.servicetitan.com/docs/the-new-customer-portal-end-user-experience) ·
[Omie — equipes externas integradas ao ERP](https://www.omie.com.br/blog/como-integrar-uma-gestao-de-equipes-externas-ao-erp-omie/)

---

## O menu (de 15 itens para 9)

| Menu | O que reúne | Sai de |
|---|---|---|
| **Início** | Fila do que pede ação: alerta, chamado fora do prazo, orçamento aprovado sem nota, O.S. a enviar, contrato vencendo. Visão geral da telemetria. | `dashboard`, `alertas`, `telemetria` (visão geral) |
| **Agenda** | Técnicos, preventivas do mês, mapa. | `mapa`, `planos` (acompanhamento do mês) |
| **Condomínios** | Lista + **ficha do condomínio**. | `cadastros`, gaveta do Dashboard |
| **Chamados** | Lista da carteira. | `chamados` (+ `whatsapp` quando ligado) |
| **O.S.** | Lista da carteira. | `ordens-servico` |
| **Orçamentos** | Lista da carteira (avulsos + solicitados pelos técnicos). | `orcamentos` |
| **Financeiro** | Notas fiscais, contratos, planos (cadastro). | `contratos`, `planos`, notas |
| **Relatórios** | Como está. | `relatorios` |
| **Configurações** | Inclui Colaboradores. | `config`, `tecnicos` |

`equipamentos` passa a morar dentro da ficha (aba própria) e continua tendo a
lista da carteira acessível a partir dela. ⚠️ **Nada é retirado do menu sem
autorização explícita** (regra do [CLAUDE.md](../../CLAUDE.md)): durante a
transição as telas antigas continuam alcançáveis.

⚠️ **Perfil `operador`** vê hoje `alertas`, `chamados`, `telemetria`, `mapa` e
`config` (Conta), com 403 no servidor nas outras. O menu novo tem de produzir o
mesmo recorte: Início, Chamados, Agenda e Configurações. Ver
[autenticacao.md](autenticacao.md).

## A ficha do condomínio

**Cabeçalho fixo:** nome fantasia (razão social só quando difere — mesma regra
do `condo-picker.js`), nível agora, estado da bomba, chamados abertos, contrato
vigente.

**Abas:** Resumo · Telemetria · Chamados · O.S. · Orçamentos · Notas fiscais ·
Contrato e plano · Equipamentos · Contatos.

**Resumo = linha do tempo do atendimento:** chamado → O.S. → orçamento →
aprovado → nota, na ordem em que aconteceu. É a história que hoje está
espalhada por cinco telas.

**Reaproveitado sem mexer:** o modal de orçamento em tela cheia, o modal de
O.S., o modal da nota pelo Omie ([nota-fiscal.md](nota-fiscal.md)), o de
contrato.

**Endereço próprio:** `#/condominios/123/orcamentos`. Hoje nenhuma tela tem
endereço (`showSection` alterna `.section` no mesmo documento), então voltar,
recarregar e mandar link não funcionam.

## Visual: fundo claro

| Camada | Cor |
|---|---|
| Área de trabalho | Branco levemente acinzentado, não branco puro |
| Menu lateral | Marinho (é onde a marca fica) |
| Gavetas, fichas, modais | Azul-acinzentado um degrau **mais escuro** que o fundo, para não virar "branco chapado" e mostrar que está por cima |
| Âmbar | Só ação e atenção |
| Verde / laranja / vermelho | Só estado (ok, alerta, crítico) |

Além da cor:

- **faixa de números** sai como padrão; fica um número só quando pede ação
  ("3 O.S. a enviar →");
- **mono em caixa alta** só em etiqueta pequena; título e nome de prédio voltam
  a ser texto com hierarquia de tamanho e peso;
- **bordas**: uma camada só, o fundo separa as áreas;
- **tabelas**: mais respiro, menos selos por linha.

⚠️ **O app mobile herda os tokens de `public/admin.css`.** Trocar os valores
globais deixa o app claro também. Plano: o tema claro entra como **remapeamento
de tokens no contêiner do painel** (a mesma técnica que viabilizou o Chapa em
agosto, ver [decisions.md](../../memory-bank/decisions.md)), e o app fica como
está até haver decisão própria. Não é paleta paralela: são os mesmos tokens com
outros valores numa subárvore.

---

## Fases

| # | Fase | Muda o visual? | Status |
|---|---|---|---|
| 1 | Endereço por tela (hash) | Não | ✅ 18/11 (branch) |
| 2 | Ficha do condomínio. Gaveta do Dashboard e ficha de Clientes passam a abrir a ficha | Sim, só a ficha | ✅ 18/11 (branch) |
| 3 | Menu novo + Início | Sim | ✅ 18/11 (branch) |
| 4 | Tema claro (tokens no contêiner do painel) + forma de sistema de gestão | Sim, tudo | ✅ 18/11 (branch) |
| 5 | Retirar as telas que sobrarem | Só com autorização (dada em 18/11) | ✅ 18/11 (branch) |

**Antes de começar:** fechar a branch `feature/nota-fiscal-omie` (090 e 091 em
produção, merge, push — ver [active-work.md](../../memory-bank/active-work.md)),
ou partir da `main`.

## Riscos já conhecidos

- `admin.js` tem ~17.900 linhas num arquivo só. A fase 1 é o que separa as
  listas em funções que recebem filtro; sem ela a ficha duplicaria código.
- Toda ação que grava precisa redesenhar a lista **e** agora também a aba da
  ficha (ver "Ação que grava redesenha a LISTA" em
  [painel-admin.md](painel-admin.md)).
- Cache em 3 camadas a cada mudança de `admin.js`/`admin.css`
  ([CLAUDE.md](../../CLAUDE.md)).
- Os degraus de `max-height` da sidebar ficam obsoletos com 9 itens. Remedir
  antes de apagar.

---

## O que foi implementado (fases 1 e 2, 18/11/2026)

Branch `feature/admin-condominio`, criada a partir de `feature/nota-fiscal-omie`
(a ficha precisa do modal de nota). **Sem merge e sem deploy:** depende da
branch da nota subir primeiro.

### Arquivos

| Arquivo | O quê |
|---|---|
| `public/admin-condominio.js` (novo) | Roteador por hash + a ficha inteira. Roda **depois** do `admin.js` e usa os globais dele. Mesmo molde do `condo-picker.js`: arquivo à parte |
| `public/admin.js` | `showSection` chama `_rotaAoMostrar` no fim; `ver-condo`, `ver-condo-modal`, o `ver-condo` do WhatsApp e o pin do mapa do Dashboard abrem a ficha; o botão da coluna de Clientes virou "Abrir ficha do condomínio" |
| `public/admin.html` | Seção `data-section="condominio"` (só o contêiner `cfRoot`) + o script do arquivo novo |
| `public/admin.css` | Bloco `.cf-*` no fim, **só com tokens** (a fase 4 remapeia) |

Versões: `admin.js?v=371`, `admin.css?v=277`, `admin-condominio.js?v=3`.
Nenhum endpoint novo, então o `sw.js` não mudou.

### Endereço por tela

`#/<data-section>` para as 15 seções e `#/condominios/<id>[/<aba>]` para a
ficha. Voltar e avançar do navegador, F5 e link colado funcionam. O endereço
obedece a nav: seção escondida para o perfil (operador) é ignorada.

### A ficha

- **Cabeçalho:** nome fantasia, razão social quando difere, bairro e cidade, e
  três **fatos em frase** (Água, Chamados, Contrato) clicáveis para a aba.
  Não é faixa de KPI.
- **Abas:** Resumo · Telemetria · Chamados · WhatsApp (só com a integração
  ligada) · O.S. · Orçamentos · Notas fiscais · Contrato e plano ·
  Equipamentos · Contatos.
- **Resumo:** "Pede atenção" (reservatório sem sinal ou baixo, chamado em
  aberto, resposta do cliente sem baixa, aprovado sem nota, O.S. a enviar,
  contrato vencendo em 30 dias) e o **histórico** com chamados, O.S.,
  orçamentos, notas e contratos na ordem em que aconteceram (25 mais recentes).
- **Cada linha abre o modal que já existe:** O.S. → `abrirOSDetalhe`,
  orçamento e nota → `_orcAbrirDaBancada`, contrato → `_ctrAbrirModal`,
  chamado → seção Chamados com ele selecionado, equipamento → `/e/<código>` em
  outra aba. "Abrir chamado" e "Novo orçamento" já vêm com o prédio escolhido.

### ⚠️ Desvio do plano: a ficha tem tabela própria

A fase 1 previa que as listas das telas existentes passassem a aceitar um
filtro de prédio. **Não foi feito assim.** As tabelas de O.S., Orçamentos e
Contratos são acopladas aos seus KPIs, abas, busca e seleção em lote; dar a
elas um filtro mexeria nas ~80 ações que gravam. A ficha lê **as mesmas
coleções** (`_osData`, `_avData`, `_chamadosData`, `_statusData`) e abre **os
mesmos modais**, mas desenha linhas próprias, mais simples. O que se repete é
só o HTML da linha, não regra de negócio.

### ⚠️ Armadilhas

- **A ficha se redesenha pelos ganchos, não por polling.** O fim do
  `admin-condominio.js` embrulha `_osRenderTabela`, `_avRenderTudo`,
  `renderChamados`, `renderClientes` e `_ctrRefrescarListas` (este também
  busca de novo os contratos). Função declarada no topo de script clássico é
  propriedade de `window`, e as chamadas internas do `admin.js` passam por
  ali. **Ação nova que grava precisa chamar um desses no sucesso**, senão a
  ficha fica velha (a mesma regra de 09/10 em
  [painel-admin.md](painel-admin.md)).
- **Trocar de aba não busca nada.** Contratos, planos e equipamentos são
  buscados ao abrir o prédio, ou com dado de mais de 1 min. Na primeira versão
  cada clique de aba refazia as três buscas.
- **O modal de plano mora DENTRO da seção Planos** (`pmModal`), então não
  abre por cima da ficha. A linha do plano leva à tela Planos.
- **O modal de novo chamado mora numa closure** (`_ncAbrir` não é global). A
  ficha clica no botão `btnNovoChamado` e escolhe o prédio por
  `CondoPicker.montar(...).definir(id)`, que dispara o `change` que carrega
  os orçamentos aprovados do prédio.
- **A gaveta (`drawer-panel`) não foi apagada.** Ela continua aberta por
  "ver conversa" no WhatsApp, que mostra o chat dentro dela e a ficha não tem.

### Testado (banco de teste, 18/11/2026)

Desktop 1440×900 e celular 375×812, sem rolagem horizontal. Conferido: o
endereço muda em cada seção e aba; F5 em `#/condominios/13/contatos` volta na
mesma aba; o voltar do navegador anda entre as abas; os modais de orçamento e
de O.S. abrem pela ficha; "Abrir chamado" já vem com o prédio; o pin do mapa e
o botão da coluna de Clientes abrem a ficha. **Não testado:** o perfil
operador (a regra só lê a nav) e salvar um documento pela ficha para ver o
gancho redesenhar.

---

## O que foi implementado (fase 3, 18/11/2026)

Mesma branch. Menu de 15 itens para **9 grupos**, tela **Início** e lista
geral de **Notas fiscais**.

### Arquivos

| Arquivo | O quê |
|---|---|
| `public/admin-nav.js` (novo) | Monta o menu de 9 grupos e as subabas; embrulha o `showSection` |
| `public/admin-carteira.js` (novo) | Telas Início e Notas fiscais (a carteira inteira) |
| `public/admin.html` | Seções `inicio` (agora a de abertura, `is-active` no HTML) e `notas`; dois itens novos na nav antiga; menu mobile: Dashboard → Início, Cadastros → Condomínios |
| `public/admin.js` | Só `_sectionTitles`: `inicio`, `notas`, e o Dashboard passa a se chamar "Painel" |
| `public/admin.css` | `.nav-sub`, `.ic-*`, `.nf-*` no fim, só tokens |

Versões: `admin.js?v=372`, `admin.css?v=281`, `admin-nav.js?v=3`,
`admin-carteira.js?v=2`.

### Os grupos

| Grupo | Subabas |
|---|---|
| Início | Pede ação (nova) · Painel (o antigo Dashboard) · Alertas · Telemetria |
| Agenda | Mapa · Preventivas |
| Condomínios | Condomínios · Equipamentos (a ficha também acende o grupo) |
| Chamados | Chamados · WhatsApp (quando ligado) |
| O.S. | — |
| Orçamentos | — |
| Financeiro | Notas fiscais (nova) · Contratos |
| Relatórios | — |
| Configurações | Configurações · Colaboradores |

**Nenhuma tela saiu.** Grupo com uma tela só não mostra subaba. Clicar no
grupo volta à última subaba usada nele. O badge do grupo é a soma dos badges
das subabas.

### ⚠️ A nav antiga continua lá, escondida, e manda

O `<nav class="nav">` original recebe `nav-antiga` + `hidden`, e o menu novo
é montado **a partir dele**. O `admin.js` continua escrevendo nos itens
antigos: o perfil operador esconde por `style.display`, os badges moram
neles, o `showSection` marca `.active` neles. Um `MutationObserver` na nav
antiga ressincroniza o menu novo (é como o WhatsApp aparece depois do boot).
**Para esconder uma tela de um perfil, continue escondendo o item antigo**; o
grupo some sozinho quando fica sem subaba visível.

⚠️ Os itens novos têm `data-grupo`, **nunca** `data-section`: todo
`.nav-item[data-section="x"]` do `admin.js` precisa continuar achando o item
antigo.

### ⚠️ O `showSection` agora tem dois embrulhos

`admin-nav.js` e depois `admin-carteira.js` trocam `window.showSection`. O
primeiro troca uma tela que o perfil não vê pela primeira visível do grupo (o
menu mobile manda `inicio` para o operador, que cai em Alertas); o segundo
carrega Início e Notas quando elas abrem. Chamada interna do `admin.js` passa
pelos dois, porque o nome é resolvido no `window`.

### Início

"N coisas pedem ação na carteira", e um bloco por tipo, o mais antigo
esperando primeiro, até 8 por bloco (o resto vai para a tela do tipo):

| Bloco | Regra (a mesma do resto do admin) |
|---|---|
| Urgente | reservatório sem sinal ou abaixo de 20% + `_chamadosAlertaAbertos()` (P1/P2 ou fora do prazo) |
| Cliente respondeu, falta dar baixa | `_avPendente` |
| Aprovado, sem nota fiscal | `status = aprovado` e sem `nota_status` |
| Nota com erro | `nota_status = erro` (só aparece quando tem) |
| O.S. finalizada, não enviada | `_osFaltaEnviar` |
| Contrato vencendo em 30 dias | `GET /contratos?vencendo_em_dias=30` |

O nome do prédio leva à ficha (no caso do reservatório, à aba Telemetria); o
resto abre o documento. Redesenha no polling (`carregarTelemetria`,
`carregarAtendimento`) e depois de gravar (mesmos ganchos da ficha).

### Notas fiscais

A nota mora no orçamento (uma por orçamento), então a lista é `_avData`
filtrado: abas Emitidas e em andamento · Emitidas · Processando · Com erro ·
Aprovados sem nota, mais busca por número da nota, do orçamento ou nome do
prédio. A linha abre a ficha do orçamento, onde a nota é emitida.

### Perfil operador

Vê 4 grupos: Início (só Alertas e Telemetria), Agenda (só Mapa), Chamados
(sem WhatsApp) e Configurações (só Conta). As duas telas novas ficam
escondidas para ele, porque leem rotas `gestaoOnly`. Endereço de tela que ele
não vê (`#/orcamentos`) é ignorado.

### Testado (banco de teste, 18/11/2026)

Admin no desktop 1440×900 e no celular 375×812 (sem rolagem horizontal);
operador no desktop. Conferido: Início abre como tela inicial e o endereço é
substituído, não empilhado; subabas trocam de tela e lembram a última; a ficha
acende "Condomínios"; voltar do navegador entre ficha e lista; o menu mobile
acende um item só. **Corrigido no teste:** a subaba nascia com 0 de altura
(coluna flex, ver o comentário no CSS) e herdava a borda de botão do
navegador; "Aprovado sem nota" mostrava "· —" em orçamento sem valor.
**Não testado:** a tela Início com o WhatsApp ligado, e o operador no celular.

---

## O que foi implementado (fase 4, 18/11/2026)

Mesma branch. Tudo em `public/admin.css`, em dois blocos no fim do arquivo
("FASE 4 DO REDESENHO" e "A FORMA DOS SISTEMAS DE GESTÃO"), mais os rótulos
das faixas de número no `admin.js`. Versões: `admin.js?v=373`,
`admin.css?v=288`.

### A cor

| Camada | Valor |
|---|---|
| Campo (`.main`) | `#f3f5f9` |
| Cartão, topo, tabela | branco, borda `rgba(6,16,51,.12)` |
| Modal e gaveta | `--chapa` (`#e8ebf2`), um degrau mais escuro que o campo |
| Menu lateral | marinho, como antes |
| Linha selecionada | `#e3eaf7` (azul-acinzentado), não marinho nem âmbar |

O `.main` redeclara os mesmos tokens que o `.modalBox` já redeclarava. Os
modais moram fora do `.main` no HTML (só o `#cfgModalOverlay` mora dentro, e o
`.modalBox` ganha dele), então eles não mudaram de cor.

⚠️ **Preenchimento amarelo agora é `var(--amarelo)`, não `var(--accent)`.**
Dentro do `.main` o `--accent` vira tinta âmbar escura (`--atencao-t`), para o
amarelo continuar legível como texto. Regra nova que pinta FUNDO amarelo usa
`--amarelo`; texto e borda usam `--accent`. Era a regra do preenchimento cru,
que a fase aplicou às 13 regras que a descumpriam.

### A forma

Pedido do Pedro no meio da fase: *"fica a vontade para fazer mudanças
significativas, me incomoda como está hoje, deixa como é nos sistemas
profissionais"*.

- `--corte` e `--corte-p` valem `none` no `:root`: o chanfro some do admin
  inteiro, inclusive do menu e dos modais.
- Cartão (`.card`, `.rc`, colunas de Chamados): uma peça com borda de 1px e
  canto de 10px. A construção de duas camadas (anel no fundo, placa no
  `::before`) ficou desligada por `display: none` no `::before`.
- Botão: fundo branco, borda fina, canto de 6px; o primário é amarelo sólido.
- Abas de filtro dentro da tela (`.wa-tabs` fora da `.nav-sub`): controle
  segmentado (trilho cinza, aba aberta em branco). As subabas do topo, que são
  navegação, continuam texto sublinhado, agora em marinho.
- Selos de estado em pílula, sem caixa alta.
- Cabeçalho de tabela, `.lbl` e rótulos de faixa em Archivo, sem caixa alta. O
  Martian Mono ficou para número e código.
- Menu: o item aberto é um degrau de claro com o ícone em âmbar, em vez da
  placa amarela.

⚠️ O raio passa por cima do `body *:not(...) { border-radius: 0 }` do começo
do arquivo porque toda regra nova tem dois seletores de classe. Regra nova com
um seletor só sai quadrada.

### Testado (banco de teste, 18/11/2026)

Desktop 1440×900 nas 17 telas e celular 375×812 (Telemetria, Chamados, ficha
do condomínio), sem rolagem horizontal. Varredura de contraste por script em
todas as telas: **nenhum texto abaixo de 3,2:1** sobre o fundo real (a
primeira passada achou 9, todos cor escrita à mão para o marinho). Modal de
O.S. aberto pela lista. **Não testado:** o perfil operador e o WhatsApp
ligado.

O [DESIGN.md](../../DESIGN.md) ganhou a seção "O registro de gestão (painel
admin)" com os valores acima, e as passagens que davam o admin como marinho
com chanfro foram marcadas como anteriores a 18/11.

### Handlers inline que a CSP bloqueava (achado na fase 4)

O console mostrava um erro de CSP (`script-src-attr 'none'`) a cada
carregamento. O diff confirmou que a fase 4 não os criou: eram seis handlers
inline de março a setembro, todos bloqueados pelo helmet desde que existem.
Três eram defeito de verdade:

| Onde | O que fazia | Efeito do bloqueio |
|---|---|---|
| `oninput` da busca do `#modalOverlay` | filtrar a lista | a busca nunca filtrou (modal sem uso desde 31/07) |
| `onclick` do "Refazer" da IA no WhatsApp | apagar o cache antes de pedir de novo | "Refazer" devolvia a mesma resposta |
| `onsubmit="return false"` em 3 formulários de envio de e-mail (O.S., lote de O.S., orçamento) | impedir o envio | Enter num campo enviava o formulário e recarregava o painel |
| `onmouseover`/`onmouseout` no seletor de cliente do contrato | hover | o hover nunca acendeu |

Agora: listener de `input` no `admin.js`, `data-refazer` tratado no delegado
`data-wa-action`, `data-sem-envio` com um `submit` delegado no `document`, e a
classe `.ctrs-pick-item` com `:hover` no CSS. Depois disso o console carrega
sem nenhum erro de CSP. `admin.js?v=374`, `admin.css?v=289`.

---

## O que foi implementado (fase 5, 18/11/2026)

Autorizada pelo Pedro: *"faz a 5 e os testes em aberto"*. A regra usada para
decidir o que sai: **só sai o que já existe em outro lugar**. Nenhuma
informação ficou sem tela.

### O que saiu

| Peça | Onde ela continua | Linhas |
|---|---|---|
| **Gaveta do condomínio** (`#drawerPanel`, `abrirDrawer` e as 5 abas) | a ficha do condomínio (fase 2) e a tela WhatsApp | ~430 de JS, 30 de HTML |
| **Modal antigo de KPIs** (`#modalOverlay`, `abrirModal`, `renderModalLista`) | os números do Painel já levam à tela filtrada desde 31/07 (`_DASH_DRILL`) | ~90 de JS, 30 de HTML |

O último caminho que ainda abria a gaveta era o card **"Conversas recentes"**
do Painel, que a usava só para mostrar o chat. Agora ele abre a tela WhatsApp
com a conversa selecionada, onde também dá para responder, assumir e pedir à
IA. `getListaPorKey` **ficou**: a prévia do hover dos números (`showTip`)
ainda a usa.

⚠️ **Uma função da gaveta era chamada de fora dela.** O
`renderTelemetriaVisuais` chamava `atualizarGaugesDrawerSeAberto`, e sem ela a
telemetria parava de atualizar ("Erro ao atualizar telemetria" no topo). Foi
pego no teste e tirado. A conferência que pegou é a que vale repetir em toda
retirada: listar as funções que sumiram e procurar cada nome no que sobrou.

**O que ficou de propósito:**
- O CSS da gaveta (`.drawer-*`) continua no `admin.css`. Ele é inofensivo e
  aparece em seletores agrupados com o `.modalBox`; tirar é limpeza à parte.
- A **nav antiga escondida** continua mandando no menu novo (ver fase 3). Ela
  não é tela, é a fonte de perfil, badge e item ativo; trocá-la é reescrita,
  não retirada.
- A **faixa de números** no topo das telas continua: cada número é um atalho
  para a lista filtrada, ou seja, função, não enfeite. Fica para decisão
  própria.

### O perfil operador e a ficha

⚠️ **Achado no teste, e era defeito da fase 2.** O operador não tem a tela
Condomínios, mas chega na ficha pelos botões "ver condomínio". A ficha fazia 5
pedidos que o servidor recusa (403) e mostrava abas que ele não lê (O.S.,
Orçamentos, Notas, Contrato, Equipamentos), "Sem contrato" sobre um dado que
ele não pode ver e "Editar cadastro". Quem escondia isso antes era a gaveta.
Agora as abas têm `soGestao` em `admin-condominio.js`: para o operador elas
somem, a busca não sai, e o cabeçalho fica com Água e Chamados. "Abrir
chamado" continua.

Junto, dois defeitos antigos do operador: o boot pedia `/admin/orcamentos`
(403 desde 02/09, por causa do badge) e o menu do celular mostrava
"Condomínios", que para ele não leva a lugar nenhum. Os dois saíram.

### Os testes que estavam em aberto

| Teste | Como | Resultado |
|---|---|---|
| Perfil operador, desktop e celular | JWT da usuária 17 do seed | 4 grupos no menu, abre em Alertas, ficha com 4 abas, **nenhum 403 e nenhum erro** depois da correção |
| Início com o WhatsApp ligado | item revelado + `fetch` dublado com uma conversa | Início abre normal; o card do Painel leva à conversa na tela WhatsApp |
| "Refazer" da IA | o mesmo dublê, contando as chamadas | "Resumir" de novo usa o cache (1 chamada); "Refazer" pede de novo (2 chamadas, texto novo) |
| Gravar pela ficha | "Abrir chamado" na ficha, no banco de teste | a ficha passou de "4 em aberto" para "5" sozinha, com a linha nova; cancelado, voltou a 4 |

⚠️ **O WhatsApp não foi testado de verdade**: o banco de teste não tem
conversa e o item do menu nasce escondido no HTML (a integração está pendente
de configuração). O que foi provado é a tela e as ações com dado dublado.

O chamado **#950** ("[TESTE fase 5] gancho da ficha") ficou **cancelado** no
banco de teste.

⚠️ **A tela WhatsApp estava fora da varredura visual da fase 4** (escondida) e
saiu com painéis cinza: preto translúcido escrito à mão que escurecia o
marinho. Corrigido no fim do `admin.css`. O cabeçalho do chat continua
apertado (nome quebrando ao lado dos botões); é o layout de antes.

Versões: `admin.js?v=376`, `admin.css?v=290`, `admin-condominio.js?v=4`.

---

## Piloto de tela: Ordens de Serviço (✅ 18/11/2026)

Pedido do Pedro depois da fase 5: *"por mais que você tenha feito um trabalho
visual, as telas continuam iguais, com as informações, funcionalidades e
botões do mesmo jeito"*. As fases 1 a 5 mudaram navegação e pele; o piloto
muda a **estrutura** de uma tela, para virar o molde de Chamados, Orçamentos e
Contratos. Nenhuma informação saiu da tela.

### Lista

| Antes | Agora |
|---|---|
| Faixa de 5 números em cima | Uma frase: total, quantas abertas no mês, quantas em andamento; e "N finalizadas esperando envio ao cliente →", que leva à aba |
| 10 colunas | 6: seleção, O.S. (data embaixo), condomínio (técnico embaixo), serviço, situação, ação |
| Resultado, Status e E-mail em 3 colunas | Uma coluna **Situação**: "Em andamento / técnico chegou 14/09" ou "Finalizada 27/07 · Paliativo / Falta enviar ao cliente" |
| Três ícones por linha (olho, documento, envelope) | Uma ação com nome quando há o que fazer: "Enviar" (falta enviar) ou "PDF"; a linha abre a ficha |
| Nome do prédio em texto | Link para a ficha do condomínio |
| Abas "Em rascunho" e "A enviar" | "Em andamento" e "A enviar ao cliente" |
| Subtítulo "Documentos finalizados pelos técnicos" sobre uma lista com rascunho | "O técnico preenche no app; o escritório confere e envia ao cliente" |
| No celular, a tabela rolava de lado e escondia a situação | A linha vira cartão |

### Ficha (modal)

- O **estado** fica ao lado do número, em selo; antes era o fim do subtítulo.
- O.S. em andamento abre com um aviso: "O técnico ainda não finalizou esta
  O.S.", com a hora de chegada e por que ela ainda não pode ser enviada.
- **Só aparece a seção que tem conteúdo.** O que falta vira uma linha:
  "Ainda sem registro de tipo de serviço, verificações, peças, fotos e
  assinatura." Antes eram seis seções, cinco dizendo "nada".
- A coordenada crua vira "ver no mapa" (link); "sem GPS" continua dito.
- Prédio e chamado são links (ficha do condomínio, chamado selecionado).
- Botões com nome e na ordem da tarefa: "Enviar ao cliente" (primário),
  "Baixar PDF", "Editar". Antes "Editar" era o amarelo.

### Testado (banco de teste, 18/11/2026)

Desktop e celular 375px: lista, ficha em andamento e finalizada, links do
prédio e do chamado, atalho da frase para a aba, Editar → Cancelar, e o modal
de envio abrindo (fechado sem enviar). Sem erro de JS. `admin.js?v=378`,
`admin.css?v=294`.

### Segunda rodada: a O.S. vira página (18/11/2026)

Os três pontos que faltavam para o padrão dos sistemas de referência:

1. **Página própria em `#/os/<id>`**, não modal. Voltar e avançar do
   navegador, F5 e link colado funcionam. "Voltar" devolve a pessoa de onde
   ela veio (lista, ficha do condomínio, Início); quem chegou por link cai na
   lista. O grupo "O.S." do menu acende.
2. **Linha do tempo no topo**: Aberta → Técnico chegou → Finalizada → Enviada
   ao cliente, com a data de cada etapa; a próxima aparece como "a seguir" (ou
   "prédio sem e-mail").
3. **Cabeçalho com as ações gruda no topo** ao rolar (no desktop), e o
   conteúdo vai em duas colunas: o trabalho à esquerda, o atendimento (quando,
   onde, quem recebeu, chamado) à direita. Abaixo de 900px vira uma coluna.

⚠️ **Como foi feito sem reescrever a edição.** A caixa do antigo modal
(`#osFicha`) é **movida** para a seção `os-detalhe` na primeira abertura
(`_osMontarPagina`). Edição, envio por e-mail, PDF e pedido de assinatura
acham seus elementos pelo id, então continuaram funcionando. O
`#osModalOverlay` fica no HTML, vazio.

⚠️ **O GET `/ordens-servico/:id` não traz o e-mail do prédio**, e a primeira
versão da linha do tempo dizia "prédio sem e-mail" numa O.S. que a lista
marcava "Falta enviar". A página empresta o campo da lista; aberta direto pelo
link (lista ainda não carregada), ela só diz "a seguir".

Também corrigido de passagem: a ficha da O.S. aberta pela ficha do condomínio
ou pelo Início, sem a lista ter sido aberta antes, ficava com os botões do
cabeçalho sem ação (`_osBindEventos` só rodava ao entrar na lista).

Testado: lista → página → Voltar; avançar/voltar do navegador; F5 em
`#/os/1`; link do prédio e volta; abrir pela ficha do condomínio e voltar para
ela; Editar → Cancelar na página; cabeçalho grudando ao rolar; celular 375px
sem rolagem lateral. Sem erro de JS. Versões: `admin.js?v=380`,
`admin.css?v=297`, `admin-condominio.js?v=5`, `admin-nav.js?v=4`.

**Próximo:** levar o molde para Chamados, Orçamentos e Contratos.

---

## O molde da O.S. em Chamados (18/11/2026)

Lista **com o painel ao lado** (não virou página como a O.S.): escolher e agir
rápido é o trabalho desta tela, e o operador vive nela. O resto do molde entrou:

| Antes | Agora |
|---|---|
| Faixa com Críticos, % resolvido e Tempo médio | Frase: em aberto · sem técnico · fora do prazo · % resolvidos e tempo médio, com "N críticos (P1) →" que leva à aba |
| Colunas ID, Chamado, Prioridade, Status, Aberto em | Nº (data embaixo), Chamado (prédio como link · categoria), **Situação** (prioridade, estado e prazo; embaixo, quem está com ele e há quanto tempo) |
| "⚠ SLA", "⏱ TTR" | "Fora do prazo", "Prazo de solução estourado" |
| Painel: título, descrição, "Informações" com 12 linhas, ações no fim | Topo com número, estado, prioridade, título, prédio (link) e as ações; **linha do tempo** (aberto → a caminho → chegou → resolvido/cancelado); "Quem está com ele" (técnico, condomínio, responsável, cliente, prazo) |
| "✓ Fechar", "✕ Cancelar", "↺ Reabrir" | "Marcar como resolvido" (primário), "Cancelar chamado", "Reabrir" |
| No celular, tabela rolando de lado | Cartões |

**Defeitos achados e corrigidos de passagem:**
- Chamado **cancelado** mostrava "Prazo: aguardando resposta" (a regra só
  olhava `fechado_em`).
- O boot do **operador** mandava sempre para Alertas, por cima do endereço: o
  F5 em `#/chamados` perdia a tela (código de antes da fase 1). Agora o
  endereço que ele vê ganha; o resto cai em Alertas.

⚠️ **Um script de edição cortou 1.559 linhas do `admin.js`** nesta rodada (o
marcador de início aparecia em três painéis "ch-detail" e o corte pegou o
primeiro). `node --check` passou, porque o que sobrou era JS válido. Pego pelo
`git diff --stat`, restaurado do commit e reaplicado com o início procurado
DENTRO da função e uma trava de tamanho. **Ao editar por script, conferir o
saldo de linhas antes de gravar.**

Testado: admin e operador (desktop), celular 375px, sem erro de JS e sem
requisição falhando. `admin.js?v=384`, `admin.css?v=303`.

---

## Orçamentos e Contratos no padrão dos sistemas de gestão (18/11/2026)

Pedido do Pedro nesta rodada: *"deixar o visual e as funcionalidades o mais
próximo possível dos sistemas profissionais"*. Em Jobber, ServiceTitan e
Field Control o orçamento é **uma lista da carteira**, com o cliente numa
coluna; a visão por cliente fica na página dele. Foi o que mudou aqui.

### Orçamentos (as duas abas)

| Antes | Agora |
|---|---|
| Lista de prédios à esquerda, orçamentos do prédio num painel à direita | Uma tabela de todos os orçamentos; o prédio é coluna e link para a ficha (aba Orçamentos) |
| 4 cartões (Total, Rascunho, Enviado, Total aprovado) | Frase: total · enviados esperando o cliente · R$ aprovados, e "N rascunhos por enviar →" |
| Linha de apoio só com data ou quem respondeu | Situação com o que vem a seguir: "falta enviar ao cliente", "esperando o cliente · válido até dd/mm", "validade venceu em dd/mm" (destacado), "Aprovado por Fulano · há N dias", "registrado pelo escritório" |
| Abas "Rascunho", "Enviado", "Aprovado" | "Rascunhos", "Enviados", "Aprovados" |
| Solicitados: observação do técnico como 3ª linha de um item no painel | Coluna "Pedido do técnico" (duas linhas), e a ação **"Fazer orçamento"** no pedido que ninguém começou |
| Selo OFICINA ao lado do número | "· oficina" na linha da data |

Continua tudo: o aviso das respostas sem baixa (e o "Ver"), o selo "Resposta
nova"/"Sem baixa", o "Feito"/"Chamado #N", "via IA"/"via OS", o tipo do
documento, a lixeira do pedido, a ordem de fila (pendência primeiro na aba
Respondidos; pedido sem orçamento primeiro em Solicitados), o filtro de
condomínio, busca, linhas focáveis com Enter. O modal de tela cheia é o mesmo.

**Por que o agrupamento saiu:** para achar um orçamento era preciso saber o
prédio antes, e a carteira nunca era vista de uma vez. A pergunta que o
agrupamento respondia ("o que este prédio espera?") tem agora dois lugares:
a ficha do condomínio, aba Orçamentos, e o filtro de condomínio de
Solicitados. `_avCondoSel` e `_orcCondoSel` saíram com ele (inclusive a
atribuição em `admin-condominio.js`).

### Contratos

| Antes | Agora |
|---|---|
| 4 cartões (Ativos, Vencendo em 30d, Vencidos, MRR) | Frase: "N contratos ativos, R$ X por mês · N vencendo em 30 dias", com "N vencidos →" (ou "N vencem nos próximos 30 dias →") |
| 8 colunas: Cliente, Serviço, Periodicidade, Valor/mês, Início, Vencimento, Status, ícone | 5: Cliente (link para a ficha, aba Contrato; serviço · periodicidade embaixo), Valor por mês, Vigência ("dd/mm a dd/mm" ou "desde dd/mm · sem data de fim"), Situação (selo + assinatura embaixo), ação |
| Olho ou lápis, sem nome | "Ver" (assinado) ou "Editar" |
| Busca caía embaixo do filtro | Na mesma linha das abas |

⚠️ **A frase conta "ativo" pelo cadastro (`ct.ativo`)**, o mesmo filtro da
soma mensal. A primeira versão dizia "3 em vigor" ao lado de uma soma que
incluía o vencido (ele continua ativo até alguém encerrar), e a conta não
fechava.

### Testado (banco de teste, 18/11/2026)

Desktop 1440 e celular 375 sem rolagem lateral, sem erro no console. Em
Orçamentos: atalho da frase para a aba, linha abre o modal, Esc fecha, link
do prédio abre `#/condominios/13/orcamentos`, "Ver" do aviso abre o
OR-000058; em Solicitados, abrir um pedido com orçamento existente. **Não
clicado:** "Fazer orçamento" (cria o orçamento no banco; é o mesmo caminho
`_orcMaterializarEAbrir` de antes). Contratos: o banco de teste não tem
nenhum, então a tela foi conferida com 4 contratos **montados só na tela**
(ativo, vencendo, vencido, sem fim): frase, atalho para Vencidos, link do
cliente para `#/condominios/13/contrato`, cartões no celular.

**Próximo, se quiser chegar mais perto dos sistemas de referência:** o
orçamento como **página própria** (`#/orcamentos/<id>`) com linha do tempo
(criado → enviado → respondido → feito → nota), como a O.S. ganhou; e
ordenar colunas clicando no cabeçalho.
