---
tags:
  - projeto
  - fluxo
aliases:
  - Painel do Cliente
  - Painel do Síndico
  - Meu prédio
---
# Painel do Cliente

Rota `/cliente/painel`. É a tela que o **síndico** usa no navegador (quase
sempre do celular) para saber se pode dormir tranquilo, acompanhar um
atendimento e prestar contas na assembleia.

Arquivos: `public/cliente.html` · `public/cliente.css` · `public/cliente.js`.
Backend em [`../api.md`](../api.md) (router `cliente`), regras de nível em
[`telemetria.md`](telemetria.md), ciclo do chamado em
[`chamados-sla.md`](chamados-sla.md). O "porquê" das escolhas está em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md); a
estratégia durável da superfície em `.impeccable/surfaces/public-cliente-html.md`.

Comp de referência: [`../comps/painel-cliente-v3.html`](../comps/painel-cliente-v3.html).

---

## A tese: "a resposta, não o painel"

**A primeira tela inteira é a resposta.** Uma frase que qualquer pessoa entende
sem legenda ("Seu prédio está abastecido."), os reservatórios ao lado como
prova, e **uma** ação ("Preciso de ajuda"). Abaixo, **a história**, escrita como
um humano contaria — "Marcos Ferreira ficou responsável pelo atendimento" —,
não "Chamado #412 · EM_ATENDIMENTO · P3".

**Não existem seções.** Alertas e chamados deixaram de ser lugares para onde
navegar: o que acontece agora está na frase, o que já aconteceu está na
história, e o detalhe abre como **ficha** por cima.

> ⚠️ **A v1 desta reconstrução foi REJEITADA em 13/08/2026** por trocar o mundo
> visual e a estrutura de uma seção mantendo a casca inteira do admin — sidebar
> com colapso, topbar, fileira de KPIs, lista+detalhe com abas, busca e
> tabelas. Veredito do Pedro: *"ficou parecido com o painel admin só que
> pior"*, *"muito poluído"*.
>
> **É a REMOÇÃO dessas peças, não a paleta, que separa este painel do admin.**
> Nada disso volta sem autorização explícita.

---

## PWA no iPhone: a área da barra de status

`cliente.html` declara `apple-mobile-web-app-status-bar-style:
black-translucent`, o que faz o PWA instalado no iOS estender a página **por
baixo da barra de status**. Sem tratamento, a `.barra` (que é `sticky; top:0`)
gruda no topo do viewport e deixa aquela faixa descoberta — com o conteúdo
rolando visível por trás dela. Relatado pelo Pedro em 2026-08-18.

- O `<meta viewport>` precisa de **`viewport-fit=cover`**: sem ele o iOS devolve
  **0** em `env(safe-area-inset-*)`, e o CSS não tem como compensar.
- A `.barra` **cresce** para cobrir a faixa (`height: calc(var(--barra-h) +
  env(safe-area-inset-top))` + `padding-top` igual), empurrando o próprio
  conteúdo para baixo dela.
- Quem depende da altura da barra desconta as duas coisas: `scroll-padding-top`
  do `html` e o `min-height` de `.resposta`.
- `login.css` faz o equivalente no `body` (lá não há barra fixa para cobrir).
- ⚠️ Em tela sem entalhe `env()` vale 0 e nada muda — verificado no desktop:
  barra em 64px, `padding-top: 0`, `top: 0` ao rolar.
- ⚠️ **`login.css` está no precache do `sw.js`** (`STATIC_ASSETS`): mexer nele
  exige bump do `CACHE_NAME`, senão o PWA instalado segue servindo a versão
  antiga. Foi para `telemetria-v45`.
- ⚠️ **Não foi verificado em iPhone** — não há aparelho iOS neste ambiente.
- O **admin** tinha a mesma falha e foi corrigido no mesmo dia (`.mob-topbar` e `.drawer-head`). O mecanismo, que vale para as quatro
  superfícies instaláveis, está em [`../arquitetura.md`](../arquitetura.md).

## ⚠️ Este painel não carrega o `admin.css`

**A mudança mais importante deste módulo, feita em 2026-08-13 e mantida na v3.**
Até então `cliente.html` carregava `admin.css` (265 KB do Mission Control).

Consequências que isso teve, e que não devem voltar:

- Toda evolução do painel **admin** caía no painel do cliente sem ninguém
  pedir. O salto de `?v=159` para `?v=189`, em agosto, entregou 30 versões de
  mudanças ao síndico sem revisão.
- O cliente herdava a **arquitetura de informação** do admin. O admin tem
  *Dashboard* **e** *Telemetria* porque olha N condomínios; o cliente tem
  **um**.
- Herdava a **linguagem de sala de controle**: âmbar `#f0b014` (que não é a cor
  institucional — ver [`../../PRODUCT.md`](../../PRODUCT.md)), selo "LIVE",
  tabelas de 5 colunas com "Severidade" e "Aberto há", rótulo de KPI a 9px no
  mobile. O leitor é leigo e com frequência mais velho.

Hoje `cliente.css` é **folha autônoma** no sistema visual **"Chapa"** — o mesmo
da landing (`/`) e do login (`/login`), **em volume mais baixo**: a landing é
peça de venda e pode ser alta; este painel é onde o síndico vem se acalmar.
Ver [`../../DESIGN.md`](../../DESIGN.md).

> **Não reintroduzir `admin.css` aqui, nem tokens dele.** O admin é ferramenta
> de operação interna; este painel é a continuação da página que vendeu o
> serviço.

