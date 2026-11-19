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

**Próximo:** levar o molde para Chamados, Orçamentos e Contratos. (✅ Feito
em 18/11/2026, nas seções abaixo.)

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

### O orçamento como página própria (18/11/2026)

Era o modal de tela cheia; agora é a página `#/orcamentos/<id>`, no mesmo
mecanismo da O.S.: o `#avModal` inteiro (mesmos ids) é **movido** para a
seção `orcamento-detalhe` na primeira abertura (`_avMontarPagina`) e ganha a
classe `is-pagina`, que tira o fundo escurecido e a altura fixa. Edição,
itens, e-mail, PDF, nota fiscal e baixa da resposta não foram reescritos.
Todo caminho de abrir passa por `_avRenderPainel` → `_avIrParaPagina`.

- **Endereço:** voltar/avançar, F5 e link colado (`_avAbrirPelaRota`, lida
  pelo roteador em `admin-condominio.js`). Orçamento novo mora em
  `#/orcamentos/novo` e troca para o id no primeiro POST
  (`_avGarantirRegistro`); F5 no "novo" cai na lista. O grupo Orçamentos do
  menu acende.
- **"← Voltar"** no lugar do ×: devolve de onde veio (lista, Solicitados,
  ficha do condomínio); quem chegou pelo link cai na lista. Esc deixa de
  fechar (numa página, Esc não é voltar).
- **Linha do tempo** no topo: Criado (data · quem) → Enviado ao cliente
  ("sem envio por e-mail" quando foi decidido sem envio) → Aprovado/Recusado
  (data e hora · quem, ou "registrado pelo escritório") → Serviço feito
  (marcado à mão ou pelo chamado) → Nota fiscal (nº, processando, erro).
  Recusado para na resposta. "Validade venceu" aparece na etapa da resposta.
- **Cabeçalho e trilho grudam** ao rolar no desktop; abaixo de 1080px o
  trilho desce para baixo do formulário, abaixo de 640px nada gruda.

⚠️ **Sair da página sem passar pelo Voltar** (menu, voltar do navegador) é
possível numa página e não era num modal. `_avPodeSair`, chamada pelo
embrulho do `showSection` em `admin-nav.js`, limpa o estado e, se houver
alteração não salva, pergunta; cancelar devolve o endereço do orçamento.

⚠️ **Sticky com `top: -22px`**, não 0: ele mede a partir da borda interna do
`.content`, que tem 22px de respiro; com 0 o conteúdo rolado aparecia por cima
do cabeçalho. A página da O.S. já tinha a mesma correção.

**Testado (banco de teste):** lista → página → Voltar; avançar e voltar do
navegador; F5 em `#/orcamentos/57`; Voltar depois do F5 (cai na lista);
ficha do condomínio → orçamento → Voltar (volta à ficha); Solicitados →
OR-000031 → Voltar; "Novo orçamento" → `#/orcamentos/novo` → Voltar sem
criar nada; alteração não salva + menu e + voltar do navegador (cancelar
fica, aceitar sai; nada foi gravado); cabeçalho e trilho grudando em
1366×680; celular 375px sem rolagem lateral. Sem erro de JS.

### Ordenar pela coluna (18/11/2026)

Um ordenador só (`_ordenar`, `_ordemTh`, `_ordemMarcar` em `admin.js`), ligado
em cinco tabelas:

| Lista | Colunas que ordenam |
|---|---|
| O.S. | O.S. (data), Condomínio e técnico, Situação (em andamento → falta enviar → enviada) |
| Chamados | Nº (data), Chamado (prédio e título), Situação (prioridade, P1 primeiro) |
| Orçamentos | Nº (data), Condomínio, Situação (resposta sem baixa primeiro), Valor |
| Solicitados | O.S. (data), Condomínio, Situação (sem orçamento primeiro) |
| Contratos | Cliente, Valor por mês, Vigência (vence antes primeiro; sem fim no fim), Situação (vencido primeiro) |

- **Ciclo de três cliques:** direção natural da coluna (data e valor: maior
  primeiro; texto: A→Z), invertida, e **desligada**, que devolve a ordem de
  trabalho que a tela monta (pendência primeiro, pedido sem orçamento
  primeiro). Sem o terceiro, quem ordenasse uma vez perderia a fila.
- Vazio vai para o fim nas duas direções; empate mantém a ordem anterior.
- A escolha fica no `localStorage` (`ordem:<lista>`) de cada navegador; sem
  ele, a tela abre na ordem de trabalho.
- Na O.S. a ordem vale **antes** da paginação e volta à página 1.
- **No celular** as linhas são cartões e o cabeçalho some, então não há como
  ordenar ali; a ordem escolhida no computador continua valendo.

Testado nas cinco (Contratos com dados montados só na tela), sem erro de JS.

---

## Preventivas, Equipamentos e Notas fiscais no molde (18/11/2026)

Com estas três, todas as listas do admin falam a mesma língua: frase com o
que pede ação, situação numa coluna com a linha de apoio embaixo, o prédio
como link para a ficha, ordem pela coluna, cartões no celular.

### "Planos" sai da tela

Pedido do Pedro: *"não gosto desse nome planos… deixa algo mais claro tipo
manutenção preventiva"*. Nos sistemas de referência o serviço recorrente tem o
nome do serviço, não da estrutura ("Recurring services"). Aqui: a tela é
**Manutenção preventiva**, o item é **a preventiva do prédio**, e a contagem é
por cliente ("13 prédios com preventiva"). Só o que se lê mudou; seção,
rotas, tabela e ids continuam `planos`.

### Preventivas

Continua cadastro **e** acompanhamento do mês (decisão do Pedro em
04/09/2026: "o que eu quero fazer nessa tela é tudo que for possível"). Entrou: a frase, o prédio como link (aba Contrato e
preventiva), a ordem por Prédio, Este mês e Próxima **dentro de cada zona**
(a zona é o roteiro do técnico e continua agrupando), a linha que abre a
preventiva e o celular (abas numa linha, cartão por preventiva).

⚠️ **A linha abre só onde o botão Editar está à vista** (`offsetParent` do
botão), em vez de uma regra de perfil nova: operador e visualizador não veem
o Editar, então a linha não abre para eles.

### Equipamentos

| Antes | Agora |
|---|---|
| Seletor de 5 estados, filtrando no servidor | Abas: Todos, No condomínio, Na oficina, Prontos para devolver, Etiquetas em branco, Baixados (na tela; a busca segue no servidor) |
| "Na oficina" = só o estado `oficina` | Na oficina = oficina, aguardando orçamento, aguardando peça, em conserto |
| Nada em cima da tabela | Frase: N equipamentos · no condomínio · na oficina · etiquetas em branco, e "N prontos para devolver →" |
| Código, Equipamento, Condomínio, Estado, Lote | Equipamento (código · tipo · série · lote embaixo), Condomínio (link, "desde"), Situação (defeito relatado na bancada), "Abrir ficha ↗" |
| Etiquetas em branco misturadas | No fim da lista (estoque, não equipamento) |

⚠️ `document.querySelector('[data-section="equipamentos"]')` acha o **botão do
menu** antes da seção (os dois têm o atributo); as abas não respondiam. Use
`.section[data-section=…]`.

### Notas fiscais

Era a única lista sem cartão nem resumo, desenhada com a tabela da ficha.
Agora: cartão com título, frase (emitidas e valor, processando; atalho para
"com erro" ou "aprovados sem nota"), 4 colunas (Nota, Prédio e orçamento,
Situação com o erro do Omie, Valor), ordem pela coluna, e a linha abre a
**página** do orçamento (Voltar devolve para Notas).

### Testado (banco de teste, 18/11/2026)

Desktop 1440 e celular 375 sem rolagem lateral nas três, sem erro de JS.
Preventivas: frase, ordem dentro da zona e volta, linha abrindo "Editar
preventiva" (fechado com Cancelar, nada salvo). Equipamentos: cada aba, ordem
por condomínio, link para `#/condominios/1/equipamentos`. Notas: atalho da
frase, ordem por valor, linha → `#/orcamentos/58` → Voltar → `#/notas`,
prédio → `#/condominios/13/notas`. O banco de teste não tem nota emitida nem
com erro, então essas linhas não foram vistas com dado real.

---

## Contrato e chamado como páginas próprias (19/11/2026)

Pedido do Pedro: *"resolve isso: página própria para o chamado e o contrato"*.
Com isso, os quatro documentos (O.S., orçamento, contrato e chamado) têm
endereço, Voltar e linha do tempo.

### Contrato: `#/contratos/<id>`

Era um de dois modais: o de editar (`#ctrOverlay`) e o só leitura do contrato
assinado (`#ctrViewerOverlay`). Agora é uma página com o mesmo mecanismo do
orçamento. As duas caixas (`#ctrBox`, `#ctrViewerBox`) são **movidas** para a
seção `contrato-detalhe` na primeira abertura (`_ctrMontarPagina`), com os
mesmos ids, e aparece uma por vez. Salvar, assinatura, PDF, inativar e
excluir não foram reescritos.

