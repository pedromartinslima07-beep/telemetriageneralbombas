// src/routes/status.routes.js
const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

router.get("/status/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;
  try {
    const condominioResult = await pool.query(
      "SELECT id, nome, device_id FROM condominios WHERE device_id = $1",
      [device_id]
    );
    if (condominioResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Condomínio/Dispositivo não encontrado" });
    }
    const condominio = condominioResult.rows[0];

    const ultimaLeituraResult = await pool.query(
      "SELECT id, device_id, nivel, bomba_ligada, criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
      [device_id]
    );
    const ultima_leitura = ultimaLeituraResult.rows[0] || null;

    const alertasAbertosResult = await pool.query(
      "SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em FROM alertas WHERE device_id = $1 AND status = 'aberto' ORDER BY criado_em DESC",
      [device_id]
    );

    return res.json({
      condominio,
      ultima_leitura,
      alertas_abertos: alertasAbertosResult.rows,
    });
  } catch (error) {
    console.error("Erro ao buscar status:", error);
    return res.status(500).json({ error: "Erro ao buscar status" });
  }
});

module.exports = { statusRouter: router };