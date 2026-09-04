---
version: 1
slug: "public-operador-html"
primary_target: "public/operador.html"
related_targets: ["public/operador.css","public/operador.js","public/operador-orcamentos.html","public/operador-orcamentos.js","public/operador-preventivas.html","public/operador-preventivas.js"]
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
| Pulse | **Só o pino de técnico** (01/09), com a pele do `.tec-pin` do admin. A linha acima continua valendo para prédio e chamado: é a única peça que se move, e a tela precisa que ela seja achada, não vigiada |
| Pino de técnico | Violeta **sempre** — a matiz é a identidade (a do admin) e não muda com o estado. O `data-liv` entra na luminosidade: livre = violeta claro + tinta marinho · ocupado = violeta fundo + branca · sem sinal = cinza parado. Menor que o pino de chamado: pele veio do admin, hierarquia não |
| ⚠️ Cor de estado é dos PRÉDIOS | O técnico livre chegou a sair verde (01/09) e ΔE contra o prédio "em ordem" era **7,8**, metade do piso 15 — e no par pior possível, porque os dois são o estado NORMAL de cada peça. Estado de técnico se faz dentro da matiz dele, nunca com verde/âmbar/vermelho |
| Clique no pino | Abre o **mesmo** diálogo de despacho. O mapa é outra porta, não um destino |
| Chamado novo | O mapa voa até ele e abre um balão (01/09). Gatilho é o `_novos` que já destacava o item na fila. Passa por cima do `_operadorMexeu` — é a única coisa que passa —, interrompe uma vez e nunca mais, e foca só no mais urgente quando entram vários |
| Balão | `L.popup` solto, **nunca** `bindPopup`: o `bindPopup` registra clique próprio e brigaria com o `dlgDespacho` do pino. Vestido como o `.pin-rot`, com o `.selo` da fila |
| Tela cheia | `body.com-mapa-fs` sobe o contexto de empilhamento — `z-index` na peça não basta dentro do `#tela` |
| Enquadramento | Automático **até o operador mexer** (01/09, era "uma vez na carga" — a tela fica aberta o turno inteiro, e a vista acabava decidida pelo estado das 8h); **de novo** a cada troca de tamanho. Gatilho do sistema ≠ gatilho do operador |
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

**O que já entrou (o trilho, 31/08):** quatro peças por linha → **duas**
(nome · estado). Saiu o selo de iniciais e saiu o "no mapa", que se repetia
logo abaixo do mapa que já mostra o pino; restou só a exceção "· sem posição",
em `--muted` (5,7:1). O anel verde saiu com o selo, então a disponibilidade
mora num lugar só — a tinta do estado. `.tec` deixou de ser flex de três
colunas e virou bloco. "Despachados hoje" perdeu o ícone de rota repetido.

**O que FALTA nesta direção — o passe está pela metade:**

1. ~~O trilho.~~ ✅ feito em 31/08, ver acima.
2. ~~O placar (3 números).~~ ✅ **feito em 31/08 — ele saiu da tela.** Dois
   dos três números eram repetição literal dos cabeçalhos de seção 40px
   abaixo; "fora do prazo", o único que não era, desceu para esses cabeçalhos
   (`.cab-fora`, em `--risco`, 6,3:1) e ficou mais preciso ali — cada seção
   conta os seus, em vez de um total único. No dia calmo a frase do estado
   vazio deixou de aparecer duas vezes. ⚠️ A **engrenagem de fundo mudou de casa e hoje
   ABRAÇA O MAPA** (pedido do Pedro). Três arranjos no mesmo dia: faixa
   horizontal no topo (morreu com o placar), margem direita da janela (só
   acima de 1800px) e, enfim, o atual — os dois primeiros ancoravam a peça na
   **janela**. Hoje `.eng` é o RECORTE (a coluna do trilho, `overflow:hidden`)
   e `.eng-roda` é a peça, centrada no mapa: ela não encosta na fila em
   largura nenhuma, **sem máscara em px**, e quem a corta por dentro é o mapa
   opaco. Pré-requisito: `.trilho` perdeu o `background` (era a cor do
   `body`). **Some abaixo de 1180**, a quebra em que o trilho vira faixa.
3. ~~A evidência do item.~~ ✅ feito em 31/08, ver a seção logo abaixo.
4. **A ficha e o diálogo de despacho não passaram** pelo mesmo corte — ainda
   são densos, e a ficha é onde foi parar tudo que saiu do item.
