// src/routes/planos-manutencao.routes.js
//
// CRUD de planos de manutenção preventiva por condomínio.
// O job em src/jobs/planos-manutencao.job.js abre um chamado P4
// automaticamente quando proxima_em vence.

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");
const {
  estadoDa, origemDoTecnico, competenciaValida, competenciaDe, mesDe,
} = require("../services/preventivas.service");
const { executarPlano } = require("../jobs/planos-manutencao.job");
const { getConfigInt } = require("../services/config.service");

const router = express.Router();

// Técnico logado → id na tabela `tecnicos` (mesma checagem de /chamados/meus).
// Retorna null se a conta não estiver vinculada a um técnico ativo.
async function _tecnicoDoUsuario(usuarioId) {
  const r = await pool.query(
    `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = TRUE LIMIT 1`,
    [usuarioId]
  );
  return r.rows.length ? r.rows[0].id : null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _validarPayload(b, { exigirObrigatorios }) {
  const errs = [];
  const out = {};

  if (exigirObrigatorios || b.condominio_id !== undefined) {
    const cid = Number(b.condominio_id);
    if (!Number.isInteger(cid) || cid <= 0) errs.push("condominio_id inválido");
    else out.condominio_id = cid;
  }

  if (exigirObrigatorios || b.titulo !== undefined) {
    const t = String(b.titulo || "").trim();
    if (!t || t.length < 2) errs.push("titulo é obrigatório (min 2 chars)");
    else if (t.length > 255) errs.push("titulo muito longo (max 255)");
    else out.titulo = t;
  }

  if (b.descricao !== undefined) {
    const d = b.descricao ? String(b.descricao).trim().slice(0, 2000) : null;
    out.descricao = d;
  }

  if (exigirObrigatorios || b.periodicidade_dias !== undefined) {
    const p = Number(b.periodicidade_dias);
    if (!Number.isInteger(p) || p <= 0 || p > 3650) {
      errs.push("periodicidade_dias deve ser inteiro entre 1 e 3650");
    } else {
      out.periodicidade_dias = p;
    }
  }

  if (exigirObrigatorios || b.proxima_em !== undefined) {
    const px = b.proxima_em ? String(b.proxima_em) : null;
    if (!px || !/^\d{4}-\d{2}-\d{2}$/.test(px)) {
      errs.push("proxima_em deve ser data no formato YYYY-MM-DD");
    } else {
      out.proxima_em = px;
    }
  }

  if (b.ativo !== undefined) out.ativo = !!b.ativo;

  return { out, errs };
}

// ─── Rotas ──────────────────────────────────────────────────────────────────

// GET /planos-manutencao?condominio_id=&ativo=true|false
router.get("/", authRequired, gestaoOnly, async (req, res) => {
  const where = [];
  const vals  = [];

  if (req.query.condominio_id) {
    vals.push(Number(req.query.condominio_id));
    where.push(`pm.condominio_id = $${vals.length}`);
  }
  if (req.query.ativo === "true" || req.query.ativo === "false") {
    vals.push(req.query.ativo === "true");
    where.push(`pm.ativo = $${vals.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // ⚠️ A COMPETÊNCIA É PARÂMETRO, NÃO O RELÓGIO DO SERVIDOR (04/09/2026).
  //
  // Até aqui os LEFT JOINs do acompanhamento usavam `date_trunc('month',
  // CURRENT_DATE)` fixo, e isso escondia trabalho que EXISTE: escalar uma
  // preventiva para outubro gravava certo em `planos_atribuicoes` e a tela
  // continuava dizendo "Sem dono", porque só sabia olhar o mês de hoje. O
  // Pedro fez exatamente isso na simulação e a tela não mostrou.
  //
  // ⚠️ É a MESMA competência do `GET /operador/preventivas` — dia 1, string
  // `YYYY-MM-DD`, validada pelo mesmo `competenciaValida`. Duas definições de
  // "que mês é este" entre as duas telas seria a divergência que o
  // `preventivas.service` existe para impedir.
  if (req.query.mes != null && req.query.mes !== "" && !competenciaValida(req.query.mes)) {
    return res.status(400).json({ error: "mes inválido (use YYYY-MM)" });
  }
  const competencia = competenciaDe(req.query.mes);
  // ⚠️ A COMPETENCIA E O ULTIMO PARAMETRO, e por isso o indice sai do
  // `vals.length` DEPOIS do push: os filtros opcionais acima ja podem ter
  // ocupado $1 e $2. Numero fixo aqui quebraria assim que alguem filtrasse
  // por condominio.
  vals.push(competencia);
  const COMP = `$${vals.length}`;

  try {
    // O LATERAL traz o chamado da preventiva que ainda está aberto. Sem isso a
    // UI marcava como "vencido" um plano que na verdade está em execução: o job
    // pula quem já tem chamado aberto (anti-duplicidade) e NÃO avança as datas,
    // então o plano fica parado em `proxima_em` passada até o chamado fechar.
    // Mesmo predicado do job, de propósito — se o job pula, a tela explica.
    const r = await pool.query(
      `SELECT pm.id, pm.condominio_id, pm.titulo, pm.descricao,
              pm.periodicidade_dias, pm.proxima_em, pm.ultima_em,
              pm.ativo, pm.criado_em,
              COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
              c.bairro AS condominio_bairro,
              c.zona AS condominio_zona,
              cha.id         AS chamado_aberto_id,
              cha.status     AS chamado_aberto_status,
              -- ⚠️ QUEM ESTA NO CHAMADO ABERTO. "Em campo" so e verdade se
              -- alguem foi: o job cria o chamado do mes sozinho, sem tecnico.
              -- Mesma regra do GET /operador/preventivas — quem decide e o
              -- estadoDa, e ele mora no preventivas.service.
              -- (Sem crase nos comentarios: template literal. Ver CLAUDE.md.)
              cha.tecnico_id AS chamado_aberto_tecnico_id,
              -- O ACOMPANHAMENTO DO MES (04/09/2026, pedido do Pedro: "acho que
              -- e bom ter o acompanhamento do mes"). Ate aqui esta rota so
              -- sabia da DATA do plano; quem faz, se ja rodou e quem esta nele
              -- so existia na tela do operador. Sao os mesmos LEFT JOINs de la.
              pa.tecnico_id  AS atribuido_tecnico_id,
              ta.nome        AS atribuido_tecnico_nome,
              zr.tecnico_id  AS zona_tecnico_id,
              tz.nome        AS zona_tecnico_nome,
              chf.id         AS chamado_fechado_id,
              chf.fechado_em,
              (pm.ultima_em IS NOT NULL
               AND pm.ultima_em >= ${COMP}::date
               AND pm.ultima_em <  (${COMP}::date + INTERVAL '1 month')
              ) AS feita_no_mes,
              -- ⚠️ ESTE PLANO É TRABALHO DESTA COMPETENCIA? Duas portas, as
              -- mesmas do GET /operador/preventivas: ou ele VENCE aqui (ou
              -- antes, que e divida — por isso nao ha limite inferior), ou ele
              -- JA RODOU aqui. Sem isto, um plano que so vence em outubro
              -- aparecia no balde "Sem dono" ao lado do trabalho de setembro, e
              -- so a coluna Proxima distinguia — numa lista de 80 linhas.
              -- (Sem crase nos comentarios: template literal. Ver CLAUDE.md.)
              (pm.proxima_em < (${COMP}::date + INTERVAL '1 month')
               OR (pm.ultima_em >= ${COMP}::date
                   AND pm.ultima_em < (${COMP}::date + INTERVAL '1 month'))) AS do_mes
       FROM planos_manutencao pm
       LEFT JOIN condominios c ON c.id = pm.condominio_id
       LEFT JOIN LATERAL (
         SELECT ch.id, ch.status, ch.tecnico_id
         FROM chamados ch
         WHERE ch.plano_manutencao_id = pm.id
           AND ch.status NOT IN ('fechado', 'cancelado')
         ORDER BY ch.id DESC
         LIMIT 1
       ) cha ON TRUE
       LEFT JOIN LATERAL (
         SELECT ch.id, ch.fechado_em FROM chamados ch
          WHERE ch.plano_manutencao_id = pm.id
            AND ch.status = 'fechado'
            AND ch.fechado_em >= ${COMP}::date
            AND ch.fechado_em <  (${COMP}::date + INTERVAL '1 month')
          ORDER BY ch.fechado_em DESC LIMIT 1
       ) chf ON TRUE
       LEFT JOIN planos_atribuicoes pa
              ON pa.plano_id = pm.id
             AND pa.competencia = ${COMP}::date
       LEFT JOIN tecnicos ta ON ta.id = pa.tecnico_id
       LEFT JOIN LATERAL (
         SELECT pzr.tecnico_id FROM planos_zona_responsavel pzr
          WHERE pzr.zona = c.zona ORDER BY pzr.tecnico_id LIMIT 1
       ) zr ON TRUE
       LEFT JOIN tecnicos tz ON tz.id = zr.tecnico_id
       ${whereSql}
       ORDER BY
         CASE WHEN pm.ativo AND pm.proxima_em <= CURRENT_DATE AND cha.id IS NULL
              THEN 0 ELSE 1 END,
         pm.proxima_em ASC NULLS LAST
       LIMIT 500`,
      vals
    );

    // ⚠️ O ESTADO DO MÊS É CALCULADO NO SERVIÇO, não aqui e não no front
    // (04/09/2026). `estadoDa` e `origemDoTecnico` são a MESMA definição que a
    // tela do operador usa — o `preventivas.service.js` existe justamente para
    // não haver duas leituras do mesmo mês, uma dizendo ao admin que sobrou
    // serviço e outra dizendo ao operador que não.
    const planos = r.rows.map((p) => ({
      ...p,
      estado: estadoDa(p),
      tecnico_id:   p.atribuido_tecnico_id || p.zona_tecnico_id || null,
      tecnico_nome: p.atribuido_tecnico_nome || p.zona_tecnico_nome || null,
      tecnico_origem: origemDoTecnico(p),
    }));

    // ⚠️ OS PRÉDIOS SEM PLANO NENHUM — a pergunta que esta tela não respondia.
    // Ela lista PLANOS, então quem não tem plano era invisível aqui: medido em
    // 04/09/2026, **16 dos 88 condomínios ativos** (18% da carteira) não tinham
    // preventiva nenhuma, e não havia como descobrir isso pelo painel.
    //
    // ⚠️ SÓ QUANDO A LISTA É A INTEIRA. Com filtro de condomínio ou de ativo a
    // pergunta muda de sentido — "quem está fora" só existe contra o todo.
    let semPlano = [];
    if (!where.length) {
      const sp = await pool.query(
        `SELECT c.id, COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS nome,
                c.bairro, c.zona
           FROM condominios c
          WHERE c.ativo = TRUE
            AND NOT EXISTS (SELECT 1 FROM planos_manutencao p
                             WHERE p.condominio_id = c.id AND p.ativo = TRUE)
          ORDER BY c.zona NULLS LAST, nome`
      );
      semPlano = sp.rows;
    }

    // `mes` volta junto para a tela nunca desenhar um mes e contar outro —
    // se ela pediu um mes invalido, quem manda e o que o servidor resolveu.
    return res.json({ mes: mesDe(competencia), competencia, planos, sem_plano: semPlano });
  } catch (err) {
    console.error("[planos-manutencao] GET /:", err);
    return res.status(500).json({ error: "Erro ao listar planos" });
  }
});

// ─── Roteiro do técnico (app mobile) ─────────────────────────────────────────

// GET /planos-manutencao/meu-roteiro
// Preventivas das zonas em que o técnico logado é o responsável, vencendo em
// até `planos.roteiro_antecedencia_dias` (default 7).
//
// Devolve PLANOS, não chamados: o chamado P4 só nasce quando o técnico chega no
// prédio e toca "Iniciar" (POST /:id/executar-agora). Assim o que não foi feito
// não vira chamado fantasma aberto, e `ultima_em` guarda a data real do serviço.
//
// ⚠️ DESDE 03/09/2026 A ESCALA DO MÊS TAMBÉM ENTRA — e ganha da zona. Ver o
// bloco na query. Prédio escalado para outro técnico SAI daqui, mesmo sendo da
// minha zona: escalar é desviar, não acrescentar.
router.get("/meu-roteiro", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }

  try {
    const tecnicoId = await _tecnicoDoUsuario(req.user.id);
    if (!tecnicoId) {
      return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
    }

    const antecedencia = await getConfigInt("planos.roteiro_antecedencia_dias", 7);

    // ⚠️ DUAS ORIGENS, E A ESCALA GANHA DA ZONA (03/09/2026). Até aqui o
    // roteiro era só a zona: `JOIN planos_zona_responsavel`. Com a tela de
    // preventivas do operador (`planos_atribuicoes`, migration 082) o prédio
    // pode ser escalado para alguém específico neste ciclo, e aí:
    //
    //   • escalado para MIM        → entra, mesmo que a zona não seja minha;
    //   • escalado para OUTRO      → SAI, mesmo que a zona seja minha;
    //   • sem escala neste ciclo   → vale a zona, como sempre valeu.
    //
    // A segunda linha é a que importa e é a razão de isto não ser um OR solto:
    // somar as origens colocaria o mesmo prédio no app de dois técnicos, os
    // dois iriam, e um perderia a manhã. Escalar é DESVIAR, não acrescentar.
    //
    // ⚠️ A COMPETÊNCIA É A DO MÊS DE `proxima_em`, não a de hoje. O roteiro
    // enxerga até 7 dias à frente por padrão: no fim do mês ele já mostra
    // preventivas de vencimento no mês seguinte, e conferir contra a escala de
    // hoje faria a escala do mês que vem ser ignorada justamente na semana em
    // que ela começa a valer.
    //
    // ⚠️ `$1::int` NOS DOIS USOS (dentro do LATERAL e na comparação). O mesmo
    // parâmetro como valor e em comparação deduz tipos diferentes e o Postgres
    // recusa a query no parse — o 42P08 do CLAUDE.md.
    const r = await pool.query(
      `SELECT pm.id, pm.titulo, pm.descricao, pm.periodicidade_dias,
              pm.proxima_em, pm.ultima_em,
              c.id AS condominio_id,
              COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
              c.endereco, c.bairro, c.cidade, c.lat, c.lng, c.zona,
              cha.id AS chamado_aberto_id,
              -- Como este prédio chegou ao roteiro. O app mostra "escalado
              -- para você" no que veio da tela do operador: é serviço que
              -- alguém colocou no nome dele, e isso se lê diferente de
              -- "sua zona".
              (pa.tecnico_id IS NOT NULL) AS escalado
       FROM planos_manutencao pm
       JOIN condominios c ON c.id = pm.condominio_id AND c.ativo = TRUE
      -- ⚠️ DUAS COMPETENCIAS VALEM, e ignorar a segunda esconde trabalho real
      -- (04/09/2026). A escala e gravada na competencia que o OPERADOR estava
      -- vendo, e a tela dele lista duas coisas ao mesmo tempo:
      --
      --   • o que vence NESTE mes           → escala com a competencia do mes
      --                                        da propria proxima_em;
      --   • o ATRASADO de meses anteriores  → aparece na lista de hoje (a
      --                                        query nao tem limite inferior) e
      --                                        e escalado com a competencia de
      --                                        HOJE, nao com a de agosto.
      --
      -- Conferir so contra date_trunc('month', pm.proxima_em) deixava a
      -- segunda de fora: o operador escalava a preventiva atrasada, ela sumia
      -- do roteiro de quem recebeu, e o "Iniciar" respondia 403.
      -- E conferir so contra o mes de hoje quebraria a primeira — no fim do mes
      -- o roteiro ja mostra preventiva do mes seguinte, e a escala dela e da
      -- competencia seguinte.
      -- (Sem crase nos comentarios: template literal. Ver CLAUDE.md.)
       LEFT JOIN planos_atribuicoes pa
              ON pa.plano_id = pm.id
             AND pa.competencia IN (
               date_trunc('month', pm.proxima_em)::date,
               date_trunc('month', CURRENT_DATE)::date
             )
       LEFT JOIN LATERAL (
         SELECT ch.id
         FROM chamados ch
         WHERE ch.plano_manutencao_id = pm.id
           AND ch.status NOT IN ('fechado', 'cancelado')
         ORDER BY ch.id DESC
         LIMIT 1
       ) cha ON TRUE
       WHERE pm.ativo = TRUE
         AND pm.proxima_em <= CURRENT_DATE + $2::int
         AND (
           pa.tecnico_id = $1::int
           OR (
             pa.tecnico_id IS NULL
             AND EXISTS (
               SELECT 1 FROM planos_zona_responsavel pzr
                WHERE pzr.zona = c.zona AND pzr.tecnico_id = $1::int
             )
           )
         )
       ORDER BY pm.proxima_em ASC, c.id`,
      [tecnicoId, antecedencia]
    );

    const zonas = [...new Set(r.rows.map(p => p.zona).filter(Boolean))];
    return res.json({ antecedencia_dias: antecedencia, zonas, planos: r.rows });
  } catch (err) {
    console.error("[planos-manutencao] GET /meu-roteiro:", err);
    return res.status(500).json({ error: "Erro ao montar roteiro" });
  }
});

// ─── Responsáveis por zona ───────────────────────────────────────────────────

// GET /planos-manutencao/zonas-responsaveis
// Zonas distintas dos condomínios ativos + os técnicos responsáveis de cada uma.
// Desde a migration 066 a zona aceita VÁRIOS técnicos (dupla saindo junta), por
// isso a resposta traz `tecnicos: [{ id, nome }]` em vez de um único campo.
router.get("/zonas-responsaveis", authRequired, gestaoOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT c.zona
       FROM condominios c
       WHERE c.ativo = TRUE AND c.zona IS NOT NULL AND c.zona <> ''
       ORDER BY c.zona ASC`
    );
    const zonas = r.rows.map(row => row.zona);

    const resp = await pool.query(
      `SELECT pzr.zona, pzr.tecnico_id, t.nome AS tecnico_nome
       FROM planos_zona_responsavel pzr
       JOIN tecnicos t ON t.id = pzr.tecnico_id
       ORDER BY t.nome ASC`
    );
    const porZona = {};
    for (const row of resp.rows) {
      (porZona[row.zona] ||= []).push({ id: row.tecnico_id, nome: row.tecnico_nome });
    }

    return res.json(zonas.map(zona => ({ zona, tecnicos: porZona[zona] || [] })));
  } catch (err) {
    console.error("[planos-manutencao] GET /zonas-responsaveis:", err);
    return res.status(500).json({ error: "Erro ao listar zonas" });
  }
});

// PUT /planos-manutencao/zonas-responsaveis/:zona
// Substitui a lista de responsáveis da zona. body: { tecnico_ids: number[] }
// Lista vazia = zona sem responsável.
router.put("/zonas-responsaveis/:zona", authRequired, gestaoOnly, async (req, res) => {
  const zona = req.params.zona.trim();
  if (!zona) return res.status(400).json({ error: "zona inválida" });

  const brutos = req.body?.tecnico_ids;
  if (!Array.isArray(brutos)) {
    return res.status(400).json({ error: "tecnico_ids deve ser uma lista (vazia para remover todos)" });
  }
  const ids = [...new Set(brutos.map(Number))];
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: "tecnico_ids inválidos" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Substituição atômica: apaga quem saiu e insere quem entrou de uma vez,
    // pra a zona nunca ficar momentaneamente sem responsável nenhum.
    await client.query(
      `DELETE FROM planos_zona_responsavel
       WHERE zona = $1 AND NOT (tecnico_id = ANY($2::int[]))`,
      [zona, ids]
    );
    if (ids.length) {
      await client.query(
        `INSERT INTO planos_zona_responsavel (zona, tecnico_id, atualizado_em)
         SELECT $1, id, NOW() FROM unnest($2::int[]) AS id
         ON CONFLICT (zona, tecnico_id) DO UPDATE SET atualizado_em = NOW()`,
        [zona, ids]
      );
    }
    await client.query("COMMIT");
    return res.json({ ok: true, tecnicos: ids.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[planos-manutencao] PUT /zonas-responsaveis/:zona:", err);
    return res.status(500).json({ error: "Erro ao salvar responsáveis da zona" });
  } finally {
    client.release();
  }
});

// GET /planos-manutencao/:id
router.get("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `SELECT pm.*, c.nome AS condominio_nome
       FROM planos_manutencao pm
       LEFT JOIN condominios c ON c.id = pm.condominio_id
       WHERE pm.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Plano não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[planos-manutencao] GET /:id:", err);
    return res.status(500).json({ error: "Erro ao buscar plano" });
  }
});

