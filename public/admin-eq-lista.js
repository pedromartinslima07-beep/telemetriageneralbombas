// ============================================================
// EQUIPAMENTOS no molde de lista (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A tela #/equipamentos como a maquete desenhou: visões em chip (Em uso · No
// condomínio · Na oficina · Prontos para devolver · Etiquetas em branco ·
// Baixados · Todos), busca, Exportar, ordem pela coluna, paginação, e o
// equipamento escolhido no PAINEL AO LADO: os dados, onde está, quantas vezes
// foi à oficina, a linha do tempo, os orçamentos e as O.S. — lidos do
// GET /equipamentos/codigo/:codigo (a mesma ficha que o QR abre), na primeira
// vez que ele é escolhido.
//
// ⚠️ O QUE SE FAZ COM A BOMBA (retirar, devolver, dar baixa, anotar, foto)
// CONTINUA NA FICHA DO QR (/e/<código>): é a tela da bancada e do técnico, e
// ter uma versão "de escritório" que diverge dela é o que o projeto evita
// desde o começo. O painel tem "Abrir a ficha" e leva para lá.
//
// ⚠️ NENHUMA REGRA NOVA. Dados e ações são os do admin.js: _eqDados e
// _eqCarregar (a lista, 500 de uma vez), _EQ_STATUS_LABEL / _EQ_ABAS /
// _EQ_RANK (estados e ordem de trabalho), _eqNovoLote (Gerar etiquetas). A
// impressão da folha e o "Desfazer cadastro" (admin master) continuam nos
// cartões de sempre, abaixo da lista. O cartão antigo da lista saiu do HTML
// em 20/11/2026: _eqRender no admin.js é vazio e o embrulho dele é quem
// desenha esta tela; falha de carga chega em _eqErroCarga.

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { carregando: false, ficha: new Map(), buscando: new Set() };
  const dados = () => (typeof _eqDados !== "undefined" && Array.isArray(_eqDados) ? _eqDados : []);
  const ABAS = () => (typeof _EQ_ABAS !== "undefined" ? _EQ_ABAS : {});
  const RANK = () => (typeof _EQ_RANK !== "undefined" ? _EQ_RANK : {});
  const LABEL = s => (typeof _EQ_STATUS_LABEL !== "undefined" && _EQ_STATUS_LABEL[s]) || [s, ""];
  const nome = e => (typeof _eqNome === "function" ? _eqNome(e) : e.apelido || e.tipo || "");
  const cod = c => (typeof _eqFormatarCodigo === "function" ? _eqFormatarCodigo(c) : c);
  const data = iso => (typeof _eqDataCurta === "function" ? _eqDataCurta(iso) : "");
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const em = aba => e => !ABAS()[aba] || ABAS()[aba].includes(e.status);
  const livre = e => e.status === "etiqueta_livre";
  const naBancada = e => (ABAS().bancada || []).includes(e.status) || e.status === "pronto";
  // O selo do molde com a mesma gramática do _EQ_STATUS_LABEL (b-ok, b-warn, b-neutro).
  const SELO = { "b-ok": "ok", "b-warn": "at", "b-neutro": "cz" };
  const selo = e => { const [t, c] = LABEL(e.status); return `<span class="ls-selo is-${e.status === "pronto" ? "info" : SELO[c] || "cz"}">${esc(t)}</span>`; };

  const MOV = {
    cadastro: "Cadastrada no sistema", retirada: "Retirada do condomínio", entrada_oficina: "Chegou na oficina",
    diagnostico: "Diagnóstico", orcamento_solicitado: "Orçamento solicitado", orcamento_aprovado: "Orçamento aprovado",
    em_conserto: "Entrou em conserto", aguardando_peca: "Aguardando peça", pronto: "Conserto concluído",
    devolucao: "Devolvida ao condomínio", anotacao: "Anotação", baixa: "Baixa",
  };
  const MARCOS = new Set(["retirada", "devolucao", "baixa", "cadastro"]);
  const ORC = { rascunho: ["cz", "Rascunho"], enviado: ["at", "Enviado ao cliente"], aprovado: ["ok", "Aprovado"], rejeitado: ["ri", "Recusado"] };

  const linkCondo = (e, forte) => e.condominio_id
    ? `<button type="button" class="ls-lk${forte ? " is-forte" : ""}" data-eq-condo="${e.condominio_id}" title="Abrir a página do prédio">${esc(e.condominio_nome || "—")}</button>`
    : `<span class="ls-mudo">${livre(e) ? "ainda sem vínculo" : "—"}</span>`;
  const apoio = e => [
    `<span class="ls-mono">${esc(cod(e.codigo))}</span>`,
    e.tipo && (e.apelido || e.marca || e.modelo) ? esc(e.tipo) : "",
    e.numero_serie ? `série ${esc(e.numero_serie)}` : "",
    e.lote ? `lote ${esc(e.lote)}` : "",
  ].filter(Boolean).join(" · ");

  // ===== o painel =====
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  function historico(e) {
    const f = st.ficha.get(e.codigo);
    if (!f) return `<div class="ls-esq-sec"><i></i><i></i><i></i></div>`;
    if (f.erro) return `<p class="ls-nada">Não consegui ler a ficha. <button type="button" class="ls-lk" data-eq-rebuscar="${esc(e.codigo)}">Tentar de novo</button></p>`;
    const movs = f.movimentacoes || f.movs || [];
    if (!movs.length) return `<p class="ls-nada">Nada registrado ainda.</p>`;
    const MAX = 12;
    return `<ol class="ls-tl eq-tl">${movs.slice(0, MAX).map(m => {
      const liga = [
        m.chamado_id ? `<button type="button" class="ls-lk" data-eq-chamado="${m.chamado_id}">chamado #${m.chamado_id}</button>` : "",
        m.os_id ? `<button type="button" class="ls-lk" data-eq-os="${m.os_id}">${esc(m.os_numero || "O.S. #" + m.os_id)}</button>` : "",
        m.orcamento_id ? `<button type="button" class="ls-lk" data-eq-orc="${m.orcamento_id}">orçamento</button>` : "",
      ].filter(Boolean).join(" · ");
      return `<li class="${MARCOS.has(m.tipo) ? "is-marco" : ""}"><i></i><div><b>${esc(MOV[m.tipo] || m.tipo)}</b>
        <small>${data(m.criado_em)}${m.autor ? " · " + esc(m.autor) : ""}${liga ? " · " + liga : ""}</small>
        ${m.observacao ? `<span class="eq-obs">${esc(m.observacao)}</span>` : ""}</div></li>`;
    }).join("")}</ol>${movs.length > MAX ? `<p class="ls-nada">Mais ${movs.length - MAX} na ficha.</p>` : ""}`;
  }

  function documentos(e) {
    const f = st.ficha.get(e.codigo);
    if (!f || f.erro) return "";
    const orcs = f.orcamentos || [], oss = f.ordens_servico || [];
    if (!orcs.length && !oss.length) return "";
    const moeda = v => (Number(v) ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "");
    return sec("Orçamentos e O.S. desta peça", [
      ...orcs.map(o => `<div class="ls-ligado">${ico("file-text")}<button type="button" class="ls-lk" data-eq-orc="${o.id}">${esc(o.numero || "Orçamento")}</button><span class="ls-esp"></span>${moeda(o.valor_total) ? `<span class="ls-mono">${moeda(o.valor_total)}</span>` : ""}<span class="ls-selo is-${(ORC[o.status] || ["cz"])[0]}">${esc((ORC[o.status] || [, o.status])[1])}</span></div>`),
      ...oss.map(o => `<div class="ls-ligado">${ico("clipboard-check")}<button type="button" class="ls-lk" data-eq-os="${o.id}">${esc(o.numero || "O.S. #" + o.id)}</button><span class="ls-esp"></span><span class="ls-mudo">${o.finalizada_em ? "finalizada " + data(o.finalizada_em) : "em andamento"}${o.tecnico_nome ? " · " + esc(o.tecnico_nome) : ""}</span></div>`),
    ].join(""));
  }

  function detalhe(e) {
    const f = st.ficha.get(e.codigo);
    const idas = f && !f.erro ? f.idas_oficina : null;
    const fotos = f && !f.erro ? (f.fotos || []).length : null;
    const onde = naBancada(e) ? "Oficina da General" : e.condominio_id ? linkCondo(e, true) : (livre(e) ? `<span class="ls-mudo">etiqueta ainda sem equipamento</span>` : "—");
    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico("package")}<span class="ls-mono">${esc(cod(e.codigo))}</span>${e.condominio_id ? `<span>·</span>${linkCondo(e)}` : ""}</div>
        <h2>${livre(e) ? "Etiqueta em branco" : esc(nome(e) || "Equipamento")}</h2>
        <div class="ls-l-selo">${selo(e)}${e.ultima_movimentacao_em ? `<span class="ls-mudo">desde ${data(e.ultima_movimentacao_em)}</span>` : ""}</div>
        <div class="ls-l-acoes">
          <a class="ls-bt is-pri is-p" href="/e/${encodeURIComponent(e.codigo)}" target="_blank" rel="noopener">${ico("external-link")}${livre(e) ? "Abrir a etiqueta" : "Abrir a ficha"}</a>
          ${e.condominio_id ? `<button type="button" class="ls-bt is-p is-ghost" data-eq-condo="${e.condominio_id}">${ico("building-2")}Página do prédio</button>` : ""}
        </div>
      </div>
      ${livre(e)
        ? sec("Como usar", `<p class="ls-nada">Cole a etiqueta no equipamento e escaneie o QR com o celular: a ficha abre para cadastrar a bomba e vincular ao prédio.${e.lote ? ` Esta é do lote <b>${esc(e.lote)}</b>.` : ""}</p>`)
        : sec("Dados", fatos([
            ["Código", `<span class="ls-mono">${esc(cod(e.codigo))}</span>`],
            ["Tipo", e.tipo ? esc(e.tipo[0].toUpperCase() + e.tipo.slice(1)) : `<span class="ls-mudo">—</span>`],
            (e.marca || e.modelo) ? ["Marca e modelo", esc([e.marca, e.modelo].filter(Boolean).join(" "))] : null,
            e.numero_serie ? ["Série", esc(e.numero_serie)] : null,
            e.potencia_cv ? ["Potência", `${esc(String(Number(e.potencia_cv)).replace(".", ","))} cv`] : null,
            ["Onde está", onde],
            e.condominio_id && e.vinculado_em ? ["No prédio desde", data(e.vinculado_em)] : null,
            idas != null ? ["Idas à oficina", idas ? `<b${idas >= 3 ? ' class="ls-txt-at"' : ""}>${idas}</b>${idas >= 3 ? " — vale pensar em trocar" : ""}` : "nenhuma"] : null,
            fotos != null ? ["Fotos", fotos ? pl(fotos, "foto", "fotos") : `<span class="ls-mudo">nenhuma</span>`] : null,
            naBancada(e) && e.defeito_relatado ? ["Defeito relatado", esc(e.defeito_relatado), true] : null,
          ]))}
      ${livre(e) ? "" : sec("Linha do tempo", historico(e))}
      ${documentos(e)}`;
  }

  async function buscarFicha(e, forcar) {
    if (livre(e) || st.buscando.has(e.codigo) || (st.ficha.has(e.codigo) && !forcar)) return;
    st.buscando.add(e.codigo);
    try {
      const r = await fetch(`/equipamentos/codigo/${encodeURIComponent(e.codigo)}`, { headers: authHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      st.ficha.set(e.codigo, await r.json());
    } catch (_) {
      st.ficha.set(e.codigo, { erro: true });
    } finally {
      st.buscando.delete(e.codigo);
    }
    if (String(lista.estado.sel) === String(e.id)) lista.desenharLado();
  }

  // ===== a lista =====
  // A ordem de trabalho é a de antes: o que pede ação primeiro (pronto para
  // devolver, depois a bancada), etiqueta em branco e baixado no fim.
  let _ordem = { fonte: null, lista: [] };
  const ordenados = () => {
    const f = dados();
    if (_ordem.fonte !== f || _ordem.lista.length !== f.length) {
      _ordem = { fonte: f, lista: f.map((e, i) => [e, i]).sort((a, b) => (RANK()[a[0].status] ?? 9) - (RANK()[b[0].status] ?? 9) || a[1] - b[1]).map(p => p[0]) };
    }
    return _ordem.lista;
  };

  const lista = window.GBLista.criar({
    id: "equipamentos",
    raiz: "eqLsRoot",
    titulo: "Equipamentos",
    nomePlural: "os equipamentos",
    buscaDica: "Código, nome, série, lote ou prédio",
    dados: ordenados,
    chave: e => e.id,
    texto: e => `${e.codigo} ${cod(e.codigo)} ${nome(e)} ${e.tipo || ""} ${e.marca || ""} ${e.modelo || ""} ${e.numero_serie || ""} ${e.lote || ""} ${e.condominio_nome || ""} ${LABEL(e.status)[0]}`,
    estado: () => (st.carregando && !dados().length ? "carregando" : (st.erro || (typeof _eqErroCarga !== "undefined" && _eqErroCarga)) && !dados().length ? "erro" : "pronto"),
    recarregar: () => entrar(true),
    visoes: [
      ["uso", "Em uso", e => !livre(e) && e.status !== "baixado"],
      ["instalado", "No condomínio", em("instalado"), "ok"],
      ["bancada", "Na oficina", em("bancada"), "at"],
      ["pronto", "Prontos para devolver", em("pronto"), "info", d => d.some(em("pronto"))],
      ["livre", "Etiquetas em branco", em("livre")],
      ["baixado", "Baixados", em("baixado"), null, d => d.some(em("baixado"))],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      uso: "Nenhum equipamento cadastrado ainda. Gere um lote de etiquetas e escaneie o QR na bomba.",
      instalado: "Nenhum equipamento instalado num prédio.",
      bancada: "A oficina está vazia.",
      pronto: "Nada esperando devolução.",
      livre: "Nenhuma etiqueta em branco. Use \"Gerar etiquetas\".",
      baixado: "Nenhum equipamento baixado.",
      todos: "Nenhuma etiqueta gerada ainda.",
    },
    icVazio: "package",
    frase: (d, estado) => {
      if (estado !== "pronto") return "Bombas, motores e quadros com etiqueta QR.";
      const c = aba => d.filter(em(aba)).length;
      const equip = d.length - c("livre");
      return [
        `<b>${pl(equip, "equipamento", "equipamentos")}</b>`,
        c("instalado") ? `<b>${c("instalado")}</b> no condomínio` : "",
        c("bancada") ? `<button type="button" class="ls-lk is-forte" data-ls-visao="bancada">${c("bancada")} na oficina →</button>` : "",
        c("pronto") ? `<button type="button" class="ls-lk is-forte" data-ls-visao="pronto">${pl(c("pronto"), "pronto", "prontos")} para devolver →</button>` : "",
        c("livre") ? `${pl(c("livre"), "etiqueta em branco", "etiquetas em branco")}` : "",
      ].filter(Boolean).join(" · ");
    },
    acoes: () => `<button type="button" class="ls-bt viewer-only-hide" data-eq-imprimir>${ico("printer")}Imprimir etiquetas</button>
      <button type="button" class="ls-bt is-pri viewer-only-hide" data-eq-gerar>${ico("plus")}Gerar etiquetas</button>`,
    colunas: [
      { chave: "equip", h: "Equipamento", ord: e => (livre(e) ? null : (nome(e) || "").toLowerCase()),
        td: e => `<b>${livre(e) ? `<span class="ls-mudo">Etiqueta em branco</span>` : esc(nome(e) || "Equipamento")}</b><span class="ls-sub">${apoio(e)}</span>` },
      { chave: "condo", h: "Condomínio", cls: "ls-c-om", w: "26%", ord: e => e.condominio_nome || null,
        td: e => `${linkCondo(e, true)}${e.condominio_id && e.vinculado_em ? `<span class="ls-sub">desde ${data(e.vinculado_em)}</span>` : ""}` },
      { chave: "situacao", h: "Situação", cls: "ls-c-sit", w: "250px", ord: e => RANK()[e.status] ?? 9,
        td: e => `${selo(e)}<span class="ls-sub">${naBancada(e) && e.defeito_relatado ? esc(e.defeito_relatado) : e.ultima_movimentacao_em ? "mudou em " + data(e.ultima_movimentacao_em) : "&nbsp;"}</span>` },
    ],
    classeLinha: e => (e.status === "pronto" ? "is-pede" : livre(e) ? "is-livre" : ""),
    exportar: [
      ["Código", e => cod(e.codigo)],
      ["Equipamento", e => (livre(e) ? "" : nome(e))],
      ["Tipo", e => e.tipo || ""],
      ["Marca", e => e.marca || ""],
      ["Modelo", e => e.modelo || ""],
      ["Série", e => e.numero_serie || ""],
      ["Lote", e => e.lote || ""],
      ["Condomínio", e => e.condominio_nome || ""],
      ["Situação", e => LABEL(e.status)[0]],
      ["Defeito relatado", e => e.defeito_relatado || ""],
      ["Última mudança", e => (e.ultima_movimentacao_em ? new Date(e.ultima_movimentacao_em).toLocaleDateString("pt-BR") : "")],
    ],
    detalhe,
    icLado: "package",
    ladoVazio: "Escolha um equipamento na lista.",
    aoSelecionar: e => buscarFicha(e),
    aoAbrir: id => { const e = dados().find(x => String(x.id) === String(id)); if (e) window.open(`/e/${encodeURIComponent(e.codigo)}`, "_blank", "noopener"); },
    aoClicar: ev => {
      let el;
      if ((el = ev.target.closest("[data-eq-condo]"))) { abrirFichaCondominio(Number(el.dataset.eqCondo), "equipamentos"); return true; }
      if ((el = ev.target.closest("[data-eq-chamado]"))) { _chAbrirPagina(Number(el.dataset.eqChamado)); return true; }
      if ((el = ev.target.closest("[data-eq-os]"))) { abrirOSDetalhe(Number(el.dataset.eqOs)); return true; }
      if ((el = ev.target.closest("[data-eq-orc]"))) { _cfAbrirOrcamento(Number(el.dataset.eqOrc)); return true; }
      if ((el = ev.target.closest("[data-eq-rebuscar]"))) {
        const e = dados().find(x => x.codigo === el.dataset.eqRebuscar);
        if (e) { st.ficha.delete(e.codigo); lista.desenharLado(); buscarFicha(e, true); }
        return true;
      }
      if (ev.target.closest("[data-eq-gerar]")) { if (typeof _eqNovoLote === "function") _eqNovoLote(); return true; }
      if (ev.target.closest("[data-eq-imprimir]")) {
        const c = document.getElementById("eqCardImprimir");
        if (c) { c.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("eqLotePrint")?.focus({ preventScroll: true }); }
        return true;
      }
      return false;
    },
  });

  const ativa = () => document.querySelector('.section[data-section="equipamentos"]')?.classList.contains("is-active");

  async function entrar(forcar) {
    lista.montar();
    if (!forcar && dados().length) return;
    st.carregando = true; st.erro = false;
    lista.desenhar();
    try { await _eqCarregar(); } catch (_) { st.erro = true; } finally { st.carregando = false; }
    lista.desenhar();
  }

  // ===== ganchos =====
  // A entrada: o admin.js liga os eventos e carrega (_eqBindEventos +
  // _eqCarregar); o molde monta antes, com o esqueleto.
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    if (name === "equipamentos") { st.carregando = !dados().length; }
    const r = origShow.call(this, name, ...resto);
    if (name === "equipamentos") lista.montar();
    return r;
  };
  // Quem recarrega (gerar lote, apagar lote, desfazer cadastro) redesenha por
  // _eqRender: a lista nova vai junto, e a ficha lida antes pode ter mudado.
  const origRender = window._eqRender;
  if (typeof origRender === "function") {
    window._eqRender = function (...a) {
      const r = origRender.apply(this, a);
      st.carregando = false;
      st.ficha.clear();
      if (ativa()) lista.desenhar();
      return r;
    };
  }
})();
