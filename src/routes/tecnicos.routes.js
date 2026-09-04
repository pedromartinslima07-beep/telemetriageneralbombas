const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { gestaoOnly } = require("../middleware/gestaoOnly");

const router = express.Router();

// Helper: cria usuário com role=tecnico e devolve o id. Usa o client de
// transação passado (não abre pool novo).
async function _criarUsuarioTecnico(client, { nome, email, senha }) {
  if (!email) throw new Error("Email é obrigatório para criar login");
  if (!senha || String(senha).length < 6) throw new Error("Senha mínima de 6 caracteres");
  const hash = await bcrypt.hash(String(senha), 10);
  const r = await client.query(
    `INSERT INTO usuarios (nome, email, senha_hash, role)
     VALUES ($1, $2, $3, 'tecnico')
     RETURNING id`,
    [nome, String(email).toLowerCase(), hash]
  );
  return r.rows[0].id;
}

// GET /tecnicos
router.get("/", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id, t.nome, t.email, t.telefone, t.especialidade,
        t.cargo, t.disponivel, t.ativo, t.criado_em, t.usuario_id,
        t.foto_url, t.cpf, t.rg, t.data_nascimento, t.endereco, t.observacoes,
        (t.usuario_id IS NOT NULL) AS tem_login,
        COUNT(ch.id) FILTER (WHERE ch.status NOT IN ('fechado', 'cancelado')) AS chamados_abertos,
        COUNT(ch.id) AS chamados_total
      FROM tecnicos t
      LEFT JOIN chamados ch ON ch.tecnico_id = t.id
      GROUP BY t.id
      ORDER BY t.nome ASC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("[tecnicos] GET /:", err);
    return res.status(500).json({ error: "Erro ao buscar técnicos" });
  }
});

// POST /tecnicos
// Aceita campo opcional `senha`. Se presente, cria também o usuário (role=tecnico)
// e vincula via `tecnicos.usuario_id` na mesma transação. Email vira obrigatório
// nesse caso (é o login do técnico).
router.post("/", authRequired, gestaoOnly, async (req, res) => {
  const { nome, email, telefone, especialidade, cargo, senha, foto_url, cpf, rg, data_nascimento, endereco, observacoes } = req.body || {};
  if (!nome) return res.status(400).json({ error: "nome é obrigatório" });
  const CARGOS = ["tecnico", "adm", "gestor", "ti"];
  if (cargo && !CARGOS.includes(cargo)) return res.status(400).json({ error: "cargo inválido" });

  const querSenha = !!(senha && String(senha).trim());

  if (querSenha) {
    if (!email) return res.status(400).json({ error: "Email é obrigatório quando há senha (será o login do app)" });
    if (String(senha).length < 6) return res.status(400).json({ error: "Senha mínima de 6 caracteres" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let usuarioId = null;
    if (querSenha) {
      usuarioId = await _criarUsuarioTecnico(client, { nome, email, senha });
    }

    const result = await client.query(
      `INSERT INTO tecnicos (nome, email, telefone, especialidade, cargo, usuario_id, foto_url, cpf, rg, data_nascimento, endereco, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *, (usuario_id IS NOT NULL) AS tem_login`,
      [nome, email || null, telefone || null, especialidade || null, cargo || "tecnico", usuarioId,
       foto_url || null, cpf || null, rg || null, data_nascimento || null, endereco || null, observacoes || null]
    );

    await client.query("COMMIT");
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "Email já cadastrado em outro usuário" });
    console.error("[tecnicos] POST /:", err);
    return res.status(500).json({ error: err.message || "Erro ao criar técnico" });
  } finally {
    client.release();
  }
});

