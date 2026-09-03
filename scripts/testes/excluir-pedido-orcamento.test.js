// Teste da rota DELETE /admin/orcamentos/:os_id — o "excluir pedido" da aba de
// orçamentos. Roda com `node scripts/testes/excluir-pedido-orcamento.test.js`.
//
// ⚠️ POR QUE ROTA DE VERDADE, e não a query solta: o CLAUDE.md registra que
// query com `$n` repetido só se prova exercitando o endpoint (foi assim que o
// `POST /cliente/orcamentos/:id/responder` ficou quebrado por semanas com
// 42P08). Esta usa `$1` em três lugares — DELETE, UPDATE e o CTE.
//
// ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do `.env`) e limpa o que
// criou no `finally`. Não roda com NODE_ENV=production: aí `src/db-url.js`
// aponta para a Railway.
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

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const porta = server.address().port;
  const base = `http://127.0.0.1:${porta}`;

  let osId = null, orcId = null, condoId = null, userId = null;

  try {
    condoId = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0]?.id ?? null;
    const u = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!u.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    userId = u.rows[0].id;
    const token = jwt.sign({ id: userId, role: u.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // ── O cenário do relato: pedido do técnico + orçamento nascido dele ────
    // `numero` e VARCHAR(20): o timestamp inteiro estoura.
    const sufixo = String(Date.now()).slice(-9);
    const numero = `OS-T-${sufixo}`;
    osId = (await pool.query(
      `INSERT INTO ordens_servico (numero, condominio_id, orcamento_necessario, orcamento_observacoes)
       VALUES ($1, $2, TRUE, 'pedido de teste') RETURNING id`,
      [numero, condoId]
    )).rows[0].id;

    orcId = (await pool.query(
      `INSERT INTO orcamentos (numero, condominio_id, status, os_id, criado_por)
       VALUES ($1, $2, 'enviado', $3, $4) RETURNING id`,
      [`ORC-T-${sufixo}`, condoId, osId, userId]
    )).rows[0].id;

    await pool.query(
      `INSERT INTO orcamento_linhas (orcamento_id, descricao, quantidade, valor_unitario)
       VALUES ($1, 'item de teste', 2, 10.00)`,
      [orcId]
    );

    // O pedido aparece na aba antes de qualquer coisa.
    const antes = await (await fetch(`${base}/admin/orcamentos`, { headers: H })).json();
    ok("o pedido aparece na aba", antes.some(x => x.id === osId));

    // ── A rota ────────────────────────────────────────────────────────────
    const resp = await fetch(`${base}/admin/orcamentos/${osId}`, { method: "DELETE", headers: H });
    const corpo = await resp.json().catch(() => ({}));
    ok("responde 200 (o 42P08 do $1 repetido apareceria aqui)", resp.status === 200);
    ok("diz quantos orçamentos apagou", corpo.orcamentos_apagados === 1);

    const dep = (await pool.query(
      `SELECT (SELECT orcamento_necessario FROM ordens_servico WHERE id=$1)        AS flag,
              (SELECT orcamento_observacoes FROM ordens_servico WHERE id=$1)       AS obs,
              (SELECT count(*)::int FROM orcamentos WHERE os_id=$1)                AS orcs,
              (SELECT count(*)::int FROM orcamento_linhas WHERE orcamento_id=$2)   AS linhas`,
      [osId, orcId]
    )).rows[0];

    ok("desliga o pedido na O.S.", dep.flag === false);
    ok("apaga o orçamento vinculado", dep.orcs === 0);
    ok("os itens vão junto (CASCADE)", dep.linhas === 0);
    ok("a O.S. continua existindo", dep.obs === "pedido de teste");

    // ⚠️ O que o bug era: a linha voltava no próximo carregamento.
    const depois = await (await fetch(`${base}/admin/orcamentos`, { headers: H })).json();
    ok("a linha NÃO volta na aba", !depois.some(x => x.id === osId));

    // ── Bordas ────────────────────────────────────────────────────────────
    const r404 = await fetch(`${base}/admin/orcamentos/999999999`, { method: "DELETE", headers: H });
    ok("O.S. inexistente → 404", r404.status === 404);

    const r400 = await fetch(`${base}/admin/orcamentos/abc`, { method: "DELETE", headers: H });
    ok("id não numérico → 400", r400.status === 400);

    const rSem = await fetch(`${base}/admin/orcamentos/${osId}`, { method: "DELETE" });
    ok("sem token → 401", rSem.status === 401);

    // O avulso não é alcançado: `DELETE /orcamentos/avulsos/:id` tem 3
    // segmentos e continua batendo na rota dele, não nesta.
    const rAvulso = await fetch(`${base}/admin/orcamentos/avulsos/999999999`, { method: "DELETE", headers: H });
    ok("a rota do avulso não foi capturada por esta", rAvulso.status !== 400 && rAvulso.status !== 404);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    if (orcId) await pool.query("DELETE FROM orcamentos WHERE id=$1", [orcId]).catch(() => {});
    if (osId)  await pool.query("DELETE FROM ordens_servico WHERE id=$1", [osId]).catch(() => {});
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
  console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
  if (falhas.length) process.exitCode = 1;
})();
