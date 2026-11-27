// Os avisos do lote e o elo contrato do Omie → preventiva (migration 109).
//
//   node scripts/testes/lote-avisos-preventiva.test.js
//
// O QUE ELE PROVA (serviço + rotas, banco de teste, Omie nenhum):
//   - dois contratos da mesma preventiva com o mesmo valor (o caso Bradesco
//     JF × RPS de outubro/2026) avisam "dobro", inclusive quando o outro já
//     tem nota do mês;
//   - os setores do mesmo prédio (valores diferentes) não avisam nada;
//   - o mesmo valor em OUTRO prédio não é dobro;
//   - prédio sem preventiva ativa avisa "sem_preventiva"; com duas, "escolher";
//   - escolher à mão um plano para cada contrato apaga o "escolher", e
//     "não é de preventiva" apaga o "sem_preventiva";
//   - preventiva ativa sem contrato em vigor aparece em
//     `preventivas_sem_contrato`; a coberta não; a que espera escolha não;
//   - o plano de outro prédio é recusado (409); operador não grava (403);
//     DELETE volta a valer o plano do prédio;
//   - o aviso não tira ninguém do lote.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou (códigos acima de 9,2e14).
require("dotenv").config({ quiet: true });
const express = require("express");
const jwt = require("jsonwebtoken");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const omie = require("../../src/services/omie.service");
omie.chamar = async (rota, call) => { throw new Error("chamada real ao Omie no teste: " + call); };

const { pool } = require("../../src/db");
const lote = require("../../src/services/omie-lote.service");
const omieContratos = require("../../src/services/omie-contratos.service");

const r = [];
const ok = (nome, cond) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome); };

const BASE = 920000000000001;
const CTR = { jf: BASE, rps: BASE + 1, res: BASE + 2, com: BASE + 3, s1: BASE + 4, s2: BASE + 5, semPlano: BASE + 6, outro: BASE + 7 };
const CLI = { jf: BASE + 50, rps: BASE + 51, setores: BASE + 52, dois: BASE + 53, semPlano: BASE + 54, outro: BASE + 55 };
const SICREDI = 5960922842;
const comp = lote.competenciaAtual();
const NOME = "TESTE lote-avisos";

async function limpar() {
  const ctrs = Object.values(CTR), clis = Object.values(CLI);
  await pool.query(`DELETE FROM plano_contratos_omie WHERE omie_contrato = ANY($1::bigint[])`, [ctrs]);
  await pool.query(`DELETE FROM omie_contrato_notas WHERE omie_contrato = ANY($1::bigint[])`, [ctrs]);
  await pool.query(`DELETE FROM omie_faturamento_itens WHERE omie_contrato = ANY($1::bigint[])`, [ctrs]);
  await pool.query(`DELETE FROM omie_contratos WHERE omie_codigo = ANY($1::bigint[])`, [ctrs]);
  await pool.query(`DELETE FROM omie_cliente_vinculos WHERE omie_cliente = ANY($1::bigint[])`, [clis]);
  await pool.query(`DELETE FROM omie_clientes WHERE omie_codigo = ANY($1::bigint[])`, [clis]);
  await pool.query(`DELETE FROM condominios WHERE nome LIKE $1`, [NOME + "%"]);
}

