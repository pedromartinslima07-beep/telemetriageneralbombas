// src/routes/admin.routes.js
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const path = require("path");
const { pool } = require("../db");
const { gerarPdfAvulso } = require("../services/orcamento-pdf.service");
const { sendOrcamentoCliente } = require("../services/email");
const { refletirStatusOrcamento } = require("../services/equipamento-bancada.service");

const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { gestaoOnly } = require("../middleware/gestaoOnly");
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

const router = express.Router();

// Liga/desliga o convite "Ver o orçamento e responder" no e-mail de orçamento.
//
// ⚠️ LIGADO POR PADRÃO desde 25/08/2026 — a variável virou kill-switch, não
// interruptor de estreia. Enquanto a tela do cliente não tinha sido vista com
// alguém logado, o padrão era desligado; validada a tela, o caminho normal
// passou a ser o painel. `ORCAMENTO_LINK_PAINEL=0` volta o e-mail ao formato
// antigo (PDF anexado, sem link) sem deploy.
//
// Lido a cada envio, e não uma vez na carga do módulo, para que mudar a
// variável no Railway não exija reiniciar o processo.
function _linkPainelLigado() {
  const v = String(process.env.ORCAMENTO_LINK_PAINEL ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "nao" || v === "não");
}

// Origem pública do sistema, para montar link absoluto em e-mail.
// APP_URL manda (é a que o contrato/D4Sign já usa), PUBLIC_BASE_URL vem
// depois, e o último recurso é o próprio request — o app roda com
// `trust proxy`, então protocolo e host chegam corretos atrás do Railway.
// Antes isto exigia APP_URL configurada: sem ela o e-mail saía sem link
// nenhum, silenciosamente. Derivar do request é o que garante que o link
// exista mesmo com o ambiente pela metade.
function _baseUrlPublica(req) {
  const env = process.env.APP_URL || process.env.PUBLIC_BASE_URL;
  if (env) return String(env).replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

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
        r.limiar_bomba AS reservatorio_limiar_bomba,
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
        limiar_bomba: row.reservatorio_limiar_bomba,

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

// `gestaoOnly` (27/08/2026): os dois geocoders servem só ao mini-mapa do
// cadastro/edição de condomínio, que já é tela de gestão. O mapa principal usa
// as coordenadas que o cadastro gravou, não geocodifica nada.
router.get("/geocode", authRequired, gestaoOnly, async (req, res) => {
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
router.get("/reverse-geocode", authRequired, gestaoOnly, async (req, res) => {
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
router.get("/usuarios", authRequired, gestaoOnly, async (req, res) => {
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
// ⚠️ CLIENTE NÃO TEM SENHA (25/08/2026).
// O síndico entra pelo código de 6 dígitos que chega no e-mail dele
// (POST /auth/codigo) — em produção o OTP já era obrigatório em todo login,
// então a senha nunca foi o que protegia a conta: era só mais uma coisa para
// o escritório criar, mandar por e-mail (o pior lugar para uma senha estar) e
// o síndico esquecer, sem ter recuperação nenhuma no sistema.
//
// `usuarios.senha_hash` é NOT NULL e continua sendo: em vez de mexer no
// schema, o cliente nasce com um hash de 32 bytes aleatórios que ninguém
// conhece — senha que não existe, sem coluna nova e sem migration. O
// /auth/login com senha simplesmente nunca vai casar para ele.
//
// Usuário interno (admin, gerente, operador, técnico) segue com senha: essa
// gente entra pelo painel todo dia, e o código a cada login seria pedágio.
router.post("/usuarios", authRequired, masterAdminOnly, async (req, res) => {
  const bcrypt = require("bcrypt");
  const crypto = require("crypto");
  const { nome, email, senha, role, condominio_id } = req.body || {};
  const papel = role || "cliente";
  const ROLES = ["cliente", "admin", "gerente", "operador", "tecnico"];
  if (!ROLES.includes(papel)) return res.status(400).json({ error: "role inválido" });
  if (!nome || !email) return res.status(400).json({ error: "nome e email obrigatórios" });
  if (papel !== "cliente" && !senha) {
    return res.status(400).json({ error: "senha obrigatória para acesso interno" });
  }
  try {
    const hash = await bcrypt.hash(String(senha || crypto.randomBytes(32).toString("hex")), 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, condominio_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, role, criado_em`,
      [nome, email.toLowerCase(), hash, papel, condominio_id || null]
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
  const ROLES = ["cliente", "admin", "gerente", "operador", "tecnico"];
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
    // 23503 = FK violation. A migration 073 converteu as FKs de autoria para
    // ON DELETE SET NULL, mas se alguma nova nascer sem cláusula ON DELETE o
    // erro volta — aqui ele vira mensagem legível em vez de 500 mudo.
    if (err.code === "23503") {
      console.error(`[admin] DELETE /usuarios/${id}: FK ${err.constraint} em ${err.table}`);
      return res.status(409).json({
        error: `Usuário vinculado a registros de "${err.table || "outra tabela"}" — não pode ser removido`,
      });
    }
    console.error("[admin] DELETE /usuarios/:id:", err);
    return res.status(500).json({ error: "Erro ao remover usuário" });
  }
});

// GET /admin/me — dados do usuário logado (role, nome, email, foto)
router.get("/me", authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role, t.foto_url
       FROM usuarios u
       LEFT JOIN tecnicos t ON t.usuario_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    return res.json(r.rows[0] || {});
  } catch (err) {
    return res.status(500).json({ error: "Erro ao buscar perfil" });
  }
});

// GET /admin/me/email-template — retorna template de e-mail do usuário logado
router.get("/me/email-template", authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT email_mensagem, assinatura_email_url FROM usuarios WHERE id = $1`,
      [req.user.id]
    );
    return res.json(r.rows[0] || {});
  } catch (err) {
    return res.status(500).json({ error: "Erro ao buscar template" });
  }
});

// PATCH /admin/me/email-template — salva mensagem e/ou URL de assinatura
router.patch("/me/email-template", authRequired, async (req, res) => {
  const { email_mensagem, assinatura_email_url } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE usuarios
          SET email_mensagem       = COALESCE($2, email_mensagem),
              assinatura_email_url = COALESCE($3, assinatura_email_url)
        WHERE id = $1
        RETURNING email_mensagem, assinatura_email_url`,
      [req.user.id, email_mensagem ?? null, assinatura_email_url ?? null]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao salvar template" });
  }
});

// POST /admin/me/assinatura — upload de imagem de assinatura (base64 → banco)
// Filesystem do Railway é efêmero; armazena em bytea no Postgres.
router.post("/me/assinatura", authRequired, async (req, res) => {
  const { base64 } = req.body || {};
  if (!base64 || !base64.startsWith("data:image/")) {
    return res.status(400).json({ error: "Envie a imagem em base64 (data:image/...)" });
  }
  try {
    const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (!matches) return res.status(400).json({ error: "Formato base64 inválido" });
    const mimetype = `image/${matches[1]}`;
    const buffer   = Buffer.from(matches[2], "base64");
    await pool.query(
      `UPDATE usuarios SET assinatura_blob = $2, assinatura_mimetype = $3 WHERE id = $1`,
      [req.user.id, buffer, mimetype]
    );
    const url = `/admin/assinatura/${req.user.id}`;
    return res.json({ url });
  } catch (err) {
    console.error("[admin] POST /me/assinatura:", err);
    return res.status(500).json({ error: "Erro ao salvar assinatura" });
  }
});

// GET /admin/assinatura/:userId — serve a imagem de assinatura (pública, para e-mails)
router.get("/assinatura/:userId", async (req, res) => {
  const id = Number(req.params.userId);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).end();
  try {
    const r = await pool.query(
      `SELECT assinatura_blob, assinatura_mimetype FROM usuarios WHERE id = $1`,
      [id]
    );
    const row = r.rows[0];
    if (!row?.assinatura_blob) return res.status(404).end();
    res.setHeader("Content-Type", row.assinatura_mimetype || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    // Permite carregamento por clientes de e-mail (origins externos)
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return res.send(row.assinatura_blob);
  } catch (err) {
    return res.status(500).end();
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

// GET /admin/usuarios/:id/dispositivos — lista dispositivos confiáveis de um usuário
router.get("/usuarios/:id/dispositivos", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `SELECT id, nome, criado_em
       FROM trusted_devices
       WHERE usuario_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY criado_em DESC`,
      [id]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /usuarios/:id/dispositivos:", err);
    return res.status(500).json({ error: "Erro ao listar dispositivos" });
  }
});

// DELETE /admin/usuarios/:id/dispositivos/:tdId — revoga dispositivo específico
router.delete("/usuarios/:id/dispositivos/:tdId", authRequired, masterAdminOnly, async (req, res) => {
  const id   = Number(req.params.id);
  const tdId = Number(req.params.tdId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(tdId) || tdId <= 0) {
    return res.status(400).json({ error: "ids inválidos" });
  }
  try {
    const r = await pool.query(
      "DELETE FROM trusted_devices WHERE id = $1 AND usuario_id = $2",
      [tdId, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Dispositivo não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] DELETE /usuarios/:id/dispositivos/:tdId:", err);
    return res.status(500).json({ error: "Erro ao revogar dispositivo" });
  }
});

// DELETE /admin/usuarios/:id/dispositivos — revoga todos os dispositivos de um usuário
router.delete("/usuarios/:id/dispositivos", authRequired, masterAdminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query("DELETE FROM trusted_devices WHERE usuario_id = $1", [id]);
    return res.json({ ok: true, revogados: r.rowCount });
  } catch (err) {
    console.error("[admin] DELETE /usuarios/:id/dispositivos:", err);
    return res.status(500).json({ error: "Erro ao revogar dispositivos" });
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

  return res.json(out);
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
    "SELECT id, condominio_id, orcamento_necessario, equipamento_id FROM ordens_servico WHERE id = $1",
    [osId]
  );
  if (!osRow.rows.length) throw Object.assign(new Error("O.S. não encontrada"), { status: 404 });
  if (!osRow.rows[0].orcamento_necessario) {
    throw Object.assign(new Error("Esta O.S. não tem orçamento solicitado"), { status: 400 });
  }

  // A bancada pode ter pedido primeiro, pela etiqueta da bomba. Nesse caso o
  // orçamento já existe solto: esta O.S. o ADOTA em vez de abrir um segundo
  // para o mesmo serviço. É o espelho da checagem em
  // `POST /equipamentos/:id/orcamento`.
  if (osRow.rows[0].equipamento_id) {
    const daBancada = await pool.query(
      `SELECT id FROM orcamentos
        WHERE equipamento_id = $1 AND os_id IS NULL AND status IN ('rascunho', 'enviado')
        ORDER BY criado_em DESC LIMIT 1`,
      [osRow.rows[0].equipamento_id]
    );
    if (daBancada.rows.length) {
      await pool.query(`UPDATE orcamentos SET os_id = $1 WHERE id = $2`,
        [osId, daBancada.rows[0].id]);
      return { id: daBancada.rows[0].id, criado: false };
    }
  }

  const numSeq = (await pool.query(
    "SELECT 'OR-' || LPAD(nextval('orcamento_numero_seq')::text, 6, '0') AS n"
  )).rows[0].n;

  // `equipamento_id` viaja junto (migration 072): sem ele, aprovar o orçamento
  // de uma O.S. de conserto de bomba não moveria nada na bancada.
  const ins = await pool.query(
    // `origem = 'os'` explícito: o DEFAULT da coluna é 'admin' (migration 036),
    // então todo orçamento criado por aqui nascia marcado como avulso. O
    // backfill da 036 acertou os antigos e os novos voltavam a errar.
    `INSERT INTO orcamentos (os_id, numero, condominio_id, equipamento_id, origem, status, criado_por)
     VALUES ($1, $2, $3, $4, 'os', 'rascunho', $5)
     RETURNING id`,
    [osId, numSeq, osRow.rows[0].condominio_id, osRow.rows[0].equipamento_id || null, userId || null]
  );
  return { id: ins.rows[0].id, criado: true };
}

// Helpers de status: rascunho|enviado|aprovado|rejeitado (não há mais "pendente").
const ORC_STATUS_VALIDOS = ["rascunho", "enviado", "aprovado", "rejeitado"];

// GET /admin/orcamentos?status=&condominio_id=&data_ini=&data_fim=
// Lista APENAS orçamentos originados de OS (orcamentos.os_id IS NOT NULL).
router.get("/orcamentos", authRequired, gestaoOnly, async (req, res) => {
  const { status: rawStatus, condominio_id, data_ini, data_fim } = req.query;
  const status = _orcStatusIn(rawStatus);

  // Só o pedido do técnico é obrigatório aqui. O orçamento em si pode ainda
  // não existir: era um INNER JOIN com `orcamentos`, então a O.S. marcada como
  // "precisa de orçamento" ficava invisível justamente enquanto ninguém tinha
  // criado o orçamento — que é o estado que esta aba precisa mostrar.
  const where = ["os.orcamento_necessario = TRUE"];
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
       LEFT JOIN orcamentos o  ON o.os_id = os.id
       LEFT JOIN condominios c ON c.id = os.condominio_id
       LEFT JOIN tecnicos t    ON t.id = os.tecnico_id
       LEFT JOIN usuarios ua   ON ua.id = o.aprovado_por
       WHERE ${where.join(" AND ")}
       ORDER BY
         CASE WHEN o.id IS NULL THEN 0
              WHEN o.status = 'rascunho' THEN 1
              ELSE 2 END,
         os.finalizada_em DESC NULLS LAST
       LIMIT 200`,
      vals
    );

    // Orçamentos pedidos na bancada (origem 'bancada', migration 071). Também
    // foram solicitados por um técnico — só que sem O.S. por trás, então não
    // cabem na query acima, que é ancorada em `ordens_servico`.
    //
    // Duas consultas e concatenação em JS, e não um UNION: as 28 colunas do
    // SELECT acima teriam de ser espelhadas com NULLs, e qualquer campo novo
    // passaria a exigir manutenção nos dois lados.
    const valsB = [];
    // `os_id IS NULL`: quando o pedido da bancada é adotado por uma O.S., ele
    // passa a aparecer pela linha da O.S. — sem isto sairia duas vezes na aba.
    const whereB = ["o.origem = 'bancada'", "o.os_id IS NULL"];
    if (status && ORC_STATUS_VALIDOS.includes(status)) {
      valsB.push(status);
      whereB.push(`o.status = $${valsB.length}`);
    }
    if (condominio_id) {
      valsB.push(Number(condominio_id));
      whereB.push(`o.condominio_id = $${valsB.length}`);
    }
    if (data_ini) { valsB.push(data_ini); whereB.push(`o.criado_em >= $${valsB.length}::date`); }
    if (data_fim) { valsB.push(data_fim); whereB.push(`o.criado_em < ($${valsB.length}::date + interval '1 day')`); }

    const rb = await pool.query(
      `SELECT
         NULL::int           AS id,
         o.numero,
         o.condominio_id,
         c.nome              AS condominio_nome,
         NULL::int           AS tecnico_id,
         uc.nome             AS tecnico_nome,
         NULL::int           AS chamado_id,
         NULL::timestamptz   AS finalizada_em,
         o.criado_em,
         TRUE                AS orcamento_necessario,
         o.constatacao       AS orcamento_observacoes,
         o.id                AS orcamento_id,
         COALESCE(o.valor, SUM(l.quantidade * l.valor_unitario)) AS orcamento_valor,
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
         NULL::varchar       AS servico_realizado,
         NULL::text[]        AS tipos_servico,
         'bancada'           AS fonte,
         e.codigo            AS equipamento_codigo,
         e.apelido           AS equipamento_apelido
       FROM orcamentos o
       LEFT JOIN condominios c       ON c.id = o.condominio_id
       LEFT JOIN usuarios uc         ON uc.id = o.criado_por
       LEFT JOIN usuarios ua         ON ua.id = o.aprovado_por
       LEFT JOIN equipamentos e      ON e.id = o.equipamento_id
       LEFT JOIN orcamento_linhas l  ON l.orcamento_id = o.id
       WHERE ${whereB.join(" AND ")}
       GROUP BY o.id, c.nome, uc.nome, ua.nome, e.codigo, e.apelido
       ORDER BY o.criado_em DESC
       LIMIT 200`,
      valsB
    );

    // Sem orçamento ainda vem primeiro (é o que a aba existe para cobrar),
    // depois rascunho, depois o resto — mesma regra do ORDER BY acima.
    const peso = (x) => (!x.orcamento_id ? 0 : x.orcamento_status === "rascunho" ? 1 : 2);
    const linhas = [...r.rows.map(x => ({ ...x, fonte: "os" })), ...rb.rows]
      .sort((a, b) => peso(a) - peso(b) ||
        new Date(b.finalizada_em || b.criado_em) - new Date(a.finalizada_em || a.criado_em));

    return res.json(linhas);
  } catch (err) {
    console.error("[admin] GET /orcamentos:", err);
    return res.status(500).json({ error: "Erro ao buscar orçamentos" });
  }
});

// PATCH /admin/orcamentos/:os_id — aprovar, rejeitar ou salvar valor
// (mantém :os_id na URL por compat; resolve internamente para orcamentos.id)
router.patch("/orcamentos/:os_id", authRequired, gestaoOnly, async (req, res) => {
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

    // Mesmo reflexo do orçamento avulso: se esta O.S. tem equipamento
    // vinculado, aprovar/rejeitar aqui move a bomba na bancada. Sem isto, o
    // caminho "orçamento nasceu de O.S." ficaria mudo para a oficina.
    if (acao === "aprovar" || acao === "rejeitar") {
      refletirStatusOrcamento(orcId, acao === "aprovar" ? "aprovado" : "rejeitado", req.user);
    }

    return res.json(r.rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[admin] PATCH /orcamentos/:os_id:", err);
    return res.status(500).json({ error: "Erro ao atualizar orçamento" });
  }
});

// ── Itens do orçamento (mantém :os_id na URL; opera em orcamento_linhas) ──────

// GET /admin/orcamentos/:os_id/itens
router.get("/orcamentos/:os_id/itens", authRequired, gestaoOnly, async (req, res) => {
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
router.post("/orcamentos/:os_id/itens", authRequired, gestaoOnly, async (req, res) => {
  const osId = Number(req.params.os_id);
  if (!Number.isInteger(osId) || osId <= 0) return res.status(400).json({ error: "os_id inválido" });

  const { descricao, ficha_tecnica, quantidade, valor_unitario } = req.body || {};
  if (!descricao || !String(descricao).trim()) return res.status(400).json({ error: "descricao obrigatória" });

  const qtd = Number(quantidade) || 1;
  const vu  = (valor_unitario === "" || valor_unitario == null) ? null : Number(valor_unitario);
  if (qtd <= 0)  return res.status(400).json({ error: "quantidade inválida" });
  if (vu != null && (isNaN(vu) || vu < 0)) return res.status(400).json({ error: "valor_unitario inválido" });

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
router.patch("/orcamentos/itens/:item_id", authRequired, gestaoOnly, async (req, res) => {
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
    if (valor_unitario === "" || valor_unitario === null) {
      vals.push(null); sets.push(`valor_unitario = $${vals.length}`);
    } else {
      const v = Number(valor_unitario);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: "valor_unitario inválido" });
      vals.push(v); sets.push(`valor_unitario = $${vals.length}`);
    }
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
router.delete("/orcamentos/itens/:item_id", authRequired, gestaoOnly, async (req, res) => {
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
router.get("/orcamentos/:os_id/pdf", authRequired, gestaoOnly, async (req, res) => {
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
router.get("/orcamentos/avulsos", authRequired, gestaoOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id, o.numero, o.status, o.valido_ate, o.data_documento, o.criado_em, o.origem, o.tipo,
              o.os_id, os.numero AS os_numero,
              o.constatacao, o.forma_pagamento, o.prazo_entrega,
              o.garantia, o.disponibilidade,
              COALESCE(c.nome, o.cliente_nome) AS condominio_nome, c.id AS condominio_id, c.email AS condominio_email,
              o.cliente_nome, o.cliente_documento, o.cliente_endereco, o.cliente_email,
              o.enviado_em, o.enviado_para,
              -- A resposta que o CLIENTE deu pelo painel dele (migration 074).
              -- Separado de aprovado_por, que pode ser alguem do escritorio
              -- registrando por fora: sem essa distincao nao da para saber se
              -- o aprovado veio do sindico ou de quem digitou.
              -- (Sem crase neste comentario: ele vive dentro de um template
              --  literal, e crase aqui FECHA o template.)
              o.respondido_em, o.cliente_comentario, o.motivo_rejeicao,
              -- Quem assumiu a decisao, digitado na hora (migration 076).
              -- ur.nome e o nome da CONTA; estes sao a pessoa.
              o.respondido_nome, o.respondido_cargo, o.resposta_vista_em,
              -- A BAIXA (migration 078). Ver e tratar nao sao a mesma coisa:
              -- resposta_vista_em diz que alguem ABRIU, resposta_tratada_em diz
              -- que alguem RESOLVEU. O aviso do painel some com a segunda.
              -- (Sem crase: comentario dentro de template literal, ver acima.)
              o.resposta_tratada_em, ut.nome AS resposta_tratada_por_nome,
              ur.nome AS respondido_por_nome,
              -- Quem MONTOU o orcamento. A coluna existe desde sempre e sempre
              -- foi gravada; o que faltava era a ficha mostrar. Nao confundir
              -- com respondido_por (o sindico) nem com resposta_tratada_por
              -- (quem deu baixa): sao tres pessoas diferentes no mesmo papel de
              -- "quem fez o que" e a ficha precisa distinguir as tres.
              o.criado_por, uc.nome AS criado_por_nome,
              -- CONTRATO COM O MODAL, NAO TIRE: o.valor e a COLUNA CRUA (total
              -- manual, NULL = somar os itens), e valor_total e o numero ja
              -- resolvido. O modal do admin le o.valor para saber se o modo
              -- manual esta ligado e para preencher o campo. Sem esta coluna na
              -- lista o campo nasce VAZIO mesmo com valor no banco, o trilho
              -- mostra a soma dos itens (R$ 0,00 quando nenhum item tem preco)
              -- e o proximo "Salvar" manda valor: null e APAGA o total manual
              -- - o PDF continuava certo ate alguem salvar, e foi assim que
              -- OR-000170, OR-000169 e OR-000105 chegaram a R$ 0,00 em producao.
              o.valor,
              COALESCE(
                o.valor,
                (SELECT SUM(l.quantidade * l.valor_unitario)
                 FROM orcamento_linhas l WHERE l.orcamento_id = o.id), 0
              ) AS valor_total
       FROM orcamentos o
       LEFT JOIN condominios c ON c.id = o.condominio_id
       LEFT JOIN ordens_servico os ON os.id = o.os_id
       LEFT JOIN usuarios ur ON ur.id = o.respondido_por
       LEFT JOIN usuarios ut ON ut.id = o.resposta_tratada_por
       LEFT JOIN usuarios uc ON uc.id = o.criado_por
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
router.post("/orcamentos/avulsos", authRequired, gestaoOnly, async (req, res) => {
  const { condominio_id, numero, os_id, tipo, constatacao, forma_pagamento, prazo_entrega, garantia, disponibilidade, valido_ate, data_documento,
          cliente_nome, cliente_documento, cliente_endereco, cliente_email } = req.body || {};
  const TIPOS_VALIDOS = ["pecas", "limpeza_reservatorio", "dedetizacao", "limpeza_dedetizacao"];
  if (tipo != null && !TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: "tipo inválido" });
  try {
    // número sequencial automático: OR-000001, OR-000002…
    const numSeq = (await pool.query(
      "SELECT 'OR-' || LPAD(nextval('orcamento_numero_seq')::text, 6, '0') AS n"
    )).rows[0].n;
    const num = numero ? String(numero).trim().slice(0, 30) : numSeq;
    const r = await pool.query(
      `INSERT INTO orcamentos
         (numero, condominio_id, os_id, tipo, constatacao, forma_pagamento, prazo_entrega,
          garantia, disponibilidade, valido_ate, data_documento, criado_por,
          cliente_nome, cliente_documento, cliente_endereco, cliente_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        num,
        condominio_id ? Number(condominio_id) : null,
        os_id ? Number(os_id) : null,
        tipo || "pecas",
        constatacao ? String(constatacao).slice(0, 1000) : null,
        forma_pagamento ? String(forma_pagamento).slice(0, 255) : "Via boleto bancário",
        prazo_entrega ? String(prazo_entrega).slice(0, 100) : "5 dias úteis após aprovação",
        garantia ? String(garantia).slice(0, 100) : "12 meses por defeito de fabricação",
        disponibilidade ? String(disponibilidade).slice(0, 100) : "Total",
        valido_ate || null,
        data_documento || null,
        req.user.id,
        cliente_nome ? String(cliente_nome).slice(0, 200) : null,
        cliente_documento ? String(cliente_documento).slice(0, 30) : null,
        cliente_endereco ? String(cliente_endereco).slice(0, 255) : null,
        cliente_email ? String(cliente_email).slice(0, 255) : null,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos:", err);
    return res.status(500).json({ error: "Erro ao criar orçamento" });
  }
});

// PATCH /admin/orcamentos/avulsos/:id — atualizar
router.patch("/orcamentos/avulsos/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const fields = ["numero","condominio_id","os_id","status","tipo","constatacao","forma_pagamento","prazo_entrega","garantia","disponibilidade","valido_ate","data_documento","valor","cliente_nome","cliente_documento","cliente_endereco","cliente_email"];
  const sets = []; const vals = [id];

  for (const f of fields) {
    if (!(f in (req.body || {}))) continue;
    const v = req.body[f];
    if (f === "condominio_id") { vals.push(v ? Number(v) : null); sets.push(`${f} = $${vals.length}`); }
    else if (f === "valido_ate") { vals.push(v || null); sets.push(`valido_ate = $${vals.length}::date`); }
    else if (f === "data_documento") { vals.push(v || null); sets.push(`data_documento = $${vals.length}::date`); }
    else if (f === "status") {
      if (!["rascunho","enviado","aprovado","rejeitado"].includes(v)) return res.status(400).json({ error: "status inválido" });
      vals.push(v); sets.push(`status = $${vals.length}`);
    }
    else if (f === "tipo") {
      if (!["pecas","limpeza_reservatorio","dedetizacao","limpeza_dedetizacao"].includes(v)) return res.status(400).json({ error: "tipo inválido" });
      vals.push(v); sets.push(`tipo = $${vals.length}`);
    }
    else if (f === "valor") {
      // Override manual do valor total exibido no PDF — vazio/null volta a
      // usar a soma automática dos itens (útil quando algum item não tem
      // valor unitário lançado e a soma automática não reflete o total real).
      if (v === "" || v == null) { vals.push(null); sets.push(`valor = $${vals.length}`); }
      else {
        const n = Number(v);
        if (isNaN(n) || n < 0) return res.status(400).json({ error: "valor inválido" });
        vals.push(n); sets.push(`valor = $${vals.length}`);
      }
    }
    else {
      const max = f === "constatacao" ? 1000 : f === "cliente_documento" ? 30 : f === "cliente_nome" ? 200 : 255;
      vals.push(v != null ? String(v).slice(0, max) : null);
      sets.push(`${f} = $${vals.length}`);
    }
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE orcamentos SET ${sets.join(",")} WHERE id = $1
       RETURNING id, numero, status, condominio_id, tipo, constatacao,
                 forma_pagamento, prazo_entrega, garantia, disponibilidade, valido_ate, data_documento, valor,
                 cliente_nome, cliente_documento, cliente_endereco, cliente_email`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });

    // Recalcula valor_total (soma dos itens) para retornar junto; se houver
    // override manual (`valor`), ele prevalece sobre a soma.
    const tot = await pool.query(
      `SELECT COALESCE(SUM(quantidade * valor_unitario),0) AS soma_itens
       FROM orcamento_linhas WHERE orcamento_id = $1`, [id]
    );
    const valorTotal = r.rows[0].valor != null ? Number(r.rows[0].valor) : Number(tot.rows[0].soma_itens);

    // Orçamento da bancada: aprovar/recusar aqui move a bomba lá. Não é
    // aguardado nem quebra a resposta — o documento comercial é a fonte da
    // verdade, o estado do equipamento é consequência dele.
    if ("status" in (req.body || {})) {
      refletirStatusOrcamento(id, req.body.status, req.user);
    }

    return res.json({ ...r.rows[0], valor_total: valorTotal });
  } catch (err) {
    console.error("[admin] PATCH /orcamentos/avulsos/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar orçamento" });
  }
});

// DELETE /admin/orcamentos/avulsos/:id
router.delete("/orcamentos/avulsos/:id", authRequired, gestaoOnly, async (req, res) => {
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
router.get("/orcamentos/avulsos/:id/linhas", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `SELECT id, descricao, ficha_tecnica, quantidade, valor_unitario, tipo_servico
       FROM orcamento_linhas WHERE orcamento_id = $1 ORDER BY id ASC`, [id]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[admin] GET /orcamentos/avulsos/:id/linhas:", err);
    return res.status(500).json({ error: "Erro ao buscar linhas" });
  }
});

// POST /admin/orcamentos/avulsos/:id/linhas
// `tipo_servico` (migration 068) marca a linha que representa um serviço, para
// o PDF achar a especificação da cláusula por chave em vez de por regex na
// descrição. Só o preset do tipo manda esse campo; item avulso vem sem ele.
const TIPOS_SERVICO_LINHA = new Set(["limpeza_reservatorio", "dedetizacao"]);
router.post("/orcamentos/avulsos/:id/linhas", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  const { descricao, ficha_tecnica, quantidade, valor_unitario, tipo_servico } = req.body || {};
  if (!descricao || !String(descricao).trim()) return res.status(400).json({ error: "descricao obrigatória" });
  const qtd = Math.max(1, Number(quantidade) || 1);
  const vu  = (valor_unitario === "" || valor_unitario == null) ? null : Math.max(0, Number(valor_unitario) || 0);
  // Valor fora da lista vira NULL em vez de estourar o CHECK do banco.
  const ts  = TIPOS_SERVICO_LINHA.has(tipo_servico) ? tipo_servico : null;
  try {
    const r = await pool.query(
      `INSERT INTO orcamento_linhas (orcamento_id, descricao, ficha_tecnica, quantidade, valor_unitario, tipo_servico)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, descricao, ficha_tecnica, quantidade, valor_unitario, tipo_servico`,
      [id, String(descricao).trim(), ficha_tecnica ? String(ficha_tecnica).trim() : null, qtd, vu, ts]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos/:id/linhas:", err);
    return res.status(500).json({ error: "Erro ao criar linha" });
  }
});

// PATCH /admin/orcamentos/avulsos/linhas/:linha_id
router.patch("/orcamentos/avulsos/linhas/:linha_id", authRequired, gestaoOnly, async (req, res) => {
  const linhaId = Number(req.params.linha_id);
  if (!Number.isInteger(linhaId) || linhaId <= 0) return res.status(400).json({ error: "linha_id inválido" });

  const fields = ["descricao", "ficha_tecnica", "quantidade", "valor_unitario"];
  const sets = []; const vals = [linhaId];

  for (const f of fields) {
    if (!(f in (req.body || {}))) continue;
    const v = req.body[f];
    if (f === "descricao") {
      if (!v || !String(v).trim()) return res.status(400).json({ error: "descricao obrigatória" });
      vals.push(String(v).trim().slice(0, 500)); sets.push(`descricao = $${vals.length}`);
    } else if (f === "ficha_tecnica") {
      vals.push(v ? String(v).trim().slice(0, 1000) : null); sets.push(`ficha_tecnica = $${vals.length}`);
    } else if (f === "quantidade") {
      vals.push(Math.max(1, Number(v) || 1)); sets.push(`quantidade = $${vals.length}`);
    } else if (f === "valor_unitario") {
      vals.push(v === "" || v == null ? null : Math.max(0, Number(v) || 0));
      sets.push(`valor_unitario = $${vals.length}`);
    }
  }

  if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  try {
    const r = await pool.query(
      `UPDATE orcamento_linhas SET ${sets.join(",")} WHERE id = $1
       RETURNING id, descricao, ficha_tecnica, quantidade, valor_unitario`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Linha não encontrada" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[admin] PATCH /orcamentos/avulsos/linhas/:linha_id:", err);
    return res.status(500).json({ error: "Erro ao atualizar linha" });
  }
});

// DELETE /admin/orcamentos/avulsos/linhas/:linha_id
router.delete("/orcamentos/avulsos/linhas/:linha_id", authRequired, gestaoOnly, async (req, res) => {
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
router.get("/orcamentos/avulsos/:id/pdf", authRequired, gestaoOnly, async (req, res) => {
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

const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /admin/orcamentos/avulsos/:id/destinatarios
 *
 * Quem recebe o quê, para o modal de envio poder dizer isso na cara do
 * operador em vez de deixá-lo adivinhar. Devolve as DUAS listas, que são
 * diferentes de propósito:
 *
 *  - `usuarios`    → quem tem login de cliente neste condomínio. É a lista do
 *                    envio pelo painel: só quem consegue entrar recebe um
 *                    e-mail cujo único caminho é entrar.
 *  - `cadastrados` → `condominios.email`, o que a portaria/administração
 *                    informou. Pode conter gente sem conta nenhuma, e é a
 *                    lista do envio com carta e anexo.
 *
 * ⚠️ As duas listas existirem separadas é a correção de um furo real: até
 * 25/08/2026 o e-mail ia para `cadastrados` e o formato era escolhido por
 * "existe ALGUM usuário neste condomínio?". Num prédio com síndico, zelador e
 * administradora onde só o síndico tinha login, os três recebiam o e-mail sem
 * anexo — e dois deles não tinham como abrir o documento em lugar nenhum.
 */
router.get("/orcamentos/avulsos/:id/destinatarios", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `SELECT o.condominio_id, o.cliente_email, c.email AS condominio_email
         FROM orcamentos o
         LEFT JOIN condominios c ON c.id = o.condominio_id
        WHERE o.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
    const orc = r.rows[0];

    let usuarios = [];
    if (orc.condominio_id) {
      const u = await pool.query(
        `SELECT nome, email FROM usuarios
          WHERE condominio_id = $1 AND role = 'cliente'
          ORDER BY nome`,
        [orc.condominio_id]
      );
      usuarios = u.rows;
    }

    const cadastrados = String(orc.condominio_email || orc.cliente_email || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    return res.json({
      usuarios,
      cadastrados,
      // O front usa para saber se a opção "pelo painel" pode ser oferecida.
      // Sem condomínio (avulso de pessoa física) ela não existe.
      tem_condominio: Boolean(orc.condominio_id),
    });
  } catch (err) {
    console.error("[admin] GET /orcamentos/avulsos/:id/destinatarios:", err);
    return res.status(500).json({ error: "Erro ao listar destinatários" });
  }
});

/**
 * POST /admin/orcamentos/avulsos/:id/resposta-vista
 *
 * Marca que alguém do escritório abriu a resposta do cliente.
 *
 * ⚠️ ISTO NÃO APAGA MAIS O AVISO (078). Até 26/08/2026 apagava, e um clique de
 * passagem matava o único sinal de que havia resposta nova. Hoje o aviso só sai
 * com a baixa explícita (`resposta-baixa`); o que se grava aqui é QUEM abriu e
 * QUANDO — é o que deixa o painel dizer "aberta há 2h e ninguém deu baixa".
 *
 * ⚠️ Idempotente e sem efeito quando não há resposta: o `WHERE` exige
 * `respondido_em IS NOT NULL`, então abrir a ficha de um rascunho não grava
 * nada. E `resposta_vista_em IS NULL` impede que reabrir a ficha reescreva a
 * data — o que interessa é QUANDO alguém viu pela primeira vez.
 */
router.post("/orcamentos/avulsos/:id/resposta-vista", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `UPDATE orcamentos
          SET resposta_vista_em = now()
        WHERE id = $1 AND respondido_em IS NOT NULL AND resposta_vista_em IS NULL
        RETURNING resposta_vista_em`,
      [id]
    );
    return res.json({ ok: true, resposta_vista_em: r.rows[0]?.resposta_vista_em || null });
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos/:id/resposta-vista:", err);
    return res.status(500).json({ error: "Erro ao marcar a resposta como vista" });
  }
});

/**
 * POST /admin/orcamentos/avulsos/:id/resposta-baixa
 *
 * Dá baixa na resposta do cliente — é ISTO que apaga o aviso da aba desde a
 * migration 078. Body `{ desfazer: true }` reabre a pendência.
 *
 * ⚠️ ABRIR A FICHA NÃO DÁ BAIXA, E ISSO É O PONTO. Até 26/08/2026 o aviso
 * sumia sozinho no primeiro clique (`resposta-vista` acima), e o relato foi
 * exatamente esse: *"alguém clica lá para ver uma vez e fecha, ou a tela
 * recarrega antes da pessoa ver qual o orçamento é, e a informação se perde"*.
 * A promessa que a tela do cliente faz é "entramos em contato para agendar o
 * serviço" — quem fecha essa promessa é o telefonema, não o clique.
 *
 * Idempotente: `resposta_tratada_em IS NULL` no WHERE impede que um segundo
 * clique reescreva a data e troque o autor da baixa. A leitura no fim devolve
 * o estado atual mesmo quando o UPDATE não pegou nada, para o painel não
 * precisar adivinhar o que ficou gravado.
 */
router.post("/orcamentos/avulsos/:id/resposta-baixa", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  const desfazer = Boolean(req.body?.desfazer);
  try {
    if (desfazer) {
      await pool.query(
        `UPDATE orcamentos
            SET resposta_tratada_em = NULL, resposta_tratada_por = NULL
          WHERE id = $1`,
        [id]
      );
    } else {
      await pool.query(
        `UPDATE orcamentos
            SET resposta_tratada_em = now(), resposta_tratada_por = $2
          WHERE id = $1 AND respondido_em IS NOT NULL AND resposta_tratada_em IS NULL`,
        [id, req.user.id]
      );
    }
    const r = await pool.query(
      `SELECT o.resposta_tratada_em, u.nome AS resposta_tratada_por_nome
         FROM orcamentos o
         LEFT JOIN usuarios u ON u.id = o.resposta_tratada_por
        WHERE o.id = $1`,
      [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: "Orçamento não encontrado" });
    console.log(`[admin] orcamento=${id} baixa=${desfazer ? "desfeita" : "dada"} usuario=${req.user.id}`);
    return res.json({ ok: true, ...r.rows[0] });
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos/:id/resposta-baixa:", err);
    return res.status(500).json({ error: "Erro ao dar baixa na resposta" });
  }
});

// POST /admin/orcamentos/avulsos/:id/enviar-email — envia o PDF ao cliente
router.post("/orcamentos/avulsos/:id/enviar-email", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: "Envio de e-mail indisponível (provedor não configurado)" });
  }
  try {
    // Dados do orçamento
    const r = await pool.query(
      `SELECT o.id, o.numero, o.valido_ate, o.condominio_id,
              o.data_documento, o.criado_em,
              COALESCE(c.nome_fantasia, c.nome, o.cliente_nome) AS condominio_nome,
              COALESCE(
                o.valor,
                (SELECT SUM(l.quantidade * l.valor_unitario)
                 FROM orcamento_linhas l WHERE l.orcamento_id = o.id), 0
              ) AS valor_total
       FROM orcamentos o
       LEFT JOIN condominios c ON c.id = o.condominio_id
       WHERE o.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
    const orc = r.rows[0];

    // ⚠️ DOIS MODOS DE ENVIO, E CADA UM TEM A SUA LISTA (25/08/2026).
    //
    // O furo que isto corrige: o e-mail ia para todos os endereços de
    // `condominios.email` e o FORMATO era escolhido por "existe ALGUM usuário
    // cliente neste condomínio?". Num prédio com síndico, zelador e
    // administradora onde só o síndico tem login, os três recebiam o e-mail
    // com link e sem anexo — e dois deles não conseguiam abrir o documento em
    // lugar nenhum. O acesso de um decidia pelos outros.
    //
    //  `painel` → vai SÓ para quem tem login de cliente, e o documento mora na
    //             tela dele. Corpo fixo, sem anexo. Um e-mail cujo único
    //             caminho é entrar não pode ser mandado a quem não entra.
    //  `carta`  → vai para os endereços informados, com a mensagem escrita
    //             pelo operador, a assinatura dele e o PDF em anexo. É o
    //             caminho de quem não tem conta — e o de quando se quer dizer
    //             alguma coisa junto.
    //
    // Sem `modo` no corpo, mantém o comportamento anterior: cliente com JS em
    // cache não pode começar a receber erro.
    const modo = String(req.body?.modo || "").trim().toLowerCase();
    if (modo && modo !== "painel" && modo !== "carta") {
      return res.status(400).json({ error: 'modo deve ser "painel" ou "carta"' });
    }

    let to;
    if (modo === "painel") {
      if (!orc.condominio_id) {
        return res.status(400).json({
          error: "Este orçamento não é de um condomínio — não há painel para onde mandar.",
        });
      }
      // ⚠️ A LISTA VEM DO BANCO, NÃO DO CORPO. O modal mostra os endereços,
      // mas quem os escolhe é o cadastro: aceitar a lista do cliente aqui
      // deixaria o envio "pelo painel" mandar link para qualquer endereço
      // digitado, que é exatamente o defeito que este modo existe para fechar.
      const u = await pool.query(
        `SELECT email FROM usuarios WHERE condominio_id = $1 AND role = 'cliente' ORDER BY nome`,
        [orc.condominio_id]
      );
      to = u.rows.map(x => String(x.email).trim().toLowerCase()).filter(Boolean);
      if (!to.length) {
        return res.status(400).json({
          error: "Nenhum usuário com acesso ao painel neste condomínio. Envie com carta e anexo.",
        });
      }
    } else {
      const emailsRaw = req.body?.emails != null ? String(req.body.emails).trim() : "";
      to = emailsRaw
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      if (!to.length) {
        return res.status(400).json({ error: "Informe o e-mail do destinatário." });
      }
      const invalidos = to.filter(e => !_EMAIL_RE.test(e));
      if (invalidos.length) {
        return res.status(400).json({ error: `E-mail(s) inválido(s): ${invalidos.join(", ")}` });
      }
    }

    // ⚠️ MENSAGEM E ASSINATURA SÃO DO MODO `carta`, E SÓ DELE.
    //
    // Elas existiram até 24/08/2026, saíram quando o corpo do e-mail virou
    // fixo, e voltaram em 25/08 como metade de uma escolha — não como padrão.
    // No modo `painel` continuam fora: lá o e-mail é uma carta de
    // encaminhamento curta para quem vai clicar e responder na tela, e carta
    // reescrita a cada envio é carta que uma hora sai errada para cliente
    // real. No modo `carta` o documento vai anexo e o operador precisa poder
    // dizer alguma coisa junto — é o caminho de quem não tem painel.
    //
    // `assinatura_blob` é lido do usuário logado e vira data URI. Continua
    // valendo o limite do CLAUDE.md: imagem embutida acima de ~100 KB faz o
    // Gmail aparar a mensagem, e o front já redimensiona em
    // `_avPrepararAssinatura` antes de subir.
    let mensagem = null;
    let assinaturaDataUrl = null;
    if (modo === "carta") {
      const texto = req.body?.mensagem != null ? String(req.body.mensagem).trim() : "";
      mensagem = texto || null;

      if (req.body?.assinatura !== false) {
        const a = await pool.query(
          `SELECT assinatura_blob, assinatura_mimetype FROM usuarios WHERE id = $1`,
          [req.user.id]
        );
        const blob = a.rows[0]?.assinatura_blob;
        if (blob) {
          const mime = a.rows[0].assinatura_mimetype || "image/png";
          assinaturaDataUrl = `data:${mime};base64,${Buffer.from(blob).toString("base64")}`;
        }
      }
    }

    // ⚠️ O LINK É DECIDIDO ANTES DO PDF, PORQUE ELE DECIDE SE HÁ PDF.
    //
    // Três condições, e as três importam:
    //  1. O kill-switch (`_linkPainelLigado`) — desligar volta ao formato antigo.
    //  2. O orçamento ser de um condomínio: avulso de pessoa física não tem
    //     para onde apontar.
    //  3. O condomínio ter pelo menos um usuário `cliente`. Sem conta, o link
    //     leva a um /login onde ninguém entra — e um botão que não abre é pior
    //     que botão nenhum. Nesse caso o e-mail sai como antes, com o PDF.
    //
    // O link cai DIRETO no documento, não na lista: quem clica veio de um
    // e-mail sobre UM orçamento e não deve ter que procurá-lo. Sem sessão, a
    // tela manda para /login?next=… e devolve para cá depois de entrar.
    //
    // ⚠️ COM `modo` EXPLÍCITO, QUEM DECIDE É O MODO, não a existência de conta.
    // As três condições abaixo continuam valendo para a chamada SEM modo (o
    // cliente antigo), e é por isso que elas não sumiram. Mas quando o
    // operador escolheu `carta`, ele escolheu anexo — mesmo que o condomínio
    // tenha login —, porque a lista dele pode incluir gente que não tem.
    let temLoginNoPainel = false;
    if (orc.condominio_id) {
      const acesso = await pool.query(
        `SELECT 1 FROM usuarios WHERE condominio_id = $1 AND role = 'cliente' LIMIT 1`,
        [orc.condominio_id]
      );
      temLoginNoPainel = acesso.rowCount > 0;
    }
    const querLink = modo === "painel" ? true
                   : modo === "carta"  ? false
                   : temLoginNoPainel;
    const linkPainel = (_linkPainelLigado() && querLink)
      ? `${_baseUrlPublica(req)}/cliente/painel/orcamentos?orc=${orc.id}`
      : null;

    // ⚠️ COM PAINEL, O E-MAIL NÃO LEVA O PDF (25/08/2026).
    // O documento mora na tela do cliente, que tem o botão "Baixar o PDF" e é
    // onde a resposta é registrada. Anexo e link competindo davam ao síndico um
    // caminho que termina sem resposta: ele lê o anexo, fecha o e-mail, e a
    // decisão nunca chega. De quebra, o caminho comum deixou de depender do
    // Puppeteer — o PDF passa a ser gerado sob demanda, em
    // GET /cliente/orcamentos/:id/pdf.
    //
    // AS DUAS ETAPAS SEGUEM SEPARADAS DE PROPÓSITO. Quando havia PDF, este
    // endpoint podia falhar em dois lugares muito diferentes — gerar o
    // documento (Puppeteer, que consome memória e falha de forma intermitente
    // em container apertado) ou entregar ao provedor. Com os dois no mesmo
    // `catch`, o log dizia só "erro ao enviar" e não dava para saber qual.
    const fs = require("fs");
    let pdfBuffer = null;
    if (!linkPainel) {
      try {
        const { fpath } = await gerarPdfAvulso(id);
        if (!fs.existsSync(fpath)) throw new Error("PDF não encontrado após a geração");
        pdfBuffer = fs.readFileSync(fpath);
      } catch (errPdf) {
        console.error(`[email-orcamento] FALHA=pdf orcamento=${id} motivo=${errPdf.message}`);
        return res.status(500).json({
          error: `Não foi possível gerar o PDF do orçamento (${errPdf.message}). O e-mail não foi enviado.`,
          etapa: "pdf",
        });
      }
    }

    try {
      await sendOrcamentoCliente({
        to,
        numero: orc.numero,
        condominioNome: orc.condominio_nome,
        validoAte: orc.valido_ate,
        pdfBuffer,
        filename: `orcamento-${orc.numero || id}.pdf`,
        // As duas datas da caixa de informações do e-mail. `data_documento` é
        // DATE e `criado_em` é timestamptz — o serviço formata cada uma com o
        // seu formatador, por isso vão separadas em vez de já resolvidas aqui.
        dataDocumento: orc.data_documento,
        criadoEm: orc.criado_em,
        // Decidido lá em cima, junto com a existência (ou não) do anexo —
        // os dois são a mesma escolha. Ver sendOrcamentoCliente.
        linkPainel,
        // Só chegam preenchidos no modo `carta`.
        mensagem,
        assinaturaDataUrl,
        // ⚠️ O MODO VAI JUNTO PORQUE ELE ESCOLHE O FORMATO, não só o conteúdo
        // (27/08/2026). `carta` sai como carta mesmo — texto e assinatura, e
        // nada em volta. Sem modo (cliente com JS em cache), o serviço cai no
        // estruturado, que é o que esse cliente já recebia.
        modo: modo || null,
      });
    } catch (errEnvio) {
      // `resendCode` vem do helper `_enviar` em services/email.js. É ele que
      // diz o que fazer: cota, limite de taxa, domínio não verificado, anexo
      // grande demais. Linha compacta e greppável, para achar no log do
      // Railway sem precisar do stack.
      console.error(
        `[email-orcamento] FALHA=envio orcamento=${id} code=${errEnvio.resendCode || "?"} ` +
        `destinos=${to.length} anexo_kb=${pdfBuffer ? Math.round(pdfBuffer.length / 1024) : 0} link=${linkPainel ? "sim" : "nao"} motivo=${errEnvio.message}`
      );
      return res.status(500).json({ error: errEnvio.message, etapa: "envio", code: errEnvio.resendCode || null });
    }

    const enviadoPara = to.join(", ");
    console.log(
      `[email-orcamento] OK orcamento=${id} destinos=${to.length} ` +
      `anexo_kb=${pdfBuffer ? Math.round(pdfBuffer.length / 1024) : 0} link=${linkPainel ? "sim" : "nao"}`
    );
    const upd = await pool.query(
      `UPDATE orcamentos
         SET status = 'enviado', enviado_em = now(), enviado_para = $2
       WHERE id = $1
       RETURNING enviado_em`,
      [id, enviadoPara]
    );

    // `link_painel`/`anexo` contam à tela o que de fato foi enviado. O front
    // não tem como saber sozinho: a existência do link depende de o condomínio
    // ter usuário com login, que é consulta de servidor.
    return res.json({
      ok: true,
      enviado_para: enviadoPara,
      enviado_em: upd.rows[0]?.enviado_em,
      link_painel: Boolean(linkPainel),
      anexo: Boolean(pdfBuffer),
    });
  } catch (err) {
    console.error("[admin] POST /orcamentos/avulsos/:id/enviar-email:", err);
    return res.status(500).json({ error: err.message || "Erro ao enviar e-mail" });
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
                  o.valor,
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
// `email` entra aqui porque o modal de orçamento mostra o destinatário do
// envio ANTES do clique, e precisa atualizá-lo quando o operador troca o
// condomínio no select — sem isso só daria pra saber depois de salvar.
router.get("/condominios/lista", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, COALESCE(NULLIF(nome_fantasia,''), nome) AS nome, email
         FROM condominios WHERE ativo = true ORDER BY nome ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao listar condomínios" });
  }
});

module.exports = { adminRouter: router };