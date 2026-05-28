// src/routes/admin.routes.js
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const path = require("path");
const { pool } = require("../db");
const { gerarPdfAvulso } = require("../services/orcamento-pdf.service");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { OFFLINE_MINUTES } = require("../config");
const { getAllConfigs, setConfig, CHAVES } = require("../services/config.service");
const { checarStatusConexao } = require("../services/evolution.service");
const { SYSTEM_PROMPT_PADRAO } = require("../services/ia.service");
const { getOfflineJobStatus } = require("../jobs/offline.job");
const { getGpsCleanupStatus } = require("../jobs/gps-cleanup.job");
const { getLeiturasCleanupStatus, jobLimparLeituras } = require("../jobs/leituras-cleanup.job");
const { getAlertasCleanupStatus, jobLimparAlertas } = require("../jobs/alertas-cleanup.job");
const { getConversasCleanupStatus, jobLimparConversas } = require("../jobs/conversas-cleanup.job");
const { getChamadosAtrasoStatus, jobVerificarChamadosAtraso } = require("../jobs/chamados-atraso.job");

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
        c.endereco AS condominio_endereco,
        c.bairro   AS condominio_bairro,
        c.cidade   AS condominio_cidade,
        c.uf       AS condominio_uf,
        c.cep      AS condominio_cep,
        c.lat      AS condominio_lat,
        c.lng      AS condominio_lng,

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
          condominio: {
            id: row.condominio_id,
            nome: row.condominio_nome,
            endereco: row.condominio_endereco,
            bairro: row.condominio_bairro,
            cidade: row.condominio_cidade,
            uf: row.condominio_uf,
            cep: row.condominio_cep,
            lat: row.condominio_lat != null ? Number(row.condominio_lat) : null,
            lng: row.condominio_lng != null ? Number(row.condominio_lng) : null,
          },
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

  const horas = Math.min(Math.max(Number(horasStr) || 24, 1), 1440);

  // bucket conforme janela
  let bucketSec;
  if (horas <= 6)        bucketSec = 300;    // 5 min
  else if (horas <= 48)  bucketSec = 1800;   // 30 min
  else if (horas <= 168) bucketSec = 3600;   // 1 hora
  else if (horas <= 720) bucketSec = 14400;  // 4 horas
  else                   bucketSec = 86400;  // 1 dia (60d)

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
  // Aceita query livre (q=...) ou structured search (street/city/state/postalcode)
  const { q, street, city, state, postalcode } = req.query;

  const trim = (v) => (v ? String(v).trim() : "");
  const sStreet     = trim(street);
  const sCity       = trim(city);
  const sState      = trim(state);
  const sPostalcode = trim(postalcode).replace(/\D/g, "");
  const sQ          = trim(q);

  const isStructured = Boolean(sStreet || sCity || sState || sPostalcode);

  if (!isStructured && sQ.length < 3) {
    return res.status(400).json({ error: "Forneça 'q' (>=3 chars) ou parâmetros structured (street/city/state/postalcode)" });
  }

  await _geocodeAguardarVez();

  try {
    const params = {
      format: "json",
      addressdetails: "1",
      limit: "5",
      countrycodes: "br",
    };

    if (isStructured) {
      if (sStreet)     params.street     = sStreet;
      if (sCity)       params.city       = sCity;
      if (sState)      params.state      = sState;
      if (sPostalcode) params.postalcode = sPostalcode;
    } else {
      params.q = sQ;
    }

    const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams(params);

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
      query: isStructured ? { street: sStreet, city: sCity, state: sState, postalcode: sPostalcode } : sQ,
      results: (Array.isArray(data) ? data : []).map((r) => ({
        display_name: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
        type: r.type,
        importance: r.importance,
        address: r.address || {},
      })),
    });
  } catch (err) {
    console.error("Erro geocode:", err);
    return res.status(500).json({ error: "Erro ao consultar geocoding" });
  }
});

// ----------------------------------------------------------------------------
// GET /admin/reverse-geocode?lat=X&lon=Y
// Reverse geocoding via Nominatim — usado quando o usuário arrasta o pino no
// mini-mapa, pra preencher de volta os campos endereço/bairro/cidade/UF/CEP.
// Mesma fila de rate-limit do /geocode (1 req/s).
// ----------------------------------------------------------------------------
router.get("/reverse-geocode", authRequired, adminOnly, async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "Parâmetros 'lat' e 'lon' obrigatórios e válidos" });
  }

  await _geocodeAguardarVez();

  try {
    const url = "https://nominatim.openstreetmap.org/reverse?" + new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "json",
      addressdetails: "1",
      zoom: "18", // detalhe nível rua/casa
    });

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "TelemetriaGeneralBombas/1.0 (admin reverse-geocoding)",
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!resp.ok) {
      console.warn("[reverse-geocode] Nominatim respondeu", resp.status);
      return res.status(502).json({ error: "Reverse geocoding indisponível (status " + resp.status + ")" });
    }

    const data = await resp.json();
    if (data?.error) {
      return res.json({ display_name: "", address: {} });
    }
    return res.json({
      display_name: data.display_name || "",
      address: data.address || {},
    });
  } catch (err) {
    console.error("Erro reverse-geocode:", err);
    return res.status(500).json({ error: "Erro ao consultar reverse geocoding" });
  }
});

