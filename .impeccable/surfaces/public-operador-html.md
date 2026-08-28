---
version: 1
slug: "public-operador-html"
primary_target: "public/operador.html"
related_targets: ["public/operador.css","public/operador.js"]
---

## Escopo e modo

Painel do operador, `/operador/painel` — `public/operador.html` / `.css` / `.js`.
Modo **Operate**, no registro mais duro dele: quem está aqui está **de turno**,
com o telefone tocando, e a tela existe para uma decisão repetida — *quem vai,
e em que ordem*.

Fluxo e backend: [`../../docs/modulos/painel-operador.md`](../../docs/modulos/painel-operador.md).

## Público e trabalho

Operador da General (perfil `operador`, quatro telas). Desktop de mesa é a cena
principal; o celular é a exceção que precisa funcionar (chamado que chega por
telefone longe da mesa). Três perguntas, nesta ordem:

1. "O que estoura primeiro?" — a fila, ordenada por SLA restante.
2. "Quem pode ir?" — o despacho, e a resposta é geográfica.
3. "O que já foi tentado?" — a ficha, antes de ligar para o técnico.

## Direção aprovada (27/08/2026) — "a fila do turno, medida pelo relógio"

Comp: [`../../docs/comps/painel-operador-v2.html`](../../docs/comps/painel-operador-v2.html).
O item é "isto pede alguém", ordenado pelo prazo que estoura primeiro, e o
**instrumento é evidência dentro do item** — nunca a estrutura da tela.

**Momento memorável:** o item que já estourou tem a régua inteira em vermelho —
a única peça de campo cheio da tela, e ela só acende com estado real.

## Restrições

- Mundo **"Chapa" em registro de operação** (o do `admin.css`): corpo 13px,
  rampa fixa, sem gesto retórico. **Não é** o registro do painel do cliente.
- **Folha autônoma.** Não carrega `admin.css` nem importa de `admin.js`. Tokens
  duplicados de propósito — a paleta agora vive em **cinco** arquivos.
- A coluna d'água é a peça da landing/cliente (não o cilindro do admin).
  ⚠️ **Desde 27/08 ela deita em TODA largura aqui**, não só no celular — em pé
  ela mandava na altura do item. Ver o passe de densidade lá embaixo; a razão
  .309 e o tubo em pé continuam valendo na landing e no painel do cliente.
- HTML/CSS/JS puro, CSP `script-src 'self'`. Backend não muda para viabilizar
  desenho: `GET /operador/fila` já entrega a tela inteira.

## Passe de qualidade (27/08/2026) — o que foi corrigido e por quê

O comp e a implementação compartilhavam os mesmos defeitos; medidos na tela:

- **Item de 318px para 258px.** A pilha do tanque (40×132) mandava na altura e
  cabiam dois itens por tela num painel de varredura. Tubo a 34×110, mesma
  razão. E o `h3` do título trazia **29px de margem do navegador** que, em
  item de flex, não colapsa.
- **Medida de linha de 110–140ch** → 68ch. O texto atravessava a tela inteira.
- **Ações em coluna própria**, no mesmo x em toda a fila. Antes eram o fim de
  uma linha que variava com o texto.
- **`--muted2` (3,05:1) saiu de todo texto.** Era a tinta de quase toda etiqueta
  mono — o pior caso possível (8–9px, caixa alta). Hoje o piso é 5,2:1.
- **Rótulo do tanque a 8px e truncado** ("Caixa S…") → 9,6px, célula do
  tamanho do nome; no celular, quebra em duas linhas.
- **O nome do prédio saiu do mono de 9px** para 12,5px em Archivo. É por ele
  que se acha o item quando o técnico liga.
- **`.fala` era CSS morto**: o relato de gente virou bloco citado (origem
  `manual`/`whatsapp` apenas — frase escrita pelo sistema não é fala de
  ninguém, e a API não devolve autor).
