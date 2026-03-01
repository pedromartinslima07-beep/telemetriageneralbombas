// src/routes/condominios.routes.js
const express = require("express");
const crypto = require("crypto");

const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

/**
 * POST /condominios/:id/regenerar-device-key
 * Regera a device_key do condomínio (admin only)
 */
router.post("/:id/regenerar-device-key", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const novaChave = crypto.randomBytes(24).toString("hex");

  try {
    const result = await pool.query(
      `
      UPDATE condominios
      SET device_key = $2
      WHERE id = $1
      RETURNING id, nome, device_id, device_key
      `,
      [idNum, novaChave]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    return res.json({
      ok: true,
      message: "Device key regenerada com sucesso. Atualize o dispositivo com a nova chave.",
      condominio: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao regenerar device_key:", error);
    return res.status(500).json({ error: "Erro ao regenerar device_key" });
  }
});

module.exports = { condominiosRouter: router };