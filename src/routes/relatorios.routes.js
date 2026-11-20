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

// ============================================================
// GET /relatorios/dashboard?periodo=mes|ant|tri|ano — o dashboard de gestão
// (redesenho do admin, 20/11/2026; maquete aprovada pelo Pedro no mesmo dia).
// ============================================================
// Quem olha é o Pedro, toda semana ou mês: o período contra o anterior, em
// quatro áreas (atendimento e prazo, dinheiro, técnicos, prédios e
// equipamentos). Ver docs/modulos/relatorios-dashboard.md.
//
// ⚠️ PERÍODO EM CURSO COMPARA COM O MESMO PEDAÇO DO ANTERIOR. Em 20/11, "este
// mês" é 1 a 20 de novembro, e o anterior é 1 a 20 de outubro, não outubro
// inteiro: senão todo começo de mês mostraria tudo "caindo".
//
// As réguas (cada uma tem um porquê na doc):
//   chamado        → só o corretivo (sem plano_manutencao_id) e não cancelado
//   tempo e prazo  → chegada do técnico (tecnico_chegou_em, ou a chegada da
//                    O.S.), contra sla_definicoes.sla_chegada_min, como na
//                    cláusula 7. Fechado sem ninguém ter ido não entra.
//   retrabalho     → chamado corretivo aberto até 30 dias depois de outro
//                    fechado no MESMO EQUIPAMENTO; sem equipamento ligado, no
//                    mesmo prédio e mesma categoria. Conta para o técnico do
//                    chamado anterior (o serviço que não segurou).
//   em campo       → chegada_em até finalizada_em da O.S. (até 24 h)
//   faturado       → nota de contrato (cópia do Omie, emitida_em) + nota do
//                    orçamento emitida pelo sistema (nota_emitida_em)
//   dinheiro       → só para o admin, como o faturamento no Financeiro
// (Sem crase nos comentarios do SQL: template literal. Ver CLAUDE.md.)
const TZ = "America/Sao_Paulo";
const _ts = (n) => `(($${n}::date)::timestamp AT TIME ZONE '${TZ}')`;
const _entre = (col, a, b) => `${col} >= ${_ts(a)} AND ${col} < ${_ts(b)}`;

function _hojeSP() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = p.split("-").map(Number);
  return { y, m, d };
}
const _iso = (y, m, d = 1) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
};
function _menosMeses(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 - n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return _iso(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, Math.min(d, ultimo));
}

// [ini, fim) do período e do anterior, em datas locais de São Paulo
function periodoDashboard(periodo, hoje = _hojeSP()) {
  const meses = { mes: 1, ant: 1, tri: 3, ano: 12 }[periodo];
  if (!meses) return null;
  const fimMes = periodo === "ant" ? _iso(hoje.y, hoje.m) : _iso(hoje.y, hoje.m + 1);
  const ini = _menosMeses(fimMes, meses);
  const amanha = _iso(hoje.y, hoje.m, hoje.d + 1);
  const parcial = amanha < fimMes;
  const fim = parcial ? amanha : fimMes;
  return { periodo, meses, ini, fim, parcial, antIni: _menosMeses(ini, meses), antFim: _menosMeses(fim, meses) };
}

// chamados corretivos do intervalo, com o prazo de chegada e a chegada real
const _sqlCor = `
  SELECT ch.id, ch.condominio_id, ch.titulo, ch.status, ch.criado_em, ch.categoria,
         ch.equipamento_id, ch.tecnico_id, sd.sla_chegada_min,
         COALESCE(ch.tecnico_chegou_em,
                  (SELECT MIN(os.chegada_em) FROM ordens_servico os WHERE os.chamado_id = ch.id)) AS chegou_em
    FROM chamados ch
    LEFT JOIN sla_definicoes sd ON sd.prioridade = ch.prioridade
   WHERE ch.plano_manutencao_id IS NULL AND ch.status <> 'cancelado'
     AND ${_entre("ch.criado_em", 1, 2)}`;
