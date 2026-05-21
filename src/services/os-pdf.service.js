// Geração de PDF de Ordem de Serviço (Fase 7E, pendência 2)
// HTML+CSS → Puppeteer → PDF. Mesmo padrão do relatorio.routes.js.
// Salva em uploads/os/{id}/os-{numero}.pdf e atualiza ordens_servico.pdf_url.

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

// ordem dos checkboxes na referência visual (3 colunas × 3 linhas)
const TIPOS_GRID = [
  ["retirada_equipamento", "devolucao",       "chamado_emergencial"],
  ["vistoria_contrato",    "limpeza_piscina", "preventiva_mensal"],
  ["visita_tecnica",       "limpeza_caixas",  "instalacao_pecas"],
];

const EQUIPAMENTOS = [
  ["comando_eletrico",          "Comando Elétrico"],
  ["bombas_recalque",           "Bombas de Recalque"],
  ["bombas_succao",             "Bombas de Sucção"],
  ["bombas_piscina",            "Bombas de Piscina"],
  ["bombas_pressurizacao",      "Bombas de Pressurização"],
  ["bombas_cascata",            "Bombas de Cascata"],
  ["bombas_espelho",            "Bombas de Espelho d'Águas"],
  ["linha_automaticos",         "Linha dos Automáticos"],
  ["paineis_solares",           "Painéis Solares"],
  ["valvula_redutora_pressao",  "Válvula Redutora de Pressão"],
  ["valvula_retencao",          "Válvula de Retenção"],
  ["estacao_tratamento",        "Estação de Tratamento"],
  ["grupo_gerador",             "Grupo Gerador"],
];

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    const buf = fs.readFileSync(path.join(PUBLIC_ROOT, "login-logo.png"));
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}

// Lê arquivo de /uploads/os/{id}/{nome.ext} e devolve data URL.
// Retorna null se arquivo não acessível (foto registrada mas sumida do disco).
function fotoToDataUrl(urlPublica) {
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
  // ☐ vazio / ☑ marcado — desenhado como SVG pra fidelidade visual
  if (marked) {
    return `<span class="cb cb-on"><svg viewBox="0 0 16 16"><polyline points="3.5,8.5 6.5,11.5 12.5,5"/></svg></span>`;
  }
  return `<span class="cb"></span>`;
}

async function buscarDadosOS(osId) {
  const osRes = await pool.query(
    `SELECT
       os.*,
       c.nome   AS condominio_nome,
       c.endereco, c.bairro, c.cidade, c.uf, c.cep,
       t.nome   AS tecnico_nome,
       t.telefone AS tecnico_telefone
     FROM ordens_servico os
     LEFT JOIN condominios c ON c.id = os.condominio_id
     LEFT JOIN tecnicos    t ON t.id = os.tecnico_id
     WHERE os.id = $1`,
    [osId]
  );
  if (osRes.rows.length === 0) throw new Error("O.S. não encontrada");

  const [fotos, pecas] = await Promise.all([
    pool.query(`SELECT * FROM os_fotos WHERE os_id = $1 ORDER BY criado_em ASC`, [osId]),
    pool.query(`SELECT * FROM os_pecas WHERE os_id = $1 ORDER BY id ASC`, [osId]),
  ]);

  return { os: osRes.rows[0], fotos: fotos.rows, pecas: pecas.rows };
}

