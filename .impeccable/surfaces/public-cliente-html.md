---
version: 1
slug: "public-cliente-html"
primary_target: "public/cliente.html"
related_targets: ["public/cliente.css","public/cliente.js"]
---

## Escopo e modo

Painel do síndico, `/cliente/painel` — `public/cliente.html` / `.css` / `.js`.
Modo **Operate**, mas de um tipo particular: o visitante não opera nada. Ele
chega para **se tranquilizar** e, de vez em quando, para **prestar contas**.

## Público e trabalho

Síndico de condomínio, quase sempre morador voluntário, com frequência mais
velho, sem formação técnica. Lê no navegador do **celular**. Tem **um** prédio
e 3–5 reservatórios. Três perguntas, nesta ordem de frequência:

1. "Tem água? Vai faltar?" — a visita de 5 segundos, que é a maioria delas.
2. "Alguém está resolvendo?" — quando já sabe que há problema.
3. "Preciso provar isso na assembleia." — raro, mas é onde o produto se paga.

Ação: pedir ajuda. Prova: a história do prédio + o PDF.

## Direção aprovada (13/08/2026) — "a resposta, não o painel"

A **primeira tela inteira é a resposta**, em uma frase que qualquer pessoa
entende sem legenda ("Tem água."), com os reservatórios ao lado como prova e
**uma** ação. Abaixo, **a história** escrita como um humano contaria ("Anderson
Luiz esteve no prédio"), onde cada linha abre a ficha do chamado. No fim, o PDF
com a frase que diz para que ele serve.

**Não existem seções.** Alertas e chamados deixaram de ser lugares para onde
navegar: o que acontece agora está na frase, o que já aconteceu está na
história, e o detalhe abre como ficha por cima.

Comp aprovada como norte: [`../comps/painel-cliente-v2.html`](../comps/painel-cliente-v2.html)
(três estados no andaime: tudo normal, nível baixo, sensor mudo).

**Momento memorável:** a tela que, no dia normal, diz duas palavras e cala.

## Restrições

- Mundo visual **"Chapa"** (marinho + `#fbb329` + chanfro de 45°), o mesmo da
  landing e do login — mas **em volume mais baixo**. A landing é peça de venda
  e pode ser alta; este painel é onde o síndico vem se acalmar. O amarelo
  aparece **uma vez por tela**.
- Corpo grande, alvo de toque grande, contraste alto — requisito de público,
  não refinamento.
- HTML/CSS/JS puro servido pelo Express. CSP `script-src 'self'`.
- Backend **não deve mudar** para viabilizar o desenho. A única mudança
  desejada é aditiva (`alertas_recentes` em `/cliente/status`).
- Nenhuma funcionalidade sai: histórico com períodos, PDF, abrir chamado,
  mensagens no chamado, avaliação e troca de senha precisam ter lugar.

## O que já foi recusado (não repetir)

- **Copiar a casca do admin.** Sidebar com colapso, topbar com avatar e botão
  de atualizar, fileira de cards de KPI, lista+detalhe com abas e busca,
  tabelas, badges em tudo. Foi a v1 desta reconstrução, rejeitada pelo Pedro em
  13/08: *"ficou parecido com o painel admin só que pior"*.
- **Trocar só o visual.** A v1 mudou o mundo e manteve a estrutura; o
  diagnóstico do Pedro foi que "o que mudou de fato é o visual, e ficou muito
  poluído".
- **Menu colapsável.** Três destinos não justificam um rail com toggle.

## Decisões fechadas em 14/08/2026

- **A água é sempre azul.** No nível baixo mudam o **número** e a **palavra**,
  não a substância — água amarela era imagem estranha. Decidido pelo Pedro.
  (A crista do tubo baixo também vira amarela, para amarrar o número ao tubo
  certo quando há três lado a lado; é o único acréscimo meu, e é vetável.)
- **"Tem água." saiu.** O Pedro preferiu as alternativas. **Ainda não está
  escolhido qual** — "Tudo normal." ou "Seu prédio está abastecido.";
  a comp v3 traz as duas numa chave do andaime. O argumento a favor da
  primeira é o momento memorável declarado acima: duas palavras.

## O desenho do reservatório: CILINDRO (fechado em 14/08)

Estudo lado a lado em [`../comps/reservatorio-estudo.html`](../comps/reservatorio-estudo.html)
com as mesmas três leituras (78 / 38 / 12) em três candidatos: coluna chata da
landing, cilindro do admin, coluna com escala. **O Pedro escolheu o cilindro.**

O que decidiu, vendo lado a lado: a **elipse da superfície** dá ao nível uma
linha grossa e inclinada, e o anel âmbar (38%) ou vermelho (12%) é muito mais
visível que o fio de 2px da coluna. O desenho não serve para cravar valor — o
número faz isso — serve para dizer *muito / pouco / crítico*, e nisso o
cilindro ganha. A coluna com escala foi descartada: os rótulos a 8px são
ilegíveis no celular e roubam largura de um elemento já estreito.

**O que mudou do `_telTanqueSVG` do admin para o painel:**

- **Reproporcionado.** O do admin é 62×94 (razão .66) — atarracado como caixa
  d'água real, e três deles comiam a célula inteira. No painel o corpo é
  **50×94 (razão .5)**: continua lendo como cilindro porque as elipses ficam,
  e três cabem a 390px (medido: 88×183px cada).
- ⚠️ **Nenhum limiar é desenhado dentro do tanque na primeira tela** — nem
  ticks 0/25/50/75/100, nem faixa preenchida, nem elipse tracejada. Duas
  tentativas caíram, e por motivos diferentes:
  - **Faixa preenchida** (herdada da coluna chata) foi o que o Pedro viu como
    *"fundo pintado de amarelo e vermelho"*. O problema não era a cor: um
    retângulo dá uma **borda reta atravessando um corpo curvo** e apaga o
    gradiente que faz a curvatura. Num cilindro, plano horizontal é **elipse**.
  - **Elipse tracejada** consertou a geometria e ainda assim saiu, porque o
    Pedro perguntou se era necessária e não era: o limiar já está dito **três
    vezes** na mesma tela — número colorido, anel da superfície e a frase
    ("abaixo de 20% tratamos como urgência"). Uma régua que ninguém mede é
    ruído, e ruído na primeira tela foi o que derrubou a v1.

  O limiar tem lugar: a linha de 45% no gráfico da **ficha do reservatório**,
  que é o contexto de análise.
- ⚠️ **`requestAnimationFrame` não dispara em aba invisível.** O nível da água
  dependia só dele; quem abrisse o painel em aba de fundo veria os tanques
  **vazios**. O rAF é o gatilho da animação, nunca a fonte do dado — o valor
  final também é escrito por um `setTimeout` de 80ms. Vale como regra: nada de
  correção de dado pendurada em quadro de animação.
- **A boca é só contorno.** Com preenchimento (como no admin) ela tampava a
  superfície da água no tanque cheio.
- **A lâmina desce por `transform` num `<g>`**, não animando geometria — a
  elipse da superfície desce junto sem deformar. As `defs` (gradiente de corpo,
  de água e a hachura de mudo) são **compartilhadas na página**, em vez de um
  id novo por instância como faz o admin.
- **Sem telemetria** vira o mesmo cilindro em contorno puro, sem parede.

**Cilindro no desktop, coluna no celular (Pedro, 14/08).** O cilindro precisa
de largura para a elipse funcionar; num telefone a coluna esbelta cabe melhor
e lê igual. Os dois markups são emitidos juntos e a media query decide qual
aparece — os dois nunca chegam ao mesmo leitor, então não há dialeto duplo.

⚠️ **Não diagnosticar geometria por screenshot de página inteira.** Nesta
sessão eu "vi" a água no lugar errado três vezes em capturas reduzidas, e as
três vezes o DOM mostrou que estava correta. Medir com
`getBoundingClientRect` ou ampliar a região; o JPEG reduzido mente sobre
posição de lâmina.

### A varredura que faltava (14/08)

O Pedro cobrou: *"você analisou todos os casos antes de me passar?"*. Não —
eu vinha consertando ponto a ponto e conferindo estreito, e passei coisa torta.
A varredura correta é **contact sheet**: N iframes na mesma página, um por
estado, com o andaime escondido, e uma captura só. Seis estados × dois
tamanhos em quatro capturas. Achou cinco defeitos que a conferência pontual
não pegaria:

1. **Coluna sem teto de largura no celular.** Com um só reservatório na prova
   ela esticava para 330px e virava um bloco listrado. Teto de 104px, e
   `data-n` no `.colunas` faz a prova **crescer quando é menor** (1 → 176px
   no desktop / 150px no celular; 2 → 140/124).
2. **Faixa de risco no sensor mudo.** Sem leitura não há limiar para comparar;
   a banda vermelha sobre a hachura sugeria um estado que não existe.
3. **Faixa de risco no bloco sem telemetria.** A regra que as escondia estava
   presa a `.res.mudo`, e aquele bloco não é `.res`.
4. **Células da placa alinhadas ao topo.** A de texto é sempre mais alta que a
   de prova, e a prova ficava pendurada com um vazio embaixo. As duas centram.
5. **Regressão da própria correção 4:** virando filho de flex column, o link
   "Quero monitorar meu prédio" esticou e o sublinhado atravessou a célula.
   `align-self: flex-start`.

Também: a linha do resto usa `text-decoration` e não `border-bottom` — quebrada
em duas linhas o border partia o traço no meio da frase.

### O corte na palavra "abastecido." e a largura da placa (14/08)

O Pedro mandou uma captura com o sulco gravado atravessando a palavra
"abastecido." e sugeriu **aproveitar as laterais vazias**. As duas coisas eram
o mesmo problema de dimensionamento, e destravá-lo custou três armadilhas de
CSS que valem registro:

1. **A frase era dimensionada por `vw`, não pela célula.** "abastecido." tem
   ~6,8em e não quebra; quando a coluna de texto ficava menor que a palavra,
   ela vazava e cruzava o corte. Agora é **`clamp(2rem, 13cqi, 4.4rem)`** —
   container query, o tamanho sai da largura da própria célula.
2. ⚠️ **`container-type: inline-size` aplica CONTENÇÃO.** Posto nas duas
   células, ele fez a célula da prova ignorar o próprio conteúdo no cálculo de
   largura intrínseca: o `max-content` virou zero, a coluna colapsou para 88px
   e os cilindros ficaram com 43px. Fica **só na célula de texto**, que é `1fr`
   e não depende da largura intrínseca.
3. ⚠️ **Trilha de grade: nem `minmax(0,auto)` nem `auto`.** A primeira encolhe
   abaixo do conteúdo e corta os cilindros; a segunda é pior — ao lado de um
   `1fr`, a trilha `auto` colapsa para o **mínimo**. É `max-content`.
4. ⚠️ **`flex: 1 1 0` não funciona com o `<svg>` de largura 100%.** O SVG não
   contribui largura intrínseca nenhuma, então a base precisa ser **explícita**
   (`flex: 1 1 124px`) — é ela que informa a grade quanto a prova precisa.

E a placa passou de **1080 para 1240px**, que é o `--area-max` da landing —
número do próprio sistema, não inventado. Abaixo de **1000px** a placa
**empilha**: nessa faixa ou a frase espreme ou a prova espreme, e empilhar
antes disso é melhor que arbitrar qual das duas perde.

Medido em 390 / 760 / 900 / 1050 / 1180 / 1440: tanques em 124px no desktop,
104 na faixa empilhada, 87 no celular; nenhum corte; a frase nunca vaza.

## Barra e rodapé (14/08) — construção da landing

O Pedro pediu **cabeçalho mais marcado e um rodapé**, "para quebrar o bloco",
inspirados na landing. Feito com o vocabulário de lá, não com invenção:

- **A barra saiu de dentro da coluna.** Era um `header` dentro da `.folha`;
  virou faixa de **largura inteira** com o conteúdo centrado na área — a
  construção `.barra` / `.barra-in` da landing. É `sticky`, nasce
  **transparente com blur** sobre o campo e ganha **fundo sólido + fio** ao
  rolar (`.is-rolada`, ativada por um listener de scroll). Marca sem pesar em
  repouso.
  ⚠️ No comp ela usa `top:94px` para folgar o andaime; **em produção é `top:0`**.
- **O rodapé fecha a página** com fio no topo e traz o **lockup completo**
  (`login-logo.png`, 72px) — a regra da landing de que a assinatura aparece
  **uma vez só**, em tamanho que a deixa legível. No painel o `logo-topo.png`
  (sem assinatura) fica na barra.
- **Contatos são os reais do `index.html`** — telefone, WhatsApp e e-mail.
  ⚠️ Não inventar número: a landing já teve um `wa.me` fabricado como bug.
- Um quarto item "Emergência" quebrava o grid numa segunda linha estreita; a
  instrução virou frase no parágrafo da empresa e os contatos ficaram em três
  colunas limpas.
- A `.historia` perdeu os 90px de respiro no fim: quem fecha a página agora é
  o rodapé.

### Passada de acabamento (14/08) — a escada de marinho tem TRÊS degraus

O Pedro: *"coisas como rodapé e cabeçalho ter a mesma cor do fundo incomodam"*.
A causa era minha: eu tinha baixado o campo da página para `--mar-900` para a
placa se destacar, e com isso **barra e rodapé — que são `--mar-900` — viraram
a cor do fundo** e sumiram como superfície.

A escada correta é a da landing, e tem três degraus:

| Degrau | Cor | Quem |
|---|---|---|
| Campo | `--mar-800` | o `body`, onde tudo pousa |
| Superfície | `--mar-900` | barra e rodapé |
| Placa | gradiente `--mar-700` → `--mar-900` | o instrumento |

⚠️ Não baixar o campo para `--mar-900` de novo: sempre que isso acontecer,
barra e rodapé desaparecem.

**Rodapé compactado a pedido dele.** Deixou de ser o rodapé da landing (grade
de duas colunas, lockup de 72px, parágrafo institucional) e virou **uma linha
só**: lockup a 52px à esquerda, três canais à direita, e um fio fino com a
assinatura e o ano. O rodapé da landing fecha uma peça de venda; o do painel
só devolve o telefone.

**Vãos apertados.** O ritmo estava em escala de peça de venda: 84px entre dias
na história (42 de cada lado do `.dia-bloco`), 64px sob a placa, 34px antes do
PDF. Agora 26 / 30–44 / 26. Grupo apertado por dentro, separação por fora.

## Revisão de acabamento por agente (14/08)

O Pedro cobrou: *"na skill não tinha agentes para caçar problemas, por que não
está usando?"*. Estava certo — eu tinha lido os playbooks (`craft-floor`,
`bolder`, `polish`) e conferido tudo **no olho**, sem rodar
`impeccable-finish-reviewer` nem o `detect.mjs`. O hook estava ligado o tempo
todo e eu não agi sobre ele.

