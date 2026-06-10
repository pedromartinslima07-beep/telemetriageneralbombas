// Geração de PDF de Ordem de Serviço
// Layout segue o formulário de referência (public/ordem-de-servico.png).
// Logo azul (logo.png) centralizado no topo. Sem fundo de papel timbrado.

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");
const { pool } = require("../db");

const UPLOAD_ROOT = path.join(__dirname, "../../uploads/os");
const PUBLIC_ROOT = path.join(__dirname, "../../public");

const TIPOS_LABEL = {
  retirada_equipamento: "Retirada de Equipamento",
  vistoria_contrato:    "Vistoria p/ Contrato",
  visita_tecnica:       "Visita Técnica",
  devolucao:            "Devolução",
  limpeza_piscina:      "Limpeza de Piscina",
  limpeza_caixas:       "Limpeza de Caixas",
  chamado_emergencial:  "Chamado Emergencial",
  preventiva_mensal:    "Preventiva Mensal",
  instalacao_pecas:     "Instalação de Peças",
};

const TIPOS_GRID = [
  ["retirada_equipamento", "devolucao",       "chamado_emergencial"],
  ["vistoria_contrato",    "limpeza_piscina", "preventiva_mensal"],
  ["visita_tecnica",       "limpeza_caixas",  "instalacao_pecas"],
];

const EQUIPAMENTOS = [
  ["comando_eletrico",         "Comando Elétrico"],
  ["bombas_recalque",          "Bombas de Recalque"],
  ["bombas_succao",            "Bombas de Sucção"],
  ["bombas_piscina",           "Bombas de Piscina"],
  ["bombas_pressurizacao",     "Bombas de Pressurização"],
  ["bombas_cascata",           "Bombas de Cascata"],
  ["bombas_espelho",           "Bombas de Espelho d'Águas"],
  ["linha_automaticos",        "Linha dos Automáticos"],
  ["paineis_solares",          "Painéis Solares"],
  ["valvula_redutora_pressao", "Válvula Redutora de Pressão"],
  ["valvula_retencao",         "Válvula de Retenção"],
  ["estacao_tratamento",       "Estação de Tratamento"],
  ["grupo_gerador",            "Grupo Gerador"],
];

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
function fmtTimeBR(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  });
}

