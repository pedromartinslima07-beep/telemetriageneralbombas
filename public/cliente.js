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
const _sectionTitles = { dashboard: "Dashboard", historico: "Histórico", alertas: "Alertas" };

// ── Estado do histórico ──
let _reservatorios = [];
let _histDias = 1;
let _histChart = null;

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("is-active"));
  document.querySelector(`.section[data-section="${name}"]`)?.classList.add("is-active");
  document.querySelectorAll(".nav-item[data-section]").forEach(n => n.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add("active");
  const t = document.getElementById("topbarTitle");
  if (t) t.textContent = _sectionTitles[name] || name;
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

function resumoCard(titulo, valorHtml, sub) {
  return `
    <div style="
      border:1px solid rgba(43,43,71,.7);
      background: rgba(255,255,255,.03);
      border-radius: 14px;
      padding: 12px 12px;
    ">
      <div style="color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .3px;">
        ${titulo}
      </div>
      <div style="margin-top: 8px; font-weight: 900; font-size: 16px;">
        ${valorHtml}
      </div>
      ${sub ? `<div style="margin-top:6px; color: var(--muted); font-size: 12px;">${sub}</div>` : ""}
    </div>
  `;
}

function renderReservatoriosCliente(data) {
  const tbody = document.getElementById("tbodyReservatoriosCliente");
  const empty = document.getElementById("semReservatorios");
  if (!tbody) return;

  tbody.innerHTML = "";

  const list = Array.isArray(data?.reservatorios) ? data.reservatorios : [];

  if (empty) empty.style.display = list.length === 0 ? "block" : "none";
  if (list.length === 0) return;

  for (const r of list) {
    const u = r.ultima_leitura;

    const min =
      (r.minutos_sem_atualizar === null || r.minutos_sem_atualizar === undefined)
        ? "-"
        : r.minutos_sem_atualizar;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.nome || "-"}</td>
      <td>${r.tipo || "-"}</td>
      
      <td>${u?.criado_em ? fmtData(u.criado_em) : "-"}</td>
      <td>${u?.nivel ? tankHtml(u.nivel, u.nivel_pct) : "-"}</td>
      <td>${u ? bombaBadge(u.bomba_ligada) : "-"}</td>

      <td>${min}</td>
      <td>${r.offline ? badge("SIM", "bad") : badge("NÃO", "ok")}</td>
      <td><span class="pillCount">${r.alertas_abertos_count ?? 0}</span></td>
    `;
    tbody.appendChild(tr);
  }
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
    <div style="
      border:1px solid rgba(43,43,71,.7);
      background:rgba(255,255,255,.03);
      border-radius:14px;
      padding:12px;
    ">
      <div style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.3px;">${titulo}</div>
      <div style="margin-top:8px;font-weight:900;font-size:22px;color:${cor || "var(--accent)"};">${valor}</div>
    </div>`;
}

async function carregarHistorico() {
  const sel = document.getElementById("histReservatorio");
  const msg = document.getElementById("histMsg");
  const statsEl = document.getElementById("histStats");
  const wrapEl = document.getElementById("histChartWrap");
  const semEl = document.getElementById("histSemDados");
  if (!sel || !sel.value) return;

  const device_id = sel.value;
  if (msg) msg.textContent = "Carregando...";
  if (statsEl) statsEl.style.display = "none";
  if (wrapEl) wrapEl.style.display = "none";
  if (semEl) semEl.style.display = "none";

  try {
    const r = await fetch(`/cliente/historico?device_id=${encodeURIComponent(device_id)}&dias=${_histDias}`, {
      headers: authHeaders(),
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { window.location.href = "/login"; return; }
      const t = await r.text().catch(() => "");
      if (msg) msg.textContent = "Erro ao carregar histórico: " + t;
      return;
    }

    const data = await r.json();
    const leituras = Array.isArray(data.leituras) ? data.leituras : [];

    if (msg) msg.textContent = "";

    if (leituras.length === 0) {
      if (semEl) semEl.style.display = "block";
      return;
    }

    // Stats
    if (statsEl && data.stats) {
      const s = data.stats;
      statsEl.innerHTML = [
        histResumoCard("Mínimo", `${s.min_pct}%`, "#f87171"),
        histResumoCard("Máximo", `${s.max_pct}%`, "#4ade80"),
        histResumoCard("Média", `${s.avg_pct}%`, "var(--accent)"),
        histResumoCard("Leituras", s.total_leituras.toLocaleString(), "var(--blue)"),
      ].join("");
      statsEl.style.display = "grid";
    }

    // Chart
    if (wrapEl) wrapEl.style.display = "block";
    const canvas = document.getElementById("histChart");
    if (!canvas) return;

    const labels = leituras.map((l) => {
      const d = new Date(l.bucket);
      if (_histDias <= 1) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (_histDias <= 7) return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      return d.toLocaleDateString([], { day: "2-digit", month: "short", hour: "2-digit" });
    });
    const values = leituras.map((l) => l.nivel_pct_avg);

    if (_histChart) { _histChart.destroy(); _histChart = null; }

    const ctx = canvas.getContext("2d");

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, "rgba(240,176,20,0.35)");
    gradient.addColorStop(1, "rgba(240,176,20,0.01)");

    _histChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Nível (%)",
          data: values,
          borderColor: "#f0b014",
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: values.length > 60 ? 0 : 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            ticks: { color: "#60617e", maxTicksLimit: 10, maxRotation: 0 },
            grid: { color: "rgba(255,255,255,.04)" },
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              color: "#60617e",
              callback: (v) => v + "%",
            },
            grid: { color: "rgba(255,255,255,.06)" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#181b33",
            titleColor: "#e1e3ef",
            bodyColor: "#a0a3bf",
            borderColor: "rgba(255,255,255,.08)",
            borderWidth: 1,
            callbacks: {
              label: (ctx) => ` Nível: ${ctx.parsed.y}%`,
            },
          },
        },
      },
    });

  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

