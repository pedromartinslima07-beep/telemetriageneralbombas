// Guias de tributos → contas a pagar no Omie (migration 100).
//
//   node scripts/testes/guias-tributos.test.js
//
// ⚠️ O QUE ELE PROVA, exercitando de verdade (leitor de PDF + router + JWT +
// banco de teste, com o Omie SIMULADO: nenhuma chamada sai daqui):
//   - o leitor: dígitos verificadores da arrecadação (módulo 10 e 11) e do
//     boleto; valor tirado do código de barras; fator de vencimento depois
//     da virada de 2025;
//   - um DAS em PDF (gerado aqui pelo Chrome, com texto de verdade) vira uma
//     guia com tipo, valor, vencimento, competência e número do documento, e
//     já com fornecedor/categoria/conta da regra do tipo;
//   - o mesmo PDF de novo não cria outra guia; PDF sem código de barras
//     entra para digitar; arquivo que não é PDF é 400;
//   - conferência: linha digitável errada é 400, valor diferente do código é
//     400, trocar o tipo traz a regra do tipo novo, "lembrar" grava a regra;
//   - lançar: sem OMIE_EMISSAO é 503; achou no Omie a mesma guia lançada à
//     mão → 409 com a lista e a guia volta a "conferir"; "lançar mesmo
//     assim" inclui com o código de integração, datas dd/mm/aaaa, a linha
//     no formato do Omie, e anexa o PDF num zip válido; lançar de novo é 409;
//   - queda sem resposta vira "incerto", e a nova tentativa CONSULTA e não
//     inclui outra vez; anexo que falha não desfaz o lançamento, e dá para
//     anexar de novo;
//   - gerente e operador levam 403.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou no fim (guias com
// arquivo_nome "TESTE-GUIA%"; as regras voltam como estavam).
require("dotenv").config({ quiet: true });
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const zlib = require("zlib");
const { resolverDatabaseUrl } = require("../../src/db-url");
// As guias só abrem para os logins do painel novo (PAINEL_NOVO).
process.env.PAINEL_NOVO = "teste-painel@exemplo.invalid";

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const { pool } = require("../../src/db");
const omie = require("../../src/services/omie.service");
const leitura = require("../../src/services/guia-leitura.service");
const guiasSvc = require("../../src/services/guias.service");

const r = [];
const ok = (nome, cond, extra) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome + (cond || extra === undefined ? "" : "  → " + JSON.stringify(extra))); };

const { mod10, mod11Arrecadacao } = leitura._t;

// Uma linha de arrecadação de mentira, válida: segmento 5 (governo),
// identificador 8 (reais, módulo 11) — o mesmo formato do DAS.
function linhaArrecadacao(valorCentavos, livre) {
  const corpo = "858" + "X" + String(valorCentavos).padStart(11, "0") + String(livre).padStart(29, "0").slice(0, 29);
  const semDv = corpo.replace("X", "");
  const dv = mod11Arrecadacao(semDv);
  const barras = corpo.replace("X", String(dv));
  return { barras, linha: [0, 1, 2, 3].map(i => { const b = barras.slice(i * 11, i * 11 + 11); return b + mod11Arrecadacao(b); }).join("") };
}
const fmt = l => leitura.linhaFormatada(l);

