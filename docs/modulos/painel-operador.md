---
tags:
  - projeto
  - fluxo
aliases:
  - Painel do Operador
  - Fila do Turno
  - Turno
---
# Painel do Operador ("a fila do turno")

Rota `/operador/painel`. É a tela de quem está **de turno**: recebe o que a
telemetria, o WhatsApp e o telefone abrem, decide o que pede alguém agora e
despacha. Substituiu o painel admin com itens escondidos — o destino do
`operador` no login mudou em 27/08/2026 (`public/login.js`, `PAINEL_POR_ROLE`).

Arquivos: `public/operador.html` · `public/operador.css` · `public/operador.js`
· `src/routes/operador.routes.js`.

A superfície tem **duas telas**, e as duas carregam a MESMA folha: a fila do
turno e **Aprovados** (`/operador/painel/orcamentos` —
`public/operador-orcamentos.html` · `public/operador-orcamentos.js`). Ver
"A segunda tela" lá embaixo.

Endpoints em [`../api.md`](../api.md) (router `operador`), ciclo do chamado e
prazos em [`chamados-sla.md`](chamados-sla.md), faixas de nível em
[`telemetria.md`](telemetria.md), o corte de permissões do perfil em
[`autenticacao.md`](autenticacao.md). O "porquê" das escolhas está em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

Comp aprovada: [`../comps/painel-operador-v2.html`](../comps/painel-operador-v2.html)
(a v1 está preservada ao lado, [`painel-operador-v1.html`](../comps/painel-operador-v1.html)).

---

## A tese: "a fila do turno, medida pelo relógio"

O item da tela é **"isto pede alguém"**, ordenado pelo **SLA que estoura
primeiro** — não por data, não por prioridade. Um P3 com 20 minutos de prazo
vem antes de um P2 recém-aberto, porque é assim que quem está de plantão
trabalha. Essa é a única diferença que justifica a tela existir: a lista de
chamados do admin ordena por data.

O instrumento fica **dentro do item**, nunca na estrutura da tela. Cada
chamado carrega sua própria evidência:

- **com telemetria** → as colunas d'água do condomínio, com as faixas de
  nível baixo (45%) e crítico (20%) desenhadas;
- **sem telemetria** → a descrição, que é a fala de quem relatou, com o mesmo
  peso visual e o selo "Prédio sem telemetria instalada".

> Um prédio sem sensor **não é um item pobre** — é um item com outra prova.
> Foi o que derrubou a "parede de instrumentos" da v1: ela não tinha o que
> desenhar para metade da carteira.

Dois arranjos foram recusados de propósito: a **lista com abas e busca do
admin** (seria o mesmo painel com menos itens) e a **parede de instrumentos**.

## O que o operador vê

| Região | O que é |
|---|---|
| Barra | Marca · **Aprovados · Ajuda** (texto, como a landing) · `+ Novo chamado` (âmbar) · nome e **Sair** (de fio) |
| Coluna principal | **Esperando alguém** (sem técnico) e, abaixo, **Já tem técnico** — cada cabeçalho conta os seus, inclusive os fora do prazo |
| Trilho | Mapa do turno; **Equipe agora** (nome + estado) e **Despachados hoje** |

⚠️ **No trilho, cada linha tem duas peças e só.** Desde 31/08/2026 saíram o
selo de iniciais e a nota "no mapa": a pergunta que o trilho responde é *quem
pode ir*, e nenhuma das duas respondia. O selo não identifica ninguém que o
operador já não reconheça pelo nome, e "no mapa" repetia, em texto, o pino que
o mapa logo acima já desenha. Sobrou a **exceção**: quando falta posição, a
linha diz "· sem posição" em tinta apagada. A disponibilidade, que morava no
anel do selo **e** na cor do estado, agora mora só na cor do estado.

Estado vazio: *"Nenhum chamado aberto."* — e o estado de carga diz
**"Carregando a fila do turno…"**. Dizer "nenhum chamado" antes da resposta
chegar seria afirmar calma que ninguém verificou; num painel de turno é o pior
erro possível.

## Backend: uma request monta a tela inteira

`GET /operador/fila` devolve, numa resposta só: os chamados abertos com o SLA
**já resolvido**, os reservatórios do condomínio de cada um e a equipe com
posição atual.

⚠️ **O SLA restante é calculado com o relógio do SERVIDOR.** O painel admin
compõe informação equivalente a partir de cinco endpoints e junta no browser;
aqui não dá — a ordenação *é* o `resta_min`, e o relógio do navegador do
operador pode estar minutos fora. O front (`relogio()` em `operador.js`) só
decide **como escrever** o número que recebeu.

Chamado sem `sla_definicoes` para a prioridade vai para o **fim** da fila: não
dá para prometer prazo que não existe, e inventar um número seria pior.

### A origem é heurística, não dado

`chamados` não tem coluna `origem`. `origemDe()` (fonte única dessa leitura)
deduz por efeito colateral: `conversa_id` → WhatsApp · `plano_manutencao_id` →
preventiva · categoria automática (`nivel_baixo`, `bomba_falha`) → telemetria ·
resto → manual. **O caso ambíguo é real**: um chamado de `nivel_baixo` aberto à
mão aparece como "telemetria". Resolver de verdade pede uma coluna `origem` —
está no [`roadmap`](../../memory-bank/roadmap.md).

## As três ações

