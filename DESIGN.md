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
  rasgo: "rgba(2, 6, 22, .55)"
  luz: "rgba(255, 255, 255, .10)"
  agua-critico-topo: "#7a1e2c"
  agua-critico-base: "#4a1220"
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
  # ── Rampa de UI (painel do cliente) ──────────────────────────────────────
  # Fixa em rem e de razão apertada, ao contrário da rampa de peça de venda
  # acima. Ver a seção "Rampa de UI" no corpo do documento.
  ui-veredito:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 2.4vw, 1.85rem)"
    fontWeight: 800
    lineHeight: 1.22
    letterSpacing: "-.022em"
  ui-tela:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.32rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-.02em"
  ui-modal:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-.02em"
  ui-placa:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.09rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-.015em"
  ui-corpo:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  ui-corpo-2:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: ".95rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui-apoio:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: ".87rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  ui-leitura:
    fontFamily: "Martian Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "1.9rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-.03em"
    fontFeature: "tabular-nums"
  ui-leitura-2:
    fontFamily: "Martian Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-.02em"
    fontFeature: "tabular-nums"
  ui-relogio:
    fontFamily: "Martian Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: ".95rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: ".04em"
    fontFeature: "tabular-nums"
  ui-etiqueta:
    fontFamily: "Martian Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: ".62rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: ".12em"
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

# Design System: General Telemetria — Sistema "Chapa"

> **Fronteira do documento — revisada em 2026-08-27.** Este arquivo descreve o
> sistema **"Chapa"**, que hoje veste **cinco superfícies**: a landing pública
> (`/`), a tela de login (`/login`), o **painel do cliente**
> (`/cliente/painel`), o **painel admin** (`/admin/painel`) e o **painel do
> operador** (`/operador/painel`, desde 27/08/2026 — em registro de operação,
> como o admin; ver [painel-operador.md](docs/modulos/painel-operador.md)).
>
> ⚠️ **O painel admin entrou em 20–21/08/2026, e isso INVERTE o que esta caixa
> dizia.** Até então ela afirmava que o admin seguia num sistema separado
> ("Mission Control", âmbar `#f0b014`) e que **nenhum token cruzava a
> fronteira** — decisão registrada, não pendência. O Pedro reabriu isso em
> 18/08 pedindo que o admin se aproximasse do Chapa; as 15 telas foram
> migradas em 20–21/08. O "porquê" e as duas direções descartadas estão em
> [decisions.md](memory-bank/decisions.md); as evidências medidas, em
> [painel-admin.md](docs/modulos/painel-admin.md).
>
> O **app mobile do técnico** (`app/public/app.css`) é o único que continua
> fora, **por decisão de escopo, não por princípio**: ele tem cópia própria
> dos tokens com `--accent: #f0b014`. Enquanto não migrar, é a quarta
> identidade do produto — e isso é dívida conhecida, não desenho.
>
> **O admin não é uma quinta cópia do mesmo registro.** Ele usa o Chapa em
> **registro de operação**, e as diferenças são deliberadas:
>
> | | Cliente / landing | Admin |
> |---|---|---|
> | Corpo | 17px, medida de linha em `ch` | 13px, sem limite de medida |
> | Rampa | fluida (`clamp`) | fixa em `px`/`rem` |
> | Gestos retóricos | revelação por corte, engrenagens, inversão de campo | nenhum |
> | Densidade | uma leitura por tela | tabela de 40 linhas |
>
> As cinco superfícies **duplicam os tokens de propósito** (`landing.css`,
> `login.css`, `cliente.css`, `admin.css`, `operador.css`), porque são servidas
> em páginas diferentes e não compartilham CSS. **Mudou a paleta? Mude nos
> cinco.**
>
> ⚠️ **Rampa de tipo: este sistema não tem tokens de tamanho, e isso é o
> estado, não um descuido.** `cliente.css` usa 37 tamanhos distintos,
> `landing.css` 31, `operador.css` 29 — o que a rampa abaixo documenta são
> **papéis**, não literais. O detector da skill sinaliza cada `font-size` como
> fora da rampa nas cinco folhas; introduzir tokens em uma só faria dela a
> superfície fora do padrão. Se um dia isso for arrumado, é nas cinco de uma
> vez.
>
> Contexto de produto: [PRODUCT.md](PRODUCT.md) · Fluxos:
> [Landing pública](docs/modulos/landing-publica.md) ·
> [Painel do cliente](docs/modulos/painel-cliente.md) ·
> [Painel admin](docs/modulos/painel-admin.md) · Índice: [Home](Home.md)

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
  marinho — faixa crítica da coluna e anel do instrumento em crítico. Nunca é
  decoração e nunca aparece em repouso.

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
- **Rasgo / Luz** (`--rasgo`, `--luz`): o par do **corte gravado**. Sempre
  juntos e sempre nesta ordem — `--rasgo` é o fundo do sulco, `--luz` é a
  aresta virada para cima. Diferente de `--fio`, que desenha o contorno
  *externo* de uma placa, este par divide o *interior* de uma peça só.