- **"+ Novo chamado" era `display:none` no celular** — a única porta de entrada
  do chamado por telefone. Hoje some o rótulo, fica o ícone.
- **Pulso nascia vermelho** ("verifique a conexão") até a primeira carga:
  alarme falso a cada boot. Ganhou um terceiro estado, neutro.
- **Dia calmo perdia o trilho da equipe** — fila vazia não é tela vazia.
- **Sobrancelha** ("Nada pede alguém agora" acima do título) desceu para baixo
  do título, no papel que de fato tem: marcador de estado. Copy preservada.
- Diálogos: `aria-modal`, foco entra e **volta para o botão de origem**, Tab
  preso dentro.
- Mapa: fallback quando o Leaflet não carrega, reenvio de tile que falhou
  (a mesma correção do admin) e o crédito do OSM, que tinha sido removido.

## A marca (corrigido em 27/08, depois do passe)

**A barra usa `logo-topo.png`, nunca a palavra "General" composta em tipo.**
É o wordmark **sem** a assinatura — o mesmo que a barra do painel do cliente
usa, e pela mesma razão registrada lá: o lockup do `login-logo.png` fica
ilegível em qualquer escala de barra. **36px numa barra de 68 (30 na de 60)
desde 28/08** — razão 0,53, a do painel do cliente (40 em 74). Era 30 em 60,
que dava 0,50: o logo não estava só menor, estava proporcionalmente menor.

⚠️ **A lição:** o passe de acabamento verificou a tela **contra ela mesma** —
composição, contraste, estados, teclado — e não **contra as superfícies
irmãs**, que era o pedido. Um comp pode digitar o nome da marca; uma
superfície do produto, não. Ao trazer qualquer tela para este sistema, o
primeiro par de olhos é lado a lado com `cliente.html` e `index.html`.

## A conformidade com as irmãs (27/08, o passe que faltava)

A comparação elemento a elemento contra `cliente.html`/`.css` e a landing
achou 13 divergências. O que passou a valer aqui:

| | Regra |
|---|---|
| Marca | `logo-topo.png`, **36px em barra de 68 (30 em 60)** desde 28/08. Nunca texto. |
| Cabeça | `apple-mobile-web-app-title` = "General"; `<title>` = `GENERAL • <tela>` |
| Família | `--fonte` / `--mono`, nunca a família por extenso |
| Chanfro | `--corte` / `--corte-p` com `--ch` local, nunca `polygon()` cru |
| Curva | `--saida` nas transições |
| Barra e coluna | `--barra-h`, `--area-max`, `--trilho-w`, `--gut` — nomes das irmãs, valores do registro de operação |
| Foco | `box-shadow: inset 0 0 0 2px` (nunca `outline`, que o `clip-path` recorta) |
| Rolagem | polegar `rgba(255,255,255,.22)`, hover amarelo, **com** `scrollbar-width`/`-color` |
| Diálogo | fundo `rgba(2,6,22,.76)` sem blur, entrada `sobe .22s`, `body.com-ficha` |
| Movimento | a regra global de `prefers-reduced-motion` |

**A barra divide a tela como o corpo divide.** Acima de 1340px
(`--area-max` + `--trilho-w`) ela vira o mesmo grid do `.comB`: a marca cai no
x do item e as ações no dos cartões da equipe. Abaixo disso o centramento é
zero e o `--gut` já basta — por isso a regra é condicional, e não um grid
permanente que obrigaria as ações a caber em 300px.

⚠️ **Dois furos do sistema que este passe revelou** (valem para o
`cliente.css` também, onde estão latentes): o anel de foco `inset` é **engolido
por qualquer peça que já tenha um `inset` próprio** — o botão de fio ficava sem
foco visível —, e **anel amarelo sobre botão amarelo é invisível**. Aqui, sobre
amarelo o anel é marinho: a Regra do Amarelo Cego aplicada ao foco.

**Ainda em aberto:** o rótulo "TURNO" ao lado da marca não tem par em nenhuma
outra superfície. É copy, então é decisão do Pedro.