// prazo: decidido = o técnico chegou, ou o prazo passou sem ninguém e o chamado
// não foi fechado (fechado sem visita = resolvido por telefone, fica de fora)
const _limite = `criado_em + make_interval(mins => sla_chegada_min)`;
const _decidido = `sla_chegada_min IS NOT NULL AND (chegou_em IS NOT NULL OR (${_limite} < NOW() AND status <> 'fechado'))`;
const _foraPrazo = `sla_chegada_min IS NOT NULL AND ((chegou_em IS NOT NULL AND chegou_em > ${_limite}) OR (chegou_em IS NULL AND ${_limite} < NOW() AND status <> 'fechado'))`;
const _valorOrc = `COALESCE(o.valor, (SELECT SUM(l.quantidade * l.valor_unitario) FROM orcamento_linhas l WHERE l.orcamento_id = o.id), 0)`;
// preventivas do intervalo: cada par (plano, mês) com chamado ou baixa à mão
const _sqlPrev = `
  WITH pv AS (
    SELECT plano_manutencao_id AS plano, competencia AS comp FROM chamados
     WHERE plano_manutencao_id IS NOT NULL AND competencia >= $1::date AND competencia < $2::date
    UNION
    SELECT plano_id, competencia FROM planos_baixas_manuais
     WHERE competencia >= $1::date AND competencia < $2::date
  )
  SELECT pv.plano, pv.comp,
         (EXISTS (SELECT 1 FROM chamados c WHERE c.plano_manutencao_id = pv.plano AND c.competencia = pv.comp AND c.status = 'fechado')
          OR EXISTS (SELECT 1 FROM planos_baixas_manuais b WHERE b.plano_id = pv.plano AND b.competencia = pv.comp)) AS feita,
         (SELECT c.tecnico_id FROM chamados c WHERE c.plano_manutencao_id = pv.plano AND c.competencia = pv.comp
           ORDER BY (c.status = 'fechado') DESC, c.id DESC LIMIT 1) AS tecnico_id
    FROM pv`;

async function _kpis(a, b, comDinheiro) {
  const r = await pool.query(
    `WITH cor AS (${_sqlCor}), prev AS (${_sqlPrev})
     SELECT (SELECT COUNT(*) FROM cor)::int AS chamados,
            (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (chegou_em - criado_em)) / 60)
               FROM cor WHERE chegou_em IS NOT NULL AND chegou_em >= criado_em) AS atender_min,
            (SELECT COUNT(*) FROM cor WHERE ${_decidido})::int AS prazo_decididos,
            (SELECT COUNT(*) FROM cor WHERE ${_decidido} AND NOT (${_foraPrazo}))::int AS prazo_ok,
            (SELECT COUNT(*) FROM orcamentos o WHERE ${_entre("o.enviado_em", 1, 2)})::int AS orc_enviados,
            (SELECT COUNT(*) FROM orcamentos o WHERE ${_entre("o.enviado_em", 1, 2)} AND o.aprovado_em IS NOT NULL)::int AS orc_aprovados,
            (SELECT COUNT(*) FROM prev)::int AS prev_previstas,
            (SELECT COUNT(*) FROM prev WHERE feita)::int AS prev_feitas`,
    [a, b]
  );
  const k = r.rows[0];
  const out = {
    chamados: k.chamados,
    atender_min: k.atender_min == null ? null : Math.round(Number(k.atender_min)),
    prazo_ok: k.prazo_ok, prazo_decididos: k.prazo_decididos,
    orc_enviados: k.orc_enviados, orc_aprovados: k.orc_aprovados,
    prev_feitas: k.prev_feitas, prev_previstas: k.prev_previstas,
  };
  if (comDinheiro) {
    const f = await pool.query(
      `SELECT (SELECT COALESCE(SUM(valor), 0) FROM omie_contrato_notas
                WHERE status IS DISTINCT FROM 'C' AND emitida_em >= $1::date AND emitida_em < $2::date) AS contratos,
              (SELECT COUNT(*) FROM omie_contrato_notas
                WHERE status IS DISTINCT FROM 'C' AND emitida_em >= $1::date AND emitida_em < $2::date)::int AS contratos_n,
              (SELECT COALESCE(SUM(nota_valor), 0) FROM orcamentos o
                WHERE o.nota_status = 'emitida' AND ${_entre("o.nota_emitida_em", 1, 2)}) AS os,
              (SELECT COUNT(*) FROM orcamentos o
                WHERE o.nota_status = 'emitida' AND ${_entre("o.nota_emitida_em", 1, 2)})::int AS os_n,
              (SELECT COALESCE(SUM(${_valorOrc}), 0) FROM orcamentos o WHERE ${_entre("o.aprovado_em", 1, 2)}) AS orc_aprovado_valor`,
      [a, b]
    );
    const x = f.rows[0];
    out.fat_contratos = Number(x.contratos); out.fat_contratos_n = x.contratos_n;
    out.fat_os = Number(x.os); out.fat_os_n = x.os_n;
    out.orc_aprovado_valor = Number(x.orc_aprovado_valor);
  }
  return out;
}

