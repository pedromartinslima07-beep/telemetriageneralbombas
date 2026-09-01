---
tags:
  - doc/modulos
  - fluxo
aliases:
  - App Mobile
  - Capacitor
  - GPS Background
---
# App Mobile (Capacitor)

App nativo Android gerado com Capacitor a partir do PWA em `app/public/`.
Código-fonte web compartilhado — o mesmo `app.js` / `app.css` roda tanto no
browser quanto empacotado no APK.

## Estrutura

| Caminho | Papel |
|---|---|
| `app/public/` | Código web (HTML/CSS/JS) servido dentro da WebView |
| `app/capacitor.config.json` | Configuração do Capacitor (appId, webDir, scheme) |
| `app/package.json` | Dependências nativas (`@capacitor/core`, `@capacitor/android`) |
| `app/android/` | Projeto Android Studio gerado pelo `cap sync` |
| `app/android/app/src/main/java/com/generalbombas/app/` | Código nativo **próprio** (`NativeGpsPlugin`, `NativeGpsService`) |

## Requisitos de build (Capacitor 8 — desde 2026-07-28)

| Item | Versão | Onde |
|---|---|---|
| Capacitor (core/android/cli) | 8.4.2 | `app/package.json` |
| `minSdk` | 24 | `app/android/variables.gradle` |
| `compileSdk` / `targetSdk` | 36 | `app/android/variables.gradle` |
| Android Gradle Plugin | 8.13.0 | `app/android/build.gradle` |
| Gradle wrapper | 8.14.3 | `app/android/gradle/wrapper/` |
| Java | 21 (JBR do Android Studio) | `app/android/app/capacitor.build.gradle` (gerado pelo `cap sync`) |

`targetSdk 36` não é preferência: é o piso da Play Store para apps novos e
atualizações a partir de **31/08/2026**. Ver
[`../../memory-bank/roadmap.md`](../../memory-bank/roadmap.md) (Fase 7J) para o
que ainda falta até publicar.

Dois arquivos **não versionados** precisam existir na máquina de quem compila:
`app/android/local.properties` (com `sdk.dir` apontando pro Android SDK) e a
configuração de JDK do Android Studio — se o Gradle JVM apontar para uma entrada
inexistente no `jdk.table.xml`, o Studio falha com *"Invalid Gradle JDK
configuration"* antes mesmo de sincronizar.

⚠️ **Clone novo não compila de primeira, e o erro não diz o que falta**
(01/09/2026). São dois passos, nesta ordem: `npm install` dentro de `app/` (o
`node_modules/` é ignorado) e criar o `local.properties`. Sem o segundo o Gradle
morre em `SDK location not found ... ANDROID_HOME`, e nesta máquina
`ANDROID_HOME` e `ANDROID_SDK_ROOT` estão **vazias** — o caminho só existe no
arquivo. Depois disso, `npm run build:apk` (que já faz o `cap sync android`).

⚠️ **No `local.properties`, use barra normal.** É formato `.properties` do
Java, onde a barra invertida é escape: `C:\Users\ZsusX` tem `\U` e `\A`, que não
são escapes válidos, e o Java engole as barras — o valor vira
`C:UsersZsusX...` e o Gradle reclama do SDK como se o arquivo não existisse.
`sdk.dir=C:/Users/<voce>/AppData/Local/Android/Sdk` funciona.

## As telas de entrada: splash, login e código (01/09/2026)

O app abre no mundo **"Chapa"** — o mesmo da landing, do `/login` e dos
painéis —, e só troca para o Mission Control âmbar depois que o técnico entra.
Antes de 01/09 as três telas eram um cartão escuro centrado com âmbar
`#f0b014`, filete HUD animado e anel de varredura no splash; o comentário no
`index.html` dizia "visual idêntico ao site" e estava desatualizado desde
**25/08**, quando o `/login` foi redesenhado.

| Peça | Onde |
|---|---|
| Estilo das três telas | `app/public/login.css` (**arquivo próprio**, carregado depois do `app.css`) |
| Markup | `app/public/index.html`, seções `data-screen="splash" / "login" / "otp"` |
| Lógica (inalterada) | `app/public/app.js` — `formLogin`, `formOtp`, `showAlert`, `setBtnLoading` |
| Assets embarcados | `app/public/fonts/` (Archivo × 2, Martian Mono) e `app/public/fotos/reservatorios.jpg` |

⚠️ **O MECANISMO NÃO É O DO PWA, e isso é decisão do Pedro (01/09).** O app
pede **e-mail e senha juntos** no `POST /auth/login`. O `/login` do navegador
pergunta só o e-mail e deixa o `/auth/metodo` decidir entre senha (equipe) e
código (síndico). **O app não chama `/auth/codigo` em lugar nenhum** — logo,
quem não tem senha não entra por ele. Hoje não atinge ninguém (produção não tem
usuário `cliente`), mas o `abrirTelaCliente()` já existe no app esperando gente
que não consegue chegar nele. Fechar isso é portar o fluxo, não o visual.

⚠️ **Tudo escopado em `.screen-auth`.** Os tokens do Chapa **não** entram no
`:root`: se entrarem, o marinho vaza para as telas do técnico logo depois do
login. O `@font-face` é global porque só define famílias — nada as usa fora
daqui.

