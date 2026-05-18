function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}
if (!getToken()) window.location.href = "/login";

// ===== NAVEGAÇÃO POR SEÇÕES =====
const _sectionTitles = {
  dashboard:    "Dashboard",
  telemetria:   "Telemetria",
  mapa:         "Mapa",
  alertas:      "Alertas",
  whatsapp:     "WhatsApp",
  chamados:     "Chamados",
  reservatorios:"Reservatórios",
  bombas:       "Bombas",
  cadastros:    "Clientes",
  tecnicos:     "Técnicos",
  relatorios:   "Relatórios",
  "ia-insights":"IA Insights",
  config:       "Configurações",
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
  if (name === "mapa") {
    // O Leaflet pode não ter sido criado ainda (seção estava display:none e
    // a primeira chamada de renderSecaoMapa fez early-return). Garante que
    // tenta de novo agora que o container está visível e com dimensões.
    setTimeout(() => renderSecaoMapa(), 0);
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

  const sparkId = 'spark_' + cardKey + '_' + Math.random().toString(36).slice(2, 8);

  return `
    <button class="rc ${kindCls}" data-card="${cardKey}">
      <div class="rc-head">
        <div class="rc-icon">${iconSvg}</div>
        <div class="rc-label">${titulo}</div>
      </div>
      <div class="rc-value">${valorHtml}</div>
      <div class="rc-spark" id="${sparkId}"></div>
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

// chamados já vistos — usado para detectar novos e disparar pulso/beep
let _chamadosIdsVistos = new Set();
let _chamadosInicializado = false;

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
  filtros.texto = (document.getElementById("filtroTexto").value || "").trim().toLowerCase();
  filtros.somenteAlertas = !!document.getElementById("filtroSomenteAlertas").checked;
  filtros.somenteOffline = !!document.getElementById("filtroSomenteOffline").checked;
  page = 1;
  renderCondoCards();
}

function limparFiltros() {
  document.getElementById("filtroTexto").value = "";
  document.getElementById("filtroSomenteAlertas").checked = false;
  document.getElementById("filtroSomenteOffline").checked = false;
  filtros.texto = "";
  filtros.somenteAlertas = false;
  filtros.somenteOffline = false;
  page = 1;
  renderCondoCards();
}

function mudarPageSize() {
  const v = Number(document.getElementById("pageSize").value);
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
  const nome = document.getElementById("avNome")?.value?.trim();
  const email = document.getElementById("avEmail")?.value?.trim().toLowerCase();
  const senha = document.getElementById("avSenha")?.value?.trim();
  const msg = document.getElementById("msgAdminViewer");

  if (!nome || !email || !senha) {
    if (msg) msg.textContent = "Preencha todos os campos.";
    return;
  }

  try {
    const r = await fetch("/auth/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ nome, email, senha, role: "admin_viewer" }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (msg) msg.textContent = e.error || "Erro ao criar acesso.";
      return;
    }
    if (msg) msg.textContent = "Acesso de visualizador criado!";
    document.getElementById("avNome").value = "";
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

  // Render sparklines (visual, semi-randomized around current value)
  cards.forEach(c => {
    const sparkEl = grid.querySelector(`.rc[data-card="${c.key}"] .rc-spark`);
    if (!sparkEl) return;
    renderSparkline(sparkEl, c.valor, c.kind);
  });
}

const RC_SPARK_COLORS = { ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', neutral: '#4a78f7' };

function renderSparkline(el, currentValue, kind) {
  if (typeof ApexCharts === 'undefined') return;
  const color = RC_SPARK_COLORS[kind] || RC_SPARK_COLORS.neutral;

  // Synth a 20-point series ending at currentValue
  const base = Number(currentValue) || 0;
  const series = [];
  let v = Math.max(0, base + (Math.random() - .5) * 4);
  for (let i = 0; i < 19; i++) {
    v = Math.max(0, v + (Math.random() - .5) * Math.max(1.5, base * .3));
    series.push(Number(v.toFixed(2)));
  }
  series.push(base);

  el.innerHTML = '';
  try {
    const chart = new ApexCharts(el, {
      chart: { type: 'area', height: 46, sparkline: { enabled: true }, animations: { enabled: true, easing: 'easeinout', speed: 400 } },
      series: [{ data: series }],
      stroke: { curve: 'smooth', width: 2 },
      colors: [color],
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: .45, opacityTo: 0, stops: [0, 95] }
      },
      tooltip: { enabled: false },
    });
    chart.render();
  } catch (e) { /* silent */ }
}

// ===================================================================
// MISSION CONTROL — mapa, alertas críticos, atividade
// ===================================================================

function _mcStatusKind(item) {
  const off = item?.resumo?.offline_count ?? 0;
  const al  = item?.resumo?.alertas_abertos_total ?? 0;
  if (off > 0) return 'bad';
  if (al > 0)  return 'warn';
  return 'ok';
}

// ---- Mapa do dashboard (mini Leaflet) ----
// Singleton: criado uma vez ao primeiro renderMcMap, depois apenas atualiza markers.
let _mcMap = null;
let _mcMarkers = new Map(); // condoId → L.Marker

function _mcPinIcon(kind) {
  return L.divIcon({
    className: "mc-pin-leaflet-wrap",
    html: `<div class="mc-pin-leaflet ${kind}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(_mcMap);
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

  // Prioridade: dispositivo_offline + nivel_muito_baixo no topo
  const sorted = [..._alertasAbertos].sort((a, b) => {
    const w = { dispositivo_offline: 0, nivel_muito_baixo: 1, nivel_baixo: 2 };
    const wa = w[a.tipo] ?? 9;
    const wb = w[b.tipo] ?? 9;
    if (wa !== wb) return wa - wb;
    return new Date(b.criado_em) - new Date(a.criado_em);
  }).slice(0, 6);

  if (!sorted.length) {
    wrap.innerHTML = `<div class="mc-empty">Nenhum alerta crítico no momento ✓</div>`;
    return;
  }

  wrap.innerHTML = sorted.map(a => {
    const kind = (a.tipo === "dispositivo_offline" || a.tipo === "nivel_muito_baixo") ? "bad" : "warn";
    const tipoLabel = String(a.tipo || "").replaceAll("_", " ");
    return `
      <div class="mc-alert-row" data-action="goto-alertas">
        <div class="mc-alert-icon ${kind}">${_mcAlertIconFor(a.tipo)}</div>
        <div class="mc-alert-main">
          <div class="mc-alert-title">${_mcDeviceCondoName(a.device_id)}</div>
          <div class="mc-alert-sub">${tipoLabel} • ${a.mensagem || a.device_id || ""}</div>
        </div>
        <div class="mc-alert-time">${_mcRelTime(a.criado_em)}</div>
      </div>
    `;
  }).join("");
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
    const kind = ch.prioridade === "emergencia" ? "bad"
              : ch.prioridade === "alta"        ? "warn"
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
    const nome = c.cliente_nome || c.telefone || "Cliente";
    const ts = c.ultima_mensagem_em || c.criado_em;
    return `
      <div class="mc-conv-row" data-action="ver-convo-section" data-id="${c.id}">
        <div class="mc-conv-avatar">${_mcInitials(nome)}</div>
        <div class="mc-conv-main">
          <div class="mc-conv-name">${nome}</div>
          <div class="mc-conv-last">${c.condominio_nome || c.telefone || ""}</div>
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

  const chamadosEmergencia = (_chamadosData || []).filter(c => c.prioridade === "emergencia" && c.status !== "fechado").length;

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

  const reservs = _telAplicarFiltros(_telColetarReservatorios())
    .sort((a, b) => (a.condominio_nome || "").localeCompare(b.condominio_nome || "") || (a.nome || "").localeCompare(b.nome || ""));

  if (summary) {
    const on = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true).length;
    const known = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true || r.ultima_leitura?.bomba_ligada === false).length;
    summary.textContent = known > 0 ? `${on} de ${known} ligadas` : `${reservs.length} reservatórios`;
  }

  if (reservs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="mc-empty" style="padding:24px;">Nenhum resultado para os filtros.</td></tr>`;
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
    return `
      <tr>
        <td><strong>${r.nome || "—"}</strong><div style="font-size:10.5px;color:var(--muted2);">${r.tipo || ""}</div></td>
        <td>${r.condominio_nome || "—"}</td>
        <td><span class="tel-bomba-pill ${bombaCls}">${bombaLbl}</span></td>
        <td><span class="tel-bomba-pct ${corPct === "off" ? "" : corPct}">${pct != null ? pct + "%" : "—"}</span></td>
        <td style="color:var(--muted);">${atualizacao}${offlineTag}</td>
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

function renderAlertas() {
  const tbody = document.getElementById("tbodyAlertas");
  tbody.innerHTML = "";

  _alertasAbertos.forEach(a => {
    const kind =
      a.tipo === "nivel_muito_baixo" || a.tipo === "dispositivo_offline" ? "bad"
        : a.tipo === "nivel_baixo" ? "warn"
          : "warn";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.id}</td>
      <td class="mono">${a.device_id}</td>
      <td>${badge(String(a.tipo || "").replaceAll("_", " "), kind)}</td>
      <td>${a.mensagem || ""}</td>
      <td>${fmtData(a.criado_em)}</td>
      <td>${fmtData(a.atualizado_em)}</td>
      <td class="right">
       <button class="btn btnAccent" data-action="fechar-alerta" data-id="${a.id}">Fechar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
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

    // Reservoir bars
    let resHtml = "";
    if (reservs.length === 0) {
      resHtml = `<div style="font-size:11px;color:var(--muted2);padding:4px 0;">Sem reservatórios ativos</div>`;
    } else {
      for (const r of reservs) {
        const u = r.ultima_leitura;
        const pct = u?.nivel_pct ?? null;
        const n = String(u?.nivel || "").toLowerCase();
        const lvClass = n === "alto" ? "lv-alto" : n === "medio" ? "lv-medio" : n === "baixo" ? "lv-baixo" : n === "muito_baixo" ? "lv-muito-baixo" : "lv-unknown";
        const pctWidth = pct != null ? pct : 0;
        const pctDisplay = pct != null ? pct + "%" : "-";
        const bombaClass = u?.bomba_ligada === true ? "on" : u?.bomba_ligada === false ? "off" : "uk";
        const bombaLabel = u?.bomba_ligada === true ? "LIGADA" : u?.bomba_ligada === false ? "DESLIG." : "—";
        resHtml += `
          <div class="cc-res">
            <div class="cc-res-header">
              <span class="cc-res-name">${r.nome || "Reservatório"}</span>
              <span class="cc-res-bomba ${bombaClass}">${bombaLabel}</span>
            </div>
            <div class="cc-level-row">
              <div class="cc-level-bar">
                <div class="cc-level-fill ${lvClass}" style="width:${pctWidth}%"></div>
              </div>
              <span class="cc-level-pct">${pctDisplay}</span>
            </div>
          </div>`;
      }
    }

    const offlineBanner = offlineCount > 0
      ? `<div class="cc-offline-banner">⚠ ${offlineCount} dispositivo${offlineCount > 1 ? "s" : ""} offline</div>`
      : "";

    const adminBtns = _isMaster
      ? `<button class="btn btn-sm" data-action="editar-condominio" data-id="${condoId}" title="Editar condomínio">✎ Editar</button>
         <button class="btn btn-sm" data-action="inativar-condominio" data-id="${condoId}" data-nome="${(c.nome || "").replaceAll('"', "&quot;")}" title="Inativar condomínio">Inativar</button>`
      : "";

    const div = document.createElement("div");
    div.className = `cc ${cardClass}`;
    div.innerHTML = `
      <div class="cc-header">
        <div class="cc-name">${c.nome || "-"}</div>
        <div class="cc-header-badges">${badgesHtml}</div>
      </div>
      ${offlineBanner}
      <div class="cc-res-list">${resHtml}</div>
      <div class="cc-footer">
        <span class="cc-last-seen">${lastSeen}</span>
        <div style="display:flex;gap:6px;">${adminBtns}<button class="btn btn-sm btnAccent" data-action="ver-condo" data-id="${condoId}">Detalhes</button></div>
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

  // atualiza badge da sidebar
  const badge = document.getElementById("navBadgeAlertas");
  if (badge) {
    badge.textContent = _alertasAbertos.length;
    badge.style.display = _alertasAbertos.length > 0 ? "inline-flex" : "none";
  }
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
  renderCondoCards();        // cards têm badges de chamados/wz
  renderMcConversas();
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
    ]);
    detectarChamadosNovos();
    renderAtendimentoVisuais();
    renderVisuaisCombinados();
  } catch (e) {
    console.error("Erro carregarAtendimento:", e);
  }
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
    ]);
    detectarChamadosNovos();
    renderTelemetriaVisuais();
    renderAtendimentoVisuais();
    renderVisuaisCombinados();
    marcarAtualizado();
  } catch (e) {
    if (el) el.textContent = "Erro ao atualizar";
    console.error(e);
  }
}

function atualizarBadgesChamados() {
  const n = _chamadosData.filter(ch => ch.status !== "fechado").length;
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

  if (novos.some(ch => ch.prioridade === "emergencia")) {
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
  const n = _conversasData.filter(cv => cv.status === "aberta").length;
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
function renderChamados() {
  const tbody = document.getElementById("tbodyChamados");
  if (!tbody) return;
  tbody.innerHTML = "";

  const prioLabel  = { baixa: "Baixa", media: "Média", alta: "Alta", emergencia: "Emergência" };
  const statusLbl  = { aberto: "Aberto", em_atendimento: "Em atend.", fechado: "Fechado" };

  if (_chamadosData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Nenhum chamado encontrado.</td></tr>`;
    return;
  }

  for (const ch of _chamadosData) {
    const prioClass = `prio-${ch.prioridade || "media"}`;
    const statusCls = `chamado-status-${ch.status || "aberto"}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ch.id}</td>
      <td>${ch.condominio_nome || "-"}</td>
      <td>${ch.titulo || "-"}</td>
      <td><span class="prio-badge ${prioClass}">${prioLabel[ch.prioridade] || ch.prioridade || "-"}</span></td>
      <td class="${statusCls}">${statusLbl[ch.status] || ch.status || "-"}</td>
      <td>${fmtData(ch.criado_em)}</td>
      <td class="right">
        ${ch.status !== "fechado" ? `<button class="btn btn-sm" data-action="fechar-chamado" data-id="${ch.id}">Fechar</button>` : ""}
        ${ch.status === "aberto" ? `<button class="btn btn-sm" data-action="atender-chamado" data-id="${ch.id}" style="margin-left:4px;">Atender</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  }
}