5. **A seção "Já tem técnico"** ficou com o layout antigo de ações; conferir.
6. Medir de novo as faixas (o item mudou de grid) e revisar o celular.

## A evidência para de desenhar ausência (31/08) — e a segunda tela ganha ação

O Pedro mandou o recorte do item do chamado #9 da produção: **quatro caixas
d'água sem sensor vivo, quatro barras hachuradas idênticas** dizendo "—". Item
de **222px com a trilha de tanques 100% vazia**, 76px de hachura.

> **Desenho de ausência não pode ocupar o tamanho do instrumento.**

É "simplificar ≠ aumentar" virado do avesso: o placeholder não era grande
demais por descuido de escala — ele não devia existir naquele tamanho.

| | Regra que passou a valer |
|---|---|
| Reservatório mudo | **Sem tubo.** Todos os mudos do item numa linha, nomes preservados — a frase do painel do cliente ("Sem leitura de X e Y") |
| Trilha da prova | `320px` → `minmax(320px,1fr)`. O motivo do fixo (mesmo x em toda a fila) sobrevive: itens de largura igual resolvem a fração igual. O que o fixo não preservava era o tubo — 156px num item de 1000, com **~490px de campo morto** à direita da prova |
| Largura do item | Vira **estrutura**: `.num` e "Ver detalhes" encostam na borda direita. As duas linhas emolduram a evidência, em vez de o item viver no terço esquerdo da placa |
| Cabeçalho de seção | 12 → **15px em `--text`**. Saía **menor que a própria legenda** e 6px abaixo do título do item |

Item com 4 mudos: **222 → 189px**; a região da evidência, de **82 para 49**.
Hoje quem manda na altura é a linha de ações (52px), não a pilha do tanque.
Nada saiu da tela.

### A tela de Aprovados ganhou a ação (`operador-orcamentos.*`)

A linha do orçamento virou um `<button>` que abre o chamado que o executa
(migration 079, `chamados.orcamento_id`). O que isso fixou como regra aqui:

| | Regra |
|---|---|
| Alvo | A **linha inteira**, `<button>` nativo — alvo grande, foco de teclado e cursor sem uma linha de JS. É a calibragem de público de 28/08 |
| Affordance | O chip é **sempre visível**, nunca só no hover: quem não sabe que devia passar o mouse não descobre um alvo que só aparece quando ele chega |
| Peso do chip | **De fio em repouso, preenchido no hover/foco** (Regra do Selo). Quinze linhas com quinze chips âmbar viram uma coluna de âmbar que não aponta |
| Estado | Com chamado aberto a linha **deixa de ser botão**. Botão que não faz nada é pior que nenhum botão |
| Aninhamento | **Nada de interativo dentro dela** — `<button>` dentro de `<button>` é HTML inválido e o navegador desmonta a árvore. Por isso o chamado existente é TEXTO, não link |
| Opacidade | **Não** se apaga a linha já atendida com `opacity`. Opacidade sobre texto é queda de contraste disfarçada de hierarquia — `--muted` cairia abaixo do piso justo na linha que se lê para conferir |
| Celular | O chip ocupa a linha e vai a 44px. Solto no fim do pé deitado, ele virava o quarto item de uma linha de metadado |

⚠️ **A prévia continua sendo o caminho** (`/dev/_operador-preview.html`), e a
tela de Aprovados foi vista com **sessão real** contra o banco de teste (JWT
assinado à mão). A janela do Chrome aqui **não obedece `resize`**: 430 e 1090
se medem pondo a própria página num `<iframe>` daquela largura, que responde às
mesmas media queries.

## Aprovados vai para o registro de LEITURA (31/08, 2ª rodada)

O Pedro perguntou se as telas estavam no nível dos prints que ele tinha
mandado. Não estavam, e a resposta honesta separava três casos: **o diálogo já
estava lá** (é literalmente aquele registro), **a fila chegou perto** (é densa
por decisão registrada), e **Aprovados não estava nem perto — e era a que menos
motivo tinha**.

Medido: a tela vivia numa faixa de **12 a 17px**, o maior tipo dela era o nome
do prédio, e não havia **uma** superfície clara. 7 itens que se leem, no
registro calibrado para tabela de 40 linhas.

Ele nomeou o que faltava melhor do que eu: *"nas telas que falei pra você usar
de exemplo existem palavras em amarelo, campos totalmente em branco, coisas que
quebram esse negócio monocromático"*. O print decisivo foi a **lista de
orçamentos do painel do cliente** — a mesma tarefa, e a diferença de acabamento
era gritante.

