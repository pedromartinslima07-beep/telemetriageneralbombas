// ============================================================
// INÍCIO (o que pede ação) + NOTAS FISCAIS  (redesenho, fase 3 — 18/11/2026)
// ============================================================
//
// As duas telas olham a CARTEIRA INTEIRA; a ficha do condomínio
// (admin-condominio.js) olha um prédio. As regras de "pede ação" são as
// mesmas da ficha, e os helpers de lá são reaproveitados (_cfSelo, _cfEsc,
// _cfData, _cfMoeda, _cfAbrirOrcamento, _cfAbrirChamado).
//
// ⚠️ Nenhuma regra nova de negócio nasce aqui. "Chamado urgente" é
// _chamadosAlertaAbertos (a mesma pergunta da tela Alertas), "resposta sem
// baixa" é _avPendente, "O.S. a enviar" é _osFaltaEnviar. Se uma dessas
// regras mudar no admin.js, esta tela muda junto.
//
// Perfil operador não vê nenhuma das duas (admin-nav.js esconde): elas leem
// orçamentos, O.S. e contratos, que respondem 403 para ele.

let _icContratosVencendo = null;   // null = ainda não buscou
let _icBuscando = false;
let _icBuscadoEm = 0;

function _icNomeCondo(id, fallback) {
  const c = (Array.isArray(_condominios) ? _condominios : []).find(x => Number(x.id) === Number(id));
  return c ? (c.nome_fantasia || c.nome) : (fallback || "Sem condomínio");
}

async function _icGarantirDados({ forcar = false } = {}) {
  if (_icBuscando) return;
  const velho = Date.now() - _icBuscadoEm > 60000;
  if (!forcar && !velho && _icContratosVencendo && _osLoaded && Array.isArray(_avData) && _avData.length) return;
  _icBuscando = true;
  try {
    const tarefas = [];
    if (!_osLoaded) tarefas.push(carregarOrdensServico());
    if (!Array.isArray(_avData) || !_avData.length) tarefas.push(carregarAvulsos());
    tarefas.push((async () => {
      const r = await fetch("/contratos?vencendo_em_dias=30", { headers: authHeaders() });
      _icContratosVencendo = r.ok ? await r.json() : [];
    })().catch(() => { _icContratosVencendo = []; }));
    await Promise.all(tarefas);
    _icBuscadoEm = Date.now();
  } finally {
    _icBuscando = false;
  }
  _icRenderSeAtiva();
}

function _icRenderSeAtiva() {
  const ativa = document.querySelector(".section.is-active")?.dataset.section;
  if (ativa === "inicio") renderInicio();
  if (ativa === "notas") renderNotas();
}

// ===== INÍCIO =====

// Valor só quando há valor: orçamento sem item mostraria "· —".
function _icValor(o) { return Number(o?.valor_total) ? " · " + _cfMoeda(o.valor_total) : ""; }

