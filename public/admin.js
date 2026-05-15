function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}
if (!getToken()) window.location.href = "/login";

// ===== NAVEGAÇÃO POR SEÇÕES =====
const _sectionTitles = {
  dashboard: "Dashboard",
  alertas:   "Alertas Abertos",
  cadastros: "Cadastros",
  chamados:  "Chamados",
  whatsapp:  "WhatsApp",
};

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("is-active"));
  document.querySelector(`.section[data-section="${name}"]`)?.classList.add("is-active");
  document.querySelectorAll(".nav-item[data-section]").forEach(n => n.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add("active");
  const t = document.getElementById("topbarTitle");
  if (t) t.textContent = _sectionTitles[name] || name;
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

function resumoCard(titulo, valorHtml, kind, cardKey) {
  const kindCls =
    kind === "bad"  ? "rc-bad"  :
    kind === "warn" ? "rc-warn" :
    kind === "ok"   ? "rc-ok"   : "rc-neutral";

  return `
    <button class="rc ${kindCls}" data-card="${cardKey}">
      <div class="rc-label">${titulo}</div>
      <div class="rc-value">${valorHtml}</div>
      <div class="rc-hint">Passe o mouse • Clique para detalhes</div>
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

  const payload = {
    nome,
    endereco: endereco || null,
    bairro: bairro || null,
    cidade: cidade || null,
    uf: uf || null,
    responsavel: responsavel || null,
    telefone: telefone || null,
    observacoes: observacoes || null,
    ativo
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

  grid.innerHTML = [
    // ✅ agora o card OFFLINE mostra a soma real de reservatórios offline
    resumoCard("OFFLINE", offlineTotal, offlineTotal > 0 ? "bad" : "ok", "offline"),
    resumoCard("NÍVEL BAIXO", baixo, baixo > 0 ? "warn" : "ok", "nivel_baixo"),
    resumoCard("MUITO BAIXO", muitoBaixo, muitoBaixo > 0 ? "bad" : "ok", "nivel_muito_baixo"),
    resumoCard("COND. COM ALERTA", condsComAlerta, condsComAlerta > 0 ? "warn" : "ok", "com_alerta"),
    resumoCard("COND. OK", condsOk, "ok", "ok"),
  ].join("");
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

async function carregarTudo() {
  const el = document.getElementById("statusMsg");
  el.textContent = "Carregando...";
  try {
    await Promise.all([
      carregarStatus(),
      carregarAlertas(),
      carregarCondominios(),
      carregarChamados().catch(() => {}),
      carregarConversas().catch(() => {}),
    ]);
    renderSelectCondominiosCliente();
    renderSelectCondominiosReservatorio();
    renderResumo();
    bindResumoInteracoes();
    renderAlertas();
    renderCondoCards();
    renderChamados();
    renderConversas();
    atualizarBadgesChamados();
    atualizarBadgesWhatsapp();
    el.textContent = "Atualizado às " + new Date().toLocaleTimeString();
  } catch (e) {
    el.textContent = "Erro ao atualizar";
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

function renderDrawerTelemetria() {
  const pane = document.getElementById("drawerPaneTelemetria");
  if (!pane) return;

  const item = (_statusData || []).find(g => Number(g.condominio?.id) === _drawerCondoId);
  if (!item) { pane.innerHTML = `<div style="color:var(--muted);">Dados não encontrados.</div>`; return; }

  const reservs = Array.isArray(item.reservatorios) ? item.reservatorios : [];

  if (reservs.length === 0) {
    pane.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhum reservatório ativo neste condomínio.</div>`;
    return;
  }

  pane.innerHTML = reservs.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct ?? null;
    const n = String(u?.nivel || "").toLowerCase();
    const lvClass = n === "alto" ? "lv-alto" : n === "medio" ? "lv-medio" : n === "baixo" ? "lv-baixo" : n === "muito_baixo" ? "lv-muito-baixo" : "";
    const pctWidth = pct != null ? pct : 0;
    const offline = !!r.offline;
    const mins = r.minutos_sem_atualizar;
    const alertas = r.alertas_abertos_count ?? 0;
    const bombaLabel = u?.bomba_ligada === true ? badge("LIGADA", "warn") : u?.bomba_ligada === false ? badge("DESLIGADA", "ok") : "-";
    const offlineBadge = offline ? badge("OFFLINE", "bad") : badge("Online", "ok");

    return `
      <div class="dp-res">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div class="dp-res-name">${r.nome || "Reservatório"}</div>
          ${offlineBadge}
        </div>
        ${lvClass ? `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:700;color:var(--muted);">Nível</span>
            <span style="font-size:14px;font-weight:800;color:var(--text);">${pct != null ? pct + "%" : "-"}</span>
          </div>
          <div class="dp-level-bar"><div class="dp-level-fill ${lvClass}" style="width:${pctWidth}%"></div></div>
        </div>` : `<div style="color:var(--muted);font-size:12px;">Sem dados de nível</div>`}
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
  const payload = {
    nome: (document.getElementById("editNome").value || "").trim(),
    endereco: _valOrNull("editEndereco"),
    bairro: _valOrNull("editBairro"),
    cidade: _valOrNull("editCidade"),
    uf: _valOrNull("editUf"),
    responsavel: _valOrNull("editResponsavel"),
    telefone: _valOrNull("editTelefone"),
    observacoes: _valOrNull("editObs"),
    ativo: document.getElementById("editAtivo").checked
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



document.addEventListener("DOMContentLoaded", () => {
  // ===== BOTÕES FIXOS =====
  // nav sections
  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    item.addEventListener("click", () => showSection(item.dataset.section));
  });

  document.getElementById("btnAtualizar")?.addEventListener("click", carregarTudo);
  document.getElementById("btnOffline")?.addEventListener("click", rodarJobOffline);
  document.getElementById("btnSair")?.addEventListener("click", logout);

  // ===== SIDEBAR TOGGLE =====
  const _sidebar = document.getElementById("sidebar");

  function _applySidebar(collapsed) {
    _sidebar.classList.toggle("collapsed", collapsed);
  }

  // Começa fechada por padrão; abre se o usuário havia deixado aberta
  _applySidebar(localStorage.getItem("sidebarCollapsed") !== "false");

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

  // primeira carga + auto refresh
  carregarTudo();
  setInterval(carregarTudo, 10000);
});