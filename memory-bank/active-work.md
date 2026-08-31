---
tags:
  - projeto
  - contexto/em-andamento
aliases:
  - Trabalho em Andamento
---
# Trabalho em Andamento

> Branch atual: **`main`**, limpa. `feature/admin-chapa` (11 commits) e a tela
> de orçamento do cliente já foram mergeadas — a produção
> (`telemetria.generalbombas.com`) está servindo as duas.
> Última sessão registrada: **2026-08-31**.
> Roadmap completo em [`roadmap.md`](roadmap.md); decisões em [`decisions.md`](decisions.md).

> ✅ **Schema de produção em dia:** 074 aplicada em 24/08; a 073 já estava
> aplicada (rodou sem emitir NOTICE nenhum).
>
> ⚠️ O proxy público do Railway dá `ETIMEDOUT` esporádico: em 24/08 o
> `migrate.js` falhou assim e minutos depois o mesmo host aplicou sem
> reclamar. **`ETIMEDOUT` não diz nada sobre a migration** — é a conexão nem
> chegando; tentar de novo resolve.
>
> ⚠️ **Não diagnosticar isso com `Test-NetConnection`.** Nesta máquina ele
> devolve `TcpTestSucceeded=False` para proxy que está no ar — errou o
> `hayabusa` duas vezes e o `interchange` uma, e me fez concluir que o banco de
> teste tinha caído. Um `TcpClient.ConnectAsync` conecta nos dois em ~190ms.
> Os dois bancos estão de pé.

## ⏸️ RETOMAR AQUI — a simplificação do operador está pela metade

> Retomada em 31/08/2026: **o item 1 (o trilho) está feito e verificado** — ver
> abaixo. Restam os itens 2 a 5. **O código no ar funciona e foi verificado**
> (render nas duas larguras, console limpo, `node --check`, detector sem achado
> novo); o que falta é continuar o mesmo corte nas outras peças da tela.

> 🔎 **Para olhar a tela sem sessão: `/dev/_operador-preview.html`.** A rota
> `/dev/:arquivo` (`src/app.js`) serve os `public/_*.html` **só fora de
> produção**, e a prévia troca o `fetch` por uma fixture com os quatro estados
> de técnico. É por onde este corte foi conferido — o `/operador/painel` de
> verdade cai no `/login`, e o login é handoff pro Pedro.
> ⚠️ A prévia repete o `?v=N` do `operador.html`: ao bumpar um, bumpe o outro.
> ⚠️ A janela do Chrome aqui **não obedece resize** — o celular se mede
> colocando a própria prévia num `<iframe>` de 390px, que responde às mesmas
> media queries.

⚠️ **O contexto que não pode se perder:** o Pedro disse que a tela será usada
por **pessoas mais velhas, com pouca familiaridade com computador**, e pediu
para simplificar. Eu respondi com **escala** (corpo 15px, alvos 44px) e ele
apontou: *"não mudou praticamente nada"*. **Aumentar não é simplificar.** A
pergunta certa é *o que sai da tela*, não *quanto cresce*.

**Feito (o item da fila):** 3 colunas → 2; 2 botões iguais → 1 botão + 1 link
("Ver detalhes"); 15 peças na face → 10. A prioridade desceu para a régua
(junto do relógio, que responde à mesma pergunta), o título passou a abrir o
item, e status/origem/bairro saíram da face — **todos continuam na ficha**.

**✅ Item 1 — o trilho (feito em 31/08).** Quatro peças por linha viraram
duas: nome + estado. Saiu o selo de iniciais (não identifica ninguém que o
operador já não reconheça pelo nome) e saiu o "no mapa", que se repetia logo
abaixo do mapa que já mostra o pino — restou só a exceção "· sem posição". O
anel verde saiu junto com o selo, então a disponibilidade passou a ter **um**
lugar (a tinta do estado) em vez de dois. "Despachados hoje" perdeu o ícone de
rota repetido. Detalhe completo no
[`changelog`](../docs/changelog.md) (31/08).

⚠️ **A pegadinha que este item deixou como lição:** o separador "·" estava em
`content` de `::before` e sumia do `innerText` — a linha era lida e copiada
como *"Ocupadosem posição"*. **Screenshot nenhum pega isso.** Ao cortar peça de
UI, ler o `innerText` do que sobrou, não só olhar.

**A fazer, na mesma direção:**

1. ~~O trilho.~~ ✅ feito, ver acima.
2. ~~O placar de 3 números.~~ ✅ **feito em 31/08 — ele SUMIU.** O Pedro
   delegou a escolha ("pode escolher o que for melhor"). Dois dos três números
   eram repetição literal dos cabeçalhos de seção 40px abaixo; o terceiro,
   "fora do prazo", desceu para esses cabeçalhos, onde ficou **mais preciso**
   (cada seção conta os seus, em vez de um total único). No dia calmo a frase
   passou a aparecer uma vez só. O primeiro item subiu de y=225 para y=120.
   ⚠️ **A engrenagem de fundo mudou de casa e hoje ABRAÇA O MAPA** (pedido do
   Pedro). Foram três arranjos no mesmo dia; os dois primeiros — faixa
   horizontal no topo, e margem direita da janela — caíram pelo mesmo motivo:
   **ancoravam a peça na janela**. Hoje são dois elementos: `.eng` é o
   RECORTE (a coluna do trilho, `overflow:hidden`) e `.eng-roda` é a peça,
   centrada no mapa. Assim ela não encosta na fila em largura nenhuma, sem
   máscara em px, e quem a corta por dentro é o mapa opaco.
   ⚠️ **Pré-requisito:** `.trilho` perdeu o `background`, que era a mesma cor
   do `body`. Devolver aquele fundo faz a peça sumir sem outro sintoma.
   ⚠️ **Some abaixo de 1180**, a quebra em que o trilho vira faixa. Eu tinha
   escrito 1080 e a 1150 ela aparecia por cima dos itens — **screenshot não
   pega isso**; só apareceu comparando os retângulos de `.eng` e `.trilho`.
3. ~~A evidência do item.~~ ✅ **feito em 31/08 (2ª rodada do dia).** O Pedro
   mandou o recorte do chamado #9 da produção — **quatro caixas d'água sem
   sensor vivo e quatro barras hachuradas idênticas** dizendo "—". Item de
   222px com a trilha de tanques 100% vazia. Reservatório mudo **deixou de
   desenhar tubo**: todos os mudos do item cabem numa linha, com os nomes
   preservados (a mesma frase do painel do cliente, "Sem leitura de X e Y").
   Item de 4 mudos: **222 → 189px**; a região da evidência, de 82 para 49.
   ⚠️ **Desenho de ausência ocupava o tamanho do instrumento e não era
   instrumento.** É a mesma lição de "simplificar ≠ aumentar", virada do
   avesso: o placeholder não era grande demais por descuido de escala — ele
   não devia existir naquele tamanho.
   Junto: a trilha virou `minmax(320px,1fr)` (o tubo foi de 156 para ~250px e
   saíram **~490px de campo morto** à direita da prova), o número do chamado e
   "Ver detalhes" encostaram na borda direita (a largura virou estrutura, em
   vez de tudo empacotado no terço esquerdo), e o cabeçalho de seção subiu de
   12 para 15px — ele saía **menor que a própria legenda**.
4. **A ficha e o diálogo de despacho não passaram pelo corte** — e a ficha é
   justamente onde foi parar tudo que saiu do item, então ela ficou mais densa.
5. **A seção "Já tem técnico"** ficou com o layout antigo de ações; conferir se
   o `.emrota` continua fazendo sentido na linha nova.
6. **Remedir as faixas** (o item trocou de grid: `118px minmax(0,1fr)`) e
   revisar o celular. ⚠️ Medido a 430 e 1090 em 31/08 **com `<iframe>`**, que é
   o único jeito nesta máquina; ver a nota da prévia lá em cima.

⚠️ Pendências de **copy**, que são decisão do Pedro e não minhas: ~~a
duplicação do dia calmo~~ (resolvida no item 2, sem escrever palavra nova — o
placar saiu e a frase que sobrou já estava lá), a legenda de cor dos pinos do
mapa, e o rótulo "TURNO" ao lado da marca.

---

## ✅ Aprovados: clicar no orçamento abre o chamado (31/08)

Pedido do Pedro na mesma mensagem do recorte do item. A tela dizia o que foi
autorizado e parava aí; agora **a linha inteira é um `<button>`** que abre um
chamado já vinculado ao orçamento (`chamados.orcamento_id`, migration 079),
com título e descrição pré-preenchidos a partir do próprio orçamento.

⚠️ **A migration 079 rodou SÓ NO BANCO DE TESTE.** Falta produção:
`node scripts/migrate.js 079_chamado_orcamento.sql` com o `DATABASE_URL` de
prod. Sem ela o `INSERT` do endpoint estoura — é a lição da Fase 7E, e é a
única coisa entre este código e o ar.

### 5ª rodada: "Já foi feito", e o que é feito sai da lista (migration 080)

Duas mensagens do Pedro na mesma rodada: dar um jeito de marcar como executado,
e depois *"o que for marcado como feito precisa sair dessa tela, se não vai
ficar pra sempre e vai ficar tudo poluído"*. Os dois certos.

⚠️ **A parte que eu não podia cortar junto:** a marcação é de um clique e sem
confirmação, então o que sai PRECISA ter volta. Duas: a faixa com "Desfazer"
na hora (10s) e a linha "N já feitos · mostrar" no fim da lista, permanente.
Sem elas, um clique errado só se conserta no banco.

⚠️ **A faixa de aviso ganhou segunda voz.** Era vermelha sempre. Confirmar em
vermelho ensina o operador a não olhar para o vermelho — `--risco` é estado
crítico e não aparece por outro motivo.

⏳ **Migration 080 pendente em produção**, junto com a 079.

### 4ª rodada: o "RECEBENDO · hh:mm" saiu da barra

O Pedro perguntou o que era. **A pergunta foi o achado.** A palavra
"RECEBENDO" era fixa (não mudava com o ponto vermelho), o texto de falha só
existia no `title` — hover, invisível no celular — e o relógio era a hora do
computador, não a da última atualização.

Ele: *"cara sinceramente eu tiraria"*. Saiu, e no lugar entrou uma faixa
vermelha que **só existe quando a tela parou de atualizar**, com a hora da
última carga de verdade.

