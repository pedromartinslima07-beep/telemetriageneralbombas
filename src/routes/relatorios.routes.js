const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

const _ini = (v) => v || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
const _fim = (v) => v || new Date().toISOString().split("T")[0];

// GET /relatorios/chamados
router.get("/chamados", authRequired, adminOnly, async (req, res) => {
  const { data_ini, data_fim, condominio_id, status, tecnico_id, prioridade } = req.query;

  const conds = [
    "ch.criado_em >= $1",
    "ch.criado_em < ($2::date + interval '1 day')",
  ];
  const vals = [_ini(data_ini), _fim(data_fim)];

  if (condominio_id) { vals.push(Number(condominio_id)); conds.push(`ch.condominio_id = $${vals.length}`); }
  if (status)        { vals.push(status);                conds.push(`ch.status = $${vals.length}`); }
  if (tecnico_id)    { vals.push(Number(tecnico_id));    conds.push(`ch.tecnico_id = $${vals.length}`); }
  if (prioridade)    { vals.push(prioridade);            conds.push(`ch.prioridade = $${vals.length}`); }

  try {
    const result = await pool.query(`
      SELECT
        ch.id, ch.titulo, ch.status, ch.prioridade, ch.categoria,
        ch.criado_em, ch.fechado_em,
        CASE WHEN ch.fechado_em IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (ch.fechado_em - ch.criado_em)) / 3600, 1)
          ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 3600, 1)
        END AS sla_horas,
        c.nome  AS condominio_nome,
        t.nome  AS tecnico_nome,
        u.nome  AS responsavel_nome
      FROM chamados ch
      LEFT JOIN condominios c ON c.id = ch.condominio_id
      LEFT JOIN tecnicos    t ON t.id = ch.tecnico_id
      LEFT JOIN usuarios    u ON u.id = ch.responsavel_id
      WHERE ${conds.join(" AND ")}
      ORDER BY ch.criado_em DESC
      LIMIT 2000
    `, vals);
    return res.json(result.rows);
  } catch (err) {
    console.error("[relatorios] chamados:", err);
    return res.status(500).json({ error: "Erro ao gerar relatório de chamados" });
  }
});

// GET /relatorios/alertas
router.get("/alertas", authRequired, adminOnly, async (req, res) => {
  const { data_ini, data_fim, condominio_id, tipo, status } = req.query;

  const conds = [
    "a.criado_em >= $1",
    "a.criado_em < ($2::date + interval '1 day')",
  ];
  const vals = [_ini(data_ini), _fim(data_fim)];

  if (condominio_id) { vals.push(Number(condominio_id)); conds.push(`r.condominio_id = $${vals.length}`); }
  if (tipo)          { vals.push(tipo);                  conds.push(`a.tipo = $${vals.length}`); }
  if (status)        { vals.push(status);                conds.push(`a.status = $${vals.length}`); }

  try {
    const result = await pool.query(`
      SELECT
        a.id, a.tipo, a.mensagem, a.status,
        a.criado_em, a.atualizado_em,
        CASE WHEN a.status = 'resolvido'
          THEN ROUND(EXTRACT(EPOCH FROM (a.atualizado_em - a.criado_em)) / 3600, 1)
          ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - a.criado_em)) / 3600, 1)
        END AS tempo_horas,
        r.nome  AS reservatorio_nome,
        c.nome  AS condominio_nome
      FROM alertas a
      LEFT JOIN reservatorios r ON r.device_id = a.device_id
      LEFT JOIN condominios   c ON c.id = r.condominio_id
      WHERE ${conds.join(" AND ")}
      ORDER BY a.criado_em DESC
      LIMIT 2000
    `, vals);
    return res.json(result.rows);
  } catch (err) {
    console.error("[relatorios] alertas:", err);
    return res.status(500).json({ error: "Erro ao gerar relatório de alertas" });
  }
});

