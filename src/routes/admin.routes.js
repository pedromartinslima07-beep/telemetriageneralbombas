// src/routes/admin.routes.js
const express = require("express");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { OFFLINE_MINUTES } = require("../config");

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
        ul.nivel_pct    AS ultima_nivel_pct,
        ul.bomba_ligada AS ultima_bomba_ligada,
        ul.criado_em    AS ultima_criado_em,

        COALESCE(a.alertas_abertos_count, 0) AS alertas_abertos_count

      FROM condominios c
      LEFT JOIN reservatorios r
        ON r.condominio_id = c.id AND r.ativo = true

      LEFT JOIN LATERAL (
        SELECT nivel, nivel_pct, bomba_ligada, criado_em
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
              nivel_pct: row.ultima_nivel_pct,
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

// GET /admin/historico?device_ids=A,B,C&horas=24
// Retorna leituras agregadas em buckets para múltiplos reservatórios (até 10).
router.get("/historico", authRequired, adminOnly, async (req, res) => {
  const { device_ids: idsStr, horas: horasStr } = req.query;

  if (!idsStr) {
    return res.status(400).json({ error: "device_ids é obrigatório (separados por vírgula)" });
  }

  const deviceIds = idsStr.split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
  if (deviceIds.length === 0) {
    return res.status(400).json({ error: "Nenhum device_id válido" });
  }

  const horas = Math.min(Math.max(Number(horasStr) || 24, 1), 720);

  // bucket conforme janela
  let bucketSec;
  if (horas <= 6)        bucketSec = 300;    // 5 min
  else if (horas <= 48)  bucketSec = 1800;   // 30 min
  else if (horas <= 168) bucketSec = 3600;   // 1 hora
  else                   bucketSec = 14400;  // 4 horas

  try {
    const result = await pool.query(
      `SELECT
         device_id,
         TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM criado_em) / $2) * $2) AS bucket,
         ROUND(AVG(
           COALESCE(nivel_pct,
             CASE nivel
               WHEN 'alto'        THEN 85
               WHEN 'medio'       THEN 60
               WHEN 'baixo'       THEN 30
               WHEN 'muito_baixo' THEN 10
             END)
         ))::int AS nivel_pct_avg
       FROM leituras
       WHERE device_id = ANY($1::text[])
         AND criado_em >= NOW() - ($3 || ' hours')::interval
         AND (nivel_pct IS NOT NULL OR nivel IS NOT NULL)
       GROUP BY device_id, FLOOR(EXTRACT(EPOCH FROM criado_em) / $2)
       ORDER BY device_id ASC, bucket ASC`,
      [deviceIds, bucketSec, horas]
    );

    // agrupa por device
    const series = {};
    for (const id of deviceIds) series[id] = [];
    for (const row of result.rows) {
      series[row.device_id]?.push({ bucket: row.bucket, nivel_pct_avg: row.nivel_pct_avg });
    }

    return res.json({ horas, bucket_sec: bucketSec, series });
  } catch (error) {
    console.error("Erro ao buscar /admin/historico:", error);
    return res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});

// ----------------------------------------------------------------------------
// GET /admin/geocode?q=<endereço>
// Proxy do Nominatim (OpenStreetMap) para geocoding.
// Respeita o rate-limit de 1 req/s exigido pelo serviço público.
// ----------------------------------------------------------------------------
let _geocodeFila = Promise.resolve();
function _geocodeAguardarVez() {
  // encadeia uma espera de 1100ms após o último request enfileirado
  const espera = new Promise((resolve) => setTimeout(resolve, 1100));
  const minhaVez = _geocodeFila;
  _geocodeFila = _geocodeFila.then(() => espera);
  return minhaVez;
}

router.get("/geocode", authRequired, adminOnly, async (req, res) => {
  const { q } = req.query;
  if (!q || String(q).trim().length < 3) {
    return res.status(400).json({ error: "Parâmetro 'q' obrigatório (>= 3 caracteres)" });
  }

  await _geocodeAguardarVez();

  try {
    const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
      q: String(q).trim(),
      format: "json",
      addressdetails: "1",
      limit: "5",
      countrycodes: "br",
    });

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "TelemetriaGeneralBombas/1.0 (admin geocoding)",
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!resp.ok) {
      console.warn("[geocode] Nominatim respondeu", resp.status);
      return res.status(502).json({ error: "Geocoding indisponível (status " + resp.status + ")" });
    }

    const data = await resp.json();
    return res.json({
      query: String(q),
      results: (Array.isArray(data) ? data : []).map((r) => ({
        display_name: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
        type: r.type,
        importance: r.importance,
      })),
    });
  } catch (err) {
    console.error("Erro geocode:", err);
    return res.status(500).json({ error: "Erro ao consultar geocoding" });
  }
});

module.exports = { adminRouter: router };