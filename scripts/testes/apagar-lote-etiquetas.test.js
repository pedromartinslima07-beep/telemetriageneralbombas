// Teste da rota DELETE /equipamentos/lote/:lote — o botão "Apagar lote" da tela
// de Equipamentos. Roda com `node scripts/testes/apagar-lote-etiquetas.test.js`.
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que rota que grava só se
// prova exercitando o endpoint. Aqui o que precisa de prova não é sintaxe, é a
// REGRA — que a etiqueta com histórico sobrevive ao "apagar o lote". Errar isso
// apaga a linha do tempo, que é o ativo do módulo, e ninguém percebe na hora.
//
// ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do `.env`) e limpa o que
// criou no `finally`.
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
app.use("/equipamentos", require("../../src/routes/equipamentos.routes").equipamentosRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const lote = `LTEST${String(Date.now()).slice(-6)}`;
  const criados = [];

  try {
    const admin = (await pool.query(
      "SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1"
    )).rows[0];
    const gerente = (await pool.query(
      "SELECT id FROM usuarios WHERE role = 'gerente' ORDER BY id LIMIT 1"
    )).rows[0];
    if (!admin) throw new Error("nenhum usuário admin no banco de teste");

    const tok = (id, role) =>
      jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: `Bearer ${tok(admin.id, "admin")}` };

    // Três etiquetas no mesmo lote: duas virgens e uma "usada".
    const cod = (n) => `TST${String(Date.now()).slice(-4)}${n}`;
    for (let i = 0; i < 3; i++) {
      const id = (await pool.query(
        `INSERT INTO equipamentos (codigo, lote, status) VALUES ($1, $2, 'etiqueta_livre')
         RETURNING id`,
        [cod(i), lote]
      )).rows[0].id;
      criados.push(id);
    }
    // A terceira ganha histórico — é a que NÃO pode sumir.
    await pool.query(
      `INSERT INTO equipamento_movimentacoes (equipamento_id, tipo, status_novo, usuario_id, usuario_nome)
       VALUES ($1, 'anotacao', NULL, $2, 'teste')`,
      [criados[2], admin.id]
    );
    await pool.query(`UPDATE equipamentos SET status='oficina' WHERE id=$1`, [criados[2]]);

    // ── Permissão ─────────────────────────────────────────────────────────
    const rSem = await fetch(`${base}/equipamentos/lote/${lote}`, { method: "DELETE" });
    ok("sem token → 401", rSem.status === 401);

    if (gerente) {
      const rGer = await fetch(`${base}/equipamentos/lote/${lote}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${tok(gerente.id, "gerente")}` },
      });
      ok("gerente → 403 (só admin master apaga)", rGer.status === 403);
    } else {
      ok("gerente → 403 (pulado: sem gerente no banco)", true);
    }

    const rTec = await fetch(`${base}/equipamentos/lote/${lote}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${tok(admin.id, "tecnico")}` },
    });
    ok("técnico → 403", rTec.status === 403);

    // ── Bordas ────────────────────────────────────────────────────────────
    const r404 = await fetch(`${base}/equipamentos/lote/NAOEXISTE999`, { method: "DELETE", headers: H });
    ok("lote inexistente → 404", r404.status === 404);

    // ── O caso que importa ────────────────────────────────────────────────
    const res = await fetch(`${base}/equipamentos/lote/${lote}`, { method: "DELETE", headers: H });
    const body = await res.json();
    ok("admin master → 200", res.status === 200);
    ok("apagou as 2 virgens", body.apagados === 2);
    ok("preservou 1 com histórico", body.preservados?.length === 1);
    ok("diz qual foi preservada", !!body.preservados?.[0]?.codigo);

    const sobrou = await pool.query(`SELECT id FROM equipamentos WHERE lote = $1`, [lote]);
    ok("no banco sobrou exatamente a usada", sobrou.rows.length === 1);
    ok("e é a que tinha histórico", sobrou.rows[0]?.id === criados[2]);

    const movs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM equipamento_movimentacoes WHERE equipamento_id = $1`,
      [criados[2]]
    );
    ok("o histórico dela continua lá", movs.rows[0].n === 1);

    // Segunda passada: o que sobrou não é virgem, então nada mais é apagado.
    const res2 = await fetch(`${base}/equipamentos/lote/${lote}`, { method: "DELETE", headers: H });
    const body2 = await res2.json();
    ok("repetir não apaga a usada", body2.apagados === 0 && body2.preservados.length === 1);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of criados) {
      await pool.query("DELETE FROM equipamento_movimentacoes WHERE equipamento_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM equipamentos WHERE id=$1", [id]).catch(() => {});
    }
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
  console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
  if (falhas.length) process.exitCode = 1;
})();
