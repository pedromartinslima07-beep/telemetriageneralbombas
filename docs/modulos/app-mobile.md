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