⚠️ A **ponte de tokens** da v1 (`--muted`/`--text`/`--accent` redefinidos para
valores Chapa porque o JS escrevia `style="color:var(--muted)"`) **não existe
mais** — o `cliente.js` foi reescrito e não usa mais nenhum token do admin.

---

## A estrutura

```
<header class="barra">        a MESMA barra da landing: .marca (logo) · .conta
<main class="folha">
  <section class="resposta">  ← a primeira tela inteira
    .eng                        engrenagem marinho sobre marinho, sangra p/ margem
    .placa                      o INSTRUMENTO (mesma peça da landing)
      .placa-topo                 cabeçalho: o nome do prédio, + sulco gravado
      .placa-cel (texto)          .frase · .apoio · .linha-atend · .ajuda · .desde
      .placa-cel (prova)          .prova (tubo + leituras) · .resto — vira .oferta no semtel
  <section class="historia">  ← o que aconteceu
    .dia-bloco                  trilho de datas (numeral grande, sticky) + .ev
    .relatorio                  o PDF
<footer class="rodape">       "Prefere falar com a gente?" + telefone/WhatsApp/e-mail
+ 5 .ficha-fundo              os diálogos, montados pelo cliente.js
```

### A resposta

É **o instrumento da landing**, não um card: mesma placa chanfrada, mesmo
interior em `linear-gradient(168deg, --mar-700, --mar-900)`, mesma aresta de
1,5px, mesmo corte gravado (`--rasgo` + `--luz`, **duas linhas, nunca uma**)
separando o texto da prova. O que muda é o volume: chanfro de 16px em vez de
20px e **sem o anel de estado**. É deliberado — o síndico reconhece a peça que
viu antes de contratar. Se mexer aqui, olhar `.instr` em `public/landing.css`.

**O veredito** (`veredito()` em `cliente.js`) decide em cinco ramos, nesta
prioridade:

| Ramo | Quando | Frase |
|---|---|---|
| `semtel` | sem reservatórios | "Ainda não medimos o seu prédio." |
| `critico` | algum < 20% | "A **Caixa Superior** está em 12%." (em vermelho) |
| `mudo` | algum offline / sem leitura | "Um sensor parou de responder." |
| `baixo` | algum < 45% | "A **Caixa Superior** está em 38%." (em âmbar) |
| `ok` / `atendimento` | resto | "Seu prédio está abastecido." |

⚠️ **A frase do dia normal está FECHADA.** Não reabrir frase a frase: se
mudar, muda por **mudança de produto** (um ramo novo), não por preferência de
redação. Ela nomeia algo concreto do prédio, como as outras quatro.

⚠️ **Nenhuma frase pode afirmar mais do que o dado sustenta.** "Parou de enviar
leitura" **não** é "está sem água", e essa distinção é literalmente o produto.
No ramo `mudo` a frase **não** promete que alguém está indo cuidar daquele
sensor — o técnico designado quase sempre está num chamado de outro
reservatório.

**A linha de atendimento** (`.linha-atend`) é a correção do defeito que o ramo
"normal" escondia: antes, chamado aberto **não tirava de "Tudo normal"**, e o
atendimento em curso ficava rebaixado a texto de apoio. Ela aparece em **todo**
estado com chamado aberto — crítico, baixo e mudo também afirmavam em prosa que
o chamado tinha sido aberto e não davam objeto nenhum para tocar.

- ⚠️ **O ponto é azul (`--crista`), não âmbar.** Âmbar neste sistema significa
  *atenção*, e chamado em curso não é alarme — o painel já errou isso uma vez
  pintando "Em atendimento" de vermelho.
- ⚠️ **Ela cita o TÍTULO do chamado**, em `<small>` na segunda linha. Sem o
  título, num prédio com sensor mudo e um chamado aberto sobre outra coisa,
  "Marcos está atendendo" seria lido como "alguém já está cuidando do sensor".
  Emendado numa frase corrida, porém, o título fazia a caixa quebrar em 3–4
  linhas no celular e gastava 127px em cima do botão — daí as duas linhas.

### ⚠️ No celular a AÇÃO sobe

Empilhada, a coluna de texto é uma pilha, e tudo que vem antes empurra a única
ação do painel para baixo. **Medido a 390px, antes da correção:** "Preciso de
ajuda" começava a **787px** no estado sem sinal e a **729px** no de atenção —
abaixo da dobra justamente nos estados em que o síndico está aflito, num painel
cuja tese é *"a primeira tela é a resposta, com UMA ação"*.

A correção tem três partes, e nenhuma mexe na direção aprovada:

