// ============================================================
// AGENDA — QUADRO DE DESPACHO com arrastar e soltar
// (redesenho estrutural, etapa 4, 19/11/2026)
// ============================================================
//
// Uma vista nova da Agenda ("Quadro", a de abertura no computador), no molde
// do Dispatch Board do ServiceTitan: técnicos nas linhas, dias da semana nas
// colunas, uma linha "Empresa" para o que não é de técnico (reunião,
// pagamento, faturamento do Omie, contrato terminando, retorno de O.S.), e à
// esquerda a fila com os chamados em aberto sem visita marcada.
//
// O QUE O ARRASTAR GRAVA:
//   · chamado → técnico num dia: cria um compromisso "visita" ligado ao
//     chamado (POST /agenda/compromissos com chamado_id, migration 093) e
//     atribui o técnico ao chamado (PATCH /chamados/:id), para ele ver no app;
//   · visita → outra célula: muda o dia (mantém a hora) e o técnico
//     (PATCH /agenda/compromissos/:id; e o chamado, se a visita tiver um);
//   · visita → fila: desmarca (DELETE, que só marca apagado).
// Toda ação mostra "Desfazer".
//
// 27/11/2026 (migration 111): o item ganhou o círculo de feito e o CARTÃO
// (admin-agenda.js, _agCartao) no lugar do menu; compromisso que repete
// também arrasta, perguntando "só esta / esta e as próximas / todas"; a fila
// ganhou a aba Atrasados; clicar no espaço vazio de uma célula cria ali.
//
// Sem mouse (celular, teclado): o botão "Agendar" de cada chamado e o
// "Remarcar" do cartão fazem o mesmo por um formulário curto.
//
// Roda depois do admin-agenda.js e usa o estado e as peças dele (_agVista,
// _agRef, _agItens, _agAtras, _agCarregar, _agInvalidar, _agCartao,
// _agAlcance, _agMover, _agApagar, _agToast, _agItemGrade...).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });
  const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const toast = (...a) => _agToast(...a);

  // Abre no Quadro no computador; no celular continua a Lista.
  if (window.innerWidth >= 900 && typeof _agVista !== "undefined") _agVista = "quadro";

  // ===== período e render: o Quadro entra nas funções da agenda =====
  const origPeriodo = window._agPeriodo;
  window._agPeriodo = function () {
    if (_agVista !== "quadro") return origPeriodo();
    const ini = _agInicioSemana(_agRef);
    return { ini, fim: _agSomaDias(ini, 6) };
  };
  const origTitulo = window._agTituloPeriodo;
  window._agTituloPeriodo = function () {
    if (_agVista !== "quadro") return origTitulo();
    const v = _agVista; _agVista = "semana";
    try { return origTitulo(); } finally { _agVista = v; }
  };
  const origRender = window._agRender;
  window._agRender = function () {
    if (_agVista !== "quadro") return origRender();
    renderQuadro();
  };

  // ===== dados =====
  const tecnicos = () => (typeof _tecnicosData !== "undefined" && Array.isArray(_tecnicosData) ? _tecnicosData : [])
    .filter(t => t.cargo === "tecnico" && t.ativo !== false)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const chamados = () => (typeof _chamadosData !== "undefined" && Array.isArray(_chamadosData) ? _chamadosData : []);
  const abertoCh = ch => typeof _chEmAberto === "function" ? _chEmAberto(ch.status) : !["fechado", "cancelado"].includes(ch.status);
  const visitas = () => (typeof _agVisitasChamados !== "undefined" ? _agVisitasChamados || {} : {});

  function diasDaSemana() {
    const { ini } = _agPeriodo();
    const dias = Array.from({ length: 7 }, (_, i) => _agSomaDias(ini, i));
    // Domingo só aparece quando tem alguma coisa nele.
    const dom = _agIso(dias[6]);
    const temDom = _agItens.some(it => _agDia(it.inicio) === dom);
    return temDom ? dias : dias.slice(0, 6);
  }

  // Em que linha um item cai: técnico (pelo chamado ligado ou pelo
  // responsável) ou "Empresa".
  function linhaDe(it) {
    const tecs = tecnicos();
    if (it.chamado_tecnico_id && tecs.some(t => t.id === it.chamado_tecnico_id)) return it.chamado_tecnico_id;
    if (it.responsavel_id) {
      const t = tecs.find(x => Number(x.usuario_id) === Number(it.responsavel_id));
      if (t) return t.id;
    }
    return 0;
  }

  function aAgendar() {
    const v = visitas();
    return chamados()
      .filter(ch => abertoCh(ch) && !v[ch.id])
      .sort((a, b) => {
        const fa = typeof _chamadoSlaEstourado === "function" && _chamadoSlaEstourado(a) ? 0 : 1;
        const fb = typeof _chamadoSlaEstourado === "function" && _chamadoSlaEstourado(b) ? 0 : 1;
        const pa = { p1: 0, p2: 1, p3: 2, p4: 3 }[String(a.prioridade).toLowerCase()] ?? 4;
        const pb = { p1: 0, p2: 1, p3: 2, p4: 3 }[String(b.prioridade).toLowerCase()] ?? 4;
        return fa - fb || pa - pb || new Date(a.criado_em) - new Date(b.criado_em);
      });
  }

  // ===== desenho =====
  let filaFiltro = "chamados"; // chamados | preventivas | atrasados

  function renderQuadro() {
    const root = document.getElementById("agRoot");
    if (!root) return;
    const dias = diasDaSemana();
    const hoje = _agIso(new Date());
    const tecs = tecnicos();
    const linhas = [...tecs.map(t => ({ id: t.id, nome: t.nome, t })), { id: 0, nome: "Empresa", sub: "reuniões, pagamentos, Omie, contratos" }];
    const porCelula = new Map();
    for (const it of _agItens) {
      const k = `${linhaDe(it)}|${_agDia(it.inicio)}`;
      if (!porCelula.has(k)) porCelula.set(k, []);
      porCelula.get(k).push(it);
    }
    const fila = aAgendar();
    const filaPrev = fila.filter(ch => ch.plano_manutencao_id != null);
    const filaCh = fila.filter(ch => ch.plano_manutencao_id == null);
    const atras = _agAtras;
    const esperando = _agCarregando && !_agItens.length;
    const lista = filaFiltro === "atrasados" ? atras.map(cardAtrasado) : (filaFiltro === "preventivas" ? filaPrev : filaCh).map(cardFila);
    const vazio = filaFiltro === "atrasados"
      ? `<div class="dq-fila-vazia">${ico("circle-check")}<b>Nada atrasado.</b><span>Tudo o que passou foi feito ou remarcado.</span></div>`
      : `<div class="dq-fila-vazia">${ico("circle-check")}<b>Nada a agendar.</b><span>${filaFiltro === "preventivas" ? "Toda preventiva em aberto já tem visita marcada." : "Todo chamado em aberto já tem visita marcada."}</span></div>`;

    root.innerHTML = `
      <div class="dq">
        ${_agCabecalho()}
        <div class="dq-corpo">
          <aside class="dq-fila" data-dq-drop="fila" aria-label="${filaFiltro === "atrasados" ? "Passou da data" : "Chamados a agendar"}">
            <div class="dq-fila-cab">
              <b>${filaFiltro === "atrasados" ? "Passou da data" : "A agendar"}</b><span class="dq-n">${filaFiltro === "atrasados" ? atras.length : fila.length}</span>
            </div>
            <div class="dq-fila-tabs" role="group">
              <button type="button" data-dq-fila="chamados" class="${filaFiltro === "chamados" ? "is-on" : ""}">Chamados <span>${filaCh.length}</span></button>
              <button type="button" data-dq-fila="preventivas" class="${filaFiltro === "preventivas" ? "is-on" : ""}">Preventivas <span>${filaPrev.length}</span></button>
              <button type="button" data-dq-fila="atrasados" class="is-atr ${filaFiltro === "atrasados" ? "is-on" : ""}">Atrasados <span>${atras.length}</span></button>
            </div>
            <p class="dq-dica">${filaFiltro === "atrasados"
              ? `${ico("alarm-clock")}O que passou do dia sem ser marcado como feito (últimos 30 dias). Marque ou remarque; nada some sozinho.`
              : `${ico("hand")}Arraste para um técnico e um dia. Solte uma visita aqui para desmarcar.`}</p>
            <div class="dq-fila-lista">${lista.length ? lista.join("") : vazio}</div>
          </aside>
          <div class="dq-grade-wrap${esperando ? " is-carregando" : ""}" aria-busy="${esperando}">
            <div class="dq-grade" style="--dq-dias:${dias.length};grid-template-columns: 168px repeat(${dias.length}, minmax(118px, 1fr))">
              <div class="dq-gcab dq-canto"></div>
              ${dias.map(d => {
                const iso = _agIso(d);
                return `<div class="dq-gcab${iso === hoje ? " is-hoje" : ""}"><span>${DIAS[d.getDay()]}</span><b>${d.getDate()}</b>${iso === hoje ? "<em>hoje</em>" : ""}</div>`;
              }).join("")}
              ${linhas.map(l => {
                const meus = l.id ? _agItens.filter(it => linhaDe(it) === l.id && it.fonte === "compromisso") : [];
                const feitos = meus.filter(_agFeito).length;
                const ini = String(l.nome || "?").split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
                return `
                <div class="dq-tec${l.id ? "" : " is-empresa"}">
                  ${l.id ? `<span class="dq-av">${esc(ini)}</span>` : `<span class="dq-av is-emp">${ico("building")}</span>`}
                  <span class="dq-tec-txt"><b>${esc(l.nome)}</b><small>${l.id ? (meus.length ? `${feitos} de ${meus.length} feita${meus.length === 1 ? "" : "s"} na semana` : "nada na semana") : esc(l.sub)}</small></span>
                </div>
                ${dias.map(d => {
                  const iso = _agIso(d);
                  const its = (porCelula.get(`${l.id}|${iso}`) || []).sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || new Date(a.inicio) - new Date(b.inicio));
                  return `<div class="dq-cel${iso === hoje ? " is-hoje" : ""}${l.id ? "" : " is-empresa"}" data-dq-drop="${l.id}|${iso}">
                    ${its.map(it => _agItemGrade(it, { arrasta: it.fonte === "compromisso" })).join("")}<span class="dq-cel-mais viewer-only-hide">${ico("plus")}novo</span>
                  </div>`;
                }).join("")}`;
              }).join("")}
            </div>
            ${!tecs.length ? `<p class="dq-aviso">${ico("info")}Nenhum técnico ativo cadastrado. Cadastre em Colaboradores para ter as linhas do quadro.</p>` : ""}
          </div>
        </div>
      </div>`;
    icones(root);
  }

  function cardFila(ch) {
    const p = String(ch.prioridade || "p3").toLowerCase();
    const fora = typeof _chamadoSlaEstourado === "function" && _chamadoSlaEstourado(ch);
    return `<div class="dq-card dq-card-fila" draggable="true" data-dq-arrasta="ch:${ch.id}" tabindex="0">
      <div class="dq-card-l1"><span class="dq-prio is-${p}">${p.toUpperCase()}</span>${fora ? `<span class="dq-fora">fora do prazo</span>` : ""}<span class="dq-esp"></span><span class="dq-num">#${ch.id}</span></div>
      <b>${esc(ch.titulo || "Sem título")}</b>
      <small>${esc(ch.condominio_nome || "Sem condomínio")}${ch.tecnico_nome ? " · " + esc(ch.tecnico_nome) : " · sem técnico"}</small>
      <button type="button" class="dq-bt is-p" data-dq-agendar="${ch.id}">${ico("calendar-plus")}Agendar</button>
    </div>`;
  }

  function cardAtrasado(it) {
    const quem = _agQuem(it);
    return `<div class="dq-card dq-card-atr" data-ag-item="${esc(it.id)}" role="button" tabindex="0">
      <div class="dq-card-l1"><span class="dq-quando">${esc(_agRotDia(_agDia(it.inicio)))}${it.dia_inteiro ? "" : " · " + _agHora(it.inicio)}</span><span class="dq-esp"></span>${it.chamado_id ? `<span class="dq-num">#${it.chamado_id}</span>` : ""}</div>
      <b>${esc(_agTitulo(it))}</b>
      <small>${esc([it.tipo !== "contrato" ? it.condominio_nome : null, quem, _agRepete(it) ? _agRotRep(it) : null].filter(Boolean).join(" · ") || "Empresa")}</small>
      <div class="dq-card-acoes viewer-only-hide">
        ${_agMarcavel(it) ? `<button type="button" class="dq-bt is-p is-ok" data-ag-ck="${esc(it.id)}">${ico("check")}Feito</button>` : ""}
        ${it.fonte === "compromisso" ? `<button type="button" class="dq-bt is-p" data-ag-remarcar="${esc(it.id)}">${ico("calendar-clock")}Remarcar</button>` : ""}
      </div>
    </div>`;
  }

  // ===== gravações =====
  function horaLivre(tecId, dia) {
    // Primeira hora cheia livre do técnico no dia, das 8h às 17h.
    const usadas = new Set(_agItens.filter(it => !it.dia_inteiro && linhaDe(it) === tecId && _agDia(it.inicio) === dia)
      .map(it => new Date(it.inicio).getHours()));
    for (let h = 8; h <= 17; h++) if (!usadas.has(h)) return `${String(h).padStart(2, "0")}:00`;
    return "08:00";
  }
  const instante = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
  const req = (...a) => _agReq(...a);
  async function recarregar() {
    _agInvalidar();
    await Promise.all([_agCarregar(), typeof carregarChamados === "function" ? carregarChamados().catch(() => {}) : null]);
    if (typeof renderChamados === "function") renderChamados(); // a fila do Atendimento e o painel acompanham
    if (_agVista === "quadro") renderQuadro();
  }
  // As gravações do admin-agenda.js (feito, cartão, formulário) recarregam
  // também os chamados: a fila "a agendar" depende deles.
  _agDepoisDeGravar = recarregar;

  async function agendarChamado(chId, tecId, dia, hora) {
    const ch = chamados().find(c => c.id === chId);
    if (!ch) return;
    const tec = tecnicos().find(t => t.id === tecId);
    if (!tec) { toast("Escolha a linha de um técnico para agendar um chamado."); return; }
    hora = hora || horaLivre(tecId, dia);
    const tecAntes = ch.tecnico_id || null;
    let criado;
    try {
      criado = await req("/agenda/compromissos", "POST", {
        titulo: `#${ch.id} · ${ch.titulo || "Chamado"}`.slice(0, 160), tipo: "visita", inicio: instante(dia, hora),
        condominio_id: ch.condominio_id || null, responsavel_id: tec.usuario_id || null, chamado_id: ch.id,
        descricao: `Visita do chamado #${ch.id}`,
      });
      if (tecAntes !== tec.id) await req(`/chamados/${ch.id}`, "PATCH", { tecnico_id: tec.id });
    } catch (e) {
      toast(`Não consegui agendar: ${e.message}`);
      await recarregar();
      return;
    }
    await recarregar();
    toast(`#${ch.id} com ${tec.nome.split(" ")[0]}, ${rotDia(dia)} às ${hora}${tecAntes !== tec.id ? " · técnico atribuído" : ""}`, async () => {
      try {
        await req(`/agenda/compromissos/${criado.id}`, "DELETE");
        if (tecAntes !== tec.id) await req(`/chamados/${ch.id}`, "PATCH", { tecnico_id: tecAntes });
      } catch (e) { toast(`Não consegui desfazer: ${e.message}`); }
      await recarregar();
    });
  }

  // Compromisso que NÃO repete: muda dia/hora/técnico na linha (e o técnico
  // do chamado, se for visita de chamado).
  async function moverVisita(compId, itemId, tecId, dia, hora) {
    const it = _agAcharItem(itemId);
    if (!it) return;
    const tecNovo = tecId ? tecnicos().find(t => t.id === tecId) : null;
    if (it.chamado_id && !tecNovo) { toast("A visita de um chamado fica na linha de um técnico."); return; }
    const antes = { inicio: it.inicio, responsavel_id: it.responsavel_id ?? null, tecCh: it.chamado_tecnico_id ?? null };
    const h = hora || (it.dia_inteiro ? "08:00" : _agHora(it.inicio));
    const corpo = { inicio: it.dia_inteiro ? new Date(`${dia}T00:00:00-03:00`).toISOString() : instante(dia, h), responsavel_id: tecNovo ? (tecNovo.usuario_id || null) : null };
    if (it.fim) corpo.fim = new Date(new Date(corpo.inicio).getTime() + (new Date(it.fim) - new Date(it.inicio))).toISOString();
    if (corpo.inicio === it.inicio && linhaDe(it) === (tecId || 0)) return;
    try {
      await req(`/agenda/compromissos/${compId}`, "PATCH", corpo);
      if (it.chamado_id && tecNovo && antes.tecCh !== tecNovo.id) await req(`/chamados/${it.chamado_id}`, "PATCH", { tecnico_id: tecNovo.id });
    } catch (e) {
      toast(`Não consegui remarcar: ${e.message}`);
      await recarregar();
      return;
    }
    await recarregar();
    toast(`Remarcado: ${tecNovo ? tecNovo.nome.split(" ")[0] : "Empresa"}, ${rotDia(dia)}${it.dia_inteiro ? "" : " às " + h}`, async () => {
      try {
        const volta = { inicio: antes.inicio, responsavel_id: antes.responsavel_id };
        if (it.fim) volta.fim = it.fim;
        await req(`/agenda/compromissos/${compId}`, "PATCH", volta);
        if (it.chamado_id && tecNovo && antes.tecCh !== tecNovo.id) await req(`/chamados/${it.chamado_id}`, "PATCH", { tecnico_id: antes.tecCh });
      } catch (e) { toast(`Não consegui desfazer: ${e.message}`); }
      await recarregar();
    });
  }

  // Mover qualquer compromisso para (técnico, dia, hora). O que repete
  // pergunta o alcance antes.
  async function mover(it, tecId, dia, hora, ancora, alcance) {
    if (!_agRepete(it)) return moverVisita(it.compromisso_id, it.id, tecId, dia, hora);
    const alc = alcance || await _agAlcance(it, "Mover", ancora);
    if (!alc) return;
    const tecNovo = tecId ? tecnicos().find(t => t.id === tecId) : null;
    const resp = linhaDe(it) === (tecId || 0) ? undefined : (tecNovo ? tecNovo.usuario_id || null : null);
    return _agMover(it, alc, dia, it.dia_inteiro ? null : (hora || _agHora(it.inicio)), resp);
  }

  // Tirar uma visita do quadro (solta na fila). O que repete pergunta.
  async function desmarcar(itemId, ancora) {
    const it = _agAcharItem(itemId);
    if (!it) return;
    const alc = await _agAlcance(it, "Apagar", ancora);
    if (!alc) return;
    if (alc === "todas" && _agRepete(it) && !confirm(`Apagar "${it.titulo}" e todas as repetições?`)) return;
    return _agApagar(it, alc);
  }
  const rotDia = iso => _agRotDia(iso);

  // ===== formulário curto: agendar / remarcar sem arrastar =====
  function abrirAgendar({ chId, itemId, alcance }, ancora) {
    _agFecharPops();
    const it = itemId ? _agAcharItem(itemId) : null;
    const ch = chId ? chamados().find(c => c.id === chId) : null;
    const tecs = tecnicos();
    const tecAtual = it ? linhaDe(it) : (ch?.tecnico_id || tecs[0]?.id || 0);
    const dia = it ? _agDia(it.inicio) : (_agIso(new Date()) < _agIso(_agPeriodo().ini) ? _agIso(_agPeriodo().ini) : _agIso(new Date()));
    const hora = it && !it.dia_inteiro ? _agHora(it.inicio) : horaLivre(tecAtual, dia);
    const pop = document.createElement("div");
    pop.className = "dq-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", ch ? "Agendar visita" : "Remarcar");
    pop.innerHTML = `
      <b class="dq-pop-tit">${ch ? `Agendar #${ch.id}` : "Remarcar"}${it && _agRepete(it) ? " · " + esc(_agRotAlc(alcance)) : ""}</b>
      <span class="dq-pop-sub">${esc(ch ? ch.titulo : _agTitulo(it))}</span>
      <label>Técnico<select data-dq-f="tec">${tecs.map(t => `<option value="${t.id}" ${t.id === tecAtual ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}${!it?.chamado_id && !ch ? `<option value="0" ${tecAtual === 0 ? "selected" : ""}>Empresa</option>` : ""}</select></label>
      <div class="dq-pop-2">
        <label>Dia<input type="date" data-dq-f="dia" value="${dia}"></label>
        <label>Hora<input type="time" data-dq-f="hora" value="${hora}" step="900" ${it?.dia_inteiro ? "disabled" : ""}></label>
      </div>
      <div class="dq-pop-acoes">
        <span class="dq-esp"></span>
        <button type="button" class="dq-bt is-p" data-dq-pop="cancelar">Cancelar</button>
        <button type="button" class="dq-bt is-p is-pri" data-dq-pop="ok">${ch ? "Agendar" : "Salvar"}</button>
      </div>`;
    document.body.appendChild(pop);
    // A grade pode ter sido redesenhada desde o clique (ver _agAncora).
    const anc = _agAncora(ancora);
    const r = anc ? anc.getBoundingClientRect() : { left: innerWidth / 2 - 150, top: innerHeight / 3, bottom: innerHeight / 3 };
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
    pop.querySelector("select")?.focus();
    pop.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-dq-pop]");
      if (!b) return;
      if (b.dataset.dqPop === "cancelar") return pop.remove();
      const tecId = Number(pop.querySelector('[data-dq-f="tec"]').value);
      const d = pop.querySelector('[data-dq-f="dia"]').value;
      const hh = pop.querySelector('[data-dq-f="hora"]').value || "08:00";
      if (!d) return;
      pop.remove();
      if (ch) return agendarChamado(ch.id, tecId, d, hh);
      return mover(it, tecId, d, hh, ancora, alcance);
    });
  }
  // O "Remarcar" do cartão, no Quadro, também escolhe o técnico.
  window._dqRemarcar = (it, ancora, alcance) => {
    if (_agVista !== "quadro") return _agRemarcar(it, ancora, alcance);
    abrirAgendar({ itemId: it.id, alcance }, ancora);
  };

  // ===== eventos =====
  // Os cliques de navegação (‹ › Hoje, vistas, Compromisso) usam os
  // data-ag-* que o admin-agenda.js já escuta no #agRoot.
  document.addEventListener("click", async (e) => {
    if (_agVista !== "quadro" || !e.target.closest("#agRoot")) return;
    let el;
    if ((el = e.target.closest("[data-dq-fila]"))) { filaFiltro = el.dataset.dqFila; renderQuadro(); return; }
    if ((el = e.target.closest("[data-dq-agendar]"))) { e.stopPropagation(); abrirAgendar({ chId: Number(el.dataset.dqAgendar) }, el); return; }
    if ((el = e.target.closest("[data-ag-ck]"))) { e.stopPropagation(); _agFecharPops(); _agAlternarFeito(el.dataset.agCk); return; }
    if ((el = e.target.closest("[data-ag-remarcar]"))) {
      e.stopPropagation();
      const it = _agAcharItem(el.dataset.agRemarcar);
      if (!it) return;
      const alc = await _agAlcance(it, "Remarcar", el);
      if (alc) abrirAgendar({ itemId: it.id, alcance: alc }, el);
      return;
    }
    if ((el = e.target.closest("[data-ag-item]"))) { e.stopPropagation(); _agCartao(el.dataset.agItem, el); return; }
    // Espaço vazio de uma célula: criar ali (na linha de um técnico, já com
    // ele como responsável).
    if ((el = e.target.closest(".dq-cel[data-dq-drop]")) && !document.body.classList.contains("role-viewer")) {
      e.stopPropagation();
      const [tec, dia] = el.dataset.dqDrop.split("|");
      const t = tecnicos().find(x => x.id === Number(tec));
      _agNovoRapido(dia, el, t ? { responsavel_id: t.usuario_id || null, rotulo: t.nome.split(" ")[0], tipo: "visita" } : { rotulo: "Empresa" });
    }
  }, true);

  let arrastando = null;
  document.addEventListener("dragstart", (e) => {
    const el = e.target.closest?.("[data-dq-arrasta]");
    if (!el) return;
    arrastando = el.dataset.dqArrasta;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", arrastando);
    el.classList.add("is-arrastando");
    document.getElementById("agRoot")?.querySelector(".dq")?.classList.add("is-arrastando");
    _agFecharPops();
  });
  document.addEventListener("dragend", (e) => {
    e.target.closest?.("[data-dq-arrasta]")?.classList.remove("is-arrastando");
    document.querySelectorAll(".dq-sobre").forEach(x => x.classList.remove("dq-sobre"));
    document.querySelector("#agRoot .dq")?.classList.remove("is-arrastando");
    arrastando = null;
  });
  document.addEventListener("dragover", (e) => {
    const alvo = e.target.closest?.("[data-dq-drop]");
    if (!alvo || !arrastando) return;
    // Chamado não cai na linha Empresa nem volta para a fila; visita de chamado não vai para Empresa.
    const ehCh = arrastando.startsWith("ch:");
    const destino = alvo.dataset.dqDrop;
    if (ehCh && (destino === "fila" || destino.startsWith("0|"))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!alvo.classList.contains("dq-sobre")) {
      document.querySelectorAll(".dq-sobre").forEach(x => x.classList.remove("dq-sobre"));
      alvo.classList.add("dq-sobre");
    }
  });
  document.addEventListener("dragleave", (e) => {
    const alvo = e.target.closest?.("[data-dq-drop]");
    if (alvo && !alvo.contains(e.relatedTarget)) alvo.classList.remove("dq-sobre");
  });
  document.addEventListener("drop", (e) => {
    const alvo = e.target.closest?.("[data-dq-drop]");
    if (!alvo || !arrastando) return;
    e.preventDefault();
    alvo.classList.remove("dq-sobre");
    const quem = arrastando;
    arrastando = null;
    const destino = alvo.dataset.dqDrop;
    if (quem.startsWith("ch:")) {
      const [tec, dia] = destino.split("|");
      return agendarChamado(Number(quem.slice(3)), Number(tec), dia);
    }
    const [, , ...resto] = quem.split(":");
    const itemId = resto.join(":");
    if (destino === "fila") return desmarcar(itemId, alvo);
    const it = _agAcharItem(itemId);
    if (!it) return;
    const [tec, dia] = destino.split("|");
    if (dia === _agDia(it.inicio) && Number(tec) === linhaDe(it)) return;
    return mover(it, Number(tec), dia, null, alvo);
  });

  // Gravou um chamado em outra tela: a fila "a agendar" acompanha.
  const origRC = window.renderChamados;
  if (typeof origRC === "function") {
    window.renderChamados = function (...a) {
      const r = origRC.apply(this, a);
      if (_agVista === "quadro" && document.querySelector('.section[data-section="agenda"]')?.classList.contains("is-active")) renderQuadro();
      return r;
    };
  }
})();
