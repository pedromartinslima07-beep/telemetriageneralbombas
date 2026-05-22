// src/jobs/leituras-cleanup.job.js — Fase 9C
// Limpa registros antigos de `leituras`. A tabela cresce ~86k linhas/dia
// num cenário de 100 condomínios × 3 reservatórios (ping de 5 min por
// device). Sem limpeza vira o gargalo do Railway em ~6 meses.
//
// Default: retenção de 60 dias. Roda 1x por dia.
// Lotes de 10k pra não bloquear o pool nem o autovacuum.
// Modo dry-run via config `leituras.cleanup_dry_run` = "true" — conta
// quantas linhas seriam apagadas sem apagar. Útil pra primeira execução
// em produção, confirmar o volume antes de soltar o DELETE.

const { pool } = require("../db");
const { getConfigInt, getConfigBool } = require("../services/config.service");

const LOTE = 10_000;

let _lastRun = null;
let _lastResult = null;
let _running = false;

async function jobLimparLeituras() {
  const dias = await getConfigInt("leituras.retencao_dias", 60);
  const dryRun = await getConfigBool("leituras.cleanup_dry_run", false);
  const retencao = Math.max(7, dias); // hard floor de segurança

  if (dryRun) {
    const r = await pool.query(
      `SELECT COUNT(*)::bigint AS n
         FROM leituras
        WHERE criado_em < NOW() - ($1 || ' days')::interval`,
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

  // Apaga em lotes pra não segurar locks longos nem inchar o WAL.
  // Cada DELETE remove até LOTE linhas; sai quando nenhuma sobrar.
  let totalRemovidos = 0;
  let lotes = 0;
  const inicio = Date.now();
  // Cap de segurança: 200 lotes (2M linhas/execução) por dia — se
  // estourar, alguma coisa está errada e queremos saber.
  const MAX_LOTES = 200;

  while (lotes < MAX_LOTES) {
    const r = await pool.query(
      `DELETE FROM leituras
        WHERE id IN (
          SELECT id FROM leituras
           WHERE criado_em < NOW() - ($1 || ' days')::interval
           LIMIT $2
        )`,
      [retencao, LOTE]
    );
    const n = r.rowCount || 0;
    totalRemovidos += n;
    lotes++;
    if (n < LOTE) break; // acabou
  }

  return {
    ok: true,
    dry_run: false,
    retencao_dias: retencao,
    removidos: totalRemovidos,
    lotes,
    duracao_ms: Date.now() - inicio,
    truncado: lotes >= MAX_LOTES,
  };
}

function getLeiturasCleanupStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startLeiturasCleanupScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobLimparLeituras();
      _lastRun = new Date().toISOString();
      console.log("🧹 Job leituras cleanup:", _lastResult);
    } catch (e) {
      console.error("❌ Job leituras cleanup falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    // Roda 1x por dia. Pequena variação não importa.
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }
  // Primeira execução: 10 minutos após boot (mais tarde que o GPS pra
  // não disputar pool no startup).
  setTimeout(tick, 10 * 60 * 1000);
}

module.exports = {
  jobLimparLeituras,
  startLeiturasCleanupScheduler,
  getLeiturasCleanupStatus,
};
