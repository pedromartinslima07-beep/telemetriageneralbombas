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

// Formatos de folha. `corte` e `grande` são papel comum: grade com marcas de
// corte, pra recortar (e, no caso do grande, plastificar). Os de folha adesiva
// pré-cortada são outra história — ali a margem precisa bater com a picotagem,
// e a borda tracejada some pra não imprimir traço em cima do adesivo.
//
// `medidas` existe porque etiqueta menor não é a mesma arte reduzida: na
// A4263 (38,1 mm de altura, contra 50,8 da A4260) a faixa marinho e o QR do
// desenho original não cabem juntos, e deixar o CSS estourar empurraria o pé
// pra fora do adesivo. Cada formato declara suas alturas e corpos de letra.
const MEDIDAS_PADRAO = {
  safe: 0,          // sangria de segurança dentro da célula (mm) — ver nota abaixo
  cabecaH: 13,      // altura da faixa marinho (mm)
  chanfro: 9,       // corte de 45° no canto inferior direito da faixa (mm)
  logoW: 54, logoH: 9.5,
  padCabeca: 2,     // folga vertical dentro da faixa (mm)
  qr: 26,           // lado do QR (mm)
  codFs: 16,        // corpo do código humano (pt)
  dicaFs: 6.5, peFs: 5.5,
};

