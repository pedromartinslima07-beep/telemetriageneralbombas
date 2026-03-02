// src/routes/cliente.routes.js
const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { clienteOnly } = require("../middleware/clienteOnly");

const router = express.Router();

// GET /cliente/status  (AGORA baseado em RESERVATÓRIOS)
router.get("/status", authRequired, clienteOnly, async (req, res) => {
  try {
    const condominioId = Number(req.user.condominio_id);

    if (!condominioId) {
      return res.status(403).json({ error: "Cliente sem condomínio vinculado" });
    }

    // 1) Condomínio (SEM device_id)
    const condominioResult = await pool.query(
      `SELECT id, nome, endereco, bairro, cidade, uf
       FROM condominios
       WHERE id = $1
       LIMIT 1`,
      [condominioId]
    );

    if (condominioResult.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    const condominio = condominioResult.rows[0];

    // 2) Reservatórios + última leitura + offline + contagem de alertas
    const limiteMinutos = 10;

    const reservsRes = await pool.query(
      `
      SELECT
        r.id,
        r.nome,
        r.tipo,
        r.device_id,

        ul.nivel         AS ultima_nivel,
        ul.bomba_ligada  AS ultima_bomba_ligada,
        ul.criado_em     AS ultima_criado_em,

        CASE
          WHEN ul.criado_em IS NULL THEN true
          WHEN (NOW() - ul.criado_em) > ($2 || ' minutes')::interval THEN true
          ELSE false
        END AS offline,

        CASE
          WHEN ul.criado_em IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - ul.criado_em))/60)::int
        END AS minutos_sem_atualizar,

        COALESCE(a.alertas_abertos_count, 0) AS alertas_abertos_count

      FROM reservatorios r

      LEFT JOIN LATERAL (
        SELECT nivel, bomba_ligada, criado_em
        FROM leituras
        WHERE device_id = r.device_id
        ORDER BY criado_em DESC
        LIMIT 1
      ) ul ON true

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS alertas_abertos_count
        FROM alertas
        WHERE device_id = r.device_id AND status = 'aberto'
      ) a ON true

      WHERE r.condominio_id = $1
      ORDER BY r.id ASC
      `,
      [condominioId, limiteMinutos]
    );

    const reservatorios = reservsRes.rows.map(r => ({
      id: r.id,
      nome: r.nome,
      tipo: r.tipo,
      device_id: r.device_id,
      ultima_leitura: r.ultima_criado_em ? {
        device_id: r.device_id,
        nivel: r.ultima_nivel,
        bomba_ligada: r.ultima_bomba_ligada,
        criado_em: r.ultima_criado_em,
      } : null,
      offline: !!r.offline,
      minutos_sem_atualizar: r.minutos_sem_atualizar,
      alertas_abertos_count: r.alertas_abertos_count,
    }));

    // 3) Alertas abertos (de TODOS os reservatórios do condomínio)
    const alertasResult = await pool.query(
      `
      SELECT a.id, a.device_id, a.tipo, a.mensagem, a.status, a.criado_em, a.atualizado_em
      FROM alertas a
      JOIN reservatorios r ON r.device_id = a.device_id
      WHERE r.condominio_id = $1
        AND a.status = 'aberto'
      ORDER BY a.atualizado_em DESC
      `,
      [condominioId]
    );

    // 4) ultima_leitura "geral" (mais recente entre os reservatórios)
    let ultimaGeral = null;
    for (const r of reservatorios) {
      const u = r.ultima_leitura;
      if (!u?.criado_em) continue;
      if (!ultimaGeral) ultimaGeral = u;
      else if (new Date(u.criado_em) > new Date(ultimaGeral.criado_em)) ultimaGeral = u;
    }

    return res.json({
      condominio,
      reservatorios,
      ultima_leitura: ultimaGeral, // mantém compatível com o seu cliente.js atual
      alertas_abertos: alertasResult.rows,
    });

  } catch (error) {
    console.error("Erro cliente/status:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// POST /cliente/trocar-senha
router.post("/trocar-senha", authRequired, clienteOnly, async (req, res) => {
  const { senha_atual, senha_nova } = req.body || {};

  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: "Campos: senha_atual, senha_nova" });
  }
  if (String(senha_nova).length < 6) {
    return res
      .status(400)
      .json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
  }

  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const u = result.rows[0];

    const ok = await bcrypt.compare(String(senha_atual), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual inválida" });
    }

    const novaHash = await bcrypt.hash(String(senha_nova), 10);

    await pool.query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [
      userId,
      novaHash,
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Erro /cliente/trocar-senha:", e);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

module.exports = { clienteRouter: router };