### Named Rules

**A Regra do Amarelo Cego.** O amarelo **nunca é texto nem ícone sobre
superfície clara** — reprova contraste mesmo como forma sólida (~2:1). Sobre
claro ele só existe como **preenchimento com tinta marinho por cima**. Quando
um indicador precisar existir numa placa clara, ele é marinho, e o amarelo
entra no realce do painel inteiro. Sobre marinho o amarelo é livre.

**A Regra dos Dois Campos de Estado.** A regra acima não é só do amarelo: no
painel do cliente o dado é lido em **placa clara**, e ali `--risco` (`#ff5a4d`)
e o verde de repouso também reprovam como texto. Por isso o estado tem **duas
famílias**, e usar a errada é erro de contraste, não de gosto:

| Estado | Sobre marinho | Tinta sobre placa clara |
|---|---|---|
| Crítico | `--risco` `#ff5a4d` | `--risco-t` `#790000` (L .34 · 9,7:1) |
| Atenção | `--amarelo` `#fbb329` | `--atencao-t` `#886116` (L .52 · 4,7:1) |
| Repouso | `--normal` `#63d8a0` | `--normal-t` `#105c31` (L .42 · 6,8:1) |

⚠️ **A família `-t` foi RE-DEGRAUADA em 21/08/2026, e o motivo importa.** Os
valores anteriores (`#b3241a` · `#8a5300` · `#145c33`) davam **ΔE 1,2 sob
deuteranopia** entre "crítico" e "atenção" — na prática, a mesma cor para quem
tem daltonismo vermelho-verde, e justamente nos dois estados cuja confusão
muda uma decisão. A causa era simples de ver depois de medida: as duas tinham
**luminosidade praticamente idêntica** (L .494 e .499) e ambas as matizes são
quentes. Sob deuteranopia a matiz colapsa, e não sobrava nada.

A separação agora vem da **luminosidade**, que sobrevive ao daltonismo. Como
os três precisam de ≥ 4,5:1 como texto sobre `--chapa`, a banda utilizável vai
só até L ≈ .52 — não cabe separar bem os três pares. A prioridade foi
explícita:

| Par | Antes | Agora | Por quê |
|---|---|---|---|
| **crítico ↔ atenção** | ΔE 1,2 | **15,4** | é o par cuja confusão muda decisão |
| crítico ↔ em ordem | 4,3 | 5,9 | os dois extremos; confundir não gera ação errada |
| atenção ↔ em ordem | — | 6,9 | ambos significam "não é emergência" |

⚠️ Os dois últimos pares seguem na faixa de piso (6–8), **e isso só é
aceitável porque estado neste sistema nunca aparece sem rótulo escrito** — a
cor é reforço, não a informação. Se algum dia um estado for exibido só por
cor, esta conta precisa ser refeita antes.

Quando o estado precisa de **forma**, e não de texto, ele vira **placa
chanfrada preenchida com tinta legível por cima** — é o que fazem as badges de
severidade, os pills de status e a placa do ícone do KPI.

