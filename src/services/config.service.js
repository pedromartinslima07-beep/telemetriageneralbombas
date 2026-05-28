const { pool } = require("../db");

// Cache em memória: configs mudam raramente, vamos evitar query por request.
// Invalidado quando setConfig() é chamado.
let _cache = null;
let _cacheLoadedAt = 0;
const _TTL_MS = 30_000; // 30s — se o admin editar, próxima leitura vê o valor novo

async function _carregar() {
  const r = await pool.query("SELECT chave, valor FROM configuracoes");
  _cache = {};
  r.rows.forEach(row => { _cache[row.chave] = row.valor; });
  _cacheLoadedAt = Date.now();
}

async function _garantirCache() {
  if (!_cache || Date.now() - _cacheLoadedAt > _TTL_MS) {
    await _carregar();
  }
}

// Whitelist das chaves editáveis e seus tipos (validação do PATCH)
const CHAVES = {
  "ia.enabled":                  { tipo: "boolean" },
  "ia.modelo":                   { tipo: "enum", opcoes: ["gpt-4o-mini", "gpt-4o"] },
  "ia.system_prompt":            { tipo: "string", maxLen: 16000 },
  "alertas.email_destinatario":  { tipo: "string", maxLen: 500 }, // múltiplos emails separados por vírgula
  "jobs.offline_intervalo_min":  { tipo: "int", min: 1, max: 60 },
  "gps.retencao_horas":          { tipo: "int", min: 1, max: 720 }, // Fase 7F — 1h a 30 dias
  "gps.frequencia_segundos":     { tipo: "int", min: 30, max: 300 }, // Fase 7I — app pinga GPS a cada N segundos (default 60)
  "leituras.retencao_dias":      { tipo: "int", min: 7, max: 3650 }, // Fase 9C — 7 dias a 10 anos (default 60)
  "leituras.cleanup_dry_run":    { tipo: "boolean" }, // se "true", só conta sem deletar (verificação inicial)
  "alertas.retencao_dias":       { tipo: "int", min: 30, max: 3650 }, // Fase 9E — alertas resolvidos (default 365)
  "alertas.cleanup_dry_run":     { tipo: "boolean" },
  "conversas.retencao_dias":     { tipo: "int", min: 30, max: 3650 }, // Fase 9E — conversas WhatsApp fechadas (default 365)
  "conversas.cleanup_dry_run":   { tipo: "boolean" },
  "chamados.alerta_atraso_horas":   { tipo: "int", min: 1, max: 24 }, // Fase 7I — chamado em_atendimento sem fechar (default 4)
  "chamados.alerta_atraso_enabled": { tipo: "boolean" }, // Fase 7I — liga/desliga o alerta por email
  "planos.geracao_enabled":         { tipo: "boolean" }, // gera chamado P4 automático quando plano de manutenção vence (default true)
  "whatsapp.sessao_timeout_horas":  { tipo: "int", min: 1, max: 72 }, // inatividade que encerra a sessão e abre nova na próxima msg (default 8h)
};

function chaveValida(chave) {
  return Object.prototype.hasOwnProperty.call(CHAVES, chave);
}

function validarValor(chave, valor) {
  const def = CHAVES[chave];
  if (!def) return { ok: false, erro: "chave desconhecida" };

  if (def.tipo === "boolean") {
    if (valor !== "true" && valor !== "false") return { ok: false, erro: "deve ser 'true' ou 'false'" };
  } else if (def.tipo === "enum") {
    if (!def.opcoes.includes(valor)) return { ok: false, erro: `deve ser um de: ${def.opcoes.join(", ")}` };
  } else if (def.tipo === "string") {
    if (typeof valor !== "string") return { ok: false, erro: "deve ser string" };
    if (def.maxLen && valor.length > def.maxLen) return { ok: false, erro: `máximo ${def.maxLen} caracteres` };
  } else if (def.tipo === "int") {
    const n = Number(valor);
    if (!Number.isInteger(n)) return { ok: false, erro: "deve ser inteiro" };
    if (def.min != null && n < def.min) return { ok: false, erro: `mínimo ${def.min}` };
    if (def.max != null && n > def.max) return { ok: false, erro: `máximo ${def.max}` };
  }
  return { ok: true };
}

// Lê uma chave. Aceita fallback para quando ainda não foi setada.
async function getConfig(chave, fallback = null) {
  await _garantirCache();
  const v = _cache[chave];
  return v == null || v === "" ? fallback : v;
}

// Versão boolean — converte 'true'/'false' (string) em boolean real
async function getConfigBool(chave, fallback = false) {
  const v = await getConfig(chave, null);
  if (v == null) return fallback;
  return v === "true";
}

async function getConfigInt(chave, fallback = 0) {
  const v = await getConfig(chave, null);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Lê todas as chaves whitelistadas (pra GET /admin/configuracoes)
async function getAllConfigs() {
  await _garantirCache();
  const out = {};
  Object.keys(CHAVES).forEach(k => { out[k] = _cache[k] ?? ""; });
  return out;
}

// Atualiza chave. Invalida cache.
async function setConfig(chave, valor, usuarioId = null) {
  if (!chaveValida(chave)) throw new Error("chave inválida");
  const val = validarValor(chave, valor);
  if (!val.ok) throw new Error(val.erro);

  await pool.query(
    `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (chave) DO UPDATE
       SET valor = EXCLUDED.valor,
           atualizado_em = NOW(),
           atualizado_por = EXCLUDED.atualizado_por`,
    [chave, valor, usuarioId]
  );
  _cache = null; // invalida
}

module.exports = {
  CHAVES,
  chaveValida,
  validarValor,
  getConfig,
  getConfigBool,
  getConfigInt,
  getAllConfigs,
  setConfig,
};