router.get("/dashboard", authRequired, gestaoOnly, async (req, res) => {
  const p = periodoDashboard(String(req.query.periodo || "mes"));
  if (!p) return res.status(400).json({ error: "periodo deve ser mes, ant, tri ou ano" });
  const comDinheiro = req.user.role === "admin";
  try {
    // 12 meses terminando no último mês do período
    const [fy, fm, fd] = p.fim.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(fy, fm - 1, fd - 1));
    const serieFim = _iso(ultimoDia.getUTCFullYear(), ultimoDia.getUTCMonth() + 2);
    const serieIni = _menosMeses(serieFim, 12);

    const [atual, anterior, serie, fora, tecs, predios, equip, semEquip, reserv, extra] = await Promise.all([
      _kpis(p.ini, p.fim, comDinheiro),
      _kpis(p.antIni, p.antFim, comDinheiro),
      pool.query(
        `WITH m AS (SELECT gs::date AS ini, (gs + INTERVAL '1 month')::date AS fim
                      FROM generate_series($1::date, ($2::date - INTERVAL '1 month'), INTERVAL '1 month') gs),
              cor AS (${_sqlCor})
         SELECT to_char(m.ini, 'YYYY-MM') AS mes,
                (SELECT COUNT(*) FROM cor WHERE criado_em >= (m.ini::timestamp AT TIME ZONE '${TZ}') AND criado_em < (m.fim::timestamp AT TIME ZONE '${TZ}'))::int AS chamados,
                (SELECT COUNT(*) FROM cor WHERE criado_em >= (m.ini::timestamp AT TIME ZONE '${TZ}') AND criado_em < (m.fim::timestamp AT TIME ZONE '${TZ}') AND ${_decidido})::int AS dec,
                (SELECT COUNT(*) FROM cor WHERE criado_em >= (m.ini::timestamp AT TIME ZONE '${TZ}') AND criado_em < (m.fim::timestamp AT TIME ZONE '${TZ}') AND ${_decidido} AND NOT (${_foraPrazo}))::int AS ok
                ${comDinheiro ? `,
                (SELECT COALESCE(SUM(valor), 0) FROM omie_contrato_notas WHERE status IS DISTINCT FROM 'C' AND emitida_em >= m.ini AND emitida_em < m.fim) AS fat_c,
                (SELECT COALESCE(SUM(nota_valor), 0) FROM orcamentos o WHERE o.nota_status = 'emitida'
                   AND o.nota_emitida_em >= (m.ini::timestamp AT TIME ZONE '${TZ}') AND o.nota_emitida_em < (m.fim::timestamp AT TIME ZONE '${TZ}')) AS fat_o` : ""}
           FROM m ORDER BY m.ini`,
        [serieIni, serieFim]
      ),
      pool.query(
        `WITH cor AS (${_sqlCor})
         SELECT cor.condominio_id, COALESCE(NULLIF(c.nome_fantasia, ''), c.nome) AS nome, COUNT(*)::int AS n,
                MAX(EXTRACT(EPOCH FROM (COALESCE(cor.chegou_em, NOW()) - cor.criado_em)) / 60)::int AS pior_min,
                (ARRAY_AGG(cor.titulo ORDER BY COALESCE(cor.chegou_em, NOW()) - cor.criado_em DESC))[1] AS pior_titulo
           FROM (SELECT cor.*, (${_foraPrazo}) AS fora FROM cor) cor JOIN condominios c ON c.id = cor.condominio_id
          WHERE cor.fora
          GROUP BY cor.condominio_id, c.nome_fantasia, c.nome
          ORDER BY n DESC, pior_min DESC LIMIT 5`,
        [p.ini, p.fim]
      ),
      pool.query(
        `WITH cor AS (${_sqlCor}),
              prev AS (${_sqlPrev}),
              os AS (
                SELECT tecnico_id, COUNT(*)::int AS os,
                       COALESCE(SUM(EXTRACT(EPOCH FROM (finalizada_em - chegada_em)))
                         FILTER (WHERE chegada_em IS NOT NULL AND finalizada_em > chegada_em
                                   AND finalizada_em - chegada_em < INTERVAL '24 hours'), 0) / 3600.0 AS horas
                  FROM ordens_servico WHERE tecnico_id IS NOT NULL AND ${_entre("finalizada_em", 1, 2)}
                 GROUP BY tecnico_id),
              ret AS (
                SELECT ant.tecnico_id, COUNT(DISTINCT cor.id)::int AS ret, COUNT(DISTINCT cor.condominio_id)::int AS ret_predios
                  FROM cor
                  JOIN LATERAL (
                    SELECT c1.tecnico_id FROM chamados c1
                     WHERE c1.id <> cor.id AND c1.plano_manutencao_id IS NULL AND c1.status = 'fechado'
                       AND c1.fechado_em <= cor.criado_em AND c1.fechado_em > cor.criado_em - INTERVAL '30 days'
                       AND ((cor.equipamento_id IS NOT NULL AND c1.equipamento_id = cor.equipamento_id)
                         OR (cor.equipamento_id IS NULL AND c1.condominio_id = cor.condominio_id
                             AND c1.categoria IS NOT DISTINCT FROM cor.categoria))
                     ORDER BY c1.fechado_em DESC LIMIT 1) ant ON TRUE
                 WHERE ant.tecnico_id IS NOT NULL
                 GROUP BY ant.tecnico_id),
              pvt AS (
                SELECT tecnico_id, COUNT(*)::int AS previstas, COUNT(*) FILTER (WHERE feita)::int AS feitas
                  FROM prev WHERE tecnico_id IS NOT NULL GROUP BY tecnico_id)
         SELECT t.id, t.nome, COALESCE(os.os, 0) AS os, ROUND(COALESCE(os.horas, 0))::int AS horas,
                COALESCE(ret.ret, 0) AS ret, COALESCE(ret.ret_predios, 0) AS ret_predios,
                COALESCE(pvt.feitas, 0) AS prev_feitas, COALESCE(pvt.previstas, 0) AS prev_previstas
           FROM tecnicos t
           LEFT JOIN os  ON os.tecnico_id  = t.id
           LEFT JOIN ret ON ret.tecnico_id = t.id
           LEFT JOIN pvt ON pvt.tecnico_id = t.id
          WHERE os.os IS NOT NULL OR ret.ret IS NOT NULL OR pvt.previstas IS NOT NULL
          ORDER BY COALESCE(os.os, 0) DESC, t.nome`,
        [p.ini, p.fim]
      ),
      pool.query(
        `WITH cor AS (${_sqlCor})
         SELECT cor.condominio_id, COALESCE(NULLIF(c.nome_fantasia, ''), c.nome) AS nome, COUNT(*)::int AS n,
                COUNT(*) FILTER (WHERE cor.fora)::int AS fora
           FROM (SELECT cor.*, (${_foraPrazo}) AS fora FROM cor) cor JOIN condominios c ON c.id = cor.condominio_id
          GROUP BY cor.condominio_id, c.nome_fantasia, c.nome
          ORDER BY n DESC, nome LIMIT 5`,
        [p.ini, p.fim]
      ),
      pool.query(
        `WITH cor AS (${_sqlCor})
         SELECT e.tipo, NULLIF(TRIM(CONCAT_WS(' ', e.marca, e.modelo)), '') AS modelo,
                COUNT(*)::int AS n, COUNT(DISTINCT cor.condominio_id)::int AS predios
           FROM cor JOIN equipamentos e ON e.id = cor.equipamento_id
          GROUP BY e.tipo, e.marca, e.modelo
          ORDER BY n DESC, predios DESC LIMIT 5`,
        [p.ini, p.fim]
      ),
      pool.query(
        `WITH cor AS (${_sqlCor})
         SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE equipamento_id IS NULL)::int AS sem FROM cor`,
        [p.ini, p.fim]
      ),
      pool.query(
        `SELECT r.id, r.nome, r.condominio_id, COALESCE(NULLIF(c.nome_fantasia, ''), c.nome) AS condominio_nome,
                COUNT(*)::int AS n, MODE() WITHIN GROUP (ORDER BY a.tipo) AS tipo
           FROM alertas a
           JOIN reservatorios r ON r.device_id = a.device_id
           JOIN condominios c ON c.id = r.condominio_id
          WHERE ${_entre("a.criado_em", 1, 2)}
          GROUP BY r.id, r.nome, r.condominio_id, c.nome_fantasia, c.nome
          ORDER BY n DESC LIMIT 5`,
        [p.ini, p.fim]
      ),
      comDinheiro
        ? pool.query(
            `SELECT (SELECT COUNT(*) FROM omie_contratos WHERE situacao = '10')::int AS contratos_ativos,
                    (SELECT COUNT(*) FROM orcamentos o WHERE o.status = 'aprovado' AND o.nota_status IS NULL)::int AS sem_nota,
                    (SELECT COALESCE(SUM(${_valorOrc}), 0) FROM orcamentos o WHERE o.status = 'aprovado' AND o.nota_status IS NULL) AS sem_nota_valor,
                    (SELECT COUNT(*) FROM orcamentos o WHERE o.nota_status = 'erro')::int AS nota_erro`
          )
        : null,
    ]);

    return res.json({
      periodo: p,
      dinheiro: comDinheiro,
      atual, anterior,
      serie: serie.rows.map(s => ({
        mes: s.mes, chamados: s.chamados,
        prazo_pct: s.dec ? Math.round((100 * s.ok) / s.dec) : null,
        ...(comDinheiro ? { fat_contratos: Number(s.fat_c), fat_os: Number(s.fat_o) } : {}),
      })),
      fora_prazo: fora.rows,
      tecnicos: tecs.rows,
      predios: predios.rows,
      equipamentos: equip.rows,
      chamados_sem_equipamento: semEquip.rows[0],
      reservatorios: reserv.rows,
      ...(comDinheiro ? { financeiro: { ...extra.rows[0], sem_nota_valor: Number(extra.rows[0].sem_nota_valor) } } : {}),
    });
  } catch (err) {
    console.error("[relatorios] GET /dashboard:", err);
    return res.status(500).json({ error: "Erro ao montar o dashboard" });
  }
});

module.exports = { relatoriosRouter: router, periodoDashboard };