### A gramática, tirada do print elemento por elemento

| No print | Em Aprovados |
|---|---|
| manchete branca com "aguardam" em âmbar | `N orçamentos **aprovados** em M prédios` |
| lede em `--sobre-2`, duas linhas curtas | idem |
| cartão claro por orçamento | placa `--chapa` por orçamento |
| `R$ 2.332,00` como leitura grande | **o serviço aprovado**, Archivo 800 (aqui não há dinheiro) |
| selo âmbar "AGUARDANDO VOCÊ" | selo âmbar **"PODE EXECUTAR"** |
| botão âmbar "Aprovar orçamento" | botão âmbar **"Abrir chamado"** |
| `1 item · enviado em 26/08/2026` | a mesma frase, com quem aprovou |

⚠️ **A palavra âmbar só existe no campo marinho** (Regra do Amarelo Cego, ~2:1
sobre claro). Sobre a placa o âmbar é preenchimento com tinta marinho por
cima — selo e botão. É o que o print faz, e foi lendo o print que ficou óbvio.

⚠️ **O que eu tinha errado, e é a lição desta rodada.** Eu disse ao Pedro que
a tela não podia ir para o claro por causa d'A Regra da Superfície. Estava
lendo a regra **pela letra** ("placa clara é o que abre por cima") em vez de
pelo motivo — que é não deixar placa clara **disputando a tela** com conteúdo
marinho ao lado. Aqui não há nada ao lado. `DESIGN.md` ganhou a fronteira
escrita, com os quatro arranjos e o que decide cada um.

### As regras que passaram a valer

| | Regra |
|---|---|
| Placa | Não é `<button>`. A ação é o botão âmbar dentro dela — `<button>` dentro de `<button>` é HTML inválido, e um botão escrito é mais claro que uma área grande que reage sem dizer onde começa |
| Rodapé | Uma FRASE, nunca pilha de metadados. A coluna de quatro linhas em mono mandava na altura de toda linha |
| Estado "feito" | Recua por **material** (`--chapa-es`), nunca por `opacity` — opacidade sobre texto é queda de contraste disfarçada de hierarquia |
| Resposta ao clique | A placa vira **na hora**, com o id que o endpoint devolve. Medido: **>2,5s** até a lista voltar, com o diálogo já fechado e a placa dizendo "Abrir chamado" |
| Erro pós-fechamento | `fechar()` antes de `await` engole a falha — `#cmMsg` já não existe. Toda continuação depois do fechar precisa de `.catch` que caia na faixa |
| Campo cheio | O botão só ocupa a linha **abaixo de 560px**. A 760 um botão âmbar de 690px vira o segundo campo cheio da tela (Regra do Campo Único) |
| `flex-basis` | **Muda de eixo com `flex-direction`.** `flex:1 1 260px` numa coluna são 260px de ALTURA — placa de 480px para três linhas, medido a 390px |

### A régua do item: "pintado de vermelho só até a metade"

Pergunta do Pedro, e ele estava certo. **A decisão continua certa** — o campo
cheio não pode esticar com o item, senão o prédio de 4 caixas d'água ganha 43%
mais alarme que o de 1 com o mesmo atraso. O errado era a **forma**: encostada
nas três arestas da coluna e terminando num corte reto no meio, a faixa lia
como pintura que acabou a tinta. Recuada dos quatro lados e com o chanfro da
casa, a **mesma área** lê como objeto.

> Quando o campo cheio não pode esticar, ele vira **placa**, não meio
> preenchimento. Borda solta no meio de uma coluna lê como defeito.

## A terceira tela: Preventivas (03/09/2026) — e o passe que a nivelou

Pedido do Pedro: as preventivas do mês em Operador, separadas entre feitas e a
fazer, com despacho **por região** ou **prédio a prédio**. Construída, e então:
*"tenho minhas dúvidas se essa tela está com o nível das outras"*.

**Ele estava certo, e a medição nomeou o quê.** As duas telas lado a lado,
antes do passe:

| | Aprovados | Preventivas | |
|---|---|---|---|
| manchete | 51,2px | **40px** | duas gerações do produto |
| maior tipo da placa | 21,6px / 800 | **16,3px / 700** | a placa lia plana |
| padding | 28/30 | **14/20** | metade do respiro |
| medida do texto | 88ch | **136ch** | atravessava a tela |
| âmbar | selo + botão + manchete | **só a manchete** | monocromático |

