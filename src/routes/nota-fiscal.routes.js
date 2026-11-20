// src/routes/nota-fiscal.routes.js
//
// Nota fiscal do orçamento aprovado, emitida pelo Omie. Montado em /admin
// (o SW já trata /admin como network first). Regra e molde em
// src/services/nota-fiscal.service.js; fluxo em docs/modulos/nota-fiscal.md.
//
//   GET  /admin/orcamentos/avulsos/:id/nota            prévia (não fala com o Omie)
//   POST /admin/orcamentos/avulsos/:id/nota/previa     prévia com o que está marcado no modal
//   POST /admin/orcamentos/avulsos/:id/nota/emitir     emite (exige OMIE_EMISSAO=1)
//   POST /admin/orcamentos/avulsos/:id/nota/atualizar  relê o status no Omie
//   GET  /admin/omie/produtos?q=                       busca no catálogo local (DANFE)
//   POST /admin/omie/produtos/sincronizar              recarrega o catálogo do Omie (só leitura lá)

const express = require("express");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");
const nota = require("../services/nota-fiscal.service");
const catalogo = require("../services/omie-produtos.service");

const router = express.Router();

function _id(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return null; }
  return id;
}

function _obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// { parcelas: 1..12, vencimentos?: ["AAAA-MM-DD", ...] } — o resto é validado
// em montarPagamento (datas em ordem, nenhuma antes de hoje).
function _pagamento(v) {
  if (!v || typeof v !== "object") return null;
  const parcelas = Number(v.parcelas);
  const vencimentos = Array.isArray(v.vencimentos) ? v.vencimentos.slice(0, 12).map(x => String(x).slice(0, 10)) : null;
  return Number.isInteger(parcelas) ? { parcelas, vencimentos } : null;
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

// Prévia com a classificação e os produtos marcados no modal e ainda não
// gravados. POST só porque leva corpo; não grava nada.
router.post("/orcamentos/avulsos/:id/nota/previa", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try {
    const b = req.body || {};
    return res.json(await nota.preparar(id, _obj(b.naturezas), _obj(b.produtos), _pagamento(b.pagamento)));
  } catch (err) { return _falha(res, "POST nota/previa", err); }
});

router.post("/orcamentos/avulsos/:id/nota/emitir", authRequired, gestaoOnly, async (req, res) => {
  const id = _id(req, res); if (!id) return;
  try {
    const b = req.body || {};
    const r = await nota.emitir(id, req.user.id, _obj(b.naturezas), _obj(b.produtos), _pagamento(b.pagamento));
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

// ?historico=1 é o modo do EDITOR DE ITENS do orçamento (peças no orçamento,
// fase A, 20/11/2026): cada produto vem com `ultima_vez` (o preço que a
// General cobrou num orçamento aprovado), o produto lembrado para o texto
// sobe para o topo com `lembrado: true`, e catálogo vazio NÃO dispara a
// sincronização (1 min) no meio da digitação — devolve lista vazia e o
// estado, e a tela diz que o catálogo não está carregado.
// ?orcamento_id= tira o próprio orçamento do "última vez".
router.get("/omie/produtos", authRequired, gestaoOnly, async (req, res) => {
  try {
    const q = String(req.query.q || "").slice(0, 120);
    const estado = await catalogo.estado();
    if (req.query.historico !== "1") return res.json({ produtos: await catalogo.buscar(q, 15), catalogo: estado });

    if (!estado.total) return res.json({ produtos: [], catalogo: estado });
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 6, 1), 15);
    const orcId = Number(req.query.orcamento_id) || null;
    let produtos = await catalogo.buscar(q, limite);
    const lemb = await catalogo.lembradoPara(q);
    if (lemb) produtos = [lemb, ...produtos.filter(p => p.codigo_produto !== lemb.codigo_produto)].slice(0, limite);
    const hist = await catalogo.historico(produtos.map(p => p.codigo_produto), orcId);
    produtos = produtos.map(p => ({ ...p, ultima_vez: hist.get(p.codigo_produto) || null }));
    return res.json({ produtos, catalogo: estado });
  } catch (err) { return _falha(res, "GET omie/produtos", err); }
});

router.post("/omie/produtos/sincronizar", authRequired, gestaoOnly, async (req, res) => {
  try {
    return res.json(await catalogo.sincronizar());
  } catch (err) { return _falha(res, "POST omie/produtos/sincronizar", err); }
});

module.exports = { notaFiscalRouter: router };