// POST /planos-manutencao
router.post("/", authRequired, gestaoOnly, async (req, res) => {
  const { out, errs } = _validarPayload(req.body || {}, { exigirObrigatorios: true });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });

  try {
    const r = await pool.query(
      `INSERT INTO planos_manutencao
         (condominio_id, titulo, descricao, periodicidade_dias, proxima_em, ativo, criado_por)
       VALUES ($1, $2, $3, $4, $5::date, COALESCE($6, TRUE), $7)
       RETURNING *`,
      [
        out.condominio_id,
        out.titulo,
        out.descricao ?? null,
        out.periodicidade_dias,
        out.proxima_em,
        out.ativo,
        req.user.id,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[planos-manutencao] POST /:", err);
    return res.status(500).json({ error: "Erro ao criar plano" });
  }
});

// PATCH /planos-manutencao/bulk — edita vários planos de uma vez
// body: { ids: number[], ativo?: boolean, periodicidade_dias?: number,
//         proxima_em?: "YYYY-MM-DD" } — pelo menos um campo além de ids.
// Campos ausentes ficam intocados (a UI manda só o que o usuário alterou).
router.patch("/bulk", authRequired, gestaoOnly, async (req, res) => {
  const idsRaw = req.body?.ids;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return res.status(400).json({ error: "ids deve ser uma lista não vazia" });
  }
  if (idsRaw.length > 500) {
    return res.status(400).json({ error: "máximo de 500 ids por vez" });
  }
  const ids = idsRaw.map(Number);
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: "ids inválidos" });
  }

  // Só estes 3 campos são editáveis em massa (condomínio/título/descrição são
  // por definição individuais) — filtra antes de validar pra ninguém colar
  // condominio_id no body e mover 500 planos de prédio sem querer.
  const b = req.body || {};
  const filtrado = {};
  for (const k of ["ativo", "periodicidade_dias", "proxima_em"]) {
    if (b[k] !== undefined) filtrado[k] = b[k];
  }
  if (filtrado.ativo !== undefined && typeof filtrado.ativo !== "boolean") {
    return res.status(400).json({ error: "ativo deve ser boolean" });
  }

  const { out, errs } = _validarPayload(filtrado, { exigirObrigatorios: false });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });

  const campos = Object.keys(out);
  if (!campos.length) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  const sets = [];
  const vals = [ids];
  for (const k of campos) {
    vals.push(out[k]);
    sets.push(k === "proxima_em" ? `${k} = $${vals.length}::date` : `${k} = $${vals.length}`);
  }

  try {
    const r = await pool.query(
      `UPDATE planos_manutencao SET ${sets.join(", ")} WHERE id = ANY($1::int[]) RETURNING id`,
      vals
    );
    return res.json({ ok: true, atualizados: r.rows.length, campos });
  } catch (err) {
    console.error("[planos-manutencao] PATCH /bulk:", err);
    return res.status(500).json({ error: "Erro ao atualizar planos em massa" });
  }
});

