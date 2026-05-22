// src/jobs/chamados-atraso.job.js — Fase 7I
// Verifica chamados que estão `em_atendimento` há mais que o limite
// configurável (`chamados.alerta_atraso_horas`, default 4h) e dispara
// email pros destinatários do alerta. Anti-spam: re-notifica no máximo
// uma vez a cada janela de X horas (mesma janela que o threshold).
//
// Tempo de referência: `ordens_servico.chegada_em` quando há OS aberta
// (mais preciso — é quando o técnico bateu o ponto). Fallback pra
// `chamados.atualizado_em` quando não tem OS.
//
// Roda 1× a cada 15 min. Pequeno overhead, suficiente pra cobrir o
// threshold mínimo de 1h.

const { pool } = require("../db");
const { getConfigInt, getConfigBool } = require("../services/config.service");
const { sendChamadoAtrasoEmail } = require("../services/email");

const INTERVALO_MS = 15 * 60 * 1000; // 15 min

let _lastRun = null;
let _lastResult = null;
let _running = false;

async function jobVerificarChamadosAtraso() {
  const enabled = await getConfigBool("chamados.alerta_atraso_enabled", true);
  const horas = await getConfigInt("chamados.alerta_atraso_horas", 4);
  const threshold = Math.max(1, Math.min(24, horas));

  if (!enabled) {
    return { ok: true, enabled: false, horas: threshold, avisados: 0 };
  }

  const r = await pool.query(
    `SELECT
       ch.id,
       ch.titulo,
       ch.condominio_id,
       c.nome  AS condominio_nome,
       t.nome  AS tecnico_nome,
       COALESCE(os.chegada_em, ch.atualizado_em) AS desde,
       EXTRACT(EPOCH FROM (NOW() - COALESCE(os.chegada_em, ch.atualizado_em))) / 3600.0 AS horas_decorridas,
       ch.alerta_atraso_enviado_em
     FROM chamados ch
     LEFT JOIN condominios c       ON c.id  = ch.condominio_id
     LEFT JOIN tecnicos t          ON t.id  = ch.tecnico_id
     LEFT JOIN ordens_servico os   ON os.id = ch.ordem_servico_id
     WHERE ch.status = 'em_atendimento'
       AND COALESCE(os.chegada_em, ch.atualizado_em) < NOW() - ($1 || ' hours')::interval
       AND (
         ch.alerta_atraso_enviado_em IS NULL
         OR ch.alerta_atraso_enviado_em < NOW() - ($1 || ' hours')::interval
       )`,
    [threshold]
  );

  let avisados = 0;
  for (const row of r.rows) {
    try {
      await sendChamadoAtrasoEmail({
        chamado_id: row.id,
        titulo: row.titulo,
        condominio_nome: row.condominio_nome,
        tecnico_nome: row.tecnico_nome,
        horas: row.horas_decorridas,
        desde_iso: row.desde,
      });
      await pool.query(
        `UPDATE chamados SET alerta_atraso_enviado_em = NOW() WHERE id = $1`,
        [row.id]
      );
      avisados++;
    } catch (e) {
      console.error(`[chamados-atraso] erro no chamado ${row.id}:`, e.message);
    }
  }

  return { ok: true, enabled: true, horas: threshold, avisados, candidatos: r.rows.length };
}

function getChamadosAtrasoStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startChamadosAtrasoScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobVerificarChamadosAtraso();
      _lastRun = new Date().toISOString();
      console.log("⏱  Job chamados-atraso:", _lastResult);
    } catch (e) {
      console.error("❌ Job chamados-atraso falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    setTimeout(tick, INTERVALO_MS);
  }
  // Primeira execução 2 min após boot (depois do offline.job).
  setTimeout(tick, 2 * 60 * 1000);
}

module.exports = {
  jobVerificarChamadosAtraso,
  startChamadosAtrasoScheduler,
  getChamadosAtrasoStatus,
};
