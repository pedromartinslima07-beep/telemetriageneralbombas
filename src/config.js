// src/config.js — constantes globais lidas do ambiente
const OFFLINE_MINUTES = Number(process.env.OFFLINE_MINUTES || 10);

module.exports = { OFFLINE_MINUTES };
