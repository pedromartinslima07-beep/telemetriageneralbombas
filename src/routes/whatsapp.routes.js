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
         cw.telefone,
         cw.nome     AS cliente_nome,
         cw.condominio_id,
         c.nome      AS condominio_nome,
         (SELECT COUNT(*)::int FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id) AS total_mensagens,
         (SELECT conteudo FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id ORDER BY criado_em DESC LIMIT 1) AS ultima_mensagem,
         (SELECT criado_em FROM mensagens_whatsapp m WHERE m.conversa_id = cv.id ORDER BY criado_em DESC LIMIT 1) AS ultima_mensagem_em
       FROM conversas_whatsapp cv
       JOIN clientes_whatsapp cw ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN condominios c   ON c.id  = cw.condominio_id
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
         c.nome   AS condominio_nome
       FROM conversas_whatsapp cv
       JOIN clientes_whatsapp cw ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN condominios c   ON c.id  = cw.condominio_id
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

module.exports = { whatsappRouter: router };