function _icGrupos() {
  const grupos = [];
  const reservs = [];
  for (const g of (_statusData || [])) {
    for (const r of (g.reservatorios || [])) {
      const pct = r.ultima_leitura?.nivel_pct;
      if (r.offline || (pct != null && pct < 20)) reservs.push({ g, r, pct });
    }
  }

  const urgentes = (typeof _chamadosAlertaAbertos === "function" ? _chamadosAlertaAbertos() : [])
    .filter(ch => _chEmAberto(ch.status));

  grupos.push({
    id: "urgente", titulo: "Urgente", tom: "risco",
    vazio: "Nenhum chamado urgente e nenhum reservatório crítico.",
    verTodos: { secao: "alertas", rotulo: "Abrir Alertas" },
    itens: [
      ...reservs.map(({ g, r, pct }) => ({
        condo: g.condominio?.id, condoNome: g.condominio?.nome_fantasia || g.condominio?.nome,
        txt: r.offline ? `${r.nome || "Reservatório"} sem sinal` : `${r.nome || "Reservatório"} em ${pct}%`,
        quando: r.ultima_leitura?.criado_em, attr: `data-ic-condo="${g.condominio?.id}" data-ic-aba="telemetria"`,
      })),
      ...urgentes.map(ch => ({
        condo: ch.condominio_id, condoNome: _icNomeCondo(ch.condominio_id, ch.condominio_nome),
        txt: `${_CF_PRIO[ch.prioridade] || "Chamado"}${_chamadoSlaEstourado(ch) ? " · fora do prazo" : ""}: ${ch.titulo || "Chamado #" + ch.id}`,
        quando: ch.criado_em, attr: `data-ic-chamado="${ch.id}"`,
      })),
    ],
  });

  const av = Array.isArray(_avData) ? _avData : [];
  grupos.push({
    id: "respostas", titulo: "Cliente respondeu, falta dar baixa", tom: "atencao",
    vazio: "Nenhuma resposta de cliente esperando.",
    verTodos: { secao: "orcamentos", rotulo: "Abrir Orçamentos" },
    itens: av.filter(_avPendente).map(o => ({
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      txt: `${o.status === "rejeitado" ? "Recusou" : "Aprovou"} ${o.numero || "o orçamento"}${_icValor(o)}`,
      quando: o.respondido_em, attr: `data-ic-orc="${o.id}"`,
    })),
  });

  grupos.push({
    id: "sem-nota", titulo: "Aprovado, sem nota fiscal", tom: "neutro",
    vazio: "Todo orçamento aprovado já tem nota.",
    verTodos: { secao: "notas", rotulo: "Abrir Notas fiscais" },
    itens: av.filter(o => o.status === "aprovado" && !o.nota_status).map(o => ({
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      txt: `${o.numero || "Orçamento"}${_icValor(o)}`,
      quando: o.respondido_em || o.criado_em, attr: `data-ic-orc="${o.id}"`,
    })),
  });

  grupos.push({
    id: "nota-erro", titulo: "Nota com erro", tom: "risco",
    vazio: null, // grupo só aparece quando tem item
    verTodos: { secao: "notas", rotulo: "Abrir Notas fiscais" },
    itens: av.filter(o => o.nota_status === "erro").map(o => ({
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      txt: `${o.nota_tipo === "nfe" ? "DANFE" : "NFS-e"} de ${o.numero || "orçamento"}${o.nota_erro ? ": " + o.nota_erro : ""}`,
      quando: o.nota_solicitada_em, attr: `data-ic-orc="${o.id}"`,
    })),
  });

  const os = Array.isArray(_osData) ? _osData : [];
  grupos.push({
    id: "os", titulo: "O.S. finalizada, não enviada ao cliente", tom: "atencao",
    vazio: "Toda O.S. finalizada já foi enviada.",
    verTodos: { secao: "ordens-servico", rotulo: "Abrir O.S." },
    itens: os.filter(_osFaltaEnviar).map(o => ({
      condo: o.condominio_id, condoNome: o.condominio_nome || _icNomeCondo(o.condominio_id),
      txt: `${o.numero || "O.S. #" + o.id}${o.tecnico_nome ? " · " + o.tecnico_nome : ""}`,
      quando: o.finalizada_em, attr: `data-ic-os="${o.id}"`,
    })),
  });

  grupos.push({
    id: "contratos", titulo: "Contrato vencendo em 30 dias", tom: "atencao",
    vazio: _icContratosVencendo == null ? "Carregando…" : "Nenhum contrato vence nos próximos 30 dias.",
    verTodos: { secao: "contratos", rotulo: "Abrir Contratos" },
    itens: (_icContratosVencendo || []).map(ct => ({
      condo: ct.condominio_id, condoNome: _icNomeCondo(ct.condominio_id, ct.condominio_nome),
      txt: ct.dias_para_vencer < 0 ? `Vencido há ${-ct.dias_para_vencer} dia${ct.dias_para_vencer === -1 ? "" : "s"}` : `Vence em ${ct.dias_para_vencer} dia${ct.dias_para_vencer === 1 ? "" : "s"} · ${_cfData(ct.fim_em)}`,
      quando: ct.fim_em, attr: `data-ic-contrato="${ct.id}" data-ic-contrato-condo="${ct.condominio_id}"`,
      ordem: ct.dias_para_vencer,
    })),
  });

  for (const g of grupos) {
    if (g.id === "contratos") g.itens.sort((a, b) => a.ordem - b.ordem);
    else g.itens.sort((a, b) => new Date(a.quando || 0) - new Date(b.quando || 0)); // o mais antigo esperando primeiro
  }
  return grupos.filter(g => g.itens.length || g.vazio);
}

const _IC_MAX = 8;