## O terceiro passe (27/08) — o que só aparece com as telas abertas

Os dois passes acima foram feitos lendo código. Este foi com as três superfícies
montadas no navegador ao mesmo tempo, medidas em 1544 / 900 / 620 / 430px.

| | Regra que passou a valer |
|---|---|
| Faixas | **Três**, não duas: >1080 duas colunas · 1080–760 o trilho vira faixa · <760 celular. 1080 e 760 são os números da landing. |
| Barra | Chega translúcida (`blur(14px)`, fio transparente) e endurece em `.is-rolada` acima de 12px de rolagem, como landing e cliente |
| Altura da barra | Sempre `var(--barra-h)`; o celular **redeclara o token**. Nunca `calc(54px + …)` — o `.trilho` gruda em `top:var(--barra-h)` |
| `env()` | Sempre com fallback `, 0px`; sem ele a declaração inteira cai em quem não conhece `env()` |
| Peças | Nenhuma caixa de canto reto. Com fio → chapa de duas camadas; sem fio → só `clip-path` |
| Ícones | `stroke-linecap="square"` / `stroke-linejoin="miter"`. Nunca `round` |
| Engrenagem | Máscara que a prende à faixa de campo aberto e a apaga antes do primeiro item; `top` em `px` (em `vw` o corte anda com a janela) |
| Alvo de toque | 44px no celular |
| Unidades | `100dvh` ao lado do `100vh`; `100svh` no diálogo |

## O passe de densidade (27/08) — "muito espaco livre com coisa pequenininha"

O Pedro apontou o item da fila. Medido: a regua de SLA ficava **71-87% vazia**,
a coluna de acoes **55-73%**, e quem mandava na altura era a pilha do tanque
(153px), que custava 100px por item.

| | Regra que passou a valer |
|---|---|
| Coluna d'agua | **Deita em toda largura**, nao so no celular (decisao do Pedro). Uma renderizacao, na base da folha; o celular so ajusta medidas |
| Trilha dos tanques | Largura **fixa** (320px). Com `max-content` o texto da prova comecava num x diferente por item |
| Etiqueta mono | **Um tamanho: 10,5px.** Havia cinco degraus abaixo de 11px na mesma tela |
| Rotulo do tanque | Archivo 12px — e nome proprio do cadastro, nao etiqueta de sistema |
| Numero do chamado | 11,5px, meio degrau acima: e por ele que se acha o item ao telefone |
| Regua de SLA | Alinhada ao **topo**, na altura do titulo. O campo de cor continua cheio |
| Origem | No fim da linha do predio, encostada a direita. `.item-pe` virou CSS morto e saiu |

Resultado medido: item de **258 para 161px** (dois reservatorios), **126** (um),
**119** (mudo). Tres itens completos na primeira tela em vez de dois.

⚠️ Nao truncar etiqueta com `ellipsis` nesta faixa de tamanho: a 10,5px
"DISPONIVEL · NO MAPA" saia como "DISPONIVEL · N…", cortando a metade que
decide. Quebra em duas linhas — o cartao tem altura.

**O defeito que motivou tudo:** entre 660 e ~1090px a tela desmontava. Trilho
rígido de 300px + item de largura fixa deixavam só o texto para ceder, e a
900px a descrição caía para 10ch (contra os 68 do passe anterior) enquanto o
item ia de 258 para 330+px. Com a quebra de 1080: item de volta a 258, texto em
57ch.

⚠️ **Todo `--ch` local é morto — nas cinco folhas.** `--corte` resolve `--ch`
no `:root` e os filhos herdam o polígono pronto. Registrado em `DESIGN.md`
("Shapes"). Aqui o chanfro é o `--ch` do `:root`, hoje 10px; mexer em `--ch`
de componente não faz nada.

## O passe de composição (28/08) — "a tela era duas telas"

Feito na prévia, medido em 430 / 761 / 900 / 1090 / 1339 / 1340 / 1440 / 1920.