let browser = null;
async function pdfDe(html) {
  if (!browser) browser = await require("puppeteer").launch({ headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage();
  await p.setContent(`<html><body style="font:12px Arial">${html}</body></html>`);
  const b = await p.pdf({ format: "A4" });
  await p.close();
  return Buffer.from(b);
}

let regrasAntes = [];
async function limpar() {
  await pool.query(`DELETE FROM guias_tributos WHERE arquivo_nome LIKE 'TESTE-GUIA%'`);
  for (const g of regrasAntes) {
    await pool.query(`UPDATE guias_regras SET omie_fornecedor=$2, omie_categoria=$3, omie_conta=$4 WHERE tipo=$1`,
      [g.tipo, g.omie_fornecedor, g.omie_categoria, g.omie_conta]);
  }
}

async function main() {
  // ── O leitor, sem banco ───────────────────────────────────────────────────
  // 3×2=6, 2×1=2, 1×2=2 → 10 → DV 0;  9×2=18→9, 4×1=4 → 13 → DV 7.
  ok("módulo 10 (conta à mão)", mod10("123") === 0 && mod10("49") === 7);
  // 3×2 + 2×3 + 1×4 = 16 → resto 5 → DV 6.
  ok("módulo 11 da arrecadação (conta à mão)", mod11Arrecadacao("123") === 6);
  const L1 = linhaArrecadacao(123456, "0001234567890123456789");
  const a = leitura.lerLinhaDigitavel(L1.linha);
  ok("arrecadação válida: valor do código", a && a.valor === 1234.56 && a.barras === L1.barras, a);
  const torta = L1.linha.slice(0, 20) + ((Number(L1.linha[20]) + 1) % 10) + L1.linha.slice(21);
  ok("um dígito trocado é recusado", leitura.lerLinhaDigitavel(torta) === null);
  ok("os 44 do código de barras também valem", leitura.lerLinhaDigitavel(L1.barras)?.linha === L1.linha);
  // Boleto de mentira: campo livre qualquer, DVs calculados.
  const bc = (() => {
    const banco = "237", moeda = "9", livre = "1234567890123456789012345", fator = "1000", valor = "0000058900";
    const c1 = banco + moeda + livre.slice(0, 5); const c2 = livre.slice(5, 15); const c3 = livre.slice(15, 25);
    return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + "1" + fator + valor;
  })();
  const b = leitura.lerLinhaDigitavel(bc);
  ok("boleto: valor e fator 1000 = 22/02/2025", b && b.valor === 589 && b.vencimento === "2025-02-22", b);
  ok("linha no formato do Omie", fmt(L1.linha) === [0, 1, 2, 3].map(i => L1.linha.slice(i * 12, i * 12 + 11) + "-" + L1.linha[i * 12 + 11]).join(" "));

  // ── Preparação ───────────────────────────────────────────────────────────
  await limpar();
  regrasAntes = (await pool.query(`SELECT * FROM guias_regras`)).rows;
  const adm = (await pool.query(`SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0].id;

  const L_DAS = linhaArrecadacao(254403, "1" + Date.now());
  const pdfDas = await pdfDe(`
    <h2>Documento de Arrecadação do Simples Nacional</h2>
    <table><tr><td>CNPJ</td><td>Razão Social</td></tr><tr><td>12.345.678/0001-95</td><td>EMPRESA DE TESTE LTDA</td></tr></table>
    <p>Período de Apuração</p><p>Outubro/2026</p>
    <p>Data de Vencimento</p><p>20/11/2026</p>
    <p>Número do Documento</p><p>07.20.26304.1234567-8</p>
    <p>Pagar este documento até</p><p>20/11/2026</p>
    <p>Valor Total do Documento</p><p>2.544,03</p>
    <p style="font-size:14px">${fmt(L_DAS.linha)}</p>`);
  const pdfSemCodigo = await pdfDe(`<h2>Guia do FGTS Digital (GFD)</h2><p>Competência 10/2026</p><p>Pagar até 20/11/2026</p><p>Valor a pagar 1.000,00</p><p>Pague pelo PIX</p>`);

  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use("/admin", require("../../src/routes/guias.routes"));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const tok = (role, email = "teste-painel@exemplo.invalid") => ({ Authorization: "Bearer " + jwt.sign({ id: adm, role, email }, process.env.JWT_SECRET, { expiresIn: "10m" }), "Content-Type": "application/json" });
  const ADM = tok("admin"), GER = tok("gerente"), OPE = tok("operador"), ANTIGO = tok("admin", "outro@exemplo.invalid");
  const chama = async (m, p, h, body) => {
    const res = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    const ct = res.headers.get("content-type") || "";
    return { s: res.status, ct, j: ct.includes("json") ? await res.json() : {}, buf: ct.includes("pdf") ? Buffer.from(await res.arrayBuffer()) : null };
  };
  const subir = (buf, nome) => chama("POST", "/admin/guias", ADM, { nome, pdf_base64: buf.toString("base64") });

  // O Omie simulado: só as funções que o serviço usa.
  const orig = {};
  for (const k of ["consultarContaPagarPorIntegracao", "listarContasPagarDoFornecedor", "incluirContaPagar", "incluirAnexo", "listarCategorias", "listarContasCorrentes"]) orig[k] = omie[k];
  const omieSim = { existentes: [], incluidos: [], anexos: [], falharInclusao: null, falharAnexo: null, consultas: 0 };
  omie.consultarContaPagarPorIntegracao = async cod => { omieSim.consultas++; return omieSim.incluidos.find(x => x.codigo_lancamento_integracao === cod) || null; };
  omie.listarContasPagarDoFornecedor = async () => omieSim.existentes;
  omie.incluirContaPagar = async p => {
    if (omieSim.falharInclusao) {
      const f = omieSim.falharInclusao; omieSim.falharInclusao = null;
      // queda DEPOIS de o Omie gravar: o pior caso
      omieSim.incluidos.push({ ...p, codigo_lancamento_omie: 7000 + omieSim.incluidos.length });
      throw new omie.OmieErro(f, { status: 504 });
    }
    const x = { ...p, codigo_lancamento_omie: 7000 + omieSim.incluidos.length };
    omieSim.incluidos.push(x);
    return { codigo_lancamento_omie: x.codigo_lancamento_omie, codigo_status: "0" };
  };
  omie.incluirAnexo = async a => {
    if (omieSim.falharAnexo) { const f = omieSim.falharAnexo; omieSim.falharAnexo = null; throw new omie.OmieErro(f); }
    omieSim.anexos.push(a); return { cCodStatus: "0", nIdAnexo: 1 };
  };
  omie.listarCategorias = async () => [{ codigo: "2.06.99", descricao: "Simples Nacional (DAS)" }, { codigo: "2.06", descricao: "Impostos", totalizadora: "S" }, { codigo: "2.06.96", descricao: "&lt;Disponível&gt;", conta_inativa: "S" }];
  omie.listarContasCorrentes = async () => [{ nCodCC: 6109178168, descricao: "BRADESCO *", codigo_banco: "237", inativo: "N" }, { nCodCC: 1, descricao: "Velha", inativo: "S" }];
  const emissaoAntes = process.env.OMIE_EMISSAO;

  try {
    ok("gerente não lê (403)", (await chama("GET", "/admin/guias", GER)).s === 403);
    ok("admin fora do painel novo não lê (403)", (await chama("GET", "/admin/guias", ANTIGO)).s === 403);
    ok("operador não sobe (403)", (await chama("POST", "/admin/guias", OPE, { pdf_base64: "eA==" })).s === 403);
    ok("arquivo que não é PDF: 400", (await subir(Buffer.from("não sou pdf"), "TESTE-GUIA-x.pdf")).s === 400);

    // ── o DAS ──
    const s1 = await subir(pdfDas, "TESTE-GUIA-das.pdf");
    const g = s1.j.guias && s1.j.guias[0];
    ok("PDF do DAS vira uma guia (201)", s1.s === 201 && s1.j.guias.length === 1, s1);
    ok("tipo, valor e vencimento lidos", g && g.tipo === "das" && g.valor === 2544.03 && g.vencimento === "2026-11-20", g);
    ok("competência e número do documento", g && g.competencia === "2026-10" && g.numero_documento === "07.20.26304.1234567-8" && g.cnpj === "12345678000195", g && [g.competencia, g.numero_documento, g.cnpj]);
    ok("código de barras do PDF", g && g.codigo_barras === L_DAS.barras && g.linha_digitavel === L_DAS.linha);
    ok("sem aviso na leitura", g && g.avisos.length === 0, g && g.avisos);
    const regraDas = regrasAntes.find(x => x.tipo === "das");
    ok("fornecedor, categoria e conta da regra do DAS", g && g.omie.fornecedor === Number(regraDas.omie_fornecedor) && g.omie.categoria === regraDas.omie_categoria && g.omie.conta === Number(regraDas.omie_conta), g && g.omie);

    const s2 = await subir(pdfDas, "TESTE-GUIA-das-de-novo.pdf");
    ok("o mesmo PDF de novo não cria outra", s2.s === 201 && s2.j.guias.length === 0 && s2.j.repetidas.length === 1 && s2.j.repetidas[0].id === g.id, s2.j);

    const s3 = await subir(pdfSemCodigo, "TESTE-GUIA-fgts.pdf");
    const gf = s3.j.guias && s3.j.guias[0];
    ok("PDF sem código de barras entra para digitar", s3.s === 201 && s3.j.sem_codigo && gf && !gf.codigo_barras && gf.tipo === "fgts" && gf.avisos.length === 1, s3.j);
    ok("…com o que o texto diz", gf && gf.vencimento === "2026-11-20" && gf.valor === 1000 && gf.competencia === "2026-10", gf);

    const pdfR = await chama("GET", `/admin/guias/${g.id}/pdf`, ADM);
    ok("o PDF volta inteiro", pdfR.s === 200 && pdfR.ct.includes("application/pdf") && pdfR.buf.equals(pdfDas));

    // ── conferência ──
    ok("linha digitável errada: 400", (await chama("PATCH", `/admin/guias/${gf.id}`, ADM, { linha_digitavel: "8580000000012345" })).s === 400);
    const L_FGTS = linhaArrecadacao(100000, "2" + Date.now());
    let p = await chama("PATCH", `/admin/guias/${gf.id}`, ADM, { linha_digitavel: fmt(L_FGTS.linha) });
    ok("linha digitada válida grava o código", p.s === 200 && p.j.guia.codigo_barras === L_FGTS.barras && p.j.guia.avisos.length === 0, p.j);
    p = await chama("PATCH", `/admin/guias/${gf.id}`, ADM, { valor: 999.99 });
    ok("valor diferente do código de barras: 400", p.s === 400 && /1000,00/.test(p.j.error || ""), p.j);
    p = await chama("PATCH", `/admin/guias/${gf.id}`, ADM, { tipo: "parcelamento" });
    const regraParc = regrasAntes.find(x => x.tipo === "parcelamento");
    ok("trocar o tipo traz a regra do tipo novo", p.s === 200 && p.j.guia.omie.categoria === regraParc.omie_categoria, p.j.guia && p.j.guia.omie);
    p = await chama("PATCH", `/admin/guias/${gf.id}`, ADM, { tipo: "fgts", omie_categoria: "2.03.99", lembrar: true });
    const rf = (await pool.query(`SELECT omie_categoria FROM guias_regras WHERE tipo='fgts'`)).rows[0];
    ok("\"lembrar\" grava a regra do tipo", p.s === 200 && p.j.guia.omie.categoria === "2.03.99" && rf.omie_categoria === "2.03.99", rf);

    // ── opções e fornecedores ──
    const op = await chama("GET", "/admin/guias/opcoes", ADM);
    ok("opções: só categorias de despesa usáveis e contas ativas", op.s === 200 && op.j.categorias.length === 1 && op.j.contas.length === 1 && op.j.contas[0].codigo === 6109178168, op.j);
    const fo = await chama("GET", "/admin/guias/fornecedores?q=receita", ADM);
    ok("fornecedores pela cópia", fo.s === 200 && Array.isArray(fo.j.fornecedores), fo.j);

    // ── lançar ──
    delete process.env.OMIE_EMISSAO;
    ok("sem OMIE_EMISSAO: 503 e nada vai", (await chama("POST", `/admin/guias/${g.id}/lancar`, ADM)).s === 503 && omieSim.incluidos.length === 0);
    process.env.OMIE_EMISSAO = "1";

    omieSim.existentes = [{ codigo_lancamento_omie: 555, valor_documento: 2544.03, data_vencimento: "20/11/2026", status_titulo: "AVENCER", codigo_barras_ficha_compensacao: "" }];
    let lz = await chama("POST", `/admin/guias/${g.id}/lancar`, ADM);
    let st = (await pool.query(`SELECT status FROM guias_tributos WHERE id=$1`, [g.id])).rows[0].status;
    ok("lançada à mão no Omie: 409 com a lista, nada incluído", lz.s === 409 && lz.j.parecidas && lz.j.parecidas[0].codigo === 555 && omieSim.incluidos.length === 0, lz.j);
    ok("…e a guia volta a conferir", st === "conferir", st);

    lz = await chama("POST", `/admin/guias/${g.id}/lancar`, ADM, { forcar: true });
    const inc = omieSim.incluidos[0];
    ok("\"lançar mesmo assim\" inclui", lz.s === 200 && lz.j.guia.status === "lancada" && lz.j.guia.omie.codigo === 7000, lz.j);
    ok("payload: integração, datas, valor, categoria, conta, BOL",
      inc && inc.codigo_lancamento_integracao === "GB-GUIA-" + g.id && inc.data_vencimento === "20/11/2026" && inc.data_previsao === "20/11/2026"
      && inc.valor_documento === 2544.03 && inc.codigo_categoria === regraDas.omie_categoria && inc.id_conta_corrente === Number(regraDas.omie_conta)
      && inc.codigo_cliente_fornecedor === Number(regraDas.omie_fornecedor) && inc.codigo_tipo_documento === "BOL", inc);
    ok("payload: linha no formato do Omie e documento só dígitos", inc && inc.codigo_barras_ficha_compensacao === fmt(L_DAS.linha) && inc.numero_documento === "0720263041234567" + "8".slice(0) && /DAS/.test(inc.observacao), inc);
    const an = omieSim.anexos[0];
    let zipOk = false;
    if (an) {
      const z = Buffer.from(an.cArquivo, "base64");
      const tamNome = z.readUInt16LE(26), tam = z.readUInt32LE(18);
      const dentro = z.slice(30 + tamNome, 30 + tamNome + tam);
      zipOk = z.readUInt32LE(0) === 0x04034b50 && dentro.equals(pdfDas) && an.cMd5 === crypto.createHash("md5").update(z).digest("hex")
        && z.readUInt32LE(14) === (zlib.crc32 ? zlib.crc32(pdfDas) : z.readUInt32LE(14));
    }
    ok("anexo: tabela conta-pagar, id do Omie, zip com o PDF e MD5 do zip", an && an.cTabela === "conta-pagar" && an.nId === 7000 && zipOk && lz.j.guia.omie.anexo_ok, an && { ...an, cArquivo: "…" });
    ok("lançar de novo: 409", (await chama("POST", `/admin/guias/${g.id}/lancar`, ADM)).s === 409 && omieSim.incluidos.length === 1);
    ok("lançada não se edita: 409", (await chama("PATCH", `/admin/guias/${g.id}`, ADM, { valor: 1 })).s === 409);

    // ── queda sem resposta → incerto → consulta, não inclui de novo ──
    omieSim.existentes = [];
    omieSim.falharInclusao = "Omie não respondeu em 30s (IncluirContaPagar).";
    omieSim.falharAnexo = "Arquivo inválido";
    lz = await chama("POST", `/admin/guias/${gf.id}/lancar`, ADM);
    st = (await pool.query(`SELECT status FROM guias_tributos WHERE id=$1`, [gf.id])).rows[0].status;
    ok("queda sem resposta: 504 e incerto", lz.s === 504 && st === "incerto", [lz.s, st]);
    const antes = omieSim.incluidos.length;
    lz = await chama("POST", `/admin/guias/${gf.id}/lancar`, ADM);
    ok("nova tentativa acha pelo código de integração e não inclui outra", lz.s === 200 && lz.j.ja_existia && lz.j.guia.status === "lancada" && omieSim.incluidos.length === antes, lz.j);
    ok("anexo que falhou fica marcado, sem desfazer", lz.j.guia && !lz.j.guia.omie.anexo_ok && /inválido/.test(lz.j.guia.omie.anexo_erro || ""), lz.j.guia && lz.j.guia.omie);
    lz = await chama("POST", `/admin/guias/${gf.id}/anexo`, ADM);
    ok("anexar de novo", lz.s === 200 && lz.j.guia.omie.anexo_ok, lz.j);

    // ── descartar ──
    const s4 = await subir(await pdfDe(`<p>Documento de Arrecadação de Receitas Federais</p><p>Vencimento 30/11/2026</p><p>${fmt(linhaArrecadacao(5000, "3" + Date.now()).linha)}</p>`), "TESTE-GUIA-darf.pdf");
    const gd = s4.j.guias[0];
    ok("DARF reconhecido", gd && gd.tipo === "darf" && gd.valor === 50 && gd.vencimento === "2026-11-30", gd);
    ok("descartar", (await chama("POST", `/admin/guias/${gd.id}/descartar`, ADM)).j.guia?.status === "descartada");
    ok("restaurar", (await chama("POST", `/admin/guias/${gd.id}/restaurar`, ADM)).j.guia?.status === "conferir");
    ok("lançada não se descarta: 409", (await chama("POST", `/admin/guias/${g.id}/descartar`, ADM)).s === 409);

    const l = await chama("GET", "/admin/guias", ADM);
    ok("a lista traz as guias e as regras", l.s === 200 && l.j.guias.some(x => x.id === g.id) && l.j.regras.das && l.j.envio_ligado === true, Object.keys(l.j));
  } finally {
    Object.assign(omie, orig);
    if (emissaoAntes === undefined) delete process.env.OMIE_EMISSAO; else process.env.OMIE_EMISSAO = emissaoAntes;
    server.close();
  }
}

main()
  .catch(e => { console.error(e); r.push({ nome: "exceção", cond: false }); })
  .finally(async () => {
    try { await limpar(); } catch (e) { console.error("limpeza:", e.message); }
    if (browser) await browser.close().catch(() => {});
    const f = r.filter(x => !x.cond).length;
    console.log(`\n${r.length - f}/${r.length} ${f ? "— FALHOU" : "ok"}`);
    await pool.end();
    process.exit(f ? 1 : 0);
  });
