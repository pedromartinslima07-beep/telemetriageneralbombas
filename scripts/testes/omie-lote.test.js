// O lote do faturamento dos contratos (integração com o Omie, fase 2).
//
//   node scripts/testes/omie-lote.test.js
//
// ⚠️ O OMIE É SIMULADO DO COMEÇO AO FIM: `omie.chamar`, `faturarContrato`,
// `contratosPendentesDeFaturar` e `listarContasReceber` são trocados antes de
// qualquer coisa, e o `chamar` de verdade é substituído por um que estoura.
// O OMIE_EMISSAO=1 só é ligado DENTRO deste processo, depois da troca.
//
// O QUE ELE PROVA (serviço + rotas, banco de teste):
//   - quem entra no lote e quem fica fora, com o motivo (conta fora do
//     Sicredi/Bradesco, vigência acabada, nota do mês já existente);
//   - tirar e devolver; o que já foi enviado não se tira;
//   - sem OMIE_EMISSAO nada sai; lista ou total diferente do que a tela
//     mostrou, nada sai; dois lotes ao mesmo tempo, o segundo é recusado;
//   - quem o Omie não lista como pendente não é chamado; recusa vira `erro`
//     (e pode ir de novo); queda sem resposta vira `incerto` (e não vai de
//     novo); o mesmo contrato nunca é faturado duas vezes no mês;
//   - a sincronização devolve nota e boleto ao item e resolve o `incerto`
//     quando a nota aparece; `liberar` só vale para o incerto sem nota;
//   - a nota sem boleto é apontada; o boleto só é pedido com OMIE_EMISSAO, o
//     Omie é perguntado antes se o título já tem boleto, recusa libera para
//     pedir de novo, e quem já tem boleto ou já pagou não pede;
//   - operador e gerente não leem, não confirmam nem geram boleto (403).
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou (códigos acima de 9e14).
require("dotenv").config({ quiet: true });
// O lote só abre para os logins do painel novo (PAINEL_NOVO).
process.env.PAINEL_NOVO = "teste-painel@exemplo.invalid";
const express = require("express");
const jwt = require("jsonwebtoken");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const omie = require("../../src/services/omie.service");
// Antes de qualquer outra coisa: nenhuma chamada sai daqui.
omie.chamar = async (rota, call) => { throw new Error("chamada real ao Omie no teste: " + call); };
const chamadas = { faturar: [], pendentes: 0, receber: 0 };
let pendentes = [];
let comportamento = {}; // código → "ok" | "recusa" | "queda"
let proximaOs = 800000000000001;
omie.contratosPendentesDeFaturar = async () => { chamadas.pendentes++; return pendentes; };
omie.faturarContrato = async (cod) => {
  chamadas.faturar.push(cod);
  const c = comportamento[cod] || "ok";
  if (c === "queda") throw new omie.OmieErro("Omie não respondeu em 30s (FaturarContrato).", { call: "FaturarContrato", status: 504 });
  if (c === "recusa") throw new omie.OmieErro("Contrato sem itens para faturar", { call: "FaturarContrato", faultcode: "SOAP-ENV:Client-5" });
  return { nCodCtr: cod, nCodOS: proximaOs++, cCodStatus: "0", cDescStatus: "Contrato faturado com sucesso!" };
};
let titulosFalsos = [];
omie.listarContasReceber = async () => { chamadas.receber++; return titulosFalsos; };
const boleto = { obter: [], gerar: [], existentes: {}, recusarProxima: false };
omie.obterBoleto = async (t) => { boleto.obter.push(t); return boleto.existentes[t] || null; };
omie.gerarBoleto = async (t) => {
  boleto.gerar.push(t);
  if (boleto.recusarProxima) { boleto.recusarProxima = false; throw new omie.OmieErro("Conta corrente sem convênio de cobrança", { call: "GerarBoleto" }); }
  return { cCodStatus: "0", cDesStatus: "ok", cNumBoleto: "B-" + t, cNumBancario: "NN" + t, dDtEmBol: "20/11/2026" };
};
process.env.OMIE_EMISSAO = "";