⚠️ **DESPACHAR TIRA O CHAMADO DA SEÇÃO EM QUE ELE ESTAVA.** Ele sai de
"Esperando alguém" e vai para "Já tem técnico", que costuma estar fora da tela
— medido: y=1258 numa janela de 709px. Por isso o despacho, desde 31/08,
**avisa para onde o item foi e rola até ele**. Sem isso a tela parecia não ter
feito nada, que foi exatamente o relato.

1. **Despachar** — abre o mapa com o prédio, os técnicos com GPS e uma linha
   tracejada do candidato livre até o alvo. Grava com
   `PATCH /chamados/:id { tecnico_id }`, que marca `primeira_resposta_em` e
   **para o relógio do TTFR**. Sem coordenada do prédio *e* sem ninguém com
   GPS, o mapa é substituído por uma frase — Leaflet centrado no oceano é pior
   que texto.
   ⚠️ **"Em atendimento" não sai daqui**: só o app do técnico seta esse status,
   com GPS (`POST /chamados/:id/iniciar-atendimento`).
2. **Abrir ficha** — `GET /chamados/:id` + `/historico`, a linha do tempo que
   o operador lê antes de ligar para o técnico.
3. **Novo chamado** — o que chega por telefone precisa de porta de entrada.
   `POST /chamados`. A lista de prédios vem de `GET /condominios`, **não da
   fila**: chamado novo costuma ser num prédio que ainda não tem chamado
   aberto — exatamente o que não está na fila.

## A segunda tela: Aprovados (`/operador/painel/orcamentos`)

**A pergunta é "o que a gente pode executar aqui", não "quanto custou".** A
lista é agrupada **por prédio**, porque é por prédio que o operador é cobrado
ao telefone — nunca por número de orçamento.

### ⚠️ Esta tela está em REGISTRO DE LEITURA, e é a única desta superfície

**O marinho é o campo; a placa clara é o conteúdo.** É a gramática da landing e
do painel do cliente, não a da fila do turno — e a mudança é de 31/08/2026, a
pedido do Pedro, que pôs os dois prints lado a lado.

Medido antes: a tela vivia numa faixa de **12 a 17px**, o maior tipo dela era o
nome do prédio, e não havia **uma** superfície clara. São 7 itens que se leem;
não têm a densidade da fila para justificar o registro de operação.

| Peça | O que é |
|---|---|
| Manchete | `N orçamentos **aprovados** em M prédios` — "aprovados" em âmbar, no campo marinho |
| Prédio | cabeçalho branco **no marinho**, acima das placas — nunca título de cartão |
| Placa | `--chapa`, uma por orçamento, com o serviço aprovado como leitura grande |
| Selo | **PODE EXECUTAR** em âmbar cheio · `CHAMADO #N` de fio quando já existe |
| Rodapé | uma FRASE (`1 item · aprovado em … por … · cargo`), nunca a pilha de metadados que existia antes |

⚠️ **O âmbar nunca é texto sobre a placa clara** (Regra do Amarelo Cego, ~2:1).
Ali ele é só preenchimento com tinta marinho por cima — o selo e o botão. A
palavra âmbar da manchete vive no campo marinho, e é por isso que a manchete
não entrou na placa.

⚠️ **E isto não quebra A Regra da Superfície** — ver a tabela nova em
[`../../DESIGN.md`](../../DESIGN.md). O que a regra proíbe é placa clara
**disputando a tela** com conteúdo marinho ao lado. Aqui a placa **é** o
conteúdo. A fila do turno continua marinho porque é tabela de varredura.

⚠️ **Nenhum valor entra nesta tela, e não é `display:none`:**
`GET /operador/orcamentos` não devolve coluna de dinheiro nenhuma. Ver o aviso
em [`../api.md`](../api.md).

### Os quatro estados de um orçamento aprovado

| Estado | Selo | Ação | Placa |
|---|---|---|---|
| livre | **Pode executar**, âmbar cheio | "Já foi feito" (link) + "Abrir chamado" (âmbar) | `--chapa` |
| chamado aberto | `Chamado #N aberto`, de fio | **nenhuma** — quem encerra é o chamado | `--chapa` |
| chamado fechado | `Chamado #N fechado`, de fio | "Abrir de novo", de fio | `--chapa-es` |
| **marcado à mão** (080) | `Feito em DD/MM`, de fio | "Desfazer" | `--chapa-es` |

⚠️ **"Marcado à mão" ganha de todos os outros na hora de decidir o estado.**
Alguém disse, com nome e hora, que o serviço foi feito; isso é afirmação de
gente e vence qualquer dedução a partir do estado de um chamado. O caso
concreto: o operador marca como feito e, semanas depois, abre um chamado novo
do mesmo orçamento porque o serviço voltou — com a ordem invertida, a placa
esqueceria que a primeira execução aconteceu.

⚠️ **"Já foi feito" só aparece no estado LIVRE.** Com chamado aberto quem
conclui é o chamado, na fila do turno; oferecer os dois caminhos criaria duas
verdades sobre o mesmo serviço.

### O que é marcado como feito SAI da lista (31/08)

Decisão do Pedro: *"se não vai ficar pra sempre e vai ficar tudo poluído"*. A
tela responde "o que a gente pode executar aqui", e um orçamento executado não
responde mais nada — sem isso a lista vira um cemitério que o operador aprende
a ignorar, que é o começo de não ler a tela.

