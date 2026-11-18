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
# Redesenho do painel admin — o condomínio como eixo (🟡 fases 1 a 3 prontas, 18/11/2026)

Plano aprovado pelo Pedro em 18/11/2026. **Fases 1, 2 e 3 implementadas na branch
`feature/admin-condominio`** (sem merge, sem deploy) — ver as seções "O que
foi implementado" no fim. Fases 4 e 5 continuam planejadas. O
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
| 4 | Tema claro (tokens no contêiner do painel) | Sim, tudo | 📋 |
| 5 | Retirar as telas que sobrarem | **Só com autorização** | 📋 |

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
