---
tags:
  - projeto
  - fluxo
aliases:
  - Painel do Cliente
  - Painel do Síndico
  - Meu prédio
---
# Painel do Cliente — "Meu prédio"

Rota `/cliente/painel`. É a tela que o **síndico** usa no navegador (quase
sempre do celular) para saber se pode dormir tranquilo, acompanhar um
atendimento e prestar contas na assembleia.

Arquivos: `public/cliente.html` · `public/cliente.css` · `public/cliente.js`.
Backend em [`../api.md`](../api.md) (router `cliente`), regras de nível em
[`telemetria.md`](telemetria.md), ciclo do chamado em
[`chamados-sla.md`](chamados-sla.md).

---

## ⚠️ Este painel não carrega mais o `admin.css`

**A mudança mais importante deste módulo, feita em 2026-08-13.** Até então
`cliente.html` carregava `admin.css` (265 KB do Mission Control) e o
`cliente.css` era só uma folha de *overrides* tentando desfazer proporções.

Consequências que isso teve, e que não devem voltar:

- Toda evolução do painel **admin** caía no painel do cliente sem ninguém
  pedir. O salto de `?v=159` para `?v=189`, em agosto, entregou 30 versões de
  mudanças ao síndico sem revisão.
- O cliente herdava a **arquitetura de informação** do admin. O admin tem
  *Dashboard* **e** *Telemetria* porque olha N condomínios; o cliente tem
  **um** — e as duas seções mostravam os mesmos 3–5 reservatórios duas vezes,
  com componentes diferentes para o mesmo dado.
- Herdava a **linguagem de sala de controle**: fundo preto, âmbar `#f0b014`
  (que não é a cor institucional — ver [`../../PRODUCT.md`](../../PRODUCT.md)),
  selo "LIVE", tabelas de 5 colunas com "Severidade" e "Aberto há", rótulo de
  KPI a 9px no mobile. O leitor é leigo e com frequência mais velho.

Hoje `cliente.css` é **folha autônoma** no sistema visual **"Chapa"** — o mesmo
da landing (`/`) e do login (`/login`). Ver [`../../DESIGN.md`](../../DESIGN.md).