⚠️ **A lição:** o indicador foi escrito com a regra certa ("silêncio e falha
não podem se parecer") e falhava nela. O sinal estava na COR de 7px e no
`title`; a palavra, que é o que se lê, estava presa no estado de sucesso. Ao
desenhar estado, a pergunta é *o que a peça DIZ quando dá errado*, não se ela
tem um estado de erro no código.

### 3ª rodada: a ajuda, e os prazos que já estavam errados

O Pedro pediu um botão de ajuda explicando P1–P4 e os prazos, e perguntou se
dava para ser dinâmico. Dava, e **era obrigatório**: ao buscar os números, os
que já estavam na tela não batiam com o banco — a dica dizia "P2 24–48h" e "P4
conforme agenda", e `sla_definicoes` tem 1440 (24h) e 14400 (10 dias).

`GET /operador/prazos` (novo) devolve os prazos + as faixas de nível, buscado
só quando o diálogo abre. Os números saíram das duas dicas, que apontam para a
tabela.

⚠️ **A lição:** eu ia escrever a ajuda copiando o texto que já estava na tela.
Se tivesse feito isso, teria transformado um erro discreto num erro
**autoritativo** — a tela que a pessoa abre justamente para tirar a dúvida.
Antes de documentar um número na interface, conferir a fonte dele.

⚠️ **Rota nova precisa de fixture em `_operador-preview.js`.** Sem ela a
chamada cai no `fetch` nativo com o token falso, toma 401 e o interceptador de
sessão derruba a prévia para o `/login`. Abrir a ajuda derrubava a tela.

⚠️ **E a prévia estava deslogando do sistema** — ver o changelog de 31/08. Ela
escrevia `token = "preview"` e ia embora; como é o mesmo origin do painel,
qualquer request real depois disso tomava 401. Eu culpei o `inatividade.js`
três vezes antes de o Pedro apontar o sintoma certo ("sempre que eu clico em
Aprovados a tela cai"). Agora ela empresta o storage e devolve no `pagehide`.

### 2ª rodada do dia: Aprovados foi para o registro de LEITURA

O Pedro pôs lado a lado o print da lista de orçamentos do painel do cliente e
esta tela e perguntou se estavam no mesmo nível. Não estavam. E ele nomeou o
que faltava melhor do que eu: *"existem palavras em amarelo, campos totalmente
em branco, coisas que quebram esse negócio monocromático"*.

**Placa clara por orçamento, manchete com a palavra "aprovados" em âmbar, selo
âmbar "PODE EXECUTAR", botão âmbar "Abrir chamado".** A pilha de metadados da
direita virou uma frase de rodapé, e a placa perdeu a segunda coluna.

⚠️ **A LIÇÃO, e é sobre mim:** eu tinha respondido a ele que a tela não podia
ir para o claro por causa d'A Regra da Superfície. Estava lendo a regra pela
letra ("placa clara é o que abre por cima") em vez de pelo motivo — que é
**não deixar placa clara disputando a tela com conteúdo marinho ao lado**.
Aqui não há nada ao lado: a placa É o conteúdo, que é o arranjo da landing e do
painel do cliente. A regra ganhou a fronteira escrita em `DESIGN.md`.

⚠️ **A régua do item também estava errada e ele viu antes de mim:** *"qual o
sentido de estar pintado de vermelho só até a metade?"*. A decisão (o campo
cheio não estica com o item) continua certa; a FORMA é que lia como pintura
que acabou a tinta. Recuada e chanfrada, a mesma área vira etiqueta.

⚠️ **Dois defeitos que só apareceram exercitando o fluxo:** `fechar()` antes de
`await carregar()` engolia o erro (o `#cmMsg` já não existe), e `flex-basis`
muda de eixo com `flex-direction` — os 260px da frase viraram ALTURA no
celular, e a placa abria com 260px de vazio dentro.

⚠️ **Copy que é decisão do Pedro, não minha:** a lede ("Do mais recente para o
mais antigo. O chamado que executa o serviço abre por aqui."), o rótulo do selo
("Pode executar") e o texto pré-preenchido do
chamado ("Serviço aprovado no orçamento OR-000058, por Pedro." + constatação +
itens) e o padrão de prioridade **P4**. Escolhi P4 porque serviço aprovado é
trabalho agendado e P2 passaria na frente de bomba parada numa fila ordenada
pelo prazo — mas é chute informado, não regra dada.

As regras que não dá para inferir lendo o arquivo estão em
[`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md)
("A segunda tela").

---

## Sessão 2026-08-28 — O painel do operador, sete passes

Dia inteiro na mesma tela, a pedido do Pedro. A ordem importa porque cada
passe revelou o próximo.

### 1. Composição — "a tela era duas telas"

`.comB` era `1fr var(--trilho-w)`: a fila centrava dentro da primeira coluna e
o trilho colava na borda da janela. A 1920px sobravam **285px de campo morto
entre as duas** — as metades liam como duas páginas. O **par** passou a centrar
junto, e a fila não se move um pixel com isso (`W/2 − 650` nos dois arranjos).
⚠️ Só funciona porque o fundo do trilho é o mesmo `--mar-900` do campo.

Junto: a medida de linha era **não-monotônica** — 33ch a 900px, **16ch a
1090px**, 50ch a partir de 1340. Alargar a janela piorava a leitura. A prova
passou a deitar na faixa do meio.

### 2. Acabamento — a gramática da landing

O passe 1 foi correto e **quase invisível**; o Pedro disse na cara: *"eu quero
melhorias reais e visíveis"*. Na segunda tentativa comecei a **acrescentar** um
medidor de SLA e ele cortou de novo: *"não quero que add coisas... quero
refino, e melhoria na beleza do front"*. Desfiz o medidor (inclusive o
`total_min` que já tinha posto no backend).

⚠️ **A lição, e é sobre mim:** "pouca hierarquia" não é pedido de peça nova nem
de tirar conteúdo — é pedido de **escala e acabamento**. Duas vezes li um
pedido de refino como licença para mexer na estrutura.

O que destravou foi abrir a landing ao lado e medir as duas: 80% dos 118 blocos
de texto entre 10,5 e 12,5px, contra a **razão 3:1** que a landing usa entre
etiqueta e leitura. E a placa do turno era um retângulo chapado onde o `.instr`
da landing é chapa de duas camadas com gradiente. Mesma cor, sem a peça.

### 3. O mapa vira protagonista

O Pedro pôs duas saídas na mesa: tela própria (como o admin) ou protagonismo
aqui. Escolhida a segunda, **com a tela cheia como modo da peça**. O argumento
não foi tamanho, foi **ordem da pergunta**: no diálogo o mapa abria *depois* da
escolha do chamado, um por vez, mas a decisão geográfica é da fila inteira.

⚠️ **Levantamento em produção que quase mudou a conversa:** 86/86 condomínios
com coordenada, `chamados` **vazia**, `tecnico_localizacoes` com **3 linhas no
total** — última de 17/08, dos mesmos 3 técnicos (de 9) que têm login. Cheguei
a recomendar investigar o GPS; o Pedro esclareceu que **é estágio, não
defeito** — o produto ainda não está em uso. Lição: banco vazio pré-lançamento
não é bug. A pergunta certa era "já está em uso?", e eu presumi que sim.

### 4. "Ficou bagunçado", e estava mesmo

⚠️ **Erro meu, de dosagem.** Apliquei a construção do `.instr` (anel + gradiente)
em placa, trilho, item e mapa — a primeira dobra ficou com **nove peças com
anel**, e quando tudo é peça usinada o anel vira textura. Regra que faltava:
**moldura marca o que é único; o que se repete é superfície.** De nove para
duas. O amarelo dos quatro "Despachar" também parou de apontar — passou a valer
a Regra do Selo que o `DESIGN.md` já tinha.

### 5. A barra, e a comparação errada

O Pedro perguntou se o cabeçalho não era bem menor que o das outras. Era: 60px
contra 74. ⚠️ **A topbar do admin tem 60px porque carrega SÓ CONTROLES** — a
marca dele mora na sidebar. Copiar o número era copiar a medida sem o conteúdo.
Barra 60→68, logo 30→36 (razão 0,50→0,53, a das irmãs).

### 6. Escrita para quem vai usar

*"Essa tela vai ser usada por pessoas que não têm tanta familiaridade com
tecnologia e computador."* Medido: **64% do texto abaixo de 12px**, 39 blocos
em mono CAIXA ALTA, **nenhum dos 11 botões** chegava a 44px. Depois: **10%**,
21 blocos, **zero** botão abaixo do piso. Corpo 13→15px, custando ≈3→≈2 itens
na primeira tela — decisão dele.

O pedido cresceu no meio: *"na verdade eu queria fazer isso para o sistema
inteiro, até eu me perco nas siglas muitas vezes"*. Virou o
[`../docs/vocabulario.md`](../docs/vocabulario.md), ligado à Home.
⚠️ Regra que a varredura revelou: **nem toda sigla é igual.** Sigla do ramo
(O.S., P1) a equipe fala e fica — confirmado pelo Pedro. Sigla de software
(TTFR, TTR, KPI) sai; prova de que sai é o admin já ter precisado de legenda
embaixo da tabela para explicá-las.

⚠️ **Uma troca minha foi recusada na revisão:** propus `EM ATENDIMENTO →
"Técnico a caminho"` sem conferir o dado. `em_atendimento` é status do CHAMADO;
se o técnico já chegou, o rótulo mente. **Texto mais claro que diz coisa errada
é pior que sigla.**

### 7. O que a escala quebrou

Verificação depois de subir a rampa ~15%. **Nenhum dos três defeitos dá erro,
aparece no console ou reprova no detector** — todos passariam.

- **A quebra do trilho estava 100px baixa demais.** A 1090px o item ia a
  **640×332** contra **1000×198** em 1080: alargar a janela piorava. A causa
  era conhecida e eu não liguei os pontos — o trilho foi de 300 para 400px
  quando o mapa entrou, e o `1080` (número da landing) ficou parado. Conta
  nova: `740 + 400 + 40 = 1180`. Depois: 43–68ch de 430 a 1920, monotônico.
- **As leituras em `rem` ficaram para trás.** Escalei os `px` (13→15) e não os
  `rem`: a régua do relógio — a tese da tela — caiu de **1,42× para 1,26×** o
  título. Ela não encolheu; o resto cresceu e a alcançou. Dez leituras
  reescaladas, razão de volta a 1,47. **O que se preserva numa troca de escala
  é a RAZÃO**, e misturar `px` com `rem` é como isso passa despercebido.
- **O formulário de "Novo chamado" não recebeu o passe:** 7 de 11 controles
  abaixo de 44px, e é onde o operador **digita**. Agora zero.

### Estado e pendências

- Detector **47 → 35** advertências de `font-size`: consolidar a rampa eliminou
  doze degraus. Aumentar o tipo não custou entropia, reduziu.
- `?v=7` → `?v=17` (CSS e JS).
- 🐛 Crase dentro de template literal, **inclusive em comentário HTML**, vira
  tagged template: `X is not a function` em runtime, `node --check` limpo, tela
  parada em "Carregando…". Virou regra no [`../CLAUDE.md`](../CLAUDE.md).
- 📋 **Vocabulário do admin ficou para depois**, a pedido do Pedro. O glossário
  já tem a tabela pronta; falta o admin (maior volume) e revisar o app do
  técnico.
- 📋 Copy, decisão do Pedro: no dia calmo a tela diz a mesma coisa duas vezes —
  a placa escreve "0 chamados abertos" e o título abaixo, "Nenhum chamado
  aberto." em 40px.
- 📋 O mapa não tem legenda de cor dos pinos (seria copy nova).
- 📋 **Continua sem ter rodado sob a role real** — não existe usuário `operador`
  em produção.

## Sessão 2026-08-27 — A carta de orçamento volta a ser carta

*"com carta e anexo só quero o texto, e a imagem da assinatura, nada mais"* —
o Pedro pediu para conferir os dois formatos de e-mail e a mistura apareceu.

Desde 25/08 a rota `POST /admin/orcamentos/avulsos/:id/enviar-email` separava
`painel` de `carta`, mas separava só as **entradas**. `sendOrcamentoCliente`
tinha um HTML só — o estruturado — e a carta do operador saía dentro da
moldura do painel: faixa "Orçamento comercial", caixa "Informações do
orçamento" repetindo o que a carta já dizia, "Atenciosamente / General Bombas"
fixo com a assinatura pessoal ensanduichada no meio, e rodapé institucional.
Regressão de `e891f35`; `80cd1f5` trouxe os modos de volta sem dividir o
template junto.

- `src/services/email.js` — `cartaHtml` e `estruturadoHtml`, escolhidos por
  `dados.modo`. A carta é `div` + texto + imagem da assinatura: **621 bytes**
  contra ~31 KB. O `textoPuro` segue a mesma divisão e, na carta, não leva
  nada além do que foi digitado.
- `src/routes/admin.routes.js` — passa `modo` para o serviço. Sem modo
  (JS em cache) cai no estruturado, como antes.

Sem migration, sem mudança de front — **não precisa de cache-bust**.

⚠️ **Falta ver um envio real chegando na caixa**, nos dois modos — é handoff
para o Pedro. Verifiquei exercitando o serviço com o SDK do Resend trocado no
cache do `require` (carta, painel e legado sem modo, HTML e texto puro), o que
prova o template montado, não a entrega.

## Sessão 2026-08-27 — Densidade do item da fila

*"muito espaço livre com um monte de coisa escrito pequeninho"*, sobre um
recorte do item. Medido antes de mexer: régua de SLA **71–87% vazia**, coluna de
ações 55–73%, e a pilha do tanque mandando na altura (100px por item).

- 🔴 **A coluna d'água deita em toda largura** — decisão do Pedro no meio do
  passe, depois de eu tentar preservar a peça vertical encolhendo-a. Ele estava
  certo: em pé ela nunca ia parar de mandar na altura. Item de **258 → 161/126/119px**.
  Ganho colateral: uma renderização do tanque, não duas.
- **A etiqueta mono virou um tamanho só (10,5px)** nas quatorze ocorrências.
  Eram cinco degraus abaixo de 11px. O passe de 21/08 tinha corrigido o
  contraste dessas etiquetas e **não o tamanho** — a lição é essa: piso de
  contraste passando não quer dizer que dá para ler.
- Régua alinhada ao topo; origem subiu para o fim da linha do prédio
  (`.item-pe` virou CSS morto e saiu); trilha dos tanques com largura fixa.
- ⚠️ Regressão pega no mesmo passe: a 10,5px o `ellipsis` cortava
  `"DISPONÍVEL · NO MAPA"` em `"DISPONÍVEL · N…"` no diálogo de despacho.
- ⚠️ O detector foi de 36 para 44 advertências de `font-size` — efeito de
  trocar `rem` por `px`, não regressão.

## Sessão 2026-08-27 — O operador visto ao lado das irmãs, no navegador

Terceiro passe na mesma tela. A diferença de método é o assunto: os dois
anteriores foram feitos **lendo código**, este com o painel do operador, o
painel do cliente e a landing **montados no navegador ao mesmo tempo** e
medidos em 1544 / 900 / 620 / 430px. Como `/operador/painel` e `/cliente/painel`
exigem login real, montei as duas no `localhost:3001` trocando o `fetch` por
dados de teste antes do `document.write` — dá para repetir sem depender de
sessão.

**A camada de tokens já estava conforme** (o passe anterior fechou), e o
detector confirmou: 36 achados, todos `font-size`, a advertência conhecida das
cinco folhas. Contraste: nada abaixo de AA na tela inteira. O que sobrou era
comportamento e forma — e nada disso aparece lendo arquivo:

- 🔴 **A tela desmontava entre 660 e ~1090px.** Uma quebra só (celular) num
  arranjo de duas colunas com trilho **rígido** de 300px: entre ele e o item de
  largura fixa (92 de régua + 172 de ações), só o texto podia ceder. A 900px a
  descrição virava **10ch** (contra os 68 do passe anterior) e o item ia de 258
  para 330+. Entrou a quebra de **1080px** (o número da landing), onde o trilho
  desce e vira faixa. Medido depois: item 258px, texto 57ch. A quebra de celular
  foi de 660 para **760**, que é a das irmãs.
- **A barra não tinha o `is-rolada`** — chegava opaca com o fio já desenhado.
  Landing e cliente chegam translúcidas com `blur(14px)` e endurecem a 12px de
  rolagem; é a única desfocagem do sistema.
- **Três peças de canto reto** (`.conta`, `.tec-av`, `.ficha-x`). A mesma
  varredura no painel do cliente acha **zero**. A `.ficha-x` virou ícone solto
  de 44px (a construção do `.fechar` de lá), o que resolve forma e alvo de toque
  juntos — era 34.
- **Quinze ícones com ponta arredondada** num sistema cuja regra é traço
  esquadrado. O `cliente.html` já vinha `square`.
- **A engrenagem lia como artefato**: atrás de uma pilha de cartões separados, o
  que se via era um dente por fresta. Ganhou máscara que a prende à faixa de
  campo aberto, e a opacidade caiu de .34/.26 para .26/.20 — estava **acima** do
  painel do cliente.
- Miudezas: `--barra-h` de volta ao token (o `calc(54px + …)` fazia o trilho
  colar 6px fora de lugar), `env(…, 0px)` com fallback, `100dvh`/`100svh`,
  `scroll-padding-top`, `animation-iteration-count: 1` no reduced-motion, ficha
  em tela cheia no celular, botão do celular a 44px.

- ⚠️ **Achado que NÃO foi consertado, e o motivo importa: todo `--ch` local é
  morto, nas cinco folhas.** O `var()` de uma custom property é substituído no
  elemento onde ela é declarada — `--corte` resolve `--ch` no `:root` e os
  filhos herdam o polígono pronto. `.item` pede 16, `.ficha` pede 22, as duas
  saem com o número do `:root`. **A rampa de chanfro do `DESIGN.md` não existe
  em superfície nenhuma.** Consertar é nas cinco de uma vez; fazer só no
  operador tornaria ESTA a folha fora do padrão — a mesma razão já registrada
  para a rampa de tipo. Entrou só o alinhamento do global: 8 → 10px.
- ⚠️ **Um achado meu que estava errado:** o `theme-color` `#030a26` não é
  divergência. As irmãs usam `#050f38` porque é o marinho **delas**; aqui a
  barra é `--mar-900`, e uniformizar criaria costura no app instalado.
- 📋 **Continua sem ter rodado sob a role real** — não existe usuário `operador`
  em produção, então o visual nunca foi visto logado.

## Sessão 2026-08-27 — O acabamento do painel do operador (Impeccable)

Passe de `polish` sobre a tela da sessão abaixo, com o piso das outras
superfícies como alvo. **Copy intacta, funcionalidade intacta.**

O achado que organiza o resto: **o comp aprovado já carregava os defeitos**, e a
implementação era fiel a ele. Item de 318px (dois por tela), linha de 110–140
caracteres, etiqueta mono a 3,05:1 de contraste. Hoje: **258px**, 68ch, piso de
5,2:1.

- Três defeitos que não aparecem lendo o CSS: `h3` sem `margin:0` dentro de
  flex (**29px de ar por item** — a margem do navegador não colapsa ali); o
  **pulso nascia vermelho** e todo boot abria com "verifique a conexão" aceso;
  e **`+ Novo chamado` era `display:none` no celular**, que é a porta de
  entrada do chamado por telefone.
- `.fala` existia no CSS e nunca era renderizada — voltou, só para origem de
  gente (`manual`/`whatsapp`), sem inventar autor que a API não devolve.
- Diálogos com foco que entra e **volta para o botão de origem**; mapa com
  fallback, retry de tile e o crédito do OSM de volta.
- Registrado onde manda: `DESIGN.md` (cinco superfícies, a regra do `--muted2`,
  a do `margin:0`), `.impeccable/surfaces/public-operador-html.md` (brief novo)
  e [`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md).

- ✅ **Verificado em harness a 1528px e 500px** (CSS e JS reais, rede de
  mentira), nos três estados e nos dois diálogos, com o round-trip de teclado
  conferido.
  ⚠️ O harness é `.tmpbuild/harness/` — temporário, não versionado. Ele é
  **derivado do `operador.html`** para não poder divergir.
- 📋 **Duas coisas ficaram de fora, de propósito:** a rampa de tipo em tokens
  (seria a única folha das cinco a ter; registrado no `DESIGN.md`) e a frase de
  explicação do item que o comp mostrava ("Aberto às 05h48 e nenhum técnico
  atribuído…") — **é copy nova, e copy é decisão do Pedro**.
- ⚠️ **O Pedro pegou o que o passe deixou passar:** a barra compunha a palavra
  "General" em Archivo em vez de usar o PNG da marca, como fazem as outras
  quatro superfícies. Corrigido (`logo-topo.png`, 30px numa barra de 60 — a
  proporção do painel do cliente). A lição está em
  [`decisions.md`](decisions.md): acabamento se confere **lado a lado com as
  telas irmãs**, não contra a própria tela.
- ✅ **A comparação que faltava foi feita** (a tela contra `cliente.html`/`.css`
  e a landing, elemento por elemento): **13 divergências**, o logo era a
  primeira. Entraram os tokens que a folha não usava (`--fonte`/`--mono`,
  `--corte`/`--corte-p` no lugar de oito `polygon()` crus, `--saida`,
  `--barra-h`/`--area-max`/`--trilho-w`/`--gut`), as partes que o navegador
  desenha (foco, seleção, rolagem — inclusive `scrollbar-width`, que faltava e
  deixava o Firefox com a barra padrão), o diálogo (fundo sem blur, entrada
  `sobe`, trava de rolagem) e o `prefers-reduced-motion` global.
  A barra passou a dividir a tela como o corpo divide acima de 1340px.
- ⚠️ **Dois furos do sistema apareceram no caminho, e valem para o
  `cliente.css`:** anel de foco `inset` é engolido por peça que já tem `inset`
  próprio (o botão de fio ficava **sem foco visível**), e anel amarelo sobre
  botão amarelo é invisível. Corrigido aqui; **latente lá**.
- 📋 Só ficou em aberto o rótulo "TURNO" ao lado da marca — nenhuma outra
  superfície escreve o nome da tela ao lado do logo. É copy.
- 📋 Continua sem rodar logado e sob a role real.

## Sessão 2026-08-27 — O operador ganhou painel próprio (a fila do turno)

Sequência direta da sessão abaixo: fechada a restrição, sobrou a pergunta
*"outra tese ou o admin podado?"*. Resposta: **outra tese**. `/operador/painel`
é a fila do turno, ordenada pelo **SLA que estoura primeiro** — a lista do admin
ordena por data, e é essa a única diferença que justifica a tela existir.

- **Um endpoint** (`GET /operador/fila`) monta a tela inteira, com o SLA
  resolvido no **relógio do servidor** — a ordenação *é* o `resta_min`, e o
  relógio do navegador do operador reordenaria o turno sem ninguém ver.
- **Folha própria** (`public/operador.html/.js/.css`), sem `admin.css` e sem
  importar nada de `admin.js`. A evidência mora **dentro do item**: coluna
  d'água com telemetria, a fala de quem relatou sem ela — foi o que derrubou a
  v1 do comp, que não tinha o que desenhar para prédio sem sensor.
- Despacho grava `PATCH /chamados/:id { tecnico_id }` (marca `primeira_resposta_em`,
  para o TTFR). **"Em atendimento" continua só pelo app do técnico, com GPS.**
- `sw.js`: `/operador` na lista network-first, `CACHE_NAME` v61,
  `register-sw.js?v=51` — **as outras quatro HTMLs estavam em `v=50` com o SW já
  bumpado** e foram corrigidas junto.
- `scripts/auditar-rbac.js` ganhou o router novo no `MOUNTS`: 24 → **25 rotas**
  alcançáveis pelo operador.

- ✅ **A rota foi exercitada** (Express só com o router + JWT de `operador`,
  banco de TESTE): HTTP 200, 6 chamados, ordem por SLA conferida, telemetria
  agregada. Script em `.tmpbuild/testar-fila-inproc.js` — temporário, não
  versionado.
- 📋 **A tela não foi vista logada** (o login é handoff) e **nunca rodou sob a
  role real**: não existe usuário `operador` em produção. O primeiro cadastrado
  é quem estreia as duas coisas — a restrição e o painel.
- 📋 **Não deployado.**
- 📋 Em aberto: coluna `origem` em `chamados` (hoje a procedência é deduzida) e
  ETA no cartão do candidato a despacho (mostra "no mapa"/"—", não distância).

## Sessão 2026-08-27 — O operador virou restrição de verdade

Fechou a pendência que estava aberta desde 29/07/2026 ("restringir quebraria
quem usa hoje"). **49 rotas** trocaram `adminOnly` por `gestaoOnly`, `/jobs/
verificar-offline` foi pro master e o `operador` saiu de `EQUIPE_ROLES`
(equipamentos). O perfil ficou em quatro telas — **Alertas · Chamados ·
Telemetria · Mapa** — mais Configurações → "Conta": **Contratos e Dashboard
saíram a pedido do Pedro**, e os dois geocoders foram atrás (servem só ao
mini-mapa do cadastro de condomínio).

**Medido, não estimado:** 24 rotas alcançáveis contra 118 bloqueadas, via o
novo `scripts/auditar-rbac.js <role>`. Ele percorre o `stack` real dos routers
e roda cada guard com um `req` de mentira, sem tocar no banco — foi o que
revelou que `osDonoOuAdmin` e `GET /relatorio/pdf` **já barravam o operador**
dentro do handler, metade do trabalho pronta e invisível ao `grep adminOnly`.

O acabamento no front foi metade do serviço: a **gaveta do dashboard** (que
também abre do mapa e da ficha do chamado) tinha três abas apontando pra rota
recém-fechada; a faixa `.mc-fin` expunha o **MRR da empresa**; e o boot pedia
`/whatsapp/conversas` + `/admin/usuarios` a cada carga. `getMyRole()` subiu da
linha 6.659 pro topo do `admin.js` porque o boot precisa decidir por ela.
`admin.css?v=238`, `admin.js?v=324`.

- 📋 **Não deployado.** É quase tudo backend — só vale após deploy, e nenhum
  teste automatizado cobre RBAC.
- ✅ **Risco de deploy: zero.** Pedro confirmou em 27/08 que **não existe
  nenhum usuário `operador` em produção**. O perfil está no código desde
  06/2026 e nunca foi atribuído a ninguém — não há a quem tirar acesso.
  ⚠️ Isso também quer dizer que **a restrição só será exercitada de verdade
  quando o primeiro operador for cadastrado**: as quatro telas dele nunca
  rodaram sob a role real.
- 📋 **Superfície própria pro operador** — avaliada, não decidida. Ver
  [`roadmap.md`](roadmap.md) e [`decisions.md`](decisions.md).

## Sessão 2026-08-26 — PWA: o atalho do iPhone abria aba do Safari

A landing não tinha manifest nem `apple-mobile-web-app-capable`, e é a página
aberta na hora do "Adicionar à Tela de Início" que decide o modo app. Entraram
os dois (com `status-bar-style: black`, porque a landing não tem
`viewport-fit=cover`). Cores do manifest saíram da paleta antiga (#F5A623 /
#0A1628) para `#050f38`. E o `/manifest.json` entrou na lista network-first do
`sw.js` — estava em cache first, então mudança nele nunca chegava a quem já
tinha instalado. `CACHE_NAME` v59 → v60, `register-sw.js?v=50`.
⚠️ **Não testado em iPhone** — é handoff.

## Sessão 2026-08-26 — A ficha do orçamento diz quem o montou

`orcamentos.criado_por` já era gravado em toda criação; faltava a tela mostrar.
A lista do admin traz `criado_por_nome` e a ficha ganhou "Criado por" no trilho,
acima de "Aprovado por". Traço quando não há nome (4 de 56 em produção, e o que
a IA cria). Conferido pela rota real; a tela não foi vista logada — a sessão
caiu no meio. Cache-bust: `admin.js?v=322`.

## Sessão 2026-08-26 — O estado vazio dos orçamentos (Impeccable)

A caixa de contorno virou a peça do sistema (chapa de duas camadas + corte
gravado entre cabeçalho e corpo), com o **texto original preservado**.
⚠️ Na primeira tentativa eu reescrevi a copy inteira num pedido que era só de
visual — o Pedro cortou e está revertido. Refinamento preserva copy; trocar
texto pede pedido próprio. Verificado em harness a 1544px e 412px.
Cache-bust: `cliente.css?v=48`, `cliente-orcamentos.js?v=14`.

## Sessão 2026-08-26 — Selo de orçamentos nascia vazio no painel do cliente

`.conta-selo` tem `display: inline-flex`, que vence o atributo `hidden` — o
selo âmbar ficava aceso e vazio ao lado de "Orçamentos". O `pintarSeloOrc`
estava certo o tempo todo. Uma linha de CSS (`.conta-selo[hidden]`), a mesma
armadilha já documentada no `.campo` do mesmo arquivo. Cache-bust:
`cliente.css?v=47` nas duas páginas. ⚠️ Não visto logado — o painel do cliente
é handoff.

## Sessão 2026-08-26 — Mapa abre no mesmo enquadramento do dashboard

A tela de Mapa ainda usava `fitBounds` com teto de zoom 13 — a regra que o
dashboard abandonou porque um condomínio isolado (Bragança) estica o retângulo
e joga o mapa para o zoom 9. Agora as duas usam `_mcCentroMediano` +
`MC_ZOOM_INICIAL` (11), via `_mpEnquadrar`. Verificado no painel local logado.
Cache-bust: `admin.js?v=321`.

## Sessão 2026-08-26 — A lista diz quem aprovou (aba Respondidos)

Veio de um teste do Pedro — achar, só pelo painel, um orçamento que ele tinha
acabado de aprovar no painel do cliente. Deu para achar, mas abrindo ficha por
ficha: na lista, aprovado-pelo-síndico e aprovado-no-escritório eram iguais.

- Linha do orçamento mostra "Aprovado por Pedro · 26/08" quando a resposta veio
  do cliente (relativo enquanto é pendência, data depois da baixa).
- Aba **Respondidos** — a única que não filtra `status`, e sim `respondido_em`
  (pega aprovado e recusado). Dentro dela, pendências sobem.
- Faixa: uma pendência → "Ver" abre a ficha; várias → abre a aba Respondidos.
- Nota "Visível no painel do cliente" embaixo do seletor de Situação. O
  incômodo do Pedro com "marcar como enviado também envia" fica **em aberto**:
  o caminho padrão é o botão de e-mail, que já resolve; só o efeito colateral
  mudo do seletor foi corrigido.
- ⚠️ Verificado no painel local logado (ele fez o login), com a baixa do
  OR-000058 reaberta para o teste — **está reaberta**, é só dar baixa de novo.
- Cache-bust: `admin.js?v=320`, `admin.css?v=237`.

## Sessão 2026-08-26 — Três acertos na ficha do orçamento

Print do Pedro: o "Vai para fulano@…" do trilho (removido — quem escolhe
destinatário é o modal de envio, e no modo "painel" nem é aquele endereço), o
total manual que mostrava `1234.5` no lugar de `1.234,50` (virou `type="text"`
com máscara pt-BR e `_avParseMoeda` em toda leitura) e o ícone de calendário
invisível nas Condições comerciais (`color-scheme: dark` do `:root` pintando o
indicador claro em campo branco — corrigido com `color-scheme: light` nos
`date` de modal claro).

Cache-bust: `admin.js?v=319`, `admin.css?v=236`.

## Sessão 2026-08-26 — A resposta do cliente vira pendência com baixa

*"O alerta de orçamento aprovado está fraco... alguém clica lá para ver uma vez
e fecha, ou a tela recarrega antes da pessoa ver qual o orçamento é, a
informação se perde."*

- **078** — `resposta_tratada_em` + `resposta_tratada_por` (FK `ON DELETE SET
  NULL`), backfill do que já estava visto, índice parcial.
  ✅ **Aplicada em TESTE e em PRODUÇÃO** (26/08, Pedro rodou com `--prod`) —
  conferido no banco: colunas, índice e backfill de pé.
- `POST /admin/orcamentos/avulsos/:id/resposta-baixa` (idempotente,
  `{ desfazer: true }` reabre). O `resposta-vista` continua, mas deixou de
  apagar o aviso — virou "quem abriu e quando".
- A pendência ganhou três superfícies: faixa (nomeia o documento quando é uma
  só), selo na linha do orçamento e ponto no card do condomínio.
- Testado exercitando as rotas contra o banco de teste, incluindo o
  `responder` do cliente (a query do 42P08) e a reabertura da pendência quando
  o cliente responde de novo. ⚠️ **A parte visual não foi vista logada** — o
  login do painel é handoff.
- Cache-bust: `admin.js?v=318`, `admin.css?v=235`.

## Sessão 2026-08-26 — O link do orçamento voltava a cair em /login

*"Cliquei no link de orçamento pelo e-mail e caí na tela de login com a mensagem
de desconexão por tempo de inatividade."* A tela de orçamentos já declarava, em
`window.aoExpirarInatividade`, que o corte abre o cartão de entrada por cima da
própria página — mas o `inatividade.js` roda **antes** do
`cliente-orcamentos.js` (os dois `defer`), e no corte de carregamento o hook
ainda não existia. Sobrava o `location.href` para `/login?motivo=inatividade`.

- Corte sem hook declarado passa a ser adiado um tique de timer — a fila de
  timers só roda depois de **todo** script `defer`. Independe da ordem das tags.
- A sessão é apagada antes do adiamento: a página boota sem token, abre o cartão
  e não dispara fetch nenhum.
- Testado com a ordem real dos `defer` reproduzida em `vm` (cartão abre e URL
  `?orc=42` fica; página sem hook segue para `/login`; sessão viva não é tocada).
- Cache-bust: `inatividade.js?v=3` em `admin.html`, `cliente.html` e
  `cliente-orcamentos.html`.

⚠️ **Falta ver em produção com o link real do e-mail** — é handoff para o Pedro.

## Sessão 2026-08-25 — A resposta do cliente ganha dono, e-mail e aviso

Pergunta do Pedro: *"um orçamento aprovado no painel, ou um comentário, vai
para onde?"* Ia para o banco e para o log, e para mais ninguém — enquanto a
tela do cliente promete "entramos em contato para agendar o serviço".

- **076** — `respondido_nome`/`respondido_cargo` (quem decidiu, não qual conta)
  + `resposta_vista_em` (nulo = ninguém abriu) + índice parcial.
  ✅ **Aplicada em TESTE e em PRODUÇÃO** (Pedro rodou com `--prod`).
- **077** — marca respostas antigas como vistas, para o aviso não nascer
  gritando sobre trabalho já feito. ✅ **TESTE e PRODUÇÃO** (a produção saiu em
  26/08, junto com a 078).
- E-mail para `manutencao@generalbombas.com` (`ORCAMENTO_RESPOSTA_EMAIL`
  sobrescreve), em `try/catch` próprio — o aviso não pode derrubar a resposta.
- Faixa âmbar no topo de Orçamentos + `POST .../resposta-vista` (idempotente).
- Cargo em lista fechada com "Outro"; ordem por frequência.

Testado contra o banco de teste (grava, vira aviso, marcação idempotente,
revertido) e no Chrome. ⚠️ **Falta o envio real do e-mail**, que é handoff.

## Sessão 2026-08-25 — O envio do orçamento vira duas opções

Pergunta do Pedro — *"a função enviar por e-mail enviará ainda para todos
e-mails cadastrados ou só para quem tem usuário?"* — que expôs um furo aberto
no dia anterior: o e-mail ia para todos os endereços de `condominios.email` e
o formato era decidido por "existe **algum** usuário no condomínio?". Quem não
tinha login recebia link sem anexo e ficava sem o documento.

- `GET /admin/orcamentos/avulsos/:id/destinatarios` — as duas listas.
- `POST .../enviar-email` aceita `modo: painel|carta`. Sem `modo`, comportamento
  antigo (cliente com JS em cache não pode receber erro).
- **Mensagem e assinatura voltaram**, só no modo carta. A infra nunca tinha
  sido removida — só a interface.
- `scripts/preview-modal-envio.js` + rota `/dev/_arquivo.html` (**só fora de
  produção**), que também devolve o acesso aos estudos `public/_*.html`.

**Sem migration.** Testado: as duas listas contra o banco de teste (divergem
nos três orçamentos mais recentes), e os dois modos no Chrome pelo preview.

⚠️ **Falta o envio real**, que é handoff pro Pedro — eu não logo no admin e o
endpoint dispara e-mail de verdade. Conferir nos dois modos: que o painel só
alcança os usuários, e que a carta chega com mensagem, assinatura e PDF.

⚠️ **Em aberto, do fim da sessão:** o rótulo "Meu prédio" no cabeçalho de
orçamentos (nunca escolhido); os comentários de `.js`/`.css`, que continuam
legíveis no F12 e exigiriam build; e o prazo dos aparelhos confiáveis, que hoje
não expiram nunca.

## Sessão 2026-08-25 — A tela de login para de perguntar quem você é

Pedro trouxe o incômodo de os dois públicos entrarem pela mesma
`telemetria.generalbombas` e o login ter um botão perguntando se a pessoa é de
condomínio ou não: *"pense nos cenários, se existe a chance de fazer um jeito
onde você coloca o e-mail primeiro"*. Existe, e virou o caminho —
**identifier-first**. Separar os painéis em domínios diferentes foi avaliado e
descartado (motivo em [`decisions.md`](decisions.md)).

**Entregue:**
- `POST /auth/metodo` (`metodoLimiter`, 40/15 min) — só o e-mail, responde
  `{ metodo: "senha" | "codigo" }`. Não autentica nada. E-mail desconhecido cai
  em `codigo`, para a tela não virar verificador de quem tem conta.
- `login.html` / `login.js` em três passos (`email` → `senha` ou `otp`); saiu o
  `#modoToggle` e todo o par `_modoCodigo`/`_aplicarModo`, que viraram `_irPara`.
- `.identidade` no `login.css`: o e-mail confirmado como etiqueta gravada, com
  "trocar". Mais o estado travado do `.btn` ("Verificando…").
- `/login?email=…` pré-preenche o campo (foco no botão — avançar sozinho faria
  um GET disparar e-mail de código).
- Cache-bust: `login.css?v=6`, `login.js?v=6`, `telemetria-v50`,
  `register-sw.js?v=40` nos três HTMLs.

**Sem migration** — nada de schema mudou. `node --check` passou nos dois
arquivos e o detector da skill `impeccable` não achou nada nas linhas novas.

**Depois, o Pedro perguntou se aquilo tinha aberto falha** — e olhando o fluxo
inteiro apareceu uma **anterior à mudança de hoje e mais séria**: o código de 6
dígitos não tinha teto próprio, só o `otpLimiter` por IP. Quem tem muitos IPs
comprava chutes à vontade dentro dos 10 min de validade, sobre 1.000.000 de
combinações.

- **Migration 075** — `login_codes.tentativas`. Ao 5º erro o código é queimado.
  ✅ **Aplicada no banco de TESTE.** ⚠️ **Falta aplicar em produção:**
  `node scripts/migrate.js 075_login_codes_tentativas.sql --prod`. Sem ela, o
  `verify-otp` quebra em prod (a coluna não existe) — é a lição da Fase 7E.
- **Teto por e-mail** em `/auth/login` (10/15 min) e `/auth/codigo` (5/15 min),
  chave normalizada com `trim` + minúsculas.
- `_codigoConfere` em tempo constante. ⚠️ `code` é `CHAR(6)` e volta com
  padding — sem `trim` todo código legítimo falharia.

Verificado contra o banco de teste (servidor efêmero, sem login): 5 erros
queimam o código; errar 2 e acertar entra; o teto por e-mail bloqueia o 6º
pedido e junta as variações de grafia na mesma cota.

⚠️ **Continua exposto de propósito:** `/auth/metodo` revela se um e-mail é de
colaborador interno. Não fecha sem desfazer o identifier-first; a existência da
conta segue protegida.

⚠️ **Falta o teste com o servidor de pé** (`npm run dev`, porta 3001), que é
handoff pro Pedro: entrar com `admin@teste.local` (deve pedir senha) e com
`demo-cliente@teste.local` (deve ir direto ao código), e conferir o "Voltar" do
passo do código nos dois caminhos.

## Sessão 2026-08-24 — O e-mail do orçamento virou documento da casa

Pedro trouxe como referência o e-mail de NF-e que a empresa recebe da Omie
(print em `Pictures/Screenshots/Captura de tela 2026-08-24 205359.png`):
saudação curta, um parágrafo dizendo o que é o documento, botão, caixa com os
dados da nota e assinatura da empresa. *"Algo parecido com isso, mas com nossa
identidade — e aí poderia remover a parte da mensagem e assinatura que tem hoje
no sistema."*

**Decisões dele nesta sessão** (perguntadas antes de construir):

- **Logo em imagem**, embutido, e não o nome em tipografia.
- **Sem o valor total** na caixa de informações — só Número, Cliente, Data e
  Válido até. O preço fica no PDF.
- **Remoção só da interface**: os campos saem do modal, mas as rotas
  (`/admin/me/email-template`, `/admin/me/assinatura`) e as colunas
  (`usuarios.email_mensagem`, `assinatura_blob`) ficam de pé. Sem migration,
  sem perder as assinaturas já cadastradas.

O detalhe que quase passou: o logo embutido é o **reduzido**
(`public/logo-email.png`, gerado por `scripts/gerar-logo-email.js`). O
`logo-topo.png` original vira 91 KB em base64 e o Gmail apara o corpo acima de
~102 KB — o anexo não conta, o data URI conta. Corpo final medido: 31 KB.

Verificado no Chrome com `scripts/preview-email-orcamento.js`, que dubla o SDK
do Resend e mostra o payload real: as duas variantes (com e sem o botão do
painel), o texto puro, as datas sem pular um dia, e o caso da **imagem
bloqueada** — que é o normal no Outlook — em que o `alt` estilizado mostra
"General Bombas" em branco sobre a faixa marinho.

## Sessão 2026-08-24 — O total manual estava sendo apagado no banco

Ainda no mesmo modal, Pedro: *"outra coisa q acontece é qnd defini manualmente
muitas vezes salva no pdf o valor, mas no sistema continua 00,00."*

Não era exibição: `GET /admin/orcamentos/avulsos` devolvia só o `valor_total`
já resolvido e **não** a coluna `orcamentos.valor`. O modal usa `o.valor` pra
saber se o modo manual está ligado — sem a chave, ele abria com o campo vazio,
o trilho caía pra soma dos itens (R$ 0,00, porque o total manual é usado
justamente quando item não tem preço) e o "Salvar" seguinte mandava
`valor: null`, apagando o total no banco. O PDF lê o banco, então continuava
certo até alguém salvar — foi isso que fez o defeito parecer cosmético.

**Estrago em produção, sem recuperação automática:** `OR-000170` (Condomínio
Collori), `OR-000169` e `OR-000105` (Vivaz Penha) estão aprovados com total
R$ 0,00. Não há auditoria com o valor antigo — os PDFs já enviados são a única
cópia. **Pendência para o Pedro: redigitar os três.**

Consertado nos dois lados: a lista traz `o.valor` (com comentário de contrato
na query) e o `_avAcao` só manda `valor` quando a chave existe no registro,
pra que a próxima quebra de payload vire "não atualizou" em vez de perda
silenciosa.

**Lição registrada em [`decisions.md`](decisions.md):** quando a tela EDITA um
campo, o payload precisa da coluna crua, não só do agregado já resolvido.

## Sessão 2026-08-24 — O valor manual passou a ser editado no lugar do total

Pedro, olhando o modal de orçamento: *"n acho q faça sentido abrir um campo
qnd clica para colocar o valor manualmente, devia da pra mudar no lugar q ja
fica o valor normalmente."*

Estava certo, e o defeito era mais feio que o incômodo: com o campo extra
aberto, o trilho mostrava **dois totais ao mesmo tempo** — o somado, grande,
em cima; o digitado, pequeno, embaixo — e só a nota "Sobrepõe a soma dos itens
no PDF" dizia qual dos dois valia.

Agora o campo ocupa o lugar do número (mesma fonte, mesmo corpo, mesmo `y`), a
régua âmbar é o único sinal de que ali virou campo, e a linha de apoio troca
`4 itens · definir manualmente` por `soma dos itens: R$ 6.460,00 · voltar a
somar` — a soma continua à vista porque é o número que está sendo sobreposto.

O salvamento não mudou: `_avAcao` lê `avInputValorManual` como sempre, e
desmarcar limpa o campo → `valor: null`.

**Como foi verificado, sem banco e sem login:**
`node scripts/preview-total-orcamento.js` (novo, no padrão do
`scripts/preview-orcamentos.js`) serve `public/` e monta só o trilho, mas
**extrai do `admin.js` real** as funções `_orcFmtValor` e
`_avAtualizarTotalRail` — fatia por contagem de chaves e avalia soltas, em vez
de copiar. O CSS e a lógica olhados são os de produção. Foi ele que mostrou os
6px de pulo do trilho a cada clique (`.av-total` ganhou régua transparente do
mesmo tamanho) e os 2px extras do `align-items: baseline` no "R$" — nenhum dos
dois aparece em captura, só medindo `getBoundingClientRect` nos dois estados.

Cache-bust: `admin.css` v228→v229, `admin.js` v310→v311.

## Sessão 2026-08-24 — O link do orçamento estava indo para cliente real

Pedro retomou a tela de orçamento do cliente (commit `3129292`, de 21/08) com
um aviso: **o e-mail já estava saindo com o link para cliente real** e a tela
nunca tinha sido validada com ninguém logado.

Verificado antes de mexer: a página **está no ar** — `GET
/cliente/painel/orcamentos?orc=1` responde 200 e o JS é servido. Ou seja, o
link não caía em 404; o risco era a tela quebrar depois do login.

### O que estava quebrado de fato

O botão "Abrir o PDF" era `<a href>` para `GET /cliente/orcamentos/:id/pdf`,
que é `authRequired`. O `authRequired` (`src/middleware/authRequired.js`) lê
**só** o header `Authorization: Bearer` — não há cookie de sessão neste
sistema — e navegação por link não manda header nenhum. Resultado garantido,
para todo cliente: aba nova com `{"error":"Token ausente"}`.

Consertado com o padrão que o próprio `public/cliente.js` já usa (`baixarPDF`):
`<button data-pdf>` → `baixarPdf()`, com `fetch` + `authHeaders()`, blob e
âncora com `download`. **Download em vez de aba nova** porque `window.open`
depois de um `await` cai no bloqueador de pop-up do celular — que é justamente
onde o link do e-mail é aberto.

Cache-bust: `cliente.css` v31→v32 nos dois HTMLs, `cliente-orcamentos.js`
v1→v2. `CACHE_NAME` do SW **não** subiu: não entrou endpoint novo e `/cliente`
já estava na lista network-first.

### O convite no e-mail foi desligado (24/08) e religado (25/08)

`linkPainel` em `POST /admin/orcamentos/avulsos/:id/enviar-email` depende de
`_linkPainelLigado()`, que lê `ORCAMENTO_LINK_PAINEL`. Nasceu **desligado por
padrão**, enquanto a tela do cliente não tinha sido vista com ninguém logado.

**Em 25/08/2026 o padrão inverteu:** o convite sai ligado e a variável virou
kill-switch — `ORCAMENTO_LINK_PAINEL=0` volta ao formato antigo, sem deploy.
Duas correções vieram junto, do primeiro envio real (OR-000175):

- **O link não dependia mais de `APP_URL`.** Sem a variável, o e-mail saía sem
  link nenhum e em silêncio. Agora `_baseUrlPublica(req)` tenta `APP_URL`,
  depois `PUBLIC_BASE_URL`, e por fim deriva do próprio request (o app roda com
  `trust proxy`). E o link só é montado quando o condomínio tem usuário
  `cliente` — botão que leva a um login onde ninguém entra é pior que botão
  nenhum.
- **Com link, o e-mail não leva o PDF anexado.** O documento mora no painel,
  que tem o botão "Baixar o PDF"; anexo e link competindo davam ao síndico um
  caminho que termina sem resposta. De quebra, o envio comum deixou de depender
  do Puppeteer — o PDF passou a ser gerado sob demanda.

### O redesenho do documento (segunda parte da sessão)

Pedro viu a tela e apontou duas coisas: o acesso estava **enterrado dentro de
"Sua conta"**, e o documento era **esparso demais**. Referência que ele
mandou: a página pública de NF-e do Omie.

⚠️ **A instrução foi explícita: "não quero que copie a página, é só para você
entender o conceito."** O que veio de lá é a disciplina de informação —
nenhum dado sem rótulo, tudo em blocos nomeados, ações agrupadas num painel.
A pele continua Chapa. Nada de canto arredondado, verde-menta ou coluna
lateral.

Feito: ícone de orçamentos no cabeçalho do painel com selo de pendência ·
número vira título · faixa de metadados rotulados · condições em células ·
tabela com total por linha e soma · ficha técnica sob a descrição · painel
"Documentos" · seções com título e linha de apoio · tabela vira lista
rotulada abaixo de 760px.

⚠️ **LIÇÃO DA SESSÃO — verificar em tela não basta; tem que ser a tela
certa.** A primeira rodada foi "verificada" e mesmo assim o Pedro abriu e
achou três defeitos em dois minutos. As três falhas do método:

1. **Só o documento, nunca a lista.** Todos os cenários entravam direto em
   `?orc=N`. A pergunta "e se tiver mais de um orçamento?" não tinha
   resposta porque nunca renderizei dois.
2. **Só a 1440px.** A tela do Pedro tem ~1900 de largura útil. Uma coluna de
   780px que parece razoável a 1440 vira uma tira com 800px de vazio ao lado.
3. **Nunca uma página curta.** O rodapé flutuando no meio só aparece quando o
   conteúdo é menor que a viewport — o caso mais comum desta tela.

E uma quarta, de execução: **fechei a aba do Chrome no fim.** Se tivesse
deixado aberta, ele teria visto na hora em vez de descobrir depois.

⚠️ **Medir no DOM, não confiar na captura.** O `display: flex` que pus no
`<body>` para colar o rodapé encolheu o `.folha` de 1240px para 740px (a
`margin: 0 auto` do filho desliga o stretch num contêiner flex). A olho a
página parecia certa; só `getBoundingClientRect` mostrou. Mesma lição já
registrada na reconstrução do painel do cliente.

Detalhe do antes/depois em [`../docs/changelog.md`](../docs/changelog.md).

### Pendências desta frente

- [x] ~~Rodar a migration 074~~ — **aplicada em produção em 24/08.** As três
      colunas (`cliente_comentario`, `respondido_em`, `respondido_por`)
      apareceram na listagem que o `migrate.js` imprime ao fim.
- [x] ~~Rodar a 073~~ — **já estava aplicada.** Rodada em 24/08 sem emitir
      nenhum NOTICE, ou seja, não achou FK em NO ACTION para converter.
- [ ] **Ver a tela logado.** Segue sem validação: lista, documento, aprovar,
      recusar (que exige comentário), o PDF consertado e o retorno do `next=`
      do login.
- [ ] **Religar o link** só depois dos dois itens acima.

## Sessão 2026-08-24 (parte 2) — O menu lateral do admin não cabia na tela

Pedro: *"o menu do painel que fica à esquerda precisa scrollar para ver tudo e
acho que isso não faz sentido em um menu"*. Está certo, e era pior do que
parecia.

**Medido antes de mexer** (Puppeteer sobre a `public/admin.html` real,
viewport de 1040 a 620px, com e sem o item Atendimento): **22 dos 28 cenários
rolavam**. Em 936px — janela maximizada num monitor 1080p, o caso do Pedro —
a nav pedia 814px e tinha 727px. E havia um buraco entre as duas faixas de
`@media (max-height)`: entre 780 e 860px a lista rolava mesmo em tela grande,
porque a faixa de 900px já não cabia ali e a próxima só começava em 760px.

**O que mudou** (só `public/admin.css` + o `?v=N` no `admin.html`):

- `.nav-section-label` virou filete de 1px. O texto **fica no HTML** — o
  `admin.js` varre esses elementos para esconder grupo órfão no perfil
  operador (conferido: em operador o grupo "Em curso" some inteiro e o filete
  vai junto, sem aresta dupla).
- Três faixas de altura em vez de duas, sobrepostas de propósito.
- Na barra recolhida o filete passou a **aparecer** — antes o rótulo só
  desbotava e deixava vão morto entre os ícones.

**Resultado, depois de duas rodadas de correção:** varrendo de 1 em 1px de 980
a 590px, há **uma única transição** — abaixo de 614px a nav rola, acima não.
Conferido também no Chrome real do Pedro (1920×945): antes 814px de conteúdo
para 738 disponíveis (rolava); depois 678 para 738, com 60px de folga.

### As duas rodadas que a pergunta do Pedro provocou

Ele perguntou: *"vc abriu no chrome para ter certeza?"*. Não tinha — só
Puppeteer. Abrir no Chrome dele achou **dois erros meus de medição**:

1. **Faltou esperar a fonte.** Sem `await document.fonts.ready` o rodapé mede
   102px em vez de 119px (o `.sidebar-user` encolhe com a fonte de fallback).
   Os pisos de faixa que escrevi no comentário do CSS saíram ~16px otimistas —
   "cabe até ~815px" quando o real era 886.
2. **Amostra esparsa não prova ausência de buraco.** A primeira varredura usou
   alturas fixas (936, 900, 860…), deu 28 de 28 verdes, e mesmo assim havia
   uma janela de 5px — **882 a 886** — em que a faixa base valia e os 678px
   não cabiam. O breakpoint foi de 880 para **900** por causa disso.

**A lição** (registrada em [decisions.md](decisions.md)): minha primeira
estimativa, feita a mão, dizia que a nav "cabia por 6px" em 1080p. A medição
disse que faltavam 87px. **Layout de tela cheia se mede, não se estima.** Foi
a medição também que pegou os dois buracos entre faixas que a primeira versão
da correção ainda deixava (em 760px e em 660px).

**Nada de backend, nada de schema.** Sem endpoint novo, então o
`CACHE_NAME` do `sw.js` não subiu — só `admin.css?v=223` e
`admin.js?v=308`.

## Sessão 2026-08-24 (parte 3) — O filete voltou a ser texto no mesmo dia

Pedro, olhando o resultado ao vivo da parte 2: *"eu só acho q esta feio, os
icones mt espaçados, sem titulos separando"*. O julgamento de custo (136px
por texto que ninguém clica) estava certo; o de resultado, não — sem
legenda, a folga que o `margin-top: auto` distribuía entre os quatro grupos
lia como acidente, não como respiro.

**Verificado ao vivo antes de mexer**, não só por leitura de CSS: logado no
admin de teste (`admin@teste.local`/`teste123`, banco TESTE do Railway,
`node server.js` local) via extensão do Chrome conectada, com a janela real
do navegador (~1920×889 — cai na faixa `max-height:900px`, a mais comum no
dia a dia). Print do menu aberto e recolhido antes de qualquer edição.

**O que mudou** (só `public/admin.css` + `?v=N` no `admin.html`):

- `.nav-section-label` volta a ser texto (mono, 8,8px — o piso do DESIGN.md
  pra etiqueta gravada, `.55rem`). `margin-top: auto` saiu; a folga sobrando
  agora fica só no fim da lista, não repartida entre os grupos.
- Recalibrado com o mesmo método da parte 2 (Puppeteer, pior caso de 15
  itens, varredura de 1 em 1px): texto cabe nas três faixas de cima (base,
  `max-height:900px`, `max-height:800px` — essa última cobrindo o notebook
  comum). Só `max-height:700px` (614–700px, notebook com barra de tarefas)
  ficou com o filete: 0,8px de folga no pior pixel, sem espaço pra letra.
- Na barra recolhida o rótulo **continua filete** — 38px de trilho não
  escreve "CADASTRO" sem cortar, e cortado é pior que sem texto nenhum.

**Resultado:** nova varredura completa (980→590px) confirmou overflow só na
mesma faixa de sempre (abaixo de 614px, por design). Conferido também ao
vivo no Chrome conectado, na janela real (889px) que motivou a reclamação —
"EM CURSO", "CADASTRO", "ANÁLISE", "SISTEMA" voltaram a aparecer.

### Parte 4 — "está mt compactado", e aí apareceu a causa real

Pedro mandou o print do menu. A lista estava mesmo espremida, mas o rótulo
não era o culpado: **a faixa de `@media` era larga demais**. A faixa de
801–900px tinha de caber em 801px, então quem estava em 889px levava um
aperto que não precisava — medido no painel dele, 563px de lista dentro de
702px disponíveis, ou seja **139px de vão morto** entre "Configurações" e o
rodapé, com tudo comprimido no topo.

**Três degraus viraram oito** (base, 1000, 940, 890, 850, 800, 750, 700),
cada um conferido no piso da própria faixa com o pior caso de 15 itens.
Item vai de 40px a 27px em passos pequenos; margem do rótulo, de 16px a
filete. Também troquei o padding simétrico do rótulo por `margin-top` — ele
pertence ao grupo que abre, então a folga tem de ficar acima dele, não em
volta.

**Resultado medido:** varredura de 1100→590px de 1 em 1px, overflow só
abaixo de **598px** (era 613px — a escada fina é mais eficiente, não só mais
confortável). No painel real em 889px: vão morto de 139px → **93px**, item
34px → 35px, separação de grupo 3px → 12px.

Detalhe das duas tabelas de faixas em
[`../docs/changelog.md`](../docs/changelog.md); o porquê, a lição do piso de
8,8px e a regra "faixa larga é aperto disfarçado" em
[`decisions.md`](decisions.md). Cache-bust: `admin.css?v=228`.

## Sessão 2026-08-19 — Remover usuário dava erro 500

Pedro relatou "erro ao remover o usuário" na tela de Configurações > Usuários.
Não era bug de UI: `DELETE FROM usuarios` batia em FK `NO ACTION` e o `catch`
genérico devolvia 500.

Feito: **migration 073** (converte toda FK → `usuarios` em NO ACTION/RESTRICT
para `ON DELETE SET NULL`, varrendo `pg_constraint` em vez de listar nomes
fixos) + tratamento de `23503` no endpoint (409 nomeando a tabela). Front não
mudou — `_cfgRemoverUsuario` já exibia `data.error`, então **não houve bump de
`?v=N`**.

- ⚠️ **A migration ainda não rodou** — a consulta ao banco de produção foi
  bloqueada pelo classificador de permissões nesta sessão. Rodar:
  `node scripts/migrate.js 073_fk_usuarios_on_delete_set_null.sql --prod`
  (sem `--prod` vai no banco de teste). Enquanto não rodar, o sintoma continua
  — só que agora com mensagem legível em vez de 500.

## Sessão 2026-08-18 — Área segura do iOS + estudo do painel admin

Duas frentes, nenhuma delas fecha nesta sessão.

### 1. Área segura do iOS no admin (código, pronto para commit)

Continuação do conserto que o commit `f469204` fez no painel do cliente e no
login no mesmo dia. O `admin.html` ficou de fora: declarava `black-translucent`
sem `viewport-fit=cover`, e o `admin.css` não tinha **nenhum**
`safe-area-inset-top` — só os três `inset-bottom` da bottom nav.

Feito: `viewport-fit=cover` no `admin.html`; `.mob-topbar` cresce com
`env(safe-area-inset-top)`; `.main` e `.layout-cli .main` descontam a altura
nova; `.drawer-head` idem (no celular o drawer é tela cheia). Cache-bust:
`admin.css` v191, `register-sw.js` v37 nas três HTMLs, `CACHE_NAME` →
**telemetria-v46** (`admin.css` está no precache). Mecanismo documentado em
[`../docs/arquitetura.md`](../docs/arquitetura.md), seção "Área segura do iOS".

- ⚠️ **Não commitado ainda.**
- ⚠️ **Não verificado em iPhone** — não há aparelho iOS neste ambiente. Em tela
  sem entalhe `env()` vale 0 e o resultado é idêntico ao anterior, o que é
  garantido por construção (`calc(56px + 0px)`).

### 2. Estudo do painel admin (nada tocado no código)

Pedido do Pedro: aproximar o visual do admin do Chapa da landing/painel do
cliente, podendo reorganizar tudo, mas sem virar exercício teórico — tem de
continuar funcionando como a ferramenta que é.

As 15 telas foram percorridas no painel em execução contra o banco de teste. O
levantamento e os defeitos medidos estão em
[`../docs/modulos/painel-admin.md`](../docs/modulos/painel-admin.md); o "porquê"
e as duas direções descartadas, em [`decisions.md`](decisions.md).

**Pendências:**
- Nada foi alterado em `public/admin.css` nem em `public/admin.html` por conta
  do redesenho — só as mudanças de área segura acima.
- `DESIGN.md` **não** foi reescrito, de propósito: ele descreve o que foi
  construído, e no repo ainda não foi.
- Falta decidir a paleta categórica dos gráficos ApexCharts (hoje ~20 hex do
  Tailwind inline no `admin.js`) e se o app do técnico migra junto.
- O reagrupamento da nav (Agora / Em curso / Cadastro / Análise) foi proposto
  mas **não** entrou no mock — depende do uso diário, que é chamada do Pedro.
- Mocks publicados como artifact (fora do repo): comparativo de camadas e as
  quatro telas em Chapa (Chamados, Alertas, Dashboard, Configurações).

⚠️ Achado colateral: o `.env` tem **`DATABASE_URL` duplicado** (as duas em
produção, a segunda vence), e a senha de `DATABASE_URL_TESTE` foi exposta num
transcript em 18/08 — convém rotacionar no Railway.

---

## Sessão 2026-08-17 — Equipamentos com etiqueta QR (Fase 12A)

Pedido do Pedro: a oficina acumula bombas retiradas de condomínios e ninguém
sabe de onde vieram nem qual era o problema. Solução desenhada: QR impresso e
colado na bomba, que abre a ficha com todo o histórico.

**Feito:** ver [changelog](../docs/changelog.md) e
[equipamentos.md](../docs/modulos/equipamentos.md). O que não é óbvio pelo diff:

- O `roadmap.md` já previa a tabela `equipamentos` no backlog futuro, com a
  justificativa exata do pedido — o módulo saiu de lá, não do zero.
- A O.S. **já tinha** os tipos `retirada_equipamento` e `devolucao`
  (`src/routes/ordens-servico.routes.js`), sem nada do outro lado. Ligar os
  dois é a Fase 12C.
- O escopo foi cortado deliberadamente na identidade (12A). Bancada com
  estados, dias parados, peças e orçamento é 12B — a Fase A por si já mata a
  dor descrita ("de quem é e o que tem").

**Verificado contra o backend real** (banco de **teste**, servidor local e
navegador): geração de lote, PDF das duas folhas, vínculo da etiqueta em
branco, ciclo `retirada → pronto → devolucao`, upload de foto com compressão
client-side (2400px → 1280px) e os guards (401 sem token, 403 para `cliente`,
404 para código inexistente). `node --check` em todos os arquivos tocados.

**Pendências desta sessão:**
- ✅ Migration 070 aplicada em **teste e produção** (17/08). Em dev o
  `migrate.js` vai para o banco de teste por padrão; produção exige `--prod`.
- ⚠️ **`PUBLIC_BASE_URL` precisa entrar nas envs do Railway** antes da primeira
  folha real: sem ela o gerador recusa imprimir (barra host local de propósito).
- A ficha nunca foi aberta em **aparelho real** escaneando uma etiqueta
  **impressa** — o QR foi validado na tela, não no papel amassado da bancada.
- O `?v=N` de `equipamento.css`/`equipamento.js` está em `1`; ao mexer neles,
  bumpar como se faz com o admin.


## Sessão 2026-08-14 — O cabeçalho do painel vira o da landing

Pedido do Pedro: *"deixar o cabeçalho igual o da landing page, mesmo tamanho,
tamanho de logo etc"*. O "o quê" está no [changelog](../docs/changelog.md), o
fluxo em [painel-cliente.md](../docs/modulos/painel-cliente.md). O que não é
óbvio pelo diff:

- **"Igual" era falso no desktop também.** As duas barras batiam em 74px, mas
  a do painel chegava lá por `padding 17 + logo 40 + 17` — número derivado, não
  declarado. Bastava um elemento crescer dentro dela para a altura sair do
  documentado, e foi assim que ela virou 85px numa sessão anterior. Agora é
  `height: var(--barra-h)`, com os mesmos nomes de token do `landing.css`.
- **O bloqueio real estava no celular, e era o nome do prédio.** Ele obrigava a
  barra a duas linhas (~107px) e, por isso, a não grudar. As duas saídas
  possíveis conflitavam com decisões registradas: truncar tinha sido recusado
  em 14/08, e manter as duas linhas mantinha a divergência. Perguntei em vez de
  escolher; o Pedro tirou o nome da barra.
- **Ele não perdeu o papel de título da tela, mudou de lugar:** virou
  `.placa-topo`, o cabeçalho do instrumento, separado do corpo pelo sulco
  gravado. Isso é o que impede a peça de virar **etiqueta acima de manchete**,
  que é forma proibida. Se um dia encolher para mono em caixa alta, virou
  eyebrow e é para tirar.
- **A coluna inteira foi alinhada junto** (escolha dele): `.folha`, barra e
  rodapé agora usam `var(--gut)`, o recuo da `.area` da landing. A largura útil
  do painel caiu de 1160 para 1128px.
- ⚠️ **Primeira vez que o painel rodou contra o backend real.** Servidor local
  na 3001, banco de TESTE, `demo-cliente@teste.local` (estado "sem sinal").
  Todas as medições anteriores eram harness estático com `fetch` dublado.

**Aberto:**
- ⚠️ **A ação a 320px.** "Preciso de ajuda" fecha em **586,1px** no estado sem
  sinal, contra os 569 documentados — ~17px pior, porque o cabeçalho da placa
  custou ~50px e a barra só devolveu 43. A 390px folga (568,9px). Num viewport
  de 568px o botão fica parcialmente abaixo da dobra. **Não ajustei**: o
  aparelho é praticamente extinto e micro-tunar padding contra ele custa mais
  do que vale. Decisão a confirmar com o Pedro.
- **A barra de rolagem da landing não é a do painel.** O painel estiliza
  (`::-webkit-scrollbar`, 10px); a landing fica com a nativa (15,3px medidos).
  Descoberto ao comparar as duas barras; fora do escopo do pedido.
- Os quatro itens de 14/08 que continuam em aberto (âmbar quádruplo no estado
  "atenção", crista amarela, prédio em corte) seguem sem veredito.

## Sessão 2026-08-13 (parte 2) — Painel do cliente reconstruído

Pedido do Pedro logo depois da landing e do login: *"hoje acredito que está
muito ruim, e o principal problema foi tentar copiar o painel de admin"*. O
"o quê" está no [changelog](../docs/changelog.md), o fluxo em
[painel-cliente.md](../docs/modulos/painel-cliente.md) e o "porquê" em
[`decisions.md`](decisions.md). O que não é óbvio pelo diff:

- **O diagnóstico dele estava certo e era mais fundo que aparência.** O painel
  **não era inspirado** no admin — ele carregava `admin.css` inteiro (265 KB) e
  tinha 385 linhas de override por cima. Junto com a paleta vinha a
  **arquitetura de informação**: *Dashboard* e *Telemetria* existem no admin
  porque ele olha N condomínios; no cliente eram duas telas mostrando os mesmos
  3–5 reservatórios, com componentes diferentes para o mesmo dado.
- **A correção foi desacoplar, não repintar.** `cliente.css` virou folha
  autônoma mantendo os ~225 nomes de classe que o `cliente.js` emite — trocou
  o mundo sem tocar no contrato de markup. Isso é o que tornou o redesenho
  viável numa sessão.
- **A estrutura veio de sorteio, não do meu gosto.** Sete estruturas derivadas
  do que o síndico faz; o seed do Impeccable (`06d85de2`) apontou a nº 6, a
  linha do tempo. Ela venceu por razão de produto: o síndico precisa **prestar
  contas**, e o painel antigo descartava toda a temporalidade menos um gráfico.
- ⚠️ **Tirei o tanque cilíndrico em SVG** que o Pedro aprovou em julho, e pus a
  coluna d'água da landing no lugar. O motivo é o mesmo do redesenho (o
  cilindro é o componente do admin, portado), mas **é uma reversão de escolha
  dele** — está avisado e pode voltar atrás.
- ⚠️ **Quase perdi o `cliente.js`.** Um script meu de remoção de funções órfãs
  varreu até o fim do arquivo e truncou 1.879 linhas para 41. Restaurado do git
  e reaplicado. A lição virou cicatriz em [`decisions.md`](decisions.md):
  remoção em lote por script se faz com parser ou não se faz.
- **Bugs reais achados no caminho** (todos corrigidos): `wa.me` com número
  inventado; `.mob-topbar` com `sticky` estando no fim do `<body>`, logo nunca
  grudava; "Em atendimento" pintado de vermelho; tabelas sem tratamento mobile;
  sidebar recolhida sem rótulo nenhum.
- **Backend intocado.** Nenhuma rota, campo ou migration; e como não houve
  endpoint novo, o `sw.js` não foi tocado.

## Sessão 2026-08-14 — Painel do cliente: a v3 virou código

A comp v3 (`docs/comps/painel-cliente-v3.html`), refinada ao longo de 14/08,
foi **implementada** em `public/cliente.html` + `cliente.css` + `cliente.js`.
Os três arquivos foram reescritos; o backend não foi tocado. Detalhe técnico em
[`../docs/modulos/painel-cliente.md`](../docs/modulos/painel-cliente.md) e no
[`../docs/changelog.md`](../docs/changelog.md).

**O que mudou de verdade:** a navegação inteira saiu (sidebar, colapso, topbar,
KPIs, abas, buscas, tabelas, as três seções). A página virou **resposta +
história + rodapé**, e tudo que sobrou virou **ficha**: pedir ajuda, chamado
(passos + conversa + avaliação no pé), todos os reservatórios, reservatório
(gráfico + PDF) e sua conta (senha + sair). Nenhuma funcionalidade saiu.

**Três bugs reais achados na verificação, e os três só apareceram medindo:**

1. `overflow-x: clip` só no `body` **não segura** — a 390px a página rolava
   66px para o lado por causa da engrenagem que sangra. Precisa estar em `html`
   **e** `body`.
2. A prova era reconstruída a cada tick de 10s e a **lâmina d'água voltava a
   zero e subia de novo**. Num painel de nível de água, tanque esvaziando
   sozinho a cada dez segundos é a leitura errada. Agora só redesenha quando a
   assinatura da leitura muda.
3. `desdeQuando` arredondava: 40 segundos viravam "há 1 min". Virou piso.

⚠️ **Duas vezes a captura de tela mentiu** (barra "fora de posição", rodapé com
sobra) e as duas vezes o `getBoundingClientRect` mostrou que estava certo. A
regra do brief vale: medir, não olhar JPEG reduzido.

**Passada de celular, no mesmo dia (o Pedro cobrou).** Ele arrastou a página
para o lado no celular e mandou a captura. Era **a comp**, não o código: eu
tinha corrigido o `overflow-x` em `public/cliente.css` e deixado
`docs/comps/painel-cliente-v3.html` com o defeito. Corrigida — a comp é o
artefato que ele abre para revisar.

Mas a varredura em **oito larguras** (320→768), em vez de só 390, achou o
defeito que importava: ⚠️ **"Preciso de ajuda" caía abaixo da dobra nos estados
de alarme** (787px no sem sinal, 729px no de atenção, 700px no crítico, a
390px). A tese do painel — "a primeira tela é a resposta, com UMA ação" —
quebrava no aparelho prioritário, e eu não tinha visto porque só olhei o estado
calmo com atenção. Corrigido com `order` na quebra de 820px (a ação sobe, a
linha de atendimento desce para logo acima da prova), apoio mais curto e a
linha de atendimento em duas linhas. Base do botão agora: 434–564px em todos os
estados, a 390 e a 320.

⚠️ **Regra que fica: uma largura só não é verificação de celular.** Medir a
altura até a ação em todos os estados, em pelo menos 320 e 390.

**Pendências desta sessão:**

- ⚠️ **Nada rodou contra o backend real.** Harness estático com `fetch`
  dublado, contact sheet de 8 estados × 2 tamanhos (1920px e 390px).
- ❓ **O âmbar no estado "atenção"**: palavra + número + anel do tanque +
  botão, quatro regiões âmbar contra a regra de "uma vez por tela". Veio assim
  da comp aprovada — não mexi sozinho, precisa do teu veredito.
- ❓ **O gráfico da ficha perdeu o tooltip** ao sair do ApexCharts (a comp não
  previa tooltip; quem dá o valor de agora é a linha de estado no topo).
- 📋 `ja_avaliado` no SELECT da lista de chamados — uma linha que elimina as
  requisições de detalhe que hoje existem só para o convite a avaliar.
- 📋 `alertas_recentes` em `/cliente/status` (alerta que abre e nunca fecha).
- A branch `feature/landing-publica` acumula landing + login + painel v3 e
  **ainda não foi mergeada**.

---

### ⚠️ Histórico: a v1 foi rejeitada; a v2 virou a v3

> Esta seção é **registro do caminho**, não instrução. O código em
> `public/cliente.*` é a **v3**, descrita na sessão de 14/08 acima. O que
> continua valendo aqui é o diagnóstico da rejeição — por que reimaginação
> parcial é repintura.

**A v1 não era o alvo.** O Pedro a recusou no fim
da sessão: *"ficou parecido com o painel admin só que pior"*, *"o menu
colapsável não funciona tão bem quanto no admin"*, *"o que parece que mudou de
fato é o visual, e achei muito poluído"*. Ele tem razão, e o diagnóstico é
simples: **reimaginei uns 30% e repintei o resto** — a estrutura escolhida pela
skill governou uma seção, e a casca do admin (sidebar com colapso, topbar,
KPIs, abas, busca, tabelas) ficou inteira.

**A v2 está aprovada como direção** ("não está perfeito, mas dá pra ser um
norte"), e existe como comp:
[`../docs/comps/painel-cliente-v2.html`](../docs/comps/painel-cliente-v2.html).
A primeira tela inteira é uma frase ("Tem água.") com os reservatórios como
prova e uma ação; abaixo, a história do prédio; sem seções, sem navegação —
alerta e chamado abrem como ficha. Racional em [`decisions.md`](decisions.md),
estratégia durável em `.impeccable/surfaces/public-cliente-html.md`.

**O que a v2 abriu e a v3 fechou em 14/08:** a água ficou **sempre azul** (muda
o número e a palavra, não a substância); a frase do dia normal virou **"Seu
prédio está abastecido."**; o **cilindro voltou** (reproporcionado, sem limiar
dentro do tanque); e os órfãos ganharam lugar — troca de senha e "sair" na
ficha *Sua conta*, avaliação no **pé da ficha do chamado**, cliente sem
telemetria como **a mesma tela com outra resposta**, e o histórico com períodos
dentro da ficha do reservatório, que é onde o `device_id` do PDF tem de onde
sair.

⚠️ **A dúvida do merge deixou de existir**: a branch não carrega mais a v1
rejeitada, e sim a v3. Os bugs que a v1 tinha corrigido (WhatsApp com número
inventado, `.mob-topbar` que nunca grudava, "Em atendimento" em vermelho,
tabelas sem mobile) continuam corrigidos — a maioria porque as peças que os
hospedavam deixaram de existir.

## Sessão 2026-08-13 — Landing: madrugada fora, voz em primeira pessoa

Dois ajustes pedidos pelo Pedro sobre a página já redesenhada. O "o quê" está
no [changelog](../docs/changelog.md); o "porquê" em
[`decisions.md`](decisions.md). O que não é óbvio pelo diff:

- **A seção nova levou três tentativas.** (1) Três cards iguais lado a lado —
  o contêiner preguiçoso, vício da versão rejeitada em agosto; virou **uma
  placa só** dividida por cortes gravados (`--rasgo` + `--luz`), com a
  anatomia do instrumento do hero. (2) O conteúdo era "três falhas que a boia
  não reporta", que o Pedro identificou como **a seção 'Três peças no prédio'
  repetida com outro nome** — sonda / sensor de corrente / central. (3) Ficou
  o **ciclo do serviço**: medimos → avisamos → atendemos, + o painel.
  ⚠️ Duas coisas para não desfazer: não transformar a placa em cards, e não
  voltar a descrever sensores em `#servico`.
- ⚠️ **A landing tem dois leitores.** Muito texto estava escrito só para quem
  já é cliente da manutenção ("a mesma equipe que já troca a sua bomba"). O
  Pedro pegou isso. Vínculo existente agora entra sempre como condicional.
- **A tela de login entrou no escopo.** O Pedro apontou o degrau: sair da
  landing e cair num login âmbar do Mission Control parecia outra empresa.
  Refeita em split screen no mundo "Chapa". ⚠️ Como `landing.css` só é servido
  em `/`, o `login.css` **duplica** os tokens — mudança de paleta agora é em
  dois arquivos.
- ⚠️ **A `DESIGN.md` tinha uma descrição errada que me fez escrever bug.** Ela
  dizia que o anel de foco amarelo "fica por fora, a 3px", mas o `landing.css`
  sempre usou `inset` — porque `clip-path` recorta qualquer coisa pintada fora
  da caixa. Segui a doc no login e o indicador de teclado não aparecia.
  Corrigida. Se achar outra descrição da `DESIGN.md` que não bate com o CSS,
  **o CSS é a verdade**.
- ⚠️ **O contrato de posicionamento agora existe e está no `PRODUCT.md`.** Foi
  o Pedro que parou o trabalho para fechá-lo, depois de quatro rodadas de
  remendo. **Produto é protagonista** (os 20 anos são garantia, não abertura)
  e **não nos posicionamos contra ninguém**. Isso inverteu um princípio que
  estava no `PRODUCT.md` e que eu tinha derivado sozinho. Antes de escrever
  qualquer copy nova, ler o contrato — não improvisar posicionamento.
- **A pendência da revisão de 11/08 está resolvida.** O revisor pediu um olhar
  ao vivo no instrumento mobile porque coluna e número pareciam discordar;
  medido com o movimento rodando, eles **concordam** (`nível 47` /
  `--n: 46.84%`). Era artefato de captura pausada, como ele suspeitava.
- ⚠️ **`DESIGN.md` citava a madrugada em 9 pontos** (paleta, tipografia,
  layout, sombras, formas, motion). Todos corrigidos — mas se aparecer alguma
  referência a "trilho" ou "evento da madrugada" em doc que eu não peguei,
  está morta.
- **Não verificado nesta sessão:** o `POST /leads` continua exercitado só
  contra um stub local, nunca contra o backend real.

**Pendências desta sessão:**

- Confirmar com o Pedro o texto de LGPD (agora "Seus dados vão só para a nossa
  equipe comercial, para responder este contato").
- Merge para `main` ainda não feito.
- `public/alertas-front.png` e `tecnicos-front.png` estão deletados no working
  tree sem commit; o `PRODUCT.md` ainda os cita como "não usar".

## Sessão 2026-08-11 — Landing pública, segunda direção ("Chapa")

A primeira versão da landing (commit `446d1c7`) foi **rejeitada**. O que não é
óbvio pelo diff:

- **O motivo da rejeição não foi acabamento, foi conceito.** A página tinha
  sido construída como um demonstrativo de despesas de condomínio: folha de
  papel, tabela de conta com a linha do caminhão-pipa grifada a marca-texto,
  carimbo "documento ilustrativo". A ideia se sustentava no papel e não
  sobreviveu à tela — virou papelada, não peça de venda. Pedro pediu "mais
  bonito, com animações mais bonitas".
- **A direção nova saiu do próprio logo, não de referência externa.** As letras
  de GENERAL são chanfradas a 45°, com contraforma quadrada e uma lasca amarela
  dentro do G — é chapa cortada. A versão anterior tratava isso como selo de
  26px no canto e construía papel em volta. Agora o chanfro é a gramática de
  placa, botão, foto e campo.
- **"O logo aparece 3× e as 3 minúsculas"** virou: 2 aparições em escala
  confiante (40px no topo, 72px no rodapé) + 1 presença gráfica (a engrenagem
  gigante girando atrás do hero, em SVG próprio). Marca presente sem repetir
  logotipo.
- ⚠️ **Não existe vetor da marca.** Confirmado com o Pedro. Por isso as
  engrenagens foram redesenhadas em SVG e `public/logo-topo.png` foi **gerado**
  a partir de `login-logo.png` apagando a assinatura por cor. Se um SVG
  aparecer, substitui os dois.
- ⚠️ **Termos do piloto:** Pedro definiu que é **assinatura mensal, sem número
  limitado de vagas**. Preço ainda **não definido** — a página fala em proposta
  montada caso a caso e não cita valor. Não inventar.
- **Fotos liberadas:** as 5 fotos reais da equipe podem ser usadas grandes, com
  rostos. Autorização confirmada pelo Pedro.
- **Verificado em navegador real** (servidor estático só de `public/`, para não
  conectar no Postgres de produção nem acordar os jobs), em 1440×960 e
  500×749. Formulário testado só na validação de campo vazio — **o `POST
  /leads` não foi exercitado contra o backend real nesta sessão**.

**Pendências desta sessão:**

- Confirmar com o Pedro o texto de LGPD sob o botão ("Seus dados vão só para a
  equipe comercial da General, para responder este contato"). Foi escrito para
  descrever apenas o que `leads.routes.js` de fato faz, sem prometer
  não-compartilhamento.
- A claim "400+ avaliações cinco estrelas no Google" continua **não
  verificada** e por isso **não** está na página (ver `PRODUCT.md`).
- Merge para `main` ainda não feito.

## Sessão 2026-08-06 — Modal "Editar condomínio" (continuação da padronização)

Pedido do Pedro: seguir a linha de 05/08, atacando o modal de **editar
cliente/condomínio** com o de **orçamento** como referência.

**Feito:** ver [changelog](../docs/changelog.md) para o detalhe. O que não é
óbvio pelo diff:

- O padrão que importava do orçamento não era paleta nem raio de borda (já
  eram os mesmos) — era a **janela de altura fixa com trilho**. Virou casca
  compartilhada (`.modalBox.is-split` / `.modal-split` / `.modal-rail`), não
  CSS exclusivo deste modal; os próximos candidatos estão no
  [`roadmap.md`](roadmap.md).
- O trilho do orçamento guarda o **total**; aqui guarda o **mapa**. Mesmo
  papel: é o que decide o registro e o que não pode sair da vista enquanto se
  edita o endereço logo ao lado.
- `.loc-block` / `.loc-head` / `.loc-coords` foram removidos do `admin.css`.
  Grep no repo inteiro (`public/`, `app/public/`, serviços de PDF) antes de
  remover — lembrando do episódio `.tel-bombas-*`, que parecia morto e era
  usado pelo painel do cliente.
- ⚠️ **`public/cliente.html` carregava `admin.css?v=159`** enquanto o admin
  estava em 189 — **resolvido no fim da sessão**, alinhado em 189. Detalhe do
  raciocínio na terceira parte, abaixo.

**Verificado:** harness estático (Puppeteer + markup real recortado do
`admin.html` + `admin.css` real) em 1440×900, 1366×768, 1440×720 e 1024×900,
com medição de rolagem por coluna. `node --check` no `admin.js`.
**Nada rodou com backend real** — o mapa é um stand-in no harness, o Leaflet
não carregou e nenhum condomínio veio do banco.

**Segunda parte — modal do histórico tremia na ponta direita do gráfico.**
Reportado pelo Pedro na mesma sessão. Detalhe no
[changelog](../docs/changelog.md); o que vale guardar:

- **A regra de CSS que ninguém lembra:** `overflow-y: auto` sozinho **também
  torna o eixo X rolável** — quando um eixo não é `visible`, o outro computa de
  `visible` para `auto`. Foi isso que deixou um overlay vazando 5px virar um
  laço de rolagem ⇄ resize ⇄ redraw. Vale para qualquer contêiner de rolagem
  que hospede gráfico, mapa ou tooltip posicionado por JS.
- **Overlay do ApexCharts não respeita a caixa do gráfico.** O
  `.apexcharts-xaxistooltip` é centrado no cursor e vaza nas bordas. Ao pôr um
  gráfico dentro de contêiner rolável, bloqueie o eixo que não deve rolar.
- **O canvas do Apex é ~47px mais alto que o contêiner** com `height: "100%"`
  (constante; `parentHeightOffset` não muda). Quem "segura" esses 47px hoje é
  a rolagem vertical do `.modalBody` — por isso a tentativa de fechar os dois
  eixos com `overflow: hidden` **cortou a linha de datas** e foi descartada.
  Se um dia esse modal virar altura fixa, esses 47px precisam de plano.

**Terceira parte — painel de detalhe grudado, e o alinhamento do cliente.**

O `sticky` no `.ch-detail-col` (commit `cc52af8`) já valeu para as **5 telas do
admin** que usam `.ch-layout`, porque a correção foi na classe compartilhada.
O que faltava era o **painel do cliente**, que usa as MESMAS classes
(`.ch-layout` / `.ch-list-col` / `.ch-detail-col`) em Alertas e Chamados e
carrega o mesmo `admin.css`.

- **Não era uma correção de CSS, era de cache-bust.** O servidor sempre entrega
  o `admin.css` atual, o `?v=` é só chave de cache — então quem chegava com
  cache frio no painel do cliente **já estava** recebendo o arquivo novo. O
  `v=159` só prendia quem tinha cópia velha. Alinhado em `v=189`.
- ⚠️ **Efeito colateral esperado:** ao alinhar, quem estava preso no `v=159`
  pula 30 versões de `admin.css` de uma vez. As mudanças compartilhadas desde
  então que o painel do cliente consome: `.modalBox` (fio âmbar no topo),
  `.modalBody` / `.modalTools` / `.modal-sec-title`, `.f span`, `.input`,
  `.tel-select` / `.tel-historico-ctrls` / `.tel-filtros`. Nada disso foi
  conferido **no painel do cliente** — vale uma passada visual nele.
- **Medido no harness** (markup real do `cliente.html`, `admin.css` +
  `cliente.css` na ordem real, 80 alertas): sem o fix o painel ia para
  `top: -2717px`, **0 de 381px visíveis**; com o fix fica em `top: 110`, **381
  de 381 visíveis**. Igual em Alertas e Chamados, a 1440×900 e 1366×768.

**Pendente:**
- ⚠️ **Abrir o modal no painel de verdade** e conferir o mini-mapa: o container
  passou de altura fixa (280px) para `flex: 1`, e o `_miniMapaInvalidar("edit")`
  de 80ms é quem resolve o tamanho. É o único ponto do redesenho que o harness
  não consegue provar.
- Conferir o fluxo de erro do `_editMsg` com o backend (409 de CNPJ duplicado,
  por exemplo) — as cores novas só foram vistas em estático.
- ⚠️ **Passada visual no painel do cliente** depois do salto de `v=159` → 189
  (lista de classes afetadas acima).
- 📋 **Painel do cliente tem o mesmo `xaxis.tooltip` duplicado**
  (`telCliHistChart` em `public/cliente.js`). Não treme — o gráfico está num
  `.card` com `overflow: hidden`, não num contêiner rolável — mas o rótulo é
  cortado na borda. Continua fora: é mudança de JS do cliente, não de CSS.
- 📋 **Central de Atendimento (WhatsApp) tem o mesmo defeito e ficou de fora.**
  Ela usa `.wa-grid` (grid de 3 colunas), não `.ch-layout`, então não herdou
  nada. Medido com 60 conversas: a página rola 3087px, a coluna da lista **não
  rola por dentro** (3838px de altura) e a coluna de info estica junto — depois
  de rolar até o fim ela fica em `top: -2975px`. Não corrigido porque (a) a
  seção está **escondida do menu** desde `c825f66` (`style="display:none"` no
  `nav-item`), logo é UI morta hoje, e (b) o conserto ali não é "gruda o aside":
  as 3 colunas esticam juntas, então é preciso **limitar a altura do
  `.wa-grid`** para cada coluna rolar por dentro — mudança maior, que pede o
  módulo rodando com conversas reais para validar. Quando o Atendimento voltar
  ao menu, é o primeiro item a resolver.

## Sessão 2026-07-31 — GPS rastreava fora do expediente (pin às 19h)

**Sintoma (relatado pelo Pedro, 19:32):** pin de técnico no mapa fora das
08h–18h, que estava especificado desde 22/05.

**Causa:** regressão de 10/06 (`975a30a`) — a janela ficou só no JS da WebView
quando a coleta migrou pro `NativeGpsService` (Java). Detalhe completo no
[changelog](../docs/changelog.md) e a lição em [`decisions.md`](decisions.md).

**Feito:** janela virou regra do **backend** (fonte única), com o serviço Java
barrando o POST na origem e o JS mantendo só a UX. Fuso fixo
`America/Sao_Paulo`. `restaurar-defaults.sql` ganhou as duas chaves que faltavam.

**Verificado:** 22 asserções sobre a lógica de janela (conversão UTC→SP, bordas
07:59/08:00/17:59/18:00, meia-noite, 0–24, configs inválidas) + `node --check`
nos dois JS. **Não rodei contra banco nem aparelho** — esta máquina não tem
`node_modules` nem `.env`, e o Java não foi compilado.

**Pendente:**
- ⚠️ **Conferir `gps.expediente_*` no banco de produção.** Descartado como causa
  principal (o guard de prod do `seed-teste.js` entrou no mesmo commit que o
  write de 0/24, então o seed nunca rodou desprotegido), mas as chaves são
  editáveis pelo admin e valem uma olhada:
  `SELECT chave, valor FROM configuracoes WHERE chave LIKE 'gps.expediente%';`
- ⚠️ **Build do APK + teste em aparelho** — as mudanças em `NativeGpsService`,
  `NativeGpsPlugin` e `app.js` não foram compiladas nem rodadas.
- O backend sozinho já tira o pin do mapa **sem** APK novo (o `GET` filtra e o
  `POST` não grava); o APK novo é o que evita o tráfego inútil.
- Bateria **não** foi recuperada: fora da janela o GPS segue ligado, só não
  posta. Religar por `AlarmManager` ficou de fora — justificativa no changelog.

## Sessão 2026-07-30 (parte 2) — Redesenho do painel do cliente

**Direção definida pelo Pedro:** foco no **navegador**, não no app Capacitor
(sem previsão de chegar aos clientes). Mobile é prioridade; desktop precisa
parar de parecer largado. Identidade visual colada no admin.

**Ambiente de trabalho:** servidor local (`node server.js`, porta **3001**)
contra o banco de **TESTE**, com dois clientes demo semeados —
`demo-cliente@teste.local` (4 reservatórios, alertas, chamados) e
`demo-semtel@teste.local` (sem telemetria). Senha `demo1234`. Script em
scratchpad, prefixo `DEMO`/`demo-`, com `--limpar`. `OTP_DISABLED=true` em dev
faz o login pular o código.

**Feito:** ver [changelog](../docs/changelog.md) para o detalhe. Resumo do que
não é óbvio pelo diff:

- `public/cliente.css` novo — overrides do cliente, para não editar o
  `admin.css` compartilhado.
- O painel do cliente estava **defasado**, não mal desenhado: CSS preso em
  `?v=107` (admin em 149), tanque em divs enquanto o admin já tinha o SVG,
  placeholder "Meu Condomínio" fixo no HTML.
- Dois remendos antigos do `admin.css` (seletor de ID + `!important`) foram
  neutralizados por override, não removidos.

**Lição da sessão:** corrigi o mobile e quebrei o desktop — a regra do KPI
órfão ficou fora do media query e virou um card de 1606px. Desde então, medir
**os dois tamanhos** antes de dar por pronto.

**Aberto:**
- Extrair o SVG do tanque para `public/tanque.js` (hoje duplicado em
  `admin.js` e `cliente.js`). Combinado: **depois** do redesenho, em commit
  isolado, porque encosta no `admin.js`.
- Seções **Alertas** e **Chamados** do cliente: só levaram ajuste de KPI.
- Remover os dados demo do banco de teste quando não forem mais necessários.

## Sessão 2026-07-30 — Painel do cliente voltava sozinho pro login

**Sintoma:** login + OTP passavam, o painel do cliente abria e em seguida
voltava pra tela de login, sem mensagem nenhuma.

**Causa:** `public/cliente.js` tratava 401 e 403 igual (`location.href =
"/login"`) nos dois consumos de API. Como `/cliente/status` é a primeira
chamada da página, um 403 derrubava tudo antes de renderizar; o `redirectByRole`
devolvia pro painel no login seguinte, fechando o loop.

**Feito:** só 401 desloga (limpa `token`, vai pra `/login?motivo=expirado`);
403 mostra o `error` do backend via `setStatusMsg`. Helper `_erroDaResposta(r)`.
`cliente.js?v=22`. Detalhes no [changelog](../docs/changelog.md) e a regra
401≠403 documentada em [`autenticacao.md`](../docs/modulos/autenticacao.md).

**Feito (2ª parte) — avisar no login, não no painel:** `redirectByRole`
(`login.js`) tinha um `else` que mandava qualquer role não mapeada pro painel do
cliente — era a origem do loop. Virou o mapa explícito `PAINEL_POR_ROLE`, sem
destino padrão: role desconhecida e `cliente` sem `condominio_id` abortam o
login (`_abortarLogin`) com mensagem na tela. `login.js?v=2` (não tinha `?v=`
nenhum e está no precache do `sw.js`), `CACHE_NAME` → `telemetria-v40`,
`register-sw.js?v=31` nos três HTMLs.

**Em aberto:** falta confirmar *qual* dos dois casos é o do usuário real —
role diferente de `cliente` ou `condominio_id` nulo. As correções tornam o
motivo visível, mas nenhuma delas **cria** o vínculo faltante. Lembrar que o
`condominio_id` vai dentro do JWT: preencher no banco exige **novo login** pra
surtir efeito.

**Feito (3ª parte) — hard delete apaga os logins de cliente junto:** era a
causa provável do caso real. `usuarios_condominio_id_fkey` é `ON DELETE SET
NULL`, então excluir o condomínio deixava a credencial viva e sem vínculo.
`DELETE /condominios/:id/hard` agora apaga `role = 'cliente'` do condomínio
**antes** do `DELETE FROM condominios` (a ordem é obrigatória — depois o SET
NULL já apagou o vínculo). Escopo protege não-clientes e o próprio executor;
409 no lugar de 500 em `23503`; o modal de confirmação lista nome + e-mail dos
logins que serão apagados (`admin.js?v=244`).

**Verificado:** transação com `ROLLBACK` contra o banco de TESTE, 9 asserções
(escopo, CASCADE de `trusted_devices`/`login_codes`, não-clientes preservados).
Banco conferido depois — sem sobras. O resto (`login.js`, `cliente.js`) só
levou `node --check`: não dá pra rodar o app aqui, o `.env` local não tem
`DATABASE_URL` e o banco de teste não tem usuário `cliente`.

**Feito (4ª parte) — soft delete revoga acesso (opção C):** `DELETE
/condominios/:id` marcava `ativo = false` e o cliente continuava logando.
`clienteOnly` virou **async** e valida `condominios.ativo` a cada request; o
`/auth/login` barra antes de emitir sessão **e antes do atalho de dispositivo
confiável** (senão trusted device fura a revogação); `verify-otp` recheca.
`condominio_id` nulo continua indo pro handler, que dá a mensagem certa.
Aviso no `confirm()` de Inativar. `admin.js?v=245`.

**Verificado:** middleware real (módulo importado, não cópia) contra o banco de
TESTE, 7 asserções — inclusive "mesmo JWT perde acesso após soft delete e
recupera após reativar". Módulos carregam sem import circular. Sem sobras.

**Ponto em aberto (menor):** reativar o condomínio **não reativa os
reservatórios** — o soft delete desativa os dois, o `PATCH {ativo:true}` só
mexe no condomínio. O cliente volta a entrar e vê painel vazio. Já era assim
antes; a mudança só deixou mais visível.

## Sessão 2026-07-28 — App mobile: Capacitor 6 → 8 (prep Play Store)

Começou como um erro do Android Studio (*"Invalid Gradle JDK configuration ...
jbr-21"*) e virou o upgrade da Fase 7J ao descobrir que `targetSdk 34` bloqueia
a publicação a partir de 31/08/2026.

**Correções de ambiente (locais, não versionadas):**
- `app/android/.idea/gradle.xml` apontava `gradleJvm` para `jbr-21`, ausente do
  `jdk.table.xml` do Studio; `.idea/misc.xml` apontava o Project JDK para
  `jbr-17`, que também não existia. Ambos → `jbr-21` (JBR 21.0.10 embutido).
- `app/android/local.properties` não existia (o Gradle não achava o SDK). Criado
  com `sdk.dir`. É gitignored — cada máquina precisa do seu.

**Upgrade (detalhes completos no [changelog](../docs/changelog.md)):**
Capacitor 8.4.2, `minSdk 24`, `compileSdk`/`targetSdk 36`, AGP 8.13.0,
Gradle 8.14.3, Java 21 no módulo `app`. Valores tirados de
`node_modules/@capacitor/android/capacitor/build.gradle` (fonte da própria lib),
não do meu chute.

**Por que não trocamos o plugin de GPS:** avaliado
`@transistorsoft/capacitor-background-geolocation` (pago, US$ 399+, padrão de
mercado pra rastreamento em campo). Decisão do usuário: **não mexer nos dois ao
mesmo tempo** — subir a versão primeiro, testar, e só considerar a troca se o
rastreamento falhar no teste real. O plugin oficial `@capacitor/geolocation` foi
descartado: não faz background.

**Pendente desta sessão (bloqueia o merge):**
- ⚠️ **Teste em aparelho real do GPS em background** — o build passar não prova
  nada aqui. Testar com tela apagada, celular no bolso, deslocamento real, e
  conferir se os pontos chegam em `POST /tecnicos/localizacao`.
- ⚠️ `minSdk 22 → 24` derruba Android 5.0/5.1 — confirmar que nenhum técnico usa.
- Nada foi commitado; a branch tem também WIP não relacionado (`admin.js`,
  `admin.html`, `src/app.js`) herdado de `feature/app-mobile`.

**Achados do teste em produção (mesma sessão):**
- **Barra de ações do chamado sumia pra sempre depois de finalizar uma O.S.**
  Corrigido — detalhes no [changelog](../docs/changelog.md). Lição de
  diagnóstico: eu chutei duas causas erradas (fluxo de 2 estágios, chamado
  fechado) antes de simplesmente **procurar todas as referências ao elemento**
  (`grep tdCtaBar`), que revelou os dois mecanismos concorrentes de esconder
  (`hidden` vs `style.display`) em 1 minuto. Num SPA com DOM reaproveitado,
  buscar o elemento vem antes de deduzir pelo fluxo.
- **Preventiva de plano não apareceu no app.** Não era regressão do Capacitor 8:
  o chamado do plano nasce sem `tecnico_id` quando o condomínio não tem `zona`
  (ou a zona não tem exatamente 1 responsável), e `/chamados/meus` filtra por
  dono. Definir o responsável **depois** não retroage. Documentado em
  [`../docs/modulos/app-mobile.md`](../docs/modulos/app-mobile.md).
  📋 **A verificar em produção:** quantos condomínios reais estão sem `zona`
  preenchida — cada um é uma preventiva que nunca chega sozinha no celular.
- **Pedido do usuário: notificação de chamado novo.** Virou escopo fechado da
  Fase 7G no [`roadmap.md`](roadmap.md) (push via FCM). Descoberto no caminho
  que a 7G estava marcada como dependente da 7J sem motivo real — destravada.

**`app/public/config.js` apontava pro emulador.** Estava em
`http://10.0.2.2:3001` — endereço que **só existe dentro do emulador** do
Android Studio; em aparelho físico o app não alcançaria API nenhuma. Trocado
para `https://telemetria.generalbombas.com` (produção), porque o teste de GPS em
background exige o celular fora do Wi-Fi e nenhum servidor local sobrevive a
isso. **Efeito colateral:** o APK de teste grava no banco de produção — logar com
conta de técnico de teste. Pra voltar ao fluxo de dev diário, reverter essa linha
(os valores de dev estão comentados no próprio arquivo).

## Sessão 2026-07-27 — Planos: edição em massa

Pedido do usuário: na aba Planos, poder selecionar vários (ou todos) e editar
periodicidade, próxima execução e se o plano está ativo.

A seleção múltipla já existia desde 2026-07-22, mas só servia pra
ativar/desativar — o que faltava era o **edit**.

- **`PATCH /planos-manutencao/bulk`** virou edição genérica:
  `{ ids, ativo?, periodicidade_dias?, proxima_em? }`, pelo menos 1 campo.
  Reusa `_validarPayload(..., { exigirObrigatorios: false })` do PATCH
  individual e monta o `SET` dinamicamente (continua 1 query só).
  O body é **filtrado** pros 3 campos antes de validar — `condominio_id` e
  `titulo` não entram em massa de propósito (são individuais por natureza).
- **Modal em massa** (`_pmAbrirModalBulk` / `_pmSalvarBulk`, `admin.js`) reusa
  o `#pmModal` do criar/editar: todo campo com "— manter atual —" e só o que
  muda vai no PATCH. Cabeçalho do modal resume a seleção (nº de planos,
  condomínios, periodicidade atual ou "N periodicidades diferentes").
- `_pmBulkPatch(campos)` centralizou o fetch; "Ativar/Desativar selecionados"
  agora chamam esse helper (atalho mantido, não foi removido).
- `admin.css?v=142`, `admin.js?v=236`. Sem endpoint GET novo → `sw.js` intocado.

## Sessão 2026-07-23 — Telemetria: redesign da aba (só frontend)

Pedido do usuário: trocar o bar chart genérico do card "Níveis dos
Reservatórios" por uma visualização de **caixas d'água cilíndricas em SVG**,
mais melhorias secundárias na página. Aprovado remover o bar chart de vez e
usar container query pro modo compacto.

Descoberta: reservatórios **não têm limiar de nível configurável** no banco
(só `limiar_bomba`, corrente da bomba). As faixas de alerta são fixas no
backend (`nivelFromPct`: crítico `<20`, baixo `<45`). Aliei as cores da água a
esses valores e passei como parâmetro (`TEL_LIMIARES`) pro componente já ficar
pronto se um dia existir limiar por reservatório — sem inventar config no
backend agora.

- **`_telTanqueSVG(pct, offline, thresholds)`** (`admin.js`): SVG cilíndrico
  reutilizável — clipPath do corpo, água (rect + elipse de superfície), `%`
  em mono, ticks 25/50/75/100. `_telBandaAgua` decide a cor. `renderTelTanques`
  substituiu `renderTelBarChart` (removida, junto da var `_telBarChart`).
  Grid `minmax(160px,1fr)`; compacto via `@container (max-width:176px)` no tile
  (`.tel-tank { container-type: inline-size }`) — some elipse/rótulos.
- **Clique no tanque → Histórico** (`_telSelecionarNoHistorico`): seta os dois
  selects, popula reservatórios, chama `carregarHistoricoTelemetria`, marca
  `.is-selected` e rola até o card. Handler `tel-tanque` no delegation do body.
- **KPIs padronizados** via `.tel-kpi-grid .rc` (fundo/borda neutros, `::before`
  glow off, valor em mono) — sem tocar os `.rc` do Mapa/Dashboard. Ícone segue
  semântico. "Bombas ativas" agora mostra `bombasAtivas` (0, nunca traço) +
  hint "de N monitoradas".
- **Críticos vazio:** `.tel-criticos-empty` (ícone check + texto), classe
  `is-empty` no card reduz `min-height` no layout empilhado.
- **`.tel-select`** ganhou chevron SVG custom (`appearance:none`), igual à aba
  Relatórios.
- `admin.css?v=134`, `admin.js?v=224`. Sem `sw.js` (nenhum endpoint novo).

**Fusão dos cards + "Ver todos" (mesma sessão, depois do 1º corte):**
- Tabela "Reservatórios" removida (redundante com os tanques). Ações de admin
  viraram ícones por tanque (`.tel-tank-actions`, master); "+ Novo" foi pro
  header dos tanques; `renderTelBombas` deletada (+ helpers órfãos `_telCorPct`
  / `_telLvClassDeNivel`). Clique isolado em `.tel-tank-hit`.
- "Ver todos": overlay fullscreen (`_telAbrirVerTodos`/`_telFecharVerTodos`),
  fecha no X/backdrop/Esc/seleção. Tiles do overlay sem ações (`comAcoes=false`)
  pra evitar z-index com modais.
- **Pegadinha:** `.tel-bombas-*`/`.tel-bomba-*` NÃO são código morto — o painel
  do cliente (`cliente.html`/`cliente.js`) carrega `admin.css` e usa. Removi por
  engano e restaurei; deixei comentário no CSS avisando. `cliente.js` tem o
  próprio `_telCliCorPct`, então independe do admin.

**KPIs unificados (mesma sessão):** os `.rc` de todas as abas ganharam estilo
único — card neutro, número em mono, cor semântica só no ícone. Feito no CSS
base (`.rc-value` + variantes `.rc-*` reduzidas a só `.rc-X .rc-icon`), sem
editar as ~9 funções de render (todas já emitiam `.rc-head/.rc-icon/.rc-value`).
`renderTelKpis` passou a usar `rc-static`. As ~8 cópias do helper `kpi()`
continuam duplicadas no JS (dedup fica pra depois; o alinhamento visual já veio
todo do CSS).

**Dashboard + Telemetria — ajustes de layout (mesma sessão):**
- Dashboard: card "IA Insights" removido (HTML + `renderMcIaInsights` + CSS
  `.mc-ia*`/`.mc-brain*`); `.mc-bottom` de 3 → 2 colunas. Estava ligado, mas o
  conteúdo era filler derivado — o usuário pediu pra tirar.
- Telemetria: Histórico ↔ Críticos trocados de lugar. Histórico agora em
  `tel-row-main` (ao lado dos tanques — clique no tanque atualiza ali); Críticos
  em `tel-row-bottom` largura total, com `.tel-criticos-list` virando grade
  `auto-fill minmax(300px,1fr)`.
- Histórico melhorado: `annotations.yaxis` com os limiares (`TEL_LIMIARES`),
  chips `.tel-hist-stats` (atual/mín/méd/máx, só com 1 reservatório),
  empty state com ícone (`_telHistMostrarVazio`/`_telHistEsconderVazio`).
- Distribuição do container do histórico: PDF subiu pro `cardHead` (topo-dir);
  botões de período viraram segmented full-width com `flex:1` (linha própria);
  os 2 selects dividem o espaço igual (`flex:1`); chips de stats centralizados
  (`justify-content:center`). Só HTML/CSS, sem tocar JS.
- **Altura reduzida** (histórico + tanques estavam altos): como os dois estão
  na mesma `tel-row` (grid stretch), o mais alto puxava o outro. Ajustes:
  `.tel-tanques-grid` max-height 420→340, `.tel-row > .card` min-height
  360→300, paddings dos controles apertados. "Ver todos" cobre muitos tanques.
- **Espaço vazio embaixo dos tanques (screenshot 12:44):** causa real = o
  ApexCharts do histórico estava com `height:"100%"`, que não resolve dentro do
  flex e caía num padrão ~400px → card do histórico ~600px, e o card dos tanques
  (grid stretch) esticava junto.

**Reestruturação final (decisão do usuário):** o Histórico virou **modal** em
vez de card fixo na página — resolve o problema de altura de vez.
- Layout: `tel-row-main` agora = Tanques + **Reservatórios Críticos** lado a
  lado (voltou pro layout tipo original); `tel-row-bottom` removida.
- Histórico: `<div class="tel-hist-modal" id="telHistModal">` com o card dentro
  (range + selects + stats + legenda + gráfico + PDF + botão X). Abre ao clicar
  num tanque (`_telAbrirHistorico`/`_telFecharHistorico`; fecha no X/backdrop/
  Esc). Título do modal mostra o nome do reservatório clicado.
  `chart.height` fixo em **300px**. Não carrega no load da seção (só ao abrir).
- Mantidos os selects e toda a lógica de `popularFiltrosHistorico` (agora dentro
  do modal); `align-items:start` revertido (histórico saiu da linha).

**Redesign do layout (mockup 13:18):**
- Distribuição nova: linha principal = card "Reservatórios monitorados" (esq,
  1.7fr) + coluna direita (1fr) com **Reservatórios Críticos** (cima) +
  **Últimos Eventos** (baixo). KPIs intocados (só distribuição, como pedido).
- Reservatório virou **card horizontal detalhado** (`.tel-resv-card`): tanque +
  ações à esquerda; nome/condomínio/badge Online/`%` grande/barra/label de nível
  no meio; metadados (última leitura/bomba/device com ícones) à direita.
  `_telTanqueTile` reescrito; a grade virou pilha vertical (`.tel-tanques-grid`
  flex column). Overlay "Ver todos" ajustado pra colunas de 440px.
- **Tanque SVG melhorado** (`_telTanqueSVG`): gradiente de volume no corpo,
  água com gradiente + brilho na superfície, sombra no chão, realce vertical,
  escala 0–100. Não é foto 3D (precisaria de PNG) mas bem mais volumétrico.
- **Últimos Eventos** (`renderTelUltimosEventos`): feed derivado (leituras +
  alertas + offline), horário curto + ícone; "Ver todos os eventos" → alertas.
  Não é log granular de eventos (não há endpoint) — deriva do estado atual.
- Imagem do tanque: **abandonada** a pedido do usuário (o acabamento de render
  3D com água azul volumétrica não dá pra reproduzir por código com nível
  dinâmico). Removidos `_telTanqueImg`, CSS `.tel-tankimg*` e o PNG.
- **Tanque:** o usuário propôs um SVG (água por `scaleY`), integramos, mas ele
  **não gostou** → revertido pro **cilindro volumétrico** (`_telTanqueSVG` com
  `.tank-*`, água por rect+clip, gradiente de corpo/água, escala 0–100).
  Removidos `_TEL_AGUA_CORES` e o CSS `.tel-tanque*`.
- **Fix do "100" cortado:** o rótulo da escala 100 vazava na borda esquerda.
  viewBox agora `-8 0 108 126` (folga à esquerda) com ticks/labels em x=10-15/7.5.
- **Tamanho dos containers:** `.tel-row-main` com `align-items: start` (card de
  níveis na altura de conteúdo, não estica pra igualar a coluna direita).
  Ajuste fino pendente de feedback visual do usuário.

**Ajustes pós-feedback "tela vazia":**
- Ações do tanque agora: Editar / **Ver histórico** / Excluir. O "Nova chave"
  saiu do tanque e virou botão no rodapé do modal de editar reservatório
  (`btnRegenKeyRes` → `regenerarDeviceKeyReservatorio(editResId)`). O ícone do
  meio (`TEL_ACT_ICONS.historico`) dispara `tel-tanque` (abre o modal).
- Tela menos vazia: grade de tanques `auto-fit minmax(170,210)` +
  `justify-content:center` (centraliza quando há poucos), max-height 340→380.
- Modal do histórico melhorado: mais largo (780→900px), gráfico 300→340px,
  título com nome do reservatório · condomínio.
- Handler de delegação `regen-res-key` (10189) ficou órfão mas inofensivo —
  agora a chave é regerada pelo botão do modal (chamada direta).

**Dedup dos helpers de KPI (feito):** criado `kpiCard(icon, value, label,
kindCls, attrs, button)` — fonte única do markup. As ~8 cópias locais de
`kpi()` (Dashboard/Alertas/Clientes/Chamados/Contratos/OS/Avulsos/Orçamentos/
Planos) viraram aliases finos que delegam pra ele; `resumoCard` também delega
(button clicável). `renderTelKpis` mantém template próprio (tem linha de hint).
Zero mudança visual — só remove a duplicação de markup.

**Pendentes desta linha de trabalho:**
- **Validação visual:** `node -c` OK e revisão lógica, mas sem screenshot
  (usuário não quer servidor em background).
  Preview estático atualizado em scratchpad pra ele abrir. Falta conferir a
  geometria do SVG e o overlay renderizados.

## Sessão 2026-07-23 — Relatórios: redesign da aba (só frontend)

Pedido do usuário: a aba Relatórios tinha 3 cards de exportação idênticos
(Chamados/Alertas/Telemetria) ocupando muito espaço, controles nativos que
quebravam o tema escuro, 3 botões amarelos sem hierarquia e um Painel ao Vivo
enorme só pra mostrar 2 empty states. (Redesign começado com o modelo Fable,
que ficou sem tokens no meio; terminado aqui.)

Decisão de estética: manter HTML/CSS/JS vanilla + **fontes do sistema**
(Segoe UI / Cascadia) em vez de baixar Inter/IBM Plex — o pedido citava essas
fontes, mas o sistema inteiro já usa o stack nativo e o resultado visual é
equivalente sem download. Ver [`decisions.md`](decisions.md) se virar recorrente.

- **Card único "Exportar relatórios"**: segmented control (`.rel-seg`) troca
  só os filtros específicos; De/Até/Condomínio comuns e fixos (ids únicos
  `relExpIni`/`relExpFim`/`relExpCondo`). Um botão CSV primário. `_REL_EXPORT`
  agora separa `_REL_IDS_COMUNS` dos ids por tab; `_relExportarCsv()` usa a
  tab ativa (`_relTabAtiva`). **Endpoints e colunas intocados.**
- **Chips de preset** de período (`_relAplicarPreset`); editar data desmarca.
- **Controles custom** (`.rel-sel` chevron SVG, `.rel-date` calendário SVG +
  mono) escopados sob `.filter-bar` pra vencer a especificidade de
  `.filter-bar .input` (que zerava o background-image via shorthand).
- **Painel ao vivo colapsável** (`.is-collapsed` + linha `.rel-vivo-status`
  com dot verde/vermelho); auto-colapsa quando tudo operacional, respeitando
  expansão manual. Empty states via `_relEmptyCell` (ícone + texto).
- Validado visualmente com preview estático + screenshot (selects, chips,
  datas, colapso e empty state renderizando certo no tema dark).
- `admin.css?v=133`, `admin.js?v=223`. Sem `sw.js` (nenhum endpoint novo).

## Sessão 2026-07-23 — Chamado automático no alerta de nível baixo

Pedido do usuário (retomado após queda de conexão na sessão anterior):
`POST /telemetria` abrir chamado automaticamente junto do alerta de
reservatório com nível baixo/muito baixo, sem duplicar. A extração de
`_abrirChamadoAuto` (antes local em `offline.job.js`) para o módulo genérico
`src/services/chamados.service.js` — com dedup por `condominio_id +
categoria` e escalonamento de prioridade — já tinha sido feita antes da
queda; faltava só ligar isso na rota de telemetria.

- `src/routes/telemetria.routes.js`: `_notificarSeNovo` (chamada só quando o
  alerta é novo — `action === 'inserted'`, evita spam a cada leitura) agora
  também chama `abrirChamadoAuto` além do e-mail. Categoria `nivel_baixo`
  (único valor do enum pra nível, não existe `nivel_muito_baixo` separado);
  prioridade `p3` pra "baixo" e `p2` pra "muito_baixo" — se o chamado de P3
  ainda estiver aberto quando o nível cai pra muito_baixo, é escalonado pra
  P2 em vez de abrir um segundo chamado (mecanismo já existente em
  `abrirChamadoAuto`).
- Nenhuma migration nova — categoria `nivel_baixo` já existia no CHECK
  constraint desde a migration 002.

Ver [`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md).

## Sessão 2026-07-22 — Planos de manutenção: seleção em massa

Pedido do usuário: reativar planos inativos só dava pra fazer um por um
(modal de edição individual). Adicionado checkbox por linha + "selecionar
todos" + barra de ações em massa (Ativar/Desativar selecionados) na tabela
de Planos. Backend ganhou `PATCH /planos-manutencao/bulk` (`{ ids, ativo }`,
uma única query `UPDATE ... WHERE id = ANY($1)`). Seleção limpa ao trocar de
aba. `admin.css?v=131`, `admin.js?v=221`, `register-sw.js?v=29`,
`CACHE_NAME` → `telemetria-v38`.

## Sessão 2026-07-22 — Relatórios: painel ao vivo + exportação CSV

Redesenho pedido pelo usuário: achava a aba Relatórios (3 abas, KPI cards,
~10 gráficos ApexCharts) confusa e queria só exportar CSV pra analisar no
Excel, mantendo um painel ao vivo enxuto pro que é estado operacional "agora"
(não faz sentido virar CSV histórico).

- **Painel ao vivo:** chamados em risco de estourar SLA (≥50% do TTR usado) +
  workload por técnico, sem filtro de período — nova rota `GET
  /relatorios/painel-vivo` (extraída do antigo `/sla-dashboard`).
- **Exportar CSV:** 3 cards (Chamados / Alertas / Telemetria), cada um só com
  filtros + botão, sem gráfico/preview na tela. `GET /relatorios/chamados`
  ganhou `primeira_resposta_em`/`tempo_resolucao_seg` crus pra permitir
  montar métricas de SLA (TTFR/TTR) via tabela dinâmica no Excel — decisão
  de não duplicar essa agregação no backend.
- **Removido:** rota + botão "Exportar PDF" de chamados (`/pdf-chamados`,
  `src/services/relatorio-pdf.service.js` — apagado, único consumidor);
  rotas órfãs `/insights` e `/sla-metricas` (já sem HTML conectado antes
  desta sessão) e `/sla-dashboard`. Link "Ver análise completa" do card IA
  Insights do Mission Control (`data-rel-tab-go="insights"`) corrigido —
  apontava pra uma aba que não existia mais.
- Cache bump: `admin.css?v=130`, `admin.js?v=220`, `register-sw.js?v=28`,
  `sw.js` `CACHE_NAME` → `telemetria-v37`.

Ver [`../docs/changelog.md`](../docs/changelog.md),
[`../docs/api.md`](../docs/api.md) e
[`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md).

## Sessão 2026-07-03 — Remove nome fixo do representante General Bombas

Migration 064: `contratos.signatario_geral_nome` tinha `DEFAULT 'Ana Paula
Martins Lima'` (054) — todo contrato novo já nascia com esse nome de pessoa
pré-preenchido no modal, sem ninguém ter escolhido isso. Removido o default
e limpos os valores existentes que ainda carregavam o default sem confirmação
de assinatura (nenhum contrato tinha sido assinado sob esse nome ainda,
conferido antes de rodar). Campo `signatario_geral_email` mantém o default
(`comercial@generalbombas.com`) — é e-mail real da empresa, não nome de
pessoa.

## Sessão 2026-07-03 — Assinatura de contratos: código de verificação + protocolo

Reforça o fluxo próprio de assinatura por e-mail (migration 056) depois de
mapear 3 pontos fracos: (1) só o link bastava pra assinar, sem 2FA; (2) o PDF
final não trazia nenhuma evidência (IP/hora/hash), só o banco tinha; (3) sem
carimbo do tempo de terceiro. Migration 063 aplicada em produção. Decisão de
não usar ZapSign/D4Sign (pagos) nem a API de assinatura do gov.br (hoje só
pra órgão público) documentada em [`decisions.md`](decisions.md#segurança-e-rbac).

- `src/routes/assinatura.routes.js`: `GET /assinar/:token` agora sempre exige
  código de 6 dígitos (enviado ao e-mail cadastrado, não a quem tiver o link)
  antes de mostrar o formulário. Novo `POST /:token/verificar-codigo` (máx. 5
  tentativas) emite um `verify_token` (JWT 15 min) exigido pelo `POST /:token`
  final; `POST /:token/reenviar-codigo` com cooldown de 60s. Rate limit por
  IP nas duas rotas novas.
- `src/services/email.js`: `sendAssinaturaCodigo`.
- `src/services/contrato-pdf.service.js`: bloco de assinatura passa a
  imprimir data/hora completa + IP + protocolo (hash SHA-256) de cada parte,
  com nota da base legal (MP 2.200-2/2001 art. 10 §2º).
- Item pendente (avaliado, não implementado): carimbo do tempo de terceiro
  independente do servidor. Toda autoridade certificadora acreditada
  ICP-Brasil é paga; alternativa gratuita seria algo como OpenTimestamps
  (âncora em blockchain) — não implementado por enquanto, considerado
  desproporcional pro caso de uso atual.

Ver [`../docs/changelog.md`](../docs/changelog.md), [`../docs/api.md`](../docs/api.md)
e [`../docs/banco-de-dados.md`](../docs/banco-de-dados.md).

## Sessão 2026-07-02 — Orçamento de peças: valor unitário opcional + total manual

Migration 062 aplicada em produção: `orcamento_linhas.valor_unitario` deixou
de ser `NOT NULL DEFAULT 0` (item sem preço lançado vira `NULL` de verdade,
não `0`). PDF de peças (e de serviço) omite a coluna de valor pra item sem
preço em vez de mostrar "R$ 0,00". `orcamentos.valor` (coluna que já
existia) virou também o campo **"Valor total (manual)"** no modal de
orçamento avulso — sobrepõe a soma dos itens no PDF e nas listagens quando
preenchido; vazio, mantém a soma automática de sempre. Ver
[`../docs/changelog.md`](../docs/changelog.md) e
[`../docs/modulos/ordens-servico.md`](../docs/modulos/ordens-servico.md).

## Sessão 2026-07-01 — Orçamento avulso: tipo de serviço

Migration 060 (`orcamentos.tipo`) concluída e aplicada em produção. Orçamento
avulso agora suporta peças/serviço (padrão), limpeza de reservatório de água
potável, dedetização, ou os dois combinados — mesma tabela e timbrado do
orçamento de peças, mas o PDF ramifica pra um layout descritivo por cláusulas
(Objeto/Escopo/Garantia, fixas por tipo) com valores separados por serviço no
final, em vez da tabela de itens. Ver [`../docs/changelog.md`](../docs/changelog.md) e
[`../docs/modulos/ordens-servico.md`](../docs/modulos/ordens-servico.md).

## Foco atual — Pendentes pós-sessão 2026-06-15 (ZapSign + deploy)

---

## Foco anterior — Contratos ZapSign + preparação para deploy

O grosso das funcionalidades está concluído. Novo módulo de assinatura digital
de contratos via ZapSign foi implementado nesta sessão — falta rodar a migration
e configurar o token no Railway.

### Pendente pós-sessão 2026-06-15
- Rodar `node scripts/migrate.js 054_contratos_zapsign.sql` em produção.
- Criar conta ZapSign e adicionar `ZAPSIGN_API_TOKEN` no Railway.
- Configurar webhook ZapSign: `POST /contratos/webhook/zapsign` (sem auth).
- Reverter `OTP_DISABLED` para produção (ver `memory/project_otp_disabled.md`).

- **Banco de produção (Railway) limpo** de dados de teste — sobrevivem apenas
  logins e configurações. Scripts: `migrations/limpar-dados-teste.sql` (DELETE
  explícito, sem TRUNCATE CASCADE) + `migrations/restaurar-defaults.sql`.
- Branch `feature/app-mobile` precisa ser **mergeada/deployada na main** para o
  Railway.

## Funcionalidades em desenvolvimento / pendentes

### Gateway WhatsApp — Meta Business API · CÓDIGO PRONTO, PENDENTE CONFIGURAÇÃO
Código migrado de Evolution API → **Meta WhatsApp Business API** (número
verificado, zero risco de ban). Falta só a configuração externa:
1. Criar app no developers.facebook.com (tipo Business) + produto WhatsApp.
2. Cadastrar número e obter `WHATSAPP_PHONE_NUMBER_ID`.
3. Gerar token permanente `WHATSAPP_ACCESS_TOKEN` (Usuário do Sistema).
4. Configurar webhook na Meta: `https://SEU_DOMINIO/whatsapp/webhook`,
   verify token `general-bombas-verify-2026`.
5. Testar fluxo completo com número real.

Envs necessárias: `OPENAI_API_KEY`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

### Fase 10 — Treinar IA com histórico · 🟡 EM ANDAMENTO
- **10A — Curadoria** ✅ concluída (Migration 038): qualidade do atendimento +
  export NDJSON com PII scrubbing.
- **Bloqueio de volume:** few-shot/fine-tuning só fazem sentido com ~500+
  conversas curadas. Hoje há ~1 conversa (WhatsApp real ainda não conectado).
  A infra está pronta; o dataset cresce com o uso.
- **10B (few-shot por categoria)**, 10C (A/B), 10D (fine-tuning), 10E
  (guardrails) — aguardando massa crítica de conversas.

### Itens adiados conscientemente
- **GPS background no APK** ✅ `@capacitor-community/background-geolocation@1.2.26` instalado; `_gpsAbrirWatch()` usa o plugin nativo no APK e `watchPosition` como fallback web. Detalhes em [docs/modulos/app-mobile.md](../docs/modulos/app-mobile.md).
- **7G — Push notifications nativas** ⏸️ depende da 7J (publicação nas lojas).
- **7J — Publicação Play Store** — pendente.
- **WebSocket no WhatsApp** — adiado; polling de 5s suficiente para o volume.

## Próximos passos (da última sessão, 2026-05-28)

1. Cadastrar demais usuários (técnicos, admin_viewer) via Configurações →
   Usuários.
2. Cadastrar condomínios e reservatórios reais.
3. Configurar Meta for Developers (credenciais WhatsApp).
4. Subir branch `feature/app-mobile` para Railway.
5. Testar fluxo completo com número WhatsApp real.
6. 10B — few-shot por categoria (aguardar volume de conversas curadas).
7. 7J — publicação Play Store.

## Melhorias recentes (sessão 2026-06-17 — Seção Contratos no admin)

- **Nova seção "Contratos"** na sidebar (entre Orçamentos e Planos): tabela com filtros (status + tipo + busca), 4 KPIs (Ativos / Vencendo / Vencidos / MRR), badge de alertas na nav. `admin.js?v=183`.
- **"+ Novo contrato"** via mini-modal picker de cliente (av-modal). Clique na linha abre modal de edição existente.
- Seção recarrega automaticamente ao salvar/encerrar contrato.

## Melhorias recentes (sessão 2026-06-17 — PDF orçamento: paginação por medição real)

- **Puppeteer two-pass em `orcamento-pdf.service.js`:** passagem 1 mede 5 valores reais via DOM (altura do cabeçalho, overhead seção itens pág 1 e pág 2+, altura de linha com/sem ficha); passagem 2 usa esses valores em `renderHTML(dados, areaP1, medidas)` — zero constantes chutadas.
- **Correção raiz do espaço branco:** `padding-bottom` estava em 49mm/45mm mas o endereço do timbrado fica a ~22mm do fundo. Reduzido para 25mm → `pagina-body` 244mm (pág 1) e 224mm (pág 2+). `AREA_P2 = 224mm`.

## Melhorias recentes (sessão 2026-06-15 — contratos ZapSign + sidebar)

- **Módulo de contratos + assinatura digital (ZapSign):** migration 054, `contrato-pdf.service.js` (PDF com papel timbrado, 11 cláusulas), `zapsign.service.js` (API), 4 novos endpoints em `contratos.routes.js`, modal admin expandido com signatários/descrição/painel de assinatura. `admin.js?v=179`.
- **Sidebar animation:** choreografia redesenhada; `is-animating` desabilita backdrop-filter no CSS durante a transição. `admin.css?v=117`.
- **Texto "30 dias" trusted devices corrigido** em `login.html` e `admin.html`.
- **Email OTP separado:** `SMTP_FROM_OTP` env var para remetente do OTP.

## Melhorias recentes (sessão 2026-06-15 — correções de crash APK)

- **Crash no primeiro login corrigido:** `NativeGpsService.configure()` chamava `startForeground()` na binder thread sem try-catch. Exceções Java escapavam para o processo e matavam o app silenciosamente. Envolvido em try-catch.
- **Permissões Android faltando adicionadas:** `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_LOCATION` ausentes do `AndroidManifest.xml` causavam `SecurityException` no `startForeground()`. Ambas adicionadas.
- **`NativeGpsPlugin.start()` protegido:** try-catch para converter exceções em `call.reject()` em vez de crash.
- **`requestBatteryExemption` com try-catch:** previne crash em ROMs sem suporte a `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
- **Chip GPS "Fora do expediente" durante inicialização corrigido:** `gpsRenderChip()` agora distingue "fora do horário" de "dentro do horário aguardando GPS".
- **Chip GPS demora atualizar corrigido:** `gpsRenderChip()` adicionado após `GPS.active = true` nos três caminhos de `_gpsAbrirWatch()`.
- **Auto-login com retry:** tenta `/auth/me` até 2 vezes com 2s de espera entre tentativas.

## Melhorias recentes (sessão 2026-06-10 — UX admin e app mobile)

- **Modal de O.S. (admin) redesenhado:** layout flat com `os-vsec-title` (border-bottom, uppercase) em vez de cards com borda. 2 colunas para Identificação+Check-in e Itens+Correntes. `admin.css?v=113`, `admin.js?v=174`.
- **Novo chamado — seletor P1-P4:** wizard Q1-Q3 removido; 4 cards diretos com cor e prazo. `admin.js?v=173`.
- **Atribuir técnico no mapa:** filtrado por `cargo=tecnico`; feedback visual; estado "Técnico: Nome [Alterar]". `admin.js?v=176`.
- **Hard delete de condomínio corrigido:** bug na coluna `alerta_comentarios.chamado_id` (não existe; correto é `alerta_origem + alerta_id`).
- **App mobile — 4 melhorias:** card de mensagens oculto quando vazio; botão "Chegou ao local" removido (iniciar atendimento registra chegada); GPS oculto na tela de assinatura fullscreen.
- **App mobile — crash GPS Android 14 corrigido:** `_gpsAbrirWatch()` verifica permissão via `navigator.permissions.query` antes de chamar `NativeGps.start()` — evita `SecurityException` nativa que derrubava o app.
- **App mobile — foto na O.S. (chooser + loading + erro):** bottom sheet com opções Câmera/Galeria; estado "Enviando…" durante upload; compressão 1200px/72%; erros agora exibem mensagem legível.

## Melhorias recentes (sessão 2026-06-08 — GPS staleness + ajustes admin)

- **Pin de técnico "stale":** `_tecStale()` retorna `true` quando `capturada_em` tem mais de 3 min. Pin cinza/opaco + sem pulse. Tooltip/popup indicam quando foi o último sinal. Aplicado tanto no MC map quanto na seção Mapa.
- **"Top 5 condomínios" removido** (redundante com "Condomínios mais problemáticos").
- **Hard delete de condomínio:** cascata completa — chamados, OS, orçamentos, leituras, alertas, WhatsApp. Usuários recebem `SET NULL` (não deletados).
- `admin.js?v=147`, `admin.css?v=103`.

## Melhorias recentes (sessão 2026-06-08 — APK de teste)

- **Projeto Android gerado** (`app/android/`) — `@capacitor/android@6.1.0`, permissões GPS no manifesto, ícone via `@capacitor/assets` (favicon.png).
- **`API_BASE` corrigido:** `androidScheme: "https"` fazia o protocolo ser `"https:"` em vez de `"capacitor:"`, desviando todas as chamadas para `https://localhost`. Fix: `|| origin === "https://localhost"` no detector em `app/public/app.js`.
- **Chip GPS reposicionado:** `top: 10px` sobrepunha o header do técnico → `top: calc(env(safe-area-inset-top, 0px) + 72px)`.
- **Footer "GPS aguardando..." corrigido:** `watchPosition` não atualizava `TC.geo`; agora sincroniza a cada fix válido.
- **`OTP_DISABLED` sem guarda de prod** — temporário para testes, reverter após.
- **Railway** configurado para branch `feature/app-mobile`; `CORS_ORIGINS` inclui `https://localhost`.

## Melhorias recentes (sessão 2026-06-05 — tarde)

- **GPS técnicos — correções e UX de sinal fraco.**
  - Conflito de rotas corrigido: `tecnicosLocalizacaoRouter` antes de `tecnicosRouter` em `app.js`.
  - `GPS.lastError = "low_accuracy"` quando `acc > 15 km`; chip "Sinal fraco" + banner orientando o técnico.
  - `maximumAge` revertido para 30 000 ms.
  - Ícone de pin de técnico unificado entre MC map e mapa normal (`_tecPinIcon()`).
  - Botões de ações em Configurações → Usuários viram ícones 28×28 px.
  - `<meta name="mobile-web-app-capable">` adicionado ao app mobile.
  - `admin.js?v=144`, `admin.css?v=102`.

## Melhorias recentes (sessão 2026-06-05)

- **Ajustes de layout — ch-layout (Alertas, Chamados, Clientes, Colaboradores).**
  - `.content` virou flex container; `.section.is-active` ganhou `flex: 1`.
  - Lista da esquerda (`.ch-list-col`) vai até o fundo da página via `align-self: stretch`.
  - Painel de detalhes (`.ch-detail-col`) tem altura do conteúdo — pequeno quando vazio.
  - `admin.css?v=101`.

- **Seção "Técnicos" virou "Colaboradores".** Migration 048 adicionou `cargo` (tecnico | adm | gestor | ti) à tabela `tecnicos`. Tabs de filtro por cargo, modal com select de cargo, detalhe e KPIs adaptados. Chamados/disponibilidade só aparecem para cargo=tecnico.

- **RBAC: 3 tipos de login no painel admin.**
  - Novos roles: `gerente` (acesso total + config restrita a "conta") e `operador` (só Monitor + Chamados + config "conta").
  - `admin_viewer` removido do fluxo de cadastro; roles TEXT livres na tabela `usuarios`.
  - Card de criação de acesso atualizado para selecionar o role.

## Melhorias recentes (sessão 2026-06-03 — tarde)

- **Migrations 045 e 046 aplicadas.**
  - 045: `condominios.email VARCHAR(255)` — campo de e-mail para envio de orçamentos.
  - 046: remove `idx_contratos_ativo_uniq` — agora um condomínio pode ter múltiplos
    contratos ativos simultaneamente.
- **admin.css:** estilos para lista de contratos (`.ctr-list`, `.ctr-row`, etc.),
  spinner de loading do mapa (`.mp-map-loading`), ajuste de cor do `thead` e
  proporção da coluna `.cc-info` na lista de clientes.

- **Remoção da aba "Contatos" do modal de cliente.**
  - Aba era exclusiva para pré-cadastro de contatos WhatsApp; sem WhatsApp ativo
    só gerava confusão. Removidos: tab/pane no HTML, modal wcOverlay, ~150 linhas
    de JS e 4 rotas backend. Tabela `clientes_whatsapp` preservada no banco.

## Melhorias recentes (sessão 2026-06-03)

- **PDF de orçamento: dois bugs corrigidos.**
  - `buscarDadosAvulso` usava só `c.nome`; agora usa `COALESCE(nome_fantasia, nome)` —
    regressão pós-migration 044 que fazia o PDF mostrar a razão social como nome principal.
  - Puppeteer v22+ (novo headless) precisa de `--disable-gpu` + `--no-zygote` em
    containers sem GPU; sem elas o Chrome crashava no Railway. Corrigido em
    `orcamento-pdf.service.js` e `os-pdf.service.js`.

- **Mapa: troca de tiles CartoDB → OpenStreetMap.**
  - CartoDB causava mapa em branco no F5 (rate-limit silencioso em prod → browser
    cacheava respostas de erro) e tiles faltando em blocos no Ctrl+Shift+R.
  - `_criarTileLayer` agora usa `tile.openstreetmap.org`; tema dark preservado
    por `className: "map-tiles-dark"` + CSS `filter: invert/hue-rotate` só no
    pane de tiles. Marcadores não são afetados.
  - `admin.css?v=81`, `admin.js?v=97`.

## Melhorias recentes (sessão 2026-06-02)

- **Cadastro de clientes — Nome Fantasia + CNPJ persistido.**
  - Migration 044: `condominios.nome_fantasia TEXT` (nome principal de exibição).
  - `nome` passa a ser tratado como razão social (obrigatório); `nome_fantasia`
    é opcional e tem prioridade na UI (tabela, detalhe lateral, modal).
  - CNPJ agora é **gravado no banco** (antes era só lookup): incluído nos
    endpoints POST/GET/PATCH e no payload dos dois modais (novo e editar).
  - Modal "Novo cliente" redesenhado em **dois painéis horizontais** (campos
    em grid 2 col + mini-mapa ao lado); largura 1 100 px.
  - Painel lateral: CNPJ formatado, razão social como subtítulo quando há
    nome fantasia; busca por texto inclui `nome_fantasia`.

## Melhorias recentes (sessão 2026-06-01)

- **App mobile — camada visual HUD "Painel de comando"** (`app/public/app.css`,
  só mobile, não toca admin/site). Bloco aditivo no fim do CSS + tokens
  `--hud-*` no `:root`: grid técnico + scanline de fundo (estáticos), números/IDs
  em monospace, headers uppercase tracked com tique âmbar + glow no head-icon,
  hairline âmbar nos headers, indicador de aba ativa no bottom-nav, linha de
  dados animada no login e anel de varredura no splash. Reversível.
- **Corner-brackets âmbar descartados** após review visual (poluíam — pareciam
  "cantos de quadradinho amarelo" repetidos em todo card). Ver
  [`decisions.md`](decisions.md).
- **Pegadinha corrigida:** redefinir `position: relative` em `.cli-nav` /
  `.app-header*` quebra o `position: sticky` original (mesma especificidade,
  regra do HUD vinha depois) → menu/header "desciam" com o scroll. Pseudos de
  HUD funcionam direto sobre o `sticky`, sem precisar de `relative`.
- **Legibilidade dos KPIs:** labels dos `.rc` ficam na fonte normal; só os
  valores numéricos em monospace.

## Melhorias recentes (sessão 2026-05-28)

- Role `master_admin` **removido** (nunca foi atribuído; hierarquia real é
  admin / admin_viewer / tecnico / cliente).
- App cliente: botão Suporte no nav da Conta + KPIs clicáveis de chamados.
- Chamados: "Em atendimento" só via app do técnico com GPS (`/iniciar-atendimento`);
  `PATCH /chamados/:id` bloqueado para esse status.
- IA: function `buscar_status_tecnico` (ETA via GPS+Haversine), escalada por
  frustração/compromisso comercial, anti-duplicata de chamado.
- Admin: lógica de badges de notificação corrigida.
- PDF de orçamento: **Puppeteer singleton** (sem cold start de 10-20s no Railway)
  + `waitUntil: domcontentloaded`.
- Auth: `OTP_DISABLED` lido com `.trim()`; `redirectByRole` inclui
  `tecnico → /tecnico/painel`.

## Pendências conhecidas (2026-07-29)

- **Bug de fuso em colunas `DATE`: os três PDFs foram corrigidos** (orçamento,
  contrato e O.S. — ver [changelog](../docs/changelog.md)). Guardar o **padrão
  do defeito**, que tende a reaparecer: passar coluna `DATE` por
  `toLocaleDateString(..., { timeZone })` com o servidor em UTC devolve **um dia
  a menos**. `DATE` é dia de calendário e não deve sofrer conversão de fuso;
  `timestamptz` deve.
  - Regra prática ao escrever qualquer formatação nova: confira o tipo da coluna
    antes de escolher o formatador, e nunca coalesça `DATE` com `timestamptz`
    num `||` cru — cada um precisa do seu.
  - Colunas `DATE` que **ainda não** passam por PDF e valem auditoria se forem
    exibidas: `data_nascimento` (perfil do técnico), `proxima_em` e `ultima_em`
    (planos de manutenção).
- **`DELETE /tecnicos/:id` é hard delete sem rede de proteção.** Agora está
  liberado ao gerente (decisão de 29/07), e o endpoint faz
  `DELETE FROM tecnicos` direto — sem soft-delete, sem checar vínculos, sem
  confirmação no backend. As FKs salvam o histórico de negócio
  (chamados/O.S./zonas são `ON DELETE SET NULL`), mas `tecnico_localizacoes` e o
  histórico de GPS são `ON DELETE CASCADE` e **somem junto**. Se um dia precisar
  de auditoria de rastro, virar soft-delete (`ativo = false`) é o caminho.
- ~~**Restrição do operador é só de UI**~~ — resolvido em 27/08/2026: o corte
  passou a ser no guard (49 rotas para `gestaoOnly` + saída de `equipeInterna`),
  e Contratos saiu do menu do perfil.