⚠️ **Mas não some para sempre.** A marcação é de UM CLIQUE e sem confirmação;
se o que sai não tem volta, o erro só se conserta no banco. São **duas** saídas,
e as duas moram nesta tela:

1. a **faixa** que aparece na hora, com "Desfazer" dentro dela (10 s, contra os
   6 s da faixa de erro: ler a frase é rápido, decidir que clicou errado não);
2. a linha **"N já feitos · mostrar"** no fim da lista, que é permanente.

⚠️ **Sem confirmação, com desfazer** — a troca é deliberada. Uma caixa de "tem
certeza?" a cada marcação cobra de todo mundo o preço do erro de alguns; o
desfazer cobra só de quem errou.

⚠️ **A faixa passou a ter duas vozes.** Ela era vermelha sempre, porque só
existia para erro. Confirmação em vermelho ensina o operador a não olhar para o
vermelho — `--risco` é estado crítico e não aparece por outro motivo (A Regra
do Crítico Silencioso). A confirmação é **superfície**: placa marinho com anel
de 1px, e `role="status"` em vez de `alert`.

⚠️ **A manchete conta o que está na tela**, não o total do banco. Número que não
bate com o que se vê embaixo dele é pior que número nenhum.

### Clicar no orçamento abre o chamado que o executa (31/08/2026)

Antes, a tela dizia o que foi autorizado e parava aí: o operador lia "o Bosque
Verde aprovou a troca do selo" e ia abrir o chamado na outra tela, digitando de
novo prédio, serviço e constatação — e depois ninguém tinha onde olhar para
saber se aquele orçamento chegou a ser executado.

**A ação é o botão âmbar dentro da placa.** `POST /operador/orcamentos/:id/chamado`
abre um chamado já vinculado por `chamados.orcamento_id` (migration 079), com o
título e a descrição **pré-preenchidos a partir do próprio orçamento** (serviço,
número, quem aprovou, constatação e itens) e editáveis antes de gravar.

⚠️ **A PLACA NÃO É UM `<button>`**, e isso é uma correção sobre o mesmo dia. A
linha inteira virou botão de manhã; à tarde a placa ganhou a ação em âmbar
dentro dela, e `<button>` dentro de `<button>` é HTML inválido — o navegador
desmonta a árvore. Não é perda: um botão âmbar escrito "Abrir chamado" é mais
claro para quem tem pouca familiaridade do que uma área grande que reage ao
clique sem dizer onde começa.

⚠️ **A placa vira NA HORA, com o id que o endpoint devolve** — não quando a
lista volta do servidor. Medido em 31/08 contra o banco de teste (Railway, via
proxy): **mais de 2,5s** entre o clique e a troca, com o diálogo já fechado e a
placa ainda dizendo "Abrir chamado". Do lado de quem clicou, o botão não fez
nada. A recarga de verdade vai atrás, para reconciliar, e com `.catch` próprio:
o diálogo já fechou, então um erro ali não tem mais onde ser escrito.

| | Regra, e por quê |
|---|---|
| Prédio | Vem do **orçamento**, nunca do corpo da requisição. Aceitar do front permitiria abrir, a partir do orçamento de um prédio, um chamado em outro — e o vínculo passaria a mentir |
| Prioridade | Padrão **P4**, não o P2 do "novo chamado": serviço aprovado é trabalho **agendado**. Como P2 ele passaria na frente de bomba parada numa fila ordenada pelo prazo que estoura primeiro |
| Recorrência | **Sem o bump** de `POST /chamados`. Lá ele detecta problema que volta; aqui subiria a prioridade de uma limpeza agendada por causa de outra limpeza no mês passado |
| Clique duplo | Havendo chamado **aberto** do mesmo orçamento, o endpoint devolve o que já existe (`200`, `ja_existia`). A lista não recarrega sozinha e o operador está ao telefone: repetir o clique é o caso normal |
| Chamado fechado | **Não bloqueia.** A linha continua clicável e o chip vira "Abrir de novo" — o serviço pode voltar. É também por isso que `orcamento_id` não é UNIQUE |
| Estado na linha | Com chamado aberto a linha **deixa de ser botão** e mostra "Chamado #N aberto". Botão que não faz nada é pior que nenhum botão |
| Affordance | O chip "Abrir chamado" é **sempre visível**, nunca só no hover: quem não sabe que devia passar o mouse não descobre um alvo que só aparece quando o mouse chega |
| Peso do chip | **De fio em repouso, preenchido no hover/foco** (Regra do Selo). Quinze linhas com quinze chips âmbar viram uma coluna de âmbar que não aponta para nada |

⚠️ **Nada de elemento interativo dentro da linha.** Ela é um `<button>`, e
`<button>` dentro de `<button>` é HTML inválido — o navegador desmonta a
árvore. Por isso o chamado que já existe aparece como **texto**, e não como
link para a fila; o número basta para achá-lo lá.

⚠️ **O `operador-orcamentos.js` não importa nada do `operador.js`.** Os
helpers de sessão, o `lerJson`, o `escapar` e o bloco inteiro do diálogo
(`<dialog>` + `showModal()`, foco que volta para quem abriu, Tab preso, faixa
de aviso) são **cópia deliberada**. É a mesma regra que mantém esta superfície
independente do `admin.js` — foi compartilhando helper que o painel do cliente
virou refém do admin até 13/08/2026.