// PATCH /planos-manutencao/:id
router.patch("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { out, errs } = _validarPayload(req.body || {}, { exigirObrigatorios: false });
  if (errs.length) return res.status(400).json({ error: errs.join("; ") });

  const sets = [];
  const vals = [id];
  for (const [k, v] of Object.entries(out)) {
    vals.push(v);
    const target = k === "proxima_em" ? `${k} = $${vals.length}::date` : `${k} = $${vals.length}`;
    sets.push(target);
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE planos_manutencao SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Plano não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[planos-manutencao] PATCH /:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar plano" });
  }
});

// DELETE /planos-manutencao/:id  — soft delete (ativo = false)
router.delete("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `UPDATE planos_manutencao SET ativo = FALSE WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Plano não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[planos-manutencao] DELETE /:id:", err);
    return res.status(500).json({ error: "Erro ao desativar plano" });
  }
});

// POST /planos-manutencao/:id/executar-agora — dispara o plano manualmente
// (botão ▶ do admin e "Iniciar" do roteiro no app do técnico)
router.post("/:id/executar-agora", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    // Técnico que está assumindo o serviço — o chamado nasce no nome dele.
    // Fica null quando quem dispara é o admin pelo ▶.
    let executor = null;

    // ⚠️ QUEM PODE DISPARAR: a gestão (admin e gerente) executa qualquer plano;
    // o técnico, os que estão NO ROTEIRO DELE — e a definição de "no roteiro
    // dele" é a mesma do `GET /meu-roteiro`, não uma segunda.
    //
    // ⚠️ O GERENTE ESTAVA DE FORA e caía no 403 "Acesso restrito" (04/09/2026).
    // A checagem era `role !== "admin"`, e o botão que dispara isto vive no
    // painel de Planos, que é `gestaoOnly` — ou seja, a tela oferecia a ação a
    // quem a rota recusava.
    if (req.user.role !== "admin" && req.user.role !== "gerente") {
      if (req.user.role !== "tecnico") {
        return res.status(403).json({ error: "Acesso restrito" });
      }
      const tecnicoId = await _tecnicoDoUsuario(req.user.id);
      if (!tecnicoId) {
        return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
      }
      // ⚠️ A ESCALA DO MÊS TAMBÉM VALE, E GANHA DA ZONA (04/09/2026).
      //
      // Relato do Pedro: escalou uma preventiva à mão para um técnico no painel
      // do operador, o prédio APARECEU no roteiro dele, e ao tocar "Iniciar" o
      // app respondeu *"você não é o responsável pela zona deste plano"*.
      //
      // A causa: esta checagem só olhava `planos_zona_responsavel`. O
      // `/meu-roteiro` passou a considerar a escala em 03/09 (migration 082) e
      // ESTA rota não acompanhou — a tela mostrava o serviço e a gravação o
      // recusava, que é a divergência que o proprio arquivo avisa em
      // `SQL_EQUIPE` no operador.
      //
      // As três linhas, iguais às do roteiro:
      //   • escalado para MIM      → entra, mesmo que a zona não seja minha;
      //   • escalado para OUTRO    → SAI, mesmo que a zona seja minha;
      //   • sem escala neste ciclo → vale a zona, como sempre valeu.
      //
      // ⚠️ A SEGUNDA LINHA É A QUE IMPORTA, e ela ENDURECE a regra: antes, o
      // responsável da zona conseguia disparar um prédio que tinha sido
      // desviado para outra pessoa — os dois iriam, e um perderia a manhã.
      //
      // ⚠️ A COMPETÊNCIA É A DO MÊS DE `proxima_em`, não a de hoje — mesma
      // razão registrada no roteiro: no fim do mês ele já mostra preventiva do
      // mês seguinte, e conferir contra a escala de hoje ignoraria a escala que
      // acabou de passar a valer.
      const permitido = await pool.query(
        `SELECT 1
           FROM planos_manutencao pm
           JOIN condominios c ON c.id = pm.condominio_id
           -- ⚠️ AS MESMAS DUAS COMPETENCIAS DO ROTEIRO, e nao por acaso: quem
           -- OFERECE e quem GRAVA tem de responder igual, senao a tela mostra
           -- o servico e a rota o recusa — que e exatamente o defeito que este
           -- bloco esta consertando. Ver a nota no /meu-roteiro.
           LEFT JOIN planos_atribuicoes pa
                  ON pa.plano_id = pm.id
                 AND pa.competencia IN (
                   date_trunc('month', pm.proxima_em)::date,
                   date_trunc('month', CURRENT_DATE)::date
                 )
          WHERE pm.id = $1
            AND (
              pa.tecnico_id = $2::int
              OR (
                pa.tecnico_id IS NULL
                AND EXISTS (
                  SELECT 1 FROM planos_zona_responsavel pzr
                   WHERE pzr.zona = c.zona AND pzr.tecnico_id = $2::int
                )
              )
            )
          LIMIT 1`,
        [id, tecnicoId]
      );
      if (!permitido.rows.length) {
        // ⚠️ A FRASE MENTIA quando o prédio tinha sido escalado para outra
        // pessoa: dizia "zona" para um caso que não é de zona. Hoje ela nomeia
        // o que de fato acontece, sem prometer que o técnico resolve sozinho.
        return res.status(403).json({
          error: "Esta preventiva não está no seu roteiro deste mês. Fale com o operador.",
        });
      }
      executor = tecnicoId;
    }

    const resultado = await executarPlano(id, { tecnicoId: executor });
    return res.json(resultado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[planos-manutencao] POST /:id/executar-agora:", err);
    return res.status(500).json({ error: "Erro ao executar plano" });
  }
});

module.exports = { planosManutencaoRouter: router };
