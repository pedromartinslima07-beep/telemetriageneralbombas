// src/routes/planos-manutencao.routes.js
//
// CRUD de planos de manutenção preventiva por condomínio.
// O job em src/jobs/planos-manutencao.job.js abre um chamado P4
// automaticamente quando proxima_em vence.

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { executarPlano } = require("../jobs/planos-manutencao.job");

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function _validarPayload(b, { exigirObrigatorios }) {
  const errs = [];
  const out = {};

  if (exigirObrigatorios || b.condominio_id !== undefined) {
    const cid = Number(b.condominio_id);
    if (!Number.isInteger(cid) || cid <= 0) errs.push("condominio_id inválido");
    else out.condominio_id = cid;
  }

  if (exigirObrigatorios || b.titulo !== undefined) {
    const t = String(b.titulo || "").trim();
    if (!t || t.length < 2) errs.push("titulo é obrigatório (min 2 chars)");
    else if (t.length > 255) errs.push("titulo muito longo (max 255)");
    else out.titulo = t;
  }

  if (b.descricao !== undefined) {
    const d = b.descricao ? String(b.descricao).trim().slice(0, 2000) : null;
    out.descricao = d;
  }

  if (exigirObrigatorios || b.periodicidade_dias !== undefined) {
    const p = Number(b.periodicidade_dias);
    if (!Number.isInteger(p) || p <= 0 || p > 3650) {
      errs.push("periodicidade_dias deve ser inteiro entre 1 e 3650");
    } else {
      out.periodicidade_dias = p;
    }
  }

  if (exigirObrigatorios || b.proxima_em !== undefined) {
    const px = b.proxima_em ? String(b.proxima_em) : null;
    if (!px || !/^\d{4}-\d{2}-\d{2}$/.test(px)) {
      errs.push("proxima_em deve ser data no formato YYYY-MM-DD");
    } else {
      out.proxima_em = px;
    }
  }

  if (b.ativo !== undefined) out.ativo = !!b.ativo;

  return { out, errs };
}

// ─── Rotas ──────────────────────────────────────────────────────────────────

// GET /planos-manutencao?condominio_id=&ativo=true|false
router.get("/", authRequired, masterAdminOnly, async (req, res) => {
  const where = [];
  const vals  = [];

  if (req.query.condominio_id) {
    vals.push(Number(req.query.condominio_id));
    where.push(`pm.condominio_id = $${vals.length}`);
  }
  if (req.query.ativo === "true" || req.query.ativo === "false") {
    vals.push(req.query.ativo === "true");
    where.push(`pm.ativo = $${vals.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const r = await pool.query(
      `SELECT pm.id, pm.condominio_id, pm.titulo, pm.descricao,
              pm.periodicidade_dias, pm.proxima_em, pm.ultima_em,
              pm.ativo, pm.criado_em,
              COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
              c.zona AS condominio_zona
       FROM planos_manutencao pm
       LEFT JOIN condominios c ON c.id = pm.condominio_id
       ${whereSql}
       ORDER BY
         CASE WHEN pm.ativo AND pm.proxima_em <= CURRENT_DATE THEN 0 ELSE 1 END,
         pm.proxima_em ASC NULLS LAST
       LIMIT 500`,
      vals
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[planos-manutencao] GET /:", err);
    return res.status(500).json({ error: "Erro ao listar planos" });
  }
});

// ─── Responsáveis por zona ───────────────────────────────────────────────────

// GET /planos-manutencao/zonas-responsaveis
// Lista todas as zonas distintas dos condomínios ativos + técnico atribuído (se houver)
router.get("/zonas-responsaveis", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT c.zona
       FROM condominios c
       WHERE c.ativo = TRUE AND c.zona IS NOT NULL AND c.zona <> ''
       ORDER BY c.zona ASC`
    );
    const zonas = r.rows.map(row => row.zona);

    const resp = await pool.query(
      `SELECT pzr.zona, pzr.tecnico_id, t.nome AS tecnico_nome
       FROM planos_zona_responsavel pzr
       LEFT JOIN tecnicos t ON t.id = pzr.tecnico_id`
    );
    const mapaResp = {};
    for (const row of resp.rows) mapaResp[row.zona] = row;

    return res.json(zonas.map(zona => ({
      zona,
      tecnico_id:   mapaResp[zona]?.tecnico_id   ?? null,
      tecnico_nome: mapaResp[zona]?.tecnico_nome  ?? null,
    })));
  } catch (err) {
    console.error("[planos-manutencao] GET /zonas-responsaveis:", err);
    return res.status(500).json({ error: "Erro ao listar zonas" });
  }
});

