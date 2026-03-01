require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const JWT_SECRET = process.env.JWT_SECRET; // <-- OBRIGATÓRIO via .env
const JWT_EXPIRES_IN = "7d";

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET não definido. Configure no .env (ex: JWT_SECRET=uma_chave_forte)");
  process.exit(1);
}

const app = express();

// ✅ CORS: deixe restrito. Para dev local, pode permitir localhost.
app.use(cors({
  origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
}));
app.use(express.json());
app.use("/static", express.static("public"));

/* =========================
   AUTH MIDDLEWARES
========================= */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token ausente" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // {id, role, condominio_id, email}
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito (admin)" });
  }
  next();
}

function clienteOnly(req, res, next) {
  if (req.user?.role !== "cliente") {
    return res.status(403).json({ error: "Acesso restrito (cliente)" });
  }
  next();
}

/* =========================
   PÁGINAS (front controla acesso via JS)
   Obs: GET /admin/painel NÃO pode exigir Authorization header
   porque navegação do browser não manda header. Então mantemos público
   e os endpoints de dados seguem protegidos.
========================= */
app.get("/", (req, res) => res.send("Servidor rodando 🚀"));

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});

app.get("/admin/painel", (req, res) => {
  res.sendFile(__dirname + "/public/admin.html");
});

app.get("/cliente/painel", (req, res) => {
  res.sendFile(__dirname + "/public/cliente.html");
});

/* =========================
   ALERTAS (ANTI DUPLICAÇÃO)
========================= */
async function upsertAlertaAberto(device_id, tipo, mensagem) {
  const tipoNorm = String(tipo).toLowerCase().trim();

  const upd = await pool.query(
    "UPDATE alertas SET mensagem = $3, atualizado_em = NOW() WHERE device_id = $1 AND TRIM(LOWER(tipo)) = $2 AND TRIM(LOWER(status)) = 'aberto' RETURNING id",
    [device_id, tipoNorm, mensagem]
  );
  if (upd.rows.length > 0) return { action: "updated", id: upd.rows[0].id };

  try {
    const ins = await pool.query(
      "INSERT INTO alertas (device_id, tipo, mensagem, status, atualizado_em) VALUES ($1, $2, $3, 'aberto', NOW()) RETURNING id",
      [device_id, tipoNorm, mensagem]
    );
    return { action: "inserted", id: ins.rows[0].id };
  } catch (e) {
    if (e && e.code === "23505") {
      const upd2 = await pool.query(
        "UPDATE alertas SET mensagem = $3, atualizado_em = NOW() WHERE device_id = $1 AND TRIM(LOWER(tipo)) = $2 AND TRIM(LOWER(status)) = 'aberto' RETURNING id",
        [device_id, tipoNorm, mensagem]
      );
      if (upd2.rows.length > 0) return { action: "updated_after_conflict", id: upd2.rows[0].id };
    }
    throw e;
  }
}