⚠️ **Sem `color-mix()` e sem `clamp()` de fonte neste arquivo.** Ele roda no
WebView do aparelho, não num Chrome atual: `color-mix` só existe do Chrome 111
em diante, e num WebView velho a declaração **inteira** cai — o anel do botão
secundário sumiria sem nenhum outro sintoma. Os valores são literais e medidos.

⚠️ **Caminhos relativos, sempre.** No APK a origem é o esquema do Capacitor
(`https://localhost`), não o servidor. Um `/static/...` copiado do PWA daria
**404 mudo**: fonte que não troca e foto que não aparece, sem erro na tela. É a
mesma armadilha para qualquer asset novo que este CSS venha a puxar.

⚠️ **`showAlert()` faz `el.className = "alert " + tipo`** — ele apaga a lista
de classes. A caixa de erro precisa pegar por `.alert` sozinho; qualquer classe
extra permanente nela sumiria no primeiro erro exibido.

⚠️ **O varrimento do botão responde a `:active`, não só a `:hover`.** O amarelo
entrando pelo chanfro é o único momento de movimento da tela, e `:hover` não
existe em toque — sem o `:active` ele nunca dispararia justamente no aparelho
onde o app roda.

⚠️ **O layout é empilhado e não tem o grid de duas colunas do PWA.** A
superfície é sempre um celular; carregar o layout de 861px seria fidelidade ao
arquivo, não à tela. A faixa da marca cede altura primeiro em
`@media (max-height: 680px)` — aparelho curto ou teclado aberto.

⚠️ **A frase da faixa da marca não foi portada.** No PWA ela diz "O nível dos
**seus** reservatórios…", escrita para o síndico. Quem abre este app é o
técnico: os reservatórios não são dele. Escrever uma para ele é copy nova, que
é decisão do Pedro — até lá a faixa só identifica, que é o que o próprio
`public/login.css` diz que ela faz no celular.

⚠️ **O enquadramento da foto tem regra.** No alto de `reservatorios.jpg` está a
marca do fabricante do tanque, com **dois telefones legíveis**. Quem os elimina
é o corte vertical (`background-position: center, 28% 60%` sobre `112% auto`).
Ao mexer nesses números, conferir que os telefones continuam fora e que a
parede com o extintor não voltou pela direita.

**Contraste divergente do PWA, de propósito:** o placeholder do `/login` é
`color-mix(--tinta-2 62%, transparent)` sobre branco, que dá **3,11:1** e
reprova o piso de 4,5:1. Aqui ele é `#6b7693` (78%), **4,53:1**, ainda bem
distante do valor digitado (8,1:1). O PWA segue com o defeito.

**O que o APK custou:** 5,8 → **6,17 MB** — as duas fontes (174 KB) e a foto
(215 KB). O `login-logo.png` já estava lá. **Só chega no técnico com APK novo**;
o app não registra service worker, então não há `sw.js` nem `?v=N` a bumpar.


## GPS — rastreamento de localização

### Implementação atual

Usa `navigator.geolocation.watchPosition()` (API do browser), com:

- Envio a cada 60 s via `POST /tecnicos/localizacao` (configurável 30–300 s)
- Janela de operação 08:00–18:00 (preserva bateria e privacidade)
- Fallback `setInterval` para garantir o ping mesmo se o `watchPosition` atrasar
- Descarte de posições com precisão > 15 km (IP-based)

Código em `app/public/app.js` a partir do comentário `GPS TRACKING (Fase 7F)`,
funções principais: `gpsStart()`, `_gpsAbrirWatch()`, `_gpsFecharWatch()`,
`gpsEnviar()`.

### ⚠️ A janela de expediente vive em três camadas — e a que vale é o backend

Regra: `gps.expediente_inicio` / `gps.expediente_fim` (default 8–18, `0`–`24`
desliga), sempre avaliada em `America/Sao_Paulo`.

| Camada | Onde | Papel |
|---|---|---|
| **Backend** | `src/routes/tecnicos-localizacao.routes.js` (`janelaExpediente`, `dentroDoExpediente`) | **Fonte da verdade.** POST fora da janela não grava; GET devolve `[]` |
| **Serviço Java** | `NativeGpsService.dentroDoExpediente()` | Barra o POST na origem (economia de rede) |
| **JS do app** | `_gpsAplicarJanela()`, timer de 60 s | UX (chip "Fora do expediente") e desligar o serviço quando a WebView está viva |

**Por que não basta a camada JS** (bug de 31/07/2026): a janela nasceu no JS
quando era o próprio `watchPosition` que coletava e postava — uma camada só,
coerente. Quando a coleta migrou pro `NativeGpsService` (10/06/2026), a janela
ficou pra trás: o timer da WebView só manda um `stop()`, e o Android **congela
os timers da WebView com o app em background**. Resultado: o serviço postava a
noite inteira e o pin do técnico aparecia no mapa às 19h. Como o serviço é
`START_STICKY`, ele ainda se recria sozinho sem WebView nenhuma.

