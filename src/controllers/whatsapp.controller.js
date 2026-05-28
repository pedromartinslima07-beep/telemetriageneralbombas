const { pool } = require("../db");
const { processarComIA } = require("../services/ia.service");
const { enviarMensagem } = require("../services/evolution.service");

const WEBHOOK_TOKEN = process.env.EVOLUTION_WEBHOOK_TOKEN;
const _isProd = process.env.NODE_ENV === "production";

if (_isProd && !WEBHOOK_TOKEN) {
  console.error("FATAL: EVOLUTION_WEBHOOK_TOKEN não definido em produção. Webhook ficaria aberto.");
  process.exit(1);
}

function extrairTelefone(remoteJid) {
  // "5511999998888@s.whatsapp.net" → "5511999998888"
  return remoteJid.split("@")[0];
}

function extrairTexto(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    null
  );
}

async function processarMensagem(payload) {
  try {
    const { event, data } = payload;

    if (event !== "messages.upsert") return;
    if (data?.key?.fromMe) return;

    const remoteJid = data?.key?.remoteJid;
    if (!remoteJid || remoteJid.includes("@g.us")) return; // ignora grupos

    const telefone = extrairTelefone(remoteJid);
    const messageId = data?.key?.id;
    const tipo = data?.messageType || "text";
    const conteudo = extrairTexto(data?.message);
    const nomeContato = data?.pushName || null;

    // Cria ou atualiza cliente
    const clienteResult = await pool.query(
      `INSERT INTO clientes_whatsapp (telefone, nome)
       VALUES ($1, $2)
       ON CONFLICT (telefone)
       DO UPDATE SET nome = COALESCE(EXCLUDED.nome, clientes_whatsapp.nome)
       RETURNING id`,
      [telefone, nomeContato]
    );
    const clienteId = clienteResult.rows[0].id;

    // Busca conversa aberta ou cria uma nova
    const conversaExistente = await pool.query(
      `SELECT id FROM conversas_whatsapp
       WHERE cliente_whatsapp_id = $1 AND status IN ('aberta','em_atendimento')
       ORDER BY criado_em DESC LIMIT 1`,
      [clienteId]
    );

    let conversaId;
    if (conversaExistente.rows.length > 0) {
      conversaId = conversaExistente.rows[0].id;
    } else {
      const novaConversa = await pool.query(
        `INSERT INTO conversas_whatsapp (cliente_whatsapp_id) VALUES ($1) RETURNING id`,
        [clienteId]
      );
      conversaId = novaConversa.rows[0].id;
    }

    // Salva mensagem — ON CONFLICT garante idempotência
    await pool.query(
      `INSERT INTO mensagens_whatsapp
         (conversa_id, evolution_message_id, direcao, tipo, conteudo)
       VALUES ($1, $2, 'entrada', $3, $4)
       ON CONFLICT (evolution_message_id) DO NOTHING`,
      [conversaId, messageId, tipo, conteudo]
    );

    console.log(`[whatsapp] ${telefone} → conversa ${conversaId} | tipo: ${tipo}`);

    // Só processa texto com IA
    if (tipo !== "conversation" && tipo !== "extendedTextMessage") return;
    if (!conteudo || conteudo.trim().split(/\s+/).length < 2) return; // ignora mensagens triviais

    // Se um atendente humano assumiu essa conversa, a IA fica em silêncio.
    // A mensagem já foi salva acima — só não respondemos automaticamente.
    const assumidaRes = await pool.query(
      `SELECT assumida_por_id FROM conversas_whatsapp WHERE id = $1`,
      [conversaId]
    );
    if (assumidaRes.rows[0]?.assumida_por_id) {
      console.log(`[whatsapp] conversa ${conversaId} assumida por humano — IA não responde`);
      return;
    }

    // Busca histórico da conversa + contexto do contato (nome cadastrado, tipo,
    // condomínio vinculado, observações). Permite a IA já entrar sabendo quem é.
    const [historicoRes, clienteRes] = await Promise.all([
      pool.query(
        `SELECT direcao, conteudo FROM mensagens_whatsapp
         WHERE conversa_id = $1 ORDER BY criado_em ASC LIMIT 20`,
        [conversaId]
      ),
      pool.query(
        `SELECT cw.nome, cw.condominio_id, cw.tipo, cw.observacoes,
                c.nome AS condominio_nome
           FROM clientes_whatsapp cw
           LEFT JOIN condominios c ON c.id = cw.condominio_id
          WHERE cw.id = $1`,
        [clienteId]
      ),
    ]);

    const ctx = clienteRes.rows[0] || {};
    const historico = historicoRes.rows;

    const respostaIA = await processarComIA({
      conversa_id:           conversaId,
      condominio_id:         ctx.condominio_id ?? null,
      condominio_nome:       ctx.condominio_nome ?? null,
      cliente_whatsapp_id:   clienteId,
      contato_nome:          ctx.nome ?? null,
      contato_tipo:          ctx.tipo ?? "desconhecido",
      contato_observacoes:   ctx.observacoes ?? null,
      historico,
    });

    if (!respostaIA) return;

    // Salva resposta da IA no banco
    await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
       VALUES ($1, 'saida', 'text', $2)`,
      [conversaId, respostaIA]
    );

    // Envia resposta via Evolution API
    await enviarMensagem(telefone, respostaIA);

  } catch (err) {
    console.error("[whatsapp] erro ao processar mensagem:", err);
  }
}

async function receberWebhook(req, res) {
  // Em prod, token é obrigatório (checagem no boot). Em dev, valida só se setado.
  if (WEBHOOK_TOKEN && req.headers["apikey"] !== WEBHOOK_TOKEN) {
    return res.sendStatus(401);
  }

  res.sendStatus(200);                              // responde antes de processar
  setImmediate(() => processarMensagem(req.body));  // processa em background
}

module.exports = { receberWebhook };