⚠️ **É O MESMO DIAGNÓSTICO QUE APROVADOS RECEBEU EM 31/08**, e eu repeti o
defeito de que aquela rodada tratou: *"a tela vivia numa faixa de 12 a 17px, o
maior tipo dela era o nome do prédio"*. As palavras do Pedro na época — *"coisas
que quebram esse negócio monocromático"* — descreviam esta tela também.

### O que mudou

- **O prédio virou a leitura grande** (21,1px/800). É o lugar que em Aprovados é
  do serviço aprovado e no print do painel do cliente era do `R$ 2.332,00`. É
  por este nome que se acha o item quando o técnico liga.
- **O rodapé virou UMA FRASE** — a regra que Aprovados já tinha. Serviço,
  bairro e responsável numa linha de 85ch, com a origem (`escalado` / `pela
  zona`) como etiqueta dentro dela.
- **A manchete recebeu os tokens da irmã**, `font-stretch:112%` inclusive.
- **A placa foi para 17/24.** Não os 28/30 de Aprovados: são até **72 prédios**
  num mês contra 7 orçamentos. Este é o registro de leitura na densidade que a
  varredura de um mês inteiro admite.

### ⚠️ Onde o âmbar entra numa lista longa

Selo âmbar por item **viraria textura**: no dia 1 do mês todas as preventivas
estão a fazer, e 72 selos acesos não sinalizam nada. Ele foi para o **contador
da zona** — acende uma vez por região, que é onde a decisão de despacho se toma,
e **apaga conforme o mês é resolvido**. O operador vê o número descer.

### Defeitos que o passe encontrou, e que nenhum detector pegaria

- **`opacity:.86` na lista de feitas** — violação direta da regra registrada em
  31/08: *"recua por material, nunca por opacity — opacidade sobre texto é queda
  de contraste disfarçada de hierarquia"*. Trocado por `--chapa-es`.
- **A régua vermelha de 3px saiu.** O selo já dizia ATRASADA em campo cheio, e a
  régua repetia o mesmo aviso no mesmo item. Dois canais para um estado não
  avisam mais alto; só sujam. (A régua da FILA continua: lá ela **mede** o SLA e
  não repete selo nenhum.)
- **O checkbox era nativo.** `accent-color` deixa o quadradinho arredondado do
  sistema operacional — a única peça da tela que não era da casa, numa folha que
  corta tudo com chanfro. O `input` continua (teclado, leitor de tela,
  `:checked`); quem desenha é um `.pv-caixa` com o corte da casa.
- **A caixa desalinhava 10px** do centro do nome. A conta: alvo de 44px centra o
  glifo em 22; nome de 21,1px com `line-height:1.2` centra em 12,5. −9,5 → −10.
- **"tudo despachado · 2 atrasadas" se contradizia.** Virou "tudo com dono".
- **Alvos de 40 e 36px no celular**, abaixo do piso de 44 desta folha.

### ⚠️ O terceiro link reabriu a barra do celular

Com Preventivas a nav ficou com três itens e o wordmark voltou a pintar **84px**
por cima deles a 390px — o defeito que a gaveta de conta tinha fechado em 02/09.
Medido: nav 168 + nome 43 + Sair 44 = 280px de ações contra 124 de wordmark.

Duas trocas: **"A fila do turno" → "Turno"** no celular (dois `<span>` do mesmo
rótulo, não dois links) e **o nome de quem está logado sai da barra** abaixo de
760px — a mesma troca que o painel do turno já tinha feito. Zero sobreposição de
360px para cima nas **três** telas. 320px segue fora, limite conhecido.

> ⏳ O item registrado abaixo — *"a tela de Aprovados ficou com a barra antiga"*
> — continua aberto: ela ganhou o rótulo curto e perdeu o nome no celular, mas
> segue com "nome + Sair" em vez da gaveta, porque não tem `dlgSenha`.

### Prévia: `/dev/_preventivas-preview.html`

Fixture com os quatro estados, as duas origens de responsável, um prédio **sem
zona** e dois **sem técnico nenhum** — o caso real em produção (11 técnicos
ativos, **uma** zona com responsável). O despacho mexe na fixture, então o ciclo
inteiro se testa ali.

⚠️ **A extensão do Chrome não conecta nesta máquina.** O passe foi feito com o
**puppeteer que o projeto já usa para o PDF da O.S.** — screenshot mais
`page.evaluate` medindo tipo, contraste composto, alvos e sobreposição. Foi a
medição, não o olho, que pegou o 16,3px/700 e o `opacity:.86`.

