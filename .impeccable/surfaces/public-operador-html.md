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
- A coluna d'água é a peça da landing/cliente (não o cilindro do admin), na
  razão .309, e **deita no celular** como nas outras duas superfícies.
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
ilegível em qualquer escala de barra. 30px numa barra de 60 (26 na de 54), que
é a proporção do painel do cliente (40 em 74).

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
| Marca | `logo-topo.png`, 30px em barra de 60 (26 em 54). Nunca texto. |
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

**O defeito que motivou tudo:** entre 660 e ~1090px a tela desmontava. Trilho
rígido de 300px + item de largura fixa deixavam só o texto para ceder, e a
900px a descrição caía para 10ch (contra os 68 do passe anterior) enquanto o
item ia de 258 para 330+px. Com a quebra de 1080: item de volta a 258, texto em
57ch.

⚠️ **Todo `--ch` local é morto — nas cinco folhas.** `--corte` resolve `--ch`
no `:root` e os filhos herdam o polígono pronto. Registrado em `DESIGN.md`
("Shapes"). Aqui o chanfro é o `--ch` do `:root`, hoje 10px; mexer em `--ch`
de componente não faz nada.

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
