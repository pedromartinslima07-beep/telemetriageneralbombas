// ============================================================
// FICHA DO CONDOMÍNIO + ENDEREÇO POR TELA  (redesenho, fase 1 e 2 — 18/11/2026)
// ============================================================
//
// Plano em docs/modulos/redesenho-admin.md. Este arquivo roda DEPOIS do
// admin.js (os dois são `defer`, a ordem do HTML vale) e usa os globais dele:
// _condominios, _statusData, _chamadosData, _osData, _avData, _usuariosData,
// _conversasData e as funções de abrir modal. Não importa nada do operador.
//
// ⚠️ A ficha NÃO tem modal próprio. Cada documento abre no modal que já
// existe (O.S. → abrirOSDetalhe, orçamento → _orcAbrirDaBancada, contrato →
// _ctrAbrirModal). Duplicar modal é o que fez o admin ter dois modais de
// orçamento até 02/09/2026 (ver painel-admin.md).
//
// ⚠️ A ficha se redesenha quando o admin redesenha as listas dele. Toda ação
// que grava já chama _osRenderTabela / _avRenderTudo / renderChamados /
// _ctrRefrescarListas no sucesso (regra de 09/10/2026); os ganchos no fim deste
// arquivo pegam carona nessas chamadas. Sem eles, salvar uma O.S. pela ficha
// deixaria a ficha mentindo até um F5.

// ===== ENDEREÇO POR TELA =====
//
// #/ordens-servico                  → seção
// #/condominios/12                  → ficha, aba Resumo
// #/condominios/12/orcamentos       → ficha, aba Orçamentos
//
// O hash é escrito por showSection (gancho _rotaAoMostrar, chamado no fim
// dela) e lido no boot e no hashchange. A flag evita o eco: quando é o
// roteador que mostra a seção, ele não reescreve o hash que acabou de ler.

let _rotaAplicando = false;

function _rotaPermitida(secao) {
  // O perfil operador não vê 10 das 15 seções (e as rotas delas dão 403).
  // A nav já esconde o que ele não vê; o endereço obedece a nav.
  // A ficha e a página da O.S. não têm item próprio: valem as da lista.
  const alvo = secao === "condominio" ? "cadastros"
    : secao === "os-detalhe" ? "ordens-servico"
    : secao === "orcamento-detalhe" ? "orcamentos"
    : secao === "contrato-detalhe" ? "contratos"
    : secao === "chamado-detalhe" ? "chamados" : secao;
  const nav = document.querySelector(`.nav-item[data-section="${alvo}"]`);
  if (!nav) return false;
  return nav.style.display !== "none" && getComputedStyle(nav).display !== "none";
}

function _rotaAoMostrar(nome) {
  if (_rotaAplicando) return;
  if (nome === "condominio" || nome === "os-detalhe" || nome === "orcamento-detalhe"
      || nome === "contrato-detalhe" || nome === "chamado-detalhe") return; // escrevem o próprio endereço
  const novo = `#/${nome}`;
  if (location.hash !== novo) history.pushState(null, "", novo);
}

function _rotaLer() {
  const partes = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!partes.length) return null;
  if (partes[0] === "os" && partes[1]) {
    return { secao: "os-detalhe", osId: Number(partes[1]) };
  }
  // #/orcamentos/58 → página do orçamento. "novo" não tem o que reabrir.
  if (partes[0] === "orcamentos" && partes[1]) {
    return { secao: "orcamento-detalhe", orcId: partes[1] === "novo" ? null : Number(partes[1]) };
  }
  // #/contratos/12 e #/chamados/950 → páginas próprias (19/11/2026).
  if (partes[0] === "contratos" && partes[1]) {
    return { secao: "contrato-detalhe", ctrId: partes[1] === "novo" ? null : Number(partes[1]) };
  }
  if (partes[0] === "chamados" && partes[1]) {
    return { secao: "chamado-detalhe", chId: Number(partes[1]) };
  }
  if (partes[0] === "condominios" && partes[1]) {
    return { secao: "condominio", condoId: Number(partes[1]), aba: partes[2] || "resumo" };
  }
  return { secao: partes[0] };
}

function _rotaAplicar() {
  const r = _rotaLer();
  if (!r) return;
  if (!_rotaPermitida(r.secao)) return;
  if (!document.querySelector(`.section[data-section="${r.secao}"]`)) return;
  if (r.secao === "condominio") {
    if (!Number.isInteger(r.condoId) || r.condoId <= 0) return;
    _cfMostrar(r.condoId, r.aba);
    return;
  }
  if (r.secao === "os-detalhe") {
    if (!Number.isInteger(r.osId) || r.osId <= 0) return;
    const naPagina = document.querySelector('.section[data-section="os-detalhe"].is-active');
    if (!naPagina || _osSelecionadaId !== r.osId) abrirOSDetalhe(r.osId, { daRota: true });
    return;
  }
  if (r.secao === "orcamento-detalhe") {
    const naPagina = document.querySelector('.section[data-section="orcamento-detalhe"].is-active');
    if (!Number.isInteger(r.orcId) || r.orcId <= 0) {
      // F5 num orçamento novo que nunca foi gravado: não há o que reabrir.
      if (naPagina) return;
      history.replaceState(null, "", "#/orcamentos");
      _rotaAplicando = true;
      try { showSection("orcamentos"); } finally { _rotaAplicando = false; }
      return;
    }
    if (!naPagina || _avSelecionado?.id !== r.orcId) _avAbrirPelaRota(r.orcId);
    return;
  }
  if (r.secao === "contrato-detalhe") {
    const naPagina = _ctrNaPagina();
    if (!Number.isInteger(r.ctrId) || r.ctrId <= 0) {
      // F5 num contrato novo que nunca foi gravado: não há o que reabrir.
      if (naPagina) return;
      history.replaceState(null, "", "#/contratos");
      _rotaAplicando = true;
      try { showSection("contratos"); } finally { _rotaAplicando = false; }
      return;
    }
    if (!naPagina || _ctrIdPagina !== r.ctrId) _ctrAbrirPelaRota(r.ctrId);
    return;
  }
  if (r.secao === "chamado-detalhe") {
    if (!Number.isInteger(r.chId) || r.chId <= 0) return;
    if (!_chNaPagina() || _chPaginaId !== r.chId) _chAbrirPagina(r.chId, { daRota: true });
    return;
  }
  _rotaAplicando = true;
  try { showSection(r.secao); } finally { _rotaAplicando = false; }
}

