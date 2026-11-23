// src/routes/guias.routes.js
//
// Guias de tributos → contas a pagar no Omie (migration 100,
// docs/modulos/guias-tributos.md). Montado em /admin (o SW já trata /admin
// como network first). Só o admin: é financeiro.
//
//   GET    /admin/guias                     a lista + as regras por tipo
//   GET    /admin/guias/opcoes              categorias e contas do Omie (lidas a cada 6 h)
//   GET    /admin/guias/fornecedores?q=     fornecedores da cópia do Omie (não chama o Omie)
//   POST   /admin/guias                     { nome, pdf_base64 } → lê o PDF e cria a(s) guia(s)
//   GET    /admin/guias/:id/pdf             o PDF da guia
//   PATCH  /admin/guias/:id                 conferência { tipo, competencia, vencimento, valor,
//                                           linha_digitavel, numero_documento, omie_fornecedor,
//                                           omie_categoria, omie_conta, lembrar }
//   POST   /admin/guias/:id/lancar          ⚠️ GRAVA NO OMIE { forcar? } (exige OMIE_EMISSAO=1)
//   POST   /admin/guias/:id/anexo           ⚠️ GRAVA NO OMIE: tenta anexar o PDF de novo
//   POST   /admin/guias/:id/descartar       tira da fila (só no sistema)
//   POST   /admin/guias/:id/restaurar       volta para "a conferir"

const express = require("express");
const { authRequired } = require("../middleware/authRequired");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { painelNovoOnly } = require("../services/painel-novo.service");
const guias = require("../services/guias.service");

const router = express.Router();
const guarda = [authRequired, masterAdminOnly, painelNovoOnly];

function _id(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return null; }
  return id;
}

function _falha(res, rota, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(`[guias] ${rota}:`, err.message);
  const corpo = { error: status >= 500 && !err.status ? "Erro nas guias." : err.message };
  if (err.parecidas) corpo.parecidas = err.parecidas;
  return res.status(status).json(corpo);
}

router.get("/guias", ...guarda, async (req, res) => {
  try { res.json(await guias.listar()); }
  catch (err) { _falha(res, "GET", err); }
});

router.get("/guias/opcoes", ...guarda, async (req, res) => {
  try { res.json(await guias.opcoes()); }
  catch (err) { _falha(res, "opcoes", err); }
});

router.get("/guias/fornecedores", ...guarda, async (req, res) => {
  try { res.json({ fornecedores: await guias.fornecedores(req.query.q) }); }
  catch (err) { _falha(res, "fornecedores", err); }
});

router.post("/guias", ...guarda, async (req, res) => {
  try {
    const b64 = String((req.body && req.body.pdf_base64) || "").replace(/^data:[^,]*,/, "");
    if (!b64) return res.status(400).json({ error: "Mande o PDF da guia." });
    const buf = Buffer.from(b64, "base64");
    res.status(201).json(await guias.receber(buf, req.body.nome, req.user?.id));
  } catch (err) { _falha(res, "POST", err); }
});

router.get("/guias/:id/pdf", ...guarda, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try {
    const { buffer, nome } = await guias.pdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(nome)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  } catch (err) { _falha(res, "pdf", err); }
});

router.patch("/guias/:id", ...guarda, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try { res.json({ guia: await guias.atualizar(id, req.body || {}, req.user?.id) }); }
  catch (err) { _falha(res, "PATCH", err); }
});

router.post("/guias/:id/lancar", ...guarda, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try { res.json(await guias.lancar(id, { forcar: !!(req.body && req.body.forcar) }, req.user?.id)); }
  catch (err) { _falha(res, "lancar", err); }
});

router.post("/guias/:id/anexo", ...guarda, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try { res.json(await guias.anexarDeNovo(id)); }
  catch (err) { _falha(res, "anexo", err); }
});

router.post("/guias/:id/descartar", ...guarda, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try { res.json({ guia: await guias.descartar(id) }); }
  catch (err) { _falha(res, "descartar", err); }
});

router.post("/guias/:id/restaurar", ...guarda, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try { res.json({ guia: await guias.restaurar(id) }); }
  catch (err) { _falha(res, "restaurar", err); }
});

module.exports = router;
