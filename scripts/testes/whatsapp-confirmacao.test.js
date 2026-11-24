// O bot do WhatsApp: confirmação da ação pendente e contexto do condomínio.
//
//   node scripts/testes/whatsapp-confirmacao.test.js
//
// Três defeitos que este teste trava (24/11/2026, achados comparando com o bot
// do Petzu):
//   1. "Sim" sozinho era descartado pelo filtro de uma palavra, que rodava
//      ANTES de olhar a ação pendente — o chamado nunca abria.
//   2. "Não, pode deixar" ABRIA o chamado: a confirmação procurava "pode" solto
//      e era conferida antes da recusa.
//   3. O contexto operacional filtrava `alertas` por um `condominio_id` que a
//      tabela não tem; o erro era engolido e a IA nunca recebia a situação real.
//   (+) O histórico mandado à IA eram as 20 PRIMEIRAS mensagens, não as últimas.
//
// Parte 1 sem banco (a regra do aceite). Parte 2 no banco de TESTE, num
// condomínio e num telefone criados aqui e apagados no fim. Sem OpenAI e sem
// Meta: os caminhos testados não chamam a IA, e sem WHATSAPP_ACCESS_TOKEN o
// envio só avisa no log.
require("dotenv").config();
const { classificarResposta } = require("../../src/services/whatsapp-aceite.service");

const r = [];
const ok = (nome, cond) => r.push([nome, !!cond]);

// ── 1. A regra do aceite ──────────────────────────────────────────────────
for (const t of ["Sim", "sim!", "SIM 👍", "Pode", "pode abrir", "Ok", "ok, por favor", "Sim, pode abrir por favor",
                 "Confirmo", "isso mesmo", "pode sim", "Claro", "abre o chamado", "s", "Uhum", "pode abrir para mim"]) {
  ok(`aceite: "${t}"`, classificarResposta(t) === "aceite");
}
for (const t of ["Não", "não, pode deixar", "nao quero", "Não precisa", "deixa pra lá", "cancela", "n", "esquece",
                 "Não, obrigado", "pode cancelar"]) {
  ok(`recusa: "${t}"`, classificarResposta(t) === "recusa");
}
for (const t of ["Sim, mas antes me diz qual o nível da caixa", "qual o prazo?", "por favor", "o chamado",
                 "quero saber quanto custa", "a bomba está fazendo barulho", ""]) {
  ok(`nem sim nem não: "${t}"`, classificarResposta(t) === null);
}

// ── 2. Banco de teste ─────────────────────────────────────────────────────
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