// GET /admin/usuarios?role=cliente
router.get("/usuarios", authRequired, adminOnly, async (req, res) => {
  const role = req.query.role || null;
  try {
    const result = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role, u.criado_em,
              c.id AS condominio_id, c.nome AS condominio_nome, c.cidade AS condominio_cidade
       FROM usuarios u
       LEFT JOIN condominios c ON c.id = u.condominio_id
       WHERE ($1::text IS NULL OR u.role = $1)
       ORDER BY u.criado_em DESC
       LIMIT 500`,
      [role]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[admin] GET /usuarios:", err);
    return res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

// POST /admin/usuarios — cria novo usuário
router.post("/usuarios", authRequired, masterAdminOnly, async (req, res) => {
  const bcrypt = require("bcrypt");
  const { nome, email, senha, role, condominio_id } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ error: "nome, email e senha obrigatórios" });
  const ROLES = ["cliente", "admin", "admin_viewer", "tecnico"];
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: "role inválido" });
  try {
    const hash = await bcrypt.hash(String(senha), 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, condominio_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, role, criado_em`,
      [nome, email.toLowerCase(), hash, role || "cliente", condominio_id || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email já cadastrado" });
    console.error("[admin] POST /usuarios:", err);
    return res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// PATCH /admin/usuarios/:id — atualiza nome, email, role (master admin)
router.patch("/usuarios/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { nome, email, role, condominio_id } = req.body || {};
  const ROLES = ["cliente", "admin", "admin_viewer", "tecnico"];
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: "role inválido" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "email inválido" });

  const sets = [];
  const vals = [];
  if (nome !== undefined)          { vals.push(nome);                       sets.push(`nome = $${vals.length}`); }
  if (email !== undefined)         { vals.push(String(email).toLowerCase()); sets.push(`email = $${vals.length}`); }
  if (role !== undefined)          { vals.push(role);                       sets.push(`role = $${vals.length}`); }
  if (condominio_id !== undefined) { vals.push(condominio_id || null);      sets.push(`condominio_id = $${vals.length}`); }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });
  vals.push(id);

  try {
    const result = await pool.query(
      `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${vals.length}
       RETURNING id, nome, email, role, condominio_id`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: "Não encontrado" });
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email já cadastrado" });
    console.error("[admin] PATCH /usuarios/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar" });
  }
});

// DELETE /admin/usuarios/:id — remove usuário (master admin, não pode deletar a si mesmo)
router.delete("/usuarios/:id", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  if (id === req.user.id) return res.status(400).json({ error: "Você não pode remover a si mesmo" });
  try {
    const r = await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] DELETE /usuarios/:id:", err);
    return res.status(500).json({ error: "Erro ao remover usuário" });
  }
});

// POST /admin/usuarios/:id/reset-senha — gera senha temporária aleatória (master admin)
// Retorna a senha gerada em texto puro UMA vez — admin deve compartilhar com o usuário.
router.post("/usuarios/:id/reset-senha", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    // Gera senha de 12 caracteres alfanuméricos
    const senha = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
    const hash = await bcrypt.hash(senha, 10);
    const r = await pool.query(
      "UPDATE usuarios SET senha_hash = $1 WHERE id = $2 RETURNING id, nome, email",
      [hash, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Não encontrado" });
    // Revoga dispositivos confiáveis do usuário pra forçar 2FA na próxima sessão
    await pool.query("DELETE FROM trusted_devices WHERE usuario_id = $1", [id]);
    return res.json({ ok: true, usuario: r.rows[0], senha_temporaria: senha });
  } catch (err) {
    console.error("[admin] POST /usuarios/:id/reset-senha:", err);
    return res.status(500).json({ error: "Erro ao resetar senha" });
  }
});

// GET /admin/configuracoes — lê todas as chaves whitelistadas + metadata
router.get("/configuracoes", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const valores = await getAllConfigs();
    return res.json({
      valores,
      definicoes: CHAVES,
      padroes: { "ia.system_prompt": SYSTEM_PROMPT_PADRAO },
    });
  } catch (err) {
    console.error("[admin] GET /configuracoes:", err);
    return res.status(500).json({ error: "Erro ao ler configurações" });
  }
});

// PATCH /admin/configuracoes — atualiza um conjunto de chaves
// Body: { chave1: valor1, chave2: valor2, ... }
router.patch("/configuracoes", authRequired, masterAdminOnly, async (req, res) => {
  const updates = req.body || {};
  const entradas = Object.entries(updates);
  if (!entradas.length) return res.status(400).json({ error: "Nenhuma configuração informada" });

  try {
    for (const [chave, valor] of entradas) {
      await setConfig(chave, String(valor), req.user.id);
    }
    const valores = await getAllConfigs();
    return res.json({ ok: true, valores });
  } catch (err) {
    console.error("[admin] PATCH /configuracoes:", err);
    return res.status(400).json({ error: err.message || "Erro ao atualizar configurações" });
  }
});

// GET /admin/integracoes/status — status das 4 integrações externas
router.get("/integracoes/status", authRequired, masterAdminOnly, async (req, res) => {
  const out = {};

  // 1. Postgres — se chegou aqui, já está conectado. Mede latência simples.
  try {
    const t0 = Date.now();
    await pool.query("SELECT 1");
    out.postgres = { ok: true, latencia_ms: Date.now() - t0 };
  } catch (err) {
    out.postgres = { ok: false, mensagem: err.message };
  }

  // 2. WhatsApp Evolution — checa estado da instância
  out.whatsapp = await checarStatusConexao();

  // 3. OpenAI — só checa se a key está setada (chamada real custa $, não vale o ping)
  out.openai = {
    ok: !!process.env.OPENAI_API_KEY,
    configurado: !!process.env.OPENAI_API_KEY,
    mensagem: process.env.OPENAI_API_KEY ? "API key configurada" : "OPENAI_API_KEY ausente",
  };

  // 4. Resend (email) — só checa se a key está setada
  out.resend = {
    ok: !!process.env.RESEND_API_KEY,
    configurado: !!process.env.RESEND_API_KEY,
    mensagem: process.env.RESEND_API_KEY ? "API key configurada" : "RESEND_API_KEY ausente",
  };

  // 5. Job offline — última execução + último resultado
  out.job_offline = getOfflineJobStatus();
  out.job_gps_cleanup = getGpsCleanupStatus();
  out.job_leituras_cleanup = getLeiturasCleanupStatus();
  out.job_alertas_cleanup = getAlertasCleanupStatus();
  out.job_conversas_cleanup = getConversasCleanupStatus();
  out.job_chamados_atraso = getChamadosAtrasoStatus();

  return res.json(out);
});