const { pool } = require("../../src/db");
const lote = require("../../src/services/omie-lote.service");

const r = [];
const ok = (nome, cond) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome); };
const espera = ms => new Promise(res => setTimeout(res, ms));

const BASE = 910000000000001;
const C = { a: BASE, contaFora: BASE + 1, vencido: BASE + 2, comNota: BASE + 3, tirar: BASE + 4,
            naoPendente: BASE + 5, queda: BASE + 6, queda2: BASE + 7, recusa: BASE + 8 };
const CLI = BASE + 50;
const SICREDI = 5960922842, OUTRA = 5959994751;
const comp = lote.competenciaAtual();
const todos = Object.values(C);

async function limpar() {
  await pool.query(`DELETE FROM omie_faturamento_itens WHERE omie_contrato = ANY($1::bigint[])`, [todos]);
  await pool.query(`DELETE FROM omie_contrato_notas WHERE omie_contrato = ANY($1::bigint[])`, [todos]);
  await pool.query(`DELETE FROM omie_contratos WHERE omie_codigo = ANY($1::bigint[])`, [todos]);
}

async function esperarLote() {
  for (let i = 0; i < 100; i++) {
    const m = await lote.montar(comp);
    if (!m.rodando) return m;
    await espera(200);
  }
  throw new Error("o lote não terminou");
}