function renderInicio() {
  const root = document.getElementById("icRoot");
  if (!root) return;
  const grupos = _icGrupos();
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  const cards = grupos.map(g => {
    const n = g.itens.length;
    const linhas = g.itens.slice(0, _IC_MAX).map(it => `<li>
      <button class="ic-item" ${it.attr}>
        <span class="ic-predio">${_cfEsc(it.condoNome || "—")}</span>
        <span class="ic-txt">${_cfEsc(it.txt)}</span>
        <span class="ic-quando">${it.quando ? _tempoRelativo(it.quando) : ""}</span>
      </button></li>`).join("");
    return `<section class="ic-grupo is-${n ? g.tom : "vazio"}" data-ic-grupo="${g.id}">
      <header class="ic-grupo-head">
        <h2 class="ic-h2">${g.titulo}</h2>
        <span class="ic-n">${n || ""}</span>
      </header>
      ${n ? `<ul class="ic-lista">${linhas}</ul>` : `<p class="ic-vazio">${g.vazio}</p>`}
      ${n > _IC_MAX ? `<button class="ic-mais" data-ic-secao="${g.verTodos.secao}">Mais ${n - _IC_MAX} · ${g.verTodos.rotulo}</button>` : ""}
    </section>`;
  }).join("");

  root.innerHTML = `
    <header class="ic-head">
      <p class="ic-resumo">${total ? `${total} ${total === 1 ? "coisa pede" : "coisas pedem"} ação na carteira.` : "Nada pedindo ação agora."}</p>
    </header>
    <div class="ic-grade">${cards}</div>`;
}

// ===== NOTAS FISCAIS (a carteira inteira; a nota mora no orçamento) =====

let _nfAba = "todas";
let _nfBusca = "";

function _nfLinhas() {
  const av = Array.isArray(_avData) ? _avData : [];
  const comNota = av.filter(o => o.nota_status);
  const semNota = av.filter(o => o.status === "aprovado" && !o.nota_status);
  return { comNota, semNota };
}

function renderNotas() {
  const root = document.getElementById("nfRoot");
  if (!root) return;
  const { comNota, semNota } = _nfLinhas();
  const abas = [
    ["todas", "Emitidas e em andamento", comNota.length],
    ["emitida", "Emitidas", comNota.filter(o => o.nota_status === "emitida").length],
    ["processando", "Processando", comNota.filter(o => o.nota_status === "processando").length],
    ["erro", "Com erro", comNota.filter(o => o.nota_status === "erro").length],
    ["sem", "Aprovados sem nota", semNota.length],
  ];
  let lista = _nfAba === "sem" ? semNota : _nfAba === "todas" ? comNota : comNota.filter(o => o.nota_status === _nfAba);
  const q = _nfBusca.trim().toLowerCase();
  if (q) {
    lista = lista.filter(o => [o.nota_numero, o.numero, _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome)]
      .some(v => String(v || "").toLowerCase().includes(q)));
  }
  lista = [...lista].sort((a, b) => new Date(b.nota_emitida_em || b.nota_solicitada_em || b.respondido_em || b.criado_em) -
                                     new Date(a.nota_emitida_em || a.nota_solicitada_em || a.respondido_em || a.criado_em));

  const stTxt = { processando: ["Processando", "atencao"], emitida: ["Emitida", "ok"], erro: ["Erro", "risco"], cancelada: ["Cancelada", "neutro"] };
  const linhas = lista.map(o => {
    const [t, tom] = o.nota_status ? (stTxt[o.nota_status] || [o.nota_status, "neutro"]) : ["Sem nota", "neutro"];
    const quando = o.nota_emitida_em || o.nota_solicitada_em || o.respondido_em;
    return `<tr class="cf-linha" data-ic-orc="${o.id}" tabindex="0">
      <td class="cf-num">${_cfEsc(o.nota_numero || "—")}</td>
      <td>${o.nota_status ? (o.nota_tipo === "nfe" ? "DANFE" : "NFS-e") : "—"}</td>
      <td><div class="cf-l1">${_cfEsc(_icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome))}</div>
        <div class="cf-l2">${_cfEsc(o.numero || "")}</div></td>
      <td>${_cfSelo(t, tom)}${o.nota_status === "erro" && o.nota_erro ? `<div class="cf-l2 is-atencao">${_cfEsc(o.nota_erro)}</div>` : ""}</td>
      <td class="cf-num">${_cfMoeda(o.nota_valor || o.valor_total)}</td>
      <td>${_cfData(quando)}</td>
    </tr>`;
  });

  root.innerHTML = `
    <div class="nf-barra">
      <div class="wa-tabs" role="tablist">${abas.map(([id, rot, n]) =>
        `<button class="wa-tab${id === _nfAba ? " is-active" : ""}" role="tab" aria-selected="${id === _nfAba}" data-nf-aba="${id}">${rot}${n ? ` <span class="wa-count">${n}</span>` : ""}</button>`).join("")}</div>
      <input type="search" class="nf-busca" id="nfBusca" placeholder="Buscar nota, orçamento ou prédio…" value="${_cfEsc(_nfBusca)}" aria-label="Buscar nota fiscal">
    </div>
    ${lista.length
      ? _cfTabela([{ t: "Nº da nota", num: true }, { t: "Tipo" }, { t: "Prédio e orçamento" }, { t: "Situação" }, { t: "Valor", num: true }, { t: "Data" }], linhas)
      : `<div class="cf-vazio"><p>${q ? "Nada encontrado com essa busca." : _nfAba === "sem" ? "Todo orçamento aprovado já tem nota." : "Nenhuma nota nesta situação."}</p></div>`}
    <p class="cf-nota">A nota é emitida e acompanhada pela ficha do orçamento. Clique na linha para abrir.</p>`;
}

