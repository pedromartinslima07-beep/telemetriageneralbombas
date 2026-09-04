const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { gestaoOnly } = require("../middleware/gestaoOnly");

const router = express.Router();

const _ini = (v) => v || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
const _fim = (v) => v || new Date().toISOString().split("T")[0];

// GET /relatorios/chamados
router.get("/chamados", authRequired, gestaoOnly, async (req, res) => {
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
        ch.primeira_resposta_em, ch.tempo_resolucao_seg,
        CASE WHEN ch.fechado_em IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (ch.fechado_em - ch.criado_em)) / 3600, 1)
          ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 3600, 1)
        END AS sla_horas,
        COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
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
router.get("/alertas", authRequired, gestaoOnly, async (req, res) => {
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
        COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome
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
router.get("/telemetria", authRequired, gestaoOnly, async (req, res) => {
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
        COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
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

// GET /relatorios/painel-vivo — estado operacional agora, sem filtro de
// período (chamados em risco de estourar SLA + workload por técnico).
// Extraído do antigo /sla-dashboard, que rodava isso junto com agregações
// pesadas por período que foram substituídas por exportação CSV.
router.get("/painel-vivo", authRequired, gestaoOnly, async (req, res) => {
  try {
    const [emRiscoRes, workloadRes] = await Promise.all([
      pool.query(`
        SELECT
          ch.id, ch.titulo, ch.prioridade, ch.status, ch.criado_em,
          COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
          t.nome AS tecnico_nome,
          sd.ttr_min,
          ROUND(EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 60.0)::int AS minutos_abertos,
          ROUND((EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 60.0) / sd.ttr_min * 100)::int AS pct_ttr
        FROM chamados ch
        LEFT JOIN condominios    c  ON c.id  = ch.condominio_id
        LEFT JOIN tecnicos       t  ON t.id  = ch.tecnico_id
        LEFT JOIN sla_definicoes sd ON sd.prioridade = ch.prioridade
        WHERE ch.status IN ('aberto', 'em_atendimento')
          AND sd.ttr_min IS NOT NULL
          AND EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 60.0 >= sd.ttr_min * 0.5
        ORDER BY pct_ttr DESC
        LIMIT 20
      `),

      pool.query(`
        SELECT
          t.nome AS tecnico_nome,
          COUNT(*)::int AS abertos,
          COUNT(CASE WHEN ch.prioridade = 'p1' THEN 1 END)::int AS p1,
          COUNT(CASE WHEN ch.prioridade = 'p2' THEN 1 END)::int AS p2,
          COUNT(CASE WHEN ch.prioridade = 'p3' THEN 1 END)::int AS p3,
          COUNT(CASE WHEN ch.prioridade = 'p4' THEN 1 END)::int AS p4
        FROM chamados ch
        JOIN tecnicos t ON t.id = ch.tecnico_id
        WHERE ch.status IN ('aberto', 'em_atendimento')
        GROUP BY t.id, t.nome
        ORDER BY p1 DESC, p2 DESC, abertos DESC
        LIMIT 10
      `),
    ]);

    return res.json({
      em_risco: emRiscoRes.rows,
      workload_tecnico: workloadRes.rows.map(r => ({
        tecnico_nome: r.tecnico_nome,
        abertos: Number(r.abertos) || 0,
        p1: Number(r.p1) || 0,
        p2: Number(r.p2) || 0,
        p3: Number(r.p3) || 0,
        p4: Number(r.p4) || 0,
      })),
    });
  } catch (err) {
    console.error("[relatorios] painel-vivo:", err);
    return res.status(500).json({ error: "Erro ao carregar painel ao vivo" });
  }
});

module.exports = { relatoriosRouter: router };
