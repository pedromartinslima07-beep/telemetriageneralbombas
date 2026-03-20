// src/routes/admin.routes.js
const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { OFFLINE_MINUTES } = require("../config");
const { sendPasswordReset } = require("../services/email");

function gerarSenhaAleatoria(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const router = express.Router();

// GET /admin/status  (AGRUPADO POR CONDOMÍNIO -> LISTA RESERVATÓRIOS)
router.get("/status", authRequired, adminOnly, async (req, res) => {
  try {
    const limiteMinutos = OFFLINE_MINUTES;
    const agora = new Date();

    // 1 query: condomínios + reservatórios + última leitura + count alertas abertos
    const q = await pool.query(`
      SELECT
        c.id   AS condominio_id,
        c.nome AS condominio_nome,

        r.id        AS reservatorio_id,
        r.nome      AS reservatorio_nome,
        r.tipo      AS reservatorio_tipo,
        r.device_id AS reservatorio_device_id,
        r.last_seen AS last_seen,

        ul.nivel        AS ultima_nivel,
        ul.bomba_ligada AS ultima_bomba_ligada,
        ul.criado_em    AS ultima_criado_em,

        COALESCE(a.alertas_abertos_count, 0) AS alertas_abertos_count

      FROM condominios c
      LEFT JOIN reservatorios r
        ON r.condominio_id = c.id AND r.ativo = true

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
        WHERE device_id = r.device_id
          AND status = 'aberto'
      ) a ON true

      ORDER BY c.id ASC, r.id ASC
    `);

    // Agrupar por condomínio
    const map = new Map();

    for (const row of q.rows) {
      if (!map.has(row.condominio_id)) {
        map.set(row.condominio_id, {
          condominio: { id: row.condominio_id, nome: row.condominio_nome },
          reservatorios: [],
          resumo: {
            total_reservatorios: 0,
            offline_count: 0,
            alertas_abertos_total: 0,
          },
        });
      }

      const item = map.get(row.condominio_id);

      // condomínio sem reservatórios
      if (!row.reservatorio_id) continue;

      let minutos_sem_atualizar = null;
      let offline = true;

      if (row.last_seen) {
        const ultima = new Date(row.last_seen);
        const diffMs = agora - ultima;
        minutos_sem_atualizar = Math.floor(diffMs / 60000);
        offline = minutos_sem_atualizar > limiteMinutos;
      }

      item.reservatorios.push({
        id: row.reservatorio_id,
        nome: row.reservatorio_nome,
        tipo: row.reservatorio_tipo,
        device_id: row.reservatorio_device_id,

        ultima_leitura: row.ultima_criado_em
          ? {
              device_id: row.reservatorio_device_id,
              nivel: row.ultima_nivel,
              bomba_ligada: row.ultima_bomba_ligada,
              criado_em: row.ultima_criado_em,
            }
          : null,

        minutos_sem_atualizar,
        offline,
        alertas_abertos_count: row.alertas_abertos_count,
      });

      // resumo do condomínio
      item.resumo.total_reservatorios += 1;
      item.resumo.alertas_abertos_total += row.alertas_abertos_count;
      if (offline) item.resumo.offline_count += 1;
    }

    return res.json([...map.values()]);
  } catch (error) {
    console.error("Erro ao buscar /admin/status:", error);
    return res.status(500).json({ error: "Erro ao buscar status geral" });
  }
});

// GET /admin/usuarios  — lista clientes (e admin_viewer) para o painel admin
router.get("/usuarios", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nome, u.email, u.role, u.condominio_id, c.nome AS condominio_nome
      FROM usuarios u
      LEFT JOIN condominios c ON c.id = u.condominio_id
      WHERE u.role IN ('cliente', 'admin_viewer')
      ORDER BY u.role ASC, u.nome ASC
    `);
    return res.json(result.rows);
  } catch (e) {
    console.error("Erro GET /admin/usuarios:", e);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// POST /admin/usuarios/:id/resetar-senha
router.post("/usuarios/:id/resetar-senha", authRequired, adminOnly, async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: "ID inválido" });

  try {
    const result = await pool.query(
      "SELECT id, nome, email FROM usuarios WHERE id = $1 AND role IN ('cliente', 'admin_viewer') LIMIT 1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];
    const novaSenha = gerarSenhaAleatoria(10);
    const hash = await bcrypt.hash(novaSenha, 10);

    await pool.query("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [hash, userId]);

    await sendPasswordReset(user.email, user.nome, novaSenha);

    return res.json({ ok: true, email: user.email });
  } catch (e) {
    console.error("Erro POST /admin/usuarios/:id/resetar-senha:", e);
    return res.status(500).json({ error: "Erro ao redefinir senha" });
  }
});

module.exports = { adminRouter: router };