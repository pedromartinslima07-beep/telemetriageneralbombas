// src/routes/nota-fiscal.routes.js
//
// Nota fiscal do orçamento aprovado, emitida pelo Omie. Montado em /admin
// (o SW já trata /admin como network first). Regra e molde em
// src/services/nota-fiscal.service.js; fluxo em docs/modulos/nota-fiscal.md.
//
//   GET  /admin/orcamentos/avulsos/:id/nota            prévia (não fala com o Omie)
//   POST /admin/orcamentos/avulsos/:id/nota/emitir     emite (exige OMIE_EMISSAO=1)
//   POST /admin/orcamentos/avulsos/:id/nota/atualizar  relê o status no Omie

const express = require("express");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");
const nota = require("../services/nota-fiscal.service");

const router = express.Router();

function _id(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return null; }
  return id;
}

function _falha(res, rota, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(`[nota] ${rota}:`, err);
  return res.status(status).json({ error: err.message || "Erro na nota fiscal", call: err.call || undefined });
}

router.get("/orcamentos/avulsos/:id/nota", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try {
    return res.json(await nota.preparar(id));
  } catch (err) { return _falha(res, "GET nota", err); }
});

router.post("/orcamentos/avulsos/:id/nota/emitir", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try {
    const naturezas = req.body && typeof req.body.naturezas === "object" ? req.body.naturezas : {};
    const r = await nota.emitir(id, req.user.id, naturezas);
    console.log(`[nota] orcamento=${id} emitir usuario=${req.user.id} -> ${r.nota_status} ${r.nota_numero || ""}`);
    return res.json(r);
  } catch (err) { return _falha(res, "POST nota/emitir", err); }
});

router.post("/orcamentos/avulsos/:id/nota/atualizar", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try {
    return res.json(await nota.atualizar(id));
  } catch (err) { return _falha(res, "POST nota/atualizar", err); }
});

module.exports = { notaFiscalRouter: router };
