// Teste das peças no orçamento, fase B (20/11/2026, migration 094): as peças
// da O.S., usadas e a orçar, entrando no orçamento. Roda com
// `node scripts/testes/pecas-da-os.test.js`.
//
// O que prova:
//   - a peça da O.S. aceita situacao (usada | a_orcar | vazia) e recusa outra;
//   - o bloco do editor lista as peças com a situação e onde foram orçadas;
//   - trazer cria as linhas com a origem (os_peca_id) e peca_usada da peça;
//   - ⚠️ A MESMA PEÇA NÃO ENTRA DUAS VEZES (409), nem em outro orçamento;
//     orçamento recusado a libera;
//   - "Cobrar as peças usadas" cria o orçamento da O.S. MESMO SEM o técnico
//     ter pedido orçamento, só com as usadas; repetir diz que não há mais;
//     orçamento da O.S. já enviado recusa (409);
//   - "Fazer orçamento" de um pedido traz sozinho as peças marcadas;
//   - o HTML do PDF separa "Peças utilizadas na visita" de "a executar", e
//     sem peça usada fica como sempre.
//
// ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do `.env`) e limpa o que
// criou no `finally`. Não roda com NODE_ENV=production.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { alvo } = resolverDatabaseUrl();

if (alvo !== "TESTE") {
  console.error(`Recusando rodar: o banco resolvido é ${alvo}, não TESTE.`);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/admin", require("../../src/routes/admin.routes").adminRouter);
app.use("/ordens-servico", require("../../src/routes/ordens-servico.routes").ordensServicoRouter);
const pdf = require("../../src/services/orcamento-pdf.service")._paraTeste;

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const oss = [], orcs = [];
  let tecId = null;

  try {
    const u = (await pool.query("SELECT id, role FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0];
    const H = { Authorization: `Bearer ${jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: "10m" })}`, "Content-Type": "application/json" };
    const condoId = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0]?.id ?? null;
    const sufixo = String(Date.now()).slice(-8);
    tecId = (await pool.query("INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", [`Tec Pecas ${sufixo}`])).rows[0].id;
    const req = async (metodo, url, body) => {
      const resp = await fetch(base + url, { method: metodo, headers: H, body: body ? JSON.stringify(body) : undefined });
      return { st: resp.status, j: await resp.json().catch(() => ({})) };
    };
    const novaOs = async (pedido, n) => {
      const id = (await pool.query(
        `INSERT INTO ordens_servico (numero, condominio_id, tecnico_id, orcamento_necessario, orcamento_observacoes, chegada_em, finalizada_em)
         VALUES ($1, $2, $3, $4, $5, now() - interval '1 day', now()) RETURNING id`,
        [`OS-P${n}-${sufixo}`, condoId, tecId, pedido, pedido ? "trocar o registro" : null]
      )).rows[0].id;
      oss.push(id);
      return id;
    };
    const peca = async (osId, descricao, situacao) => (await pool.query(
      "INSERT INTO os_pecas (os_id, descricao, quantidade, observacao, situacao) VALUES ($1, $2, 1, NULL, $3) RETURNING id",
      [osId, descricao, situacao]
    )).rows[0].id;
    const novoOrc = async (osId, status = "rascunho") => {
      const id = (await pool.query(
        "INSERT INTO orcamentos (numero, condominio_id, os_id, status, origem, criado_por) VALUES ($1, $2, $3, $4, 'os', $5) RETURNING id",
        [`ORC-P-${sufixo}-${orcs.length}`, condoId, osId, status, u.id]
      )).rows[0].id;
      orcs.push(id);
      return id;
    };

    // ── O.S. com as três situações ────────────────────────────────────
    const os1 = await novaOs(false, 1);
    const pUsada = await peca(os1, "Contator 32 A", "usada");
    const pOrcar = await peca(os1, "Registro de gaveta 2\"", "a_orcar");
    const pSem = await peca(os1, "Boia elétrica", null);

    ok("situacao inválida → 400", (await req("PATCH", `/ordens-servico/${os1}/pecas/${pSem}`, { situacao: "outra" })).st === 400);
    const m = await req("PATCH", `/ordens-servico/${os1}/pecas/${pSem}`, { situacao: "a_orcar" });
    ok("marcar a antiga como a orçar", m.st === 200 && m.j.situacao === "a_orcar");
    const v = await req("PATCH", `/ordens-servico/${os1}/pecas/${pSem}`, { situacao: "" });
    ok("desmarcar volta a NULL", v.st === 200 && v.j.situacao === null);

    const orc1 = await novoOrc(os1);
    const bloco = await req("GET", `/admin/orcamentos/avulsos/${orc1}/pecas-da-os`);
    ok("bloco: a O.S. e as 3 peças, nenhuma orçada", bloco.st === 200 && bloco.j.os?.id === os1 && bloco.j.pecas.length === 3 && bloco.j.pecas.every(p => !p.orcada));

    // ── trazer ───────────────────────────────────────────────────────
    const t = await req("POST", `/admin/orcamentos/avulsos/${orc1}/linhas/da-os`, { pecas: [pUsada, pOrcar] });
    ok("trazer 2 → 201 e 2 linhas", t.st === 201 && t.j.linhas?.length === 2);
    const lU = (t.j.linhas || []).find(l => l.os_peca_id === pUsada);
    const lO = (t.j.linhas || []).find(l => l.os_peca_id === pOrcar);
    ok("a usada vem com peca_usada e natureza peça", lU && lU.peca_usada === true && lU.natureza === "peca");
    ok("a de orçar vem sem peca_usada", lO && lO.peca_usada === false);
    ok("de novo no mesmo orçamento → 409", (await req("POST", `/admin/orcamentos/avulsos/${orc1}/linhas/da-os`, { pecas: [pUsada] })).st === 409);
    const orc1b = await novoOrc(os1);
    ok("em OUTRO orçamento da mesma O.S. → 409", (await req("POST", `/admin/orcamentos/avulsos/${orc1b}/linhas/da-os`, { pecas: [pOrcar] })).st === 409);
    const os2 = await novaOs(false, 2);
    const pOutra = await peca(os2, "Luva", "usada");
    ok("peça de outra O.S. → 400", (await req("POST", `/admin/orcamentos/avulsos/${orc1}/linhas/da-os`, { pecas: [pOutra] })).st === 400);
    ok("lista vazia → 400", (await req("POST", `/admin/orcamentos/avulsos/${orc1}/linhas/da-os`, { pecas: [] })).st === 400);

    const det = await req("GET", `/ordens-servico/${os1}`);
    const dU = (det.j.pecas || []).find(p => p.id === pUsada);
    ok("a O.S. diz onde a peça foi orçada", dU && dU.orcamento_id === orc1 && dU.orcamento_status === "rascunho");

    // recusado libera
    await pool.query("UPDATE orcamentos SET status = 'rejeitado' WHERE id = $1", [orc1]);
    ok("orçamento recusado libera a peça", (await req("POST", `/admin/orcamentos/avulsos/${orc1b}/linhas/da-os`, { pecas: [pOrcar] })).st === 201);

    // ── cobrar as usadas, sem pedido do técnico ──────────────────────
    const c = await req("POST", `/admin/orcamentos/da-os/${os2}/cobrar-usadas`);
    if (c.j.orcamento_id) orcs.push(c.j.orcamento_id);
    ok("cobrar usadas sem pedido → cria o orçamento", c.st === 201 && c.j.criado === true && c.j.linhas?.length === 1 && c.j.linhas[0].peca_usada === true);
    const oc = (await pool.query("SELECT os_id, origem, status FROM orcamentos WHERE id = $1", [c.j.orcamento_id])).rows[0];
    ok("o orçamento é da O.S., origem os, rascunho", oc && oc.os_id === os2 && oc.origem === "os" && oc.status === "rascunho");
    ok("cobrar de novo → 400 (nada sem cobrança)", (await req("POST", `/admin/orcamentos/da-os/${os2}/cobrar-usadas`)).st === 400);
    await peca(os2, "Cabo PP 2,5mm", "usada");
    await pool.query("UPDATE orcamentos SET status = 'enviado' WHERE id = $1", [c.j.orcamento_id]);
    ok("orçamento da O.S. já enviado → 409 com o id", await req("POST", `/admin/orcamentos/da-os/${os2}/cobrar-usadas`).then(x => x.st === 409 && x.j.orcamento_id === c.j.orcamento_id));

    // ── "Fazer orçamento" de um pedido traz as marcadas ─────────────
    const os3 = await novaOs(true, 3);
    await peca(os3, "Registro 2", "a_orcar");
    await peca(os3, "Contator", "usada");
    await peca(os3, "Sem marca", null);
    const f = await req("PATCH", `/admin/orcamentos/${os3}`, { acao: "salvar", constatacao: "" });
    const orc3 = (await pool.query("SELECT id FROM orcamentos WHERE os_id = $1", [os3])).rows[0]?.id;
    if (orc3) orcs.push(orc3);
    const l3 = orc3 ? (await pool.query("SELECT os_peca_id, peca_usada FROM orcamento_linhas WHERE orcamento_id = $1", [orc3])).rows : [];
    ok("Fazer orçamento → 200 e traz só as 2 marcadas", f.st === 200 && l3.length === 2 && l3.filter(x => x.peca_usada).length === 1);

    // ── PDF: os dois blocos ──────────────────────────────────────────
    const d3 = await pdf.buscarDadosAvulso(orc3);
    const html = pdf.renderHTML(d3, 120, {});
    ok("PDF com peça usada: bloco 'Peças utilizadas na visita de'", /Peças utilizadas na visita de \d{2}\/\d{2}\/\d{4}/.test(html));
    ok("PDF: bloco 'Peças e serviços a executar'", html.includes("Peças e serviços a executar"));
    ok("PDF: a usada vem antes da de instalar", html.indexOf("Contator") < html.indexOf("Registro 2"));
    const orcSem = await novoOrc(null);
    await pool.query("INSERT INTO orcamento_linhas (orcamento_id, descricao, quantidade, valor_unitario) VALUES ($1, 'Item', 1, 10)", [orcSem]);
    const htmlSem = pdf.renderHTML(await pdf.buscarDadosAvulso(orcSem), 120, {});
    ok("PDF sem peça usada: sem blocos (o de sempre)", !htmlSem.includes("class=\"it-grupo\"") && !htmlSem.includes("Peças utilizadas"));

    // ── PDF da O.S.: a peça a orçar não é chamada de usada ───────────
    const osPdf = require("../../src/services/os-pdf.service")._paraTeste;
    const hOs = osPdf.renderHTML(await osPdf.buscarDadosOS(os1));
    const iUsadas = hOs.indexOf("Peças Usadas / Substituídas"), iOrcar = hOs.indexOf("Peças Necessárias (a orçar)");
    ok("PDF da O.S.: os dois blocos", iUsadas > -1 && iOrcar > iUsadas);
    ok("PDF da O.S.: o registro (a orçar) fica no bloco a orçar", hOs.indexOf("Registro de gaveta") > iOrcar);
    ok("PDF da O.S.: a sem marcação fica no bloco de sempre", hOs.indexOf("Boia elétrica") > iUsadas && hOs.indexOf("Boia elétrica") < iOrcar);

    // ── a marca da linha ─────────────────────────────────────────────
    const pu = await req("PATCH", `/admin/orcamentos/avulsos/linhas/${lO.id}`, { peca_usada: true });
    ok("PATCH peca_usada na linha", pu.st === 200 && pu.j.peca_usada === true);
  } catch (e) {
    ok("sem exceção: " + e.message, false);
  } finally {
    if (orcs.length) await pool.query("DELETE FROM orcamentos WHERE id = ANY($1::int[])", [orcs]);
    if (oss.length) {
      await pool.query("DELETE FROM orcamentos WHERE os_id = ANY($1::int[])", [oss]);
      await pool.query("DELETE FROM ordens_servico WHERE id = ANY($1::int[])", [oss]);
    }
    if (tecId) await pool.query("DELETE FROM tecnicos WHERE id = $1", [tecId]);
    server.close();
    await pool.end();
  }

  for (const [nome, c] of r) console.log(`${c ? "✓" : "✗"} ${nome}`);
  const passou = r.filter(x => x[1]).length;
  console.log(`\n${passou}/${r.length} passaram`);
  process.exit(passou === r.length ? 0 : 1);
})();
