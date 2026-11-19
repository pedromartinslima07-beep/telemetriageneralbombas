// public/admin-agenda.js — Agenda da empresa (fase A, 18/11/2026)
//
// Um calendário só com tudo o que a empresa tem a fazer: compromissos
// lançados à mão (reunião, visita, pagamento...), retornos pedidos nas O.S.,
// contratos terminando, preventivas do mês e o faturamento dos contratos no
// Omie. Os dados vêm de GET /agenda (src/routes/agenda.routes.js); quem
// decide o que cada perfil vê é a rota, não esta tela.
//
// Roda DEPOIS do admin.js e usa os globais dele (authHeaders, _waEscaparHtml,
// _condominios, abrirOSDetalhe, abrirFichaCondominio, showSection), no mesmo
// molde do admin-condominio.js.
//
// ⚠️ DATAS EM SÃO PAULO. O painel roda no navegador de quem está no
// escritório, então "dia" aqui é o dia do relógio local. A rota faz a mesma
// conta no servidor, que é UTC, fixando -03:00.

const _AG_TIPOS = {
  reuniao:     { rot: "Reunião",            cls: "ag-t-reuniao" },
  visita:      { rot: "Visita",             cls: "ag-t-visita" },
  pagamento:   { rot: "Pagamento",          cls: "ag-t-financeiro" },
  financeiro:  { rot: "Financeiro",         cls: "ag-t-financeiro" },
  outro:       { rot: "Outro",              cls: "ag-t-outro" },
  retorno:     { rot: "Retorno de O.S.",    cls: "ag-t-retorno" },
  contrato:    { rot: "Contrato",           cls: "ag-t-contrato" },
  preventiva:  { rot: "Preventivas",        cls: "ag-t-preventiva" },
  faturamento: { rot: "Faturamento Omie",   cls: "ag-t-financeiro" },
};
const _AG_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const _AG_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

let _agVista = (window.innerWidth < 760) ? "lista" : "semana";
let _agRef = new Date();          // um dia dentro do período mostrado
let _agItens = [];
let _agCarregando = false;
let _agEquipe = null;             // usuários internos (responsável)
let _agBind = false;

const _agEsc = s => _waEscaparHtml(s == null ? "" : String(s));
const _agIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _agDia = iso => { const d = new Date(iso); return _agIso(d); };
const _agHora = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const _agSomaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const _agInicioSemana = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = (x.getDay() + 6) % 7; return _agSomaDias(x, -dow); };

function _agPeriodo() {
  if (_agVista === "semana") {
    const ini = _agInicioSemana(_agRef);
    return { ini, fim: _agSomaDias(ini, 6) };
  }
  if (_agVista === "mes") {
    const primeiro = new Date(_agRef.getFullYear(), _agRef.getMonth(), 1);
    const ini = _agInicioSemana(primeiro);
    return { ini, fim: _agSomaDias(ini, 41) };
  }
  const ini = new Date(_agRef.getFullYear(), _agRef.getMonth(), _agRef.getDate());
  return { ini, fim: _agSomaDias(ini, 29) };
}

function _agTituloPeriodo() {
  const { ini, fim } = _agPeriodo();
  if (_agVista === "mes") return `${_AG_MESES[_agRef.getMonth()]} de ${_agRef.getFullYear()}`;
  const mIni = _AG_MESES[ini.getMonth()], mFim = _AG_MESES[fim.getMonth()];
  return ini.getMonth() === fim.getMonth()
    ? `${ini.getDate()} a ${fim.getDate()} de ${mFim} de ${fim.getFullYear()}`
    : `${ini.getDate()} de ${mIni} a ${fim.getDate()} de ${mFim} de ${fim.getFullYear()}`;
}

