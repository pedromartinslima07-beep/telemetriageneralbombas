// Conectar um número de WhatsApp pelo cadastro incorporado da Meta (Tech
// Provider), com ou sem coexistência. Migration 108.
//
// Depois que a janela da Meta termina no navegador:
//   1. o `code` (vale ~30 s) vira o token de negócio DA EMPRESA que conectou
//      (oauth/access_token com o id e o segredo do app);
//   2. sem phone_number_id (a coexistência às vezes não manda), acha o número
//      na WABA;
//   3. inscreve o app na WABA (`subscribed_apps`): sem isso o webhook nunca
//      recebe as mensagens daquele número;
//   4. número NOVO: `register` com um PIN nosso. Número em COEXISTÊNCIA (segue
//      no WhatsApp Business do celular): NÃO registra — a Meta manda pular — e
//      pede a sincronização de contatos e de histórico. Ela tem de sair em
//      24 h, senão a Meta desconecta, e cada uma só pode ser pedida UMA vez;
//      a que falhar, a ronda (jobs/whatsapp-sync.job.js) refaz;
//   5. token e PIN vão cifrados para whatsapp_contas.
//
// Desenho e lições herdados do Petzu (petshop-bot, src/cadastro-whatsapp.js).
// Nada daqui escreve token, code ou a URL da troca no log.
const crypto = require("crypto");
const { pool } = require("../db");
const { graph } = require("./evolution.service");
const { cifrar, decifrar, cofreConfigurado } = require("./whatsapp-cofre.service");

const PRAZO_SYNC_MS = 24 * 60 * 60 * 1000;
const TENTATIVAS_SYNC = 5;
const SYNCS = [["sync_contatos_em", "smb_app_state_sync"], ["sync_historico_em", "history"]];

class ErroCadastro extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}

const _erroMeta = (r, oQue) =>
  `${oQue}: ${r?.json?.error?.message || `HTTP ${r?.http}`}`;

function _configuracaoFaltando() {
  const faltam = [];
  if (!process.env.WHATSAPP_APP_ID) faltam.push("WHATSAPP_APP_ID");
  if (!process.env.WHATSAPP_APP_SECRET) faltam.push("WHATSAPP_APP_SECRET");
  if (!cofreConfigurado()) faltam.push("WHATSAPP_TOKENS_CHAVE");
  return faltam;
}

// O que a tela precisa para abrir a janela da Meta (nada secreto).
function configuracaoPublica() {
  return {
    appId: process.env.WHATSAPP_APP_ID || null,
    configId: process.env.WHATSAPP_CADASTRO_CONFIG || null,
    graphVersao: require("./evolution.service").GRAPH_VERSAO,
    faltando: [..._configuracaoFaltando(), ...(process.env.WHATSAPP_CADASTRO_CONFIG ? [] : ["WHATSAPP_CADASTRO_CONFIG"])],
  };
}

async function _trocarCodigo(code) {
  const r = await graph("GET", "/oauth/access_token", {
    consulta: { client_id: process.env.WHATSAPP_APP_ID, client_secret: process.env.WHATSAPP_APP_SECRET, code },
  });
  if (!r.ok || !r.json?.access_token) throw new ErroCadastro(_erroMeta(r, "A Meta não aceitou o código"), 502);
  return r.json.access_token;
}

async function _numeroDaWaba(wabaId, token, phoneNumberId) {
  const r = await graph("GET", `/${wabaId}/phone_numbers`, {
    token, consulta: { fields: "id,display_phone_number,verified_name" },
  });
  if (!r.ok) throw new ErroCadastro(_erroMeta(r, "Não consegui ler os números da conta"), 502);
  const numeros = r.json?.data || [];
  const achado = phoneNumberId ? numeros.find((n) => String(n.id) === String(phoneNumberId)) : numeros[0];
  if (!achado) throw new ErroCadastro("A conta do WhatsApp conectada não tem esse número.", 400);
  return achado;
}