// GET /relatorios/telemetria  (agregado diário por reservatório)
router.get("/telemetria", authRequired, adminOnly, async (req, res) => {
  const { data_ini, data_fim, condominio_id, device_id } = req.query;

  const conds = [
    "l.criado_em >= $1",
    "l.criado_em < ($2::date + interval '1 day')",
    "(l.nivel_pct IS NOT NULL OR l.nivel IS NOT NULL)",
  ];
  const vals = [_ini(data_ini), _fim(data_fim)];

  if (device_id)     { vals.push(device_id);             conds.push(`l.device_id = $${vals.length}`); }
  if (condominio_id) { vals.push(Number(condominio_id)); conds.push(`r.condominio_id = $${vals.length}`); }

  try {
    const result = await pool.query(`
      SELECT
        DATE(l.criado_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
        l.device_id,
        r.nome AS reservatorio_nome,
        c.nome AS condominio_nome,
        COUNT(*)::int AS leituras,
        MIN(COALESCE(l.nivel_pct,
          CASE l.nivel
            WHEN 'alto'        THEN 85
            WHEN 'medio'       THEN 60
            WHEN 'baixo'       THEN 30
            WHEN 'muito_baixo' THEN 10
          END
        ))::int AS nivel_min,
        ROUND(AVG(COALESCE(l.nivel_pct,
          CASE l.nivel
            WHEN 'alto'        THEN 85
            WHEN 'medio'       THEN 60
            WHEN 'baixo'       THEN 30
            WHEN 'muito_baixo' THEN 10
          END
        )))::int AS nivel_medio,
        MAX(COALESCE(l.nivel_pct,
          CASE l.nivel
            WHEN 'alto'        THEN 85
            WHEN 'medio'       THEN 60
            WHEN 'baixo'       THEN 30
            WHEN 'muito_baixo' THEN 10
          END
        ))::int AS nivel_max,
        SUM(CASE WHEN l.bomba_ligada = true THEN 1 ELSE 0 END)::int AS leituras_bomba_on
      FROM leituras l
      LEFT JOIN reservatorios r ON r.device_id = l.device_id
      LEFT JOIN condominios   c ON c.id = r.condominio_id
      WHERE ${conds.join(" AND ")}
      GROUP BY DATE(l.criado_em AT TIME ZONE 'America/Sao_Paulo'), l.device_id, r.nome, c.nome
      ORDER BY dia DESC, c.nome ASC, r.nome ASC
      LIMIT 3000
    `, vals);
    return res.json(result.rows);
  } catch (err) {
    console.error("[relatorios] telemetria:", err);
    return res.status(500).json({ error: "Erro ao gerar relatório de telemetria" });
  }
});

