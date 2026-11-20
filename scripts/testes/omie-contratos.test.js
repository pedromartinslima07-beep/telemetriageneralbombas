// Os contratos do Omie ligados ao prédio (integração com o Omie, fase 1).
//
//   node scripts/testes/omie-contratos.test.js
//
// ⚠️ O QUE ELE PROVA, exercitando de verdade (router + JWT + banco de teste):
//   - a sincronização copia os CLIENTES do Omie (com o Omie simulado: nenhuma
//     chamada sai daqui) e guarda o CNPJ só em dígitos;
//   - GET /contratos/omie liga o contrato ao prédio pelo CNPJ quando ele bate
//     com UM prédio, e não liga (com o motivo) quando bate com dois, quando o
//     cliente não tem CNPJ ou quando não bate com ninguém;
//   - PUT liga à mão e vale sobre o CNPJ; DELETE volta ao automático;
//   - operador não lê nem liga (403), e condomínio inexistente é 404.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou no fim (códigos do Omie de
// mentira, acima de 9e14, e prédios com nome "TESTE omie-contratos").
require("dotenv").config({ quiet: true });
const express = require("express");
const jwt = require("jsonwebtoken");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const { pool } = require("../../src/db");
const omie = require("../../src/services/omie.service");

const r = [];
const ok = (nome, cond) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome); };

const BASE = 900000000000001; // códigos do Omie de mentira
const CLI = { unico: BASE, repetido: BASE + 1, semCnpj: BASE + 2, semPredio: BASE + 3 };
const CTR = { unico: BASE + 10, repetido: BASE + 11, semCnpj: BASE + 12, semPredio: BASE + 13, semCliente: BASE + 14 };
const CNPJ_UNICO = "11222333000181", CNPJ_REPETIDO = "44555666000172", CNPJ_SEM = "77888999000163";
const condos = [];
// A sincronização simulada reescreve `omie_sincronizacoes` (hora e detalhe):
// guarda a linha de verdade e devolve no fim, senão a tela do banco de teste
// passa a dizer "copiado do Omie há 1 min" com números de mentira.
let sincAntes = null;

async function limpar() {
  const todos = [...Object.values(CLI), ...Object.values(CTR), BASE + 99];
  await pool.query(`DELETE FROM omie_cliente_vinculos WHERE omie_cliente = ANY($1::bigint[])`, [todos]);
  await pool.query(`DELETE FROM omie_clientes WHERE omie_codigo = ANY($1::bigint[])`, [todos]);
  await pool.query(`DELETE FROM omie_contratos WHERE omie_codigo = ANY($1::bigint[])`, [todos]);
  await pool.query(`DELETE FROM condominios WHERE nome LIKE 'TESTE omie-contratos%'`);
  if (sincAntes) {
    await pool.query(`UPDATE omie_sincronizacoes SET ultima_em = $2, ultimo_erro = $3, detalhe = $4 WHERE nome = $1`,
      [sincAntes.nome, sincAntes.ultima_em, sincAntes.ultimo_erro, sincAntes.detalhe]);
  }
}

