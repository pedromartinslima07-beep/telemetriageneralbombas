// src/routes/admin.routes.js
const express = require("express");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

// GET /admin/status  (AGRUPADO POR CONDOMÍNIO -> LISTA RESERVATÓRIOS)
router.get("/status", authRequired, adminOnly, async (req, res) => {
  try {
    const limiteMinutos = Number(process.env.OFFLINE_MINUTES || 10);
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

        ul.nivel        AS ultima_nivel,
        ul.bomba_ligada AS ultima_bomba_ligada,
        ul.criado_em    AS ultima_criado_em,

        COALESCE(a.alertas_abertos_count, 0) AS alertas_abertos_count

      FROM condominios c
      LEFT JOIN reservatorios r
        ON r.condominio_id = c.id

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

      if (row.ultima_criado_em) {
        const ultima = new Date(row.ultima_criado_em);
        const diffMs = agora - ultima;
        minutos_sem_atualizar = Math.floor(diffMs / 60000);
        offline = minutos_sem_atualizar > limiteMinutos;
      } else {
        // sem leitura = offline (MVP)
        offline = true;
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

module.exports = { adminRouter: router };