// POST /admin/jobs/chamados-atraso/run — dispara verificação de chamados
// atrasados imediatamente (em vez de esperar o ciclo de 15 min). Útil pra
// testar configuração e ver se o email chega.
router.post("/jobs/chamados-atraso/run", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const resultado = await jobVerificarChamadosAtraso();
    return res.json(resultado);
  } catch (err) {
    console.error("[admin] /jobs/chamados-atraso/run:", err);
    return res.status(500).json({ error: "Erro ao executar verificação", detalhe: err.message });
  }
});

// POST /admin/jobs/leituras-cleanup/run — dispara a limpeza de leituras
// na hora, em vez de esperar o ciclo de 24h. Respeita o dry-run da config
// (se "leituras.cleanup_dry_run" = "true", só conta sem apagar). Útil pra
// confirmar volume antes de soltar o DELETE em produção.
router.post("/jobs/leituras-cleanup/run", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const resultado = await jobLimparLeituras();
    return res.json(resultado);
  } catch (err) {
    console.error("[admin] /jobs/leituras-cleanup/run:", err);
    return res.status(500).json({ error: "Erro ao executar limpeza", detalhe: err.message });
  }
});

// POST /admin/jobs/alertas-cleanup/run — Fase 9E. Mesmo padrão do leituras.
router.post("/jobs/alertas-cleanup/run", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const resultado = await jobLimparAlertas();
    return res.json(resultado);
  } catch (err) {
    console.error("[admin] /jobs/alertas-cleanup/run:", err);
    return res.status(500).json({ error: "Erro ao executar limpeza", detalhe: err.message });
  }
});

// POST /admin/jobs/conversas-cleanup/run — Fase 9E. Mesmo padrão.
router.post("/jobs/conversas-cleanup/run", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const resultado = await jobLimparConversas();
    return res.json(resultado);
  } catch (err) {
    console.error("[admin] /jobs/conversas-cleanup/run:", err);
    return res.status(500).json({ error: "Erro ao executar limpeza", detalhe: err.message });
  }
});

// ── Fase 8B: SLA configurável ─────────────────────────────────────────────

const PRIORIDADES_ORDEM = ["p1", "p2", "p3", "p4"];