/* =========================
   CLIENTE (SÓ O DELE)
========================= */
app.get("/cliente/status", authRequired, clienteOnly, async (req, res) => {
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

    res.json({
      condominio,
      ultima_leitura: ultimaLeitura,
      alertas_abertos: alertasResult.rows,
    });
  } catch (error) {
    console.error("Erro cliente/status:", error);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.post("/cliente/trocar-senha", authRequired, clienteOnly, async (req, res) => {
  const { senha_atual, senha_nova } = req.body || {};

  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: "Campos: senha_atual, senha_nova" });
  }
  if (String(senha_nova).length < 6) {
    return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
  }

  try {
    // pega o usuário logado
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const u = result.rows[0];

    // confere senha atual
    const ok = await bcrypt.compare(String(senha_atual), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual inválida" });
    }

    // atualiza senha
    const novaHash = await bcrypt.hash(String(senha_nova), 10);

    await pool.query(
      "UPDATE usuarios SET senha_hash = $2 WHERE id = $1",
      [userId, novaHash]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("Erro /cliente/trocar-senha:", e);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

/* =========================
   ADMIN - CONDOMÍNIOS (PROTEGIDO)
========================= */
app.post("/condominios", authRequired, adminOnly, async (req, res) => {
  const {
    nome, device_id, endereco, bairro, cidade, uf,
    responsavel, telefone, observacoes, ativo
  } = req.body;

  if (!nome || !device_id) {
    return res.status(400).json({ error: "Campos obrigatórios: nome, device_id" });
  }

  const ufNorm = uf ? String(uf).trim().toUpperCase().slice(0, 2) : null;
  const ativoNorm = (ativo === undefined || ativo === null) ? true : !!ativo;
  const deviceKeyGerada = crypto.randomBytes(24).toString("hex");

  try {
    const result = await pool.query(
      `INSERT INTO condominios
        (nome, device_id, endereco, bairro, cidade, uf, responsavel, telefone, observacoes, ativo, device_key)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING
        id, nome, device_id, device_key, endereco, bairro, cidade, uf,
        responsavel, telefone, observacoes, ativo, criado_em, device_key`,
      [
        nome,
        device_id,
        endereco ?? null,
        bairro ?? null,
        cidade ?? null,
        ufNorm,
        responsavel ?? null,
        telefone ?? null,
        observacoes ?? null,
        ativoNorm,
        deviceKeyGerada, 
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar condomínio:", error);
    if (error && error.code === "23505") {
      return res.status(409).json({ error: "Device ID já cadastrado" });
    }
    return res.status(500).json({ error: "Erro ao criar condomínio" });
  }
});

app.get("/condominios", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id, nome, device_id, device_key, endereco, bairro, cidade, uf,
        responsavel, telefone, observacoes, ativo, criado_em
       FROM condominios
       ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar condomínios:", error);
    res.status(500).json({ error: "Erro ao listar condomínios" });
  }
});

app.get("/condominios/:id", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const result = await pool.query(
      `SELECT id, nome, device_id, endereco, bairro, cidade, uf,
              responsavel, telefone, observacoes, ativo, criado_em
       FROM condominios WHERE id = $1 LIMIT 1`,
      [idNum]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Condomínio não encontrado" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao buscar condomínio:", error);
    return res.status(500).json({ error: "Erro ao buscar condomínio" });
  }
});

app.patch("/condominios/:id", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) return res.status(400).json({ error: "id inválido" });

  const b = req.body || {};

  const ufNorm =
    ("uf" in b)
      ? (b.uf ? String(b.uf).trim().toUpperCase().slice(0, 2) : null)
      : undefined;

  const ativoNorm =
    ("ativo" in b)
      ? (b.ativo === null ? null : !!b.ativo)
      : undefined;

  const sets = [];
  const values = [idNum];
  let i = 2;

  const add = (col, val) => {
    if (val === null) { sets.push(`${col} = NULL`); return; }
    if (val === undefined) return;
    sets.push(`${col} = $${i}`);
    values.push(val);
    i++;
  };

  add("nome", b.nome);
  add("device_id", b.device_id);
  add("endereco", b.endereco);
  add("bairro", b.bairro);
  add("cidade", b.cidade);
  add("uf", ufNorm);
  add("responsavel", b.responsavel);
  add("telefone", b.telefone);
  add("observacoes", b.observacoes);
  add("ativo", ativoNorm);

  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const result = await pool.query(
      `UPDATE condominios SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, nome, device_id, endereco, bairro, cidade, uf,
                 responsavel, telefone, observacoes, ativo, criado_em`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Condomínio não encontrado" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar condomínio:", error);
    if (error && error.code === "23505") return res.status(409).json({ error: "Device ID já cadastrado" });
    return res.status(500).json({ error: "Erro ao atualizar condomínio" });
  }
});

app.post("/condominios/:id/regenerar-device-key", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  // gera uma chave nova forte
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

    // ✅ retorna a chave nova (copie e guarde; ideal não ficar exibindo sempre depois)
    return res.json({
      ok: true,
      message: "Device key regenerada com sucesso. Atualize o ESP com a nova chave.",
      condominio: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao regenerar device_key:", error);
    return res.status(500).json({ error: "Erro ao regenerar device_key" });
  }
});

/* =========================
   ADMIN - ALERTAS / STATUS (PROTEGIDO)
========================= */
app.get("/alertas-abertos", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em FROM alertas WHERE status = 'aberto' ORDER BY criado_em DESC LIMIT 500"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar alertas abertos (geral):", error);
    res.status(500).json({ error: "Erro ao buscar alertas abertos" });
  }
});

app.patch("/alertas/:id/fechar", authRequired, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE alertas SET status = 'resolvido', atualizado_em = NOW() WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Alerta não encontrado" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao fechar alerta:", error);
    res.status(500).json({ error: "Erro ao fechar alerta" });
  }
});

