// Teste do "Excluir permanentemente" do condomínio (DELETE /condominios/:id/hard)
// e da lixeira (migration 089). Roda com
// `node scripts/testes/hard-delete-protege-os.test.js`.
//
// ⚠️ POR QUE ESTE TESTE EXISTE. Em 11/11/2026 o Pedro deu falta das primeiras
// O.S. de produção (1–13), junto com os chamados 1–72 e os orçamentos 1–42.
// O caminho era este: o hard delete do condomínio apaga em cascata O.S.,
// fotos, peças, chamados e orçamentos — e o modal só falava em "reservatórios,
// leituras e alertas". Não sobrou cópia nem registro de quais eram.
//
// O que se prova aqui, contra a rota de verdade:
//   1. prédio com O.S. FINALIZADA → 409, e nada é apagado;
//   2. prédio só com rascunho → apaga, mas cada linha deixa cópia em
//      registros_apagados, com o contexto de quem apagou;
//   3. um DELETE solto (fora de qualquer rota) também deixa cópia — a lixeira
//      mora no banco, não no código.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { alvo } = resolverDatabaseUrl();

if (alvo !== "TESTE") {
  console.error(`Recusando rodar: o banco resolvido é ${alvo}, não TESTE.`);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/condominios", require("../../src/routes/condominios.routes").condominiosRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);
const SENHA = "senha-de-teste-hard-delete";

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const sufixo = String(Date.now()).slice(-8);
  const lixo = { condos: [], os: [], chamados: [], usuario: null };

  try {
    // Admin descartável com senha conhecida — a rota confere a senha.
    const hash = await bcrypt.hash(SENHA, 4);
    lixo.usuario = (await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role)
       VALUES ('Teste hard delete', $1, $2, 'admin') RETURNING id`,
      [`hard-delete-${sufixo}@teste.local`, hash]
    )).rows[0].id;
    const token = jwt.sign({ id: lixo.usuario, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const excluir = (id, senha = SENHA) =>
      fetch(`${base}/condominios/${id}/hard`, { method: "DELETE", headers: H, body: JSON.stringify({ senha }) });

    const novoCondo = async (nome) => {
      const id = (await pool.query(
        "INSERT INTO condominios (nome) VALUES ($1) RETURNING id", [nome]
      )).rows[0].id;
      lixo.condos.push(id);
      return id;
    };
    const novoChamado = async (condoId) => {
      const id = (await pool.query(
        "INSERT INTO chamados (titulo, condominio_id) VALUES ('chamado teste hard delete', $1) RETURNING id",
        [condoId]
      )).rows[0].id;
      lixo.chamados.push(id);
      return id;
    };
    const novaOS = async (condoId, chamadoId, finalizada, tag) => {
      const id = (await pool.query(
        `INSERT INTO ordens_servico (numero, condominio_id, chamado_id, finalizada_em)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [`OS-HD${tag}-${sufixo}`, condoId, chamadoId, finalizada ? new Date() : null]
      )).rows[0].id;
      lixo.os.push(id);
      return id;
    };

    // ── 1. Prédio com O.S. finalizada: recusa ────────────────────────────
    const cA = await novoCondo(`Teste HD com histórico ${sufixo}`);
    const chA = await novoChamado(cA);
    const osA = await novaOS(cA, chA, true, "A");
    await pool.query("INSERT INTO os_pecas (os_id, descricao, quantidade) VALUES ($1, 'peça teste', 1)", [osA]);

    const rA = await excluir(cA);
    const bA = await rA.json().catch(() => ({}));
    ok("prédio com O.S. finalizada → 409", rA.status === 409);
    ok("a mensagem manda inativar", /Inativar/.test(bA.error || ""));
    ok("diz quantas O.S. finalizadas", bA.os_finalizadas === 1);
    const aindaA = await pool.query(
      `SELECT (SELECT count(*) FROM condominios WHERE id=$1)::int c,
              (SELECT count(*) FROM ordens_servico WHERE id=$2)::int o,
              (SELECT count(*) FROM chamados WHERE id=$3)::int ch,
              (SELECT count(*) FROM os_pecas WHERE os_id=$2)::int p`,
      [cA, osA, chA]
    );
    ok("nada foi apagado (condomínio, O.S., chamado, peça)",
      JSON.stringify(aindaA.rows[0]) === JSON.stringify({ c: 1, o: 1, ch: 1, p: 1 }));

    // Senha errada continua barrando antes de tudo.
    ok("senha errada → 401", (await excluir(cA, "errada")).status === 401);

    // ── 2. Prédio só com rascunho: apaga, com cópia ──────────────────────
    const cB = await novoCondo(`Teste HD sem histórico ${sufixo}`);
    const chB = await novoChamado(cB);
    const osB = await novaOS(cB, chB, false, "B");

    const rB = await excluir(cB);
    ok("prédio só com rascunho → 200", rB.status === 200);
    ok("o condomínio saiu",
      (await pool.query("SELECT 1 FROM condominios WHERE id=$1", [cB])).rowCount === 0);

    const copias = await pool.query(
      `SELECT tabela, registro_id, contexto, dados FROM registros_apagados
        WHERE (tabela='condominios' AND registro_id=$1)
           OR (tabela='ordens_servico' AND registro_id=$2)
           OR (tabela='chamados' AND registro_id=$3)`,
      [String(cB), String(osB), String(chB)]
    );
    const porTabela = Object.fromEntries(copias.rows.map((x) => [x.tabela, x]));
    ok("lixeira guardou o condomínio", !!porTabela.condominios);
    ok("lixeira guardou a O.S.", !!porTabela.ordens_servico);
    ok("lixeira guardou o chamado", !!porTabela.chamados);
    ok("a cópia da O.S. tem a linha inteira",
      porTabela.ordens_servico?.dados?.numero === `OS-HDB-${sufixo}`);
    ok("o contexto diz quem apagou e por onde",
      (porTabela.ordens_servico?.contexto || "").includes(`hard delete do condomínio ${cB} pelo usuário ${lixo.usuario}`));

    // ── 3. DELETE solto, fora de rota: também deixa cópia ────────────────
    await pool.query("DELETE FROM os_pecas WHERE os_id=$1", [osA]);
    const solta = await pool.query(
      "SELECT contexto FROM registros_apagados WHERE tabela='os_pecas' AND (dados->>'os_id')=$1",
      [String(osA)]
    );
    ok("DELETE direto no banco também vai para a lixeira", solta.rowCount === 1);
    ok("sem contexto quando ninguém disse o motivo", solta.rows[0]?.contexto === null);
  } catch (e) {
    ok(`sem exceção (${e.message})`, false);
  } finally {
    for (const id of lixo.os) await pool.query("DELETE FROM ordens_servico WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
    if (lixo.usuario) await pool.query("DELETE FROM usuarios WHERE id=$1", [lixo.usuario]).catch(() => {});
    // A própria limpeza do teste encheu a lixeira do banco de teste — tira.
    await pool.query(
      `DELETE FROM registros_apagados
        WHERE (tabela='condominios' AND registro_id = ANY($1::text[]))
           OR (tabela='ordens_servico' AND registro_id = ANY($2::text[]))
           OR (tabela='chamados' AND registro_id = ANY($3::text[]))
           OR (tabela IN ('os_pecas','os_fotos') AND (dados->>'os_id') = ANY($2::text[]))
           OR (tabela='historico_chamados' AND (dados->>'chamado_id') = ANY($3::text[]))
           OR (tabela='usuarios' AND registro_id=$4)`,
      [lixo.condos.map(String), lixo.os.map(String), lixo.chamados.map(String), String(lixo.usuario)]
    ).catch(() => {});
    server.close();
    await pool.end();
  }

  let falhas = 0;
  for (const [nome, cond] of r) {
    console.log(`${cond ? "✓" : "✗"} ${nome}`);
    if (!cond) falhas++;
  }
  console.log(`\n${r.length - falhas}/${r.length}`);
  process.exit(falhas ? 1 : 0);
})();
