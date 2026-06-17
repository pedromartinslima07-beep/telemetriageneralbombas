// Geração de PDF de Orçamento Formal (Fase 7K)
// HTML+CSS → Puppeteer → PDF. Segue template: OR XXXXXX, itens com ficha técnica, condições.

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");
const { pool } = require("../db");

const UPLOAD_ROOT = path.join(__dirname, "../../uploads/orcamentos");
const PUBLIC_ROOT  = path.join(__dirname, "../../public");

const MM_PER_PX = 25.4 / 96; // 1 CSS px = 0.2646mm (96dpi)

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
       COALESCE(c.nome_fantasia, c.nome) AS condominio_nome,
       c.nome      AS condominio_razao_social,
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

function renderHTML({ os, itens }, areaP1, medidas = {}) {
  const timbrado = timbradoBase64();

  const orcNumero   = os.orcamento_numero || os.os_numero || String(os.id);
  const dataOrc     = fmtDateBR(os.finalizada_em || os.criado_em);
  const endParts    = [os.endereco, os.bairro, os.cidade && os.uf ? `${os.cidade}/${os.uf}` : (os.cidade || ""), os.cep ? `CEP ${os.cep}` : ""].filter(Boolean);
  const enderecoStr = endParts.join(" – ");
  const totalGeral  = itens.reduce((acc, it) => acc + Number(it.valor_unitario) * Number(it.quantidade), 0);
  const validadeStr = os.orcamento_valido_ate ? `60 dias (até ${fmtDateBR(os.orcamento_valido_ate)})` : "60 dias";

  // ── Paginação ────────────────────────────────────────────────────────────────
  // AREA_P1 vem medido em mm pela passagem 1 do Puppeteer (altura real do cabeçalho)
  const AREA_P2   = 224; // mm = pagina-body das págs seguintes (297-48-25)
  const RODAPE_MM = 30;  // total-box + sec condições + margens

  // Usa medidas reais do Puppeteer se disponíveis; fallback conservador caso contrário
  const ohP1       = medidas.ohP1       ?? 15;
  const ohPn       = medidas.ohPn       ?? 7;
  const mmBase     = medidas.mmItemBase  ?? 6;
  const mmFicha1   = medidas.mmItemFicha1 ?? 5;

  function mmItem(it) {
    if (!it.ficha_tecnica) return mmBase;
    return mmBase + it.ficha_tecnica.trim().split("\n").length * mmFicha1;
  }

  function paginar(lista) {
    const pags = [];
    let rest = lista.slice();

    const rowsP1 = Math.max(7, areaP1 - ohP1);

    let acc1 = 0;
    const p1 = [];
    for (const it of rest) {
      const h = mmItem(it);
      if (acc1 + h > rowsP1) break;
      p1.push(it);
      acc1 += h;
    }
    rest = rest.slice(p1.length);

    if (rest.length === 0 && acc1 + RODAPE_MM <= rowsP1) {
      pags.push({ itens: p1, showRodape: true });
      return pags;
    }
    pags.push({ itens: p1, showRodape: false });

    const rowsPN = Math.max(7, AREA_P2 - ohPn);
    while (rest.length > 0) {
      const alturaRest = rest.reduce((s, it) => s + mmItem(it), 0);
      if (alturaRest + RODAPE_MM <= rowsPN) {
        pags.push({ itens: rest.splice(0), showRodape: true });
      } else {
        let accN = 0;
        let count = 0;
        for (const it of rest) {
          const h = mmItem(it);
          if (accN + h > rowsPN) break;
          accN += h;
          count++;
        }
        pags.push({ itens: rest.splice(0, Math.max(1, count)), showRodape: false });
      }
    }

    if (!pags[pags.length - 1].showRodape) {
      pags.push({ itens: [], showRodape: true });
    }
    return pags;
  }

  const estrutura = paginar(itens);
  const bgStyle   = timbrado ? `background-image:url('${timbrado}');` : "";
  let   itemIdx   = 0;

  // ── HTML de cada página ────────────────────────────────────────────────────
  const paginasHtml = estrutura.map((pag, pgIdx) => {
    const isFirst = pgIdx === 0;
    let c = "";

    if (isFirst) {
      c += `
<div class="doc-info">
  <div class="doc-info-box">
    <div class="doc-title">ORÇAMENTO</div>
    <div class="doc-num">Nº ${escapeHtml(orcNumero)}</div>
    <div class="doc-date">Data: ${escapeHtml(dataOrc)}</div>
  </div>
</div>
<div class="cliente-box">
  <div class="sec-title">Cliente</div>
  <div class="cliente-nome">${escapeHtml(os.condominio_nome || "—")}</div>
  ${os.condominio_razao_social && os.condominio_razao_social !== os.condominio_nome ? `<div class="cliente-det">Razão social: ${escapeHtml(os.condominio_razao_social)}</div>` : ""}
  ${os.condominio_cnpj ? `<div class="cliente-det">CNPJ: ${escapeHtml(os.condominio_cnpj)}</div>` : ""}
  ${enderecoStr ? `<div class="cliente-det">${escapeHtml(enderecoStr)}</div>` : ""}
</div>
<div class="sec">
  <div class="sec-title"><span class="sec-num">1</span>Constatação</div>
  <div class="constata-text">${escapeHtml(os.orcamento_constatacao || "")}</div>
</div>`;
    }

    // Tabela de itens
    if (pag.itens.length > 0 || isFirst) {
      c += `<div class="sec">`;
      if (isFirst) c += `<div class="sec-title"><span class="sec-num">2</span>Itens do Orçamento</div>`;
      c += `<table class="tabela-itens">
<thead><tr>
  <th class="it-idx">#</th>
  <th>Descrição / Especificações</th>
  <th class="it-num" style="width:44px;">Qtd</th>
  <th class="it-num" style="width:90px;">Valor Unit.</th>
  <th class="it-num" style="width:90px;">Total</th>
</tr></thead>
<tbody>`;
      if (itens.length === 0) {
        c += `<tr><td colspan="5" class="it-vazio">Nenhum item adicionado ao orçamento.</td></tr>`;
      } else {
        pag.itens.forEach(it => {
          itemIdx++;
          const tot = Number(it.valor_unitario) * Number(it.quantidade);
          const fichaHtml = it.ficha_tecnica
            ? `<div class="ficha">${escapeHtml(it.ficha_tecnica).replace(/\n/g, "<br>")}</div>`
            : "";
          c += `<tr>
  <td class="it-idx">${itemIdx}</td>
  <td class="it-desc"><div class="it-desc-text">${escapeHtml(it.descricao)}</div>${fichaHtml}</td>
  <td class="it-num">${it.quantidade}</td>
  <td class="it-num">${fmtMoeda(it.valor_unitario)}</td>
  <td class="it-num">${fmtMoeda(tot)}</td>
</tr>`;
        });
      }
      c += `</tbody></table>`;
      if (pag.showRodape) {
        c += `<div class="total-row"><div class="total-box">VALOR TOTAL<span>${escapeHtml(fmtMoeda(totalGeral))}</span></div></div>`;
      }
      c += `</div>`;
    }

    // Condições Comerciais (última página)
    if (pag.showRodape) {
      c += `<div class="sec">
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
</div>`;
    }

    const extraClass = isFirst ? " pagina--primeira" : "";
    return `<div class="pagina${extraClass}" style="${bgStyle}"><div class="pagina-body">${c}</div></div>`;
  }).join("\n");

  // ── Documento completo ─────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>Orçamento ${escapeHtml(orcNumero)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ccc; }

  .pagina {
    width: 210mm;
    height: 297mm;
    overflow: hidden;
    position: relative;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 48mm 20mm 25mm 20mm;
    page-break-after: always;
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1f2e;
    font-size: 10px;
    line-height: 1.4;
  }
  .pagina:last-child { page-break-after: avoid; }
  .pagina--primeira { padding-top: 28mm; padding-bottom: 25mm; }
  /* Garante que o conteúdo nunca invade o endereço do timbrado (padding-bottom) */
  .pagina--primeira .pagina-body { height: 244mm; overflow: hidden; }
  .pagina:not(.pagina--primeira) .pagina-body { height: 224mm; overflow: hidden; }

  /* ── Número / data do orçamento ── */
  .doc-info { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .doc-info-box { text-align: right; }
  .doc-info-box .doc-title { font-size: 14px; font-weight: bold; color: #1a1f2e; letter-spacing: 1px; }
  .doc-info-box .doc-num   { font-size: 11px; color: #c07a00; font-weight: bold; margin-top: 2px; }
  .doc-info-box .doc-date  { font-size: 9px; color: #4a5568; margin-top: 2px; }

  /* ── Cliente ── */
  .cliente-box {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 7px 11px;
    margin-bottom: 8px;
    background: rgba(248,250,252,0.92);
  }
  .cliente-box .sec-title { font-size: 9px; font-weight: bold; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .cliente-nome { font-size: 12px; font-weight: bold; color: #1a1f2e; }
  .cliente-det  { font-size: 9px; color: #4a5568; margin-top: 2px; }

  /* ── Seções ── */
  .sec { margin-bottom: 8px; }
  .sec-title {
    font-size: 9px;
    font-weight: bold;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 0;
    border-bottom: 1.5px solid #f0b014;
    margin-bottom: 5px;
  }
  .sec-num {
    display: inline-block;
    background: #f0b014;
    color: #fff;
    font-size: 8px;
    font-weight: bold;
    padding: 1px 4px;
    border-radius: 3px;
    margin-right: 4px;
  }

  /* ── Constatação ── */
  .constata-text {
    font-size: 10px;
    color: #2d3748;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
    padding: 4px 6px;
    border: 1px dashed #cbd5e0;
    border-radius: 4px;
    background: rgba(250,251,252,0.92);
    min-height: 24px;
  }

  /* ── Tabela de itens ── */
  .tabela-itens { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .tabela-itens thead tr { background: #1e3a5f; color: #fff; }
  .tabela-itens th {
    padding: 4px 6px;
    text-align: left;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .tabela-itens th.it-num { text-align: right; }
  .tabela-itens tbody tr:nth-child(even) { background: rgba(247,250,252,0.9); }
  .tabela-itens td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .it-idx  { width: 22px; text-align: center; color: #718096; }
  .it-desc-text { font-weight: 500; }
  .it-num  { text-align: right; white-space: nowrap; }
  .ficha {
    margin-top: 2px;
    font-size: 8.5px;
    color: #4a5568;
    background: rgba(240,244,248,0.95);
    border-left: 3px solid #f0b014;
    padding: 2px 4px;
    border-radius: 0 3px 3px 0;
  }
  .it-vazio { text-align: center; color: #a0aec0; font-style: italic; padding: 14px; }

  /* ── Total ── */
  .total-row { display: flex; justify-content: flex-end; margin-top: 5px; }
  .total-box {
    background: #1e3a5f;
    color: #fff;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.5px;
  }
  .total-box span { color: #f0b014; margin-left: 10px; }

  /* ── Condições ── */
  .cond-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 16px; }
  .cond-item { font-size: 9.5px; }
  .cond-key  { color: #4a5568; font-weight: bold; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; }
  .cond-val  { color: #1a1f2e; margin-top: 1px; }
</style>
</head>
<body>
${paginasHtml}
</body></html>`;
}

// Renderiza apenas o cabeçalho fixo da pág 1 (doc-info + cliente + constatação)
// num div #measure de 170mm de largura para medir a altura real via page.evaluate().
function renderMeasureHTML({ os }) {
  const orcNumero   = os.orcamento_numero || os.os_numero || String(os.id);
  const dataOrc     = fmtDateBR(os.finalizada_em || os.criado_em);
  const endParts    = [os.endereco, os.bairro, os.cidade && os.uf ? `${os.cidade}/${os.uf}` : (os.cidade || ""), os.cep ? `CEP ${os.cep}` : ""].filter(Boolean);
  const enderecoStr = endParts.join(" – ");

  const theadHtml = `<thead><tr>
    <th class="it-idx">#</th>
    <th>Descrição / Especificações</th>
    <th class="it-num" style="width:44px;">Qtd</th>
    <th class="it-num" style="width:90px;">Valor Unit.</th>
    <th class="it-num" style="width:90px;">Total</th>
  </tr></thead>`;

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 210mm; background: white; font-family: Arial, Helvetica, sans-serif; color: #1a1f2e; font-size: 10px; line-height: 1.4; }
.measure-box { width: 170mm; overflow: hidden; }
.doc-info { display: flex; justify-content: flex-end; margin-bottom: 24px; }
.doc-info-box { text-align: right; }
.doc-info-box .doc-title { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
.doc-info-box .doc-num   { font-size: 11px; color: #c07a00; font-weight: bold; margin-top: 2px; }
.doc-info-box .doc-date  { font-size: 9px; color: #4a5568; margin-top: 2px; }
.cliente-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 11px; margin-bottom: 8px; background: rgba(248,250,252,0.92); }
.cliente-box .sec-title { font-size: 9px; font-weight: bold; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
.cliente-nome { font-size: 12px; font-weight: bold; }
.cliente-det  { font-size: 9px; color: #4a5568; margin-top: 2px; }
.sec { margin-bottom: 8px; }
.sec-title { font-size: 9px; font-weight: bold; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 0; border-bottom: 1.5px solid #f0b014; margin-bottom: 5px; }
.sec-num { display: inline-block; background: #f0b014; color: #fff; font-size: 8px; font-weight: bold; padding: 1px 4px; border-radius: 3px; margin-right: 4px; }
.constata-text { font-size: 10px; color: #2d3748; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; padding: 4px 6px; border: 1px dashed #cbd5e0; border-radius: 4px; background: rgba(250,251,252,0.92); min-height: 24px; }
.tabela-itens { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.tabela-itens th { padding: 4px 6px; text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; }
.tabela-itens th.it-num { text-align: right; }
.tabela-itens td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.it-idx { width: 22px; text-align: center; color: #718096; }
.it-desc-text { font-weight: 500; }
.it-num { text-align: right; white-space: nowrap; }
.ficha { margin-top: 2px; font-size: 8.5px; color: #4a5568; background: rgba(240,244,248,0.95); border-left: 3px solid #f0b014; padding: 2px 4px; border-radius: 0 3px 3px 0; }
</style>
</head>
<body>
<div id="measure" class="measure-box">
<div class="doc-info">
  <div class="doc-info-box">
    <div class="doc-title">ORÇAMENTO</div>
    <div class="doc-num">Nº ${escapeHtml(orcNumero)}</div>
    <div class="doc-date">Data: ${escapeHtml(dataOrc)}</div>
  </div>
</div>
<div class="cliente-box">
  <div class="sec-title">Cliente</div>
  <div class="cliente-nome">${escapeHtml(os.condominio_nome || "—")}</div>
  ${os.condominio_razao_social && os.condominio_razao_social !== os.condominio_nome ? `<div class="cliente-det">Razão social: ${escapeHtml(os.condominio_razao_social)}</div>` : ""}
  ${os.condominio_cnpj ? `<div class="cliente-det">CNPJ: ${escapeHtml(os.condominio_cnpj)}</div>` : ""}
  ${enderecoStr ? `<div class="cliente-det">${escapeHtml(enderecoStr)}</div>` : ""}
</div>
<div class="sec">
  <div class="sec-title"><span class="sec-num">1</span>Constatação</div>
  <div class="constata-text">${escapeHtml(os.orcamento_constatacao || "")}</div>
</div>
</div>

<!-- Overhead da seção de itens na pág 1: sec-title + thead (sem margin-bottom do .sec — ela fica na cauda e é clipada pelo overflow:hidden) -->
<div id="items-oh-p1" class="measure-box">
  <div class="sec" style="margin-bottom:0">
    <div class="sec-title"><span class="sec-num">2</span>Itens do Orçamento</div>
    <table class="tabela-itens">${theadHtml}</table>
  </div>
</div>

<!-- Overhead da seção de itens nas págs 2+: só thead (sem sec-title, sem margin-bottom) -->
<div id="items-oh-pn" class="measure-box">
  <div class="sec" style="margin-bottom:0">
    <table class="tabela-itens">${theadHtml}</table>
  </div>
</div>

<!-- Linha de item sem ficha técnica -->
<div id="item-base" class="measure-box">
  <table class="tabela-itens">
    <tbody><tr>
      <td class="it-idx">1</td>
      <td class="it-desc"><div class="it-desc-text">Serviço de manutenção preventiva</div></td>
      <td class="it-num">1</td><td class="it-num">R$&nbsp;0,00</td><td class="it-num">R$&nbsp;0,00</td>
    </tr></tbody>
  </table>
</div>

<!-- Linha de item com 1 linha de ficha técnica -->
<div id="item-ficha1" class="measure-box">
  <table class="tabela-itens">
    <tbody><tr>
      <td class="it-idx">1</td>
      <td class="it-desc"><div class="it-desc-text">Serviço de manutenção preventiva</div><div class="ficha">Especificação técnica do serviço realizado na unidade</div></td>
      <td class="it-num">1</td><td class="it-num">R$&nbsp;0,00</td><td class="it-num">R$&nbsp;0,00</td>
    </tr></tbody>
  </table>
</div>
</body></html>`;
}

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-zygote",
];

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

  const dir  = path.join(UPLOAD_ROOT, subdir, idStr);
  await fsp.mkdir(dir, { recursive: true });
  const filename   = `orcamento-${orcNumero}.pdf`;
  const fpath      = path.join(dir, filename);
  const urlPublica = `/uploads/orcamentos/${subdir}/${idStr}/${filename}`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Passagem 1: medir alturas reais via DOM (cabeçalho, overhead itens, item row)
    await page.setViewport({ width: 794, height: 2000, deviceScaleFactor: 1 });
    await page.setContent(renderMeasureHTML(dados), { waitUntil: "domcontentloaded", timeout: 30000 });
    const m = await page.evaluate(() => ({
      headerPx:    document.getElementById("measure").offsetHeight,
      ohP1Px:      document.getElementById("items-oh-p1").offsetHeight,
      ohPnPx:      document.getElementById("items-oh-pn").offsetHeight,
      itemBasePx:  document.getElementById("item-base").offsetHeight,
      itemFichaPx: document.getElementById("item-ficha1").offsetHeight,
    }));
    const areaP1       = Math.max(14, Math.round(244 - m.headerPx * MM_PER_PX));
    const ohP1         = m.ohP1Px   * MM_PER_PX;
    const ohPn         = m.ohPnPx   * MM_PER_PX;
    const mmItemBase   = m.itemBasePx  * MM_PER_PX;
    const mmItemFicha1 = (m.itemFichaPx - m.itemBasePx) * MM_PER_PX;
    console.log(`[orcamento-pdf] headerMm=${(m.headerPx*MM_PER_PX).toFixed(1)} areaP1=${areaP1} ohP1=${ohP1.toFixed(1)} ohPn=${ohPn.toFixed(1)} itemBase=${mmItemBase.toFixed(1)} itemFicha1=${mmItemFicha1.toFixed(1)} itens=${dados.itens.length}`);

    // Passagem 2: gerar PDF com medidas exatas
    const html = renderHTML(dados, areaP1, { ohP1, ohPn, mmItemBase, mmItemFicha1 });
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