**A Regra do Preenchimento Cru.** Nasceu ao levar o admin para placa clara
(21/08). Dentro de `.modalBox`, `.drawer-panel` e `.av-modal-dialog` os tokens
semânticos **viram tinta** — é isso que mantém o texto legível lá. Mas **selo
preenchido não pode acompanhar**: uma placa de fundo `--risco-t` com tinta
marinho por cima é escuro sobre escuro. Por isso existem três tokens **crus**,
que não flipam em superfície nenhuma:

| Papel | Token | Uso |
|---|---|---|
| Preenchimento | `--amarelo` · `--vermelho` · `--verde` | **fundo** de selo, sempre com tinta marinho por cima |
| Tinta | `--warn` · `--risco` · `--ok` (e `--accent`) | **texto e borda**, e flipam para a família `-t` na placa clara |

Regra curta: **fundo de selo usa o cru; texto e borda usam o semântico.**

**A Regra do Selo.** Um selo de estado é **placa chanfrada preenchida quando
pede ação, e de fio em repouso**. Isso não é estética: é o que faz uma tela com
tudo em ordem ficar calma por construção, e um item crítico saltar de uma
tabela de 40 linhas sem piscar. Quando duas dimensões de estado convivem na
mesma linha, **só uma preenche** — a que grita — e a outra fica de fio:

| Tela | Preenche | De fio |
|---|---|---|
| Chamados | prioridade | status |
| Alertas | severidade | status |
| O.S. | resultado | status |

⚠️ **Categoria não é estado.** Tipo de serviço, papel de usuário, origem do
alerta e categoria do chamado **nunca preenchem** — quem distingue é o rótulo.
Preenchê-los faz o painel inteiro gritar ao mesmo tempo, que é o mesmo que não
gritar.

**A Regra da Paleta Categórica.** Cor de série em gráfico é **identidade**, e
identidade não pode colidir com estado. Como `--risco`, `--amarelo` e `--ok`
estão reservados, **o lado quente do círculo está fora** — e, só no lado frio,
duas matizes quaisquer colapsam sob deuteranopia. A separação vem da
**luminosidade**, e o resultado são **três slots em ordem fixa**:

| Slot | Sobre marinho | Sobre placa clara |
|---|---|---|
| 1 | `--serie-1` `#2f6fe0` (L .564 · h 261) | `--serie-1-claro` `#1f60d4` (L .520) |
| 2 | `--serie-2` `#00a8af` (L .665 · h 200) | `--serie-2-claro` `#00929c` (L .590) |
| 3 | `--serie-3` `#bd3a80` (L .555 · h 350) | `--serie-3-claro` `#93167f` (L .470 · **h 325**) |

⚠️ **O slot 3 muda de MATIZ entre os dois campos, não só de degrau.** Em h 350
sobre claro ele encostava no `--risco-t` (ΔE 12,5 a olho normal, abaixo do piso
de 15) e uma série seria lida como estado crítico.

⚠️ **Três é o teto, e é medido.** Uma quarta matiz fria dá ΔE 1,9 sob
protanopia. Série nº 4 vira "Outros", vira facetas, ou vira outro gráfico —
**nunca uma cor nova**. Valores validados com o validador da skill `dataviz`
contra a superfície real (`#051342` no escuro, `#e8ebf2` no claro): todos os
pares passam em faixa de luminosidade, piso de croma, separação CVD e
contraste ≥ 3:1.

⚠️ **Achado colateral, não resolvido:** sobre placa clara, `--atencao-t` e
`--risco-t` dão ΔE 1,2 sob deuteranopia (e 11,5 a olho normal), e `--normal-t`
× `--risco-t` dão 4,3 sob protanopia. Isso vale **também no painel do
cliente**, que está em produção. O que salva hoje é a regra de que estado
sempre vem com rótulo escrito — a cor nunca está sozinha.

**A Regra da Água Visível.** A lâmina d'água abre em `--agua` (`#2f6fe0`) no
painel e em `--mar-500` na landing. No **crítico** ela escurece para vinho
(`agua-critico-topo` → `agua-critico-base`) — os mesmos dois valores nas três
folhas que desenham a peça (landing, cliente, operador); no **baixo** a água
continua azul e quem avisa é a crista âmbar. Não é inconsistência: na landing a coluna
tem 268px e é o único objeto da placa; no painel são três tubos de 176px lado a
lado sobre o mesmo gradiente marinho, e a rampa 500→700 lê como retângulo
preto — a água some justo no reservatório mais baixo, que é o único que
importa enxergar. Medido na tela, não deduzido.

