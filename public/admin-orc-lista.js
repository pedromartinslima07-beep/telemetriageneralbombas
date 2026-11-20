// ============================================================
// ORÇAMENTOS no molde de lista (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A tela #/orcamentos como a maquete desenhou (Jobber Quotes): UMA lista, do
// pedido do técnico até o aprovado. As duas abas antigas ("Orçamentos" e
// "Solicitados pelos técnicos") viraram uma: o pedido que ninguém começou é
// um ESTADO da lista ("Pedido do técnico", com "Fazer orçamento" na linha),
// e o orçamento que nasceu de um pedido aparece uma vez só, como documento,
// com o que o técnico escreveu no painel.
//
// De onde vem cada linha:
//   - documento: _avData (GET /admin/orcamentos/avulsos, que lista TODOS os
//     orçamentos, de qualquer origem);
//   - pedido sem documento: _orcData (GET /admin/orcamentos) com
//     orcamento_id nulo. O pedido que já tem documento NÃO entra de novo.
//
// ⚠️ AS AÇÕES SÃO AS DE SEMPRE, do admin.js: _avAcao("novo"),
// _orcMaterializarEAbrir (Fazer orçamento), _cfAbrirOrcamento (página),
// _avAbrirEnvioEmail, _avAbrirNota, _avDarBaixa, _orcExcluirPedido,
// _avMarcarRespostaVista. Os dois cartões antigos saíram do HTML em
// 20/11/2026: _avRenderTudo e _orcRenderTudo no admin.js são vazios, e os
// embrulhos no fim são quem desenha esta tela; quem grava continua chamando
// eles.

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = {
    avCarregando: false, orcCarregando: false, avOk: false, orcOk: false, avDesenhou: false, orcDesenhou: false,
    itens: new Map(), buscando: new Set(),
  };
  const docs = () => (typeof _avData !== "undefined" && Array.isArray(_avData) ? _avData : []);
  const pedidosOs = () => (typeof _orcData !== "undefined" && Array.isArray(_orcData) ? _orcData : []);
  const podeGravar = () => typeof _myRole === "undefined" || _myRole === "admin";

  // ===== a linha unificada =====
  // k: "d<id>" (documento) ou "p<osId>" (pedido sem documento).
  let cache = null, cacheDe = null;
  function dados() {
    const a = docs(), b = pedidosOs();
    if (cache && cacheDe && cacheDe[0] === a && cacheDe[1] === b && cacheDe[2] === a.length && cacheDe[3] === b.length) return cache;
    const linhas = [
      ...b.filter(o => !o.orcamento_id && o.id != null).map(o => ({ k: "p" + o.id, pedido: true, r: o })),
      ...a.map(o => ({ k: "d" + o.id, pedido: false, r: o })),
    ];
    cache = linhas; cacheDe = [a, b, a.length, b.length];
    return linhas;
  }
  const invalidar = () => { cache = null; };

  // ===== estado de cada linha =====
  const hojeIso = () => new Date().toISOString().slice(0, 10);
  const venceu = r => r.status === "enviado" && r.valido_ate && String(r.valido_ate).slice(0, 10) < hojeIso();
  const pendente = r => !!(r.respondido_em && !r.resposta_tratada_em);
  function sit(x) {
    if (x.pedido) return "pedido";
    const r = x.r;
    if (pendente(r)) return "resposta";
    if (r.status === "rascunho") return "rascunho";
    if (r.status === "enviado") return "enviado";
    if (r.status === "aprovado") return "aprovado";
    if (r.status === "rejeitado") return "recusado";
    return "outro";
  }
  const SIT = {
    pedido: ["at", "Pedido do técnico"],
    rascunho: ["cz", "Rascunho"],
    enviado: ["info", "Esperando o cliente"],
    resposta: ["at", "Cliente respondeu"],
    aprovado: ["ok", "Aprovado"],
    recusado: ["cz", "Recusado"],
    outro: ["cz", "—"],
  };
  const ORDEM_SIT = ["pedido", "resposta", "rascunho", "enviado", "aprovado", "recusado", "outro"];
  const rotulo = x => (sit(x) === "outro" ? (x.r.status ? x.r.status[0].toUpperCase() + x.r.status.slice(1) : "—") : SIT[sit(x)][1]);
  const pedeAcao = x => ["pedido", "rascunho", "resposta"].includes(sit(x)) || venceu(x.r) || (sit(x) === "aprovado" && x.r.nota_status === "erro");

  // ===== textos =====
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const dt = (iso, hora) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === new Date().getFullYear() ? undefined : "2-digit" });
    return hora ? `${dia} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : dia;
  };
  const dtSemFuso = iso => { if (!iso) return ""; const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}${Number(y) === new Date().getFullYear() ? "" : "/" + y.slice(2)}`; };
  const moeda = v => v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rel = iso => (typeof _tempoRelativo === "function" ? _tempoRelativo(iso) : dt(iso));
  const TIPOS = () => (typeof _avTipoLabels !== "undefined" ? _avTipoLabels : {});

  function origem(x) {
    if (x.pedido) return x.r.fonte === "bancada" ? "oficina" : "técnico";
    const o = x.r.origem;
    if (o === "ia") return "via IA";
    if (o === "os") return "técnico";
    if (o === "bancada") return "oficina";
    return "escritório";
  }
  function descricao(x) {
    const r = x.r;
    const linha1 = s => String(s || "").split(/\r?\n/).map(t => t.trim()).find(Boolean) || "";
    if (x.pedido) return linha1(r.orcamento_observacoes) || "Sem observação do técnico";
    return linha1(r.constatacao) || TIPOS()[r.tipo] || (r.os_numero ? `Orçamento da ${r.os_numero}` : "Peças e serviços");
  }
  const numero = x => (x.pedido ? (x.r.numero || `OS ${x.r.id}`) : (x.r.numero || "Sem número"));
  const quando = x => (x.pedido ? (x.r.finalizada_em || x.r.criado_em) : x.r.criado_em);
  const valor = x => (x.pedido ? null : Number(x.r.valor_total ?? 0));

  function apoio(x) {
    const r = x.r, s = sit(x);
    if (s === "pedido") return "ninguém começou ainda";
    if (s === "rascunho") return "falta enviar ao cliente";
    if (s === "enviado") return venceu(r) ? `<span class="ls-txt-ri">validade venceu em ${dtSemFuso(r.valido_ate)}</span>` : (r.valido_ate ? `válido até ${dtSemFuso(r.valido_ate)}` : (r.enviado_em ? `enviado ${dt(r.enviado_em)}` : "sem prazo de validade"));
    if (s === "resposta") return `${esc(r.respondido_nome || "o cliente")} ${r.status === "rejeitado" ? "recusou" : "aprovou"} · ${rel(r.respondido_em)} · falta dar baixa`;
    if (s === "aprovado") {
      const nota = r.nota_status === "emitida" ? `nota ${esc(r.nota_numero || "emitida")}`
        : r.nota_status === "erro" ? `<span class="ls-txt-ri">nota com erro</span>`
        : r.nota_status ? "nota processando" : "sem nota · segue para o Financeiro";
      const feito = r.executado_em ? "feito" : (r.chamado_id ? (r.chamado_status === "cancelado" ? `chamado #${r.chamado_id} cancelado` : `chamado #${r.chamado_id}`) : "");
      return [feito, nota].filter(Boolean).join(" · ");
    }
    if (s === "recusado") return r.respondido_em ? `${esc(r.respondido_nome || "o cliente")} recusou · ${dt(r.respondido_em)}` : "registrado pelo escritório";
    return "";
  }

  const linkCondo = (r, cls) => r.condominio_id
    ? `<button type="button" class="ls-lk${cls ? " " + cls : ""}" data-orc-condo="${r.condominio_id}" title="Abrir a ficha do condomínio">${esc(r.condominio_nome || "Sem condomínio")}</button>`
    : esc(r.condominio_nome || r.cliente_nome || "Sem condomínio");

  function acaoLinha(x) {
    if (!podeGravar()) return "";
    const s = sit(x), r = x.r;
    if (s === "pedido") return `<button type="button" class="ls-bt is-p viewer-only-hide" data-orc-fazer="${r.id}">${ico("file-plus")}Fazer orçamento</button>`;
    if (s === "rascunho") return `<button type="button" class="ls-bt is-p viewer-only-hide" data-orc-enviar="${r.id}">${ico("send")}Enviar</button>`;
    if (s === "resposta") return `<button type="button" class="ls-bt is-p viewer-only-hide" data-orc-baixa="${r.id}">${ico("check")}Dar baixa</button>`;
    return "";
  }

  // ===== o painel =====
  const timeline = etapas => `<ol class="ls-tl">${etapas.map(([n, q, k]) =>
    `<li class="${k || ""}"><i></i><div><b>${n}</b>${q ? `<small>${q}</small>` : ""}</div></li>`).join("")}</ol>`;
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  function andamento(x) {
    const r = x.r;
    if (x.pedido) {
      return timeline([
        ["Técnico pediu", `${dt(quando(x), true)}${r.tecnico_nome ? " · " + esc(r.tecnico_nome) : ""}`, "feita"],
        ["Orçamento criado", "a seguir", "atual"],
        ["Enviado ao cliente", "", ""],
        ["Aprovado", "", ""],
      ]);
    }
    const enviado = !!r.enviado_em || ["enviado", "aprovado", "rejeitado"].includes(r.status);
    const decidido = r.status === "aprovado" || r.status === "rejeitado";
    const etapas = [
      ["Criado", `${dt(r.criado_em, true)}${r.criado_por_nome ? " · " + esc(r.criado_por_nome) : ""}`, "feita"],
      ["Enviado ao cliente", r.enviado_em ? `${dt(r.enviado_em, true)}${r.enviado_para ? " · " + esc(r.enviado_para) : ""}` : (enviado ? "sem envio por e-mail" : "a seguir"), enviado ? "feita" : "atual"],
    ];
    if (r.status === "rejeitado") {
      etapas.push(["Recusado", r.respondido_em ? `${dt(r.respondido_em, true)} · ${esc(r.respondido_nome || "cliente")}` : "registrado pelo escritório", "erro"]);
      return timeline(etapas);
    }
    etapas.push(["Aprovado",
      decidido ? (r.respondido_em ? `${dt(r.respondido_em, true)} · ${esc(r.respondido_nome || "cliente")}` : "registrado pelo escritório")
        : (venceu(r) ? `validade venceu em ${dtSemFuso(r.valido_ate)}` : (enviado ? "esperando o cliente" : "")),
      decidido ? "feita" : (enviado ? (venceu(r) ? "erro" : "atual") : "")]);
    const feito = r.executado_em ? `${dt(r.executado_em)}${r.executado_por_nome ? " · " + esc(r.executado_por_nome) : ""}`
      : r.chamado_id ? (r.chamado_status === "cancelado" ? `chamado #${r.chamado_id} cancelado` : `chamado #${r.chamado_id}${["fechado", "resolvido"].includes(r.chamado_status) ? " fechado" : " em andamento"}`) : "";
    const feitoOk = !!r.executado_em || (r.chamado_id && ["fechado", "resolvido"].includes(r.chamado_status));
    etapas.push(["Serviço feito", feito || (r.status === "aprovado" ? "a seguir" : ""), feitoOk ? "feita" : (r.status === "aprovado" ? "atual" : "")]);
    etapas.push(["Nota fiscal",
      r.nota_status === "emitida" ? esc(r.nota_numero || "emitida") : r.nota_status === "erro" ? esc(r.nota_erro || "com erro") : r.nota_status ? "processando" : (r.status === "aprovado" ? "no Financeiro" : ""),
      r.nota_status === "emitida" ? "feita" : r.nota_status === "erro" ? "erro" : (r.nota_status ? "atual" : "")]);
    return timeline(etapas);
  }

  function itensHtml(x) {
    if (x.pedido) return "";
    const r = x.r;
    const it = st.itens.get(r.id);
    if (!it) return sec("Itens", `<div class="ls-esq-sec"><i></i><i></i><i></i></div>`);
    if (it.erro) return sec("Itens", `<p class="ls-nada">Não consegui ler os itens. <button type="button" class="ls-lk" data-orc-rebuscar="${r.id}">Tentar de novo</button></p>`);
    const linhas = it.linhas || [];
    const soma = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0), 0);
    const manual = r.valor != null && r.valor !== "";
    const corpo = linhas.length
      ? linhas.map(l => `<tr><td>${Number(l.quantidade) > 1 ? `<span class="ls-mudo">${l.quantidade}×</span> ` : ""}${esc(l.descricao || "—")}</td><td class="ls-num ls-mono">${moeda((Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0))}</td></tr>`).join("")
      : `<tr><td colspan="2" class="ls-mudo">Nenhum item ainda.</td></tr>`;
    return sec("Itens", `<table class="ls-mini"><tbody>${corpo}
      ${manual ? `<tr class="is-sub"><td>Soma dos itens</td><td class="ls-num ls-mono">${moeda(soma)}</td></tr>` : ""}
      <tr class="is-tot"><td>Total${manual ? " <span class=\"ls-mudo\">(digitado no orçamento)</span>" : ""}</td><td class="ls-num ls-mono">${moeda(r.valor_total)}</td></tr></tbody></table>`);
  }

  function detalhe(x) {
    const r = x.r, s = sit(x);
    const [cls] = SIT[s];
    const val = valor(x);
    const g = podeGravar();
    const acoes = x.pedido
      ? [
        g ? `<button type="button" class="ls-bt is-pri is-p viewer-only-hide" data-orc-fazer="${r.id}">${ico("file-plus")}Fazer orçamento</button>` : "",
        r.id ? `<button type="button" class="ls-bt is-p is-ghost" data-orc-os="${r.id}">${ico("clipboard-check")}Ver a O.S.</button>` : "",
        g ? `<button type="button" class="ls-bt is-p is-ghost is-perigo viewer-only-hide" data-orc-excluir="${r.id}">${ico("trash-2")}Excluir pedido</button>` : "",
      ]
      : [
        g && s === "rascunho" ? `<button type="button" class="ls-bt is-pri is-p viewer-only-hide" data-orc-enviar="${r.id}">${ico("send")}Enviar ao cliente</button>` : "",
        g && s === "resposta" ? `<button type="button" class="ls-bt is-pri is-p viewer-only-hide" data-orc-baixa="${r.id}">${ico("check")}Dar baixa</button>` : "",
        g && s === "aprovado" && (!r.nota_status || r.nota_status === "erro") ? `<button type="button" class="ls-bt is-pri is-p viewer-only-hide" data-orc-nota="${r.id}">${ico("receipt")}${r.nota_status === "erro" ? "Ver a nota com erro" : "Emitir nota"}</button>` : "",
        g && s === "enviado" ? `<button type="button" class="ls-bt is-p viewer-only-hide" data-orc-enviar="${r.id}">${ico("send")}Reenviar</button>` : "",
        `<button type="button" class="ls-bt is-p" data-orc-pdf="${r.id}">${ico("file-down")}PDF</button>`,
        `<button type="button" class="ls-bt is-p is-ghost" data-orc-abrir="${r.id}">${ico("external-link")}Abrir página</button>`,
      ];

    // O que o técnico escreveu: no pedido é o próprio pedido; no documento,
    // só quando a O.S. de origem marcou que precisava de orçamento.
    const obs = x.pedido ? r.orcamento_observacoes : (r.os_orcamento_necessario ? r.orcamento_observacoes : "");
    const quemPediu = x.pedido
      ? [r.tecnico_nome, r.numero, r.chamado_id ? `chamado #${r.chamado_id}` : ""]
      : [r.os_tecnico_nome, r.os_numero, r.os_chamado_id ? `chamado #${r.os_chamado_id}` : ""];
    const blocoPedido = (x.pedido || r.os_orcamento_necessario)
      ? sec(x.pedido && r.fonte === "bancada" ? "O que a oficina pediu" : "O que o técnico pediu",
        (obs ? `<blockquote class="ls-cita">${esc(obs)}</blockquote>` : `<p class="ls-nada">Sem observação. Vale falar com o técnico antes de orçar.</p>`) +
        `<p class="ls-cita-de">${quemPediu.filter(Boolean).map(esc).join(" · ")}</p>`)
      : "";

    const resposta = r.respondido_em ? sec("Resposta do cliente",
      fatos([
        ["Quem", `${esc(r.respondido_nome || "cliente")}${r.respondido_cargo ? ` <span class="ls-mudo">· ${esc(r.respondido_cargo)}</span>` : ""}`],
        ["Quando", dt(r.respondido_em, true)],
        r.cliente_comentario ? ["Comentário", esc(r.cliente_comentario), true] : null,
        r.motivo_rejeicao ? ["Motivo", esc(r.motivo_rejeicao), true] : null,
      ]) +
      (pendente(r)
        ? `<div class="ls-aviso is-at">${ico("bell-ring")}<span><b>Espera o escritório.</b> ${r.resposta_vista_em ? `Aberta ${rel(r.resposta_vista_em)}, sem baixa.` : "Ninguém tinha aberto ainda."} Dê baixa depois de falar com o cliente ou agendar o serviço.</span></div>`
        : `<p class="ls-nada">Baixa dada${r.resposta_tratada_por_nome ? ` por ${esc(r.resposta_tratada_por_nome)}` : ""} · ${dt(r.resposta_tratada_em, true)}${g ? ` · <button type="button" class="ls-lk viewer-only-hide" data-orc-reabrir="${r.id}">Reabrir</button>` : ""}</p>`)) : "";

    const os = x.pedido ? (r.id ? { id: r.id, numero: r.numero } : null) : (r.os_id ? { id: r.os_id, numero: r.os_numero } : null);
    const chamado = x.pedido ? r.chamado_id : (r.chamado_id || r.os_chamado_id);
    const ligados = [
      os ? `<div class="ls-ligado">${ico("clipboard-check")}<button type="button" class="ls-lk" data-orc-os="${os.id}">${esc(os.numero || "O.S.")}</button><span class="ls-esp"></span><span class="ls-mudo">${x.pedido ? "O.S. do pedido" : "O.S. de origem"}</span></div>` : "",
      chamado ? `<div class="ls-ligado">${ico("inbox")}<button type="button" class="ls-lk" data-orc-chamado="${chamado}">Chamado #${chamado}</button><span class="ls-esp"></span><span class="ls-mudo">${r.chamado_id && !x.pedido ? "execução" : "de origem"}</span></div>` : "",
      r.condominio_id ? `<div class="ls-ligado">${ico("building-2")}${linkCondo(r)}<span class="ls-esp"></span><span class="ls-mudo">ficha do prédio</span></div>` : "",
    ].join("") || `<p class="ls-nada">Nada ligado a este orçamento.</p>`;

    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico(x.pedido ? "file-question" : "file-text")}<span class="ls-mono">${esc(x.pedido ? "Pedido" : numero(x))}</span><span>·</span>${linkCondo(r)}</div>
        <h2>${esc(x.pedido ? (r.numero ? "Pedido de orçamento da " + r.numero : "Pedido de orçamento") : descricao(x))}</h2>
        <div class="ls-l-selo"><span class="ls-selo is-${cls}">${rotulo(x)}</span>${val != null ? `<b class="ls-mono ls-valor">${moeda(val)}</b>` : ""}<span class="ls-mudo">${esc(origem(x))}</span></div>
        <div class="ls-l-acoes">${acoes.join("")}</div>
      </div>
      ${blocoPedido}
      ${resposta}
      ${sec("Andamento", andamento(x))}
      ${itensHtml(x)}
      ${sec("Ligado a este orçamento", ligados)}`;
  }

  async function buscarItens(id, forcar) {
    if (!id || st.buscando.has(id) || (st.itens.has(id) && !forcar)) return;
    st.buscando.add(id);
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${id}/linhas`, { headers: authHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      st.itens.set(id, { linhas: await r.json() });
    } catch (_) {
      st.itens.set(id, { erro: true });
    } finally {
      st.buscando.delete(id);
    }
    const sel = lista.estado.sel;
    if (sel === "d" + id) lista.desenharLado();
  }

  // ===== ações =====
  const doc = id => docs().find(o => o.id === Number(id));
  async function abrirDoc(id) {
    if (typeof _cfAbrirOrcamento === "function") await _cfAbrirOrcamento(Number(id));
  }
  async function enviar(id) {
    await abrirDoc(id);
    if (typeof _avSelecionado !== "undefined" && _avSelecionado?.id === Number(id) && typeof _avAbrirEnvioEmail === "function") _avAbrirEnvioEmail();
  }
  async function nota(id) {
    await abrirDoc(id);
    if (typeof _avSelecionado !== "undefined" && _avSelecionado?.id === Number(id) && typeof _avAbrirNota === "function") _avAbrirNota();
  }
  async function pdf(id) {
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${id}/pdf`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || "Não foi possível gerar o PDF."); return; }
      const url = URL.createObjectURL(await r.blob());
      const o = doc(id);
      const a = Object.assign(document.createElement("a"), { href: url, download: `${(o && o.numero) || "orcamento-" + id}.pdf` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert("Erro ao gerar o PDF: " + e.message); }
  }

  // ===== a lista =====
  const lista = window.GBLista.criar({
    id: "orc",
    raiz: "orcLsRoot",
    titulo: "Orçamentos",
    nomePlural: "os orçamentos",
    buscaDica: "Número, prédio ou técnico",
    icVazio: "circle-check",
    dados,
    chave: x => x.k,
    texto: x => [numero(x), x.r.condominio_nome, x.r.condominio_razao_social, x.r.cliente_nome, x.r.tecnico_nome, x.r.os_tecnico_nome, x.r.os_numero, descricao(x), x.r.orcamento_observacoes].filter(Boolean).join(" "),
    // Carregando: ainda não chegou nada. Erro: as duas rotas terminaram e
    // nenhuma respondeu (os carregadores do admin.js engolem a falha calados).
    estado: () => {
      if (st.avOk || st.orcOk) return "pronto";
      if (st.avCarregando || st.orcCarregando || !st.tentou) return "carregando";
      return "erro";
    },
    recarregar: () => entrar(true),
    visoes: [
      ["acao", "Pede ação", pedeAcao],
      ["pedido", "Pedidos dos técnicos", x => sit(x) === "pedido", "at"],
      ["rascunho", "Rascunhos", x => sit(x) === "rascunho"],
      ["enviado", "Esperando o cliente", x => sit(x) === "enviado", "info"],
      ["respondidos", "Respondidos", x => !x.pedido && !!x.r.respondido_em],
      ["aprovado", "Aprovados", x => !x.pedido && x.r.status === "aprovado", "ok"],
      ["recusado", "Recusados", x => !x.pedido && x.r.status === "rejeitado", "cz", d => d.some(x => !x.pedido && x.r.status === "rejeitado")],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      acao: "Nada pedindo ação: nenhum pedido parado, rascunho por enviar ou resposta sem baixa.",
      pedido: "Nenhum pedido dos técnicos esperando orçamento.",
      rascunho: "Nenhum rascunho por enviar.",
      enviado: "Nenhum orçamento esperando o cliente.",
      respondidos: "Nenhum cliente respondeu pelo painel ainda.",
      aprovado: "Nenhum orçamento aprovado.",
      recusado: "Nenhum orçamento recusado.",
      todos: "Nenhum orçamento ainda. Comece pelo \"Novo orçamento\".",
    },
    frase: (d, estado) => {
      if (estado !== "pronto") return "Do pedido do técnico até o aprovado. A nota fiscal é no Financeiro.";
      const ds = d.filter(x => !x.pedido);
      const esperando = ds.filter(x => sit(x) === "enviado").length;
      const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
      const aprovMes = ds.filter(x => x.r.status === "aprovado" && new Date(x.r.respondido_em || x.r.aprovado_em || x.r.criado_em) >= ini);
      const semBaixa = ds.filter(x => pendente(x.r)).length;
      return [
        `<b>${pl(ds.length, "orçamento", "orçamentos")}</b>`,
        esperando ? `<b>${esperando}</b> esperando o cliente` : "",
        `<b>${moeda(aprovMes.reduce((s, x) => s + Number(x.r.valor_total || 0), 0))}</b> aprovados em ${MESES[ini.getMonth()]}`,
        semBaixa ? `<button type="button" class="ls-lk" data-ls-visao="respondidos">${pl(semBaixa, "resposta sem baixa", "respostas sem baixa")}</button>` : "",
      ].filter(Boolean).join(" · ");
    },
    acoes: () => podeGravar() ? `<button type="button" class="ls-bt is-pri viewer-only-hide" data-orc-novo>${ico("plus")}Novo orçamento</button>` : "",
    colunas: [
      { chave: "numero", h: "Nº", w: "160px", dir: "desc", ord: x => (quando(x) ? new Date(quando(x)).getTime() : null),
        td: x => `<b class="ls-mono">${esc(x.pedido ? "Pedido" : numero(x))}</b><span class="ls-sub">${dt(quando(x))} · ${esc(origem(x))}</span>` },
      { chave: "condo", h: "Condomínio", ord: x => x.r.condominio_nome || null,
        td: x => `${linkCondo(x.r, "is-forte")}<span class="ls-sub ls-corta" title="${esc(descricao(x))}">${esc(descricao(x))}</span>` },
      { chave: "situacao", h: "Situação", cls: "ls-c-sit", w: "300px", ord: x => ORDEM_SIT.indexOf(sit(x)),
        td: x => `<span class="ls-selo is-${SIT[sit(x)][0]}">${rotulo(x)}</span><span class="ls-sub">${apoio(x)}</span>` },
      { chave: "valor", h: "Valor", cls: "ls-c-val ls-num", w: "130px", dir: "desc", ord: x => valor(x),
        td: x => valor(x) == null ? `<span class="ls-mudo">—</span>` : `<span class="ls-mono">${moeda(valor(x))}</span>` },
      { chave: "acao", h: "", rotulo: "Ação", cls: "ls-c-om ls-num", w: "160px", td: acaoLinha },
    ],
    classeLinha: x => (["pedido", "resposta"].includes(sit(x)) ? "is-pede" : (venceu(x.r) ? "is-risco" : "")),
    podeMarcar: x => !x.pedido,
    lote: sel => [
      ["pdf", "Baixar PDFs", "file-down", sel.length],
      podeGravar() ? ["baixa", "Dar baixa nas respostas", "check", sel.filter(x => pendente(x.r)).length] : null,
    ].filter(Boolean),
    aoLote: async (k, sel, limpar) => {
      if (k === "pdf") { for (const x of sel) await pdf(x.r.id); limpar(); return; }
      if (k === "baixa") {
        const alvo = sel.filter(x => pendente(x.r));
        if (!alvo.length || !confirm(`Dar baixa em ${pl(alvo.length, "resposta", "respostas")} de cliente?\n\nFaça isto depois de falar com o cliente ou agendar o serviço.`)) return;
        for (const x of alvo) await _avDarBaixa(x.r, false);
        limpar();
      }
    },
    exportar: [
      ["Nº", x => (x.pedido ? "" : x.r.numero)],
      ["Criado em", x => (quando(x) ? new Date(quando(x)).toLocaleString("pt-BR") : "")],
      ["Condomínio", x => x.r.condominio_nome],
      ["Razão social", x => x.r.condominio_razao_social],
      ["Origem", origem],
      ["Descrição", descricao],
      ["Situação", rotulo],
      ["Valor", x => (valor(x) == null ? "" : valor(x).toFixed(2).replace(".", ","))],
      ["Enviado em", x => (x.r.enviado_em ? new Date(x.r.enviado_em).toLocaleString("pt-BR") : "")],
      ["Válido até", x => (x.r.valido_ate ? dtSemFuso(x.r.valido_ate) : "")],
      ["Respondido por", x => x.r.respondido_nome],
      ["Respondido em", x => (x.r.respondido_em ? new Date(x.r.respondido_em).toLocaleString("pt-BR") : "")],
      ["Nota fiscal", x => x.r.nota_numero || x.r.nota_status || ""],
      ["O.S.", x => (x.pedido ? x.r.numero : x.r.os_numero)],
      ["Técnico", x => x.r.tecnico_nome || x.r.os_tecnico_nome],
    ],
    detalhe,
    icLado: "file-text",
    ladoVazio: "Escolha um orçamento na lista.",
    aoSelecionar: x => {
      if (x.pedido) return;
      buscarItens(x.r.id);
      // Ver a resposta no painel É ter visto (a baixa continua sendo à parte).
      if (x.r.respondido_em && !x.r.resposta_vista_em && typeof _avMarcarRespostaVista === "function") _avMarcarRespostaVista(x.r);
    },
    aoAbrir: k => { const x = dados().find(y => y.k === k); if (!x) return; if (x.pedido) { if (podeGravar()) _orcMaterializarEAbrir(x.r.id); } else abrirDoc(x.r.id); },
    aoClicar: e => {
      let el;
      if ((el = e.target.closest("[data-orc-condo]"))) { abrirFichaCondominio(Number(el.dataset.orcCondo), "orcamentos"); return true; }
      if ((el = e.target.closest("[data-orc-fazer]"))) { _orcMaterializarEAbrir(Number(el.dataset.orcFazer)); return true; }
      if ((el = e.target.closest("[data-orc-enviar]"))) { enviar(el.dataset.orcEnviar); return true; }
      if ((el = e.target.closest("[data-orc-baixa]"))) { const o = doc(el.dataset.orcBaixa); if (o) _avDarBaixa(o, false); return true; }
      if ((el = e.target.closest("[data-orc-reabrir]"))) { const o = doc(el.dataset.orcReabrir); if (o) _avDarBaixa(o, true); return true; }
      if ((el = e.target.closest("[data-orc-nota]"))) { nota(el.dataset.orcNota); return true; }
      if ((el = e.target.closest("[data-orc-pdf]"))) { pdf(el.dataset.orcPdf); return true; }
      if ((el = e.target.closest("[data-orc-abrir]"))) { abrirDoc(el.dataset.orcAbrir); return true; }
      if ((el = e.target.closest("[data-orc-os]"))) { abrirOSDetalhe(Number(el.dataset.orcOs)); return true; }
      if ((el = e.target.closest("[data-orc-chamado]"))) { _cfAbrirChamado(Number(el.dataset.orcChamado)); return true; }
      if ((el = e.target.closest("[data-orc-excluir]"))) { _orcExcluirPedido(Number(el.dataset.orcExcluir)); return true; }
      if ((el = e.target.closest("[data-orc-rebuscar]"))) { const id = Number(el.dataset.orcRebuscar); st.itens.delete(id); lista.desenharLado(); buscarItens(id, true); return true; }
      if (e.target.closest("[data-orc-novo]")) {
        if (typeof _avBindEventos === "function") _avBindEventos();
        if (typeof _avAcao === "function") _avAcao("novo");
        return true;
      }
      return false;
    },
  });

  const ativa = () => document.querySelector('.section[data-section="orcamentos"]')?.classList.contains("is-active");
  function redesenhar() { invalidar(); if (ativa()) lista.desenhar(); }

  async function entrar(forcar) {
    lista.montar();
    if (forcar) { carregarAvulsos(); carregarOrcamentos(); }
  }

  // ===== ganchos =====
  // Carga: os dois carregadores do admin.js. "Desenhou" = a rota respondeu
  // (eles só chamam o render quando o fetch dá certo).
  for (const [nome, chave] of [["carregarAvulsos", "av"], ["carregarOrcamentos", "orc"]]) {
    const orig = window[nome];
    if (typeof orig !== "function") continue;
    window[nome] = async function (...a) {
      st[chave + "Carregando"] = true;
      st[chave + "Desenhou"] = false;
      st.tentou = true;
      if (ativa()) lista.desenhar();
      try { return await orig.apply(this, a); }
      finally {
        st[chave + "Carregando"] = false;
        st[chave + "Ok"] = st[chave + "Desenhou"] || st[chave + "Ok"];
        redesenhar();
      }
    };
  }
  // Redesenho: quem grava (baixa, envio, excluir pedido, fazer orçamento,
  // salvar na página) chama um destes dois.
  for (const [nome, chave] of [["_avRenderTudo", "av"], ["_orcRenderTudo", "orc"]]) {
    const orig = window[nome];
    if (typeof orig !== "function") continue;
    window[nome] = function (...a) {
      const r = orig.apply(this, a);
      st[chave + "Desenhou"] = true;
      st[chave + "Ok"] = true;
      // Gravou: os itens podem ter mudado.
      st.itens.clear();
      redesenhar();
      return r;
    };
  }
  // Entrada na tela: o admin.js liga os eventos do documento e chama os dois
  // carregadores; aqui só se monta a casca com o esqueleto.
  const origShow = window.showSection;
  if (typeof origShow === "function") {
    window.showSection = function (name, ...resto) {
      const r = origShow.call(this, name, ...resto);
      if (name === "orcamentos") { invalidar(); lista.montar(); }
      return r;
    };
  }
})();
