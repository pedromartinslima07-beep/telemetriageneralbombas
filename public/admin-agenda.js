// public/admin-agenda.js — Agenda da empresa (fase A, 18/11/2026)
//
// Um calendário só com tudo o que a empresa tem a fazer: compromissos
// lançados à mão (reunião, visita, pagamento...), retornos pedidos nas O.S.,
// contratos terminando, preventivas do mês e o faturamento dos contratos no
// Omie. Os dados vêm de GET /agenda (src/routes/agenda.routes.js); quem
// decide o que cada perfil vê é a rota, não esta tela.
//
// 27/11/2026 (migration 111): CONCLUIR E MEXER NUMA VEZ SÓ. Pedido do Pedro,
// copiado das agendas profissionais (Google Agenda, Jobber):
//   · todo item tem um círculo de "feito" (o retorno e o contrato também);
//     a visita de chamado se marca sozinha quando a O.S. fecha no dia;
//   · clicar no item abre um CARTÃO (feito, editar, remarcar, abrir, apagar);
//   · mexer num compromisso que repete pergunta "só esta / esta e as
//     próximas / todas" (_agAlcance);
//   · o que passou do dia sem ser feito é ATRASADO e não some sozinho.
// Maquete aprovada: public/_agenda-preview.html. O Quadro (técnicos nas
// linhas) mora no admin-despacho.js e usa as peças daqui.
//
// Roda DEPOIS do admin.js e usa os globais dele (authHeaders, _waEscaparHtml,
// _condominios, abrirOSDetalhe, abrirFichaCondominio, showSection), no mesmo
// molde do admin-condominio.js.
//
// ⚠️ DATAS EM SÃO PAULO. O painel roda no navegador de quem está no
// escritório, então "dia" aqui é o dia do relógio local. A rota faz a mesma
// conta no servidor, que é UTC, fixando -03:00.

const _AG_TIPOS = {
  reuniao:     { rot: "Reunião",            cls: "is-reuniao", cor: "#56648a" },
  visita:      { rot: "Visita",             cls: "is-visita",  cor: "#0d2775" },
  pagamento:   { rot: "Pagamento",          cls: "is-fin",     cor: "#6b4fd0" },
  financeiro:  { rot: "Financeiro",         cls: "is-fin",     cor: "#6b4fd0" },
  outro:       { rot: "Outro",              cls: "is-outro",   cor: "#56648a" },
  retorno:     { rot: "Retorno de O.S.",    cls: "is-retorno", cor: "#c48a12" },
  contrato:    { rot: "Contrato",           cls: "is-contrato", cor: "#c48a12" },
  preventiva:  { rot: "Preventivas",        cls: "is-prev",    cor: "#1f9d57" },
  faturamento: { rot: "Faturamento Omie",   cls: "is-fin",     cor: "#6b4fd0" },
};
const _AG_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const _AG_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const _AG_DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

let _agVista = (window.innerWidth < 760) ? "lista" : "semana";
let _agRef = new Date();          // um dia dentro do período mostrado
let _agItens = [];
let _agAtras = [];                // o que passou do dia sem ser feito (30 dias)
let _agCarregando = false;
let _agEquipe = null;             // usuários internos (responsável)
let _agBind = false;