## O passe de refino de Preventivas (04/09/2026) — a barra de despacho tinha o endereço errado

Pedido do Pedro, em duas partes: *"um refino a essa tela toda, levando as outras
como padrão"* e *"melhore o posicionamento [d]a aba q abre para selecionar o
tecnico"*. Medido com a extensão do Chrome contra a **produção com sessão real**
(ver a nota sobre a extensão logo abaixo).

### O defeito que motivou o pedido, em um número

A barra de despacho é `position:fixed` de borda a borda **com o conteúdo dentro
dela**, enquanto todo o resto da tela centra em `--area-max` + `--gut`. Medido a
1920px:

| | x inicial | x final |
|---|---|---|
| placa do prédio | 455 | 1455 |
| "N escolhidas" da barra | **32** | — |
| "Enviar" | — | **563** |

**423px de degrau** entre o cabeçalho da coluna e o pé dela, e a ação primária
terminando 892px antes da placa que ela despacha. É o mesmo defeito que fez a
barra do TOPO desta folha ser reescrita ("a marca começava em x=255 e a lista em
x=455"), e a correção é o mesmo mecanismo, com os mesmos tokens.

> **A barra fixa sangra; o conteúdo dela mora na coluna.** `left/right:0` na
> peça, `max-width:var(--area-max)` no filho — nunca na própria barra, senão o
> fundo e o fio param de ir de ponta a ponta.

Depois: degrau **zero** nas duas pontas, medido a 1920 / 1340 / 1090 / 900.

### O resto do que o passe achou

| | Regra que passou a valer |
|---|---|
| `.sr-only` | **Não existia nesta folha** (`cliente.css` e `admin.css` a têm). O rótulo "Técnico" do select aparecia CRU a 15px em produção. Classe que não existe renderiza sem estilo nenhum — a mesma armadilha do `.dlg` inventado, agora do outro lado |
| O `<select>` | Era o último controle NATIVO do sistema operacional na tela — exatamente o que o checkbox era antes de 03/09. `appearance:none` + seta desenhada do sistema de ícones (traço esquadrado) |
| Fio do select | **Chapa de duas camadas com o RÓTULO como anel.** `<select>` é elemento substituído e não tem `::before`; `border` e `box-shadow:inset` os dois são recortados pelo `clip-path` nos chanfros |
| Par de ações | "Limpar" **antes** de "Enviar" no DOM e o par encostado na direita — o pé da placa de Aprovados ("Já foi feito" · "Abrir chamado"). Antes "Limpar" era vizinho de 76px do botão que ele desfaz |
| A faixa de erro | Caía **DENTRO** da barra: `.aviso` em `bottom:22px` ocupa y 833-875 numa janela de 889, a barra ocupa 797-889, e o `z-index:110` a desenhava por cima do select. O aviso escondia a saída que ele indica |
| Material da barra | `--bg` (marinho 900), não `--mar-800`: as duas barras fixas da mesma tela são a mesma chapa, e em 800 esta ficava um degrau mais clara que o campo |
| `env()` | `safe-area-inset-bottom` **sem o fallback `, 0px`** — a regra já registrada para `.barra` nunca tinha sido aplicada aqui |
| Altura da barra | Um token só (`--pv-pe`), porque três coisas dependem dela: o respiro da lista, o `bottom` do aviso e a altura no celular. Medido: 71px na mesa, 125px a 390 |
| Entrada | `animation:sobe .22s` — a barra aparecia sem transição nenhuma, do nada, no pé |

### O nivelamento com as irmãs

O passe de 03/09 tinha nivelado a **manchete** e a **placa**; ficaram de fora o
cabeçalho de grupo e as etiquetas. Medido lado a lado com Aprovados:

| | Aprovados | Preventivas (antes) | Agora |
|---|---|---|---|
| título do grupo | 20px / 800 / branco / stretch 106% | 17px / 700 / `--text` | os tokens da irmã |
| legenda do grupo | — | 13,8px | 15,2px (o corpo da tela) |
| etiqueta mono (selo) | 10,5px | **10px** | **12px**, o `.selo` da FILA |
| etiqueta menor | 11px (`.orc-onde`) | **9,5px** | 11px |
| alvos < 44px | **0** | 2 (setas de mês 40, botão da zona 36) | **0** |

⚠️ **12px no selo é a calibragem de 28/08 sendo aplicada, não gosto.** Aquela
rodada levou a etiqueta mono desta folha de 10,5 para 12px porque *"quem opera
aqui tem pouca familiaridade com computador"* — e esta tela nasceu **depois**
dela, abaixo dela. Medido antes do passe: 86 blocos de texto sob 12px, 69 deles
no mesmo selo repetido.

⚠️ **O fio embaixo do cabeçalho de zona FICA**, e é divergência deliberada da
irmã: em Aprovados um grupo tem 1 orçamento e o vão já separa; aqui uma zona tem
24 prédios, e sem o fio o cabeçalho seguinte chega sem aviso depois de dois
palmos de rolagem.

### ⚠️ A extensão do Chrome CONECTA nesta máquina (correção de 04/09)

A nota de 03/09 ("a extensão do Chrome não conecta nesta máquina", passe feito
com puppeteer) **está vencida**. Ela conecta, e este passe inteiro foi medido com
ela contra a produção logada: `getBoundingClientRect` e `getComputedStyle` na
tela real, com os 69 planos de setembro dentro.

⚠️ **O que a extensão NÃO faz é obedecer `resize`** — a janela ignora o
`resize_window`, exatamente como a nota de 31/08 já dizia. As larguras se medem
pondo a própria página num `<iframe>` daquela largura, que responde às mesmas
media queries. Foi assim que saíram os números de 1920 / 1340 / 1090 / 900 / 390.

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

## A gaveta de conta (03/09/2026) — e a barra que não cabia

Pedido do Pedro, em duas etapas: primeiro "ícone em vez de 'Minha senha'",
depois *"penso se n seria melhor q o nome da pessoa fosse um botao, e por la
ela conseguisse sair e trocar a senha"*.

**O nome de quem está logado é o botão; senha e sair são as linhas da gaveta.**
`.eu` · `.conta.conta-eu` · `.eu-gaveta` · `.eu-item`.

| | Regra que passou a valer |
|---|---|
| O nome | É **alvo**, e isso revoga a regra herdada do `cliente.html` ("um alvo que não leva a lugar nenhum ensina a duvidar dos outros"). A regra era contra alvo **morto**. No painel do cliente ela segue valendo — as duas barras divergem de propósito |
| A peça | Gaveta ancorada, **nunca `<dialog>`**: modal para escolher entre dois itens interrompe um turno e prende o foco numa tela aberta o dia inteiro |
| Aninhamento | A gaveta é **irmã** do botão. `.conta` tem `clip-path`, e `clip-path` recorta a subárvore inteira |
| Empilhamento | `isolation:isolate` na gaveta, como em todo `.conta`: a placa vive num `::before` com `z-index:-1`, e sem contexto próprio esse `-1` escapa para trás do pai |
| Ordem no handler | A gaveta fecha **antes** de a ação rodar, e antes da linha do `#btnSair` — senão o `abrirFundo` guarda uma linha já `hidden` como foco de origem |
| Alvo | `.conta` subiu de 38 para **44px na mesa**, o piso que o `.btn` desta folha já aplicava |

**A conta de largura da barra, refeita (a folha manda refazer sempre que
`.barra-acoes` muda).** Sobreposição do wordmark sobre a borda das ações:

| largura | antes (em produção) | 2 chapas | gaveta |
|---|---|---|---|
| 320px | 128 | 107 | 39 |
| 360px | 113 | 67 | **0** |
| 390px | **83** | 37 | **0** |
| 412px | 61 | 15 | **0** |
| 480px+ | 15 | 0 | **0** |

⚠️ **A barra estava quebrada em todo celular ANTES desta rodada** — 83px de
logotipo por cima do primeiro alvo a 390px, em produção. O defeito sobreviveu
porque esta barra só se olha com sessão, e quase sempre na mesa. **Ao mexer em
`.barra-acoes`, meça em 320 / 360 / 390 / 412 / 430 antes de olhar componente.**

⚠️ **E meça, não deduza:** a aritmética a partir da largura das ações dava 28 e
24px de altura de marca; medido, sobrava 1px de sobreposição a 386 e 8,7px a
360. Os valores que ficaram (27 e 22) saíram da tela.

⏳ **A tela de Aprovados (`operador-orcamentos.html`) ficou com a barra
antiga** — carrega a mesma folha e ainda monta "nome (texto) + Sair". Nada
quebrado (`.barra-eu` foi preservada de propósito), mas as duas barras do
operador divergem.