| | Regra que passou a valer |
|---|---|
| Composição | O **par** fila+trilho centra junto (`minmax(0,--area-max) --trilho-w` + `justify-content:center`), e a barra repete o recuo em `padding-inline`. Com `1fr` sobravam 285px de campo morto entre as colunas a 1920 |
| Fio do trilho | `--fio`, não `--fio-fraco`: colado à fila, ele virou a junta, e .07 sobre `--mar-900` não se vê |
| Prova | **Deita entre 761 e 1339px**, com `max-width:340px` na trilha. A quebra de 1080 tinha resolvido o colapso, não a medida: 33ch a 900, 16ch a 1090, 50ch a partir de 1340 — alargar a janela piorava a leitura |
| Placar | A leitura **centra na célula** (as três ficavam 50–65% vazias); no celular volta a encostar à esquerda, porque pilha se lê por margem comum |
| Categoria | A ficha imprimia a chave do banco (`nivel_baixo`) enquanto o `<select>` do mesmo arquivo já escrevia "Nível baixo". Mapa `CATEGORIA_ROT` + humanização do caso sem correspondência |

⚠️ **O centramento do par depende de o trilho ter o fundo do campo**
(`--mar-900` nos dois). Ele não é uma faixa de cor colada na borda direita — é
um fio e um conteúdo. Dar fundo próprio ao trilho transforma a regra numa
coluna boiando no meio da tela.

⚠️ **A lição desta rodada:** os três passes de 27/08 verificaram cada peça
contra si mesma e contra as irmãs, e nenhum verificou a tela como **uma
composição na largura em que ela é usada de verdade**. Os dois defeitos maiores
não estavam em peça nenhuma — estavam no vão entre elas (285px) e na faixa de
largura que ninguém abriu (a medida não-monotônica). Ao mexer nesta tela,
meça em pelo menos 900, 1090, 1340 e 1920 antes de olhar qualquer componente.

## O passe de acabamento (28/08) — a gramática da landing

Pedido do Pedro, textual: *"muita coisa escrita, pouca hierarquia"*, *"o lugar
que mostra a equipe agora está meio feio"*, *"o cabeçalho está longe da
qualidade da landing"*. E, explicitamente: **refino, sem mudar estrutura e sem
tirar conteúdo.** Nenhuma palavra saiu da tela neste passe.

Medido antes: **106 blocos de texto na primeira dobra, 85 deles (80%) entre
10,5 e 12,5px**, 45 em etiqueta mono caixa alta, e o maior tipo da tela com
28px. A landing usa **razão 3:1** entre etiqueta (10,24px) e leitura (24–31px).
A gramática era a mesma; o que faltava era o salto.

| | Regra que passou a valer |
|---|---|
| Construção | **Chapa de duas camadas** (anel de 1,5px + `::before` com gradiente) na placa do turno, no trilho e no item — a construção do `.instr` da landing. `border` + `clip-path` está proibido desde 27/08 e o item era a última peça fora da regra |
| Ângulo do gradiente | **176° em chapa larga, 168° em chapa alta.** O comprimento da linha é `\|L·sen α\| + \|A·cos α\|`: 168° numa placa de 1000×86 vira gradiente horizontal e acende a primeira das três células |
| Trilho | Uma chapa dividida por **corte gravado** (`--rasgo` + `--luz`), não quatro cards. Card com fundo `--surface` sobre `--mar-900` é meio degrau — lê como retângulo pálido, não como peça |
| Selo de iniciais | Mesma construção do `.conta` da barra (os dois são o mesmo objeto) e tipo **mono**: inicial é código |
| Estado no trilho | Vai no **anel**, não no preenchimento — verde sobre verde deu 3,20:1 (Regra do Amarelo Cego valendo para o verde) |
| Rampa do item | 16 / 13 / 12,5 / 10,5. O título é a segunda voz e saía a 2px do corpo |
| Placar | Leitura em **2,5rem** contra frase de 13px (3,1:1). No celular para em 1,75rem |
| Barra | Segue o `.instr-cab`: identificação em `--muted` pequena, **relógio em 1,05rem mono 700 branco** |
| Régua | `font-stretch:82%` no mono + coluna 92→100px. O número vazava 23px da caixa desde sempre |

