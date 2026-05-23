// src/routes/alertas.routes.js
const express = require("express");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");

const router = express.Router();

/**
 * GET /alertas-abertos  (admin only)
 */
router.get("/alertas-abertos", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em
      FROM alertas
      WHERE status = 'aberto'
      ORDER BY criado_em DESC
      LIMIT 500
      `
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar alertas abertos (geral):", error);
    return res.status(500).json({ error: "Erro ao buscar alertas abertos" });
  }
});

/**
 * PATCH /alertas/:id/fechar  (admin only)
 */
router.patch("/alertas/:id/fechar", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE alertas
      SET status = 'resolvido', atualizado_em = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Alerta não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao fechar alerta:", error);
    return res.status(500).json({ error: "Erro ao fechar alerta" });
  }
});

/**
 * GET /alertas/:device_id  (admin only)
 */
router.get("/alertas/:device_id", authRequired, adminOnly, async (req, res) => {
  const { device_id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, device_id, tipo, mensagem, status, criado_em, atualizado_em
      FROM alertas
      WHERE device_id = $1
      ORDER BY criado_em DESC
      LIMIT 200
      `,
      [device_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar alertas:", error);
    return res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

// ============================================================
// Comentários em alertas (telemetria + chamados unificados)
// ============================================================

const ORIGEM_VALIDA = new Set(["telemetria", "chamado"]);

function _validarAlertaRef(origem, id) {
  if (!ORIGEM_VALIDA.has(origem)) return "origem inválida";
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return "id inválido";
  return null;
}

/**
 * GET /alertas/comentarios/:origem/:id — lista comentários de um alerta
 */
router.get("/alertas/comentarios/:origem/:id", authRequired, adminOnly, async (req, res) => {
  const { origem, id } = req.params;
  const erro = _validarAlertaRef(origem, id);
  if (erro) return res.status(400).json({ error: erro });

  try {
    const r = await pool.query(
      `SELECT c.id, c.texto, c.criado_em,
              c.autor_id, u.nome AS autor_nome
       FROM alerta_comentarios c
       LEFT JOIN usuarios u ON u.id = c.autor_id
       WHERE c.alerta_origem = $1 AND c.alerta_id = $2
       ORDER BY c.criado_em ASC`,
      [origem, Number(id)]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[alertas-comentarios] GET:", err);
    return res.status(500).json({ error: "Erro ao buscar comentários" });
  }
});

/**
 * POST /alertas/comentarios — adiciona um comentário
 * body: { origem, id, texto }
 */
router.post("/alertas/comentarios", authRequired, adminOnly, async (req, res) => {
  const { origem, id, texto } = req.body || {};
  const erro = _validarAlertaRef(origem, id);
  if (erro) return res.status(400).json({ error: erro });
  const t = String(texto || "").trim();
  if (!t) return res.status(400).json({ error: "texto vazio" });
  if (t.length > 2000) return res.status(400).json({ error: "texto muito longo (máx 2000)" });

  try {
    const r = await pool.query(
      `INSERT INTO alerta_comentarios (alerta_origem, alerta_id, autor_id, texto)
       VALUES ($1, $2, $3, $4)
       RETURNING id, criado_em, autor_id, texto`,
      [origem, Number(id), req.user?.id || null, t]
    );
    // Fase 8A: comentário do admin num chamado conta como primeira resposta.
    if (origem === "chamado") {
      pool.query(
        `UPDATE chamados SET primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()) WHERE id = $1`,
        [Number(id)]
      ).catch((e) => console.error("[alertas-comentarios] hook primeira_resposta_em:", e.message));
    }
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[alertas-comentarios] POST:", err);
    return res.status(500).json({ error: "Erro ao criar comentário" });
  }
});

// ============================================================
// Análise IA (chamada sob demanda — só quando o usuário clica)
// ============================================================

/**
 * POST /alertas/analisar-ia — gera análise + ações recomendadas pra um alerta
 * body: { origem, id }
 * Resposta: { analise, acoes }
 */
router.post("/alertas/analisar-ia", authRequired, adminOnly, async (req, res) => {
  const { origem, id } = req.body || {};
  const erro = _validarAlertaRef(origem, id);
  if (erro) return res.status(400).json({ error: erro });

  try {
    // Monta contexto a partir da origem
    let contexto = "";
    if (origem === "telemetria") {
      const r = await pool.query(
        `SELECT a.tipo, a.mensagem, a.device_id, a.criado_em,
                r.nome AS reservatorio_nome,
                r.tipo AS reservatorio_tipo,
                r.altura_total_m,
                c.nome AS condominio_nome,
                c.endereco
         FROM alertas a
         LEFT JOIN reservatorios r ON r.device_id = a.device_id
         LEFT JOIN condominios c   ON c.id = r.condominio_id
         WHERE a.id = $1`,
        [Number(id)]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "alerta não encontrado" });
      const a = r.rows[0];
      const altura = a.altura_total_m ? `${a.altura_total_m}m de altura` : "altura não cadastrada";
      contexto = `Alerta de TELEMETRIA: ${a.tipo}\nMensagem: ${a.mensagem}\nReservatório: ${a.reservatorio_nome || "?"} (${a.reservatorio_tipo || "tipo n/d"}, ${altura})\nCondomínio: ${a.condominio_nome || "?"} - ${a.endereco || ""}\nAberto em: ${a.criado_em}`;
    } else {
      const r = await pool.query(
        `SELECT ch.titulo, ch.descricao, ch.prioridade, ch.categoria, ch.status, ch.criado_em,
                c.nome AS condominio_nome, c.endereco
         FROM chamados ch
         LEFT JOIN condominios c ON c.id = ch.condominio_id
         WHERE ch.id = $1`,
        [Number(id)]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "chamado não encontrado" });
      const c = r.rows[0];
      contexto = `Chamado: ${c.titulo}\nCategoria: ${c.categoria || "outro"}\nPrioridade: ${c.prioridade}\nStatus: ${c.status}\nDescrição: ${c.descricao || "(sem descrição)"}\nCondomínio: ${c.condominio_nome || "?"} - ${c.endereco || ""}\nAberto em: ${c.criado_em}`;
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "OpenAI não configurada (OPENAI_API_KEY faltando)" });
    }

    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "Você é um analista de operações de uma empresa de telemetria predial (bombas e reservatórios de água). Responda SEMPRE em JSON com a forma exata: {\"analise\": string (1-2 frases curtas), \"acoes\": string[] (3-5 ações concretas e curtas, máx 60 chars cada)}. Tom técnico, direto. Não use markdown.",
        },
        { role: "user", content: contexto },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = { analise: raw, acoes: [] }; }

    return res.json({
      analise: String(parsed.analise || ""),
      acoes: Array.isArray(parsed.acoes) ? parsed.acoes.map(String).slice(0, 5) : [],
    });
  } catch (err) {
    console.error("[alertas-analisar-ia] erro:", err);
    return res.status(500).json({ error: "Erro ao gerar análise" });
  }
});

module.exports = { alertasRouter: router };