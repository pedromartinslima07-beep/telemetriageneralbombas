function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}

if (!getToken()) {
  window.location.href = "/login";
}

// ===== NAVEGAÇÃO POR SEÇÕES =====
const _sectionTitles = { dashboard: "Dashboard", telemetria: "Telemetria", alertas: "Alertas", chamados: "Chamados" };

// ── Estado do histórico ──
let _reservatorios = [];
let _histDias = 1;

// ── Estado do dashboard ──
let _dashNiveisChart = null;

// ── Estado dos alertas (modelo novo) ──
let _alAlertas = [];
let _alTabAtiva = "todos";
let _alBindFeito = false;
let _alSelecionadoId = null;

// ── Estado da telemetria ──
let _telCliUltimoStatus = null; // último payload de /cliente/status
let _telCliBarChart    = null;  // ApexCharts (níveis - bar)
let _telCliHistChart   = null;  // ApexCharts (histórico - area)

const TEL_CLI_HIST_COLORS = ["#f0b014", "#22d3ee", "#a78bfa", "#34d399", "#fb7185", "#fbbf24"];

function _telCliTemReservatorios() {
  const list = Array.isArray(_telCliUltimoStatus?.reservatorios) ? _telCliUltimoStatus.reservatorios : [];
  return list.length > 0;
}

function _telCliCorPct(pct) {
  if (pct == null) return "off";
  if (pct < 20) return "bad";
  if (pct < 40) return "warn";
  return "ok";
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("is-active"));
  document.querySelector(`.section[data-section="${name}"]`)?.classList.add("is-active");
  document.querySelectorAll(".nav-item[data-section]").forEach(n => n.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add("active");
  const title = _sectionTitles[name] || name;
  const t1 = document.getElementById("topbarTitle");        // mobile
  const t2 = document.getElementById("topbarTitleDesktop"); // desktop
  if (t1) t1.textContent = title;
  if (t2) t2.textContent = title;

  if (name === "chamados" && typeof renderSecaoChCli === "function") {
    renderSecaoChCli();
  }
  if (name === "telemetria") {
    // Re-render do conteúdo (KPIs + mini-cards) e carrega o histórico se houver dados
    _telCliAtualizar(_telCliUltimoStatus);
    if (_telCliTemReservatorios()) carregarHistorico();
  }
}

function abrirModalSenha() {
  document.getElementById("senhaMsg").textContent = "";
  document.getElementById("senhaAtual").value = "";
  document.getElementById("senhaNova").value = "";
  document.getElementById("senhaNova2").value = "";
  document.getElementById("senhaOverlay").style.display = "flex";
}

function fecharModalSenha() {
  document.getElementById("senhaOverlay").style.display = "none";
  document.getElementById("senhaMsg").textContent = "";
}

