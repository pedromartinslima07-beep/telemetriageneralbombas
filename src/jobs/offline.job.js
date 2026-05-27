// src/jobs/offline.job.js
const { pool } = require("../db");
const { upsertAlertaAberto } = require("../services/alertas.service");
const { enviarMensagem } = require("../services/evolution.service");
const { sendAlertaEmail } = require("../services/email");
const { OFFLINE_MINUTES } = require("../config");
const { getConfigInt } = require("../services/config.service");
const { registrarCriacao } = require("../services/chamado-historico.service");

async function _notificarClienteWhatsApp(condominio_id, mensagem) {
  // Busca cliente + conversa aberta do condomínio
  const r = await pool.query(
    `SELECT cw.telefone, cw.id AS cliente_id,
            (SELECT id FROM conversas_whatsapp
             WHERE cliente_whatsapp_id = cw.id AND status IN ('aberta','em_atendimento')
             ORDER BY criado_em DESC LIMIT 1) AS conversa_id
     FROM clientes_whatsapp cw
     WHERE cw.condominio_id = $1
     LIMIT 1`,
    [condominio_id]
  );
  if (!r.rows.length || !r.rows[0].telefone) return;

  const { telefone, cliente_id, conversa_id } = r.rows[0];

  // Cria conversa nova se não houver aberta
  let convId = conversa_id;
  if (!convId) {
    const nova = await pool.query(
      `INSERT INTO conversas_whatsapp (cliente_whatsapp_id) VALUES ($1) RETURNING id`,
      [cliente_id]
    );
    convId = nova.rows[0].id;
  }

  // Salva mensagem de saída
  await pool.query(
    `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
     VALUES ($1, 'saida', 'text', $2)`,
    [convId, mensagem]
  );

  // Envia via Evolution API (não bloqueia em caso de falha)
  try { await enviarMensagem(telefone, mensagem); } catch (_) {}
}

async function _abrirChamadoAuto(condominio_id, titulo, descricao, prioridade, categoria) {
  // Evita abrir chamado duplicado para o mesmo condomínio+categoria se já houver um aberto
  const existente = await pool.query(
    `SELECT id FROM chamados
     WHERE condominio_id = $1 AND categoria = $2 AND status != 'fechado'
     LIMIT 1`,
    [condominio_id, categoria]
  );
  if (existente.rows.length > 0) return existente.rows[0].id;

  const result = await pool.query(
    `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [condominio_id, titulo, descricao, prioridade, categoria]
  );
  // Audit log: criado pelo job (alteradoPor=null = sistema)
  registrarCriacao({ chamadoId: result.rows[0].id, alteradoPor: null });
  return result.rows[0].id;
}

async function jobVerificarOffline() {
  const limiteMinutos = OFFLINE_MINUTES;

  const res = await pool.query(
    `SELECT r.id, r.nome, r.tipo, r.device_id, r.last_seen, r.condominio_id,
       c.nome AS condominio_nome,
       FLOOR(EXTRACT(EPOCH FROM (NOW() - r.last_seen)) / 60)::int AS minutos_sem_atualizar
     FROM reservatorios r
     LEFT JOIN condominios c ON c.id = r.condominio_id
     ORDER BY r.id ASC`
  );

  let criados = 0;
  let ja_existia = 0;
  let ignorados_sem_leitura = 0;

  for (const r of res.rows) {
    if (!r.last_seen) { ignorados_sem_leitura++; continue; }
    if (r.minutos_sem_atualizar <= limiteMinutos) continue;

    const nomeRes = r.nome || "Reservatório";
    const tipoRes = r.tipo ? ` (${r.tipo})` : "";
    const mensagemAlerta = `${nomeRes}${tipoRes} (${r.device_id}) está OFFLINE há ${r.minutos_sem_atualizar} minutos`;

    const resultado = await upsertAlertaAberto(r.device_id, "dispositivo_offline", mensagemAlerta);

    if (resultado.action === "inserted") {
      criados++;

      // Alerta novo: abre chamado e notifica cliente via WhatsApp
      if (r.condominio_id) {
        const titulo = `[AUTO] Dispositivo offline: ${nomeRes}${tipoRes}`;
        const descricao = `Alerta automático — ${mensagemAlerta}`;
        try {
          await _abrirChamadoAuto(r.condominio_id, titulo, descricao, 'p2', 'bomba_falha');
        } catch (e) {
          console.error("[offline.job] erro ao abrir chamado automático:", e.message);
        }

        const msgWA = `🚨 *Alerta automático — ${r.condominio_nome || "seu condomínio"}*\n\n` +
          `O ${nomeRes}${tipoRes} está offline há ${r.minutos_sem_atualizar} minutos.\n` +
          `Um chamado de atendimento foi aberto automaticamente. Nossa equipe foi notificada.`;
        try {
          await _notificarClienteWhatsApp(r.condominio_id, msgWA);
        } catch (e) {
          console.error("[offline.job] erro ao notificar WhatsApp:", e.message);
        }
      }
    } else {
      ja_existia++;
    }
  }

  return { ok: true, limiteMinutos, criados, ja_existia, ignorados_sem_leitura };
}

let _jobRunning = false;
let _ultimaExecucao = null;
let _ultimoResultado = null;

function getOfflineJobStatus() {
  return { ultima_execucao: _ultimaExecucao, ultimo_resultado: _ultimoResultado };
}

// Scheduler com auto-ajuste do intervalo via config 'jobs.offline_intervalo_min'.
// Em vez de setInterval fixo, usa setTimeout recursivo que lê a config a cada tick.
function startOfflineScheduler() {
  async function tick() {
    if (_jobRunning) return scheduleProximo();
    _jobRunning = true;
    try {
      _ultimoResultado = await jobVerificarOffline();
      _ultimaExecucao = new Date().toISOString();
      console.log("🛰️ Job OFFLINE automático:", _ultimoResultado);
    } catch (e) {
      console.error("❌ Job OFFLINE automático falhou:", e);
    } finally {
      _jobRunning = false;
      scheduleProximo();
    }
  }
  async function scheduleProximo() {
    const minutos = await getConfigInt("jobs.offline_intervalo_min", 1);
    setTimeout(tick, Math.max(1, minutos) * 60_000);
  }
  // Primeira execução imediata, depois agenda pela config
  tick();
}

module.exports = { jobVerificarOffline, startOfflineScheduler, getOfflineJobStatus };