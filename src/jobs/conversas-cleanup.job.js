// src/jobs/conversas-cleanup.job.js — Fase 9E
// Limpa conversas WhatsApp fechadas antigas. mensagens_whatsapp cascateia
// via ON DELETE CASCADE (migration 001), chamados.conversa_id vira NULL
// via ON DELETE SET NULL — então apagar a conversa é seguro.
//
// Importante: NÃO mexe no histórico do cliente no WhatsApp dele nem na
// Evolution API. Só na nossa cópia que aparece na central de atendimento
// do painel e que a IA usa de contexto.
//
// Default: retenção de 365 dias após fechamento. Roda 1x por dia.

const { pool } = require("../db");
const { getConfigInt, getConfigBool } = require("../services/config.service");

const LOTE = 500;

let _lastRun = null;
let _lastResult = null;
let _running = false;

async function jobLimparConversas() {
  const dias = await getConfigInt("conversas.retencao_dias", 365);
  const dryRun = await getConfigBool("conversas.cleanup_dry_run", false);
  const retencao = Math.max(30, dias);

  if (dryRun) {
    const r = await pool.query(
      `SELECT
         COUNT(*)::bigint AS conversas,
         COALESCE(SUM(m.n), 0)::bigint AS mensagens
       FROM conversas_whatsapp c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::bigint AS n FROM mensagens_whatsapp WHERE conversa_id = c.id
       ) m ON true
       WHERE c.status = 'fechada'
         AND c.fechado_em IS NOT NULL
         AND c.fechado_em < NOW() - ($1 || ' days')::interval`,
      [retencao]
    );
    return {
      ok: true,
      dry_run: true,
      retencao_dias: retencao,
      seriam_removidos: Number(r.rows[0].conversas),
      mensagens_seriam_removidas: Number(r.rows[0].mensagens),
      removidos: 0,
    };
  }

  let totalConversas = 0;
  let totalMensagens = 0;
  let lotes = 0;
  const inicio = Date.now();
  const MAX_LOTES = 100;

  while (lotes < MAX_LOTES) {
    // Conta as mensagens que vão cascatear antes do DELETE pra reportar
    // no resultado. Mesma janela de IDs nos dois passos.
    const r = await pool.query(
      `WITH alvos AS (
         SELECT id FROM conversas_whatsapp
          WHERE status = 'fechada'
            AND fechado_em IS NOT NULL
            AND fechado_em < NOW() - ($1 || ' days')::interval
          LIMIT $2
       ),
       cont_msgs AS (
         SELECT COUNT(*)::int AS n FROM mensagens_whatsapp
          WHERE conversa_id IN (SELECT id FROM alvos)
       ),
       del AS (
         DELETE FROM conversas_whatsapp WHERE id IN (SELECT id FROM alvos)
         RETURNING 1
       )
       SELECT (SELECT COUNT(*) FROM del)::int AS conversas,
              (SELECT n FROM cont_msgs)         AS mensagens`,
      [retencao, LOTE]
    );
    const nConversas = r.rows[0].conversas || 0;
    const nMensagens = r.rows[0].mensagens || 0;
    totalConversas += nConversas;
    totalMensagens += nMensagens;
    lotes++;
    if (nConversas < LOTE) break;
  }

  return {
    ok: true,
    dry_run: false,
    retencao_dias: retencao,
    removidos: totalConversas,
    mensagens_removidas: totalMensagens,
    lotes,
    duracao_ms: Date.now() - inicio,
    truncado: lotes >= MAX_LOTES,
  };
}

function getConversasCleanupStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startConversasCleanupScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobLimparConversas();
      _lastRun = new Date().toISOString();
      console.log("🧹 Job conversas cleanup:", _lastResult);
    } catch (e) {
      console.error("❌ Job conversas cleanup falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }
  // 20 min após boot (depois de leituras e alertas).
  setTimeout(tick, 20 * 60 * 1000);
}

module.exports = {
  jobLimparConversas,
  startConversasCleanupScheduler,
  getConversasCleanupStatus,
};
