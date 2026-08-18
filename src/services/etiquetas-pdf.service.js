// Folha A4 de etiquetas QR para equipamentos.
//
// A etiqueta é do EQUIPAMENTO e é permanente: uma vez colada na bomba, ela
// vale pras próximas dez visitas dela à oficina. Isso muda duas coisas no
// desenho deste serviço:
//
//  1. O QR aponta pra URL pública real, nunca pra localhost — etiqueta impressa
//     com host errado vira lixo físico que alguém vai colar mesmo assim. Quem
//     chama valida antes (`baseUrlValida`).
//  2. Correção de erro alta (`H`, ~30% do código recuperável): etiqueta de casa
//     de máquinas vive com graxa, respingo e sol. O código humano impresso ao
//     lado é o plano B quando nem isso salva.
//
// Puppeteer com browser singleton (mesmo padrão de orcamento-pdf.service.js —
// sem cold start no Railway). O PDF sai em memória e vai direto na resposta:
// não persiste em disco, que é efêmero no Railway de qualquer forma.

const puppeteer = require("puppeteer");
const QRCode = require("qrcode");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Alfabeto Crockford base32: sem I, L, O e U. Os três primeiros porque se
// confundem com 1/0 quando alguém digita o código da etiqueta suja na mão; o U
// porque some acidentalmente ao formar palavrão em código aleatório.
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TAM_CODIGO = 8; // 32^8 ≈ 1,1 trilhão — colisão é irrelevante, e há UNIQUE

/** Código aleatório (não sequencial: a URL da ficha não pode ser adivinhável). */
function gerarCodigo() {
  const bytes = crypto.randomBytes(TAM_CODIGO);
  let out = "";
  for (let i = 0; i < TAM_CODIGO; i++) out += ALFABETO[bytes[i] % 32];
  return out;
}

/** "AB7K2M9X" → "AB7K-2M9X" (só exibição; no banco fica sem hífen). */
function formatarCodigo(codigo) {
  const c = String(codigo || "");
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/**
 * Normaliza o que veio da URL/digitação: maiúsculas, sem hífen/espaço, e
 * traduz os caracteres que o alfabeto Crockford exclui justamente porque as
 * pessoas os confundem (I/L → 1, O → 0, U → V).
 */
function normalizarCodigo(entrada) {
  return String(entrada || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
}

/**
 * Recusa host local. Chamado pelo router antes de gerar o PDF: o erro precisa
 * acontecer ANTES do papel sair da impressora, não depois.
 */
function baseUrlValida(baseUrl) {
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname;
    return !(h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local"));
  } catch {
    return false;
  }
}

// Formatos de folha. `corte` é o padrão: papel comum, grade com marcas de
// corte. `pimaco6180` casa com a folha adesiva pré-cortada de 10 etiquetas
// (84,7 × 50,8 mm) — ali a margem precisa bater com a picotagem, e a borda
// tracejada some pra não imprimir traço em cima do adesivo.
const FORMATOS = {
  corte: {
    label: "Papel comum (com marcas de corte)",
    cols: 2, rows: 5,
    largura: 95, altura: 52,
    margemTopo: 12, margemLado: 10,
    gapX: 0, gapY: 3,
    borda: true,
  },
  pimaco6180: {
    label: "Pimaco 6180 / A4260 (10 por folha)",
    cols: 2, rows: 5,
    largura: 84.7, altura: 50.8,
    margemTopo: 21.5, margemLado: 19,
    gapX: 2.6, gapY: 0,
    borda: false,
  },
};

// Wordmark branco com engrenagens amarelas e fundo transparente — é o que
// pousa sobre a faixa marinho. Lido uma vez e injetado como data URI numa
// classe CSS: repetir a imagem em cada célula inflaria o HTML em ~1,3 MB por
// folha, e o navegador baixaria o mesmo asset dez vezes.
let _logoCache;
function logoBase64() {
  if (_logoCache !== undefined) return _logoCache;
  try {
    const bin = fs.readFileSync(path.join(__dirname, "../../public/login-logo.png"));
    _logoCache = `data:image/png;base64,${bin.toString("base64")}`;
  } catch {
    _logoCache = null; // sem logo a etiqueta ainda sai, só com o wordmark em texto
  }
  return _logoCache;
}

async function qrSvg(url) {
  // margin 0: a folga branca ao redor é dada pelo CSS, não pelo SVG — assim o
  // QR ocupa exatamente a caixa reservada e não encolhe sozinho.
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 0,
  });
}

