const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

const CATEGORIAS = ["vazamento", "bomba_falha", "nivel_baixo", "sem_agua", "ruido", "manutencao", "outro"];

// GET /chamados — lista chamados (com filtros opcionais)
router.get("/", authRequired, adminOnly, async (req, res) => {
  const { status, prioridade, categoria, condominio_id } = req.query;

  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`ch.status = $${values.length}`);
  }
  if (prioridade) {
    values.push(prioridade);
    conditions.push(`ch.prioridade = $${values.length}`);
  }
  if (categoria) {
    values.push(categoria);
    conditions.push(`ch.categoria = $${values.length}`);
  }
  if (condominio_id) {
    values.push(Number(condominio_id));
    conditions.push(`ch.condominio_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT
         ch.id,
         ch.status,
         ch.prioridade,
         ch.categoria,
         ch.titulo,
         ch.descricao,
         ch.condominio_id,
         ch.criado_em,
         ch.atualizado_em,
         ch.fechado_em,
         c.nome  AS condominio_nome,
         u.nome  AS responsavel_nome,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome
       FROM chamados ch
       LEFT JOIN condominios c  ON c.id  = ch.condominio_id
       LEFT JOIN usuarios u     ON u.id  = ch.responsavel_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       ${where}
       ORDER BY ch.criado_em DESC
       LIMIT 200`,
      values
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("[chamados] GET /chamados:", err);
    return res.status(500).json({ error: "Erro ao buscar chamados" });
  }
});

// GET /chamados/:id — detalhe do chamado
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const chamado = await pool.query(
      `SELECT
         ch.*,
         c.nome  AS condominio_nome,
         u.nome  AS responsavel_nome,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome
       FROM chamados ch
       LEFT JOIN condominios c  ON c.id  = ch.condominio_id
       LEFT JOIN usuarios u     ON u.id  = ch.responsavel_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       WHERE ch.id = $1`,
      [id]
    );

    if (chamado.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }

    // Busca mensagens da conversa vinculada
    let mensagens = [];
    if (chamado.rows[0].conversa_id) {
      const msgs = await pool.query(
        `SELECT direcao, tipo, conteudo, ia_categoria, ia_urgencia, ia_resumo, criado_em
         FROM mensagens_whatsapp
         WHERE conversa_id = $1
         ORDER BY criado_em ASC`,
        [chamado.rows[0].conversa_id]
      );
      mensagens = msgs.rows;
    }

    return res.json({ ...chamado.rows[0], mensagens });
  } catch (err) {
    console.error("[chamados] GET /chamados/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar chamado" });
  }
});

// PATCH /chamados/:id — atualiza status, prioridade ou responsável
router.patch("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const { status, prioridade, categoria, responsavel_id } = req.body || {};

  const STATUSES   = ["aberto", "em_atendimento", "fechado"];
  const PRIORIDADES = ["baixa", "media", "alta", "emergencia"];

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status deve ser: ${STATUSES.join(", ")}` });
  }
  if (prioridade && !PRIORIDADES.includes(prioridade)) {
    return res.status(400).json({ error: `prioridade deve ser: ${PRIORIDADES.join(", ")}` });
  }
  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria deve ser: ${CATEGORIAS.join(", ")}` });
  }

  const sets = ["atualizado_em = NOW()"];
  const values = [];

  if (status) {
    values.push(status);
    sets.push(`status = $${values.length}`);
    if (status === "fechado") sets.push("fechado_em = NOW()");
  }
  if (prioridade) {
    values.push(prioridade);
    sets.push(`prioridade = $${values.length}`);
  }
  if (categoria) {
    values.push(categoria);
    sets.push(`categoria = $${values.length}`);
  }
  if (responsavel_id !== undefined) {
    values.push(responsavel_id || null);
    sets.push(`responsavel_id = $${values.length}`);
  }

  if (values.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE chamados SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[chamados] PATCH /chamados/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar chamado" });
  }
});

module.exports = { chamadosRouter: router };
