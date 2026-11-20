// Teste das peças no orçamento, fase C, primeira parte (20/11/2026): a fila do
// Hoje com as O.S. que têm peça USADA na visita fora de orçamento. Roda com
// `node scripts/testes/pecas-sem-cobranca.test.js`.
//
// O que prova (GET /admin/orcamentos/pecas-sem-cobranca):
//   - a O.S. com peça usada fora de orçamento aparece, uma linha por O.S.,
//     com a contagem e os nomes;
//   - peça "a orçar" e peça sem marcação NÃO contam (só a usada é dinheiro
//     esquecido);
//   - peça num orçamento (rascunho, enviado, aprovado) sai da fila; num
//     orçamento RECUSADO volta (a mesma regra da trava da fase B);
//   - cobrar as usadas pela rota tira a O.S. da fila;
//   - o Hoje (admin-carteira.js) busca a rota e a ação abre a O.S.
//
// ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do `.env`) e limpa o que
// criou no `finally`. Não roda com NODE_ENV=production.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
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
    tecId = (await pool.query("INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", [`Tec SemCob ${sufixo}`])).rows[0].id;
    const req = async (metodo, url, body) => {
      const resp = await fetch(base + url, { method: metodo, headers: H, body: body ? JSON.stringify(body) : undefined });
      return { st: resp.status, j: await resp.json().catch(() => ({})) };
    };
    const novaOs = async (n) => {
      const id = (await pool.query(
        `INSERT INTO ordens_servico (numero, condominio_id, tecnico_id, chegada_em, finalizada_em)
         VALUES ($1, $2, $3, now() - interval '1 day', now()) RETURNING id`,
        [`OS-SC${n}-${sufixo}`, condoId, tecId]
      )).rows[0].id;
      oss.push(id);
      return id;
    };
    const peca = async (osId, descricao, situacao) => (await pool.query(
      "INSERT INTO os_pecas (os_id, descricao, quantidade, situacao) VALUES ($1, $2, 1, $3) RETURNING id",
      [osId, descricao, situacao]
    )).rows[0].id;
    const novoOrc = async (osId, status) => {
      const id = (await pool.query(
        "INSERT INTO orcamentos (numero, condominio_id, os_id, status, origem, criado_por) VALUES ($1, $2, $3, $4, 'os', $5) RETURNING id",
        [`ORC-SC-${sufixo}-${orcs.length}`, condoId, osId, status, u.id]
      )).rows[0].id;
      orcs.push(id);
      return id;
    };
    const linha = (orcId, pecaId) => pool.query(
      "INSERT INTO orcamento_linhas (orcamento_id, descricao, quantidade, natureza, os_peca_id, peca_usada) VALUES ($1, 'x', 1, 'peca', $2, true) RETURNING id",
      [orcId, pecaId]
    ).then(x => x.rows[0].id);
    const fila = async () => {
      const x = await req("GET", "/admin/orcamentos/pecas-sem-cobranca");
      return { st: x.st, minhas: (Array.isArray(x.j) ? x.j : []).filter(i => oss.includes(i.os_id)) };
    };

    const osA = await novaOs(1);   // 2 usadas + 1 a orçar + 1 sem marcação
    const pA1 = await peca(osA, "Contator 32 A", "usada");
    await peca(osA, "Boia elétrica", "usada");
    await peca(osA, "Registro 2", "a_orcar");
    await peca(osA, "Sem marca", null);
    const osB = await novaOs(2);   // só a orçar e sem marcação
    await peca(osB, "Luva", "a_orcar");
    await peca(osB, "Cabo", null);

    let f = await fila();
    const a = f.minhas.find(i => i.os_id === osA);
    ok("200", f.st === 200);
    ok("a O.S. com usadas aparece, uma linha só", f.minhas.filter(i => i.os_id === osA).length === 1);
    ok("conta só as 2 usadas", a && a.pecas === 2);
    ok("traz os nomes, o condomínio e o técnico", a && a.descricoes?.join("|") === "Contator 32 A|Boia elétrica" && a.tecnico_nome === `Tec SemCob ${sufixo}` && a.condominio_id === condoId);
    ok("a O.S. sem peça usada não aparece", !f.minhas.some(i => i.os_id === osB));

    // peça num orçamento sai da fila; recusado devolve
    const orc = await novoOrc(osA, "rascunho");
    await linha(orc, pA1);
    f = await fila();
    ok("peça em rascunho sai da conta (fica 1)", f.minhas.find(i => i.os_id === osA)?.pecas === 1);
    for (const st of ["enviado", "aprovado"]) {
      await pool.query("UPDATE orcamentos SET status = $1 WHERE id = $2", [st, orc]);
      f = await fila();
      ok(`peça em orçamento ${st} continua fora`, f.minhas.find(i => i.os_id === osA)?.pecas === 1);
    }
    await pool.query("UPDATE orcamentos SET status = 'rejeitado' WHERE id = $1", [orc]);
    f = await fila();
    ok("orçamento recusado devolve a peça à fila (2 de novo)", f.minhas.find(i => i.os_id === osA)?.pecas === 2);

    // cobrar pela rota da fase B tira a O.S. da fila
    const osC = await novaOs(3);
    await peca(osC, "Selo mecânico", "usada");
    f = await fila();
    ok("a O.S. nova entra", f.minhas.some(i => i.os_id === osC));
    const c = await req("POST", `/admin/orcamentos/da-os/${osC}/cobrar-usadas`);
    if (c.j.orcamento_id) orcs.push(c.j.orcamento_id);
    f = await fila();
    ok("cobrar as usadas tira a O.S. da fila", c.st === 201 && !f.minhas.some(i => i.os_id === osC));

    // o Hoje
    const front = fs.readFileSync(path.join(__dirname, "../../public/admin-carteira.js"), "utf8");
    ok("o Hoje busca a rota", front.includes('fetch("/admin/orcamentos/pecas-sem-cobranca"'));
    const bloco = front.slice(front.indexOf("for (const x of (_icPecasSemCobranca"), front.indexOf("const os = Array.isArray(_osData)"));
    ok("a ação do Hoje é Cobrar e abre a O.S.", /acao: "Cobrar"/.test(bloco) && /data-ic-os="\$\{x\.os_id\}"/.test(bloco));
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
