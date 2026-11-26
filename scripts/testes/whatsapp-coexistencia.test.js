// Vários números de WhatsApp e coexistência (migration 108).
//
//   node scripts/testes/whatsapp-coexistencia.test.js
//
// O que este teste trava (25/11/2026):
//   1. Cofre: o token cifrado só abre com a chave E no número certo.
//   2. Webhook separa mensagens de cliente, ecos do celular, histórico/contatos
//      e PARTNER_REMOVED — eco nenhum pode cair no caminho que chama a IA.
//   3. Eco (a equipe respondeu pelo celular) grava a saída como "celular" e
//      CALA a IA na conversa; a mensagem seguinte do cliente não é respondida.
//   4. O mesmo cliente em dois números da empresa = duas conversas.
//   5. Credenciais: número conectado usa o token DELE; número desconhecido não
//      cai no token de outro; sem número, a conta padrão.
//   6. PARTNER_REMOVED desconecta e apaga o token.
//   7. Ronda: coexistência fora do prazo vira erro na linha, sem chamar a Meta.
//   8. Rotas /whatsapp/contas: só admin master; sem configuração → 503;
//      a listagem nunca devolve o segredo.
//
// Parte 1 sem banco. Partes 2 e 3 no banco de TESTE, com telefones, números e
// contas criados aqui e apagados no fim. Sem OpenAI e sem Meta: OPENAI_API_KEY
// e WHATSAPP_* ficam vazias, então nada sai daqui (o envio só avisa no log).
require("dotenv").config();
const crypto = require("crypto");

process.env.OPENAI_API_KEY = "";
process.env.WHATSAPP_ACCESS_TOKEN = "";
process.env.WHATSAPP_PHONE_NUMBER_ID = "";
process.env.WHATSAPP_TOKENS_CHAVE = crypto.randomBytes(32).toString("base64");

const r = [];
const ok = (nome, cond) => r.push([nome, !!cond]);

// ── 1. Cofre ──────────────────────────────────────────────────────────────
const { cifrar, decifrar } = require("../../src/services/whatsapp-cofre.service");
const guardado = cifrar({ token: "tok-123", pin: "000111" }, "555");
ok("cofre: abre no número certo", decifrar(guardado, "555").token === "tok-123");
ok("cofre: não guarda o token em claro", !guardado.includes("tok-123"));
let abriuNoOutro = false;
try { decifrar(guardado, "556"); abriuNoOutro = true; } catch (_) {}
ok("cofre: não abre na linha de outro número", !abriuNoOutro);

// ── 2. Separação do webhook ───────────────────────────────────────────────
const { _extrairEventos } = require("../../src/controllers/whatsapp.controller");
const ev = _extrairEventos({
  entry: [
    { id: "W1", changes: [
      { field: "messages", value: { metadata: { phone_number_id: "P1" }, contacts: [{ profile: { name: "Ana" } }],
        messages: [{ from: "5511900000001", id: "m1", type: "text", text: { body: "oi tudo bem" } }] } },
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: "P1" },
        message_echoes: [{ from: "5511999999999", to: "5511900000001", id: "e1", type: "text", text: { body: "já vou" } }] } },
      { field: "history", value: { history: [{ threads: [] }, { threads: [] }] } },
      { field: "smb_app_state_sync", value: { state_sync: [{}] } },
    ] },
    { id: "W2", changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED" } }] },
  ],
});
ok("webhook: 1 mensagem de cliente, com o número da empresa", ev.mensagens.length === 1 && ev.mensagens[0].phoneNumberId === "P1");
ok("webhook: eco separado, cliente em `to`", ev.ecos.length === 1 && ev.ecos[0].telefone === "5511900000001");
ok("webhook: eco não vira mensagem de cliente", !ev.mensagens.some((m) => m.messageId === "e1"));
ok("webhook: histórico e contatos só contados", ev.historico === 2 && ev.estadoApp === 1);
ok("webhook: PARTNER_REMOVED pega a WABA do entry.id", ev.parceiroRemovido.join() === "W2");

// ── 2 e 3. Banco de teste ─────────────────────────────────────────────────
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

