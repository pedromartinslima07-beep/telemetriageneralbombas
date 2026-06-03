// src/routes/contratos.routes.js
//
// CRUD de contratos por condomínio + endpoint de métricas (MRR, vencendo,
// vencidos). Um condomínio pode ter múltiplos contratos ativos simultâneos
// (migration 046 removeu a restrição de unicidade).

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");

const router = express.Router();

const TIPOS = ["mensal", "semestral", "anual"];
const FORMAS_PAGAMENTO = ["boleto", "pix", "transferencia", "cartao", "outro"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function _validar(b, { exigirObrigatorios }) {
  const errs = [];
  const out = {};

  if (exigirObrigatorios || b.condominio_id !== undefined) {
    const cid = Number(b.condominio_id);
    if (!Number.isInteger(cid) || cid <= 0) errs.push("condominio_id inválido");
    else out.condominio_id = cid;
  }

  if (b.numero !== undefined) {
    out.numero = b.numero ? String(b.numero).trim().slice(0, 40) : null;
  }

  if (exigirObrigatorios || b.tipo !== undefined) {
    if (!TIPOS.includes(b.tipo)) errs.push(`tipo deve ser: ${TIPOS.join(", ")}`);
    else out.tipo = b.tipo;
  }

  if (exigirObrigatorios || b.valor_mensal !== undefined) {
    const v = Number(b.valor_mensal);
    if (!Number.isFinite(v) || v < 0) errs.push("valor_mensal deve ser número >= 0");
    else out.valor_mensal = v;
  }

  if (exigirObrigatorios || b.inicio_em !== undefined) {
    const d = b.inicio_em ? String(b.inicio_em) : null;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) errs.push("inicio_em deve ser YYYY-MM-DD");
    else out.inicio_em = d;
  }

  if (b.fim_em !== undefined) {
    if (b.fim_em == null || b.fim_em === "") {
      out.fim_em = null;
    } else {
      const d = String(b.fim_em);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errs.push("fim_em deve ser YYYY-MM-DD ou null");
      else out.fim_em = d;
    }
  }

  if (b.renovacao_automatica !== undefined) {
    out.renovacao_automatica = !!b.renovacao_automatica;
  }

  if (b.forma_pagamento !== undefined) {
    if (b.forma_pagamento == null || b.forma_pagamento === "") {
      out.forma_pagamento = null;
    } else if (!FORMAS_PAGAMENTO.includes(b.forma_pagamento)) {
      errs.push(`forma_pagamento deve ser: ${FORMAS_PAGAMENTO.join(", ")}`);
    } else {
      out.forma_pagamento = b.forma_pagamento;
    }
  }

  if (b.dia_vencimento !== undefined) {
    if (b.dia_vencimento == null || b.dia_vencimento === "") {
      out.dia_vencimento = null;
    } else {
      const n = Number(b.dia_vencimento);
      if (!Number.isInteger(n) || n < 1 || n > 28) errs.push("dia_vencimento deve ser entre 1 e 28");
      else out.dia_vencimento = n;
    }
  }

  if (b.observacoes !== undefined) {
    out.observacoes = b.observacoes ? String(b.observacoes).trim().slice(0, 4000) : null;
  }

  if (b.ativo !== undefined) {
    out.ativo = !!b.ativo;
  }

  return { errs, out };
}

// ─── Rotas ──────────────────────────────────────────────────────────────────

