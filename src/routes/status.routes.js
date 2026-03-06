// src/routes/status.routes.js
const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();
const OFFLINE_MINUTES = Number(process.env.OFFLINE_MINUTES || 10);

// GET /status/:device_id  (montado com prefixo no app.js)
router.get("/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;

  try {
    // 1) Busca reservatório pelo device_id
    const r = await pool.query(
      `
      SELECT id, condominio_id, nome, tipo, device_id, last_seen
      FROM reservatorios
      WHERE device_id = $1
      LIMIT 1
      `,
      [device_id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Reservatório/Dispositivo não encontrado" });
    }

    const reservatorio = r.rows[0];

    // 2) Última leitura (tabela leituras atual usa criado_em)
    const l = await pool.query(
      `
      SELECT id, device_id, nivel, bomba_ligada, criado_em
      FROM leituras
      WHERE device_id = $1
      ORDER BY criado_em DESC
      LIMIT 1
      `,
      [device_id]
    );

    const ultima_leitura = l.rows[0] || null;

    // 3) Alerta aberto mais recente (status no schema atual é 'aberto'/'resolvido')
    const a = await pool.query(
      `
      SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em
      FROM alertas
      WHERE device_id = $1 AND status = 'aberto'
      ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC
      LIMIT 1
      `,
      [device_id]
    );

    const alerta_aberto = a.rows[0] || null;

    // 4) lastSeen (usa last_seen se existir; senão usa última leitura)
    const lastSeen =
      reservatorio.last_seen || (ultima_leitura ? ultima_leitura.criado_em : null);

    // 5) Calcula offline
    let offline = true;
    let offline_minutes = null;

    if (lastSeen) {
      const diffMs = Date.now() - new Date(lastSeen).getTime();
      offline_minutes = Math.floor(diffMs / 60000);
      offline = offline_minutes >= OFFLINE_MINUTES;
    }

    return res.json({
      reservatorio,
      ultima_leitura,
      alerta_aberto,
      last_seen: lastSeen,
      offline,
      offline_minutes,
      offline_threshold_minutes: OFFLINE_MINUTES,
    });
  } catch (error) {
    console.error("Erro ao buscar status:", error);
    return res.status(500).json({ error: "Erro ao buscar status" });
  }
});

module.exports = { statusRouter: router };