// GET /relatorios/insights — cruzamentos de dados pra aba Insights
// Retorna: { top_condominios, categorias_whatsapp, totais }
router.get("/insights", authRequired, adminOnly, async (req, res) => {
  const { data_ini, data_fim, condominio_id } = req.query;
  const ini = _ini(data_ini);
  const fim = _fim(data_fim);

  // Filtro de condomínio aplicado nas 3 queries
  // conversas_whatsapp vincula condomínio via clientes_whatsapp.condominio_id
  const condCh = condominio_id ? "AND ch.condominio_id = $3" : "";
  const condA  = condominio_id ? "AND r.condominio_id = $3"  : "";
  const condCv = condominio_id ? "AND cw.condominio_id = $3" : "";
  const vals = [ini, fim];
  if (condominio_id) vals.push(Number(condominio_id));

  try {
    // 1. Top condomínios problemáticos: score = chamados_abertos*3 + alertas_ativos*2 + total*1
    //    Une chamados + alertas por condomínio, top 10 por score.
    const topRes = await pool.query(`
      WITH ch_agg AS (
        SELECT ch.condominio_id,
               COUNT(*)::int AS chamados_total,
               SUM(CASE WHEN ch.status <> 'fechado' THEN 1 ELSE 0 END)::int AS chamados_abertos,
               AVG(EXTRACT(EPOCH FROM (COALESCE(ch.fechado_em, NOW()) - ch.criado_em))/3600) AS sla_h
        FROM chamados ch
        WHERE ch.criado_em >= $1
          AND ch.criado_em < ($2::date + interval '1 day')
          AND ch.condominio_id IS NOT NULL
          ${condCh}
        GROUP BY ch.condominio_id
      ),
      al_agg AS (
        SELECT r.condominio_id,
               COUNT(*)::int AS alertas_total,
               SUM(CASE WHEN a.status = 'ativo' THEN 1 ELSE 0 END)::int AS alertas_ativos
        FROM alertas a
        JOIN reservatorios r ON r.device_id = a.device_id
        WHERE a.criado_em >= $1
          AND a.criado_em < ($2::date + interval '1 day')
          AND r.condominio_id IS NOT NULL
          ${condA}
        GROUP BY r.condominio_id
      )
      SELECT c.id, c.nome,
             COALESCE(ch_agg.chamados_total,   0) AS chamados_total,
             COALESCE(ch_agg.chamados_abertos, 0) AS chamados_abertos,
             COALESCE(al_agg.alertas_total,    0) AS alertas_total,
             COALESCE(al_agg.alertas_ativos,   0) AS alertas_ativos,
             ROUND(COALESCE(ch_agg.sla_h, 0)::numeric, 1) AS sla_horas,
             (COALESCE(ch_agg.chamados_abertos,0)*3
              + COALESCE(al_agg.alertas_ativos,0)*2
              + COALESCE(ch_agg.chamados_total,0)
              + COALESCE(al_agg.alertas_total,0)) AS score
      FROM condominios c
      LEFT JOIN ch_agg ON ch_agg.condominio_id = c.id
      LEFT JOIN al_agg ON al_agg.condominio_id = c.id
      WHERE c.ativo = true
        AND (ch_agg.condominio_id IS NOT NULL OR al_agg.condominio_id IS NOT NULL)
      ORDER BY score DESC
      LIMIT 10
    `, vals);

    // 2. Categorias mais comuns nas mensagens classificadas pela IA do WhatsApp
    //    Usa ia_categoria já populada pelo gpt-4o-mini no controller.
    const catRes = await pool.query(`
      SELECT COALESCE(m.ia_categoria, 'sem_classificacao') AS categoria,
             COUNT(*)::int AS total
      FROM mensagens_whatsapp m
      JOIN conversas_whatsapp cv ON cv.id = m.conversa_id
      JOIN clientes_whatsapp   cw ON cw.id = cv.cliente_whatsapp_id
      WHERE m.criado_em >= $1
        AND m.criado_em < ($2::date + interval '1 day')
        AND m.direcao = 'entrada'
        AND m.tipo = 'text'
        ${condCv}
      GROUP BY COALESCE(m.ia_categoria, 'sem_classificacao')
      ORDER BY total DESC
      LIMIT 10
    `, vals);

    // 3. Totais agregados (KPIs do header)
    const totaisRes = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM chamados ch
          WHERE ch.criado_em >= $1
            AND ch.criado_em < ($2::date + interval '1 day')
            ${condCh}) AS chamados_total,
        (SELECT COUNT(*)::int FROM alertas a
          JOIN reservatorios r ON r.device_id = a.device_id
          WHERE a.criado_em >= $1
            AND a.criado_em < ($2::date + interval '1 day')
            ${condA}) AS alertas_total,
        (SELECT COUNT(*)::int FROM mensagens_whatsapp m
          JOIN conversas_whatsapp cv ON cv.id = m.conversa_id
          JOIN clientes_whatsapp   cw ON cw.id = cv.cliente_whatsapp_id
          WHERE m.criado_em >= $1
            AND m.criado_em < ($2::date + interval '1 day')
            AND m.direcao = 'entrada'
            ${condCv}) AS msgs_total
    `, vals);

    return res.json({
      top_condominios: topRes.rows,
      categorias_whatsapp: catRes.rows,
      totais: totaisRes.rows[0] || { chamados_total: 0, alertas_total: 0, msgs_total: 0 },
    });
  } catch (err) {
    console.error("[relatorios] insights:", err);
    return res.status(500).json({ error: "Erro ao gerar insights" });
  }
});

module.exports = { relatoriosRouter: router };