// GET /admin/sla — retorna definições de SLA por prioridade (master admin)
router.get("/sla", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT prioridade, ttfr_min, ttr_min, atualizado_em
       FROM sla_definicoes
       ORDER BY CASE prioridade
         WHEN 'p1' THEN 0 WHEN 'p2' THEN 1
         WHEN 'p3' THEN 2 WHEN 'p4' THEN 3 ELSE 4 END`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /sla:", err);
    return res.status(500).json({ error: "Erro ao buscar SLA" });
  }
});

// PATCH /admin/sla/:prioridade — atualiza TTFR e/ou TTR de uma prioridade
// Body: { ttfr_min?: number, ttr_min?: number }
router.patch("/sla/:prioridade", authRequired, masterAdminOnly, async (req, res) => {
  const { prioridade } = req.params;
  if (!PRIORIDADES_ORDEM.includes(prioridade)) {
    return res.status(400).json({ error: "Prioridade inválida" });
  }

  const { ttfr_min, ttr_min } = req.body || {};
  const ttfr = ttfr_min != null ? Number(ttfr_min) : null;
  const ttr  = ttr_min  != null ? Number(ttr_min)  : null;

  if (ttfr !== null && (!Number.isInteger(ttfr) || ttfr <= 0)) {
    return res.status(400).json({ error: "ttfr_min deve ser inteiro positivo" });
  }
  if (ttr !== null && (!Number.isInteger(ttr) || ttr <= 0)) {
    return res.status(400).json({ error: "ttr_min deve ser inteiro positivo" });
  }
  if (ttfr !== null && ttr !== null && ttfr >= ttr) {
    return res.status(400).json({ error: "ttfr_min deve ser menor que ttr_min" });
  }
  if (ttfr === null && ttr === null) {
    return res.status(400).json({ error: "Informe ao menos ttfr_min ou ttr_min" });
  }

  try {
    const sets = ["atualizado_em = NOW()", `atualizado_por = (SELECT id FROM usuarios WHERE id = ${req.user.id} LIMIT 1)`];
    const vals = [prioridade];
    if (ttfr !== null) { vals.push(ttfr); sets.push(`ttfr_min = $${vals.length}`); }
    if (ttr  !== null) { vals.push(ttr);  sets.push(`ttr_min  = $${vals.length}`); }

    const r = await pool.query(
      `UPDATE sla_definicoes SET ${sets.join(", ")}
       WHERE prioridade = $1
       RETURNING prioridade, ttfr_min, ttr_min, atualizado_em`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Prioridade não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[admin] PATCH /sla/:prioridade:", err);
    return res.status(500).json({ error: "Erro ao salvar SLA" });
  }
});

// ============================================================
// ORÇAMENTOS (Migration 029: unificados na tabela `orcamentos`)
// ============================================================
//
// Modelo:
// - ordens_servico.orcamento_necessario (boolean) e .orcamento_observacoes (texto)
//   são input do TÉCNICO no app — sinalização "preciso de orçamento" + observação.
// - Orçamento formal vive em `orcamentos` (FK opcional `os_id` aponta para a OS
//   que originou). Itens em `orcamento_linhas`.
//
// As rotas /admin/orcamentos/* (sem "avulsos") mantém o contrato antigo com
// :os_id na URL para o frontend continuar funcionando, mas operam no novo schema.

// Status mapping: o sistema antigo usava "pendente" — agora é "rascunho".
// Aceita o valor antigo no query string por compat, mapeando ao novo.
function _orcStatusIn(status) {
  if (status === "pendente") return "rascunho";
  return status;
}

// Garante que existe um registro em `orcamentos` para a OS (cria se não tiver).
// Retorna { id, criado } do orçamento.
async function _garantirOrcamentoDaOs(osId, userId) {
  const existente = await pool.query(
    "SELECT id FROM orcamentos WHERE os_id = $1 LIMIT 1",
    [osId]
  );
  if (existente.rows.length) return { id: existente.rows[0].id, criado: false };

  const osRow = await pool.query(
    "SELECT id, condominio_id, orcamento_necessario FROM ordens_servico WHERE id = $1",
    [osId]
  );
  if (!osRow.rows.length) throw Object.assign(new Error("O.S. não encontrada"), { status: 404 });
  if (!osRow.rows[0].orcamento_necessario) {
    throw Object.assign(new Error("Esta O.S. não tem orçamento solicitado"), { status: 400 });
  }

  const numSeq = (await pool.query(
    "SELECT 'OR-' || LPAD(nextval('orcamento_numero_seq')::text, 6, '0') AS n"
  )).rows[0].n;

  const ins = await pool.query(
    `INSERT INTO orcamentos (os_id, numero, condominio_id, status, criado_por)
     VALUES ($1, $2, $3, 'rascunho', $4)
     RETURNING id`,
    [osId, numSeq, osRow.rows[0].condominio_id, userId || null]
  );
  return { id: ins.rows[0].id, criado: true };
}

// Helpers de status: rascunho|enviado|aprovado|rejeitado (não há mais "pendente").
const ORC_STATUS_VALIDOS = ["rascunho", "enviado", "aprovado", "rejeitado"];

// GET /admin/orcamentos?status=&condominio_id=&data_ini=&data_fim=
// Lista APENAS orçamentos originados de OS (orcamentos.os_id IS NOT NULL).
router.get("/orcamentos", authRequired, adminOnly, async (req, res) => {
  const { status: rawStatus, condominio_id, data_ini, data_fim } = req.query;
  const status = _orcStatusIn(rawStatus);

  const where = ["o.os_id IS NOT NULL", "os.orcamento_necessario = TRUE"];
  const vals  = [];

  if (status && ORC_STATUS_VALIDOS.includes(status)) {
    vals.push(status);
    where.push(`o.status = $${vals.length}`);
  }
  if (condominio_id) {
    vals.push(Number(condominio_id));
    where.push(`os.condominio_id = $${vals.length}`);
  }
  if (data_ini) {
    vals.push(data_ini);
    where.push(`os.finalizada_em >= $${vals.length}::date`);
  }
  if (data_fim) {
    vals.push(data_fim);
    where.push(`os.finalizada_em < ($${vals.length}::date + interval '1 day')`);
  }

  try {
    const r = await pool.query(
      `SELECT
         os.id,
         os.numero,
         os.condominio_id,
         c.nome              AS condominio_nome,
         os.tecnico_id,
         t.nome              AS tecnico_nome,
         os.chamado_id,
         os.finalizada_em,
         os.criado_em,
         os.orcamento_necessario,
         os.orcamento_observacoes,
         o.id                AS orcamento_id,
         o.valor             AS orcamento_valor,
         o.status            AS orcamento_status,
         o.valido_ate        AS orcamento_valido_ate,
         o.aprovado_em       AS orcamento_aprovado_em,
         o.motivo_rejeicao   AS orcamento_motivo_rejeicao,
         o.numero            AS orcamento_numero,
         o.constatacao       AS orcamento_constatacao,
         o.forma_pagamento   AS orcamento_forma_pagamento,
         o.prazo_entrega     AS orcamento_prazo_entrega,
         o.garantia          AS orcamento_garantia,
         o.disponibilidade   AS orcamento_disponibilidade,
         ua.nome             AS aprovado_por_nome,
         os.servico_realizado,
         os.tipos_servico
       FROM ordens_servico os
       JOIN orcamentos o       ON o.os_id = os.id
       LEFT JOIN condominios c ON c.id = os.condominio_id
       LEFT JOIN tecnicos t    ON t.id = os.tecnico_id
       LEFT JOIN usuarios ua   ON ua.id = o.aprovado_por
       WHERE ${where.join(" AND ")}
       ORDER BY
         CASE o.status WHEN 'rascunho' THEN 0 ELSE 1 END,
         os.finalizada_em DESC NULLS LAST
       LIMIT 200`,
      vals
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /orcamentos:", err);
    return res.status(500).json({ error: "Erro ao buscar orçamentos" });
  }
});

// PATCH /admin/orcamentos/:os_id — aprovar, rejeitar ou salvar valor
// (mantém :os_id na URL por compat; resolve internamente para orcamentos.id)
router.patch("/orcamentos/:os_id", authRequired, adminOnly, async (req, res) => {
  const osId = Number(req.params.os_id);
  if (!Number.isInteger(osId) || osId <= 0) {
    return res.status(400).json({ error: "os_id inválido" });
  }

  const {
    acao, valor, valido_ate, motivo_rejeicao,
    numero, constatacao, forma_pagamento, prazo_entrega, garantia, disponibilidade,
  } = req.body || {};

  if (!["aprovar","rejeitar","salvar"].includes(acao)) {
    return res.status(400).json({ error: "acao inválida (aprovar | rejeitar | salvar)" });
  }

  try {
    const { id: orcId } = await _garantirOrcamentoDaOs(osId, req.user.id);

    let sets = [], vals = [orcId];

    if (acao === "aprovar") {
      sets = [
        "status = 'aprovado'",
        "aprovado_em = NOW()",
        `aprovado_por = ${req.user.id}`,
        "motivo_rejeicao = NULL",
      ];
      if (valor != null) {
        const v = Number(valor);
        if (isNaN(v) || v < 0) return res.status(400).json({ error: "valor inválido" });
        vals.push(v); sets.push(`valor = $${vals.length}`);
      }
      if (valido_ate) {
        vals.push(valido_ate); sets.push(`valido_ate = $${vals.length}::date`);
      }
    } else if (acao === "rejeitar") {
      sets = ["status = 'rejeitado'", "aprovado_em = NULL"];
      if (motivo_rejeicao) {
        const m = String(motivo_rejeicao).slice(0, 1000);
        vals.push(m); sets.push(`motivo_rejeicao = $${vals.length}`);
      }
    } else {
      // salvar: apenas valor/validade/campos sem mudar status
      if (valor != null) {
        const v = Number(valor);
        if (isNaN(v) || v < 0) return res.status(400).json({ error: "valor inválido" });
        vals.push(v); sets.push(`valor = $${vals.length}`);
      }
      if (valido_ate !== undefined) {
        vals.push(valido_ate || null);
        sets.push(`valido_ate = $${vals.length}::date`);
      }
    }

    // Campos do orçamento formal (aplicados em qualquer acao)
    if (numero !== undefined) {
      vals.push(String(numero || "").slice(0, 30) || null);
      sets.push(`numero = $${vals.length}`);
    }
    if (constatacao !== undefined) {
      vals.push(String(constatacao || "").slice(0, 1000) || null);
      sets.push(`constatacao = $${vals.length}`);
    }
    if (forma_pagamento !== undefined) {
      vals.push(String(forma_pagamento || "").slice(0, 255) || null);
      sets.push(`forma_pagamento = $${vals.length}`);
    }
    if (prazo_entrega !== undefined) {
      vals.push(String(prazo_entrega || "").slice(0, 100) || null);
      sets.push(`prazo_entrega = $${vals.length}`);
    }
    if (garantia !== undefined) {
      vals.push(String(garantia || "").slice(0, 100) || null);
      sets.push(`garantia = $${vals.length}`);
    }
    if (disponibilidade !== undefined) {
      vals.push(String(disponibilidade || "").slice(0, 100) || null);
      sets.push(`disponibilidade = $${vals.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

    const r = await pool.query(
      `UPDATE orcamentos SET ${sets.join(", ")}
       WHERE id = $1
       RETURNING id              AS orcamento_id,
                 numero          AS orcamento_numero,
                 status          AS orcamento_status,
                 valor           AS orcamento_valor,
                 valido_ate      AS orcamento_valido_ate,
                 aprovado_em     AS orcamento_aprovado_em,
                 motivo_rejeicao AS orcamento_motivo_rejeicao,
                 constatacao     AS orcamento_constatacao,
                 forma_pagamento AS orcamento_forma_pagamento,
                 prazo_entrega   AS orcamento_prazo_entrega,
                 garantia        AS orcamento_garantia,
                 disponibilidade AS orcamento_disponibilidade`,
      vals
    );
    return res.json(r.rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[admin] PATCH /orcamentos/:os_id:", err);
    return res.status(500).json({ error: "Erro ao atualizar orçamento" });
  }
});

