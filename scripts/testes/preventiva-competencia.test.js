// O chamado de preventiva sabe de que mês ele é (migration 087).
//
//   node scripts/testes/preventiva-competencia.test.js
//
// O caso que motivou (02/10/2026): o Alex recebeu como OUTUBRO um chamado do
// AGUIA DE HAIA criado em 28/09, e nada nele dizia o mês. O despacho, o
// "Iniciar" e a baixa à mão pegavam "o chamado aberto do plano", de qualquer
// mês — e 42 chamados de setembro estavam a dois dias de virar outubro.
//
// Prova, rota a rota:
//   1. o chamado nasce com a competência e o mês no título;
//   2. a virada cancela o chamado parado de mês encerrado, com motivo e
//      histórico, e o mês novo nasce limpo;
//   3. a virada NÃO toca o que está andando (a caminho / em atendimento);
//   4. o despacho não adota chamado de outra competência;
//   5. a baixa à mão não cancela chamado de outra competência;
//   6. o portal do cliente não mostra preventiva cancelada (e segue mostrando
//      o chamado comum cancelado, com o motivo).
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config({ quiet: true });
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const P = require("../../src/services/preventivas.service");

if (resolverDatabaseUrl().alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido não é TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/operador", require("../../src/routes/operador.routes").operadorRouter);
app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);
app.use("/cliente", require("../../src/routes/cliente.routes").clienteRouter);

const r = [];
const ok = (nome, cond, extra) => {
  r.push([nome, cond]);
  console.log((cond ? "OK  " : "FALHOU  ") + nome + (extra ? "  — " + extra : ""));
};

