// Geração de PDF de Orçamento Formal (Fase 7K)
// HTML+CSS → Puppeteer → PDF. Segue template: OR XXXXXX, itens com ficha técnica, condições.

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");
const { pool } = require("../db");

const UPLOAD_ROOT = path.join(__dirname, "../../uploads/orcamentos");
const PUBLIC_ROOT  = path.join(__dirname, "../../public");

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDateBR(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtMoeda(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timbradoBase64() {
  try {
    const buf = fs.readFileSync(path.join(PUBLIC_ROOT, "papel-timbrado.png"));
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}

async function buscarDadosAvulso(orcamentoId) {
  const r = await pool.query(
    `SELECT
       o.id,
       o.numero,
       o.status,
       o.constatacao,
       o.forma_pagamento,
       o.prazo_entrega,
       o.garantia,
       o.disponibilidade,
       o.valido_ate,
       o.criado_em,
       c.nome      AS condominio_nome,
       c.endereco, c.bairro, c.cidade, c.uf, c.cep,
       c.cnpj      AS condominio_cnpj
     FROM orcamentos o
     LEFT JOIN condominios c ON c.id = o.condominio_id
     WHERE o.id = $1`,
    [orcamentoId]
  );
  if (!r.rows.length) throw new Error("Orçamento não encontrado");

  const linhasRes = await pool.query(
    `SELECT id, descricao, ficha_tecnica, quantidade, valor_unitario
     FROM orcamento_linhas
     WHERE orcamento_id = $1
     ORDER BY id ASC`,
    [orcamentoId]
  );

  const o = r.rows[0];
  // normalise para mesmo formato que buscarDadosOrcamento usa
  const os = {
    ...o,
    os_numero:                o.numero,
    orcamento_numero:         o.numero,
    orcamento_constatacao:    o.constatacao,
    orcamento_forma_pagamento: o.forma_pagamento,
    orcamento_prazo_entrega:  o.prazo_entrega,
    orcamento_garantia:       o.garantia,
    orcamento_disponibilidade: o.disponibilidade,
    orcamento_valido_ate:     o.valido_ate,
    orcamento_status:         o.status,
    finalizada_em:            o.criado_em,
  };
  return { os, itens: linhasRes.rows };
}

function renderHTML({ os, itens }) {
  const timbrado = timbradoBase64();

  // número do orçamento: campo próprio ou fallback para OS numero
  const orcNumero = os.orcamento_numero || os.os_numero || String(os.id);
  const dataOrc   = fmtDateBR(os.finalizada_em || os.criado_em);

  // endereço do cliente
  const endParts = [os.endereco, os.bairro, os.cidade && os.uf ? `${os.cidade}/${os.uf}` : (os.cidade || ""), os.cep ? `CEP ${os.cep}` : ""].filter(Boolean);
  const enderecoStr = endParts.join(" – ");

  // total geral
  const totalGeral = itens.reduce((acc, it) => acc + (Number(it.valor_unitario) * Number(it.quantidade)), 0);

  // itens HTML
  const itensHtml = itens.map((it, idx) => {
    const total = Number(it.valor_unitario) * Number(it.quantidade);
    const fichaHtml = it.ficha_tecnica
      ? `<div class="ficha">${escapeHtml(it.ficha_tecnica).replace(/\n/g, "<br>")}</div>`
      : "";
    return `
      <tr>
        <td class="it-idx">${idx + 1}</td>
        <td class="it-desc">
          <div class="it-desc-text">${escapeHtml(it.descricao)}</div>
          ${fichaHtml}
        </td>
        <td class="it-num">${it.quantidade}</td>
        <td class="it-num">${fmtMoeda(it.valor_unitario)}</td>
        <td class="it-num">${fmtMoeda(total)}</td>
      </tr>`;
  }).join("");

  const semItens = itens.length === 0
    ? `<tr><td colspan="5" class="it-vazio">Nenhum item adicionado ao orçamento.</td></tr>`
    : "";

  const validadeStr = os.orcamento_valido_ate
    ? `60 dias (até ${fmtDateBR(os.orcamento_valido_ate)})`
    : "60 dias";

  const timbradoTag = timbrado
    ? `<div class="timbrado-bg" style="background-image:url('${timbrado}');"></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>Orçamento ${escapeHtml(orcNumero)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1f2e;
    font-size: 11px;
    line-height: 1.4;
    padding: 44mm 20mm 32mm 20mm;
  }

  /* ── Papel timbrado como fundo fixo (repete em cada página) ── */
  .timbrado-bg {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: -1;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: top left;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Número / data do orçamento ── */
  .doc-info {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 14px;
  }
  .doc-info-box {
    text-align: right;
  }
  .doc-info-box .doc-title {
    font-size: 16px;
    font-weight: bold;
    color: #1a1f2e;
    letter-spacing: 1px;
  }
  .doc-info-box .doc-num {
    font-size: 12px;
    color: #c07a00;
    font-weight: bold;
    margin-top: 2px;
  }
  .doc-info-box .doc-date {
    font-size: 10px;
    color: #4a5568;
    margin-top: 4px;
  }

  /* ── Cliente ── */
  .cliente-box {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
    background: rgba(248,250,252,0.92);
  }
  .cliente-box .sec-title {
    font-size: 10px;
    font-weight: bold;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .cliente-nome {
    font-size: 13px;
    font-weight: bold;
    color: #1a1f2e;
  }
  .cliente-det {
    font-size: 10px;
    color: #4a5568;
    margin-top: 3px;
  }

  /* ── Seções ── */
  .sec {
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .sec-title {
    font-size: 10px;
    font-weight: bold;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 0;
    border-bottom: 1.5px solid #f0b014;
    margin-bottom: 8px;
  }
  .sec-num {
    display: inline-block;
    background: #f0b014;
    color: #fff;
    font-size: 9px;
    font-weight: bold;
    padding: 1px 5px;
    border-radius: 3px;
    margin-right: 5px;
  }

  /* ── Constatação ── */
  .constata-text {
    font-size: 11px;
    color: #2d3748;
    white-space: pre-wrap;
    padding: 6px 8px;
    border: 1px dashed #cbd5e0;
    border-radius: 4px;
    background: rgba(250,251,252,0.92);
    min-height: 36px;
  }

  /* ── Tabela de itens ── */
  .tabela-itens {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  .tabela-itens thead tr {
    background: #1e3a5f;
    color: #fff;
  }
  .tabela-itens th {
    padding: 6px 8px;
    text-align: left;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .tabela-itens th.it-num { text-align: right; }
  .tabela-itens tbody tr:nth-child(even) { background: rgba(247,250,252,0.9); }
  .tabela-itens td {
    padding: 6px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .it-idx { width: 24px; text-align: center; color: #718096; }
  .it-desc { }
  .it-desc-text { font-weight: 500; }
  .it-num { text-align: right; white-space: nowrap; }
  .ficha {
    margin-top: 4px;
    font-size: 9.5px;
    color: #4a5568;
    background: rgba(240,244,248,0.95);
    border-left: 3px solid #f0b014;
    padding: 3px 6px;
    border-radius: 0 3px 3px 0;
  }
  .it-vazio {
    text-align: center;
    color: #a0aec0;
    font-style: italic;
    padding: 20px;
  }

  /* ── Total ── */
  .total-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .total-box {
    background: #1e3a5f;
    color: #fff;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.5px;
  }
  .total-box span { color: #f0b014; margin-left: 12px; }

  /* ── Condições ── */
  .cond-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 20px;
  }
  .cond-item { font-size: 10.5px; }
  .cond-key {
    color: #4a5568;
    font-weight: bold;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .cond-val { color: #1a1f2e; margin-top: 1px; }
</style>
</head>
<body>

${timbradoTag}

<!-- Número e data do orçamento -->
<div class="doc-info">
  <div class="doc-info-box">
    <div class="doc-title">ORÇAMENTO</div>
    <div class="doc-num">Nº ${escapeHtml(orcNumero)}</div>
    <div class="doc-date">Data: ${escapeHtml(dataOrc)}</div>
  </div>
</div>

<!-- Cliente -->
<div class="cliente-box">
  <div class="sec-title">Cliente</div>
  <div class="cliente-nome">${escapeHtml(os.condominio_nome || "—")}</div>
  ${os.condominio_cnpj ? `<div class="cliente-det">CNPJ: ${escapeHtml(os.condominio_cnpj)}</div>` : ""}
  ${enderecoStr ? `<div class="cliente-det">${escapeHtml(enderecoStr)}</div>` : ""}
</div>

<!-- Seção 1: Constatação -->
<div class="sec">
  <div class="sec-title"><span class="sec-num">1</span>Constatação</div>
  <div class="constata-text">${escapeHtml(os.orcamento_constatacao || "")}</div>
</div>

<!-- Seção 2: Itens -->
<div class="sec">
  <div class="sec-title"><span class="sec-num">2</span>Itens do Orçamento</div>
  <table class="tabela-itens">
    <thead>
      <tr>
        <th class="it-idx">#</th>
        <th>Descrição / Especificações</th>
        <th class="it-num" style="width:44px;">Qtd</th>
        <th class="it-num" style="width:90px;">Valor Unit.</th>
        <th class="it-num" style="width:90px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
      ${semItens}
    </tbody>
  </table>
  <div class="total-row">
    <div class="total-box">VALOR TOTAL<span>${escapeHtml(fmtMoeda(totalGeral))}</span></div>
  </div>
</div>

<!-- Seção 3: Condições Comerciais -->
<div class="sec">
  <div class="sec-title"><span class="sec-num">3</span>Condições Comerciais</div>
  <div class="cond-grid">
    <div class="cond-item">
      <div class="cond-key">Forma de Pagamento</div>
      <div class="cond-val">${escapeHtml(os.orcamento_forma_pagamento || "Via boleto bancário")}</div>
    </div>
    <div class="cond-item">
      <div class="cond-key">Prazo de Entrega</div>
      <div class="cond-val">${escapeHtml(os.orcamento_prazo_entrega || "5 dias úteis após aprovação")}</div>
    </div>
    <div class="cond-item">
      <div class="cond-key">Garantia</div>
      <div class="cond-val">${escapeHtml(os.orcamento_garantia || "12 meses por defeito de fabricação")}</div>
    </div>
    <div class="cond-item">
      <div class="cond-key">Validade da Proposta</div>
      <div class="cond-val">${escapeHtml(validadeStr)}</div>
    </div>
  </div>
</div>

</body></html>`;
}

const PUPPETEER_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

let _browser = null;

async function getBrowser() {
  if (_browser) {
    try {
      // Valida que o processo ainda está vivo
      await _browser.version();
      return _browser;
    } catch {
      _browser = null;
    }
  }
  _browser = await puppeteer.launch({ args: PUPPETEER_ARGS, headless: true });
  return _browser;
}

async function _gerarPdf(dados, subdir, idStr) {
  const { os } = dados;
  const orcNumero = os.orcamento_numero || os.os_numero || idStr;

  const html = renderHTML(dados);
  const dir  = path.join(UPLOAD_ROOT, subdir, idStr);
  await fsp.mkdir(dir, { recursive: true });
  const filename   = `orcamento-${orcNumero}.pdf`;
  const fpath      = path.join(dir, filename);
  const urlPublica = `/uploads/orcamentos/${subdir}/${idStr}/${filename}`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      displayHeaderFooter: false,
    });
    const buf = Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);
    await fsp.writeFile(fpath, buf);
  } finally {
    await page.close();
  }

  return { pdf_url: urlPublica, fpath };
}

async function gerarPdfAvulso(orcamentoId) {
  const dados = await buscarDadosAvulso(orcamentoId);
  return _gerarPdf(dados, "avulso", String(orcamentoId));
}

module.exports = { gerarPdfAvulso };
