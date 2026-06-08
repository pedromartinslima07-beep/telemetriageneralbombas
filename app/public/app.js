// General Bombas — App mobile (Capacitor)
// Fase 7B: login + OTP + home placeholder. Armazenamento via localStorage
// (será trocado por Capacitor Preferences quando empacotarmos pro Android).

// ============== CONFIG ==============
const API_BASE = (() => {
  const proto = window.location.protocol;
  const origin = window.location.origin;
  if (proto === "capacitor:" || proto === "file:" || origin === "https://localhost") {
    return window.GB_API_BASE || "https://telemetria.generalbombas.com";
  }
  return origin;
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
    if (typeof gpsStop === "function") gpsStop();
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
  // Banner de GPS só aparece em telas do técnico — reavalia ao trocar de tela.
  if (typeof gpsRenderAviso === "function") gpsRenderAviso();
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
  } else if (user.role === "cliente") {
    abrirTelaCliente(user);
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

const PRI_RANK = { p1: 0, p2: 1, p3: 2, p4: 3 };
const PRI_LABEL = { p1: "P1 Crítico", p2: "P2 Alta", p3: "P3 Controlado", p4: "P4 Agendado" };
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
  // Busca perfil completo (foto_url, especialidade) da tabela tecnicos
  api("/tecnicos/me").then(perfil => {
    TC.user = { ...TC.user, ...perfil };
    document.getElementById("tcUserName").textContent = TC.user.nome || "Técnico";
  }).catch(() => {});
  // Busca config operacional (frequência do GPS) — não bloqueia o resto.
  // Se falhar, GPS usa o default de 60s já hardcoded no módulo.
  aplicarConfigOperacional();
  // GPS fica ativo o tempo todo enquanto logado — o admin precisa saber
  // onde o técnico está para decidir designação por proximidade, não só
  // durante atendimento. Para no logout.
  gpsStart();
  // GPS rápido (one-shot) só pra ordenar a lista por proximidade
  pedirGPSOportunista();
}

// Aplica configurações operacionais vindas do backend (Fase 7I). Hoje
// só ajusta a frequência do GPS, mas é o ponto de entrada pra outras
// configs que o app vai consumir no futuro.
async function aplicarConfigOperacional() {
  if (IS_DEMO) return;
  try {
    const cfg = await api("/tecnicos/config");
    const freq = Number(cfg?.gps?.frequencia_segundos);
    if (Number.isFinite(freq) && freq >= 30 && freq <= 300) {
      const novoMs = freq * 1000;
      if (novoMs !== GPS.PING_MS) {
        GPS.PING_MS = novoMs;
        // Se o GPS já estava rodando com o pingTimer no valor antigo,
        // reabre o watch pra aplicar o novo intervalo imediatamente.
        if (GPS.active) {
          _gpsFecharWatch();
          _gpsAbrirWatch();
        }
      }
    }
  } catch (e) {
    console.warn("[cfg] tecnicos/config:", e.message);
  }
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

  // Footer do GPS espelha o estado real do watchPosition (não só a
  // existência de uma posição cacheada). Caso contrário, depois das 18h
  // o GPS desliga mas o footer continuaria mostrando "GPS ativo".
  const gpsOn = typeof gpsAtivo === "function" && gpsAtivo();
  const dentroJanela = typeof gpsDentroDoHorario === "function" ? gpsDentroDoHorario() : true;

  if (gpsOn && TC.geo) {
    const idade = Math.floor((Date.now() - TC.geo.capturada_em) / 60000);
    elGps.classList.add("tec-footer-gps-on");
    elGps.querySelector("span").textContent = idade < 1 ? "GPS ativo" : `GPS · há ${idade}m`;
  } else if (GPS.scheduled && !dentroJanela) {
    elGps.classList.remove("tec-footer-gps-on");
    elGps.querySelector("span").textContent = "Fora do expediente";
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
    c.prioridade === "p1" && c.status !== "fechado").length;
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
  gpsStop();
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
  mensagens: [],      // thread cliente ↔ técnico (Fase 7H — UI no técnico)
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
    // Thread em paralelo — tolera falha sem derrubar a tela.
    // Em chamados fechados a thread some pra dar lugar à avaliação no app
    // do cliente; aqui no técnico não temos esse equivalente, então só
    // pula o fetch pra economizar bandwidth.
    if (TD.chamado.status !== "fechado") {
      try {
        TD.mensagens = await api(`/chamados/meus/${id}/mensagens`);
      } catch (e) {
        console.warn("[td] mensagens:", e.message);
        TD.mensagens = [];
      }
    } else {
      TD.mensagens = [];
    }
    // Se o técnico voltou pro app com atendimento em andamento (refresh, app
    // fechado e reaberto), liga o GPS automaticamente.
    if (TD.chamado.status === "em_atendimento") gpsStart(TD.chamado.id);
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
    ${c.status !== "fechado" ? tdRenderMensagensCard() : ""}
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

  // Thread de mensagens (Fase 7H — UI no técnico)
  if (c.status !== "fechado") tdBindMensagensForm();
}

// =====================================================================
// MENSAGENS — thread cliente ↔ técnico (Fase 7H, UI do técnico)
// Reusa as classes CSS .cli-msg-* já existentes (mesmo visual do app
// do cliente). IDs com prefixo `tdMsg` pra não conflitar com o card do
// cliente (eles nunca renderizam simultaneamente, mas mantém limpo).
// =====================================================================

let _tdEnviandoMsg = false;
let _tdFotoMsgPending = null; // data URL aguardando envio

function tdRenderMensagensCard() {
  const svgChat = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  return `
    <section class="card tec-card cli-msg-card">
      <div class="cardHead">
        <h2>${svgChat}Mensagens do cliente</h2>
        <span class="hint" id="tdMsgCount">${TD.mensagens.length} ${TD.mensagens.length === 1 ? "mensagem" : "mensagens"}</span>
      </div>
      <div class="cli-msg-list" id="tdMsgList">
        ${tdRenderMensagensList()}
      </div>
      <form id="tdMsgForm" class="cli-msg-composer" novalidate>
        <div class="cli-msg-preview" id="tdMsgPreview" hidden></div>
        <div class="cli-msg-input-row">
          <label class="cli-msg-photo-btn" for="tdMsgFoto" aria-label="Anexar foto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <input type="file" id="tdMsgFoto" accept="image/*" hidden>
          </label>
          <textarea class="input cli-msg-input" id="tdMsgTexto" rows="1" maxlength="2000"
            placeholder="Responder ao cliente…"></textarea>
          <button type="submit" class="cli-msg-send" id="tdMsgSend" aria-label="Enviar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="alert error" id="tdMsgAlert" hidden></div>
      </form>
    </section>`;
}

function tdRenderMensagensList() {
  if (TD.mensagens.length === 0) {
    return `<div class="cli-empty-section" style="padding:18px 16px">
      Nenhuma mensagem ainda. Use o campo abaixo para responder ao cliente.
    </div>`;
  }
  return TD.mensagens.map(tdRenderMensagemItem).join("");
}

function tdRenderMensagemItem(m) {
  // "Minha" = mensagem do técnico logado (autor_id bate com TC.user.id)
  const mine = m.autor_id && TC.user?.id === m.autor_id;
  const role = m.autor_role || (mine ? "tecnico" : "cliente");
  const lado = mine ? "is-mine" : "is-other";
  const nome = m.autor_nome || (role === "cliente" ? "Cliente" : role === "admin" ? "Atendimento" : "Você");
  const fotoHtml = m.foto_url
    ? `<a class="cli-msg-photo" href="${escapeHtml(_apiUrl(m.foto_url))}" target="_blank" rel="noopener">
         <img src="${escapeHtml(_apiUrl(m.foto_url))}" alt="foto" loading="lazy">
       </a>`
    : "";
  const textoHtml = m.texto ? `<div class="cli-msg-text">${escapeHtml(m.texto)}</div>` : "";
  return `
    <div class="cli-msg-item ${lado}" data-role="${escapeHtml(role)}">
      <div class="cli-msg-bubble">
        <div class="cli-msg-header">
          <span class="cli-msg-author">${escapeHtml(nome)}</span>
          <span class="cli-msg-time">${fmtDataCli(m.criado_em)}</span>
        </div>
        ${fotoHtml}
        ${textoHtml}
      </div>
    </div>`;
}

function tdBindMensagensForm() {
  const form = document.getElementById("tdMsgForm");
  if (!form) return;

  const inputFoto = document.getElementById("tdMsgFoto");
  inputFoto?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      _tdFotoMsgPending = await comprimirFoto(f, 1280, 0.78);
      _tdAtualizarPreviewFotoMsg();
    } catch (err) {
      console.error(err);
      alert("Não foi possível processar a imagem.");
    } finally {
      inputFoto.value = "";
    }
  });

  const ta = document.getElementById("tdMsgTexto");
  ta?.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    tdEnviarMensagem();
  });
}

