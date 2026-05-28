const { pool } = require("../db");
const { getConfigInt } = require("../services/config.service");
const { enviarMensagem } = require("../services/evolution.service");

const INTERVALO_MS = 15 * 60 * 1000; // verifica a cada 15 minutos

const MSG_AVALIACAO =
  "Seu atendimento foi encerrado automaticamente por inatividade.\n\n" +
  "Como você avalia o atendimento que recebeu?\n\n" +
  "1 — Ótimo\n2 — Bom\n3 — Regular\n4 — Ruim\n\n" +
  "Responda apenas com o número.";

let _lastRun = null;
let _lastResult = null;

async function jobFecharConversasInativas() {
  const horas = await getConfigInt("whatsapp.sessao_timeout_horas", 8);

  // Só fecha conversas onde nenhum humano assumiu.
  // Só pede avaliação quando a IA respondeu pelo menos uma vez (direcao='saida').
  const r = await pool.query(
    `UPDATE conversas_whatsapp cw
        SET status             = 'fechada',
            fechado_em         = NOW(),
            estado_conversa    = 'finalizado',
            aguardando_avaliacao = EXISTS (
              SELECT 1 FROM mensagens_whatsapp
              WHERE conversa_id = cw.id AND direcao = 'saida'
            )
      WHERE cw.status IN ('aberta', 'em_atendimento')
        AND cw.assumida_por_id IS NULL
        AND COALESCE(
          (SELECT MAX(m.criado_em) FROM mensagens_whatsapp m WHERE m.conversa_id = cw.id),
          cw.criado_em
        ) < NOW() - make_interval(hours => $1)
      RETURNING cw.id, cw.cliente_whatsapp_id, cw.aguardando_avaliacao`,
    [horas]
  );

  if (r.rowCount === 0) return { fechadas: 0, avaliacoes_enviadas: 0, timeout_horas: horas };

  // Envia mensagem de avaliação para cada conversa onde a IA respondeu
  let avaliacoes = 0;
  for (const row of r.rows) {
    if (!row.aguardando_avaliacao) continue;
    try {
      const cRes = await pool.query(
        `SELECT telefone FROM clientes_whatsapp WHERE id = $1`,
        [row.cliente_whatsapp_id]
      );
      const telefone = cRes.rows[0]?.telefone;
      if (telefone) {
        await enviarMensagem(telefone, MSG_AVALIACAO);
        avaliacoes++;
      }
    } catch (_) {
      // Evolution API não configurada ou indisponível — falha silenciosa
    }
  }

  return { fechadas: r.rowCount, avaliacoes_enviadas: avaliacoes, timeout_horas: horas };
}

async function _tick() {
  try {
    _lastRun = new Date().toISOString();
    _lastResult = await jobFecharConversasInativas();
    if (_lastResult.fechadas > 0) {
      console.log(
        `[conversas-timeout] ${_lastResult.fechadas} conversa(s) fechada(s) por inatividade` +
        ` (>${_lastResult.timeout_horas}h), ${_lastResult.avaliacoes_enviadas} avaliação(ões) enviada(s)`
      );
    }
  } catch (err) {
    console.error("[conversas-timeout] erro:", err.message);
    _lastResult = { erro: err.message };
  }
  setTimeout(_tick, INTERVALO_MS);
}

function startConversasTimeoutScheduler() {
  setTimeout(_tick, 25 * 60 * 1000);
  console.log("[conversas-timeout] agendado (primeira execução em 25min, depois a cada 15min)");
}

function getConversasTimeoutJobStatus() {
  return { lastRun: _lastRun, lastResult: _lastResult };
}

module.exports = { startConversasTimeoutScheduler, getConversasTimeoutJobStatus };
