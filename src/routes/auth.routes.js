
const rateLimit = require("express-rate-limit");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../db");
const crypto = require("crypto");
const { sendOTP } = require("../services/email");

const TRUSTED_DEVICE_DAYS = 30;
const TRUSTED_COOKIE = "td_token";
const isProd = process.env.NODE_ENV === "production";

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { clienteOnly } = require("../middleware/clienteOnly"); // se você tiver separado; se não tiver, eu te digo abaixo

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 tentativas de código por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

/**
 * POST /auth/registrar  (admin only)
 * Body: { nome, email, senha, role, condominio_id }
 */
router.post("/registrar", authRequired, masterAdminOnly, async (req, res) => {
  const { nome, email, senha, role, condominio_id } = req.body || {};

  if (!nome || !email || !senha || !role) {
    return res.status(400).json({ error: "Campos: nome, email, senha, role" });
  }

  if (!["admin", "admin_viewer", "cliente"].includes(role)) {
    return res.status(400).json({ error: "role deve ser 'admin', 'admin_viewer' ou 'cliente'" });
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
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Email já cadastrado" });
    }
    console.error("Erro /auth/registrar:", error);
    return res.status(500).json({ error: "Erro ao registrar" });
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

    // Verifica dispositivo confiável (cookie)
    const deviceToken = req.cookies?.[TRUSTED_COOKIE];
    if (deviceToken) {
      const td = await pool.query(
        "SELECT id FROM trusted_devices WHERE token = $1 AND usuario_id = $2 AND expires_at > NOW() LIMIT 1",
        [deviceToken, u.id]
      );
      if (td.rows.length > 0) {
        const token = jwt.sign(
          { id: u.id, role: u.role, condominio_id: u.condominio_id, email: u.email },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        return res.json({
          token,
          user: { id: u.id, nome: u.nome, email: u.email, role: u.role, condominio_id: u.condominio_id },
        });
      }
    }

    // 2FA desativado via env (útil em dev)
    if (process.env.OTP_DISABLED === "true") {
      const token = jwt.sign(
        { id: u.id, role: u.role, condominio_id: u.condominio_id, email: u.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      return res.json({
        token,
        user: { id: u.id, nome: u.nome, email: u.email, role: u.role, condominio_id: u.condominio_id },
      });
    }

    // Gera código de 6 dígitos e salva no banco
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await pool.query("DELETE FROM login_codes WHERE usuario_id = $1", [u.id]);
    await pool.query(
      "INSERT INTO login_codes (usuario_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [u.id, code]
    );

    // Envia email com o código
    await sendOTP(u.email, code);

    // Retorna token temporário (15 min) — não é o JWT de sessão
    const otp_token = jwt.sign(
      { id: u.id, type: "otp_pending" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.json({ pending: true, otp_token });
  } catch (error) {
    console.error("Erro /auth/login:", error);
    return res.status(500).json({ error: "Erro no login" });
  }
});

/**
 * POST /auth/verify-otp
 * Body: { otp_token, code }
 */
router.post("/verify-otp", otpLimiter, async (req, res) => {
  const { otp_token, code, confiar } = req.body || {};
  if (!otp_token || !code) {
    return res.status(400).json({ error: "Campos: otp_token, code" });
  }

  let payload;
  try {
    payload = jwt.verify(otp_token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Token expirado ou inválido. Faça login novamente." });
  }

  if (payload.type !== "otp_pending") {
    return res.status(401).json({ error: "Token inválido." });
  }

  try {
    const codeRes = await pool.query(
      `SELECT id FROM login_codes
       WHERE usuario_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [payload.id, String(code).trim()]
    );

    if (codeRes.rows.length === 0) {
      return res.status(401).json({ error: "Código inválido ou expirado." });
    }

    // Marca como usado
    await pool.query("UPDATE login_codes SET used = TRUE WHERE id = $1", [codeRes.rows[0].id]);

    // Busca dados do usuário para emitir o JWT de sessão
    const uRes = await pool.query(
      "SELECT id, nome, email, role, condominio_id FROM usuarios WHERE id = $1 LIMIT 1",
      [payload.id]
    );
    const u = uRes.rows[0];

    const token = jwt.sign(
      { id: u.id, role: u.role, condominio_id: u.condominio_id, email: u.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Salva dispositivo confiável se solicitado
    if (confiar) {
      const deviceToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
      await pool.query(
        "INSERT INTO trusted_devices (usuario_id, token, expires_at) VALUES ($1, $2, $3)",
        [u.id, deviceToken, expiresAt]
      );
      res.cookie(TRUSTED_COOKIE, deviceToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        expires: expiresAt,
      });
    }

    return res.json({
      token,
      user: { id: u.id, nome: u.nome, email: u.email, role: u.role, condominio_id: u.condominio_id },
    });
  } catch (error) {
    console.error("Erro /auth/verify-otp:", error);
    return res.status(500).json({ error: "Erro ao verificar código" });
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