> **Não reintroduzir `admin.css` aqui, nem tokens dele.** O admin é ferramenta
> de operação interna; este painel é a continuação da página que vendeu o
> serviço. São dois sistemas, por decisão — ver
> [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

### A ponte de tokens

O `cliente.js` escreve `style="color:var(--muted)"` em 13 lugares, mais
`var(--text)` e `var(--accent)`. Eram tokens do `admin.css`. Estão
**redefinidos** no bloco 2 do `cliente.css`, em valores Chapa, para que o JS
continue válido sem ser reescrito. As 15 ocorrências ficam dentro de placa
clara, por isso `--muted` aponta para `--tinta-2`. **Não remover a ponte.**

---

## As três seções

| Seção | `data-section` | O que responde |
|---|---|---|
| **Meu prédio** | `predio` | "Está tudo bem agora?" e "o que aconteceu?" |
| **Alertas** | `alertas` | Lista + detalhe dos alertas abertos |
| **Chamados** | `chamados` | Lista + detalhe + abrir chamado + avaliar |

Eram quatro (`dashboard`, `telemetria`, `alertas`, `chamados`). Dashboard e
Telemetria foram **fundidas** em `predio`. Nada foi removido: histórico com
24h/7d/30d/90d, seleção de reservatório e exportação em PDF continuam, agora
numa estação só.

⚠️ `mob-sidebar.js` é **compartilhado com o admin** e tem um mapa de títulos
para o topo do celular. A chave `predio` foi acrescentada lá; o admin não tem
essa seção, então a adição é inofensiva para ele.

---

## A estrutura: um trilho, não uma grade

A seção `predio` é uma **linha do tempo vertical** — um corte gravado no campo
marinho (`--rasgo` + `--luz`), com as placas penduradas nele como estações.

```
.linha
 ├── estação AGORA (.linha-estacao.is-agora)
 │     ├── .agora  — o instrumento (placa ESCURA)
 │     └── #resumoGrid — contagens do que está aberto agora
 ├── estação HISTÓRICO (#estHistorico)
 │     └── .card — gráfico + 24h/7d/30d/90d + PDF (placa CLARA)
 └── #linhaEventos — dias e eventos, montados pelo cliente.js
```

**Por que linha do tempo:** o síndico não tem só o problema de "está tudo bem
agora" — ele tem o de **prestar contas**. O painel antigo jogava fora toda a
temporalidade menos um gráfico.

### A estação AGORA

É o **mesmo instrumento da landing pública**, com a mesma anatomia (cabeçalho /
veredito / colunas / nota), só que ligado no sensor de verdade. É deliberado: o
síndico reconhece a peça que viu antes de contratar. Se mexer aqui, olhar
`.instr` em `public/landing.css` antes.

- **O veredito** (`.agora-veredito`) é a frase em prosa grande que responde a
  visita de 5 segundos. Prioridade: crítico → offline → atenção → normal.
  ⚠️ **Nenhuma frase pode afirmar mais do que o dado sustenta.** "Parou de
  enviar leitura" **não** é "está sem água", e essa distinção é literalmente o
  produto. No caso offline a frase **não** cita o técnico designado: ele quase
  sempre está num chamado de outro reservatório, e citá-lo faria o síndico
  entender que alguém já está indo cuidar daquele sensor.
- **As colunas d'água** (`.coluna-tubo`) trazem as faixas de **45%** e **20%**
  desenhadas no vidro. ⚠️ São as do backend (`nivelFromPct`) e as mesmas da
  landing — mudou lá, muda nos três.
- **Offline** não desenha lâmina: o tubo fica hachurado. "Não sei" é diferente
  de "está vazio", e essa diferença é o produto.
- ⚠️ A lâmina abre em `--agua` (`#2f6fe0`), **não** em `--mar-500` como na
  landing. Lá a coluna tem 268px e é o único objeto da placa; aqui são três
  tubos de 176px e a rampa 500→700 lia como retângulo preto — a água sumia
  justo no reservatório mais baixo, que é o que precisa ser visto.

### As estações de evento

Montadas por `_linhaRender()` a partir de material **real**: alertas abertos
(que trazem `criado_em`) e o ciclo completo dos chamados (aberto → técnico
designado → concluído → O.S. finalizada), agrupados por dia. Clicar num evento
de chamado leva à seção Chamados com ele selecionado.

⚠️ **Alerta resolvido não entra na linha.** `/cliente/status` devolve
**apenas** os alertas abertos (`cliente.routes.js`), então o alerta abre e
nunca fecha na linha. Preferimos o buraco honesto ao evento fabricado. Se um
dia o endpoint devolver os resolvidos (`alertas_recentes`), é em
`_linhaRender()` que eles entram — é aditivo e não exige rota nova, logo **não
mexe no `sw.js`**.

---

## Pegadinhas do CSS

- **O anel de foco em elemento chanfrado precisa ser `inset`.** `clip-path`
  recorta tudo que o elemento pinta, e `outline` é pintado *fora* da caixa: o
  indicador é calculado e simplesmente não aparece. Todo elemento chanfrado
  focável novo precisa entrar na lista do bloco 3.
- **`.mob-topbar` é `fixed`, não `sticky`.** Ela está no fim do `<body>`
  (depois do `.layout` e dos modais), então um `sticky; top: 0` gruda dentro do
  próprio fluxo — ela só apareceria depois de rolar a página inteira. O
  `.content` compensa com `padding-top`.
- **Quem rola nas telas lista+detalhe é o `.content`, não a lista.**
  `.ch-list-col` está numa linha de altura automática, então `overflow-y: auto`
  nela nunca engata. Por isso `.ch-detail-col` é `sticky` com teto de viewport
   — sem isso ele sai da tela junto com a rolagem.
- **`overflow-y: auto` sozinho também torna o eixo X rolável.** Quando um eixo
  não é `visible`, o outro computa de `visible` para `auto`. Em contêiner que
  hospeda gráfico ou overlay posicionado por JS, bloquear o eixo que não deve
  rolar (`overflow-x: hidden`).
- **Nada de faixa de cor de 3px na borda de card.** É o tell mais reconhecível
  de interface gerada por IA e não pertence ao vocabulário Chapa — aqui
  profundidade é aresta e corte. Estado mora na **placa do ícone**, preenchida,
  com tinta legível por cima.
- **Sobre placa clara nenhum sinal saturado passa como texto.** Amarelo,
  vermelho e verde claros reprovam contraste sobre `#e8ebf2`. Por isso existem
  duas famílias de estado: `--risco/--atencao/--normal` (sobre marinho) e
  `--risco-t/--atencao-t/--normal-t` (tinta sobre placa clara).
- **O corpo não encolhe no mobile.** As quebras são estruturais (a sidebar sai,
  lista+detalhe empilha, tabela vira lista de placas). Reduzir o texto no
  aparelho em que o síndico mais lê era o defeito exato do painel antigo, que
  tinha rótulo de 9px.

---

## Cache

`cliente.css` e `cliente.js` são **network first** no `sw.js` (regra genérica
de `.css`/`.js`), e `/cliente` já está na lista de prefixos network-first — não
foi preciso mexer no service worker. O `?v=N` no `cliente.html` continua
valendo. Racional completo em [`../../CLAUDE.md`](../../CLAUDE.md).

⚠️ O `cliente.html` **não carrega mais** `chart.umd.min.js` (Chart.js): o
painel só usa ApexCharts. São ~200 KB a menos por carga.

---

## O que ainda não foi verificado

- Nada rodou contra o backend real nesta reconstrução. A verificação foi feita
  num harness estático (o `cliente.html`/`cliente.css`/`cliente.js` reais, com
  o `fetch` dublado), em 1440px e num iframe de 390px.
- O fluxo de erro (401/403, 503 do service worker offline) não foi exercitado.
- Cliente **sem** telemetria contratada: o caminho existe (`#semTelemetria`),
  mas não foi visto renderizado.
