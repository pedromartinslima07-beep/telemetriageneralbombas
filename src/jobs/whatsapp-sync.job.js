// Ronda da coexistência (migration 108).
//
// Número conectado em coexistência tem 24 h para a Meta receber o pedido de
// sincronização de contatos (`smb_app_state_sync`) e de histórico (`history`);
// sem isso ela desconecta o número. A conexão já pede as duas; esta ronda
// refaz a que falhou, até 5 tentativas dentro do prazo
// (whatsapp-cadastro.service.js, `sincronizarPendentes`). Passou disso, o erro
// fica na linha do número e o caminho é reconectar pela janela da Meta.
//
// Padrão do projeto: setTimeout recursivo, intervalo lido da config a cada
// volta (`whatsapp.sync_intervalo_min`, padrão 15).
const { getConfigInt } = require("../services/config.service");
const { sincronizarPendentes } = require("../services/whatsapp-cadastro.service");

let _lastRun = null;
let _lastResult = null;

async function _tick() {
  try {
    _lastRun = new Date().toISOString();
    _lastResult = await sincronizarPendentes();
    if (_lastResult.tentadas || _lastResult.vencidas) {
      console.log(`[whatsapp-sync] tentadas ${_lastResult.tentadas}, concluídas ${_lastResult.concluidas}, vencidas ${_lastResult.vencidas}`);
    }
  } catch (err) {
    // Tabela ainda não migrada cai aqui também: a ronda só espera a próxima.
    console.error("[whatsapp-sync] erro:", err.message);
    _lastResult = { erro: err.message };
  }
  const min = await getConfigInt("whatsapp.sync_intervalo_min", 15).catch(() => 15);
  setTimeout(_tick, min * 60 * 1000);
}

function startWhatsappSyncScheduler() {
  setTimeout(_tick, 2 * 60 * 1000);
  console.log("[whatsapp-sync] agendado (primeira execução em 2min, depois a cada 15min)");
}

function getWhatsappSyncJobStatus() {
  return { lastRun: _lastRun, lastResult: _lastResult };
}

module.exports = { startWhatsappSyncScheduler, getWhatsappSyncJobStatus };