// fecha clicando fora
document.addEventListener("click", (e) => {
  const ov = document.getElementById("senhaOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModalSenha();
});

// ESC fecha
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalSenha();
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function fmtData(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function badge(text, kind) {
  const cls = kind === "ok" ? "b-ok" : (kind === "warn" ? "b-warn" : "b-bad");
  return `<span class="badge ${cls}">${text}</span>`;
}

function nivelBadge(nivel) {
  const n = String(nivel || "").toLowerCase();
  if (n === "alto") return badge("ALTO", "ok");
  if (n === "medio") return badge("MÉDIO", "warn");
  if (n === "baixo") return badge("BAIXO", "warn");
  if (n === "muito_baixo") return badge("MUITO BAIXO", "bad");
  return badge(n || "-", "warn");
}

function tankHtml(nivel, nivelPct) {
  const n = String(nivel || "").toLowerCase();
  const map = {
    alto:        { fallbackPct: 85,  cls: "tank-alto"        },
    medio:       { fallbackPct: 60,  cls: "tank-medio"       },
    baixo:       { fallbackPct: 30,  cls: "tank-baixo"       },
    muito_baixo: { fallbackPct: 10,  cls: "tank-muito-baixo" },
  };
  const cfg = map[n];
  if (!cfg) return `<span style="color:var(--muted)">-</span>`;
  const pct = nivelPct != null ? nivelPct : cfg.fallbackPct;
  return `
    <div class="tank-wrap">
      <div class="tank">
        <div class="tank-fill ${cfg.cls}" style="height:${pct}%"></div>
      </div>
      <span class="tank-pct">${pct}%</span>
    </div>`;
}

function bombaBadge(ligada) {
  if (ligada === true) return badge("LIGADA", "warn");
  if (ligada === false) return badge("DESLIGADA", "ok");
  return badge("-", "warn");
}

function tipoBadge(tipo) {
  if (tipo === "nivel_muito_baixo") return badge("NÍVEL MUITO BAIXO", "bad");
  if (tipo === "nivel_baixo") return badge("NÍVEL BAIXO", "warn");
  if (tipo === "dispositivo_offline") return badge("DISPOSITIVO OFFLINE", "bad");
  return badge(String(tipo || "").replaceAll("_", " "), "warn");
}

function setStatusMsg(msg) {
  const el = document.getElementById("statusMsg");
  if (el) el.textContent = msg || "";
}

// ============================================================
// DASHBOARD — funções de renderização modernas
// ============================================================

function _dashRenderChamados() {
  const kpisEl = document.getElementById("dashChamadosKpis");
  const listaEl = document.getElementById("dashChamadosLista");
  if (!kpisEl || !listaEl) return;

  const data = Array.isArray(_chCliData) ? _chCliData : [];

  const abertos  = data.filter(c => c.status === "aberto").length;
  const emAtend  = data.filter(c => c.status === "em_atendimento").length;
  const fechados = data.filter(c => c.status === "fechado").length;

  const rc = (icon, val, label, cls) => `
    <div class="rc rc-static ${cls}">
      <div class="rc-icon">${icon}</div>
      <div class="rc-label">${label}</div>
      <div class="rc-value">${val}</div>
    </div>`;

  const icoFile  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  const icoTool  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  const icoCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  kpisEl.innerHTML =
    rc(icoFile,  abertos, "Abertos",         abertos  > 0 ? "rc-warn"    : "rc-ok") +
    rc(icoTool,  emAtend, "Em atendimento",   emAtend  > 0 ? "rc-cyan"   : "rc-neutral") +
    rc(icoCheck, fechados, "Resolvidos",       "rc-ok");

  if (data.length === 0) {
    listaEl.innerHTML = `<div class="mc-empty" style="padding:16px 0;">Nenhum chamado registrado ainda.</div>`;
    return;
  }

  const recentes = [...data]
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .slice(0, 5);

  const PRIO_NOME = { baixa:"Baixa", media:"Média", alta:"Alta", emergencia:"Emergência", p1:"P1 Crítico", p2:"P2 Alta", p3:"P3 Controlado", p4:"P4 Agendado" };
  const ST_NOME   = { aberto:"Aberto", em_atendimento:"Em atendimento", fechado:"Resolvido" };

  listaEl.innerHTML = `
    <table class="tel-bombas-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Título</th>
          <th>Prioridade</th>
          <th>Status</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${recentes.map(c => `
          <tr>
            <td style="color:var(--muted);font-size:11px;">${c.id}</td>
            <td><strong>${_chCliEscapar(c.titulo || "—")}</strong></td>
            <td><span class="ch-prio ch-prio-${c.prioridade||"media"}">${PRIO_NOME[c.prioridade] || c.prioridade || "—"}</span></td>
            <td><span class="ch-st ch-st-${c.status||"aberto"}">${ST_NOME[c.status] || c.status || "—"}</span></td>
            <td style="color:var(--muted);font-size:11px;">${_chCliFmtDataCurta(c.criado_em)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function _dashRenderKpis(list) {
  const el = document.getElementById("resumoGrid");
  if (!el) return;

  const total   = list.length;
  const offline = list.filter(r => r.offline).length;
  const online  = total - offline;
  const alertas = list.reduce((s, r) => s + (Number(r.alertas_abertos_count) || 0), 0);

  let ultimaIso = null;
  for (const r of list) {
    const c = r.ultima_leitura?.criado_em;
    if (c && (!ultimaIso || new Date(c) > new Date(ultimaIso))) ultimaIso = c;
  }

  const kpi = (icon, val, hint, kindCls) => `
    <div class="rc ${kindCls} rc-static">
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${hint}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  const ICO_RES  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`;
  const ICO_OK   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const ICO_BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const ICO_CLK  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  el.innerHTML =
    kpi(ICO_RES,  total,   "Reservatórios",  "rc-neutral") +
    kpi(ICO_OK,   online,  "Online",          offline === 0 ? "rc-ok" : (online > 0 ? "rc-warn" : "rc-bad")) +
    kpi(ICO_BELL, alertas, "Alertas abertos", alertas === 0 ? "rc-ok" : "rc-bad") +
    kpi(ICO_CLK,  _telCliFmtTempoRel(ultimaIso), "Última leitura", "rc-neutral");
}

function _dashRenderNiveis(list) {
  const el    = document.getElementById("dashNiveisChart");
  const empty = document.getElementById("dashNiveisEmpty");
  if (!el || typeof ApexCharts === "undefined") return;

  const reservs = list
    .filter(r => r.ultima_leitura?.nivel_pct != null)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  if (reservs.length === 0) {
    if (_dashNiveisChart) { try { _dashNiveisChart.destroy(); } catch (_) {} _dashNiveisChart = null; }
    el.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  const labels = reservs.map(r => `${r.nome || "Res."}${r.tipo ? " · " + r.tipo : ""}`);
  const data   = reservs.map(r => Math.round(r.ultima_leitura.nivel_pct));
  const cores  = reservs.map(r => {
    const pct = r.ultima_leitura.nivel_pct;
    if (pct < 20) return "#ef4444";
    if (pct < 40) return "#f59e0b";
    if (pct < 70) return "#22d3ee";
    return "#22c55e";
  });

  const opts = {
    chart: { type: "bar", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 350 } },
    series: [{ name: "Nível (%)", data }],
    plotOptions: {
      bar: { borderRadius: 6, borderRadiusApplication: "end", columnWidth: "55%", distributed: true, dataLabels: { position: "top" } },
    },
    dataLabels: {
      enabled: true,
      formatter: v => v + "%",
      offsetY: -18,
      style: { fontSize: "10px", fontWeight: "700", colors: ["#eef0fb"] },
    },
    colors: cores,
    xaxis: {
      categories: labels,
      labels: { style: { colors: "#7a7e9c", fontSize: "10.5px" }, rotate: -25, hideOverlappingLabels: false, trim: true },
      axisBorder: { color: "rgba(255,255,255,.06)" },
      axisTicks:  { color: "rgba(255,255,255,.06)" },
    },
    yaxis: { min: 0, max: 100, labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, formatter: v => v + "%" } },
    grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3, padding: { top: 10, right: 10, bottom: 0, left: 10 } },
    legend: { show: false },
    tooltip: { theme: "dark", y: { formatter: v => v + "%" } },
    fill: { type: "gradient", gradient: { shade: "dark", type: "vertical", shadeIntensity: .4, opacityFrom: .95, opacityTo: .7, stops: [0, 100] } },
  };

  if (_dashNiveisChart) {
    _dashNiveisChart.updateOptions(opts, false, true);
  } else {
    el.innerHTML = "";
    _dashNiveisChart = new ApexCharts(el, opts);
    _dashNiveisChart.render();
  }
}

function _dashRenderCriticos(list) {
  const wrap = document.getElementById("dashCriticosList");
  if (!wrap) return;

  const ICO_BAD  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const ICO_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  const ICO_OFF  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;

  const criticos = list.map(r => {
    const pct = r.ultima_leitura?.nivel_pct;
    const offline = !!r.offline;
    const alertas = Number(r.alertas_abertos_count || 0);
    let kind = null, prioridade = 999;
    if (offline)                      { kind = "bad";  prioridade = 0; }
    else if (pct != null && pct < 20) { kind = "bad";  prioridade = 1; }
    else if (pct != null && pct < 40) { kind = "warn"; prioridade = 2; }
    else if (alertas > 0)             { kind = "warn"; prioridade = 3; }
    return kind ? { r, pct, offline, alertas, kind, prioridade } : null;
  }).filter(Boolean)
    .sort((a, b) => a.prioridade - b.prioridade || ((a.pct ?? 100) - (b.pct ?? 100)))
    .slice(0, 8);

  if (criticos.length === 0) {
    wrap.innerHTML = `<div class="mc-empty">Tudo dentro dos parâmetros ✓</div>`;
    return;
  }

  wrap.innerHTML = criticos.map(({ r, pct, offline, alertas, kind }) => {
    const icone = kind === "bad" && offline ? ICO_OFF : kind === "bad" ? ICO_BAD : ICO_WARN;
    const sub = offline
      ? `${r.tipo || "Reservatório"} · OFFLINE`
      : `${r.tipo || "Reservatório"}${alertas > 0 ? ` · ${alertas} alerta${alertas > 1 ? "s" : ""}` : ""}`;
    const pctTxt = offline ? "OFF" : (pct != null ? Math.round(pct) + "%" : "—");
    return `
      <div class="mc-alert-row">
        <div class="mc-alert-icon ${kind}">${icone}</div>
        <div class="mc-alert-main">
          <div class="mc-alert-title">${_telCliEscapar(r.nome || "Reservatório")}</div>
          <div class="mc-alert-sub">${_telCliEscapar(sub)}</div>
        </div>
        <div class="mc-alert-time">${pctTxt}</div>
      </div>`;
  }).join("");
}

function _dashRenderActivity(alertas, reservatorios) {
  const wrap = document.getElementById("dashActivityList");
  if (!wrap) return;

  const events = [];

  for (const a of alertas || []) {
    const kind = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn";
    const reserv = (reservatorios || []).find(r => r.device_id === a.device_id);
    events.push({
      ts: a.criado_em,
      kind,
      title: String(a.tipo || "").replaceAll("_", " "),
      sub: reserv?.nome || a.device_id || "—",
    });
  }

  for (const r of reservatorios || []) {
    const u = r.ultima_leitura;
    if (!u?.criado_em) continue;
    events.push({
      ts: u.criado_em,
      kind: r.offline ? "bad" : (u.nivel_pct != null && u.nivel_pct < 20 ? "warn" : "ok"),
      title: `Leitura — ${r.nome || r.device_id}`,
      sub: u.nivel_pct != null ? Math.round(u.nivel_pct) + "% nível" : "—",
    });
  }

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const top = events.slice(0, 12);

  if (!top.length) {
    wrap.innerHTML = `<div class="mc-empty">Aguardando eventos…</div>`;
    return;
  }

  const relTime = iso => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return `${s}s atrás`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m} min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
  };

  wrap.innerHTML = top.map(e => `
    <div class="mc-act-row">
      <div class="mc-act-stripe ${e.kind}"></div>
      <div class="mc-act-main">
        <div class="mc-act-title">${e.title}</div>
        <div class="mc-act-sub">${_telCliEscapar(e.sub)} · ${relTime(e.ts)}</div>
      </div>
    </div>`).join("");
}