- **Cabeçalho:** "← Voltar" (era o "Fechar" do canto), título "Contrato
  CT-…", o prédio como link para a ficha (aba Contrato) e o selo da
  assinatura. Cabeçalho e rodapé de ações grudam ao rolar no desktop.
- **Linha do tempo:** Criado → Enviado para assinatura → Assinado (ou
  Recusado; com uma só assinatura, diz quem falta) → Em vigor ("até dd/mm",
  "desde dd/mm · sem data de fim", "vence em N dias" e "venceu em dd/mm" em
  vermelho, "inativado").
- **Endereço:** F5 e link colado (`_ctrAbrirPelaRota` busca o contrato para
  saber o prédio e se já foi assinado: assinado abre só leitura, como na
  lista). Contrato novo mora em `#/contratos/novo` e troca para o id no
  primeiro salvar; F5 no "novo" cai na lista.
- `_ctrPodeSair` limpa o estado ao sair por menu ou voltar do navegador.
  O contrato não tinha aviso de alteração não salva no modal, e continua sem.

⚠️ **O botão "Copiar" do link de assinatura escutava o clique no overlay.**
A caixa saiu do overlay, então o clique deixaria de chegar. Agora escuta na
própria caixa (`#ctrBox`).

⚠️ **Data pura em `_ctrFmtData`.** A API manda as colunas DATE como
`2026-12-10T03:00:00.000Z` (meia-noite de Brasília), que já saía certo. A
linha do tempo corta para `2026-12-10`, que o `Date` lê como meia-noite UTC,
e aí saía "09/12". O formatador agora monta `dd/mm/aaaa` direto quando
recebe data pura.

### Chamado: `#/chamados/<id>`

**A lista de Chamados continua com o painel ao lado**: escolher e agir rápido
é o trabalho daquela tela (decisão de 18/11/2026). A página é o mesmo
chamado inteiro, com endereço e o que está ligado a ele.

- **Um desenho, dois lugares.** `renderChDetalhe` decide o destino: na
  página, o mesmo conteúdo sai em duas colunas (descrição, avaliação,
  **"Ligado a este chamado"** e histórico à esquerda; quem está com ele e
  telemetria à direita). Toda ação que grava redesenha por `carregarTudo →
  renderChamados → renderChDetalhe` e cai na página sozinha. Os botões
  (resolver, cancelar, reabrir, trocar técnico/prédio) são os mesmos, pela
  delegação no `body`.
- **"Ligado a este chamado":** a O.S. que ele gerou (número, finalizada em
  dd/mm, enviada ou não ao cliente) e os orçamentos com `chamado_id` dele
  (número, situação, valor). Clicar abre a página do documento, e o Voltar
  de lá volta ao chamado. Some para o operador: O.S. e orçamento são rotas
  `gestaoOnly`.
- **Quem abre a página:** o "Abrir página ↗" no topo do painel, e todo
  caminho que chega **de fora da lista**: ficha do condomínio
  (`_cfAbrirChamado`), Início, link do chamado na O.S., chamado da
  preventiva e busca global. Antes esses caíam na lista com o chamado
  selecionado. Clicar numa linha da lista continua abrindo o painel.
- **Endereço:** F5 e link colado (`_chAbrirPagina(id, { daRota: true })`;
  se a lista ainda não carregou, busca e espera). Chamado inexistente mostra
  "não encontrado" com o Voltar.

⚠️ **O painel da lista é esvaziado enquanto a página está aberta.** Os dois
teriam os mesmos ids (`chTecnicoRow-N`, `chHistSec-N`), e o
`getElementById` das ações acharia o do painel escondido. Ao voltar para a
lista, `_chPodeSair` redesenha o painel com o chamado selecionado.

⚠️ **A O.S. ligada é buscada dentro do desenho (`_chRenderLigados`), não ao
abrir a página.** A primeira versão buscava em `_chAbrirPagina`, e entrando
pelo endereço o redesenho seguinte saía sem número nem situação. Todo
redesenho passa pelo desenho; o `Set` `_chOsBuscando` evita buscar duas vezes.

### Também

- As subabas do grupo (ex.: "Notas fiscais · Contratos") não aparecem mais
  por cima das páginas de documento (`*-detalhe`). Na página do contrato elas
  apareciam ao lado do Voltar e confundiam.

### Testado (banco de teste, 19/11/2026)