⚠️ **O eixo variável do Martian Mono (75–112,5%) existe e esta folha nunca o
tinha usado.** É a saída para leitura que não cabe na coluna sem pagar com
altura — e mono condensado é a própria linguagem de mostrador.

⚠️ **Refinar revela o próximo.** O item da fila só ficou visivelmente sem
acabamento *depois* que a placa e o trilho ganharam anel. Ao mexer numa peça
deste sistema, olhe as vizinhas na mesma rodada.

## O mapa vira protagonista (28/08) — decisão de produto, não de CSS

O `operador.css` avisava desde 27/08 que "se aparecer a necessidade de uma
segunda seção, ela é sinal de que o escopo do perfil mudou — e essa é conversa
de produto". Foi exatamente o que aconteceu: o Pedro pediu protagonismo para o
mapa, com duas saídas na mesa — tela própria em tela cheia (como o admin) ou
protagonismo aqui.

**Escolhida: aqui, com a tela cheia como MODO DA PEÇA.** As razões, em ordem:

1. **A ordem da pergunta estava errada**, e é um argumento melhor que "está
   pequeno": no diálogo, o mapa abria *depois* da escolha do chamado, um por
   vez. A decisão geográfica é da fila inteira.
2. **Tela própria separaria as duas perguntas que se fazem juntas** — o que
   estoura (tempo) e quem vai (geografia). Num turno, despacha-se olhando o
   relógio; um mapa em tela cheia como página esconde a fila que queima.
3. **Duplicaria a tela "Mapa de Condomínios" do admin**, que já existe com KPIs
   e tela cheia.
4. Quebraria a decisão fundadora ("a tela é UMA, sem navegação").

**Estado do dado, levantado em produção nesta sessão** (importa para calibrar
expectativa, não para adiar): 86 de 86 condomínios com coordenada; `chamados`
**vazia**; `tecnico_localizacoes` com **3 linhas no total**, a última de 17/08,
dos mesmos 3 técnicos (de 9) que têm login. O Pedro confirmou que é estágio —
o produto ainda não está em uso — e que o mapa será uma das partes mais
importantes quando estiver. **Ou seja: o mapa foi desenhado contra a prévia,
que é o cenário "em uso".**

| | Regra que passou a valer |
|---|---|
| Trilho | 300 → **400px**. Abaixo disso o mapa é miniatura e não responde "quem pode ir" |
| Rolagem | Rola o `.trilho-listas`, **nunca** o `.trilho` — senão o mapa sai da tela ao rolar a equipe |
| Nó do mapa | **Persistente, fora do ciclo de render.** O render só o *move* para o `#slotMapa`. Dentro do HTML do render ele morreria a cada 30s |
| Pino de chamado | Etiqueta = prioridade (cores do `.selo`), preenchimento = grau do relógio (o da régua). Nada novo; é o par da fila virado posição |
| Halo | Só no estourado, e **não pisca**. Alarme animado no turno inteiro vira ruído |
| Clique no pino | Abre o **mesmo** diálogo de despacho. O mapa é outra porta, não um destino |
| Tela cheia | `body.com-mapa-fs` sobe o contexto de empilhamento — `z-index` na peça não basta dentro do `#tela` |
| Enquadramento | Uma vez na carga; **de novo** a cada troca de tamanho. Gatilho do sistema ≠ gatilho do operador |
| Abaixo de 1080 | O mapa é faixa de largura cheia acima das listas, nunca uma célula ao lado delas |

## A regra da moldura (28/08, correção do mesmo dia)

