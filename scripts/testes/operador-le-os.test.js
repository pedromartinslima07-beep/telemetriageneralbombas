// O operador passou a LER O.S., e não a escrever (03/09/2026).
//
//   node scripts/testes/operador-le-os.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE: o RBAC de 27/08 é o tipo de coisa que se
// afrouxa uma vez e ninguém percebe que afrouxou demais. A tela de Aprovados
// precisava que o operador ABRISSE a O.S. do serviço que ele despachou; o que
// não pode acontecer é ele passar a EDITAR o que foi medido no prédio por
// quem esteve lá.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/ordens-servico", require("../../src/routes/ordens-servico.routes").ordensServicoRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  let osId = null;

  try {
    const condo = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0];
    const sufixo = String(Date.now()).slice(-9);
    const ins = await pool.query(
      `INSERT INTO ordens_servico (numero, condominio_id) VALUES ($1, $2) RETURNING id`,
      ["OS-T-" + sufixo, condo ? condo.id : null]
    );
    osId = ins.rows[0].id;

    const tk = (role) => jwt.sign({ id: 999999, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const bater = (role, metodo, caminho, corpo) => fetch(base + "/ordens-servico/" + osId + caminho, {
      method: metodo,
      headers: { Authorization: "Bearer " + tk(role), "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

    // ── Lê ────────────────────────────────────────────────────────────────
    const rLer = await bater("operador", "GET", "");
    ok("operador lê a ficha da O.S.", rLer.status === 200);

    // O PDF pode faltar em disco (404 do arquivo) — o que importa é NÃO ser
    // 403: a permissão passou, o resto é o estado do arquivo.
    const rPdf = await bater("operador", "GET", "/pdf");
    ok("operador não toma 403 no PDF", rPdf.status !== 403);

    // ── Não escreve ───────────────────────────────────────────────────────
    const rEsc = await bater("operador", "PATCH", "", { observacoes: "não deveria entrar" });
    ok("operador NÃO edita a O.S. (403)", rEsc.status === 403);

    const rPeca = await bater("operador", "POST", "/pecas", { descricao: "peça de teste" });
    ok("operador NÃO lança peça (403)", rPeca.status === 403);

    const rFim = await bater("operador", "POST", "/finalizar", {});
    ok("operador NÃO finaliza a O.S. (403)", rFim.status === 403);

    const conf = await pool.query("SELECT observacoes FROM ordens_servico WHERE id = $1", [osId]);
    ok("e nada entrou no banco", conf.rows[0].observacoes === null);

    // ── Quem já podia continua podendo, quem não podia continua fora ──────
    const rAdmin = await bater("admin", "GET", "");
    ok("admin continua lendo", rAdmin.status === 200);
    const rGer = await bater("gerente", "PATCH", "", { observacoes: "gerente pode" });
    ok("gerente continua escrevendo", rGer.status === 200);

    const rCli = await bater("cliente", "GET", "");
    ok("cliente continua de fora (403)", rCli.status === 403);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    if (osId) await pool.query("DELETE FROM ordens_servico WHERE id=$1", [osId]).catch(() => {});
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
