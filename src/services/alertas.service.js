const { pool } = require("../db");

async function upsertAlertaAberto(device_id, tipo, mensagem) {
  const tipoNorm = String(tipo).toLowerCase().trim();

  const upd = await pool.query(
    "UPDATE alertas SET mensagem = $3, atualizado_em = NOW() WHERE device_id = $1 AND TRIM(LOWER(tipo)) = $2 AND TRIM(LOWER(status)) = 'aberto' RETURNING id",
    [device_id, tipoNorm, mensagem]
  );
  if (upd.rows.length > 0) return { action: "updated", id: upd.rows[0].id };

  try {
    const ins = await pool.query(
      "INSERT INTO alertas (device_id, tipo, mensagem, status, atualizado_em) VALUES ($1, $2, $3, 'aberto', NOW()) RETURNING id",
      [device_id, tipoNorm, mensagem]
    );
    return { action: "inserted", id: ins.rows[0].id };
  } catch (e) {
    if (e && e.code === "23505") {
      const upd2 = await pool.query(
        "UPDATE alertas SET mensagem = $3, atualizado_em = NOW() WHERE device_id = $1 AND TRIM(LOWER(tipo)) = $2 AND TRIM(LOWER(status)) = 'aberto' RETURNING id",
        [device_id, tipoNorm, mensagem]
      );
      if (upd2.rows.length > 0)
        return { action: "updated_after_conflict", id: upd2.rows[0].id };
    }
    throw e;
  }
}

module.exports = { upsertAlertaAberto };