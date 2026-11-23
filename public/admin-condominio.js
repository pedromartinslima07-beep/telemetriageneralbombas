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
// #/condominios/12                  → página do prédio, histórico em "Tudo"
// #/condominios/12/orcamentos       → página, histórico filtrado em Orçamentos
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
    : secao === "orcamento-detalhe" || secao === "nota-detalhe" ? "orcamentos"
    : secao === "contrato-detalhe" ? "contratos"
    : secao === "chamado-detalhe" ? "chamados" : secao;
  const nav = document.querySelector(`.nav-item[data-section="${alvo}"]`);
  if (!nav) return false;
  return nav.style.display !== "none" && getComputedStyle(nav).display !== "none";
}

function _rotaAoMostrar(nome) {
  if (_rotaAplicando) return;
  if (nome === "condominio" || nome === "os-detalhe" || nome === "orcamento-detalhe" || nome === "nota-detalhe"
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
  // #/orcamentos/58/nota → página da nota fiscal (23/11/2026).
  if (partes[0] === "orcamentos" && partes[1] && partes[2] === "nota") {
    return { secao: "nota-detalhe", orcId: Number(partes[1]) };
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
  if (r.secao === "nota-detalhe") {
    if (!Number.isInteger(r.orcId) || r.orcId <= 0) return;
    if (typeof _nfAbrirPagina === "function") _nfAbrirPagina(r.orcId, { daRota: true });
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
//
// ⚠️ A PÁGINA DO PRÉDIO EM TRÊS COLUNAS (redesenho estrutural, 20/11/2026),
// no lugar das 10 abas, como a maquete desenhou (HubSpot / ServiceTitan):
//
//   esquerda  · Cadastro · Contrato e preventiva · Equipamentos
//   meio      · Histórico do prédio, com filtro por tipo
//   direita   · Água agora · Em aberto · Quem acessa o painel
//
// NADA DO QUE AS ABAS MOSTRAVAM SUMIU: cada lista de aba (Chamados, O.S.,
// Orçamentos, Notas, Contratos, WhatsApp, Água) é um filtro do histórico, sem
// corte; Telemetria, Contatos e Equipamentos viraram blocos fixos.
//
// O endereço continua o mesmo: #/condominios/12/orcamentos abre a página com
// o histórico filtrado em Orçamentos (_cfAba guarda o filtro, com os ids das
// abas antigas). "equipamentos" e "contatos" rolam até o bloco.

const _CF_FILTROS = [
  { id: "resumo",      rotulo: "Tudo" },
  { id: "chamados",    rotulo: "Chamados" },
  { id: "os",          rotulo: "O.S.",        soGestao: true },
  { id: "orcamentos",  rotulo: "Orçamentos",  soGestao: true },
  { id: "anotacoes",   rotulo: "Anotações e avisos" },
  { id: "notas",       rotulo: "Notas fiscais", soGestao: true },
  { id: "contrato",    rotulo: "Contratos",   soGestao: true },
  { id: "atendimento", rotulo: "WhatsApp",    soComWhatsapp: true },
  { id: "telemetria",  rotulo: "Água" },
];
// Abas antigas que viraram bloco: abrem a página e rolam até ele.
const _CF_BLOCOS = { equipamentos: "cfBlocoEq", contatos: "cfBlocoCad" };

// ⚠️ O PERFIL OPERADOR CHEGA NA FICHA (fase 5, 18/11/2026). Ele não tem a
// tela Condomínios, mas os botões "ver condomínio" de Alertas, do mapa e da
// ficha do chamado abrem a ficha. As rotas de O.S., orçamento, contrato,
// plano e equipamento são `gestaoOnly` e respondem 403 para ele. O filtro
// `soGestao` some, os blocos de contrato e equipamentos não aparecem, a busca
// não sai, e o cabeçalho não afirma "Sem contrato" sobre um dado que ele não
// pode ler.
function _cfGestao() {
  return typeof _isOperador === "undefined" || !_isOperador;
}
function _cfAbaVisivel(a) {
  if (a.soComWhatsapp && !_cfTemWhatsapp()) return false;
  if (a.soGestao && !_cfGestao()) return false;
  return true;
}

let _cfCondoId = null;
let _cfAba = "resumo";       // o filtro do histórico
let _cfRolarPara = null;     // id do bloco a mostrar depois de desenhar
let _cfHistMax = 30;         // quantos itens do histórico aparecem
// O que não mora em global do admin vem por condomínio, com a hora da busca.
// { condoId, contratos, planos, equipamentos, buscadoEm, erro }
let _cfExtra = null;
let _cfBuscando = null;
// Notas e avisos do prédio (migration 095): { condoId, itens, erro }. Vem para
// todo o escritório, operador inclusive (a rota é adminOnly).
let _cfNotas = null;
let _cfRascunho = { condoId: null, texto: "" };  // a nota sendo escrita sobrevive ao redesenho
let _cfSalvandoNota = false;

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
  _cfRolarPara = _CF_BLOCOS[aba] || null;
  const pedida = _CF_FILTROS.find(a => a.id === aba);
  _cfAba = pedida && _cfAbaVisivel(pedida) ? aba : "resumo";
  if (trocouPredio) _cfHistMax = 30;

  _rotaAplicando = true;
  try { showSection("condominio"); } finally { _rotaAplicando = false; }
  // A página é a casa do item "Condomínios" na nav.
  document.querySelector('.nav-item[data-section="cadastros"]')?.classList.add("active");

  if (trocouPredio) {
    _cfExtra = null;
    _cfNotas = null;
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
  // Trocar de filtro não busca de novo: só abrir o prédio, ou dado com mais de
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
  const notas = _cfBuscarNotas(id);
  if (!_cfGestao()) {
    // Operador: contratos, planos e equipamentos não são dele (ver
    // _cfGestao); as notas do prédio são.
    _cfExtra = { condoId: id, contratos: [], planos: [], equipamentos: [], meses: null, buscadoEm: Date.now() };
    await notas;
    if (_cfCondoId === id) _cfRender();
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
      // /planos-manutencao responde { planos, sem_plano } desde 04/09/2026.
      const listaPlanos = Array.isArray(planos) ? planos : (planos?.planos || []);
      // A tira dos 12 meses: falhar aqui não derruba o bloco (a tira só some).
      const meses = await fetch(`/planos-manutencao/meses?condominio_id=${id}`, h)
        .then(r => (r.ok ? r.json() : null)).catch(() => null);
      return { condoId: id, contratos, planos: listaPlanos.filter(p => Number(p.condominio_id) === id), equipamentos, meses, buscadoEm: Date.now() };
    })().catch(e => ({ condoId: id, contratos: [], planos: [], equipamentos: [], erro: e.message, buscadoEm: Date.now() }));
    tarefas.push(extra.then(x => { if (_cfCondoId === id) _cfExtra = x; }));
    tarefas.push(notas);
    await Promise.all(tarefas);
  } catch (e) {
    console.error("[ficha] _cfGarantirDados:", e);
  } finally {
    if (_cfBuscando === id) _cfBuscando = null;
  }
  if (_cfCondoId === id) _cfRender();
}

async function _cfBuscarNotas(id) {
  try {
    const r = await fetch(`/admin/condominios/${id}/notas`, { headers: authHeaders() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const itens = await r.json();
    if (_cfCondoId === id) _cfNotas = { condoId: id, itens };
  } catch (e) {
    if (_cfCondoId === id) _cfNotas = { condoId: id, itens: _cfNotas?.condoId === id ? _cfNotas.itens : [], erro: e.message };
  }
}

async function _cfSalvarNota() {
  const id = _cfCondoId;
  const campo = document.getElementById("cfNotaTexto");
  const texto = (campo?.value || "").trim();
  if (!texto || _cfSalvandoNota) return;
  _cfSalvandoNota = true;
  _cfRender();
  try {
    const r = await fetch(`/admin/condominios/${id}/notas`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    if (_cfCondoId === id) {
      _cfNotas = { condoId: id, itens: [j, ...(_cfNotas?.itens || [])] };
      _cfRascunho = { condoId: id, texto: "" };
    }
  } catch (e) {
    alert("Não consegui salvar a nota: " + e.message);
  } finally {
    _cfSalvandoNota = false;
    if (_cfCondoId === id) _cfRender();
  }
}

async function _cfApagarNota(notaId) {
  const id = _cfCondoId;
  if (!confirm("Apagar esta nota do histórico do prédio?")) return;
  try {
    const r = await fetch(`/admin/condominios/notas/${notaId}`, { method: "DELETE", headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    if (_cfCondoId === id && _cfNotas) _cfNotas.itens = _cfNotas.itens.filter(n => n.id !== notaId);
  } catch (e) {
    alert("Não consegui apagar a nota: " + e.message);
  }
  if (_cfCondoId === id) _cfRender();
}

function _cfPodeApagarNota(n) {
  if (n.tipo !== "nota") return false;
  if (typeof _myRole !== "undefined" && (_myRole === "admin" || _myRole === "gerente")) return true;
  const eu = typeof _cfgMyId === "function" ? _cfgMyId() : null;
  return eu != null && Number(eu) === Number(n.autor_id);
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
    meses: ex?.meses || null,
    notas_predio: _cfNotas && _cfNotas.condoId === id ? _cfNotas.itens : [],
    notasCarregadas: !!(_cfNotas && _cfNotas.condoId === id),
    extraCarregado: !!ex,
    extraErro: ex?.erro || null,
  };
}

// ----- peças de desenho -----

function _cfSelo(txt, tom) {
  // tom: ok | atencao | risco | neutro — mesma gramática do selo do admin
  return `<span class="cf-selo is-${tom}">${_cfEsc(txt)}</span>`;
}
// O selo do molde (.ls-selo) com a mesma gramática de tom.
const _CF_TOM_LS = { ok: "ok", atencao: "at", risco: "ri", neutro: "cz", info: "info" };
function _cfSeloLs(txt, tom) {
  return `<span class="ls-selo is-${_CF_TOM_LS[tom] || "cz"}">${_cfEsc(txt)}</span>`;
}
function _cfIco(n) { return `<i data-lucide="${n}" aria-hidden="true"></i>`; }
function _cfBloco(titulo, corpo, { id, acao, n } = {}) {
  return `<section class="cp-bloco"${id ? ` id="${id}"` : ""}>
    <div class="cp-bloco-cab"><h2>${titulo}${n != null ? ` <span class="cp-n">${n}</span>` : ""}</h2>${acao || ""}</div>
    <div class="cp-bloco-corpo">${corpo}</div>
  </section>`;
}
function _cfNada(txt, acao) { return `<p class="ls-nada">${txt}</p>${acao ? `<div class="cp-nada-acao">${acao}</div>` : ""}`; }

const _CF_PRIO = { p1: "P1 Crítico", p2: "P2 Alta", p3: "P3 Controlado", p4: "P4 Agendado" };
const _CF_CH_ST = { aberto: "Aberto", em_atendimento: "Em atendimento", fechado: "Resolvido", cancelado: "Cancelado" };

function _cfOrcStatus(s) {
  return { aprovado: "Aprovado", rejeitado: "Recusado", enviado: "Enviado", rascunho: "Rascunho" }[s] || s || "—";
}
function _cfOrcTom(s) {
  return s === "aprovado" ? "ok" : s === "rejeitado" ? "risco" : s === "enviado" ? "atencao" : "neutro";
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
  // Redesenho (polling, gravação) não pode jogar a pessoa para o topo nem
  // fechar o que ela digitava.
  const main = document.querySelector(".main");
  const rolagem = main ? main.scrollTop : 0;
  const campoAntes = document.getElementById("cfNotaTexto");
  const focado = campoAntes && document.activeElement === campoAntes
    ? { ini: campoAntes.selectionStart, fim: campoAntes.selectionEnd } : null;
  root.innerHTML = `<div class="ls cp">
    ${_cfRenderCabecalho(c, d)}
    <div class="cp-grade">
      <aside class="cp-esq">${_cfColEsquerda(c, d)}</aside>
      <section class="cp-meio">${_cfColHistorico(d)}</section>
      <aside class="cp-dir">${_cfColDireita(c, d)}</aside>
    </div>
  </div>`;
  window.lucide?.createIcons?.({ root });
  if (focado) {
    const campo = document.getElementById("cfNotaTexto");
    if (campo && !campo.disabled) { campo.focus({ preventScroll: true }); campo.setSelectionRange(focado.ini, focado.fim); }
  }
  if (_cfRolarPara) {
    const alvo = document.getElementById(_cfRolarPara);
    _cfRolarPara = null;
    alvo?.scrollIntoView({ block: "start" });
  } else if (main) {
    main.scrollTop = rolagem;
  }
}

function _cfAguaResumo(d) {
  if (!d.reservs.length) return { tom: "neutro", txt: "sem telemetria" };
  const offline = d.reservs.filter(r => r.offline).length;
  const pcts = d.reservs.map(r => r.ultima_leitura?.nivel_pct).filter(v => v != null);
  const menor = pcts.length ? Math.min(...pcts) : null;
  if (offline) return { tom: "risco", txt: `${offline} de ${d.reservs.length} sem sinal` };
  if (menor != null && menor < 20) return { tom: "risco", txt: `nível crítico, ${Math.round(menor)}%` };
  if (menor != null && menor < 45) return { tom: "atencao", txt: `nível baixo, ${Math.round(menor)}%` };
  return { tom: "ok", txt: menor != null ? `normal, ${d.reservs.length > 1 ? "menor " : ""}${Math.round(menor)}%` : "sem leitura" };
}

function _cfRenderCabecalho(c, d) {
  const nome = c.nome_fantasia || c.nome || "Sem nome";
  const razao = c.nome_fantasia && c.nome && c.nome_fantasia !== c.nome ? c.nome : "";
  const local = [c.bairro, c.cidade && (c.cidade + (c.uf ? "/" + c.uf : ""))].filter(Boolean).join(" · ");
  const cnpj = c.cnpj ? String(c.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
  const ini = nome.replace(/^(ed\.?|edif[ií]cio|cond\.?|condom[ií]nio|res\.?|residencial)\s+/i, "").trim().slice(0, 2).toUpperCase();

  // Os fatos do cabeçalho são FRASES, não cartões de KPI: o que se quer saber
  // de um prédio ao abrir cabe numa linha de leitura. Cada um filtra o
  // histórico no assunto dele.
  const a = _cfAguaResumo(d);
  const abertos = d.chamados.filter(ch => _chEmAberto(ch.status));
  const p1p2 = abertos.filter(ch => ch.prioridade === "p1" || ch.prioridade === "p2").length;
  const fatos = [
    `<button type="button" class="cp-fato" data-cf-aba="telemetria"><i class="ls-pt is-${_CF_TOM_LS[a.tom]}"></i>Água: <b>${_cfEsc(a.txt)}</b></button>`,
    `<button type="button" class="cp-fato" data-cf-aba="chamados">${_cfIco("inbox")}${abertos.length ? `<b>${abertos.length}</b> ${abertos.length === 1 ? "chamado aberto" : "chamados abertos"}${p1p2 ? ` · <b class="ls-txt-ri">${p1p2} urgente${p1p2 > 1 ? "s" : ""}</b>` : ""}` : "nenhum chamado aberto"}</button>`,
  ];
  if (_cfGestao()) {
    let ctr = "Contrato: carregando…";
    if (d.extraCarregado) {
      const vig = d.contratos.find(x => x.ativo);
      // Sem contrato no sistema, vale o ativo do Omie (integração, fase 1).
      const om = !vig && window.GBOmie ? window.GBOmie.doPredio(c.id).find(k => k.ativo) : null;
      if (om) ctr = `Contrato <b>${_cfMoeda(om.valor_mensal)}</b> por mês no Omie${om.vigencia_vencida ? ` · <b class="ls-txt-ri">vigência vencida</b>` : ""}`;
      else if (!vig) ctr = "Sem contrato";
      else {
        const dias = vig.dias_para_vencer;
        const venc = dias != null && dias < 0 ? ` · <b class="ls-txt-ri">vencido</b>` : dias != null && dias <= 30 ? ` · <b class="ls-txt-at">vence em ${dias} dia${dias === 1 ? "" : "s"}</b>` : "";
        ctr = `Contrato <b>${_cfMoeda(vig.valor_mensal)}</b> por mês${venc}`;
      }
    }
    fatos.push(`<button type="button" class="cp-fato" data-cf-aba="contrato">${_cfIco("file-signature")}${ctr}</button>`);
    if (d.extraCarregado) {
      const pv = d.planos.find(p => p.ativo);
      const pvTxt = !pv ? "Sem preventiva"
        : (typeof _pmAtrasada === "function" && _pmAtrasada(pv)) ? `Preventiva <b class="ls-txt-ri">atrasada</b>`
        : pv.estado === "feita" ? "Preventiva <b>feita no mês</b>"
        : `Preventiva · próxima ${_cfData(pv.proxima_em)}`;
      fatos.push(`<span class="cp-fato">${_cfIco("repeat")}${pvTxt}</span>`);
    }
  }

  const novo = `<div class="cp-novo">
      <button type="button" class="ls-bt is-pri" data-cf-novo aria-haspopup="menu" aria-expanded="false">${_cfIco("plus")}Novo${_cfIco("chevron-down")}</button>
      <div class="gb-menu cp-novo-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-cf-acao="novo-chamado">${_cfIco("inbox")}Chamado</button>
        ${_cfGestao() ? `<button type="button" role="menuitem" data-cf-acao="novo-orcamento">${_cfIco("file-text")}Orçamento</button>
        <button type="button" role="menuitem" data-cf-acao="novo-contrato">${_cfIco("file-signature")}Contrato</button>` : ""}
      </div>
    </div>`;

  return `<header class="cp-cab">
    <nav class="cp-migalha" aria-label="Você está em">
      <button type="button" class="ls-lk" data-cf-acao="voltar-lista">Condomínios</button>${_cfIco("chevron-right")}<span>${_cfEsc(nome)}</span>
    </nav>
    <div class="cp-tit">
      <span class="cp-av" aria-hidden="true">${_cfEsc(ini || "?")}</span>
      <div class="cp-tit-txt">
        <h1>${_cfEsc(nome)}${c.ativo === false ? ` <span class="ls-selo is-cz">inativo</span>` : ""}</h1>
        ${razao || local || cnpj ? `<p class="cp-sub">${[razao, local, cnpj && "CNPJ " + cnpj].filter(Boolean).map(_cfEsc).join(" · ")}</p>` : ""}
      </div>
      <span class="ls-esp"></span>
      <div class="cp-acoes viewer-only-hide">
        ${_cfGestao() ? `<button type="button" class="ls-bt" data-action="editar-condominio" data-id="${c.id}">${_cfIco("pencil")}Editar cadastro</button>` : ""}
        ${_cfGestao() ? (c.ativo === false
          ? `<button type="button" class="ls-bt" data-action="reativar-condominio" data-id="${c.id}">Reativar</button>`
          : `<button type="button" class="ls-bt is-perigo" data-action="inativar-condominio" data-id="${c.id}" data-nome="${_cfEsc(nome)}">Inativar</button>`) : ""}
        ${novo}
      </div>
    </div>
    <div class="cp-fatos">${fatos.join("")}</div>
  </header>`;
}

// ----- coluna da esquerda: cadastro, contrato e preventiva, equipamentos -----

function _cfColEsquerda(c, d) {
  const cnpj = c.cnpj ? String(c.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
  const email = c.email ? String(c.email).split(",").map(s => s.trim()).filter(Boolean) : [];
  const campos = [
    ["Razão social", _cfEsc(c.nome)],
    c.nome_fantasia ? ["Nome fantasia", _cfEsc(c.nome_fantasia)] : null,
    cnpj ? ["CNPJ", `<span class="ls-mono">${cnpj}</span>`] : null,
    ["Síndico", c.responsavel ? _cfEsc(c.responsavel) : `<span class="ls-mudo">não informado</span>`],
    c.telefone ? ["Telefone", _cfEsc(c.telefone)] : null,
    ["E-mail", email.length ? email.map(_cfEsc).join("<br>") : `<span class="ls-txt-at">sem e-mail: O.S. e orçamento não vão por e-mail</span>`],
    ["Endereço", _cfEsc([c.endereco, c.bairro, c.cidade && (c.cidade + (c.uf ? "/" + c.uf : "")), c.cep].filter(Boolean).join(", ")) || `<span class="ls-mudo">—</span>`],
    c.criado_em ? ["Cliente desde", _cfData(c.criado_em)] : null,
  ].filter(Boolean);
  const cadastro = _cfBloco("Cadastro",
    `<dl class="cp-dl">${campos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`,
    { id: "cfBlocoCad", acao: _cfGestao() ? `<button type="button" class="ls-bt is-p is-ghost viewer-only-hide" data-action="editar-condominio" data-id="${c.id}">${_cfIco("pencil")}Editar</button>` : "" });

  if (!_cfGestao()) return cadastro;

  // Contrato e preventiva
  let ctr;
  if (!d.extraCarregado) ctr = `<div class="ls-esq-sec"><i></i><i></i></div>`;
  else if (d.extraErro) ctr = _cfNada(`Não consegui carregar contratos e preventivas (${_cfEsc(d.extraErro)}).`, `<button type="button" class="ls-bt is-p" data-cf-acao="recarregar">Tentar de novo</button>`);
  else {
    const contratos = [...d.contratos].sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) || new Date(b.inicio_em || 0) - new Date(a.inicio_em || 0));
    const linhasCt = contratos.map(ct => {
      const st = _ctrStatusVisual(ct);
      const tom = !ct.ativo ? "neutro" : st.cls === "bad" ? "risco" : ct.dias_para_vencer != null && ct.dias_para_vencer <= 30 ? "atencao" : "ok";
      return `<button type="button" class="cp-linha" data-cf-contrato="${ct.id}">
        ${_cfIco("file-signature")}
        <span class="cp-linha-txt"><b>${_cfEsc(_ctrTipoLabel[ct.tipo] || ct.tipo || "Contrato")}${ct.numero ? ` · <span class="ls-mono">${_cfEsc(ct.numero)}</span>` : ""}</b>
          <small>${_cfData(ct.inicio_em)} → ${ct.fim_em ? _cfData(ct.fim_em) : "sem fim"} · ${_cfMoeda(ct.valor_mensal)} por mês</small></span>
        ${_cfSeloLs(ct.ativo ? st.texto : "Encerrado", tom)}
      </button>`;
    }).join("");
    // Os contratos do Omie deste prédio (a cobrança mora lá). Abrem na tela
    // Contratos, com o contrato escolhido.
    const linhasOm = (window.GBOmie ? window.GBOmie.doPredio(c.id) : []).map(k => `<button type="button" class="cp-linha" data-cf-omie="${k.omie_codigo}">
        ${_cfIco("file-signature")}
        <span class="cp-linha-txt"><b>No Omie${k.numero ? ` · <span class="ls-mono">${_cfEsc(k.numero)}</span>` : ""}</b>
          <small>${k.vigencia_inicio ? _cfData(k.vigencia_inicio) : "—"} → ${k.vigencia_fim ? _cfData(k.vigencia_fim) : "sem fim"} · ${_cfMoeda(k.valor_mensal)} por mês${k.dia_faturamento ? ` · fatura dia ${k.dia_faturamento}` : ""}</small></span>
        ${_cfSeloLs(!k.ativo ? k.situacao_rotulo : k.vigencia_vencida ? "Vigência vencida" : "Ativo", !k.ativo ? "neutro" : k.vigencia_vencida ? "risco" : "ok")}
      </button>`).join("");
    const linhasPl = d.planos.map(p => {
      const atr = typeof _pmAtrasada === "function" && _pmAtrasada(p);
      const sel = !p.ativo ? _cfSeloLs("Inativo", "neutro") : atr ? _cfSeloLs("Atrasada", "risco") : p.estado === "feita" ? _cfSeloLs("Feita no mês", "ok") : _cfSeloLs("Ativa", "info");
      return `<button type="button" class="cp-linha" data-cf-plano="${p.id}">
        ${_cfIco("repeat")}
        <span class="cp-linha-txt"><b>${_cfEsc(p.titulo || "Preventiva")}</b>
          <small>${p.periodicidade_dias ? `a cada ${p.periodicidade_dias} dias · ` : ""}próxima ${_cfData(p.proxima_em)}${p.tecnico_nome ? " · " + _cfEsc(p.tecnico_nome) : ""}</small>
          ${_cfTira(d.meses, p.id)}</span>
        ${sel}
      </button>`;
    }).join("");
    ctr = ((linhasCt + linhasOm) || _cfNada("Nenhum contrato cadastrado, nem no Omie."))
      + `<div class="cp-sub-cab">Manutenção preventiva</div>`
      + (linhasPl || _cfNada("Este prédio não tem preventiva cadastrada."))
      + `<div class="cp-rodape-bloco viewer-only-hide">
          <button type="button" class="ls-bt is-p" data-cf-acao="novo-contrato">${_cfIco("plus")}Novo contrato</button>
          <button type="button" class="ls-bt is-p is-ghost" data-cf-acao="ir-planos">Abrir em Preventivas</button>
        </div>`;
  }
  const contrato = _cfBloco("Contrato e preventiva", ctr, { id: "cfBlocoCt" });

  // Equipamentos
  let eq;
  if (!d.extraCarregado) eq = `<div class="ls-esq-sec"><i></i><i></i></div>`;
  else if (d.extraErro) eq = _cfNada("Não consegui carregar os equipamentos.");
  else if (!d.equipamentos.length) eq = _cfNada("Nenhum equipamento etiquetado neste prédio.");
  else {
    eq = d.equipamentos.map(e => {
      const [label] = (typeof _EQ_STATUS_LABEL !== "undefined" && _EQ_STATUS_LABEL[e.status]) || [e.status];
      const tom = ["oficina", "aguardando_orcamento", "aguardando_peca", "em_conserto"].includes(e.status) ? "atencao" : "ok";
      const nome = e.apelido || [e.marca, e.modelo].filter(Boolean).join(" ") || (e.tipo ? e.tipo[0].toUpperCase() + e.tipo.slice(1) : "—");
      const cod = typeof _eqFormatarCodigo === "function" ? _eqFormatarCodigo(e.codigo) : e.codigo;
      return `<button type="button" class="cp-linha" data-cf-eq="${_cfEsc(e.codigo)}" title="Abre a ficha do equipamento em outra aba">
        ${_cfIco("package")}
        <span class="cp-linha-txt"><b>${_cfEsc(nome)}</b><small><span class="ls-mono">${_cfEsc(cod)}</span>${e.numero_serie ? " · série " + _cfEsc(e.numero_serie) : ""}</small></span>
        ${_cfSeloLs(label, tom)}
      </button>`;
    }).join("");
  }
  const equip = _cfBloco("Equipamentos", eq, { id: "cfBlocoEq", n: d.extraCarregado && !d.extraErro ? d.equipamentos.length : null });

  return cadastro + contrato + equip;
}

// A tira dos 12 meses de um plano (GET /planos-manutencao/meses): um
// quadradinho por mês, o corrente por último. "sem" não é falta — plano não
// mensal pode não ter visita no mês; só o cancelamento ("não realizada") é.
const _CF_TIRA = {
  feita: ["is-ok", "feita"], andamento: ["is-info", "em andamento"], nao_feita: ["is-ri", "não realizada"],
  sem: ["is-sem", "sem visita registrada"], antes: ["is-antes", "antes do plano"],
};
const _CF_MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function _cfTira(meses, planoId) {
  const est = meses?.planos?.[planoId];
  if (!est || !Array.isArray(meses.meses)) return "";
  const rot = m => { const [a, mm] = m.split("-"); return `${_CF_MES_CURTO[Number(mm) - 1]}/${a.slice(2)}`; };
  const feitas = est.filter(e => e === "feita").length;
  return `<span class="cp-tira" role="img" aria-label="Últimos 12 meses: ${feitas} feitas">${est.map((e, i) => {
    const [cls, txt] = _CF_TIRA[e] || _CF_TIRA.sem;
    return `<i class="${cls}" title="${rot(meses.meses[i])}: ${txt}"></i>`;
  }).join("")}<span class="cp-tira-n">${feitas}/12</span></span>`;
}

// ----- coluna do meio: o histórico do prédio -----

function _cfEventos(d) {
  const ev = [];
  for (const ch of d.chamados) {
    ev.push({ f: "chamados", ic: "inbox", em: ch.criado_em, tipo: `Chamado #${ch.id}`, txt: ch.titulo || "Chamado",
      sub: [_CF_PRIO[ch.prioridade], ch.tecnico_nome].filter(Boolean).join(" · "),
      sel: _cfSeloLs(_CF_CH_ST[ch.status] || ch.status, _chEmAberto(ch.status) ? "atencao" : "neutro"), attr: `data-cf-chamado="${ch.id}"` });
  }
  if (_cfGestao()) {
    for (const o of d.os) {
      const sel = !o.finalizada_em ? _cfSeloLs("Em andamento", "info") : o.enviado_em ? _cfSeloLs("Enviada", "ok") : _osFaltaEnviar(o) ? _cfSeloLs("Falta enviar", "atencao") : _cfSeloLs("Finalizada", "ok");
      const tipos = Array.isArray(o.tipos_servico) ? o.tipos_servico.map(k => (typeof _OS_TIPOS_SERVICO !== "undefined" && _OS_TIPOS_SERVICO[k]) || k).join(", ") : (o.tipos_servico || "");
      ev.push({ f: "os", ic: "clipboard-check", em: o.finalizada_em || o.criado_em, tipo: o.numero || `O.S. #${o.id}`, txt: tipos || "Ordem de serviço",
        sub: o.tecnico_nome || "", sel, attr: `data-cf-os="${o.id}"` });
    }
    for (const o of d.orcamentos) {
      ev.push({ f: "orcamentos", ic: "file-text", em: o.respondido_em || o.criado_em, tipo: o.numero || "Orçamento",
        txt: (typeof _avTipoLabels !== "undefined" && _avTipoLabels?.[o.tipo]) || "Peças e serviço",
        sub: [_cfMoeda(o.valor_total) !== "—" ? _cfMoeda(o.valor_total) : "", _avPendente(o) ? "resposta do cliente sem baixa" : ""].filter(Boolean).join(" · "),
        sel: _cfSeloLs(_cfOrcStatus(o.status), _cfOrcTom(o.status)), attr: `data-cf-orc="${o.id}"` });
    }
    const stNota = { processando: ["Processando", "atencao"], emitida: ["Emitida", "ok"], erro: ["Erro", "risco"], cancelada: ["Cancelada", "neutro"] };
    for (const o of d.notas) {
      const [t, tom] = stNota[o.nota_status] || [o.nota_status, "neutro"];
      ev.push({ f: "notas", ic: "receipt", em: o.nota_emitida_em || o.nota_solicitada_em || o.respondido_em || o.criado_em,
        tipo: `${o.nota_tipo === "nfe" ? "DANFE" : "NFS-e"}${o.nota_numero ? " nº " + o.nota_numero : ""}`, txt: `Nota do ${o.numero || "orçamento"}`,
        sub: _cfMoeda(o.valor_total) !== "—" ? _cfMoeda(o.valor_total) : "", sel: _cfSeloLs(t, tom), attr: `data-cf-orc="${o.id}"` });
    }
    for (const ct of d.contratos) {
      ev.push({ f: "contrato", ic: "file-signature", em: ct.inicio_em || ct.criado_em, tipo: ct.numero || "Contrato",
        txt: `Contrato ${(_ctrTipoLabel[ct.tipo] || ct.tipo || "").toLowerCase()}`.trim(),
        sub: `${_cfMoeda(ct.valor_mensal)} por mês · até ${ct.fim_em ? _cfData(ct.fim_em) : "sem fim"}`,
        sel: _cfSeloLs(ct.ativo ? "Vigente" : "Encerrado", ct.ativo ? "ok" : "neutro"), attr: `data-cf-contrato="${ct.id}"` });
    }
  }
  if (_cfTemWhatsapp()) {
    for (const cv of d.conversas) {
      ev.push({ f: "atendimento", ic: "message-circle", em: cv.atualizado_em || cv.criado_em, tipo: "WhatsApp", txt: cv.contato_nome || cv.telefone || "Contato",
        sub: "", sel: _cfSeloLs(cv.status === "aberta" ? "Aberta" : "Encerrada", cv.status === "aberta" ? "atencao" : "neutro"), attr: `data-cf-conversa="${cv.id}"` });
    }
  }
  // Anotações do escritório e avisos mandados ao síndico (migration 095).
  for (const n of d.notas_predio) {
    const quem = n.autor_nome ? `por ${n.autor_nome}` : "";
    ev.push(n.tipo === "aviso"
      ? { f: "anotacoes", ic: "megaphone", em: n.criado_em, tipo: "Aviso ao síndico", txt: n.assunto || "Aviso", corpo: n.texto,
          sub: [n.enviado_para ? `para ${n.enviado_para}` : "", quem].filter(Boolean).join(" · "), sel: _cfSeloLs("Enviado", "ok"), nota: n }
      : { f: "anotacoes", ic: "sticky-note", em: n.criado_em, tipo: "Nota", txt: "", corpo: n.texto, sub: quem, sel: "", nota: n });
  }
  // Água: o que está fora do normal agora (o admin só guarda os alertas abertos).
  for (const r of d.reservs) {
    const u = r.ultima_leitura;
    const pct = u?.nivel_pct;
    if (r.offline) ev.push({ f: "telemetria", ic: "wifi-off", em: u?.criado_em || null, tipo: r.nome || "Reservatório", txt: "Sem sinal", sub: u?.criado_em ? `última leitura ${_cfData(u.criado_em)}` : "nunca enviou leitura", sel: _cfSeloLs("Agora", "risco"), attr: `data-action="ir-telemetria-condo" data-condo-id="${_cfCondoId}"` });
    else if (pct != null && pct < 45) ev.push({ f: "telemetria", ic: "droplet", em: u?.criado_em || null, tipo: r.nome || "Reservatório", txt: `Nível em ${Math.round(pct)}%`, sub: pct < 20 ? "abaixo do crítico (20%)" : "abaixo de 45%", sel: _cfSeloLs("Agora", pct < 20 ? "risco" : "atencao"), attr: `data-action="ir-telemetria-condo" data-condo-id="${_cfCondoId}"` });
  }
  // Sem data = estado de agora (a água fora do normal): fica no topo.
  const t = e => (e.em ? new Date(e.em).getTime() : Infinity);
  return ev.sort((a, b) => t(b) - t(a));
}

function _cfColHistorico(d) {
  const todos = _cfEventos(d);
  const filtros = _CF_FILTROS.filter(_cfAbaVisivel);
  const cont = k => (k === "resumo" ? todos.length : todos.filter(e => e.f === k).length);
  const evs = todos.filter(e => _cfAba === "resumo" || e.f === _cfAba);
  const mostrar = evs.slice(0, _cfHistMax);
  const carregandoDocs = _cfGestao() && ((typeof _osLoaded !== "undefined" && !_osLoaded) || !d.extraCarregado);
  const vazio = {
    resumo: "Nenhum chamado, O.S., orçamento ou contrato registrado ainda.",
    chamados: "Nenhum chamado neste prédio.", os: "Nenhuma O.S. registrada neste prédio.",
    orcamentos: "Nenhum orçamento para este prédio.", notas: "Nenhuma nota fiscal emitida para este prédio.",
    contrato: "Nenhum contrato cadastrado.", atendimento: "Nenhuma conversa de WhatsApp com este prédio.",
    telemetria: d.reservs.length ? "A água está normal: nenhum reservatório sem sinal ou baixo agora." : "Este prédio não tem reservatório monitorado.",
    anotacoes: "Nenhuma anotação nem aviso ainda. Escreva acima o que o escritório precisa lembrar sobre o prédio.",
  }[_cfAba];
  const novoAqui = _cfAba === "orcamentos" && _cfGestao() ? `<button type="button" class="ls-bt is-p viewer-only-hide" data-cf-acao="novo-orcamento">${_cfIco("plus")}Novo orçamento</button>`
    : _cfAba === "chamados" ? `<button type="button" class="ls-bt is-p viewer-only-hide" data-cf-acao="novo-chamado">${_cfIco("plus")}Abrir chamado</button>` : "";

  // A nota e o aviso não abrem documento: o texto inteiro aparece ali mesmo.
  const item = e => e.nota
    ? `<li><div class="cp-hist-it is-nota${e.nota.tipo === "aviso" ? " is-aviso" : ""}">
          <span class="cp-hist-ic">${_cfIco(e.ic)}</span>
          <span class="cp-hist-txt"><span><b>${_cfEsc(e.tipo)}</b>${e.txt ? " · " + _cfEsc(e.txt) : ""}</span>
            <span class="cp-nota-corpo">${_cfEsc(e.corpo)}</span>
            ${e.sub ? `<small>${_cfEsc(e.sub)}</small>` : ""}</span>
          ${_cfPodeApagarNota(e.nota) ? `<button type="button" class="ls-bt is-p is-ghost cp-nota-apagar viewer-only-hide" data-cf-nota-apagar="${e.nota.id}" title="Apagar a nota" aria-label="Apagar a nota">${_cfIco("trash-2")}</button>` : (e.sel || "<span></span>")}
          <time>${e.em ? _cfData(e.em) : ""}</time>
        </div></li>`
    : `<li>
        <button type="button" class="cp-hist-it" ${e.attr}>
          <span class="cp-hist-ic">${_cfIco(e.ic)}</span>
          <span class="cp-hist-txt"><span><b>${_cfEsc(e.tipo)}</b> · ${_cfEsc(e.txt)}</span>${e.sub ? `<small>${_cfEsc(e.sub)}</small>` : ""}</span>
          ${e.sel}
          <time>${e.em ? _cfData(e.em) : ""}</time>
        </button></li>`;

  // A nota nova: no "Tudo" e no filtro das anotações. O rascunho sobrevive
  // ao redesenho (polling, gravação de outra tela).
  const rasc = _cfRascunho.condoId === _cfCondoId ? _cfRascunho.texto : "";
  const compositor = _cfAba === "resumo" || _cfAba === "anotacoes"
    ? `<div class="cp-nota-nova viewer-only-hide">
        <textarea id="cfNotaTexto" rows="${rasc.includes("\n") || rasc.length > 70 ? 3 : 1}" maxlength="4000" placeholder="Escrever uma nota sobre o prédio…" aria-label="Nova nota sobre o prédio" ${_cfSalvandoNota ? "disabled" : ""}>${_cfEsc(rasc)}</textarea>
        <button type="button" class="ls-bt is-p" data-cf-nota-salvar ${_cfSalvandoNota || !rasc.trim() ? "disabled" : ""}>${_cfSalvandoNota ? "Salvando…" : "Salvar nota"}</button>
      </div>${_cfNotas?.erro && _cfNotas.condoId === _cfCondoId ? `<p class="ls-nada cp-nota-erro">Não consegui carregar as anotações. <button type="button" class="ls-lk" data-cf-acao="recarregar">Tentar de novo</button></p>` : ""}`
    : "";

  const lista = mostrar.length
    ? `<ol class="cp-hist">${mostrar.map(item).join("")}</ol>
      ${evs.length > mostrar.length ? `<button type="button" class="ls-bt is-p cp-mais" data-cf-mais>Mostrar mais ${Math.min(30, evs.length - mostrar.length)} de ${evs.length - mostrar.length}</button>` : ""}`
    : carregandoDocs && !["chamados", "telemetria", "atendimento", "anotacoes"].includes(_cfAba)
      ? `<div class="ls-esq-sec"><i></i><i></i><i></i></div>`
      : `<div class="cp-vazio">${_cfIco("history")}<span>${vazio}</span>${novoAqui}</div>`;

  return `<section class="cp-bloco cp-hist-bloco">
    <div class="cp-bloco-cab"><h2>Histórico do prédio</h2>${mostrar.length ? novoAqui : ""}</div>
    <div class="ls-chips cp-chips" role="group" aria-label="Filtrar o histórico">${filtros.filter(f => f.id === "resumo" || f.id === _cfAba || cont(f.id)).map(f =>
      `<button type="button" class="ls-chip${_cfAba === f.id ? " is-on" : ""}" data-cf-aba="${f.id}" aria-pressed="${_cfAba === f.id}">${f.rotulo} <span class="ls-n">${cont(f.id)}</span></button>`).join("")}</div>
    <div class="cp-bloco-corpo">${compositor}${lista}</div>
  </section>`;
}

// ----- coluna da direita: água agora, em aberto, acesso do síndico -----

function _cfPendencias(d) {
  const pend = [];
  for (const r of d.reservs) {
    const pct = r.ultima_leitura?.nivel_pct;
    if (r.offline) pend.push({ tom: "risco", ic: "wifi-off", txt: `${r.nome || "Reservatório"} sem sinal`, attr: `data-action="ir-telemetria-condo" data-condo-id="${_cfCondoId}"` });
    else if (pct != null && pct < 45) pend.push({ tom: pct < 20 ? "risco" : "atencao", ic: "droplet", txt: `${r.nome || "Reservatório"} em ${Math.round(pct)}%`, attr: `data-action="ir-telemetria-condo" data-condo-id="${_cfCondoId}"` });
  }
  for (const ch of d.chamados.filter(x => _chEmAberto(x.status))) {
    pend.push({ tom: ch.prioridade === "p1" || ch.prioridade === "p2" ? "risco" : "atencao", ic: "inbox",
      txt: `${ch.titulo || "Chamado #" + ch.id}`, sub: `${_CF_PRIO[ch.prioridade] || "Chamado"} · ${ch.tecnico_nome || "sem técnico"}`, attr: `data-cf-chamado="${ch.id}"` });
  }
  if (_cfGestao()) {
    for (const o of d.orcamentos.filter(_avPendente)) {
      pend.push({ tom: "atencao", ic: "file-text", txt: `${o.numero || "Orçamento"} ${o.status === "rejeitado" ? "recusado" : "aprovado"} pelo cliente`, sub: "falta dar baixa", attr: `data-cf-orc="${o.id}"` });
    }
    for (const o of d.orcamentos.filter(o => ["rascunho", "enviado"].includes(o.status) && !_avPendente(o))) {
      pend.push({ tom: "neutro", ic: "file-text", txt: `${o.numero || "Orçamento"} ${o.status === "rascunho" ? "em rascunho" : "esperando o cliente"}`, sub: _cfMoeda(o.valor_total) !== "—" ? _cfMoeda(o.valor_total) : "", attr: `data-cf-orc="${o.id}"` });
    }
    for (const o of d.orcamentos.filter(o => o.status === "aprovado" && !o.nota_status)) {
      pend.push({ tom: "neutro", ic: "receipt", txt: `${o.numero || "Orçamento"} aprovado, sem nota fiscal`, attr: `data-cf-orc="${o.id}"` });
    }
    for (const o of d.os.filter(o => !o.finalizada_em)) {
      pend.push({ tom: "info", ic: "clipboard-check", txt: `${o.numero || "O.S. #" + o.id} em andamento`, sub: o.tecnico_nome || "", attr: `data-cf-os="${o.id}"` });
    }
    for (const o of d.os.filter(_osFaltaEnviar)) {
      pend.push({ tom: "atencao", ic: "send", txt: `${o.numero || "O.S. #" + o.id} finalizada, não enviada`, sub: "falta enviar ao cliente", attr: `data-cf-os="${o.id}"` });
    }
    const vig = d.contratos.find(x => x.ativo);
    if (vig && vig.dias_para_vencer != null && vig.dias_para_vencer <= 30) {
      pend.push({ tom: vig.dias_para_vencer < 0 ? "risco" : "atencao", ic: "file-signature", txt: vig.dias_para_vencer < 0 ? "Contrato vencido" : `Contrato vence em ${vig.dias_para_vencer} dia${vig.dias_para_vencer === 1 ? "" : "s"}`, attr: `data-cf-contrato="${vig.id}"` });
    }
  }
  const ordemTom = { risco: 0, atencao: 1, info: 2, neutro: 3 };
  return pend.sort((a, b) => ordemTom[a.tom] - ordemTom[b.tom]);
}

function _cfColDireita(c, d) {
  // Água agora
  let agua;
  if (!d.reservs.length) agua = _cfNada("Sem telemetria instalada neste prédio.");
  else {
    agua = d.reservs.map(r => {
      const u = r.ultima_leitura;
      const pct = u?.nivel_pct;
      const tom = r.offline ? "risco" : pct == null ? "neutro" : pct < 20 ? "risco" : pct < 45 ? "atencao" : "ok";
      const bomba = u?.bomba_ligada === true ? "bomba ligada" : u?.bomba_ligada === false ? "bomba desligada" : "bomba sem leitura";
      return `<div class="cp-res">
        <div class="cp-res-txt"><b>${_cfEsc(r.nome || "Reservatório")}</b><small>${bomba} · ${u?.criado_em ? "leitura " + _tempoRelativo(u.criado_em) : "sem leitura"}</small></div>
        ${r.offline ? _cfSeloLs("sem sinal", "risco")
          : `<span class="cp-nivel"><span class="cp-nivel-barra"><i class="is-${_CF_TOM_LS[tom]}" style="width:${Math.max(0, Math.min(100, pct ?? 0))}%"></i></span><b>${pct != null ? Math.round(pct) + "%" : "—"}</b></span>`}
      </div>`;
    }).join("") + `<div class="cp-rodape-bloco"><button type="button" class="ls-bt is-p is-ghost" data-action="ir-telemetria-condo" data-condo-id="${_cfCondoId}">${_cfIco("chart-line")}Histórico de nível</button></div>`;
  }

  const pend = _cfPendencias(d);
  const aberto = pend.length
    ? pend.map(p => `<button type="button" class="cp-linha" ${p.attr}>
        <i class="ls-pt is-${_CF_TOM_LS[p.tom]}"></i>
        <span class="cp-linha-txt"><b>${_cfEsc(p.txt)}</b>${p.sub ? `<small>${_cfEsc(p.sub)}</small>` : ""}</span>
        ${_cfIco("chevron-right")}
      </button>`).join("")
    : _cfNada("Nada em aberto neste prédio.");

  const reps = d.reps.length
    ? d.reps.map(u => `<div class="cp-pessoa">${_cfIco("user")}<span class="cp-linha-txt"><b>${_cfEsc(u.nome || "—")}</b><small>${_cfEsc(u.email || "")}</small></span></div>`).join("")
    : _cfNada("Ninguém deste prédio entra no painel do cliente ainda.");
  const acesso = _cfBloco("Quem acessa o painel", reps, {
    id: "cfBlocoAcesso",
    acao: _cfGestao() ? `<button type="button" class="ls-bt is-p is-ghost viewer-only-hide" data-action="novo-representante" data-condo-id="${c.id}">${_cfIco("plus")}Adicionar</button>` : "",
  });

  return _cfBloco("Água agora", agua, { id: "cfBlocoAgua" })
    + _cfBloco("Em aberto", aberto, { n: pend.length || null })
    + acesso;
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

// O filtro do histórico troca no lugar (sem entrada nova no "voltar" do
// navegador), mas fica no endereço: F5 e link colado abrem no mesmo filtro.
function _cfTrocarAba(aba) {
  if (aba === _cfAba) return;
  const f = _CF_FILTROS.find(x => x.id === aba);
  _cfAba = f && _cfAbaVisivel(f) ? aba : "resumo";
  _cfHistMax = 30;
  history.replaceState(null, "", `#/condominios/${_cfCondoId}${_cfAba !== "resumo" ? "/" + _cfAba : ""}`);
  _cfRender();
}

document.addEventListener("DOMContentLoaded", () => {
  const sec = document.querySelector('.section[data-section="condominio"]');
  if (!sec) return;

  const agir = (e) => {
    const alvo = e.target.closest("[data-cf-aba],[data-cf-acao],[data-cf-chamado],[data-cf-os],[data-cf-orc],[data-cf-contrato],[data-cf-omie],[data-cf-plano],[data-cf-eq],[data-cf-conversa],[data-cf-novo],[data-cf-mais],[data-cf-nota-salvar],[data-cf-nota-apagar]");
    if (!alvo || !sec.contains(alvo)) return;
    const ds = alvo.dataset;
    if ("cfNotaSalvar" in ds) { _cfSalvarNota(); return; }
    if (ds.cfNotaApagar) { _cfApagarNota(Number(ds.cfNotaApagar)); return; }
    const menu = sec.querySelector(".cp-novo-menu");
    if ("cfNovo" in ds) {
      if (menu) { menu.hidden = !menu.hidden; alvo.setAttribute("aria-expanded", String(!menu.hidden)); }
      return;
    }
    if (menu && !menu.hidden) menu.hidden = true;
    if ("cfMais" in ds) { _cfHistMax += 30; _cfRender(); return; }
    if (ds.cfAba)      { _cfTrocarAba(ds.cfAba); return; }
    if (ds.cfChamado)  { _cfAbrirChamado(Number(ds.cfChamado)); return; }
    if (ds.cfOs)       { abrirOSDetalhe(Number(ds.cfOs)); return; }
    if (ds.cfOrc)      { _cfAbrirOrcamento(Number(ds.cfOrc)); return; }
    if (ds.cfContrato) { _ctrAbrirModal({ condoId: _cfCondoId, contratoId: Number(ds.cfContrato) }); return; }
    if (ds.cfOmie) { window.GBOmie?.abrir(Number(ds.cfOmie)); return; }
    if (ds.cfPlano)    { showSection("planos"); return; }
    if (ds.cfEq)       { window.open(`/e/${encodeURIComponent(ds.cfEq)}`, "_blank", "noopener"); return; }
    if (ds.cfConversa) { showSection("whatsapp"); return; }
    switch (ds.cfAcao) {
      case "voltar-lista":   showSection("cadastros"); return;
      case "ir-planos":      showSection("planos"); return;
      case "recarregar":     _cfGarantirDados({ forcar: true }); return;
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
  // A nota sendo escrita: guarda o rascunho, cresce o campo, liga o botão.
  // Ctrl+Enter (ou Cmd+Enter) salva.
  sec.addEventListener("input", (e) => {
    if (e.target.id !== "cfNotaTexto") return;
    _cfRascunho = { condoId: _cfCondoId, texto: e.target.value };
    e.target.rows = e.target.value.includes("\n") || e.target.value.length > 70 ? 3 : 1;
    const bt = sec.querySelector("[data-cf-nota-salvar]");
    if (bt) bt.disabled = !e.target.value.trim();
  });
  sec.addEventListener("keydown", (e) => {
    if (e.target.id === "cfNotaTexto" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _cfSalvarNota(); }
  });
  // O menu "Novo" fecha clicando fora e com Esc.
  document.addEventListener("mousedown", (e) => {
    const m = sec.querySelector(".cp-novo-menu");
    if (m && !m.hidden && !m.contains(e.target) && !e.target.closest("[data-cf-novo]")) m.hidden = true;
  });
  sec.addEventListener("keydown", (e) => {
    const m = sec.querySelector(".cp-novo-menu");
    if (e.key === "Escape" && m && !m.hidden) { m.hidden = true; sec.querySelector("[data-cf-novo]")?.focus(); }
  });
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
