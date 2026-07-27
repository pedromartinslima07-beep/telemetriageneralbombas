const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { getConfigInt } = require("../services/config.service");

const router = express.Router();

// GET /tecnicos/me — perfil do técnico logado (usado pelo app mobile)
router.get("/me", authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nome, email, telefone, especialidade, cargo, foto_url, disponivel
         FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Técnico não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[tecnicos] GET /me:", err);
    return res.status(500).json({ error: "Erro ao buscar perfil" });
  }
});

// GET /tecnicos/config — config operacional consumida pelo app no boot do
// técnico. Aberto pra qualquer usuário autenticado (não vaza nada sensível).
// Hoje só expõe a frequência do GPS, mas é o lugar pra adicionar futuros
// ajustes operacionais sem precisar de outro endpoint.
router.get("/config", authRequired, async (req, res) => {
  try {
    const gps_frequencia_segundos = await getConfigInt("gps.frequencia_segundos", 60);
    // Janela de expediente do GPS. Vem do banco pra poder ser desligada por
    // ambiente (0–24 = rastreia o tempo todo) sem recompilar o app.
    const expediente_inicio = await getConfigInt("gps.expediente_inicio", 8);
    const expediente_fim    = await getConfigInt("gps.expediente_fim", 18);
    return res.json({
      gps: {
        frequencia_segundos: gps_frequencia_segundos,
        expediente_inicio,
        expediente_fim,
      },
    });
  } catch (err) {
    console.error("[tecnicos-localizacao] GET /config:", err);
    return res.status(500).json({ error: "Erro ao buscar config" });
  }
});

// POST /tecnicos/localizacao — técnico envia ping GPS pelo app.
// Resolve `tecnico_id` via `tecnicos.usuario_id = req.user.id`.
router.post("/localizacao", authRequired, async (req, res) => {
  const { lat, lng, precisao_m, bateria_pct, capturada_em } = req.body || {};

  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return res.status(400).json({ error: "lat e lng são obrigatórios (numéricos)" });
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    return res.status(400).json({ error: "lat/lng fora de range válido" });
  }

  const precN = precisao_m != null ? Number(precisao_m) : null;
  if (precN !== null && !Number.isFinite(precN)) {
    return res.status(400).json({ error: "precisao_m inválido" });
  }
  // Rejeita geolocalização por IP puro (>15 km) — imprecisa demais pro mapa.
  if (precN !== null && precN > 15000) {
    return res.json({ ok: true });
  }
  const batN = bateria_pct != null ? Number(bateria_pct) : null;
  if (batN !== null && (!Number.isInteger(batN) || batN < 0 || batN > 100)) {
    return res.status(400).json({ error: "bateria_pct deve ser inteiro entre 0 e 100" });
  }
  const captAt = capturada_em ? new Date(capturada_em) : new Date();
  if (isNaN(captAt.getTime())) {
    return res.status(400).json({ error: "capturada_em inválido" });
  }

  try {
    const tec = await pool.query(
      `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (tec.rows.length === 0) {
      return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
    }
    const tecnicoId = tec.rows[0].id;

    await pool.query(
      `INSERT INTO tecnico_localizacoes
         (tecnico_id, lat, lng, precisao_m, bateria_pct, capturada_em, atualizada_em)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tecnico_id)
       DO UPDATE SET
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         precisao_m = EXCLUDED.precisao_m,
         bateria_pct = EXCLUDED.bateria_pct,
         capturada_em = EXCLUDED.capturada_em,
         atualizada_em = NOW()`,
      [tecnicoId, latN, lngN, precN, batN, captAt]
    );

    await pool.query(
      `INSERT INTO tecnico_localizacoes_historico
         (tecnico_id, lat, lng, precisao_m, capturada_em)
       VALUES ($1, $2, $3, $4, $5)`,
      [tecnicoId, latN, lngN, precN, captAt]
    );

    return res.json({ ok: true, tecnico_id: tecnicoId });
  } catch (err) {
    console.error("[tecnicos-localizacao] POST /localizacao:", err);
    return res.status(500).json({ error: "Erro ao registrar localização" });
  }
});

// DELETE /tecnicos/localizacao — técnico avisa logout; remove posição do mapa imediatamente
router.delete("/localizacao", authRequired, async (req, res) => {
  try {
    const tec = await pool.query(
      `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (tec.rows.length === 0) return res.json({ ok: true });
    await pool.query(`DELETE FROM tecnico_localizacoes WHERE tecnico_id = $1`, [tec.rows[0].id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tecnicos-localizacao] DELETE /localizacao:", err);
    return res.status(500).json({ error: "Erro ao remover localização" });
  }
});

// GET /tecnicos/localizacao — admin lê posição atual de todos os técnicos ativos
router.get("/localizacao", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        tl.tecnico_id,
        tl.lat,
        tl.lng,
        tl.precisao_m,
        tl.bateria_pct,
        tl.capturada_em,
        t.nome,
        t.especialidade,
        ch.id AS chamado_em_atendimento_id,
        ch.condominio_id AS chamado_condominio_id
      FROM tecnico_localizacoes tl
      JOIN tecnicos t ON t.id = tl.tecnico_id AND t.ativo = true
      LEFT JOIN LATERAL (
        SELECT id, condominio_id
        FROM chamados
        WHERE tecnico_id = tl.tecnico_id AND status = 'em_atendimento'
        ORDER BY criado_em DESC
        LIMIT 1
      ) ch ON true
      WHERE tl.atualizada_em > NOW() - INTERVAL '30 minutes'
      ORDER BY tl.atualizada_em DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("[tecnicos-localizacao] GET /localizacao:", err);
    return res.status(500).json({ error: "Erro ao buscar localizações" });
  }
});

// GET /tecnicos/:id/historico-gps?desde=ISO — admin lê histórico (default últimas 24h)
router.get("/:id/historico-gps", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const desde = req.query.desde
    ? new Date(req.query.desde)
    : new Date(Date.now() - 24 * 3600 * 1000);
  if (isNaN(desde.getTime())) return res.status(400).json({ error: "desde inválido" });

  try {
    const result = await pool.query(
      `SELECT lat, lng, precisao_m, capturada_em
         FROM tecnico_localizacoes_historico
        WHERE tecnico_id = $1 AND capturada_em >= $2
        ORDER BY capturada_em ASC
        LIMIT 5000`,
      [id, desde]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[tecnicos-localizacao] GET /:id/historico-gps:", err);
    return res.status(500).json({ error: "Erro ao buscar histórico de GPS" });
  }
});

module.exports = { tecnicosLocalizacaoRouter: router };