O revisor achou **oito correções materiais**, duas delas bugs funcionais que
inspeção visual não pega:

1. ⚠️ **`#g-agua` duplicado.** O gradiente do cilindro e o da área do gráfico
   tinham o mesmo id; o navegador resolve `url(#id)` pelo **primeiro do
   documento**, então a área pintava com o gradiente OPACO do tanque e enterrava
   a linha de limiar. O rótulo "45% — LIMIAR" apontava para nada — justamente o
   lugar para onde o limiar foi mandado quando saiu do tanque. Renomeado para
   `g-area-res`, e malha e limiar desenhados **depois** da área.
2. **Duas linhas da história abriam o chamado errado** (diziam nº 412 e abriam
   a ficha do 408, fechado, de outra bomba).
3. **Ficha sobre ficha.** "Ver todos" → tocar um reservatório empilhava dois
   diálogos e o X fechava os dois. Agora só uma abre por vez e o X **volta para
   a ficha de origem** (pilha de um nível).
4. **Barra desalinhada da coluna:** `.barra-in` usava padding fixo de 22px no
   celular contra o `clamp(22px,5vw,40px)` da `.folha` e do rodapé — até 18px
   de desvio entre 441 e 820px. E `.topo .barra{display:none}` era **seletor
   morto** (o certo era `.fio-v`).