**A Regra do Campo Único.** A página inverte o campo **uma vez só**: a seção de
conversão vira amarela com tinta marinho (~9:1, o texto mais legível da
página). Se uma segunda região virar campo amarelo, o gesto do "aja aqui"
morre.

**A Regra do Crítico Silencioso.** `--risco` não aparece em repouso. Ele só é
ligado por estado real (`data-estado="critico"`) — hoje, exclusivamente no
instrumento. Nenhum bloco de conteúdo estático usa vermelho.

**A Regra do Corte Gravado.** Divisão interna de placa é feita com **duas**
linhas de 1px, nunca uma: `--rasgo` (`rgba(2,6,22,.55)`, o fundo do sulco) e,
imediatamente ao lado, `--luz` (`rgba(255,255,255,.10)`, a aresta pegando luz).
Uma linha só lê como borda de card e transforma a placa em três cartõezinhos —
que é o vício da versão rejeitada. É este par que faz a divisão ler como corte
em chapa. Ver `.vigia-cel + .vigia-cel`.

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
  identificação do instrumento, relógio do instrumento, "onde fica" de cada
  peça, rótulo do rodapé, selo do hero, rótulo das chamadas na foto.
- **Reading** (mono 700, `clamp(1.5rem, 2.3vw, 1.95rem)`, `tabular-nums`,
  altura 1): os números do instrumento. A unidade ao lado sai a .72rem em
  `--sobre-2`.

### Rampa de UI (painel do cliente)

A hierarquia acima é de **peça de venda**: fluida (`clamp`), com contraste
grande entre passos. O painel do cliente é superfície de **tarefa**, e usa uma
rampa própria — **fixa em `rem`, razão apertada**, porque ali existem muito
mais elementos de tipo por tela e um `h1` que encolhe dentro de uma coluna fica
pior, não melhor. Não é desvio do sistema; é o mesmo sistema no registro de
operação. Só o **veredito** do instrumento mantém `clamp`, porque é a única
peça retórica do painel.

| Papel | Tamanho | Peso | Família |
|---|---|---|---|
| Veredito (instrumento) | `clamp(1.35rem, 2.4vw, 1.85rem)` | 800 | Archivo |
| Título de tela (topbar) | 1.32rem | 800 | Archivo |
| Título de modal | 1.2rem | 800 | Archivo |
| Título de placa | 1.09rem | 800 | Archivo |
| Corpo | **1.0625rem (17px)** | 400 | Archivo |
| Corpo secundário | .93rem–.97rem | 400–700 | Archivo |
| Apoio / legenda | .82rem–.88rem | 400 | Archivo |
| Leitura grande (KPI, nível) | 1.6rem–1.9rem, `tabular-nums` | 700 | Martian Mono |
| Relógio do instrumento | .95rem, `tabular-nums` | 700 | Martian Mono |
| Etiqueta gravada | .55rem–.66rem, tracking .11–.14em, caixa alta | 500–700 | Martian Mono |

⚠️ **O corpo é 17px e não encolhe no mobile.** É requisito de conversão do
[PRODUCT.md](PRODUCT.md) (público envelhecido), não sobra de escala. O painel
antigo tinha rótulo de KPI a 9px no celular — o aparelho em que o síndico mais
lê era o que tinha o menor texto.

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
rodapé 1fr / 1.1fr. A placa do serviço é uma peça só: três células
iguais em cima (`repeat(3, 1fr)` — são falhas equivalentes, e forçar
assimetria aqui seria decoração) e a faixa de 24 h embaixo em `.92fr / 1.08fr`.
A tríade de fotos escalona verticalmente (2ª e 3ª descem `clamp(18px,3vw,44px)`
e `clamp(36px,6vw,88px)`): as três placas não pousam na mesma linha.