const _agEsc = s => _waEscaparHtml(s == null ? "" : String(s));
const _agIco = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
const _agIcones = raiz => window.lucide?.createIcons?.({ root: raiz });
const _agIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _agDia = iso => { const d = new Date(iso); return _agIso(d); };
const _agHora = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const _agSomaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const _agInicioSemana = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = (x.getDay() + 6) % 7; return _agSomaDias(x, -dow); };
const _agHoje = () => _agIso(new Date());
const _agRotDia = iso => {
  const d = new Date(iso + "T12:00:00");
  return iso === _agHoje() ? "hoje" : `${_AG_DIAS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const _agRotLongo = iso => { const d = new Date(iso + "T12:00:00"); return `${_AG_DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${_AG_MESES[d.getMonth()]}`; };

// ── o que cada item é ───────────────────────────────────────────────────────
const _agTipo = it => _AG_TIPOS[it.chamado_id ? "visita" : it.tipo] || _AG_TIPOS.outro;
const _agRepete = it => it.fonte === "compromisso" && it.repeticao && it.repeticao !== "nenhuma";
// Feito: marcado à mão, marcado pela O.S., ou o chamado da visita já fechou.
const _agFeito = it => !!it.concluido || !!(it.chamado_id && ["fechado", "cancelado"].includes(it.chamado_status));
// Quem tem círculo clicável. O faturamento do Omie conclui sozinho; o resumo
// das preventivas é contagem; a visita que a O.S. marcou não se desmarca aqui.
const _agMarcavel = it => ["compromisso", "os", "contrato"].includes(it.fonte) && !it.concluido_auto;
const _agAuto = it => it.fonte === "omie" || !!it.concluido_auto;
// Atrasado: passou do dia sem ser feito. Reunião não entra: reunião que passou
// aconteceu (é evento, não tarefa, como no Google Agenda); sem isso a reunião
// semanal enchia a aba Atrasados toda segunda.
const _agAtrasado = it => ["compromisso", "os", "contrato"].includes(it.fonte) && !(it.fonte === "compromisso" && it.tipo === "reuniao" && !it.chamado_id)
  && !_agFeito(it) && _agDia(it.inicio) < _agHoje();
const _agTitulo = it => it.tipo === "contrato" && it.condominio_nome ? `Contrato de ${it.condominio_nome} termina` : it.titulo;
// Quem vai: o técnico do chamado (Quadro) ou o responsável.
function _agQuem(it) {
  if (it.chamado_tecnico_id && typeof _tecnicosData !== "undefined" && Array.isArray(_tecnicosData)) {
    const t = _tecnicosData.find(x => x.id === it.chamado_tecnico_id);
    if (t) return t.nome;
  }
  return it.responsavel_nome || null;
}
const _agRotRep = it => it.repeticao === "semanal" ? `Toda ${_AG_DIAS_LONGOS[new Date(it.serie_inicio || it.inicio).getDay()]}` : it.repeticao === "mensal" ? `Todo mês, dia ${new Date(it.serie_inicio || it.inicio).getDate()}` : "";

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
let _agAtrasCarregado = false;
function _agInvalidar() { _agCache.clear(); _agAtrasCarregado = false; }
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
    const [r] = await Promise.all([
      fetch(`/agenda?de=${_agIso(ini)}&ate=${_agIso(fim)}`, { headers: authHeaders() }),
      _agAtrasCarregado ? null : _agCarregarAtrasados(),
    ]);
    const j = await r.json().catch(() => ({}));
    if (seq !== _agSeq) return;
    if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    _agItens = j.itens || [];
    // Próxima visita de cada chamado (quadro de despacho, admin-despacho.js).
    _agVisitasChamados = j.visitas_chamados || {};
    _agCache.set(chave, _agItens);
  } catch (e) {
    if (seq !== _agSeq) return;
    _agItens = [];
    _agErro = e.message;
  } finally {
    if (seq === _agSeq) { _agCarregando = false; _agRender(); }
  }
}
// O que ficou para trás nos últimos 30 dias sem ser feito: a aba Atrasados
// do Quadro e o bloco "Passou da data" da Lista. Pedido à parte porque o
// período da tela quase nunca cobre o passado.
async function _agCarregarAtrasados() {
  const ontem = _agSomaDias(new Date(), -1);
  try {
    const r = await fetch(`/agenda?de=${_agIso(_agSomaDias(ontem, -29))}&ate=${_agIso(ontem)}`, { headers: authHeaders() });
    const j = r.ok ? await r.json() : {};
    _agAtras = (j.itens || []).filter(_agAtrasado).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    _agAtrasCarregado = true;
  } catch { _agAtras = []; }
}
let _agErro = null;
let _agVisitasChamados = {};

// ── os desenhos ────────────────────────────────────────────────────────────

// O círculo de feito. Num item que conclui sozinho é tracejado e não clica.
function _agCirculo(it, cls = "") {
  if (it.fonte === "preventivas") return "";
  const feito = _agFeito(it);
  const dica = it.fonte === "omie" ? "Conclui sozinho quando todos os contratos tiverem nota"
    : it.concluido_auto ? `Feito pela ${it.concluido_os || "O.S."}`
    : feito ? "Feito · clique para reabrir" : "Marcar como feito";
  const clica = _agMarcavel(it) && !(it.chamado_id && !it.concluido && feito);
  return `<button type="button" class="dq-ck ${cls}${clica ? "" : " is-auto"}" ${clica ? `data-ag-ck="${_agEsc(it.id)}"` : "tabindex=\"-1\""}
    aria-label="${_agEsc(dica)}" title="${_agEsc(dica)}">${_agIco("check")}</button>`;
}

// O item da grade (Quadro e Semana): círculo, hora, título, onde, quem.
function _agItemGrade(it, { quem = false, arrasta = false } = {}) {
  const t = _agTipo(it);
  const at = _agAtrasado(it);
  const titulo = _agTitulo(it);
  const q = quem ? _agQuem(it) : null;
  return `<div class="dq-ag ${t.cls}${_agFeito(it) ? " is-feito" : ""}${at ? " is-atrasado" : ""}" data-ag-item="${_agEsc(it.id)}" role="button" tabindex="0"
      ${arrasta ? `draggable="true" data-dq-arrasta="cp:${it.compromisso_id}:${_agEsc(it.id)}"` : ""} title="${_agEsc(titulo)}">
    ${_agCirculo(it)}
    <span class="dq-ag-corpo">
      ${it.dia_inteiro ? "" : `<span class="dq-hora">${_agHora(it.inicio)}</span>`}<span class="dq-ag-tit">${_agEsc(titulo)}</span>${_agRepete(it) ? `<i class="dq-rep" title="Repete">${_agIco("repeat")}</i>` : ""}
      ${it.condominio_nome && it.tipo !== "contrato" ? `<small>${_agEsc(it.condominio_nome)}</small>` : ""}
      ${q ? `<small>${_agEsc(q)}</small>` : ""}
      ${at ? `<span class="dq-atr">ATRASADO</span>` : ""}
    </span>
  </div>`;
}

function _agPorDia(lista = _agItens) {
  const m = new Map();
  for (const it of lista) {
    const k = _agDia(it.inicio);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  for (const v of m.values()) v.sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || new Date(a.inicio) - new Date(b.inicio));
  return m;
}

// O cabeçalho é o mesmo nas quatro vistas (o Quadro também o usa).
function _agCabecalho() {
  const vistas = [["quadro", "Quadro"], ["semana", "Semana"], ["mes", "Mês"], ["lista", "Lista"]];
  return `<header class="dq-cab">
      <div class="dq-nav">
        <button type="button" class="dq-bt" data-ag-nav="hoje">Hoje</button>
        <button type="button" class="dq-ib" data-ag-nav="-1" aria-label="Período anterior">${_agIco("chevron-left")}</button>
        <button type="button" class="dq-ib" data-ag-nav="1" aria-label="Próximo período">${_agIco("chevron-right")}</button>
        <h2>${_agTituloPeriodo()}</h2>
        ${_agCarregando ? `<span class="dq-sync" role="status">${_agItens.length ? "Atualizando…" : "Carregando…"}</span>` : ""}
      </div>
      <span class="dq-esp"></span>
      <div class="dq-seg" role="group" aria-label="Vista">
        ${vistas.map(([v, r]) => `<button type="button" data-ag-vista="${v}" class="${_agVista === v ? "is-on" : ""}" aria-pressed="${_agVista === v}">${r}</button>`).join("")}
      </div>
      <button type="button" class="dq-bt is-pri viewer-only-hide" data-ag-novo="${_agHoje()}">${_agIco("plus")}Compromisso</button>
    </header>`;
}

function _agRenderSemana(porDia) {
  const { ini } = _agPeriodo();
  const hoje = _agHoje();
  return `<div class="ags">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = _agSomaDias(ini, i), k = _agIso(d);
    const itens = porDia.get(k) || [];
    return `<div class="ags-col${k === hoje ? " is-hoje" : ""}">
      <div class="ags-cab"><span>${_AG_DIAS[d.getDay()]}</span><b>${d.getDate()}</b>${k === hoje ? "<em>hoje</em>" : ""}</div>
      <div class="ags-itens dq-cel" data-ag-cel="${k}">${itens.map(it => _agItemGrade(it, { quem: true })).join("")}<span class="dq-cel-mais viewer-only-hide">${_agIco("plus")}novo</span></div>
    </div>`;
  }).join("")}</div>`;
}

function _agRenderMes(porDia) {
  const { ini } = _agPeriodo();
  const hoje = _agHoje();
  const mes = _agRef.getMonth();
  const cab = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="agm-dow">${d}</div>`).join("");
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = _agSomaDias(ini, i), k = _agIso(d);
    const itens = porDia.get(k) || [];
    const contaveis = itens.filter(it => it.fonte !== "preventivas");
    const feitos = contaveis.filter(_agFeito).length;
    return `<div class="agm-dia dq-cel${d.getMonth() !== mes ? " is-fora" : ""}${k === hoje ? " is-hoje" : ""}" data-ag-cel="${k}">
      <div class="agm-num"><b>${d.getDate()}</b>${contaveis.length && k <= hoje ? `<small>${feitos}/${contaveis.length} feitos</small>` : ""}</div>
      ${itens.slice(0, 3).map(it => {
        const t = _agTipo(it);
        return `<div class="agm-chip ${t.cls}${_agFeito(it) ? " is-feito" : ""}${_agAtrasado(it) ? " is-atrasado" : ""}" data-ag-item="${_agEsc(it.id)}" role="button" tabindex="0"
            title="${_agEsc(_agTitulo(it))}${_agFeito(it) ? " (feito)" : _agAtrasado(it) ? " (atrasado)" : ""}">
          ${_agFeito(it) ? `<i class="agm-ok">${_agIco("check")}</i>` : ""}${it.dia_inteiro ? "" : `<span class="dq-hora">${_agHora(it.inicio)}</span>`}<span class="agm-tit">${_agEsc(_agTitulo(it))}</span></div>`;
      }).join("")}
      ${itens.length > 3 ? `<button type="button" class="agm-mais" data-ag-ir-dia="${k}">+${itens.length - 3} mais</button>` : ""}
    </div>`;
  }).join("");
  return `<div class="agm">${cab}${dias}</div>`;
}