function _dashRenderBombas(list) {
  const tbody   = document.getElementById("dashBombasBody");
  const summary = document.getElementById("dashBombasSummary");
  if (!tbody) return;

  const reservs = [...list].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  if (summary) {
    const on    = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true).length;
    const known = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true || r.ultima_leitura?.bomba_ligada === false).length;
    summary.textContent = known > 0 ? `${on} de ${known} ligadas` : `${reservs.length} reservatórios`;
  }

  if (reservs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="mc-empty" style="padding:24px;">Nenhum reservatório.</td></tr>`;
    return;
  }

  tbody.innerHTML = reservs.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    const corPct = _telCliCorPct(pct);
    const bombaCls = u?.bomba_ligada === true ? "on" : u?.bomba_ligada === false ? "off" : "uk";
    const bombaLbl = u?.bomba_ligada === true ? "LIGADA" : u?.bomba_ligada === false ? "DESLIGADA" : "—";
    let atualizacao = "—";
    if (u?.criado_em) {
      const mins = Math.round((Date.now() - new Date(u.criado_em)) / 60000);
      if (mins < 60)    atualizacao = `há ${mins} min`;
      else if (mins < 1440) atualizacao = `há ${Math.round(mins / 60)}h`;
      else atualizacao = fmtData(u.criado_em);
    }
    const offlineTag = r.offline ? ` <span class="badge b-bad" style="margin-left:6px;font-size:9px;padding:1px 5px;">OFFLINE</span>` : "";

    return `<tr>
      <td><strong>${_telCliEscapar(r.nome || "—")}</strong><div style="font-size:10.5px;color:var(--muted);">${_telCliEscapar(r.tipo || "")}</div></td>
      <td><span class="tel-bomba-pill ${bombaCls}">${bombaLbl}</span></td>
      <td><span class="tel-bomba-pct ${corPct === "off" ? "" : corPct}">${pct != null ? Math.round(pct) + "%" : "—"}</span></td>
      <td style="color:var(--muted);">${atualizacao}${offlineTag}</td>
    </tr>`;
  }).join("");
}

// ============================================================
// TELEMETRIA — página combinada (reservatórios + histórico)
// ============================================================

function _telCliEscapar(s) {
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function _telCliFmtTempoRel(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "agora";
  const s = Math.floor(diff / 1000);
  if (s < 60)    return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dia${h >= 48 ? "s" : ""}`;
}

function _telCliAtualizar(data) {
  const fallback  = document.getElementById("telCliFallback");
  const conteudo  = document.getElementById("telCliConteudo");
  if (!fallback || !conteudo) return; // seção não está renderizada nesta página

  const list = Array.isArray(data?.reservatorios) ? data.reservatorios : [];

  if (list.length === 0) {
    fallback.style.display = "flex";
    conteudo.style.display = "none";
    return;
  }

  fallback.style.display = "none";
  conteudo.style.display = "block";

  _telCliRenderKpis(list);
  _telCliRenderNiveisChart(list);
  _telCliRenderCriticos(list);
  _telCliRenderBombas(list);
  // O select do histórico é populado em populateHistSelect() chamado dentro de carregar()
}

function _telCliRenderKpis(list) {
  const el = document.getElementById("telCliKpis");
  if (!el) return;

  const total       = list.length;
  const offline     = list.filter(r => r.offline).length;
  const online      = total - offline;
  const alertas     = list.reduce((s, r) => s + (Number(r.alertas_abertos_count) || 0), 0);

  // Última leitura: mais recente de todos
  let ultimaIso = null;
  for (const r of list) {
    const c = r.ultima_leitura?.criado_em;
    if (!c) continue;
    if (!ultimaIso || new Date(c) > new Date(ultimaIso)) ultimaIso = c;
  }

  const kpi = (icon, val, hint, kindCls) => `
    <div class="rc ${kindCls} rc-static">
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${hint}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  el.innerHTML =
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`,
        total, "Reservatórios", "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        online, "Online", online === total ? "rc-ok" : "rc-warn") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
        alertas, "Alertas abertos", alertas > 0 ? "rc-bad" : "rc-ok") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        _telCliFmtTempoRel(ultimaIso), "Última leitura", "rc-neutral");
}

// --- Bar chart de níveis (ApexCharts) ---
function _telCliRenderNiveisChart(list) {
  const el = document.getElementById("telCliNiveisChart");
  const empty = document.getElementById("telCliNiveisEmpty");
  if (!el || typeof ApexCharts === "undefined") return;

  const reservs = list
    .filter(r => r.ultima_leitura?.nivel_pct != null)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  if (reservs.length === 0) {
    if (_telCliBarChart) { try { _telCliBarChart.destroy(); } catch (_) {} _telCliBarChart = null; }
    el.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  const labels = reservs.map(r => `${r.nome || "Res."}${r.tipo ? " · " + r.tipo : ""}`);
  const data   = reservs.map(r => Math.round(r.ultima_leitura.nivel_pct));
  const cores  = reservs.map(r => {
    const pct = r.ultima_leitura.nivel_pct;
    if (pct < 20) return "#ef4444";
    if (pct < 40) return "#f59e0b";
    if (pct < 70) return "#22d3ee";
    return "#22c55e";
  });

  const opts = {
    chart: { type: "bar", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 350 } },
    series: [{ name: "Nível (%)", data }],
    plotOptions: {
      bar: {
        borderRadius: 6,
        borderRadiusApplication: "end",
        columnWidth: "55%",
        distributed: true,
        dataLabels: { position: "top" },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (v) => v + "%",
      offsetY: -18,
      style: { fontSize: "10px", fontWeight: "700", colors: ["#eef0fb"] },
    },
    colors: cores,
    xaxis: {
      categories: labels,
      labels: { style: { colors: "#7a7e9c", fontSize: "10.5px" }, rotate: -25, hideOverlappingLabels: false, trim: true },
      axisBorder: { color: "rgba(255,255,255,.06)" },
      axisTicks:  { color: "rgba(255,255,255,.06)" },
    },
    yaxis: {
      min: 0, max: 100,
      labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, formatter: (v) => v + "%" },
    },
    grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3, padding: { top: 10, right: 10, bottom: 0, left: 10 } },
    legend: { show: false },
    tooltip: { theme: "dark", y: { formatter: (v) => v + "%" } },
    fill: {
      type: "gradient",
      gradient: { shade: "dark", type: "vertical", shadeIntensity: .4, opacityFrom: .95, opacityTo: .7, stops: [0, 100] },
    },
  };

  if (_telCliBarChart) {
    _telCliBarChart.updateOptions(opts, false, true);
  } else {
    el.innerHTML = "";
    _telCliBarChart = new ApexCharts(el, opts);
    _telCliBarChart.render();
  }
}

// --- Lista de "em atenção" ---
function _telCliRenderCriticos(list) {
  const wrap = document.getElementById("telCliCriticosList");
  if (!wrap) return;

  const criticos = list.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    const offline = !!r.offline;
    const alertas = Number(r.alertas_abertos_count || 0);
    let kind = null, prioridade = 999;
    if (offline)                      { kind = "off";  prioridade = 0; }
    else if (pct != null && pct < 20) { kind = "bad";  prioridade = 1; }
    else if (pct != null && pct < 40) { kind = "warn"; prioridade = 2; }
    else if (alertas > 0)             { kind = "warn"; prioridade = 3; }
    return kind ? { r, pct, offline, alertas, kind, prioridade } : null;
  }).filter(Boolean)
    .sort((a, b) => a.prioridade - b.prioridade || ((a.pct ?? 100) - (b.pct ?? 100)))
    .slice(0, 8);

  if (criticos.length === 0) {
    wrap.innerHTML = `<div class="mc-empty">Tudo dentro dos parâmetros ✓</div>`;
    return;
  }

  const ICON_BAD  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const ICON_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  const ICON_OFF  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;

  wrap.innerHTML = criticos.map(({ r, pct, offline, alertas, kind }) => {
    const icone = kind === "bad" ? ICON_BAD : kind === "off" ? ICON_OFF : ICON_WARN;
    const sub = offline
      ? `${r.tipo || "Reservatório"} · OFFLINE há ${r.minutos_sem_atualizar ?? "?"} min`
      : `${r.tipo || "Reservatório"}${alertas > 0 ? ` · ${alertas} alerta${alertas > 1 ? "s" : ""}` : ""}`;
    const pctTxt = offline ? "OFF" : (pct != null ? Math.round(pct) + "%" : "—");
    return `
      <div class="tel-crit-row">
        <span class="tel-crit-icon ${kind}">${icone}</span>
        <span class="tel-crit-main">
          <span class="tel-crit-title">${_telCliEscapar(r.nome || "Reservatório")}</span>
          <span class="tel-crit-sub">${_telCliEscapar(sub)}</span>
        </span>
        <span class="tel-crit-pct ${kind}">${pctTxt}</span>
      </div>`;
  }).join("");
}