Medidas de linha são explícitas: 68ch no corpo, 56ch na lede, 46ch na lede do
hero, 54ch na descrição de peça, 42ch em legenda, 20ch na chamada de 24 h.

**Responsivo — quatro quebras, cada uma com uma razão:**

- **1080px** — todas as grades de duas colunas viram uma; instrumento e ficha
  ganham largura máxima; a faixa de 24 h empilha.
- **900px** — a navegação da barra sai; o rodapé empilha.
- **760px** — o chanfro global cai de 22px para 16px e o corpo para 1.09rem; a
  coluna d'água **deita** (a lâmina desliza para a esquerda e a crista vira a
  borda direita); a placa do serviço vira coluna única e **o sulco
  deita junto** (o corte gravado passa de `border-left` para `border-top`,
  senão as células empilhadas ficam sem divisão nenhuma); o botão "Entrar"
  vira link de texto puro (esconder obrigava um cliente a rolar a página
  inteira para achar o painel).
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
da crista da coluna d'água e o anel em volta da lâmpada de estado. (`box-shadow:
inset` de 1px também aparece como *aresta*, no anel das placas e no corte
gravado — é usinagem, não elevação.) `backdrop-filter: blur(14px)` aparece uma
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

**A Regra da Superfície.** Tirada da tela de login, que está em produção
desde 11/08: **marinho é moldura; placa clara é onde se lê e se edita.** Ao
aplicar isso ao admin (21/08) a regra precisou de uma fronteira mais afiada,
porque "formulário" sozinho levaria o painel inteiro para o claro:

> **Placa clara é o que ABRE POR CIMA do painel.** Modal, drawer, lightbox.
> O que fica lado a lado com o conteúdo — coluna de ficha, card de
> configuração, tabela — é superfície de trabalho e continua marinho.

O motivo é de leitura, não de gosto: uma coluna clara permanente ao lado de uma
tabela marinho parte a tela em dois campos que competem, e nenhum dos dois vence.
Já uma placa clara que aparece **por cima**, com o campo escurecido atrás,
declara "agora é aqui" sem disputar com nada.

⚠️ **Converter uma superfície para claro é remapeamento de token, não reescrita
de regra.** Redeclarar `--text`, `--muted`, `--border`, `--surface` e a família
de estado **no contêiner** vira a subárvore inteira de uma vez — sem caçar
seletor e sem o risco de esquecer um e deixar texto branco sobre fundo branco.
No admin isso converteu 11 modais mais o drawer com um bloco de tokens cada.
O que **não** se remapeia: `--amarelo`/`--vermelho`/`--verde` (crus, ver A Regra
do Preenchimento Cru) e `--mar-800`/`--mar-900`, que são a tinta de quem pousa
sobre o amarelo — remapeá-los apagaria o rótulo do botão primário.

**A Regra do Plano Único.** Nenhum elemento novo pode ganhar sombra projetada
para se destacar. Se precisa de destaque, sobe um degrau de marinho, ganha fio
mais forte ou ganha amarelo — nesta ordem.

## Shapes

**Raio zero em absolutamente tudo.** A única forma do sistema é o **chanfro de
45° em dois cantos opostos** — superior esquerdo e inferior direito — aplicado
via `clip-path` a partir de dois polígonos-token: `--corte` (escala grande,
`--ch: 22px`) e `--corte-p` (escala pequena, `--ch-p: 10px`). Cada componente
redeclara `--ch` localmente e herda o polígono: botão 10px, botão grande 13px,
peça 14px, dúvida 14px, campo de formulário 9px, coluna d'água 8px,
instrumento 20px, placa do serviço 20px, ficha 22px, foto 20–26px. No
mobile o `--ch` global cai para 16px.

⚠️ **A RAMPA ACIMA É A INTENÇÃO; O QUE RENDERIZA É UM NÚMERO SÓ.** Medido no
navegador em 27/08/2026, nas duas folhas: `.item` do operador declara
`--ch: 16px` e sai com 8; `.ficha` declara 22 e sai com 8; no cliente, `.placa`
declara 16, `.ficha` declara 14, e as duas saem com 10. **Todo `--ch` local é
morto.** O motivo é da própria especificação: o `var()` dentro de uma custom
property é substituído no elemento onde ela é **declarada**, não onde é usada —
`--corte` resolve `--ch` no `:root`, e os descendentes herdam o polígono já
pronto. Redeclarar `--ch` num componente só teria efeito se ele redeclarasse
`--corte` junto.

Ou seja: hoje cada superfície tem **um** chanfro (landing 22px, cliente e admin
10, operador 10 desde 27/08 — era 8), e a escada de tamanhos por componente não
existe em lugar nenhum. Isso é o **estado**, não descuido novo: as declarações
locais estão escritas em todas as folhas e documentam a intenção. Consertar é
mudar as cinco de uma vez — fazer numa só transformaria justamente aquela na
superfície fora do padrão, que é a mesma razão registrada acima para a rampa de
tipo. Enquanto não for feito, **mudar o chanfro de uma tela é mudar o `--ch` do
`:root` dela**, e nada mais adianta.

Formas menores repetem o mesmo corte a mão, com o mesmo ângulo: o numerador de
peça (5px), o marcador de item do fecho (4px), o rótulo das chamadas (6px).

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

### A Placa Dividida (`.vigia`)

Uma placa chanfrada de 20px com anel de 1px, dividida internamente por **cortes
gravados** — três células de largura igual em cima e a faixa de conclusão
embaixo. É deliberadamente **um objeto, não um conjunto de cards**: o conteúdo
(três falhas que a boia não reporta + a chamada de 24 h) pediria naturalmente
três caixas lado a lado, e é exatamente essa a forma proibida — foi o vício da
primeira versão rejeitada, e é o contêiner preguiçoso por excelência.

A anatomia é emprestada do instrumento (cabeçalho / corpo / estado / nota
separados por sulco): quem já leu a placa do hero reconhece a peça. Título de
célula em amarelo sobre marinho (livre, pela Regra do Amarelo Cego), corpo a
1.02rem. Sem hover, sem estado — é leitura, não controle.

### Inputs / Fields

- **Estilo:** fundo branco puro dentro da placa clara, chanfro de 9px, sem
  `border` — o contorno é `inset 0 0 0 1.5px` em `--fio-escuro`. Altura mínima
  54px, texto a 1.05rem, `caret-color` marinho.
- **Hover:** o fio escurece para tinta a 32%.
- **Foco:** o contorno engrossa para 2,5px em marinho institucional. No
  `:focus-visible` o anel vira duplo — amarelo a 3px com marinho a 6px — e
  ⚠️ **os dois são `inset`**. Anel por `outline` ou por `box-shadow` normal é
  pintado fora da caixa e o `clip-path` do chanfro recorta ele inteiro: o
  indicador é calculado e simplesmente não aparece.
- **Erro:** fio de 2px em `#c2261c` e fundo `#fff4f3`, com `aria-invalid`; sai
  assim que a pessoa começa a corrigir.