app.get("/admin/status", authRequired, adminOnly, async (req, res) => {
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

    res.json(statusList);
  } catch (error) {
    console.error("Erro ao buscar /admin/status:", error);
    res.status(500).json({ error: "Erro ao buscar status geral" });
  }
});

async function jobVerificarOffline() {
  const condominiosResult = await pool.query(
    "SELECT id, nome, device_id FROM condominios ORDER BY id ASC"
  );

  const condominios = condominiosResult.rows;

  const limiteMinutos = 10; // regra MVP
  const agora = new Date();

  let criados = 0;
  let ja_existia = 0;
  let ignorados_sem_leitura = 0;

  for (const c of condominios) {
    const ultimaLeituraResult = await pool.query(
      "SELECT criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
      [c.device_id]
    );

    if (ultimaLeituraResult.rows.length === 0) {
      ignorados_sem_leitura++;
      continue;
    }

    const ultima = new Date(ultimaLeituraResult.rows[0].criado_em);
    const diffMs = agora - ultima;
    const minutos_sem_atualizar = Math.floor(diffMs / 60000);

    const offline = minutos_sem_atualizar > limiteMinutos;
    if (!offline) continue;

    const resultado = await upsertAlertaAberto(
      c.device_id,
      "dispositivo_offline",
      `Dispositivo ${c.device_id} está OFFLINE há ${minutos_sem_atualizar} minutos`
    );

    if (resultado.action === "inserted") criados++;
    else ja_existia++;
  }

  return { ok: true, limiteMinutos, criados, ja_existia, ignorados_sem_leitura };
}

  app.post("/jobs/verificar-offline", authRequired, adminOnly, async (req, res) => {
  try {
    const resultado = await jobVerificarOffline();
    return res.json(resultado);
  } catch (error) {
    console.error("Erro ao verificar offline:", error);
    return res.status(500).json({ error: "Erro ao verificar offline" });
  }
});


app.get("/alertas/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em FROM alertas WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 200",
      [device_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar alertas:", error);
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

app.get("/ultima-leitura/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, device_id, nivel, bomba_ligada, criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
      [device_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Nenhuma leitura encontrada" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao buscar última leitura:", error);
    res.status(500).json({ error: "Erro ao buscar última leitura" });
  }
});

app.get("/status/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;
  try {
    const condominioResult = await pool.query(
      "SELECT id, nome, device_id FROM condominios WHERE device_id = $1",
      [device_id]
    );
    if (condominioResult.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio/Dispositivo não encontrado" });
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

    res.json({ condominio, ultima_leitura, alertas_abertos: alertasAbertosResult.rows });
  } catch (error) {
    console.error("Erro ao buscar status:", error);
    res.status(500).json({ error: "Erro ao buscar status" });
  }
});