**Ao mexer na janela, mexa nas três** — e lembre que o Java só recebe valores
novos no `NativeGps.start()`: `aplicarConfigOperacional` reabre o watch quando a
config muda, senão o serviço segue com a janela antiga do `SharedPreferences`.

**Não recupera bateria:** fora da janela o GPS continua ligado, só não posta.
Desligar o hardware e religar às 08h exigiria `AlarmManager`
(`setExactAndAllowWhileIdle`) — `Handler.postDelayed` usa `uptimeMillis`, que
congela em deep sleep, e religar tarde custaria rastreamento em horário de
trabalho.

### GPS background — implementação atual

`_gpsAbrirWatch()` tenta três caminhos, nesta ordem:

1. **`NativeGpsTracker`** — plugin **próprio** (`NativeGpsPlugin.java` +
   `NativeGpsService.java`, registrado em `MainActivity`). É o caminho usado no
   APK. Um ForegroundService Java coleta a posição e faz o POST direto,
   independente da WebView; expõe `start`/`stop`/`updateToken`/
   `requestBatteryExemption` e emite os eventos `locationUpdate` e `gpsError`.
   - `gpsError` (`{ code, message }`) nasce do `SecurityException` de
     `requestLocationUpdates`. Antes ele morria num `Log.w` e o serviço seguia
     de pé com a notificação "GPS ativo" sem coletar nada. É emitido com
     `retainUntilConsumed`, porque o `start()` é assíncrono pela bridge e o erro
     pode acontecer antes de o JS registrar o listener.
   - ⚠️ **É um *started service*, nunca bound.** O plugin fala com ele por
     `startForegroundService()` + `Intent` com ação (`GPS_START` / `GPS_STOP` /
     `GPS_UPDATE_TOKEN`); `onBind` retorna `null` de propósito. Até jul/2026 o
     serviço era criado só com `bindService(BIND_AUTO_CREATE)` e o rastreamento
     morria com a tela apagada — ver a lição em
     [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).
   - `onStartCommand` devolve **`START_STICKY`**, e o sistema recria o serviço
     com **Intent nulo**. Por isso endpoint/token/intervalo ficam em
     `SharedPreferences` (`native_gps_prefs`) e são restaurados no restart —
     sem isso o serviço volta com a notificação na tela e sem enviar nada.
   - `startForeground` declara `FOREGROUND_SERVICE_TYPE_LOCATION` no Android
     10+ (obrigatório no 14+; falhar derruba o app).
   - Falha de POST é logada em `Log.w("NativeGps", ...)`. Diagnóstico no
     aparelho: `adb logcat -s NativeGps`.
2. **`@capacitor-community/background-geolocation@1.2.26`** — instalado e
   integrado como alternativa (`BackgroundGeolocation.addWatcher()`).
3. **`navigator.geolocation.watchPosition()`** — fallback no browser/PWA.

**Como funciona:**
- `window.Capacitor.isNativePlatform()` detecta o ambiente
- `window.Capacitor.Plugins.NativeGpsTracker` é a ponte para o serviço Java
- O Android exibe uma notificação persistente ("GPS ativo") obrigatória para
  serviços foreground de localização
- O usuário verá um segundo diálogo de permissão pedindo "permitir o tempo todo"
  (necessário para background real)

> ⚠️ **"Ao usar o app" não basta, e o pre-check do JS não detecta.** O
> `navigator.permissions.query({name:"geolocation"})` de `_gpsAbrirWatch()` só
> enxerga a permissão de **primeiro plano**: com "ao usar o app" ele responde
> `granted` e deixa o fluxo seguir. O serviço até coleta enquanto está vivo em
> foreground, mas quando o `START_STICKY` o recria **a partir do background** o
> Android nega a localização e o `requestLocationUpdates` lança
> `SecurityException`. Hoje isso vira o evento `gpsError` → chip
> **"Sem permissão"** + aviso com o caminho da correção. O app **não** leva o
> técnico até as Configurações: no Android 11+ o "o tempo todo" não pode ser
> pedido por diálogo, só escolhido manualmente lá.

