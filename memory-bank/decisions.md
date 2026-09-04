---
tags:
  - projeto
  - contexto/decisoes
aliases:
  - Decisões Arquiteturais
---
# Decisões Arquiteturais

Decisões deliberadas tomadas ao longo do projeto. Cada uma custou tempo ou foi
tomada conscientemente — não reverter sem motivo. Este arquivo é a fonte
canônica do "porquê"; o "o quê" está em `../docs/` e em [`current-state.md`](current-state.md).

## Stack e frontend

- **HTML/CSS/JS puro, sem framework/build.** Backend Express serve o frontend
  como estático. Decisão explícita: **não migrar para Next/React/Vite**, nem em
  redesigns. ApexCharts/Chart.js/Leaflet/Lucide vêm como arquivos locais em
  `public/static/`.
- **App mobile = Capacitor sobre HTML/CSS/JS puro** (`app/public/`). Em dev o
  Express serve `/app/*`; em prod o Capacitor empacota e faz fetch direto ao
  backend (capacitor://). Reusa tokens e componentes de `public/admin.css`.
- **Visual "Mission Control" único.** Brand amber (`--accent: #f0b014`). Toda
  tela herda a paleta dark do admin — **nunca criar paleta paralela**. Redesigns
  adaptam a referência visual ao Mission Control já implementado (preservar
  cores, performance de animação, logos, padrões de polling).
- **A fronteira não é "público × painel"; é "cliente × operação"
  (revisado em 2026-08-13).** `public/landing.css` nunca herdou nada de
  `admin.css`, e o motivo original continua de pé: o `#f0b014` do admin é a
  **interpretação interna** da marca, e em material voltado ao cliente vale o
  `#fbb329` institucional (ver `PRODUCT.md`).

  O que estava **errado** era onde a linha passava. Ela dizia "landing de um
  lado, todo painel do outro" — e com isso o **painel do cliente** ficava do
  lado do admin. Resultado: o síndico saía de uma landing marinho, passava por
  um login marinho e caía num painel preto e âmbar, que parecia outra empresa.
  O Pedro pegou esse degrau duas vezes: primeiro no login (11/08) e depois no
  painel (13/08).

  A linha agora separa **quem é o leitor**:
  - **Sistema "Chapa"** — landing (`/`), login (`/login`) e **painel do
    cliente** (`/cliente/painel`). Marinho + `#fbb329` + chanfro de 45°.
  - **Sistema "Mission Control"** — painel admin e app mobile do técnico.
    Âmbar `#f0b014`, dark, densidade de operação. Segue **separado, por
    decisão** — não é dívida a ser paga unificando.

  ⚠️ A regra "nunca criar paleta paralela" continua valendo **dentro de cada
  sistema**. E as três superfícies Chapa **duplicam os tokens de propósito**
  (`landing.css`, `login.css`, `cliente.css`): são páginas servidas
  separadamente, que não compartilham CSS. Mudou a paleta? Mude nos três.

- **O painel do cliente carregava o `admin.css` — e esse era o defeito
  (2026-08-13).** O Pedro pediu o redesenho dizendo *"o principal problema foi
  tentar copiar o painel de admin"*. O diagnóstico dele estava certo, e o
  problema era mais fundo que aparência: o painel **não era inspirado** no
  admin, ele **era** o admin — 265 KB de `admin.css` mais 385 linhas de
  override. Três consequências que valem como lição geral:
  1. **Acoplamento invisível.** Toda evolução do admin caía no painel do
     síndico sem ninguém pedir nem revisar. O salto de `?v=159` para `?v=189`
     entregou 30 versões de mudanças de uma vez, e ficou meses como pendência
     de "passada visual" que nunca aconteceu.
  2. **A arquitetura de informação veio junto com o CSS.** O admin tem
     *Dashboard* **e** *Telemetria* porque olha N condomínios. O cliente tem
     um — e as duas seções mostravam os mesmos 3–5 reservatórios duas vezes,
     com componentes diferentes para o mesmo dado. Copiar a folha de estilo
     trouxe a estrutura de navegação de brinde.
  3. **O tom veio junto também.** "LIVE", "Severidade", "Aberto há", rótulo de
     KPI a 9px no celular. Densidade de quem olha carteira, para quem quer
     saber se pode dormir.

  A correção não foi repintar: foi **desacoplar**. `cliente.css` virou folha
  autônoma, mantendo os ~225 nomes de classe que o `cliente.js` emite — trocou
  o mundo sem tocar no contrato de markup. Detalhe em
  [`../docs/modulos/painel-cliente.md`](../docs/modulos/painel-cliente.md).

- **Trocar o mundo visual não é reimaginar — a v1 do painel do cliente foi
  rejeitada por isso (2026-08-13).** Na mesma sessão em que o painel saiu do
  `admin.css`, entreguei uma v1 que trocou a paleta, fundiu duas seções e pôs
  uma linha do tempo numa delas — **mantendo a casca inteira do admin**:
  sidebar com colapso, topbar com avatar e botão de atualizar, fileira de
  cards de KPI, lista+detalhe com abas, busca e tabelas. O Pedro recusou:
  *"ficou parecido com o painel admin só que pior"*, *"o menu colapsável não
  funciona tão bem quanto no admin"*, *"o que parece que mudou de fato é o
  visual, e achei muito poluído"*.

  Três lições, e as três são gerais:
  1. **Reimaginação parcial é repintura.** A skill escolheu a estrutura de uma
     seção; eu não questionei se o painel devia ter navegação, KPIs, abas ou
     tabelas. Governou uns 30% da superfície e o resto ficou sendo o admin.
  2. **Herdar a casca herda a acusação.** Enquanto sidebar, topbar e KPIs
     estiverem lá, é irrelevante que a paleta tenha mudado — o usuário lê
     "mesmo painel, outra cor".
  3. **Volume é parte da linguagem.** Importei o mundo "Chapa" da landing com o
     volume dela: anel âmbar, marcas tracejadas, etiqueta mono em tudo. A
     landing é peça de venda e pode ser alta; o painel é onde o síndico vem se
     acalmar. Mesma língua, volume errado — e isso lê como "poluído".

- **A direção aprovada do painel do cliente: "a resposta, não o painel"
  (2026-08-13).** A primeira tela inteira é **uma frase** que qualquer pessoa
  entende sem legenda ("Tem água."), com os reservatórios ao lado como prova e
  **uma** ação. Abaixo, a história do prédio contada como um humano contaria,
  onde cada linha abre a ficha do chamado, e o PDF no fim.

  **Alertas e chamados deixam de ser lugares.** Não há navegação: o que
  acontece agora está na frase, o que já aconteceu está na história, o detalhe
  abre por cima. Isso remove sidebar, colapso, topbar, KPIs, tabelas, abas e
  buscas de uma vez — e é essa remoção, não a paleta, que separa este painel do
  admin.

  Comp aprovada como norte em
  [`../docs/comps/painel-cliente-v2.html`](../docs/comps/painel-cliente-v2.html),
  refinada até a
  [`v3`](../docs/comps/painel-cliente-v3.html) e **implementada em 14/08**;
  estratégia durável em `.impeccable/surfaces/public-cliente-html.md`.

- **Onde moram os órfãos: tudo que sobrou virou ficha (2026-08-14).** Tirar as
  seções deixou sem casa a troca de senha, a avaliação do atendimento, o
  cliente sem telemetria e o histórico com períodos. A resposta **não foi criar
  seção nenhuma**: o "Sair" solto no topo virou o **nome do síndico**, que abre
  a ficha *Sua conta*; a avaliação foi para o **pé da ficha do chamado** (nada
  de modal sobre modal, que era o vício do admin); o cliente sem telemetria
  virou **a mesma tela com outra resposta**, não tela de exceção; e o histórico
  com períodos vive na ficha do reservatório — que é, não por acaso, o único
  lugar de onde o `device_id` exigido por `/relatorio/pdf` tem como sair.

- **A prova são três colunas, no máximo (2026-08-14).** O Pedro recusou a faixa
  de onze tubos: *"não gosto muito como é mostrado muitos reservatórios"*. O
  diagnóstico é o mesmo da v1 — onze colunas iguais lado a lado **voltam a ser
  um gráfico de barras**, e o síndico não audita onze números: ele quer saber
  se algum é problema. Aparecem os que estão fora do normal ou, se está tudo
  normal, os três mais baixos; o resto vira uma frase com a faixa real. Ganho
  colateral: **o layout deixou de ter uma variante** — sumiram o modo "muitos",
  a grade de auto-fit e as regras móveis dela.

- **O contraste mora no CLIQUE, não no scroll (2026-08-14).** Eu levei a
  história para placa clara e o Pedro recusou: uma seção clara no meio da
  rolagem parte a página em dois sites. Mas o diagnóstico dele era outro —
  *"a tela toda ser azul, sem contraste"* — e o lugar certo eram **as fichas**.
  Regra que ficou: o painel em repouso é marinho do topo ao rodapé, e **toda
  ficha é placa clara**. O contraste acontece no momento em que ele age; a tela
  de descanso continua descansando. É também o destino dos tokens
  `--atencao-t`/`--risco-t`/`--normal-t`, que existiam sem uso desde a v1.

- **O cilindro voltou, mas reproporcionado (2026-08-14).** Ele tinha saído na
  v1 por ser componente do admin. Num estudo lado a lado
  ([`../docs/comps/reservatorio-estudo.html`](../docs/comps/reservatorio-estudo.html))
  com as mesmas três leituras em três candidatos, o Pedro escolheu o cilindro:
  a elipse da superfície dá ao nível uma linha grossa e inclinada, e o anel
  âmbar ou vermelho é muito mais visível que o fio de 2px da coluna chata. O
  desenho não serve para cravar valor — o número faz isso — serve para dizer
  *muito / pouco / crítico*.
  ⚠️ **Nenhum limiar é desenhado dentro do tanque.** Faixa preenchida dá uma
  borda reta atravessando um corpo curvo (num cilindro, plano horizontal é
  elipse); e mesmo a elipse tracejada, que consertava a geometria, saiu porque
  o limiar já está dito **três vezes** na mesma tela. Régua que ninguém mede é
  ruído, e ruído na primeira tela derrubou a v1.

- **O que não se afirma vale mais que o que se afirma (2026-08-14).** Duas
  frases da comp foram amaciadas na implementação, pela regra de que nenhuma
  frase pode afirmar mais do que o dado sustenta: *"Nossa equipe já foi
  avisada"* virou *"é avisada automaticamente quando um sensor para de
  responder"* (o alerta existe; o chamado nem sempre), e a linha de atendimento
  passou a **citar o título do chamado** — sem isso, num prédio com sensor mudo
  e um chamado aberto sobre outra coisa, "Marcos está atendendo" seria lido
  como "alguém já está cuidando do sensor". Não está.

- **O trecho aproveitável da v1: a linha do tempo.** A ideia de que o painel é
  cronológico sobreviveu à rejeição e virou a metade de baixo da v2. O motivo
  de produto continua valendo: o síndico não tem só o problema de *"está tudo
  bem agora"*, ele tem o de **prestar contas na assembleia**, e o painel antigo
  jogava fora toda a temporalidade menos um gráfico.
  ⚠️ **Alerta resolvido não entra na linha**, porque `/cliente/status` só
  devolve os abertos. Ficou o buraco honesto em vez do evento fabricado; a
  saída (campo `alertas_recentes`) está no roadmap.
- **Direção visual da landing: "Chapa" (2026-08-11).** A primeira versão foi
  construída como um **demonstrativo de despesas de condomínio** (folha de
  papel, tabela de conta com a linha do caminhão-pipa grifada, carimbo
  "documento ilustrativo") e foi **rejeitada pelo Pedro**. A lição não é sobre
  acabamento: o conceito se sustentava descrito em texto e não sobrevivia como
  imagem — virava papelada, não peça de venda. A direção que ficou saiu do
  **próprio wordmark**, que já é chapa de aço cortada (chanfro a 45°,
  contraforma quadrada, a lasca amarela dentro do G); o chanfro virou a
  gramática de placa, botão, foto e campo. **Descartadas** no caminho: hero
  escuro de SaaS de IoT com dashboard flutuando (o padrão da categoria) e
  tubos nixie / têxtil op-art (bonitos, mas o primeiro briga com marinho+amarelo
  e o segundo é hostil para o leitor mais velho que o produto atende).
- **A landing fala em primeira pessoa do plural (2026-08-13).** O Pedro leu a
  página pronta e apontou que "muitas vezes parece um terceiro apresentando a
  empresa, e não a própria empresa se apresentando". Estava certo, e o texto
  era **inconsistente**: abria em terceira pessoa ("A General monitora…", "a
  equipe da General instala") e no meio virava primeira ("a gente sabe",
  "Atendemos", "Fale com a gente"). O problema não é estilo — contradiz o
  posicionamento: o argumento de venda é que quem fala **já é** o fornecedor
  de confiança do prédio, e a terceira pessoa põe um narrador no meio. Regra
  registrada em `PRODUCT.md` (Brand Commitments): "General" só onde a marca
  precisa ser identificada, nunca como sujeito da frase.
- **A linha do tempo da madrugada saiu (2026-08-13).** A seção `#noite` (cinco
  eventos com trilho preso ao scroll) era a mais alta da página e gastava tudo
  isso numa noite dramatizada; o Pedro pediu que o 24 h virasse **uma chamada
  só**. Entrou `.vigia`: **uma placa** dividida por cortes gravados com três
  falhas que a boia não reporta + a faixa de 24 h embaixo. ⚠️ **Não virou três
  cards** de propósito — três caixas iguais de título + parágrafo é o
  contêiner preguiçoso e era justamente o vício da primeira versão rejeitada;
  a anatomia é a do instrumento do hero (cabeçalho / corpo / estado separados
  por sulco), para ler como peça usinada única. O relógio do instrumento
  continua marcando madrugada porque é quando a falha passa despercebida — mas
  o roteiro não narra mais a noite.
- **A segunda seção explica o serviço, não a falha (2026-08-13).** Primeira
  tentativa depois de tirar a madrugada: h2 "A boia liga a bomba. / Ela não
  conta o que deu errado." e três falhas. O Pedro recusou por dois motivos, os
  dois corretos. (1) **Escrita indireta** — a construção monta um enigma antes
  de dizer qualquer coisa, e quem entra pela primeira vez precisa entender o
  serviço de cara, senão não chega ao fim da página. (2) **Redundância**: as
  três falhas (boia travada / bomba parada / consumo) eram sonda / sensor de
  corrente / central com outro nome, ou seja, a seção "Três peças no prédio"
  repetida. Ficou "A gente mede, avisa e atende." — o **ciclo do serviço**,
  com o painel do condomínio no fecho (era a única parte do serviço que só
  aparecia lá embaixo, nas dúvidas).
- **A landing tem dois leitores, e nenhuma frase pode servir só a um
  (2026-08-13).** "Não somos o aplicativo de uma empresa que você nunca viu"
  foi recusada pelo Pedro: *"pode ser alguém que acabou de conhecer a empresa
  sim, e tem que servir pra ela também"*. Todo o texto que pressupunha vínculo
  existente ("a mesma equipe que já troca a sua bomba", "o mesmo telefone que
  o seu prédio já usa", "somado à manutenção que já fazemos") virou
  **condicional**. O diferencial que funciona para os dois é o **tipo de
  empresa**: manutenção predial desde 2005, não software. Regra em
  `PRODUCT.md`.
- **Contrato de posicionamento da landing (2026-08-13).** Depois de quatro
  rodadas em que cada correção de frase expunha uma decisão de posicionamento
  nunca tomada, o Pedro parou o trabalho: *"acha melhor a gente conversar
  sobre qual visão vamos seguir em vez de ficar mudando toda hora?"* — estava
  certo, e a causa era eu chutar uma resposta nova a cada rodada em vez de
  fechar a pergunta. Decidido por ele, e **não deve ser reaberto frase a
  frase**:
  1. **O produto é o protagonista.** O que se vende é o monitoramento. Os 20
     anos de casa de máquinas são a **garantia** de que quem instala e atende
     sabe o que faz — respondem "quem cuida disso?", nunca abrem a página.
     ⚠️ Isto **inverte** o que o `PRODUCT.md` dizia ("a credibilidade vem da
     empresa, não do produto"): aquilo eu tinha derivado do fato de não haver
     cliente de telemetria, e não era a visão do Pedro. A ausência de prova
     continua restrição dura, mas limita o que se pode **afirmar** — não
     define quem é o protagonista.
  2. **Não nos posicionamos contra ninguém.** Nada de "não somos uma empresa
     de software" (recusada explicitamente), "não é um aplicativo que manda
     notificação e some", "não é um fornecedor novo pedindo confiança". O
     síndico provavelmente nem sabe que existe categoria concorrente.
     ⚠️ **Correção do Pedro, ainda em 13/08:** eu tinha aberto uma exceção
     para a boia ("explicar por que ela não basta é permitido") e ela estava
     errada. **O sistema não serve para substituir boia**, e a própria General
     instala e mantém boia — pôr a boia como vilã é falar mal do próprio
     serviço. O argumento certo não é deficiência dela, é ausência de quem
     olhe: a boia **age**, o monitoramento **mostra**. "Meu prédio já tem
     boia" continua sendo dúvida real e merece resposta, só não nesses termos.
     Lição: exceção que eu invento a um contrato do usuário é inferência
     minha, e precisa ser marcada como tal até ele confirmar.
  **Lição de processo:** quando uma recusa de copy se repete em lugares
  diferentes, o problema não é a frase — é que o contrato de posicionamento
  não existe. Fechar o contrato primeiro sai mais barato que remendar.
- **Animações compositor-friendly.** Transições da sidebar usam `will-change` +
  `contain: layout paint`, opacity/max-width em vez de display none/block, tudo
  unificado em 280ms `cubic-bezier(.4,0,.2,1)` (material standard easing) para
  evitar reflow cascateado e "estalos".
- **Camada HUD "Painel de comando" (só app mobile).** Para deixar o app "mais
  tecnológico" sem fugir do Mission Control, o `app/public/app.css` ganhou um
  bloco **aditivo** no fim (+ tokens `--hud-*` no `:root`): grid técnico +
  scanline de fundo (estáticos, custo de pintura ~zero), números/IDs em
  monospace, headers uppercase tracked, hairline âmbar e indicador de aba no
  bottom-nav. Mantido isolado e reversível de propósito (remover o bloco
  desfaz tudo). **Corner-brackets âmbar nos cards foram descartados** após review
  visual — poluíam (pareciam "cantos de quadradinho amarelo" repetidos em cada
  card, inclusive os menores/injetados). **Lição:** efeitos aplicados por classe
  compartilhada (`.card`, `.tec-card`) propagam pra muito mais lugar do que se
  imagina — preferir acento pontual a decorar todo container.
- **Não redefinir `position` em elementos `sticky` ao adicionar pseudos de HUD.**
  `.cli-nav`, `.app-header*` já são `position: sticky`; sobrescrever para
  `relative` (mesma especificidade, regra nova vinha depois) quebra o sticky e o
  menu/header "descem" com o scroll. Pseudo-elementos absolutos já se ancoram no
  `sticky` — não precisam de `relative`.

## Cache (a pegadinha nº 1 do projeto)

- **3 camadas de cache** que precisam ser sincronizadas ao mexer no admin:
  (1) browser HTTP cache via `?v=N` nos assets; (2) **Service Worker**
  network-first list + `CACHE_NAME`; (3) HTML cache via `Cache-Control:
  no-cache` (middleware `_htmlNoCache`). Detalhes operacionais em `../CLAUDE.md`.
- **JS/CSS servidos com `no-cache`** (revalida via ETag, 304 quando não mudou) —
  elimina a classe inteira de bug de asset stale.
- **`/admin/reset-cache`** propositalmente dentro de `/admin/*` (que o SW antigo
  trata como network-first) para nunca ser servido do cache quebrado.

## Telemetria e dados

- **Write threshold no pipeline de ingestão:** só grava leitura se Δnível ≥
  `TELEMETRIA_PCT_THRESHOLD` ou passou `TELEMETRIA_HEARTBEAT_MIN`. ESP32 envia a
  cada 10s, banco grava só o que importa.
- **Calibração e limiar da bomba ficam no banco, não no firmware.** Firmware só
  envia `adc_raw` + `bomba_rms`; conversão e decisão acontecem no backend
  (ajustável pelo painel sem regravar o ESP32).
- **CTE única** combina insert da leitura + update de last_seen + auto-resolve de
  alerta offline em um round-trip.
- **Sem tabelas agregadas** (Fases 9A/9B/9D descartadas). Agregação por bucket
  é feita on-the-fly nas queries de histórico; o write-threshold já controla
  volume. Retenção por job de limpeza (Fase 9C).
- **`timestamptz` em tudo** (timezone-aware).

## Jobs em background

- **`setTimeout` recursivo, não `setInterval`.** Cada job lê config dinâmica via
  `config.service.js` a cada tick — permite ajustar intervalo no admin sem
  deploy. Auto-iniciados pelo `app.js`, sem processo separado.
- Toda config dinâmica precisa estar na whitelist `CHAVES` de
  `config.service.js` (com tipo + min/max) para ser editável via
  `PATCH /admin/configuracoes`.

## WhatsApp + IA

- **Gateway: Meta WhatsApp Business API** — escolhido após abandonar Evolution
  API (complexa de hospedar no Railway) e Z-API (risco de ban). Número
  verificado, zero risco de ban, custo por conversa.
- **Webhook nunca bloqueia:** responde 200 imediato, processa em background
  (`setImmediate`). A Meta reenvia se demorar.
- **Idempotência por `message_id`** (constraint UNIQUE + `ON CONFLICT DO NOTHING`).
- **A IA interpreta/consulta/sugere; o backend executa.** Ações não-P1
  (`abrir_chamado`, `criar_solicitacao_orcamento`) ficam em `pendente_acao` e
  só executam após confirmação explícita do cliente. P1 (emergência) executa
  direto.
- **Contexto operacional pré-injetado** (telemetria/alertas/chamados) antes de
  cada chamada à OpenAI — a IA entra sabendo o estado real, gastando menos
  function calls.
- **State machine formal** (triagem → aguardando_confirmação → chamado_aberto /
  escalado / finalizado) + **anti-loop** (3 trocas sem avanço escala para
  humano).
- **Assumir conversa cala a IA:** com `assumida_por_id` setado, a IA não
  responde (mas as mensagens continuam sendo salvas).
- **gpt-4o-mini** por custo (~20x menor que GPT-4o), suficiente para
  classificação/atendimento. Mensagens triviais filtradas antes da API.
- **System prompt editável** via Configurações → IA (config dinâmica) — base
  para a estratégia de especialização (Fase 10).
- **Sessão WhatsApp com timeout** (8h configurável): job fecha conversa inativa
  e pede avaliação 1–4 pelo próprio WhatsApp, alimentando a curadoria.

## Mapas

- **Leaflet local** (sem CDN externo, ~150kb) + **tiles dark Carto via proxy
  próprio** (`/tiles/:z/:x/:y.png`) — resolve bloqueio por adblock/firewall
  corporativo (tudo vem do mesmo origin). Proxy tem cache em memória (4000 tiles,
  24h TTL) + dedupe de requisições inflight + rotação de subdomínios.
- **OSM fallback removido** (Carto é estável; OSM proíbe proxy em apps).
- **Geocoding híbrido:** ViaCEP (texto) + BrasilAPI + AwesomeAPI (coords) +
  Nominatim (fallback, fila de 1 req/s respeitando ToS). Reverse geocode ao
  arrastar o pino sobrescreve os campos.
- **Sem markercluster por enquanto** — adicionar quando o nº de condomínios
  justificar.
- **Classificação por zona de SP** usa mapa de ~80 bairros conhecidos (a divisão
  oficial não é simétrica; quadrante lat/lng puro falhava — ex: Capão Redondo).

## App mobile

- **Push via FCM, não notificação local** (Fase 7G, decidido em 2026-07-28).
  A alternativa barata seria `@capacitor/local-notifications` disparado pelo
  polling de 30s que já existe. Descartada: o Android congela os timers de
  JavaScript da WebView quando o app vai pro segundo plano, então ela funciona
  com o app aberto ou recém-minimizado e **falha exatamente no caso que motivou
  o pedido** — celular no bolso, tela apagada. Entregar "às vezes notifica" é
  pior que não notificar, porque o técnico passa a confiar e perde chamado.
- **7G não depende da 7J.** O roadmap marcava push como bloqueado pela
  publicação nas lojas; é falso — FCM funciona em APK instalado na mão. A
  dependência errada manteve a fase parada sem motivo.
- **Terceira via considerada e descartada:** fazer o `NativeGpsService` (o
  ForegroundService próprio, que já fica vivo das 8h às 18h) pesquisar chamados
  e postar notificação nativa, dispensando o Firebase. Descartada por só
  funcionar dentro da janela de expediente e com GPS ligado, custar bateria e
  significar mais código nativo próprio pra manter — enquanto o FCM é
  infraestrutura pronta e gratuita nesse volume.
- **`targetSdk` não é preferência, é prazo** — ver
  [`roadmap.md`](roadmap.md) (7J). A Play Store sobe o piso todo ano; ficar pra
  trás não degrada nada no app instalado, mas impede publicar atualização.
- **Lição (jul/2026): `startForeground()` não salva um bound service.** O
  `NativeGpsService` nasceu criado só por `bindService(BIND_AUTO_CREATE)`, e por
  isso morria com a tela apagada por mais correto que estivesse o resto
  (manifest com `foregroundServiceType`, todas as permissões, plugin registrado).
  Serviço que precisa sobreviver à Activity **tem que ser *started***
  (`startForegroundService()` + `onStartCommand` + `START_STICKY`); binding é só
  um canal de conversa, não um ciclo de vida. Corolário: com `START_STICKY` o
  sistema recria o serviço com **Intent nulo** — toda config precisa estar
  persistida, senão ele volta vivo e inútil.
- **Sintoma diagnóstico que economiza horas:** se a notificação persistente do
  ForegroundService **some** da barra, o problema é ciclo de vida do serviço, não
  GPS/permissão/rede. Se ela **fica** e o dado não chega, aí sim é rede ou POST.
- **Lição (31/07/2026): quando a coleta muda de camada, a regra tem que ir
  junto.** A janela de expediente do GPS (8h–18h) nasceu correta em 22/05: o
  `watchPosition` da WebView coletava, postava **e** era desligado pelo timer da
  própria WebView — uma camada só. Em 10/06 a coleta migrou pro
  `NativeGpsService` (Java) pra sobreviver à tela apagada, e **a janela ficou pra
  trás no JS**. O timer continuou existindo e continuou *parecendo* funcionar,
  mas agora só mandava um `stop()` pra um serviço que o Android mantém vivo
  enquanto congela a WebView. Resultado descoberto 7 semanas depois: pin de
  técnico no mapa às 19h.
  - **O que torna esse erro caro:** o commit que quebrou entregava exatamente o
    que prometia, e o teste natural ("o GPS continua funcionando com a tela
    apagada?") passa. O sintoma só aparece à noite, quando ninguém olha o mapa.
  - **Regra prática:** ao mover coleta/envio de camada, listar as regras que
    dependiam da camada antiga e mover cada uma explicitamente. Se a regra é de
    negócio (horário, limite, permissão), o destino certo é o **backend** — a
    única camada que o Android não congela, não mata e não recria sem contexto.
  - **Invariante espalhada em N camadas é dívida.** A janela do GPS mora hoje em
    três (backend, Java, JS) por necessidade; por isso o backend é declarado
    fonte da verdade e o mapa das três está em
    [`../docs/modulos/app-mobile.md`](../docs/modulos/app-mobile.md), num lugar
    só.
- **Config inválida cai no default, nunca em "sem restrição".** `inicio >= fim`
  na janela do GPS resolve pra 8–18, não pra "rastreia sempre": um valor errado
  no banco não pode desligar uma proteção em silêncio. Desligar continua
  possível, mas só pela forma explícita e documentada (`0`–`24`).
- **Fuso da operação é fixo (`America/Sao_Paulo`), não o do servidor nem o do
  aparelho.** O Railway roda em UTC — às 19h de SP um `getHours()` cru dá 22, e
  a janela inteira desliza 3 horas. No aparelho, relógio fora de hora deslocaria
  a janela por técnico.

## Segurança e RBAC

- **Envs obrigatórias em produção** com `process.exit(1)` se ausentes
  (`JWT_SECRET`, `CORS_ORIGINS`).
- **2FA por email obrigatório** no login (desabilitável em dev via `OTP_DISABLED`,
  lido com `.trim()` para tolerar comentário inline no .env).
- **device_key por reservatório** (não há chave global de devices).
- **Hierarquia de roles real:** admin / admin_viewer / tecnico / cliente. O
  `master_admin` foi removido (existia no código mas nunca foi atribuído).
- **Perfil escondido não é perfil restrito** (27/08/2026). O `operador` nasceu
  em 06/2026 como uma lista de `display:none` no `admin.js` e ficou quase três
  meses assim, com a nota *"é só de UI"* repetida em três documentos como se
  documentar a brecha a fechasse. Fechou de verdade quando 49 rotas trocaram
  `adminOnly` por `gestaoOnly` e o `operador` saiu de `equipeInterna`.

  Três coisas que a execução ensinou, e que valem para o próximo perfil:

  1. **Auditar por `grep adminOnly` mente.** `osDonoOuAdmin` e
     `GET /relatorio/pdf` checam a role *dentro do handler* e já barravam o
     operador — metade do trabalho estava pronta e invisível. O que enxerga é
     percorrer o `stack` dos routers e rodar cada guard com a role de mentira;
     é barato, não toca no banco, e devolve a lista verdadeira.
  2. **O corte de backend e a poda de UI são o mesmo commit.** Separados, um
     produz buraco e o outro produz tela que só sabe dar 403. A pegadinha não
     está no menu: está na **gaveta do dashboard**, que abre de uma seção que o
     perfil continua vendo e carrega três abas de rota fechada.
  3. **A restrição revela informação que ninguém tinha decidido mostrar.** A
     faixa financeira do dashboard (MRR da empresa) vinha de `/contratos` e
     estava à vista do operador desde sempre — apareceu como efeito colateral
     de fechar a rota, não como item da lista.
  4. **O risco que segurou a decisão nunca foi medido.** A pendência ficou
     aberta três meses com a justificativa *"restringir quebraria quem usa
     hoje"* — e **não havia nenhum `operador` em produção**, confirmado em
     27/08/2026. Uma consulta de dez segundos teria mostrado que o custo era
     zero. Antes de adiar por risco a usuário, conte os usuários.
- **O painel do operador é outra tese, não o admin podado** (27/08/2026). A
  pergunta que estava em aberto no roadmap — *"outra tese (como o do cliente) ou
  o admin podado?"* — foi decidida pelo que a tela precisa **ordenar**: quem
  está de turno trabalha pelo prazo que estoura primeiro, e a lista do admin
  ordena por data. Uma tela podada continuaria ordenando errado, que é o defeito
  que importa; o risco citado na hora (duplicar telemetria e mapa) não se
  concretizou porque **nenhum dos dois virou tela** — a coluna d'água é
  evidência dentro do item e o mapa só abre na decisão de despacho.

  1. **Dois arranjos recusados.** A *lista com abas e busca* (o painel com menos
     itens) e a *parede de instrumentos*: esta segunda morreu quando ficou claro
     que não havia o que desenhar para prédio sem sensor — e prédio sem sensor é
     metade da carteira. A saída foi dar a cada item a **prova que ele tem**:
     coluna d'água com telemetria, a fala de quem relatou sem ela.
  2. **O SLA é calculado no servidor.** A ordenação *é* o `resta_min`; se o
     relógio do navegador do operador estiver minutos fora, a fila inteira
     reordena e ninguém percebe. Por isso `GET /operador/fila` devolve o número
     pronto e o front só decide como escrevê-lo.
  3. **Folha própria, sem importar nada do admin.** As duas telas mostram os
     mesmos chamados e a tentação de compartilhar helper é real — foi assim que
     o painel do cliente virou refém do admin até 13/08/2026. `lerJson` e
     `escapar` estão duplicados de propósito.
  4. **O comp aprovado não é piso de qualidade** (27/08/2026, no passe de
     acabamento). Item de 318px, linha de 140 caracteres e etiqueta a 3,05:1
     estavam **no comp** — a implementação foi fiel, e por isso herdou tudo.
     Comp aprovado responde *"é esta a tese?"*; não responde *"está bem
     feito?"*. As duas perguntas precisam ser feitas em momentos diferentes, e
     a segunda quer número medido na tela, não olhada.
  5. **Acabamento se verifica contra as superfícies irmãs, não contra a
     própria tela** (27/08/2026, correção do Pedro). O passe conferiu
     composição, contraste, estados e teclado — e deixou passar que a barra
     **digitava "General" em Archivo** em vez de usar o PNG da marca, que é o
     que a landing, o login, o painel do cliente e o admin fazem. Nenhuma
     medição pega isso: é identidade, e identidade só aparece lado a lado. Um
     comp pode compor o nome em tipo; uma superfície do produto, não.
  6. **Classificação de registro não é licença para ignorar a referência**
     (27/08/2026, terceira correção do Pedro na mesma tela). O DESIGN.md diz
     que o registro de operação não tem gestos retóricos; usei isso para não
     trazer engrenagem, campo claro, fita e movimento de botão — que era
     exatamente o que o pedido mandava trazer. **O documento descreve o que
     existe; ele não decide contra uma instrução direta.** Quando os dois
     divergem, quem manda é quem pediu, e a divergência vira pergunta, não
     omissão silenciosa.
  7. **O estado de carga não pode parecer calmaria.** "Nenhum chamado aberto"
     antes da resposta chegar é afirmar calma que ninguém verificou; a tela diz
     *"Carregando a fila do turno…"*. Pela mesma razão o pulso da barra vira
     vermelho após 3 ciclos sem carga: falha e silêncio não podem se parecer.
- **`em_atendimento` só via app do técnico com GPS** (`/iniciar-atendimento`);
  `PATCH /chamados/:id` bloqueia esse status — garante que o status reflita
  presença física no campo.
- **Assinatura de contrato não usa ZapSign nem D4Sign** (nem vai usar —
  decisão explícita do dono do projeto: são pagos). O fluxo é próprio
  (migration 056 + reforço em 063): link por e-mail com token único +
  **código de 6 dígitos obrigatório antes de assinar** (2FA equivalente ao do
  login, fecha a brecha de "quem tem o link assina") + **protocolo** (hash
  SHA-256 de contrato+papel+nome+doc+ip+timestamp) impresso no PDF junto com
  IP e data/hora completa — evidência que sobrevive mesmo se o banco for
  alterado depois. Validade jurídica vem da MP 2.200-2/2001 art. 10 §2º
  (assinatura eletrônica simples, não ICP-Brasil). Avaliamos a API de
  assinatura do gov.br como alternativa gratuita: **hoje é só pra órgão
  público** (exige domínio `gov.br`/`jus.br`/etc. e aval de Gestor Público),
  não dá pra empresa privada integrar — só o site `assinador.iti.gov.br`
  aceita qualquer pessoa, mas é manual (sem API), não automatiza no fluxo.
  Um carimbo do tempo de autoridade certificadora (RFC 3161 acreditada
  ICP-Brasil) também é sempre pago — não existe opção gratuita pra isso.

## Operação / banco

- **DELETE explícito em scripts de limpeza, nunca `TRUNCATE ... CASCADE`** — no
  Postgres o CASCADE propaga para TODAS as tabelas com FK ignorando
  `ON DELETE SET NULL`, arrastando logins junto.
- **Migrations idempotentes** (`IF NOT EXISTS` / `IF EXISTS`), aplicadas com
  `node scripts/migrate.js NNN_nome.sql`. Rodar **imediatamente** ao mexer no
  schema, mesmo em dev (lição da Fase 7E: marcar fase como concluída antes de
  rodar a migration causou bug silencioso de tabela inexistente).
- **Puppeteer singleton** para PDFs — browser reutilizado entre requisições
  elimina o cold start de 10-20s no Railway; `waitUntil: domcontentloaded`
  (HTML gerado localmente, sem requests externos).
- **Upload de fotos de O.S. em base64** com `express.json({ limit: "8mb" })`;
  comprimidas client-side (~150-300KB, base64 infla ~33%).

## Decisões de schema (modelagem)

- **Sistema de orçamentos unificado (migration 030).** Coexistiam dois modelos
  paralelos: colunas `orcamento_*` em `ordens_servico` + `orcamento_itens`
  (sistema A) e as tabelas `orcamentos`/`orcamento_linhas` (sistema B). A 030
  unificou tudo em `orcamentos`/`orcamento_linhas` (em transação, com backfill),
  dropou as 12 colunas formais da O.S. e a tabela `orcamento_itens`.
  - **Mantidos na O.S.:** `orcamento_necessario` e `orcamento_observacoes` — são
    input do técnico no campo (a "semente" do orçamento formal).
  - As rotas `/admin/orcamentos/:os_id/*` mantêm `:os_id` na URL por compat com
    o frontend, mas resolvem `orcamento_id` via helper `_garantirOrcamentoDaOs`
    (cria o registro com número sequencial `OR-XXXXXX` se ainda não existir).
- **FK chamados↔O.S. é unidirecional (migration 034).** Existiam duas FKs
  (`chamados.ordem_servico_id` E `ordens_servico.chamado_id`) — toda escrita
  precisava sincronizar as duas pontas (risco de inconsistência). Ficou só
  `ordens_servico.chamado_id` com `UNIQUE` (preserva o 1:1). A idempotência do
  `iniciar-atendimento` passou a vir do `UNIQUE` do banco.
- **`responsavel_id` ≠ `tecnico_id` em `chamados`** (semântica distinta,
  intencional): `responsavel_id`→`usuarios` é o admin que acompanha;
  `tecnico_id`→`tecnicos` é quem executa em campo. Não unificar.
- **`origem` em `orcamentos` (migration 036):** `admin | ia | os`. A IA distingue
  **problema operacional** (vira chamado) de **solicitação comercial** (vira
  orçamento rascunho `origem='ia'`). A IA nunca cota preço — só encaminha.
- **Contrato ativo único:** índice parcial `UNIQUE (condominio_id) WHERE
  ativo=TRUE` em `contratos` — renovação cria um novo e marca o antigo
  `ativo=false`. Habilita cálculo de MRR.
- **`alerta_comentarios` sem FK** para o alerta: a coluna `alerta_id` cobre duas
  origens (`telemetria` | `chamado`), então o vínculo é lógico, não FK. Por isso
  o cleanup de alertas precisa apagar os comentários de telemetria junto (CTE).
- **`equipamentos.condominio_id` é nullable (migration 070).** A etiqueta nasce
  em branco e é colada na bomba **antes** de existir cadastro — a bomba chega na
  oficina primeiro. Exigir dono no INSERT obrigaria a cadastrar antes de
  etiquetar, que é justamente o passo que ninguém faria na prática.
- **`equipamento_movimentacoes.usuario_nome` é snapshot redundante.** Todas as
  FKs da tabela são `ON DELETE SET NULL`; histórico que perde o autor quando o
  usuário é apagado deixa de ser histórico. O nome é gravado junto no INSERT.
- **`equipamentos.status` denormalizado** a partir da última movimentação (mesma
  escolha de `reservatorios.last_seen`): a listagem da bancada é a tela mais
  consultada do módulo e não deveria precisar de `LATERAL` por linha. Em troca,
  status só muda por movimentação — nunca há mudança de estado sem rastro.

## Equipamentos e etiqueta QR (Fase 12A)

- **A etiqueta é do equipamento, não da ocorrência.** A mesma bomba volta várias
  vezes à oficina, e é o histórico das vezes anteriores que se perde hoje —
  etiqueta por passagem jogaria fora exatamente o ativo do módulo. Custo: exige
  o fluxo de etiqueta em branco (acima), porque a identidade precisa existir
  antes do cadastro.
- **Sem plugin de scanner no app.** A câmera nativa do Android já lê QR e abre a
  URL; um plugin (`@capacitor-mlkit/barcode-scanning`) mexeria no build Android,
  que está sob o prazo de 31/08 da Play Store (7J). Também faz a ficha funcionar
  para quem não tem o app instalado — pessoal da oficina, por exemplo. Scanner
  in-app fica como 12D, depois da publicação.
- **Código do QR aleatório, não sequencial.** A ficha revela endereço, contato e
  histórico do condomínio; `/e/1`, `/e/2` exporia o parque inteiro a quem tem um
  navegador. Base32 Crockford (sem I, L, O e U, que se confundem na digitação),
  8 caracteres ≈ 1,1 trilhão de combinações. A ficha exige login por cima disso.
- **Guard novo `equipeInterna` em vez de afrouxar `adminOnly`.** Quem escaneia na
  bancada é o técnico, que não passa em `adminOnly` — mas `cliente` não pode
  entrar de jeito nenhum. Allowlist explícita de 4 roles, não "authRequired sem
  guard". Pelo mesmo motivo nasceu `GET /equipamentos/condominios`: o técnico
  precisa apontar o prédio, mas `GET /condominios` (adminOnly) devolve endereço,
  contato e CNPJ — a rota nova devolve só id e nome.
- **A foto do equipamento fica atrás de autenticação.** A rota equivalente de
  `os_fotos` é pública, com um comentário assumindo a escolha ("compatibilidade
  com `<img src>`, que não manda header"). Aqui o id da foto é sequencial e o
  conteúdo é o interior da casa de máquinas de um cliente, então o front busca
  com `fetch` + object URL. O custo é um punhado de linhas em `equipamento.js`.
- **O gerador de etiquetas recusa host local.** Etiqueta é física e permanente:
  um QR apontando para `localhost` vira lixo colado numa bomba que ninguém vai
  reetiquetar. Falhar antes de o papel sair da impressora é barato; depois, não.
  `PUBLIC_BASE_URL` é a env que resolve; `&forcar=1` só para teste.
- **A ficha herda `admin.css`, não o sistema "Chapa".** É ferramenta de operação
  interna, como o app do técnico — a mesma razão pela qual a landing e o painel
  do cliente **não** herdam do admin. O critério é quem usa e para quê, não a
  plataforma.

## Painel admin — aproximar do Chapa (18/08/2026)

**O pedido do Pedro:** o sistema tem duas identidades visuais de propósito — a
da landing/painel do cliente ("Chapa") e a do admin ("Mission Control", âmbar
`#f0b014`). Isso foi decisão, não acaso. Mas o choque na transição
`/login` → `/admin/painel` ficou grande demais, e ele pediu para aproximar.

**O que a fronteira do [`DESIGN.md`](../DESIGN.md) diz hoje:** *"Nenhum token do
admin entra aqui, e nenhum daqui entra lá."* Se a direção abaixo for
implementada, essa frase muda: passam a ser **três registros do mesmo sistema**
— venda (landing), leitura (painel do cliente) e operação (admin). O painel do
cliente já provou que a troca de registro funciona sem trocar de identidade
quando saiu do `admin.css` em 13/08.

⚠️ **`DESIGN.md` não foi reescrito.** Pela disciplina da skill impeccable, ele é
escrito a partir do que foi construído, não das intenções — e no repo nada foi
construído ainda. Reescrever antes seria defender um documento contra a
realidade.

**O achado que orienta tudo:** o problema não é a cor, é o **nome**. `admin.css`
tem 22 prefixos de classe próprios, mas o vocabulário compartilhado já existe
batizado com o nome da tela que nasceu primeiro — `.wa-*` (WhatsApp) roda em 10
das 15 telas e `.ch-*` (Chamados) em 6. Consolidar é renomear o que já é comum,
não inventar componente novo. Evidências medidas em
[`../docs/modulos/painel-admin.md`](../docs/modulos/painel-admin.md).

**Regra de superfície, tirada da tela de login que já está em produção:**
marinho é moldura; placa clara é onde se lê e se edita (ficha, modal,
formulário). Isso corrige uma proposta anterior minha de deixar a superfície de
trabalho inteira clara — o Chapa já tem resposta pronta para região densa, e ela
está no ar desde o redesenho do login.

**As cinco decisões** (detalhe e ordem de execução no doc do módulo): faixa de
KPI em uma linha · ficha que só existe quando há ficha · um selo de estado ·
rótulo que declara a unidade · `planos` como molde da tabela.

**O que NÃO se aproxima, e por quê:** corpo de 17px e medida de linha em `ch`
(densidade é a função do admin, não descuido); rampa fluida em `clamp`, que é de
peça de venda; e os gestos retóricos da landing — revelação por corte,
engrenagens girando, inversão de campo amarelo.

**Ponto em aberto:** os gráficos ApexCharts separam séries com violeta, ciano e
rosa (~20 hex do Tailwind espalhados inline no `admin.js`). O Chapa tem três
cores de estado e nenhuma paleta categórica — isso precisa ser desenhado, não
removido. E o app do técnico (`app/public/app.css`) tem cópia própria dos
tokens com `--accent: #f0b014`: se o admin migrar e ele não, vira a quarta
identidade.

### Direções descartadas para o admin

Duas foram exploradas com a skill impeccable antes de chegar na atual. Ficam
registradas para não voltarem.

- **"O livro de ocorrências" ❌ (18/08).** O admin como impresso pautado —
  papel de livro-caixa, pauta vermelho-tijolo, abas de índice, carimbo no lugar
  de pill, linha em branco para leitura ausente. Chegou a ser construída e
  publicada. **Recusada pelo Pedro:** metafórica demais para uma ferramenta.
  A lição vale além dela: numa superfície de operação, a metáfora só se paga se
  cada peça dela fizer trabalho — e mesmo assim ela compete com o
  reconhecimento de quem usa o painel todo dia.
- **"O quadro de comando" ❌ (18/08).** Trilho DIN, etiqueta de baquelite,
  lâmpada-piloto, diagrama unifilar como herói do dashboard. Descartada antes
  de virar código: era o candidato nº 1 do meu próprio ranking, e a rolagem da
  skill (que existe justamente para recusar o ranking do modelo) apontou para
  outro. Mesmo problema de fundo da anterior.

O caminho que sobrou não é um mundo novo: é o **Chapa que já existe**, em
registro de operação. Mock de quatro telas construído em 18/08 sobre o dado
real do banco de teste, sem tocar em `public/admin.css`.

### Implementado em 20–21/08/2026 — o que a execução ensinou

As 15 telas migraram na branch `feature/admin-chapa`. O plano sobreviveu quase
inteiro; o que segue é o que **só apareceu ao construir**, e que vale mais que
a confirmação do que já estava previsto.

- **"Placa clara é onde se lê e se edita" era ambíguo demais para executar.**
  Formulário é quase tudo: aplicada ao pé da letra, a regra levaria o painel
  inteiro para o claro. A fronteira que funcionou é **"placa clara é o que ABRE
  POR CIMA"** — modal, drawer, lightbox. O que fica lado a lado com o conteúdo
  (coluna de ficha, card, tabela) é superfície de trabalho e continua marinho.
  Motivo de leitura: coluna clara permanente ao lado de tabela marinho parte a
  tela em dois campos que competem.

- **Converter superfície é remapeamento de TOKEN, não reescrita de regra.**
  Redeclarar `--text`, `--muted`, `--border` e a família de estado no contêiner
  vira a subárvore inteira. Foi o que permitiu converter 11 modais + drawer com
  um bloco de tokens cada, em vez de caçar centenas de seletores em 22
  prefixos. **É a técnica que tornou a migração viável no prazo.**

- **O remapeamento obrigou a inventar a distinção preenchimento × tinta.** Se
  `--risco` vira tinta escura na placa clara, todo selo PREENCHIDO com ele fica
  escuro sobre escuro. Daí os tokens crus (`--amarelo`, `--vermelho`,
  `--verde`), que não flipam em superfície nenhuma. Regra curta: **fundo de
  selo usa o cru; texto e borda usam o semântico.**

- **A paleta categórica de gráfico tem teto de TRÊS, e é medido.** Com
  vermelho, âmbar e verde reservados para estado, o lado quente do círculo está
  fora — e só no lado frio duas matizes quaisquer colapsam sob deuteranopia. A
  separação teve de vir da luminosidade. Uma quarta matiz dá ΔE 1,9 sob
  protanopia. Série nº 4 vira "Outros", facetas ou outro gráfico, **nunca uma
  cor nova**. E o slot 3 muda de MATIZ entre campo escuro e claro, não só de
  degrau: em h 350 sobre claro ele encostava no `--risco-t`.

- **Metade do trabalho não era pele.** Rótulo que mentia na Telemetria
  ("ALERTAS CRÍTICOS" contava todos os alertas ativos), `12750%` no uso do TTR,
  três KPIs de Chamados e a faixa inteira de Alertas repetindo as abas logo
  abaixo, colunas inteiras em "—" em Clientes. **Redesenho de painel de
  operação é auditoria de conteúdo com CSS junto** — quem orçar só o CSS
  orça metade.

- **Três armadilhas técnicas que custaram tempo** (detalhe em
  [`../docs/modulos/painel-admin.md`](../docs/modulos/painel-admin.md)):
  `clip-path` faz do elemento bloco de contenção para `position: fixed`;
  `:has()` ignora `display: none` e casa com placeholder escondido; crase
  dentro de template literal fecha o template.

**Resolvido em 21/08:** a colisão das cores de estado sobre placa clara. Os
valores antigos tinham "atenção" e "crítico" com luminosidade praticamente
idêntica (L .494 e .499) e ambas as matizes quentes — sob deuteranopia a matiz
colapsa e não sobrava nada (ΔE 1,2). A separação passou a vir da luminosidade
(L .34 · .42 · .52) e o par que muda decisão foi de **1,2 para 15,4**.

A lição que fica é sobre o método, não sobre os valores: **um par de cores de
estado pode parecer obviamente distinto e ser idêntico para parte dos leitores
— e a conta que revela isso é a luminosidade, não a matiz.** Vermelho e âmbar
"são cores diferentes" para quem enxerga as duas; sob daltonismo vermelho-verde
a única coisa que sobra é o quão escuro cada um é, e ali os dois eram iguais.

⚠️ Continua em aberto, e agora é decisão consciente: os pares
crítico↔em-ordem (5,9) e atenção↔em-ordem (6,9) seguem na faixa de piso. A
banda utilizável é estreita — os três precisam de ≥ 4,5:1 como texto sobre a
placa clara, o que trava L em ~.52 — e não cabe separar bem os três pares. A
prioridade foi explícita: confundir "crítico" com "atenção" muda uma decisão;
confundir qualquer um dos dois com "em ordem" não. **Isso só é aceitável
porque estado neste sistema nunca aparece sem rótulo escrito.** Se um dia um
estado for exibido só por cor, a conta precisa ser refeita antes.

**Fica em aberto:** o app do técnico (`app/public/app.css`) não migrou e é a
quarta identidade do produto.

### Rótulo de seção da nav virou filete (24/08/2026)

Os cinco rótulos em caixa alta da sidebar (`AGORA`, `EM CURSO`, …) saíram e
o `.nav-section-label` virou uma aresta de 1px. **O texto continua no
markup** — some da tela, não da árvore de acessibilidade nem do DOM, porque
`admin.js` depende dele para esconder grupo órfão no perfil operador.

O porquê tem duas partes, e a segunda é a lição:

- **O custo era desproporcional.** 136px de altura — três itens e meio de menu
  — para nomear grupos de 2 a 5 itens que o ícone e a proximidade já
  agrupavam. Com 15 itens na nav, era o que faltava para o menu caber.
- **Menu que rola é sintoma de IA, não de CSS.** A resposta anterior tinha sido
  apertar: duas faixas de `@media (max-height)` levaram o item de 38px a
  30px. Aperto adiado paga juros — os degraus foram calculados quando a nav
  tinha menos itens e ficaram silenciosamente errados quando Orçamentos e
  Atendimento entraram, abrindo um buraco em 780–860px onde a lista rolava
  **mesmo em tela grande**. Cortar o que não é clicável rende mais que
  encolher o que é.

**E o método mudou:** os degraus novos não são estimativa. Saem de medição em
Puppeteer da própria `public/admin.html`, varrendo 1040→620px de viewport
nos dois cenários de visibilidade. A estimativa que eu tinha feito à mão dizia
que a nav "cabia por 6px" em 1080p; a medição mostrou que faltavam **87px**.
Layout de tela cheia se mede, não se estima — o navegador tem detalhes
(`line-height` herdado, borda de container, padding do `.layout`) que não
sobrevivem a soma de cabeça.

**E medir tem duas armadilhas próprias**, as duas pegas só depois que o Pedro
perguntou se eu tinha aberto no Chrome de verdade:

- **Esperar a fonte.** Sem `await document.fonts.ready` o rodapé da sidebar
  mede 102px em vez de 119px — o bloco do usuário encolhe com a fonte de
  fallback. Piso de faixa calculado assim sai ~16px otimista, e foi o que me
  fez escrever "cabe até ~815px" quando o real era 886.
- **Varrer contínuo, não amostrar.** A primeira medição usou alturas fixas
  (936, 900, 860, 800…), deu **28 de 28 cenários verdes** e ainda assim havia
  uma janela de 5px — 882 a 886 — em que a lista rolava. Amostra esparsa não
  prova ausência de buraco entre `@media`; só a varredura de 1 em 1px. É por
  isso que o breakpoint ficou em 900 e não em 880.

### Filete revertido: rótulo de seção volta a ser texto (24/08/2026)

Mesmo dia da decisão acima, revertida depois que o Pedro viu o resultado ao
vivo: sem legenda, a folga que sobrava entre grupos (então distribuída por
`margin-top: auto` nas quatro arestas) não lia como respiro — lia como
"ícones espalhados sem por quê". O julgamento de design ("três itens e meio
de altura por texto que ninguém clica") estava certo sobre o custo, mas
errado sobre o que o rótulo comprava: não é decoração, é a moldura que faz
um vão parecer intencional.

`margin-top: auto` saiu junto — é o mecanismo que fazia a folga se esticar
igualmente nas quatro separações. Sem ele, a sobra (quando existe) fica onde
o flexbox já bota por padrão: um vão só, no fim da lista, antes do rodapé.

**A régua de medição do primeiro item continua valendo, só que reaplicada:**
recalibrado com o mesmo método (Puppeteer, pior caso de 15 itens, varredura
de 1 em 1px) para achar onde o texto CABE, não só onde o filete cabia. Coube
nas três faixas de cima — 901px…∞, 801–900 e 701–800, essa última cobrindo a
faixa mais comum de janela de navegador não maximizada. Só a faixa de
614–700px (notebook com barra de tarefas) manteve o filete: a medição achou
0,8px de folga no pior pixel, sem espaço para letra nenhuma. Ver
[`../docs/changelog.md`](../docs/changelog.md) pela tabela completa.

**Lição:** o piso de legibilidade documentado no DESIGN.md (`.55rem`/8,8px
para etiqueta gravada) não é sugestão — a primeira tentativa de rótulo
compacto usou 8px e ficou abaixo dele; o texto só voltou a caber depois de
subir para 8,8px e cortar padding/margin no lugar certo, não a fonte.

### Faixa de `@media` larga é aperto disfarçado (24/08/2026)

Terceira rodada do mesmo menu, e a que achou a causa real. Pedro mandou o
print: *"está mt compactado"*. A lista realmente parecia espremida — mas o
rótulo não era o culpado.

**Faixa larga cobra o preço do pior caso de todo mundo dentro dela.** A
faixa `max-height: 900px` cobria 801–900px, então seus valores tinham de
caber em 801px. Quem estivesse em 889px levava o mesmo aperto sem precisar:
medido no painel real, a lista ocupava 563px dentro de 702px — **139px de
vão morto** no pé, com tudo comprimido no topo. O sintoma ("compactado") e
a causa (granularidade da escada) ficam em lugares diferentes, e é por isso
que as duas primeiras rodadas mexeram no rótulo sem resolver.

**Três degraus viraram oito**, cada um conferido no piso da própria faixa.
O item agora varia de 40px (tela cheia) a 27px (notebook apertado) em passos
pequenos, em vez de três saltos grandes. Efeito colateral bom: a nav passou
a caber até 598px de viewport, contra 613px antes — escada fina não é só
mais confortável, é mais eficiente.

**E a regra de espaçamento que saiu daqui:** o respiro do rótulo é
`margin-top`, nunca padding simétrico. Ele pertence ao grupo que abre, então
a folga separa do grupo **anterior**; centrado no vão, ele não agrupa nada.
E o `gap` entre itens do mesmo grupo tem de ser sempre bem menor que essa
margem — duas distâncias parecidas competem e a lista volta a ler como um
bloco único, que é exatamente a queixa original.

### Aviso que morre no primeiro clique não é aviso (26/08/2026)

Relato do Pedro: *"o alerta de orçamento aprovado está fraco, digamos que
alguém clica lá para ver uma vez e fecha, ou a tela recarrega antes da pessoa
ver qual o orçamento é, a informação se perde"*.

**A v1 (25/08) usou "abriu a ficha" como prova de "resolveu".** O raciocínio
era defensável e está registrado no código: *"um aviso que exige duas ações
para sumir vira aviso que ninguém tira"*. O que ele não pesou é que as duas
ações não custam a mesma coisa — **tirar o aviso sem querer é irreversível, e
deixá-lo aceso a mais custa um segundo olhar.** Errar para o lado do aviso que
insiste é barato; errar para o lado do aviso que some é perder a informação.

**Ver e resolver viraram dois estados** (migration 078): `resposta_vista_em`
continua automático e passou a ser *informação* — é o que deixa a tela dizer
"aberto há 2h e ninguém deu baixa" —, e `resposta_tratada_em` é a baixa
explícita, a única coisa que apaga a pendência.

**E o antídoto para o risco original não foi voltar ao clique automático: foi
a pendência deixar de morar num lugar só.** Faixa no topo (o chamado), selo na
linha do orçamento (o endereço) e ponto no card do condomínio (o caminho). O
aviso da v1 era frágil não por exigir uma ação, mas por ser **o único lugar
onde a informação existia**: fechou, recarregou, acabou. Com três superfícies,
a faixa pode até ser ignorada — a pendência continua visível onde a pessoa
trabalha. Quando há uma só, a faixa agora **nomeia o documento**, que é o que
faltava para o "recarregou antes de ver qual era".

Tem "Reabrir" ao lado da baixa dada: baixa por engano é outra forma de perder
a informação, e a simetria custa uma linha.

## Prioridade dos chamados vem do contrato (03/09/2026)

- **A régua é a cláusula 7 da minuta**, não o gosto de quem abre o chamado. Ela
  define o enquadramento de cada prioridade e o prazo de comparecimento; os
  prazos já estavam certos em `sla_definicoes` desde a migration 028, mas o
  enquadramento — o texto que diz *quando* aplicar cada uma — não existia em
  lugar nenhum do sistema. Agora vive em `src/services/prioridade.service.js` e
  chega à tela por `GET /chamados/prioridades`.

- **A categoria SUGERE, não trava.** É a cláusula 7.1.c que autoriza: *"A
  prioridade poderá ser reclassificada tecnicamente após a triagem ou chegada ao
  local, com justificativa"*. No painel do admin a categoria move o seletor e
  escreve por quê; assim que a pessoa escolhe à mão, a sugestão para de mexer —
  quem atende o telefone sabe coisas que a categoria não carrega (se há
  redundância, se o poço está alagando). No painel do **cliente** ela decide
  sozinha, e isso é anterior: cliente marca tudo como emergência.

- **`manutencao` fica em P4** — decisão expressa do Pedro em 03/09/2026, quando
  perguntado. A cláusula 7 daria margem para P3 ("ajuste ou corretiva não
  crítica"), e a régua nasceu em P4 por herança do mapa do painel do cliente.
  **Subir encurtaria de "agendamento" para 72 horas de comparecimento em todo
  chamado de manutenção** — é obrigação contratual, não preferência de tela, e
  por isso não se muda de lado.

- **O prazo NUNCA se escreve na tela.** Os botões P1–P4 traziam "≤ 3h",
  "24-48h" e "≤ 72h" no HTML: além de o "24-48h" prometer uma janela que o
  contrato não dá (ele diz "até 48 horas"), editar o SLA em Configurações não
  mudava o que a tela dizia. Uma fonte só, `sla_definicoes`.

- ⏳ **O SLA é GLOBAL, não por contrato.** Os prazos valem para os 86 prédios.
  Se as minutas antigas divergirem da nova, o sistema promete a régua do Saint
  Antoine para todo mundo. Pendente de decisão — ver
  [`active-work.md`](active-work.md).

## Cancelar um chamado não é fechar (04/09/2026)

- **O problema não era falta de botão, era a métrica.** `fechado` grava
  `fechado_em` e `tempo_resolucao_seg`, marca `primeira_resposta_em` (TTFR) e
  entra na taxa de resolução e no tempo médio do painel — ele **afirma que o
  serviço foi prestado**. Como era a única saída da fila, todo chamado aberto
  por engano, duplicado ou desistido pelo cliente virava atendimento cumprido
  nas quatro contas. Um status novo é o único conserto: filtrar "engano" depois
  do fato é impossível, o dado não existe.

- **`cancelado_em` é coluna própria, não reuso de `fechado_em`.** Foi
  considerado economizar a coluna e distinguir pelo `status`. Recusado:
  `fechado_em` sai cru no CSV de `GET /relatorios/chamados` e é lido pelos KPIs
  como "quando o serviço terminou". Escrever cancelamento nele faria a métrica
  mentir exatamente onde a mudança existe para parar de mentir.

- **Cancelar NÃO marca TTFR**, mesmo saindo de `aberto`. A regra geral do
  `PATCH` é "qualquer transição saindo de `aberto` conta como primeira
  resposta" — cancelar é a exceção, porque cancelar não é responder. Marcar
  aqui faria o chamado que ninguém atendeu sair do relatório como atendido
  dentro do prazo.

- **Cancelar é `GESTAO_ROLES`; fechar continua `adminOnly`.** O `adminOnly`
  também deixa o **operador** passar. Fechar chamado é o dia dele; apagar da
  métrica um chamado que existiu é decisão de negócio. O botão fica escondido
  no painel para o operador — botão que só sabe dar 403 é pior que botão
  nenhum. Se na prática quem atende o telefone precisar cancelar, é trocar um
  `if` — mas a troca é decisão do Pedro, não do código.

- **O motivo é obrigatório na rota, não no banco.** Chamado que some sem o
  porquê recria a ambiguidade que o `fechado` tinha — "por que este chamado
  sumiu?" é a pergunta que chega três semanas depois. `NOT NULL` ficou de fora
  só porque a coluna nasce vazia nas linhas existentes. É por causa do motivo
  que cancelar tem **modal** e não é um clique como fechar.

- **Chamado fechado não se cancela (409).** Fechado tem O.S., possivelmente
  assinatura e avaliação do cliente penduradas; cancelar apagaria da métrica um
  atendimento que aconteceu de verdade. Quem fechou por engano reabre e então
  cancela — duas decisões, duas linhas no `historico_chamados`.

- **Reabrir não limpa `cancelado_em`/`cancelado_motivo`**, pela mesma regra já
  valendo para o `fechado_em`: ficam como memória do último cancelamento.

- ⚠️ **A lição que sobrou: "em aberto" é o contrário de DUAS coisas.** O código
  tinha oito `status != 'fechado'` no backend e doze `!== "fechado"` no
  `admin.js`. Cada um deles passaria a contar chamado cancelado como fila viva
  — inclusive o dedup de `abrirChamadoAuto`, que deixaria de reabrir o chamado
  automático de nível baixo depois que alguém cancelasse o anterior. **Um
  status novo num sistema com predicados espalhados custa mais na varredura do
  que na migration.** Hoje o backend escreve `NOT IN ('fechado','cancelado')` e
  cada front tem um helper único.

- ⚠️ **E o efeito colateral que quase passou:** `execucao()` no
  `operador-orcamentos.js` lia qualquer chamado não-aberto como "feito" — o
  orçamento sumia da fila de Aprovados **porque** o serviço deixou de ser feito.
  O comentário do próprio arquivo, escrito em 03/09, dizia "não existe
  'cancelado'" e virou o mapa do conserto.

## Decisões descartadas (e por quê)

Registradas para não serem "redescobertas" e refeitas. Se o escopo mudar, o
desenho em camadas original continua válido.

- **Tabelas agregadas de leituras — `leituras_agregadas_hora`/`_dia` (Fases 9A,
  9B) ❌.** O produto **não precisa** de histórico > 60 dias (confirmado com o
  usuário). Com a política de retenção (9C) a tabela `leituras` estabiliza em
  ~600 MB; gráficos > 7 dias são servidos com buckets diários
  (`DATE_TRUNC('day', ...)`) direto da raw. Sem tabelas agregadas, sem
  roteamento de query por granularidade (**9D** também descartada).
- **WebSocket no WhatsApp ❌/⏸️.** Polling de 5s na conversa selecionada atende
  o volume atual. Reavaliar só se o volume crescer muito.
- **`leaflet.markercluster` ⏸️.** Adiado até o nº de condomínios justificar
  clusterização dos pinos.
- **Evolution API / Z-API ❌ → Meta Business API.** Evolution era complexa de
  hospedar no Railway; Z-API tinha risco de ban. A Meta (número oficial
  verificado) elimina o risco de ban ao custo de tarifa por conversa.
- **Fallback OSM no proxy de tiles ❌.** Carto é estável e o OSM oficialmente
  proíbe proxy em apps — manter só o Carto.
- **Tabelas `*_arquivados` para histórico ❌.** Cleanup só deleta; quem precisa
  de histórico longo usa Relatórios. O WhatsApp do cliente mantém o histórico
  dele independentemente — nosso DELETE só apaga a cópia local.

## Lições aprendidas (cicatrizes)

- **`novalidate` transfere a validação inteira para o JS, e `if (!campo)` não é
  validar (2026-08-25).** O Pedro leu na tela de orçamentos *"Enviamos um
  código de 6 dígitos para comer"* e perguntou o que era aquilo. A palavra veio
  de quem digitou; o defeito era nosso. O `<form>` tinha `novalidate` — que
  desliga a checagem do navegador e faz do `type="email"` só o teclado do
  celular — e do lado do JS a única guarda era "está vazio?". Como o
  `/auth/codigo` responde neutro de propósito (dizer "não existe" viraria um
  verificador de quem é cliente), nada mais barrava, e a tela anunciava a
  palavra com confiança. **A frase absurda era o sintoma; o defeito era a
  entrada não validada, e ele existia desde que o cartão nasceu.** Ao escrever
  `novalidate`, escrever a validação junto, no mesmo commit. E a mensagem de
  erro fala do que a PESSOA escreveu, nunca da conta dela — senão o conserto
  desfaz a neutralidade.

- **Nunca varrer um arquivo até "a próxima linha que é só `}`" para apagar uma
  função (2026-08-13).** Escrevi um script de limpeza de órfãos no `cliente.js`
  que procurava o fechamento de cada função assim; ele não encontrou o
  terminador que esperava, varreu até o fim do arquivo e **truncou 1.879 linhas
  para 41**. Salvou o dia o arquivo estar versionado e as edições estarem todas
  registradas na conversa — deu para restaurar do git e reaplicar a sequência.
  A regra que fica: **remoção em lote por script se faz com um parser ou não se
  faz.** Para apagar um punhado de funções, `Edit` com o texto exato de cada
  uma é mais lento e não tem esse modo de falha. E antes de qualquer script que
  reescreva um arquivo grande, commitar ou copiar.
- **CSS compartilhado carrega arquitetura junto, não só aparência.** O painel do
  cliente herdou do `admin.css` a paleta, mas também a navegação (duas seções
  para o mesmo dado), a densidade e o vocabulário. Quando duas telas atendem
  públicos diferentes, compartilhar a folha de estilo é uma decisão de produto
  disfarçada de decisão técnica.
- **Marcar fase como "concluída" antes de rodar a migration em produção** gera
  bug silencioso (código referencia tabela que não existe). Rodar
  `scripts/migrate.js` **imediatamente** ao mexer no schema, mesmo em dev.
- **`TRUNCATE ... CASCADE`** propaga ignorando `ON DELETE SET NULL` e arrasta
  logins — usar DELETE explícito (ver `limpar-dados-teste.sql`).
- **Cleanups em lote** com hard floor + `dry_run` + cap de lotes: um erro de
  digitação na retenção poderia apagar tudo; o piso protege.
- **Payload que devolve só o valor RESOLVIDO apaga o valor CRU (2026-08-24).**
  A lista `GET /admin/orcamentos/avulsos` devolvia `valor_total`
  (`COALESCE(o.valor, soma dos itens, 0)`) e **não** a coluna `orcamentos.valor`.
  Como o modal do admin decide "modo manual ligado" por `o.valor != null`, todo
  orçamento aberto a partir da lista nascia com o campo do total manual vazio —
  e o "Salvar" seguinte mandava `valor: null`, **apagando** o total manual no
  banco. O PDF continuava certo até alguém salvar, o que fez o defeito parecer
  de exibição ("no PDF vai o valor, no sistema fica R$ 0,00") por meses. Três
  orçamentos aprovados foram a zero assim (OR-000170, OR-000169, OR-000105) e
  os valores não são recuperáveis — não há tabela de auditoria com o antigo.
  A regra que fica: **quando a tela EDITA um campo, o payload tem de trazer a
  coluna crua, não só o número já resolvido.** O agregado serve para exibir; o
  cru é o que volta no `PATCH`. E, no front, campo que não foi lido do servidor
  não deve ser enviado de volta — `_avAcao` só manda `valor` quando a chave
  existe no registro, para que a próxima quebra de payload vire "não atualizou"
  em vez de perda silenciosa.
- **SDK que devolve erro em vez de lançar transforma `await` em mentira
  (2026-08-21).** O `resend` retorna `{ data, error }`: numa falha de API a
  Promise **resolve**. Seis chamadas em `email.js` faziam `await send({...})`
  sem olhar o retorno, e o sistema marcava orçamento como "enviado" sem ter
  enviado — por meses, e sem deixar rastro em log. A regra que fica: **ao usar
  SDK novo, conferir se o erro vem por exceção ou por valor de retorno antes
  de escrever o primeiro `await`.** `await` só é garantia de conclusão, nunca
  de sucesso. E todo envio externo passa por um helper único, que é onde essa
  checagem mora.
- **`OTP_DISABLED` precisa de `.trim()`** — comentário inline no `.env`
  (`OTP_DISABLED=true   # ...`) quebrava a flag.
- **`Unexpected token '<', "<!DOCTYPE "` no front = o Express respondeu HTML.**
  Erros que não chegam às rotas (413/400 do body-parser, 404, 502 do proxy)
  caíam no handler padrão do Express, que responde uma página HTML — o
  `.json()` do front estourava e escondia o erro real. Custou tempo no envio de
  orçamento por e-mail: a assinatura de 7,6 MB virava POST de 10,1 MB e batia
  no limite de 8 mb do `express.json`. Hoje `src/app.js` tem handlers finais de
  404/erro em JSON. **Ao debugar "não é JSON válido", olhe o status HTTP e o
  `content-type` antes de suspeitar do front.**
- **Imagem grande: reduzir no cliente > aumentar o limite do servidor.**
  Subir o limite do `express.json` resolveria só o upload — o e-mail embute a
  assinatura como data URI e o Gmail apara mensagens acima de ~100 KB. Por
  isso `_avPrepararAssinatura` (canvas, 600 px, PNG com fallback JPEG)
  redimensiona antes de enviar: 7,6 MB → 89 KB, e o blob no banco também
  fica pequeno.
- **API de terceiro pode trocar de provider por baixo e continuar
  respondendo 200 (2026-08-25).** O `/api/cep/v2` da BrasilAPI passou a ser
  atendido pelo `open-cep`, que devolve o **centroide do município** no campo
  `location.coordinates`. Resposta válida, schema idêntico, número plausível —
  e todo condomínio de São Paulo caindo na Sé. A regra que fica: **coordenada
  vinda de fora precisa de um sinal de granularidade antes de virar pino.**
  Aqui o sinal é o campo `service` da própria resposta, checado em
  `_coordsDeCep`; a fonte preferida virou a AwesomeAPI, que geocodifica em
  nível de rua. Também vale o oposto do instinto: quando algo "que funcionava
  perfeitamente" quebra sem deploy, o suspeito é o serviço externo, não o
  código — dá para confirmar em um `curl` comparando dois CEPs de bairros
  distantes e vendo se a coordenada repete.
- **Anexo e link no mesmo e-mail são dois caminhos, e o cliente escolhe o que
  não responde (2026-08-25).** O e-mail de orçamento saía com o PDF anexado e
  com o botão do painel. O anexo abre em um clique; o botão pede login. O
  síndico lê o PDF, fecha o e-mail, e a resposta — que é o ponto do painel —
  nunca chega. Passou a ser um OU outro: com painel, só o link; sem painel
  (pessoa física, condomínio sem usuário), só o anexo. A regra que fica:
  **quando uma tela existe para receber uma ação, o e-mail não deve oferecer um
  atalho que a contorna.**
- **`height:auto` não existe no Outlook (2026-08-25).** O motor do Word combina
  a largura declarada com a altura **nativa** do arquivo e entrega a imagem
  esticada — foi assim que o logo do e-mail chegou achatado no primeiro envio
  real. Imagem em e-mail leva `width` e `height` explícitos, no atributo e no
  estilo. E a altura é **calculada do arquivo** (IHDR do PNG), não digitada:
  número fixo no código volta a mentir na primeira troca de logo.
- **Link de e-mail não deve trocar de página para pedir login (2026-08-25).**
  A tela de orçamentos mandava quem chegasse sem sessão para `/login?next=…`.
  O `next` funcionava, mas o custo estava antes dele: a pessoa clicou num link
  sobre **um documento** e a primeira coisa que viu foi um formulário em outro
  lugar — e qualquer falha no meio (allowlist, `next` perdido, senha errada)
  a deixava no painel sem o orçamento. O login virou cartão sobre a própria
  página, com a URL intacta. A regra que fica: **quando o destino é um
  documento específico, a autenticação entra por cima dele, nunca no lugar
  dele.** Vale para 401 no meio do caminho também — reabrir o cartão preserva
  o que a pessoa estava fazendo; redirecionar joga fora.
- **A senha do síndico não protegia nada, e custava caro (2026-08-25).** Em
  produção o OTP por e-mail já era exigido em **todo** login — o atalho
  `OTP_DISABLED` só vale fora de produção. Ou seja, quem controla o e-mail do
  síndico sempre entrou, com ou sem senha; ela só somava um segredo para o
  escritório criar, mandar por e-mail e o cliente esquecer, num sistema que
  **não tem recuperação de senha**. O cliente passou a entrar só com e-mail +
  código. A regra que fica: **antes de melhorar como um segredo é distribuído,
  conferir se ele ainda está protegendo alguma coisa** — aqui a resposta era
  não, e a melhoria virou remoção. Usuário interno manteve senha porque entra
  todo dia e ali o código a cada login seria pedágio, não proteção.
- **A tela de login não deve perguntar quem você é (2026-08-25).** O incômodo
  veio do Pedro: os dois públicos entram pela mesma `telemetria.generalbombas`,
  e por isso o login tinha um botão perguntando se a pessoa era de condomínio
  ou não. O que aquele botão pedia era que ela se classificasse **dentro da
  nossa modelagem de dados** antes de digitar qualquer coisa — e quem chega ali
  pelo link do orçamento sabe o próprio e-mail, não sabe se é "condomínio" ou
  "equipe". O `role` já decidia o caminho no servidor. Virou identifier-first:
  `POST /auth/metodo` recebe o e-mail e responde qual campo mostrar. A regra
  que fica: **quando a tela faz uma pergunta que o servidor consegue responder
  sozinho, ela está pedindo que o usuário adivinhe a implementação.**
- **Descartado: separar os painéis em domínios diferentes (2026-08-25).** Era a
  outra saída para o mesmo incômodo. Custa DNS, certificado, sessão que não
  atravessa domínio, service worker duplicado e o dobro do `?v=N` — e não
  resolve o problema: quem salvou o link errado, ou clicou num e-mail antigo,
  continua caindo no lugar errado, agora sem nem um botão para corrigir.
  Separar **move** a escolha para a URL em vez de eliminá-la. Volta a fazer
  sentido só se o painel do cliente virar produto com marca própria, ou por
  exigência de isolamento — nenhum dos dois é o caso.

- **A carta é só a carta (2026-08-27).** Os dois modos de envio do orçamento
  nasceram em 25/08, mas por dois dias o `modo` escolheu só as **entradas** —
  destinatário, texto, anexo, link — e o HTML continuou sendo **um**, o
  estruturado. A carta escrita pelo operador saía com a faixa "Orçamento
  comercial", a caixa "Informações do orçamento" e o "Atenciosamente / General
  Bombas" da casa em volta dela.
  Isso não era só feio: a caixa repetia número, cliente e validade que a carta
  já tinha dito e que o PDF anexo traz inteiros, e a assinatura pessoal do
  operador entrava **ensanduichada** no fecho da empresa — como se ele
  assinasse embaixo de um nome que não é o dele.
  A escolha: **quem manda carta escolheu falar com a própria voz**, e o
  documento inteiro vai anexo. Moldura de sistema ali não acrescenta contexto,
  disputa com o texto. O modo `painel` continua estruturado, porque lá o corpo
  é fixo e a caixa é justamente o que dá contexto antes do botão.
  A regra que fica: **separar o conteúdo sem separar a forma não separa nada.**
  Quando dois caminhos existem porque servem a públicos diferentes, o template
  faz parte do caminho — e um comentário afirmando a divisão não a implementa.
  Havia três comentários no código dizendo "isto só existe no modo carta"
  enquanto o HTML tratava todo mundo igual.
