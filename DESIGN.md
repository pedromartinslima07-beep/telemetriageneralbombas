---
tags:
  - projeto
  - doc/design
aliases:
  - Design System
  - Chapa
  - Sistema visual da landing
  - DESIGN
name: General Telemetria — Landing Pública
description: Identidade industrial em chapa de aço cortada, para a página pública de captação (/).
colors:
  marinho-900: "#030a26"
  marinho-800: "#050f38"
  marinho-700: "#071b5c"
  marinho-600: "#0d2775"
  marinho-500: "#1a3a9e"
  amarelo: "#fbb329"
  amarelo-claro: "#ffcb60"
  amarelo-escuro: "#d99411"
  risco: "#ff5a4d"
  chapa: "#e8ebf2"
  chapa-clara: "#f5f7fb"
  chapa-escura: "#d5dae6"
  tinta: "#061033"
  tinta-2: "#414f74"
  sobre-2: "#a6b5dc"
  fio: "rgba(255, 255, 255, .17)"
  fio-forte: "rgba(255, 255, 255, .34)"
  fio-escuro: "rgba(6, 16, 51, .16)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 4.15vw, 3.7rem)"
    fontWeight: 900
    lineHeight: 1.04
    letterSpacing: "-.028em"
    fontVariation: "font-stretch: 116%"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.95rem, 3.9vw, 3.3rem)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-.028em"
    fontVariation: "font-stretch: 112%"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.9vw, 1.6rem)"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-.02em"
    fontVariation: "font-stretch: 112%"
  lede:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 1.45vw, 1.34rem)"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Martian Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: ".69rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: ".13em"
  reading:
    fontFamily: "Martian Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "clamp(1.5rem, 2.3vw, 1.95rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-.02em"
    fontFeature: "tabular-nums"
rounded:
  nenhum: "0"
  chanfro: "22px"
  chanfro-p: "10px"
spacing:
  campo: "clamp(20px, 5vw, 56px)"
  secao: "clamp(72px, 9vw, 132px)"
  coluna: "clamp(30px, 4vw, 62px)"
  placa: "clamp(26px, 3.4vw, 38px)"
  item: "16px"
  fio-item: "4px"
components:
  button-primary:
    backgroundColor: "{colors.amarelo}"
    textColor: "{colors.marinho-900}"
    rounded: "{rounded.chanfro-p}"
    padding: "13px 26px"
    height: "50px"
  button-primary-hover:
    backgroundColor: "{colors.amarelo-claro}"
    textColor: "{colors.marinho-900}"
  button-primary-grande:
    backgroundColor: "{colors.amarelo}"
    textColor: "{colors.marinho-900}"
    padding: "16px 32px"
    height: "60px"
  button-fio:
    backgroundColor: "{colors.marinho-900}"
    textColor: "#ffffff"
    rounded: "{rounded.chanfro-p}"
    padding: "13px 26px"
    height: "50px"
  button-fio-hover:
    backgroundColor: "{colors.amarelo}"
    textColor: "{colors.marinho-900}"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.tinta}"
    rounded: "9px"
    padding: "14px 16px"
    height: "54px"
  placa-clara:
    backgroundColor: "{colors.chapa}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.chanfro}"
    padding: "{spacing.placa}"
  placa-escura:
    backgroundColor: "{colors.marinho-700}"
    textColor: "#ffffff"
    rounded: "14px"
    padding: "22px 26px"
  instrumento:
    backgroundColor: "{colors.marinho-900}"
    textColor: "#ffffff"
    rounded: "20px"
    padding: "0"
---

# Design System: General Telemetria — Landing Pública

> **Fronteira do documento.** Este arquivo descreve **apenas a superfície
> pública** (`public/index.html`, `public/landing.css`, `public/landing.js`,
> rota `/`). O painel interno (`public/admin.css`, "Mission Control", âmbar
> `#f0b014`, escuro) é um sistema **separado e mais antigo**, e essa separação é
> uma decisão registrada — não uma pendência. Nada aqui deve ser aplicado ao
> admin, ao painel do cliente ou ao app mobile, e nenhum token do admin deve
> ser importado para cá. **Não unificar os dois sistemas.**
>
> Contexto de produto: [PRODUCT.md](PRODUCT.md) · Fluxo:
> [Landing pública](docs/modulos/landing-publica.md) · Índice:
> [Home](Home.md)

