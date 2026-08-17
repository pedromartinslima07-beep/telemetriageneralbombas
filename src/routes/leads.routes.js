// src/routes/leads.routes.js
//
// Contatos vindos do formulário da landing pública (public/index.html).
//
// ⚠️ `POST /leads` é a ÚNICA rota de escrita do sistema sem autenticação além
// do `POST /telemetria` (que ao menos exige `X-Device-Key`). Qualquer um na
// internet chega aqui, então as três defesas abaixo não são opcionais:
//   1. rate limit por IP;
//   2. honeypot (`site` — campo escondido no CSS que só bot preenche);
//   3. validação + truncagem de todo campo antes do INSERT.
//
// A leitura (`GET /leads`) é de gestão: é informação comercial, não operacional.

const express = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");
const { sendLeadNovo } = require("../services/email");

const router = express.Router();

// Um lead é um ato deliberado e raro. 5 por hora por IP é folgado pra pessoa
// (inclusive corrigindo um erro de digitação) e apertado pra script.
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas solicitações. Tente novamente mais tarde." },
});

const UNIDADES_VALIDAS = ["ate-50", "51-150", "151-300", "acima-300"];

// Trunca no limite da coluna em vez de rejeitar: o objetivo é capturar o
// contato, não ensinar o visitante a preencher formulário.
function _texto(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// Validação proposital de e-mail: só o que impede o contato de ser inútil.
// Regex estrita rejeita endereço válido e some com lead de verdade.
function _emailValido(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// ─── POST /leads — público ──────────────────────────────────────────────────
router.post("/", leadLimiter, async (req, res) => {
  const b = req.body || {};

  // Honeypot: invisível no formulário real, logo só bot preenche. Responde 200
  // de propósito — 4xx ensina o bot que o campo existe e vale evitar.
  if (_texto(b.site, 200)) {
    return res.json({ ok: true });
  }

  const nome  = _texto(b.nome, 200);
  const email = _texto(b.email, 255);

  if (!nome)                 return res.status(400).json({ error: "Informe seu nome." });
  if (!_emailValido(email))  return res.status(400).json({ error: "Informe um e-mail válido." });

  const unidades = UNIDADES_VALIDAS.includes(b.unidades) ? b.unidades : null;

  const dados = {
    nome,
    condominio: _texto(b.condominio, 200),
    email,
    telefone:   _texto(b.telefone, 40),
    unidades,
    mensagem:   _texto(b.mensagem, 2000),
  };

  try {
    const r = await pool.query(
      `INSERT INTO leads (nome, condominio, email, telefone, unidades, mensagem, origem, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        dados.nome, dados.condominio, dados.email, dados.telefone,
        dados.unidades, dados.mensagem,
        _texto(b.origem, 60) || "landing",
        _texto(req.ip, 64),
      ]
    );

    // O lead já está gravado. Falha de e-mail não pode virar erro pro visitante
    // — ele preencheu certo, e perder o contato por causa da Resend seria o
    // pior desfecho possível desta rota.
    sendLeadNovo(dados).catch((e) =>
      console.error("[leads] falha ao notificar comercial:", e.message)
    );

    res.status(201).json({ ok: true, id: r.rows[0].id });
  } catch (e) {
    console.error("[leads] erro ao gravar:", e.message);
    res.status(500).json({ error: "Não foi possível registrar seu contato. Tente novamente." });
  }
});

// ─── GET /leads — gestão ────────────────────────────────────────────────────
router.get("/", authRequired, gestaoOnly, async (req, res) => {
  const { status } = req.query;
  const filtros = [];
  const params  = [];

  if (status) {
    params.push(status);
    filtros.push(`status = $${params.length}`);
  }

  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

  try {
    const r = await pool.query(
      `SELECT id, nome, condominio, email, telefone, unidades, mensagem,
              origem, status, criado_em
         FROM leads
         ${where}
        ORDER BY criado_em DESC
        LIMIT 500`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    console.error("[leads] erro ao listar:", e.message);
    res.status(500).json({ error: "Erro ao listar leads" });
  }
});

// ─── PATCH /leads/:id — gestão (andar o funil) ──────────────────────────────
router.patch("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }
  if (!["novo", "contatado", "qualificado", "descartado"].includes(status)) {
    return res.status(400).json({ error: "status inválido" });
  }

  try {
    const r = await pool.query(
      `UPDATE leads SET status = $1 WHERE id = $2 RETURNING id, status`,
      [status, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Lead não encontrado" });
    res.json(r.rows[0]);
  } catch (e) {
    console.error("[leads] erro ao atualizar:", e.message);
    res.status(500).json({ error: "Erro ao atualizar lead" });
  }
});

module.exports = { leadsRouter: router };
