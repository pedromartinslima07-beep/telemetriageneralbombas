// ============================================================
// AGENDA — QUADRO DE DESPACHO com arrastar e soltar
// (redesenho estrutural, etapa 4, 19/11/2026)
// ============================================================
//
// Uma vista nova da Agenda ("Quadro", a de abertura no computador), no molde
// do Dispatch Board do ServiceTitan: técnicos nas linhas, dias da semana nas
// colunas, uma linha "Empresa" para o que não é de técnico (reunião,
// pagamento, faturamento do Omie, contrato terminando, retorno de O.S.), e à
// esquerda a coluna "A agendar" com os chamados em aberto sem visita marcada.
// As vistas Semana, Mês e Lista do admin-agenda.js continuam.
//
// O QUE O ARRASTAR GRAVA (rotas de sempre, nenhuma nova):
//   · chamado → técnico num dia: cria um compromisso "visita" ligado ao
//     chamado (POST /agenda/compromissos com chamado_id, migration 093) e
//     atribui o técnico ao chamado (PATCH /chamados/:id), para ele ver no app;
//   · visita → outra célula: muda o dia (mantém a hora) e o técnico
//     (PATCH /agenda/compromissos/:id; e o chamado, se a visita tiver um);
//   · visita → coluna "A agendar": desmarca (DELETE, que só marca apagado).
// Toda ação mostra "Desfazer". Compromisso que se repete não arrasta (mexer
// nele mudaria a série inteira): abre o formulário.
//
// Sem mouse (celular, teclado): o botão "Agendar" de cada chamado e o
// "Remarcar" da visita fazem o mesmo por um formulário curto.
//
// Roda depois do admin-agenda.js e usa o estado dele (_agVista, _agRef,
// _agItens, _agCarregar, _agInvalidar, _agAbrirForm...).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });
  const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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
    if (_agVista !== "quadro") {
      origRender();
      // As outras vistas ganham o botão "Quadro" na troca de vistas.
      const tabs = document.querySelector("#agRoot .ag-vistas");
      if (tabs && !tabs.querySelector('[data-ag-vista="quadro"]')) {
        tabs.insertAdjacentHTML("afterbegin", `<button type="button" class="wa-tab" data-ag-vista="quadro">Quadro</button>`);
      }
      return;
    }
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
  let filaFiltro = "chamados"; // chamados | preventivas

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
    const semana = _agItens.filter(it => it.fonte === "compromisso");
    const fila = aAgendar();
    const filaPrev = fila.filter(ch => ch.plano_manutencao_id != null);
    const filaCh = fila.filter(ch => ch.plano_manutencao_id == null);
    const mostrar = filaFiltro === "preventivas" ? filaPrev : filaCh;
    const esperando = _agCarregando && !_agItens.length;
    const vistas = [["quadro", "Quadro"], ["semana", "Semana"], ["mes", "Mês"], ["lista", "Lista"]];

    root.innerHTML = `
      <div class="dq">
        <header class="dq-cab">
          <div class="dq-nav">
            <button type="button" class="dq-bt" data-ag-nav="hoje">Hoje</button>
            <button type="button" class="dq-ib" data-ag-nav="-1" aria-label="Semana anterior">${ico("chevron-left")}</button>
            <button type="button" class="dq-ib" data-ag-nav="1" aria-label="Próxima semana">${ico("chevron-right")}</button>
            <h2>${_agTituloPeriodo()}</h2>
            ${_agCarregando ? `<span class="dq-sync" role="status">${_agItens.length ? "Atualizando…" : "Carregando…"}</span>` : ""}
          </div>
          <span class="dq-esp"></span>
          <div class="dq-seg" role="group" aria-label="Vista">
            ${vistas.map(([v, r]) => `<button type="button" data-ag-vista="${v}" class="${_agVista === v ? "is-on" : ""}" aria-pressed="${_agVista === v}">${r}</button>`).join("")}
          </div>
          <button type="button" class="dq-bt is-pri viewer-only-hide" data-ag-novo="${hoje}">${ico("plus")}Compromisso</button>
        </header>
        <div class="dq-corpo">
          <aside class="dq-fila" data-dq-drop="fila" aria-label="Chamados a agendar">
            <div class="dq-fila-cab">
              <b>A agendar</b><span class="dq-n">${fila.length}</span>
            </div>
            <div class="dq-fila-tabs" role="group">
              <button type="button" data-dq-fila="chamados" class="${filaFiltro === "chamados" ? "is-on" : ""}">Chamados <span>${filaCh.length}</span></button>
              <button type="button" data-dq-fila="preventivas" class="${filaFiltro === "preventivas" ? "is-on" : ""}">Preventivas <span>${filaPrev.length}</span></button>
            </div>
            <p class="dq-dica">${ico("hand")}Arraste para um técnico e um dia. Solte uma visita aqui para desmarcar.</p>
            <div class="dq-fila-lista">
              ${mostrar.length ? mostrar.map(cardFila).join("") : `<div class="dq-fila-vazia">${ico("circle-check")}<b>Nada a agendar.</b><span>${filaFiltro === "preventivas" ? "Toda preventiva em aberto já tem visita marcada." : "Todo chamado em aberto já tem visita marcada."}</span></div>`}
            </div>
          </aside>
          <div class="dq-grade-wrap${esperando ? " is-carregando" : ""}" aria-busy="${esperando}">
            <div class="dq-grade" style="--dq-dias:${dias.length};grid-template-columns: 168px repeat(${dias.length}, minmax(108px, 1fr))">
              <div class="dq-gcab dq-canto"></div>
              ${dias.map(d => {
                const iso = _agIso(d);
                return `<div class="dq-gcab${iso === hoje ? " is-hoje" : ""}"><span>${DIAS[d.getDay()]}</span><b>${d.getDate()}</b>${iso === hoje ? "<em>hoje</em>" : ""}</div>`;
              }).join("")}
              ${linhas.map(l => {
                const n = semana.filter(it => linhaDe(it) === l.id && l.id).length;
                const ini = String(l.nome || "?").split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
                return `
                <div class="dq-tec${l.id ? "" : " is-empresa"}">
                  ${l.id ? `<span class="dq-av">${esc(ini)}</span>` : `<span class="dq-av is-emp">${ico("building")}</span>`}
                  <span class="dq-tec-txt"><b>${esc(l.nome)}</b><small>${l.id ? `${n} visita${n === 1 ? "" : "s"} na semana` : esc(l.sub)}</small></span>
                </div>
                ${dias.map(d => {
                  const iso = _agIso(d);
                  const its = (porCelula.get(`${l.id}|${iso}`) || []).sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || new Date(a.inicio) - new Date(b.inicio));
                  return `<div class="dq-cel${iso === hoje ? " is-hoje" : ""}${l.id ? "" : " is-empresa"}" data-dq-drop="${l.id}|${iso}">
                    ${its.map(cardGrade).join("")}
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

  function cardGrade(it) {
    const tipo = it.chamado_id ? "chamado" : it.tipo;
    const cls = { chamado: "is-ch", visita: "is-visita", reuniao: "is-reuniao", pagamento: "is-fin", financeiro: "is-fin", faturamento: "is-fin",
      retorno: "is-retorno", contrato: "is-contrato", preventiva: "is-prev", outro: "is-outro" }[tipo] || "is-outro";
    const arrasta = it.fonte === "compromisso" && it.repeticao === "nenhuma";
    const resolvido = it.chamado_id && ["fechado", "cancelado"].includes(it.chamado_status);
    const hora = it.dia_inteiro ? "" : `<span class="dq-hora">${_agHora(it.inicio)}</span>`;
    const titulo = it.tipo === "contrato" && it.condominio_nome ? `Contrato de ${it.condominio_nome} termina` : it.titulo;
    return `<button type="button" class="dq-ag ${cls}${resolvido ? " is-feito" : ""}${it.concluido ? " is-feito" : ""}" data-dq-item="${esc(it.id)}"
        ${arrasta ? `draggable="true" data-dq-arrasta="cp:${it.compromisso_id}:${esc(it.id)}"` : ""}
        title="${esc(titulo)}${arrasta ? " — arraste para remarcar" : ""}">
      ${hora}<span class="dq-ag-tit">${esc(titulo)}</span>
      ${it.condominio_nome && it.tipo !== "contrato" ? `<small>${esc(it.condominio_nome)}</small>` : ""}
      ${it.repeticao && it.repeticao !== "nenhuma" ? `<i class="dq-rep" title="Repete">${ico("repeat")}</i>` : ""}
    </button>`;
  }

  // ===== gravações =====
  const hojeISO = () => _agIso(new Date());
  function horaLivre(tecId, dia) {
    // Primeira hora cheia livre do técnico no dia, das 8h às 17h.
    const usadas = new Set(_agItens.filter(it => !it.dia_inteiro && linhaDe(it) === tecId && _agDia(it.inicio) === dia)
      .map(it => new Date(it.inicio).getHours()));
    for (let h = 8; h <= 17; h++) if (!usadas.has(h)) return `${String(h).padStart(2, "0")}:00`;
    return "08:00";
  }
  const instante = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
  async function req(url, metodo, corpo) {
    const r = await fetch(url, { method: metodo, headers: { ...authHeaders(), "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  async function recarregar() {
    _agInvalidar();
    await Promise.all([_agCarregar(), typeof carregarChamados === "function" ? carregarChamados().catch(() => {}) : null]);
    if (typeof renderChamados === "function") renderChamados(); // a fila do Atendimento e o painel acompanham
    if (_agVista === "quadro") renderQuadro();
  }

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

  async function moverVisita(compId, itemId, tecId, dia, hora) {
    const it = _agItens.find(x => x.id === itemId);
    if (!it) return;
    const tecNovo = tecId ? tecnicos().find(t => t.id === tecId) : null;
    if (it.chamado_id && !tecNovo) { toast("A visita de um chamado fica na linha de um técnico."); return; }
    const antes = { inicio: it.inicio, responsavel_id: it.responsavel_id ?? null, tecCh: it.chamado_tecnico_id ?? null };
    const h = hora || (it.dia_inteiro ? "08:00" : _agHora(it.inicio));
    const corpo = { inicio: it.dia_inteiro ? new Date(`${dia}T00:00:00-03:00`).toISOString() : instante(dia, h), responsavel_id: tecNovo ? (tecNovo.usuario_id || null) : null };
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
        await req(`/agenda/compromissos/${compId}`, "PATCH", { inicio: antes.inicio, responsavel_id: antes.responsavel_id });
        if (it.chamado_id && tecNovo && antes.tecCh !== tecNovo.id) await req(`/chamados/${it.chamado_id}`, "PATCH", { tecnico_id: antes.tecCh });
      } catch (e) { toast(`Não consegui desfazer: ${e.message}`); }
      await recarregar();
    });
  }

  async function desmarcar(compId, itemId) {
    const it = _agItens.find(x => x.id === itemId);
    if (!it) return;
    try { await req(`/agenda/compromissos/${compId}`, "DELETE"); }
    catch (e) { toast(`Não consegui desmarcar: ${e.message}`); return; }
    await recarregar();
    toast(`Visita desmarcada${it.chamado_id ? `; o #${it.chamado_id} voltou para "a agendar"` : ""}`, async () => {
      try {
        await req("/agenda/compromissos", "POST", {
          titulo: it.titulo, tipo: it.tipo, inicio: it.inicio, fim: it.fim || null, dia_inteiro: !!it.dia_inteiro,
          condominio_id: it.condominio_id || null, responsavel_id: it.responsavel_id || null, chamado_id: it.chamado_id || null,
          descricao: it.descricao || null,
        });
      } catch (e) { toast(`Não consegui desfazer: ${e.message}`); }
      await recarregar();
    });
  }
  const rotDia = iso => {
    const d = new Date(iso + "T12:00:00");
    return iso === hojeISO() ? "hoje" : `${DIAS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // ===== aviso com Desfazer =====
  let toastT;
  function toast(msg, desfazer) {
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
    el.innerHTML = `<span>${esc(msg)}</span>${desfazer ? `<button type="button" data-dq-desfazer>Desfazer</button>` : ""}<button type="button" class="dq-toast-x" data-dq-fechar-toast aria-label="Fechar">×</button>`;
    el._desfazer = desfazer || null;
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, desfazer ? 8000 : 4500);
  }

  // ===== formulário curto: agendar / remarcar sem arrastar =====
  function abrirAgendar({ chId, compId, itemId }, ancora) {
    document.getElementById("dqPop")?.remove();
    const it = itemId ? _agItens.find(x => x.id === itemId) : null;
    const ch = chId ? chamados().find(c => c.id === chId) : null;
    const tecs = tecnicos();
    const tecAtual = it ? linhaDe(it) : (ch?.tecnico_id || tecs[0]?.id || 0);
    const dia = it ? _agDia(it.inicio) : (_agIso(new Date()) < _agIso(_agPeriodo().ini) ? _agIso(_agPeriodo().ini) : _agIso(new Date()));
    const hora = it && !it.dia_inteiro ? _agHora(it.inicio) : horaLivre(tecAtual, dia);
    const pop = document.createElement("div");
    pop.id = "dqPop";
    pop.className = "dq-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", ch ? "Agendar visita" : "Remarcar");
    pop.innerHTML = `
      <b class="dq-pop-tit">${ch ? `Agendar #${ch.id}` : "Remarcar"}</b>
      <span class="dq-pop-sub">${esc(ch ? ch.titulo : it?.titulo)}</span>
      <label>Técnico<select data-dq-f="tec">${tecs.map(t => `<option value="${t.id}" ${t.id === tecAtual ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}${!it?.chamado_id && !ch ? `<option value="0" ${tecAtual === 0 ? "selected" : ""}>Empresa</option>` : ""}</select></label>
      <div class="dq-pop-2">
        <label>Dia<input type="date" data-dq-f="dia" value="${dia}"></label>
        <label>Hora<input type="time" data-dq-f="hora" value="${hora}" step="900" ${it?.dia_inteiro ? "disabled" : ""}></label>
      </div>
      <div class="dq-pop-acoes">
        ${it ? `<button type="button" class="dq-bt is-p is-perigo" data-dq-pop="desmarcar">Desmarcar</button>` : ""}
        <span class="dq-esp"></span>
        <button type="button" class="dq-bt is-p" data-dq-pop="cancelar">Cancelar</button>
        <button type="button" class="dq-bt is-p is-pri" data-dq-pop="ok">${ch ? "Agendar" : "Salvar"}</button>
      </div>`;
    document.body.appendChild(pop);
    const r = ancora.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
    pop.querySelector("select")?.focus();
    pop.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-dq-pop]");
      if (!b) return;
      const acao = b.dataset.dqPop;
      if (acao === "cancelar") return pop.remove();
      if (acao === "desmarcar") { pop.remove(); return desmarcar(compId, itemId); }
      const tecId = Number(pop.querySelector('[data-dq-f="tec"]').value);
      const d = pop.querySelector('[data-dq-f="dia"]').value;
      const hh = pop.querySelector('[data-dq-f="hora"]').value || "08:00";
      if (!d) return;
      pop.remove();
      if (ch) return agendarChamado(ch.id, tecId, d, hh);
      return moverVisita(compId, itemId, tecId, d, hh);
    });
  }
  document.addEventListener("mousedown", (e) => {
    const pop = document.getElementById("dqPop");
    if (pop && !pop.contains(e.target) && !e.target.closest("[data-dq-agendar],[data-dq-acao]")) pop.remove();
    const m = document.getElementById("dqMenu");
    if (m && !m.contains(e.target) && !e.target.closest("[data-dq-item]")) m.remove();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { document.getElementById("dqPop")?.remove(); document.getElementById("dqMenu")?.remove(); }
  });

  // Clique numa visita do quadro: um menu com o que dá para fazer com ela.
  function menuItem(it, ancora) {
    document.getElementById("dqMenu")?.remove();
    const m = document.createElement("div");
    m.id = "dqMenu";
    m.className = "gb-menu dq-menu";
    m.setAttribute("role", "menu");
    const comp = it.fonte === "compromisso";
    const rep = comp && it.repeticao !== "nenhuma";
    m.innerHTML = `
      <div class="dq-menu-cab"><b>${esc(it.titulo)}</b><small>${it.dia_inteiro ? "dia inteiro" : _agHora(it.inicio)}${it.condominio_nome ? " · " + esc(it.condominio_nome) : ""}</small></div>
      ${it.chamado_id ? `<button type="button" role="menuitem" data-dq-acao="chamado">${ico("inbox")}Abrir o chamado #${it.chamado_id}</button>` : ""}
      ${comp && !rep ? `<button type="button" role="menuitem" data-dq-acao="remarcar">${ico("calendar-clock")}Remarcar</button>` : ""}
      ${comp ? `<button type="button" role="menuitem" data-dq-acao="editar">${ico("pencil")}${rep ? "Editar a série" : "Editar"}</button>` : ""}
      ${!comp ? `<button type="button" role="menuitem" data-dq-acao="abrir">${ico("external-link")}Abrir</button>` : ""}
      ${comp && !rep ? `<hr><button type="button" role="menuitem" data-dq-acao="desmarcar" class="is-perigo">${ico("calendar-x")}Desmarcar</button>` : ""}`;
    document.body.appendChild(m);
    const r = ancora.getBoundingClientRect();
    m.style.position = "fixed";
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = (r.bottom + 4 + m.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - m.offsetHeight - 4) : r.bottom + 4) + "px";
    icones(m);
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dq-acao]");
      if (!b) return;
      const a = b.dataset.dqAcao;
      m.remove();
      if (a === "chamado") return typeof gbAtEscolher === "function" ? gbAtEscolher(it.chamado_id) : _chAbrirPagina(it.chamado_id);
      if (a === "remarcar") return abrirAgendar({ compId: it.compromisso_id, itemId: it.id }, ancora);
      if (a === "editar") return _agAbrirForm(null, it);
      if (a === "desmarcar") return desmarcar(it.compromisso_id, it.id);
      if (a === "abrir") {
        if (it.fonte === "os") return abrirOSDetalhe(it.os_id);
        if (it.fonte === "contrato" && it.condominio_id) return abrirFichaCondominio(it.condominio_id, "contrato");
        if (it.fonte === "preventivas") return showSection("planos");
        if (it.fonte === "omie") return _agAbrirFaturamento(it.competencia);
      }
    });
  }

  // ===== eventos =====
  // Os cliques de navegação (‹ › Hoje, vistas, Compromisso) usam os
  // data-ag-* que o admin-agenda.js já escuta no #agRoot.
  document.addEventListener("click", (e) => {
    if (_agVista !== "quadro" || !e.target.closest("#agRoot")) return;
    let el;
    if ((el = e.target.closest("[data-dq-fila]"))) { filaFiltro = el.dataset.dqFila; renderQuadro(); return; }
    if ((el = e.target.closest("[data-dq-agendar]"))) { e.stopPropagation(); abrirAgendar({ chId: Number(el.dataset.dqAgendar) }, el); return; }
    if ((el = e.target.closest("[data-dq-item]"))) {
      e.stopPropagation();
      const it = _agItens.find(x => x.id === el.dataset.dqItem);
      if (it) menuItem(it, el);
      return;
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
    document.getElementById("dqMenu")?.remove();
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
    const [, compId, ...resto] = quem.split(":");
    const itemId = resto.join(":");
    if (destino === "fila") return desmarcar(Number(compId), itemId);
    const [tec, dia] = destino.split("|");
    return moverVisita(Number(compId), itemId, Number(tec), dia);
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