(async () => {
  const server = app.listen(0);
  const lixo = { ch: [], pl: [] };
  try {
    const base = "http://127.0.0.1:" + server.address().port;

    const adm = (await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1")).rows[0];
    const condo = (await pool.query(
      "SELECT id FROM condominios WHERE ativo ORDER BY id LIMIT 1")).rows[0];
    const tec = (await pool.query(
      `SELECT id FROM tecnicos WHERE ativo AND COALESCE(cargo,'tecnico') = 'tecnico'
        ORDER BY id LIMIT 1`)).rows[0];
    if (!adm || !condo || !tec) throw new Error("preciso de 1 admin, 1 condomínio e 1 técnico ativos");

    const H = { Authorization: "Bearer " + jwt.sign(
      { id: adm.id, role: adm.role }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json" };

    // As competências saem do banco, não do relógio do Node: `DATE` não tem
    // fuso e o `executarPlano` calcula no Postgres.
    const m = (await pool.query(
      `SELECT to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'YYYY-MM-DD') AS anterior,
              to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD') AS atual,
              to_char(date_trunc('month', CURRENT_DATE) + INTERVAL '1 month', 'YYYY-MM-DD') AS seguinte`
    )).rows[0];

    const novoPlano = async (titulo, proxima) => {
      const pl = (await pool.query(
        `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em)
         VALUES ($1, $2, 30, $3::date) RETURNING id`, [condo.id, titulo, proxima])).rows[0];
      lixo.pl.push(pl.id);
      return pl.id;
    };
    const novoChamado = async (plano, competencia, extra = {}) => {
      const ch = (await pool.query(
        `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status,
                               plano_manutencao_id, competencia, tecnico_id, tecnico_a_caminho_em)
         VALUES ($1, 'Preventiva (teste)', 'fixture', 'p4', 'manutencao', $2, $3, $4::date, $5, $6)
         RETURNING id`,
        [condo.id, extra.status || "aberto", plano, competencia,
         extra.tecnico || null, extra.aCaminho ? new Date() : null])).rows[0];
      lixo.ch.push(ch.id);
      return ch.id;
    };
    const chamado = async (id) => (await pool.query(
      `SELECT id, status, titulo, competencia::text AS competencia, tecnico_id, cancelado_motivo
         FROM chamados WHERE id = $1`, [id])).rows[0];
    const executar = async (plano) => {
      const res = await fetch(base + "/planos-manutencao/" + plano + "/executar-agora",
        { method: "POST", headers: H, body: "{}" });
      const body = await res.json();
      if (body.chamado_id && !lixo.ch.includes(body.chamado_id)) lixo.ch.push(body.chamado_id);
      return { status: res.status, body };
    };

    // ── 1. O chamado nasce com o mês ──────────────────────────────────────
    // O caso do AGUIA DE HAIA: plano que já deve o mês SEGUINTE (o "Iniciar"
    // dentro dos 7 dias de antecedência do roteiro).
    const p1 = await novoPlano("Preventiva", m.seguinte);
    const e1 = await executar(p1);
    ok("executar responde 200", e1.status === 200, JSON.stringify(e1.body));
    const c1 = await chamado(e1.body.chamado_id);
    ok("o chamado nasce com a competência do mês que o plano deve",
       c1.competencia === m.seguinte, c1.competencia);
    ok("e o título diz o mês",
       c1.titulo === "Preventiva — " + P.rotuloCompetencia(m.seguinte), c1.titulo);

    // Atrasado: a dívida se paga no mês corrente.
    const p1b = await novoPlano("Preventiva", m.anterior);
    const e1b = await executar(p1b);
    ok("plano atrasado → chamado do mês corrente",
       (await chamado(e1b.body.chamado_id)).competencia === m.atual);

    // ── 2. A virada cancela o mês encerrado que ninguém começou ──────────
    const p2 = await novoPlano("Preventiva", m.atual);
    const velho = await novoChamado(p2, m.anterior);
    const e2 = await executar(p2);
    const cv = await chamado(velho);
    ok("o chamado do mês passado, parado, é cancelado", cv.status === "cancelado", cv.status);
    ok("com o motivo dizendo o mês",
       (cv.cancelado_motivo || "").includes(P.rotuloCompetencia(m.anterior)), cv.cancelado_motivo);
    const h2 = (await pool.query(
      `SELECT valor_novo, motivo FROM historico_chamados
        WHERE chamado_id = $1 AND campo_alterado = 'status'`, [velho])).rows[0];
    ok("e o cancelamento entra no histórico", h2 && h2.valor_novo === "cancelado" && !!h2.motivo);
    ok("e o mês corrente ganha um chamado NOVO, não o herdado",
       e2.body.chamado_id && e2.body.chamado_id !== velho && e2.body.duplicado === false,
       JSON.stringify(e2.body));

    // ── 3. A virada não toca o que está andando ──────────────────────────
    const p3 = await novoPlano("Preventiva", m.atual);
    const caminho = await novoChamado(p3, m.anterior, { tecnico: tec.id, aCaminho: true });
    await executar(p3);
    ok("a caminho do mês passado NÃO é cancelado", (await chamado(caminho)).status === "aberto");

    const p3b = await novoPlano("Preventiva", m.atual);
    const dentro = await novoChamado(p3b, m.anterior, { tecnico: tec.id, status: "em_atendimento" });
    await executar(p3b);
    ok("em atendimento do mês passado NÃO é cancelado",
       (await chamado(dentro)).status === "em_atendimento");

    // ── 4. O despacho só adota o chamado da competência escalada ─────────
    const p4 = await novoPlano("Preventiva", m.seguinte);
    const doSeguinte = await novoChamado(p4, m.seguinte);
    const esc = await fetch(base + "/operador/preventivas/atribuir", {
      method: "POST", headers: H,
      body: JSON.stringify({ plano_ids: [p4], tecnico_id: tec.id, mes: m.atual.slice(0, 7) }),
    });
    const escBody = await esc.json();
    ok("escalar o mês corrente responde 200", esc.status === 200, JSON.stringify(escBody));
    ok("e NÃO adota o chamado de outro mês", escBody.chamados_atualizados === 0);
    ok("o chamado do mês seguinte segue sem dono", (await chamado(doSeguinte)).tecnico_id === null);

    const esc2 = await fetch(base + "/operador/preventivas/atribuir", {
      method: "POST", headers: H,
      body: JSON.stringify({ plano_ids: [p4], tecnico_id: tec.id, mes: m.seguinte.slice(0, 7) }),
    });
    ok("escalar o MÊS DELE adota", (await esc2.json()).chamados_atualizados === 1);
    await pool.query("DELETE FROM planos_atribuicoes WHERE plano_id = $1", [p4]);

    // ── 5. A baixa à mão só cancela o chamado da competência marcada ─────
    const p5 = await novoPlano("Preventiva", m.atual);
    const doSeguinte5 = await novoChamado(p5, m.seguinte);
    const bx = await fetch(base + "/operador/preventivas/" + p5 + "/feita", {
      method: "POST", headers: H, body: JSON.stringify({ mes: m.atual.slice(0, 7) }),
    });
    const bxBody = await bx.json();
    ok("marcar o mês corrente como feito responde 200", bx.status === 200, JSON.stringify(bxBody));
    ok("e NÃO cancela o chamado de outro mês",
       bxBody.chamado_cancelado_id === null && (await chamado(doSeguinte5)).status === "aberto");

    // ── 6. O cliente não vê preventiva cancelada ──────────────────────────
    // Decisão do Pedro: o motivo da virada ("não realizada") não vai para o
    // síndico. O `velho` do bloco 2 é exatamente esse chamado.
    const comum = (await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status,
                             cancelado_em, cancelado_motivo)
       VALUES ($1, 'Vazamento (teste)', 'fixture', 'p3', 'vazamento', 'cancelado',
               NOW(), 'aberto por engano (teste)') RETURNING id`, [condo.id])).rows[0].id;
    lixo.ch.push(comum);
    const HC = { Authorization: "Bearer " + jwt.sign(
      { id: adm.id, role: "cliente", condominio_id: condo.id }, process.env.JWT_SECRET,
      { expiresIn: "10m" }) };
    const lista = await (await fetch(base + "/cliente/chamados", { headers: HC })).json();
    const ids = Array.isArray(lista) ? lista.map((x) => x.id) : [];
    ok("a lista do cliente não traz a preventiva cancelada", Array.isArray(lista) && !ids.includes(velho),
       Array.isArray(lista) ? "" : JSON.stringify(lista));
    ok("mas traz o chamado comum cancelado", ids.includes(comum));
    ok("e o detalhe da preventiva cancelada é 404",
       (await fetch(base + "/cliente/chamados/" + velho, { headers: HC })).status === 404);
    ok("e as mensagens dela também",
       (await fetch(base + "/cliente/chamados/" + velho + "/mensagens", { headers: HC })).status === 404);
  } catch (e) {
    console.error("ERRO:", e.message);
    r.push(["sem exceção", false]);
  } finally {
    if (lixo.pl.length) {
      // O executarPlano cria chamados que a fixture não conhece: varre pelo plano.
      const extra = await pool.query(
        "SELECT id FROM chamados WHERE plano_manutencao_id = ANY($1)", [lixo.pl]);
      for (const x of extra.rows) if (!lixo.ch.includes(x.id)) lixo.ch.push(x.id);
    }
    if (lixo.ch.length) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1)", [lixo.ch]);
      await pool.query("DELETE FROM chamados WHERE id = ANY($1)", [lixo.ch]);
    }
    if (lixo.pl.length) await pool.query("DELETE FROM planos_manutencao WHERE id = ANY($1)", [lixo.pl]);
    server.close();
    await pool.end();
  }
  const passou = r.filter(([, c]) => c).length;
  console.log("\n" + passou + "/" + r.length + " passaram");
  process.exit(passou === r.length ? 0 : 1);
})();
