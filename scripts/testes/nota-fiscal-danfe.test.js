// Teste da DANFE pelo Omie (etapa 3 da nota fiscal). Roda com
// `node scripts/testes/nota-fiscal-danfe.test.js` — usa o BANCO DE TESTE e
// recusa rodar em qualquer outro.
//
// ⚠️ O OMIE É DUBLÊ. Nenhuma chamada sai daqui para a API: o omie.service é
// trocado por funções que gravam o que receberam. O Omie não tem ambiente de
// teste — chamar IncluirPedido/FaturarPedidoVenda de verdade seria nota real.
//
// O QUE ELE PROVA:
//   1. ratearNfe fecha no centavo e não esconde quantidade (26 válvulas
//      continuam 26, em dois itens do mesmo produto quando não divide);
//   2. a prévia bloqueia peça sem produto, cliente fora de SP e a troca de
//      tipo depois de uma tentativa que já criou OS no Omie;
//   3. pelas ROTAS (Express + JWT, como manda o CLAUDE.md para query com
//      parâmetro repetido): prévia → emitir → atualizar; o pedido sai no
//      molde, com o serviço embutido; a escolha do produto é gravada e
//      lembrada; a retomada acha o pedido em vez de criar outro.
//
// ELE NÃO PROVA que o Omie aceita o payload — isso só a primeira nota real,
// acompanhada.
process.chdir(require("path").join(__dirname, "..", ".."));
require("dotenv").config({ quiet: true });
const { resolverDatabaseUrl } = require("../../src/db-url");
if (resolverDatabaseUrl({}).alvo !== "TESTE") {
  console.error("ABORTADO: este teste só roda no banco de teste.");
  process.exit(1);
}
process.env.OMIE_EMISSAO = "1";

const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const omie = require("../../src/services/omie.service");
const nota = require("../../src/services/nota-fiscal.service");

const r = [];
const ok = (n, c, extra) => { r.push([n, Boolean(c)]); if (!c && extra !== undefined) console.log("   ↳", JSON.stringify(extra)); };

// ── 1. ratearNfe ────────────────────────────────────────────────────────────
{
  const it = nota.ratearNfe([{ id: 1, quantidade: 26, valor_unitario: 240 }], 669000);
  const soma = it.reduce((a, i) => a + i.totalCent, 0);
  const qtd = it.reduce((a, i) => a + i.quantidade, 0);
  ok("26 válvulas por R$ 6.690,00 fecham no centavo", soma === 669000, it);
  ok("e continuam 26 unidades", qtd === 26, it);
  ok("em dois itens: 25 × 257,30 e 1 × 257,50", it.length === 2 && it[0].quantidade === 25 && it[0].unitCent === 25730 && it[1].unitCent === 25750, it);
  for (const i of it) ok(`item ${i.quantidade} × ${i.unitCent} = ${i.totalCent}`, i.quantidade * i.unitCent === i.totalCent);

  const v = nota.ratearNfe([
    { id: 1, quantidade: 1, valor_unitario: 980 },
    { id: 2, quantidade: 2, valor_unitario: 96.5 },
    { id: 3, quantidade: 3, valor_unitario: 13 },
  ], 200400);
  ok("rateio com serviço embutido soma o total", v.reduce((a, i) => a + i.totalCent, 0) === 200400, v);
  ok("todo item fecha qtd × unitário", v.every(i => i.quantidade * i.unitCent === i.totalCent), v);
}

