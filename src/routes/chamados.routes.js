const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { salvarFotoMensagemChamado } = require("../services/chamado-mensagens.service");

const router = express.Router();

const CATEGORIAS = ["vazamento", "bomba_falha", "nivel_baixo", "sem_agua", "ruido", "manutencao", "outro"];
const PRIORIDADES = ["baixa", "media", "alta", "emergencia"];

// POST /chamados — cria chamado manualmente (admin)
router.post("/", authRequired, masterAdminOnly, async (req, res) => {
  const { titulo, descricao, categoria, prioridade, condominio_id, responsavel_id } = req.body || {};

  if (!titulo || typeof titulo !== "string" || !titulo.trim())
    return res.status(400).json({ error: "Título obrigatório" });
  if (!descricao || typeof descricao !== "string" || descricao.trim().length < 5)
    return res.status(400).json({ error: "Descreva o problema com pelo menos 5 caracteres" });
  if (categoria && !CATEGORIAS.includes(categoria))
    return res.status(400).json({ error: `categoria inválida` });
  if (prioridade && !PRIORIDADES.includes(prioridade))
    return res.status(400).json({ error: `prioridade inválida` });

  try {
    const ins = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, responsavel_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'aberto')
       RETURNING id, status, prioridade, categoria, titulo, descricao, condominio_id, responsavel_id, criado_em`,
      [
        condominio_id ? Number(condominio_id) : null,
        titulo.trim().slice(0, 255),
        descricao.trim().slice(0, 4000),
        prioridade || "media",
        categoria || "outro",
        responsavel_id ? Number(responsavel_id) : null,
      ]
    );
    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error("[chamados] POST /:", e);
    return res.status(500).json({ error: "Erro ao criar chamado" });
  }
});

// GET /chamados — lista chamados (com filtros opcionais)
router.get("/", authRequired, adminOnly, async (req, res) => {
  const { status, prioridade, categoria, condominio_id } = req.query;

  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`ch.status = $${values.length}`);
  }
  if (prioridade) {
    values.push(prioridade);
    conditions.push(`ch.prioridade = $${values.length}`);
  }
  if (categoria) {
    values.push(categoria);
    conditions.push(`ch.categoria = $${values.length}`);
  }
  if (condominio_id) {
    values.push(Number(condominio_id));
    conditions.push(`ch.condominio_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT
         ch.id,
         ch.status,
         ch.prioridade,
         ch.categoria,
         ch.titulo,
         ch.descricao,
         ch.condominio_id,
         ch.tecnico_id,
         ch.criado_em,
         ch.atualizado_em,
         ch.fechado_em,
         ch.primeira_resposta_em,
         c.nome  AS condominio_nome,
         u.nome  AS responsavel_nome,
         t.nome  AS tecnico_nome,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome,
         ch.ordem_servico_id,
         ch.avaliacao_nota,
         os.orcamento_necessario,
         os.orcamento_observacoes,
         os.finalizada_em       AS os_finalizada_em,
         -- Fase 8B: SLA estourado em tempo real
         -- sla_ttfr_estourado: sem resposta + passou do ttfr_min da prioridade
         CASE WHEN ch.status IN ('aberto', 'em_atendimento')
                   AND ch.primeira_resposta_em IS NULL
                   AND sd.ttfr_min IS NOT NULL
                   AND ch.criado_em < NOW() - (sd.ttfr_min || ' minutes')::interval
              THEN true ELSE false END AS sla_ttfr_estourado,
         -- sla_ttr_risco: não fechado + passou do ttr_min (ainda que já respondido)
         CASE WHEN ch.status IN ('aberto', 'em_atendimento')
                   AND sd.ttr_min IS NOT NULL
                   AND ch.criado_em < NOW() - (sd.ttr_min || ' minutes')::interval
              THEN true ELSE false END AS sla_ttr_risco,
         sd.ttfr_min AS sla_ttfr_min,
         sd.ttr_min  AS sla_ttr_min
       FROM chamados ch
       LEFT JOIN condominios c  ON c.id  = ch.condominio_id
       LEFT JOIN usuarios u     ON u.id  = ch.responsavel_id
       LEFT JOIN tecnicos t     ON t.id  = ch.tecnico_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN ordens_servico os     ON os.id = ch.ordem_servico_id
       LEFT JOIN sla_definicoes sd     ON sd.prioridade = ch.prioridade
       ${where}
       ORDER BY ch.criado_em DESC
       LIMIT 200`,
      values
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("[chamados] GET /chamados:", err);
    return res.status(500).json({ error: "Erro ao buscar chamados" });
  }
});

// GET /chamados/meus — chamados atribuídos ao técnico autenticado (app mobile)
// Resolve `tecnicos.id` via `tecnicos.usuario_id = req.user.id`.
// Filtros opcionais:
//   ?status=aberto,em_atendimento  (csv)
//   ?abertos=1  (atalho: status != 'fechado')
//   ?desde=ISO  (criado_em >= desde)
router.get("/meus", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
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

    const conditions = ["ch.tecnico_id = $1"];
    const values = [tecnicoId];

    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ["aberto", "em_atendimento", "fechado"].includes(s));
      if (statuses.length) {
        values.push(statuses);
        conditions.push(`ch.status = ANY($${values.length}::text[])`);
      }
    } else if (req.query.abertos === "1") {
      conditions.push(`ch.status <> 'fechado'`);
    }

    if (req.query.desde) {
      const d = new Date(req.query.desde);
      if (!isNaN(d.getTime())) {
        values.push(d);
        conditions.push(`ch.criado_em >= $${values.length}`);
      }
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query(
      `SELECT
         ch.id,
         ch.status,
         ch.prioridade,
         ch.categoria,
         ch.titulo,
         ch.descricao,
         ch.condominio_id,
         ch.tecnico_id,
         ch.criado_em,
         ch.atualizado_em,
         ch.fechado_em,
         c.nome     AS condominio_nome,
         c.endereco AS condominio_endereco,
         c.bairro   AS condominio_bairro,
         c.cidade   AS condominio_cidade,
         c.uf       AS condominio_uf,
         c.lat      AS condominio_lat,
         c.lng      AS condominio_lng,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome
       FROM chamados ch
       LEFT JOIN condominios c ON c.id = ch.condominio_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       ${where}
       ORDER BY
         CASE ch.status
           WHEN 'em_atendimento' THEN 0
           WHEN 'aberto' THEN 1
           ELSE 2
         END,
         CASE ch.prioridade
           WHEN 'emergencia' THEN 0
           WHEN 'alta' THEN 1
           WHEN 'media' THEN 2
           WHEN 'baixa' THEN 3
           ELSE 4
         END,
         ch.criado_em DESC
       LIMIT 500`,
      values
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("[chamados] GET /chamados/meus:", err);
    return res.status(500).json({ error: "Erro ao buscar chamados" });
  }
});

// GET /chamados/meus/:id — detalhe do chamado pro técnico autenticado.
// Inclui: chamado completo + reservatórios do condomínio + última leitura +
// O.S. vinculada (se houver) + últimas mensagens WhatsApp (se houver).
router.get("/meus/:id", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
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

    const chRes = await pool.query(
      `SELECT
         ch.id, ch.status, ch.prioridade, ch.categoria,
         ch.titulo, ch.descricao,
         ch.condominio_id, ch.tecnico_id, ch.conversa_id, ch.ordem_servico_id,
         ch.criado_em, ch.atualizado_em, ch.fechado_em,
         c.nome     AS condominio_nome,
         c.endereco AS condominio_endereco,
         c.bairro   AS condominio_bairro,
         c.cidade   AS condominio_cidade,
         c.uf       AS condominio_uf,
         c.cep      AS condominio_cep,
         c.lat      AS condominio_lat,
         c.lng      AS condominio_lng,
         c.telefone AS condominio_telefone,
         c.responsavel AS condominio_responsavel,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome
       FROM chamados ch
       LEFT JOIN condominios c ON c.id = ch.condominio_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       WHERE ch.id = $1 AND ch.tecnico_id = $2`,
      [id, tecnicoId]
    );

    if (chRes.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado ou não atribuído a você" });
    }
    const chamado = chRes.rows[0];

    // Reservatórios + última leitura (limite 5 min sem leitura = offline)
    let reservatorios = [];
    if (chamado.condominio_id) {
      const r = await pool.query(
        `SELECT
           r.id, r.nome, r.tipo, r.device_id, r.altura_total_m,
           ul.nivel         AS ultima_nivel,
           ul.nivel_pct     AS ultima_nivel_pct,
           ul.bomba_ligada  AS ultima_bomba_ligada,
           ul.criado_em     AS ultima_criado_em,
           CASE
             WHEN r.last_seen IS NULL THEN true
             WHEN (NOW() - r.last_seen) > interval '15 minutes' THEN true
             ELSE false
           END AS offline,
           COALESCE(a.alertas_abertos_count, 0) AS alertas_abertos_count
         FROM reservatorios r
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
           WHERE device_id = r.device_id AND status = 'aberto'
         ) a ON true
         WHERE r.condominio_id = $1
         ORDER BY r.id`,
        [chamado.condominio_id]
      );
      reservatorios = r.rows;
    }

    // O.S. vinculada
    let ordemServico = null;
    if (chamado.ordem_servico_id) {
      const os = await pool.query(
        `SELECT id, numero, chegada_em, chegada_lat, chegada_lng,
                saida_em, finalizada_em
         FROM ordens_servico WHERE id = $1`,
        [chamado.ordem_servico_id]
      );
      ordemServico = os.rows[0] || null;
    }

    // Últimas 10 mensagens da conversa WhatsApp (se houver)
    let mensagens = [];
    if (chamado.conversa_id) {
      const m = await pool.query(
        `SELECT direcao, tipo, conteudo, ia_resumo, criado_em
         FROM mensagens_whatsapp
         WHERE conversa_id = $1
         ORDER BY criado_em DESC
         LIMIT 10`,
        [chamado.conversa_id]
      );
      mensagens = m.rows.reverse();
    }

    return res.json({ ...chamado, reservatorios, ordem_servico: ordemServico, mensagens });
  } catch (err) {
    console.error("[chamados] GET /chamados/meus/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar chamado" });
  }
});

// ============================================================
// Mensagens do chamado para o técnico (thread cliente↔técnico).
// Persistidas em alerta_comentarios (alerta_origem='chamado').
// Acesso só para o técnico atribuído ao chamado.
// ============================================================

async function _tecnicoDoChamado(userId, chamadoId) {
  const tec = await pool.query(
    `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
    [userId]
  );
  if (tec.rows.length === 0) return null;
  const tecnicoId = tec.rows[0].id;

  const ch = await pool.query(
    `SELECT id FROM chamados WHERE id = $1 AND tecnico_id = $2 LIMIT 1`,
    [chamadoId, tecnicoId]
  );
  if (ch.rows.length === 0) return null;
  return tecnicoId;
}

