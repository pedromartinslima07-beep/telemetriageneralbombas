// src/services/guia-leitura.service.js
//
// Lê o PDF de uma guia de tributo (DAS, DARF, FGTS Digital, DAE do eSocial,
// GPS, guia da prefeitura) e devolve o que dá para tirar dele: tipo, valor,
// vencimento, competência, número do documento, CNPJ e o código de barras.
// Ver docs/modulos/guias-tributos.md.
//
// ⚠️ O CÓDIGO DE BARRAS É A FONTE DO VALOR. A linha digitável de arrecadação
// (48 dígitos, começa com 8) traz o valor em centavos e quatro dígitos
// verificadores: se eles batem, o valor é o que o banco vai cobrar. O valor
// escrito no texto só confere ("o texto diz X, o código diz Y" vira aviso).
// O vencimento NÃO está no código de arrecadação (só no boleto bancário, de
// 47 dígitos, pelo fator de vencimento): vem do texto, e quando o texto não
// diz, a guia entra sem vencimento e a tela pede.
//
// Nada aqui grava nem chama ninguém: recebe bytes, devolve objetos.

const crypto = require("crypto");

let _pdfjs = null;
async function pdfjs() {
  // pdfjs-dist 4 é ESM; o build "legacy" roda no Node sem DOM nem canvas.
  if (!_pdfjs) _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return _pdfjs;
}

// Texto de cada página. Itens na mesma linha vão separados por espaço; fim de
// linha vira "\n" (é o que separa rótulo de valor nas guias em tabela).
async function textoDasPaginas(buffer) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({
    data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0,
  }).promise;
  const paginas = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const p = await doc.getPage(i);
      const c = await p.getTextContent();
      let t = "";
      for (const it of c.items) {
        if (typeof it.str !== "string") continue;
        t += it.str + (it.hasEOL ? "\n" : " ");
      }
      paginas.push(t.replace(/[ \t]+/g, " "));
    }
  } finally {
    await doc.destroy().catch(() => {});
  }
  return paginas;
}

// ── Dígitos verificadores ──────────────────────────────────────────────────

function mod10(num) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

// Módulo 11 da arrecadação (Febraban): resto 0 ou 1 → 0; resto 10 → 1.
function mod11Arrecadacao(num) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  if (r === 0 || r === 1) return 0;
  if (r === 10) return 1;
  return 11 - r;
}

