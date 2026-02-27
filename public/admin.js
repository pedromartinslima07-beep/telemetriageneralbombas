function getToken(){ return localStorage.getItem("token"); }
function authHeaders(){
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}
if (!getToken()) window.location.href = "/login";

function logout(){
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function fmtData(iso){
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function badge(text, kind){
  const cls = kind === "ok" ? "b-ok" : (kind === "warn" ? "b-warn" : "b-bad");
  return `<span class="badge ${cls}">${text}</span>`;
}

function tipoBadge(tipo){
  if (tipo === "nivel_muito_baixo") return badge("NÍVEL MUITO BAIXO", "bad");
  if (tipo === "nivel_baixo") return badge("NÍVEL BAIXO", "warn");
  if (tipo === "dispositivo_offline") return badge("OFFLINE", "bad");
  return badge(String(tipo || "").replaceAll("_"," "), "warn");
}

function resumoCard(titulo, valorHtml, kind, cardKey){
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

const filtros = { texto:"", somenteAlertas:false, somenteOffline:false };

let page = 1;
let pageSize = 25;

// ===== filtros =====
function aplicarFiltros(){
  filtros.texto = (document.getElementById("filtroTexto").value || "").trim().toLowerCase();
  filtros.somenteAlertas = !!document.getElementById("filtroSomenteAlertas").checked;
  filtros.somenteOffline = !!document.getElementById("filtroSomenteOffline").checked;
  page = 1;
  renderStatus();
}

function limparFiltros(){
  document.getElementById("filtroTexto").value = "";
  document.getElementById("filtroSomenteAlertas").checked = false;
  document.getElementById("filtroSomenteOffline").checked = false;
  filtros.texto = "";
  filtros.somenteAlertas = false;
  filtros.somenteOffline = false;
  page = 1;
  renderStatus();
}

function mudarPageSize(){
  const v = Number(document.getElementById("pageSize").value);
  pageSize = Number.isFinite(v) ? v : 25;
  page = 1;
  renderStatus();
}

function paginaAnterior(){
  if (page > 1){ page--; renderStatus(); }
}

function proximaPagina(){
  const total = getFilteredList().length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (page < maxPage){ page++; renderStatus(); }
}

function getFilteredList(){
  let list = Array.isArray(_statusData) ? [..._statusData] : [];

  if (filtros.texto){
    const t = filtros.texto;
    list = list.filter(item => {
      const c = item.condominio || {};
      return String(c.nome||"").toLowerCase().includes(t) || String(c.device_id||"").toLowerCase().includes(t);
    });
  }

  if (filtros.somenteAlertas){
    list = list.filter(item => (item.alertas_abertos_count ?? 0) > 0);
  }

  if (filtros.somenteOffline){
    list = list.filter(item => !!item.offline);
  }

  return list;
}

// ===== admin actions =====
async function fecharAlerta(id){
  if (!confirm("Fechar alerta " + id + "?")) return;

  const r = await fetch("/alertas/" + id + "/fechar", {
    method:"PATCH",
    headers: authHeaders(),
  });

  if (!r.ok){
    alert("Erro ao fechar alerta: " + (await r.text()));
    return;
  }

  carregarTudo();
}

async function rodarJobOffline(){
  const r = await fetch("/jobs/verificar-offline", { method:"POST", headers: authHeaders() });
  if (!r.ok){
    alert("Erro no job OFFLINE: " + (await r.text()));
    return;
  }
  const data = await r.json();
  alert("Verificação OFFLINE executada. Criados: " + data.criados + " | Já existia: " + data.ja_existia);
  carregarTudo();
}

async function criarCondominio(){
  const nome = (document.getElementById("novoNome").value || "").trim();
  const device_id = (document.getElementById("novoDevice").value || "").trim();

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

  if (!nome || !device_id){
    if (msg) msg.textContent = "Preencha Nome e Device ID.";
    return;
  }

  const payload = {
    nome,
    device_id,
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
    method:"POST",
    headers: { "Content-Type":"application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(()=> ({}));

  if (!r.ok){
    if (msg) msg.textContent = data.error || ("Erro ao cadastrar (" + r.status + ")");
    return;
  }

 if (msg) msg.textContent =
  `✅ Cadastrado: ${data.nome} (${data.device_id}) • KEY: ${data.device_key || "-"}`;

  // limpa apenas os obrigatórios (e os outros se existirem)
  document.getElementById("novoNome").value = "";
  document.getElementById("novoDevice").value = "";
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

function renderSelectCondominiosCliente(){
  const sel = document.getElementById("cliCondominio");
  if (!sel) return;

  const list = Array.isArray(_condominios) ? _condominios : [];

  // mantém valor selecionado, se existir
  const prev = sel.value;

  sel.innerHTML = `<option value="">Selecione...</option>` +
    list.map(c => {
      const nome = c.nome || "-";
      const dev = c.device_id || "-";
      return `<option value="${c.id}">${nome} • ${dev} (ID ${c.id})</option>`;
    }).join("");

  // tenta restaurar seleção anterior
  if (prev) sel.value = prev;
}

async function criarCliente(){
  const nome = (document.getElementById("cliNome").value || "").trim();
  const email = (document.getElementById("cliEmail").value || "").trim().toLowerCase();
  const senha = (document.getElementById("cliSenha").value || "").trim();
  const condominio_id = Number(document.getElementById("cliCondominio").value);

  const msg = document.getElementById("msgCliente");
  if (msg) msg.textContent = "";

  if (!nome || !email || !senha || !condominio_id){
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

  try{
    if (msg) msg.textContent = "Criando...";

    const r = await fetch("/auth/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok){
      if (msg) msg.textContent = data.error || ("Erro ao criar (" + r.status + ")");
      return;
    }

    if (msg) msg.textContent = `✅ Cliente criado: ${data.nome} (${data.email})`;

    // limpa inputs
    document.getElementById("cliNome").value = "";
    document.getElementById("cliEmail").value = "";
    document.getElementById("cliSenha").value = "";
    document.getElementById("cliCondominio").value = "";

  } catch (e){
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}

// ===== carregamento =====
function montarMapaAlertas(){
  _alertasPorDevice = new Map();
  for (const a of _alertasAbertos){
    const dev = a.device_id;
    if (!_alertasPorDevice.has(dev)) _alertasPorDevice.set(dev, []);
    _alertasPorDevice.get(dev).push(a);
  }
}

function renderResumo(){
  let offline = 0, baixo = 0, muitoBaixo = 0;

  for (const a of _alertasAbertos){
    if (a.tipo === "dispositivo_offline") offline++;
    else if (a.tipo === "nivel_baixo") baixo++;
    else if (a.tipo === "nivel_muito_baixo") muitoBaixo++;
  }

  const totalConds = _statusData.length;
  const condsComAlerta = _statusData.filter(x => (x.alertas_abertos_count ?? 0) > 0).length;
  const condsOk = Math.max(0, totalConds - condsComAlerta);

  const grid = document.getElementById("resumoGrid");
  if (!grid) return;

  grid.innerHTML = [
    resumoCard("OFFLINE", offline, offline > 0 ? "bad" : "ok", "offline"),
    resumoCard("NÍVEL BAIXO", baixo, baixo > 0 ? "warn" : "ok", "nivel_baixo"),
    resumoCard("MUITO BAIXO", muitoBaixo, muitoBaixo > 0 ? "bad" : "ok", "nivel_muito_baixo"),
    resumoCard("COND. COM ALERTA", condsComAlerta, condsComAlerta > 0 ? "warn" : "ok", "com_alerta"),
    resumoCard("COND. OK", condsOk, "ok", "ok"),
  ].join("");
}

  

function renderAlertas(){
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
      <td>${badge(String(a.tipo || "").replaceAll("_"," "), kind)}</td>
      <td>${a.mensagem || ""}</td>
      <td>${fmtData(a.criado_em)}</td>
      <td>${fmtData(a.atualizado_em)}</td>
      <td class="right">
        <button class="btn btnAccent" onclick="fecharAlerta(${a.id})">Fechar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStatus(){
  const list = getFilteredList();

  const total = list.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (page > maxPage) page = maxPage;

  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  const paginaInfo = document.getElementById("paginaInfo");
  if (paginaInfo){
    paginaInfo.textContent = `${page} / ${maxPage} • ${total} condomínios`;
  }

  const tbody = document.getElementById("tbodyStatus");
  tbody.innerHTML = "";

  pageItems.forEach(item => {
    const c = item.condominio || {};
    const u = item.ultima_leitura || null;

    const offline = !!item.offline;
    const min = (item.minutos_sem_atualizar === null || item.minutos_sem_atualizar === undefined)
      ? "-"
      : item.minutos_sem_atualizar;

    const alertasDoDevice = _alertasPorDevice.get(c.device_id) || [];

    let badges = "";
    if (alertasDoDevice.length === 0){
      badges = badge("OK", "ok");
    } else {
      badges = alertasDoDevice.slice(0, 3).map(a => tipoBadge(a.tipo)).join(" ");
      if (alertasDoDevice.length > 3){
        badges += " " + badge("+" + (alertasDoDevice.length - 3), "warn");
      }
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="right">
        <button class="btn" onclick="abrirModalEditar(${Number(c.id) || 0})" ${c.id ? "" : "disabled"}>
          Editar
        </button>
      </td>

      <td>${c.nome || "-"}</td>
      <td class="mono">${c.device_id || "-"}</td>
      <td>${u ? fmtData(u.criado_em) : "-"}</td>
      <td>${u ? (u.nivel ?? "-") : "-"}</td>
      <td>${u ? (u.bomba_ligada ? "Ligada" : "Desligada") : "-"}</td>
      <td>${min}</td>
      <td>${offline ? badge("SIM","bad") : badge("NÃO","ok")}</td>
      <td>
        <span class="pillCount">${item.alertas_abertos_count ?? 0}</span>
        <span style="margin-left:8px; display:inline-flex; gap:6px; flex-wrap:wrap;">${badges}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarStatus(){
  const r = await fetch("/admin/status", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /admin/status: " + r.status);
  _statusData = await r.json();
}

async function carregarAlertas(){
  const r = await fetch("/alertas-abertos", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /alertas-abertos: " + r.status);
  _alertasAbertos = await r.json();
  montarMapaAlertas();
}

async function carregarCondominios(){
  const r = await fetch("/condominios", { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro /condominios: " + r.status);
  _condominios = await r.json();
}

async function carregarTudo(){
  const el = document.getElementById("statusMsg");
  el.textContent = "Carregando...";
  try{
    await Promise.all([carregarStatus(), carregarAlertas(), carregarCondominios()]);
    renderSelectCondominiosCliente();
    renderResumo();
    bindResumoInteracoes();
    renderAlertas();
    renderStatus();
    el.textContent = "Atualizado às " + new Date().toLocaleTimeString();
  } catch(e){
    el.textContent = "Erro ao atualizar";
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const f = document.getElementById("filtroTexto");
  if (f) f.addEventListener("input", () => aplicarFiltros());
});

let _modalKey = null;

function bindResumoInteracoes(){
  document.querySelectorAll(".resumoCardBtn").forEach(btn => {
    btn.addEventListener("mouseenter", (e) => showTip(e.currentTarget));
    btn.addEventListener("mousemove", (e) => moveTip(e));
    btn.addEventListener("mouseleave", () => hideTip());
    btn.addEventListener("click", () => abrirModal(btn.dataset.card));
  });
}

function getListaPorKey(key){
  // Retorna itens no formato: {nome, device_id, detalhe, kind}
  const items = [];

  if (key === "offline"){
    for (const it of _statusData){
      if (!it.offline) continue;
      const c = it.condominio || {};
      items.push({
        nome: c.nome || "-",
        device_id: c.device_id || "-",
        detalhe: `${it.minutos_sem_atualizar ?? "-"} min sem atualizar`,
        kind: "bad"
      });
    }
    return items.sort((a,b)=> (parseInt(b.detalhe)||0) - (parseInt(a.detalhe)||0));
  }

  if (key === "nivel_baixo" || key === "nivel_muito_baixo"){
    const tipo = key;
    for (const a of _alertasAbertos){
      if (a.tipo !== tipo) continue;
      const dev = a.device_id;
      const cond = _statusData.find(s => (s.condominio?.device_id === dev))?.condominio;
      items.push({
        nome: cond?.nome || "-",
        device_id: dev,
        detalhe: a.mensagem || tipo,
        kind: (tipo === "nivel_muito_baixo") ? "bad" : "warn"
      });
    }
    return items;
  }

  if (key === "com_alerta"){
    for (const it of _statusData){
      if ((it.alertas_abertos_count ?? 0) <= 0) continue;
      const c = it.condominio || {};
      const list = _alertasPorDevice.get(c.device_id) || [];
      const tipos = [...new Set(list.map(x=>x.tipo))].join(", ");
      items.push({
        nome: c.nome || "-",
        device_id: c.device_id || "-",
        detalhe: `Alertas: ${list.length} • ${tipos}`,
        kind: "warn"
      });
    }
    return items;
  }

  if (key === "ok"){
    for (const it of _statusData){
      const c = it.condominio || {};
      if ((it.alertas_abertos_count ?? 0) > 0) continue;
      if (it.offline) continue;
      items.push({
        nome: c.nome || "-",
        device_id: c.device_id || "-",
        detalhe: "Sem alertas • Online",
        kind: "ok"
      });
    }
    return items;
  }

  return items;
}

/* ===== Tooltip (hover) ===== */
function showTip(el){
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

  if (list.length === 0){
    html += `<div class="tEmpty">Nada por aqui ✅</div>`;
  } else {
    for (const it of list){
      html += `
        <div class="tItem">
          <div><b>${it.device_id}</b> • ${it.nome}</div>
          <span>${String(it.detalhe).slice(0, 22)}${String(it.detalhe).length>22?"…":""}</span>
        </div>
      `;
    }
    html += `<div class="tEmpty">Clique para ver a lista completa</div>`;
  }

  tip.innerHTML = html;
  tip.style.display = "block";
}

function moveTip(e){
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
function hideTip(){
  const tip = document.getElementById("cardTip");
  tip.style.display = "none";
}

/* ===== Modal (click) ===== */
function abrirModal(key){
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

function fecharModal(){
  document.getElementById("modalOverlay").style.display = "none";
  _modalKey = null;
}

function renderModalLista(){
  const busca = (document.getElementById("modalBusca").value || "").trim().toLowerCase();
  let list = getListaPorKey(_modalKey);

  if (busca){
    list = list.filter(it =>
      String(it.nome||"").toLowerCase().includes(busca) ||
      String(it.device_id||"").toLowerCase().includes(busca) ||
      String(it.detalhe||"").toLowerCase().includes(busca)
    );
  }

  document.getElementById("modalCount").textContent = `${list.length} itens`;

  const tbody = document.getElementById("modalTbody");
  tbody.innerHTML = "";

  for (const it of list){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.nome}</td>
      <td class="mono">${it.device_id}</td>
      <td>${it.detalhe}</td>
      <td class="right">
        <button class="btn" onclick="focarCondominio('${it.device_id}')">Ver no status</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function focarCondominio(deviceId){
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

function abrirModalEditar(id){
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

function fecharModalEditar(){
  const overlay = document.getElementById("editOverlay");
  overlay.style.display = "none";
  document.getElementById("editMsg").textContent = "";
}

function _valOrNull(id){
  const v = (document.getElementById(id).value || "").trim();
  return v === "" ? null : v;
}

async function salvarEdicao(event){
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

  if (!payload.nome || !payload.device_id){
    msg.textContent = "Nome e Device ID são obrigatórios.";
    return;
  }

  try{
    msg.textContent = "Salvando...";

    const r = await fetch("/condominios/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok){
      msg.textContent = data.error || ("Erro ao salvar (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Salvo com sucesso!";
    await carregarTudo();
    setTimeout(fecharModalEditar, 400);

  } catch (e){
    msg.textContent = "Erro: " + e.message;
  }
}

async function regenerarDeviceKey(){
  const id = Number(document.getElementById("editId").value);
  const msg = document.getElementById("editMsg");

  if (!id){
    msg.textContent = "ID inválido.";
    return;
  }

  if (!confirm("Tem certeza que deseja regenerar a Device Key? O ESP antigo vai parar de enviar telemetria.")) {
    return;
  }

  try{
    msg.textContent = "Regenerando device key...";

    const r = await fetch(`/condominios/${id}/regenerar-device-key`, {
      method: "POST",
      headers: authHeaders()
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok){
      msg.textContent = data.error || ("Erro (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Device Key regenerada com sucesso!";
    // se você mostrar a key no modal, aqui dá pra atualizar o campo/label também
    await carregarTudo();

  } catch(e){
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

carregarTudo();
setInterval(carregarTudo, 10000);