// ===== SECTION: WHATSAPP =====
function renderConversas() {
  const tbody = document.getElementById("tbodyConversas");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (_conversasData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">Nenhuma conversa encontrada.</td></tr>`;
    return;
  }

  for (const cv of _conversasData) {
    const nome = cv.cliente_nome || cv.telefone || "-";
    const statusBadge = cv.status === "aberta" ? badge("aberta", "warn") : badge("fechada", "ok");
    const preview = cv.ultima_mensagem ? cv.ultima_mensagem.slice(0, 60) + (cv.ultima_mensagem.length > 60 ? "…" : "") : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cv.id}</td>
      <td>${nome}<br><span class="mono" style="font-size:11px;color:var(--muted);">${cv.telefone || ""}</span></td>
      <td>${cv.condominio_nome || "-"}</td>
      <td>${statusBadge}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${preview}</td>
      <td class="right"><button class="btn btn-sm" data-action="ver-convo-section" data-id="${cv.id}">Ver</button></td>`;
    tbody.appendChild(tr);
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

async function atenderChamadoAction(id) {
  const r = await fetch(`/chamados/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ status: "em_atendimento" }),
  });
  if (!r.ok) { alert("Erro ao atualizar chamado"); return; }
  await carregarTudo();
  if (_drawerCondoId) renderDrawerChamados();
}

