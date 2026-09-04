const { pool } = require("../db");
const { processarComIA, _executarCriarOrcamento } = require("../services/ia.service");
const { enviarMensagem } = require("../services/evolution.service");
const { getConfigInt } = require("../services/config.service");
const { registrarCriacao } = require("../services/chamado-historico.service");

const _RE_CONFIRMACAO = /\b(sim|pode|ok|vai|certo|por favor|claro|confirmo|confirma|quero|preciso|abre|abrir|registra|registrar)\b/i;
const _RE_NEGACAO     = /\b(n[aã]o|cancel|deixa|ignora|esquece|desiste)\b/i;

// Executa a ação pendente quando o cliente confirma (backend como juiz final — P3)
async function _executarAcaoPendente(conversaId, pendente, telefone) {
  const { tipo, params } = pendente;

  if (tipo === "abrir_chamado") {
    const { condominio_id, titulo, descricao, prioridade, categoria } = params;

    // Guard anti-duplicata: se já existe chamado aberto nesta conversa, não cria outro.
    const dup = await pool.query(
      `SELECT id FROM chamados WHERE conversa_id = $1 AND status NOT IN ('fechado', 'cancelado') LIMIT 1`,
      [conversaId]
    );
    if (dup.rows.length) {
      await pool.query(
        `UPDATE conversas_whatsapp SET pendente_acao = NULL, estado_conversa = 'chamado_aberto' WHERE id = $1`,
        [conversaId]
      );
      console.log(`[whatsapp] duplicata bloqueada: chamado ${dup.rows[0].id} já existe para conversa ${conversaId}`);
      return;
    }

    let descricaoFinal = descricao;
    if (condominio_id) {
      try {
        const tel = await pool.query(
          `SELECT r.nome, l.nivel_pct, l.bomba_ligada
             FROM reservatorios r
             LEFT JOIN LATERAL (
               SELECT nivel_pct, bomba_ligada FROM leituras
                WHERE device_id = r.device_id ORDER BY criado_em DESC LIMIT 1
             ) l ON true
            WHERE r.condominio_id = $1`,
          [condominio_id]
        );
        if (tel.rows.length) {
          const linhas = tel.rows.map(t =>
            `• ${t.nome}: ${t.nivel_pct != null ? t.nivel_pct + "%" : "N/D"} | Bomba: ${t.bomba_ligada ? "LIGADA" : "DESLIGADA"}`
          );
          descricaoFinal += `\n\n📊 Telemetria no momento da abertura:\n${linhas.join("\n")}`;
        }
      } catch (_) {}
    }

    const r = await pool.query(
      `INSERT INTO chamados (conversa_id, condominio_id, titulo, descricao, prioridade, categoria)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [conversaId, condominio_id || null, titulo, descricaoFinal, prioridade, categoria || "outro"]
    );
    registrarCriacao({ chamadoId: r.rows[0].id, alteradoPor: null });

    await pool.query(
      `UPDATE conversas_whatsapp
          SET pendente_acao   = NULL,
              estado_conversa = 'chamado_aberto',
              ia_sem_avanco   = 0
        WHERE id = $1`,
      [conversaId]
    );

    const msg = `Chamado registrado! Nossa equipe vai entrar em contato em breve. Número: CH-${String(r.rows[0].id).padStart(4, "0")}.`;
    await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1, 'saida', 'text', $2)`,
      [conversaId, msg]
    );
    await enviarMensagem(telefone, msg);
    console.log(`[whatsapp] ação pendente executada: chamado CH-${r.rows[0].id} aberto`);

  } else if (tipo === "criar_solicitacao_orcamento") {
    const resultado = await _executarCriarOrcamento(params);
    await pool.query(
      `UPDATE conversas_whatsapp
          SET pendente_acao   = NULL,
              estado_conversa = 'triagem',
              ia_sem_avanco   = 0
        WHERE id = $1`,
      [conversaId]
    );
    const msg = `Pedido de orçamento registrado! Nossa equipe comercial vai entrar em contato com uma proposta. Número: ${resultado.numero}.`;
    await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1, 'saida', 'text', $2)`,
      [conversaId, msg]
    );
    await enviarMensagem(telefone, msg);
    console.log(`[whatsapp] ação pendente executada: orçamento ${resultado.numero} criado`);
  }
}

// GET /whatsapp/webhook — verificação do webhook pela Meta
// A Meta envia hub.verify_token que deve bater com WHATSAPP_VERIFY_TOKEN
function verificarWebhook(req, res) {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[whatsapp] webhook verificado pela Meta");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

// Extrai mensagens do payload da Meta (pode vir em lote)
function _extrairMensagens(payload) {
  const mensagens = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      for (const msg of value?.messages || []) {
        mensagens.push({
          telefone:    msg.from,
          messageId:   msg.id,
          tipo:        msg.type,                          // text | image | audio | document | video
          conteudo:    msg.text?.body || null,
          nomeContato: value.contacts?.[0]?.profile?.name || null,
        });
      }
    }
  }
  return mensagens;
}

async function processarMensagem(msg) {
  try {
    const { telefone, messageId, tipo, conteudo, nomeContato } = msg;
    if (!telefone) return;

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

    // Captura avaliação pendente (resposta 1-4 após fechamento por timeout)
    if (conteudo && /^[1-4]$/.test(conteudo.trim())) {
      const MAPA = { "1": "excelente", "2": "boa", "3": "aceitavel", "4": "ruim" };
      const pendente = await pool.query(
        `SELECT id FROM conversas_whatsapp
         WHERE cliente_whatsapp_id = $1 AND aguardando_avaliacao = TRUE
         ORDER BY fechado_em DESC LIMIT 1`,
        [clienteId]
      );
      if (pendente.rows.length > 0) {
        const qualidade = MAPA[conteudo.trim()];
        await pool.query(
          `UPDATE conversas_whatsapp
              SET qualidade_atendimento = $1,
                  qualidade_avaliada_em = NOW(),
                  aguardando_avaliacao  = FALSE
            WHERE id = $2`,
          [qualidade, pendente.rows[0].id]
        );
        await enviarMensagem(telefone, "Obrigado pela avaliação! Se precisar de mais alguma coisa, é só chamar.");
        console.log(`[whatsapp] avaliação "${qualidade}" salva na conversa ${pendente.rows[0].id}`);
        return;
      }
    }

    // Limpa flag de avaliação pendente se cliente mandou outra coisa
    await pool.query(
      `UPDATE conversas_whatsapp SET aguardando_avaliacao = FALSE
       WHERE cliente_whatsapp_id = $1 AND aguardando_avaliacao = TRUE`,
      [clienteId]
    );

    // Busca conversa aberta dentro do timeout de sessão
    const timeoutHoras = await getConfigInt("whatsapp.sessao_timeout_horas", 8);
    const conversaExistente = await pool.query(
      `SELECT cw.id FROM conversas_whatsapp cw
       WHERE cw.cliente_whatsapp_id = $1
         AND cw.status IN ('aberta','em_atendimento')
         AND NOT (cw.aguardando_atendente = TRUE AND cw.assumida_por_id IS NULL)
         AND COALESCE(
           (SELECT MAX(m.criado_em) FROM mensagens_whatsapp m WHERE m.conversa_id = cw.id),
           cw.criado_em
         ) > NOW() - make_interval(hours => $2)
       ORDER BY cw.criado_em DESC LIMIT 1`,
      [clienteId, timeoutHoras]
    );

    let conversaId;
    if (conversaExistente.rows.length > 0) {
      conversaId = conversaExistente.rows[0].id;
    } else {
      const nova = await pool.query(
        `INSERT INTO conversas_whatsapp (cliente_whatsapp_id) VALUES ($1) RETURNING id`,
        [clienteId]
      );
      conversaId = nova.rows[0].id;
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
    if (tipo !== "text") return;
    if (!conteudo || conteudo.trim().split(/\s+/).length < 2) return;

    // Checa estado da conversa (assumida, aguardando atendente, ação pendente)
    const convRes = await pool.query(
      `SELECT assumida_por_id, aguardando_atendente, estado_conversa, pendente_acao
         FROM conversas_whatsapp WHERE id = $1`,
      [conversaId]
    );
    const convData = convRes.rows[0] || {};

    if (convData.assumida_por_id) {
      console.log(`[whatsapp] conversa ${conversaId} assumida por humano — IA não responde`);
      return;
    }
    if (convData.aguardando_atendente) {
      console.log(`[whatsapp] conversa ${conversaId} aguardando atendente — IA não responde`);
      return;
    }

    // State machine: ação pendente aguardando confirmação do cliente (Prioridade 3)
    if (convData.estado_conversa === "aguardando_confirmacao" && convData.pendente_acao) {
      if (_RE_CONFIRMACAO.test(conteudo)) {
        await _executarAcaoPendente(conversaId, convData.pendente_acao, telefone);
        return;
      }
      if (_RE_NEGACAO.test(conteudo)) {
        await pool.query(
          `UPDATE conversas_whatsapp SET pendente_acao = NULL, estado_conversa = 'triagem' WHERE id = $1`,
          [conversaId]
        );
        const msg = "Tudo bem, não vou abrir o chamado. Se precisar de mais alguma coisa, é só falar.";
        await pool.query(
          `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1, 'saida', 'text', $2)`,
          [conversaId, msg]
        );
        await enviarMensagem(telefone, msg);
        return;
      }
      // Cliente mandou outra coisa — deixa a IA responder mantendo o estado
    }

    // Busca histórico + contexto do contato
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

    const resultado = await processarComIA({
      conversa_id:         conversaId,
      condominio_id:       ctx.condominio_id ?? null,
      condominio_nome:     ctx.condominio_nome ?? null,
      cliente_whatsapp_id: clienteId,
      contato_nome:        ctx.nome ?? null,
      contato_tipo:        ctx.tipo ?? "desconhecido",
      contato_observacoes: ctx.observacoes ?? null,
      historico:           historicoRes.rows,
    });

    if (!resultado) return;
    const { resposta: respostaIA, progresso } = resultado;
    if (!respostaIA) return;

    // Anti-loop: sem progresso incrementa contador; com progresso reseta.
    // Ao atingir 3 trocas sem avanço → escalação automática para humano.
    if (progresso) {
      await pool.query(
        `UPDATE conversas_whatsapp SET ia_sem_avanco = 0 WHERE id = $1`,
        [conversaId]
      );
    } else {
      const upd = await pool.query(
        `UPDATE conversas_whatsapp
            SET ia_sem_avanco = ia_sem_avanco + 1
          WHERE id = $1
          RETURNING ia_sem_avanco`,
        [conversaId]
      );
      if ((upd.rows[0]?.ia_sem_avanco ?? 0) >= 3) {
        const msgEscalacao = "Vou encaminhar você para um de nossos atendentes para que possam te ajudar melhor.";
        await pool.query(
          `UPDATE conversas_whatsapp SET aguardando_atendente = TRUE, ia_sem_avanco = 0 WHERE id = $1`,
          [conversaId]
        );
        await pool.query(
          `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
           VALUES ($1, 'saida', 'text', $2)`,
          [conversaId, msgEscalacao]
        );
        await enviarMensagem(telefone, msgEscalacao);
        console.log(`[whatsapp] anti-loop: conversa ${conversaId} escalada após 3 trocas sem progresso`);
        return;
      }
    }

    await pool.query(
      `INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo)
       VALUES ($1, 'saida', 'text', $2)`,
      [conversaId, respostaIA]
    );

    await enviarMensagem(telefone, respostaIA);

  } catch (err) {
    console.error("[whatsapp] erro ao processar mensagem:", err);
  }
}

// POST /whatsapp/webhook — recebe eventos da Meta
async function receberWebhook(req, res) {
  // Meta exige 200 imediato, senão reenvia
  res.sendStatus(200);

  const mensagens = _extrairMensagens(req.body);
  for (const msg of mensagens) {
    setImmediate(() => processarMensagem(msg));
  }
}

module.exports = { receberWebhook, verificarWebhook };