// ⚠️ SÓ VALE A RESPOSTA DO ÚLTIMO PEDIDO. Clicando rápido em "‹ ›" ou
// trocando Semana → Mês, a resposta mais lenta (a da semana) chegava depois e
// sobrescrevia a do mês: a grade do mês aparecia só com os itens da semana.
let _agSeq = 0;
let _agChave = "";
// ⚠️ O PERÍODO JÁ VISTO REAPARECE NA HORA (19/11/2026). Voltar à Agenda, ou
// a uma semana já vista, mostra o que veio da última vez e atualiza por trás
// (o "Atualizando…" do canto). Antes cada volta esperava o servidor de novo,
// com a tela em "Carregando…". Toda gravação limpa o guardado (_agInvalidar):
// a repetição de um compromisso muda outros períodos além do da tela.
const _agCache = new Map();
function _agInvalidar() { _agCache.clear(); }
async function _agCarregar() {
  const { ini, fim } = _agPeriodo();
  const seq = ++_agSeq;
  // Período novo: a grade não pode mostrar os itens do período anterior
  // enquanto o novo não chega (parecia que o mês só tinha a semana).
  const chave = `${_agIso(ini)}|${_agIso(fim)}`;
  if (chave !== _agChave) { _agItens = _agCache.get(chave) || []; _agChave = chave; }
  _agCarregando = true;
  _agRender();
  try {
    const r = await fetch(`/agenda?de=${_agIso(ini)}&ate=${_agIso(fim)}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (seq !== _agSeq) return;
    if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    _agItens = j.itens || [];
    _agCache.set(chave, _agItens);
  } catch (e) {
    if (seq !== _agSeq) return;
    _agItens = [];
    _agErro = e.message;
  } finally {
    if (seq === _agSeq) { _agCarregando = false; _agRender(); }
  }
}
let _agErro = null;

function _agItemHtml(it, { compacto = false } = {}) {
  const t = _AG_TIPOS[it.tipo] || _AG_TIPOS.outro;
  const hora = it.dia_inteiro ? "" : `<span class="ag-hora">${_agHora(it.inicio)}</span>`;
  const onde = it.condominio_nome && !compacto ? `<span class="ag-onde">${_agEsc(it.condominio_nome)}</span>` : "";
  const quem = it.responsavel_nome && !compacto ? `<span class="ag-onde">${_agEsc(it.responsavel_nome)}</span>` : "";
  const feito = it.concluido ? " is-concluido" : "";
  const titulo = it.tipo === "contrato" && it.condominio_nome ? `Contrato de ${it.condominio_nome} termina` : it.titulo;
  return `<button type="button" class="ag-item ${t.cls}${feito}" data-ag-item="${_agEsc(it.id)}" title="${_agEsc(t.rot)}">
    ${hora}<span class="ag-tit">${_agEsc(titulo)}</span>${onde}${quem}
  </button>`;
}

function _agPorDia() {
  const m = new Map();
  for (const it of _agItens) {
    const k = _agDia(it.inicio);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

function _agRenderSemana(porDia) {
  const { ini } = _agPeriodo();
  const hoje = _agIso(new Date());
  return `<div class="ag-semana">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = _agSomaDias(ini, i), k = _agIso(d);
    const itens = porDia.get(k) || [];
    return `<div class="ag-col${k === hoje ? " is-hoje" : ""}">
      <div class="ag-col-cab"><span class="ag-col-dow">${_AG_DIAS[d.getDay()]}</span><span class="ag-col-num">${d.getDate()}</span>
        <button type="button" class="ag-mais viewer-only-hide" data-ag-novo="${k}" title="Novo compromisso neste dia" aria-label="Novo compromisso em ${d.getDate()}/${d.getMonth() + 1}">+</button></div>
      <div class="ag-col-itens">${itens.length ? itens.map(it => _agItemHtml(it)).join("") : `<span class="ag-vazio">—</span>`}</div>
    </div>`;
  }).join("")}</div>`;
}

function _agRenderMes(porDia) {
  const { ini } = _agPeriodo();
  const hoje = _agIso(new Date());
  const mes = _agRef.getMonth();
  const cab = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="ag-mes-dow">${d}</div>`).join("");
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = _agSomaDias(ini, i), k = _agIso(d);
    const itens = porDia.get(k) || [];
    const vis = itens.slice(0, 3);
    return `<div class="ag-mes-dia${d.getMonth() !== mes ? " is-fora" : ""}${k === hoje ? " is-hoje" : ""}" data-ag-novo-dia="${k}">
      <span class="ag-mes-num">${d.getDate()}</span>
      ${vis.map(it => _agItemHtml(it, { compacto: true })).join("")}
      ${itens.length > 3 ? `<button type="button" class="ag-mes-mais" data-ag-ir-dia="${k}">+${itens.length - 3} mais</button>` : ""}
    </div>`;
  }).join("");
  return `<div class="ag-mes">${cab}${dias}</div>`;
}