## Overview

**Creative North Star: "A Chapa Cortada"**

O ponto de partida não foi uma paleta: foi o próprio wordmark da General, que
já é chapa de aço cortada — cantos chanfrados a 45°, contraformas quadradas, a
lasca amarela dentro do G. A página inteira é construída com esse mesmo gesto
de corte. Placa, botão, foto, campo de formulário e etiqueta numerada perdem o
mesmo canto superior esquerdo e o mesmo canto inferior direito; fios de 1px
funcionam como usinagem, não como borda decorativa; e a engrenagem da marca
aparece em escala arquitetônica, marinho sobre marinho, girando devagar atrás
do texto.

O marinho `#071b5c` é tratado como **material**, não como fundo: a tela é o
campo, e as superfícies claras são **placas pousadas sobre ele** para os
trechos de leitura densa. O amarelo de segurança `#fbb329` não é sotaque
pontual — ele toma regiões inteiras (a faixa listrada do hero, o campo de
conversão inteiro no fecho). A densidade é alta, mas o corpo é grande de
propósito (19px): o leitor é um síndico, com frequência mais velho, lendo no
navegador.

Duas recusas confirmadas e vigentes: **nada de hero de SaaS de IoT** com
dashboard flutuando em perspectiva, sombras e gradiente roxo; e **nada da
papelada de condomínio** da primeira versão rejeitada (cartõezinhos brancos,
ícones genéricos, tom de circular de assembleia). O instrumento do hero não é
um mockup de dashboard: é uma placa de aparelho com uma coluna d'água viva.

**Key Characteristics:**

- Chanfro de 45° em dois cantos opostos como única forma — raio zero em tudo.
- Marinho como material corrido; placas claras pousadas para leitura densa.
- Amarelo de segurança em região inteira, nunca como texto sobre claro.
- Fios de 1px (usinagem) no lugar de sombras: profundidade é tonal.
- Mono gravado só em medição e etiqueta; Archivo variável faz display e corpo.
- Uma única inversão de campo na página inteira, no momento da conversão.

## Colors

Paleta de sinalização industrial: uma escada de marinho como material, um
amarelo de segurança institucional, uma família de placa clara e um vermelho
reservado a estado crítico.

### Primary

- **Amarelo de Segurança** (`--amarelo`): a cor institucional, tirada do
  wordmark. Preenche a ação primária, a faixa listrada na base do hero, o
  campo inteiro da seção de conversão, os pontos do diagrama do prédio, as
  linhas-guia das chamadas na foto, o sublinhado da navegação em hover, a
  crista da coluna d'água e o anel de foco de todo elemento focável. Sobre
  marinho é o sinal; sobre claro é o campo.
- **Amarelo Claro** (`--amarelo-claro`): só a crista da lâmina d'água e o
  varrimento de hover do botão amarelo. Nunca texto.
- **Amarelo Escuro** (`--amarelo-escuro`): a engrenagem dentro do campo
  amarelo, a listra do fecho, o sublinhado do link na ficha e o polegar da
  barra de rolagem em hover. É o amarelo quando ele precisa se apagar contra
  ele mesmo.

### Secondary

- **Marinho Institucional** (`--marinho-700`): o azul do favicon e da marca.
  Topo do gradiente do instrumento, tinta do indicador de acordeão sobre placa
  clara, contorno de campo em foco, corpo do prédio no diagrama.
- **Marinho Profundo** (`--marinho-800`): o campo padrão da página (`body`,
  hero, seções escuras).
- **Marinho Fundo** (`--marinho-900`): o degrau mais baixo — rodapé, fundo do
  tubo da coluna, placa interna do botão de fio, tinta sobre amarelo.