**Permissões no manifest:**
- `ACCESS_BACKGROUND_LOCATION` — declarado em `AndroidManifest.xml`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS` —
  mergeados automaticamente pelo Gradle a partir do manifest do plugin

## A O.S. do app: a seção "Bomba atendida" (31/08/2026)

Grava o `ordens_servico.equipamento_id` (migration 072) — o vínculo entre a
O.S. e a bomba etiquetada. O modal do admin tinha esse seletor desde 18/08; o
app, não, e é **no app** que a O.S. de campo é escrita. Fluxo completo em
[`equipamentos.md`](equipamentos.md).

Sem o vínculo, duas coisas não acontecem: o orçamento nascido da O.S. não chega
na bancada colado na bomba (`_garantirOrcamentoDaOs`), e a O.S. não entra no
histórico da ficha do equipamento — o histórico que sustenta o contador de idas
à oficina.

| Peça | Onde |
|---|---|
| `sectionBomba()` / `bindBomba()` | `app/public/app.js` |
| `_osCarregarEquipamentos()` | idem — roda antes do `renderOSSections()` |
| `.os-select` | `app/public/app.css` (44px de alvo; o `.input` base tem 36px) |

⚠️ **Não confundir com "Equipamentos verificados"**, a seção logo abaixo dela.
Aquela é checklist genérico (comando elétrico, bombas de recalque…) e vive em
`itens_verificados`; esta aponta **uma** bomba do cadastro, a da etiqueta. Os
nomes são próximos de propósito — o campo novo se chama "Bomba atendida"
justamente para não haver dois "Equipamento" na mesma tela.

⚠️ **A seção só é renderizada se houver bomba etiquetada no condomínio** (ou se
a O.S. já tiver uma vinculada) — `sectionBomba()` devolve string vazia caso
contrário. Em 31/08/2026 isso significa que ela **não aparece para ninguém**:
`equipamentos` está zerada em produção. Ela nasce sozinha quando as etiquetas
subirem, sem APK novo. Quem for testar precisa de um condomínio com equipamento
cadastrado — no banco de teste, os condomínios 1 e 4 têm.

⚠️ **A seção é "•", não numerada.** `atualizarProgresso()` conta 7 seções com
lógica de completude, e a barra é calibrada nesse 7; uma oitava marcando
`complete` passaria de 100%. Numerar também quebraria a numeração das outras e
faria o mesmo passo ter número diferente em prédio com e sem etiqueta. É o
mesmo tratamento da seção de orçamento. **Ao acrescentar seção nova na O.S.,
decida antes entre "•" e número — e, se numerar, acerte `OS_SECTION_NUMBER` e o
`total` do `atualizarProgresso`.**

⚠️ **A bomba já vinculada é resgatada à parte.** Ela pode não vir no
`GET /equipamentos?condominio_id=` por ter trocado de prédio ou por estar
inativa (a listagem filtra `ativo = true`). Nos dois casos o `<select>` cairia
em "Não vinculada" e o primeiro toque em qualquer outro campo salvaria o
apagamento em silêncio — o mesmo defeito que apareceu no admin em 18/08.

⚠️ **Custa um round-trip a mais na abertura da O.S.**, porque a lista só pode
ser pedida depois de saber o `condominio_id`, que vem no `GET
/ordens-servico/:id`. É sequencial de propósito: é ela que decide se a seção
existe, e o esqueleto já está na tela. Falha de rede aqui não derruba a O.S. —
a seção simplesmente não aparece.

## O app no mundo "Chapa" — migração por etapas (01/09/2026)

O app era a **quarta identidade do produto** (Mission Control âmbar), e o
DESIGN.md registrava isso como dívida conhecida. Em 01/09 começou a migração
para o Chapa, a pedido do Pedro. **As telas de `cliente-*` ficaram fora do
escopo** — ele confirmou que não existem em uso.

As quatro etapas entraram em 01/09/2026. Estilo em `app/public/tecnico.css`,
carregado **depois** do `app.css` e do `login.css`.

| Etapa | O que | Status |
|---|---|---|
| 1 | Tokens do `:root` (move o app inteiro de paleta) + lista de chamados | ✅ |
| 2 | Detalhe do chamado | ✅ |
| 3 | Formulário da O.S. | ✅ |
| 4 | Conta e Roteiro | ✅ |

⚠️ **A PLACA É CLARA, e essa é a regra que eu errei primeiro.** O DESIGN.md diz
que *"o marinho é MATERIAL, não fundo: a tela é o campo, e as superfícies
claras são placas pousadas sobre ele para os trechos de leitura densa"*. A
primeira versão montou placa **escura** sobre campo escuro. O Pedro corrigiu
mandando a tela de orçamentos do cliente como referência ("campos brancos,
palavras em amarelo"), que é o `.orc-item` do `cliente.css`: `--chapa` de
fundo, anel `inset 1px --fio-esc`, chanfro de 14px, tinta `--tinta`, selo
amarelo preenchido com tinta marinho.

⚠️ **Como a placa clara funciona: ela redeclara os tokens de tinta
localmente.** As regras de dentro usam `var(--text)`, `var(--muted)` etc. e
viram tinta escura sozinhas — não se caça cor por cor. **A contrapartida é a
Regra do Preenchimento Cru:**

| Papel | Tokens | Flipam na placa clara? |
|---|---|---|
| **Fundo** de selo | `--amarelo` · `--vermelho` · `--verde` | **não** (sempre com tinta marinho por cima) |
| **Texto** e borda | `--risco` · `--ok` · `--warn` · `--accent` | **sim**, para a família `-t` |

Sem essa separação o selo P4 sai `#414f74` sobre `#414f74`.

⚠️ **O timer da O.S. não é placa clara.** Ele é **instrumento**, e instrumento
neste sistema é sempre marinho fundo — é o único bloco escuro da tela, e é isso
que faz o tempo saltar.

⚠️ **A palavra em amarelo: UMA por tela, e só sobre o campo marinho.** Sobre
placa clara o amarelo não é tinta (Regra do Amarelo Cego). Na lista ela vive no
estado vazio ("Você está **em dia**"), que é o único lugar onde uma frase é o
conteúdo. Quando ela existe, nada mais na tela recebe âmbar.