// --- Tabela de bombas ---
function _telCliRenderBombas(list) {
  const tbody   = document.getElementById("telCliBombasBody");
  const summary = document.getElementById("telCliBombasSummary");
  if (!tbody) return;

  const reservs = [...list].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  if (summary) {
    const on    = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true).length;
    const known = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true || r.ultima_leitura?.bomba_ligada === false).length;
    summary.textContent = known > 0 ? `${on} de ${known} ligadas` : `${reservs.length} reservatórios`;
  }

  if (reservs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="mc-empty" style="padding:24px;">Nenhum reservatório.</td></tr>`;
    return;
  }

  tbody.innerHTML = reservs.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    const corPct = _telCliCorPct(pct);
    const bombaCls = u?.bomba_ligada === true ? "on" : u?.bomba_ligada === false ? "off" : "uk";
    const bombaLbl = u?.bomba_ligada === true ? "LIGADA" : u?.bomba_ligada === false ? "DESLIGADA" : "—";
    let atualizacao = "—";
    if (u?.criado_em) {
      const mins = Math.round((Date.now() - new Date(u.criado_em)) / 60000);
      if (mins < 60)     atualizacao = `há ${mins} min`;
      else if (mins < 1440) atualizacao = `há ${Math.round(mins / 60)}h`;
      else atualizacao = fmtData(u.criado_em);
    }
    const offlineTag = r.offline ? ` <span class="badge b-bad" style="margin-left:6px;font-size:9px;padding:1px 5px;">OFFLINE</span>` : "";

    return `<tr>
      <td><strong>${_telCliEscapar(r.nome || "—")}</strong><div style="font-size:10.5px;color:var(--muted);">${_telCliEscapar(r.tipo || "")}</div></td>
      <td><span class="tel-bomba-pill ${bombaCls}">${bombaLbl}</span></td>
      <td><span class="tel-bomba-pct ${corPct === "off" ? "" : corPct}">${pct != null ? Math.round(pct) + "%" : "—"}</span></td>
      <td style="color:var(--muted);">${atualizacao}${offlineTag}</td>
    </tr>`;
  }).join("");
}

function pickMaisRecente(reservatorios) {
  let best = null;
  for (const r of reservatorios) {
    const u = r?.ultima_leitura;
    if (!u?.criado_em) continue;
    if (!best) best = r;
    else if (new Date(u.criado_em) > new Date(best.ultima_leitura.criado_em)) best = r;
  }
  return best; // pode ser null
}

function pickMaisCritico(reservatorios) {
  const peso = { muito_baixo: 4, baixo: 3, medio: 2, alto: 1 };
  let best = null;

  for (const r of reservatorios) {
    const n = String(r?.ultima_leitura?.nivel || "").toLowerCase();
    const p = peso[n] || 0;
    if (!best) best = { r, p };
    else if (p > best.p) best = { r, p };
  }

  return best?.r || null;
}

function algumOffline(reservatorios) {
  return reservatorios.some(r => !!r.offline);
}

function populateHistSelect() {
  const sel = document.getElementById("histReservatorio");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  _reservatorios.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.device_id;
    opt.textContent = `${r.nome} (${r.tipo || r.device_id})`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function histResumoCard(titulo, valor, cor) {
  return `
    <div class="rc rc-neutral rc-static">
      <div class="rc-label">${titulo}</div>
      <div class="rc-value" style="font-size:24px; color:${cor || "var(--accent)"};">${valor}</div>
    </div>`;
}

async function carregarHistorico() {
  const sel    = document.getElementById("histReservatorio");
  const wrapEl = document.getElementById("telCliHistChart");
  const semEl  = document.getElementById("telCliHistEmpty");
  const btnPdf = document.getElementById("btnExportarPDF");
  if (!sel || !sel.value || !wrapEl) return;

  const device_id = sel.value;
  if (semEl) semEl.style.display = "none";
  if (btnPdf) btnPdf.disabled = true;

  try {
    const r = await fetch(`/cliente/historico?device_id=${encodeURIComponent(device_id)}&dias=${_histDias}`, {
      headers: authHeaders(),
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { window.location.href = "/login"; return; }
      if (semEl) { semEl.style.display = "block"; semEl.textContent = "Erro ao carregar histórico."; }
      return;
    }

    const data = await r.json();
    const leituras = Array.isArray(data.leituras) ? data.leituras : [];

    if (leituras.length === 0) {
      if (semEl) { semEl.style.display = "block"; semEl.textContent = "Sem dados de histórico no período."; }
      if (_telCliHistChart) { try { _telCliHistChart.destroy(); } catch (_) {} _telCliHistChart = null; }
      wrapEl.innerHTML = "";
      return;
    }
    if (semEl) semEl.style.display = "none";
    if (btnPdf) btnPdf.disabled = false;

    // Nome do reservatório selecionado pra título da série
    const reservNome = (sel.options[sel.selectedIndex]?.text || "Nível").split(" (")[0];

    const series = [{
      name: reservNome,
      data: leituras.map(l => ({ x: new Date(l.bucket).getTime(), y: Math.round(Number(l.nivel_pct_avg)) })),
    }];

    const opts = {
      chart: { type: "area", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 300 }, zoom: { enabled: false } },
      series,
      colors: ["#f0b014"],
      stroke: { curve: "smooth", width: 2.4 },
      fill: {
        type: "gradient",
        gradient: { shade: "dark", type: "vertical", shadeIntensity: .4, opacityFrom: .45, opacityTo: 0, stops: [0, 90] },
      },
      dataLabels: { enabled: false },
      grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3 },
      xaxis: {
        type: "datetime",
        labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, datetimeUTC: false },
        axisBorder: { color: "rgba(255,255,255,.06)" },
        axisTicks:  { color: "rgba(255,255,255,.06)" },
      },
      yaxis: {
        min: 0, max: 100,
        labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, formatter: (v) => v + "%" },
      },
      legend: { show: false },
      annotations: {
        yaxis: [
          { y: 45, borderColor: "#D97706", strokeDashArray: 4, label: { borderColor: "#D97706", style: { color: "#fff", background: "#D97706", fontSize: "10px" }, text: "Atenção 45%" } },
          { y: 20, borderColor: "#ef4444", strokeDashArray: 4, label: { borderColor: "#ef4444", style: { color: "#fff", background: "#ef4444", fontSize: "10px" }, text: "Crítico 20%" } },
        ],
      },
      tooltip: {
        theme: "dark",
        x: { format: _histDias <= 1 ? "HH:mm" : "dd MMM HH:mm" },
        y: { formatter: (v) => v + "%" },
      },
      markers: { size: 0, hover: { size: 5 } },
    };

    if (_telCliHistChart) {
      _telCliHistChart.updateOptions(opts, false, true);
    } else {
      wrapEl.innerHTML = "";
      _telCliHistChart = new ApexCharts(wrapEl, opts);
      _telCliHistChart.render();
    }
  } catch (e) {
    console.error("carregarHistorico:", e);
    if (semEl) { semEl.style.display = "block"; semEl.textContent = "Erro: " + e.message; }
  }
}

async function carregar() {
  setStatusMsg("Carregando...");

  // Carrega status e chamados em paralelo para o dashboard ter ambos disponíveis
  const [r] = await Promise.all([
    fetch("/cliente/status",   { headers: authHeaders() }),
    carregarChamadosCli().catch(() => {}),
  ]);

  if (!r.ok) {
  if (r.status === 401 || r.status === 403) {
    window.location.href = "/login";
    return;
  }
  const txt = await r.text().catch(() => "");
  setStatusMsg("Erro no /cliente/status (" + r.status + "): " + txt);
  return;
}

  const data = await r.json();

  
  const reservatorios = Array.isArray(data.reservatorios) ? data.reservatorios : [];
  _reservatorios = reservatorios;
  populateHistSelect();

  // ===== Alertas =====
  _alAlertas = Array.isArray(data.alertas_abertos) ? data.alertas_abertos : [];

  // ===== Dashboard =====
  const temTelemetria = reservatorios.length > 0;
  const dashConteudo  = document.getElementById("dashConteudo");
  if (dashConteudo) dashConteudo.style.display = temTelemetria ? "" : "none";

  // Chamados sempre visíveis no dashboard
  _dashRenderChamados();

  if (temTelemetria) {
    _dashRenderKpis(reservatorios);
    _dashRenderNiveis(reservatorios);
    _dashRenderCriticos(reservatorios);
    _dashRenderActivity(_alAlertas, reservatorios);
    _dashRenderBombas(reservatorios);
  }

  // Telemetria (cliente sem produto cai no fallback dentro do _telCliAtualizar)
  _telCliUltimoStatus = data;
  _telCliAtualizar(data);

  // atualiza badge da sidebar
  const navBadge = document.getElementById("navBadgeAlertas");
  if (navBadge) {
    navBadge.textContent = _alAlertas.length;
    navBadge.style.display = _alAlertas.length > 0 ? "inline-flex" : "none";
  }

  _alBindEventos();
  _alRender();

  setStatusMsg("Atualizado às " + new Date().toLocaleTimeString());
}

// ============================================================
// ALERTAS (modelo novo Mission Control)
// ============================================================

function _alSeveridade(tipo) {
  if (tipo === "nivel_muito_baixo" || tipo === "dispositivo_offline") return "critico";
  if (tipo === "nivel_baixo") return "atencao";
  return "normal";
}

function _alSeveridadeLabel(sev) {
  if (sev === "critico") return "Crítico";
  if (sev === "atencao") return "Atenção";
  return "Normal";
}

function _alTipoLabel(tipo) {
  if (tipo === "nivel_muito_baixo")   return "Nível muito baixo";
  if (tipo === "nivel_baixo")         return "Nível baixo";
  if (tipo === "dispositivo_offline") return "Dispositivo offline";
  return String(tipo || "").replaceAll("_", " ");
}

function _alTempoAberto(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "—";
  const min = Math.floor(diff / 60000);
  if (min < 60)   return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

function _alFiltrados() {
  const q = (document.getElementById("alBusca")?.value || "").trim().toLowerCase();
  let lista = [..._alAlertas];

  if (_alTabAtiva !== "todos") {
    lista = lista.filter(a => _alSeveridade(a.tipo) === _alTabAtiva);
  }
  if (q) {
    lista = lista.filter(a => {
      const blob = `${_alTipoLabel(a.tipo)} ${a.mensagem || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }
  return lista;
}

