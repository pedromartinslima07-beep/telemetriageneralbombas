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
| Barra | Marca · **Aprovados · Ajuda** (texto, como a landing) · `+ Novo chamado` (âmbar) · **o nome de quem está logado**, que abre a gaveta de conta (trocar senha · sair) |
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

## ⚠️ A preventiva não entra na fila até alguém começar (04/09/2026)

`GET /operador/fila` exclui o chamado de preventiva enquanto ele está apenas
`aberto`:

```sql
AND (ch.plano_manutencao_id IS NULL OR ch.status = 'em_atendimento')
```

Pedido do Pedro: a preventiva vive na tela de Preventivas até o técnico começar.
O motivo em números: no dia em que o job gerou o mês, a fila tinha **73 itens e
69 eram preventiva** — os 4 chamados que pediam alguém ficavam sob 95% de ruído,
numa tela cuja tese é "o que estoura primeiro".

⚠️ **O sinal de "começou" é `em_atendimento`**, posto pelo "Iniciar" do app
(`POST /chamados/:id/iniciar-atendimento`). **Não existe evento de "saiu para a
rota"**; se um dia existir, troca-se esta linha.

⚠️ **O corte é pela ORIGEM (`plano_manutencao_id`), nunca pela prioridade.**
Preventiva é P4, mas nem todo P4 é preventiva — os 4 que sobraram na fila são
todos P4 e nenhum vem de plano.

⚠️ O mapa e os contadores acompanham sozinhos: leem a mesma `fila`.

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

## Abrir já despachando (31/08/2026)

> *"Queria que quando fosse criar o chamado já desse para atribuir o técnico,
> por exemplo na tela de orçamento, ou no botão novo chamado."* — o Pedro.

Os dois diálogos de criação — o **Novo chamado** da fila e o **Abrir chamado**
dos Aprovados — ganharam um seletor **Técnico**, opcional. Antes o chamado
nascia sempre sem ninguém: quem já sabia quem ia (e no telefone quase sempre
sabe) tinha de gravar, achar o item na fila e despachar — dois passos para uma
decisão só.

| | Regra, e por quê |
|---|---|
| Padrão | **"Despachar depois"**, sempre. Formulário que já vem com alguém escolhido atribui por inércia — o operador confirma sem ler e o chamado sai com um técnico que ninguém decidiu mandar |
| Posição no formulário | **Depois da descrição**, que é a ordem da conversa ao telefone: onde · o que · quanto corre · o que foi dito · **quem vai**. Escolher antes de escrever o relato é escolher sem o que a decisão precisa |
| O que cada opção diz | Nome **+ o mesmo estado do cartão de despacho** (livre agora · N chamados · ocupado). Um nome só não é escolha informada |
| Ordem | A do despacho — **livre primeiro, depois menos carregado**, nunca alfabética. As duas telas respondem "quem pode ir"; ordens diferentes ensinariam que a primeira posição não quer dizer nada |
| Quem entra na lista | `ativo` **e** `cargo = 'tecnico'` — a mesma regra do `resolverTecnico`, que valida na gravação. A consulta é uma só (`SQL_EQUIPE`): tela que oferece quem o banco recusa é o pior sintoma possível |
| Relógio | Atribuir **marca `primeira_resposta_em`** e para o TTFR, igual ao despacho pelo `PATCH`. Se o operador já despachou no ato de abrir, a resposta foi imediata — deixar o relógio correndo cobraria uma resposta que já veio |
| Status | Continua **`aberto`**. `em_atendimento` é só do app do técnico, com GPS. Atribuir não é começar |
| Histórico | A atribuição vira linha `tecnico_id` em `historico_chamados`, **indistinguível de um despacho feito depois** — a ficha responde "quem mandou e quando" do mesmo jeito nos dois casos |
| Confirmação | A faixa diz **para qual seção o chamado foi** ("Já tem técnico" ou "Esperando alguém"). É a mesma correção do despacho: o item nasce numa das duas e pode cair abaixo da dobra |

⚠️ **A tela de Aprovados busca a equipe em `GET /operador/tecnicos`, não em
`GET /tecnicos`.** O segundo devolve a ficha inteira do funcionário — CPF, RG,
endereço, data de nascimento — porque serve o cadastro do admin. Uma tela que
só precisa de nomes não tem por que receber isso: dado que não trafega não
vaza. A fila **não** usa esse endpoint: lá a equipe já vem no `/operador/fila`
(uma request monta a tela). Aqui é o raciocínio do `/prazos` — é diálogo, e
diálogo não entra no caminho crítico da lista.

⚠️ **No clique duplo dos Aprovados, a escolha PREENCHE VAZIO e nunca troca.**
Chamado que já existe sem técnico recebe o escolhido (`tecnico_atribuido:
true`); com técnico, nada muda e a faixa diz isso. Ignorar em silêncio faria a
tela afirmar um despacho que não houve; sobrescrever faria o segundo clique
desfazer, sem aviso, o despacho do primeiro — ou o de outro operador.

## A terceira tela: Preventivas (`/operador/painel/preventivas`)

Pedido do Pedro (03/09/2026): *"preciso que em operador fique todas as
preventivas do mês, separada bonitinho as que já foram feitas e as que faltam
fazer, tem que dar para enviar esses chamados para o técnico por região [...] ou
escolher condomínio por condomínio qual vai para cada técnico"*.

O contrato obriga a visita mensal a cada prédio; esta tela é o instrumento de
cobrança dela. Responde, nesta ordem: **o que falta**, **quem vai**, e **o que
já saiu**.

⚠️ **LISTA PLANOS, NÃO CHAMADOS** — mesma escolha do `meu-roteiro`. O chamado P4
da preventiva só nasce quando o técnico chega no prédio e toca "Iniciar"
(`executarPlano`). Listar chamados mostraria só o que já começou, e o que a tela
precisa responder é justamente o que **falta**.

### O que faltava no banco: quem faz ESTE mês

Antes disto, a única forma de dizer quem executa uma preventiva era a **zona**
(`planos_zona_responsavel`) — atribuição permanente e por região. Não havia como
dizer "este mês o Cleber pega o Saint Antoine".

Em produção isso pesava: **11 técnicos ativos e uma única zona com responsável
cadastrado**. Na prática o despacho da preventiva acontecia por fora do sistema.

`planos_atribuicoes` (migration 082) é a atribuição do **ciclo**, por
competência (o dia 1 do mês). Ver [`../banco-de-dados.md`](../banco-de-dados.md).

### ⚠️ A preventiva vence no MÊS, não no dia (04/09/2026)