## O mapa: três camadas (31/08/2026)

| Camada | O que é | Condição | Clique |
|---|---|---|---|
| Carteira | **placa chanfrada 22px com ícone de prédio**, colorida pelo estado (verde em ordem · âmbar baixo · vermelho crítico · cinza sem leitura) — o `.mc-pin-condo` do admin, sem o raio | condomínio ativo com coordenada | **não** |
| Chamado | placa chanfrada 28px, ícone de prédio, cor = o relógio | chamado `aberto`/`em_atendimento` com prédio geocodificado | abre o despacho |
| Técnico | círculo 26px com iniciais | GPS dos últimos **30 min** | não |

⚠️ **A carteira é fundo, não assunto.** Ela existe para o mapa não nascer
vazio — em produção `tecnico_localizacoes` tem 3 linhas no total, então sem ela
um turno calmo mostrava uma frase no lugar do mapa. Quem tem cor e clique
continua sendo o chamado.

⚠️ **O enquadramento é da decisão**, nunca do fundo. Sem chamado nem técnico,
quem enquadra é a carteira — e **como** depende do tamanho da caixa: coluna de
400px → centro na mediana em zoom 12 (escala de bairro); tela cheia ou faixa
(>800px) → `fitBounds` com respiro, `maxZoom` 13. `fitBounds` sobre os 86
prédios numa coluna estreita abre a região metropolitana inteira, que foi o
defeito que o Pedro apontou em 31/08.

⚠️ **A cor da carteira é a PIOR BANDA dos reservatórios do prédio**, e prédio
sem telemetria conta como **em ordem** (verde) — é o que o `_mcStatusKind` do
admin faz. Em produção não há reservatório cadastrado, então a regra anterior
("só colore fora do ok") deixava os 87 cinzas e o mapa idêntico ao defeito.
Quem separa fundo de decisão é o **tamanho**: 22px na carteira, 28 no chamado.

⚠️ **A janela de GPS é 30 min, e NÃO tem corte de expediente** — ao contrário
de `GET /tecnicos/localizacao`, que zera a lista fora do horário. Aqui a lista
serve para despachar, e um P1 às 18h10 precisa saber quem ainda está em campo.

📋 **Em aberto:** a legenda do mapa (agora com três tipos de pino). É copy, e
copy é decisão do Pedro.

## O que o ADMIN vê disso (31/08/2026)

**Nada aqui muda `orcamentos.status`.** Abrir chamado grava em `chamados`;
marcar como feito grava `executado_em`/`executado_por`. O status continua
`aprovado`, e é a única coisa que o admin edita.

O admin **lê** as duas colunas: selo `FEITO` / `CHAMADO #N` na lista de
orçamentos e duas linhas na ficha ("Feito em … marcado por …", "Chamado #N …").
Ver [painel-admin.md](painel-admin.md) e o changelog de 31/08.

⚠️ **Só leitura, dos dois lados da fronteira.** Quem escreve o desfecho é esta
tela; um controle no admin criaria dois lugares para dizer a mesma coisa, e
nenhum dos dois seria a verdade.

## A ajuda (31/08/2026)

Botão **"Ajuda"** na barra das duas telas, abrindo o diálogo "Como esta tela
funciona". Pedido do Pedro, e a razão é a mesma calibragem de 28/08: quem opera
tem pouca familiaridade com computador.

⚠️ **OS PRAZOS VÊM DO BANCO** (`GET /operador/prazos` → `sla_definicoes`), e
isso não é preciosismo: os números que estavam escritos à mão **já estavam
errados**. A dica do "Novo chamado" dizia "P2 24–48h" quando o `ttr_min` de P2
é 1440 (24h), e "P4 conforme agenda" quando P4 tem 14400 (10 dias). Mudar um
prazo no admin muda a ajuda junto. Os números saíram das duas dicas de diálogo,
que agora apontam para a tabela.

⚠️ **A busca é preguiçosa** — só quando o diálogo abre. A tese "uma request
monta a tela inteira" é sobre montar a tela; um diálogo que a maioria dos
turnos nunca abre não entra no caminho crítico da fila.

| | Regra |
|---|---|
| Rótulo | **"Ajuda" não some no celular**, ao contrário de "Aprovados" e "Novo chamado". Ponto de interrogação solto é o primeiro a não ser achado por quem mais precisa dele |
| Posição | Primeira das ações da barra, nas duas telas |
| Corpo | 1rem e medida de 66ch. Esta é a tela que alguém abre por não estar entendendo — encolher o texto aqui cobra o preço no pior momento |
| Tabela | Prazo é medição: mono e `tabular-nums`. A coluna de prioridade é nome, então sai do mono |
| Rolagem | O **invólucro** da tabela rola, não a tabela. Sem isso, no celular ela estica o diálogo e a página inteira ganha rolagem horizontal |
| Prévia | Toda rota nova que o front chamar precisa de fixture em `_operador-preview.js` — sem ela, a chamada cai no `fetch` nativo com o token falso, toma 401 e **derruba a prévia para o `/login`** |

O que a ajuda explica: por que a fila está naquela ordem, as prioridades com os
três relógios, as faixas de nível (45/20) e o que "Sem leitura" quer dizer (e o
que **não** quer), as ações da tela e o ciclo de 30s. Em Aprovados: o que é a
tela, os três selos, o que o "Abrir chamado" preenche sozinho e por que o
padrão é P4.