⚠️ **"Mais próximos" cai para PRIORIDADE quando não há GPS — e a tela diz.**
`ordenarChamados` tinha o ramo de proximidade condicionado a `TC.geo`; sem ele
caía no `else`, que é **ordenação por data**, com o controle ainda dizendo
"Mais próximos". Como o GPS só opera das 8h às 18h, **toda abertura fora do
expediente** caía nisso. Hoje `TC.sort` é o que foi **pedido** e `TC.ordemReal`
o que foi **aplicado**; quando divergem, o `#tcAvisoOrdem` aparece com a saída
("Tentar de novo" → `obterGPS({force:true})`). ⚠️ Ele é renderizado **depois**
de `ordenarChamados`, nunca antes — é ela que define `TC.ordemReal`.

⚠️ **`<option>` precisa de cor explícita, e `color-scheme` é por select.** O
menu nativo é pintado pelo sistema (claro por padrão) enquanto as opções
herdam a cor do `<select>` — com a cor quase-branca do app, era **branco sobre
branco**. Um `color-scheme: dark` global **não resolve**: os selects de
ordenação vivem sobre o marinho, mas o `.os-select` da O.S. vive **dentro da
placa clara**. Cada um declara o seu, e as `option` levam cor literal.

⚠️ **Ao sobrescrever um pseudo-elemento, o que você não redeclara continua
valendo.** A barra amarela da aba ativa já era centrada por
`transform: translateX(-50%)` no `app.css`; a regra nova acrescentou
`margin-left: -13px` sem zerar o transform, e a barra saiu **uma largura
inteira** à esquerda. Verificação que passou a existir: somar
`left + margin-left + transform` e comparar com o centro do ícone — conferir só
as propriedades que você escreveu não mede nada.

⚠️ **Nada de emoji fazendo papel de ícone.** Saíram 📍🔥🕒 dos rótulos de
ordenação, o ⚠ do desvio do Roteiro e o ✓ do confirmar assinatura. Um
`<option>` aceita só texto, então o ícone de ordenação vive **fora** do
`<select>`. E os SVGs herdados vinham com `stroke-linecap="round"` como
atributo — atributo de apresentação perde para CSS, então **uma regra**
(`[data-screen^="tecnico-"] svg`) endireitou a junta de todos de uma vez, sem
editar ícone por ícone.

⚠️ **O que mudou no item da lista não foi cor — foram três defeitos
estruturais:** saiu a barra colorida de 3px na lateral (o padrão "side-tab");
a **prioridade virou texto** (antes existia só como cor, e a regra do DESIGN.md
é que estado nunca aparece sem rótulo escrito); e **só a prioridade preenche**
(categoria é classificação e virou etiqueta gravada; status virou selo de fio).

⚠️ **O placar de 4 números saiu da lista, mas NÃO do Roteiro.** Na lista, dois
dos quatro repetiam os contadores das abas logo abaixo. No Roteiro os números
são outros (Prédios · Serviços · Atrasadas · Em curso) e não se repetem — não é
o mesmo defeito. A regra de esconder está escopada em `#tcKpiGrid`, **não** em
`.tec-kpi-strip`, que as duas telas compartilham. Ao mexer, não troque o
seletor por classe.

⚠️ **Três armadilhas de especificidade que custaram tempo aqui**, todas do
mesmo tipo — regra antiga do `app.css` vencendo a folha nova em silêncio:

| Regra velha | Especificidade | O que fazia |
|---|---|---|
| `.ch-row-mob[data-pri="p1"]::before` | 0,2,1 | pintava o **item inteiro** com a cor da prioridade |
| `#tcRefresh` | 1,0,0 | devolvia a caixa arredondada e um alvo de 30px |
| `--font-mono` → Martian Mono | — | transbordava o cabeçalho da O.S. em 22px |

A conclusão vale para as etapas 2 a 4: **ao recompor uma tela, remova os blocos
superados do `app.css` em vez de sobrescrever.** Brigar por especificidade
deixa a folha nova refém de seletor antigo que ninguém lembra que existe.

⚠️ **`--font-mono` não é o Martian Mono, de propósito.** Martian é bem mais
largo que o `ui-monospace` que aquele token carrega, e ele é usado por regras
de telas ainda não recompostas. Martian entra por `var(--mono)`, peça por peça,
onde a largura já foi medida na tela.

**Para ver sem login:** `?demo=tecnico`. ⚠️ O Chrome desta máquina **não
obedece resize de janela** — o celular se mede pondo o app num `<iframe>` de
390px, que responde às mesmas media queries. É a mesma nota que o
[`active-work.md`](../../memory-bank/active-work.md) registra para a prévia do
operador.

## O rascunho local da O.S. — trabalhar sem sinal (01/09/2026)

A O.S. é preenchida em casa de máquinas e subsolo, onde o sinal cai. Antes de
01/09 o app **perdia** o que tinha sido digitado: o patch acumulado era
descartado quando o envio falhava (`OS.pendingPatch = null` rodava antes do
`try`) e nada gravava rascunho no aparelho.

| Peça | Onde |
|---|---|
| `_osSalvarRascunho` · `_osLerRascunho` · `_osLimparRascunho` | `app/public/app.js` |
| Chave | `localStorage["gb_os_rascunho_<osId>"]` |
| Linha de estado | `#osSync` (`index.html`), estilo em `tecnico.css` |
| Marca de origem do erro | `err.httpStatus`, posto pelo `api()` |