- **Marinho Água** (`--marinho-500` e `--marinho-600`): exclusivos da lâmina
  d'água, do corpo da bomba no diagrama e das engrenagens marinho-sobre-marinho.
  São cor de **substância**, não de superfície.

### Tertiary

- **Vermelho de Risco** (`--risco`): apenas estado crítico, e apenas sobre
  marinho — faixa crítica da coluna, anel do instrumento em crítico, bloco "sem
  monitoramento" da madrugada. Nunca é decoração e nunca aparece em repouso.

### Neutral

- **Chapa** (`--chapa`): a placa clara pousada sobre o marinho — seções claras
  e a ficha de contato.
- **Chapa Clara** (`--chapa-clara`): o painel de dúvidas sobre a seção clara,
  um degrau acima da placa.
- **Tinta** (`--tinta`): texto sobre superfície clara.
- **Tinta 2** (`--tinta-2`): secundário sobre claro, tingido de azul —
  legendas, lede clara, texto de resposta, placeholder.
- **Sobre 2** (`--sobre-2`): secundário sobre marinho, tingido de azul — lede
  escura, etiquetas mono, rótulos do diagrama, nota do instrumento.
- **Fio / Fio Forte / Fio Escuro** (`--fio`, `--fio-forte`, `--fio-escuro`):
  hairlines de 1px a 1,5px. São a usinagem do sistema: separam sem pesar e
  desenham a aresta de toda placa.

### Named Rules

**A Regra do Amarelo Cego.** O amarelo **nunca é texto nem ícone sobre
superfície clara** — reprova contraste mesmo como forma sólida (~2:1). Sobre
claro ele só existe como **preenchimento com tinta marinho por cima**. Quando
um indicador precisar existir numa placa clara, ele é marinho, e o amarelo
entra no realce do painel inteiro. Sobre marinho o amarelo é livre.

**A Regra do Campo Único.** A página inverte o campo **uma vez só**: a seção de
conversão vira amarela com tinta marinho (~9:1, o texto mais legível da
página). Se uma segunda região virar campo amarelo, o gesto do "aja aqui"
morre.

**A Regra do Crítico Silencioso.** `--risco` não aparece em repouso. Ele só é
ligado por estado (`data-estado="critico"`) ou para nomear a madrugada sem
monitoramento.

## Typography

**Display / Body Font:** Archivo variável (eixos de peso 400–900 e largura
62%–125%), com fallback `ui-sans-serif, system-ui, sans-serif`.
**Label / Mono Font:** Martian Mono variável (peso 400–700), com fallback
`ui-monospace, SFMono-Regular, monospace`.
Ambas self-hosted em `public/fonts/` (`archivo.woff2`, `martianmono.woff2` +
os cortes `-ext`), com `font-display: swap` e preload das faces latinas.

**Character:** Archivo é grotesca de sinalização industrial: aguenta ficar ao
lado do wordmark sem competir e, expandida e em peso 900, dá à manchete o peso
de letra estampada em chapa. Martian Mono é leitura de instrumento — entra
onde há medição ou rótulo de painel, e em lugar nenhum mais.

### Hierarchy

- **Display** (900, `clamp(2.2rem, 4.15vw, 3.7rem)`, altura 1.04,
  `font-stretch: 116%`, tracking −.028em): só o `h1` do hero. Expandida,
  `text-wrap: balance`.
- **Headline** (800, `clamp(1.95rem, 3.9vw, 3.3rem)`, altura 1.06,
  `font-stretch: 112%`): abertura de seção.
- **Title** (800, `clamp(1.25rem, 1.9vw, 1.6rem)`, altura 1.14): título da
  ficha; e, com escala própria, o `dt` de cada peça.
- **Lede** (400, `clamp(1.15rem, 1.45vw, 1.34rem)`, altura 1.55, máx. 56ch):
  o parágrafo de entrada, em `--sobre-2` no escuro e `--tinta-2` no claro.