// PUT /planos-manutencao/zonas-responsaveis/:zona
// Define ou remove o técnico responsável de uma zona
router.put("/zonas-responsaveis/:zona", authRequired, masterAdminOnly, async (req, res) => {
  const zona = req.params.zona.trim();
  if (!zona) return res.status(400).json({ error: "zona inválida" });

  const tecnicoId = req.body?.tecnico_id ? Number(req.body.tecnico_id) : null;

  try {
    if (tecnicoId === null) {
      await pool.query(`DELETE FROM planos_zona_responsavel WHERE zona = $1`, [zona]);
    } else {
      await pool.query(
        `INSERT INTO planos_zona_responsavel (zona, tecnico_id, atualizado_em)
         VALUES ($1, $2, NOW())
         ON CONFLICT (zona) DO UPDATE SET tecnico_id = $2, atualizado_em = NOW()`,
        [zona, tecnicoId]
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[planos-manutencao] PUT /zonas-responsaveis/:zona:", err);
    return res.status(500).json({ error: "Erro ao salvar responsável da zona" });
  }
});

// GET /planos-manutencao/:id
router.get("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `SELECT pm.*, c.nome AS condominio_nome
       FROM planos_manutencao pm
       LEFT JOIN condominios c ON c.id = pm.condominio_id
       WHERE pm.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Plano não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[planos-manutencao] GET /:id:", err);
    return res.status(500).json({ error: "Erro ao buscar plano" });
  }
});

// POST /planos-manutencao
router.post("/", authRequired, masterAdminOnly, async (req, res) => {
  const { out, errs } = _validarPayload(req.body || {}, { exigirObrigatorios: true });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });

  try {
    const r = await pool.query(
      `INSERT INTO planos_manutencao
         (condominio_id, titulo, descricao, periodicidade_dias, proxima_em, ativo, criado_por)
       VALUES ($1, $2, $3, $4, $5::date, COALESCE($6, TRUE), $7)
       RETURNING *`,
      [
        out.condominio_id,
        out.titulo,
        out.descricao ?? null,
        out.periodicidade_dias,
        out.proxima_em,
        out.ativo,
        req.user.id,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[planos-manutencao] POST /:", err);
    return res.status(500).json({ error: "Erro ao criar plano" });
  }
});

// PATCH /planos-manutencao/bulk — ativa/desativa vários planos de uma vez
// body: { ids: number[], ativo: boolean }
router.patch("/bulk", authRequired, masterAdminOnly, async (req, res) => {
  const idsRaw = req.body?.ids;
  const ativo  = req.body?.ativo;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return res.status(400).json({ error: "ids deve ser uma lista não vazia" });
  }
  if (idsRaw.length > 500) {
    return res.status(400).json({ error: "máximo de 500 ids por vez" });
  }
  const ids = idsRaw.map(Number);
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: "ids inválidos" });
  }
  if (typeof ativo !== "boolean") {
    return res.status(400).json({ error: "ativo deve ser boolean" });
  }

  try {
    const r = await pool.query(
      `UPDATE planos_manutencao SET ativo = $1 WHERE id = ANY($2::int[]) RETURNING id`,
      [ativo, ids]
    );
    return res.json({ ok: true, atualizados: r.rows.length });
  } catch (err) {
    console.error("[planos-manutencao] PATCH /bulk:", err);
    return res.status(500).json({ error: "Erro ao atualizar planos em massa" });
  }
});

// PATCH /planos-manutencao/:id
router.patch("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { out, errs } = _validarPayload(req.body || {}, { exigirObrigatorios: false });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });

  const sets = [];
  const vals = [id];
  for (const [k, v] of Object.entries(out)) {
    vals.push(v);
    const target = k === "proxima_em" ? `${k} = $${vals.length}::date` : `${k} = $${vals.length}`;
    sets.push(target);
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE planos_manutencao SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Plano não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[planos-manutencao] PATCH /:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar plano" });
  }
});

// DELETE /planos-manutencao/:id  — soft delete (ativo = false)
router.delete("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `UPDATE planos_manutencao SET ativo = FALSE WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Plano não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[planos-manutencao] DELETE /:id:", err);
    return res.status(500).json({ error: "Erro ao desativar plano" });
  }
});

// POST /planos-manutencao/:id/executar-agora — dispara o plano manualmente
router.post("/:id/executar-agora", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const resultado = await executarPlano(id);
    return res.json(resultado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[planos-manutencao] POST /:id/executar-agora:", err);
    return res.status(500).json({ error: "Erro ao executar plano" });
  }
});

module.exports = { planosManutencaoRouter: router };
