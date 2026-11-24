// src/routes/orcamento-fotos.routes.js
//
// Fotos do orçamento (migration 105, 23/11/2026). Vão no PDF (páginas
// próprias, 4 por página) e no painel do cliente. Montado em /admin (o SW já
// trata /admin como network first). Desenho em docs/modulos/orcamento-documento.md.
//
//   GET    /admin/orcamentos/avulsos/:id/fotos        as do orçamento + as da O.S. vinculada
//   POST   /admin/orcamentos/avulsos/:id/fotos        { os_foto_id } ou { image_base64, legenda }
//   PATCH  /admin/orcamentos/avulsos/fotos/:fotoId    { legenda }
//   DELETE /admin/orcamentos/avulsos/fotos/:fotoId
//   GET    /admin/orcamentos/fotos/:chave/imagem      a imagem (PÚBLICA: o <img> não manda token)
//
// A foto da O.S. não é copiada: a linha aponta para os_fotos (os_foto_id).
// A foto própria chega já reduzida pelo navegador (CLAUDE.md: imagem grande
// em base64 estoura o limite do body e pesa no PDF).

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");

const router = express.Router();
const MAX_FOTOS = 12;

const _url = (chave) => `/admin/orcamentos/fotos/${chave}/imagem`;

function _id(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Foto é ilustração, não documento fiscal: continua editável depois da nota.
async function _orc(id) {
  const r = await pool.query("SELECT id, os_id FROM orcamentos WHERE id = $1", [id]);
  return r.rows[0] || null;
}

async function _lista(orcId, osId) {
  const fotos = (await pool.query(
    `SELECT f.id, f.os_foto_id, f.chave, f.ordem, f.criado_em,
            COALESCE(f.legenda, osf.legenda) AS legenda
       FROM orcamento_fotos f
       LEFT JOIN os_fotos osf ON osf.id = f.os_foto_id
      WHERE f.orcamento_id = $1
      ORDER BY f.ordem, f.id`, [orcId]
  )).rows.map(f => ({ id: f.id, os_foto_id: f.os_foto_id, legenda: f.legenda, ordem: f.ordem, url: _url(f.chave) }));

  let os_fotos = [];
  let os_numero = null;
  if (osId) {
    const incluidas = new Set(fotos.filter(f => f.os_foto_id).map(f => f.os_foto_id));
    const r = await pool.query(
      `SELECT f.id, f.legenda, f.tipo, f.url, (f.dados_base64 IS NOT NULL) AS tem_imagem, o.numero
         FROM os_fotos f JOIN ordens_servico o ON o.id = f.os_id
        WHERE f.os_id = $1 ORDER BY f.criado_em`, [osId]
    );
    os_numero = r.rows[0]?.numero || null;
    os_fotos = r.rows.filter(f => f.tem_imagem).map(f => ({
      id: f.id, legenda: f.legenda, tipo: f.tipo, url: f.url, incluida: incluidas.has(f.id),
    }));
  }
  return { fotos, os_fotos, os_numero, max: MAX_FOTOS };
}

router.get("/orcamentos/avulsos/:id/fotos", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });
  try {
    const o = await _orc(id);
    if (!o) return res.status(404).json({ error: "Orçamento não encontrado" });
    return res.json(await _lista(id, o.os_id));
  } catch (e) {
    console.error("[orc-fotos] GET:", e);
    return res.status(500).json({ error: "Erro ao carregar as fotos" });
  }
});

