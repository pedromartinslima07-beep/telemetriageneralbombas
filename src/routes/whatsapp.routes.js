const express = require("express");
const OpenAI = require("openai");
const { pool } = require("../db");
const { receberWebhook, verificarWebhook } = require("../controllers/whatsapp.controller");
const { enviarMensagem } = require("../services/evolution.service");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");

let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");
  _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

async function _buscarMensagensParaIA(convId) {
  const r = await pool.query(
    `SELECT direcao, conteudo, tipo FROM mensagens_whatsapp
     WHERE conversa_id = $1 AND tipo = 'text' AND conteudo IS NOT NULL
     ORDER BY criado_em ASC LIMIT 40`,
    [convId]
  );
  return r.rows.map(m => ({
    role: m.direcao === "entrada" ? "user" : "assistant",
    content: m.conteudo,
  }));
}

const router = express.Router();

router.get("/webhook", verificarWebhook);   // verificação da Meta
router.post("/webhook", receberWebhook);    // receber mensagens

// GET /whatsapp/conversas
router.get("/conversas", authRequired, gestaoOnly, async (req, res) => {
  const { condominio_id } = req.query;
  const values = [];
  const conditions = [];

  if (condominio_id) {
    values.push(Number(condominio_id));
    conditions.push(`cw.condominio_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT
         cv.id,
         cv.status,
         cv.canal,
         cv.criado_em,
         cv.fechado_em,
         cv.assumida_por_id,
         cv.assumida_em,
         u.nome AS assumida_por_nome,
         cw.telefone,
         cw.nome     AS cliente_nome,
         cw.condominio_id,
         c.nome      AS condominio_nome,
         (SELECT COUNT(*)::int FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id) AS total_mensagens,
         (SELECT conteudo FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id ORDER BY criado_em DESC LIMIT 1) AS ultima_mensagem,
         (SELECT criado_em FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id ORDER BY criado_em DESC LIMIT 1) AS ultima_mensagem_em,
         (SELECT direcao  FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id ORDER BY criado_em DESC LIMIT 1) AS ultima_direcao,
         (SELECT COUNT(*)::int FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id AND m.direcao = 'entrada' AND m.lida_em IS NULL) AS unread_count
       FROM conversas_whatsapp cv
       JOIN clientes_whatsapp cw ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN condominios c   ON c.id  = cw.condominio_id
       LEFT JOIN usuarios u      ON u.id  = cv.assumida_por_id
       ${where}
       ORDER BY cv.criado_em DESC
       LIMIT 100`,
      values
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[whatsapp] GET /conversas:", err);
    return res.status(500).json({ error: "Erro ao buscar conversas" });
  }
});

// GET /whatsapp/conversas/:id
router.get("/conversas/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const conversa = await pool.query(
      `SELECT
         cv.*,
         cw.telefone,
         cw.nome  AS cliente_nome,
         cw.condominio_id,
         c.nome   AS condominio_nome,
         u.nome   AS assumida_por_nome
       FROM conversas_whatsapp cv
       JOIN clientes_whatsapp cw ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN condominios c   ON c.id  = cw.condominio_id
       LEFT JOIN usuarios u      ON u.id  = cv.assumida_por_id
       WHERE cv.id = $1`,
      [id]
    );

    if (conversa.rows.length === 0) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }

    const mensagens = await pool.query(
      `SELECT direcao, tipo, conteudo, ia_categoria, ia_urgencia, ia_resumo, criado_em
       FROM mensagens_whatsapp
       WHERE conversa_id = $1
       ORDER BY criado_em ASC`,
      [id]
    );

    // Marca todas as mensagens de entrada como lidas
    await pool.query(
      `UPDATE mensagens_whatsapp SET lida_em = NOW()
       WHERE conversa_id = $1 AND direcao = 'entrada' AND lida_em IS NULL`,
      [id]
    );

    return res.json({ ...conversa.rows[0], mensagens: mensagens.rows });
  } catch (err) {
    console.error("[whatsapp] GET /conversas/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar conversa" });
  }
});