// Linha de arrecadação: 4 blocos de 11 + DV. O 3º dígito (Febraban) diz o
// módulo e o que é o campo de valor:
//   6 → reais, módulo 10     7 → quantidade de moeda, módulo 10
//   8 → reais, módulo 11     9 → quantidade de moeda, módulo 11
// ⚠️ DAS e DARF vêm com 8 (conferido contra as linhas reais do Omie em
// 23/11/2026: "858..." com módulo 11 e o valor em reais). Ler o 8 como
// módulo 10 recusava toda guia federal.
function lerArrecadacao(d) {
  if (!/^8\d{47}$/.test(d)) return null;
  const ident = d[2];
  const f = ident === "6" || ident === "7" ? mod10 : ident === "8" || ident === "9" ? mod11Arrecadacao : null;
  if (!f) return null;
  const blocos = [0, 1, 2, 3].map(i => d.slice(i * 12, i * 12 + 12));
  if (!blocos.every(b => f(b.slice(0, 11)) === Number(b[11]))) return null;
  const barras = blocos.map(b => b.slice(0, 11)).join("");
  // DV geral (posição 4 do código de barras), calculado sem ele.
  if (f(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) return null;
  const valorEfetivo = ident === "6" || ident === "8";
  return {
    especie: "arrecadacao",
    linha: d,
    barras,
    segmento: barras[1],               // 1 prefeitura · 5 órgão do governo · ...
    valor: valorEfetivo ? Number(barras.slice(4, 15)) / 100 : null,
    vencimento: null,
  };
}

// Boleto bancário: 47 dígitos, três campos com DV módulo 10, DV geral, fator
// de vencimento (4) e valor (10).
const BASE_FATOR_1 = Date.UTC(1997, 9, 7);
const BASE_FATOR_2 = Date.UTC(2025, 1, 22); // fator 1000 depois da virada de 22/02/2025
function dataDoFator(fator, hoje = Date.now()) {
  if (!fator) return null;
  const a = BASE_FATOR_1 + fator * 86400e3;
  const b = BASE_FATOR_2 + (fator - 1000) * 86400e3;
  const d = Math.abs(a - hoje) <= Math.abs(b - hoje) ? a : b;
  return new Date(d).toISOString().slice(0, 10);
}
function lerBoleto(d, hoje) {
  if (!/^\d{47}$/.test(d)) return null;
  const c1 = d.slice(0, 10), c2 = d.slice(10, 21), c3 = d.slice(21, 32);
  if (mod10(c1.slice(0, 9)) !== Number(c1[9])) return null;
  if (mod10(c2.slice(0, 10)) !== Number(c2[10])) return null;
  if (mod10(c3.slice(0, 10)) !== Number(c3[10])) return null;
  const fator = Number(d.slice(33, 37));
  const barras = d.slice(0, 4) + d[32] + d.slice(33, 47) + c1.slice(4, 9) + c2.slice(0, 10) + c3.slice(0, 10);
  return {
    especie: "boleto",
    linha: d,
    barras,
    segmento: null,
    valor: Number(d.slice(37, 47)) / 100 || null,
    vencimento: dataDoFator(fator, hoje),
  };
}

// Acha as linhas digitáveis num texto: sequências de dígitos com espaço,
// ponto ou hífen no meio; cada janela de 48 (ou 47) dígitos é testada pelos
// verificadores — o que não bate é descartado, então número de documento ou
// CNPJ colado não vira código de barras.
function acharCodigos(texto, hoje) {
  const achados = [];
  const vistos = new Set();
  const candidatos = String(texto).match(/\d[\d \t.\-]{40,90}\d/g) || [];
  for (const c of candidatos) {
    const d = c.replace(/\D/g, "");
    for (const [tam, f] of [[48, lerArrecadacao], [47, lerBoleto]]) {
      for (let i = 0; i + tam <= d.length; i++) {
        const r = f(d.slice(i, i + tam), hoje);
        if (r && !vistos.has(r.barras)) { vistos.add(r.barras); achados.push(r); }
      }
    }
  }
  return achados;
}

// Formato que o Omie mostra (e que a importação por código de barras de lá
// grava): "85880000005-9 43..." para arrecadação; o boleto no padrão do banco.
function linhaFormatada(linha) {
  const d = String(linha || "").replace(/\D/g, "");
  if (d.length === 48) return [0, 1, 2, 3].map(i => d.slice(i * 12, i * 12 + 11) + "-" + d[i * 12 + 11]).join(" ");
  if (d.length === 47) return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  return d;
}

// ── O texto ─────────────────────────────────────────────────────────────────

const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function isoDeBr(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, aa] = m;
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${aa}-${mm}-${dd}`;
}

function numeroBr(s) {
  const n = Number(String(s || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Ordem importa: parcelamento é um DAS (ou DARF) de parcelamento, e vai para
// outra categoria; o DAE do eSocial tem "eSocial" e não "Simples".
function tipoDoTexto(t) {
  const s = sem(t);
  if (/parcelamento/i.test(s)) return "parcelamento";
  if (/FGTS\s*Digital|Guia do FGTS|\bGFD\b|Fundo de Garantia/i.test(s)) return "fgts";
  if (/Arrecadacao do eSocial|\bDAE\b/i.test(s)) return "dae";
  if (/Simples Nacional|\bDAS\b|PGDAS/i.test(s)) return "das";
  if (/Receitas Federais|\bDARF\b/i.test(s)) return "darf";
  if (/Previdencia Social|\bGPS\b/i.test(s)) return "gps";
  if (/Prefeitura|Municipio|Municipal|\bISS\b|\bTFE\b|\bTFA\b|DAMSP/i.test(s)) return "municipal";
  return null;
}

// O primeiro dd/mm/aaaa depois de um dos rótulos (até 80 caracteres adiante,
// atravessando a quebra de linha da tabela).
function dataDepoisDe(t, rotulos) {
  const s = sem(t);
  for (const r of rotulos) {
    const re = new RegExp(r + "[^\\d]{0,80}?(\\d{2}\\/\\d{2}\\/\\d{4})", "i");
    const m = s.match(re);
    if (m) { const iso = isoDeBr(m[1]); if (iso) return iso; }
  }
  return null;
}

function competenciaDoTexto(t) {
  const s = sem(t);
  const m = s.match(/(Periodo de Apuracao|Competencia|Mes\/Ano de Competencia|Referencia)[^\da-z]{0,40}([a-z]+\s*(?:\/|de)\s*\d{4}|\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4})/i);
  if (!m) return null;
  const v = m[2].trim();
  let r;
  if ((r = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return `${r[3]}-${r[2]}`;
  if ((r = v.match(/^(\d{2})\/(\d{4})$/))) return Number(r[1]) >= 1 && Number(r[1]) <= 12 ? `${r[2]}-${r[1]}` : null;
  if ((r = v.match(/^([a-z]+)\s*(?:\/|de)\s*(\d{4})$/i))) {
    const i = MESES.indexOf(r[1].toLowerCase());
    return i >= 0 ? `${r[2]}-${String(i + 1).padStart(2, "0")}` : null;
  }
  return null;
}

function valorDoTexto(t) {
  const s = sem(t);
  const m = s.match(/(Valor Total do Documento|Valor Total|Total a Recolher|Valor a Pagar|Valor do Documento|Valor Cobrado|Total)[^\d]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return m ? numeroBr(m[2]) : null;
}

function numeroDocumentoDoTexto(t) {
  const s = sem(t);
  const m = s.match(/N(?:umero|o\.?|º)\s*(?:do\s*)?Documento[^\d]{0,30}([\d][\d.\-\/]{6,30}\d)/i);
  return m ? m[1].slice(0, 40) : null;
}

function cnpjDoTexto(t) {
  const m = String(t).match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  return m ? m[1].replace(/\D/g, "") : null;
}

const NOMES = {
  das: "DAS · Simples Nacional", darf: "DARF", fgts: "FGTS Digital", dae: "DAE · eSocial",
  gps: "GPS · INSS", parcelamento: "Parcelamento", municipal: "Guia municipal", outro: "Guia",
};

// Uma página → uma guia (ou nenhuma, se não tiver código de barras).
function lerPagina(texto, hoje) {
  const codigos = acharCodigos(texto, hoje);
  if (!codigos.length) return [];
  const tipoTxt = tipoDoTexto(texto);
  const venc = dataDepoisDe(texto, [
    "Pagar este documento ate", "Pagar ate", "Pagavel ate", "Data de Vencimento", "Data limite para pagamento",
    "Vencimento", "Valido para pagamento ate", "Validade",
  ]);
  const comp = competenciaDoTexto(texto);
  const valorTxt = valorDoTexto(texto);
  const numDoc = numeroDocumentoDoTexto(texto);
  const cnpj = cnpjDoTexto(texto);
  // Duas linhas diferentes na mesma página (raro: canhoto de outra guia)
  // viram duas guias, cada uma com o mesmo texto ao redor.
  return codigos.map(c => {
    const avisos = [];
    let tipo = tipoTxt;
    if (!tipo) tipo = c.especie === "arrecadacao" && c.segmento === "1" ? "municipal" : "outro";
    const valor = c.valor ?? valorTxt;
    if (c.valor == null) avisos.push("O código de barras não traz o valor: confira o valor.");
    else if (valorTxt != null && Math.abs(valorTxt - c.valor) > 0.009 && codigos.length === 1) {
      avisos.push(`O texto diz ${valorTxt.toFixed(2).replace(".", ",")}, o código de barras diz ${c.valor.toFixed(2).replace(".", ",")}. Vale o do código.`);
    }
    const vencimento = venc || c.vencimento;
    if (!vencimento) avisos.push("Não achei o vencimento no PDF: informe a data.");
    if (venc && c.vencimento && venc !== c.vencimento) avisos.push("O vencimento do texto e o do código de barras não batem: confira.");
    if (!tipoTxt) avisos.push("Não reconheci o tipo da guia: escolha.");
    return {
      tipo,
      descricao: NOMES[tipo] || "Guia",
      competencia: comp,
      vencimento,
      valor,
      linha_digitavel: c.linha,
      codigo_barras: c.barras,
      numero_documento: numDoc,
      cnpj,
      leitura: { especie: c.especie, valor_texto: valorTxt, vencimento_texto: venc, avisos },
    };
  });
}

// O PDF inteiro. `guias` vazio = não achei código de barras (PDF escaneado,
// ou não é guia): quem chama cria uma guia em branco para digitar.
async function lerPdf(buffer, { hoje = Date.now() } = {}) {
  const md5 = crypto.createHash("md5").update(buffer).digest("hex");
  if (!buffer || buffer.length < 5 || buffer.slice(0, 5).toString("latin1") !== "%PDF-") {
    return { md5, guias: [], texto: false, erro: "O arquivo não é um PDF." };
  }
  let paginas;
  try {
    paginas = await textoDasPaginas(buffer);
  } catch (e) {
    return { md5, guias: [], texto: false, erro: "Não consegui abrir o PDF (" + (e.message || e) + ")." };
  }
  const texto = paginas.some(p => p.replace(/\s/g, "").length > 20);
  const guias = [];
  const vistos = new Set();
  for (const p of paginas) {
    for (const g of lerPagina(p, hoje)) {
      if (vistos.has(g.codigo_barras)) continue; // a mesma guia no canhoto e no corpo
      vistos.add(g.codigo_barras);
      guias.push(g);
    }
  }
  // Sem código de barras, ainda dá para aproveitar o que o texto diz.
  if (!guias.length && texto) {
    const t = paginas.join("\n");
    const tipo = tipoDoTexto(t) || "outro";
    return {
      md5, texto, guias: [], rascunho: {
        tipo, descricao: NOMES[tipo], competencia: competenciaDoTexto(t),
        vencimento: dataDepoisDe(t, ["Pagar este documento ate", "Pagar ate", "Data de Vencimento", "Vencimento"]),
        valor: valorDoTexto(t), numero_documento: numeroDocumentoDoTexto(t), cnpj: cnpjDoTexto(t),
      },
    };
  }
  return { md5, texto, guias };
}

// Para quem digita a linha à mão na tela: valida e devolve o mesmo formato.
function lerLinhaDigitavel(linha, hoje) {
  const d = String(linha || "").replace(/\D/g, "");
  if (d.length === 48) return lerArrecadacao(d);
  if (d.length === 47) return lerBoleto(d, hoje);
  if (d.length === 44) {
    // Código de barras cru (44): arrecadação começa com 8.
    if (d[0] === "8") {
      const f = d[2] === "6" || d[2] === "7" ? mod10 : mod11Arrecadacao;
      const l = [0, 1, 2, 3].map(i => { const b = d.slice(i * 11, i * 11 + 11); return b + f(b); }).join("");
      return lerArrecadacao(l);
    }
  }
  return null;
}

module.exports = { lerPdf, lerLinhaDigitavel, linhaFormatada, NOMES, _t: { mod10, mod11Arrecadacao, lerArrecadacao, lerBoleto, acharCodigos, lerPagina, dataDoFator } };
