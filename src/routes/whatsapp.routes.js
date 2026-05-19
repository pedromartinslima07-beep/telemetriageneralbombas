const express = require("express");
const { pool } = require("../db");
const { receberWebhook } = require("../controllers/whatsapp.controller");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

router.post("/webhook", receberWebhook);

// GET /whatsapp/conversas
router.get("/conversas", authRequired, adminOnly, async (req, res) => {
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
         (SELECT direcao  FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id ORDER BY criado_em DESC LIMIT 1) AS ultima_direcao
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
router.get("/conversas/:id", authRequired, adminOnly, async (req, res) => {
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

    return res.json({ ...conversa.rows[0], mensagens: mensagens.rows });
  } catch (err) {
    console.error("[whatsapp] GET /conversas/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar conversa" });
  }
});

// PATCH /whatsapp/conversas/:id/assumir
// Atendente humano assume a conversa - IA para de responder automaticamente.
router.patch("/conversas/:id/assumir", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
       SET assumida_por_id = $1, assumida_em = NOW()
       WHERE id = $2
       RETURNING id, assumida_por_id, assumida_em`,
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
router.patch("/conversas/:id/devolver-ia", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const r = await pool.query(
      `UPDATE conversas_whatsapp
       SET assumida_por_id = NULL, assumida_em = NULL
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
router.patch("/conversas/:id/vincular-condominio", authRequired, adminOnly, async (req, res) => {
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

module.exports = { whatsappRouter: router };