(async () => {
  if (resolverDatabaseUrl().alvo !== "TESTE") {
    console.error("Recusando rodar a parte de banco: o alvo não é TESTE.");
    process.exit(1);
  }
  const { _processarMensagem, _processarEco } = require("../../src/controllers/whatsapp.controller");
  const { _credenciais } = require("../../src/services/evolution.service");
  const cadastro = require("../../src/services/whatsapp-cadastro.service");

  const sufixo = String(Date.now()).slice(-8);
  const telefone = "5500" + sufixo;
  const PN_A = "9100" + sufixo, PN_B = "9200" + sufixo, WABA = "9300" + sufixo;
  let clienteId = null;
  const contas = [];

  const saidas = async (conv) => (await pool.query(
    `SELECT conteudo, origem FROM mensagens_whatsapp WHERE conversa_id = $1 AND direcao = 'saida' ORDER BY id`, [conv]
  )).rows;
  const conversaDo = async (pn) => (await pool.query(
    `SELECT cv.id, cv.ia_pausada_ate > NOW() AS pausada FROM conversas_whatsapp cv
       JOIN clientes_whatsapp cw ON cw.id = cv.cliente_whatsapp_id
      WHERE cw.telefone = $1 AND cv.phone_number_id = $2 ORDER BY cv.id DESC LIMIT 1`, [telefone, pn]
  )).rows[0];

  try {
    // ── 3. Eco cala a IA ──
    await _processarEco({ telefone, messageId: `eco-${sufixo}-1`, tipo: "text", conteudo: "Bom dia, já estou vendo", phoneNumberId: PN_A });
    const convA = await conversaDo(PN_A);
    clienteId = (await pool.query(`SELECT id FROM clientes_whatsapp WHERE telefone = $1`, [telefone])).rows[0]?.id;
    ok("eco: abriu a conversa no número A", !!convA);
    ok("eco: IA pausada na conversa", convA?.pausada === true);
    const s1 = convA ? await saidas(convA.id) : [];
    ok("eco: saída gravada como 'celular'", s1.length === 1 && s1[0].origem === "celular");

    await _processarMensagem({ telefone, messageId: `msg-${sufixo}-1`, tipo: "text", conteudo: "obrigado, a bomba parou de novo", nomeContato: "Teste", phoneNumberId: PN_A });
    const convA2 = await conversaDo(PN_A);
    ok("eco: mensagem do cliente cai na MESMA conversa", convA2?.id === convA?.id);
    const s2 = convA ? await saidas(convA.id) : [];
    ok("eco: IA não respondeu depois do eco (só a saída do celular)", s2.length === 1);

    // ── 4. Outro número = outra conversa (e lá a IA não está pausada) ──
    await _processarMensagem({ telefone, messageId: `msg-${sufixo}-2`, tipo: "text", conteudo: "oi quero um orçamento", nomeContato: "Teste", phoneNumberId: PN_B });
    const convB = await conversaDo(PN_B);
    ok("dois números: conversa separada no número B", !!convB && convB.id !== convA?.id);
    const sB = convB ? await saidas(convB.id) : [];
    ok("dois números: no B a IA tentou responder (falha avisada, sem OpenAI)", sB.length === 1 && sB[0].origem === null);

    // ── 5. Credenciais por número ──
    const ins = async (pn, padrao) => {
      const q = await pool.query(
        `INSERT INTO whatsapp_contas (waba_id, phone_number_id, padrao, segredo_cifrado, coexistencia)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
        [WABA, pn, padrao, cifrar({ token: "tok-" + pn, pin: null }, pn)]
      );
      contas.push(q.rows[0].id);
      return q.rows[0].id;
    };
    const idA = await ins(PN_A, false);
    const idB = await ins(PN_B, false);
    ok("credenciais: número A usa o token de A", (await _credenciais(PN_A))?.token === "tok-" + PN_A);
    ok("credenciais: número desconhecido não usa token de ninguém", (await _credenciais("1" + PN_A)) === null);
    const padraoAntes = (await pool.query(`SELECT id FROM whatsapp_contas WHERE padrao AND status = 'ativa'`)).rows;
    if (!padraoAntes.length) {
      await pool.query(`UPDATE whatsapp_contas SET padrao = TRUE WHERE id = $1`, [idB]);
      ok("credenciais: sem número, a conta padrão", (await _credenciais(null))?.phoneNumberId === PN_B);
    } else {
      ok("credenciais: (pulado — já existe conta padrão no banco de teste)", true);
    }

    // ── 6. PARTNER_REMOVED ──
    const n = await cadastro.soltarPorWaba(WABA);
    const depois = (await pool.query(`SELECT status, segredo_cifrado, padrao FROM whatsapp_contas WHERE id = ANY($1)`, [contas])).rows;
    ok("PARTNER_REMOVED: as duas contas da WABA desconectadas", n === 2 && depois.every((c) => c.status === "desconectada"));
    ok("PARTNER_REMOVED: token apagado e padrão tirado", depois.every((c) => c.segredo_cifrado === null && c.padrao === false));
    ok("PARTNER_REMOVED: número desconectado não envia mais", (await _credenciais(PN_A)) === null);

    // ── 7. Ronda: fora do prazo vira erro, sem Meta ──
    await pool.query(
      `UPDATE whatsapp_contas SET status = 'ativa', segredo_cifrado = $2, conectado_em = NOW() - INTERVAL '25 hours',
              sync_contatos_em = NULL, sync_historico_em = NULL, padrao = FALSE WHERE id = $1`,
      [idA, cifrar({ token: "x" }, PN_A)]
    );
    const ronda = await cadastro.sincronizarPendentes();
    const linhaA = (await pool.query(`SELECT ultimo_erro, sync_tentativas FROM whatsapp_contas WHERE id = $1`, [idA])).rows[0];
    ok("ronda: coexistência vencida contada e sem tentativa à Meta", ronda.vencidas >= 1 && linhaA.sync_tentativas === 0);
    ok("ronda: erro diz para reconectar", /^Prazo/.test(linhaA.ultimo_erro || "") && /Reconectar/.test(linhaA.ultimo_erro));

    // ── 8. Rotas ──
    const express = require("express");
    const jwt = require("jsonwebtoken");
    const { whatsappRouter } = require("../../src/routes/whatsapp.routes");
    const app = express();
    app.use(express.json());
    app.use("/whatsapp", whatsappRouter);
    const srv = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
    const base = `http://127.0.0.1:${srv.address().port}/whatsapp`;
    const tk = (role) => "Bearer " + jwt.sign({ id: 1, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const chamar = (metodo, caminho, role, corpo) => fetch(base + caminho, {
      method: metodo, headers: { Authorization: tk(role), "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    try {
      ok("rotas: gerente não conecta número (403)", (await chamar("POST", "/contas/conectar", "gerente", { code: "x", waba_id: "1" })).status === 403);
      ok("rotas: operador não lista números (403)", (await chamar("GET", "/contas", "operador")).status === 403);

      const appId = process.env.WHATSAPP_APP_ID;
      delete process.env.WHATSAPP_APP_ID;
      const semConfig = await chamar("POST", "/contas/conectar", "admin", { code: "x", waba_id: "1" });
      ok("rotas: sem WHATSAPP_APP_ID → 503 dizendo o que falta", semConfig.status === 503 && /WHATSAPP_APP_ID/.test((await semConfig.json()).error));
      process.env.WHATSAPP_APP_ID = "123";
      process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "segredo-teste";
      ok("rotas: sem code → 400", (await chamar("POST", "/contas/conectar", "admin", { waba_id: "1" })).status === 400);
      ok("rotas: waba_id com letras → 400", (await chamar("POST", "/contas/conectar", "admin", { code: "x", waba_id: "abc" })).status === 400);
      if (appId === undefined) delete process.env.WHATSAPP_APP_ID; else process.env.WHATSAPP_APP_ID = appId;

      const lista = await chamar("GET", "/contas", "admin");
      const corpo = await lista.json();
      const minha = (corpo.contas || []).find((c) => c.id === idA);
      ok("rotas: listagem traz o número", lista.status === 200 && !!minha);
      ok("rotas: listagem nunca devolve o segredo", minha && !("segredo_cifrado" in minha) && minha.tem_token === true);

      ok("rotas: marcar padrão (200)", (await chamar("PATCH", `/contas/${idA}/padrao`, "admin")).status === 200);
      ok("rotas: padrão de número desconectado → 404", (await chamar("PATCH", `/contas/${idB}/padrao`, "admin")).status === 404);
      ok("rotas: config pública diz o que falta", (await (await chamar("GET", "/contas/config", "admin")).json()).faltando.includes("WHATSAPP_CADASTRO_CONFIG"));
    } finally {
      srv.close();
    }
  } catch (err) {
    console.error(err);
    ok("sem exceção", false);
  } finally {
    if (contas.length) await pool.query(`DELETE FROM whatsapp_contas WHERE id = ANY($1)`, [contas]);
    if (clienteId) await pool.query(`DELETE FROM clientes_whatsapp WHERE id = $1`, [clienteId]); // conversas e mensagens em cascata
    await pool.end();
  }

  const falhas = r.filter(([, v]) => !v);
  for (const [nome, v] of r) console.log(`  ${v ? "ok" : "XX"}  ${nome}`);
  console.log(`\n${r.length - falhas.length}/${r.length}`);
  process.exit(falhas.length ? 1 : 0);
})();