## Ciclo de vida da tela

`setTimeout` recursivo de **30s** (nunca `setInterval` — o padrão do projeto;
com `setInterval` uma request lenta empilha a próxima e o painel dispara em
rajada). O **pulso** da barra fica verde enquanto há carga recente e vira
vermelho após 3 ciclos sem sucesso: numa tela de turno, silêncio e falha não
podem se parecer. Erro aparece como **faixa**, nunca `alert()` — `alert` trava
a tela e travar significa parar de receber.

## Regras que não dá para inferir lendo o arquivo

- **`operador.js` não importa nada de `admin.js`.** As duas telas mostram os
  mesmos chamados e a tentação de compartilhar helper é real — foi assim que o
  painel do cliente virou refém do admin até 13/08/2026. Aqui é folha própria:
  arquivo próprio, ciclo próprio, e `lerJson`/`escapar` copiados de propósito.
- **401 desloga; 403 não.** Tratar os dois igual produz o loop silencioso que
  derrubou o painel do cliente em 30/07/2026 (painel abre → 403 → `/login` →
  autentica → volta ao painel, sem nunca mostrar mensagem).
- **`/operador` está na lista network-first do `sw.js`.** Servida do cache, a
  tela mostraria o turno de meia hora atrás e o operador não teria como saber.
- A página é `/operador/painel` e a API é `/operador/fila` — a rota HTML **não
  sombreia** o router, mesma convenção do admin e do cliente.
- **A coluna d'água deita em TODA largura** (desde 27/08/2026), não só no
  celular — e por isso existe uma renderização do tanque, não duas. Em pé ela
  mandava na altura do item (a pilha custava 100px) e deixava a régua de SLA
  87% vazia. As regras que invertem os eixos (lâmina, crista, faixas, limiar)
  são a **base** da folha; o bloco de celular só ajusta medidas. Mudou a peça
  no `cliente.css`/`landing.css`? Muda aqui também.
- **O mapa mora no trilho e é peça fixa da tela** (desde 28/08/2026), não só do
  diálogo de despacho. O motivo é ordem da pergunta: no diálogo ele abria
  **depois** da escolha do chamado, um por vez, mas a decisão geográfica é da
  fila inteira. ⚠️ **A tela cheia é um MODO da peça, não uma segunda tela** —
  "a tela é UMA" continua valendo.
- ⚠️ **O nó do mapa é persistente e vive FORA do ciclo de render.** `render()`
  reescreve o `#tela` inteiro a cada 30s; o mapa sobrevive porque nunca está
  lá dentro — o render só o **move** para o lugar do `#slotMapa`. Quem puser o
  mapa dentro do HTML do render vai destruí-lo e recriá-lo a cada ciclo,
  perdendo o pan e o zoom do operador. Depois de mover, `invalidateSize()`.
- ⚠️ **Quem rola é o `.trilho-listas`, não o `.trilho`.** A coluna tem
  `overflow:hidden` de propósito: com `overflow-y:auto` nela, rolar a equipe
  levaria o mapa para fora da tela.
- ⚠️ **Tela cheia precisa da classe no `body`, não só do `z-index` da peça.**
  `.mapa-turno` está dentro do `#tela` (`z-index:1`), então o `z-index:70` dela
  é resolvido num contexto aninhado e a barra desenha por cima.
  `body.com-mapa-fs` sobe o contexto e tranca a rolagem atrás.
- **Enquadramento: uma vez na carga, e de novo a cada troca de tamanho.** O
  ciclo de 30s nunca re-enquadra (arrancaria o mapa da mão de quem deu zoom);
  entrar/sair da tela cheia sempre re-enquadra (o `fitBounds` da coluna de
  368px num viewport de 1920 mostra o estado inteiro).
- ⚠️ **O item tem DUAS colunas** (`118px minmax(0,1fr)`), não três, desde
  28/08/2026: urgência à esquerda (relógio **e** prioridade juntos) e o resto à
  direita, com a ação fechando o conteúdo. A coluna de ações separada saiu — o
  botão continua no mesmo x, mas a leitura deixou de ser interrompida duas
  vezes por item.
- ⚠️ **Uma ação em destaque por item:** "Despachar" é botão, "Ver detalhes" é
  **link**. Dois botões iguais pedem uma escolha antes da decisão de verdade.
  O link mantém 44px de alvo e sublinhado permanente.
- **Status, origem e bairro não aparecem na face do item** — estão na ficha.
  Nesta seção todo item está "Aberto": o selo era ruído.
- ⚠️ **A quebra do trilho é 1180px, não 1080** (desde 28/08/2026). O 1080 era
  o número da landing e valia com o trilho de 300px; com 400 (o mapa entrou
  nele) a conta virou `740 (item mínimo) + 400 + 40 (gutters) = 1180`. A 1090
  o item ia a 640×332 contra 1000×198 em 1080 — alargar a janela piorava.
  **Mexeu no `--trilho-w`? Refaça esta conta.**
- ⚠️ **Não misture `px` e `rem` na rampa desta folha.** As leituras grandes
  (régua, tanque, relógio da barra, título da ficha) estão em `rem`; o corpo e
  as etiquetas em `px`. Quando o corpo subiu de 13 para 15px, os `rem` ficaram
  parados e a régua caiu de 1,42× para 1,26× o título — a hierarquia se desfez
  sem ninguém notar. **O que se preserva numa troca de escala é a razão.**