// GET /contratos — lista (filtros: condominio_id, ativo, vencendo_em_dias)
router.get("/", authRequired, adminOnly, async (req, res) => {
  const { condominio_id, ativo, vencendo_em_dias } = req.query;
  const conds = [];
  const vals = [];

  if (condominio_id) {
    vals.push(Number(condominio_id));
    conds.push(`c.condominio_id = $${vals.length}`);
  }
  if (ativo === "true" || ativo === "false") {
    vals.push(ativo === "true");
    conds.push(`c.ativo = $${vals.length}`);
  }
  if (vencendo_em_dias) {
    vals.push(Number(vencendo_em_dias));
    conds.push(
      `c.ativo = TRUE AND c.fim_em IS NOT NULL AND c.fim_em <= CURRENT_DATE + ($${vals.length} || ' days')::interval`
    );
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  try {
    const r = await pool.query(
      `SELECT c.*, cond.nome AS condominio_nome,
              CASE
                WHEN c.fim_em IS NULL THEN NULL
                ELSE (c.fim_em - CURRENT_DATE)
              END AS dias_para_vencer
       FROM contratos c
       LEFT JOIN condominios cond ON cond.id = c.condominio_id
       ${where}
       ORDER BY c.ativo DESC, c.fim_em ASC NULLS LAST, c.criado_em DESC
       LIMIT 500`,
      vals
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[contratos] GET /:", err);
    return res.status(500).json({ error: "Erro ao listar contratos" });
  }
});

// GET /contratos/metricas — MRR, ativos, vencendo, vencidos.
// Retorna 2 blocos: total (geral) e com_telemetria (só condomínios com >= 1 reservatório)
router.get("/metricas", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(`
      WITH base AS (
        SELECT c.id, c.condominio_id, c.valor_mensal, c.tipo, c.fim_em,
               EXISTS (SELECT 1 FROM reservatorios r WHERE r.condominio_id = c.condominio_id) AS tem_telemetria
        FROM contratos c
        WHERE c.ativo = TRUE
      )
      SELECT
        -- Geral
        COUNT(*)::int AS ativos_total,
        ROUND(SUM(valor_mensal)::numeric, 2) AS mrr_total,
        COUNT(CASE WHEN fim_em IS NOT NULL AND fim_em <= CURRENT_DATE + INTERVAL '30 days' AND fim_em >= CURRENT_DATE THEN 1 END)::int AS vencendo_30d_total,
        COUNT(CASE WHEN fim_em IS NOT NULL AND fim_em < CURRENT_DATE THEN 1 END)::int AS vencidos_total,
        -- Com telemetria
        COUNT(CASE WHEN tem_telemetria THEN 1 END)::int AS ativos_tel,
        ROUND(SUM(CASE WHEN tem_telemetria THEN valor_mensal ELSE 0 END)::numeric, 2) AS mrr_tel,
        COUNT(CASE WHEN tem_telemetria AND fim_em IS NOT NULL AND fim_em <= CURRENT_DATE + INTERVAL '30 days' AND fim_em >= CURRENT_DATE THEN 1 END)::int AS vencendo_30d_tel,
        COUNT(CASE WHEN tem_telemetria AND fim_em IS NOT NULL AND fim_em < CURRENT_DATE THEN 1 END)::int AS vencidos_tel
      FROM base
    `);
    const row = r.rows[0] || {};
    return res.json({
      total: {
        ativos:        Number(row.ativos_total)        || 0,
        mrr:           Number(row.mrr_total)           || 0,
        vencendo_30d:  Number(row.vencendo_30d_total)  || 0,
        vencidos:      Number(row.vencidos_total)      || 0,
      },
      com_telemetria: {
        ativos:        Number(row.ativos_tel)          || 0,
        mrr:           Number(row.mrr_tel)             || 0,
        vencendo_30d:  Number(row.vencendo_30d_tel)    || 0,
        vencidos:      Number(row.vencidos_tel)        || 0,
      },
    });
  } catch (err) {
    console.error("[contratos] GET /metricas:", err);
    return res.status(500).json({ error: "Erro ao calcular métricas" });
  }
});

// GET /contratos/:id — detalhe
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `SELECT c.*, cond.nome AS condominio_nome
       FROM contratos c
       LEFT JOIN condominios cond ON cond.id = c.condominio_id
       WHERE c.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Contrato não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[contratos] GET /:id:", err);
    return res.status(500).json({ error: "Erro ao buscar contrato" });
  }
});

// POST /contratos — cria. Se o condomínio já tem contrato ativo, retorna 409.
router.post("/", authRequired, masterAdminOnly, async (req, res) => {
  const { errs, out } = _validar(req.body || {}, { exigirObrigatorios: true });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });

  try {
    const r = await pool.query(
      `INSERT INTO contratos
         (condominio_id, numero, tipo, valor_mensal, inicio_em, fim_em,
          renovacao_automatica, forma_pagamento, dia_vencimento, observacoes, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), $8, $9, $10, $11)
       RETURNING *`,
      [
        out.condominio_id, out.numero || null, out.tipo, out.valor_mensal,
        out.inicio_em, out.fim_em || null, out.renovacao_automatica,
        out.forma_pagamento || null, out.dia_vencimento || null,
        out.observacoes || null, req.user.id,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[contratos] POST /:", err);
    return res.status(500).json({ error: "Erro ao criar contrato" });
  }
});

// PATCH /contratos/:id — atualiza (não permite mudar condominio_id)
router.patch("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { errs, out } = _validar(req.body || {}, { exigirObrigatorios: false });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });
  if (out.condominio_id !== undefined) delete out.condominio_id;

  const campos = Object.keys(out);
  if (!campos.length) return res.status(400).json({ error: "Nada para atualizar" });

  const sets = campos.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const vals = campos.map(k => out[k]);
  vals.push(id);

  try {
    const r = await pool.query(
      `UPDATE contratos SET ${sets} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Contrato não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[contratos] PATCH /:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar contrato" });
  }
});

// DELETE /contratos/:id — exclusão permanente
router.delete("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `DELETE FROM contratos WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Contrato não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[contratos] DELETE /:id:", err);
    return res.status(500).json({ error: "Erro ao excluir contrato" });
  }
});

module.exports = { contratosRouter: router };