// PATCH /tecnicos/:id
// Se vier `senha`:
//   - técnico sem usuario_id ainda → cria usuário e linka (precisa email)
//   - técnico já com usuario_id    → atualiza só a senha do usuário existente
router.patch("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { nome, email, telefone, especialidade, cargo, disponivel, ativo, senha, foto_url, cpf, rg, data_nascimento, endereco, observacoes, usuario_id: usuarioIdExterno } = req.body || {};
  const querSenha = !!(senha && String(senha).trim());

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Carrega o técnico atual pra decidir o caminho da senha
    const cur = await client.query(
      `SELECT id, nome, email, usuario_id FROM tecnicos WHERE id = $1`,
      [id]
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Técnico não encontrado" });
    }
    const tec = cur.rows[0];

    // Resolve a senha primeiro — pode invalidar a transação antes de mexer no
    // resto. Não trata como "campo a ser atualizado em tecnicos".
    let novoUsuarioId = null;
    if (querSenha) {
      if (String(senha).length < 6) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Senha mínima de 6 caracteres" });
      }
      if (tec.usuario_id) {
        // já tem login — só troca senha
        const hash = await bcrypt.hash(String(senha), 10);
        await client.query(
          `UPDATE usuarios SET senha_hash = $1 WHERE id = $2`,
          [hash, tec.usuario_id]
        );
      } else {
        // cria login agora
        const emailFinal = email !== undefined ? email : tec.email;
        if (!emailFinal) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Email é obrigatório quando se cria login" });
        }
        novoUsuarioId = await _criarUsuarioTecnico(client, {
          nome: nome !== undefined ? nome : tec.nome,
          email: emailFinal,
          senha,
        });
      }
    }

    // Monta UPDATE da tabela tecnicos com os campos comuns
    const sets = [];
    const values = [];
    if (nome !== undefined)          { values.push(nome);          sets.push(`nome = $${values.length}`); }
    if (email !== undefined)         { values.push(email);         sets.push(`email = $${values.length}`); }
    if (telefone !== undefined)      { values.push(telefone);      sets.push(`telefone = $${values.length}`); }
    if (especialidade !== undefined) { values.push(especialidade); sets.push(`especialidade = $${values.length}`); }
    if (disponivel !== undefined)      { values.push(!!disponivel);      sets.push(`disponivel = $${values.length}`); }
    if (ativo !== undefined)           { values.push(!!ativo);           sets.push(`ativo = $${values.length}`); }
    const uidFinal = novoUsuarioId || (usuarioIdExterno ? Number(usuarioIdExterno) : undefined);
    if (uidFinal)                       { values.push(uidFinal);           sets.push(`usuario_id = $${values.length}`); }
    if (foto_url !== undefined)        { values.push(foto_url || null);        sets.push(`foto_url = $${values.length}`); }
    if (cpf !== undefined)             { values.push(cpf || null);             sets.push(`cpf = $${values.length}`); }
    if (rg !== undefined)              { values.push(rg || null);              sets.push(`rg = $${values.length}`); }
    if (data_nascimento !== undefined) { values.push(data_nascimento || null); sets.push(`data_nascimento = $${values.length}`); }
    if (endereco !== undefined)        { values.push(endereco || null);        sets.push(`endereco = $${values.length}`); }
    if (observacoes !== undefined)     { values.push(observacoes || null);     sets.push(`observacoes = $${values.length}`); }
    if (cargo !== undefined)           { values.push(cargo || "tecnico");      sets.push(`cargo = $${values.length}`); }

    let updated;
    if (sets.length) {
      values.push(id);
      const r = await client.query(
        `UPDATE tecnicos SET ${sets.join(", ")} WHERE id = $${values.length}
         RETURNING *, (usuario_id IS NOT NULL) AS tem_login`,
        values
      );
      updated = r.rows[0];
    } else {
      // Nada pra atualizar em tecnicos (só trocou senha). Devolve o estado atual.
      const r = await client.query(
        `SELECT *, (usuario_id IS NOT NULL) AS tem_login FROM tecnicos WHERE id = $1`,
        [id]
      );
      updated = r.rows[0];
    }

    await client.query("COMMIT");
    return res.json(updated);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "Email já cadastrado em outro usuário" });
    console.error("[tecnicos] PATCH /:id:", err);
    return res.status(500).json({ error: err.message || "Erro ao atualizar técnico" });
  } finally {
    client.release();
  }
});

// DELETE /tecnicos/:id
router.delete("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    await pool.query("DELETE FROM tecnicos WHERE id = $1", [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tecnicos] DELETE /:id:", err);
    return res.status(500).json({ error: "Erro ao excluir técnico" });
  }
});

module.exports = { tecnicosRouter: router };