5. **Fichas no celular:** `100svh` (o pé ficava atrás da barra do Chrome
   Android), `overscroll-behavior:contain`, trava de rolagem do `body`, X a
   48px — no celular ele é a **única** saída, porque a folha cobre o backdrop e
   não há Escape.
6. **Ritmo:** o último evento de cada dia fechava com fio e o dia seguinte
   abria com outro — dois hairlines paralelos com ~52px de nada. E na placa
   empilhada os dois paddings de 54px se somavam na costura (84px).
7. **"Quem está resolvendo" agora aparece em crítico, baixo e mudo**, não só no
   4a: os três afirmavam em prosa que o chamado tinha sido aberto e não davam
   objeto nenhum para tocar.
8. **Toque:** o tanque só tinha `:hover` como pista de clicável (inexistente em
   toque) — ganhou fio permanente sob o nome; `.conta-rot` saía da árvore de
   acessibilidade com `display:none`; etiquetas gravadas sobem a `.66rem` no
   celular.

### ⚠️ Compensar em vez de consultar o número documentado

Padrão de erro meu, apontado pelo Pedro duas vezes seguidas ("o logo não está
muito alto?", "acho que o logo está muito grande"): vi um problema real — no
`logo-topo.png` as letras GENERAL ocupam só **77 dos 180px** de altura, o resto
é engrenagem, então a marca parece pequena — e **inventei valor** (54px, depois
46px) em vez de checar a DESIGN.md. Resultado: barra de **85px contra os 74**
documentados.

Números do sistema, e eles mandam: **logo 40px na barra, 72px no rodapé; barra
74px no desktop, 64px no celular.** Se a marca parecer pequena ao lado do nome
do prédio, a alavanca é o **nome**, não o logo.

~~⚠️ **No celular a barra não gruda.** Em duas linhas ela tem 107px, e grudada
comeria 14% da tela para sempre.~~ **Revertido em 14/08** — ver "A barra é a
barra da landing" abaixo. A causa das duas linhas era o nome do prédio; com ele
no cabeçalho da placa, a barra cabe nos 64px e volta a grudar.

## A v3 VIROU CÓDIGO em 14/08/2026

`public/cliente.html` + `cliente.css` + `cliente.js` foram reescritos a partir
da comp. Detalhe técnico em [`../../docs/modulos/painel-cliente.md`](../../docs/modulos/painel-cliente.md)
e em [`../../docs/changelog.md`](../../docs/changelog.md). A comp continua sendo
a referência visual; o código é a fonte de verdade do comportamento.

**O que mudou da comp para o código, e por quê:**

- **Uma ficha de chamado, não duas.** A comp tinha `#fChamado` (fechado) e
  `#fChamadoAberto` (aberto) como markups separados, para poder mostrar os dois
  no andaime. Em produção é uma casca só, com o corpo montado pelo JS: o
  compositor aparece com o chamado aberto, a avaliação com ele fechado e não
  avaliado. Dois markups para o mesmo objeto divergem na primeira alteração.
- **O gráfico saiu do ApexCharts.** São ~8 linhas de `path` desenhadas em
  `graficoSVG()`, como na comp. ~200 KB a menos por carga; o custo é o tooltip
  interativo, que a comp não previa.
- **O PDF da história ganhou um seletor.** `/relatorio/pdf` exige `device_id`
  e não existe relatório "do prédio": com um reservatório o botão baixa direto;
  com dois ou mais, abre `#fTodos` em modo `pdf`.
- **Frases amaciadas.** "Nossa equipe já foi avisada" → "é avisada
  automaticamente quando um sensor para de responder"; a linha de atendimento
  passou a citar o **título do chamado**. Ver o "porquê" em
  [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).
- **`is-empilhada` foi removida.** Ela existia para a placa empilhar por
  quantidade de reservatórios; com a prova travada em três colunas, esse caso
  não existe mais e só a media query de 1000px empilha.

**Três bugs que só a medição pegou** (nenhum apareceu no olho):

1. ⚠️ **`overflow-x: clip` no `body` não basta.** A engrenagem sangra para a
   margem de propósito, e a 390px a página ainda rolava **66px** para o lado.
   Precisa estar em `html` **e** `body` — e `clip`, nunca `hidden`, que
   quebraria o `sticky` da barra e do trilho de datas.
2. ⚠️ **Render periódico reanimando a lâmina.** O painel recarrega a cada 10s;
   reconstruir a prova zerava o nível e o fazia subir de novo. Tanque
   esvaziando sozinho a cada dez segundos é a leitura errada num painel de
   nível de água. Assinatura de dado antes de redesenhar.
3. **Tempo relativo com `round`**: 40 segundos viravam "há 1 min". Piso.

⚠️ E de novo, duas vezes: **a captura de tela mentiu** (barra "fora de
posição", rodapé com "sobra") e o `getBoundingClientRect` mostrou que estava
correto nas duas. A regra continua valendo.

### A passada de celular que o Pedro cobrou (14/08, mesmo dia)

Ele arrastou a página para o lado no celular e mandou a captura. **Era a comp**,
não o código — dava para ver o andaime e o "há 40 segundos", que o código já não
escreve. Ou seja: eu tinha corrigido o `overflow-x` em `public/cliente.css` e
**deixado a comp com o defeito**. A comp é o artefato que ele abre para revisar;
deixá-la mentindo é pior que não tê-la corrigido em lugar nenhum. Corrigida.

**Lição maior, e é de método:** eu tinha verificado o celular **numa largura
só** (390px). Varrendo 320/360/375/390/412/430/540/768 apareceu o defeito que
importava, e ele não era o `overflow-x`:

⚠️ **"Preciso de ajuda" caía abaixo da dobra nos estados de alarme.** A 390px a
ação começava a 787px no sem sinal, 729px no de atenção, 700px no crítico. Num
painel cuja tese declarada é *"a primeira tela é a resposta, com UMA ação"*, a
ação sumia justamente no estado em que o visitante está aflito — a tese quebrava
no aparelho prioritário e eu não tinha visto, porque só olhei o estado calmo com
atenção.

A correção não mexeu na direção:

1. **`order` na quebra de 820px** — a ação sobe para antes da linha de
   atendimento. A linha de atendimento responde a **2ª** pergunta do público,
   não a 1ª, e continua na primeira tela, logo acima da prova. No desktop a
   ordem do DOM vale.
2. **O apoio encurtou**, e a nota "nossa equipe é avisada automaticamente" só
   entra **quando não há chamado aberto**: havendo, a linha de atendimento já
   diz quem cuida, e repetir custava duas linhas em cima do botão.
3. **A linha de atendimento virou duas linhas** (título + referência em
   `<small>`), em vez de uma frase corrida que quebrava em 3–4 linhas.

Base do botão a 390px: 522→462 · 672→462 · 729→462 · 700→434 · 787→491 ·
579→564. A 320px o pior caso é 569px.

⚠️ **Regra que fica:** medir a **altura até a ação** em todos os estados, em
pelo menos 320 e 390, sempre que algo for acrescentado acima dela. Uma largura
só não é verificação de celular.

## Decisões em aberto

- **O âmbar no estado "atenção".** Ali a palavra que nomeia o problema, o
  número, o anel do tanque **e** o botão "Preciso de ajuda" são âmbar — quatro
  regiões, contra a regra de "o amarelo aparece uma vez por tela". Veio assim
  da comp aprovada; implementei fiel e não mexi sozinho. No estado **crítico**
  o problema não existe, porque a palavra e o número viram vermelhos.
- A **crista amarela** no tubo de nível baixo: acréscimo meu, nunca confirmado.
  (No cilindro ela virou o **anel** da superfície.)
- **Nada rodou contra o backend real** ainda.

## Proposta de 14/08 para os órfãos — comp v3, aguardando veredito

[`../comps/painel-cliente-v3.html`](../comps/painel-cliente-v3.html) responde
"onde vivem" sem criar seção nenhuma: **tudo que sobrou virou ficha**.

- **Troca de senha** → o "Sair" solto no topo vira o **nome do síndico**, que
  abre a ficha *"Sua conta"* (e-mail, formulário de senha, "Sair da conta").
- **Avaliação** → no **pé da ficha do chamado**, quando ele está fechado e não
  avaliado. Nada de modal sobre modal, que era o vício do admin. Na história,
  a linha do serviço concluído carrega o convite ("Você ainda não avaliou
  este atendimento").
- **Cliente sem telemetria** → **não é tela de exceção**: é a mesma tela com
  outra resposta ("Ainda não medimos o seu prédio."), a mesma ação, e o
  interesse em monitorar como link quieto. A prova vira **um** tubo em
  contorno com a etiqueta "sem medição" — três tubos vazios leriam como
  "seus reservatórios estão secos", que é falso, e o backend nem conhece os
  reservatórios desse cliente. O PDF some, porque `/relatorio/pdf` exige
  `device_id`.
- **Histórico com períodos** (órfão que não estava listado) → clicar numa
  coluna d'água abre a **ficha do reservatório**: gráfico, períodos e o PDF
  daquele reservatório. É onde o `device_id` do endpoint tem de onde sair.

### Corrigido em 14/08 depois da leitura do Pedro

- **"Preciso de ajuda" era um botão morto.** É a única ação do painel e tem de
  ser o `POST /cliente/chamados`, que exige **categoria + descrição**. Virou a
  ficha *"O que está acontecendo?"*, com as 7 categorias reais do
  `cliente.html` como **placas grandes**, não um `<select>` — alvo de toque
  vence economia de espaço neste público.
- **O chamado tem conversa de verdade**, não uma caixa de recado. A ficha
  mostra as falas nos dois sentidos, e o **compositor só existe com o chamado
  aberto** — é o que o `cliente.js` faz hoje (`ch.status !== "fechado"`).
  O chamado fechado diz por que não dá para responder e aponta para um novo
  pedido.
- ~~**Mais de 4 reservatórios** viravam uma faixa que quebrava em linhas.~~
  **Substituído em 14/08** — ver "A prova são três" abaixo.
- **O logo estava a 26px.** Subiu para 40px e trocou de asset: `logo-topo.png`
  (o wordmark sem assinatura), porque a assinatura do `login-logo.png` fica
  ilegível em qualquer escala de barra.

## ⚠️ O ramo "normal" do veredito precisa ser partido em dois (14/08)

O Pedro perguntou **o que faz sair de "Tudo normal."**, e a resposta expôs um
defeito que nenhuma redação conserta. `_predioVeredito` (`public/cliente.js:178`)
decide em quatro ramos, por prioridade — crítico (<20%) → sem sinal → atenção
(<45%) → normal — e **só olha nível de água**.

Consequência: **chamado aberto não tira do ramo "normal"**. Pode haver técnico
na casa de máquinas agora, com chamado em atendimento, e a frase gigante da
primeira tela dizer "Tudo normal", com o atendimento rebaixado a texto de
apoio. A função já recebe `chamados` e já calcula `abertos` — usa isso só para
escolher a nota, nunca para escolher o ramo.

**A correção (na comp v3, sem tocar no backend):** o ramo 4 vira dois.

- **4a — água normal + chamado aberto:** mesmo veredito de água (é verdade),
  mais uma **linha de atendimento** na primeira tela: ponto, nome de quem
  atende, e abre a ficha do chamado. O síndico descobre na primeira linha que
  alguém pegou o caso, em vez de rolar até a história.
- **4b — dia calmo:** nada aberto. Só aqui a frase confiante é literalmente
  verdadeira.

⚠️ **O ponto do "em atendimento" é azul (`--crista`), não âmbar.** Âmbar neste
sistema significa *atenção*, e chamado em curso não é alarme — o painel já
errou isso uma vez pintando "Em atendimento" de vermelho. Isso também devolve
a regra do amarelo uma vez por tela.

## A frase do dia normal — FECHADA em 14/08

**"Seu prédio está abastecido."** É uma frase só; a chave que existia no
andaime da comp era ferramenta de comparação, não comportamento — o painel
nunca alterna frase para o mesmo estado. Removida.

O Pedro observou, com razão, que as duas candidatas **disparavam exatamente no
mesmo estado**: a diferença que eu tinha defendido era de tom, não de função.
O critério que sobrou é a **voz do conjunto** — as outras quatro frases todas
nomeiam algo concreto do prédio dele ("A Caixa Superior está em 12%", "Um
sensor parou de responder", "Ainda não medimos o seu prédio"). "Tudo normal."
seria a única sem sujeito, justamente no estado que ele vê na maioria das
visitas.

⚠️ Não reabrir frase a frase. Se a frase mudar, muda por mudança de produto
(um ramo novo no veredito), não por preferência de redação.

## Passada visual de 14/08 — "o bloco inteiro azul"

Diagnóstico do Pedro, e ele estava certo: o painel tinha herdado do mundo
"Chapa" só o **chanfro** e o **fio**, e deixado de fora os três materiais que
dão profundidade na landing. Sem eles a página era um campo chapado de
`--mar-800` do topo ao rodapé. A correção **não inventou nada** — é vocabulário
que o `landing.css` já tem:

1. **A resposta virou a placa do instrumento.** Mesmo material do `.instr` da
   landing: interior em `linear-gradient(168deg, --mar-700, --mar-900)`, aresta
   de 1,5px em `--fio`, chanfro. Volume mais baixo: chanfro de 16px em vez de
   20px e **sem o anel de estado** (âmbar/vermelho na borda) — no painel quem
   sinaliza é o número e a crista.
   Isto não é card: `cliente.js:141` já mandava o instrumento do painel ser o
   **mesmo objeto** da landing, para o síndico reconhecer a peça que viu antes
   de contratar.
2. **O corte gravado divide a placa** — `--rasgo` + `--luz`, duas linhas, nunca
   uma. Separa a resposta (texto) da prova (colunas). Quando a placa empilha
   (mobile, ou 5+ reservatórios) **o sulco deita junto**, virando `border-top`,
   igual à landing a 760px.
3. **As faixas de risco entraram no tubo** (`--amarelo 11%` de 20→45%,
   `--risco 13%` de 0→20%, os valores do `landing.css`). Ficam sob a lâmina,
   então aparecem conforme a água recua — e é o que **explica** por que 12% é
   crítico, em vez de só afirmar.
4. **A engrenagem**, marinho sobre marinho, `--mar-500` a .26 (a landing usa
   .5) girando em 140s. ⚠️ Ela **sangra para a margem da página** —
   `body { overflow-x: clip }` e `.eng { right: -15vw }`. Presa dentro da
   coluna, ela virava um bloco recortado na faixa morta entre o cabeçalho e a
   placa: artefato, não marca. Foi o único defeito real desta passada.
5. **O chão da página desceu para `--mar-900`**, para a placa ter sobre o que
   pousar. É a escada de marinho que a landing tem e o painel não tinha.

### O contraste mora no CLIQUE, não no scroll (14/08)

Eu levei a **história** para a placa clara e o Pedro recusou: uma seção clara
no meio da rolagem parte a página em dois sites. **Revertido.** Mas o
diagnóstico dele era outro — *"a tela toda ser azul, sem contraste"* — e ele
apontou o lugar certo: **as fichas**.

Regra que ficou:

- **O painel em repouso é marinho do topo ao rodapé.** Nenhuma seção clara
  dentro do scroll.
- **Toda ficha é placa clara** (`--chapa` + `--tinta`): pedir ajuda, chamado
  aberto, chamado fechado, reservatório, sua conta. É a chapa clara da landing
  pousada sobre o marinho, e é finalmente o destino dos tokens
  `--atencao-t` / `--risco-t` / `--normal-t`, que existiam no `cliente.css`
  sem uso desde a v1. O contraste acontece no momento em que ele age; a tela
  de descanso continua descansando.
- ⚠️ **Dentro da ficha o âmbar nunca é texto nem ícone.** Anel de foco vira
  `--tinta`; a estrela cheia é **preenchimento âmbar com contorno de tinta**
  (forma, não tinta); a linha de limiar do gráfico e seu rótulo usam
  `--atencao-t`.
- **O amarelo cheio marca as duas ações que fecham valor:** "Baixar relatório
  em PDF" na história e a ação principal de cada ficha. Com "Preciso de ajuda"
  no marinho, nenhum par divide a mesma tela.
- **A história ganhou trilho de datas.** O contraste da metade de baixo vem de
  **tipografia**, não de cor: a data deixou de ser etiqueta mono de 10px e
  virou numeral estampado (Archivo 800) num trilho à esquerda, grudento
  (`sticky`) enquanto os eventos do dia rolam. ⚠️ O numeral é Archivo e **não**
  mono — mono aqui é só medição e etiqueta gravada.

## Ideia em estudo — o prédio em corte

[`../comps/predio-em-corte.html`](../comps/predio-em-corte.html). **Não é a comp
aprovada**; é uma exploração que o Pedro pediu para analisar.

Os reservatórios saem das três colunas lado a lado (que são um gráfico de
barras) e vão para a **posição real**: caixa no telhado, reserva no térreo,
cisterna enterrada, ligadas pelo prumo da bomba, com o nível da rua marcado.
Desenho técnico em chapa — hairline, chanfro de 45°, a mesma água — **sem
perspectiva, sombra ou render 3D**.

O argumento mais forte aparece no estado crítico: caixa quase vazia em cima e
cisterna cheia embaixo **conta sozinha** que o problema é a bomba, não a falta
d'água. Nenhum texto faz isso.

⚠️ **Custo real, se for adiante:** o banco não guarda a posição do
reservatório; deduzir do nome quebra no primeiro "Caixa 1". Precisa de campo
novo preenchido no admin. E acima de ~4 reservatórios o corte não fica legível
— provavelmente conviveria com a faixa de colunas.

### Celular — verificado em 14/08, e achou três bugs

O `resize_window` do Chrome parou de funcionar no meio da sessão. A saída foi
**embutir a comp num iframe de 390px** na própria página (via console), o que dá
viewport real e faz as media queries valerem. Vale como técnica: quando o
navegador não deixa redimensionar, o iframe resolve.

Três defeitos que **só existiam no celular**:

1. **O topo quebrava em cascata.** `.topo` é flex sem wrap: "Edifício Vila
   Mariana" caía em três linhas e "Pedro Martins" em duas. Agora o nome do
   prédio trunca em uma linha (`text-overflow: ellipsis`) e o botão de conta
   fica **só com o ícone** — o nome dele já aparece dentro da ficha.
2. ⚠️ **A ficha transbordava a tela.** `place-items: stretch` **não** segura:
   a linha do grid dimensiona pelo conteúdo, e a ficha ficava com **1013px num
   viewport de 744**, sem rolar por dentro. A linha precisa de
   `grid-template-rows: minmax(0,1fr)`. Medido, não deduzido.
3. **O rótulo "45% — LIMIAR" era `<text>` dentro do SVG** e encolhia junto com
   o viewBox, virando borrão a 390px. Virou HTML posicionado por cima do
   gráfico — texto de verdade, tamanho de verdade.

Conferido depois do conserto a 390px e a 1280px: placa empilhada com o sulco
deitado, trilho de datas deitado, e as fichas em tela cheia rolando por dentro.

## A prova são TRÊS colunas, no máximo (14/08)

O Pedro recusou a faixa de onze tubos: *"não gosto muito como é mostrado
muitos reservatórios"*. Ele tem razão e o diagnóstico é o mesmo da v1 — onze
colunas iguais lado a lado **voltam a ser um gráfico de barras**, e o síndico
não audita onze números: ele quer saber se algum é problema.

**A regra agora:** a primeira tela mostra no máximo **três** colunas, tenha o
prédio 3 ou 30 reservatórios.

- Se algum está **fora do normal** (crítico, atenção, mudo), a prova são
  **esses** — e só eles. Com um crítico entre onze, aparece **um** tubo.
- Se está tudo normal, aparecem os **três mais baixos**: os únicos que podem
  virar problema.
- O resto vira **uma frase honesta com a faixa real** ("Mais 8 reservatórios,
  todos entre 77% e 93% — ver todos"), que abre a ficha com a lista completa.
- Na ficha a leitura é **barra horizontal, não tubo**: ali não é prova, é
  inventário, e inventário se varre de cima para baixo.

Ganho colateral: **o layout deixou de ter uma variante.** Sumiram o modo
`data-nres="muitos"`, a grade de auto-fit e as regras móveis dela. Menos
superfície para dar errado.

⚠️ `.colunas` é `justify-content:center` — com um tubo só ele ficava órfão,
encostado na esquerda de uma célula larga.

## O nome do condomínio é o título da tela (14/08)

Estava a `.95rem` em `--sobre-2` — escala de **legenda** —, e por isso sumia.
A [DESIGN.md](DESIGN.md) já define o papel: *"Título de tela (topbar): 1.32rem,
800, Archivo"*. O nome do prédio **é** o título da tela; agora está nessa
escala, em branco, sem o fio separador (a hierarquia faz o trabalho que o fio
fazia).

⚠️ No celular o topo **quebra em duas linhas** — marca e conta em cima, nome do
prédio inteiro embaixo. A versão anterior truncava com reticências, o que era
esconder justamente o que precisava ganhar peso.

## A barra é a barra da landing — FECHADO em 14/08

Pedido do Pedro: *"deixar o cabeçalho igual o da landing page, mesmo tamanho,
tamanho de logo etc"*. A barra do painel tinha sido **inspirada** na da landing
e divergido em sete pontos. No desktop as duas batiam em altura **por
acidente** — 17 + logo 40 + 17 = 74 —, e no celular eram outra construção.

Agora as duas folhas compartilham os mesmos tokens **com os mesmos nomes**:
`--barra-h` (74px, 64px abaixo de 760px), `--area-max`, `--gut`
(`clamp(20px, 5vw, 56px)`) e `--saida`. Mudou num, muda nos três (landing,
login, cliente) — a jornada é uma só e o cabeçalho não pode trocar de tamanho
no meio dela.

⚠️ **Altura declarada, nunca derivada de padding.** Foi assim que a barra
chegou a 85px uma vez: um elemento cresceu dentro dela e levou a altura junto.

⚠️ **O nome do prédio saiu da barra.** Ele era a causa das duas linhas no
celular, e a única alternativa — truncar com reticências — já tinha sido
recusada em 14/08 (ver "O nome do condomínio é o título da tela"). Continua
sendo o título da tela; mudou de lugar, não de papel: virou `.placa-topo`, o
**cabeçalho do instrumento**, com o sulco gravado de duas linhas separando-o do
corpo. Isso é a anatomia que a DESIGN.md já descreve (cabeçalho / corpo /
estado / nota), e é o que impede a peça de virar **etiqueta acima de manchete**
— forma proibida. Se algum dia ele encolher para uma linha mono em caixa alta,
virou eyebrow e é para tirar.

Decisão do Pedro no mesmo passo: **alinhar a coluna inteira** ao recuo da
landing, e não só a barra. `.folha`, `.barra-in` e o rodapé usam `var(--gut)`;
a largura útil do painel passou de 1160px para os **1128px** da `.area`.

⚠️ **Regressão silenciosa que a estrutura nova cria:** a célula de texto não é
mais `:first-child` da placa. `container-type: inline-size` e o `padding-bottom`
da placa empilhada foram para `.placa-topo + .placa-cel`. Com `:first-child` a
contenção cai na célula errada e a `.frase` perde a referência de `cqi`.

**Medido contra o backend real** (servidor local na 3001, banco de TESTE,
`demo-cliente@teste.local`, estado "sem sinal") — a primeira vez que este
painel roda com dado de verdade. Landing e painel a 1920px: barra 74px,
`.barra-in` 1240px com 56px de recuo, logo 40px — idênticos. No celular, de 320
a 760px: barra 64px e `sticky`, logo 32px, logo alinhado com a borda da placa
em todas as larguras, zero transbordo horizontal.

⚠️ `resize_window` do Chrome **não pegou de novo**. A técnica do iframe de
largura real continua sendo a saída — e `flex-shrink: 0` nos iframes, senão o
contêiner os espreme e todos medem a mesma largura errada sem avisar.

### O que a medição da ação diz — e o que ficou em aberto

Regra da casa: medir a altura até "Preciso de ajuda" sempre que algo entra
acima dela. Base do botão no estado sem sinal: **568,9px a 390px** e
**586,1px a 320px** (o pior caso documentado era 569). A barra devolveu 43px e
o cabeçalho da placa consumiu ~50; a 320px o nome do prédio ainda quebra em
duas linhas.

A 390px folga. **A 320px o botão fica parcialmente abaixo da dobra** num
viewport de 568px — mesma situação de antes, ~17px pior. Não ajustei: o aparelho
é praticamente extinto e micro-tunar padding contra ele custa mais do que vale.
Fica registrado como escolha, não como descuido.