**Como funciona:** o patch pendente é gravado no aparelho **antes** de tentar a
rede. Se o envio falha, o patch **volta** para `OS.pendingPatch` (com o que
chegou durante o voo por cima, que é mais novo). Ao reabrir a O.S. o rascunho é
aplicado **sobre** o que o `GET` devolveu — ele é mais novo — e sobe sozinho. É
apagado quando o servidor confirma e quando a O.S. é finalizada.

⚠️ **`ehFalhaDeRede(err)` é o que separa "guardar" de "mostrar".** O `api()`
estourava o mesmo `Error` para falha de rede e para recusa HTTP. Sem a
distinção, um `400` entraria numa fila e seria reenviado para sempre em
silêncio. Hoje o `api()` marca `err.httpStatus` nas respostas do servidor; o
`fetch` estoura `TypeError` quando não há rede e **nem chega nesse ponto** —
então a ausência de `httpStatus` é o sinal de falha de rede.

⚠️ **Falta de sinal NÃO é alerta vermelho.** É a linha âmbar do `#osSync`.
Quem trabalha em subsolo veria vermelho o dia inteiro, e isso ensina a ignorar
o aviso que importa. Vermelho fica reservado para recusa do servidor.

⚠️ **DOIS ARMAZÉNS, e o motivo é durabilidade, não organização** (etapa 2,
01/09):

| | O quê | Por quê |
|---|---|---|
| `localStorage` | os **campos** | escrita **síncrona** — quando `setItem` retorna, já gravou. O Android mata o app sem avisar e os campos mudam a cada tecla |
| **IndexedDB** (`gb_os`) | **assinatura** e **fotos** | escrita assíncrona, mas cabe muito mais que os ~5 MB. São peças grandes e raras |

Foi essa separação que **tirou a assinatura do sacrifício por cota** que a
etapa 1 precisava fazer: com a assinatura (~120 KB de PNG) fora do
`localStorage`, o que sobra lá é texto.

⚠️ **A foto tirada sem sinal entra na fila e APARECE na tela**, marcada como
"na fila", com um id **local** (`loc_…`, string). Esconder faria o técnico
tirar de novo achando que perdeu, e a O.S. terminaria com duplicata.
- **Nunca faça `Number(card.dataset.fotoId)`**: o id local vira `NaN`, o filtro
  não remove nada e o DELETE vai para `/fotos/NaN`. Comparação é por string,
  e `_ehFotoLocal(id)` decide entre tirar da fila e chamar o servidor.
- **Envio uma por vez, nunca em lote:** cada foto vai em base64 no corpo do
  POST e o `express.json` corta em 8 MB (ver CLAUDE.md). O laço **para no
  primeiro erro de rede** — assim a ordem em que foram tiradas é preservada.
- **Recusa do servidor tira a foto da fila** (e avisa), senão vira reenvio
  infinito.

⚠️ **`finalizarOS` descarrega a fila de fotos antes de fechar.** Finalizar exige
rede de qualquer forma; se ela está de pé, é a última chance de as fotos
subirem. Fechar com foto na fila a deixaria órfã — o backend recusa envio em
O.S. finalizada, e o técnico teria fotografado à toa. Se sobrar alguma, a
finalização é **barrada** com a contagem.

⚠️ **O auto-save no debounce precisa de `.catch()`.**
`_osEnviarPatchPendente` **relança de propósito**, porque o `finalizarOS` usa
isso para abortar antes de fechar a O.S. No caminho do debounce não há quem
pegue — sem o `.catch()` cada campo digitado sem sinal vira promessa rejeitada
sem tratamento.

**O QUE JÁ FUNCIONA SEM SINAL** (etapas 1, 2 e 3) e o que ainda não:

| | Sem sinal |
|---|---|
| Campos do formulário | ✅ |
| Fotos | ✅ ficam na fila e sobem depois |
| Assinatura | ✅ |
| **Finalizar a O.S.** | ✅ fecha no aparelho e sobe sozinha |
| **Abrir lista, chamado e O.S.** | ✅ do cache pré-carregado (etapa 4) |
| **Iniciar** um atendimento novo (criar a O.S.) | ❌ é um `POST`, não tem como |
| O.S. fechada do outro lado enquanto ele estava offline | ❌ sem caminho definido |

## Abrir sem sinal — o cache de leitura (etapa 4, 01/09/2026)

O app abria sem rede (é APK, o HTML vem do bundle), mas **toda chamada de dado
morria**: lista, detalhe, O.S. e equipamentos. Quem descia ao subsolo sem as
telas já abertas não trabalhava.

| Peça | Onde |
|---|---|
| `apiComCache(path)` | `app/public/app.js` — envolve as leituras |
| `_preCarregarParaOffline()` | idem — roda após a lista carregar COM rede |
| Store | IndexedDB `gb_os` → `cache`, keyPath `chave` |