function logoBase64() {
  try {
    const buf = fs.readFileSync(path.join(PUBLIC_ROOT, "logo-azul.png"));
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}

function fotoToDataUrl(foto) {
  // Caminho preferencial: base64 armazenado no banco (sobrevive a restarts).
  if (foto.dados_base64 && foto.dados_base64.startsWith("data:")) return foto.dados_base64;
  // Fallback legacy: tenta ler do disco (só funciona se o arquivo ainda existir).
  const urlPublica = foto.url;
  if (!urlPublica || !urlPublica.startsWith("/uploads/")) return null;
  const rel = urlPublica.replace(/^\/+/, "");
  const fpath = path.join(__dirname, "../../", rel);
  try {
    const buf = fs.readFileSync(fpath);
    const ext = path.extname(fpath).toLowerCase().replace(".", "") || "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,` + buf.toString("base64");
  } catch { return null; }
}

function checkbox(marked) {
  if (marked) {
    return `<span class="cb cb-on"><svg viewBox="0 0 12 12"><polyline points="2.5,6.5 5,9 9.5,3"/></svg></span>`;
  }
  return `<span class="cb"></span>`;
}

async function buscarDadosOS(osId) {
  const osRes = await pool.query(
    `SELECT
       os.*,
       c.nome      AS condominio_nome,
       c.endereco, c.bairro, c.cidade, c.uf, c.cep,
       t.nome      AS tecnico_nome,
       t.telefone  AS tecnico_telefone
     FROM ordens_servico os
     LEFT JOIN condominios c ON c.id = os.condominio_id
     LEFT JOIN tecnicos    t ON t.id = os.tecnico_id
     WHERE os.id = $1`,
    [osId]
  );
  if (osRes.rows.length === 0) throw new Error("O.S. não encontrada");

  const [fotos, pecas] = await Promise.all([
    pool.query(`SELECT * FROM os_fotos   WHERE os_id = $1 ORDER BY criado_em ASC`, [osId]),
    pool.query(`SELECT * FROM os_pecas   WHERE os_id = $1 ORDER BY id        ASC`, [osId]),
  ]);

  return { os: osRes.rows[0], fotos: fotos.rows, pecas: pecas.rows };
}

function renderHTML({ os, fotos, pecas }) {
  const logo     = logoBase64();
  const tipos    = Array.isArray(os.tipos_servico) ? os.tipos_servico : [];
  const itens    = os.itens_verificados || {};
  const corr     = os.correntes || {};
  const corrTipo = corr.tipo || null;
  const corrVals = Array.isArray(corr.valores) ? corr.valores : [];
  const resKey   = os.servico_realizado;

  /* ── Tipos grid 3×3 ── */
  const tiposHtml = TIPOS_GRID.map(linha =>
    `<tr>${linha.map(k =>
      `<td>${checkbox(tipos.includes(k))}<span class="tlbl">${escapeHtml(TIPOS_LABEL[k])}</span></td>`
    ).join("")}</tr>`
  ).join("");

  /* ── Lista de equipamentos ── */
  const eqListHtml = EQUIPAMENTOS.map(([k, label]) =>
    `<div class="eq-item">${checkbox(!!itens[k])}<span class="eq-lbl">${escapeHtml(label)}</span></div>`
  ).join("");

  /* ── Corrente: 3 linhas em branco (sem rótulo), valor na coluna do tipo ── */
  const corrRows = [0, 1, 2].map((i) => {
    const raw = corrVals[i];
    const val = (raw != null && raw !== "") ? `${escapeHtml(String(raw))} A` : "";
    return `<tr>
      <td class="corr-cell">${corrTipo === "mono" ? val : ""}</td>
      <td class="corr-cell">${corrTipo === "bi"   ? val : ""}</td>
      <td class="corr-cell">${corrTipo === "tri"  ? val : ""}</td>
    </tr>`;
  }).join("");

  const enderecoLinha = [
    os.endereco,
    os.cidade ? `${os.cidade}${os.uf ? "/" + os.uf : ""}` : "",
  ].filter(Boolean).join(", ");

  /* ── Assinatura ── */
  const sigImg = os.assinatura_b64
    ? `<img class="sig-img" src="${
        os.assinatura_b64.startsWith("data:") ? os.assinatura_b64 : "data:image/png;base64," + os.assinatura_b64
      }" alt="Assinatura">`
    : "";

  /* ── Peças ── */
  const pecasHtml = pecas.length > 0 ? `
    <div class="extra-section">
      <div class="section-bar">Peças Usadas / Substituídas</div>
      <table class="tabela-pecas">
        <thead><tr><th>Descrição</th><th class="qtd-col">Qtd</th><th>Observação</th></tr></thead>
        <tbody>${pecas.map(p => `
          <tr>
            <td>${escapeHtml(p.descricao)}</td>
            <td class="qtd-col">${p.quantidade || 1}</td>
            <td>${escapeHtml(p.observacao || "")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  /* ── Fotos (página extra) ── */
  const fotosHtml = (() => {
    if (!fotos.length) return "";
    const items = fotos.map(f => {
      const data = fotoToDataUrl(f);
      if (!data) return "";
      const tl  = { antes: "Antes", depois: "Depois", geral: "Geral" }[f.tipo] || "Foto";
      const leg = f.legenda ? `: ${escapeHtml(f.legenda)}` : "";
      return `<div class="foto-card"><img src="${data}" alt=""><div class="foto-cap">${tl}${leg}</div></div>`;
    }).filter(Boolean).join("");
    if (!items) return "";
    return `<div class="page-break">
              <div class="section-bar">Registro Fotográfico</div>
              <div class="fotos-grid">${items}</div>
            </div>`;
  })();

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>OS ${escapeHtml(os.numero || "")}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 11px;
    line-height: 1.4;
  }

  /* ── Logo no topo ── */
  .logo-topo {
    text-align: center;
    margin-bottom: 10px;
  }
  .logo-topo img {
    width: 320px;
    height: auto;
    display: inline-block;
  }

  /* ── Título + telefones ── */
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    padding-bottom: 5px;
    border-bottom: 2px solid #1a3a6b;
  }
  .doc-title {
    font-size: 15px;
    font-weight: bold;
    color: #1a3a6b;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .doc-contacts { font-size: 9.5px; color: #333; text-align: right; }
  .doc-contacts span { display: block; }

  /* ── Tipos de serviço ── */
  .tipos-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .tipos-table td {
    border: 1px solid #555;
    padding: 4px 7px;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    width: 33.33%;
  }
  .tlbl { vertical-align: middle; }

  /* ── Checkboxes ── */
  .cb {
    display: inline-block;
    width: 12px; height: 12px;
    border: 1.5px solid #333;
    border-radius: 2px;
    vertical-align: middle;
    margin-right: 5px;
    background: #fff;
    flex-shrink: 0;
    position: relative;
  }
  .cb-on { background: #1a3a6b; border-color: #1a3a6b; }
  .cb-on svg {
    position: absolute;
    top: -1px; left: -1px;
    width: 12px; height: 12px;
    stroke: #fff;
    stroke-width: 2.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* ── Separador tracejado ── */
  .dash-sep { border-top: 1px dashed #999; margin: 6px 0; }

  /* ── Campos de dados ── */
  .form-fields { margin-bottom: 5px; }
  .frow {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    margin-bottom: 4px;
    font-size: 11px;
  }
  .fl { font-weight: bold; margin-right: 4px; white-space: nowrap; }
  .fv {
    border-bottom: 1px solid #555;
    min-width: 70px;
    padding-bottom: 1px;
    margin-right: 16px;
    display: inline-block;
    color: #111;
  }
  .fv-xl  { min-width: 320px; }
  .fv-lg  { min-width: 220px; }
  .fv-md  { min-width: 130px; }
  .fv-sm  { min-width: 80px;  }

  /* ── Equipamentos + Corrente + Horários ── */
  .eq-corrente-box {
    display: flex;
    border: 1px solid #444;
    margin-bottom: 7px;
  }
  .eq-col {
    flex: 1;
    border-right: 1px solid #444;
    padding: 6px 8px;
  }
  .eq-item {
    display: flex;
    align-items: center;
    margin-bottom: 3px;
    font-size: 10.5px;
  }
  .eq-lbl { margin-left: 4px; }

  .corrente-col {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #444;
  }
  .corrente-head {
    text-align: center;
    font-weight: bold;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #e8e8e8;
    border-bottom: 1px solid #444;
    padding: 4px;
  }
  .corrente-tipo {
    display: flex;
    gap: 10px;
    padding: 4px 8px;
    border-bottom: 1px solid #ccc;
    font-size: 10px;
    align-items: center;
  }
  .corrente-table {
    width: 100%;
    border-collapse: collapse;
    flex: 1;
  }
  .corrente-table th {
    background: #f2f2f2;
    border: 1px solid #bbb;
    text-align: center;
    font-size: 9.5px;
    padding: 3px;
  }
  .corrente-table td {
    border: 1px solid #bbb;
    text-align: center;
    font-size: 10px;
    padding: 5px 3px;
  }
  .fase-lbl { text-align: left !important; padding-left: 6px !important; font-size: 9.5px; color: #444; }

  .horarios-col {
    width: 120px;
    flex-shrink: 0;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
  }
  .horario-item { font-size: 10px; }
  .horario-label { font-weight: bold; display: block; margin-bottom: 4px; }
  .horario-val {
    border-bottom: 1px solid #555;
    display: inline-block;
    min-width: 85px;
  }

  /* ── Observações Gerais ── */
  .obs-box { border: 1px solid #444; margin-bottom: 7px; }
  .obs-bar {
    text-align: center;
    font-weight: bold;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #444;
    padding: 4px;
    background: #e8e8e8;
  }
  .obs-body {
    padding: 6px 10px;
    min-height: 55px;
    font-size: 11px;
    white-space: pre-wrap;
    color: #111;
  }
  .obs-lines { padding: 0 10px 6px; }
  .obs-line  { border-top: 1px solid #ddd; height: 18px; }

  /* ── Rodapé ── */
  .footer-note {
    font-size: 9.5px;
    color: #555;
    font-style: italic;
    margin-bottom: 8px;
  }
  .footer-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
  }
  .footer-checks { font-size: 11px; }
  .check-row { margin-bottom: 6px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .chk-lbl { font-weight: bold; margin-right: 4px; }
  .chk-opt { margin-right: 12px; white-space: nowrap; }

  .sig-area { text-align: center; min-width: 210px; font-size: 10px; flex-shrink: 0; }
  .sig-box {
    height: 70px;
    border-top: 1px solid #444;
    border-bottom: 1px solid #444;
    position: relative;
    overflow: hidden;
    margin-bottom: 4px;
    background: #fff;
  }
  .sig-img { max-width: 100%; max-height: 100%; display: block; margin: 0 auto; }
  .sig-cap { color: #444; }

  /* ── Peças extras ── */
  .extra-section { margin-top: 14px; page-break-inside: avoid; }
  .section-bar {
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    color: #1a3a6b;
    border-bottom: 1.5px solid #1a3a6b;
    padding-bottom: 3px;
    margin-bottom: 7px;
    letter-spacing: 0.3px;
  }
  .tabela-pecas { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .tabela-pecas th, .tabela-pecas td { padding: 5px 8px; border: 1px solid #ccc; text-align: left; }
  .tabela-pecas th { background: #f0f0f0; font-size: 9.5px; text-transform: uppercase; color: #444; }
  .qtd-col { text-align: center; width: 55px; }

  /* ── Fotos ── */
  .page-break { page-break-before: always; padding-top: 8px; }
  .fotos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
  .foto-card { border: 1px solid #ccc; overflow: hidden; page-break-inside: avoid; }
  .foto-card img { width: 100%; height: 210px; object-fit: cover; display: block; }
  .foto-cap { font-size: 10px; padding: 4px 6px; background: #f7f7f7; border-top: 1px solid #ccc; }
</style>
</head>
<body>

<!-- LOGO AZUL CENTRALIZADO -->
<div class="logo-topo">
  ${logo ? `<img src="${logo}" alt="General Engenharia da Manutenção">` : `<strong style="font-size:22px;color:#1a3a6b;">GENERAL ENGENHARIA DA MANUTENÇÃO</strong>`}
</div>

<!-- TÍTULO + TELEFONES -->
<div class="title-row">
  <span class="doc-title">Ordem de Serviço</span>
  <div class="doc-contacts">
    <span>📞 Central: (11) 2038-8679</span>
    <span>📞 Plantão I: (11) 96653-6110</span>
    <span>📞 Plantão II: (11) 91609-0590</span>
  </div>
</div>

<!-- TIPOS DE SERVIÇO -->
<table class="tipos-table"><tbody>${tiposHtml}</tbody></table>

<div class="dash-sep"></div>

<!-- DADOS DO ATENDIMENTO -->
<div class="form-fields">
  <div class="frow">
    <span class="fl">Data:</span><span class="fv fv-sm">${escapeHtml(fmtDateBR(os.chegada_em || os.criado_em))}</span>
    <span class="fl">Técnico:</span><span class="fv fv-md">${escapeHtml(os.tecnico_nome || "")}</span>
    <span class="fl">OS/Nº:</span><span class="fv fv-sm">${escapeHtml(os.numero || "")}</span>
  </div>
  <div class="frow">
    <span class="fl">Cliente:</span><span class="fv fv-xl">${escapeHtml(os.condominio_nome || "")}</span>
  </div>
  <div class="frow">
    <span class="fl">Endereço:</span><span class="fv fv-lg">${escapeHtml(enderecoLinha || "")}</span>
    <span class="fl">Bairro:</span><span class="fv fv-md">${escapeHtml(os.bairro || "")}</span>
  </div>
  <div class="frow">
    <span class="fl">Solicitante:</span><span class="fv fv-md">${escapeHtml(os.recebido_nome || "")}</span>
    <span style="margin-left:10px;">${checkbox(os.recebido_tipo === "gestor")}<span style="font-size:10px;font-weight:bold;margin-right:12px;">GESTOR</span></span>
    <span>${checkbox(os.recebido_tipo === "sindico")}<span style="font-size:10px;font-weight:bold;margin-right:12px;">SÍNDICO</span></span>
    <span>${checkbox(os.recebido_tipo === "portaria")}<span style="font-size:10px;font-weight:bold;">PORTARIA</span></span>
  </div>
</div>

<!-- EQUIPAMENTOS + CORRENTE + HORÁRIOS -->
<div class="eq-corrente-box">
  <div class="eq-col">
    ${eqListHtml}
  </div>
  <div class="corrente-col">
    <div class="corrente-head">Corrente</div>
    <div class="corrente-tipo">
      ${checkbox(corrTipo === "mono")}<span>Mono</span>
      ${checkbox(corrTipo === "bi")}<span>Bi</span>
      ${checkbox(corrTipo === "tri")}<span>Tri</span>
    </div>
    <table class="corrente-table">
      <thead><tr><th>Mono</th><th>Bi</th><th>Tri</th></tr></thead>
      <tbody>${corrRows}</tbody>
    </table>
  </div>
  <div class="horarios-col">
    <div class="horario-item">
      <span class="horario-label">Horário de Chegada:</span>
      <span class="horario-val">${escapeHtml(fmtTimeBR(os.chegada_em))}</span>
    </div>
    <div class="horario-item">
      <span class="horario-label">Horário de Saída:</span>
      <span class="horario-val">${escapeHtml(fmtTimeBR(os.saida_em))}</span>
    </div>
  </div>
</div>

<!-- OBSERVAÇÕES GERAIS -->
<div class="obs-box">
  <div class="obs-bar">Observações Gerais</div>
  <div class="obs-body">${escapeHtml(os.observacoes || "")}</div>
  ${!os.observacoes ? `<div class="obs-lines">
    <div class="obs-line"></div>
    <div class="obs-line"></div>
    <div class="obs-line"></div>
  </div>` : ""}
</div>

<!-- RODAPÉ: CIÊNCIA + ASSINATURA -->
<div class="footer-note">
  Sr. Gestor (Responsável), favor assinar a ficha dando ciência que os itens acima foram de fato verificados.
</div>
<div class="footer-bottom">
  <div class="footer-checks">
    <div class="check-row">
      <span class="chk-lbl">Necessário Retorno:</span>
      <span class="chk-opt">${checkbox(!!os.necessario_retorno)} Sim</span>
      <span class="chk-opt">${checkbox(!os.necessario_retorno)} Não</span>
      ${os.retorno_sugerido_em ? `<span style="font-size:9.5px;color:#666;margin-left:10px;">Sugerido: ${escapeHtml(fmtDateBR(os.retorno_sugerido_em))}</span>` : ""}
    </div>
    <div class="check-row">
      <span class="chk-lbl">Serviço Realizado:</span>
      <span class="chk-opt">${checkbox(resKey === "resolvido")} Resolvido</span>
      <span class="chk-opt">${checkbox(resKey === "paliativo")} Paliativo</span>
      <span class="chk-opt">${checkbox(resKey === "agravado")} Agravado</span>
    </div>
  </div>
  <div class="sig-area">
    <div class="sig-box">${sigImg}</div>
    <div class="sig-cap">Nome do Responsável / Visto</div>
  </div>
</div>

${pecasHtml}

${fotosHtml}

</body></html>`;
}

async function gerarPdfOS(osId) {
  const dados = await buscarDadosOS(osId);
  const { os } = dados;
  if (!os.finalizada_em) throw new Error("O.S. ainda não foi finalizada");

  const html = renderHTML(dados);
  const dir  = path.join(UPLOAD_ROOT, String(osId));
  await fsp.mkdir(dir, { recursive: true });
  const filename  = `os-${os.numero}.pdf`;
  const fpath     = path.join(dir, filename);
  const urlPublic = `/uploads/os/${osId}/${filename}`;

  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.error("[os-pdf pageerror]", err.message));
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "14mm", bottom: "14mm", left: "14mm" },
      displayHeaderFooter: true,
      footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:8px;color:#888;width:100%;padding:0 14mm;display:flex;justify-content:space-between;">
        <span>General Engenharia da Manutenção &middot; ${escapeHtml(os.numero)}</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>`,
      headerTemplate: `<div></div>`,
    });
    const buf = Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);
    await fsp.writeFile(fpath, buf);
  } finally {
    await browser.close();
  }

  await pool.query(
    `UPDATE ordens_servico SET pdf_url = $1 WHERE id = $2`,
    [urlPublic, osId]
  );

  return { pdf_url: urlPublic, fpath };
}

module.exports = { gerarPdfOS };
