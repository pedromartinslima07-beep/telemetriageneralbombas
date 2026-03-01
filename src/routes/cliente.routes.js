// src/routes/cliente.routes.js
const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { clienteOnly } = require("../middleware/clienteOnly");

const router = express.Router();

// GET /cliente/status
router.get("/status", authRequired, clienteOnly, async (req, res) => {
  try {
    const condominioId = req.user.condominio_id;

    const condominioResult = await pool.query(
      "SELECT id, nome, device_id FROM condominios WHERE id = $1",
      [condominioId]
    );
    if (condominioResult.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }
    const condominio = condominioResult.rows[0];

    const leituraResult = await pool.query(
      "SELECT id, device_id, nivel, bomba_ligada, criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
      [condominio.device_id]
    );
    const ultimaLeitura = leituraResult.rows[0] || null;

    const alertasResult = await pool.query(
      "SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em FROM alertas WHERE device_id = $1 AND status = 'aberto' ORDER BY criado_em DESC",
      [condominio.device_id]
    );

    return res.json({
      condominio,
      ultima_leitura: ultimaLeitura,
      alertas_abertos: alertasResult.rows,
    });
  } catch (error) {
    console.error("Erro cliente/status:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// POST /cliente/trocar-senha
router.post("/trocar-senha", authRequired, clienteOnly, async (req, res) => {
  const { senha_atual, senha_nova } = req.body || {};

  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: "Campos: senha_atual, senha_nova" });
  }
  if (String(senha_nova).length < 6) {
    return res
      .status(400)
      .json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
  }

  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const u = result.rows[0];

    const ok = await bcrypt.compare(String(senha_atual), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual inválida" });
    }

    const novaHash = await bcrypt.hash(String(senha_nova), 10);

    await pool.query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [
      userId,
      novaHash,
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Erro /cliente/trocar-senha:", e);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

module.exports = { clienteRouter: router };