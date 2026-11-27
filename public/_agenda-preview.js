// Maquete da Agenda (27/11/2026): ver o cabeçalho de _agenda-preview.html.
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = r => window.lucide?.createIcons?.({ root: r });
  const HOJE = "2026-11-27";
  const DIAS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];
  const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const rotDia = iso => { const d = new Date(iso + "T12:00:00"); return iso === HOJE ? "hoje" : `${DOW[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const rotLongo = iso => { const d = new Date(iso + "T12:00:00"); return `${["domingo","segunda","terça","quarta","quinta","sexta","sábado"][d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; };
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const TECS = [{ id: 1, nome: "Carlos Souza" }, { id: 2, nome: "Rafael Lima" }, { id: 3, nome: "Diego Alves" }];

  // fonte: visita (chamado) | compromisso | retorno | contrato | omie
  const INICIAL = () => [
    { id: "a1", fonte: "visita", ch: 412, tit: "#412 · Bomba de recalque não liga", onde: "Cond. Aurora", lin: 1, dia: "2026-11-23", hora: "08:00", feito: { quem: "Carlos", quando: "seg 23/11, 11:40", os: "OS-1203" } },
    { id: "a2", fonte: "visita", ch: 415, tit: "#415 · Vazamento no barrilete", onde: "Ed. Ipê", lin: 2, dia: "2026-11-24", hora: "09:00" },
    { id: "a3", fonte: "visita", ch: 418, tit: "#418 · Boia travada", onde: "Res. Solar", lin: 1, dia: "2026-11-25", hora: "14:00", feito: { quem: "Carlos", quando: "qua 25/11, 15:10", os: "OS-1209" } },
    { id: "a4", fonte: "visita", ch: 409, tit: "#409 · Limpeza de reservatório", onde: "Ed. Monte Verde", lin: 3, dia: "2026-11-27", hora: "08:00" },
    { id: "a5", fonte: "visita", ch: 421, tit: "#421 · Painel em falha", onde: "Cond. Aurora", lin: 2, dia: "2026-11-27", hora: "10:00" },
    { id: "a6", fonte: "visita", ch: 423, tit: "#423 · Troca de pressostato", onde: "Ed. Bela Vista", lin: 1, dia: "2026-11-28", hora: "09:00" },
    { id: "a7", fonte: "visita", ch: 401, tit: "#401 · Ruído na bomba 2", onde: "Ed. Ipê", lin: 3, dia: "2026-11-24", hora: "13:00", feito: { quem: "Diego", quando: "ter 24/11, 14:25", os: "OS-1206" } },
    { id: "e1", fonte: "retorno", tit: "Retorno pedido na OS-1187", onde: "Res. Solar", lin: 0, dia: "2026-11-23", hora: null },
    { id: "e2", fonte: "compromisso", tipo: "financeiro", tit: "Pagamento da quinzena da equipe", lin: 0, dia: "2026-11-25", hora: null, serie: "s-pag", rep: "Todo mês, dia 25", soAdmin: true },
    { id: "e3", fonte: "compromisso", tipo: "reuniao", tit: "Reunião com o síndico do Aurora", onde: "Cond. Aurora", lin: 0, dia: "2026-11-26", hora: "15:00", quem: "Pedro", feito: { quem: "Pedro", quando: "qui 26/11, 16:05" } },
    { id: "e4", fonte: "compromisso", tipo: "reuniao", tit: "Reunião da equipe", lin: 0, dia: "2026-11-23", hora: "07:30", serie: "s-reu", rep: "Toda segunda", feito: { quem: "Pedro", quando: "seg 23/11, 08:10" } },
    { id: "e5", fonte: "omie", tit: "Conferir e faturar os contratos: 77 de 81", lin: 0, dia: "2026-11-27", hora: null, soAdmin: true },
    { id: "e6", fonte: "contrato", tit: "Contrato do Ed. Ipê termina", onde: "Ed. Ipê", lin: 0, dia: "2026-11-28", hora: null },
    { id: "e7", fonte: "compromisso", tipo: "outro", tit: "Levar orçamento impresso", onde: "Ed. Bela Vista", lin: 0, dia: "2026-11-24", hora: "16:00", quem: "Pedro" },
    // Outras semanas (aparecem no Mês, na Lista e ao navegar na Semana).
    ...["2026-11-02", "2026-11-09", "2026-11-16"].map((d, i) => ({ id: "r" + i, fonte: "compromisso", tipo: "reuniao", tit: "Reunião da equipe", lin: 0, dia: d, hora: "07:30", serie: "s-reu", rep: "Toda segunda", feito: { quem: "Pedro", quando: rotDia(d) + ", 08:05" } })),
    ...["2026-11-30", "2026-12-07"].map((d, i) => ({ id: "rf" + i, fonte: "compromisso", tipo: "reuniao", tit: "Reunião da equipe", lin: 0, dia: d, hora: "07:30", serie: "s-reu", rep: "Toda segunda" })),
    { id: "p0", fonte: "compromisso", tipo: "financeiro", tit: "Pagamento da quinzena da equipe", lin: 0, dia: "2026-11-10", hora: null, serie: "s-pag10", rep: "Todo mês, dia 10", soAdmin: true, feito: { quem: "Pedro", quando: "ter 10/11, 09:12" } },
    { id: "b1", fonte: "visita", ch: 388, tit: "#388 · Bomba sem pressão", onde: "Ed. Monte Verde", lin: 1, dia: "2026-11-04", hora: "09:00", feito: { quem: "Carlos", quando: "qua 04/11, 10:30", os: "OS-1171" } },
    { id: "b2", fonte: "visita", ch: 392, tit: "#392 · Painel desarmando", onde: "Cond. Aurora", lin: 2, dia: "2026-11-10", hora: "14:00", feito: { quem: "Rafael", quando: "ter 10/11, 16:00", os: "OS-1180" } },
    { id: "b3", fonte: "visita", ch: 395, tit: "#395 · Troca de boia", onde: "Res. Solar", lin: 3, dia: "2026-11-12", hora: "08:00", feito: { quem: "Diego", quando: "qui 12/11, 09:40", os: "OS-1187" } },
    { id: "b4", fonte: "visita", ch: 399, tit: "#399 · Vazamento no ladrão", onde: "Ed. Ipê", lin: 1, dia: "2026-11-18", hora: "10:00", feito: { quem: "Carlos", quando: "qua 18/11, 11:15", os: "OS-1192" } },
    { id: "b5", fonte: "visita", ch: 402, tit: "#402 · Ruído no recalque", onde: "Ed. Bela Vista", lin: 2, dia: "2026-11-19", hora: "13:00", feito: { quem: "Rafael", quando: "qui 19/11, 14:50", os: "OS-1195" } },
    { id: "b6", fonte: "visita", ch: 404, tit: "#404 · Bomba 1 não parte", onde: "Res. Solar", lin: 3, dia: "2026-11-19", hora: "08:00", feito: { quem: "Diego", quando: "qui 19/11, 09:20", os: "OS-1194" } },
    { id: "b7", fonte: "compromisso", tipo: "reuniao", tit: "Reunião com o síndico do Ipê", onde: "Ed. Ipê", lin: 0, dia: "2026-11-19", hora: "17:00", quem: "Pedro", feito: { quem: "Pedro", quando: "qui 19/11, 18:00" } },
    { id: "c1", fonte: "visita", ch: 427, tit: "#427 · Revisão do quadro elétrico", onde: "Ed. Monte Verde", lin: 2, dia: "2026-11-30", hora: "09:00" },
    { id: "c2", fonte: "visita", ch: 428, tit: "#428 · Medição de nível", onde: "Cond. Aurora", lin: 3, dia: "2026-12-01", hora: "08:00" },
    { id: "c3", fonte: "compromisso", tipo: "outro", tit: "Renovar seguro do carro", lin: 0, dia: "2026-12-02", hora: null, quem: "Pedro" },
    { id: "c4", fonte: "compromisso", tipo: "reuniao", tit: "Visita comercial · Ed. Jardins", onde: "Ed. Jardins", lin: 0, dia: "2026-12-03", hora: "10:00", quem: "Pedro" },
  ];
  // Ocorrências futuras da série (não aparecem nesta semana, mas o "esta e as próximas" mostra o alcance).
  const FILA = [
    { ch: 426, p: "p1", tit: "Sem água no bloco B", onde: "Cond. Aurora", fora: true },
    { ch: 425, p: "p2", tit: "Bomba desarmando", onde: "Ed. Bela Vista" },
  ];
  const FILA_PREV = [{ ch: 430, p: "p3", tit: "Preventiva de novembro", onde: "Res. Solar" }];

  let itens = INICIAL();
  let filaAba = "chamados";
  let vista = innerWidth < 760 ? "lista" : "quadro";
  let semIni = "2026-11-23"; // segunda da semana mostrada na Semana

  const atrasado = it => !it.feito && it.dia < HOJE && it.fonte !== "omie";
  const cls = it => ({ visita: "is-ch", retorno: "is-retorno", contrato: "is-contrato", omie: "is-fin" })[it.fonte]
    || ({ reuniao: "is-reuniao", financeiro: "is-fin", pagamento: "is-fin", visita: "is-visita" })[it.tipo] || "is-outro";
  const cor = it => ({ "is-ch": "#0d2775", "is-visita": "#0d2775", "is-retorno": "#c48a12", "is-contrato": "#c48a12", "is-fin": "#6b4fd0", "is-reuniao": "#56648a", "is-outro": "#56648a" })[cls(it)];
  const auto = it => it.fonte === "omie"; // conclui sozinho

  function cardGrade(it, { quem = false } = {}) {
    const at = atrasado(it);
    return `<div class="dq-ag ${cls(it)}${it.feito ? " is-feito" : ""}${at ? " is-atrasado" : ""}" data-it="${it.id}" role="button" tabindex="0"
        draggable="${auto(it) ? "false" : "true"}" title="${esc(it.tit)}">
      <button type="button" class="dq-ck${auto(it) ? " is-auto" : ""}" data-ck="${it.id}" aria-label="${it.feito ? "Reabrir" : "Marcar como feito"}"
        title="${auto(it) ? "Conclui sozinho quando as 81 notas saírem" : it.feito ? "Feito · clique para reabrir" : "Marcar como feito"}">${ico("check")}</button>
      <span class="dq-ag-corpo">
        ${it.hora ? `<span class="dq-hora">${it.hora}</span>` : ""}<span class="dq-ag-tit">${esc(it.tit)}</span>${it.serie ? `<i class="dq-rep">${ico("repeat")}</i>` : ""}
        ${it.onde && it.fonte !== "contrato" ? `<small>${esc(it.onde)}</small>` : ""}
        ${quem && it.lin ? `<small>${esc(nomeLin(it.lin))}</small>` : ""}
        ${at ? `<span class="dq-atr">ATRASADO</span>` : ""}
      </span>
    </div>`;
  }
  const nomeLin = l => l ? TECS.find(t => t.id === l).nome : "Empresa";
  const porHora = (a, b) => (a.hora ? 1 : 0) - (b.hora ? 1 : 0) || (a.hora || "").localeCompare(b.hora || "");

  // ── cabeçalho comum às quatro vistas ──
  function cabecalho(titulo) {
    const vs = [["quadro", "Quadro"], ["semana", "Semana"], ["mes", "Mês"], ["lista", "Lista"]];
    return `<header class="dq-cab">
          <div class="dq-nav">
            <button type="button" class="dq-bt" data-nav="hoje">Hoje</button>
            <button type="button" class="dq-ib" data-nav="-1" aria-label="Anterior">${ico("chevron-left")}</button>
            <button type="button" class="dq-ib" data-nav="1" aria-label="Próximo">${ico("chevron-right")}</button>
            <h2>${titulo}</h2>
          </div>
          <span class="dq-esp"></span>
          <div class="dq-seg" role="group">${vs.map(([v, r]) => `<button type="button" data-vista="${v}" class="${vista === v ? "is-on" : ""}" aria-pressed="${vista === v}">${r}</button>`).join("")}</div>
          <button type="button" class="dq-bt is-pri" data-novo="${HOJE}|0">${ico("plus")}Compromisso</button>
        </header>`;
  }
  function tituloSemana(ini) {
    const a = new Date(ini + "T12:00:00"), b = new Date(somaDias(ini, 6) + "T12:00:00");
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} a ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`
      : `${a.getDate()} de ${MESES[a.getMonth()]} a ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  }

  // ── SEMANA: sete colunas; o mesmo item do Quadro, com o nome do técnico ──
  function renderSemana() {
    const dias = Array.from({ length: 7 }, (_, i) => somaDias(semIni, i));
    return `${cabecalho(tituloSemana(semIni))}
      <div class="ags">${dias.map(iso => {
        const d = new Date(iso + "T12:00:00");
        const its = itens.filter(it => it.dia === iso).sort(porHora);
        return `<div class="ags-col${iso === HOJE ? " is-hoje" : ""}">
          <div class="ags-cab"><span>${DOW[d.getDay()]}</span><b>${d.getDate()}</b>${iso === HOJE ? "<em>hoje</em>" : ""}</div>
          <div class="ags-itens dq-cel" data-cel="${iso}|*">${its.map(it => cardGrade(it, { quem: true })).join("")}<span class="dq-cel-mais">${ico("plus")}novo</span></div>
        </div>`;
      }).join("")}</div>`;
  }

  // ── MÊS: item pequeno, sem círculo; feito riscado com ✓, atrasado com fio vermelho ──
  function renderMes() {
    const ini = "2026-10-26";
    const cab = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="agm-dow">${d}</div>`).join("");
    const cels = Array.from({ length: 42 }, (_, i) => {
      const iso = somaDias(ini, i), d = new Date(iso + "T12:00:00");
      const its = itens.filter(it => it.dia === iso).sort(porHora);
      const feitos = its.filter(it => it.feito).length;
      return `<div class="agm-dia dq-cel${d.getMonth() !== 10 ? " is-fora" : ""}${iso === HOJE ? " is-hoje" : ""}" data-cel="${iso}|*">
        <div class="agm-num"><b>${d.getDate()}</b>${its.length && iso <= HOJE ? `<small>${feitos}/${its.length} feitos</small>` : ""}</div>
        ${its.slice(0, 3).map(it => `<div class="agm-chip ${cls(it)}${it.feito ? " is-feito" : ""}${atrasado(it) ? " is-atrasado" : ""}" data-it="${it.id}" role="button" tabindex="0"
            draggable="${auto(it) ? "false" : "true"}" title="${esc(it.tit)}${it.feito ? " (feito)" : atrasado(it) ? " (atrasado)" : ""}">
          ${it.feito ? `<i class="agm-ok">${ico("check")}</i>` : ""}${it.hora ? `<span class="dq-hora">${it.hora}</span>` : ""}<span class="agm-tit">${esc(it.tit)}</span></div>`).join("")}
        ${its.length > 3 ? `<button type="button" class="agm-mais" data-ir-dia="${iso}">+${its.length - 3} mais</button>` : ""}
      </div>`;
    }).join("");
    return `${cabecalho("Novembro de 2026")}<div class="agm">${cab}${cels}</div>`;
  }

  // ── LISTA: uma linha por item, círculo grande; o que passou da data no topo ──
  function linhaLista(it) {
    const at = atrasado(it);
    const meta = [it.onde, it.lin ? nomeLin(it.lin) : (it.quem || null), it.serie ? it.rep : null].filter(Boolean).map(esc).join(" · ");
    return `<div class="agl-it${it.feito ? " is-feito" : ""}${at ? " is-atrasado" : ""}" data-it="${it.id}" role="button" tabindex="0">
      <button type="button" class="dq-ck agl-ck${auto(it) ? " is-auto" : ""}" data-ck="${it.id}" aria-label="${it.feito ? "Reabrir" : "Marcar como feito"}">${ico("check")}</button>
      <span class="agl-hora">${at ? rotDia(it.dia) : it.hora || "dia todo"}</span>
      <span class="agl-cor" style="background:${cor(it)}"></span>
      <span class="agl-corpo"><b>${esc(it.tit)}</b>${meta ? `<small>${meta}</small>` : ""}${it.feito ? `<small class="agl-feito">Feito por ${esc(it.feito.quem)}${it.feito.os ? " · " + esc(it.feito.os) : ""}</small>` : ""}</span>
      ${it.serie ? `<i class="dq-rep">${ico("repeat")}</i>` : ""}
    </div>`;
  }
  function renderLista() {
    const atr = itens.filter(atrasado).sort((a, b) => a.dia.localeCompare(b.dia) || porHora(a, b));
    const fim = somaDias(HOJE, 29);
    const dias = [...new Set(itens.filter(it => it.dia >= HOJE && it.dia <= fim).map(it => it.dia))].sort();
    const df = new Date(fim + "T12:00:00");
    return `${cabecalho(`27 de novembro a ${df.getDate()} de ${MESES[df.getMonth()]}`)}
      <div class="agl">
        ${atr.length ? `<section class="agl-dia is-atr"><h3>${ico("alarm-clock")}Passou da data<span>${atr.length}</span></h3>
          <p class="agl-dica">Ficou para trás sem ser marcado. Toque no círculo se já foi feito, ou no item para remarcar.</p>${atr.map(linhaLista).join("")}</section>` : ""}
        ${dias.map(iso => {
          const its = itens.filter(it => it.dia === iso).sort(porHora);
          const f = its.filter(it => it.feito).length;
          const d = new Date(iso + "T12:00:00");
          const rot = iso === HOJE ? "Hoje" : iso === somaDias(HOJE, 1) ? "Amanhã" : `${DOW[d.getDay()][0].toUpperCase()}${DOW[d.getDay()].slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
          return `<section class="agl-dia${iso === HOJE ? " is-hoje" : ""}"><h3>${rot}${iso === HOJE ? `<span>${f} de ${its.length} feitos</span>` : ""}
            <button type="button" class="agl-mais" data-novo="${iso}|0" aria-label="Novo em ${rot}">${ico("plus")}</button></h3>${its.map(linhaLista).join("")}</section>`;
        }).join("")}
      </div>`;
  }

  function cardAtrasado(it) {
    return `<div class="dq-card dq-card-atr">
      <div class="dq-card-l1"><span class="dq-quando">${rotDia(it.dia)}${it.hora ? " · " + it.hora : ""}</span><span class="dq-esp"></span>${it.ch ? `<span class="dq-num">#${it.ch}</span>` : ""}</div>
      <b>${esc(it.tit)}</b>
      <small>${esc(it.onde || (it.lin ? TECS.find(t => t.id === it.lin).nome : "Empresa"))}${it.serie ? " · " + esc(it.rep) : ""}</small>
      <div class="dq-card-acoes">
        <button type="button" class="dq-bt is-p is-ok" data-ck="${it.id}">${ico("check")}Feito</button>
        <button type="button" class="dq-bt is-p" data-remarcar="${it.id}">${ico("calendar-clock")}Remarcar</button>
      </div>
    </div>`;
  }

  function render() {
    const root = document.getElementById("agRoot");
    if (vista !== "quadro") {
      root.innerHTML = `<div class="dq dq-v-${vista}">${vista === "semana" ? renderSemana() : vista === "mes" ? renderMes() : renderLista()}</div>`;
      icones(root);
      return;
    }
    const atr = itens.filter(atrasado).sort((a, b) => a.dia.localeCompare(b.dia));
    const linhas = [...TECS.map(t => ({ ...t })), { id: 0, nome: "Empresa", sub: "reuniões, pagamentos, Omie, contratos" }];
    const lista = filaAba === "atrasados" ? atr.map(cardAtrasado) : (filaAba === "preventivas" ? FILA_PREV : FILA).map(ch => `
      <div class="dq-card dq-card-fila" draggable="true" tabindex="0">
        <div class="dq-card-l1"><span class="dq-prio is-${ch.p}">${ch.p.toUpperCase()}</span>${ch.fora ? `<span class="dq-fora">fora do prazo</span>` : ""}<span class="dq-esp"></span><span class="dq-num">#${ch.ch}</span></div>
        <b>${esc(ch.tit)}</b><small>${esc(ch.onde)} · sem técnico</small>
        <button type="button" class="dq-bt is-p">${ico("calendar-plus")}Agendar</button>
      </div>`);
    root.innerHTML = `
      <div class="dq">
        ${cabecalho("23 a 29 de novembro de 2026")}
        <div class="dq-corpo">
          <aside class="dq-fila" aria-label="Fila">
            <div class="dq-fila-cab"><b>${filaAba === "atrasados" ? "Passou da data" : "A agendar"}</b><span class="dq-n">${filaAba === "atrasados" ? atr.length : FILA.length + FILA_PREV.length}</span></div>
            <div class="dq-fila-tabs" role="group">
              <button type="button" data-aba="chamados" class="${filaAba === "chamados" ? "is-on" : ""}">Chamados <span>${FILA.length}</span></button>
              <button type="button" data-aba="preventivas" class="${filaAba === "preventivas" ? "is-on" : ""}">Preventivas <span>${FILA_PREV.length}</span></button>
              <button type="button" data-aba="atrasados" class="is-atr ${filaAba === "atrasados" ? "is-on" : ""}">Atrasados <span>${atr.length}</span></button>
            </div>
            <p class="dq-dica">${ico(filaAba === "atrasados" ? "alarm-clock" : "hand")}${filaAba === "atrasados"
              ? "O que passou do dia sem ser marcado como feito. Marque ou remarque; nada some sozinho."
              : "Arraste para um técnico e um dia. Solte uma visita aqui para desmarcar."}</p>
            <div class="dq-fila-lista">${lista.length ? lista.join("") : `<div class="dq-fila-vazia">${ico("circle-check")}<b>Nada atrasado.</b><span>Tudo o que passou foi feito ou remarcado.</span></div>`}</div>
          </aside>
          <div class="dq-grade-wrap">
            <div class="dq-grade" style="grid-template-columns: 168px repeat(${DIAS.length}, minmax(118px, 1fr))">
              <div class="dq-gcab dq-canto"></div>
              ${DIAS.map(iso => { const d = new Date(iso + "T12:00:00"); return `<div class="dq-gcab${iso === HOJE ? " is-hoje" : ""}"><span>${DOW[d.getDay()]}</span><b>${d.getDate()}</b>${iso === HOJE ? "<em>hoje</em>" : ""}</div>`; }).join("")}
              ${linhas.map(l => {
                const meus = itens.filter(it => it.lin === l.id && DIAS.includes(it.dia));
                const feitos = meus.filter(it => it.feito).length;
                const ini = l.nome.split(/\s+/).slice(0, 2).map(p => p[0]).join("");
                return `<div class="dq-tec${l.id ? "" : " is-empresa"}">
                    ${l.id ? `<span class="dq-av">${ini}</span>` : `<span class="dq-av is-emp">${ico("building")}</span>`}
                    <span class="dq-tec-txt"><b>${esc(l.nome)}</b><small>${l.id ? `${feitos} de ${meus.length} feitas na semana` : esc(l.sub)}</small></span>
                  </div>
                  ${DIAS.map(iso => {
                    const its = itens.filter(it => it.lin === l.id && it.dia === iso).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
                    return `<div class="dq-cel${iso === HOJE ? " is-hoje" : ""}${l.id ? "" : " is-empresa"}" data-cel="${iso}|${l.id}">${its.map(cardGrade).join("")}<span class="dq-cel-mais">${ico("plus")}novo</span></div>`;
                  }).join("")}`;
              }).join("")}
            </div>
          </div>
        </div>
      </div>`;
    icones(root);
  }

  // ── pop-ups ──
  function fecharPops() { document.querySelectorAll(".dq-pop").forEach(p => p.remove()); }
  function abrirPop(html, ancora, extraCls = "") {
    fecharPops();
    const p = document.createElement("div");
    p.className = "dq-pop " + extraCls;
    p.setAttribute("role", "dialog");
    p.innerHTML = html;
    document.body.appendChild(p);
    icones(p);
    const r = ancora.getBoundingClientRect();
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = r.right + 8; if (left + w > innerWidth - 8) left = Math.max(8, r.left - w - 8);
    p.style.left = left + "px";
    p.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 70)) + "px";
    return p;
  }

  let toastT;
  function toast(msg, desfazer) {
    let el = document.getElementById("dqToast");
    if (!el) { el = document.createElement("div"); el.id = "dqToast"; el.className = "dq-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = `<span>${esc(msg)}</span>${desfazer ? `<button type="button" data-desfazer>Desfazer</button>` : ""}<button type="button" class="dq-toast-x" data-fechar-toast aria-label="Fechar">×</button>`;
    el.onclick = e => { if (e.target.closest("[data-desfazer]")) { el.hidden = true; desfazer(); } if (e.target.closest("[data-fechar-toast]")) el.hidden = true; };
    el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, desfazer ? 8000 : 4500);
  }

  const foto = () => JSON.parse(JSON.stringify(itens));
  const voltar = antes => () => { itens = antes; render(); };

  function alternarFeito(id) {
    const it = itens.find(x => x.id === id);
    if (!it || auto(it)) return;
    const antes = foto();
    if (it.feito) { it.feito = null; render(); toast(`Reaberto: ${it.tit}`, voltar(antes)); return; }
    it.feito = { quem: "Pedro", quando: "agora" };
    render();
    toast(it.serie ? `Feito só desta vez: ${it.tit}` : it.fonte === "visita" ? `Visita feita · o chamado #${it.ch} continua aberto até a O.S.` : `Feito: ${it.tit}`, voltar(antes));
  }

  // Série: perguntar o alcance antes de mexer.
  function perguntarAlcance(it, verbo, ancora, seguir) {
    if (!it.serie) return seguir("esta");
    const p = abrirPop(`
      <b class="dq-pop-tit">${verbo} compromisso que repete</b>
      <span class="dq-pop-sub">${esc(it.tit)} · ${esc(it.rep)}</span>
      <div class="dq-esc" style="display:flex;flex-direction:column;gap:6px">
        <label class="dq-op"><input type="radio" name="alc" value="esta" checked><span>Só esta<small>${rotLongo(it.dia)}. As outras ficam como estão.</small></span></label>
        <label class="dq-op"><input type="radio" name="alc" value="proximas"><span>Esta e as próximas<small>Daqui para frente. As de antes não mudam.</small></span></label>
        <label class="dq-op"><input type="radio" name="alc" value="todas"><span>Todas<small>A série inteira, inclusive as que já passaram.</small></span></label>
      </div>
      <div class="dq-pop-acoes"><span class="dq-esp"></span>
        <button type="button" class="dq-bt is-p" data-p="x">Cancelar</button>
        <button type="button" class="dq-bt is-p is-pri" data-p="ok">Continuar</button></div>`, ancora, "dq-esc");
    p.addEventListener("click", e => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      const v = p.querySelector("input[name=alc]:checked").value;
      p.remove();
      if (b.dataset.p === "ok") seguir(v);
    });
  }
  const rotAlc = a => ({ esta: "só esta vez", proximas: "esta e as próximas", todas: "a série toda" })[a];

  function abrirCartao(it, ancora) {
    const quem = it.lin ? TECS.find(t => t.id === it.lin).nome : (it.quem || null);
    const p = abrirPop(`
      <div class="dq-cartao-topo"><span class="dq-cartao-cor" style="background:${cor(it)}"></span>
        <div><div class="dq-cartao-tit${it.feito ? " is-feito" : ""}">${esc(it.tit)}</div>
          ${atrasado(it) ? `<span class="dq-atr">ATRASADO</span>` : ""}</div>
        <span class="dq-esp"></span><button type="button" class="dq-ib" data-c="x" aria-label="Fechar" style="width:28px;height:28px">${ico("x")}</button></div>
      <div class="dq-cartao-linhas">
        <div>${ico("clock")}<span>${rotLongo(it.dia)}${it.hora ? ", " + it.hora : " · dia inteiro"}</span></div>
        ${it.serie ? `<div>${ico("repeat")}<span>${esc(it.rep)}</span></div>` : ""}
        ${it.onde ? `<div>${ico("map-pin")}<span>${esc(it.onde)}</span></div>` : ""}
        ${quem ? `<div>${ico("user")}<span>${esc(quem)}</span></div>` : ""}
        ${it.soAdmin ? `<div>${ico("lock")}<span>Só o admin vê</span></div>` : ""}
      </div>
      ${it.feito ? `<div class="dq-cartao-feito">${ico("circle-check")}<span>Feito por ${esc(it.feito.quem)}, ${esc(it.feito.quando)}${it.feito.os ? ` · ${esc(it.feito.os)}` : ""}</span></div>` : ""}
      ${auto(it) ? `<div class="dq-cartao-auto">Conclui sozinho quando todos os contratos tiverem nota no Omie.</div>` : ""}
      <div class="dq-cartao-pe">
        ${auto(it) ? `<button type="button" class="dq-bt is-p is-pri" data-c="abrir">${ico("external-link")}Abrir o faturamento</button>`
          : it.feito ? `<button type="button" class="dq-bt is-p" data-c="feito">${ico("rotate-ccw")}Reabrir</button>`
          : `<button type="button" class="dq-bt is-p is-ok" data-c="feito">${ico("check")}Marcar como feito</button>`}
        ${["compromisso", "visita"].includes(it.fonte) ? `<button type="button" class="dq-bt is-p" data-c="editar">${ico("pencil")}Editar</button>` : ""}
        ${!auto(it) && it.fonte !== "contrato" ? `<button type="button" class="dq-bt is-p" data-c="remarcar">${ico("calendar-clock")}Remarcar</button>` : ""}
        ${it.ch ? `<button type="button" class="dq-bt is-p" data-c="abrir">${ico("inbox")}Chamado #${it.ch}</button>` : ""}
        ${it.fonte === "retorno" ? `<button type="button" class="dq-bt is-p" data-c="abrir">${ico("clipboard-check")}Abrir a O.S.</button>` : ""}
        ${it.fonte === "contrato" ? `<button type="button" class="dq-bt is-p" data-c="abrir">${ico("file-text")}Abrir o contrato</button>` : ""}
        <span class="dq-esp"></span>
        ${["compromisso", "visita"].includes(it.fonte) ? `<button type="button" class="dq-bt is-p is-ico is-perigo" data-c="apagar" title="${it.fonte === "visita" ? "Desmarcar a visita" : "Apagar"}" aria-label="Apagar">${ico(it.fonte === "visita" ? "calendar-x" : "trash-2")}</button>` : ""}
      </div>`, ancora, "dq-cartao");
    p.addEventListener("click", e => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      const a = b.dataset.c;
      if (a === "x") return p.remove();
      if (a === "feito") { p.remove(); return alternarFeito(it.id); }
      if (a === "abrir") { p.remove(); return toast("Na tela de verdade, abre a ficha correspondente."); }
      if (a === "editar") return perguntarAlcance(it, "Editar", ancora, alc => abrirEditar(it, ancora, alc));
      if (a === "remarcar") return perguntarAlcance(it, "Remarcar", ancora, alc => abrirRemarcar(it, ancora, alc));
      if (a === "apagar") return perguntarAlcance(it, "Apagar", ancora, alc => apagar(it, alc));
    });
  }

  function aplicarSerie(it, alc, fn) {
    const alvo = !it.serie || alc === "esta" ? [it] : itens.filter(x => x.serie === it.serie && (alc === "todas" || x.dia >= it.dia));
    alvo.forEach(fn);
    if (it.serie && alc === "esta") { it.serie = null; it.rep = null; it.excecao = true; }
  }

  function apagar(it, alc) {
    const antes = foto();
    const ids = new Set((!it.serie || alc === "esta") ? [it.id] : itens.filter(x => x.serie === it.serie && (alc === "todas" || x.dia >= it.dia)).map(x => x.id));
    itens = itens.filter(x => !ids.has(x.id));
    render();
    toast(it.fonte === "visita" ? `Visita desmarcada; o #${it.ch} voltou para "a agendar"` : `Apagado${it.serie ? " (" + rotAlc(alc) + ")" : ""}: ${it.tit}`, voltar(antes));
  }

  function abrirRemarcar(it, ancora, alc) {
    const p = abrirPop(`
      <b class="dq-pop-tit">Remarcar${it.serie ? " · " + rotAlc(alc) : ""}</b>
      <span class="dq-pop-sub">${esc(it.tit)}</span>
      <label>${it.fonte === "visita" ? "Técnico" : "Linha"}<select data-f="lin">${TECS.map(t => `<option value="${t.id}" ${t.id === it.lin ? "selected" : ""}>${t.nome}</option>`).join("")}${it.fonte !== "visita" ? `<option value="0" ${it.lin === 0 ? "selected" : ""}>Empresa</option>` : ""}</select></label>
      <div class="dq-pop-2"><label>Dia<input type="date" data-f="dia" value="${it.dia}"></label>
        <label>Hora<input type="time" data-f="hora" value="${it.hora || ""}" step="900"></label></div>
      <div class="dq-pop-acoes"><span class="dq-esp"></span><button type="button" class="dq-bt is-p" data-p="x">Cancelar</button><button type="button" class="dq-bt is-p is-pri" data-p="ok">Salvar</button></div>`, ancora);
    p.addEventListener("click", e => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      if (b.dataset.p === "ok") {
        const lin = Number(p.querySelector("[data-f=lin]").value), dia = p.querySelector("[data-f=dia]").value, hora = p.querySelector("[data-f=hora]").value || null;
        mover(it, lin, dia, hora, alc);
      }
      p.remove();
    });
  }

  function mover(it, lin, dia, hora, alc) {
    const antes = foto();
    const desloc = (new Date(dia) - new Date(it.dia)) / 86400000;
    aplicarSerie(it, alc, x => {
      x.lin = lin; x.hora = hora === undefined ? x.hora : hora;
      const d = new Date(x.dia + "T12:00:00"); d.setDate(d.getDate() + desloc); x.dia = d.toISOString().slice(0, 10);
    });
    if (it.feito && alc === "esta") it.feito = null;
    render();
    toast(`Remarcado${it.serie || it.excecao ? " (" + rotAlc(alc) + ")" : ""}: ${rotDia(it.dia)}${it.hora ? " às " + it.hora : ""}`, voltar(antes));
  }

  function abrirEditar(it, ancora, alc) {
    const p = abrirPop(`
      <b class="dq-pop-tit">Editar${it.serie ? " · " + rotAlc(alc) : ""}</b>
      <label>Título<input data-f="tit" value="${esc(it.tit)}"></label>
      <div class="dq-pop-2"><label>Dia<input type="date" data-f="dia" value="${it.dia}"></label><label>Hora<input type="time" data-f="hora" value="${it.hora || ""}"></label></div>
      <label>Observação<textarea data-f="obs" placeholder="O que ficou combinado">${esc(it.obs || "")}</textarea></label>
      <button type="button" class="dq-pop-link" data-p="mais">Repetição, condomínio, responsável…</button>
      <div class="dq-pop-acoes"><span class="dq-esp"></span><button type="button" class="dq-bt is-p" data-p="x">Cancelar</button><button type="button" class="dq-bt is-p is-pri" data-p="ok">Salvar</button></div>`, ancora);
    p.querySelector("[data-f=tit]").focus();
    p.addEventListener("click", e => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      if (b.dataset.p === "mais") return toast("Na tela de verdade, abre o formulário completo de hoje.");
      if (b.dataset.p === "ok") {
        const antes = foto();
        const tit = p.querySelector("[data-f=tit]").value.trim() || it.tit, obs = p.querySelector("[data-f=obs]").value;
        const hora = p.querySelector("[data-f=hora]").value || null, dia = p.querySelector("[data-f=dia]").value;
        aplicarSerie(it, alc, x => { x.tit = tit; x.obs = obs; x.hora = hora; });
        if (dia !== it.dia) { const lin = it.lin; p.remove(); itens = antes; return mover(Object.assign(itens.find(x => x.id === it.id), { tit, obs, hora }), lin, dia, hora, alc); }
        render();
        toast(`Salvo${it.excecao || it.serie ? " (" + rotAlc(alc) + ")" : ""}: ${tit}`, voltar(antes));
      }
      p.remove();
    });
  }

  let seq = 100;
  function abrirNovo(dia, lin, ancora) {
    if (!Number.isFinite(lin)) lin = 0; // Semana, Mês e Lista não têm linha: cai na Empresa
    const p = abrirPop(`
      <b class="dq-pop-tit">Novo · ${rotDia(dia)}${lin ? " · " + TECS.find(t => t.id === lin).nome.split(" ")[0] : " · Empresa"}</b>
      <label>Título<input data-f="tit" placeholder="Ex.: Ligar para o síndico do Ipê"></label>
      <div class="dq-pop-2"><label>Tipo<select data-f="tipo"><option value="reuniao">Reunião</option><option value="visita">Visita</option><option value="outro" selected>Lembrete / outro</option><option value="financeiro">Financeiro</option></select></label>
        <label>Hora<input type="time" data-f="hora" value="" step="900"></label></div>
      <button type="button" class="dq-pop-link" data-p="mais">Repetição, condomínio, observação…</button>
      <div class="dq-pop-acoes"><span class="dq-esp"></span><button type="button" class="dq-bt is-p" data-p="x">Cancelar</button><button type="button" class="dq-bt is-p is-pri" data-p="ok">Salvar</button></div>`, ancora);
    const inp = p.querySelector("[data-f=tit]"); inp.focus();
    inp.addEventListener("keydown", e => { if (e.key === "Enter") p.querySelector("[data-p=ok]").click(); });
    p.addEventListener("click", e => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      if (b.dataset.p === "mais") return toast("Na tela de verdade, abre o formulário completo.");
      if (b.dataset.p === "ok") {
        const tit = inp.value.trim(); if (!tit) { inp.focus(); return; }
        const antes = foto();
        itens.push({ id: "n" + (++seq), fonte: "compromisso", tipo: p.querySelector("[data-f=tipo]").value, tit, lin, dia, hora: p.querySelector("[data-f=hora]").value || null, quem: "Pedro" });
        render(); toast(`Criado: ${tit}`, voltar(antes));
      }
      p.remove();
    });
  }

  // ── eventos ──
  document.addEventListener("click", e => {
    let el;
    if ((el = e.target.closest("[data-ck]"))) { e.stopPropagation(); fecharPops(); return alternarFeito(el.dataset.ck); }
    if ((el = e.target.closest("[data-aba]"))) { filaAba = el.dataset.aba; return render(); }
    if ((el = e.target.closest("[data-vista]"))) { vista = el.dataset.vista; fecharPops(); return render(); }
    if ((el = e.target.closest("[data-ir-dia]"))) {
      const iso = el.dataset.irDia, d = new Date(iso + "T12:00:00");
      semIni = somaDias(iso, -((d.getDay() + 6) % 7)); vista = "semana"; return render();
    }
    if ((el = e.target.closest("[data-nav]"))) {
      const n = el.dataset.nav;
      if (vista === "semana") { semIni = n === "hoje" ? "2026-11-23" : somaDias(semIni, 7 * Number(n)); return render(); }
      if (n === "hoje") return;
      return toast("Na maquete, as setas só andam na Semana.");
    }
    if ((el = e.target.closest("[data-remarcar]"))) { const it = itens.find(x => x.id === el.dataset.remarcar); return perguntarAlcance(it, "Remarcar", el, a => abrirRemarcar(it, el, a)); }
    if ((el = e.target.closest("#agRoot [data-it]"))) { const it = itens.find(x => x.id === el.dataset.it); return abrirCartao(it, el); }
    if ((el = e.target.closest("[data-novo]"))) { const [d, l] = el.dataset.novo.split("|"); return abrirNovo(d, Number(l), el); }
    if ((el = e.target.closest("#agRoot [data-cel]"))) { const [d, l] = el.dataset.cel.split("|"); return abrirNovo(d, Number(l), el); }
    if (!e.target.closest(".dq-pop")) fecharPops();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fecharPops(); });

  let arrasta = null;
  document.addEventListener("dragstart", e => { const el = e.target.closest?.("[data-it]"); if (!el) return; arrasta = el.dataset.it; e.dataTransfer.setData("text/plain", arrasta); el.classList.add("is-arrastando"); fecharPops(); });
  document.addEventListener("dragend", () => { document.querySelectorAll(".dq-sobre,.is-arrastando").forEach(x => x.classList.remove("dq-sobre", "is-arrastando")); });
  document.addEventListener("dragover", e => {
    const c = e.target.closest?.("[data-cel]"); if (!c || !arrasta) return;
    const it = itens.find(x => x.id === arrasta);
    if (it.fonte === "visita" && c.dataset.cel.endsWith("|0")) return;
    e.preventDefault();
    document.querySelectorAll(".dq-sobre").forEach(x => x !== c && x.classList.remove("dq-sobre")); c.classList.add("dq-sobre");
  });
  document.addEventListener("drop", e => {
    const c = e.target.closest?.("[data-cel]"); if (!c || !arrasta) return;
    e.preventDefault();
    const it = itens.find(x => x.id === arrasta); arrasta = null;
    const [dia, l] = c.dataset.cel.split("|");
    const lin = l === "*" ? it.lin : Number(l); // Semana e Mês: muda só o dia
    if (dia === it.dia && lin === it.lin) return;
    perguntarAlcance(it, "Mover", c, alc => mover(it, lin, dia, undefined, alc));
  });

  document.getElementById("mqReset").onclick = () => { itens = INICIAL(); filaAba = "chamados"; semIni = "2026-11-23"; fecharPops(); render(); };
  render();
})();
