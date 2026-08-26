// src/routes/cliente.routes.js
const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const { authRequired } = require("../middleware/authRequired");
const { clienteOnly } = require("../middleware/clienteOnly");
const { OFFLINE_MINUTES } = require("../config");
const { gerarPdfOS } = require("../services/os-pdf.service");
const { gerarPdfAvulso } = require("../services/orcamento-pdf.service");
const { sendOrcamentoRespondido } = require("../services/email");
const { salvarFotoMensagemChamado } = require("../services/chamado-mensagens.service");
const { registrarCriacao } = require("../services/chamado-historico.service");

const router = express.Router();

// Mesma resolucao usada no admin: variavel de ambiente quando existe, senao o
// host do request. Sem isto o link do aviso apontaria para localhost em dev e
// para o host interno do container em producao.
function _baseUrlPublica(req) {
  const env = process.env.APP_URL || process.env.PUBLIC_BASE_URL;
  if (env) return String(env).replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

const CATEGORIAS = ["vazamento", "bomba_falha", "nivel_baixo", "sem_agua", "ruido", "manutencao", "outro"];

// Mapa categoria → prioridade automática. O cliente NÃO escolhe prioridade
// (decisão de produto: clientes tendem a marcar tudo como emergência, o que
// inviabiliza a fila do técnico). Mesma tabela no frontend em
// app/public/app.js (CLI_CAT_TO_PRIO) só para o modo demo offline.
const CATEGORIA_PRIORIDADE = {
  sem_agua:    "p1",
  vazamento:   "p2",
  bomba_falha: "p2",
  nivel_baixo: "p3",
  manutencao:  "p4",
  ruido:       "p3",
  outro:       "p3",
};

// GET /cliente/status  (AGORA baseado em RESERVATÓRIOS)
router.get("/status", authRequired, clienteOnly, async (req, res) => {
  try {
    const condominioId = Number(req.user.condominio_id);

    if (!condominioId) {
      return res.status(403).json({ error: "Cliente sem condomínio vinculado" });
    }

    // 1) Condomínio (SEM device_id)
    const condominioResult = await pool.query(
      `SELECT id, nome, endereco, bairro, cidade, uf
       FROM condominios
       WHERE id = $1
       LIMIT 1`,
      [condominioId]
    );

    if (condominioResult.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    const condominio = condominioResult.rows[0];

    // 2) Reservatórios + última leitura + offline + contagem de alertas
    const limiteMinutos = OFFLINE_MINUTES;

    const reservsRes = await pool.query(
      `
      SELECT
        r.id,
        r.nome,
        r.tipo,
        r.device_id,

        ul.nivel         AS ultima_nivel,
        ul.nivel_pct     AS ultima_nivel_pct,
        ul.bomba_ligada  AS ultima_bomba_ligada,
        ul.criado_em     AS ultima_criado_em,

        CASE
          WHEN r.last_seen IS NULL THEN true
          WHEN (NOW() - r.last_seen) > ($2 || ' minutes')::interval THEN true
          ELSE false
        END AS offline,

        CASE
          WHEN r.last_seen IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - r.last_seen))/60)::int
        END AS minutos_sem_atualizar,

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

      WHERE r.condominio_id = $1 AND r.ativo = true
      ORDER BY r.id ASC
      `,
      [condominioId, limiteMinutos]
    );

    const reservatorios = reservsRes.rows.map(r => ({
      id: r.id,
      nome: r.nome,
      tipo: r.tipo,
      device_id: r.device_id,
      ultima_leitura: r.ultima_criado_em ? {
        device_id: r.device_id,
        nivel: r.ultima_nivel,
        nivel_pct: r.ultima_nivel_pct,
        bomba_ligada: r.ultima_bomba_ligada,
        criado_em: r.ultima_criado_em,
      } : null,
      offline: !!r.offline,
      minutos_sem_atualizar: r.minutos_sem_atualizar,
      alertas_abertos_count: r.alertas_abertos_count,
    }));

    // 3) Alertas abertos (de TODOS os reservatórios do condomínio)
    const alertasResult = await pool.query(
      `
      SELECT a.id, a.device_id, a.tipo, a.mensagem, a.status, a.criado_em, a.atualizado_em
      FROM alertas a
      JOIN reservatorios r ON r.device_id = a.device_id
      WHERE r.condominio_id = $1
        AND a.status = 'aberto'
      ORDER BY a.atualizado_em DESC
      `,
      [condominioId]
    );

    // 4) ultima_leitura "geral" (mais recente entre os reservatórios)
    let ultimaGeral = null;
    for (const r of reservatorios) {
      const u = r.ultima_leitura;
      if (!u?.criado_em) continue;
      if (!ultimaGeral) ultimaGeral = u;
      else if (new Date(u.criado_em) > new Date(ultimaGeral.criado_em)) ultimaGeral = u;
    }

    return res.json({
      condominio,
      reservatorios,
      ultima_leitura: ultimaGeral, // mantém compatível com o seu cliente.js atual
      alertas_abertos: alertasResult.rows,
    });

  } catch (error) {
    console.error("Erro cliente/status:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// GET /cliente/historico?device_id=RES001&dias=7
router.get("/historico", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const { device_id, dias: diasStr } = req.query;

  if (!device_id) {
    return res.status(400).json({ error: "device_id é obrigatório" });
  }

  const dias = Math.min(Math.max(Number(diasStr) || 7, 1), 90);

  try {
    // Verifica que o device pertence ao condomínio do cliente
    const check = await pool.query(
      "SELECT id FROM reservatorios WHERE device_id = $1 AND condominio_id = $2 LIMIT 1",
      [device_id, condominioId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Dispositivo não autorizado" });
    }

    // Tamanho do bucket em segundos conforme o período
    let bucketSec;
    if (dias <= 1)       bucketSec = 300;    // 5 min
    else if (dias <= 7)  bucketSec = 3600;   // 1 hora
    else if (dias <= 30) bucketSec = 14400;  // 4 horas
    else                 bucketSec = 43200;  // 12 horas

    // nivel_pct_resolvido: usa nivel_pct direto, ou deriva do campo nivel (string)
    // para leituras antigas inseridas antes da coluna nivel_pct existir
    const result = await pool.query(
      `SELECT
         TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM criado_em) / $3) * $3) AS bucket,
         ROUND(AVG(
           COALESCE(nivel_pct,
             CASE nivel
               WHEN 'alto'       THEN 85
               WHEN 'medio'      THEN 60
               WHEN 'baixo'      THEN 30
               WHEN 'muito_baixo' THEN 10
             END)
         ))::int AS nivel_pct_avg,
         MIN(COALESCE(nivel_pct,
           CASE nivel
             WHEN 'alto'       THEN 85
             WHEN 'medio'      THEN 60
             WHEN 'baixo'      THEN 30
             WHEN 'muito_baixo' THEN 10
           END))::int AS nivel_pct_min,
         MAX(COALESCE(nivel_pct,
           CASE nivel
             WHEN 'alto'       THEN 85
             WHEN 'medio'      THEN 60
             WHEN 'baixo'      THEN 30
             WHEN 'muito_baixo' THEN 10
           END))::int AS nivel_pct_max,
         BOOL_OR(bomba_ligada) AS bomba_ligada,
         COUNT(*)::int         AS count
       FROM leituras
       WHERE device_id = $1
         AND criado_em >= NOW() - ($2 || ' days')::interval
         AND (nivel_pct IS NOT NULL OR nivel IS NOT NULL)
       GROUP BY FLOOR(EXTRACT(EPOCH FROM criado_em) / $3)
       ORDER BY bucket ASC`,
      [device_id, dias, bucketSec]
    );

    const rows = result.rows;

    let stats = null;
    if (rows.length > 0) {
      const allMin = rows.map((r) => r.nivel_pct_min);
      const allMax = rows.map((r) => r.nivel_pct_max);
      const allAvg = rows.map((r) => r.nivel_pct_avg);
      stats = {
        min_pct: Math.min(...allMin),
        max_pct: Math.max(...allMax),
        avg_pct: Math.round(allAvg.reduce((s, v) => s + v, 0) / allAvg.length),
        total_leituras: rows.reduce((s, r) => s + r.count, 0),
      };
    }

    return res.json({ device_id, dias, bucket_sec: bucketSec, leituras: rows, stats });
  } catch (error) {
    console.error("Erro /cliente/historico:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// POST /cliente/trocar-senha
router.post("/trocar-senha", authRequired, clienteOnly, async (req, res) => {
  const { senha_atual, senha_nova } = req.body || {};

  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: "Campos: senha_atual, senha_nova" });
  }
  if (String(senha_nova).length < 6) {
    return res
      .status(400)
      .json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
  }

  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const u = result.rows[0];

    const ok = await bcrypt.compare(String(senha_atual), u.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Senha atual inválida" });
    }

    const novaHash = await bcrypt.hash(String(senha_nova), 10);

    await pool.query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [
      userId,
      novaHash,
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Erro /cliente/trocar-senha:", e);
    return res.status(500).json({ error: "Erro ao trocar senha" });
  }
});

// ============================================================
// 7H — Chamados do cliente (lista, detalhe, criar) + PDF da O.S.
// Sempre filtrado pelo condominio_id do JWT — cliente nunca vê de outro.
// ============================================================

// GET /cliente/chamados?status=aberto,em_atendimento
router.get("/chamados", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  if (!condominioId) return res.status(403).json({ error: "Cliente sem condomínio vinculado" });

  const statusCsv = (req.query.status || "").trim();
  const statusList = statusCsv ? statusCsv.split(",").map((s) => s.trim()).filter(Boolean) : null;

  const values = [condominioId];
  let where = `ch.condominio_id = $1`;
  if (statusList && statusList.length) {
    values.push(statusList);
    where += ` AND ch.status = ANY($${values.length}::text[])`;
  }

  try {
    const r = await pool.query(
      `SELECT
         ch.id, ch.status, ch.prioridade, ch.categoria, ch.titulo, ch.descricao,
         ch.criado_em, ch.atualizado_em, ch.fechado_em,
         os.id AS ordem_servico_id,
         t.nome AS tecnico_nome,
         os.finalizada_em AS os_finalizada_em
       FROM chamados ch
       LEFT JOIN tecnicos t          ON t.id = ch.tecnico_id
       LEFT JOIN ordens_servico os   ON os.chamado_id = ch.id
       WHERE ${where}
       ORDER BY
         CASE ch.status
           WHEN 'em_atendimento' THEN 1
           WHEN 'aberto'         THEN 2
           ELSE 3
         END,
         ch.criado_em DESC
       LIMIT 200`,
      values
    );
    return res.json(r.rows);
  } catch (e) {
    console.error("[cliente] GET /chamados:", e);
    return res.status(500).json({ error: "Erro ao listar chamados" });
  }
});

// GET /cliente/chamados/:id — detalhe + O.S. vinculada.
// IMPORTANTE: campos de avaliação (nota/comentário) NÃO são expostos ao
// cliente — esse dado é só pra admin. Aqui só sinalizamos `ja_avaliado`
// pra que a UI saiba se deve esconder o formulário.
router.get("/chamados/:id", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `SELECT
         ch.id, ch.conversa_id, ch.condominio_id, ch.status, ch.prioridade,
         ch.titulo, ch.descricao, ch.responsavel_id, ch.criado_em,
         ch.atualizado_em, ch.fechado_em, ch.categoria, ch.tecnico_id,
         os.id AS ordem_servico_id,
         (ch.avaliacao_nota IS NOT NULL) AS ja_avaliado,
         t.nome AS tecnico_nome,
         os.id              AS os_id,
         os.numero          AS os_numero,
         os.finalizada_em   AS os_finalizada_em,
         os.servico_realizado,
         os.necessario_retorno,
         os.retorno_sugerido_em
       FROM chamados ch
       LEFT JOIN tecnicos t        ON t.id = ch.tecnico_id
       LEFT JOIN ordens_servico os ON os.chamado_id = ch.id
       WHERE ch.id = $1 AND ch.condominio_id = $2
       LIMIT 1`,
      [id, condominioId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Chamado não encontrado" });
    return res.json(r.rows[0]);
  } catch (e) {
    console.error("[cliente] GET /chamados/:id:", e);
    return res.status(500).json({ error: "Erro ao buscar chamado" });
  }
});

// ============================================================
// Mensagens do chamado — thread entre cliente e técnico.
// Persistidas em alerta_comentarios (alerta_origem='chamado').
// ============================================================

async function _verificaChamadoDoCliente(chamadoId, condominioId) {
  const r = await pool.query(
    `SELECT id FROM chamados WHERE id = $1 AND condominio_id = $2 LIMIT 1`,
    [chamadoId, condominioId]
  );
  return r.rows.length > 0;
}

// GET /cliente/chamados/:id/mensagens
router.get("/chamados/:id/mensagens", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const ok = await _verificaChamadoDoCliente(id, condominioId);
    if (!ok) return res.status(404).json({ error: "Chamado não encontrado" });

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
    console.error("[cliente] GET /chamados/:id/mensagens:", e);
    return res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

// POST /cliente/chamados/:id/mensagens
// body: { texto?, foto_base64? }   — pelo menos um dos dois é obrigatório
router.post("/chamados/:id/mensagens", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { texto, foto_base64 } = req.body || {};
  const t = texto && typeof texto === "string" ? texto.trim() : "";
  if (!t && !foto_base64) {
    return res.status(400).json({ error: "Envie texto ou foto" });
  }
  if (t.length > 2000) return res.status(400).json({ error: "Texto muito longo (máx 2000)" });

  try {
    const ok = await _verificaChamadoDoCliente(id, condominioId);
    if (!ok) return res.status(404).json({ error: "Chamado não encontrado" });

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
    return res.status(201).json({
      ...row,
      autor_nome: req.user.nome || null,
      autor_role: req.user.role || "cliente",
    });
  } catch (e) {
    console.error("[cliente] POST /chamados/:id/mensagens:", e);
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

// ============================================================
// Avaliação do atendimento — disponível após chamado fechado.
// Só pode ser enviada uma vez.
// ============================================================

// POST /cliente/chamados/:id/avaliar  — body: { nota: 1-5, comentario? }
router.post("/chamados/:id/avaliar", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const nota = Number(req.body?.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ error: "nota deve ser inteiro entre 1 e 5" });
  }
  const comentario = req.body?.comentario && typeof req.body.comentario === "string"
    ? req.body.comentario.trim().slice(0, 1000)
    : null;

  try {
    const ch = await pool.query(
      `SELECT id, status, avaliacao_nota
       FROM chamados
       WHERE id = $1 AND condominio_id = $2
       LIMIT 1`,
      [id, condominioId]
    );
    if (ch.rows.length === 0) return res.status(404).json({ error: "Chamado não encontrado" });

    const row = ch.rows[0];
    if (row.status !== "fechado") {
      return res.status(400).json({ error: "Só é possível avaliar chamados fechados" });
    }
    if (row.avaliacao_nota != null) {
      return res.status(409).json({ error: "Este chamado já foi avaliado" });
    }

    await pool.query(
      `UPDATE chamados
       SET avaliacao_nota = $2,
           avaliacao_comentario = $3,
           avaliacao_em = NOW()
       WHERE id = $1`,
      [id, nota, comentario]
    );
    // Resposta opaca pro cliente — a nota/comentário é interno (só admin lê).
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error("[cliente] POST /chamados/:id/avaliar:", e);
    return res.status(500).json({ error: "Erro ao registrar avaliação" });
  }
});

// POST /cliente/chamados — cliente abre chamado pelo app.
// Prioridade NÃO é aceita no body: o backend deriva da categoria (ver
// CATEGORIA_PRIORIDADE acima). Se o cliente mandar o campo, é ignorado.
router.post("/chamados", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  if (!condominioId) return res.status(403).json({ error: "Cliente sem condomínio vinculado" });

  const { categoria, descricao, titulo } = req.body || {};

  if (!descricao || typeof descricao !== "string" || descricao.trim().length < 5) {
    return res.status(400).json({ error: "Descreva o problema com pelo menos 5 caracteres" });
  }
  if (descricao.length > 4000) {
    return res.status(400).json({ error: "Descrição muito longa (max 4000)" });
  }
  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria deve ser: ${CATEGORIAS.join(", ")}` });
  }

  const cat = categoria || "outro";
  const prio = CATEGORIA_PRIORIDADE[cat] || "media";

  // Título: vem do form ou deriva da categoria
  const tituloFinal = titulo && String(titulo).trim()
    ? String(titulo).trim().slice(0, 255)
    : `Solicitação: ${cat.replace(/_/g, " ")}`;

  try {
    const ins = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status)
       VALUES ($1, $2, $3, $4, $5, 'aberto')
       RETURNING id, status, prioridade, categoria, titulo, descricao, criado_em`,
      [condominioId, tituloFinal, descricao.trim(), prio, cat]
    );
    registrarCriacao({ chamadoId: ins.rows[0].id, alteradoPor: req.user.id });
    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error("[cliente] POST /chamados:", e);
    return res.status(500).json({ error: "Erro ao abrir chamado" });
  }
});

// GET /cliente/ordens-servico/:id/pdf — baixa PDF da O.S. do próprio condomínio
router.get("/ordens-servico/:id/pdf", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `SELECT id, numero, finalizada_em, condominio_id FROM ordens_servico WHERE id = $1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "O.S. não encontrada" });
    const os = r.rows[0];
    if (Number(os.condominio_id) !== condominioId) {
      return res.status(403).json({ error: "O.S. não pertence ao seu condomínio" });
    }
    if (!os.finalizada_em) {
      return res.status(400).json({ error: "O.S. ainda não foi finalizada" });
    }

    const expectedPath = path.join(__dirname, "../../uploads/os", String(id), `os-${os.numero}.pdf`);
    let exists = false;
    try { await fs.access(expectedPath); exists = true; } catch {}
    if (!exists) {
      console.log(`[cliente] PDF on-demand OS#${id}`);
      await gerarPdfOS(id);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="os-${os.numero}.pdf"`);
    return res.sendFile(expectedPath);
  } catch (e) {
    console.error("[cliente] GET /ordens-servico/:id/pdf:", e);
    return res.status(500).json({ error: "Erro ao servir PDF da O.S." });
  }
});

// ─── Chat interno (canal='app') ──────────────────────────────────────────────
//
// O cliente tem 1 conversa ativa por vez. A IA responde igual ao WhatsApp —
// a diferença é que a resposta é salva no banco e retornada direto no HTTP
// (sem chamar Meta/WhatsApp API). O app faz polling para novas mensagens.

const { processarComIA } = require("../services/ia.service");

async function _buscarOuCriarChatApp(condominioId, usuarioId) {
  // Busca conversa aberta ou em_atendimento com canal='app' do condomínio
  const existing = await pool.query(
    `SELECT cw.id FROM conversas_whatsapp cw
      JOIN clientes_whatsapp cl ON cl.id = cw.cliente_whatsapp_id
     WHERE cl.condominio_id = $1
       AND cw.canal = 'app'
       AND cw.status IN ('aberta', 'em_atendimento')
     ORDER BY cw.criado_em DESC LIMIT 1`,
    [condominioId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  // Garante registro em clientes_whatsapp — telefone fictício como chave única,
  // nome vem do usuário logado para aparecer corretamente no painel de atendimento
  const nomeUsuario = await pool.query(`SELECT nome FROM usuarios WHERE id = $1`, [usuarioId]);
  const nomeDisplay = nomeUsuario.rows[0]?.nome || `Usuário ${usuarioId}`;
  const cli = await pool.query(
    `INSERT INTO clientes_whatsapp (telefone, nome, condominio_id, usuario_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telefone) DO UPDATE
       SET condominio_id = EXCLUDED.condominio_id,
           nome          = EXCLUDED.nome
     RETURNING id`,
    [`app:${usuarioId}`, nomeDisplay, condominioId, usuarioId]
  );
  const clienteId = cli.rows[0].id;

  const nova = await pool.query(
    `INSERT INTO conversas_whatsapp (cliente_whatsapp_id, canal) VALUES ($1, 'app') RETURNING id`,
    [clienteId]
  );
  return nova.rows[0].id;
}

// GET /cliente/chat — retorna conversa ativa + últimas 40 mensagens
router.get("/chat", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const usuarioId   = Number(req.user.id);
  try {
    const convId = await _buscarOuCriarChatApp(condominioId, usuarioId);
    const msgs = await pool.query(
      `SELECT id, direcao, conteudo, tipo, criado_em
         FROM mensagens_whatsapp
        WHERE conversa_id = $1
        ORDER BY criado_em ASC LIMIT 40`,
      [convId]
    );
    const conv = await pool.query(
      `SELECT status, assumida_por_id, aguardando_atendente FROM conversas_whatsapp WHERE id = $1`,
      [convId]
    );
    return res.json({ conversa_id: convId, mensagens: msgs.rows, ...conv.rows[0] });
  } catch (err) {
    console.error("[chat-app] GET /chat:", err);
    return res.status(500).json({ error: "Erro ao carregar chat" });
  }
});

// GET /cliente/chat/mensagens?desde=ISO — polling incremental
router.get("/chat/mensagens", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const usuarioId   = Number(req.user.id);
  const desde = req.query.desde || new Date(0).toISOString();
  try {
    const convId = await _buscarOuCriarChatApp(condominioId, usuarioId);
    const msgs = await pool.query(
      `SELECT id, direcao, conteudo, tipo, criado_em
         FROM mensagens_whatsapp
        WHERE conversa_id = $1 AND criado_em > $2
        ORDER BY criado_em ASC`,
      [convId, desde]
    );
    const conv = await pool.query(
      `SELECT status, assumida_por_id, aguardando_atendente FROM conversas_whatsapp WHERE id = $1`,
      [convId]
    );
    return res.json({ conversa_id: convId, mensagens: msgs.rows, ...conv.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Erro" });
  }
});

// POST /cliente/chat/mensagem — cliente envia mensagem → IA responde
router.post("/chat/mensagem", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const usuarioId   = Number(req.user.id);
  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ error: "Texto obrigatório" });

  try {
    const convId = await _buscarOuCriarChatApp(condominioId, usuarioId);

    // Salva mensagem do cliente
    await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
       VALUES ($1, 'entrada', 'text', $2)`,
      [convId, texto.trim()]
    );

    // Verifica estado da conversa
    const convRes = await pool.query(
      `SELECT assumida_por_id, aguardando_atendente, estado_conversa, pendente_acao
         FROM conversas_whatsapp WHERE id = $1`,
      [convId]
    );
    const conv = convRes.rows[0] || {};

    // Se humano assumiu ou aguarda atendente, não aciona IA
    if (conv.assumida_por_id || conv.aguardando_atendente) {
      return res.json({ ia: false, aguardando_atendente: true });
    }

    // Ação pendente aguardando confirmação (state machine)
    const _RE_CONF = /\b(sim|pode|ok|vai|certo|por favor|claro|confirmo|confirma|quero|abre|registra)\b/i;
    const _RE_NEG  = /\b(n[aã]o|cancel|deixa|ignora|esquece)\b/i;
    if (conv.estado_conversa === "aguardando_confirmacao" && conv.pendente_acao) {
      if (_RE_CONF.test(texto)) {
        const { tipo, params } = conv.pendente_acao;
        let respostaConfirm = null;
        if (tipo === "abrir_chamado") {
          const { registrarCriacao } = require("../services/chamado-historico.service");
          const r = await pool.query(
            `INSERT INTO chamados (conversa_id, condominio_id, titulo, descricao, prioridade, categoria)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [convId, condominioId, params.titulo, params.descricao, params.prioridade, params.categoria || "outro"]
          );
          registrarCriacao({ chamadoId: r.rows[0].id, alteradoPor: null });
          await pool.query(
            `UPDATE conversas_whatsapp SET pendente_acao=NULL, estado_conversa='chamado_aberto', ia_sem_avanco=0 WHERE id=$1`,
            [convId]
          );
          respostaConfirm = `Chamado registrado. Nossa equipe vai entrar em contato em breve. Número: CH-${String(r.rows[0].id).padStart(4,"0")}.`;
        } else if (tipo === "criar_solicitacao_orcamento") {
          const { _executarCriarOrcamento } = require("../services/ia.service");
          const orc = await _executarCriarOrcamento(params);
          await pool.query(
            `UPDATE conversas_whatsapp SET pendente_acao=NULL, estado_conversa='triagem', ia_sem_avanco=0 WHERE id=$1`,
            [convId]
          );
          respostaConfirm = `Pedido de orçamento registrado. Nossa equipe comercial vai entrar em contato com uma proposta. Número: ${orc.numero}.`;
        }
        if (respostaConfirm) {
          await pool.query(
            `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1,'saida','text',$2)`,
            [convId, respostaConfirm]
          );
          return res.json({ ia: true, resposta: respostaConfirm });
        }
      } else if (_RE_NEG.test(texto)) {
        await pool.query(
          `UPDATE conversas_whatsapp SET pendente_acao=NULL, estado_conversa='triagem' WHERE id=$1`,
          [convId]
        );
        const msgNeg = "Tudo bem, não vou registrar. Se precisar de mais alguma coisa, é só falar.";
        await pool.query(
          `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1,'saida','text',$2)`,
          [convId, msgNeg]
        );
        return res.json({ ia: true, resposta: msgNeg });
      }
    }

    // Busca histórico + contexto do condomínio
    const [historicoRes, condRes] = await Promise.all([
      pool.query(
        `SELECT direcao, conteudo FROM mensagens_whatsapp
          WHERE conversa_id = $1 ORDER BY criado_em ASC LIMIT 20`,
        [convId]
      ),
      pool.query(`SELECT nome FROM condominios WHERE id = $1`, [condominioId]),
    ]);

    const resultado = await processarComIA({
      conversa_id:         convId,
      condominio_id:       condominioId,
      condominio_nome:     condRes.rows[0]?.nome ?? null,
      cliente_whatsapp_id: null,
      contato_nome:        req.user.nome ?? null,
      contato_tipo:        "gestao_condominio",
      contato_observacoes: null,
      historico:           historicoRes.rows,
    });

    if (!resultado?.resposta) return res.json({ ia: false });

    const { resposta, progresso } = resultado;

    // Anti-loop
    if (progresso) {
      await pool.query(`UPDATE conversas_whatsapp SET ia_sem_avanco = 0 WHERE id = $1`, [convId]);
    } else {
      const upd = await pool.query(
        `UPDATE conversas_whatsapp SET ia_sem_avanco = ia_sem_avanco + 1
          WHERE id = $1 RETURNING ia_sem_avanco`,
        [convId]
      );
      if ((upd.rows[0]?.ia_sem_avanco ?? 0) >= 3) {
        const msgEsc = "Vou encaminhar você para um de nossos atendentes.";
        await pool.query(
          `UPDATE conversas_whatsapp SET aguardando_atendente = TRUE, ia_sem_avanco = 0 WHERE id = $1`,
          [convId]
        );
        await pool.query(
          `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1, 'saida', 'text', $2)`,
          [convId, msgEsc]
        );
        return res.json({ ia: true, resposta: msgEsc, aguardando_atendente: true });
      }
    }

    // Salva resposta da IA
    await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
       VALUES ($1, 'saida', 'text', $2)`,
      [convId, resposta]
    );

    return res.json({ ia: true, resposta });
  } catch (err) {
    console.error("[chat-app] POST /chat/mensagem:", err);
    return res.status(500).json({ error: "Erro ao processar mensagem" });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ORÇAMENTOS — o síndico responde pelo painel dele
// ────────────────────────────────────────────────────────────────────────
// Antes o orçamento saía por e-mail com o PDF anexado e a resposta voltava
// por fora (telefone, WhatsApp). Alguém do escritório registrava o "aprovado"
// no admin — então não havia registro de que o cliente, ele mesmo, tinha dito
// sim, nem quando, nem com que ressalva.
//
// ⚠️ ESCOPO: só condomínio com login. Orçamento avulso de pessoa física não
// entra — quem não tem condomínio não tem usuário, e a resposta dele continua
// vindo por fora. Ver migration 074.
//
// ⚠️ O CLIENTE SÓ VÊ O QUE JÁ FOI ENVIADO A ELE. Rascunho é documento em
// preparo, com valor possivelmente errado; vazar isso para o condomínio seria
// pior que não ter a tela. O filtro de status é a regra de negócio central
// desta seção — não afrouxar.
// ════════════════════════════════════════════════════════════════════════

const _ORC_VISIVEIS_AO_CLIENTE = ["enviado", "aprovado", "rejeitado"];

// GET /cliente/orcamentos — os orçamentos do condomínio, já enviados
router.get("/orcamentos", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  if (!condominioId) return res.status(403).json({ error: "Cliente sem condomínio vinculado" });

  try {
    const r = await pool.query(
      `SELECT
         o.id, o.numero, o.status, o.tipo, o.constatacao,
         o.criado_em, o.enviado_em, o.valido_ate,
         o.respondido_em, o.cliente_comentario, o.motivo_rejeicao,
         COALESCE(
           o.valor,
           (SELECT SUM(l.quantidade * COALESCE(l.valor_unitario, 0))
              FROM orcamento_linhas l WHERE l.orcamento_id = o.id),
           0
         ) AS valor_total,
         (SELECT COUNT(*) FROM orcamento_linhas l WHERE l.orcamento_id = o.id)::int AS itens
       FROM orcamentos o
       WHERE o.condominio_id = $1
         AND o.status = ANY($2::text[])
       ORDER BY
         CASE WHEN o.status = 'enviado' THEN 0 ELSE 1 END,
         COALESCE(o.enviado_em, o.criado_em) DESC
       LIMIT 100`,
      [condominioId, _ORC_VISIVEIS_AO_CLIENTE]
    );

    // O nome vem à parte porque a tela precisa dele TAMBÉM quando a lista
    // está vazia — que é o estado mais comum. Num JOIN ele sumiria junto
    // com as linhas.
    const c = await pool.query("SELECT nome FROM condominios WHERE id = $1", [condominioId]);

    return res.json({ condominio: c.rows[0]?.nome || null, orcamentos: r.rows });
  } catch (e) {
    console.error("[cliente] GET /orcamentos:", e);
    return res.status(500).json({ error: "Erro ao listar orçamentos" });
  }
});

// GET /cliente/orcamentos/:id — detalhe com as linhas
router.get("/orcamentos/:id", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `SELECT o.id, o.numero, o.status, o.tipo, o.constatacao, o.condominio_id,
              o.forma_pagamento, o.prazo_entrega, o.garantia, o.valido_ate,
              o.criado_em, o.enviado_em, o.respondido_em,
              o.cliente_comentario, o.motivo_rejeicao,
              COALESCE(
                o.valor,
                (SELECT SUM(l.quantidade * COALESCE(l.valor_unitario, 0))
                   FROM orcamento_linhas l WHERE l.orcamento_id = o.id),
                0
              ) AS valor_total
         FROM orcamentos o
        WHERE o.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
    const orc = r.rows[0];
    if (Number(orc.condominio_id) !== condominioId) {
      return res.status(403).json({ error: "Orçamento não pertence ao seu condomínio" });
    }
    if (!_ORC_VISIVEIS_AO_CLIENTE.includes(orc.status)) {
      // Rascunho existe mas ainda não foi enviado: para o cliente, ele não
      // existe. 404 em vez de 403 de propósito — um 403 confirmaria que há um
      // orçamento em preparo, informação que ele não deveria ter.
      return res.status(404).json({ error: "Orçamento não encontrado" });
    }

    const linhas = await pool.query(
      `SELECT id, descricao, ficha_tecnica, quantidade, valor_unitario, tipo_servico
         FROM orcamento_linhas WHERE orcamento_id = $1 ORDER BY id`,
      [id]
    );
    return res.json({ ...orc, linhas: linhas.rows });
  } catch (e) {
    console.error("[cliente] GET /orcamentos/:id:", e);
    return res.status(500).json({ error: "Erro ao carregar orçamento" });
  }
});

// POST /cliente/orcamentos/:id/responder — aprovar ou recusar
router.post("/orcamentos/:id/responder", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const decisao = String(req.body?.decisao || "").trim();
  if (!["aprovar", "recusar"].includes(decisao)) {
    return res.status(400).json({ error: "Decisão inválida" });
  }
  const comentario = req.body?.comentario != null
    ? String(req.body.comentario).trim().slice(0, 2000)
    : "";
  // Recusar sem dizer por quê deixa o escritório sem ação possível — é a
  // única das duas respostas que exige justificativa.
  if (decisao === "recusar" && !comentario) {
    return res.status(400).json({ error: "Diga o motivo da recusa para a gente poder revisar." });
  }

  // ⚠️ QUEM ASSUMIU A DECISÃO, e não qual conta clicou (25/08/2026).
  // `respondido_por` guarda o id do usuário logado, e a conta é do CONDOMÍNIO:
  // quem clica pode ser o síndico, o subsíndico ou quem estiver com o e-mail
  // aberto naquele dia. Numa conversa seis meses depois — "quem autorizou este
  // serviço?" — o id do usuário não responde nada. Por isso nome e cargo são
  // digitados na hora, e valem para a recusa também: saber quem recusou vale
  // tanto quanto.
  const nome = String(req.body?.nome || "").trim().slice(0, 120);
  const cargo = String(req.body?.cargo || "").trim().slice(0, 60);
  if (!nome) {
    return res.status(400).json({ error: "Diga o seu nome para registrarmos quem respondeu." });
  }
  if (!cargo) {
    return res.status(400).json({ error: "Diga o seu cargo no condomínio." });
  }

  try {
    const r = await pool.query(
      `SELECT id, status, condominio_id FROM orcamentos WHERE id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
    const orc = r.rows[0];
    if (Number(orc.condominio_id) !== condominioId) {
      return res.status(403).json({ error: "Orçamento não pertence ao seu condomínio" });
    }
    // ⚠️ Só responde o que está ENVIADO. Isto cobre dois casos de uma vez: o
    // rascunho (que o cliente nem deveria ver) e o já respondido — se ele já
    // aprovou, um segundo clique não pode virar recusa, nem o contrário.
    if (orc.status !== "enviado") {
      return res.status(409).json({
        error: orc.status === "rascunho"
          ? "Este orçamento ainda não foi enviado."
          : "Este orçamento já foi respondido.",
      });
    }

    const novoStatus = decisao === "aprovar" ? "aprovado" : "rejeitado";
    const upd = await pool.query(
      // ⚠️ `$2::varchar` NOS QUATRO USOS, E ISSO NÃO É ENFEITE (25/08/2026).
      //
      // Sem o cast o Postgres recusa a query inteira no PARSE, antes de olhar
      // qualquer valor: `SET status = $2` deduz `character varying` (o tipo da
      // coluna) e `CASE WHEN $2 = 'aprovado'` deduz `text` (o tipo do
      // literal). Dois tipos para o mesmo parâmetro = 42P08, "inconsistent
      // types deduced for parameter $2".
      //
      // ⚠️ ESTA ROTA NUNCA FUNCIONOU EM PRODUÇÃO. O defeito nasceu com ela e
      // ficou invisível porque o erro só aparece quando alguém responde de
      // verdade — e o front mostrava "Erro ao registrar a resposta", que soa
      // como falha passageira. Quando fomos conferir, produção tinha ZERO
      // orçamentos respondidos: lido na hora como "ninguém respondeu ainda",
      // era na verdade "ninguém conseguiu".
      //
      // A lição, que vale para toda query com parâmetro repetido: o mesmo `$n`
      // usado como valor de coluna E dentro de comparação precisa de cast
      // explícito. `node --check` não pega, teste de UPDATE direto no banco não
      // pega — só exercitando a rota.
      `UPDATE orcamentos
          SET status             = $2::varchar,
              respondido_em      = now(),
              respondido_por     = $3,
              cliente_comentario = NULLIF($4, ''),
              respondido_nome    = $5,
              respondido_cargo   = $6,
              -- resposta_vista_em e resposta_tratada_em voltam a NULO de
              -- proposito: e o que faz a resposta virar pendencia no painel do
              -- escritorio. A vista some quando alguem de la abre a ficha
              -- (076); a baixa so sai com acao explicita (078). Reaprovar um
              -- orcamento ja tratado e trabalho NOVO, e precisa gritar de novo.
              resposta_vista_em    = NULL,
              resposta_tratada_em  = NULL,
              resposta_tratada_por = NULL,
              aprovado_em        = CASE WHEN $2::varchar = 'aprovado' THEN now() ELSE aprovado_em END,
              aprovado_por       = CASE WHEN $2::varchar = 'aprovado' THEN $3 ELSE aprovado_por END,
              motivo_rejeicao    = CASE WHEN $2::varchar = 'rejeitado' THEN NULLIF($4, '') ELSE motivo_rejeicao END
        WHERE id = $1
        RETURNING id, status, respondido_em, cliente_comentario, respondido_nome, respondido_cargo`,
      [id, novoStatus, req.user.id, comentario, nome, cargo]
    );

    console.log(
      `[cliente] orcamento=${id} decisao=${novoStatus} usuario=${req.user.id} ` +
      `quem="${nome} (${cargo})"`
    );

    // ⚠️ O AVISO NÃO PODE DERRUBAR A RESPOSTA.
    // A decisão do cliente já está gravada neste ponto. Se o Resend estiver
    // fora do ar, com cota estourada ou o domínio não verificado, o
    // `sendOrcamentoRespondido` lança — e sem este catch o síndico veria "erro
    // ao registrar a resposta" para algo que JÁ foi registrado, e clicaria de
    // novo, e tomaria "este orçamento já foi respondido". O e-mail é aviso; a
    // fonte da verdade é o banco, e o painel mostra o não-visto de qualquer
    // jeito.
    try {
      const info = await pool.query(
        `SELECT o.numero, COALESCE(c.nome_fantasia, c.nome, o.cliente_nome) AS condominio_nome
           FROM orcamentos o LEFT JOIN condominios c ON c.id = o.condominio_id
          WHERE o.id = $1`,
        [id]
      );
      await sendOrcamentoRespondido({
        id,
        numero: info.rows[0]?.numero,
        condominioNome: info.rows[0]?.condominio_nome,
        status: novoStatus,
        nome,
        cargo,
        comentario,
        respondidoEm: upd.rows[0]?.respondido_em,
        linkAdmin: `${_baseUrlPublica(req)}/admin/painel?orcamento=${id}`,
      });
    } catch (errAviso) {
      console.error(
        `[cliente] AVISO-FALHOU orcamento=${id} motivo=${errAviso.message}`
      );
    }

    return res.json(upd.rows[0]);
  } catch (e) {
    console.error("[cliente] POST /orcamentos/:id/responder:", e);
    return res.status(500).json({ error: "Erro ao registrar a resposta" });
  }
});

// GET /cliente/orcamentos/:id/pdf — o documento completo, gerado sob demanda.
// ⚠️ Desde 25/08/2026 este é o ÚNICO lugar de onde o PDF sai para o cliente:
// o e-mail de orçamento leva o link desta tela em vez do anexo. Ver
// sendOrcamentoCliente em src/services/email.js.
router.get("/orcamentos/:id/pdf", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `SELECT id, numero, status, condominio_id FROM orcamentos WHERE id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
    const orc = r.rows[0];
    if (Number(orc.condominio_id) !== condominioId) {
      return res.status(403).json({ error: "Orçamento não pertence ao seu condomínio" });
    }
    if (!_ORC_VISIVEIS_AO_CLIENTE.includes(orc.status)) {
      return res.status(404).json({ error: "Orçamento não encontrado" });
    }

    const { fpath } = await gerarPdfAvulso(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="orcamento-${orc.numero || id}.pdf"`);
    return res.sendFile(fpath);
  } catch (e) {
    console.error("[cliente] GET /orcamentos/:id/pdf:", e);
    return res.status(500).json({ error: "Erro ao gerar o PDF do orçamento" });
  }
});

module.exports = { clienteRouter: router };
