// Bot do WhatsApp e aviso de sensor mudo: o que acontece quando algo falha.
//
//   node scripts/testes/whatsapp-falhas.test.js
//
// Trava três coisas (24/11/2026):
//   1. O laço de ferramentas tem teto: um modelo que só chama ferramenta
//      é obrigado a responder em texto na última volta (era `while (true)`).
//   2. IA que falha (erro, tempo esgotado, resposta vazia) responde "pode
//      repetir?" em vez de silêncio; na 3ª falha seguida a conversa vai para
//      um atendente.
//   3. O aviso de sensor mudo respeita a janela de 24h da Meta: dentro dela,
//      texto livre; fora, o modelo de WHATSAPP_TEMPLATE_SENSOR; sem modelo, não
//      manda nem grava como enviado.
//
// A OpenAI e a Meta são FALSAS aqui: nada sai do computador. O banco é o de
// TESTE, num condomínio e num telefone criados aqui e apagados no fim.
require("dotenv").config();

// ── A Meta falsa: troca as funções do serviço ANTES de quem as usa carregar ──
const evo = require("../../src/services/evolution.service");
const enviados = [];
// Quem carrega depois guarda ESTAS funções (destructuring no require); para
// simular a Meta recusando, muda-se a chave, não a função.
const meta = { recusa: false };
evo.enviarMensagem = async (telefone, texto) => { if (meta.recusa) return { ok: false, http: 400 }; enviados.push({ tipo: "texto", telefone, texto }); return { ok: true }; };
evo.enviarTemplate = async (telefone, nome, idioma, params) => { if (meta.recusa) return { ok: false, http: 400 }; enviados.push({ tipo: "modelo", telefone, nome, idioma, params }); return { ok: true }; };

const ia = require("../../src/services/ia.service");
const { _processarMensagem } = require("../../src/controllers/whatsapp.controller");
const { _notificarClienteWhatsApp } = require("../../src/jobs/offline.job");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

const r = [];
const ok = (nome, cond) => r.push([nome, !!cond]);

// OpenAI falsa: `responder(chamada)` decide cada resposta.
function clienteFalso(responder) {
  const chamadas = [];
  return {
    chamadas,
    chat: { completions: { create: async (params) => { chamadas.push(params); return responder(params, chamadas.length); } } },
  };
}
const soFerramenta = () => ({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null,
  tool_calls: [{ id: "c" + Math.random(), type: "function", function: { name: "buscar_chamados_abertos", arguments: "{}" } }] } }] });
const texto = (t) => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: t } }] });

