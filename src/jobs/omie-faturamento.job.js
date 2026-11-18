// src/jobs/omie-faturamento.job.js — agenda, fase A (18/11/2026)
//
// Copia do Omie os contratos de serviço e as NFS-e que eles geraram, para a
// agenda acompanhar o faturamento do mês (ver omie-faturamento.service.js).
// SÓ LEITURA no Omie.
//
// Padrão do projeto: setTimeout recursivo, intervalo lido do config a cada
// volta (`omie.faturamento_intervalo_min`, padrão 60). Sem as credenciais do
// Omie no ambiente o job não faz nada e diz isso uma vez.

const { getConfigInt } = require("../services/config.service");
const { sincronizar } = require("../services/omie-faturamento.service");

let _lastRun = null;
let _lastResult = null;
let _running = false;
let _avisouSemCredencial = false;

function getOmieFaturamentoStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startOmieFaturamentoScheduler() {
  async function tick() {
    if (!process.env.OMIE_APP_KEY || !process.env.OMIE_APP_SECRET) {
      if (!_avisouSemCredencial) console.log("ℹ️  Job Omie faturamento: sem OMIE_APP_KEY/SECRET, não roda.");
      _avisouSemCredencial = true;
      return agendar();
    }
    if (_running) return agendar();
    _running = true;
    try {
      _lastResult = await sincronizar({ forcar: true });
      _lastRun = new Date().toISOString();
      console.log("🧾 Job Omie faturamento:", _lastResult);
    } catch (e) {
      _lastResult = { ok: false, erro: e.message };
      console.error("❌ Job Omie faturamento falhou:", e.message);
    } finally {
      _running = false;
      agendar();
    }
  }
  async function agendar() {
    const min = await getConfigInt("omie.faturamento_intervalo_min", 60).catch(() => 60);
    setTimeout(tick, Math.max(15, min) * 60 * 1000);
  }
  // Primeira volta 3 min depois do boot: não disputa a subida do servidor.
  setTimeout(tick, 3 * 60 * 1000);
}

module.exports = { startOmieFaturamentoScheduler, getOmieFaturamentoStatus };