// ── 1b. Parcelas ─────────────────────────────────────────────────────────────
{
  // Os textos que existem em produção (18/11/2026).
  const casos = [
    ["Via boleto bancário", 1], [null, 1], ["Via boleto bancário parcelado em 2x", 2],
    ["Via boleto bancário parcelado em 3x", 3], ["Via boleto bancário, parcelado em 02 vezes", 2],
    ["Via boleto bancário parcelado em 4x", 4], ["Via boleto bancário, em duas vezes", 2],
    ["Parcelado em até 03 vezes, via boleto bancário (05 dias, 30/60)", 3], ["Via boleto bancário 7 dias", 1],
    ["03% DE DESCONTO A VISTA", 1], ["Mensalmente, via boleto", 1],
  ];
  for (const [t, n] of casos) ok(`"${t}" → ${n} parcela(s)`, nota.parcelasDoTexto(t) === n, nota.parcelasDoTexto(t));

  const v = nota.vencimentosPadrao(3, "2026-11-18");
  ok("calendário padrão: +5 dias, depois mensal", JSON.stringify(v) === JSON.stringify(["2026-11-23", "2026-12-18", "2027-01-18"]), v);
  ok("dia 31 cai no último dia do mês", nota.vencimentosPadrao(2, "2026-01-31")[1] === "2026-02-28");

  const pg = nota.montarPagamento({ forma_pagamento: "parcelado em 3x" }, 398597, null, "2026-11-18");
  ok("3 parcelas somam o total", pg.lista.reduce((a, x) => a + Math.round(x.valor * 100), 0) === 398597, pg.lista);
  ok("o centavo que sobra vai na última", pg.lista[0].valor === 1328.65 && pg.lista[2].valor === 1328.67, pg.lista);
  ok("percentuais fecham 100", Math.abs(pg.lista.reduce((a, x) => a + x.percentual, 0) - 100) < 1e-9, pg.lista);
  ok("sem erro no calendário padrão", pg.erro === null, pg.erro);

  const fora = nota.montarPagamento({}, 100000, { parcelas: 2, vencimentos: ["2026-12-01", "2026-11-25"] }, "2026-11-18");
  ok("vencimento fora de ordem bloqueia", /depois da 1/.test(fora.erro || ""), fora.erro);
  const passado = nota.montarPagamento({}, 100000, { parcelas: 2, vencimentos: ["2026-11-01", "2026-12-01"] }, "2026-11-18");
  ok("vencimento no passado bloqueia", /antes de hoje/.test(passado.erro || ""), passado.erro);
  const mudou = nota.montarPagamento({ forma_pagamento: "Via boleto bancário" }, 100000, { parcelas: 4 }, "2026-11-18");
  ok("quantidade do modal vale sobre o texto", mudou.parcelas === 4 && mudou.do_orcamento === 1);

  const os = nota.montarOs({ orc: { id: 9 }, itens: [{ descricao: "x", quantidade: 1, unitCent: 100000 }], nCodCli: 1, pagamento: { parcelas: 2, lista: [{ numero: 1, vencimento: "2026-11-23", valor: 500, percentual: 50 }, { numero: 2, vencimento: "2026-12-18", valor: 500, percentual: 50 }] } });
  ok("OS parcelada vai com 999 e a lista", os.Cabecalho.cCodParc === "999" && os.Cabecalho.nQtdeParc === 2 && os.Parcelas[1].dDtVenc === "18/12/2026" && os.Parcelas[0].tipo_documento === "BOL");
  const osAv = nota.montarOs({ orc: { id: 9 }, itens: [{ descricao: "x", quantidade: 1, unitCent: 100000 }], nCodCli: 1, pagamento: { parcelas: 1, lista: [] } });
  ok("OS à vista continua 000 sem lista", osAv.Cabecalho.cCodParc === "000" && !osAv.Parcelas);
}

// ── 1c. Sugestão peça × serviço (casos de produção) ─────────────────────────
{
  const n = (d) => nota.sugerirNatureza({ descricao: d });
  ok("Zeolita… Limpeza… é peça", n("Zeolita Areia Limpeza E Filtragem De Piscina - Pct 25kg") === "peca");
  ok("Fita teste para medir cloro é peça", n("Fita teste para medir cloro/PH Alc. Frasco com 25 fitas") === "peca");
  ok("Mão de obra é serviço", n("MÃO DE OBRA ESPECIALIZADA") === "servico");
  ok("Opção 01: CONSERTO… é serviço", n("Opção 01: CONSERTO Mod :Bomba Multiestágio Thebe") === "servico");
  ok("Pressostato — reparo é serviço", n("Pressostato — reparo") === "servico");
  ok("Repressurização e teste é serviço", n("Repressurização do sistema e teste de estanqueidade dos pontos reparados.") === "servico");
  ok("Emissão de ART é serviço", n("Emissão de ART (Anotação de Responsabilidade Técnica) referente aos serviços.") === "servico");
  ok("Usinagem do eixo é peça (produto no Omie)", n("USINAGEM DO EIXO") === "peca");
  ok("Fornecimento de tubos é peça", n("Fornecimento de tubos, conexões, ranhuras/abraçadeiras e materiais de vedação") === "peca");
}