Desktop 1440 e celular 375 sem rolagem lateral, sem erro de JS.
**Chamado:** linha → painel → "Abrir página" → `#/chamados/950` → Voltar
(lista com o painel de volta); F5 em `#/chamados/3`; O.S. ligada → `#/os/1`
→ Voltar (volta ao chamado). **Contrato:** novo pela ficha →
`#/contratos/novo` → salvar → `#/contratos/2` (linha do tempo com "vence em
21 dias" em vermelho); F5; Voltar depois do F5 (lista); linha → página →
Voltar; link do prédio → `#/condominios/5/contrato` → voltar do navegador;
só leitura (assinado); menu para fora; Excluir pela página (volta à lista).
Os dois contratos de teste (`[TESTE 19/11]`) foram excluídos. **Não
testado:** perfil operador nas páginas novas, e o contrato assinado de
verdade (o banco de teste não tem nenhum; a versão só leitura foi aberta
direto). Versões: `admin.js?v=394`, `admin.css?v=315`,
`admin-condominio.js?v=9`, `admin-nav.js?v=8`.

⚠️ **O `npm run dev` é `node --watch`**: editar arquivo reinicia o servidor.
O primeiro "Salvar" do contrato caiu no meio de um reinício, e a tela disse
"Erro de rede" com o contrato **gravado** (o banco ficou com dois). Num
teste que grava, espere o servidor voltar antes de clicar.

---

## Ronda de UX: o que ainda não parece sistema de gestão (19/11/2026)

Pedido do Pedro: *"conferir o que ainda não está com visual de sistema
profissional para a gente melhorar"*. Todas as telas em 1440×900, banco de
teste. Em ordem do que mais pesa:

1. ✅ **(Feito em 19/11/2026, ver abaixo.)** **Painel, Telemetria e Mapa ainda têm a faixa antiga de cartões de
   número, e os rótulos saem cortados.** Medido no Mapa: "Offline" vira
   "Off…" (31px para 35px de texto), e a unidade "condomínios" vira
   "cond…"; na Telemetria, "4 res…", "B… sem dados de bomba". Cada cartão
   tem ícone em caixinha, número mono grande e rótulo espremido: é o
   "card dentro de card" que o diagnóstico de 18/11 apontou e que as listas
   já trocaram por uma frase. É o defeito mais visível do admin hoje.
2. ✅ **(Feito em 19/11/2026, ver abaixo.)** **Condomínios (lista) ficou de fora do molde.** Cinco cartões (Clientes
   ativos, MRR, Vencendo em 30d, Contratos vencidos, Chamados abertos) em
   cima de uma tabela de duas colunas (Cliente, Contrato), com muito branco.
   Faltam as colunas que dizem como o prédio está (água/sinal, chamados em
   aberto, próxima preventiva). E o título da tela diz **"Clientes"**,
   enquanto o menu diz "Condomínios".
3. ⏸️ **Adiado pelo Pedro em 19/11/2026:** ele não quer mais o modelo de
   exportar relatórios; quer um **dashboard** no lugar, para fazer depois.
   Não vale polir a tela atual. **Relatórios ficou de fora do molde.** Títulos mono em caixa alta ("PAINEL
   AO VIVO", "CHAMADOS EM RISCO (PASSOU DA METADE DO PRAZO)", "EXPORTAR
   RELATÓRIOS"), ícone em caixinha, pílulas âmbar de período.
4. ✅ **(Feito em 19/11/2026, ver abaixo.)** **Selos com duas caras.** O.S., Chamados e Contratos usam selo em frase
   ("Finalizada 27/07", "Resolvido"); Orçamentos e Preventivas ainda usam
   caixa alta mono ("RASCUNHO", "APROVADO", "SEM BAIXA", "SEMESTRAL",
   "LIMPEZA DE CAIXA D'ÁGUA", "ATRASADA").
5. ✅ **(Feito em 19/11/2026, ver abaixo.)** **Faixa de cor na borda esquerda**, o padrão que o DESIGN.md proíbe:
   compromissos da Agenda, a linha "atrasada" de Preventivas e (visto em
   19/11, depois da ronda) a linha de Orçamentos com resposta sem baixa. Na Agenda, a
   lista também ocupa só uns 60% da largura.
6. ✅ **(Feito em 19/11/2026, ver abaixo.)** **Orçamentos com dois botões primários iguais:** "+ Criar orçamento" no
   topo e "+ Novo orçamento" dentro do cartão. "Solicitados pelos técnicos"
   aparece como botão ao lado do primeiro, quando é uma aba.
7. ✅ **(Feito em 19/11/2026: `.pm-prox-data` na fonte do texto, 13px/500,
   algarismos tabulares; a linha de baixo trocou `#f87171`/`#fbbf24`, tintas
   do tema escuro, por `--risco-t`/`--atencao-t`. `admin.css?v=324`.)**
   **Datas da Preventivas em mono negrito grande** ("23/01/2027") pesam mais
   que o nome do prédio.
8. ✅ **(Feito em 19/11/2026: o botão saiu; a linha inteira já abria a ficha
   do equipamento em outra aba (clique e Enter). Fica uma seta "↗" discreta,
   que acende no hover/foco da linha, como link de verdade (botão do meio e
   copiar endereço funcionam), com `tabindex -1` porque o foco de teclado é
   a linha. No celular a seta some: o cartão inteiro abre. Testado: clique,
   Enter, link do prédio → `#/condominios/2/equipamentos`, 375px sem rolagem
   lateral. `admin.js?v=400`, `admin.css?v=325`.)**
   **Equipamentos:** "Abrir ficha ↗" em todas as linhas. Nas outras listas a
   linha inteira abre, e o botão só aparece quando há uma ação.
9. ✅ **(Feito em 19/11/2026, ver abaixo.)** **Agenda abre em "Carregando…" por 2–3 s** sem esqueleto (a rota responde
   200; é só a espera).

O que **está** no padrão: Início, as listas de O.S., Chamados, Contratos,
Notas, Equipamentos (fora o item 8), a ficha do condomínio, as quatro páginas
de documento e Configurações/Colaboradores.

### Item 1 feito: a faixa de números sem corte (19/11/2026)

Só CSS, no fim do `admin.css` (bloco "FAIXA DE NÚMEROS SEM CORTE"), escopado a
`.main :is(.resumo-grid, .mp-kpis)`. Pega Painel, Telemetria, Mapa e a faixa
da lista de Condomínios, que usam o mesmo `.rc`. Ids, `kpiCard` e
`renderTelKpis` não mudaram; Configurações (curva de qualidade) fica de fora,
porque não está dentro de uma dessas faixas.

| Antes | Agora |
|---|---|
| Célula de uma linha, 60px: ícone, rótulo, dica e número disputando a largura | Célula empilhada: rótulo inteiro → número com unidade → dica (quebra linha se precisar) |
| Rótulo com reticências ("Off…", "4 res…", "B… sem dados de bomba") | Nenhum texto cortado, medido nas quatro telas em 1440 e 375 |
| Cartões soltos, cada um com ícone em caixinha colorida | Uma peça só, com fio entre as células, sem ícone |
| Estado na cor da caixinha do ícone | Estado na cor do número (vermelho, âmbar), só quando pede atenção |
| Número em mono 19px | Número na fonte do texto, 22px (19px no celular) |

Celular: duas colunas nas quatro faixas, sem rolagem lateral. Os cartões
clicáveis do Painel continuam levando à tela deles (testado: "Offline" →
Telemetria). `admin.css?v=316`.

**Os três restos, resolvidos na mesma tarde (pedido do Pedro):**

- **Unidades por extenso, no plural certo.** `_unidExtenso(abrev, valor)`
  (perto de `kpiCard`, em `admin.js`) troca "disp.", "res.", "cond." e
  "abertos" por "dispositivo/dispositivos", "reservatório/reservatórios",
  "condomínio/condomínios", "aberto/abertos" pelo número. Vale nas três
  fontes: `kpiCard` (Painel), `renderTelKpis` (Telemetria) e o preenchimento
  do Mapa, que agora escreve também o `.rc-unid` do HTML. Valor que não é
  número ("—", "62%") fica sem unidade.
- **Linha de Contratos do Painel** (`.mc-fin-row`): a mesma peça da faixa de
  números (rótulo em cima, número embaixo na fonte do texto, fio entre as
  células). A receita saiu do âmbar: âmbar é "olhe aqui", e receita não pede
  ação; cor só em "vencem em 30 dias" e "vencidos" quando passam de zero.
  Rótulos: "MRR mensal" → "Receita mensal dos contratos", "Vencendo em 30d"
  → "Vencem em 30 dias". **"Gerenciar →" levava para a lista de
  Condomínios**; agora é "Ver contratos →" e leva para Contratos.
- **"Alertas Críticos" do Painel:** a caixinha de ícone (30px) e o tempo à
  direita comiam a coluna. Agora: ponto de cor, título em até duas linhas,
  prédio · prioridade · "fora do prazo" embaixo, e o tempo por último; fio
  entre os itens. O subtítulo deixou de ser o tipo cru ("dispositivo
  offline • …", "SLA estourado • Chamado P1") e a mensagem de log do
  servidor ("está OFFLINE há 135751 minutos"): sai "Cisterna (caixa) ·
  dispositivo sem sinal" (`_mcAlertaSub`). O título agora é escapado
  (`_waEscaparHtml`); antes ia cru para o HTML. **O chamado da lista abre a
  página dele** (`#/chamados/<id>`); telemetria continua indo para Alertas.
- **"Atividade em Tempo Real"**, a coluna ao lado, tinha o mesmo corte de
  título; ganhou a mesma solução (duas linhas, fio entre os itens, ponto
  redondo).

Medido depois: nenhum título cortado nas duas colunas. `admin.js?v=397`,
`admin.css?v=320`.

### Item 2 feito: a lista de Condomínios no molde (19/11/2026)

| Antes | Agora |
|---|---|
| Faixa de 5 cartões (Clientes ativos, MRR, Vencendo em 30d, Contratos vencidos, Chamados abertos) | Frase: "12 condomínios ativos (N inativos) · 8 chamados em aberto · R$ X por mês em contratos", com "N contratos vencidos →" (ou "N contratos vencem em 30 dias →") que abre Contratos na aba certa |
| 2 colunas: Cliente, Contrato | 4, todas ordenáveis (`_ordenar`, lista `condominios`): **Condomínio** (cidade · síndico · CNPJ embaixo), **Água**, **Chamados**, **Contrato** |
| Contrato: selo ou "—" | Selo e "R$ X por mês" embaixo, ou "sem contrato" |
| Linha abre um painel ao lado | **Linha abre a ficha** (`abrirFichaCondominio`), também com Enter |
| Título da tela "Clientes", botão "+ Novo cliente" | "Condomínios", "+ Novo condomínio" |
| No celular, tabela | Cartões |

- **Água** (`_cliAgua`, do mesmo `_statusData` do Mapa): "sem sinal" (todos
  os reservatórios mudos), "N de M sem sinal", "nível muito baixo", "nível
  baixo", "normal" ou "sem telemetria"; embaixo, "N reservatórios · menor
  nível X%". Ordenar por Água põe primeiro o que pede atenção.
- **Chamados** (`_cliChamados`): "N em aberto" e, embaixo, "N urgentes"
  (P1/P2 ou fora do prazo, a mesma regra de `_chamadosAlertaAbertos`).
- **Contrato** ordena vencido primeiro, depois quem vence antes, sem fim
  depois, sem contrato no fim.

⚠️ **O painel ao lado saiu de cena, mas nada do que ele fazia se perdeu.**
Tudo que ele mostrava a ficha mostra inteiro. A única ação que só ele tinha,
**Inativar/Reativar o condomínio**, foi para o cabeçalho da ficha (só
gestão), ao lado de "Editar cadastro". A coluna `#cliDetailCol` fica no HTML,
oculta por CSS, e `renderCliDetalhe` continua no código, porque
`_ctrRefrescarListas` e o boot ainda o chamam.

Testado (banco de teste, 1440 e 375, sem erro de JS): frase, as três
ordenações e o terceiro clique voltando à ordem por nome, linha →
`#/condominios/5` com "Inativar" no cabeçalho, celular sem rolagem lateral.
⚠️ No celular o "+ Novo condomínio" saía cortado na borda; corrigido.
**Não clicado:** Inativar (mudaria o banco de teste; é o mesmo
`data-action` que o painel usava). `admin.js?v=397`, `admin.css?v=320`,
`admin-condominio.js?v=10`.

### Item 4 feito: selos em frase em Orçamentos e Preventivas (19/11/2026)

- **Os rótulos vinham em maiúsculas do próprio JS**, não só do CSS:
  `_avStatusLabel` e `_orcStatusLabel` agora devolvem "Rascunho", "Enviado",
  "Aprovado", "Recusado" (era "REJEITADO"; "Recusado" é a palavra da linha do
  tempo do orçamento), "Expirado", "Solicitado", "Em orçamento". No `confirm`
  de excluir pedido, o rótulo entra minúsculo no meio da frase.
- **CSS** (bloco "SELOS EM FRASE" no fim do `admin.css`): `.orc-status-pill`,
  `.av-selo-pend` ("Sem baixa"), `.av-selo-exec`, `.orc-origem-pill` ("via
  OS", "via IA"), `.pm-pill-perio` ("Semestral", "Limpeza de caixa
  d'água"), `.pm-pill-atraso` ("atrasada") e `.pm-pill-off` usam a mesma
  pílula: fonte do texto, 11,5px, sem caixa alta nem espaçamento. As cores de
  estado não mudaram (cheio = pede alguém; de fio = não pede).
- A origem "via IA/via OS" tinha as tintas do tema escuro (`#c4b5fd`,
  `#7dd3fc`), que mal se liam no fundo claro; ganhou tintas para o claro.
- O cabeçalho de grupo da Preventivas ("ZONA OESTE") virou texto normal.

Conferido por varredura nas duas telas (nenhum texto em caixa alta sobrando,
incluindo a aba Solicitados) e no print. `admin.js?v=398`, `admin.css?v=321`.

### Item 5 feito: sem faixa de cor na borda (19/11/2026)

Só CSS (bloco "SEM FAIXA DE COR NA BORDA" no fim do `admin.css`). Achado por
varredura em 11 telas (borda esquerda ≥ 2px ou `box-shadow inset` lateral),
três lugares:

| Onde | Era | Agora |
|---|---|---|
| Orçamentos e Solicitados, linha que espera alguém (`.pro-row.is-pendente`) | 3px âmbar na 1ª célula (no celular, na linha) | Fundo âmbar levíssimo na linha; o selo "Sem baixa"/"Solicitado" continua dizendo o porquê |
| Preventiva atrasada (`.pm-row.is-atrasada`) | 2px vermelho (3px no celular) | Fundo vermelho levíssimo; o selo "atrasada" continua |
| Linha "sem preventiva" (`.pm-row.is-sem-plano`) | 2px âmbar | Nada: o selo "Sem preventiva" e o botão "Criar preventiva" já dizem |
| Compromisso da Agenda (`.ag-item`, as 3 vistas) | 3px na cor do tipo | Quadradinho da cor do tipo, o mesmo da legenda |

Também na Agenda: a vista **Lista** tinha `max-width: 760px` (ocupava ~60%
da tela) e cada compromisso em três linhas; agora usa a largura, uma linha
por compromisso (hora · título · onde · quem). No celular o título desce
para a linha de baixo.

**Deixado de propósito:** o `.cbx-item.is-marcado` do seletor de condomínio
(`condo-picker`): é o marcador de teclado de uma lista suspensa, não estado
de registro, e o comentário dele explica por quê.

Varredura de novo depois: nenhuma faixa em Agenda (semana, mês, lista),
Orçamentos e Preventivas; celular 375 sem rolagem lateral. `admin.css?v=322`.

### Item 6 feito: um botão de criar em Orçamentos (19/11/2026)

O "+ Criar orçamento" do topo **não era botão**: era a aba do modo avulso,
com rótulo de ação, ícone de mais e fundo âmbar quando ativa. Ao lado do
"+ Novo orçamento" (o único que cria), lia como um segundo botão igual, e
"Solicitados pelos técnicos" parecia botão também.

- A aba passou a se chamar **"Orçamentos"**, sem o ícone. Os `data-orc-modo`
  e o handler não mudaram.
- As duas abas (`.orc-main-tab`) ganharam a cara da subaba do admin
  (`.nav-sub`): texto, fio embaixo, ativa com o traço escuro, sem âmbar. São
  navegação (trocam a lista), e as de dentro da lista continuam filtro, na
  placa cinza.
- O `alert` de `_orcAbrirDaBancada` que mandava "abrir pela aba Criar
  orçamento" agora diz "aba Orçamentos".

Testado: troca entre as duas abas e volta; só um botão de criar visível
("+ Novo orçamento"). `admin.js?v=399`, `admin.css?v=323`.

⚠️ [painel-admin.md](painel-admin.md) ainda cita a aba pelo nome antigo
("Criar orçamento") nas notas de 02/09; é registro histórico, não foi
reescrito.

### Item 9 feito: a Agenda abre em 0,4 s (19/11/2026)

**Medido antes de mexer** (script só de leitura no banco de teste):

| | Tempo |
|---|---|
| `GET /agenda`, como estava | 2,7 s (e 0,7 s quando repetido logo em seguida) |
| Abrir uma conexão nova com o banco | **~2,4 s** |
| Uma consulta numa conexão aberta | ~0,34 s |
| 6 consultas em paralelo, abrindo conexões / já abertas | 2,4 s / 0,34 s |

A rota já fazia as consultas em paralelo. **A espera era abrir conexão:** o
pool fechava conexão parada há 30 s, e a Agenda pede 5–6 de uma vez (mais
que as outras telas), então quase toda abertura pagava conexões novas.

- **`src/db.js`:** conexão ociosa fica aberta **10 min** (`PG_IDLE_MS`), com
  `keepAlive`. O teto continua 20; conexão derrubada pelo servidor sai
  sozinha (`pool.on("error")`). Vale para o sistema inteiro, não só a Agenda.
- **`retratoDoMes`** (`omie-faturamento.service.js`): as duas consultas
  (contratos do mês e última sincronização) saem juntas; eram em sequência.
- **Front (`admin-agenda.js`):** o período já visto fica guardado
  (`_agCache`) e reaparece na hora, com "Atualizando…" no canto enquanto
  busca de novo; toda gravação (salvar, apagar, atualizar faturamento) limpa
  o guardado, porque a repetição de um compromisso mexe em outros períodos.
  Na primeira carga de um período a grade da vista aparece já, com brilho
  lento (lista: três blocos), em vez do parágrafo "Carregando…"; o "—" de
  dia vazio fica oculto até os dados chegarem.

**Depois:** primeira abertura 0,38 s, com a grade na tela antes dos dados;
voltar à Agenda ou a uma semana já vista mostra os compromissos na hora;
**depois de 40 s parado, 0,36 s** (antes, ~2,5 s). `agenda.test.js` 21/21.
`admin-agenda.js?v=5`, `admin.css?v=326`.

⚠️ **Em produção a espera deve ser menor**, se o app e o banco estiverem na
mesma rede do Railway; não foi medido lá. O ganho do idle maior vale do
mesmo jeito, só que em escala menor.

---

## Redesenho estrutural: maquete aprovando a arquitetura (19/11/2026)

Pedido do Pedro, recusando o que foi entregue nas fases 1 a 5: *"queria um
redesenho mais bruto [...] entender o que pode ficar em uma tela só e o que de
fato precisa de uma tela individual"*, e *"a tela de início por exemplo vc
criou algumas abas e jogou nelas as mesmas telas que já tinha do mesmo exato
jeito"*. Ele tem razão: as fases 1 a 5 **reagruparam o menu** (15 itens em 9
grupos com subabas) e clarearam o visual, mas cada tela manteve o esqueleto
antigo (faixa de números → abas com contador → tabela → ficha).

### O que estava repetido (inventário de 19/11)

1. **Estado da água em 5 lugares:** Painel (alertas críticos, leituras),
   Alertas, Telemetria, Mapa (abas Reservatórios/Bombas/Alertas) e o bloco
   Urgente do Início — os mesmos `_statusData` e alertas.
2. **O que chega do cliente em 3:** Chamados, WhatsApp, Urgente do Início.
3. **Nota fiscal não é entidade:** mora no orçamento; a tela Notas é
   `_avData` filtrado. Financeiro espalhado em 4 (Painel, Contratos, Notas,
   faturamento Omie na Agenda).
4. **"Quem está onde":** posição do técnico no Mapa, carga em Relatórios,
   compromissos na Agenda.

### A arquitetura aprovada (as 4 perguntas, "sim" em 19/11/2026)

| Tela | Reúne | Forma |
|---|---|---|
| **Hoje** | Pede ação + o que sobra do Painel | Uma página, sem subaba: frase da carteira, **fila única** com a ação na linha, "em campo hoje" (quadro do dia por técnico), atividade recente |
| **Monitoramento** | Telemetria + Mapa + Alertas + parte viva do Painel | Lista ou mapa (mesmos dados), chips de filtro, reservatório escolhido no painel ao lado (gráfico 24 h com as faixas 45/20, alertas abertos, histórico). **Alertas deixa de ser tela** |
| **Atendimento** | Chamados + WhatsApp | Caixa de entrada em 3 colunas (lista · conversa · dados). A conversa do WhatsApp é o canal do chamado; nota interna no mesmo fio |
| **Agenda** | Agenda + técnicos no mapa + carga por técnico | Quadro de despacho |
| **Ordens de serviço** | — | Fica |
| **Orçamentos** | Avulsos + solicitados | Lista única; "solicitado" vira estado. **Termina no aprovado** |
| **Financeiro** | Contratos + Notas + receita + faturamento Omie | Faturamento começa no aprovado |
| **Condomínios**, **Preventivas**, **Equipamentos** | — | Ficam (Preventivas: decisão de 04/09, cadastro e acompanhamento juntos) |
| **Relatórios** | — | Fica até virar o dashboard |
| Configurações, Colaboradores | — | **Saem do menu lateral** e vão para o menu do usuário |

A casca muda junto: **busca global (Ctrl+K)** em condomínios, chamados,
reservatórios, documentos e ações; abas com contador viram **chips de filtro**;
**lista e detalhe na mesma tela**; o **mesmo cabeçalho** (título · filtros ·
uma ação primária) em toda tela.

### A maquete

`public/_redesenho-preview.html` (+ `.css` e `.js`), aberta em
`/dev/_redesenho-preview.html` (só fora de produção). Estática, dados de
exemplo, nada grava. Tem a casca nova, **Hoje**, **Monitoramento** e
**Atendimento** funcionando (filtros, seleção, ações da fila com desfazer,
Ctrl+K); as outras telas mostram o que vão reunir. Folha própria, **sem herdar
o `admin.css`**: os mesmos tokens do registro de gestão, sem os remendos.

Conferida em 1440×900 e 375×812, sem erro no console e sem rolagem lateral.

**Veredito (19/11/2026):** aprovada. Em seguida o Pedro pediu **a maquete de
todas as telas antes de codar** (*"então faz a maquete de tudo"*) e reforçou
*"não esquece de deixar igual sistemas profissionais"*.

### Segunda parte da maquete: as outras telas (19/11/2026)

`public/_redesenho-preview-2.js` (usa a ponte `window.MAQ` da primeira parte).
Toda lista segue **um molde só** (`lista()`): cabeçalho com uma ação primária,
visões em chip, busca, **Exportar** (sai de Relatórios e vai para cada lista,
com o filtro da tela), **seleção em lote** com barra de ações, **ordem pela
coluna** (três cliques), **paginação** ("1–8 de 8") e o item escolhido no
**painel ao lado** (linha do tempo + ações + o que está ligado).

| Tela | Como ficou | Referência |
|---|---|---|
| **Agenda** | Quadro de despacho: técnicos nas linhas, dias nas colunas, linha "Empresa" (reunião, pagamento, faturamento Omie, contrato terminando). Coluna **"A agendar"** com chamados sem técnico, preventivas sem responsável e retornos de O.S.; "Agendar" escolhe o técnico e põe na grade. Barra de carga da semana por técnico. Modo **Mapa** com a posição dos técnicos e as visitas do dia | ServiceTitan Dispatch Board |
| **Preventivas** | Barra do mês (feitas · em campo · a fazer · atrasadas), lista por prédio com o mês e a próxima, **tira dos últimos 12 meses** em cada linha, lote "trocar responsável" / "gerar chamados agora". Cadastro e acompanhamento juntos (decisão de 04/09) | Jobber Recurring jobs |
| **O.S.** | Visões Pede ação · Em andamento · Falta enviar; "Enviar" e "PDF" na linha; painel com Aberta → Técnico chegou → Finalizada → Enviada e o que o técnico registrou | Jobber Jobs |
| **Orçamentos** | Lista única: pedido do técnico é um estado ("Fazer orçamento" na linha), a origem vai embaixo do número. Termina no aprovado ("Emitir nota no Financeiro") | Jobber Quotes |
| **Financeiro** | Faixa de quatro números (contratos por mês, faturamento Omie 77 de 81, avulsos do mês, pede ação) + a lista alterna **Notas avulsas / Contratos**. Na linha do contrato, a **nota do mês vinda do Omie** (antes só na Agenda), e o porquê de estar sem nota | QuickBooks / Omie |
| **Condomínios** | Lista com Água, Chamados, Contrato e Preventiva; a linha abre a página | HubSpot Companies |
| **Página do condomínio** | **No lugar das 10 abas, três colunas:** dados (cadastro, contrato e preventiva com a tira de 12 meses, equipamentos) · **histórico do prédio** com filtro por tipo e nota livre · água ao vivo, o que está em aberto e o acesso do síndico. Migalha "Condomínios › prédio", botão "Novo ▾" já com o prédio | HubSpot / ServiceTitan customer record |
| **Equipamentos** | Visões Em uso · Na oficina · Prontos para devolver · Etiquetas em branco · Baixados; painel com o histórico do equipamento (instalado → oficina → orçamento → devolvido) | — |
| **Colaboradores** | Lista com função, onde o técnico está agora e chamados abertos; "Convidar" | Linear Members |
| **Configurações** | Menu à esquerda com 8 seções (Conta, Usuários e acesso, Notificações, Prazos, Operação, IA, Integrações, Limpeza de dados), grupos em cartão, Salvar/Descartar | Stripe / Linear Settings |
| **Relatórios** | Placa explicando que espera a definição do dashboard | — |

A busca global passou a achar também O.S., orçamentos, contratos,
equipamentos e pessoas.

Conferida em 1440×900 (todas) e 375×812 (as 14 rotas sem rolagem lateral).
**No celular a Agenda ainda é a grade rolando de lado** dentro da área; o
certo ali é a vista de um dia em lista, a fazer no código.

**Próximo:** veredito do Pedro nesta segunda parte → reescrever o admin, tela
por tela, começando pela casca + Hoje.

---

## Etapa 1 no código: casca nova e a tela Hoje (19/11/2026)

Maquete aprovada pelo Pedro, com três pedidos para o código: **arrastar e
soltar na Agenda** (entra quando a Agenda virar quadro de despacho), **telas
de carregando, vazio e erro**, e o **menu lateral com as logos de hoje,
abrindo e fechando, "bem bonitão"**. Depois, em cima do resultado: o botão de
abrir/fechar **no topo, só o ícone**, a **logo centralizada**, e **uma busca
só** (a do menu saiu, fica a do topo).

### Arquivos

| Arquivo | O quê |
|---|---|
| `public/admin-nav.js` | Reescrito. Menu de 11 itens em três blocos (sem rótulo · Documentos · Carteira), menu do usuário (Configurações, Colaboradores, Sair), recolher/abrir, gaveta no celular |
| `public/admin-busca.js` (novo) | Busca global Ctrl+K: condomínios, reservatórios, chamados, O.S., orçamentos, pessoas, telas e ações |
| `public/admin-carteira.js` | `renderInicio` virou a tela **Hoje**; `_icGarantirDados` busca também a agenda do dia e guarda erro por fonte |
| `public/admin.css` | Bloco "CASCA NOVA" no fim; as peças novas entraram na lista de exceção do `body *:not(...) { border-radius: 0 }` |
| `public/admin.html` | `lucide.min.js` e `admin-busca.js`; título "Hoje" |
| `public/admin.js` | Só `_sectionTitles.inicio` = "Hoje" |

Versões: `admin.css?v=331`, `admin.js?v=401`, `admin-nav.js?v=11`,
`admin-busca.js?v=1`, `admin-carteira.js?v=6`. Nenhum endpoint novo (o Hoje lê
`GET /agenda`, que já existia), então o `sw.js` não mudou.

### O menu

- É um `<aside class="gb-sb">` **novo**. O `<aside class="sidebar">` antigo
  fica no HTML, escondido, e **continua mandando**: o admin.js esconde item
  dele para o operador, escreve os badges e o nome do usuário nele. Um
  `MutationObserver` ressincroniza o novo. Para esconder uma tela de um
  perfil, continue escondendo o item antigo.
- **Aberto:** logo inteira (`login-logo.png`) centralizada, botão de recolher
  (só o ícone) no canto do topo. **Recolhido:** o ícone pequeno
  (`logo-menu.png`), o botão logo abaixo, só ícones na lista, dica com o nome
  ao passar o mouse, e o contador vira um ponto. A escolha fica em
  `localStorage.sidebarCollapsed` (a mesma chave de antes).
- Contador vermelho só em Monitoramento e Atendimento (é alarme); nos outros,
  neutro.
- **Celular (≤768px):** o menu vira gaveta, aberta pelo ☰ que entra no começo
  da barra de cima; fecha no X, tocando fora, com Esc ou ao escolher tela. A
  barra de baixo continua. A logo da barra de cima saiu (está na gaveta).
- **Nenhum item do menu tem mais subabas:** Monitoramento (etapa 2),
  Atendimento (etapa 3) e Financeiro (etapa 5) viraram telas únicas.
  É transição: cada um vira uma tela só nas próximas etapas.

### A busca (Ctrl+K)

O campo do topo virou um botão que abre a paleta (e é a única busca: a do
menu saiu a pedido do Pedro). Procura **no que o painel já carregou**, sem
rota nova; o que o perfil não carrega não aparece. Sem texto, mostra as ações
(novo chamado, orçamento, condomínio), os chamados em aberto mais recentes e
as telas. ⚠️ O Ctrl+K antigo do admin.js continua registrado no `document`; o
novo escuta na captura da `window` e para a propagação.

⚠️ **As coleções do admin.js são `let` no topo**: existem no escopo global mas
**não** como `window._osData`. Leia pelo nome, protegido por `typeof`.

### A tela Hoje

- Saudação e data; botão **Novo ▾** (chamado, orçamento, condomínio).
- **Frase da carteira** com barra de proporção (normais · baixo · abaixo de
  20% · sem sinal) e "Ver monitoramento".
- **"Precisa de você": uma fila só**, em Agora / Hoje / Nos próximos dias,
  com filtro em chip por tipo e **a ação com nome na linha**. As regras são as
  de sempre (`_chamadosAlertaAbertos`, `_avPendente`, `_osFaltaEnviar`,
  aprovado sem nota, nota com erro, contrato vencendo em 30 dias). ⚠️ **A ação
  leva ao lugar onde a coisa é feita, não grava daqui**: "Emitir nota" e "Dar
  baixa" abrem o orçamento, "Enviar ao cliente" abre a O.S., "Atribuir
  técnico" abre o chamado.
- **Em campo agora** (técnicos: em atendimento, a caminho, com N chamados ou
  livre; quando foi visto pelo GPS), **Agenda de hoje** e **Aconteceu há
  pouco** (chamado aberto/resolvido, cliente respondeu, O.S. finalizada,
  alerta).
- **Carregando:** esqueleto com brilho lento na fila, na frase e na agenda.
  **Vazio:** "Nada esperando por você", com o que faz aparecer algo.
  **Erro:** faixa vermelha dizendo o que não carregou (contratos, agenda,
  O.S., orçamentos) e "Tentar de novo"; o resto da fila continua.
- Tempo curto com plural certo (`_icRel`: "1 dia", não "1 dias"; passou de 30
  dias, a data).

### Testado (banco de teste, 19/11/2026)

Admin em 1440×900 e 375×812, sem erro no console: menu aberto e recolhido,
botão no topo, dica no recolhido, menu do usuário → Colaboradores (o rodapé
acende), Monitoramento com as subabas, Ctrl+K "aurora" → Enter → ficha do
condomínio, gaveta no celular sem rolagem lateral, filtros da fila.
**Não testado:** o perfil operador (o Pedro mandou deixar para depois) e o
estado de erro com falha de verdade (só lido no código).

### Próximo

~~Monitoramento como tela única~~ (✅ etapa 2) → ~~Atendimento (Chamados + WhatsApp)~~ (✅ etapa 3) → Agenda
como quadro de despacho **com arrastar e soltar** (✅ etapa 4; 093 já no banco de teste,
falta em produção) → ~~Financeiro~~ (✅ etapa 5) → as listas restantes no molde
da maquete (O.S., Orçamentos, Condomínios com a página em 3 colunas,
Preventivas, Equipamentos, Colaboradores, Configurações).

---

## Etapa 2 no código: Monitoramento numa tela só (19/11/2026)

Telemetria, Mapa, Alertas (os de telemetria) e o lado ao vivo do Painel viram
**uma tela**, `#/monitoramento`, em `public/admin-monitoramento.js` (novo). O
item do menu deixou de ter subabas.

### Como é

- **Cabeçalho:** "Ao vivo" com a hora da última atualização, a frase da
  carteira (N de M normais · baixo · sem sinal), **Lista | Mapa** e
  "+ Reservatório" (o mesmo botão escondido da Telemetria, quando o perfil o
  vê).
- **Barra:** chips Pede atenção · Sem sinal · Nível baixo ou crítico · Todos,
  filtro de condomínio e busca (prédio, reservatório, código do aparelho).
- **Lista:** reservatório (prédio em negrito, nome · bairro embaixo), nível
  com barra na cor da faixa, bomba, último sinal, situação e nº de alertas.
  Ordem: o que pede atenção primeiro, depois o nível mais baixo. Setas ↑↓ e
  Enter andam pela lista.
- **Mapa:** um pino por prédio na cor do pior reservatório dele, técnicos com
  as iniciais, legenda, e aviso de quantos prédios estão sem localização
  cadastrada. Clicar no pino escolhe o reservatório.
- **Painel do reservatório (ao lado):** prédio (abre a ficha na aba
  Telemetria), nível grande, situação, **Abrir chamado** (já com o prédio) e
  **Histórico e PDF** (abre o modal da Telemetria, que é quem gera o PDF);
  gráfico de 24 h, 7 ou 30 dias com as faixas de 45 % e 20 %, mínimo e
  máximo; **alertas abertos** com **Resolver** (mesma rota `PATCH
  /alertas/:id/fechar`, com confirmação) e o botão de comentários, que abre o
  alerta na tela Alertas (comentários e análise por IA moram lá); dados do
  aparelho; histórico de alertas resolvidos com quanto tempo levou.
- **Endereço:** `#/monitoramento/<id do reservatório>`; F5 volta no mesmo.
- **Estados:** esqueleto enquanto o status não chega; "Nada pedindo atenção
  agora" quando o filtro esvazia por estar tudo bem; "Nenhum reservatório com
  esse filtro" + Limpar filtros; "Nenhum reservatório monitorado ainda"; erro
  e "Tentar de novo" no gráfico; "Sem leituras no período".
- **Celular:** a coluna de bomba e último sinal sai, os chips rolam de lado, o
  painel abre por cima da lista com "← Lista".

### Fontes (nenhum endpoint novo)

`_statusData` (`GET /admin/status`), `_alertasAbertos` (`GET
/alertas-abertos`), `GET /admin/historico?device_ids=&horas=` para o gráfico
(guardado 1 min), `GET /alertas/:device_id` para o histórico de alertas,
`_tecLocs` para os técnicos no mapa. O polling da telemetria (7 s) e o
`carregarTudo` redesenham a lista e a cabeça do painel **sem refazer o
gráfico nem o mapa** (ganchos no fim do arquivo).

### O que continua nas telas antigas (de propósito)

As seções `telemetria`, `mapa`, `alertas` e `dashboard` seguem no HTML e
abrem por link e por endereço, acendendo o item Monitoramento:
- **Histórico e PDF** → modal da Telemetria (`_telSelecionarNoHistorico`);
- **Comentários e análise por IA** do alerta → tela Alertas;
- **Chamado que vira alerta** (P1/P2, fora do prazo) é do Atendimento.
O badge do item Monitoramento é o mesmo de Alertas (`badgeDe`).

### Testado (banco de teste, 19/11/2026)

1440×900 e 375×812, sem erro no console: lista, chips, escolher reservatório
(endereço muda), F5 em `#/monitoramento/7`, mapa (16 tiles, aviso de prédio
sem localização), painel com gráfico vazio ("Sem leituras"), alertas abertos e
histórico, celular com o painel por cima e sem rolagem lateral.
**Limite do banco de teste:** os 4 reservatórios estão sem sinal e sem
leitura, e o prédio não tem lat/lng — o gráfico com dados, as cores de nível
e os pinos no mapa só foram vistos no código. **Não clicado:** Resolver (muda
o banco) e "+ Reservatório".

---

## Etapa 3 no código: Atendimento, uma caixa de entrada (19/11/2026)

Chamados e WhatsApp viram **uma tela**, `#/atendimento`, em
`public/admin-atendimento.js` (novo), no molde de Zendesk/Freshdesk: a fila
à esquerda, o item escolhido à direita. O item do menu deixou de ter subabas.

### Como é

- **Cabeçalho:** frase "N chamados em aberto · N sem técnico · N fora do
  prazo · N conversas sem resposta" e **+ Novo chamado** (o mesmo formulário de
  sempre, `btnNovoChamado`).
- **Fila:** busca (prédio, assunto, nº, telefone, técnico) e **visões em
  chip**: Em aberto · Sem técnico · Fora do prazo · Críticos (P1) ·
  Preventivas · Resolvidos · Cancelados · Todos. Visão de alarme vazia some.
- **Troca "Chamados | Conversas" no topo** (só com o WhatsApp ligado). Ver
  "Chamados e conversas não se misturam", abaixo.
- **Item da fila:** canal (WhatsApp, preventiva, alerta da telemetria,
  escritório), prédio, quando abriu, título, prioridade, estado (fora do
  prazo, técnico a caminho/no local, aberto há X, resolvido) e o técnico
  (iniciais) ou "sem técnico". Ordem: fora do prazo primeiro, depois a
  prioridade, depois **quem espera há mais tempo**; nas visões de fechados, o
  mais recente primeiro. ↑↓ e Enter andam pela fila.
- A **conversa de um chamado** (mesmo telefone do `cliente_telefone`) vira a
  aba **"Conversa no WhatsApp"** dentro do chamado.
- **Endereço:** `#/atendimento/<id do chamado>` ou `#/atendimento/c<id da
  conversa>`; F5 volta no mesmo.
- **Estados:** esqueleto na fila até os chamados chegarem; "Fila limpa" nas
  visões de alarme vazias; "Nada encontrado" na busca; o palco vazio explica o
  que aparece quando se escolhe.
- **Celular:** o item abre por cima da fila com "← Fila"; os chips rolam de
  lado.

### Chamados e conversas não se misturam (decisão do Pedro, 19/11/2026)

A primeira versão punha as conversas do WhatsApp na mesma fila dos chamados.
O Pedro achou que *"tanta informação junto das conversas ainda pode ficar
confuso"*, e o motivo é do sistema: a IA atende a maior parte das conversas
sozinha e abre o chamado quando é problema de verdade, então misturadas elas
enchiam a fila e escondiam o P1. É o modelo do Intercom e do Blip (conversa e
ticket em caixas separadas e ligadas), não o do Zendesk (onde toda mensagem
vira ticket).

- **Troca "Chamados | Conversas"** no topo da tela, cada uma com a sua fila e
  as suas visões. A de Chamados nunca mostra conversa.
- **Conversas:** Sem resposta · Com a IA (aberta, ninguém assumiu, a última
  palavra foi da IA) · Assumidas por alguém · Encerradas · Todas. Frase
  "N conversas abertas · N sem resposta · N com a IA".
- O contador da troca **conta só as conversas sem resposta** (o que espera
  uma pessoa), em vermelho; o de Chamados, os em aberto.
- A ligação entre os dois fica **dentro do chamado** (aba "Conversa no
  WhatsApp"), não na fila.
- Trocar de fila com um item aberto da outra limpa o palco.
- `#/atendimento/c<id>` abre direto na fila de conversas.
- Sem a integração ligada a troca não aparece e a tela é só de chamados.

Testado com três conversas **simuladas só na memória da página** (o banco de
teste não tem nenhuma): contagens, visões, frase, a fila de chamados sem
nenhuma conversa, e a troca limpando o palco.

### ⚠️ O painel do chamado e o chat do WhatsApp foram MOVIDOS, não reescritos

`#chDetailCol` (desenhado por `renderChDetalhe`) e `.wa-chat-col` +
`#waInfoCol` (desenhados por `_waSelecionar`) são **hospedados** no palco da
tela nova. As ações do chamado são delegadas no `body` e as do WhatsApp
escutam nos próprios elementos, então tudo continua funcionando: resolver,
cancelar, reabrir, trocar técnico e prédio, histórico, avaliação, "Abrir
página", assumir/devolver/fechar conversa, responder.

- Ao abrir as telas antigas (`#/chamados`, `#/whatsapp`, que seguem
  alcançáveis por endereço e acendem o item Atendimento), os blocos **voltam**
  para o lugar de origem (`devolver`).
- ⚠️ **Antes de qualquer `innerHTML` na raiz da tela, devolva os blocos.**
  A primeira versão redesenhava a tela com o painel dentro e o apagava do
  documento (achado no teste: `#chDetailCol` sumia depois de ir a
  `#/chamados` e voltar).
- ⚠️ Aberta pelo endereço antes de os chamados chegarem, a tela marcava o item
  e deixava o palco vazio. Os ganchos (`renderChamados`, `carregarAtendimento`,
  `carregarTudo`) redesenham o palco quando ele está vazio e há escolha.
- Abrir a tela marca os chamados como vistos (`_chamadosIdsAck`), como a tela
  Chamados fazia. O badge do item é a soma de Chamados e WhatsApp.
- Hoje e a busca Ctrl+K passam a abrir o chamado aqui (`gbAtEscolher`), não
  na página `#/chamados/<id>`; a página continua pelo "Abrir página ↗".

### Testado (banco de teste, 19/11/2026)

1440×900 e 375×812, sem erro no console: fila e chips, escolher chamado
(endereço muda), trocar de chamado, `#/chamados` e volta (painel devolvido e
hospedado de novo), F5 em `#/atendimento/10`, celular com "← Fila" e sem
rolagem lateral. **Não testado:** o WhatsApp (a integração está desligada no
banco de teste, sem conversas), as ações que gravam (resolver, cancelar,
trocar técnico), e o perfil operador.

---

## Etapa 4 no código: a Agenda vira quadro de despacho, com arrastar e soltar (19/11/2026)

Pedido do Pedro ao aprovar a maquete: *"arrastar e soltar na Agenda. Nos
quadros de despacho de verdade você arrasta o chamado para o técnico"*. Vista
nova **Quadro** (a de abertura no computador) em `public/admin-despacho.js`
(novo), no molde do Dispatch Board do ServiceTitan. As vistas Semana, Mês e
Lista do `admin-agenda.js` continuam, na mesma troca de vistas.

### Como é

- **Grade:** técnicos ativos nas linhas (com "N visitas na semana"), dias da
  semana nas colunas (seg a sáb; domingo só aparece quando tem algo), e a
  linha **Empresa** com o que não é de técnico: reunião, pagamento,
  faturamento do Omie, contrato terminando, retorno de O.S., compromisso sem
  técnico. Hoje marcado.
- **"A agendar" (à esquerda):** chamados em aberto **sem visita marcada em
  nenhuma semana**, separados em Chamados e Preventivas, na ordem fora do
  prazo → prioridade → mais antigo. Cada um tem **Agendar** (formulário curto:
  técnico, dia, hora), que é o caminho sem mouse e no celular.
- **Arrastar e soltar:**
  - chamado → célula de técnico: cria uma **visita ligada ao chamado** (hora:
    a primeira cheia livre do técnico no dia, das 8h às 17h) e **atribui o
    técnico ao chamado** (`PATCH /chamados/:id`, a rota de sempre, para ele
    ver no app);
  - visita → outra célula: muda dia e técnico, mantém a hora (e troca o
    técnico do chamado, se a visita tiver um);
  - visita → coluna "A agendar": **desmarca** (o chamado volta para a fila).
  - Chamado não cai na linha Empresa; visita de chamado também não.
  - Toda ação mostra um aviso com **Desfazer** (8 s).
- **Clique numa visita:** menu com Abrir o chamado · Remarcar · Editar ·
  Desmarcar. Compromisso que **se repete não arrasta** (mudaria a série
  inteira): o menu oferece "Editar a série", o formulário de sempre.
- **Estados:** grade com brilho lento na primeira carga; "Nada a agendar"
  quando a fila esvazia; aviso quando não há técnico ativo cadastrado.

### O que mudou no servidor (⚠️ migration 093)

- `migrations/093_compromisso_chamado.sql`: `compromissos.chamado_id`
  (nullable, `ON DELETE SET NULL`) e índice. Aditiva e idempotente.
- `src/routes/agenda.routes.js`: aceita `chamado_id` no POST/PATCH, devolve
  em cada visita o `chamado_id`, o status, o técnico e a prioridade do
  chamado (LEFT JOIN), e um mapa `visitas_chamados` com a próxima visita de
  cada chamado (para a coluna "A agendar" não depender da semana na tela).
- ⚠️ **A rota lê a coluna nova: sem a 093 o `GET /agenda` dá erro.** Rodar
  no banco de teste antes de testar e **em produção ANTES do push**, junto com
  090, 091 e 092.

### Testado (banco de teste, 19/11/2026)

093 aplicada no **banco de teste** em 19/11 (a pedido do Pedro); servidor
reiniciado com a rota nova (`GET /agenda` → 200 com `visitas_chamados`).
Arrastar testado com os eventos de arrastar e soltar do navegador, conferindo
o banco pela API depois de cada passo:

| Passo | Resultado |
|---|---|
| #10 (sem técnico) → Carlos, quinta 19 | Visita às 08:00 (11:00 UTC) ligada ao #10; o #10 ganhou o Carlos; saiu de "A agendar"; aviso "#10 com Carlos, hoje às 08:00 · técnico atribuído · Desfazer" |
| Visita → Marina, sábado 21 | Dia e técnica trocados, hora mantida; o #10 passou para a Marina |
| Desfazer da remarcação | Voltou para quinta com o Carlos, nos dois lados |
| Visita → coluna "A agendar" | Desmarcada; o #10 voltou para a fila |
| Desfazer do desmarcar | Visita recriada no mesmo horário |

Celular 375×812: abre na Lista; o Quadro mostra "A agendar" em cima e a grade
rolando de lado dentro da caixa, sem rolagem lateral na página.
1440×900: grade cabendo, formulário "Agendar" e menu da visita.
**Limpeza:** a visita de teste foi desmarcada e o #10 voltou sem técnico,
como estava. Ficaram no banco de teste os compromissos marcados como apagados
(a agenda é registro) e o histórico de troca de técnico do #10.

⚠️ **Desmarcar a visita não tira o técnico do chamado** (de propósito: o
chamado continua com quem foi escolhido, só sem data). O Desfazer de
"agendar" desfaz as duas coisas.

**Não testado:** arrastar com o mouse de verdade (os eventos foram
disparados por script, o mesmo caminho do navegador) e o perfil operador (a
Agenda é só da gestão).
---

## Etapa 5 no código: Financeiro numa tela só (19/11/2026)

Notas fiscais, Contratos e o faturamento dos contratos no Omie (que só a
Agenda mostrava) viram **uma tela**, `#/financeiro`, em
`public/admin-financeiro.js` (novo). Era o último item do menu com subabas.

### Como é

- **Cabeçalho:** o mês ("Novembro de 2026") e a troca **Notas fiscais |
  Contratos**. Endereço `#/financeiro/notas` ou `#/financeiro/contratos`.
- **Faixa do mês, quatro números:** contratos por mês (soma dos ativos) ·
  **faturamento do mês no Omie** ("77 de 81", "4 contratos sem nota · ver",
  abre o painel do faturamento que era da Agenda; só o admin vê, como a rota)
  · avulsos aprovados no mês · **Pede ação** (notas com erro, aprovados sem
  nota, contratos vencidos e vencendo), em que cada parte é um atalho para a
  lista já filtrada.
- **As listas são as de sempre, MOVIDAS para cá** (a técnica do
  Atendimento): o conteúdo da tela Notas (`#nfRoot`, `renderNotas`) e o
  cartão da tela Contratos (`_ctrsRender` e companhia). Filtros, busca, ordem
  pela coluna, "+ Novo contrato" e as páginas do orçamento e do contrato não
  mudaram. `#/notas` e `#/contratos` seguem abrindo e pegam o conteúdo de
  volta; o item Financeiro acende nelas.
- A faixa se redesenha quando um orçamento, uma nota ou um contrato é gravado
  (ganchos em `_avRenderTudo`, `_ctrRefrescarListas`, `_ctrsRender`).
- Perfil operador não vê a tela (lê orçamentos e contratos, que dão 403).

### Testado (banco de teste, 19/11/2026)

1440×900 e 375×812, sem erro no console: faixa (Omie 77 de 81, 7 aprovados
sem nota), troca para Contratos e volta, atalho "aprovados sem nota" caindo
na lista filtrada, painel do Omie, `#/contratos` e volta (o cartão vai e
volta), celular sem rolagem lateral. O banco de teste não tem contrato nem
nota emitida: essas linhas só foram vistas no código.

---

## Etapa 6 no código: o molde de lista, começando pela O.S. (20/11/2026)

A `lista()` da maquete (`_redesenho-preview-2.js`) virou peça de verdade:
**`public/admin-lista.js`** (`GBLista.criar(cfg)`), o molde que as listas
restantes (Orçamentos, Preventivas, Equipamentos, Colaboradores) vão usar.
A primeira tela nele é **Ordens de serviço** (`public/admin-os-lista.js`).
Pedido do Pedro nesta rodada: *"seguir a maquete e fazer o mais bonito e
profissional possível"*.

### O molde

- **Cabeçalho:** a frase da tela e **uma ação primária**. O título já está
  na barra de cima; o `h1` fica só para leitor de tela (repetido, parecia
  amador).
- **Barra:** visões em **chip com contador** (sobre o conjunto inteiro, sem a
  busca), busca sem acento e sem caixa, **Exportar** em CSV (`;` e BOM, abre
  no Excel em português) só do que está filtrado.
- **Tabela:** seleção em lote com barra azul e ações; **ordem pela coluna** no
  ciclo de três cliques (natural → invertida → desligada, que volta à ordem de
  trabalho), gravada em `localStorage` `ordem:<lista>` (o mesmo formato do
  `_ordenar` do admin.js); **paginação** com 25/50/100 por página. A visão e o
  tamanho da página ficam em `lista:<lista>`. Setas ↑/↓ andam pelas linhas.
- **Painel ao lado** (420 px; 360 abaixo de 1280): sem nada escolhido, o
  computador abre o primeiro da visão. Duplo clique abre a página inteira.
- **Estados:** esqueleto ao carregar, vazio por visão com atalho para
  "Todas", vazio de busca com "Limpar busca", erro com "Tentar de novo".
- **Celular (≤768):** linhas viram cartões (número e prédio à esquerda,
  situação à direita), chips rolam de lado, o painel cobre a tela com "Lista".
- CSS em bloco próprio no fim do `admin.css`, com os **tokens declarados no
  `.ls`** (os nomes da maquete não existem no admin.css).

### Ordens de serviço

| Antes | Agora |
|---|---|
| Abas Todas · Finalizadas · Em andamento · A enviar | Chips **Pede ação** (padrão) · Em andamento · Falta enviar · **Sem e-mail** (só aparece se houver) · Todas |
| Frase com "N finalizadas esperando envio →" | Frase (total · abertas no mês · em andamento) e o botão primário **"Enviar as N pendentes"**, que abre o modal de lote de sempre |
| A linha abre a página da O.S. | A linha abre o **painel ao lado**; "Abrir página" ou duplo clique vão para `#/os/<id>` |
| Lote só "Enviar por e-mail" | Lote "Enviar ao cliente" (só as que têm e-mail) e "Baixar PDFs" |
| — | Exportar CSV da visão |
| "técnico ainda não chegou" em O.S. esquecida | "aberta há N dias, técnico não chegou" (7 dias ou mais), em âmbar |

O painel tem a linha do tempo (Aberta → Técnico chegou → Finalizada →
Enviada, com o e-mail de destino ou "o prédio não tem e-mail no cadastro"),
**o que o técnico registrou** (resultado, quem recebeu, peças, fotos, retorno,
orçamento pedido, observações e o aviso de **assinatura em branco**), lido do
`GET /ordens-servico/:id` na primeira vez que a O.S. é escolhida, e o que está
ligado (chamado de origem, ficha do prédio).

⚠️ **Nenhuma regra nova, nenhuma rota nova.** Dados e ações são os do admin.js:
`_osData`/`carregarOrdensServico`, `baixarOSPdf`, `_osEnviarUmaPelaLista`,
`_osAbrirEnvioLote` (que lê `_osSelecionadas`; o molde preenche antes de
chamar), `abrirOSDetalhe`. O **cartão antigo continua no HTML, escondido**
(`.os-cartao-antigo[hidden]`): a página da O.S. liga os botões dela nos ids
dele (`_osBindEventos`). Quem grava chama `_osRenderTabela`, e o embrulho no
fim do `admin-os-lista.js` redesenha a tela nova junto.

### ⚠️ Armadilhas achadas

- `.main input[type="search"]` desenha borda e fundo em todo campo de busca:
  a do molde saía com uma caixa dentro da outra.
- No celular, `table { min-width: 520px }` e o padding global de `td`
  esticavam o cartão para fora da tela.
- A entrada da seção (`sectionIn`, com `fill-mode: both`) deixa um
  `transform` na `.section`, e **`position: fixed` dentro dela passa a se
  posicionar pela seção, não pela tela**: o painel do celular não cobria a
  largura toda. A seção com `.ls` entra só com opacidade (`lsSecIn`).

### Testado (banco de teste, 20/11/2026)

1900×1000 e 390×844, sem erro de JS: visões, ordem nas três posições,
paginação e troca para 25, busca sem resultado, seleção da página inteira e
barra de lote, painel com O.S. finalizada (registro lido do servidor) e em
andamento, "Abrir página" → Voltar (volta à lista com a mesma O.S.
escolhida), cartões e painel no celular sem rolagem lateral. O banco de teste
tem **uma** O.S.; o volume (137 linhas) foi montado **só na tela**, sem
gravar. **Não testado:** enviar de verdade (o modal abre, não foi enviado),
"Baixar PDFs" com várias, e o perfil operador.

Versões: `admin.css?v=340`, `admin-lista.js?v=1`, `admin-os-lista.js?v=2`.
Nenhum endpoint novo (o `sw.js` não muda).

---

## Onde paramos (19/11/2026, fim do dia) — retomar daqui

**Branch:** `feature/admin-condominio` (sai da `feature/nota-fiscal-omie`),
commitada e com push **na branch**, sem merge e sem deploy. A maquete de
todas as telas está no repositório: `public/_redesenho-preview*.{html,css,js}`,
aberta em `/dev/_redesenho-preview.html` com `npm run dev` (fora de produção).

### Pronto no código

| Etapa | Tela | Arquivo |
|---|---|---|
| 1 | Casca (menu com logos, recolher no topo, menu do usuário), busca Ctrl+K, **Hoje** | `admin-nav.js`, `admin-busca.js`, `admin-carteira.js` |
| 2 | **Monitoramento** (Telemetria + Mapa + Alertas + Painel) | `admin-monitoramento.js` |
| 3 | **Atendimento** (filas Chamados \| Conversas separadas) | `admin-atendimento.js` |
| 4 | **Agenda** como quadro de despacho, com arrastar e soltar | `admin-despacho.js` + migration **093** |
| 5 | **Financeiro** (Notas + Contratos + Omie) | `admin-financeiro.js` |
| 6 | **Molde de lista** e **Ordens de serviço** nele (20/11) | `admin-lista.js`, `admin-os-lista.js` |

Nenhum item do menu tem mais subabas. As telas antigas seguem no HTML,
abrindo por endereço, e os blocos movidos voltam para elas.

### Falta (na ordem que eu seguiria)

1. **As listas restantes no molde da maquete** (`_redesenho-preview-2.js` é a
   referência de cada uma), agora com `GBLista.criar` (ver etapa 6):
   ~~O.S.~~ (✅ 20/11) · Orçamentos (lista única, "solicitado" vira
   estado, termina no aprovado) · **Condomínios** (lista + página do prédio
   em 3 colunas no lugar das 10 abas) · Preventivas (tira dos 12 meses) ·
   Equipamentos · Colaboradores · Configurações (menu à esquerda). Molde:
   chips, busca, Exportar, seleção em lote, ordem pela coluna, paginação,
   painel ao lado.
2. **Relatórios:** o Pedro quer um dashboard; perguntar o que ele deve
   responder antes de desenhar (memória "Relatórios vira dashboard").
3. **Perfil operador:** o Pedro mandou deixar para depois; testar as cinco
   telas novas com ele antes de subir.
4. **Ordenar no celular** (seletor "Ordenar por" acima das listas).

### Para subir para produção (o Pedro decide quando)

1. Rodar em produção, **antes** do push, as migrations **090, 091, 092 e
   093** (conferir antes no `information_schema` o que já está lá; eu sou
   bloqueado de rodar com `--prod`, quem roda é ele).
2. Merge da `feature/nota-fiscal-omie` na main → merge desta → push (= deploy).
3. Passo a passo do Omie depois do deploy: [nota-fiscal.md](nota-fiscal.md).

### Pendências antigas que continuam valendo

- A ronda de UX de 19/11 foi toda feita, menos Relatórios (vai virar dashboard).
- Testar as páginas de documento com o perfil operador (chamado sem "Ligado a
  este chamado"; `#/contratos/…` ignorado).