O Pedro olhou a tela depois dos passes do dia: *"ficou bagunçado"*. Erro de
**dosagem, não de direção** — a construção do `.instr` (anel de 1,5px +
gradiente) foi aplicada em placa, trilho, item e mapa, e a primeira dobra
ficou com **nove peças com anel**. Na landing essa construção veste UM
instrumento cercado de campo aberto.

> **Moldura marca o que é único; o que se repete é superfície.**

- **Peça única** (placa do turno, mapa): anel + gradiente.
- **O que se repete** (item da fila, listas do trilho): cor chapada.
- ⚠️ O item **mantém a chapa de duas camadas** sem o gradiente: ela é o que
  impede o fio de sair recortado nos chanfros, não é enfeite.
- ⚠️ O que resolveu a parede de cartõezinhos **não era o anel**, era agrupar
  as linhas numa peça só com corte gravado. O agrupamento fica; a moldura sai.

**A Regra do Selo vale para o botão também** (`DESIGN.md`): *preenchido quando
pede ação, de fio em repouso*. Com quatro "Despachar" em campo cheio, o amarelo
virava uma coluna vertical e parava de apontar. Hoje só estourado e apertado
preenchem; o resto fica com anel e texto amarelos sobre miolo marinho — mesma
posição, mesmo texto, mesmo tamanho.

**Estado vazio é estado, não ausência de peça:** o vazio do trilho ocupa a
mesma caixa da lista cheia, e a placa do dia calmo fecha no conteúdo
(`data-so="1"`) em vez de esticar três colunas para uma leitura só.

⚠️ **A lição de método:** aplicar a peça mais expressiva do sistema em tudo é
o mesmo erro que não aplicá-la em lugar nenhum. Ao trazer uma construção da
landing para cá, pergunte quantas vezes ela vai aparecer na tela.

## A barra (28/08) — 60px era uma comparação errada

| | barra | celular | logo |
|---|---|---|---|
| landing · painel do cliente | 74 | 64 | 40 (32) |
| admin | 60 | — | **nenhum** (marca na sidebar) |
| **operador** | **68** | **60** | **36 (30)** |

⚠️ **A topbar do admin tem 60px porque carrega SÓ CONTROLES.** Esta tela não
tem sidebar e a barra dela leva a marca também — copiar o número era copiar a
medida sem o conteúdo. 68 preserva a densidade da fila sem fingir que faz o
mesmo trabalho. Razão logo/barra = **0,53**, a das irmãs (era 0,50).

⚠️ **A máscara da engrenagem é em `px` e nunca acompanha sozinha.** Conta:
`y desejado + |top| da peça`. Em 28/08 a faixa cresceu duas vezes (placar 67
→ 89, barra 60 → 68) e a máscara continuou nos valores do dia anterior,
apagando a engrenagem no meio do vão. Não quebra nada — por isso passa.

## O público (28/08) — a tela mudou de calibragem

O Pedro: *"essa tela vai ser usada por pessoas que não têm tanta familiaridade
com tecnologia e computador"*. Isso **reabre** a decisão de origem: a folha
herdou o registro de operação do admin (corpo 13px, densidade de tabela de 40
linhas), que é calibrado para quem usa o sistema o dia inteiro e conhece cada
abreviação. Não é este público.

| | Antes | Depois |
|---|---|---|
| Texto < 12px | 64% (76 de 118) | **10%** |
| Corpo | 13px | **15px** |
| Etiqueta mono | 10,5px | **12px** |
| Botões < 44px | 11 de 11 | **0** |
| Blocos em CAIXA ALTA | 39 | 21 |

⚠️ **NÃO devolva a escala do admin "para alinhar com as irmãs".** A
diferença agora é deliberada e tem dono: densidade caiu de ≈3 para ≈2 itens
na primeira tela, e o Pedro escolheu isso — rolar é mais fácil que espremer os
olhos. O `PRODUCT.md` já dizia, para público envelhecido, que corpo generoso e
alvo grande "não são refinamento, são requisito".