// ── 2. _conferir (sem banco) ────────────────────────────────────────────────
{
  const orc = { id: 1, status: "aprovado", tipo: "pecas", condominio_id: 5, condo_cnpj: "00000000000000", condo_uf: "SP" };
  const linhas = [
    { id: 10, descricao: "Luva de união 60mm", quantidade: 2, valor_unitario: "96.50", natureza: "peca", omie_produto_codigo: null },
    { id: 11, descricao: "Mão de obra especializada", quantidade: 1, valor_unitario: "450.00", natureza: "servico", omie_produto_codigo: null },
  ];
  const prodInfo = new Map([[999, { codigo_produto: 999, codigo: "PRD00268", descricao: "LUVA DE UNIÃO 60MM", ncm: "3917.40.90", cfop: null }]]);

  const a = nota._conferir(orc, linhas, null, null, prodInfo);
  ok("peça sem produto bloqueia", a.tipo === "nfe" && /produto do Omie/.test(a.bloqueio || ""), a.bloqueio);

  const b = nota._conferir(orc, linhas, null, { 10: 999 }, prodInfo);
  ok("com o produto escolhido não bloqueia", b.bloqueio === null, b.bloqueio);
  ok("o serviço não vira item", b.itens.every(i => i.linha_id === 10), b.itens);
  ok("o item leva o total inteiro (643,00)", Math.round(b.itens.reduce((x, i) => x + i.total, 0) * 100) === 64300, b.itens);
  ok("serviço embutido = 450", b.servico_embutido === 450);
  ok("CFOP padrão 5.102 quando o produto nunca saiu com outro", b.itens.every(i => i.cfop === "5.102"));
  ok("descrição do item é a do Omie", b.itens[0].descricao === "LUVA DE UNIÃO 60MM");

  const c = nota._conferir({ ...orc, condo_uf: "RJ" }, linhas, null, { 10: 999 }, prodInfo);
  ok("fora de SP bloqueia (CFOP 6.xxx)", /fora de SP/.test(c.bloqueio || ""), c.bloqueio);

  const d = nota._conferir({ ...orc, omie_os_codigo: 123 }, linhas, null, { 10: 999 }, prodInfo);
  ok("OS de tentativa anterior bloqueia virar DANFE", /OS \(NFS-e\)/.test(d.bloqueio || ""), d.bloqueio);

  const e = nota._conferir(orc, linhas, { 10: "servico" }, null, prodInfo);
  ok("tudo serviço volta a ser NFS-e", e.tipo === "nfse" && e.bloqueio === null, e);
}

// ── 3. Rotas, contra o banco de teste, com o Omie dublê ─────────────────────
const chamadas = [];
let pedidoExistente = null;
let nfGerada = false;
Object.assign(omie, {
  acharClientePorDocumento: async (doc) => { chamadas.push(["acharCliente", doc]); return { codigo_cliente_omie: 777, estado: "SP" }; },
  upsertCliente: async () => { throw new Error("não devia criar cliente"); },
  consultarPedidoPorIntegracao: async (cod) => { chamadas.push(["consultarPedido", cod]); return pedidoExistente; },
  incluirPedido: async (payload) => {
    chamadas.push(["incluirPedido", payload]);
    pedidoExistente = { cabecalho: { codigo_pedido: 55501, etapa: "50" } };
    return { codigo_pedido: 55501, numero_pedido: "999" };
  },
  faturarPedido: async (n) => { chamadas.push(["faturarPedido", n]); pedidoExistente.cabecalho.etapa = "60"; nfGerada = true; return { cCodStatus: "0" }; },
  nfPorPedido: async (n) => { chamadas.push(["nfPorPedido", n]); return nfGerada ? { ide: { nNF: "00000801", dCan: "", cDeneg: "N" }, compl: { nIdNF: 88801 } } : null; },
  documentosNfe: async (n) => { chamadas.push(["documentosNfe", n]); return { cCodStatus: "0", cPdf: "https://click.omie.com/pdfnfe-teste" }; },
  consultarOsPorIntegracao: async () => { throw new Error("DANFE não devia consultar OS"); },
  incluirOs: async () => { throw new Error("DANFE não devia criar OS"); },
});

