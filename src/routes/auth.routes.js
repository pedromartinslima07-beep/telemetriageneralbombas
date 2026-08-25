
const rateLimit = require("express-rate-limit");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../db");
const crypto = require("crypto");
const { sendOTP } = require("../services/email");

const TRUSTED_COOKIE = "td_token";
const isProd = process.env.NODE_ENV === "production";

const { authRequired } = require("../middleware/authRequired");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { MSG_INATIVO } = require("../middleware/clienteOnly");

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
 * Body: { nome, email, senha, role, condominio_id, tecnico_id }
 *   - role='cliente' exige condominio_id
 *   - role='tecnico' pode receber tecnico_id pra vincular a um cadastro
 *     existente (atualiza tecnicos.usuario_id); se omitido, cria registro
 *     novo em tecnicos com nome/email e vincula.
 */
router.post("/registrar", authRequired, masterAdminOnly, async (req, res) => {
  const { nome, email, senha, role, condominio_id, tecnico_id } = req.body || {};

  if (!nome || !email || !senha || !role) {
    return res.status(400).json({ error: "Campos: nome, email, senha, role" });
  }

  const emailNorm = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: "email inválido" });
  }

  if (String(senha).length < 6) {
    return res.status(400).json({ error: "senha deve ter no mínimo 6 caracteres" });
  }

  if (!["admin", "gerente", "operador", "cliente", "tecnico"].includes(role)) {
    return res.status(400).json({ error: "role deve ser 'admin', 'gerente', 'operador', 'cliente' ou 'tecnico'" });
  }

  if (role === "cliente" && !condominio_id) {
    return res.status(400).json({ error: "cliente precisa de condominio_id" });
  }

  const client = await pool.connect();
  try {
    if (role === "cliente") {
      const c = await client.query("SELECT id FROM condominios WHERE id = $1", [
        condominio_id,
      ]);
      if (c.rows.length === 0) {
        return res.status(400).json({ error: "condominio_id inválido" });
      }
    }

    // Pra role=tecnico, valida tecnico_id se passado.
    let tecnicoIdResolvido = null;
    if (role === "tecnico" && tecnico_id) {
      const tid = Number(tecnico_id);
      if (!Number.isInteger(tid) || tid <= 0) {
        return res.status(400).json({ error: "tecnico_id inválido" });
      }
      const t = await client.query(
        "SELECT id, usuario_id FROM tecnicos WHERE id = $1 AND ativo = true",
        [tid]
      );
      if (t.rows.length === 0) {
        return res.status(400).json({ error: "tecnico_id inválido ou inativo" });
      }
      if (t.rows[0].usuario_id) {
        return res.status(409).json({ error: "Este técnico já tem um usuário vinculado" });
      }
      tecnicoIdResolvido = tid;
    }

    const senha_hash = await bcrypt.hash(String(senha), 10);

    await client.query("BEGIN");

    const result = await client.query(
      `
      INSERT INTO usuarios (nome, email, senha_hash, role, condominio_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, nome, email, role, condominio_id, criado_em
      `,
      [
        nome,
        emailNorm,
        senha_hash,
        role,
        role === "cliente" ? condominio_id : null,
      ]
    );

    const usuario = result.rows[0];

    if (role === "tecnico") {
      if (tecnicoIdResolvido) {
        await client.query(
          "UPDATE tecnicos SET usuario_id = $1 WHERE id = $2",
          [usuario.id, tecnicoIdResolvido]
        );
      } else {
        // Cria registro novo em tecnicos vinculado a esse usuário.
        const novo = await client.query(
          `INSERT INTO tecnicos (nome, email, usuario_id)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [nome, emailNorm, usuario.id]
        );
        tecnicoIdResolvido = novo.rows[0].id;
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      ...usuario,
      tecnico_id: tecnicoIdResolvido,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Email já cadastrado" });
    }
    console.error("Erro /auth/registrar:", error);
    return res.status(500).json({ error: "Erro ao registrar" });
  } finally {
    client.release();
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

    // Cliente de condomínio encerrado para aqui.
    //
    // ⚠️ Tem que ser ANTES do atalho de dispositivo confiável — senão quem já
    // marcou "lembrar deste dispositivo" pula direto pro JWT e a revogação não
    // vale nada. Vir antes do OTP também evita mandar e-mail de código pra
    // alguém que não vai conseguir entrar.
    if (u.role === "cliente") {
      const bloqueio = await _bloqueioDeCliente(u.condominio_id);
      if (bloqueio) return res.status(403).json({ error: bloqueio });
    }

    // Verifica dispositivo confiável — cookie (web) ou body (app mobile Capacitor)
    const deviceToken = req.cookies?.[TRUSTED_COOKIE] || req.body?.device_token;
    if (deviceToken) {
      const td = await pool.query(
        "SELECT id FROM trusted_devices WHERE token = $1 AND usuario_id = $2 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
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

    // 2FA desativado via env — só em dev
    if (!isProd && process.env.OTP_DISABLED?.trim() === "true") {
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
 * POST /auth/codigo
 * Body: { email }
 * Resposta: { pending: true, otp_token }  — ou { token, user } se o aparelho
 * já for confiável.
 *
 * ⚠️ ENTRADA SEM SENHA, E SÓ PARA `cliente` (25/08/2026).
 * O síndico não tem senha: quem cria o usuário é o escritório, no admin, com
 * o e-mail dele. A partir daí o e-mail É a credencial — este endpoint manda o
 * código de 6 dígitos e o segundo passo é o MESMO `/auth/verify-otp` de
 * sempre, porque o `otp_token` emitido aqui é idêntico ao que o login com
 * senha emite. Nada de fluxo paralelo para manter.
 *
 * ⚠️ Usuário interno NÃO passa por aqui. Se passasse, este endpoint seria um
 * atalho que dispensa a senha do admin — quem tem senha continua obrigado a
 * digitá-la.
 *
 * ⚠️ A RESPOSTA É NEUTRA de propósito: e-mail que não existe (ou que não é de
 * cliente) recebe o mesmo `{ pending: true }`, com um `otp_token` que aponta
 * para ninguém. O código digitado depois nunca vai casar e a resposta é
 * "Código inválido ou expirado" — a mesma de um código errado. Sem isso, o
 * endpoint vira um verificador de quais e-mails estão cadastrados.
 */
router.post("/codigo", loginLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Informe o e-mail" });

  try {
    const r = await pool.query(
      `SELECT id, nome, email, role, condominio_id
         FROM usuarios
        WHERE email = $1 AND role = 'cliente'
        LIMIT 1`,
      [email]
    );
    const u = r.rows[0];

    if (u) {
      // Condomínio encerrado para aqui, com o motivo — quem está nessa
      // situação precisa saber por que não entra, e a informação não vaza
      // nada que o próprio cliente já não saiba.
      const bloqueio = await _bloqueioDeCliente(u.condominio_id);
      if (bloqueio) return res.status(403).json({ error: bloqueio });

      // Aparelho confiável: mesmo atalho do login com senha. O cookie é
      // httpOnly e amarrado a este usuário — não serve para entrar em outra
      // conta digitando outro e-mail.
      const deviceToken = req.cookies?.[TRUSTED_COOKIE] || req.body?.device_token;
      if (deviceToken) {
        const td = await pool.query(
          "SELECT id FROM trusted_devices WHERE token = $1 AND usuario_id = $2 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
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

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await pool.query("DELETE FROM login_codes WHERE usuario_id = $1", [u.id]);
      await pool.query(
        "INSERT INTO login_codes (usuario_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
        [u.id, code]
      );
      // ⚠️ FALLBACK SÓ DE DESENVOLVIMENTO. Sem `RESEND_API_KEY` o envio lança
      // e o fluxo trava — e é exatamente o ambiente local, onde não há chave,
      // que precisa ser testável de ponta a ponta. Aqui o código vai para o
      // console em vez do e-mail. As duas guardas são obrigatórias: em
      // produção sem chave, o certo continua sendo estourar, porque um código
      // que ninguém recebe é uma porta que não abre.
      if (!isProd && !process.env.RESEND_API_KEY) {
        console.log(`[auth] DEV — código de ${u.email}: ${code}`);
      } else {
        await sendOTP(u.email, code);
      }
    }

    // `id: null` quando não há usuário — ver a nota de resposta neutra acima.
    const otp_token = jwt.sign(
      { id: u ? u.id : null, type: "otp_pending" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );
    return res.json({ pending: true, otp_token });
  } catch (error) {
    console.error("Erro /auth/codigo:", error);
    return res.status(500).json({ error: "Erro ao enviar o código" });
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

    // Recheca: o condomínio pode ter sido encerrado nos 15 min de validade do
    // otp_token, entre o passo da senha e o do código.
    if (u.role === "cliente") {
      const bloqueio = await _bloqueioDeCliente(u.condominio_id);
      if (bloqueio) return res.status(403).json({ error: bloqueio });
    }

    const token = jwt.sign(
      { id: u.id, role: u.role, condominio_id: u.condominio_id, email: u.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Salva dispositivo confiável se solicitado — validade indefinida
    let deviceTokenOut = undefined;
    if (confiar) {
      const deviceToken = crypto.randomBytes(32).toString("hex");
      const nomeDisp = req.body?.nome_dispositivo
        || _nomePeloUA(req.headers["user-agent"] || "");
      await pool.query(
        "INSERT INTO trusted_devices (usuario_id, token, expires_at, nome) VALUES ($1, $2, NULL, $3)",
        [u.id, deviceToken, nomeDisp]
      );
      // Cookie para web
      res.cookie(TRUSTED_COOKIE, deviceToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000, // 10 anos (indefinido na prática)
      });
      deviceTokenOut = deviceToken;
    }

    return res.json({
      token,
      user: { id: u.id, nome: u.nome, email: u.email, role: u.role, condominio_id: u.condominio_id },
      ...(deviceTokenOut ? { device_token: deviceTokenOut } : {}),
    });
  } catch (error) {
    console.error("Erro /auth/verify-otp:", error);
    return res.status(500).json({ error: "Erro ao verificar código" });
  }
});

/**
 * GET /auth/me  — usado pelo app pra validar JWT salvo e obter dados frescos
 */
router.get("/me", authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role, u.condominio_id,
              t.id AS tecnico_id, t.foto_url, t.especialidade, t.telefone AS tecnico_telefone
       FROM usuarios u
       LEFT JOIN tecnicos t ON t.usuario_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("Erro GET /auth/me:", err);
    return res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

/**
 * POST /auth/trocar-senha  (qualquer usuário logado)
 * Body: { senha_atual, senha_nova }
 */
router.post("/trocar-senha", authRequired, async (req, res) => {
  const { senha_atual, senha_nova } = req.body || {};
  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: "Campos: senha_atual, senha_nova" });
  }
  if (String(senha_nova).length < 6) {
    return res.status(400).json({ error: "Senha nova deve ter no mínimo 6 caracteres" });
  }
  if (senha_atual === senha_nova) {
    return res.status(400).json({ error: "A senha nova deve ser diferente da atual" });
  }

  try {
    const r = await pool.query("SELECT senha_hash FROM usuarios WHERE id = $1 LIMIT 1", [req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });

    const ok = await bcrypt.compare(String(senha_atual), r.rows[0].senha_hash);
    if (!ok) return res.status(401).json({ error: "Senha atual incorreta" });

    const hash = await bcrypt.hash(String(senha_nova), 10);
    await pool.query("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [hash, req.user.id]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro /auth/trocar-senha:", err);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

/**
 * GET /auth/dispositivos  (qualquer usuário logado)
 * Lista os dispositivos confiáveis do próprio usuário.
 */
router.get("/dispositivos", authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nome, criado_em,
              (token = $2) AS atual
       FROM trusted_devices
       WHERE usuario_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY criado_em DESC`,
      [req.user.id, req.cookies?.[TRUSTED_COOKIE] || ""]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("Erro GET /auth/dispositivos:", err);
    return res.status(500).json({ error: "Erro ao listar dispositivos" });
  }
});

/**
 * DELETE /auth/dispositivos/:id  — revoga um dispositivo específico
 */
router.delete("/dispositivos/:id", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    const r = await pool.query(
      "DELETE FROM trusted_devices WHERE id = $1 AND usuario_id = $2",
      [id, req.user.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Dispositivo não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro DELETE /auth/dispositivos:", err);
    return res.status(500).json({ error: "Erro ao revogar dispositivo" });
  }
});

/**
 * DELETE /auth/dispositivos  — revoga todos os dispositivos do usuário
 */
router.delete("/dispositivos", authRequired, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM trusted_devices WHERE usuario_id = $1", [req.user.id]);
    res.clearCookie(TRUSTED_COOKIE);
    return res.json({ ok: true, revogados: r.rowCount });
  } catch (err) {
    console.error("Erro DELETE /auth/dispositivos (todos):", err);
    return res.status(500).json({ error: "Erro ao revogar dispositivos" });
  }
});

// Motivo pelo qual este cliente não pode entrar, ou null se pode.
// Os dois JWTs de sessão (login com dispositivo confiável e verify-otp) passam
// por aqui; a mesma regra é reaplicada a cada request em `clienteOnly`.
async function _bloqueioDeCliente(condominioId) {
  const id = Number(condominioId);
  if (!id) {
    return "Seu usuário não está vinculado a nenhum condomínio. Fale com a administradora.";
  }
  const r = await pool.query(
    "SELECT ativo FROM condominios WHERE id = $1 LIMIT 1",
    [id]
  );
  if (r.rows.length === 0 || r.rows[0].ativo === false) {
    return MSG_INATIVO;
  }
  return null;
}

// Extrai nome legível do dispositivo a partir do User-Agent
function _nomePeloUA(ua) {
  if (!ua) return "Dispositivo desconhecido";
  if (/android/i.test(ua))  return "Android";
  if (/iphone/i.test(ua))   return "iPhone";
  if (/ipad/i.test(ua))     return "iPad";
  if (/chrome/i.test(ua))   return "Chrome";
  if (/firefox/i.test(ua))  return "Firefox";
  if (/safari/i.test(ua))   return "Safari";
  return "Navegador";
}

module.exports = { authRouter: router };