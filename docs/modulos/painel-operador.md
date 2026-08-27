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
| Barra | Placar do turno (estourados · esperando · em rota), relógio, pulso de "recebendo", `+ Novo chamado` |
| Coluna principal | **Esperando alguém** (sem técnico) e, abaixo, **Já tem técnico** |
| Trilho | **Equipe agora** (disponibilidade e nº de abertos) e **Despachados hoje** |

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
- **São TRÊS faixas de layout, não duas** (desde 27/08/2026): acima de 1080px a
  fila e o trilho são colunas; de 1080 a 760 o trilho **desce** e vira faixa
  horizontal; abaixo de 760 entra o layout de celular. Os dois números vêm das
  irmãs — 1080 é a primeira quebra da landing, 760 é onde ela e o painel do
  cliente deitam a coluna d'água. Quem tirar a quebra de 1080 devolve o defeito
  descrito abaixo.
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

## Permissões

O guard é `adminOnly` (`admin`, `gerente`, `operador`). Depois do corte de
27/08/2026 o perfil alcança **25 rotas** — as quatro telas que já tinha mais a
fila. Conferir com:

```
node scripts/auditar-rbac.js operador
```

## Pendências

- 📋 **Nunca rodou sob a role real.** Não existe usuário `operador` em produção
  (confirmado em 27/08/2026); a tela foi exercitada com JWT assinado à mão
  contra o banco de teste, e o visual não foi visto logado.
- 📋 Coluna `origem` em `chamados`, para a procedência deixar de ser dedução.
- 📋 ETA de verdade no despacho: hoje o cartão do candidato mostra "no mapa"
  ou "—", não distância nem tempo.