function renderHTML(etiquetas, fmt) {
  const logo = logoBase64();

  const celula = (e) => `
    <div class="et">
      <div class="cabeca">
        ${logo ? `<div class="logo"></div>` : `<div class="wordmark">GENERAL BOMBAS</div>`}
      </div>
      <div class="corpo">
        <div class="qr">${e.svg}</div>
        <div class="txt">
          <div class="cod">${formatarCodigo(e.codigo)}</div>
          <div class="dica">Escaneie para ver<br>o histórico deste equipamento</div>
        </div>
      </div>
      <div class="pe">Propriedade de General Bombas · generalbombas.com</div>
    </div>`;

  // Pagina em blocos de cols × rows. A folha tem altura fixa (297mm) porque a
  // grade de uma folha adesiva não pode "escorrer" — sem essa fatia manual, o
  // que passa da primeira folha é cortado em vez de ir pra próxima página.
  const porFolha = fmt.cols * fmt.rows;
  const folhas = [];
  for (let i = 0; i < etiquetas.length; i += porFolha) {
    const bloco = etiquetas.slice(i, i + porFolha);
    // Células vazias completam a última folha pra grade não desalinhar.
    const filler = '<div class="et is-vazia"></div>'.repeat(porFolha - bloco.length);
    folhas.push(`<div class="folha">${bloco.map(celula).join("")}${filler}</div>`);
  }

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .folha {
    width: 210mm; height: 297mm;
    padding: ${fmt.margemTopo}mm ${fmt.margemLado}mm;
    display: grid;
    grid-template-columns: repeat(${fmt.cols}, ${fmt.largura}mm);
    grid-auto-rows: ${fmt.altura}mm;
    column-gap: ${fmt.gapX}mm;
    row-gap: ${fmt.gapY}mm;
    justify-content: center;
    align-content: start;
  }
  .folha + .folha { page-break-before: always; }

  /* A etiqueta é a marca em três faixas: cabeça marinho, campo branco com o
     QR, e o pé. O QR fica SEMPRE em preto sobre branco — invertido (claro
     sobre escuro) muitos leitores de celular não pegam, e uma etiqueta que
     não escaneia é papel colado à toa numa bomba. */
  .et {
    display: flex; flex-direction: column;
    ${fmt.borda ? "border: 0.3mm dashed #b0b0b0;" : ""}
    border-radius: 1.5mm;
    overflow: hidden;
    background: #fff;
  }
  .et.is-vazia { border-color: transparent; background: none; }
  .et.is-vazia > * { display: none; }

  /* Cabeça: campo marinho com o chanfro de 45° do wordmark, que é a
     assinatura da marca (ver DESIGN.md). */
  .cabeca {
    position: relative;
    height: 13mm;
    flex: none;
    background: #0d2775;
    padding: 2mm 4mm;
    display: flex; align-items: center;
    /* Chanfro de 45° cortando o canto inferior direito — a assinatura da
       marca. 9mm para o corte ser lido como intenção, não como defeito de
       impressão. */
    clip-path: polygon(0 0, 100% 0, 100% 30%, calc(100% - 9mm) 100%, 0 100%);
  }
  .logo {
    width: 54mm; height: 9.5mm;
    background-image: url("${logo}");
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
  }
  .wordmark {
    font-size: 9pt; font-weight: 800; letter-spacing: .14em; color: #fff;
  }

  .corpo {
    flex: 1;
    display: flex; align-items: center; gap: 3.5mm;
    padding: 2.5mm 4mm 1mm;
    min-height: 0;
  }
  .qr { width: 26mm; height: 26mm; flex: none; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .txt { min-width: 0; }
  .cod {
    font-family: "Consolas", "Courier New", monospace;
    font-size: 16pt; font-weight: 700; letter-spacing: .03em;
    color: #061033;
    padding-bottom: 1.2mm;
    /* O fio amarelo é o acento da marca no único lugar onde não disputa com a
       leitura do QR. */
    border-bottom: 0.6mm solid #fbb329;
    display: inline-block;
  }
  .dica {
    font-size: 6.5pt; color: #4a5578; line-height: 1.4; margin-top: 1.6mm;
  }
  .pe {
    flex: none;
    padding: 1mm 4mm 2mm;
    font-size: 5.5pt; letter-spacing: .04em; color: #8a93ad;
  }
</style></head>
<body>${folhas.join("")}</body></html>`;
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
      await _browser.version(); // valida que o processo ainda está vivo
      return _browser;
    } catch {
      _browser = null;
    }
  }
  _browser = await puppeteer.launch({ args: PUPPETEER_ARGS, headless: true });
  return _browser;
}

/**
 * @param {Array<{codigo: string}>} equipamentos
 * @param {string} baseUrl  origem pública (ex.: https://app.generalbombas.com)
 * @param {string} formatoNome  chave de FORMATOS
 * @returns {Promise<Buffer>} PDF em memória
 */
async function gerarPdfEtiquetas(equipamentos, baseUrl, formatoNome = "corte") {
  const fmt = FORMATOS[formatoNome] || FORMATOS.corte;
  const base = String(baseUrl).replace(/\/+$/, "");

  const etiquetas = [];
  for (const eq of equipamentos) {
    etiquetas.push({
      codigo: eq.codigo,
      svg: await qrSvg(`${base}/e/${eq.codigo}`),
    });
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(renderHTML(etiquetas, fmt), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      displayHeaderFooter: false,
    });
    return Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);
  } finally {
    await page.close();
  }
}

module.exports = {
  gerarCodigo,
  formatarCodigo,
  normalizarCodigo,
  baseUrlValida,
  gerarPdfEtiquetas,
  // Exportados pra conferir o layout sem gerar PDF (screenshot da folha).
  renderHTML,
  qrSvg,
  FORMATOS,
  ALFABETO,
};