async function carregar() {
  setStatusMsg("Carregando...");

  const r = await fetch("/cliente/status", {
    headers: authHeaders(),
  });

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

  
  // ===== Resumo (AGREGADO DO CONDOMÍNIO) =====
const grid = document.getElementById("resumoGrid");

const nome = data.condominio?.nome || "-";
const reservatorios = Array.isArray(data.reservatorios) ? data.reservatorios : [];
_reservatorios = reservatorios;
populateHistSelect();
const totalRes = reservatorios.length;

const rMaisRecente = pickMaisRecente(reservatorios);
const rMaisCritico = pickMaisCritico(reservatorios);

const uRecente = rMaisRecente?.ultima_leitura || null;
const atualizado = uRecente?.criado_em ? fmtData(uRecente.criado_em) : "-";

const nivelCritico = rMaisCritico?.ultima_leitura?.nivel || null;
const offlineGeral = algumOffline(reservatorios);

// texto pra deixar claro QUAL reservatório está definindo o “pior nível”
const baseTxt = rMaisCritico
  ? `${rMaisCritico.nome || "Reservatório"} • ${rMaisCritico.tipo || "-"} • ${rMaisCritico.device_id || "-"}`
  : "-";

grid.innerHTML = [
  resumoCard("Condomínio", `<span class="mono">${nome}</span>`, `Reservatórios: ${totalRes}`),

  resumoCard(
    "Pior nível (agora)",
    nivelCritico ? nivelBadge(nivelCritico) : badge("-", "warn"),
    `Base: ${baseTxt}`
  ),

  resumoCard(
    "Offline (geral)",
    offlineGeral ? badge("SIM", "bad") : badge("NÃO", "ok"),
    offlineGeral ? "Algum reservatório está offline" : "Todos online"
  ),

  resumoCard("Última atualização (geral)", `<span class="mono">${atualizado}</span>`, null),
].join("");

  // ✅ NOVO: renderiza reservatórios
renderReservatoriosCliente(data);

  // ===== Alertas =====
  const tbody = document.getElementById("tbodyAlertasCliente");
  const sem = document.getElementById("semAlertas");

  tbody.innerHTML = "";

  const alertas = Array.isArray(data.alertas_abertos) ? data.alertas_abertos : [];

  // atualiza badge da sidebar
  const navBadge = document.getElementById("navBadgeAlertas");
  if (navBadge) {
    navBadge.textContent = alertas.length;
    navBadge.style.display = alertas.length > 0 ? "inline-flex" : "none";
  }

  if (alertas.length === 0) {
    sem.style.display = "block";
  } else {
    sem.style.display = "none";
    alertas.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tipoBadge(a.tipo)}</td>
        <td>${a.mensagem || ""}</td>
        <td>${fmtData(a.criado_em)}</td>
        <td>${fmtData(a.atualizado_em)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  setStatusMsg("Atualizado às " + new Date().toLocaleTimeString());
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

  document.getElementById("btnAtualizarCliente")?.addEventListener("click", carregar);
  document.getElementById("btnAbrirSenha")?.addEventListener("click", abrirModalSenha);
  document.getElementById("btnSairCliente")?.addEventListener("click", logout);

  // ===== SIDEBAR TOGGLE =====
  const _sidebar = document.querySelector(".sidebar");
  const _btnToggle = document.getElementById("btnSidebarToggle");
  const _btnFloatToggle = document.getElementById("btnSidebarFloatToggle");
  const _sidebarOverlay = document.getElementById("sidebarOverlay");

  function _applySidebar(collapsed) {
    _sidebar.classList.toggle("collapsed", collapsed);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    if (_btnFloatToggle) _btnFloatToggle.style.display = collapsed ? "flex" : "none";
    if (_sidebarOverlay) {
      _sidebarOverlay.classList.toggle("visible", !collapsed && window.innerWidth < 900);
    }
  }

  _applySidebar(localStorage.getItem("sidebarCollapsed") === "true");

  function _toggleSidebar() {
    const next = !_sidebar.classList.contains("collapsed");
    _applySidebar(next);
    localStorage.setItem("sidebarCollapsed", next);
  }

  _btnToggle?.addEventListener("click", _toggleSidebar);
  _btnFloatToggle?.addEventListener("click", _toggleSidebar);
  _sidebarOverlay?.addEventListener("click", () => {
    _applySidebar(true);
    localStorage.setItem("sidebarCollapsed", true);
  });

  window.addEventListener("resize", () => {
    if (!_sidebar.classList.contains("collapsed") && _sidebarOverlay) {
      _sidebarOverlay.classList.toggle("visible", window.innerWidth < 900);
    }
  });

  // modal senha
  document.getElementById("btnFecharSenhaTop")?.addEventListener("click", fecharModalSenha);
  document.getElementById("btnCancelarSenha")?.addEventListener("click", fecharModalSenha);

  // submit do form (precisa ter id="formTrocarSenha")
  document.getElementById("formTrocarSenha")?.addEventListener("submit", trocarSenha);

  // Histórico: troca de reservatório
  document.getElementById("histReservatorio")?.addEventListener("change", carregarHistorico);

  // Histórico: botões de período
  document.querySelectorAll(".hist-period").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".hist-period").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _histDias = Number(btn.dataset.dias);
      carregarHistorico();
    });
  });

  // Carrega histórico quando entra na seção
  const _origShowSection = showSection;
  // eslint-disable-next-line no-global-assign
  showSection = (name) => {
    _origShowSection(name);
    if (name === "historico") carregarHistorico();
  };

  // primeira carga + auto refresh
  carregar();
  setInterval(() => {
    carregar();
    const secAtiva = document.querySelector(".section.is-active");
    if (secAtiva?.dataset.section === "historico") carregarHistorico();
  }, 10000);
});