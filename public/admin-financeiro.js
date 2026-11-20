// ============================================================
// FINANCEIRO — uma tela só (redesenho estrutural, etapa 5, 19/11/2026)
// ============================================================
//
// Junta o que estava em três lugares: Notas fiscais (a nota mora no
// orçamento), o total dos contratos, e o faturamento dos contratos no Omie
// (que só a Agenda mostrava). Em cima, uma faixa com os quatro números do
// mês; embaixo, as notas fiscais.
//
// ⚠️ CONTRATOS SAIU DAQUI (20/11/2026). Era a troca "Notas fiscais |
// Contratos", que trazia para cá só o cartão dos contratos assinados: o
// bloco "Contratos no Omie" ficava para trás, e as linhas do cartão não
// abriam nada, porque os cliques do _ctrsBindEventos são escutados na seção
// Contratos e o cartão hospedado aqui já não estava dentro dela. Agora
// Contratos é item próprio da Carteira (admin-nav.js), e daqui só se vai
// para lá: o número "Contratos por mês" e os avisos de vencido levam a
// #/contratos. O endereço antigo #/financeiro/contratos também leva.
//
// ⚠️ A LISTA DE NOTAS NÃO FOI REESCRITA. O conteúdo da tela Notas (#nfRoot,
// desenhado por renderNotas em admin-carteira.js) é MOVIDO para cá — a mesma
// técnica do Atendimento. A tela antiga (#/notas) segue alcançável por
// endereço e pega o conteúdo de volta.
//
// O faturamento do Omie (GET /agenda/faturamento) é só do admin; para os
// outros perfis o cartão some. O painel do mês é o da Agenda
// (_agAbrirFaturamento).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });
  const moeda = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const st = { modo: "notas", omie: null, omieErro: false, omieBuscando: false, omieEm: 0 };
  const ehAdmin = () => typeof _myRole !== "undefined" && _myRole === "admin";
  const comp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

  // ===== blocos hospedados =====
  const origem = new WeakMap();
  function hospedar(el, destino) {
    if (!el || !destino || el.parentElement === destino) return;
    if (!origem.has(el)) origem.set(el, { pai: el.parentElement, proximo: el.nextSibling });
    destino.appendChild(el);
  }
  function devolver(el) {
    const o = el && origem.get(el);
    if (!o || el.parentElement === o.pai) return;
    if (o.proximo && o.proximo.parentElement === o.pai) o.pai.insertBefore(el, o.proximo);
    else o.pai.appendChild(el);
  }
  const blocoNotas = () => document.getElementById("nfRoot");
  // Versões anteriores hospedavam aqui o cartão dos contratos: se ele ficou
  // para trás em #finPalco, volta para a seção Contratos.
  const blocoContratos = () => document.querySelector("#finPalco > .card.al-card");

  // ===== números =====
  const contratos = () => (typeof _ctrsLista !== "undefined" && Array.isArray(_ctrsLista) ? _ctrsLista : []);
  const orcs = () => (typeof _avData !== "undefined" && Array.isArray(_avData) ? _avData : []);
  function numeros() {
    const ativos = contratos().filter(c => c.ativo);
    let receita = ativos.reduce((s, c) => s + (Number(c.valor_mensal) || 0), 0);
    let nAtivos = ativos.length, fonte = "no sistema";
    // A cobrança é a do Omie: com a cópia carregada, o total vem de lá.
    if (window.GBOmie?.carregado?.()) {
      const r = window.GBOmie.resumo();
      if (r.ativos) { receita = r.valor; nAtivos = r.ativos; fonte = "no Omie"; }
    }
    const chave = typeof _ctrsGetStatusKey === "function" ? _ctrsGetStatusKey : () => "ativo";
    const vencidos = contratos().filter(c => chave(c) === "vencido").length;
    const vencendo = contratos().filter(c => chave(c) === "vencendo").length;
    const mes = comp();
    const aprovMes = orcs().filter(o => o.status === "aprovado" && String(o.respondido_em || o.aprovado_em || "").slice(0, 7) === mes);
    const semNota = orcs().filter(o => o.status === "aprovado" && !o.nota_status).length;
    const comErro = orcs().filter(o => o.nota_status === "erro").length;
    return { ativos: nAtivos, fonte, receita, vencidos, vencendo, aprovMes, semNota, comErro };
  }

  function faixaHtml() {
    const n = numeros();
    const [ano, m] = comp().split("-").map(Number);
    const omie = !ehAdmin() ? "" : st.omie
      ? `<button type="button" class="fn-num is-link" data-fn-omie>
          <span>Faturamento de ${MESES[m - 1]} no Omie</span>
          <b>${st.omie.faturados} de ${st.omie.esperados}</b>
          <small>${st.omie.esperados - st.omie.faturados ? `${st.omie.esperados - st.omie.faturados} contrato${st.omie.esperados - st.omie.faturados === 1 ? "" : "s"} sem nota · ver` : "todos com nota · ver"}</small>
        </button>`
      : `<div class="fn-num"><span>Faturamento de ${MESES[m - 1]} no Omie</span><b>${st.omieErro ? "—" : `<i class="fn-esq"></i>`}</b><small>${st.omieErro ? "não consegui ler a cópia do Omie" : "carregando…"}</small></div>`;
    const acoes = [];
    if (n.comErro) acoes.push([`${n.comErro} nota${n.comErro === 1 ? "" : "s"} com erro`, "notas", "erro"]);
    if (n.semNota) acoes.push([`${n.semNota} aprovado${n.semNota === 1 ? "" : "s"} sem nota`, "notas", "sem"]);
    if (n.vencidos) acoes.push([`${n.vencidos} contrato${n.vencidos === 1 ? "" : "s"} vencido${n.vencidos === 1 ? "" : "s"}`, "contratos", "vencido"]);
    if (n.vencendo) acoes.push([`${n.vencendo} vencendo em 30 dias`, "contratos", "vencendo"]);
    const totalAcao = n.comErro + n.semNota + n.vencidos + n.vencendo;
    return `
      <div class="fn-faixa${ehAdmin() ? "" : " is-3"}">
        <button type="button" class="fn-num is-link" data-fn-contratos>
          <span>Contratos por mês</span><b>${moeda(n.receita)}</b>
          <small>${n.ativos} contrato${n.ativos === 1 ? "" : "s"} ativo${n.ativos === 1 ? "" : "s"} ${n.fonte} · ver contratos</small>
        </button>
        ${omie}
        <div class="fn-num"><span>Avulsos aprovados em ${MESES[m - 1]}</span><b>${moeda(n.aprovMes.reduce((s, o) => s + (Number(o.valor_total) || 0), 0))}</b><small>${n.aprovMes.length} orçamento${n.aprovMes.length === 1 ? "" : "s"}</small></div>
        <div class="fn-num${totalAcao ? " is-acao" : ""}">
          <span>Pede ação</span>
          <b>${totalAcao ? `${ico("triangle-alert")}${totalAcao}` : `${ico("circle-check")}nada`}</b>
          <small>${acoes.length ? acoes.map(([t, modo, aba]) => `<button type="button" class="fn-acao" data-fn-ir="${modo}:${aba}">${t}</button>`).join(" · ") : "tudo em dia"}</small>
        </div>
      </div>`;
  }

  // ===== tela =====
  function render() {
    const root = document.getElementById("finRoot");
    if (!root) return;
    [blocoNotas(), blocoContratos()].forEach(devolver);
    const [ano, m] = comp().split("-").map(Number);
    root.innerHTML = `
      <header class="fn-cab">
        <p class="fn-mes">${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} de ${ano}</p>
        <span class="fn-esp"></span>
        <button type="button" class="btn btn-sm" data-fn-contratos>${ico("file-signature")}Contratos</button>
      </header>
      <div id="finFaixa">${faixaHtml()}</div>
      <div class="fn-palco" id="finPalco"></div>`;
    icones(root);
    mostrarModo();
  }

  function mostrarModo() {
    const palco = document.getElementById("finPalco");
    if (!palco) return;
    devolver(blocoContratos());
    hospedar(blocoNotas(), palco);
    if (typeof renderNotas === "function") renderNotas();
    history.replaceState(null, "", "#/financeiro/notas");
  }

  function redesenharFaixa() {
    const f = document.getElementById("finFaixa");
    if (!f) return;
    f.innerHTML = faixaHtml();
    icones(f);
  }

  async function garantirDados() {
    // Contratos: a mesma carga da tela Contratos (desenha no cartão, onde ele estiver).
    const tarefas = [];
    if (typeof _ctrsBindEventos === "function") _ctrsBindEventos();
    if (typeof _ctrsCarregar === "function") tarefas.push(Promise.resolve(_ctrsCarregar()).catch(() => {}));
    // Orçamentos e O.S. (as notas moram no orçamento): a mesma carga do Hoje.
    if (typeof _icGarantirDados === "function") tarefas.push(Promise.resolve(_icGarantirDados()).catch(() => {}));
    // Omie: só o admin; a cópia no banco, guardada 1 min.
    if (ehAdmin() && !st.omieBuscando && Date.now() - st.omieEm > 60000) {
      st.omieBuscando = true;
      tarefas.push((async () => {
        try {
          const r = await fetch(`/agenda/faturamento?competencia=${comp()}`, { headers: authHeaders() });
          if (!r.ok) throw new Error(String(r.status));
          st.omie = await r.json();
          st.omieErro = false;
          st.omieEm = Date.now();
        } catch (e) { st.omieErro = true; }
        finally { st.omieBuscando = false; }
      })());
    }
    await Promise.all(tarefas);
    if (ativa()) { redesenharFaixa(); if (st.modo === "notas" && typeof renderNotas === "function") renderNotas(); }
  }

  const ativa = () => document.querySelector('.section[data-section="financeiro"]')?.classList.contains("is-active");

  // ===== eventos =====
  document.addEventListener("click", (e) => {
    if (!e.target.closest('.section[data-section="financeiro"]')) return;
    let el;
    if (e.target.closest("[data-fn-contratos]")) { irParaContratos(); return; }
    if (e.target.closest("[data-fn-omie]")) { if (typeof _agAbrirFaturamento === "function") _agAbrirFaturamento(comp()); return; }
    if ((el = e.target.closest("[data-fn-ir]"))) {
      const [modo, aba] = el.dataset.fnIr.split(":");
      if (modo === "contratos") { irParaContratos(aba); return; }
      // Vai direto ao filtro que mostra o que pede ação.
      setTimeout(() => {
        if (typeof _nfAba !== "undefined") { _nfAba = aba; renderNotas(); }
      }, 0);
    }
  });

  // Leva à tela Contratos (Carteira); com `aba`, já no filtro dos contratos
  // assinados (vencido, vencendo).
  function irParaContratos(aba) {
    history.pushState(null, "", "#/contratos");
    showSection("contratos");
    if (aba) setTimeout(() => document.querySelector(`.section[data-section="contratos"] [data-ctrs-tab="${aba}"]`)?.click(), 0);
  }

  // A cópia do Omie chegou depois da tela: o total dos contratos acompanha.
  document.addEventListener("gb:omie-contratos", () => { if (ativa()) redesenharFaixa(); });

  // ===== ganchos =====
  (function () {
    const origShow = window.showSection;
    window.showSection = function (name, ...resto) {
      const partes = location.hash.replace(/^#\/?/, "").split("/");
      const alvo = partes[0] === "financeiro" ? partes[1] : null;
      const r = origShow.call(this, name, ...resto);
      if (name === "financeiro") {
        // Endereço antigo (#/financeiro/contratos): a tela agora é Contratos.
        if (alvo === "contratos") { setTimeout(() => irParaContratos(), 0); return r; }
        render();
        garantirDados();
      } else if (name === "notas") {
        devolver(blocoNotas());
        if (typeof renderNotas === "function") renderNotas();
      } else if (name === "contratos") {
        devolver(blocoContratos());
        if (typeof _ctrsBindEventos === "function") _ctrsBindEventos();
      }
      return r;
    };
    // Gravou orçamento, nota ou contrato: a faixa acompanha.
    for (const nome of ["_avRenderTudo", "_ctrRefrescarListas", "_ctrsRender"]) {
      const orig = window[nome];
      if (typeof orig !== "function") continue;
      window[nome] = function (...a) {
        const p = orig.apply(this, a);
        Promise.resolve(p).then(() => { if (ativa()) redesenharFaixa(); });
        return p;
      };
    }
  })();
})();