(async () => {
  if (resolverDatabaseUrl().alvo !== "TESTE") {
    console.error("Recusando rodar a parte de banco: o alvo não é TESTE.");
    process.exit(1);
  }
  const { _processarMensagem } = require("../../src/controllers/whatsapp.controller");
  const { _buscarContextoOperacional } = require("../../src/services/ia.service");

  const sufixo = String(Date.now()).slice(-8);
  const telefone = "5500" + sufixo;
  const device = "TESTE-WA-" + sufixo;
  let condoId = null, clienteId = null;
  const conversas = [];
  let nMsg = 0;
  const msg = (conteudo) => _processarMensagem({ telefone, messageId: `teste-wa-${sufixo}-${++nMsg}`, tipo: "text", conteudo, nomeContato: "Teste" });

  // Conversa nova esperando confirmação de um chamado, como a IA a deixa.
  const conversaPendente = async () => {
    await pool.query(`UPDATE conversas_whatsapp SET status = 'fechada' WHERE cliente_whatsapp_id = $1`, [clienteId]);
    const c = (await pool.query(
      `INSERT INTO conversas_whatsapp (cliente_whatsapp_id, estado_conversa, pendente_acao)
       VALUES ($1, 'aguardando_confirmacao', $2::jsonb) RETURNING id`,
      [clienteId, JSON.stringify({ tipo: "abrir_chamado", params: {
        condominio_id: condoId, titulo: "Teste WhatsApp — bomba", descricao: "teste", prioridade: "p3", categoria: "bomba_falha" } })]
    )).rows[0].id;
    conversas.push(c);
    // a conversa só é "a aberta" se tiver mensagem recente
    await pool.query(`INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo) VALUES ($1, 'saida', 'text', 'Posso abrir o chamado?')`, [c]);
    return c;
  };
  const estado = async (c) => (await pool.query(`SELECT estado_conversa, pendente_acao FROM conversas_whatsapp WHERE id = $1`, [c])).rows[0];
  const chamadosDa = async (c) => (await pool.query(`SELECT id FROM chamados WHERE conversa_id = $1`, [c])).rows.length;

  try {
    condoId = (await pool.query(`INSERT INTO condominios (nome) VALUES ('TESTE whatsapp') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO reservatorios (condominio_id, nome, tipo, device_id, device_key) VALUES ($1, 'Caixa teste', 'superior', $2, 'k')`,
      [condoId, device]);
    await pool.query(`INSERT INTO leituras (device_id, nivel, bomba_ligada, nivel_pct) VALUES ($1, 'baixo', true, 31)`, [device]);
    await pool.query(`INSERT INTO alertas (device_id, tipo, mensagem, status) VALUES ($1, 'nivel_baixo', 'Nível baixo teste', 'aberto')`, [device]);
    clienteId = (await pool.query(
      `INSERT INTO clientes_whatsapp (telefone, nome, condominio_id) VALUES ($1, 'Teste', $2) RETURNING id`,
      [telefone, condoId])).rows[0].id;

    // Defeito 3: o contexto chega com telemetria e alertas.
    const ctx = await _buscarContextoOperacional(condoId);
    ok("contexto traz a telemetria", /Caixa teste: nível 31%/.test(ctx || ""));
    ok("contexto traz o alerta aberto", /ALERTAS ABERTOS:[\s\S]*nivel_baixo/.test(ctx || ""));

    // Defeito 1: "Sim" sozinho abre o chamado.
    let c = await conversaPendente();
    await msg("Sim");
    let e = await estado(c);
    ok('"Sim" sozinho abre o chamado', (await chamadosDa(c)) === 1 && e.estado_conversa === "chamado_aberto" && e.pendente_acao == null);

    // Defeito 2: "não, pode deixar" NÃO abre.
    c = await conversaPendente();
    await msg("não, pode deixar");
    e = await estado(c);
    ok('"não, pode deixar" não abre o chamado', (await chamadosDa(c)) === 0 && e.pendente_acao == null && e.estado_conversa === "triagem");

    // "não quero" também não.
    c = await conversaPendente();
    await msg("Não quero");
    ok('"Não quero" não abre o chamado', (await chamadosDa(c)) === 0 && (await estado(c)).pendente_acao == null);

    // Pergunta no meio: a ação continua pendente (a IA tentaria responder; sem
    // chave da OpenAI ela falha no log e nada muda).
    c = await conversaPendente();
    await msg("Sim, mas antes me diz qual o nível da caixa");
    e = await estado(c);
    ok("pergunta no meio mantém a ação pendente", (await chamadosDa(c)) === 0 && e.pendente_acao != null && e.estado_conversa === "aguardando_confirmacao");

    // Histórico: as 20 ÚLTIMAS mensagens, em ordem (mesma consulta do controller).
    const cHist = conversas[conversas.length - 1];
    for (let i = 1; i <= 25; i++) {
      await pool.query(`INSERT INTO mensagens_whatsapp (conversa_id, direcao, tipo, conteudo, criado_em)
                        VALUES ($1, 'entrada', 'text', $2, NOW() + ($3 || ' seconds')::interval)`, [cHist, "m" + i, i]);
    }
    const h = (await pool.query(
      `SELECT direcao, conteudo FROM (
         SELECT direcao, conteudo, criado_em, id FROM mensagens_whatsapp
          WHERE conversa_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 20
       ) ult ORDER BY criado_em ASC, id ASC`, [cHist])).rows.map((x) => x.conteudo);
    ok("histórico termina na última mensagem", h.length === 20 && h[19] === "m25" && h[0] === "m6");
    ok("consulta do histórico é a do controller",
      require("fs").readFileSync("src/controllers/whatsapp.controller.js", "utf8").includes("ORDER BY criado_em DESC, id DESC LIMIT 20"));
  } catch (err) {
    ok("sem exceção: " + err.message, false);
  } finally {
    if (conversas.length) {
      await pool.query(`DELETE FROM chamados WHERE conversa_id = ANY($1::int[])`, [conversas]).catch(() => {});
    }
    if (clienteId) {
      await pool.query(`DELETE FROM mensagens_whatsapp WHERE conversa_id IN (SELECT id FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1)`, [clienteId]).catch(() => {});
      await pool.query(`DELETE FROM conversas_whatsapp WHERE cliente_whatsapp_id = $1`, [clienteId]).catch(() => {});
      await pool.query(`DELETE FROM clientes_whatsapp WHERE id = $1`, [clienteId]).catch(() => {});
    }
    await pool.query(`DELETE FROM alertas WHERE device_id = $1`, [device]).catch(() => {});
    await pool.query(`DELETE FROM leituras WHERE device_id = $1`, [device]).catch(() => {});
    if (condoId) {
      await pool.query(`DELETE FROM chamados WHERE condominio_id = $1`, [condoId]).catch(() => {});
      await pool.query(`DELETE FROM reservatorios WHERE condominio_id = $1`, [condoId]).catch(() => {});
      await pool.query(`DELETE FROM condominios WHERE id = $1`, [condoId]).catch((e) => console.error("limpeza:", e.message));
    }
    await pool.end();
  }

  let falhas = 0;
  for (const [nome, cond] of r) {
    if (!cond) { console.log("✗ " + nome); falhas++; }
  }
  console.log(`\n${r.length - falhas}/${r.length}`);
  process.exit(falhas ? 1 : 0);
})();