- **Body** (400, 19px / 1.09rem no mobile, altura 1.65, máx. 68ch): corpo
  padrão. O tamanho é decisão de público, não sobra de escala.
- **Label** (mono 500, .69rem, tracking .13em, caixa alta): etiqueta gravada —
  identificação do instrumento, hora da madrugada, "onde fica" de cada peça,
  rótulo do rodapé, selo do hero, rótulo das chamadas na foto.
- **Reading** (mono 700, `clamp(1.5rem, 2.3vw, 1.95rem)`, `tabular-nums`,
  altura 1): os números do instrumento. A unidade ao lado sai a .72rem em
  `--sobre-2`.

### Named Rules

**A Regra do Mono de Instrumento.** Martian Mono só aparece em **medição** ou
em **etiqueta gravada em caixa alta**. Nunca em parágrafo, nunca em título,
nunca "para dar clima técnico". Todo número que muda usa `tabular-nums`.

**A Regra da Nota Honesta.** A linha que declara o instrumento como
demonstração simulada fica **fora** do grupo mono/caixa-alta, a .92rem em
prosa normal. Aviso de honestidade não pode ser o texto menos legível da
página — especialmente para um leitor mais velho.

**A Regra da Largura Variável.** O peso não é a única alavanca: títulos usam o
eixo de largura (106%–116%) para ficarem estampados. `font-synthesis-weight` é
desligado no `body` — nada de peso sintético.

## Layout

Coluna central de **1240px** (`--area-max`) com respiro lateral
`clamp(20px, 5vw, 56px)`; a variante estreita para leitura (dúvidas) fecha em
880px. Seções respiram `clamp(72px, 9vw, 132px)` no bloco. A barra fixa tem
74px (64px no mobile) e o `scroll-padding-top` acompanha, para que âncora
nenhuma caia debaixo dela.

As grades são sempre **assimétricas e nomeadas pelo conteúdo**, nunca um grid
de 12 colunas: hero 1.12fr / 0.88fr (mínimo de 310px para o instrumento);
foto anotada 0.82fr / 1.18fr; peças 0.92fr / 1.08fr; fecho 1fr / 340–480px;
rodapé 1fr / 1.1fr. A madrugada usa três colunas (1fr / 128px / 1fr) com o
trilho no centro. A tríade de fotos escalona verticalmente (2ª e 3ª descem
`clamp(18px,3vw,44px)` e `clamp(36px,6vw,88px)`): as três placas não pousam na
mesma linha.

Medidas de linha são explícitas: 68ch no corpo, 56ch na lede, 46ch na lede do
hero, 54ch na descrição de peça, 42ch em legenda, 34ch no desfecho.

**Responsivo — quatro quebras, cada uma com uma razão:**

- **1080px** — todas as grades de duas colunas viram uma; instrumento e ficha
  ganham largura máxima.
- **900px** — a navegação da barra sai; o rodapé empilha.
- **760px** — o chanfro global cai de 22px para 16px e o corpo para 1.09rem; a
  coluna d'água **deita** (a lâmina desliza para a esquerda e a crista vira a
  borda direita); a madrugada vira coluna única com o trilho encostado à
  esquerda; o botão "Entrar" vira link de texto puro (esconder obrigava um
  cliente a rolar a página inteira para achar o painel).
- **460px** — as duas ações do hero empilham. O número é medido, não chutado:
  o rótulo da ação primária ocupa 198px de caixa mínima, o que exige 446px de
  viewport para caberem lado a lado. Se o texto do botão mudar, meça de novo.
  Nesta faixa as chamadas da foto saem **junto com** seus rótulos — linha-guia
  sem rótulo aponta para o nada.

## Elevation & Depth

**Não há sombra projetada em lugar nenhum.** Nenhum card levanta, nada flutua.
A profundidade é inteiramente **tonal e por aresta**: a escada de marinho
(900 → 500) define quem está atrás e quem está na frente, e um fio de 1px
desenha a borda de cada placa. Superfícies escuras usam
`color-mix(marinho-700, transparent)` em 42%–62% para pousar sobre o campo sem
virar outra cor.

