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

### Limitação conhecida — GPS para com tela apagada

**Sintoma:** após ~3 minutos com a tela apagada, o admin mostra o técnico como
"não rastreando".

**Causa:** `watchPosition` roda dentro de uma WebView Android. Quando a tela
apaga, o OS pausa a WebView — mesmo no APK. O `@capacitor/android` sozinho não
muda esse comportamento; é necessário o plugin nativo de background geolocation.

**Solução pendente:** instalar e integrar
`@capacitor-community/background-geolocation`.

```bash
cd app
npm install @capacitor-community/background-geolocation
npx cap sync android
```

Permissões a adicionar em
`app/android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

No `app.js`, a função `_gpsAbrirWatch()` deve detectar se o plugin está
disponível (ambiente Capacitor nativo) e usá-lo; caso contrário, cair no
`watchPosition` padrão como fallback web.

> Ver também [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md)
> para o raciocínio de usar Capacitor em vez de React Native.