function _alRender() {
  const tbody = document.getElementById("tbodyAlertasCliente");
  const sem   = document.getElementById("semAlertas");
  if (!tbody) return;

  // KPIs
  const criticos = _alAlertas.filter(a => _alSeveridade(a.tipo) === "critico").length;
  const atencao  = _alAlertas.filter(a => _alSeveridade(a.tipo) === "atencao").length;
  const total    = _alAlertas.length;

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("alKpiCritico", criticos);
  set("alKpiAtencao", atencao);
  set("alKpiTotal",   total);
  set("alCountTodos",    total);
  set("alCountCritico",  criticos);
  set("alCountAtencao",  atencao);

  // Tabela
  const lista = _alFiltrados();
  if (lista.length === 0) {
    tbody.innerHTML = "";
    if (sem) sem.style.display = "flex";
    return;
  }
  if (sem) sem.style.display = "none";

  tbody.innerHTML = lista.map(a => {
    const sev = _alSeveridade(a.tipo);
    const sel = _alSelecionadoId === a.id ? " is-selected" : "";
    return `<tr class="${sel.trim()}" data-al-id="${a.id}" style="cursor:pointer;">
      <td><strong>${_alTipoLabel(a.tipo)}</strong></td>
      <td>${a.mensagem ? a.mensagem.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])) : "—"}</td>
      <td><span class="al-sev ${sev}">${_alSeveridadeLabel(sev)}</span></td>
      <td class="al-tempo">${_alTempoAberto(a.criado_em)}</td>
      <td class="al-data">${fmtData(a.atualizado_em)}</td>
    </tr>`;
  }).join("");

  // Mantém o painel em sincronia (alerta selecionado pode ter sumido)
  _alRenderPainel();
}

function _alAchaPorId(id) {
  return _alAlertas.find(a => a.id === id) || null;
}

function _alReservatorioPorDevice(deviceId) {
  if (!deviceId || !Array.isArray(_reservatorios)) return null;
  return _reservatorios.find(r => r.device_id === deviceId) || null;
}

