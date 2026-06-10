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

### GPS background — implementação atual (2026-06-10)

O plugin `@capacitor-community/background-geolocation@1.2.26` está instalado e
integrado. Ao rodar no APK nativo, `_gpsAbrirWatch()` usa
`BackgroundGeolocation.addWatcher()` em vez de `watchPosition`; no browser/PWA
cai no `watchPosition` como fallback.

**Como funciona:**
- `window.Capacitor.isNativePlatform()` detecta o ambiente
- `window.Capacitor.Plugins.BackgroundGeolocation` é a ponte para o plugin Java
- O Android exibe uma notificação persistente ("GPS ativo") obrigatória para
  serviços foreground de localização
- O usuário verá um segundo diálogo de permissão pedindo "permitir o tempo todo"
  (necessário para background real)

**Permissões no manifest:**
- `ACCESS_BACKGROUND_LOCATION` — declarado em `AndroidManifest.xml`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS` —
  mergeados automaticamente pelo Gradle a partir do manifest do plugin

> Ver também [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md)
> para o raciocínio de usar Capacitor em vez de React Native.