/* =========================
   AUTH
========================= */
app.post("/auth/registrar", authRequired, adminOnly, async (req, res) => {
  // ✅ registrar usuário só admin pode (evita qualquer um criar admin)
  const { nome, email, senha, role, condominio_id } = req.body;

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
      const c = await pool.query("SELECT id FROM condominios WHERE id = $1", [condominio_id]);
      if (c.rows.length === 0) return res.status(400).json({ error: "condominio_id inválido" });
    }

    const senha_hash = await bcrypt.hash(String(senha), 10);

    const result = await pool.query(
      "INSERT INTO usuarios (nome, email, senha_hash, role, condominio_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, email, role, condominio_id, criado_em",
      [nome, String(email).toLowerCase(), senha_hash, role, role === "cliente" ? condominio_id : null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro /auth/registrar:", error);
    return res.status(500).json({ error: "Erro ao registrar (email pode já existir)" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: "Campos: email, senha" });

  try {
    const result = await pool.query(
      "SELECT id, nome, email, senha_hash, role, condominio_id FROM usuarios WHERE email = $1 LIMIT 1",
      [String(email).toLowerCase()]
    );

    if (result.rows.length === 0) return res.status(401).json({ error: "Email ou senha inválidos" });

    const u = result.rows[0];
    const ok = await bcrypt.compare(String(senha), u.senha_hash);
    if (!ok) return res.status(401).json({ error: "Email ou senha inválidos" });

    const token = jwt.sign(
      { id: u.id, role: u.role, condominio_id: u.condominio_id, email: u.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      user: { id: u.id, nome: u.nome, email: u.email, role: u.role, condominio_id: u.condominio_id }
    });
  } catch (error) {
    console.error("Erro /auth/login:", error);
    return res.status(500).json({ error: "Erro no login" });
  }
});

app.patch("/cliente/senha", authRequired, clienteOnly, async (req, res) => {
  const { senha_atual, nova_senha } = req.body || {};

  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ error: "Campos: senha_atual, nova_senha" });
  }

  if (String(nova_senha).length < 6) {
    return res.status(400).json({ error: "nova_senha deve ter no mínimo 6 caracteres" });
  }

  try {
    // pega o usuário logado
    const uRes = await pool.query(
      "SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
      [req.user.id]
    );

    if (uRes.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const u = uRes.rows[0];

    // valida senha atual
    const ok = await bcrypt.compare(String(senha_atual), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    // atualiza senha
    const novoHash = await bcrypt.hash(String(nova_senha), 10);

    await pool.query(
      "UPDATE usuarios SET senha_hash = $2 WHERE id = $1",
      [req.user.id, novoHash]
    );

    return res.json({ ok: true, message: "Senha atualizada com sucesso" });
  } catch (error) {
    console.error("Erro ao trocar senha (cliente):", error);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

/* =========================
   🔒 TELEMETRIA COM CHAVE DO DISPOSITIVO
   Header obrigatório: X-Device-Key
========================= */
app.post("/telemetria", async (req, res) => {
  const { device_id, nivel, bomba_ligada } = req.body;

  // ✅ validações básicas
  if (!device_id || !nivel || typeof bomba_ligada !== "boolean") {
    return res.status(400).json({
      error: "Campos obrigatórios: device_id, nivel, bomba_ligada (boolean)",
    });
  }

  // ✅ chave do device vem no header
  const deviceKeyHeader = req.headers["x-device-key"];
  if (!deviceKeyHeader) {
    return res.status(401).json({ error: "Chave do dispositivo ausente (X-Device-Key)" });
  }

  try {
    // ✅ 1) buscar device no banco (agora puxando device_key)
    const condominioRes = await pool.query(
      "SELECT id, device_id, device_key FROM condominios WHERE device_id = $1 LIMIT 1",
      [device_id]
    );

    if (condominioRes.rows.length === 0) {
      return res.status(403).json({ error: "Dispositivo não autorizado" });
    }

    const cond = condominioRes.rows[0];

    // ✅ 2) validar chave
    // (não logue a chave no console)
    if (!cond.device_key || String(cond.device_key) !== String(deviceKeyHeader)) {
      return res.status(403).json({ error: "Chave do dispositivo inválida" });
    }

    // ✅ 3) normaliza nível
    const n = String(nivel).toLowerCase();

    // ✅ 4) salva leitura
    await pool.query(
      "INSERT INTO leituras (device_id, nivel, bomba_ligada) VALUES ($1, $2, $3)",
      [device_id, n, bomba_ligada]
    );

    // ✅ 5) fecha alerta offline se existir (voltou a mandar dados)
    await pool.query(
      "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'",
      [device_id]
    );

    // ===== ALERTAS DE NÍVEL (anti-duplicação + auto-fechamento) =====
    if (n === "medio" || n === "alto") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo IN ('nivel_baixo','nivel_muito_baixo') AND status = 'aberto'",
        [device_id]
      );
    }

    if (n === "baixo") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'nivel_muito_baixo' AND status = 'aberto'",
        [device_id]
      );

      await upsertAlertaAberto(
        device_id,
        "nivel_baixo",
        `Nível baixo detectado no dispositivo ${device_id}`
      );
    }

    if (n === "muito_baixo") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'nivel_baixo' AND status = 'aberto'",
        [device_id]
      );

      await upsertAlertaAberto(
        device_id,
        "nivel_muito_baixo",
        `NÍVEL MUITO BAIXO detectado no dispositivo ${device_id}`
      );
    }

    return res.json({ status: "Dados salvos com sucesso" });
  } catch (error) {
    console.error("Erro no /telemetria:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco" });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

// ✅ roda o job OFFLINE automaticamente
const OFFLINE_JOB_MS = 60 * 1000; // 1 minuto (ajuste se quiser)

setInterval(async () => {
  try {
    const r = await jobVerificarOffline();
    console.log("🛰️ Job OFFLINE automático:", r);
  } catch (e) {
    console.error("❌ Job OFFLINE automático falhou:", e);
  }
}, OFFLINE_JOB_MS);