Regra de negócio do Pedro: **as preventivas dos condomínios são feitas entre o
dia 1 e o dia 10 de cada mês.** A `proxima_em` marca o MÊS em que a visita cai —
não é um prazo que estoura à meia-noite do dia seguinte.

⚠️ **A janela do dia 10 não é cláusula, e NÃO aparece em tela nenhuma.** Ela
descreve a prática: *"não é como se a gente ficasse proibido de fazer após
isso"*. Ver [decisions.md](../../memory-bank/decisions.md).

**Esta tela sempre esteve certa** — `atrasada` é `proxima_em < (dia 1 da
competência)`, ou seja, só preventiva de mês anterior é dívida. Quem media por
dia era o painel de planos do admin (`_pmStatus`) e o roteiro do app do técnico
(`rtPrazoLabel`), e os dois foram alinhados a esta regra em 04/09.

O tamanho do que isso evitava: 69 planos ativos com `proxima_em` no dia 4 — no
dia 5 o painel do admin marcaria os 69 como vencidos, em vermelho, de uma vez.

⚠️ Vale para 90/180/365 dias também: para um semestral que vence em setembro, a
competência é setembro.

### ⚠️ A regra que sustenta tudo: escalar é DESVIAR, não acrescentar

| Situação | Quem vê no app |
|---|---|
| escalado para MIM | eu — mesmo que a zona não seja minha |
| escalado para OUTRO | **só ele** — sai do meu roteiro, mesmo sendo minha zona |
| sem escala no ciclo | o responsável da zona, como sempre |

A segunda linha é a que importa. Somar as duas origens colocaria o mesmo prédio
no app de dois técnicos: os dois iriam, e um perderia a manhã. É o defeito que a
tela existe para evitar, e é a asserção mais importante de
`scripts/testes/preventivas-mes.test.js`.

⚠️ **A competência conferida é a do mês de `proxima_em`, não a de hoje.** O
roteiro enxerga 7 dias à frente: no fim do mês ele já mostra preventivas do mês
seguinte, e comparar com a escala de hoje faria a escala do mês que vem ser
ignorada justamente na semana em que começa a valer.

### ⚠️ Duas portas para o mês — `proxima_em` E `ultima_em` (04/09/2026)

O filtro de competência **não pode olhar só `proxima_em`**. Essa coluna é a data
da PRÓXIMA visita, e o job a rola para o ciclo seguinte **no instante em que
abre o chamado** — então, minutos depois de gerar as preventivas do mês, ela já
aponta para o mês que vem.

Foi o que aconteceu em produção em 04/09: o job rodou às 15h24, empurrou os 73
planos para 04/10, e a competência de setembro passou a listar **zero** — com 69
chamados de setembro abertos. A tela esvaziava quando o mês começava.

Um plano pertence à competência de dois jeitos: ou **vence** nela (ou antes, que
é dívida — não há limite inferior), ou **já rodou** nela (`ultima_em` dentro do
mês).

⚠️ Isto **não** é o `feita_no_mes`: aquele decide o ESTADO da linha, este decide
se a linha EXISTE.

⚠️ O LATERAL do chamado aberto (`cha`) segue **sem recorte de mês**, de
propósito — recortá-lo faria a tela oferecer despacho para um prédio que já tem
chamado aberto de outro mês.

### Os quatro estados, e o que é "feita"

| Estado | Quando |
|---|---|
| **A fazer** | vence no mês, sem escala e sem chamado |
| **Escalada** | alguém foi escalado neste ciclo (a atribuição explícita) |
| **Em campo** | há chamado da preventiva aberto |
| **Feita** | o chamado da preventiva **fechou** no mês |

⚠️ **"FEITA" É O CHAMADO FECHADO, não `ultima_em`.** Parecem a mesma coisa e não
são: `executarPlano` grava `ultima_em = CURRENT_DATE` no instante em que **abre**
o chamado — quando o técnico toca "Iniciar" no prédio. Uma preventiva iniciada
às 9h e abandonada às 9h05 tem `ultima_em` de hoje e não foi feita. Quem fecha o
chamado é a O.S. finalizada, e é isso que significa serviço entregue.

⚠️ **Mas `ultima_em` no mês conta quando não há chamado nenhum** — a execução
anterior a este módulo. Ignorar faria a tela cobrar de novo um serviço que a
equipe sabe ter sido feito.

⚠️ **O ATRASO GANHA DO "A FAZER" NO SELO.** Preventiva de agosto ainda aberta em
setembro não é "a fazer", é dívida — e ela entra na lista do mês junto, com
`atrasada`.

### ⚠️ `tecnicos` é o quadro inteiro — filtre por `cargo` (04/09/2026)

A tabela `tecnicos` guarda **todo o pessoal**, não só quem vai a campo: em
produção são 6 com `cargo='tecnico'`, 3 `gestor` e 2 `adm`. Toda lista de
despacho e toda gravação de responsável precisam de
`COALESCE(cargo,'tecnico') = 'tecnico'` — o `COALESCE` porque a coluna nasceu
depois das linhas, e nulo é técnico.

A barra de despacho desta tela oferecia os 11, e a rota de escalar aceitava
qualquer um deles. Hoje a listagem filtra por cargo e **quem valida a gravação é
o [`chamado-atribuicao.service.js`](../../src/services/chamado-atribuicao.service.js)**,
o mesmo do "Novo chamado" e de Aprovados: uma regra de negócio, um lugar só.
Recusa responde **400** (campo do corpo inválido), não 404.

⚠️ Ao escrever consulta nova sobre `tecnicos`, olhe o `SQL_EQUIPE` no topo do
`operador.routes.js` antes: ele já traz a regra e o aviso de que a tela e a
gravação têm de responder igual.

### ⚠️ "Em campo" é chamado aberto COM técnico (04/09/2026)

O job cria o chamado P4 do mês **sozinho e sem responsável**. Enquanto o
`estadoDa` lia qualquer chamado aberto como `em_campo`, os 69 planos de setembro
ficaram nesse estado com **zero técnico em campo** — e a tela esconde a caixa de
marcar, o botão da zona e a barra de despacho ali. O operador perdeu a única
ação da tela no dia em que ela mais importa.

Chamado órfão **não** é serviço andando: é serviço esperando alguém, que é o que
`a_fazer` já diz.

⚠️ **E o despacho ADOTA esse chamado.** Escalar não cria um segundo: o
`POST /operador/preventivas/atribuir` põe o técnico no chamado aberto do plano,
na mesma transação da escala. Sem isso o operador despachava e o serviço não
chegava a ninguém — o chamado ficava órfão, fora do app do técnico e fora da
fila do turno.

