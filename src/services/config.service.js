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
  // Extravasamento (migration 106, docs/modulos/telemetria.md). Só vale para
  // reservatório com `altura_extravasor_m` cadastrada.
  "telemetria.extravasor_minutos":       { tipo: "int", min: 1, max: 120 }, // nível no ladrão por N min seguidos → alerta (default 10)
  "telemetria.extravasor_bomba_minutos": { tipo: "int", min: 1, max: 60 },  // no ladrão COM a bomba ligada por N min → alerta (default 3)
  "telemetria.extravasor_tolerancia_cm": { tipo: "int", min: 0, max: 20 },  // conta como "no ladrão" a partir de N cm abaixo dele (default 2)
  "telemetria.extravasor_histerese_cm":  { tipo: "int", min: 1, max: 30 },  // para sair, precisa descer mais N cm (default 3)
  "gps.retencao_horas":          { tipo: "int", min: 1, max: 720 }, // Fase 7F — 1h a 30 dias
  "omie.faturamento_intervalo_min": { tipo: "int", min: 15, max: 1440 }, // agenda: de quanto em quanto tempo copia o faturamento do Omie (default 60)
  // Avisos de cobrança por e-mail (migration 102, docs/modulos/cobranca-avisos.md).
  // O envio em si ainda exige COBRANCA_EMAIL=1 no servidor.
  "cobranca.avisos_automatico":  { tipo: "boolean" },                 // "true" = o job manda sozinho; senão espera aprovação na tela (default false)
  "cobranca.dias_antes":         { tipo: "int", min: 0, max: 15 },    // lembrete N dias antes do vencimento (default 3; 0 = não manda)
  "cobranca.atraso_1":           { tipo: "int", min: 0, max: 60 },    // primeira cobrança com N dias de atraso (default 3; 0 = não manda)
  "cobranca.atraso_2":           { tipo: "int", min: 0, max: 90 },    // segunda cobrança (default 10; 0 = não manda)
  "cobranca.avisos_intervalo_min": { tipo: "int", min: 10, max: 240 }, // de quanto em quanto tempo o job monta a fila (default 30)
  // Orçamento que vence (migration 103, docs/modulos/orcamentos-vencimento.md).
  // O lembrete em si ainda exige ORCAMENTO_LEMBRETE_EMAIL=1 no servidor.
  "orcamento.lembrete_dias":     { tipo: "int", min: 0, max: 30 },   // lembrete ao cliente N dias antes de vencer (default 5; 0 = não manda)
  "orcamento.apagar_dias":       { tipo: "int", min: 0, max: 3650 }, // apaga o vencido arquivado há N dias, com cópia na lixeira (default 90; 0 = não apaga)
  "orcamento.vencimento_intervalo_min": { tipo: "int", min: 10, max: 1440 }, // de quanto em quanto tempo o job roda (default 60)
  "omie.faturamento_dia":        { tipo: "int", min: 1, max: 28 },  // dia do mês em que o lote do faturamento é proposto (default 1; fim de semana/feriado passa ao próximo dia útil)
  "gps.frequencia_segundos":     { tipo: "int", min: 30, max: 300 }, // Fase 7I — app pinga GPS a cada N segundos (default 60)
  "gps.expediente_inicio":       { tipo: "int", min: 0, max: 23 },   // hora em que o GPS liga (default 8)
  "gps.expediente_fim":          { tipo: "int", min: 1, max: 24 },   // hora em que desliga (default 18; 0 e 24 = sem janela)
  "leituras.retencao_dias":      { tipo: "int", min: 7, max: 3650 }, // Fase 9C — 7 dias a 10 anos (default 60)
  "leituras.cleanup_dry_run":    { tipo: "boolean" }, // se "true", só conta sem deletar (verificação inicial)
  "alertas.retencao_dias":       { tipo: "int", min: 30, max: 3650 }, // Fase 9E — alertas resolvidos (default 365)
  "alertas.cleanup_dry_run":     { tipo: "boolean" },
  "conversas.retencao_dias":     { tipo: "int", min: 30, max: 3650 }, // Fase 9E — conversas WhatsApp fechadas (default 365)
  "conversas.cleanup_dry_run":   { tipo: "boolean" },
  "planos.geracao_enabled":         { tipo: "boolean" }, // gera chamado P4 automático quando plano de manutenção vence (default true)
  // Meta da equipe dentro do mês, não vencimento do prédio: "normalmente
  // fazemos todas antes do dia 10". Passar dela é sinal de ritmo, não de dívida
  // — o vermelho fica reservado para o mês que virou sem a visita.
  // ⚠️ Máximo 28: dia 29+ não existe em todo mês, e uma meta que some em
  // fevereiro é pior que meta nenhuma.
  "preventivas.dia_meta":           { tipo: "int", min: 1, max: 28 }, // default 10
  "planos.roteiro_antecedencia_dias": { tipo: "int", min: 0, max: 60 }, // janela do roteiro do técnico no app: planos vencendo em até N dias (default 7)
  "whatsapp.sessao_timeout_horas":  { tipo: "int", min: 1, max: 72 }, // inatividade que encerra a sessão e abre nova na próxima msg (default 8h)
  "whatsapp.sync_intervalo_min":    { tipo: "int", min: 5, max: 120 }, // ronda que refaz a sincronização da coexistência (default 15 min)
  "whatsapp.coexistencia_pausa_horas": { tipo: "int", min: 1, max: 72 }, // equipe respondeu pelo celular (eco): IA quieta na conversa por N horas, renovadas a cada eco (default 12h)
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