- ⚠️ **ESTA TELA NÃO USA MAIS A ESCALA DO ADMIN.** Desde 28/08/2026 o corpo
  é **15px** (era 13), a etiqueta mono **12px** (era 10,5) e todo botão tem
  **44px** de alvo. O motivo é de público, não de gosto: quem opera aqui tem
  pouca familiaridade com computador, e o registro de operação do admin é
  calibrado para quem usa o sistema o dia inteiro. Custa densidade (≈3 → ≈2
  itens na primeira tela) e isso é aceito. **Não "corrija" isso de volta para
  alinhar com o admin.**
- **Caixa alta só em etiqueta de uma ou duas palavras.** Frase em CAIXA ALTA é
  o texto mais lento de ler que existe. Ver [vocabulario.md](../vocabulario.md).
- **Vocabulário: sigla de software não entra** (TTFR, TTR, KPI); sigla do ramo
  fica (O.S., P1–P4, esta com a palavra ao lado). Glossário completo em
  [vocabulario.md](../vocabulario.md).
- **A barra tem 68px (60 no celular) e o logo 36 (30)**, desde 28/08/2026.
  ⚠️ **Não copie o 60px da topbar do admin:** ela carrega só controles, porque
  a marca do admin fica na sidebar. Esta tela não tem sidebar, e a barra dela
  leva logo + rótulo do turno + botão + pulso + relógio + avatar. 68 é o
  meio-termo com os 74 das irmãs (landing e painel do cliente), preservando a
  densidade da fila. A razão logo/barra é **0,53**, a das irmãs.
- ⚠️ **A máscara da engrenagem é medida em `px` e precisa ser refeita sempre
  que a barra ou o placar mudarem de altura.** A conta é `y desejado + |top|
  da peça` (hoje `top:-88` no desktop, `-60` no celular). Ela deve cobrir
  barra + placar + cabeçalho da fila e apagar **antes** do primeiro item —
  em 28/08 a faixa cresceu duas vezes e a máscara ficou apagando no meio do
  vão, o que não quebra nada e por isso passa despercebido.
- ⚠️ **Moldura marca o que é ÚNICO; o que se repete é superfície.** Anel de
  1,5px + gradiente é da placa do turno e do mapa. O item da fila (aparece 5×)
  e as listas do trilho são cor chapada. Aplicar a construção mais expressiva
  do sistema em tudo é o mesmo erro que não aplicá-la em lugar nenhum — a
  primeira dobra chegou a ter nove peças com anel, e o anel virou textura.
- **A Regra do Selo do `DESIGN.md` vale para o botão:** só o item cujo relógio
  pede alguém agora (estourado/apertado) tem "Despachar" em campo cheio; nos
  demais o botão fica com anel e texto amarelos sobre miolo marinho. Quatro
  botões cheios faziam o amarelo virar coluna e parar de apontar.
- **Estado vazio ocupa a mesma caixa do estado cheio** — no trilho o
  "Ninguém despachado ainda." é bloco, não texto solto.
- **Toda peça com fio é chapa de duas camadas** (desde 28/08/2026): o fundo do
  elemento é o anel e um `::before` embutido é a placa, com gradiente diagonal
  de `--mar-700` a `--mar-900`. É a construção do `.instr` da landing, e vale
  para `.placar-in`, `.chapa` (trilho) e `.item`. **`border` junto com
  `clip-path` está proibido** — a borda sai recortada nos dois chanfros.
  ⚠️ O ângulo depende da proporção da peça: **176° em chapa larga, 168° em
  chapa alta**. O comprimento da linha do gradiente é `|L·sen α| + |A·cos α|`,
  então 168° numa placa de 1000×86 vira gradiente horizontal.
- **Sinal de estado vai no ANEL, não no preenchimento**, quando a tinta por
  cima é da mesma família. Verde sobre verde deu 3,20:1 — é a Regra do Amarelo
  Cego valendo para o verde.
- **Leitura que não cabe na coluna usa o eixo variável do mono**, não um
  `font-size` menor: Martian Mono vai de 75% a 112,5% de largura, e a régua de
  SLA usa 82%. Reduzir o corpo pagaria com a presença do número, que é a tese
  da tela.
- ⚠️ **Nunca use crase dentro dos template literals do `operador.js`** — nem em
  comentário HTML. Ela fecha a string e o resto vira tagged template; o sintoma
  é `X is not a function` em runtime com `node --check` limpo. Registrado no
  [`../../CLAUDE.md`](../../CLAUDE.md).
- **A etiqueta mono tem um tamanho só: 10,5px.** Havia cinco degraus abaixo de
  11px na mesma tela. Ao criar etiqueta nova, use 10,5 — não invente o sexto.
  Duas exceções deliberadas: o rótulo do tanque é Archivo de 12px (nome próprio
  do cadastro, não etiqueta) e o número do chamado tem 11,5px (é por ele que se
  procura o item ao telefone).
- **São TRÊS faixas de layout, não duas** (desde 27/08/2026): acima de 1080px a
  fila e o trilho são colunas; de 1080 a 760 o trilho **desce** e vira faixa
  horizontal; abaixo de 760 entra o layout de celular. Os dois números vêm das
  irmãs — 1080 é a primeira quebra da landing, 760 é onde ela e o painel do
  cliente deitam a coluna d'água. Quem tirar a quebra de 1080 devolve o defeito
  descrito abaixo.