⚠️ Só o **aberto**. Fechado e cancelado são passado. Desescalar limpa junto, e a
troca vai para o histórico do chamado.

### O despacho

Agrupado por **zona**, porque é por zona que a decisão se toma ("a Zona Leste vai
com o Cleber"). O botão "Escolher as N" marca a zona inteira e o mesmo botão
desmarca; as caixinhas resolvem o prédio a prédio. A barra do pé só existe com
algo marcado, e fica **fixa**: o operador marca rolando a lista, e uma barra no
topo o obrigaria a voltar até ela.

⚠️ **Marcar uma caixinha NÃO redesenha a lista.** `render()` inteiro destruiria o
`<input>` que acabou de receber o clique — o foco vai para o `body` e quem marca
vários seguidos com o teclado perde o lugar a cada um. Só a linha e o número da
barra mudam (`_pintarMarcada` / `_atualizarBarra`), e a barra atualiza **só o
número**, porque recriá-la apagaria o técnico já escolhido.

### ⚠️ O terceiro link reabriu o defeito da barra no celular

Com Preventivas a nav passou a ter três itens, e a 390px o wordmark voltou a
pintar **84px** por cima deles — o mesmo defeito que a gaveta de conta tinha
fechado em 02/09. Medido: nav 168 + nome 43 + Sair 44 = 280px de ações contra
124 de wordmark.

Duas trocas, ambas medidas: **"A fila do turno" vira "Turno"** no celular (dois
`<span>` do mesmo rótulo, não dois links) e **o nome de quem está logado sai da
barra** abaixo de 760px — a mesma troca que o painel do turno já tinha feito, e
pelo mesmo motivo: no celular o nome é conferência, não operação. Fecha com
**zero sobreposição de 360px para cima** nas três telas. 320px segue fora, limite
conhecido.

### O passe de nível (03/09/2026)

Depois de pronta, o Pedro: *"tenho minhas dúvidas se essa tela está com o nível
das outras"*. Medidas lado a lado com Aprovados: manchete **40 contra 51,2px**,
maior tipo da placa **16,3/700 contra 21,6/800**, padding **14/20 contra 28/30**,
medida **136 contra 88ch**, âmbar em **uma** peça contra três.

Era o mesmo diagnóstico de 31/08 — e eu tinha repetido o defeito daquela rodada.
O detalhe do passe está na brief da superfície
(`.impeccable/surfaces/public-operador-html.md`); o que ficou como regra:

⚠️ **A placa vai a 17/24, não aos 28/30 de Aprovados.** São até 72 prédios num
mês contra 7 orçamentos: é o registro de leitura na densidade que a varredura de
um mês inteiro admite.

⚠️ **O âmbar vive no contador da ZONA, nunca no selo do item.** Selo por item
viraria textura — no dia 1 todas estão a fazer, e 72 selos acesos não sinalizam
nada. Na zona ele acende uma vez por região e apaga conforme o mês é resolvido.

⚠️ **O que já foi feito recua por MATERIAL** (`--chapa-es`), nunca por
`opacity` — a primeira versão usava `opacity:.86` e derrubava o contraste de
tudo que estava dentro. É a regra de Aprovados, e foi violada aqui.

⚠️ **A caixa de marcar é desenhada, não nativa.** `accent-color` deixa o
quadradinho do sistema operacional — a única peça da tela que não era da casa. O
`input` continua, invisível: teclado, leitor de tela e `:checked` são dele.

### A barra translúcida para sempre (04/09/2026)

⚠️ **A `.barra` desta folha nasce translúcida e só endurece se o JS da tela
puser `is-rolada`.** O `operador.css` define os dois estados; quem alterna é um
listener de `scroll` (limiar 12px) que existe **em cada** JS de tela. Preventivas
subiu sem ele — a mesma falta que Aprovados teve em 31/08 —, e a barra ficava
translúcida para sempre, com as placas claras dos prédios borrando o cabeçalho.

O listener vem **com a chamada inicial junto**: o navegador restaura a rolagem
no F5, e sem ela a barra nasce translúcida com a página já rolada. Ver o
[changelog](../changelog.md).

### A barra de despacho (refino de 04/09/2026)

A peça que abre para escolher o técnico é **fixa no pé e só existe com algo
marcado** — o operador marca rolando a lista, e uma barra no topo o obrigaria a
voltar até ela.

⚠️ **O fundo dela sangra de ponta a ponta; o conteúdo mora na coluna.**
`left/right:0` na barra, `max-width:var(--area-max)` no `.pv-barra-in` — nunca
`max-width` na própria barra, senão o fio e o fundo param de ir de borda a
borda. Sem isso a barra ficava colada na esquerda da janela enquanto a lista
estava centrada: 423px de degrau medidos a 1920px.

⚠️ **O `<select>` é peça da casa, não do sistema operacional.** `appearance:none`
mais a seta desenhada, e o fio é feito pelo **rótulo em volta** (fundo `--fio`,
select embutido 1px) — `<select>` não tem `::before` para a chapa de duas
camadas, e tanto `border` quanto `box-shadow:inset` saem recortados pelo
`clip-path` nos chanfros.

⚠️ **A altura da barra é um token** (`--pv-pe`): dela dependem o respiro da
lista, o `bottom` da faixa de aviso e a altura no celular. A faixa de erro
**precisa** subir acima da barra — em `bottom:22px` ela era desenhada por cima
do próprio select que a mensagem manda usar.

Detalhe completo do passe no [changelog](../changelog.md).

### Para olhar sem sessão: `/dev/_preventivas-preview.html`

Carrega o `operador.css` e o `operador-preventivas.js` de produção e dubla só a
rede. A fixture tem os quatro estados, as duas origens de responsável, um prédio
**sem zona** e dois **sem técnico nenhum** — que é o caso real em produção. O
despacho mexe na fixture, então o ciclo inteiro (marcar → enviar → ver o estado
mudar) se testa ali.

---

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

### Os cinco estados de um orçamento aprovado

| Estado | Selo | Ação | Placa |
|---|---|---|---|
| livre | **Pode executar**, âmbar cheio | "Já foi feito" (link) + "Abrir chamado" (âmbar) | `--chapa` |
| chamado aberto | `Chamado #N aberto`, de fio | **nenhuma** — quem encerra é o chamado | `--chapa` |
| **executado** (03/09) | `Executado · DD/MM/AAAA`, de fio | "Ver O.S." (link) + "Abrir de novo", de fio | `--chapa-es` |
| chamado fechado sem O.S. | `Chamado #N fechado`, de fio | "Abrir de novo", de fio | `--chapa-es` |
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

### A tela não sabia que o serviço tinha sido feito (03/09/2026)

Relato do Pedro: *"um técnico foi ao condomínio fez o serviço, tínhamos a O.S.
no sistema porém estava lá em aprovados como se o serviço ainda estivesse em
aberto"*. Eram **dois** defeitos empilhados.

**O primeiro é do outro lado do sistema:** o chamado aberto pelo modal do admin
nascia sem `orcamento_id`, e nada ligava o serviço ao documento. Ver
[painel-admin.md](painel-admin.md).

**O segundo era daqui.** `render()` separava a lista por `executado_em` e mais
nada — só a marcação à mão tirava um orçamento da fila. Um cujo chamado já
tinha fechado continuava na lista principal e contado na manchete, com a
própria placa dizendo "Chamado #73 fechado" ao lado. **A tela sabia e a conta
não usava.** Hoje quem decide é `estaFeito()`, sobre `execucao()`.

⚠️ **São três formas de estar feito e nenhuma vale mais que a outra**: alguém
marcou à mão, a O.S. foi finalizada, ou o chamado que executava fechou.
Chamado só tem três status — `aberto`, `em_atendimento`, `fechado` —, **não
existe "cancelado"**: fechado é serviço encerrado, não desistido.

> ⚠️ **ISTO MUDOU EM 04/09/2026 (migration 083).** `cancelado` passou a existir,
> e ele é a única saída da fila que **não** é estar feito. `execucao()` devolve
> `livre` para o chamado cancelado — o orçamento **volta** a pedir execução, com
> o selo dizendo "Chamado #N cancelado". Sem isso o orçamento sumia da lista
> como executado justamente porque o serviço deixou de ser feito. Ver
> [chamados-sla.md](chamados-sla.md).

⚠️ **A O.S. vem ANTES do chamado na hora de dizer o que aconteceu.** O chamado
fechado é consequência: finalizar a O.S. o fecha sozinho
(`ordens-servico.routes.js`). Dizer "chamado #73 fechado" para um serviço com
O.S. assinada no prédio é contar o detalhe interno e esconder o documento — e é
o documento que o operador cita ao telefone.

⚠️ **`exec_os_*` NÃO é `os_id`/`os_numero`.** O primeiro é a O.S. que
**executou** (via `chamados.orcamento_id` → `ordens_servico.chamado_id`); o
segundo é a O.S. de **origem**, aquela em que o técnico pediu o orçamento. Por
isso o rodapé passou a dizer **"pedido na O.S. XXX"**: com duas O.S. possíveis
na mesma placa, o rótulo seco vira adivinhação.

#### O "Ver O.S." e o RBAC que ele pediu

O selo nomeia o documento; faltava chegar nele — e a trava era o RBAC de 27/08:
`osDonoOuAdmin` deixava passar admin, gerente e o técnico dono, e o operador
tomava 403 em qualquer leitura de O.S. A tela nomeava um documento que ela
mesma não abria.

`osDonoOuAdmin` passou a deixar o operador entrar **quando não é escrita**.

⚠️ **A linha é o `forWrite`, e ela não se move.** Editar O.S. é do técnico que
esteve no prédio: quem não foi lá não corrige o que foi medido lá. Provado nos
dois sentidos em `scripts/testes/operador-le-os.test.js`.

⚠️ **O botão busca o PDF com `fetch` + blob, não `<a href>`.** A rota exige
`Authorization: Bearer`; href não carrega header e o operador receberia o JSON
de "Token ausente" numa aba em branco.

⚠️ **Ele se desabilita enquanto busca.** O PDF é gerado sob demanda quando não
existe em disco — tempo suficiente para três cliques abrirem três abas.

⚠️ **Só aparece no estado `executado`.** No chamado fechado sem O.S. não há
documento para abrir.

⚠️ **O selo NÃO leva o número da O.S., e isso foi medido.** A primeira versão
levava, e dava **379px** contra os 175–184 dos quatro irmãos — mais de um terço
da placa, em mono e caixa alta, roubando a linha do número do orçamento. O selo
diz o ESTADO e o QUANDO, que é a gramática dos outros; o número mora no rodapé,
ao lado do botão que o abre.

⚠️ **UMA O.S. por placa.** Quando existem as duas (origem e execução), fica a
que executou — com as duas o rodapé quebrava em duas linhas e pedia que o
operador distinguisse dois números numa frase corrida.

⚠️ **No celular o link é centrado, como os irmãos.** `.orc-veros` nasceu
copiando as regras de mesa do `.orc-jafoi` e não a do `@media`, onde o
`margin-left:auto` é zerado: ele ia encostar na borda direita da placa enquanto
"Já foi feito" e "Desfazer" ficavam centrados. Medido a 390px — os três dão
16px dos dois lados.

### As DUAS O.S. de um orçamento, e qual delas abre (04/09/2026)

Um orçamento pode estar ligado a duas ordens de serviço diferentes, e a tela
precisa distinguir:

- **O.S. de ORIGEM** (`orcamentos.os_id`) — aquela em que o técnico marcou
  "precisa de orçamento". Responde *"de onde veio isto"*.
- **O.S. de EXECUÇÃO** — achada pela segunda perna,
  `ordens_servico.chamado_id` → `chamados.orcamento_id`. Responde *"o que foi
  feito"*, e é o documento que se cita ao telefone.

⚠️ **Uma por placa: quando existem as duas, fica a de execução.** As duas juntas
punham dois números de O.S. na mesma frase sem dizer qual é qual.

⚠️ **Mas quando a de origem é a ÚNICA, ela abre.** Até 04/09 o botão "Ver O.S."
existia só no estado `executado` — e a maioria dos orçamentos aprovados **não
tem chamado nenhum** (o técnico já estava no prédio e resolveu na hora, o caso
que a migration 080 reconheceu). Nesses, a placa escrevia o número da O.S. no
rodapé e não oferecia como abri-la: o OR-000204, em produção, tinha
`os_id=21` (OS-2026-0023, finalizada, com PDF) e um único botão, "Desfazer".
Hoje a O.S. de origem é alvo nos estados `livre`, `marcado` e `feito`.

⚠️ **Um `margin-left:auto` só por rodapé.** `.orc-veros`, `.orc-jafoi` e
`.orc-desfaz` têm todos o `auto` que empurra para a direita; com dois na mesma
fila o espaço livre é dividido e o "Ver O.S." fica solto no meio do rodapé.
Quem empurra é o primeiro. Ver o [changelog](../changelog.md).

### Para olhar sem sessão: `/dev/_aprovados-preview.html`

Mesma ideia do `_operador-preview.html`: carrega o `operador.css` e o
`operador-orcamentos.js` de produção e dubla só a rede, com fixture dos **cinco
estados**, um por linha. Sem ela, mudança de placa nesta tela vai para produção
sem ninguém ter visto a placa — o login do operador é handoff.

⚠️ **O `<head>` e a barra são cópia do `operador-orcamentos.html`**, e é a única
duplicação: ao bumpar o `?v=N` de lá, bumpe o de cá.

⚠️ **O "Ver O.S." responde 403 na prévia, de propósito.** Ali se olha a placa;
provar o download é no sistema de verdade.

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
| Técnico | **Opcional, e quase sempre já existe**: serviço aprovado foi combinado com alguém antes de o síndico aprovar. Ver [Abrir já despachando](#abrir-já-despachando-31082026) |
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
| Chamado | placa chanfrada 28px, ícone de prédio, cor = o relógio | chamado `aberto`/`em_atendimento` com prédio geocodificado | **sem técnico** → o despacho · **com técnico** → o balão (ver abaixo) |
| Técnico | círculo 26px com iniciais, **a pele do `.tec-pin` do admin** — gradiente, anel branco de 2px, glow e pulse | GPS dos últimos **30 min** | não |

⚠️ **Os tamanhos da tabela são os do mapa ESTREITO** (a coluna do trilho). Num
mapa largo — tela cheia, ou a faixa abaixo de 1180px, onde o trilho deixa de
ser coluna — os três crescem para **30 · 40 · 36px**, com a face e o chanfro
na mesma proporção. Quem decide é a largura medida no Leaflet, não a da
janela: `escalaPinos()` escreve `data-esc="g"` no `.mapa-tela` acima dos mesmos
**800px** que já escolhem o enquadramento, e o CSS lê dali. A distinção
importa porque `--trilho-w` é fixo em 400px — num monitor grande a coluna
continua com 400, e pino maior ali só empilharia os 86 prédios um sobre o
outro; um `@media` de largura de janela acertaria a tela cheia e estragaria a
coluna.

⚠️ **O tamanho do pino não vem do `iconSize` do divIcon.** O `iconSize` /
`iconAnchor` do JS posiciona só a **caixa**; a face é centrada nela por
`transform` (`.pin` no `operador.css`), e por isso ela pode crescer além da
caixa sem escorregar do ponto. O clique do pino de chamado sobrevive ao
transbordo: o Leaflet escuta na caixa e o evento sobe da face por bubbling —
`.leaflet-marker-icon` não recorta (o `overflow:hidden` do `leaflet.css` é do
`.leaflet-container`). ⚠️ Consequência: **nenhuma regra de pino pode declarar
`position`** — quem declara é o `.pin`, e sobrescrever tira a face do centro
da coordenada.

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

⚠️ **QUEM TRAVA O ENQUADRAMENTO É O GESTO DO OPERADOR, não o primeiro ciclo**
(correção de 01/09/2026). Era `if (!_mapaEnquadrado)` — enquadrava uma vez por
carregamento de página e nunca mais —, e numa tela que fica aberta o turno
inteiro isso faz a vista ser decidida pelo estado do sistema às 8h da manhã.

O caso real: turno calmo, zero chamado e nenhum GPS, então o mapa centrou na
mediana da carteira (`-23,5567 / -46,6571`) em zoom 12, que numa coluna de
400px alcança **±7,01 km**. Às 12h53 um técnico ligou o app a **7,84 km a
leste** — 830 m além da borda. O pino era desenhado a cada ciclo e o trilho
listava o nome, mas a vista nunca mais foi recalculada: ele aparecia no mapa do
admin e "sumia" no do operador.

Agora `_operadorMexeu` é o que trava. Enquanto ninguém tocou no mapa ele é
automático; no primeiro gesto, congela para sempre naquela sessão. O motivo
original (não arrancar a vista da mão de quem deu zoom num bairro) fica
intacto — só passou a ser disparado por quem ele sempre quis proteger.

⚠️ **`zoomstart`/`movestart` NÃO detectam o gesto** — o próprio `fitBounds` os
dispara, e o mapa se travaria sozinho no primeiro enquadramento, de volta ao
bug por um caminho mais difícil de enxergar. `_ouvirGestos` escuta os cinco que
exigem a mão do operador: `dragstart`, `wheel`, `dblclick`, `keydown` e
`touchstart` com dois dedos.

⚠️ **O critério é "fora da vista", não "mudou de lugar"** (`_precisaEnquadrar`):
reenquadrar a cada ciclo daria um tranco de 30 em 30 segundos enquanto um
técnico anda pela mesma quadra. O que precisa de correção é o ponto que o
operador **não consegue ver**.

### O chamado novo leva o mapa até ele (01/09/2026)

Quando uma questão nasce num condomínio, além do pino mudar de cor o mapa voa
até ele (`flyTo`, `ZOOM_FOCO` 13 — o mesmo teto do `enquadrarMapa`) e abre um
balão com prioridade, relógio, prédio, descrição e o botão que despacha.

O gatilho é o `_novos` do `render()` — **o mesmo conjunto que já destacava o
item na fila**. Nada novo foi inventado para detectar "chamado que chegou
agora"; ele só passou a chegar no mapa.

| Regra | Por quê |
|---|---|
| Passa por cima do `_operadorMexeu` | É a **única** coisa que passa. O gesto trava o ciclo de 30s porque aquilo é ruído do sistema; um chamado novo é o evento mais importante da tela |
| Interrompe **uma vez**, no nascimento | O ciclo seguinte já não o considera novo — o mapa não volta a saltar e um balão fechado fica fechado |
| **Um** alvo, o mais urgente | `DADOS.fila` já vem ordenada pelo SLA que estoura primeiro. Focar em três é não focar em nenhum |
| Na abertura da tela, **nada** | `_vistos` é `null` no primeiro ciclo e `novos` sai vazio: um painel recém-carregado não pode dar zoom em coisa velha antes de o operador olhar a fila |
| Substitui o enquadramento do ciclo | Enquadrar e depois voar são dois movimentos seguidos, e o primeiro é descartado antes de dar para lê-lo |

⚠️ **`L.popup` standalone, NUNCA `bindPopup`.** O `bindPopup` registra o próprio
handler de clique no marcador, e o pino de chamado já tem o seu — os dois
disparariam juntos e o clique abriria duas coisas. Com o popup solto, quem
decide o que abre é o handler, e ele decide pelo estado do chamado.

### O clique no pino segue o estado do chamado (02/09/2026)

| Estado | O que abre | Por quê |
|---|---|---|
| **Sem técnico** | o diálogo de despacho, direto | aí a pergunta É "quem pode ir", e ela se responde a um clique |
| **Com técnico** | o **balão**, no próprio mapa | a decisão já foi tomada; o que falta é ver quem foi e chegar à ficha |

⚠️ **Até 02/09 todo pino abria o despacho**, inclusive o de chamado já
despachado — e era a única peça da tela que oferecia isso. Na fila, o item com
técnico não tem botão "Despachar" (só "Ver detalhes"), e o próprio balão já
troca o botão pelo nome de quem foi. Só o mapa perguntava "quem pode ir" sobre
um chamado onde alguém já estava indo, com a lista inteira da equipe e nenhuma
palavra sobre o técnico atual: clicar num nome dali **reatribuía em silêncio**.

O balão foi a escolha do Pedro entre quatro (ficha, balão, despacho com
"trocar técnico", pino sem clique), e o motivo é a tela cheia: agora que o
painel fica aberto o turno inteiro, sair do mapa para ler quem foi é o que não
se quer. O balão responde **dentro** do mapa e leva à ficha por um link.

⚠️ **`autoPan` é `true` no clique e `false` no chamado novo**, e a diferença é
quem enquadra: no chamado novo quem centra é o voo, e o `autoPan` brigaria com
ele pelo centro; no clique nada se move — o operador já está olhando para onde
clicou —, então é o `autoPan` que impede o balão de nascer cortado na borda,
que é justamente onde um pino clicado costuma estar.

⚠️ **O balão abre ANTES do voo** e viaja ancorado na coordenada. Abrir no
`moveend` teria um buraco: `flyTo` para um ponto onde o mapa já está não dispara
evento nenhum, e o balão não apareceria. `autoPan:false` porque quem enquadra é
o voo — os dois brigam pelo centro.

⚠️ **Ele sobrevive ao ciclo de 30s** (não vive no `_pinos`, que é limpo a cada
volta), mas `_sincronizarBalao` não o deixa congelar: o relógio continua
correndo e um chamado que saiu da fila fecha o balão, em vez de seguir
oferecendo "Despachar".

O botão "Despachar" do balão funciona em tela cheia sem nada novo — `abrirFundo`
já usa `<dialog>` + `showModal()`, que põe o diálogo no top layer (ver a nota da
Fullscreen API no `operador.js`).

### ⚠️ O balão não cabia na caixa, e eram dois defeitos (02/09/2026)

**A largura mora no CSS, não no `L.popup({minWidth,maxWidth})`.** O
`.balao-pop .leaflet-popup-content` tem `width:auto!important`, e essa linha
anula exatamente onde o Leaflet aplica o cálculo dele (`_updateLayout` mede sem
quebra, limita entre os dois e escreve `style.width`). Sem isso o balão virava
shrink-to-fit: medido em 02/09, **132px para um mínimo pedido de 214** — o nome
do prédio quebrava em três linhas e os **438px** de altura resultantes não
cabiam nos 391 do mapa da coluna, deixando o pé (e com ele o "Ver detalhes")
fora da caixa. Hoje o `.balao` declara `width:268px` — o mesmo `maxWidth` que o
JS pede, que é o que o Leaflet escolheria para este conteúdo. Na coluna de
368px o balão fica em **271 × 337 com a seta**, dentro dos 391.

**E a altura segue o mapa** (`maxHeight`, calculado ao abrir). Só a largura não
bastava: na faixa em que o trilho deixa de ser coluna o mapa fica **largo e
baixo** — medido, **947 × 292** numa janela de 1000px —, e ali nem o balão de
318 cabia. `autoPan` não resolve esse caso: não há para onde panar quando o
conteúdo é mais alto que o contêiner. Com `maxHeight = altura do mapa − 44` (a
seta são 20, o resto é moldura e respiro), o conteúdo **rola dentro do balão**
em vez de vazar: naquela faixa o balão fecha em 270 e cabe nos 292. Acima disso
a conta não morde — na coluna de 1920 e em tela cheia não aparece rolagem
nenhuma.

⚠️ Os 268 estão no CSS **e** no `maxWidth` do JS. Mudar um é mudar o outro.

⚠️ **A cor da carteira é a PIOR BANDA dos reservatórios do prédio**, e prédio
sem telemetria conta como **em ordem** (verde) — é o que o `_mcStatusKind` do
admin faz. Em produção não há reservatório cadastrado, então a regra anterior
("só colore fora do ok") deixava os 87 cinzas e o mapa idêntico ao defeito.
Quem separa fundo de decisão é o **tamanho**: 22px na carteira, 28 no chamado.

⚠️ **A janela de GPS é 30 min, e NÃO tem corte de expediente** — ao contrário
de `GET /tecnicos/localizacao`, que zera a lista fora do horário. Aqui a lista
serve para despachar, e um P1 às 18h10 precisa saber quem ainda está em campo.

### O pino do técnico e o "sem sinal" (01/09/2026)

A paleta das duas telas **já era a mesma** — `--ok`/`--warn`/`--danger`/
`--muted` do admin e `--verde`/`--amarelo`/`--vermelho`/`--muted` daqui são os
mesmos quatro valores, e o `.map-tiles-dark` é idêntico. A divergência era de
**presença**, num pino só: o técnico era um círculo de `--fio-forte` (branco a
34%), a mesma construção de "presença sem sinal" da carteira de fundo — menos
presente que os 87 prédios, sendo a única peça que se move.

| | Admin (`.tec-pin`) | Operador (`.pin-tec`) |
|---|---|---|
| Pele | gradiente + anel branco 2px + glow + sombra | **a mesma** |
| Cor | violeta sempre | violeta sempre — **a matiz é a identidade e não muda**; o `data-liv` (que o admin não tem) entra na **luminosidade**: livre = violeta claro com tinta marinho · ocupado = violeta fundo com tinta branca |
| Tamanho | 32px, **maior** que o prédio (28) | 26px, **menor** que o chamado (28) — hierarquia da decisão |
| Pulse | técnico e prédios em warn/bad | **só o técnico** |
| Sem sinal | 10 min (`_tecStale`) | 10 min (`_gpsParado`) |

⚠️ **"Sem sinal" é a faixa ENTRE os 10 minutos e a janela de 30.** Passados 30,
a posição some da consulta e o pino deixa de existir; antes disso ela ainda
vem, mas já não é "agora". A tela não distinguia: um GPS parado há 25 minutos
pulsava igual a quem acabou de mandar posição, e o despacho ia para onde o
técnico **esteve**. Cinza, opaco e **parado** — o pulse quer dizer "ao vivo",
então é exatamente o que precisa sumir. O tempo vai na legenda, via `haQuanto`.

⚠️ **O pulse é só do técnico, e a regra do halo continua de pé.** Prédio e
chamado seguem sem piscar: 87 pontos animados na coluna de 400px apagariam os 3
que pedem alguém. O técnico é a exceção porque é o único que a tela precisa que
seja **achado**, não vigiado. Guardado por `prefers-reduced-motion`.

⚠️ **Hover: `transform` reescreve o `translate(-50%,-50%)` do `.pin`.** É uma
propriedade só — `scale()` sozinho apaga o translate que centra a face na
coordenada, e o pino salta um quarto de si mesmo no meio do gesto de apontar
para ele. Toda regra de hover de pino aqui repete o translate. (É a mesma
armadilha do `position`, logo acima: a face desta folha é centrada por
transform, a do admin não.)

⚠️ **`zIndexOffset: 500` no técnico** — entre a carteira (0/400) e o chamado
(1000): o Leaflet empilha por latitude, e um prédio de fundo ao sul cobria o
técnico. Continua abaixo do chamado, que é o único clicável.

**Cor nova nesta folha:** o violeta (`#8b5cf6` → `#6d28d9`) não está no
[DESIGN.md](../../DESIGN.md). Não é estado e não entra na paleta categórica —
é cor de **identidade** do técnico, herdada do `admin.css` para que as duas
telas digam a mesma coisa. Se virar token, é nas cinco folhas.

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

### ⚠️ Em tela cheia o ciclo NÃO reescreve o `#tela` (02/09/2026)

O nó do mapa é persistente para sobreviver ao ciclo (ver `mapaTurnoNo`), mas
ele mora **dentro** do `#tela`: o `innerHTML` do `render()` o arranca do
documento e o `replaceWith` o devolve no instante seguinte. O Leaflet atravessa
esse vaivém — pan, zoom e tiles ficam de pé. **A tela cheia não atravessa.**
Por especificação, tirar do documento o elemento em tela cheia encerra a tela
cheia, e devolvê-lo no mesmo instante não desfaz nada; o `fullscreenchange`
então via `fullscreenElement === null` e `mapaFsAplicar(false)` limpava a
classe. **O mapa fechava sozinho a cada volta do polling**, sem ninguém tocar
em nada — o "às vezes" do relato é só onde do ciclo a pessoa abriu.

⚠️ **Mover o nó para outro lugar antes do `innerHTML` não resolve:** mover é
remover e inserir, e é a remoção que encerra. Qualquer caminho que TIRE o nó
do documento tem o mesmo fim.

Então em tela cheia o ciclo pula o HTML e atualiza só o mapa — que é a única
coisa visível, já que o navegador pinta apenas a subárvore em tela cheia. Pinos,
balão e o voo do chamado novo continuam vindo a cada 30s. O `#tela` fica
devendo, e é reposto na **saída** (`_renderAdiado` + a chamada no
`mapaFsAplicar`), antes do `invalidateSize` — porque é o `render()` que devolve
o mapa ao trilho, e é o tamanho de lá que o Leaflet precisa medir.

### ⚠️ Esta tela NÃO desconecta por inatividade (02/09/2026)

`<body data-corte="nunca">` no `operador.html`. O painel existe para ficar
**aberto**: o mapa do turno é instrumento de plantão, e o operador passa longos
trechos olhando sem tocar em nada. Trinta minutos sem mouse ali não é ausência,
é o uso normal — e o corte jogava fora o enquadramento do mapa, os chamados já
vistos e o balão aberto.

⚠️ **O carimbo continua sendo gravado**, e isso não é sobra. O
`tg_ultima_atividade` é compartilhado entre as telas: se esta parasse de
carimbar, um dia de trabalho aqui deixaria o carimbo velho e abrir o
`/admin/painel` na mesma máquina cortaria a sessão no ato, antes de a tela
pintar. Só o **corte** é dispensado; a marca de vida continua valendo para quem
corta. Mecanismo igual ao `data-corte="cartao"` da tela de orçamentos — ver
[autenticacao.md](autenticacao.md).

⚠️ **E O ATRIBUTO SOZINHO NÃO BASTAVA** (corrigido em 02/09, mesmo dia). Ele
impede ESTA tela de cortar, mas o token vive no `localStorage`, que é do
navegador: o timer de qualquer outra aba aberta apagava a sessão embaixo dela,
e o painel morria no 401 seguinte. Hoje a tela **carimba sozinha** enquanto
está aberta (`PULSO_PLANTAO_MS`) e o timer das outras abas **confere o carimbo
antes de cortar**. Ver [autenticacao.md](autenticacao.md).

⚠️ **Vale só para o `/operador/painel`.** A tela de Aprovados
(`/operador/painel/orcamentos`) segue cortando: ali se lê um documento por vez,
não se fica de plantão.

`setTimeout` recursivo de **30s** (nunca `setInterval` — o padrão do projeto;
com `setInterval` uma request lenta empilha a próxima e o painel dispara em
rajada). O **pulso** da barra fica verde enquanto há carga recente e vira
vermelho após 3 ciclos sem sucesso: numa tela de turno, silêncio e falha não
podem se parecer. Erro aparece como **faixa**, nunca `alert()` — `alert` trava
a tela e travar significa parar de receber.

## O prédio do "Novo chamado" tem busca (02/09/2026)

O `<select>` de prédio virou campo de busca — `public/condo-picker.js`, o mesmo
componente do admin. São 86 prédios em produção e a lista nativa não filtra;
numa tela de turno, com o telefone no ombro, isso é uma busca feita duas vezes.

⚠️ **Ele é montado quando a lista CHEGA**, não junto do HTML: os prédios vêm de
`GET /condominios` por fetch, e o picker precisa deles para filtrar. Enquanto
não chegam, o campo é o `<select>` de "Carregando…", como já era.

⚠️ **`permiteVazio: false` aqui.** No admin o chamado pode nascer sem prédio
vinculado; na fila do turno, não — o mapa e o despacho dependem dele.

⚠️ **O `<label for="nvCondo">` é reapontado pelo componente** (03/09/2026), e
não deve voltar a apontar para `nvCondo`: na montagem esse id passa a ser de um
`<input type="hidden">`, que não recebe foco — o rótulo "Prédio" tinha deixado
de acender o campo. O picker o move para `nvCondo_busca`, o campo de texto.

⚠️ **O componente é um TERCEIRO ARQUIVO, não um import do `admin.js`.** A regra
de que esta folha não depende do admin continua de pé; o que ela proíbe é o
operador virar refém de uma tela que muda por outro motivo. `condo-picker.js`
não tem dono, como o `inatividade.js` que as duas páginas já carregam.

## "Minha senha" (02/09/2026)

O operador troca a própria senha pela barra. **O backend já existia**:
`POST /auth/trocar-senha` é `authRequired` puro, sem guard de papel — faltava
só a tela. Sem ela, o caminho era pedir ao admin um `reset-senha`, que gera
uma senha temporária **em texto puro** para alguém repassar.

⚠️ **DESDE 03/09/2026 ELA MORA NA GAVETA DE CONTA.** Nasceu como texto dentro
da `.barra-nav` — mas a nav se anuncia `aria-label="Telas do operador"`, e
trocar senha não é uma tela: para o leitor de tela o grupo mentia. O conserto
passou por uma etapa intermediária (uma segunda chapa `.conta` ao lado do
"Sair") que **não sobreviveu à medição**: três chapas não cabem na barra do
celular. Hoje o **nome de quem está logado é o botão**, e senha e sair são as
duas linhas da gaveta.

O desenho, o teclado e a conta de largura estão na seção
[A gaveta de conta](#a-gaveta-de-conta-03092026) mais abaixo.

⚠️ **Erro NÃO fecha o diálogo; sucesso fecha e confirma na faixa.** Quem errou
a senha atual precisa dos campos ainda preenchidos; quem acertou precisa saber
que trocou, e uma folha que fecha calada não diz isso.

⚠️ **A sessão aberta continua valendo depois da troca** — a rota mexe em
`usuarios.senha_hash` e não toca em token nem em `trusted_devices` (diferente
do `reset-senha` do admin, que revoga os dispositivos). Quem pede a senha nova
é o próximo login. Está dito na dica do formulário.

Teste: `scripts/testes/senha-operador.test.js`.

## A gaveta de conta (03/09/2026)

Pedido do Pedro: *"penso se n seria melhor q o nome da pessoa fosse um botao, e
por la ela conseguisse sair e trocar a senha"*.

`.eu` (invólucro) · `.conta.conta-eu` (o botão: silhueta + nome + seta) ·
`.eu-gaveta` com dois `.eu-item` (trocar senha · sair).

⚠️ **Revoga a regra do `cliente.html`** de que o nome é texto porque *"um alvo
que não leva a lugar nenhum ensina a pessoa a duvidar dos outros alvos da
barra"*. A regra era contra alvo **morto**; o nome agora leva a algum lugar, e
portanto a satisfaz. No [painel do cliente](painel-cliente.md) ela **continua
valendo** — lá não há gaveta, e as duas barras divergem de propósito.

⚠️ **Não é `<dialog>`.** Todo diálogo desta folha é `abrirFundo` +
`showModal()`. Aqui seria errado: modal para escolher entre dois itens
interrompe o turno e prende o foco numa tela que fica aberta o dia inteiro.
E ela **não precisa do top layer** — o motivo do `showModal()` lá é o mapa em
tela cheia, situação em que a barra não está alcançável.

⚠️ **A gaveta é IRMÃ do botão, nunca filha.** `.conta` tem `clip-path`, e
`clip-path` recorta a subárvore inteira: pendurada dentro do botão ela sai
cortada no chanfro.

⚠️ **`isolation:isolate` na gaveta**, como em todo `.conta`. A placa vive num
`::before` com `z-index:-1`; sem contexto de empilhamento próprio esse `-1`
escapa para trás do contexto do pai.

⚠️ **`id="btnSair"` preservado** na linha do sair: a delegação de clique
procura o Sair **por id** (é a peça compartilhada com as telas irmãs). Mudar o
seletor quebraria o logout sem erro nenhum no console.

⚠️ **A gaveta fecha ANTES de a ação rodar**, no mesmo handler delegado e antes
da linha do `#btnSair`. O `abrirFundo` guarda `document.activeElement` para
devolver o foco no fim; sem isso ele guardaria uma linha de gaveta já
`hidden`, e foco devolvido a elemento invisível não vai a lugar nenhum.

Teclado: ↓/↑/Home/End percorrem as linhas, Esc fecha e devolve o foco ao
botão, Tab sai. `aria-haspopup` + `aria-expanded` + `role="menu"`.

### A conta de largura da barra — refeita, e agora ela fecha

O `operador.css` manda refazer esta conta sempre que `.barra-acoes` muda.
Sobreposição do wordmark sobre a borda esquerda das ações, medida no navegador:

| largura | antes (em produção) | 2 chapas | gaveta (final) |
|---|---|---|---|
| 320px | 128 | 107 | 39 |
| 360px | 113 | 67 | **0** |
| 375px (SE) | 98 | 52 | **0** |
| 390px (iPhone 12–15) | **83** | 37 | **0** |
| 412px (Pixel) | 61 | 15 | **0** |
| 430px | 65 | 21 | **0** |
| 480px+ | 15 | 0 | **0** |

A coluna "antes" era o estado em produção: o logotipo pintava **83px por cima
de "Aprovados"** em todo iPhone recente. A gaveta devolveu 50px; o resto veio
da marca cedendo altura — **27px abaixo de 420 e 22px abaixo de 386**. Fecha de
**360px para cima**.

⚠️ **320px segue fora, e é limite conhecido:** ali sobram ~66px para a marca, o
que pediria 14px de altura. É o iPhone SE de 2016.

⚠️ **Os dois números saíram da tela, não da conta.** A aritmética a partir da
largura das ações dava 28 e 24, e medido sobrava 1px de sobreposição a 386px e
8,7px a 360px — a fórmula ignora o `gap` do `.barra-in` e o arredondamento do
wordmark. **Meça, não deduza.**

### ⏳ A tela de Aprovados ficou para trás

`operador-orcamentos.html` carrega **a mesma folha** e ainda monta o par "nome
(texto) + Sair" — por isso `.barra-eu` continua no CSS, e apagá-la deixaria o
nome de lá sem tamanho, sem cor e sem ellipsis (nada no painel do turno
acusaria). As duas barras do operador divergem enquanto isso durar; levar a
gaveta para lá exige o `dlgSenha` no `operador-orcamentos.js`, que não o tem.

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
