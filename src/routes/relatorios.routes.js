const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { gerarPdfRelatorio } = require("../services/relatorio-pdf.service");

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

// GET /relatorios/pdf-chamados — gera PDF do relatório de chamados com os mesmos filtros
router.get("/pdf-chamados", authRequired, adminOnly, async (req, res) => {
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
    const [chamadosRes, condoRes, tecRes] = await Promise.all([
      pool.query(`
        SELECT ch.id, ch.titulo, ch.status, ch.prioridade, ch.categoria,
               ch.criado_em, ch.fechado_em,
               CASE WHEN ch.fechado_em IS NOT NULL
                 THEN ROUND(EXTRACT(EPOCH FROM (ch.fechado_em - ch.criado_em)) / 3600, 1)
                 ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 3600, 1)
               END AS sla_horas,
               c.nome AS condominio_nome, t.nome AS tecnico_nome
        FROM chamados ch
        LEFT JOIN condominios c ON c.id = ch.condominio_id
        LEFT JOIN tecnicos    t ON t.id = ch.tecnico_id
        WHERE ${conds.join(" AND ")}
        ORDER BY ch.criado_em DESC
        LIMIT 2000
      `, vals),
      condominio_id ? pool.query("SELECT nome FROM condominios WHERE id = $1", [Number(condominio_id)]) : null,
      tecnico_id    ? pool.query("SELECT nome FROM tecnicos    WHERE id = $1", [Number(tecnico_id)])    : null,
    ]);

    const filtros = {
      data_ini: _ini(data_ini), data_fim: _fim(data_fim),
      condominio_nome: condoRes?.rows[0]?.nome || null,
      tecnico_nome:    tecRes?.rows[0]?.nome   || null,
      status: status || null,
      prioridade: prioridade || null,
    };

    const pdfBuf = await gerarPdfRelatorio({ chamados: chamadosRes.rows, filtros });

    const periodo = `${_ini(data_ini)}_${_fim(data_fim)}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-chamados-${periodo}.pdf"`);
    res.end(pdfBuf);
  } catch (err) {
    console.error("[relatorios] pdf-chamados:", err);
    return res.status(500).json({ error: "Erro ao gerar PDF" });
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

// GET /relatorios/sla-metricas — Fase 8A. 4 KPIs de SLA do período:
//   - TTFR mediano (minutos) — tempo até a primeira resposta humana
//   - TTR mediano (minutos)  — tempo até a resolução (chamados fechados)
//   - taxa_resolucao_lt1h    — % de chamados fechados em menos de 1 hora
//   - taxa_reabertos         — % de chamados que tiveram pelo menos uma
//                              transição de status saindo de 'fechado' no
//                              audit log (historico_chamados, migration 033).
//                              Pega tanto reaberturas pendentes quanto as
//                              que foram refechadas — corrige a limitação
//                              anterior que só contava o estado atual.
router.get("/sla-metricas", authRequired, adminOnly, async (req, res) => {
  const { data_ini, data_fim, condominio_id, prioridade } = req.query;
  const ini = _ini(data_ini);
  const fim = _fim(data_fim);

  const conds = [
    "ch.criado_em >= $1",
    "ch.criado_em < ($2::date + interval '1 day')",
  ];
  const vals = [ini, fim];
  if (condominio_id) { vals.push(Number(condominio_id)); conds.push(`ch.condominio_id = $${vals.length}`); }
  if (prioridade)    { vals.push(prioridade);            conds.push(`ch.prioridade = $${vals.length}`); }

  try {
    const r = await pool.query(`
      WITH base AS (
        SELECT
          ch.id,
          ch.status,
          ch.fechado_em,
          ch.criado_em,
          ch.primeira_resposta_em,
          ch.tempo_resolucao_seg,
          EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em)) / 60.0 AS ttfr_min,
          ch.tempo_resolucao_seg / 60.0 AS ttr_min,
          EXISTS (
            SELECT 1 FROM historico_chamados h
            WHERE h.chamado_id = ch.id
              AND h.campo_alterado = 'status'
              AND h.valor_anterior = 'fechado'
          ) AS foi_reaberto
        FROM chamados ch
        WHERE ${conds.join(" AND ")}
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(tempo_resolucao_seg)::int AS fechados,
        COUNT(primeira_resposta_em)::int AS com_resposta,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttfr_min)::numeric, 1) AS ttfr_mediano_min,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttr_min)::numeric, 1)  AS ttr_mediano_min,
        ROUND(AVG(ttfr_min)::numeric, 1) AS ttfr_medio_min,
        ROUND(AVG(ttr_min)::numeric, 1)  AS ttr_medio_min,
        SUM(CASE WHEN tempo_resolucao_seg IS NOT NULL AND tempo_resolucao_seg < 3600 THEN 1 ELSE 0 END)::int AS resolvidos_lt1h,
        SUM(CASE WHEN foi_reaberto THEN 1 ELSE 0 END)::int AS reabertos_pendentes
      FROM base
    `, vals);

    const k = r.rows[0] || {};
    const fechados = Number(k.fechados) || 0;
    const total = Number(k.total) || 0;
    return res.json({
      filtros: { data_ini: ini, data_fim: fim, condominio_id: condominio_id || null, prioridade: prioridade || null },
      total,
      fechados,
      com_resposta: Number(k.com_resposta) || 0,
      ttfr_mediano_min: k.ttfr_mediano_min == null ? null : Number(k.ttfr_mediano_min),
      ttr_mediano_min:  k.ttr_mediano_min  == null ? null : Number(k.ttr_mediano_min),
      ttfr_medio_min:   k.ttfr_medio_min   == null ? null : Number(k.ttfr_medio_min),
      ttr_medio_min:    k.ttr_medio_min    == null ? null : Number(k.ttr_medio_min),
      taxa_resolucao_lt1h: fechados > 0 ? Math.round(100 * (Number(k.resolvidos_lt1h) / fechados)) : null,
      taxa_reabertos:      total    > 0 ? Math.round(100 * (Number(k.reabertos_pendentes) / total)) : null,
      resolvidos_lt1h: Number(k.resolvidos_lt1h) || 0,
      reabertos_pendentes: Number(k.reabertos_pendentes) || 0,
    });
  } catch (err) {
    console.error("[relatorios] sla-metricas:", err);
    return res.status(500).json({ error: "Erro ao calcular métricas de SLA" });
  }
});

// GET /relatorios/sla-dashboard — Fase 8C. Dashboard completo de SLA:
//   - kpis: % no SLA, TTFR/TTR medianos, chamados em risco
//   - ttr_por_dia: série temporal pra line chart
//   - por_tecnico: performance por técnico
//   - em_risco: chamados abertos que já usaram ≥ 50% do TTR
router.get("/sla-dashboard", authRequired, adminOnly, async (req, res) => {
  const { data_ini, data_fim, condominio_id, prioridade } = req.query;
  const ini = _ini(data_ini);
  const fim = _fim(data_fim);

  const conds = [
    "ch.criado_em >= $1",
    "ch.criado_em < ($2::date + interval '1 day')",
  ];
  const vals = [ini, fim];
  if (condominio_id) { vals.push(Number(condominio_id)); conds.push(`ch.condominio_id = $${vals.length}`); }
  if (prioridade)    { vals.push(prioridade);            conds.push(`ch.prioridade = $${vals.length}`); }
  const where = conds.join(" AND ");

  try {
    const [kpisRes, porDiaRes, porTecnicoRes, emRiscoRes, porPrioRes, workloadRes] = await Promise.all([

      // 1. KPIs: totais + medianas + % no SLA + reabertos (via audit log)
      pool.query(`
        WITH base AS (
          SELECT
            ch.id, ch.status, ch.fechado_em, ch.criado_em,
            ch.primeira_resposta_em, ch.tempo_resolucao_seg,
            EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em)) / 60.0 AS ttfr_min_real,
            ch.tempo_resolucao_seg / 60.0 AS ttr_min_real,
            sd.ttfr_min AS sla_ttfr,
            sd.ttr_min  AS sla_ttr,
            EXISTS (
              SELECT 1 FROM historico_chamados h
              WHERE h.chamado_id = ch.id
                AND h.campo_alterado = 'status'
                AND h.valor_anterior = 'fechado'
            ) AS foi_reaberto
          FROM chamados ch
          LEFT JOIN sla_definicoes sd ON sd.prioridade = ch.prioridade
          WHERE ${where}
        )
        SELECT
          COUNT(*)::int                                                           AS total,
          COUNT(tempo_resolucao_seg)::int                                         AS fechados,
          COUNT(CASE WHEN status IN ('aberto','em_atendimento')
                          AND sla_ttr IS NOT NULL
                          AND EXTRACT(EPOCH FROM (NOW() - criado_em))/60.0 >= sla_ttr * 0.5
                     THEN 1 END)::int                                             AS em_risco,
          COUNT(CASE WHEN status IN ('aberto','em_atendimento')
                          AND primeira_resposta_em IS NULL
                          AND sla_ttfr IS NOT NULL
                          AND criado_em < NOW() - (sla_ttfr || ' minutes')::interval
                     THEN 1 END)::int                                             AS ttfr_violados,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
            (ORDER BY ttfr_min_real)::numeric, 1)                                AS ttfr_mediano_min,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
            (ORDER BY ttr_min_real)::numeric, 1)                                 AS ttr_mediano_min,
          SUM(CASE WHEN primeira_resposta_em IS NOT NULL
                        AND sla_ttfr IS NOT NULL
                        AND ttfr_min_real <= sla_ttfr
                   THEN 1 ELSE 0 END)::int                                        AS ttfr_no_sla,
          COUNT(CASE WHEN primeira_resposta_em IS NOT NULL
                          AND sla_ttfr IS NOT NULL
                     THEN 1 END)::int                                             AS total_com_sla_data,
          SUM(CASE WHEN foi_reaberto THEN 1 ELSE 0 END)::int                      AS reabertos
        FROM base
      `, vals),

      // 2. TTR e TTFR médios por dia (séries temporais para chart duplo)
      pool.query(`
        SELECT
          DATE(ch.criado_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
          ROUND(AVG(CASE WHEN ch.tempo_resolucao_seg IS NOT NULL
                         THEN ch.tempo_resolucao_seg / 60.0 END)::numeric, 1) AS ttr_medio_min,
          ROUND(AVG(CASE WHEN ch.primeira_resposta_em IS NOT NULL
                         THEN EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em)) / 60.0 END)::numeric, 1) AS ttfr_medio_min,
          COUNT(*)::int AS total
        FROM chamados ch
        WHERE ${where}
          AND (ch.tempo_resolucao_seg IS NOT NULL OR ch.primeira_resposta_em IS NOT NULL)
        GROUP BY DATE(ch.criado_em AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY dia ASC
      `, vals),

      // 3. Performance por técnico
      pool.query(`
        SELECT
          t.nome                                                                      AS tecnico_nome,
          COUNT(ch.id)::int                                                           AS total,
          ROUND(AVG(EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em))
            / 60.0)::numeric, 1)                                                     AS ttfr_medio_min,
          ROUND(AVG(ch.tempo_resolucao_seg / 60.0)::numeric, 1)                      AS ttr_medio_min,
          ROUND(AVG(ch.avaliacao_nota)::numeric, 1)                                  AS nota_media,
          SUM(CASE WHEN ch.primeira_resposta_em IS NOT NULL
                        AND sd.ttfr_min IS NOT NULL
                        AND EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em))
                            / 60.0 <= sd.ttfr_min
                   THEN 1 ELSE 0 END)::int                                            AS no_sla,
          COUNT(CASE WHEN ch.primeira_resposta_em IS NOT NULL
                          AND sd.ttfr_min IS NOT NULL
                     THEN 1 END)::int                                                 AS com_sla_data
        FROM chamados ch
        JOIN tecnicos t ON t.id = ch.tecnico_id
        LEFT JOIN sla_definicoes sd ON sd.prioridade = ch.prioridade
        WHERE ${where}
          AND ch.tecnico_id IS NOT NULL
        GROUP BY t.id, t.nome
        ORDER BY total DESC
        LIMIT 20
      `, vals),

      // 4. Chamados em risco (abertos + ≥ 50% do TTR usado)
      pool.query(`
        SELECT
          ch.id, ch.titulo, ch.prioridade, ch.status, ch.criado_em,
          c.nome AS condominio_nome,
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
      `, []),  // sem filtro de data — mostra o estado atual independente de período

      // 6. Workload atual por técnico (estado ao vivo, sem filtro de período)
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
      `, []),

      // 5. Distribuição por prioridade + conformidade SLA por nível
      pool.query(`
        SELECT
          ch.prioridade,
          COUNT(*)::int AS total,
          SUM(CASE WHEN ch.primeira_resposta_em IS NOT NULL
                        AND sd.ttfr_min IS NOT NULL
                        AND EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em)) / 60.0 <= sd.ttfr_min
                   THEN 1 ELSE 0 END)::int AS no_sla,
          COUNT(CASE WHEN ch.primeira_resposta_em IS NOT NULL
                          AND sd.ttfr_min IS NOT NULL
                     THEN 1 END)::int AS com_sla_data,
          ROUND(AVG(EXTRACT(EPOCH FROM (ch.primeira_resposta_em - ch.criado_em)) / 60.0)::numeric, 1) AS ttfr_medio_min
        FROM chamados ch
        LEFT JOIN sla_definicoes sd ON sd.prioridade = ch.prioridade
        WHERE ${where}
        GROUP BY ch.prioridade
        ORDER BY CASE ch.prioridade WHEN 'p1' THEN 0 WHEN 'p2' THEN 1 WHEN 'p3' THEN 2 WHEN 'p4' THEN 3 ELSE 9 END
      `, vals),
    ]);

    const k = kpisRes.rows[0] || {};
    const comSla = Number(k.total_com_sla_data) || 0;
    const noSla  = Number(k.ttfr_no_sla) || 0;

    return res.json({
      filtros: { data_ini: ini, data_fim: fim, condominio_id: condominio_id || null, prioridade: prioridade || null },
      kpis: {
        total:          Number(k.total)           || 0,
        fechados:       Number(k.fechados)        || 0,
        em_risco:       Number(k.em_risco)        || 0,
        ttfr_violados:  Number(k.ttfr_violados)   || 0,
        ttfr_mediano_min: k.ttfr_mediano_min != null ? Number(k.ttfr_mediano_min) : null,
        ttr_mediano_min:  k.ttr_mediano_min  != null ? Number(k.ttr_mediano_min)  : null,
        pct_no_sla: comSla > 0 ? Math.round(100 * noSla / comSla) : null,
        total_com_sla_data: comSla,
        reabertos: Number(k.reabertos) || 0,
        taxa_reabertos: Number(k.total) > 0
          ? Math.round(100 * (Number(k.reabertos) || 0) / Number(k.total))
          : null,
      },
      ttr_por_dia: porDiaRes.rows,
      por_tecnico: porTecnicoRes.rows.map(r => ({
        ...r,
        pct_no_sla: Number(r.com_sla_data) > 0
          ? Math.round(100 * Number(r.no_sla) / Number(r.com_sla_data))
          : null,
      })),
      em_risco: emRiscoRes.rows,
      workload_tecnico: workloadRes.rows.map(r => ({
        tecnico_nome: r.tecnico_nome,
        abertos: Number(r.abertos) || 0,
        p1: Number(r.p1) || 0,
        p2: Number(r.p2) || 0,
        p3: Number(r.p3) || 0,
        p4: Number(r.p4) || 0,
      })),
      por_prioridade: porPrioRes.rows.map(r => ({
        prioridade: r.prioridade,
        total: Number(r.total) || 0,
        pct_no_sla: Number(r.com_sla_data) > 0
          ? Math.round(100 * Number(r.no_sla) / Number(r.com_sla_data))
          : null,
        ttfr_medio_min: r.ttfr_medio_min != null ? Number(r.ttfr_medio_min) : null,
      })),
    });
  } catch (err) {
    console.error("[relatorios] sla-dashboard:", err);
    return res.status(500).json({ error: "Erro ao gerar dashboard de SLA" });
  }
});

module.exports = { relatoriosRouter: router };
