const { pool } = require("../db");

async function upsertAlertaAberto(device_id, tipo, mensagem) {
  const tipoNorm = String(tipo).toLowerCase().trim();

  // Operação atômica usando o partial unique index uniq_alerta_aberto
  // (device_id, tipo) WHERE status = 'aberto'
  const result = await pool.query(
    `INSERT INTO alertas (device_id, tipo, mensagem, status, atualizado_em)
     VALUES ($1, $2, $3, 'aberto', NOW())
     ON CONFLICT (device_id, tipo) WHERE status = 'aberto'
     DO UPDATE SET mensagem = EXCLUDED.mensagem, atualizado_em = NOW()
     RETURNING id, (xmax = 0) AS inserted`,
    [device_id, tipoNorm, mensagem]
  );

  const row = result.rows[0];
  return { action: row.inserted ? "inserted" : "updated", id: row.id };
}

module.exports = { upsertAlertaAberto };