const FORMATOS = {
  corte: {
    label: "Papel comum (com marcas de corte)",
    cols: 2, rows: 5,
    largura: 95, altura: 52,
    margemTopo: 12, margemLado: 10,
    gapX: 0, gapY: 3,
    borda: true,
  },
  // Etiqueta grande pra imprimir em sulfite comum, recortar e plastificar —
  // é o caminho quando não há folha adesiva à mão e a bomba fica longe o
  // bastante pra que ler o QR de pé, sem chegar perto, valha o papel gasto.
  // 130 × 80 mm só cabe uma por linha (2 × 130 estouraria os 210 da folha),
  // então saem 3 por folha, centralizadas, com a borda tracejada servindo de
  // guia de corte — aqui o traço é bem-vindo, ele vira a linha da tesoura.
  grande: {
    label: "Grande — 130 × 80 mm, papel comum p/ plastificar (3 por folha)",
    cols: 1, rows: 3,
    largura: 130, altura: 80,
    margemTopo: 23.5, margemLado: 40,
    gapX: 0, gapY: 5,
    borda: true,
    // Tudo cresce junto: aumentar só o QR deixaria a faixa marinho parecendo
    // uma tarja perdida no topo. O QR vai a 45 mm — mais que o dobro de área
    // da A4263 — e o código humano acompanha, porque é ele que salva quando a
    // plastificação amarelar ou riscar.
    medidas: {
      safe: 0,
      cabecaH: 20, chanfro: 14, padCabeca: 3,
      logoW: 82, logoH: 14,
      qr: 45,
      codFs: 30, dicaFs: 11, peFs: 8.5,
    },
  },
  // A4263 / Avery L7163: 99,0 × 38,1 mm, 14 por folha (2 × 7). As margens são
  // as que sobram da folha depois da grade — 2×99 + 2,6 de medianiz deixa
  // 4,7 mm de cada lado; 7×38,1 deixa 15,15 mm em cima e embaixo.
  pimacoA4263: {
    label: "Pimaco A4263 / Avery L7163 — 99 × 38,1 mm (14 por folha)",
    cols: 2, rows: 7,
    largura: 99, altura: 38.1,
    margemTopo: 15.2, margemLado: 4.7,
    gapX: 2.6, gapY: 0,
    borda: false,
    // Etiqueta baixa e larga: a faixa afina e o QR encolhe pro que a altura
    // permite (20 mm ainda é folgado pro leitor de celular no nível H). A
    // largura que sobra vai pro código humano, que é o plano B quando o QR
    // sujar — por isso ele cresce em vez de a etiqueta ficar meio vazia.
    medidas: {
      safe: 1.5,
      cabecaH: 8.6, chanfro: 6, padCabeca: 1.2,
      logoW: 44, logoH: 6.4,
      qr: 20,
      codFs: 19, dicaFs: 6.5, peFs: 5,
    },
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

// Limites: dx/dy a ±5 mm porque além disso não é registro de impressora, é
// formato errado — e deslocar demais joga a última linha pra fora da folha.
// Escala a 90–110% pelo mesmo motivo.
function normalizarCalibragem(cal = {}) {
  const preso = (v, min, max, padrao) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao;
  };
  return {
    dx: preso(cal.dx, -5, 5, 0),
    dy: preso(cal.dy, -5, 5, 0),
    escala: preso(cal.escala, 90, 110, 100),
  };
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

function renderHTML(etiquetas, fmt, cal = {}) {
  const logo = logoBase64();
  const m = { ...MEDIDAS_PADRAO, ...(fmt.medidas || {}) };
  // Normaliza aqui e não só em gerarPdfEtiquetas: renderHTML é exportado e
  // chamado direto pra conferir layout, e um campo faltando viraria
  // scale(NaN) / calc(NaNmm) — que o browser descarta em silêncio, dando uma
  // folha "certa" que não corresponde ao que a rota gera.
  const c = normalizarCalibragem(cal);

  // `.et` é a CÉLULA da grade (a picotagem); `.arte` é o desenho, recuado por
  // `safe`. Sem essa separação o desenho encosta no corte, e o registro de
  // papel de qualquer impressora doméstica varia ~1 mm entre folhas — a faixa
  // marinho apareceria mordida ou sangrando na etiqueta vizinha. Com safe: 0
  // (formatos antigos) a arte ocupa a célula inteira, como sempre ocupou.
  const celula = (e) => `
    <div class="et"><div class="arte">
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
    </div></div>`;

  // Pagina em blocos de cols × rows. A folha tem altura fixa (297mm) porque a
  // grade de uma folha adesiva não pode "escorrer" — sem essa fatia manual, o
  // que passa da primeira folha é cortado em vez de ir pra próxima página.
  const porFolha = fmt.cols * fmt.rows;
  const folhas = [];
  for (let i = 0; i < etiquetas.length; i += porFolha) {
    const bloco = etiquetas.slice(i, i + porFolha);
    // Células vazias completam a última folha pra grade não desalinhar.
    const filler = '<div class="et is-vazia"><div class="arte"></div></div>'.repeat(porFolha - bloco.length);
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
  /* Compensação de escala. Muita impressora jato de tinta não imprime até a
     borda e o driver reduz a página inteira pra caber na área imprimível,
     centralizando — o conteúdo encolhe uns 4%. O sintoma é inconfundível:
     erra no topo, ACERTA NO MEIO (onde o erro de uma escala centrada é zero) e
     erra de novo embaixo, com o desvio crescendo pras pontas. Ampliar aqui
     na mesma proporção devolve o tamanho real depois da redução do driver.
     transform-origin center porque a redução do driver também é centrada. */
  .folha { transform: scale(${(c.escala / 100).toFixed(4)}); transform-origin: center center; }

  /* A grade sai da tabela oficial do fabricante, então NÃO é centralizada: os
     valores já são absolutos a partir do canto superior esquerdo da folha, e
     centralizar anularia o offset de calibração. dx/dy deslocam a grade
     inteira pra compensar o registro de papel da impressora — é o único ajuste
     que sobra quando o PDF está certo e o papel sai torto. */
  .folha {
    width: 210mm; height: 297mm;
    padding: ${(fmt.margemTopo + c.dy).toFixed(2)}mm
             ${(fmt.margemLado - c.dx).toFixed(2)}mm
             0
             ${(fmt.margemLado + c.dx).toFixed(2)}mm;
    display: grid;
    grid-template-columns: repeat(${fmt.cols}, ${fmt.largura}mm);
    grid-auto-rows: ${fmt.altura}mm;
    column-gap: ${fmt.gapX}mm;
    row-gap: ${fmt.gapY}mm;
    justify-content: start;
    align-content: start;
  }
  .folha + .folha { page-break-before: always; }

  /* A etiqueta é a marca em três faixas: cabeça marinho, campo branco com o
     QR, e o pé. O QR fica SEMPRE em preto sobre branco — invertido (claro
     sobre escuro) muitos leitores de celular não pegam, e uma etiqueta que
     não escaneia é papel colado à toa numa bomba. */
  .et { padding: ${m.safe}mm; }
  .arte {
    height: 100%;
    display: flex; flex-direction: column;
    ${fmt.borda ? "border: 0.3mm dashed #b0b0b0;" : ""}
    border-radius: 1.5mm;
    overflow: hidden;
    background: #fff;
  }
  .et.is-vazia .arte { border-color: transparent; background: none; }
  .et.is-vazia * { display: none; }

  /* Cabeça: campo marinho com o chanfro de 45° do wordmark, que é a
     assinatura da marca (ver DESIGN.md). */
  .cabeca {
    position: relative;
    height: ${m.cabecaH}mm;
    flex: none;
    background: #0d2775;
    padding: ${m.padCabeca}mm 4mm;
    display: flex; align-items: center;
    /* Chanfro de 45° cortando o canto inferior direito — a assinatura da
       marca. 9mm para o corte ser lido como intenção, não como defeito de
       impressão. */
    clip-path: polygon(0 0, 100% 0, 100% 30%, calc(100% - ${m.chanfro}mm) 100%, 0 100%);
  }
  .logo {
    width: ${m.logoW}mm; height: ${m.logoH}mm;
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
  .qr { width: ${m.qr}mm; height: ${m.qr}mm; flex: none; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .txt { min-width: 0; }
  .cod {
    font-family: "Consolas", "Courier New", monospace;
    font-size: ${m.codFs}pt; font-weight: 700; letter-spacing: .03em;
    color: #061033;
    padding-bottom: 1.2mm;
    /* O fio amarelo é o acento da marca no único lugar onde não disputa com a
       leitura do QR. */
    border-bottom: 0.6mm solid #fbb329;
    display: inline-block;
  }
  .dica {
    font-size: ${m.dicaFs}pt; color: #4a5578; line-height: 1.4; margin-top: 1.6mm;
  }
  .pe {
    flex: none;
    padding: 1mm 4mm 2mm;
    font-size: ${m.peFs}pt; letter-spacing: .04em; color: #8a93ad;
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
 * @param {{dx?: number, dy?: number}} cal  deslocamento da grade em mm
 * @returns {Promise<Buffer>} PDF em memória
 */
async function gerarPdfEtiquetas(equipamentos, baseUrl, formatoNome = "corte", cal = {}) {
  const fmt = FORMATOS[formatoNome] || FORMATOS.corte;
  const ajuste = normalizarCalibragem(cal);
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
    await page.setContent(renderHTML(etiquetas, fmt, ajuste), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const pdfBuf = await page.pdf({
      format: "A4",
      // Manda o Chrome obedecer o @page do CSS em vez do A4 dele: sem isso a
      // folha vira 8,27 × 11,69 pol arredondadas, e a grade adesiva perde as
      // frações de milímetro que a picotagem cobra.
      preferCSSPageSize: true,
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
  normalizarCalibragem,
  qrSvg,
  FORMATOS,
  ALFABETO,
};
