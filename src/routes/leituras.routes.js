// src/routes/leituras.routes.js
const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

router.get("/ultima-leitura/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, device_id, nivel, bomba_ligada, criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
      [device_id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Nenhuma leitura encontrada" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao buscar última leitura:", error);
    return res.status(500).json({ error: "Erro ao buscar última leitura" });
  }
});

module.exports = { leiturasRouter: router };