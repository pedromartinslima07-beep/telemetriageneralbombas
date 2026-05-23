// src/jobs/alertas-cleanup.job.js — Fase 9E
// Limpa alertas de telemetria já resolvidos antigos. Após N dias sem mexer,
// um alerta resolvido não é consultado mais (admin já reagiu, histórico já
// está em relatórios). Apaga também os comentários daquele alerta — sem FK
// direta (alerta_comentarios cobre 2 origens), então CTE faz no mesmo round-trip.
//
// Default: retenção de 365 dias. Roda 1x por dia.
// Lotes de 1000 (volume típico bem menor que leituras).
// Modo dry-run via config `alertas.cleanup_dry_run` = "true".

const { pool } = require("../db");
const { getConfigInt, getConfigBool } = require("../services/config.service");

const LOTE = 1000;

let _lastRun = null;
let _lastResult = null;
let _running = false;

async function jobLimparAlertas() {
  const dias = await getConfigInt("alertas.retencao_dias", 365);
  const dryRun = await getConfigBool("alertas.cleanup_dry_run", false);
  const retencao = Math.max(30, dias); // hard floor de 30 dias

  if (dryRun) {
    const r = await pool.query(
      `SELECT COUNT(*)::bigint AS n
         FROM alertas
        WHERE status = 'resolvido'
          AND atualizado_em < NOW() - ($1 || ' days')::interval`,
      [retencao]
    );
    return {
      ok: true,
      dry_run: true,
      retencao_dias: retencao,
      seriam_removidos: Number(r.rows[0].n),
      removidos: 0,
    };
  }

  let totalRemovidos = 0;
  let comentariosRemovidos = 0;
  let lotes = 0;
  const inicio = Date.now();
  const MAX_LOTES = 100;

  while (lotes < MAX_LOTES) {
    // CTE: seleciona alvos do lote, apaga comentários órfãos, apaga alertas.
    // Sem FK em alerta_comentarios, comentários virariam lixo se não fossem
    // limpos junto.
    const r = await pool.query(
      `WITH alvos AS (
         SELECT id FROM alertas
          WHERE status = 'resolvido'
            AND atualizado_em < NOW() - ($1 || ' days')::interval
          LIMIT $2
       ),
       cmt AS (
         DELETE FROM alerta_comentarios
          WHERE alerta_origem = 'telemetria'
            AND alerta_id IN (SELECT id FROM alvos)
          RETURNING 1
       ),
       del AS (
         DELETE FROM alertas WHERE id IN (SELECT id FROM alvos)
         RETURNING 1
       )
       SELECT (SELECT COUNT(*) FROM del)::int AS alertas,
              (SELECT COUNT(*) FROM cmt)::int AS comentarios`,
      [retencao, LOTE]
    );
    const nAlertas = r.rows[0].alertas || 0;
    const nComentarios = r.rows[0].comentarios || 0;
    totalRemovidos += nAlertas;
    comentariosRemovidos += nComentarios;
    lotes++;
    if (nAlertas < LOTE) break;
  }

  return {
    ok: true,
    dry_run: false,
    retencao_dias: retencao,
    removidos: totalRemovidos,
    comentarios_removidos: comentariosRemovidos,
    lotes,
    duracao_ms: Date.now() - inicio,
    truncado: lotes >= MAX_LOTES,
  };
}

function getAlertasCleanupStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startAlertasCleanupScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobLimparAlertas();
      _lastRun = new Date().toISOString();
      console.log("🧹 Job alertas cleanup:", _lastResult);
    } catch (e) {
      console.error("❌ Job alertas cleanup falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }
  // Primeira execução: 15 min após boot (depois da limpeza de leituras pra
  // não disputar pool).
  setTimeout(tick, 15 * 60 * 1000);
}

module.exports = {
  jobLimparAlertas,
  startAlertasCleanupScheduler,
  getAlertasCleanupStatus,
};