function _agRenderLista(porDia) {
  const chaves = [...porDia.keys()].sort();
  if (!chaves.length) return `<p class="ag-lista-vazia">Nada na agenda nos próximos 30 dias.</p>`;
  const hoje = _agIso(new Date());
  return `<div class="ag-lista">${chaves.map(k => {
    const d = new Date(k + "T12:00:00");
    const dow = _AG_DIAS[d.getDay()];
    const rot = k === hoje ? "Hoje" : `${dow[0].toUpperCase()}${dow.slice(1)}, ${d.getDate()} de ${_AG_MESES[d.getMonth()]}`;
    return `<section class="ag-lista-dia"><h3>${rot}</h3>${porDia.get(k).map(it => _agItemHtml(it)).join("")}</section>`;
  }).join("")}</div>`;
}

function _agRender() {
  const root = document.getElementById("agRoot");
  if (!root) return;
  const porDia = _agPorDia();
  // Primeira carga de um período: a grade da vista aparece já, vazia e em
  // "carregando" (classe is-carregando esconde o "—" de dia sem nada, que
  // mentiria "não tem nada"), em vez de um parágrafo "Carregando…".
  const esperando = _agCarregando && !_agItens.length;
  const corpo = esperando && _agVista === "lista"
    ? `<div class="ag-lista ag-esqueleto" aria-hidden="true">${[0, 1, 2].map(() => `<section class="ag-lista-dia"><span class="ag-esq ag-esq-tit"></span><span class="ag-esq ag-esq-linha"></span><span class="ag-esq ag-esq-linha"></span></section>`).join("")}</div>`
    : esperando ? (_agVista === "semana" ? _agRenderSemana(porDia) : _agRenderMes(porDia))
    : _agErro ? `<p class="ag-lista-vazia">Não foi possível carregar a agenda: ${_agEsc(_agErro)}</p>`
    : _agVista === "semana" ? _agRenderSemana(porDia)
    : _agVista === "mes" ? _agRenderMes(porDia)
    : _agRenderLista(porDia);
  _agErro = null;
  root.innerHTML = `
    <div class="card ag-card">
      <div class="ag-barra">
        <div class="ag-nav">
          <button type="button" class="btn btn-sm" data-ag-nav="hoje">Hoje</button>
          <button type="button" class="btn btn-sm ag-seta" data-ag-nav="-1" aria-label="Período anterior">‹</button>
          <button type="button" class="btn btn-sm ag-seta" data-ag-nav="1" aria-label="Próximo período">›</button>
          <h2 class="ag-periodo">${_agTituloPeriodo()}</h2>
          ${_agCarregando ? `<span class="ag-carregando" role="status">${_agItens.length ? "Atualizando…" : "Carregando…"}</span>` : ""}
        </div>
        <div class="ag-acoes">
          <div class="wa-tabs ag-vistas" role="tablist">
            ${[["semana", "Semana"], ["mes", "Mês"], ["lista", "Lista"]].map(([v, r]) =>
              `<button type="button" class="wa-tab${_agVista === v ? " is-active" : ""}" data-ag-vista="${v}">${r}</button>`).join("")}
          </div>
          <button type="button" class="btn btn-sm btnAccent viewer-only-hide" data-ag-novo="${_agIso(new Date())}">Novo compromisso</button>
        </div>
      </div>
      <div class="ag-legenda">${["reuniao", "visita", "financeiro", "retorno", "preventiva", "contrato"].map(t =>
        `<span class="ag-leg ${_AG_TIPOS[t].cls}">${t === "financeiro" ? "Financeiro" : _AG_TIPOS[t].rot}</span>`).join("")}</div>
      <div class="ag-corpo${esperando ? " is-carregando" : ""}" aria-busy="${esperando}">${corpo}</div>
    </div>`;
}

