const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");

const router = express.Router();

/**
 * POST /reservatorios
 * Body: { condominio_id, nome, tipo, device_id }
 * -> gera device_key automaticamente
 */
router.post("/", authRequired, masterAdminOnly, async (req, res) => {
  const { condominio_id, nome, tipo, device_id } = req.body || {};

  const condId = Number(condominio_id);
  if (!Number.isInteger(condId) || condId <= 0) {
    return res.status(400).json({ error: "condominio_id inválido" });
  }
  if (!nome || String(nome).trim().length < 2) {
    return res.status(400).json({ error: "nome é obrigatório" });
  }
  if (!tipo || !["superior", "inferior", "outro"].includes(String(tipo))) {
    return res.status(400).json({ error: "tipo inválido (superior, inferior, outro)" });
  }
  if (!device_id || String(device_id).trim().length < 3) {
    return res.status(400).json({ error: "device_id é obrigatório" });
  }

  try {
    // confere se o condomínio existe
    const c = await pool.query("SELECT id, nome FROM condominios WHERE id = $1 LIMIT 1", [condId]);
    if (c.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    const device_key = crypto.randomBytes(24).toString("hex");

    const result = await pool.query(
      `INSERT INTO reservatorios (condominio_id, nome, tipo, device_id, device_key)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, condominio_id, nome, tipo, device_id, device_key, criado_em`,
      [condId, String(nome).trim(), String(tipo), String(device_id).trim(), device_key]
    );

    return res.status(201).json(result.rows[0]);
  } catch (e) {
    // 23505 = unique violation (se você tiver unique em device_id)
    if (e && e.code === "23505") {
      return res.status(409).json({ error: "device_id já existe em outro reservatório" });
    }
    console.error("Erro ao criar reservatório:", e);
    return res.status(500).json({ error: "Erro ao criar reservatório" });
  }
});

/**
 * GET /reservatorios?condominio_id=10  (opcional)
 */
router.get("/", authRequired, adminOnly, async (req, res) => {
  const condominio_id = req.query.condominio_id ? Number(req.query.condominio_id) : null;

  try {
    const result = condominio_id
      ? await pool.query(
          `SELECT id, condominio_id, nome, tipo, device_id, criado_em
           FROM reservatorios
           WHERE condominio_id = $1
           ORDER BY id DESC`,
          [condominio_id]
        )
      : await pool.query(
          `SELECT id, condominio_id, nome, tipo, device_id, criado_em
           FROM reservatorios
           ORDER BY id DESC`
        );

    return res.json(result.rows);
  } catch (e) {
    console.error("Erro ao listar reservatórios:", e);
    return res.status(500).json({ error: "Erro ao listar reservatórios" });
  }
});

/**
 * POST /reservatorios/:id/regenerar-device-key
 * -> gera nova device_key e salva no reservatório
 */
router.post("/:id/regenerar-device-key", authRequired, masterAdminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const novaChave = crypto.randomBytes(24).toString("hex");

    const result = await pool.query(
      `UPDATE reservatorios
       SET device_key = $2
       WHERE id = $1
       RETURNING id, condominio_id, nome, tipo, device_id, device_key`,
      [idNum, novaChave]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Reservatório não encontrado" });
    }

    return res.json({
      ok: true,
      message: "Device key regenerada com sucesso. Atualize o ESP com a nova chave.",
      reservatorio: result.rows[0],
    });
  } catch (e) {
    console.error("Erro ao regenerar device_key do reservatório:", e);
    return res.status(500).json({ error: "Erro ao regenerar device_key" });
  }
});

/**
 * GET /reservatorios/:id
 */
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const r = await pool.query(
      `SELECT id, condominio_id, nome, tipo, device_id, criado_em
       FROM reservatorios
       WHERE id = $1
       LIMIT 1`,
      [idNum]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Reservatório não encontrado" });
    }

    return res.json(r.rows[0]);
  } catch (e) {
    console.error("Erro ao buscar reservatório:", e);
    return res.status(500).json({ error: "Erro ao buscar reservatório" });
  }
});

/**
 * PATCH /reservatorios/:id
 * Body: { nome, tipo, ativo }
 */
router.patch("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const b = req.body || {};
  const sets = [];
  const values = [idNum];
  let i = 2;

  const add = (col, val) => {
    if (val === undefined) return;
    sets.push(`${col} = $${i}`);
    values.push(val);
    i++;
  };

  if (b.nome !== undefined) {
    const nome = String(b.nome || "").trim();
    if (nome.length < 2) return res.status(400).json({ error: "nome muito curto" });
    add("nome", nome);
  }
  if (b.tipo !== undefined) {
    if (!["superior", "inferior", "outro"].includes(String(b.tipo))) {
      return res.status(400).json({ error: "tipo inválido (superior, inferior, outro)" });
    }
    add("tipo", String(b.tipo));
  }
  if (b.ativo !== undefined) add("ativo", !!b.ativo);

  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  try {
    const result = await pool.query(
      `UPDATE reservatorios SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, condominio_id, nome, tipo, device_id, ativo, criado_em`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Reservatório não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (e) {
    console.error("Erro ao atualizar reservatório:", e);
    return res.status(500).json({ error: "Erro ao atualizar reservatório" });
  }
});

/**
 * DELETE /reservatorios/:id  (soft delete)
 */
router.delete("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await pool.query(
      `UPDATE reservatorios SET ativo = false WHERE id = $1 RETURNING id`,
      [idNum]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Reservatório não encontrado" });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir reservatório:", e);
    return res.status(500).json({ error: "Erro ao excluir reservatório" });
  }
});

module.exports = { reservatoriosRouter: router };