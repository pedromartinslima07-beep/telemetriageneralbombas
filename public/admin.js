// eslint-disable-next-line no-console
console.log("[telemetria-admin] v16 carregado", new Date().toISOString());
function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}
if (!getToken()) window.location.href = "/login";

// Remove o loader inicial com fade
function _ocultarLoader() {
  const el = document.getElementById("appLoader");
  if (!el) return;
  el.classList.add("fade-out");
  setTimeout(() => el.remove(), 260);
}
// Fallback: garante que o loader some mesmo se o fetch travar
const _loaderTimeout = setTimeout(_ocultarLoader, 4000);

// Aplica body.role-{role} e preenche nome/foto do usuário logado no header
(async () => {
  try {
    const r = await fetch("/admin/me", { headers: authHeaders() });
    if (!r.ok) return;
    const me = await r.json();
    if (me.role) {
      document.body.classList.add(`role-${me.role}`);
      localStorage.setItem("userRole", me.role);
    }

    const roleLabel = { admin: "Admin", gerente: "Admin", operador: "Admin", admin_viewer: "Visualizador", tecnico: "Técnico", cliente: "Cliente" }[me.role] || (me.role || "");
    const nome = me.nome || "Usuário";

    const el = id => document.getElementById(id);
    const sidebarRole  = el("sidebarUserRole");
    const sidebarLabel = el("sidebarUserLabel");
    const sidebarAv    = el("sidebarUserAvatar");
    const topbarName   = el("topbarUserName");
    const topbarRole   = el("topbarUserRole");
    const topbarAv     = el("topbarUserAvatar");

    if (sidebarRole)  sidebarRole.textContent  = roleLabel;
    if (sidebarLabel) sidebarLabel.textContent = nome;
    if (topbarName)   topbarName.textContent   = nome;
    if (topbarRole)   topbarRole.textContent   = roleLabel;

    if (me.foto_url) {
      const img = `<img src="${escapeHtml(me.foto_url)}" alt="${escapeHtml(nome)}">`;
      if (sidebarAv) sidebarAv.innerHTML = img;
      if (topbarAv)  topbarAv.innerHTML  = img;
    }
  } catch (_) {}
  finally {
    clearTimeout(_loaderTimeout);
    _ocultarLoader();
  }
})();

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== NAVEGAÇÃO POR SEÇÕES =====
const _sectionTitles = {
  dashboard:        "Dashboard",
  telemetria:       "Telemetria",
  mapa:             "Mapa",
  alertas:          "Alertas",
  whatsapp:         "Atendimento",
  chamados:         "Chamados",
  "ordens-servico": "Ordens de Serviço",
  orcamentos:       "Orçamentos",
  contratos:        "Contratos",
  cadastros:        "Clientes",
  tecnicos:         "Colaboradores",
  planos:           "Planos de manutenção",
  relatorios:       "Relatórios",
  config:           "Configurações",
};

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

  _telSecaoAtiva = (name === "telemetria");
  if (_telSecaoAtiva) {
    renderTelemetriaAvancada();
    carregarHistoricoTelemetria();
  }

  if (name === "chamados") {
    for (const ch of (_chamadosData || [])) _chamadosIdsAck.add(ch.id);
    atualizarBadgesChamados();
  }
  if (name === "alertas") {
    for (const a  of (_alertasAbertos   || [])) _alertasIdsAck.add(`al-${a.id}`);
    for (const ch of _chamadosP12Abertos())     _alertasIdsAck.add(`ch-${ch.id}`);
    _atualizarBadgeAlertas();
  }
  if (name === "relatorios") {
    renderRelatorios();
  }
  if (name === "config") {
    renderConfiguracoes();
  }
  if (name === "mapa") {
    // O Leaflet pode não ter sido criado ainda (seção estava display:none e
    // a primeira chamada de renderSecaoMapa fez early-return). Garante que
    // tenta de novo agora que o container está visível e com dimensões.
    setTimeout(() => renderSecaoMapa(), 260);
  }
  if (name === "ordens-servico") {
    renderSecaoOS();
  }
  if (name === "planos") {
    _pmBindEventos();
    carregarPlanos();
    _pmCarregarZonas();
  }
  if (name === "orcamentos") {
    _orcModoBindEventos();
    _avBindEventos();
    _orcBindEventos();
    carregarAvulsos();
    carregarOrcamentos();
  }
  if (name === "contratos") {
    _ctrsBindEventos();
    _ctrsCarregar();
  }
  // Dashboard também tem Leaflet (mc-map). Quando o user volta pra dashboard,
  // revalida o tamanho — pode ter ficado com tiles travados se foi criado
  // antes do container medir.
  if (name === "dashboard" && _mcMap) {
    setTimeout(() => _mcMap.invalidateSize(), 0);
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userRole");
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

function tipoBadge(tipo) {
  if (tipo === "nivel_muito_baixo") return badge("NÍVEL MUITO BAIXO", "bad");
  if (tipo === "nivel_baixo") return badge("NÍVEL BAIXO", "warn");
  if (tipo === "dispositivo_offline") return badge("OFFLINE", "bad");
  return badge(String(tipo || "").replaceAll("_", " "), "warn");
}

function tankHtml(nivel, nivelPct) {
  const n = String(nivel || "").toLowerCase();
  const map = {
    alto:        { fallbackPct: 85, cls: "tank-alto"        },
    medio:       { fallbackPct: 60, cls: "tank-medio"       },
    baixo:       { fallbackPct: 30, cls: "tank-baixo"       },
    muito_baixo: { fallbackPct: 10, cls: "tank-muito-baixo" },
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

const RC_ICONS = {
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
  warn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  danger:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  ok:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
};

const RC_META = {
  offline:           { icon: 'offline',  label: 'Offline' },
  nivel_baixo:       { icon: 'warn',     label: 'Nível baixo' },
  nivel_muito_baixo: { icon: 'danger',   label: 'Muito baixo' },
  com_alerta:        { icon: 'warn',     label: 'Cond. com alerta' },
  ok:                { icon: 'ok',       label: 'Cond. OK' },
};

function resumoCard(titulo, valorHtml, kind, cardKey) {
  const kindCls =
    kind === "bad"  ? "rc-bad"  :
    kind === "warn" ? "rc-warn" :
    kind === "ok"   ? "rc-ok"   : "rc-neutral";

  const meta = RC_META[cardKey] || {};
  const iconKey = meta.icon || (kind === 'bad' ? 'danger' : kind === 'warn' ? 'warn' : 'ok');
  const iconSvg = RC_ICONS[iconKey] || RC_ICONS.ok;

  return `
    <button class="rc ${kindCls}" data-card="${cardKey}">
      <div class="rc-head">
        <div class="rc-icon">${iconSvg}</div>
        <div class="rc-label">${titulo}</div>
      </div>
      <div class="rc-value">${valorHtml}</div>
    </button>
  `;
}

// ===== estado =====
let _statusData = [];
let _alertasAbertos = [];
let _alertasPorDevice = new Map();
let _condominios = [];
let _chamadosData = [];
let _conversasData = [];
let _usuariosData = [];
let _tecnicosData = [];

// ===== RELATÓRIOS — estado =====
let _relTab    = "chamados";
let _relChDados = [], _relAlDados = [], _relTelDados = [];
let _relInDados = { top_condominios: [], categorias_whatsapp: [], totais: {} };
let _relResDados = null; // cache reservatórios (telemetria + alertas merged)

// chamados já vistos — usado para detectar novos e disparar pulso/beep
let _chamadosIdsVistos = new Set();
let _chamadosInicializado = false;

// IDs reconhecidos pelo admin ao visitar a seção — badge some ao entrar, volta ao chegar item novo
let _chamadosIdsAck  = new Set();
let _alertasIdsAck   = new Set();

// charts ApexCharts ativos no drawer (id reservatório → instance)
let _drawerGauges = new Map();

// ===== TELEMETRIA AVANÇADA — estado =====
let _telFiltroCondominioId = "";
let _telFiltroTipo = "";
let _telHistoricoHoras = 24;
let _telBarChart = null;
let _telHistoricoChart = null;
let _telSecaoAtiva = false;
let _telFiltrosInicializados = false;
let _telHistCondominioId = "";   // filtro do card histórico (independe do filtro do bar chart)
let _telHistReservatorioId = ""; // reservatório selecionado para PDF
let _telHistFiltrosInicializados = false;

// ===== estado do drawer =====
let _drawerCondoId = null;
let _drawerTab = "telemetria";
let _drawerConversaId = null;

const filtros = { texto: "", somenteAlertas: false, somenteOffline: false };

let page = 1;
let pageSize = 25;

// ===== filtros =====
function aplicarFiltros() {
  filtros.texto = (document.getElementById("filtroTexto")?.value || "").trim().toLowerCase();
  filtros.somenteAlertas = !!document.getElementById("filtroSomenteAlertas")?.checked;
  filtros.somenteOffline = !!document.getElementById("filtroSomenteOffline")?.checked;
  page = 1;
  renderCondoCards();
}

function limparFiltros() {
  const ft = document.getElementById("filtroTexto");
  if (ft) ft.value = "";
  const fa = document.getElementById("filtroSomenteAlertas");
  if (fa) fa.checked = false;
  const fo = document.getElementById("filtroSomenteOffline");
  if (fo) fo.checked = false;
  filtros.texto = "";
  filtros.somenteAlertas = false;
  filtros.somenteOffline = false;
  page = 1;
  renderCondoCards();
}

function mudarPageSize() {
  const v = Number(document.getElementById("pageSize")?.value);
  pageSize = Number.isFinite(v) ? v : 25;
  page = 1;
  renderCondoCards();
}

function paginaAnterior() {
  if (page > 1) { page--; renderCondoCards(); }
}

function proximaPagina() {
  const total = getFilteredList().length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (page < maxPage) { page++; renderCondoCards(); }
}

function getFilteredList() {
  let list = Array.isArray(_statusData) ? [..._statusData] : [];

  const t = (filtros.texto || "").trim().toLowerCase();

  if (t) {
    list = list.filter(grupo => {
      const c = grupo.condominio || {};
      if (String(c.nome || "").toLowerCase().includes(t)) return true;

      const reservs = Array.isArray(grupo.reservatorios) ? grupo.reservatorios : [];
      return reservs.some(r =>
        String(r.nome || "").toLowerCase().includes(t) ||
        String(r.device_id || "").toLowerCase().includes(t) ||
        String(r.tipo || "").toLowerCase().includes(t)
      );
    });
  }

  if (filtros.somenteAlertas) {
    list = list.filter(grupo => (grupo.resumo?.alertas_abertos_total ?? 0) > 0);
  }

  if (filtros.somenteOffline) {
    list = list.filter(grupo => (grupo.resumo?.offline_count ?? 0) > 0);
  }

  return list;
}

// ===== admin actions =====
async function fecharAlerta(id) {
  if (!confirm("Fechar alerta " + id + "?")) return;

  const r = await fetch("/alertas/" + id + "/fechar", {
    method: "PATCH",
    headers: authHeaders(),
  });

  if (!r.ok) {
    alert("Erro ao fechar alerta: " + (await r.text()));
    return;
  }

  carregarTudo();
}

async function rodarJobOffline() {
  const r = await fetch("/jobs/verificar-offline", { method: "POST", headers: authHeaders() });
  if (!r.ok) {
    alert("Erro no job OFFLINE: " + (await r.text()));
    return;
  }
  const data = await r.json();
  alert("Verificação OFFLINE executada. Criados: " + data.criados + " | Já existia: " + data.ja_existia);
  carregarTudo();
}

async function criarCondominio() {
  const nome = (document.getElementById("novoNome").value || "").trim();

  // novos campos (crie esses inputs depois no HTML)
  const endereco = (document.getElementById("novoEndereco")?.value || "").trim();
  const bairro = (document.getElementById("novoBairro")?.value || "").trim();
  const cidade = (document.getElementById("novoCidade")?.value || "").trim();
  const uf = (document.getElementById("novoUf")?.value || "").trim();
  const cep = (document.getElementById("novoCep")?.value || "").replace(/\D/g, "");
  const responsavel = (document.getElementById("novoResponsavel")?.value || "").trim();
  const telefone = (document.getElementById("novoTelefone")?.value || "").trim();
  const observacoes = (document.getElementById("novoObs")?.value || "").trim();
  const zona = (document.getElementById("novoZona")?.value || "").trim() || null;
  const ativo = document.getElementById("novoAtivo") ? !!document.getElementById("novoAtivo").checked : true;

  const msg = document.getElementById("msgCadastro");
  if (msg) msg.textContent = "";

  if (!nome) {
    if (msg) msg.textContent = "Preencha o Nome.";
    return;
  }

  const latStr = (document.getElementById("novoLat")?.value || "").trim();
  const lngStr = (document.getElementById("novoLng")?.value || "").trim();
  const lat = latStr === "" ? null : Number(latStr);
  const lng = lngStr === "" ? null : Number(lngStr);

  const payload = {
    nome,
    endereco: endereco || null,
    bairro: bairro || null,
    cidade: cidade || null,
    uf: uf || null,
    cep: cep || null,
    responsavel: responsavel || null,
    telefone: telefone || null,
    observacoes: observacoes || null,
    zona,
    ativo,
    lat,
    lng,
  };

  const r = await fetch("/condominios", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    if (msg) msg.textContent = data.error || ("Erro ao cadastrar (" + r.status + ")");
    return;
  }

  if (msg) msg.textContent = `✅ Condomínio cadastrado: ${data.nome} (ID ${data.id})`;

  // limpa apenas os obrigatórios (e os outros se existirem)
  document.getElementById("novoNome").value = "";
  if (document.getElementById("novoEndereco")) document.getElementById("novoEndereco").value = "";
  if (document.getElementById("novoBairro")) document.getElementById("novoBairro").value = "";
  if (document.getElementById("novoCidade")) document.getElementById("novoCidade").value = "";
  if (document.getElementById("novoUf")) document.getElementById("novoUf").value = "";
  if (document.getElementById("novoResponsavel")) document.getElementById("novoResponsavel").value = "";
  if (document.getElementById("novoTelefone")) document.getElementById("novoTelefone").value = "";
  if (document.getElementById("novoObs")) document.getElementById("novoObs").value = "";
  if (document.getElementById("novoZona")) document.getElementById("novoZona").value = "";
  if (document.getElementById("novoAtivo")) document.getElementById("novoAtivo").checked = true;
  if (document.getElementById("novoLat")) document.getElementById("novoLat").value = "";
  if (document.getElementById("novoLng")) document.getElementById("novoLng").value = "";
  if (document.getElementById("novoCep")) document.getElementById("novoCep").value = "";
  const cepMsg = document.getElementById("novoCepMsg");
  if (cepMsg) { cepMsg.className = "cep-msg"; cepMsg.textContent = ""; }
  const locMsg = document.getElementById("novoLocMsg");
  if (locMsg) { locMsg.className = "loc-msg"; locMsg.textContent = ""; }
  // reseta o pino do mini-mapa para o centro de SP
  const ref = _miniMapas.get("novo");
  if (ref) {
    ref.marker.setLatLng([SP_CENTRO.lat, SP_CENTRO.lng]);
    ref.map.setView([SP_CENTRO.lat, SP_CENTRO.lng], SP_CENTRO.zoom);
  }

  carregarTudo();
}

function renderSelectCondominiosCliente() {
  const sel = document.getElementById("cliCondominio");
  if (!sel) return;

  const list = Array.isArray(_condominios) ? _condominios : [];

  const prev = sel.value;

  sel.innerHTML =
    `<option value="">Selecione...</option>` +
    list.map(c => `<option value="${c.id}">${c.nome || "-"} (ID ${c.id})</option>`).join("");

  if (prev) sel.value = prev;
}

async function criarCliente() {
  const nome = (document.getElementById("cliNome").value || "").trim();
  const email = (document.getElementById("cliEmail").value || "").trim().toLowerCase();
  const senha = (document.getElementById("cliSenha").value || "").trim();
  const condominio_id = Number(document.getElementById("cliCondominio").value);

  const msg = document.getElementById("msgCliente");
  if (msg) msg.textContent = "";

  if (!nome || !email || !senha || !condominio_id) {
    if (msg) msg.textContent = "Preencha nome, email, senha e selecione o condomínio.";
    return;
  }

  const payload = {
    nome,
    email,
    senha,
    role: "cliente",
    condominio_id
  };

  try {
    if (msg) msg.textContent = "Criando...";

    const r = await fetch("/auth/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      if (msg) msg.textContent = data.error || ("Erro ao criar (" + r.status + ")");
      return;
    }

    if (msg) msg.textContent = `✅ Cliente criado: ${data.nome} (${data.email})`;

    // limpa inputs
    document.getElementById("cliNome").value = "";
    document.getElementById("cliEmail").value = "";
    document.getElementById("cliSenha").value = "";
    document.getElementById("cliCondominio").value = "";

    carregarTudo();
  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

async function criarAdminViewer() {
  const nome  = document.getElementById("avNome")?.value?.trim();
  const email = document.getElementById("avEmail")?.value?.trim().toLowerCase();
  const senha = document.getElementById("avSenha")?.value?.trim();
  const role  = document.getElementById("avRole")?.value || "gerente";
  const msg   = document.getElementById("msgAdminViewer");

  if (!nome || !email || !senha) {
    if (msg) msg.textContent = "Preencha todos os campos.";
    return;
  }

  try {
    const r = await fetch("/auth/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ nome, email, senha, role }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (msg) msg.textContent = e.error || "Erro ao criar acesso.";
      return;
    }
    const labels = { gerente: "Administrador", operador: "Operador" };
    if (msg) msg.textContent = `Acesso ${labels[role] || role} criado!`;
    document.getElementById("avNome").value  = "";
    document.getElementById("avEmail").value = "";
    document.getElementById("avSenha").value = "";
  } catch {
    if (msg) msg.textContent = "Erro de conexão.";
  }
}

// ===== carregamento =====
function montarMapaAlertas() {
  _alertasPorDevice = new Map();
  for (const a of _alertasAbertos) {
    const dev = a.device_id;
    if (!_alertasPorDevice.has(dev)) _alertasPorDevice.set(dev, []);
    _alertasPorDevice.get(dev).push(a);
  }
}

function renderResumo() {
  // Esses 3 ainda podem vir de alertas abertos (ok)
  let baixo = 0, muitoBaixo = 0;

  for (const a of _alertasAbertos) {
    if (a.tipo === "nivel_baixo") baixo++;
    else if (a.tipo === "nivel_muito_baixo") muitoBaixo++;
  }

  // ✅ OFFLINE agora vem do STATUS (resumo.offline_count), não de alertas
  const grupos = Array.isArray(_statusData) ? _statusData : [];

  let offlineTotal = 0;
  let condsComAlerta = 0;
  let condsOk = 0;

  for (const g of grupos) {
    const off = g?.resumo?.offline_count ?? 0;
    const al = g?.resumo?.alertas_abertos_total ?? 0;

    offlineTotal += off;
    if (al > 0) condsComAlerta++;

    // Condomínio OK = sem alertas e sem offline
    if (al === 0 && off === 0) condsOk++;
  }

  const grid = document.getElementById("resumoGrid");
  if (!grid) return;

  const cards = [
    { titulo: "OFFLINE", valor: offlineTotal, kind: offlineTotal > 0 ? "bad" : "ok", key: "offline" },
    { titulo: "NÍVEL BAIXO", valor: baixo, kind: baixo > 0 ? "warn" : "ok", key: "nivel_baixo" },
    { titulo: "MUITO BAIXO", valor: muitoBaixo, kind: muitoBaixo > 0 ? "bad" : "ok", key: "nivel_muito_baixo" },
    { titulo: "COND. COM ALERTA", valor: condsComAlerta, kind: condsComAlerta > 0 ? "warn" : "ok", key: "com_alerta" },
    { titulo: "COND. OK", valor: condsOk, kind: "ok", key: "ok" },
  ];

  grid.innerHTML = cards.map(c => resumoCard(c.titulo, c.valor, c.kind, c.key)).join("");
}

// ===================================================================
// MISSION CONTROL — mapa, alertas críticos, atividade
// ===================================================================

function _mcStatusKind(item) {
  const condoId = item?.condominio?.id;
  const off = item?.resumo?.offline_count ?? 0;
  const al  = item?.resumo?.alertas_abertos_total ?? 0;
  const chAbertos = (Array.isArray(_chamadosData) ? _chamadosData : [])
    .filter(ch => ch.condominio_id === condoId && ch.status !== 'fechado');
  if (off > 0 || chAbertos.some(ch => ch.prioridade === 'p1')) return 'bad';
  if (al > 0 || chAbertos.length > 0) return 'warn';
  return 'ok';
}

// ---- Mapa do dashboard (mini Leaflet) ----
// Singleton: criado uma vez ao primeiro renderMcMap, depois apenas atualiza markers.
let _mcMap = null;
let _mcMarkers = new Map();    // condoId → L.Marker
let _mcTecMarkers = new Map(); // tecnico_id → L.Marker (técnicos no mc map)

function _mcPinIcon(kind) {
  // Pino de condomínio: ícone de prédio (SVG branco) sobre fundo colorido
  // conforme status. Pulse ao redor pra warn/bad chamar atenção à distância.
  const svg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5"/>
      <path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M16 15h.01"/>
      <path d="M10 21v-4h4v4"/>
    </svg>`;
  return L.divIcon({
    className: "mc-pin-leaflet-wrap",
    html: `<div class="mc-pin-condo ${kind}">${svg}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Tiles carregados diretamente do CDN do Carto no browser.
// O proxy via backend causava rate-limit no IP do servidor Railway.
function _criarTileLayer(map, onLoad) {
  const layer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    subdomains: "abc",
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
    keepBuffer: 4,
    updateWhenIdle: false,
    updateInterval: 100,
    className: "map-tiles-dark",
  }).addTo(map);
  if (onLoad) layer.once("load", onLoad);
  return layer;
}

function renderMcMap() {
  const el = document.getElementById("mcMapCanvas");
  if (!el || typeof L === "undefined") return;

  // Cria o mapa Leaflet na primeira chamada — só quando o container tem
  // dimensões reais. Caso contrário os tiles do Carto não baixam.
  if (!_mcMap) {
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      _esperarDimensao(el, () => renderMcMap());
      return;
    }
    _mcMap = L.map(el, {
      center: [SP_CENTRO.lat, SP_CENTRO.lng],
      zoom: SP_CENTRO.zoom,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false, // não captura scroll da página
    });
    _criarTileLayer(_mcMap);
    requestAnimationFrame(() => _mcMap.invalidateSize());
  }

  const groups = Array.isArray(_statusData) ? _statusData : [];
  const idsAgora = new Set();
  const bounds = [];

  for (const g of groups) {
    const c = g.condominio || {};
    if (!c.id || c.lat == null || c.lng == null) continue;
    idsAgora.add(c.id);
    const kind = _mcStatusKind(g);
    const tooltip = `${c.nome || "Condomínio"} • ${kind === "bad" ? "Crítico" : kind === "warn" ? "Alerta" : "OK"}`;
    let marker = _mcMarkers.get(c.id);
    if (!marker) {
      marker = L.marker([c.lat, c.lng], { icon: _mcPinIcon(kind) }).addTo(_mcMap);
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -8] });
      marker.on("click", () => abrirDrawer(c.id));
      _mcMarkers.set(c.id, marker);
    } else {
      marker.setLatLng([c.lat, c.lng]);
      marker.setIcon(_mcPinIcon(kind));
      marker.setTooltipContent(tooltip);
    }
    bounds.push([c.lat, c.lng]);
  }

  // Remove markers de condomínios que sumiram do _statusData
  for (const [id, marker] of _mcMarkers) {
    if (!idsAgora.has(id)) {
      _mcMap.removeLayer(marker);
      _mcMarkers.delete(id);
    }
  }

  // Ajusta zoom apenas na 1ª vez ou quando os bounds mudaram significativamente
  if (bounds.length > 0 && !_mcMap._fitAplicado) {
    _mcMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    _mcMap._fitAplicado = true;
  }

  // Técnicos ativos com localização conhecida
  const tecIdsAgora = new Set();
  for (const t of (Array.isArray(_tecLocs) ? _tecLocs : [])) {
    const lat = Number(t.lat), lng = Number(t.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    tecIdsAgora.add(t.tecnico_id);
    const iniciais = _tecIconeIniciais(t.nome);
    const stale = _tecStale(t.capturada_em);
    let tm = _mcTecMarkers.get(t.tecnico_id);
    if (!tm) {
      tm = L.marker([lat, lng], { icon: _tecPinIcon(iniciais, stale), zIndexOffset: 1000 }).addTo(_mcMap);
      _mcTecMarkers.set(t.tecnico_id, tm);
    } else {
      tm.setLatLng([lat, lng]);
      tm.setIcon(_tecPinIcon(iniciais, stale));
    }
    const staleLabel = stale ? ` · ⚠ sem sinal (${_tempoRelativo(t.capturada_em)})` : "";
    tm.bindTooltip(`${t.nome || "Técnico"}${staleLabel}`, { direction: "top", offset: [0, -8] });
  }
  for (const [id, tm] of _mcTecMarkers) {
    if (!tecIdsAgora.has(id)) { _mcMap.removeLayer(tm); _mcTecMarkers.delete(id); }
  }
}

function _mcAlertIconFor(tipo) {
  if (tipo === "dispositivo_offline") {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>';
  }
  if (tipo === "nivel_muito_baixo") {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8M12 14v.01"/><path d="M5 12a7 7 0 1 0 14 0"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
}

function _mcDeviceCondoName(deviceId) {
  // Procura o condomínio associado ao device_id
  for (const g of _statusData || []) {
    const r = (g.reservatorios || []).find(r => r.device_id === deviceId);
    if (r) return g.condominio?.nome || deviceId;
  }
  return deviceId;
}

function _mcRelTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)     return `${Math.floor(diff)}s atrás`;
  if (diff < 3600)   return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function renderMcAlerts() {
  const wrap = document.getElementById("mcAlertsList");
  if (!wrap) return;

  const itens = [];

  // Telemetria: offline e nível crítico têm prioridade máxima
  for (const a of (_alertasAbertos || [])) {
    const peso = a.tipo === "dispositivo_offline" ? 0
               : a.tipo === "nivel_muito_baixo"   ? 1
               : a.tipo === "nivel_baixo"          ? 2 : 3;
    itens.push({
      peso,
      kind: (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn",
      icon: _mcAlertIconFor(a.tipo),
      titulo: _mcDeviceCondoName(a.device_id),
      sub: String(a.tipo || "").replaceAll("_", " ") + (a.mensagem ? ` • ${a.mensagem}` : ""),
      criado_em: a.criado_em,
    });
  }

  const _iconChamado = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

  // Chamados P1/P2 abertos
  for (const ch of _chamadosP12Abertos()) {
    const peso = ch.prioridade === "p1" ? 0 : 1;
    itens.push({
      peso,
      kind: ch.prioridade === "p1" ? "bad" : "warn",
      icon: _iconChamado,
      titulo: ch.titulo || `Chamado #${ch.id}`,
      sub: `Chamado ${String(ch.prioridade || "").toUpperCase()} • ${ch.condominio_nome || "—"}`,
      criado_em: ch.criado_em,
    });
  }

  itens.sort((a, b) => a.peso - b.peso || new Date(b.criado_em) - new Date(a.criado_em));
  const sorted = itens.slice(0, 6);

  if (!sorted.length) {
    wrap.innerHTML = `<div class="mc-empty">Nenhum alerta crítico no momento ✓</div>`;
    return;
  }

  wrap.innerHTML = sorted.map(it => `
    <div class="mc-alert-row" data-action="goto-alertas">
      <div class="mc-alert-icon ${it.kind}">${it.icon}</div>
      <div class="mc-alert-main">
        <div class="mc-alert-title">${it.titulo}</div>
        <div class="mc-alert-sub">${it.sub}</div>
      </div>
      <div class="mc-alert-time">${_mcRelTime(it.criado_em)}</div>
    </div>
  `).join("");
}

function renderMcActivity() {
  const wrap = document.getElementById("mcActivityList");
  if (!wrap) return;

  // Combina: alertas recentes + chamados recentes + última leitura de cada condomínio
  const events = [];

  for (const a of _alertasAbertos || []) {
    const kind = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn";
    events.push({
      ts: a.criado_em,
      kind,
      title: `Alerta — ${String(a.tipo || "").replaceAll("_", " ")}`,
      sub: _mcDeviceCondoName(a.device_id),
    });
  }

  for (const ch of _chamadosData || []) {
    const kind = ch.prioridade === "p1" ? "bad"
              : ch.prioridade === "p2"        ? "warn"
              : "info";
    events.push({
      ts: ch.criado_em,
      kind,
      title: `Chamado — ${ch.titulo || "Sem título"}`,
      sub: ch.condominio_nome || "—",
    });
  }

  for (const g of _statusData || []) {
    for (const r of (g.reservatorios || [])) {
      const u = r.ultima_leitura;
      if (!u?.criado_em) continue;
      events.push({
        ts: u.criado_em,
        kind: "ok",
        title: `Leitura — ${r.nome || r.device_id}`,
        sub: `${g.condominio?.nome || ''} • ${u.nivel_pct != null ? Math.round(u.nivel_pct) + '%' : ''}`,
      });
    }
  }

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const top = events.slice(0, 12);

  if (!top.length) {
    wrap.innerHTML = `<div class="mc-empty">Aguardando eventos…</div>`;
    return;
  }

  wrap.innerHTML = top.map(e => `
    <div class="mc-act-row">
      <div class="mc-act-stripe ${e.kind}"></div>
      <div class="mc-act-main">
        <div class="mc-act-title">${e.title}</div>
        <div class="mc-act-sub">${e.sub} • ${_mcRelTime(e.ts)}</div>
      </div>
    </div>
  `).join("");
}

function _mcInitials(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || s[0].toUpperCase();
}

function renderMcConversas() {
  const wrap = document.getElementById("mcConvList");
  if (!wrap) return;
  const list = Array.isArray(_conversasData) ? _conversasData.slice(0, 6) : [];
  if (!list.length) {
    wrap.innerHTML = `<div class="mc-empty">Sem conversas recentes</div>`;
    return;
  }
  wrap.innerHTML = list.map(c => {
    const nome = c.cliente_nome || (c.canal === "app" ? "App" : c.telefone) || "Cliente";
    const sub  = c.condominio_nome || (c.canal === "app" ? "via App" : c.telefone) || "";
    const ts = c.ultima_mensagem_em || c.criado_em;
    return `
      <div class="mc-conv-row" data-action="ver-convo-section" data-id="${c.id}">
        <div class="mc-conv-avatar">${_mcInitials(nome)}</div>
        <div class="mc-conv-main">
          <div class="mc-conv-name">${nome}</div>
          <div class="mc-conv-last">${sub}</div>
        </div>
        <div class="mc-conv-time">${_mcRelTime(ts)}</div>
      </div>
    `;
  }).join("");
}

function renderMcTelemetria() {
  const wrap = document.getElementById("mcTelemList");
  if (!wrap) return;
  // Pega últimas leituras dos reservatórios e ordena pelo timestamp
  const items = [];
  for (const g of _statusData || []) {
    for (const r of (g.reservatorios || [])) {
      const u = r.ultima_leitura;
      if (!u) continue;
      items.push({
        name: r.nome || r.device_id,
        condo: g.condominio?.nome || '',
        pct: u.nivel_pct,
        ts: u.criado_em,
      });
    }
  }
  items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const top = items.slice(0, 8);

  if (!top.length) {
    wrap.innerHTML = `<div class="mc-empty">Aguardando leituras…</div>`;
    return;
  }

  wrap.innerHTML = top.map(it => {
    const pct = it.pct == null ? null : Math.max(0, Math.min(100, Number(it.pct)));
    const cls = pct == null ? 'lv-medio'
              : pct >= 60 ? 'lv-alto'
              : pct >= 30 ? 'lv-medio'
              : pct >= 15 ? 'lv-baixo'
              : 'lv-muito-baixo';
    const pctTxt = pct == null ? '—' : Math.round(pct) + '%';
    return `
      <div class="mc-telem-row" title="${it.condo}">
        <div class="mc-telem-name">${it.name}</div>
        <div class="mc-telem-bar"><div class="mc-telem-fill ${cls}" style="width:${pct ?? 0}%"></div></div>
        <div class="mc-telem-pct">${pctTxt}</div>
      </div>
    `;
  }).join("");
}

function renderMcIaInsights() {
  const wrap = document.getElementById("mcIaList");
  if (!wrap) return;
  // Insights derivados dos dados atuais
  const insights = [];
  const groups = _statusData || [];

  const total = groups.length;
  const offline = groups.reduce((s, g) => s + (g?.resumo?.offline_count ?? 0), 0);
  const comAlerta = groups.filter(g => (g?.resumo?.alertas_abertos_total ?? 0) > 0).length;

  const niveisBaixos = groups
    .flatMap(g => (g.reservatorios || []).map(r => ({ g, r })))
    .filter(({ r }) => r.ultima_leitura?.nivel_pct != null && r.ultima_leitura.nivel_pct < 30);

  const chamadosEmergencia = (_chamadosData || []).filter(c => c.prioridade === "p1" && c.status !== "fechado").length;

  if (offline > 0) {
    insights.push({ color: 'violet', text: `${offline} reservatório${offline > 1 ? 's' : ''} offline — investigar conectividade.` });
  }
  if (niveisBaixos.length > 0) {
    insights.push({ color: 'cyan', text: `${niveisBaixos.length} reservatório${niveisBaixos.length > 1 ? 's' : ''} abaixo de 30% — risco crescente.` });
  }
  if (chamadosEmergencia > 0) {
    insights.push({ color: 'amber', text: `${chamadosEmergencia} chamado${chamadosEmergencia > 1 ? 's' : ''} de emergência em aberto.` });
  }
  if (insights.length < 3) {
    insights.push({ color: 'cyan', text: `${total - comAlerta} de ${total} condomínios operando sem alertas.` });
  }
  if (insights.length < 3) {
    insights.push({ color: 'violet', text: `IA pronta para abrir chamados via WhatsApp 24/7.` });
  }

  wrap.innerHTML = insights.slice(0, 4).map(i =>
    `<li><span class="mc-ia-dot ${i.color}"></span>${i.text}</li>`
  ).join("");
}

function atualizarStatusSistema() {
  const el = document.getElementById("sysStatusValue");
  if (!el) return;
  const groups = _statusData || [];
  const offline = groups.reduce((s, g) => s + (g?.resumo?.offline_count ?? 0), 0);
  const comAlerta = groups.filter(g => (g?.resumo?.alertas_abertos_total ?? 0) > 0).length;
  if (offline > 0) el.textContent = `${offline} offline`;
  else if (comAlerta > 0) el.textContent = `${comAlerta} alerta${comAlerta > 1 ? 's' : ''}`;
  else el.textContent = "Operacional";
}

// ============================================================
// TELEMETRIA AVANÇADA
// ============================================================

const TEL_KPI_ICONS = {
  monitorados: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18H5z"/><path d="M5 12c2 1.5 5 1.5 7 0s5-1.5 7 0"/></svg>`,
  nivel:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c4 5 6 8 6 12a6 6 0 1 1-12 0c0-4 2-7 6-12z"/></svg>`,
  bombas:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg>`,
  alertas:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  offline:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
};

const TEL_HIST_COLORS = ["#22d3ee", "#f59e0b", "#a78bfa"]; // cyan, accent, violet

function _telColetarReservatorios() {
  const lista = [];
  for (const g of (_statusData || [])) {
    const condId = g?.condominio?.id;
    const condNome = g?.condominio?.nome || "-";
    for (const r of (g.reservatorios || [])) {
      lista.push({
        ...r,
        condominio_id: condId,
        condominio_nome: condNome,
      });
    }
  }
  return lista;
}

function _telAplicarFiltros(lista) {
  return lista.filter(r => {
    if (_telFiltroCondominioId && String(r.condominio_id) !== String(_telFiltroCondominioId)) return false;
    if (_telFiltroTipo && r.tipo !== _telFiltroTipo) return false;
    return true;
  });
}

function _telCorPct(pct) {
  if (pct == null) return "off";
  if (pct < 20) return "bad";
  if (pct < 40) return "warn";
  return "ok";
}

function _telLvClassDeNivel(nivel) {
  const n = String(nivel || "").toLowerCase();
  return n === "alto" ? "lv-alto"
    : n === "medio" ? "lv-medio"
      : n === "baixo" ? "lv-baixo"
        : n === "muito_baixo" ? "lv-muito-baixo" : "";
}

function renderTelemetriaAvancada() {
  if (!document.getElementById("telKpiGrid")) return;

  popularFiltrosTelemetria();
  popularFiltrosHistorico();
  renderTelKpis();
  renderTelBarChart();
  renderTelCriticos();
  renderTelBombas();
}

function renderTelKpis() {
  const grid = document.getElementById("telKpiGrid");
  if (!grid) return;

  const reservs = _telColetarReservatorios();
  const total = reservs.length;

  let pctSum = 0, pctCount = 0;
  let bombasAtivas = 0, bombasConhecidas = 0;
  let alertas = 0;
  let offline = 0;

  for (const r of reservs) {
    const u = r.ultima_leitura;
    if (u?.nivel_pct != null) { pctSum += u.nivel_pct; pctCount++; }
    if (u?.bomba_ligada === true) bombasAtivas++;
    if (u?.bomba_ligada === true || u?.bomba_ligada === false) bombasConhecidas++;
    alertas += r.alertas_abertos_count || 0;
    if (r.offline) offline++;
  }
  alertas += _chamadosP12Abertos().length;

  const nivelMedio = pctCount > 0 ? Math.round(pctSum / pctCount) : null;

  const cards = [
    { key: "monitorados", label: "RESERVATÓRIOS MONITORADOS", value: total,                                kind: "neutral", icon: "monitorados" },
    { key: "nivel",       label: "NÍVEL MÉDIO GERAL",         value: nivelMedio != null ? nivelMedio + "%" : "—", kind: nivelMedio == null ? "neutral" : nivelMedio < 30 ? "bad" : nivelMedio < 50 ? "warn" : "ok", icon: "nivel" },
    { key: "bombas",      label: "BOMBAS ATIVAS",             value: bombasConhecidas > 0 ? `${bombasAtivas}/${bombasConhecidas}` : "—", kind: bombasAtivas > 0 ? "ok" : "neutral", icon: "bombas" },
    { key: "alertas",     label: "ALERTAS CRÍTICOS",          value: alertas,                              kind: alertas > 0 ? "bad" : "ok",  icon: "alertas" },
    { key: "offline",     label: "DISPOSITIVOS OFFLINE",      value: offline,                              kind: offline > 0 ? "bad" : "ok",  icon: "offline" },
  ];

  grid.innerHTML = cards.map(c => {
    const kindCls = c.kind === "bad" ? "rc-bad" : c.kind === "warn" ? "rc-warn" : c.kind === "ok" ? "rc-ok" : "rc-neutral";
    return `
      <div class="rc ${kindCls}" data-card="tel-${c.key}" style="cursor:default;">
        <div class="rc-head">
          <div class="rc-icon">${TEL_KPI_ICONS[c.icon] || ""}</div>
          <div class="rc-label">${c.label}</div>
        </div>
        <div class="rc-value">${c.value}</div>
      </div>`;
  }).join("");
}

function popularFiltrosTelemetria() {
  const selCond = document.getElementById("telFiltroCondominio");
  const selTipo = document.getElementById("telFiltroTipo");
  if (!selCond || !selTipo) return;

  // Condomínios — preserva seleção
  const prevCond = selCond.value;
  const conds = (_statusData || []).map(g => g.condominio).filter(Boolean);
  selCond.innerHTML = `<option value="">Todos os condomínios</option>` +
    conds.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  if (prevCond && conds.some(c => String(c.id) === prevCond)) selCond.value = prevCond;
  else _telFiltroCondominioId = "";

  // Tipos únicos
  const prevTipo = selTipo.value;
  const tipos = [...new Set(_telColetarReservatorios().map(r => r.tipo).filter(Boolean))].sort();
  selTipo.innerHTML = `<option value="">Todos os tipos</option>` +
    tipos.map(t => `<option value="${t}">${t}</option>`).join("");
  if (prevTipo && tipos.includes(prevTipo)) selTipo.value = prevTipo;
  else _telFiltroTipo = "";

  if (!_telFiltrosInicializados) {
    selCond.addEventListener("change", () => {
      _telFiltroCondominioId = selCond.value;
      renderTelBarChart();
      renderTelCriticos();
      renderTelBombas();
    });
    selTipo.addEventListener("change", () => {
      _telFiltroTipo = selTipo.value;
      renderTelBarChart();
      renderTelCriticos();
      renderTelBombas();
    });
    _telFiltrosInicializados = true;
  }
}

function renderTelBarChart() {
  const el = document.getElementById("telNiveisChart");
  const empty = document.getElementById("telNiveisEmpty");
  if (!el || typeof ApexCharts === "undefined") return;

  const reservs = _telAplicarFiltros(_telColetarReservatorios())
    .filter(r => r.ultima_leitura?.nivel_pct != null)
    .sort((a, b) => (a.condominio_nome || "").localeCompare(b.condominio_nome || "") || (a.nome || "").localeCompare(b.nome || ""));

  if (reservs.length === 0) {
    if (_telBarChart) { try { _telBarChart.destroy(); } catch (_) {} _telBarChart = null; }
    el.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  const labels = reservs.map(r => `${r.nome || "Res."} · ${r.condominio_nome.slice(0, 14)}`);
  const data = reservs.map(r => Math.round(r.ultima_leitura.nivel_pct));
  const cores = reservs.map(r => {
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
      labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, rotate: -32, hideOverlappingLabels: false, trim: true },
      axisBorder: { color: "rgba(255,255,255,.06)" },
      axisTicks: { color: "rgba(255,255,255,.06)" },
    },
    yaxis: {
      min: 0, max: 100,
      labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, formatter: (v) => v + "%" },
    },
    grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3, padding: { top: 10, right: 10, bottom: 0, left: 10 } },
    legend: { show: false },
    tooltip: {
      theme: "dark",
      y: { formatter: (v) => v + "%" },
    },
    fill: {
      type: "gradient",
      gradient: { shade: "dark", type: "vertical", shadeIntensity: .4, opacityFrom: .95, opacityTo: .7, stops: [0, 100] },
    },
  };

  if (_telBarChart) {
    _telBarChart.updateOptions(opts, false, true);
  } else {
    el.innerHTML = "";
    _telBarChart = new ApexCharts(el, opts);
    _telBarChart.render();
  }
}

function renderTelCriticos() {
  const list = document.getElementById("telCriticosList");
  if (!list) return;

  const reservs = _telAplicarFiltros(_telColetarReservatorios());
  const criticos = reservs
    .map(r => {
      const u = r.ultima_leitura;
      const pct = u?.nivel_pct;
      const offline = !!r.offline;
      const alertas = r.alertas_abertos_count || 0;
      let kind = null, prioridade = 999;
      if (offline)                      { kind = "off";  prioridade = 0; }
      else if (pct != null && pct < 20) { kind = "bad";  prioridade = 1; }
      else if (pct != null && pct < 40) { kind = "warn"; prioridade = 2; }
      else if (alertas > 0)             { kind = "warn"; prioridade = 3; }
      return kind ? { r, pct, offline, alertas, kind, prioridade } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.prioridade - b.prioridade || ((a.pct ?? 100) - (b.pct ?? 100)))
    .slice(0, 12);

  if (criticos.length === 0) {
    list.innerHTML = `<div class="mc-empty">Tudo dentro dos parâmetros ✓</div>`;
    return;
  }

  const ICON_BAD  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const ICON_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  const ICON_OFF  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;

  list.innerHTML = criticos.map(({ r, pct, offline, alertas, kind }) => {
    const icone = kind === "bad" ? ICON_BAD : kind === "off" ? ICON_OFF : ICON_WARN;
    const sub = offline
      ? `${r.condominio_nome} · OFFLINE há ${r.minutos_sem_atualizar ?? "?"}min`
      : pct != null
        ? `${r.condominio_nome}${alertas > 0 ? ` · ${alertas} alerta${alertas > 1 ? "s" : ""}` : ""}`
        : `${r.condominio_nome}${alertas > 0 ? ` · ${alertas} alerta${alertas > 1 ? "s" : ""}` : ""}`;
    const pctTxt = offline ? "OFF" : (pct != null ? pct + "%" : "—");
    return `
      <button class="tel-crit-row" data-action="ver-condo" data-id="${r.condominio_id}">
        <span class="tel-crit-icon ${kind}">${icone}</span>
        <span class="tel-crit-main">
          <span class="tel-crit-title">${r.nome || "Reservatório"}</span>
          <span class="tel-crit-sub">${sub}</span>
        </span>
        <span class="tel-crit-pct ${kind}">${pctTxt}</span>
      </button>`;
  }).join("");
}

function renderTelBombas() {
  const tbody = document.getElementById("telBombasBody");
  const summary = document.getElementById("telBombasSummary");
  if (!tbody) return;

  // mostra/oculta coluna de ações e botão + Novo conforme permissão
  const acoesHeader = document.getElementById("telBombasAcoesHeader");
  const btnNovo = document.getElementById("btnNovoReservatorio");
  if (acoesHeader) acoesHeader.style.display = _isMaster ? "" : "none";
  if (btnNovo) btnNovo.style.display = _isMaster ? "" : "none";

  const reservs = _telAplicarFiltros(_telColetarReservatorios())
    .sort((a, b) => (a.condominio_nome || "").localeCompare(b.condominio_nome || "") || (a.nome || "").localeCompare(b.nome || ""));

  if (summary) {
    const on = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true).length;
    const known = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true || r.ultima_leitura?.bomba_ligada === false).length;
    summary.textContent = known > 0 ? `${on} de ${known} ligadas` : `${reservs.length} reservatórios`;
  }

  const cols = _isMaster ? 6 : 5;
  if (reservs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols}" class="mc-empty" style="padding:24px;">Nenhum resultado para os filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = reservs.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    const corPct = _telCorPct(pct);
    const bombaCls = u?.bomba_ligada === true ? "on" : u?.bomba_ligada === false ? "off" : "uk";
    const bombaLbl = u?.bomba_ligada === true ? "LIGADA" : u?.bomba_ligada === false ? "DESLIGADA" : "—";
    let atualizacao = "—";
    if (u?.criado_em) {
      const mins = Math.round((Date.now() - new Date(u.criado_em)) / 60000);
      if (mins < 60) atualizacao = `há ${mins}min`;
      else if (mins < 1440) atualizacao = `há ${Math.round(mins / 60)}h`;
      else atualizacao = fmtData(u.criado_em);
    }
    const offlineTag = r.offline ? ` <span class="badge b-bad" style="margin-left:6px;font-size:9px;padding:1px 5px;">OFFLINE</span>` : "";
    const acoesTd = _isMaster
      ? `<td style="white-space:nowrap;">
          <button class="btn btn-sm" data-action="editar-reservatorio" data-id="${r.id}">Editar</button>
          <button class="btn btn-sm" data-action="regen-res-key" data-id="${r.id}" style="margin-left:4px;">Nova Key</button>
          <button class="btn btn-sm btnDanger" data-action="excluir-reservatorio" data-id="${r.id}" data-nome="${(r.nome || "").replaceAll('"', "&quot;")}" style="margin-left:4px;">Excluir</button>
        </td>`
      : "";
    return `
      <tr>
        <td><strong>${r.nome || "—"}</strong><div style="font-size:10.5px;color:var(--muted2);">${r.tipo || ""}</div></td>
        <td>${r.condominio_nome || "—"}</td>
        <td><span class="tel-bomba-pill ${bombaCls}">${bombaLbl}</span></td>
        <td><span class="tel-bomba-pct ${corPct === "off" ? "" : corPct}">${pct != null ? pct + "%" : "—"}</span></td>
        <td style="color:var(--muted);">${atualizacao}${offlineTag}</td>
        ${acoesTd}
      </tr>`;
  }).join("");
}

// ----- histórico (line chart) -----
function _telEscolherReservatoriosParaHistorico() {
  const todos = _telColetarReservatorios().filter(r => r.device_id);
  if (todos.length === 0) return [];

  if (_telHistCondominioId) {
    const doCondo = todos.filter(r => String(r.condominio_id) === String(_telHistCondominioId));

    if (_telHistReservatorioId) {
      const escolhido = doCondo.find(r => String(r.id) === String(_telHistReservatorioId));
      if (escolhido) return [escolhido];
    }

    // todos do condomínio, limitando a 3 para não poluir o gráfico
    return doCondo.slice(0, 3);
  }

  // sem filtro: top 3 mais críticos (offline > nivel mais baixo > alertas)
  return todos
    .map(r => {
      const u = r.ultima_leitura;
      const pct = u?.nivel_pct ?? 999;
      const score = (r.offline ? 0 : 1000) + pct - (r.alertas_abertos_count || 0) * 5;
      return { r, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(x => x.r);
}

function popularFiltrosHistorico() {
  const selCond = document.getElementById("telHistCondominio");
  const selRes  = document.getElementById("telHistReservatorio");
  const btnPdf  = document.getElementById("btnTelExportarPdf");
  if (!selCond || !selRes) return;

  // condomínios
  const prevCond = selCond.value;
  const conds = (_statusData || []).map(g => g.condominio).filter(Boolean);
  selCond.innerHTML = `<option value="">— Auto: 3 mais críticos —</option>` +
    conds.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  if (prevCond && conds.some(c => String(c.id) === prevCond)) {
    selCond.value = prevCond;
  } else {
    _telHistCondominioId = "";
  }

  // reservatórios do condomínio selecionado
  _telPopularSelectReservatoriosHist();

  if (!_telHistFiltrosInicializados) {
    selCond.addEventListener("change", () => {
      _telHistCondominioId = selCond.value;
      _telHistReservatorioId = "";
      _telPopularSelectReservatoriosHist();
      carregarHistoricoTelemetria();
    });
    selRes.addEventListener("change", () => {
      _telHistReservatorioId = selRes.value;
      _telAtualizarBotaoPdf();
      carregarHistoricoTelemetria();
    });
    btnPdf?.addEventListener("click", exportarPdfHistorico);
    _telHistFiltrosInicializados = true;
  }

  _telAtualizarBotaoPdf();
}

function _telPopularSelectReservatoriosHist() {
  const selRes = document.getElementById("telHistReservatorio");
  if (!selRes) return;

  if (!_telHistCondominioId) {
    selRes.innerHTML = `<option value="">Escolha o condomínio primeiro</option>`;
    selRes.disabled = true;
    _telAtualizarBotaoPdf();
    return;
  }

  const reservs = _telColetarReservatorios()
    .filter(r => String(r.condominio_id) === String(_telHistCondominioId) && r.device_id);

  const prev = selRes.value;
  selRes.innerHTML = `<option value="">Todos os reservatórios (até 3)</option>` +
    reservs.map(r => `<option value="${r.id}">${r.nome || "Reservatório " + r.id}</option>`).join("");
  selRes.disabled = reservs.length === 0;
  if (prev && reservs.some(r => String(r.id) === prev)) {
    selRes.value = prev;
  } else {
    _telHistReservatorioId = "";
  }
  _telAtualizarBotaoPdf();
}

function _telAtualizarBotaoPdf() {
  const btnPdf = document.getElementById("btnTelExportarPdf");
  if (!btnPdf) return;
  // PDF precisa de um reservatório específico
  btnPdf.disabled = !_telHistReservatorioId;
  btnPdf.title = _telHistReservatorioId
    ? "Exportar relatório PDF deste reservatório"
    : "Selecione um reservatório para exportar PDF";
}

async function exportarPdfHistorico() {
  if (!_telHistReservatorioId) return;
  const reserv = _telColetarReservatorios().find(r => String(r.id) === String(_telHistReservatorioId));
  if (!reserv?.device_id) {
    alert("Reservatório sem device_id válido.");
    return;
  }

  const btn = document.getElementById("btnTelExportarPdf");
  const origHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Gerando…</span>`;
  }

  // horas → dias para a rota
  const horas = _telHistoricoHoras || 24;
  const dias = Math.max(1, Math.round(horas / 24));

  try {
    const url = `/relatorio/pdf?device_id=${encodeURIComponent(reserv.device_id)}&dias=${dias}`;
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      alert("Erro ao gerar PDF: " + (txt || r.status));
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
    if (btn) {
      btn.innerHTML = origHtml;
      _telAtualizarBotaoPdf();
    }
  }
}

async function carregarHistoricoTelemetria() {
  const wrap = document.getElementById("telHistoricoChart");
  const empty = document.getElementById("telHistoricoEmpty");
  const legend = document.getElementById("telHistoricoLegend");
  if (!wrap) return;

  const escolhidos = _telEscolherReservatoriosParaHistorico();

  if (escolhidos.length === 0) {
    if (empty) { empty.style.display = "block"; empty.textContent = "Sem reservatórios para o filtro selecionado."; }
    if (legend) legend.innerHTML = "";
    if (_telHistoricoChart) { try { _telHistoricoChart.destroy(); } catch (_) {} _telHistoricoChart = null; }
    return;
  }

  const deviceIds = escolhidos.map(r => r.device_id).join(",");

  try {
    const resp = await fetch(`/admin/historico?device_ids=${encodeURIComponent(deviceIds)}&horas=${_telHistoricoHoras}`, {
      headers: authHeaders(),
    });
    if (!resp.ok) throw new Error("status " + resp.status);
    const data = await resp.json();

    renderTelHistoricoChart(escolhidos, data.series || {});
  } catch (e) {
    console.error("Erro histórico telemetria:", e);
    if (empty) { empty.style.display = "block"; empty.textContent = "Erro ao carregar histórico."; }
  }
}

function renderTelHistoricoChart(reservatorios, seriesMap) {
  const wrap = document.getElementById("telHistoricoChart");
  const empty = document.getElementById("telHistoricoEmpty");
  const legend = document.getElementById("telHistoricoLegend");
  if (!wrap || typeof ApexCharts === "undefined") return;

  const series = reservatorios.map((r, i) => ({
    name: `${r.nome || "Reservatório"} · ${r.condominio_nome || ""}`,
    data: (seriesMap[r.device_id] || []).map(p => ({ x: new Date(p.bucket).getTime(), y: p.nivel_pct_avg })),
    color: TEL_HIST_COLORS[i % TEL_HIST_COLORS.length],
  }));

  const total = series.reduce((s, x) => s + x.data.length, 0);
  if (total === 0) {
    if (empty) { empty.style.display = "block"; empty.textContent = "Sem dados de histórico no período."; }
    wrap.innerHTML = "";
    if (legend) legend.innerHTML = "";
    if (_telHistoricoChart) { try { _telHistoricoChart.destroy(); } catch (_) {} _telHistoricoChart = null; }
    return;
  }
  if (empty) empty.style.display = "none";

  if (legend) {
    legend.innerHTML = series.map((s, i) =>
      `<span class="tel-leg-item" style="--col:${TEL_HIST_COLORS[i % TEL_HIST_COLORS.length]};">${s.name}</span>`
    ).join("");
  }

  const opts = {
    chart: { type: "area", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 300 }, zoom: { enabled: false } },
    series,
    colors: series.map(s => s.color),
    stroke: { curve: "smooth", width: 2.4 },
    fill: {
      type: "gradient",
      gradient: { shade: "dark", type: "vertical", shadeIntensity: .4, opacityFrom: .35, opacityTo: 0, stops: [0, 90] },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3 },
    xaxis: {
      type: "datetime",
      labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, datetimeUTC: false },
      axisBorder: { color: "rgba(255,255,255,.06)" },
      axisTicks: { color: "rgba(255,255,255,.06)" },
    },
    yaxis: {
      min: 0, max: 100,
      labels: { style: { colors: "#7a7e9c", fontSize: "10px" }, formatter: (v) => v + "%" },
    },
    legend: { show: false },
    tooltip: {
      theme: "dark",
      x: { format: "dd MMM HH:mm" },
      y: { formatter: (v) => v + "%" },
    },
    markers: { size: 0, hover: { size: 4 } },
  };

  if (_telHistoricoChart) {
    _telHistoricoChart.updateOptions(opts, false, true);
  } else {
    wrap.innerHTML = "";
    _telHistoricoChart = new ApexCharts(wrap, opts);
    _telHistoricoChart.render();
  }
}

// ============================================================
// PÁGINA ALERTAS (unificada: telemetria + chamados)
// ============================================================

let _alFiltros = {
  tab: "todos",       // todos | critico | atencao | normal | resolvido
  busca: "",
  dataIni: "",
  dataFim: "",
  page: 1,
  pageSize: 10,
};
let _alSelecionadoKey = null;
let _alHistoricoChart = null;
let _alHistoricoCache = new Map(); // device_id → { ts, dados }
let _alComentariosCache = new Map(); // key → lista
let _alAnaliseIACache = new Map();   // key → { analise, acoes }

// Ações fixas por tipo. Aparece instantaneamente sem custo de IA. O botão
// "Pedir análise da IA" chama a OpenAI sob demanda quando quer mais.
const _AL_ACOES_FIXAS = {
  telemetria: {
    dispositivo_offline: ["Verificar alimentação e sinal do device", "Acionar técnico de campo", "Avisar síndico do condomínio"],
    nivel_muito_baixo:   ["Verificar funcionamento da bomba", "Conferir nível físico no reservatório", "Acionar manutenção urgente"],
    nivel_baixo:         ["Monitorar consumo nas próximas horas", "Programar reabastecimento", "Conferir histórico de uso"],
  },
  chamado: {
    p1: ["Acionar plantão técnico imediatamente", "Notificar gerência", "Confirmar problema com cliente"],
    p2: ["Atribuir técnico ainda hoje", "Confirmar contato com cliente", "Documentar diagnóstico inicial"],
    p3: ["Agendar na rotina da semana", "Solicitar mais informações ao cliente"],
    p4: ["Avaliar prioridade real", "Adicionar à fila de manutenção normal"],
  },
};

function _alAcoesFixasPara(it) {
  if (it.origem === "telemetria") {
    return _AL_ACOES_FIXAS.telemetria[it.raw?.tipo]
      || ["Investigar a causa raiz", "Documentar achados pra histórico"];
  }
  const prio = String(it.raw?.prioridade || "p3").toLowerCase();
  return _AL_ACOES_FIXAS.chamado[prio] || _AL_ACOES_FIXAS.chamado.media;
}

// Lista todos os alertas (telemetria + chamados) num formato normalizado.
// Inclui resolvidos (alertas fechados são pegues separadamente — por enquanto
// só temos os abertos; resolvidos vêm dos chamados fechados).
function _alUnificar() {
  const itens = [];

  // Telemetria (todos os que temos em _alertasAbertos = só abertos)
  for (const a of (_alertasAbertos || [])) {
    const sev = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo")
      ? "critico"
      : a.tipo === "nivel_baixo" ? "atencao" : "normal";
    itens.push({
      key: `TEL-${a.id}`,
      origem: "telemetria",
      rawId: a.id,
      raw: a,
      titulo: String(a.tipo || "").replaceAll("_", " "),
      descricao: a.mensagem || "",
      condominio_id: _alCondoIdDoDevice(a.device_id),
      condominio_nome: _mcDeviceCondoName(a.device_id),
      device_id: a.device_id,
      severidade: sev,
      status: "ativo",
      criado_em: a.criado_em,
      fechado_em: null,
    });
  }

  // Chamados (abertos, em_atendimento E fechados)
  for (const ch of (Array.isArray(_chamadosData) ? _chamadosData : [])) {
    const prio = String(ch.prioridade || "p3").toLowerCase();
    const sev = prio === "p1" ? "critico"
              : prio === "p2" ? "atencao"
              : "normal";
    const _PRIO_LABEL = { p1: "P1 · Crítico", p2: "P2 · Alta", p3: "P3 · Controlado", p4: "P4 · Agendado" };
    const sevLabel = _PRIO_LABEL[prio] || _PRIO_LABEL.p3;
    const status = String(ch.status || "").toLowerCase();
    itens.push({
      key: `CH-${ch.id}`,
      origem: "chamado",
      rawId: ch.id,
      raw: ch,
      titulo: ch.titulo || `Chamado #${ch.id}`,
      descricao: ch.descricao || "",
      condominio_id: ch.condominio_id || null,
      condominio_nome: ch.condominio_nome || "—",
      device_id: null,
      severidade: sev,
      sevLabel,
      status: status === "fechado" ? "resolvido" : "ativo",
      criado_em: ch.criado_em,
      fechado_em: ch.fechado_em,
    });
  }

  return itens;
}

function _chamadosP12Abertos() {
  return (_chamadosData || []).filter(ch => {
    const p = String(ch.prioridade || "").toLowerCase();
    const s = String(ch.status || "").toLowerCase();
    return (p === "p1" || p === "p2") && s !== "fechado";
  });
}

function _atualizarBadgeAlertas() {
  const badge = document.getElementById("navBadgeAlertas");
  if (!badge) return;
  const nAlertas  = (_alertasAbertos || []).filter(a => !_alertasIdsAck.has(`al-${a.id}`)).length;
  const nChamados = _chamadosP12Abertos().filter(ch => !_alertasIdsAck.has(`ch-${ch.id}`)).length;
  const total = nAlertas + nChamados;
  badge.textContent = total;
  badge.style.display = total > 0 ? "inline-flex" : "none";
}

function _alCondoIdDoDevice(deviceId) {
  for (const g of (_statusData || [])) {
    for (const r of (g.reservatorios || [])) {
      if (r.device_id === deviceId) return g.condominio?.id || null;
    }
  }
  return null;
}

function _alAplicarFiltros(lista) {
  const f = _alFiltros;
  return lista.filter(it => {
    // Tab
    if (f.tab === "resolvido") {
      if (it.status !== "resolvido") return false;
    } else if (f.tab !== "todos") {
      if (it.severidade !== f.tab) return false;
      if (it.status !== "ativo") return false;
    } else {
      // "todos" mostra só ativos por padrão (resolvidos têm tab própria)
      if (it.status !== "ativo") return false;
    }
    // Busca
    if (f.busca) {
      const q = f.busca.toLowerCase();
      const blob = `${it.key} ${it.titulo} ${it.descricao} ${it.condominio_nome}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    // Range de data
    if (f.dataIni) {
      const di = new Date(f.dataIni + "T00:00:00").getTime();
      if (new Date(it.criado_em).getTime() < di) return false;
    }
    if (f.dataFim) {
      const df = new Date(f.dataFim + "T23:59:59").getTime();
      if (new Date(it.criado_em).getTime() > df) return false;
    }
    return true;
  });
}

function _alFmtDuracao(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return "—";
  const totMin = Math.floor(ms / 60000);
  if (totMin < 60) return `${totMin}min`;
  const horas = Math.floor(totMin / 60);
  const min = totMin % 60;
  if (horas < 24) return `${horas}h ${min.toString().padStart(2,"0")}min`;
  const dias = Math.floor(horas / 24);
  const hrest = horas % 24;
  return `${dias}d ${hrest}h`;
}

function _alFmtData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
function _alFmtHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function _alRenderKpis(todos) {
  const ativos = todos.filter(it => it.status === "ativo");
  const critico = ativos.filter(it => it.severidade === "critico").length;
  const atencao = ativos.filter(it => it.severidade === "atencao").length;
  const normal  = ativos.filter(it => it.severidade === "normal").length;
  const resolvidos = todos.filter(it => it.status === "resolvido");

  let temposMs = [];
  for (const r of resolvidos) {
    if (r.fechado_em && r.criado_em) {
      const dur = new Date(r.fechado_em) - new Date(r.criado_em);
      if (dur > 0) temposMs.push(dur);
    }
  }
  const tempoMedio = temposMs.length
    ? _alFmtDuracao(temposMs.reduce((s, v) => s + v, 0) / temposMs.length)
    : "—";

  const kpi = (icon, val, label, kindCls, tab) => `
    <div class="rc ${kindCls} rc-static" ${tab ? `data-al-kpi-tab="${tab}" style="cursor:pointer;"` : ""}>
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${label}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  const el = document.getElementById("alKpiGrid");
  if (el) el.innerHTML =
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        critico, "Críticos", critico > 0 ? "rc-bad" : "rc-neutral", "critico") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
        atencao, "Atenção", atencao > 0 ? "rc-warn" : "rc-neutral", "atencao") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        normal, "Normais", normal > 0 ? "rc-ok" : "rc-neutral", "normal") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
        resolvidos.length, "Resolvidos", resolvidos.length > 0 ? "rc-ok" : "rc-neutral", "resolvido") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        tempoMedio, "Tempo médio", "rc-neutral");

  // Contadores nas tabs
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("alCountTodos",     ativos.length);
  set("alCountCritico",   critico);
  set("alCountAtencao",   atencao);
  set("alCountNormal",    normal);
  set("alCountResolvido", resolvidos.length);
}

function _alSevLabel(sev) {
  return sev === "critico" ? "Crítico"
       : sev === "atencao" ? "Atenção"
       : "Normal";
}
function _alStatusLabel(st) {
  return st === "resolvido" ? "Resolvido" : "Ativo";
}

function _alRenderTabela(filtrados) {
  const tbody = document.getElementById("alTbody");
  if (!tbody) return;

  const total = filtrados.length;
  const maxPage = Math.max(1, Math.ceil(total / _alFiltros.pageSize));
  if (_alFiltros.page > maxPage) _alFiltros.page = maxPage;
  const ini = (_alFiltros.page - 1) * _alFiltros.pageSize;
  const pageItems = filtrados.slice(ini, ini + _alFiltros.pageSize);

  if (!pageItems.length) {
    tbody.innerHTML = `<tr class="al-empty-row"><td colspan="8" style="text-align:center;padding:40px;color:var(--muted);">Nenhum alerta encontrado com esses filtros.</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(it => {
      const agora = Date.now();
      const ref = it.status === "resolvido" && it.fechado_em
        ? new Date(it.fechado_em).getTime() - new Date(it.criado_em).getTime()
        : agora - new Date(it.criado_em).getTime();
      const tempoStr = _alFmtDuracao(ref);
      const isSelected = _alSelecionadoKey === it.key ? " is-selected" : "";
      return `
        <tr class="al-row${isSelected}" data-al-key="${it.key}">
          <td class="al-id">${it.key}</td>
          <td class="al-condo">
            <span class="al-origem ${it.origem}">${it.origem === "telemetria" ? "Tel" : "Cham"}</span>
            ${it.condominio_nome}
            ${it.device_id ? `<small>${it.device_id}</small>` : ""}
          </td>
          <td>${_alCapitalize(it.titulo)}</td>
          <td><span class="al-sev ${it.severidade}">${it.sevLabel || _alSevLabel(it.severidade)}</span></td>
          <td class="al-data">${_alFmtData(it.criado_em)}<small>${_alFmtHora(it.criado_em)}</small></td>
          <td class="al-tempo">${tempoStr}</td>
          <td><span class="al-status ${it.status}">${_alStatusLabel(it.status)}</span></td>
          <td class="right">
            <div class="al-actions">
              ${it.status === "ativo" ? `
              <button class="al-act-btn viewer-only-hide" data-al-action="resolver" data-al-key="${it.key}" title="Marcar como resolvido">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  // Paginação info
  const pageInfo = document.getElementById("alPageInfo");
  if (pageInfo) {
    const first = total === 0 ? 0 : ini + 1;
    const last = Math.min(ini + _alFiltros.pageSize, total);
    pageInfo.textContent = `Mostrando ${first}-${last} de ${total}`;
  }
}

function _alCapitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function _alAchaPorKey(key) {
  return _alUnificar().find(it => it.key === key) || null;
}

async function _alRenderPainel() {
  const wrap = document.getElementById("alPainel");
  if (!wrap) return;

  if (!_alSelecionadoKey) {
    wrap.innerHTML = `
      <div class="al-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Clique numa linha pra ver os detalhes do alerta</p>
      </div>`;
    return;
  }

  const it = _alAchaPorKey(_alSelecionadoKey);
  if (!it) {
    _alSelecionadoKey = null;
    return _alRenderPainel();
  }

  // Reservatório (se telemetria)
  let reserv = null;
  if (it.origem === "telemetria" && it.device_id) {
    for (const g of (_statusData || [])) {
      for (const r of (g.reservatorios || [])) {
        if (r.device_id === it.device_id) { reserv = r; break; }
      }
      if (reserv) break;
    }
  }

  const pct = reserv?.ultima_leitura?.nivel_pct;
  const banner = reserv && pct != null
    ? `
      <div class="ap-banner ${it.severidade}">
        <div class="ap-banner-row">
          <div class="ap-gauge-mini">
            ${_alGaugeMiniSvg(pct, it.severidade)}
            <div class="ap-gauge-mini-val">
              <div>${Math.round(pct)}%</div>
              <small>Nível atual</small>
            </div>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;">Reservatório</div>
            <div style="font-size:14px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${reserv.nome || "—"}</div>
            ${reserv.altura_total_m ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">Altura ${reserv.altura_total_m}m${reserv.tipo ? ` • ${reserv.tipo}` : ""}</div>` : ""}
            <div style="font-size:11px;color:var(--muted);margin-top:6px;">Última leitura: ${_alFmtData(reserv.ultima_leitura?.criado_em)} ${_alFmtHora(reserv.ultima_leitura?.criado_em)}</div>
          </div>
        </div>
      </div>`
    : "";

  const kv = (k, v) => `<div><span class="k">${k}</span><span class="v">${v ?? "—"}</span></div>`;

  let detalhes = "";
  if (it.origem === "telemetria") {
    detalhes = `
      <div class="ap-section">
        <div class="ap-section-title">Detalhes</div>
        <div class="ap-kv">
          ${kv("Reservatório", reserv?.nome)}
          ${kv("Device", it.device_id)}
          ${kv("Tipo", _alCapitalize(it.titulo))}
          ${kv("Severidade", it.sevLabel || _alSevLabel(it.severidade))}
        </div>
        ${it.descricao ? `<div style="margin-top:10px;font-size:11.5px;color:var(--muted);">${it.descricao}</div>` : ""}
      </div>`;
  } else {
    const r = it.raw;
    detalhes = `
      <div class="ap-section">
        <div class="ap-section-title">Detalhes do chamado</div>
        <div class="ap-kv">
          ${kv("Categoria", r.categoria ? _alCapitalize(r.categoria) : "—")}
          ${kv("Prioridade", _alCapitalize(String(r.prioridade || "")))}
          ${kv("Status", _alCapitalize(String(r.status || "").replaceAll("_", " ")))}
          ${kv("Responsável", r.responsavel_nome || "Sem atribuição")}
        </div>
        ${r.cliente_nome ? `<div style="margin-top:10px;font-size:11.5px;"><b>Cliente:</b> ${r.cliente_nome} ${r.cliente_telefone ? `<span style="color:var(--muted);">(${r.cliente_telefone})</span>` : ""}</div>` : ""}
        ${it.descricao ? `<div style="margin-top:10px;font-size:11.5px;color:var(--muted);max-height:80px;overflow-y:auto;">${it.descricao}</div>` : ""}
      </div>`;
  }

  const tempoStr = it.status === "resolvido" && it.fechado_em
    ? `Resolvido em ${_alFmtDuracao(new Date(it.fechado_em) - new Date(it.criado_em))}`
    : `Aberto há ${_alFmtDuracao(Date.now() - new Date(it.criado_em).getTime())}`;

  const acoes = it.status === "ativo"
    ? `<div class="ap-actions viewer-only-hide">
         <button class="btn btnAccent" data-al-action="resolver" data-al-key="${it.key}">Marcar como resolvido</button>
       </div>`
    : "";

  wrap.innerHTML = `
    <div class="ap-head">
      <div>
        <div class="ap-title">${_alCapitalize(it.titulo)}</div>
        <div class="ap-sub">${it.key} • ${it.condominio_nome}</div>
      </div>
      <button class="ap-close" data-al-action="fechar-painel" title="Fechar">×</button>
    </div>
    ${banner}
    ${detalhes}
    <div class="ap-section">
      <div class="ap-section-title">Linha do tempo</div>
      <div style="font-size:11.5px;color:var(--text);">Criado em ${_alFmtData(it.criado_em)} ${_alFmtHora(it.criado_em)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">${tempoStr}</div>
    </div>
    ${it.origem === "telemetria" && it.device_id ? `
    <div class="ap-section">
      <div class="ap-section-title">Histórico de nível (24h)</div>
      <div class="ap-chart" id="alChartHistorico"></div>
    </div>` : ""}

    <div class="ap-section">
      <div class="ap-section-title">Ações recomendadas</div>
      <ul class="al-acoes-list">
        ${_alAcoesFixasPara(it).map(a => `<li>${_alEscaparHtml(a)}</li>`).join("")}
      </ul>
      <div id="alIaBox" style="margin-top:10px;">
        <button class="btn btn-sm" type="button" data-al-action="ia-analisar" data-al-key="${it.key}">✨ Pedir análise da IA</button>
      </div>
    </div>

    <div class="ap-section">
      <div class="ap-section-title">Comentários</div>
      <div id="alCmtLista" class="al-cmt-lista">
        <div style="color:var(--muted);font-size:11px;padding:8px 0;">Carregando…</div>
      </div>
      <div class="al-cmt-form">
        <textarea id="alCmtInput" class="input" rows="2" placeholder="Adicionar comentário…" maxlength="2000"></textarea>
        <button class="btn btn-sm btnAccent" type="button" data-al-action="cmt-enviar" data-al-key="${it.key}">Enviar</button>
      </div>
    </div>

    ${acoes}
  `;

  // Carrega histórico se for telemetria
  if (it.origem === "telemetria" && it.device_id) {
    _alCarregarHistorico(it.device_id);
  }
  // Carrega comentários
  _alCarregarComentarios(it);
  // Restaura análise IA do cache (se já gerada nessa sessão)
  if (_alAnaliseIACache.has(it.key)) _alRenderAnaliseIA(it);
}

// Mini-gauge donut SVG. pct 0-100, cor depende da severidade.
function _alGaugeMiniSvg(pct, sev) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const r = 32;
  const c = 2 * Math.PI * r;
  const filled = (p / 100) * c;
  const cor = sev === "critico" ? "#ef4444" : sev === "atencao" ? "#f59e0b" : "#10b981";
  return `
    <svg viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="${cor}" stroke-width="8"
              stroke-dasharray="${filled} ${c}" stroke-linecap="round"
              transform="rotate(-90 40 40)"/>
    </svg>`;
}

async function _alCarregarHistorico(deviceId) {
  const el = document.getElementById("alChartHistorico");
  if (!el || typeof ApexCharts === "undefined") return;

  try {
    // Cache simples: usa se < 60s
    const cached = _alHistoricoCache.get(deviceId);
    let dados;
    if (cached && (Date.now() - cached.ts) < 60000) {
      dados = cached.dados;
    } else {
      const r = await fetch(`/admin/historico?device_ids=${encodeURIComponent(deviceId)}&horas=24`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error("historico " + r.status);
      const j = await r.json();
      dados = j[deviceId] || [];
      _alHistoricoCache.set(deviceId, { ts: Date.now(), dados });
    }

    const serie = dados.map(p => ({ x: new Date(p.bucket).getTime(), y: p.nivel_pct_avg }));
    if (_alHistoricoChart) { _alHistoricoChart.destroy(); _alHistoricoChart = null; }
    _alHistoricoChart = new ApexCharts(el, {
      chart: { type: "area", height: 120, sparkline: { enabled: true }, animations: { enabled: false } },
      stroke: { curve: "smooth", width: 2 },
      colors: ["#ef4444"],
      fill: { type: "gradient", gradient: { shadeIntensity: .6, opacityFrom: .4, opacityTo: 0 } },
      series: [{ name: "Nível %", data: serie }],
      tooltip: {
        theme: "dark",
        x: { format: "dd/MM HH:mm" },
        y: { formatter: v => v != null ? Math.round(v) + "%" : "—" },
      },
    });
    _alHistoricoChart.render();
  } catch (e) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px;">Não foi possível carregar o histórico.</div>`;
  }
}

async function _alResolver(key) {
  const it = _alAchaPorKey(key);
  if (!it) return;

  if (it.origem === "telemetria") {
    const r = await fetch("/alertas/" + it.rawId + "/fechar", {
      method: "PATCH", headers: authHeaders(),
    });
    if (!r.ok) { alert("Erro ao fechar alerta"); return; }
  } else {
    const r = await fetch("/chamados/" + it.rawId, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "fechado" }),
    });
    if (!r.ok) { alert("Erro ao fechar chamado"); return; }
  }
  // Recarrega dados
  await Promise.all([carregarAlertas?.(), carregarChamados?.()]);
  renderAlertas();
}

// ============ Comentários ============

async function _alCarregarComentarios(it) {
  const origem = it.origem;
  const id = it.rawId;
  try {
    const r = await fetch(`/alertas/comentarios/${origem}/${id}`, { headers: authHeaders() });
    if (!r.ok) throw new Error("comentarios " + r.status);
    const lista = await r.json();
    _alComentariosCache.set(it.key, lista);
    _alRenderComentarios(it);
  } catch (e) {
    const wrap = document.getElementById("alCmtLista");
    if (wrap) wrap.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 0;">Erro ao carregar comentários.</div>`;
  }
}

async function _alEnviarComentario(key, texto) {
  const it = _alAchaPorKey(key);
  if (!it || !texto) return;
  try {
    const r = await fetch("/alertas/comentarios", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ origem: it.origem, id: it.rawId, texto }),
    });
    if (!r.ok) { alert("Erro ao enviar comentário"); return; }
    // Limpa input e recarrega lista
    const ta = document.getElementById("alCmtInput");
    if (ta) ta.value = "";
    _alComentariosCache.delete(it.key);
    _alCarregarComentarios(it);
  } catch (e) {
    alert("Erro ao enviar comentário: " + e.message);
  }
}

function _alRenderComentarios(it) {
  const wrap = document.getElementById("alCmtLista");
  if (!wrap) return;
  const lista = _alComentariosCache.get(it.key) || [];
  if (!lista.length) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 0;font-style:italic;">Sem comentários ainda. Seja o primeiro.</div>`;
    return;
  }
  wrap.innerHTML = lista.map(c => `
    <div class="al-cmt">
      <div class="al-cmt-head">
        <span class="al-cmt-autor">${c.autor_nome || "Anônimo"}</span>
        <span class="al-cmt-tempo">${_alFmtData(c.criado_em)} ${_alFmtHora(c.criado_em)}</span>
      </div>
      <div class="al-cmt-texto">${_alEscaparHtml(c.texto)}</div>
    </div>
  `).join("");
}

function _alEscaparHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// ============ Análise IA ============

async function _alPedirAnaliseIA(key) {
  const it = _alAchaPorKey(key);
  if (!it) return;
  const box = document.getElementById("alIaBox");
  if (!box) return;
  box.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:10px;text-align:center;">Analisando com IA…</div>`;
  try {
    const r = await fetch("/alertas/analisar-ia", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ origem: it.origem, id: it.rawId }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(txt || ("ia " + r.status));
    }
    const j = await r.json();
    _alAnaliseIACache.set(it.key, j);
    _alRenderAnaliseIA(it);
  } catch (e) {
    box.innerHTML = `<div style="color:var(--danger);font-size:11px;padding:10px;">Erro: ${_alEscaparHtml(e.message)}</div>`;
  }
}

function _alRenderAnaliseIA(it) {
  const box = document.getElementById("alIaBox");
  if (!box) return;
  const j = _alAnaliseIACache.get(it.key);
  if (!j) {
    box.innerHTML = `<button class="btn btn-sm" type="button" data-al-action="ia-analisar" data-al-key="${it.key}">✨ Pedir análise da IA</button>`;
    return;
  }
  const acoesIA = (j.acoes || []).map(a => `<li>${_alEscaparHtml(a)}</li>`).join("");
  box.innerHTML = `
    <div class="al-ia-card">
      <div class="al-ia-head">
        <span class="al-ia-badge">IA</span>
        <span style="color:var(--muted);font-size:10.5px;">Análise sob demanda</span>
      </div>
      ${j.analise ? `<div class="al-ia-analise">${_alEscaparHtml(j.analise)}</div>` : ""}
      ${acoesIA ? `<ul class="al-ia-acoes">${acoesIA}</ul>` : ""}
      <button class="btn btn-sm al-ia-refazer" type="button" data-al-action="ia-analisar" data-al-key="${it.key}">Refazer análise</button>
    </div>
  `;
}

function renderAlertas() {
  // Compatível com a API existente: continua sendo chamado por carregarTelemetria.
  const todos = _alUnificar();
  const filtrados = _alAplicarFiltros(todos);
  _alRenderKpis(todos);
  _alRenderTabela(filtrados);
  _alRenderPainel();
}

function getUltimaLeituraDoCondominio(condoItem) {
  const list = condoItem.reservatorios || [];
  let best = null;
  for (const r of list) {
    const u = r.ultima_leitura;
    if (!u?.criado_em) continue;
    if (!best) best = u;
    else if (new Date(u.criado_em) > new Date(best.criado_em)) best = u;
  }
  return best; // pode ser null
}

function renderCondoCards() {
  const grid = document.getElementById("condoGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const list = getFilteredList();
  const total = list.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (page > maxPage) page = maxPage;

  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  const paginaInfo = document.getElementById("paginaInfo");
  if (paginaInfo) paginaInfo.textContent = `${page} / ${maxPage} • ${total} condomínios`;

  for (const item of pageItems) {
    const c = item.condominio || {};
    const resumo = item.resumo || {};
    const condoId = Number(c.id) || 0;
    const reservs = Array.isArray(item.reservatorios) ? item.reservatorios : [];

    const alertasTotal = resumo.alertas_abertos_total ?? 0;
    const offlineCount = resumo.offline_count ?? 0;

    const chamadosAbertos = _chamadosData.filter(ch => Number(ch.condominio_id) === condoId && ch.status !== "fechado").length;
    const conversasAbertas = _conversasData.filter(cv => Number(cv.condominio_id) === condoId && cv.status === "aberta").length;

    let cardClass = "cc-ok";
    if (offlineCount > 0) cardClass = "cc-bad";
    else if (alertasTotal > 0) cardClass = "cc-alerta";

    // Last reading
    const ultima = getUltimaLeituraDoCondominio(item);
    let lastSeen = "-";
    if (ultima?.criado_em) {
      const mins = Math.round((Date.now() - new Date(ultima.criado_em)) / 60000);
      if (mins < 60) lastSeen = `há ${mins}min`;
      else if (mins < 1440) lastSeen = `há ${Math.round(mins / 60)}h`;
      else lastSeen = fmtData(ultima.criado_em);
    }

    // Badges
    let badgesHtml = "";
    if (alertasTotal > 0) badgesHtml += `<span class="cc-count cc-count-alerta">⚠ ${alertasTotal}</span>`;
    if (chamadosAbertos > 0) badgesHtml += `<span class="cc-count cc-count-chamado">📋 ${chamadosAbertos}</span>`;
    if (conversasAbertas > 0) badgesHtml += `<span class="cc-count cc-count-wz">💬 ${conversasAbertas}</span>`;

    const cnpjDisplay = c.cnpj
      ? String(c.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : null;

    const offlineMeta = offlineCount > 0
      ? ` · <span class="cc-offline-inline">⚠ ${offlineCount} offline</span>`
      : "";

    const div = document.createElement("div");
    div.className = `cc ${cardClass}`;
    div.dataset.action = "ver-condo";
    div.dataset.id = condoId;
    div.innerHTML = `
      <div class="cc-info">
        <span class="cc-name">${c.nome_fantasia || c.nome || "-"}</span>
        <span class="cc-meta">${cnpjDisplay ? cnpjDisplay + " · " : ""}${lastSeen}${offlineMeta}</span>
      </div>
      <div class="cc-side">
        <div class="cc-header-badges">${badgesHtml}</div>
        <span class="cc-chevron">›</span>
      </div>`;
    grid.appendChild(div);
  }
}

async function carregarStatus() {
  const r = await fetch("/admin/status", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /admin/status: " + r.status);

  const grouped = await r.json(); // vem AGRUPADO do backend (admin.routes)

  // vem AGRUPADO do backend (admin.routes) — renderCondoCards usa item.reservatorios + item.resumo
  _statusData = Array.isArray(grouped) ? grouped : [];
}

async function carregarAlertas() {
  const r = await fetch("/alertas-abertos", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /alertas-abertos: " + r.status);
  _alertasAbertos = await r.json();
  montarMapaAlertas();
  _atualizarBadgeAlertas();
}

async function carregarCondominios() {
  const r = await fetch("/condominios", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /condominios: " + r.status);
  _condominios = await r.json();
}

async function carregarChamados() {
  const r = await fetch("/chamados", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /chamados: " + r.status);
  _chamadosData = await r.json();
}

async function carregarConversas() {
  const r = await fetch("/whatsapp/conversas", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /whatsapp/conversas: " + r.status);
  _conversasData = await r.json();
}

function renderSelectCondominiosReservatorio() {
  const sel = document.getElementById("resCondominio");
  if (!sel) return;

  const list = Array.isArray(_condominios) ? _condominios : [];
  const prev = sel.value;

  sel.innerHTML = `<option value="">Selecione...</option>` +
    list.map(c => `<option value="${c.id}">${c.nome} (ID ${c.id})</option>`).join("");

  if (prev) sel.value = prev;
}

function renderTelemetriaVisuais() {
  renderSelectCondominiosCliente();
  renderSelectCondominiosReservatorio();
  renderResumo();
  bindResumoInteracoes();
  renderAlertas();
  renderCondoCards();
  renderMcMap();
  renderMcAlerts();
  renderMcTelemetria();
  atualizarStatusSistema();
  atualizarGaugesDrawerSeAberto();
  if (_telSecaoAtiva) renderTelemetriaAvancada();
}

function renderAtendimentoVisuais() {
  renderChamados();
  renderConversas();
  atualizarBadgesChamados();
  atualizarBadgesWhatsapp();
  _atualizarBadgeAlertas();
  renderCondoCards();        // cards têm badges de chamados/wz
  renderMcConversas();
  renderMcAlerts();
  // Página de Alertas combina telemetria + chamados; mantém em dia quando
  // chamados são atualizados, não só quando telemetria recarrega.
  renderAlertas();
}

function renderVisuaisCombinados() {
  // Visuais que combinam telemetria + atendimento
  renderMcActivity();
  renderMcIaInsights();
  // Seção Mapa também combina telemetria + atendimento; atualiza só se o DOM existe
  if (document.getElementById("mpMapCanvas")) {
    renderSecaoMapa();
  }
}

function marcarAtualizado() {
  const el = document.getElementById("statusMsg");
  if (el) el.textContent = "Atualizado às " + new Date().toLocaleTimeString();
}

async function carregarTelemetria() {
  try {
    await Promise.all([
      carregarStatus(),
      carregarAlertas(),
      carregarCondominios(),
    ]);
    renderTelemetriaVisuais();
    renderVisuaisCombinados();
    marcarAtualizado();
  } catch (e) {
    const el = document.getElementById("statusMsg");
    if (el) el.textContent = "Erro ao atualizar telemetria";
    console.error(e);
  }
}

async function carregarAtendimento() {
  try {
    await Promise.all([
      carregarChamados().catch(() => {}),
      carregarConversas().catch(() => {}),
      carregarTecnicosLocalizacao().catch(() => {}),
    ]);
    detectarChamadosNovos();
    renderAtendimentoVisuais();
    renderVisuaisCombinados();
    _mpRenderTecnicos();
  } catch (e) {
    console.error("Erro carregarAtendimento:", e);
  }
}

// ===== Localização dos técnicos (Fase 7F) =====
let _tecLocs = [];
let _mpTecMarkers = new Map(); // tecnico_id → L.Marker

async function carregarTecnicosLocalizacao() {
  const r = await fetch("/tecnicos/localizacao", { headers: authHeaders() });
  if (!r.ok) return;
  _tecLocs = await r.json();
}

// ============================================================
// PÁGINA CLIENTES
// ============================================================

async function carregarUsuarios() {
  const r = await fetch("/admin/usuarios?role=cliente", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /admin/usuarios: " + r.status);
  _usuariosData = await r.json();
}

// Cache global das métricas de contratos (recarregadas em background)
let _contratosMetricas = null;
// Map: condominio_id → contrato ativo (pra pílula na tabela de clientes)
let _contratosByCondoId = new Map();

function renderMcContratos() {
  const m = _contratosMetricas?.total;
  if (!m) return;
  const set = (id, v, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = v;
    if (color) el.style.color = color;
  };
  const fmtMoeda = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  set("mcContrMrr",      fmtMoeda(m.mrr || 0), "var(--accent)");
  set("mcContrAtivos",   m.ativos || 0);
  set("mcContrVencendo", m.vencendo_30d || 0, m.vencendo_30d > 0 ? "var(--warn)" : null);
  set("mcContrVencidos", m.vencidos || 0,     m.vencidos > 0     ? "var(--danger)" : null);
}

async function _carregarContratosMetricas() {
  try {
    const [rMet, rLista] = await Promise.all([
      fetch(`/contratos/metricas`,        { headers: authHeaders() }),
      fetch(`/contratos?ativo=true`,      { headers: authHeaders() }),
    ]);
    if (rMet.ok)   _contratosMetricas   = await rMet.json();
    if (rLista.ok) {
      const lista = await rLista.json();
      _contratosByCondoId = new Map(lista.map(c => [Number(c.condominio_id), c]));
    }
    renderCliKpis?.();
    renderCliTabela?.();
    renderMcContratos?.(); // Mission Control widget (criado adiante)
  } catch (_) { /* silencioso */ }
}

function renderCliKpis() {
  const el = document.getElementById("cliKpiGrid");
  if (!el) return;
  const condos   = Array.isArray(_condominios)  ? _condominios  : [];
  const chamados = Array.isArray(_chamadosData) ? _chamadosData : [];

  const ativos    = condos.filter(c => c.ativo).length;
  const chAbertos = chamados.filter(ch => ch.status !== "fechado").length;

  const m = _contratosMetricas?.total || { mrr: 0, ativos: 0, vencendo_30d: 0, vencidos: 0 };
  const fmtMoeda = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kpi = (icon, val, label, kindCls) => `
    <div class="rc ${kindCls} rc-static">
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${label}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  el.innerHTML =
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
        ativos, "Clientes ativos", ativos < condos.length ? "rc-warn" : "rc-ok") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
        fmtMoeda(m.mrr), "MRR mensal", "rc-ok") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        m.vencendo_30d, "Vencendo em 30d", m.vencendo_30d > 0 ? "rc-warn" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        m.vencidos, "Contratos vencidos", m.vencidos > 0 ? "rc-bad" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        chAbertos, "Chamados abertos", chAbertos > 0 ? "rc-warn" : "rc-neutral");
}

let _cliFiltros = { tab: "todos", busca: "" };
let _cliSelecionadoId = null;

function _cliFiltrados() {
  const condos = Array.isArray(_condominios) ? _condominios : [];
  const busca = (_cliFiltros.busca || "").toLowerCase().trim();
  return condos.filter(c => {
    if (_cliFiltros.tab === "ativo"   && !c.ativo) return false;
    if (_cliFiltros.tab === "inativo" &&  c.ativo) return false;
    if (busca && !c.nome?.toLowerCase().includes(busca) &&
                 !c.nome_fantasia?.toLowerCase().includes(busca) &&
                 !c.cidade?.toLowerCase().includes(busca) &&
                 !c.responsavel?.toLowerCase().includes(busca)) return false;
    return true;
  }).sort((a, b) => {
    const nA = (a.nome_fantasia || a.nome || "").toLowerCase();
    const nB = (b.nome_fantasia || b.nome || "").toLowerCase();
    return nA.localeCompare(nB, "pt-BR");
  });
}

function renderCliTabela() {
  const tbody = document.getElementById("cliTableBody");
  if (!tbody) return;
  const condos = Array.isArray(_condominios) ? _condominios : [];

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("cliCtTodos",    condos.length);
  set("cliCtAtivos",   condos.filter(c => c.ativo).length);
  set("cliCtInativos", condos.filter(c => !c.ativo).length);

  const lista = _cliFiltrados();
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px;">Nenhum cliente encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(c => {
    const sel = _cliSelecionadoId === c.id ? " is-selected" : "";
    const cidade = c.cidade ? _waEscaparHtml(c.cidade + (c.uf ? "/" + c.uf : "")) : "—";
    const contrato = _contratosByCondoId.get(Number(c.id));
    const st = _ctrStatusVisual(contrato);
    const ctrBadge = contrato
      ? `<span class="ch-st ch-st-${st.cls === "ok" ? "aberto" : st.cls === "warn" ? "em_atendimento" : "fechado"}" title="${st.texto}">${st.texto}</span>`
      : `<span style="font-size:10px;color:var(--muted);">—</span>`;
    return `<tr class="ch-row${sel}" data-cli-id="${c.id}" style="cursor:pointer;">
      <td><div style="font-weight:500;font-size:12px;">${_waEscaparHtml(c.nome_fantasia || c.nome || "—")}</div></td>
      <td style="font-size:11px;color:var(--muted);">${cidade}</td>
      <td style="font-size:11px;">${_waEscaparHtml(c.responsavel || "—")}</td>
      <td style="font-size:11px;font-family:monospace;color:var(--muted);">${c.cnpj ? String(c.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—"}</td>
      <td>${ctrBadge}</td>
    </tr>`;
  }).join("");
}

// ─── Contratos: cache + render do card no detalhe do cliente ────────────────
const _cliContratoCache = new Map(); // condoId → { contrato, loaded, loading, error }
const _ctrTipoLabel = { mensal: "Mensal", semestral: "Semestral", anual: "Anual" };
const _ctrFormaLabel = { pix: "PIX", boleto: "Boleto", transferencia: "Transferência", cartao: "Cartão", outro: "Outro" };

function _ctrStatusVisual(contrato) {
  if (!contrato) return { texto: "Sem contrato", cls: "warn", cor: "var(--muted)" };
  if (!contrato.fim_em) return { texto: "Ativo (sem fim)", cls: "ok", cor: "var(--ok)" };
  const dias = Number(contrato.dias_para_vencer);
  if (Number.isFinite(dias)) {
    if (dias < 0)  return { texto: `Vencido há ${Math.abs(dias)}d`, cls: "bad",  cor: "var(--danger)" };
    if (dias <= 30) return { texto: `Vence em ${dias}d`,             cls: "warn", cor: "var(--warn)" };
  }
  return { texto: "Ativo", cls: "ok", cor: "var(--ok)" };
}

function _ctrFmtMoeda(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function _ctrFmtData(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR");
}

function _cliRenderContratoCard(condoId) {
  const cache = _cliContratoCache.get(condoId);
  const lista = cache?.contratos || [];
  let inner;
  if (!cache || cache.loading) {
    inner = `<div style="font-size:11px;color:var(--muted);padding:6px 0;">Carregando contratos…</div>`;
  } else if (cache.error) {
    inner = `<div style="font-size:11px;color:var(--danger);padding:6px 0;">Erro ao carregar contratos</div>`;
  } else if (!lista.length) {
    inner = `<div style="font-size:11px;color:var(--muted);padding:6px 0 10px;">Sem contrato cadastrado. Use o botão Editar (aba Contrato) para cadastrar.</div>`;
  } else {
    inner = lista.map(c => {
      const st = _ctrStatusVisual(c);
      return `<div style="padding:6px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;flex-wrap:wrap;">
          <span style="font-size:11.5px;font-weight:700;">${_ctrTipoLabel[c.tipo] || c.tipo}</span>
          ${c.numero ? `<span style="font-size:10.5px;font-family:monospace;color:var(--muted);">${_waEscaparHtml(c.numero)}</span>` : ""}
          <span style="font-size:10.5px;font-weight:700;color:${st.cor};">${st.texto}</span>
          <span style="font-size:11.5px;font-weight:600;color:var(--accent);margin-left:auto;">${_ctrFmtMoeda(c.valor_mensal)}</span>
        </div>
        <div style="font-size:11px;color:var(--muted2);">${_ctrFmtData(c.inicio_em)} → ${c.fim_em ? _ctrFmtData(c.fim_em) : "sem fim"}</div>
      </div>`;
    }).join("");
  }
  const titulo = lista.length > 1 ? `Contratos (${lista.length})` : "Contrato";
  return `<div class="ch-det-section" id="cliContratoSec-${condoId}">
    <div class="ch-det-sec-title">${titulo}</div>
    ${inner}
  </div>`;
}

async function _cliCarregarContrato(condoId) {
  const cache = _cliContratoCache.get(condoId);
  if (cache && (cache.loaded || cache.loading)) return;
  _cliContratoCache.set(condoId, { contratos: [], loaded: false, loading: true });
  try {
    const r = await fetch(`/contratos?condominio_id=${condoId}&ativo=true`, { headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lista = await r.json();
    _cliContratoCache.set(condoId, { contratos: lista, loaded: true, loading: false });
  } catch (e) {
    _cliContratoCache.set(condoId, { contratos: [], loaded: true, loading: false, error: e.message });
  }
  if (_cliSelecionadoId === condoId) {
    const sec = document.getElementById(`cliContratoSec-${condoId}`);
    if (sec) sec.outerHTML = _cliRenderContratoCard(condoId);
  }
}

function _cliInvalidarContrato(condoId) {
  _cliContratoCache.delete(condoId);
}


function renderCliDetalhe(c) {
  const col = document.getElementById("cliDetailCol");
  if (!col) return;

  if (!c) {
    col.innerHTML = `<div class="ch-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <p>Selecione um cliente para ver os detalhes</p>
    </div>`;
    return;
  }

  const statusBadge = c.ativo
    ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(34,197,94,.15);color:var(--ok);">Ativo</span>`
    : `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(150,150,150,.15);color:var(--muted);">Inativo</span>`;

  const chamadosCondo = (Array.isArray(_chamadosData) ? _chamadosData : [])
    .filter(ch => Number(ch.condominio_id) === Number(c.id));
  const chAbertos  = chamadosCondo.filter(ch => ch.status !== "fechado").length;
  const chFechados = chamadosCondo.filter(ch => ch.status === "fechado").length;

  // Telemetria
  const item = (_statusData || []).find(g => Number(g.condominio?.id) === Number(c.id));
  const reservs = item?.reservatorios?.slice(0, 6) || [];
  let telHtml = "";
  if (reservs.length) {
    const resHtml = reservs.map(r => {
      const uu = r.ultima_leitura;
      const pct = uu?.nivel_pct ?? null;
      const n = String(uu?.nivel || "").toLowerCase();
      const lvClass = n === "alto" ? "lv-alto" : n === "medio" ? "lv-medio" : n === "baixo" ? "lv-baixo" : n === "muito_baixo" ? "lv-muito-baixo" : "lv-unknown";
      const bombaClass = uu?.bomba_ligada === true ? "on" : uu?.bomba_ligada === false ? "off" : "uk";
      const bombaLabel = uu?.bomba_ligada === true ? "LIGADA" : uu?.bomba_ligada === false ? "DESLIG." : "—";
      return `<div class="cc-res">
        <div class="cc-res-header"><span class="cc-res-name">${_waEscaparHtml(r.nome || "Reservatório")}</span><span class="cc-res-bomba ${bombaClass}">${bombaLabel}</span></div>
        <div class="cc-level-row">
          <div class="cc-level-bar"><div class="cc-level-fill ${lvClass}" style="width:${pct ?? 0}%"></div></div>
          <span class="cc-level-pct">${pct != null ? pct + "%" : "-"}</span>
        </div>
      </div>`;
    }).join("");
    telHtml = `<div class="ch-det-section">
      <div class="ch-det-sec-title">Telemetria</div>
      <div class="cc-res-list">${resHtml}</div>
    </div>`;
  }

  // Representantes (usuários vinculados a este condomínio)
  const reps = (Array.isArray(_usuariosData) ? _usuariosData : [])
    .filter(u => Number(u.condominio_id) === Number(c.id));
  const repsHtml = reps.length
    ? reps.map(u => `<div class="ch-met-row">
        <span class="ch-met-lbl">${_waEscaparHtml(u.nome || "—")}</span>
        <span style="font-size:11px;color:var(--muted);">${_waEscaparHtml(u.email || "—")}</span>
      </div>`).join("")
    : `<div style="font-size:11px;color:var(--muted);padding:4px 0;">Nenhum representante cadastrado.</div>`;

  col.innerHTML = `<div class="ch-detail">
    <div class="ch-det-head">
      <span class="ch-det-id" style="font-size:10px;">${c.cidade ? _waEscaparHtml(c.cidade + (c.uf ? "/" + c.uf : "")) : "Condomínio"}</span>
      ${statusBadge}
    </div>
    <div class="ch-det-title">${_waEscaparHtml(c.nome_fantasia || c.nome || "Sem nome")}</div>
    ${c.nome_fantasia ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;margin-bottom:8px;">Razão social: ${_waEscaparHtml(c.nome)}</div>` : ""}

    <div class="ch-det-section">
      <div class="ch-det-sec-title">Informações</div>
      <div class="ch-det-meta">
        ${c.cnpj        ? `<div class="ch-met-row"><span class="ch-met-lbl">CNPJ</span><span style="font-size:12px;font-family:monospace;">${_waEscaparHtml(c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"))}</span></div>` : ""}
        ${c.responsavel ? `<div class="ch-met-row"><span class="ch-met-lbl">Responsável</span><span style="font-size:12px;">${_waEscaparHtml(c.responsavel)}</span></div>` : ""}
        ${c.telefone    ? `<div class="ch-met-row"><span class="ch-met-lbl">Telefone</span><span style="font-size:12px;">${_waEscaparHtml(c.telefone)}</span></div>` : ""}
        ${c.endereco    ? `<div class="ch-met-row"><span class="ch-met-lbl">Endereço</span><span style="font-size:12px;">${_waEscaparHtml(c.endereco + (c.bairro ? ", " + c.bairro : ""))}</span></div>` : ""}
        <div class="ch-met-row"><span class="ch-met-lbl">Cliente desde</span><span style="font-size:12px;">${fmtData(c.criado_em)}</span></div>
        <div class="ch-met-row"><span class="ch-met-lbl">Reservatórios</span><span style="font-size:12px;">${c.total_reservatorios ?? 0}</span></div>
      </div>
    </div>

    <div class="ch-det-section">
      <div class="ch-det-sec-title">Chamados</div>
      <div class="ch-det-meta">
        <div class="ch-met-row"><span class="ch-met-lbl">Em aberto</span><span style="font-size:13px;font-weight:600;color:${chAbertos > 0 ? "var(--warn)" : "var(--text)"};">${chAbertos}</span></div>
        <div class="ch-met-row"><span class="ch-met-lbl">Resolvidos</span><span style="font-size:13px;font-weight:600;color:var(--ok);">${chFechados}</span></div>
      </div>
    </div>

    ${_cliRenderContratoCard(c.id)}

    ${telHtml}

    <div class="ch-det-section">
      <div class="ch-det-sec-title" style="display:flex;align-items:center;justify-content:space-between;">
        Representantes
        <button class="btn btn-sm viewer-only-hide" data-action="novo-representante" data-condo-id="${c.id}">+ Adicionar</button>
      </div>
      <div class="ch-det-meta">${repsHtml}</div>
    </div>

    <div class="ch-det-acoes">
      <button class="btn btn-sm" data-action="ver-condo" data-id="${c.id}" style="width:100%;justify-content:center;">
        Ver histórico completo
      </button>
      <button class="btn btn-sm viewer-only-hide" data-action="editar-condominio" data-id="${c.id}">Editar</button>
      ${c.ativo
        ? `<button class="btn btn-sm btnDanger viewer-only-hide" data-action="inativar-condominio" data-id="${c.id}" data-nome="${_waEscaparHtml(c.nome_fantasia || c.nome).replaceAll('"', '&quot;')}">Inativar</button>`
        : `<button class="btn btn-sm btnAccent viewer-only-hide" data-action="reativar-condominio" data-id="${c.id}">Reativar</button>`}
    </div>
  </div>`;

  _cliCarregarContrato(c.id);
}


function renderClientes() {
  renderCliKpis();
  renderCliTabela();
  if (_cliSelecionadoId) {
    const c = (Array.isArray(_condominios) ? _condominios : []).find(c => c.id === _cliSelecionadoId);
    renderCliDetalhe(c || null);
    if (!c) _cliSelecionadoId = null;
  }
}

// ============================================================
// SECTION: TÉCNICOS
// ============================================================

async function carregarTecnicos() {
  const r = await fetch("/tecnicos", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /tecnicos: " + r.status);
  _tecnicosData = await r.json();
}

let _tecFiltros = { tab: "todos", busca: "" };
let _tecSelecionadoId = null;

function _tecFiltrados() {
  const lista = Array.isArray(_tecnicosData) ? _tecnicosData : [];
  const busca = (_tecFiltros.busca || "").toLowerCase().trim();
  return lista.filter(t => {
    if (!t.ativo) return false;
    const tab = _tecFiltros.tab;
    if (tab && tab !== "todos" && (t.cargo || "tecnico") !== tab) return false;
    if (busca && !t.nome?.toLowerCase().includes(busca) &&
                 !t.especialidade?.toLowerCase().includes(busca) &&
                 !t.telefone?.includes(busca) &&
                 !(_tecCargoLabel[t.cargo || "tecnico"] || "").toLowerCase().includes(busca)) return false;
    return true;
  });
}


function renderTecTabela() {
  const tbody = document.getElementById("tecTableBody");
  if (!tbody) return;
  const lista = (Array.isArray(_tecnicosData) ? _tecnicosData : []).filter(t => t.ativo);
  const _ct = cargo => lista.filter(t => (t.cargo || "tecnico") === cargo).length;

  document.getElementById("tecCtTodos").textContent    = lista.length;
  document.getElementById("tecCtTecnico").textContent  = _ct("tecnico");
  document.getElementById("tecCtAdm").textContent      = _ct("adm");
  document.getElementById("tecCtGestor").textContent   = _ct("gestor");
  document.getElementById("tecCtTi").textContent       = _ct("ti");

  const filtrados = _tecFiltrados();
  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:32px;">Nenhum colaborador encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(t => {
    const sel = _tecSelecionadoId === t.id ? " is-selected" : "";
    const cargo = t.cargo || "tecnico";
    const cargoBadge = `<span class="ch-cat-badge">${_tecCargoLabel[cargo] || cargo}</span>`;
    const dispBadge = cargo === "tecnico"
      ? (t.disponivel
          ? `<span class="ch-st ch-st-fechado">Disponível</span>`
          : `<span class="ch-st ch-st-em_atendimento">Ocupado</span>`)
      : `<span class="ch-st" style="opacity:.5;">—</span>`;
    const avatarHtml = t.foto_url
      ? `<span class="tec-row-avatar"><img src="${t.foto_url}" alt=""></span>`
      : `<span class="tec-row-avatar">${_tecIniciais(t.nome)}</span>`;
    const locEntry = (Array.isArray(_tecLocs) ? _tecLocs : []).find(l => l.tecnico_id === t.id);
    const _locStale = locEntry ? _tecStale(locEntry.capturada_em) : false;
    const _dotColor = !locEntry ? "var(--muted)" : _locStale ? "#f59e0b" : "#22c55e";
    const _dotTitle = !locEntry ? "Offline" : _locStale ? "Sem sinal" : "Online agora";
    const onlineDot = `<span title="${_dotTitle}" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${_dotColor};margin-right:6px;flex-shrink:0;"></span>`;
    return `<tr class="ch-row${sel}" data-tec-id="${t.id}" style="cursor:pointer;">
      <td style="font-weight:500;font-size:12px;display:flex;align-items:center;">${avatarHtml}${onlineDot}${_waEscaparHtml(t.nome)}</td>
      <td>${cargoBadge}</td>
      <td style="font-size:11px;color:var(--muted);">${_waEscaparHtml(t.especialidade || "—")}</td>
      <td>${dispBadge}</td>
    </tr>`;
  }).join("");
}

function renderTecDetalhe(t) {
  const col = document.getElementById("tecDetailCol");
  if (!col) return;

  if (!t) {
    col.innerHTML = `<div class="ch-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <p>Selecione um colaborador para ver os detalhes</p>
    </div>`;
    return;
  }

  const cargo = t.cargo || "tecnico";
  const cargoBadgedet = `<span class="ch-cat-badge">${_tecCargoLabel[cargo] || cargo}</span>`;
  const dispBadge = cargo === "tecnico"
    ? (t.disponivel
        ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(34,197,94,.15);color:var(--ok);">Disponível</span>`
        : `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(251,146,60,.15);color:#fb923c;">Ocupado</span>`)
    : "";

  const avatarDet = t.foto_url
    ? `<div class="tec-det-avatar"><img src="${t.foto_url}" alt="foto"></div>`
    : `<div class="tec-det-avatar">${_tecIniciais(t.nome)}</div>`;

  const locEntry = (Array.isArray(_tecLocs) ? _tecLocs : []).find(l => l.tecnico_id === t.id);
  const locStale = locEntry ? _tecStale(locEntry.capturada_em) : false;
  const onlineStatusHtml = !locEntry
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(100,116,139,.12);color:var(--muted);">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--muted);display:inline-block;"></span>Offline
       </span>`
    : locStale
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,.12);color:#f59e0b;">
        <span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>Sem sinal · ${_tempoRelativo(locEntry.capturada_em)}
       </span>`
    : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(34,197,94,.15);color:#22c55e;">
        <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;"></span>Online agora
       </span>`;

  // Chamados atribuídos a este técnico
  const chamadosTec = (Array.isArray(_chamadosData) ? _chamadosData : [])
    .filter(ch => Number(ch.tecnico_id) === Number(t.id));
  const chAbertos  = chamadosTec.filter(ch => ch.status !== "fechado");
  const chFechados = chamadosTec.filter(ch => ch.status === "fechado").length;

  const chRecentesHtml = chAbertos.slice(0, 4).map(ch => `
    <div class="ch-met-row">
      <span class="ch-met-lbl">CH-${String(ch.id).padStart(4,"0")}</span>
      <span style="font-size:11px;">${_waEscaparHtml(ch.titulo || "Sem título")}</span>
    </div>`).join("") || `<div style="font-size:11px;color:var(--muted);">Nenhum chamado em aberto.</div>`;

  const fmtNasc = n => {
    if (!n) return null;
    const d = new Date(n);
    if (isNaN(d)) return null;
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  };

  const row = (lbl, val) => val ? `<div class="ch-met-row"><span class="ch-met-lbl">${lbl}</span><span style="font-size:12px;">${_waEscaparHtml(val)}</span></div>` : "";

  col.innerHTML = `<div class="ch-detail">
    <div class="tec-det-head-row">
      ${avatarDet}
      <div class="tec-det-head-info">
        <div class="ch-det-title" style="margin-bottom:4px;">${_waEscaparHtml(t.nome)}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${cargoBadgedet}
          ${t.especialidade ? `<span class="ch-cat-badge" style="opacity:.7;">${_waEscaparHtml(t.especialidade)}</span>` : ""}
          ${dispBadge}
          ${onlineStatusHtml}
        </div>
      </div>
    </div>

    <div class="ch-det-section">
      <div class="ch-det-sec-title">Contato</div>
      <div class="ch-det-meta">
        ${row("Telefone", t.telefone)}
        ${row("Email", t.email)}
        ${row("Endereço", t.endereco)}
      </div>
    </div>

    <div class="ch-det-section">
      <div class="ch-det-sec-title">Documentos</div>
      <div class="ch-det-meta">
        ${row("CPF", t.cpf)}
        ${row("RG", t.rg)}
        ${row("Nascimento", fmtNasc(t.data_nascimento))}
        ${row("Cadastrado em", fmtData(t.criado_em))}
      </div>
    </div>

    ${t.observacoes ? `<div class="ch-det-section">
      <div class="ch-det-sec-title">Observações</div>
      <div style="font-size:12px;color:var(--text);padding:8px;background:var(--surface3);border-radius:6px;">${_waEscaparHtml(t.observacoes)}</div>
    </div>` : ""}

    ${cargo === "tecnico" ? `
    <div class="ch-det-section">
      <div class="ch-det-sec-title">Chamados</div>
      <div class="ch-det-meta" style="margin-bottom:8px;">
        <div class="ch-met-row"><span class="ch-met-lbl">Em aberto</span><span style="font-size:13px;font-weight:600;color:${chAbertos.length > 0 ? "var(--warn)" : "var(--text)"};">${chAbertos.length}</span></div>
        <div class="ch-met-row"><span class="ch-met-lbl">Resolvidos</span><span style="font-size:13px;font-weight:600;color:var(--ok);">${chFechados}</span></div>
      </div>
      ${chRecentesHtml}
    </div>` : ""}

    <div class="ch-det-acoes">
      ${cargo === "tecnico" ? `
      <button class="btn btn-sm viewer-only-hide ${t.disponivel ? "" : "btnAccent"}" data-action="toggle-tec-disp" data-id="${t.id}" data-disp="${t.disponivel ? "1" : "0"}">
        ${t.disponivel ? "Marcar ocupado" : "Marcar disponível"}
      </button>` : ""}
      <button class="btn btn-sm viewer-only-hide" data-action="editar-tecnico" data-id="${t.id}">Editar</button>
      <button class="btn btn-sm btnDanger viewer-only-hide" data-action="excluir-tecnico" data-id="${t.id}" data-nome="${_waEscaparHtml(t.nome)}">Excluir</button>
    </div>
  </div>`;
}

function renderTecnicos() {
  renderTecTabela();
  if (_tecSelecionadoId) {
    const t = (_tecnicosData || []).find(t => t.id === _tecSelecionadoId);
    renderTecDetalhe(t || null);
    if (!t) _tecSelecionadoId = null;
  }
}

function _tecFotoBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    img.onload = () => {
      const SIZE = 300;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      const side = Math.min(img.width, img.height);
      const ox = (img.width - side) / 2;
      const oy = (img.height - side) / 2;
      ctx.drawImage(img, ox, oy, side, side, 0, 0, SIZE, SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const _tecCargoLabel = { tecnico: "Técnico", adm: "Adm", gestor: "Gestor", ti: "TI" };

function _tecIniciais(nome) {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0][0].toUpperCase();
}

function abrirModalTecnico(tec = null) {
  const editing = !!tec;
  const overlay = document.createElement("div");
  overlay.id = "modalTecnico";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:16px 0;";
  const temLogin = !!tec?.tem_login;
  const senhaHint = !editing
    ? "Opcional. Se preencher, cria um login pro app (email + senha)."
    : (temLogin ? "Trocar senha do login do app. Deixe vazio pra manter."
                : "Opcional. Se preencher, cria o login do app retroativamente.");
  const loginBadge = editing
    ? `<span class="badge ${temLogin ? "b-ok" : ""}" style="font-size:10px;margin-left:8px;vertical-align:middle;">${temLogin ? "✓ Tem login do app" : "Sem login"}</span>`
    : "";

  const fotoAtual = tec?.foto_url || null;
  const avatarInner = fotoAtual
    ? `<img src="${fotoAtual}" alt="foto">`
    : `<span id="tecModalAvatarIniciais">${_tecIniciais(tec?.nome || "")}</span>`;

  const fmtNasc = tec?.data_nascimento ? tec.data_nascimento.slice(0, 10) : "";

  overlay.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border-strong);border-radius:14px;width:840px;max-width:96vw;box-shadow:0 32px 80px rgba(0,0,0,.75);margin:auto;overflow:hidden;">

      <!-- Cabeçalho -->
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.2;">${editing ? "Editar colaborador" : "Novo colaborador"}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">${editing ? "Atualize os dados abaixo e salve" : "Preencha os dados para cadastrar no sistema"}${loginBadge}</div>
          </div>
          <button class="btn btn-sm" data-action="fechar-modal-tecnico" style="margin-top:2px;">✕</button>
        </div>
      </div>

      <!-- Corpo -->
      <div style="padding:16px 24px;display:flex;flex-direction:column;gap:10px;">

        <!-- Seção: Dados pessoais -->
        <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:12px;">Dados pessoais</div>
          <div style="display:flex;gap:16px;align-items:flex-start;">
            <!-- Avatar -->
            <div class="tec-avatar-wrap" style="flex-shrink:0;min-width:84px;gap:5px;padding:0;">
              <div class="tec-avatar-circle" id="tecModalAvatarCircle" title="Clique para trocar a foto">
                ${avatarInner}
                <div class="tec-avatar-overlay">Trocar<br>foto</div>
              </div>
              <span class="tec-avatar-hint" style="text-align:center;line-height:1.5;">Foto<br>JPG/PNG</span>
              <input type="file" id="tecModalFotoInput" accept="image/jpeg,image/png,image/webp" style="display:none;">
            </div>
            <!-- Grid -->
            <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
              <div class="field" style="grid-column:1/3;">
                <span class="lbl">Nome <span class="req">*</span></span>
                <input id="tecModalNome" class="input" value="${tec ? _waEscaparHtml(tec.nome) : ""}" placeholder="Ex: Carlos Silva" />
              </div>
              <div class="field">
                <span class="lbl">Cargo <span class="req">*</span></span>
                <select id="tecModalCargo" class="input">
                  <option value="tecnico" ${(tec?.cargo || "tecnico") === "tecnico" ? "selected" : ""}>Técnico</option>
                  <option value="adm"     ${tec?.cargo === "adm"     ? "selected" : ""}>Adm</option>
                  <option value="gestor"  ${tec?.cargo === "gestor"  ? "selected" : ""}>Gestor</option>
                  <option value="ti"      ${tec?.cargo === "ti"      ? "selected" : ""}>TI</option>
                </select>
              </div>
              <div class="field">
                <span class="lbl">Telefone</span>
                <input id="tecModalTel" class="input" value="${_waEscaparHtml(tec?.telefone || "")}" placeholder="(11) 99999-9999" />
              </div>
              <div class="field">
                <span class="lbl">Email</span>
                <input id="tecModalEmail" class="input" value="${_waEscaparHtml(tec?.email || "")}" placeholder="colaborador@exemplo.com" />
              </div>
              <div class="field">
                <span class="lbl">Especialidade / Função</span>
                <input id="tecModalEsp" class="input" value="${_waEscaparHtml(tec?.especialidade || "")}" placeholder="Hidráulica, Suporte TI…" />
              </div>
            </div>
          </div>
        </div>

        <!-- Seção: Documentos -->
        <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:12px;">Documentos e localização</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div class="field">
              <span class="lbl">CPF</span>
              <input id="tecModalCpf" class="input" value="${_waEscaparHtml(tec?.cpf || "")}" placeholder="000.000.000-00" maxlength="14" />
            </div>
            <div class="field">
              <span class="lbl">RG</span>
              <input id="tecModalRg" class="input" value="${_waEscaparHtml(tec?.rg || "")}" placeholder="00.000.000-0" maxlength="12" />
            </div>
            <div class="field">
              <span class="lbl">Data de nascimento</span>
              <input id="tecModalNasc" class="input" type="date" value="${fmtNasc}" />
            </div>
            <div class="field" style="grid-column:1/-1;">
              <span class="lbl">Endereço</span>
              <input id="tecModalEnd" class="input" value="${_waEscaparHtml(tec?.endereco || "")}" placeholder="Rua, número, cidade" />
            </div>
            <div class="field" style="grid-column:1/-1;">
              <span class="lbl">Observações internas</span>
              <textarea id="tecModalObs" class="input" rows="2" style="resize:vertical;">${_waEscaparHtml(tec?.observacoes || "")}</textarea>
            </div>
          </div>
        </div>

      </div>

      <!-- Rodapé -->
      <div style="padding:14px 24px;border-top:1px solid var(--border);background:rgba(0,0,0,.2);display:flex;align-items:center;gap:12px;">
        <button class="btn btnAccent" id="btnSalvarTecnico" style="min-width:148px;">${editing ? "Salvar alterações" : "Criar colaborador"}</button>
        <span id="msgTecnico" class="hint"></span>
      </div>

    </div>`;
  document.body.appendChild(overlay);

  // Upload de foto
  let _fotoBase64Pendente = fotoAtual;
  const fotoInput  = document.getElementById("tecModalFotoInput");
  const avatarCirc = document.getElementById("tecModalAvatarCircle");
  avatarCirc?.addEventListener("click", () => fotoInput?.click());
  fotoInput?.addEventListener("change", async () => {
    const file = fotoInput.files[0];
    if (!file) return;
    try {
      const b64 = await _tecFotoBase64(file);
      _fotoBase64Pendente = b64;
      avatarCirc.innerHTML = `<img src="${b64}" alt="foto"><div class="tec-avatar-overlay">Trocar<br>foto</div>`;
    } catch { alert("Não foi possível processar a imagem."); }
  });

  // Máscara simples de CPF
  document.getElementById("tecModalCpf")?.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    e.target.value = v;
  });

  document.getElementById("btnSalvarTecnico")?.addEventListener("click", async () => {
    const nome  = (document.getElementById("tecModalNome")?.value  || "").trim();
    const cargo = document.getElementById("tecModalCargo")?.value  || "tecnico";
    const tel   = (document.getElementById("tecModalTel")?.value   || "").trim();
    const email = (document.getElementById("tecModalEmail")?.value || "").trim();
    const esp   = (document.getElementById("tecModalEsp")?.value   || "").trim();
    const senha = (document.getElementById("tecModalSenha")?.value || "").trim();
    const cpf   = (document.getElementById("tecModalCpf")?.value   || "").trim();
    const rg    = (document.getElementById("tecModalRg")?.value    || "").trim();
    const nasc  = (document.getElementById("tecModalNasc")?.value  || "").trim();
    const end   = (document.getElementById("tecModalEnd")?.value   || "").trim();
    const obs   = (document.getElementById("tecModalObs")?.value   || "").trim();
    const msg   = document.getElementById("msgTecnico");

    if (!nome) { if (msg) msg.textContent = "Nome é obrigatório."; return; }
    if (senha && senha.length < 6) { if (msg) msg.textContent = "Senha mínima de 6 caracteres."; return; }
    if (senha && !email) { if (msg) msg.textContent = "Email é obrigatório quando há senha (será o login)."; return; }
    if (msg) msg.textContent = "";

    const body = {
      nome, cargo, telefone: tel || null, email: email || null, especialidade: esp || null,
      foto_url: _fotoBase64Pendente || null,
      cpf: cpf || null, rg: rg || null,
      data_nascimento: nasc || null, endereco: end || null, observacoes: obs || null,
    };
    if (senha) body.senha = senha;

    const url    = editing ? `/tecnicos/${tec.id}` : "/tecnicos";
    const method = editing ? "PATCH" : "POST";
    const btn = document.getElementById("btnSalvarTecnico");
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(url, { method, headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { if (msg) msg.textContent = data.error || "Erro ao salvar."; return; }
      overlay.remove();
      await carregarTecnicos();
      renderTecnicos();
      if (_tecSelecionadoId === (tec?.id || data.id)) {
        const updated = (_tecnicosData || []).find(t => t.id === _tecSelecionadoId);
        renderTecDetalhe(updated || null);
      }
    } catch { if (msg) msg.textContent = "Erro de rede."; }
    finally { if (btn) btn.disabled = false; }
  });
}

function abrirModalNovoCliente() {
  const overlay = document.createElement("div");
  overlay.id = "modalNovoCliente";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  overlay.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:20px 28px;width:1100px;max-width:98vw;box-shadow:0 24px 64px rgba(0,0,0,.6);">

      <!-- Cabeçalho -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:600;">Novo cliente</div>
        <button class="btn btn-sm" data-action="fechar-modal-cliente">✕</button>
      </div>

      <!-- CNPJ -->
      <div style="display:flex;gap:8px;margin-bottom:6px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <div style="flex:1;">
          <span class="lbl" style="display:block;margin-bottom:4px;">CNPJ — preenche campos automaticamente</span>
          <input id="cliModalCnpj" class="input" placeholder="00.000.000/0001-00" maxlength="18" style="font-family:monospace;" />
        </div>
        <div style="display:flex;align-items:flex-end;">
          <button class="btn btn-sm" id="btnBuscarCnpj" style="height:34px;white-space:nowrap;">Buscar dados</button>
        </div>
      </div>
      <span id="msgCnpj" class="hint" style="display:block;min-height:14px;margin-bottom:8px;"></span>

      <!-- Layout dois painéis: campos | mapa -->
      <div style="display:flex;gap:20px;align-items:flex-start;">

        <!-- Painel esquerdo: campos -->
        <div style="flex:1;min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;">
          <div class="field">
            <span class="lbl">Razão Social <span class="req">*</span></span>
            <input id="cliModalNome" class="input" placeholder="Ex: Jardins Condomínio LTDA" />
          </div>
          <div class="field">
            <span class="lbl">Nome Fantasia <span style="font-weight:400;color:var(--muted);">— exibição</span></span>
            <input id="cliModalNomeFantasia" class="input" placeholder="Ex: Condomínio Jardins" />
          </div>
          <div class="field" style="grid-column:1/-1;">
            <span class="lbl">Endereço</span>
            <input id="cliModalEndereco" class="input" placeholder="Rua, número" />
          </div>
          <div class="field">
            <span class="lbl">Bairro</span>
            <input id="cliModalBairro" class="input" placeholder="Ex: Tatuapé" />
          </div>
          <div class="field">
            <span class="lbl">CEP</span>
            <input id="cliModalCep" class="input" placeholder="00000-000" maxlength="9" />
            <span class="cep-msg" id="cliModalCepMsg" style="margin-top:3px;display:block;"></span>
          </div>
          <div class="field">
            <span class="lbl">Cidade</span>
            <input id="cliModalCidade" class="input" placeholder="Ex: São Paulo" />
          </div>
          <div class="field">
            <span class="lbl">UF</span>
            <input id="cliModalUf" class="input" maxlength="2" placeholder="SP" />
          </div>
          <div class="field">
            <span class="lbl">Responsável</span>
            <input id="cliModalResponsavel" class="input" placeholder="Ex: Síndico João Silva" />
          </div>
          <div class="field">
            <span class="lbl">Telefone</span>
            <input id="cliModalTelefone" class="input" placeholder="(11) 99999-9999" />
          </div>
          <div class="field" style="grid-column:1/-1;">
            <span class="lbl">E-mail <span style="font-weight:400;color:var(--muted);">— para envio de orçamentos (separe vários por vírgula)</span></span>
            <input id="cliModalEmail" class="input" type="text" placeholder="contato@condominio.com.br, sindico@condominio.com.br" />
          </div>
        </div>

        <!-- Painel direito: mapa -->
        <div style="width:420px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span class="lbl" style="margin:0;">Localização</span>
            <button type="button" class="btn btn-sm" data-action="buscar-coords" data-prefix="cliModal" style="font-size:11px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Buscar
            </button>
          </div>
          <div id="cliModalLocMsg" class="loc-msg" style="font-size:10px;"></div>
          <div class="mini-mapa" id="cliModalMiniMapa" style="height:360px;border-radius:6px;overflow:hidden;"></div>
          <div style="font-size:10px;color:var(--muted);">Arraste o pino para ajustar.</div>
        </div>

      </div>

      <input type="hidden" id="cliModalLat" />
      <input type="hidden" id="cliModalLng" />

      <!-- Rodapé -->
      <div class="form-footer" style="margin-top:14px;">
        <button class="btn btnAccent" id="btnCriarClienteModal">Criar cliente</button>
        <span id="msgClienteModal" class="hint"></span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Mini-mapa (precisa do elemento no DOM antes de inicializar)
  criarOuObterMiniMapa("cliModal");

  // CEP auto-preenche endereço + geocoding ao completar 8 dígitos
  _bindCepInput("cliModal");

  // ---- busca CNPJ ----
  const cnpjInput = document.getElementById("cliModalCnpj");
  cnpjInput?.addEventListener("input", () => {
    let v = cnpjInput.value.replace(/\D/g, "").slice(0, 14);
    if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
    cnpjInput.value = v;
  });

  document.getElementById("btnBuscarCnpj")?.addEventListener("click", async () => {
    const cnpj = (cnpjInput?.value || "").replace(/\D/g, "");
    const msgCnpj = document.getElementById("msgCnpj");
    if (msgCnpj) msgCnpj.textContent = "";
    if (cnpj.length !== 14) {
      if (msgCnpj) msgCnpj.textContent = "CNPJ deve ter 14 dígitos.";
      return;
    }
    const btn = document.getElementById("btnBuscarCnpj");
    if (btn) { btn.disabled = true; btn.textContent = "Buscando…"; }
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      const data = await r.json();
      if (!r.ok) {
        if (msgCnpj) msgCnpj.textContent = data.message || "CNPJ não encontrado.";
        return;
      }
      // preenche campos automaticamente
      const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      set("cliModalNome",         data.razao_social || data.nome_fantasia);
      set("cliModalNomeFantasia", data.nome_fantasia);
      set("cliModalEndereco",     [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", "));
      set("cliModalBairro",    data.bairro);
      set("cliModalCidade",    data.municipio);
      set("cliModalUf",        data.uf);
      set("cliModalCep",       (data.cep || "").replace(/^(\d{5})(\d{3})$/, "$1-$2"));
      set("cliModalTelefone",  data.ddd_telefone_1 ? data.ddd_telefone_1.replace(/\D/g, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : "");
      if (msgCnpj) {
        const situacao = data.descricao_situacao_cadastral || "";
        const ativa = situacao.toLowerCase().includes("ativa");
        msgCnpj.style.color = ativa ? "var(--ok)" : "var(--warn)";
        msgCnpj.textContent = `✓ Dados preenchidos${situacao ? " · " + situacao : ""}`;
      }
      // Geocodifica: tenta CEP primeiro (BrasilAPI/AwesomeAPI trazem coords diretas pra
      // endereços brasileiros — muito mais confiável que Nominatim nesses casos).
      // Não chama buscarEnderecoPorCep() pra não sobrescrever o endereço completo
      // (rua + número + complemento) que o CNPJ já preencheu.
      const _locMsg = document.getElementById("cliModalLocMsg");
      if (_locMsg) { _locMsg.className = "loc-msg"; _locMsg.textContent = "Buscando localização…"; }
      const _cepCnpj = (data.cep || "").replace(/\D/g, "");
      if (_cepCnpj.length === 8) {
        const [_brasilCep, _awesomeCep] = await Promise.all([
          fetch(`https://brasilapi.com.br/api/cep/v2/${_cepCnpj}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`https://cep.awesomeapi.com.br/json/${_cepCnpj}`).then(r => r.ok ? r.json() : null).then(d => d?.status ? null : d).catch(() => null),
        ]);
        const _bc = _brasilCep?.location?.coordinates;
        const _coords = [
          { lat: _bc?.latitude,    lng: _bc?.longitude   },
          { lat: _awesomeCep?.lat, lng: _awesomeCep?.lng },
        ].find(f => f.lat != null && f.lng != null && Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng)));
        if (_coords) {
          _miniMapaAplicarCoord("cliModal", Number(_coords.lat), Number(_coords.lng));
          if (_locMsg) { _locMsg.className = "loc-msg is-ok"; _locMsg.textContent = "✓ Pino posicionado pelo CEP. Arraste se precisar ajustar o número da casa."; }
        } else {
          buscarCoordenadasPorEndereco("cliModal");
        }
      } else {
        buscarCoordenadasPorEndereco("cliModal");
      }
    } catch {
      if (msgCnpj) msgCnpj.textContent = "Erro ao consultar CNPJ. Verifique a conexão.";
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Buscar dados"; }
    }
  });

  document.getElementById("btnCriarClienteModal")?.addEventListener("click", async () => {
    const nome         = (document.getElementById("cliModalNome")?.value || "").trim();
    const nome_fantasia = (document.getElementById("cliModalNomeFantasia")?.value || "").trim() || null;
    const cnpj         = (document.getElementById("cliModalCnpj")?.value || "").replace(/\D/g, "") || null;
    const responsavel  = (document.getElementById("cliModalResponsavel")?.value || "").trim() || null;
    const telefone     = (document.getElementById("cliModalTelefone")?.value || "").trim() || null;
    const email        = (document.getElementById("cliModalEmail")?.value || "").trim().toLowerCase() || null;
    const cidade       = (document.getElementById("cliModalCidade")?.value || "").trim() || null;
    const uf           = (document.getElementById("cliModalUf")?.value || "").trim().toUpperCase() || null;
    const endereco     = (document.getElementById("cliModalEndereco")?.value || "").trim() || null;
    const bairro       = (document.getElementById("cliModalBairro")?.value || "").trim() || null;
    const cep          = (document.getElementById("cliModalCep")?.value || "").replace(/\D/g, "") || null;
    const latVal       = document.getElementById("cliModalLat")?.value;
    const lngVal       = document.getElementById("cliModalLng")?.value;
    const lat          = latVal ? Number(latVal) : null;
    const lng          = lngVal ? Number(lngVal) : null;
    const msg = document.getElementById("msgClienteModal");
    if (msg) msg.textContent = "";
    if (!nome) {
      if (msg) msg.textContent = "Razão Social é obrigatória.";
      return;
    }
    try {
      const r = await fetch("/condominios", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ nome, nome_fantasia, cnpj, email, responsavel, telefone, cidade, uf, endereco, bairro, cep, lat, lng })
      });
      const data = await r.json();
      if (!r.ok) { if (msg) msg.textContent = data.error || "Erro ao criar."; return; }
      overlay.remove();
      _miniMapas.delete("cliModal");
      await carregarCondominios();
      renderClientes();
    } catch (e) {
      if (msg) msg.textContent = "Erro de rede.";
    }
  });
}

function abrirModalNovoRepresentante(condoId) {
  const condo = (Array.isArray(_condominios) ? _condominios : []).find(c => c.id === condoId);
  const overlay = document.createElement("div");
  overlay.id = "modalNovoRep";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:24px;width:440px;max-width:95vw;box-shadow:0 24px 64px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:14px;font-weight:600;">Adicionar representante</div>
        <button class="btn btn-sm" data-action="fechar-modal-rep">✕</button>
      </div>
      ${condo ? `<div style="font-size:11px;color:var(--muted);margin-bottom:16px;">${_waEscaparHtml(condo.nome)}</div>` : ""}
      <div class="grid-2">
        <div class="field">
          <span class="lbl">Nome <span class="req">*</span></span>
          <input id="repModalNome" class="input" placeholder="Ex: João Silva" />
        </div>
        <div class="field">
          <span class="lbl">Email <span class="req">*</span></span>
          <input id="repModalEmail" class="input" placeholder="joao@exemplo.com" />
        </div>
        <div class="field col-2">
          <span class="lbl">Senha provisória <span class="req">*</span></span>
          <input id="repModalSenha" class="input" type="text" placeholder="Ex: 123456" />
        </div>
      </div>
      <div class="form-footer" style="margin-top:16px;">
        <button class="btn btnAccent" id="btnCriarRepModal">Adicionar</button>
        <span id="msgRepModal" class="hint"></span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("btnCriarRepModal")?.addEventListener("click", async () => {
    const nome  = (document.getElementById("repModalNome")?.value || "").trim();
    const email = (document.getElementById("repModalEmail")?.value || "").trim().toLowerCase();
    const senha = (document.getElementById("repModalSenha")?.value || "").trim();
    const msg = document.getElementById("msgRepModal");
    if (msg) msg.textContent = "";
    if (!nome || !email || !senha) {
      if (msg) msg.textContent = "Preencha todos os campos.";
      return;
    }
    try {
      const r = await fetch("/admin/usuarios", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha, role: "cliente", condominio_id: condoId })
      });
      const data = await r.json();
      if (!r.ok) { if (msg) msg.textContent = data.error || "Erro ao criar."; return; }
      overlay.remove();
      await carregarUsuarios();
      renderCliDetalhe((Array.isArray(_condominios) ? _condominios : []).find(c => c.id === condoId) || null);
    } catch (e) {
      if (msg) msg.textContent = "Erro de rede.";
    }
  });
}

function abrirModalNovoReservatorio() {
  const condosOpts = (Array.isArray(_condominios) ? _condominios : [])
    .filter(c => c.ativo)
    .map(c => `<option value="${c.id}">${_waEscaparHtml(c.nome)}</option>`).join("");

  const overlay = document.createElement("div");
  overlay.id = "modalNovoRes";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:24px;width:520px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:600;">Novo reservatório</div>
        <button class="btn btn-sm" data-action="fechar-modal-res">✕</button>
      </div>
      <div class="grid-2">
        <div class="field">
          <span class="lbl">Condomínio <span class="req">*</span></span>
          <select id="resModalCondominio" class="select">
            <option value="">Selecione…</option>
            ${condosOpts}
          </select>
        </div>
        <div class="field">
          <span class="lbl">Tipo <span class="req">*</span></span>
          <select id="resModalTipo" class="select">
            <option value="superior">Superior</option>
            <option value="inferior">Inferior</option>
          </select>
        </div>
        <div class="field col-2">
          <span class="lbl">Nome <span class="req">*</span></span>
          <input id="resModalNome" class="input" placeholder="Ex: Reservatório Superior Bloco A" />
        </div>
        <div class="field col-2">
          <span class="lbl">Device ID <span class="req">*</span></span>
          <input id="resModalDeviceId" class="input" placeholder="Ex: RES_COND10_SUP" />
        </div>
        <div class="field">
          <span class="lbl">Altura total (m)</span>
          <input id="resModalAlturaM" class="input" type="number" step="0.01" min="0" />
        </div>
        <div class="field">
          <span class="lbl">ADC zero</span>
          <input id="resModalAdcZero" class="input" type="number" step="1" min="0" />
        </div>
        <div class="field">
          <span class="lbl">ADC por metro</span>
          <input id="resModalAdcPorMetro" class="input" type="number" step="1" min="1" />
        </div>
        <div class="field">
          <span class="lbl">Faixa sonda (m)</span>
          <input id="resModalFaixaM" class="input" type="number" step="0.01" min="0" />
        </div>
        <div class="field col-2">
          <span class="lbl">Limiar bomba</span>
          <input id="resModalLimiar" class="input" type="number" step="1" min="0" />
        </div>
      </div>
      <div class="form-footer" style="margin-top:16px;">
        <button class="btn btnAccent" id="btnCriarResModal">Cadastrar</button>
        <span id="msgResModal" class="hint"></span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const _numOrNull = (id) => { const v = (document.getElementById(id)?.value || "").trim(); return v ? Number(v) : null; };

  document.getElementById("btnCriarResModal")?.addEventListener("click", async () => {
    const condominio_id = Number(document.getElementById("resModalCondominio")?.value);
    const tipo          = (document.getElementById("resModalTipo")?.value || "").trim();
    const nome          = (document.getElementById("resModalNome")?.value || "").trim();
    const device_id     = (document.getElementById("resModalDeviceId")?.value || "").trim();
    const msg = document.getElementById("msgResModal");
    if (msg) msg.textContent = "";
    if (!condominio_id || !tipo || !nome || !device_id) {
      if (msg) msg.textContent = "Preencha condomínio, tipo, nome e Device ID.";
      return;
    }
    try {
      const r = await fetch("/reservatorios", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          condominio_id, nome, tipo, device_id,
          altura_total_m: _numOrNull("resModalAlturaM"),
          adc_zero:       _numOrNull("resModalAdcZero"),
          adc_por_metro:  _numOrNull("resModalAdcPorMetro"),
          faixa_sonda_m:  _numOrNull("resModalFaixaM"),
          limiar_bomba:   _numOrNull("resModalLimiar"),
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { if (msg) msg.textContent = data.error || "Erro ao cadastrar."; return; }
      if (msg) msg.textContent = `✅ Cadastrado! KEY: ${data.device_key}`;
      setTimeout(() => { overlay.remove(); carregarTudo(); }, 1500);
    } catch (e) {
      if (msg) msg.textContent = "Erro de rede.";
    }
  });
}

async function carregarTudo() {
  const el = document.getElementById("statusMsg");
  if (el) el.textContent = "Carregando...";
  try {
    await Promise.all([
      carregarStatus(),
      carregarAlertas(),
      carregarCondominios(),
      carregarChamados().catch(() => {}),
      carregarConversas().catch(() => {}),
      carregarUsuarios().catch(() => {}),
      carregarTecnicos().catch(() => {}),
      carregarTecnicosLocalizacao().catch(() => {}),
    ]);
    detectarChamadosNovos();
    renderTelemetriaVisuais();
    renderAtendimentoVisuais();
    renderVisuaisCombinados();
    _mpRenderTecnicos();
    _carregarContratosMetricas?.();
    renderClientes();
    renderTecnicos();
    marcarAtualizado();
  } catch (e) {
    if (el) el.textContent = "Erro ao atualizar";
    console.error(e);
  }
}

function atualizarBadgesChamados() {
  const n = _chamadosData.filter(ch => ch.status !== "fechado" && !_chamadosIdsAck.has(ch.id)).length;
  const badge = document.getElementById("navBadgeChamados");
  if (badge) { badge.textContent = n; badge.style.display = n > 0 ? "inline-flex" : "none"; }
  const mobBadge = document.getElementById("mobBadgeChamados");
  if (mobBadge) { mobBadge.textContent = n; mobBadge.classList.toggle("is-visible", n > 0); }
}

// ---- alerta de chamados novos ----
function detectarChamadosNovos() {
  if (!Array.isArray(_chamadosData)) return;

  if (!_chamadosInicializado) {
    // primeira carga: popula sem disparar alerta
    for (const ch of _chamadosData) _chamadosIdsVistos.add(ch.id);
    _chamadosInicializado = true;
    return;
  }

  const novos = _chamadosData.filter(ch => !_chamadosIdsVistos.has(ch.id));
  if (novos.length === 0) return;

  for (const ch of novos) _chamadosIdsVistos.add(ch.id);

  pulsarBadgeChamados();

  if (novos.some(ch => ch.prioridade === "p1")) {
    tocarBeepEmergencia();
  }
}

function pulsarBadgeChamados() {
  const badge = document.getElementById("navBadgeChamados");
  const mob = document.getElementById("mobBadgeChamados");
  for (const el of [badge, mob]) {
    if (!el) continue;
    el.classList.remove("pulse-novo");
    // reflow para reiniciar a animação
    void el.offsetWidth;
    el.classList.add("pulse-novo");
    setTimeout(() => el.classList.remove("pulse-novo"), 6000);
  }
}

let _audioCtx = null;
function tocarBeepEmergencia() {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});

    const now = _audioCtx.currentTime;
    // dois beeps curtos descendentes
    [880, 660].forEach((freq, i) => {
      const osc = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      osc.connect(gain).connect(_audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    });
  } catch (e) {
    console.warn("Beep emergência falhou:", e);
  }
}

function atualizarBadgesWhatsapp() {
  const n = _conversasData.filter(cv => cv.unread_count > 0).length;
  const badge = document.getElementById("navBadgeWhatsapp");
  if (badge) { badge.textContent = n; badge.style.display = n > 0 ? "inline-flex" : "none"; }
}

async function criarReservatorio() {
  const msg = document.getElementById("msgReservatorio");
  if (msg) msg.textContent = "";

  const condominio_id = Number(document.getElementById("resCondominio").value);
  const tipo = (document.getElementById("resTipo").value || "").trim();
  const nome = (document.getElementById("resNome").value || "").trim();
  const device_id = (document.getElementById("resDeviceId").value || "").trim();

  if (!condominio_id || !nome || !tipo || !device_id) {
    if (msg) msg.textContent = "Preencha condomínio, tipo, nome e device id.";
    return;
  }

  const _numOrNull = (id) => { const v = document.getElementById(id)?.value; return v ? Number(v) : null; };

  const payload = {
    condominio_id, nome, tipo, device_id,
    altura_total_m: _numOrNull("resAlturaTotalM"),
    adc_zero: _numOrNull("resAdcZero"),
    adc_por_metro: _numOrNull("resAdcPorMetro"),
    faixa_sonda_m: _numOrNull("resFaixaSondaM"),
    limiar_bomba: _numOrNull("resLimiarBomba"),
  };

  const r = await fetch("/reservatorios", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    if (msg) msg.textContent = data.error || ("Erro (" + r.status + ")");
    return;
  }

  if (msg) msg.textContent = `✅ Reservatório cadastrado • KEY: ${data.device_key}`;

  // limpa campos
  document.getElementById("resNome").value = "";
  document.getElementById("resDeviceId").value = "";
  document.getElementById("resAlturaTotalM").value = "";
  document.getElementById("resAdcZero").value = "";
  document.getElementById("resAdcPorMetro").value = "";
  document.getElementById("resFaixaSondaM").value = "";
  document.getElementById("resLimiarBomba").value = "";

  // opcional: atualizar tudo
  carregarTudo();
}

// ===== SECTION: CHAMADOS =====
// ============================================================
// SECTION: CHAMADOS — redesign
// ============================================================

let _chFiltros = { tab: "todos", busca: "" };
let _chSelecionadoId = null;

const _chCatNome  = { vazamento:"Vazamento", bomba_falha:"Bomba", nivel_baixo:"Nível baixo",
                      sem_agua:"Sem água", ruido:"Ruído", manutencao:"Manutenção", outro:"Outro" };
const _chPrioNome = { p4:"P4 Agendado", p3:"P3 Controlado", p2:"P2 Alta", p1:"P1 Crítico" };
const _chStNome   = { aberto:"Aberto", em_atendimento:"Em atend.", fechado:"Resolvido" };

function _chFiltrados() {
  const lista = Array.isArray(_chamadosData) ? _chamadosData : [];
  const { tab, busca } = _chFiltros;
  return lista.filter(ch => {
    if (tab === "p1" && (ch.prioridade !== "p1" || ch.status === "fechado")) return false;
    if (tab !== "todos" && tab !== "p1" && ch.status !== tab) return false;
    if (busca) {
      const q = busca.toLowerCase();
      const blob = `${ch.id} ${ch.titulo||""} ${ch.condominio_nome||""} ${ch.cliente_nome||""} ${ch.categoria||""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function _chFmtDataCurta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
}

function renderChKpis() {
  const el = document.getElementById("chKpiGrid");
  if (!el) return;
  const data = Array.isArray(_chamadosData) ? _chamadosData : [];

  const abertos  = data.filter(ch => ch.status === "aberto").length;
  const atend    = data.filter(ch => ch.status === "em_atendimento").length;
  const fechados = data.filter(ch => ch.status === "fechado").length;
  const criticos = data.filter(ch => ch.prioridade === "p1" && ch.status !== "fechado").length;
  const taxa     = data.length > 0 ? Math.round(fechados / data.length * 100) : 0;

  const comFechamento = data.filter(ch => ch.status === "fechado" && ch.fechado_em && ch.criado_em);
  let tempoMedio = "—";
  if (comFechamento.length > 0) {
    const avgH = comFechamento.reduce((s, ch) =>
      s + (new Date(ch.fechado_em) - new Date(ch.criado_em)), 0) / comFechamento.length / 3600000;
    tempoMedio = avgH < 1 ? `${Math.round(avgH * 60)}min` : `${avgH.toFixed(1)}h`;
  }

  const kpi = (icon, val, hint, kindCls) => `
    <div class="rc ${kindCls} rc-static">
      <div class="rc-head">
        <div class="rc-icon">${icon}</div>
        <div class="rc-label">${hint}</div>
      </div>
      <div class="rc-value">${val}</div>
    </div>`;

  el.innerHTML =
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        abertos, "Abertos", abertos > 0 ? "rc-warn" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        atend, "Em atendimento", atend > 0 ? "rc-warn" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        fechados, "Resolvidos", fechados > 0 ? "rc-ok" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        criticos, "Críticos abertos", criticos > 0 ? "rc-bad" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
        `${taxa}%`, "Taxa de resolução", taxa >= 70 ? "rc-ok" : taxa >= 40 ? "rc-warn" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        tempoMedio, "Tempo médio resolução", "rc-neutral");
}

function renderChTabela() {
  const tbody = document.getElementById("chTableBody");
  if (!tbody) return;
  const data = Array.isArray(_chamadosData) ? _chamadosData : [];

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("chCtTodos",    data.length);
  set("chCtAbertos",  data.filter(ch => ch.status === "aberto").length);
  set("chCtAtend",    data.filter(ch => ch.status === "em_atendimento").length);
  set("chCtFechados", data.filter(ch => ch.status === "fechado").length);
  set("chCtEmerg",    data.filter(ch => ch.prioridade === "p1" && ch.status !== "fechado").length);

  const lista = _chFiltrados();
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;">Nenhum chamado encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(ch => {
    const sel = _chSelecionadoId === ch.id ? " is-selected" : "";
    return `<tr class="ch-row${sel}" data-ch-id="${ch.id}">
      <td class="ch-id-cell">CH-${String(ch.id).padStart(4,"0")}</td>
      <td class="ch-titulo-cell">
        <div class="ch-titulo-text">${_waEscaparHtml(ch.titulo || "—")}</div>
      </td>
      <td class="ch-condo-cell">${_waEscaparHtml(ch.condominio_nome || "—")}</td>
      <td><span class="ch-cat-badge">${_chCatNome[ch.categoria] || ch.categoria || "—"}</span></td>
      <td><span class="ch-prio ch-prio-${ch.prioridade||"p3"}">${_chPrioNome[ch.prioridade]||ch.prioridade||"—"}</span></td>
      <td>
        <span class="ch-st ch-st-${ch.status||"aberto"}">${_chStNome[ch.status]||ch.status||"—"}</span>
        ${(ch.status === "fechado" && ch.avaliacao_nota != null)
          ? `<span class="ch-aval-inline" title="Avaliado: ${ch.avaliacao_nota} de 5">${_chRenderStars(ch.avaliacao_nota, "sm")}</span>`
          : ""}
        ${ch.sla_ttfr_estourado ? `<span class="ch-sla-badge" title="Sem resposta há mais de ${ch.sla_ttfr_min} min (TTFR)">⚠ SLA</span>` : ""}
        ${(!ch.sla_ttfr_estourado && ch.sla_ttr_risco) ? `<span class="ch-sla-ttr-badge" title="Aberto há mais de ${ch.sla_ttr_min} min (TTR)">⏱ TTR</span>` : ""}
      </td>
      <td class="ch-data-cell">${_chFmtDataCurta(ch.criado_em)}</td>
    </tr>`;
  }).join("");
}

// Avaliação (Fase 7H — visível só pra admin)
function _chRenderStars(nota, size = "md") {
  const n = Math.max(0, Math.min(5, Math.round(Number(nota) || 0)));
  let html = `<div class="ch-stars ch-stars-${size}">`;
  for (let i = 1; i <= 5; i++) {
    const filled = i <= n ? "is-filled" : "";
    html += `<svg class="ch-star ${filled}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
    </svg>`;
  }
  html += `</div>`;
  return html;
}

// Histórico de mudanças (Fase backlog #3 — auditoria)
// Cache por chamadoId: { items: [], loaded: bool, loading: bool }
const _chHistCache = new Map();

function _chFmtCampo(campo) {
  return ({
    criado:          "Chamado criado",
    status:          "Status",
    prioridade:      "Prioridade",
    categoria:       "Categoria",
    responsavel_id:  "Responsável",
    tecnico_id:      "Técnico",
    condominio_id:   "Condomínio",
  })[campo] || campo;
}

function _chFmtValor(campo, valor) {
  if (valor == null || valor === "") return `<em style="color:var(--muted)">—</em>`;
  if (campo === "status")     return `<span class="ch-st ch-st-${valor}">${_chStNome[valor] || valor}</span>`;
  if (campo === "prioridade") return `<span class="ch-prio ch-prio-${valor}">${_chPrioNome[valor] || valor}</span>`;
  if (campo === "categoria")  return `<span class="ch-cat-badge">${_chCatNome[valor] || valor}</span>`;
  if (campo === "responsavel_id" || campo === "tecnico_id" || campo === "condominio_id") return `#${_waEscaparHtml(valor)}`;
  return _waEscaparHtml(String(valor));
}

function _chRenderHistEntry(h) {
  const quando = fmtData(h.alterado_em);
  const autor = h.alterado_por_nome
    ? `<span class="ch-hist-autor">${_waEscaparHtml(h.alterado_por_nome)}</span>`
    : `<span class="ch-hist-autor ch-hist-sistema">Sistema</span>`;
  if (h.campo_alterado === "criado") {
    return `<div class="ch-hist-item">
      <div class="ch-hist-dot ch-hist-dot-criado"></div>
      <div class="ch-hist-body">
        <div class="ch-hist-titulo">Chamado criado</div>
        <div class="ch-hist-meta">${autor} · ${quando}</div>
      </div>
    </div>`;
  }
  const campo = _chFmtCampo(h.campo_alterado);
  const de = _chFmtValor(h.campo_alterado, h.valor_anterior);
  const para = _chFmtValor(h.campo_alterado, h.valor_novo);
  return `<div class="ch-hist-item">
    <div class="ch-hist-dot"></div>
    <div class="ch-hist-body">
      <div class="ch-hist-titulo">${campo}: ${de} → ${para}</div>
      <div class="ch-hist-meta">${autor} · ${quando}</div>
    </div>
  </div>`;
}

function _chRenderHistoricoCard(chamadoId) {
  const cache = _chHistCache.get(chamadoId);
  let inner;
  if (!cache || (!cache.loaded && !cache.loading)) {
    inner = `<div class="ch-hist-loading">Carregando histórico…</div>`;
  } else if (cache.loading) {
    inner = `<div class="ch-hist-loading">Carregando histórico…</div>`;
  } else if (cache.error) {
    inner = `<div class="ch-hist-loading" style="color:var(--danger)">${_waEscaparHtml(cache.error)}</div>`;
  } else if (!cache.items.length) {
    inner = `<div class="ch-hist-loading">Sem mudanças registradas.</div>`;
  } else {
    inner = `<div class="ch-hist-list">${cache.items.map(_chRenderHistEntry).join("")}</div>`;
  }
  return `<div class="ch-det-section ch-hist-section" id="chHistSec-${chamadoId}">
    <div class="ch-det-sec-title">Histórico</div>
    ${inner}
  </div>`;
}

async function _chCarregarHistorico(chamadoId) {
  const cache = _chHistCache.get(chamadoId);
  if (cache && (cache.loaded || cache.loading)) return;
  _chHistCache.set(chamadoId, { items: [], loaded: false, loading: true });
  try {
    const r = await fetch(`/chamados/${chamadoId}/historico`, { headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = await r.json();
    _chHistCache.set(chamadoId, { items, loaded: true, loading: false });
  } catch (e) {
    _chHistCache.set(chamadoId, { items: [], loaded: true, loading: false, error: "Erro ao carregar histórico" });
  }
  // Re-renderiza só a seção, se ainda for o chamado selecionado
  if (_chSelecionadoId === chamadoId) {
    const sec = document.getElementById(`chHistSec-${chamadoId}`);
    if (sec) sec.outerHTML = _chRenderHistoricoCard(chamadoId);
  }
}

function _chRenderAvaliacaoCard(ch) {
  if (ch.avaliacao_nota == null) return "";
  const quando = ch.avaliacao_em ? fmtData(ch.avaliacao_em) : "";
  const coment = ch.avaliacao_comentario ? _waEscaparHtml(ch.avaliacao_comentario) : "";
  return `<div class="ch-det-section ch-aval-section">
    <div class="ch-det-sec-title">Avaliação do cliente</div>
    <div class="ch-aval-row">
      ${_chRenderStars(ch.avaliacao_nota, "lg")}
      <span class="ch-aval-nota">${ch.avaliacao_nota} de 5</span>
      ${quando ? `<span class="ch-aval-quando">${quando}</span>` : ""}
    </div>
    ${coment ? `<div class="ch-aval-coment">"${coment}"</div>` : `<div class="ch-aval-coment ch-aval-vazio">Sem comentário escrito.</div>`}
  </div>`;
}

function renderChDetalhe(ch) {
  const col = document.getElementById("chDetailCol");
  if (!col) return;

  if (!ch) {
    col.innerHTML = `<div class="ch-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      <p>Selecione um chamado para ver os detalhes</p>
    </div>`;
    return;
  }

  // Telemetria snapshot do condomínio
  let telHtml = "";
  if (ch.condominio_id) {
    const item = (_statusData || []).find(g => Number(g.condominio?.id) === Number(ch.condominio_id));
    const reservs = item?.reservatorios?.slice(0, 6) || [];
    if (reservs.length) {
      const resHtml = reservs.map(r => {
        const u = r.ultima_leitura;
        const pct = u?.nivel_pct ?? null;
        const n = String(u?.nivel || "").toLowerCase();
        const lvClass = n === "alto" ? "lv-alto" : n === "medio" ? "lv-medio" : n === "baixo" ? "lv-baixo" : n === "muito_baixo" ? "lv-muito-baixo" : "lv-unknown";
        const pctWidth = pct != null ? pct : 0;
        const pctDisplay = pct != null ? pct + "%" : "-";
        const bombaClass = u?.bomba_ligada === true ? "on" : u?.bomba_ligada === false ? "off" : "uk";
        const bombaLabel = u?.bomba_ligada === true ? "LIGADA" : u?.bomba_ligada === false ? "DESLIG." : "—";
        return `<div class="cc-res">
          <div class="cc-res-header">
            <span class="cc-res-name">${_waEscaparHtml(r.nome || "Reservatório")}</span>
            <span class="cc-res-bomba ${bombaClass}">${bombaLabel}</span>
          </div>
          <div class="cc-level-row">
            <div class="cc-level-bar">
              <div class="cc-level-fill ${lvClass}" style="width:${pctWidth}%"></div>
            </div>
            <span class="cc-level-pct">${pctDisplay}</span>
          </div>
        </div>`;
      }).join("");
      telHtml = `<div class="ch-det-section">
        <div class="ch-det-sec-title">Telemetria atual</div>
        <div class="cc-res-list">${resHtml}</div>
        <button class="btn btn-sm ch-tel-btn"
          data-action="ver-condo" data-id="${ch.condominio_id}">
          📊 Ver telemetria do condomínio
        </button>
      </div>`;
    }
  }

  const fechado   = ch.status === "fechado";
  const acoes = fechado
    ? `<button class="btn btn-sm viewer-only-hide" data-action="reabrir-chamado" data-id="${ch.id}">↺ Reabrir</button>`
    : `<button class="btn btn-sm viewer-only-hide" style="color:var(--ok);border-color:rgba(34,197,94,.3);" data-action="fechar-chamado" data-id="${ch.id}">✓ Fechar</button>`;

  col.innerHTML = `<div class="ch-detail">
    <div class="ch-det-head">
      <span class="ch-det-id">CH-${String(ch.id).padStart(4,"0")}</span>
      <span class="ch-st ch-st-${ch.status||"aberto"}">${_chStNome[ch.status]||ch.status}</span>
    </div>
    <div class="ch-det-title">${_waEscaparHtml(ch.titulo || "Sem título")}</div>

    ${ch.descricao ? `<div class="ch-det-section">
      <div class="ch-det-sec-title">Descrição</div>
      <div class="ch-det-desc">${_waEscaparHtml(ch.descricao)}</div>
    </div>` : ""}

    ${_chRenderAvaliacaoCard(ch)}

    <div class="ch-det-section">
      <div class="ch-det-sec-title">Informações</div>
      <div class="ch-det-meta">
        <div class="ch-met-row" id="chCondoRow-${ch.id}">
          <span class="ch-met-lbl">Condomínio</span>
          ${ch.condominio_nome
            ? `<span style="display:flex;align-items:center;gap:6px;">
                 ${_waEscaparHtml(ch.condominio_nome)}
                 <button class="btn btn-sm viewer-only-hide" style="font-size:10px;padding:1px 6px;opacity:.6;"
                   data-action="vincular-ch-condo" data-ch-id="${ch.id}">trocar</button>
               </span>`
            : `<button class="btn btn-sm btnAccent viewer-only-hide" style="font-size:11px;"
                 data-action="vincular-ch-condo" data-ch-id="${ch.id}">🔗 Vincular condomínio</button>`}
        </div>
        ${ch.responsavel_nome  ? `<div class="ch-met-row"><span class="ch-met-lbl">Responsável</span><span>${_waEscaparHtml(ch.responsavel_nome)}</span></div>` : ""}
        <div class="ch-met-row" id="chTecnicoRow-${ch.id}">
          <span class="ch-met-lbl">Técnico</span>
          ${ch.tecnico_nome
            ? `<span style="display:flex;align-items:center;gap:6px;">
                 ${_waEscaparHtml(ch.tecnico_nome)}
                 <button class="btn btn-sm viewer-only-hide" style="font-size:10px;padding:1px 6px;opacity:.6;"
                   data-action="vincular-ch-tecnico" data-ch-id="${ch.id}">trocar</button>
               </span>`
            : `<button class="btn btn-sm viewer-only-hide" style="font-size:11px;"
                 data-action="vincular-ch-tecnico" data-ch-id="${ch.id}">Atribuir técnico</button>`}
        </div>
        ${ch.categoria         ? `<div class="ch-met-row"><span class="ch-met-lbl">Categoria</span><span class="ch-cat-badge">${_chCatNome[ch.categoria]||ch.categoria}</span></div>` : ""}
        <div class="ch-met-row"><span class="ch-met-lbl">Prioridade</span><span class="ch-prio ch-prio-${ch.prioridade||"p3"}">${_chPrioNome[ch.prioridade]||ch.prioridade}</span></div>
        ${ch.sla_ttfr_min != null && !ch.fechado_em ? `<div class="ch-met-row"><span class="ch-met-lbl">SLA</span><span style="display:flex;gap:5px;flex-wrap:wrap;">
          ${ch.sla_ttfr_estourado
            ? `<span class="ch-sla-badge" title="Sem resposta há mais de ${ch.sla_ttfr_min} min">⚠ TTFR estourado</span>`
            : ch.primeira_resposta_em
              ? `<span style="font-size:11px;color:var(--ok);">✓ Respondido</span>`
              : `<span style="font-size:11px;color:var(--muted);">Aguardando resposta (limite ${ch.sla_ttfr_min} min)</span>`}
          ${ch.sla_ttr_risco && !ch.sla_ttfr_estourado
            ? `<span class="ch-sla-ttr-badge" title="Aberto há mais de ${ch.sla_ttr_min} min">⏱ TTR estourado</span>`
            : ""}
        </span></div>` : ""}
        <div class="ch-met-row"><span class="ch-met-lbl">Aberto em</span><span>${fmtData(ch.criado_em)}</span></div>
        ${ch.tecnico_a_caminho_em ? `<div class="ch-met-row"><span class="ch-met-lbl">A caminho</span><span style="color:var(--warn);">🚗 ${fmtData(ch.tecnico_a_caminho_em)}</span></div>` : ""}
        ${ch.tecnico_chegou_em    ? `<div class="ch-met-row"><span class="ch-met-lbl">Chegou</span><span style="color:var(--ok);">📍 ${fmtData(ch.tecnico_chegou_em)}</span></div>` : ""}
        ${ch.fechado_em        ? `<div class="ch-met-row"><span class="ch-met-lbl">Fechado em</span><span>${fmtData(ch.fechado_em)}</span></div>` : ""}
        ${ch.cliente_nome      ? `<div class="ch-met-row"><span class="ch-met-lbl">Cliente WA</span><span>${_waEscaparHtml(ch.cliente_nome)}${ch.cliente_telefone ? " · "+_waEscaparHtml(ch.cliente_telefone) : ""}</span></div>` : ""}
      </div>
    </div>

    ${telHtml}

    ${_chRenderHistoricoCard(ch.id)}

    <div class="ch-det-acoes">${acoes}</div>
  </div>`;

  // Dispara o carregamento do histórico (lazy, cache por id).
  _chCarregarHistorico(ch.id);
}

function renderChamados() {
  renderChKpis();
  renderChTabela();
  if (_chSelecionadoId) {
    const ch = (_chamadosData || []).find(c => c.id === _chSelecionadoId);
    renderChDetalhe(ch || null);
    if (!ch) _chSelecionadoId = null;
  }
}

// ---- Modal: novo chamado ----
(function _bindNovoChamado() {
  const overlay  = document.getElementById("novoChamadoOverlay");
  const btnAbrir = document.getElementById("btnNovoChamado");
  const btnFech  = document.getElementById("btnFecharNovoChamado");
  const btnCanc  = document.getElementById("btnCancelarNovoChamado");
  const btnSalv  = document.getElementById("btnSalvarNovoChamado");
  const msg      = document.getElementById("ncMsg");
  if (!overlay || !btnAbrir) return;

  function _ncAbrir() {
    // Popula select de condomínios
    const sel = document.getElementById("ncCondo");
    if (sel && sel.options.length <= 1) {
      (_condominios || []).forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.nome;
        sel.appendChild(opt);
      });
    }
    // Limpa campos
    ["ncTitulo","ncDescricao"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.getElementById("ncCategoria").value = "outro";
    document.getElementById("ncPrioridade").value = "p3";
    document.getElementById("ncCondo").value = "";
    if (msg) msg.textContent = "";
    // Reset seletor de prioridade — marca P3 como padrão
    overlay.querySelectorAll(".nc-prio-btn").forEach(b => {
      b.classList.remove("nc-prio-sel");
      b.style.borderColor = "var(--border)";
      b.style.background  = "var(--surface2)";
    });
    const p3btn = overlay.querySelector(".nc-prio-btn[data-prio='p3']");
    if (p3btn) { p3btn.classList.add("nc-prio-sel"); p3btn.style.borderColor = "var(--accent)"; p3btn.style.background = "rgba(240,176,20,.08)"; }
    overlay.style.display = "flex";
  }

  function _ncFechar() { overlay.style.display = "none"; }

  async function _ncSalvar() {
    const titulo    = document.getElementById("ncTitulo")?.value.trim();
    const descricao = document.getElementById("ncDescricao")?.value.trim();
    if (!titulo)         { if (msg) { msg.style.color = "var(--danger)"; msg.textContent = "Título obrigatório"; } return; }
    if (!descricao || descricao.length < 5) { if (msg) { msg.style.color = "var(--danger)"; msg.textContent = "Descreva com pelo menos 5 caracteres"; } return; }

    if (msg) { msg.style.color = "var(--muted)"; msg.textContent = "Salvando…"; }
    btnSalv.disabled = true;

    try {
      const body = {
        titulo,
        descricao,
        categoria:    document.getElementById("ncCategoria")?.value || "outro",
        prioridade:   document.getElementById("ncPrioridade")?.value || "p3",
        condominio_id: document.getElementById("ncCondo")?.value || null,
      };
      const r = await fetch("/chamados", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) { if (msg) { msg.style.color = "var(--danger)"; msg.textContent = j.error || "Erro"; } return; }

      // Adiciona ao array local e re-renderiza
      const condo = (_condominios || []).find(c => String(c.id) === String(body.condominio_id));
      _chamadosData = [{ ...j, condominio_nome: condo?.nome || null }, ...(_chamadosData || [])];
      renderChamados();
      _ncFechar();
    } catch (e) {
      if (msg) { msg.style.color = "var(--danger)"; msg.textContent = "Erro: " + e.message; }
    } finally {
      btnSalv.disabled = false;
    }
  }

  btnAbrir.addEventListener("click", _ncAbrir);
  btnFech.addEventListener("click",  _ncFechar);
  btnCanc.addEventListener("click",  _ncFechar);
  btnSalv.addEventListener("click",  _ncSalvar);
  overlay.addEventListener("click",  e => { if (e.target === overlay) _ncFechar(); });

  // Seletor de prioridade P1–P4
  overlay.addEventListener("click", e => {
    const btn = e.target.closest(".nc-prio-btn");
    if (!btn) return;
    overlay.querySelectorAll(".nc-prio-btn").forEach(b => {
      b.classList.remove("nc-prio-sel");
      b.style.borderColor = "var(--border)";
      b.style.background  = "var(--surface2)";
    });
    btn.classList.add("nc-prio-sel");
    btn.style.borderColor = "var(--accent)";
    btn.style.background  = "rgba(240,176,20,.08)";
    document.getElementById("ncPrioridade").value = btn.dataset.prio;
  });
})();

// ─── Modal: novo/editar contrato ────────────────────────────────────────────
let _ctrEditando = null; // { condoId, contratoId? }

const _CtrStatusCfg = {
  rascunho:  { texto: "Rascunho",   cor: "var(--muted)",   bg: "rgba(255,255,255,.07)" },
  aguardando:{ texto: "Aguardando assinatura", cor: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  assinado:  { texto: "Assinado",   cor: "var(--ok)",      bg: "rgba(34,197,94,.12)" },
  recusado:  { texto: "Recusado",   cor: "var(--danger)",  bg: "rgba(239,68,68,.12)" },
  cancelado: { texto: "Cancelado",  cor: "var(--muted)",   bg: "rgba(255,255,255,.05)" },
};

function _ctrAtualizarBadge(status) {
  const badge = document.getElementById("ctrStatusBadge");
  if (!badge) return;
  const cfg = _CtrStatusCfg[status] || _CtrStatusCfg.rascunho;
  badge.textContent = cfg.texto;
  badge.style.cssText = `display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;color:${cfg.cor};background:${cfg.bg};`;
}

function _ctrAbrirModal({ condoId, contratoId }) {
  const overlay = document.getElementById("ctrOverlay");
  if (!overlay) return;
  _ctrEditando = { condoId, contratoId: contratoId || null };

  // Limpa form
  ["ctrNumero","ctrValor","ctrInicio","ctrFim","ctrDiaVenc","ctrObs",
   "ctrDescServico","ctrSignNome","ctrSignEmail","ctrSignGeralNome","ctrSignGeralEmail",
   "ctrUrlCliente","ctrUrlGeral","ctrQtdBombas"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("ctrServicoTipo").value = "bombas";
  document.getElementById("ctrQtdBombasWrap").style.display = "";
  document.getElementById("ctrTipo").value = "mensal";
  document.getElementById("ctrFormaPagto").value = "";
  document.getElementById("ctrRenovAuto").checked = false;
  document.getElementById("ctrId").value = "";
  document.getElementById("ctrCondoId").value = String(condoId);
  document.getElementById("ctrMsg").textContent = "";
  document.getElementById("ctrBtnSalvar").disabled = false;
  document.getElementById("ctrBtnEncerrar").style.display = contratoId ? "" : "none";
  document.getElementById("ctrBtnExcluir").style.display = contratoId ? "" : "none";
  document.getElementById("ctrBtnPdf").style.display = "none";
  document.getElementById("ctrBtnEnviarAssinatura").style.display = "none";
  document.getElementById("ctrBtnAtualizarStatus").style.display = "none";
  document.getElementById("ctrAssinaturaPainel").style.display = "none";
  document.getElementById("ctrStatusBadge").style.display = "none";
  document.getElementById("ctrUrlClienteRow").style.display = "none";
  document.getElementById("ctrUrlGeralRow").style.display = "none";
  document.getElementById("ctrDocUrlRow").style.display = "none";

  const condo = (_condominios || []).find(c => Number(c.id) === Number(condoId));
  document.getElementById("ctrSub").textContent = condo ? condo.nome : "";
  document.getElementById("ctrTitulo").textContent = contratoId ? "Editar contrato" : "Novo contrato";

  if (contratoId) {
    fetch(`/contratos/${contratoId}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(c => {
        document.getElementById("ctrId").value              = String(c.id);
        document.getElementById("ctrTipo").value            = c.tipo;
        document.getElementById("ctrValor").value           = c.valor_mensal != null ? Number(c.valor_mensal).toFixed(2) : "";
        document.getElementById("ctrInicio").value          = c.inicio_em ? String(c.inicio_em).slice(0,10) : "";
        document.getElementById("ctrFim").value             = c.fim_em ? String(c.fim_em).slice(0,10) : "";
        document.getElementById("ctrFormaPagto").value      = c.forma_pagamento || "";
        document.getElementById("ctrDiaVenc").value         = c.dia_vencimento || "";
        document.getElementById("ctrNumero").value          = c.numero || "";
        document.getElementById("ctrObs").value             = c.observacoes || "";
        document.getElementById("ctrDescServico").value     = c.descricao_servico || "";
        document.getElementById("ctrRenovAuto").checked     = !!c.renovacao_automatica;
        const st = c.servico_tipo || "bombas";
        document.getElementById("ctrServicoTipo").value = st;
        document.getElementById("ctrQtdBombas").value   = c.qtd_bombas || "";
        document.getElementById("ctrQtdBombasWrap").style.display = st === "bombas" ? "" : "none";
        document.getElementById("ctrSignNome").value        = c.signatario_nome || "";
        document.getElementById("ctrSignEmail").value       = c.signatario_email || "";
        document.getElementById("ctrSignGeralNome").value   = c.signatario_geral_nome || "";
        document.getElementById("ctrSignGeralEmail").value  = c.signatario_geral_email || "";

        // Botões de PDF/assinatura sempre visíveis em edição
        document.getElementById("ctrBtnPdf").style.display = "";
        document.getElementById("ctrBtnEnviarAssinatura").style.display = "";
        document.getElementById("ctrBtnAtualizarStatus").style.display = c.zapsign_token ? "" : "none";

        // Badge de status
        const status = c.zapsign_status || "rascunho";
        _ctrAtualizarBadge(status);

        // Painel de assinatura
        const temToken = !!c.zapsign_token;
        document.getElementById("ctrAssinaturaPainel").style.display = temToken ? "" : "none";
        if (temToken) {
          if (c.zapsign_url_cliente) {
            document.getElementById("ctrUrlClienteRow").style.display = "";
            document.getElementById("ctrUrlCliente").value = c.zapsign_url_cliente;
          }
          if (c.zapsign_url_geral) {
            document.getElementById("ctrUrlGeralRow").style.display = "";
            document.getElementById("ctrUrlGeral").value = c.zapsign_url_geral;
          }
          if (c.zapsign_doc_url) {
            document.getElementById("ctrDocUrlRow").style.display = "";
            document.getElementById("ctrDocUrlLink").href = c.zapsign_doc_url;
          }
        }
      })
      .catch(() => { document.getElementById("ctrMsg").textContent = "Erro ao carregar contrato"; });
  }

  overlay.style.display = "flex";
}

function _ctrFecharModal() {
  const overlay = document.getElementById("ctrOverlay");
  if (overlay) overlay.style.display = "none";
  _ctrEditando = null;
}

async function _ctrSalvar() {
  if (!_ctrEditando) return;
  const msg = document.getElementById("ctrMsg");
  const btn = document.getElementById("ctrBtnSalvar");

  const body = {
    condominio_id:           Number(document.getElementById("ctrCondoId").value),
    tipo:                    document.getElementById("ctrTipo").value,
    valor_mensal:            Number(document.getElementById("ctrValor").value),
    inicio_em:               document.getElementById("ctrInicio").value || null,
    fim_em:                  document.getElementById("ctrFim").value || null,
    forma_pagamento:         document.getElementById("ctrFormaPagto").value || null,
    dia_vencimento:          document.getElementById("ctrDiaVenc").value ? Number(document.getElementById("ctrDiaVenc").value) : null,
    numero:                  document.getElementById("ctrNumero").value.trim() || null,
    observacoes:             document.getElementById("ctrObs").value.trim() || null,
    descricao_servico:       document.getElementById("ctrDescServico").value.trim() || null,
    renovacao_automatica:    document.getElementById("ctrRenovAuto").checked,
    servico_tipo:            document.getElementById("ctrServicoTipo").value || "bombas",
    qtd_bombas:              document.getElementById("ctrQtdBombas").value ? Number(document.getElementById("ctrQtdBombas").value) : null,
    signatario_nome:         document.getElementById("ctrSignNome").value.trim() || null,
    signatario_email:        document.getElementById("ctrSignEmail").value.trim() || null,
    signatario_geral_nome:   document.getElementById("ctrSignGeralNome").value.trim() || null,
    signatario_geral_email:  document.getElementById("ctrSignGeralEmail").value.trim() || null,
  };

  if (!body.valor_mensal && body.valor_mensal !== 0) {
    msg.style.color = "var(--danger)"; msg.textContent = "Valor mensal obrigatório"; return;
  }
  if (!body.inicio_em) {
    msg.style.color = "var(--danger)"; msg.textContent = "Data de início obrigatória"; return;
  }

  msg.style.color = "var(--muted)"; msg.textContent = "Salvando…";
  btn.disabled = true;

  const editandoId = document.getElementById("ctrId").value;
  const url    = editandoId ? `/contratos/${editandoId}` : "/contratos";
  const method = editandoId ? "PATCH" : "POST";

  try {
    const r = await fetch(url, {
      method,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      msg.style.color = "var(--danger)"; msg.textContent = e.error || "Erro ao salvar";
      btn.disabled = false;
      return;
    }
    const saved = await r.json();
    msg.style.color = "var(--ok)"; msg.textContent = "Salvo!";
    btn.disabled = false;
    // Habilita botões de PDF/assinatura após criar
    document.getElementById("ctrId").value = String(saved.id);
    document.getElementById("ctrBtnPdf").style.display = "";
    document.getElementById("ctrBtnEnviarAssinatura").style.display = "";
    const condoId = _ctrEditando.condoId;
    _cliInvalidarContrato(condoId);
    if (_cliSelecionadoId === condoId) {
      const c = (_condominios || []).find(x => Number(x.id) === Number(condoId));
      if (c) renderCliDetalhe(c);
    }
    _carregarContratosMetricas?.();
    renderCliTabela?.();
    if (document.querySelector(".section[data-section='contratos'].is-active")) _ctrsCarregar();
    setTimeout(() => { msg.textContent = ""; }, 2500);
  } catch (e) {
    msg.style.color = "var(--danger)"; msg.textContent = "Erro de rede";
    btn.disabled = false;
  }
}

async function _ctrEncerrar() {
  const editandoId = document.getElementById("ctrId").value;
  if (!editandoId) return;
  if (!confirm("Inativar este contrato? Ele ficará inativo mas poderá ser reativado depois.")) return;
  const msg = document.getElementById("ctrMsg");
  msg.style.color = "var(--muted)"; msg.textContent = "Inativando…";
  try {
    const r = await fetch(`/contratos/${editandoId}`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ ativo: false }) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      msg.style.color = "var(--danger)"; msg.textContent = e.error || "Erro ao inativar";
      return;
    }
    const condoId = _ctrEditando?.condoId;
    if (condoId) {
      _cliInvalidarContrato(condoId);
      _ctrFecharModal();
      if (_cliSelecionadoId === condoId) {
        const c = (_condominios || []).find(x => Number(x.id) === Number(condoId));
        if (c) renderCliDetalhe(c);
      }
        _carregarContratosMetricas?.();
      renderCliTabela?.();
      if (document.querySelector(".section[data-section='contratos'].is-active")) _ctrsCarregar();
    }
  } catch (e) {
    msg.style.color = "var(--danger)"; msg.textContent = "Erro de rede";
  }
}

async function _ctrEnviarAssinatura() {
  const id = document.getElementById("ctrId").value;
  if (!id) return;
  const msg = document.getElementById("ctrMsg");
  const btn = document.getElementById("ctrBtnEnviarAssinatura");
  msg.style.color = "var(--muted)"; msg.textContent = "Enviando para assinatura…";
  btn.disabled = true;
  try {
    const r = await fetch(`/contratos/${id}/enviar-assinatura`, { method: "POST", headers: authHeaders() });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      msg.style.color = "var(--danger)"; msg.textContent = data.error || "Erro ao enviar";
      btn.disabled = false;
      return;
    }
    msg.style.color = "var(--ok)"; msg.textContent = "Enviado! E-mails de assinatura disparados.";
    btn.disabled = false;
    // Atualiza painel de URLs
    document.getElementById("ctrAssinaturaPainel").style.display = "";
    document.getElementById("ctrBtnAtualizarStatus").style.display = "";
    if (data.zapsign_url_cliente) {
      document.getElementById("ctrUrlClienteRow").style.display = "";
      document.getElementById("ctrUrlCliente").value = data.zapsign_url_cliente;
    }
    if (data.zapsign_url_geral) {
      document.getElementById("ctrUrlGeralRow").style.display = "";
      document.getElementById("ctrUrlGeral").value = data.zapsign_url_geral;
    }
    _ctrAtualizarBadge("aguardando");
    setTimeout(() => { msg.textContent = ""; }, 3000);
  } catch (e) {
    msg.style.color = "var(--danger)"; msg.textContent = "Erro de rede";
    btn.disabled = false;
  }
}

async function _ctrAtualizarStatus() {
  const id = document.getElementById("ctrId").value;
  if (!id) return;
  const msg = document.getElementById("ctrMsg");
  msg.style.color = "var(--muted)"; msg.textContent = "Consultando status…";
  try {
    const r = await fetch(`/contratos/${id}/status-assinatura`, { headers: authHeaders() });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { msg.style.color = "var(--danger)"; msg.textContent = data.error || "Erro"; return; }
    _ctrAtualizarBadge(data.zapsign_status);
    if (data.doc_url) {
      document.getElementById("ctrDocUrlRow").style.display = "";
      document.getElementById("ctrDocUrlLink").href = data.doc_url;
    }
    msg.style.color = "var(--ok)"; msg.textContent = "Status atualizado.";
    setTimeout(() => { msg.textContent = ""; }, 2500);
  } catch (e) {
    msg.style.color = "var(--danger)"; msg.textContent = "Erro de rede";
  }
}

(function _bindCtrModal() {
  const overlay = document.getElementById("ctrOverlay");
  if (!overlay) return;
  document.getElementById("ctrBtnFechar")?.addEventListener("click", _ctrFecharModal);
  document.getElementById("ctrBtnCancelar")?.addEventListener("click", _ctrFecharModal);
  overlay.addEventListener("click", e => {
    const btn = e.target.closest("[data-ctr-copy]");
    if (!btn) return;
    const val = document.getElementById(btn.dataset.ctrCopy)?.value || "";
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
      const orig = btn.textContent;
      btn.textContent = "Copiado!";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
  document.getElementById("ctrBtnSalvar")?.addEventListener("click", _ctrSalvar);
  document.getElementById("ctrBtnEncerrar")?.addEventListener("click", _ctrEncerrar);
  document.getElementById("ctrBtnExcluir")?.addEventListener("click", async () => {
    const id = Number(document.getElementById("ctrId").value);
    if (!id || !confirm("Excluir permanentemente este contrato? Esta ação não pode ser desfeita.")) return;
    const r = await fetch(`/contratos/${id}`, { method: "DELETE", headers: authHeaders() });
    const d = await r.json();
    if (!r.ok) { alert(d.error || "Erro ao excluir"); return; }
    _ctrFecharModal();
    _carregarContratosMetricas?.();
    renderCliTabela?.();
  });
  document.getElementById("ctrServicoTipo")?.addEventListener("change", function() {
    const showQtd = this.value === "bombas";
    document.getElementById("ctrQtdBombasWrap").style.display = showQtd ? "" : "none";
    if (!showQtd) document.getElementById("ctrQtdBombas").value = "";
  });
  document.getElementById("ctrBtnEnviarAssinatura")?.addEventListener("click", _ctrEnviarAssinatura);
  document.getElementById("ctrBtnAtualizarStatus")?.addEventListener("click", _ctrAtualizarStatus);
  document.getElementById("ctrBtnPdf")?.addEventListener("click", async () => {
    const id = document.getElementById("ctrId").value;
    if (!id) return;
    const btn = document.getElementById("ctrBtnPdf");
    const msg = document.getElementById("ctrMsg");
    btn.disabled = true;
    msg.style.color = "var(--muted)"; msg.textContent = "Gerando PDF…";
    try {
      const r = await fetch(`/contratos/${id}/pdf`, { headers: authHeaders() });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        msg.style.color = "var(--danger)"; msg.textContent = e.error || "Erro ao gerar PDF";
        btn.disabled = false; return;
      }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) { const a = document.createElement("a"); a.href = url; a.download = `contrato-${id}.pdf`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      msg.textContent = "";
    } catch (err) {
      msg.style.color = "var(--danger)"; msg.textContent = "Erro: " + err.message;
    }
    btn.disabled = false;
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) _ctrFecharModal(); });
})();

// ─── Visualizador de contrato (somente leitura — contratos assinados) ────────

async function _ctrAbrirVisualizacao(contratoId, condoId) {
  const overlay = document.getElementById("ctrViewerOverlay");
  if (!overlay) return;

  document.getElementById("ctrViewerTitulo").textContent = "Carregando…";
  document.getElementById("ctrViewerSub").textContent    = "";
  document.getElementById("ctrViewerBadge").style.display = "none";
  document.getElementById("ctrViewerGrid").innerHTML     = "";
  document.getElementById("ctrViewerDescWrap").style.display = "none";
  document.getElementById("ctrViewerSignWrap").style.display = "none";
  document.getElementById("ctrViewerDownload").style.display = "none";
  document.getElementById("ctrViewerMsg").textContent    = "";
  document.getElementById("ctrViewerBtnPdf").dataset.ctrId = "";
  overlay.style.display = "flex";

  try {
    const r = await fetch(`/contratos/${contratoId}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    const c = await r.json();

    document.getElementById("ctrViewerTitulo").textContent = c.numero ? `Contrato ${c.numero}` : "Contrato";
    document.getElementById("ctrViewerSub").textContent    = c.condominio_nome || "";
    document.getElementById("ctrViewerBtnPdf").dataset.ctrId = String(c.id);

    const badge = document.getElementById("ctrViewerBadge");
    const badgeCfg = _CtrStatusCfg[c.zapsign_status] || _CtrStatusCfg.rascunho;
    badge.textContent  = badgeCfg.texto;
    badge.style.cssText = `display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;color:${badgeCfg.cor};background:${badgeCfg.bg};`;

    const field = (label, value) => !value ? "" :
      `<div><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px;">${label}</div>` +
      `<div style="font-size:13px;color:var(--text);">${_waEscaparHtml(String(value))}</div></div>`;

    const servicoLabel = { bombas: "Bombas hidráulicas", piscina: "Piscina", dedetizacao: "Dedetização", desratizacao: "Desratização" };
    document.getElementById("ctrViewerGrid").innerHTML = [
      field("Serviço",             servicoLabel[c.servico_tipo] || c.servico_tipo),
      field("Qtd. bombas",         c.qtd_bombas ? String(c.qtd_bombas) : ""),
      field("Periodicidade",       _ctrTipoLabel[c.tipo] || c.tipo),
      field("Valor mensal",        c.valor_mensal != null ? _ctrFmtMoeda(c.valor_mensal) : ""),
      field("Início",              _ctrFmtData(c.inicio_em)),
      field("Vencimento",          c.fim_em ? _ctrFmtData(c.fim_em) : "Sem prazo definido"),
      field("Forma de pagamento",  _ctrFormaLabel[c.forma_pagamento] || c.forma_pagamento),
      field("Dia de vencimento",   c.dia_vencimento ? `Dia ${c.dia_vencimento}` : ""),
      field("Renovação automática",c.renovacao_automatica ? "Sim" : ""),
    ].filter(Boolean).join("");

    if (c.descricao_servico) {
      document.getElementById("ctrViewerDescWrap").style.display = "";
      document.getElementById("ctrViewerDesc").textContent = c.descricao_servico;
    }

    if (c.zapsign_token) {
      document.getElementById("ctrViewerSignWrap").style.display = "";
      let html = "";
      if (c.signatario_nome || c.signatario_email)
        html += `<div><span style="color:var(--muted);font-size:11px;">Cliente: </span>${_waEscaparHtml(c.signatario_nome || c.signatario_email)}</div>`;
      if (c.signatario_geral_nome || c.signatario_geral_email)
        html += `<div><span style="color:var(--muted);font-size:11px;">General Bombas: </span>${_waEscaparHtml(c.signatario_geral_nome || c.signatario_geral_email)}</div>`;
      if (c.assinado_em)
        html += `<div style="color:var(--ok);font-size:12px;margin-top:4px;">Assinado em ${_ctrFmtData(c.assinado_em)}</div>`;
      document.getElementById("ctrViewerSignInfo").innerHTML = html;

      if (c.zapsign_doc_url) {
        const dl = document.getElementById("ctrViewerDownload");
        dl.href = c.zapsign_doc_url;
        dl.style.display = "";
      }
    }
  } catch {
    document.getElementById("ctrViewerMsg").textContent = "Erro ao carregar contrato.";
  }
}

(function _bindCtrViewer() {
  const overlay = document.getElementById("ctrViewerOverlay");
  if (!overlay) return;
  const fechar = () => { overlay.style.display = "none"; };
  document.getElementById("ctrViewerBtnFechar")?.addEventListener("click", fechar);
  document.getElementById("ctrViewerBtnFechar2")?.addEventListener("click", fechar);
  overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });
  document.getElementById("ctrViewerBtnPdf")?.addEventListener("click", async () => {
    const id = document.getElementById("ctrViewerBtnPdf").dataset.ctrId;
    if (!id) return;
    const btn = document.getElementById("ctrViewerBtnPdf");
    const msg = document.getElementById("ctrViewerMsg");
    btn.disabled = true;
    msg.style.color = "var(--muted)"; msg.textContent = "Gerando PDF…";
    try {
      const r = await fetch(`/contratos/${id}/pdf`, { headers: authHeaders() });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        msg.style.color = "var(--danger)"; msg.textContent = e.error || "Erro ao gerar PDF";
        btn.disabled = false; return;
      }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) { const a = document.createElement("a"); a.href = url; a.download = `contrato-${id}.pdf`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      msg.textContent = "";
    } catch (err) {
      msg.style.color = "var(--danger)"; msg.textContent = "Erro: " + err.message;
    }
    btn.disabled = false;
  });
})();


// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO CONTRATOS — tabela dedicada com filtros
// ═══════════════════════════════════════════════════════════════════════════════

let _ctrsLista         = [];
let _ctrsTabAtual      = "todos";
let _ctrsTipoFiltro    = "";
let _ctrsBuscaStr      = "";
let _ctrsBindFeito     = false;

const _ctrsServicoLabel = { bombas: "Bombas", piscina: "Piscina", dedetizacao: "Dedetização", desratizacao: "Desratização" };

function _ctrsGetStatusKey(ct) {
  if (!ct.ativo) return "inativo";
  const dias = Number(ct.dias_para_vencer);
  if (ct.fim_em == null) return "ativo";
  if (Number.isFinite(dias)) {
    if (dias < 0)  return "vencido";
    if (dias <= 30) return "vencendo";
  }
  return "ativo";
}

async function _ctrsCarregar() {
  const tbody = document.getElementById("ctrsTbody");
  const empty = document.getElementById("ctrsEmpty");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px;">Carregando…</td></tr>`;
  if (empty) empty.style.display = "none";

  try {
    const r = await fetch("/contratos", { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    _ctrsLista = await r.json();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:20px;">Erro ao carregar contratos.</td></tr>`;
    return;
  }
  _ctrsRender();
  _ctrsRenderKpi();
}

function _ctrsRender() {
  const q = _ctrsBuscaStr.toLowerCase();

  const lista = _ctrsLista.filter(ct => {
    const sk = _ctrsGetStatusKey(ct);
    if (_ctrsTabAtual !== "todos" && sk !== _ctrsTabAtual) return false;
    if (_ctrsTipoFiltro && ct.servico_tipo !== _ctrsTipoFiltro) return false;
    if (q && !(ct.condominio_nome || "").toLowerCase().includes(q)) return false;
    return true;
  });

  const count = key => _ctrsLista.filter(ct => _ctrsGetStatusKey(ct) === key).length;
  document.getElementById("ctrsCtTodos").textContent    = _ctrsLista.length;
  document.getElementById("ctrsCtAtivo").textContent    = count("ativo");
  document.getElementById("ctrsCtVencendo").textContent = count("vencendo");
  document.getElementById("ctrsCtVencido").textContent  = count("vencido");

  const navBadge = document.getElementById("navBadgeContratos");
  const vencendo = count("vencendo") + count("vencido");
  if (navBadge) {
    navBadge.textContent = vencendo;
    navBadge.style.display = vencendo > 0 ? "" : "none";
  }

  const tbody = document.getElementById("ctrsTbody");
  const empty = document.getElementById("ctrsEmpty");
  if (!lista.length) {
    if (tbody) tbody.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  const _clsPill = { ok: "orc-status-ok", warn: "orc-status-pend", bad: "orc-status-bad" };
  const _SVG_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;display:block;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const _SVG_EYE  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;display:block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  tbody.innerHTML = lista.map(ct => {
    const st = _ctrStatusVisual(ct);
    const assinado = ct.zapsign_status === "assinado";
    const actionBtn = assinado
      ? `<button class="btn btn-sm" title="Visualizar contrato" data-ctrs-view="${ct.id}" data-ctrs-view-condo="${ct.condominio_id}" style="padding:4px 6px;">${_SVG_EYE}</button>`
      : `<button class="btn btn-sm" title="Editar contrato" data-ctrs-edit="${ct.id}" data-ctrs-edit-condo="${ct.condominio_id}" style="padding:4px 6px;">${_SVG_EDIT}</button>`;
    return `<tr class="orc-row" data-ctrs-row="${ct.id}" data-ctrs-condo="${ct.condominio_id}" data-ctrs-status="${ct.zapsign_status || ''}" style="cursor:pointer;">
      <td>${_waEscaparHtml(ct.condominio_nome || "—")}</td>
      <td>${_ctrsServicoLabel[ct.servico_tipo] || ct.servico_tipo || "—"}</td>
      <td>${_ctrTipoLabel[ct.tipo] || ct.tipo || "—"}</td>
      <td>${_ctrFmtMoeda(ct.valor_mensal)}</td>
      <td>${_ctrFmtData(ct.inicio_em)}</td>
      <td>${_ctrFmtData(ct.fim_em)}</td>
      <td><span class="orc-status-pill ${_clsPill[st.cls] || "orc-status-pend"}">${st.texto}</span></td>
      <td style="text-align:center;">${actionBtn}</td>
    </tr>`;
  }).join("");
}

function _ctrsRenderKpi() {
  const grid = document.getElementById("ctrsKpiGrid");
  if (!grid) return;
  const ativos   = _ctrsLista.filter(ct => _ctrsGetStatusKey(ct) === "ativo");
  const vencendo = _ctrsLista.filter(ct => _ctrsGetStatusKey(ct) === "vencendo");
  const vencidos = _ctrsLista.filter(ct => _ctrsGetStatusKey(ct) === "vencido");
  const mrr      = _ctrsLista.filter(ct => ct.ativo).reduce((s, ct) => s + (Number(ct.valor_mensal) || 0), 0);

  const kpi = (icon, val, label, cls) => `
    <div class="rc ${cls} rc-static">
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${label}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  grid.innerHTML =
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        ativos.length, "Ativos", "rc-ok") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        vencendo.length, "Vencendo em 30d", vencendo.length > 0 ? "rc-warn" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        vencidos.length, "Vencidos", vencidos.length > 0 ? "rc-bad" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
        mrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "MRR (contratos ativos)", "rc-neutral");
}

function _ctrsAbrirPicker() {
  const modal = document.getElementById("ctrsPickerModal");
  if (!modal) return;
  modal.style.display = "";
  const busca = document.getElementById("ctrsPickerBusca");
  if (busca) { busca.value = ""; busca.focus(); }
  _ctrsRenderPickerList("");
}

function _ctrsFecharPicker() {
  const modal = document.getElementById("ctrsPickerModal");
  if (modal) modal.style.display = "none";
}

function _ctrsRenderPickerList(q) {
  const list = document.getElementById("ctrsPickerList");
  if (!list) return;
  const condos = Array.isArray(_condominios) ? _condominios : [];
  const items = q
    ? condos.filter(c => (c.nome || "").toLowerCase().includes(q.toLowerCase()))
    : condos;
  if (!items.length) {
    list.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;text-align:center;">Nenhum cliente encontrado.</div>`;
    return;
  }
  list.innerHTML = items.map(c => `
    <button type="button" data-ctrs-pick="${c.id}"
      style="display:block;width:100%;text-align:left;padding:9px 10px;border:none;background:transparent;color:var(--text);font-size:13px;border-radius:6px;cursor:pointer;"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
      ${_waEscaparHtml(c.nome)}
    </button>`).join("");
}

function _ctrsBindEventos() {
  if (_ctrsBindFeito) return;
  _ctrsBindFeito = true;

  const section = document.querySelector(".section[data-section='contratos']");
  if (!section) return;

  section.addEventListener("click", e => {
    const tab = e.target.closest("[data-ctrs-tab]");
    if (tab) {
      _ctrsTabAtual = tab.dataset.ctrsTab;
      section.querySelectorAll("[data-ctrs-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      _ctrsRender();
      return;
    }
    const viewBtn = e.target.closest("[data-ctrs-view]");
    if (viewBtn) {
      _ctrAbrirVisualizacao(Number(viewBtn.dataset.ctrsView), Number(viewBtn.dataset.ctrsViewCondo));
      return;
    }
    const editBtn = e.target.closest("[data-ctrs-edit]");
    if (editBtn) {
      _ctrAbrirModal({ condoId: Number(editBtn.dataset.ctrsEditCondo), contratoId: Number(editBtn.dataset.ctrsEdit) });
      return;
    }
    const row = e.target.closest("[data-ctrs-row]");
    if (row) {
      if (row.dataset.ctrsStatus === "assinado") {
        _ctrAbrirVisualizacao(Number(row.dataset.ctrsRow), Number(row.dataset.ctrsCondo));
      } else {
        _ctrAbrirModal({ condoId: Number(row.dataset.ctrsCondo), contratoId: Number(row.dataset.ctrsRow) });
      }
      return;
    }
  });

  document.getElementById("ctrsTipoFilter")?.addEventListener("change", e => {
    _ctrsTipoFiltro = e.target.value;
    _ctrsRender();
  });
  document.getElementById("ctrsBusca")?.addEventListener("input", e => {
    _ctrsBuscaStr = e.target.value;
    _ctrsRender();
  });
  document.getElementById("ctrsBtnNovo")?.addEventListener("click", _ctrsAbrirPicker);
  document.getElementById("ctrsPickerClose")?.addEventListener("click", _ctrsFecharPicker);
  document.getElementById("ctrsPickerBackdrop")?.addEventListener("click", _ctrsFecharPicker);
  document.getElementById("ctrsPickerBusca")?.addEventListener("input", e => _ctrsRenderPickerList(e.target.value));
  document.getElementById("ctrsPickerList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-ctrs-pick]");
    if (!btn) return;
    _ctrsFecharPicker();
    _ctrAbrirModal({ condoId: Number(btn.dataset.ctrsPick) });
  });
}


// ─── Tabs do modal Editar Condomínio (Dados / Contrato / Contatos) ──────────
// Estado: condomínio atualmente editado (definido por abrirModalEditar)
let _editCondoIdAtivo = null;

function _editAtivarTab(tab, condoId) {
  const overlay = document.getElementById("editOverlay");
  if (!overlay) return;
  overlay.querySelectorAll(".edit-tab").forEach(b => b.classList.toggle("is-active", b.dataset.editTab === tab));
  overlay.querySelectorAll(".edit-tab-pane").forEach(p => {
    if (p.dataset.editPane === tab) p.removeAttribute("hidden");
    else p.setAttribute("hidden", "");
  });
}


// Bind do clique nas tabs do modal Editar
(function _bindEditTabs() {
  const overlay = document.getElementById("editOverlay");
  if (!overlay) return;
  overlay.querySelectorAll(".edit-tab").forEach(b => {
    b.addEventListener("click", () => {
      const tab = b.dataset.editTab;
      if (!tab) return;
      _editAtivarTab(tab, _editCondoIdAtivo);
    });
  });
})();

// ============================================================
// SECTION: WHATSAPP — central de atendimento (lista + chat + info)
// ============================================================

let _waFiltros = { tab: "todos", busca: "" };
let _waSelecionadaId = null;
let _waConversaCache = new Map(); // id → conversa com mensagens

function _waClassificar(cv) {
  if (cv.status === "fechada") return "resolv";
  if (cv.status === "em_atendimento" || cv.assumida_por_id) return "atend";
  if (!cv.ultima_mensagem) return "naoresp";
  return cv.ultima_direcao === "saida" ? "atend" : "naoresp";
}

function _waConversasFiltradas() {
  const lista = Array.isArray(_conversasData) ? _conversasData : [];
  return lista.filter(cv => {
    const st = _waClassificar(cv);
    if (_waFiltros.tab === "nao-respondidas" && st !== "naoresp") return false;
    if (_waFiltros.tab === "em-atendimento"  && st !== "atend")   return false;
    if (_waFiltros.tab === "resolvidas"      && st !== "resolv")  return false;
    if (_waFiltros.busca) {
      const q = _waFiltros.busca.toLowerCase();
      const blob = `${cv.cliente_nome || ""} ${cv.telefone || ""} ${cv.condominio_nome || ""} ${cv.ultima_mensagem || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function _waIniciaisDe(s) {
  const txt = String(s || "?").trim();
  const partes = txt.split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function _waEscaparHtml(s) {
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function _waFmtTempo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const agora = Date.now();
  const diffMs = agora - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 24) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 24 * 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR");
}

function _waUrgenciaLabel(u) {
  return ({ p1: "CRÍTICO", p2: "ALTA", p3: "CONTROLADO", p4: "AGENDADO" })[u] || String(u || "").toUpperCase();
}
function _waUrgenciaCor(u) {
  return ({ p1: "var(--danger)", p2: "var(--warn)", p3: "#facc15", p4: "var(--muted)" })[u] || "var(--muted)";
}
function _waUrgenciaBg(u) {
  return ({
    p1: "rgba(239,68,68,.15)",
    p2: "rgba(245,158,11,.15)",
    p3: "rgba(250,204,21,.12)",
    p4: "rgba(255,255,255,.06)",
  })[u] || "rgba(255,255,255,.06)";
}

function _waFmtHoraCompleta(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function _waFmtDataLonga(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function _waContadores() {
  const todos = Array.isArray(_conversasData) ? _conversasData : [];
  let naoresp = 0, atend = 0, resolv = 0;
  for (const cv of todos) {
    const st = _waClassificar(cv);
    if (st === "naoresp") naoresp++;
    else if (st === "atend") atend++;
    else if (st === "resolv") resolv++;
  }
  return { todos: todos.length, naoresp, atend, resolv };
}

function _waRenderLista() {
  const wrap = document.getElementById("waList");
  if (!wrap) return;

  // Contadores das tabs
  const c = _waContadores();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("waCountTodos", c.todos);
  set("waCountNaoResp", c.naoresp);
  set("waCountAtend", c.atend);
  set("waCountResolv", c.resolv);

  const filtrados = _waConversasFiltradas();
  const foot = document.getElementById("waListFoot");
  if (foot) foot.textContent = `${filtrados.length} conversa${filtrados.length === 1 ? "" : "s"}`;

  if (!filtrados.length) {
    wrap.innerHTML = `<div class="mc-empty" style="padding:30px 16px;">Nenhuma conversa nesse filtro.</div>`;
    return;
  }

  wrap.innerHTML = filtrados.map(cv => {
    const st = _waClassificar(cv);
    const nome = cv.cliente_nome || cv.telefone || "Sem nome";
    const condo = cv.condominio_nome || "—";
    const preview = cv.ultima_mensagem ? _waEscaparHtml(cv.ultima_mensagem) : "(sem mensagens)";
    const tempo = _waFmtTempo(cv.ultima_mensagem_em || cv.criado_em);
    const selected = _waSelecionadaId === cv.id ? " is-selected" : "";
    return `
      <div class="wa-conv-row status-${st}${selected}" data-wa-conv="${cv.id}">
        <div class="wa-conv-avatar">${_waIniciaisDe(cv.cliente_nome || cv.telefone)}</div>
        <div class="wa-conv-main">
          <div class="wa-conv-name">${_waEscaparHtml(nome)}</div>
          <div class="wa-conv-condo">${_waEscaparHtml(condo)}</div>
          <div class="wa-conv-preview">${preview}</div>
        </div>
        <div class="wa-conv-side">
          <span class="wa-conv-time">${tempo}</span>
          ${cv.unread_count > 0 ? `<span class="wa-conv-unread">${cv.unread_count}</span>` : ""}
          ${cv.assumida_por_id ? `<span class="wa-conv-assumida" title="Assumida por humano">👤</span>` : ""}
        </div>
      </div>`;
  }).join("");
}

async function _waSelecionar(id) {
  _waSelecionadaId = Number(id);
  _waRenderLista();
  // Mostra estado de carregamento no chat
  const chatBody = document.getElementById("waChatBody");
  const chatHead = document.getElementById("waChatHead");
  if (chatBody) chatBody.innerHTML = `<div class="wa-chat-empty"><p>Carregando conversa…</p></div>`;
  if (chatHead) chatHead.innerHTML = `<div class="wa-chat-empty-head">Carregando…</div>`;
  // Esconde info
  const info = document.getElementById("waInfoCol");
  if (info) info.innerHTML = `<div class="wa-info-empty">Carregando…</div>`;

  try {
    const r = await fetch(`/whatsapp/conversas/${_waSelecionadaId}`, { headers: authHeaders() });
    if (!r.ok) throw new Error("conversa " + r.status);
    const conv = await r.json();
    _waConversaCache.set(_waSelecionadaId, conv);
    _waRenderChat(conv);
    _waRenderInfo(conv);
    // Zera unread_count local imediatamente (o backend já marcou como lido)
    const cvLocal = (_conversasData || []).find(c => c.id === _waSelecionadaId);
    if (cvLocal) cvLocal.unread_count = 0;
    _waRenderLista();
    atualizarBadgesWhatsapp();
    const inp = document.getElementById("waChatInput");
    if (inp) inp.style.display = "flex";
  } catch (e) {
    if (chatBody) chatBody.innerHTML = `<div class="wa-chat-empty"><p style="color:var(--danger);">Erro ao carregar conversa: ${_waEscaparHtml(e.message)}</p></div>`;
  }
}

function _waRenderConteudo(m) {
  const tipo = String(m.tipo || "text").toLowerCase();
  const caption = m.conteudo ? `<div class="wa-media-caption">${_waEscaparHtml(m.conteudo)}</div>` : "";

  if (tipo === "text" || tipo === "conversation" || tipo === "extendedtextmessage" || !tipo) {
    return _waEscaparHtml(m.conteudo || "");
  }
  if (tipo === "audiomessage" || tipo === "audio" || tipo === "ptpmessage") {
    return `<div class="wa-media-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      <span>Mensagem de áudio</span>
    </div>${caption}`;
  }
  if (tipo === "imagemessage" || tipo === "image") {
    return `<div class="wa-media-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <span>Imagem</span>
    </div>${caption}`;
  }
  if (tipo === "videomessage" || tipo === "video") {
    return `<div class="wa-media-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
      <span>Vídeo</span>
    </div>${caption}`;
  }
  if (tipo === "documentmessage" || tipo === "document") {
    return `<div class="wa-media-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${m.conteudo ? _waEscaparHtml(m.conteudo) : "Documento"}</span>
    </div>`;
  }
  if (tipo === "stickermessage" || tipo === "sticker") {
    return `<div class="wa-media-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      <span>Figurinha</span>
    </div>`;
  }
  // fallback para tipos desconhecidos
  return `<div class="wa-media-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>[${_waEscaparHtml(m.tipo)}]</span>
  </div>${caption}`;
}

function _waRenderChat(conv) {
  const head = document.getElementById("waChatHead");
  if (head) {
    const fechada = conv.status === "fechada";
    const assumida = !!conv.assumida_por_id;

    const btnAssumir = fechada ? "" : assumida
      ? `<button class="btn btn-sm" type="button" data-wa-action="devolver-ia" data-conv-id="${conv.id}" title="Devolver pra IA responder">↩ Devolver à IA</button>`
      : `<button class="btn btn-sm btnAccent" type="button" data-wa-action="assumir" data-conv-id="${conv.id}" title="IA para de responder; você assume">✋ Assumir conversa</button>`;

    const btnFechar = fechada
      ? `<button class="btn btn-sm" type="button" data-wa-action="reabrir-conversa" data-conv-id="${conv.id}" title="Reabrir conversa">↺ Reabrir</button>`
      : `<button class="btn btn-sm" type="button" data-wa-action="fechar-conversa" data-conv-id="${conv.id}" title="Encerrar atendimento" style="color:var(--ok);">✓ Fechar</button>`;

    const subStatus = fechada
      ? ` • <span style="color:var(--muted);">Encerrada${conv.fechado_em ? " em " + _waFmtDataLonga(conv.fechado_em) : ""}</span>`
      : assumida ? ` • <span style="color:var(--accent);">Assumida por ${_waEscaparHtml(conv.assumida_por_nome || "você")}</span>` : "";

    head.innerHTML = `
      <div class="wa-conv-avatar">${_waIniciaisDe(conv.cliente_nome || conv.telefone)}</div>
      <div class="wa-chat-head-main">
        <div class="wa-chat-head-name">${_waEscaparHtml(conv.cliente_nome || "Sem nome")}</div>
        <div class="wa-chat-head-sub">${_waEscaparHtml(conv.telefone || "")}${conv.condominio_nome ? ` • ${_waEscaparHtml(conv.condominio_nome)}` : ""}${subStatus}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${btnAssumir}
        ${btnFechar}
        <button class="btn btn-sm" type="button"
          data-wa-action="apagar-conversa" data-conv-id="${conv.id}"
          style="color:var(--danger);border-color:rgba(239,68,68,.25);"
          title="Apagar conversa permanentemente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    `;
  }

  const body = document.getElementById("waChatBody");
  if (!body) return;

  const msgs = Array.isArray(conv.mensagens) ? conv.mensagens : [];
  if (!msgs.length) {
    body.innerHTML = `<div class="wa-chat-empty"><p>Sem mensagens nessa conversa ainda.</p></div>`;
    return;
  }

  let html = "";
  let dataAtual = "";
  for (const m of msgs) {
    const dia = new Date(m.criado_em).toLocaleDateString("pt-BR");
    if (dia !== dataAtual) {
      html += `<div class="wa-msg-date-sep">${_waFmtDataLonga(m.criado_em)}</div>`;
      dataAtual = dia;
    }

    // Card especial pro resumo da IA, se houver
    if (m.ia_resumo) {
      html += `
        <div class="wa-msg-ia-card">
          <div class="wa-msg-ia-card-title">
            <span class="wa-msg-ia-badge">IA</span>
            <span>Resumo / análise</span>
          </div>
          <div style="font-size:11.5px;color:var(--text);line-height:1.5;">${_waEscaparHtml(m.ia_resumo)}</div>
          ${m.ia_categoria || m.ia_urgencia ? `
            <div style="margin-top:6px;display:flex;gap:6px;font-size:10px;">
              ${m.ia_categoria ? `<span style="background:rgba(255,255,255,.06);padding:2px 7px;border-radius:4px;color:var(--muted);">${_waEscaparHtml(m.ia_categoria)}</span>` : ""}
              ${m.ia_urgencia ? `<span style="background:${_waUrgenciaBg(m.ia_urgencia)};padding:2px 7px;border-radius:4px;color:${_waUrgenciaCor(m.ia_urgencia)};font-weight:600;">${_waUrgenciaLabel(m.ia_urgencia)}</span>` : ""}
            </div>` : ""}
        </div>`;
    }

    // Bubble da mensagem
    const dir = m.direcao === "saida" ? "out" : "in";
    const conteudo = _waRenderConteudo(m);
    html += `
      <div class="wa-msg ${dir}">
        ${conteudo}
        <span class="wa-msg-time">${_waFmtHoraCompleta(m.criado_em)}</span>
      </div>`;
  }
  if (conv.status === "fechada") {
    html += `<div class="wa-chat-closed-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
      Conversa encerrada${conv.fechado_em ? " em " + _waFmtDataLonga(conv.fechado_em) : ""}
    </div>`;
  }

  body.innerHTML = html;
  // Oculta o input quando a conversa está fechada
  const inp = document.getElementById("waChatInput");
  if (inp) inp.style.display = conv.status === "fechada" ? "none" : "flex";
  // Scroll pro final
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
}

function _waRenderInfo(conv) {
  const wrap = document.getElementById("waInfoCol");
  if (!wrap) return;

  // Tenta encontrar condomínio com dados completos
  let condo = null;
  if (conv.condominio_id && Array.isArray(_condominios)) {
    condo = _condominios.find(c => c.id === conv.condominio_id);
  }

  // Histórico de chamados do condomínio (reaproveita _chamadosData)
  const historico = (Array.isArray(_chamadosData) ? _chamadosData : [])
    .filter(ch => ch.condominio_id === conv.condominio_id)
    .slice(0, 5);

  const histHtml = historico.length
    ? historico.map(ch => {
        const status = String(ch.status || "").toLowerCase();
        const kind = status === "fechado" ? "ok" : (ch.prioridade === "p1" ? "bad" : "warn");
        return `
          <div class="wa-hist-item">
            <div class="wa-hist-icon ${kind}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
            </div>
            <div class="wa-hist-main">
              <div class="wa-hist-title">${_waEscaparHtml(ch.titulo || ("Chamado #" + ch.id))}</div>
              <div class="wa-hist-time">${_waFmtDataLonga(ch.criado_em)} • ${_waEscaparHtml(status.replaceAll("_", " "))}</div>
            </div>
          </div>`;
      }).join("")
    : `<div style="color:var(--muted);font-size:11.5px;font-style:italic;">Sem chamados anteriores nesse condomínio.</div>`;

  wrap.innerHTML = `
    <div class="wa-info-section">
      <div class="wa-info-title">Contato</div>
      <div class="wa-info-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 15v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/><path d="M22 11a10 10 0 1 0-20 0"/></svg>
        <span>${_waEscaparHtml(conv.cliente_nome || "Sem nome")}</span>
      </div>
      <div class="wa-info-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>${conv.canal === "app" ? "via App" : _waEscaparHtml(conv.telefone || "—")}</span>
      </div>
    </div>

    ${condo || conv.condominio_nome ? `
    <div class="wa-info-section">
      <div class="wa-info-title">Condomínio</div>
      <div class="wa-info-row" style="font-weight:600;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1"/></svg>
        <span>${_waEscaparHtml(conv.condominio_nome || "—")}</span>
      </div>
      ${condo?.endereco ? `
      <div class="wa-info-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span style="font-size:11.5px;color:var(--muted);">${_waEscaparHtml([condo.endereco, condo.bairro, condo.cidade].filter(Boolean).join(", "))}</span>
      </div>` : ""}
    </div>` : ""}

    <div class="wa-info-section">
      <div class="wa-info-title">Ações rápidas</div>
      <div class="wa-info-acoes">
        ${conv.condominio_id ? `
          <button class="btn btn-sm" type="button" data-wa-action="ver-condo" data-condo-id="${conv.condominio_id}">📊 Ver telemetria do condomínio</button>
          <button class="btn btn-sm" type="button" data-wa-action="abrir-chamado" data-condo-id="${conv.condominio_id}">📋 Abrir chamado</button>
        ` : `
          <div style="color:var(--muted);font-size:11px;margin-bottom:6px;font-style:italic;">Cliente sem condomínio vinculado.</div>
          <button class="btn btn-sm btnAccent" type="button" data-wa-action="vincular-condo" data-conv-id="${conv.id}">🔗 Vincular a um condomínio</button>
          <button class="btn btn-sm" type="button" data-wa-action="abrir-chamado-sem-condo">📋 Abrir chamado sem condomínio</button>
        `}
      </div>
    </div>

    <div class="wa-info-section" id="waIaSection">
      <div class="wa-info-title">IA Assistiva</div>
      <div class="wa-info-acoes">
        <button class="btn btn-sm" type="button" data-wa-action="resumir" data-conv-id="${conv.id}">✨ Resumir conversa</button>
        <button class="btn btn-sm" type="button" data-wa-action="sugerir-resposta" data-conv-id="${conv.id}">💡 Sugerir resposta</button>
      </div>
      <div id="waIaResult"></div>
    </div>

    <div class="wa-info-section">
      <div class="wa-info-title">Histórico de chamados</div>
      ${histHtml}
    </div>
  `;
}

const _WA_QUALIDADES = [
  { v: "excelente", label: "Excelente", cls: "wa-qa-ok"   },
  { v: "boa",       label: "Boa",       cls: "wa-qa-ok"   },
  { v: "aceitavel", label: "Aceitável", cls: "wa-qa-warn" },
  { v: "ruim",      label: "Ruim",      cls: "wa-qa-bad"  },
];

function _waRenderQualidadeSection(conv) {
  const atual = conv.qualidade_atendimento || null;
  const avaliadoEm = conv.qualidade_avaliada_em ? _waFmtDataLonga(conv.qualidade_avaliada_em) : null;
  const isCurada = atual === "excelente" || atual === "boa";

  const botoes = _WA_QUALIDADES.map(q => {
    const ativo = atual === q.v;
    return `<button class="wa-qa-btn ${q.cls} ${ativo ? "is-active" : ""}" type="button"
      data-wa-action="avaliar-qualidade" data-conv-id="${conv.id}" data-q="${q.v}">${q.label}</button>`;
  }).join("");

  const status = atual
    ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;">
         Avaliado${avaliadoEm ? ` em ${avaliadoEm}` : ""}
         ${isCurada ? `· <span style="color:var(--ok);font-weight:600;">entrará no dataset</span>` : ""}
         · <a href="#" data-wa-action="avaliar-qualidade" data-conv-id="${conv.id}" data-q="" style="color:var(--accent);">limpar</a>
       </div>`
    : `<div style="font-size:11px;color:var(--muted);margin-top:6px;">
         Marque a qualidade pra alimentar o dataset de treinamento da IA. Excelente e Boa entram no export.
       </div>`;

  return `<div class="wa-info-section" id="waQualidadeSec-${conv.id}">
    <div class="wa-info-title">Qualidade do atendimento</div>
    <div class="wa-qa-grid">${botoes}</div>
    ${status}
  </div>`;
}

async function _waAvaliarQualidade(convId, qualidade) {
  const conv = _waConversaCache.get(Number(convId));
  if (!conv) return;
  // Otimista: atualiza local antes da resposta
  const valor = qualidade || null;
  const antes = { q: conv.qualidade_atendimento, em: conv.qualidade_avaliada_em };
  conv.qualidade_atendimento = valor;
  conv.qualidade_avaliada_em = valor ? new Date().toISOString() : null;
  _waRenderInfo(conv);
  try {
    const r = await fetch(`/whatsapp/conversas/${convId}/qualidade`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ qualidade: valor }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    const data = await r.json();
    conv.qualidade_atendimento  = data.qualidade_atendimento;
    conv.qualidade_avaliada_em  = data.qualidade_avaliada_em;
    conv.qualidade_avaliada_por = data.qualidade_avaliada_por;
    _waRenderInfo(conv);
  } catch (e) {
    // Rollback
    conv.qualidade_atendimento = antes.q;
    conv.qualidade_avaliada_em = antes.em;
    _waRenderInfo(conv);
    alert("Erro ao salvar avaliação: " + e.message);
  }
}

const _waIaCache = new Map(); // "convId-acao" → resultado

async function _waIaAcao(convId, acao) {
  const resultDiv = document.getElementById("waIaResult");
  if (!resultDiv) return;

  const cacheKey = `${convId}-${acao}`;
  if (_waIaCache.has(cacheKey)) {
    _waIaRenderResultado(acao, _waIaCache.get(cacheKey));
    return;
  }

  resultDiv.innerHTML = `<div style="color:var(--muted);font-size:11.5px;margin-top:8px;">Consultando IA…</div>`;

  try {
    const r = await fetch(`/whatsapp/conversas/${convId}/${acao}`, {
      method: "POST", headers: authHeaders(),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    const data = await r.json();
    const texto = acao === "resumir" ? data.resumo : data.sugestao;
    _waIaCache.set(cacheKey, { acao, texto });
    _waIaRenderResultado(acao, { acao, texto });
  } catch (e) {
    if (resultDiv) resultDiv.innerHTML = `<div style="color:var(--danger);font-size:11.5px;margin-top:8px;">Erro: ${_waEscaparHtml(e.message)}</div>`;
  }
}

function _waIaRenderResultado(acao, { texto }) {
  const resultDiv = document.getElementById("waIaResult");
  if (!resultDiv) return;

  const titulo = acao === "resumir" ? "Resumo da conversa" : "Sugestão de resposta";
  const convId = _waSelecionadaId;

  resultDiv.innerHTML = `
    <div class="wa-ia-result">
      <div class="wa-ia-result-title">${titulo}</div>
      <div class="wa-ia-result-text">${_waEscaparHtml(texto)}</div>
      ${acao === "sugerir-resposta" ? `
        <button class="btn btn-sm btnAccent" type="button" style="margin-top:8px;width:100%;"
          data-wa-action="usar-sugestao" data-texto="${_waEscaparHtml(texto)}">
          Usar essa resposta
        </button>` : ""}
      <button class="btn btn-sm" type="button" style="margin-top:4px;width:100%;font-size:10px;opacity:.6;"
        data-wa-action="${acao === "resumir" ? "resumir" : "sugerir-resposta"}" data-conv-id="${convId}"
        onclick="this.closest('#waIaResult').innerHTML=''; _waIaCache && _waIaCache.delete('${convId}-${acao === "resumir" ? "resumir" : "sugerir-resposta"}');">
        Refazer
      </button>
    </div>`;
}

async function _waAssumir(convId) {
  try {
    const r = await fetch(`/whatsapp/conversas/${convId}/assumir`, {
      method: "PATCH", headers: authHeaders(),
    });
    if (!r.ok) throw new Error(await r.text());
    // Limpa cache pra refresh, recarrega
    _waConversaCache.delete(convId);
    await carregarConversas?.();
    if (_waSelecionadaId === convId) await _waSelecionar(convId);
    _waRenderLista();
  } catch (e) {
    alert("Erro ao assumir conversa: " + e.message);
  }
}

async function _waEnviarMensagem() {
  const input = document.getElementById("waMsgInput");
  const btn   = document.getElementById("waBtnEnviar");
  if (!input || !_waSelecionadaId) return;

  const texto = input.value.trim();
  if (!texto) return;

  input.disabled = true;
  btn.disabled   = true;
  btn.textContent = "Enviando…";

  try {
    const r = await fetch(`/whatsapp/conversas/${_waSelecionadaId}/responder`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || r.statusText);
    }
    const { mensagem } = await r.json();

    // Adiciona a mensagem localmente (sem esperar o poll)
    const cached = _waConversaCache.get(_waSelecionadaId);
    if (cached) {
      cached.mensagens = [...(cached.mensagens || []), mensagem];
      cached.assumida_por_id = cached.assumida_por_id || true;
      _waRenderChat(cached);
      _waRenderInfo(cached);
    }

    input.value = "";

    // Atualiza a lista para refletir auto-assume
    await carregarConversas?.();
    _waRenderLista();
  } catch (e) {
    alert("Erro ao enviar: " + e.message);
  } finally {
    input.disabled = false;
    btn.disabled   = false;
    btn.textContent = "Enviar";
    input.focus();
  }
}

async function _waDevolverIA(convId) {
  try {
    const r = await fetch(`/whatsapp/conversas/${convId}/devolver-ia`, {
      method: "PATCH", headers: authHeaders(),
    });
    if (!r.ok) throw new Error(await r.text());
    _waConversaCache.delete(convId);
    await carregarConversas?.();
    if (_waSelecionadaId === convId) await _waSelecionar(convId);
    _waRenderLista();
  } catch (e) {
    alert("Erro ao devolver conversa: " + e.message);
  }
}

function _waFecharConversa(convId) {
  // Mostra mini-modal de avaliação inline no header do chat antes de fechar
  const header = document.querySelector(".wa-chat-header");
  if (!header) { _waFecharConversaConfirmar(convId, null); return; }

  // Evita duplicar se já estiver aberto
  if (document.getElementById("waQaInline")) { _waFecharConversaConfirmar(convId, null); return; }

  const div = document.createElement("div");
  div.id = "waQaInline";
  div.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;
                padding:14px 16px;margin-top:8px;display:flex;flex-direction:column;gap:10px;">
      <div style="font-size:12px;font-weight:600;color:var(--text);">Como foi este atendimento?</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${_WA_QUALIDADES.map(q =>
          `<button class="btn btn-sm wa-qa-btn ${q.cls}" type="button"
             data-qa-fechar="${convId}" data-q="${q.v}">${q.label}</button>`
        ).join("")}
        <button class="btn btn-sm" type="button" data-qa-fechar="${convId}" data-q=""
          style="color:var(--muted);margin-left:auto;">Pular</button>
      </div>
    </div>`;

  // Delega clique nos botões
  div.addEventListener("click", async e => {
    const btn = e.target.closest("[data-qa-fechar]");
    if (!btn) return;
    const qualidade = btn.dataset.q || null;
    div.remove();
    await _waFecharConversaConfirmar(Number(btn.dataset.qaFechar), qualidade);
  });

  header.after(div);
}

async function _waFecharConversaConfirmar(convId, qualidade) {
  try {
    // Salva qualidade antes de fechar (se escolheu)
    if (qualidade) {
      await fetch(`/whatsapp/conversas/${convId}/qualidade`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ qualidade }),
      });
    }
    const r = await fetch(`/whatsapp/conversas/${convId}/fechar`, {
      method: "PATCH", headers: authHeaders(),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    _waConversaCache.delete(convId);
    await carregarConversas?.();
    if (_waSelecionadaId === convId) await _waSelecionar(convId);
    _waRenderLista();
  } catch (e) {
    alert("Erro ao fechar conversa: " + e.message);
  }
}

async function _waReabrirConversa(convId) {
  try {
    const r = await fetch(`/whatsapp/conversas/${convId}/reabrir`, {
      method: "PATCH", headers: authHeaders(),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    _waConversaCache.delete(convId);
    await carregarConversas?.();
    if (_waSelecionadaId === convId) await _waSelecionar(convId);
    _waRenderLista();
  } catch (e) {
    alert("Erro ao reabrir conversa: " + e.message);
  }
}

async function _waApagarConversa(convId) {
  try {
    const r = await fetch(`/whatsapp/conversas/${convId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);

    _waConversaCache.delete(convId);

    if (_waSelecionadaId === convId) {
      _waSelecionadaId = null;
      const head = document.getElementById("waChatHead");
      const body = document.getElementById("waChatBody");
      const info = document.getElementById("waInfoCol");
      const inp  = document.getElementById("waChatInput");
      if (head) head.innerHTML = `<div class="wa-chat-empty-head">Selecione uma conversa</div>`;
      if (body) body.innerHTML = `<div class="wa-chat-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Clique numa conversa pra ver o histórico</p></div>`;
      if (info) info.innerHTML = `<div class="wa-info-empty">Selecione uma conversa pra ver detalhes</div>`;
      if (inp)  inp.style.display = "none";
    }

    await carregarConversas?.();
    _waRenderLista();
  } catch (e) {
    alert("Erro ao apagar conversa: " + e.message);
  }
}

function _waAbrirSelecaoCondominio(convId) {
  const lista = Array.isArray(_condominios) ? _condominios : [];
  const acoes = document.querySelector(`[data-wa-action="vincular-condo"][data-conv-id="${convId}"]`)?.closest(".wa-info-acoes");
  if (!acoes) return;

  if (!lista.length) {
    acoes.insertAdjacentHTML("beforebegin", `<div style="color:var(--danger);font-size:11.5px;margin-bottom:6px;">Nenhum condomínio cadastrado.</div>`);
    return;
  }

  acoes.innerHTML = `
    <select id="waSelectCondo" class="input" style="font-size:11.5px;width:100%;">
      <option value="">Selecione o condomínio…</option>
      ${lista.map(c => `<option value="${c.id}">${_waEscaparHtml(c.nome)}${c.bairro ? " — " + _waEscaparHtml(c.bairro) : ""}</option>`).join("")}
    </select>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button class="btn btn-sm btnAccent" type="button"
        data-wa-action="confirmar-vincular" data-conv-id="${convId}" style="flex:1;">Confirmar</button>
      <button class="btn btn-sm" type="button"
        data-wa-action="cancelar-vincular" data-conv-id="${convId}">Cancelar</button>
    </div>`;
}

async function _waVincularCondo(convId, condoId) {
  try {
    const r = await fetch(`/whatsapp/conversas/${convId}/vincular-condominio`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ condominio_id: condoId }),
    });
    if (!r.ok) throw new Error(await r.text());
    _waConversaCache.delete(convId);
    await carregarConversas?.();
    if (_waSelecionadaId === convId) await _waSelecionar(convId);
  } catch (e) {
    alert("Erro ao vincular: " + e.message);
  }
}

function renderConversas() {
  // Mantém o nome pra compatibilidade — agora só renderiza a coluna 1.
  // O chat e o painel só são renderizados quando seleciona uma conversa.
  _waRenderLista();
  // Se tinha uma conversa selecionada, mantém visível
  if (_waSelecionadaId) {
    const cv = (_conversasData || []).find(c => c.id === _waSelecionadaId);
    if (!cv) {
      // sumiu da lista — limpa
      _waSelecionadaId = null;
      const head = document.getElementById("waChatHead");
      const body = document.getElementById("waChatBody");
      const info = document.getElementById("waInfoCol");
      const inp  = document.getElementById("waChatInput");
      if (head) head.innerHTML = `<div class="wa-chat-empty-head">Selecione uma conversa</div>`;
      if (body) body.innerHTML = `<div class="wa-chat-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Clique numa conversa pra ver o histórico</p></div>`;
      if (info) info.innerHTML = `<div class="wa-info-empty">Selecione uma conversa pra ver detalhes</div>`;
      if (inp)  inp.style.display = "none";
    }
  }
}

// ===== AÇÕES DE CHAMADO =====
async function fecharChamadoAction(id) {
  const r = await fetch(`/chamados/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ status: "fechado" }),
  });
  if (!r.ok) { alert("Erro ao fechar chamado"); return; }
  await carregarTudo();
  if (_drawerCondoId) renderDrawerChamados();
}


async function reabrirChamadoAction(id) {
  const r = await fetch(`/chamados/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ status: "aberto" }),
  });
  if (!r.ok) { alert("Erro ao reabrir chamado"); return; }
  await carregarTudo();
  if (_drawerCondoId) renderDrawerChamados();
}

// ===== DRAWER =====
function abrirDrawer(condoId, tabInicial) {
  _drawerCondoId = condoId;
  _drawerTab = tabInicial || "telemetria";
  _drawerConversaId = null;
  _drawerHistorico = null; // limpa cache do histórico

  const item = (_statusData || []).find(g => Number(g.condominio?.id) === condoId);
  const condoObj = (Array.isArray(_condominios) ? _condominios : []).find(c => Number(c.id) === condoId);
  const nome = item?.condominio?.nome || condoObj?.nome || `Condomínio ${condoId}`;
  document.getElementById("drawerTitle").textContent = nome;

  const chamadosN = _chamadosData.filter(ch => Number(ch.condominio_id) === condoId && ch.status !== "fechado").length;
  const wzN       = _conversasData.filter(cv => Number(cv.condominio_id) === condoId && cv.status === "aberta").length;

  const bCh = document.getElementById("drawerBadgeChamados");
  if (bCh) { bCh.textContent = chamadosN; bCh.classList.toggle("vis", chamadosN > 0); }
  const bWz = document.getElementById("drawerBadgeWhatsapp");
  if (bWz) { bWz.textContent = wzN; bWz.classList.toggle("vis", wzN > 0); }

  document.getElementById("drawerOverlay").classList.add("is-open");
  document.getElementById("drawerPanel").classList.add("is-open");

  switchDrawerTab(_drawerTab || "telemetria");
}

function fecharDrawer() {
  document.getElementById("drawerOverlay").classList.remove("is-open");
  document.getElementById("drawerPanel").classList.remove("is-open");
  _drawerCondoId = null;
  _drawerConversaId = null;
  _drawerHistorico = null;
  destruirGaugesDrawer();
}

function switchDrawerTab(tab) {
  _drawerTab = tab;
  _drawerConversaId = null;

  document.querySelectorAll(".drawer-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".drawer-pane").forEach(p => p.classList.toggle("is-active", p.dataset.pane === tab));

  if (tab === "telemetria") renderDrawerTelemetria();
  else if (tab === "chamados") renderDrawerChamados();
  else if (tab === "whatsapp") renderDrawerWhatsapp();
  else if (tab === "os") renderDrawerOS();
  else if (tab === "orcamentos") renderDrawerOrcamentos();
}

function corGaugePorNivel(lvClass) {
  switch (lvClass) {
    case "lv-alto":        return "#22c55e";
    case "lv-medio":       return "#60a5fa";
    case "lv-baixo":       return "#fb923c";
    case "lv-muito-baixo": return "#f87171";
    default:               return "#9ca3af";
  }
}

function destruirGaugesDrawer() {
  for (const chart of _drawerGauges.values()) {
    try { chart.destroy(); } catch (_) {}
  }
  _drawerGauges.clear();
}

function criarGaugeReservatorio(elId, pct, lvClass) {
  const el = document.getElementById(elId);
  if (!el || typeof ApexCharts === "undefined") return;
  const cor = corGaugePorNivel(lvClass);
  const chart = new ApexCharts(el, {
    chart: { type: "radialBar", height: 200, sparkline: { enabled: true }, animations: { enabled: true, speed: 600 } },
    series: [Math.round(pct)],
    colors: [cor],
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: { size: "62%", background: "transparent" },
        track: { background: "rgba(255,255,255,.06)", strokeWidth: "100%", margin: 0 },
        dataLabels: {
          name: { show: true, color: "#9ca3af", offsetY: 22, fontSize: "11px", fontWeight: 600 },
          value: {
            show: true,
            color: "#f5f5f5",
            fontSize: "30px",
            fontWeight: 800,
            offsetY: -8,
            formatter: (v) => v + "%",
          },
        },
      },
    },
    fill: {
      type: "gradient",
      gradient: { shade: "dark", type: "horizontal", gradientToColors: [cor], stops: [0, 100], opacityFrom: 1, opacityTo: 1 },
    },
    stroke: { lineCap: "round" },
    labels: ["Nível"],
  });
  chart.render();
  _drawerGauges.set(elId, { chart, cor });
}

function renderDrawerTelemetria() {
  const pane = document.getElementById("drawerPaneTelemetria");
  if (!pane) return;

  // sempre destrói gauges antigos antes de reconstruir o HTML
  destruirGaugesDrawer();

  const item = (_statusData || []).find(g => Number(g.condominio?.id) === _drawerCondoId);
  if (!item) { pane.innerHTML = `<div style="color:var(--muted);">Dados não encontrados.</div>`; return; }

  const reservs = Array.isArray(item.reservatorios) ? item.reservatorios : [];

  if (reservs.length === 0) {
    pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhum reservatório ativo neste condomínio.</div>`;
    return;
  }

  const gaugesParaCriar = []; // {elId, pct, lvClass}

  const btnTelFull = `<div style="margin-bottom:12px;">
    <button class="btn btn-sm" type="button" data-action="ir-telemetria-condo" data-condo-id="${_drawerCondoId}"
      style="width:100%;justify-content:center;">
      📊 Ver telemetria completa
    </button>
  </div>`;

  pane.innerHTML = btnTelFull + reservs.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct ?? null;
    const n = String(u?.nivel || "").toLowerCase();
    const lvClass = n === "alto" ? "lv-alto" : n === "medio" ? "lv-medio" : n === "baixo" ? "lv-baixo" : n === "muito_baixo" ? "lv-muito-baixo" : "";
    const offline = !!r.offline;
    const mins = r.minutos_sem_atualizar;
    const alertas = r.alertas_abertos_count ?? 0;
    const bombaLabel = u?.bomba_ligada === true ? badge("LIGADA", "warn") : u?.bomba_ligada === false ? badge("DESLIGADA", "ok") : "-";
    const offlineBadge = offline ? badge("OFFLINE", "bad") : badge("Online", "ok");

    const gaugeId = `gauge-r-${r.id}`;
    if (pct != null && lvClass) gaugesParaCriar.push({ elId: gaugeId, pct, lvClass });

    const gaugeHtml = pct != null
      ? `<div class="dp-gauge-wrap"><div id="${gaugeId}" class="dp-gauge"></div></div>`
      : `<div style="color:var(--muted);font-size:12px;padding:12px 0;">Sem dados de nível</div>`;

    return `
      <div class="dp-res">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div class="dp-res-name">${r.nome || "Reservatório"}</div>
          ${offlineBadge}
        </div>
        ${gaugeHtml}
        <div class="dp-res-meta">
          <span>Bomba: ${bombaLabel}</span>
          <span>Tipo: ${r.tipo || "-"}</span>
          <span>Device: <code style="font-size:11px;">${r.device_id || "-"}</code></span>
          ${mins != null ? `<span>Sem atualizar: ${mins}min</span>` : ""}
          ${alertas > 0 ? `<span style="color:#f87171;">${alertas} alerta${alertas > 1 ? "s" : ""} aberto${alertas > 1 ? "s" : ""}</span>` : ""}
          <span>Última leitura: ${u?.criado_em ? fmtData(u.criado_em) : "-"}</span>
        </div>
      </div>`;
  }).join("");

  for (const g of gaugesParaCriar) criarGaugeReservatorio(g.elId, g.pct, g.lvClass);
}

// Atualiza os gauges abertos sem rebuild de HTML (chamado no tick de telemetria)
function atualizarGaugesDrawerSeAberto() {
  if (!_drawerCondoId || _drawerTab !== "telemetria") return;
  if (_drawerGauges.size === 0) return;

  const item = (_statusData || []).find(g => Number(g.condominio?.id) === _drawerCondoId);
  if (!item) return;
  const reservs = Array.isArray(item.reservatorios) ? item.reservatorios : [];

  // Se conjunto de reservatórios mudou (criação/exclusão), refaz tudo
  const idsAtuais = new Set(reservs.map(r => `gauge-r-${r.id}`));
  let mudouEstrutura = false;
  for (const id of _drawerGauges.keys()) {
    if (!idsAtuais.has(id)) { mudouEstrutura = true; break; }
  }
  if (mudouEstrutura) { renderDrawerTelemetria(); return; }

  for (const r of reservs) {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    if (pct == null) continue;
    const n = String(u?.nivel || "").toLowerCase();
    const lvClass = n === "alto" ? "lv-alto" : n === "medio" ? "lv-medio" : n === "baixo" ? "lv-baixo" : n === "muito_baixo" ? "lv-muito-baixo" : "";
    if (!lvClass) continue;

    const elId = `gauge-r-${r.id}`;
    const entry = _drawerGauges.get(elId);
    if (!entry) { renderDrawerTelemetria(); return; }

    const novaCor = corGaugePorNivel(lvClass);
    if (novaCor !== entry.cor) {
      entry.chart.updateOptions({ colors: [novaCor], fill: { type: "gradient", gradient: { gradientToColors: [novaCor] } } }, false, true);
      entry.cor = novaCor;
    }
    entry.chart.updateSeries([Math.round(pct)]);
  }
}

function renderDrawerChamados() {
  const pane = document.getElementById("drawerPaneChamados");
  if (!pane) return;

  const list = _chamadosData.filter(ch => Number(ch.condominio_id) === _drawerCondoId);
  if (list.length === 0) {
    pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhum chamado para este condomínio.</div>`;
    return;
  }

  const prioLabel = { p4: "P4 Agendado", p3: "P3 Controlado", p2: "P2 Alta", p1: "P1 Crítico" };
  const statusLbl = { aberto: "Aberto", em_atendimento: "Em atendimento", fechado: "Fechado" };

  pane.innerHTML = list.map(ch => {
    const prioClass = `prio-${ch.prioridade || "p3"}`;
    const statusCls = `chamado-status-${ch.status || "aberto"}`;
    const orcBloco = ch.orcamento_necessario ? `
      <div class="orc-bloco">
        <div class="orc-bloco-head">
          <span class="orc-bloco-badge">💰 Orçamento solicitado pelo técnico</span>
        </div>
        <div class="orc-bloco-texto">${ch.orcamento_observacoes
          ? escapeHtml(ch.orcamento_observacoes).replace(/\n/g, "<br>")
          : "<em>Sem observações registradas — contate o técnico.</em>"}</div>
      </div>` : "";
    return `
      <div class="dp-chamado${ch.orcamento_necessario ? " dp-chamado-orc" : ""}">
        <div class="dp-chamado-titulo">${ch.titulo || "Chamado #" + ch.id}</div>
        <div class="dp-chamado-meta">
          <span class="prio-badge ${prioClass}">${prioLabel[ch.prioridade] || ch.prioridade}</span>
          <span class="${statusCls}">${statusLbl[ch.status] || ch.status}</span>
          ${ch.orcamento_necessario ? `<span class="orc-pill">💰 Orçamento</span>` : ""}
          ${ch.plano_manutencao_id ? `<span class="orc-pill" style="background:rgba(99,102,241,.15);color:#a5b4fc;border-color:rgba(99,102,241,.35);" title="${_waEscaparHtml(ch.plano_titulo || "Plano de manutenção")}">🔄 Preventiva</span>` : ""}
          <span style="color:var(--muted2);">#${ch.id} • ${fmtData(ch.criado_em)}</span>
        </div>
        ${ch.descricao ? `<div style="font-size:12px;color:var(--muted);line-height:1.5;">${ch.descricao.slice(0, 200)}${ch.descricao.length > 200 ? "…" : ""}</div>` : ""}
        ${orcBloco}
        ${ch.status !== "fechado" ? `
        <div class="dp-chamado-actions viewer-only-hide">
          <button class="btn btn-sm" data-action="fechar-chamado" data-id="${ch.id}">Fechar</button>
        </div>` : ""}
      </div>`;
  }).join("");
}

function renderDrawerWhatsapp() {
  const pane = document.getElementById("drawerPaneWhatsapp");
  if (!pane) return;

  if (_drawerConversaId) { renderConversaChat(_drawerConversaId); return; }

  const list = _conversasData.filter(cv => Number(cv.condominio_id) === _drawerCondoId);
  if (list.length === 0) {
    pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhuma conversa para este condomínio.</div>`;
    return;
  }

  pane.innerHTML = `<div class="wz-list">${list.map(cv => {
    const nome = cv.cliente_nome || cv.telefone || "Desconhecido";
    const ts = cv.ultima_mensagem_em ? fmtData(cv.ultima_mensagem_em) : fmtData(cv.criado_em);
    const preview = cv.ultima_mensagem ? cv.ultima_mensagem.slice(0, 80) + (cv.ultima_mensagem.length > 80 ? "…" : "") : "(sem mensagens)";
    const statusB = cv.status === "aberta" ? badge("aberta", "warn") : badge("fechada", "ok");
    return `
      <div class="wz-convo" data-action="ver-conversa" data-id="${cv.id}">
        <div class="wz-convo-head">
          <span class="wz-convo-name">${nome}</span>
          ${statusB}
          <span class="wz-convo-ts">${ts}</span>
        </div>
        <div class="wz-convo-last">${preview}</div>
      </div>`;
  }).join("")}</div>`;
}

async function renderConversaChat(conversaId) {
  const pane = document.getElementById("drawerPaneWhatsapp");
  if (!pane) return;
  pane.innerHTML = `<button class="wz-back" data-action="voltar-conversas">← Voltar</button><div style="color:var(--muted);">Carregando…</div>`;

  try {
    const r = await fetch(`/whatsapp/conversas/${conversaId}`, { headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Erro ao carregar");

    const nome = data.cliente_nome || data.telefone || "Cliente";
    const msgs = Array.isArray(data.mensagens) ? data.mensagens : [];
    const statusB = data.status === "aberta" ? badge("aberta", "warn") : badge("fechada", "ok");

    pane.innerHTML = `
      <button class="wz-back" data-action="voltar-conversas">← Voltar</button>
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${nome} • ${data.telefone || ""} • ${statusB}</div>
      <div class="wz-chat">
        ${msgs.length === 0 ? `<div style="color:var(--muted);">Sem mensagens.</div>` :
          msgs.map(m => `
            <div class="wz-msg ${m.direcao === "entrada" ? "wz-in" : "wz-out"}">
              ${m.conteudo || "(sem texto)"}
              <span class="wz-ts">${fmtData(m.criado_em)}</span>
            </div>`).join("")}
      </div>`;
  } catch (err) {
    pane.innerHTML = `<button class="wz-back" data-action="voltar-conversas">← Voltar</button><div style="color:var(--danger);">Erro: ${err.message}</div>`;
  }
}

// ─── Drawer: OS e Orçamentos ─────────────────────────────────────────────────
let _drawerHistorico = null; // { condoId, os, orcamentos }

async function _drawerCarregarHistorico() {
  const id = _drawerCondoId;
  if (!id) return null;
  if (_drawerHistorico?.condoId === id) return _drawerHistorico;
  try {
    const r = await fetch(`/admin/condominios/${id}/historico`, { headers: authHeaders() });
    if (!r.ok) return null;
    const data = await r.json();
    _drawerHistorico = { condoId: id, ...data };
    return _drawerHistorico;
  } catch (e) { console.error("_drawerCarregarHistorico:", e); return null; }
}

async function renderDrawerOS() {
  const pane = document.getElementById("drawerPaneOS");
  if (!pane) return;
  pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Carregando…</div>`;

  const hist = await _drawerCarregarHistorico();
  if (!hist) { pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Erro ao carregar.</div>`; return; }

  const { os } = hist;
  const fmtD  = iso => iso ? new Date(iso).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
  const fmtV  = v  => Number(v) > 0 ? "R$ " + Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : null;
  const sCor  = s  => s==="fechado"||s==="aprovado" ? "var(--ok)" : s==="rejeitado" ? "#f87171" : s==="rascunho"||s==="pendente" ? "var(--muted)" : "var(--warn)";
  const sLbl  = s  => ({aberto:"Aberto",fechado:"Fechado",pendente:"Pendente",aprovado:"Aprovado",rejeitado:"Rejeitado"})[s] || s || "—";

  if (!os.length) { pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhuma O.S. registrada.</div>`; return; }

  pane.innerHTML = os.map(o => {
    const status = o.finalizada_em ? "fechado" : "aberto";
    const orcInfo = o.orcamento_necessario && o.orcamento_status
      ? `<div class="dh-row-sub">Orç.: <span style="color:${sCor(o.orcamento_status)};font-weight:600;">${sLbl(o.orcamento_status)}</span>${fmtV(o.orcamento_valor) ? " · " + fmtV(o.orcamento_valor) : ""}</div>`
      : "";
    return `<div class="dh-item">
      <div class="dh-row-main">
        <span class="dh-num">OS #${_waEscaparHtml(o.numero || o.id)}</span>
        <span class="dh-badge" style="color:${sCor(status)};">${sLbl(status)}</span>
      </div>
      <div class="dh-row-sub">${fmtD(o.criado_em)}${o.tecnico_nome ? " · " + _waEscaparHtml(o.tecnico_nome) : ""}${o.tipos_servico ? " · " + _waEscaparHtml(o.tipos_servico) : ""}</div>
      ${orcInfo}
    </div>`;
  }).join("");
}

async function renderDrawerOrcamentos() {
  const pane = document.getElementById("drawerPaneOrcamentos");
  if (!pane) return;
  pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Carregando…</div>`;

  const hist = await _drawerCarregarHistorico();
  if (!hist) { pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Erro ao carregar.</div>`; return; }

  const { orcamentos } = hist;
  const fmtD = iso => iso ? new Date(iso).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
  const fmtV = v  => "R$ " + Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const sCor = s  => s==="aprovado" ? "var(--ok)" : s==="rejeitado" ? "#f87171" : s==="rascunho" ? "var(--muted)" : s==="enviado" ? "var(--warn)" : "var(--muted)";
  const sLbl = s  => ({rascunho:"Rascunho",enviado:"Enviado",aprovado:"Aprovado",rejeitado:"Rejeitado"})[s] || s || "—";

  if (!orcamentos.length) { pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhum orçamento registrado.</div>`; return; }

  pane.innerHTML = orcamentos.map(o => `
    <div class="dh-item">
      <div class="dh-row-main">
        <span class="dh-num">${_waEscaparHtml(o.numero || "—")}</span>
        <span class="dh-badge" style="color:${sCor(o.status)};">${sLbl(o.status)}</span>
      </div>
      <div class="dh-row-sub">${fmtD(o.criado_em)} · ${fmtV(o.valor_total)}</div>
      ${o.os_id ? `<div class="dh-row-sub">Vinculado à <span style="color:var(--text);font-weight:600;">OS #${_waEscaparHtml(o.os_numero || o.os_id)}</span></div>` : ""}
    </div>`).join("");
}

function getMyRole() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1])).role;
  } catch { return null; }
}
const _myRole     = getMyRole();
const _isMaster   = _myRole === "admin";
const _isOperador = _myRole === "operador";

document.addEventListener("DOMContentLoaded", () => {
  const f = document.getElementById("filtroTexto");
  if (f) f.addEventListener("input", () => aplicarFiltros());

  document.getElementById("filtroSomenteAlertas")?.addEventListener("change", aplicarFiltros);
  document.getElementById("filtroSomenteOffline")?.addEventListener("change", aplicarFiltros);
});

let _modalKey = null;

function bindResumoInteracoes() {
  document.querySelectorAll(".rc[data-card]").forEach(btn => {
    btn.addEventListener("mouseenter", (e) => showTip(e.currentTarget));
    btn.addEventListener("mousemove", (e) => moveTip(e));
    btn.addEventListener("mouseleave", () => hideTip());
    btn.addEventListener("click", () => abrirModal(btn.dataset.card));
  });
}

function _chamadosAbertosDoCondo(condoId) {
  const id = Number(condoId);
  if (!id) return 0;
  return (_chamadosData || []).filter(ch => Number(ch.condominio_id) === id && ch.status !== "fechado").length;
}

function getListaPorKey(key) {
  const items = [];

  // percorre por condomínio e reservatórios
  for (const g of (_statusData || [])) {
    const c = g.condominio || {};
    const resumo = g.resumo || {};
    const reservs = Array.isArray(g.reservatorios) ? g.reservatorios : [];

    if (key === "offline") {
  const grupos = Array.isArray(_statusData) ? _statusData : [];

  for (const g of grupos) {
    const c = g.condominio || {};
    const reservs = Array.isArray(g.reservatorios) ? g.reservatorios : [];

    for (const r of reservs) {
      if (!r.offline) continue;

      items.push({
        nome: `${c.nome || "-"} • ${r.nome || "Reservatório"}`,
        device_id: r.device_id || "-",
        detalhe: `${r.minutos_sem_atualizar ?? "-"} min sem atualizar`,
        kind: "bad",
        condominio_id: c.id || null
      });
    }
  }

  return items.sort((a, b) => (parseInt(b.detalhe) || 0) - (parseInt(a.detalhe) || 0));
}

    if (key === "com_alerta") {
      if ((resumo.alertas_abertos_total ?? 0) <= 0) continue;
      items.push({
        nome: c.nome || "-",
        device_id: `${_chamadosAbertosDoCondo(c.id)} em aberto`,
        detalhe: `Alertas abertos: ${resumo.alertas_abertos_total ?? 0}`,
        kind: "warn",
        condominio_id: c.id || null,
      });
      continue;
    }

    if (key === "ok") {
      const off = resumo.offline_count ?? 0;
      const al = resumo.alertas_abertos_total ?? 0;
      if (off > 0) continue;
      if (al > 0) continue;
      items.push({
        nome: c.nome || "-",
        device_id: `${_chamadosAbertosDoCondo(c.id)} em aberto`,
        detalhe: "Sem alertas • Online",
        kind: "ok",
        condominio_id: c.id || null,
      });
      continue;
    }
  }

  // alertas por tipo vem direto da tabela de alertas abertos
  if (key === "nivel_baixo" || key === "nivel_muito_baixo") {
    const tipo = key;
    for (const a of (_alertasAbertos || [])) {
      if (a.tipo !== tipo) continue;
      items.push({
        nome: a.condominio_nome ? a.condominio_nome : "-", // se não existir, ok
        device_id: a.device_id,
        detalhe: a.mensagem || tipo,
        kind: tipo === "nivel_muito_baixo" ? "bad" : "warn",
        condominio_id: _alCondoIdDoDevice(a.device_id),
      });
    }
  }

  return items;
}

/* ===== Tooltip (hover) ===== */
function showTip(el) {
  const key = el.dataset.card;
  const tip = document.getElementById("cardTip");
  const list = getListaPorKey(key).slice(0, 6);

  const titleMap = {
    offline: "OFFLINE (prévia)",
    nivel_baixo: "NÍVEL BAIXO (prévia)",
    nivel_muito_baixo: "MUITO BAIXO (prévia)",
    com_alerta: "COM ALERTA (prévia)",
    ok: "OK (prévia)"
  };

  let html = `<div class="tTitle">${titleMap[key] || "Prévia"}</div>`;

  if (list.length === 0) {
    html += `<div class="tEmpty">Nada por aqui ✅</div>`;
  } else {
    for (const it of list) {
      html += `
        <div class="tItem">
          <div><b>${it.device_id}</b> • ${it.nome}</div>
          <span>${String(it.detalhe).slice(0, 22)}${String(it.detalhe).length > 22 ? "…" : ""}</span>
        </div>
      `;
    }
    html += `<div class="tEmpty">Clique para ver a lista completa</div>`;
  }

  tip.innerHTML = html;
  tip.style.display = "block";
}

function moveTip(e) {
  const tip = document.getElementById("cardTip");
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;

  // evitar sair da tela
  const w = tip.offsetWidth || 360;
  const h = tip.offsetHeight || 160;
  if (x + w + 10 > window.innerWidth) x = e.clientX - w - pad;
  if (y + h + 10 > window.innerHeight) y = e.clientY - h - pad;

  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideTip() {
  const tip = document.getElementById("cardTip");
  tip.style.display = "none";
}

/* ===== Modal (click) ===== */
function abrirModal(key) {
  _modalKey = key;

  const titleMap = {
    offline: "Dispositivos OFFLINE",
    nivel_baixo: "Alertas • Nível Baixo",
    nivel_muito_baixo: "Alertas • Nível MUITO Baixo",
    com_alerta: "Condomínios com ALERTA",
    ok: "Condomínios OK"
  };

  document.getElementById("modalTitle").textContent = titleMap[key] || "Detalhes";
  document.getElementById("modalSub").textContent = "Use a busca para filtrar";
  document.getElementById("modalBusca").value = "";

  // Coluna 2 muda conforme o tipo: condomínio → Chamados; dispositivo → Device
  const th2 = document.getElementById("modalThCol2");
  if (th2) th2.textContent = (key === "com_alerta" || key === "ok") ? "Chamados" : "Device";

  document.getElementById("modalOverlay").style.display = "flex";
  renderModalLista();
}

function fecharModal() {
  document.getElementById("modalOverlay").style.display = "none";
  _modalKey = null;
}

function renderModalLista() {
  const busca = (document.getElementById("modalBusca").value || "").trim().toLowerCase();
  let list = getListaPorKey(_modalKey);

  if (busca) {
    list = list.filter(it =>
      String(it.nome || "").toLowerCase().includes(busca) ||
      String(it.device_id || "").toLowerCase().includes(busca) ||
      String(it.detalhe || "").toLowerCase().includes(busca)
    );
  }

  document.getElementById("modalCount").textContent = `${list.length} itens`;

  const tbody = document.getElementById("modalTbody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `
      <tr class="m-empty-row">
        <td colspan="5">
          <div class="m-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <p>${busca ? "Nada encontrado para essa busca." : "Nada por aqui."}</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  for (const it of list) {
    const kind = it.kind || "ok";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="m-stat"><span class="m-dot m-dot-${kind}" title="${kind}"></span></td>
      <td class="m-condo">${it.nome}</td>
      <td class="mono m-device">${it.device_id}</td>
      <td class="m-det">${it.detalhe}</td>
      <td class="right">
        ${it.condominio_id ? `<button class="btn btn-sm m-detail-btn" data-action="ver-condo-modal" data-condo-id="${it.condominio_id}">Ver detalhes<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>` : ""}
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// Fechar modal clicando fora
document.addEventListener("click", (e) => {
  const ov = document.getElementById("modalOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModal();
});

function abrirModalEditar(id) {
  if (!id) return;

  const overlay = document.getElementById("editOverlay");
  const msg = document.getElementById("editMsg");
  const sub = document.getElementById("editSub");

  msg.textContent = "Carregando...";
  sub.textContent = `ID: ${id}`;
  overlay.style.display = "flex";

  // Sempre abre na aba "Dados" e guarda o condoId pro handler das outras tabs
  _editCondoIdAtivo = id;
  _editAtivarTab("dados", id);

  // bind CNPJ (só uma vez — guarda flag no elemento)
  const cnpjEditInput = document.getElementById("editCnpj");
  if (cnpjEditInput && !cnpjEditInput.dataset.bound) {
    cnpjEditInput.dataset.bound = "1";
    cnpjEditInput.addEventListener("input", () => {
      let v = cnpjEditInput.value.replace(/\D/g, "").slice(0, 14);
      if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
      else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
      else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
      else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
      cnpjEditInput.value = v;
    });
    document.getElementById("btnBuscarCnpjEdit")?.addEventListener("click", async () => {
      const cnpj = (cnpjEditInput.value || "").replace(/\D/g, "");
      const msgEl = document.getElementById("msgCnpjEdit");
      if (msgEl) { msgEl.textContent = ""; msgEl.style.color = ""; }
      if (cnpj.length !== 14) { if (msgEl) msgEl.textContent = "CNPJ deve ter 14 dígitos."; return; }
      const btn = document.getElementById("btnBuscarCnpjEdit");
      if (btn) { btn.disabled = true; btn.textContent = "Buscando…"; }
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        const data = await r.json();
        if (!r.ok) { if (msgEl) msgEl.textContent = data.message || "CNPJ não encontrado."; return; }
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set("editNome",         data.razao_social || data.nome_fantasia);
        set("editNomeFantasia", data.nome_fantasia);
        set("editEndereco",     [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", "));
        set("editBairro",     data.bairro);
        set("editCidade",     data.municipio);
        set("editUf",         data.uf);
        set("editCep",        (data.cep || "").replace(/^(\d{5})(\d{3})$/, "$1-$2"));
        set("editTelefone",   data.ddd_telefone_1 ? data.ddd_telefone_1.replace(/\D/g, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : "");
        if (msgEl) {
          const situacao = data.descricao_situacao_cadastral || "";
          msgEl.style.color = situacao.toLowerCase().includes("ativa") ? "var(--ok)" : "var(--warn)";
          msgEl.textContent = `✓ Dados preenchidos${situacao ? " · " + situacao : ""}`;
        }
        buscarCoordenadasPorEndereco("edit");
      } catch {
        if (msgEl) msgEl.textContent = "Erro ao consultar CNPJ. Verifique a conexão.";
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Buscar dados"; }
      }
    });
  }

  fetch("/condominios/" + id, { headers: authHeaders() })
    .then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || ("Erro " + r.status));
      return data;
    })
    .then((c) => {
      // Preenche form
      document.getElementById("editId").value = c.id;

      document.getElementById("editNome").value = c.nome || "";
      const editNomeFantasia = document.getElementById("editNomeFantasia");
      if (editNomeFantasia) editNomeFantasia.value = c.nome_fantasia || "";
      const editCnpjEl = document.getElementById("editCnpj");
      if (editCnpjEl) editCnpjEl.value = c.cnpj ? c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";

      document.getElementById("editEndereco").value = c.endereco || "";
      document.getElementById("editBairro").value = c.bairro || "";
      document.getElementById("editCidade").value = c.cidade || "";
      document.getElementById("editUf").value = c.uf || "";

      document.getElementById("editResponsavel").value = c.responsavel || "";
      document.getElementById("editTelefone").value = c.telefone || "";
      document.getElementById("editEmail").value = c.email || "";
      document.getElementById("editObs").value = c.observacoes || "";
      const editZonaEl = document.getElementById("editZona");
      if (editZonaEl) editZonaEl.value = c.zona || "";

      document.getElementById("editAtivo").checked = (c.ativo !== false);

      const editLat = document.getElementById("editLat");
      const editLng = document.getElementById("editLng");
      if (editLat) editLat.value = c.lat != null ? c.lat : "";
      if (editLng) editLng.value = c.lng != null ? c.lng : "";
      const editCep = document.getElementById("editCep");
      if (editCep) editCep.value = c.cep ? _cepMascarar(c.cep) : "";
      const cepMsg = document.getElementById("editCepMsg");
      if (cepMsg) { cepMsg.className = "cep-msg"; cepMsg.textContent = ""; }
      const locMsg = document.getElementById("editLocMsg");
      if (locMsg) { locMsg.className = "loc-msg"; locMsg.textContent = ""; }

      // Inicializa ou atualiza o mini-mapa após o modal estar visível
      setTimeout(() => {
        criarOuObterMiniMapa("edit");
        _miniMapaInvalidar("edit");
        if (c.lat != null && c.lng != null) {
          _miniMapaAplicarCoord("edit", Number(c.lat), Number(c.lng));
        } else {
          // sem coordenadas: centro de SP, zoom padrão
          const ref = _miniMapas.get("edit");
          if (ref) {
            ref.marker.setLatLng([SP_CENTRO.lat, SP_CENTRO.lng]);
            ref.map.setView([SP_CENTRO.lat, SP_CENTRO.lng], SP_CENTRO.zoom);
          }
        }
      }, 80);

      msg.textContent = "";
      sub.textContent = `${c.nome_fantasia || c.nome || "Condomínio"} • ID: ${c.id}`;
    })
    .catch((e) => {
      msg.textContent = "Erro: " + e.message;
    });
}

function fecharModalEditar() {
  const overlay = document.getElementById("editOverlay");
  overlay.style.display = "none";
  document.getElementById("editMsg").textContent = "";
  _editCondoIdAtivo = null;
}

function _valOrNull(id) {
  const v = (document.getElementById(id).value || "").trim();
  return v === "" ? null : v;
}

async function salvarEdicao(event) {
  event.preventDefault();

  const id = Number(document.getElementById("editId").value);
  const msg = document.getElementById("editMsg");
  msg.textContent = "";

  if (!id) {
    msg.textContent = "ID inválido.";
    return;
  }

  // Monta payload (aqui enviamos tudo; vazio vira null -> limpa)
  const latRaw = (document.getElementById("editLat")?.value || "").trim();
  const lngRaw = (document.getElementById("editLng")?.value || "").trim();
  const cepRaw = (document.getElementById("editCep")?.value || "").replace(/\D/g, "");
  const payload = {
    nome: (document.getElementById("editNome").value || "").trim(),
    nome_fantasia: _valOrNull("editNomeFantasia"),
    cnpj: (document.getElementById("editCnpj")?.value || "").replace(/\D/g, "") || null,
    endereco: _valOrNull("editEndereco"),
    bairro: _valOrNull("editBairro"),
    cidade: _valOrNull("editCidade"),
    uf: _valOrNull("editUf"),
    cep: cepRaw === "" ? null : cepRaw,
    responsavel: _valOrNull("editResponsavel"),
    telefone: _valOrNull("editTelefone"),
    email: (document.getElementById("editEmail")?.value || "").trim().toLowerCase() || null,
    observacoes: _valOrNull("editObs"),
    zona: _valOrNull("editZona"),
    ativo: document.getElementById("editAtivo").checked,
    lat: latRaw === "" ? null : Number(latRaw),
    lng: lngRaw === "" ? null : Number(lngRaw),
  };

  if (!payload.nome) {
    msg.textContent = "Nome é obrigatório.";
    return;
  }

  try {
    msg.textContent = "Salvando...";

    const r = await fetch("/condominios/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      msg.textContent = data.error || ("Erro ao salvar (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Salvo com sucesso!";
    await carregarTudo();
    setTimeout(fecharModalEditar, 400);

  } catch (e) {
    msg.textContent = "Erro: " + e.message;
  }
}

 async function regenerarDeviceKeyReservatorio(reservatorioId) {
  if (!confirm("Tem certeza? O ESP antigo vai parar de enviar telemetria.")) return;

  const r = await fetch(
    `/reservatorios/${reservatorioId}/regenerar-device-key`,
    {
      method: "POST",
      headers: authHeaders()
    }
  );

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    alert(data.error || ("Erro (" + r.status + ")"));
    return;
  }

  mostrarDeviceKeyModal(data.reservatorio?.device_key || "-");

  carregarTudo(); // atualiza painel
}

function mostrarDeviceKeyModal(chave) {
  const overlay = document.getElementById("deviceKeyOverlay");
  const input   = document.getElementById("deviceKeyValue");
  const btnCopy = document.getElementById("btnCopiarDeviceKey");
  const msgCopy = document.getElementById("deviceKeyCopiadoMsg");

  input.value = chave;
  msgCopy.style.display = "none";
  btnCopy.textContent = "Copiar";
  overlay.style.display = "flex";

  document.getElementById("btnFecharDeviceKey").onclick = () => { overlay.style.display = "none"; };

  btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(chave);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    btnCopy.textContent = "Copiado!";
    msgCopy.style.display = "block";
  };
}

// ===== INATIVAR CONDOMÍNIO (soft delete) =====
async function inativarCondominio(id, nome) {
  if (!confirm(`Inativar "${nome}"?\n\nO condomínio e seus reservatórios serão desativados, mas os dados serão mantidos.`)) return;

  const r = await fetch(`/condominios/${id}`, { method: "DELETE", headers: authHeaders() });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    alert(data.error || `Erro ao inativar (${r.status})`);
    return;
  }

  carregarTudo();
}

// ===== EXCLUIR CONDOMÍNIO (hard delete com confirmação de senha) =====
let _hardDeleteId = null;

function excluirCondominio(id, nome) {
  _hardDeleteId = id;
  document.getElementById("hardDeleteMsg").textContent =
    `Você está prestes a excluir permanentemente o condomínio "${nome}" e todos os dados relacionados.`;
  document.getElementById("hardDeleteSenha").value = "";
  document.getElementById("hardDeleteErr").style.display = "none";
  document.getElementById("hardDeleteOverlay").style.display = "flex";
  setTimeout(() => document.getElementById("hardDeleteSenha").focus(), 80);
}

async function confirmarHardDelete() {
  const senha = document.getElementById("hardDeleteSenha").value;
  const errEl = document.getElementById("hardDeleteErr");
  errEl.style.display = "none";

  if (!senha) {
    errEl.textContent = "Digite sua senha para confirmar.";
    errEl.style.display = "block";
    return;
  }

  const btn = document.getElementById("btnConfirmarHardDelete");
  btn.disabled = true;
  btn.textContent = "Excluindo…";

  const r = await fetch(`/condominios/${_hardDeleteId}/hard`, {
    method: "DELETE",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ senha }),
  });
  const data = await r.json().catch(() => ({}));

  btn.disabled = false;
  btn.textContent = "Excluir permanentemente";

  if (!r.ok) {
    errEl.textContent = data.error || `Erro (${r.status})`;
    errEl.style.display = "block";
    return;
  }

  document.getElementById("hardDeleteOverlay").style.display = "none";
  _hardDeleteId = null;
  carregarTudo();
}

function fecharHardDelete() {
  document.getElementById("hardDeleteOverlay").style.display = "none";
  _hardDeleteId = null;
}

document.getElementById("btnConfirmarHardDelete").addEventListener("click", confirmarHardDelete);
document.getElementById("hardDeleteSenha").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarHardDelete();
});
document.getElementById("btnFecharHardDelete").addEventListener("click", fecharHardDelete);
document.getElementById("btnCancelarHardDelete").addEventListener("click", fecharHardDelete);
document.getElementById("hardDeleteOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("hardDeleteOverlay")) fecharHardDelete();
});

// ===== EXCLUIR RESERVATÓRIO =====
async function excluirReservatorio(id, nome) {
  if (!confirm(`Excluir reservatório "${nome}"?`)) return;

  const r = await fetch(`/reservatorios/${id}`, { method: "DELETE", headers: authHeaders() });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    alert(data.error || `Erro ao excluir (${r.status})`);
    return;
  }

  carregarTudo();
}

// ===== MODAL EDITAR RESERVATÓRIO =====
function abrirModalEditarReservatorio(id) {
  if (!id) return;

  const overlay = document.getElementById("editResOverlay");
  const msg = document.getElementById("editResMsg");
  const sub = document.getElementById("editResSub");

  msg.textContent = "Carregando...";
  sub.textContent = `ID: ${id}`;
  overlay.style.display = "flex";

  fetch(`/reservatorios/${id}`, { headers: authHeaders() })
    .then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
      return data;
    })
    .then(res => {
      document.getElementById("editResId").value = res.id;
      document.getElementById("editResNome").value = res.nome || "";
      document.getElementById("editResTipo").value = res.tipo || "outro";
      document.getElementById("editResAtivo").checked = res.ativo !== false;
      document.getElementById("editResAlturaTotalM").value = res.altura_total_m ?? "";
      document.getElementById("editResAdcZero").value = res.adc_zero ?? "";
      document.getElementById("editResAdcPorMetro").value = res.adc_por_metro ?? "";
      document.getElementById("editResFaixaSondaM").value = res.faixa_sonda_m ?? "";
      document.getElementById("editResLimiarBomba").value = res.limiar_bomba ?? "";
      msg.textContent = "";
      sub.textContent = `${res.nome || "Reservatório"} • ${res.device_id || ""} • ID: ${res.id}`;
    })
    .catch(e => { msg.textContent = "Erro: " + e.message; });
}

function fecharModalEditarReservatorio() {
  document.getElementById("editResOverlay").style.display = "none";
  document.getElementById("editResMsg").textContent = "";
}

async function salvarEdicaoReservatorio(event) {
  event.preventDefault();

  const id = Number(document.getElementById("editResId").value);
  const msg = document.getElementById("editResMsg");
  msg.textContent = "";

  if (!id) { msg.textContent = "ID inválido."; return; }

  const _editNumOrNull = (id) => { const v = document.getElementById(id)?.value; return v !== "" && v != null ? Number(v) : null; };

  const payload = {
    nome: (document.getElementById("editResNome").value || "").trim(),
    tipo: document.getElementById("editResTipo").value,
    ativo: document.getElementById("editResAtivo").checked,
    altura_total_m: _editNumOrNull("editResAlturaTotalM"),
    adc_zero: _editNumOrNull("editResAdcZero"),
    adc_por_metro: _editNumOrNull("editResAdcPorMetro"),
    faixa_sonda_m: _editNumOrNull("editResFaixaSondaM"),
    limiar_bomba: _editNumOrNull("editResLimiarBomba"),
  };

  if (!payload.nome) { msg.textContent = "Nome é obrigatório."; return; }

  try {
    msg.textContent = "Salvando...";

    const r = await fetch(`/reservatorios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      msg.textContent = data.error || `Erro ao salvar (${r.status})`;
      return;
    }

    msg.textContent = "✅ Salvo com sucesso!";
    await carregarTudo();
    setTimeout(fecharModalEditarReservatorio, 400);

  } catch (e) {
    msg.textContent = "Erro: " + e.message;
  }
}

// Fechar modal editar clicando fora
document.addEventListener("click", (e) => {
  const ov = document.getElementById("editOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModalEditar();
});

document.addEventListener("click", (e) => {
  const ov = document.getElementById("editResOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModalEditarReservatorio();
});

// ESC fecha modais
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    fecharModalEditar();
    fecharModalEditarReservatorio();
  }
});



// ============================================================
// CEP: auto-preenche endereço via ViaCEP
// ============================================================
function _cepMascarar(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return d.slice(0, 5) + "-" + d.slice(5);
}

async function buscarEnderecoPorCep(prefixo) {
  const input = document.getElementById(`${prefixo}Cep`);
  const msg = document.getElementById(`${prefixo}CepMsg`);
  if (!input) return;

  const cepLimpo = String(input.value || "").replace(/\D/g, "");
  if (cepLimpo.length !== 8) {
    if (msg) { msg.className = "cep-msg is-error"; msg.textContent = "CEP deve ter 8 dígitos."; }
    return;
  }

  if (msg) { msg.className = "cep-msg is-loading"; msg.textContent = "Buscando…"; }

  // 3 fontes em paralelo (qualquer falha individual não derruba o fluxo):
  //   ViaCEP      — texto granular (logradouro, bairro, cidade, UF)
  //   BrasilAPI v2 — pode trazer lat/lng (cobertura limitada)
  //   AwesomeAPI   — também traz lat/lng, com cobertura melhor pra CEPs urbanos
  // Preferência de coords: BrasilAPI → AwesomeAPI → fallback Nominatim
  const [viaPromise, brasilPromise, awesomePromise] = [
    fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => (d && !d.erro) ? d : null)
      .catch(() => null),
    fetch(`https://brasilapi.com.br/api/cep/v2/${cepLimpo}`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),
    fetch(`https://cep.awesomeapi.com.br/json/${cepLimpo}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => (d && !d.status) ? d : null) // status presente = erro
      .catch(() => null),
  ];

  const [viaData, brasilData, awesomeData] = await Promise.all([viaPromise, brasilPromise, awesomePromise]);

  if (!viaData && !brasilData && !awesomeData) {
    if (msg) { msg.className = "cep-msg is-error"; msg.textContent = "CEP não encontrado."; }
    return;
  }

  // Preenche campos texto preferindo ViaCEP (mais granular), com fallback no BrasilAPI.
  // NÃO usa data.complemento — é só faixa de numeração que confunde geocoding.
  const set = (id, valor) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = valor || "";
  };

  const logradouro = (viaData?.logradouro || brasilData?.street       || awesomeData?.address      || "").trim();
  const bairro     = (viaData?.bairro     || brasilData?.neighborhood || awesomeData?.district     || "").trim();
  const cidade     = (viaData?.localidade || brasilData?.city         || awesomeData?.city         || "").trim();
  const uf         = (viaData?.uf         || brasilData?.state        || awesomeData?.state        || "").trim();

  set(`${prefixo}Endereco`, logradouro);
  set(`${prefixo}Bairro`,   bairro);
  set(`${prefixo}Cidade`,   cidade);
  set(`${prefixo}Uf`,       uf);

  if (msg) {
    msg.className = "cep-msg is-ok";
    msg.textContent = `✓ ${logradouro}${bairro ? ", " + bairro : ""} — ${cidade}/${uf}`;
  }

  // Caminho preferido: alguma API CEP veio com coordenadas → posiciona o pino direto.
  // Muito mais preciso que Nominatim adivinhar pelo nome da rua.
  // Tenta BrasilAPI primeiro (location.coordinates), depois AwesomeAPI (lat/lng).
  const coordsBrasil = brasilData?.location?.coordinates;
  const fontes = [
    { fonte: "BrasilAPI",  lat: coordsBrasil?.latitude,  lng: coordsBrasil?.longitude  },
    { fonte: "AwesomeAPI", lat: awesomeData?.lat,        lng: awesomeData?.lng         },
  ];
  const escolhida = fontes.find(f =>
    f.lat != null && f.lng != null &&
    Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng))
  );

  const locMsg = document.getElementById(`${prefixo}LocMsg`);

  if (escolhida) {
    _miniMapaAplicarCoord(prefixo, Number(escolhida.lat), Number(escolhida.lng));
    if (locMsg) {
      locMsg.className = "loc-msg is-ok";
      locMsg.textContent = "✓ Pino posicionado pelo CEP. Arraste se precisar ajustar o número da casa.";
    }
    return;
  }

  // Nenhuma API trouxe coords (CEP genérico, etc) → cai pro Nominatim com structured search
  if (logradouro || bairro) {
    buscarCoordenadasPorEndereco(prefixo);
  }
}

function _bindCepInput(prefixo) {
  const input = document.getElementById(`${prefixo}Cep`);
  if (!input || input.dataset.cepBound) return;
  input.dataset.cepBound = "1";

  input.addEventListener("input", () => {
    const masked = _cepMascarar(input.value);
    if (input.value !== masked) input.value = masked;

    // dispara busca automática ao completar 8 dígitos
    if (masked.replace(/\D/g, "").length === 8) {
      buscarEnderecoPorCep(prefixo);
    }
  });
}

// ============================================================
// MINI-MAPA (cadastro e edição de condomínio)
// ============================================================
const SP_CENTRO = { lat: -23.5505, lng: -46.6333, zoom: 12 };
const _miniMapas = new Map(); // prefixo → { map, marker, tileLayer }

function _miniMapaCriarPino() {
  return L.divIcon({
    className: "tg-pin-wrap",
    html: `<div class="tg-pin"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
  });
}

function criarOuObterMiniMapa(prefixo) {
  if (typeof L === "undefined") return null;
  if (_miniMapas.has(prefixo)) return _miniMapas.get(prefixo);

  const el = document.getElementById(`${prefixo}MiniMapa`);
  if (!el) return null;

  const lat = Number(document.getElementById(`${prefixo}Lat`)?.value) || SP_CENTRO.lat;
  const lng = Number(document.getElementById(`${prefixo}Lng`)?.value) || SP_CENTRO.lng;
  const temCoord = Boolean(Number(document.getElementById(`${prefixo}Lat`)?.value) && Number(document.getElementById(`${prefixo}Lng`)?.value));

  const map = L.map(el, {
    center: [lat, lng],
    zoom: temCoord ? 16 : SP_CENTRO.zoom,
    zoomControl: true,
    attributionControl: true,
    // Desativa animação CSS de zoom — evita que os tiles sumam (cinza) durante
    // a transição quando o container tem overflow:hidden ou parent transforms.
    zoomAnimation: false,
  });

  // Mesma estratégia de fallback do mapa principal: tenta Carto dark, cai
  // pro OSM padrão se falhar (caso o navegador/rede bloqueie o Carto).
  _criarTileLayer(map);

  const marker = L.marker([lat, lng], {
    draggable: true,
    icon: _miniMapaCriarPino(),
  }).addTo(map);

  marker.on("dragend", () => {
    const ll = marker.getLatLng();
    _miniMapaAplicarCoord(prefixo, ll.lat, ll.lng, { centralizar: false });
    _miniMapaReverseGeocode(prefixo, ll.lat, ll.lng);
  });

  // Sync campos lat/lng → marker
  const inLat = document.getElementById(`${prefixo}Lat`);
  const inLng = document.getElementById(`${prefixo}Lng`);
  const onInputCoord = () => {
    const la = Number(inLat.value);
    const ln = Number(inLng.value);
    if (Number.isFinite(la) && Number.isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180) {
      marker.setLatLng([la, ln]);
      map.panTo([la, ln]);
    }
  };
  inLat?.addEventListener("change", onInputCoord);
  inLng?.addEventListener("change", onInputCoord);

  const ref = { map, marker };
  _miniMapas.set(prefixo, ref);
  return ref;
}

function _miniMapaAplicarCoord(prefixo, lat, lng, { centralizar = true } = {}) {
  const ref = _miniMapas.get(prefixo);
  const inLat = document.getElementById(`${prefixo}Lat`);
  const inLng = document.getElementById(`${prefixo}Lng`);
  if (inLat) inLat.value = lat.toFixed(6);
  if (inLng) inLng.value = lng.toFixed(6);
  if (ref) {
    ref.marker.setLatLng([lat, lng]);
    if (centralizar) ref.map.setView([lat, lng], 17);
  }
}

function _miniMapaInvalidar(prefixo) {
  const ref = _miniMapas.get(prefixo);
  if (!ref) return;
  // Delay > animação sectionIn (220ms) para medir o container já estabilizado
  setTimeout(() => ref.map.invalidateSize(), 260);
}

// Quando o user arrasta o pino, descobre o endereço daquele ponto e atualiza
// os campos do formulário. Mantém um "request id" por prefixo: se o user
// arrastar várias vezes rápido, só a resposta do último request é aplicada.
const _reverseSeq = new Map(); // prefixo → último seq disparado

async function _miniMapaReverseGeocode(prefixo, lat, lng) {
  const seq = (_reverseSeq.get(prefixo) || 0) + 1;
  _reverseSeq.set(prefixo, seq);

  const msg = document.getElementById(`${prefixo}LocMsg`);
  if (msg) {
    msg.className = "loc-msg";
    msg.textContent = "Lendo o endereço desse ponto…";
  }

  let data;
  try {
    const resp = await fetch(`/admin/reverse-geocode?lat=${lat}&lon=${lng}`, { headers: authHeaders() });
    data = await resp.json();
    if (!resp.ok) {
      if (msg && seq === _reverseSeq.get(prefixo)) {
        msg.className = "loc-msg is-error";
        msg.textContent = data?.error || "Não consegui ler o endereço desse ponto.";
      }
      return;
    }
  } catch (e) {
    if (msg && seq === _reverseSeq.get(prefixo)) {
      msg.className = "loc-msg is-error";
      msg.textContent = "Erro: " + e.message;
    }
    return;
  }

  // Resposta obsoleta (user arrastou de novo enquanto a primeira não voltou)
  if (seq !== _reverseSeq.get(prefixo)) return;

  const a = data.address || {};
  const endereco = a.road || a.pedestrian || a.footway || a.cycleway || a.path || "";
  const bairro   = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.district || "";
  const cidade   = a.city || a.town || a.municipality || a.village || "";
  // ISO3166-2-lvl4 vem como "BR-SP" — extrai só a UF; fallback no a.state se não tiver.
  const ufIso    = a["ISO3166-2-lvl4"] || "";
  const uf       = ufIso.startsWith("BR-") ? ufIso.slice(3) : (a.state || "");
  const cep      = (a.postcode || "").replace(/\D/g, "");

  // Atualiza os campos do formulário com o resultado do reverse geocoding.
  // Campos só são sobrescritos quando o Nominatim retorna valor — vazio mantém o atual.
  const aplicar = (id, valor) => {
    const el = document.getElementById(id);
    if (!el || !valor) return;
    el.value = valor;
  };

  aplicar(`${prefixo}Endereco`, endereco);
  aplicar(`${prefixo}Bairro`,   bairro);
  aplicar(`${prefixo}Cidade`,   cidade);
  aplicar(`${prefixo}Uf`,       uf);
  if (cep) {
    const cepEl = document.getElementById(`${prefixo}Cep`);
    if (cepEl) cepEl.value = _cepMascarar(cep);
  }

  if (msg) {
    if (endereco || bairro) {
      msg.className = "loc-msg is-ok";
      const partes = [endereco, bairro, cidade && `${cidade}/${uf || "?"}`].filter(Boolean);
      msg.textContent = "✓ Endereço atualizado: " + partes.join(", ");
    } else {
      msg.className = "loc-msg";
      msg.textContent = "⚠ Pino fora de uma rua mapeada — confirme os campos manualmente.";
    }
  }
}

function _semAcento(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function _resultadoNaCidade(r, cidadeAlvo) {
  if (!cidadeAlvo) return true;
  const alvo = _semAcento(cidadeAlvo);
  const a = r.address || {};
  // Match estrito no address — sem fallback no display_name, que pega "São Paulo"
  // do estado e deixa passar endereços de outras cidades paulistas.
  const cs = [a.city, a.town, a.municipality, a.village, a.county].filter(Boolean).map(_semAcento);
  if (cs.length === 0) return true; // sem address detalhado, dá benefício da dúvida
  return cs.some(c => c === alvo);
}

function _resultadoNoBairro(r, bairroAlvo) {
  if (!bairroAlvo) return false;
  const alvo = _semAcento(bairroAlvo);
  const a = r.address || {};
  const bs = [a.suburb, a.neighbourhood, a.quarter, a.city_district, a.district].filter(Boolean).map(_semAcento);
  if (bs.some(b => b === alvo)) return true;
  return _semAcento(r.display_name || "").includes(alvo);
}

function _resultadoNoCep(r, cepAlvo) {
  // Bate prefixo de 5 dígitos (área CEP) — se o resultado não traz postcode, retorna null
  // (decisão de manter ou descartar fica com o caller).
  if (!cepAlvo) return null;
  const alvo = String(cepAlvo).replace(/\D/g, "").slice(0, 5);
  if (alvo.length !== 5) return null;
  const pc = String(r.address?.postcode || "").replace(/\D/g, "");
  if (!pc) return null;
  return pc.slice(0, 5) === alvo;
}

async function buscarCoordenadasPorEndereco(prefixo) {
  const endereco = (document.getElementById(`${prefixo}Endereco`)?.value || "").trim();
  const bairro   = (document.getElementById(`${prefixo}Bairro`)?.value   || "").trim();
  const cidade   = (document.getElementById(`${prefixo}Cidade`)?.value   || "").trim();
  const uf       = (document.getElementById(`${prefixo}Uf`)?.value       || "").trim();
  const cep      = (document.getElementById(`${prefixo}Cep`)?.value      || "").replace(/\D/g, "");

  const msg = document.getElementById(`${prefixo}LocMsg`);
  if (msg) { msg.className = "loc-msg"; msg.textContent = ""; }

  if (!endereco && !bairro && !cidade && !cep) {
    if (msg) { msg.className = "loc-msg is-error"; msg.textContent = "Preencha endereço, bairro, cidade ou CEP primeiro."; }
    return;
  }

  // Structured search progressivo, do mais específico ao mais amplo.
  // CEP é a âncora geográfica mais forte — sempre que tiver, vai junto.
  // bairro NÃO entra em "street" (deve ser só logradouro) para não confundir o Nominatim.
  // A tentativa "bairro" usa busca livre (q) porque o Nominatim não aceita bairro em structured search.
  const queryBairro = [bairro, cidade, uf].filter(Boolean).join(", ");
  const tentativas = [
    { params: { street: endereco, city: cidade, state: uf, postalcode: cep }, nivel: "endereço+CEP",   isFallback: false },
    { params: { street: endereco, city: cidade, state: uf },                  nivel: "endereço",       isFallback: false },
    { params: {                   city: cidade, state: uf, postalcode: cep }, nivel: "CEP+cidade",     isFallback: true  },
    { params: { q: queryBairro },                                             nivel: "bairro",         isFallback: true  },
    { params: {                   city: cidade, state: uf },                  nivel: "cidade",         isFallback: true  },
  ].filter(t => {
    if (t.params.q !== undefined) return Boolean(bairro) && Boolean(cidade);
    return Object.values(t.params).some(v => v && String(v).trim());
  });

  // Remove duplicatas (params iguais)
  const vistos = new Set();
  const filas = tentativas.filter(t => {
    const key = JSON.stringify(t.params);
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });

  for (let i = 0; i < filas.length; i++) {
    const t = filas[i];
    if (msg) {
      msg.className = "loc-msg";
      msg.textContent = i === 0 ? "Buscando…" : `Não achei pelo ${filas[i-1].nivel}, tentando pelo ${t.nivel}…`;
    }

    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(t.params)) {
      if (v && String(v).trim()) sp.set(k, String(v).trim());
    }

    let data;
    try {
      const resp = await fetch(`/admin/geocode?${sp}`, { headers: authHeaders() });
      data = await resp.json();
      if (!resp.ok) {
        if (msg) { msg.className = "loc-msg is-error"; msg.textContent = data.error || "Erro na busca."; }
        return;
      }
    } catch (e) {
      if (msg) { msg.className = "loc-msg is-error"; msg.textContent = "Erro: " + e.message; }
      return;
    }

    let results = Array.isArray(data.results) ? data.results : [];

    // Filtra resultados que estão na cidade certa
    if (cidade) {
      const naCidade = results.filter(r => _resultadoNaCidade(r, cidade));
      if (naCidade.length > 0) results = naCidade;
      else results = []; // sem nenhum na cidade, descarta — não vale chutar endereço de outra cidade
    }

    // Filtro estrito por CEP: se o user tem CEP e a tentativa não é a aproximação por bairro,
    // descarta resultados cujo postcode bate negativamente (ex: Nominatim retornou rua homônima
    // em outro bairro/CEP). Resultados sem postcode são mantidos (benefício da dúvida).
    if (cep && t.nivel !== "bairro" && results.length > 0) {
      const baterCep = results.map(r => ({ r, bate: _resultadoNoCep(r, cep) }));
      const positivos = baterCep.filter(x => x.bate === true).map(x => x.r);
      if (positivos.length > 0) {
        results = positivos;
      } else {
        // ninguém bate positivamente; remove só os que batem negativamente
        results = baterCep.filter(x => x.bate !== false).map(x => x.r);
      }
    }

    if (results.length === 0) continue;

    const avisoFallback = t.isFallback ? ` (aproximação pelo ${t.nivel} — arraste o pino até o local exato)` : ". Confirme arrastando se necessário.";

    // Se temos bairro e algum resultado bate exatamente com ele, posiciona direto
    // (evita mostrar lista quando o "correto" é óbvio)
    if (bairro && results.length > 1) {
      const noBairro = results.filter(r => _resultadoNoBairro(r, bairro));
      if (noBairro.length === 1) {
        _miniMapaAplicarCoord(prefixo, noBairro[0].lat, noBairro[0].lon);
        if (msg) {
          msg.className = t.isFallback ? "loc-msg" : "loc-msg is-ok";
          msg.textContent = `✓ Pino posicionado no bairro ${bairro}${avisoFallback}`;
        }
        return;
      }
      if (noBairro.length > 1) {
        results = noBairro; // reduz a lista aos do bairro certo
      }
    }

    if (results.length === 1) {
      const r = results[0];
      _miniMapaAplicarCoord(prefixo, r.lat, r.lon);
      if (msg) {
        // Quando o Nominatim só achou o limite administrativo da cidade (sem rua),
        // o pino cai no centroide do município — explicita isso pra evitar mal-entendido.
        const ehSoMunicipio = r.address?.municipality && !r.address?.road && !r.address?.suburb && !r.address?.neighbourhood;
        if (ehSoMunicipio) {
          msg.className = "loc-msg";
          msg.textContent = `⚠ Não achei a rua exata no mapa. Pino colocado no centro de ${r.address.municipality} — arraste até o endereço correto.`;
        } else {
          msg.className = t.isFallback ? "loc-msg" : "loc-msg is-ok";
          msg.textContent = `✓ Pino posicionado${avisoFallback}`;
        }
      }
      return;
    }

    if (msg) {
      msg.className = "loc-msg";
      const titulo = t.isFallback
        ? `Não achei o endereço exato — ${results.length} opções pelo ${t.nivel}:`
        : `${results.length} resultados na mesma cidade — escolha:`;
      msg.innerHTML = `<div style="margin-bottom:6px;">${titulo}</div>`;
      const list = document.createElement("div");
      list.className = "loc-suggestions";
      results.forEach((r) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "loc-sugg-item";
        btn.textContent = r.display_name;
        btn.addEventListener("click", () => {
          _miniMapaAplicarCoord(prefixo, r.lat, r.lon);
          msg.className = "loc-msg is-ok";
          msg.textContent = "✓ Pino posicionado em: " + r.display_name;
        });
        list.appendChild(btn);
      });
      msg.appendChild(list);
    }
    return;
  }

  if (msg) {
    msg.className = "loc-msg is-error";
    msg.textContent = "Nenhum resultado encontrado em " + (cidade || "nenhuma cidade") + ". Cole as coordenadas do Google Maps ou arraste o pino manualmente.";
  }
}

// ============================================================
// SEÇÃO MAPA (Fase 3B.2) — Leaflet principal + painel lateral com tabs
// ============================================================
let _mpMap = null;
let _mpMarkers = new Map(); // condoId → L.Marker
let _mpCondoSelecionadoId = null;
let _mpTabAtiva = "visao";
let _mpZonaChart   = null;
// Praça da Sé como referência para os quadrantes (fallback)
const _MP_SE = { lat: -23.5505, lng: -46.6333 };

// Mapeamento oficial de bairros de SP → zona. A divisão real da prefeitura
// não é simétrica: a Zona Sul cobre um pedaço gigante a sudoeste (Capão
// Redondo, M'Boi Mirim, Jardim Ângela), então quadrante puro por lat/lng erra.
// Bairros aqui ditam a zona; se o bairro não estiver na lista (ou não
// preenchido), cai no fallback geográfico mais abaixo.
const _MP_BAIRROS_ZONA = {
  // Centro
  "se": "Centro", "republica": "Centro", "liberdade": "Centro",
  "bela vista": "Centro", "consolacao": "Centro", "santa cecilia": "Centro",
  "cambuci": "Centro", "bom retiro": "Centro",

  // Zona Norte
  "santana": "Zona Norte", "tucuruvi": "Zona Norte", "tremembe": "Zona Norte",
  "jacana": "Zona Norte", "vila guilherme": "Zona Norte", "vila maria": "Zona Norte",
  "casa verde": "Zona Norte", "limao": "Zona Norte", "freguesia do o": "Zona Norte",
  "pirituba": "Zona Norte", "jaragua": "Zona Norte", "perus": "Zona Norte",
  "brasilandia": "Zona Norte", "mandaqui": "Zona Norte", "cachoeirinha": "Zona Norte",
  "vila nova cachoeirinha": "Zona Norte", "vila medeiros": "Zona Norte",

  // Zona Sul (inclui o sudoeste todo)
  "vila mariana": "Zona Sul", "saude": "Zona Sul", "ipiranga": "Zona Sul",
  "jabaquara": "Zona Sul", "santo amaro": "Zona Sul", "brooklin": "Zona Sul",
  "campo belo": "Zona Sul", "moema": "Zona Sul", "vila olimpia": "Zona Sul",
  "campo limpo": "Zona Sul", "capao redondo": "Zona Sul", "jardim sao luis": "Zona Sul",
  "jardim angela": "Zona Sul", "mboi mirim": "Zona Sul", "m'boi mirim": "Zona Sul",
  "cidade ademar": "Zona Sul", "pedreira": "Zona Sul", "cidade dutra": "Zona Sul",
  "socorro": "Zona Sul", "capela do socorro": "Zona Sul", "grajau": "Zona Sul",
  "parelheiros": "Zona Sul", "marsilac": "Zona Sul", "interlagos": "Zona Sul",
  "morumbi": "Zona Sul", "vila andrade": "Zona Sul", "real parque": "Zona Sul",
  "veleiros": "Zona Sul", "americanopolis": "Zona Sul",

  // Zona Leste
  "mooca": "Zona Leste", "tatuape": "Zona Leste", "penha": "Zona Leste",
  "belem": "Zona Leste", "bras": "Zona Leste", "itaquera": "Zona Leste",
  "sao miguel": "Zona Leste", "itaim paulista": "Zona Leste",
  "cidade tiradentes": "Zona Leste", "vila prudente": "Zona Leste",
  "aricanduva": "Zona Leste", "vila formosa": "Zona Leste", "vila carrao": "Zona Leste",
  "ermelino matarazzo": "Zona Leste", "guaianases": "Zona Leste",
  "sao mateus": "Zona Leste", "sapopemba": "Zona Leste", "cangaiba": "Zona Leste",
  "vila matilde": "Zona Leste", "artur alvim": "Zona Leste", "carrao": "Zona Leste",

  // Zona Oeste (relativamente pequena)
  "butanta": "Zona Oeste", "pinheiros": "Zona Oeste", "lapa": "Zona Oeste",
  "vila madalena": "Zona Oeste", "perdizes": "Zona Oeste", "pompeia": "Zona Oeste",
  "barra funda": "Zona Oeste", "alto de pinheiros": "Zona Oeste",
  "itaim bibi": "Zona Oeste", "vila leopoldina": "Zona Oeste",
  "jaguare": "Zona Oeste", "rio pequeno": "Zona Oeste",
  "raposo tavares": "Zona Oeste", "vila sonia": "Zona Oeste",
  "jardim paulista": "Zona Oeste", "jardins": "Zona Oeste",
};

// Tira acento, baixa caixa e normaliza espaços pra match estável
function _mpNormalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

function _mpZonaPara(c) {
  // 1) Bairro tem prioridade — divisão oficial de SP não é simétrica
  const bairroNorm = _mpNormalizar(c.bairro);
  if (bairroNorm && _MP_BAIRROS_ZONA[bairroNorm]) {
    return _MP_BAIRROS_ZONA[bairroNorm];
  }

  // 2) Fallback geográfico: quadrante a partir da Sé
  if (c.lat == null || c.lng == null) return "Sem coordenada";
  const dLat = c.lat - _MP_SE.lat;
  const dLng = c.lng - _MP_SE.lng;
  const distKm = Math.sqrt((dLat * 111) ** 2 + (dLng * 102) ** 2);
  if (distKm <= 3) return "Centro";
  // Zona Sul abrange tudo bem ao sul, mesmo deslocado pra oeste
  // (heurística: se está mais de 8km ao sul, é Sul independente da longitude)
  if (dLat < -0.072) return "Zona Sul"; // ~8km ao sul
  if (dLat > 0.072)  return "Zona Norte";
  return dLng > 0 ? "Zona Leste" : "Zona Oeste";
}

function _mpRelTime(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function _mpPctClasse(pct) {
  if (pct == null) return "";
  if (pct < 30) return "lo";
  if (pct < 60) return "mid";
  return "hi";
}

function _mpEndereco(c) {
  const partes = [c.endereco, c.bairro, c.cidade && `${c.cidade}/${c.uf || "?"}`].filter(Boolean);
  return partes.length ? partes.join(", ") : "Endereço não cadastrado";
}

function _mpStatusLabel(kind) {
  return kind === "bad" ? "Crítico" : kind === "warn" ? "Alerta" : "OK";
}

// --- KPIs do topo ---
function _mpAtualizarKpis() {
  const groups = Array.isArray(_statusData) ? _statusData : [];
  let total = 0, online = 0, critico = 0, offline = 0;
  for (const g of groups) {
    total += 1;
    const off = g.resumo?.offline_count ?? 0;
    const al  = g.resumo?.alertas_abertos_total ?? 0;
    const totR = g.resumo?.total_reservatorios ?? 0;
    if (totR > 0 && off === totR) offline += 1;
    else if (off > 0 || al > 0) critico += 1;
    else online += 1;
  }
  document.getElementById("mpKpiTotal")  && (document.getElementById("mpKpiTotal").textContent   = total);
  document.getElementById("mpKpiOnline") && (document.getElementById("mpKpiOnline").textContent  = online);
  document.getElementById("mpKpiCritico")&& (document.getElementById("mpKpiCritico").textContent = critico);
  document.getElementById("mpKpiOffline")&& (document.getElementById("mpKpiOffline").textContent = offline);
}

// --- Mapa principal Leaflet ---
// Detecta quando o container ganha dimensões reais (a seção foi exibida)
// e chama o callback uma vez. Robusto contra mudanças de display:none → block.
function _esperarDimensao(el, cb) {
  if (!el) return;
  if (el.clientWidth > 0 && el.clientHeight > 0) { cb(); return; }
  if (el._roEsperando) return;
  el._roEsperando = true;
  const ro = new ResizeObserver(() => {
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      ro.disconnect();
      el._roEsperando = false;
      cb();
    }
  });
  ro.observe(el);
}

function _mpAtualizarMapa() {
  const el = document.getElementById("mpMapCanvas");
  if (!el || typeof L === "undefined") return;

  // Só inicializa quando o container realmente tem dimensão visível —
  // se criasse com width/height 0 (seção display:none), os tiles do Carto
  // não baixariam e o mapa ficaria em branco depois da seção aparecer.
  if (!_mpMap) {
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      // Agenda criação automática assim que o container ganhar dimensão
      _esperarDimensao(el, () => _mpAtualizarMapa());
      return;
    }
    _mpMap = L.map(el, {
      center: [SP_CENTRO.lat, SP_CENTRO.lng],
      zoom: SP_CENTRO.zoom,
      zoomControl: true,
      attributionControl: false,
    });
    _criarTileLayer(_mpMap, () => {
      const ld = document.getElementById("mpMapLoading");
      if (ld) ld.classList.add("hidden");
    });
    // Garante que os tiles renderizem corretamente após inserção tardia
    requestAnimationFrame(() => _mpMap.invalidateSize());
  }

  const groups = Array.isArray(_statusData) ? _statusData : [];
  const idsAgora = new Set();
  const bounds = [];

  for (const g of groups) {
    const c = g.condominio || {};
    if (!c.id || c.lat == null || c.lng == null) continue;
    idsAgora.add(c.id);
    const kind = _mcStatusKind(g);
    const tooltip = `${c.nome || "Condomínio"} • ${_mpStatusLabel(kind)}`;
    let marker = _mpMarkers.get(c.id);
    if (!marker) {
      marker = L.marker([c.lat, c.lng], { icon: _mcPinIcon(kind) }).addTo(_mpMap);
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -8] });
      marker.on("click", () => {
        _mpCondoSelecionadoId = c.id;
        _mpAtualizarPainel();
        // Em fullscreen, garante que o painel flutuante apareça
        if (document.getElementById("mpMapCard")?.classList.contains("is-fullscreen")) {
          _mpFsPanelMostrar();
        }
      });
      _mpMarkers.set(c.id, marker);
    } else {
      marker.setLatLng([c.lat, c.lng]);
      marker.setIcon(_mcPinIcon(kind));
      marker.setTooltipContent(tooltip);
    }
    bounds.push([c.lat, c.lng]);
  }

  for (const [id, marker] of _mpMarkers) {
    if (!idsAgora.has(id)) {
      _mpMap.removeLayer(marker);
      _mpMarkers.delete(id);
    }
  }

  if (bounds.length > 0 && !_mpMap._fitAplicado) {
    _mpMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    _mpMap._fitAplicado = true;
  }

  // Renderiza técnicos sempre que o mapa atualiza condomínios
  _mpRenderTecnicos();
}

// --- Técnicos no mapa (Fase 7F) ---
function _tecIconeIniciais(nome) {
  return (nome || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || "")
    .join("") || "?";
}
function _tecPinIcon(iniciais, stale = false) {
  return L.divIcon({
    className: "tec-pin-leaflet",
    html: `<div class="tec-pin${stale ? " is-stale" : ""}"><span>${iniciais}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}
function _tecStale(capturadaEm) {
  if (!capturadaEm) return true;
  // 10 min — plugin de background no Android pode demorar entre callbacks
  // devido à otimização de bateria dos fabricantes.
  return (Date.now() - new Date(capturadaEm).getTime()) > 10 * 60 * 1000;
}
function _tempoRelativo(iso) {
  if (!iso) return "—";
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffSec < 60)    return "agora";
  if (diffSec < 3600)  return `há ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)} h`;
  return `há ${Math.floor(diffSec / 86400)} dias`;
}

function _mpRenderTecnicos() {
  if (!_mpMap) return;
  const lista = Array.isArray(_tecLocs) ? _tecLocs : [];
  const idsAgora = new Set();

  for (const t of lista) {
    const lat = Number(t.lat), lng = Number(t.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    idsAgora.add(t.tecnico_id);

    const iniciais = _tecIconeIniciais(t.nome);
    const stale = _tecStale(t.capturada_em);
    let marker = _mpTecMarkers.get(t.tecnico_id);
    if (!marker) {
      marker = L.marker([lat, lng], { icon: _tecPinIcon(iniciais, stale), zIndexOffset: 1000 }).addTo(_mpMap);
      _mpTecMarkers.set(t.tecnico_id, marker);
    } else {
      marker.setLatLng([lat, lng]);
      marker.setIcon(_tecPinIcon(iniciais, stale));
    }

    // Popup com dados (re-bind sempre porque última atualização muda)
    const condId = t.chamado_condominio_id;
    const condGroup = condId ? (Array.isArray(_statusData) ? _statusData : [])
      .find(g => g.condominio?.id === condId) : null;
    const condNome = condGroup?.condominio?.nome || (condId ? `Condomínio #${condId}` : "");
    const popupHtml = `
      <div style="font-size:12px;line-height:1.5;min-width:200px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#1a1f2e;">
          ${(t.nome || "Técnico")}${t.especialidade ? ` <span style="color:#6b7280;font-weight:400;">· ${t.especialidade}</span>` : ""}
        </div>
        ${t.chamado_em_atendimento_id ? `
          <div style="color:#1f2937;margin-top:6px;">
            <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10.5px;font-weight:700;">EM ATENDIMENTO</span>
          </div>
          <div style="color:#374151;margin-top:4px;">Chamado #${t.chamado_em_atendimento_id}${condNome ? ` · ${condNome}` : ""}</div>
          ${condId ? `<a href="#" data-action="ver-condo" data-id="${condId}" style="display:inline-block;margin-top:6px;color:#2563eb;font-weight:600;text-decoration:none;">Ver no painel →</a>` : ""}
        ` : `
          <div style="color:#6b7280;margin-top:4px;">Sem chamado em atendimento</div>
        `}
        ${stale ? `<div style="color:#ef4444;font-size:11px;font-weight:600;margin-top:6px;">⚠ Sem sinal — última atualização ${_tempoRelativo(t.capturada_em)}</div>` : `
        <div style="color:#9ca3af;font-size:10.5px;margin-top:6px;">
          Última atualização ${_tempoRelativo(t.capturada_em)}
          ${t.bateria_pct != null ? ` · 🔋 ${t.bateria_pct}%` : ""}
          ${t.precisao_m != null ? ` · precisão ~${t.precisao_m < 1000 ? Math.round(t.precisao_m)+"m" : (t.precisao_m/1000).toFixed(1)+"km"}` : ""}
        </div>`}
      </div>`;
    marker.bindPopup(popupHtml);

    if (!marker._gbHandlerInstalled) {
      marker.on("popupopen", (ev) => {
        const link = ev.popup.getElement()?.querySelector('[data-action="ver-condo"]');
        if (!link) return;
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const cid = Number(link.dataset.id);
          if (cid) {
            _mpCondoSelecionadoId = cid;
            _mpAtualizarPainel();
            marker.closePopup();
          }
        });
      });
      marker._gbHandlerInstalled = true;
    }
  }

  // Remove técnicos que sumiram da resposta
  for (const [tid, marker] of _mpTecMarkers) {
    if (!idsAgora.has(tid)) {
      _mpMap.removeLayer(marker);
      _mpTecMarkers.delete(tid);
    }
  }
}

// --- Painel lateral ---
function _mpAtualizarPainel() {
  const groups = Array.isArray(_statusData) ? _statusData : [];
  const g = groups.find(x => x.condominio?.id === _mpCondoSelecionadoId);
  const nomeEl = document.getElementById("mpCondoNome");
  const subEl  = document.getElementById("mpCondoEndereco");
  const btn    = document.getElementById("mpBtnAbrirPainel");
  const body   = document.getElementById("mpTabBody");

  if (!g) {
    if (nomeEl) nomeEl.textContent = "Selecione um condomínio";
    if (subEl)  subEl.textContent  = "Clique em um pino no mapa para ver detalhes";
    if (btn)    btn.style.display  = "none";
    if (body)   body.innerHTML     = `<div class="mp-empty">Nenhum condomínio selecionado.</div>`;
    return;
  }

  const c = g.condominio || {};
  if (nomeEl) nomeEl.textContent = c.nome || "Condomínio";
  if (subEl)  subEl.textContent  = _mpEndereco(c);
  if (btn)    btn.style.display  = "";

  if (!body) return;
  if (_mpTabAtiva === "visao")          body.innerHTML = _mpRenderVisaoGeral(g);
  else if (_mpTabAtiva === "reservatorios") body.innerHTML = _mpRenderReservatorios(g);
  else if (_mpTabAtiva === "bombas")    body.innerHTML = _mpRenderBombas(g);
  else if (_mpTabAtiva === "alertas")   body.innerHTML = _mpRenderAlertas(g);
  else if (_mpTabAtiva === "chamados")  body.innerHTML = _mpRenderChamados(g);
}

function _mpRenderVisaoGeral(g) {
  const reservas = g.reservatorios || [];
  // Nível médio (ignora reservatórios sem leitura)
  const comNivel = reservas.filter(r => r.ultima_leitura?.nivel_pct != null);
  const nivelMedio = comNivel.length
    ? Math.round(comNivel.reduce((s, r) => s + Number(r.ultima_leitura.nivel_pct), 0) / comNivel.length)
    : null;
  const cls = _mpPctClasse(nivelMedio);
  const bombasAtivas = reservas.filter(r => r.ultima_leitura?.bomba_ligada).length;
  const alertasCount = g.resumo?.alertas_abertos_total ?? 0;

  // Alertas do condomínio (filtra _alertasAbertos pelos device_ids do condo)
  const deviceIds = new Set(reservas.map(r => r.device_id));
  const alertasCondo = (_alertasAbertos || []).filter(a => deviceIds.has(a.device_id)).slice(0, 5);

  const gaugeHtml = nivelMedio == null
    ? `<div class="mp-vg-gauge-value" style="color:var(--muted)">—</div><div class="mp-vg-gauge-label">Sem leituras</div>`
    : `
      <div class="mp-vg-gauge-label">Nível médio dos reservatórios</div>
      <div class="mp-vg-gauge-value ${cls}">${nivelMedio}%</div>
      <div class="mp-vg-bar"><div class="mp-vg-bar-fill ${cls}" style="width:${nivelMedio}%"></div></div>`;

  const alertasHtml = alertasCondo.length === 0
    ? `<div class="mp-empty" style="height:auto;padding:14px 0;">Nenhum alerta aberto.</div>`
    : `<div class="mp-list">
        ${alertasCondo.map(a => {
          const tipo = String(a.tipo || "").replaceAll("_", " ");
          const kind = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn";
          return `
            <div class="mp-list-item">
              <span class="mli-dot ${kind}"></span>
              <div class="mli-main">
                <div class="mli-title">${tipo}</div>
                <div class="mli-sub">${a.device_id || ""} ${a.mensagem ? "• " + a.mensagem : ""}</div>
              </div>
              <span class="mli-right">${_mpRelTime(a.criado_em)}</span>
            </div>`;
        }).join("")}
      </div>`;

  return `
    <div class="mp-vg-gauge">${gaugeHtml}</div>
    <div class="mp-vg-stats">
      <div class="mp-vg-stat"><span class="mp-vg-stat-label">Reservatórios</span><span class="mp-vg-stat-value">${reservas.length}</span></div>
      <div class="mp-vg-stat"><span class="mp-vg-stat-label">Bombas Ativas</span><span class="mp-vg-stat-value">${bombasAtivas}</span></div>
      <div class="mp-vg-stat"><span class="mp-vg-stat-label">Alertas</span><span class="mp-vg-stat-value">${alertasCount}</span></div>
    </div>
    <div class="mp-vg-section-title">Alertas recentes</div>
    ${alertasHtml}`;
}

function _mpRenderReservatorios(g) {
  const reservas = g.reservatorios || [];
  if (reservas.length === 0) return `<div class="mp-empty">Nenhum reservatório cadastrado.</div>`;
  return `<div class="mp-list">${reservas.map(r => {
    const pct = r.ultima_leitura?.nivel_pct;
    const pctCls = _mpPctClasse(pct);
    const dot = r.offline ? "off" : (pct != null && pct < 30 ? "bad" : pct != null && pct < 60 ? "warn" : "ok");
    return `
      <div class="mp-list-item">
        <span class="mli-dot ${dot}"></span>
        <div class="mli-main">
          <div class="mli-title">${r.nome || r.device_id}</div>
          <div class="mli-sub">${r.tipo || ""} ${r.offline ? "• OFFLINE" : ""}</div>
        </div>
        <span class="mli-pct ${pctCls}">${pct != null ? pct + "%" : "—"}</span>
      </div>`;
  }).join("")}</div>`;
}

function _mpRenderBombas(g) {
  const reservas = g.reservatorios || [];
  if (reservas.length === 0) return `<div class="mp-empty">Nenhum reservatório cadastrado.</div>`;
  return `<div class="mp-list">${reservas.map(r => {
    const ligada = !!r.ultima_leitura?.bomba_ligada;
    return `
      <div class="mp-list-item">
        <span class="mli-dot ${ligada ? "ok" : "off"}"></span>
        <div class="mli-main">
          <div class="mli-title">${r.nome || r.device_id}</div>
          <div class="mli-sub">${r.offline ? "Dispositivo offline" : "Última leitura " + _mpRelTime(r.ultima_leitura?.criado_em)}</div>
        </div>
        <span class="mp-list-pill ${ligada ? "on" : "off"}">${ligada ? "LIGADA" : "DESLIGADA"}</span>
      </div>`;
  }).join("")}</div>`;
}

function _mpRenderAlertas(g) {
  const condoId = g.condominio?.id;
  const deviceIds = new Set((g.reservatorios || []).map(r => r.device_id));
  const alertas = (_alertasAbertos || []).filter(a => deviceIds.has(a.device_id));
  const chamados = (Array.isArray(_chamadosData) ? _chamadosData : [])
    .filter(ch => ch.condominio_id === condoId && ch.status !== 'fechado');

  if (alertas.length === 0 && chamados.length === 0) {
    return `<div class="mp-empty">Nenhum alerta ou chamado aberto neste condomínio.</div>`;
  }

  const alertasHtml = alertas.length === 0 ? "" : `
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:2px 4px 6px;">Alertas de telemetria</div>
    <div class="mp-list">${alertas.map(a => {
      const tipo = String(a.tipo || "").replaceAll("_", " ");
      const kind = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn";
      return `
        <div class="mp-list-item">
          <span class="mli-dot ${kind}"></span>
          <div class="mli-main">
            <div class="mli-title">${tipo}</div>
            <div class="mli-sub">${a.device_id || ""} ${a.mensagem ? "• " + a.mensagem : ""}</div>
          </div>
          <span class="mli-right">${_mpRelTime(a.criado_em)}</span>
        </div>`;
    }).join("")}</div>`;

  const chamadosHtml = chamados.length === 0 ? "" : `
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:${alertas.length ? "14px" : "2px"} 4px 6px;">Chamados abertos</div>
    <div class="mp-list">${chamados.map(ch => {
      const kind = ch.prioridade === "p1" ? "bad" : ch.prioridade === "p2" ? "warn" : "ok";
      const prioLabel = { p1: "P1 Crítico", p2: "P2 Alta", p3: "P3 Normal", p4: "P4 Baixa" };
      return `
        <div class="mp-list-item">
          <span class="mli-dot ${kind}"></span>
          <div class="mli-main">
            <div class="mli-title">${escapeHtml(ch.titulo || "Chamado #" + ch.id)}</div>
            <div class="mli-sub">${prioLabel[ch.prioridade] || ch.prioridade} • ${(ch.status || "").replaceAll("_", " ")}</div>
          </div>
          <span class="mli-right">${_mpRelTime(ch.criado_em)}</span>
        </div>`;
    }).join("")}</div>`;

  return alertasHtml + chamadosHtml;
}

function _mpRenderChamados(g) {
  const condoId = g.condominio?.id;
  const lista = (Array.isArray(_chamadosData) ? _chamadosData : []).filter(ch => ch.condominio_id === condoId);
  if (lista.length === 0) return `<div class="mp-empty">Nenhum chamado para este condomínio.</div>`;

  const tecs = (Array.isArray(_tecnicosData) ? _tecnicosData : [])
    .filter(t => t.ativo !== false && (!t.cargo || t.cargo === 'tecnico'));
  const tecsOptions = `<option value="">— sem técnico —</option>` +
    tecs.map(t => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join("");

  return `<div class="mp-list">${lista.slice(0, 20).map(ch => {
    const kind = ch.prioridade === "p1" ? "bad" : ch.prioridade === "p2" ? "warn" : "ok";
    const statusLabel = (ch.status || "").replaceAll("_", " ");
    const isFechado = ch.status === "fechado";
    const tecNome = ch.tecnico_nome ? escapeHtml(ch.tecnico_nome) : (ch.tecnico_id ? `Técnico #${ch.tecnico_id}` : "");
    const deslocamento = ch.tecnico_chegou_em
      ? `<span style="color:var(--ok);">📍 chegou ${_mpRelTime(ch.tecnico_chegou_em)}</span>`
      : ch.tecnico_a_caminho_em
        ? `<span style="color:var(--warn);">🚗 a caminho ${_mpRelTime(ch.tecnico_a_caminho_em)}</span>`
        : "";

    const atribuirHtml = !isFechado ? `
      <div class="mp-tec-wrap" data-chamado-id="${ch.id}" style="margin-top:6px;padding-left:18px;">
        ${ch.tecnico_id
          ? `<div style="display:flex;gap:8px;align-items:center;font-size:11px;">
               <span style="color:var(--muted);">Técnico:</span>
               <span style="font-weight:600;">${tecNome || "—"}</span>
               <button class="btn btn-sm viewer-only-hide" data-action="mp-alterar-tecnico" data-chamado-id="${ch.id}" style="font-size:10px;padding:2px 7px;margin-left:2px;">Alterar</button>
             </div>`
          : `<div style="display:flex;gap:6px;align-items:center;">
               <select class="mp-tec-select" data-chamado-id="${ch.id}" style="flex:1;font-size:11px;background:var(--surface2);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:3px 6px;">
                 ${tecsOptions}
               </select>
               <button class="btn btn-sm viewer-only-hide" data-action="mp-atribuir-tecnico" data-chamado-id="${ch.id}" style="white-space:nowrap;font-size:11px;padding:3px 8px;">Atribuir</button>
             </div>`
        }
      </div>` : "";

    return `
      <div class="mp-list-item" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="mli-dot ${kind}" style="flex-shrink:0;margin-top:2px;"></span>
          <div class="mli-main">
            <div class="mli-title">${escapeHtml(ch.titulo || "Chamado #" + ch.id)}</div>
            <div class="mli-sub">${statusLabel} • ${ch.prioridade || "p3"} ${tecNome ? "• " + tecNome : ""} ${deslocamento ? "• " : ""}${deslocamento}</div>
          </div>
          <span class="mli-right">${_mpRelTime(ch.criado_em)}</span>
        </div>
        ${atribuirHtml}
      </div>`;
  }).join("")}</div>`;
}

// --- Donut helper (SVG puro, sem ApexCharts pra leveza) ---
function _mpRenderDonut(containerId, legendId, fatias, totalCentro) {
  const cont = document.getElementById(containerId);
  const leg  = document.getElementById(legendId);
  if (!cont || !leg) return;
  const total = fatias.reduce((s, f) => s + f.value, 0);
  if (total === 0) {
    cont.innerHTML = `<div class="mp-empty" style="height:200px;">Sem dados.</div>`;
    leg.innerHTML = "";
    return;
  }
  const R = 70, CX = 100, CY = 100, STROKE = 22;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segs = fatias.filter(f => f.value > 0).map(f => {
    const frac = f.value / total;
    const dash = `${C * frac} ${C * (1 - frac)}`;
    const dashoffset = -C * acc;
    acc += frac;
    return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${f.color}" stroke-width="${STROKE}" stroke-dasharray="${dash}" stroke-dashoffset="${dashoffset}" transform="rotate(-90 ${CX} ${CY})"/>`;
  }).join("");
  const centroHtml = totalCentro != null
    ? `<text x="${CX}" y="${CY - 4}" text-anchor="middle" font-size="28" font-weight="800" fill="currentColor">${totalCentro}</text>
       <text x="${CX}" y="${CY + 16}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.5)" letter-spacing="1.5">TOTAL</text>`
    : "";
  cont.innerHTML = `<svg viewBox="0 0 200 200" width="100%" height="200">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${STROKE}"/>
    ${segs}
    ${centroHtml}
  </svg>`;
  leg.innerHTML = fatias.map(f => `
    <div class="dl-row">
      <span class="dl-dot" style="background:${f.color}"></span>
      <span class="dl-label">${f.label}</span>
      <span class="dl-value">${f.value}</span>
    </div>`).join("");
}

// "Alertas Recentes" = telemetria aberta + chamados não-fechados, juntos,
// ordenados por severidade e depois por mais recente.
function _mpAtualizarAlertasRecentes() {
  const wrap = document.getElementById("mpAlertsList");
  if (!wrap) return;

  const itens = [];

  for (const a of (_alertasAbertos || [])) {
    const sev = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo")
      ? "critico"
      : "media";
    itens.push({
      sev,
      titulo: _mcDeviceCondoName(a.device_id),
      sub: String(a.tipo || "").replaceAll("_", " "),
      iso: a.criado_em,
      target: "alertas",
    });
  }

  for (const ch of (Array.isArray(_chamadosData) ? _chamadosData : [])) {
    // Só chamados ainda em aberto (qualquer status != fechado/resolvido)
    const status = String(ch.status || "").toLowerCase();
    if (status === "fechado" || status === "resolvido") continue;
    const prio = String(ch.prioridade || "p3").toLowerCase();
    const sev = prio === "p1" ? "critico"
              : prio === "p2" ? "alta"
              : prio === "p4" ? "media"
              : "media";
    itens.push({
      sev,
      titulo: ch.titulo || ("Chamado #" + ch.id),
      sub: ch.condominio_nome
        ? `${ch.condominio_nome} • ${status.replaceAll("_", " ")}`
        : status.replaceAll("_", " "),
      iso: ch.criado_em,
      target: "chamados",
    });
  }

  const pesoSev = { critico: 0, alta: 1, media: 2 };
  itens.sort((a, b) => {
    const p = (pesoSev[a.sev] ?? 9) - (pesoSev[b.sev] ?? 9);
    if (p !== 0) return p;
    return new Date(b.iso) - new Date(a.iso);
  });

  const top = itens.slice(0, 8);
  if (!top.length) {
    wrap.innerHTML = `<div class="mc-empty">Nenhum alerta no momento ✓</div>`;
    return;
  }

  const badgeLabel = { critico: "Crítico", alta: "Alta", media: "Média" };
  wrap.innerHTML = top.map(it => `
    <div class="mp-alert-row" data-section-go="${it.target}">
      <div class="mp-alert-main">
        <div class="mp-alert-title">${it.titulo}</div>
        <div class="mp-alert-sub">${it.sub}</div>
      </div>
      <div class="mp-alert-side">
        <span class="mp-alert-badge ${it.sev}">${badgeLabel[it.sev]}</span>
        <span class="mp-alert-time">${_mpRelTime(it.iso)}</span>
      </div>
    </div>
  `).join("");
}

function _mpAtualizarZonaDonut() {
  const groups = Array.isArray(_statusData) ? _statusData : [];
  const contagem = new Map();
  for (const g of groups) {
    const z = _mpZonaPara(g.condominio || {});
    contagem.set(z, (contagem.get(z) || 0) + 1);
  }
  const cores = {
    "Centro":     "#22d3ee",
    "Zona Norte": "#a78bfa",
    "Zona Sul":   "#10b981",
    "Zona Leste": "#f59e0b",
    "Zona Oeste": "#ec4899",
    "Sem coordenada": "#64748b",
  };
  const fatias = [...contagem.entries()].map(([label, value]) => ({
    label, value, color: cores[label] || "#94a3b8",
  }));
  const total = fatias.reduce((s, f) => s + f.value, 0);
  _mpRenderDonut("mpZonaChart", "mpZonaLegend", fatias, total);
}

function _mpAtualizarUpdates() {
  const wrap = document.getElementById("mpUpdatesList");
  if (!wrap) return;
  const eventos = [];
  for (const a of (_alertasAbertos || [])) {
    eventos.push({
      tipo: "alerta",
      titulo: _mcDeviceCondoName(a.device_id),
      sub: String(a.tipo || "").replaceAll("_", " "),
      kind: (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn",
      iso: a.criado_em,
    });
  }
  for (const ch of (Array.isArray(_chamadosData) ? _chamadosData : [])) {
    eventos.push({
      tipo: "chamado",
      titulo: ch.titulo || ("Chamado #" + ch.id),
      sub: `${ch.prioridade || "p3"} • ${(ch.status || "").replaceAll("_", " ")}`,
      kind: ch.prioridade === "p1" ? "bad" : ch.prioridade === "p2" ? "warn" : "ok",
      iso: ch.criado_em,
    });
  }
  eventos.sort((a, b) => new Date(b.iso) - new Date(a.iso));
  const top = eventos.slice(0, 10);
  if (top.length === 0) {
    wrap.innerHTML = `<div class="mc-empty">Sem eventos recentes.</div>`;
    return;
  }
  const ico = (k) => k === "bad"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'
    : k === "warn"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  wrap.innerHTML = top.map(ev => `
    <div class="mp-update-row">
      <div class="mu-icon ${ev.kind}">${ico(ev.kind)}</div>
      <div class="mu-main">
        <div class="mu-title">${ev.titulo}</div>
        <div class="mu-sub">${ev.sub}</div>
      </div>
      <span class="mu-time">${_mpRelTime(ev.iso)}</span>
    </div>`).join("");
}

// Aplica/remove o visual de fullscreen (classes CSS + mover o painel pra dentro
// do card). NÃO toca na Fullscreen API do navegador — quem chama é responsável.
function _mpAplicarFullscreen(ativar) {
  const card = document.getElementById("mpMapCard");
  const panel = document.querySelector('.mp-panel');
  if (!card) return;

  if (panel) {
    if (ativar && !panel._mpOldParent) {
      panel._mpOldParent = panel.parentNode;
      panel._mpOldNext   = panel.nextSibling;
      card.appendChild(panel);
      panel.classList.toggle("mp-fs-hidden", !_mpCondoSelecionadoId);
    } else if (!ativar && panel._mpOldParent) {
      panel._mpOldParent.insertBefore(panel, panel._mpOldNext);
      panel._mpOldParent = null;
      panel._mpOldNext   = null;
      panel.classList.remove("mp-fs-hidden");
    }
  }

  card.classList.toggle("is-fullscreen", ativar);
  document.body.classList.toggle("mp-fs-active", ativar);
  if (_mpMap) requestAnimationFrame(() => _mpMap.invalidateSize());
}

// Toggle fullscreen do mapa. Tenta usar a Fullscreen API do navegador
// (esconde a chrome do browser inteiro — barra de URL, abas, etc) e
// cai pro pseudo-fullscreen via CSS se a API não estiver disponível.
function _mpToggleFullscreen(forcar) {
  const card = document.getElementById("mpMapCard");
  if (!card) return;
  const estaEm = card.classList.contains("is-fullscreen") || !!document.fullscreenElement;
  const ativar = forcar != null ? forcar : !estaEm;

  if (ativar) {
    if (card.requestFullscreen) {
      card.requestFullscreen().catch(() => _mpAplicarFullscreen(true));
    } else {
      _mpAplicarFullscreen(true);
    }
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      _mpAplicarFullscreen(false);
    }
  }
}

// Sincroniza a classe is-fullscreen quando o usuário entra/sai da Fullscreen
// API via ESC do navegador ou outro caminho fora do nosso botão.
document.addEventListener("fullscreenchange", () => {
  const card = document.getElementById("mpMapCard");
  if (!card) return;
  const apiAtiva = document.fullscreenElement === card;
  const classeAtiva = card.classList.contains("is-fullscreen");
  if (apiAtiva !== classeAtiva) _mpAplicarFullscreen(apiAtiva);
});

function _mpFsPanelMostrar() {
  document.querySelector('.mp-panel')?.classList.remove("mp-fs-hidden");
}
function _mpFsPanelEsconder() {
  document.querySelector('.mp-panel')?.classList.add("mp-fs-hidden");
}

// Função pública: chamada em showSection e após carregar dados
function renderSecaoMapa() {
  _mpAtualizarKpis();
  _mpAtualizarMapa();
  _mpAtualizarPainel();
  _mpAtualizarAlertasRecentes();
  _mpAtualizarZonaDonut();
  _mpAtualizarUpdates();
  // Leaflet precisa recalcular tamanho sempre que o container muda de visível
  // (ex: usuário trocou de seção e voltou). Sem isso os tiles ficam em branco.
  if (_mpMap) {
    requestAnimationFrame(() => {
      _mpMap.invalidateSize();
      // Se nunca aplicou fit (mapa criado em tamanho 0 ou sem coords), reaplica agora
      if (!_mpMap._fitAplicado) {
        const groups = Array.isArray(_statusData) ? _statusData : [];
        const bounds = groups
          .filter(g => g.condominio?.lat != null && g.condominio?.lng != null)
          .map(g => [g.condominio.lat, g.condominio.lng]);
        if (bounds.length > 0) {
          _mpMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
          _mpMap._fitAplicado = true;
        }
      }
    });
  }
}

// ============================================================
//  RELATÓRIOS
// ============================================================
let _relCharts  = {};  // instâncias ApexCharts — keyed by container id
let _relGerado  = { chamados: false, reservatorios: false, sla: false };

// Formatadores compartilhados (centralização — antes cada tabela formatava à sua maneira)
const _relFmtData     = iso => iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";
const _relFmtTipo     = t   => (t || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const _relFmtTxt      = (t, max = 28) => { const s = String(t || ""); return s.length > max ? s.slice(0, max) + "…" : s; };
const _relTipoClasse  = tipo => /muito_baixo|offline/i.test(tipo || "") ? "b-bad"
                              : /baixo/i.test(tipo || "")              ? "b-warn"
                              : "b-ok";
const _relCategoriaLabel = c => ({
  vazamento: "Vazamento", bomba_falha: "Falha de bomba", nivel_baixo: "Nível baixo",
  sem_agua: "Sem água", ruido: "Ruído", manutencao: "Manutenção", outro: "Outro",
  sem_classificacao: "Sem classificação",
})[c] || _relFmtTipo(c);

// Fetch comum: monta querystring a partir de IDs, gerencia botão "Aguarde…", trata erro.
// Antes cada gerarRel* duplicava esse boilerplate.
async function _relFetch({ endpoint, btnAction, ids }) {
  const btn = document.querySelector(`[data-rel-action='${btnAction}']`);
  if (btn) { btn.textContent = "Aguarde…"; btn.disabled = true; }
  const params = new URLSearchParams();
  const v = id => document.getElementById(id)?.value || "";
  Object.entries(ids).forEach(([key, id]) => {
    const val = v(id);
    if (val) params.set(key, key === "device_id" ? val.trim() : val);
  });
  try {
    const r = await fetch(`${endpoint}?${params}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    alert(`Erro ao gerar relatório (${endpoint}).`);
    return null;
  } finally {
    if (btn) { btn.textContent = "Gerar"; btn.disabled = false; }
  }
}

// Conta registros consistente em todas as abas (antes algumas diziam "linha", outras "registro")
const _relCount = n => `${n} registro${n !== 1 ? "s" : ""}`;

function _relDataPadrao() {
  const hoje = new Date();
  const fim  = hoje.toISOString().split("T")[0];
  const ini  = new Date(hoje - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { ini, fim };
}

function _relPreencherCondoSelects(ids) {
  const condos = Array.isArray(_condominios) ? _condominios : [];
  const opts = '<option value="">Todos</option>' +
    condos.map(c => `<option value="${c.id}">${_waEscaparHtml(c.nome)}</option>`).join("");
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opts; });
}

function _relPreencherTecnicoSelect() {
  const el = document.getElementById("relChTecnico");
  if (!el) return;
  const tecs = Array.isArray(_tecnicosData) ? _tecnicosData : [];
  el.innerHTML = '<option value="">Todos</option>' +
    tecs.map(t => `<option value="${t.id}">${_waEscaparHtml(t.nome)}</option>`).join("");
}

let _relSlaDados = null; // cache do último fetch do dashboard SLA

// Mapa tab → { pane, body, hasData, fn } — centraliza o switch das abas
const _REL_TABS = {
  chamados:      { pane: "relPaneChamados",      body: "relBodyChamados",      has: () => _relChDados.length > 0,       fn: () => gerarRelChamados() },
  reservatorios: { pane: "relPaneReservatorios", body: "relBodyReservatorios", has: () => _relResDados !== null,        fn: () => gerarRelReservatorios() },
  sla:           { pane: "relPaneSla",           body: "relBodySla",           has: () => _relSlaDados !== null,        fn: () => gerarRelSla() },
};

function _relMostrarTab(tab, autoGerar) {
  const conf = _REL_TABS[tab];
  if (!conf) return;
  _relTab = tab;

  document.querySelectorAll("#relTabs .wa-tab").forEach(btn =>
    btn.classList.toggle("is-active", btn.dataset.relTab === tab)
  );
  document.querySelectorAll(".rel-tab-pane").forEach(p => p.style.display = "none");
  const filterPane = document.getElementById(conf.pane);
  // "block" e não "" — string vazia volta pro CSS .rel-tab-pane { display:none }
  if (filterPane) filterPane.style.display = "block";

  // Body sempre visível ao entrar na aba — antes ficava em branco até dados chegarem
  document.querySelectorAll(".rel-body").forEach(b => b.style.display = "none");
  const bodyEl = document.getElementById(conf.body);
  if (bodyEl) bodyEl.style.display = "";

  // auto-gera na primeira visita a cada aba
  if (autoGerar && !_relGerado[tab]) {
    _relGerado[tab] = true;
    conf.fn();
  }
}

function renderRelatorios() {
  const { ini, fim } = _relDataPadrao();
  ["relChIni","relResIni","relSlIni"].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = ini; });
  ["relChFim","relResFim","relSlFim"].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = fim; });
  _relPreencherCondoSelects(["relChCondo","relResCondo","relSlCondo"]);
  _relPreencherTecnicoSelect();
  _relMostrarTab(_relTab, true);
}

function _relKpiCard(iconSvg, label, value, cls, subtitle) {
  const sub = subtitle ? `<div class="rc-sub">${subtitle}</div>` : "";
  return `<div class="rc rc-${cls || "neutral"} rc-static">
    <div class="rc-head">
      <div class="rc-icon">${iconSvg}</div>
      <div class="rc-label">${label}</div>
    </div>
    <div class="rc-value">${value}</div>
    ${sub}
  </div>`;
}

// SVGs reutilizáveis nos cards de relatórios
const _SVG_FILE    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const _SVG_CLOCK   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const _SVG_BAR     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const _SVG_ALERT   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const _SVG_CHECK   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const _SVG_DROP    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
const _SVG_CPU     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`;
const _SVG_WAVE    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const _SVG_BOLT    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const _SVG_REVERT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;

function _relSlaFmt(h) {
  if (h == null || isNaN(h)) return "-";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${Number(h).toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function _relChart(containerId, opts) {
  if (_relCharts[containerId]) {
    try { _relCharts[containerId].destroy(); } catch (_) {}
    delete _relCharts[containerId];
  }
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";

  // Converte height: "100%" em altura numérica baseada no div pai.
  // Sem isso, o ApexCharts renderiza ~43px além do parent (pra acomodar
  // labels do eixo X) e o overflow:hidden dos cards corta o eixo.
  if (opts && opts.chart && opts.chart.height === "100%") {
    const h = el.offsetHeight;
    if (h > 0) {
      opts = { ...opts, chart: { ...opts.chart, height: h } };
    }
  }

  const c = new ApexCharts(el, opts);
  c.render();
  _relCharts[containerId] = c;
}

const _REL_GRID  = { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3, padding: { left: 12, right: 12, bottom: 4, top: 4 } };
const _REL_XLBL  = { style: { colors: "#7a7e9c", fontSize: "10px" } };
const _REL_YLBL  = { style: { colors: "#7a7e9c", fontSize: "10px" } };

function _relBadgePeriodo(iniId, fimId) {
  const ini = document.getElementById(iniId)?.value;
  const fim = document.getElementById(fimId)?.value;
  if (!ini && !fim) return "";
  const fmt = s => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "?";
  return `<span class="rel-ct-badge">${fmt(ini)} – ${fmt(fim)}</span>`;
}

function _relAreaOpts(name, seriesData, color) {
  return {
    chart: { type: "area", height: "100%", toolbar: { show: false }, background: "transparent", zoom: { enabled: false }, animations: { speed: 500, easing: "easeinout" } },
    series: [{ name, data: seriesData }],
    xaxis: { type: "datetime", labels: { ...(_REL_XLBL), datetimeFormatter: { day: "dd/MM" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: _REL_YLBL, min: 0, forceNiceScale: true },
    stroke: { curve: "smooth", width: 2.5 },
    fill: { type: "gradient", gradient: { shade: "dark", type: "vertical", shadeIntensity: 0.5, gradientToColors: ["transparent"], opacityFrom: 0.5, opacityTo: 0, stops: [0, 85, 100] } },
    colors: [color || "#f0b014"],
    grid: { borderColor: "rgba(255,255,255,.04)", strokeDashArray: 3, padding: { left: 12, right: 12, bottom: 4, top: 4 } },
    markers: { size: 0, hover: { size: 4 } },
    tooltip: { theme: "dark", x: { format: "dd/MM/yyyy" } },
    dataLabels: { enabled: false },
  };
}

function _relDonutOpts(labels, values, colors) {
  const totalVal = values.reduce((a,b) => a+b, 0);
  return {
    chart: { type: "donut", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 500 } },
    series: values,
    labels,
    colors: colors || ["#f0b014","#4a78f7","#4ade80","#f97316","#ef4444"],
    plotOptions: { pie: { donut: { size: "72%", labels: { show: true,
      total: { show: true, label: "Total", color: "#6b7280", fontSize: "11px", fontWeight: "600", formatter: () => String(totalVal) },
      value: { show: true, color: "#eef0fb", fontSize: "22px", fontWeight: "700", offsetY: 4 }
    } } } },
    stroke: { width: 3, colors: ["#111326"] },
    dataLabels: { enabled: false },
    legend: { position: "bottom", fontSize: "11px", labels: { colors: "#9094ae" }, itemMargin: { horizontal: 8, vertical: 4 }, offsetY: 4 },
    tooltip: { theme: "dark" },
  };
}

function _relBarOpts(categories, values, colors) {
  return {
    chart: { type: "bar", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 450 } },
    series: [{ name: "Total", data: values }],
    xaxis: { categories, labels: _REL_XLBL, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: _REL_YLBL },
    plotOptions: { bar: { distributed: true, borderRadius: 6, columnWidth: "44%", dataLabels: { position: "top" } } },
    dataLabels: { enabled: true, offsetY: -18, style: { fontSize: "11px", fontWeight: "700", colors: ["#eef0fb"] } },
    colors: colors || ["#4ade80","#f0b014","#f97316","#ef4444"],
    legend: { show: false },
    grid: { borderColor: "rgba(255,255,255,.04)", strokeDashArray: 3, padding: { left: 12, right: 12, bottom: 4, top: 4 } },
    tooltip: { theme: "dark" },
  };
}

async function gerarRelChamados() {
  const data = await _relFetch({
    endpoint: "/relatorios/chamados",
    btnAction: "gerar-chamados",
    ids: {
      data_ini: "relChIni", data_fim: "relChFim",
      condominio_id: "relChCondo", status: "relChStatus",
      prioridade: "relChPrioridade", tecnico_id: "relChTecnico",
    },
  });
  if (!data) return;
  _relChDados = data;

  const dados = _relChDados;
  const total    = dados.length;
  const abertos  = dados.filter(d => d.status === "aberto" || d.status === "em_atendimento").length;
  const fechados = dados.filter(d => d.status === "fechado").length;
  const slaArr   = dados.filter(d => d.fechado_em && d.sla_horas != null).map(d => Number(d.sla_horas));
  const slaMedia = slaArr.length ? slaArr.reduce((a,b) => a+b,0) / slaArr.length : null;

  const criticos = dados.filter(d => d.prioridade === "p1" && d.status !== "fechado").length;
  const taxa     = total > 0 ? Math.round(fechados / total * 100) : 0;

  const kpiEl = document.getElementById("relChKpis");
  if (kpiEl) kpiEl.innerHTML =
    _relKpiCard(_SVG_FILE,  "Total no período",     total,                                          "neutral") +
    _relKpiCard(_SVG_CLOCK, "SLA médio",            slaMedia != null ? _relSlaFmt(slaMedia) : "—", "neutral") +
    _relKpiCard(_SVG_BAR,   "Taxa de resolução",    `${taxa}%`,    taxa>=70?"ok":taxa>=40?"warn":"bad") +
    _relKpiCard(_SVG_ALERT, "Críticos em aberto",   criticos,      criticos>0?"bad":"neutral");

  // — agregações para gráficos —
  const porDiaMap = {};
  dados.forEach(d => { const dia = (d.criado_em||"").split("T")[0]; if(dia) porDiaMap[dia] = (porDiaMap[dia]||0)+1; });
  const dias = Object.keys(porDiaMap).sort();

  const stMap = {};
  dados.forEach(d => { const k = d.status||"outro"; stMap[k] = (stMap[k]||0)+1; });
  const stLabels = Object.keys(stMap).map(l => l.replace("_"," "));
  const stVals   = Object.values(stMap);
  const stColors = Object.keys(stMap).map(l => l==="fechado"?"#4ade80":l==="em_atendimento"?"#f0b014":"#f87171");

  const prioOrder  = ["p4","p3","p2","p1"];
  const prioLabels = ["P4 Agendado","P3 Controlado","P2 Alta","P1 Crítico"];
  const prioColors = ["#4ade80","#f0b014","#f97316","#ef4444"];
  const prioVals   = prioOrder.map(p => dados.filter(d => d.prioridade===p).length);

  const catOrder  = ["sem_agua","vazamento","bomba_falha","nivel_baixo","ruido","manutencao","outro"];
  const catColors = ["#ef4444","#f97316","#f0b014","#4a78f7","#8b5cf6","#4ade80","#94a3b8"];
  const catMap = {};
  dados.forEach(d => { const c = d.categoria || "outro"; catMap[c] = (catMap[c]||0)+1; });
  const catLabels = catOrder.filter(c => catMap[c]).map(c => _relCategoriaLabel(c));
  const catVals   = catOrder.filter(c => catMap[c]).map(c => catMap[c]);
  const catClrs   = catOrder.filter(c => catMap[c]).map((c,_,arr) => catColors[catOrder.indexOf(c)]);

  const condoMap = {};
  dados.forEach(d => {
    const n = d.condominio_nome || "Sem condomínio";
    if (!condoMap[n]) condoMap[n] = { total:0, abertos:0 };
    condoMap[n].total++;
    if (d.status !== "fechado") condoMap[n].abertos++;
  });
  const top5problemas = Object.entries(condoMap)
    .map(([nome,d]) => ({ nome, score: d.abertos*3 + d.total, abertos: d.abertos, total: d.total }))
    .sort((a,b) => b.score-a.score).slice(0,5);

  const bodyEl = document.getElementById("relBodyChamados");
  if (bodyEl) bodyEl.style.display = "";

  const _chHeadDia = document.getElementById("relChHeadDia");
  if (_chHeadDia) _chHeadDia.innerHTML = `<span>Chamados por dia</span>${_relBadgePeriodo("relChIni","relChFim")}`;

  requestAnimationFrame(() => {
    _relChart("relChChartDia", _relAreaOpts("Chamados",
      dias.map(d => [new Date(d + "T12:00:00").getTime(), porDiaMap[d]]), "#f0b014"));

    if (stVals.length && stVals.some(v => v > 0))
      _relChart("relChChartStatus", _relDonutOpts(stLabels, stVals, stColors));

    if (prioVals.some(v => v > 0))
      _relChart("relChChartPrio", _relDonutOpts(prioLabels, prioVals, prioColors));
    else {
      const el = document.getElementById("relChChartPrio");
      if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px;">Sem chamados no período</div>`;
    }

    if (catVals.length && catVals.some(v => v > 0))
      _relChart("relChChartCat", _relDonutOpts(catLabels, catVals, catClrs));
    else {
      const el = document.getElementById("relChChartCat");
      if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px;">Sem chamados com categoria</div>`;
    }
  });

  const problemasTbody = document.getElementById("relChProblemaBody");
  if (problemasTbody) {
    const maxScore = top5problemas[0]?.score || 1;
    problemasTbody.innerHTML = top5problemas.map(({ nome, score, abertos, total }) => {
      const pct = Math.round((score / maxScore) * 100);
      return `<tr>
        <td>
          <div style="font-size:12px;line-height:1.3;">${_waEscaparHtml(nome)}</div>
          <div class="rel-prog"><div class="rel-prog-fill" style="width:${pct}%;background:#ef4444;"></div></div>
        </td>
        <td style="text-align:right;font-weight:700;">${score}</td>
        <td style="text-align:right;">${abertos>0?`<span class="badge b-bad">${abertos}/${total}</span>`:total}</td>
        <td style="text-align:right;color:var(--muted);">—</td>
      </tr>`;
    }).join("") || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px;font-size:12px;">Sem dados</td></tr>`;
  }

  const prioClass = p => (p==="p1"||p==="p2")?"b-bad":p==="p3"?"b-warn":"b-ok";
  const stClass   = s => s==="fechado"?"b-ok":s==="em_atendimento"?"b-warn":"b-bad";
  const tbody = document.getElementById("relChTbody");
  if (tbody) tbody.innerHTML = dados.map(d => `<tr>
    <td>CH-${d.id}</td>
    <td>${_waEscaparHtml(d.titulo||"")}</td>
    <td>${_waEscaparHtml(d.condominio_nome||"-")}</td>
    <td>${_waEscaparHtml(d.tecnico_nome||"-")}</td>
    <td>${d.categoria?_waEscaparHtml(_relCategoriaLabel(d.categoria)):"-"}</td>
    <td><span class="badge ${prioClass(d.prioridade)}">${_relFmtTipo(d.prioridade)||"-"}</span></td>
    <td><span class="badge ${stClass(d.status)}">${_relFmtTipo(d.status)||"-"}</span></td>
    <td>${_relFmtData(d.criado_em)}</td>
    <td>${d.sla_horas!=null?_relSlaFmt(Number(d.sla_horas)):"-"}</td>
  </tr>`).join("");

  const count = document.getElementById("relChCount");
  if (count) count.textContent = _relCount(total);
}

async function gerarRelReservatorios() {
  const v = id => document.getElementById(id)?.value || "";
  const params = new URLSearchParams();
  if (v("relResIni"))    params.set("data_ini",     v("relResIni"));
  if (v("relResFim"))    params.set("data_fim",      v("relResFim"));
  if (v("relResCondo"))  params.set("condominio_id", v("relResCondo"));
  if (v("relResDevice")) params.set("device_id",     v("relResDevice").trim());

  const btn = document.querySelector("[data-rel-action='gerar-reservatorios']");
  if (btn) { btn.textContent = "Aguarde…"; btn.disabled = true; }
  try {
    const [telRes, alRes] = await Promise.all([
      fetch(`/relatorios/telemetria?${params}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`/relatorios/alertas?${params}`,    { headers: authHeaders() }).then(r => r.json()),
    ]);
    _relResDados = { tel: telRes, al: alRes };
  } catch (e) {
    alert("Erro ao carregar dados de reservatórios.");
    return;
  } finally {
    if (btn) { btn.textContent = "Gerar"; btn.disabled = false; }
  }

  const tel = _relResDados.tel;
  const al  = _relResDados.al;

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const dispositivos  = new Set(tel.map(d => d.device_id)).size;
  const nivelArr      = tel.filter(d => d.nivel_medio != null).map(d => Number(d.nivel_medio));
  const nivelGlobal   = nivelArr.length ? Math.round(nivelArr.reduce((a,b)=>a+b,0)/nivelArr.length) : null;
  const alAtivos      = al.filter(d => d.status === "ativo").length;
  const alTotal       = al.length;
  const offline       = al.filter(d => d.tipo === "dispositivo_offline" && d.status === "ativo").length;

  // KPI extra de contratos com telemetria — info financeira do parque
  const tel_m = _contratosMetricas?.com_telemetria || { ativos: 0, mrr: 0 };
  const fmtMoedaCurta = (v) => {
    const n = Number(v) || 0;
    if (n >= 1000) return "R$ " + (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  };

  const kpiEl = document.getElementById("relResKpis");
  if (kpiEl) kpiEl.innerHTML =
    _relKpiCard(_SVG_CPU,   "Dispositivos",    dispositivos,                              "neutral") +
    _relKpiCard(_SVG_DROP,  "Nível médio",     nivelGlobal!=null?nivelGlobal+"%":"—",
      nivelGlobal!=null&&nivelGlobal<30?"bad":nivelGlobal!=null&&nivelGlobal<60?"warn":"ok") +
    _relKpiCard(_SVG_ALERT, "Alertas ativos",  alAtivos, alAtivos>0?"bad":"neutral") +
    _relKpiCard(_SVG_WAVE,  "Dispositivos offline", offline, offline>0?"bad":"neutral") +
    _relKpiCard(_SVG_CHECK, "Contratos c/ telemetria", `${tel_m.ativos} · ${fmtMoedaCurta(tel_m.mrr)}/mês`, "ok");

  // ── Série nível por dia ──────────────────────────────────────────────────
  const porDia = {};
  tel.forEach(d => {
    if (!porDia[d.dia]) porDia[d.dia] = { sum:0, cnt:0 };
    porDia[d.dia].sum += Number(d.nivel_medio)||0;
    porDia[d.dia].cnt++;
  });
  const dias = Object.keys(porDia).sort();
  const nivelSerie = dias.map(d => [new Date(d+"T12:00:00").getTime(), Math.round(porDia[d].sum/porDia[d].cnt)]);

  // Anotações de alertas sobre o gráfico de nível
  const alertAnnotations = al
    .filter(d => d.tipo !== "dispositivo_offline")
    .reduce((acc, d) => {
      const dia = (d.criado_em||"").split("T")[0];
      if (dia && !acc.find(a => a.x === new Date(dia+"T12:00:00").getTime()))
        acc.push({ x: new Date(dia+"T12:00:00").getTime(), borderColor: "#ef4444",
          label: { borderColor: "#ef4444", style: { color: "#fff", background: "#ef4444", fontSize: "9px" }, text: "Alerta" } });
      return acc;
    }, []);

  // ── Tipo de alerta ───────────────────────────────────────────────────────
  const tipoMap = {};
  al.forEach(d => { const t=(d.tipo||"outro").replaceAll("_"," "); tipoMap[t]=(tipoMap[t]||0)+1; });
  const tipoLabels = Object.keys(tipoMap);
  const tipoVals   = Object.values(tipoMap);
  const tipoColors = ["#ef4444","#f97316","#94a3b8","#4a78f7","#4ade80"];

  // ── Nível por device ─────────────────────────────────────────────────────
  const devMap = {};
  tel.forEach(d => {
    if (!devMap[d.device_id]) devMap[d.device_id] = { sum:0, cnt:0, nome: d.reservatorio_nome||d.device_id, condo: d.condominio_nome||"-" };
    devMap[d.device_id].sum += Number(d.nivel_medio)||0;
    devMap[d.device_id].cnt++;
  });
  const devRank = Object.values(devMap)
    .map(v => ({ ...v, avg: Math.round(v.sum/v.cnt) }))
    .sort((a,b) => a.avg-b.avg).slice(0,8);

  // ── Saúde por reservatório (merge tel + al) ──────────────────────────────
  const saudeMap = {};
  tel.forEach(d => {
    const k = d.device_id;
    if (!saudeMap[k]) saudeMap[k] = { nome: d.reservatorio_nome||d.device_id, condo: d.condominio_nome||"-", sumN:0, cntN:0, alTotal:0, alAtivos:0, tempoArr:[] };
    saudeMap[k].sumN += Number(d.nivel_medio)||0;
    saudeMap[k].cntN++;
  });
  al.forEach(d => {
    const k = d.device_id;
    if (!saudeMap[k]) saudeMap[k] = { nome: d.reservatorio_nome||d.device_id||k, condo: d.condominio_nome||"-", sumN:0, cntN:0, alTotal:0, alAtivos:0, tempoArr:[] };
    saudeMap[k].alTotal++;
    if (d.status==="ativo") saudeMap[k].alAtivos++;
    if (d.tempo_horas!=null) saudeMap[k].tempoArr.push(Number(d.tempo_horas));
  });
  const saudeList = Object.values(saudeMap)
    .map(v => ({ ...v, nivelMed: v.cntN ? Math.round(v.sumN/v.cntN) : null, tempoMed: v.tempoArr.length ? v.tempoArr.reduce((a,b)=>a+b,0)/v.tempoArr.length : null }))
    .sort((a,b) => (b.alAtivos-a.alAtivos) || (a.nivelMed??101)-(b.nivelMed??101));

  const bodyEl = document.getElementById("relBodyReservatorios");
  if (bodyEl) bodyEl.style.display = "";

  const headNivel = document.getElementById("relResHeadNivel");
  if (headNivel) headNivel.innerHTML = `<span>Tendência de nível — média diária</span>${_relBadgePeriodo("relResIni","relResFim")}`;

  requestAnimationFrame(() => {
    _relChart("relResChartNivel", Object.assign(
      _relAreaOpts("Nível médio (%)", nivelSerie, "#4a78f7"), {
        yaxis: { min:0, max:100, labels: { ..._REL_YLBL, formatter: v=>v+"%" } },
        grid:  { borderColor:"rgba(255,255,255,.04)", strokeDashArray:3, padding:{ left:12, right:12, bottom:16, top:4 } },
        tooltip: { theme:"dark", x:{ format:"dd/MM/yyyy" }, y:{ formatter: v=>v+"%" } },
        annotations: { xaxis: alertAnnotations.slice(0,10) },
      }
    ));
    if (tipoVals.some(v=>v>0))
      _relChart("relResChartTipo", _relDonutOpts(tipoLabels, tipoVals, tipoColors));
    if (devRank.length)
      _relChart("relResChartDev", {
        chart: { type:"bar", height:"100%", toolbar:{ show:false }, background:"transparent", animations:{ speed:450 } },
        series: [{ name:"Nível médio", data: devRank.map(d=>d.avg) }],
        xaxis: { categories: devRank.map(d=>d.nome.length>16?d.nome.slice(0,16)+"…":d.nome),
          labels:{ ..._REL_XLBL, rotate:-25, hideOverlappingLabels:false }, axisBorder:{show:false}, axisTicks:{show:false} },
        yaxis: { min:0, max:100, labels:{ ..._REL_YLBL, formatter:v=>v+"%" } },
        plotOptions:{ bar:{ distributed:true, borderRadius:6, columnWidth:"48%", dataLabels:{ position:"top" } } },
        dataLabels:{ enabled:true, formatter:v=>v+"%", offsetY:-18, style:{ fontSize:"11px", fontWeight:"700", colors:["#eef0fb"] } },
        colors: devRank.map(d=>d.avg<30?"#ef4444":d.avg<60?"#f0b014":"#4ade80"),
        legend:{ show:false }, grid:{ ..._REL_GRID, padding:{ left:12, right:12, bottom:16, top:4 } }, tooltip:{ theme:"dark", y:{ formatter:v=>v+"%" } },
      });
  });

  const saudeTbody = document.getElementById("relResSaudeBody");
  if (saudeTbody) saudeTbody.innerHTML = saudeList.slice(0,10).map(d => {
    const nvlCls = d.nivelMed==null?"":d.nivelMed<30?"b-bad":d.nivelMed<60?"b-warn":"b-ok";
    return `<tr>
      <td>
        <div style="font-size:12px;font-weight:500;">${_waEscaparHtml(d.nome)}</div>
        <div style="font-size:10px;color:var(--muted);">${_waEscaparHtml(d.condo)}</div>
      </td>
      <td style="text-align:right;">${d.nivelMed!=null?`<span class="badge ${nvlCls}">${d.nivelMed}%</span>`:"—"}</td>
      <td style="text-align:right;">${d.alTotal}</td>
      <td style="text-align:right;">${d.alAtivos>0?`<span class="badge b-bad">${d.alAtivos}</span>`:`<span class="badge b-ok">0</span>`}</td>
      <td style="text-align:right;">${d.tempoMed!=null?_relSlaFmt(d.tempoMed):"—"}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Sem dados no período</td></tr>`;

  const alCount = document.getElementById("relResAlCount");
  if (alCount) alCount.textContent = _relCount(alTotal);

  const alTbody = document.getElementById("relResAlTbody");
  if (alTbody) alTbody.innerHTML = al.map(d => `<tr>
    <td>TEL-${d.id}</td>
    <td><span class="badge ${_relTipoClasse(d.tipo)}">${_relFmtTipo(d.tipo)||"-"}</span></td>
    <td style="max-width:240px;white-space:normal;">${_waEscaparHtml(d.mensagem||"")}</td>
    <td>${_waEscaparHtml(d.reservatorio_nome||"-")}</td>
    <td>${_waEscaparHtml(d.condominio_nome||"-")}</td>
    <td><span class="badge ${d.status==="resolvido"?"b-ok":"b-bad"}">${_relFmtTipo(d.status)||"-"}</span></td>
    <td>${_relFmtData(d.criado_em)}</td>
    <td>${d.tempo_horas!=null?_relSlaFmt(Number(d.tempo_horas)):"-"}</td>
  </tr>`).join("");

  _relAlDados = al;
  _relTelDados = tel;
}

async function gerarRelAlertas() {
  const data = await _relFetch({
    endpoint: "/relatorios/alertas",
    btnAction: "gerar-alertas",
    ids: {
      data_ini: "relAlIni", data_fim: "relAlFim",
      condominio_id: "relAlCondo", tipo: "relAlTipo", status: "relAlStatus",
    },
  });
  if (!data) return;
  _relAlDados = data;

  const dados = _relAlDados;
  const total     = dados.length;
  const ativos    = dados.filter(d => d.status === "ativo").length;
  const resolvidos= dados.filter(d => d.status === "resolvido").length;
  const tempoArr  = dados.filter(d => d.status==="resolvido"&&d.tempo_horas!=null).map(d=>Number(d.tempo_horas));
  const tempoMed  = tempoArr.length ? tempoArr.reduce((a,b)=>a+b,0)/tempoArr.length : null;

  const taxaAl = total > 0 ? Math.round(resolvidos / total * 100) : 0;

  const kpiEl = document.getElementById("relAlKpis");
  if (kpiEl) kpiEl.innerHTML =
    _relKpiCard(_SVG_ALERT, "Total no período",    total,                                         "neutral") +
    _relKpiCard(_SVG_WAVE,  "Ativos",              ativos,   ativos>0?"bad":"neutral") +
    _relKpiCard(_SVG_BAR,   "Taxa de resolução",   `${taxaAl}%`, taxaAl>=70?"ok":taxaAl>=40?"warn":"bad") +
    _relKpiCard(_SVG_CLOCK, "Tempo médio",         tempoMed!=null?_relSlaFmt(tempoMed):"—","neutral");

  const porDiaMap = {};
  dados.forEach(d => { const dia=(d.criado_em||"").split("T")[0]; if(dia) porDiaMap[dia]=(porDiaMap[dia]||0)+1; });
  const dias = Object.keys(porDiaMap).sort();

  const tipoMap = {};
  dados.forEach(d => { const t=(d.tipo||"outro").replaceAll("_"," "); tipoMap[t]=(tipoMap[t]||0)+1; });
  const tipoLabels = Object.keys(tipoMap);
  const tipoVals   = Object.values(tipoMap);
  const tipoColors = ["#ef4444","#f97316","#94a3b8","#4a78f7","#4ade80"];

  const resMap = {};
  dados.forEach(d => {
    const n = d.reservatorio_nome || d.device_id || "?";
    const condo = d.condominio_nome || "-";
    if (!resMap[n]) resMap[n] = { total:0, ativos:0, condo, tempoArr:[] };
    resMap[n].total++;
    if (d.status==="ativo") resMap[n].ativos++;
    if (d.tempo_horas!=null) resMap[n].tempoArr.push(Number(d.tempo_horas));
  });
  const top5res = Object.entries(resMap).sort(([,a],[,b])=>b.total-a.total).slice(0,5);

  const bodyEl = document.getElementById("relBodyAlertas");
  if (bodyEl) bodyEl.style.display = "";

  const _alHeadDia = document.getElementById("relAlHeadDia");
  if (_alHeadDia) _alHeadDia.innerHTML = `<span>Incidentes por dia</span>${_relBadgePeriodo("relAlIni","relAlFim")}`;

  const top5nomes  = top5res.map(([n]) => n.length > 22 ? n.slice(0,22)+"…" : n);
  const top5totais = top5res.map(([,d]) => d.total);

  requestAnimationFrame(() => {
    _relChart("relAlChartDia", _relAreaOpts("Incidentes",
      dias.map(d=>[new Date(d+"T12:00:00").getTime(), porDiaMap[d]]), "#ef4444"));
    if (tipoVals.length && tipoVals.some(v=>v>0))
      _relChart("relAlChartTipo", _relDonutOpts(tipoLabels, tipoVals, tipoColors));
    if (top5totais.length)
      _relChart("relAlChartRes", {
        chart: { type: "bar", height: "100%", toolbar: { show: false }, background: "transparent" },
        series: [{ name: "Alertas", data: top5totais }],
        xaxis: { categories: top5nomes, labels: _REL_XLBL, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: _REL_YLBL },
        plotOptions: { bar: { distributed: true, horizontal: true, borderRadius: 3, barHeight: "42%" } },
        dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: "700", colors: ["#fff"] }, textAnchor: "start", offsetX: 6 },
        colors: ["#ef4444","#f97316","#f0b014","#4a78f7","#94a3b8"],
        legend: { show: false },
        grid: { borderColor: "rgba(255,255,255,.04)", strokeDashArray: 3, padding: { left: 12, right: 12, bottom: 4, top: 4 } },
        tooltip: { theme: "dark" },
      });
  });

  const top5tbody = document.getElementById("relAlTop5Body");
  if (top5tbody) {
    const maxT5al = top5res.length ? top5res[0][1].total : 1;
    top5tbody.innerHTML = top5res.map(([nome,d]) => {
      const tM  = d.tempoArr.length ? d.tempoArr.reduce((a,b)=>a+b,0)/d.tempoArr.length : null;
      const pct = Math.round((d.total / maxT5al) * 100);
      return `<tr>
        <td>
          <div style="font-size:12px;line-height:1.3;">${_waEscaparHtml(nome)}</div>
          <div class="rel-prog"><div class="rel-prog-fill" style="width:${pct}%;background:#ef4444;"></div></div>
        </td>
        <td>${_waEscaparHtml(d.condo)}</td>
        <td style="text-align:right;">${d.total}</td>
        <td style="text-align:right;">${d.ativos>0?`<span class="badge b-bad">${d.ativos}</span>`:`<span class="badge b-ok">0</span>`}</td>
        <td style="text-align:right;">${tM!=null?_relSlaFmt(tM):"-"}</td>
      </tr>`;
    }).join("");
  }

  const tbody = document.getElementById("relAlTbody");
  if (tbody) tbody.innerHTML = dados.map(d => `<tr>
    <td>TEL-${d.id}</td>
    <td><span class="badge ${_relTipoClasse(d.tipo)}">${_relFmtTipo(d.tipo)||"-"}</span></td>
    <td style="max-width:240px;white-space:normal;">${_waEscaparHtml(d.mensagem||"")}</td>
    <td>${_waEscaparHtml(d.reservatorio_nome||"-")}</td>
    <td>${_waEscaparHtml(d.condominio_nome||"-")}</td>
    <td><span class="badge ${d.status==="resolvido"?"b-ok":"b-bad"}">${_relFmtTipo(d.status)||"-"}</span></td>
    <td>${_relFmtData(d.criado_em)}</td>
    <td>${d.tempo_horas!=null?_relSlaFmt(Number(d.tempo_horas)):"-"}</td>
  </tr>`).join("");

  const count = document.getElementById("relAlCount");
  if (count) count.textContent = _relCount(total);
}

async function gerarRelTelemetria() {
  const data = await _relFetch({
    endpoint: "/relatorios/telemetria",
    btnAction: "gerar-telemetria",
    ids: {
      data_ini: "relTelIni", data_fim: "relTelFim",
      condominio_id: "relTelCondo", device_id: "relTelDevice",
    },
  });
  if (!data) return;
  _relTelDados = data;

  const dados = _relTelDados;
  const total      = dados.length;
  const dispositivos = new Set(dados.map(d=>d.device_id)).size;
  const nivelArr   = dados.filter(d=>d.nivel_medio!=null).map(d=>Number(d.nivel_medio));
  const nivelGlobal= nivelArr.length?Math.round(nivelArr.reduce((a,b)=>a+b,0)/nivelArr.length):null;
  const bombaOn    = dados.reduce((s,d)=>s+(Number(d.leituras_bomba_on)||0),0);

  const diasCount = new Set(dados.map(d => d.dia)).size;
  const totalLeit = dados.reduce((s,d) => s+(Number(d.leituras)||0), 0);

  const kpiEl = document.getElementById("relTelKpis");
  if (kpiEl) kpiEl.innerHTML =
    _relKpiCard(_SVG_FILE,  "Dias com dados",  diasCount,                                   "neutral") +
    _relKpiCard(_SVG_CPU,   "Dispositivos",    dispositivos,                                "neutral") +
    _relKpiCard(_SVG_DROP,  "Nível médio",     nivelGlobal!=null?nivelGlobal+"%":"—",
      nivelGlobal!=null&&nivelGlobal<30?"bad":nivelGlobal!=null&&nivelGlobal<60?"warn":"ok") +
    _relKpiCard(_SVG_BAR,   "Total leituras",  totalLeit.toLocaleString("pt-BR"),           "neutral");

  // agrega por dia (média de todos os devices)
  const porDia = {};
  dados.forEach(d => {
    if (!porDia[d.dia]) porDia[d.dia] = { sum:0, count:0 };
    porDia[d.dia].sum   += Number(d.nivel_medio)||0;
    porDia[d.dia].count ++;
  });
  const dias = Object.keys(porDia).sort();
  const seriesData = dias.map(d => [new Date(d+"T12:00:00").getTime(), Math.round(porDia[d].sum/porDia[d].count)]);

  const bodyEl = document.getElementById("relBodyTelemetria");
  if (bodyEl) bodyEl.style.display = "";

  const _telHeadDia = document.getElementById("relTelHeadDia");
  if (_telHeadDia) _telHeadDia.innerHTML = `<span>Tendência de nível — média diária</span>${_relBadgePeriodo("relTelIni","relTelFim")}`;

  // ranking de dispositivos por nível médio (mais crítico primeiro)
  const devMap = {};
  dados.forEach(d => {
    if (!devMap[d.device_id]) devMap[d.device_id] = { sum:0, count:0, nome: d.reservatorio_nome || d.device_id };
    devMap[d.device_id].sum   += Number(d.nivel_medio) || 0;
    devMap[d.device_id].count ++;
  });
  const devRank = Object.values(devMap)
    .map(v => ({ nome: v.nome, avg: Math.round(v.sum / v.count) }))
    .sort((a,b) => a.avg - b.avg)  // menor nível primeiro = mais críticos no topo
    .slice(0, 8);

  requestAnimationFrame(() => {
    _relChart("relTelChartDia", Object.assign(_relAreaOpts("Nível médio (%)", seriesData, "#4a78f7"), {
      yaxis: { min:0, max:100, labels: { ..._REL_YLBL, formatter: v=>v+"%" } },
      tooltip: { theme:"dark", x:{ format:"dd/MM/yyyy" }, y:{ formatter: v=>v+"%" } },
    }));
    if (devRank.length)
      _relChart("relTelChartDev", {
        chart: { type: "bar", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 450 } },
        series: [{ name: "Nível médio", data: devRank.map(d => d.avg) }],
        xaxis: {
          categories: devRank.map(d => d.nome.length>16 ? d.nome.slice(0,16)+"…" : d.nome),
          labels: { ..._REL_XLBL, rotate: -25, hideOverlappingLabels: false, trim: false },
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        yaxis: { min: 0, max: 100, labels: { ..._REL_YLBL, formatter: v => v + "%" } },
        plotOptions: { bar: { distributed: true, borderRadius: 6, columnWidth: "48%", dataLabels: { position: "top" } } },
        dataLabels: { enabled: true, formatter: v => v + "%", offsetY: -18, style: { fontSize: "11px", fontWeight: "700", colors: ["#eef0fb"] } },
        colors: devRank.map(d => d.avg < 30 ? "#ef4444" : d.avg < 60 ? "#f0b014" : "#4ade80"),
        legend: { show: false },
        grid: { borderColor: "rgba(255,255,255,.04)", strokeDashArray: 3, padding: { left: 12, right: 12, bottom: 4, top: 4 } },
        tooltip: { theme: "dark", y: { formatter: v => v + "%" } },
      });
  });

  const tbody = document.getElementById("relTelTbody");
  if (tbody) tbody.innerHTML = dados.map(d => {
    const med = Number(d.nivel_medio);
    const cls = med<30?"b-bad":med<60?"b-warn":"b-ok";
    return `<tr>
      <td>${_relFmtData(d.dia)}</td>
      <td style="font-family:monospace;font-size:11.5px;">${_waEscaparHtml(d.device_id||"-")}</td>
      <td>${_waEscaparHtml(d.reservatorio_nome||"-")}</td>
      <td>${_waEscaparHtml(d.condominio_nome||"-")}</td>
      <td style="text-align:right;">${d.leituras??"-"}</td>
      <td style="text-align:right;">${d.nivel_min!=null?d.nivel_min+"%":"-"}</td>
      <td style="text-align:right;"><span class="badge ${cls}">${d.nivel_medio!=null?d.nivel_medio+"%":"-"}</span></td>
      <td style="text-align:right;">${d.nivel_max!=null?d.nivel_max+"%":"-"}</td>
      <td style="text-align:right;">${d.leituras_bomba_on??"-"}</td>
    </tr>`;
  }).join("");

  const count = document.getElementById("relTelCount");
  if (count) count.textContent = _relCount(total);
}

// ── DASHBOARD SLA (Fase 8C) ───────────────────────────────────────────────────

const _fmtMin = (m) => {
  if (m == null || isNaN(m)) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m - h * 60);
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
};

async function gerarRelSla() {
  const btn = document.querySelector("[data-rel-action='gerar-sla']");
  if (btn) { btn.disabled = true; btn.textContent = "Carregando…"; }
  const qs = new URLSearchParams();
  const v = (id) => document.getElementById(id)?.value || "";
  if (v("relSlIni"))   qs.set("data_ini",      v("relSlIni"));
  if (v("relSlFim"))   qs.set("data_fim",       v("relSlFim"));
  if (v("relSlCondo")) qs.set("condominio_id",  v("relSlCondo"));
  if (v("relSlPrio"))  qs.set("prioridade",     v("relSlPrio"));

  try {
    const r = await fetch(`/relatorios/sla-dashboard?${qs}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _relSlaDados = await r.json();
    _relRenderSlaDashboard(_relSlaDados);
  } catch (e) {
    console.error("[sla-dashboard]", e);
    alert("Erro ao carregar dashboard de SLA: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Gerar"; }
  }
}

function _relRenderSlaDashboard(d) {
  _relRenderSlaKpisMain(d.kpis);
  _relRenderSlaTtrChart(d.ttr_por_dia);
  _relRenderSlaWorkload(d.workload_tecnico || []);
  _relRenderSlaPorPrio(d.por_prioridade || []);
  _relRenderSlaTecnicos(d.por_tecnico);
  _relRenderSlaEmRisco(d.em_risco);
}

function _relRenderSlaWorkload(lista) {
  const el = document.getElementById("relSlChartWorkload");
  if (!el) return;
  if (!lista || !lista.length) {
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--ok);font-size:12px;">✓ Nenhum chamado aberto no momento</div>`;
    return;
  }
  requestAnimationFrame(() => {
    _relChart("relSlChartWorkload", {
      chart: { type: "bar", height: "100%", toolbar: { show: false }, background: "transparent", animations: { speed: 400 }, stacked: true },
      series: [
        { name: "P1 Crítico",    data: lista.map(t => t.p1), color: "#ef4444" },
        { name: "P2 Alta",       data: lista.map(t => t.p2), color: "#f97316" },
        { name: "P3 Controlado", data: lista.map(t => t.p3), color: "#f0b014" },
        { name: "P4 Agendado",   data: lista.map(t => t.p4), color: "#4ade80" },
      ],
      xaxis: {
        categories: lista.map(t => (t.tecnico_nome || "—").split(" ")[0]),
        labels: _REL_XLBL, axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: { labels: _REL_YLBL, allowDecimals: false, min: 0 },
      plotOptions: { bar: { borderRadius: 4, columnWidth: "44%", dataLabels: { position: "top" } } },
      dataLabels: { enabled: false },
      legend: { position: "top", fontSize: "11px", labels: { colors: "#9094ae" }, itemMargin: { horizontal: 8 } },
      grid: { ..._REL_GRID, padding: { left: 12, right: 12, bottom: 16, top: 4 } },
      tooltip: {
        theme: "dark",
        custom: ({ series, dataPointIndex }) => {
          const t = lista[dataPointIndex];
          return `<div style="padding:8px 12px;font-size:12px;">
            <div style="font-weight:600;margin-bottom:4px;">${_waEscaparHtml(t.tecnico_nome || "—")}</div>
            <div style="color:#ef4444;">P1: ${t.p1}</div>
            <div style="color:#f97316;">P2: ${t.p2}</div>
            <div style="color:#f0b014;">P3: ${t.p3}</div>
            <div style="color:#4ade80;">P4: ${t.p4}</div>
            <div style="margin-top:4px;border-top:1px solid rgba(255,255,255,.1);padding-top:4px;">Total: ${t.abertos}</div>
          </div>`;
        },
      },
    });
  });
}

function _relRenderSlaPorPrio(lista) {
  const PRIO_META = {
    p1: { label: "P1 Crítico",    color: "#ef4444", sla: "≤ 3h chegada"  },
    p2: { label: "P2 Alta",       color: "#f97316", sla: "≤ 24h chegada" },
    p3: { label: "P3 Controlado", color: "#f0b014", sla: "≤ 72h chegada" },
    p4: { label: "P4 Agendado",   color: "#4ade80", sla: "Agendado"      },
  };
  const ordem = ["p1","p2","p3","p4"];

  // Build a map indexed by prioridade (backend returns only rows with data)
  const map = {};
  (lista || []).forEach(r => { map[r.prioridade] = r; });

  // Donut chart — only prioridades with data
  const chartData = ordem.map(p => ({ p, meta: PRIO_META[p], row: map[p] || null }))
    .filter(x => x.row && x.row.total > 0);

  const chartEl = document.getElementById("relSlChartPrio");
  if (chartData.length) {
    requestAnimationFrame(() => {
      _relChart("relSlChartPrio", _relDonutOpts(
        chartData.map(x => x.meta.label),
        chartData.map(x => x.row.total),
        chartData.map(x => x.meta.color),
      ));
    });
  } else if (chartEl) {
    chartEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:220px;color:var(--muted);font-size:12px;">Sem chamados no período</div>`;
  }

  // Conformidade table — all 4 levels
  const tbody = document.getElementById("relSlPrioBody");
  if (!tbody) return;
  tbody.innerHTML = ordem.map(p => {
    const meta = PRIO_META[p];
    const row  = map[p];
    if (!row) return `<tr>
      <td><span class="badge" style="background:${meta.color}20;color:${meta.color};border:1px solid ${meta.color}40;">${meta.label}</span></td>
      <td style="text-align:right;color:var(--muted);">0</td>
      <td style="text-align:right;color:var(--muted);">—</td>
      <td style="text-align:right;color:var(--muted);">—</td>
    </tr>`;
    const slaClass = row.pct_no_sla == null ? "" : row.pct_no_sla >= 80 ? "b-ok" : row.pct_no_sla >= 50 ? "b-warn" : "b-bad";
    const slaText  = row.pct_no_sla != null ? `<span class="badge ${slaClass}">${row.pct_no_sla}%</span>` : `<span style="color:var(--muted);">—</span>`;
    return `<tr>
      <td><span class="badge" style="background:${meta.color}20;color:${meta.color};border:1px solid ${meta.color}40;">${meta.label}</span></td>
      <td style="text-align:right;">${row.total}</td>
      <td style="text-align:right;">${slaText}</td>
      <td style="text-align:right;font-size:11px;">${row.ttfr_medio_min != null ? _fmtMin(row.ttfr_medio_min) : "—"}</td>
    </tr>`;
  }).join("");
}

function _relRenderSlaKpisMain(k) {
  const el = document.getElementById("relSlKpis");
  if (!el) return;
  const slaStatus = k.pct_no_sla == null ? "neutral"
    : k.pct_no_sla >= 80 ? "ok"
    : k.pct_no_sla >= 50 ? "warn" : "bad";
  const ttfrStatus = k.ttfr_mediano_min == null ? "neutral"
    : k.ttfr_mediano_min <= 30  ? "ok"
    : k.ttfr_mediano_min <= 120 ? "warn" : "bad";
  const ttrStatus  = k.ttr_mediano_min == null ? "neutral"
    : k.ttr_mediano_min <= 120  ? "ok"
    : k.ttr_mediano_min <= 480  ? "warn" : "bad";
  const riscoStatus = k.em_risco === 0 ? "ok" : k.em_risco <= 3 ? "warn" : "bad";
  const reabStatus = k.taxa_reabertos == null ? "neutral"
    : k.taxa_reabertos === 0  ? "ok"
    : k.taxa_reabertos <= 10  ? "warn" : "bad";

  el.innerHTML =
    _relKpiCard(_SVG_CHECK, "% no SLA (TTFR)",
      k.pct_no_sla != null ? `${k.pct_no_sla}%` : "—",
      slaStatus,
      `${k.total_com_sla_data} chamados com dados de SLA`) +
    _relKpiCard(_SVG_CLOCK, "TTFR mediano",
      _fmtMin(k.ttfr_mediano_min),
      ttfrStatus,
      `tempo até a 1ª resposta · ${k.fechados} de ${k.total}`) +
    _relKpiCard(_SVG_BOLT,  "TTR mediano",
      _fmtMin(k.ttr_mediano_min),
      ttrStatus,
      `tempo até resolver · ${k.fechados} chamados fechados`) +
    _relKpiCard(_SVG_ALERT, "Em risco agora",
      k.em_risco,
      riscoStatus,
      `abertos com ≥ 50% do TTR consumido`) +
    _relKpiCard(_SVG_REVERT, "Chamados reabertos",
      k.taxa_reabertos == null ? "—" : `${k.taxa_reabertos}%`,
      reabStatus,
      `${k.reabertos} de ${k.total} chamados`);
}

function _relRenderSlaTtrChart(porDia) {
  // Calcula p90 dos valores não-nulos pra usar como cap da escala Y.
  // Sem isso, um único chamado de 7 dias estoura a escala e achata o resto
  // dos pontos pra zero (gráfico vira linha rente ao chão).
  const _capP90 = (vals) => {
    const sorted = vals.filter(v => v != null && v > 0).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const idx = Math.floor(sorted.length * 0.9);
    const p90 = sorted[Math.min(idx, sorted.length - 1)];
    // Margem 15% acima do p90, mínimo de 60min pra evitar gráfico microscópico
    return Math.max(p90 * 1.15, 60);
  };

  const _mkSlaAreaChart = (elId, seriesName, color, vals, cats) => {
    if (!vals.some(v => v != null)) {
      const el = document.getElementById(elId);
      if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px;">Sem dados no período</div>`;
      return;
    }
    const cap = _capP90(vals);
    const outliers = cap ? vals.filter(v => v != null && v > cap).length : 0;
    const yaxisCfg = { labels: { ..._REL_YLBL, formatter: v => _fmtMin(v) } };
    if (cap != null) yaxisCfg.max = cap;

    _relChart(elId, {
      chart: {
        type: "area",
        height: "100%",  // _relChart converte em altura numérica do parent
        toolbar: { show: false },
        background: "transparent",
        zoom: { enabled: false },
        animations: { enabled: true, speed: 400 },
      },
      theme: { mode: "dark" },
      series: [{ name: seriesName, data: vals }],
      xaxis: {
        categories: cats,
        labels: {
          ..._REL_XLBL,
          formatter: v => {
            if (!v) return "";
            // Backend retorna DATE como ISO string "2026-05-27T03:00:00.000Z"
            // ou só "2026-05-27" — extrai DD/MM em ambos os casos
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return String(d.getUTCDate()).padStart(2, "0") + "/" +
                   String(d.getUTCMonth() + 1).padStart(2, "0");
          },
          rotate: 0,
          hideOverlappingLabels: true,
          trim: false,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tickAmount: Math.min(8, cats.length),
        tooltip: { enabled: false },
      },
      yaxis: yaxisCfg,
      stroke: { curve: "smooth", width: 2 },
      fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: .35, opacityTo: .05, stops: [0, 100] } },
      colors: [color],
      markers: { size: 0, hover: { size: 4 } },
      dataLabels: { enabled: false },
      tooltip: { theme: "dark", y: { formatter: v => _fmtMin(v) } },
      grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 3, padding: { left: 12, right: 12, top: 4, bottom: 4 } },
      // Nota discreta no canto inferior se houver outlier acima do cap
      ...(outliers > 0 ? {
        subtitle: {
          text: `${outliers} outlier${outliers > 1 ? "s" : ""} acima de ${_fmtMin(cap)} (fora da escala)`,
          align: "right",
          offsetY: 6,
          style: { fontSize: "10px", color: "#9094ae" },
        },
      } : {}),
    });
  };

  if (!porDia || !porDia.length) {
    ["relSlChartTtr","relSlChartTtfr"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px;">Sem dados no período</div>`;
    });
    return;
  }
  const cats     = porDia.map(d => d.dia);
  const ttrVals  = porDia.map(d => d.ttr_medio_min  != null ? Number(d.ttr_medio_min)  : null);
  const ttfrVals = porDia.map(d => d.ttfr_medio_min != null ? Number(d.ttfr_medio_min) : null);
  requestAnimationFrame(() => {
    _mkSlaAreaChart("relSlChartTtr",  "TTR médio (min)",  "#f0b014", ttrVals,  cats);
    _mkSlaAreaChart("relSlChartTtfr", "TTFR médio (min)", "#4a78f7", ttfrVals, cats);
  });
}

function _relRenderSlaTecnicos(lista) {
  const tbody = document.getElementById("relSlTecBody");
  if (!tbody) return;
  if (!lista || !lista.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">Nenhum técnico com chamados no período</td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(t => {
    const slaClass = t.pct_no_sla == null ? "" : t.pct_no_sla >= 80 ? "b-ok" : t.pct_no_sla >= 50 ? "b-warn" : "b-bad";
    const stars = t.nota_media != null ? `${Number(t.nota_media).toFixed(1)} ★` : "—";
    return `<tr>
      <td style="font-size:12px;font-weight:500;">${_waEscaparHtml(t.tecnico_nome || "—")}</td>
      <td style="text-align:right;">${t.total}</td>
      <td style="text-align:right;">${_fmtMin(t.ttfr_medio_min)}</td>
      <td style="text-align:right;">${_fmtMin(t.ttr_medio_min)}</td>
      <td style="text-align:right;">${t.pct_no_sla != null ? `<span class="badge ${slaClass}">${t.pct_no_sla}%</span>` : "—"}</td>
      <td style="text-align:right;color:var(--accent);">${stars}</td>
    </tr>`;
  }).join("");
}

function _relRenderSlaEmRisco(lista) {
  const tbody = document.getElementById("relSlRiscoBody");
  if (!tbody) return;
  if (!lista || !lista.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ok);padding:20px;">✓ Nenhum chamado em risco no momento</td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(ch => {
    const pct = Math.min(ch.pct_ttr, 999);
    const barColor = pct >= 100 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "#4a78f7";
    const prioClass = { p1: "b-bad", p2: "b-warn", p3: "b-info", p4: "" }[ch.prioridade] || "";
    const prioLabel = { p1: "P1 Crítico", p2: "P2 Alta", p3: "P3 Controlado", p4: "P4 Agendado" }[ch.prioridade] || ch.prioridade;
    return `<tr>
      <td>
        <div style="font-size:12px;font-weight:500;">CH-${String(ch.id).padStart(4,"0")}</div>
        <div style="font-size:11px;color:var(--muted);">${_waEscaparHtml(ch.titulo || "Sem título")}</div>
      </td>
      <td><span class="badge ${prioClass}">${prioLabel}</span></td>
      <td style="font-size:12px;">${_waEscaparHtml(ch.condominio_nome || "—")}</td>
      <td style="min-width:120px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;">
            <div style="height:100%;width:${Math.min(pct,100)}%;background:${barColor};border-radius:3px;transition:width .4s;"></div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${barColor};white-space:nowrap;">${pct}%</span>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;">${_fmtMin(ch.minutos_abertos)} de ${_fmtMin(ch.ttr_min)}</div>
      </td>
    </tr>`;
  }).join("");
}


async function gerarRelInsights() {
  const data = await _relFetch({
    endpoint: "/relatorios/insights",
    btnAction: "gerar-insights",
    ids: { data_ini: "relInIni", data_fim: "relInFim", condominio_id: "relInCondo" },
  });
  if (!data) return;
  _relInDados = data;

  const { top_condominios = [], categorias_whatsapp = [], totais = {} } = data;

  const bodyEl = document.getElementById("relBodyInsights");
  if (bodyEl) bodyEl.style.display = "";

  // KPIs do header
  const kpiEl = document.getElementById("relInKpis");
  if (kpiEl) kpiEl.innerHTML =
    _relKpiCard(_SVG_FILE,  "Chamados no período", totais.chamados_total ?? 0, "neutral") +
    _relKpiCard(_SVG_ALERT, "Alertas no período",  totais.alertas_total  ?? 0, totais.alertas_total > 0 ? "warn" : "neutral") +
    _relKpiCard(_SVG_BAR,   "Msgs Atendimento",     totais.msgs_total     ?? 0, "neutral") +
    _relKpiCard(_SVG_CPU,   "Condomínios c/ problemas", top_condominios.length, top_condominios.length > 0 ? "warn" : "ok");

  // Header com badge de período
  const headTop = document.getElementById("relInHeadTop");
  if (headTop) headTop.innerHTML = `<span>Condomínios mais problemáticos</span>${_relBadgePeriodo("relInIni","relInFim")}`;
  const headCat = document.getElementById("relInHeadCat");
  if (headCat) headCat.innerHTML = `<span>Categorias mais comuns no atendimento</span>${_relBadgePeriodo("relInIni","relInFim")}`;

  // Top condomínios — tabela com barra de score
  const tbodyTop = document.getElementById("relInTopBody");
  if (tbodyTop) {
    if (top_condominios.length === 0) {
      tbodyTop.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px 0;font-size:12px;">Sem dados no período</td></tr>`;
    } else {
      const maxScore = top_condominios[0].score || 1;
      tbodyTop.innerHTML = top_condominios.slice(0, 5).map(c => {
        const pct = Math.round((c.score / maxScore) * 100);
        return `<tr>
          <td>
            <div style="font-size:12px;line-height:1.3;">${_waEscaparHtml(c.nome)}</div>
            <div class="rel-prog"><div class="rel-prog-fill" style="width:${pct}%;background:#ef4444;"></div></div>
          </td>
          <td style="text-align:right;font-weight:700;">${c.score}</td>
          <td style="text-align:right;">${c.chamados_abertos > 0 ? `<span class="badge b-bad">${c.chamados_abertos}/${c.chamados_total}</span>` : c.chamados_total}</td>
          <td style="text-align:right;">${c.alertas_ativos > 0 ? `<span class="badge b-warn">${c.alertas_ativos}/${c.alertas_total}</span>` : c.alertas_total}</td>
          <td style="text-align:right;">${c.sla_horas > 0 ? _relSlaFmt(Number(c.sla_horas)) : "-"}</td>
        </tr>`;
      }).join("");
    }
  }

  // Donut de categorias
  requestAnimationFrame(() => {
    if (categorias_whatsapp.length === 0) {
      const el = document.getElementById("relInChartCat");
      if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:12px;">Sem mensagens classificadas no período</div>`;
      return;
    }
    const labels = categorias_whatsapp.map(c => _relCategoriaLabel(c.categoria));
    const values = categorias_whatsapp.map(c => c.total);
    const colors = ["#ef4444","#f0b014","#4a78f7","#8b5cf6","#4ade80","#f97316","#06b6d4","#94a3b8"];
    _relChart("relInChartCat", _relDonutOpts(labels, values, colors));
  });

  // KPIs de SLA — busca em paralelo, falhas só logam (não bloqueiam Insights)
  _relCarregarSlaMetricas();
}

// ── Fase 8A: KPIs de SLA na aba Insights ─────────────────────────────────
async function _relCarregarSlaMetricas() {
  const wrap = document.getElementById("relInSlaKpis");
  if (!wrap) return;
  const ini = document.getElementById("relInIni")?.value || "";
  const fim = document.getElementById("relInFim")?.value || "";
  const cnd = document.getElementById("relInCondo")?.value || "";
  const qs = new URLSearchParams();
  if (ini) qs.set("data_ini", ini);
  if (fim) qs.set("data_fim", fim);
  if (cnd) qs.set("condominio_id", cnd);
  try {
    const r = await fetch(`/relatorios/sla-metricas?${qs}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const k = await r.json();
    wrap.innerHTML = _relRenderSlaKpis(k);
  } catch (e) {
    console.warn("[insights] sla-metricas:", e.message);
    wrap.innerHTML = `<div class="rel-sla-empty">Sem dados de SLA no período</div>`;
  }
}

function _relRenderSlaKpis(k) {
  // Formatadores: minutos viram "Xm" ou "Xh Ym" se > 60
  const fmtMin = (m) => {
    if (m == null) return "—";
    if (m < 60)  return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const r = Math.round(m - h * 60);
    return r > 0 ? `${h}h ${r}m` : `${h}h`;
  };
  const ttfrStatus = k.ttfr_mediano_min == null ? "neutral"
    : k.ttfr_mediano_min <= 30  ? "ok"
    : k.ttfr_mediano_min <= 120 ? "warn" : "bad";
  const ttrStatus = k.ttr_mediano_min == null ? "neutral"
    : k.ttr_mediano_min <= 120  ? "ok"
    : k.ttr_mediano_min <= 480  ? "warn" : "bad";
  const lt1hStatus = k.taxa_resolucao_lt1h == null ? "neutral"
    : k.taxa_resolucao_lt1h >= 60 ? "ok"
    : k.taxa_resolucao_lt1h >= 30 ? "warn" : "bad";
  const reabStatus = k.taxa_reabertos == null ? "neutral"
    : k.taxa_reabertos === 0  ? "ok"
    : k.taxa_reabertos <= 10  ? "warn" : "bad";

  return (
    _relKpiCard(_SVG_CLOCK, "Primeira resposta (TTFR)",
      fmtMin(k.ttfr_mediano_min),
      ttfrStatus,
      `mediana · ${k.com_resposta} de ${k.total} chamados`) +
    _relKpiCard(_SVG_CHECK, "Resolução (TTR)",
      fmtMin(k.ttr_mediano_min),
      ttrStatus,
      `mediana · ${k.fechados} chamados fechados`) +
    _relKpiCard(_SVG_BOLT, "Resolvidos em < 1h",
      k.taxa_resolucao_lt1h == null ? "—" : `${k.taxa_resolucao_lt1h}%`,
      lt1hStatus,
      `${k.resolvidos_lt1h} de ${k.fechados} fechados`) +
    _relKpiCard(_SVG_REVERT, "Chamados reabertos",
      k.taxa_reabertos == null ? "—" : `${k.taxa_reabertos}%`,
      reabStatus,
      `${k.reabertos_pendentes} de ${k.total} chamados`)
  );
}

async function exportarRelPdf() {
  const ini   = document.getElementById("relChIni")?.value        || "";
  const fim   = document.getElementById("relChFim")?.value        || "";
  const condo = document.getElementById("relChCondo")?.value      || "";
  const prio  = document.getElementById("relChPrioridade")?.value || "";
  const st    = document.getElementById("relChStatus")?.value     || "";
  const tec   = document.getElementById("relChTecnico")?.value    || "";

  const params = new URLSearchParams();
  if (ini)   params.set("data_ini", ini);
  if (fim)   params.set("data_fim", fim);
  if (condo) params.set("condominio_id", condo);
  if (prio)  params.set("prioridade", prio);
  if (st)    params.set("status", st);
  if (tec)   params.set("tecnico_id", tec);

  const btn = document.querySelector("[data-rel-action='exportar-pdf']");
  if (btn) { btn.disabled = true; btn.textContent = "Gerando…"; }

  try {
    const res = await fetch(`/relatorios/pdf-chamados?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Falha ao gerar PDF");
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `relatorio-chamados-${ini || "todos"}-${fim || "todos"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Erro ao gerar PDF: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Exportar PDF"; }
  }
}

// ============================================================
//  CONFIGURAÇÕES
// ============================================================
let _cfgTab = "conta";
let _cfgConfigs = null;     // { valores, definicoes, padroes } do GET /admin/configuracoes
let _cfgUsuariosDados = [];
let _cfgCarregado = { conta: false, usuarios: false, ia: false, notificacoes: false, operacional: false, sla: false, manutencao: false, integracoes: false };

const _CFG_TABS = {
  conta:        { body: "cfgBodyConta",        carregar: () => _cfgCarregarConta() },
  usuarios:     { body: "cfgBodyUsuarios",     carregar: () => _cfgCarregarUsuarios() },
  ia:           { body: "cfgBodyIa",           carregar: () => { _cfgCarregarConfigs(); _cfgCarregarCuradoria(); } },
  notificacoes: { body: "cfgBodyNotificacoes", carregar: () => _cfgCarregarConfigs() },
  operacional:  { body: "cfgBodyOperacional",  carregar: () => _cfgCarregarConfigs() },
  sla:          { body: "cfgBodySla",          carregar: () => _cfgCarregarSla() },
  manutencao:   { body: "cfgBodyManutencao",   carregar: () => _cfgCarregarManutencao() },
  integracoes:  { body: "cfgBodyIntegracoes",  carregar: () => _cfgCarregarIntegracoes() },
};

function _cfgMostrarTab(tab) {
  const conf = _CFG_TABS[tab];
  if (!conf) return;
  _cfgTab = tab;
  document.querySelectorAll("#cfgTabs .wa-tab").forEach(btn =>
    btn.classList.toggle("is-active", btn.dataset.cfgTab === tab)
  );
  document.querySelectorAll(".cfg-body").forEach(b => b.style.display = "none");
  const bodyEl = document.getElementById(conf.body);
  if (bodyEl) bodyEl.style.display = "";
  if (!_cfgCarregado[tab]) {
    _cfgCarregado[tab] = true;
    conf.carregar();
  }
}

// Decodifica id do usuário do JWT (pra marcar "Você" e bloquear auto-remoção)
function _cfgMyId() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1])).id;
  } catch { return null; }
}

function renderConfiguracoes() {
  // Mostra/esconde tabs que exigem master admin
  ["usuarios","ia","notificacoes","operacional","sla","manutencao","integracoes"].forEach(t => {
    const btn = document.querySelector(`[data-cfg-tab="${t}"]`);
    if (btn) btn.style.display = _isMaster ? "" : "none";
  });
  // Se não for master e estava numa tab restrita, volta pra Conta
  if (!_isMaster && _cfgTab !== "conta") _cfgTab = "conta";
  _cfgMostrarTab(_cfgTab);
}

function _cfgMostrarMsg(elId, texto, cls) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = texto || "";
  el.className = "cfg-msg" + (cls ? " " + cls : "");
  if (texto) setTimeout(() => { if (el.textContent === texto) el.textContent = ""; }, 4000);
}

// ── CONTA ────────────────────────────────────────────────────────────────────
async function _cfgCarregarConta() {
  const el = document.getElementById("cfgDispLista");
  if (!el) return;
  try {
    const r = await fetch("/auth/dispositivos", { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    const lista = await r.json();
    if (!lista.length) {
      el.innerHTML = `<div class="cfg-empty">Nenhum dispositivo confiável.</div>`;
      return;
    }
    el.innerHTML = lista.map(d => {
      const criado = new Date(d.criado_em).toLocaleDateString("pt-BR");
      const expira = new Date(d.expires_at).toLocaleDateString("pt-BR");
      return `<div class="cfg-disp-item ${d.atual ? "atual" : ""}">
        <div class="cfg-disp-info">
          <div>Dispositivo confiável ${d.atual ? '<span class="cfg-disp-tag">Este</span>' : ''}</div>
          <div class="cfg-disp-meta">Confiável desde ${criado} · expira em ${expira}</div>
        </div>
        ${d.atual ? '' : `<button class="btn btn-sm" data-cfg-action="revogar-disp" data-id="${d.id}">Revogar</button>`}
      </div>`;
    }).join("");
  } catch (e) {
    el.innerHTML = `<div class="cfg-empty">Erro ao carregar dispositivos.</div>`;
  }
}

async function _cfgTrocarSenha() {
  const atual = document.getElementById("cfgSenhaAtual")?.value;
  const nova  = document.getElementById("cfgSenhaNova")?.value;
  const conf  = document.getElementById("cfgSenhaNovaConf")?.value;
  if (!atual || !nova || !conf) return _cfgMostrarMsg("cfgSenhaMsg", "Preencha todos os campos", "err");
  if (nova !== conf) return _cfgMostrarMsg("cfgSenhaMsg", "Senha nova e confirmação não conferem", "err");
  if (nova.length < 6) return _cfgMostrarMsg("cfgSenhaMsg", "Mínimo 6 caracteres", "err");

  try {
    const r = await fetch("/auth/trocar-senha", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
    });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg("cfgSenhaMsg", data.error || "Erro ao trocar senha", "err");
    _cfgMostrarMsg("cfgSenhaMsg", "Senha atualizada com sucesso", "ok");
    ["cfgSenhaAtual","cfgSenhaNova","cfgSenhaNovaConf"].forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
  } catch (e) {
    _cfgMostrarMsg("cfgSenhaMsg", "Erro de conexão", "err");
  }
}

async function _cfgRevogarDispositivo(id) {
  if (!confirm("Revogar este dispositivo? Ele exigirá 2FA no próximo acesso.")) return;
  try {
    const r = await fetch(`/auth/dispositivos/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    _cfgCarregarConta();
  } catch (e) {
    alert("Erro ao revogar dispositivo.");
  }
}

async function _cfgSairTodos() {
  if (!confirm("Sair de TODOS os dispositivos? Isso vai forçar 2FA em todos os próximos acessos seus.")) return;
  try {
    const r = await fetch("/auth/dispositivos", { method: "DELETE", headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    _cfgCarregarConta();
    alert("Dispositivos revogados com sucesso.");
  } catch (e) {
    alert("Erro ao revogar dispositivos.");
  }
}

// ── CONFIGS GLOBAIS (IA + Notificações) ──────────────────────────────────────
async function _cfgCarregarConfigs() {
  if (_cfgConfigs) { _cfgAplicarConfigsUI(); return; }
  try {
    const r = await fetch("/admin/configuracoes", { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    _cfgConfigs = await r.json();
    _cfgAplicarConfigsUI();
  } catch (e) {
    console.error("[cfg] erro ao carregar configs:", e);
  }
}

function _cfgAplicarConfigsUI() {
  const v = _cfgConfigs?.valores || {};
  // IA
  const enabled = document.getElementById("cfgIaEnabled");   if (enabled) enabled.checked = v["ia.enabled"] === "true";
  const modelo  = document.getElementById("cfgIaModelo");    if (modelo)  modelo.value   = v["ia.modelo"] || "gpt-4o-mini";
  const prompt  = document.getElementById("cfgIaPrompt");    if (prompt)  prompt.value   = v["ia.system_prompt"] || (_cfgConfigs?.padroes?.["ia.system_prompt"] || "");
  const waTout  = document.getElementById("cfgWaSessaoTimeout"); if (waTout) waTout.value = v["whatsapp.sessao_timeout_horas"] || "8";
  // Notificações
  const email   = document.getElementById("cfgEmailDestinatario"); if (email)   email.value   = v["alertas.email_destinatario"] || "";
  const interv  = document.getElementById("cfgOfflineIntervalo");  if (interv)  interv.value  = v["jobs.offline_intervalo_min"] || "1";
  // Manutenção
  const ret     = document.getElementById("cfgLeiturasRetencaoDias"); if (ret) ret.value = v["leituras.retencao_dias"] || "60";
  const dry     = document.getElementById("cfgLeiturasDryRun");       if (dry) dry.checked = v["leituras.cleanup_dry_run"] === "true";
  const aRet    = document.getElementById("cfgAlertasRetencaoDias");  if (aRet) aRet.value = v["alertas.retencao_dias"] || "365";
  const aDry    = document.getElementById("cfgAlertasDryRun");        if (aDry) aDry.checked = v["alertas.cleanup_dry_run"] === "true";
  const cRet    = document.getElementById("cfgConversasRetencaoDias");if (cRet) cRet.value = v["conversas.retencao_dias"] || "365";
  const cDry    = document.getElementById("cfgConversasDryRun");      if (cDry) cDry.checked = v["conversas.cleanup_dry_run"] === "true";
  // Operacional
  const gpsFreq = document.getElementById("cfgGpsFrequencia");        if (gpsFreq) gpsFreq.value = v["gps.frequencia_segundos"] || "60";
  const gpsRet  = document.getElementById("cfgGpsRetencaoHoras");     if (gpsRet)  gpsRet.value  = v["gps.retencao_horas"] || "24";
  const atrEn   = document.getElementById("cfgAtrasoEnabled");        if (atrEn)   atrEn.checked = v["chamados.alerta_atraso_enabled"] !== "false"; // default ligado
  const atrHr   = document.getElementById("cfgAtrasoHoras");          if (atrHr)   atrHr.value   = v["chamados.alerta_atraso_horas"] || "4";
}

async function _cfgSalvarIa() {
  const payload = {
    "ia.enabled":       document.getElementById("cfgIaEnabled")?.checked ? "true" : "false",
    "ia.modelo":        document.getElementById("cfgIaModelo")?.value || "gpt-4o-mini",
    "ia.system_prompt": document.getElementById("cfgIaPrompt")?.value || "",
  };
  await _cfgEnviarConfigs(payload, "cfgIaMsg", "Configurações de IA salvas");
}

async function _cfgSalvarWaSessao() {
  const v = document.getElementById("cfgWaSessaoTimeout")?.value;
  if (!v || isNaN(Number(v))) return;
  await _cfgEnviarConfigs({ "whatsapp.sessao_timeout_horas": String(Math.round(Number(v))) }, "cfgWaSessaoMsg", "Tempo de sessão salvo");
}

async function _cfgSalvarNotificacoes() {
  const payload = {
    "alertas.email_destinatario": document.getElementById("cfgEmailDestinatario")?.value || "",
    "jobs.offline_intervalo_min": document.getElementById("cfgOfflineIntervalo")?.value || "1",
  };
  await _cfgEnviarConfigs(payload, "cfgNotifMsg", "Notificações salvas");
}

async function _cfgEnviarConfigs(payload, msgId, sucessoTxt) {
  try {
    const r = await fetch("/admin/configuracoes", {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg(msgId, data.error || "Erro ao salvar", "err");
    _cfgConfigs = { ..._cfgConfigs, valores: data.valores };
    _cfgMostrarMsg(msgId, sucessoTxt, "ok");
  } catch (e) {
    _cfgMostrarMsg(msgId, "Erro de conexão", "err");
  }
}

function _cfgRestaurarPrompt() {
  const padrao = _cfgConfigs?.padroes?.["ia.system_prompt"];
  if (!padrao) return;
  if (!confirm("Restaurar o system prompt para o padrão? Sua versão atual será substituída.")) return;
  const el = document.getElementById("cfgIaPrompt");
  if (el) el.value = padrao;
}

// ── Curadoria de conversas (Fase 10A) ────────────────────────────────────────
async function _cfgCarregarCuradoria() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    const r = await fetch("/whatsapp/conversas/curadoria/stats", { headers: authHeaders() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const s = await r.json();
    set("cfgCurExc",  s.excelente);
    set("cfgCurBoa",  s.boa);
    set("cfgCurAce",  s.aceitavel);
    set("cfgCurRuim", s.ruim);
    const hint = document.getElementById("cfgCurHint");
    if (hint) {
      const total = s.exportavel || 0;
      hint.textContent = total > 0
        ? `${total} conversa${total === 1 ? "" : "s"} pronta${total === 1 ? "" : "s"} pra exportar (Excelente + Boa). PII é sanitizado automaticamente antes do download.`
        : "Nenhuma conversa marcada como Excelente ou Boa ainda. Avalie no painel do WhatsApp e volte aqui pra exportar.";
    }
  } catch (e) {
    _cfgMostrarMsg("cfgCurMsg", "Erro ao carregar: " + e.message, "danger");
  }
}

async function _cfgExportarCuradoria(btn) {
  _cfgMostrarMsg("cfgCurMsg", "Gerando dataset…", "");
  if (btn) btn.disabled = true;
  try {
    const r = await fetch("/whatsapp/conversas/export?qualidade=excelente,boa", { headers: authHeaders() });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || ("HTTP " + r.status));
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversas-curadas-${new Date().toISOString().slice(0,10)}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    _cfgMostrarMsg("cfgCurMsg", "Download iniciado", "ok");
  } catch (e) {
    _cfgMostrarMsg("cfgCurMsg", "Erro: " + e.message, "danger");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── OPERACIONAL (Fase 7I — GPS + alerta de atraso) ───────────────────────────
async function _cfgSalvarOperacional() {
  const payload = {
    "gps.frequencia_segundos":         document.getElementById("cfgGpsFrequencia")?.value || "60",
    "gps.retencao_horas":              document.getElementById("cfgGpsRetencaoHoras")?.value || "24",
    "chamados.alerta_atraso_enabled":  document.getElementById("cfgAtrasoEnabled")?.checked ? "true" : "false",
    "chamados.alerta_atraso_horas":    document.getElementById("cfgAtrasoHoras")?.value || "4",
  };
  await _cfgEnviarConfigs(payload, "cfgOperMsg", "Configurações operacionais salvas");
}

async function _cfgRodarChamadosAtraso() {
  if (!confirm("Rodar verificação de chamados parados agora? Se houver alguém estourado, um email será enviado pra lista de destinatários.")) return;
  _cfgMostrarMsg("cfgOperMsg", "Verificando…", "");
  try {
    const r = await fetch("/admin/jobs/chamados-atraso/run", { method: "POST", headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg("cfgOperMsg", data.error || "Erro ao executar", "err");
    if (!data.enabled) {
      _cfgMostrarMsg("cfgOperMsg", "Alerta está desativado — ligue o toggle e salve antes de testar.", "err");
      return;
    }
    _cfgMostrarMsg("cfgOperMsg",
      data.avisados > 0
        ? `${data.avisados} email(s) enviado(s). Limite: ${data.horas}h.`
        : `Nenhum chamado estourado (limite ${data.horas}h).`,
      "ok");
  } catch (e) {
    _cfgMostrarMsg("cfgOperMsg", "Erro de conexão", "err");
  }
}

// ── SLA configurável (Fase 8B) ────────────────────────────────────────────────

const _SLA_PRIO_LABEL = { p1: "P1 Crítico", p2: "P2 Alta", p3: "P3 Controlado", p4: "P4 Agendado" };
const _SLA_PRIO_ORDEM = ["p1", "p2", "p3", "p4"];

async function _cfgCarregarSla() {
  const tbody = document.getElementById("slaTableBody");
  if (!tbody) return;
  try {
    const r = await fetch("/admin/sla", { headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = await r.json();
    tbody.innerHTML = rows.map(row => _slaRenderRow(row)).join("");
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:24px;">Erro ao carregar: ${e.message}</td></tr>`;
  }
}

function _slaRenderRow(row) {
  const p = row.prioridade;
  const label = _SLA_PRIO_LABEL[p] || p;
  return `<tr data-sla-prio="${p}">
    <td><span class="sla-prio-pill p-${p}">${label}</span></td>
    <td><input type="number" class="sla-input" id="slaT_${p}_ttfr" value="${row.ttfr_min}" min="1" max="9999"></td>
    <td><input type="number" class="sla-input" id="slaT_${p}_ttr"  value="${row.ttr_min}"  min="1" max="99999"></td>
    <td style="text-align:right;">
      <button class="btn btn-sm sla-save-btn" data-sla-save="${p}">Salvar</button>
      <span class="sla-row-msg" id="slaMsg_${p}"></span>
    </td>
  </tr>`;
}

async function _slaSalvarLinha(prioridade) {
  const ttfr = Number(document.getElementById(`slaT_${prioridade}_ttfr`)?.value);
  const ttr  = Number(document.getElementById(`slaT_${prioridade}_ttr`)?.value);
  const msg  = document.getElementById(`slaMsg_${prioridade}`);
  if (!Number.isInteger(ttfr) || ttfr <= 0 || !Number.isInteger(ttr) || ttr <= 0) {
    if (msg) { msg.style.color = "var(--danger)"; msg.textContent = "Valores inválidos"; msg.classList.add("visible"); }
    return;
  }
  if (ttfr >= ttr) {
    if (msg) { msg.style.color = "var(--danger)"; msg.textContent = "TTFR deve ser < TTR"; msg.classList.add("visible"); }
    return;
  }
  try {
    const r = await fetch(`/admin/sla/${prioridade}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ttfr_min: ttfr, ttr_min: ttr }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    if (msg) {
      msg.style.color = "#4ade80";
      msg.textContent = "Salvo!";
      msg.classList.add("visible");
      setTimeout(() => msg.classList.remove("visible"), 2500);
    }
    // Invalida o cache de chamados para que o próximo poll mostre badges atualizados
    _chamadosData = null;
  } catch (e) {
    if (msg) { msg.style.color = "var(--danger)"; msg.textContent = e.message; msg.classList.add("visible"); }
  }
}

// ── MANUTENÇÃO (limpeza de leituras) ─────────────────────────────────────────
async function _cfgCarregarManutencao() {
  // Carrega configs (compartilha cache com IA/Notificações)
  await _cfgCarregarConfigs();
  // Busca o status do último ciclo de limpeza dos 3 jobs
  try {
    const r = await fetch("/admin/integracoes/status", { headers: authHeaders() });
    if (r.ok) {
      const s = await r.json();
      _cfgRenderUltimaLimpeza(s.job_leituras_cleanup);
      _cfgRenderUltimaAlertas(s.job_alertas_cleanup);
      _cfgRenderUltimaConversas(s.job_conversas_cleanup);
    }
  } catch (e) {
    console.warn("[cfg] status manutenção:", e.message);
  }
}

function _cfgRenderUltimaLimpeza(jb) {
  const card = document.getElementById("cfgManutResultadoCard");
  const body = document.getElementById("cfgManutResultadoBody");
  if (!card || !body) return;
  if (!jb || !jb.ultima_execucao) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";
  const quando = new Date(jb.ultima_execucao).toLocaleString("pt-BR");
  const r = jb.ultimo_resultado || {};
  const linhas = [];
  linhas.push(`<div><strong>Quando:</strong> ${quando}</div>`);
  if (r.dry_run) {
    linhas.push(`<div><strong>Modo:</strong> seguro (não apagou)</div>`);
    linhas.push(`<div><strong>Linhas que seriam removidas:</strong> ${Number(r.seriam_removidos || 0).toLocaleString("pt-BR")}</div>`);
  } else {
    linhas.push(`<div><strong>Linhas removidas:</strong> ${Number(r.removidos || 0).toLocaleString("pt-BR")}</div>`);
    if (r.lotes != null)      linhas.push(`<div><strong>Lotes executados:</strong> ${r.lotes}</div>`);
    if (r.duracao_ms != null) linhas.push(`<div><strong>Duração:</strong> ${(r.duracao_ms / 1000).toFixed(1)}s</div>`);
    if (r.truncado)           linhas.push(`<div style="color:#f59e0b;"><strong>⚠ Atingiu o limite de lotes</strong> — talvez precise rodar de novo</div>`);
  }
  linhas.push(`<div><strong>Retenção configurada:</strong> ${r.retencao_dias || "?"} dias</div>`);
  body.innerHTML = linhas.join("");
}

async function _cfgSalvarManutencao() {
  const dias = document.getElementById("cfgLeiturasRetencaoDias")?.value || "60";
  const dry  = document.getElementById("cfgLeiturasDryRun")?.checked ? "true" : "false";
  const payload = {
    "leituras.retencao_dias":   String(dias),
    "leituras.cleanup_dry_run": dry,
  };
  await _cfgEnviarConfigs(payload, "cfgManutMsg", "Configuração salva");
}

async function _cfgRodarLimpezaLeituras() {
  const dry = document.getElementById("cfgLeiturasDryRun")?.checked;
  const aviso = dry
    ? "Rodar limpeza agora em MODO SEGURO (só conta, não apaga)?"
    : "Rodar limpeza agora? Isso vai APAGAR de verdade as leituras antigas. Tem certeza?";
  if (!confirm(aviso)) return;

  _cfgMostrarMsg("cfgManutMsg", "Executando…", "");
  try {
    const r = await fetch("/admin/jobs/leituras-cleanup/run", {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg("cfgManutMsg", data.error || "Erro ao executar", "err");
    _cfgMostrarMsg("cfgManutMsg",
      data.dry_run
        ? `Modo seguro: ${Number(data.seriam_removidos).toLocaleString("pt-BR")} linhas seriam apagadas`
        : `Removidas ${Number(data.removidos).toLocaleString("pt-BR")} linhas em ${data.lotes} lote(s)`,
      "ok");
    // Atualiza o card de "última execução" sem recarregar tudo
    _cfgRenderUltimaLimpeza({
      ultima_execucao: new Date().toISOString(),
      ultimo_resultado: data,
    });
  } catch (e) {
    _cfgMostrarMsg("cfgManutMsg", "Erro de conexão", "err");
  }
}

// ── Fase 9E: alertas resolvidos antigos ───────────────────────────────────
function _cfgRenderUltimaAlertas(jb) {
  const card = document.getElementById("cfgAlertasResultadoCard");
  const body = document.getElementById("cfgAlertasResultadoBody");
  if (!card || !body) return;
  if (!jb || !jb.ultima_execucao) { card.style.display = "none"; return; }
  card.style.display = "";
  const quando = new Date(jb.ultima_execucao).toLocaleString("pt-BR");
  const r = jb.ultimo_resultado || {};
  const linhas = [`<div><strong>Quando:</strong> ${quando}</div>`];
  if (r.dry_run) {
    linhas.push(`<div><strong>Modo:</strong> seguro (não apagou)</div>`);
    linhas.push(`<div><strong>Alertas que seriam removidos:</strong> ${Number(r.seriam_removidos || 0).toLocaleString("pt-BR")}</div>`);
  } else {
    linhas.push(`<div><strong>Alertas removidos:</strong> ${Number(r.removidos || 0).toLocaleString("pt-BR")}</div>`);
    if (r.comentarios_removidos != null) linhas.push(`<div><strong>Comentários removidos:</strong> ${Number(r.comentarios_removidos).toLocaleString("pt-BR")}</div>`);
    if (r.lotes != null)      linhas.push(`<div><strong>Lotes:</strong> ${r.lotes}</div>`);
    if (r.duracao_ms != null) linhas.push(`<div><strong>Duração:</strong> ${(r.duracao_ms / 1000).toFixed(1)}s</div>`);
    if (r.truncado)           linhas.push(`<div style="color:#f59e0b;"><strong>⚠ Atingiu o limite de lotes</strong> — talvez precise rodar de novo</div>`);
  }
  linhas.push(`<div><strong>Retenção configurada:</strong> ${r.retencao_dias || "?"} dias</div>`);
  body.innerHTML = linhas.join("");
}

async function _cfgSalvarAlertasRetencao() {
  const payload = {
    "alertas.retencao_dias":   String(document.getElementById("cfgAlertasRetencaoDias")?.value || "365"),
    "alertas.cleanup_dry_run": document.getElementById("cfgAlertasDryRun")?.checked ? "true" : "false",
  };
  await _cfgEnviarConfigs(payload, "cfgAlertasMsg", "Configuração salva");
}

async function _cfgRodarLimpezaAlertas() {
  const dry = document.getElementById("cfgAlertasDryRun")?.checked;
  const aviso = dry
    ? "Rodar limpeza de alertas em MODO SEGURO (só conta, não apaga)?"
    : "Rodar limpeza de alertas agora? Isso vai APAGAR de verdade os alertas resolvidos antigos e seus comentários. Tem certeza?";
  if (!confirm(aviso)) return;

  _cfgMostrarMsg("cfgAlertasMsg", "Executando…", "");
  try {
    const r = await fetch("/admin/jobs/alertas-cleanup/run", { method: "POST", headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg("cfgAlertasMsg", data.error || "Erro ao executar", "err");
    _cfgMostrarMsg("cfgAlertasMsg",
      data.dry_run
        ? `Modo seguro: ${Number(data.seriam_removidos).toLocaleString("pt-BR")} alertas seriam apagados`
        : `Removidos ${Number(data.removidos).toLocaleString("pt-BR")} alertas (${Number(data.comentarios_removidos || 0).toLocaleString("pt-BR")} comentários) em ${data.lotes} lote(s)`,
      "ok");
    _cfgRenderUltimaAlertas({ ultima_execucao: new Date().toISOString(), ultimo_resultado: data });
  } catch (e) {
    _cfgMostrarMsg("cfgAlertasMsg", "Erro de conexão", "err");
  }
}

// ── Fase 9E: conversas WhatsApp fechadas antigas ──────────────────────────
function _cfgRenderUltimaConversas(jb) {
  const card = document.getElementById("cfgConversasResultadoCard");
  const body = document.getElementById("cfgConversasResultadoBody");
  if (!card || !body) return;
  if (!jb || !jb.ultima_execucao) { card.style.display = "none"; return; }
  card.style.display = "";
  const quando = new Date(jb.ultima_execucao).toLocaleString("pt-BR");
  const r = jb.ultimo_resultado || {};
  const linhas = [`<div><strong>Quando:</strong> ${quando}</div>`];
  if (r.dry_run) {
    linhas.push(`<div><strong>Modo:</strong> seguro (não apagou)</div>`);
    linhas.push(`<div><strong>Conversas que seriam removidas:</strong> ${Number(r.seriam_removidos || 0).toLocaleString("pt-BR")}</div>`);
    if (r.mensagens_seriam_removidas != null) linhas.push(`<div><strong>Mensagens que seriam removidas:</strong> ${Number(r.mensagens_seriam_removidas).toLocaleString("pt-BR")}</div>`);
  } else {
    linhas.push(`<div><strong>Conversas removidas:</strong> ${Number(r.removidos || 0).toLocaleString("pt-BR")}</div>`);
    if (r.mensagens_removidas != null) linhas.push(`<div><strong>Mensagens removidas:</strong> ${Number(r.mensagens_removidas).toLocaleString("pt-BR")}</div>`);
    if (r.lotes != null)      linhas.push(`<div><strong>Lotes:</strong> ${r.lotes}</div>`);
    if (r.duracao_ms != null) linhas.push(`<div><strong>Duração:</strong> ${(r.duracao_ms / 1000).toFixed(1)}s</div>`);
    if (r.truncado)           linhas.push(`<div style="color:#f59e0b;"><strong>⚠ Atingiu o limite de lotes</strong> — talvez precise rodar de novo</div>`);
  }
  linhas.push(`<div><strong>Retenção configurada:</strong> ${r.retencao_dias || "?"} dias</div>`);
  body.innerHTML = linhas.join("");
}

async function _cfgSalvarConversasRetencao() {
  const payload = {
    "conversas.retencao_dias":   String(document.getElementById("cfgConversasRetencaoDias")?.value || "365"),
    "conversas.cleanup_dry_run": document.getElementById("cfgConversasDryRun")?.checked ? "true" : "false",
  };
  await _cfgEnviarConfigs(payload, "cfgConversasMsg", "Configuração salva");
}

async function _cfgRodarLimpezaConversas() {
  const dry = document.getElementById("cfgConversasDryRun")?.checked;
  const aviso = dry
    ? "Rodar limpeza de conversas em MODO SEGURO (só conta, não apaga)?"
    : "Rodar limpeza de conversas agora? Isso vai APAGAR as conversas fechadas antigas e todas as suas mensagens. O WhatsApp do cliente NÃO é afetado, só nosso banco. Tem certeza?";
  if (!confirm(aviso)) return;

  _cfgMostrarMsg("cfgConversasMsg", "Executando…", "");
  try {
    const r = await fetch("/admin/jobs/conversas-cleanup/run", { method: "POST", headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg("cfgConversasMsg", data.error || "Erro ao executar", "err");
    _cfgMostrarMsg("cfgConversasMsg",
      data.dry_run
        ? `Modo seguro: ${Number(data.seriam_removidos).toLocaleString("pt-BR")} conversas (${Number(data.mensagens_seriam_removidas || 0).toLocaleString("pt-BR")} msgs) seriam apagadas`
        : `Removidas ${Number(data.removidos).toLocaleString("pt-BR")} conversas (${Number(data.mensagens_removidas || 0).toLocaleString("pt-BR")} mensagens) em ${data.lotes} lote(s)`,
      "ok");
    _cfgRenderUltimaConversas({ ultima_execucao: new Date().toISOString(), ultimo_resultado: data });
  } catch (e) {
    _cfgMostrarMsg("cfgConversasMsg", "Erro de conexão", "err");
  }
}

// ── INTEGRAÇÕES ──────────────────────────────────────────────────────────────
async function _cfgCarregarIntegracoes() {
  const grid = document.getElementById("cfgIntGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="cfg-empty">Verificando conexões…</div>`;
  try {
    const r = await fetch("/admin/integracoes/status", { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    const s = await r.json();
    grid.innerHTML = _cfgRenderIntegracoes(s);
  } catch (e) {
    grid.innerHTML = `<div class="cfg-empty">Erro ao verificar conexões.</div>`;
  }
}

function _cfgIntCard({ titulo, icone, status, mensagem, meta }) {
  const badgeTxt = status === "ok" ? "Online" : status === "warn" ? "Atenção" : "Offline";
  const metaHtml = meta?.length ? `<div class="cfg-int-meta">${meta.map(m => `<span><strong>${m.label}:</strong> ${m.valor}</span>`).join("")}</div>` : "";
  return `<div class="card cfg-int-card">
    <div class="cfg-int-head">
      ${icone}
      <h4>${titulo}</h4>
      <span class="cfg-int-badge ${status}">${badgeTxt}</span>
    </div>
    <div class="cfg-int-msg">${mensagem}</div>
    ${metaHtml}
  </div>`;
}

function _cfgRenderIntegracoes(s) {
  const _icoSvg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent);">${d}</svg>`;
  const cards = [];

  // OpenAI
  cards.push(_cfgIntCard({
    titulo: "OpenAI (IA)",
    icone: _icoSvg(`<path d="M12 2a4 4 0 0 0-4 4v0a3 3 0 0 0-3 3v1a3 3 0 0 0 1 5.83V19a3 3 0 0 0 6 0V6a4 4 0 0 0 0-4Z"/><path d="M12 2a4 4 0 0 1 4 4v0a3 3 0 0 1 3 3v1a3 3 0 0 1-1 5.83V19a3 3 0 0 1-6 0"/>`),
    status: s.openai?.ok ? "ok" : "bad",
    mensagem: s.openai?.mensagem || "Sem informação",
  }));

  // Resend (email)
  cards.push(_cfgIntCard({
    titulo: "Email (Resend)",
    icone: _icoSvg(`<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`),
    status: s.resend?.ok ? "ok" : "bad",
    mensagem: s.resend?.mensagem || "Sem informação",
  }));

  // Postgres / Servidor
  cards.push(_cfgIntCard({
    titulo: "Banco de dados",
    icone: _icoSvg(`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>`),
    status: s.postgres?.ok ? "ok" : "bad",
    mensagem: s.postgres?.ok ? `Conexão saudável.` : (s.postgres?.mensagem || "Erro ao consultar"),
    meta: s.postgres?.ok ? [{ label: "Latência", valor: s.postgres.latencia_ms + " ms" }] : [],
  }));

  // Job offline
  const jb = s.job_offline || {};
  const ultExec = jb.ultima_execucao ? new Date(jb.ultima_execucao).toLocaleString("pt-BR") : "Ainda não executou";
  cards.push(_cfgIntCard({
    titulo: "Job: verificação de offline",
    icone: _icoSvg(`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`),
    status: jb.ultima_execucao ? "ok" : "warn",
    mensagem: jb.ultima_execucao ? "Executando no intervalo configurado." : "Aguardando primeira execução.",
    meta: [
      { label: "Última execução", valor: ultExec },
      ...(jb.ultimo_resultado?.criados != null ? [{ label: "Alertas novos", valor: jb.ultimo_resultado.criados }] : []),
    ],
  }));

  return cards.join("");
}

// ── USUÁRIOS ─────────────────────────────────────────────────────────────────
async function _cfgCarregarUsuarios() {
  const tb = document.getElementById("cfgUsuariosBody");
  if (!tb) return;
  try {
    const r = await fetch("/admin/usuarios", { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    _cfgUsuariosDados = await r.json();
    _cfgRenderUsuarios();
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="6" class="cfg-empty">Erro ao carregar usuários.</td></tr>`;
  }
}

function _cfgRoleLabel(role) {
  return { admin: "Admin Master", gerente: "Administrador", operador: "Operador", cliente: "Cliente", tecnico: "Técnico" }[role] || role || "-";
}

function _cfgRenderUsuarios() {
  const tb = document.getElementById("cfgUsuariosBody");
  if (!tb) return;
  if (!_cfgUsuariosDados.length) {
    tb.innerHTML = `<tr><td colspan="6" class="cfg-empty">Nenhum usuário cadastrado.</td></tr>`;
    return;
  }
  const meId = _cfgMyId();
  tb.innerHTML = _cfgUsuariosDados.map(u => {
    const dataCad = u.criado_em ? new Date(u.criado_em).toLocaleDateString("pt-BR") : "-";
    const condo = u.condominio_nome || (u.role === "cliente" ? "<span style='color:var(--muted);'>—</span>" : "<span style='color:var(--muted);'>n/a</span>");
    const meTag = u.id === meId ? '<span class="cfg-disp-tag" style="margin-left:6px;">Você</span>' : '';
    return `<tr>
      <td>${_waEscaparHtml(u.nome || "-")}${meTag}</td>
      <td style="font-family:ui-monospace,monospace;font-size:12px;">${_waEscaparHtml(u.email || "-")}</td>
      <td><span class="badge ${u.role === "admin" ? "b-warn" : ["gerente","operador"].includes(u.role) ? "b-ok" : ""}">${_cfgRoleLabel(u.role)}</span></td>
      <td>${condo}</td>
      <td>${dataCad}</td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;">
          <button class="btn btn-sm cfg-icon-btn" data-cfg-action="editar-usuario" data-id="${u.id}" title="Editar usuário">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-sm cfg-icon-btn" data-cfg-action="dispositivos-usuario" data-id="${u.id}" title="Dispositivos confiáveis">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          </button>
          <button class="btn btn-sm cfg-icon-btn" data-cfg-action="reset-senha" data-id="${u.id}" title="Resetar senha">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          ${u.id !== meId ? `<button class="btn btn-sm cfg-icon-btn" data-cfg-action="remover-usuario" data-id="${u.id}" title="Remover usuário" style="color:#f87171;border-color:rgba(248,113,113,.25);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join("");
}

async function _cfgAbrirModalUsuario(usuario) {
  const isEdit = !!usuario;
  const condos = Array.isArray(_condominios) ? _condominios : [];
  const condoOpts = '<option value="">— sem condomínio —</option>' +
    condos.slice().sort((a, b) => (a.nome_fantasia || a.nome).localeCompare(b.nome_fantasia || b.nome, "pt-BR"))
    .map(c => `<option value="${c.id}" ${usuario?.condominio_id === c.id ? "selected" : ""} data-responsavel="${_waEscaparHtml(c.responsavel || '')}" data-email="${_waEscaparHtml(c.email || '')}">${_waEscaparHtml(c.nome_fantasia || c.nome)}</option>`).join("");
  const overlay = document.getElementById("cfgModalOverlay");
  if (!overlay) return;

  // Carrega colaboradores se ainda não foram carregados
  let tecs = _tecnicosData || [];
  if (!tecs.length) {
    try {
      const r = await fetch("/tecnicos", { headers: authHeaders() });
      if (r.ok) tecs = await r.json();
    } catch {}
  }
  const tecOpts = tecs
    .slice().sort((a, b) => a.nome.localeCompare(b.nome))
    .map(t => `<option value="${t.id}" data-nome="${_waEscaparHtml(t.nome)}" data-email="${_waEscaparHtml(t.email || '')}">${_waEscaparHtml(t.nome)}${t.cargo && t.cargo !== "tecnico" ? ` — ${t.cargo}` : ""}</option>`)
    .join("");

  const initialRole = usuario?.role || "";
  const isCliente   = initialRole === "cliente";

  const box = document.getElementById("cfgModalBox");
  box.style.maxWidth = "520px";
  box.innerHTML = `
    <!-- Cabeçalho -->
    <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.2;">${isEdit ? "Editar usuário" : "Novo usuário"}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;">${isEdit ? "Atualize os dados de acesso ao sistema" : "Preencha os dados para criar um acesso ao sistema"}</div>
      </div>
      <button class="btn btn-sm" data-cfg-action="cancel-modal-usuario">✕</button>
    </div>

    <!-- Corpo -->
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:10px;">

      <!-- 1. Tipo de acesso — sempre primeiro -->
      <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px;">Tipo de acesso</div>
        <div class="field">
          <select id="mdUsrRole" class="input">
            ${!isEdit ? `<option value="">Selecione o tipo…</option>` : ""}
            <option value="gerente"  ${initialRole === "gerente"  ? "selected" : ""}>Administrador</option>
            <option value="operador" ${initialRole === "operador" ? "selected" : ""}>Operador</option>
            <option value="cliente"  ${initialRole === "cliente"  ? "selected" : ""}>Cliente</option>
            <option value="tecnico"  ${initialRole === "tecnico"  ? "selected" : ""}>Técnico</option>
          </select>
        </div>
      </div>

      <!-- 2a. Seção colaborador (não-clientes) -->
      <div id="mdSecColaborador" style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:${!isEdit && !isCliente && !initialRole ? 'none' : (!isCliente && initialRole ? '' : 'none')};">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px;">Colaborador</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${!isEdit ? `<div class="field">
            <select id="mdUsrColaborador" class="input">
              <option value="">Selecione um colaborador…</option>
              ${tecOpts}
            </select>
          </div>` : ""}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="mdUsrNomeEmailWrap" ${isEdit ? "" : ""}>
            <div class="field">
              <span class="lbl">Nome</span>
              <input id="mdUsrNome" class="input" value="${_waEscaparHtml(usuario?.nome || "")}">
            </div>
            <div class="field">
              <span class="lbl">Email</span>
              <input id="mdUsrEmail" class="input" type="email" value="${_waEscaparHtml(usuario?.email || "")}">
            </div>
          </div>
        </div>
      </div>

      <!-- 2b. Seção cliente -->
      <div id="mdSecCliente" style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:${isCliente ? '' : 'none'};">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px;">Dados do cliente</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="field">
              <span class="lbl">Nome</span>
              <input id="mdUsrNomeCliente" class="input" value="${isCliente ? _waEscaparHtml(usuario?.nome || "") : ""}">
            </div>
            <div class="field">
              <span class="lbl">Email</span>
              <input id="mdUsrEmailCliente" class="input" type="email" value="${isCliente ? _waEscaparHtml(usuario?.email || "") : ""}">
            </div>
          </div>
          <div class="field">
            <span class="lbl">Condomínio</span>
            <select id="mdUsrCondo" class="input">${condoOpts}</select>
          </div>
        </div>
      </div>

      <!-- 3. Senha (apenas criação) -->
      ${!isEdit ? `
      <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px;">Acesso</div>
        <div class="field">
          <span class="lbl">Senha inicial</span>
          <input id="mdUsrSenha" class="input" type="text" placeholder="Mínimo 6 caracteres">
        </div>
      </div>` : ""}

      <div id="mdUsrMsg" class="cfg-msg"></div>
    </div>

    <!-- Rodapé -->
    <div style="padding:14px 24px;border-top:1px solid var(--border);background:rgba(0,0,0,.2);display:flex;align-items:center;justify-content:flex-end;gap:8px;">
      <button class="btn btn-sm" data-cfg-action="cancel-modal-usuario">Cancelar</button>
      <button class="btn btnAccent btn-sm" data-cfg-action="${isEdit ? "patch-usuario" : "post-usuario"}" data-id="${usuario?.id || ''}">${isEdit ? "Salvar alterações" : "Criar usuário"}</button>
    </div>
  `;
  overlay.style.display = "flex";

  // Troca de tipo: mostra/esconde seções
  document.getElementById("mdUsrRole")?.addEventListener("change", function () {
    const secColab   = document.getElementById("mdSecColaborador");
    const secCliente = document.getElementById("mdSecCliente");
    if (this.value === "cliente") {
      if (secColab)   secColab.style.display   = "none";
      if (secCliente) secCliente.style.display = "";
    } else if (this.value) {
      if (secColab)   secColab.style.display   = "";
      if (secCliente) secCliente.style.display = "none";
    } else {
      if (secColab)   secColab.style.display   = "none";
      if (secCliente) secCliente.style.display = "none";
    }
  });

  // Ao selecionar condomínio (cliente): preenche nome/email do responsável
  document.getElementById("mdUsrCondo")?.addEventListener("change", function () {
    const opt = this.options[this.selectedIndex];
    if (this.value) {
      const nomeField  = document.getElementById("mdUsrNomeCliente");
      const emailField = document.getElementById("mdUsrEmailCliente");
      if (nomeField  && !nomeField.value)  nomeField.value  = opt.dataset.responsavel || "";
      if (emailField && !emailField.value) emailField.value = opt.dataset.email        || "";
    }
  });

  // Ao selecionar colaborador: preenche nome/email e esconde os campos
  document.getElementById("mdUsrColaborador")?.addEventListener("change", function () {
    const wrap = document.getElementById("mdUsrNomeEmailWrap");
    const opt  = this.options[this.selectedIndex];
    if (this.value) {
      document.getElementById("mdUsrNome").value  = opt.dataset.nome  || "";
      document.getElementById("mdUsrEmail").value = opt.dataset.email || "";
      if (wrap) wrap.style.display = "none";
    } else {
      document.getElementById("mdUsrNome").value  = "";
      document.getElementById("mdUsrEmail").value = "";
      if (wrap) wrap.style.display = "";
    }
  });
}

function _cfgFecharModalUsuario() {
  const overlay = document.getElementById("cfgModalOverlay");
  if (overlay) overlay.style.display = "none";
}

async function _cfgSalvarUsuario(id) {
  const role = document.getElementById("mdUsrRole")?.value;
  const isCliente = role === "cliente";
  const nomeEl  = isCliente ? document.getElementById("mdUsrNomeCliente")  : document.getElementById("mdUsrNome");
  const emailEl = isCliente ? document.getElementById("mdUsrEmailCliente") : document.getElementById("mdUsrEmail");

  const payload = {
    nome:  nomeEl?.value?.trim(),
    email: emailEl?.value?.trim().toLowerCase(),
    role,
    condominio_id: isCliente ? (document.getElementById("mdUsrCondo")?.value || null) : null,
  };
  if (!id) payload.senha = document.getElementById("mdUsrSenha")?.value;

  if (!payload.role) return _cfgMostrarMsg("mdUsrMsg", "Selecione o tipo de acesso", "err");
  if (!payload.nome || !payload.email) return _cfgMostrarMsg("mdUsrMsg", "Nome e email obrigatórios", "err");
  if (!id && (!payload.senha || payload.senha.length < 6)) return _cfgMostrarMsg("mdUsrMsg", "Senha mínima de 6 caracteres", "err");

  const tecnicoSelecionadoId = !id ? (Number(document.getElementById("mdUsrColaborador")?.value) || null) : null;

  try {
    const url = id ? `/admin/usuarios/${id}` : "/admin/usuarios";
    const method = id ? "PATCH" : "POST";
    const r = await fetch(url, {
      method,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return _cfgMostrarMsg("mdUsrMsg", data.error || "Erro", "err");

    // Se for técnico com colaborador selecionado, vincula o usuario_id ao registro de técnico
    if (!id && payload.role === "tecnico" && tecnicoSelecionadoId && data.id) {
      await fetch(`/tecnicos/${tecnicoSelecionadoId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: data.id }),
      });
    }

    _cfgFecharModalUsuario();
    _cfgCarregarUsuarios();
  } catch (e) {
    _cfgMostrarMsg("mdUsrMsg", "Erro de conexão", "err");
  }
}

async function _cfgResetSenha(id) {
  const u = _cfgUsuariosDados.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Gerar nova senha temporária para ${u.nome}? Os dispositivos confiáveis dele serão revogados.`)) return;
  try {
    const r = await fetch(`/admin/usuarios/${id}/reset-senha`, { method: "POST", headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) return alert(data.error || "Erro ao resetar senha");
    _cfgMostrarSenhaTemporaria(u.nome, data.senha_temporaria);
  } catch (e) {
    alert("Erro de conexão");
  }
}

function _cfgMostrarSenhaTemporaria(nome, senha) {
  const overlay = document.getElementById("cfgModalOverlay");
  if (!overlay) return;
  const box = document.getElementById("cfgModalBox");
  box.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:16px;">Senha temporária gerada</h3>
    <p style="color:var(--text-dim);font-size:13px;margin:0 0 6px;">Compartilhe esta senha com <strong>${_waEscaparHtml(nome)}</strong>. Ela só será exibida uma vez.</p>
    <div class="cfg-temp-pass">
      <div class="cfg-temp-pass-val" id="cfgTempPass">${_waEscaparHtml(senha)}</div>
      <button class="btn btn-sm" data-cfg-action="copiar-senha">Copiar</button>
    </div>
    <p style="color:var(--muted);font-size:11.5px;margin-top:10px;">Recomende ao usuário trocar a senha no primeiro acesso, em Configurações → Conta.</p>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <button class="btn btnAccent btn-sm" data-cfg-action="cancel-modal-usuario">Fechar</button>
    </div>
  `;
  overlay.style.display = "flex";
}

async function _cfgVerDispositivosUsuario(id) {
  const u = _cfgUsuariosDados.find(x => x.id === id);
  if (!u) return;
  const overlay = document.getElementById("cfgModalOverlay");
  const box = document.getElementById("cfgModalBox");
  if (!overlay || !box) return;

  box.style.maxWidth = "460px";
  box.innerHTML = `
    <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text);">Dispositivos confiáveis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;">${_waEscaparHtml(u.nome)}</div>
      </div>
      <button class="btn btn-sm" data-cfg-action="cancel-modal-usuario">✕</button>
    </div>
    <div style="padding:16px 24px;" id="cfgDispList">
      <div style="color:var(--muted);font-size:13px;">Carregando…</div>
    </div>
    <div style="padding:0 24px 20px;display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn btn-sm" id="cfgDispRevogarTodos" style="color:#f87171;border-color:rgba(248,113,113,.3);">Revogar todos</button>
      <button class="btn btn-sm btnAccent" data-cfg-action="cancel-modal-usuario">Fechar</button>
    </div>`;
  overlay.style.display = "flex";

  const renderLista = async () => {
    const listEl = document.getElementById("cfgDispList");
    try {
      const r = await fetch(`/admin/usuarios/${id}/dispositivos`, { headers: authHeaders() });
      const data = await r.json();
      if (!r.ok) { listEl.innerHTML = `<div style="color:#f87171;font-size:13px;">${_waEscaparHtml(data.error || "Erro")}</div>`; return; }
      if (!data.length) {
        listEl.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhum dispositivo confiável registrado.</div>`;
        return;
      }
      listEl.innerHTML = data.map(d => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);" data-td-id="${d.id}">
          <div>
            <div style="font-size:13px;color:var(--text);">${_waEscaparHtml(d.nome || "Dispositivo")}</div>
            <div style="font-size:11px;color:var(--muted);">Adicionado em ${new Date(d.criado_em).toLocaleDateString("pt-BR")}</div>
          </div>
          <button class="btn btn-sm cfg-disp-revogar" data-td-id="${d.id}" style="color:#f87171;border-color:rgba(248,113,113,.3);font-size:11px;">Revogar</button>
        </div>`).join("");

      listEl.querySelectorAll(".cfg-disp-revogar").forEach(btn => {
        btn.addEventListener("click", async () => {
          const tdId = btn.dataset.tdId;
          btn.disabled = true;
          const rv = await fetch(`/admin/usuarios/${id}/dispositivos/${tdId}`, { method: "DELETE", headers: authHeaders() });
          if (rv.ok) renderLista();
          else btn.disabled = false;
        });
      });
    } catch {
      listEl.innerHTML = `<div style="color:#f87171;font-size:13px;">Erro de conexão.</div>`;
    }
  };

  renderLista();

  document.getElementById("cfgDispRevogarTodos")?.addEventListener("click", async () => {
    if (!confirm(`Revogar todos os dispositivos confiáveis de ${u.nome}?`)) return;
    await fetch(`/admin/usuarios/${id}/dispositivos`, { method: "DELETE", headers: authHeaders() });
    renderLista();
  });
}

async function _cfgRemoverUsuario(id) {
  const u = _cfgUsuariosDados.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Remover o usuário ${u.nome}? Esta ação não pode ser desfeita.`)) return;
  try {
    const r = await fetch(`/admin/usuarios/${id}`, { method: "DELETE", headers: authHeaders() });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return alert(data.error || "Erro ao remover usuário");
    _cfgCarregarUsuarios();
  } catch (e) {
    alert("Erro de conexão");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // ===== BOTÕES FIXOS =====
  // nav sections
  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    item.addEventListener("click", () => showSection(item.dataset.section));
  });

  document.getElementById("btnAtualizar")?.addEventListener("click", carregarTudo);
  document.getElementById("btnOffline")?.addEventListener("click", rodarJobOffline);
  document.getElementById("btnSair")?.addEventListener("click", logout);

  // ===== RELATÓRIOS =====
  document.getElementById("relTabs")?.addEventListener("click", e => {
    const tab = e.target.closest("[data-rel-tab]")?.dataset.relTab;
    if (tab) _relMostrarTab(tab, true);
  });

  document.querySelector(".section[data-section='relatorios']")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-rel-action]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.relAction;

    if (action === "gerar-chamados")      { gerarRelChamados(); return; }
    if (action === "gerar-reservatorios") { gerarRelReservatorios(); return; }
    if (action === "gerar-sla")           { gerarRelSla(); return; }

    if (action === "exportar-pdf") { exportarRelPdf(); return; }
  });

  // ===== CONFIGURAÇÕES =====
  document.getElementById("cfgTabs")?.addEventListener("click", e => {
    const tab = e.target.closest("[data-cfg-tab]")?.dataset.cfgTab;
    if (tab) _cfgMostrarTab(tab);
  });

  document.querySelector(".section[data-section='config']")?.addEventListener("click", e => {
    // Botões da tabela SLA (data-sla-save) — tratados antes do data-cfg-action
    const slaSave = e.target.closest("[data-sla-save]")?.dataset.slaSave;
    if (slaSave) return _slaSalvarLinha(slaSave);

    const btn = e.target.closest("[data-cfg-action]");
    if (!btn) return;
    const action = btn.dataset.cfgAction;
    const id = btn.dataset.id ? Number(btn.dataset.id) : null;

    if (action === "trocar-senha")        return _cfgTrocarSenha();
    if (action === "sair-todos")          return _cfgSairTodos();
    if (action === "revogar-disp")        return _cfgRevogarDispositivo(id);
    if (action === "salvar-ia")           return _cfgSalvarIa();
    if (action === "salvar-wa-sessao")    return _cfgSalvarWaSessao();
    if (action === "restaurar-prompt")    return _cfgRestaurarPrompt();
    if (action === "recarregar-curadoria") return _cfgCarregarCuradoria();
    if (action === "exportar-curadoria")   return _cfgExportarCuradoria(btn);
    if (action === "salvar-notificacoes") return _cfgSalvarNotificacoes();
    if (action === "salvar-manutencao")      return _cfgSalvarManutencao();
    if (action === "rodar-limpeza-leituras") return _cfgRodarLimpezaLeituras();
    if (action === "salvar-alertas-retencao") return _cfgSalvarAlertasRetencao();
    if (action === "rodar-limpeza-alertas")   return _cfgRodarLimpezaAlertas();
    if (action === "salvar-conversas-retencao") return _cfgSalvarConversasRetencao();
    if (action === "rodar-limpeza-conversas")   return _cfgRodarLimpezaConversas();
    if (action === "salvar-operacional")     return _cfgSalvarOperacional();
    if (action === "rodar-chamados-atraso")  return _cfgRodarChamadosAtraso();
    if (action === "testar-integracoes")  return _cfgCarregarIntegracoes();
    if (action === "novo-usuario")        return _cfgAbrirModalUsuario(null);
    if (action === "editar-usuario")      return _cfgAbrirModalUsuario(_cfgUsuariosDados.find(u => u.id === id));
    if (action === "reset-senha")             return _cfgResetSenha(id);
    if (action === "dispositivos-usuario")    return _cfgVerDispositivosUsuario(id);
    if (action === "remover-usuario")         return _cfgRemoverUsuario(id);
  });

  // Modal exclusivo da seção Configurações
  document.getElementById("cfgModalOverlay")?.addEventListener("click", e => {
    if (e.target.id === "cfgModalOverlay") return _cfgFecharModalUsuario();
    const btn = e.target.closest("[data-cfg-action]");
    if (!btn) return;
    const action = btn.dataset.cfgAction;
    const id = btn.dataset.id ? Number(btn.dataset.id) : null;
    if (action === "cancel-modal-usuario") return _cfgFecharModalUsuario();
    if (action === "post-usuario")         return _cfgSalvarUsuario(null);
    if (action === "patch-usuario")        return _cfgSalvarUsuario(id);
    if (action === "copiar-senha") {
      const v = document.getElementById("cfgTempPass")?.textContent;
      if (v) { navigator.clipboard?.writeText(v); btn.textContent = "Copiado!"; setTimeout(() => btn.textContent = "Copiar", 1500); }
      return;
    }
  });

  // "Ver todos →" e atalhos do dashboard mission-control
  document.body.addEventListener("click", (e) => {
    const go = e.target.closest("[data-section-go]");
    if (go) {
      showSection(go.dataset.sectionGo);
      // Suporte a abrir uma aba específica dentro de Relatórios (ex: Mission Control → Insights)
      const relTab = go.dataset.relTabGo;
      if (relTab && go.dataset.sectionGo === "relatorios") {
        _relMostrarTab(relTab, true);
      }
      return;
    }
    const gotoAlertas = e.target.closest('[data-action="goto-alertas"]');
    if (gotoAlertas) {
      showSection("alertas");
    }
    const rangeBtn = e.target.closest('[data-action="tel-range"]');
    if (rangeBtn) {
      const horas = Number(rangeBtn.dataset.range) || 24;
      _telHistoricoHoras = horas;
      document.querySelectorAll('[data-action="tel-range"]').forEach(b => b.classList.toggle("is-active", b === rangeBtn));
      carregarHistoricoTelemetria();
    }
    const buscarCoords = e.target.closest('[data-action="buscar-coords"]');
    if (buscarCoords) {
      const prefixo = buscarCoords.dataset.prefix;
      if (prefixo) buscarCoordenadasPorEndereco(prefixo);
    }
    // Tabs do painel lateral da seção Mapa
    const mpTab = e.target.closest('.mp-tab[data-tab]');
    if (mpTab) {
      _mpTabAtiva = mpTab.dataset.tab;
      document.querySelectorAll('.mp-tab').forEach(t => t.classList.toggle('is-active', t === mpTab));
      _mpAtualizarPainel();
    }
    // Botão "Abrir Painel" da seção Mapa
    if (e.target.closest('#mpBtnAbrirPainel') && _mpCondoSelecionadoId) {
      abrirDrawer(_mpCondoSelecionadoId);
    }
    // Botão "Tela cheia" do mapa
    if (e.target.closest('[data-action="mp-fullscreen"]')) {
      _mpToggleFullscreen();
    }
    // Botão X do painel flutuante (apenas em fullscreen)
    if (e.target.closest('[data-action="mp-fs-close"]')) {
      _mpFsPanelEsconder();
    }
  });

  // ESC sai do modo fullscreen do mapa
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("mpMapCard")?.classList.contains("is-fullscreen")) {
      _mpToggleFullscreen(false);
    }
  });

  // Mini-mapa do cadastro: inicializa quando a seção Cadastros é exibida.
  // O delay precisa ser > 220ms (duração da animação sectionIn) para o
  // Leaflet medir o container depois que o transform chegou a translateY(0).
  // Se invalidateSize() for chamado durante a animação, o offset interno fica
  // errado e os tiles somem ao primeiro zoom.
  const _initMiniMapaCadastro = () => {
    if (!document.getElementById("novoMiniMapa")) return;
    criarOuObterMiniMapa("novo");
    _miniMapaInvalidar("novo");
  };
  setTimeout(_initMiniMapaCadastro, 350);
  document.querySelectorAll('.nav-item[data-section="cadastros"]').forEach(item => {
    item.addEventListener("click", () => setTimeout(_initMiniMapaCadastro, 350));
  });

  // Bind do CEP nos dois formulários (auto-preenchimento de endereço)
  _bindCepInput("novo");
  _bindCepInput("edit");

  // ===== SIDEBAR TOGGLE =====
  const _sidebar = document.getElementById("sidebar");

  function _applySidebar(collapsed) {
    _sidebar.classList.toggle("collapsed", collapsed);
  }

  // Começa expandida; respeita preferência salva
  _applySidebar(localStorage.getItem("sidebarCollapsed") === "true");

  // operador: só vê Monitor + Chamados + Config (sem Atendimento exceto chamados, sem Gestão exceto config)
  if (_isOperador) {
    const _navHide = ["whatsapp", "ordens-servico", "orcamentos", "planos", "cadastros", "tecnicos", "relatorios"];
    _navHide.forEach(s => {
      const el = document.querySelector(`.nav-item[data-section="${s}"]`);
      if (el) el.style.display = "none";
    });
  }

  function _onToggle() {
    const next = !_sidebar.classList.contains("collapsed");
    _applySidebar(next);
    localStorage.setItem("sidebarCollapsed", next);
  }

  document.getElementById("btnSidebarToggleIn")?.addEventListener("click", _onToggle);
  document.getElementById("btnSidebarToggleOut")?.addEventListener("click", _onToggle);

  document.getElementById("btnAplicarFiltros")?.addEventListener("click", aplicarFiltros);
  document.getElementById("btnLimparFiltros")?.addEventListener("click", limparFiltros);
  document.getElementById("btnPaginaAnterior")?.addEventListener("click", paginaAnterior);
  document.getElementById("btnProximaPagina")?.addEventListener("click", proximaPagina);

  document.getElementById("pageSize")?.addEventListener("change", mudarPageSize);

  // ===== Página Clientes =====
  document.querySelectorAll("[data-cli-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-cli-tab]").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      _cliFiltros.tab = btn.dataset.cliTab;
      renderCliTabela();
    });
  });

  let _cliBuscaTimer = null;
  document.getElementById("cliBusca")?.addEventListener("input", e => {
    clearTimeout(_cliBuscaTimer);
    _cliBuscaTimer = setTimeout(() => { _cliFiltros.busca = e.target.value; renderCliTabela(); }, 200);
  });

  document.getElementById("cliTableBody")?.addEventListener("click", e => {
    const row = e.target.closest("tr[data-cli-id]");
    if (!row) return;
    const id = Number(row.dataset.cliId);
    _cliSelecionadoId = id;
    renderCliTabela();
    const c = (Array.isArray(_condominios) ? _condominios : []).find(c => c.id === id);
    renderCliDetalhe(c || null);
  });

  // ===== Página Técnicos =====
  document.querySelectorAll("[data-tec-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tec-tab]").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      _tecFiltros.tab = btn.dataset.tecTab;
      renderTecTabela();
    });
  });

  let _tecBuscaTimer = null;
  document.getElementById("tecBusca")?.addEventListener("input", e => {
    clearTimeout(_tecBuscaTimer);
    _tecBuscaTimer = setTimeout(() => { _tecFiltros.busca = e.target.value; renderTecTabela(); }, 200);
  });

  document.getElementById("tecTableBody")?.addEventListener("click", e => {
    const row = e.target.closest("tr[data-tec-id]");
    if (!row) return;
    const id = Number(row.dataset.tecId);
    _tecSelecionadoId = id;
    renderTecTabela();
    const t = (_tecnicosData || []).find(t => t.id === id);
    renderTecDetalhe(t || null);
  });

  // ===== Página Alertas =====
  // Tabs de severidade
  document.querySelectorAll(".al-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".al-tab").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      _alFiltros.tab = tab.dataset.alTab;
      _alFiltros.page = 1;
      renderAlertas();
    });
  });
  // KPIs clicáveis (atalho pras tabs) — delegação porque os cards são gerados dinamicamente
  document.getElementById("alKpiGrid")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-al-kpi-tab]");
    if (!card) return;
    const tab = document.querySelector(`.al-tab[data-al-tab="${card.dataset.alKpiTab}"]`);
    tab?.click();
  });
  // Busca e filtros
  const debounce = (fn, ms) => {
    let h; return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
  };
  document.getElementById("alBusca")?.addEventListener("input", debounce((e) => {
    _alFiltros.busca = e.target.value.trim();
    _alFiltros.page = 1;
    renderAlertas();
  }, 200));
  document.getElementById("alDataIni")?.addEventListener("change", (e) => {
    _alFiltros.dataIni = e.target.value;
    _alFiltros.page = 1;
    renderAlertas();
  });
  document.getElementById("alDataFim")?.addEventListener("change", (e) => {
    _alFiltros.dataFim = e.target.value;
    _alFiltros.page = 1;
    renderAlertas();
  });
  document.getElementById("alBtnLimpar")?.addEventListener("click", () => {
    _alFiltros = { tab: "todos", busca: "", dataIni: "", dataFim: "", page: 1, pageSize: _alFiltros.pageSize };
    const busca = document.getElementById("alBusca"); if (busca) busca.value = "";
    const di = document.getElementById("alDataIni"); if (di) di.value = "";
    const df = document.getElementById("alDataFim"); if (df) df.value = "";
    document.querySelectorAll(".al-tab").forEach(t => t.classList.toggle("is-active", t.dataset.alTab === "todos"));
    renderAlertas();
  });
  // Paginação
  document.getElementById("alBtnPagAnt")?.addEventListener("click", () => {
    if (_alFiltros.page > 1) { _alFiltros.page--; renderAlertas(); }
  });
  document.getElementById("alBtnPagProx")?.addEventListener("click", () => {
    _alFiltros.page++;
    renderAlertas();
  });
  document.getElementById("alPageSize")?.addEventListener("change", (e) => {
    _alFiltros.pageSize = Number(e.target.value) || 10;
    _alFiltros.page = 1;
    renderAlertas();
  });
  // Clique na linha / botões de ação (delegado, pra suportar re-render)
  document.getElementById("alTbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-al-action]");
    if (btn) {
      e.stopPropagation();
      const action = btn.dataset.alAction;
      const key = btn.dataset.alKey;
      if (action === "resolver") {
        if (confirm("Marcar este alerta como resolvido?")) _alResolver(key);
      }
      return;
    }
    const row = e.target.closest(".al-row");
    if (row) {
      _alSelecionadoKey = row.dataset.alKey;
      renderAlertas();
    }
  });
  // Ações dentro do painel
  document.getElementById("alPainel")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-al-action]");
    if (!btn) return;
    const action = btn.dataset.alAction;
    const key = btn.dataset.alKey;
    if (action === "fechar-painel") {
      _alSelecionadoKey = null;
      renderAlertas();
    } else if (action === "resolver") {
      if (confirm("Marcar este alerta como resolvido?")) _alResolver(key);
    } else if (action === "ia-analisar") {
      _alPedirAnaliseIA(key);
    } else if (action === "cmt-enviar") {
      const ta = document.getElementById("alCmtInput");
      const texto = (ta?.value || "").trim();
      if (!texto) { ta?.focus(); return; }
      _alEnviarComentario(key, texto);
    }
  });
  // Enter pra enviar comentário (Shift+Enter quebra linha)
  document.getElementById("alPainel")?.addEventListener("keydown", (e) => {
    if (e.target?.id === "alCmtInput" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const btn = document.querySelector('[data-al-action="cmt-enviar"]');
      btn?.click();
    }
  });

  // ===== Página WhatsApp =====
  // Tabs de filtro
  document.querySelectorAll(".wa-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".wa-tab").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      _waFiltros.tab = tab.dataset.waTab;
      _waRenderLista();
    });
  });
  // Busca (debounced)
  const _waDebounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
  document.getElementById("waBusca")?.addEventListener("input", _waDebounce((e) => {
    _waFiltros.busca = e.target.value.trim();
    _waRenderLista();
  }, 200));
  // Clique numa conversa da lista
  document.getElementById("waList")?.addEventListener("click", (e) => {
    const row = e.target.closest("[data-wa-conv]");
    if (!row) return;
    const id = Number(row.dataset.waConv);
    if (id && id !== _waSelecionadaId) _waSelecionar(id);
  });
  // Ações dos painéis WhatsApp (chat head + info col compartilham o mesmo handler)
  const _waAcaoHandler = async (e) => {
    const btn = e.target.closest("[data-wa-action]");
    if (!btn) return;
    const action = btn.dataset.waAction;
    const condoId = Number(btn.dataset.condoId);
    const convId  = Number(btn.dataset.convId);

    if (action === "ver-condo" && condoId) {
      abrirDrawer(condoId);
    } else if (action === "abrir-chamado" && condoId) {
      showSection("chamados");
    } else if (action === "abrir-chamado-sem-condo") {
      showSection("chamados");
    } else if (action === "assumir" && convId) {
      if (!confirm("Assumir essa conversa? A IA vai parar de responder automaticamente.")) return;
      await _waAssumir(convId);
    } else if (action === "devolver-ia" && convId) {
      if (!confirm("Devolver essa conversa pra IA responder?")) return;
      await _waDevolverIA(convId);
    } else if (action === "fechar-conversa" && convId) {
      if (!confirm("Encerrar esta conversa? O cliente não receberá mais respostas automáticas da IA.")) return;
      await _waFecharConversa(convId);
    } else if (action === "reabrir-conversa" && convId) {
      if (!confirm("Reabrir esta conversa?")) return;
      await _waReabrirConversa(convId);
    } else if (action === "apagar-conversa" && convId) {
      if (!confirm("Apagar esta conversa permanentemente?\n\nTodas as mensagens serão removidas. Esta ação não pode ser desfeita.")) return;
      await _waApagarConversa(convId);
    } else if (action === "vincular-condo" && convId) {
      _waAbrirSelecaoCondominio(convId);
    } else if (action === "confirmar-vincular" && convId) {
      const condoId = Number(document.getElementById("waSelectCondo")?.value);
      if (!condoId) return;
      await _waVincularCondo(convId, condoId);
    } else if (action === "cancelar-vincular") {
      const cached = _waConversaCache.get(_waSelecionadaId);
      if (cached) _waRenderInfo(cached);
    } else if (action === "resumir" && convId) {
      await _waIaAcao(convId, "resumir");
    } else if (action === "sugerir-resposta" && convId) {
      await _waIaAcao(convId, "sugerir-resposta");
    } else if (action === "usar-sugestao") {
      const texto = btn.dataset.texto;
      const input = document.getElementById("waMsgInput");
      if (input && texto) { input.value = texto; input.focus(); }
    } else if (action === "avaliar-qualidade" && convId) {
      e.preventDefault();
      const q = btn.dataset.q || "";
      await _waAvaliarQualidade(convId, q);
    }
  };
  document.getElementById("waInfoCol")?.addEventListener("click", _waAcaoHandler);
  document.getElementById("waChatHead")?.addEventListener("click", _waAcaoHandler);

  // Envio de mensagem: botão + Enter (Shift+Enter = quebra de linha)
  document.getElementById("waBtnEnviar")?.addEventListener("click", _waEnviarMensagem);
  document.getElementById("waMsgInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _waEnviarMensagem();
    }
  });

  // ===== Página Chamados =====
  document.querySelectorAll("[data-ch-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-ch-tab]").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      _chFiltros.tab = tab.dataset.chTab;
      renderChTabela();
    });
  });
  const _chDebounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
  document.getElementById("chBusca")?.addEventListener("input", _chDebounce(e => {
    _chFiltros.busca = e.target.value.trim();
    renderChTabela();
  }, 200));
  document.getElementById("chTableBody")?.addEventListener("click", e => {
    const row = e.target.closest("[data-ch-id]");
    if (!row) return;
    const id = Number(row.dataset.chId);
    if (!id) return;
    _chSelecionadoId = id;
    renderChTabela();
    const ch = (_chamadosData || []).find(c => c.id === id);
    renderChDetalhe(ch || null);
  });

  document.getElementById("btnCadastrarCondominio")?.addEventListener("click", criarCondominio);
  document.getElementById("btnCriarCliente")?.addEventListener("click", criarCliente);

  document.getElementById("btnFecharDrawer")?.addEventListener("click", fecharDrawer);
  document.getElementById("drawerOverlay")?.addEventListener("click", fecharDrawer);

  document.getElementById("btnFecharModal")?.addEventListener("click", fecharModal);
  document.getElementById("btnFecharModalEditar")?.addEventListener("click", fecharModalEditar);
  document.getElementById("btnCancelarEdicao")?.addEventListener("click", fecharModalEditar);
  document.getElementById("btnHardDeleteNoEdit")?.addEventListener("click", () => {
    const id = Number(document.getElementById("editId").value);
    const nome = document.getElementById("editNome").value || "este condomínio";
    if (!id) return;
    fecharModalEditar();
    excluirCondominio(id, nome);
  });

  document.getElementById("btnFecharModalEditarRes")?.addEventListener("click", fecharModalEditarReservatorio);
  document.getElementById("btnCancelarEdicaoRes")?.addEventListener("click", fecharModalEditarReservatorio);
  document.getElementById("editResForm")?.addEventListener("submit", salvarEdicaoReservatorio);

  document.getElementById("btnCadastrarReservatorio")
    ?.addEventListener("click", criarReservatorio);

  // salvar edição via submit (sem inline)
  document.getElementById("editForm")?.addEventListener("submit", salvarEdicao);

  // filtro texto (já tinha)
  document.getElementById("filtroTexto")?.addEventListener("input", aplicarFiltros);

  // ===== EVENT DELEGATION (cliques em botões criados via innerHTML) =====
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "fechar-alerta") {
      const id = Number(btn.dataset.id);
      if (id) fecharAlerta(id);
      return;
    }

    if (action === "ver-condo") {
      const id = Number(btn.dataset.id);
      if (id) abrirDrawer(id);
      return;
    }

    if (action === "ver-condo-modal") {
      const id = Number(btn.dataset.condoId);
      if (id) { fecharModal(); abrirDrawer(id); }
      return;
    }

    if (action === "drawer-tab") {
      switchDrawerTab(btn.dataset.tab);
      return;
    }

    if (action === "fechar-chamado") {
      const id = Number(btn.dataset.id);
      if (id) fecharChamadoAction(id);
      return;
    }

    if (action === "reabrir-chamado") {
      const id = Number(btn.dataset.id);
      if (id) reabrirChamadoAction(id);
      return;
    }

    if (action === "mp-alterar-tecnico") {
      const chamadoId = Number(btn.dataset.chamadoId);
      const wrap = document.querySelector(`.mp-tec-wrap[data-chamado-id="${chamadoId}"]`);
      if (!wrap) return;
      const tecs = (Array.isArray(_tecnicosData) ? _tecnicosData : []).filter(t => t.ativo && (!t.cargo || t.cargo === "tecnico"));
      const ch = (_chamadosData || []).find(c => c.id === chamadoId);
      const opts = `<option value="">— sem técnico —</option>` + tecs.map(t =>
        `<option value="${t.id}"${t.id === ch?.tecnico_id ? " selected" : ""}>${_waEscaparHtml(t.nome)}</option>`
      ).join("");
      wrap.innerHTML = `<div style="display:flex;gap:6px;align-items:center;">
        <select class="mp-tec-select" data-chamado-id="${chamadoId}" style="flex:1;font-size:11px;background:var(--surface2);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:3px 6px;">${opts}</select>
        <button class="btn btn-sm viewer-only-hide" data-action="mp-atribuir-tecnico" data-chamado-id="${chamadoId}" style="white-space:nowrap;font-size:11px;padding:3px 8px;">Salvar</button>
        <button class="btn btn-sm" data-action="mp-cancelar-tecnico" data-chamado-id="${chamadoId}" style="font-size:11px;padding:3px 8px;">✕</button>
      </div>`;
      return;
    }

    if (action === "mp-cancelar-tecnico") {
      const chamadoId = Number(btn.dataset.chamadoId);
      const ch = (_chamadosData || []).find(c => c.id === chamadoId);
      const wrap = document.querySelector(`.mp-tec-wrap[data-chamado-id="${chamadoId}"]`);
      if (!wrap || !ch) return;
      const nome = ch.tecnico_nome ? escapeHtml(ch.tecnico_nome) : (ch.tecnico_id ? `Técnico #${ch.tecnico_id}` : "");
      wrap.innerHTML = `<div style="display:flex;gap:8px;align-items:center;font-size:11px;">
        <span style="color:var(--muted);">Técnico:</span>
        <span style="font-weight:600;">${nome || "—"}</span>
        <button class="btn btn-sm viewer-only-hide" data-action="mp-alterar-tecnico" data-chamado-id="${chamadoId}" style="font-size:10px;padding:2px 7px;margin-left:2px;">Alterar</button>
      </div>`;
      return;
    }

    if (action === "mp-atribuir-tecnico") {
      const chamadoId = Number(btn.dataset.chamadoId);
      if (!chamadoId) return;
      const sel = document.querySelector(`.mp-tec-select[data-chamado-id="${chamadoId}"]`);
      const tecnicoId = sel?.value ? Number(sel.value) : null;
      const tecNome = sel ? (sel.options[sel.selectedIndex]?.text || "Sem técnico") : "Sem técnico";
      const wrap = document.querySelector(`.mp-tec-wrap[data-chamado-id="${chamadoId}"]`);
      btn.disabled = true;
      btn.textContent = "Salvando…";
      fetch(`/chamados/${chamadoId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ tecnico_id: tecnicoId }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "Erro ao atribuir técnico"); btn.disabled = false; btn.textContent = "Salvar"; return; }
        if (wrap) wrap.innerHTML = `<div style="display:flex;gap:8px;align-items:center;font-size:11px;">
          <span style="color:var(--muted);">Técnico:</span>
          <span style="font-weight:600;color:var(--accent);">✓ ${_waEscaparHtml(tecNome)}</span>
          <button class="btn btn-sm viewer-only-hide" data-action="mp-alterar-tecnico" data-chamado-id="${chamadoId}" style="font-size:10px;padding:2px 7px;margin-left:2px;">Alterar</button>
        </div>`;
        await carregarTudo();
        _mpAtualizarPainel();
      }).catch(() => { alert("Erro de rede ao atribuir técnico"); btn.disabled = false; btn.textContent = "Salvar"; });
      return;
    }

    if (action === "vincular-ch-condo") {
      const chId = Number(btn.dataset.chId);
      if (!chId) return;
      const lista = Array.isArray(_condominios) ? _condominios : [];
      if (!lista.length) { alert("Nenhum condomínio cadastrado."); return; }
      const row = document.getElementById(`chCondoRow-${chId}`);
      if (!row) return;
      row.innerHTML = `
        <span class="ch-met-lbl">Condomínio</span>
        <div style="display:flex;gap:6px;align-items:center;flex:1;min-width:0;">
          <select id="chSelectCondo" class="input" style="font-size:11.5px;flex:1;min-width:0;">
            <option value="">Selecione…</option>
            ${lista.map(c => `<option value="${c.id}">${_waEscaparHtml(c.nome)}</option>`).join("")}
          </select>
          <button class="btn btn-sm btnAccent" data-action="confirmar-ch-condo" data-ch-id="${chId}">Ok</button>
          <button class="btn btn-sm" data-action="cancelar-ch-condo" data-ch-id="${chId}">✕</button>
        </div>`;
      document.getElementById("chSelectCondo")?.focus();
      return;
    }

    if (action === "confirmar-ch-condo") {
      const chId = Number(btn.dataset.chId);
      const condoId = Number(document.getElementById("chSelectCondo")?.value);
      if (!chId || !condoId) return;
      fetch(`/chamados/${chId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: condoId }),
      }).then(r => {
        if (!r.ok) { alert("Erro ao vincular condomínio"); return; }
        carregarTudo();
      });
      return;
    }

    if (action === "cancelar-ch-condo") {
      const chId = Number(btn.dataset.chId);
      const ch = (_chamadosData || []).find(c => c.id === chId);
      if (ch) renderChDetalhe(ch);
      return;
    }

    if (action === "vincular-ch-tecnico") {
      const chId = Number(btn.dataset.chId);
      const lista = Array.isArray(_tecnicosData) ? _tecnicosData.filter(t => t.ativo && (!t.cargo || t.cargo === "tecnico")) : [];
      if (!lista.length) { alert("Nenhum técnico cadastrado."); return; }
      const row = document.getElementById(`chTecnicoRow-${chId}`);
      if (!row) return;
      row.innerHTML = `
        <span class="ch-met-lbl">Técnico</span>
        <div style="display:flex;gap:6px;align-items:center;flex:1;min-width:0;">
          <select id="chSelectTecnico" class="input" style="font-size:11.5px;flex:1;min-width:0;">
            <option value="">Sem técnico</option>
            ${lista.map(t => `<option value="${t.id}">${_waEscaparHtml(t.nome)}${t.especialidade ? " · " + _waEscaparHtml(t.especialidade) : ""}</option>`).join("")}
          </select>
          <button class="btn btn-sm btnAccent" data-action="confirmar-ch-tecnico" data-ch-id="${chId}">Ok</button>
          <button class="btn btn-sm" data-action="cancelar-ch-tecnico" data-ch-id="${chId}">✕</button>
        </div>`;
      document.getElementById("chSelectTecnico")?.focus();
      return;
    }

    if (action === "confirmar-ch-tecnico") {
      const chId = Number(btn.dataset.chId);
      const tecId = document.getElementById("chSelectTecnico")?.value;
      fetch(`/chamados/${chId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ tecnico_id: tecId ? Number(tecId) : null })
      }).then(r => { if (!r.ok) r.json().then(e => alert(e.error)); else carregarTudo(); });
      return;
    }

    if (action === "cancelar-ch-tecnico") {
      const chId = Number(btn.dataset.chId);
      const ch = (_chamadosData || []).find(c => c.id === chId);
      if (ch) renderChDetalhe(ch);
      return;
    }

    if (action === "ver-conversa") {
      const id = Number(btn.dataset.id);
      if (id) { _drawerConversaId = id; renderConversaChat(id); }
      return;
    }

    if (action === "voltar-conversas") {
      _drawerConversaId = null;
      renderDrawerWhatsapp();
      return;
    }

    if (action === "ver-convo-section") {
      const id = Number(btn.dataset.id);
      const cv = _conversasData.find(c => c.id === id);
      if (cv && cv.condominio_id) {
        abrirDrawer(cv.condominio_id);
        _drawerConversaId = id;
        switchDrawerTab("whatsapp");
        renderConversaChat(id);
      }
      return;
    }

    if (action === "editar-condominio") {
      const id = Number(btn.dataset.id);
      if (id) abrirModalEditar(id);
      return;
    }

    if (action === "regen-res-key") {
      const id = Number(btn.dataset.id);
      if (id) regenerarDeviceKeyReservatorio(id);
      return;
    }

    if (action === "ir-telemetria-condo") {
      const condoId = Number(btn.dataset.condoId);
      fecharDrawer();
      showSection("telemetria");
      setTimeout(() => {
        _telFiltroCondominioId = String(condoId);
        const sel = document.getElementById("telFiltroCondominio");
        if (sel) sel.value = String(condoId);
        renderTelBarChart?.();
        renderTelCriticos?.();
        renderTelBombas?.();
      }, 0);
      return;
    }

    if (action === "editar-reservatorio") {
      const id = Number(btn.dataset.id);
      if (id) abrirModalEditarReservatorio(id);
      return;
    }

    if (action === "excluir-reservatorio") {
      const id = Number(btn.dataset.id);
      const nome = btn.dataset.nome || "";
      if (id) excluirReservatorio(id, nome);
      return;
    }

    if (action === "inativar-condominio") {
      const id = Number(btn.dataset.id);
      const nome = btn.dataset.nome || "";
      if (id) inativarCondominio(id, nome);
      return;
    }

    if (action === "reativar-condominio") {
      const id = Number(btn.dataset.id);
      if (!id) return;
      fetch(`/condominios/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: true })
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "Erro ao reativar"); return; }
        await carregarTudo();
      }).catch(() => alert("Erro de rede"));
      return;
    }

    if (action === "novo-cliente") {
      abrirModalNovoCliente();
      return;
    }

    if (action === "fechar-modal-cliente") {
      document.getElementById("modalNovoCliente")?.remove();
      _miniMapas.delete("cliModal");
      return;
    }

    if (action === "novo-representante") {
      const condoId = Number(btn.dataset.condoId);
      if (condoId) abrirModalNovoRepresentante(condoId);
      return;
    }

    if (action === "fechar-modal-rep") {
      document.getElementById("modalNovoRep")?.remove();
      return;
    }

    if (action === "novo-reservatorio") {
      abrirModalNovoReservatorio();
      return;
    }

    if (action === "fechar-modal-res") {
      document.getElementById("modalNovoRes")?.remove();
      return;
    }

    if (action === "novo-tecnico") {
      abrirModalTecnico();
      return;
    }

    if (action === "fechar-modal-tecnico") {
      document.getElementById("modalTecnico")?.remove();
      return;
    }

    if (action === "editar-tecnico") {
      const id = Number(btn.dataset.id);
      const t = (_tecnicosData || []).find(t => t.id === id);
      if (t) abrirModalTecnico(t);
      return;
    }

    if (action === "toggle-tec-disp") {
      const id   = Number(btn.dataset.id);
      const disp = btn.dataset.disp === "1";
      fetch(`/tecnicos/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ disponivel: !disp })
      }).then(async r => {
        if (!r.ok) { const e = await r.json(); alert(e.error); return; }
        await carregarTecnicos();
        _tecSelecionadoId = id;
        renderTecnicos();
        const t = (_tecnicosData || []).find(t => t.id === id);
        renderTecDetalhe(t || null);
      });
      return;
    }

    if (action === "excluir-tecnico") {
      const id   = Number(btn.dataset.id);
      const nome = btn.dataset.nome || "este técnico";
      if (!confirm(`Excluir ${nome}?`)) return;
      fetch(`/tecnicos/${id}`, { method: "DELETE", headers: authHeaders() })
        .then(async r => {
          if (!r.ok) { const e = await r.json(); alert(e.error); return; }
          _tecSelecionadoId = null;
          await carregarTecnicos();
          renderTecnicos();
          renderTecDetalhe(null);
        });
      return;
    }

    if (action === "toggle-cli-ativo") {
      const id = Number(btn.dataset.id);
      const ativo = btn.dataset.ativo === "1";
      if (!id) return;
      fetch(`/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !ativo })
      }).then(r => { if (!r.ok) return r.json().then(e => alert(e.error)); return carregarTudo(); });
      return;
    }

    if (action === "ir-chamados-condo") {
      showSection("chamados");
      return;
    }
  });

  // Fechar modal clicando fora (você já tem, pode manter)
  document.addEventListener("click", (e) => {
    const ov = document.getElementById("modalOverlay");
    if (ov && ov.style.display !== "none" && e.target === ov) fecharModal();
  });

  document.addEventListener("click", (e) => {
    const ov = document.getElementById("editOverlay");
    if (ov && ov.style.display !== "none" && e.target === ov) fecharModalEditar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharDrawer();
      fecharModalEditar();
      fecharModalEditarReservatorio();
    }
  });

  // primeira carga + auto refresh com polling separado
  carregarTudo();
  setInterval(carregarTelemetria, 7000);
  setInterval(carregarAtendimento, 20000);
  // Polling rápido pra conversa selecionada — atualiza mensagens e metadados
  setInterval(async () => {
    if (!_waSelecionadaId) return;
    try {
      const r = await fetch(`/whatsapp/conversas/${_waSelecionadaId}`, { headers: authHeaders() });
      if (!r.ok) return;
      const conv = await r.json();
      const cached = _waConversaCache.get(_waSelecionadaId);

      const msgCountChanged = !cached ||
        (conv.mensagens?.length || 0) !== (cached.mensagens?.length || 0);
      const metaChanged = !cached ||
        cached.condominio_id    !== conv.condominio_id    ||
        cached.assumida_por_id  !== conv.assumida_por_id  ||
        cached.status           !== conv.status;

      if (msgCountChanged || metaChanged) {
        _waConversaCache.set(_waSelecionadaId, conv);
        _waRenderChat(conv);
      }

      if (metaChanged) {
        // Preserva resultado da IA já exibido ao re-renderizar o painel direito
        const iaHtml = document.getElementById("waIaResult")?.innerHTML || "";
        _waRenderInfo(conv);
        if (iaHtml) {
          const iaDiv = document.getElementById("waIaResult");
          if (iaDiv) iaDiv.innerHTML = iaHtml;
        }
      }
    } catch (e) { /* silencia — próximo ciclo tenta de novo */ }
  }, 5000);
});

// ============================================================
// ORDENS DE SERVIÇO — seção admin (lista + detalhe + edição + PDF)
// ============================================================

let _osData = [];
let _osLoaded = false;
let _osSelecionadaId = null;
let _osSelecionada = null;
let _osModoEdicao = false;
let _osEdits = null;        // rascunho de edição (objeto solto)
let _osTabAtiva = "todas";  // "todas" | "finalizadas" | "rascunho"

const _OS_TIPOS_SERVICO = {
  retirada_equipamento: "Retirada de equipamento",
  vistoria_contrato:    "Vistoria contratual",
  visita_tecnica:       "Visita técnica",
  devolucao:            "Devolução",
  limpeza_piscina:      "Limpeza piscina",
  limpeza_caixas:       "Limpeza caixas d'água",
  chamado_emergencial:  "Chamado emergencial",
  preventiva_mensal:    "Preventiva mensal",
  instalacao_pecas:     "Instalação de peças",
};

const _OS_RESULTADOS = {
  resolvido:  { label: "Resolvido",  cls: "os-result-ok"   },
  paliativo:  { label: "Paliativo",  cls: "os-result-warn" },
  agravado:   { label: "Agravado",   cls: "os-result-bad"  },
};

const _OS_RECEBIDO_TIPOS = { gestor: "Gestor", sindico: "Síndico", portaria: "Portaria" };

function _osFmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function _osFmtDataCurta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" });
}

async function carregarOrdensServico() {
  try {
    const r = await fetch("/ordens-servico", { headers: authHeaders() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    _osData = await r.json();
    _osLoaded = true;
  } catch (err) {
    console.error("[os] carregarOrdensServico:", err);
    _osData = [];
  }
}

async function renderSecaoOS() {
  // Carrega dados se ainda não tiver
  if (!_osLoaded) await carregarOrdensServico();

  _osRenderKpis();
  _osRenderTabela();
  _osBindEventos();
}

function _osRenderKpis() {
  const el = document.getElementById("osKpiGrid");
  if (!el) return;
  const data = Array.isArray(_osData) ? _osData : [];

  const total      = data.length;
  const finaliz    = data.filter(o => o.finalizada_em).length;
  const rascunho   = total - finaliz;

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const esteMes = data.filter(o => o.criado_em && new Date(o.criado_em) >= inicioMes).length;

  const kpi = (icon, val, hint, kindCls) => `
    <div class="rc ${kindCls} rc-static">
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${hint}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  el.innerHTML =
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        total, "Total de O.S.", "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        finaliz, "Finalizadas", finaliz > 0 ? "rc-ok" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        rascunho, "Em rascunho", rascunho > 0 ? "rc-warn" : "rc-neutral") +
    kpi(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        esteMes, "Este mês", "rc-neutral");
}

function _osFiltrados() {
  const q = (document.getElementById("osBusca")?.value || "").trim().toLowerCase();

  let lista = Array.isArray(_osData) ? [..._osData] : [];

  if (_osTabAtiva === "finalizadas") lista = lista.filter(o => o.finalizada_em);
  if (_osTabAtiva === "rascunho")    lista = lista.filter(o => !o.finalizada_em);

  if (q) {
    lista = lista.filter(o => {
      const blob = `${o.numero || ""} ${o.condominio_nome || ""} ${o.tecnico_nome || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }
  return lista;
}

function _osRenderTabela() {
  const tbody = document.getElementById("osTableBody");
  const empty = document.getElementById("osEmpty");
  if (!tbody) return;

  // Contadores das tabs (sempre baseados no dataset completo, ignoram a busca textual)
  const data = Array.isArray(_osData) ? _osData : [];
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("osCtTodas",    data.length);
  set("osCtFinal",    data.filter(o => o.finalizada_em).length);
  set("osCtRascunho", data.filter(o => !o.finalizada_em).length);

  const lista = _osFiltrados();
  if (!lista.length) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = lista.map(o => {
    const tipos = Array.isArray(o.tipos_servico) ? o.tipos_servico : [];
    const tiposHtml = tipos.length
      ? tipos.slice(0, 2).map(t => `<span class="os-chip">${_waEscaparHtml(_OS_TIPOS_SERVICO[t] || t)}</span>`).join("") +
        (tipos.length > 2 ? `<span class="os-chip os-chip-more">+${tipos.length - 2}</span>` : "")
      : `<span class="os-muted">—</span>`;

    const resultado = o.servico_realizado
      ? `<span class="os-result-pill ${_OS_RESULTADOS[o.servico_realizado]?.cls || ""}">${_OS_RESULTADOS[o.servico_realizado]?.label || o.servico_realizado}</span>`
      : `<span class="os-muted">—</span>`;

    const status = o.finalizada_em
      ? `<span class="os-status-pill os-status-final">Finalizada</span>`
      : `<span class="os-status-pill os-status-rascunho">Rascunho</span>`;

    return `<tr class="os-row" data-os-id="${o.id}">
      <td><strong>${_waEscaparHtml(o.numero || "—")}</strong></td>
      <td>${_osFmtDataCurta(o.criado_em)}</td>
      <td>${_waEscaparHtml(o.condominio_nome || "—")}</td>
      <td>${_waEscaparHtml(o.tecnico_nome || "—")}</td>
      <td><div class="os-tipos-cell">${tiposHtml}</div></td>
      <td>${resultado}</td>
      <td>${status}</td>
      <td class="right os-acoes-cell">
        <button class="btn btn-sm os-btn-ver" data-os-id="${o.id}" type="button" title="Ver detalhes">👁</button>
        ${o.finalizada_em ? `<button class="btn btn-sm os-btn-pdf" data-os-id="${o.id}" type="button" title="Baixar PDF">📄</button>` : ""}
      </td>
    </tr>`;
  }).join("");
}

let _osEventosBound = false;
function _osBindEventos() {
  if (_osEventosBound) return;
  _osEventosBound = true;

  document.getElementById("osBusca")?.addEventListener("input", _osRenderTabela);

  document.querySelectorAll(".wa-tab[data-os-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      _osTabAtiva = tab.dataset.osTab;
      document.querySelectorAll(".wa-tab[data-os-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      _osRenderTabela();
    });
  });

  // Delegação no tbody (botões dinâmicos)
  document.getElementById("osTableBody")?.addEventListener("click", (e) => {
    const ver = e.target.closest(".os-btn-ver");
    const pdf = e.target.closest(".os-btn-pdf");
    if (ver) { abrirOSDetalhe(Number(ver.dataset.osId)); return; }
    if (pdf) { baixarOSPdf(Number(pdf.dataset.osId)); return; }
    const row = e.target.closest(".os-row");
    if (row) abrirOSDetalhe(Number(row.dataset.osId));
  });

  // Modal
  document.getElementById("osBtnFechar")?.addEventListener("click", fecharOSModal);
  document.getElementById("osBtnPdf")?.addEventListener("click", () => {
    if (_osSelecionadaId) baixarOSPdf(_osSelecionadaId);
  });
  document.getElementById("osBtnEditar")?.addEventListener("click", _osEntrarModoEdicao);
  document.getElementById("osBtnSalvar")?.addEventListener("click", _osSalvarEdicao);
  document.getElementById("osBtnCancelarEdicao")?.addEventListener("click", _osCancelarEdicao);

  document.getElementById("osModalOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "osModalOverlay") fecharOSModal();
  });
  document.getElementById("osFotoLightboxClose")?.addEventListener("click", () => {
    const lb = document.getElementById("osFotoLightbox");
    if (lb) lb.style.display = "none";
  });
  document.getElementById("osFotoLightbox")?.addEventListener("click", (e) => {
    if (e.target.id === "osFotoLightbox") {
      e.currentTarget.style.display = "none";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const lb = document.getElementById("osFotoLightbox");
    if (lb && lb.style.display !== "none") { lb.style.display = "none"; return; }
    const ov = document.getElementById("osModalOverlay");
    if (ov && ov.style.display !== "none") fecharOSModal();
  });
}

// ============================================================
// MODAL DE DETALHE
// ============================================================

async function abrirOSDetalhe(id) {
  if (!id) return;
  _osSelecionadaId = id;
  _osModoEdicao = false;
  _osEdits = null;

  const ov   = document.getElementById("osModalOverlay");
  const body = document.getElementById("osModalBody");
  const sub  = document.getElementById("osModalSub");
  const tit  = document.getElementById("osModalTitle");
  if (!ov || !body) return;

  ov.style.display = "flex";
  body.innerHTML = `<div class="mc-empty" style="padding:32px;text-align:center;">Carregando…</div>`;
  if (sub) sub.textContent = "Carregando…";
  if (tit) tit.textContent = "Ordem de Serviço";
  _osAtualizarBotoesHeader();

  try {
    const r = await fetch(`/ordens-servico/${id}`, { headers: authHeaders() });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || ("HTTP " + r.status));
    }
    _osSelecionada = await r.json();
    _osRenderModal();
  } catch (err) {
    body.innerHTML = `<div class="mc-empty" style="padding:32px;text-align:center;color:var(--danger);">Erro: ${_waEscaparHtml(err.message)}</div>`;
  }
}

function fecharOSModal() {
  const ov = document.getElementById("osModalOverlay");
  if (ov) ov.style.display = "none";
  _osSelecionadaId = null;
  _osSelecionada = null;
  _osModoEdicao = false;
  _osEdits = null;
}

function _osAtualizarBotoesHeader() {
  const btnEditar    = document.getElementById("osBtnEditar");
  const btnSalvar    = document.getElementById("osBtnSalvar");
  const btnCancelar  = document.getElementById("osBtnCancelarEdicao");
  const btnPdf       = document.getElementById("osBtnPdf");
  if (!btnEditar) return;

  if (_osModoEdicao) {
    btnEditar.style.display = "none";
    btnSalvar.style.display = "inline-flex";
    btnCancelar.style.display = "inline-flex";
    btnPdf.style.display = "none";
  } else {
    btnEditar.style.display = "inline-flex";
    btnSalvar.style.display = "none";
    btnCancelar.style.display = "none";
    btnPdf.style.display = (_osSelecionada && _osSelecionada.finalizada_em) ? "inline-flex" : "none";
  }
}

function _osRenderModal() {
  const body = document.getElementById("osModalBody");
  const tit  = document.getElementById("osModalTitle");
  const sub  = document.getElementById("osModalSub");
  if (!body || !_osSelecionada) return;
  const os = _osSelecionada;

  if (tit) tit.textContent = os.numero || "O.S.";
  if (sub) {
    const cond = os.condominio_nome || "—";
    const tec  = os.tecnico_nome || "Sem técnico";
    const status = os.finalizada_em
      ? `Finalizada em ${_osFmtData(os.finalizada_em)}`
      : "Rascunho (não finalizada)";
    sub.innerHTML = `${_waEscaparHtml(cond)} · ${_waEscaparHtml(tec)} · ${status}`;
  }

  _osAtualizarBotoesHeader();

  if (_osModoEdicao) {
    body.innerHTML = _osRenderForm(_osEdits || _osEditsFromOS(os));
    _osBindFormEventos();
  } else {
    body.innerHTML = _osRenderView(os);
    _osBindViewEventos();
  }
}

function _osRenderView(os) {
  const tipos = Array.isArray(os.tipos_servico) ? os.tipos_servico : [];
  const tiposHtml = tipos.length
    ? tipos.map(t => `<span class="os-chip os-chip-lg">${_waEscaparHtml(_OS_TIPOS_SERVICO[t] || t)}</span>`).join("")
    : `<span class="os-muted">Nenhum tipo informado</span>`;

  const resultado = os.servico_realizado
    ? `<span class="os-result-pill ${_OS_RESULTADOS[os.servico_realizado]?.cls || ""}">${_OS_RESULTADOS[os.servico_realizado]?.label || os.servico_realizado}</span>`
    : `<span class="os-muted">—</span>`;

  const endereco = [os.endereco, os.bairro, os.cidade, os.uf].filter(Boolean).join(", ") || "—";

  const itensVerif = os.itens_verificados && typeof os.itens_verificados === "object"
    ? Object.entries(os.itens_verificados)
    : [];
  const itensHtml = itensVerif.length
    ? `<ul class="os-list">${itensVerif.map(([k, v]) =>
        `<li>${_waEscaparHtml(k)}: <strong>${v === true ? "Sim" : v === false ? "Não" : _waEscaparHtml(String(v))}</strong></li>`
      ).join("")}</ul>`
    : `<span class="os-muted">Nada verificado.</span>`;

  let correntesHtml = `<span class="os-muted">—</span>`;
  if (os.correntes && typeof os.correntes === "object") {
    const tipo = os.correntes.tipo || "—";
    const vals = Array.isArray(os.correntes.valores) ? os.correntes.valores : [];
    correntesHtml = `<div class="os-correntes-row">
      <span><strong>Tipo:</strong> ${_waEscaparHtml(tipo)}</span>
      ${vals.length ? `<span><strong>Valores:</strong> ${vals.map(v => `${_waEscaparHtml(String(v))} A`).join(" · ")}</span>` : ""}
    </div>`;
  }

  const pecas = Array.isArray(os.pecas) ? os.pecas : [];
  const pecasHtml = pecas.length
    ? `<table class="os-pecas-table"><thead><tr><th>Descrição</th><th>Qtd</th><th>Observação</th></tr></thead>
       <tbody>${pecas.map(p => `<tr>
         <td>${_waEscaparHtml(p.descricao || "—")}</td>
         <td>${p.quantidade ?? 1}</td>
         <td>${_waEscaparHtml(p.observacao || "—")}</td>
       </tr>`).join("")}</tbody></table>`
    : `<span class="os-muted">Nenhuma peça registrada.</span>`;

  const fotos = Array.isArray(os.fotos) ? os.fotos : [];
  const fotosHtml = fotos.length
    ? `<div class="os-fotos-grid">${fotos.map(f => `
        <figure class="os-foto" data-foto-url="${_waEscaparHtml(f.url)}">
          <img src="${_waEscaparHtml(f.url)}" alt="Foto ${_waEscaparHtml(f.tipo || "")}" loading="lazy" />
          <figcaption>
            ${f.tipo ? `<span class="os-foto-tag">${_waEscaparHtml(f.tipo)}</span>` : ""}
            ${f.legenda ? `<span>${_waEscaparHtml(f.legenda)}</span>` : ""}
          </figcaption>
        </figure>`).join("")}</div>`
    : `<span class="os-muted">Nenhuma foto.</span>`;

  const assin = os.assinatura_b64
    ? `<img class="os-assin-img" src="${_waEscaparHtml(os.assinatura_b64.startsWith("data:") ? os.assinatura_b64 : "data:image/png;base64," + os.assinatura_b64)}" alt="Assinatura" />`
    : `<span class="os-muted">Não assinada.</span>`;

  return `
    <div class="os-view-body">
      <div class="os-view-cols">
        <div>
          <div class="os-vsec-title">Identificação</div>
          <div class="os-rows">
            <div class="os-row-info"><span class="os-key">Número</span><span class="os-val"><strong>${_waEscaparHtml(os.numero || "—")}</strong></span></div>
            <div class="os-row-info"><span class="os-key">Criada em</span><span class="os-val">${_osFmtData(os.criado_em)}</span></div>
            <div class="os-row-info"><span class="os-key">Finalizada</span><span class="os-val">${os.finalizada_em ? _osFmtData(os.finalizada_em) : "—"}</span></div>
            <div class="os-row-info"><span class="os-key">Chamado</span><span class="os-val">${os.chamado_id ? `#${os.chamado_id}` : "—"}</span></div>
            <div class="os-row-info"><span class="os-key">Condomínio</span><span class="os-val">${_waEscaparHtml(os.condominio_nome || "—")}</span></div>
            <div class="os-row-info"><span class="os-key">Endereço</span><span class="os-val">${_waEscaparHtml(endereco)}</span></div>
            <div class="os-row-info"><span class="os-key">Técnico</span><span class="os-val">${_waEscaparHtml(os.tecnico_nome || "—")}${os.tecnico_telefone ? ` · ${_waEscaparHtml(os.tecnico_telefone)}` : ""}</span></div>
          </div>
        </div>
        <div>
          <div class="os-vsec-title">Check-in / Check-out</div>
          <div class="os-rows">
            <div class="os-row-info"><span class="os-key">Chegada</span><span class="os-val">${_osFmtData(os.chegada_em)}${os.chegada_lat ? ` · ${Number(os.chegada_lat).toFixed(5)}, ${Number(os.chegada_lng).toFixed(5)}` : ""}</span></div>
            <div class="os-row-info"><span class="os-key">Saída</span><span class="os-val">${_osFmtData(os.saida_em)}${os.saida_lat ? ` · ${Number(os.saida_lat).toFixed(5)}, ${Number(os.saida_lng).toFixed(5)}` : ""}</span></div>
            <div class="os-row-info"><span class="os-key">Recebido por</span><span class="os-val">${_waEscaparHtml(os.recebido_nome || "—")}${os.recebido_tipo ? ` (${_OS_RECEBIDO_TIPOS[os.recebido_tipo] || os.recebido_tipo})` : ""}</span></div>
          </div>
        </div>
      </div>

      <div>
        <div class="os-vsec-title">Tipos de serviço</div>
        <div class="os-chips-wrap">${tiposHtml}</div>
      </div>

      <div class="os-view-cols">
        <div>
          <div class="os-vsec-title">Itens verificados</div>
          ${itensHtml}
        </div>
        <div>
          <div class="os-vsec-title">Correntes elétricas</div>
          ${correntesHtml}
        </div>
      </div>

      <div>
        <div class="os-vsec-title">Resultado do serviço</div>
        <div class="os-result-row">
          ${resultado}
          ${os.necessario_retorno ? `<span class="os-status-pill os-status-rascunho">Necessita retorno${os.retorno_sugerido_em ? ` em ${_osFmtDataCurta(os.retorno_sugerido_em)}` : ""}</span>` : ""}
          ${os.orcamento_necessario ? `<span class="os-status-pill os-status-rascunho">Orçamento necessário</span>` : ""}
        </div>
        ${os.observacoes ? `<p class="os-obs">${_waEscaparHtml(os.observacoes)}</p>` : ""}
        ${os.orcamento_observacoes ? `<p class="os-obs"><strong>Orçamento:</strong> ${_waEscaparHtml(os.orcamento_observacoes)}</p>` : ""}
      </div>

      <div>
        <div class="os-vsec-title">Peças usadas</div>
        ${pecasHtml}
      </div>

      <div>
        <div class="os-vsec-title">Fotos${fotos.length ? ` (${fotos.length})` : ""}</div>
        ${fotosHtml}
      </div>

      <div>
        <div class="os-vsec-title">Assinatura de quem recebeu</div>
        ${assin}
      </div>
    </div>`;
}

function _osBindViewEventos() {
  document.querySelectorAll("#osModalBody .os-foto").forEach(fig => {
    fig.addEventListener("click", () => {
      const url = fig.dataset.fotoUrl;
      if (!url) return;
      const lb = document.getElementById("osFotoLightbox");
      const img = document.getElementById("osFotoLightboxImg");
      if (lb && img) { img.src = url; lb.style.display = "flex"; }
    });
  });
}

// ============================================================
// PDF
// ============================================================

async function baixarOSPdf(id) {
  if (!id) return;
  try {
    const r = await fetch(`/ordens-servico/${id}/pdf`, { headers: authHeaders() });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error || "Não foi possível baixar o PDF.");
      return;
    }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    // Abre em nova aba; revoga depois de carregar
    const w = window.open(url, "_blank");
    if (!w) {
      // popup bloqueado — força download
      const a = document.createElement("a");
      a.href = url;
      a.download = `os-${id}.pdf`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (err) {
    console.error("[os] baixarOSPdf:", err);
    alert("Erro ao baixar PDF: " + err.message);
  }
}

// ============================================================
// EDIÇÃO
// ============================================================

function _osEditsFromOS(os) {
  return {
    tipos_servico:        [...(os.tipos_servico || [])],
    observacoes:          os.observacoes || "",
    recebido_nome:        os.recebido_nome || "",
    recebido_tipo:        os.recebido_tipo || "",
    servico_realizado:    os.servico_realizado || "",
    necessario_retorno:   !!os.necessario_retorno,
    retorno_sugerido_em:  os.retorno_sugerido_em || "",
    orcamento_necessario: !!os.orcamento_necessario,
    orcamento_observacoes: os.orcamento_observacoes || "",
  };
}

function _osEntrarModoEdicao() {
  if (!_osSelecionada) return;
  _osModoEdicao = true;
  _osEdits = _osEditsFromOS(_osSelecionada);
  _osRenderModal();
}

function _osCancelarEdicao() {
  _osModoEdicao = false;
  _osEdits = null;
  _osRenderModal();
}

async function _osSalvarEdicao() {
  if (!_osSelecionadaId || !_osEdits) return;
  const btn = document.getElementById("osBtnSalvar");
  if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }
  try {
    const payload = { ..._osEdits };
    // Limpa retorno se desmarcou
    if (!payload.necessario_retorno) payload.retorno_sugerido_em = null;
    if (!payload.retorno_sugerido_em) delete payload.retorno_sugerido_em;
    if (!payload.recebido_tipo) payload.recebido_tipo = null;
    if (!payload.servico_realizado) payload.servico_realizado = null;

    const r = await fetch(`/ordens-servico/${_osSelecionadaId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro HTTP " + r.status);
    }
    // Recarrega lista + detalhe
    await carregarOrdensServico();
    _osModoEdicao = false;
    _osEdits = null;
    await abrirOSDetalhe(_osSelecionadaId); // refetch detalhe
    _osRenderKpis();
    _osRenderTabela();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Salvar"; }
  }
}

function _osRenderForm(edits) {
  const tipos = new Set(edits.tipos_servico || []);
  const tiposCheckboxes = Object.entries(_OS_TIPOS_SERVICO).map(([key, label]) => `
    <label class="os-check">
      <input type="checkbox" data-os-tipo="${key}" ${tipos.has(key) ? "checked" : ""}>
      <span>${_waEscaparHtml(label)}</span>
    </label>`).join("");

  const radios = (name, current, opcoes) => opcoes.map(([v, lbl]) => `
    <label class="os-radio">
      <input type="radio" name="${name}" value="${v}" ${current === v ? "checked" : ""}>
      <span>${_waEscaparHtml(lbl)}</span>
    </label>`).join("");

  return `
    <div class="os-form">
      <section class="os-section os-section-full">
        <h3 class="os-sec-title">Tipos de serviço</h3>
        <div class="os-checks-grid">${tiposCheckboxes}</div>
      </section>

      <section class="os-section">
        <h3 class="os-sec-title">Recebido por</h3>
        <label class="f"><span>Nome</span>
          <input id="osEdRecebidoNome" class="input" type="text" value="${_waEscaparHtml(edits.recebido_nome || "")}" />
        </label>
        <label class="f"><span>Tipo</span>
          <select id="osEdRecebidoTipo" class="input">
            <option value="">—</option>
            <option value="gestor"  ${edits.recebido_tipo === "gestor"   ? "selected" : ""}>Gestor</option>
            <option value="sindico" ${edits.recebido_tipo === "sindico"  ? "selected" : ""}>Síndico</option>
            <option value="portaria"${edits.recebido_tipo === "portaria" ? "selected" : ""}>Portaria</option>
          </select>
        </label>
      </section>

      <section class="os-section">
        <h3 class="os-sec-title">Resultado</h3>
        <div class="os-radios-row">
          ${radios("osEdResultado", edits.servico_realizado || "", [
            ["resolvido", "Resolvido"],
            ["paliativo", "Paliativo"],
            ["agravado",  "Agravado"],
          ])}
        </div>
      </section>

      <section class="os-section os-section-full">
        <h3 class="os-sec-title">Retorno</h3>
        <label class="os-check">
          <input type="checkbox" id="osEdRetorno" ${edits.necessario_retorno ? "checked" : ""}>
          <span>Necessita retorno</span>
        </label>
        <label class="f" style="margin-top:8px;"><span>Data sugerida</span>
          <input id="osEdRetornoData" type="date" class="input" value="${_waEscaparHtml(edits.retorno_sugerido_em ? String(edits.retorno_sugerido_em).slice(0, 10) : "")}" ${edits.necessario_retorno ? "" : "disabled"} />
        </label>
      </section>

      <section class="os-section os-section-full">
        <h3 class="os-sec-title">Observações</h3>
        <textarea id="osEdObs" class="input" rows="4" placeholder="Observações da O.S.">${_waEscaparHtml(edits.observacoes || "")}</textarea>
      </section>

      <section class="os-section os-section-full">
        <h3 class="os-sec-title">Orçamento</h3>
        <label class="os-check">
          <input type="checkbox" id="osEdOrcamento" ${edits.orcamento_necessario ? "checked" : ""}>
          <span>Orçamento necessário</span>
        </label>
        <textarea id="osEdOrcamentoObs" class="input" rows="3" style="margin-top:8px;" placeholder="Detalhes do orçamento">${_waEscaparHtml(edits.orcamento_observacoes || "")}</textarea>
      </section>
    </div>`;
}

function _osBindFormEventos() {
  const e = _osEdits;
  if (!e) return;

  document.querySelectorAll("[data-os-tipo]").forEach(cb => {
    cb.addEventListener("change", () => {
      const set = new Set(e.tipos_servico);
      if (cb.checked) set.add(cb.dataset.osTipo);
      else set.delete(cb.dataset.osTipo);
      e.tipos_servico = [...set];
    });
  });

  document.getElementById("osEdRecebidoNome")?.addEventListener("input", (ev) => { e.recebido_nome = ev.target.value; });
  document.getElementById("osEdRecebidoTipo")?.addEventListener("change", (ev) => { e.recebido_tipo = ev.target.value; });

  document.querySelectorAll('input[name="osEdResultado"]').forEach(r => {
    r.addEventListener("change", () => { if (r.checked) e.servico_realizado = r.value; });
  });

  document.getElementById("osEdRetorno")?.addEventListener("change", (ev) => {
    e.necessario_retorno = ev.target.checked;
    const dt = document.getElementById("osEdRetornoData");
    if (dt) dt.disabled = !ev.target.checked;
    if (!ev.target.checked) e.retorno_sugerido_em = "";
  });
  document.getElementById("osEdRetornoData")?.addEventListener("change", (ev) => { e.retorno_sugerido_em = ev.target.value; });

  document.getElementById("osEdObs")?.addEventListener("input", (ev) => { e.observacoes = ev.target.value; });

  document.getElementById("osEdOrcamento")?.addEventListener("change", (ev) => { e.orcamento_necessario = ev.target.checked; });
  document.getElementById("osEdOrcamentoObs")?.addEventListener("input", (ev) => { e.orcamento_observacoes = ev.target.value; });
}

// ============================================================
// ORÇAMENTOS — seção admin
// ============================================================

// ─── Orçamentos modo: troca de aba principal ────────────────────────────────
let _orcModoAtivo      = "avulso"; // "avulso" | "os"
let _orcModoBindFeito  = false;

function _orcModoBindEventos() {
  if (_orcModoBindFeito) return;
  _orcModoBindFeito = true;
  document.getElementById("orcMainTabs")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-orc-modo]");
    if (!btn) return;
    const modo = btn.dataset.orcModo;
    if (modo === _orcModoAtivo) return;
    _orcModoAtivo = modo;
    document.querySelectorAll("[data-orc-modo]").forEach(b => b.classList.toggle("is-active", b === btn));
    document.getElementById("orcModoAvulso").style.display = modo === "avulso" ? "" : "none";
    document.getElementById("orcModoOS").style.display     = modo === "os"     ? "" : "none";
    if (modo === "os") { carregarOrcamentos(); }
    else               { carregarAvulsos(); }
  });
}

// ─── Orçamentos avulsos ──────────────────────────────────────────────────────
let _avData        = [];
let _avTabAtiva    = "todos";
let _avSelecionado = null;
let _avLinhas      = [];
let _avLinhasId    = null;
let _avBindFeito   = false;
let _avCondos      = []; // lista de condominios para o select

async function carregarAvulsos() {
  try {
    const [rAv, rCond] = await Promise.all([
      fetch("/admin/orcamentos/avulsos", { headers: authHeaders() }),
      fetch("/admin/condominios/lista", { headers: authHeaders() }),
    ]);
    if (!rAv.ok) return;
    _avData = await rAv.json();
    if (rCond && rCond.ok) _avCondos = await rCond.json();
    _avRenderTudo();
  } catch (e) {
    console.error("carregarAvulsos:", e);
  }
}

function _avStatusCls(s) {
  if (s === "aprovado")  return "orc-status-ok";
  if (s === "rejeitado") return "orc-status-bad";
  if (s === "enviado")   return "orc-status-pend";
  return "orc-status-off";
}
function _avStatusLabel(s) {
  return { aprovado:"APROVADO", rejeitado:"REJEITADO", enviado:"ENVIADO", rascunho:"RASCUNHO" }[s] || s.toUpperCase();
}
function _avOrigemBadge(origem) {
  if (origem === "ia") return ` <span class="orc-origem-pill orc-origem-ia" title="Pedido recebido pelo WhatsApp">via IA</span>`;
  if (origem === "os") return ` <span class="orc-origem-pill orc-origem-os" title="Originado de uma ordem de serviço">via OS</span>`;
  return "";
}

function _avFiltrados() {
  const q = (document.getElementById("avBusca")?.value || "").trim().toLowerCase();
  return _avData.filter(o => {
    if (_avTabAtiva !== "todos" && o.status !== _avTabAtiva) return false;
    if (q) {
      const blob = `${o.condominio_nome || ""} ${o.numero || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function _avRenderTudo() {
  const total   = _avData.length;
  const rascunho= _avData.filter(o => o.status === "rascunho").length;
  const enviado = _avData.filter(o => o.status === "enviado").length;
  const aprov   = _avData.filter(o => o.status === "aprovado").length;
  const totalVal= _avData.reduce((s, o) => s + Number(o.valor_total || 0), 0);

  const ICO_LIST  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
  const ICO_DRAFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
  const ICO_SEND  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  const ICO_MONEY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;

  const kpi = (ico, val, label, cls) => `
    <div class="rc ${cls} rc-static">
      <div class="rc-head"><div class="rc-icon">${ico}</div><div class="rc-label">${label}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  const grid = document.getElementById("avKpiGrid");
  if (grid) grid.innerHTML =
    kpi(ICO_LIST,  total,                "Total",           "rc-neutral") +
    kpi(ICO_DRAFT, rascunho,             "Rascunho",        rascunho > 0 ? "rc-warn" : "rc-neutral") +
    kpi(ICO_SEND,  enviado,              "Enviado",         enviado  > 0 ? "rc-warn" : "rc-neutral") +
    kpi(ICO_MONEY, _orcFmtValor(totalVal || null), "Total aprovado", aprov > 0 ? "rc-ok" : "rc-neutral");

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("avCtTodos",    total);
  set("avCtRascunho", rascunho);
  set("avCtEnviado",  enviado);
  set("avCtAprovado", aprov);

  const lista = _avFiltrados();
  const tbody = document.getElementById("avTableBody");
  const empty = document.getElementById("avEmpty");
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
  } else {
    if (empty) empty.style.display = "none";
    tbody.innerHTML = lista.map(o => {
      const sel = _avSelecionado?.id === o.id ? " is-selected" : "";
      return `<tr class="${sel.trim()}" data-av-id="${o.id}" style="cursor:pointer;">
        <td><span class="mono" style="font-size:11px;">${_waEscaparHtml(o.numero || "—")}</span>${_avOrigemBadge(o.origem)}</td>
        <td>${_waEscaparHtml(o.condominio_nome || "—")}</td>
        <td style="font-weight:700;">${_orcFmtValor(o.valor_total)}</td>
        <td><span class="orc-status-pill ${_avStatusCls(o.status)}">${_avStatusLabel(o.status)}</span></td>
        <td style="color:var(--muted);font-size:11px;">${_orcFmtData(o.criado_em)}</td>
      </tr>`;
    }).join("");
  }
}

function _avFecharModal() {
  const m = document.getElementById("avModal");
  if (m) m.style.display = "none";
  document.body.style.overflow = "";
  _avSelecionado = null;
  // Atualiza seleção visual na tabela
  document.querySelectorAll("#avTableBody tr.is-selected").forEach(r => r.classList.remove("is-selected"));
}

function _avRenderPainel() {
  const modal = document.getElementById("avModal");
  const wrap  = document.getElementById("avModalBody");
  if (!wrap || !modal) return;

  if (!_avSelecionado) {
    modal.style.display = "none";
    document.body.style.overflow = "";
    return;
  }

  // Abre modal (sem re-animar se já estava aberto)
  if (modal.style.display !== "flex") {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  const o = _avSelecionado;
  const validadeVal = o.valido_ate ? new Date(o.valido_ate).toISOString().split("T")[0] : "";
  const condoOptions = _avCondos.map(c =>
    `<option value="${c.id}" ${String(c.id) === String(o.condominio_id) ? "selected" : ""}>${_waEscaparHtml(c.nome)}</option>`
  ).join("");

  wrap.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.2;">${_waEscaparHtml(o.numero || "Novo orçamento")}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;display:flex;align-items:center;gap:6px;">
          <span class="orc-status-pill ${_avStatusCls(o.status)}">${_avStatusLabel(o.status)}</span>
          <span>· ${_orcFmtData(o.criado_em)}</span>
        </div>
      </div>
      <button class="ap-close" data-av-action="fechar" title="Fechar" style="margin-top:2px;">×</button>
    </div>

    <div class="ap-section orc-form-section">
      <div class="orc-form-row" style="margin-bottom:10px;">
        <label class="orc-form-label">Condomínio / Cliente
          <select id="avInputCondo" class="select" style="margin-top:4px;">
            <option value="">Selecionar…</option>
            ${condoOptions}
          </select>
        </label>
        <label class="orc-form-label">O.S. vinculada
          <select id="avInputOs" class="select" style="margin-top:4px;">
            <option value="">Nenhuma</option>
          </select>
        </label>
        <label class="orc-form-label">Válido até
          <input id="avInputValidade" class="input" type="date" value="${validadeVal}">
        </label>
      </div>

      <label class="orc-form-label" style="display:flex;flex-direction:column;margin-bottom:10px;">
        Constatação
        <textarea id="avInputConstatacao" class="input" rows="3" maxlength="1000"
          style="resize:vertical;font-size:12px;padding:8px 10px;margin-top:4px;"
          placeholder="Descreva o serviço ou problema constatado…">${_waEscaparHtml(o.constatacao || '')}</textarea>
      </label>

      <!-- Itens -->
      <div class="ap-section-title" style="margin-top:4px;margin-bottom:8px;">Itens</div>
      <div id="avItensWrap">
        <div style="color:var(--muted);font-size:12px;padding:8px 0;">Carregando…</div>
      </div>

      <!-- Condições -->
      <div class="ap-section-title" style="margin-top:12px;margin-bottom:8px;">Condições Comerciais</div>
      <div class="orc-form-row" style="margin-bottom:8px;">
        <label class="orc-form-label">Forma de pagamento
          <input id="avInputPagamento" class="input" type="text" maxlength="255"
            placeholder="Via boleto bancário" value="${_waEscaparHtml(o.forma_pagamento || '')}">
        </label>
        <label class="orc-form-label">Prazo de entrega
          <input id="avInputPrazo" class="input" type="text" maxlength="100"
            placeholder="5 dias úteis após aprovação" value="${_waEscaparHtml(o.prazo_entrega || '')}">
        </label>
      </div>
      <div class="orc-form-row" style="margin-bottom:10px;">
        <label class="orc-form-label">Garantia
          <input id="avInputGarantia" class="input" type="text" maxlength="100"
            placeholder="12 meses por defeito de fabricação" value="${_waEscaparHtml(o.garantia || '')}">
        </label>
        <label class="orc-form-label">Status
          <select id="avInputStatus" class="select" style="margin-top:4px;">
            <option value="rascunho" ${o.status==="rascunho"?"selected":""}>Rascunho</option>
            <option value="enviado"  ${o.status==="enviado" ?"selected":""}>Enviado ao cliente</option>
            <option value="aprovado" ${o.status==="aprovado"?"selected":""}>Aprovado</option>
            <option value="rejeitado"${o.status==="rejeitado"?"selected":""}>Rejeitado</option>
          </select>
        </label>
      </div>

      <div class="av-modal-footer">
        <button class="btn btnDanger btn-sm" data-av-action="deletar">Excluir</button>
        <span class="orc-form-msg" id="avFormMsg"></span>
        <div class="av-footer-actions">
          <button class="btn btn-sm av-btn-pdf" data-av-action="gerar-pdf">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Gerar PDF
          </button>
          <button class="btn btn-sm av-btn-email" data-av-action="enviar-email">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Enviar por e-mail
          </button>
          <button class="btn btnAccent btn-sm" data-av-action="salvar">Salvar</button>
        </div>
      </div>
    </div>`;

  _avCarregarLinhas(o.id);
  _avCarregarOsDoModal(o.condominio_id, o.os_id);

  // Quando troca o condomínio, recarrega lista de OS
  document.getElementById("avInputCondo")?.addEventListener("change", e => {
    _avCarregarOsDoModal(e.target.value, null);
  });
}

async function _avCarregarOsDoModal(condoId, osIdSelecionado) {
  const sel = document.getElementById("avInputOs");
  if (!sel) return;
  sel.innerHTML = `<option value="">Nenhuma</option>`;
  if (!condoId) return;
  try {
    const r = await fetch(`/admin/condominios/${condoId}/historico`, { headers: authHeaders() });
    if (!r.ok) return;
    const { os } = await r.json();
    os.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = `OS #${o.numero || o.id} — ${o.status}`;
      if (String(o.id) === String(osIdSelecionado)) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (e) { console.error("_avCarregarOsDoModal:", e); }
}

async function _avCarregarLinhas(orcId) {
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${orcId}/linhas`, { headers: authHeaders() });
    if (!r.ok) return;
    _avLinhas   = await r.json();
    _avLinhasId = orcId;
    _avRenderLinhas();
  } catch (e) { console.error("_avCarregarLinhas:", e); }
}

function _avRenderLinhas() {
  const wrap = document.getElementById("avItensWrap");
  if (!wrap || _avLinhasId !== _avSelecionado?.id) return;

  const total = _avLinhas.reduce((s, l) => s + Number(l.valor_unitario) * Number(l.quantidade), 0);

  const fileiras = _avLinhas.map(l => {
    const tot = Number(l.valor_unitario) * Number(l.quantidade);
    return `<tr data-av-linha-id="${l.id}">
      <td style="max-width:160px;">
        <div style="font-size:12px;font-weight:500;">${_waEscaparHtml(l.descricao)}</div>
        ${l.ficha_tecnica ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px;white-space:pre-line;">${_waEscaparHtml(l.ficha_tecnica)}</div>` : ""}
      </td>
      <td class="orc-it-num">${l.quantidade}</td>
      <td class="orc-it-num">${_orcFmtValor(l.valor_unitario)}</td>
      <td class="orc-it-num" style="font-weight:600;">${_orcFmtValor(tot)}</td>
      <td style="text-align:center;"><button class="orc-it-del" data-av-del-linha="${l.id}" title="Remover">✕</button></td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table class="orc-itens-table">
      <thead>
        <tr>
          <th>Descrição / Ficha técnica</th>
          <th class="orc-it-num">Qtd</th>
          <th class="orc-it-num">Unit.</th>
          <th class="orc-it-num">Total</th>
          <th style="width:30px;"></th>
        </tr>
      </thead>
      <tbody>${fileiras || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:12px;font-size:12px;">Nenhum item ainda.</td></tr>'}</tbody>
    </table>
    ${_avLinhas.length ? `<div style="text-align:right;font-size:12px;font-weight:700;padding:6px 8px 0;color:var(--accent);">Total: ${_orcFmtValor(total)}</div>` : ""}

    <div class="orc-add-item-form" id="avAddLinhaForm">
      <div class="orc-add-item-row">
        <input id="avNewDesc" class="input" type="text" placeholder="Descrição do item *" maxlength="500" style="flex:2;">
        <input id="avNewQtd"  class="input" type="number" min="1" step="1" placeholder="Qtd" value="1" style="width:60px;">
        <input id="avNewVal"  class="input" type="number" min="0" step="0.01" placeholder="R$ unit." style="width:90px;">
      </div>
      <textarea id="avNewFicha" class="input" rows="2" maxlength="1000"
        placeholder="Ficha técnica (opcional) — ex: Marca: Weg&#10;Potência: 1.5cv"
        style="font-size:11.5px;resize:vertical;margin-top:6px;"></textarea>
      <button class="btn btn-sm" data-av-action="add-linha" style="margin-top:6px;align-self:flex-start;">+ Adicionar item</button>
    </div>`;
}

// Envio do orçamento — carrega template, permite editar mensagem/assinatura e salvar como padrão
async function _avAbrirEnvioEmail() {
  if (!_avSelecionado) return;
  const orc = _avSelecionado;

  let tpl = {};
  try {
    const r = await fetch("/admin/me/email-template", { headers: authHeaders() });
    if (r.ok) tpl = await r.json();
  } catch (_) {}

  const msgPadrao = tpl.email_mensagem || `Prezado(a),\n\nSegue em anexo o orçamento ${orc.numero || ""} referente ao seu condomínio.\n\nQualquer dúvida, estamos à disposição.`;
  let assinaturaUrl = tpl.assinatura_email_url || "";

  const ov = document.createElement("div");
  ov.className = "modalOverlay";
  ov.style.display = "flex";
  ov.innerHTML = `
    <div class="modalBox" style="max-width:520px;">
      <div class="modalHead">
        <div>
          <div class="modalTitle">Enviar orçamento por e-mail</div>
          <div class="modalSub">${_waEscaparHtml(orc.numero || "")} · ${_waEscaparHtml(orc.condominio_nome || "—")}</div>
        </div>
        <button class="btn btn-sm" id="avEnvioFechar">Fechar</button>
      </div>
      <div class="modalBody">
        <div class="modalTools"><div class="modalCount" id="avEnvioMsg"></div></div>
        <form class="formGrid" style="grid-template-columns:1fr;" onsubmit="return false;">
          <label class="f">
            <span>Para <small style="font-weight:400;color:var(--muted);">(separe vários por vírgula)</small></span>
            <input id="avEnvioPara" class="input" type="text" value="" placeholder="cliente@email.com" />
          </label>
          <label class="f">
            <span>Mensagem</span>
            <textarea id="avEnvioMsgTexto" class="input" rows="5" style="resize:vertical;">${_waEscaparHtml(msgPadrao)}</textarea>
          </label>
          <label class="f">
            <span>Assinatura <small style="font-weight:400;color:var(--muted);">(PNG ou JPG — deixe em branco para manter a atual)</small></span>
            <input id="avEnvioAssinaturaFile" type="file" accept="image/png,image/jpeg,image/jpg" class="input" style="padding:6px;" />
          </label>
          ${assinaturaUrl
            ? `<div><div class="hint" style="margin-bottom:6px;">Assinatura atual:</div><img id="avEnvioAssinaturaPreview" src="${_waEscaparHtml(assinaturaUrl)}" alt="Assinatura" style="max-height:70px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:6px;background:#fff;display:block;" /></div>`
            : `<img id="avEnvioAssinaturaPreview" style="display:none;max-height:70px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:6px;background:#fff;" />`}
          <label class="f" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer;">
            <input id="avEnvioSalvarPadrao" type="checkbox" style="width:auto;margin:0;" />
            <span style="font-weight:400;">Salvar mensagem e assinatura como padrão</span>
          </label>
          <div class="formActions">
            <button class="btn" type="button" id="avEnvioCancelar">Cancelar</button>
            <button class="btn btnAccent" type="button" id="avEnvioConfirmar">Enviar</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const fechar = () => ov.remove();
  ov.addEventListener("click", e => { if (e.target === ov) fechar(); });
  document.getElementById("avEnvioFechar").addEventListener("click", fechar);
  document.getElementById("avEnvioCancelar").addEventListener("click", fechar);
  setTimeout(() => document.getElementById("avEnvioPara")?.focus(), 30);

  // Preview ao trocar assinatura
  document.getElementById("avEnvioAssinaturaFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const prev = document.getElementById("avEnvioAssinaturaPreview");
      if (prev) { prev.src = ev.target.result; prev.style.display = "block"; }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("avEnvioConfirmar").addEventListener("click", async () => {
    const emails       = (document.getElementById("avEnvioPara")?.value || "").trim();
    const mensagem     = (document.getElementById("avEnvioMsgTexto")?.value || "").trim();
    const salvarPadrao = document.getElementById("avEnvioSalvarPadrao")?.checked;
    const msg          = document.getElementById("avEnvioMsg");
    const btn          = document.getElementById("avEnvioConfirmar");
    if (msg) { msg.style.color = "var(--muted)"; msg.textContent = "Enviando…"; }
    if (btn) btn.disabled = true;
    try {
      // Upload de nova assinatura se selecionada
      const file = document.getElementById("avEnvioAssinaturaFile").files[0];
      if (file) {
        if (msg) msg.textContent = "Enviando assinatura…";
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
        });
        const up = await fetch("/admin/me/assinatura", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ base64 }),
        });
        const upJ = await up.json();
        if (!up.ok) throw new Error(upJ.error || "Erro no upload");
        assinaturaUrl = upJ.url;
      }

      // Salva como padrão se marcado
      if (salvarPadrao) {
        await fetch("/admin/me/email-template", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ email_mensagem: mensagem, assinatura_email_url: assinaturaUrl || null }),
        });
      }

      if (msg) msg.textContent = "Enviando e-mail…";
      const r = await fetch(`/admin/orcamentos/avulsos/${orc.id}/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ emails, mensagem, assinatura_url: assinaturaUrl || undefined }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (msg) { msg.style.color = "var(--danger)"; msg.textContent = j.error || "Erro ao enviar"; }
        if (btn) btn.disabled = false;
        return;
      }
      orc.status = "enviado";
      orc.enviado_em = j.enviado_em;
      orc.enviado_para = j.enviado_para;
      const idx = _avData.findIndex(o => o.id === orc.id);
      if (idx !== -1) Object.assign(_avData[idx], { status: "enviado", enviado_em: j.enviado_em, enviado_para: j.enviado_para });
      fechar();
      _avRenderTudo();
      _avRenderPainel();
      const fmsg = document.getElementById("avFormMsg");
      if (fmsg) { fmsg.style.color = "var(--ok)"; fmsg.textContent = "✓ Orçamento enviado por e-mail"; setTimeout(() => { if (fmsg) fmsg.textContent = ""; }, 3000); }
    } catch (e) {
      if (msg) { msg.style.color = "var(--danger)"; msg.textContent = "Erro: " + e.message; }
      if (btn) btn.disabled = false;
    }
  });
}

async function _avAcao(acao) {
  const msg = document.getElementById("avFormMsg");

  if (acao === "novo") {
    if (msg) msg.textContent = "Criando…";
    try {
      const r = await fetch("/admin/orcamentos/avulsos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || "Erro ao criar"); return; }
      _avData.unshift(j);
      _avSelecionado = j;
      _avLinhas = []; _avLinhasId = j.id;
      _avRenderTudo();
      _avRenderPainel();
    } catch (e) { alert("Erro: " + e.message); }
    return;
  }

  if (!_avSelecionado) return;
  const id = _avSelecionado.id;

  if (acao === "add-linha") {
    const desc  = document.getElementById("avNewDesc")?.value.trim();
    const qtd   = Number(document.getElementById("avNewQtd")?.value) || 1;
    const valor = Number(document.getElementById("avNewVal")?.value) || 0;
    const ficha = document.getElementById("avNewFicha")?.value.trim() || null;
    if (!desc) { alert("Informe a descrição."); return; }
    if (msg) msg.textContent = "Adicionando…";
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${id}/linhas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ descricao: desc, ficha_tecnica: ficha, quantidade: qtd, valor_unitario: valor }),
      });
      const j = await r.json();
      if (!r.ok) { if (msg) msg.textContent = j.error || "Erro"; return; }
      _avLinhas.push(j);
      const clr = (i, v="") => { const el = document.getElementById(i); if (el) el.value = v; };
      clr("avNewDesc"); clr("avNewQtd","1"); clr("avNewVal"); clr("avNewFicha");
      if (msg) msg.textContent = "✓ Item adicionado";
      setTimeout(() => { if (msg) msg.textContent = ""; }, 2000);
      _avRenderLinhas();
      // Atualiza valor_total no _avData local
      const idx = _avData.findIndex(o => o.id === id);
      if (idx !== -1) _avData[idx].valor_total = _avLinhas.reduce((s, l) => s + Number(l.valor_unitario) * Number(l.quantidade), 0);
    } catch (e) { if (msg) msg.textContent = "Erro: " + e.message; }
    return;
  }

  if (acao === "del-linha") return; // handled via data-av-del-linha

  if (acao === "enviar-email") { _avAbrirEnvioEmail(); return; }

  if (acao === "gerar-pdf") {
    if (msg) msg.textContent = "Gerando PDF…";
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${id}/pdf`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(()=>({})); if (msg) msg.textContent = j.error || "Erro ao gerar PDF"; return; }
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.target = "_blank"; a.rel = "noopener";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
      if (msg) { msg.textContent = "✓ PDF gerado"; setTimeout(() => { msg.textContent = ""; }, 3000); }
    } catch (e) { if (msg) msg.textContent = "Erro: " + e.message; }
    return;
  }

  if (acao === "deletar") {
    if (!confirm("Excluir este orçamento e todos seus itens?")) return;
    try {
      await fetch(`/admin/orcamentos/avulsos/${id}`, { method: "DELETE", headers: authHeaders() });
      _avData = _avData.filter(o => o.id !== id);
      _avSelecionado = null; _avLinhas = []; _avLinhasId = null;
      _avFecharModal();
      _avRenderTudo();
    } catch (e) { alert("Erro: " + e.message); }
    return;
  }

  // salvar
  if (msg) msg.textContent = "Salvando…";
  const body = {
    condominio_id:   document.getElementById("avInputCondo")?.value || null,
    os_id:           document.getElementById("avInputOs")?.value || null,
    constatacao:     document.getElementById("avInputConstatacao")?.value.trim() || null,
    forma_pagamento: document.getElementById("avInputPagamento")?.value.trim() || null,
    prazo_entrega:   document.getElementById("avInputPrazo")?.value.trim() || null,
    garantia:        document.getElementById("avInputGarantia")?.value.trim() || null,
    valido_ate:      document.getElementById("avInputValidade")?.value || null,
    status:          document.getElementById("avInputStatus")?.value || "rascunho",
  };
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) { if (msg) msg.textContent = j.error || "Erro"; return; }
    const idx = _avData.findIndex(o => o.id === id);
    if (idx !== -1) {
      Object.assign(_avData[idx], j);
      // preservar condominio_nome
      if (body.condominio_id) {
        const c = _avCondos.find(c => String(c.id) === String(body.condominio_id));
        if (c) _avData[idx].condominio_nome = c.nome;
      }
    }
    _avSelecionado = _avData[idx] || _avSelecionado;
    if (msg) msg.textContent = "✓ Salvo";
    setTimeout(() => { if (msg) msg.textContent = ""; }, 2000);
    _avRenderTudo();
    _avRenderPainel();
  } catch (e) { if (msg) msg.textContent = "Erro: " + e.message; }
}

async function _avRemoverLinha(linhaId) {
  if (!confirm("Remover este item?")) return;
  try {
    await fetch(`/admin/orcamentos/avulsos/linhas/${linhaId}`, { method: "DELETE", headers: authHeaders() });
    _avLinhas = _avLinhas.filter(l => l.id !== linhaId);
    // Atualiza total local
    const idx = _avData.findIndex(o => o.id === _avSelecionado?.id);
    if (idx !== -1) _avData[idx].valor_total = _avLinhas.reduce((s, l) => s + Number(l.valor_unitario) * Number(l.quantidade), 0);
    _avRenderLinhas();
  } catch (e) { alert("Erro: " + e.message); }
}

function _avBindEventos() {
  if (_avBindFeito) return;
  _avBindFeito = true;

  document.getElementById("avBtnNovo")?.addEventListener("click", () => _avAcao("novo"));

  document.querySelectorAll("[data-av-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      _avTabAtiva = btn.dataset.avTab;
      document.querySelectorAll("[data-av-tab]").forEach(b => b.classList.toggle("is-active", b === btn));
      _avRenderTudo();
    });
  });

  document.getElementById("avBusca")?.addEventListener("input", _avRenderTudo);

  document.getElementById("avTableBody")?.addEventListener("click", e => {
    const row = e.target.closest("tr[data-av-id]");
    if (!row) return;
    const id = Number(row.dataset.avId);
    _avSelecionado = _avData.find(o => o.id === id) || null;
    _avRenderPainel();
    // Atualiza visual de seleção na tabela
    document.querySelectorAll("#avTableBody tr").forEach(r => r.classList.toggle("is-selected", r === row));
  });

  document.getElementById("avModalBackdrop")?.addEventListener("click", _avFecharModal);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.getElementById("avModal")?.style.display === "flex") {
      _avFecharModal();
    }
  });

  document.getElementById("avModal")?.addEventListener("click", e => {
    const delBtn = e.target.closest("[data-av-del-linha]");
    if (delBtn) { _avRemoverLinha(Number(delBtn.dataset.avDelLinha)); return; }

    const btn = e.target.closest("[data-av-action]");
    if (!btn) return;
    const acao = btn.dataset.avAction;
    if (acao === "fechar") { _avFecharModal(); }
    else _avAcao(acao);
  });
}

// ─── Orçamentos por OS ───────────────────────────────────────────────────────
let _orcData        = [];
let _orcTabAtiva    = "todos";
let _orcSelecionado = null;
let _orcBindFeito   = false;
let _orcCondosCarregados = false;
let _orcItens       = [];
let _orcItensOsId   = null;

async function carregarOrcamentos() {
  try {
    const r = await fetch("/admin/orcamentos", { headers: authHeaders() });
    if (!r.ok) return;
    _orcData = await r.json();
    _orcRenderTudo();
    _orcAtualizarBadge();
    if (!_orcCondosCarregados) _orcPopularFiltroCondos();
  } catch (e) {
    console.error("carregarOrcamentos:", e);
  }
}

function _orcFmtValor(v) {
  if (v == null) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _orcFmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function _orcStatusCls(s) {
  if (s === "aprovado")  return "orc-status-ok";
  if (s === "rejeitado") return "orc-status-bad";
  if (s === "expirado")  return "orc-status-off";
  if (s === "enviado")   return "orc-status-info";
  return "orc-status-pend"; // rascunho
}

function _orcStatusLabel(s) {
  if (s === "aprovado")  return "APROVADO";
  if (s === "rejeitado") return "REJEITADO";
  if (s === "expirado")  return "EXPIRADO";
  if (s === "enviado")   return "ENVIADO";
  return "PENDENTE"; // rascunho mostra como PENDENTE pro usuário (estado inicial)
}

function _orcFiltrados() {
  const q = (document.getElementById("orcBusca")?.value || "").trim().toLowerCase();
  const condo = document.getElementById("orcFiltroCondo")?.value || "";
  // Tab "pendente" mapeia para o novo valor "rascunho" no banco
  const tabBanco = _orcTabAtiva === "pendente" ? "rascunho" : _orcTabAtiva;
  return _orcData.filter(o => {
    if (_orcTabAtiva !== "todos" && o.orcamento_status !== tabBanco) return false;
    if (condo && String(o.condominio_id) !== condo) return false;
    if (q) {
      const blob = `${o.condominio_nome || ""} ${o.tecnico_nome || ""} ${o.numero || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function _orcRenderTudo() {
  // KPIs (no banco, "pendente" é representado como "rascunho")
  const total    = _orcData.length;
  const pend     = _orcData.filter(o => o.orcamento_status === "rascunho").length;
  const aprov    = _orcData.filter(o => o.orcamento_status === "aprovado").length;
  const rejeit   = _orcData.filter(o => o.orcamento_status === "rejeitado").length;
  const totalVal = _orcData.filter(o => o.orcamento_status === "aprovado" && o.orcamento_valor)
                           .reduce((s, o) => s + Number(o.orcamento_valor), 0);

  const ICO_LIST  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
  const ICO_CLK   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const ICO_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const ICO_X     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  const ICO_MONEY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;

  const kpi = (ico, val, label, cls) => `
    <div class="rc ${cls} rc-static">
      <div class="rc-head"><div class="rc-icon">${ico}</div><div class="rc-label">${label}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  const grid = document.getElementById("orcKpiGrid");
  if (grid) grid.innerHTML =
    kpi(ICO_LIST,  total,                         "Total",          "rc-neutral") +
    kpi(ICO_CLK,   pend,                          "Pendentes",      pend  > 0 ? "rc-warn" : "rc-neutral") +
    kpi(ICO_CHECK, aprov,                         "Aprovados",      aprov > 0 ? "rc-ok"   : "rc-neutral") +
    kpi(ICO_X,     rejeit,                        "Rejeitados",     rejeit> 0 ? "rc-bad"  : "rc-neutral") +
    kpi(ICO_MONEY, _orcFmtValor(totalVal || null),"Total aprovado", aprov > 0 ? "rc-ok"   : "rc-neutral");

  // Contadores das tabs
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("orcCtTodos",     total);
  set("orcCtPendente",  pend);
  set("orcCtAprovado",  aprov);
  set("orcCtRejeitado", rejeit);

  // Tabela
  const lista   = _orcFiltrados();
  const tbody   = document.getElementById("orcTableBody");
  const empty   = document.getElementById("orcEmpty");
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = lista.map(o => {
    const sel = _orcSelecionado?.id === o.id ? " is-selected" : "";
    const obs = o.orcamento_observacoes
      ? o.orcamento_observacoes.slice(0, 80) + (o.orcamento_observacoes.length > 80 ? "…" : "")
      : "—";
    return `<tr class="${sel.trim()}" data-orc-id="${o.id}" style="cursor:pointer;">
      <td><span class="mono" style="font-size:11px;">${o.numero || "—"}</span></td>
      <td>${_waEscaparHtml(o.condominio_nome || "—")}</td>
      <td style="color:var(--muted);font-size:11.5px;">${_waEscaparHtml(o.tecnico_nome || "—")}</td>
      <td style="color:var(--muted);font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_waEscaparHtml(obs)}</td>
      <td style="font-weight:700;">${_orcFmtValor(o.orcamento_valor)}</td>
      <td><span class="orc-status-pill ${_orcStatusCls(o.orcamento_status)}">${_orcStatusLabel(o.orcamento_status)}</span></td>
      <td style="color:var(--muted);font-size:11px;">${_orcFmtData(o.finalizada_em || o.criado_em)}</td>
    </tr>`;
  }).join("");

  _orcRenderPainel();
}

function _orcRenderPainel() {
  const wrap = document.getElementById("orcPainel");
  if (!wrap) return;

  if (!_orcSelecionado) {
    wrap.innerHTML = `<div class="al-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      <p>Selecione um orçamento para ver os detalhes</p>
    </div>`;
    return;
  }

  const o = _orcSelecionado;
  const isPend  = o.orcamento_status === "rascunho";
  const isAprov = o.orcamento_status === "aprovado";

  const validadeVal = o.orcamento_valido_ate
    ? new Date(o.orcamento_valido_ate).toISOString().split("T")[0]
    : "";

  wrap.innerHTML = `
    <div class="ap-head">
      <div>
        <div class="ap-title">OS ${o.numero || o.id}</div>
        <div class="ap-sub"><span class="orc-status-pill ${_orcStatusCls(o.orcamento_status)}">${_orcStatusLabel(o.orcamento_status)}</span> · ${_orcFmtData(o.finalizada_em || o.criado_em)}</div>
      </div>
      <button class="ap-close" data-orc-action="fechar" title="Fechar">×</button>
    </div>

    <div class="ap-section">
      <div class="ap-section-title">Dados</div>
      <div class="ap-kv">
        <div><span class="k">Condomínio</span><span class="v">${_waEscaparHtml(o.condominio_nome || "—")}</span></div>
        <div><span class="k">Técnico</span><span class="v">${_waEscaparHtml(o.tecnico_nome || "—")}</span></div>
        ${o.chamado_id ? `<div><span class="k">Chamado</span><span class="v">#${o.chamado_id}</span></div>` : ""}
      </div>
    </div>

    <div class="ap-section">
      <div class="ap-section-title">Observação do técnico</div>
      <div style="font-size:12px;line-height:1.6;color:var(--text);margin-top:4px;white-space:pre-wrap;">${o.orcamento_observacoes ? _waEscaparHtml(o.orcamento_observacoes) : '<span style="color:var(--muted)">Sem observação registrada.</span>'}</div>
    </div>

    <!-- Orçamento Formal -->
    <div class="ap-section orc-form-section">
      <div class="ap-section-title">Orçamento Formal</div>

      <div class="orc-form-row" style="margin-bottom:10px;">
        <label class="orc-form-label">Nº Orçamento
          <input id="orcInputNumero" class="input" type="text" maxlength="30" placeholder="OR-XXXXXX"
            value="${_waEscaparHtml(o.orcamento_numero || '')}">
        </label>
        <label class="orc-form-label">Válido até
          <input id="orcInputValidade" class="input" type="date" value="${validadeVal}">
        </label>
      </div>

      <label class="orc-form-label" style="display:flex;flex-direction:column;margin-bottom:10px;">
        Constatação
        <textarea id="orcInputConstatacao" class="input" rows="3" maxlength="255"
          style="resize:vertical;font-size:12px;padding:8px 10px;margin-top:4px;"
          placeholder="Descreva o problema constatado…">${_waEscaparHtml(o.orcamento_constatacao || '')}</textarea>
      </label>

      <!-- Itens -->
      <div class="ap-section-title" style="margin-top:4px;margin-bottom:8px;">Itens</div>
      <div id="orcItensWrap">
        <div class="orc-itens-loading" style="color:var(--muted);font-size:12px;padding:8px 0;">Carregando itens…</div>
      </div>

      <!-- Condições comerciais -->
      <div class="ap-section-title" style="margin-top:12px;margin-bottom:8px;">Condições Comerciais</div>
      <div class="orc-form-row" style="margin-bottom:8px;">
        <label class="orc-form-label">Forma de pagamento
          <input id="orcInputPagamento" class="input" type="text" maxlength="255"
            placeholder="Via boleto bancário"
            value="${_waEscaparHtml(o.orcamento_forma_pagamento || '')}">
        </label>
        <label class="orc-form-label">Prazo de entrega
          <input id="orcInputPrazo" class="input" type="text" maxlength="100"
            placeholder="5 dias úteis após aprovação"
            value="${_waEscaparHtml(o.orcamento_prazo_entrega || '')}">
        </label>
      </div>
      <div class="orc-form-row" style="margin-bottom:10px;">
        <label class="orc-form-label">Garantia
          <input id="orcInputGarantia" class="input" type="text" maxlength="100"
            placeholder="12 meses por defeito de fabricação"
            value="${_waEscaparHtml(o.orcamento_garantia || '')}">
        </label>
        <label class="orc-form-label">Disponibilidade
          <input id="orcInputDisponibilidade" class="input" type="text" maxlength="100"
            placeholder="Total"
            value="${_waEscaparHtml(o.orcamento_disponibilidade || '')}">
        </label>
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn btn-sm viewer-only-hide" data-orc-action="salvar" style="flex-shrink:0;">Salvar orçamento</button>
        <button class="btn btn-sm viewer-only-hide" data-orc-action="gerar-pdf"
          style="flex-shrink:0;background:rgba(240,176,20,.1);border-color:rgba(240,176,20,.4);color:#f0b014;">
          ↓ Gerar PDF
        </button>
        <span class="orc-form-msg" id="orcFormMsg"></span>
      </div>
    </div>

    <!-- Aprovação -->
    ${isAprov && o.orcamento_aprovado_em ? `
    <div class="ap-section">
      <div class="ap-section-title">Aprovação</div>
      <div class="ap-kv">
        <div><span class="k">Aprovado em</span><span class="v">${new Date(o.orcamento_aprovado_em).toLocaleString("pt-BR")}</span></div>
        ${o.aprovado_por_nome ? `<div><span class="k">Por</span><span class="v">${_waEscaparHtml(o.aprovado_por_nome)}</span></div>` : ""}
      </div>
    </div>` : ""}

    ${o.orcamento_status === "rejeitado" && o.orcamento_motivo_rejeicao ? `
    <div class="ap-section">
      <div class="ap-section-title">Motivo da rejeição</div>
      <div style="font-size:12px;color:var(--danger);margin-top:4px;">${_waEscaparHtml(o.orcamento_motivo_rejeicao)}</div>
    </div>` : ""}

    <div class="orc-acoes viewer-only-hide">
      ${isPend || isAprov ? `<button class="btn btn-sm orc-btn-reject" data-orc-action="rejeitar">✕ Rejeitar</button>` : ""}
      <button class="btn btn-sm orc-btn-approve" data-orc-action="aprovar">✓ Aprovar</button>
    </div>`;

  // Carregar itens async
  _orcCarregarItens(o.id);
}

async function _orcCarregarItens(osId) {
  try {
    const r = await fetch(`/admin/orcamentos/${osId}/itens`, { headers: authHeaders() });
    if (!r.ok) return;
    _orcItens = await r.json();
    _orcItensOsId = osId;
    _orcRenderItens();
  } catch (e) {
    console.error("_orcCarregarItens:", e);
  }
}

function _orcRenderItens() {
  const wrap = document.getElementById("orcItensWrap");
  if (!wrap || _orcItensOsId !== _orcSelecionado?.id) return;

  const total = _orcItens.reduce((s, it) => s + Number(it.valor_unitario) * Number(it.quantidade), 0);

  const fileiras = _orcItens.map(it => {
    const tot = Number(it.valor_unitario) * Number(it.quantidade);
    return `<tr data-orc-item-id="${it.id}">
      <td style="max-width:160px;">
        <div style="font-size:12px;font-weight:500;">${_waEscaparHtml(it.descricao)}</div>
        ${it.ficha_tecnica ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px;white-space:pre-line;">${_waEscaparHtml(it.ficha_tecnica)}</div>` : ""}
      </td>
      <td class="orc-it-num">${it.quantidade}</td>
      <td class="orc-it-num">${_orcFmtValor(it.valor_unitario)}</td>
      <td class="orc-it-num" style="font-weight:600;">${_orcFmtValor(tot)}</td>
      <td class="viewer-only-hide" style="text-align:center;">
        <button class="orc-it-del" data-orc-del-item="${it.id}" title="Remover">✕</button>
      </td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table class="orc-itens-table">
      <thead>
        <tr>
          <th>Descrição / Ficha técnica</th>
          <th class="orc-it-num">Qtd</th>
          <th class="orc-it-num">Unit.</th>
          <th class="orc-it-num">Total</th>
          <th class="viewer-only-hide" style="width:30px;"></th>
        </tr>
      </thead>
      <tbody>${fileiras || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:12px;font-size:12px;">Nenhum item ainda.</td></tr>'}</tbody>
    </table>
    ${_orcItens.length ? `<div style="text-align:right;font-size:12px;font-weight:700;padding:6px 8px 0;color:var(--accent);">Total: ${_orcFmtValor(total)}</div>` : ""}

    <!-- Formulário de novo item -->
    <div class="orc-add-item-form viewer-only-hide" id="orcAddItemForm">
      <div class="orc-add-item-row">
        <input id="orcNewDescricao" class="input" type="text" placeholder="Descrição do item *" maxlength="500" style="flex:2;">
        <input id="orcNewQtd" class="input" type="number" min="1" step="1" placeholder="Qtd" value="1" style="width:60px;">
        <input id="orcNewValor" class="input" type="number" min="0" step="0.01" placeholder="R$ unit." style="width:90px;">
      </div>
      <textarea id="orcNewFicha" class="input" rows="2" maxlength="1000"
        placeholder="Ficha técnica (opcional) — ex: Marca: Weg&#10;Potência: 1.5cv"
        style="font-size:11.5px;resize:vertical;margin-top:6px;"></textarea>
      <button class="btn btn-sm" data-orc-action="add-item" style="margin-top:6px;align-self:flex-start;">+ Adicionar item</button>
    </div>`;
}

async function _orcAcao(acao) {
  if (!_orcSelecionado) return;
  const osId = _orcSelecionado.id;
  const msg = document.getElementById("orcFormMsg");

  if (acao === "add-item") {
    return _orcAdicionarItem();
  }

  if (acao === "gerar-pdf") {
    return _orcGerarPdf();
  }

  if (acao === "del-item") return; // handled via data-orc-del-item

  if (msg) msg.textContent = "Salvando…";

  const body = { acao };

  // Campos do orçamento formal (sempre enviados)
  const numero = document.getElementById("orcInputNumero")?.value.trim();
  const constatacao = document.getElementById("orcInputConstatacao")?.value.trim();
  const forma_pagamento = document.getElementById("orcInputPagamento")?.value.trim();
  const prazo_entrega = document.getElementById("orcInputPrazo")?.value.trim();
  const garantia = document.getElementById("orcInputGarantia")?.value.trim();
  const disponibilidade = document.getElementById("orcInputDisponibilidade")?.value.trim();
  const valido_ate = document.getElementById("orcInputValidade")?.value;

  if (numero !== undefined)         body.numero = numero;
  if (constatacao !== undefined)    body.constatacao = constatacao;
  if (forma_pagamento !== undefined) body.forma_pagamento = forma_pagamento;
  if (prazo_entrega !== undefined)  body.prazo_entrega = prazo_entrega;
  if (garantia !== undefined)       body.garantia = garantia;
  if (disponibilidade !== undefined) body.disponibilidade = disponibilidade;
  if (valido_ate)                   body.valido_ate = valido_ate;

  // Valor calculado dos itens (se houver); fallback manual removido
  if (_orcItensOsId === osId && _orcItens.length > 0) {
    const total = _orcItens.reduce((s, it) => s + Number(it.valor_unitario) * Number(it.quantidade), 0);
    body.valor = total;
  }

  if (acao === "rejeitar") {
    const m = prompt("Motivo da rejeição (opcional):");
    if (m === null) { if (msg) msg.textContent = ""; return; }
    if (m) body.motivo_rejeicao = m;
  }

  try {
    const r = await fetch(`/admin/orcamentos/${osId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (msg) msg.textContent = j.error || "Erro"; return; }

    const idx = _orcData.findIndex(o => o.id === osId);
    if (idx !== -1) Object.assign(_orcData[idx], j);
    _orcSelecionado = _orcData[idx] || null;
    if (msg) msg.textContent = "✓ Salvo";
    setTimeout(() => { if (msg) msg.textContent = ""; }, 2000);
    _orcRenderTudo();
    _orcAtualizarBadge();
  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

async function _orcAdicionarItem() {
  const osId = _orcSelecionado?.id;
  if (!osId) return;

  const desc  = document.getElementById("orcNewDescricao")?.value.trim();
  const qtd   = Number(document.getElementById("orcNewQtd")?.value) || 1;
  const valor = Number(document.getElementById("orcNewValor")?.value) || 0;
  const ficha = document.getElementById("orcNewFicha")?.value.trim() || null;

  if (!desc) {
    alert("Informe a descrição do item.");
    return;
  }

  const msg = document.getElementById("orcFormMsg");
  if (msg) msg.textContent = "Adicionando…";

  try {
    const r = await fetch(`/admin/orcamentos/${osId}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ descricao: desc, ficha_tecnica: ficha, quantidade: qtd, valor_unitario: valor }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (msg) msg.textContent = j.error || "Erro"; return; }

    _orcItens.push(j);
    // Limpa form
    const clr = (id, v = "") => { const el = document.getElementById(id); if (el) el.value = v; };
    clr("orcNewDescricao"); clr("orcNewQtd", "1"); clr("orcNewValor"); clr("orcNewFicha");
    if (msg) msg.textContent = "✓ Item adicionado";
    setTimeout(() => { if (msg) msg.textContent = ""; }, 2000);
    _orcRenderItens();
  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

async function _orcRemoverItem(itemId) {
  if (!confirm("Remover este item?")) return;
  const msg = document.getElementById("orcFormMsg");
  try {
    const r = await fetch(`/admin/orcamentos/itens/${itemId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!r.ok) { if (msg) msg.textContent = "Erro ao remover"; return; }
    _orcItens = _orcItens.filter(it => it.id !== itemId);
    _orcRenderItens();
  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

async function _orcGerarPdf() {
  const osId = _orcSelecionado?.id;
  if (!osId) return;
  const msg = document.getElementById("orcFormMsg");
  if (msg) msg.textContent = "Gerando PDF…";
  try {
    const r = await fetch(`/admin/orcamentos/${osId}/pdf`, { headers: authHeaders() });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (msg) msg.textContent = j.error || "Erro ao gerar PDF";
      return;
    }
    const blob = await r.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    if (msg) { msg.textContent = "✓ PDF gerado"; setTimeout(() => { msg.textContent = ""; }, 3000); }
  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

function _orcAtualizarBadge() {
  const pend = _orcData.filter(o => o.orcamento_status === "rascunho").length;
  const badge = document.getElementById("navBadgeOrcamentos");
  if (badge) {
    badge.textContent = pend;
    badge.style.display = pend > 0 ? "inline-flex" : "none";
  }
  const tabBadge = document.getElementById("navBadgeOrcamentosOS");
  if (tabBadge) {
    tabBadge.textContent = pend;
    tabBadge.style.display = pend > 0 ? "inline-flex" : "none";
  }
}

function _orcPopularFiltroCondos() {
  const sel = document.getElementById("orcFiltroCondo");
  if (!sel) return;
  const condos = [...new Map(_orcData.map(o => [o.condominio_id, o.condominio_nome])).entries()]
    .sort((a, b) => (a[1] || "").localeCompare(b[1] || ""));
  condos.forEach(([id, nome]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = nome || id;
    sel.appendChild(opt);
  });
  _orcCondosCarregados = true;
}

function _orcBindEventos() {
  if (_orcBindFeito) return;
  _orcBindFeito = true;

  // Tabs
  document.querySelectorAll("[data-orc-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      _orcTabAtiva = btn.dataset.orcTab;
      document.querySelectorAll("[data-orc-tab]").forEach(b => b.classList.toggle("is-active", b === btn));
      _orcRenderTudo();
    });
  });

  // Busca + filtro condo
  document.getElementById("orcBusca")?.addEventListener("input", _orcRenderTudo);
  document.getElementById("orcFiltroCondo")?.addEventListener("change", _orcRenderTudo);

  // Click na linha
  document.getElementById("orcTableBody")?.addEventListener("click", e => {
    const row = e.target.closest("tr[data-orc-id]");
    if (!row) return;
    const id = Number(row.dataset.orcId);
    _orcSelecionado = _orcData.find(o => o.id === id) || null;
    _orcRenderTudo();
  });

  // Ações no painel (delegated)
  document.getElementById("orcPainel")?.addEventListener("click", e => {
    // Remover item
    const delBtn = e.target.closest("[data-orc-del-item]");
    if (delBtn) { _orcRemoverItem(Number(delBtn.dataset.orcDelItem)); return; }

    const btn = e.target.closest("[data-orc-action]");
    if (!btn) return;
    const acao = btn.dataset.orcAction;
    if (acao === "fechar") { _orcSelecionado = null; _orcRenderTudo(); }
    else _orcAcao(acao);
  });
}

// ─── Planos de manutenção preventiva ─────────────────────────────────────────

let _pmData         = [];
let _pmTabAtiva     = "todos";
let _pmBindFeito    = false;
let _pmCondosCache  = null;

const PM_PERIOD_PRESETS = [
  { label: "Semanal",     dias: 7   },
  { label: "Quinzenal",   dias: 15  },
  { label: "Mensal",      dias: 30  },
  { label: "Trimestral",  dias: 90  },
  { label: "Semestral",   dias: 180 },
  { label: "Anual",       dias: 365 },
];

function _pmFmtData(iso) {
  if (!iso) return "—";
  // proxima_em/ultima_em vêm como YYYY-MM-DD (DATE) — não tem timezone
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function _pmPeriodLabel(dias) {
  const preset = PM_PERIOD_PRESETS.find(p => p.dias === Number(dias));
  if (preset) return preset.label;
  return `${dias} dias`;
}

function _pmDiasAteProxima(iso) {
  if (!iso) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prox = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return Math.round((prox - hoje) / (1000 * 60 * 60 * 24));
}

function _pmStatus(p) {
  if (!p.ativo) return { cls: "orc-status-off", label: "INATIVO", kind: "inativo" };
  const d = _pmDiasAteProxima(p.proxima_em);
  if (d == null) return { cls: "orc-status-pend", label: "—", kind: "em-dia" };
  if (d < 0)  return { cls: "orc-status-bad",  label: `VENCIDO ${-d}d`, kind: "vencidos" };
  if (d <= 7) return { cls: "orc-status-pend", label: `EM ${d}d`,       kind: "vencendo" };
  return { cls: "orc-status-ok", label: "EM DIA", kind: "em-dia" };
}

async function carregarPlanos() {
  try {
    const r = await fetch("/planos-manutencao", { headers: authHeaders() });
    if (!r.ok) return;
    _pmData = await r.json();
    _pmRenderTudo();
    _pmAtualizarBadge();
  } catch (e) {
    console.error("carregarPlanos:", e);
  }
}

async function _pmCarregarCondos() {
  if (_pmCondosCache) return _pmCondosCache;
  try {
    const r = await fetch("/admin/condominios/lista", { headers: authHeaders() });
    _pmCondosCache = r.ok ? await r.json() : [];
  } catch { _pmCondosCache = []; }
  return _pmCondosCache;
}

function _pmFiltrados() {
  const q = (document.getElementById("pmBusca")?.value || "").trim().toLowerCase();
  return _pmData.filter(p => {
    const st = _pmStatus(p).kind;
    if (_pmTabAtiva === "vencidos" && st !== "vencidos") return false;
    if (_pmTabAtiva === "vencendo" && st !== "vencendo") return false;
    if (_pmTabAtiva === "em-dia"   && st !== "em-dia")   return false;
    if (_pmTabAtiva === "inativos" && p.ativo)           return false;
    if (_pmTabAtiva === "todos"    && !p.ativo)          return false; // "todos" mostra só ativos
    if (q) {
      const blob = `${p.condominio_nome || ""} ${p.titulo || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function _pmRenderTudo() {
  const ativos    = _pmData.filter(p => p.ativo);
  const vencidos  = ativos.filter(p => _pmStatus(p).kind === "vencidos").length;
  const vencendo  = ativos.filter(p => _pmStatus(p).kind === "vencendo").length;
  const emDia     = ativos.filter(p => _pmStatus(p).kind === "em-dia").length;
  const inativos  = _pmData.filter(p => !p.ativo).length;

  // KPIs
  const ICO_CAL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const ICO_X    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  const ICO_CLK  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const ICO_OK   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const kpi = (ico, val, label, cls) => `
    <div class="rc ${cls} rc-static">
      <div class="rc-head"><div class="rc-icon">${ico}</div><div class="rc-label">${label}</div></div>
      <div class="rc-value">${val}</div>
    </div>`;

  const grid = document.getElementById("pmKpiGrid");
  if (grid) grid.innerHTML =
    kpi(ICO_CAL, ativos.length, "Planos ativos", "rc-neutral") +
    kpi(ICO_X,   vencidos,      "Vencidos",      vencidos > 0 ? "rc-bad"  : "rc-neutral") +
    kpi(ICO_CLK, vencendo,      "Próximos 7d",   vencendo > 0 ? "rc-warn" : "rc-neutral") +
    kpi(ICO_OK,  emDia,         "Em dia",        emDia > 0    ? "rc-ok"   : "rc-neutral");

  // Contadores das tabs
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("pmCtTodos",    ativos.length);
  set("pmCtVencidos", vencidos);
  set("pmCtVencendo", vencendo);
  set("pmCtEmDia",    emDia);
  set("pmCtInativos", inativos);

  // Tabela
  const lista = _pmFiltrados();
  const tbody = document.getElementById("pmTableBody");
  const empty = document.getElementById("pmEmpty");
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = lista.map(p => {
    const st = _pmStatus(p);
    const zona = p.condominio_zona || "—";
    return `<tr data-pm-id="${p.id}">
      <td>${_waEscaparHtml(p.condominio_nome || "—")}</td>
      <td style="color:var(--muted);font-size:11.5px;">${_waEscaparHtml(zona)}</td>
      <td>${_waEscaparHtml(p.titulo || "—")}</td>
      <td style="color:var(--muted);font-size:11.5px;">${_pmPeriodLabel(p.periodicidade_dias)}</td>
      <td style="color:var(--muted);font-size:11.5px;">${_pmFmtData(p.ultima_em)}</td>
      <td style="font-weight:600;">${_pmFmtData(p.proxima_em)}</td>
      <td><span class="orc-status-pill ${st.cls}">${st.label}</span></td>
      <td>
        <button class="btn btn-sm viewer-only-hide" data-pm-action="executar" data-pm-id="${p.id}" title="Gerar chamado P4 agora" style="font-size:10.5px;padding:3px 8px;">▶</button>
        <button class="btn btn-sm viewer-only-hide" data-pm-action="editar"   data-pm-id="${p.id}" title="Editar"                  style="font-size:10.5px;padding:3px 8px;">✎</button>
        <button class="btn btn-sm viewer-only-hide" data-pm-action="excluir"  data-pm-id="${p.id}" title="Desativar"               style="font-size:10.5px;padding:3px 8px;color:var(--danger);">×</button>
      </td>
    </tr>`;
  }).join("");
}

function _pmAtualizarBadge() {
  const venc = _pmData.filter(p => p.ativo && _pmStatus(p).kind === "vencidos").length;
  const badge = document.getElementById("navBadgePlanos");
  if (!badge) return;
  badge.textContent = venc;
  badge.style.display = venc > 0 ? "inline-flex" : "none";
}

async function _pmAbrirModal(plano) {
  await _pmCarregarCondos();
  const isEdit = !!plano;
  document.getElementById("pmModalTitulo").textContent = isEdit ? "Editar plano" : "Novo plano";
  document.getElementById("pmModalSubtitulo").textContent = isEdit ? "Atualize os dados do plano de manutenção" : "Preencha os dados para criar um plano de manutenção";

  const condoOpts = _pmCondosCache.map(c =>
    `<option value="${c.id}" ${plano?.condominio_id === c.id ? "selected" : ""}>${_waEscaparHtml(c.nome)}</option>`
  ).join("");

  const periodAtual = plano?.periodicidade_dias ?? 30;
  const periodCustom = !PM_PERIOD_PRESETS.some(p => p.dias === periodAtual);
  const periodOpts = PM_PERIOD_PRESETS.map(p =>
    `<option value="${p.dias}" ${p.dias === periodAtual ? "selected" : ""}>${p.label} (${p.dias}d)</option>`
  ).join("") + `<option value="custom" ${periodCustom ? "selected" : ""}>Personalizado…</option>`;

  // Próxima: default = hoje+30d
  const proxDefault = (() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const proxVal = plano?.proxima_em ? String(plano.proxima_em).slice(0, 10) : proxDefault;

  const body = document.getElementById("pmModalBody");
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">

      <!-- Seção: informações -->
      <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px;">Informações do plano</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div class="field">
            <span class="lbl">Condomínio</span>
            <select id="pmFCondo" class="input">
              <option value="">— escolha —</option>
              ${condoOpts}
            </select>
          </div>
          <div class="field">
            <span class="lbl">Título do plano</span>
            <input id="pmFTitulo" class="input" type="text" maxlength="255" placeholder="Ex: Limpeza de caixa d'água" value="${_waEscaparHtml(plano?.titulo || "")}">
          </div>
          <div class="field">
            <span class="lbl">Descrição (opcional)</span>
            <textarea id="pmFDescricao" class="input" rows="2" maxlength="2000" placeholder="Detalhes do serviço a executar" style="resize:vertical;">${_waEscaparHtml(plano?.descricao || "")}</textarea>
          </div>
        </div>
      </div>

      <!-- Seção: periodicidade -->
      <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px;">Periodicidade e agendamento</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field">
            <span class="lbl">Periodicidade</span>
            <select id="pmFPeriodPreset" class="input">${periodOpts}</select>
          </div>
          <div class="field" id="pmFPeriodCustomLabel" style="${periodCustom ? "" : "display:none;"}">
            <span class="lbl">Dias</span>
            <input id="pmFPeriodDias" class="input" type="number" min="1" max="3650" value="${periodAtual}">
          </div>
          <div class="field" style="grid-column:1/-1;">
            <span class="lbl">Próxima execução</span>
            <input id="pmFProxima" class="input" type="date" value="${proxVal}">
          </div>
          ${isEdit ? `<div class="field" style="grid-column:1/-1;">
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-size:12px;color:var(--text-dim);">
              <input id="pmFAtivo" type="checkbox" ${plano.ativo ? "checked" : ""}> Plano ativo
            </label>
          </div>` : ""}
        </div>
      </div>

      <div id="pmFErr" style="font-size:11px;color:var(--danger);min-height:14px;padding:0 2px;"></div>
    </div>
  `;

  document.getElementById("pmFPeriodPreset")?.addEventListener("change", (ev) => {
    const isCustom = ev.target.value === "custom";
    document.getElementById("pmFPeriodCustomLabel").style.display = isCustom ? "block" : "none";
    if (!isCustom) document.getElementById("pmFPeriodDias").value = Number(ev.target.value);
  });

  const footer = document.getElementById("pmModalFooter");
  if (footer) {
    footer.innerHTML = `
      <button class="btn btn-sm" id="pmFCancelar" type="button">Cancelar</button>
      <button class="btn btnAccent btn-sm" id="pmFSalvar" type="button">${isEdit ? "Salvar alterações" : "Criar plano"}</button>
    `;
  }

  document.getElementById("pmFCancelar")?.addEventListener("click", _pmFecharModal);
  document.getElementById("pmFSalvar")?.addEventListener("click", () => _pmSalvar(plano?.id));

  document.getElementById("pmModal").style.display = "flex";
}

function _pmFecharModal() {
  document.getElementById("pmModal").style.display = "none";
}

async function _pmSalvar(idEdit) {
  const errEl = document.getElementById("pmFErr");
  errEl.textContent = "";

  const preset = document.getElementById("pmFPeriodPreset").value;
  const dias   = preset === "custom" ? Number(document.getElementById("pmFPeriodDias").value) : Number(preset);

  const payload = {
    condominio_id:      Number(document.getElementById("pmFCondo").value) || null,
    titulo:             document.getElementById("pmFTitulo").value.trim(),
    descricao:          document.getElementById("pmFDescricao").value.trim() || null,
    periodicidade_dias: dias,
    proxima_em:         document.getElementById("pmFProxima").value,
  };
  if (idEdit) payload.ativo = document.getElementById("pmFAtivo")?.checked ?? true;

  try {
    const url = idEdit ? `/planos-manutencao/${idEdit}` : "/planos-manutencao";
    const method = idEdit ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) { errEl.textContent = j.error || "Erro ao salvar"; return; }
    _pmFecharModal();
    await carregarPlanos();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function _pmAcao(acao, id) {
  const plano = _pmData.find(p => p.id === id);
  if (acao === "editar") {
    _pmAbrirModal(plano);
    return;
  }
  if (acao === "excluir") {
    if (!confirm(`Desativar o plano "${plano?.titulo}"? Ele não vai mais gerar chamados automáticos.`)) return;
    try {
      const r = await fetch(`/planos-manutencao/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) { alert("Erro ao desativar"); return; }
      await carregarPlanos();
    } catch (e) { alert(e.message); }
    return;
  }
  if (acao === "executar") {
    if (!confirm(`Gerar chamado P4 agora para "${plano?.titulo}"?`)) return;
    try {
      const r = await fetch(`/planos-manutencao/${id}/executar-agora`, { method: "POST", headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) { alert(j.error || "Erro ao executar"); return; }
      if (j.duplicado) alert(`Esse plano já tem o chamado #${j.chamado_id} em andamento.`);
      else             alert(`Chamado #${j.chamado_id} criado.`);
      await carregarPlanos();
    } catch (e) { alert(e.message); }
    return;
  }
}

// ─── Painel de responsáveis por zona ─────────────────────────────────────────

let _pmZonasCache = null; // { zona, tecnico_id, tecnico_nome }[]
let _pmTecnicosCache = null;

async function _pmCarregarTecnicos() {
  if (_pmTecnicosCache) return _pmTecnicosCache;
  try {
    const r = await fetch("/tecnicos", { headers: authHeaders() });
    _pmTecnicosCache = r.ok ? await r.json() : [];
  } catch { _pmTecnicosCache = []; }
  return _pmTecnicosCache;
}

async function _pmCarregarZonas() {
  try {
    const [rz, tecs] = await Promise.all([
      fetch("/planos-manutencao/zonas-responsaveis", { headers: authHeaders() }),
      _pmCarregarTecnicos(),
    ]);
    _pmZonasCache = rz.ok ? await rz.json() : [];
    _pmRenderZonas(tecs);
  } catch (e) {
    console.error("_pmCarregarZonas:", e);
  }
}

function _pmRenderZonas(tecs) {
  const wrap = document.getElementById("pmZonasWrap");
  if (!wrap) return;

  if (!_pmZonasCache || !_pmZonasCache.length) {
    wrap.innerHTML = `<p style="color:var(--muted);font-size:12px;">Nenhuma zona cadastrada. Defina a zona nos condomínios para usar este painel.</p>`;
    return;
  }

  const tecOpts = (tecs || []).map(t =>
    `<option value="${t.id}">${_waEscaparHtml(t.nome)}</option>`
  ).join("");

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
      ${_pmZonasCache.map(z => `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);">${_waEscaparHtml(z.zona)}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <select class="input" style="flex:1;font-size:12px;" data-pm-zona="${_waEscaparHtml(z.zona)}">
              <option value="">— Sem responsável —</option>
              ${tecOpts}
            </select>
            <button class="btn btn-sm btnAccent" data-pm-zona-salvar="${_waEscaparHtml(z.zona)}" style="flex-shrink:0;">Salvar</button>
          </div>
          ${z.tecnico_nome ? `<div style="font-size:11px;color:var(--ok);">Atual: ${_waEscaparHtml(z.tecnico_nome)}</div>` : `<div style="font-size:11px;color:var(--muted2);">Sem responsável definido</div>`}
        </div>
      `).join("")}
    </div>
  `;

  // Pré-seleciona o técnico atual em cada select
  _pmZonasCache.forEach(z => {
    const sel = wrap.querySelector(`select[data-pm-zona="${z.zona}"]`);
    if (sel && z.tecnico_id) sel.value = String(z.tecnico_id);
  });

  // Bind dos botões salvar
  wrap.querySelectorAll("[data-pm-zona-salvar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const zona = btn.dataset.pmZonaSalvar;
      const sel  = wrap.querySelector(`select[data-pm-zona="${zona}"]`);
      const tecnicoId = sel?.value ? Number(sel.value) : null;
      btn.disabled = true;
      try {
        const r = await fetch(
          `/planos-manutencao/zonas-responsaveis/${encodeURIComponent(zona)}`,
          { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ tecnico_id: tecnicoId }) }
        );
        if (!r.ok) { alert("Erro ao salvar"); return; }
        _pmTecnicosCache = null;
        _pmZonasCache = null;
        await _pmCarregarZonas();
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; }
    });
  });
}

function _pmBindEventos() {
  if (_pmBindFeito) return;
  _pmBindFeito = true;

  document.querySelectorAll("[data-pm-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      _pmTabAtiva = btn.dataset.pmTab;
      document.querySelectorAll("[data-pm-tab]").forEach(b => b.classList.toggle("is-active", b === btn));
      _pmRenderTudo();
    });
  });

  document.getElementById("pmBusca")?.addEventListener("input", _pmRenderTudo);
  document.getElementById("pmBtnNovo")?.addEventListener("click", () => _pmAbrirModal(null));

  document.getElementById("pmTableBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pm-action]");
    if (!btn) return;
    _pmAcao(btn.dataset.pmAction, Number(btn.dataset.pmId));
  });

  document.getElementById("pmModalBackdrop")?.addEventListener("click", _pmFecharModal);
  document.getElementById("pmModalClose")?.addEventListener("click", _pmFecharModal);
}

// ============================================================
// BUSCA GLOBAL (topbar)
// ============================================================

(function () {
  const ICONS = {
    condo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    chamado:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
    tecnico:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    alerta:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  let _gsActive = -1;
  let _gsResults = [];
  let _gsDropdown = null;

  function _gsMatch(text, q) {
    return String(text || "").toLowerCase().includes(q);
  }

  function _gsColeta(q) {
    const res = [];
    const MAX = 4;

    // Condomínios
    const condos = (Array.isArray(_condominios) ? _condominios : [])
      .filter(c => _gsMatch(c.nome_fantasia || c.nome, q) || _gsMatch(c.responsavel, q) || _gsMatch(c.cnpj, q))
      .slice(0, MAX);
    for (const c of condos) {
      res.push({ type: "condo", id: c.id, title: c.nome_fantasia || c.nome, sub: c.responsavel || c.cidade || "" });
    }

    // Chamados
    const chamados = (Array.isArray(_chamadosData) ? _chamadosData : [])
      .filter(c => _gsMatch(c.id, q) || _gsMatch(c.titulo, q) || _gsMatch(c.descricao, q))
      .slice(0, MAX);
    for (const c of chamados) {
      res.push({ type: "chamado", id: c.id, title: `#${c.id} — ${c.titulo || "Sem título"}`, sub: c.condo_nome || c.categoria || "" });
    }

    // Colaboradores
    const tecs = (Array.isArray(_tecnicosData) ? _tecnicosData : [])
      .filter(t => _gsMatch(t.nome, q) || _gsMatch(t.especialidade, q))
      .slice(0, MAX);
    for (const t of tecs) {
      res.push({ type: "tecnico", id: t.id, title: t.nome, sub: t.especialidade || t.cargo || "" });
    }

    // Alertas
    const alertas = (Array.isArray(_alertasAbertos) ? _alertasAbertos : [])
      .filter(a => _gsMatch(a.tipo, q) || _gsMatch(a.mensagem, q) || _gsMatch(a.device_id, q))
      .slice(0, MAX);
    for (const a of alertas) {
      res.push({ type: "alerta", key: a.key || a.id, title: a.tipo || "Alerta", sub: a.mensagem || a.device_id || "" });
    }

    return res;
  }

  function _gsRender(q) {
    const wrap = document.querySelector(".topbar-search");
    if (!wrap) return;

    // Remove dropdown anterior
    _gsDropdown = wrap.querySelector(".gs-dropdown");
    if (_gsDropdown) _gsDropdown.remove();

    if (!q) return;

    _gsResults = _gsColeta(q);
    _gsActive = -1;

    _gsDropdown = document.createElement("div");
    _gsDropdown.className = "gs-dropdown";

    if (!_gsResults.length) {
      _gsDropdown.innerHTML = `<div class="gs-empty">Nenhum resultado para "<strong>${_waEscaparHtml(q)}</strong>"</div>`;
      wrap.appendChild(_gsDropdown);
      return;
    }

    const groups = [
      { type: "condo",   label: "Condomínios" },
      { type: "chamado", label: "Chamados"     },
      { type: "tecnico", label: "Colaboradores"},
      { type: "alerta",  label: "Alertas"      },
    ];

    let first = true;
    let idx = 0;
    for (const g of groups) {
      const items = _gsResults.filter(r => r.type === g.type);
      if (!items.length) continue;
      if (!first) _gsDropdown.insertAdjacentHTML("beforeend", `<div class="gs-sep"></div>`);
      first = false;
      _gsDropdown.insertAdjacentHTML("beforeend", `<div class="gs-group-label">${g.label}</div>`);
      for (const item of items) {
        const i = idx++;
        const el = document.createElement("div");
        el.className = "gs-item";
        el.dataset.gsIdx = i;
        el.innerHTML = `
          <div class="gs-item-icon">${ICONS[item.type]}</div>
          <div class="gs-item-body">
            <div class="gs-item-title">${_waEscaparHtml(item.title)}</div>
            ${item.sub ? `<div class="gs-item-sub">${_waEscaparHtml(item.sub)}</div>` : ""}
          </div>`;
        el.addEventListener("mousedown", (e) => { e.preventDefault(); _gsNavegar(item); _gsFechar(); });
        _gsDropdown.appendChild(el);
      }
    }

    wrap.appendChild(_gsDropdown);
  }

  function _gsSetActive(n) {
    if (!_gsDropdown) return;
    const items = _gsDropdown.querySelectorAll(".gs-item");
    items.forEach(el => el.classList.remove("is-active"));
    _gsActive = Math.max(-1, Math.min(n, items.length - 1));
    if (_gsActive >= 0) {
      items[_gsActive].classList.add("is-active");
      items[_gsActive].scrollIntoView({ block: "nearest" });
    }
  }

  function _gsNavegar(item) {
    if (item.type === "condo") {
      showSection("cadastros");
      _cliFiltros.busca = item.title;
      _cliSelecionadoId = item.id;
      renderClientes();
    } else if (item.type === "chamado") {
      showSection("chamados");
      _chSelecionadoId = item.id;
      renderChamados();
      setTimeout(() => document.querySelector(`[data-ch-id="${item.id}"]`)?.scrollIntoView({ block: "nearest" }), 80);
    } else if (item.type === "tecnico") {
      showSection("tecnicos");
      _tecSelecionadoId = item.id;
      renderTecnicos();
      setTimeout(() => document.querySelector(`[data-tec-id="${item.id}"]`)?.scrollIntoView({ block: "nearest" }), 80);
    } else if (item.type === "alerta") {
      showSection("alertas");
      _alSelecionadoKey = item.key;
      renderAlertas();
    }
  }

  function _gsFechar() {
    const input = document.getElementById("topbarSearch");
    if (input) input.value = "";
    if (_gsDropdown) { _gsDropdown.remove(); _gsDropdown = null; }
    _gsResults = [];
    _gsActive = -1;
  }

  function _gsInit() {
    const input = document.getElementById("topbarSearch");
    if (!input) return;

    let _timer;
    input.addEventListener("input", () => {
      clearTimeout(_timer);
      _timer = setTimeout(() => _gsRender(input.value.trim().toLowerCase()), 120);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown")  { e.preventDefault(); _gsSetActive(_gsActive + 1); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); _gsSetActive(_gsActive - 1); }
      else if (e.key === "Enter") {
        if (_gsActive >= 0 && _gsResults[_gsActive]) { _gsNavegar(_gsResults[_gsActive]); _gsFechar(); }
      }
      else if (e.key === "Escape") { _gsFechar(); input.blur(); }
    });

    input.addEventListener("blur", () => setTimeout(_gsFechar, 150));

    // Ctrl+K / Cmd+K abre a busca
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", _gsInit);
})();
