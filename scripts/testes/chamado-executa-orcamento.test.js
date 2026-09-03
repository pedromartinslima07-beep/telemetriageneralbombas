// O ciclo inteiro do "serviço já autorizado": o chamado aberto pelo admin
// aponta o orçamento, o técnico fecha a O.S., e o orçamento sai de Aprovados
// mostrando a O.S. que o executou.
//
//   node scripts/testes/chamado-executa-orcamento.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que query com parâmetro
// repetido só se prova exercitando o endpoint. O INSERT de `POST /chamados`
// tem `$7::int` duas vezes e ganhou uma coluna nesta mudança.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
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
app.use("/admin",    require("../../src/routes/admin.routes").adminRouter);
app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);
app.use("/operador", require("../../src/routes/operador.routes").operadorRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;

  const lixo = { orcamentos: [], chamados: [], os: [] };

  try {
    const condos = await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 2");
    if (condos.rows.length < 2) throw new Error("preciso de 2 condomínios no banco de teste");
    const condoA = condos.rows[0].id;
    const condoB = condos.rows[1].id;

    const u = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!u.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const userId = u.rows[0].id;
    const token = jwt.sign({ id: userId, role: u.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

    const sufixo = String(Date.now()).slice(-9);
    const novoOrc = async (condo, status) => {
      const q = await pool.query(
        `INSERT INTO orcamentos (numero, condominio_id, status, aprovado_em, criado_por)
         VALUES ($1, $2, $3::varchar,
                 CASE WHEN $3::varchar = 'aprovado' THEN NOW() ELSE NULL END, $4)
         RETURNING id`,
        ["OR-T" + sufixo + lixo.orcamentos.length, condo, status, userId]
      );
      lixo.orcamentos.push(q.rows[0].id);
      return q.rows[0].id;
    };

    const orcAprovado = await novoOrc(condoA, "aprovado");
    await pool.query(
      `INSERT INTO orcamento_linhas (orcamento_id, descricao, quantidade, valor_unitario)
       VALUES ($1, 'Troca do selo mecânico', 1, 780)`,
      [orcAprovado]
    );
    const orcRascunho = await novoOrc(condoA, "rascunho");
    const orcOutroPredio = await novoOrc(condoB, "aprovado");

    // ── A lista que alimenta o modal ──────────────────────────────────────
    const pend = await (await fetch(base + "/admin/condominios/" + condoA + "/orcamentos-pendentes", { headers: H })).json();
    const doPend = pend.find((o) => o.id === orcAprovado);
    ok("o aprovado sem chamado aparece", !!doPend);
    ok("o rascunho NÃO aparece", !pend.some((o) => o.id === orcRascunho));
    ok("o de outro prédio NÃO aparece", !pend.some((o) => o.id === orcOutroPredio));
    ok("traz o serviço para a tela nomear", (doPend && doPend.linhas || []).length === 1);
    ok("não traz valor nenhum", !!doPend && !("valor" in doPend) && !("valor_total" in doPend));

    // ── As recusas ────────────────────────────────────────────────────────
    const corpo = (extra) => JSON.stringify(Object.assign({
      titulo: "Serviço autorizado",
      descricao: "Executar o orçamento aprovado",
      condominio_id: condoA,
    }, extra));

    const rRasc = await fetch(base + "/chamados", { method: "POST", headers: H, body: corpo({ orcamento_id: orcRascunho }) });
    ok("orçamento não aprovado → 409", rRasc.status === 409);

    const rOutro = await fetch(base + "/chamados", { method: "POST", headers: H, body: corpo({ orcamento_id: orcOutroPredio }) });
    ok("orçamento de outro prédio → 409", rOutro.status === 409);

    const rBobo = await fetch(base + "/chamados", { method: "POST", headers: H, body: corpo({ orcamento_id: "abc" }) });
    ok("orcamento_id inválido → 400", rBobo.status === 400);

    const r404 = await fetch(base + "/chamados", { method: "POST", headers: H, body: corpo({ orcamento_id: 999999999 }) });
    ok("orçamento inexistente → 404", r404.status === 404);

    // ── O caminho feliz ───────────────────────────────────────────────────
    const rCh = await fetch(base + "/chamados", { method: "POST", headers: H, body: corpo({ orcamento_id: orcAprovado }) });
    const ch = await rCh.json();
    if (ch.id) lixo.chamados.push(ch.id);
    ok("cria o chamado (o $7::int repetido sobreviveu à coluna nova)", rCh.status === 201);
    ok("o chamado nasce apontando o orçamento", ch.orcamento_id === orcAprovado);

    const rSem = await fetch(base + "/chamados", {
      method: "POST", headers: H,
      body: JSON.stringify({ titulo: "Sem orçamento", descricao: "chamado comum do dia", condominio_id: condoA }),
    });
    const chSem = await rSem.json();
    if (chSem.id) lixo.chamados.push(chSem.id);
    ok("chamado sem orçamento continua nascendo", rSem.status === 201 && chSem.orcamento_id === null);

    // Já apontado, sai da lista do modal: não se despacha o mesmo duas vezes.
    const pend2 = await (await fetch(base + "/admin/condominios/" + condoA + "/orcamentos-pendentes", { headers: H })).json();
    ok("com chamado, sai da lista do modal", !pend2.some((o) => o.id === orcAprovado));

    // ── Antes de a O.S. fechar: a tela ainda espera execução ──────────────
    const antes = await (await fetch(base + "/operador/orcamentos", { headers: H })).json();
    const aAntes = antes.find((o) => o.id === orcAprovado);
    ok("a tela vê o chamado aberto", !!aAntes && aAntes.chamado_id === ch.id && aAntes.chamado_status === "aberto");
    ok("ainda sem O.S. de execução", !!aAntes && aAntes.exec_os_numero === null);

    // ── O técnico faz o serviço ───────────────────────────────────────────
    // O.S. finalizada + chamado fechado é o efeito exato de
    // POST /ordens-servico/:id/finalizar (ver a rota).
    const os = await pool.query(
      `INSERT INTO ordens_servico (numero, chamado_id, condominio_id, finalizada_em)
       VALUES ($1, $2, $3, NOW()) RETURNING id, numero`,
      ["OS-T-" + sufixo, ch.id, condoA]
    );
    lixo.os.push(os.rows[0].id);
    await pool.query("UPDATE chamados SET status = 'fechado', fechado_em = NOW() WHERE id = $1", [ch.id]);

    const dep = await (await fetch(base + "/operador/orcamentos", { headers: H })).json();
    const aDep = dep.find((o) => o.id === orcAprovado);
    ok("a tela acha a O.S. que executou", !!aDep && aDep.exec_os_id === os.rows[0].id);
    ok("com número, para o operador citar", !!aDep && aDep.exec_os_numero === os.rows[0].numero);
    ok("e com a data de finalização", !!aDep && !!aDep.exec_os_finalizada_em);
    ok("o chamado consta como fechado", !!aDep && aDep.chamado_status === "fechado");
    ok("ninguém marcou nada à mão", !!aDep && aDep.executado_em === null);

    const bDep = dep.find((o) => o.id === orcOutroPredio);
    ok("orçamento sem chamado não ganha O.S.", !!bDep && bDep.exec_os_id === null && bDep.chamado_id === null);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of lixo.os)         await pool.query("DELETE FROM ordens_servico WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.chamados)   await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.orcamentos) await pool.query("DELETE FROM orcamentos WHERE id=$1", [id]).catch(() => {});
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