// ── formulário de compromisso ──────────────────────────────────────────────

async function _agGarantirEquipe() {
  if (_agEquipe) return _agEquipe;
  try {
    const r = await fetch("/admin/usuarios", { headers: authHeaders() });
    const j = r.ok ? await r.json() : [];
    _agEquipe = (Array.isArray(j) ? j : []).filter(u => ["admin", "gerente", "operador", "tecnico"].includes(u.role))
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  } catch { _agEquipe = []; }
  return _agEquipe;
}

function _agFecharForm() {
  document.getElementById("agOverlay")?.remove();
}

async function _agAbrirForm(dia, item) {
  _agFecharForm();
  const equipe = await _agGarantirEquipe();
  const admin = typeof _myRole !== "undefined" && _myRole === "admin";
  const c = item || {};
  const ini = c.inicio ? new Date(c.inicio) : null;
  const fim = c.fim ? new Date(c.fim) : null;
  const diaVal = ini ? _agIso(ini) : dia;
  const hIni = ini && !c.dia_inteiro ? _agHora(c.inicio) : "09:00";
  const hFim = fim ? _agHora(c.fim) : "";
  const condos = (Array.isArray(_condominios) ? _condominios : [])
    .map(x => ({ id: x.id, nome: x.nome_fantasia || x.nome }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const tipos = ["reuniao", "visita", "outro"].concat(admin ? ["pagamento", "financeiro"] : []);
  const ov = document.createElement("div");
  ov.id = "agOverlay";
  ov.className = "modalOverlay";
  ov.style.display = "flex";
  ov.innerHTML = `
    <div class="modalBox ag-form" role="dialog" aria-labelledby="agFormTit">
      <div class="modalHead">
        <div><div class="modalTitle" id="agFormTit">${item ? "Editar compromisso" : "Novo compromisso"}</div>
          ${c.repeticao && c.repeticao !== "nenhuma" ? `<div class="modalSub">Repete ${c.repeticao === "semanal" ? "toda semana" : "todo mês"}: a mudança vale para todas as vezes.</div>` : ""}</div>
        <button class="btn btn-sm" type="button" data-ag-form="fechar">Fechar</button>
      </div>
      <div class="modalBody">
        <form class="ag-form-grid" data-sem-envio>
          <label class="f ag-f-largo"><span class="lbl">Título</span>
            <input class="input" name="titulo" maxlength="160" required value="${_agEsc(c.titulo || "")}" placeholder="Ex.: Reunião com o síndico do Aurora"></label>
          <label class="f"><span class="lbl">Tipo</span>
            <select class="select" name="tipo">${tipos.map(t => `<option value="${t}" ${(c.tipo || "reuniao") === t ? "selected" : ""}>${_AG_TIPOS[t].rot}</option>`).join("")}</select></label>
          <label class="f"><span class="lbl">Dia</span><input class="input" type="date" name="dia" required value="${diaVal}"></label>
          <label class="f ag-f-check"><input type="checkbox" name="dia_inteiro" ${c.dia_inteiro ? "checked" : ""}> <span>Dia inteiro</span></label>
          <label class="f ag-f-hora"><span class="lbl">Começa</span><input class="input" type="time" name="hora_ini" value="${hIni}"></label>
          <label class="f ag-f-hora"><span class="lbl">Termina</span><input class="input" type="time" name="hora_fim" value="${hFim}"></label>
          <label class="f"><span class="lbl">Repetir</span>
            <select class="select" name="repeticao">
              ${[["nenhuma", "Não repete"], ["semanal", "Toda semana"], ["mensal", "Todo mês"]].map(([v, r]) => `<option value="${v}" ${(c.repeticao || "nenhuma") === v ? "selected" : ""}>${r}</option>`).join("")}
            </select></label>
          <label class="f ag-f-ate"><span class="lbl">Até (opcional)</span><input class="input" type="date" name="repete_ate" value="${c.repete_ate || ""}"></label>
          <label class="f"><span class="lbl">Condomínio (opcional)</span>
            <select class="select" name="condominio_id"><option value="">Nenhum</option>${condos.map(x => `<option value="${x.id}" ${Number(c.condominio_id) === x.id ? "selected" : ""}>${_agEsc(x.nome)}</option>`).join("")}</select></label>
          <label class="f"><span class="lbl">Responsável (opcional)</span>
            <select class="select" name="responsavel_id"><option value="">Ninguém</option>${equipe.map(u => `<option value="${u.id}" ${Number(c.responsavel_id) === u.id ? "selected" : ""}>${_agEsc(u.nome || u.email)}</option>`).join("")}</select></label>
          <label class="f ag-f-largo"><span class="lbl">Observação</span><textarea class="input" name="descricao" rows="3">${_agEsc(c.descricao || "")}</textarea></label>
          <p class="ag-form-msg" id="agFormMsg" role="status"></p>
        </form>
      </div>
      <div class="ag-form-pe">
        ${item ? `<button class="btn btn-sm ag-apagar" type="button" data-ag-form="apagar">Apagar</button>` : "<span></span>"}
        <div><button class="btn btn-sm" type="button" data-ag-form="fechar">Cancelar</button>
          <button class="btn btn-sm btnAccent" type="button" data-ag-form="salvar">Salvar</button></div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const form = ov.querySelector("form");
  const sinc = () => {
    const di = form.dia_inteiro.checked;
    ov.querySelectorAll(".ag-f-hora").forEach(el => { el.style.display = di ? "none" : ""; });
    ov.querySelector(".ag-f-ate").style.display = form.repeticao.value === "nenhuma" ? "none" : "";
  };
  form.addEventListener("change", sinc);
  sinc();
  form.titulo.focus();
  ov.addEventListener("click", async (e) => {
    if (e.target === ov) return _agFecharForm();
    const b = e.target.closest("[data-ag-form]");
    if (!b) return;
    const acao = b.dataset.agForm;
    if (acao === "fechar") return _agFecharForm();
    const msg = ov.querySelector("#agFormMsg");
    if (acao === "apagar") {
      if (!confirm("Apagar este compromisso" + (c.repeticao && c.repeticao !== "nenhuma" ? " e todas as repetições?" : "?"))) return;
      const r = await fetch(`/agenda/compromissos/${c.compromisso_id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) { msg.textContent = "Não foi possível apagar."; return; }
      _agFecharForm(); _agInvalidar(); _agCarregar(); return;
    }
    // salvar
    const f = form;
    const dia = f.dia.value;
    if (!f.titulo.value.trim() || !dia) { msg.textContent = "Preencha o título e o dia."; return; }
    const di = f.dia_inteiro.checked;
    const corpo = {
      titulo: f.titulo.value.trim(),
      tipo: f.tipo.value,
      dia_inteiro: di,
      inicio: new Date(`${dia}T${di ? "00:00" : (f.hora_ini.value || "09:00")}:00`).toISOString(),
      fim: !di && f.hora_fim.value ? new Date(`${dia}T${f.hora_fim.value}:00`).toISOString() : null,
      repeticao: f.repeticao.value,
      repete_ate: f.repeticao.value !== "nenhuma" && f.repete_ate.value ? f.repete_ate.value : null,
      condominio_id: f.condominio_id.value || null,
      responsavel_id: f.responsavel_id.value || null,
      descricao: f.descricao.value.trim() || null,
    };
    // ⚠️ Compromisso que repete é UMA linha no banco. Editado a partir de uma
    // ocorrência qualquer (a de março de uma série que começou em janeiro),
    // o "dia" do formulário é o da ocorrência. Se a pessoa não mexeu no dia,
    // a série continua começando onde começava; só hora, título etc. mudam.
    if (item && c.serie_inicio && c.repeticao !== "nenhuma" && dia === _agIso(new Date(c.inicio))) {
      const d0 = _agIso(new Date(c.serie_inicio));
      corpo.inicio = new Date(`${d0}T${di ? "00:00" : (f.hora_ini.value || "09:00")}:00`).toISOString();
      corpo.fim = !di && f.hora_fim.value ? new Date(`${d0}T${f.hora_fim.value}:00`).toISOString() : null;
    }
    b.disabled = true;
    msg.textContent = "Salvando…";
    const r = await fetch(item ? `/agenda/compromissos/${c.compromisso_id}` : "/agenda/compromissos", {
      method: item ? "PATCH" : "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    b.disabled = false;
    if (!r.ok) { msg.textContent = j.error || "Não foi possível salvar."; return; }
    _agFecharForm();
    _agRef = new Date(`${dia}T12:00:00`);
    _agInvalidar();
    _agCarregar();
  });
}

// ── o faturamento do Omie ──────────────────────────────────────────────────

async function _agAbrirFaturamento(comp) {
  _agFecharForm();
  const ov = document.createElement("div");
  ov.id = "agOverlay";
  ov.className = "modalOverlay";
  ov.style.display = "flex";
  const [ano, mes] = comp.split("-").map(Number);
  ov.innerHTML = `<div class="modalBox ag-fat" role="dialog" aria-labelledby="agFatTit">
    <div class="modalHead"><div><div class="modalTitle" id="agFatTit">Faturamento dos contratos: ${_AG_MESES[mes - 1]} de ${ano}</div>
      <div class="modalSub">As notas saem pelo faturamento de contratos do Omie. Aqui só se acompanha.</div></div>
      <button class="btn btn-sm" type="button" data-ag-fat="fechar">Fechar</button></div>
    <div class="modalBody" id="agFatCorpo"><p class="ag-lista-vazia">Carregando…</p></div></div>`;
  document.body.appendChild(ov);
  const desenhar = async () => {
    const corpo = ov.querySelector("#agFatCorpo");
    const r = await fetch(`/agenda/faturamento?competencia=${comp}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { corpo.innerHTML = `<p class="ag-lista-vazia">${_agEsc(j.error || "Erro ao carregar.")}</p>`; return; }
    const moeda = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const pct = j.esperados ? Math.round(100 * j.faturados / j.esperados) : 0;
    const sinc = j.sincronizacao?.ultima_em ? new Date(j.sincronizacao.ultima_em).toLocaleString("pt-BR") : "nunca";
    corpo.innerHTML = `
      <div class="ag-fat-resumo">
        <div><strong>${j.faturados} de ${j.esperados}</strong> contratos ativos com nota no mês</div>
        <div class="ag-fat-barra" role="img" aria-label="${pct}% faturado"><span style="width:${pct}%"></span></div>
        <div class="ag-fat-valor">${moeda(j.valor_faturado)} de ${moeda(j.valor_esperado)}</div>
      </div>
      ${j.pendentes.length ? `<h3 class="ag-fat-h">Sem nota em ${_AG_MESES[mes - 1]}</h3>
        <table class="ag-fat-tab"><thead><tr><th>Contrato no Omie</th><th>Valor mensal</th><th>Vigência até</th><th>Provável motivo</th></tr></thead>
        <tbody>${j.pendentes.map(p => `<tr><td>${_agEsc(p.numero)}</td><td>${moeda(p.valor_mensal)}</td>
          <td>${p.vigencia_fim ? new Date(p.vigencia_fim).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—"}</td>
          <td>${p.vigencia_vencida ? "Vigência acabou e o contrato continua ativo no Omie" : "—"}</td></tr>`).join("")}</tbody></table>`
        : `<p class="ag-fat-ok">Todos os contratos ativos têm nota neste mês.</p>`}
      <div class="ag-fat-pe"><span class="ag-fat-sinc">Copiado do Omie em ${sinc}${j.sincronizacao?.ultimo_erro ? ` · último erro: ${_agEsc(j.sincronizacao.ultimo_erro)}` : ""}</span>
        <button class="btn btn-sm" type="button" data-ag-fat="atualizar">Atualizar agora</button></div>`;
  };
  ov.addEventListener("click", async (e) => {
    if (e.target === ov) return _agFecharForm();
    const b = e.target.closest("[data-ag-fat]");
    if (!b) return;
    if (b.dataset.agFat === "fechar") return _agFecharForm();
    b.disabled = true; b.textContent = "Atualizando…";
    const r = await fetch("/agenda/faturamento/atualizar", { method: "POST", headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) alert(j.error || "Não foi possível atualizar.");
    else if (j.pulado) b.textContent = "Atualizado há pouco";
    await desenhar();
    _agInvalidar();
    _agCarregar();
  });
  desenhar();
}

// ── cliques ────────────────────────────────────────────────────────────────

function _agBindEventos() {
  if (_agBind) return;
  _agBind = true;
  document.getElementById("agRoot")?.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-ag-nav]");
    if (nav) {
      const v = nav.dataset.agNav;
      if (v === "hoje") _agRef = new Date();
      else {
        const n = Number(v);
        if (_agVista === "mes") _agRef = new Date(_agRef.getFullYear(), _agRef.getMonth() + n, 1);
        else _agRef = _agSomaDias(_agRef, n * (_agVista === "semana" ? 7 : 30));
      }
      return _agCarregar();
    }
    const vista = e.target.closest("[data-ag-vista]");
    if (vista) { _agVista = vista.dataset.agVista; return _agCarregar(); }
    const novo = e.target.closest("[data-ag-novo]");
    if (novo) return _agAbrirForm(novo.dataset.agNovo, null);
    const irDia = e.target.closest("[data-ag-ir-dia]");
    if (irDia) { _agRef = new Date(irDia.dataset.agIrDia + "T12:00:00"); _agVista = "semana"; return _agCarregar(); }
    const el = e.target.closest("[data-ag-item]");
    if (el) {
      const it = _agItens.find(x => x.id === el.dataset.agItem);
      if (!it) return;
      if (it.fonte === "compromisso") return _agAbrirForm(null, it);
      if (it.fonte === "os") return abrirOSDetalhe(it.os_id);
      if (it.fonte === "contrato" && it.condominio_id) return abrirFichaCondominio(it.condominio_id, "contrato");
      if (it.fonte === "preventivas") return showSection("planos");
      if (it.fonte === "omie") return _agAbrirFaturamento(it.competencia);
      return;
    }
    // Clique no espaço de um dia do mês: novo compromisso nele.
    const dia = e.target.closest("[data-ag-novo-dia]");
    if (dia && !e.target.closest("button")) return _agAbrirForm(dia.dataset.agNovoDia, null);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.getElementById("agOverlay")) _agFecharForm(); });
}

(function _agLigar() {
  const orig = window.showSection;
  if (typeof orig !== "function") return;
  window.showSection = function (name, ...resto) {
    const r = orig.call(this, name, ...resto);
    if (name === "agenda") { _agBindEventos(); _agCarregar(); }
    return r;
  };
})();
