// src/services/chamados.service.js
//
// Abertura automática de chamados por jobs/rotas do sistema (offline.job,
// alertas de nível em /telemetria, etc). Centraliza a regra de dedup:
// nunca abre um 2º chamado pra mesma dupla condomínio+categoria enquanto
// já existir um aberto (status != 'fechado').

const { pool } = require("../db");
const { registrarCriacao, registrarMudancas } = require("./chamado-historico.service");

/**
 * Abre um chamado automático, evitando duplicar.
 *
 * Se já existir um chamado aberto (status != 'fechado') pro mesmo
 * condomínio+categoria, reaproveita esse chamado — e escalona a
 * prioridade dele caso o novo evento seja mais urgente (ex.: nível caiu
 * de "baixo" pra "muito_baixo" enquanto o chamado de nível ainda tá aberto).
 *
 * @param {object} opts
 * @param {number} opts.condominio_id
 * @param {string} opts.titulo
 * @param {string} opts.descricao
 * @param {string} opts.prioridade  'p1'..'p4' (p1 = mais urgente)
 * @param {string} opts.categoria
 * @returns {Promise<number>} id do chamado (novo ou já existente)
 */
async function abrirChamadoAuto({ condominio_id, titulo, descricao, prioridade, categoria }) {
  const existente = await pool.query(
    `SELECT id, prioridade FROM chamados
     WHERE condominio_id = $1 AND categoria = $2 AND status != 'fechado'
     LIMIT 1`,
    [condominio_id, categoria]
  );

  if (existente.rows.length > 0) {
    const atual = existente.rows[0];
    // 'p1'..'p4' comparam corretamente como string (mesmo prefixo, 1 dígito)
    if (prioridade < atual.prioridade) {
      await pool.query(`UPDATE chamados SET prioridade = $1 WHERE id = $2`, [prioridade, atual.id]);
      registrarMudancas({
        chamadoId: atual.id,
        antes: { prioridade: atual.prioridade },
        depois: { prioridade },
        alteradoPor: null,
      });
    }
    return atual.id;
  }

  const result = await pool.query(
    `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [condominio_id, titulo, descricao, prioridade, categoria]
  );
  // Audit log: criado automaticamente (alteradoPor=null = sistema)
  registrarCriacao({ chamadoId: result.rows[0].id, alteradoPor: null });
  return result.rows[0].id;
}

module.exports = { abrirChamadoAuto };
