// src/config.js — constantes globais lidas do ambiente
const OFFLINE_MINUTES = Number(process.env.OFFLINE_MINUTES || 10);

// Faixas de nível (em % do reservatório). UMA cópia: o alerta
// (`POST /telemetria`), o painel do operador e o do cliente (que as recebe em
// `GET /cliente/status` → `limiares`) leem daqui. Abaixo de `baixo` abre
// `nivel_baixo`; abaixo de `critico`, `nivel_muito_baixo`. O Monitoramento do
// admin tem as mesmas duas constantes no topo de `admin-monitoramento.js`
// (o `/admin/status` devolve uma lista, sem lugar para levá-las).
const LIMIARES_NIVEL = Object.freeze({ baixo: 45, critico: 20 });

module.exports = { OFFLINE_MINUTES, LIMIARES_NIVEL };