// Pede as sincronizações que faltam. Devolve { feitas: [...], erro }.
async function _sincronizar(conta, token) {
  const feitas = [];
  let erro = null;
  for (const [coluna, tipo] of SYNCS) {
    if (conta[coluna]) continue;
    const r = await graph("POST", `/${conta.phone_number_id}/smb_app_data`, {
      token, corpo: { messaging_product: "whatsapp", sync_type: tipo },
    }).catch((e) => ({ ok: false, json: { error: { message: e.message } } }));
    // "só uma vez": se a Meta disser que já foi feita, conta como feita.
    const jaFeita = /only perform this step once|already/i.test(r?.json?.error?.message || "");
    if (r.ok || jaFeita) {
      await pool.query(`UPDATE whatsapp_contas SET ${coluna} = NOW(), atualizado_em = NOW() WHERE id = $1`, [conta.id]);
      feitas.push(tipo);
    } else {
      erro = _erroMeta(r, `Sincronização ${tipo}`);
    }
  }
  await pool.query(
    `UPDATE whatsapp_contas
        SET sync_tentativas = sync_tentativas + 1, ultimo_erro = $2, atualizado_em = NOW()
      WHERE id = $1`,
    [conta.id, erro]
  );
  return { feitas, erro };
}

/**
 * dados: { code, wabaId, phoneNumberId?, coexistencia, padrao?, usuarioId }
 * Devolve a conta (sem segredo). Lança ErroCadastro com `status`.
 */
async function conectar({ code, wabaId, phoneNumberId, coexistencia, padrao = false, usuarioId = null }) {
  const faltam = _configuracaoFaltando();
  if (faltam.length) throw new ErroCadastro(`Falta configurar no servidor: ${faltam.join(", ")}`, 503);
  if (!code || !wabaId) throw new ErroCadastro("code e waba_id são obrigatórios");
  if (!/^\d+$/.test(String(wabaId)) || (phoneNumberId && !/^\d+$/.test(String(phoneNumberId)))) {
    throw new ErroCadastro("waba_id/phone_number_id inválidos");
  }
  coexistencia = !!coexistencia;

  const token = await _trocarCodigo(code);
  const numero = await _numeroDaWaba(wabaId, token, phoneNumberId);
  const pnid = String(numero.id);

  const inscr = await graph("POST", `/${wabaId}/subscribed_apps`, { token });
  if (!inscr.ok) throw new ErroCadastro(_erroMeta(inscr, "Não consegui inscrever o app na conta"), 502);

  let pin = null;
  if (!coexistencia) {
    pin = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const reg = await graph("POST", `/${pnid}/register`, { token, corpo: { messaging_product: "whatsapp", pin } });
    if (!reg.ok) throw new ErroCadastro(_erroMeta(reg, "Não consegui registrar o número"), 502);
  }

  const cliente = await pool.connect();
  let conta;
  try {
    await cliente.query("BEGIN");
    if (padrao) await cliente.query(`UPDATE whatsapp_contas SET padrao = FALSE, atualizado_em = NOW() WHERE padrao`);
    // Reconectar o mesmo número troca o token e mantém o histórico da linha;
    // as sincronizações só recomeçam se ele voltou desconectado.
    const r = await cliente.query(
      `INSERT INTO whatsapp_contas
         (nome, waba_id, phone_number_id, telefone_exibicao, coexistencia, padrao,
          status, segredo_cifrado, conectado_em, conectado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'ativa', $7, NOW(), $8)
       ON CONFLICT (phone_number_id) DO UPDATE SET
         nome = EXCLUDED.nome, waba_id = EXCLUDED.waba_id,
         telefone_exibicao = EXCLUDED.telefone_exibicao,
         coexistencia = EXCLUDED.coexistencia,
         padrao = EXCLUDED.padrao OR whatsapp_contas.padrao,
         segredo_cifrado = EXCLUDED.segredo_cifrado,
         conectado_por_id = EXCLUDED.conectado_por_id,
         conectado_em = CASE WHEN whatsapp_contas.status = 'desconectada' THEN NOW() ELSE whatsapp_contas.conectado_em END,
         sync_contatos_em  = CASE WHEN whatsapp_contas.status = 'desconectada' THEN NULL ELSE whatsapp_contas.sync_contatos_em END,
         sync_historico_em = CASE WHEN whatsapp_contas.status = 'desconectada' THEN NULL ELSE whatsapp_contas.sync_historico_em END,
         sync_tentativas   = CASE WHEN whatsapp_contas.status = 'desconectada' THEN 0 ELSE whatsapp_contas.sync_tentativas END,
         status = 'ativa', desconectado_em = NULL, ultimo_erro = NULL, atualizado_em = NOW()
       RETURNING *`,
      [numero.verified_name || null, String(wabaId), pnid, numero.display_phone_number || null,
       coexistencia, !!padrao, cifrar({ token, pin }, pnid), usuarioId]
    );
    conta = r.rows[0];
    await cliente.query("COMMIT");
  } catch (err) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }

  if (coexistencia) {
    const s = await _sincronizar(conta, token);
    if (s.erro) console.warn(`[whatsapp-cadastro] número ${pnid}: ${s.erro} (a ronda tenta de novo)`);
    conta = (await pool.query(`SELECT * FROM whatsapp_contas WHERE id = $1`, [conta.id])).rows[0];
  }
  console.log(`[whatsapp-cadastro] número ${pnid} conectado${coexistencia ? " em coexistência" : ""}`);
  return semSegredo(conta);
}