function _tdAtualizarPreviewFotoMsg() {
  const el = document.getElementById("tdMsgPreview");
  if (!el) return;
  if (!_tdFotoMsgPending) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <img src="${_tdFotoMsgPending}" alt="prévia">
    <button type="button" class="cli-msg-preview-x" id="tdMsgPreviewX" aria-label="Remover foto">×</button>`;
  document.getElementById("tdMsgPreviewX")?.addEventListener("click", () => {
    _tdFotoMsgPending = null;
    _tdAtualizarPreviewFotoMsg();
  });
}

async function tdEnviarMensagem() {
  if (_tdEnviandoMsg) return;
  const ta = document.getElementById("tdMsgTexto");
  const alertEl = document.getElementById("tdMsgAlert");
  const sendBtn = document.getElementById("tdMsgSend");
  const texto = (ta?.value || "").trim();

  hideAlert(alertEl);
  if (!texto && !_tdFotoMsgPending) {
    showAlert(alertEl, "Escreva algo ou anexe uma foto.", "error");
    return;
  }

  if (IS_DEMO) {
    TD.mensagens.push({
      id: Date.now(), texto: texto || null,
      foto_url: _tdFotoMsgPending || null,
      criado_em: new Date().toISOString(),
      autor_id: TC.user?.id, autor_nome: TC.user?.nome || "Você",
      autor_role: "tecnico",
    });
    ta.value = ""; ta.style.height = "auto";
    _tdFotoMsgPending = null; _tdAtualizarPreviewFotoMsg();
    _tdAtualizarMensagensList();
    return;
  }

  _tdEnviandoMsg = true;
  sendBtn.disabled = true;
  try {
    const novo = await api(`/chamados/meus/${TD.chamado.id}/mensagens`, {
      method: "POST",
      body: { texto: texto || null, foto_base64: _tdFotoMsgPending || null },
    });
    TD.mensagens.push(novo);
    ta.value = ""; ta.style.height = "auto";
    _tdFotoMsgPending = null; _tdAtualizarPreviewFotoMsg();
    _tdAtualizarMensagensList();
  } catch (err) {
    showAlert(alertEl, err.message, "error");
  } finally {
    _tdEnviandoMsg = false;
    sendBtn.disabled = false;
  }
}

function _tdAtualizarMensagensList() {
  const list = document.getElementById("tdMsgList");
  if (list) {
    list.innerHTML = tdRenderMensagensList();
    list.scrollTop = list.scrollHeight;
  }
  const count = document.getElementById("tdMsgCount");
  if (count) count.textContent =
    `${TD.mensagens.length} ${TD.mensagens.length === 1 ? "mensagem" : "mensagens"}`;
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

  // Remove botão secundário anterior se existir
  const secExist = document.getElementById("tdCtaBtnSec");
  if (secExist) secExist.remove();

  if (c.status === "aberto") {
    if (!c.tecnico_a_caminho_em) {
      // Fase 1: ainda não saiu → "A caminho"
      lbl.textContent = "A caminho";
      btn.className = "btn btn-lg";
      btn.style.background = "rgba(74,120,247,.2)";
      btn.style.borderColor = "rgba(74,120,247,.5)";
      btn.style.color = "#93c5fd";
      btn.onclick = () => registrarACaminho(c.id);
    } else if (!c.tecnico_chegou_em) {
      // Fase 2: a caminho → "Chegou"
      lbl.textContent = "Chegou ao local";
      btn.className = "btn btnAccent btn-lg";
      btn.style = "";
      btn.onclick = () => registrarChegou(c.id);
    } else {
      // Fase 3: chegou → iniciar atendimento
      lbl.textContent = "Iniciar atendimento";
      btn.className = "btn btnAccent btn-lg";
      btn.style = "";
      btn.onclick = () => iniciarAtendimento(c.id);
    }
  } else if (c.status === "em_atendimento") {
    lbl.textContent = "Preencher Ordem de Serviço";
    btn.className = "btn btnAccent btn-lg";
    btn.style = "";
    btn.onclick = () => abrirFormularioOS(c.id, c.ordem_servico?.id);
    // Se ainda não registrou chegada, mostra botão secundário
    if (!c.tecnico_chegou_em) {
      const sec = document.createElement("button");
      sec.id = "tdCtaBtnSec";
      sec.className = "btn btn-lg";
      sec.style.cssText = "font-size:12px;margin-top:6px;width:100%;background:rgba(240,176,20,.1);border-color:rgba(240,176,20,.3);color:var(--accent);";
      sec.textContent = "Registrar chegada (SLA)";
      sec.onclick = () => registrarChegou(c.id);
      bar.appendChild(sec);
    }
  }
}

async function registrarACaminho(id) {
  const btn = document.getElementById("tdCtaBtn");
  setBtnLoading(btn, true);
  try {
    if (!IS_DEMO) await api(`/chamados/${id}/a-caminho`, { method: "POST" });
    TD.chamado.tecnico_a_caminho_em = new Date().toISOString();
    renderDetalhe();
  } catch (err) {
    showAlert(document.getElementById("tdAlert"), err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

async function registrarChegou(id) {
  const btn = document.getElementById("tdCtaBtn");
  setBtnLoading(btn, true);
  try {
    if (!IS_DEMO) await api(`/chamados/${id}/chegou`, { method: "POST" });
    TD.chamado.tecnico_chegou_em    = new Date().toISOString();
    TD.chamado.tecnico_a_caminho_em = TD.chamado.tecnico_a_caminho_em || new Date().toISOString();
    renderDetalhe();
  } catch (err) {
    showAlert(document.getElementById("tdAlert"), err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

async function iniciarAtendimento(id) {
  const btn = document.getElementById("tdCtaBtn");
  setBtnLoading(btn, true);
  hideAlert(document.getElementById("tdAlert"));

  try {
    // Usa posição recente do watchPosition se tiver < 60s; evita timeout do getCurrentPosition
    const geo = await (async () => {
      if (GPS.last && (Date.now() - GPS.last.ts) < 60000) {
        return { lat: GPS.last.lat, lng: GPS.last.lng, precisao_m: GPS.last.precisao_m };
      }
      if (!navigator.geolocation) throw new Error("GPS indisponível");
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisao_m: pos.coords.accuracy,
          }),
          (err) => {
            // Timeout ou sinal fraco: aceita posição em cache se existir, mesmo velha
            if (GPS.last) {
              resolve({ lat: GPS.last.lat, lng: GPS.last.lng, precisao_m: GPS.last.precisao_m });
            } else {
              reject(new Error("Não foi possível obter GPS: " + err.message));
            }
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
      });
    })();

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

    gpsStart(id);
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

// ============== GPS TRACKING (Fase 7F) ==============
// Liga `watchPosition` assim que o técnico faz login e mantém rodando
// até o logout — o admin precisa enxergar o técnico no mapa o tempo
// todo (não só durante atendimento) pra decidir designação por
// proximidade. `chamadoId` é opcional, só registrado pra contexto.
// No web, watchPosition pausa quando a tela apaga / app vai pra
// background — quando empacotar com Capacitor, troca pelo plugin
// `@capacitor-community/background-geolocation` mantendo essa API.
// Janela de operação: o GPS só envia pings entre 08:00 e 18:00 (horário
// local do dispositivo). Fora desse intervalo o watchPosition fica
// desligado (poupa bateria + privacidade do técnico). Um timer de 60s
// reavalia a janela e religa/desliga sem precisar de logout.
const GPS_HORA_INI = 8;
const GPS_HORA_FIM = 18;

const GPS = {
  watchId: null,
  pingTimer: null,
  last: null,             // { lat, lng, precisao_m, ts }
  lastSentTs: 0,
  active: false,          // watchPosition realmente rodando
  scheduled: false,       // técnico está logado e quer rastreio (mas pode estar fora do horário)
  horarioTimer: null,     // setInterval que reavalia a janela 8h–18h
  chamadoId: null,
  lastError: null,        // code do PositionError ou "no_api" / "no_secure_context"
  battery: null,          // BatteryManager cacheado
  PING_MS: 60 * 1000,
};

function gpsAtivo() { return GPS.active; }

function gpsDentroDoHorario() {
  const h = new Date().getHours();
  return h >= GPS_HORA_INI && h < GPS_HORA_FIM;
}

function gpsStart(chamadoId = null) {
  if (IS_DEMO) return; // demo não rastreia

  GPS.scheduled = true;
  GPS.chamadoId = chamadoId;

  // Liga o timer que policia a janela 8h–18h (idempotente)
  if (!GPS.horarioTimer) {
    GPS.horarioTimer = setInterval(_gpsAplicarJanela, 60 * 1000);
  }
  _gpsAplicarJanela();
}

function gpsStop() {
  GPS.scheduled = false;
  GPS.chamadoId = null;
  if (GPS.horarioTimer) clearInterval(GPS.horarioTimer);
  GPS.horarioTimer = null;
  _gpsFecharWatch();
  GPS.lastError = null;
  gpsRenderChip();
  gpsRenderAviso();
  // Avisa o servidor para remover o marcador do mapa imediatamente.
  // Fire-and-forget: logout não deve esperar resposta de rede.
  api("/tecnicos/localizacao", { method: "DELETE" }).catch(() => {});
}

// Avalia a janela de operação e abre/fecha o watchPosition conforme.
// Idempotente — chamado tanto no gpsStart inicial quanto pelo horarioTimer.
function _gpsAplicarJanela() {
  if (!GPS.scheduled) return;
  const dentro = gpsDentroDoHorario();
  if (dentro && !GPS.active) {
    _gpsAbrirWatch();
  } else if (!dentro && GPS.active) {
    _gpsFecharWatch();
  }
  gpsRenderChip();
}

function _gpsAbrirWatch() {
  // Geolocation só funciona em https/localhost. Em produção sem TLS o navegador
  // bloqueia silenciosamente — avisa o usuário.
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    GPS.lastError = "no_secure_context";
    gpsRenderAviso();
    return;
  }
  if (!navigator.geolocation) {
    GPS.lastError = "no_api";
    gpsRenderAviso();
    console.warn("[gps] geolocation indisponível");
    return;
  }

  GPS.active = true;
  GPS.lastError = null;

  // Tenta abrir o BatteryManager (não suportado em iOS Safari — null-safe abaixo).
  if (!GPS.battery && navigator.getBattery) {
    navigator.getBattery().then((bm) => { GPS.battery = bm; }).catch(() => {});
  }

  GPS.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      GPS.lastError = null;
      const acc = pos.coords.accuracy;
      // Descarta geolocalização por IP puro (>15 km) — imprecisa demais pro mapa.
      if (acc > 15000) {
        console.warn("[gps] descartado (IP-based):", Math.round(acc), "m");
        GPS.lastError = "low_accuracy";
        gpsRenderAviso();
        return;
      }
      GPS.lastError = null;
      // Só atualiza GPS.last se a nova posição for melhor OU a anterior tiver
      // mais de 90 s (evita sumir em área sem GPS).
      const anterior = GPS.last;
      const maisRecente = !anterior || (Date.now() - anterior.ts) > 90000;
      const maisExata   = !anterior || acc < anterior.precisao_m;
      if (maisRecente || maisExata) {
        GPS.last = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao_m: acc,
          ts: Date.now(),
        };
        TC.geo = { lat: GPS.last.lat, lng: GPS.last.lng, capturada_em: GPS.last.ts };
      }
      gpsRenderAviso();
      const agora = Date.now();
      if (agora - GPS.lastSentTs >= GPS.PING_MS) gpsEnviar();
    },
    (err) => {
      // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
      GPS.lastError = err.code;
      console.warn("[gps] watch error:", err.code, err.message);
      gpsRenderAviso();
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 }
  );
  // Fallback: garante envio a cada PING_MS mesmo se watchPosition demorar
  GPS.pingTimer = setInterval(() => {
    if (gpsAtivo() && GPS.last) gpsEnviar();
  }, GPS.PING_MS);
}

function _gpsFecharWatch() {
  if (GPS.watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(GPS.watchId);
  }
  if (GPS.pingTimer) clearInterval(GPS.pingTimer);
  GPS.watchId = null;
  GPS.pingTimer = null;
  GPS.active = false;
  GPS.last = null;
  GPS.lastSentTs = 0;
}

async function gpsEnviar() {
  if (!gpsAtivo() || !GPS.last) return;
  GPS.lastSentTs = Date.now();
  const batPct = (GPS.battery && Number.isFinite(GPS.battery.level))
    ? Math.round(GPS.battery.level * 100)
    : null;
  try {
    await api("/tecnicos/localizacao", {
      method: "POST",
      body: {
        lat: GPS.last.lat,
        lng: GPS.last.lng,
        precisao_m: GPS.last.precisao_m,
        bateria_pct: batPct,
        capturada_em: new Date(GPS.last.ts).toISOString(),
      },
    });
  } catch (err) {
    // Silencioso — falha de ping não atrapalha o atendimento.
    console.warn("[gps] ping falhou:", err.message);
  }
}

function gpsRenderChip() {
  let chip = document.getElementById("gpsChip");
  // Sem usuário logado pedindo rastreio → some
  if (!GPS.scheduled) {
    if (chip) chip.hidden = true;
    return;
  }
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "gpsChip";
    chip.className = "gps-chip";
    document.body.appendChild(chip);
  }
  if (GPS.active && GPS.lastError === "low_accuracy") {
    chip.title = "GPS ativo mas sinal fraco demais para o mapa";
    chip.classList.add("gps-chip-paused");
    chip.innerHTML = `<span class="gps-dot"></span><span class="gps-text">Sinal fraco</span>`;
  } else if (GPS.active) {
    chip.title = "Localização ativa";
    chip.classList.remove("gps-chip-paused");
    chip.innerHTML = `<span class="gps-dot"></span><span class="gps-text">GPS ativo</span>`;
  } else {
    // Agendado mas fora da janela 8h–18h
    chip.title = `GPS opera apenas das ${String(GPS_HORA_INI).padStart(2,"0")}:00 às ${String(GPS_HORA_FIM).padStart(2,"0")}:00`;
    chip.classList.add("gps-chip-paused");
    chip.innerHTML = `<span class="gps-dot"></span><span class="gps-text">Fora do expediente</span>`;
  }
  chip.hidden = false;
}

// Banner persistente quando o GPS está indisponível ou negado. Some
// automaticamente quando o watch volta a receber posição.
function gpsRenderAviso() {
  let aviso = document.getElementById("gpsAviso");
  const err = GPS.lastError;

  // Só mostra o aviso pro técnico autenticado, não no login/demo/cliente
  const visivelSomenteNoTecnico =
    !!document.querySelector('[data-screen^="tecnico"][data-active]');

  if (!err || !visivelSomenteNoTecnico) {
    if (aviso) aviso.hidden = true;
    return;
  }

  let msg, cta;
  if (err === "low_accuracy") {
    msg = "GPS com precisão baixa demais (sinal por IP). Ative o GPS do celular e vá para um local ao ar livre.";
    cta = "Tentar novamente";
  } else if (err === 1) { // PERMISSION_DENIED
    msg = "Permissão de localização negada. O escritório não consegue te localizar.";
    cta = "Permitir GPS";
  } else if (err === 2) { // POSITION_UNAVAILABLE
    msg = "Sinal de GPS indisponível. Verifique se o GPS do celular está ligado.";
    cta = "Tentar novamente";
  } else if (err === 3) { // TIMEOUT
    msg = "GPS demorando pra responder. Tente novamente ao ar livre.";
    cta = "Tentar novamente";
  } else if (err === "no_secure_context") {
    msg = "Este endereço não está em HTTPS — o navegador bloqueia o GPS.";
    cta = null;
  } else {
    msg = "Localização indisponível neste dispositivo.";
    cta = null;
  }

  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "gpsAviso";
    aviso.className = "gps-aviso";
    aviso.setAttribute("role", "alert");
    document.body.appendChild(aviso);
  }
  aviso.hidden = false;
  aviso.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span class="gps-aviso-msg">${escapeHtml(msg)}</span>
    ${cta ? `<button class="gps-aviso-cta" id="gpsAvisoBtn">${escapeHtml(cta)}</button>` : ""}`;

  document.getElementById("gpsAvisoBtn")?.addEventListener("click", () => {
    // Re-tenta — chamada nova de getCurrentPosition vai disparar o prompt
    // se a permissão estiver em "prompt", ou falhar imediatamente se "denied"
    // (nesse caso o usuário precisa habilitar manualmente nas configs do navegador).
    navigator.geolocation?.getCurrentPosition(
      () => {
        // Sucesso: reinicia o watch
        gpsStop();
        gpsStart(GPS.chamadoId);
      },
      (err) => {
        GPS.lastError = err.code;
        gpsRenderAviso();
        if (err.code === 1) {
          // Já estava negado — abre uma dica sobre como reabrir no navegador
          alert("Permissão negada nas configurações do navegador.\n\n" +
            "Para reativar: toque no cadeado/ícone ao lado do endereço " +
            "→ Permissões → Localização → Permitir, e recarregue a página.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

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
    sectionOrcamento(),
    sectionResolucao(),
    sectionRecebidoAssinatura(),
  ];
  wrap.innerHTML = sections.join("");

  // Bind: clique no head abre/fecha
  wrap.querySelectorAll(".os-section-head").forEach((head) => {
    head.addEventListener("click", () => {
      const sec = head.parentElement;
      const wasOpen = sec.classList.contains("is-open");
      sec.classList.toggle("is-open");
      // Canvas da assinatura precisa de dimensões reais — só disponíveis quando a seção está visível
      if (!wasOpen && sec.dataset.section === "recebido") {
        requestAnimationFrame(() => iniciarCanvasAssinatura());
      }
    });
  });

  // Bind: handlers por seção
  bindTipos();
  bindEquipamentos();
  bindCorrentes();
  bindFotos();
  bindPecas();
  bindObservacoes();
  bindOrcamento();
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

  const wrap = document.getElementById("osPecas");
  if (!wrap) return;

  // Excluir
  wrap.addEventListener("click", async (e) => {
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

  // Edição inline: PATCH /pecas/:id debounced (600ms, igual aos outros campos)
  wrap.addEventListener("input", (e) => {
    const input = e.target.closest(".os-peca [data-f]");
    if (!input) return;
    const row = input.closest(".os-peca");
    const pecaId = Number(row.dataset.pecaId);
    const field = input.dataset.f; // "descricao" | "quantidade"

    let valor = input.value;
    if (field === "quantidade") {
      const q = Number(valor);
      if (!Number.isInteger(q) || q <= 0) return; // ignora valor inválido até virar válido
      valor = q;
    } else if (field === "descricao") {
      // permite digitar livre; só não envia se ficar vazio (servidor rejeita)
      if (!String(valor).trim()) return;
    }

    // aplica localmente pro feedback instantâneo
    const p = OS.data.pecas.find((x) => x.id === pecaId);
    if (p) p[field] = valor;

    if (IS_DEMO) return;

    OS.pecaDebounce = OS.pecaDebounce || new Map();
    const key = `${pecaId}:${field}`;
    if (OS.pecaDebounce.has(key)) clearTimeout(OS.pecaDebounce.get(key));
    OS.pecaDebounce.set(
      key,
      setTimeout(async () => {
        try {
          await api(`/ordens-servico/${OS.data.id}/pecas/${pecaId}`, {
            method: "PATCH",
            body: { [field]: valor },
          });
        } catch (err) {
          console.warn("[os] auto-save peça falhou:", err.message);
          showAlert(document.getElementById("osAlert"),
            "Não foi possível salvar a peça: " + err.message, "error");
        }
      }, 600)
    );
  });
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

// ---- Seção 7: Orçamento (opcional) ----
function sectionOrcamento() {
  const need = !!OS.data.orcamento_necessario;
  const obs = OS.data.orcamento_observacoes || "";
  return sectionTemplate({
    id: "orcamento",
    title: "Orçamento",
    subtitle: need
      ? (obs ? `Sim — ${obs.length} caracteres` : "Sim — sem observações")
      : "Opcional",
    required: false,
    complete: false,
    body: `
      <label class="os-switch-row">
        <span class="os-switch-label">Necessário orçamento?</span>
        <span class="os-switch">
          <input type="checkbox" id="osOrcNeed" ${need ? "checked" : ""}>
          <span class="os-switch-slider"></span>
        </span>
      </label>
      <div id="osOrcBox" ${need ? "" : "hidden"} style="margin-top:10px">
        <div class="os-corrente-label" style="text-align:left;margin-bottom:6px">
          Explique o que encontrou e o que precisa de orçamento
        </div>
        <textarea class="os-textarea" id="osOrcObs" maxlength="4000"
          placeholder="Ex: bomba 1 com vedação danificada, precisa trocar pressostato e selo mecânico. Sugiro substituição completa. Tempo estimado 4h.">${escapeHtml(obs)}</textarea>
      </div>`,
  });
}
function bindOrcamento() {
  const toggle = document.getElementById("osOrcNeed");
  const box = document.getElementById("osOrcBox");
  const ta = document.getElementById("osOrcObs");
  if (!toggle) return;

  function atualizarSubtitle() {
    const sec = document.querySelector('[data-section="orcamento"]');
    const sub = sec.querySelector(".os-section-title small");
    if (!sub) return;
    if (!toggle.checked) sub.textContent = "Opcional";
    else if (ta && ta.value) sub.textContent = `Sim — ${ta.value.length} caracteres`;
    else sub.textContent = "Sim — sem observações";
  }

  toggle.addEventListener("change", () => {
    if (box) box.hidden = !toggle.checked;
    salvarOSDebounced({
      orcamento_necessario: toggle.checked,
      // limpa observações ao desmarcar
      ...(toggle.checked ? {} : { orcamento_observacoes: null }),
    });
    if (!toggle.checked && ta) ta.value = "";
    atualizarSubtitle();
  });

  ta?.addEventListener("input", () => {
    salvarOSDebounced({ orcamento_observacoes: ta.value });
    atualizarSubtitle();
  });
}

// ---- Seção 8: Resolução ----
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
        <button type="button" class="os-sign-expand" id="osSignExpand">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          Tela cheia
        </button>
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

  // Canvas: vincula eventos uma vez; dimensionamento ocorre ao abrir a seção
  bindCanvasAssinatura();
  document.getElementById("osSignClear")?.addEventListener("click", limparAssinatura);
  document.getElementById("osSignExpand")?.addEventListener("click", abrirAssinaturaFullscreen);
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

// Dimensiona o canvas e restaura assinatura salva. Seguro chamar várias vezes (sem listeners).
function iniciarCanvasAssinatura() {
  const canvas = document.getElementById("osSignCanvas");
  const wrap = document.getElementById("osSignWrap");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return; // seção ainda fechada — será chamado novamente ao abrir

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

  if (OS.data.assinatura_b64) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = OS.data.assinatura_b64;
    wrap?.classList.add("has-signature");
  }
}

// Vincula eventos de desenho ao canvas — chamado UMA vez em bindRecebidoAssinatura.
function bindCanvasAssinatura() {
  const canvas = document.getElementById("osSignCanvas");
  const wrap = document.getElementById("osSignWrap");
  if (!canvas) return;

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
    const ctx = OS.sign.ctx;
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(OS.sign.lastX, OS.sign.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    OS.sign.lastX = x; OS.sign.lastY = y;
    OS.sign.hasInk = true;
    wrap?.classList.add("has-signature");
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

async function abrirAssinaturaFullscreen() {
  const overlay = document.createElement("div");
  overlay.className = "sign-fs-overlay";

  const jaTemAssinatura = OS.sign.hasInk || !!OS.data.assinatura_b64;

  overlay.innerHTML = `
    <div class="sign-fs-bar">
      <span class="sign-fs-title">Assinatura</span>
      <div class="sign-fs-actions">
        <button class="btn btn-sm" id="signFsClear">Limpar</button>
        <button class="btn btn-sm" id="signFsCancel">Cancelar</button>
        <button class="btn btn-sm btnAccent" id="signFsConfirm">✓ Confirmar</button>
      </div>
    </div>
    <div class="sign-fs-canvas-wrap${jaTemAssinatura ? " has-ink" : ""}" id="signFsWrap">
      <canvas id="signFsCanvas" class="sign-fs-canvas"></canvas>
      <div class="sign-fs-hint">Assine aqui com o dedo</div>
      <div class="sign-fs-rotate-msg" id="signFsRotateMsg">
        <svg class="sign-fs-rotate-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="4" width="18" height="30" rx="3" stroke="currentColor" stroke-width="2.5"/>
          <circle cx="19" cy="30" r="1.5" fill="currentColor"/>
          <path d="M32 10 A13 13 0 0 1 32 36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <polyline points="29,33 32,36 35,33" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Vire o celular para o lado</span>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const canvas    = overlay.querySelector("#signFsCanvas");
  const wrap      = overlay.querySelector("#signFsWrap");
  const rotateMsg = overlay.querySelector("#signFsRotateMsg");

  let ctx     = null;
  let drawing = false, lastX = 0, lastY = 0, hasInk = jaTemAssinatura;
  const cleanups = [];

  function iniciarCtx() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width  * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.lineWidth   = 2.5;
    ctx.strokeStyle = "#0a0a0a";
    if (OS.data.assinatura_b64) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = OS.data.assinatura_b64;
    }
  }

  // Tenta travar em landscape — aguarda a rotação completar antes de inicializar o canvas
  let travado = false;
  try {
    await screen.orientation.lock("landscape");
    travado = true;
  } catch (_) {}

  if (travado) {
    // Android/PWA: aguarda o layout estabilizar após a rotação
    await new Promise(r => requestAnimationFrame(r));
    rotateMsg.style.display = "none";
    iniciarCtx();
  } else {
    // iOS: não conseguiu travar — detecta orientação e espera o usuário girar
    const verificar = () => {
      const landscape = window.innerWidth > window.innerHeight;
      rotateMsg.style.display = landscape ? "none" : "flex";
      if (landscape && !ctx) requestAnimationFrame(() => requestAnimationFrame(iniciarCtx));
    };
    verificar();
    window.addEventListener("resize", verificar);
    cleanups.push(() => window.removeEventListener("resize", verificar));
  }

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e.changedTouches?.[0] || e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e) => {
    if (!ctx) return;
    e.preventDefault();
    drawing = true;
    const p = pt(e); lastX = p.x; lastY = p.y;
  };
  const move = (e) => {
    if (!drawing || !ctx) return;
    e.preventDefault();
    const p = pt(e);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
    hasInk = true;
    wrap.classList.add("has-ink");
  };
  const stop = () => { drawing = false; };

  canvas.addEventListener("mousedown",  start);
  canvas.addEventListener("mousemove",  move);
  canvas.addEventListener("mouseup",    stop);
  canvas.addEventListener("mouseleave", stop);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove",  move,  { passive: false });
  canvas.addEventListener("touchend",   stop);

  function _fechar() {
    cleanups.forEach(fn => fn());
    try { screen.orientation?.unlock?.(); } catch (_) {}
    overlay.remove();
  }

  overlay.querySelector("#signFsClear").addEventListener("click", () => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    wrap.classList.remove("has-ink");
  });

  overlay.querySelector("#signFsCancel").addEventListener("click", _fechar);

  overlay.querySelector("#signFsConfirm").addEventListener("click", () => {
    if (hasInk && ctx) {
      const dataUrl = canvas.toDataURL("image/png");
      OS.data.assinatura_b64 = dataUrl;
      OS.sign.hasInk = true;
      document.getElementById("osSignWrap")?.classList.add("has-signature");
      iniciarCanvasAssinatura();
      salvarOSDebounced({ assinatura_b64: dataUrl });
      avaliarRecebidoComplete();
    }
    _fechar();
  });
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
    // Pré-validação: fotos obrigatórias quando tipo é instalacao_pecas
    // ou chamado_emergencial (backend valida de novo, mas damos feedback rápido).
    const tipos = OS.data.tipos_servico || [];
    const exigeFoto = tipos.includes("instalacao_pecas") || tipos.includes("chamado_emergencial");
    const temFoto = Array.isArray(OS.data.fotos) && OS.data.fotos.length > 0;
    if (exigeFoto && !temFoto) {
      throw new Error("Anexe pelo menos 1 foto antes de finalizar. Os tipos selecionados (Instalação de peças / Chamado emergencial) exigem foto.");
    }

    // GPS de saída: usa posição recente do watch se disponível (opcional — não bloqueia)
    const geo = (() => {
      if (GPS.last && (Date.now() - GPS.last.ts) < 120000) {
        return { lat: GPS.last.lat, lng: GPS.last.lng };
      }
      return null;
    })();

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
  // GPS continua ativo após o atendimento — só para no logout (o admin
  // precisa ver o técnico se deslocando entre chamados, não só durante).
  const osId = OS.data.id;
  const numero = OS.data.numero || "";
  document.getElementById("osSections").innerHTML = `
    <div class="td-card">
      <div class="td-card-body os-success">
        <div class="os-success-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="os-success-title">O.S. finalizada!</div>
        <div class="os-success-sub">Chamado fechado · ${numero}</div>
        ${IS_DEMO ? "" : `<button class="btn btn-lg" id="osBaixarPdf">📄 Baixar PDF</button>`}
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
  document.getElementById("osBaixarPdf")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    setBtnLoading(btn, true);
    try {
      await baixarPdfOS(osId, numero);
    } catch (err) {
      showAlert(document.getElementById("osAlert"), err.message, "error");
    } finally {
      setBtnLoading(btn, false);
    }
  });
}

// Baixa o PDF da O.S. — fetch com Authorization, blob → trigger download.
// On-demand: o GET pode demorar uns segundos se o background ainda não gerou.
async function baixarPdfOS(osId, numero) {
  const token = Storage.getToken();
  const r = await fetch(`${API_BASE}/ordens-servico/${osId}/pdf`, {
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
  });
  if (r.status === 401) {
    gpsStop();
    Storage.clear();
    showScreen("login");
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!r.ok) {
    let msg = `Erro HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `os-${numero || osId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Eventos da tela de O.S.
document.getElementById("osBack").addEventListener("click", sairFormularioOS);
document.getElementById("osFinalizar").addEventListener("click", finalizarOS);

// ============== CLIENTE — App do síndico / morador (Fase 7H) ==============
const CLI = {
  user: null,
  condominio: null,
  reservatorios: [],
  alertas: [],
  chamados: [],
  polling: null,
  detalheId: null,
  detalhe: null,        // chamado aberto na tela de detalhe (com avaliação)
  detalheMsgs: [],      // thread de mensagens do detalhe
  statusCarregado: false, // vira true após primeira resposta de /cliente/status
};

const CLI_CATEGORIAS = [
  ["sem_agua",     "Falta de água"],
  ["vazamento",    "Vazamento"],
  ["nivel_baixo",  "Nível baixo do reservatório"],
  ["bomba_falha",  "Problema com bomba"],
  ["ruido",        "Ruído anormal"],
  ["manutencao",   "Manutenção / vistoria"],
  ["outro",        "Outro"],
];

const CLI_PRIO_LABEL = { p4: "P4 Agendado", p3: "P3 Controlado", p2: "P2 Alta", p1: "P1 Crítico" };
const CLI_STATUS_LABEL = { aberto: "Aberto", em_atendimento: "Em atendimento", fechado: "Fechado" };
const CLI_CAT_LABEL = Object.fromEntries(CLI_CATEGORIAS);

// Mapa categoria → prioridade automática. Mesma tabela do backend
// (src/routes/cliente.routes.js) — duplicada aqui só para o modo demo,
// onde não há servidor para classificar.
const CLI_CAT_TO_PRIO = {
  sem_agua:    "p1",
  vazamento:   "p2",
  bomba_falha: "p2",
  nivel_baixo: "p3",
  manutencao:  "p4",
  ruido:       "p3",
  outro:       "p3",
};

async function abrirTelaCliente(user) {
  CLI.user = user;
  // Mantém o splash (logo + spinner) visível enquanto buscamos status e
  // chamados em paralelo — assim a tela final aparece já preenchida, sem
  // flash de "Carregando…" depois.
  showScreen("splash");
  try {
    await Promise.all([
      carregarClienteStatus(false),
      carregarClienteChamados(false),
    ]);
  } catch (_) { /* erros individuais já são tratados dentro de cada fetch */ }
  showScreen("cliente-home");
  renderClienteHome({ loading: false });

  if (CLI.polling) clearInterval(CLI.polling);
  CLI.polling = setInterval(() => {
    carregarClienteStatus(false);
    carregarClienteChamados(false);
  }, 20000);
}

function pararPollingCliente() {
  if (CLI.polling) { clearInterval(CLI.polling); CLI.polling = null; }
}

async function carregarClienteStatus(showSkel) {
  if (showSkel) renderClienteHome({ loading: true });
  try {
    const d = await api("/cliente/status");
    CLI.condominio = d.condominio;
    CLI.reservatorios = d.reservatorios || [];
    CLI.alertas = d.alertas_abertos || [];
    CLI.statusCarregado = true;
    atualizarHeaderCondo();
    if (document.querySelector('[data-screen="cliente-home"][data-active]')) {
      renderClienteHome({ loading: false });
    }
    if (document.querySelector('[data-screen="cliente-telemetria"][data-active]')) {
      renderTelemetriaCliente();
    }
  } catch (err) {
    console.warn("[cli] status:", err.message);
  }
}

async function carregarClienteChamados(showSkel) {
  try {
    const list = await api("/cliente/chamados");
    CLI.chamados = Array.isArray(list) ? list : [];
    if (document.querySelector('[data-screen="cliente-home"][data-active]')) {
      renderClienteHome({ loading: false });
    }
    if (document.querySelector('[data-screen="cliente-chamados"][data-active]')) {
      renderClienteChamados();
    }
  } catch (err) {
    console.warn("[cli] chamados:", err.message);
  }
}

function atualizarHeaderCondo() {
  const nome = CLI.condominio?.nome || "—";
  const endLinha = [CLI.condominio?.endereco, CLI.condominio?.bairro, CLI.condominio?.cidade]
    .filter(Boolean).join(" · ") || "—";
  const elNome = document.getElementById("cliCondoNome");
  if (elNome) elNome.textContent = nome;
  const elEnd = document.getElementById("cliCondoEndereco");
  if (elEnd) elEnd.textContent = endLinha;
  const elChCondo = document.getElementById("cliChCondo");
  if (elChCondo) elChCondo.textContent = nome;
}

// ---- HOME do cliente — herda visual do admin: KPIs em .resumo-grid+.rc,
// seções como .card.tec-card+.cardHead+.head-icon, CTA com .btn.btnAccent.btn-lg.
function renderClienteHome({ loading }) {
  const main = document.getElementById("cliHomeMain");
  if (!main) return;
  // Skeleton enquanto o primeiro /cliente/status não voltou ainda — evita
  // flash da propaganda quando o fetch de /cliente/chamados resolve antes
  // de /cliente/status (race comum porque chamados é mais leve).
  if (loading || !CLI.statusCarregado) {
    main.innerHTML = `<section class="card tec-card"><div class="td-card-body"><div class="muted">Carregando…</div></div></section>`;
    return;
  }

  const totalReservatorios = CLI.reservatorios.length;
  const temTelemetria = totalReservatorios > 0;
  const offline = CLI.reservatorios.filter((r) => r.offline).length;
  const alertasAbertos = CLI.alertas.length;
  const chamadosAbertos = CLI.chamados.filter((c) => c.status !== "fechado").length;

  const kpi = (icon, val, lbl, kindCls, action) => `
    <button type="button" class="rc ${kindCls}" data-cli-kpi="${action}">
      <div class="rc-head">
        <div class="rc-icon">${icon}</div>
        <div class="rc-label">${lbl}</div>
      </div>
      <div class="rc-value">${val}</div>
    </button>`;

  const svgWifi   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
  const svgBell   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const svgTicket = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  // Quando sem telemetria, o KPI "Offline" não faz sentido — escondemos
  const kpisHtml = `
    <div class="resumo-grid cli-kpi-grid">
      ${temTelemetria ? kpi(svgWifi, offline, "Offline", offline > 0 ? "rc-bad" : "rc-ok", "offline") : ""}
      ${kpi(svgBell,   alertasAbertos,  "Alertas",   alertasAbertos > 0  ? "rc-warn" : "rc-ok",   "alertas")}
      ${kpi(svgTicket, chamadosAbertos, "Em aberto", chamadosAbertos > 0 ? "rc-warn" : "rc-ok",   "abertos")}
    </div>`;

  const ctaHtml = `
    <button type="button" class="btn btnAccent btn-lg cli-cta-btn" id="cliBtnAbrirChamado">
      <span class="btn-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:8px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Abrir chamado
      </span>
    </button>`;

  const svgWater = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c4 5 7 8.5 7 12.5a7 7 0 1 1-14 0c0-4 3-7.5 7-12.5z"/></svg>`;
  const reservHtml = temTelemetria
    ? `<section class="card tec-card">
        <div class="cardHead">
          <h2>${svgWater}Reservatórios</h2>
          <span class="hint">${totalReservatorios} ${totalReservatorios === 1 ? "monitorado" : "monitorados"}</span>
        </div>
        <div class="cli-reserv-grid">${CLI.reservatorios.map(renderReservCard).join("")}</div>
      </section>`
    : "";

  const svgList = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`;
  const chamadosRecentes = CLI.chamados.slice(0, 3);
  const chamadosHtml = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgList}Últimos chamados</h2>
        ${CLI.chamados.length > 0
          ? `<button type="button" class="btn btn-sm" id="cliVerTodosChamados">Ver todos</button>`
          : `<span class="hint">nenhum ainda</span>`}
      </div>
      ${chamadosRecentes.length === 0
        ? `<div class="cli-empty-section">Você ainda não abriu nenhum chamado.</div>`
        : `<div class="ch-list-mob">${chamadosRecentes.map(renderChamadoCardCli).join("")}</div>`}
    </section>`;

  main.innerHTML = kpisHtml + ctaHtml + reservHtml + chamadosHtml;

  if (!temTelemetria) _bindClienteSemTelemetria();

  document.getElementById("cliBtnAbrirChamado")?.addEventListener("click", abrirNovoChamado);
  document.getElementById("cliVerTodosChamados")?.addEventListener("click", () => {
    showScreen("cliente-chamados");
    renderClienteChamados();
  });
  main.querySelectorAll("[data-chamado]").forEach((el) => {
    el.addEventListener("click", () => abrirDetalheChamadoCli(Number(el.dataset.chamado)));
  });
  // KPIs clicáveis: cada card leva pra tela relacionada
  main.querySelectorAll("[data-cli-kpi]").forEach((el) => {
    el.addEventListener("click", () => {
      const a = el.dataset.cliKpi;
      if (a === "offline" || a === "alertas") {
        abrirTelemetriaCliente();
      } else if (a === "abertos") {
        _cliChTab = "aberto";
        showScreen("cliente-chamados");
        renderClienteChamados();
      }
    });
  });
}

function renderReservCard(r) {
  const pct = r.ultima_leitura?.nivel_pct;
  const bombaOn = !!r.ultima_leitura?.bomba_ligada;
  const offline = r.offline;
  let cor = "ok";
  if (offline) cor = "off";
  else if (pct != null && pct < 20) cor = "bad";
  else if (pct != null && pct < 40) cor = "warn";
  const pctStr = pct != null ? `${pct}%` : "—";

  return `
    <div class="cli-reserv cli-reserv-${cor}">
      <div class="cli-reserv-head">
        <div class="cli-reserv-nome">${escapeHtml(r.nome || "Reservatório")}</div>
        ${r.tipo ? `<div class="cli-reserv-tipo">${escapeHtml(r.tipo)}</div>` : ""}
      </div>
      <div class="cli-reserv-pct">${pctStr}</div>
      <div class="cli-reserv-bar">
        <div class="cli-reserv-bar-fill" style="width:${offline ? 0 : Math.max(0, Math.min(100, pct || 0))}%"></div>
      </div>
      <div class="cli-reserv-meta">
        ${offline
          ? `<span class="cli-pill cli-pill-off">OFFLINE</span>`
          : `<span class="cli-pill ${bombaOn ? "cli-pill-on" : "cli-pill-neutral"}">Bomba ${bombaOn ? "ligada" : "desligada"}</span>`}
        ${r.alertas_abertos_count > 0 ? `<span class="cli-pill cli-pill-warn">${r.alertas_abertos_count} alerta${r.alertas_abertos_count > 1 ? "s" : ""}</span>` : ""}
      </div>
    </div>`;
}

// Card de chamado no padrão .ch-row-mob (mesmo do app do técnico).
// Cor lateral por prioridade; pills com categoria + status + meta.
function renderChamadoCardCli(ch) {
  const status   = ch.status || "aberto";
  const stLabel  = CLI_STATUS_LABEL[status] || status;
  const cat      = ch.categoria ? (CLI_CAT_LABEL[ch.categoria] || ch.categoria) : "";
  const titulo   = ch.titulo || (ch.categoria ? `Solicitação: ${ch.categoria.replace(/_/g, " ")}` : `Chamado #${ch.id}`);
  const descTxt  = ch.descricao ? (ch.descricao.length > 140 ? ch.descricao.slice(0, 140) + "…" : ch.descricao) : "";
  const tempo    = tempoAbertoLabel(ch.criado_em);
  const tecnico  = ch.tecnico_nome ? escapeHtml(ch.tecnico_nome) : "";

  const iconTicket = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;

  return `
    <button type="button" class="ch-row-mob" data-chamado="${ch.id}" data-pri="${escapeHtml(ch.prioridade || "p3")}">
      <div class="ch-row-mob-icon">${iconTicket}</div>
      <div class="ch-row-mob-head">
        <span class="ch-row-mob-title">${escapeHtml(titulo)}</span>
        <span class="ch-id-cell">CH-${String(ch.id).padStart(3,"0")}</span>
      </div>
      ${descTxt ? `<div class="ch-row-mob-desc"><span>${escapeHtml(descTxt)}</span></div>` : ""}
      <div class="ch-row-mob-pills">
        ${cat ? `<span class="ch-cat-badge">${escapeHtml(cat)}</span>` : ""}
        <span class="ch-st ch-st-${escapeHtml(status)}">${stLabel}</span>
        <span class="ch-row-mob-meta">
          <span>há ${tempo}</span>
          ${tecnico ? `<span class="ch-row-mob-meta-sep"></span><span>${tecnico}</span>` : ""}
        </span>
      </div>
    </button>`;
}

function fmtDataCli(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---- TELEMETRIA HISTÓRICA ----
const TELE = {
  deviceId: null,
  dias: 7,
  chart: null,
  loading: false,
};

async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${API_BASE}/static/chart.umd.min.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Não foi possível carregar Chart.js"));
    document.head.appendChild(s);
  });
}

async function abrirTelemetriaCliente() {
  showScreen("cliente-telemetria");
  const telCondoEl = document.getElementById("cliTeleCondo");
  if (telCondoEl) telCondoEl.textContent = CLI.condominio?.nome || "—";

  // Garante que temos reservatórios (vem de /cliente/status)
  if (CLI.reservatorios.length === 0) await carregarClienteStatus(false);

  // Default: primeiro reservatório
  if (!TELE.deviceId && CLI.reservatorios[0]) {
    TELE.deviceId = CLI.reservatorios[0].device_id;
  }

  renderTelemetriaCliente();
}

// Bloco "sem telemetria contratada" — usado tanto na tela cheia de Telemetria
// quanto como card compacto na Home. `contexto` controla o tamanho/texto.
function _renderClienteSemTelemetria({ contexto } = {}) {
  const isTela = contexto === "tela";
  const waLink = "https://wa.me/5511966536110?text=" + encodeURIComponent("Olá! Quero saber mais sobre a telemetria General Bombas");

  const checkSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>`;

  const beneficios = [
    "Acompanhamento 24/7 do reservatório",
    "Alertas automáticos de nível baixo, vazamento e falha",
    "Histórico completo e relatórios em PDF",
    "Atendimento técnico mais rápido",
  ];

  return `
    <section class="card tec-card cli-promo${isTela ? " cli-promo-tela" : ""}">
      <div class="cli-promo-icon">${iconSvg}</div>
      <h2 class="cli-promo-title">${isTela ? "Você ainda não tem telemetria" : "Quer monitorar seu reservatório?"}</h2>
      <p class="cli-promo-text">
        ${isTela
          ? "Com a telemetria da General Bombas, você acompanha o <strong>nível dos reservatórios</strong> e o <strong>status das bombas</strong> em tempo real e recebe <strong>alertas automáticos</strong> antes do problema chegar ao morador."
          : "Veja em tempo real o nível do reservatório e receba alertas antes do problema chegar ao morador."}
      </p>
      <ul class="cli-promo-list">
        ${beneficios.map(b => `<li><span class="cli-promo-check">${checkSvg}</span>${b}</li>`).join("")}
      </ul>
      <a class="btn btnAccent btn-lg cli-promo-cta" href="${waLink}" target="_blank" rel="noopener">
        <span class="btn-label">Quero saber mais</span>
      </a>
      <span class="cli-promo-note">Resposta rápida pelo WhatsApp</span>
    </section>`;
}

function _bindClienteSemTelemetria() {
  // O CTA é um <a target="_blank">, não precisa de bind extra.
  // Função existe pra ponto de extensão (tracking, animação, etc.).
}

function renderTelemetriaCliente() {
  const main = document.getElementById("cliTeleMain");
  if (!main) return;

  // Espera o primeiro /cliente/status responder pra não dar flash de propaganda
  if (!CLI.statusCarregado) {
    main.innerHTML = `<section class="card tec-card"><div class="td-card-body"><div class="muted">Carregando…</div></div></section>`;
    return;
  }

  if (CLI.reservatorios.length === 0) {
    main.innerHTML = _renderClienteSemTelemetria({ contexto: "tela" });
    _bindClienteSemTelemetria();
    return;
  }

  const reservChips = CLI.reservatorios.map((r) => `
    <button type="button" class="btn btn-sm ${TELE.deviceId === r.device_id ? "btnAccent" : ""}"
            data-tele-dev="${escapeHtml(r.device_id)}">
      ${escapeHtml(r.nome || "Reservatório")}
    </button>`).join("");

  const periodChips = [
    { dias: 1,  label: "24h" },
    { dias: 7,  label: "7 dias" },
    { dias: 30, label: "30 dias" },
  ].map((p) => `
    <button type="button" class="btn btn-sm ${TELE.dias === p.dias ? "btnAccent" : ""}"
            data-tele-dias="${p.dias}">${p.label}</button>`).join("");

  const svgChart = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
  const svgWater = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c4 5 7 8.5 7 12.5a7 7 0 1 1-14 0c0-4 3-7.5 7-12.5z"/></svg>`;
  const svgPump  = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/></svg>`;

  // KPIs do topo (mesma régua do desktop)
  const offline   = CLI.reservatorios.filter((r) => r.offline).length;
  const online    = CLI.reservatorios.length - offline;
  const alertasN  = CLI.alertas.length;
  let ultimaIso = null;
  for (const r of CLI.reservatorios) {
    const c = r.ultima_leitura?.criado_em;
    if (!c) continue;
    if (!ultimaIso || new Date(c) > new Date(ultimaIso)) ultimaIso = c;
  }
  const kpiTele = (val, lbl, kindCls) => `
    <div class="rc ${kindCls}">
      <div class="rc-label">${lbl}</div>
      <div class="rc-value">${val}</div>
    </div>`;
  const kpisTeleHtml = `
    <div class="resumo-grid cli-kpi-grid cli-tele-kpis">
      ${kpiTele(CLI.reservatorios.length, "Reservatórios", "rc-neutral")}
      ${kpiTele(online, "Online", online === CLI.reservatorios.length ? "rc-ok" : "rc-warn")}
      ${kpiTele(alertasN, "Alertas", alertasN > 0 ? "rc-bad" : "rc-ok")}
      ${kpiTele(ultimaIso ? `há ${tempoAbertoLabel(ultimaIso)}` : "—", "Última leitura", "rc-neutral")}
    </div>`;

  // Status atual dos reservatórios (mesmos mini-cards da home)
  const reservAgoraHtml = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgWater}Status agora</h2>
        <span class="hint">Tempo real</span>
      </div>
      <div class="cli-reserv-grid">${CLI.reservatorios.map(renderReservCard).join("")}</div>
    </section>`;

  // Status das bombas (lista compacta)
  const bombasHtml = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgPump}Status das bombas</h2>
      </div>
      <ul class="cli-tele-bombas">
        ${CLI.reservatorios.map((r) => {
          const u = r.ultima_leitura;
          const onState = u?.bomba_ligada;
          const cls = onState === true ? "on" : onState === false ? "off" : "uk";
          const lbl = onState === true ? "Ligada" : onState === false ? "Desligada" : "—";
          return `<li>
            <span class="cli-tele-bomba-nome">${escapeHtml(r.nome || "Reservatório")}</span>
            <span class="cli-tele-bomba-pill ${cls}">${lbl}</span>
          </li>`;
        }).join("")}
      </ul>
    </section>`;

  main.innerHTML = `
    ${kpisTeleHtml}
    ${reservAgoraHtml}
    ${bombasHtml}
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgChart}Histórico de nível</h2>
      </div>
      <div class="cli-tele-body">
        <div class="cli-chip-group">
          <span class="rc-label">Reservatório</span>
          <div class="cli-chip-row">${reservChips}</div>
        </div>
        <div class="cli-chip-group">
          <span class="rc-label">Período</span>
          <div class="cli-chip-row">${periodChips}</div>
        </div>
        <div id="cliTeleStats" class="resumo-grid cli-tele-stats" hidden></div>
        <div class="cli-tele-canvas-wrap">
          <canvas id="cliTeleChart"></canvas>
          <div id="cliTeleLoading" class="cli-tele-loading" hidden>Carregando…</div>
        </div>
        <button type="button" class="btn btnAccent btn-lg" id="cliTelePdf">
          <span class="btn-label">📄 Baixar relatório (PDF)</span>
        </button>
      </div>
    </section>`;

  main.querySelectorAll("[data-tele-dev]").forEach((b) => {
    b.addEventListener("click", () => {
      TELE.deviceId = b.dataset.teleDev;
      renderTelemetriaCliente();
    });
  });
  main.querySelectorAll("[data-tele-dias]").forEach((b) => {
    b.addEventListener("click", () => {
      TELE.dias = Number(b.dataset.teleDias);
      renderTelemetriaCliente();
    });
  });
  document.getElementById("cliTelePdf")?.addEventListener("click", baixarRelatorioTelemetria);

  carregarGraficoTelemetria();
}

async function baixarRelatorioTelemetria() {
  if (!TELE.deviceId) return;
  if (IS_DEMO) {
    alert("Modo demo: PDF não disponível. Use a versão com login real.");
    return;
  }
  const btn = document.getElementById("cliTelePdf");
  setBtnLoading(btn, true);
  const token = Storage.getToken();
  try {
    const url = `${API_BASE}/relatorio/pdf?device_id=${encodeURIComponent(TELE.deviceId)}&dias=${TELE.dias}`;
    const r = await fetch(url, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (!r.ok) {
      let msg = `Erro HTTP ${r.status}`;
      try { const j = await r.json(); if (j?.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const cd = r.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="?([^"]+)"?/);
    a.download = match ? match[1] : `relatorio-${TELE.deviceId}-${TELE.dias}d.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    alert("Não foi possível baixar o relatório: " + err.message);
  } finally {
    setBtnLoading(btn, false);
  }
}

async function carregarGraficoTelemetria() {
  if (TELE.loading) return;
  if (!TELE.deviceId) return;
  TELE.loading = true;
  const loadingEl = document.getElementById("cliTeleLoading");
  if (loadingEl) loadingEl.hidden = false;

  try {
    await ensureChartJs();
    let data;
    if (IS_DEMO) {
      data = gerarHistoricoFakeDemo(TELE.deviceId, TELE.dias);
    } else {
      data = await api(`/cliente/historico?device_id=${encodeURIComponent(TELE.deviceId)}&dias=${TELE.dias}`);
    }
    desenharGraficoTelemetria(data);
  } catch (err) {
    const main = document.getElementById("cliTeleMain");
    if (main) {
      const wrap = main.querySelector(".cli-tele-canvas-wrap");
      if (wrap) wrap.innerHTML = `<div class="alert is-error">${escapeHtml(err.message)}</div>`;
    }
  } finally {
    TELE.loading = false;
    if (loadingEl) loadingEl.hidden = true;
  }
}

// Gera dados sintéticos pra preview no modo demo. Curva senoidal + ruído,
// com amplitude conforme o reservatório (cisterna oscila mais que a caixa).
function gerarHistoricoFakeDemo(deviceId, dias) {
  const now = Date.now();
  const bucketSec = dias <= 1 ? 300 : dias <= 7 ? 3600 : 14400;
  const buckets = Math.min(Math.floor((dias * 86400) / bucketSec), 200);
  const base = deviceId === "RES002" ? 45 : 75;
  const amp  = deviceId === "RES002" ? 25 : 12;
  const leituras = [];
  for (let i = buckets; i >= 0; i--) {
    const t = now - i * bucketSec * 1000;
    const fase = (i / buckets) * Math.PI * (dias <= 1 ? 4 : dias <= 7 ? 8 : 14);
    const ruido = (Math.random() - 0.5) * 6;
    const v = Math.round(Math.max(5, Math.min(95, base + Math.sin(fase) * amp + ruido)));
    leituras.push({
      bucket: new Date(t).toISOString(),
      nivel_pct_avg: v,
      nivel_pct_min: Math.max(0, v - 4),
      nivel_pct_max: Math.min(100, v + 4),
      bomba_ligada: v < 30,
      count: 1,
    });
  }
  const allAvg = leituras.map((l) => l.nivel_pct_avg);
  const stats = {
    min_pct: Math.min(...allAvg),
    max_pct: Math.max(...allAvg),
    avg_pct: Math.round(allAvg.reduce((s, v) => s + v, 0) / allAvg.length),
    total_leituras: leituras.length * 12,
  };
  return { device_id: deviceId, dias, bucket_sec: bucketSec, leituras, stats };
}

function desenharGraficoTelemetria(data) {
  const canvas = document.getElementById("cliTeleChart");
  if (!canvas) return;
  const leituras = Array.isArray(data.leituras) ? data.leituras : [];

  // Stats — usa o mesmo padrão .resumo-grid + .rc do admin
  const statsEl = document.getElementById("cliTeleStats");
  if (statsEl) {
    if (data.stats) {
      const stat = (val, lbl, kind) => `
        <div class="rc ${kind} rc-static">
          <div class="rc-head"><div class="rc-label">${lbl}</div></div>
          <div class="rc-value">${val}</div>
        </div>`;
      statsEl.hidden = false;
      statsEl.innerHTML =
        stat(`${data.stats.min_pct}%`,     "Mínimo",  "rc-bad") +
        stat(`${data.stats.avg_pct}%`,     "Médio",   "rc-neutral") +
        stat(`${data.stats.max_pct}%`,     "Máximo",  "rc-ok") +
        stat(`${data.stats.total_leituras}`, "Leituras", "rc-violet");
    } else {
      statsEl.hidden = false;
      statsEl.innerHTML = `<div class="muted" style="font-size:12px;grid-column:1/-1;text-align:center;padding:12px">Sem dados no período.</div>`;
    }
  }

  if (TELE.chart) { try { TELE.chart.destroy(); } catch {} TELE.chart = null; }
  if (leituras.length === 0) return;

  const labels = leituras.map((l) => {
    const d = new Date(l.bucket);
    return TELE.dias <= 1
      ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  });
  const valores = leituras.map((l) => l.nivel_pct_avg);

  TELE.chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Nível médio (%)",
        data: valores,
        borderColor: "#f0b014",
        backgroundColor: "rgba(240,176,20,.15)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: TELE.dias <= 1 ? 3 : 2,
        pointBackgroundColor: "#f0b014",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15,23,42,.95)",
          borderColor: "rgba(240,176,20,.4)",
          borderWidth: 1,
          callbacks: { label: (ctx) => ` ${ctx.parsed.y}%` },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { color: "rgba(255,255,255,.05)" },
        },
        y: {
          min: 0, max: 100,
          ticks: { color: "#94a3b8", stepSize: 25, callback: (v) => v + "%" },
          grid: { color: "rgba(255,255,255,.05)" },
        },
      },
    },
  });
}

