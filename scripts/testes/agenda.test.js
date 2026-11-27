// Agenda da empresa (migration 092): compromissos, repetição, fuso e quem vê.
//
//   node scripts/testes/agenda.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que rota que grava só se
// prova exercitando o endpoint (o 42P08 de parâmetro repetido só aparece no
// parse do Postgres). Aqui também se prova o que só a rota decide: o
// pagamento some para o gerente, e a repetição respeita o relógio de SP.
//
// ⚠️ ESCREVE NO BANCO DE TESTE (compromissos em 2027, título "[TESTE agenda]")
// e apaga o que criou no `finally`.
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
app.use("/agenda", require("../../src/routes/agenda.routes"));

const r = [];
const ok = (nome, cond, extra) => r.push([nome, !!cond, extra]);
const T = "[TESTE agenda]";

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const u = await pool.query("SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1");
    const uid = u.rows[0].id;
    const tok = role => ({
      Authorization: "Bearer " + jwt.sign({ id: uid, role }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json",
    });
    const ADM = tok("admin"), GER = tok("gerente"), OPE = tok("operador");
    const chama = async (m, p, h, body) => {
      const res = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
      return { s: res.status, j: await res.json().catch(() => ({})) };
    };
    const lista = async (h, de, ate) => (await chama("GET", `/agenda?de=${de}&ate=${ate}`, h)).j.itens || [];
    const meus = itens => itens.filter(i => i.fonte === "compromisso" && String(i.titulo).startsWith(T));

    // 1. Reunião simples, criada pelo gerente.
    const reu = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} reunião`, tipo: "reuniao", inicio: "2027-03-10T14:00:00-03:00", fim: "2027-03-10T15:00:00-03:00" });
    ok("gerente cria reunião (201)", reu.s === 201, reu.s);

    // 2. Pagamento: só o admin cria, e ele nasce só para o admin.
    const pagGer = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} pagamento`, tipo: "pagamento", inicio: "2027-03-05T00:00:00-03:00", dia_inteiro: true });
    ok("gerente NÃO cria pagamento (403)", pagGer.s === 403, pagGer.s);
    const pag = await chama("POST", "/agenda/compromissos", ADM,
      { titulo: `${T} pagamento`, tipo: "pagamento", inicio: "2027-01-05T00:00:00-03:00", dia_inteiro: true, repeticao: "mensal" });
    ok("admin cria pagamento mensal (201)", pag.s === 201, pag.s);
    ok("pagamento nasce so_admin", pag.j.so_admin === true);

    const admMar = meus(await lista(ADM, "2027-03-01", "2027-03-31"));
    const gerMar = meus(await lista(GER, "2027-03-01", "2027-03-31"));
    ok("admin vê o pagamento de março (repetição)", admMar.some(i => i.titulo.endsWith("pagamento") && i.inicio.startsWith("2027-03-05T03:00")), admMar.map(i => i.inicio));
    ok("gerente NÃO vê o pagamento", !gerMar.some(i => i.titulo.endsWith("pagamento")));
    ok("gerente vê a reunião", gerMar.some(i => i.titulo.endsWith("reunião")));

    // 3. Mensal no dia 31 cai no último dia do mês curto.
    const d31 = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} dia 31`, tipo: "outro", inicio: "2027-01-31T09:00:00-03:00", repeticao: "mensal" });
    const fev = meus(await lista(GER, "2027-02-01", "2027-02-28")).filter(i => i.titulo.endsWith("dia 31"));
    ok("dia 31 vira 28/02 em fevereiro", fev.length === 1 && fev[0].inicio === "2027-02-28T12:00:00.000Z", fev.map(i => i.inicio));
    const abr = meus(await lista(GER, "2027-04-01", "2027-04-30")).filter(i => i.titulo.endsWith("dia 31"));
    ok("e 30/04 em abril", abr.length === 1 && abr[0].inicio === "2027-04-30T12:00:00.000Z", abr.map(i => i.inicio));

    // 4. Semanal com fim: 4 terças de 02/03 a 23/03.
    const sem = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} semanal`, tipo: "visita", inicio: "2027-03-02T08:00:00-03:00", repeticao: "semanal", repete_ate: "2027-03-23" });
    const sems = meus(await lista(GER, "2027-02-20", "2027-04-10")).filter(i => i.titulo.endsWith("semanal"));
    ok("semanal com fim dá 4 ocorrências", sems.length === 4, sems.map(i => i.inicio));

    // 5. Fuso: 22h30 de SP é 01h30 UTC do dia seguinte, e continua no dia 10.
    const noite = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} noite`, tipo: "outro", inicio: "2027-03-10T22:30:00-03:00" });
    const dia10 = meus(await lista(GER, "2027-03-10", "2027-03-10")).filter(i => i.titulo.endsWith("noite"));
    const dia11 = meus(await lista(GER, "2027-03-11", "2027-03-11")).filter(i => i.titulo.endsWith("noite"));
    ok("22h30 de SP aparece no dia 10", dia10.length === 1);
    ok("e não no dia 11", dia11.length === 0);

    // 6. Editar e apagar.
    const ed = await chama("PATCH", `/agenda/compromissos/${reu.j.id}`, GER, { titulo: `${T} reunião remarcada`, inicio: "2027-03-11T10:00:00-03:00", fim: null });
    ok("gerente edita a reunião", ed.s === 200 && ed.j.titulo.endsWith("remarcada"), ed.s);
    const edPag = await chama("PATCH", `/agenda/compromissos/${pag.j.id}`, GER, { titulo: "x" });
    ok("gerente não alcança o pagamento (404)", edPag.s === 404, edPag.s);
    const ap = await chama("DELETE", `/agenda/compromissos/${noite.j.id}`, GER);
    const depois = meus(await lista(GER, "2027-03-10", "2027-03-10")).filter(i => i.titulo.endsWith("noite"));
    ok("apagado some da agenda", ap.s === 200 && depois.length === 0);

    // 7. Validação e perfis.
    ok("sem título dá 400", (await chama("POST", "/agenda/compromissos", GER, { inicio: "2027-03-10T10:00:00-03:00" })).s === 400);
    ok("fim antes do início dá 400", (await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} ruim`, inicio: "2027-03-10T10:00:00-03:00", fim: "2027-03-10T09:00:00-03:00" })).s === 400);
    ok("período sem data dá 400", (await chama("GET", "/agenda?de=ontem&ate=hoje", GER)).s === 400);
    ok("faturamento: gerente 403", (await chama("GET", "/agenda/faturamento?competencia=2026-11", GER)).s === 403);
    const fat = await chama("GET", "/agenda/faturamento?competencia=2026-11", ADM);
    ok("faturamento: admin 200", fat.s === 200 && typeof fat.j.esperados === "number", fat.s);
    ok("faturamento: operador 403", (await chama("GET", "/agenda/faturamento?competencia=2026-11", OPE)).s === 403);

    // ── 27/11/2026 (migration 111): operador só com as visitas, concluir,
    //    "só esta", "esta e as próximas" e o feito do retorno.
    const chId = (await pool.query("SELECT id FROM chamados ORDER BY id DESC LIMIT 1")).rows[0].id;
    const vez = (its, dia) => its.filter(i => i.inicio.startsWith(dia));

    // 8. Operador: entra, mas só vê e mexe nas visitas de chamado.
    const visOpe = await chama("POST", "/agenda/compromissos", OPE,
      { titulo: `${T} visita do turno`, tipo: "visita", inicio: "2027-03-12T09:00:00-03:00", chamado_id: chId });
    ok("operador marca visita de chamado (201)", visOpe.s === 201, visOpe);
    ok("operador NÃO cria reunião (403)", (await chama("POST", "/agenda/compromissos", OPE,
      { titulo: `${T} reunião do turno`, tipo: "reuniao", inicio: "2027-03-12T09:00:00-03:00" })).s === 403);
    const opeMar = await chama("GET", "/agenda?de=2027-03-01&ate=2027-03-31", OPE);
    ok("operador lê a agenda (200)", opeMar.s === 200, opeMar.s);
    const opeIts = meus(opeMar.j.itens || []);
    ok("operador vê a visita", opeIts.some(i => i.titulo.endsWith("visita do turno")));
    ok("operador NÃO vê reunião nem pagamento", !opeIts.some(i => !i.chamado_id));
    ok("operador não vê contrato, preventiva nem Omie", !(opeMar.j.itens || []).some(i => ["contrato", "preventivas", "omie"].includes(i.fonte)));
    ok("operador não alcança a reunião (404)", (await chama("PATCH", `/agenda/compromissos/${reu.j.id}`, OPE, { titulo: "x" })).s === 404);
    ok("operador não tira o chamado da visita (403)", (await chama("PATCH", `/agenda/compromissos/${visOpe.j.id}`, OPE, { chamado_id: null })).s === 403);
    ok("operador remarca a visita (200)", (await chama("PATCH", `/agenda/compromissos/${visOpe.j.id}`, OPE, { inicio: "2027-03-12T10:00:00-03:00" })).s === 200);

    // 9. Série semanal de visitas, 4 terças de maio: feito e "só esta".
    const sv = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} visita semanal`, tipo: "visita", inicio: "2027-05-04T08:00:00-03:00", repeticao: "semanal", repete_ate: "2027-05-25", chamado_id: chId });
    const svIts = async () => meus(await lista(GER, "2027-05-01", "2027-05-31")).filter(i => i.compromisso_id === sv.j.id);
    let its = await svIts();
    const seg = vez(its, "2027-05-11")[0];
    const ck = await chama("POST", `/agenda/compromissos/${sv.j.id}/ocorrencia`, OPE, { ocorrencia: seg.ocorrencia, concluido: true });
    ok("operador marca a 2ª vez como feita (200)", ck.s === 200, ck);
    its = await svIts();
    ok("só a 2ª fica feita", its.filter(i => i.concluido).length === 1 && vez(its, "2027-05-11")[0].concluido, its.map(i => [i.inicio, i.concluido]));
    ok("feito sabe quem marcou", !!vez(its, "2027-05-11")[0].concluido_por_nome);
    ok("vez que não existe dá 400", (await chama("POST", `/agenda/compromissos/${sv.j.id}/ocorrencia`, GER, { ocorrencia: "2027-05-12T11:00:00.000Z", concluido: true })).s === 400);
    const ter = vez(its, "2027-05-18")[0];
    await chama("POST", `/agenda/compromissos/${sv.j.id}/ocorrencia`, GER, { ocorrencia: ter.ocorrencia, inicio: "2027-05-19T14:00:00-03:00" });
    const qua = vez(its, "2027-05-25")[0];
    await chama("POST", `/agenda/compromissos/${sv.j.id}/ocorrencia`, GER, { ocorrencia: qua.ocorrencia, cancelada: true });
    its = await svIts();
    ok("só esta: a 3ª foi para quarta 19 às 14h", vez(its, "2027-05-18").length === 0 && vez(its, "2027-05-19")[0]?.inicio === "2027-05-19T17:00:00.000Z" && vez(its, "2027-05-19")[0]?.excecao, its.map(i => i.inicio));
    ok("só esta: a 4ª foi apagada, a série continua com 3", its.length === 3, its.length);
    const remarcadaFora = meus(await lista(GER, "2027-05-19", "2027-05-19")).filter(i => i.compromisso_id === sv.j.id);
    ok("a vez remarcada aparece no dia novo mesmo pedindo só ele", remarcadaFora.length === 1);
    // "Todas": a série passa para as 9h; o feito da 2ª acompanha.
    await chama("PATCH", `/agenda/compromissos/${sv.j.id}`, GER, { inicio: "2027-05-04T09:00:00-03:00" });
    its = await svIts();
    ok("todas: série às 9h e o feito da 2ª continua nela", vez(its, "2027-05-11")[0]?.inicio === "2027-05-11T12:00:00.000Z" && vez(its, "2027-05-11")[0]?.concluido, its.map(i => [i.inicio, i.concluido]));
    ok("todas: a vez remarcada à parte continua na quarta 14h", vez(its, "2027-05-19")[0]?.inicio === "2027-05-19T17:00:00.000Z");
    // Desmarcar o feito.
    await chama("POST", `/agenda/compromissos/${sv.j.id}/ocorrencia`, GER, { ocorrencia: vez(its, "2027-05-11")[0].ocorrencia, concluido: false });
    ok("reabrir tira o feito", !(await svIts()).some(i => i.concluido));

    // 10. "Esta e as próximas": reunião toda terça de junho (5 vezes).
    const sr = await chama("POST", "/agenda/compromissos", GER,
      { titulo: `${T} reunião semanal`, tipo: "reuniao", inicio: "2027-06-01T07:30:00-03:00", repeticao: "semanal", repete_ate: "2027-06-29" });
    const jun = async () => meus(await lista(GER, "2027-06-01", "2027-06-30")).filter(i => i.titulo.includes("reunião semanal") || i.titulo.includes("reunião nova"));
    let ji = await jun();
    await chama("POST", `/agenda/compromissos/${sr.j.id}/ocorrencia`, GER, { ocorrencia: vez(ji, "2027-06-15")[0].ocorrencia, concluido: true });
    const div = await chama("POST", `/agenda/compromissos/${sr.j.id}/dividir`, GER,
      { ocorrencia: vez(ji, "2027-06-15")[0].ocorrencia, titulo: `${T} reunião nova`, inicio: "2027-06-15T08:00:00-03:00" });
    ok("dividir cria a série nova (200)", div.s === 200 && div.j.id && div.j.id !== sr.j.id, div);
    ji = await jun();
    ok("próximas: 01 e 08 continuam com o título velho", vez(ji, "2027-06-01")[0]?.titulo.endsWith("reunião semanal") && vez(ji, "2027-06-08")[0]?.titulo.endsWith("reunião semanal"));
    ok("próximas: 15, 22 e 29 com o título novo às 8h", ["2027-06-15", "2027-06-22", "2027-06-29"].every(d => vez(ji, d)[0]?.titulo.endsWith("reunião nova") && vez(ji, d)[0]?.inicio.endsWith("T11:00:00.000Z")), ji.map(i => [i.inicio, i.titulo]));
    ok("próximas: o feito do dia 15 foi junto para a série nova", vez(ji, "2027-06-15")[0]?.concluido);
    ok("próximas: 5 vezes no total, sem dobrar", ji.length === 5, ji.length);
    const apg = await chama("POST", `/agenda/compromissos/${div.j.id}/dividir`, GER, { ocorrencia: vez(ji, "2027-06-22")[0].ocorrencia, apagar: true });
    ji = await jun();
    ok("apagar esta e as próximas: sobram 01, 08 e 15", apg.s === 200 && ji.length === 3 && !vez(ji, "2027-06-22").length, ji.map(i => i.inicio));

    // 11. Feito do retorno de O.S. (e o operador não marca contrato).
    const fr = await chama("POST", "/agenda/feitos", OPE, { fonte: "retorno", ref_id: 999999, concluido: true });
    ok("operador marca retorno feito (200)", fr.s === 200 && fr.j.concluido, fr);
    ok("operador NÃO marca contrato (403)", (await chama("POST", "/agenda/feitos", OPE, { fonte: "contrato", ref_id: 999999, concluido: true })).s === 403);
    ok("reabrir o retorno (200)", (await chama("POST", "/agenda/feitos", GER, { fonte: "retorno", ref_id: 999999, concluido: false })).s === 200);
  } catch (e) {
    ok("sem exceção", false, e.message);
  } finally {
    await pool.query(`DELETE FROM compromissos WHERE titulo LIKE $1`, [T + "%"]); // exceções vão junto (CASCADE)
    await pool.query(`DELETE FROM agenda_feitos WHERE ref_id = 999999`);
    server.close();
    await pool.end();
    const falhas = r.filter(x => !x[1]);
    for (const [n, c, x] of r) console.log((c ? "✓ " : "✗ ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x)));
    console.log(`\n${r.length - falhas.length}/${r.length}`);
    process.exit(falhas.length ? 1 : 0);
  }
})();
