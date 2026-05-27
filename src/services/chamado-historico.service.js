// src/services/chamado-historico.service.js
//
// Audit log de mudanças em chamados (tabela historico_chamados).
//
// Comparado com o objeto "antes" (snapshot do chamado lido antes do UPDATE)
// e o "depois" (linha resultante do RETURNING), registra uma linha por campo
// que mudou em CAMPOS_AUDITADOS.

const { pool } = require("../db");

const CAMPOS_AUDITADOS = [
  "status",
  "prioridade",
  "categoria",
  "responsavel_id",
  "tecnico_id",
  "condominio_id",
];

function _norm(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Insere uma linha "criado" no histórico (campo_alterado='criado').
 * Chamar logo após a criação do chamado.
 *
 * @param {object} opts
 * @param {object} [opts.client]  cliente em transação (opcional; default = pool)
 * @param {number} opts.chamadoId
 * @param {number|null} opts.alteradoPor  user.id do criador (null = sistema/job)
 */
async function registrarCriacao({ client, chamadoId, alteradoPor }) {
  const c = client || pool;
  try {
    await c.query(
      `INSERT INTO historico_chamados
         (chamado_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
       VALUES ($1, 'criado', NULL, NULL, $2)`,
      [chamadoId, alteradoPor || null]
    );
  } catch (e) {
    // Audit log não bloqueia operação principal.
    console.error("[hist-chamados] registrarCriacao falhou:", e.message);
  }
}

/**
 * Compara antes/depois e insere uma linha por campo modificado.
 *
 * @param {object} opts
 * @param {object} [opts.client]
 * @param {number} opts.chamadoId
 * @param {object} opts.antes    snapshot pre-UPDATE
 * @param {object} opts.depois   linha pos-UPDATE
 * @param {number|null} opts.alteradoPor
 */
async function registrarMudancas({ client, chamadoId, antes, depois, alteradoPor }) {
  const c = client || pool;
  if (!antes || !depois) return;

  const linhas = [];
  for (const campo of CAMPOS_AUDITADOS) {
    const a = _norm(antes[campo]);
    const d = _norm(depois[campo]);
    if (a !== d) {
      linhas.push([chamadoId, campo, a, d, alteradoPor || null]);
    }
  }
  if (linhas.length === 0) return;

  try {
    // Multi-row insert via unnest pra um único round-trip.
    await c.query(
      `INSERT INTO historico_chamados
         (chamado_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
       SELECT * FROM UNNEST(
         $1::int[], $2::text[], $3::text[], $4::text[], $5::int[]
       )`,
      [
        linhas.map((l) => l[0]),
        linhas.map((l) => l[1]),
        linhas.map((l) => l[2]),
        linhas.map((l) => l[3]),
        linhas.map((l) => l[4]),
      ]
    );
  } catch (e) {
    console.error("[hist-chamados] registrarMudancas falhou:", e.message);
  }
}

module.exports = {
  CAMPOS_AUDITADOS,
  registrarCriacao,
  registrarMudancas,
};
