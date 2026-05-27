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
const { salvarFotoMensagemChamado } = require("../services/chamado-mensagens.service");
const { registrarCriacao } = require("../services/chamado-historico.service");

const router = express.Router();

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
         ch.ordem_servico_id,
         t.nome AS tecnico_nome,
         os.finalizada_em AS os_finalizada_em
       FROM chamados ch
       LEFT JOIN tecnicos t          ON t.id = ch.tecnico_id
       LEFT JOIN ordens_servico os   ON os.id = ch.ordem_servico_id
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
         ch.ordem_servico_id,
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
       LEFT JOIN ordens_servico os ON os.id = ch.ordem_servico_id
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

module.exports = { clienteRouter: router };