function _agLinhaLista(it, { atrasado = false } = {}) {
  const t = _agTipo(it);
  const quem = _agQuem(it);
  const meta = [it.tipo !== "contrato" ? it.condominio_nome : null, quem, _agRepete(it) ? _agRotRep(it) : null].filter(Boolean).map(_agEsc).join(" · ");
  const feito = _agFeito(it);
  return `<div class="agl-it${feito ? " is-feito" : ""}${atrasado ? " is-atrasado" : ""}" data-ag-item="${_agEsc(it.id)}" role="button" tabindex="0">
    ${_agCirculo(it, "agl-ck") || `<span class="agl-ck-vazio"></span>`}
    <span class="agl-hora">${atrasado ? _agRotDia(_agDia(it.inicio)) : it.dia_inteiro ? "dia todo" : _agHora(it.inicio)}</span>
    <span class="agl-cor" style="background:${t.cor}"></span>
    <span class="agl-corpo"><b>${_agEsc(_agTitulo(it))}</b>${meta ? `<small>${meta}</small>` : ""}${feito && it.concluido_por_nome ? `<small class="agl-feito">Feito por ${_agEsc(it.concluido_por_nome)}${it.concluido_os ? " · " + _agEsc(it.concluido_os) : ""}</small>` : ""}</span>
    ${_agRepete(it) ? `<i class="dq-rep">${_agIco("repeat")}</i>` : ""}
  </div>`;
}

function _agRenderLista(porDia) {
  const hoje = _agHoje();
  const chaves = [...porDia.keys()].sort();
  const verAtras = _agIso(_agRef) === hoje && _agAtras.length;
  if (!chaves.length && !verAtras) return `<p class="ag-lista-vazia">Nada na agenda nos próximos 30 dias.</p>`;
  const amanha = _agIso(_agSomaDias(new Date(), 1));
  return `<div class="agl">
    ${verAtras ? `<section class="agl-dia is-atr"><h3>${_agIco("alarm-clock")}Passou da data<span>${_agAtras.length}</span></h3>
      <p class="agl-dica">Ficou para trás sem ser marcado. Marque o círculo se já foi feito, ou abra o item para remarcar.</p>
      ${_agAtras.map(it => _agLinhaLista(it, { atrasado: true })).join("")}</section>` : ""}
    ${chaves.map(k => {
      const d = new Date(k + "T12:00:00");
      const dow = _AG_DIAS[d.getDay()];
      const its = porDia.get(k);
      const contaveis = its.filter(it => it.fonte !== "preventivas");
      const rot = k === hoje ? "Hoje" : k === amanha ? "Amanhã" : `${dow[0].toUpperCase()}${dow.slice(1)}, ${d.getDate()} de ${_AG_MESES[d.getMonth()]}`;
      return `<section class="agl-dia${k === hoje ? " is-hoje" : ""}"><h3>${rot}${k === hoje && contaveis.length ? `<span>${contaveis.filter(_agFeito).length} de ${contaveis.length} feitos</span>` : ""}
        <button type="button" class="agl-mais viewer-only-hide" data-ag-novo="${k}" aria-label="Novo em ${rot}">${_agIco("plus")}</button></h3>
        ${its.map(it => _agLinhaLista(it)).join("")}</section>`;
    }).join("")}
  </div>`;
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
    : _agErro ? `<p class="ag-lista-vazia">Não foi possível carregar a agenda: ${_agEsc(_agErro)}</p>`
    : _agVista === "semana" ? _agRenderSemana(porDia)
    : _agVista === "mes" ? _agRenderMes(porDia)
    : _agRenderLista(porDia);
  _agErro = null;
  root.innerHTML = `<div class="dq dq-v-${_agVista}${esperando ? " is-carregando" : ""}" aria-busy="${esperando}">${_agCabecalho()}${corpo}</div>`;
  _agIcones(root);
}

// ── aviso com Desfazer (o Quadro usa o mesmo) ──────────────────────────────
let _agToastT;
function _agToast(msg, desfazer) {
  let el = document.getElementById("dqToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "dqToast";
    el.className = "dq-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-dq-desfazer]")) { const f = el._desfazer; el.hidden = true; el._desfazer = null; f && f(); }
      if (e.target.closest("[data-dq-fechar-toast]")) el.hidden = true;
    });
  }
  el.innerHTML = `<span>${_agEsc(msg)}</span>${desfazer ? `<button type="button" data-dq-desfazer>Desfazer</button>` : ""}<button type="button" class="dq-toast-x" data-dq-fechar-toast aria-label="Fechar">×</button>`;
  el._desfazer = desfazer || null;
  el.hidden = false;
  clearTimeout(_agToastT);
  _agToastT = setTimeout(() => { el.hidden = true; }, desfazer ? 8000 : 4500);
}

