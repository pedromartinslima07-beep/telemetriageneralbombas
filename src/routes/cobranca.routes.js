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