⚠️ **A CHAVE É O PRÓPRIO CAMINHO.** Chave inventada à parte abre espaço para
descasamento silencioso — a pré-carga gravando em `chamado_12` e a leitura
procurando `chamado_meus_12`, com o cache existindo e nunca sendo achado.
Aconteceu ao escrever isto: pré-carreguei `/chamados/:id` e a tela lê
`/chamados/meus/:id`.

⚠️ **A PRÉ-CARGA É O QUE FAZ A ETAPA FUNCIONAR.** Cachear só o que ele já abriu
não resolveria nada — o problema é abrir, no subsolo, a O.S. que ele **ainda
não tinha aberto**. Após cada carga da lista **com rede**, o app busca em
segundo plano o detalhe de cada chamado aberto (até 12) e, quando a O.S. já
existe, ela e os equipamentos do prédio.

⚠️ **Só falha de REDE cai para o cache.** Um 403 ou 404 é resposta legítima:
servir dado velho ali esconderia, por exemplo, um chamado que deixou de ser
deste técnico.

⚠️ **BUMPE `IDB_VERSAO` AO ACRESCENTAR UM STORE.** O `onupgradeneeded` só
dispara quando a versão pedida é maior que a gravada no aparelho. Sem o bump,
quem já abriu o app com a versão anterior **nunca ganha o store novo** — e a
falha é silenciosa: as escritas estouram numa transação para um store
inexistente, o `.catch()` engole, e o técnico simplesmente não tem cache. (v2 =
store `cache`.)

⚠️ **O QUE A ETAPA 4 NÃO RESOLVE: começar um atendimento novo.** A O.S. nasce de
`POST /chamados/:id/iniciar-atendimento`, que devolve o `ordem_servico`. Sem
rede não há como criar — e todo o resto (rascunho, fotos, finalização) depende
desse id. Fazer isso offline exigiria id local e uma camada de reconciliação.
**Na prática:** o técnico precisa tocar em "Iniciar atendimento" **enquanto
ainda tem sinal** (na rua, na portaria) — dali para baixo tudo funciona.

⚠️ **Uma linha de aviso só, e ela prioriza.** Sem sinal os dois avisos são
verdadeiros (lista do cache E GPS mudo). Duas barras âmbar empilhadas não são o
dobro do aviso, são metade da atenção — "você está sem sinal" explica o outro, e
o contrário não.

## A marca do cabeçalho é o wordmark (01/09/2026)

⚠️ **`logo-topo.png`, não `login-logo.png`.** O segundo é o lockup **com a
assinatura** embaixo (867×288, 3:1): a 26px de altura a assinatura sai com ~5px
e vira borrão. O wordmark é 826×180 (4,6:1) e lê. É a mesma escolha que o
`operador.html` já documentava — "a versão SEM a assinatura, que é a que aguenta
escala de barra". O lockup continua certo nas telas de **entrada**, onde aparece
grande.

## Finalizar sem sinal (etapa 3, 01/09/2026 — migration 081)

O técnico fecha a O.S. no subsolo; ela sobe sozinha depois. Exigiu backend.

⚠️ **O HORÁRIO GRAVADO É O DO SERVIÇO, não o do envio.** O app manda
`finalizada_em` no corpo do `POST /:id/finalizar`, e o backend usa esse instante
para a O.S. **e para o chamado** (`fechado_em`, `tempo_resolucao_seg`). Com
`NOW()`, as horas que o técnico passou sem sinal entrariam no **SLA** como tempo
de atendimento: 40 minutos de serviço viram 3h40.

⚠️ **`sincronizada_em` (migration 081) é o que torna isso auditável.** O horário
passa a vir do relógio do celular; a coluna guarda quando o servidor recebeu.
Sem ela não haveria rastro — `ordens_servico` não tem `atualizado_em`.

⚠️ **Horário inválido NÃO recusa o envio.** O backend faz sanidade (futuro além
de 5 min, mais de 7 dias, anterior à `chegada_em`) e cai para `NOW()` — recusar
deixaria o trabalho preso na fila do aparelho para sempre, que é o pior
desfecho. `sincronizada_em` fica marcada mesmo no descarte.

⚠️ **ORDEM OBRIGATÓRIA na sincronização: campos → fotos → finalizar.** O backend
recusa `PATCH` e envio de foto em O.S. já finalizada; inverter deixa as fotos
órfãs. `_osEnviarFinalizacaoPendente(osId)` faz as três, e **recebe o id** em vez
de olhar `OS.data` — o técnico pode ter fechado três O.S. antes de o sinal
voltar, e nenhuma delas está aberta na tela.

⚠️ **A tela de conclusão não mente.** Enquanto está na fila ela diz "Guardada no
aparelho · envia sozinha", **não** "chamado fechado". O técnico juraria que
enviou, e é ele que responde quando o escritório não acha a O.S.

⚠️ **A lista marca o chamado como "Aguardando envio", e isso roda MESMO com o
`GET` falhando.** O servidor ainda o considera aberto. Se a marcação dependesse
da lista carregar, ela só apareceria quando já não fosse necessária — porque é
justamente no subsolo que o `GET` falha, e é lá que ele refaria o serviço.

⚠️ **Reabrir uma O.S. já finalizada no aparelho mostra a conclusão, e a consulta
à fila vem ANTES do `GET`.** Depois do `GET` não funcionaria offline: o técnico
receberia "erro ao carregar" numa O.S. que ele mesmo acabou de fechar.