async function _agReq(url, metodo, corpo) {
  const r = await fetch(url, { method: metodo, headers: { ...authHeaders(), "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
// Depois de gravar: a vista que estiver na tela recarrega (o Quadro troca
// esta função pela dele, que também recarrega os chamados).
let _agDepoisDeGravar = async () => { _agInvalidar(); await _agCarregar(); };

// ── feito ──────────────────────────────────────────────────────────────────
function _agAcharItem(id) { return _agItens.find(x => x.id === id) || _agAtras.find(x => x.id === id); }

async function _agMarcarFeito(it, feito) {
  if (it.fonte === "compromisso") return _agReq(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, concluido: feito });
  if (it.fonte === "os") return _agReq("/agenda/feitos", "POST", { fonte: "retorno", ref_id: it.os_id, concluido: feito });
  if (it.fonte === "contrato") return _agReq("/agenda/feitos", "POST", { fonte: "contrato", ref_id: it.contrato_id, concluido: feito });
}

async function _agAlternarFeito(id) {
  const it = _agAcharItem(id);
  if (!it || !_agMarcavel(it)) return;
  const novo = !it.concluido;
  // Na hora na tela; o servidor confirma por trás.
  it.concluido = novo;
  if (!novo) { it.concluido_por_nome = null; }
  if (novo) _agAtras = _agAtras.filter(x => x.id !== it.id);
  _agRender();
  try { await _agMarcarFeito(it, novo); }
  catch (e) { it.concluido = !novo; _agToast(`Não consegui marcar: ${e.message}`); await _agDepoisDeGravar(); return; }
  const tit = _agTitulo(it);
  _agToast(!novo ? `Reaberto: ${tit}`
    : _agRepete(it) ? `Feito só desta vez: ${tit}`
    : it.chamado_id ? `Visita feita · o chamado #${it.chamado_id} continua aberto até a O.S.`
    : `Feito: ${tit}`, async () => {
    try { await _agMarcarFeito(it, !novo); } catch (e) { _agToast(`Não consegui desfazer: ${e.message}`); }
    await _agDepoisDeGravar();
  });
  _agDepoisDeGravar();
}

// ── "só esta / esta e as próximas / todas" ────────────────────────────────
function _agAncora(el) {
  if (el?.isConnected) return el;
  const id = el?.dataset?.agItem;
  return (id && document.querySelector(`#agRoot [data-ag-item="${CSS.escape(id)}"]`)) || null;
}
function _agFecharPops() { document.querySelectorAll(".dq-pop").forEach(p => p.remove()); document.getElementById("dqMenu")?.remove(); }
function _agAbrirPop(html, ancora, extraCls = "") {
  _agFecharPops();
  const p = document.createElement("div");
  p.className = "dq-pop " + extraCls;
  p.setAttribute("role", "dialog");
  p.innerHTML = html;
  document.body.appendChild(p);
  _agIcones(p);
  // ⚠️ A ÂNCORA PODE TER SAÍDO DA TELA: marcar um feito recarrega a grade, e
  // o item que abriu o cartão é outro elemento agora. Procura o novo pelo id;
  // sem ele, o pop abre no meio da tela (antes caía no canto, em 0,0).
  ancora = _agAncora(ancora);
  const r = ancora ? ancora.getBoundingClientRect()
    : { left: innerWidth / 2 - p.offsetWidth / 2, right: innerWidth / 2 - p.offsetWidth / 2 - 8, top: innerHeight / 3 };
  const w = p.offsetWidth, h = p.offsetHeight;
  let left = r.right + 8;
  if (left + w > innerWidth - 8) left = r.left - w - 8;
  if (left < 8) left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  p.style.left = left + "px";
  p.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 8)) + "px";
  return p;
}

// Resolve "esta" | "proximas" | "todas", ou null se cancelou. Compromisso que
// não repete não pergunta: é "todas" (a linha inteira).
function _agAlcance(it, verbo, ancora) {
  if (!_agRepete(it)) return Promise.resolve("todas");
  return new Promise(resolve => {
    const p = _agAbrirPop(`
      <b class="dq-pop-tit">${_agEsc(verbo)} compromisso que repete</b>
      <span class="dq-pop-sub">${_agEsc(_agTitulo(it))} · ${_agEsc(_agRotRep(it))}</span>
      <div class="dq-esc-ops">
        <label class="dq-op"><input type="radio" name="dqAlc" value="esta" checked><span>Só esta<small>${_agEsc(_agRotLongo(_agDia(it.inicio)))}. As outras ficam como estão.</small></span></label>
        <label class="dq-op"><input type="radio" name="dqAlc" value="proximas"><span>Esta e as próximas<small>Daqui para frente. As de antes não mudam.</small></span></label>
        <label class="dq-op"><input type="radio" name="dqAlc" value="todas"><span>Todas<small>A série inteira, inclusive as que já passaram.</small></span></label>
      </div>
      <div class="dq-pop-acoes"><span class="dq-esp"></span>
        <button type="button" class="dq-bt is-p" data-dq-alc="x">Cancelar</button>
        <button type="button" class="dq-bt is-p is-pri" data-dq-alc="ok">Continuar</button></div>`, ancora, "dq-esc");
    p.querySelector("input:checked")?.focus();
    let feito = false;
    const fim = v => { if (feito) return; feito = true; p.remove(); resolve(v); };
    p.addEventListener("click", e => {
      const b = e.target.closest("[data-dq-alc]");
      if (!b) return;
      fim(b.dataset.dqAlc === "ok" ? p.querySelector("input[name=dqAlc]:checked").value : null);
    });
    // Fechou por fora (clique fora, Esc): conta como cancelar.
    const obs = new MutationObserver(() => { if (!p.isConnected) { obs.disconnect(); fim(null); } });
    obs.observe(document.body, { childList: true });
  });
}
const _agRotAlc = a => ({ esta: "só esta vez", proximas: "esta e as próximas", todas: "a série toda" })[a] || "";

// Grava uma mudança no alcance escolhido. `corpo` traz inicio/fim/titulo/
// descricao/responsavel_id como na rota. "Todas" numa série: a data nova da
// vez vira deslocamento do início da série (a série continua no mesmo dia da
// semana/do mês, só andou junto).
async function _agGravarMudanca(it, alcance, corpo) {
  if (alcance === "esta" && _agRepete(it)) {
    return _agReq(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, ...corpo });
  }
  if (alcance === "proximas" && _agRepete(it)) {
    return _agReq(`/agenda/compromissos/${it.compromisso_id}/dividir`, "POST", { ocorrencia: it.ocorrencia, ...corpo });
  }
  const c = { ...corpo };
  if (_agRepete(it) && c.inicio) {
    const delta = new Date(c.inicio) - new Date(it.inicio);
    const s0 = new Date(it.serie_inicio).getTime();
    c.inicio = new Date(s0 + delta).toISOString();
    if (c.fim) c.fim = new Date(new Date(c.fim).getTime() - new Date(it.inicio).getTime() + s0).toISOString();
  }
  return _agReq(`/agenda/compromissos/${it.compromisso_id}`, "PATCH", c);
}

