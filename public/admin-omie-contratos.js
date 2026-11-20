// ============================================================
// CONTRATOS DO OMIE no molde de lista (integração com o Omie, fase 1, 20/11/2026)
// ============================================================
//
// No topo da tela Contratos: os contratos que estão no Omie (onde a cobrança
// mora), cada um ligado ao prédio. Ver docs/modulos/omie-integracao.md.
//
// De onde vem: GET /contratos/omie (a cópia do banco, refeita pelo job do
// faturamento; nada aqui chama o Omie). O prédio é, nesta ordem: o elo feito
// à mão, o CNPJ do cliente do Omie igual ao do prédio (um prédio só), ou
// nenhum — e aí a linha diz por quê e o painel oferece "Ligar a um prédio".
// ⚠️ NUNCA SE LIGA POR NOME SOZINHO: os prédios de nome parecido aparecem como
// sugestão, e só o clique em "Ligar" grava.
//
// O que esta tela expõe para as outras (window.GBOmie):
//   - doPredio(id): os contratos do Omie de um prédio (a lista de Condomínios
//     e a página do prédio usam quando o prédio não tem contrato no sistema);
//   - abrir(codigo): a tela com o contrato escolhido no painel.

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { dados: null, sinc: null, carregando: false, erro: null, pedido: null, gravando: false };
  const gestao = () => typeof _myRole !== "undefined" && (_myRole === "admin" || _myRole === "gerente");
  const lista0 = () => st.dados || [];
  const moeda = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const dataBr = s => {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString("pt-BR");
  };
  const doc = d => {
    const x = String(d || "");
    if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    return x;
  };
  const nomeCli = k => k.cliente?.nome_fantasia || k.cliente?.razao_social || `Cliente ${k.omie_cliente ?? "?"} do Omie`;
  const condos = () => (typeof _condominios !== "undefined" && Array.isArray(_condominios) ? _condominios : []);
  const nomeCondo = c => (c.nome_fantasia || "").trim() || c.nome || "—";

  const MOTIVO = {
    "cnpj-repetido": "o CNPJ do cliente está em mais de um prédio",
    "sem-cnpj": "o cliente não tem CNPJ no Omie",
    "cnpj-sem-predio": "nenhum prédio tem o CNPJ deste cliente",
    "sem-cliente": "o cliente ainda não foi copiado do Omie",
  };
  const semPredio = k => !k.condominio_id;

  // ===== carga =====
  async function carregar() {
    if (!gestao()) return;
    if (st.pedido) return st.pedido;
    st.carregando = true; st.erro = null;
    if (ativa()) lista.desenhar();
    st.pedido = (async () => {
      try {
        const r = await fetch("/contratos/omie", { headers: authHeaders() });
        const j = await lerRespostaJson(r, "Contratos do Omie");
        if (!r.ok) throw new Error(j.error || "Erro ao listar os contratos do Omie");
        st.dados = j.contratos || [];
        st.sinc = j.sincronizacao || null;
      } catch (e) {
        st.erro = e.message;
      } finally {
        st.carregando = false; st.pedido = null;
      }
      if (ativa()) lista.desenhar();
      // A lista de Condomínios e a página do prédio leem doPredio: redesenham.
      if (typeof renderClientes === "function") renderClientes();
      // O Financeiro mostra o total mensal dos contratos ativos do Omie.
      document.dispatchEvent(new CustomEvent("gb:omie-contratos"));
    })();
    return st.pedido;
  }

  // ===== sugestões por nome (só sugestão: quem grava é o clique) =====
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const VAZIAS = new Set(["condominio", "edificio", "residencial", "cond", "ed", "res", "do", "da", "de", "dos", "das", "e", "the", "ltda", "me", "sa", "predio", "conjunto"]);
  const palavras = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !VAZIAS.has(w));
  function sugestoes(k) {
    const alvo = new Set([...palavras(k.cliente?.razao_social), ...palavras(k.cliente?.nome_fantasia)]);
    if (!alvo.size) return [];
    return condos()
      .map(c => ({ c, n: new Set([...palavras(c.nome), ...palavras(c.nome_fantasia)].filter(w => alvo.has(w))).size }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n || nomeCondo(a.c).localeCompare(nomeCondo(b.c), "pt-BR"))
      .slice(0, 3)
      .map(x => x.c);
  }

  // ===== gravar o elo =====
  async function ligar(k, condominioId) {
    if (!k.omie_cliente || !condominioId || st.gravando) return;
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/contratos/omie/clientes/${k.omie_cliente}/condominio`, {
        method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ condominio_id: Number(condominioId) }),
      });
      const j = await lerRespostaJson(r, "Ligar contrato");
      if (!r.ok) throw new Error(j.error || "Não consegui ligar o contrato ao prédio");
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }
  async function desligar(k) {
    if (!k.omie_cliente || st.gravando) return;
    if (!confirm(`Desfazer o elo feito à mão de "${nomeCli(k)}"? O contrato volta a ser ligado pelo CNPJ (ou fica sem prédio).`)) return;
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/contratos/omie/clientes/${k.omie_cliente}/condominio`, { method: "DELETE", headers: authHeaders() });
      const j = await lerRespostaJson(r, "Desfazer elo");
      if (!r.ok) throw new Error(j.error || "Não consegui desfazer o elo");
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  // ===== o painel =====
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const selo = k => !k.ativo ? `<span class="ls-selo is-cz">${esc(k.situacao_rotulo)}</span>`
    : k.vigencia_vencida ? `<span class="ls-selo is-ri">vigência vencida</span>` : `<span class="ls-selo is-ok">Ativo</span>`;

  function blocoPredio(k) {
    const g = gestao();
    if (k.condominio_id) {
      return `${fatos([
        ["Condomínio", `<button type="button" class="ls-lk is-forte" data-oc-condo="${k.condominio_id}">${esc(k.condominio_nome || "Prédio " + k.condominio_id)}</button>${k.condominio_ativo === false ? ` <span class="ls-selo is-cz">inativo</span>` : ""}`],
        ["Ligado", k.ligacao === "manual" ? `à mão${k.ligado_em ? " em " + dataBr(k.ligado_em) : ""}` : "pelo CNPJ"],
      ])}
      ${g && k.omie_cliente ? `<div class="oc-bts viewer-only-hide">
        <button type="button" class="ls-bt is-p is-ghost" data-oc-trocar>${ico("repeat")}Trocar o prédio</button>
        ${k.ligacao === "manual" ? `<button type="button" class="ls-bt is-p is-ghost" data-oc-desligar>Desfazer o elo à mão</button>` : ""}
      </div>` : ""}
      ${st.trocando === k.omie_codigo ? escolher(k) : ""}`;
    }
    return `<p class="oc-motivo">${ico("link-2-off")}<span>Sem prédio: ${esc(MOTIVO[k.ligacao] || "não foi possível ligar")}.</span></p>
      ${g && k.omie_cliente ? escolher(k) : `<p class="ls-nada">Só a gestão liga o contrato a um prédio.</p>`}`;
  }

  function escolher(k) {
    const sug = sugestoes(k);
    return `<div class="oc-ligar viewer-only-hide">
      ${sug.length ? `<p class="ls-nada">Parecidos pelo nome (confira antes):</p>
        <div class="oc-sug">${sug.map(c => `<button type="button" class="ls-bt is-p" data-oc-ligar="${c.id}" ${st.gravando ? "disabled" : ""}>${ico("link")}${esc(nomeCondo(c))}</button>`).join("")}</div>` : ""}
      <label class="oc-campo"><span>Ou escolha o prédio</span><input type="text" id="ocCondoSel" value=""></label>
      <div class="oc-bts"><button type="button" class="ls-bt is-p is-pri" data-oc-ligar-sel ${st.gravando ? "disabled" : ""}>${ico("link")}${st.gravando ? "Ligando…" : "Ligar a este prédio"}</button>
      ${st.trocando === k.omie_codigo ? `<button type="button" class="ls-bt is-p is-ghost" data-oc-cancelar-troca>Cancelar</button>` : ""}</div>
      <p class="ls-nada">Vale para todos os contratos deste cliente do Omie. Nada é gravado no Omie.</p>
    </div>`;
  }

  function detalhe(k) {
    const c = k.cliente;
    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico("file-signature")}<span>Contrato no Omie</span>${k.numero ? `<span>·</span><span class="ls-mono">${esc(k.numero)}</span>` : ""}</div>
        <h2>${esc(nomeCli(k))}</h2>
        <div class="ls-l-selo">${selo(k)}<span class="ls-mudo">${moeda(k.valor_mensal)} por mês</span></div>
      </div>
      ${sec("Prédio", blocoPredio(k))}
      ${sec("Cobrança", fatos([
        ["Valor por mês", `<span class="ls-mono">${moeda(k.valor_mensal)}</span>`],
        ["Fatura no dia", k.dia_faturamento ? String(k.dia_faturamento) : "—"],
        ["Vigência", `${dataBr(k.vigencia_inicio) || "—"} → ${k.vigencia_fim ? dataBr(k.vigencia_fim) : "sem fim"}${k.vigencia_vencida ? `<span class="ls-sub ls-txt-ri">venceu e o contrato segue ativo no Omie: renovado sem registro, ou acabou?</span>` : ""}`, true],
        ["Situação no Omie", `${esc(k.situacao_rotulo)} <span class="ls-mudo">(código ${esc(k.situacao || "?")})</span>`],
      ]))}
      ${sec("Última nota", k.ultima_nota ? fatos([
        ["Nota", `<span class="ls-mono">${esc(k.ultima_nota.numero || "—")}</span>`],
        ["Competência", esc(k.ultima_nota.competencia || "—")],
        ["Emitida em", dataBr(k.ultima_nota.emitida_em) || "—"],
        ["Valor", moeda(k.ultima_nota.valor)],
      ]) : `<p class="ls-nada">Nenhuma nota deste contrato no mês atual nem no anterior.</p>`)}
      ${sec("Cliente no Omie", c ? fatos([
        ["Razão social", esc(c.razao_social || "—"), true],
        c.nome_fantasia ? ["Nome fantasia", esc(c.nome_fantasia), true] : null,
        ["CNPJ/CPF", c.documento ? `<span class="ls-mono">${esc(doc(c.documento))}</span>` : `<span class="ls-txt-at">sem documento no Omie</span>`],
        ["E-mail", c.email ? esc(c.email) : `<span class="ls-mudo">—</span>`],
        c.cidade ? ["Cidade", esc(c.cidade)] : null,
      ]) : `<p class="ls-nada">O cliente deste contrato ainda não foi copiado do Omie (a cópia dos clientes roda com o faturamento, de hora em hora).</p>`)}`;
  }

  // ===== a lista =====
  const ordem = () => [...lista0()].sort((a, b) => (b.ativo - a.ativo) || (semPredio(b) - semPredio(a)) || String(nomeCli(a)).localeCompare(nomeCli(b), "pt-BR"));
  const lista = window.GBLista.criar({
    id: "omie-contratos",
    raiz: "ocLsRoot",
    titulo: "Contratos no Omie",
    nomePlural: "os contratos do Omie",
    buscaDica: "Cliente, prédio, CNPJ ou número",
    dados: ordem,
    chave: k => k.omie_codigo,
    texto: k => `${nomeCli(k)} ${k.cliente?.razao_social || ""} ${k.condominio_nome || ""} ${k.numero || ""} ${k.cliente?.documento || ""} ${doc(k.cliente?.documento)}`,
    estado: () => (st.erro && !st.dados ? "erro" : !st.dados ? "carregando" : "pronto"),
    recarregar: () => carregar(),
    visoes: [
      ["ativos", "Ativos", k => k.ativo],
      ["sempredio", "Sem prédio", k => k.ativo && semPredio(k), "at", d => d.some(k => k.ativo && semPredio(k))],
      ["vencida", "Vigência vencida", k => k.vigencia_vencida, "ri", d => d.some(k => k.vigencia_vencida)],
      ["parados", "Suspensos e em elaboração", k => k.situacao === "90" || k.situacao === "00", null, d => d.some(k => k.situacao === "90" || k.situacao === "00")],
      ["encerrados", "Encerrados", k => k.situacao === "99", null, d => d.some(k => k.situacao === "99")],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      ativos: "Nenhum contrato ativo no Omie.",
      sempredio: "Todo contrato ativo está ligado a um prédio.",
      vencida: "Nenhum contrato ativo com a vigência vencida.",
      parados: "Nenhum contrato suspenso ou em elaboração.",
      encerrados: "Nenhum contrato encerrado.",
      todos: "Nenhum contrato copiado do Omie ainda. A cópia roda com o faturamento, de hora em hora.",
    },
    icVazio: "file-signature",
    frase: (d, estado) => {
      if (estado !== "pronto") return "Os contratos que estão no Omie, ligados aos prédios.";
      const at = d.filter(k => k.ativo);
      const soma = at.reduce((s, k) => s + Number(k.valor_mensal || 0), 0);
      const sp = at.filter(semPredio).length, venc = at.filter(k => k.vigencia_vencida).length;
      const quando = st.sinc?.ultima_em ? ` <span class="ls-mudo">· copiado do Omie ${typeof _tempoRelativo === "function" ? _tempoRelativo(st.sinc.ultima_em) : dataBr(st.sinc.ultima_em)}</span>` : "";
      return [
        `<b>${pl(at.length, "contrato ativo", "contratos ativos")}</b>`,
        `<b>${moeda(soma)}</b> por mês`,
        sp ? `<button type="button" class="ls-lk is-forte" data-ls-visao="sempredio">${pl(sp, "sem prédio", "sem prédio")} →</button>` : "todos ligados a um prédio",
        venc ? `<button type="button" class="ls-lk is-forte ls-txt-ri" data-ls-visao="vencida">${pl(venc, "com vigência vencida", "com vigência vencida")} →</button>` : "",
      ].filter(Boolean).join(" · ") + quando;
    },
    acoes: () => (typeof _myRole !== "undefined" && _myRole === "admin")
      ? `<button type="button" class="ls-bt viewer-only-hide" data-oc-atualizar>${ico("refresh-cw")}Atualizar do Omie</button>` : "",
    colunas: [
      { chave: "cliente", h: "Contrato", ord: k => nomeCli(k).toLowerCase(),
        td: k => `<b>${esc(nomeCli(k))}</b><span class="ls-sub">${esc([k.numero, k.cliente?.documento ? doc(k.cliente.documento) : ""].filter(Boolean).join(" · "))}</span>` },
      { chave: "predio", h: "Prédio", cls: "ls-c-om", w: "26%", ord: k => k.condominio_nome || null,
        td: k => k.condominio_id
          ? `${esc(k.condominio_nome || "—")}<span class="ls-sub">${k.ligacao === "manual" ? "ligado à mão" : "pelo CNPJ"}</span>`
          : `<span class="ls-selo is-at">sem prédio</span><span class="ls-sub">${esc(MOTIVO[k.ligacao] || "")}</span>` },
      { chave: "valor", h: "Por mês", cls: "ls-num", w: "130px", dir: "desc", ord: k => Number(k.valor_mensal || 0),
        td: k => `<span class="ls-mono">${moeda(k.valor_mensal)}</span><span class="ls-sub">dia ${k.dia_faturamento || "—"}</span>` },
      { chave: "vigencia", h: "Situação", cls: "ls-c-sit", w: "210px", ord: k => (k.vigencia_fim ? String(k.vigencia_fim).slice(0, 10) : "9999"),
        td: k => `${selo(k)}<span class="ls-sub">${k.vigencia_fim ? "até " + dataBr(k.vigencia_fim) : "sem fim"}</span>` },
      { chave: "nota", h: "Última nota", cls: "ls-c-om", w: "150px", ord: k => k.ultima_nota?.competencia || null,
        td: k => k.ultima_nota ? `<span class="ls-mono">${esc(k.ultima_nota.numero || "—")}</span><span class="ls-sub">${esc(k.ultima_nota.competencia || "")}</span>` : `<span class="ls-mudo">—</span>` },
    ],
    classeLinha: k => (k.vigencia_vencida ? "is-risco" : !k.ativo ? "is-inativo" : k.ativo && semPredio(k) ? "is-pede" : ""),
    exportar: [
      ["Número", k => k.numero || ""],
      ["Cliente", nomeCli],
      ["Razão social", k => k.cliente?.razao_social || ""],
      ["CNPJ/CPF", k => doc(k.cliente?.documento)],
      ["Prédio", k => k.condominio_nome || ""],
      ["Ligado", k => (k.ligacao === "manual" ? "à mão" : k.ligacao === "cnpj" ? "pelo CNPJ" : MOTIVO[k.ligacao] || "")],
      ["Situação", k => k.situacao_rotulo],
      ["Por mês", k => k.valor_mensal ?? ""],
      ["Dia de faturamento", k => k.dia_faturamento ?? ""],
      ["Vigência até", k => dataBr(k.vigencia_fim)],
      ["Vigência vencida", k => (k.vigencia_vencida ? "sim" : "")],
      ["Última nota", k => k.ultima_nota?.numero || ""],
      ["Competência", k => k.ultima_nota?.competencia || ""],
    ],
    detalhe,
    icLado: "file-signature",
    ladoVazio: "Escolha um contrato na lista.",
    aoSelecionar: () => {
      if (document.getElementById("ocCondoSel") && window.CondoPicker) {
        window.CondoPicker.montar({ campo: "ocCondoSel", itens: condos(), permiteVazio: false, placeholder: "Buscar o prédio por nome, bairro ou cidade…" });
      }
    },
    aoClicar: e => {
      let el;
      const sel = () => lista0().find(x => String(x.omie_codigo) === String(lista.estado.sel));
      if ((el = e.target.closest("[data-oc-condo]"))) { abrirFichaCondominio(Number(el.dataset.ocCondo), "contrato"); return true; }
      if ((el = e.target.closest("[data-oc-ligar]"))) { const k = sel(); if (k && confirm(`Ligar "${nomeCli(k)}" a "${el.textContent.trim()}"?`)) { st.trocando = null; ligar(k, el.dataset.ocLigar); } return true; }
      if (e.target.closest("[data-oc-ligar-sel]")) {
        const k = sel(); const id = Number(document.getElementById("ocCondoSel")?.value);
        if (!id) { alert("Escolha o prédio na busca."); return true; }
        st.trocando = null; ligar(k, id); return true;
      }
      if (e.target.closest("[data-oc-trocar]")) { st.trocando = lista.estado.sel; lista.desenharLado(); return true; }
      if (e.target.closest("[data-oc-cancelar-troca]")) { st.trocando = null; lista.desenharLado(); return true; }
      if (e.target.closest("[data-oc-desligar]")) { const k = sel(); if (k) desligar(k); return true; }
      if ((el = e.target.closest("[data-oc-atualizar]"))) {
        el.disabled = true;
        fetch("/agenda/faturamento/atualizar", { method: "POST", headers: authHeaders() })
          .then(r => lerRespostaJson(r, "Atualizar do Omie").then(j => { if (!r.ok) throw new Error(j.error || "Não consegui atualizar do Omie"); if (j.pulado) alert("Já foi atualizado há menos de 2 minutos."); }))
          .catch(err => alert(err.message))
          .finally(() => { el.disabled = false; carregar(); });
        return true;
      }
      return false;
    },
  });

  const ativa = () => document.querySelector('.section[data-section="contratos"]')?.classList.contains("is-active");

  // ===== as duas abas da tela (No Omie | Assinados no sistema) =====
  // Uma de cada vez. A escolha fica no navegador de quem olha (conveniência);
  // quem chega por um atalho (Financeiro, página do prédio) cai na aba certa.
  const ABA_CHAVE = "contratos:aba";
  let abaAtual = (() => { try { return localStorage.getItem(ABA_CHAVE) === "sistema" ? "sistema" : "omie"; } catch (e) { return "omie"; } })();
  function contarAbas() {
    const elO = document.getElementById("ctAbaOmie");
    const elS = document.getElementById("ctAbaSistema");
    if (elO) elO.textContent = st.dados ? String(lista0().filter(k => k.ativo).length) : "…";
    if (elS) elS.textContent = typeof _ctrsLista !== "undefined" && Array.isArray(_ctrsLista) ? String(_ctrsLista.filter(c => c.ativo).length) : "…";
  }
  function mostrarAba(aba) {
    if (aba === "omie" || aba === "sistema") {
      abaAtual = aba;
      try { localStorage.setItem(ABA_CHAVE, aba); } catch (e) {}
    }
    const raiz = document.getElementById("ocLsRoot");
    const cartao = document.querySelector('.section[data-section="contratos"] .ctrs-sistema');
    if (raiz) raiz.style.display = abaAtual === "omie" ? "" : "none";
    if (cartao) cartao.style.display = abaAtual === "sistema" ? "" : "none";
    document.querySelectorAll("[data-ct-aba]").forEach(b => {
      const on = b.dataset.ctAba === abaAtual;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", String(on));
    });
    contarAbas();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-ct-aba]");
    if (b) mostrarAba(b.dataset.ctAba);
  });
  document.addEventListener("gb:omie-contratos", contarAbas);
  if (typeof window._ctrsRender === "function") {
    const origRender = window._ctrsRender;
    window._ctrsRender = function (...a) { const r = origRender.apply(this, a); contarAbas(); return r; };
  }
  window.GBContratosAba = { mostrar: mostrarAba };

  window.GBOmie = {
    carregado: () => !!st.dados,
    // Os ativos: quantos e quanto por mês (a faixa do Financeiro).
    resumo: () => {
      const a = lista0().filter(k => k.ativo);
      return { ativos: a.length, valor: a.reduce((t, k) => t + (Number(k.valor_mensal) || 0), 0), semPredio: a.filter(semPredio).length };
    },
    // Os contratos do Omie de um prédio, o ativo primeiro.
    doPredio: id => lista0().filter(k => Number(k.condominio_id) === Number(id)).sort((a, b) => b.ativo - a.ativo),
    abrir(codigo) {
      showSection("contratos");
      mostrarAba("omie");
      lista.montar();
      Promise.resolve(st.dados ? null : carregar()).then(() => lista.selecionar(Number(codigo)));
    },
  };

  // ===== ganchos =====
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    const r = origShow.call(this, name, ...resto);
    if (name === "contratos" && gestao()) { mostrarAba(); lista.montar(); carregar(); }
    return r;
  };
  // A lista de Condomínios e a página do prédio precisam dos contratos do Omie
  // desde o começo (coluna Contrato, "Sem contrato"): carrega logo após o boot.
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => { if (gestao()) carregar(); }, 800));
})();
