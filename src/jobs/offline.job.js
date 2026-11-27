// src/jobs/offline.job.js
const { pool } = require("../db");
const { upsertAlertaAberto } = require("../services/alertas.service");
const { enviarMensagem, enviarTemplate } = require("../services/evolution.service");
const { sendAlertaEmail } = require("../services/email");
const { OFFLINE_MINUTES } = require("../config");
const { getConfigInt } = require("../services/config.service");
const { abrirChamadoAuto } = require("../services/chamados.service");

// ⚠️ A JANELA DE 24 HORAS DA META. Texto livre só chega a quem mandou
// mensagem ao número nas últimas 24h; para os outros a Meta recusa (131047) e
// só aceita MODELO aprovado. O aviso de sensor mudo saía sempre em texto livre,
// e o síndico que não falou com a gente ontem — quase todos — não recebia
// nada, enquanto a conversa no painel mostrava a mensagem como enviada.
//
// Agora: dentro das 24h, texto livre (como antes). Fora delas, o modelo de
// `WHATSAPP_TEMPLATE_SENSOR` (corpo com {{1}} = condomínio e {{2}} =
// reservatório; idioma em `WHATSAPP_TEMPLATE_IDIOMA`, padrão pt_BR). Sem
// modelo configurado, não manda — e diz no log —, porque gravar como enviada
// uma mensagem que a Meta vai recusar é pior que não mandar: o chamado e o
// e-mail de alerta continuam saindo. Ver docs/modulos/whatsapp-ia.md.
const JANELA_WHATSAPP_HORAS = 24;

async function _notificarClienteWhatsApp(condominio_id, mensagem, { condominioNome, reservatorioNome } = {}) {
  // Busca cliente + conversa aberta do condomínio + última fala DELE (a janela)
  const r = await pool.query(
    `SELECT cw.telefone, cw.id AS cliente_id,
            (SELECT id FROM conversas_whatsapp
             WHERE cliente_whatsapp_id = cw.id AND status IN ('aberta','em_atendimento')
             ORDER BY criado_em DESC LIMIT 1) AS conversa_id,
            (SELECT MAX(m.criado_em) FROM mensagens_whatsapp m
               JOIN conversas_whatsapp c2 ON c2.id = m.conversa_id
              WHERE c2.cliente_whatsapp_id = cw.id AND m.direcao = 'entrada') AS ultima_entrada
     FROM clientes_whatsapp cw
     WHERE cw.condominio_id = $1
     LIMIT 1`,
    [condominio_id]
  );
  if (!r.rows.length || !r.rows[0].telefone) return { enviado: false, motivo: "sem contato" };

  const { telefone, cliente_id, conversa_id, ultima_entrada } = r.rows[0];
  const dentroDaJanela = ultima_entrada
    && (Date.now() - new Date(ultima_entrada).getTime()) < JANELA_WHATSAPP_HORAS * 3600 * 1000;
  const modelo = String(process.env.WHATSAPP_TEMPLATE_SENSOR || "").trim();

  if (!dentroDaJanela && !modelo) {
    console.warn(`[offline.job] WhatsApp não enviado ao condomínio ${condominio_id}: fora da janela de 24h e sem WHATSAPP_TEMPLATE_SENSOR`);
    return { enviado: false, motivo: "fora da janela, sem modelo" };
  }

  // Envia (não bloqueia o job em caso de falha) e só então grava, com o que
  // de fato saiu: o painel não pode mostrar como enviada a que a Meta recusou.
  // ⚠️ A conversa nova também só nasce DEPOIS do envio aceito: criada antes,
  // cada aviso recusado (número ainda não registrado, sem cartão, Meta fora)
  // deixava uma conversa vazia na central (27/11/2026).
  let envio = null;
  try {
    envio = dentroDaJanela
      ? await enviarMensagem(telefone, mensagem)
      : await enviarTemplate(telefone, modelo, process.env.WHATSAPP_TEMPLATE_IDIOMA || "pt_BR",
          [condominioNome || "seu condomínio", reservatorioNome || "reservatório"]);
  } catch (e) {
    console.error("[offline.job] erro ao enviar WhatsApp:", e.message);
  }
  if (!envio?.ok) return { enviado: false, motivo: envio?.configurado === false ? "whatsapp não configurado" : "meta recusou ou falhou" };

  let convId = conversa_id;
  if (!convId) {
    const nova = await pool.query(
      `INSERT INTO conversas_whatsapp (cliente_whatsapp_id) VALUES ($1) RETURNING id`,
      [cliente_id]
    );
    convId = nova.rows[0].id;
  }

  await pool.query(
    `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
     VALUES ($1, 'saida', $2, $3)`,
    [convId, dentroDaJanela ? "text" : "template",
     dentroDaJanela ? mensagem : `[modelo ${modelo}] ${condominioNome || ""} · ${reservatorioNome || ""}`]
  );
  return { enviado: true, via: dentroDaJanela ? "texto" : "modelo" };
}