⚠️ **O caso sem caminho definido:** se a O.S. for finalizada ou fechada do outro
lado enquanto o técnico está offline, a fila dele chega e **não tem onde
pousar** — o backend recusa edição e envio de foto em O.S. finalizada. Hoje a
foto sairia da fila com um alerta. É a diferença entre "não perde" e "não perde
nunca". Ver o roadmap (etapa 5).

⚠️ **Limite que nenhuma etapa remove:** desinstalar o app ou limpar o
armazenamento leva o rascunho junto. É local, não é backup.

**Para testar:** o modo `?demo=tecnico` **não serve** — `IS_DEMO` sai antes do
PATCH e do rascunho, que é justamente o caminho a exercitar. O jeito é
interceptar o `fetch` na página e derrubar/levantar a rede.

## A tela de fim de O.S. (01/09/2026)

`mostrarOSSucesso()` (`app/public/app.js`) troca o conteúdo de `#osSections`
pelo cartão "O.S. finalizada!" e **esconde duas peças que são do `index.html`,
não dela**: o card do timer/progresso (`.os-shell .td-card`) e a barra de CTA
(`#osCtaBar`). Sobra **uma saída só**: "Voltar pra minha lista".

⚠️ **Quem devolve as duas peças é `abrirFormularioOS()`, na ENTRADA da próxima
O.S. — nunca um handler de saída.** O cabeçalho da tela tem uma segunda porta,
a seta `#osBack`: restaurar só no clique de "Voltar pra minha lista" deixa a
O.S. seguinte sem timer e sem botão de finalizar para quem sair pela seta. Vale
para qualquer peça que esta tela venha a esconder.

⚠️ **Mire a barra de CTA pelo `id`, nunca por `.td-cta-bar`.** Existem **duas**
com essa classe no `index.html`, e a da tela de detalhe do chamado
(`#tdCtaBar`) vem **antes** no documento — um `querySelector(".td-cta-bar")`
pega a de lá. Foi esse o bug corrigido em 01/09: a linha escondia o elemento
errado e, como aquele já é `[hidden]` (que é `display: none !important` em
`app.css:96`), **não fazia nada**. O "Confirmar e finalizar O.S." ficava na
tela de uma O.S. já finalizada, e tocá-lo chamava `finalizarOS()` de novo —
o backend recusa uma O.S. fechada, então só produzia erro.

⚠️ **`baixarPdfOS()` existe e não tem chamador.** O botão "📄 Baixar PDF" saiu
da tela de sucesso em 01/09 a pedido do Pedro. A função ficou de propósito —
carrega a integração nativa de salvar/compartilhar (Filesystem + Share do
Capacitor) e religar é uma linha. Se a remoção for definitiva, apagar a função
inteira.

**Para exercitar sem rede:** `?demo=tecnico` na URL liga o `IS_DEMO` e
`abrirFormularioOS()` monta uma O.S. de mentira. É como este fluxo foi
conferido nos quatro passos, incluindo a saída pela seta.

## Notificações — estado atual: **não existem**

O app **não tem nenhum mecanismo de notificação** (nem push, nem local). A única
forma de o técnico saber de chamado novo é a tela de chamados atualizar sozinha:

```js
TC.polling = setInterval(() => carregarMeusChamados(true), 30000);  // app.js:329
```

Esse `setInterval` só roda **com a tela de chamados aberta**. Com o app em
segundo plano o Android congela os timers da WebView; com o app fechado não há
nada. Ou seja: **celular no bolso = chamado novo não chega.**

A notificação persistente "GPS ativo" descrita acima **não é** notificação de
chamado — é a exigência do Android para manter o ForegroundService de
localização, e aparece independente de haver chamado.

Push nativo é a **Fase 7G**, planejada com escopo fechado em
[`../../memory-bank/roadmap.md`](../../memory-bank/roadmap.md); o porquê da
escolha (FCM em vez de notificação local) está em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

## Preventiva de plano só chega ao técnico se o condomínio tiver zona

Descoberto em teste (2026-07-28). O chamado gerado por plano de manutenção
(`executarPlano`) só nasce com `tecnico_id` preenchido quando **duas** condições
batem: o condomínio tem `zona` preenchida **e** essa zona tem **exatamente um**
responsável em `planos_zona_responsavel`. Com zero ou mais de um, o chamado
nasce sem dono — proposital, o sistema não escolhe entre dois técnicos.

Como `GET /chamados/meus` filtra por `ch.tecnico_id = <eu>`, chamado sem dono
**nunca aparece no app** — some silenciosamente até alguém distribuir pelo
painel. Consequência prática: **condomínio cadastrado sem `zona` = preventiva
que nunca chega sozinha no celular.**

Duas pegadinhas relacionadas:
- O responsável da zona é consultado **no instante da geração**. Definir o
  responsável depois **não retroage** no chamado já criado.
- Reexecutar o plano não corrige: o anti-duplicidade devolve o mesmo chamado
  enquanto ele não estiver `fechado`/`cancelado`.

> Ver também [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md)
> para o raciocínio de usar Capacitor em vez de React Native.