async function _agApagar(it, alcance) {
  try {
    if (alcance === "esta" && _agRepete(it)) await _agReq(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, cancelada: true });
    else if (alcance === "proximas" && _agRepete(it)) await _agReq(`/agenda/compromissos/${it.compromisso_id}/dividir`, "POST", { ocorrencia: it.ocorrencia, apagar: true });
    else await _agReq(`/agenda/compromissos/${it.compromisso_id}`, "DELETE");
  } catch (e) { _agToast(`Não consegui apagar: ${e.message}`); return; }
  await _agDepoisDeGravar();
  const tit = _agTitulo(it);
  // Desfazer: "só esta" volta a vez; a linha inteira volta como era. "Esta e
  // as próximas" não tem desfazer simples (a série foi cortada): avisa.
  if (alcance === "esta" && _agRepete(it)) {
    _agToast(`Apagado só desta vez: ${tit}`, async () => {
      try { await _agReq(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, cancelada: false }); } catch (e) { _agToast(`Não consegui desfazer: ${e.message}`); }
      await _agDepoisDeGravar();
    });
  } else if (alcance === "proximas" && _agRepete(it)) {
    _agToast(`Apagado daqui para frente: ${tit}`);
  } else {
    _agToast(it.chamado_id ? `Visita desmarcada; o #${it.chamado_id} voltou para "a agendar"` : `Apagado${_agRepete(it) ? " (a série toda)" : ""}: ${tit}`, async () => {
      try {
        const inicio = _agRepete(it) && it.serie_inicio ? it.serie_inicio : it.inicio;
        const dur = it.fim ? new Date(it.fim) - new Date(it.inicio) : 0;
        await _agReq("/agenda/compromissos", "POST", {
          titulo: it.titulo, tipo: it.chamado_id ? "visita" : it.tipo, inicio, fim: it.fim ? new Date(new Date(inicio).getTime() + dur).toISOString() : null,
          dia_inteiro: !!it.dia_inteiro, repeticao: it.repeticao || "nenhuma", repete_ate: it.repete_ate || null,
          condominio_id: it.condominio_id || null, responsavel_id: it.responsavel_id || null, chamado_id: it.chamado_id || null,
          descricao: it.descricao || null, so_admin: !!it.so_admin,
        });
      } catch (e) { _agToast(`Não consegui desfazer: ${e.message}`); }
      await _agDepoisDeGravar();
    });
  }
}

// ── o cartão do item (substitui o menu e o abrir direto) ───────────────────
function _agAbrirOrigem(it) {
  if (it.chamado_id) {
    if (typeof gbAtEscolher === "function") return gbAtEscolher(it.chamado_id);
    if (typeof _chAbrirPagina === "function") return _chAbrirPagina(it.chamado_id);
    return;
  }
  if (it.fonte === "os") return abrirOSDetalhe(it.os_id);
  if (it.fonte === "contrato" && it.condominio_id) return abrirFichaCondominio(it.condominio_id, "contrato");
  if (it.fonte === "preventivas") return showSection("planos");
  if (it.fonte === "omie") return _agAbrirFaturamento(it.competencia);
}

function _agCartao(id, ancora) {
  const it = _agAcharItem(id);
  if (!it) return;
  const t = _agTipo(it);
  const dia = _agDia(it.inicio);
  const feito = _agFeito(it);
  const comp = it.fonte === "compromisso";
  const leitor = document.body.classList.contains("role-viewer");
  const quem = _agQuem(it);
  const rotAbrir = it.chamado_id ? ["inbox", `Chamado #${it.chamado_id}`] : it.fonte === "os" ? ["clipboard-check", "Abrir a O.S."]
    : it.fonte === "contrato" ? ["file-text", "Abrir o contrato"] : it.fonte === "preventivas" ? ["calendar-check", "Abrir Preventivas"]
    : it.fonte === "omie" ? ["external-link", "Abrir o faturamento"] : null;
  const feitoTxt = it.concluido
    ? `${it.concluido_por_nome ? "Feito por " + _agEsc(it.concluido_por_nome) : "Feito"}${it.concluido_em ? ", " + _agEsc(_agRotDia(_agDia(it.concluido_em))) + " " + _agHora(it.concluido_em) : ""}${it.concluido_os ? " · " + _agEsc(it.concluido_os) : ""}`
    : feito ? `O chamado #${it.chamado_id} já foi ${it.chamado_status === "cancelado" ? "cancelado" : "resolvido"}` : "";
  const p = _agAbrirPop(`
    <div class="dq-cartao-topo"><span class="dq-cartao-cor" style="background:${t.cor}"></span>
      <div class="dq-cartao-cab"><div class="dq-cartao-tit${feito ? " is-feito" : ""}">${_agEsc(_agTitulo(it))}</div>
        ${_agAtrasado(it) ? `<span class="dq-atr">ATRASADO</span>` : ""}</div>
      <span class="dq-esp"></span><button type="button" class="dq-ib is-p" data-ag-c="x" aria-label="Fechar">${_agIco("x")}</button></div>
    <div class="dq-cartao-linhas">
      <div>${_agIco("clock")}<span>${_agEsc(_agRotLongo(dia))}${it.dia_inteiro ? " · dia inteiro" : `, ${_agHora(it.inicio)}${it.fim ? "–" + _agHora(it.fim) : ""}`}</span></div>
      ${_agRepete(it) ? `<div>${_agIco("repeat")}<span>${_agEsc(_agRotRep(it))}${it.excecao ? " · esta vez foi mudada à parte" : ""}</span></div>` : ""}
      ${it.condominio_nome && it.tipo !== "contrato" ? `<div>${_agIco("map-pin")}<span>${_agEsc(it.condominio_nome)}</span></div>` : ""}
      ${quem ? `<div>${_agIco("user")}<span>${_agEsc(quem)}</span></div>` : ""}
      ${it.descricao ? `<div>${_agIco("align-left")}<span>${_agEsc(it.descricao)}</span></div>` : ""}
      ${it.so_admin ? `<div>${_agIco("lock")}<span>Só o admin vê</span></div>` : ""}
    </div>
    ${feitoTxt ? `<div class="dq-cartao-feito">${_agIco("circle-check")}<span>${feitoTxt}</span></div>` : ""}
    ${it.fonte === "omie" ? `<div class="dq-cartao-auto">Conclui sozinho quando todos os contratos tiverem nota no Omie.</div>` : ""}
    <div class="dq-cartao-pe">
      ${!leitor && _agMarcavel(it) && !(feito && !it.concluido) ? (it.concluido
        ? `<button type="button" class="dq-bt is-p" data-ag-c="feito">${_agIco("rotate-ccw")}Reabrir</button>`
        : `<button type="button" class="dq-bt is-p is-ok" data-ag-c="feito">${_agIco("check")}Marcar como feito</button>`) : ""}
      ${!leitor && comp ? `<button type="button" class="dq-bt is-p" data-ag-c="editar">${_agIco("pencil")}Editar</button>` : ""}
      ${!leitor && comp ? `<button type="button" class="dq-bt is-p" data-ag-c="remarcar">${_agIco("calendar-clock")}Remarcar</button>` : ""}
      ${rotAbrir ? `<button type="button" class="dq-bt is-p" data-ag-c="abrir">${_agIco(rotAbrir[0])}${_agEsc(rotAbrir[1])}</button>` : ""}
      <span class="dq-esp"></span>
      ${!leitor && comp ? `<button type="button" class="dq-bt is-p is-ico is-perigo" data-ag-c="apagar" title="${it.chamado_id && !_agRepete(it) ? "Desmarcar a visita" : "Apagar"}" aria-label="Apagar">${_agIco(it.chamado_id && !_agRepete(it) ? "calendar-x" : "trash-2")}</button>` : ""}
    </div>`, ancora, "dq-cartao");
  p.addEventListener("click", async e => {
    const b = e.target.closest("[data-ag-c]");
    if (!b) return;
    const a = b.dataset.agC;
    if (a === "x") return p.remove();
    if (a === "feito") { p.remove(); return _agAlternarFeito(it.id); }
    if (a === "abrir") { p.remove(); return _agAbrirOrigem(it); }
    const verbo = { editar: "Editar", remarcar: "Remarcar", apagar: "Apagar" }[a];
    const alc = await _agAlcance(it, verbo, ancora);
    if (!alc) return;
    if (a === "editar") return _agAbrirForm(null, it, alc);
    if (a === "remarcar") return (window._dqRemarcar || _agRemarcar)(it, ancora, alc);
    if (a === "apagar") {
      if (alc === "todas" && _agRepete(it) && !confirm(`Apagar "${it.titulo}" e todas as repetições?`)) return;
      return _agApagar(it, alc);
    }
  });
}

