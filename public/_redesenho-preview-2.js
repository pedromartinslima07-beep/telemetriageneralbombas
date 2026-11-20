/* MAQUETE DO REDESENHO ESTRUTURAL — segunda parte (19/11/2026).
   Agenda, Preventivas, O.S., Orçamentos, Financeiro, Condomínios (lista e
   página do prédio), Equipamentos, Colaboradores, Configurações e Relatórios.
   Dados de exemplo; nada chama a API. Usa a ponte window.MAQ da primeira parte. */
(function () {
  "use strict";
  const M = window.MAQ;
  const { $, esc, ico, icones, toast, abrirPop, condo, TECNICOS, CONDOS, RES, CHAMADOS, corNivel, sitTxt } = M;
  const moeda = v => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const tecNome = id => (TECNICOS.find(t => t.id === id) || {}).nome || "—";
  const linkCondo = (id, aba) => `<a class="lk" href="#/condominios/${id}${aba ? "/" + aba : ""}">${esc(condo(id).nome)}</a>`;
  const mob = () => matchMedia("(max-width:860px)").matches;

  // ═══ DADOS DE EXEMPLO ═════════════════════════════════════════════════
  const OS = [
    { id: 415, c: 3, tec: 1, serv: "Troca de registro de gaveta 2\"", st: "andamento", data: "19/11", ch: 228, chegada: "09:47" },
    { id: 414, c: 8, tec: 1, serv: "Preventiva mensal · limpeza de caixa", st: "andamento", data: "19/11", ch: 229, chegada: "—" },
    { id: 412, c: 3, tec: 2, serv: "Reparo no quadro de comando", st: "enviar", data: "18/11", ch: 226, res: "Resolvido", fim: "18/11 17:20" },
    { id: 411, c: 6, tec: 1, serv: "Preventiva mensal de bombas", st: "enviar", data: "18/11", res: "Resolvido", fim: "18/11 11:05" },
    { id: 409, c: 1, tec: 3, serv: "Troca de contator da bomba de recalque", st: "enviada", data: "14/11", res: "Resolvido", fim: "14/11 16:40", env: "14/11 17:02" },
    { id: 407, c: 5, tec: 2, serv: "Vazamento na gaxeta", st: "enviada", data: "12/11", res: "Paliativo", fim: "12/11 10:15", env: "12/11 10:31" },
    { id: 405, c: 9, tec: 3, serv: "Preventiva mensal de bombas", st: "enviada", data: "10/11", res: "Resolvido", fim: "10/11 15:00", env: "10/11 15:20" },
    { id: 402, c: 2, tec: 1, serv: "Boia elétrica travada", st: "enviada", data: "06/11", res: "Resolvido", fim: "06/11 09:40", env: "06/11 10:02" },
  ];
  const ORC = [
    { id: 145, n: "—", c: 3, desc: "Troca de registro e 2 m de tubo", origem: "tecnico", st: "solicitado", valor: null, data: "19/11", obs: "Registro de gaveta 2\" com haste rompida. Fechei a prumada." },
    { id: 144, n: "—", c: 10, desc: "Contator novo para o quadro", origem: "tecnico", st: "solicitado", valor: null, data: "18/11", obs: "Contator queimando a cada 2 semanas, trocar por um de 32 A." },
    { id: 143, n: "ORC-0143", c: 6, desc: "Nova bomba centrífuga 3 cv", origem: "ia", st: "rascunho", valor: 6820, data: "18/11" },
    { id: 142, n: "ORC-0142", c: 4, desc: "Troca da bomba pressurizadora", origem: "escritorio", st: "resposta", resp: "aprovado", valor: 4380, data: "11/11", quem: "Síndica Regina" },
    { id: 141, n: "ORC-0141", c: 2, desc: "Instalação de segunda sonda", origem: "escritorio", st: "enviado", valor: 1250, data: "10/11", validade: "25/11" },
    { id: 140, n: "ORC-0140", c: 7, desc: "Revisão do conjunto motobomba", origem: "escritorio", st: "enviado", valor: 2960, data: "28/10", validade: "12/11", venceu: true },
    { id: 139, n: "ORC-0139", c: 1, desc: "Troca de boia e contator", origem: "tecnico", st: "aprovado", valor: 1920, data: "05/11", aprov: "14/11", nota: null },
    { id: 137, n: "ORC-0137", c: 9, desc: "Recuperação de motor 5 cv", origem: "escritorio", st: "aprovado", valor: 3740, data: "30/10", aprov: "04/11", nota: "emitida", nf: "NFS-e 1.284" },
    { id: 136, n: "ORC-0136", c: 6, desc: "Troca de válvula de retenção", origem: "escritorio", st: "aprovado", valor: 980, data: "29/10", aprov: "06/11", nota: "erro", erro: "CNPJ do tomador inválido" },
    { id: 135, n: "ORC-0135", c: 5, desc: "Pintura epóxi da cisterna", origem: "escritorio", st: "recusado", valor: 8900, data: "20/10", quem: "Sr. Antônio" },
  ];
  const CONTRATOS = [
    { id: 91, n: "CT-2024/00091", c: 7, serv: "Manutenção preventiva mensal", valor: 890, ini: "01/12/2024", fim: "01/12/2026", vence: 12, assin: "assinado", omie: "emitida" },
    { id: 88, n: "CT-2024/00088", c: 9, serv: "Preventiva + telemetria", valor: 1290, ini: "01/03/2024", fim: "01/03/2025", vence: -628, assin: "assinado", omie: "sem nota" },
    { id: 102, n: "CT-2025/00102", c: 1, serv: "Preventiva + telemetria", valor: 1450, ini: "01/02/2025", fim: "01/02/2027", vence: 74, assin: "assinado", omie: "emitida" },
    { id: 104, n: "CT-2025/00104", c: 3, serv: "Manutenção preventiva mensal", valor: 760, ini: "01/04/2025", fim: null, vence: null, assin: "assinado", omie: "emitida" },
    { id: 107, n: "CT-2025/00107", c: 4, serv: "Preventiva bimestral", valor: 540, ini: "01/06/2025", fim: "01/06/2027", vence: 194, assin: "assinado", omie: "emitida" },
    { id: 110, n: "CT-2026/00110", c: 6, serv: "Preventiva + telemetria", valor: 1380, ini: "01/09/2026", fim: "01/09/2028", vence: 652, assin: "assinado", omie: "emitida" },
    { id: 112, n: "CT-2026/00112", c: 2, serv: "Preventiva + telemetria", valor: 1520, ini: "01/11/2026", fim: "01/11/2028", vence: 713, assin: "aguardando", omie: "processando" },
    { id: 113, n: "CT-2026/00113", c: 10, serv: "Manutenção preventiva mensal", valor: 690, ini: "—", fim: null, vence: null, assin: "rascunho", omie: "—" },
  ];
  const PREV = [
    { id: 1, c: 1, zona: "Zona Sul", serv: "Preventiva de bombas", perio: "Mensal", mes: "feita", tec: 3, prox: "15/12", meses: "ffffffffffff" },
    { id: 2, c: 4, zona: "Zona Sul", serv: "Preventiva de bombas", perio: "Bimestral", mes: "afazer", tec: 2, prox: "26/11", meses: "f-f-f-f-f-f-" },
    { id: 3, c: 6, zona: "Centro", serv: "Preventiva de bombas", perio: "Mensal", mes: "feita", tec: 1, prox: "16/12", meses: "fffffffffff" },
    { id: 4, c: 8, zona: "Zona Norte", serv: "Limpeza de caixa d'água", perio: "Semestral", mes: "campo", tec: 1, prox: "19/11", meses: "-----f-----c" },
    { id: 5, c: 9, zona: "Zona Leste", serv: "Preventiva de bombas", perio: "Mensal", mes: "feita", tec: 3, prox: "10/12", meses: "fffffaffffff" },
    { id: 6, c: 3, zona: "Zona Leste", serv: "Preventiva de bombas", perio: "Mensal", mes: "atrasada", tec: 2, prox: "vencida 12/11", meses: "fffffffffffx" },
    { id: 7, c: 5, zona: "Zona Oeste", serv: "Preventiva de bombas", perio: "Mensal", mes: "afazer", tec: null, prox: "28/11", meses: "fffffffffff" },
    { id: 8, c: 7, zona: "Zona Oeste", serv: "Preventiva de bombas", perio: "Mensal", mes: "afazer", tec: 2, prox: "24/11", meses: "ffffffffffff" },
    { id: 9, c: 10, zona: "Zona Oeste", serv: "Preventiva de bombas", perio: "Mensal", mes: "afazer", tec: null, prox: "27/11", meses: "" },
    { id: 10, c: 2, zona: "Zona Oeste", serv: "—", perio: "—", mes: "sem", tec: null, prox: "—", meses: "" },
  ];
  const EQUIP = [
    { id: 1, cod: "EQ-0012", tipo: "Bomba centrífuga 3 cv", serie: "WL-88213", c: 1, st: "condominio", desde: "02/2024" },
    { id: 2, cod: "EQ-0019", tipo: "Bomba pressurizadora 1,5 cv", serie: "SC-11042", c: 4, st: "oficina", fase: "Aguardando orçamento", desde: "11/11/2026", defeito: "Selo mecânico vazando" },
    { id: 3, cod: "EQ-0021", tipo: "Motor 5 cv", serie: "WG-55120", c: 9, st: "oficina", fase: "Em conserto", desde: "04/11/2026", defeito: "Rolamento travado" },
    { id: 4, cod: "EQ-0024", tipo: "Bomba centrífuga 2 cv", serie: "WL-90311", c: 3, st: "pronto", desde: "17/11/2026", defeito: "Enrolamento queimado" },
    { id: 5, cod: "EQ-0026", tipo: "Quadro de comando", serie: "—", c: 6, st: "condominio", desde: "09/2026" },
    { id: 6, cod: "EQ-0030", tipo: "Bomba submersa 1 cv", serie: "DN-2201", c: 2, st: "condominio", desde: "06/2025" },
    { id: 7, cod: "EQ-0008", tipo: "Bomba centrífuga 1 cv", serie: "WL-40122", c: 5, st: "baixado", desde: "03/2026", defeito: "Carcaça trincada" },
    { id: 8, cod: "EQ-0041", tipo: "Etiqueta em branco", serie: "—", c: null, st: "branco", desde: "lote 7" },
    { id: 9, cod: "EQ-0042", tipo: "Etiqueta em branco", serie: "—", c: null, st: "branco", desde: "lote 7" },
  ];
  const COLABS = [
    { id: 1, nome: "Carlos Souza", funcao: "Técnico", fone: "(11) 98812-4410", app: "online", gps: "Res. Vila Rica · há 1 min", abertos: 3, zona: "Zona Leste e Centro" },
    { id: 2, nome: "Marcos Lima", funcao: "Técnico", fone: "(11) 97420-1189", app: "online", gps: "Av. Domingos de Morais · há 2 min", abertos: 3, zona: "Zona Sul e Oeste" },
    { id: 3, nome: "João Pereira", funcao: "Técnico", fone: "(11) 99231-5520", app: "online", gps: "Ed. Solar do Ipiranga · há 4 min", abertos: 1, zona: "Zona Norte" },
    { id: 4, nome: "Patrícia Alves", funcao: "Adm", fone: "(11) 2038-8679", app: "—", gps: "—", abertos: 0 },
    { id: 5, nome: "Pedro", funcao: "Gestor", fone: "—", app: "—", gps: "—", abertos: 0 },
    { id: 6, nome: "Rafael Costa", funcao: "TI", fone: "—", app: "—", gps: "—", abertos: 0, inativo: true },
  ];

  // ═══ LISTA PADRÃO (o mesmo molde em toda tela) ════════════════════════
  // cabeçalho → barra de filtros (visões em chip + busca + ações) → tabela com
  // seleção em lote, ordem pela coluna e paginação → painel ao lado.
  const L = {};
  function lista(pg, cfg) {
    const s = L[pg] = L[pg] || { f: cfg.chips[0][0], q: "", sel: cfg.selPadrao ?? null, marc: new Set(), ord: null, dir: 1 };
    s.cfg = cfg;
    $("#pagina").innerHTML = `
      <header class="pg-cab">
        <h1>${cfg.titulo}</h1>${cfg.sub ? `<span class="pg-sub">${cfg.sub}</span>` : ""}
        <span class="esp"></span>${cfg.acoes || ""}
      </header>
      ${cfg.topo ? `<div class="pg-topo">${cfg.topo}</div>` : ""}
      <div class="pg-barra">
        <div class="chips" data-chips="${pg}"></div>
        <span style="flex:1"></span>
        <label class="busca-l">${ico("search")}<input type="search" data-busca="${pg}" placeholder="${cfg.busca || "Buscar"}" value="${esc(s.q)}"></label>
        ${cfg.semExportar ? "" : `<button class="bt" type="button" data-exportar>${ico("download")}<span class="so-desk">Exportar</span></button>`}
      </div>
      <div class="dividido${cfg.semPainel ? " sem-painel" : ""}" data-div="${pg}">
        <div class="dividido-lista"><div data-tabela="${pg}"></div></div>
        ${cfg.semPainel ? "" : `<aside class="painel-lado" data-lado="${pg}"></aside>`}
      </div>`;
    desenhaLista(pg);
  }
  function filtrados(pg) {
    const s = L[pg], cfg = s.cfg;
    const f = cfg.chips.find(c => c[0] === s.f)[2];
    const q = s.q.trim().toLowerCase();
    let d = cfg.dados().filter(f).filter(r => !q || cfg.texto(r).toLowerCase().includes(q));
    if (s.ord != null) {
      const col = cfg.cols[s.ord];
      d = d.slice().sort((a, b) => { const x = col.ord(a), y = col.ord(b); return (x > y ? 1 : x < y ? -1 : 0) * s.dir; });
    }
    return d;
  }
  function desenhaLista(pg) {
    const s = L[pg], cfg = s.cfg;
    $(`[data-chips="${pg}"]`).innerHTML = cfg.chips.map(([k, n, f, pt]) =>
      `<button class="chip${s.f === k ? " is-on" : ""}" type="button" data-chip="${pg}:${k}">${pt ? `<i class="pt ${pt}"></i>` : ""}${n} <span class="n">${cfg.dados().filter(f).length}</span></button>`).join("");
    const d = filtrados(pg);
    const lote = !!cfg.lote;
    const marcados = [...s.marc].filter(id => d.some(r => r.id === id));
    const barraLote = lote && marcados.length ? `<div class="lote">${marcados.length} ${marcados.length === 1 ? "selecionado" : "selecionados"}
      ${cfg.lote.map(([k, n]) => `<button class="bt sm" type="button" data-lote="${pg}:${k}">${n}</button>`).join("")}
      <button class="bt sm ghost" type="button" data-lote="${pg}:limpar">Limpar seleção</button></div>` : "";
    const th = cfg.cols.map((c, i) => `<th class="${c.cls || ""}" ${c.w ? `style="width:${c.w}"` : ""}>${c.ord ? `<button type="button" class="th-ord${s.ord === i ? " is-on" : ""}" data-ord="${pg}:${i}">${c.h}${s.ord === i ? ico(s.dir > 0 ? "arrow-up" : "arrow-down") : ico("chevrons-up-down", "th-ic")}</button>` : c.h}</th>`).join("");
    const linhas = d.map(r => `<tr data-linha="${pg}:${r.id}" class="${r.id === s.sel ? "is-sel" : ""} ${cfg.trCls ? cfg.trCls(r) : ""}" tabindex="0">
      ${lote ? `<td class="c-cx c-om"><input type="checkbox" aria-label="Selecionar" data-marca="${pg}:${r.id}" ${s.marc.has(r.id) ? "checked" : ""}></td>` : ""}
      ${cfg.cols.map(c => `<td class="${c.cls || ""}">${c.td(r)}</td>`).join("")}</tr>`).join("");
    $(`[data-tabela="${pg}"]`).innerHTML = (cfg.antes ? cfg.antes() : "") + barraLote + (d.length ? `
      <table class="tab cartoes">
        <thead><tr>${lote ? `<th class="c-cx c-om" style="width:36px"><input type="checkbox" aria-label="Selecionar todos" data-marca-todos="${pg}" ${marcados.length && marcados.length === d.length ? "checked" : ""}></th>` : ""}${th}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="pagina-pe"><span>${d.length ? `1–${d.length} de ${d.length}` : ""}</span><span class="esp"></span>
        <button class="ib" type="button" disabled aria-label="Página anterior">${ico("chevron-left")}</button>
        <button class="ib" type="button" disabled aria-label="Próxima página">${ico("chevron-right")}</button></div>`
      : `<div class="ld-vazio"><b>${cfg.vazio || "Nada nesta visão."}</b></div>`);
    desenhaLado(pg);
    icones();
  }
  function desenhaLado(pg) {
    const s = L[pg], cfg = s.cfg;
    const lado = $(`[data-lado="${pg}"]`);
    if (!lado) return;
    const r = cfg.dados().find(x => x.id === s.sel);
    lado.innerHTML = r ? `<button class="bt sm ghost ld-voltar" type="button" data-fechar-lado="${pg}" style="margin:12px 0 0 12px">${ico("arrow-left")}Lista</button>${cfg.detalhe(r)}`
      : `<div class="ld-vazio">${ico(cfg.icVazio || "mouse-pointer-click", "ic-grande")}<b>${cfg.ladoVazio || "Escolha um item na lista."}</b></div>`;
    icones();
  }
  const timeline = etapas => `<ol class="tl">${etapas.map(([n, q, k]) =>
    `<li class="${k || ""}"><i></i><div><b>${n}</b>${q ? `<small>${q}</small>` : ""}</div></li>`).join("")}</ol>`;
  const ldCab = (sup, titulo, selo, acoes) => `<div class="ld-cab">
      <div class="cond">${sup}</div><h2>${titulo}</h2>
      ${selo ? `<div class="ld-leitura">${selo}</div>` : ""}
      ${acoes ? `<div class="acoes" style="margin-top:12px">${acoes}</div>` : ""}</div>`;
  const sec = (t, html, extra) => `<div class="ld-sec"><h3>${t}${extra ? `<span class="esp"></span>${extra}` : ""}</h3>${html}</div>`;
  const fatos = arr => `<dl class="fatos">${arr.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  // ═══ ORDENS DE SERVIÇO ════════════════════════════════════════════════
  const OS_ST = { andamento: ["info", "Em andamento"], enviar: ["at", "Falta enviar ao cliente"], enviada: ["ok", "Enviada ao cliente"] };
  M.telas.os = () => lista("os", {
    titulo: "Ordens de serviço", sub: "O técnico preenche no app; o escritório confere e envia",
    acoes: `<button class="bt pri" type="button" data-toast="Abre a O.S. nova já ligada ao chamado escolhido">${ico("plus")}Nova O.S.</button>`,
    dados: () => OS, texto: o => `os ${o.id} ${condo(o.c).nome} ${o.serv} ${tecNome(o.tec)}`, busca: "Número, prédio, serviço ou técnico",
    chips: [["abertas", "Pede ação", o => o.st !== "enviada"], ["andamento", "Em andamento", o => o.st === "andamento"],
      ["enviar", "Falta enviar", o => o.st === "enviar", "at"], ["todas", "Todas", () => true]],
    lote: [["enviar", "Enviar ao cliente"], ["pdf", "Baixar PDFs"]],
    selPadrao: 412,
    cols: [
      { h: "O.S.", w: "110px", td: o => `<b class="mono">OS-0${o.id}</b><span class="sub">${o.data}</span>`, ord: o => o.id },
      { h: "Condomínio", td: o => `${linkCondo(o.c, "os")}<span class="sub">${tecNome(o.tec)}</span>`, ord: o => condo(o.c).nome },
      { h: "Serviço", cls: "c-om", td: o => esc(o.serv) },
      { h: "Situação", cls: "c-sit", td: o => `<span class="selo ${OS_ST[o.st][0]}">${OS_ST[o.st][1]}</span><span class="sub">${o.st === "andamento" ? (o.chegada !== "—" ? "técnico chegou " + o.chegada : "técnico a caminho") : o.res + " · " + (o.env ? "enviada " + o.env : "finalizada " + o.fim)}</span>`, ord: o => ["andamento", "enviar", "enviada"].indexOf(o.st) },
      { h: "", w: "110px", cls: "c-om num", td: o => o.st === "enviar" ? `<button class="bt sm" type="button" data-toast="O.S. enviada à síndica por e-mail">${ico("send")}Enviar</button>` : o.st === "enviada" ? `<button class="bt sm ghost" type="button" data-toast="Baixando o PDF">${ico("file-down")}PDF</button>` : "" },
    ],
    detalhe: o => {
      const st = o.st, k = i => (["andamento", "enviar", "enviada"].indexOf(st) + 1 > i ? "feita" : ["andamento", "enviar", "enviada"].indexOf(st) + 1 === i ? "atual" : "");
      return ldCab(`${ico("clipboard-check")}<span class="mono">OS-0${o.id}</span> · ${linkCondo(o.c, "os")}`, esc(o.serv),
        `<span class="selo ${OS_ST[st][0]}">${OS_ST[st][1]}</span><span class="muted">${tecNome(o.tec)}</span>`,
        `${st === "enviar" ? `<button class="bt sm pri" type="button" data-toast="O.S. enviada por e-mail">${ico("send")}Enviar ao cliente</button>` : ""}
         <button class="bt sm" type="button" data-toast="Baixando o PDF">${ico("file-down")}PDF</button>
         <button class="bt sm ghost" type="button" data-toast="Abre a página inteira da O.S. (#/os/${o.id})">${ico("external-link")}Abrir página</button>`) +
        sec("Andamento", timeline([["Aberta", o.data + " · pelo chamado", "feita"], ["Técnico chegou", o.chegada !== "—" && o.chegada ? o.data + " " + o.chegada : (st !== "andamento" ? o.data : "a seguir"), st === "andamento" && o.chegada === "—" ? "atual" : "feita"],
          ["Finalizada", o.fim || "a seguir", k(2) || (st === "andamento" ? "" : "feita")], ["Enviada ao cliente", o.env || (st === "enviar" ? "a seguir" : ""), st === "enviada" ? "feita" : st === "enviar" ? "atual" : ""]])) +
        (st === "andamento" ? sec("O que o técnico registrou", `<p class="muted" style="margin:0">Ainda sem tipo de serviço, verificações, peças, fotos e assinatura. O técnico finaliza pelo app.</p>`)
          : sec("O que o técnico registrou", fatos([["Resultado", o.res], ["Peças", "1 contator 32 A"], ["Fotos", "4 fotos"], ["Assinatura", "Zelador · Sr. Luís"]]))) +
        sec("Ligado a esta O.S.", o.ch ? `<div class="ligado">${ico("inbox")}<a class="lk" href="#/atendimento/${o.ch}">CH-0${o.ch}</a><span class="esp"></span><span class="muted">chamado de origem</span></div>` : `<p class="muted" style="margin:0">Preventiva do mês.</p>`);
    },
  });

  // ═══ ORÇAMENTOS ═══════════════════════════════════════════════════════
  const ORC_ST = {
    solicitado: ["at", "Pedido do técnico"], rascunho: ["cz", "Rascunho"], enviado: ["info", "Esperando o cliente"],
    resposta: ["at", "Cliente respondeu"], aprovado: ["ok", "Aprovado"], recusado: ["cz", "Recusado"],
  };
  const ORIGEM = { tecnico: "pedido do técnico", ia: "via IA", escritorio: "escritório" };
  function orcApoio(o) {
    if (o.st === "solicitado") return "ninguém começou ainda";
    if (o.st === "rascunho") return "falta enviar ao cliente";
    if (o.st === "enviado") return o.venceu ? `<span style="color:var(--ri-t);font-weight:600">validade venceu em ${o.validade}</span>` : `válido até ${o.validade}`;
    if (o.st === "resposta") return `${o.quem} aprovou · falta dar baixa`;
    if (o.st === "aprovado") return o.nota === "emitida" ? "nota emitida · no Financeiro" : o.nota === "erro" ? "nota com erro · no Financeiro" : "sem nota · segue para o Financeiro";
    return `${o.quem} recusou`;
  }
  M.telas.orcamentos = () => lista("orc", {
    titulo: "Orçamentos", sub: "Do pedido do técnico até o aprovado. A nota fiscal é no Financeiro",
    acoes: `<button class="bt pri" type="button" data-toast="Abre o orçamento novo (#/orcamentos/novo)">${ico("plus")}Novo orçamento</button>`,
    dados: () => ORC, texto: o => `${o.n} ${condo(o.c).nome} ${o.desc}`, busca: "Número, prédio ou descrição",
    chips: [["acao", "Pede ação", o => ["solicitado", "rascunho", "resposta"].includes(o.st) || o.venceu],
      ["solicitado", "Pedidos dos técnicos", o => o.st === "solicitado", "at"], ["enviado", "Esperando o cliente", o => o.st === "enviado"],
      ["aprovado", "Aprovados", o => o.st === "aprovado" || o.st === "resposta"], ["todos", "Todos", () => true]],
    lote: [["enviar", "Enviar ao cliente"], ["lembrete", "Lembrar o cliente"]],
    selPadrao: 145,
    trCls: o => (o.st === "solicitado" || o.st === "resposta") ? "pede" : "",
    cols: [
      { h: "Nº", w: "150px", td: o => `<b class="mono">${o.n === "—" ? "novo" : o.n}</b><span class="sub">${o.data} · ${ORIGEM[o.origem]}</span>`, ord: o => o.id },
      { h: "Condomínio", td: o => `${linkCondo(o.c, "orcamentos")}<span class="sub">${esc(o.desc)}</span>`, ord: o => condo(o.c).nome },
      { h: "Situação", cls: "c-sit", td: o => `<span class="selo ${ORC_ST[o.st][0]}">${ORC_ST[o.st][1]}</span><span class="sub">${orcApoio(o)}</span>`, ord: o => Object.keys(ORC_ST).indexOf(o.st) },
      { h: "Valor", w: "120px", cls: "num c-om", td: o => `<span class="mono">${moeda(o.valor)}</span>`, ord: o => o.valor || 0 },
      { h: "", w: "140px", cls: "c-om num", td: o => o.st === "solicitado" ? `<button class="bt sm" type="button" data-toast="Orçamento criado a partir do pedido">Fazer orçamento</button>`
        : o.st === "rascunho" ? `<button class="bt sm" type="button" data-toast="Orçamento enviado à síndica">${ico("send")}Enviar</button>`
        : o.st === "resposta" ? `<button class="bt sm" type="button" data-toast="Baixa dada">${ico("check")}Dar baixa</button>` : "" },
    ],
    detalhe: o => {
      const ordem = ["criado", "enviado", "resposta", "feito"];
      const at = { solicitado: -1, rascunho: 0, enviado: 1, resposta: 2, aprovado: 3, recusado: 2 }[o.st];
      const k = i => (i < at ? "feita" : i === at ? "atual" : "");
      return ldCab(`${ico("file-text")}<span class="mono">${o.n === "—" ? "Pedido" : o.n}</span> · ${linkCondo(o.c, "orcamentos")}`, esc(o.desc),
        `<span class="selo ${ORC_ST[o.st][0]}">${ORC_ST[o.st][1]}</span><b class="mono">${moeda(o.valor)}</b>`,
        o.st === "solicitado" ? `<button class="bt sm pri" type="button" data-toast="Orçamento criado a partir do pedido">Fazer orçamento</button>`
        : `${o.st === "rascunho" ? `<button class="bt sm pri" type="button" data-toast="Enviado">${ico("send")}Enviar ao cliente</button>` : ""}
           ${o.st === "resposta" ? `<button class="bt sm pri" type="button" data-toast="Baixa dada">${ico("check")}Dar baixa</button>` : ""}
           ${o.st === "aprovado" && !o.nota ? `<a class="bt sm pri" href="#/financeiro">${ico("receipt")}Emitir nota no Financeiro</a>` : ""}
           <button class="bt sm" type="button" data-toast="Baixando o PDF">${ico("file-down")}PDF</button>
           <button class="bt sm ghost" type="button" data-toast="Abre a página inteira do orçamento, com os itens">${ico("external-link")}Abrir página</button>`) +
        (o.obs ? sec("O que o técnico pediu", `<blockquote class="cita">${esc(o.obs)}</blockquote><span class="muted">${tecNome(1)} · OS-0415 · CH-0228</span>`) : "") +
        sec("Andamento", timeline([["Criado", o.st === "solicitado" ? "a seguir" : o.data, k(0)], ["Enviado ao cliente", at >= 1 ? o.data : "a seguir", k(1)],
          [o.st === "recusado" ? "Recusado" : "Aprovado", o.st === "resposta" || o.st === "aprovado" || o.st === "recusado" ? (o.aprov || "11/11") + (o.quem ? " · " + o.quem : "") : "", o.st === "resposta" ? "atual" : k(2)],
          ["Serviço feito", o.st === "aprovado" ? "a seguir" : "", o.st === "aprovado" ? "atual" : ""]])) +
        (o.valor ? sec("Itens", `<table class="mini"><tbody>
          <tr><td>${esc(o.desc)}</td><td class="num mono">${moeda(o.valor * 0.7)}</td></tr>
          <tr><td>Mão de obra</td><td class="num mono">${moeda(o.valor * 0.3)}</td></tr>
          <tr class="tot"><td>Total</td><td class="num mono">${moeda(o.valor)}</td></tr></tbody></table>`) : "");
    },
  });

  // ═══ FINANCEIRO ═══════════════════════════════════════════════════════
  // Uma página: o que pede ação no faturamento em cima; a lista embaixo
  // alterna entre notas avulsas (dos orçamentos) e contratos (com a nota do
  // mês vinda do Omie NA MESMA LINHA, que hoje mora na Agenda).
  let finModo = "notas";
  const NOTAS = () => ORC.filter(o => o.st === "aprovado");
  const NF_ST = { null: ["at", "Sem nota"], emitida: ["ok", "Emitida"], erro: ["ri", "Erro no Omie"], processando: ["info", "Processando"] };
  const CT_ASSIN = { assinado: ["ok", "Assinado"], aguardando: ["info", "Esperando assinatura"], rascunho: ["cz", "Rascunho"] };
  const OMIE = { emitida: ["ok", "Nota de nov emitida"], "sem nota": ["ri", "Sem nota em nov"], processando: ["info", "Processando"], "—": ["cz", "—"] };
  M.telas.financeiro = () => {
    const receita = CONTRATOS.filter(c => c.assin === "assinado").reduce((s, c) => s + c.valor, 0);
    const topo = `
      <div class="resumo-fin">
        <div><span>Contratos por mês</span><b class="mono">${moeda(receita)}</b><small>${CONTRATOS.filter(c => c.assin === "assinado").length} contratos assinados</small></div>
        <div><span>Faturamento de novembro no Omie</span><b class="mono">77 de 81</b><small>4 contratos sem nota · <a class="lk" href="#/financeiro" data-fin-sem-nota>ver</a></small></div>
        <div><span>Avulsos aprovados no mês</span><b class="mono">${moeda(NOTAS().reduce((s, o) => s + o.valor, 0))}</b><small>${NOTAS().length} orçamentos</small></div>
        <div class="pede"><span>Pede ação</span><b>${ico("triangle-alert")} 4</b><small>1 sem nota · 1 com erro · 1 contrato vencido · 1 vencendo</small></div>
      </div>`;
    const seg = `<div class="seg" role="group" aria-label="O que listar">
        <button type="button" data-fin-modo="notas" class="${finModo === "notas" ? "is-on" : ""}">${ico("receipt")}Notas avulsas</button>
        <button type="button" data-fin-modo="contratos" class="${finModo === "contratos" ? "is-on" : ""}">${ico("file-signature")}Contratos</button></div>`;
    if (finModo === "notas") {
      lista("fin-n", {
        titulo: "Financeiro", sub: "Novembro de 2026", topo,
        acoes: `${seg}<button class="bt" type="button" data-toast="Copiando de novo do Omie (respeita 2 min)">${ico("refresh-cw")}Atualizar do Omie</button>`,
        dados: NOTAS, texto: o => `${o.n} ${condo(o.c).nome} ${o.nf || ""}`, busca: "Nota, orçamento ou prédio",
        chips: [["acao", "Pede ação", o => o.nota !== "emitida"], ["sem", "Sem nota", o => !o.nota, "at"], ["erro", "Com erro", o => o.nota === "erro", "ri"], ["emitida", "Emitidas", o => o.nota === "emitida"], ["todas", "Todas", () => true]],
        lote: [["emitir", "Emitir notas"]], selPadrao: 136,
        cols: [
          { h: "Nota", w: "130px", td: o => `<b class="mono">${o.nf || "—"}</b><span class="sub">${o.n}</span>`, ord: o => o.id },
          { h: "Condomínio", td: o => `${linkCondo(o.c, "notas")}<span class="sub">${esc(o.desc)}</span>`, ord: o => condo(o.c).nome },
          { h: "Situação", cls: "c-sit", td: o => `<span class="selo ${NF_ST[o.nota][0]}">${NF_ST[o.nota][1]}</span><span class="sub">${o.nota === "erro" ? esc(o.erro) : o.nota ? "autorizada 06/11" : "aprovado " + o.aprov}</span>`, ord: o => String(o.nota) },
          { h: "Valor", w: "120px", cls: "num", td: o => `<span class="mono">${moeda(o.valor)}</span>`, ord: o => o.valor },
          { h: "", w: "130px", cls: "c-om num", td: o => !o.nota ? `<button class="bt sm" type="button" data-toast="NFS-e enviada ao Omie">Emitir nota</button>` : o.nota === "erro" ? `<button class="bt sm" type="button" data-toast="Abre o cadastro do tomador">Corrigir</button>` : "" },
        ],
        detalhe: o => ldCab(`${ico("receipt")}${linkCondo(o.c)}`, `${o.nf || "Nota do " + o.n}`, `<span class="selo ${NF_ST[o.nota][0]}">${NF_ST[o.nota][1]}</span><b class="mono">${moeda(o.valor)}</b>`,
            !o.nota ? `<button class="bt sm pri" type="button" data-toast="NFS-e enviada ao Omie">Emitir NFS-e</button><button class="bt sm" type="button" data-toast="DANFE (com peça) enviada ao Omie">Emitir DANFE</button>`
            : o.nota === "erro" ? `<button class="bt sm pri" type="button" data-toast="Nota reenviada">Corrigir e reenviar</button>` : `<button class="bt sm" type="button" data-toast="Baixando PDF da nota">${ico("file-down")}PDF da nota</button>`) +
          (o.nota === "erro" ? sec("O que o Omie respondeu", `<div class="aviso ri">${ico("triangle-alert")}<span>${esc(o.erro)}. Corrija o CNPJ no cadastro do condomínio e reenvie.</span></div>`) : "") +
          sec("Parcelas", `<table class="mini"><tbody><tr><td>1ª · 10/12</td><td class="num mono">${moeda(o.valor / 2)}</td></tr><tr><td>2ª · 10/01</td><td class="num mono">${moeda(o.valor / 2)}</td></tr></tbody></table>`) +
          sec("Origem", `<div class="ligado">${ico("file-text")}<a class="lk" href="#/orcamentos">${o.n}</a><span class="esp"></span><span class="muted">aprovado ${o.aprov}</span></div>`),
      });
    } else {
      lista("fin-c", {
        titulo: "Financeiro", sub: "Novembro de 2026", topo,
        acoes: `${seg}<button class="bt pri" type="button" data-toast="Abre o contrato novo (#/contratos/novo)">${ico("plus")}Novo contrato</button>`,
        dados: () => CONTRATOS, texto: c => `${c.n} ${condo(c.c).nome} ${c.serv}`, busca: "Contrato ou prédio",
        chips: [["acao", "Pede ação", c => c.omie === "sem nota" || (c.vence != null && c.vence < 30) || c.assin !== "assinado"],
          ["vencendo", "Vencendo em 30 dias", c => c.vence != null && c.vence >= 0 && c.vence < 30, "at"], ["vencidos", "Vencidos", c => c.vence != null && c.vence < 0, "ri"],
          ["semnota", "Sem nota no mês", c => c.omie === "sem nota", "ri"], ["todos", "Todos", () => true]],
        selPadrao: 88,
        cols: [
          { h: "Contrato", w: "140px", td: c => `<b class="mono">${c.n}</b><span class="sub">${esc(c.serv)}</span>`, ord: c => c.n },
          { h: "Condomínio", td: c => linkCondo(c.c, "contrato"), ord: c => condo(c.c).nome },
          { h: "Por mês", w: "110px", cls: "num", td: c => `<span class="mono">${moeda(c.valor)}</span>`, ord: c => c.valor },
          { h: "Vigência", cls: "c-om", td: c => c.fim ? `até ${c.fim}<span class="sub" style="${c.vence < 30 ? "color:var(--ri-t);font-weight:600" : ""}">${c.vence < 0 ? "venceu há " + Math.round(-c.vence / 30) + " meses" : "vence em " + c.vence + " dias"}</span>` : `<span class="muted">sem data de fim</span>`, ord: c => c.vence ?? 9999 },
          { h: "Nota do mês (Omie)", cls: "c-sit", td: c => `<span class="selo ${OMIE[c.omie][0]}">${OMIE[c.omie][1]}</span><span class="sub">${CT_ASSIN[c.assin][1].toLowerCase()}</span>`, ord: c => c.omie },
        ],
        detalhe: c => ldCab(`${ico("file-signature")}<span class="mono">${c.n}</span> · ${linkCondo(c.c, "contrato")}`, esc(c.serv),
            `<span class="selo ${CT_ASSIN[c.assin][0]}">${CT_ASSIN[c.assin][1]}</span><b class="mono">${moeda(c.valor)} por mês</b>`,
            `${c.vence != null && c.vence < 30 ? `<button class="bt sm pri" type="button" data-toast="Renovação em rascunho">Renovar</button>` : ""}
             ${c.assin !== "assinado" ? `<button class="bt sm pri" type="button" data-toast="Link de assinatura reenviado">Reenviar para assinatura</button>` : ""}
             <button class="bt sm" type="button" data-toast="Baixando o PDF">${ico("file-down")}PDF</button>
             <button class="bt sm ghost" type="button" data-toast="Abre a página do contrato">${ico("external-link")}Abrir página</button>`) +
          (c.omie === "sem nota" ? sec("Por que está sem nota", `<div class="aviso ri">${ico("triangle-alert")}<span>A vigência acabou em ${c.fim} e o contrato continua ativo no Omie. Ou renove aqui, ou encerre no Omie.</span></div>`) : "") +
          sec("Andamento", timeline([["Criado", c.ini, "feita"], ["Enviado para assinatura", c.assin === "rascunho" ? "a seguir" : c.ini, c.assin === "rascunho" ? "atual" : "feita"],
            ["Assinado", c.assin === "assinado" ? c.ini + " · síndico e General" : "falta o síndico", c.assin === "assinado" ? "feita" : c.assin === "aguardando" ? "atual" : ""],
            ["Em vigor", c.fim ? (c.vence < 0 ? "venceu em " + c.fim : "até " + c.fim) : "sem data de fim", c.assin === "assinado" ? (c.vence < 0 ? "erro" : "feita") : ""]])) +
          sec("Notas do contrato (Omie)", `<table class="mini"><tbody>${["nov", "out", "set", "ago"].map((m, i) => `<tr><td>${m}/2026</td><td>${i === 0 && c.omie !== "emitida" ? `<span class="selo ${OMIE[c.omie][0]}">${OMIE[c.omie][1]}</span>` : `<span class="selo ok">emitida</span>`}</td><td class="num mono">${moeda(c.valor)}</td></tr>`).join("")}</tbody></table>`),
      });
    }
  };

  // ═══ PREVENTIVAS ══════════════════════════════════════════════════════
  const PV_ST = { feita: ["ok", "Feita"], campo: ["info", "Em campo"], afazer: ["cz", "A fazer"], atrasada: ["ri", "Atrasada"], sem: ["at", "Sem preventiva"] };
  M.telas.preventivas = () => lista("prev", {
    titulo: "Manutenção preventiva", sub: "Novembro: 3 feitas, 1 em campo, 5 a fazer, 1 atrasada",
    acoes: `<button class="bt pri" type="button" data-toast="Abre a preventiva nova, com prédio, serviço e periodicidade">${ico("plus")}Nova preventiva</button>`,
    topo: `<div class="progresso-mes"><span>Novembro</span><div class="barra-carteira"><i style="flex:3;background:var(--ok-m)"></i><i style="flex:1;background:var(--info-m)"></i><i style="flex:5;background:#c6cedd"></i><i style="flex:1;background:var(--ri-m)"></i></div><span class="mono">3 de 10</span></div>`,
    dados: () => PREV, texto: p => `${condo(p.c).nome} ${p.zona} ${p.serv} ${tecNome(p.tec)}`, busca: "Prédio, zona ou técnico",
    chips: [["mes", "Este mês", p => p.mes !== "sem"], ["afazer", "A fazer", p => p.mes === "afazer" || p.mes === "atrasada"], ["atrasada", "Atrasadas", p => p.mes === "atrasada", "ri"],
      ["semtec", "Sem responsável", p => p.mes !== "sem" && !p.tec, "at"], ["sem", "Prédios sem preventiva", p => p.mes === "sem"]],
    lote: [["tec", "Trocar responsável"], ["gerar", "Gerar chamados agora"]], selPadrao: 6,
    trCls: p => p.mes === "atrasada" ? "risco" : "",
    antes: () => "",
    cols: [
      { h: "Prédio e serviço", td: p => `${linkCondo(p.c, "contrato")}<span class="sub">${esc(p.zona)}${p.mes !== "sem" ? " · " + esc(p.serv.toLowerCase()) + ", " + esc(p.perio.toLowerCase()) : ""}</span>`, ord: p => p.zona + condo(p.c).nome },
      { h: "Este mês", cls: "c-sit", td: p => `<span class="selo ${PV_ST[p.mes][0]}">${PV_ST[p.mes][1]}</span>`, ord: p => Object.keys(PV_ST).indexOf(p.mes) },
      { h: "Próxima", w: "130px", td: p => `<span class="${p.mes === "atrasada" ? "" : "mono"}" style="${p.mes === "atrasada" ? "color:var(--ri-t);font-weight:600" : ""}">${esc(p.prox)}</span>`, ord: p => p.prox },
      { h: "Responsável", cls: "c-om", td: p => p.tec ? esc(tecNome(p.tec)) : `<span style="color:var(--at-t);font-weight:600">ninguém</span>`, ord: p => tecNome(p.tec) },
      { h: "Últimos 12 meses", cls: "c-om", td: p => tira(p.meses) },
    ],
    detalhe: p => p.mes === "sem"
      ? ldCab(`${ico("building-2")}${linkCondo(p.c)}`, "Sem preventiva", `<span class="selo at">Sem preventiva</span>`, `<button class="bt sm pri" type="button" data-toast="Abre a preventiva nova com o prédio escolhido">${ico("plus")}Criar preventiva</button>`) +
        sec("Por que aparece aqui", `<p class="muted" style="margin:0">O prédio tem contrato com preventiva e nenhuma cadastrada.</p>`)
      : ldCab(`${ico("repeat")}${linkCondo(p.c, "contrato")} · ${esc(p.zona)}`, esc(p.serv), `<span class="selo ${PV_ST[p.mes][0]}">${PV_ST[p.mes][1]} em novembro</span><span class="muted">${esc(p.perio)}</span>`,
        `<button class="bt sm" type="button" data-toast="Abre o cadastro da preventiva">${ico("pencil")}Editar</button>
         <button class="bt sm" type="button" data-pop-mais>${ico("ellipsis")}Mais</button>`) +
        sec("Este mês", p.mes === "atrasada" ? `<div class="aviso ri">${ico("triangle-alert")}<span>Passou do dia 12 sem visita. O chamado CH-0204 está com ${tecNome(p.tec)}.</span></div>` :
          fatos([["Chamado", "CH-0" + (200 + p.id)], ["Técnico", p.tec ? tecNome(p.tec) : "ninguém"], ["Dia", p.prox], ["Situação", PV_ST[p.mes][1]]])) +
        sec("Cadastro", fatos([["Periodicidade", p.perio], ["Dia do mês", "15"], ["Responsável", p.tec ? tecNome(p.tec) : "—"], ["Gera chamado", "no dia 1, sozinho"]])) +
        sec("Últimos 12 meses", tira(p.meses, true)),
  });
  function tira(m, grande) {
    if (!m) return `<span class="muted">${grande ? "Ainda sem histórico." : "—"}</span>`;
    const nomes = ["dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov"];
    const cor = { f: "ok", a: "at", x: "ri", c: "info", "-": "vz" };
    const txt = { f: "feita", a: "feita com atraso", x: "não feita", c: "em campo", "-": "sem visita prevista" };
    const cel = m.padStart(12, " ").split("").map((k, i) => `<i class="tm ${cor[k] || "vz"}" title="${nomes[i]}: ${txt[k] || "sem preventiva"}"></i>`).join("");
    return grande ? `<div class="tira grande">${cel}</div><div class="tira-leg">${nomes.map(n => `<span>${n}</span>`).join("")}</div>` : `<div class="tira">${cel}</div>`;
  }

  // ═══ EQUIPAMENTOS ═════════════════════════════════════════════════════
  const EQ_ST = { condominio: ["ok", "No condomínio"], oficina: ["at", "Na oficina"], pronto: ["info", "Pronto para devolver"], baixado: ["cz", "Baixado"], branco: ["cz", "Etiqueta em branco"] };
  M.telas.equipamentos = () => lista("eq", {
    titulo: "Equipamentos", sub: "Bombas, motores e quadros com etiqueta QR",
    acoes: `<button class="bt" type="button" data-toast="Abre a folha de etiquetas para imprimir">${ico("printer")}Imprimir etiquetas</button>
      <button class="bt pri" type="button" data-toast="Gera um lote de etiquetas em branco">${ico("plus")}Gerar etiquetas</button>`,
    dados: () => EQUIP, texto: e => `${e.cod} ${e.tipo} ${e.serie} ${e.c ? condo(e.c).nome : ""}`, busca: "Código, tipo, série ou prédio",
    chips: [["todos", "Em uso", e => e.st !== "branco" && e.st !== "baixado"], ["oficina", "Na oficina", e => e.st === "oficina", "at"], ["pronto", "Prontos para devolver", e => e.st === "pronto", "info"],
      ["branco", "Etiquetas em branco", e => e.st === "branco"], ["baixado", "Baixados", e => e.st === "baixado"]],
    lote: [["etq", "Imprimir etiquetas"]], selPadrao: 2,
    cols: [
      { h: "Equipamento", td: e => `<b>${esc(e.tipo)}</b><span class="sub"><span class="mono">${e.cod}</span> · série ${esc(e.serie)}</span>`, ord: e => e.cod },
      { h: "Condomínio", cls: "c-om", td: e => e.c ? `${linkCondo(e.c, "equipamentos")}<span class="sub">desde ${e.desde}</span>` : `<span class="muted">${e.desde}</span>`, ord: e => e.c ? condo(e.c).nome : "~" },
      { h: "Situação", cls: "c-sit", td: e => `<span class="selo ${EQ_ST[e.st][0]}">${e.fase || EQ_ST[e.st][1]}</span>${e.defeito ? `<span class="sub">${esc(e.defeito)}</span>` : ""}`, ord: e => e.st },
    ],
    detalhe: e => ldCab(`${ico("package")}<span class="mono">${e.cod}</span>${e.c ? " · " + linkCondo(e.c, "equipamentos") : ""}`, esc(e.tipo), `<span class="selo ${EQ_ST[e.st][0]}">${e.fase || EQ_ST[e.st][1]}</span>`,
        `${e.st === "pronto" ? `<button class="bt sm pri" type="button" data-toast="Devolução registrada">Registrar devolução</button>` : ""}
         ${e.st === "oficina" ? `<button class="bt sm pri" type="button" data-toast="Abre o orçamento do conserto">Fazer orçamento do conserto</button>` : ""}
         <button class="bt sm ghost" type="button" data-toast="Abre a ficha pública /e/${e.cod} em outra aba">${ico("external-link")}Ficha do QR</button>`) +
      sec("Dados", fatos([["Código", `<span class="mono">${e.cod}</span>`], ["Série", esc(e.serie)], ["Onde está", e.st === "oficina" || e.st === "pronto" ? "Oficina da General" : e.c ? condo(e.c).nome : "—"], ["Desde", e.desde]])) +
      (e.st !== "branco" ? sec("Histórico", timeline([["Instalado", "02/2024 · " + (e.c ? condo(e.c).nome : ""), "feita"], ...(e.defeito ? [["Retirado para a oficina", "04/11/2026 · " + esc(e.defeito), "feita"], ["Orçamento do conserto", e.st === "oficina" ? "a seguir" : "aprovado 12/11", e.st === "oficina" ? "atual" : "feita"], ["Devolvido", e.st === "pronto" ? "a seguir" : "", e.st === "pronto" ? "atual" : ""]] : [])])) : ""),
  });

  // ═══ COLABORADORES ════════════════════════════════════════════════════
  M.telas.colaboradores = () => lista("col", {
    titulo: "Colaboradores", sub: "Quem usa o sistema e o app",
    acoes: `<button class="bt pri" type="button" data-toast="Convite enviado por e-mail">${ico("user-plus")}Convidar</button>`,
    dados: () => COLABS, texto: c => `${c.nome} ${c.funcao}`, busca: "Nome ou função", semExportar: true,
    chips: [["ativos", "Ativos", c => !c.inativo], ["tec", "Técnicos", c => c.funcao === "Técnico" && !c.inativo], ["escr", "Escritório", c => c.funcao !== "Técnico" && !c.inativo], ["inativos", "Inativos", c => c.inativo]],
    selPadrao: 1,
    cols: [
      { h: "Nome", td: c => `<span class="pessoa"><span class="av is-claro">${c.nome.split(" ").map(x => x[0]).join("").slice(0, 2)}</span><span><b>${esc(c.nome)}</b><span class="sub">${esc(c.fone)}</span></span></span>`, ord: c => c.nome },
      { h: "Função", cls: "c-sit", td: c => `<span class="selo fio">${c.funcao}</span>`, ord: c => c.funcao },
      { h: "Agora", cls: "c-om", td: c => c.funcao === "Técnico" ? `<span class="pt ok" style="margin-right:6px"></span>${esc(c.gps)}` : `<span class="muted">—</span>` },
      { h: "Chamados abertos", w: "140px", cls: "num c-om", td: c => `<span class="mono">${c.abertos}</span>`, ord: c => c.abertos },
    ],
    detalhe: c => ldCab(`${ico("user")}${c.funcao}`, esc(c.nome), c.funcao === "Técnico" ? `<span class="selo ok">App online</span><span class="muted">${esc(c.gps)}</span>` : "",
        `<button class="bt sm" type="button" data-toast="Abre o cadastro">${ico("pencil")}Editar</button>${c.funcao === "Técnico" ? `<a class="bt sm" href="#/agenda">${ico("calendar-days")}Ver na agenda</a>` : ""}`) +
      sec("Cadastro", fatos([["Telefone", esc(c.fone)], ["Função", c.funcao], ["Acesso", c.funcao === "Técnico" ? "app do técnico" : "painel"], ["Zona", c.zona || "—"]])) +
      (c.funcao === "Técnico" ? sec("Hoje", `<p style="margin:0">${c.abertos} chamados com ele, 2 visitas feitas.</p>`) : ""),
  });

  // ═══ CONDOMÍNIOS (lista) ══════════════════════════════════════════════
  function aguaDe(cid) {
    const rs = RES.filter(r => r.c === cid);
    if (!rs.length) return { sit: "cz", txt: "sem telemetria", sub: "" };
    const pior = rs.slice().sort((a, b) => ({ ri: 0, at: 1, ok: 2 }[a.sit]) - ({ ri: 0, at: 1, ok: 2 }[b.sit]) || a.nivel - b.nivel)[0];
    return { sit: pior.sit, txt: pior.sit === "ok" ? "normal" : pior.motivo.toLowerCase(), sub: `${rs.length} ${rs.length === 1 ? "reservatório" : "reservatórios"} · menor ${Math.min(...rs.map(r => r.nivel))}%` };
  }
  const contratoDe = cid => CONTRATOS.find(c => c.c === cid);
  M.telas.condominios = (nome, arg) => {
    if (arg) return paginaCondo(Number(arg), (location.hash.split("/")[3]) || "");
    lista("cd", {
      titulo: "Condomínios", sub: `${CONDOS.length} condomínios ativos`, semPainel: true,
      acoes: `<button class="bt pri" type="button" data-toast="Abre o cadastro do condomínio novo">${ico("plus")}Novo condomínio</button>`,
      dados: () => CONDOS, texto: c => `${c.nome} ${c.bairro}`, busca: "Nome, bairro ou CNPJ",
      chips: [["todos", "Ativos", () => true], ["agua", "Água pede atenção", c => aguaDe(c.id).sit === "ri" || aguaDe(c.id).sit === "at", "ri"],
        ["chamados", "Com chamado aberto", c => CHAMADOS.some(x => x.c === c.id && x.st !== "resolvido")], ["semct", "Sem contrato", c => !contratoDe(c.id)]],
      lote: [["msg", "Mandar aviso aos síndicos"]],
      cols: [
        { h: "Condomínio", td: c => `<b>${esc(c.nome)}</b><span class="sub">${esc(c.bairro)} · São Paulo</span>`, ord: c => c.nome },
        { h: "Água", cls: "c-sit", td: c => { const a = aguaDe(c.id); return `<span class="selo ${a.sit}">${a.txt}</span><span class="sub">${a.sub}</span>`; }, ord: c => ({ ri: 0, at: 1, ok: 2, cz: 3 }[aguaDe(c.id).sit]) },
        { h: "Chamados", cls: "c-om", td: c => { const n = CHAMADOS.filter(x => x.c === c.id && x.st !== "resolvido").length; return n ? `<b>${n} em aberto</b>` : `<span class="muted">nenhum</span>`; }, ord: c => -CHAMADOS.filter(x => x.c === c.id && x.st !== "resolvido").length },
        { h: "Contrato", cls: "c-om", td: c => { const k = contratoDe(c.id); return k ? `<span class="mono">${moeda(k.valor)}</span>/mês<span class="sub">${k.vence != null && k.vence < 0 ? '<span style="color:var(--ri-t);font-weight:600">vencido</span>' : k.fim ? "até " + k.fim : "sem fim"}</span>` : `<span class="muted">sem contrato</span>`; }, ord: c => contratoDe(c.id)?.valor || 0 },
        { h: "Preventiva", cls: "c-om", td: c => { const p = PREV.find(x => x.c === c.id); return p && p.mes !== "sem" ? `<span class="selo ${PV_ST[p.mes][0]}">${PV_ST[p.mes][1]}</span><span class="sub">próxima ${p.prox}</span>` : `<span class="muted">—</span>`; } },
      ],
      detalhe: () => "",
    });
  };

  // ═══ PÁGINA DO CONDOMÍNIO (ficha de cliente) ══════════════════════════
  // No lugar de 10 abas: dados à esquerda, linha do tempo no meio, o que está
  // em aberto e a água ao vivo à direita. É o molde da página de cliente do
  // HubSpot e do ServiceTitan.
  let fichaF = "tudo";
  function paginaCondo(id) {
    const c = condo(id);
    if (!c) { location.hash = "#/condominios"; return; }
    const rs = RES.filter(r => r.c === id);
    const chs = CHAMADOS.filter(x => x.c === id);
    const abertos = chs.filter(x => x.st !== "resolvido");
    const ct = contratoDe(id), pv = PREV.find(p => p.c === id), eqs = EQUIP.filter(e => e.c === id);
    const orcs = ORC.filter(o => o.c === id), oss = OS.filter(o => o.c === id);
    const a = aguaDe(id);
    const eventos = [
      ...chs.map(x => ({ t: "chamados", ic: "inbox", d: x.h, txt: `Chamado <a class="lk" href="#/atendimento/${x.id}">CH-0${x.id}</a> · ${esc(x.t)}`, s: x.st === "resolvido" ? "resolvido" : "em aberto" })),
      ...oss.map(o => ({ t: "os", ic: "clipboard-check", d: o.data, txt: `<a class="lk" href="#/os">OS-0${o.id}</a> · ${esc(o.serv)}`, s: OS_ST[o.st][1].toLowerCase() })),
      ...orcs.map(o => ({ t: "orcamentos", ic: "file-text", d: o.data, txt: `<a class="lk" href="#/orcamentos">${o.n === "—" ? "Pedido de orçamento" : o.n}</a> · ${esc(o.desc)}`, s: `${ORC_ST[o.st][1].toLowerCase()} · ${moeda(o.valor)}` })),
      ...orcs.filter(o => o.nota).map(o => ({ t: "financeiro", ic: "receipt", d: "06/11", txt: `Nota do ${o.n}`, s: NF_ST[o.nota][1].toLowerCase() })),
      ...rs.filter(r => r.sit !== "ok").map(r => ({ t: "agua", ic: r.mudo ? "wifi-off" : "droplet", d: "19/11", txt: `${esc(r.nome)}: ${esc(r.motivo.toLowerCase())}`, s: "alerta aberto" })),
      { t: "agua", ic: "droplet", d: "12/11", txt: "Nível baixo na caixa superior", s: "resolvido em 2 h 10 min" },
      { t: "contrato", ic: "file-signature", d: "01/11", txt: ct ? `Nota de outubro do ${ct.n}` : "Cadastro atualizado", s: ct ? "emitida pelo Omie" : "" },
    ].sort((x, y) => (y.d === "ontem" ? "18/11" : y.d).split("/").reverse().join("").localeCompare((x.d === "ontem" ? "18/11" : x.d).split("/").reverse().join("")));
    const F = [["tudo", "Tudo"], ["chamados", "Chamados"], ["os", "O.S."], ["orcamentos", "Orçamentos"], ["financeiro", "Notas"], ["agua", "Água"]];
    const evs = eventos.filter(e => fichaF === "tudo" || e.t === fichaF);
    $("#pagina").innerHTML = `
      <header class="pg-cab ficha-cab">
        <div class="migalha"><a href="#/condominios">Condomínios</a>${ico("chevron-right")}<span>${esc(c.nome)}</span></div>
        <div class="ficha-tit">
          <span class="ficha-av">${esc(c.nome.replace(/^(Ed\.|Cond\.|Res\.) /, "").slice(0, 2).toUpperCase())}</span>
          <div><h1>${esc(c.nome)}</h1><span class="pg-sub">${esc(c.bairro)} · São Paulo · CNPJ 12.345.678/0001-${String(id).padStart(2, "0")}</span></div>
          <span class="esp"></span>
          <button class="bt" type="button" data-toast="Abre o cadastro">${ico("pencil")}Editar</button>
          <button class="bt pri" type="button" data-pop="novo-condo">${ico("plus")}Novo ${ico("chevron-down")}</button>
        </div>
        <div class="ficha-fatos">
          <span><i class="pt ${a.sit}"></i>Água: <b>${a.txt}</b></span>
          <span>${ico("inbox")}<b>${abertos.length}</b> ${abertos.length === 1 ? "chamado aberto" : "chamados abertos"}</span>
          <span>${ico("file-signature")}${ct ? `Contrato <b>${moeda(ct.valor)}</b>/mês${ct.vence != null && ct.vence < 0 ? ' · <b style="color:var(--ri-t)">vencido</b>' : ""}` : "Sem contrato"}</span>
          <span>${ico("repeat")}${pv && pv.mes !== "sem" ? `Preventiva ${pv.perio.toLowerCase()} · <b>${PV_ST[pv.mes][1].toLowerCase()}</b> em nov` : "Sem preventiva"}</span>
        </div>
      </header>
      <div class="ficha">
        <aside class="ficha-esq">
          ${bloco("Cadastro", fatos([["Síndico", "Sr. Antônio Ramos"], ["Telefone", "(11) 99120-4471"], ["E-mail", "sindico@" + c.nome.split(" ")[1].toLowerCase() + ".com.br"], ["Zelador", "Luís · (11) 98100-2290"], ["Endereço", "R. Exemplo, 120 · " + esc(c.bairro)], ["Administradora", "Lello"]]))}
          ${bloco("Contrato e preventiva", ct ? `<div class="ligado">${ico("file-signature")}<a class="lk" href="#/financeiro">${ct.n}</a><span class="esp"></span><span class="selo ${CT_ASSIN[ct.assin][0]}">${CT_ASSIN[ct.assin][1]}</span></div>
              <div class="ligado">${ico("repeat")}<a class="lk" href="#/preventivas">${pv && pv.mes !== "sem" ? esc(pv.serv) + " · " + pv.perio.toLowerCase() : "Criar preventiva"}</a><span class="esp"></span>${pv && pv.mes !== "sem" ? `<span class="muted">próx. ${pv.prox}</span>` : ""}</div>
              ${pv && pv.meses ? tira(pv.meses) : ""}` : `<p class="muted" style="margin:0 0 8px">Sem contrato.</p><button class="bt sm" type="button" data-toast="Abre o contrato novo com o prédio">${ico("plus")}Criar contrato</button>`)}
          ${bloco(`Equipamentos <span class="n mono muted">${eqs.length}</span>`, eqs.length ? eqs.map(e => `<div class="ligado">${ico("package")}<span>${esc(e.tipo)}<span class="sub mono">${e.cod}</span></span><span class="esp"></span><span class="selo ${EQ_ST[e.st][0]}">${EQ_ST[e.st][1]}</span></div>`).join("") : `<p class="muted" style="margin:0">Nenhum equipamento etiquetado.</p>`)}
        </aside>
        <section class="ficha-meio">
          <div class="bloco">
            <div class="bloco-cab"><h2>Histórico do prédio</h2><span class="esp"></span></div>
            <div class="bloco-chips chips">${F.map(([k, n]) => `<button class="chip${fichaF === k ? " is-on" : ""}" type="button" data-ficha-f="${k}">${n}</button>`).join("")}</div>
            <div class="nota-nova"><textarea rows="1" placeholder="Escrever uma nota sobre o prédio…" aria-label="Nova nota"></textarea><button class="bt sm" type="button" data-toast="Nota salva no histórico">Salvar nota</button></div>
            <ol class="hist">${evs.length ? evs.map(e => `<li><span class="hist-ic">${ico(e.ic)}</span><div><span>${e.txt}</span><small>${esc(e.s)}</small></div><time>${e.d}</time></li>`).join("") : `<li class="muted" style="padding:18px 0">Nada deste tipo ainda.</li>`}</ol>
          </div>
        </section>
        <aside class="ficha-dir">
          ${bloco("Água agora", rs.length ? rs.map(r => `<a class="res-mini" href="#/monitoramento/${r.id}"><span>${esc(r.nome)}<small>${esc(r.sinal)}</small></span>
              ${r.mudo ? `<span class="selo ri">sem sinal</span>` : `<span class="nivel"><span class="nivel-barra"><i style="width:${r.nivel}%;background:${corNivel(r.nivel)}"></i></span><b>${r.nivel}%</b></span>`}</a>`).join("") : `<p class="muted" style="margin:0">Sem telemetria instalada.</p>`)}
          ${bloco("Em aberto", [...abertos.map(x => `<div class="ligado">${ico("inbox")}<a class="lk" href="#/atendimento/${x.id}">CH-0${x.id}</a><span class="sub-in">${esc(x.t)}</span><span class="esp"></span><span class="prio p${x.p}">P${x.p}</span></div>`),
              ...orcs.filter(o => ["solicitado", "rascunho", "enviado", "resposta"].includes(o.st)).map(o => `<div class="ligado">${ico("file-text")}<a class="lk" href="#/orcamentos">${o.n === "—" ? "Pedido" : o.n}</a><span class="sub-in">${ORC_ST[o.st][1]}</span></div>`),
              ...oss.filter(o => o.st !== "enviada").map(o => `<div class="ligado">${ico("clipboard-check")}<a class="lk" href="#/os">OS-0${o.id}</a><span class="sub-in">${OS_ST[o.st][1]}</span></div>`)].join("") || `<p class="muted" style="margin:0">Nada em aberto.</p>`)}
          ${bloco("Acesso do síndico", `<p style="margin:0 0 8px">O síndico vê o painel do cliente desde 03/2025.</p><button class="bt sm" type="button" data-toast="Link de acesso reenviado">Reenviar acesso</button>`)}
        </aside>
      </div>`;
    icones();
  }
  const bloco = (t, html) => `<section class="bloco ficha-bloco"><div class="bloco-cab"><h2>${t}</h2></div><div class="ficha-bloco-corpo">${html}</div></section>`;

  // ═══ AGENDA (quadro de despacho) ══════════════════════════════════════
  const DIAS = ["Seg 17", "Ter 18", "Qua 19", "Qui 20", "Sex 21"];
  const AG = [
    { id: 1, t: 1, d: 0, h: "08:00", c: 6, k: "prev", txt: "Preventiva mensal" }, { id: 2, t: 1, d: 1, h: "09:00", c: 9, k: "ch", txt: "CH-0226 · quadro" },
    { id: 3, t: 1, d: 2, h: "09:00", c: 3, k: "ch", txt: "CH-0228 · vazamento", agora: true }, { id: 4, t: 1, d: 2, h: "13:30", c: 5, k: "ch", txt: "CH-0233 · ruído" },
    { id: 5, t: 1, d: 2, h: "15:00", c: 8, k: "prev", txt: "Limpeza de caixa" }, { id: 6, t: 1, d: 3, h: "10:00", c: 2, k: "ch", txt: "CH-0230 · bloco B" },
    { id: 7, t: 2, d: 0, h: "08:30", c: 10, k: "ch", txt: "CH-0226 · quadro" }, { id: 8, t: 2, d: 2, h: "10:45", c: 1, k: "ch", txt: "CH-0231 · nível 14%" },
    { id: 9, t: 2, d: 2, h: "14:00", c: 10, k: "prev", txt: "Preventiva mensal" }, { id: 10, t: 2, d: 4, h: "09:00", c: 7, k: "prev", txt: "Preventiva mensal" },
    { id: 11, t: 3, d: 1, h: "08:00", c: 2, k: "prev", txt: "Preventiva mensal" }, { id: 12, t: 3, d: 2, h: "11:00", c: 4, k: "ret", txt: "Retorno da OS-0398" },
    { id: 13, t: 3, d: 3, h: "09:00", c: 9, k: "prev", txt: "Preventiva mensal" },
    { id: 14, t: 0, d: 0, h: "10:00", k: "reu", txt: "Reunião com a Lello" }, { id: 15, t: 0, d: 2, h: "—", k: "fin", txt: "Omie: 77 de 81 faturados" },
    { id: 16, t: 0, d: 4, h: "—", k: "pag", txt: "Pagamento dos técnicos" }, { id: 17, t: 0, d: 3, h: "—", k: "ct", txt: "Contrato Alto da Lapa termina em 12 d" },
  ];
  const AGENDAR = [
    { id: 101, k: "ch", c: 1, txt: "CH-0231 · Caixa superior em 14%", sub: "P1 · vence em 1 h 22 min" },
    { id: 102, k: "ch", c: 7, txt: "CH-0224 · Cisterna sem sinal", sub: "P3 · fora do prazo" },
    { id: 103, k: "prev", c: 5, txt: "Preventiva de novembro", sub: "Zona Oeste · sem responsável" },
    { id: 104, k: "prev", c: 10, txt: "Preventiva de novembro", sub: "Zona Oeste · sem responsável" },
    { id: 105, k: "ret", c: 6, txt: "Retorno pedido na OS-0411", sub: "sugerido para 25/11" },
  ];
  const AG_K = { ch: ["info", "Chamado"], prev: ["ok", "Preventiva"], ret: ["at", "Retorno de O.S."], reu: ["cz", "Reunião"], fin: ["roxo", "Faturamento"], pag: ["roxo", "Pagamento"], ct: ["at", "Contrato"] };
  let agModo = "semana", agSel = 3;
  M.telas.agenda = () => {
    const linhas = [...TECNICOS.map(t => ({ id: t.id, nome: t.nome, sub: ["Zona Leste e Centro", "Zona Sul e Oeste", "Zona Norte"][t.id - 1] })), { id: 0, nome: "Empresa", sub: "reuniões, pagamentos, Omie" }];
    $("#pagina").innerHTML = `
      <header class="pg-cab">
        <h1>Agenda</h1>
        <div class="per">
          <button class="ib" type="button" aria-label="Semana anterior">${ico("chevron-left")}</button>
          <b>17 a 21 de novembro</b>
          <button class="ib" type="button" aria-label="Próxima semana">${ico("chevron-right")}</button>
          <button class="bt sm" type="button">Hoje</button>
        </div>
        <span class="esp"></span>
        <div class="seg" role="group" aria-label="Modo de ver">
          ${[["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["mapa", "Mapa"]].map(([k, n]) => `<button type="button" data-ag-modo="${k}" class="${agModo === k ? "is-on" : ""}">${n}</button>`).join("")}
        </div>
        <button class="bt pri" type="button" data-toast="Abre o compromisso novo">${ico("plus")}Compromisso</button>
      </header>
      <div class="desp">
        <aside class="desp-fila">
          <div class="desp-fila-cab"><b>A agendar</b><span class="n mono muted" id="agN">${AGENDAR.length}</span></div>
          <p class="muted desp-dica">Escolha um item e diga quem vai e quando.</p>
          <div id="agFila">${filaAg()}</div>
        </aside>
        <div class="desp-grade" id="agGrade">
          ${agModo === "mapa" ? `<div id="agMapa" style="height:100%"></div>` : `
          <div class="grade" style="grid-template-columns: 170px repeat(${DIAS.length}, minmax(130px, 1fr))">
            <div class="g-cab"></div>${DIAS.map((d, i) => `<div class="g-cab${i === 2 ? " hoje" : ""}">${d}${i === 2 ? " · hoje" : ""}</div>`).join("")}
            ${linhas.map(l => `<div class="g-tec${l.id === 0 ? " emp" : ""}"><b>${esc(l.nome)}</b><small>${esc(l.sub)}</small>${l.id ? `<span class="carga" title="visitas na semana"><i style="width:${[80, 60, 45][l.id - 1]}%"></i></span>` : ""}</div>
              ${DIAS.map((_, d) => `<div class="g-cel${d === 2 ? " hoje" : ""}${l.id === 0 ? " emp" : ""}">${AG.filter(x => x.t === l.id && x.d === d).map(x =>
                `<button type="button" class="ag-it ${AG_K[x.k][0]}${x.agora ? " agora" : ""}${x.id === agSel ? " is-sel" : ""}" data-ag="${x.id}"><span class="mono">${x.h !== "—" ? x.h : ""}</span>${esc(x.txt)}${x.c ? `<small>${esc(condo(x.c).nome)}</small>` : ""}</button>`).join("")}</div>`).join("")}`).join("")}
          </div>`}
        </div>
        <aside class="painel-lado desp-lado" id="agLado"></aside>
      </div>`;
    ladoAg(); icones();
    if (agModo === "mapa" && window.L) {
      const m = L.map("agMapa").setView([-23.555, -46.645], 12);
      L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "© Esri · © OpenStreetMap" }).addTo(m);
      [[3, "CS"], [1, "ML"], [4, "JP"]].forEach(([cid, ini], i) => {
        const c = condo(cid);
        L.marker([c.lat + (i === 1 ? -0.006 : 0), c.lng + (i === 1 ? 0.01 : 0)], { icon: L.divIcon({ className: "", html: `<div class="pin-tec">${ini}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(m);
      });
      AG.filter(x => x.d === 2 && x.c).forEach(x => { const c = condo(x.c); L.circleMarker([c.lat, c.lng], { radius: 6, color: "#fff", weight: 2, fillColor: "#0d2775", fillOpacity: 1 }).addTo(m).bindTooltip(`${x.h} · ${c.nome}`); });
      M.limpar = () => m.remove();
    }
  };
  const filaAg = () => AGENDAR.map(a => `<div class="fila-ag"><span class="pt ${AG_K[a.k][0]}"></span><div><b>${esc(a.txt)}</b><small>${esc(condo(a.c).nome)} · ${esc(a.sub)}</small></div>
      <button class="bt sm" type="button" data-agendar="${a.id}">Agendar</button></div>`).join("") || `<p class="muted" style="padding:0 14px">Tudo agendado.</p>`;
  function ladoAg() {
    const x = AG.find(i => i.id === agSel), lado = $("#agLado");
    if (!lado) return;
    if (!x) { lado.innerHTML = `<div class="ld-vazio">Escolha um compromisso.</div>`; return; }
    lado.innerHTML = ldCab(`<span class="selo ${AG_K[x.k][0]}">${AG_K[x.k][1]}</span>`, esc(x.txt), `<span class="muted">${DIAS[x.d]} de novembro${x.h !== "—" ? " · " + x.h : ""}${x.t ? " · " + tecNome(x.t) : ""}</span>`,
      x.k === "ch" ? `<a class="bt sm pri" href="#/atendimento/228">${ico("inbox")}Abrir chamado</a><button class="bt sm" type="button" data-toast="Escolha outro técnico ou dia">Remarcar</button>`
        : x.k === "fin" ? `<button class="bt sm pri" type="button" data-toast="Abre o faturamento do mês no Financeiro">Ver no Financeiro</button>` : `<button class="bt sm" type="button" data-toast="Abre o compromisso">${ico("pencil")}Editar</button>`) +
      (x.c ? sec("Onde", `<div class="ligado">${ico("building-2")}${linkCondo(x.c)}<span class="esp"></span><span class="muted">${esc(condo(x.c).bairro)}</span></div>`) : "") +
      (x.k === "fin" ? sec("Faturamento de novembro", `<p style="margin:0 0 6px"><b>77 de 81</b> contratos com nota · R$ 69.420 de R$ 72.090.</p><p class="muted" style="margin:0">4 sem nota: vigência vencida e contrato ativo no Omie.</p>`) : "");
    icones();
  }

  // ═══ CONFIGURAÇÕES ════════════════════════════════════════════════════
  const CFG = [
    ["conta", "Conta", "user"], ["usuarios", "Usuários e acesso", "users"], ["notificacoes", "Notificações", "bell"], ["sla", "Prazos (SLA)", "clock"],
    ["operacional", "Operação", "gauge"], ["ia", "Atendimento com IA", "message-circle"], ["integracoes", "Integrações", "plug"], ["manutencao", "Limpeza de dados", "database"],
  ];
  let cfgSel = "sla";
  M.telas.config = () => {
    const corpo = {
      conta: [["Seus dados", [["Nome", "Pedro"], ["E-mail", "•••••@gmail.com"]]], ["Segurança", [["Senha", `<button class="bt sm" type="button">Alterar senha</button>`], ["Dispositivos confiáveis", "2 aparelhos · <a class='lk' href='#/config'>gerenciar</a>"]]]],
      usuarios: [["Usuários do sistema", [["Quem pode entrar", "6 pessoas · <a class='lk' href='#/colaboradores'>ver em Colaboradores</a>"], ["Perfis", "Admin, Gestor, Operador, Técnico, Visualizador"]]]],
      notificacoes: [["E-mails de alerta", [["Para quem", "plantao@generalbombas.com"], ["Quando", "nível muito baixo, sem sinal, chamado P1"]]]],
      sla: [["Prazo por prioridade", [["P1 · Crítico", "<span class='campo-num'><input value='2'> horas</span>"], ["P2 · Alta", "<span class='campo-num'><input value='4'> horas</span>"], ["P3 · Controlado", "<span class='campo-num'><input value='24'> horas</span>"], ["P4 · Agendado", "<span class='campo-num'><input value='72'> horas</span>"]]],
        ["Como o prazo conta", [["Horário", "corrido, 24 h por dia"], ["Pausa", "não pausa enquanto espera o cliente"]]]],
      operacional: [["Verificação de aparelho sem sinal", [["A cada", "<span class='campo-num'><input value='5'> minutos</span>"]]], ["GPS dos técnicos", [["Frequência", "<span class='campo-num'><input value='60'> segundos</span>"], ["Janela", "das 8 h às 18 h"], ["Guardar histórico", "<span class='campo-num'><input value='30'> dias</span>"]]]],
      ia: [["Comportamento da IA", [["Situação", "<span class='selo cz'>desligada</span>"], ["Tempo da conversa", "fecha depois de 30 min sem resposta"]]]],
      integracoes: [["Omie", [["Situação", "<span class='selo ok'>conectado</span>"], ["Cópia do faturamento", "a cada 60 min · última às 10:00"]]], ["WhatsApp", [["Situação", "<span class='selo cz'>não configurado</span>"]]]],
      manutencao: [["Leituras antigas", [["Apagar depois de", "<span class='campo-num'><input value='90'> dias</span>"], ["Última limpeza", "hoje 03:00 · 41.220 leituras"]]], ["Alertas resolvidos", [["Apagar depois de", "<span class='campo-num'><input value='180'> dias</span>"]]]],
    }[cfgSel];
    $("#pagina").innerHTML = `
      <header class="pg-cab"><h1>Configurações</h1><span class="pg-sub">Só a gestão vê esta tela</span></header>
      <div class="cfg">
        <nav class="cfg-nav" aria-label="Seções">${CFG.map(([k, n, i]) => `<a href="#/config" class="${cfgSel === k ? "is-on" : ""}" data-cfg="${k}">${ico(i)}${n}</a>`).join("")}</nav>
        <div class="cfg-corpo">
          <h2>${CFG.find(c => c[0] === cfgSel)[1]}</h2>
          ${corpo.map(([t, linhas]) => `<section class="cfg-grupo"><h3>${t}</h3>${linhas.map(([k, v]) => `<div class="cfg-linha"><span>${k}</span><div>${v}</div></div>`).join("")}</section>`).join("")}
          <div class="cfg-pe"><button class="bt pri" type="button" data-toast="Configurações salvas">Salvar</button><button class="bt ghost" type="button">Descartar</button></div>
        </div>
      </div>`;
    icones();
  };

  // ═══ RELATÓRIOS: o dashboard de gestão (maquete, 20/11/2026) ══════════
  // Respostas do Pedro: quem olha é ele, toda semana ou mês; abre no mês
  // corrente contra o anterior; responde atendimento/prazo, dinheiro, técnicos
  // e prédios/equipamentos; exportar saiu (cada lista tem o seu). Todo número
  // leva para a lista. Contratos em --info-m e O.S. em --at-m (par validado:
  // CVD ΔE 33), com legenda e o valor escrito embaixo.
  let relPer = "mes";
  const MESES = ["dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov"];
  const REL = {
    cham: [58, 61, 66, 72, 69, 63, 70, 74, 68, 77, 71, 64],
    sla: [79, 80, 77, 74, 78, 82, 80, 76, 81, 79, 81, 87],
    fatC: [96, 96, 98, 98, 101, 101, 103, 104, 104, 107, 108, 109],
    fatO: [22, 28, 31, 25, 34, 30, 27, 38, 33, 29, 31.9, 39.3],
  };
  // [nome, valor, mês anterior, variação, menor é melhor, link, dica, unidade da variação]
  const KPI = [
    ["Chamados abertos", "64", "71", -10, true, "#/atendimento", "chamados abertos no mês"],
    ["Tempo até atender", "2 h 10", "3 h 05", -30, true, "#/atendimento", "mediana, do chamado aberto ao técnico no local"],
    ["Dentro do prazo", "87%", "81%", 6, false, "#/atendimento", "chamados fechados no prazo do contrato", " p.p."],
    ["Faturado", "R$ 148,3 mil", "R$ 139,9 mil", 6, false, "#/financeiro", "contratos + O.S., pela data da nota"],
    ["Orçamentos aprovados", "58%", "49%", 9, false, "#/orcamentos", "18 de 31 enviados no mês", " p.p."],
    ["Preventivas feitas", "90%", "94%", -4, false, "#/preventivas", "52 de 58 previstas no mês", " p.p."],
  ];
  const TEC_REL = [
    { t: 1, os: 41, horas: "96 h", ret: 1, prevF: 19, prevP: 20 },
    { t: 2, os: 34, horas: "88 h", ret: 4, prevF: 17, prevP: 20 },
    { t: 3, os: 29, horas: "71 h", ret: 0, prevF: 16, prevP: 18 },
  ];
  const PRED_REL = [[1, 14, 3], [2, 11, 1], [5, 9, 2], [3, 7, 0], [6, 5, 0]];
  const EQ_REL = [
    ["Bomba centrífuga 3 cv", "Schneider BC-92", 6, "4 prédios"],
    ["Boia elétrica", "Anauger", 5, "5 prédios"],
    ["Pressurizador", "Rowa SFL 20", 3, "2 prédios"],
    ["Quadro de comando", "WEG", 2, "2 prédios"],
  ];
  const RES_REL = [[1, "Caixa superior", 9, "nível muito baixo"], [2, "Cisterna", 6, "sem sinal"], [5, "Cisterna", 4, "nível baixo"]];
  const virg = v => String(v).replace(".", ",");

  const delta = (v, menorMelhor, un) => {
    if (!v) return `<span class="kd">igual</span>`;
    const bom = menorMelhor ? v < 0 : v > 0;
    return `<span class="kd ${bom ? "is-bom" : "is-mau"}">${ico(v > 0 ? "arrow-up-right" : "arrow-down-right")}${Math.abs(v)}${un || "%"}</span>`;
  };
  // topo arredondado (4px) e base reta no eixo
  const coluna = (x, base, h, w) => `M${x},${base} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z`;
  // barras de uma série: 12 meses, o mês atual destacado e só ele com rótulo
  function barras(vals, fmt, alto = 120) {
    const w = 600, max = Math.max(...vals) * 1.15, bw = w / vals.length, bwi = bw * .56;
    return `<svg class="gf" viewBox="0 0 ${w} ${alto + 22}" role="img" aria-label="Chamados abertos nos últimos 12 meses">
      <line x1="0" x2="${w}" y1="${alto / 2}" y2="${alto / 2}" class="gf-grade"/>
      <line x1="0" x2="${w}" y1="${alto}" y2="${alto}" class="gf-base"/>
      ${vals.map((v, i) => { const h = alto * v / max, x = i * bw + bw * .22, ult = i === vals.length - 1;
        return `<g class="gf-m"><rect x="${i * bw}" y="0" width="${bw}" height="${alto + 22}" class="gf-alvo"><title>${MESES[i]}: ${fmt(v)}</title></rect>
          <path d="${coluna(x, alto, h, bwi)}" class="gf-b${ult ? " is-ult" : ""}"/>
          ${ult ? `<text x="${x + bwi / 2}" y="${alto - h - 6}" class="gf-v">${fmt(v)}</text>` : ""}
          <text x="${i * bw + bw / 2}" y="${alto + 16}" class="gf-x">${MESES[i]}</text></g>`; }).join("")}
    </svg>`;
  }
  // empilhado de duas séries, com 2px de folga entre os segmentos
  function empilhado(a, b, alto = 120) {
    const w = 600, max = Math.max(...a.map((v, i) => v + b[i])) * 1.12, bw = w / a.length, bwi = bw * .56;
    return `<svg class="gf" viewBox="0 0 ${w} ${alto + 22}" role="img" aria-label="Faturado por mês, contratos e O.S.">
      <line x1="0" x2="${w}" y1="${alto}" y2="${alto}" class="gf-base"/>
      ${a.map((v, i) => { const ha = alto * v / max, hb = alto * b[i] / max, x = i * bw + bw * .22;
        return `<g class="gf-m"><rect x="${i * bw}" y="0" width="${bw}" height="${alto + 22}" class="gf-alvo"><title>${MESES[i]}: R$ ${virg((v + b[i]).toFixed(1))} mil (contratos ${virg(v)} · O.S. ${virg(b[i])})</title></rect>
          <rect x="${x}" y="${alto - ha}" width="${bwi}" height="${ha}" class="gf-s1"/>
          <path d="${coluna(x, alto - ha - 2, hb - 2, bwi)}" class="gf-s2"/>
          ${i === a.length - 1 ? `<text x="${x + bwi / 2}" y="${alto - ha - hb - 6}" class="gf-v">${virg((v + b[i]).toFixed(1))}</text>` : ""}
          <text x="${i * bw + bw / 2}" y="${alto + 16}" class="gf-x">${MESES[i]}</text></g>`; }).join("")}
    </svg>`;
  }
  const medidor = (f, p) => `<span class="med"><span style="width:${Math.round(100 * f / p)}%"></span></span>`;
  const relBloco = (t, sub, corpo, link) => `<section class="rel-bl"><header><h2>${t}</h2>${sub ? `<span class="muted">${sub}</span>` : ""}<span class="esp"></span>${link ? `<a class="lk rel-ir" href="${link[1]}">${link[0]}${ico("arrow-right")}</a>` : ""}</header>${corpo}</section>`;

  M.telas.relatorios = () => {
    const per = { mes: ["Novembro de 2026", "comparado com outubro"], ant: ["Outubro de 2026", "comparado com setembro"],
      tri: ["Setembro a novembro de 2026", "comparado com junho a agosto"], ano: ["Últimos 12 meses", "comparado com os 12 anteriores"] }[relPer];
    const maxP = Math.max(...PRED_REL.map(p => p[1]));
    $("#pagina").innerHTML = `
      <header class="pg-cab"><h1>Relatórios</h1><span class="pg-sub">${per[0]} · ${per[1]}</span><span class="esp"></span>
        <div class="seg" role="group" aria-label="Período">${[["mes", "Este mês"], ["ant", "Mês passado"], ["tri", "Trimestre"], ["ano", "12 meses"]].map(([k, n]) => `<button type="button" class="${relPer === k ? "is-on" : ""}" data-rel-per="${k}">${n}</button>`).join("")}</div>
      </header>
      <div class="rel">
        <div class="rel-kpi">${KPI.map(([n, v, ant, d, menor, h, dica, un]) => `
          <a class="kpi" href="${h}" title="${esc(dica)}"><span class="kpi-n">${n}</span><b class="kpi-v">${v}</b>
            <span class="kpi-c">${delta(d, menor, un)}<span class="muted">${ant} em outubro</span></span></a>`).join("")}</div>

        <div class="rel-grade">
          ${relBloco("Atendimento e prazo", "chamados abertos por mês", `
            ${barras(REL.cham, v => String(v))}
            <div class="rel-linha"><span class="muted">Dentro do prazo</span>${REL.sla.slice(-6).map((v, i) => `<span class="rel-pp${v >= 85 ? " is-ok" : v < 78 ? " is-ri" : ""}"><small>${MESES[6 + i]}</small>${v}%</span>`).join("")}</div>
            <h3>Fora do prazo em novembro</h3>
            <table class="rel-tb"><tbody>
              <tr><td>${linkCondo(1)}</td><td class="num">3 chamados</td><td class="muted">pior: 26 h para atender, bomba parada</td></tr>
              <tr><td>${linkCondo(5)}</td><td class="num">2 chamados</td><td class="muted">pior: 19 h, aberto no fim de semana</td></tr>
              <tr><td>${linkCondo(2)}</td><td class="num">1 chamado</td><td class="muted">14 h, esperando peça</td></tr>
            </tbody></table>`, ["Ver no Atendimento", "#/atendimento"])}

          ${relBloco("Dinheiro", "faturado por mês, em R$ mil", `
            <div class="leg"><span><i class="lg-1"></i>Contratos</span><span><i class="lg-2"></i>O.S. e orçamentos</span></div>
            ${empilhado(REL.fatC, REL.fatO)}
            <dl class="rel-fatos">
              <div><dt>Contratos</dt><dd>R$ 109,0 mil <span class="muted">· 64 ativos</span></dd></div>
              <div><dt>O.S. e orçamentos</dt><dd>R$ 39,3 mil <span class="muted">· 27 notas</span></dd></div>
              <div><dt>Orçamentos</dt><dd>31 enviados, 18 aprovados <span class="muted">· R$ 52,4 mil aprovados</span></dd></div>
              <div><dt>A receber</dt><dd>R$ 61,2 mil <span class="muted">·</span> <a class="lk rel-atr" href="#/financeiro">R$ 8,7 mil atrasados em 4 prédios</a></dd></div>
            </dl>`, ["Ver no Financeiro", "#/financeiro"])}

          ${relBloco("Técnicos", "novembro até hoje", `
            <table class="rel-tb is-cab"><thead><tr><th>Técnico</th><th class="num">O.S.</th><th class="num">Em campo</th><th class="num">Retrabalho</th><th>Preventivas</th></tr></thead><tbody>
              ${TEC_REL.map(r => `<tr><td>${tecNome(r.t)}</td><td class="num">${r.os}</td><td class="num">${r.horas}</td>
                <td class="num">${r.ret >= 3 ? `<span class="selo at">${r.ret}</span>` : r.ret ? r.ret : `<span class="muted">0</span>`}</td>
                <td><span class="prev-c">${medidor(r.prevF, r.prevP)}<span>${r.prevF} de ${r.prevP}</span></span></td></tr>`).join("")}
            </tbody></table>
            <p class="rel-nota">${ico("info")}Retrabalho é o chamado que volta no mesmo equipamento em até 30 dias. Os 4 do Marcos são em 2 prédios.</p>`, ["Ver na Agenda", "#/agenda"])}

          ${relBloco("Prédios e equipamentos", "novembro", `
            <h3 class="pri">Prédios com mais chamados</h3>
            <div class="hbar">${PRED_REL.map(([c, n, fp]) => `<div class="hb-l"><span class="hb-n">${linkCondo(c)}</span><span class="hb-t"><span style="width:${100 * n / maxP}%"></span></span><span class="hb-v">${n}${fp ? `<small class="muted"> · ${fp} fora do prazo</small>` : ""}</span></div>`).join("")}</div>
            <h3>Equipamentos que mais quebram</h3>
            <table class="rel-tb"><tbody>${EQ_REL.map(([t, m, n, onde]) => `<tr><td>${t} <span class="muted">${m}</span></td><td class="num">${n >= 5 ? `<span class="selo at">${n} defeitos</span>` : `${n} defeitos`}</td><td class="muted">${onde}</td></tr>`).join("")}</tbody></table>
            <h3>Reservatórios com mais alertas</h3>
            <table class="rel-tb"><tbody>${RES_REL.map(([c, r, n, m]) => `<tr><td>${linkCondo(c)} <span class="muted">${r}</span></td><td class="num">${n} alertas</td><td class="muted">mais comum: ${m}</td></tr>`).join("")}</tbody></table>`, ["Ver no Monitoramento", "#/monitoramento"])}
        </div>
      </div>`;
    icones();
  };
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-rel-per]");
    if (!el) return;
    relPer = el.dataset.relPer; M.telas.relatorios();
    if (relPer !== "mes") toast("Na maquete os números não mudam; no sistema cada período recalcula");
  });

  // ═══ BUSCA GLOBAL: documentos reais da maquete ═════════════════════════
  const idx = M.INDICE;
  for (let i = idx.length - 1; i >= 0; i--) if (idx[i].g === "Documentos") idx.splice(i, 1);
  idx.push(...OS.map(o => ({ g: "Ordens de serviço", ic: "clipboard-check", t: `OS-0${o.id} · ${o.serv}`, s: condo(o.c).nome, h: "#/os" })),
    ...ORC.filter(o => o.n !== "—").map(o => ({ g: "Orçamentos", ic: "file-text", t: `${o.n} · ${o.desc}`, s: condo(o.c).nome, h: "#/orcamentos" })),
    ...CONTRATOS.map(c => ({ g: "Contratos", ic: "file-signature", t: `${c.n} · ${c.serv}`, s: condo(c.c).nome, h: "#/financeiro" })),
    ...EQUIP.filter(e => e.c).map(e => ({ g: "Equipamentos", ic: "package", t: `${e.cod} · ${e.tipo}`, s: condo(e.c).nome, h: "#/equipamentos" })),
    ...COLABS.map(c => ({ g: "Pessoas", ic: "user", t: c.nome, s: c.funcao, h: "#/colaboradores" })));

  // ═══ EVENTOS ══════════════════════════════════════════════════════════
  document.addEventListener("click", e => {
    const t = e.target; let el;
    if ((el = t.closest("[data-toast]"))) { e.preventDefault(); return toast(el.dataset.toast); }
    if ((el = t.closest("[data-chip]"))) { const [pg, k] = el.dataset.chip.split(":"); L[pg].f = k; return desenhaLista(pg); }
    if ((el = t.closest("[data-ord]"))) {
      const [pg, i] = el.dataset.ord.split(":"), s = L[pg], n = Number(i);
      if (s.ord !== n) { s.ord = n; s.dir = 1; } else if (s.dir === 1) s.dir = -1; else s.ord = null;
      return desenhaLista(pg);
    }
    if ((el = t.closest("[data-marca-todos]"))) {
      const pg = el.dataset.marcaTodos, d = filtrados(pg);
      if (el.checked) d.forEach(r => L[pg].marc.add(r.id)); else L[pg].marc.clear();
      return desenhaLista(pg);
    }
    if ((el = t.closest("[data-marca]"))) {
      const [pg, id] = el.dataset.marca.split(":");
      el.checked ? L[pg].marc.add(Number(id)) : L[pg].marc.delete(Number(id));
      return desenhaLista(pg);
    }
    if ((el = t.closest("[data-lote]"))) {
      const [pg, k] = el.dataset.lote.split(":");
      if (k === "limpar") { L[pg].marc.clear(); return desenhaLista(pg); }
      const n = L[pg].marc.size; L[pg].marc.clear(); desenhaLista(pg);
      return toast(`${el.textContent.trim()}: ${n} ${n === 1 ? "item" : "itens"}`);
    }
    if (t.closest("[data-exportar]")) return toast("Exporta em CSV só o que está filtrado na tela");
    if ((el = t.closest("[data-linha]")) && !t.closest("a, button, input")) {
      const [pg, id] = el.dataset.linha.split(":");
      if (pg === "cd") return M.ir(`#/condominios/${id}`);
      L[pg].sel = Number(id);
      document.querySelectorAll(`[data-linha^="${pg}:"]`).forEach(tr => tr.classList.toggle("is-sel", tr === el));
      $(`[data-div="${pg}"]`).classList.add("com-detalhe");
      return desenhaLado(pg);
    }
    if ((el = t.closest("[data-fechar-lado]"))) return $(`[data-div="${el.dataset.fecharLado}"]`).classList.remove("com-detalhe");
    if ((el = t.closest("[data-fin-modo]"))) { finModo = el.dataset.finModo; return M.telas.financeiro(); }
    if (t.closest("[data-fin-sem-nota]")) { e.preventDefault(); finModo = "contratos"; L["fin-c"] = L["fin-c"] || {}; L["fin-c"].f = "semnota"; L["fin-c"].q = ""; L["fin-c"].marc = new Set(); L["fin-c"].sel = 88; return M.telas.financeiro(); }
    if ((el = t.closest("[data-ficha-f]"))) { fichaF = el.dataset.fichaF; return paginaCondo(Number(location.hash.split("/")[2])); }
    if ((el = t.closest('[data-pop="novo-condo"]'))) return abrirPop(el, `<button type="button" data-v="Chamado">${ico("inbox")}Chamado</button><button type="button" data-v="O.S.">${ico("clipboard-check")}Ordem de serviço</button><button type="button" data-v="Orçamento">${ico("file-text")}Orçamento</button><button type="button" data-v="Contrato">${ico("file-signature")}Contrato</button>`, v => toast(`${v} novo, já com o prédio escolhido`));
    if ((el = t.closest("[data-pop-mais]"))) return abrirPop(el, `<button type="button" data-v="g">${ico("play")}Gerar chamado agora</button><button type="button" data-v="p">${ico("pause")}Pausar este mês</button><hr><button type="button" data-v="d" style="color:var(--ri-t)">${ico("circle-off")}Desativar</button>`, () => toast("Feito"));
    if ((el = t.closest("[data-ag-modo]"))) { agModo = el.dataset.agModo; if (agModo === "dia" || agModo === "mes") { agModo = "semana"; toast("Dia e Mês seguem o mesmo quadro; na maquete só a semana"); } return M.telas.agenda(); }
    if ((el = t.closest("[data-ag]"))) { agSel = Number(el.dataset.ag); document.querySelectorAll("[data-ag]").forEach(b => b.classList.toggle("is-sel", b === el)); return ladoAg(); }
    if ((el = t.closest("[data-agendar]"))) {
      const a = AGENDAR.find(x => x.id === Number(el.dataset.agendar));
      return abrirPop(el, TECNICOS.map(tc => `<button type="button" data-v="${tc.id}"><span class="av is-claro" style="width:22px;height:22px;font-size:9.5px">${tc.ini}</span>${tc.nome}<small>hoje à tarde</small></button>`).join(""), v => {
        AGENDAR.splice(AGENDAR.indexOf(a), 1);
        const nid = Date.now(); AG.push({ id: nid, t: Number(v), d: 2, h: "16:00", c: a.c, k: a.k === "ret" ? "ret" : a.k, txt: a.txt.split(" · ")[0] });
        agSel = nid; M.telas.agenda(); toast(`${a.txt.split(" · ")[0]} agendado para ${tecNome(Number(v))}, hoje às 16:00`);
      });
    }
    if ((el = t.closest("[data-cfg]"))) { e.preventDefault(); cfgSel = el.dataset.cfg; return M.telas.config(); }
  });
  document.addEventListener("input", e => {
    const pg = e.target.dataset && e.target.dataset.busca;
    if (!pg) return;
    L[pg].q = e.target.value; desenhaLista(pg);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.matches("[data-linha]")) e.target.click();
  });
})();