// GET /chamados/meus/:id/mensagens
router.get("/meus/:id/mensagens", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const tecnicoId = await _tecnicoDoChamado(req.user.id, id);
    if (!tecnicoId) return res.status(404).json({ error: "Chamado não encontrado" });

    const r = await pool.query(
      `SELECT c.id, c.texto, c.foto_url, c.criado_em,
              c.autor_id, u.nome AS autor_nome, u.role AS autor_role
       FROM alerta_comentarios c
       LEFT JOIN usuarios u ON u.id = c.autor_id
       WHERE c.alerta_origem = 'chamado' AND c.alerta_id = $1
       ORDER BY c.criado_em ASC`,
      [id]
    );
    return res.json(r.rows);
  } catch (e) {
    console.error("[chamados] GET /meus/:id/mensagens:", e);
    return res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

// POST /chamados/meus/:id/mensagens   body: { texto?, foto_base64? }
router.post("/meus/:id/mensagens", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { texto, foto_base64 } = req.body || {};
  const t = texto && typeof texto === "string" ? texto.trim() : "";
  if (!t && !foto_base64) return res.status(400).json({ error: "Envie texto ou foto" });
  if (t.length > 2000) return res.status(400).json({ error: "Texto muito longo (máx 2000)" });

  try {
    const tecnicoId = await _tecnicoDoChamado(req.user.id, id);
    if (!tecnicoId) return res.status(404).json({ error: "Chamado não encontrado" });

    let fotoUrl = null;
    if (foto_base64) {
      try {
        ({ url: fotoUrl } = await salvarFotoMensagemChamado(id, foto_base64));
      } catch (e) {
        const code = e.code === "muito_grande" ? 413 : 400;
        return res.status(code).json({ error: e.message });
      }
    }

    const ins = await pool.query(
      `INSERT INTO alerta_comentarios (alerta_origem, alerta_id, autor_id, texto, foto_url)
       VALUES ('chamado', $1, $2, $3, $4)
       RETURNING id, texto, foto_url, criado_em, autor_id`,
      [id, req.user.id, t || null, fotoUrl]
    );
    const row = ins.rows[0];
    // Fase 8A: técnico mandando msg conta como primeira resposta humana.
    pool.query(
      `UPDATE chamados SET primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()) WHERE id = $1`,
      [id]
    ).catch((e) => console.error("[chamados] hook primeira_resposta_em msg-tec:", e.message));
    return res.status(201).json({
      ...row,
      autor_nome: req.user.nome || null,
      autor_role: req.user.role || "tecnico",
    });
  } catch (e) {
    console.error("[chamados] POST /meus/:id/mensagens:", e);
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

// POST /chamados/:id/iniciar-atendimento — técnico inicia atendimento.
// Recebe {lat, lng, precisao_m?}. Idempotente: se já em_atendimento, retorna
// a O.S. existente. Caso contrário muda status + cria O.S. rascunho com
// chegada_em/chegada_lat/chegada_lng e vincula ordem_servico_id no chamado.
router.post("/:id/iniciar-atendimento", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const { lat, lng, precisao_m } = req.body || {};
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return res.status(400).json({ error: "lat e lng são obrigatórios" });
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    return res.status(400).json({ error: "lat/lng fora de range" });
  }

  const client = await pool.connect();
  try {
    const tec = await client.query(
      `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (tec.rows.length === 0) {
      return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
    }
    const tecnicoId = tec.rows[0].id;

    const ch = await client.query(
      `SELECT id, status, condominio_id, tecnico_id, ordem_servico_id
       FROM chamados WHERE id = $1`,
      [id]
    );
    if (ch.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }
    const chamado = ch.rows[0];
    if (chamado.tecnico_id !== tecnicoId) {
      return res.status(403).json({ error: "Chamado não está atribuído a você" });
    }
    if (chamado.status === "fechado") {
      return res.status(400).json({ error: "Chamado já fechado" });
    }

    await client.query("BEGIN");

    // Idempotência: se já tem O.S. rascunho, retorna ela sem criar outra
    let osId = chamado.ordem_servico_id;
    let osRow = null;

    if (osId) {
      const existing = await client.query(
        `SELECT id, numero, chegada_em, chegada_lat, chegada_lng, finalizada_em
         FROM ordens_servico WHERE id = $1`,
        [osId]
      );
      osRow = existing.rows[0] || null;
    }

    if (!osRow) {
      const novaOs = await client.query(
        `INSERT INTO ordens_servico
           (numero, chamado_id, condominio_id, tecnico_id,
            chegada_em, chegada_lat, chegada_lng)
         VALUES (
           'OS-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('os_numero_seq')::text, 4, '0'),
           $1, $2, $3,
           NOW(), $4, $5
         )
         RETURNING id, numero, chegada_em, chegada_lat, chegada_lng, finalizada_em`,
        [id, chamado.condominio_id, tecnicoId, latN, lngN]
      );
      osRow = novaOs.rows[0];
      osId = osRow.id;

      await client.query(
        `UPDATE chamados
            SET status = 'em_atendimento',
                ordem_servico_id = $1,
                primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
                atualizado_em = NOW()
          WHERE id = $2`,
        [osId, id]
      );
    } else if (chamado.status !== "em_atendimento") {
      // O.S. já existe (foi criada manualmente ou ficou pendente),
      // mas chamado ainda não está em_atendimento — só atualiza status.
      await client.query(
        `UPDATE chamados
            SET status = 'em_atendimento',
                primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
                atualizado_em = NOW()
          WHERE id = $1`,
        [id]
      );
    }

    // Também grava a primeira posição em tecnico_localizacoes
    // (independe se o tracking contínuo subiu — ao menos a chegada fica)
    const precN = precisao_m != null ? Number(precisao_m) : null;
    await client.query(
      `INSERT INTO tecnico_localizacoes
         (tecnico_id, lat, lng, precisao_m, capturada_em, atualizada_em)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (tecnico_id) DO UPDATE SET
         lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         precisao_m = EXCLUDED.precisao_m,
         capturada_em = NOW(), atualizada_em = NOW()`,
      [tecnicoId, latN, lngN, Number.isFinite(precN) ? precN : null]
    );

    await client.query("COMMIT");

    return res.json({
      chamado_id: id,
      status: "em_atendimento",
      ordem_servico: osRow,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[chamados] POST /:id/iniciar-atendimento:", err);
    return res.status(500).json({ error: "Erro ao iniciar atendimento" });
  } finally {
    client.release();
  }
});

// GET /chamados/:id — detalhe do chamado
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const chamado = await pool.query(
      `SELECT
         ch.*,
         c.nome  AS condominio_nome,
         u.nome  AS responsavel_nome,
         t.nome  AS tecnico_nome,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome
       FROM chamados ch
       LEFT JOIN condominios c  ON c.id  = ch.condominio_id
       LEFT JOIN usuarios u     ON u.id  = ch.responsavel_id
       LEFT JOIN tecnicos t     ON t.id  = ch.tecnico_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       WHERE ch.id = $1`,
      [id]
    );

    if (chamado.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }

    // Busca mensagens da conversa vinculada
    let mensagens = [];
    if (chamado.rows[0].conversa_id) {
      const msgs = await pool.query(
        `SELECT direcao, tipo, conteudo, ia_categoria, ia_urgencia, ia_resumo, criado_em
         FROM mensagens_whatsapp
         WHERE conversa_id = $1
         ORDER BY criado_em ASC`,
        [chamado.rows[0].conversa_id]
      );
      mensagens = msgs.rows;
    }

    return res.json({ ...chamado.rows[0], mensagens });
  } catch (err) {
    console.error("[chamados] GET /chamados/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar chamado" });
  }
});

// PATCH /chamados/:id — atualiza status, prioridade ou responsável
router.patch("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const { status, prioridade, categoria, responsavel_id, condominio_id, tecnico_id } = req.body || {};

  const STATUSES   = ["aberto", "em_atendimento", "fechado"];
  const PRIORIDADES = ["baixa", "media", "alta", "emergencia"];

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status deve ser: ${STATUSES.join(", ")}` });
  }
  if (prioridade && !PRIORIDADES.includes(prioridade)) {
    return res.status(400).json({ error: `prioridade deve ser: ${PRIORIDADES.join(", ")}` });
  }
  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria deve ser: ${CATEGORIAS.join(", ")}` });
  }

  const sets = ["atualizado_em = NOW()"];
  const values = [];

  if (status) {
    values.push(status);
    sets.push(`status = $${values.length}`);
    if (status === "fechado") {
      sets.push("fechado_em = NOW()");
      // Fase 8A: tempo_resolucao_seg = quanto demorou pra resolver, em segundos.
      sets.push("tempo_resolucao_seg = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - criado_em))::int)");
    } else {
      // Reabertura (status saindo de 'fechado'): zera o tempo de resolução
      // pra ser recalculado no próximo fechamento. fechado_em fica como
      // memória do último fechamento.
      sets.push("tempo_resolucao_seg = CASE WHEN status = 'fechado' THEN NULL ELSE tempo_resolucao_seg END");
    }
    // Fase 8A: qualquer transição saindo de 'aberto' conta como primeira resposta.
    if (status !== "aberto") {
      sets.push("primeira_resposta_em = COALESCE(primeira_resposta_em, NOW())");
    }
  }
  if (prioridade) {
    values.push(prioridade);
    sets.push(`prioridade = $${values.length}`);
  }
  if (categoria) {
    values.push(categoria);
    sets.push(`categoria = $${values.length}`);
  }
  if (responsavel_id !== undefined) {
    values.push(responsavel_id || null);
    sets.push(`responsavel_id = $${values.length}`);
  }
  if (condominio_id !== undefined) {
    const cid = condominio_id ? Number(condominio_id) : null;
    if (cid !== null && (!Number.isInteger(cid) || cid <= 0)) {
      return res.status(400).json({ error: "condominio_id inválido" });
    }
    values.push(cid);
    sets.push(`condominio_id = $${values.length}`);
  }
  if (tecnico_id !== undefined) {
    const tid = tecnico_id ? Number(tecnico_id) : null;
    if (tid !== null && (!Number.isInteger(tid) || tid <= 0)) {
      return res.status(400).json({ error: "tecnico_id inválido" });
    }
    values.push(tid);
    sets.push(`tecnico_id = $${values.length}`);
  }

  if (values.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE chamados SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[chamados] PATCH /chamados/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar chamado" });
  }
});

module.exports = { chamadosRouter: router };