async function main() {
  await limpar();
  sincAntes = (await pool.query(`SELECT * FROM omie_sincronizacoes WHERE nome = 'faturamento_contratos'`)).rows[0] || null;
  const novoCondo = async (sufixo, cnpj) => {
    const q = await pool.query(`INSERT INTO condominios (nome, cnpj, ativo) VALUES ($1, $2, TRUE) RETURNING id`,
      ["TESTE omie-contratos " + sufixo, cnpj]);
    condos.push(q.rows[0].id);
    return q.rows[0].id;
  };
  // O CNPJ do prédio FORMATADO: a comparação tem de ser só em dígitos.
  const cUnico = await novoCondo("único", "11.222.333/0001-81");
  await novoCondo("repetido A", "44.555.666/0001-72");
  await novoCondo("repetido B", "44555666000172");
  const cManual = await novoCondo("manual", null);

  // ── A sincronização, com o Omie simulado ─────────────────────────────────
  const original = omie.chamar;
  const chamadas = [];
  omie.chamar = async (rota, call) => {
    chamadas.push(call);
    if (call === "ListarContratos") {
      const ctr = (cod, cli, sit = "10", fim = "31/12/2030") => ({ cabecalho: {
        nCodCtr: cod, cNumCtr: "TST/" + (cod - BASE), nCodCli: cli, cCodSit: sit, nValTotMes: 500,
        nDiaFat: 1, dVigInicial: "01/01/2025", dVigFinal: fim } });
      return { total_de_paginas: 1, contratoCadastro: [
        ctr(CTR.unico, CLI.unico), ctr(CTR.repetido, CLI.repetido), ctr(CTR.semCnpj, CLI.semCnpj),
        ctr(CTR.semPredio, CLI.semPredio, "10", "01/01/2025"), ctr(CTR.semCliente, BASE + 99, "99"),
      ] };
    }
    if (call === "ListarNFSEs") { const e = new omie.OmieErro("Não existem registros", { call }); throw e; }
    if (call === "ListarClientes") return { total_de_paginas: 1, clientes_cadastro: [
      { codigo_cliente_omie: CLI.unico, cnpj_cpf: "11.222.333/0001-81", razao_social: "Cond Único", inativo: "N" },
      { codigo_cliente_omie: CLI.repetido, cnpj_cpf: CNPJ_REPETIDO, razao_social: "Cond Repetido", inativo: "N" },
      { codigo_cliente_omie: CLI.semCnpj, cnpj_cpf: "", razao_social: "Sem CNPJ", inativo: "N" },
      { codigo_cliente_omie: CLI.semPredio, cnpj_cpf: CNPJ_SEM, razao_social: "Cond Fora", email: "x@y.z", inativo: "S" },
    ] };
    throw new Error("chamada inesperada: " + call);
  };
  const fat = require("../../src/services/omie-faturamento.service");
  let sinc;
  try { sinc = await fat.sincronizar({ forcar: true }); } finally { omie.chamar = original; }
  ok("a sincronização leu contratos, notas e clientes", ["ListarContratos", "ListarNFSEs", "ListarClientes"].every(c => chamadas.includes(c)));
  ok("e diz quantos clientes copiou", sinc.clientes === 4 && !sinc.erro_clientes);
  const cl = await pool.query(`SELECT documento, inativo FROM omie_clientes WHERE omie_codigo = $1`, [CLI.unico]);
  ok("o CNPJ do cliente é guardado só em dígitos", cl.rows[0]?.documento === CNPJ_UNICO);
  const ina = await pool.query(`SELECT inativo FROM omie_clientes WHERE omie_codigo = $1`, [CLI.semPredio]);
  ok("cliente inativo no Omie fica marcado", ina.rows[0]?.inativo === true);

  // ── As rotas ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use("/contratos", require("../../src/routes/contratos.routes").contratosRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const tok = role => ({ Authorization: "Bearer " + jwt.sign({ id: 1, role }, process.env.JWT_SECRET, { expiresIn: "5m" }), "Content-Type": "application/json" });
  const H = tok("admin");
  const ler = async () => (await (await fetch(base + "/contratos/omie", { headers: H })).json()).contratos;
  const de = (lista, cod) => lista.find(x => x.omie_codigo === cod);

  try {
    let lista = await ler();
    ok("GET /contratos/omie responde a lista", Array.isArray(lista) && lista.length >= 5);
    const u = de(lista, CTR.unico);
    ok("CNPJ que bate com UM prédio liga sozinho", u?.condominio_id === cUnico && u.ligacao === "cnpj");
    ok("e traz o nome do prédio", u?.condominio_nome === "TESTE omie-contratos único");
    ok("CNPJ que bate com DOIS prédios não liga", de(lista, CTR.repetido)?.condominio_id === null && de(lista, CTR.repetido)?.ligacao === "cnpj-repetido");
    ok("cliente sem CNPJ não liga, e diz por quê", de(lista, CTR.semCnpj)?.ligacao === "sem-cnpj");
    ok("CNPJ que não bate com ninguém não liga", de(lista, CTR.semPredio)?.ligacao === "cnpj-sem-predio");
    ok("contrato de cliente que não veio do Omie", de(lista, CTR.semCliente)?.ligacao === "sem-cliente" && de(lista, CTR.semCliente)?.ativo === false);
    ok("ativo com vigência vencida é apontado", de(lista, CTR.semPredio)?.vigencia_vencida === true && de(lista, CTR.unico)?.vigencia_vencida === false);
    ok("a situação vem com rótulo", u?.situacao_rotulo === "Ativo" && de(lista, CTR.semCliente)?.situacao_rotulo === "Encerrado");

    const put = (cli, body, h = H) => fetch(`${base}/contratos/omie/clientes/${cli}/condominio`, { method: "PUT", headers: h, body: JSON.stringify(body) });
    let x = await put(CLI.semPredio, { condominio_id: cManual });
    ok("PUT liga à mão", x.status === 200);
    lista = await ler();
    ok("e o contrato passa a ser do prédio, marcado como à mão", de(lista, CTR.semPredio)?.condominio_id === cManual && de(lista, CTR.semPredio)?.ligacao === "manual");
    await put(CLI.unico, { condominio_id: cManual });
    lista = await ler();
    ok("o elo à mão vale sobre o CNPJ", de(lista, CTR.unico)?.condominio_id === cManual);
    x = await fetch(`${base}/contratos/omie/clientes/${CLI.unico}/condominio`, { method: "DELETE", headers: H });
    lista = await ler();
    ok("DELETE volta ao CNPJ", x.status === 200 && de(lista, CTR.unico)?.condominio_id === cUnico && de(lista, CTR.unico)?.ligacao === "cnpj");

    ok("prédio inexistente é 404", (await put(CLI.semCnpj, { condominio_id: 2147483000 })).status === 404);
    ok("cliente sem contrato é 404", (await put(BASE + 555, { condominio_id: cManual })).status === 404);
    ok("condominio_id inválido é 400", (await put(CLI.semCnpj, { condominio_id: "x" })).status === 400);
    ok("operador não lê (403)", (await fetch(base + "/contratos/omie", { headers: tok("operador") })).status === 403);
    ok("operador não liga (403)", (await put(CLI.semCnpj, { condominio_id: cManual }, tok("operador"))).status === 403);
  } finally {
    srv.closeAllConnections?.();
    await new Promise(res => srv.close(res));
    await limpar();
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter(x => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exitCode = bons === r.length ? 0 : 1;
  })
  .catch(async e => {
    console.error("ERRO:", e);
    process.exitCode = 1;
    // Falhou antes do `finally` das rotas: limpa e fecha, senão o processo
    // fica pendurado no pool e o lixo de teste fica no banco.
    try { await limpar(); await pool.end(); } catch (_) { /* já fechado */ }
  });
