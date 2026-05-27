// src/jobs/planos-manutencao.job.js
//
// Roda 1×/dia. Para cada plano ativo cujo `proxima_em <= hoje`:
//   1. Abre um chamado P4 (categoria 'manutencao', sem técnico atribuído)
//      vinculado ao plano via `chamados.plano_manutencao_id`.
//   2. Atualiza `ultima_em = hoje` e `proxima_em = hoje + periodicidade_dias`.
//
// Anti-duplicidade: pula se o plano já tem chamado aberto vinculado
// (alguém pode ter chamado /executar-agora ou o admin pode ter aberto manualmente).

const { pool } = require("../db");
const { getConfigBool } = require("../services/config.service");

const INTERVALO_MS = 24 * 60 * 60 * 1000; // 1 dia
const PRIMEIRA_EXECUCAO_MS = 30 * 60 * 1000; // 30 min após boot

let _lastRun = null;
let _lastResult = null;
let _running = false;

// Executa um plano específico (criando o chamado P4 + atualizando datas).
// Usado pelo job (em loop) e pelo endpoint POST /:id/executar-agora.
// Retorna { ok, plano_id, chamado_id, duplicado? }.
async function executarPlano(planoId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planoRes = await client.query(
      `SELECT id, condominio_id, titulo, descricao, periodicidade_dias, proxima_em
       FROM planos_manutencao
       WHERE id = $1 AND ativo = TRUE
       FOR UPDATE`,
      [planoId]
    );
    if (!planoRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Plano não encontrado ou inativo"), { status: 404 });
    }
    const plano = planoRes.rows[0];

    // Anti-duplicidade: já existe chamado aberto vinculado?
    const dupRes = await client.query(
      `SELECT id FROM chamados
       WHERE plano_manutencao_id = $1
         AND status NOT IN ('fechado', 'cancelado')
       LIMIT 1`,
      [planoId]
    );
    if (dupRes.rows.length) {
      await client.query("ROLLBACK");
      return {
        ok: true,
        plano_id: planoId,
        chamado_id: dupRes.rows[0].id,
        duplicado: true,
      };
    }

    const descricao = [
      plano.descricao ? plano.descricao.trim() : null,
      `Gerado automaticamente pelo plano de manutenção #${planoId}.`,
    ].filter(Boolean).join("\n\n");

    const chamadoRes = await client.query(
      `INSERT INTO chamados
         (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id)
       VALUES ($1, $2, $3, 'p4', 'manutencao', 'aberto', $4)
       RETURNING id`,
      [plano.condominio_id, plano.titulo, descricao, planoId]
    );

    await client.query(
      `UPDATE planos_manutencao
       SET ultima_em = CURRENT_DATE,
           proxima_em = CURRENT_DATE + ($1 || ' days')::interval
       WHERE id = $2`,
      [plano.periodicidade_dias, planoId]
    );

    await client.query("COMMIT");

    return {
      ok: true,
      plano_id: planoId,
      chamado_id: chamadoRes.rows[0].id,
      duplicado: false,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function jobGerarChamadosPreventivos() {
  const enabled = await getConfigBool("planos.geracao_enabled", true);
  if (!enabled) {
    return { ok: true, enabled: false, gerados: 0, duplicados: 0, candidatos: 0 };
  }

  const r = await pool.query(
    `SELECT id FROM planos_manutencao
     WHERE ativo = TRUE AND proxima_em <= CURRENT_DATE
     ORDER BY proxima_em ASC`
  );

  let gerados = 0, duplicados = 0, erros = 0;
  for (const row of r.rows) {
    try {
      const result = await executarPlano(row.id);
      if (result.duplicado) duplicados++;
      else gerados++;
    } catch (e) {
      erros++;
      console.error(`[planos-manutencao] erro no plano ${row.id}:`, e.message);
    }
  }

  return {
    ok: true,
    enabled: true,
    candidatos: r.rows.length,
    gerados,
    duplicados,
    erros,
  };
}

function getPlanosManutencaoStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startPlanosManutencaoScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobGerarChamadosPreventivos();
      _lastRun = new Date().toISOString();
      console.log("📅 Job planos-manutencao:", _lastResult);
    } catch (e) {
      console.error("❌ Job planos-manutencao falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    setTimeout(tick, INTERVALO_MS);
  }
  // Primeira execução 30 min após boot (escalonado depois dos outros jobs).
  setTimeout(tick, PRIMEIRA_EXECUCAO_MS);
}

module.exports = {
  executarPlano,
  jobGerarChamadosPreventivos,
  startPlanosManutencaoScheduler,
  getPlanosManutencaoStatus,
};
