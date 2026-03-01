
const rateLimit = require("express-rate-limit");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { clienteOnly } = require("../middleware/clienteOnly"); // se você tiver separado; se não tiver, eu te digo abaixo

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,                  // 20 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

/**
 * POST /auth/registrar  (admin only)
 * Body: { nome, email, senha, role, condominio_id }
 */
router.post("/registrar", authRequired, adminOnly, async (req, res) => {
  const { nome, email, senha, role, condominio_id } = req.body || {};

  if (!nome || !email || !senha || !role) {
    return res.status(400).json({ error: "Campos: nome, email, senha, role" });
  }

  if (!["admin", "cliente"].includes(role)) {
    return res.status(400).json({ error: "role deve ser 'admin' ou 'cliente'" });
  }

  if (role === "cliente" && !condominio_id) {
    return res.status(400).json({ error: "cliente precisa de condominio_id" });
  }

  try {
    if (role === "cliente") {
      const c = await pool.query("SELECT id FROM condominios WHERE id = $1", [
        condominio_id,
      ]);
      if (c.rows.length === 0) {
        return res.status(400).json({ error: "condominio_id inválido" });
      }
    }

    const senha_hash = await bcrypt.hash(String(senha), 10);

    const result = await pool.query(
      `
      INSERT INTO usuarios (nome, email, senha_hash, role, condominio_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, nome, email, role, condominio_id, criado_em
      `,
      [
        nome,
        String(email).toLowerCase(),
        senha_hash,
        role,
        role === "cliente" ? condominio_id : null,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro /auth/registrar:", error);
    return res.status(500).json({ error: "Erro ao registrar (email pode já existir)" });
  }
});

/**
 * POST /auth/login
 * Body: { email, senha }
 */
router.post("/login", loginLimiter, async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: "Campos: email, senha" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, nome, email, senha_hash, role, condominio_id
      FROM usuarios
      WHERE email = $1
      LIMIT 1
      `,
      [String(email).toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Email ou senha inválidos" });
    }

    const u = result.rows[0];
    const ok = await bcrypt.compare(String(senha), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Email ou senha inválidos" });
    }

    const token = jwt.sign(
      { id: u.id, role: u.role, condominio_id: u.condominio_id, email: u.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      user: {
        id: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        condominio_id: u.condominio_id,
      },
    });
  } catch (error) {
    console.error("Erro /auth/login:", error);
    return res.status(500).json({ error: "Erro no login" });
  }
});

/**
 * PATCH /cliente/senha  (cliente only)
 * Body: { senha_atual, nova_senha }
 *
 * OBS: No seu server.js isso existe. Estou mantendo igual.
 */
router.patch("/cliente/senha", authRequired, clienteOnly, async (req, res) => {
  const { senha_atual, nova_senha } = req.body || {};

  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ error: "Campos: senha_atual, nova_senha" });
  }

  if (String(nova_senha).length < 6) {
    return res.status(400).json({ error: "nova_senha deve ter no mínimo 6 caracteres" });
  }

  try {
    const uRes = await pool.query(
      "SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
      [req.user.id]
    );

    if (uRes.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const u = uRes.rows[0];
    const ok = await bcrypt.compare(String(senha_atual), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    const novoHash = await bcrypt.hash(String(nova_senha), 10);
    await pool.query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [
      req.user.id,
      novoHash,
    ]);

    return res.json({ ok: true, message: "Senha atualizada com sucesso" });
  } catch (error) {
    console.error("Erro ao trocar senha (cliente):", error);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

module.exports = { authRouter: router };