- **Uma quarta chave, de 28/08/2026, atravessa duas dessas faixas: entre 761 e
  1339px a prova DEITA dentro do item** (tanques em cima, relato embaixo). Ela
  não move 1080 nem 760 — só troca o arranjo interno do item entre eles. Existe
  porque a quebra de 1080 tinha resolvido o colapso e não a medida de linha, e
  o que sobrava era **não-monotônico**: 33 caracteres por linha a 900px, 16 a
  1090px e 50 a partir de 1340. Alargar a janela piorava a leitura. 1340 é
  `--area-max + --trilho-w`, onde o item chega a 1000px e as duas colunas
  voltam a caber. Hoje nenhuma largura de 430 a 1920 fica abaixo de 49ch.
- **O par fila+trilho centra JUNTO** (desde 28/08/2026). `.comB` é
  `minmax(0,var(--area-max)) var(--trilho-w)` com `justify-content:center`, e a
  barra repete o mesmo recuo em `padding-inline`. Com `1fr` na primeira coluna
  o trilho colava na borda da janela e sobravam 285px de campo morto entre as
  colunas a 1920px. ⚠️ Isso **só é possível porque o fundo do trilho é o mesmo
  `--mar-900` do campo** — se ele um dia ganhar fundo próprio, vira uma coluna
  boiando e a regra tem de ser revista. A fila não se move com a mudança
  (`W/2 − 650` nos dois arranjos), então placar e fita seguem alinhados.
- **O celular redeclara `--barra-h`; nunca escreva a altura da barra à mão.**
  O `.trilho` gruda em `top: var(--barra-h)`, então uma altura escrita fora do
  token faz o trilho colar no lugar errado — foi exatamente o que aconteceu com
  o `calc(54px + ...)` que existiu aqui.

## O passe de qualidade de 27/08/2026

A tela nasceu fiel ao comp — **e o comp carregava os defeitos**. O passe
(skill `impeccable`, comando `polish`) mediu e corrigiu, sem mexer em copy nem
em funcionalidade. Direção e recusas ficam em
[`../../.impeccable/surfaces/public-operador-html.md`](../../.impeccable/surfaces/public-operador-html.md).

| O que estava | Medida | Como ficou |
|---|---|---|
| Item da fila | 318px — dois por tela | **258px**, ~3,5 por tela |
| Medida de linha do relato | 110–140 caracteres | **68ch** |
| Ações do item | fim de uma linha que variava com o texto | **coluna própria**, mesmo x na fila toda |
| Etiquetas mono (`--muted2`) | 3,05:1 a 8–9px em caixa alta | **`--muted`, piso de 5,2:1** |
| Rótulo do tanque | 8px e truncado ("Caixa S…") | 9,6px, célula do tamanho do nome |
| Nome do prédio | mono 9,3px, junto do bairro | Archivo 12,5px; o bairro segue etiqueta |

Três defeitos que não se veem lendo o CSS:

1. **`h3` sem `margin:0` dentro de flex.** A margem de 1em do navegador não
   colapsa ali — eram **29px de ar acidental por item**, quase 10% da altura.
2. **O pulso da barra nascia vermelho.** `_ultimoOk` começa nulo e o rótulo era
   binário, então todo boot abria com *"verifique a conexão"* aceso até a
   primeira carga. Hoje são **três estados**, e o neutro existe justamente
   para não gastar o alarme.
3. **`+ Novo chamado` era `display:none` no celular.** A porta de entrada do
   chamado que chega por telefone sumia exatamente na tela em que se está
   longe da mesa. Hoje some o rótulo, fica o ícone.

**A marca era texto.** A barra compunha a palavra "General" em Archivo, quando
a landing, o login, o painel do cliente e o admin usam todos o PNG do wordmark.
Entrou o `logo-topo.png` (sem a assinatura — o mesmo da barra do painel do
cliente), a 30px numa barra de 60. ⚠️ Passou batido no passe porque a
verificação foi da tela **contra ela mesma**, não contra as superfícies irmãs.

Também entraram: `.fala` (o bloco de relato que existia no CSS e nunca era
renderizado), o trilho da equipe no dia calmo, `aria-modal` + foco que entra no
diálogo e **volta para o botão de origem**, fallback do mapa quando o Leaflet
não carrega, reenvio de tile que falhou (a correção que o admin já tinha) e o
crédito do OpenStreetMap, que estava removido.

### E o passe de conformidade, no mesmo dia

O passe acima mediu a tela **contra ela mesma**. O Pedro apontou que o pedido
era outro — trazer a tela para o padrão do painel do cliente e da landing — e a
comparação elemento a elemento achou **13 divergências**. Entraram: a marca em
PNG, `--fonte`/`--mono`, `--corte`/`--corte-p` no lugar de oito `polygon()`
crus, `--saida`, os tokens de barra e coluna, o anel de foco `inset`, a barra
de rolagem do sistema (com `scrollbar-width`, que faltava), o diálogo sem blur
com trava de rolagem, e o `prefers-reduced-motion` global. A barra passou a
dividir a tela como o corpo divide acima de 1340px. Detalhe no
[changelog](../changelog.md) e no
[brief da superfície](../../.impeccable/surfaces/public-operador-html.md).