// ===== DRAWER =====
function abrirDrawer(condoId) {
  _drawerCondoId = condoId;
  _drawerTab = "telemetria";
  _drawerConversaId = null;

  const item = (_statusData || []).find(g => Number(g.condominio?.id) === condoId);
  const nome = item?.condominio?.nome || `Condomínio ${condoId}`;
  document.getElementById("drawerTitle").textContent = nome;

  const chamadosN = _chamadosData.filter(ch => Number(ch.condominio_id) === condoId && ch.status !== "fechado").length;
  const wzN       = _conversasData.filter(cv => Number(cv.condominio_id) === condoId && cv.status === "aberta").length;

  const bCh = document.getElementById("drawerBadgeChamados");
  if (bCh) { bCh.textContent = chamadosN; bCh.classList.toggle("vis", chamadosN > 0); }
  const bWz = document.getElementById("drawerBadgeWhatsapp");
  if (bWz) { bWz.textContent = wzN; bWz.classList.toggle("vis", wzN > 0); }

  document.getElementById("drawerOverlay").classList.add("is-open");
  document.getElementById("drawerPanel").classList.add("is-open");

  switchDrawerTab("telemetria");
}

function fecharDrawer() {
  document.getElementById("drawerOverlay").classList.remove("is-open");
  document.getElementById("drawerPanel").classList.remove("is-open");
  _drawerCondoId = null;
  _drawerConversaId = null;
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

  pane.innerHTML = reservs.map(r => {
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
        ${_isMaster ? `
        <div style="display:flex;gap:6px;padding-top:8px;border-top:1px solid var(--border);">
          <button class="btn btn-sm" data-action="editar-reservatorio" data-id="${r.id}">Editar</button>
          <button class="btn btn-sm" data-action="regen-res-key" data-id="${r.id}">Nova Key</button>
          <button class="btn btn-sm btnDanger" data-action="excluir-reservatorio" data-id="${r.id}" data-nome="${(r.nome || "").replaceAll('"', "&quot;")}">Excluir</button>
        </div>` : ""}
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

  const prioLabel = { baixa: "Baixa", media: "Média", alta: "Alta", emergencia: "Emergência" };
  const statusLbl = { aberto: "Aberto", em_atendimento: "Em atendimento", fechado: "Fechado" };

  pane.innerHTML = list.map(ch => {
    const prioClass = `prio-${ch.prioridade || "media"}`;
    const statusCls = `chamado-status-${ch.status || "aberto"}`;
    return `
      <div class="dp-chamado">
        <div class="dp-chamado-titulo">${ch.titulo || "Chamado #" + ch.id}</div>
        <div class="dp-chamado-meta">
          <span class="prio-badge ${prioClass}">${prioLabel[ch.prioridade] || ch.prioridade}</span>
          <span class="${statusCls}">${statusLbl[ch.status] || ch.status}</span>
          <span style="color:var(--muted2);">#${ch.id} • ${fmtData(ch.criado_em)}</span>
        </div>
        ${ch.descricao ? `<div style="font-size:12px;color:var(--muted);line-height:1.5;">${ch.descricao.slice(0, 200)}${ch.descricao.length > 200 ? "…" : ""}</div>` : ""}
        ${ch.status !== "fechado" ? `
        <div class="dp-chamado-actions">
          ${ch.status === "aberto" ? `<button class="btn btn-sm" data-action="atender-chamado" data-id="${ch.id}">Em atendimento</button>` : ""}
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

function getMyRole() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1])).role;
  } catch { return null; }
}
const _myRole = getMyRole();
const _isMaster = _myRole === "admin";

