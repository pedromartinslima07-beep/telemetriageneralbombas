// Teste da rota PATCH /admin/orcamentos/avulsos/:id — o vínculo do orçamento
// com a O.S. Roda com `node scripts/testes/orcamento-vincula-os.test.js`.
//
// ⚠️ O QUE ELE PROVA é o bug do relato do Pedro (03/09/2026): *"fiz um
// orçamento e estou tentando vincular ele a uma os e nao estou conseguindo,
// qnd eu salvo o orçamento volta para 'nenhuma'"*.
//
// O vínculo SEMPRE foi gravado no banco. O que faltava era `os_id` no
// `RETURNING` da rota: o `admin.js` faz `Object.assign(_avData[idx], j)` e
// redesenha o modal a partir do estado local, e `Object.assign` não toca em
// chave ausente — então o front continuava com o valor de antes e o `<select>`
// voltava para "Nenhuma". Um bug de RESPOSTA que parecia bug de escrita.
//
// Por isso o teste não se contenta em conferir o banco: ele **simula o
// `Object.assign` do front**. Um teste que só olhasse a tabela passaria verde
// com o bug de pé — foi exatamente o que a tela fez com o Pedro.
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

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const porta = server.address().port;
  const base = `http://127.0.0.1:${porta}`;

  let osId = null, orcId = null, tecId = null;

  try {
    const condoId = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0]?.id ?? null;
    const u = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!u.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const token = jwt.sign({ id: u.rows[0].id, role: u.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // `numero` é VARCHAR(20): o timestamp inteiro estoura.
    const sufixo = String(Date.now()).slice(-9);

    tecId = (await pool.query(
      `INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id`,
      [`Tec Teste ${sufixo}`]
    )).rows[0].id;

    osId = (await pool.query(
      `INSERT INTO ordens_servico (numero, condominio_id, tecnico_id, orcamento_necessario, orcamento_observacoes)
       VALUES ($1, $2, $3, TRUE, 'trocar o selo da bomba 2') RETURNING id`,
      [`OS-T-${sufixo}`, condoId, tecId]
    )).rows[0].id;

    // O orçamento nasce SEM vínculo — é o cenário do relato.
    orcId = (await pool.query(
      `INSERT INTO orcamentos (numero, condominio_id, status, origem, criado_por)
       VALUES ($1, $2, 'rascunho', 'admin', $3) RETURNING id`,
      [`ORC-T-${sufixo}`, condoId, u.rows[0].id]
    )).rows[0].id;

    const patch = async (body) => {
      const resp = await fetch(`${base}/admin/orcamentos/avulsos/${orcId}`, {
        method: "PATCH", headers: H, body: JSON.stringify(body),
      });
      return { st: resp.status, j: await resp.json().catch(() => ({})) };
    };
    const noBanco = async () =>
      (await pool.query("SELECT os_id FROM orcamentos WHERE id=$1", [orcId])).rows[0].os_id;

    // O estado local do painel, como o `admin.js` o mantém.
    const front = { id: orcId, os_id: null, os_numero: null, os_tecnico_nome: null, orcamento_observacoes: null };

    // ── 1. VINCULAR ───────────────────────────────────────────────────────
    // O payload é o que `_avSalvar()` monta: tudo string, vindo de `<select>`.
    let { st, j } = await patch({
      os_id: String(osId), condominio_id: String(condoId), status: "rascunho",
    });
    ok("vincular responde 200", st === 200);
    ok("grava no banco", (await noBanco()) === osId);
    ok("a resposta traz os_id (era isto que faltava)", j.os_id === osId);
    ok("a resposta traz o número da O.S.", typeof j.os_numero === "string");
    ok("a resposta traz o técnico (trilho 'O que o técnico pediu')", j.os_tecnico_nome === `Tec Teste ${sufixo}`);
    ok("a resposta traz o pedido do técnico", j.orcamento_observacoes === "trocar o selo da bomba 2");

    Object.assign(front, j);
    ok("O RELATO: o <select> NÃO volta para 'Nenhuma'", front.os_id === osId);

    // ── 2. DESVINCULAR ────────────────────────────────────────────────────
    ({ st, j } = await patch({ os_id: null, condominio_id: String(condoId) }));
    ok("desvincular responde 200", st === 200);
    ok("zera no banco", (await noBanco()) === null);
    ok("a resposta traz os_id null", j.os_id === null);
    // ⚠️ As chaves derivadas vêm SEMPRE. Devolvidas só quando há vínculo,
    // `Object.assign` deixaria as antigas e o trilho seguiria mostrando o
    // técnico de uma O.S. que não está mais ligada.
    ok("os derivados zeram junto", j.os_numero === null && j.os_tecnico_nome === null);
    Object.assign(front, j);
    ok("o front desvincula de verdade", front.os_id === null && front.os_tecnico_nome === null);

    // ── 3. STRING VAZIA ───────────────────────────────────────────────────
    // O `_avSalvar()` manda `select.value || null`, então hoje o vazio já sai
    // como null. Mas `os_id` caía no ramo genérico do PATCH, que faz
    // `String(v).slice(0,255)` — e `""` numa coluna integer é `22P02`, um 500
    // que derrubaria o salvamento inteiro. Cinto de segurança.
    ({ st, j } = await patch({ os_id: "", condominio_id: String(condoId) }));
    ok("os_id vazio não estoura (22P02)", st === 200);
    ok("os_id vazio vira null", j.os_id === null);

    // ── 4. A LISTA CONCORDA COM O PATCH ───────────────────────────────────
    await patch({ os_id: String(osId), condominio_id: String(condoId) });
    const lista = await (await fetch(`${base}/admin/orcamentos/avulsos`, { headers: H })).json();
    const naLista = lista.find((x) => x.id === orcId);
    ok("o GET da lista mostra o mesmo vínculo", naLista && naLista.os_id === osId);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    if (orcId) await pool.query("DELETE FROM orcamentos WHERE id=$1", [orcId]).catch(() => {});
    if (osId)  await pool.query("DELETE FROM ordens_servico WHERE id=$1", [osId]).catch(() => {});
    if (tecId) await pool.query("DELETE FROM tecnicos WHERE id=$1", [tecId]).catch(() => {});
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
  console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
  if (falhas.length) process.exitCode = 1;
})();
