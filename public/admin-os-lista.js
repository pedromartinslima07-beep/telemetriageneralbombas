// ============================================================
// ORDENS DE SERVIÇO no molde de lista (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A tela #/ordens-servico como a maquete desenhou (Jobber Jobs): visões em
// chip (Pede ação · Em andamento · Falta enviar · Sem e-mail · Todas), busca,
// Exportar, seleção em lote, ordem pela coluna, paginação, e a O.S. escolhida
// no PAINEL AO LADO com a linha do tempo (Aberta → Técnico chegou →
// Finalizada → Enviada), o que o técnico registrou e o que está ligado.
// A página inteira (#/os/<id>) continua: "Abrir página" ou duplo clique.
//
// ⚠️ OS DADOS E AS AÇÕES SÃO OS DE SEMPRE, do admin.js: _osData e
// carregarOrdensServico (lista), baixarOSPdf, _osEnviarUmaPelaLista (envio de
// uma, com o modal de sempre), _osAbrirEnvioLote (lote, que lê
// _osSelecionadas), abrirOSDetalhe (página). O cartão antigo saiu do HTML
// em 20/11/2026: _osRenderTabela no admin.js é vazio, e o embrulho lá
// embaixo é quem desenha esta tela; quem grava continua chamando ele.

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { carregando: false, detalhe: new Map(), buscando: new Set(), loteEnviando: false };
  const dados = () => (typeof _osData !== "undefined" && Array.isArray(_osData) ? _osData : []);
  const carregou = () => typeof _osLoaded !== "undefined" && _osLoaded;
  const podeGravar = () => typeof _myRole === "undefined" || _myRole === "admin";
  const TIPOS = () => (typeof _OS_TIPOS_SERVICO !== "undefined" ? _OS_TIPOS_SERVICO : {});
  const RES = () => (typeof _OS_RESULTADOS !== "undefined" ? _OS_RESULTADOS : {});
  const RECEB = { gestor: "gestor", sindico: "síndico", portaria: "portaria" };

  // ===== regras (as mesmas do admin.js) =====
  const destino = o => String(o.condominio_email || "").split(",").map(s => s.trim()).filter(Boolean);
  const podeEnviar = o => !!o.finalizada_em && destino(o).length > 0;
  const faltaEnviar = o => podeEnviar(o) && !o.enviado_em;
  function sit(o) {
    if (!o.finalizada_em) return "andamento";
    if (o.enviado_em) return "enviada";
    return destino(o).length ? "enviar" : "sememail";
  }
  const SIT = {
    andamento: ["info", "Em andamento"],
    enviar: ["at", "Falta enviar ao cliente"],
    sememail: ["cz", "Prédio sem e-mail"],
    enviada: ["ok", "Enviada ao cliente"],
  };
  const ORDEM_SIT = ["andamento", "enviar", "sememail", "enviada"];

  // ===== datas =====
  const dt = (iso, hora) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === new Date().getFullYear() ? undefined : "2-digit" });
    return hora ? `${dia} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : dia;
  };
  const dias = iso => {
    const m = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((m(new Date()) - m(new Date(iso))) / 86400000);
  };
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const servico = o => {
    const t = Array.isArray(o.tipos_servico) ? o.tipos_servico : [];
    return t.map(k => TIPOS()[k] || k);
  };
  const servicoTxt = o => { const s = servico(o); return s.length ? s.join(", ") : ""; };

  function subSit(o) {
    const s = sit(o);
    if (s === "andamento") {
      if (o.chegada_em) return `técnico chegou ${dt(o.chegada_em, true)}`;
      const n = dias(o.criado_em);
      return n >= 7 ? `<span class="ls-txt-at">aberta há ${n} dias, técnico não chegou</span>` : "técnico ainda não chegou";
    }
    const r = RES()[o.servico_realizado];
    const res = r ? `${r.label} · ` : "";
    if (s === "enviada") return `${res}enviada ${dt(o.enviado_em)}`;
    return `${res}finalizada ${dt(o.finalizada_em)}`;
  }

  const linkCondo = (o, cls) => o.condominio_id
    ? `<button type="button" class="ls-lk${cls ? " " + cls : ""}" data-os-condo="${o.condominio_id}" title="Abrir a ficha do condomínio">${esc(o.condominio_nome || "—")}</button>`
    : esc(o.condominio_nome || "—");

  function acaoLinha(o) {
    if (!o.finalizada_em) return "";
    if (faltaEnviar(o) && podeGravar()) return `<button type="button" class="ls-bt is-p viewer-only-hide" data-os-enviar="${o.id}">${ico("send")}Enviar</button>`;
    return `<button type="button" class="ls-bt is-p is-ghost" data-os-pdf="${o.id}" title="Baixar o PDF">${ico("file-down")}PDF</button>`;
  }

  // ===== o painel =====
  const timeline = etapas => `<ol class="ls-tl">${etapas.map(([n, q, k]) =>
    `<li class="${k || ""}"><i></i><div><b>${n}</b>${q ? `<small>${q}</small>` : ""}</div></li>`).join("")}</ol>`;
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  function registrado(o) {
    const s = sit(o);
    if (s === "andamento") {
      return `<p class="ls-nada">O técnico ainda não finalizou: tipo de serviço, verificações, peças, fotos e assinatura chegam quando ele fechar pelo app.</p>`;
    }
    const d = st.detalhe.get(o.id);
    if (!d) {
      return st.buscando.has(o.id) || !st.detalhe.has(o.id)
        ? `<div class="ls-esq-sec"><i></i><i></i><i></i></div>`
        : "";
    }
    if (d.erro) return `<p class="ls-nada">Não consegui ler o que o técnico registrou. <button type="button" class="ls-lk" data-os-rebuscar="${o.id}">Tentar de novo</button></p>`;
    const r = RES()[d.servico_realizado];
    const pecas = Array.isArray(d.pecas) ? d.pecas : [];
    const fotos = Array.isArray(d.fotos) ? d.fotos : [];
    const receb = d.recebido_nome ? `${esc(d.recebido_nome)}${d.recebido_tipo ? ` <span class="ls-mudo">· ${RECEB[d.recebido_tipo] || esc(d.recebido_tipo)}</span>` : ""}` : `<span class="ls-mudo">não informado</span>`;
    const alerta = d.assinatura_em_branco
      ? `<div class="ls-aviso is-ri">${ico("pen-off")}<span><b>Assinatura em branco.</b> Peça uma nova na página da O.S. antes de enviar ao cliente.</span></div>` : "";
    const obs = d.observacoes ? `<p class="ls-obs">${esc(d.observacoes)}</p>` : "";
    return alerta + fatos([
      ["Resultado", r ? `<span class="ls-selo is-${r.cls === "os-result-ok" ? "ok" : r.cls === "os-result-warn" ? "at" : "ri"}">${r.label}</span>` : `<span class="ls-mudo">—</span>`],
      ["Recebido por", receb],
      ["Peças", pecas.length ? pecas.map(p => `${p.quantidade ?? 1}× ${esc(p.descricao || "—")}`).join("<br>") : `<span class="ls-mudo">nenhuma</span>`],
      ["Fotos", fotos.length ? pl(fotos.length, "foto", "fotos") : `<span class="ls-mudo">nenhuma</span>`],
      d.necessario_retorno ? ["Retorno", d.retorno_sugerido_em ? `necessário, sugerido ${dt(d.retorno_sugerido_em)}` : "necessário"] : null,
      d.orcamento_necessario ? ["Orçamento", "o técnico pediu", true] : null,
    ]) + obs;
  }

  function detalhe(o) {
    const s = sit(o);
    const [cls, nome] = SIT[s];
    const serv = servicoTxt(o);
    const acoes = [
      faltaEnviar(o) && podeGravar() ? `<button type="button" class="ls-bt is-pri is-p viewer-only-hide" data-os-enviar="${o.id}">${ico("send")}Enviar ao cliente</button>` : "",
      s === "enviada" && podeGravar() ? `<button type="button" class="ls-bt is-p viewer-only-hide" data-os-enviar="${o.id}">${ico("send")}Reenviar</button>` : "",
      o.finalizada_em ? `<button type="button" class="ls-bt is-p" data-os-pdf="${o.id}">${ico("file-down")}PDF</button>` : "",
      `<button type="button" class="ls-bt is-p is-ghost" data-os-abrir="${o.id}">${ico("external-link")}Abrir página</button>`,
    ].join("");

    const envio = o.enviado_em
      ? [["Enviada ao cliente", `${dt(o.enviado_em, true)}${o.enviado_para ? ` · ${esc(o.enviado_para)}` : ""}`, "feita"]]
      : s === "enviar" ? [["Enviada ao cliente", `a seguir · ${esc(destino(o).join(", "))}`, "atual"]]
      : s === "sememail" ? [["Enviada ao cliente", "o prédio não tem e-mail no cadastro", "erro"]]
      : [["Enviada ao cliente", "", ""]];
    const tl = timeline([
      ["Aberta", `${dt(o.criado_em, true)} · ${o.chamado_id ? "pelo chamado" : "sem chamado"}`, "feita"],
      ["Técnico chegou", o.chegada_em ? dt(o.chegada_em, true) : (s === "andamento" ? "a seguir" : "sem registro de chegada"), o.chegada_em ? "feita" : (s === "andamento" ? "atual" : "")],
      ["Finalizada", o.finalizada_em ? dt(o.finalizada_em, true) : (o.chegada_em ? "a seguir" : ""), o.finalizada_em ? "feita" : (o.chegada_em ? "atual" : "")],
      ...envio,
    ]);

    const ligados = [
      o.chamado_id ? `<div class="ls-ligado">${ico("inbox")}<button type="button" class="ls-lk" data-os-chamado="${o.chamado_id}">Chamado #${o.chamado_id}</button><span class="ls-esp"></span><span class="ls-mudo">de origem</span></div>` : "",
      o.condominio_id ? `<div class="ls-ligado">${ico("building-2")}${linkCondo(o)}<span class="ls-esp"></span><span class="ls-mudo">ficha do prédio</span></div>` : "",
    ].join("") || `<p class="ls-nada">Nada ligado a esta O.S.</p>`;

    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico("clipboard-check")}<span class="ls-mono">${esc(o.numero || "O.S.")}</span><span>·</span>${linkCondo(o)}</div>
        <h2>${esc(serv || "Ordem de serviço")}</h2>
        <div class="ls-l-selo"><span class="ls-selo is-${cls}">${nome}</span><span class="ls-mudo">${esc(o.tecnico_nome || "sem técnico")}</span></div>
        <div class="ls-l-acoes">${acoes}</div>
      </div>
      ${sec("Andamento", tl)}
      ${sec("O que o técnico registrou", registrado(o))}
      ${sec("Ligado a esta O.S.", ligados)}`;
  }

  async function buscarDetalhe(o, forcar) {
    if (sit(o) === "andamento" || st.buscando.has(o.id) || (st.detalhe.has(o.id) && !forcar)) return;
    st.buscando.add(o.id);
    try {
      const r = await fetch(`/ordens-servico/${o.id}`, { headers: authHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      st.detalhe.set(o.id, await r.json());
    } catch (_) {
      st.detalhe.set(o.id, { erro: true });
    } finally {
      st.buscando.delete(o.id);
    }
    if (String(lista.estado.sel) === String(o.id)) lista.desenharLado();
  }

  // ===== a lista =====
  const lista = window.GBLista.criar({
    id: "os",
    raiz: "osLsRoot",
    titulo: "Ordens de serviço",
    nomePlural: "as O.S.",
    buscaDica: "Número, prédio, técnico ou serviço",
    dados,
    chave: o => o.id,
    texto: o => `${o.numero || ""} ${o.condominio_nome || ""} ${o.tecnico_nome || ""} ${servicoTxt(o)}`,
    estado: () => st.carregando && !carregou() ? "carregando" : (!carregou() ? "erro" : "pronto"),
    recarregar: () => entrar(true),
    visoes: [
      ["pede", "Pede ação", o => sit(o) !== "enviada"],
      ["andamento", "Em andamento", o => sit(o) === "andamento", "info"],
      ["enviar", "Falta enviar", o => sit(o) === "enviar", "at"],
      ["sememail", "Sem e-mail", o => sit(o) === "sememail", "cz", d => d.some(o => sit(o) === "sememail")],
      ["todas", "Todas", () => true],
    ],
    vazios: {
      pede: "Nenhuma O.S. pedindo ação: tudo finalizado e enviado.",
      andamento: "Nenhuma O.S. em andamento com os técnicos.",
      enviar: "Nada esperando envio ao cliente.",
      sememail: "Todo prédio com O.S. finalizada tem e-mail.",
      todas: "Nenhuma O.S. ainda. O técnico abre a O.S. pelo app.",
    },
    frase: (d, estado) => {
      if (estado !== "pronto") return "O técnico preenche no app; o escritório confere e envia ao cliente.";
      const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
      const mes = d.filter(o => o.criado_em && new Date(o.criado_em) >= ini).length;
      const and = d.filter(o => !o.finalizada_em).length;
      return [
        `<b>${pl(d.length, "O.S.", "O.S.")}</b>`,
        `<b>${mes}</b> ${mes === 1 ? "aberta" : "abertas"} em ${MESES[ini.getMonth()]}`,
        and ? `<b>${and}</b> em andamento com os técnicos` : "",
      ].filter(Boolean).join(" · ");
    },
    acoes: (d, estado) => {
      const n = estado === "pronto" ? d.filter(faltaEnviar).length : 0;
      return n && podeGravar()
        ? `<button type="button" class="ls-bt is-pri viewer-only-hide" data-os-enviar-pendentes>${ico("send")}Enviar ${n === 1 ? "a pendente" : `as ${n} pendentes`}</button>`
        : "";
    },
    colunas: [
      { chave: "numero", h: "O.S.", w: "150px", dir: "desc", ord: o => o.criado_em ? new Date(o.criado_em).getTime() : null,
        td: o => `<b class="ls-mono">${esc(o.numero || "—")}</b><span class="ls-sub">aberta ${dt(o.criado_em)}</span>` },
      { chave: "condo", h: "Condomínio", ord: o => o.condominio_nome || null,
        td: o => `${linkCondo(o, "is-forte")}<span class="ls-sub">${esc(o.tecnico_nome || "Sem técnico")}</span>` },
      { chave: "servico", h: "Serviço", cls: "ls-c-om",
        td: o => { const s = servico(o); return s.length ? `<span class="ls-serv">${esc(s[0])}${s.length > 1 ? ` <span class="ls-mais">+${s.length - 1}</span>` : ""}</span>` : `<span class="ls-mudo">—</span>`; } },
      { chave: "situacao", h: "Situação", cls: "ls-c-sit", w: "260px", ord: o => ORDEM_SIT.indexOf(sit(o)),
        td: o => `<span class="ls-selo is-${SIT[sit(o)][0]}">${SIT[sit(o)][1]}</span><span class="ls-sub">${subSit(o)}</span>` },
      { chave: "acao", h: "", rotulo: "Ação", cls: "ls-c-om ls-num", w: "104px", td: acaoLinha },
    ],
    classeLinha: o => (sit(o) === "enviar" ? "is-pede" : ""),
    lote: sel => {
      const env = sel.filter(podeEnviar).length;
      return [
        podeGravar() ? ["enviar", env === sel.length ? "Enviar ao cliente" : `Enviar ${env} ao cliente`, "send", env] : null,
        ["pdf", "Baixar PDFs", "file-down", sel.length],
      ].filter(Boolean);
    },
    podeMarcar: o => !!o.finalizada_em,
    aoLote: async (k, sel, limpar) => {
      if (k === "enviar") {
        if (typeof _osSelecionadas === "undefined" || typeof _osAbrirEnvioLote !== "function") return;
        _osSelecionadas.clear();
        sel.filter(podeEnviar).forEach(o => _osSelecionadas.add(o.id));
        st.loteEnviando = true;
        _osAbrirEnvioLote();
        return;
      }
      if (k === "pdf") {
        // Um de cada vez: o navegador segura janelas abertas juntas, e o
        // baixarOSPdf cai no download quando a janela é barrada.
        for (const o of sel) { await baixarOSPdf(o.id); }
        limpar();
      }
    },
    exportar: [
      ["O.S.", o => o.numero],
      ["Aberta em", o => o.criado_em ? new Date(o.criado_em).toLocaleString("pt-BR") : ""],
      ["Condomínio", o => o.condominio_nome],
      ["Técnico", o => o.tecnico_nome],
      ["Serviço", servicoTxt],
      ["Situação", o => SIT[sit(o)][1]],
      ["Resultado", o => (RES()[o.servico_realizado] || {}).label || ""],
      ["Técnico chegou", o => o.chegada_em ? new Date(o.chegada_em).toLocaleString("pt-BR") : ""],
      ["Finalizada em", o => o.finalizada_em ? new Date(o.finalizada_em).toLocaleString("pt-BR") : ""],
      ["Enviada em", o => o.enviado_em ? new Date(o.enviado_em).toLocaleString("pt-BR") : ""],
      ["Enviada para", o => o.enviado_para],
      ["Chamado", o => o.chamado_id],
    ],
    detalhe,
    icLado: "clipboard-check",
    ladoVazio: "Escolha uma O.S. na lista.",
    aoSelecionar: o => buscarDetalhe(o),
    aoAbrir: id => abrirOSDetalhe(Number(id)),
    aoClicar: e => {
      let el;
      if ((el = e.target.closest("[data-os-condo]"))) { abrirFichaCondominio(Number(el.dataset.osCondo)); return true; }
      if ((el = e.target.closest("[data-os-chamado]"))) { _cfAbrirChamado(Number(el.dataset.osChamado)); return true; }
      if ((el = e.target.closest("[data-os-pdf]"))) { baixarOSPdf(Number(el.dataset.osPdf)); return true; }
      if ((el = e.target.closest("[data-os-enviar]"))) { _osEnviarUmaPelaLista(Number(el.dataset.osEnviar)); return true; }
      if ((el = e.target.closest("[data-os-abrir]"))) { abrirOSDetalhe(Number(el.dataset.osAbrir)); return true; }
      if ((el = e.target.closest("[data-os-rebuscar]"))) {
        const o = dados().find(x => x.id === Number(el.dataset.osRebuscar));
        if (o) { st.detalhe.delete(o.id); lista.desenharLado(); buscarDetalhe(o, true); }
        return true;
      }
      if (e.target.closest("[data-os-enviar-pendentes]")) {
        if (typeof _osSelecionadas === "undefined") return true;
        _osSelecionadas.clear();
        dados().filter(faltaEnviar).forEach(o => _osSelecionadas.add(o.id));
        st.loteEnviando = true;
        _osAbrirEnvioLote();
        return true;
      }
      return false;
    },
  });

  const ativa = () => document.querySelector('.section[data-section="ordens-servico"]')?.classList.contains("is-active");

  async function entrar(forcar) {
    lista.montar();
    if (carregou() && !forcar) return;
    st.carregando = true;
    lista.desenhar();
    try { await carregarOrdensServico(); } finally { st.carregando = false; }
    if (typeof _osRenderTabela === "function") _osRenderTabela(); else lista.desenhar();
  }

  // ===== ganchos =====
  // A entrada na tela: o admin.js chama renderSecaoOS (carrega e liga os
  // eventos da página da O.S.). O molde monta antes, com o esqueleto.
  const origRender = window.renderSecaoOS;
  if (typeof origRender === "function") {
    window.renderSecaoOS = async function (...a) {
      lista.montar();
      if (!carregou()) { st.carregando = true; lista.desenhar(); }
      try { return await origRender.apply(this, a); }
      finally { st.carregando = false; lista.desenhar(); }
    };
  }
  // Quem grava (envio, edição, lote) redesenha por _osRenderTabela.
  const origTabela = window._osRenderTabela;
  if (typeof origTabela === "function") {
    window._osRenderTabela = function (...a) {
      const r = origTabela.apply(this, a);
      // O lote terminou (o admin.js limpa _osSelecionadas ao concluir).
      if (st.loteEnviando && typeof _osSelecionadas !== "undefined" && !_osSelecionadas.size) {
        st.loteEnviando = false;
        lista.estado.marc.clear();
      }
      // Enviou ou editou: o que o técnico registrou pode ter mudado.
      st.detalhe.clear();
      if (ativa()) lista.desenhar();
      return r;
    };
  }
})();
