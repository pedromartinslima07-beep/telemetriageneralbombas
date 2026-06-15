// src/routes/contratos.routes.js
//
// CRUD de contratos por condomínio + métricas (MRR, vencendo, vencidos)
// + geração de PDF e integração ZapSign para assinatura digital.

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { gerarPdfBuffer } = require("../services/contrato-pdf.service");
const zapsign = require("../services/zapsign.service");

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

  if (b.signatario_nome !== undefined) {
    out.signatario_nome = b.signatario_nome ? String(b.signatario_nome).trim().slice(0, 200) : null;
  }
  if (b.signatario_email !== undefined) {
    out.signatario_email = b.signatario_email ? String(b.signatario_email).trim().slice(0, 200) : null;
  }
  if (b.signatario_geral_nome !== undefined) {
    out.signatario_geral_nome = b.signatario_geral_nome ? String(b.signatario_geral_nome).trim().slice(0, 200) : null;
  }
  if (b.signatario_geral_email !== undefined) {
    out.signatario_geral_email = b.signatario_geral_email ? String(b.signatario_geral_email).trim().slice(0, 200) : null;
  }
  if (b.descricao_servico !== undefined) {
    out.descricao_servico = b.descricao_servico ? String(b.descricao_servico).trim().slice(0, 4000) : null;
  }

  if (b.servico_tipo !== undefined) {
    if (!["bombas", "piscina"].includes(b.servico_tipo)) errs.push("servico_tipo deve ser 'bombas' ou 'piscina'");
    else out.servico_tipo = b.servico_tipo;
  }

  if (b.qtd_bombas !== undefined) {
    if (b.qtd_bombas == null || b.qtd_bombas === "") {
      out.qtd_bombas = null;
    } else {
      const n = Number(b.qtd_bombas);
      if (!Number.isInteger(n) || n < 1 || n > 100) errs.push("qtd_bombas deve ser entre 1 e 100");
      else out.qtd_bombas = n;
    }
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
          renovacao_automatica, forma_pagamento, dia_vencimento, observacoes,
          signatario_nome, signatario_email, signatario_geral_nome, signatario_geral_email,
          descricao_servico, servico_tipo, qtd_bombas, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,false),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        out.condominio_id, out.numero || null, out.tipo, out.valor_mensal,
        out.inicio_em, out.fim_em || null, out.renovacao_automatica,
        out.forma_pagamento || null, out.dia_vencimento || null,
        out.observacoes || null,
        out.signatario_nome || null, out.signatario_email || null,
        out.signatario_geral_nome || null, out.signatario_geral_email || null,
        out.descricao_servico || null,
        out.servico_tipo || "bombas", out.qtd_bombas || null, req.user.id,
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

// ─── PDF e ZapSign ──────────────────────────────────────────────────────────

// GET /contratos/:id/pdf — gera e baixa o PDF do contrato
router.get("/:id/pdf", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const { buf, ct } = await gerarPdfBuffer(id);
    const numero = ct.numero || String(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="contrato-${numero}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error("[contratos] GET /:id/pdf:", err);
    res.status(500).json({ error: "Erro ao gerar PDF: " + err.message });
  }
});

// POST /contratos/:id/enviar-assinatura — gera PDF e envia ao ZapSign
router.post("/:id/enviar-assinatura", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    // Busca contrato para verificar campos de signatário
    const cr = await pool.query("SELECT * FROM contratos WHERE id = $1", [id]);
    if (!cr.rows.length) return res.status(404).json({ error: "Contrato não encontrado" });
    const ct = cr.rows[0];

    if (!ct.signatario_email) return res.status(400).json({ error: "Preencha o e-mail do signatário do cliente antes de enviar" });
    if (!ct.signatario_geral_email) return res.status(400).json({ error: "Preencha o e-mail do signatário da General Bombas" });

    // Gera PDF
    const { buf } = await gerarPdfBuffer(id);
    const pdfBase64 = buf.toString("base64");

    // Envia ao ZapSign
    const resp = await zapsign.criarDocumento({
      nome:        `Contrato ${ct.numero || id}`,
      pdfBase64,
      externalId:  `contrato-${id}`,
      signatarios: [
        { nome: ct.signatario_nome || "Representante do Contratante", email: ct.signatario_email },
        { nome: ct.signatario_geral_nome || "Ana Paula Martins Lima",    email: ct.signatario_geral_email },
      ],
    });

    // Persiste token e URLs
    const urlCliente = resp.signatarios[0]?.signUrl || null;
    const urlGeral   = resp.signatarios[1]?.signUrl || null;

    await pool.query(
      `UPDATE contratos SET
         zapsign_token = $1, zapsign_status = 'aguardando',
         zapsign_url_cliente = $2, zapsign_url_geral = $3,
         enviado_assinatura_em = NOW()
       WHERE id = $4`,
      [resp.docToken, urlCliente, urlGeral, id]
    );

    res.json({
      ok: true,
      zapsign_token:       resp.docToken,
      zapsign_url_cliente: urlCliente,
      zapsign_url_geral:   urlGeral,
    });
  } catch (err) {
    console.error("[contratos] POST /:id/enviar-assinatura:", err);
    res.status(500).json({ error: "Erro ao enviar para assinatura: " + err.message });
  }
});

// GET /contratos/:id/status-assinatura — atualiza status consultando ZapSign
router.get("/:id/status-assinatura", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const cr = await pool.query("SELECT zapsign_token, zapsign_status FROM contratos WHERE id = $1", [id]);
    if (!cr.rows.length) return res.status(404).json({ error: "Contrato não encontrado" });
    const { zapsign_token: docToken, zapsign_status } = cr.rows[0];

    if (!docToken) return res.json({ zapsign_status: zapsign_status || "rascunho" });

    const info = await zapsign.buscarDocumento(docToken);
    const novoStatus = zapsign.mapStatus(info.status);

    await pool.query(
      `UPDATE contratos SET
         zapsign_status = $1,
         zapsign_doc_url = COALESCE($2, zapsign_doc_url),
         assinado_em = CASE WHEN $1 = 'assinado' AND assinado_em IS NULL THEN NOW() ELSE assinado_em END
       WHERE id = $3`,
      [novoStatus, info.docUrl, id]
    );

    res.json({ zapsign_status: novoStatus, doc_url: info.docUrl, signatarios: info.signatarios });
  } catch (err) {
    console.error("[contratos] GET /:id/status-assinatura:", err);
    res.status(500).json({ error: "Erro ao consultar status: " + err.message });
  }
});

// POST /contratos/webhook/zapsign — callback do ZapSign ao assinar/recusar
// Não exige auth (ZapSign chama de fora); valida pelo token do documento no body.
router.post("/webhook/zapsign", async (req, res) => {
  res.sendStatus(200); // responde rápido para o ZapSign não retentar

  try {
    const { document } = req.body || {};
    if (!document?.token) return;

    const docToken  = document.token;
    const status    = zapsign.mapStatus(document.status);
    const docUrl    = document.signed_file || null;

    await pool.query(
      `UPDATE contratos SET
         zapsign_status  = $1,
         zapsign_doc_url = COALESCE($2, zapsign_doc_url),
         assinado_em     = CASE WHEN $1 = 'assinado' AND assinado_em IS NULL THEN NOW() ELSE assinado_em END
       WHERE zapsign_token = $3`,
      [status, docUrl, docToken]
    );
  } catch (err) {
    console.error("[contratos] webhook ZapSign:", err);
  }
});

module.exports = { contratosRouter: router };