// ── Itens do orçamento (mantém :os_id na URL; opera em orcamento_linhas) ──────

// GET /admin/orcamentos/:os_id/itens
router.get("/orcamentos/:os_id/itens", authRequired, adminOnly, async (req, res) => {
  const osId = Number(req.params.os_id);
  if (!Number.isInteger(osId) || osId <= 0) return res.status(400).json({ error: "os_id inválido" });
  try {
    const r = await pool.query(
      `SELECT l.id, l.descricao, l.ficha_tecnica, l.quantidade, l.valor_unitario
       FROM orcamento_linhas l
       JOIN orcamentos o ON o.id = l.orcamento_id
       WHERE o.os_id = $1
       ORDER BY l.id ASC`,
      [osId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /orcamentos/:os_id/itens:", err);
    return res.status(500).json({ error: "Erro ao buscar itens" });
  }
});

// POST /admin/orcamentos/:os_id/itens
router.post("/orcamentos/:os_id/itens", authRequired, adminOnly, async (req, res) => {
  const osId = Number(req.params.os_id);
  if (!Number.isInteger(osId) || osId <= 0) return res.status(400).json({ error: "os_id inválido" });

  const { descricao, ficha_tecnica, quantidade, valor_unitario } = req.body || {};
  if (!descricao || !String(descricao).trim()) return res.status(400).json({ error: "descricao obrigatória" });

  const qtd = Number(quantidade) || 1;
  const vu  = Number(valor_unitario) || 0;
  if (qtd <= 0)  return res.status(400).json({ error: "quantidade inválida" });
  if (vu < 0)    return res.status(400).json({ error: "valor_unitario inválido" });

  try {
    const { id: orcId } = await _garantirOrcamentoDaOs(osId, req.user.id);
    const r = await pool.query(
      `INSERT INTO orcamento_linhas (orcamento_id, descricao, ficha_tecnica, quantidade, valor_unitario)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, descricao, ficha_tecnica, quantidade, valor_unitario`,
      [orcId, String(descricao).trim(), ficha_tecnica ? String(ficha_tecnica).trim() : null, qtd, vu]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[admin] POST /orcamentos/:os_id/itens:", err);
    return res.status(500).json({ error: "Erro ao criar item" });
  }
});

// PATCH /admin/orcamentos/itens/:item_id
router.patch("/orcamentos/itens/:item_id", authRequired, adminOnly, async (req, res) => {
  const itemId = Number(req.params.item_id);
  if (!Number.isInteger(itemId) || itemId <= 0) return res.status(400).json({ error: "item_id inválido" });

  const { descricao, ficha_tecnica, quantidade, valor_unitario } = req.body || {};
  const sets = []; const vals = [itemId];

  if (descricao !== undefined) {
    if (!String(descricao).trim()) return res.status(400).json({ error: "descricao não pode ser vazia" });
    vals.push(String(descricao).trim()); sets.push(`descricao = $${vals.length}`);
  }
  if (ficha_tecnica !== undefined) {
    vals.push(ficha_tecnica ? String(ficha_tecnica).trim() : null);
    sets.push(`ficha_tecnica = $${vals.length}`);
  }
  if (quantidade !== undefined) {
    const q = Number(quantidade);
    if (q <= 0) return res.status(400).json({ error: "quantidade inválida" });
    vals.push(q); sets.push(`quantidade = $${vals.length}`);
  }
  if (valor_unitario !== undefined) {
    const v = Number(valor_unitario);
    if (v < 0) return res.status(400).json({ error: "valor_unitario inválido" });
    vals.push(v); sets.push(`valor_unitario = $${vals.length}`);
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE orcamento_linhas SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, descricao, ficha_tecnica, quantidade, valor_unitario`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Item não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[admin] PATCH /orcamentos/itens/:item_id:", err);
    return res.status(500).json({ error: "Erro ao atualizar item" });
  }
});

// DELETE /admin/orcamentos/itens/:item_id
router.delete("/orcamentos/itens/:item_id", authRequired, adminOnly, async (req, res) => {
  const itemId = Number(req.params.item_id);
  if (!Number.isInteger(itemId) || itemId <= 0) return res.status(400).json({ error: "item_id inválido" });
  try {
    await pool.query("DELETE FROM orcamento_linhas WHERE id = $1", [itemId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] DELETE /orcamentos/itens/:item_id:", err);
    return res.status(500).json({ error: "Erro ao remover item" });
  }
});

// GET /admin/orcamentos/:os_id/pdf — resolve o orcamento.id da OS e gera PDF
router.get("/orcamentos/:os_id/pdf", authRequired, adminOnly, async (req, res) => {
  const osId = Number(req.params.os_id);
  if (!Number.isInteger(osId) || osId <= 0) return res.status(400).json({ error: "os_id inválido" });
  try {
    const { id: orcId } = await _garantirOrcamentoDaOs(osId, req.user.id);
    const { fpath } = await gerarPdfAvulso(orcId);
    const fs = require("fs");
    if (!fs.existsSync(fpath)) return res.status(500).json({ error: "PDF não gerado" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="orcamento-${osId}.pdf"`);
    fs.createReadStream(fpath).pipe(res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[admin] GET /orcamentos/:os_id/pdf:", err);
    return res.status(500).json({ error: err.message || "Erro ao gerar PDF" });
  }
});

// ── Orçamentos avulsos (criados direto no admin) ──────────────────────────────

// GET /admin/orcamentos/avulsos — lista
router.get("/orcamentos/avulsos", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id, o.numero, o.status, o.valido_ate, o.criado_em, o.origem,
              o.os_id, os.numero AS os_numero,
              o.constatacao, o.forma_pagamento, o.prazo_entrega,
              o.garantia, o.disponibilidade,
              c.nome AS condominio_nome, c.id AS condominio_id,
              COALESCE(
                (SELECT SUM(l.quantidade * l.valor_unitario)
                 FROM orcamento_linhas l WHERE l.orcamento_id = o.id), 0
              ) AS valor_total
       FROM orcamentos o
       LEFT JOIN condominios c ON c.id = o.condominio_id
       LEFT JOIN ordens_servico os ON os.id = o.os_id
       ORDER BY o.criado_em DESC
       LIMIT 300`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /orcamentos/avulsos:", err);
    return res.status(500).json({ error: "Erro ao listar orçamentos" });
  }
});

// POST /admin/orcamentos/avulsos — criar novo
router.post("/orcamentos/avulsos", authRequired, adminOnly, async (req, res) => {
  const { condominio_id, numero, os_id, constatacao, forma_pagamento, prazo_entrega, garantia, disponibilidade, valido_ate } = req.body || {};
  try {
    // número sequencial automático: OR-000001, OR-000002…
    const numSeq = (await pool.query(
      "SELECT 'OR-' || LPAD(nextval('orcamento_numero_seq')::text, 6, '0') AS n"
    )).rows[0].n;
    const num = numero ? String(numero).trim().slice(0, 30) : numSeq;
    const r = await pool.query(
      `INSERT INTO orcamentos
         (numero, condominio_id, os_id, constatacao, forma_pagamento, prazo_entrega,
          garantia, disponibilidade, valido_ate, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10)
       RETURNING *`,
      [
        num,
        condominio_id ? Number(condominio_id) : null,
        os_id ? Number(os_id) : null,
        constatacao ? String(constatacao).slice(0, 1000) : null,
        forma_pagamento ? String(forma_pagamento).slice(0, 255) : "Via boleto bancário",
        prazo_entrega ? String(prazo_entrega).slice(0, 100) : "5 dias úteis após aprovação",
        garantia ? String(garantia).slice(0, 100) : "12 meses por defeito de fabricação",
        disponibilidade ? String(disponibilidade).slice(0, 100) : "Total",
        valido_ate || null,
        req.user.id,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos:", err);
    return res.status(500).json({ error: "Erro ao criar orçamento" });
  }
});

// PATCH /admin/orcamentos/avulsos/:id — atualizar
router.patch("/orcamentos/avulsos/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const fields = ["numero","condominio_id","os_id","status","constatacao","forma_pagamento","prazo_entrega","garantia","disponibilidade","valido_ate"];
  const sets = []; const vals = [id];

  for (const f of fields) {
    if (!(f in (req.body || {}))) continue;
    const v = req.body[f];
    if (f === "condominio_id") { vals.push(v ? Number(v) : null); sets.push(`${f} = $${vals.length}`); }
    else if (f === "valido_ate") { vals.push(v || null); sets.push(`valido_ate = $${vals.length}::date`); }
    else if (f === "status") {
      if (!["rascunho","enviado","aprovado","rejeitado"].includes(v)) return res.status(400).json({ error: "status inválido" });
      vals.push(v); sets.push(`status = $${vals.length}`);
    }
    else {
      const max = f === "constatacao" ? 1000 : 255;
      vals.push(v != null ? String(v).slice(0, max) : null);
      sets.push(`${f} = $${vals.length}`);
    }
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE orcamentos SET ${sets.join(",")} WHERE id = $1
       RETURNING id, numero, status, condominio_id, constatacao,
                 forma_pagamento, prazo_entrega, garantia, disponibilidade, valido_ate`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });

    // Recalcula valor_total para retornar junto
    const tot = await pool.query(
      `SELECT COALESCE(SUM(quantidade * valor_unitario),0) AS valor_total
       FROM orcamento_linhas WHERE orcamento_id = $1`, [id]
    );
    return res.json({ ...r.rows[0], valor_total: tot.rows[0].valor_total });
  } catch (err) {
    console.error("[admin] PATCH /orcamentos/avulsos/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar orçamento" });
  }
});