**Caixa alta só em etiqueta de uma ou duas palavras.** Frase em CAIXA ALTA é o
texto mais lento de ler que existe — saiu da régua, do estado do técnico, do
"Prédio sem telemetria instalada", da origem e do cabeçalho da fila.

**Vocabulário:** [`../../docs/vocabulario.md`](../../docs/vocabulario.md) é a
fonte, e vale para o sistema inteiro. Aqui: sigla de software saiu (TTFR, TTR),
`SLA` virou "prazo", "estourado" virou "atrasado", e P1–P4 ganharam a palavra
ao lado. ⚠️ Sigla do ramo (O.S., P1) **fica** — decisão do Pedro, a equipe
fala assim.

⚠️ **Antes de trocar um rótulo, confira o que o dado significa.** Propus
`EM ATENDIMENTO → "Técnico a caminho"` e estava errado: `em_atendimento` é
status do chamado, e o item já distingue "atribuído/a caminho/no local" à
parte. Texto mais claro que diz coisa errada é pior que sigla.

## Simplificar ≠ aumentar (28/08) — e o que ficou pela metade

⚠️ **A lição mais cara do dia, e é minha.** O Pedro disse que a tela seria
usada por gente mais velha, com pouca familiaridade com computador, e pediu
para simplificar. Respondi com **escala** (corpo 15px, alvos 44px, caixa alta
fora). Ele: *"não mudou praticamente nada"*. Certíssimo — o item continuava com
quinze informações e dois botões, só que maiores. **Aumentar não é
simplificar.** Quando o pedido é de simplicidade, a pergunta é *o que sai da
tela*, não *quanto cresce*.

**O que já entrou (o item da fila):**

| | Antes | Agora |
|---|---|---|
| Colunas do item | 3 (régua · corpo · ações) | **2** |
| Botões por item | 2 iguais | **1 botão + 1 link** |
| Peças na face | 15 | **10** |

- Prioridade **desceu para a régua** — ela e o relógio respondem à mesma
  pergunta e estavam em pontas opostas.
- O **título abre o item** (era a terceira coisa da linha).
- A **coluna de ações saiu**: a ação fecha o item. O botão continua no mesmo x.
- **"Ver detalhes" é link, não botão.** Nada foi removido — mudou o peso.
- Saíram da face (e seguem na ficha): **status, origem e bairro**.

**O que FALTA nesta direção — o passe está pela metade:**

1. **O trilho não foi simplificado.** Cada técnico ainda mostra avatar +
   nome + estado + "no mapa" — quatro coisas para responder *quem pode ir*.
   Candidato a corte: o avatar de iniciais e a nota de GPS.
2. **O placar (3 números) duplica a fila** e, no dia calmo, repete a mesma
   frase do estado vazio em dois tamanhos. Decidir se some ou vira uma linha.
3. **A ficha e o diálogo de despacho não passaram** pelo mesmo corte — ainda
   são densos, e a ficha é onde foi parar tudo que saiu do item.
4. **A seção "Já tem técnico"** ficou com o layout antigo de ações; conferir.
5. Medir de novo as faixas (o item mudou de grid) e revisar o celular.

## O que NÃO fazer aqui

- **Não impor rampa de tipo em tokens só nesta folha.** `cliente.css` tem 37
  tamanhos distintos e nenhum token de tipo; uma rampa só aqui faria desta a
  superfície fora do padrão. As advertências de `font-size` do detector são
  conhecidas e valem para as cinco folhas.
- **Não trocar os tiles pelo proxy `/tiles`** do backend: ele existe e é dark
  de verdade, mas deu rate-limit no IP da Railway — está registrado no
  `admin.js`.
- **Não gerar frase de explicação** no item ("Aberto às 05h48 e nenhum técnico
  atribuído…", como no comp). É copy nova, e a decisão de escrever copy é do
  Pedro.
- **Não ressuscitar o cilindro do admin** nem a "parede de instrumentos" da v1.
