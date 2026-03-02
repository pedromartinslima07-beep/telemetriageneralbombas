// src/routes/condominios.routes.js
const express = require("express");
const crypto = require("crypto");

const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

// POST /condominios (criar)
router.post("/", authRequired, adminOnly, async (req, res) => {
  const {
    nome, endereco, bairro, cidade, uf,
    responsavel, telefone, observacoes, ativo
  } = req.body || {};

  if (!nome) {
    return res.status(400).json({ error: "Campo obrigatório: nome" });
  }

  const ufNorm = uf ? String(uf).trim().toUpperCase().slice(0, 2) : null;
  const ativoNorm = (ativo === undefined || ativo === null) ? true : !!ativo;

  try {
    const result = await pool.query(
      `INSERT INTO condominios
        (nome, endereco, bairro, cidade, uf, responsavel, telefone, observacoes, ativo)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING
        id, nome, endereco, bairro, cidade, uf,
        responsavel, telefone, observacoes, ativo, criado_em`,
      [
        nome,
        endereco ?? null,
        bairro ?? null,
        cidade ?? null,
        ufNorm,
        responsavel ?? null,
        telefone ?? null,
        observacoes ?? null,
        ativoNorm,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar condomínio:", error);
    return res.status(500).json({ error: "Erro ao criar condomínio" });
  }
});

// GET /condominios (listar)
router.get("/", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
  SELECT
    c.id, c.nome, c.endereco, c.bairro, c.cidade, c.uf,
    c.responsavel, c.telefone, c.observacoes, c.ativo, c.criado_em,
    COUNT(r.id)::int AS total_reservatorios
  FROM condominios c
  LEFT JOIN reservatorios r ON r.condominio_id = c.id
  GROUP BY c.id
  ORDER BY c.id DESC
`);
    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar condomínios:", error);
    return res.status(500).json({ error: "Erro ao listar condomínios" });
  }
});

// GET /condominios/:id (buscar 1)
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await pool.query(`
  SELECT id, nome, endereco, bairro, cidade, uf,
         responsavel, telefone, observacoes, ativo, criado_em
  FROM condominios
  WHERE id = $1
  LIMIT 1
`, [idNum]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao buscar condomínio:", error);
    return res.status(500).json({ error: "Erro ao buscar condomínio" });
  }
});

// PATCH /condominios/:id (editar)
router.patch("/:id", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

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
    add("endereco", b.endereco);
  add("bairro", b.bairro);
  add("cidade", b.cidade);
  add("uf", ufNorm);
  add("responsavel", b.responsavel);
  add("telefone", b.telefone);
  add("observacoes", b.observacoes);
  add("ativo", ativoNorm);

  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  try {
    const result = await pool.query(
      `UPDATE condominios SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, nome, endereco, bairro, cidade, uf,
                 responsavel, telefone, observacoes, ativo, criado_em`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar condomínio:", error);
    if (error && error.code === "23505") {
      return res.status(409).json({ error: "Device ID já cadastrado" });
    }
    return res.status(500).json({ error: "Erro ao atualizar condomínio" });
  }
});

// POST /condominios/:id/regenerar-device-key
router.post("/:id/regenerar-device-key", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const novaChave = crypto.randomBytes(24).toString("hex");

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