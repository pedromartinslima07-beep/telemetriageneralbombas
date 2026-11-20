// Teste das peças no orçamento, fase A (20/11/2026): a linha do orçamento
// ligada ao produto do Omie. Roda com
// `node scripts/testes/orcamento-linha-produto.test.js`.
//
// O que prova:
//   - POST e PATCH da linha aceitam omie_produto_codigo e natureza, e
//     produto escolhido vira peça sozinho;
//   - TODA rota de linha devolve o produto junto (o editor troca a linha
//     inteira pela resposta: um PATCH de valor que devolvesse menos colunas
//     apagaria o produto da tela — o mesmo tipo de defeito do vínculo com a
//     O.S., ver orcamento-vincula-os.test.js);
//   - produto fora do catálogo ou inativo → 422; natureza inválida → 400;
//   - nota emitida trava produto e natureza (409), mas não o valor;
//   - a busca do editor (?historico=1) devolve "a última vez" de um
//     orçamento APROVADO, e não do próprio orçamento;
//   - a busca entende bitola: "registro de gaveta 2" acha um registro de 2".
//
// ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do `.env`) e limpa o que
// criou no `finally`. Não roda com NODE_ENV=production. Precisa do catálogo
// do Omie copiado no banco de teste (`omie_produtos`, migration 091).
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
app.use("/admin", require("../../src/routes/nota-fiscal.routes").notaFiscalRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const criados = [];

  try {
    const u = (await pool.query("SELECT id, role FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0];
    if (!u) throw new Error("nenhum admin no banco de teste");
    const H = { Authorization: `Bearer ${jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: "10m" })}`, "Content-Type": "application/json" };
    const condoId = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0]?.id ?? null;
    const prod = (await pool.query("SELECT codigo_produto, codigo FROM omie_produtos WHERE NOT inativo AND descricao ILIKE 'LUVA DE UNI%60MM' LIMIT 1")).rows[0]
      || (await pool.query("SELECT codigo_produto, codigo FROM omie_produtos WHERE NOT inativo LIMIT 1")).rows[0];
    if (!prod) throw new Error("catálogo do Omie vazio no banco de teste");
    const cod = Number(prod.codigo_produto);
    const sufixo = String(Date.now()).slice(-9);

    const novoOrc = async (status) => {
      const id = (await pool.query(
        `INSERT INTO orcamentos (numero, condominio_id, status, origem, criado_por) VALUES ($1, $2, $3, 'admin', $4) RETURNING id`,
        [`ORC-T-${sufixo}-${criados.length}`, condoId, status, u.id]
      )).rows[0].id;
      criados.push(id);
      return id;
    };
    const req = async (metodo, url, body) => {
      const resp = await fetch(base + url, { method: metodo, headers: H, body: body ? JSON.stringify(body) : undefined });
      return { st: resp.status, j: await resp.json().catch(() => ({})) };
    };

    // ── criar já ligada ──────────────────────────────────────────────
    const orc = await novoOrc("rascunho");
    const c = await req("POST", `/admin/orcamentos/avulsos/${orc}/linhas`, { descricao: "Luva de união 60mm", quantidade: 2, valor_unitario: 120, omie_produto_codigo: cod });
    ok("POST com produto → 201", c.st === 201);
    ok("POST devolve o produto e a natureza peça", Number(c.j.omie_produto_codigo) === cod && c.j.natureza === "peca" && c.j.produto_codigo === prod.codigo);
    const linha = c.j.id;

    // ── o PATCH de valor não apaga o produto da resposta ─────────────
    const v = await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { valor_unitario: 128 });
    ok("PATCH de valor → 200", v.st === 200);
    ok("PATCH de valor continua devolvendo o produto", Number(v.j.omie_produto_codigo) === cod && !!v.j.produto_descricao);

    // ── tirar e pôr de novo; natureza à mão ──────────────────────────
    const tira = await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { omie_produto_codigo: null });
    ok("tirar o produto → null, natureza fica", tira.st === 200 && tira.j.omie_produto_codigo == null && tira.j.natureza === "peca");
    const serv = await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { natureza: "servico" });
    ok("marcar serviço", serv.st === 200 && serv.j.natureza === "servico");
    const limpa = await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { natureza: "" });
    ok("natureza vazia → null", limpa.st === 200 && limpa.j.natureza == null);
    const poe = await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { omie_produto_codigo: cod, valor_unitario: 128 });
    ok("pôr o produto e o valor juntos (o $n repetido não estoura)", poe.st === 200 && Number(poe.j.omie_produto_codigo) === cod && Number(poe.j.valor_unitario) === 128 && poe.j.natureza === "peca");

    // ── recusas ──────────────────────────────────────────────────────
    ok("produto fora do catálogo → 422", (await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { omie_produto_codigo: 987654321987 })).st === 422);
    ok("natureza inválida → 400", (await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { natureza: "outra" })).st === 400);
    ok("POST com produto inválido → 422, sem criar", (await req("POST", `/admin/orcamentos/avulsos/${orc}/linhas`, { descricao: "x", omie_produto_codigo: 987654321987 })).st === 422);

    // ── GET das linhas traz o produto ────────────────────────────────
    const g = await req("GET", `/admin/orcamentos/avulsos/${orc}/linhas`);
    ok("GET das linhas: uma linha, com produto", g.st === 200 && g.j.length === 1 && g.j[0].produto_codigo === prod.codigo);

    // ── nota emitida trava produto e natureza, não o valor ───────────
    await pool.query("UPDATE orcamentos SET nota_status = 'emitida' WHERE id = $1", [orc]);
    ok("nota emitida: trocar produto → 409", (await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { omie_produto_codigo: null })).st === 409);
    ok("nota emitida: natureza → 409", (await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { natureza: "servico" })).st === 409);
    ok("nota emitida: valor continua editável", (await req("PATCH", `/admin/orcamentos/avulsos/linhas/${linha}`, { valor_unitario: 130 })).st === 200);
    ok("nota emitida: POST com produto → 409", (await req("POST", `/admin/orcamentos/avulsos/${orc}/linhas`, { descricao: "y", omie_produto_codigo: cod })).st === 409);
    await pool.query("UPDATE orcamentos SET nota_status = NULL WHERE id = $1", [orc]);

    // ── "a última vez" vem de orçamento aprovado, não do próprio ──────
    const aprov = await novoOrc("aprovado");
    await pool.query("UPDATE orcamentos SET aprovado_em = now() WHERE id = $1", [aprov]);
    await req("POST", `/admin/orcamentos/avulsos/${aprov}/linhas`, { descricao: "Luva", quantidade: 1, valor_unitario: 99.5, omie_produto_codigo: cod });
    const busca = await req("GET", `/admin/omie/produtos?q=${encodeURIComponent("luva de união 60mm")}&historico=1&orcamento_id=${orc}`);
    const achado = (busca.j.produtos || []).find(p => p.codigo_produto === cod);
    ok("busca do editor acha o produto", busca.st === 200 && !!achado);
    ok("última vez = R$ 99,50 do aprovado", achado && achado.ultima_vez && Number(achado.ultima_vez.valor) === 99.5 && achado.ultima_vez.orcamento_id === aprov);
    const buscaDoAprov = await req("GET", `/admin/omie/produtos?q=${encodeURIComponent("luva de união 60mm")}&historico=1&orcamento_id=${aprov}`);
    const a2 = (buscaDoAprov.j.produtos || []).find(p => p.codigo_produto === cod);
    ok("o próprio orçamento não é 'a última vez' dele", a2 && (!a2.ultima_vez || a2.ultima_vez.orcamento_id !== aprov));
    const semHist = await req("GET", `/admin/omie/produtos?q=luva`);
    ok("sem historico=1 a busca é a de sempre (sem ultima_vez)", semHist.st === 200 && (semHist.j.produtos || []).every(p => !("ultima_vez" in p)));

    // ── bitola ───────────────────────────────────────────────────────
    const reg = await req("GET", `/admin/omie/produtos?q=${encodeURIComponent("registro de gaveta 2")}&historico=1`);
    const prim = (reg.j.produtos || [])[0]?.descricao || "";
    ok(`"registro de gaveta 2" acha um de 2" ou 60mm (${prim})`, /(\b2"|60MM)/i.test(prim) && !/2[ .]1\/2/.test(prim));
  } catch (e) {
    ok("sem exceção: " + e.message, false);
  } finally {
    if (criados.length) await pool.query("DELETE FROM orcamentos WHERE id = ANY($1::int[])", [criados]);
    server.close();
    await pool.end();
  }

  for (const [nome, c] of r) console.log(`${c ? "✓" : "✗"} ${nome}`);
  const passou = r.filter(x => x[1]).length;
  console.log(`\n${passou}/${r.length} passaram`);
  process.exit(passou === r.length ? 0 : 1);
})();