window.addEventListener("hashchange", _rotaAplicar);
window.addEventListener("popstate", _rotaAplicar);

// ===== FICHA =====

const _CF_ABAS = [
  { id: "resumo",       rotulo: "Resumo" },
  { id: "telemetria",   rotulo: "Telemetria" },
  { id: "chamados",     rotulo: "Chamados" },
  { id: "atendimento",  rotulo: "WhatsApp", soComWhatsapp: true },
  { id: "os",           rotulo: "O.S.",             soGestao: true },
  { id: "orcamentos",   rotulo: "Orçamentos",       soGestao: true },
  { id: "notas",        rotulo: "Notas fiscais",    soGestao: true },
  { id: "contrato",     rotulo: "Contrato e preventiva", soGestao: true },
  { id: "equipamentos", rotulo: "Equipamentos",     soGestao: true },
  { id: "contatos",     rotulo: "Contatos" },
];

// ⚠️ O PERFIL OPERADOR CHEGA NA FICHA (fase 5, 18/11/2026). Ele não tem a
// tela Condomínios, mas os botões "ver condomínio" de Alertas, do mapa e da
// ficha do chamado abrem a ficha. As rotas de O.S., orçamento, contrato,
// plano e equipamento são `gestaoOnly` e respondem 403 para ele. Quem
// escondia isso era a gaveta antiga, que saiu; agora é aqui: aba `soGestao`
// some, a busca não sai, e o cabeçalho não afirma "Sem contrato" sobre um
// dado que ele não pode ler.
function _cfGestao() {
  return typeof _isOperador === "undefined" || !_isOperador;
}
function _cfAbaVisivel(a) {
  if (a.soComWhatsapp && !_cfTemWhatsapp()) return false;
  if (a.soGestao && !_cfGestao()) return false;
  return true;
}

let _cfCondoId = null;
let _cfAba = "resumo";
// O que não mora em global do admin vem por condomínio, com a hora da busca.
// { condoId, contratos, planos, equipamentos, buscadoEm, erro }
let _cfExtra = null;
let _cfBuscando = null;

function abrirFichaCondominio(condoId, aba) {
  const id = Number(condoId);
  if (!id) return;
  const destino = `#/condominios/${id}${aba && aba !== "resumo" ? "/" + aba : ""}`;
  if (location.hash === destino) { _cfMostrar(id, aba || "resumo"); return; }
  history.pushState(null, "", destino);
  _cfMostrar(id, aba || "resumo");
}

function _cfEsc(s) { return _waEscaparHtml(s == null ? "" : String(s)); }

