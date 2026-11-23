// Cobrança: os títulos em atraso que o sistema emitiu (integração com o Omie,
// fase 3, migration 099).
//
//   node scripts/testes/omie-cobranca.test.js
//
// ⚠️ O QUE ELE PROVA, exercitando de verdade (sincronização + router + JWT +
// banco de teste, com o Omie SIMULADO: nenhuma chamada sai daqui):
//   - dos atrasados do Omie, só entra o que o sistema emitiu: o título da OS
//     de um orçamento (NFS-e), o do pedido de um orçamento (DANFE) e o do
//     contrato faturado pelo lote. O título de fora (a herança sem baixa) não;
//   - a sincronização copia o telefone do cliente do Omie;
//   - GET /admin/cobranca traz dias de atraso, banco, prédio (o do orçamento;
//     no contrato, pelo CNPJ) e o contato; gerente e operador levam 403;
//   - "Marcar como pago" só no sistema: data futura é 400, a marca aparece na
//     lista, DELETE desfaz; título fora da lista é 404;
//   - o link do boleto vem do ObterBoleto UMA vez e depois do banco; título
//     sem boleto é 404 sem chamar o Omie;
//   - a cópia é trocada inteira: título que saiu do "atrasado" some.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou no fim (códigos do Omie de
// mentira acima de 9e14, prédio e orçamentos "TESTE cobranca").
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
const fat = require("../../src/services/omie-faturamento.service");

const r = [];
const ok = (nome, cond, extra) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome + (cond || extra === undefined ? "" : "  → " + JSON.stringify(extra))); };

const BASE = 910000000000001;
const CLI = { orc: BASE, ctr: BASE + 1, fora: BASE + 2 };
const OS_ORC = BASE + 10, PED_ORC = BASE + 11, OS_CTR = BASE + 12, CTR = BASE + 13;
const TIT = { os: BASE + 20, pedido: BASE + 21, contrato: BASE + 22, fora: BASE + 23, osPago: BASE + 24 };
const CNPJ_CTR = "12345678000195";
const lixo = { condos: [], orcs: [] };
let sincAntes = [];

const br = iso => iso.split("-").reverse().join("/");
const diasAtras = n => { const d = new Date(Date.now() - 3 * 3600e3 - n * 86400e3); return d.toISOString().slice(0, 10); };

function titulo(cod, extra) {
  return {
    codigo_lancamento_omie: cod, codigo_cliente_fornecedor: CLI.orc, status_titulo: "ATRASADO",
    numero_documento: "DOC " + cod, numero_parcela: "001/001", numero_documento_fiscal: "77",
    valor_documento: 100, data_emissao: br(diasAtras(40)), data_vencimento: br(diasAtras(10)),
    id_conta_corrente: 6109178168, boleto: { cGerado: "N" }, ...extra,
  };
}

async function limpar() {
  const tits = Object.values(TIT);
  await pool.query(`DELETE FROM omie_receber_atrasados WHERE omie_codigo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_receber_pagos WHERE omie_titulo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_boleto_links WHERE omie_titulo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_clientes WHERE omie_codigo = ANY($1::bigint[])`, [Object.values(CLI)]);
  await pool.query(`DELETE FROM omie_faturamento_itens WHERE omie_contrato = $1`, [CTR]);
  await pool.query(`DELETE FROM omie_contratos WHERE omie_codigo = $1`, [CTR]);
  await pool.query(`DELETE FROM orcamentos WHERE numero LIKE 'TESTE-COB%'`);
  await pool.query(`DELETE FROM condominios WHERE nome LIKE 'TESTE cobranca%'`);
  for (const s of sincAntes) {
    await pool.query(`UPDATE omie_sincronizacoes SET ultima_em = $2, ultimo_erro = $3, detalhe = $4 WHERE nome = $1`,
      [s.nome, s.ultima_em, s.ultimo_erro, s.detalhe]);
  }
}