// Remarcar fora do Quadro: dia e hora (o Quadro troca por um com técnico).
function _agRemarcar(it, ancora, alcance) {
  const p = _agAbrirPop(`
    <b class="dq-pop-tit">Remarcar${_agRepete(it) ? " · " + _agRotAlc(alcance) : ""}</b>
    <span class="dq-pop-sub">${_agEsc(_agTitulo(it))}</span>
    <div class="dq-pop-2"><label>Dia<input type="date" data-ag-f="dia" value="${_agDia(it.inicio)}"></label>
      <label>Hora<input type="time" data-ag-f="hora" value="${it.dia_inteiro ? "" : _agHora(it.inicio)}" step="900" ${it.dia_inteiro ? "disabled" : ""}></label></div>
    <div class="dq-pop-acoes"><span class="dq-esp"></span><button type="button" class="dq-bt is-p" data-ag-p="x">Cancelar</button><button type="button" class="dq-bt is-p is-pri" data-ag-p="ok">Salvar</button></div>`, ancora);
  p.addEventListener("click", async e => {
    const b = e.target.closest("[data-ag-p]");
    if (!b) return;
    if (b.dataset.agP === "x") return p.remove();
    const dia = p.querySelector("[data-ag-f=dia]").value;
    const hora = p.querySelector("[data-ag-f=hora]").value || "08:00";
    if (!dia) return;
    p.remove();
    await _agMover(it, alcance, dia, it.dia_inteiro ? null : hora, undefined);
  });
}

// Muda dia/hora (e o responsável, se vier) no alcance escolhido.
async function _agMover(it, alcance, dia, hora, responsavelId) {
  const inicio = it.dia_inteiro ? new Date(`${dia}T00:00:00-03:00`).toISOString() : new Date(`${dia}T${hora || _agHora(it.inicio)}:00-03:00`).toISOString();
  const corpo = { inicio };
  if (it.fim) corpo.fim = new Date(new Date(inicio).getTime() + (new Date(it.fim) - new Date(it.inicio))).toISOString();
  if (responsavelId !== undefined) corpo.responsavel_id = responsavelId;
  try { await _agGravarMudanca(it, alcance, corpo); }
  catch (e) { _agToast(`Não consegui remarcar: ${e.message}`); await _agDepoisDeGravar(); return; }
  await _agDepoisDeGravar();
  const antes = { inicio: it.inicio, fim: it.fim || null };
  const msg = `Remarcado${_agRepete(it) ? " (" + _agRotAlc(alcance) + ")" : ""}: ${_agRotDia(dia)}${it.dia_inteiro ? "" : " às " + (hora || _agHora(it.inicio))}`;
  // Desfazer só onde volta limpo: a linha que não repete e a vez sozinha.
  const desfaz = (!_agRepete(it) || alcance === "esta") && responsavelId === undefined ? async () => {
    try { await _agGravarMudanca(it, alcance, { inicio: antes.inicio, ...(antes.fim ? { fim: antes.fim } : {}) }); } catch (e) { _agToast(`Não consegui desfazer: ${e.message}`); }
    await _agDepoisDeGravar();
  } : null;
  _agToast(msg, desfaz);
}