// PATCH /whatsapp/conversas/:id/fechar
router.patch("/conversas/:id/fechar", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
       SET status = 'fechada', fechado_em = NOW(), estado_conversa = 'finalizado'
       WHERE id = $1
       RETURNING id, status, fechado_em`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[whatsapp] PATCH /conversas/:id/fechar:", err);
    return res.status(500).json({ error: "Erro ao fechar conversa" });
  }
});

// PATCH /whatsapp/conversas/:id/reabrir
router.patch("/conversas/:id/reabrir", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
       SET status = 'aberta', fechado_em = NULL
       WHERE id = $1
       RETURNING id, status`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[whatsapp] PATCH /conversas/:id/reabrir:", err);
    return res.status(500).json({ error: "Erro ao reabrir conversa" });
  }
});

// PATCH /whatsapp/conversas/:id/assumir
// Atendente humano assume a conversa - IA para de responder automaticamente.
router.patch("/conversas/:id/assumir", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
       SET assumida_por_id = $1, assumida_em = NOW(), status = 'em_atendimento',
           aguardando_atendente = FALSE
       WHERE id = $2
       RETURNING id, assumida_por_id, assumida_em, status`,
      [req.user?.id || null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[whatsapp] PATCH /conversas/:id/assumir:", err);
    return res.status(500).json({ error: "Erro ao assumir conversa" });
  }
});

// PATCH /whatsapp/conversas/:id/devolver-ia
// Limpa os campos de "assumida" - IA volta a responder.
router.patch("/conversas/:id/devolver-ia", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
       SET assumida_por_id = NULL, assumida_em = NULL, status = 'aberta'
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[whatsapp] PATCH /conversas/:id/devolver-ia:", err);
    return res.status(500).json({ error: "Erro ao devolver conversa pra IA" });
  }
});

// PATCH /whatsapp/conversas/:id/vincular-condominio
// Vincula o CLIENTE (não só a conversa) a um condomínio.
router.patch("/conversas/:id/vincular-condominio", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  const condoId = Number(req.body?.condominio_id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  if (!Number.isInteger(condoId) || condoId <= 0) return res.status(400).json({ error: "condominio_id inválido" });

  try {
    // Acha o cliente_whatsapp_id dessa conversa, depois atualiza
    const r = await pool.query(
      `UPDATE clientes_whatsapp
       SET condominio_id = $1
       WHERE id = (SELECT cliente_whatsapp_id FROM conversas_whatsapp WHERE id = $2)
       RETURNING id, condominio_id`,
      [condoId, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa/cliente não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[whatsapp] PATCH /conversas/:id/vincular-condominio:", err);
    return res.status(500).json({ error: "Erro ao vincular condomínio" });
  }
});

// POST /whatsapp/conversas/:id/responder
// Atendente humano envia mensagem; auto-assume a conversa se não estava assumida.
router.post("/conversas/:id/responder", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const texto = String(req.body?.texto || "").trim();
  if (!texto) return res.status(400).json({ error: "texto obrigatório" });
  if (texto.length > 4096) return res.status(400).json({ error: "mensagem muito longa (máx 4096 chars)" });

  try {
    // Busca a conversa + telefone do cliente
    const cvRes = await pool.query(
      `SELECT cv.id, cv.assumida_por_id, cv.status, cw.telefone
       FROM conversas_whatsapp cv
       JOIN clientes_whatsapp cw ON cw.id = cv.cliente_whatsapp_id
       WHERE cv.id = $1`,
      [id]
    );
    if (cvRes.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    const conv = cvRes.rows[0];
    if (conv.status === "fechada") return res.status(400).json({ error: "Conversa já está fechada" });

    // Auto-assume se ainda não foi assumida
    if (!conv.assumida_por_id) {
      await pool.query(
        `UPDATE conversas_whatsapp SET assumida_por_id = $1, assumida_em = NOW(), status = 'em_atendimento' WHERE id = $2`,
        [req.user.id, id]
      );
    }

    // Envia via Evolution API (não bloqueia a resposta se falhar)
    try {
      await enviarMensagem(conv.telefone, texto);
    } catch (evErr) {
      console.error("[whatsapp] erro ao enviar via Evolution:", evErr.message);
    }

    // Persiste a mensagem enviada
    const msgRes = await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, conteudo, tipo)
       VALUES ($1, 'saida', $2, 'text')
       RETURNING id, direcao, conteudo, tipo, criado_em`,
      [id, texto]
    );

    return res.json({ ok: true, mensagem: msgRes.rows[0] });
  } catch (err) {
    console.error("[whatsapp] POST /conversas/:id/responder:", err);
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

// POST /whatsapp/conversas/:id/resumir
router.post("/conversas/:id/resumir", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const msgs = await _buscarMensagensParaIA(id);
    if (!msgs.length) return res.json({ resumo: "Nenhuma mensagem de texto nessa conversa ainda." });

    const ai = getOpenAI();
    const resp = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você é um assistente de atendimento ao cliente para uma empresa de manutenção predial. Analise o histórico da conversa e responda APENAS com um resumo objetivo em 2-3 frases: qual é o problema relatado, a urgência percebida e o status atual do atendimento. Sem introduções, sem formatação markdown.",
        },
        ...msgs,
        { role: "user", content: "Resuma essa conversa." },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    return res.json({ resumo: resp.choices[0].message.content.trim() });
  } catch (err) {
    console.error("[whatsapp] POST /resumir:", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /whatsapp/conversas/:id/sugerir-resposta
router.post("/conversas/:id/sugerir-resposta", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const msgs = await _buscarMensagensParaIA(id);
    if (!msgs.length) return res.json({ sugestao: "" });

    const ai = getOpenAI();
    const resp = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você é um atendente profissional de uma empresa de manutenção predial (bombas d'água e reservatórios). Analise o histórico e sugira a próxima resposta para o cliente: seja direto, empático e profissional. Escreva APENAS o texto da mensagem, sem aspas, sem introduções como 'Aqui está a sugestão:', sem markdown.",
        },
        ...msgs,
        { role: "user", content: "Sugira a próxima resposta para o cliente." },
      ],
      max_tokens: 200,
      temperature: 0.5,
    });

    return res.json({ sugestao: resp.choices[0].message.content.trim() });
  } catch (err) {
    console.error("[whatsapp] POST /sugerir-resposta:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Curadoria de qualidade (Fase 10A) ──────────────────────────────────────
// Admin marca a qualidade do atendimento pra alimentar um dataset de
// treinamento (few-shot na 10B, fine-tuning na 10D).

const QUALIDADES_VALIDAS = ["excelente", "boa", "aceitavel", "ruim"];

// PATCH /whatsapp/conversas/:id/qualidade  body: { qualidade: '...' | null }
router.patch("/conversas/:id/qualidade", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { qualidade } = req.body || {};
  if (qualidade !== null && qualidade !== undefined && !QUALIDADES_VALIDAS.includes(qualidade)) {
    return res.status(400).json({ error: "qualidade inválida" });
  }
  const valor = qualidade || null;

  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
          SET qualidade_atendimento  = $1,
              qualidade_avaliada_em  = CASE WHEN $1 IS NULL THEN NULL ELSE NOW() END,
              qualidade_avaliada_por = CASE WHEN $1 IS NULL THEN NULL ELSE $2 END
        WHERE id = $3
       RETURNING id, qualidade_atendimento, qualidade_avaliada_em, qualidade_avaliada_por`,
      [valor, req.user?.id || null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[whatsapp] PATCH /conversas/:id/qualidade:", err);
    return res.status(500).json({ error: "Erro ao salvar avaliação" });
  }
});

// GET /whatsapp/conversas/curadoria/stats — contagens pro card de export
router.get("/conversas/curadoria/stats", authRequired, gestaoOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT qualidade_atendimento AS q, COUNT(*)::int AS n
         FROM conversas_whatsapp
        WHERE qualidade_atendimento IS NOT NULL
        GROUP BY qualidade_atendimento`
    );
    const out = { excelente: 0, boa: 0, aceitavel: 0, ruim: 0 };
    for (const row of r.rows) out[row.q] = row.n;
    out.exportavel = out.excelente + out.boa;
    return res.json(out);
  } catch (err) {
    console.error("[whatsapp] GET /conversas/curadoria/stats:", err);
    return res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

// Scrub de PII pra exports — substitui dados pessoais antes de mandar pra OpenAI.
// Conservador: prefere falso positivo (substituir demais) do que vazar.
function scrubPII(texto) {
  if (!texto) return texto;
  return String(texto)
    // CPF (000.000.000-00 ou 11 dígitos seguidos)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    // CNPJ (00.000.000/0000-00)
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    // Telefone BR — (11) 99999-8888 / 11999998888 / +5511999998888
    .replace(/(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, "[FONE]")
    // Email
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    // CEP
    .replace(/\b\d{5}-?\d{3}\b/g, "[CEP]")
    // RG genérico (8-10 dígitos com pontos/hífen, evita matar números úteis curtos)
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g, "[RG]");
}

// GET /whatsapp/conversas/export?qualidade=excelente,boa&desde=YYYY-MM-DD
// Retorna application/x-ndjson — uma linha JSON por conversa no formato
// {messages:[{role:'system',...},{role:'user',...},...]} pronto pra fine-tuning.
router.get("/conversas/export", authRequired, gestaoOnly, async (req, res) => {
  const qParam = String(req.query.qualidade || "excelente,boa").split(",").map(s => s.trim()).filter(Boolean);
  const qualidades = qParam.filter(q => QUALIDADES_VALIDAS.includes(q));
  if (!qualidades.length) return res.status(400).json({ error: "qualidade inválida" });

  const desde = req.query.desde && /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : null;

  try {
    const where = [`c.qualidade_atendimento = ANY($1)`];
    const vals  = [qualidades];
    if (desde) { vals.push(desde); where.push(`c.qualidade_avaliada_em >= $${vals.length}::date`); }

    const conversas = await pool.query(
      `SELECT c.id, c.qualidade_atendimento
         FROM conversas_whatsapp c
        WHERE ${where.join(" AND ")}
        ORDER BY c.qualidade_avaliada_em DESC`,
      vals
    );

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="conversas-curadas-${new Date().toISOString().slice(0,10)}.jsonl"`);

    const systemContent = "Você é um assistente de atendimento da General Bombas (telemetria e manutenção de bombas hidráulicas em condomínios). Responda como o atendente humano teria respondido.";

    for (const conv of conversas.rows) {
      const msgs = await pool.query(
        `SELECT direcao, conteudo FROM mensagens_whatsapp
          WHERE conversa_id = $1 AND tipo IN ('text','conversation','extendedTextMessage')
            AND conteudo IS NOT NULL
          ORDER BY criado_em ASC`,
        [conv.id]
      );
      const messages = [{ role: "system", content: systemContent }];
      for (const m of msgs.rows) {
        messages.push({
          role:    m.direcao === "entrada" ? "user" : "assistant",
          content: scrubPII(m.conteudo),
        });
      }
      // Só exporta conversas com pelo menos 1 par user→assistant
      const temUser  = messages.some(m => m.role === "user");
      const temAssis = messages.some(m => m.role === "assistant");
      if (temUser && temAssis) {
        res.write(JSON.stringify({ messages, _qualidade: conv.qualidade_atendimento, _conversa_id: conv.id }) + "\n");
      }
    }
    return res.end();
  } catch (err) {
    console.error("[whatsapp] GET /conversas/export:", err);
    if (!res.headersSent) return res.status(500).json({ error: "Erro ao exportar" });
    return res.end();
  }
});

// DELETE /whatsapp/conversas/:id
// Remove conversa + mensagens (CASCADE) e desvincula chamados (SET NULL).
router.delete("/conversas/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `DELETE FROM conversas_whatsapp WHERE id = $1 RETURNING id`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Conversa não encontrada" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp] DELETE /conversas/:id:", err);
    return res.status(500).json({ error: "Erro ao apagar conversa" });
  }
});

module.exports = { whatsappRouter: router };
