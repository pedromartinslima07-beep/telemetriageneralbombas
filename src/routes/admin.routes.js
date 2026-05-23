// src/routes/admin.routes.js
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

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

  const horas = Math.min(Math.max(Number(horasStr) || 24, 1), 720);

  // bucket conforme janela
  let bucketSec;
  if (horas <= 6)        bucketSec = 300;    // 5 min
  else if (horas <= 48)  bucketSec = 1800;   // 30 min
  else if (horas <= 168) bucketSec = 3600;   // 1 hora
  else                   bucketSec = 14400;  // 4 horas

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

module.exports = { adminRouter: router };