// Tira o app da WABA (melhor esforço) e apaga o segredo. A linha fica, para
// as conversas antigas continuarem sabendo de qual número eram.
async function desconectar(id, { avisarMeta = true } = {}) {
  const r = await pool.query(`SELECT * FROM whatsapp_contas WHERE id = $1`, [id]);
  const conta = r.rows[0];
  if (!conta) throw new ErroCadastro("Número não encontrado", 404);
  if (avisarMeta && conta.segredo_cifrado) {
    try {
      const { token } = decifrar(conta.segredo_cifrado, conta.phone_number_id);
      const d = await graph("DELETE", `/${conta.waba_id}/subscribed_apps`, { token });
      if (!d.ok) console.warn(`[whatsapp-cadastro] Meta não tirou o app da WABA ${conta.waba_id}: HTTP ${d.http}`);
    } catch (err) {
      console.warn(`[whatsapp-cadastro] desconectar ${conta.phone_number_id}:`, err.message);
    }
  }
  const u = await pool.query(
    `UPDATE whatsapp_contas
        SET status = 'desconectada', segredo_cifrado = NULL, padrao = FALSE,
            desconectado_em = NOW(), atualizado_em = NOW()
      WHERE id = $1 RETURNING *`,
    [id]
  );
  return semSegredo(u.rows[0]);
}

// account_update PARTNER_REMOVED: a empresa tirou o app pelo celular. O
// entry.id é a WABA. Não chama a Meta de volta (o acesso já acabou).
async function soltarPorWaba(wabaId) {
  const r = await pool.query(
    `SELECT id FROM whatsapp_contas WHERE waba_id = $1 AND status = 'ativa'`, [String(wabaId)]
  );
  for (const { id } of r.rows) await desconectar(id, { avisarMeta: false });
  return r.rowCount;
}

// A ronda: coexistência ativa, dentro das 24 h, com sincronização faltando.
// Passou do prazo ou das tentativas sem sair: fica o erro na linha, e o log diz.
async function sincronizarPendentes() {
  const r = await pool.query(
    `SELECT * FROM whatsapp_contas
      WHERE status = 'ativa' AND coexistencia
        AND (sync_contatos_em IS NULL OR sync_historico_em IS NULL)`
  );
  const resultado = { tentadas: 0, concluidas: 0, vencidas: 0 };
  for (const conta of r.rows) {
    const venceu = Date.now() - new Date(conta.conectado_em).getTime() > PRAZO_SYNC_MS;
    if (venceu || conta.sync_tentativas >= TENTATIVAS_SYNC) {
      resultado.vencidas++;
      if (!/^Prazo/.test(conta.ultimo_erro || "")) {
        await pool.query(
          `UPDATE whatsapp_contas SET ultimo_erro = $2, atualizado_em = NOW() WHERE id = $1`,
          [conta.id, `Prazo da sincronização perdido (${conta.ultimo_erro || "sem resposta"}). Reconectar o número pela janela da Meta.`]
        );
        console.error(`[whatsapp-sync] número ${conta.phone_number_id}: sincronização não saiu em 24 h / ${TENTATIVAS_SYNC} tentativas`);
      }
      continue;
    }
    if (!conta.segredo_cifrado) continue;
    resultado.tentadas++;
    try {
      const { token } = decifrar(conta.segredo_cifrado, conta.phone_number_id);
      const s = await _sincronizar(conta, token);
      if (!s.erro) resultado.concluidas++;
    } catch (err) {
      console.error(`[whatsapp-sync] número ${conta.phone_number_id}:`, err.message);
    }
  }
  return resultado;
}

async function listar() {
  const r = await pool.query(`SELECT * FROM whatsapp_contas ORDER BY status = 'ativa' DESC, padrao DESC, conectado_em DESC`);
  return r.rows.map(semSegredo);
}

function semSegredo(conta) {
  if (!conta) return conta;
  const { segredo_cifrado, ...resto } = conta;
  return { ...resto, tem_token: !!segredo_cifrado };
}

module.exports = {
  conectar, desconectar, soltarPorWaba, sincronizarPendentes, listar, configuracaoPublica, ErroCadastro,
  _SYNCS: SYNCS,
};