(async () => {
  // Orçamento de teste próprio: criado aqui, apagado no fim.
  const condo = await pool.query(`SELECT id FROM condominios ORDER BY id LIMIT 1`);
  const condoId = condo.rows[0].id;
  const antes = await pool.query(`SELECT cnpj, uf, omie_cliente_codigo FROM condominios WHERE id = $1`, [condoId]);
  await pool.query(`UPDATE condominios SET cnpj = '00000000000000', uf = 'SP', omie_cliente_codigo = NULL WHERE id = $1`, [condoId]);
  const prods = await pool.query(`SELECT codigo_produto, descricao FROM omie_produtos WHERE NOT inativo ORDER BY vezes_faturado DESC LIMIT 2`);
  if (prods.rowCount < 2) throw new Error("catálogo vazio no banco de teste — rode a sincronização antes");
  const [p1, p2] = prods.rows.map(x => Number(x.codigo_produto));

  const o = await pool.query(
    `INSERT INTO orcamentos (condominio_id, status, tipo, numero) VALUES ($1, 'aprovado', 'pecas', 'OR-TESTE-DANFE') RETURNING id`,
    [condoId]
  );
  const orcId = o.rows[0].id;
  const L = async (d, q, v) => (await pool.query(
    `INSERT INTO orcamento_linhas (orcamento_id, descricao, quantidade, valor_unitario) VALUES ($1,$2,$3,$4) RETURNING id`, [orcId, d, q, v])).rows[0].id;
  const lA = await L("Peça de teste DANFE A", 26, 240);
  const lB = await L("Peça de teste DANFE B", 1, 100);
  const lS = await L("Mão de obra de teste DANFE", 1, 450);
  const descA = "Peça de teste DANFE A";

  const app = express();
  app.use(express.json());
  app.use("/admin", require("../../src/routes/nota-fiscal.routes").notaFiscalRouter);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/admin`;
  const tk = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${tk}` };
  const post = async (p, body) => { const x = await fetch(base + p, { method: "POST", headers: H, body: JSON.stringify(body || {}) }); return [x.status, await x.json()]; };

  try {
    const nat = { [lA]: "peca", [lB]: "peca", [lS]: "servico" };

    const [s1, pv] = await post(`/orcamentos/avulsos/${orcId}/nota/previa`, { naturezas: nat, produtos: {} });
    ok("prévia pela rota responde 200", s1 === 200, pv);
    ok("prévia: DANFE pedindo o produto", pv.tipo === "nfe" && /produto do Omie/.test(pv.bloqueio || ""), pv.bloqueio);
    ok("prévia traz sugestões para as peças", pv.linhas.filter(l => l.sugestoes).length === 2);

    const [s2, pv2] = await post(`/orcamentos/avulsos/${orcId}/nota/previa`, { naturezas: nat, produtos: { [lA]: p1, [lB]: p2 } });
    ok("com produtos escolhidos, prévia sem bloqueio", s2 === 200 && pv2.bloqueio === null, pv2.bloqueio);

    // Prévia com 3 parcelas pela rota.
    const [s2b, pv4] = await post(`/orcamentos/avulsos/${orcId}/nota/previa`, { naturezas: nat, produtos: { [lA]: p1, [lB]: p2 }, pagamento: { parcelas: 3 } });
    ok("prévia com 3 parcelas e calendário padrão", s2b === 200 && pv4.pagamento?.parcelas === 3 && pv4.pagamento.lista.length === 3 && pv4.pagamento.lista.every(x => x.vencimento), pv4.pagamento);

    const [s3, em] = await post(`/orcamentos/avulsos/${orcId}/nota/emitir`, { naturezas: nat, produtos: { [lA]: p1, [lB]: p2 }, pagamento: { parcelas: 3 } });
    ok("emitir responde 200", s3 === 200, em);
    ok("nota emitida com o número da NF-e", em.nota_status === "emitida" && em.nota_numero === "801" && em.nota_tipo === "nfe", em);
    ok("link da DANFE gravado", em.nota_url === "https://click.omie.com/pdfnfe-teste");

    const inc = chamadas.find(c => c[0] === "incluirPedido")?.[1];
    ok("pedido com código de integração ORC-<id>", inc?.cabecalho?.codigo_pedido_integracao === `ORC-${orcId}`);
    ok("pedido no molde: cenário, categoria, conta, sem frete", inc?.cabecalho?.codigo_cenario_impostos === nota.MOLDE_NFE.cenario
      && inc?.informacoes_adicionais?.codigo_categoria === "1.01.02" && inc?.frete?.modalidade === "9");
    const totPed = Math.round(inc.det.reduce((a, d) => a + d.produto.quantidade * d.produto.valor_unitario, 0) * 100);
    ok("pedido soma o orçamento inteiro (peças + serviço = 6.790,00)", totPed === 679000, totPed);
    ok("a mão de obra não virou item", inc.det.length === 3, inc.det.map(d => d.produto));
    ok("26 unidades da peça A no pedido", inc.det.filter(d => d.produto.codigo_produto === p1).reduce((a, d) => a + d.produto.quantidade, 0) === 26);
    ok("códigos de item únicos", new Set(inc.det.map(d => d.ide.codigo_item_integracao)).size === inc.det.length);
    const lp = inc.lista_parcelas?.parcela || [];
    ok("pedido parcelado: 999, 3 parcelas", inc.cabecalho.codigo_parcela === "999" && inc.cabecalho.qtde_parcelas === 3 && lp.length === 3, inc.cabecalho);
    ok("as parcelas somam o pedido", Math.round(lp.reduce((a, x) => a + x.valor, 0) * 100) === totPed, lp);
    ok("parcelas em boleto, datas dd/mm/aaaa", lp.every(x => x.tipo_documento === "BOL" && x.meio_pagamento === "15" && /^\d{2}\/\d{2}\/\d{4}$/.test(x.data_vencimento)), lp);

    const gr = await pool.query(`SELECT id, natureza, omie_produto_codigo FROM orcamento_linhas WHERE orcamento_id = $1 ORDER BY id`, [orcId]);
    ok("produto gravado na linha", Number(gr.rows.find(x => x.id === lA).omie_produto_codigo) === p1);
    const vin = await pool.query(`SELECT codigo_produto FROM omie_produto_vinculos WHERE descricao_norm = $1`, [require("../../src/services/omie-produtos.service").normalizar(descA)]);
    ok("a escolha foi lembrada", Number(vin.rows[0]?.codigo_produto) === p1);

    const [s4, pv3] = await post(`/orcamentos/avulsos/${orcId}/nota/previa`, {});
    ok("depois de emitida, a prévia bloqueia", s4 === 200 && /já tem nota emitida/.test(pv3.bloqueio || ""), pv3.bloqueio);

    // Retomada: o pedido existe e já foi faturado — não pode criar outro.
    await pool.query(`UPDATE orcamentos SET nota_status = 'erro', nota_numero = NULL WHERE id = $1`, [orcId]);
    const antesInc = chamadas.filter(c => c[0] === "incluirPedido").length;
    const antesFat = chamadas.filter(c => c[0] === "faturarPedido").length;
    const [s5, em2] = await post(`/orcamentos/avulsos/${orcId}/nota/emitir`, { naturezas: nat, produtos: { [lA]: p1, [lB]: p2 } });
    ok("retomada responde 200", s5 === 200, em2);
    ok("retomada NÃO cria outro pedido", chamadas.filter(c => c[0] === "incluirPedido").length === antesInc);
    ok("retomada NÃO fatura de novo pedido já faturado", chamadas.filter(c => c[0] === "faturarPedido").length === antesFat);

    const [s6, at] = await post(`/orcamentos/avulsos/${orcId}/nota/atualizar`, {});
    ok("atualizar responde 200 e mantém emitida", s6 === 200 && at.nota_status === "emitida", at);

    // NFS-e continua pelo caminho de sempre (o emitir foi dividido em dois).
    // Mesmo orçamento, tudo marcado como serviço, sem pedido anterior.
    await pool.query(`UPDATE orcamentos SET nota_status = NULL, nota_numero = NULL, nota_url = NULL, nota_tipo = NULL, omie_pedido_codigo = NULL WHERE id = $1`, [orcId]);
    let osIncluida = null;
    Object.assign(omie, {
      consultarOsPorIntegracao: async () => (osIncluida ? { Cabecalho: { nCodOS: 4401 } } : null),
      incluirOs: async (payload) => { osIncluida = payload; return { nCodOS: 4401 }; },
      statusOs: async () => (osIncluida
        ? { cFaturada: "S", ListaRpsNfse: [{ nNfse: "1234", cUrlNfse: "https://nfse.teste/1234" }] }
        : { cFaturada: "N" }),
      faturarOs: async () => ({}),
    });
    const tudoServico = { [lA]: "servico", [lB]: "servico", [lS]: "servico" };
    const [s8, ns] = await post(`/orcamentos/avulsos/${orcId}/nota/emitir`, { naturezas: tudoServico, produtos: {}, pagamento: { parcelas: 2 } });
    ok("NFS-e: emitir responde 200 e emite", s8 === 200 && ns.nota_tipo === "nfse" && ns.nota_status === "emitida" && ns.nota_numero === "1234", ns);
    ok("NFS-e: OS com as 3 linhas como serviço", osIncluida?.ServicosPrestados?.length >= 3, osIncluida?.ServicosPrestados);
    ok("NFS-e: OS parcelada em 2 (999 + lista)", osIncluida?.Cabecalho?.cCodParc === "999" && osIncluida.Parcelas?.length === 2
      && Math.round(osIncluida.Parcelas.reduce((a, x) => a + x.nValor, 0) * 100) === 679000, osIncluida?.Parcelas);

    // Sugestão de produto nos casos que erravam (só se os produtos ainda
    // existirem no catálogo — ele é cópia do Omie, que muda).
    const catSvc = require("../../src/services/omie-produtos.service");
    const tem = async (cod) => (await pool.query(`SELECT 1 FROM omie_produtos WHERE codigo = $1 AND NOT inativo`, [cod])).rowCount > 0;
    const sug = await catSvc.sugerir(["Cola para tubo pvc", "Junta de Vedação", "Cotovelo 60mm", "01 BOMBA DE RECALQUE"]);
    if (await tem("PRD00197")) ok("cola: o KIT HIDRAULICO (LIXA + COLA) está nas sugestões", sug["Cola para tubo pvc"].some(x => x.codigo === "PRD00197"), sug["Cola para tubo pvc"].map(x => x.codigo));
    ok("cola: nenhum tubo nas sugestões", !sug["Cola para tubo pvc"].some(x => /^TUBO|\bTUBO\b/.test(x.descricao) && !/COLA/.test(x.descricao)), sug["Cola para tubo pvc"].map(x => x.descricao));
    if (await tem("PRD00407")) ok("junta: JUNTAS DE VEDAÇÃO em primeiro (plural)", sug["Junta de Vedação"][0].codigo === "PRD00407", sug["Junta de Vedação"].map(x => x.codigo));
    ok("cotovelo 60mm: nenhum de 75mm em primeiro", !/75MM/.test(sug["Cotovelo 60mm"][0].descricao), sug["Cotovelo 60mm"].map(x => x.descricao));
    ok("bomba de recalque: a primeira sugestão é bomba, não peça de bomba", /^BOMBA/.test(sug["01 BOMBA DE RECALQUE"][0].descricao), sug["01 BOMBA DE RECALQUE"].map(x => x.descricao));

    // Kill-switch continua valendo na DANFE.
    await pool.query(`UPDATE orcamentos SET nota_status = NULL, nota_tipo = NULL, omie_os_codigo = NULL, omie_pedido_codigo = NULL WHERE id = $1`, [orcId]);
    process.env.OMIE_EMISSAO = "";
    const [s7, ks] = await post(`/orcamentos/avulsos/${orcId}/nota/emitir`, { naturezas: nat, produtos: { [lA]: p1, [lB]: p2 } });
    ok("sem OMIE_EMISSAO, emitir é 503", s7 === 503, ks);
  } finally {
    srv.close();
    await pool.query(`DELETE FROM omie_produto_vinculos WHERE descricao_norm LIKE 'peca de teste danfe%'`);
    await pool.query(`DELETE FROM orcamento_linhas WHERE orcamento_id = $1`, [orcId]);
    await pool.query(`DELETE FROM orcamentos WHERE id = $1`, [orcId]);
    await pool.query(`UPDATE condominios SET cnpj = $2, uf = $3, omie_cliente_codigo = $4 WHERE id = $1`,
      [condoId, antes.rows[0].cnpj, antes.rows[0].uf, antes.rows[0].omie_cliente_codigo]);
  }

  let falhas = 0;
  for (const [n, c] of r) { console.log(`${c ? "✓" : "✗"} ${n}`); if (!c) falhas++; }
  console.log(`\n${r.length - falhas}/${r.length} ok`);
  await pool.end();
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