// ---- LISTA de chamados (tela cheia) ----
let _cliChTab = "todos";
function renderClienteChamados() {
  const main = document.getElementById("cliChMain");
  if (!main) return;
  const counts = {
    todos: CLI.chamados.length,
    aberto: CLI.chamados.filter((c) => c.status === "aberto").length,
    em_atendimento: CLI.chamados.filter((c) => c.status === "em_atendimento").length,
    fechado: CLI.chamados.filter((c) => c.status === "fechado").length,
  };
  const filtrados = _cliChTab === "todos" ? CLI.chamados : CLI.chamados.filter((c) => c.status === _cliChTab);

  const svgList   = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`;
  const svgTicket = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const svgClock  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const svgCheck  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const kpi = (icon, val, lbl, kindCls, tab) => `
    <button type="button" class="rc ${kindCls}" data-kpi-tab="${tab}">
      <div class="rc-head">
        <div class="rc-icon">${icon}</div>
        <div class="rc-label">${lbl}</div>
      </div>
      <div class="rc-value">${val}</div>
    </button>`;

  const kpisHtml = `
    <div class="resumo-grid cli-kpi-grid">
      ${kpi(svgTicket, counts.aberto,        "Abertos",      counts.aberto        > 0 ? "rc-warn"    : "rc-ok",      "aberto")}
      ${kpi(svgClock,  counts.em_atendimento, "Em atend.",    counts.em_atendimento > 0 ? "rc-warn"   : "rc-neutral", "em_atendimento")}
      ${kpi(svgCheck,  counts.fechado,        "Fechados",     counts.fechado       > 0 ? "rc-ok"      : "rc-neutral", "fechado")}
    </div>`;

  main.innerHTML = `
    ${kpisHtml}
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgList}Meus chamados</h2>
        <span class="hint">${counts.todos} ${counts.todos === 1 ? "chamado" : "chamados"}</span>
      </div>
      <div class="ch-toolbar tec-toolbar">
        <div class="wa-tabs" role="tablist">
          <button class="wa-tab ${_cliChTab === "todos"          ? "is-active" : ""}" data-tab="todos">Todos <span class="wa-count">${counts.todos}</span></button>
          <button class="wa-tab ${_cliChTab === "aberto"         ? "is-active" : ""}" data-tab="aberto">Abertos <span class="wa-count">${counts.aberto}</span></button>
          <button class="wa-tab ${_cliChTab === "em_atendimento" ? "is-active" : ""}" data-tab="em_atendimento">Em atend. <span class="wa-count">${counts.em_atendimento}</span></button>
          <button class="wa-tab ${_cliChTab === "fechado"        ? "is-active" : ""}" data-tab="fechado">Fechados <span class="wa-count">${counts.fechado}</span></button>
        </div>
      </div>
      ${filtrados.length === 0
        ? `<div class="tc-empty">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
               <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
             </svg>
             <p>Nenhum chamado nesta aba</p>
           </div>`
        : `<div class="ch-list-mob">${filtrados.map(renderChamadoCardCli).join("")}</div>`}
    </section>`;

  main.querySelectorAll("[data-kpi-tab]").forEach((b) => {
    b.addEventListener("click", () => { _cliChTab = b.dataset.kpiTab; renderClienteChamados(); });
  });
  main.querySelectorAll(".wa-tab").forEach((b) => {
    b.addEventListener("click", () => { _cliChTab = b.dataset.tab; renderClienteChamados(); });
  });
  main.querySelectorAll("[data-chamado]").forEach((el) => {
    el.addEventListener("click", () => abrirDetalheChamadoCli(Number(el.dataset.chamado)));
  });
}

// ---- NOVO CHAMADO ----
function abrirNovoChamado() {
  showScreen("cliente-novo-chamado");
  const main = document.getElementById("cliNovoMain");
  const svgEdit = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

  main.innerHTML = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgEdit}Conte o que aconteceu</h2>
        <span class="hint">resposta em até 24h</span>
      </div>
      <form id="cliNovoForm" class="cli-form" novalidate>
        <label class="cli-form-field">
          <span class="rc-label">Tipo de problema</span>
          <select class="input" id="cliNovoCat">
            ${CLI_CATEGORIAS.map(([k, lbl]) => `<option value="${k}">${escapeHtml(lbl)}</option>`).join("")}
          </select>
        </label>

        <label class="cli-form-field">
          <span class="rc-label">Descreva o que aconteceu</span>
          <textarea class="input cli-textarea" id="cliNovoDesc" maxlength="4000" rows="6"
            placeholder="Ex: faltou água nos últimos 2 dias, ouvi a bomba fazer barulho estranho ontem..."></textarea>
          <span class="hint">Mínimo 5 caracteres. A prioridade é definida automaticamente pelo tipo do problema.</span>
        </label>

        <div class="alert error" id="cliNovoAlert" hidden></div>

        <button type="submit" class="btn btnAccent btn-lg" id="cliNovoSubmit">
          <span class="btn-label">Abrir chamado</span>
        </button>
      </form>
    </section>`;

  document.getElementById("cliNovoForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submeterNovoChamado();
  });
}