async function main() {
  await limpar();
  const condo = async s => (await pool.query(`INSERT INTO condominios (nome, ativo) VALUES ($1, TRUE) RETURNING id`, [`${NOME} ${s}`])).rows[0].id;
  const plano = async (cid, titulo, ativo = true) => (await pool.query(
    `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
     VALUES ($1, $2, 30, $3, $4) RETURNING id`, [cid, titulo, `${comp}-01`, ativo])).rows[0].id;
  const cliente = async (cod, cid, nome) => {
    await pool.query(`INSERT INTO omie_clientes (omie_codigo, razao_social, nome_fantasia) VALUES ($1, $2, $2)`, [cod, nome]);
    await pool.query(`INSERT INTO omie_cliente_vinculos (omie_cliente, condominio_id) VALUES ($1, $2)`, [cod, cid]);
  };
  const contrato = (cod, cli, valor) => pool.query(
    `INSERT INTO omie_contratos (omie_codigo, numero, omie_cliente, situacao, valor_mensal, dia_faturamento, vigencia_inicio, vigencia_fim, conta_corrente)
     VALUES ($1, $2, $3, '10', $4, 1, '2025-01-01', '2030-12-31', $5)`, [cod, "AV/" + (cod - BASE), cli, valor, SICREDI]);

  const cJf = await condo("Bradesco JF"), cSet = await condo("Setores"), cDois = await condo("Dois serviços");
  const cSem = await condo("Sem preventiva"), cOutro = await condo("Outro prédio"), cSozinho = await condo("Sem contrato");
  const pJf = await plano(cJf, "Preventiva");
  const pSet = await plano(cSet, "Preventiva");
  const pBombas = await plano(cDois, "Bombas"), pRes = await plano(cDois, "Reservatórios");
  const pOutro = await plano(cOutro, "Preventiva");
  const pSozinho = await plano(cSozinho, "Preventiva");
  await plano(cSem, "Antiga", false); // inativa: não conta

  await cliente(CLI.jf, cJf, "BRADESCO JF"); await cliente(CLI.rps, cJf, "RPS");
  await cliente(CLI.setores, cSet, "SETORES"); await cliente(CLI.dois, cDois, "DOIS SERVIÇOS");
  await cliente(CLI.semPlano, cSem, "SEM PLANO"); await cliente(CLI.outro, cOutro, "OUTRO");
  await contrato(CTR.jf, CLI.jf, 597.5); await contrato(CTR.rps, CLI.rps, 597.5);
  await contrato(CTR.res, CLI.setores, 589.82); await contrato(CTR.com, CLI.setores, 111.89);
  await contrato(CTR.s1, CLI.dois, 980); await contrato(CTR.s2, CLI.dois, 990);
  await contrato(CTR.semPlano, CLI.semPlano, 400);
  await contrato(CTR.outro, CLI.outro, 597.5);

  // ── O lote, sem nenhuma escolha à mão ────────────────────────────────────
  let m = await lote.montar(comp);
  const de = cod => m.itens.find(i => i.omie_codigo === cod);
  const tipos = cod => (de(cod)?.avisos || []).map(a => a.tipo);
  ok("JF e RPS, mesma preventiva e mesmo valor: os dois avisam dobro", tipos(CTR.jf).includes("dobro") && tipos(CTR.rps).includes("dobro"));
  ok("o aviso diz qual é o outro contrato", /AV\/1/.test(de(CTR.jf).avisos[0].texto));
  ok("o aviso não tira ninguém do lote", de(CTR.jf).estado === "entra" && de(CTR.rps).estado === "entra");
  ok("o mesmo valor em outro prédio não é dobro", tipos(CTR.outro).length === 0);
  ok("setores do mesmo prédio, valores diferentes: nenhum aviso", !tipos(CTR.res).length && !tipos(CTR.com).length);
  ok("os setores pagam a preventiva do prédio", de(CTR.res).plano_id === pSet && de(CTR.res).plano_ligacao === "predio");
  ok("prédio sem preventiva ativa: avisa sem_preventiva", tipos(CTR.semPlano).includes("sem_preventiva"));
  ok("prédio com duas preventivas: avisa escolher", tipos(CTR.s1).includes("escolher") && tipos(CTR.s2).includes("escolher"));
  const sem = () => m.preventivas_sem_contrato.map(p => p.plano_id);
  ok("preventiva sem contrato em vigor aparece", sem().includes(pSozinho));
  ok("a preventiva coberta não aparece", !sem().includes(pJf) && !sem().includes(pSet) && !sem().includes(pOutro));
  ok("a do prédio que espera escolha não aparece duas vezes", !sem().includes(pBombas) && !sem().includes(pRes));
  ok("o resumo conta os contratos com aviso", m.resumo.com_aviso >= 5);

  // ── O RPS já faturado: o JF avisa "que já tem nota" ──────────────────────
  await pool.query(`INSERT INTO omie_contrato_notas (omie_nfse, omie_contrato, numero_nfse, competencia, emitida_em, valor, status)
    VALUES ($1, $1, '72', $2, $3, 597.5, 'F')`, [CTR.rps, comp, `${comp}-03`]);
  m = await lote.montar(comp);
  ok("com nota do RPS no mês, o JF avisa que o outro já tem nota", /já tem nota deste mês/.test(de(CTR.jf).avisos.find(a => a.tipo === "dobro")?.texto || ""));
  ok("e o RPS, fora do lote pela nota, também mostra o dobro", de(CTR.rps).motivo_tipo === "nota" && tipos(CTR.rps).includes("dobro"));

  // ── As rotas ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use("/contratos", require("../../src/routes/contratos.routes").contratosRouter);
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const tok = role => ({ Authorization: "Bearer " + jwt.sign({ id: 1, role }, process.env.JWT_SECRET, { expiresIn: "5m" }), "Content-Type": "application/json" });
  const put = (cod, corpo, role = "admin") => fetch(`${url}/contratos/omie/${cod}/plano`, { method: "PUT", headers: tok(role), body: JSON.stringify(corpo) });
  try {
    ok("operador não escolhe a preventiva (403)", (await put(CTR.s1, { plano_id: pBombas }, "operador")).status === 403);
    ok("sem plano_id no corpo: 400", (await put(CTR.s1, {})).status === 400);
    ok("plano de outro prédio: 409", (await put(CTR.s1, { plano_id: pOutro })).status === 409);
    ok("escolher Bombas para o 980", (await put(CTR.s1, { plano_id: pBombas })).status === 200);
    ok("escolher Reservatórios para o 990", (await put(CTR.s2, { plano_id: pRes })).status === 200);
    ok("\"não é de preventiva\" para o contrato sem plano", (await put(CTR.semPlano, { plano_id: null })).status === 200);

    m = await lote.montar(comp);
    ok("cada serviço no seu plano: o escolher some", !tipos(CTR.s1).length && !tipos(CTR.s2).length);
    ok("e a ligação diz que foi à mão", de(CTR.s1).plano_ligacao === "manual" && de(CTR.s1).plano_id === pBombas);
    ok("não é de preventiva: sem aviso", !tipos(CTR.semPlano).length);
    ok("as duas preventivas do prédio ficam cobertas", !sem().includes(pBombas) && !sem().includes(pRes));

    // Os dois serviços no MESMO plano com o mesmo valor seria dobro; com
    // valores diferentes (980/990) não é.
    await put(CTR.s2, { plano_id: pBombas });
    m = await lote.montar(comp);
    ok("dois contratos no mesmo plano com valores diferentes: sem dobro", !tipos(CTR.s1).includes("dobro"));
    ok("e a preventiva que ficou sem contrato aparece", sem().includes(pRes));

    const del = await fetch(`${url}/contratos/omie/${CTR.s1}/plano`, { method: "DELETE", headers: tok("admin") });
    m = await lote.montar(comp);
    ok("DELETE volta a valer o prédio (que tem duas: escolher)", del.status === 200 && de(CTR.s1).plano_ligacao === "escolher");

    const { contratos } = await omieContratos.listar();
    const k = contratos.find(c => c.omie_codigo === CTR.s2);
    ok("a lista de contratos traz as preventivas do prédio para escolher", k.planos_do_predio.length === 2);
  } finally {
    srv.close();
  }
}

main()
  .catch(e => { console.error(e); r.push({ nome: "exceção", cond: false }); })
  .finally(async () => {
    await limpar().catch(e => console.error("limpeza:", e.message));
    await pool.end();
    const falhas = r.filter(x => !x.cond).length;
    console.log(`\n${r.length - falhas}/${r.length} passaram`);
    process.exit(falhas ? 1 : 0);
  });