async function main() {
  await limpar();
  sincAntes = (await pool.query(`SELECT * FROM omie_sincronizacoes WHERE nome IN ('faturamento_contratos', 'receber_atrasados')`)).rows;
  const adm = (await pool.query(`SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0].id;

  const condoOrc = (await pool.query(`INSERT INTO condominios (nome, ativo, telefone) VALUES ('TESTE cobranca orçamento', TRUE, '(11) 3333-4444') RETURNING id`)).rows[0].id;
  const condoCtr = (await pool.query(`INSERT INTO condominios (nome, ativo, cnpj) VALUES ('TESTE cobranca contrato', TRUE, '12.345.678/0001-95') RETURNING id`)).rows[0].id;
  const orcOs = (await pool.query(`INSERT INTO orcamentos (numero, condominio_id, status, criado_por, omie_os_codigo) VALUES ('TESTE-COB-1', $1, 'aprovado', $2, $3) RETURNING id`, [condoOrc, adm, OS_ORC])).rows[0].id;
  await pool.query(`INSERT INTO orcamentos (numero, condominio_id, status, criado_por, omie_pedido_codigo) VALUES ('TESTE-COB-2', $1, 'aprovado', $2, $3)`, [condoOrc, adm, PED_ORC]);
  await pool.query(`INSERT INTO omie_contratos (omie_codigo, numero, omie_cliente, situacao) VALUES ($1, 'TESTE/0001', $2, '10')`, [CTR, CLI.ctr]);
  await pool.query(`INSERT INTO omie_faturamento_itens (competencia, omie_contrato, status, omie_os) VALUES ('2099-01', $1, 'faturado', $2)`, [CTR, OS_CTR]);

  // ── A sincronização inteira, com o Omie simulado ─────────────────────────
  let atrasados = [
    titulo(TIT.os, { nCodOS: OS_ORC }),
    titulo(TIT.pedido, { nCodPedido: PED_ORC, data_vencimento: br(diasAtras(45)), id_conta_corrente: 5960922842 }),
    titulo(TIT.contrato, { nCodOS: OS_CTR, codigo_cliente_fornecedor: CLI.ctr, valor_documento: 250.5,
      boleto: { cGerado: "S", cNumBancario: "600000999" } }),
    titulo(TIT.fora, { nCodOS: BASE + 99, codigo_cliente_fornecedor: CLI.fora }), // herança: não é do sistema
  ];
  const clientes = [
    { codigo_cliente_omie: CLI.orc, razao_social: "TESTE COB ORC LTDA", cnpj_cpf: "", telefone1_ddd: "11", telefone1_numero: "9999-0000", contato: "Síndico Zé" },
    { codigo_cliente_omie: CLI.ctr, razao_social: "TESTE COB &amp; CTR", nome_fantasia: "Cobrança Contrato", cnpj_cpf: "12.345.678/0001-95" },
  ];
  const original = omie.chamar;
  const chamadas = [];
  omie.chamar = async (rota, call, param) => {
    chamadas.push(call);
    if (call === "ListarContratos") return { contratoCadastro: [], total_de_paginas: 1 };
    if (call === "ListarNFSEs") { const e = new Error("Não existem registros"); e.naoEncontrado = true; throw e; }
    if (call === "ListarClientes") return { clientes_cadastro: clientes, total_de_paginas: 1 };
    if (call === "ListarContasReceber") {
      if (param.filtrar_por_status !== "ATRASADO") throw new Error("esperava filtrar_por_status ATRASADO");
      return { conta_receber_cadastro: atrasados, total_de_paginas: 1 };
    }
    throw new Error("chamada inesperada ao Omie: " + call);
  };
  let sinc;
  try { sinc = await fat.sincronizar({ forcar: true }); } finally { omie.chamar = original; }
  ok("sincronização roda a cobrança junto", sinc.cobranca && sinc.cobranca.do_sistema === 3 && !sinc.erro_cobranca, sinc);
  const tel = (await pool.query(`SELECT telefone, contato FROM omie_clientes WHERE omie_codigo = $1`, [CLI.orc])).rows[0];
  ok("telefone e contato do cliente copiados", tel && tel.telefone === "(11) 9999-0000" && tel.contato === "Síndico Zé", tel);

  // ── As rotas ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../../src/routes/cobranca.routes"));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const tok = role => ({ Authorization: "Bearer " + jwt.sign({ id: adm, role }, process.env.JWT_SECRET, { expiresIn: "10m" }), "Content-Type": "application/json" });
  const ADM = tok("admin"), GER = tok("gerente"), OPE = tok("operador");
  const chama = async (m, p, h, body) => {
    const res = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    return { s: res.status, j: await res.json().catch(() => ({})) };
  };
  try {
    ok("gerente não lê (403)", (await chama("GET", "/admin/cobranca", GER)).s === 403);
    ok("operador não lê (403)", (await chama("GET", "/admin/cobranca", OPE)).s === 403);
    ok("gerente não atualiza (403)", (await chama("POST", "/admin/cobranca/atualizar", GER)).s === 403);

    let l = await chama("GET", "/admin/cobranca", ADM);
    const meus = () => (l.j.titulos || []).filter(t => Object.values(TIT).includes(t.omie_codigo));
    const ach = cod => meus().find(t => t.omie_codigo === cod);
    ok("lista responde 200", l.s === 200, l.s);
    ok("só os três do sistema; o de fora não entra", meus().length === 3 && !ach(TIT.fora), meus().map(t => t.omie_codigo));
    const tOs = ach(TIT.os), tPed = ach(TIT.pedido), tCtr = ach(TIT.contrato);
    ok("título da OS: origem orçamento, prédio do orçamento", tOs?.origem === "orcamento" && tOs.orcamento_id === orcOs && tOs.condominio?.id === condoOrc, tOs);
    ok("título do pedido (DANFE) entra", tPed?.origem === "orcamento" && tPed.banco === "Sicredi", tPed);
    ok("dias de atraso no relógio de SP", tOs?.dias === 10 && tPed?.dias === 45, [tOs?.dias, tPed?.dias]);
    ok("título do contrato: origem contrato, número e prédio pelo CNPJ",
      tCtr?.origem === "contrato" && tCtr.contrato?.numero === "TESTE/0001" && tCtr.condominio?.id === condoCtr, tCtr);
    ok("documento do título e CNPJ do cliente não se misturam",
      tCtr?.documento === "DOC " + TIT.contrato && tCtr.cliente.documento === CNPJ_CTR, [tCtr?.documento, tCtr?.cliente?.documento]);
    ok("nome do Omie sem entidade HTML e valor certo", tCtr?.cliente.nome === "Cobrança Contrato" && tCtr.valor === 250.5 && tCtr.banco === "Bradesco", tCtr?.cliente);
    ok("contato do cliente e do prédio na linha", tOs?.cliente.telefone === "(11) 9999-0000" && tOs.condominio.telefone === "(11) 3333-4444");
    ok("boleto: nosso número só quando o Omie gerou", tCtr?.boleto_numero === "600000999" && tOs?.boleto_numero == null);

    // ── marcar como pago (só no sistema) ──
    const amanha = new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    ok("pago com data futura: 400", (await chama("PUT", `/admin/cobranca/${TIT.os}/pago`, ADM, { pago_em: amanha })).s === 400);
    ok("pago em título fora da lista: 404", (await chama("PUT", `/admin/cobranca/${TIT.fora}/pago`, ADM, {})).s === 404);
    ok("código inválido: 400", (await chama("PUT", `/admin/cobranca/abc/pago`, ADM, {})).s === 400);
    const mp = await chama("PUT", `/admin/cobranca/${TIT.os}/pago`, ADM, { pago_em: diasAtras(1), observacao: "PIX direto" });
    ok("marca como pago (200)", mp.s === 200, mp);
    l = await chama("GET", "/admin/cobranca", ADM);
    ok("a marca aparece na lista", ach(TIT.os)?.pago?.observacao === "PIX direto" && String(ach(TIT.os).pago.em).slice(0, 10) === diasAtras(1), ach(TIT.os)?.pago);
    ok("desmarca (200)", (await chama("DELETE", `/admin/cobranca/${TIT.os}/pago`, ADM)).s === 200);
    ok("desmarcar de novo: 404", (await chama("DELETE", `/admin/cobranca/${TIT.os}/pago`, ADM)).s === 404);

    // ── o link do boleto ──
    const obtidos = [];
    const origObter = omie.obterBoleto;
    omie.obterBoleto = async (cod) => { obtidos.push(cod); return { cNumBancario: "600000999", cLinkBoleto: "https://cdn.exemplo/boleto.pdf" }; };
    try {
      const b1 = await chama("GET", `/admin/cobranca/${TIT.contrato}/boleto`, ADM);
      const b2 = await chama("GET", `/admin/cobranca/${TIT.contrato}/boleto`, ADM);
      ok("link do boleto vem do Omie", b1.s === 200 && b1.j.link === "https://cdn.exemplo/boleto.pdf", b1);
      ok("segunda vez sai do banco (uma chamada só)", b2.j.link === b1.j.link && obtidos.length === 1, obtidos);
      const b3 = await chama("GET", `/admin/cobranca/${TIT.os}/boleto`, ADM);
      ok("sem boleto: 404 sem chamar o Omie", b3.s === 404 && obtidos.length === 1, b3);
    } finally { omie.obterBoleto = origObter; }

    // ── a cópia é trocada inteira: o pago no Omie some ──
    await pool.query(`INSERT INTO omie_receber_pagos (omie_titulo, pago_em) VALUES ($1, CURRENT_DATE)`, [TIT.pedido]);
    atrasados = atrasados.filter(t => t.codigo_lancamento_omie !== TIT.pedido);
    const cob = require("../../src/services/omie-receber.service");
    await cob.sincronizar({ listar: async () => atrasados });
    l = await chama("GET", "/admin/cobranca", ADM);
    ok("título baixado no Omie sai da lista", meus().length === 2 && !ach(TIT.pedido), meus().map(t => t.omie_codigo));
    const marca = (await pool.query(`SELECT 1 FROM omie_receber_pagos WHERE omie_titulo = $1`, [TIT.pedido])).rowCount;
    ok("a marca à mão não é apagada pela sincronização", marca === 1);
  } finally {
    server.close();
  }
}

main()
  .catch(e => { console.error(e); r.push({ nome: "exceção", cond: false }); })
  .finally(async () => {
    try { await limpar(); } catch (e) { console.error("limpeza:", e.message); }
    const f = r.filter(x => !x.cond).length;
    console.log(`\n${r.length - f}/${r.length} ${f ? "— FALHOU" : "ok"}`);
    await pool.end();
    process.exit(f ? 1 : 0);
  });