async function submeterNovoChamado() {
  const cat = document.getElementById("cliNovoCat").value;
  const desc = document.getElementById("cliNovoDesc").value.trim();
  const alertEl = document.getElementById("cliNovoAlert");
  const btn = document.getElementById("cliNovoSubmit");

  hideAlert(alertEl);
  if (desc.length < 5) {
    showAlert(alertEl, "Descreva o problema com pelo menos 5 caracteres.", "error");
    return;
  }

  setBtnLoading(btn, true);
  try {
    let novo;
    if (IS_DEMO) {
      novo = {
        id: Math.floor(Date.now() / 1000) % 10000,
        status: "aberto",
        prioridade: CLI_CAT_TO_PRIO[cat] || "p3",
        categoria: cat,
        titulo: `Solicitação: ${cat.replace(/_/g, " ")}`,
        descricao: desc,
        criado_em: new Date().toISOString(),
      };
    } else {
      // Prioridade não vai mais no body — o backend deriva da categoria.
      novo = await api("/cliente/chamados", {
        method: "POST",
        body: { categoria: cat, descricao: desc },
      });
    }
    CLI.chamados.unshift({
      ...novo,
      tecnico_nome: null,
      ordem_servico_id: null,
      os_finalizada_em: null,
    });
    _cliChTab = "aberto";
    showScreen("cliente-chamados");
    renderClienteChamados();
  } catch (err) {
    showAlert(alertEl, err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

// ---- DETALHE do chamado ----
async function abrirDetalheChamadoCli(id) {
  CLI.detalheId = id;
  CLI.detalhe = null;
  CLI.detalheMsgs = [];
  showScreen("cliente-chamado-detalhe");
  const main = document.getElementById("cliDetMain");
  const pill = document.getElementById("cliDetStatusPill");
  if (pill) pill.hidden = true;
  main.innerHTML = `
    <section class="td-card"><div class="td-card-body"><div class="muted">Carregando…</div></div></section>`;

  try {
    let ch;
    if (IS_DEMO) {
      ch = CLI.chamados.find((c) => c.id === id);
      if (!ch) throw new Error("Chamado não encontrado");
      // Em demo o detalhe usa o que já está na lista (mesma estrutura)
      ch = { ...ch, os_id: ch.ordem_servico_id, os_numero: ch.os_numero };
      CLI.detalheMsgs = []; // sem backend, thread começa vazia
    } else {
      ch = await api(`/cliente/chamados/${id}`);
      // Mensagens em paralelo, mas tolera falha (a tela ainda carrega).
      // Em chamados fechados a thread some pra dar lugar à avaliação,
      // então não vale a pena baixar.
      if (ch.status === "fechado") {
        CLI.detalheMsgs = [];
      } else {
        try {
          CLI.detalheMsgs = await api(`/cliente/chamados/${id}/mensagens`);
        } catch (e) {
          console.warn("[cli] mensagens:", e.message);
          CLI.detalheMsgs = [];
        }
      }
    }
    CLI.detalhe = ch;
    renderDetalheChamado(ch);
  } catch (err) {
    main.innerHTML = `
      <section class="card tec-card">
        <div class="td-card-body"><div class="alert error">${escapeHtml(err.message)}</div></div>
      </section>`;
  }
}

function renderDetalheChamado(ch) {
  const status = ch.status || "aberto";
  const titulo = ch.titulo || (ch.categoria ? CLI_CAT_LABEL[ch.categoria] || ch.categoria : `Chamado #${ch.id}`);

  document.getElementById("cliDetTitulo").textContent = titulo;
  document.getElementById("cliDetSub").textContent = `CH-${String(ch.id).padStart(3,"0")}`;
  const pill = document.getElementById("cliDetStatusPill");
  if (pill) {
    pill.hidden = false;
    pill.className = `td-status-pill td-status-${status}`;
    pill.textContent = CLI_STATUS_LABEL[status] || status;
  }

  const main = document.getElementById("cliDetMain");

  // ---- Card de resumo (pills + descrição) ----
  const catLabel  = ch.categoria  ? (CLI_CAT_LABEL[ch.categoria]   || ch.categoria)  : null;
  const resumoHtml = `
    <section class="td-card">
      <div class="td-card-body">
        <div class="cli-det-pills">
          ${catLabel  ? `<span class="ch-cat-badge">${escapeHtml(catLabel)}</span>` : ""}
        </div>
        <h2 class="cli-det-titulo">${escapeHtml(titulo)}</h2>
        ${ch.descricao ? `<div class="cli-det-desc">${escapeHtml(ch.descricao)}</div>` : ""}
      </div>
    </section>`;

  // ---- Timeline em .card + .cardHead (visual do admin) ----
  const steps = [
    { key: "criado",      label: "Chamado registrado", at: ch.criado_em, done: true },
    { key: "atendimento", label: ch.tecnico_nome ? `Em atendimento · ${ch.tecnico_nome}` : "Em atendimento",
      at: status !== "aberto" ? ch.atualizado_em : null,
      done: status === "em_atendimento" || status === "fechado",
      current: status === "em_atendimento" },
    { key: "fechado",     label: "Atendimento concluído",
      at: ch.fechado_em, done: status === "fechado", current: false },
  ];

  const svgClock = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  const timelineHtml = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgClock}Linha do tempo</h2>
      </div>
      <div class="cli-timeline">
        ${steps.map((s, i) => `
          <div class="cli-tl-item ${s.done ? "is-done" : ""} ${s.current ? "is-current" : ""}">
            <div class="cli-tl-dot">${s.done ? "✓" : (i + 1)}</div>
            <div class="cli-tl-body">
              <div class="cli-tl-label">${escapeHtml(s.label)}</div>
              ${s.at ? `<div class="cli-tl-time">${fmtDataCli(s.at)}</div>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </section>`;

  // ---- Avaliação: só o formulário, quando chamado fechado e ainda não
  // avaliado. Depois de enviar, o cliente vê uma confirmação rápida e o
  // card some — a nota/comentário ficam disponíveis apenas para o admin.
  const avaliacaoHtml = (status === "fechado" && !ch.ja_avaliado)
    ? renderAvaliacaoCardForm()
    : "";

  // ---- Mensagens: thread entre cliente e técnico — escondida quando o
  // chamado já está fechado (a avaliação assume esse canal).
  const mensagensHtml = status === "fechado" ? "" : renderMensagensCard();

  main.innerHTML = resumoHtml + timelineHtml + avaliacaoHtml + mensagensHtml;

  _bindAvaliacaoForm();
  if (status !== "fechado") _bindMensagensForm();
}

// =====================================================================
// MENSAGENS — thread cliente ↔ técnico (alerta_comentarios)
// =====================================================================

function renderMensagensCard() {
  const svgChat = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  return `
    <section class="card tec-card cli-msg-card">
      <div class="cardHead">
        <h2>${svgChat}Mensagens</h2>
        <span class="hint" id="cliMsgCount">${CLI.detalheMsgs.length} ${CLI.detalheMsgs.length === 1 ? "mensagem" : "mensagens"}</span>
      </div>
      <div class="cli-msg-list" id="cliMsgList">
        ${renderMensagensList()}
      </div>
      <form id="cliMsgForm" class="cli-msg-composer" novalidate>
        <div class="cli-msg-preview" id="cliMsgPreview" hidden></div>
        <div class="cli-msg-input-row">
          <label class="cli-msg-photo-btn" for="cliMsgFoto" aria-label="Anexar foto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <input type="file" id="cliMsgFoto" accept="image/*" hidden>
          </label>
          <textarea class="input cli-msg-input" id="cliMsgTexto" rows="1" maxlength="2000"
            placeholder="Escreva uma mensagem…"></textarea>
          <button type="submit" class="cli-msg-send" id="cliMsgSend" aria-label="Enviar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="alert error" id="cliMsgAlert" hidden></div>
      </form>
    </section>`;
}

function renderMensagensList() {
  if (CLI.detalheMsgs.length === 0) {
    return `<div class="cli-empty-section" style="padding:18px 16px">
      Nenhuma mensagem ainda. Use o campo abaixo para mandar texto ou foto pro técnico.
    </div>`;
  }
  return CLI.detalheMsgs.map(renderMensagemItem).join("");
}

function renderMensagemItem(m) {
  const mine = m.autor_id && CLI.user?.id === m.autor_id;
  const role = m.autor_role || (mine ? "cliente" : "tecnico");
  const lado = mine ? "is-mine" : "is-other";
  const nome = m.autor_nome || (role === "tecnico" ? "Técnico" : role === "admin" ? "Atendimento" : "Você");
  const fotoHtml = m.foto_url
    ? `<a class="cli-msg-photo" href="${escapeHtml(_apiUrl(m.foto_url))}" target="_blank" rel="noopener">
         <img src="${escapeHtml(_apiUrl(m.foto_url))}" alt="foto" loading="lazy">
       </a>`
    : "";
  const textoHtml = m.texto ? `<div class="cli-msg-text">${escapeHtml(m.texto)}</div>` : "";
  return `
    <div class="cli-msg-item ${lado}" data-role="${escapeHtml(role)}">
      <div class="cli-msg-bubble">
        <div class="cli-msg-header">
          <span class="cli-msg-author">${escapeHtml(nome)}</span>
          <span class="cli-msg-time">${fmtDataCli(m.criado_em)}</span>
        </div>
        ${fotoHtml}
        ${textoHtml}
      </div>
    </div>`;
}

// foto_url vem como "/uploads/chamados/123/abc.jpg"; em capacitor ou se o
// app for servido de outro host, precisa prefixar com API_BASE.
function _apiUrl(p) {
  if (!p) return "";
  if (/^https?:|^data:|^blob:/i.test(p)) return p;
  return API_BASE + (p.startsWith("/") ? p : "/" + p);
}

let _enviandoMsg = false;
let _fotoMsgPending = null; // data URL aguardando envio

function _bindMensagensForm() {
  const form = document.getElementById("cliMsgForm");
  if (!form) return;

  const inputFoto = document.getElementById("cliMsgFoto");
  inputFoto?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      _fotoMsgPending = await comprimirFoto(f, 1280, 0.78);
      _atualizarPreviewFotoMsg();
    } catch (err) {
      console.error(err);
      alert("Não foi possível processar a imagem.");
    } finally {
      inputFoto.value = ""; // reseta pra permitir escolher a mesma de novo
    }
  });

  // Auto-resize do textarea (1 a 5 linhas)
  const ta = document.getElementById("cliMsgTexto");
  ta?.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarMensagemDetalhe();
  });
}

function _atualizarPreviewFotoMsg() {
  const el = document.getElementById("cliMsgPreview");
  if (!el) return;
  if (!_fotoMsgPending) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <img src="${_fotoMsgPending}" alt="prévia">
    <button type="button" class="cli-msg-preview-x" id="cliMsgPreviewX" aria-label="Remover foto">×</button>`;
  document.getElementById("cliMsgPreviewX")?.addEventListener("click", () => {
    _fotoMsgPending = null;
    _atualizarPreviewFotoMsg();
  });
}

async function enviarMensagemDetalhe() {
  if (_enviandoMsg) return;
  const ta = document.getElementById("cliMsgTexto");
  const alertEl = document.getElementById("cliMsgAlert");
  const sendBtn = document.getElementById("cliMsgSend");
  const texto = (ta?.value || "").trim();

  hideAlert(alertEl);
  if (!texto && !_fotoMsgPending) {
    showAlert(alertEl, "Escreva algo ou anexe uma foto.", "error");
    return;
  }

  if (IS_DEMO) {
    // Modo demo: insere a mensagem local sem chamar backend
    CLI.detalheMsgs.push({
      id: Date.now(), texto: texto || null,
      foto_url: _fotoMsgPending || null,
      criado_em: new Date().toISOString(),
      autor_id: CLI.user?.id, autor_nome: CLI.user?.nome || "Você",
      autor_role: "cliente",
    });
    ta.value = ""; ta.style.height = "auto";
    _fotoMsgPending = null; _atualizarPreviewFotoMsg();
    _atualizarMensagensList();
    return;
  }

  _enviandoMsg = true;
  sendBtn.disabled = true;
  try {
    const novo = await api(`/cliente/chamados/${CLI.detalheId}/mensagens`, {
      method: "POST",
      body: { texto: texto || null, foto_base64: _fotoMsgPending || null },
    });
    CLI.detalheMsgs.push(novo);
    ta.value = ""; ta.style.height = "auto";
    _fotoMsgPending = null; _atualizarPreviewFotoMsg();
    _atualizarMensagensList();
  } catch (err) {
    showAlert(alertEl, err.message, "error");
  } finally {
    _enviandoMsg = false;
    sendBtn.disabled = false;
  }
}

function _atualizarMensagensList() {
  const list = document.getElementById("cliMsgList");
  if (list) {
    list.innerHTML = renderMensagensList();
    // scroll pro fim
    list.scrollTop = list.scrollHeight;
  }
  const count = document.getElementById("cliMsgCount");
  if (count) count.textContent =
    `${CLI.detalheMsgs.length} ${CLI.detalheMsgs.length === 1 ? "mensagem" : "mensagens"}`;
}

// =====================================================================
// AVALIAÇÃO — só aparece depois que o chamado é fechado
// =====================================================================

let _avaliacaoNota = 0;

function renderAvaliacaoCardForm() {
  _avaliacaoNota = 0;
  const svgStar = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  return `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgStar}Como foi o atendimento?</h2>
        <span class="hint">Ajuda a equipe a melhorar</span>
      </div>
      <form id="cliAvaliacaoForm" class="cli-form" novalidate>
        <div class="cli-stars-row" id="cliStarsRow" role="radiogroup" aria-label="Nota">
          ${[1,2,3,4,5].map((n) => `
            <button type="button" class="cli-star" data-nota="${n}" role="radio" aria-checked="false" aria-label="${n} estrela${n>1?"s":""}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>`).join("")}
        </div>
        <label class="cli-form-field">
          <span class="rc-label">Quer comentar algo? (opcional)</span>
          <textarea class="input cli-textarea" id="cliAvaliacaoComent" maxlength="1000" rows="3"
            placeholder="Ex: técnico atencioso, problema resolvido na primeira visita."></textarea>
        </label>
        <div class="alert error" id="cliAvaliacaoAlert" hidden></div>
        <button type="submit" class="btn btnAccent btn-lg" id="cliAvaliacaoSubmit">
          <span class="btn-label">Enviar avaliação</span>
        </button>
      </form>
    </section>`;
}

function _bindAvaliacaoForm() {
  const form = document.getElementById("cliAvaliacaoForm");
  if (!form) return;
  const starsRow = document.getElementById("cliStarsRow");
  starsRow.querySelectorAll(".cli-star").forEach((btn) => {
    btn.addEventListener("click", () => {
      _avaliacaoNota = Number(btn.dataset.nota);
      starsRow.querySelectorAll(".cli-star").forEach((s) => {
        const n = Number(s.dataset.nota);
        s.classList.toggle("is-filled", n <= _avaliacaoNota);
        s.setAttribute("aria-checked", n === _avaliacaoNota ? "true" : "false");
        s.querySelector("svg")?.setAttribute("fill", n <= _avaliacaoNota ? "currentColor" : "none");
      });
    });
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarAvaliacao();
  });
}

async function enviarAvaliacao() {
  const alertEl = document.getElementById("cliAvaliacaoAlert");
  const btn = document.getElementById("cliAvaliacaoSubmit");
  const coment = document.getElementById("cliAvaliacaoComent").value.trim();

  hideAlert(alertEl);
  if (!_avaliacaoNota) {
    showAlert(alertEl, "Toque em uma das estrelas para dar a nota.", "error");
    return;
  }

  if (!IS_DEMO) {
    setBtnLoading(btn, true);
    try {
      await api(`/cliente/chamados/${CLI.detalheId}/avaliar`, {
        method: "POST",
        body: { nota: _avaliacaoNota, comentario: coment || null },
      });
    } catch (err) {
      showAlert(alertEl, err.message, "error");
      setBtnLoading(btn, false);
      return;
    }
    setBtnLoading(btn, false);
  }

  // Marca como avaliado pro caso de re-render no mesmo ciclo. A nota/comentário
  // não ficam no estado local — o cliente não vê isso de volta.
  if (CLI.detalhe) CLI.detalhe.ja_avaliado = true;

  // Substitui o card do formulário por uma confirmação inline e some depois.
  const formCard = document.getElementById("cliAvaliacaoForm")?.closest("section.card");
  if (formCard) {
    formCard.innerHTML = `
      <div class="cli-aval-thanks">
        <div class="cli-aval-thanks-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="cli-aval-thanks-title">Obrigado pela avaliação!</div>
        <div class="cli-aval-thanks-sub">Sua opinião ajuda a equipe a melhorar.</div>
      </div>`;
    setTimeout(() => { formCard.remove(); }, 4000);
  }
}

// ---- CONTA — perfil + trocar senha + sair ----
function abrirTelaConta() {
  showScreen("cliente-conta");
  const sub = document.getElementById("cliContaSub");
  if (sub) sub.textContent = CLI.condominio?.nome || CLI.user?.email || "—";
  renderClienteConta();
}

function _iniciaisNome(nome) {
  if (!nome) return "?";
  const partes = String(nome).trim().split(/\s+/);
  const a = partes[0]?.[0] || "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

function renderClienteConta() {
  const main = document.getElementById("cliContaMain");
  if (!main) return;

  const user = CLI.user || {};
  const condo = CLI.condominio || {};
  const endLinha = [condo.endereco, condo.bairro, condo.cidade].filter(Boolean).join(", ") || "—";

  const svgUser = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const svgLock = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

  main.innerHTML = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgUser}Seus dados</h2>
      </div>
      <div class="cli-conta-hero">
        <div class="cli-conta-avatar">${escapeHtml(_iniciaisNome(user.nome))}</div>
        <div class="cli-conta-hero-text">
          <div class="cli-conta-nome">${escapeHtml(user.nome || "—")}</div>
          <div class="cli-conta-email">${escapeHtml(user.email || "—")}</div>
        </div>
      </div>
      <div class="cli-info-row">
        <span class="cli-info-row-label">Condomínio</span>
        <span class="cli-info-row-value">${escapeHtml(condo.nome || "—")}</span>
      </div>
      <div class="cli-info-row">
        <span class="cli-info-row-label">Endereço</span>
        <span class="cli-info-row-value">${escapeHtml(endLinha)}</span>
      </div>
    </section>

    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgLock}Alterar senha</h2>
      </div>
      <form id="cliSenhaForm" class="cli-form" novalidate autocomplete="off">
        <label class="cli-form-field">
          <span class="rc-label">Senha atual</span>
          <input class="input" type="password" id="cliSenhaAtual" autocomplete="current-password" required>
        </label>
        <label class="cli-form-field">
          <span class="rc-label">Nova senha</span>
          <input class="input" type="password" id="cliSenhaNova" autocomplete="new-password" minlength="6" required>
          <span class="hint">Mínimo 6 caracteres</span>
        </label>
        <label class="cli-form-field">
          <span class="rc-label">Confirmar nova senha</span>
          <input class="input" type="password" id="cliSenhaNova2" autocomplete="new-password" minlength="6" required>
        </label>

        <div class="alert" id="cliSenhaAlert" hidden></div>

        <button type="submit" class="btn btnAccent btn-lg" id="cliSenhaSubmit">
          <span class="btn-label">Salvar nova senha</span>
        </button>
      </form>
    </section>

    <button type="button" class="btn btn-lg cli-conta-logout" id="cliBtnSair">
      <span class="btn-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:8px">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sair da conta
      </span>
    </button>`;

  document.getElementById("cliSenhaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitTrocarSenha();
  });
  document.getElementById("cliBtnSair").addEventListener("click", () => {
    pararPollingCliente();
    Storage.clear();
    showScreen("login");
  });
}

async function submitTrocarSenha() {
  const atual = document.getElementById("cliSenhaAtual").value;
  const nova  = document.getElementById("cliSenhaNova").value;
  const nova2 = document.getElementById("cliSenhaNova2").value;
  const alertEl = document.getElementById("cliSenhaAlert");
  const btn = document.getElementById("cliSenhaSubmit");

  hideAlert(alertEl);

  if (!atual || !nova || !nova2) {
    showAlert(alertEl, "Preencha todos os campos.", "error");
    return;
  }
  if (nova.length < 6) {
    showAlert(alertEl, "A nova senha deve ter pelo menos 6 caracteres.", "error");
    return;
  }
  if (nova !== nova2) {
    showAlert(alertEl, "As novas senhas não conferem.", "error");
    return;
  }
  if (nova === atual) {
    showAlert(alertEl, "A nova senha precisa ser diferente da atual.", "error");
    return;
  }

  if (IS_DEMO) {
    showAlert(alertEl, "Modo demo: alteração de senha não disponível.", "info");
    return;
  }

  setBtnLoading(btn, true);
  try {
    await api("/cliente/trocar-senha", {
      method: "POST",
      body: { senha_atual: atual, senha_nova: nova },
    });
    document.getElementById("cliSenhaForm").reset();
    showAlert(alertEl, "Senha atualizada com sucesso.", "success");
  } catch (err) {
    showAlert(alertEl, err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

// ─── Chat de Suporte Interno ─────────────────────────────────────────────────

const SUP = {
  convId:     null,
  ultimaMsg:  null,   // ISO da última mensagem para polling incremental
  pollTimer:  null,
  enviando:   false,
};

async function abrirSuporteCliente() {
  showScreen("cliente-suporte");
  _supLimpar();
  await _supCarregar();
  _supBindComposer();
  _supIniciarPoll();
}

function _supLimpar() {
  const msgs = document.getElementById("cliSuporteMsgs");
  if (msgs) msgs.innerHTML = "";
  _supSetTyping(false);
  _supSetBanner(false);
  clearInterval(SUP.pollTimer);
  SUP.pollTimer = null;
  SUP.ultimaMsg = null;
}

async function _supCarregar() {
  if (IS_DEMO) { _supRenderMensagens(_supDemoMsgs()); return; }
  try {
    const data = await api("/cliente/chat");
    SUP.convId = data.conversa_id;
    _supRenderMensagens(data.mensagens || []);
    _supSetBanner(data.aguardando_atendente);
    if (data.mensagens?.length) {
      SUP.ultimaMsg = data.mensagens[data.mensagens.length - 1].criado_em;
    }
  } catch (_) {}
}

function _supRenderMensagens(msgs) {
  const el = document.getElementById("cliSuporteMsgs");
  if (!el) return;
  el.innerHTML = msgs.map(_supMsgHtml).join("");
  el.scrollTop = el.scrollHeight;
}

function _supAppendMsg(msg) {
  const el = document.getElementById("cliSuporteMsgs");
  if (!el) return;
  el.insertAdjacentHTML("beforeend", _supMsgHtml(msg));
  el.scrollTop = el.scrollHeight;
  SUP.ultimaMsg = msg.criado_em;
}

function _supMsgHtml(msg) {
  const isMine = msg.direcao === "entrada";
  const texto  = escapeHtml(msg.conteudo || "");
  const hora   = msg.criado_em ? new Date(msg.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return `<div class="cli-msg-item ${isMine ? "is-mine" : "is-other"}">
    <div class="cli-msg-bubble">
      <div class="cli-msg-text">${texto}</div>
      <div class="cli-msg-time">${hora}</div>
    </div>
  </div>`;
}

function _supSetTyping(on) {
  const el = document.getElementById("cliSuporteTyping");
  if (el) el.textContent = on ? "Assistente está digitando…" : "";
}

function _supSetBanner(on) {
  const el = document.getElementById("cliSuporteBanner");
  if (el) el.style.display = on ? "block" : "none";
  const composer = document.getElementById("cliSuporteComposer");
  if (composer) composer.style.display = on ? "none" : "flex";
}

async function _supEnviar() {
  if (SUP.enviando) return;
  const input = document.getElementById("cliSuporteInput");
  const texto = input?.value?.trim();
  if (!texto) return;

  SUP.enviando = true;
  document.getElementById("cliSuporteSend")?.setAttribute("disabled", "");
  input.value = "";
  input.style.height = "";

  // Mostra a mensagem do cliente imediatamente e indicador de digitação
  _supAppendMsg({ direcao: "entrada", conteudo: texto, criado_em: new Date().toISOString() });
  _supSetTyping(true);

  try {
    const data = await api("/cliente/chat/mensagem", { method: "POST", body: { texto } });
    _supSetTyping(false);
    if (data.aguardando_atendente) _supSetBanner(true);
    // Recarrega do servidor para garantir timestamps corretos (evita loop no poll)
    await _supCarregar();
  } catch (e) {
    _supSetTyping(false);
    console.error("[suporte] erro ao enviar:", e.message);
  }

  SUP.enviando = false;
  document.getElementById("cliSuporteSend")?.removeAttribute("disabled");
}

function _supIniciarPoll() {
  clearInterval(SUP.pollTimer);
  SUP.pollTimer = setInterval(async () => {
    if (!SUP.convId || IS_DEMO) return;
    // Só pollar quando a tela estiver ativa
    if (!document.querySelector('[data-screen="cliente-suporte"][data-active]')) {
      clearInterval(SUP.pollTimer);
      return;
    }
    try {
      const desde = SUP.ultimaMsg || new Date(0).toISOString();
      const data = await api(`/cliente/chat/mensagens?desde=${encodeURIComponent(desde)}`);
      // Só adiciona mensagens de saída novas com timestamp maior que o atual
      (data.mensagens || [])
        .filter(m => m.direcao === "saida" && (!SUP.ultimaMsg || m.criado_em > SUP.ultimaMsg))
        .forEach(_supAppendMsg);
      if (data.aguardando_atendente) _supSetBanner(true);
    } catch (_) {}
  }, 5000);
}

function _supBindComposer() {
  const input  = document.getElementById("cliSuporteInput");
  const btn    = document.getElementById("cliSuporteSend");
  if (!input || !btn) return;
  if (input.dataset.supBound) return; // já foi vinculado — evita listeners duplicados
  input.dataset.supBound = "1";

  input.addEventListener("input", () => {
    input.style.height = "";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _supEnviar(); }
  });

  btn.addEventListener("click", _supEnviar);
}

function _supDemoMsgs() {
  return [
    { direcao: "saida",   conteudo: "Olá! Sou o assistente da General Bombas. Como posso ajudar?", criado_em: new Date(Date.now() - 60000).toISOString() },
    { direcao: "entrada", conteudo: "Preciso de informações sobre o contrato.", criado_em: new Date(Date.now() - 30000).toISOString() },
    { direcao: "saida",   conteudo: "Claro! Pode me dar mais detalhes sobre o que precisa saber?", criado_em: new Date().toISOString() },
  ];
}

// ---- Eventos do cliente ----
function _bindClienteUI() {
  document.querySelectorAll(
    '[data-screen="cliente-home"] [data-cli-tab], [data-screen="cliente-chamados"] [data-cli-tab], [data-screen="cliente-telemetria"] [data-cli-tab], [data-screen="cliente-conta"] [data-cli-tab], [data-screen="cliente-suporte"] [data-cli-tab]'
  ).forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.dataset.cliTab;
      if (tab === "home") {
        showScreen("cliente-home");
        renderClienteHome({ loading: false });
      } else if (tab === "chamados") {
        showScreen("cliente-chamados");
        renderClienteChamados();
      } else if (tab === "telemetria") {
        abrirTelemetriaCliente();
      } else if (tab === "suporte") {
        abrirSuporteCliente();
      } else if (tab === "conta") {
        abrirTelaConta();
      }
    });
  });

  document.getElementById("cliBtnNovoChamado")?.addEventListener("click", abrirNovoChamado);
  document.getElementById("cliNovoBack")?.addEventListener("click", () => {
    showScreen("cliente-chamados");
    renderClienteChamados();
  });
  document.getElementById("cliDetBack")?.addEventListener("click", () => {
    showScreen("cliente-chamados");
    renderClienteChamados();
  });
}
_bindClienteUI();

// =====================================================================
// TÉCNICO — Conta / Perfil (bottom nav 2 abas)
// =====================================================================

function abrirTelaContaTec() {
  showScreen("tecnico-conta");
  const sub = document.getElementById("tecContaSub");
  if (sub) sub.textContent = TC.user?.email || TC.user?.nome || "—";
  renderContaTec();
}

function renderContaTec() {
  const main = document.getElementById("tecContaMain");
  if (!main) return;

  const user = TC.user || {};
  const svgUser = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const svgGps  = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const svgLock = `<svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

  // Estado do GPS — usa o módulo global GPS
  let gpsStatus, gpsClass;
  if (IS_DEMO) {
    gpsStatus = "Desativado no modo demo"; gpsClass = "muted";
  } else if (!GPS.scheduled) {
    gpsStatus = "Aguardando login";        gpsClass = "muted";
  } else if (GPS.active) {
    gpsStatus = "Ativo — enviando posição";gpsClass = "ok";
  } else {
    gpsStatus = "Fora do expediente (08h–18h)"; gpsClass = "warn";
  }

  main.innerHTML = `
    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgUser}Seus dados</h2>
      </div>
      <div class="cli-conta-hero">
        <div class="cli-conta-avatar" style="${user.foto_url ? "padding:0;overflow:hidden;" : ""}">
          ${user.foto_url
            ? `<img src="${user.foto_url}" alt="foto" style="width:100%;height:100%;object-fit:cover;">`
            : escapeHtml(_iniciaisNome(user.nome))}
        </div>
        <div class="cli-conta-hero-text">
          <div class="cli-conta-nome">${escapeHtml(user.nome || "—")}</div>
          <div class="cli-conta-email">${escapeHtml(user.email || "—")}</div>
        </div>
      </div>
      ${user.especialidade ? `
        <div class="cli-info-row">
          <span class="cli-info-row-label">Especialidade</span>
          <span class="cli-info-row-value">${escapeHtml(user.especialidade)}</span>
        </div>` : ""}
    </section>

    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgGps}Localização (GPS)</h2>
      </div>
      <div class="cli-info-row">
        <span class="cli-info-row-label">Status</span>
        <span class="cli-info-row-value" id="tecContaGpsStatus">${escapeHtml(gpsStatus)}</span>
      </div>
      <div class="cli-info-row">
        <span class="cli-info-row-label">Janela ativa</span>
        <span class="cli-info-row-value">${String(GPS_HORA_INI).padStart(2,"0")}:00 às ${String(GPS_HORA_FIM).padStart(2,"0")}:00</span>
      </div>
    </section>

    <section class="card tec-card">
      <div class="cardHead">
        <h2>${svgLock}Alterar senha</h2>
      </div>
      <form id="tecSenhaForm" class="cli-form" novalidate autocomplete="off">
        <label class="cli-form-field">
          <span class="rc-label">Senha atual</span>
          <input class="input" type="password" id="tecSenhaAtual" autocomplete="current-password" required>
        </label>
        <label class="cli-form-field">
          <span class="rc-label">Nova senha</span>
          <input class="input" type="password" id="tecSenhaNova" autocomplete="new-password" minlength="6" required>
          <span class="hint">Mínimo 6 caracteres</span>
        </label>
        <label class="cli-form-field">
          <span class="rc-label">Confirmar nova senha</span>
          <input class="input" type="password" id="tecSenhaNova2" autocomplete="new-password" minlength="6" required>
        </label>

        <div class="alert" id="tecSenhaAlert" hidden></div>

        <button type="submit" class="btn btnAccent btn-lg" id="tecSenhaSubmit">
          <span class="btn-label">Salvar nova senha</span>
        </button>
      </form>
    </section>

    <button type="button" class="btn btn-lg cli-conta-logout" id="tecBtnSair">
      <span class="btn-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:8px">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sair da conta
      </span>
    </button>`;

  document.getElementById("tecSenhaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitTrocarSenhaTec();
  });
  document.getElementById("tecBtnSair").addEventListener("click", () => {
    pararPollingTecnico();
    gpsStop();
    Storage.clear();
    document.getElementById("loginSenha").value = "";
    hideAlert(document.getElementById("loginAlert"));
    showScreen("login");
  });
}

async function submitTrocarSenhaTec() {
  const atual = document.getElementById("tecSenhaAtual").value;
  const nova  = document.getElementById("tecSenhaNova").value;
  const nova2 = document.getElementById("tecSenhaNova2").value;
  const alertEl = document.getElementById("tecSenhaAlert");
  const btn = document.getElementById("tecSenhaSubmit");

  hideAlert(alertEl);
  if (!atual || !nova || !nova2)  return showAlert(alertEl, "Preencha todos os campos.", "error");
  if (nova.length < 6)            return showAlert(alertEl, "A nova senha deve ter pelo menos 6 caracteres.", "error");
  if (nova !== nova2)             return showAlert(alertEl, "As novas senhas não conferem.", "error");
  if (nova === atual)             return showAlert(alertEl, "A nova senha precisa ser diferente da atual.", "error");

  if (IS_DEMO) {
    showAlert(alertEl, "Modo demo: alteração de senha não disponível.", "info");
    return;
  }

  setBtnLoading(btn, true);
  try {
    await api("/auth/trocar-senha", {
      method: "POST",
      body: { senha_atual: atual, senha_nova: nova },
    });
    document.getElementById("tecSenhaForm").reset();
    showAlert(alertEl, "Senha atualizada com sucesso.", "success");
  } catch (err) {
    showAlert(alertEl, err.message, "error");
  } finally {
    setBtnLoading(btn, false);
  }
}

// Wire das tabs do técnico (bottom nav). Igual padrão do cliente.
function _bindTecnicoUI() {
  document.querySelectorAll(
    '[data-screen="tecnico-chamados"] [data-tec-tab], [data-screen="tecnico-conta"] [data-tec-tab]'
  ).forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.dataset.tecTab;
      if (tab === "chamados") {
        showScreen("tecnico-chamados");
      } else if (tab === "conta") {
        abrirTelaContaTec();
      }
    });
  });
}
_bindTecnicoUI();

// ============== BOOTSTRAP ==============
// Footer de diagnóstico no login
document.getElementById("apiBase").textContent = API_BASE;
document.getElementById("envInfo").textContent = IS_CAPACITOR ? "Capacitor (nativo)" : "Browser (dev)";

// ============== MODO DEMO ==============
// /app/?demo=1 ou ?demo=tecnico → tela do técnico com dados fake
// /app/?demo=cliente             → tela do cliente/síndico com dados fake
// Útil pra preview de UI sem backend/banco. Não toca em endpoint real,
// não inicia polling. Pra sair do modo demo: /app/ (sem query).
const DEMO_PARAM = new URLSearchParams(window.location.search).get("demo");
const IS_DEMO = DEMO_PARAM != null;
const DEMO_ROLE = DEMO_PARAM === "cliente" ? "cliente" : "tecnico";

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
      id: 142, status: "em_atendimento", prioridade: "p1", categoria: "vazamento",
      titulo: "Vazamento no subsolo, bomba 2 desligou sozinha",
      condominio_nome: "Edifício Solaris",
      condominio_endereco: "Av. Paulista, 1578",
      condominio_bairro: "Bela Vista", condominio_cidade: "São Paulo",
      condominio_lat: -23.5613, condominio_lng: -46.6562,
      criado_em: new Date(now - 35 * min).toISOString(),
    },
    {
      id: 138, status: "aberto", prioridade: "p2", categoria: "bomba_falha",
      titulo: "Bomba 1 não liga após queda de energia",
      condominio_nome: "Residencial Jardim das Flores",
      condominio_endereco: "Rua Augusta, 920",
      condominio_bairro: "Consolação", condominio_cidade: "São Paulo",
      condominio_lat: -23.5478, condominio_lng: -46.6502,
      criado_em: new Date(now - 2 * hour).toISOString(),
    },
    {
      id: 134, status: "aberto", prioridade: "p3", categoria: "nivel_baixo",
      titulo: "Reservatório principal baixou rápido durante a noite",
      condominio_nome: "Condomínio Vila Bella",
      condominio_endereco: "Rua Oscar Freire, 350",
      condominio_bairro: "Jardins", condominio_cidade: "São Paulo",
      condominio_lat: -23.5615, condominio_lng: -46.6716,
      criado_em: new Date(now - 5 * hour).toISOString(),
    },
    {
      id: 131, status: "aberto", prioridade: "p3", categoria: "ruido",
      titulo: "Bomba fazendo barulho estranho desde ontem",
      condominio_nome: "Edifício Atrium",
      condominio_endereco: "Av. Brigadeiro Faria Lima, 2100",
      condominio_bairro: "Itaim Bibi", condominio_cidade: "São Paulo",
      condominio_lat: -23.5760, condominio_lng: -46.6916,
      criado_em: new Date(now - 8 * hour).toISOString(),
    },
    {
      id: 127, status: "aberto", prioridade: "p4", categoria: "manutencao",
      titulo: "Preventiva mensal — março/26",
      condominio_nome: "Condomínio Aurora",
      condominio_endereco: "Rua Haddock Lobo, 595",
      condominio_bairro: "Cerqueira César", condominio_cidade: "São Paulo",
      condominio_lat: -23.5546, condominio_lng: -46.6620,
      criado_em: new Date(now - 1 * day).toISOString(),
    },
    {
      id: 122, status: "aberto", prioridade: "p4", categoria: "outro",
      titulo: "Cliente solicitou orçamento de bomba reserva",
      condominio_nome: "Edifício Maranta",
      condominio_endereco: "Rua Bela Cintra, 1000",
      condominio_bairro: "Consolação", condominio_cidade: "São Paulo",
      condominio_lat: -23.5520, condominio_lng: -46.6530,
      criado_em: new Date(now - 36 * hour).toISOString(),
    },
    {
      id: 115, status: "fechado", prioridade: "p2", categoria: "bomba_falha",
      titulo: "Substituição de selo mecânico bomba 2",
      condominio_nome: "Residencial Pateo São Bento",
      condominio_endereco: "Rua Pamplona, 1620",
      condominio_bairro: "Jardim Paulista", condominio_cidade: "São Paulo",
      condominio_lat: -23.5701, condominio_lng: -46.6651,
      criado_em: new Date(now - 3 * day).toISOString(),
      fechado_em: new Date(now - 2 * day).toISOString(),
    },
    {
      id: 110, status: "fechado", prioridade: "p1", categoria: "sem_agua",
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

// Demo: gera condomínio + reservatórios + alertas + chamados fake
function entrarModoDemoCliente() {
  const now = Date.now();
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  CLI.user = { id: 998, nome: "Síndico Demo", email: "sindico@demo.com", role: "cliente", condominio_id: 1 };
  CLI.condominio = {
    id: 1,
    nome: "Edifício Solaris",
    endereco: "Av. Paulista, 1578",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
  };
  CLI.reservatorios = [
    { id: 1, nome: "Caixa superior", tipo: "superior", device_id: "RES001",
      ultima_leitura: { device_id: "RES001", nivel_pct: 72, bomba_ligada: false, criado_em: new Date(now - 2*min).toISOString() },
      offline: false, alertas_abertos_count: 0 },
    { id: 2, nome: "Cisterna", tipo: "inferior", device_id: "RES002",
      ultima_leitura: { device_id: "RES002", nivel_pct: 28, bomba_ligada: true, criado_em: new Date(now - 4*min).toISOString() },
      offline: false, alertas_abertos_count: 1 },
    { id: 3, nome: "Piscina", tipo: "piscina", device_id: "RES003",
      ultima_leitura: null, offline: true, alertas_abertos_count: 0 },
  ];
  CLI.alertas = [
    { id: 1, device_id: "RES002", tipo: "nivel_baixo", mensagem: "Cisterna abaixo de 30%", criado_em: new Date(now - 30*min).toISOString() },
  ];
  CLI.chamados = [
    {
      id: 201, status: "em_atendimento", prioridade: "p2", categoria: "vazamento",
      titulo: "Vazamento na sala de bombas", tecnico_nome: "Carlos Andrade",
      descricao: "Identificado vazamento na conexão da bomba 1. Necessário avaliação.",
      criado_em: new Date(now - 3*hour).toISOString(), atualizado_em: new Date(now - hour).toISOString(),
      ordem_servico_id: null, os_finalizada_em: null,
    },
    {
      id: 198, status: "fechado", prioridade: "p3", categoria: "manutencao",
      titulo: "Preventiva mensal", tecnico_nome: "Marcos Lima",
      descricao: "Manutenção preventiva das bombas, troca de óleo, checagem geral.",
      criado_em: new Date(now - 5*day).toISOString(), atualizado_em: new Date(now - 4*day).toISOString(),
      fechado_em: new Date(now - 4*day).toISOString(),
      ordem_servico_id: 42, os_finalizada_em: new Date(now - 4*day).toISOString(), os_numero: "OS-2026-0042",
    },
    {
      id: 195, status: "aberto", prioridade: "baixa", categoria: "ruido",
      titulo: "Ruído nas bombas à noite", tecnico_nome: null,
      descricao: "Moradores reclamando de ruído após 22h. Solicito vistoria.",
      criado_em: new Date(now - 8*hour).toISOString(),
      ordem_servico_id: null, os_finalizada_em: null,
    },
  ];
  atualizarHeaderCondo();
  showScreen("cliente-home");
  renderClienteHome({ loading: false });
}

// Se tem token, tenta validar e ir direto pra home
(async () => {
  if (IS_DEMO) {
    if (DEMO_ROLE === "cliente") entrarModoDemoCliente();
    else                          entrarModoDemo();
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