document.addEventListener("DOMContentLoaded", () => {
  const f = document.getElementById("filtroTexto");
  if (f) f.addEventListener("input", () => aplicarFiltros());
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
        kind: "bad"
      });
    }
  }

  return items.sort((a, b) => (parseInt(b.detalhe) || 0) - (parseInt(a.detalhe) || 0));
}

    if (key === "com_alerta") {
      if ((resumo.alertas_abertos_total ?? 0) <= 0) continue;
      items.push({
        nome: c.nome || "-",
        device_id: `Reservatórios: ${resumo.total_reservatorios ?? 0}`,
        detalhe: `Alertas abertos: ${resumo.alertas_abertos_total ?? 0}`,
        kind: "warn",
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
        device_id: `Reservatórios: ${resumo.total_reservatorios ?? 0}`,
        detalhe: "Sem alertas • Online",
        kind: "ok",
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

  for (const it of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.nome}</td>
      <td class="mono">${it.device_id}</td>
      <td>${it.detalhe}</td>
      <td class="right">
       <button class="btn" data-action="focar-condominio" data-device="${String(it.device_id).replaceAll('"', "&quot;")}">
  Ver no status
</button>
    `;
    tbody.appendChild(tr);
  }
}

function focarCondominio(deviceId) {
  document.getElementById("filtroTexto").value = deviceId;
  document.getElementById("filtroSomenteAlertas").checked = false;
  document.getElementById("filtroSomenteOffline").checked = false;
  aplicarFiltros();
  fecharModal();
  const grid = document.getElementById("condoGrid");
  if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
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

      document.getElementById("editEndereco").value = c.endereco || "";
      document.getElementById("editBairro").value = c.bairro || "";
      document.getElementById("editCidade").value = c.cidade || "";
      document.getElementById("editUf").value = c.uf || "";

      document.getElementById("editResponsavel").value = c.responsavel || "";
      document.getElementById("editTelefone").value = c.telefone || "";
      document.getElementById("editObs").value = c.observacoes || "";

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
      sub.textContent = `${c.nome || "Condomínio"} • ID: ${c.id}`;
    })
    .catch((e) => {
      msg.textContent = "Erro: " + e.message;
    });
}

function fecharModalEditar() {
  const overlay = document.getElementById("editOverlay");
  overlay.style.display = "none";
  document.getElementById("editMsg").textContent = "";
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
    endereco: _valOrNull("editEndereco"),
    bairro: _valOrNull("editBairro"),
    cidade: _valOrNull("editCidade"),
    uf: _valOrNull("editUf"),
    cep: cepRaw === "" ? null : cepRaw,
    responsavel: _valOrNull("editResponsavel"),
    telefone: _valOrNull("editTelefone"),
    observacoes: _valOrNull("editObs"),
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
  });

  const tileLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap · © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(map);

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

  const ref = { map, marker, tileLayer };
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
  // Leaflet precisa recalcular tamanho quando o container fica visível
  const ref = _miniMapas.get(prefixo);
  if (ref) setTimeout(() => ref.map.invalidateSize(), 50);
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
let _mpStatusChart = null;
let _mpZonaChart   = null;
// Praça da Sé como referência para os quadrantes
const _MP_SE = { lat: -23.5505, lng: -46.6333 };

function _mpZonaPara(c) {
  // Centro: <= 3km da Sé. Senão, classifica pelos quadrantes N/S/L/O.
  if (c.lat == null || c.lng == null) return "Sem coordenada";
  const dLat = c.lat - _MP_SE.lat;
  const dLng = c.lng - _MP_SE.lng;
  // distância aproximada (graus → km, latitude ~111km/°)
  const distKm = Math.sqrt((dLat * 111) ** 2 + (dLng * 102) ** 2);
  if (distKm <= 3) return "Centro";
  // Quadrante por dominância (Norte/Sul vs Leste/Oeste)
  if (Math.abs(dLat) >= Math.abs(dLng)) {
    return dLat < 0 ? "Zona Sul" : "Zona Norte";
  }
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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(_mpMap);
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
  const deviceIds = new Set((g.reservatorios || []).map(r => r.device_id));
  const lista = (_alertasAbertos || []).filter(a => deviceIds.has(a.device_id));
  if (lista.length === 0) return `<div class="mp-empty">Nenhum alerta aberto neste condomínio.</div>`;
  return `<div class="mp-list">${lista.map(a => {
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
}

function _mpRenderChamados(g) {
  const condoId = g.condominio?.id;
  const lista = (Array.isArray(_chamadosData) ? _chamadosData : []).filter(ch => ch.condominio_id === condoId);
  if (lista.length === 0) return `<div class="mp-empty">Nenhum chamado para este condomínio.</div>`;
  return `<div class="mp-list">${lista.slice(0, 20).map(ch => {
    const kind = ch.prioridade === "emergencia" ? "bad" : ch.prioridade === "alta" ? "warn" : "ok";
    const statusLabel = (ch.status || "").replaceAll("_", " ");
    return `
      <div class="mp-list-item">
        <span class="mli-dot ${kind}"></span>
        <div class="mli-main">
          <div class="mli-title">${ch.titulo || "Chamado #" + ch.id}</div>
          <div class="mli-sub">${statusLabel} • ${ch.prioridade || "media"} ${ch.categoria ? "• " + ch.categoria : ""}</div>
        </div>
        <span class="mli-right">${_mpRelTime(ch.criado_em)}</span>
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

function _mpAtualizarStatusDonut() {
  const groups = Array.isArray(_statusData) ? _statusData : [];
  let ok = 0, warn = 0, bad = 0, off = 0;
  for (const g of groups) {
    const totR = g.resumo?.total_reservatorios ?? 0;
    const offCnt = g.resumo?.offline_count ?? 0;
    const al = g.resumo?.alertas_abertos_total ?? 0;
    if (totR > 0 && offCnt === totR) off++;
    else if (offCnt > 0)             bad++;
    else if (al > 0)                 warn++;
    else                             ok++;
  }
  _mpRenderDonut("mpStatusChart", "mpStatusLegend", [
    { label: "OK",       value: ok,   color: "#10b981" },
    { label: "Alerta",   value: warn, color: "#f59e0b" },
    { label: "Crítico",  value: bad,  color: "#ef4444" },
    { label: "Offline",  value: off,  color: "#64748b" },
  ]);
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
      sub: `${ch.prioridade || "media"} • ${(ch.status || "").replaceAll("_", " ")}`,
      kind: ch.prioridade === "emergencia" ? "bad" : ch.prioridade === "alta" ? "warn" : "ok",
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
  _mpAtualizarStatusDonut();
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

document.addEventListener("DOMContentLoaded", () => {
  // ===== BOTÕES FIXOS =====
  // nav sections
  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    item.addEventListener("click", () => showSection(item.dataset.section));
  });

  document.getElementById("btnAtualizar")?.addEventListener("click", carregarTudo);
  document.getElementById("btnOffline")?.addEventListener("click", rodarJobOffline);
  document.getElementById("btnSair")?.addEventListener("click", logout);

  // "Ver todos →" e atalhos do dashboard mission-control
  document.body.addEventListener("click", (e) => {
    const go = e.target.closest("[data-section-go]");
    if (go) {
      showSection(go.dataset.sectionGo);
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

  // Mini-mapa do cadastro: inicializa quando a seção Cadastros é exibida
  // (precisa do container estar visível para o Leaflet medir corretamente)
  const _initMiniMapaCadastro = () => {
    if (!document.getElementById("novoMiniMapa")) return;
    criarOuObterMiniMapa("novo");
    _miniMapaInvalidar("novo");
  };
  // Tenta na primeira renderização e ao trocar para a seção
  setTimeout(_initMiniMapaCadastro, 200);
  document.querySelectorAll('.nav-item[data-section="cadastros"]').forEach(item => {
    item.addEventListener("click", () => setTimeout(_initMiniMapaCadastro, 100));
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

  // Esconde seção Cadastros para admin_viewer
  if (!_isMaster) {
    document.querySelectorAll('[data-section="cadastros"]').forEach(el => el.style.display = "none");
  }
  // Mostra card de criar admin_viewer apenas para master admin
  if (_isMaster) {
    const cardAV = document.getElementById("cardCriarAdminViewer");
    if (cardAV) cardAV.style.display = "";
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

  document.getElementById("btnCadastrarCondominio")?.addEventListener("click", criarCondominio);
  document.getElementById("btnCriarCliente")?.addEventListener("click", criarCliente);
  document.getElementById("btnCriarAdminViewer")?.addEventListener("click", criarAdminViewer);

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

    if (action === "drawer-tab") {
      switchDrawerTab(btn.dataset.tab);
      return;
    }

    if (action === "fechar-chamado") {
      const id = Number(btn.dataset.id);
      if (id) fecharChamadoAction(id);
      return;
    }

    if (action === "atender-chamado") {
      const id = Number(btn.dataset.id);
      if (id) atenderChamadoAction(id);
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

    if (action === "focar-condominio") {
      const device = btn.dataset.device;
      if (device) focarCondominio(device);
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
});