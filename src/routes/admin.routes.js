// src/routes/admin.routes.js
const express = require("express");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

// GET /admin/status
router.get("/status", authRequired, adminOnly, async (req, res) => {
  try {
    const condominiosResult = await pool.query(
      "SELECT id, nome, device_id FROM condominios ORDER BY id ASC"
    );

    const condominios = condominiosResult.rows;
    const statusList = [];

    for (const c of condominios) {
      const ultimaLeituraResult = await pool.query(
        "SELECT id, device_id, nivel, bomba_ligada, criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
        [c.device_id]
      );
      const ultimaLeitura = ultimaLeituraResult.rows[0] || null;

      const alertasAbertosCountResult = await pool.query(
        "SELECT COUNT(*)::int AS total FROM alertas WHERE device_id = $1 AND status = 'aberto'",
        [c.device_id]
      );

      let minutos_sem_atualizar = null;
      let offline = true;

      if (ultimaLeitura) {
        const agora = new Date();
        const ultima = new Date(ultimaLeitura.criado_em);
        const diffMs = agora - ultima;
        minutos_sem_atualizar = Math.floor(diffMs / 60000);
        offline = minutos_sem_atualizar > 10;
      }

      statusList.push({
        condominio: c,
        ultima_leitura: ultimaLeitura,
        minutos_sem_atualizar,
        offline,
        alertas_abertos_count: alertasAbertosCountResult.rows[0].total,
      });
    }

    return res.json(statusList);
  } catch (error) {
    console.error("Erro ao buscar /admin/status:", error);
    return res.status(500).json({ error: "Erro ao buscar status geral" });
  }
});

module.exports = { adminRouter: router };