function _alRenderPainel() {
  const wrap = document.getElementById("alPainel");
  if (!wrap) return;

  if (_alSelecionadoId == null) {
    wrap.innerHTML = `
      <div class="al-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Clique numa linha pra ver os detalhes</p>
      </div>`;
    return;
  }

  const a = _alAchaPorId(_alSelecionadoId);
  if (!a) {
    _alSelecionadoId = null;
    return _alRenderPainel();
  }

  const sev = _alSeveridade(a.tipo);
  const sevLabel = _alSeveridadeLabel(sev);
  const reserv = _alReservatorioPorDevice(a.device_id);
  const pct = reserv?.ultima_leitura?.nivel_pct;

  const kv = (k, v) => `<div><span class="k">${k}</span><span class="v">${v != null && v !== "" ? v : "—"}</span></div>`;

  const banner = reserv ? `
    <div class="ap-banner ${sev}">
      <div class="ap-banner-row">
        ${pct != null ? `
        <div class="ap-gauge-mini">
          <svg viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
            <circle cx="30" cy="30" r="26" fill="none"
              stroke="${sev === "critico" ? "#ef4444" : sev === "atencao" ? "#f59e0b" : "#10b981"}"
              stroke-width="6" stroke-linecap="round"
              stroke-dasharray="${(Math.max(0, Math.min(100, pct)) / 100 * 163.36).toFixed(1)} 163.36"
              transform="rotate(-90 30 30)"/>
          </svg>
          <div class="ap-gauge-mini-val"><div>${Math.round(pct)}%</div><small>Nível</small></div>
        </div>` : ""}
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;">Reservatório</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${reserv.nome || "—"}</div>
          ${reserv.tipo ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">${reserv.tipo}</div>` : ""}
        </div>
      </div>
    </div>` : "";

  const tempoStr = `Aberto há ${_alTempoAberto(a.criado_em)}`;

  wrap.innerHTML = `
    <div class="ap-head">
      <div>
        <div class="ap-title">${_alTipoLabel(a.tipo)}</div>
        <div class="ap-sub">Alerta #${a.id}${reserv?.nome ? ` • ${reserv.nome}` : ""}</div>
      </div>
      <button class="ap-close" data-al-action="fechar-painel" title="Fechar">×</button>
    </div>
    ${banner}
    <div class="ap-section">
      <div class="ap-section-title">Detalhes</div>
      <div class="ap-kv">
        ${kv("Severidade", `<span class="al-sev ${sev}" style="font-size:10.5px;">${sevLabel}</span>`)}
        ${kv("Tipo", _alTipoLabel(a.tipo))}
        ${kv("Device", a.device_id || "—")}
        ${kv("Status", "Aberto")}
      </div>
      ${a.mensagem ? `<div style="margin-top:10px;font-size:11.5px;color:var(--muted);">${a.mensagem.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</div>` : ""}
    </div>
    <div class="ap-section">
      <div class="ap-section-title">Linha do tempo</div>
      <div style="font-size:11.5px;color:var(--text);">Criado em ${fmtData(a.criado_em)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">${tempoStr}</div>
      ${a.atualizado_em && a.atualizado_em !== a.criado_em ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;">Última atualização: ${fmtData(a.atualizado_em)}</div>` : ""}
    </div>`;
}

function _alBindEventos() {
  if (_alBindFeito) return;
  _alBindFeito = true;

  // Tabs
  document.querySelectorAll(".al-tab[data-al-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      _alTabAtiva = tab.dataset.alTab;
      document.querySelectorAll(".al-tab[data-al-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      _alRender();
    });
  });

  // KPI cards clicáveis filtram a tab
  document.querySelectorAll(".al-kpis .rc[data-al-kpi-tab]").forEach(card => {
    card.addEventListener("click", () => {
      const target = card.dataset.alKpiTab;
      const tab = document.querySelector(`.al-tab[data-al-tab="${target}"]`);
      if (tab) tab.click();
    });
  });

  // Busca
  document.getElementById("alBusca")?.addEventListener("input", _alRender);
  document.getElementById("alBtnLimpar")?.addEventListener("click", () => {
    const b = document.getElementById("alBusca");
    if (b) b.value = "";
    _alTabAtiva = "todos";
    document.querySelectorAll(".al-tab[data-al-tab]").forEach(t => t.classList.toggle("is-active", t.dataset.alTab === "todos"));
    _alSelecionadoId = null;
    _alRender();
  });

  // Click na linha → seleciona e mostra painel
  document.getElementById("tbodyAlertasCliente")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-al-id]");
    if (!row) return;
    const id = Number(row.dataset.alId);
    _alSelecionadoId = (_alSelecionadoId === id) ? null : id; // toggle
    _alRender();
  });

  // Fechar painel
  document.getElementById("alPainel")?.addEventListener("click", (e) => {
    const close = e.target.closest('[data-al-action="fechar-painel"]');
    if (close) {
      _alSelecionadoId = null;
      _alRender();
    }
  });
}

async function trocarSenha(event) {
  event.preventDefault();

  const msg = document.getElementById("senhaMsg");
  msg.textContent = "";

  const senha_atual = (document.getElementById("senhaAtual").value || "").trim();
  const senha_nova = (document.getElementById("senhaNova").value || "").trim();
  const senha_nova2 = (document.getElementById("senhaNova2").value || "").trim();

  if (!senha_atual || !senha_nova || !senha_nova2) {
    msg.textContent = "Preencha todos os campos.";
    return;
  }
  if (senha_nova.length < 6) {
    msg.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
    return;
  }
  if (senha_nova !== senha_nova2) {
    msg.textContent = "A confirmação não confere.";
    return;
  }

  try {
    msg.textContent = "Salvando...";

    const r = await fetch("/cliente/trocar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ senha_atual, senha_nova }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      msg.textContent = data.error || ("Erro ao trocar senha (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Senha alterada com sucesso!";
    setTimeout(fecharModalSenha, 600);
  } catch (e) {
    msg.textContent = "Erro: " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // nav sections
  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    item.addEventListener("click", () => showSection(item.dataset.section));
  });

  // links internos data-section-go (ex: "Ver alertas →" no dashboard)
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-section-go]");
    if (btn) showSection(btn.dataset.sectionGo);
  });

  document.getElementById("btnAtualizarCliente")?.addEventListener("click", carregar);

  document.getElementById("btnExportarPDF")?.addEventListener("click", async () => {
    const sel = document.getElementById("histReservatorio");
    if (!sel || !sel.value) return;
    const btn = document.getElementById("btnExportarPDF");
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Gerando PDF...";
    try {
      const url = `/relatorio/pdf?device_id=${encodeURIComponent(sel.value)}&dias=${_histDias}`;
      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        alert("Erro ao gerar PDF: " + txt);
        return;
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const cd = r.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : "relatorio.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Erro ao gerar PDF: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });
  document.getElementById("btnAbrirSenha")?.addEventListener("click", abrirModalSenha);
  document.getElementById("btnSairCliente")?.addEventListener("click", logout);

  // ===== SIDEBAR TOGGLE =====
  const _sidebar = document.getElementById("sidebar");

  function _applySidebar(collapsed) {
    _sidebar.classList.toggle("collapsed", collapsed);
  }

  // Começa aberta por padrão; mantém fechada só se o usuário fechou antes
  _applySidebar(localStorage.getItem("sidebarCollapsed") === "true");

  function _onToggle() {
    const next = !_sidebar.classList.contains("collapsed");
    _applySidebar(next);
    localStorage.setItem("sidebarCollapsed", next);
  }

  document.getElementById("btnSidebarToggleIn")?.addEventListener("click", _onToggle);
  document.getElementById("btnSidebarToggleOut")?.addEventListener("click", _onToggle);

  // modal senha
  document.getElementById("btnFecharSenhaTop")?.addEventListener("click", fecharModalSenha);
  document.getElementById("btnCancelarSenha")?.addEventListener("click", fecharModalSenha);

  // submit do form (precisa ter id="formTrocarSenha")
  document.getElementById("formTrocarSenha")?.addEventListener("submit", trocarSenha);

  // Histórico: troca de reservatório
  document.getElementById("histReservatorio")?.addEventListener("change", carregarHistorico);

  // Histórico: botões de período (.tel-range-btn no modelo novo)
  document.querySelectorAll(".tel-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tel-range-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      _histDias = Number(btn.dataset.dias);
      carregarHistorico();
    });
  });

  // Carrega histórico quando entra na seção
  const _origShowSection = showSection;
  // eslint-disable-next-line no-global-assign
  showSection = (name) => {
    _origShowSection(name);
    if (name === "telemetria") carregarHistorico();
  };

  // primeira carga + auto refresh
  carregar();
  setInterval(() => {
    carregar();
    const secAtiva = document.querySelector(".section.is-active");
    if (secAtiva?.dataset.section === "telemetria") carregarHistorico();
    if (secAtiva?.dataset.section === "chamados")  carregarChamadosCli();
  }, 10000);
});

// ============================================================
// CHAMADOS — seção do cliente desktop
// ============================================================

let _chCliData = [];
let _chCliSelecionadoId = null;
let _chCliSelecionado = null;
let _chCliMensagens = [];
let _chCliTabAtiva = "todos";
let _chCliBindFeito = false;
let _chCliAvalNotaSelecionada = 0;

const _chCliCatNome = {
  vazamento:  "Vazamento",
  bomba_falha:"Bomba",
  nivel_baixo:"Nível baixo",
  sem_agua:   "Sem água",
  ruido:      "Ruído",
  manutencao: "Manutenção",
  outro:      "Outro",
};
const _chCliPrioNome = { baixa:"Baixa", media:"Média", alta:"Alta", emergencia:"Emergência" };
const _chCliStNome   = { aberto:"Aberto", em_atendimento:"Em atend.", fechado:"Resolvido" };

function _chCliEscapar(s) {
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function _chCliFmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function _chCliFmtDataCurta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
}

async function carregarChamadosCli() {
  try {
    const r = await fetch("/cliente/chamados", { headers: authHeaders() });
    if (!r.ok) return;
    _chCliData = await r.json();
    // Mantém detalhe sincronizado se houver selecionado
    if (_chCliSelecionadoId != null) {
      const existe = _chCliData.find(c => c.id === _chCliSelecionadoId);
      if (!existe) {
        _chCliSelecionadoId = null;
        _chCliSelecionado = null;
        _chCliMensagens = [];
      }
    }
    _chCliRender();
  } catch (e) {
    console.warn("[cli-chamados] carregar:", e.message);
  }
}

async function renderSecaoChCli() {
  if (!_chCliData.length) {
    await carregarChamadosCli();
  } else {
    _chCliRender();
  }
  _chCliBindEventos();
}

function _chCliFiltrados() {
  const q = (document.getElementById("chCliBusca")?.value || "").trim().toLowerCase();
  let lista = Array.isArray(_chCliData) ? [..._chCliData] : [];
  if (_chCliTabAtiva !== "todos") lista = lista.filter(c => c.status === _chCliTabAtiva);
  if (q) {
    lista = lista.filter(c => {
      const blob = `${c.id} ${c.titulo||""} ${c.categoria||""} ${c.descricao||""}`.toLowerCase();
      return blob.includes(q);
    });
  }
  return lista;
}

function _chCliRender() {
  const data = _chCliData;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

  const abertos  = data.filter(c => c.status === "aberto").length;
  const atend    = data.filter(c => c.status === "em_atendimento").length;
  const fechados = data.filter(c => c.status === "fechado").length;

  set("chCliKpiAbertos",  abertos);
  set("chCliKpiAtend",    atend);
  set("chCliKpiFechados", fechados);

  set("chCliCtTodos",    data.length);
  set("chCliCtAbertos",  abertos);
  set("chCliCtAtend",    atend);
  set("chCliCtFechados", fechados);

  // Badge na sidebar
  const navBadge = document.getElementById("navBadgeChamados");
  if (navBadge) {
    const ativos = abertos + atend;
    navBadge.textContent = ativos;
    navBadge.style.display = ativos > 0 ? "inline-flex" : "none";
  }

  const tbody = document.getElementById("chCliTableBody");
  const empty = document.getElementById("chCliEmpty");
  if (!tbody) return;

  const lista = _chCliFiltrados();
  if (lista.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = data.length === 0 ? "flex" : "none";
    // Se filtrou mas não está vazio o dataset, mostra dentro da tabela
    if (data.length > 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">Nenhum chamado nesse filtro.</td></tr>`;
    }
  } else {
    if (empty) empty.style.display = "none";
    tbody.innerHTML = lista.map(c => {
      const sel = _chCliSelecionadoId === c.id ? " is-selected" : "";
      return `<tr class="ch-row${sel}" data-ch-cli-id="${c.id}">
        <td class="ch-id-cell">#${c.id}</td>
        <td class="ch-titulo-cell"><div class="ch-titulo-text">${_chCliEscapar(c.titulo || "—")}</div></td>
        <td><span class="ch-cat-badge">${_chCliCatNome[c.categoria] || c.categoria || "—"}</span></td>
        <td><span class="ch-prio ch-prio-${c.prioridade||"media"}">${_chCliPrioNome[c.prioridade] || c.prioridade || "—"}</span></td>
        <td><span class="ch-st ch-st-${c.status||"aberto"}">${_chCliStNome[c.status] || c.status || "—"}</span></td>
        <td class="ch-data-cell">${_chCliFmtDataCurta(c.criado_em)}</td>
      </tr>`;
    }).join("");
  }

  _chCliRenderDetalhe();
}