// Criar rápido: clique no espaço de um dia (Semana, Mês, Quadro). "Mais
// opções" abre o formulário completo com o que já foi digitado.
function _agNovoRapido(dia, ancora, extra = {}) {
  const admin = typeof _myRole !== "undefined" && _myRole === "admin";
  const tipos = ["reuniao", "visita", "outro"].concat(admin ? ["financeiro"] : []);
  const p = _agAbrirPop(`
    <b class="dq-pop-tit">Novo · ${_agEsc(_agRotDia(dia))}${extra.rotulo ? " · " + _agEsc(extra.rotulo) : ""}</b>
    <label>Título<input data-ag-f="tit" maxlength="160" placeholder="Ex.: Ligar para o síndico do Ipê"></label>
    <div class="dq-pop-2"><label>Tipo<select data-ag-f="tipo">${tipos.map(t => `<option value="${t}" ${t === (extra.tipo || "outro") ? "selected" : ""}>${t === "outro" ? "Lembrete / outro" : _AG_TIPOS[t].rot}</option>`).join("")}</select></label>
      <label>Hora<input type="time" data-ag-f="hora" value="${extra.hora || ""}" step="900"></label></div>
    <button type="button" class="dq-pop-link" data-ag-p="mais">Repetição, condomínio, observação…</button>
    <p class="dq-pop-msg" role="status"></p>
    <div class="dq-pop-acoes"><span class="dq-esp"></span><button type="button" class="dq-bt is-p" data-ag-p="x">Cancelar</button><button type="button" class="dq-bt is-p is-pri" data-ag-p="ok">Salvar</button></div>`, ancora);
  const tit = p.querySelector("[data-ag-f=tit]");
  tit.focus();
  tit.addEventListener("keydown", e => { if (e.key === "Enter") p.querySelector("[data-ag-p=ok]").click(); });
  p.addEventListener("click", async e => {
    const b = e.target.closest("[data-ag-p]");
    if (!b) return;
    const acao = b.dataset.agP;
    if (acao === "x") return p.remove();
    const hora = p.querySelector("[data-ag-f=hora]").value;
    const tipo = p.querySelector("[data-ag-f=tipo]").value;
    if (acao === "mais") {
      p.remove();
      return _agAbrirForm(dia, null, null, { titulo: tit.value.trim(), tipo, hora, responsavel_id: extra.responsavel_id || null });
    }
    if (!tit.value.trim()) { tit.focus(); return; }
    b.disabled = true;
    try {
      await _agReq("/agenda/compromissos", "POST", {
        titulo: tit.value.trim(), tipo, dia_inteiro: !hora,
        inicio: new Date(`${dia}T${hora || "00:00"}:00-03:00`).toISOString(),
        responsavel_id: extra.responsavel_id || null,
      });
    } catch (err) { b.disabled = false; p.querySelector(".dq-pop-msg").textContent = err.message; return; }
    p.remove();
    await _agDepoisDeGravar();
    _agToast(`Criado: ${tit.value.trim()}`);
  });
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

// `alcance` (27/11/2026): num compromisso que repete, "esta" grava só esta vez
// (título, observação, dia e hora; a repetição não se mexe), "proximas" corta
// a série aqui e cria outra, "todas" mexe na série como sempre. `pre` traz o
// que o criar rápido já tinha digitado.
async function _agAbrirForm(dia, item, alcance = null, pre = {}) {
  _agFecharForm();
  _agFecharPops();
  // ⚠️ NÃO ESPERAR a equipe para abrir (23/11/2026). Com `await` aqui o
  // formulário só aparecia depois do GET /admin/usuarios: o menu do quadro
  // fechava, nada surgia por um ou dois segundos, e parecia que "Editar" não
  // fazia nada. Abre com o que já tem; o select do responsável chega depois.
  const equipe = _agEquipe || [];
  const c = item || {};
  if (!_agEquipe) {
    _agGarantirEquipe().then(lista => {
      const sel = document.querySelector('#agOverlay select[name="responsavel_id"]');
      if (!sel || !lista.length) return;
      const alvo = Number(c.responsavel_id || pre.responsavel_id);
      sel.insertAdjacentHTML("beforeend", lista.map(u => `<option value="${u.id}" ${alvo === u.id ? "selected" : ""}>${_agEsc(u.nome || u.email)}</option>`).join(""));
    });
  }
  const admin = typeof _myRole !== "undefined" && _myRole === "admin";
  const rep = item && _agRepete(item);
  const soEsta = rep && alcance === "esta";
  const ini = c.inicio ? new Date(c.inicio) : null;
  const fim = c.fim ? new Date(c.fim) : null;
  const diaVal = ini ? _agIso(ini) : dia;
  const hIni = ini && !c.dia_inteiro ? _agHora(c.inicio) : (pre.hora || "09:00");
  const hFim = fim ? _agHora(c.fim) : "";
  const condos = (Array.isArray(_condominios) ? _condominios : [])
    .map(x => ({ id: x.id, nome: x.nome_fantasia || x.nome }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const tipos = ["reuniao", "visita", "outro"].concat(admin ? ["pagamento", "financeiro"] : []);
  const tipoVal = c.tipo || pre.tipo || "reuniao";
  const respVal = Number(c.responsavel_id || pre.responsavel_id) || 0;
  const sub = !rep ? "" : soEsta ? `Só a de ${_agRotLongo(_agDia(c.inicio))}. A repetição não muda.`
    : alcance === "proximas" ? `Desta (${_agRotDia(_agDia(c.inicio))}) em diante. As de antes ficam como estão.`
    : `Repete ${c.repeticao === "semanal" ? "toda semana" : "todo mês"}: a mudança vale para todas as vezes.`;
  const ov = document.createElement("div");
  ov.id = "agOverlay";
  ov.className = "modalOverlay";
  ov.style.display = "flex";
  ov.innerHTML = `
    <div class="modalBox ag-form" role="dialog" aria-labelledby="agFormTit">
      <div class="modalHead">
        <div><div class="modalTitle" id="agFormTit">${item ? "Editar compromisso" : "Novo compromisso"}</div>
          ${sub ? `<div class="modalSub">${_agEsc(sub)}</div>` : ""}</div>
        <button class="btn btn-sm" type="button" data-ag-form="fechar">Fechar</button>
      </div>
      <div class="modalBody">
        <form class="ag-form-grid" data-sem-envio>
          <label class="f ag-f-largo"><span class="lbl">Título</span>
            <input class="input" name="titulo" maxlength="160" required value="${_agEsc(c.titulo || pre.titulo || "")}" placeholder="Ex.: Reunião com o síndico do Aurora"></label>
          <label class="f"><span class="lbl">Tipo</span>
            <select class="select" name="tipo" ${soEsta || c.chamado_id ? "disabled" : ""}>${tipos.map(t => `<option value="${t}" ${tipoVal === t ? "selected" : ""}>${_AG_TIPOS[t].rot}</option>`).join("")}</select></label>
          <label class="f"><span class="lbl">Dia</span><input class="input" type="date" name="dia" required value="${diaVal}"></label>
          <label class="f ag-f-check"><input type="checkbox" name="dia_inteiro" ${c.dia_inteiro || (!item && pre.tipo && !pre.hora) ? "checked" : ""} ${soEsta ? "disabled" : ""}> <span>Dia inteiro</span></label>
          <label class="f ag-f-hora"><span class="lbl">Começa</span><input class="input" type="time" name="hora_ini" value="${hIni}"></label>
          <label class="f ag-f-hora"><span class="lbl">Termina</span><input class="input" type="time" name="hora_fim" value="${hFim}"></label>
          <label class="f ag-f-rep"><span class="lbl">Repetir</span>
            <select class="select" name="repeticao" ${soEsta ? "disabled" : ""}>
              ${[["nenhuma", "Não repete"], ["semanal", "Toda semana"], ["mensal", "Todo mês"]].map(([v, r]) => `<option value="${v}" ${(c.repeticao || "nenhuma") === v ? "selected" : ""}>${r}</option>`).join("")}
            </select></label>
          <label class="f ag-f-ate"><span class="lbl">Até (opcional)</span><input class="input" type="date" name="repete_ate" value="${c.repete_ate || ""}" ${soEsta ? "disabled" : ""}></label>
          <label class="f"><span class="lbl">Condomínio (opcional)</span>
            <select class="select" name="condominio_id" ${soEsta ? "disabled" : ""}><option value="">Nenhum</option>${condos.map(x => `<option value="${x.id}" ${Number(c.condominio_id) === x.id ? "selected" : ""}>${_agEsc(x.nome)}</option>`).join("")}</select></label>
          <label class="f"><span class="lbl">Responsável (opcional)</span>
            <select class="select" name="responsavel_id"><option value="">Ninguém</option>${equipe.map(u => `<option value="${u.id}" ${respVal === u.id ? "selected" : ""}>${_agEsc(u.nome || u.email)}</option>`).join("")}</select></label>
          <label class="f ag-f-largo"><span class="lbl">Observação</span><textarea class="input" name="descricao" rows="3">${_agEsc(c.descricao || "")}</textarea></label>
          <p class="ag-form-msg" id="agFormMsg" role="status"></p>
        </form>
      </div>
      <div class="ag-form-pe">
        ${item ? `<button class="btn btn-sm ag-apagar" type="button" data-ag-form="apagar">Apagar${rep ? " · " + _agEsc(_agRotAlc(alcance || "todas")) : ""}</button>` : "<span></span>"}
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
      const alc = alcance || "todas";
      if (alc === "todas" && !confirm("Apagar este compromisso" + (rep ? " e todas as repetições?" : "?"))) return;
      _agFecharForm();
      return _agApagar(item, alc);
    }
    // salvar
    const f = form;
    const dia = f.dia.value;
    if (!f.titulo.value.trim() || !dia) { msg.textContent = "Preencha o título e o dia."; return; }
    const di = soEsta ? !!c.dia_inteiro : f.dia_inteiro.checked;
    const inicio = new Date(`${dia}T${di ? "00:00" : (f.hora_ini.value || "09:00")}:00`).toISOString();
    const fimIso = !di && f.hora_fim.value ? new Date(`${dia}T${f.hora_fim.value}:00`).toISOString() : null;
    b.disabled = true;
    msg.textContent = "Salvando…";
    try {
      if (soEsta) {
        await _agGravarMudanca(item, "esta", {
          titulo: f.titulo.value.trim(), inicio, ...(fimIso ? { fim: fimIso } : {}),
          descricao: f.descricao.value.trim() || null, responsavel_id: f.responsavel_id.value || null,
        });
      } else {
        const corpo = {
          titulo: f.titulo.value.trim(),
          dia_inteiro: di, inicio, fim: fimIso,
          repeticao: f.repeticao.value,
          repete_ate: f.repeticao.value !== "nenhuma" && f.repete_ate.value ? f.repete_ate.value : null,
          condominio_id: f.condominio_id.value || null,
          responsavel_id: f.responsavel_id.value || null,
          descricao: f.descricao.value.trim() || null,
        };
        if (!c.chamado_id) corpo.tipo = f.tipo.value;
        if (!item) await _agReq("/agenda/compromissos", "POST", corpo);
        else if (rep && alcance === "proximas") await _agGravarMudanca(item, "proximas", corpo);
        else {
          // ⚠️ Compromisso que repete é UMA linha no banco. Editado a partir de
          // uma ocorrência qualquer (a de março de uma série que começou em
          // janeiro), o "dia" do formulário é o da ocorrência. Se a pessoa não
          // mexeu no dia, a série continua começando onde começava; só hora,
          // título etc. mudam.
          if (rep && c.serie_inicio && dia === _agIso(new Date(c.inicio))) {
            const d0 = _agIso(new Date(c.serie_inicio));
            corpo.inicio = new Date(`${d0}T${di ? "00:00" : (f.hora_ini.value || "09:00")}:00`).toISOString();
            corpo.fim = !di && f.hora_fim.value ? new Date(`${d0}T${f.hora_fim.value}:00`).toISOString() : null;
          }
          await _agReq(`/agenda/compromissos/${c.compromisso_id}`, "PATCH", corpo);
        }
      }
    } catch (err) {
      b.disabled = false;
      msg.textContent = err.message || "Não foi possível salvar.";
      return;
    }
    _agFecharForm();
    _agRef = new Date(`${dia}T12:00:00`);
    await _agDepoisDeGravar();
    _agToast(item ? `Salvo${rep ? " (" + _agRotAlc(alcance || "todas") + ")" : ""}: ${f.titulo.value.trim()}` : `Criado: ${f.titulo.value.trim()}`);
  });
}

// ── o faturamento do Omie ──────────────────────────────────────────────────

async function _agAbrirFaturamento(comp) {
  // Desde a fase 2 do Omie (20/11/2026) o painel do mês é o LOTE do
  // faturamento (admin-faturamento-lote.js): o mesmo retrato, mais conferir,
  // tirar e confirmar. O painel abaixo fica só se aquele script não carregar.
  if (window.GBLote) return window.GBLote.abrir(comp);
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
  const root = document.getElementById("agRoot");
  root?.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-ag-nav]");
    if (nav) {
      const v = nav.dataset.agNav;
      if (v === "hoje") _agRef = new Date();
      else {
        const n = Number(v);
        if (_agVista === "mes") _agRef = new Date(_agRef.getFullYear(), _agRef.getMonth() + n, 1);
        else _agRef = _agSomaDias(_agRef, n * (_agVista === "semana" || _agVista === "quadro" ? 7 : 30));
      }
      return _agCarregar();
    }
    const vista = e.target.closest("[data-ag-vista]");
    if (vista) { _agVista = vista.dataset.agVista; return _agCarregar(); }
    const novo = e.target.closest("[data-ag-novo]");
    if (novo) return _agAbrirForm(novo.dataset.agNovo, null);
    const irDia = e.target.closest("[data-ag-ir-dia]");
    if (irDia) { _agRef = new Date(irDia.dataset.agIrDia + "T12:00:00"); _agVista = "semana"; return _agCarregar(); }
    // O Quadro trata os próprios itens e células (admin-despacho.js).
    if (_agVista === "quadro") return;
    const ck = e.target.closest("[data-ag-ck]");
    if (ck) { e.stopPropagation(); _agFecharPops(); return _agAlternarFeito(ck.dataset.agCk); }
    const el = e.target.closest("[data-ag-item]");
    if (el) return _agCartao(el.dataset.agItem, el);
    // Clique no espaço de um dia (Semana, Mês): criar rápido nele.
    const cel = e.target.closest("[data-ag-cel]");
    if (cel && !document.body.classList.contains("role-viewer")) return _agNovoRapido(cel.dataset.agCel, cel);
  });
  root?.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-ag-item]")) { e.preventDefault(); e.target.click(); }
  });
  // Fora de um pop: fecha. (O Quadro abre os mesmos pops.)
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest(".dq-pop, [data-ag-item], [data-ag-cel], [data-dq-item], [data-dq-drop], [data-dq-agendar], [data-dq-acao], [data-ag-remarcar]")) return;
    _agFecharPops();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".dq-pop")) return _agFecharPops();
    if (document.getElementById("agOverlay")) _agFecharForm();
  });
}

(function _agLigar() {
  const orig = window.showSection;
  if (typeof orig !== "function") return;
  window.showSection = function (name, ...resto) {
    const r = orig.call(this, name, ...resto);
    if (name === "agenda") { _agBindEventos(); _agCarregar(); _agGarantirEquipe(); }
    return r;
  };
})();