async function jobVerificarOffline() {
  const limiteMinutos = OFFLINE_MINUTES;

  const res = await pool.query(
    `SELECT r.id, r.nome, r.tipo, r.device_id, r.last_seen, r.condominio_id,
       COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
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
          await abrirChamadoAuto({
            condominio_id: r.condominio_id,
            titulo,
            descricao,
            prioridade: 'p2',
            categoria: 'bomba_falha',
          });
        } catch (e) {
          console.error("[offline.job] erro ao abrir chamado automático:", e.message);
        }

        const msgWA = `🚨 *Alerta automático — ${r.condominio_nome || "seu condomínio"}*\n\n` +
          `O ${nomeRes}${tipoRes} está offline há ${r.minutos_sem_atualizar} minutos.\n` +
          `Um chamado de atendimento foi aberto automaticamente. Nossa equipe foi notificada.`;
        try {
          await _notificarClienteWhatsApp(r.condominio_id, msgWA,
            { condominioNome: r.condominio_nome, reservatorioNome: `${nomeRes}${tipoRes}` });
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

// Intervalo usado no boot e sempre que a config não puder ser lida.
const INTERVALO_PADRAO_MIN = 1;

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
  // ⚠️ Este é o único ponto async do job que roda FORA da proteção do tick():
  // ele é chamado de dentro do `finally`, já com o try/catch encerrado. Sem o
  // try/catch daqui, uma falha na leitura da config vira unhandled rejection e
  // derruba o processo inteiro — aconteceu em 30/07/2026, quando a conexão com
  // o Postgres caiu ("Connection terminated due to connection timeout") e
  // levou o servidor junto.
  //
  // Falhar a leitura também não pode PARAR o job: sem chegar no setTimeout,
  // ele nunca mais reagenda e o sistema deixa de detectar dispositivo offline
  // silenciosamente. Por isso o setTimeout fica fora do try, com o intervalo
  // caindo no padrão quando a config não pôde ser lida.
  //
  // Os outros jobs (gps-cleanup, alertas-cleanup, etc.) não têm esse risco:
  // o scheduleProximo deles é síncrono, com intervalo fixo.
  async function scheduleProximo() {
    let minutos = INTERVALO_PADRAO_MIN;
    try {
      minutos = await getConfigInt("jobs.offline_intervalo_min", INTERVALO_PADRAO_MIN);
    } catch (e) {
      console.error(
        `❌ Job OFFLINE: falha ao ler o intervalo na config, seguindo com ${INTERVALO_PADRAO_MIN}min:`,
        e.message
      );
    }
    setTimeout(tick, Math.max(1, minutos) * 60_000);
  }
  // Primeira execução imediata, depois agenda pela config
  tick();
}

module.exports = { jobVerificarOffline, startOfflineScheduler, getOfflineJobStatus, _notificarClienteWhatsApp };