As únicas `box-shadow` do sistema são **halos de luz**, não elevação: o brilho
da crista da coluna d'água, o brilho do indicador do trilho da madrugada e o
anel em volta da lâmpada de estado. `backdrop-filter: blur(14px)` aparece uma
vez, na barra fixa, e só até o primeiro scroll — depois ela vira marinho sólido
com fio inferior.

### Named Rules

**A Regra da Chapa em Duas Camadas.** `clip-path` recorta `box-shadow: inset`
exatamente nos chanfros, e a borda some justo nos dois cantos cortados — lê
como defeito, não como corte. Quando a **aresta é estrutural** (o instrumento,
o botão de fio), o contorno é chapa de verdade: o **fundo do próprio elemento
é o anel**, e um `::before` embutido 1,5px e chanfrado de novo é a placa
interna. É essa construção que permite ao instrumento trocar a cor do anel por
estado sem trocar a moldura.

**A Regra do Plano Único.** Nenhum elemento novo pode ganhar sombra projetada
para se destacar. Se precisa de destaque, sobe um degrau de marinho, ganha fio
mais forte ou ganha amarelo — nesta ordem.

## Shapes

**Raio zero em absolutamente tudo.** A única forma do sistema é o **chanfro de
45° em dois cantos opostos** — superior esquerdo e inferior direito — aplicado
via `clip-path` a partir de dois polígonos-token: `--corte` (escala grande,
`--ch: 22px`) e `--corte-p` (escala pequena, `--ch-p: 10px`). Cada componente
redeclara `--ch` localmente e herda o polígono: botão 10px, botão grande 13px,
peça 14px, dúvida 14px, evento da madrugada 12px, campo de formulário 9px,
coluna d'água 8px, instrumento 20px, ficha 22px, foto 20–26px. No mobile o
`--ch` global cai para 16px.

Formas menores repetem o mesmo corte a mão, com o mesmo ângulo: o numerador de
peça (5px), o marcador de item do fecho (4px), o rótulo das chamadas (6px). O
losango da hora da madrugada é a exceção declarada — quatro pontas, porque é um
nó de trilho, não uma placa.

Traço é sempre **esquadrado**: `stroke-linecap: square`, `stroke-linejoin:
miter` nas chamadas, no diagrama do prédio e na seta do select. A única curva
do sistema é a lâmpada de estado (`border-radius: 50%`), que é uma luz-piloto —
e as engrenagens, que são a marca.

Duas faixas listradas a −45° assinam limites de campo: 6px na base do hero
(amarelo/marinho) e 6px no topo do fecho (marinho/amarelo escuro).

## Components

### Buttons

- **Forma:** chanfrada nos dois cantos (`--ch: 10px`; variante grande 13px),
  raio zero, sem borda.
- **Primária (`.btn-amarelo`):** preenchimento amarelo com tinta marinho fundo,
  peso 700, `font-stretch: 108%`, 13px 26px, altura mínima 50px (grande: 16px
  32px / 60px; bloco: 100% de largura / 62px).
- **Hover:** o amarelo **entra pelo chanfro, no sentido do corte** — um
  `::after` com `clip-path` em paralelogramo varre da esquerda para a direita
  em .42s. Não há mudança de escala, translado ou sombra.
- **De fio (`.btn-fio`):** contorno em chapa de duas camadas — fundo
  `--fio-forte` como anel, `::before` embutido 1,5px em marinho fundo. Em
  hover vira amarelo sólido com tinta marinho. Sobre seção clara troca para
  anel `--fio-escuro` e placa `--chapa`.
- **Dentro da ficha:** a ação primária inverte para **marinho** (amarelo sobre
  amarelo apagaria a ação), mas o varrimento de hover continua amarelo — a
  última ação da página não sai da linguagem só porque o campo mudou.