// DELETE /admin/orcamentos/avulsos/:id
router.delete("/orcamentos/avulsos/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    await pool.query("DELETE FROM orcamentos WHERE id = $1", [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] DELETE /orcamentos/avulsos/:id:", err);
    return res.status(500).json({ error: "Erro ao deletar" });
  }
});

// GET /admin/orcamentos/avulsos/:id/linhas
router.get("/orcamentos/avulsos/:id/linhas", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `SELECT id, descricao, ficha_tecnica, quantidade, valor_unitario
       FROM orcamento_linhas WHERE orcamento_id = $1 ORDER BY id ASC`, [id]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /orcamentos/avulsos/:id/linhas:", err);
    return res.status(500).json({ error: "Erro ao buscar linhas" });
  }
});

// POST /admin/orcamentos/avulsos/:id/linhas
router.post("/orcamentos/avulsos/:id/linhas", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  const { descricao, ficha_tecnica, quantidade, valor_unitario } = req.body || {};
  if (!descricao || !String(descricao).trim()) return res.status(400).json({ error: "descricao obrigatória" });
  const qtd = Math.max(1, Number(quantidade) || 1);
  const vu  = Math.max(0, Number(valor_unitario) || 0);
  try {
    const r = await pool.query(
      `INSERT INTO orcamento_linhas (orcamento_id, descricao, ficha_tecnica, quantidade, valor_unitario)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, descricao, ficha_tecnica, quantidade, valor_unitario`,
      [id, String(descricao).trim(), ficha_tecnica ? String(ficha_tecnica).trim() : null, qtd, vu]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos/:id/linhas:", err);
    return res.status(500).json({ error: "Erro ao criar linha" });
  }
});

