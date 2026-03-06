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

function tankHtml(nivel) {
  const n = String(nivel || "").toLowerCase();
  const map = {
    alto:        { pct: 100, cls: "tank-alto",        label: "100%" },
    medio:       { pct: 65,  cls: "tank-medio",       label: "65%"  },
    baixo:       { pct: 30,  cls: "tank-baixo",       label: "30%"  },
    muito_baixo: { pct: 10,  cls: "tank-muito-baixo", label: "10%"  },
  };
  const cfg = map[n];
  if (!cfg) return `<span style="color:var(--muted)">-</span>`;
  return `
    <div class="tank-wrap">
      <div class="tank">
        <div class="tank-fill ${cfg.cls}" style="height:${cfg.pct}%"></div>
      </div>
      <span class="tank-pct">${cfg.label}</span>
    </div>`;
}

function resumoCard(titulo, valorHtml, kind, cardKey) {
  const border =
    kind === "bad" ? "rgba(255,90,95,.55)" :
      kind === "warn" ? "rgba(240,176,20,.55)" :
        kind === "ok" ? "rgba(45,212,191,.45)" :
          "rgba(43,43,71,.7)";

  return `
    <button
      class="resumoCardBtn"
      data-card="${cardKey}"
      style="
        text-align:left;
        cursor:pointer;
        border:1px solid ${border};
        background:rgba(255,255,255,.03);
        border-radius:14px;
        padding:12px 12px;
        color:inherit;
      "
    >
      <div style="color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .3px;">
        ${titulo}
      </div>

      <div style="margin-top:8px; font-weight:900; font-size:22px;">
        ${valorHtml}
      </div>

      <div style="margin-top:6px; font-size:12px; color: var(--muted);">
        Passe o mouse • Clique para detalhes
      </div>
    </button>
  `;
}

// ===== estado =====
let _statusData = [];
let _alertasAbertos = [];
let _alertasPorDevice = new Map();
let _condominios = [];

const filtros = { texto: "", somenteAlertas: false, somenteOffline: false };

let page = 1;
let pageSize = 25;

// ===== filtros =====
function aplicarFiltros() {
  filtros.texto = (document.getElementById("filtroTexto").value || "").trim().toLowerCase();
  filtros.somenteAlertas = !!document.getElementById("filtroSomenteAlertas").checked;
  filtros.somenteOffline = !!document.getElementById("filtroSomenteOffline").checked;
  page = 1;
  renderStatus();
}

function limparFiltros() {
  document.getElementById("filtroTexto").value = "";
  document.getElementById("filtroSomenteAlertas").checked = false;
  document.getElementById("filtroSomenteOffline").checked = false;
  filtros.texto = "";
  filtros.somenteAlertas = false;
  filtros.somenteOffline = false;
  page = 1;
  renderStatus();
}

function mudarPageSize() {
  const v = Number(document.getElementById("pageSize").value);
  pageSize = Number.isFinite(v) ? v : 25;
  page = 1;
  renderStatus();
}

function paginaAnterior() {
  if (page > 1) { page--; renderStatus(); }
}