- **Desabilitado:** opacidade .55, cursor `not-allowed`, varrimento travado
  fechado.
- **Foco:** contorno amarelo de 3px com 3px de deslocamento, global para todo
  elemento focável.

### Cards / Placas

- **Cantos:** chanfro pequeno (12–14px).
- **Fundo:** sobre marinho, `color-mix` de `--marinho-700` a 42%–62% com fio de
  1px; sobre claro, `--chapa-clara` com fio escuro.
- **Sombra:** nenhuma (ver Elevation & Depth).
- **Hover (peças):** o fundo sobe para 78%, o fio vira amarelo a 55% e a placa
  desliza 6px para a direita — e acende o ponto correspondente no diagrama do
  prédio.
- **Padding interno:** 22px 26px nas peças; `clamp(26px, 3.4vw, 38px)` na ficha.

### Inputs / Fields

- **Estilo:** fundo branco puro dentro da placa clara, chanfro de 9px, sem
  `border` — o contorno é `inset 0 0 0 1.5px` em `--fio-escuro`. Altura mínima
  54px, texto a 1.05rem, `caret-color` marinho.
- **Hover:** o fio escurece para tinta a 32%.
- **Foco:** o contorno engrossa para 2,5px em marinho institucional; o anel
  amarelo de foco visível fica por fora, a 3px.
- **Erro:** fio de 2px em `#c2261c` e fundo `#fff4f3`, com `aria-invalid`; sai
  assim que a pessoa começa a corrigir.
- **Select:** aparência nativa removida, seta desenhada em SVG com traço
  esquadrado.
- **Mensagem de retorno:** erro `#a81b12`, sucesso `#145c33` — ambos escuros o
  bastante para a placa clara, e ambos fora do amarelo por causa da Regra do
  Amarelo Cego.

### Navigation

Barra fixa de 74px, marinho a 88% com desfoque enquanto está no topo; ao rolar
12px ela vira marinho sólido com fio inferior. Links a .95rem, peso 600, em
`--sobre-2`, com um sublinhado amarelo de 2px que cresce da esquerda em hover
enquanto o texto vai a branco. Marca à esquerda com o lockup **reduzido** (a
linha "Engenharia da Manutenção" a 40px de altura vira borrão cinza); o lockup
completo aparece **uma vez só**, grande, no rodapé. Abaixo de 900px a
navegação some e ficam só as duas ações.

### O Instrumento (componente-assinatura)

Placa chanfrada de 20px, anel de 1,5px, interior em gradiente de marinho
institucional a marinho fundo, dividida em cabeçalho / corpo / estado / nota
por fios de 1px. À esquerda, o tubo vertical com a lâmina d'água; à direita,
três leituras em mono (nível %, coluna cm, corrente A). As faixas de **45%** e
**20%** são desenhadas no tubo com marcas tracejadas e espelham os limiares
reais do backend. O estado muda a cor do **anel inteiro** e da faixa inferior:
amarelo em "baixo", vermelho de risco em "crítico" (com a lâmpada piscando em
`steps(1)`), verde-menta `#63d8a0` em repouso. A placa declara em prosa que as
leituras são simuladas.

**A Regra da Fonte Única.** A posição da lâmina e o número da leitura são
escritos pelo **mesmo laço de `requestAnimationFrame`**, quadro a quadro, a
partir de `--n`. A coluna **não pode** voltar a ter `transition` no CSS: duas
curvas diferentes fazem coluna e número discordarem no meio do percurso, e num
instrumento isso destrói exatamente a peça que prova o produto. Corrente,
relógio e estado ficam fora do laço porque são eventos — chaveiam, não
deslizam.

### Motion

Duas entradas distintas, **de propósito**:

- **`.rev` — a revelação por corte.** Máscara diagonal a 108° varrendo o
  elemento como chapa sendo cortada (`mask-size: 500% 100%`, 1.15s). É o gesto
  de marca e está **reservado a quatro elementos**: a manchete do hero, o
  instrumento, a ficha e a foto anotada. **Limite geométrico documentado:** a
  geometria diagonal só cobre até altura ≈ 5× a largura; abaixo de
  `mask-size: 500%` com parada opaca em 40%, elementos altos terminam a
  transição com uma faixa translúcida atravessados.
