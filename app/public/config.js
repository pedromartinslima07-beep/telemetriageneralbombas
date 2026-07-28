// Endereço da API usado pelo app empacotado (APK/IPA).
//
// Carregado ANTES do app.js. Dentro do Capacitor, o app.js lê
// `window.GB_API_BASE` e só cai na URL de produção se esta variável não existir
// (ver o bloco API_BASE no topo de app.js). No navegador este arquivo é
// ignorado: lá a API é a própria origem que serviu a página.
//
// ┌─ ATENÇÃO ───────────────────────────────────────────────────────────────┐
// │ Apontando pra PRODUÇÃO (banco real). Todo dado gerado no app — inclusive │
// │ os pings de GPS — cai no banco de produção.                             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Qual valor usar:
//   • Produção ............................ https://telemetria.generalbombas.com
//   • Aparelho físico no mesmo Wi-Fi ...... http://192.168.1.80:3001
//     (IP desta máquina; se a rede mudar, o IP muda — confira com ipconfig)
//   • Emulador do Android Studio .......... http://10.0.2.2:3001
//     (10.0.2.2 é como o emulador enxerga o localhost do host; NÃO funciona
//      em aparelho físico — lá esse endereço não existe)
//
// Os dois hosts de dev estão liberados pra tráfego HTTP em
// app/android/app/src/main/res/xml/network_security_config.xml — usar outro IP
// exige adicionar lá também, senão o Android bloqueia a conexão. Produção é
// HTTPS e não depende desse arquivo.
//
// ⚠️ Teste de GPS em background exige PRODUÇÃO: o celular sai do Wi-Fi ao
// deslocar-se e perde qualquer servidor local.

window.GB_API_BASE = "https://telemetria.generalbombas.com";