async function _chCliSelecionar(id) {
  _chCliSelecionadoId = id;
  _chCliSelecionado = null;
  _chCliMensagens = [];

  // Re-render lista pra marcar selecionado
  _chCliRender();

  // Busca detalhe + mensagens em paralelo
  try {
    const [chR, msR] = await Promise.all([
      fetch(`/cliente/chamados/${id}`,           { headers: authHeaders() }),
      fetch(`/cliente/chamados/${id}/mensagens`, { headers: authHeaders() }),
    ]);
    if (chR.ok) _chCliSelecionado = await chR.json();
    if (msR.ok) _chCliMensagens   = await msR.json();
  } catch (e) {
    console.warn("[cli-chamados] selecionar:", e.message);
  }
  _chCliRenderDetalhe();
}

function _chCliRenderDetalhe() {
  const col = document.getElementById("chCliDetailCol");
  if (!col) return;

  if (_chCliSelecionadoId == null) {
    col.innerHTML = `<div class="ch-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      <p>Selecione um chamado para ver os detalhes</p>
    </div>`;
    return;
  }
  const ch = _chCliSelecionado;
  if (!ch) {
    col.innerHTML = `<div class="ch-detail-empty"><p>Carregando…</p></div>`;
    return;
  }

  // Timeline 3 passos
  const passos = ["aberto", "em_atendimento", "fechado"];
  const idx = passos.indexOf(ch.status);
  const labels = {
    aberto:         { titulo: "Chamado registrado",      data: ch.criado_em },
    em_atendimento: { titulo: ch.tecnico_nome ? `Em atendimento — ${ch.tecnico_nome}` : "Em atendimento", data: ch.atualizado_em },
    fechado:        { titulo: "Atendimento concluído",   data: ch.fechado_em },
  };
  const timelineHtml = passos.map((p, i) => {
    const ativo = i <= idx;
    const atual = i === idx && ch.status !== "fechado";
    const cls = ativo ? (atual ? "ch-tl-step-curr" : "ch-tl-step-done") : "ch-tl-step-pending";
    const lbl = labels[p];
    return `<li class="ch-tl-step ${cls}">
      <div class="ch-tl-dot"></div>
      <div class="ch-tl-content">
        <div class="ch-tl-title">${lbl.titulo}</div>
        <div class="ch-tl-data">${ativo && lbl.data ? _chCliFmtData(lbl.data) : ""}</div>
      </div>
    </li>`;
  }).join("");

  // Mensagens
  const userId = JSON.parse(localStorage.getItem("user") || "{}")?.id;
  const mensagensHtml = _chCliMensagens.length === 0
    ? `<div class="ch-chat-empty">Nenhuma mensagem ainda. Envie a primeira.</div>`
    : _chCliMensagens.map(m => {
        const mine = userId && m.autor_id === userId;
        const sideCls = mine ? "is-mine" : "is-other";
        const author = mine ? "Você" : (m.autor_nome || (m.autor_role === "tecnico" ? "Técnico" : "—"));
        const foto = m.foto_url ? `<div class="ch-chat-photo"><img src="${_chCliEscapar(m.foto_url)}" alt="Foto" /></div>` : "";
        const texto = m.texto ? `<div class="ch-chat-text">${_chCliEscapar(m.texto)}</div>` : "";
        return `<div class="ch-chat-item ${sideCls}">
          <div class="ch-chat-bubble">
            <div class="ch-chat-header">
              <span class="ch-chat-author">${_chCliEscapar(author)}</span>
              <span class="ch-chat-time">${_chCliFmtData(m.criado_em)}</span>
            </div>
            ${foto}
            ${texto}
          </div>
        </div>`;
      }).join("");

  // Bloco de avaliação (só se fechado E não avaliado)
  const podeAvaliar = ch.status === "fechado" && !ch.ja_avaliado;
  const avalBlock = podeAvaliar
    ? `<div class="ch-aval-cta">
         <div>Como foi o atendimento? Sua avaliação ajuda a melhorar o serviço.</div>
         <button class="btn btnAccent" id="chCliBtnAvaliar" type="button">Avaliar agora</button>
       </div>`
    : ch.ja_avaliado
      ? `<div class="ch-aval-cta ch-aval-done">✓ Atendimento avaliado. Obrigado!</div>`
      : "";

  // OS finalizada → mostra info
  const osBlock = ch.os_numero
    ? `<div class="ch-os-info">
         <span class="hint">Ordem de serviço:</span>
         <strong>${_chCliEscapar(ch.os_numero)}</strong>
         ${ch.os_finalizada_em ? `<small style="color:var(--muted);">Finalizada em ${_chCliFmtData(ch.os_finalizada_em)}</small>` : ""}
       </div>`
    : "";

  col.innerHTML = `
    <div class="ch-detail-head">
      <div>
        <div class="ch-detail-title">#${ch.id} — ${_chCliEscapar(ch.titulo || "—")}</div>
        <div class="ch-detail-sub">
          <span class="ch-cat-badge">${_chCliCatNome[ch.categoria] || ch.categoria || "—"}</span>
          <span class="ch-prio ch-prio-${ch.prioridade||"media"}">${_chCliPrioNome[ch.prioridade] || ch.prioridade || "—"}</span>
          <span class="ch-st ch-st-${ch.status||"aberto"}">${_chCliStNome[ch.status] || ch.status || "—"}</span>
        </div>
      </div>
    </div>

    <div class="ch-detail-body">
      <div class="ch-detail-section">
        <div class="ch-detail-sec-title">Descrição</div>
        <p class="ch-detail-desc">${_chCliEscapar(ch.descricao || "Sem descrição")}</p>
      </div>

      ${osBlock}

      <div class="ch-detail-section">
        <div class="ch-detail-sec-title">Linha do tempo</div>
        <ol class="ch-timeline">${timelineHtml}</ol>
      </div>

      ${avalBlock}

      <div class="ch-detail-section ch-chat-section">
        <div class="ch-detail-sec-title">Mensagens</div>
        <div class="ch-chat-list" id="chCliChatList">${mensagensHtml}</div>
        ${ch.status !== "fechado" ? `
          <div class="ch-chat-composer">
            <textarea id="chCliChatInput" class="input" rows="2" placeholder="Escreva uma mensagem para o técnico…" maxlength="2000"></textarea>
            <button class="btn btnAccent" id="chCliChatEnviar" type="button">Enviar</button>
          </div>` : ""}
      </div>
    </div>`;

  // Scroll do chat pro fim
  const list = document.getElementById("chCliChatList");
  if (list) list.scrollTop = list.scrollHeight;

  _chCliBindDetalheEventos();
}