(async () => {
  if (resolverDatabaseUrl().alvo !== "TESTE") {
    console.error("Recusando rodar: o alvo não é TESTE.");
    process.exit(1);
  }
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "chave-falsa-de-teste";

  const sufixo = String(Date.now()).slice(-8);
  const telefone = "5501" + sufixo;
  let condoId = null, clienteId = null, n = 0;
  const msg = (conteudo) => _processarMensagem({ telefone, messageId: `teste-waf-${sufixo}-${++n}`, tipo: "text", conteudo, nomeContato: "Teste" });
  const conversa = async () => (await pool.query(
    `SELECT id, ia_sem_avanco, aguardando_atendente FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1 ORDER BY id DESC LIMIT 1`, [clienteId])).rows[0];
  const ultimaSaida = async (cid) => (await pool.query(
    `SELECT conteudo, tipo FROM mensagens_whatsapp WHERE conversa_id = $1 AND direcao = 'saida' ORDER BY id DESC LIMIT 1`, [cid])).rows[0];

  try {
    condoId = (await pool.query(`INSERT INTO condominios (nome) VALUES ('TESTE whatsapp falhas') RETURNING id`)).rows[0].id;
    clienteId = (await pool.query(
      `INSERT INTO clientes_whatsapp (telefone, nome, condominio_id) VALUES ($1, 'Teste', $2) RETURNING id`, [telefone, condoId])).rows[0].id;

    // 1. Teto de voltas: o modelo só quer chamar ferramenta.
    const f1 = clienteFalso((params) => params.tool_choice === "none" ? texto("Resposta final em texto.") : soFerramenta());
    ia._definirClienteParaTeste(f1);
    await msg("qual a situação do meu prédio");
    ok(`para depois de ${ia.MAX_VOLTAS_FERRAMENTA} voltas de ferramenta`, f1.chamadas.length === ia.MAX_VOLTAS_FERRAMENTA + 1);
    ok("a última volta obriga texto (tool_choice none)", f1.chamadas.at(-1)?.tool_choice === "none");
    let c = await conversa();
    ok("a resposta final chega ao cliente", (await ultimaSaida(c.id))?.conteudo === "Resposta final em texto.");

    // 2. IA falha: "pode repetir?", contando no anti-loop.
    await pool.query(`UPDATE conversas_whatsapp SET ia_sem_avanco = 0 WHERE id = $1`, [c.id]);
    ia._definirClienteParaTeste(clienteFalso(() => { throw new Error("tempo esgotado (falso)"); }));
    await msg("a bomba parou de funcionar");
    c = await conversa();
    ok('falha da IA responde "pode repetir?"', /Pode repetir/.test((await ultimaSaida(c.id))?.conteudo || ""));
    ok("a falha conta no anti-loop", c.ia_sem_avanco === 1 && !c.aguardando_atendente);

    ia._definirClienteParaTeste(clienteFalso(() => texto("   ")));
    await msg("alguém pode me ajudar");
    c = await conversa();
    ok('resposta vazia também vira "pode repetir?"', /Pode repetir/.test((await ultimaSaida(c.id))?.conteudo || "") && c.ia_sem_avanco === 2);

    ia._definirClienteParaTeste(clienteFalso(() => { throw new Error("fora do ar (falso)"); }));
    await msg("continua sem resposta aqui");
    c = await conversa();
    ok("3ª falha seguida passa para um atendente", c.aguardando_atendente === true);

    // 3. Aviso de sensor mudo e a janela de 24h.
    await pool.query(`UPDATE conversas_whatsapp SET status = 'fechada' WHERE cliente_whatsapp_id = $1`, [clienteId]);
    const ctx = { condominioNome: "TESTE whatsapp falhas", reservatorioNome: "Caixa 1" };

    // a) fora da janela, sem modelo: não manda, não grava.
    await pool.query(`UPDATE mensagens_whatsapp SET criado_em = NOW() - interval '2 days'
                       WHERE conversa_id IN (SELECT id FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1)`, [clienteId]);
    delete process.env.WHATSAPP_TEMPLATE_SENSOR;
    enviados.length = 0;
    let res = await _notificarClienteWhatsApp(condoId, "texto livre de teste", ctx);
    ok("fora das 24h e sem modelo: não envia", !res.enviado && enviados.length === 0);

    // b) fora da janela, com modelo: manda o modelo com condomínio e reservatório.
    process.env.WHATSAPP_TEMPLATE_SENSOR = "sensor_sem_sinal";
    res = await _notificarClienteWhatsApp(condoId, "texto livre de teste", ctx);
    const env = enviados.at(-1);
    ok("fora das 24h com modelo: envia o modelo", res.enviado && res.via === "modelo" && env?.tipo === "modelo"
      && env.nome === "sensor_sem_sinal" && env.params[0] === ctx.condominioNome && env.params[1] === "Caixa 1");

    // c) dentro da janela: texto livre.
    const cRecente = (await pool.query(`INSERT INTO conversas_whatsapp (cliente_whatsapp_id) VALUES ($1) RETURNING id`, [clienteId])).rows[0].id;
    await pool.query(`INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1, 'entrada', 'text', 'oi')`, [cRecente]);
    res = await _notificarClienteWhatsApp(condoId, "texto livre de teste", ctx);
    ok("dentro das 24h: texto livre", res.enviado && res.via === "texto" && enviados.at(-1)?.texto === "texto livre de teste");
    ok("o enviado é gravado na conversa", (await ultimaSaida(cRecente))?.conteudo === "texto livre de teste");

    // d) Meta recusa: não grava como enviado.
    meta.recusa = true;
    const antes = (await pool.query(`SELECT COUNT(*)::int n FROM mensagens_whatsapp WHERE conversa_id = $1`, [cRecente])).rows[0].n;
    res = await _notificarClienteWhatsApp(condoId, "outra", ctx);
    const depois = (await pool.query(`SELECT COUNT(*)::int n FROM mensagens_whatsapp WHERE conversa_id = $1`, [cRecente])).rows[0].n;
    meta.recusa = false;
    ok("Meta recusou: nada gravado como enviado", depois === antes && !res.enviado);
  } catch (err) {
    ok("sem exceção: " + err.message, false);
  } finally {
    delete process.env.WHATSAPP_TEMPLATE_SENSOR;
    if (clienteId) {
      await pool.query(`DELETE FROM chamados WHERE conversa_id IN (SELECT id FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1)`, [clienteId]).catch(() => {});
      await pool.query(`DELETE FROM mensagens_whatsapp WHERE conversa_id IN (SELECT id FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1)`, [clienteId]).catch(() => {});
      await pool.query(`DELETE FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1`, [clienteId]).catch(() => {});
      await pool.query(`DELETE FROM clientes_whatsapp WHERE id = $1`, [clienteId]).catch(() => {});
    }
    if (condoId) {
      await pool.query(`DELETE FROM chamados WHERE condominio_id = $1`, [condoId]).catch(() => {});
      await pool.query(`DELETE FROM condominios WHERE id = $1`, [condoId]).catch((e) => console.error("limpeza:", e.message));
    }
    await pool.end();
  }

  let falhas = 0;
  for (const [nome, cond] of r) if (!cond) { console.log("✗ " + nome); falhas++; }
  console.log(`\n${r.length - falhas}/${r.length}`);
  process.exit(falhas ? 1 : 0);
})();