async function main() {
  await limpar();
  const ctr = (cod, { conta = SICREDI, fim = "2030-12-31", valor = 500, sit = "10" } = {}) => pool.query(
    `INSERT INTO omie_contratos (omie_codigo, numero, omie_cliente, situacao, valor_mensal, dia_faturamento, vigencia_inicio, vigencia_fim, conta_corrente, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, 1, '2025-01-01', $6, $7, NOW())`,
    [cod, "LOTE/" + (cod - BASE), CLI, sit, valor, fim, conta]);
  for (const k of ["a", "tirar", "naoPendente", "queda", "queda2", "recusa"]) await ctr(C[k]);
  await ctr(C.contaFora, { conta: OUTRA });
  await ctr(C.vencido, { fim: "2025-06-30" });
  await ctr(C.comNota);
  await pool.query(
    `INSERT INTO omie_contrato_notas (omie_nfse, omie_contrato, numero_nfse, competencia, emitida_em, valor, status)
     VALUES ($1, $2, '99001', $3, $4, 500, 'F')`, [C.comNota, C.comNota, comp, `${comp}-02`]);

  // ── Quem entra e quem fica fora ──────────────────────────────────────────
  let m = await lote.montar(comp);
  const de = cod => m.itens.find(i => i.omie_codigo === cod);
  ok("contrato ativo, Sicredi, na vigência: entra", de(C.a)?.estado === "entra" && de(C.a)?.banco === "Sicredi");
  ok("conta fora do Sicredi/Bradesco: fica fora, com o motivo", de(C.contaFora)?.estado === "fora" && /fora do Sicredi/.test(de(C.contaFora).motivo));
  ok("vigência acabada: fica fora", de(C.vencido)?.estado === "fora" && /vigência acabou/.test(de(C.vencido).motivo));
  ok("já tem nota do mês no Omie: fica fora (nada em dobro)", de(C.comNota)?.estado === "fora" && /99001/.test(de(C.comNota).motivo));
  ok("o dia proposto vem com o lote", /^\d{4}-\d{2}-\d{2}$/.test(m.dia_proposto) && m.dia_configurado >= 1);

  // ── Tirar e devolver ─────────────────────────────────────────────────────
  await lote.tirar(comp, C.tirar, true, 1);
  m = await lote.montar(comp);
  ok("tirar do lote", de(C.tirar)?.estado === "tirado");
  await lote.tirar(comp, C.tirar, false, 1);
  m = await lote.montar(comp);
  ok("devolver ao lote", de(C.tirar)?.estado === "entra");
  await lote.tirar(comp, C.tirar, true, 1);

  // ── As travas da confirmação ─────────────────────────────────────────────
  const vai = [C.a, C.naoPendente, C.queda, C.queda2, C.recusa];
  const totalDe = l => l.length * 500;
  const erroDe = async p => { try { await p; return null; } catch (e) { return e; } };
  let e = await erroDe(lote.confirmar(comp, vai, totalDe(vai), 1));
  ok("sem OMIE_EMISSAO=1 nada sai (503)", e?.status === 503 && chamadas.faturar.length === 0 && chamadas.pendentes === 0);
  process.env.OMIE_EMISSAO = "1";
  e = await erroDe(lote.confirmar(comp, vai, totalDe(vai) + 10, 1));
  ok("total diferente do que a tela mostrou: nada sai (409)", e?.status === 409 && chamadas.faturar.length === 0);
  e = await erroDe(lote.confirmar(comp, [...vai, C.contaFora], totalDe(vai) + 500, 1));
  ok("contrato que está fora do lote na lista: nada sai (409)", e?.status === 409 && chamadas.faturar.length === 0);
  e = await erroDe(lote.confirmar(comp, [C.tirar], 500, 1));
  ok("contrato tirado não vai nem pedido (409)", e?.status === 409);
  e = await erroDe(lote.confirmar("2020-01", [C.a], 500, 1));
  ok("só se fatura o mês corrente (400)", e?.status === 400);

  pendentes = [C.a, C.queda, C.queda2, C.recusa, C.tirar]; // o Omie não lista o naoPendente
  comportamento = { [C.queda]: "queda", [C.queda2]: "queda", [C.recusa]: "recusa" };
  const resp = await lote.confirmar(comp, vai, totalDe(vai), 1);
  e = await erroDe(lote.confirmar(comp, [C.a], 500, 1));
  ok("confirmar responde já e o envio segue", resp.enviando === 5);
  ok("dois lotes ao mesmo tempo: o segundo é recusado (409)", e?.status === 409);
  m = await esperarLote();
  ok("o Omie foi perguntado quem está pendente", chamadas.pendentes === 1);
  ok("quem o Omie não lista como pendente não é chamado", !chamadas.faturar.includes(C.naoPendente) && de(C.naoPendente)?.estado === "erro" && /pendente/.test(de(C.naoPendente).mensagem));
  ok("o tirado não foi chamado", !chamadas.faturar.includes(C.tirar));
  ok("faturado guarda a OS do Omie", de(C.a)?.estado === "faturado" && de(C.a).omie_os > 0);
  ok("queda sem resposta vira incerto", de(C.queda)?.estado === "incerto" && de(C.queda2)?.estado === "incerto");
  ok("recusa do Omie vira erro, com a mensagem", de(C.recusa)?.estado === "erro" && /sem itens/.test(de(C.recusa).mensagem));
  ok("o resumo conta o faturado", m.resumo.faturados === 1 && m.resumo.incertos === 2);

  // ── Nada em dobro ────────────────────────────────────────────────────────
  e = await erroDe(lote.confirmar(comp, [C.a], 500, 1));
  ok("o faturado não vai de novo (409)", e?.status === 409);
  e = await erroDe(lote.confirmar(comp, [C.queda], 500, 1));
  ok("o incerto não vai de novo sozinho (409)", e?.status === 409);
  e = await erroDe(lote.tirar(comp, C.a, true, 1));
  ok("o que já foi enviado não se tira (409)", e?.status === 409);
  comportamento = {};
  const antes = chamadas.faturar.length;
  await lote.confirmar(comp, [C.recusa], 500, 1);
  m = await esperarLote();
  ok("o erro pode ir de novo, e vai uma vez só", de(C.recusa)?.estado === "faturado" && chamadas.faturar.length === antes + 1);
  const linhas = await pool.query(`SELECT COUNT(*)::int AS n FROM omie_faturamento_itens WHERE competencia = $1 AND omie_contrato = ANY($2::bigint[])`, [comp, todos]);
  ok("uma linha por contrato no mês", linhas.rows[0].n === 6);

  // ── A volta da sincronização ─────────────────────────────────────────────
  const osA = de(C.a).omie_os;
  await pool.query(
    `INSERT INTO omie_contrato_notas (omie_nfse, omie_contrato, numero_nfse, competencia, emitida_em, valor, status, omie_os)
     VALUES ($1, $2, '4501', $3, CURRENT_DATE, 500, 'F', $4), ($5, $6, '4502', $3, CURRENT_DATE, 500, 'F', NULL)`,
    [C.a + 100, C.a, comp, osA, C.queda + 100, C.queda]);
  titulosFalsos = [{ numero_documento_fiscal: "0004501", codigo_cliente_fornecedor: CLI, codigo_lancamento_omie: 777001,
    data_vencimento: "10/12/2026", valor_documento: 500, status_titulo: "A VENCER", boleto: { cNumBoleto: "B-1", cNumBancario: "12345678" } }];
  const conc = await lote.conciliar();
  m = await lote.montar(comp);
  ok("a nota volta ao item pela OS", de(C.a)?.nfse === "4501");
  ok("o título e o boleto voltam pela nota", de(C.a)?.titulo?.nosso_numero === "12345678" && de(C.a).titulo.vencimento && conc.titulos >= 1);
  ok("o incerto vira faturado quando a nota do mês aparece", de(C.queda)?.estado === "faturado" && de(C.queda).nfse === "4502");

  // ── O boleto que o Omie não gerou ────────────────────────────────────────
  const osRecusa = de(C.recusa).omie_os;
  await pool.query(
    `INSERT INTO omie_contrato_notas (omie_nfse, omie_contrato, numero_nfse, competencia, emitida_em, valor, status, omie_os)
     VALUES ($1, $2, '4503', $3, CURRENT_DATE, 500, 'F', $4)`, [C.recusa + 100, C.recusa, comp, osRecusa]);
  titulosFalsos = [...titulosFalsos,
    { numero_documento_fiscal: "4502", codigo_cliente_fornecedor: CLI, codigo_lancamento_omie: 777002,
      data_vencimento: "10/12/2026", valor_documento: 500, status_titulo: "A VENCER", boleto: { cGerado: "N" } },
    { numero_documento_fiscal: "4503", codigo_cliente_fornecedor: CLI, codigo_lancamento_omie: 777003,
      data_vencimento: "10/12/2026", valor_documento: 500, status_titulo: "A VENCER", boleto: { cGerado: "N" } }];
  await lote.conciliar();
  m = await lote.montar(comp);
  ok("nota com boleto não pede boleto", de(C.a)?.titulo?.boleto_gerado === true && !de(C.a).titulo.pode_gerar_boleto);
  ok("nota sem boleto é apontada", de(C.queda)?.titulo?.pode_gerar_boleto === true && m.resumo.sem_boleto === 2);
  process.env.OMIE_EMISSAO = "";
  e = await erroDe(lote.gerarBoleto(comp, C.queda, 1));
  ok("sem OMIE_EMISSAO o boleto não é pedido (503)", e?.status === 503 && boleto.gerar.length === 0 && boleto.obter.length === 0);
  process.env.OMIE_EMISSAO = "1";
  boleto.recusarProxima = true;
  e = await erroDe(lote.gerarBoleto(comp, C.queda, 1));
  ok("recusa do Omie no boleto: 502, com a mensagem", e?.status === 502 && /convênio/.test(e.message));
  const g = await lote.gerarBoleto(comp, C.queda, 1);
  m = await lote.montar(comp);
  ok("depois da recusa dá para pedir de novo, e o boleto sai", g.gerado === true && de(C.queda)?.titulo?.nosso_numero === "NN777002" && !de(C.queda).titulo.pode_gerar_boleto);
  ok("antes de gerar, o Omie é perguntado se já tem boleto", boleto.obter.includes(777002));
  e = await erroDe(lote.gerarBoleto(comp, C.queda, 1));
  ok("boleto gerado não é pedido de novo (409)", e?.status === 409 && boleto.gerar.filter(t => t === 777002).length === 2);
  e = await erroDe(lote.gerarBoleto(comp, C.a, 1));
  ok("contrato que já tem boleto não pede (409)", e?.status === 409);
  boleto.existentes[777003] = { cNumBoleto: "B-feito-no-omie", cNumBancario: "NN-OMIE" };
  const j2 = await lote.gerarBoleto(comp, C.recusa, 1);
  m = await lote.montar(comp);
  ok("se o título já tinha boleto no Omie, só guarda (nada gerado)", j2.ja_tinha === true && !boleto.gerar.includes(777003) && de(C.recusa)?.titulo?.nosso_numero === "NN-OMIE");
  await pool.query(`UPDATE omie_faturamento_itens SET boleto_gerado = FALSE, titulo_status = 'RECEBIDO' WHERE competencia = $1 AND omie_contrato = $2`, [comp, C.recusa]);
  e = await erroDe(lote.gerarBoleto(comp, C.recusa, 1));
  ok("título já pago não pede boleto (409)", e?.status === 409);

  e = await erroDe(lote.liberar(comp, C.a, 1));
  ok("liberar o faturado é recusado (409)", e?.status === 409);
  await lote.liberar(comp, C.queda2, 1);
  m = await lote.montar(comp);
  ok("liberar o incerto sem nota o devolve ao lote", de(C.queda2)?.estado === "erro");

  // ── As rotas ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use("/agenda", require("../../src/routes/agenda.routes"));
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const H = role => ({ Authorization: "Bearer " + jwt.sign({ id: 1, role, email: "teste-painel@exemplo.invalid" }, process.env.JWT_SECRET, { expiresIn: "5m" }), "Content-Type": "application/json" });
  try {
    let x = await fetch(`${base}/agenda/faturamento/lote?competencia=${comp}`, { headers: H("admin") });
    const j = await x.json();
    ok("GET /agenda/faturamento/lote responde o lote", x.status === 200 && Array.isArray(j.itens) && j.emissao_ligada === true);
    ok("gerente não lê o lote (403)", (await fetch(`${base}/agenda/faturamento/lote`, { headers: H("gerente") })).status === 403);
    x = await fetch(`${base}/agenda/faturamento/lote/confirmar`, { method: "POST", headers: H("gerente"),
      body: JSON.stringify({ competencia: comp, contratos: [C.queda2], valor_total: 500 }) });
    ok("gerente não confirma (403)", x.status === 403);
    x = await fetch(`${base}/agenda/faturamento/lote/confirmar`, { method: "POST", headers: H("admin"),
      body: JSON.stringify({ competencia: comp, contratos: [C.queda2], valor_total: 999 }) });
    ok("a rota devolve o 409 do total errado", x.status === 409);
    x = await fetch(`${base}/agenda/faturamento/lote/tirar`, { method: "POST", headers: H("admin"),
      body: JSON.stringify({ competencia: comp, omie_contrato: C.queda2, tirar: true }) });
    ok("POST /tirar pela rota", x.status === 200);
    x = await fetch(`${base}/agenda/faturamento/lote/boleto`, { method: "POST", headers: H("gerente"),
      body: JSON.stringify({ competencia: comp, omie_contrato: C.queda }) });
    ok("gerente não gera boleto (403)", x.status === 403);
    x = await fetch(`${base}/agenda/faturamento/lote/boleto`, { method: "POST", headers: H("admin"),
      body: JSON.stringify({ competencia: comp, omie_contrato: C.queda }) });
    ok("a rota do boleto devolve o 409 de quem já tem", x.status === 409);
  } finally {
    srv.closeAllConnections?.();
    await new Promise(res => srv.close(res));
  }
}

main()
  .then(async () => {
    const bons = r.filter(x => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exitCode = bons === r.length ? 0 : 1;
  })
  .catch(e => { console.error("ERRO:", e); process.exitCode = 1; })
  .finally(async () => {
    try { await limpar(); await pool.end(); } catch (_) { /* já fechado */ }
    process.exit(process.exitCode || 0); // o timer da sincronização depois do lote não segura o processo
  });