function _cfData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function _cfMoeda(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function _cfCondo() {
  return (Array.isArray(_condominios) ? _condominios : []).find(c => Number(c.id) === _cfCondoId) || null;
}

function _cfTemWhatsapp() {
  const nav = document.querySelector('.nav-item[data-section="whatsapp"]');
  return !!nav && nav.style.display !== "none";
}

async function _cfEsperarCadastro() {
  // No boot com o endereço já na ficha, o carregarTudo ainda não voltou.
  for (let i = 0; i < 60 && !(Array.isArray(_condominios) && _condominios.length); i++) {
    await new Promise(r => setTimeout(r, 150));
  }
}

async function _cfMostrar(condoId, aba) {
  const trocouPredio = _cfCondoId !== condoId;
  _cfCondoId = condoId;
  const pedida = _CF_ABAS.find(a => a.id === aba);
  _cfAba = pedida && _cfAbaVisivel(pedida) ? aba : "resumo";

  _rotaAplicando = true;
  try { showSection("condominio"); } finally { _rotaAplicando = false; }
  // A ficha é a casa do item "Clientes" na nav (vira "Condomínios" na fase 3).
  document.querySelector('.nav-item[data-section="cadastros"]')?.classList.add("active");

  if (trocouPredio) {
    _cfExtra = null;
    document.getElementById("cfRoot").innerHTML = `<div class="cf-carregando">Carregando condomínio…</div>`;
    document.querySelector(".main")?.scrollTo?.(0, 0);
  }
  await _cfEsperarCadastro();
  const c = _cfCondo();
  const t1 = document.getElementById("topbarTitle");
  const t2 = document.getElementById("topbarTitleDesktop");
  const titulo = c ? (c.nome_fantasia || c.nome) : "Condomínio";
  if (t1) t1.textContent = titulo;
  if (t2) t2.textContent = titulo;

  _cfRender();
  // Trocar de aba não busca de novo: só abrir o prédio, ou dado com mais de
  // 1 min. O que grava avisa pelos ganchos do fim do arquivo.
  const velho = !_cfExtra || _cfExtra.condoId !== condoId || Date.now() - _cfExtra.buscadoEm > 60000;
  if (trocouPredio || velho) _cfGarantirDados();
}

// Busca o que falta. As três coleções globais do admin são carregadas UMA vez
// (o admin as mantém em dia depois); as três por condomínio, a cada abertura.
async function _cfGarantirDados({ forcar = false } = {}) {
  const id = _cfCondoId;
  if (!id) return;
  if (_cfBuscando === id && !forcar) return;
  if (!_cfGestao()) {
    // Operador: nada do que esta função busca é dele (ver _cfGestao).
    _cfExtra = { condoId: id, contratos: [], planos: [], equipamentos: [], buscadoEm: Date.now() };
    return;
  }
  _cfBuscando = id;
  try {
    const tarefas = [];
    if (typeof _osLoaded !== "undefined" && !_osLoaded) tarefas.push(carregarOrdensServico());
    if (!Array.isArray(_avData) || !_avData.length) tarefas.push(carregarAvulsos());
    const extra = (async () => {
      const h = { headers: authHeaders() };
      const [rc, rp, re] = await Promise.all([
        fetch(`/contratos?condominio_id=${id}`, h),
        fetch(`/planos-manutencao?condominio_id=${id}`, h),
        fetch(`/equipamentos?condominio_id=${id}&limit=500`, h),
      ]);
      const ler = async (r, nome) => {
        if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
        return r.json();
      };
      const [contratos, planos, equipamentos] = await Promise.all([
        ler(rc, "contratos"), ler(rp, "planos"), ler(re, "equipamentos"),
      ]);
      return { condoId: id, contratos, planos, equipamentos, buscadoEm: Date.now() };
    })().catch(e => ({ condoId: id, contratos: [], planos: [], equipamentos: [], erro: e.message, buscadoEm: Date.now() }));
    tarefas.push(extra.then(x => { if (_cfCondoId === id) _cfExtra = x; }));
    await Promise.all(tarefas);
  } catch (e) {
    console.error("[ficha] _cfGarantirDados:", e);
  } finally {
    if (_cfBuscando === id) _cfBuscando = null;
  }
  if (_cfCondoId === id) _cfRender();
}

// ----- dados do prédio, todos filtrados das coleções que o admin já tem -----

function _cfDados() {
  const id = _cfCondoId;
  const mesmo = x => Number(x?.condominio_id) === id;
  const status = (_statusData || []).find(g => Number(g.condominio?.id) === id) || null;
  const chamados = (Array.isArray(_chamadosData) ? _chamadosData : []).filter(mesmo)
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  const os = (Array.isArray(_osData) ? _osData : []).filter(mesmo)
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  const orcamentos = (Array.isArray(_avData) ? _avData : []).filter(mesmo)
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  const notas = orcamentos.filter(o => o.nota_status);
  const conversas = (Array.isArray(_conversasData) ? _conversasData : []).filter(mesmo);
  const reps = (Array.isArray(_usuariosData) ? _usuariosData : []).filter(mesmo);
  const ex = _cfExtra && _cfExtra.condoId === id ? _cfExtra : null;
  return {
    status, chamados, os, orcamentos, notas, conversas, reps,
    reservs: Array.isArray(status?.reservatorios) ? status.reservatorios : [],
    contratos: ex?.contratos || [],
    planos: ex?.planos || [],
    equipamentos: ex?.equipamentos || [],
    extraCarregado: !!ex,
    extraErro: ex?.erro || null,
  };
}

function _cfContagem(d, aba) {
  switch (aba) {
    case "telemetria":   return d.reservs.length;
    case "chamados":     return d.chamados.filter(ch => _chEmAberto(ch.status)).length;
    case "atendimento":  return d.conversas.filter(cv => cv.status === "aberta").length;
    case "os":           return d.os.length;
    case "orcamentos":   return d.orcamentos.length;
    case "notas":        return d.notas.length;
    case "contrato":     return d.extraCarregado ? d.contratos.filter(c => c.ativo).length : null;
    case "equipamentos": return d.extraCarregado ? d.equipamentos.length : null;
    case "contatos":     return d.reps.length;
    default:             return null;
  }
}

// ----- render -----

function _cfRender() {
  const root = document.getElementById("cfRoot");
  if (!root) return;
  const c = _cfCondo();
  if (!c) {
    root.innerHTML = `<div class="cf-vazio-pagina">
      <p>Este condomínio não está no cadastro, ou foi apagado.</p>
      <button class="btn btn-sm" data-cf-acao="voltar-lista">Voltar para a lista</button>
    </div>`;
    return;
  }
  const d = _cfDados();
  root.innerHTML = _cfRenderCabecalho(c, d) + _cfRenderAbas(d) +
    `<div class="cf-pane" id="cfPane">${_cfRenderPane(c, d)}</div>`;
}

function _cfRenderCabecalho(c, d) {
  const nome = c.nome_fantasia || c.nome || "Sem nome";
  const razao = c.nome_fantasia && c.nome && c.nome_fantasia !== c.nome ? c.nome : "";
  const local = [c.bairro, c.cidade && (c.cidade + (c.uf ? "/" + c.uf : ""))].filter(Boolean).join(" · ");

  // Os fatos do cabeçalho são FRASES, não cartões de KPI: o que se quer saber
  // de um prédio ao abrir a ficha cabe em três linhas de leitura.
  const fatos = [];

  if (d.reservs.length) {
    const offline = d.reservs.filter(r => r.offline).length;
    const pcts = d.reservs.map(r => r.ultima_leitura?.nivel_pct).filter(v => v != null);
    const menor = pcts.length ? Math.min(...pcts) : null;
    const bombaOn = d.reservs.some(r => r.ultima_leitura?.bomba_ligada === true);
    let cls = "is-ok", txt;
    if (offline) { cls = "is-risco"; txt = `${offline} de ${d.reservs.length} sem sinal`; }
    else if (menor != null && menor < 20) { cls = "is-risco"; txt = `Nível crítico, ${menor}%`; }
    else if (menor != null && menor < 45) { cls = "is-atencao"; txt = `Nível baixo, ${menor}%`; }
    else txt = menor != null ? `Nível ${menor}%${d.reservs.length > 1 ? " no menor" : ""}` : "Sem leitura";
    fatos.push(`<button class="cf-fato ${cls}" data-cf-aba="telemetria">
      <span class="cf-fato-lbl">Água</span><span class="cf-fato-val">${_cfEsc(txt)}${bombaOn ? " · bomba ligada" : ""}</span></button>`);
  } else {
    fatos.push(`<span class="cf-fato is-neutro"><span class="cf-fato-lbl">Água</span><span class="cf-fato-val">Sem telemetria</span></span>`);
  }

  const abertos = d.chamados.filter(ch => _chEmAberto(ch.status));
  const p1p2 = abertos.filter(ch => ch.prioridade === "p1" || ch.prioridade === "p2").length;
  fatos.push(`<button class="cf-fato ${p1p2 ? "is-risco" : abertos.length ? "is-atencao" : "is-ok"}" data-cf-aba="chamados">
    <span class="cf-fato-lbl">Chamados</span>
    <span class="cf-fato-val">${abertos.length ? `${abertos.length} em aberto${p1p2 ? ` · ${p1p2} urgente${p1p2 > 1 ? "s" : ""}` : ""}` : "Nenhum em aberto"}</span></button>`);

  let ctrTxt = "Carregando…", ctrCls = "is-neutro";
  if (d.extraCarregado) {
    const vig = d.contratos.find(x => x.ativo);
    if (!vig) { ctrTxt = "Sem contrato"; ctrCls = "is-neutro"; }
    else {
      const dias = vig.dias_para_vencer;
      const fim = vig.fim_em ? `até ${_cfData(vig.fim_em)}` : "sem fim";
      ctrTxt = `${_ctrTipoLabel[vig.tipo] || vig.tipo || "Contrato"} ${fim}${Number(vig.valor_mensal) ? " · " + _cfMoeda(vig.valor_mensal) : ""}`;
      ctrCls = dias != null && dias <= 30 ? "is-atencao" : "is-ok";
    }
  }
  if (_cfGestao()) {
    fatos.push(`<button class="cf-fato ${ctrCls}" data-cf-aba="contrato">
    <span class="cf-fato-lbl">Contrato</span><span class="cf-fato-val">${_cfEsc(ctrTxt)}</span></button>`);
  }

  return `<header class="cf-head">
    <div class="cf-head-top">
      <button class="cf-voltar" data-cf-acao="voltar-lista" aria-label="Voltar para a lista de condomínios">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        Condomínios
      </button>
      <div class="cf-head-acoes viewer-only-hide">
        <button class="btn btn-sm" data-cf-acao="novo-chamado">Abrir chamado</button>
        ${_cfGestao() ? `<button class="btn btn-sm" data-action="editar-condominio" data-id="${c.id}">Editar cadastro</button>` : ""}
        ${_cfGestao() ? (c.ativo === false
          ? `<button class="btn btn-sm" data-action="reativar-condominio" data-id="${c.id}">Reativar</button>`
          : `<button class="btn btn-sm cf-inativar" data-action="inativar-condominio" data-id="${c.id}" data-nome="${_cfEsc(nome)}">Inativar</button>`) : ""}
      </div>
    </div>
    <h1 class="cf-nome">${_cfEsc(nome)}${c.ativo === false ? ` <span class="cf-inativo">Inativo</span>` : ""}</h1>
    ${razao || local ? `<p class="cf-sub">${[razao, local].filter(Boolean).map(_cfEsc).join(" · ")}</p>` : ""}
    <div class="cf-fatos">${fatos.join("")}</div>
  </header>`;
}

function _cfRenderAbas(d) {
  const abas = _CF_ABAS.filter(_cfAbaVisivel);
  return `<nav class="cf-abas wa-tabs" role="tablist" aria-label="Seções do condomínio">${abas.map(a => {
    const n = _cfContagem(d, a.id);
    const ativo = a.id === _cfAba;
    return `<button class="wa-tab${ativo ? " is-active" : ""}" role="tab" aria-selected="${ativo}" data-cf-aba="${a.id}">
      ${_cfEsc(a.rotulo)}${n ? ` <span class="wa-count">${n}</span>` : ""}</button>`;
  }).join("")}</nav>`;
}

function _cfRenderPane(c, d) {
  switch (_cfAba) {
    case "telemetria":   return _cfPaneTelemetria(d);
    case "chamados":     return _cfPaneChamados(d);
    case "atendimento":  return _cfPaneAtendimento(d);
    case "os":           return _cfPaneOS(d);
    case "orcamentos":   return _cfPaneOrcamentos(d);
    case "notas":        return _cfPaneNotas(d);
    case "contrato":     return _cfPaneContrato(c, d);
    case "equipamentos": return _cfPaneEquipamentos(d);
    case "contatos":     return _cfPaneContatos(c, d);
    default:             return _cfPaneResumo(c, d);
  }
}

function _cfVazio(txt, acao) {
  return `<div class="cf-vazio"><p>${txt}</p>${acao || ""}</div>`;
}

function _cfTabela(cabecalho, linhas) {
  return `<div class="tableWrap cf-tabela"><table>
    <thead><tr>${cabecalho.map(h => `<th${h.num ? ' class="cf-num"' : ""}>${h.t}</th>`).join("")}</tr></thead>
    <tbody>${linhas.join("")}</tbody>
  </table></div>`;
}

function _cfSelo(txt, tom) {
  // tom: ok | atencao | risco | neutro — mesma gramática do selo do admin
  return `<span class="cf-selo is-${tom}">${_cfEsc(txt)}</span>`;
}

const _CF_PRIO = { p1: "P1 Crítico", p2: "P2 Alta", p3: "P3 Controlado", p4: "P4 Agendado" };
const _CF_CH_ST = { aberto: "Aberto", em_atendimento: "Em atendimento", fechado: "Resolvido", cancelado: "Cancelado" };

// ----- Resumo: o que pede ação + a história, em ordem -----

function _cfPaneResumo(c, d) {
  const pend = [];

  for (const r of d.reservs) {
    const pct = r.ultima_leitura?.nivel_pct;
    if (r.offline) pend.push({ tom: "risco", txt: `${r.nome || "Reservatório"} sem sinal`, aba: "telemetria" });
    else if (pct != null && pct < 45) pend.push({ tom: pct < 20 ? "risco" : "atencao", txt: `${r.nome || "Reservatório"} em ${pct}%`, aba: "telemetria" });
  }
  for (const ch of d.chamados.filter(x => _chEmAberto(x.status))) {
    pend.push({
      tom: ch.prioridade === "p1" || ch.prioridade === "p2" ? "risco" : "atencao",
      txt: `${_CF_PRIO[ch.prioridade] || "Chamado"}: ${ch.titulo || "Chamado #" + ch.id}`,
      chamado: ch.id,
    });
  }
  for (const o of d.orcamentos.filter(_avPendente)) {
    pend.push({ tom: "atencao", txt: `${o.status === "rejeitado" ? "Recusado" : "Aprovado"} pelo cliente, sem baixa: ${o.numero || "orçamento"}`, orc: o.id });
  }
  for (const o of d.orcamentos.filter(o => o.status === "aprovado" && !o.nota_status)) {
    pend.push({ tom: "neutro", txt: `Aprovado sem nota fiscal: ${o.numero || "orçamento"}`, orc: o.id });
  }
  for (const o of d.os.filter(_osFaltaEnviar)) {
    pend.push({ tom: "atencao", txt: `O.S. ${o.numero || "#" + o.id} finalizada e não enviada ao cliente`, os: o.id });
  }
  const vig = d.contratos.find(x => x.ativo);
  if (vig && vig.dias_para_vencer != null && vig.dias_para_vencer <= 30) {
    pend.push({ tom: "atencao", txt: vig.dias_para_vencer < 0 ? "Contrato vencido" : `Contrato vence em ${vig.dias_para_vencer} dia${vig.dias_para_vencer === 1 ? "" : "s"}`, contrato: vig.id });
  }

  const ordemTom = { risco: 0, atencao: 1, neutro: 2 };
  pend.sort((a, b) => ordemTom[a.tom] - ordemTom[b.tom]);

  const pendHtml = pend.length
    ? `<ul class="cf-pend">${pend.map(p => `<li>
        <button class="cf-pend-item is-${p.tom}"
          ${p.aba ? `data-cf-aba="${p.aba}"` : ""}${p.chamado ? `data-cf-chamado="${p.chamado}"` : ""}${p.orc ? `data-cf-orc="${p.orc}"` : ""}${p.os ? `data-cf-os="${p.os}"` : ""}${p.contrato ? `data-cf-contrato="${p.contrato}"` : ""}>
          <span class="cf-pend-ponto" aria-hidden="true"></span>${_cfEsc(p.txt)}
        </button></li>`).join("")}</ul>`
    : `<p class="cf-tudo-ok">Nada pendente neste prédio.</p>`;

  // A linha do tempo junta os documentos que hoje moram em cinco telas.
  const ev = [];
  for (const ch of d.chamados) ev.push({ em: ch.criado_em, tipo: "Chamado", txt: ch.titulo || `Chamado #${ch.id}`, sel: _cfSelo(_CF_CH_ST[ch.status] || ch.status, _chEmAberto(ch.status) ? "atencao" : "neutro"), attr: `data-cf-chamado="${ch.id}"` });
  for (const o of d.os) {
    ev.push({ em: o.finalizada_em || o.criado_em, tipo: "O.S.", txt: `${o.numero || "#" + o.id}${o.tecnico_nome ? " · " + o.tecnico_nome : ""}`, sel: _cfSelo(o.finalizada_em ? (o.enviado_em ? "Enviada" : "Finalizada") : "Rascunho", o.finalizada_em ? "ok" : "neutro"), attr: `data-cf-os="${o.id}"` });
  }
  for (const o of d.orcamentos) {
    ev.push({ em: o.respondido_em || o.criado_em, tipo: "Orçamento", txt: `${o.numero || "—"} · ${_cfMoeda(o.valor_total)}`, sel: _cfSelo(_cfOrcStatus(o.status), _cfOrcTom(o.status)), attr: `data-cf-orc="${o.id}"` });
  }
  for (const o of d.notas) {
    const quando = o.nota_emitida_em || o.nota_solicitada_em;
    if (!quando) continue;
    ev.push({ em: quando, tipo: "Nota", txt: `${o.nota_tipo === "nfe" ? "DANFE" : "NFS-e"}${o.nota_numero ? " nº " + o.nota_numero : ""} · ${o.numero || ""}`, sel: _cfSelo(o.nota_status === "emitida" ? "Emitida" : o.nota_status === "erro" ? "Erro" : "Processando", o.nota_status === "emitida" ? "ok" : o.nota_status === "erro" ? "risco" : "atencao"), attr: `data-cf-orc="${o.id}"` });
  }
  for (const ct of d.contratos) {
    if (ct.inicio_em) ev.push({ em: ct.inicio_em, tipo: "Contrato", txt: `${_ctrTipoLabel[ct.tipo] || ct.tipo || ""}${ct.numero ? " · " + ct.numero : ""}`, sel: _cfSelo(ct.ativo ? "Vigente" : "Encerrado", ct.ativo ? "ok" : "neutro"), attr: `data-cf-contrato="${ct.id}"` });
  }
  ev.sort((a, b) => new Date(b.em) - new Date(a.em));
  const MAX = 25;
  const tl = ev.slice(0, MAX);

  const tlHtml = tl.length
    ? `<ol class="cf-tl">${tl.map(e => `<li>
        <button class="cf-tl-item" ${e.attr}>
          <span class="cf-tl-data">${_cfData(e.em)}</span>
          <span class="cf-tl-tipo">${e.tipo}</span>
          <span class="cf-tl-txt">${_cfEsc(e.txt)}</span>
          ${e.sel}
        </button></li>`).join("")}</ol>
      ${ev.length > MAX ? `<p class="cf-nota">Mostrando os ${MAX} mais recentes de ${ev.length}. As abas têm a lista inteira.</p>` : ""}`
    : _cfVazio("Nenhum chamado, O.S., orçamento ou contrato registrado ainda.");

  return `<div class="cf-resumo">
    <section class="cf-bloco">
      <h2 class="cf-h2">Pede atenção</h2>
      ${pendHtml}
    </section>
    <section class="cf-bloco">
      <h2 class="cf-h2">Histórico</h2>
      ${tlHtml}
    </section>
  </div>`;
}

function _cfOrcStatus(s) {
  return { aprovado: "Aprovado", rejeitado: "Recusado", enviado: "Enviado", rascunho: "Rascunho" }[s] || s || "—";
}
function _cfOrcTom(s) {
  return s === "aprovado" ? "ok" : s === "rejeitado" ? "risco" : s === "enviado" ? "atencao" : "neutro";
}

// ----- Telemetria -----

function _cfPaneTelemetria(d) {
  if (!d.reservs.length) return _cfVazio("Este prédio não tem reservatório monitorado.");
  const cards = d.reservs.map(r => {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    const tom = r.offline ? "risco" : pct == null ? "neutro" : pct < 20 ? "risco" : pct < 45 ? "atencao" : "ok";
    const bomba = u?.bomba_ligada === true ? "Bomba ligada" : u?.bomba_ligada === false ? "Bomba desligada" : "Bomba sem leitura";
    return `<div class="cf-res">
      <div class="cf-res-top">
        <span class="cf-res-nome">${_cfEsc(r.nome || "Reservatório")}</span>
        ${r.offline ? _cfSelo("Sem sinal", "risco") : ""}
      </div>
      <div class="cf-res-nivel is-${tom}">${pct != null ? pct + "%" : "—"}</div>
      <div class="cf-res-barra" role="img" aria-label="Nível ${pct != null ? pct + "%" : "desconhecido"}"><span class="is-${tom}" style="width:${Math.max(0, Math.min(100, pct ?? 0))}%"></span></div>
      <div class="cf-res-meta">${bomba} · leitura ${u?.criado_em ? _tempoRelativo(u.criado_em) : "—"}</div>
    </div>`;
  }).join("");
  return `<div class="cf-res-grid">${cards}</div>
    <div class="cf-rodape"><button class="btn btn-sm" data-action="ir-telemetria-condo" data-condo-id="${_cfCondoId}">Abrir histórico de nível</button></div>`;
}

// ----- Chamados -----

function _cfPaneChamados(d) {
  if (!d.chamados.length) return _cfVazio("Nenhum chamado neste prédio.");
  const linhas = d.chamados.map(ch => `<tr class="cf-linha" data-cf-chamado="${ch.id}" tabindex="0">
    <td class="cf-num">${ch.id}</td>
    <td><div class="cf-l1">${_cfEsc(ch.titulo || "Chamado #" + ch.id)}</div>${ch.tecnico_nome ? `<div class="cf-l2">${_cfEsc(ch.tecnico_nome)}</div>` : ""}</td>
    <td>${_cfEsc(_CF_PRIO[ch.prioridade] || ch.prioridade || "—")}</td>
    <td>${_cfSelo(_CF_CH_ST[ch.status] || ch.status, _chEmAberto(ch.status) ? "atencao" : "neutro")}</td>
    <td>${_cfData(ch.criado_em)}</td>
  </tr>`);
  return _cfTabela([{ t: "Nº", num: true }, { t: "Chamado" }, { t: "Prioridade" }, { t: "Situação" }, { t: "Aberto em" }], linhas);
}

// ----- WhatsApp -----

function _cfPaneAtendimento(d) {
  if (!d.conversas.length) return _cfVazio("Nenhuma conversa de WhatsApp com este prédio.");
  const linhas = d.conversas.map(cv => `<tr class="cf-linha" data-cf-conversa="${cv.id}" tabindex="0">
    <td><div class="cf-l1">${_cfEsc(cv.contato_nome || cv.telefone || "Contato")}</div></td>
    <td>${_cfSelo(cv.status === "aberta" ? "Aberta" : "Encerrada", cv.status === "aberta" ? "atencao" : "neutro")}</td>
    <td>${cv.atualizado_em || cv.criado_em ? _tempoRelativo(cv.atualizado_em || cv.criado_em) : "—"}</td>
  </tr>`);
  return _cfTabela([{ t: "Contato" }, { t: "Situação" }, { t: "Última mensagem" }], linhas);
}

// ----- O.S. -----

function _cfPaneOS(d) {
  if (typeof _osLoaded !== "undefined" && !_osLoaded) return `<div class="cf-carregando">Carregando O.S.…</div>`;
  if (!d.os.length) return _cfVazio("Nenhuma O.S. registrada neste prédio.");
  const linhas = d.os.map(o => {
    const sit = !o.finalizada_em ? _cfSelo("Rascunho", "neutro")
      : o.enviado_em ? _cfSelo("Enviada", "ok")
      : _osFaltaEnviar(o) ? _cfSelo("A enviar", "atencao")
      : _cfSelo("Finalizada", "ok");
    return `<tr class="cf-linha" data-cf-os="${o.id}" tabindex="0">
      <td class="cf-num">${_cfEsc(o.numero || o.id)}</td>
      <td><div class="cf-l1">${_cfEsc(o.tipos_servico || "—")}</div>${o.tecnico_nome ? `<div class="cf-l2">${_cfEsc(o.tecnico_nome)}</div>` : ""}</td>
      <td>${sit}</td>
      <td>${_cfData(o.criado_em)}</td>
    </tr>`;
  });
  return _cfTabela([{ t: "Número", num: true }, { t: "Serviço" }, { t: "Situação" }, { t: "Criada em" }], linhas);
}

// ----- Orçamentos -----

function _cfPaneOrcamentos(d) {
  const novo = `<button class="btn btn-sm btnAccent viewer-only-hide" data-cf-acao="novo-orcamento">Novo orçamento</button>`;
  if (!d.orcamentos.length) return _cfVazio("Nenhum orçamento para este prédio.", novo);
  const linhas = d.orcamentos.map(o => `<tr class="cf-linha" data-cf-orc="${o.id}" tabindex="0">
    <td class="cf-num">${_cfEsc(o.numero || "—")}</td>
    <td><div class="cf-l1">${_cfEsc(_avTipoLabels?.[o.tipo] || "Peças e serviço")}</div>
      ${_avPendente(o) ? `<div class="cf-l2 is-atencao">Resposta do cliente sem baixa</div>` : ""}</td>
    <td>${_cfSelo(_cfOrcStatus(o.status), _cfOrcTom(o.status))}</td>
    <td class="cf-num">${_cfMoeda(o.valor_total)}</td>
    <td>${_cfData(o.criado_em)}</td>
  </tr>`);
  return `<div class="cf-barra">${novo}</div>` +
    _cfTabela([{ t: "Número", num: true }, { t: "Tipo" }, { t: "Situação" }, { t: "Valor", num: true }, { t: "Criado em" }], linhas);
}

// ----- Notas fiscais (moram no orçamento: uma nota por orçamento) -----

function _cfPaneNotas(d) {
  const semNota = d.orcamentos.filter(o => o.status === "aprovado" && !o.nota_status).length;
  const aviso = semNota ? `<p class="cf-nota">${semNota} orçamento${semNota > 1 ? "s aprovados" : " aprovado"} ainda sem nota. A nota é emitida pela ficha do orçamento.</p>` : "";
  if (!d.notas.length) return _cfVazio("Nenhuma nota fiscal emitida para este prédio.") + aviso;
  const stTxt = { processando: ["Processando", "atencao"], emitida: ["Emitida", "ok"], erro: ["Erro", "risco"], cancelada: ["Cancelada", "neutro"] };
  const linhas = d.notas.map(o => {
    const [t, tom] = stTxt[o.nota_status] || [o.nota_status, "neutro"];
    return `<tr class="cf-linha" data-cf-orc="${o.id}" tabindex="0">
      <td class="cf-num">${_cfEsc(o.nota_numero || "—")}</td>
      <td>${o.nota_tipo === "nfe" ? "DANFE" : "NFS-e"}</td>
      <td><div class="cf-l1">${_cfEsc(o.numero || "—")}</div></td>
      <td>${_cfSelo(t, tom)}</td>
      <td class="cf-num">${_cfMoeda(o.valor_total)}</td>
    </tr>`;
  });
  return aviso + _cfTabela([{ t: "Nº da nota", num: true }, { t: "Tipo" }, { t: "Orçamento" }, { t: "Situação" }, { t: "Valor", num: true }], linhas);
}

// ----- Contrato e plano -----

function _cfPaneContrato(c, d) {
  if (!d.extraCarregado) return `<div class="cf-carregando">Carregando contratos…</div>`;
  if (d.extraErro) return _cfVazio(`Não foi possível carregar contratos e preventivas (${_cfEsc(d.extraErro)}).`);
  const novo = `<button class="btn btn-sm btnAccent viewer-only-hide" data-cf-acao="novo-contrato">Novo contrato</button>`;
  const ctr = d.contratos.length
    ? _cfTabela([{ t: "Contrato" }, { t: "Vigência" }, { t: "Situação" }, { t: "Mensal", num: true }],
        d.contratos.map(ct => {
          const st = _ctrStatusVisual(ct);
          const tom = !ct.ativo ? "neutro" : ct.dias_para_vencer != null && ct.dias_para_vencer <= 30 ? "atencao" : "ok";
          return `<tr class="cf-linha" data-cf-contrato="${ct.id}" tabindex="0">
            <td><div class="cf-l1">${_cfEsc(_ctrTipoLabel[ct.tipo] || ct.tipo || "Contrato")}</div>${ct.numero ? `<div class="cf-l2">${_cfEsc(ct.numero)}</div>` : ""}</td>
            <td>${_cfData(ct.inicio_em)} → ${ct.fim_em ? _cfData(ct.fim_em) : "sem fim"}</td>
            <td>${_cfSelo(st.texto, tom)}</td>
            <td class="cf-num">${_cfMoeda(ct.valor_mensal)}</td>
          </tr>`;
        }))
    : _cfVazio("Nenhum contrato cadastrado.");

  const pl = d.planos.length
    ? _cfTabela([{ t: "Preventiva" }, { t: "A cada" }, { t: "Próxima" }, { t: "Situação" }],
        d.planos.map(p => `<tr class="cf-linha" data-cf-plano="${p.id}" tabindex="0">
          <td><div class="cf-l1">${_cfEsc(p.titulo || "Preventiva")}</div></td>
          <td>${p.periodicidade_dias ? `${p.periodicidade_dias} dias` : "—"}</td>
          <td>${_cfData(p.proxima_em)}</td>
          <td>${_cfSelo(p.ativo ? "Ativo" : "Inativo", p.ativo ? "ok" : "neutro")}</td>
        </tr>`))
    : _cfVazio("Este prédio não tem preventiva cadastrada.");

  return `<section class="cf-bloco">
      <div class="cf-bloco-head"><h2 class="cf-h2">Contratos</h2>${d.contratos.length ? novo : ""}</div>
      ${d.contratos.length ? ctr : _cfVazio("Nenhum contrato cadastrado.", novo)}
    </section>
    <section class="cf-bloco">
      <div class="cf-bloco-head"><h2 class="cf-h2">Manutenção preventiva</h2>
        <button class="btn btn-sm" data-cf-acao="ir-planos">Abrir em Preventivas</button></div>
      ${pl}
    </section>`;
}

// ----- Equipamentos -----

function _cfPaneEquipamentos(d) {
  if (!d.extraCarregado) return `<div class="cf-carregando">Carregando equipamentos…</div>`;
  if (d.extraErro) return _cfVazio(`Não foi possível carregar os equipamentos (${_cfEsc(d.extraErro)}).`);
  if (!d.equipamentos.length) return _cfVazio("Nenhum equipamento etiquetado neste prédio.");
  const linhas = d.equipamentos.map(eq => {
    const [label] = (typeof _EQ_STATUS_LABEL !== "undefined" && _EQ_STATUS_LABEL[eq.status]) || [eq.status];
    const tom = ["oficina", "aguardando_orcamento", "aguardando_peca", "em_conserto"].includes(eq.status) ? "atencao" : "ok";
    const nome = eq.apelido || [eq.marca, eq.modelo].filter(Boolean).join(" ") || (eq.tipo ? eq.tipo[0].toUpperCase() + eq.tipo.slice(1) : "—");
    return `<tr class="cf-linha" data-cf-eq="${_cfEsc(eq.codigo)}" tabindex="0">
      <td class="cf-num">${_cfEsc(typeof _eqFormatarCodigo === "function" ? _eqFormatarCodigo(eq.codigo) : eq.codigo)}</td>
      <td><div class="cf-l1">${_cfEsc(nome)}</div>${eq.numero_serie ? `<div class="cf-l2">Série ${_cfEsc(eq.numero_serie)}</div>` : ""}</td>
      <td>${_cfSelo(label, tom)}</td>
    </tr>`;
  });
  return _cfTabela([{ t: "Etiqueta", num: true }, { t: "Equipamento" }, { t: "Onde está" }], linhas) +
    `<p class="cf-nota">A ficha do equipamento abre em outra aba.</p>`;
}

// ----- Contatos e cadastro -----

function _cfPaneContatos(c, d) {
  const cnpj = c.cnpj ? String(c.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
  const campos = [
    ["Razão social", c.nome],
    ["Nome fantasia", c.nome_fantasia],
    ["CNPJ", cnpj],
    ["Responsável", c.responsavel],
    ["Telefone", c.telefone],
    ["E-mail", c.email],
    ["Endereço", [c.endereco, c.bairro, c.cidade && (c.cidade + (c.uf ? "/" + c.uf : "")), c.cep].filter(Boolean).join(", ")],
    ["Cliente desde", c.criado_em ? _cfData(c.criado_em) : ""],
  ].filter(([, v]) => v);

  const reps = d.reps.length
    ? `<ul class="cf-reps">${d.reps.map(u => `<li><span class="cf-l1">${_cfEsc(u.nome || "—")}</span><span class="cf-l2">${_cfEsc(u.email || "")}</span></li>`).join("")}</ul>`
    : _cfVazio("Nenhum síndico ou representante com acesso ao painel.");

  return `<div class="cf-duas">
    <section class="cf-bloco">
      <div class="cf-bloco-head"><h2 class="cf-h2">Cadastro</h2>
        <button class="btn btn-sm viewer-only-hide" data-action="editar-condominio" data-id="${c.id}">Editar</button></div>
      <dl class="cf-dl">${campos.map(([k, v]) => `<div><dt>${k}</dt><dd>${_cfEsc(v)}</dd></div>`).join("")}</dl>
    </section>
    <section class="cf-bloco">
      <div class="cf-bloco-head"><h2 class="cf-h2">Quem acessa o painel</h2>
        <button class="btn btn-sm viewer-only-hide" data-action="novo-representante" data-condo-id="${c.id}">Adicionar</button></div>
      ${reps}
    </section>
  </div>`;
}

// ===== CLIQUES =====

// Quem chega de fora da lista (ficha, Início, O.S.) abre a PÁGINA do chamado
// (19/11/2026): "Voltar" devolve para cá. Antes caía na lista de Chamados.
function _cfAbrirChamado(id) {
  _chAbrirPagina(id);
}

async function _cfAbrirOrcamento(id) {
  _avBindEventos();          // os botões do modal são ligados aqui, uma vez só
  await _orcAbrirDaBancada(id);
}

function _cfTrocarAba(aba) {
  if (aba === _cfAba) return;
  abrirFichaCondominio(_cfCondoId, aba);
}

document.addEventListener("DOMContentLoaded", () => {
  const sec = document.querySelector('.section[data-section="condominio"]');
  if (!sec) return;

  const agir = (e) => {
    const alvo = e.target.closest("[data-cf-aba],[data-cf-acao],[data-cf-chamado],[data-cf-os],[data-cf-orc],[data-cf-contrato],[data-cf-plano],[data-cf-eq],[data-cf-conversa]");
    if (!alvo || !sec.contains(alvo)) return;
    const ds = alvo.dataset;
    if (ds.cfAba)      { _cfTrocarAba(ds.cfAba); return; }
    if (ds.cfChamado)  { _cfAbrirChamado(Number(ds.cfChamado)); return; }
    if (ds.cfOs)       { abrirOSDetalhe(Number(ds.cfOs)); return; }
    if (ds.cfOrc)      { _cfAbrirOrcamento(Number(ds.cfOrc)); return; }
    if (ds.cfContrato) { _ctrAbrirModal({ condoId: _cfCondoId, contratoId: Number(ds.cfContrato) }); return; }
    if (ds.cfPlano)    { showSection("planos"); return; }
    if (ds.cfEq)       { window.open(`/e/${encodeURIComponent(ds.cfEq)}`, "_blank", "noopener"); return; }
    if (ds.cfConversa) { showSection("whatsapp"); return; }
    switch (ds.cfAcao) {
      case "voltar-lista":   showSection("cadastros"); return;
      case "ir-planos":      showSection("planos"); return;
      case "novo-contrato":  _ctrAbrirModal({ condoId: _cfCondoId }); return;
      case "novo-chamado": {
        // O modal de chamado mora numa closure do admin.js; o caminho público
        // é o botão dele. O prédio entra pelo picker, que avisa quem escuta
        // `change` (é o que carrega os orçamentos aprovados daquele prédio).
        const btn = document.getElementById("btnNovoChamado");
        if (!btn) { showSection("chamados"); return; }
        btn.click();
        window.CondoPicker?.montar({ campo: "ncCondo", itens: _condominios || [] })?.definir(_cfCondoId);
        return;
      }
      case "novo-orcamento":
        _avBindEventos();
        _avAcao("novo").then(() => {
          if (!_avSelecionado || _avSelecionado.id != null) return;
          _avSelecionado.condominio_id = _cfCondoId;
          _avRenderPainel();
        });
        return;
    }
  };

  sec.addEventListener("click", agir);
  // Linhas de tabela são focáveis: Enter abre como o clique.
  sec.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (!e.target.matches?.(".cf-linha")) return;
    e.preventDefault();
    agir(e);
  });

  // Boot: aplica o endereço que veio na URL (link colado, F5 numa ficha).
  setTimeout(_rotaAplicar, 0);
});

