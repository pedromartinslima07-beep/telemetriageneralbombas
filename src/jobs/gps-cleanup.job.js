// src/jobs/gps-cleanup.job.js — Fase 7F
// Limpa registros antigos de tecnico_localizacoes_historico.
// Default: retenção de 24h. Roda 1x por dia (setTimeout recursivo).
// A tabela cresce ~1 ping/min/técnico em atendimento — sem essa limpeza
// o histórico cresce indefinidamente.

const { pool } = require("../db");
const { getConfigInt } = require("../services/config.service");

let _lastRun = null;
let _lastResult = null;
let _running = false;

async function jobLimparHistoricoGPS() {
  const horas = await getConfigInt("gps.retencao_horas", 24);

  const r = await pool.query(
    `DELETE FROM tecnico_localizacoes_historico
     WHERE capturada_em < NOW() - ($1 || ' hours')::interval`,
    [Math.max(1, horas)]
  );
  return { ok: true, retencao_horas: horas, removidos: r.rowCount || 0 };
}

function getGpsCleanupStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startGpsCleanupScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobLimparHistoricoGPS();
      _lastRun = new Date().toISOString();
      console.log("🧹 Job GPS cleanup:", _lastResult);
    } catch (e) {
      console.error("❌ Job GPS cleanup falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    // Roda 1x por dia. Pequena variação não importa.
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }
  // Primeira execução: 5 minutos após boot (não bloqueia startup)
  setTimeout(tick, 5 * 60 * 1000);
}

module.exports = { jobLimparHistoricoGPS, startGpsCleanupScheduler, getGpsCleanupStatus };
