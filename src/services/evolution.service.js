const https = require("https");

// Versão da Graph API. Era v20.0 fixo no código (fora do suporte da Meta em
// 2026); o webhook do app já está assinado em v27.0. Ajustável sem deploy de
// código pela variável, se a Meta aposentar esta.
const GRAPH_VERSAO = String(process.env.WHATSAPP_GRAPH_VERSAO || "v27.0").trim();

function _configurado() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Chamada à Graph. Resolve sempre (nunca rejeita por HTTP): { ok, http, json, data }.
// Rejeita só por rede/tempo esgotado. `consulta` vira query string — ela pode
// levar o segredo do app (troca de código), então a URL nunca vai para o log.
function graph(metodo, caminho, { token, corpo, consulta, timeout = 15000 } = {}) {
  const qs = consulta ? "?" + new URLSearchParams(consulta).toString() : "";
  const body = corpo ? JSON.stringify(corpo) : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "graph.facebook.com", path: `/${GRAPH_VERSAO}${caminho}${qs}`, method: metodo, headers, timeout },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(data); } catch (_) {}
          resolve({ ok: res.statusCode < 400, http: res.statusCode, json, data });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado falando com a Meta")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Qual número e qual token usar.
//   - phoneNumberId de um número conectado (whatsapp_contas, ativo) → o token dele;
//   - phoneNumberId igual ao do Railway, ou nenhum e sem conta padrão → Railway;
//   - nenhum, com conta padrão ativa → a padrão.
// Número desconhecido não cai no token do Railway: o token de uma empresa não
// pode falar pelo número de outra.
async function _credenciais(phoneNumberId) {
  const envId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const doRailway = () => (_configurado() ? { phoneNumberId: envId, token: envToken } : null);

  if (phoneNumberId && phoneNumberId === envId) return doRailway();

  // Banco e cofre só se precisar: carregados aqui para os jobs e testes que
  // só usam o número do Railway não dependerem deles.
  const { pool } = require("../db");
  const { decifrar } = require("./whatsapp-cofre.service");
  const r = await pool.query(
    phoneNumberId
      ? `SELECT phone_number_id, segredo_cifrado FROM whatsapp_contas
          WHERE phone_number_id = $1 AND status = 'ativa' AND segredo_cifrado IS NOT NULL`
      : `SELECT phone_number_id, segredo_cifrado FROM whatsapp_contas
          WHERE padrao AND status = 'ativa' AND segredo_cifrado IS NOT NULL LIMIT 1`,
    phoneNumberId ? [phoneNumberId] : []
  ).catch(() => ({ rows: [] })); // tabela ainda não migrada: segue como antes

  const conta = r.rows[0];
  if (!conta) return phoneNumberId ? null : doRailway();
  try {
    const { token } = decifrar(conta.segredo_cifrado, conta.phone_number_id);
    return { phoneNumberId: conta.phone_number_id, token };
  } catch (err) {
    console.error(`[meta-wa] não consegui abrir o token do número ${conta.phone_number_id}:`, err.message);
    return null;
  }
}

// O número que fala quando ninguém escolheu: a conta padrão ativa, senão o
// do Railway, senão null (o envio vai avisar que não há número).
async function numeroPadrao() {
  const cred = await _credenciais(null);
  return cred ? cred.phoneNumberId : null;
}

// `phoneNumberId` (opcional): o número da conversa. Sem ele, o padrão.
async function enviarMensagem(telefone, texto, phoneNumberId = null) {
  return _postar({ messaging_product: "whatsapp", to: telefone, type: "text", text: { body: texto } }, phoneNumberId);
}

// Mensagem por MODELO aprovado na Meta. ⚠️ É o único jeito de falar com quem
// não mandou mensagem ao número nas últimas 24h: texto livre fora dessa janela
// a Meta recusa (erro 131047). `parametros` preenchem {{1}}, {{2}}… do corpo,
// na ordem; o nome e a quantidade têm de bater com o modelo cadastrado.
// ⚠️ Modelo é da WABA: o de um número não existe nos números de outra empresa.
async function enviarTemplate(telefone, nome, idioma, parametros = [], phoneNumberId = null) {
  return _postar({
    messaging_product: "whatsapp",
    to: telefone,
    type: "template",
    template: {
      name: nome,
      language: { code: idioma || "pt_BR" },
      components: parametros.length
        ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t) })) }]
        : [],
    },
  }, phoneNumberId);
}

// Uma porta de saída para os dois tipos. Resolve com o corpo da resposta
// mesmo em erro HTTP (como sempre foi: quem chama não para por isso), e
// devolve `ok` para quem quiser saber. Com tempo-limite: sem ele, a Meta
// lenta segurava o job e a conversa sem prazo.
async function _postar(payload, phoneNumberId) {
  const cred = await _credenciais(phoneNumberId);
  if (!cred) {
    console.warn(phoneNumberId
      ? `[meta-wa] número ${phoneNumberId} sem conta ativa — mensagem não enviada`
      : "[meta-wa] variáveis não configuradas — mensagem não enviada");
    return { ok: false, configurado: false };
  }
  try {
    const r = await graph("POST", `/${cred.phoneNumberId}/messages`, { token: cred.token, corpo: payload });
    if (!r.ok) console.error("[meta-wa] erro ao enviar:", r.http, r.data);
    return { ok: r.ok, http: r.http, data: r.data };
  } catch (err) {
    console.error("[meta-wa] erro ao enviar mensagem:", err.message);
    throw err;
  }
}

async function checarStatusConexao() {
  if (!_configurado()) {
    return { ok: false, configurado: false, mensagem: "Variáveis WHATSAPP_* não configuradas" };
  }
  try {
    const r = await graph("GET", `/${process.env.WHATSAPP_PHONE_NUMBER_ID}`, {
      token: process.env.WHATSAPP_ACCESS_TOKEN, consulta: { fields: "verified_name,status" }, timeout: 5000,
    });
    if (!r.json) return { ok: false, configurado: true, mensagem: "Resposta inválida", http: r.http };
    const ok = r.http === 200 && !!r.json.verified_name;
    return { ok, configurado: true, estado: ok ? "open" : "error", http: r.http };
  } catch (err) {
    return { ok: false, configurado: true, mensagem: err.message };
  }
}

module.exports = { enviarMensagem, enviarTemplate, checarStatusConexao, numeroPadrao, graph, GRAPH_VERSAO, _credenciais };