function proximaPagina() {
  const total = getFilteredList().length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (page < maxPage) { page++; renderStatus(); }
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

  } catch (e) {
    if (msg) msg.textContent = "Erro: " + e.message;
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

let _expandedCondo = new Set(); // guarda quais condomínios estão “abertos”

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

function toggleCondo(id) {
  if (_expandedCondo.has(id)) _expandedCondo.delete(id);
  else _expandedCondo.add(id);
  renderStatus();
}

function renderStatus() {
  const tbody = document.getElementById("tbodyStatus");
  if (!tbody) return;
  tbody.innerHTML = "";

  const list = Array.isArray(_statusData) ? _statusData : [];


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

    const totalRes = resumo.total_reservatorios ?? 0;
    const offlineCount = resumo.offline_count ?? 0;
    const alertasTotal = resumo.alertas_abertos_total ?? 0;

    const ultima = getUltimaLeituraDoCondominio(item);
    const ultimaTxt = ultima?.criado_em ? fmtData(ultima.criado_em) : "-";

    const expanded = _expandedCondo.has(condoId);

    // ===== LINHA DO CONDOMÍNIO (RESUMO) =====
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td class="right">
        <button class="btn" data-action="toggle-condo" data-id="${condoId}">
          ${expanded ? "Fechar" : "Ver reservatórios"}
        </button>
      </td>

      <td>${c.nome || "-"}</td>
      <td>${totalRes}</td>
      <td>${offlineCount > 0 ? badge(`${offlineCount} SIM`, "bad") : badge("NÃO", "ok")}</td>
      <td>
        <span class="pillCount">${alertasTotal}</span>
      </td>
      <td>${ultimaTxt}</td>
    `;
    tbody.appendChild(tr);

    // ===== DETALHES (LINHAS DOS RESERVATÓRIOS) =====
    if (expanded) {
      const reservatorios = item.reservatorios || [];

      // cabeçalho dos detalhes (uma linha “subtítulo”)
      const trHead = document.createElement("tr");
      trHead.innerHTML = `
        <td></td>
        <td colspan="5" class="expand-cell">
          <div class="expand-label">Reservatórios</div>
          <div class="inner-table-wrap">
            <table class="inner-table">
              <thead>
                <tr>
                  <th>Reservatório</th>
                  <th>Tipo</th>
                  <th>Device</th>
                  <th>Última leitura</th>
                  <th>Nível</th>
                  <th>Bomba</th>
                  <th>Min s/ atualizar</th>
                  <th>Offline</th>
                  <th>Alertas</th>
                </tr>
              </thead>
              <tbody>
                ${reservatorios.map(r => {
        const u = r.ultima_leitura;
        const offline = !!r.offline;
        const min = (r.minutos_sem_atualizar === null || r.minutos_sem_atualizar === undefined)
          ? "-"
          : r.minutos_sem_atualizar;

        const alertas = r.alertas_abertos_count ?? 0;

        return `
                    <tr>
                      <td>${r.nome || "-"}</td>
                      <td>${r.tipo || "-"}</td>
                      <td class="mono">${r.device_id || "-"}</td>
                      <td>${u?.criado_em ? fmtData(u.criado_em) : "-"}</td>
                      <td>${u?.nivel ? tankHtml(u.nivel) : "-"}</td>
                      <td>${u ? (u.bomba_ligada ? badge("LIGADA","warn") : badge("DESLIGADA","ok")) : "-"}</td>
                      <td>${min}</td>
                      <td>${offline ? badge("SIM", "bad") : badge("NÃO", "ok")}</td>
                      <td>
                        <span class="pillCount">${alertas}</span>
                        <button class="btn btn-sm" style="margin-left:8px;" data-action="regen-res-key" data-id="${r.id}">
                          Regenerar Key
                        </button>
                      </td>
                    </tr>
                  `;
      }).join("")}
              </tbody>
            </table>
          </div>
        </td>
      `;
      tbody.appendChild(trHead);
    }
  }
}

async function carregarStatus() {
  const r = await fetch("/admin/status", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /admin/status: " + r.status);

  const grouped = await r.json(); // vem AGRUPADO do backend (admin.routes)

  // ✅ mantém AGRUPADO, porque o renderStatus usa item.reservatorios + item.resumo
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
    await Promise.all([carregarStatus(), carregarAlertas(), carregarCondominios()]);
    renderSelectCondominiosCliente();
    renderSelectCondominiosReservatorio();
    renderResumo();
    bindResumoInteracoes();
    renderAlertas();
    renderStatus();
    el.textContent = "Atualizado às " + new Date().toLocaleTimeString();
  } catch (e) {
    el.textContent = "Erro ao atualizar";
    console.error(e);
  }
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

  const payload = { condominio_id, nome, tipo, device_id };

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

  // opcional: atualizar tudo
  carregarTudo();
}

document.addEventListener("DOMContentLoaded", () => {
  const f = document.getElementById("filtroTexto");
  if (f) f.addEventListener("input", () => aplicarFiltros());
});

let _modalKey = null;

function bindResumoInteracoes() {
  document.querySelectorAll(".resumoCardBtn").forEach(btn => {
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
  // aplica filtro e desce até a tabela de status
  document.getElementById("filtroTexto").value = deviceId;
  document.getElementById("filtroSomenteAlertas").checked = false;
  document.getElementById("filtroSomenteOffline").checked = false;
  aplicarFiltros();

  fecharModal();

  // rola para a tabela de status
  const tabela = document.getElementById("tbodyStatus");
  if (tabela) tabela.scrollIntoView({ behavior: "smooth", block: "start" });
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
      document.getElementById("editDevice").value = c.device_id || "";

      document.getElementById("editEndereco").value = c.endereco || "";
      document.getElementById("editBairro").value = c.bairro || "";
      document.getElementById("editCidade").value = c.cidade || "";
      document.getElementById("editUf").value = c.uf || "";

      document.getElementById("editResponsavel").value = c.responsavel || "";
      document.getElementById("editTelefone").value = c.telefone || "";
      document.getElementById("editObs").value = c.observacoes || "";

      document.getElementById("editAtivo").checked = (c.ativo !== false);

      msg.textContent = "";
      sub.textContent = `${c.nome || "Condomínio"} • ${c.device_id || ""} • ID: ${c.id}`;
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
    device_id: (document.getElementById("editDevice").value || "").trim(),
    endereco: _valOrNull("editEndereco"),
    bairro: _valOrNull("editBairro"),
    cidade: _valOrNull("editCidade"),
    uf: _valOrNull("editUf"),
    responsavel: _valOrNull("editResponsavel"),
    telefone: _valOrNull("editTelefone"),
    observacoes: _valOrNull("editObs"),
    ativo: document.getElementById("editAtivo").checked
  };

  if (!payload.nome || !payload.device_id) {
    msg.textContent = "Nome e Device ID são obrigatórios.";
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

  alert("✅ Nova Device Key:\n\n" + (data.reservatorio?.device_key || "-"));

  carregarTudo(); // atualiza painel
}

async function regenerarDeviceKey() {
  const id = Number(document.getElementById("editId").value);
  const msg = document.getElementById("editMsg");

  if (!id) {
    msg.textContent = "ID inválido.";
    return;
  }

  if (!confirm("Tem certeza que deseja regenerar a Device Key? O ESP antigo vai parar de enviar telemetria.")) {
    return;
  }

  try {
    msg.textContent = "Regenerando device key...";

    const r = await fetch(`/condominios/${id}/regenerar-device-key`, {
      method: "POST",
      headers: authHeaders()
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      msg.textContent = data.error || ("Erro (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Device Key regenerada com sucesso!";
    // se você mostrar a key no modal, aqui dá pra atualizar o campo/label também
    await carregarTudo();

  } catch (e) {
    msg.textContent = "Erro: " + e.message;
  }
}



// Fechar modal editar clicando fora
document.addEventListener("click", (e) => {
  const ov = document.getElementById("editOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModalEditar();
});

// ESC fecha modal editar
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalEditar();
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
  const _sidebar = document.querySelector(".sidebar");
  const _btnToggle = document.getElementById("btnSidebarToggle");

  function _applySidebar(collapsed) {
    _sidebar.classList.toggle("collapsed", collapsed);
  }

  // Fechada por padrão; abre se o usuário havia deixado aberta
  _applySidebar(localStorage.getItem("sidebarCollapsed") !== "false");

  _btnToggle?.addEventListener("click", () => {
    const next = !_sidebar.classList.contains("collapsed");
    _applySidebar(next);
    localStorage.setItem("sidebarCollapsed", next);
  });

  document.getElementById("btnAplicarFiltros")?.addEventListener("click", aplicarFiltros);
  document.getElementById("btnLimparFiltros")?.addEventListener("click", limparFiltros);
  document.getElementById("btnPaginaAnterior")?.addEventListener("click", paginaAnterior);
  document.getElementById("btnProximaPagina")?.addEventListener("click", proximaPagina);

  document.getElementById("pageSize")?.addEventListener("change", mudarPageSize);

  document.getElementById("btnCadastrarCondominio")?.addEventListener("click", criarCondominio);
  document.getElementById("btnCriarCliente")?.addEventListener("click", criarCliente);

  document.getElementById("btnFecharModal")?.addEventListener("click", fecharModal);
  document.getElementById("btnFecharModalEditar")?.addEventListener("click", fecharModalEditar);
  document.getElementById("btnCancelarEdicao")?.addEventListener("click", fecharModalEditar);
  document.getElementById("btnRegenerarDeviceKey")?.addEventListener("click", regenerarDeviceKey);

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

    if (action === "toggle-condo") {
      const id = Number(btn.dataset.id);
      if (id) toggleCondo(id);
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
    if (e.key === "Escape") fecharModalEditar();
  });

 
  // primeira carga + auto refresh
  carregarTudo();
  setInterval(carregarTudo, 10000);
});