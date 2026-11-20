// ============================================================
// PREVENTIVAS no molde de lista (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A tela #/planos ("Manutenção preventiva") como a maquete desenhou: o mês no
// cabeçalho (← novembro de 2026 →), visões em chip que seguem o ciclo do
// serviço (Sem responsável → Com responsável → Em campo → Feitas), mais
// Atrasadas, Prédios sem preventiva e Inativas; colunas Prédio · Zona · Este
// mês · Próxima · Últimos 12 meses; a preventiva escolhida no PAINEL AO LADO
// (o mês, o cadastro, os responsáveis da zona e a tira grande).
//
// ⚠️ NENHUMA REGRA NOVA. Dados e ações são os do admin.js: _pmData e
// carregarPlanos (o mês vem do servidor), _pmBaldeDoMes / _pmAtrasada /
// _pmStatus (as leituras do mês), _pmAbrirModal (criar/editar), _pmAcao
// (escalar, gerar chamado, desativar), _pmBulkEscalar / _pmBulkChamado /
// _pmAbrirModalBulk / _pmAcaoBulk (o lote, que lê _pmSelecionados: o molde
// preenche antes de chamar), _pmSalvarZona (responsáveis da zona). O cartão
// antigo continua no HTML, escondido (.pm-antigo[hidden]); o embrulho de
// _pmRenderTudo redesenha esta tela junto.
//
// A tira dos 12 meses é a mesma da página do prédio (GET
// /planos-manutencao/meses, sem condomínio = todos os planos).

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { meses: null, mesesPedidos: false, lote: false, zonaEditando: null };
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const planos = () => (typeof _pmData !== "undefined" && Array.isArray(_pmData) ? _pmData : []);
  const semPlano = () => (typeof _pmSemPlano !== "undefined" && Array.isArray(_pmSemPlano) ? _pmSemPlano : []);
  const balde = p => (typeof _pmBaldeDoMes === "function" ? _pmBaldeDoMes(p) : "");
  const atrasada = p => typeof _pmAtrasada === "function" && _pmAtrasada(p);
  const mesAtual = () => (typeof _pmMes !== "undefined" && _pmMes) || (typeof _pmMesCorrente === "function" ? _pmMesCorrente() : "");
  const mesTxt = () => (typeof _pmMesPorExtenso === "function" ? _pmMesPorExtenso(mesAtual()) : mesAtual());
  const fmt = iso => (typeof _pmFmtData === "function" ? _pmFmtData(iso) : (iso || "—"));
  const zonas = () => (typeof _pmZonasCache !== "undefined" && Array.isArray(_pmZonasCache) ? _pmZonasCache : []);
  const respDaZona = z => (zonas().find(x => x.zona === z)?.tecnicos || []);

  // Uma lista só com dois tipos de linha: o plano, e o prédio SEM plano (que
  // só aparece na visão dele e tem uma ação só: criar).
  let _cache = { a: null, b: null, lista: [] };
  function dados() {
    const a = planos(), b = semPlano();
    if (_cache.a === a && _cache.b === b && _cache.lista.length === a.length + b.length) return _cache.lista;
    const zonaDe = x => x.condominio_zona || x.zona || "";
    const ordemZona = (x, y) => {
      const za = zonaDe(x), zb = zonaDe(y);
      if (!za !== !zb) return za ? -1 : 1; // sem zona por último
      return za.localeCompare(zb, "pt") || String(x.condominio_nome || x.nome || "").localeCompare(String(y.condominio_nome || y.nome || ""), "pt");
    };
    const lista = [...a].sort(ordemZona).concat(b.map(c => ({ ...c, _semPlano: true })).sort(ordemZona));
    _cache = { a, b, lista };
    return lista;
  }
  const chave = x => (x._semPlano ? "c" + x.id : x.id);
  const nome = x => (x._semPlano ? x.nome : x.condominio_nome) || "—";
  const zona = x => (x._semPlano ? x.zona : x.condominio_zona) || "";

  // ===== o mês (a gramática do .pm-selo antigo, no selo do molde) =====
  function mes(p) {
    if (!p.ativo) return { cls: "cz", txt: "Pausada", peso: 6 };
    if (p.estado === "feita") return { cls: "ok", txt: `Feita${p.fechado_em ? " · " + fmt(p.fechado_em) : ""}`, peso: 4 };
    if (p.estado === "em_campo") return { cls: "info", txt: `Em campo · #${p.chamado_aberto_id}`, peso: 3 };
    const b = balde(p);
    if (b === "fora-do-mes") return { cls: "cz", txt: "Fora deste mês", peso: 5 };
    if (b === "com-dono") return { cls: atrasada(p) ? "ri" : "at", txt: "Com responsável", peso: 2 };
    return { cls: atrasada(p) ? "ri" : "at", txt: "Sem responsável", peso: 1 };
  }
  const quem = p => p.tecnico_nome
    ? `${esc(p.tecnico_nome)} <span class="pv-origem${p.tecnico_origem === "escala" ? " is-escala" : ""}">${p.tecnico_origem === "escala" ? "escalado" : "pela zona"}</span>`
    : "";

  // ===== a tira (a mesma da página do prédio) =====
  function tira(p, grande) {
    const est = st.meses?.planos?.[p.id];
    if (!est) return st.meses ? `<span class="ls-mudo">${grande ? "Sem histórico ainda." : "—"}</span>` : (grande ? `<div class="ls-esq-sec"><i></i></div>` : "");
    const html = typeof _cfTira === "function" ? _cfTira(st.meses, p.id) : "";
    if (!grande) return html;
    const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const rot = m => MES[Number(m.split("-")[1]) - 1];
    const comAno = m => `${rot(m)}/${m.slice(2, 4)}`;
    const ms = st.meses.meses;
    return `<div class="pv-tira-grande">${html}<div class="pv-tira-leg">${ms.map(m => `<span>${rot(m)}</span>`).join("")}</div>
      <p class="pv-tira-legenda"><span>${comAno(ms[0])} a ${comAno(ms[ms.length - 1])}:</span> <i class="is-ok"></i>feita <i class="is-info"></i>em andamento <i class="is-ri"></i>não realizada <i></i>sem visita registrada</p></div>`;
  }

  // ===== o painel =====
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const linkCondo = (id, txt) => id ? `<button type="button" class="ls-lk is-forte" data-pv-condo="${id}" title="Abrir a página do prédio">${esc(txt)}</button>` : esc(txt);

  function blocoZona(z) {
    if (!z) return `<p class="ls-nada">Este prédio não tem zona no cadastro: a preventiva não entra no roteiro de nenhum técnico pela zona. Escale alguém no mês, ou defina a zona em Editar cadastro.</p>`;
    const resp = respDaZona(z);
    if (st.zonaEditando === z) {
      const marcados = new Set(resp.map(t => t.id));
      const tecs = typeof _pmTecnicosCache !== "undefined" && Array.isArray(_pmTecnicosCache) ? _pmTecnicosCache : [];
      return `<div class="pv-zona-edit">${tecs.length ? tecs.map(t => `<label><input type="checkbox" data-pv-zona-tec="${t.id}" ${marcados.has(t.id) ? "checked" : ""}> ${esc(t.nome)}</label>`).join("") : `<p class="ls-nada">Nenhum técnico cadastrado.</p>`}</div>
        <div class="pv-zona-bts"><button type="button" class="ls-bt is-p is-pri" data-pv-zona-salvar="${esc(z)}">Salvar</button><button type="button" class="ls-bt is-p is-ghost" data-pv-zona-cancelar>Cancelar</button></div>`;
    }
    return `<p class="pv-zona-resp">${resp.length ? resp.map(t => esc(t.nome)).join(" · ") : `<span class="ls-txt-at">sem responsável</span>`}</p>
      <p class="ls-nada">Quem está na zona vê as preventivas dela no roteiro, todo mês, sem escala.</p>
      <div class="pv-zona-bts viewer-only-hide"><button type="button" class="ls-bt is-p" data-pv-zona-editar="${esc(z)}">${ico("users")}Definir responsáveis</button></div>`;
  }

  function detalhe(x) {
    if (x._semPlano) {
      return `
        <div class="ls-l-cab">
          <div class="ls-l-sup">${ico("building-2")}${linkCondo(x.id, x.nome)}${x.zona ? `<span>·</span><span>${esc(x.zona)}</span>` : ""}</div>
          <h2>Sem preventiva</h2>
          <div class="ls-l-selo"><span class="ls-selo is-at">Sem preventiva</span><span class="ls-mudo">${esc(x.bairro || "")}</span></div>
          <div class="ls-l-acoes viewer-only-hide"><button type="button" class="ls-bt is-pri is-p" data-pv-criar="${x.id}">${ico("plus")}Criar preventiva</button></div>
        </div>
        ${sec("Por que aparece aqui", `<p class="ls-nada">É um prédio ativo da carteira sem nenhuma preventiva cadastrada: nenhum chamado de manutenção sai sozinho para ele.</p>`)}`;
    }
    const p = x, m = mes(p), s = typeof _pmStatus === "function" ? _pmStatus(p) : {};
    const z = zona(p);
    const desp = p.ativo && p.estado !== "em_campo" && p.estado !== "feita";
    const acoes = [
      `<button type="button" class="ls-bt is-p${desp && !p.tecnico_nome ? "" : " is-pri"}" data-pv-acao="editar" data-pv-id="${p.id}">${ico("pencil")}Editar</button>`,
      desp ? `<button type="button" class="ls-bt is-p${!p.tecnico_nome ? " is-pri" : ""}" data-pv-acao="despachar" data-pv-id="${p.id}">${ico("user-plus")}${p.tecnico_nome ? "Trocar técnico" : "Escalar técnico"}</button>` : "",
      p.ativo && !p.chamado_aberto_id ? `<button type="button" class="ls-bt is-p" data-pv-acao="executar" data-pv-id="${p.id}">${ico("play")}Gerar chamado agora</button>` : "",
      p.ativo ? `<button type="button" class="ls-bt is-p is-ghost is-perigo" data-pv-acao="excluir" data-pv-id="${p.id}">Desativar</button>`
        : `<button type="button" class="ls-bt is-p" data-pv-reativar="${p.id}">Reativar</button>`,
    ].join("");
    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico("repeat")}${linkCondo(p.condominio_id, p.condominio_nome || "—")}${z ? `<span>·</span><span>${esc(z)}</span>` : ""}</div>
        <h2>${esc(p.titulo && p.titulo.trim() ? p.titulo : "Preventiva")}</h2>
        <div class="ls-l-selo"><span class="ls-selo is-${m.cls}">${esc(m.txt)}</span><span class="ls-mudo">${typeof _pmPeriodLabel === "function" ? esc(_pmPeriodLabel(p.periodicidade_dias)) : ""}</span>${atrasada(p) ? `<span class="ls-selo is-ri">atrasada</span>` : ""}</div>
        <div class="ls-l-acoes viewer-only-hide">${acoes}</div>
      </div>
      ${sec(`Em ${esc(mesTxt())}`, fatos([
        ["Situação", `<span class="ls-selo is-${m.cls}">${esc(m.txt)}</span>`],
        ["Técnico", p.tecnico_nome ? quem(p) : `<span class="ls-txt-at">ninguém</span>`],
        ["Chamado", p.chamado_aberto_id ? `<button type="button" class="ls-lk" data-pv-chamado="${p.chamado_aberto_id}">#${p.chamado_aberto_id} em andamento</button>`
          : p.chamado_fechado_id ? `<button type="button" class="ls-lk" data-pv-chamado="${p.chamado_fechado_id}">#${p.chamado_fechado_id}, fechado ${fmt(p.fechado_em)}</button>` : `<span class="ls-mudo">nenhum</span>`],
        p.baixa_manual_em ? ["Baixa", `marcada à mão em ${fmt(p.baixa_manual_em)}`] : null,
      ]))}
      ${sec("Cadastro", fatos([
        ["Próxima", `${fmt(p.proxima_em)}${s.delta ? `<span class="ls-sub ${s.deltaCls === "is-bad" ? "ls-txt-ri" : ""}">${esc(s.delta)}</span>` : ""}`],
        ["Última", p.ultima_em ? fmt(p.ultima_em) : `<span class="ls-mudo">nunca executada</span>`],
        ["A cada", typeof _pmPeriodLabel === "function" ? esc(_pmPeriodLabel(p.periodicidade_dias)) : `${p.periodicidade_dias} dias`],
        ["Gera chamado", p.ativo ? "sozinho, no mês da próxima" : `<span class="ls-mudo">pausada</span>`],
        p.descricao ? ["O que fazer", `<span class="pv-desc">${esc(p.descricao)}</span>`, true] : null,
      ]))}
      ${sec(!z ? "Zona" : /^zona\b/i.test(z) ? esc(z) : `Zona ${esc(z)}`, blocoZona(z))}
      ${sec("Últimos 12 meses", tira(p, true))}`;
  }

  // ===== a lista =====
  const lista = window.GBLista.criar({
    id: "planos",
    raiz: "pvLsRoot",
    titulo: "Manutenção preventiva",
    nomePlural: "as preventivas",
    buscaDica: "Prédio, bairro, zona ou técnico",
    dados,
    chave,
    texto: x => `${nome(x)} ${x._semPlano ? x.bairro || "" : x.condominio_bairro || ""} ${zona(x)} ${x.tecnico_nome || ""} ${x.titulo || ""}`,
    estado: () => (st.carregando && !planos().length ? "carregando" : "pronto"),
    recarregar: () => entrar(true),
    visoes: [
      ["mes", "Este mês", x => !x._semPlano && x.ativo && balde(x) !== "fora-do-mes"],
      ["semdono", "Sem responsável", x => !x._semPlano && x.ativo && balde(x) === "sem-dono", "at"],
      ["comdono", "Com responsável", x => !x._semPlano && x.ativo && balde(x) === "com-dono"],
      ["campo", "Em campo", x => !x._semPlano && x.ativo && balde(x) === "em-campo", "info"],
      ["feitas", "Feitas", x => !x._semPlano && x.ativo && balde(x) === "feitas", "ok"],
      ["atrasadas", "Atrasadas", x => !x._semPlano && atrasada(x), "ri", d => d.some(x => !x._semPlano && atrasada(x))],
      ["sem", "Prédios sem preventiva", x => !!x._semPlano, "at", d => d.some(x => x._semPlano)],
      ["inativas", "Inativas", x => !x._semPlano && !x.ativo, null, d => d.some(x => !x._semPlano && !x.ativo)],
      ["todas", "Todas", x => !x._semPlano && x.ativo],
    ],
    vazios: {
      mes: "Nenhuma preventiva para este mês.",
      semdono: "Toda preventiva do mês tem responsável.",
      comdono: "Nenhuma preventiva esperando com responsável.",
      campo: "Ninguém em campo numa preventiva agora.",
      feitas: "Nenhuma preventiva feita neste mês ainda.",
      atrasadas: "Nenhuma preventiva atrasada.",
      sem: "Todo prédio ativo tem manutenção preventiva.",
      inativas: "Nenhuma preventiva pausada.",
      todas: "Nenhuma preventiva cadastrada. Use \"Nova preventiva\".",
    },
    icVazio: "calendar-check",
    frase: (d, estado) => {
      if (estado !== "pronto") return "As preventivas da carteira, mês a mês.";
      const at = d.filter(x => !x._semPlano && x.ativo);
      const c = b => at.filter(x => balde(x) === b).length;
      const falta = c("sem-dono") + c("com-dono"), campo = c("em-campo"), feitas = c("feitas");
      const atras = at.filter(atrasada).length, fora = d.filter(x => x._semPlano).length;
      const partes = [
        `<b>${pl(at.length, "prédio", "prédios")}</b> com preventiva`,
        `em ${esc(mesTxt())}: ${falta ? `<b>${falta}</b> por fazer` : "nada por fazer"}${campo ? `, <b>${campo}</b> em campo` : ""}${feitas ? `, <b>${pl(feitas, "feita", "feitas")}</b>` : ""}`,
        atras ? `<button type="button" class="ls-lk is-forte ls-txt-ri" data-ls-visao="atrasadas">${pl(atras, "atrasada", "atrasadas")} →</button>` : "",
        c("sem-dono") ? `<button type="button" class="ls-lk is-forte" data-ls-visao="semdono">${c("sem-dono")} sem responsável →</button>` : "",
        fora ? `<button type="button" class="ls-lk is-forte" data-ls-visao="sem">${pl(fora, "prédio sem preventiva", "prédios sem preventiva")} →</button>` : "",
      ].filter(Boolean);
      return partes.join(" · ");
    },
    acoes: () => {
      const corrente = typeof _pmMesCorrente === "function" ? _pmMesCorrente() : mesAtual();
      return `<div class="pv-mes" role="group" aria-label="Mês">
          <button type="button" class="ls-ib" data-pv-mes="-1" aria-label="Mês anterior">${ico("chevron-left")}</button>
          <b>${esc(mesTxt())}</b>
          <button type="button" class="ls-ib" data-pv-mes="1" aria-label="Mês seguinte">${ico("chevron-right")}</button>
          ${mesAtual() && mesAtual() !== corrente ? `<button type="button" class="ls-bt is-p is-ghost" data-pv-mes="0">Hoje</button>` : ""}
        </div>
        <button type="button" class="ls-bt is-pri viewer-only-hide" data-pv-novo>${ico("plus")}Nova preventiva</button>`;
    },
    colunas: [
      { chave: "predio", h: "Prédio", ord: x => nome(x).toLowerCase(),
        td: x => {
          if (x._semPlano) return `<b>${esc(x.nome || "—")}</b><span class="ls-sub">${esc([x.bairro].filter(Boolean).join(" · ") || "sem bairro")}</span>`;
          const perio = x.periodicidade_dias !== 30 && typeof _pmPeriodLabel === "function" ? ` <span class="pv-pill">${esc(_pmPeriodLabel(x.periodicidade_dias))}</span>` : "";
          const tit = x.titulo && x.titulo.trim().toLowerCase() !== "preventiva" ? ` <span class="pv-pill">${esc(x.titulo)}</span>` : "";
          return `<b>${esc(x.condominio_nome || "—")}</b>${perio}${tit}${!x.ativo ? ` <span class="ls-selo is-cz">pausada</span>` : ""}
            <span class="ls-sub">${esc([x.condominio_bairro, x.ultima_em ? "última " + fmt(x.ultima_em) : "nunca executada"].filter(Boolean).join(" · "))}</span>`;
        } },
      { chave: "zona", h: "Zona", cls: "ls-c-om", w: "170px", ord: x => zona(x) || null,
        td: x => { const z = zona(x); if (!z) return `<span class="ls-mudo">sem zona</span>`; const r = respDaZona(z); return `${esc(z)}<span class="ls-sub">${r.length ? esc(r.map(t => t.nome).join(" · ")) : `<span class="ls-txt-at">sem responsável</span>`}</span>`; } },
      { chave: "mes", h: "Este mês", cls: "ls-c-sit", w: "230px", ord: x => (x._semPlano ? 9 : mes(x).peso),
        td: x => {
          if (x._semPlano) return `<span class="ls-selo is-at">Sem preventiva</span>`;
          const m = mes(x), q = quem(x);
          const desp = x.ativo && x.estado !== "em_campo" && x.estado !== "feita";
          return `<span class="ls-selo is-${m.cls}">${esc(m.txt)}</span><span class="ls-sub">${q || (desp ? `<button type="button" class="ls-lk viewer-only-hide" data-pv-acao="despachar" data-pv-id="${x.id}">Escalar técnico</button>` : "&nbsp;")}</span>`;
        } },
      { chave: "proxima", h: "Próxima", w: "170px", ord: x => (x._semPlano || !x.proxima_em ? null : String(x.proxima_em).slice(0, 10)),
        td: x => {
          if (x._semPlano) return `<span class="ls-mudo">—</span>`;
          const s = typeof _pmStatus === "function" ? _pmStatus(x) : {};
          const cls = s.deltaCls === "is-bad" ? "ls-txt-ri" : s.deltaCls === "is-warn" ? "ls-txt-at" : "";
          return `<span class="ls-mono">${fmt(x.proxima_em)}</span><span class="ls-sub ${cls}">${s.chamadoId ? `<button type="button" class="ls-lk" data-pv-chamado="${s.chamadoId}">${esc(s.delta)}</button>` : esc(s.delta || "")}</span>`;
        } },
      { chave: "tira", h: "Últimos 12 meses", cls: "ls-c-om", w: "190px", td: x => (x._semPlano ? "" : tira(x)) },
      { chave: "acao", h: "", rotulo: "Ação", cls: "ls-c-om ls-num", w: "150px",
        td: x => (x._semPlano ? `<button type="button" class="ls-bt is-p viewer-only-hide" data-pv-criar="${x.id}">${ico("plus")}Criar preventiva</button>` : "") },
    ],
    classeLinha: x => (!x._semPlano && atrasada(x) ? "is-risco" : !x._semPlano && !x.ativo ? "is-inativo" : ""),
    podeMarcar: x => !x._semPlano,
    selecionados: n => (n === 1 ? "selecionada" : "selecionadas"),
    lote: sel => {
      const desp = sel.filter(p => p.ativo && p.estado !== "em_campo" && p.estado !== "feita");
      return [
        ["escalar", "Escalar técnico", "user-plus", desp.length],
        ["chamado", "Gerar chamados", "play", desp.filter(p => !p.chamado_aberto_id).length],
        ["editar", "Editar", "pencil", sel.length],
        sel.some(p => !p.ativo) ? ["ativar", "Ativar", "", sel.filter(p => !p.ativo).length] : null,
        sel.some(p => p.ativo) ? ["desativar", "Desativar", "", sel.filter(p => p.ativo).length] : null,
      ].filter(Boolean);
    },
    // O lote é o de sempre do admin.js: ele lê _pmSelecionados. O molde só
    // preenche antes; quando o admin.js limpa (deu certo), o molde limpa junto
    // (ver o embrulho de _pmRenderTudo). Cancelar o prompt deixa marcado.
    aoLote: (k, sel) => {
      if (typeof _pmSelecionados === "undefined") return;
      _pmSelecionados.clear();
      sel.forEach(p => _pmSelecionados.add(p.id));
      st.lote = true;
      if (k === "escalar") _pmBulkEscalar();
      if (k === "chamado") _pmBulkChamado();
      if (k === "editar") _pmAbrirModalBulk();
      if (k === "ativar") _pmAcaoBulk(true);
      if (k === "desativar") _pmAcaoBulk(false);
    },
    exportar: [
      ["Prédio", nome],
      ["Bairro", x => (x._semPlano ? x.bairro : x.condominio_bairro)],
      ["Zona", zona],
      ["Preventiva", x => (x._semPlano ? "sem preventiva" : x.titulo || "Preventiva")],
      ["A cada (dias)", x => (x._semPlano ? "" : x.periodicidade_dias)],
      [`Situação em ${mesTxt()}`, x => (x._semPlano ? "Sem preventiva" : mes(x).txt)],
      ["Técnico", x => x.tecnico_nome || ""],
      ["Atrasada", x => (!x._semPlano && atrasada(x) ? "sim" : "")],
      ["Próxima", x => (x._semPlano ? "" : fmt(x.proxima_em))],
      ["Última", x => (x._semPlano || !x.ultima_em ? "" : fmt(x.ultima_em))],
      ["Feitas nos últimos 12 meses", x => (x._semPlano ? "" : (st.meses?.planos?.[x.id] || []).filter(e => e === "feita").length)],
    ],
    detalhe,
    icLado: "calendar-check",
    ladoVazio: "Escolha uma preventiva na lista.",
    aoAbrir: k => {
      const x = dados().find(y => String(chave(y)) === String(k));
      if (!x) return;
      if (x._semPlano) _pmAbrirModal(null, x.id); else _pmAbrirModal(x);
    },
    aoClicar: e => {
      let el;
      if ((el = e.target.closest("[data-pv-mes]"))) { trocarMes(Number(el.dataset.pvMes)); return true; }
      if (e.target.closest("[data-pv-novo]")) { _pmAbrirModal(null); return true; }
      if ((el = e.target.closest("[data-pv-criar]"))) { _pmAbrirModal(null, Number(el.dataset.pvCriar)); return true; }
      if ((el = e.target.closest("[data-pv-condo]"))) { abrirFichaCondominio(Number(el.dataset.pvCondo), "contrato"); return true; }
      if ((el = e.target.closest("[data-pv-chamado]"))) { _chAbrirPagina(Number(el.dataset.pvChamado)); return true; }
      if ((el = e.target.closest("[data-pv-acao]"))) { _pmAcao(el.dataset.pvAcao, Number(el.dataset.pvId)); return true; }
      if ((el = e.target.closest("[data-pv-reativar]"))) { reativar(Number(el.dataset.pvReativar)); return true; }
      if ((el = e.target.closest("[data-pv-zona-editar]"))) {
        st.zonaEditando = el.dataset.pvZonaEditar;
        Promise.resolve(typeof _pmCarregarTecnicos === "function" ? _pmCarregarTecnicos() : null).then(() => lista.desenharLado());
        return true;
      }
      if (e.target.closest("[data-pv-zona-cancelar]")) { st.zonaEditando = null; lista.desenharLado(); return true; }
      if ((el = e.target.closest("[data-pv-zona-salvar]"))) {
        const ids = [...document.querySelectorAll("#pvLsRoot [data-pv-zona-tec]:checked")].map(i => Number(i.dataset.pvZonaTec));
        const z = el.dataset.pvZonaSalvar;
        st.zonaEditando = null;
        _pmSalvarZona(z, ids, el);
        return true;
      }
      return false;
    },
  });

  // Reativar: o PATCH /bulk de sempre, com um id só (o menu antigo chamava
  // DELETE também para "Reativar", que só desativa).
  async function reativar(id) {
    if (typeof _pmBulkPatch !== "function") return;
    _pmSelecionados.clear();
    _pmSelecionados.add(id);
    try { await _pmBulkPatch({ ativo: true }); _pmSelecionados.clear(); await carregarPlanos(); }
    catch (e) { alert(e.message); }
  }

  // ⚠️ TROCAR O MÊS RECARREGA DO SERVIDOR (o estado do mês é calculado lá), e
  // a seleção não sobrevive: ids marcados em setembro despachados como se
  // fossem de outubro é o erro que a competência existe para impedir.
  async function trocarMes(passo) {
    _pmMes = passo === 0 ? _pmMesCorrente() : _pmMesVizinho(mesAtual(), passo);
    _pmSelecionados.clear();
    lista.estado.marc.clear();
    st.carregando = true;
    lista.desenhar();
    try { await carregarPlanos(); } finally { st.carregando = false; lista.desenhar(); }
  }

  async function buscarMeses() {
    try {
      const r = await fetch("/planos-manutencao/meses", { headers: authHeaders() });
      if (r.ok) st.meses = await r.json();
    } catch (_) { /* a tira só não aparece */ }
    if (ativa()) lista.desenhar();
  }

  const ativa = () => document.querySelector('.section[data-section="planos"]')?.classList.contains("is-active");

  async function entrar(forcar) {
    lista.montar();
    if (forcar) { st.carregando = true; lista.desenhar(); try { await carregarPlanos(); } finally { st.carregando = false; } }
    if (!st.mesesPedidos || forcar) { st.mesesPedidos = true; buscarMeses(); }
  }

  // ===== ganchos =====
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    if (name === "planos") { st.carregando = !planos().length; }
    const r = origShow.call(this, name, ...resto);
    if (name === "planos") entrar(false);
    return r;
  };
  const origRender = window._pmRenderTudo;
  if (typeof origRender === "function") {
    window._pmRenderTudo = function (...a) {
      const r = origRender.apply(this, a);
      st.carregando = false;
      // O lote terminou: o admin.js limpa _pmSelecionados quando dá certo.
      if (st.lote && typeof _pmSelecionados !== "undefined" && !_pmSelecionados.size) { st.lote = false; lista.estado.marc.clear(); }
      if (ativa()) lista.desenhar();
      return r;
    };
  }
  // Gravou alguma coisa (carregarPlanos roda depois de toda ação): a tira pode
  // ter mudado (chamado gerado, desativada).
  const origCarregar = window.carregarPlanos;
  if (typeof origCarregar === "function") {
    window.carregarPlanos = async function (...a) {
      const r = await origCarregar.apply(this, a);
      if (ativa() && st.mesesPedidos) buscarMeses();
      return r;
    };
  }
})();