⚠️ **A régua de tipo continua sem tokens**, aqui e nas outras quatro folhas —
está registrado em [`../../DESIGN.md`](../../DESIGN.md). As advertências de
`font-size` do detector são conhecidas e valem para o sistema inteiro.

### E o terceiro passe, com as três telas abertas lado a lado

Os dois passes acima foram feitos lendo código. Este foi feito com o painel do
operador, o painel do cliente e a landing **montados no navegador ao mesmo
tempo**, medidos em 1544, 900, 620 e 430px — e é por isso que ele achou o que
os outros dois não podiam achar: nenhum dos defeitos abaixo aparece na leitura
do arquivo, e nenhum é pego por detector.

O pior deles: **entre 660 e ~1090px a tela desmontava**. Havia uma quebra só
(celular) num arranjo de duas colunas com trilho rígido de 300px — entre ele e
o item de largura fixa, só o texto podia ceder, e cedia até virar dez
caracteres por linha. A quebra de 1080px é o conserto; ver a regra das três
faixas acima. Também entraram: o comportamento de rolagem da barra (`is-rolada`
com `blur`, como nas irmãs), o chanfro nas três peças que tinham canto reto
(`.conta`, `.tec-av`, `.ficha-x` — a mesma varredura no cliente acha zero), o
traço esquadrado nos quinze ícones que estavam arredondados, a máscara que
prende a engrenagem à faixa de campo aberto, e o `--barra-h` de volta ao token.
Detalhe completo no [changelog](../changelog.md).

⚠️ **Achado não consertado, de propósito: todo `--ch` local é morto.** O
`var()` de uma custom property é substituído onde ela é DECLARADA, então
`--corte` resolve `--ch` no `:root` e os filhos herdam o polígono pronto —
`.item` pede 16px, `.ficha` pede 22, e as duas saem com o número do `:root`.
Vale nas cinco folhas, ou seja, a rampa de chanfro do `DESIGN.md` não existe em
superfície nenhuma. Consertar é mudar as cinco de uma vez; fazer só aqui
tornaria esta a folha fora do padrão. O que entrou foi alinhar o número global
(8 → 10px, o do cliente e do admin).

## O passe do item (31/08/2026) — "desenho de ausência não é instrumento"

O Pedro apontou o item do chamado #9 da produção: **quatro caixas d'água sem
sensor vivo, e quatro barras hachuradas idênticas** empilhadas dizendo "—".
Medido: item de **222px, com a trilha de tanques 100% vazia**.

| | Regra que passou a valer |
|---|---|
| Reservatório mudo | **Não desenha tubo.** Todos os mudos do item cabem numa linha, com os nomes preservados — a mesma frase do painel do cliente ("Sem leitura de X e Y") |
| Reservatório com leitura | Continua com a coluna d'água, e agora ela **é lida**: tubo de 156 → ~250px |
| Trilha da prova | `320px` fixos → `minmax(320px, 1fr)`. O motivo do fixo (o texto começar no mesmo x em toda a fila) sobrevive: todo item tem a mesma largura, então a fração resolve igual em todos |
| Largura do item | Vira **estrutura**: o número do chamado encosta na borda direita e "Ver detalhes" faz o mesmo embaixo. As duas linhas emolduram a evidência, em vez de tudo ficar empacotado no terço esquerdo de uma placa de 1000px |
| Cabeçalho de seção | 12 → **15px em `--text`**. Ele saía menor que a própria legenda e 6px abaixo do título do item: a fila abria sem nada dizendo "aqui começa" |

Resultado medido (mesma largura de item, 1000px): a região da evidência cai de
**82 para 49px** — a trilha de tanques, de 76 para 20 — e o item de **222 para
189px**. Saem também **~490px de campo morto** à direita da prova em todo item
com telemetria. Hoje quem manda na altura do item é a **linha de ações**
(52px), não mais a pilha do tanque.

⚠️ **Nada saiu da tela.** Os nomes dos reservatórios continuam todos escritos.
O que mudou foi o tamanho do que não tem o que mostrar — é a diferença entre
"simplificar" e "encolher" registrada no passe de 28/08.

## Permissões

O guard é `adminOnly` (`admin`, `gerente`, `operador`). Depois do corte de
27/08/2026 o perfil alcança **25 rotas** — as quatro telas que já tinha mais a
fila. Conferir com:

```
node scripts/auditar-rbac.js operador
```

## Pendências

- ⏳ **A migration 079 não rodou em produção.** Só no banco de teste. Sem ela,
  o `INSERT` do `POST /operador/orcamentos/:id/chamado` estoura — é a lição da
  Fase 7E. Rodar com o `DATABASE_URL` de produção:
  `node scripts/migrate.js 079_chamado_orcamento.sql`.
- 📋 **Nunca rodou sob a role real.** Não existe usuário `operador` em produção
  (confirmado em 27/08/2026); a tela foi exercitada com JWT assinado à mão
  contra o banco de teste, e o visual não foi visto logado.
- 📋 **A ficha e o diálogo de despacho não passaram pelo corte de simplicidade**
  que o item e o trilho já receberam — a ficha é onde foi parar tudo que saiu
  do item, e continua densa.
- 📋 Coluna `origem` em `chamados`, para a procedência deixar de ser dedução.
- 📋 ETA de verdade no despacho: hoje o cartão do candidato mostra "no mapa"
  ou "—", não distância nem tempo.
