// src/routes/cobranca.routes.js
//
// Cobrança: os títulos em atraso que o sistema emitiu (integração com o Omie,
// fase 3 — docs/modulos/omie-integracao.md). Montado em /admin (o SW já trata
// /admin como network first). Só o admin: é financeiro (decisão do Pedro,
// 18/11/2026), como o faturamento do Omie.
//
//   GET    /admin/cobranca                  a lista (cópia do banco; não chama o Omie)
//   POST   /admin/cobranca/atualizar        refaz a cópia do Omie agora (só leitura lá)
//   GET    /admin/cobranca/:codigo/boleto   link do PDF do boleto (ObterBoleto, guardado)
//   PUT    /admin/cobranca/:codigo/pago     "já pagou", só no sistema { pago_em?, observacao? }
//   DELETE /admin/cobranca/:codigo/pago     desfaz a marca
//
// Nada aqui grava no Omie.

const express = require("express");
const { authRequired } = require("../middleware/authRequired");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const cob = require("../services/omie-receber.service");
const fat = require("../services/omie-faturamento.service");

const router = express.Router();
const guarda = [authRequired, masterAdminOnly];

function _codigo(req, res) {
  const c = String(req.params.codigo || "");
  if (!/^\d{1,18}$/.test(c)) { res.status(400).json({ error: "código do título inválido" }); return null; }
  return c;
}

function _falha(res, rota, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(`[cobranca] ${rota}:`, err);
  return res.status(status).json({ error: status >= 500 && !err.status ? "Erro na cobrança." : err.message });
}

// ── Avisos de cobrança por e-mail (migration 102, docs/modulos/cobranca-avisos.md)
//   GET    /admin/cobranca/avisos               a fila de hoje (refeita na hora) + histórico + regras
//   PUT    /admin/cobranca/avisos/regras        { dias_antes, atraso_1, atraso_2, automatico }
//   GET    /admin/cobranca/avisos/:id/email     o e-mail como vai sair { assunto, html, para, anexo }
//   POST   /admin/cobranca/avisos/enviar        ⚠️ MANDA E-MAIL AO CLIENTE { ids? } (exige COBRANCA_EMAIL=1)
//   POST   /admin/cobranca/avisos/:id/ignorar   tira da fila
//   PUT    /admin/cobranca/avisos/:id/para      { destinatarios } — troca só neste aviso
// Estas rotas vêm antes de /cobranca/:codigo/... para "avisos" não virar código.
const avisos = require("../services/cobranca-avisos.service");
const { setConfig } = require("../services/config.service");
const { painelNovoOnly } = require("../services/painel-novo.service");
const guardaAvisos = [authRequired, masterAdminOnly, painelNovoOnly];

function _idAviso(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return null; }
  return id;
}

router.get("/cobranca/avisos", ...guardaAvisos, async (req, res) => {
  try {
    let fila = null;
    try { fila = await avisos.montarFila(); } catch (e) { console.error("[cobranca] montar fila:", e.message); }
    res.json({ ...(await avisos.listar()), fila });
  } catch (err) { _falha(res, "GET avisos", err); }
});

router.put("/cobranca/avisos/regras", ...guardaAvisos, async (req, res) => {
  const b = req.body || {};
  try {
    const mapa = { dias_antes: "cobranca.dias_antes", atraso_1: "cobranca.atraso_1", atraso_2: "cobranca.atraso_2" };
    for (const [k, chave] of Object.entries(mapa)) {
      if (b[k] !== undefined) await setConfig(chave, String(Number(b[k])), req.user?.id);
    }
    if (b.automatico !== undefined) await setConfig("cobranca.avisos_automatico", b.automatico ? "true" : "false", req.user?.id);
    const r = await avisos.regras();
    if (r.atraso_2 > 0 && r.atraso_1 > 0 && r.atraso_2 <= r.atraso_1) {
      return res.status(400).json({ error: "A segunda cobrança tem que vir depois da primeira.", regras: r });
    }
    res.json({ regras: r });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/cobranca/avisos/:id/email", ...guardaAvisos, async (req, res) => {
  const id = _idAviso(req, res); if (!id) return;
  try { res.json(await avisos.previa(id)); }
  catch (err) { _falha(res, "previa aviso", err); }
});

router.post("/cobranca/avisos/enviar", ...guardaAvisos, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids || !ids.length) return res.status(400).json({ error: "Escolha os avisos a enviar." });
    res.json(await avisos.enviar(ids, { usuarioId: req.user?.id }));
  } catch (err) { _falha(res, "enviar avisos", err); }
});

router.post("/cobranca/avisos/:id/ignorar", ...guardaAvisos, async (req, res) => {
  const id = _idAviso(req, res); if (!id) return;
  try { res.json(await avisos.ignorar(id)); }
  catch (err) { _falha(res, "ignorar aviso", err); }
});

router.put("/cobranca/avisos/:id/para", ...guardaAvisos, async (req, res) => {
  const id = _idAviso(req, res); if (!id) return;
  try { res.json(await avisos.trocarDestinatarios(id, req.body?.destinatarios || "")); }
  catch (err) { _falha(res, "trocar destinatários", err); }
});

router.get("/cobranca", ...guarda, async (req, res) => {
  try { res.json(await cob.listar()); }
  catch (err) { _falha(res, "GET", err); }
});

// A cópia dos atrasados depende da dos contratos, clientes e do lote (é ela
// que liga o título ao contrato): atualizar é refazer a sincronização toda,
// a mesma do "Atualizar do Omie" dos contratos (com o intervalo mínimo dela).
router.post("/cobranca/atualizar", ...guarda, async (req, res) => {
  try {
    const r = await fat.sincronizar();
    if (r.pulado) return res.json({ ok: true, pulado: true, motivo: r.motivo });
    if (r.erro_cobranca) return res.status(502).json({ error: "O Omie não respondeu: " + r.erro_cobranca });
    res.json({ ok: true, ...(r.cobranca || {}) });
  } catch (err) {
    console.error("[cobranca] atualizar:", err.message);
    res.status(err.status && err.status < 600 ? err.status : 502).json({ error: "O Omie não respondeu: " + err.message });
  }
});

router.get("/cobranca/:codigo/boleto", ...guarda, async (req, res) => {
  const c = _codigo(req, res); if (!c) return;
  try { res.json(await cob.boleto(c)); }
  catch (err) { _falha(res, "boleto", err); }
});

router.put("/cobranca/:codigo/pago", ...guarda, async (req, res) => {
  const c = _codigo(req, res); if (!c) return;
  try { res.json(await cob.marcarPago(c, req.body || {}, req.user?.id)); }
  catch (err) { _falha(res, "marcar pago", err); }
});

router.delete("/cobranca/:codigo/pago", ...guarda, async (req, res) => {
  const c = _codigo(req, res); if (!c) return;
  try { res.json(await cob.desmarcarPago(c)); }
  catch (err) { _falha(res, "desmarcar pago", err); }
});

module.exports = router;