function _chCliBindDetalheEventos() {
  document.getElementById("chCliChatEnviar")?.addEventListener("click", _chCliEnviarMensagem);
  document.getElementById("chCliChatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _chCliEnviarMensagem();
    }
  });
  document.getElementById("chCliBtnAvaliar")?.addEventListener("click", _chCliAbrirModalAvaliacao);
}

async function _chCliEnviarMensagem() {
  const inp = document.getElementById("chCliChatInput");
  const btn = document.getElementById("chCliChatEnviar");
  if (!inp || !_chCliSelecionadoId) return;
  const texto = (inp.value || "").trim();
  if (!texto) return;

  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const r = await fetch(`/cliente/chamados/${_chCliSelecionadoId}/mensagens`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro ao enviar");
    }
    inp.value = "";
    // Refetch só as mensagens
    const msR = await fetch(`/cliente/chamados/${_chCliSelecionadoId}/mensagens`, { headers: authHeaders() });
    if (msR.ok) _chCliMensagens = await msR.json();
    _chCliRenderDetalhe();
  } catch (err) {
    alert("Erro: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
  }
}

// ----- Avaliação -----
function _chCliAbrirModalAvaliacao() {
  if (!_chCliSelecionado) return;
  _chCliAvalNotaSelecionada = 0;
  document.getElementById("chCliAvalSub").textContent = `Chamado #${_chCliSelecionado.id} — ${_chCliSelecionado.titulo || ""}`;
  document.getElementById("chCliAvalComentario").value = "";
  document.getElementById("chCliAvalMsg").textContent = "";
  _chCliAtualizarEstrelas(0);
  document.getElementById("chCliAvalOverlay").style.display = "flex";
}

function _chCliFecharModalAvaliacao() {
  document.getElementById("chCliAvalOverlay").style.display = "none";
}

function _chCliAtualizarEstrelas(nota) {
  document.querySelectorAll("#chCliAvalStars .ch-star-btn").forEach(btn => {
    const n = Number(btn.dataset.nota);
    btn.classList.toggle("is-active", n <= nota);
  });
}

async function _chCliSubmitAvaliacao(event) {
  event.preventDefault();
  const msg = document.getElementById("chCliAvalMsg");
  if (!_chCliSelecionadoId) return;
  if (!_chCliAvalNotaSelecionada || _chCliAvalNotaSelecionada < 1 || _chCliAvalNotaSelecionada > 5) {
    msg.textContent = "Escolha uma nota de 1 a 5.";
    return;
  }
  const comentario = (document.getElementById("chCliAvalComentario").value || "").trim();
  msg.textContent = "Enviando…";

  try {
    const r = await fetch(`/cliente/chamados/${_chCliSelecionadoId}/avaliar`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ nota: _chCliAvalNotaSelecionada, comentario: comentario || undefined }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro ao avaliar");
    }
    _chCliFecharModalAvaliacao();
    // Refetch detalhe pro `ja_avaliado` virar true
    await _chCliSelecionar(_chCliSelecionadoId);
  } catch (err) {
    msg.textContent = "Erro: " + err.message;
  }
}

// ----- Abrir novo chamado -----
function _chCliAbrirModalNovo() {
  document.getElementById("chCliNovoCategoria").value = "";
  document.getElementById("chCliNovoDescricao").value = "";
  document.getElementById("chCliNovoMsg").textContent = "";
  document.getElementById("chCliNovoOverlay").style.display = "flex";
}

function _chCliFecharModalNovo() {
  document.getElementById("chCliNovoOverlay").style.display = "none";
}

async function _chCliSubmitNovo(event) {
  event.preventDefault();
  const msg = document.getElementById("chCliNovoMsg");
  const categoria = document.getElementById("chCliNovoCategoria").value;
  const descricao = (document.getElementById("chCliNovoDescricao").value || "").trim();

  if (!categoria) { msg.textContent = "Selecione uma categoria."; return; }
  if (descricao.length < 5) { msg.textContent = "Descreva o problema com pelo menos 5 caracteres."; return; }

  msg.textContent = "Abrindo chamado…";
  try {
    const r = await fetch("/cliente/chamados", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ categoria, descricao }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro ao abrir chamado");
    }
    _chCliFecharModalNovo();
    await carregarChamadosCli();
    // Vai pra tab "Abertos" e seleciona o novo
    const novo = await r.json();
    if (novo?.id) {
      _chCliTabAtiva = "aberto";
      document.querySelectorAll(".wa-tab[data-ch-cli-tab]").forEach(t => t.classList.toggle("is-active", t.dataset.chCliTab === "aberto"));
      _chCliSelecionar(novo.id);
    }
  } catch (err) {
    msg.textContent = "Erro: " + err.message;
  }
}

function _chCliBindEventos() {
  if (_chCliBindFeito) return;
  _chCliBindFeito = true;

  // Tabs
  document.querySelectorAll(".wa-tab[data-ch-cli-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      _chCliTabAtiva = tab.dataset.chCliTab;
      document.querySelectorAll(".wa-tab[data-ch-cli-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      _chCliRender();
    });
  });

  // Busca
  document.getElementById("chCliBusca")?.addEventListener("input", _chCliRender);

  // Click na linha da tabela
  document.getElementById("chCliTableBody")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-ch-cli-id]");
    if (!row) return;
    const id = Number(row.dataset.chCliId);
    _chCliSelecionar(id);
  });

  // Modal abrir chamado
  document.getElementById("chCliBtnNovo")?.addEventListener("click", _chCliAbrirModalNovo);
  document.getElementById("chCliNovoFechar")?.addEventListener("click", _chCliFecharModalNovo);
  document.getElementById("chCliNovoCancelar")?.addEventListener("click", _chCliFecharModalNovo);
  document.getElementById("chCliNovoForm")?.addEventListener("submit", _chCliSubmitNovo);
  document.getElementById("chCliNovoOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "chCliNovoOverlay") _chCliFecharModalNovo();
  });

  // Modal avaliação
  document.getElementById("chCliAvalFechar")?.addEventListener("click", _chCliFecharModalAvaliacao);
  document.getElementById("chCliAvalCancelar")?.addEventListener("click", _chCliFecharModalAvaliacao);
  document.getElementById("chCliAvalForm")?.addEventListener("submit", _chCliSubmitAvaliacao);
  document.getElementById("chCliAvalOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "chCliAvalOverlay") _chCliFecharModalAvaliacao();
  });
  document.querySelectorAll("#chCliAvalStars .ch-star-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _chCliAvalNotaSelecionada = Number(btn.dataset.nota);
      _chCliAtualizarEstrelas(_chCliAvalNotaSelecionada);
    });
  });

  // Esc fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ov1 = document.getElementById("chCliNovoOverlay");
    const ov2 = document.getElementById("chCliAvalOverlay");
    if (ov1 && ov1.style.display !== "none") _chCliFecharModalNovo();
    if (ov2 && ov2.style.display !== "none") _chCliFecharModalAvaliacao();
  });
}