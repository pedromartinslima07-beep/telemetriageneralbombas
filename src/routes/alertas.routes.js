// src/routes/alertas.routes.js
const express = require("express");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

/**
 * GET /alertas-abertos  (admin only)
 */
router.get("/alertas-abertos", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em
      FROM alertas
      WHERE status = 'aberto'
      ORDER BY criado_em DESC
      LIMIT 500
      `
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar alertas abertos (geral):", error);
    return res.status(500).json({ error: "Erro ao buscar alertas abertos" });
  }
});

/**
 * PATCH /alertas/:id/fechar  (admin only)
 */
router.patch("/alertas/:id/fechar", authRequired, adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      UPDATE alertas
      SET status = 'resolvido', atualizado_em = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Alerta não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao fechar alerta:", error);
    return res.status(500).json({ error: "Erro ao fechar alerta" });
  }
});

/**
 * GET /alertas/:device_id  (admin only)
 */
router.get("/alertas/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em
      FROM alertas
      WHERE device_id = $1
      ORDER BY criado_em DESC
      LIMIT 200
      `,
      [device_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar alertas:", error);
    return res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

module.exports = { alertasRouter: router };