const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");

const router = express.Router();

// GET /tecnicos
router.get("/", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id, t.nome, t.email, t.telefone, t.especialidade,
        t.disponivel, t.ativo, t.criado_em,
        COUNT(ch.id) FILTER (WHERE ch.status != 'fechado') AS chamados_abertos,
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
router.post("/", authRequired, masterAdminOnly, async (req, res) => {
  const { nome, email, telefone, especialidade } = req.body || {};
  if (!nome) return res.status(400).json({ error: "nome é obrigatório" });
  try {
    const result = await pool.query(
      `INSERT INTO tecnicos (nome, email, telefone, especialidade)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nome, email || null, telefone || null, especialidade || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[tecnicos] POST /:", err);
    return res.status(500).json({ error: "Erro ao criar técnico" });
  }
});

// PATCH /tecnicos/:id
router.patch("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { nome, email, telefone, especialidade, disponivel, ativo } = req.body || {};
  const sets = [];
  const values = [];

  if (nome !== undefined)         { values.push(nome);         sets.push(`nome = $${values.length}`); }
  if (email !== undefined)        { values.push(email);        sets.push(`email = $${values.length}`); }
  if (telefone !== undefined)     { values.push(telefone);     sets.push(`telefone = $${values.length}`); }
  if (especialidade !== undefined){ values.push(especialidade);sets.push(`especialidade = $${values.length}`); }
  if (disponivel !== undefined)   { values.push(!!disponivel); sets.push(`disponivel = $${values.length}`); }
  if (ativo !== undefined)        { values.push(!!ativo);      sets.push(`ativo = $${values.length}`); }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE tecnicos SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: "Técnico não encontrado" });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[tecnicos] PATCH /:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar técnico" });
  }
});

// DELETE /tecnicos/:id
router.delete("/:id", authRequired, masterAdminOnly, async (req, res) => {
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
