const fs   = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PUBLIC_ROOT = path.join(__dirname, "../../public");

function esc(s) {
  if (s == null) return "—";
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtHoras(h) {
  if (h == null) return "—";
  const n = Number(h);
  if (n < 1) return `${Math.round(n * 60)}min`;
  if (n < 24) return `${n.toFixed(1)}h`;
  return `${(n / 24).toFixed(1)}d`;
}

function logoBase64() {
  try {
    const buf = fs.readFileSync(path.join(PUBLIC_ROOT, "logo-azul.png"));
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}

const PRIO_LABEL = { p1:"P1 Crítico", p2:"P2 Alta", p3:"P3 Controlado", p4:"P4 Agendado" };
const PRIO_CLS   = { p1:"b-p1", p2:"b-p2", p3:"b-p3", p4:"b-p4" };
const CAT_LABEL  = {
  sem_agua:"Sem água", vazamento:"Vazamento", bomba_falha:"Falha de bomba",
  nivel_baixo:"Nível baixo", ruido:"Ruído", manutencao:"Manutenção", outro:"Outro",
};
const ST_CLS = { aberto:"b-aberto", em_atendimento:"b-em_aten", fechado:"b-fechado" };
const ST_LBL = { aberto:"Aberto", em_atendimento:"Em atend.", fechado:"Fechado" };

function renderHTML({ chamados, filtros, geradoEm }) {
  const logo = logoBase64();

  // ── Agregações ──────────────────────────────────────────────────────────
  const total    = chamados.length;
  const abertos  = chamados.filter(c => c.status !== "fechado").length;
  const fechados = chamados.filter(c => c.status === "fechado").length;
  const taxa     = total > 0 ? Math.round(fechados / total * 100) : 0;
  const slaArr   = chamados.filter(c => c.fechado_em && c.sla_horas != null).map(c => Number(c.sla_horas));
  const slaMedia = slaArr.length ? slaArr.reduce((a,b)=>a+b,0)/slaArr.length : null;

  // Por prioridade
  const PRIO_ORDER = ["p1","p2","p3","p4"];
  const porPrio = PRIO_ORDER.map(p => ({
    p, label: PRIO_LABEL[p],
    total: chamados.filter(c => c.prioridade === p).length,
  })).filter(x => x.total > 0);

  // Por categoria
  const CAT_ORDER = ["sem_agua","vazamento","bomba_falha","nivel_baixo","ruido","manutencao","outro"];
  const porCat = CAT_ORDER.map(c => ({
    c, label: CAT_LABEL[c] || c,
    total: chamados.filter(x => x.categoria === c).length,
  })).filter(x => x.total > 0);

  // Top condomínios
  const condoMap = {};
  chamados.forEach(c => {
    const n = c.condominio_nome || "Sem condomínio";
    if (!condoMap[n]) condoMap[n] = { total:0, abertos:0, slaArr:[] };
    condoMap[n].total++;
    if (c.status !== "fechado") condoMap[n].abertos++;
    if (c.sla_horas != null) condoMap[n].slaArr.push(Number(c.sla_horas));
  });
  const topCondos = Object.entries(condoMap)
    .sort(([,a],[,b]) => b.total-a.total).slice(0,8)
    .map(([nome,d]) => ({
      nome, total:d.total, abertos:d.abertos,
      slaMedia: d.slaArr.length ? d.slaArr.reduce((a,b)=>a+b,0)/d.slaArr.length : null,
    }));

  // Filtros em texto
  const periodoTxt = `${fmtData(filtros.data_ini)} a ${fmtData(filtros.data_fim)}`;
  const filtrosTxt = [
    filtros.condominio_nome && `Condomínio: ${filtros.condominio_nome}`,
    filtros.prioridade      && `Prioridade: ${PRIO_LABEL[filtros.prioridade] || filtros.prioridade}`,
    filtros.status          && `Status: ${ST_LBL[filtros.status] || filtros.status}`,
    filtros.tecnico_nome    && `Técnico: ${filtros.tecnico_nome}`,
  ].filter(Boolean).join(" · ") || "Todos os registros";

  // Linha de tabela por prioridade
  const prioRows = porPrio.map(x => `
    <tr>
      <td><span class="badge ${PRIO_CLS[x.p]}">${esc(x.label)}</span></td>
      <td style="text-align:right;font-weight:600;">${x.total}</td>
      <td style="text-align:right;">${total ? Math.round(x.total/total*100) : 0}%</td>
    </tr>`).join("") || `<tr><td colspan="3" class="empty">Sem dados</td></tr>`;

  // Linha de tabela por categoria
  const catRows = porCat.map(x => `
    <tr>
      <td>${esc(x.label)}</td>
      <td style="text-align:right;font-weight:600;">${x.total}</td>
      <td style="text-align:right;">${total ? Math.round(x.total/total*100) : 0}%</td>
    </tr>`).join("") || `<tr><td colspan="3" class="empty">Sem dados</td></tr>`;

  // Top condos rows
  const condoRows = topCondos.map(c => `
    <tr>
      <td>${esc(c.nome)}</td>
      <td style="text-align:right;">${c.total}</td>
      <td style="text-align:right;">${c.abertos > 0 ? `<span class="badge b-aberto">${c.abertos}</span>` : "0"}</td>
      <td style="text-align:right;">${c.slaMedia != null ? fmtHoras(c.slaMedia) : "—"}</td>
    </tr>`).join("") || `<tr><td colspan="4" class="empty">Sem dados</td></tr>`;

  // Todos os chamados
  const chamadosRows = chamados.map(c => `
    <tr>
      <td style="font-family:monospace;font-size:10px;">CH-${String(c.id).padStart(4,"0")}</td>
      <td style="max-width:200px;">${esc(c.titulo)}</td>
      <td>${esc(c.condominio_nome)}</td>
      <td>${esc(c.tecnico_nome)}</td>
      <td><span class="badge ${PRIO_CLS[c.prioridade]||''}">${esc(PRIO_LABEL[c.prioridade]||c.prioridade)}</span></td>
      <td><span class="badge ${ST_CLS[c.status]||''}">${esc(ST_LBL[c.status]||c.status)}</span></td>
      <td style="white-space:nowrap;">${fmtData(c.criado_em)}</td>
      <td style="text-align:right;">${c.sla_horas != null ? fmtHoras(Number(c.sla_horas)) : "—"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; }

  /* ── Header ── */
  .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; border-bottom:2.5px solid #1a1a2e; margin-bottom:18px; }
  .logo { height:44px; }
  .header-right { text-align:right; }
  .header-title { font-size:19px; font-weight:700; color:#1a1a2e; letter-spacing:-.02em; }
  .header-periodo { font-size:12.5px; color:#1a1a2e; font-weight:600; margin-top:3px; }
  .header-sub { font-size:11px; color:#888; margin-top:2px; }

  /* ── KPI grid ── */
  .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px; }
  .kpi { background:#f4f6fb; border-radius:8px; padding:12px 14px; border-left:3px solid #1a1a2e; }
  .kpi-val { font-size:26px; font-weight:700; color:#1a1a2e; line-height:1; }
  .kpi-lbl { font-size:10.5px; color:#6b7280; margin-top:5px; text-transform:uppercase; letter-spacing:.05em; }
  .kpi.ok  { border-color:#16a34a; } .kpi.ok  .kpi-val { color:#16a34a; }
  .kpi.bad { border-color:#dc2626; } .kpi.bad .kpi-val { color:#dc2626; }
  .kpi.warn{ border-color:#d97706; } .kpi.warn .kpi-val{ color:#d97706; }

  /* ── Section ── */
  .sec-title { font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
               color:#fff; background:#1a1a2e; padding:6px 10px; margin-bottom:0; }
  .sec-block { margin-bottom:18px; }
  .two-col   { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }

  /* ── Tables ── */
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#1a1a2e; color:#fff; padding:7px 9px; text-align:left;
       font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
  td { padding:6px 9px; border-bottom:1px solid #f0f0f0; vertical-align:middle; color:#1a1a2e; }
  tr:nth-child(even) td { background:#fafbfc; }
  .empty { text-align:center; color:#aaa; padding:12px; }

  /* ── Badges ── */
  .badge { display:inline-block; padding:2px 7px; border-radius:3px; font-size:10px; font-weight:700; white-space:nowrap; }
  .b-p1 { background:#fee2e2; color:#991b1b; }
  .b-p2 { background:#ffedd5; color:#9a3412; }
  .b-p3 { background:#fef9c3; color:#854d0e; }
  .b-p4 { background:#dcfce7; color:#166534; }
  .b-aberto  { background:#fee2e2; color:#991b1b; }
  .b-em_aten { background:#fef9c3; color:#854d0e; }
  .b-fechado { background:#dcfce7; color:#166534; }

  /* ── Page break ── */
  .page-break { page-break-before:always; }
</style>
</head><body>

<!-- HEADER -->
<div class="header">
  ${logo ? `<img class="logo" src="${logo}" alt="General">` : `<div style="font-size:15px;font-weight:700;color:#1a1a2e;">GENERAL</div>`}
  <div class="header-right">
    <div class="header-title">Relatório de Chamados</div>
    <div class="header-periodo">Período: ${esc(periodoTxt)}</div>
    <div class="header-sub">${esc(filtrosTxt)} · Gerado em ${esc(geradoEm)}</div>
  </div>
</div>

<!-- KPIs -->
<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-val">${total}</div>
    <div class="kpi-lbl">Total no período</div>
  </div>
  <div class="kpi ${taxa>=70?"ok":taxa>=40?"warn":"bad"}">
    <div class="kpi-val">${taxa}%</div>
    <div class="kpi-lbl">Taxa de resolução</div>
  </div>
  <div class="kpi">
    <div class="kpi-val">${abertos}</div>
    <div class="kpi-lbl">Em aberto</div>
  </div>
  <div class="kpi">
    <div class="kpi-val">${slaMedia != null ? fmtHoras(slaMedia) : "—"}</div>
    <div class="kpi-lbl">SLA médio</div>
  </div>
</div>

<!-- Por prioridade | Por categoria -->
<div class="two-col">
  <div class="sec-block">
    <div class="sec-title">Por prioridade</div>
    <table>
      <thead><tr><th>Nível</th><th style="text-align:right;">Total</th><th style="text-align:right;">%</th></tr></thead>
      <tbody>${prioRows}</tbody>
    </table>
  </div>
  <div class="sec-block">
    <div class="sec-title">Por categoria</div>
    <table>
      <thead><tr><th>Categoria</th><th style="text-align:right;">Total</th><th style="text-align:right;">%</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
  </div>
</div>

<!-- Top condomínios -->
<div class="sec-block">
  <div class="sec-title">Condomínios com mais chamados</div>
  <table>
    <thead><tr><th>Condomínio</th><th style="text-align:right;">Total</th><th style="text-align:right;">Em aberto</th><th style="text-align:right;">SLA médio</th></tr></thead>
    <tbody>${condoRows}</tbody>
  </table>
</div>

<!-- Listagem completa — nova página se muitos chamados -->
${chamados.length > 20 ? '<div class="page-break"></div>' : ''}
<div class="sec-block">
  <div class="sec-title">Todos os chamados (${total})</div>
  <table>
    <thead><tr>
      <th style="width:52px;">ID</th>
      <th>Título</th>
      <th style="width:130px;">Condomínio</th>
      <th style="width:100px;">Técnico</th>
      <th style="width:90px;">Prioridade</th>
      <th style="width:74px;">Status</th>
      <th style="width:72px;">Aberto em</th>
      <th style="width:52px;text-align:right;">SLA</th>
    </tr></thead>
    <tbody>${chamadosRows}</tbody>
  </table>
</div>

</body></html>`;
}

async function gerarPdfRelatorio({ chamados, filtros }) {
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const html = renderHTML({ chamados, filtros, geradoEm });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:8px;color:#aaa;width:100%;padding:0 14mm;display:flex;justify-content:space-between;">
        <span>General Engenharia da Manutenção · Relatório de Chamados</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>`,
    });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    await browser.close();
  }
}

module.exports = { gerarPdfRelatorio };
