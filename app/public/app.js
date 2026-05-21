// General Bombas — App mobile (Capacitor)
// Fase 7B: login + OTP + home placeholder. Armazenamento via localStorage
// (será trocado por Capacitor Preferences quando empacotarmos pro Android).

// ============== CONFIG ==============
const API_BASE = (() => {
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "file:") {
    return window.GB_API_BASE || "https://general-bombas.app";
  }
  return window.location.origin;
})();

const IS_CAPACITOR = window.location.protocol === "capacitor:";

// ============== STORAGE ==============
// Wrapper fino: trocar por Capacitor Preferences quando empacotarmos.
const Storage = {
  getToken() { return localStorage.getItem("gb_token") || null; },
  setToken(t) { localStorage.setItem("gb_token", t); },
  clearToken() { localStorage.removeItem("gb_token"); },
  getUser() {
    const s = localStorage.getItem("gb_user");
    return s ? JSON.parse(s) : null;
  },
  setUser(u) { localStorage.setItem("gb_user", JSON.stringify(u)); },
  clearUser() { localStorage.removeItem("gb_user"); },
  clear() { this.clearToken(); this.clearUser(); },
};

// ============== API ==============
// Fetch com Bearer token automático. Em caso de 401, limpa storage e
// volta pra login.
async function api(path, opts = {}) {
  const token = Storage.getToken();
  const headers = {
    "Accept": "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...opts.headers,
  };

  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body && typeof opts.body === "object" ? JSON.stringify(opts.body) : opts.body,
  });

  if (r.status === 401 && token) {
    Storage.clear();
    showScreen("login");
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  let data = null;
  try { data = await r.json(); } catch {}

  if (!r.ok) {
    const msg = data?.error || `Erro HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

// ============== SCREEN ROUTER ==============
function showScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    if (el.dataset.screen === name) {
      el.setAttribute("data-active", "");
    } else {
      el.removeAttribute("data-active");
    }
  });
}

// ============== HELPERS UI ==============
function setBtnLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
}

function showAlert(el, msg, type = "error") {
  el.className = `alert ${type}`;
  el.textContent = msg;
  el.hidden = false;
}

function hideAlert(el) {
  el.hidden = true;
}

const ROLE_LABEL = {
  admin: "Admin",
  admin_viewer: "Admin (somente leitura)",
  cliente: "Cliente / Síndico",
  tecnico: "Técnico",
};

// ============== LOGIN ==============
const formLogin = document.getElementById("formLogin");
const loginAlert = document.getElementById("loginAlert");
const loginBtn = document.getElementById("loginBtn");

let otpContext = null; // { otp_token, email }

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(loginAlert);

  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  if (!email || !senha) {
    showAlert(loginAlert, "Preencha email e senha.");
    return;
  }

  setBtnLoading(loginBtn, true);
  try {
    const r = await api("/auth/login", {
      method: "POST",
      body: { email, senha },
    });

    if (r.pending && r.otp_token) {
      otpContext = { otp_token: r.otp_token, email };
      document.getElementById("otpEmail").textContent = email;
      document.getElementById("otpCode").value = "";
      hideAlert(document.getElementById("otpAlert"));
      showScreen("otp");
    } else if (r.token && r.user) {
      Storage.setToken(r.token);
      Storage.setUser(r.user);
      mostrarPosLogin(r.user);
    } else {
      throw new Error("Resposta inesperada do servidor.");
    }
  } catch (err) {
    showAlert(loginAlert, err.message);
  } finally {
    setBtnLoading(loginBtn, false);
  }
});

// ============== OTP ==============
const formOtp = document.getElementById("formOtp");
const otpAlert = document.getElementById("otpAlert");
const otpBtn = document.getElementById("otpBtn");
const otpCodeInput = document.getElementById("otpCode");

document.getElementById("otpBack").addEventListener("click", () => {
  otpContext = null;
  showScreen("login");
});

// Mantém só dígitos no input
otpCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D+/g, "").slice(0, 6);
});

formOtp.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(otpAlert);

  if (!otpContext) {
    showScreen("login");
    return;
  }

  const code = otpCodeInput.value.trim();
  if (code.length !== 6) {
    showAlert(otpAlert, "Digite os 6 dígitos do código.");
    return;
  }

  const confiar = document.getElementById("otpConfiar").checked;

  setBtnLoading(otpBtn, true);
  try {
    const r = await api("/auth/verify-otp", {
      method: "POST",
      body: { otp_token: otpContext.otp_token, code, confiar },
    });

    Storage.setToken(r.token);
    Storage.setUser(r.user);
    otpContext = null;
    mostrarHome(r.user);
  } catch (err) {
    showAlert(otpAlert, err.message);
  } finally {
    setBtnLoading(otpBtn, false);
  }
});

// ============== ROTEAMENTO PÓS-LOGIN ==============
// Decide qual tela abrir baseado no role do usuário.
function mostrarPosLogin(user) {
  if (user.role === "tecnico") {
    abrirTelaTecnico(user);
  } else {
    mostrarHome(user);
  }
}

// ============== HOME (admin / cliente — placeholder) ==============
function mostrarHome(user) {
  document.getElementById("homeUserName").textContent = user.nome || "—";
  document.getElementById("homeUserRole").textContent = ROLE_LABEL[user.role] || user.role;
  document.getElementById("homeGreeting").textContent = `Olá, ${(user.nome || "").split(" ")[0] || "!"}`;
  document.getElementById("homeEmail").textContent = user.email || "—";

  const roleEl = document.getElementById("homeRoleBadge");
  roleEl.innerHTML = `<span class="role-badge ${user.role}">${ROLE_LABEL[user.role] || user.role}</span>`;

  if (user.condominio_id) {
    document.getElementById("homeCondoRow").hidden = false;
    document.getElementById("homeCondo").textContent = `#${user.condominio_id}`;
  } else {
    document.getElementById("homeCondoRow").hidden = true;
  }

  showScreen("home");
}

// ============== TÉCNICO — MEUS CHAMADOS (Fase 7C) ==============
const TC = {
  user: null,
  chamados: [],
  tab: "hoje",           // hoje | proximos | historico
  sort: "proximidade",   // proximidade | prioridade | data
  geo: null,             // {lat, lng, capturada_em}
  syncedAt: null,
  polling: null,
};

const PRI_RANK = { emergencia: 0, alta: 1, media: 2, baixa: 3 };
const PRI_LABEL = { emergencia: "Emergência", alta: "Alta", media: "Média", baixa: "Baixa" };
const CAT_LABEL = {
  vazamento: "Vazamento",
  bomba_falha: "Falha de bomba",
  nivel_baixo: "Nível baixo",
  sem_agua: "Sem água",
  ruido: "Ruído",
  manutencao: "Manutenção",
  outro: "Outro",
};

function abrirTelaTecnico(user) {
  TC.user = user;
  document.getElementById("tcUserName").textContent = user.nome || "Técnico";
  showScreen("tecnico-chamados");
  carregarMeusChamados();
  iniciarPollingTecnico();
  // pede GPS sem bloquear; quando chegar, re-renderiza com distâncias
  pedirGPSOportunista();
}

function pararPollingTecnico() {
  if (TC.polling) { clearInterval(TC.polling); TC.polling = null; }
}

function iniciarPollingTecnico() {
  pararPollingTecnico();
  // refresh silencioso a cada 30s
  TC.polling = setInterval(() => carregarMeusChamados(true), 30000);
}

async function carregarMeusChamados(silent = false) {
  const list = document.getElementById("tcList");
  const empty = document.getElementById("tcEmpty");
  const alertEl = document.getElementById("tcAlert");
  const refresh = document.getElementById("tcRefresh");

  if (!silent) {
    list.innerHTML = Array.from({ length: 4 })
      .map(() => `<div class="tc-skel"></div>`).join("");
    empty.hidden = true;
    hideAlert(alertEl);
  }
  refresh.classList.add("is-refreshing");

  try {
    const data = await api("/chamados/meus");
    TC.chamados = Array.isArray(data) ? data : [];
    TC.syncedAt = new Date();
    renderTecnicoChamados();
  } catch (err) {
    if (!silent) showAlert(alertEl, err.message, "error");
  } finally {
    refresh.classList.remove("is-refreshing");
  }
}