// ===== GANCHOS: a ficha acompanha as listas do admin =====
//
// Função declarada no topo de um script clássico é propriedade de window, e
// as chamadas de dentro do admin.js resolvem o nome por ali — então trocar
// window.X troca o que o admin chama. Cada gancho chama o original primeiro.

let _cfRedesenhoAgendado = false;
function _cfAgendarRedesenho({ refazerExtra = false } = {}) {
  if (!_cfCondoId) return;
  if (!document.querySelector('.section[data-section="condominio"].is-active')) return;
  if (refazerExtra) { _cfGarantirDados({ forcar: true }); return; }
  if (_cfRedesenhoAgendado) return;
  _cfRedesenhoAgendado = true;
  requestAnimationFrame(() => { _cfRedesenhoAgendado = false; _cfRender(); });
}

(function _cfLigarGanchos() {
  const embrulhar = (nome, opts) => {
    const orig = window[nome];
    if (typeof orig !== "function") return;
    window[nome] = function (...args) {
      const r = orig.apply(this, args);
      _cfAgendarRedesenho(opts);
      return r;
    };
  };
  embrulhar("_osRenderTabela");
  embrulhar("_avRenderTudo");
  embrulhar("renderChamados");
  embrulhar("renderClientes");
  embrulhar("_ctrRefrescarListas", { refazerExtra: true });
})();