router.post("/orcamentos/avulsos/:id/fotos", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const b = req.body || {};
  try {
    const o = await _orc(id);
    if (!o) return res.status(404).json({ error: "Orçamento não encontrado" });
    const n = (await pool.query("SELECT COUNT(*)::int AS n FROM orcamento_fotos WHERE orcamento_id = $1", [id])).rows[0].n;
    if (n >= MAX_FOTOS) return res.status(409).json({ error: `O orçamento já tem ${MAX_FOTOS} fotos.` });
    const ordem = n;

    if (b.os_foto_id != null) {
      const fid = _id(b.os_foto_id);
      // Só foto da O.S. VINCULADA a este orçamento.
      const ok = fid && o.os_id && (await pool.query(
        "SELECT 1 FROM os_fotos WHERE id = $1 AND os_id = $2 AND dados_base64 IS NOT NULL", [fid, o.os_id])).rowCount;
      if (!ok) return res.status(400).json({ error: "Foto não é da O.S. vinculada a este orçamento." });
      await pool.query(
        `INSERT INTO orcamento_fotos (orcamento_id, os_foto_id, ordem, criado_por)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [id, fid, ordem, req.user.id]);
    } else {
      const m = String(b.image_base64 || "").match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (!m) return res.status(400).json({ error: "Imagem inválida (JPEG, PNG ou WEBP)." });
      // ~1,5 MB de base64: a tela reduz para 1600 px antes de mandar.
      if (m[3].length > 1.5 * 1024 * 1024) return res.status(413).json({ error: "Foto muito grande. Reduza antes de enviar." });
      if (Buffer.from(m[3], "base64").length < 1024) return res.status(400).json({ error: "Imagem inválida." });
      const legenda = b.legenda ? String(b.legenda).trim().slice(0, 255) || null : null;
      await pool.query(
        `INSERT INTO orcamento_fotos (orcamento_id, dados_base64, legenda, ordem, criado_por)
         VALUES ($1, $2, $3, $4, $5)`, [id, `data:${m[1].toLowerCase()};base64,${m[3]}`, legenda, ordem, req.user.id]);
    }
    return res.status(201).json(await _lista(id, o.os_id));
  } catch (e) {
    console.error("[orc-fotos] POST:", e);
    return res.status(500).json({ error: "Erro ao salvar a foto" });
  }
});

router.patch("/orcamentos/avulsos/fotos/:fotoId", authRequired, gestaoOnly, async (req, res) => {
  const fid = _id(req.params.fotoId);
  if (!fid) return res.status(400).json({ error: "id inválido" });
  const legenda = req.body?.legenda == null ? null : String(req.body.legenda).trim().slice(0, 255) || null;
  try {
    const r = await pool.query(
      "UPDATE orcamento_fotos SET legenda = $2 WHERE id = $1 RETURNING orcamento_id", [fid, legenda]);
    if (!r.rowCount) return res.status(404).json({ error: "Foto não encontrada" });
    const o = await _orc(r.rows[0].orcamento_id);
    return res.json(await _lista(o.id, o.os_id));
  } catch (e) {
    console.error("[orc-fotos] PATCH:", e);
    return res.status(500).json({ error: "Erro ao salvar a legenda" });
  }
});

router.delete("/orcamentos/avulsos/fotos/:fotoId", authRequired, gestaoOnly, async (req, res) => {
  const fid = _id(req.params.fotoId);
  if (!fid) return res.status(400).json({ error: "id inválido" });
  try {
    // Tirar do orçamento não apaga a foto da O.S. (só a linha que aponta).
    const r = await pool.query("DELETE FROM orcamento_fotos WHERE id = $1 RETURNING orcamento_id", [fid]);
    if (!r.rowCount) return res.status(404).json({ error: "Foto não encontrada" });
    const o = await _orc(r.rows[0].orcamento_id);
    return res.json(await _lista(o.id, o.os_id));
  } catch (e) {
    console.error("[orc-fotos] DELETE:", e);
    return res.status(500).json({ error: "Erro ao tirar a foto" });
  }
});

// PÚBLICA, como /ordens-servico/:osId/fotos/:fotoId/imagem: o <img> do admin,
// do painel do cliente e do PDF não manda token. A chave é aleatória (32
// hexadecimais), então não dá para varrer as fotos de outros prédios.
router.get("/orcamentos/fotos/:chave/imagem", async (req, res) => {
  const chave = String(req.params.chave || "");
  if (!/^[a-f0-9]{32}$/.test(chave)) return res.status(404).end();
  try {
    const r = await pool.query(
      `SELECT COALESCE(f.dados_base64, osf.dados_base64) AS dados
         FROM orcamento_fotos f LEFT JOIN os_fotos osf ON osf.id = f.os_foto_id
        WHERE f.chave = $1`, [chave]);
    const d = r.rows[0]?.dados;
    const m = d && d.match(/^data:(image\/[a-z]+);base64,(.+)$/s);
    if (!m) return res.status(404).end();
    res.set("Content-Type", m[1]);
    res.set("Cache-Control", "private, max-age=86400");
    return res.send(Buffer.from(m[2], "base64"));
  } catch (e) {
    console.error("[orc-fotos] imagem:", e);
    return res.status(500).end();
  }
});

module.exports = router;
