// ============================================================
// ATENDIMENTO — chamados e WhatsApp numa caixa de entrada
// (redesenho estrutural, etapa 3, 19/11/2026)
// ============================================================
//
// Uma tela no molde de Zendesk/Freshdesk: a fila à esquerda (chamados e
// conversas do WhatsApp juntos, com visões em chip e busca), e o item escolhido
// à direita.
//
// ⚠️ O PAINEL DO CHAMADO E O CHAT DO WHATSAPP NÃO FORAM REESCRITOS. Os blocos
// que já existem são MOVIDOS para esta tela (a mesma técnica da página da O.S.
// e do orçamento):
//   - `#chDetailCol`, desenhado por `renderChDetalhe` (admin.js). Todas as
//     ações dele (resolver, cancelar, reabrir, trocar técnico/prédio,
//     histórico, avaliação) são delegadas no `body` e continuam valendo;
//     toda gravação redesenha por carregarTudo → renderChamados →
//     renderChDetalhe, que acha o painel aqui.
//   - `.wa-chat-col` e `#waInfoCol`, desenhados por `_waSelecionar`. As ações
//     escutam nos próprios elementos (`waChatHead`, `waInfoCol`, `waBtnEnviar`),
//     então vão junto.
// Quando alguém abre as telas antigas (`#/chamados`, `#/whatsapp`, que seguem
// alcançáveis por link e endereço), os blocos voltam para o lugar de origem.
//
// O WhatsApp é o CANAL do chamado: o chamado aberto por WhatsApp traz
// `cliente_telefone`; quando há conversa com o mesmo telefone, o chamado
// ganha a aba "Conversa no WhatsApp". As conversas têm fila própria, na troca
// "Chamados | Conversas" do topo (não se misturam: ver VISOES_CH).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const soDig = s => String(s || "").replace(/\D/g, "").slice(-11);

  const st = {
    modo: "chamados",   // chamados | conversas (decisão do Pedro, 19/11: não misturar)
    visao: "abertos",   // visão de chamados
    visaoWa: "semresp", // visão de conversas
    busca: "",
    sel: null,          // { tipo: "ch" | "wa", id }
    aba: "chamado",     // chamado | conversa (quando o chamado tem conversa)
    aberto: false,      // celular: o item cobre a fila
    carregou: false,
  };

  // ===== DADOS =====
  const chamados = () => (typeof _chamadosData !== "undefined" && Array.isArray(_chamadosData) ? _chamadosData : []);
  const conversas = () => (typeof _conversasData !== "undefined" && Array.isArray(_conversasData) ? _conversasData : []);
  const aberto = ch => typeof _chEmAberto === "function" ? _chEmAberto(ch.status) : !["fechado", "cancelado"].includes(ch.status);
  const preventiva = ch => ch.plano_manutencao_id != null;
  const foraPrazo = ch => aberto(ch) && typeof _chamadoSlaEstourado === "function" && _chamadoSlaEstourado(ch);
  const waLigada = () => {
    const it = document.querySelector('.nav-antiga .nav-item[data-section="whatsapp"]');
    return !!it && it.style.display !== "none";
  };
  function conversaDoChamado(ch) {
    if (!ch?.cliente_telefone) return null;
    const t = soDig(ch.cliente_telefone);
    return conversas().find(cv => soDig(cv.telefone) === t) || null;
  }
  function chamadoDaConversa(cv) {
    const t = soDig(cv.telefone);
    if (!t) return null;
    return chamados().filter(ch => aberto(ch) && soDig(ch.cliente_telefone) === t)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0] || null;
  }
  const waClasse = cv => (typeof _waClassificar === "function" ? _waClassificar(cv) : (cv.status === "fechada" ? "resolv" : "naoresp"));

  // ⚠️ CHAMADOS E CONVERSAS NÃO SE MISTURAM NA FILA (decisão do Pedro,
  // 19/11/2026). A IA atende a maior parte das conversas sozinha e abre o
  // chamado quando é problema de verdade; misturadas, elas enchiam a fila e
  // escondiam o P1. Uma troca "Chamados | Conversas" no topo separa as duas
  // filas, cada uma com as suas visões. A ligação entre elas aparece DENTRO do
  // chamado (aba "Conversa no WhatsApp"), não na fila.
  const VISOES_CH = [
    ["abertos", "Em aberto", ch => aberto(ch) && !preventiva(ch)],
    ["semtec", "Sem técnico", ch => aberto(ch) && !ch.tecnico_id && !preventiva(ch), "at"],
    ["prazo", "Fora do prazo", foraPrazo, "ri"],
    ["p1", "Críticos (P1)", ch => aberto(ch) && String(ch.prioridade).toLowerCase() === "p1", "ri"],
    ["preventivas", "Preventivas", ch => aberto(ch) && preventiva(ch)],
    ["resolvidos", "Resolvidos", ch => ch.status === "fechado"],
    ["cancelados", "Cancelados", ch => ch.status === "cancelado"],
    ["todos", "Todos", () => true],
  ];
  // Conversa "com a IA": aberta, ninguém assumiu e a última palavra foi da IA.
  const VISOES_WA = [
    ["semresp", "Sem resposta", cv => waClasse(cv) === "naoresp", "at"],
    ["ia", "Com a IA", cv => cv.status !== "fechada" && !cv.assumida_por_id && waClasse(cv) !== "naoresp"],
    ["assumidas", "Assumidas por alguém", cv => cv.status !== "fechada" && !!cv.assumida_por_id],
    ["encerradas", "Encerradas", cv => waClasse(cv) === "resolv"],
    ["todas", "Todas", () => true],
  ];
  const modoWa = () => st.modo === "conversas" && waLigada();
  const visoesAtivas = () => (modoWa() ? VISOES_WA : VISOES_CH);
  const visaoAtual = () => (modoWa() ? st.visaoWa : st.visao);

  function itensDa(visao) {
    if (modoWa()) {
      const v = VISOES_WA.find(x => x[0] === visao) || VISOES_WA[0];
      return conversas().filter(v[2]).map(cv => ({ tipo: "wa", id: cv.id, cv }));
    }
    const v = VISOES_CH.find(x => x[0] === visao) || VISOES_CH[0];
    return chamados().filter(v[2]).map(ch => ({ tipo: "ch", id: ch.id, ch }));
  }
  const semRespostaN = () => (waLigada() ? conversas().filter(cv => waClasse(cv) === "naoresp").length : 0);

  function filtrados() {
    const q = norm(st.busca.trim());
    const itens = itensDa(visaoAtual()).filter(it => {
      if (!q) return true;
      if (it.tipo === "ch") {
        const ch = it.ch;
        return norm(`#${ch.id} ch-${String(ch.id).padStart(4, "0")} ${ch.titulo} ${ch.condominio_nome} ${ch.tecnico_nome} ${ch.cliente_nome} ${ch.descricao || ""}`).includes(q);
      }
      const cv = it.cv;
      return norm(`${cv.cliente_nome} ${cv.telefone} ${cv.condominio_nome} ${cv.ultima_mensagem}`).includes(q);
    });
    const fechadas = ["resolvidos", "cancelados", "encerradas"].includes(visaoAtual());
    const prio = it => it.tipo === "ch" ? ({ p1: 0, p2: 1, p3: 2, p4: 3 }[String(it.ch.prioridade).toLowerCase()] ?? 4) : (it.cv.unread_count ? 1 : 3);
    const quando = it => new Date(it.tipo === "ch" ? (fechadas ? (it.ch.fechado_em || it.ch.cancelado_em) : it.ch.criado_em) : (it.cv.ultima_mensagem_em || it.cv.atualizado_em || it.cv.criado_em) || 0).getTime();
    return itens.sort((a, b) => {
      if (fechadas) return quando(b) - quando(a);
      const fa = a.tipo === "ch" && foraPrazo(a.ch) ? 0 : 1, fb = b.tipo === "ch" && foraPrazo(b.ch) ? 0 : 1;
      return fa - fb || prio(a) - prio(b) || quando(a) - quando(b); // o que espera há mais tempo primeiro
    });
  }

  function rel(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "agora";
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400);
    if (d <= 30) return `${d} dia${d === 1 ? "" : "s"}`;
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  const iniciais = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  function canal(ch) {
    if (ch.cliente_telefone) return ["wa", "message-circle", "WhatsApp"];
    if (preventiva(ch)) return ["prev", "repeat", "Preventiva"];
    if (/^\[auto\]/i.test(ch.titulo || "") || ch.categoria === "nivel_baixo") return ["sensor", "radio-tower", "Alerta da telemetria"];
    return ["", "inbox", "Aberto pelo escritório"];
  }

  // ===== TELA =====
  function render() {
    const root = document.getElementById("atRoot");
    if (!root) return;
    // ⚠️ Antes de trocar o innerHTML: os blocos hospedados (painel do chamado,
    // chat do WhatsApp) morariam dentro dele e seriam APAGADOS do documento.
    [blocoCh(), blocoWaChat(), blocoWaInfo()].forEach(devolver);
    root.innerHTML = `
      <header class="at-cab">
        <div class="at-modo" id="atModo" role="group" aria-label="O que ver"></div>
        <p class="at-frase" id="atFrase"></p>
        <span class="at-esp"></span>
        <button type="button" class="at-bt is-pri viewer-only-hide" data-at-novo>${ico("plus")}Novo chamado</button>
      </header>
      <div class="at-caixa${st.aberto ? " com-item" : ""}" id="atCaixa">
        <aside class="at-fila" aria-label="Fila de atendimento">
          <div class="at-fila-topo">
            <label class="at-busca">${ico("search")}<input type="search" id="atBusca" placeholder="Prédio, assunto, nº ou telefone" value="${esc(st.busca)}"></label>
            <div class="at-chips" id="atChips" role="group" aria-label="Visões"></div>
          </div>
          <div class="at-itens" id="atItens" role="listbox" aria-label="Chamados e conversas"></div>
        </aside>
        <section class="at-centro" id="atCentro" aria-label="Item escolhido">
          <div class="at-voltar-bar"><button type="button" class="at-voltar" data-at-voltar>${ico("arrow-left")}Fila</button></div>
          <div class="at-abas" id="atAbas" hidden></div>
          <div class="at-palco" id="atPalco"></div>
        </section>
      </div>`;
    icones(root);
    desenharFila();
    desenharCentro();
  }

  function desenharFila() {
    const chipsEl = document.getElementById("atChips");
    const itensEl = document.getElementById("atItens");
    if (!chipsEl || !itensEl) return;
    if (!waLigada()) st.modo = "chamados";
    const vAtual = visaoAtual();

    // A troca só existe com o WhatsApp ligado; o contador é só o que espera
    // uma pessoa (conversa sem resposta), não toda conversa.
    const modoEl = document.getElementById("atModo");
    if (modoEl) {
      const nWa = semRespostaN();
      const abertosN = chamados().filter(ch => aberto(ch) && !preventiva(ch)).length;
      modoEl.hidden = !waLigada();
      modoEl.innerHTML = waLigada() ? `
        <button type="button" data-at-modo="chamados" class="${st.modo === "chamados" ? "is-on" : ""}" aria-pressed="${st.modo === "chamados"}">${ico("inbox")}Chamados<span>${abertosN}</span></button>
        <button type="button" data-at-modo="conversas" class="${st.modo === "conversas" ? "is-on" : ""}" aria-pressed="${st.modo === "conversas"}">${ico("message-circle")}Conversas${nWa ? `<span class="is-alerta">${nWa}</span>` : ""}</button>` : "";
      if (waLigada()) icones(modoEl);
    }

    chipsEl.innerHTML = visoesAtivas().map(([k, n, , pt]) => {
      const c = itensDa(k).length;
      if (!c && k !== vAtual && ["prazo", "p1", "semtec", "cancelados", "assumidas"].includes(k)) return "";
      return `<button type="button" class="at-chip${vAtual === k ? " is-on" : ""}" data-at-visao="${k}" aria-pressed="${vAtual === k}">${pt && c ? `<i class="at-pt is-${pt}"></i>` : ""}${n}<span>${c}</span></button>`;
    }).join("");

    const frase = document.getElementById("atFrase");
    if (frase) {
      if (modoWa()) {
        const abertas = conversas().filter(cv => cv.status !== "fechada");
        const nao = semRespostaN();
        const ia = abertas.filter(cv => !cv.assumida_por_id && waClasse(cv) !== "naoresp").length;
        frase.innerHTML = `<b>${abertas.length}</b> conversa${abertas.length === 1 ? "" : "s"} aberta${abertas.length === 1 ? "" : "s"}${nao ? ` · <span class="at-vermelho"><b>${nao}</b> sem resposta</span>` : ""}${ia ? ` · <b>${ia}</b> com a IA` : ""}`;
      } else {
        const abertos = chamados().filter(ch => aberto(ch) && !preventiva(ch));
        const sem = abertos.filter(ch => !ch.tecnico_id).length;
        const fora = abertos.filter(foraPrazo).length;
        frase.innerHTML = st.carregou || chamados().length
          ? `<b>${abertos.length}</b> chamado${abertos.length === 1 ? "" : "s"} em aberto${sem ? ` · <b>${sem}</b> sem técnico` : ""}${fora ? ` · <span class="at-vermelho"><b>${fora}</b> fora do prazo</span>` : ""}`
          : "";
      }
    }
    const busca = document.getElementById("atBusca");
    if (busca) busca.placeholder = modoWa() ? "Nome, telefone, prédio ou mensagem" : "Prédio, assunto, nº ou telefone";

    if (!st.carregou && !chamados().length) {
      itensEl.innerHTML = Array.from({ length: 6 }, () => `<div class="at-esq"><i></i><span><i></i><i></i></span></div>`).join("");
      return;
    }
    const lista = filtrados();
    if (!lista.length) {
      const bom = !st.busca && ["abertos", "semtec", "prazo", "p1", "semresp"].includes(vAtual);
      const txtBom = vAtual === "semresp" ? "Nenhuma conversa esperando resposta." : "Nenhum chamado esperando aqui agora.";
      itensEl.innerHTML = `<div class="at-vazio">${ico(bom ? "circle-check" : "search")}<b>${st.busca ? "Nada encontrado." : bom ? "Fila limpa." : "Nada nesta visão."}</b>
        <span>${st.busca ? `Tente outro termo, ou procure em “${modoWa() ? "Todas" : "Todos"}”.` : bom ? txtBom : ""}</span></div>`;
      icones(itensEl);
      return;
    }
    itensEl.innerHTML = lista.slice(0, 300).map(it => it.tipo === "ch" ? itemChamado(it.ch) : itemConversa(it.cv)).join("");
    icones(itensEl);
  }

  function itemChamado(ch) {
    const [cls, ic, nome] = canal(ch);
    const sel = st.sel?.tipo === "ch" && st.sel.id === ch.id;
    const p = String(ch.prioridade || "p3").toLowerCase();
    let estado;
    if (ch.status === "fechado") estado = `<span class="at-estado">resolvido ${rel(ch.fechado_em)}</span>`;
    else if (ch.status === "cancelado") estado = `<span class="at-estado">cancelado</span>`;
    else if (foraPrazo(ch)) estado = `<span class="at-estado is-ri">${ico("clock")}fora do prazo</span>`;
    else if (ch.tecnico_chegou_em) estado = `<span class="at-estado is-info">técnico no local</span>`;
    else if (ch.tecnico_a_caminho_em) estado = `<span class="at-estado is-info">técnico a caminho</span>`;
    else estado = `<span class="at-estado">aberto há ${rel(ch.criado_em)}</span>`;
    return `<div class="at-item${sel ? " is-sel" : ""}" role="option" aria-selected="${sel}" tabindex="0" data-at-ch="${ch.id}">
      <span class="at-canal ${cls}" title="${nome}">${ico(ic)}</span>
      <div class="at-item-txt">
        <div class="at-l1"><span class="at-predio">${esc(ch.condominio_nome || "Sem condomínio")}</span><time>${rel(ch.criado_em)}</time></div>
        <span class="at-titulo">${esc(ch.titulo || "Sem título")}</span>
        <div class="at-l3"><span class="at-prio is-${p}">${p.toUpperCase()}</span>${estado}<span class="at-esp"></span>
          ${ch.tecnico_nome ? `<span class="at-av" title="${esc(ch.tecnico_nome)}">${esc(iniciais(ch.tecnico_nome))}</span>` : aberto(ch) ? `<span class="at-semtec">sem técnico</span>` : ""}</div>
      </div>
    </div>`;
  }

  function itemConversa(cv) {
    const sel = st.sel?.tipo === "wa" && st.sel.id === cv.id;
    const classe = waClasse(cv);
    return `<div class="at-item${sel ? " is-sel" : ""}${cv.unread_count ? " is-nao-lido" : ""}" role="option" aria-selected="${sel}" tabindex="0" data-at-wa="${cv.id}">
      <span class="at-canal wa" title="Conversa no WhatsApp">${ico("message-circle")}</span>
      <div class="at-item-txt">
        <div class="at-l1"><span class="at-predio">${esc(cv.cliente_nome || cv.telefone || "Contato")}</span><time>${rel(cv.ultima_mensagem_em || cv.atualizado_em || cv.criado_em)}</time></div>
        <span class="at-titulo">${esc(cv.ultima_mensagem || "Conversa sem mensagens")}</span>
        <div class="at-l3"><span class="at-tag-wa">WhatsApp</span>
          <span class="at-estado${classe === "naoresp" ? " is-at" : ""}">${classe === "naoresp" ? "sem resposta" : classe === "atend" ? "em atendimento" : "encerrada"}</span>
          ${cv.condominio_nome ? `<span class="at-esp"></span><span class="at-semtec">${esc(cv.condominio_nome)}</span>` : ""}
          ${cv.unread_count ? `<span class="at-n">${cv.unread_count}</span>` : ""}</div>
      </div>
    </div>`;
  }

  // ===== CENTRO: hospeda os blocos que já existem =====
  const origem = new WeakMap(); // elemento → { pai, proximo }
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
  const blocoCh = () => document.getElementById("chDetailCol");
  const blocoWaChat = () => document.querySelector(".wa-chat-col");
  const blocoWaInfo = () => document.getElementById("waInfoCol");

  function desenharCentro() {
    const palco = document.getElementById("atPalco");
    const abas = document.getElementById("atAbas");
    if (!palco) return;
    const it = st.sel;
    const ch = it?.tipo === "ch" ? chamados().find(c => c.id === it.id) : null;
    const cv = it?.tipo === "wa" ? conversas().find(c => c.id === it.id) : (ch && waLigada() ? conversaDoChamado(ch) : null);

    if (!ch && !cv) {
      // Sem item: o palco mostra o vazio; os blocos ficam guardados no lugar deles.
      [blocoCh(), blocoWaChat(), blocoWaInfo()].forEach(devolver);
      abas.hidden = true;
      palco.innerHTML = `<div class="at-centro-vazio">${ico("inbox")}<b>Escolha um chamado ou uma conversa</b>
        <span>O chamado inteiro aparece aqui: andamento, quem está com ele, a conversa no WhatsApp e o que está ligado a ele.</span></div>`;
      icones(palco);
      return;
    }
    palco.querySelector(".at-centro-vazio")?.remove();

    // Abas só quando o chamado tem conversa (ou a conversa tem chamado).
    const chDaConversa = it.tipo === "wa" ? chamadoDaConversa(cv) : null;
    const temDuas = (ch && cv) || (cv && chDaConversa);
    if (temDuas) {
      abas.hidden = false;
      abas.innerHTML = `
        <button type="button" data-at-aba="chamado" class="${st.aba === "chamado" ? "is-on" : ""}">${ico("inbox")}Chamado</button>
        <button type="button" data-at-aba="conversa" class="${st.aba === "conversa" ? "is-on" : ""}">${ico("message-circle")}Conversa no WhatsApp${cv.unread_count ? ` <span class="at-n">${cv.unread_count}</span>` : ""}</button>`;
      icones(abas);
    } else {
      abas.hidden = true;
      abas.innerHTML = "";
    }

    const mostrarConversa = cv && (it.tipo === "wa" ? st.aba !== "chamado" || !chDaConversa : st.aba === "conversa");
    if (mostrarConversa) {
      devolver(blocoCh());
      const wrap = palco.querySelector(".at-wa") || Object.assign(document.createElement("div"), { className: "at-wa" });
      if (!wrap.parentElement) palco.appendChild(wrap);
      hospedar(blocoWaChat(), wrap);
      hospedar(blocoWaInfo(), wrap);
      if ((typeof _waSelecionadaId === "undefined" || _waSelecionadaId !== cv.id) && typeof _waSelecionar === "function") _waSelecionar(cv.id);
    } else {
      [blocoWaChat(), blocoWaInfo()].forEach(devolver);
      palco.querySelector(".at-wa")?.remove();
      const alvoCh = ch || chDaConversa;
      hospedar(blocoCh(), palco);
      if (alvoCh) {
        _chSelecionadoId = alvoCh.id;
        if (typeof renderChDetalhe === "function") renderChDetalhe(alvoCh);
      }
    }
  }

  function escolher(tipo, id, { aba } = {}) {
    st.sel = { tipo, id };
    st.aba = aba || "chamado";
    st.aberto = true;
    history.replaceState(null, "", `#/atendimento/${tipo === "wa" ? "c" + id : id}`);
    document.querySelectorAll("#atItens .at-item").forEach(el => {
      const on = (tipo === "ch" && Number(el.dataset.atCh) === id) || (tipo === "wa" && Number(el.dataset.atWa) === id);
      el.classList.toggle("is-sel", on);
      el.setAttribute("aria-selected", String(on));
    });
    document.getElementById("atCaixa")?.classList.add("com-item");
    desenharCentro();
    document.getElementById("atPalco")?.scrollTo?.(0, 0);
  }

  const ativa = () => document.querySelector('.section[data-section="atendimento"]')?.classList.contains("is-active");

  // ===== EVENTOS =====
  document.addEventListener("click", (e) => {
    if (!e.target.closest('.section[data-section="atendimento"]')) return;
    const t = e.target;
    let el;
    if ((el = t.closest("[data-at-visao]"))) { if (modoWa()) st.visaoWa = el.dataset.atVisao; else st.visao = el.dataset.atVisao; desenharFila(); return; }
    if ((el = t.closest("[data-at-modo]"))) {
      if (st.modo === el.dataset.atModo) return;
      st.modo = el.dataset.atModo;
      // O item aberto era da outra fila: o palco volta ao vazio.
      if (st.sel && (st.modo === "conversas") !== (st.sel.tipo === "wa")) {
        st.sel = null;
        st.aberto = false;
        document.getElementById("atCaixa")?.classList.remove("com-item");
        history.replaceState(null, "", "#/atendimento");
        desenharCentro();
      }
      desenharFila();
      document.getElementById("atItens")?.scrollTo?.(0, 0);
      return;
    }
    if ((el = t.closest("[data-at-ch]"))) { escolher("ch", Number(el.dataset.atCh)); return; }
    if ((el = t.closest("[data-at-wa]"))) { escolher("wa", Number(el.dataset.atWa), { aba: "conversa" }); return; }
    if ((el = t.closest("[data-at-aba]"))) { st.aba = el.dataset.atAba; desenharCentro(); return; }
    if (t.closest("[data-at-voltar]")) { st.aberto = false; document.getElementById("atCaixa")?.classList.remove("com-item"); return; }
    if (t.closest("[data-at-novo]")) { document.getElementById("btnNovoChamado")?.click(); return; }
  });
  document.addEventListener("keydown", (e) => {
    const it = e.target.closest?.("#atItens .at-item");
    if (!it) return;
    if (e.key === "Enter") { e.preventDefault(); it.click(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const prox = e.key === "ArrowDown" ? it.nextElementSibling : it.previousElementSibling;
      if (prox?.classList.contains("at-item")) { prox.focus(); prox.click(); }
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "atBusca") { st.busca = e.target.value; desenharFila(); }
  });

  // ===== GANCHOS =====
  (function () {
    const origShow = window.showSection;
    window.showSection = function (name, ...resto) {
      // Lido antes: o showSection reescreve o endereço (ver Monitoramento).
      const partes = location.hash.replace(/^#\/?/, "").split("/");
      const alvo = partes[0] === "atendimento" ? partes[1] : null;
      const r = origShow.call(this, name, ...resto);
      if (name === "atendimento") {
        if (alvo) {
          const wa = /^c\d+$/.test(alvo);
          const id = Number(wa ? alvo.slice(1) : alvo);
          if (Number.isInteger(id) && id > 0) { st.sel = { tipo: wa ? "wa" : "ch", id }; st.aba = wa ? "conversa" : "chamado"; st.aberto = true; st.modo = wa ? "conversas" : "chamados"; }
        }
        // Abrir a fila marca os chamados como vistos (o que a tela Chamados fazia).
        if (typeof _chamadosIdsAck !== "undefined") { for (const ch of chamados()) _chamadosIdsAck.add(ch.id); }
        if (typeof atualizarBadgesChamados === "function") atualizarBadgesChamados();
        render();
        if (st.sel) history.replaceState(null, "", `#/atendimento/${st.sel.tipo === "wa" ? "c" + st.sel.id : st.sel.id}`);
      } else if (name === "chamados" || name === "chamado-detalhe") {
        devolver(blocoCh());
      } else if (name === "whatsapp") {
        devolver(blocoWaChat()); devolver(blocoWaInfo());
      }
      return r;
    };
    // Toda gravação passa por renderChamados; o polling, por carregarAtendimento.
    for (const nome of ["renderChamados", "carregarAtendimento", "carregarTudo"]) {
      const orig = window[nome];
      if (typeof orig !== "function") continue;
      window[nome] = function (...a) {
        const p = orig.apply(this, a);
        Promise.resolve(p).then(() => {
          if (nome !== "renderChamados") st.carregou = true;
          if (!ativa()) return;
          desenharFila();
          // Aberto pelo endereço (F5, link) antes de os chamados chegarem: o
          // palco ficou no vazio e agora já há o que mostrar.
          if (st.sel && document.querySelector("#atPalco .at-centro-vazio")) desenharCentro();
        });
        return p;
      };
    }
  })();

  window.gbAtEscolher = (id) => { st.modo = "chamados"; showSection("atendimento"); escolher("ch", Number(id)); };
})();