- **Select:** aparência nativa removida, seta desenhada em SVG com traço
  esquadrado.
- **Mensagem de retorno:** erro `--risco-t`, sucesso `--normal-t` — os mesmos
  da família de estado, e não um par próprio. Antes eram `#a81b12` e `#145c33`
  escritos à mão, o que criava um quarto vermelho no sistema.

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
- **A placa do serviço sobe inteira**, não célula por célula: animar
  as três em sequência desmancharia a leitura de peça única e recriaria o
  efeito de cards que a placa existe para evitar.
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
reduce` toda máscara é removida, tudo volta a opacidade 1 e o instrumento é
congelado no momento que importa — o alerta crítico já aberto.

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
- **Don't** resolver "três coisas paralelas" com três caixas iguais de título +
  parágrafo lado a lado. Neste sistema isso vira **uma placa dividida por
  cortes gravados** — um objeto usinado, não três cards flutuando.
- **Don't** dividir o interior de uma placa com uma linha só: sem o par
  `--rasgo` + `--luz` a divisão lê como borda de card e desfaz a peça única.
- **Don't** pôr faixa de cor de 3px na borda de um card para indicar estado.
  É o tell mais reconhecível de interface gerada por IA e, aqui, é gramática
  estranha: neste sistema profundidade é **aresta e corte**, nunca barra. O
  estado vai na placa do ícone, preenchida.
- **Don't** usar o sinal claro (`--risco`, `--amarelo`, `--normal`) como texto
  ou ícone sobre placa clara. Sobre claro é a família `-t`. Ver A Regra dos
  Dois Campos de Estado.
- **Don't** encolher o corpo de texto no mobile do painel. As quebras são
  estruturais; o tamanho é requisito de público.
- **Don't** tratar o `public/admin.css` como sistema estrangeiro: desde
  21/08/2026 ele É este sistema, em registro de operação. O que continua fora
  é o `app/public/app.css` (app do técnico), e por escopo, não por princípio.
- **Don't** preencher selo de CATEGORIA (tipo de serviço, papel de usuário,
  origem, categoria de chamado). Preenchimento é reservado a estado que pede
  ação — ver A Regra do Selo.
- **Don't** usar token semântico (`--risco`, `--warn`, `--ok`, `--accent`) como
  FUNDO de selo: dentro de placa clara ele vira tinta e o selo fica escuro
  sobre escuro. Fundo usa o cru (`--vermelho`, `--amarelo`, `--verde`).
- **Don't** acrescentar uma quarta cor de série num gráfico. O teto de três é
  medido, não estilístico — ver A Regra da Paleta Categórica.
- **Don't** dar `clip-path` a um contêiner que hospede `position: fixed`
  (modal, mapa em tela cheia). `clip-path` faz do elemento bloco de contenção
  para descendentes fixos, e eles passam a se posicionar — e a ser recortados
  — em relação a ele. É por isso que a moldura do admin é esquadrada e só as
  peças são cortadas.
- **Don't** escrever `:has()` com descendente solto para detectar estado
  vazio. `:has()` ignora `display: none` e casa com o que está no DOM: um
  placeholder escondido em outra coluna dispara a regra. Use caminho exato
  (`:has(> .col > .placeholder)`).
- **Don't** compor o nome da marca em tipo. A marca é o PNG do wordmark —
  `logo-topo.png` (sem a assinatura) em barra, `login-logo.png` no login e no
  loader. Foi assim em quatro superfícies e o painel do operador nasceu
  digitando "General" em Archivo; ninguém pega isso medindo, só lado a lado.
- **Don't** confiar no anel de foco `inset` do `:focus-visible` global sem
  olhar o que a peça já tem: **um `inset` próprio o engole** (é o caso de todo
  botão de fio, que fica sem foco visível) e **anel amarelo sobre superfície
  amarela é invisível** — ali o anel é marinho, pela Regra do Amarelo Cego.
  ⚠️ Corrigido em `operador.css` (27/08/2026); **`cliente.css` e `landing.css`
  seguem com o furo latente**.
- **Don't** escrever `--muted2` (`#5b6c9e`) como tinta sobre a placa do
  registro de operação: dá **3,05:1**, e quase todo texto pequeno desse
  registro é mono em caixa alta de 8–9px, o pior caso possível. Secundário ali
  é `--muted` (`#8294c2`, 5,2:1). Medido no painel do operador em 27/08/2026.
- **Don't** deixar `h3`/`h1` sem `margin:0` dentro de flex/grid de item denso:
  a margem de 1em do navegador **não colapsa** ali e vira ar acidental — foram
  29px por item na fila do operador, invisíveis na leitura do CSS.
- **Don't** tratar o `public/operador.css` como sistema estrangeiro: desde
  27/08/2026 ele É este sistema, no mesmo registro de operação do admin. O que
  continua fora é o `app/public/app.css` (app do técnico), e por escopo.
- **Don't** fazer o painel do cliente voltar a carregar `admin.css`. Foi o
  defeito central que este redesenho desfez: toda evolução do painel de
  operação caía no painel do síndico sem revisão. Ver
  [Painel do cliente](docs/modulos/painel-cliente.md).
