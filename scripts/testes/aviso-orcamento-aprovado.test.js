// "Este prédio já tem serviço aprovado esperando chamado" — a regra por trás do
// aviso no novo chamado, do OPERADOR e do ADMIN (10/09/2026).
//
// ⚠️ O ENDPOINT É UM SÓ (`GET /admin/condominios/:id/orcamentos-pendentes`),
// e é esse o ponto: as duas telas fazem a mesma pergunta. Um segundo endpoint
// para o operador chegou a existir por algumas horas e foi descartado — as
// duas versões da regra já discordavam sobre o chamado cancelado.
//
//   node scripts/testes/aviso-orcamento-aprovado.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE: o endpoint decide quem aparece no aviso com a
// MESMA regra que a tela de Aprovados usa para dizer que um orçamento está
// "livre" (`execucao()` em public/operador-orcamentos.js). São duas contas do
// mesmo fato em lugares diferentes, e é exatamente esse o tipo de par que
// diverge numa correção futura — mostrando números diferentes na mesma tarde.
// Aqui os cinco estados ficam escritos.
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
app.use("/admin", require("../../src/routes/admin.routes").adminRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = { orcamentos: [], chamados: [] };
  let condoA = null, condoB = null;

  try {
    const condos = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 2")).rows;
    condoA = condos[0].id;
    condoB = condos[1] ? condos[1].id : condos[0].id;
    const userId = (await pool.query("SELECT id FROM usuarios WHERE role='admin' LIMIT 1")).rows[0].id;
    const sufixo = String(Date.now()).slice(-8);

    const criarOrc = async (condo, status, extra = "") => {
      const q = await pool.query(
        `INSERT INTO orcamentos (numero, condominio_id, status, aprovado_em, criado_por, tipo)
         VALUES ($1, $2, $3::varchar,
                 CASE WHEN $3::varchar = 'aprovado' THEN NOW() ELSE NULL END, $4, 'limpeza_reservatorio')
         RETURNING id`,
        ["OR-A" + sufixo + lixo.orcamentos.length + extra, condo, status, userId]
      );
      lixo.orcamentos.push(q.rows[0].id);
      return q.rows[0].id;
    };
    const criarChamado = async (condo, orcId, status) => {
      const q = await pool.query(
        `INSERT INTO chamados (condominio_id, titulo, status, categoria, prioridade, orcamento_id)
         VALUES ($1, $2, $3::varchar, 'manutencao', 'p4', $4) RETURNING id`,
        [condo, "Chamado de teste " + sufixo, status, orcId]
      );
      lixo.chamados.push(q.rows[0].id);
      return q.rows[0].id;
    };

    const token = jwt.sign({ id: userId, role: "operador" }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const consultar = async (condo) => {
      const res = await fetch(base + "/admin/condominios/" + condo + "/orcamentos-pendentes",
        { headers: { Authorization: "Bearer " + token } });
      return { status: res.status, corpo: await res.json() };
    };

    // ── Os estados, um a um ───────────────────────────────────────────────
    const livre = await criarOrc(condoA, "aprovado");

    const comAberto = await criarOrc(condoA, "aprovado");
    await criarChamado(condoA, comAberto, "aberto");

    const comFechado = await criarOrc(condoA, "aprovado");
    await criarChamado(condoA, comFechado, "fechado");

    // ⚠️ Cancelado VOLTA a ser livre (migration 083): o chamado cancelado não
    // é aberto nem fechado, e o serviço deixou de ser feito.
    const comCancelado = await criarOrc(condoA, "aprovado");
    const idCancelado = await criarChamado(condoA, comCancelado, "cancelado");

    const marcadoFeito = await criarOrc(condoA, "aprovado");
    await pool.query("UPDATE orcamentos SET executado_em = NOW(), executado_por = $2 WHERE id = $1", [marcadoFeito, userId]);

    const naoAprovado = await criarOrc(condoA, "enviado");
    const deOutroPredio = await criarOrc(condoB, "aprovado");

    const { status, corpo } = await consultar(condoA);
    const ids = corpo.map(o => o.id);

    ok("responde 200", status === 200);
    ok("o livre aparece", ids.includes(livre));
    ok("o cancelado volta a aparecer", ids.includes(comCancelado));
    ok("e diz qual chamado foi cancelado",
      corpo.find(o => o.id === comCancelado)?.chamado_cancelado_id === idCancelado);

    // As quatro que não podem aparecer — cada uma por um motivo diferente.
    ok("com chamado ABERTO não aparece", !ids.includes(comAberto));
    ok("com chamado FECHADO não aparece", !ids.includes(comFechado));
    ok("marcado como feito à mão não aparece", !ids.includes(marcadoFeito));
    ok("orçamento não aprovado não aparece", !ids.includes(naoAprovado));

    // ⚠️ A asserção que protege o cliente: o aviso é do prédio escolhido, e de
    // mais nenhum. Vazar aqui contaria a um operador o serviço de outro
    // condomínio — e ainda o empurraria para abrir chamado no prédio errado.
    ok("orçamento de outro prédio não aparece", !ids.includes(deOutroPredio));
    if (condoB !== condoA) {
      const outro = await consultar(condoB);
      ok("e o outro prédio vê o dele", outro.corpo.map(o => o.id).includes(deOutroPredio));
      ok("sem ver o deste", !outro.corpo.map(o => o.id).includes(livre));
    }

    // O serviço vai junto; o valor, nunca — mesma regra de GET /operador/orcamentos.
    const item = corpo.find(o => o.id === livre);
    ok("devolve o tipo do serviço", item?.tipo === "limpeza_reservatorio");
    ok("não devolve valor nenhum",
      item && !("valor" in item) && !("valor_total" in item) && !("valor_unitario" in item));

    // Entrada inválida não vira 500.
    const ruim = await fetch(base + "/admin/condominios/abc/orcamentos-pendentes",
      { headers: { Authorization: "Bearer " + token } });
    ok("id inválido é 400", ruim.status === 400);
  } catch (e) {
    console.error("ERRO:", e.stack);
    process.exitCode = 1;
  } finally {
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