// ===== CLIQUES =====

document.addEventListener("DOMContentLoaded", () => {
  const agir = (e) => {
    const alvo = e.target.closest("[data-ic-chamado],[data-ic-orc],[data-ic-os],[data-ic-contrato],[data-ic-condo],[data-ic-secao],[data-nf-aba]");
    if (!alvo) return;
    const ds = alvo.dataset;
    if (ds.nfAba)      { _nfAba = ds.nfAba; renderNotas(); return; }
    if (ds.icSecao)    { showSection(ds.icSecao); return; }
    if (ds.icChamado)  { _cfAbrirChamado(Number(ds.icChamado)); return; }
    if (ds.icOrc)      { _cfAbrirOrcamento(Number(ds.icOrc)); return; }
    if (ds.icOs)       { abrirOSDetalhe(Number(ds.icOs)); return; }
    if (ds.icContrato) { _ctrAbrirModal({ condoId: Number(ds.icContratoCondo), contratoId: Number(ds.icContrato) }); return; }
    if (ds.icCondo)    { abrirFichaCondominio(Number(ds.icCondo), ds.icAba || "resumo"); return; }
  };
  for (const sel of ['.section[data-section="inicio"]', '.section[data-section="notas"]']) {
    const sec = document.querySelector(sel);
    if (!sec) continue;
    sec.addEventListener("click", agir);
    sec.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches?.(".cf-linha")) { e.preventDefault(); agir(e); }
    });
  }
  document.querySelector('.section[data-section="notas"]')?.addEventListener("input", (e) => {
    if (e.target.id !== "nfBusca") return;
    _nfBusca = e.target.value;
    const pos = e.target.selectionStart;
    renderNotas();
    const campo = document.getElementById("nfBusca");
    campo?.focus(); campo?.setSelectionRange(pos, pos);
  });
});

// ===== GANCHOS =====
// Mesma técnica da ficha (ver o fim de admin-condominio.js): quando o admin
// redesenha uma lista depois de gravar, estas telas redesenham junto.

(function _icLigarGanchos() {
  let agendado = false;
  const redesenhar = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; _icRenderSeAtiva(); });
  };
  // carregarTelemetria (7 s) e carregarAtendimento (20 s) são o polling: são
  // async, então o redesenho espera a promessa, senão desenharia o dado velho.
  for (const nome of ["_osRenderTabela", "_avRenderTudo", "renderChamados", "_ctrRefrescarListas", "carregarTelemetria", "carregarAtendimento"]) {
    const orig = window[nome];
    if (typeof orig !== "function") continue;
    window[nome] = function (...args) {
      if (nome === "_ctrRefrescarListas") _icBuscadoEm = 0; // contrato mudou: rebusca os que vencem
      const r = orig.apply(this, args);
      Promise.resolve(r).then(redesenhar, redesenhar);
      return r;
    };
  }
  // Abrir a tela busca o que falta.
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    const r = origShow.call(this, name, ...resto);
    if (name === "inicio" || name === "notas") {
      _icRenderSeAtiva();
      _icGarantirDados();
    }
    return r;
  };
})();