- **`.sobe` — a subida silenciosa.** Translado de 14px e opacidade, para todo o
  resto. Uma entrada só, repetida trinta vezes, vira tique.
- **A madrugada tem entrada própria:** cada lado chega do seu lado do trilho
  (±26px em X), com .1s de atraso no lado direito.
- **Engrenagens:** rotação linear contínua e muito lenta (64s, 96s, 120s), em
  sentidos opostos, sempre atrás do conteúdo.
- **Escalonamento:** `--atraso` de .09s por irmão, **limitado a 4 passos** —
  uma lista longa não pode acumular dois segundos de atraso no último item.
- **Easing único:** `cubic-bezier(.16, .84, .32, 1)` para todas as transições
  de estado.

**A Regra do Estado Padrão Visível.** O estado escondido só é aplicado quando
existe como animá-lo de volta: o JS adiciona `.js-corte` na raiz **apenas** se
houver `IntersectionObserver` **e** suporte a `mask-image`. Sem isso, a página
fica visível exatamente como está no HTML. E em `prefers-reduced-motion:
reduce` toda máscara é removida, tudo volta a opacidade 1, o trilho da
madrugada vai a 100% e o instrumento é congelado no momento que importa — o
alerta crítico já aberto.

## Do's and Don'ts

### Do:

- **Do** cortar todo elemento novo com `--corte` ou `--corte-p`, redeclarando
  `--ch` localmente conforme o tamanho da peça. Chanfro de 45° nos cantos
  superior esquerdo e inferior direito é a forma da casa.
- **Do** usar o amarelo `#fbb329` como **preenchimento de região** com tinta
  marinho por cima quando a superfície for clara.
- **Do** construir aresta visível com a chapa de duas camadas (fundo = anel,
  `::before` embutido 1,5px e re-chanfrado) sempre que o contorno for
  estrutural sob `clip-path`.
- **Do** conduzir profundidade pela escada de marinho e por fios de 1px.
- **Do** manter Martian Mono restrito a medições e etiquetas gravadas em caixa
  alta, com `tabular-nums` em todo número que muda.
- **Do** manter o corpo em 19px e as medidas de linha declaradas em `ch`; o
  leitor é um síndico, com frequência mais velho.
- **Do** escrever qualquer leitura e sua representação gráfica a partir da
  mesma variável, no mesmo quadro.
- **Do** deixar o conteúdo visível por padrão e só esconder o que o JS
  comprovadamente consegue revelar.

### Don't:

- **Don't** usar `border-radius` em nada. Raio zero; a única curva permitida é
  a lâmpada de estado e a engrenagem da marca.
- **Don't** escrever amarelo como texto ou desenhar ícone amarelo sobre placa
  clara — reprova contraste até como forma sólida. O indicador é marinho.
- **Don't** aplicar sombra projetada, elevação flutuante ou gradiente
  decorativo para destacar um elemento.
- **Don't** confiar em `box-shadow: inset` para a borda de um elemento com
  `clip-path` cujo chanfro seja grande e estrutural — ela é recortada nos dois
  cantos e lê como defeito.
- **Don't** espalhar a revelação por corte (`.rev`): ela é do hero, do
  instrumento, da ficha e da foto anotada. Todo o resto sobe em silêncio.
- **Don't** inverter o campo para amarelo uma segunda vez na página.
- **Don't** usar `--risco` fora de estado crítico real.
- **Don't** alinhar à direita a coluna esquerda de um par comparativo: a
  simetria espelhada custa legibilidade justamente para quem este produto
  atende. A identidade de cada lado vem da etiqueta, não do alinhamento.
- **Don't** importar tokens, componentes ou o âmbar do `public/admin.css`
  para esta superfície — e nem o contrário. São dois sistemas, por decisão.