// DELETE /admin/orcamentos/avulsos/linhas/:linha_id
router.delete("/orcamentos/avulsos/linhas/:linha_id", authRequired, adminOnly, async (req, res) => {
  const linhaId = Number(req.params.linha_id);
  if (!Number.isInteger(linhaId) || linhaId <= 0) return res.status(400).json({ error: "linha_id inválido" });
  try {
    await pool.query("DELETE FROM orcamento_linhas WHERE id = $1", [linhaId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] DELETE /orcamentos/avulsos/linhas/:linha_id:", err);
    return res.status(500).json({ error: "Erro ao remover linha" });
  }
});

// GET /admin/orcamentos/avulsos/:id/pdf
router.get("/orcamentos/avulsos/:id/pdf", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const { fpath } = await gerarPdfAvulso(id);
    const fs = require("fs");
    if (!fs.existsSync(fpath)) return res.status(500).json({ error: "PDF não gerado" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="orcamento-${id}.pdf"`);
    fs.createReadStream(fpath).pipe(res);
  } catch (err) {
    console.error("[admin] GET /orcamentos/avulsos/:id/pdf:", err);
    return res.status(500).json({ error: err.message || "Erro ao gerar PDF" });
  }
});

// GET /admin/condominios/:id/historico — OS + orçamentos do condomínio
router.get("/condominios/:id/historico", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const [osRes, orcRes] = await Promise.all([
      pool.query(
        `SELECT os.id, os.numero, os.criado_em, os.finalizada_em,
                os.servico_realizado, os.tipos_servico,
                t.nome AS tecnico_nome,
                os.orcamento_necessario,
                orc.status  AS orcamento_status,
                orc.valor   AS orcamento_valor,
                orc.numero  AS orcamento_numero
         FROM ordens_servico os
         LEFT JOIN tecnicos t   ON t.id = os.tecnico_id
         LEFT JOIN orcamentos orc ON orc.os_id = os.id
         WHERE os.condominio_id = $1
         ORDER BY os.criado_em DESC
         LIMIT 200`,
        [id]
      ),
      pool.query(
        `SELECT o.id, o.numero, o.status, o.criado_em, o.valido_ate, o.os_id,
                os.numero AS os_numero,
                COALESCE(
                  (SELECT SUM(l.quantidade * l.valor_unitario)
                   FROM orcamento_linhas l WHERE l.orcamento_id = o.id), 0
                ) AS valor_total
         FROM orcamentos o
         LEFT JOIN ordens_servico os ON os.id = o.os_id
         WHERE o.condominio_id = $1
         ORDER BY o.criado_em DESC
         LIMIT 200`,
        [id]
      ),
    ]);
    return res.json({ os: osRes.rows, orcamentos: orcRes.rows });
  } catch (err) {
    console.error("[admin] GET /condominios/:id/historico:", err);
    return res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});

// GET /admin/condominios/lista — lista simples para selects
router.get("/condominios/lista", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nome FROM condominios WHERE ativo = true ORDER BY nome ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao listar condomínios" });
  }
});

// ─── Contatos WhatsApp ────────────────────────────────────────────────────────
// Pré-cadastro de telefones conhecidos. Quando uma mensagem chega de um número
// cadastrado, a IA já entra no contexto sabendo quem é (nome + tipo + condomínio).
// O webhook continua criando registros automaticamente pra números desconhecidos,
// só que com tipo='desconhecido' até o admin promover.

const TIPOS_CONTATO = ["gestao_condominio", "pessoa_fisica", "desconhecido"];

// Normaliza telefone pro formato usado pela Evolution (DDI+DDD+numero, só dígitos).
// Aceita entrada com máscara/espaços/+ e remove tudo. 55 default se vier sem DDI.
function _normalizarTelefone(raw) {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length < 10) return null;            // muito curto pra ser BR
  return digits.startsWith("55") ? digits : "55" + digits;
}

// GET /admin/whatsapp/contatos?condominio_id=&tipo=&q=
router.get("/whatsapp/contatos", authRequired, adminOnly, async (req, res) => {
  const { condominio_id, tipo, q } = req.query;
  const where = []; const vals = [];

  if (condominio_id) {
    vals.push(Number(condominio_id));
    where.push(`cw.condominio_id = $${vals.length}`);
  }
  if (tipo && TIPOS_CONTATO.includes(tipo)) {
    vals.push(tipo);
    where.push(`cw.tipo = $${vals.length}`);
  }
  if (q) {
    vals.push(`%${String(q).toLowerCase()}%`);
    where.push(`(LOWER(cw.nome) LIKE $${vals.length} OR cw.telefone LIKE $${vals.length})`);
  }

  try {
    const r = await pool.query(
      `SELECT cw.id, cw.telefone, cw.nome, cw.condominio_id, cw.tipo,
              cw.observacoes, cw.cadastrado_por, cw.criado_em,
              c.nome AS condominio_nome,
              u.nome AS cadastrado_por_nome,
              (SELECT MAX(criado_em) FROM conversas_whatsapp WHERE cliente_whatsapp_id = cw.id) AS ultima_conversa_em,
              (SELECT COUNT(*)       FROM conversas_whatsapp WHERE cliente_whatsapp_id = cw.id) AS total_conversas
         FROM clientes_whatsapp cw
         LEFT JOIN condominios c ON c.id = cw.condominio_id
         LEFT JOIN usuarios    u ON u.id = cw.cadastrado_por
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY cw.criado_em DESC
        LIMIT 300`,
      vals
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /whatsapp/contatos:", err);
    return res.status(500).json({ error: "Erro ao listar contatos" });
  }
});

// POST /admin/whatsapp/contatos — cadastra ou atualiza (UPSERT por telefone)
router.post("/whatsapp/contatos", authRequired, adminOnly, async (req, res) => {
  const { telefone, nome, condominio_id, tipo, observacoes } = req.body || {};

  const tel = _normalizarTelefone(telefone);
  if (!tel) return res.status(400).json({ error: "Telefone inválido" });

  const tipoFinal = TIPOS_CONTATO.includes(tipo) ? tipo : "desconhecido";
  if (tipoFinal === "gestao_condominio" && !condominio_id) {
    return res.status(400).json({ error: "Condomínio é obrigatório para gestão de condomínio" });
  }

  try {
    const r = await pool.query(
      `INSERT INTO clientes_whatsapp (telefone, nome, condominio_id, tipo, observacoes, cadastrado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (telefone) DO UPDATE
         SET nome           = COALESCE(EXCLUDED.nome, clientes_whatsapp.nome),
             condominio_id  = EXCLUDED.condominio_id,
             tipo           = EXCLUDED.tipo,
             observacoes    = EXCLUDED.observacoes,
             cadastrado_por = EXCLUDED.cadastrado_por
       RETURNING id, telefone, nome, condominio_id, tipo, observacoes, criado_em`,
      [
        tel,
        nome ? String(nome).trim().slice(0, 120) : null,
        condominio_id ? Number(condominio_id) : null,
        tipoFinal,
        observacoes ? String(observacoes).slice(0, 1000) : null,
        req.user.id,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[admin] POST /whatsapp/contatos:", err);
    return res.status(500).json({ error: "Erro ao salvar contato" });
  }
});

// PATCH /admin/whatsapp/contatos/:id
router.patch("/whatsapp/contatos/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const body = req.body || {};
  const sets = []; const vals = [id];

  if ("nome" in body) {
    vals.push(body.nome ? String(body.nome).trim().slice(0, 120) : null);
    sets.push(`nome = $${vals.length}`);
  }
  if ("condominio_id" in body) {
    vals.push(body.condominio_id ? Number(body.condominio_id) : null);
    sets.push(`condominio_id = $${vals.length}`);
  }
  if ("tipo" in body) {
    if (!TIPOS_CONTATO.includes(body.tipo)) return res.status(400).json({ error: "tipo inválido" });
    vals.push(body.tipo);
    sets.push(`tipo = $${vals.length}`);
  }
  if ("observacoes" in body) {
    vals.push(body.observacoes ? String(body.observacoes).slice(0, 1000) : null);
    sets.push(`observacoes = $${vals.length}`);
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE clientes_whatsapp SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, telefone, nome, condominio_id, tipo, observacoes`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Contato não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[admin] PATCH /whatsapp/contatos/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar contato" });
  }
});

// DELETE /admin/whatsapp/contatos/:id — desvincula (não apaga, pra preservar
// histórico de conversas que tem FK CASCADE). Volta a ser 'desconhecido'.
router.delete("/whatsapp/contatos/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `UPDATE clientes_whatsapp
          SET nome = NULL, condominio_id = NULL, tipo = 'desconhecido',
              observacoes = NULL, cadastrado_por = NULL
        WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Contato não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] DELETE /whatsapp/contatos/:id:", err);
    return res.status(500).json({ error: "Erro ao remover contato" });
  }
});

module.exports = { adminRouter: router };