1. **`order` na quebra de 820px:** a `.rodape-resposta` (ação + "última
   leitura") vai para `order: 1` e a `.linha-atend` para `order: 2`. A linha de
   atendimento responde a **2ª** pergunta do público ("alguém está
   resolvendo?"), não a 1ª, e continua na primeira tela, logo acima da prova.
   **No desktop a ordem do DOM vale** — lá as duas colunas têm espaço de sobra.
2. **O apoio encurtou**, e a nota "nossa equipe é avisada automaticamente" só
   entra **quando não há chamado aberto**: havendo, a linha de atendimento já
   diz quem está cuidando, e repetir custava duas linhas em cima do botão.
3. **A linha de atendimento virou duas linhas** (título + `<small>`).

Resultado medido a 390px — a base do botão em cada estado:

| Estado | Antes | Depois |
|---|---|---|
| dia calmo | 522 | 462 |
| normal + atendimento | 672 | 462 |
| atenção <45% | 729 | 462 |
| crítico <20% | 700 | 434 |
| sem sinal | 787 | 491 |
| sem telemetria | 579 | 564 |

A 320px o pior caso fica em 569px. ⚠️ **Se alguém acrescentar qualquer coisa
acima da ação, refazer esta medição** — é a garantia de que a tese do painel
sobrevive no aparelho prioritário.

### ⚠️ No celular a COLUNA DEITA (a partir de 17/08)

Abaixo de **820px** o tubo vira uma barra de **100% × 132px** — os mesmos
valores do `landing.css`, onde o tratamento existe desde 14/08 (lá o ponto é
760px, aqui é 820, que é onde este painel vira celular). As leituras saem da
coluna ao lado e viram **fileira embaixo** (`repeat(auto-fit, minmax(126px,
1fr))`, o `.instr-leituras` de lá). Em pé e estreita, a peça desperdiçava a
largura da tela e gastava altura que o painel não tem no celular.

⚠️ **Deitada, todo eixo do desenho troca**, e cada regra tem par no
`landing.css` — mudou lá, muda aqui:

| | Em pé | Deitada |
|---|---|---|
| lâmina | `translateY(100% - --n)` | `translateX(--n - 100%)` |
| crista | borda de cima | borda da direita |
| faixas | `bottom` / `height` | `left` / `width` |
| limiar | `border-top` | `border-left` |

⚠️ **A água não vira vinho no crítico**, ao contrário da landing: "a água é
sempre azul" vale nos dois eixos, e quem sinaliza estado é a crista. O
gradiente inverte para `to left`, senão o tom claro fica na ponta errada.

A faixa de **821–1000px** (placa empilhada, tubo ainda em pé) ficou como
estava — é banda estreita: o iPad retrato tem 768 e cai no deitado, o paisagem
tem 1024 e cai nas duas colunas.

### A prova são TRÊS colunas, no máximo

Tenha o prédio 3 ou 30 reservatórios. Onze tubos lado a lado **voltam a ser um
gráfico de barras** — o vício que derrubou a v1 —, e o síndico não audita onze
números: ele quer saber se algum é problema.

- Se algum está **fora do normal**, a prova são **esses**, e só eles.
- Se está tudo normal, aparecem os **três mais baixos** — os únicos que podem
  virar problema.
- O resto vira uma frase honesta com a faixa real ("Mais 8 reservatórios, todos
  entre 77% e 93% — ver todos"), que abre a ficha com a lista completa.
- Na ficha a leitura é **barra horizontal, não tubo**: ali não é prova, é
  inventário, e inventário se varre de cima para baixo.

⚠️ `.colunas` é `justify-content:center` — com um tubo só ele ficava órfão,
encostado na esquerda de uma célula larga.

### O desenho do reservatório: cilindro no desktop, coluna no celular

Escolha do Pedro em 14/08, vendo o estudo lado a lado em
[`../comps/reservatorio-estudo.html`](../comps/reservatorio-estudo.html). A
elipse da superfície dá ao nível uma linha grossa e inclinada, e o anel âmbar
ou vermelho é muito mais visível que o fio de 2px da coluna chata.

- **Reproporcionado** do `_telTanqueSVG` do admin: lá o corpo é 62×94 (razão
  .66, atarracado como caixa d'água real) e três deles comiam a célula inteira.
  Aqui é **50×94** (razão .5).
- ⚠️ **Nenhum limiar é desenhado dentro do tanque** — nem ticks, nem faixa
  preenchida, nem elipse tracejada. Faixa preenchida dá uma **borda reta
  atravessando um corpo curvo** (num cilindro, plano horizontal é elipse); e
  mesmo a elipse tracejada saiu, porque o limiar já está dito **três vezes** na
  mesma tela — número colorido, anel da superfície e a frase. Régua que ninguém
  mede é ruído, e ruído na primeira tela derrubou a v1. **O limiar vive na
  linha de 45% do gráfico da ficha do reservatório**, que é o contexto de
  análise.
- **No baixo a água é azul; no crítico, vinho.** Abaixo de 45% mudam o
  **número**, a **palavra** e a **crista** — não a substância: água amarela
  era imagem estranha, e abaixo de 45% a bomba costuma repor sozinha, então
  pintar a lâmina transformaria rotina em alarme. Abaixo de 20% a lâmina
  escurece para `#7a1e2c → #4a1220`, os mesmos dois valores do `.coluna-agua`
  da landing.
  ⚠️ **Isto reverte a regra "a água é sempre azul"**, que valeu de 14/08 a
  17/08. Reaberto e liberado pelo Pedro em 17/08, vendo a peça deitada ao lado
  da landing — que sempre teve o vinho. Não é descuido de quem escreveu:
  é decisão trocada, com o painel voltando a ser a mesma peça dos dois lados.
- **Offline não desenha lâmina:** hachura. "Não sei" é diferente de "está
  vazio", e essa diferença é o produto.
  ⚠️ E a hachura tem de **aparecer**: ela nasceu `#08133f` sobre `--mar-900`
  (1,1:1) e era invisível — o único gesto que carrega o sentido do estado era o
  único que não se via. Hoje é `--sobre-2` a 20% (1,43:1), no mesmo −45° da
  fita de segurança. Textura, não texto: o alvo aqui não é 4,5:1.
  ⚠️ **Nada de crista e nada de nível fantasma no tubo mudo.** Uma linha
  horizontal ali é lida como nível, e a API traz sim a última leitura conhecida
  — mostrá-la esbarraria na mesma decisão de 14/08 que tirou faixa e elipse.
- **O selo de sem sinal** (`ICO_SEM_SINAL` + `.selo-mudo`): chapa chanfrada de
  44px carimbada no meio do tubo, com o **`wifi-off` do Lucide** dentro. É o
  que dá leitura imediata a quem nunca viu a peça — e é literal, porque o
  ESP32 fala por wi-fi e o que parou foi o rádio dele, não a água.
  ⚠️ **Geometria da biblioteca, não desenhada à mão**, depois de dois desenhos
  meus falharem: (a) três barras cortadas — barras sobem, o corte precisa
  descer, e descendo **nenhuma reta cruza as três**, sobram tocos; (b)
  triângulo cheio com uma vala — o corte de 45° cai no eixo de simetria e o
  parte em gravata-borboleta. O Lucide desenha os arcos **já interrompidos**
  onde o corte passa; **não fechar esses vãos**, são eles que deixam o corte
  limpo.
  ⚠️ `stroke-linecap: square` não é estética: `M12 20h.01` é subcaminho de
  comprimento zero e com `butt` não é desenhado — o ponto some sem erro.
  Um selo centralizado não tem altura que se confunda com nível — por isso ele
  passa onde a régua de limiar não passou.
- **No mudo a segunda leitura mede TEMPO.** Todo estado tem duas (Nível +
  Bomba); sem leitura não há bomba a reportar, e a coluna colapsava para um
  traço solto. Entra `SEM RESPOSTA HÁ / 3h` (`semSinalHa()`), no tratamento do
  nível — mono grande + unidade pequena. É o único número honesto que sobra: o
  nível não se sabe, mas há quanto tempo não se sabe, sabe-se. Com essa
  leitura no lugar, a linha `desde` ao lado do botão some — **exceto com 2+
  sensores mudos**, quando ela volta a ser a única que fala do conjunto.
- **A boca é só contorno.** Com preenchimento (como no admin) ela tampava a
  superfície da água no tanque cheio.
- **A lâmina desce por `transform` num `<g>`**, não animando geometria — a
  elipse da superfície desce junto sem deformar. As `defs` (gradiente de corpo,
  de água, hachura de mudo e a área do gráfico) são **compartilhadas na
  página**, no `<svg>` oculto do topo do `cliente.html`.
- ⚠️ **`requestAnimationFrame` não dispara em aba invisível.** Se o nível
  dependesse só dele, quem abrisse o painel numa aba de fundo veria os tanques
  **vazios**. O rAF é o gatilho da animação, nunca a fonte do dado — um
  `setTimeout` de 80ms escreve o mesmo valor. Vale como regra geral: nada de
  correção de dado pendurada em quadro de animação.
- ⚠️ **Sem telemetria NÃO desenha tanque nenhum, e a prova vira a OFERTA**
  (17/08). O estado passou por quatro formas no mesmo dia, e o histórico é a
  documentação:
  1. três tubos em contorno · 2. um tubo só · 3. nenhuma célula de prova ·
  4. **a célula não some: ela troca o que prova.**
  Os tubos caíram porque contorno vazio afirma "seus reservatórios estão
  secos" — falso, e aqui **o backend não conhece reservatório nenhum**: não há
  tanque para desenhar, nem cheio nem vazio. Cortar de três para um tratou a
  quantidade, não a forma. Tirar a célula inteira deixou um buraco, e o que
  eu pus nele (placa de 720px + engrenagem grande) o Pedro reprovou.
  A forma 4 é escolha dele entre quatro caminhos lado a lado: este é o único
  estado em que o produto ainda não foi entregue, então a prova é **o que o
  sensor passaria a mostrar** (`.oferta`: rótulo mono + três linhas separadas
  pelo sulco gravado).
  ⚠️ **Nenhum número, nenhum tanque, nenhuma leitura de exemplo** — valor
  inventado no painel de um cliente é o pior erro possível aqui.
  ⚠️ **O amarelo troca de botão** neste estado: "Quero monitorar meu prédio"
  fica âmbar e "Preciso de ajuda" vira contorno. Continua um amarelo por tela.
  O **DOM troca junto**, senão a ordem de tabulação não bate com a visual.
  ⚠️ **Sem numeração 01/02/03**: os três itens são paralelos, não uma
  sequência, e em âmbar seriam o segundo amarelo da tela.

### A ficha "Sua conta" deixou de existir (25/08/2026)

A barra do topo tem hoje **três coisas**: a marca, o ícone de Orçamentos (com o
selo de pendência) e, à direita, o **nome de quem está logado** seguido do
**Sair**.

A ficha hospedava quatro itens e três perderam a função no mesmo dia:

| Item | Destino |
|---|---|
| "Meus orçamentos" | virou **ícone permanente na barra** — é onde sempre devia ter estado |
| "Trocar a senha" | **removido**: o cliente não tem mais senha, entra por e-mail + código |
| e-mail da conta | saiu junto; quem precisa conferir o endereço fala com o escritório |
| "Sair da conta" | **virou botão na barra** |

⚠️ O formulário de senha não era só redundante: para um síndico criado do jeito
novo ele seria uma **porta para lugar nenhum**, porque a "senha atual" dele é o
hash aleatório que ninguém conhece.

⚠️ **O nome do síndico é `<span>`, não botão.** Um alvo que não leva a lugar
nenhum ensina a pessoa a duvidar dos outros alvos da barra. Ele some no celular
junto com os rótulos (`.barra-eu { display: none }` abaixo de 760px): lá a
barra é só ícone, e o nome não é o que o síndico precisa ler no aparelho dele.

⚠️ **`POST /cliente/trocar-senha` continua de pé no backend, sem chamador** —
saiu a interface, não o dado. Mesmo tratamento dado a
`/admin/me/email-template` quando o corpo do e-mail virou fixo. Saíram do
front: `#fConta` inteira, `prepararConta()`, a chave `conta` do mapa `FICHAS` e
a classe `.conta-link` do CSS.

⚠️ **No celular, o Sair ocupa a posição onde antes ficava o ícone de conta.**
Quem tinha o gesto decorado vai sair sem querer uma vez. O custo é baixo (pedir
outro código leva segundos), mas se virar reclamação, a correção é uma
confirmação inline no próprio botão — não um modal.

### O rodapé não repete a marca (25/08/2026)

⚠️ **O lockup completo saiu do rodapé, e o motivo é estrutural.** Ele estava
ali como "a única aparição do lockup com a assinatura" — argumento que valia se
a barra do topo rolasse junto com a página. **Ela é fixa:** ao chegar no
rodapé, a pessoa via o wordmark em cima e o lockup embaixo ao mesmo tempo, duas
marcas competindo e nenhuma liderando. Foi o relato do Pedro.

O rodapé do painel não fecha uma peça de venda como o da landing — ele devolve
o **canal humano**. Então é isso que lidera agora:

| Faixa | Conteúdo |
|---|---|
| `.rodape-in` | `.rodape-chamada` ("Prefere falar com a gente?") + os três canais |
| `.rodape-fim` | contexto da tela · **assinatura em texto** · ano |

- A chamada é **secundária** (`--sobre-2`, peso 700): quem lidera é o número,
  não a pergunta. Em branco e 800 os dois pesavam igual e o olho não sabia por
  onde começar.
- A pergunta ocupa a âncora esquerda que era do logo — sem ela, o
  `space-between` deixaria os canais colados numa borda e um buraco na outra.
- Ela também **distingue este caminho do "Preciso de ajuda"**, que abre chamado
  dentro do sistema; aqui é falar com gente.
- A marca continua no rodapé, como **assinatura em texto** na `.rodape-fim` —
  que é o que uma assinatura de rodapé precisa ser. No celular ela desce para a
  própria linha (`order: 3`).

Se um dia a barra deixar de ser fixa, a decisão pode ser reaberta; enquanto ela
for, não. **A landing (`index.html`) mantém o lockup no rodapé** — lá ele fecha
o argumento de venda, e a página é outra.

### A história

Material **real**, sem inventar nada: os alertas abertos (que trazem
`criado_em`) e o ciclo completo dos chamados (aberto → técnico designado →
concluído → O.S. finalizada), agrupados por dia, no máximo 40 eventos.

O contraste da metade de baixo vem de **tipografia, não de cor**: a data é
numeral estampado (Archivo 800) num trilho à esquerda, grudento enquanto os
eventos do dia rolam. ⚠️ O numeral é **Archivo e não mono** — mono aqui é só
medição e etiqueta gravada.

Clicar num evento de chamado abre a ficha dele; clicar num evento de alerta
abre a **ficha do reservatório** de que o alerta fala.

⚠️ **Alerta resolvido não entra na história.** `/cliente/status` devolve
**apenas** os alertas abertos, então o alerta abre e nunca fecha. Preferimos o
buraco honesto ao evento fabricado. Se um dia o endpoint devolver os resolvidos
(`alertas_recentes`), é em `montarEventos()` que eles entram — é aditivo e não
exige rota nova, logo **não mexe no `sw.js`**.

### As fichas

Toda ficha é **placa clara** (`--chapa` + `--tinta`) pousada sobre o marinho.
O painel em repouso é marinho do topo ao rodapé — **nenhuma seção clara dentro
do scroll**, porque isso parte a página em dois sites. O contraste acontece no
momento em que ele **age**; a tela de descanso continua descansando.

| Ficha | O que hospeda | Endpoint |
|---|---|---|
| `#fAjuda` | 7 categorias como placas grandes + descrição | `POST /cliente/chamados` |
| `#fChamado` | passos, conversa, compositor, avaliação | `GET/POST .../mensagens`, `.../avaliar` |
| `#fTodos` | inventário completo (e escolha do PDF) | — |
| `#fReservatorio` | gráfico com períodos + PDF do device | `GET /cliente/historico`, `/relatorio/pdf` |
| `#fConta` | e-mail, troca de senha, sair | `POST /cliente/trocar-senha` |

- ⚠️ **Uma ficha por vez, com pilha de UM nível.** "Ver todos" → tocar um
  reservatório empilhava dois diálogos, e o X fechava os dois: o síndico
  voltava ao painel em vez da lista. A ficha de origem é lembrada e o X devolve
  para ela. Modal sobre modal era o vício do admin.
- ⚠️ **Dentro da ficha o âmbar nunca é texto nem ícone.** Anel de foco vira
  `--tinta`; a estrela cheia é **preenchimento âmbar com contorno de tinta**
  (forma, não tinta); a linha de limiar do gráfico e seu rótulo usam
  `--atencao-t`.
- **A avaliação mora no pé da ficha do chamado**, quando ele está fechado e não
  avaliado. Sem segundo modal.
- **O compositor só existe com o chamado aberto** — é o que o backend aceita.
  O chamado fechado diz por que não dá para responder e aponta para um novo
  pedido.

---

## O PDF e o `device_id`

⚠️ **`GET /relatorio/pdf` exige `device_id`** — não existe relatório "do
prédio". Por isso:

- O botão da **história** baixa direto quando o prédio tem **um**
  reservatório; com dois ou mais, abre `#fTodos` em modo `pdf` para o síndico
  escolher (últimos 30 dias).
- O botão da **ficha do reservatório** usa o `device_id` daquela ficha e o
  período selecionado ali.
- No estado **sem telemetria** o bloco do PDF some.

## A segunda página: orçamentos

`/cliente/painel/orcamentos?orc=N` — `public/cliente-orcamentos.{html,js}`.
Mesma `cliente.css`, mesma sessão, mesma barra e mesmo rodapé: é a segunda
página do mesmo produto, não um lugar novo. Quem chega aqui muitas vezes chega
**pelo link de um e-mail**, sem sessão aberta, no celular.

⚠️ **A página é `/cliente/painel/orcamentos`, a API é `/cliente/orcamentos`.**
Não são o mesmo path por necessidade: as rotas de página em `src/app.js` são
registradas **antes** do `app.use("/cliente", clienteRouter)`. Uma página em
`/cliente/orcamentos` sombrearia o `GET` da API e o fetch da lista receberia
HTML — o `Unexpected token '<'` do `CLAUDE.md`. Convenção: **página é nome de
tela, API é nome de recurso.**

### A entrada acontece na própria página (25/08/2026)

⚠️ **Esta página NÃO redireciona para `/login`.** Até 25/08 ela fazia
`window.location = "/login?next=…"` quando não havia token. Funcionava, mas
trocava o documento que a pessoa veio ver por um formulário em outra página —
e quem chega aqui vem de um link de e-mail sobre **um** orçamento, quase sempre
sem sessão. Agora o login abre **por cima**, no cartão `#entradaFundo`
(`.ficha-fundo` + `.ficha` reusadas do painel): a URL com `?orc=N` continua na
barra, e fechar o cartão já é estar no documento.

⚠️ **E o síndico não tem senha** (25/08/2026): o cartão pede o **e-mail**,
manda um código de 6 dígitos e o segundo passo é o `POST /auth/verify-otp` de
sempre. Quem cria o acesso é o escritório, no admin, com o e-mail do síndico —
o e-mail passa a ser a credencial. O porquê está em
[autenticacao.md](autenticacao.md); em resumo, em produção o código já era
exigido em todo login, então a senha não protegia nada e só somava trabalho
para o escritório e esquecimento para o cliente.

No aparelho já marcado como confiável, o `POST /auth/codigo` devolve a sessão
direto e o cartão nem chega a pedir o código.

Três coisas que o cartão resolve e o redirect não resolvia:

- **401 no meio do caminho** (sessão expirada ao abrir o documento ou ao
  responder) reabre o cartão em vez de trocar de página. Quem acabou de
  decidir "aprovo" não perde o documento nem a URL.
- **Conta errada.** Login de `admin` passa no `/auth/login` mas leva 403 em
  todo `/cliente/*`. O cartão checa `user.role` e diz isso, em vez de deixar a
  tela vazia com "não conseguimos carregar".
- **Quem nunca teve senha.** O link do e-mail pode chegar a síndico novo ou
  ser encaminhado. O rodapé do cartão oferece WhatsApp e telefone — sem isso a
  pessoa fica presa num formulário que não tem como preencher.

⚠️ **Rede de segurança em `src/app.js`:** `GET /cliente/orcamentos` aberta no
**navegador** (Accept com `text/html`, que `fetch` nunca manda — ele manda
`*/*`) redireciona 302 para `/cliente/painel/orcamentos`, preservando a query.
Sem isso, a URL sem o `/painel` responde `{"error":"Token ausente"}` em JSON
cru — que foi o que apareceu para o Pedro no primeiro teste do link.

⚠️ **Nada aqui pode ser `<a href>` para rota autenticada.** O `authRequired`
lê **só** o header `Authorization: Bearer`; este sistema não tem cookie de
sessão. Foi exatamente assim que o botão "Abrir o PDF" nasceu quebrado — ele
abria uma aba com `{"error":"Token ausente"}` para todo cliente, toda vez.
Agora é `<button>` → `baixarPdf()`: `fetch` com `authHeaders()`, blob, âncora
com `download`. Mesmo caminho do `baixarPDF` desta pasta.

⚠️ **Download, não aba nova.** `window.open` depois de um `await` cai no
bloqueador de pop-up do celular — que é justamente onde o link do e-mail é
aberto.

⚠️ **Lista e documento são a mesma página** (`history.pushState`), não modal.
Assim o voltar do navegador sai do documento em vez de sair do sistema, e o
mesmo link reabre o mesmo orçamento. O porquê da recusa da v1 em modais está em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

**O que o cliente vê e o que não vê:** só `enviado`, `aprovado` e `rejeitado`,
e só do condomínio dele. **Rascunho responde 404, não 403** — um 403
confirmaria que existe orçamento em preparo, informação que ele não deve ter.
Responder só é aceito em `enviado`, o que barra de uma vez o rascunho e o
segundo clique que viraria a resposta anterior.

**Estado atual (25/08/2026):** no ar e **é o caminho padrão do orçamento**. O
convite no e-mail passou a sair **ligado** — `ORCAMENTO_LINK_PAINEL` virou
kill-switch (`=0` volta ao formato antigo), e o link é montado com `APP_URL`,
`PUBLIC_BASE_URL` ou o próprio request, nessa ordem. Junto veio a regra de que
**e-mail com link não leva o PDF anexado**: o documento mora aqui, e é aqui que
a resposta é registrada. Quem não tem login (avulso de pessoa física,
condomínio sem usuário `cliente`) continua recebendo o PDF em anexo. A
migration 074 **foi aplicada em produção em 24/08**, então as quatro rotas têm
as colunas de que precisam. Ver
[`../../memory-bank/active-work.md`](../../memory-bank/active-work.md) e
[`mapa-geocoding.md`](mapa-geocoding.md) para o resto da sessão.

---
## O gráfico é SVG, não ApexCharts

`cliente.html` **não carrega mais** `apexcharts.min.js` (nem `chart.umd.min.js`,
que já tinha saído): o gráfico da ficha do reservatório são ~8 linhas de `path`
desenhadas em `graficoSVG()`. ~200 KB a menos por carga. O custo é o tooltip
interativo, que a comp não previa — quem dá o valor de agora é a `.estado-linha`
no topo da ficha.

⚠️ **O rótulo "45% — LIMIAR" é HTML posicionado por cima, não `<text>` dentro
do SVG**: dentro do `viewBox` ele encolhe junto com o gráfico e vira borrão a
390px. E **malha e limiar são desenhados DEPOIS da área**, senão ela os cobre.

---

## Pegadinhas do CSS

- ⚠️ **`overflow-x: clip` só no `body` não segura.** A engrenagem sangra para a
  margem da página de propósito, e a página rolava de lado em **toda** largura
  de telefone — 42px a 320, 59px a 390, 87px a 540 (medido). O corte precisa
  estar em **`html` e `body`**. E precisa ser `clip`, nunca `hidden`: `hidden`
  transforma o elemento em contêiner de rolagem e quebra o `position: sticky`
  da barra e do trilho de datas.
  ⚠️ **A comp tinha o mesmo defeito** e foi corrigida junto em 14/08 — foi
  arrastando a comp para o lado no celular que o Pedro pegou o problema. Se
  alguém criar uma comp nova a partir dela, o corte já vai junto.
- ⚠️ **A primeira tela tem TETO, não só `100dvh`.** `min-height:
  min(calc(100dvh - var(--barra-h)), 46rem)`. Sem o teto, a placa (altura de
  conteúdo, 589px) boiava dentro de uma seção com a altura da janela e a banda
  morta crescia 1:1 com o monitor — 67/79px numa tela de 809px, 137/149px numa
  de 949px. Em troca, em tela alta o começo da história aparece abaixo da fita.
- ⚠️ **Célula curta da placa = vazio simétrico.** Em duas colunas as células
  têm a mesma altura (grade) e centram o conteúdo, então toda diferença entre
  elas vira vazio dividido em dois. A pior é a do estado **sem telemetria**
  (bloco de 299px contra 465 de texto), e é por isso que o tubo em contorno vai
  a **105×344** acima de 1000px — proporção da peça escalada, nunca esticada.
  Alinhar ao topo não resolve: só empurra o mesmo vazio todo para baixo (foi o
  que se fez antes de 14/08).
- ⚠️ **`container-type: inline-size` aplica CONTENÇÃO.** Ele existe só na
  célula de **texto** da placa, para a frase se dimensionar por `cqi`. Posto
  também na célula da prova, ele fez ela ignorar o próprio conteúdo no cálculo
  de largura intrínseca: o `max-content` virou zero, a coluna colapsou para
  88px e os cilindros ficaram com 43px.
- ⚠️ **Trilha de grade da prova: nem `minmax(0,auto)` nem `auto`.** A primeira
  encolhe abaixo do conteúdo e corta os cilindros; a segunda é pior — ao lado
  de um `1fr`, a trilha `auto` colapsa para o **mínimo**. É `max-content`.
- ⚠️ **`flex: 1 1 0` não funciona com o `<svg>` de largura 100%.** O SVG não
  contribui largura intrínseca nenhuma, então a base precisa ser **explícita**
  (`flex: 1 1 124px`) — é ela que informa a grade quanto a prova precisa.
- ⚠️ **A frase é dimensionada por `cqi`, não por `vw`.** "abastecido." tem
  ~6,8em e não quebra: por `vw`, a palavra vazava da célula e atravessava o
  corte gravado sempre que a coluna de texto encolhia.
- **Nada de faixa de cor de 3px na borda de card.** É o tell mais reconhecível
  de interface gerada por IA e não pertence ao vocabulário Chapa — aqui
  profundidade é aresta e corte.
- **Sobre placa clara nenhum sinal saturado passa como texto.** Por isso as
  duas famílias de estado: `--risco/--atencao/--normal` (sobre marinho) e
  `--risco-t/--atencao-t/--normal-t` (tinta sobre placa clara).
- ⚠️ **`place-items: stretch` sozinho não segura a ficha no celular.** A linha
  do grid dimensiona pelo conteúdo, e a ficha ficava com 1013px num viewport de
  744, transbordando em vez de rolar por dentro. A linha precisa de
  `grid-template-rows: minmax(0, 1fr)`.
- ⚠️ **A ficha usa `100svh`, não `100%`.** No Chrome Android o `inset: 0`
  resolve contra o viewport **grande**, e o pé da ficha — onde ficam "Enviar
  pedido" e "Salvar nova senha" — fica atrás da barra do navegador.
- **O corpo não encolhe no mobile.** As quebras são estruturais (a placa
  empilha, o cilindro vira coluna, o trilho de datas deita, a ficha vira tela
  cheia). As **etiquetas gravadas sobem** para `.66rem` no celular: a `.58rem`
  elas saem a 9,3px, e o menor texto no aparelho em que o síndico mais lê era o
  defeito exato do painel antigo.
- **A barra é a MESMA da landing**, e desde 14/08 isso é literal: os tokens
  têm os mesmos nomes e os mesmos valores (`--barra-h`, `--area-max`,
  `--gut`, `--saida`), e as duas páginas trocam de escala na mesma quebra de
  760px. Mudou aqui? Mude em `landing.css` e `login.css` também.
  - ⚠️ **A altura é DECLARADA (`height: var(--barra-h)`), não derivada de
    padding.** Ela já foi `17 + logo + 17`, que dava 74px por acidente:
    bastava um elemento crescer dentro dela para a barra sair do número
    documentado — foi assim que chegou a 85px uma vez.
  - **Números do sistema, e eles mandam:** logo 40px na barra (32px abaixo de
    760px); barra de 74px no desktop e 64px no celular. Se a marca parecer
    pequena, a alavanca **não** é o logo. (Os 72px do lockup do rodapé saíram
    de cena em 25/08 — ver abaixo.)
- ⚠️ **O nome do prédio NÃO fica na barra.** Ele é o `.placa-topo`, o
  cabeçalho do instrumento. Na barra ele forçava uma segunda linha no celular
  (~107px contra os 64 documentados) e a única alternativa era truncá-lo com
  reticências — que é esconder justamente o que precisa ter peso. Fora da
  barra, ela volta a caber nos 64px **e a grudar no celular**, como a da
  landing. Ver `.placa-topo` em `public/cliente.css`.
  - ⚠️ Isso mudou o alvo da contenção: a célula de texto **não é mais
    `:first-child`** da placa. O seletor é `.placa-topo + .placa-cel`. Se
    voltar a `:first-child`, o `container-type: inline-size` cai na célula
    errada e a `.frase` perde a referência de dimensionamento.
- ⚠️ **A escada de marinho tem TRÊS degraus:** campo (`body`) `--mar-800`;
  superfície (barra e rodapé) `--mar-900`; placa em gradiente `700→900`. Baixar
  o campo para `--mar-900` faz barra e rodapé **sumirem** como superfície. Já
  aconteceu.

## Pegadinhas do JS

- ⚠️ **A prova não pode ser reconstruída a cada tick de 10s.** O `innerHTML`
  volta a lâmina para 0% e ela sobe de novo: o síndico veria os tanques
  esvaziando e enchendo sozinhos a cada dez segundos, o que num painel de nível
  de água é exatamente a leitura errada. `renderResposta()` compara uma
  assinatura (`device:estado:n`) e só redesenha quando algo mudou. A história
  faz o mesmo.
- ⚠️ **`ja_avaliado` só vem do detalhe do chamado**, não da lista. Para não
  disparar N requisições por tick, `lerAvaliacoes()` busca o detalhe dos **3
  chamados fechados mais recentes** uma vez e guarda em `_avaliado`. Na dúvida
  (erro na requisição) o convite **não** aparece.
- **Tempo relativo usa piso, não arredondamento.** Com `round`, uma leitura de
  40 segundos virava "há 1 min" — e o número que mais importa nesta tela é o
  que diz que a medição está viva agora.

---

## Cache

`cliente.css` e `cliente.js` são **network first** no `sw.js` (regra genérica
de `.css`/`.js`), e `/cliente` e `/relatorio` já estão na lista de prefixos
network-first — não foi preciso mexer no service worker. O `?v=N` no
`cliente.html` continua valendo (hoje `cliente.css?v=27`, `cliente.js?v=35`).
Racional completo em [`../../CLAUDE.md`](../../CLAUDE.md).

⚠️ O `cliente.html` **não carrega mais** `apexcharts.min.js`, `chart.umd.min.js`
nem `mob-sidebar.js`. A chave `predio` que o `mob-sidebar.js` ganhou para este
painel ficou **órfã** lá — é inofensiva (o admin não tem essa seção) e não vale
mexer num arquivo compartilhado só para removê-la.

---

## Ambiente de teste

`node server.js` sobe na 3001 contra `DATABASE_URL_TESTE`; `OTP_DISABLED=true`
faz o login pular o código. Dois clientes de demonstração, senha `demo1234` —
`demo-cliente@teste.local` (DEMO Residencial Aurora, 4 reservatórios) e
`demo-semtel@teste.local` (DEMO Edifício Sem Telemetria, nenhum). Nenhum dos
dois existe em produção.

⚠️ Os reservatórios do seed nascem todos com o mesmo `last_seen`, que envelhece
— **todos aparecem offline** e a tela vira quatro cards idênticos.
`node scripts/seed-cenario-telemetria.js` regrava 72h de histórico dando um
estado diferente a cada um (cheio · baixo com bomba enchendo · crítico ·
offline há 3h), com os alertas correspondentes abertos. É idempotente, recusa
rodar em produção e pode ser rodado quantas vezes precisar — inclusive porque
o `offline.job` derruba os "online" depois de `OFFLINE_MINUTES` (default 10)
com o servidor no ar. Detalhe em [`../changelog.md`](../changelog.md).

---

## O que ainda não foi verificado

- **Nada rodou contra o backend real.** A verificação foi num harness estático
  (os `cliente.html`/`cliente.css`/`cliente.js` reais com o `fetch` dublado),
  em contact sheet de 8 estados × 2 tamanhos (1920px e 390px), com geometria
  medida por `getBoundingClientRect`.
  ⚠️ **Não diagnosticar geometria por captura reduzida** — nesta reconstrução a
  captura "mostrou" a barra fora de posição e o rodapé com sobra, e as duas
  vezes a medição no DOM disse que estava correto.
- O fluxo de erro real (401/403, 503 do service worker offline) só foi
  exercitado pelo caminho do código, não contra o servidor.
- O caminho do cliente **sem telemetria contratada** foi visto renderizado no
  harness, mas não com um cliente real sem reservatórios.