function filtroDaTab(c) {
  // Hoje: ativos (não fechados) — chamado atual do técnico
  // Próximos: por enquanto = mesmos que "Hoje" sem o em_atendimento, fica como placeholder
  //           (Fase futura terá agendamento via campo agendado_para)
  // Histórico: fechados
  if (TC.tab === "hoje") return c.status !== "fechado";
  if (TC.tab === "proximos") return c.status === "aberto";
  if (TC.tab === "historico") return c.status === "fechado";
  return true;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanciaParaChamado(c) {
  if (!TC.geo || c.condominio_lat == null || c.condominio_lng == null) return null;
  return haversineKm(
    Number(TC.geo.lat), Number(TC.geo.lng),
    Number(c.condominio_lat), Number(c.condominio_lng)
  );
}

function ordenarChamados(arr) {
  const copy = arr.slice();
  if (TC.sort === "proximidade" && TC.geo) {
    copy.sort((a, b) => {
      const da = distanciaParaChamado(a);
      const db = distanciaParaChamado(b);
      // sem coords vai pro final
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  } else if (TC.sort === "prioridade") {
    copy.sort((a, b) =>
      (PRI_RANK[a.prioridade] ?? 9) - (PRI_RANK[b.prioridade] ?? 9));
  } else {
    // data: mais recentes primeiro
    copy.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }
  return copy;
}

function tempoAbertoLabel(criado_em) {
  const ms = Date.now() - new Date(criado_em).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function enderecoLinha(c) {
  const parts = [c.condominio_endereco, c.condominio_bairro, c.condominio_cidade]
    .map((s) => (s || "").trim())
    .filter(Boolean);
  if (parts.length === 0) return "Endereço não cadastrado";
  return parts.join(", ");
}

function syncLabel(d) {
  if (!d) return "—";
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return `Sync ${sec}s atrás`;
  const min = Math.floor(sec / 60);
  return `Sync ${min}m atrás`;
}

function renderTecnicoChamados() {
  // KPIs no topo
  renderTecnicoKpis();

  // Contadores das tabs (independentes da tab atual)
  const hoje      = TC.chamados.filter((c) => c.status !== "fechado").length;
  const proximos  = TC.chamados.filter((c) => c.status === "aberto").length;
  const historico = TC.chamados.filter((c) => c.status === "fechado").length;
  document.getElementById("tcCountHoje").textContent = hoje;
  document.getElementById("tcCountProximos").textContent = proximos;
  document.getElementById("tcCountHistorico").textContent = historico;

  // Sync label
  document.getElementById("tcSync").textContent = syncLabel(TC.syncedAt);

  // Status no header (em campo / sem chamados)
  const emAtend = TC.chamados.some((c) => c.status === "em_atendimento");
  const txt = document.getElementById("tcStatusText");
  const dot = document.getElementById("tcStatusDot");
  if (emAtend) {
    txt.textContent = "Em atendimento";
    dot.style.background = "var(--warn)";
    dot.style.boxShadow = "0 0 8px rgba(245,158,11,.6)";
  } else if (hoje === 0) {
    txt.textContent = "Em dia";
    dot.style.background = "var(--ok)";
  } else {
    txt.textContent = "Em campo";
    dot.style.background = "var(--ok)";
  }

  // Lista filtrada + ordenada
  const filtrados = TC.chamados.filter(filtroDaTab);
  const ordenados = ordenarChamados(filtrados);

  const list = document.getElementById("tcList");
  const empty = document.getElementById("tcEmpty");

  // Rodapé: total + GPS + relógio
  atualizarFooterTecnico(ordenados.length);

  if (ordenados.length === 0) {
    list.innerHTML = "";
    const msg = document.getElementById("tcEmptyMsg");
    if (msg) {
      msg.textContent = TC.tab === "historico"
        ? "Nenhum chamado resolvido ainda"
        : TC.tab === "proximos"
          ? "Nenhum chamado aguardando"
          : "Você está em dia";
    }
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = ordenados.map(renderCardChamado).join("");
}

function atualizarFooterTecnico(totalVisiveis) {
  const elTotal = document.getElementById("tcFooterTotal");
  const elGps   = document.getElementById("tcFooterGps");
  const elClock = document.getElementById("tcFooterClock");
  if (!elTotal || !elGps || !elClock) return;

  const total = TC.chamados.length;
  elTotal.textContent = totalVisiveis === total
    ? `${total} ${total === 1 ? "chamado" : "chamados"}`
    : `${totalVisiveis} de ${total}`;

  if (TC.geo) {
    const idade = Math.floor((Date.now() - TC.geo.capturada_em) / 60000);
    elGps.classList.add("tec-footer-gps-on");
    elGps.querySelector("span").textContent = idade < 1 ? "GPS ativo" : `GPS ${idade}m`;
  } else {
    elGps.classList.remove("tec-footer-gps-on");
    elGps.querySelector("span").textContent = "GPS aguardando…";
  }

  const now = new Date();
  elClock.textContent = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit"
  });
}

// KPIs no topo — mesma estrutura .rc do admin
function renderTecnicoKpis() {
  const el = document.getElementById("tcKpiGrid");
  if (!el) return;

  const abertos  = TC.chamados.filter((c) => c.status === "aberto").length;
  const atend    = TC.chamados.filter((c) => c.status === "em_atendimento").length;
  const criticos = TC.chamados.filter((c) =>
    c.prioridade === "emergencia" && c.status !== "fechado").length;
  const fechHoje = TC.chamados.filter((c) => {
    if (c.status !== "fechado" || !c.fechado_em) return false;
    const d = new Date(c.fechado_em);
    const t = new Date();
    return d.getFullYear() === t.getFullYear()
        && d.getMonth() === t.getMonth()
        && d.getDate() === t.getDate();
  }).length;

  const kpi = (icon, val, hint, kindCls) => `
    <div class="rc ${kindCls} rc-static">
      <div class="rc-head">
        <div class="rc-icon">${icon}</div>
        <div class="rc-label">${hint}</div>
      </div>
      <div class="rc-value">${val}</div>
    </div>`;

  const svgAlert = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const svgClock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const svgBolt  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const svgCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  el.innerHTML =
    kpi(svgAlert, abertos,  "Abertos",        abertos  > 0 ? "rc-warn"   : "rc-neutral") +
    kpi(svgClock, atend,    "Em atendimento", atend    > 0 ? "rc-warn"   : "rc-neutral") +
    kpi(svgBolt,  criticos, "Críticos",       criticos > 0 ? "rc-bad"    : "rc-neutral") +
    kpi(svgCheck, fechHoje, "Fechados hoje",  fechHoje > 0 ? "rc-ok"     : "rc-neutral");
}

// Renderiza um chamado: ícone de prédio colorido por prioridade à esquerda,
// nome do condomínio em destaque, descrição em segundo plano, pills no rodapé
// (categoria + status + meta com tempo/distância). Reaproveita as classes
// do admin (.ch-id-cell, .ch-cat-badge, .ch-st-*).
function renderCardChamado(c) {
  const condoNome = escapeHtml(c.condominio_nome || "—");
  const desc      = escapeHtml(c.titulo || c.descricao || "Sem descrição");
  const endereco  = escapeHtml(enderecoLinha(c));
  const tempo     = tempoAbertoLabel(c.criado_em);
  const dist      = distanciaParaChamado(c);
  const distLabel = dist != null
    ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`)
    : null;
  const cat       = CAT_LABEL[c.categoria] || c.categoria || "—";
  const stLabel   = c.status === "em_atendimento"
    ? "Em atendimento"
    : c.status === "fechado" ? "Resolvido" : "Aberto";

  // Ícone de prédio — corpo simples + linhas de janela
  const iconBuilding = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5"/>
      <line x1="9" y1="8"  x2="9"  y2="8.01"/>
      <line x1="15" y1="8" x2="15" y2="8.01"/>
      <line x1="9" y1="12" x2="9"  y2="12.01"/>
      <line x1="15" y1="12" x2="15" y2="12.01"/>
      <line x1="9" y1="16" x2="9"  y2="16.01"/>
      <line x1="15" y1="16" x2="15" y2="16.01"/>
    </svg>`;

  return `
    <button type="button" class="ch-row-mob" data-chamado="${c.id}" data-pri="${escapeHtml(c.prioridade)}">
      <div class="ch-row-mob-icon">${iconBuilding}</div>
      <div class="ch-row-mob-head">
        <span class="ch-row-mob-title">${condoNome}</span>
        <span class="ch-id-cell">CH-${String(c.id).padStart(3,"0")}</span>
      </div>
      <div class="ch-row-mob-desc" title="${desc}">
        ${endereco ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${endereco}</span>` : `<span>${desc}</span>`}
      </div>
      <div class="ch-row-mob-pills">
        <span class="ch-cat-badge">${escapeHtml(cat)}</span>
        <span class="ch-st ch-st-${escapeHtml(c.status)}">${stLabel}</span>
        <span class="ch-row-mob-meta">
          <span>há ${tempo}</span>
          ${distLabel ? `<span class="ch-row-mob-meta-sep"></span><span class="ch-row-mob-dist">${distLabel}</span>` : ""}
        </span>
      </div>
    </button>
  `;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// GPS: pede uma vez, cacheia por 5 min
async function obterGPS({ force = false } = {}) {
  if (!force && TC.geo && (Date.now() - TC.geo.capturada_em < 5 * 60 * 1000)) {
    return TC.geo;
  }
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        TC.geo = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          capturada_em: Date.now(),
        };
        resolve(TC.geo);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// Eventos da tela do técnico
document.querySelectorAll('[data-screen="tecnico-chamados"] .wa-tab').forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll('[data-screen="tecnico-chamados"] .wa-tab')
      .forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    TC.tab = tab.dataset.tab;
    renderTecnicoChamados();
  });
});

// Clique num card → abre tela de detalhe (delegação de evento)
document.getElementById("tcList").addEventListener("click", (e) => {
  const row = e.target.closest(".ch-row-mob[data-chamado]");
  if (!row) return;
  const id = Number(row.dataset.chamado);
  if (Number.isFinite(id)) abrirDetalheChamado(id);
});

document.getElementById("tcSort").addEventListener("change", async (e) => {
  TC.sort = e.target.value;
  if (TC.sort === "proximidade" && !TC.geo) {
    await obterGPS();
  }
  renderTecnicoChamados();
});

document.getElementById("tcRefresh").addEventListener("click", () => {
  carregarMeusChamados();
});

document.getElementById("btnLogoutTec").addEventListener("click", () => {
  pararPollingTecnico();
  Storage.clear();
  document.getElementById("loginSenha").value = "";
  hideAlert(document.getElementById("loginAlert"));
  showScreen("login");
});

// GPS oportunista no boot da tela (sort default = proximidade)
// — só dispara prompt depois que o técnico já está autenticado
function pedirGPSOportunista() {
  obterGPS().then((g) => { if (g) renderTecnicoChamados(); });
}

// Atualiza o "Sync Xs atrás" + relógio + GPS no rodapé a cada 30s
setInterval(() => {
  if (TC.syncedAt) {
    const el = document.getElementById("tcSync");
    if (el) el.textContent = syncLabel(TC.syncedAt);
  }
  // Footer só atualiza se a tela do técnico estiver ativa
  if (document.querySelector('[data-screen="tecnico-chamados"][data-active]')) {
    const filtrados = TC.chamados.filter(filtroDaTab);
    atualizarFooterTecnico(filtrados.length);
  }
}, 30000);

document.getElementById("btnLogout").addEventListener("click", () => {
  Storage.clear();
  document.getElementById("loginSenha").value = "";
  hideAlert(loginAlert);
  showScreen("login");
});

document.getElementById("btnPing").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const alertEl = document.getElementById("homeAlert");
  hideAlert(alertEl);
  setBtnLoading(btn, true);
  try {
    const data = await api("/chamados");
    showAlert(alertEl, `✓ ${Array.isArray(data) ? data.length : "?"} chamados acessíveis com seu papel.`, "success");
  } catch (err) {
    showAlert(alertEl, `✗ ${err.message}`, "error");
  } finally {
    setBtnLoading(btn, false);
  }
});

// Relogio no rodape da home
function atualizarRelogio() {
  const now = new Date();
  const el = document.getElementById("now");
  if (el) el.textContent = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;
}
atualizarRelogio();
setInterval(atualizarRelogio, 1000);

// ============== TÉCNICO — DETALHE DO CHAMADO (Fase 7D) ==============
const TD = {
  chamado: null,
  timer: null,        // setInterval id pro timer "Em atendimento há HH:MM:SS"
  loading: false,
};

const ST_LABEL = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  fechado: "Resolvido",
};

async function abrirDetalheChamado(id) {
  showScreen("tecnico-detalhe");
  document.getElementById("tdSkel").hidden = false;
  document.getElementById("tdContent").hidden = true;
  document.getElementById("tdCtaBar").hidden = true;
  hideAlert(document.getElementById("tdAlert"));

  // Modo demo: pega da lista local em vez de fetch
  if (IS_DEMO) {
    const c = TC.chamados.find((x) => x.id === id);
    if (!c) {
      showAlert(document.getElementById("tdAlert"), "Chamado não encontrado", "error");
      return;
    }
    TD.chamado = enriquecerDemoChamado(c);
    setTimeout(() => renderDetalhe(), 300); // pequeno delay pro feel de loading
    return;
  }

  try {
    TD.chamado = await api(`/chamados/meus/${id}`);
    renderDetalhe();
  } catch (err) {
    showAlert(document.getElementById("tdAlert"), err.message, "error");
    document.getElementById("tdSkel").hidden = true;
  }
}

// Modo demo: injeta reservatórios fake pro chamado selecionado
function enriquecerDemoChamado(c) {
  return {
    ...c,
    reservatorios: [
      {
        id: 1, nome: "Reservatório Superior", tipo: "superior", device_id: "DEV-001",
        altura_total_m: 3.5,
        ultima_nivel: "baixo", ultima_nivel_pct: 32, ultima_bomba_ligada: true,
        ultima_criado_em: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        offline: false, alertas_abertos_count: 1,
      },
      {
        id: 2, nome: "Reservatório Inferior", tipo: "inferior", device_id: "DEV-002",
        altura_total_m: 4.0,
        ultima_nivel: "alto", ultima_nivel_pct: 78, ultima_bomba_ligada: false,
        ultima_criado_em: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        offline: false, alertas_abertos_count: 0,
      },
    ],
    ordem_servico: c.status === "em_atendimento" ? {
      id: 1, numero: "OS-2026-0042",
      chegada_em: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      chegada_lat: -23.5613, chegada_lng: -46.6562,
    } : null,
    mensagens: c.categoria === "vazamento" ? [
      {
        direcao: "entrada", tipo: "text",
        conteudo: "Boa tarde, tem um vazamento grande no subsolo, está saindo muita água da parede",
        criado_em: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
      {
        direcao: "saida", tipo: "text",
        conteudo: "Entendi. Vou abrir um chamado de emergência. Um técnico vai até aí.",
        criado_em: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
      },
    ] : [],
  };
}

function renderDetalhe() {
  const c = TD.chamado;
  if (!c) return;

  // Header
  document.getElementById("tdCondoNome").textContent = c.condominio_nome || "Chamado";
  document.getElementById("tdChamadoId").textContent = `CH-${String(c.id).padStart(3, "0")}`;
  const pill = document.getElementById("tdStatusPill");
  pill.textContent = ST_LABEL[c.status] || c.status;
  pill.className = `td-status-pill td-status-${c.status}`;

  const content = document.getElementById("tdContent");

  const endereco = enderecoLinhaCompleta(c);
  const priLabel = PRI_LABEL[c.prioridade] || c.prioridade;
  const catLabel = CAT_LABEL[c.categoria] || c.categoria || "—";

  // Timer só aparece se em atendimento e tem chegada_em
  const chegada = c.ordem_servico?.chegada_em;
  const timerHtml = (c.status === "em_atendimento" && chegada)
    ? `
      <div class="td-card">
        <div class="td-card-body">
          <div class="td-timer-box">
            <div class="td-timer-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="td-timer-meta">
              <div class="td-timer-label">Em atendimento há</div>
              <div class="td-timer-value" id="tdTimer">00:00</div>
            </div>
          </div>
          <div class="td-info-row">
            <span class="td-info-lbl">O.S.</span>
            <span class="td-info-val">${escapeHtml(c.ordem_servico.numero || "—")}</span>
          </div>
          <div class="td-info-row">
            <span class="td-info-lbl">Chegada</span>
            <span class="td-info-val">${formatarHoraCurta(chegada)}</span>
          </div>
        </div>
      </div>` : "";

  // WhatsApp messages (se houver)
  const msgsHtml = (c.mensagens && c.mensagens.length)
    ? `
      <div class="td-card">
        <div class="cardHead">
          <h2>
            <svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Conversa WhatsApp
          </h2>
        </div>
        <div class="td-card-body">
          <div class="td-msg-list">
            ${c.mensagens.map(renderMsg).join("")}
          </div>
        </div>
      </div>` : "";

  // Reservatórios
  const resHtml = (c.reservatorios && c.reservatorios.length)
    ? `
      <div class="td-card">
        <div class="cardHead">
          <h2>
            <svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18"/><rect x="5"  y="10" width="3" height="9"/><rect x="10" y="5"  width="3" height="14"/><rect x="15" y="13" width="3" height="6"/>
            </svg>
            Telemetria
          </h2>
        </div>
        <div class="td-card-body">
          <div class="td-res-list">
            ${c.reservatorios.map(renderRes).join("")}
          </div>
        </div>
      </div>` : "";

  content.innerHTML = `
    <!-- Hero: endereço + ações Maps/Ligar -->
    <div class="td-card">
      <div class="td-hero">
        <div class="td-addr">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <div class="td-addr-text">${escapeHtml(endereco)}</div>
        </div>
        <div class="td-hero-actions">
          <button class="btn" id="tdBtnMaps">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            <span>Abrir no Maps</span>
          </button>
          <button class="btn" id="tdBtnLigar" ${c.condominio_telefone || c.cliente_telefone ? "" : "disabled"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>Ligar</span>
          </button>
        </div>
      </div>
      <div class="td-pills">
        <span class="ch-cat-badge">${escapeHtml(catLabel)}</span>
        <span class="ch-prio ch-prio-${escapeHtml(c.prioridade)}">${escapeHtml(priLabel)}</span>
      </div>
    </div>

    ${timerHtml}

    <!-- Descrição -->
    <div class="td-card">
      <div class="cardHead">
        <h2>
          <svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Descrição
        </h2>
      </div>
      <div class="td-card-body">
        <div class="td-desc">${escapeHtml(c.titulo || c.descricao || "Sem descrição")}</div>
        ${(c.titulo && c.descricao && c.titulo !== c.descricao)
          ? `<div class="td-desc" style="color:var(--muted);font-size:12.5px;margin-top:4px">${escapeHtml(c.descricao)}</div>`
          : ""}
      </div>
    </div>

    ${resHtml}
    ${msgsHtml}
  `;

  document.getElementById("tdSkel").hidden = true;
  content.hidden = false;

  // CTA: muda por status
  configurarCTA(c);

  // Timer (se em atendimento)
  pararTimerTec();
  if (c.status === "em_atendimento" && chegada) {
    iniciarTimerTec(chegada);
  }

  // Botões hero
  document.getElementById("tdBtnMaps")?.addEventListener("click", () => abrirMaps(c));
  document.getElementById("tdBtnLigar")?.addEventListener("click", () => ligarPara(c));
}

function configurarCTA(c) {
  const bar  = document.getElementById("tdCtaBar");
  const btn  = document.getElementById("tdCtaBtn");
  const lbl  = document.getElementById("tdCtaLabel");

  if (c.status === "fechado") {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  if (c.status === "aberto") {
    lbl.textContent = "Iniciar atendimento";
    btn.className = "btn btnAccent btn-lg";
    btn.onclick = () => iniciarAtendimento(c.id);
  } else if (c.status === "em_atendimento") {
    lbl.textContent = "Preencher Ordem de Serviço";
    btn.className = "btn btnAccent btn-lg";
    btn.onclick = () => abrirFormularioOS(c.id, c.ordem_servico?.id);
  }
}

async function iniciarAtendimento(id) {
  const btn = document.getElementById("tdCtaBtn");
  setBtnLoading(btn, true);
  hideAlert(document.getElementById("tdAlert"));

  try {
    // Pede GPS com alta precisão pra registrar chegada
    const geo = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("GPS indisponível"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao_m: pos.coords.accuracy,
        }),
        (err) => reject(new Error("Não foi possível obter GPS: " + err.message)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    if (IS_DEMO) {
      // Modo demo: simula a resposta do servidor
      TD.chamado.status = "em_atendimento";
      TD.chamado.ordem_servico = {
        id: 999, numero: "OS-2026-DEMO",
        chegada_em: new Date().toISOString(),
        chegada_lat: geo.lat, chegada_lng: geo.lng,
      };
      // também reflete na lista
      const c = TC.chamados.find((x) => x.id === id);
      if (c) c.status = "em_atendimento";
    } else {
      const r = await api(`/chamados/${id}/iniciar-atendimento`, {
        method: "POST",
        body: geo,
      });
      TD.chamado.status = "em_atendimento";
      TD.chamado.ordem_servico = r.ordem_servico;
    }

    renderDetalhe();
  } catch (err) {
    showAlert(document.getElementById("tdAlert"), err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

function abrirMaps(c) {
  if (c.condominio_lat && c.condominio_lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${c.condominio_lat},${c.condominio_lng}`;
    window.open(url, "_blank");
  } else {
    const q = encodeURIComponent(enderecoLinhaCompleta(c));
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  }
}

function ligarPara(c) {
  const tel = (c.condominio_telefone || c.cliente_telefone || "").replace(/\D+/g, "");
  if (!tel) return;
  window.location.href = `tel:${tel}`;
}

function enderecoLinhaCompleta(c) {
  const parts = [
    c.condominio_endereco,
    c.condominio_bairro,
    [c.condominio_cidade, c.condominio_uf].filter(Boolean).join("/"),
  ].map((s) => (s || "").trim()).filter(Boolean);
  if (parts.length === 0) return "Endereço não cadastrado";
  return parts.join(" — ");
}

function renderRes(r) {
  const nivelClass = r.offline ? "lv-unknown" : ({
    alto: "lv-alto", medio: "lv-medio", baixo: "lv-baixo", muito_baixo: "lv-muito-baixo"
  }[r.ultima_nivel] || "lv-medio");

  const pct = r.ultima_nivel_pct != null ? Number(r.ultima_nivel_pct) : 0;
  const pctTxt = r.offline ? "OFFLINE" :
    (r.ultima_nivel_pct != null ? `${pct}%` : "—");

  const bombaCls = r.ultima_bomba_ligada === true ? "td-res-bomba-on"
                 : r.ultima_bomba_ligada === false ? "td-res-bomba-off"
                 : "td-res-bomba-uk";
  const bombaTxt = r.ultima_bomba_ligada === true ? "BOMBA LIGADA"
                 : r.ultima_bomba_ligada === false ? "BOMBA DESLIGADA"
                 : "BOMBA —";

  return `
    <div class="td-res">
      <div class="td-res-head">
        <span>${escapeHtml(r.nome || `R-${r.id}`)}</span>
        <span class="td-res-tipo">${escapeHtml(r.tipo || "—")}</span>
      </div>
      <span class="td-res-bomba ${bombaCls}">${bombaTxt}</span>
      <div class="td-res-bar">
        <div class="td-res-bar-fill ${nivelClass}" style="width:${r.offline ? 0 : pct}%"></div>
      </div>
      <div class="td-res-foot">
        <span class="td-res-pct ${r.offline ? "is-offline" : ""}">${pctTxt}</span>
        <span>${r.ultima_criado_em ? `há ${tempoAbertoLabel(r.ultima_criado_em)}` : "sem leitura"}</span>
      </div>
    </div>`;
}

function renderMsg(m) {
  const cls = m.direcao === "entrada" ? "td-msg-in" : "td-msg-out";
  return `
    <div class="td-msg ${cls}">
      <span>${escapeHtml(m.conteudo || "")}</span>
      <span class="td-msg-time">${formatarHoraCurta(m.criado_em)}</span>
    </div>`;
}

function formatarHoraCurta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function iniciarTimerTec(chegadaIso) {
  const chegadaMs = new Date(chegadaIso).getTime();
  const el = document.getElementById("tdTimer");
  if (!el) return;

  const tick = () => {
    const diff = Math.max(0, Date.now() - chegadaMs);
    const totalSec = Math.floor(diff / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    el.textContent = hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  };
  tick();
  TD.timer = setInterval(tick, 1000);
}

function pararTimerTec() {
  if (TD.timer) { clearInterval(TD.timer); TD.timer = null; }
}

// Botão voltar
document.getElementById("tdBack").addEventListener("click", () => {
  pararTimerTec();
  TD.chamado = null;
  showScreen("tecnico-chamados");
  // recarrega a lista (status pode ter mudado)
  if (!IS_DEMO) carregarMeusChamados(true);
  else renderTecnicoChamados();
});

// ============== TÉCNICO — FORMULÁRIO DE O.S. (Fase 7E) ==============
const OS = {
  data: null,      // O.S. completa (chamado_id, condominio_id, campos, fotos, peças...)
  chamadoId: null, // pra voltar pra detalhe
  saveDebounce: null,
  timer: null,
  sign: { ctx: null, canvas: null, drawing: false, lastX: 0, lastY: 0, hasInk: false },
};

const OS_TIPOS = [
  ["retirada_equipamento", "Retirada de equipamento"],
  ["vistoria_contrato",    "Vistoria de contrato"],
  ["visita_tecnica",       "Visita técnica"],
  ["devolucao",            "Devolução"],
  ["limpeza_piscina",      "Limpeza de piscina"],
  ["limpeza_caixas",       "Limpeza de caixas d'água"],
  ["chamado_emergencial",  "Chamado emergencial"],
  ["preventiva_mensal",    "Preventiva mensal"],
  ["instalacao_pecas",     "Instalação de peças"],
];

const OS_EQUIPAMENTOS = [
  ["comando_eletrico",       "Comando elétrico"],
  ["bombas_recalque",        "Bombas de recalque"],
  ["bombas_succao",          "Bombas de sucção"],
  ["bombas_piscina",         "Bombas de piscina"],
  ["bombas_pressurizacao",   "Bombas de pressurização"],
  ["bombas_cascata",         "Bombas de cascata"],
  ["bombas_espelho_dagua",   "Bombas de espelho d'água"],
  ["linha_automaticos",      "Linha dos automáticos"],
  ["paineis_solares",        "Painéis solares"],
  ["valvula_redutora",       "Válvula redutora de pressão"],
  ["valvula_retencao",       "Válvula de retenção"],
  ["estacao_tratamento",     "Estação de tratamento"],
  ["grupo_gerador",          "Grupo gerador"],
];

const OS_RECEBIDO_TIPOS = [
  ["gestor",   "Gestor"],
  ["sindico",  "Síndico"],
  ["portaria", "Portaria"],
];

const OS_RESOLUCAO = [
  ["resolvido", "Resolvido"],
  ["paliativo", "Paliativo"],
  ["agravado",  "Agravado"],
];

const OS_FOTO_TIPOS = ["antes", "depois", "geral"];

// ---- Entrar/sair da tela ----
async function abrirFormularioOS(chamadoId, osId) {
  OS.chamadoId = chamadoId;
  showScreen("tecnico-os");
  document.getElementById("osSections").innerHTML = `
    <div class="tc-skel" style="height:80px"></div>
    <div class="tc-skel" style="height:80px"></div>
    <div class="tc-skel" style="height:80px"></div>`;
  hideAlert(document.getElementById("osAlert"));

  try {
    if (IS_DEMO) {
      OS.data = {
        id: osId || 999,
        numero: "OS-2026-DEMO",
        chamado_id: chamadoId,
        chegada_em: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        tipos_servico: [],
        itens_verificados: {},
        correntes: null,
        observacoes: null,
        servico_realizado: null,
        necessario_retorno: false,
        retorno_sugerido_em: null,
        recebido_nome: null,
        recebido_tipo: null,
        assinatura_b64: null,
        fotos: [],
        pecas: [],
      };
    } else {
      OS.data = await api(`/ordens-servico/${osId}`);
      OS.data.fotos = OS.data.fotos || [];
      OS.data.pecas = OS.data.pecas || [];
    }

    document.getElementById("osNumero").textContent = OS.data.numero || `OS-${osId}`;
    iniciarTimerOS(OS.data.chegada_em);
    renderOSSections();
  } catch (err) {
    showAlert(document.getElementById("osAlert"), err.message, "error");
  }
}

function sairFormularioOS() {
  pararTimerOS();
  if (OS.saveDebounce) clearTimeout(OS.saveDebounce);
  OS.data = null;
  showScreen("tecnico-detalhe");
}

function iniciarTimerOS(chegadaIso) {
  pararTimerOS();
  if (!chegadaIso) return;
  const inicio = new Date(chegadaIso).getTime();
  const el = document.getElementById("osTimer");
  if (!el) return;
  const tick = () => {
    const diff = Math.max(0, Date.now() - inicio);
    const totalSec = Math.floor(diff / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    el.textContent = hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  };
  tick();
  OS.timer = setInterval(tick, 1000);
}

function pararTimerOS() {
  if (OS.timer) { clearInterval(OS.timer); OS.timer = null; }
}

// ---- Auto-save debounced ----
function salvarOSDebounced(patch) {
  if (!OS.data) return;
  // aplica localmente primeiro pro feedback instantâneo
  Object.assign(OS.data, patch);
  if (OS.saveDebounce) clearTimeout(OS.saveDebounce);
  OS.saveDebounce = setTimeout(async () => {
    if (IS_DEMO) return; // demo não persiste
    try {
      await api(`/ordens-servico/${OS.data.id}`, { method: "PATCH", body: patch });
    } catch (err) {
      console.warn("[os] auto-save falhou:", err.message);
      showAlert(document.getElementById("osAlert"),
        "Não foi possível salvar: " + err.message, "error");
    }
  }, 600);
  atualizarProgresso();
}

// ---- Render das seções ----
function renderOSSections() {
  const wrap = document.getElementById("osSections");
  const sections = [
    sectionTipos(),
    sectionEquipamentos(),
    sectionCorrentes(),
    sectionFotos(),
    sectionPecas(),
    sectionObservacoes(),
    sectionResolucao(),
    sectionRecebidoAssinatura(),
  ];
  wrap.innerHTML = sections.join("");

  // Bind: clique no head abre/fecha
  wrap.querySelectorAll(".os-section-head").forEach((head) => {
    head.addEventListener("click", () => {
      head.parentElement.classList.toggle("is-open");
    });
  });

  // Bind: handlers por seção
  bindTipos();
  bindEquipamentos();
  bindCorrentes();
  bindFotos();
  bindPecas();
  bindObservacoes();
  bindResolucao();
  bindRecebidoAssinatura();
  atualizarProgresso();
}

function sectionTemplate({ id, title, subtitle, required, complete, body, open }) {
  return `
    <div class="os-section${complete ? " is-complete" : ""}${open ? " is-open" : ""}" data-section="${id}">
      <button type="button" class="os-section-head">
        <div class="os-section-icon">
          ${complete
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<span style="font-size:11px;font-weight:800">${OS_SECTION_NUMBER[id] || "•"}</span>`}
        </div>
        <div class="os-section-title">
          ${title}
          ${subtitle ? `<small>${subtitle}</small>` : ""}
        </div>
        ${required && !complete ? `<span class="os-section-required">Obrig.</span>` : ""}
        <svg class="os-section-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="os-section-body">${body}</div>
    </div>`;
}

const OS_SECTION_NUMBER = {
  tipos: "1", equipamentos: "2", correntes: "3", fotos: "4",
  pecas: "5", observacoes: "6", resolucao: "7", recebido: "8",
};

// ---- Seção 1: Tipos de serviço ----
function sectionTipos() {
  const tipos = OS.data.tipos_servico || [];
  return sectionTemplate({
    id: "tipos",
    title: "Tipos de serviço",
    subtitle: tipos.length ? `${tipos.length} selecionado${tipos.length > 1 ? "s" : ""}` : "Toque pra selecionar",
    required: true,
    complete: tipos.length > 0,
    open: tipos.length === 0,
    body: `
      <div class="os-chips" id="osChips">
        ${OS_TIPOS.map(([k, lbl]) => `
          <button type="button" class="os-chip ${tipos.includes(k) ? "is-on" : ""}" data-tipo="${k}">${escapeHtml(lbl)}</button>
        `).join("")}
      </div>`,
  });
}
function bindTipos() {
  document.getElementById("osChips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".os-chip");
    if (!chip) return;
    const k = chip.dataset.tipo;
    const set = new Set(OS.data.tipos_servico || []);
    if (set.has(k)) set.delete(k); else set.add(k);
    chip.classList.toggle("is-on");
    salvarOSDebounced({ tipos_servico: [...set] });
    // atualiza badge "X selecionados" e estado complete
    const sub = chip.closest(".os-section").querySelector(".os-section-title small");
    if (sub) {
      const n = [...set].length;
      sub.textContent = n ? `${n} selecionado${n > 1 ? "s" : ""}` : "Toque pra selecionar";
    }
    chip.closest(".os-section").classList.toggle("is-complete", set.size > 0);
  });
}

// ---- Seção 2: Equipamentos verificados ----
function sectionEquipamentos() {
  const it = OS.data.itens_verificados || {};
  const checked = OS_EQUIPAMENTOS.filter(([k]) => it[k]).length;
  return sectionTemplate({
    id: "equipamentos",
    title: "Equipamentos verificados",
    subtitle: checked ? `${checked} verificado${checked > 1 ? "s" : ""}` : "Marque o que foi verificado",
    required: false,
    complete: checked > 0,
    body: `
      <div id="osEquipamentos" style="padding-top:6px">
        ${OS_EQUIPAMENTOS.map(([k, lbl]) => `
          <label class="os-switch-row">
            <span class="os-switch-label">${escapeHtml(lbl)}</span>
            <span class="os-switch">
              <input type="checkbox" data-eq="${k}" ${it[k] ? "checked" : ""}>
              <span class="os-switch-slider"></span>
            </span>
          </label>
        `).join("")}
      </div>`,
  });
}
function bindEquipamentos() {
  document.getElementById("osEquipamentos")?.addEventListener("change", (e) => {
    const input = e.target.closest('input[type="checkbox"][data-eq]');
    if (!input) return;
    const it = { ...(OS.data.itens_verificados || {}) };
    if (input.checked) it[input.dataset.eq] = true;
    else delete it[input.dataset.eq];
    salvarOSDebounced({ itens_verificados: it });
    const n = Object.keys(it).filter((k) => it[k]).length;
    const sec = input.closest(".os-section");
    const sub = sec.querySelector(".os-section-title small");
    if (sub) sub.textContent = n ? `${n} verificado${n > 1 ? "s" : ""}` : "Marque o que foi verificado";
    sec.classList.toggle("is-complete", n > 0);
  });
}

// ---- Seção 3: Correntes elétricas ----
function sectionCorrentes() {
  const c = OS.data.correntes || {};
  const tipo = c.tipo || "";
  const v = c.valores || [];
  return sectionTemplate({
    id: "correntes",
    title: "Correntes elétricas",
    subtitle: tipo ? `${tipo.toUpperCase()} · ${v.filter(Boolean).join(" / ")} A` : "Mono / Bi / Tri",
    required: false,
    complete: tipo && v.some((x) => x != null && x !== ""),
    body: `
      <div class="os-radio-group" id="osCorTipo">
        ${["mono","bi","tri"].map((t) => `
          <label class="os-radio">
            <input type="radio" name="osCorTipo" value="${t}" ${tipo === t ? "checked" : ""}>
            <span class="os-radio-label">${t.toUpperCase()}</span>
          </label>`).join("")}
      </div>
      <div class="os-correntes-inputs" id="osCorVals">
        ${[0,1,2].map((i) => `
          <div>
            <div class="os-corrente-label">F${i+1}</div>
            <input type="number" step="0.1" class="input os-corrente-input"
                   data-idx="${i}" placeholder="0.0"
                   value="${v[i] != null ? v[i] : ""}">
          </div>`).join("")}
      </div>`,
  });
}
function bindCorrentes() {
  const aplicar = () => {
    const tipo = document.querySelector('#osCorTipo input:checked')?.value || null;
    const inputs = document.querySelectorAll('#osCorVals input');
    const lim = tipo === "mono" ? 1 : tipo === "bi" ? 2 : 3;
    inputs.forEach((inp, i) => {
      inp.disabled = !tipo || i >= lim;
      if (i >= lim) inp.value = "";
    });
    const valores = [...inputs].map((inp) => inp.value === "" ? null : Number(inp.value));
    const correntes = tipo ? { tipo, valores: valores.slice(0, lim) } : null;
    salvarOSDebounced({ correntes });
    // atualiza subtitle + complete
    const sec = document.querySelector('[data-section="correntes"]');
    const sub = sec.querySelector(".os-section-title small");
    if (correntes && correntes.valores.some((x) => x != null)) {
      sub.textContent = `${tipo.toUpperCase()} · ${correntes.valores.filter((x) => x != null).join(" / ")} A`;
      sec.classList.add("is-complete");
    } else {
      sub.textContent = "Mono / Bi / Tri";
      sec.classList.remove("is-complete");
    }
  };
  document.querySelectorAll('#osCorTipo input').forEach((r) => r.addEventListener("change", aplicar));
  document.querySelectorAll('#osCorVals input').forEach((i) => i.addEventListener("input", aplicar));
  // estado inicial: desabilita campos não usados
  aplicar();
}

// ---- Seção 4: Fotos ----
function sectionFotos() {
  const fotos = OS.data.fotos || [];
  return sectionTemplate({
    id: "fotos",
    title: "Fotos",
    subtitle: fotos.length ? `${fotos.length} foto${fotos.length > 1 ? "s" : ""}` : "Antes / Depois / Geral",
    required: false,
    complete: fotos.length > 0,
    body: `
      <div class="os-foto-tipo-picker" id="osFotoTipo">
        ${OS_FOTO_TIPOS.map((t, i) => `
          <button type="button" class="os-foto-tipo-opt ${i === 2 ? "is-on" : ""}" data-tipo="${t}">${t}</button>
        `).join("")}
      </div>
      <div class="os-foto-list" id="osFotos">
        ${fotos.map(renderFotoCard).join("")}
        <label class="os-foto-add">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Foto
          <input type="file" accept="image/*" capture="environment" id="osFotoInput">
        </label>
      </div>`,
  });
}
function renderFotoCard(f) {
  return `
    <div class="os-foto" data-foto-id="${f.id}">
      <img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.tipo || "")}">
      ${f.tipo ? `<span class="os-foto-tipo">${escapeHtml(f.tipo)}</span>` : ""}
      <button type="button" class="os-foto-del" aria-label="Remover">×</button>
    </div>`;
}
function bindFotos() {
  // Picker de tipo (antes/depois/geral) — afeta as próximas fotos enviadas
  document.querySelectorAll("#osFotoTipo .os-foto-tipo-opt").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#osFotoTipo .os-foto-tipo-opt")
        .forEach((x) => x.classList.remove("is-on"));
      b.classList.add("is-on");
    });
  });

  // Upload com compressão client-side
  document.getElementById("osFotoInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // permite re-enviar a mesma foto

    const tipo = document.querySelector("#osFotoTipo .os-foto-tipo-opt.is-on")?.dataset.tipo || "geral";

    try {
      const dataUrl = await comprimirFoto(file, 1600, 0.75);

      if (IS_DEMO) {
        const fakeFoto = {
          id: Date.now(),
          url: dataUrl, // no demo usa o próprio dataUrl pra exibir
          tipo,
        };
        OS.data.fotos.push(fakeFoto);
      } else {
        const created = await api(`/ordens-servico/${OS.data.id}/fotos/upload`, {
          method: "POST",
          body: { image_base64: dataUrl, tipo },
        });
        OS.data.fotos.push(created);
      }

      // Re-render da seção
      const sec = document.querySelector('[data-section="fotos"]');
      const open = sec.classList.contains("is-open");
      sec.outerHTML = sectionFotos();
      const newSec = document.querySelector('[data-section="fotos"]');
      if (open) newSec.classList.add("is-open");
      newSec.querySelector(".os-section-head").addEventListener("click", () =>
        newSec.classList.toggle("is-open"));
      bindFotos();
      atualizarProgresso();
    } catch (err) {
      showAlert(document.getElementById("osAlert"),
        "Falha ao enviar foto: " + err.message, "error");
    }
  });

  // Remover foto
  document.getElementById("osFotos")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".os-foto-del");
    if (!btn) return;
    const card = btn.closest(".os-foto");
    const id = Number(card.dataset.fotoId);
    if (!confirm("Remover esta foto?")) return;
    try {
      if (!IS_DEMO) {
        await api(`/ordens-servico/${OS.data.id}/fotos/${id}`, { method: "DELETE" });
      }
      OS.data.fotos = OS.data.fotos.filter((f) => f.id !== id);
      card.remove();
      const sec = document.querySelector('[data-section="fotos"]');
      const n = OS.data.fotos.length;
      const sub = sec.querySelector(".os-section-title small");
      if (sub) sub.textContent = n ? `${n} foto${n > 1 ? "s" : ""}` : "Antes / Depois / Geral";
      sec.classList.toggle("is-complete", n > 0);
      atualizarProgresso();
    } catch (err) {
      showAlert(document.getElementById("osAlert"),
        "Falha ao remover: " + err.message, "error");
    }
  });
}

// Compressão de imagem via canvas. Retorna data URL JPEG.
async function comprimirFoto(file, maxDim, quality) {
  const img = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = width / height;
    if (ratio >= 1) { width = maxDim; height = Math.round(maxDim / ratio); }
    else            { height = maxDim; width  = Math.round(maxDim * ratio); }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

// ---- Seção 5: Peças usadas ----
function sectionPecas() {
  const pecas = OS.data.pecas || [];
  return sectionTemplate({
    id: "pecas",
    title: "Peças usadas / substituídas",
    subtitle: pecas.length ? `${pecas.length} item${pecas.length > 1 ? "s" : ""}` : "Opcional",
    required: false,
    complete: false, // peça é opcional, não marca como completa
    body: `
      <div id="osPecas">
        ${pecas.map(renderPeca).join("")}
      </div>
      <button type="button" class="btn btn-sm os-peca-add" id="osPecaAdd">+ Adicionar peça</button>`,
  });
}
function renderPeca(p) {
  return `
    <div class="os-peca" data-peca-id="${p.id}">
      <input class="input" type="text" data-f="descricao" placeholder="Descrição" value="${escapeHtml(p.descricao || "")}">
      <input class="input" type="number" min="1" data-f="quantidade" placeholder="Qtd" value="${p.quantidade || 1}">
      <button type="button" class="os-peca-del" aria-label="Remover">×</button>
    </div>`;
}
function bindPecas() {
  document.getElementById("osPecaAdd")?.addEventListener("click", async () => {
    const desc = "Nova peça";
    let novaPeca;
    if (IS_DEMO) {
      novaPeca = { id: Date.now(), descricao: desc, quantidade: 1 };
    } else {
      novaPeca = await api(`/ordens-servico/${OS.data.id}/pecas`, {
        method: "POST",
        body: { descricao: desc, quantidade: 1 },
      });
    }
    OS.data.pecas.push(novaPeca);
    document.getElementById("osPecas").insertAdjacentHTML("beforeend", renderPeca(novaPeca));
    const sec = document.querySelector('[data-section="pecas"]');
    const sub = sec.querySelector(".os-section-title small");
    if (sub) sub.textContent = `${OS.data.pecas.length} item${OS.data.pecas.length > 1 ? "s" : ""}`;
  });

  // Editar inline (debounced PATCH) e excluir
  document.getElementById("osPecas")?.addEventListener("click", async (e) => {
    const del = e.target.closest(".os-peca-del");
    if (!del) return;
    const row = del.closest(".os-peca");
    const id = Number(row.dataset.pecaId);
    if (!confirm("Remover esta peça?")) return;
    if (!IS_DEMO) {
      try {
        await api(`/ordens-servico/${OS.data.id}/pecas/${id}`, { method: "DELETE" });
      } catch (err) {
        showAlert(document.getElementById("osAlert"), err.message, "error");
        return;
      }
    }
    OS.data.pecas = OS.data.pecas.filter((p) => p.id !== id);
    row.remove();
    const sec = document.querySelector('[data-section="pecas"]');
    const sub = sec.querySelector(".os-section-title small");
    if (sub) sub.textContent = OS.data.pecas.length
      ? `${OS.data.pecas.length} item${OS.data.pecas.length > 1 ? "s" : ""}` : "Opcional";
  });
  // Edição inline: usa PATCH específico — não temos endpoint de PATCH peça,
  // então pra Fase 7E simplificado, edição apenas reflete localmente (admin pode
  // editar via web). Backlog: PATCH /pecas/:id pro técnico ajustar texto.
}

// ---- Seção 6: Observações ----
function sectionObservacoes() {
  const obs = OS.data.observacoes || "";
  return sectionTemplate({
    id: "observacoes",
    title: "Observações",
    subtitle: obs ? `${obs.length} caracteres` : "Opcional",
    required: false,
    complete: false,
    body: `<textarea class="os-textarea" id="osObs" maxlength="2000" placeholder="Detalhes do atendimento, peças encontradas, recomendações...">${escapeHtml(obs)}</textarea>`,
  });
}
function bindObservacoes() {
  const ta = document.getElementById("osObs");
  if (!ta) return;
  ta.addEventListener("input", () => {
    salvarOSDebounced({ observacoes: ta.value });
    const sec = document.querySelector('[data-section="observacoes"]');
    const sub = sec.querySelector(".os-section-title small");
    if (sub) sub.textContent = ta.value ? `${ta.value.length} caracteres` : "Opcional";
  });
}

// ---- Seção 7: Resolução ----
function sectionResolucao() {
  const sr = OS.data.servico_realizado;
  const ret = OS.data.necessario_retorno;
  const dt = OS.data.retorno_sugerido_em || "";
  return sectionTemplate({
    id: "resolucao",
    title: "Resolução",
    subtitle: sr ? OS_RESOLUCAO.find(([k]) => k === sr)?.[1] : "Como ficou o serviço?",
    required: true,
    complete: !!sr,
    body: `
      <div class="os-radio-group" id="osResRadio">
        ${OS_RESOLUCAO.map(([k, lbl]) => `
          <label class="os-radio">
            <input type="radio" name="osRes" value="${k}" ${sr === k ? "checked" : ""}>
            <span class="os-radio-label">${escapeHtml(lbl)}</span>
          </label>`).join("")}
      </div>
      <label class="os-switch-row" style="margin-top:12px">
        <span class="os-switch-label">Necessário retorno?</span>
        <span class="os-switch">
          <input type="checkbox" id="osRet" ${ret ? "checked" : ""}>
          <span class="os-switch-slider"></span>
        </span>
      </label>
      <div id="osRetDateBox" ${ret ? "" : "hidden"}>
        <div class="os-corrente-label" style="margin-top:8px;text-align:left">Data sugerida</div>
        <input type="date" class="input" id="osRetDate" value="${dt}">
      </div>`,
  });
}
function bindResolucao() {
  document.querySelectorAll('#osResRadio input').forEach((r) => {
    r.addEventListener("change", () => {
      const v = document.querySelector('#osResRadio input:checked')?.value || null;
      salvarOSDebounced({ servico_realizado: v });
      const sec = document.querySelector('[data-section="resolucao"]');
      const sub = sec.querySelector(".os-section-title small");
      if (sub) sub.textContent = OS_RESOLUCAO.find(([k]) => k === v)?.[1] || "Como ficou o serviço?";
      sec.classList.toggle("is-complete", !!v);
    });
  });
  document.getElementById("osRet")?.addEventListener("change", (e) => {
    document.getElementById("osRetDateBox").hidden = !e.target.checked;
    salvarOSDebounced({
      necessario_retorno: e.target.checked,
      retorno_sugerido_em: e.target.checked ? (document.getElementById("osRetDate")?.value || null) : null,
    });
  });
  document.getElementById("osRetDate")?.addEventListener("change", (e) => {
    salvarOSDebounced({ retorno_sugerido_em: e.target.value || null });
  });
}

// ---- Seção 8: Quem recebeu + Assinatura ----
function sectionRecebidoAssinatura() {
  const nome = OS.data.recebido_nome || "";
  const tipo = OS.data.recebido_tipo || "";
  const tem = !!OS.data.assinatura_b64;
  return sectionTemplate({
    id: "recebido",
    title: "Quem recebeu + Assinatura",
    subtitle: tem && nome ? `${nome}` : "Toque pra assinar",
    required: true,
    complete: tem && nome && tipo,
    body: `
      <div class="os-recebido-grid">
        <input class="input" type="text" id="osRecNome" placeholder="Nome de quem recebeu" value="${escapeHtml(nome)}">
        <div class="os-radio-group" id="osRecTipo">
          ${OS_RECEBIDO_TIPOS.map(([k, lbl]) => `
            <label class="os-radio">
              <input type="radio" name="osRecTipo" value="${k}" ${tipo === k ? "checked" : ""}>
              <span class="os-radio-label">${escapeHtml(lbl)}</span>
            </label>`).join("")}
        </div>
      </div>

      <div class="os-corrente-label" style="text-align:left;margin-top:14px">Assinatura</div>
      <div class="os-sign-wrap ${tem ? "has-signature" : ""}" id="osSignWrap">
        <canvas class="os-sign-canvas" id="osSignCanvas"></canvas>
        <div class="os-sign-hint">Assine aqui com o dedo</div>
      </div>
      <div class="os-sign-actions">
        <span>Use o dedo ou caneta sobre a tela</span>
        <button type="button" class="os-sign-clear" id="osSignClear">Limpar</button>
      </div>`,
  });
}
function bindRecebidoAssinatura() {
  document.getElementById("osRecNome")?.addEventListener("input", (e) => {
    salvarOSDebounced({ recebido_nome: e.target.value });
    avaliarRecebidoComplete();
  });
  document.querySelectorAll('#osRecTipo input').forEach((r) => {
    r.addEventListener("change", () => {
      const v = document.querySelector('#osRecTipo input:checked')?.value || null;
      salvarOSDebounced({ recebido_tipo: v });
      avaliarRecebidoComplete();
    });
  });

  // Canvas
  iniciarCanvasAssinatura();
  document.getElementById("osSignClear")?.addEventListener("click", limparAssinatura);
}

function avaliarRecebidoComplete() {
  const nome = document.getElementById("osRecNome")?.value || "";
  const tipo = document.querySelector('#osRecTipo input:checked')?.value || "";
  const tem = OS.sign.hasInk || !!OS.data.assinatura_b64;
  const sec = document.querySelector('[data-section="recebido"]');
  if (sec) {
    sec.classList.toggle("is-complete", !!(nome && tipo && tem));
    const sub = sec.querySelector(".os-section-title small");
    if (sub) sub.textContent = tem && nome ? nome : "Toque pra assinar";
  }
  atualizarProgresso();
}

function iniciarCanvasAssinatura() {
  const canvas = document.getElementById("osSignCanvas");
  const wrap = document.getElementById("osSignWrap");
  if (!canvas) return;

  // Dimensiona canvas com DPR pra ficar nítido
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0a0a0a";

  OS.sign.canvas = canvas;
  OS.sign.ctx = ctx;
  OS.sign.hasInk = !!OS.data.assinatura_b64;

  // Se já tinha assinatura, restaura
  if (OS.data.assinatura_b64) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = OS.data.assinatura_b64;
    wrap.classList.add("has-signature");
  }

  const ptFromEvent = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e.changedTouches?.[0] || e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    OS.sign.drawing = true;
    const { x, y } = ptFromEvent(e);
    OS.sign.lastX = x; OS.sign.lastY = y;
  };
  const move = (e) => {
    if (!OS.sign.drawing) return;
    e.preventDefault();
    const { x, y } = ptFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(OS.sign.lastX, OS.sign.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    OS.sign.lastX = x; OS.sign.lastY = y;
    OS.sign.hasInk = true;
    wrap.classList.add("has-signature");
  };
  const end = () => {
    if (!OS.sign.drawing) return;
    OS.sign.drawing = false;
    if (OS.sign.hasInk) {
      const dataUrl = canvas.toDataURL("image/png");
      salvarOSDebounced({ assinatura_b64: dataUrl });
      avaliarRecebidoComplete();
    }
  };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove",  move,  { passive: false });
  canvas.addEventListener("touchend",   end);
}

function limparAssinatura() {
  const { canvas, ctx } = OS.sign;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  OS.sign.hasInk = false;
  document.getElementById("osSignWrap")?.classList.remove("has-signature");
  salvarOSDebounced({ assinatura_b64: null });
  avaliarRecebidoComplete();
}

// ---- Progresso geral ----
function atualizarProgresso() {
  const requiredSections = ["tipos", "resolucao", "recebido"];
  const completedRequired = requiredSections.filter((id) => {
    const sec = document.querySelector(`[data-section="${id}"]`);
    return sec?.classList.contains("is-complete");
  }).length;
  const allComplete = document.querySelectorAll(".os-section.is-complete").length;
  const total = 7; // 7 seções com lógica de completude (peças é opcional, não marca)

  const pct = Math.round((allComplete / total) * 100);
  const bar = document.getElementById("osProgressBar");
  if (bar) bar.style.width = `${Math.min(100, pct)}%`;
  const txt = document.getElementById("osProgressText");
  if (txt) txt.textContent = `${allComplete} de ${total} seções preenchidas`;

  // Habilita botão finalizar só com obrigatórios prontos
  const btn = document.getElementById("osFinalizar");
  if (btn) btn.disabled = completedRequired < requiredSections.length;
}

// ---- Finalizar ----
async function finalizarOS() {
  const btn = document.getElementById("osFinalizar");
  setBtnLoading(btn, true);
  hideAlert(document.getElementById("osAlert"));
  try {
    // Pede GPS pra saída
    const geo = await new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
        () => resolve(null), // GPS opcional na saída
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });

    if (IS_DEMO) {
      // Demo: simula sucesso, marca chamado como fechado na lista
      const ch = TC.chamados.find((c) => c.id === OS.chamadoId);
      if (ch) { ch.status = "fechado"; ch.fechado_em = new Date().toISOString(); }
      mostrarOSSucesso();
    } else {
      await api(`/ordens-servico/${OS.data.id}/finalizar`, {
        method: "POST",
        body: geo || {},
      });
      mostrarOSSucesso();
    }
  } catch (err) {
    showAlert(document.getElementById("osAlert"), err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

function mostrarOSSucesso() {
  pararTimerOS();
  document.getElementById("osSections").innerHTML = `
    <div class="td-card">
      <div class="td-card-body os-success">
        <div class="os-success-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="os-success-title">O.S. finalizada!</div>
        <div class="os-success-sub">Chamado fechado · ${OS.data.numero || ""}</div>
        <button class="btn btnAccent btn-lg" id="osVoltarLista">Voltar pra minha lista</button>
      </div>
    </div>`;
  document.querySelector(".os-shell .td-card").style.display = "none"; // some o timer
  document.querySelector(".td-cta-bar").style.display = "none";
  document.getElementById("osVoltarLista").addEventListener("click", () => {
    OS.data = null;
    document.querySelector(".td-cta-bar").style.display = "";
    showScreen("tecnico-chamados");
    if (!IS_DEMO) carregarMeusChamados(true);
    else renderTecnicoChamados();
  });
}

// Eventos da tela de O.S.
document.getElementById("osBack").addEventListener("click", sairFormularioOS);
document.getElementById("osFinalizar").addEventListener("click", finalizarOS);

// ============== BOOTSTRAP ==============
// Footer de diagnóstico no login
document.getElementById("apiBase").textContent = API_BASE;
document.getElementById("envInfo").textContent = IS_CAPACITOR ? "Capacitor (nativo)" : "Browser (dev)";

// ============== MODO DEMO ==============
// Abrir /app/?demo=1 (ou ?demo=tecnico) pula login e mostra a tela do técnico
// com dados fake. Útil pra preview de UI sem backend/banco. Não toca em
// nenhum endpoint real, não inicia polling. Pra sair do modo demo: /app/.
const IS_DEMO = new URLSearchParams(window.location.search).get("demo") != null;

function entrarModoDemo() {
  const fakeUser = {
    id: 999,
    nome: "João Silva",
    email: "joao.tecnico@demo.com",
    role: "tecnico",
  };
  TC.user = fakeUser;
  TC.chamados = chamadosFakeDemo();
  TC.syncedAt = new Date();
  // GPS simulado: Praça da Sé, SP — pra ordenação por proximidade funcionar
  TC.geo = { lat: -23.5505, lng: -46.6333, capturada_em: Date.now() };
  document.getElementById("tcUserName").textContent = `${fakeUser.nome} (demo)`;
  showScreen("tecnico-chamados");
  renderTecnicoChamados();
}

function chamadosFakeDemo() {
  const now = Date.now();
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  return [
    {
      id: 142, status: "em_atendimento", prioridade: "emergencia", categoria: "vazamento",
      titulo: "Vazamento no subsolo, bomba 2 desligou sozinha",
      condominio_nome: "Edifício Solaris",
      condominio_endereco: "Av. Paulista, 1578",
      condominio_bairro: "Bela Vista", condominio_cidade: "São Paulo",
      condominio_lat: -23.5613, condominio_lng: -46.6562,
      criado_em: new Date(now - 35 * min).toISOString(),
    },
    {
      id: 138, status: "aberto", prioridade: "alta", categoria: "bomba_falha",
      titulo: "Bomba 1 não liga após queda de energia",
      condominio_nome: "Residencial Jardim das Flores",
      condominio_endereco: "Rua Augusta, 920",
      condominio_bairro: "Consolação", condominio_cidade: "São Paulo",
      condominio_lat: -23.5478, condominio_lng: -46.6502,
      criado_em: new Date(now - 2 * hour).toISOString(),
    },
    {
      id: 134, status: "aberto", prioridade: "media", categoria: "nivel_baixo",
      titulo: "Reservatório principal baixou rápido durante a noite",
      condominio_nome: "Condomínio Vila Bella",
      condominio_endereco: "Rua Oscar Freire, 350",
      condominio_bairro: "Jardins", condominio_cidade: "São Paulo",
      condominio_lat: -23.5615, condominio_lng: -46.6716,
      criado_em: new Date(now - 5 * hour).toISOString(),
    },
    {
      id: 131, status: "aberto", prioridade: "media", categoria: "ruido",
      titulo: "Bomba fazendo barulho estranho desde ontem",
      condominio_nome: "Edifício Atrium",
      condominio_endereco: "Av. Brigadeiro Faria Lima, 2100",
      condominio_bairro: "Itaim Bibi", condominio_cidade: "São Paulo",
      condominio_lat: -23.5760, condominio_lng: -46.6916,
      criado_em: new Date(now - 8 * hour).toISOString(),
    },
    {
      id: 127, status: "aberto", prioridade: "baixa", categoria: "manutencao",
      titulo: "Preventiva mensal — março/26",
      condominio_nome: "Condomínio Aurora",
      condominio_endereco: "Rua Haddock Lobo, 595",
      condominio_bairro: "Cerqueira César", condominio_cidade: "São Paulo",
      condominio_lat: -23.5546, condominio_lng: -46.6620,
      criado_em: new Date(now - 1 * day).toISOString(),
    },
    {
      id: 122, status: "aberto", prioridade: "baixa", categoria: "outro",
      titulo: "Cliente solicitou orçamento de bomba reserva",
      condominio_nome: "Edifício Maranta",
      condominio_endereco: "Rua Bela Cintra, 1000",
      condominio_bairro: "Consolação", condominio_cidade: "São Paulo",
      condominio_lat: -23.5520, condominio_lng: -46.6530,
      criado_em: new Date(now - 36 * hour).toISOString(),
    },
    {
      id: 115, status: "fechado", prioridade: "alta", categoria: "bomba_falha",
      titulo: "Substituição de selo mecânico bomba 2",
      condominio_nome: "Residencial Pateo São Bento",
      condominio_endereco: "Rua Pamplona, 1620",
      condominio_bairro: "Jardim Paulista", condominio_cidade: "São Paulo",
      condominio_lat: -23.5701, condominio_lng: -46.6651,
      criado_em: new Date(now - 3 * day).toISOString(),
      fechado_em: new Date(now - 2 * day).toISOString(),
    },
    {
      id: 110, status: "fechado", prioridade: "emergencia", categoria: "sem_agua",
      titulo: "Sem água nos andares superiores",
      condominio_nome: "Edifício Mirante",
      condominio_endereco: "Av. Rebouças, 3970",
      condominio_bairro: "Pinheiros", condominio_cidade: "São Paulo",
      condominio_lat: -23.5739, condominio_lng: -46.6912,
      criado_em: new Date(now - 7 * day).toISOString(),
      fechado_em: new Date(now - 7 * day + 4 * hour).toISOString(),
    },
  ];
}

// Se tem token, tenta validar e ir direto pra home
(async () => {
  if (IS_DEMO) {
    entrarModoDemo();
    return;
  }
  const token = Storage.getToken();
  if (!token) {
    showScreen("login");
    return;
  }
  try {
    const user = await api("/auth/me");
    Storage.setUser(user);
    mostrarPosLogin(user);
  } catch {
    // 401 já limpou o storage no api()
    showScreen("login");
  }
})();