function renderHTML({ os, fotos, pecas }) {
  const logo = logoBase64();
  const tipos = Array.isArray(os.tipos_servico) ? os.tipos_servico : [];
  const itens = os.itens_verificados || {};
  const corr  = os.correntes || {};
  const corrTipo = corr.tipo || null; // 'mono' | 'bi' | 'tri'
  const corrVals = Array.isArray(corr.valores) ? corr.valores : [];

  // Tipos em grid 3×3 conforme referência
  const tiposHtml = TIPOS_GRID.map((linha) =>
    `<tr>${linha.map((k) =>
      `<td>${checkbox(tipos.includes(k))}<span class="lbl">${escapeHtml(TIPOS_LABEL[k])}</span></td>`
    ).join("")}</tr>`
  ).join("");

  // Equipamentos em grid 2 colunas
  const eqHtml = (() => {
    const meio = Math.ceil(EQUIPAMENTOS.length / 2);
    const col1 = EQUIPAMENTOS.slice(0, meio);
    const col2 = EQUIPAMENTOS.slice(meio);
    const rows = [];
    for (let i = 0; i < meio; i++) {
      const a = col1[i];
      const b = col2[i];
      rows.push(
        `<tr>
          <td>${checkbox(!!itens[a[0]])}<span class="lbl">${escapeHtml(a[1])}</span></td>
          <td>${b ? `${checkbox(!!itens[b[0]])}<span class="lbl">${escapeHtml(b[1])}</span>` : ""}</td>
        </tr>`
      );
    }
    return rows.join("");
  })();

  // CORRENTE
  const corrValBox = (i) => {
    const v = corrVals[i];
    return `<td class="corr-cell">${v != null && v !== "" ? `${escapeHtml(String(v))} A` : "—"}</td>`;
  };

  // Endereço completo
  const enderecoLinha = [
    os.endereco,
    os.bairro ? `Bairro: ${os.bairro}` : "",
    os.cidade ? `${os.cidade}${os.uf ? "/" + os.uf : ""}` : "",
    os.cep ? `CEP ${os.cep}` : "",
  ].filter(Boolean).join(" · ");

  // GPS chegada/saída formatados
  const gps = (lat, lng) => {
    if (lat == null || lng == null) return "";
    return `GPS ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  };

  // Resolução
  const resKey = os.servico_realizado;
  const resLabel = { resolvido: "Resolvido", paliativo: "Paliativo", agravado: "Agravado" }[resKey] || "—";

  // Peças
  const pecasHtml = pecas.length === 0
    ? `<div class="vazio">Nenhuma peça registrada.</div>`
    : `<table class="tabela-pecas">
        <thead><tr><th>Descrição</th><th class="qtd">Qtd</th><th>Observação</th></tr></thead>
        <tbody>${pecas.map((p) => `
          <tr>
            <td>${escapeHtml(p.descricao)}</td>
            <td class="qtd">${p.quantidade || 1}</td>
            <td>${escapeHtml(p.observacao || "")}</td>
          </tr>`).join("")}
        </tbody>
       </table>`;

  // Orçamento — não vai no PDF da O.S. (decisão consciente).
  // O texto do técnico é anotação interna pro admin. Quando
  // orcamento_necessario=true, o painel admin exibe a explicação completa.

  // Assinatura
  const sigImg = os.assinatura_b64
    ? `<img class="sig-img" src="${
        os.assinatura_b64.startsWith("data:") ? os.assinatura_b64 : "data:image/png;base64," + os.assinatura_b64
      }" alt="Assinatura">`
    : `<div class="sig-vazia">Sem assinatura registrada</div>`;

  // Fotos — página extra
  const fotosHtml = (() => {
    if (!fotos.length) return "";
    const items = fotos.map((f) => {
      const data = fotoToDataUrl(f.url);
      if (!data) return ""; // arquivo sumiu do disco — pula
      const tipoLabel = { antes: "Antes", depois: "Depois", geral: "Geral" }[f.tipo] || "Foto";
      const legenda = f.legenda ? `: ${escapeHtml(f.legenda)}` : "";
      return `<div class="foto-card">
                <img src="${data}" alt="">
                <div class="foto-cap">${tipoLabel}${legenda}</div>
              </div>`;
    }).filter(Boolean).join("");
    if (!items) return "";
    return `<section class="page-break">
              <h2 class="sec-title">Registro Fotográfico</h2>
              <div class="fotos-grid">${items}</div>
            </section>`;
  })();

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>OS ${escapeHtml(os.numero || "")}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1f2e;
    font-size: 11px;
    line-height: 1.35;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 2px solid #f0b014;
    margin-bottom: 14px;
  }
  .header-logo img { height: 44px; display: block; }
  .header-contacts {
    text-align: right;
    font-size: 10px;
    color: #4a5568;
  }
  .header-contacts strong { color: #1a1f2e; }
  .header-contacts .line { display: block; line-height: 1.5; }

  /* Title */
  .titulo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 4px 0 12px;
  }
  .titulo h1 {
    font-size: 16px;
    color: #1a1f2e;
    margin: 0;
    letter-spacing: 0.5px;
  }
  .titulo .num {
    background: #fff7e6;
    border: 1px solid #f0b014;
    color: #8a5d00;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
  }

  /* Sections */
  .sec {
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    page-break-inside: avoid;
  }
  .sec-title {
    font-size: 11px;
    font-weight: bold;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
  }

  /* Tipos & Equipamentos: tabelas com checkboxes */
  .grid-3, .grid-2 {
    width: 100%;
    border-collapse: collapse;
  }
  .grid-3 td, .grid-2 td {
    padding: 4px 4px;
    vertical-align: middle;
    font-size: 10.5px;
  }
  .grid-3 td { width: 33.33%; }
  .grid-2 td { width: 50%; }
  .cb {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid #5a7090;
    border-radius: 2px;
    vertical-align: middle;
    margin-right: 5px;
    background: #fff;
  }
  .cb-on {
    background: #f0b014;
    border-color: #b8860b;
    position: relative;
  }
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
  .lbl { color: #2d3748; vertical-align: middle; }

  /* Dados (linhas com labels) */
  .dados {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 24px;
  }
  .dados.full { grid-template-columns: 1fr; }
  .field { font-size: 10.5px; }
  .field .k { color: #4a5568; font-weight: bold; margin-right: 4px; }
  .field .v {
    border-bottom: 1px dotted #cbd5e0;
    display: inline-block;
    min-width: 100px;
    padding-bottom: 1px;
    color: #1a1f2e;
  }

  /* Recebido por (radios) */
  .recebido-radios { display: inline-block; margin-left: 6px; }
  .recebido-radios .cb { margin-right: 3px; }
  .recebido-radios .lbl { margin-right: 10px; font-size: 10px; }

  /* Corrente */
  .corrente-bloco { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; }
  .corrente-tipo .cb { margin-right: 3px; }
  .corrente-tipo .lbl { margin-right: 12px; }
  .corrente-vals { width: 100%; border-collapse: collapse; }
  .corrente-vals td { padding: 0; }
  .corrente-vals .corr-head {
    background: #f7fafc;
    color: #4a5568;
    font-size: 9.5px;
    text-align: center;
    padding: 3px;
    border: 1px solid #e2e8f0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .corrente-vals .corr-cell {
    text-align: center;
    border: 1px solid #e2e8f0;
    padding: 5px;
    font-size: 11px;
    color: #1a1f2e;
    background: #fff;
  }

  /* Observações */
  .obs-box {
    min-height: 60px;
    padding: 6px 8px;
    border: 1px dashed #cbd5e0;
    border-radius: 4px;
    background: #fafbfc;
    white-space: pre-wrap;
    font-size: 10.5px;
    color: #2d3748;
  }
  .vazio { color: #a0aec0; font-style: italic; font-size: 10.5px; }

  /* Peças */
  .tabela-pecas {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  .tabela-pecas th, .tabela-pecas td {
    padding: 5px 8px;
    border: 1px solid #e2e8f0;
    text-align: left;
  }
  .tabela-pecas th {
    background: #f7fafc;
    color: #4a5568;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .tabela-pecas .qtd { text-align: center; width: 50px; }

  /* Assinatura */
  .ass-bloco {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 20px;
    align-items: flex-end;
  }
  .ass-info { font-size: 10.5px; }
  .ass-info .field { margin-bottom: 6px; }
  .sig-box {
    border: 1px solid #cbd5e0;
    border-radius: 4px;
    background: #fff;
    height: 80px;
    position: relative;
    overflow: hidden;
  }
  .sig-img {
    max-width: 100%;
    max-height: 100%;
    display: block;
    margin: 0 auto;
  }
  .sig-vazia {
    color: #a0aec0;
    font-style: italic;
    font-size: 10px;
    text-align: center;
    line-height: 80px;
  }
  .sig-cap {
    text-align: center;
    font-size: 9.5px;
    color: #4a5568;
    border-top: 1px solid #cbd5e0;
    padding-top: 2px;
    margin-top: 4px;
  }

  /* Fotos (página extra) */
  .page-break { page-break-before: always; }
  .fotos-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 8px;
  }
  .foto-card {
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .foto-card img {
    width: 100%;
    height: 220px;
    object-fit: cover;
    display: block;
  }
  .foto-cap {
    font-size: 10px;
    padding: 4px 6px;
    background: #f7fafc;
    color: #4a5568;
    border-top: 1px solid #e2e8f0;
  }
</style>
</head>
<body>

<header class="header">
  <div class="header-logo">
    ${logo ? `<img src="${logo}" alt="General">` : `<strong style="font-size:18px;">GENERAL</strong>`}
  </div>
  <div class="header-contacts">
    <span class="line"><strong>General Engenharia da Manutenção</strong></span>
    <span class="line">Central: (11) 2038-8679</span>
    <span class="line">Plantão I: (11) 96653-6110 · Plantão II: (11) 91609-0590</span>
  </div>
</header>

<div class="titulo">
  <h1>ORDEM DE SERVIÇO</h1>
  <span class="num">${escapeHtml(os.numero || "—")}</span>
</div>

<!-- Tipos de Serviço -->
<section class="sec">
  <h2 class="sec-title">Tipo de Serviço</h2>
  <table class="grid-3"><tbody>${tiposHtml}</tbody></table>
</section>

<!-- Dados do atendimento -->
<section class="sec">
  <h2 class="sec-title">Dados do Atendimento</h2>
  <div class="dados">
    <div class="field"><span class="k">Data:</span><span class="v">${escapeHtml(fmtDateBR(os.chegada_em || os.criado_em))}</span></div>
    <div class="field"><span class="k">Técnico:</span><span class="v">${escapeHtml(os.tecnico_nome || "—")}</span></div>
    <div class="field" style="grid-column: 1 / -1;"><span class="k">Cliente:</span><span class="v" style="min-width:300px;">${escapeHtml(os.condominio_nome || "—")}</span></div>
    <div class="field" style="grid-column: 1 / -1;"><span class="k">Endereço:</span><span class="v" style="min-width:400px;">${escapeHtml(enderecoLinha || "—")}</span></div>
    <div class="field" style="grid-column: 1 / -1;">
      <span class="k">Recebido por:</span>
      <span class="v" style="min-width:180px;">${escapeHtml(os.recebido_nome || "—")}</span>
      <span class="recebido-radios">
        ${checkbox(os.recebido_tipo === "gestor")}<span class="lbl">Gestor</span>
        ${checkbox(os.recebido_tipo === "sindico")}<span class="lbl">Síndico</span>
        ${checkbox(os.recebido_tipo === "portaria")}<span class="lbl">Portaria</span>
      </span>
    </div>
  </div>
</section>

<!-- Equipamentos verificados -->
<section class="sec">
  <h2 class="sec-title">Equipamentos Verificados</h2>
  <table class="grid-2"><tbody>${eqHtml}</tbody></table>
</section>

<!-- Corrente + horários -->
<section class="sec">
  <h2 class="sec-title">Corrente Elétrica & Horários</h2>
  <div class="corrente-bloco">
    <div class="corrente-tipo">
      ${checkbox(corrTipo === "mono")}<span class="lbl">Mono</span>
      ${checkbox(corrTipo === "bi")}<span class="lbl">Bi</span>
      ${checkbox(corrTipo === "tri")}<span class="lbl">Tri</span>
    </div>
    <table class="corrente-vals"><tbody>
      <tr>
        <td class="corr-head">Fase 1</td>
        <td class="corr-head">Fase 2</td>
        <td class="corr-head">Fase 3</td>
      </tr>
      <tr>
        ${corrValBox(0)}
        ${corrValBox(1)}
        ${corrValBox(2)}
      </tr>
    </tbody></table>
  </div>
  <div class="dados" style="margin-top:10px;">
    <div class="field"><span class="k">Chegada:</span><span class="v">${escapeHtml(fmtTimeBR(os.chegada_em))}</span> <span style="color:#718096; font-size:9.5px;">${escapeHtml(gps(os.chegada_lat, os.chegada_lng))}</span></div>
    <div class="field"><span class="k">Saída:</span><span class="v">${escapeHtml(fmtTimeBR(os.saida_em))}</span> <span style="color:#718096; font-size:9.5px;">${escapeHtml(gps(os.saida_lat, os.saida_lng))}</span></div>
  </div>
</section>

<!-- Observações -->
<section class="sec">
  <h2 class="sec-title">Observações Gerais</h2>
  <div class="obs-box">${escapeHtml(os.observacoes || "")}</div>
</section>

<!-- Peças -->
<section class="sec">
  <h2 class="sec-title">Peças Usadas / Substituídas</h2>
  ${pecasHtml}
</section>

<!-- Resolução -->
<section class="sec">
  <h2 class="sec-title">Resolução do Serviço</h2>
  <div class="dados">
    <div class="field">
      <span class="k">Serviço Realizado:</span>
      ${checkbox(resKey === "resolvido")}<span class="lbl">Resolvido</span>
      ${checkbox(resKey === "paliativo")}<span class="lbl">Paliativo</span>
      ${checkbox(resKey === "agravado")}<span class="lbl">Agravado</span>
    </div>
    <div class="field">
      <span class="k">Necessário Retorno:</span>
      ${checkbox(!!os.necessario_retorno)}<span class="lbl">Sim</span>
      ${checkbox(!os.necessario_retorno)}<span class="lbl">Não</span>
      ${os.retorno_sugerido_em ? `<span style="margin-left:10px; color:#4a5568; font-size:10px;">Sugerido: ${escapeHtml(fmtDateBR(os.retorno_sugerido_em))}</span>` : ""}
    </div>
  </div>
</section>

<!-- Assinatura -->
<section class="sec">
  <h2 class="sec-title">Ciência do Responsável</h2>
  <div class="ass-bloco">
    <div class="ass-info">
      <div class="field"><span class="k">Nome:</span><span class="v" style="min-width:200px;">${escapeHtml(os.recebido_nome || "—")}</span></div>
      <div class="field" style="margin-top:6px;">
        ${checkbox(os.recebido_tipo === "gestor")}<span class="lbl">Gestor</span>
        ${checkbox(os.recebido_tipo === "sindico")}<span class="lbl">Síndico</span>
        ${checkbox(os.recebido_tipo === "portaria")}<span class="lbl">Portaria</span>
      </div>
      <div class="field" style="margin-top:8px; color:#718096; font-size:9.5px;">
        Sr. Gestor (Responsável), favor assinar a ficha dando ciência de que os itens acima foram de fato verificados.
      </div>
    </div>
    <div>
      <div class="sig-box">${sigImg}</div>
      <div class="sig-cap">Assinatura</div>
    </div>
  </div>
</section>

${fotosHtml}

</body></html>`;
}

async function gerarPdfOS(osId) {
  const dados = await buscarDadosOS(osId);
  const { os } = dados;
  if (!os.finalizada_em) {
    throw new Error("O.S. ainda não foi finalizada");
  }

  const html = renderHTML(dados);
  const dir = path.join(UPLOAD_ROOT, String(osId));
  await fsp.mkdir(dir, { recursive: true });
  const filename = `os-${os.numero}.pdf`;
  const fpath = path.join(dir, filename);
  const urlPublic = `/uploads/os/${osId}/${filename}`;

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.error("[os-pdf pageerror]", err.message));
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "12mm", bottom: "14mm", left: "12mm" },
      displayHeaderFooter: true,
      footerTemplate: `<div style="font-family:Arial,sans-serif; font-size:8px; color:#718096; width:100%; padding:0 12mm; display:flex; justify-content:space-between;">
        <span>General Engenharia da Manutenção · ${escapeHtml(os.numero)}</span>
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
