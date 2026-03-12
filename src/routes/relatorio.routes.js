// src/routes/relatorio.routes.js
const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { clienteOnly } = require("../middleware/clienteOnly");

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodoLabel(dias) {
  if (dias <= 1) return "Últimas 24 horas";
  if (dias === 7) return "Últimos 7 dias";
  if (dias === 30) return "Últimos 30 dias";
  return `Últimos ${dias} dias`;
}

function fmtDateBR(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtDateOnlyBR(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function nivelStatusStr(pct) {
  if (pct == null) return "-";
  if (pct >= 70) return "Alto";
  if (pct >= 45) return "Médio";
  if (pct >= 20) return "Baixo";
  return "Muito Baixo";
}

function nivelColor(pct) {
  if (pct == null) return "#94a3b8";
  if (pct >= 70) return "#22c55e";
  if (pct >= 45) return "#f0b014";
  if (pct >= 20) return "#f97316";
  return "#ef4444";
}

function logoBase64() {
  try {
    const buf = fs.readFileSync(path.join(__dirname, "../../public/login-logo.png"));
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}

function chartJsContent() {
  try {
    return fs.readFileSync(path.join(__dirname, "../../public/chart.umd.min.js"), "utf8");
  } catch { return null; }
}

function alertaLabel(tipo) {
  const map = {
    offline: "Dispositivo Offline",
    nivel_critico: "Nível Crítico",
    nivel_baixo: "Nível Baixo",
    nivel_muito_baixo: "Nível Muito Baixo",
  };
  return map[tipo] || tipo.replace(/_/g, " ");
}

function alertaBadgeStyle(tipo) {
  if (tipo === "nivel_critico" || tipo === "nivel_muito_baixo")
    return "background:#FFF0F0; color:#C53030; border:1px solid #FEB2B2;";
  if (tipo === "nivel_baixo")
    return "background:#FFFBEB; color:#B7770D; border:1px solid #FDE68A;";
  if (tipo === "offline")
    return "background:#EBF4FF; color:#2B6CB0; border:1px solid #BEE3F8;";
  return "background:#F8F9FA; color:#495057; border:1px solid #E9ECEF;";
}

function buildAnalise({ stats, dist, bomba, totalAlertas, dias }) {
  if (!stats || !dist || dist.total === 0) return null;
  const totalHoras = dias * 24;
  const t = dist.total;
  const bands = [
    { label: "nível alto",    count: dist.alto },
    { label: "nível médio",   count: dist.medio },
    { label: "nível baixo",   count: dist.baixo },
    { label: "nível crítico", count: dist.critico },
  ];
  const dominant = bands.reduce((a, b) => (a.count >= b.count ? a : b));
  const dominantPct = Math.round((dominant.count / t) * 100);
  const criticoPct  = Math.round((dist.critico / t) * 100);
  const criticoHoras = ((dist.critico / t) * totalHoras).toFixed(1);

  const parts = [];
  parts.push(
    `Durante ${dias <= 1 ? "as últimas 24 horas" : `os últimos <strong>${dias} dias</strong>`}, ` +
    `foram registradas <strong>${stats.total_leituras.toLocaleString("pt-BR")}</strong> leituras. ` +
    `O reservatório operou predominantemente em <strong>${dominant.label}</strong> ` +
    `(<strong>${dominantPct}%</strong> do tempo).`
  );
  if (criticoPct > 0) {
    parts.push(
      `Foram identificados <strong>${criticoPct}%</strong> do tempo em faixa crítica (abaixo de 20%), ` +
      `equivalente a aproximadamente <strong>${criticoHoras}h</strong> de atenção necessária.`
    );
  } else {
    parts.push("Não foram registrados períodos com nível crítico no intervalo.");
  }
  if (bomba && bomba.total > 0 && bomba.acionamentos > 0) {
    const bombaHoras = ((bomba.leituras_ligada / bomba.total) * totalHoras).toFixed(1);
    parts.push(
      `A bomba foi acionada <strong>${bomba.acionamentos}</strong> ` +
      `${bomba.acionamentos === 1 ? "vez" : "vezes"}, com tempo total estimado de ` +
      `<strong>${bombaHoras}h</strong> em operação.`
    );
  }
  if (totalAlertas > 0) {
    parts.push(`Foram gerados <strong>${totalAlertas}</strong> alerta${totalAlertas !== 1 ? "s" : ""} no período.`);
  } else {
    parts.push("Nenhum alerta foi gerado durante o período.");
  }
  return parts.join(" ");
}

// ── HTML Template ─────────────────────────────────────────────────────────────

function buildHtml({
  condominio, reservatorio, leituras, stats, dias,
  dataInicio, dataFim, logoSrc, chartJs,
  analise, dist, bomba, alertas, totalAlertas,
  geradoEm,
}) {
  const totalHoras = dias * 24;

  const labels = JSON.stringify(
    leituras.map((l) => {
      const d = new Date(l.bucket);
      if (dias <= 1) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      if (dias <= 7) return d.toLocaleDateString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    })
  );
  const values = JSON.stringify(leituras.map((l) => l.nivel_pct_avg));

  const tableRows = leituras.map((l, i) => {
    const pct  = l.nivel_pct_avg;
    const cor  = nivelColor(pct);
    const data = fmtDateBR(l.bucket);
    const bg   = i % 2 === 0 ? "#ffffff" : "#F8F9FA";
    return `<tr style="background:${bg};">
      <td>${data}</td>
      <td><span style="font-weight:700;color:${cor};font-size:13px;">${pct != null ? pct + "%" : "-"}</span></td>
      <td><span class="status-pill" style="background:${cor}22;color:${cor};">${nivelStatusStr(pct)}</span></td>
    </tr>`;
  }).join("");

  const logoTag = logoSrc
    ? `<img src="${logoSrc}" alt="GENERAL" style="height:60px;object-fit:contain;display:block;" />`
    : `<span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">GENERAL</span>`;

  const chartScript = chartJs
    ? `<script>${chartJs}</script>`
    : `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`;

  // ── Distribution rows ──
  const distBands = [
    { label: "Crítico (< 20%)",   count: dist ? dist.critico : 0, color: "#E53E3E" },
    { label: "Baixo (20–44%)",    count: dist ? dist.baixo   : 0, color: "#F97316" },
    { label: "Médio (45–69%)",    count: dist ? dist.medio   : 0, color: "#D97706" },
    { label: "Alto (≥ 70%)",      count: dist ? dist.alto    : 0, color: "#1E8A3C" },
  ];
  const distTotal = dist ? dist.total : 0;
  const distRows = distBands.map((b) => {
    const pct   = distTotal > 0 ? Math.round((b.count / distTotal) * 100) : 0;
    const horas = distTotal > 0 ? ((b.count / distTotal) * totalHoras).toFixed(1) : "0.0";
    return `<tr>
      <td style="padding:10px 18px;width:170px;">
        <span style="display:inline-flex;align-items:center;gap:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${b.color};display:inline-block;flex-shrink:0;"></span>
          <span style="font-size:12.5px;font-weight:600;color:#343A40;">${b.label}</span>
        </span>
      </td>
      <td style="padding:10px 18px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;background:#F1F3F5;border-radius:4px;height:8px;min-width:100px;">
            <div style="width:${pct}%;background:${b.color};border-radius:4px;height:8px;"></div>
          </div>
        </div>
      </td>
      <td style="padding:10px 18px;text-align:right;white-space:nowrap;">
        <span style="font-size:13px;font-weight:700;color:${b.color};">${pct}%</span>
        <span style="font-size:11px;color:#ADB5BD;margin-left:6px;">≈ ${horas}h</span>
      </td>
    </tr>`;
  }).join("");

  // ── Alert badges ──
  const alertasBadges = alertas && alertas.length > 0
    ? alertas.map(a =>
        `<span style="${alertaBadgeStyle(a.tipo)} font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;display:inline-flex;align-items:center;gap:5px;">
          <span>▲</span><span>${a.total} · ${alertaLabel(a.tipo)}</span>
        </span>`
      ).join("")
    : `<span style="font-size:11px;color:#ADB5BD;font-style:italic;">Nenhum alerta no período</span>`;

  // ── Bomba ──
  const hasBomba   = bomba && bomba.total > 0;
  const bombaHoras = hasBomba ? ((bomba.leituras_ligada / bomba.total) * totalHoras).toFixed(1) : "0.0";
  const bombaPct   = hasBomba ? Math.round((bomba.leituras_ligada / bomba.total) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Inter',system-ui,sans-serif; background:#fff; color:#1e293b; font-size:13px; line-height:1.5; }

  /* BODY */
  .body { padding:24px 44px 16px; }

  /* INFO BLOCK */
  .info-block { background:#F8F9FA; border:1px solid #E9ECEF; border-radius:10px; padding:14px 20px; margin-bottom:12px; display:grid; grid-template-columns:repeat(3,1fr); gap:10px 24px; box-shadow:0 1px 4px rgba(0,0,0,0.05); }
  .info-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.9px; color:#868E96; margin-bottom:3px; }
  .info-value { font-size:12.5px; font-weight:700; color:#0D1B2A; line-height:1.3; }
  .info-value-mono { font-family:'Courier New',monospace; font-size:11.5px; font-weight:600; color:#0D1B2A; }

  /* ANALISE */
  .analise-block { background:#F0F4FF; border:1px solid #C5D3F0; border-left:4px solid #3B5BDB; border-radius:10px; padding:14px 18px; margin-bottom:12px; }
  .analise-header { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#3B5BDB; margin-bottom:8px; }
  .analise-text   { font-size:12px; color:#2D3748; line-height:1.6; margin-bottom:10px; }
  .analise-alerts-label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.9px; color:#718096; margin-bottom:6px; }
  .analise-badges { display:flex; flex-wrap:wrap; gap:6px; }

  /* SECTION TITLE */
  .section-title { font-size:10px; font-weight:800; color:#0D1B2A; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
  .stbar { width:4px; height:14px; background:#0D1B2A; border-radius:2px; flex-shrink:0; }

  /* SECTION WRAPPER — cola título com seu conteúdo, nunca quebra no meio */
  .section { page-break-inside:avoid; break-inside:avoid; margin-bottom:12px; }

  /* CARDS 4-col */
  .cards4 { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; page-break-inside:avoid; break-inside:avoid; }
  /* CARDS 3-col */
  .cards3 { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; page-break-inside:avoid; break-inside:avoid; }
  .card { background:#fff; border:1px solid #E9ECEF; border-radius:10px; padding:12px 14px 14px; box-shadow:0 1px 6px rgba(0,0,0,0.06); page-break-inside:avoid; break-inside:avoid; }
  .card-icon { width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px; margin-bottom:8px; }
  .card-label { font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.9px; color:#868E96; margin-bottom:4px; }
  .card-value { font-size:24px; font-weight:800; line-height:1; letter-spacing:-0.5px; }

  /* DIST TABLE */
  .dist-wrap { border-radius:10px; overflow:hidden; border:1px solid #E9ECEF; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
  .dist-wrap table { width:100%; border-collapse:collapse; }
  .dist-wrap thead tr { background:#0D1B2A; }
  .dist-wrap thead th { padding:8px 14px; text-align:left; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:#fff; }
  .dist-wrap tbody td { border-bottom:1px solid #F1F3F5; }
  .dist-wrap tbody tr:last-child td { border-bottom:none; }

  /* CHART — nunca cortar o gráfico no meio */
  .chart-wrap { background:#fff; border:1px solid #E9ECEF; border-radius:10px; padding:14px 16px 12px; height:280px; position:relative; box-shadow:0 1px 4px rgba(0,0,0,0.04); page-break-inside:avoid; break-inside:avoid; }

  /* TABLE */
  .table-wrap { border-radius:10px; overflow:hidden; border:1px solid #E9ECEF; box-shadow:0 1px 4px rgba(0,0,0,0.04); margin-bottom:20px; }
  table { width:100%; border-collapse:collapse; }
  thead tr { background:#0D1B2A; }
  thead th { padding:10px 14px; text-align:left; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:#fff; }
  tbody td { padding:9px 14px; font-size:12px; border-bottom:1px solid #F1F3F5; color:#343A40; }
  tbody tr:last-child td { border-bottom:none; }
  .status-pill { font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:99px; display:inline-block; }
</style>
</head>
<body>

<!-- BODY -->
<div class="body">

  <!-- Informações -->
  <div class="info-block">
    <div>
      <div class="info-label">Condomínio</div>
      <div class="info-value">${condominio.nome || "-"}</div>
    </div>
    <div>
      <div class="info-label">Reservatório</div>
      <div class="info-value">${reservatorio.nome || "-"}${reservatorio.tipo ? ` <span style="font-weight:500;color:#495057;font-size:12px;">(${reservatorio.tipo})</span>` : ""}</div>
    </div>
    <div>
      <div class="info-label">Dispositivo</div>
      <div class="info-value-mono">${reservatorio.device_id || "-"}</div>
    </div>
    <div>
      <div class="info-label">Período</div>
      <div class="info-value">${periodoLabel(dias)}</div>
    </div>
    <div>
      <div class="info-label">Data Inicial</div>
      <div class="info-value">${dataInicio}</div>
    </div>
    <div>
      <div class="info-label">Data Final</div>
      <div class="info-value">${dataFim}</div>
    </div>
  </div>

  <!-- Análise automática -->
  ${analise ? `
  <div class="analise-block">
    <div class="analise-header">&#9632; Análise Automática do Período</div>
    <div class="analise-text">${analise}</div>
    <div class="analise-alerts-label">Alertas gerados no período</div>
    <div class="analise-badges">${alertasBadges}</div>
  </div>` : ""}

  <!-- Resumo -->
  ${stats ? `
  <div class="section">
    <div class="section-title"><span class="stbar"></span>Resumo do Período</div>
    <div class="cards4">
      <div class="card">
        <div class="card-icon" style="background:#FFF0F0;"><span style="color:#E53E3E;">&#8595;</span></div>
        <div class="card-label">Nível Mínimo</div>
        <div class="card-value" style="color:#E53E3E;">${stats.min_pct}%</div>
      </div>
      <div class="card">
        <div class="card-icon" style="background:#F0FFF4;"><span style="color:#1E8A3C;">&#8593;</span></div>
        <div class="card-label">Nível Máximo</div>
        <div class="card-value" style="color:#1E8A3C;">${stats.max_pct}%</div>
      </div>
      <div class="card">
        <div class="card-icon" style="background:#FFFBEB;"><span style="color:#B7770D;">&#8776;</span></div>
        <div class="card-label">Média</div>
        <div class="card-value" style="color:#B7770D;">${stats.avg_pct}%</div>
      </div>
      <div class="card">
        <div class="card-icon" style="background:#EFF6FF;"><span style="color:#0D1B2A;font-size:14px;font-weight:700;">#</span></div>
        <div class="card-label">Total de Leituras</div>
        <div class="card-value" style="color:#0D1B2A;font-size:${stats.total_leituras >= 10000 ? "22" : "30"}px;">${stats.total_leituras.toLocaleString("pt-BR")}</div>
      </div>
    </div>
  </div>` : ""}

  <!-- Distribuição de níveis -->
  ${dist && dist.total > 0 ? `
  <div class="section">
    <div class="section-title"><span class="stbar"></span>Distribuição de Níveis</div>
    <div class="dist-wrap">
      <table>
        <thead><tr>
          <th>Faixa de Nível</th>
          <th>Proporção no Período</th>
          <th style="text-align:right;">% &amp; Horas Estimadas</th>
        </tr></thead>
        <tbody>${distRows}</tbody>
      </table>
    </div>
  </div>` : ""}

  <!-- Gráfico -->
  <div class="section">
    <div class="section-title"><span class="stbar"></span>Histórico de Nível</div>
    <div class="chart-wrap">
      <canvas id="histChart"></canvas>
    </div>
  </div>

  <!-- Bomba -->
  ${hasBomba ? `
  <div class="section">
    <div class="section-title"><span class="stbar"></span>Acionamentos da Bomba</div>
    <div class="cards3">
      <div class="card">
        <div class="card-icon" style="background:#EBF8FF;"><span style="color:#2B6CB0;">&#9889;</span></div>
        <div class="card-label">Acionamentos no Período</div>
        <div class="card-value" style="color:#2B6CB0;">${bomba.acionamentos.toLocaleString("pt-BR")}</div>
      </div>
      <div class="card">
        <div class="card-icon" style="background:#FAF5FF;"><span style="color:#6B46C1;font-size:15px;font-weight:800;">h</span></div>
        <div class="card-label">Tempo Ligada (estimado)</div>
        <div class="card-value" style="color:#6B46C1;font-size:26px;">${bombaHoras}h</div>
      </div>
      <div class="card">
        <div class="card-icon" style="background:#F0FFF4;"><span style="color:#1E8A3C;font-size:14px;font-weight:700;">%</span></div>
        <div class="card-label">% do Tempo Operando</div>
        <div class="card-value" style="color:#1E8A3C;">${bombaPct}%</div>
      </div>
    </div>
  </div>` : ""}

  <!-- Tabela -->
  <div class="section">
    <div class="section-title"><span class="stbar"></span>Leituras por Período</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Data / Hora</th>
          <th>Nível (%)</th>
          <th>Status</th>
        </tr></thead>
        <tbody>
          ${tableRows || '<tr><td colspan="3" style="text-align:center;padding:24px;color:#ADB5BD;">Nenhuma leitura encontrada.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

</div><!-- /body -->

${chartScript}
<script>window._chartReady = false;</script>
<script>
(function() {
  const labels = ${labels};
  const values = ${values};
  const canvas = document.getElementById('histChart');
  if (!canvas || !window.Chart) return;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 230);
  gradient.addColorStop(0, 'rgba(13,27,42,0.15)');
  gradient.addColorStop(1, 'rgba(13,27,42,0.01)');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Nível (%)',
          data: values,
          borderColor: '#0D1B2A',
          backgroundColor: gradient,
          borderWidth: 3,
          pointRadius: values.length > 60 ? 0 : 4,
          pointBackgroundColor: '#0D1B2A',
          tension: 0.35,
          fill: true,
          order: 0,
        },
        {
          label: 'Atenção (45%)',
          data: labels.map(() => 45),
          borderColor: '#D97706',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: 1,
        },
        {
          label: 'Crítico (20%)',
          data: labels.map(() => 20),
          borderColor: '#E53E3E',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0, onComplete: () => { window._chartReady = true; } },
      scales: {
        x: {
          ticks: { color: '#868E96', maxTicksLimit: 10, maxRotation: 0, font: { size: 13, family: 'Inter' } },
          grid: { color: 'rgba(0,0,0,0.04)' },
          border: { display: false },
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#868E96', callback: v => v + '%', font: { size: 13, family: 'Inter' } },
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { display: false },
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            font: { size: 13, family: 'Inter' },
            color: '#495057',
            boxWidth: 28,
            boxHeight: 3,
            padding: 16,
          }
        },
      }
    }
  });
})();
</script>
</body>
</html>`;
}

// ── Route: GET /relatorio/pdf ─────────────────────────────────────────────────

router.get("/pdf", authRequired, clienteOnly, async (req, res) => {
  const condominioId = Number(req.user.condominio_id);
  const { device_id, dias: diasStr } = req.query;

  if (!device_id) {
    return res.status(400).json({ error: "device_id é obrigatório" });
  }

  const dias = Math.min(Math.max(Number(diasStr) || 30, 1), 90);

  try {
    // 1. Verify device ownership
    const checkRes = await pool.query(
      `SELECT r.id, r.nome, r.tipo, r.device_id, c.nome AS cond_nome
       FROM reservatorios r
       JOIN condominios c ON c.id = r.condominio_id
       WHERE r.device_id = $1 AND r.condominio_id = $2 AND r.ativo = true
       LIMIT 1`,
      [device_id, condominioId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(403).json({ error: "Dispositivo não autorizado" });
    }

    const row = checkRes.rows[0];
    const reservatorio = { id: row.id, nome: row.nome, tipo: row.tipo, device_id: row.device_id };
    const condominio   = { nome: row.cond_nome };

    // 2. Bucket size
    let bucketSec;
    if (dias <= 1)       bucketSec = 300;
    else if (dias <= 7)  bucketSec = 3600;
    else if (dias <= 30) bucketSec = 14400;
    else                 bucketSec = 43200;

    // 3. All queries in parallel
    const [histRes, alertasRes, distRes, bombaRes] = await Promise.all([
      pool.query(
        `SELECT
           TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM criado_em) / $3) * $3) AS bucket,
           ROUND(AVG(COALESCE(nivel_pct, CASE nivel
             WHEN 'alto' THEN 85 WHEN 'medio' THEN 60
             WHEN 'baixo' THEN 30 WHEN 'muito_baixo' THEN 10 END)))::int AS nivel_pct_avg,
           MIN(COALESCE(nivel_pct, CASE nivel
             WHEN 'alto' THEN 85 WHEN 'medio' THEN 60
             WHEN 'baixo' THEN 30 WHEN 'muito_baixo' THEN 10 END))::int AS nivel_pct_min,
           MAX(COALESCE(nivel_pct, CASE nivel
             WHEN 'alto' THEN 85 WHEN 'medio' THEN 60
             WHEN 'baixo' THEN 30 WHEN 'muito_baixo' THEN 10 END))::int AS nivel_pct_max,
           COUNT(*)::int AS count
         FROM leituras
         WHERE device_id = $1
           AND criado_em >= NOW() - ($2 || ' days')::interval
           AND (nivel_pct IS NOT NULL OR nivel IS NOT NULL)
         GROUP BY FLOOR(EXTRACT(EPOCH FROM criado_em) / $3)
         ORDER BY bucket ASC`,
        [device_id, dias, bucketSec]
      ),

      pool.query(
        `SELECT tipo, COUNT(*)::int AS total
         FROM alertas
         WHERE device_id = $1
           AND criado_em >= NOW() - ($2 || ' days')::interval
         GROUP BY tipo
         ORDER BY total DESC`,
        [device_id, dias]
      ),

      pool.query(
        `SELECT
           SUM(CASE WHEN pct < 20  THEN 1 ELSE 0 END)::int AS critico,
           SUM(CASE WHEN pct >= 20 AND pct < 45 THEN 1 ELSE 0 END)::int AS baixo,
           SUM(CASE WHEN pct >= 45 AND pct < 70 THEN 1 ELSE 0 END)::int AS medio,
           SUM(CASE WHEN pct >= 70 THEN 1 ELSE 0 END)::int AS alto,
           COUNT(*)::int AS total
         FROM (
           SELECT COALESCE(nivel_pct, CASE nivel
             WHEN 'alto' THEN 85 WHEN 'medio' THEN 60
             WHEN 'baixo' THEN 30 WHEN 'muito_baixo' THEN 10 END) AS pct
           FROM leituras
           WHERE device_id = $1
             AND criado_em >= NOW() - ($2 || ' days')::interval
             AND (nivel_pct IS NOT NULL OR nivel IS NOT NULL)
         ) sub`,
        [device_id, dias]
      ),

      pool.query(
        `SELECT
           SUM(CASE WHEN bomba_ligada AND NOT COALESCE(prev_ligada, false) THEN 1 ELSE 0 END)::int AS acionamentos,
           SUM(CASE WHEN bomba_ligada THEN 1 ELSE 0 END)::int AS leituras_ligada,
           COUNT(*)::int AS total
         FROM (
           SELECT
             bomba_ligada,
             LAG(bomba_ligada) OVER (ORDER BY criado_em) AS prev_ligada
           FROM leituras
           WHERE device_id = $1
             AND criado_em >= NOW() - ($2 || ' days')::interval
             AND bomba_ligada IS NOT NULL
         ) sub`,
        [device_id, dias]
      ),
    ]);

    const leituras     = histRes.rows;
    const alertas      = alertasRes.rows;
    const totalAlertas = alertas.reduce((s, r) => s + r.total, 0);
    const dist         = distRes.rows[0] || { critico: 0, baixo: 0, medio: 0, alto: 0, total: 0 };
    const bomba        = bombaRes.rows[0] || { acionamentos: 0, leituras_ligada: 0, total: 0 };

    // 4. Stats
    let stats = null;
    if (leituras.length > 0) {
      stats = {
        min_pct:        Math.min(...leituras.map(r => r.nivel_pct_min)),
        max_pct:        Math.max(...leituras.map(r => r.nivel_pct_max)),
        avg_pct:        Math.round(leituras.reduce((s, r) => s + r.nivel_pct_avg, 0) / leituras.length),
        total_leituras: leituras.reduce((s, r) => s + r.count, 0),
      };
    }

    // 5. Auto analysis text
    const analise = buildAnalise({ stats, dist, bomba, totalAlertas, dias });

    // 6. Date range + timestamp
    const now    = new Date();
    const inicio = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000);
    const dataInicio = fmtDateOnlyBR(inicio.toISOString());
    const dataFim    = fmtDateOnlyBR(now.toISOString());
    const geradoEm   = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    // 7. Assets used by both HTML body and Puppeteer templates
    const logoSrc = logoBase64();

    // 8. Build HTML body (header is now in Puppeteer headerTemplate)
    const html = buildHtml({
      condominio, reservatorio, leituras, stats, dias,
      dataInicio, dataFim,
      logoSrc,
      chartJs: chartJsContent(),
      analise, dist, bomba, alertas, totalAlertas,
      geradoEm,
    });

    // 9. Puppeteer headerTemplate — repeats on every page
    //    • <style> reset removes Chromium UA margin (fixes the white-band-above-header bug)
    //    • height must exactly match margin.top so the div fills the reserved area
    const logoImgTag = logoSrc
      ? `<img src="${logoSrc}" style="height:52px;object-fit:contain;display:block;" />`
      : `<span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.5px;">GENERAL</span>`;

    const headerHtml = `<style>*{margin:0!important;padding:0!important;box-sizing:border-box!important;}html,body{margin:0!important;padding:0!important;}</style>
<div style="margin:0;padding:0 32px!important;width:100%;height:120px;background:#0D1B2A;border-bottom:3px solid #EAAA00;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  ${logoImgTag}
  <div style="text-align:right;">
    <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:800;color:#EAAA00;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2;">Relatório de Histórico de Nível</div>
    <div style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.50);margin-top:5px!important;">Gerado em ${geradoEm}</div>
  </div>
</div>`;

    // 10. Puppeteer footerTemplate — repeats on every page
    //     height must exactly match margin.bottom
    const condNomeEsc = (condominio.nome || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const footerHtml = `<style>*{margin:0!important;padding:0!important;box-sizing:border-box!important;}html,body{margin:0!important;padding:0!important;}</style>
<div style="margin:0;padding:0 44px;width:100%;height:60px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #E9ECEF;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <span style="font-family:Arial,sans-serif;font-size:10px;color:#ADB5BD;">${condNomeEsc} &middot; ${periodoLabel(dias)}</span>
  <strong style="font-family:Arial,sans-serif;font-size:10px;color:#868E96;">General Eng. &mdash; Sistema de Telemetria</strong>
  <span style="font-family:Arial,sans-serif;font-size:10px;color:#ADB5BD;">P&aacute;gina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
</div>`;

    // 9. Render PDF
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });

    try {
      const page = await browser.newPage();
      page.on("console", (msg) => console.log("[puppeteer]", msg.type(), msg.text()));
      page.on("pageerror", (err) => console.error("[puppeteer pageerror]", err.message));

      // High-DPI rendering so canvas elements (Chart.js) are rasterized at 3× resolution
      await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 3 });

      await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

      // Wait until Chart.js fires onComplete (guarantees canvas is fully painted)
      await page.waitForFunction(() => window._chartReady === true, { timeout: 10000 })
        .catch(() => console.warn("[puppeteer] _chartReady timeout — proceeding anyway"));

      const rawPdf = await page.pdf({
        format: "A4",
        printBackground: true,
        // top/bottom devem ser iguais à height do header/footer template
        margin: { top: "144px", right: "0", bottom: "60px", left: "0" },
        displayHeaderFooter: true,
        headerTemplate: headerHtml,
        footerTemplate: footerHtml,
      });

      const pdfBuffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);
      console.log(`[relatorio/pdf] buffer=${pdfBuffer.length} header="${pdfBuffer.slice(0,5).toString()}"`);

      // 10. Filename
      const condSlug = (condominio.nome || "relatorio")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const dateStr  = now.toISOString().slice(0, 10);
      const filename = `relatorio_nivel_${condSlug}_${dateStr}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.end(pdfBuffer);

    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error("Erro /relatorio/pdf:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Erro ao gerar relatório", detail: error.message });
    }
  }
});

module.exports = { relatorioRouter: router };
