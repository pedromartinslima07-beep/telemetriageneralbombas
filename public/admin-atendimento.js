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
    ["p1", "P1", ch => aberto(ch) && String(ch.prioridade).toLowerCase() === "p1", "ri"],
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
  // ⚠️ AS VISÕES DE CONSULTA FICAM NO "MAIS" (27/11/2026). Eram oito chips em
  // três linhas em cima da fila. À vista fica o trabalho do dia; o arquivo
  // (e as preventivas, que têm tela própria) abre num menu.
  const NO_MAIS = new Set(["preventivas", "resolvidos", "cancelados", "todos", "encerradas", "todas"]);
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

  // Um formato só na fila (27/11/2026): "5 h", "3 d", "120 d". Antes passava
  // a data ("30/07") depois de 30 dias, e a coluna lia em dois idiomas.
  function rel(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "agora";
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
  }
  const iniciais = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  // "Carlos Técnico" → "Carlos T." (cabe na linha da fila; as iniciais sozinhas não diziam quem era).
  const nomeCurto = n => { const p = String(n || "").trim().split(/\s+/); return p[0] + (p[1] ? ` ${p[1][0]}.` : ""); };

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
        <span class="at-esp"></span>
        <button type="button" class="at-bt is-pri viewer-only-hide" data-at-novo>${ico("plus")}Novo chamado</button>
      </header>
      <div class="at-caixa${st.aberto ? " com-item" : ""}" id="atCaixa">
        <aside class="at-fila" aria-label="Fila de atendimento">
          <div class="at-fila-topo">
            <label class="at-busca">${ico("search")}<input type="search" id="atBusca" placeholder="Prédio, assunto, nº ou telefone" value="${esc(st.busca)}"></label>
            <div class="at-chips" id="atChips" role="group" aria-label="Visões"></div>
            <div class="at-mais" id="atMais" role="menu" hidden></div>
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

    // ⚠️ A FRASE "N em aberto · N sem técnico · N fora do prazo" SAIU do
    // cabeçalho (27/11/2026): repetia, palavra por palavra, os números dos
    // chips logo abaixo. A contagem mora nos chips.
    const visoes = visoesAtivas();
    const naMais = visoes.find(v => v[0] === vAtual && NO_MAIS.has(v[0]));
    chipsEl.innerHTML = visoes.filter(v => !NO_MAIS.has(v[0])).map(([k, n, , pt]) => {
      const c = itensDa(k).length;
      if (!c && k !== vAtual && ["prazo", "p1", "semtec", "assumidas"].includes(k)) return "";
      return `<button type="button" class="at-chip${vAtual === k ? " is-on" : ""}" data-at-visao="${k}" aria-pressed="${vAtual === k}">${pt && c ? `<i class="at-pt is-${pt}"></i>` : ""}${n}<span>${c}</span></button>`;
    }).join("") + `<button type="button" class="at-chip at-chip-mais${naMais ? " is-on" : ""}" data-at-mais aria-haspopup="menu" aria-expanded="false">${naMais ? `${naMais[1]}<span>${itensDa(naMais[0]).length}</span>` : "Mais"}${ico("chevron-down")}</button>`;
    const maisEl = document.getElementById("atMais");
    if (maisEl) {
      maisEl.hidden = true;
      maisEl.innerHTML = visoes.filter(v => NO_MAIS.has(v[0])).map(([k, n]) =>
        `<button type="button" role="menuitem" data-at-visao="${k}" class="${vAtual === k ? "is-on" : ""}">${n}<span>${itensDa(k).length}</span></button>`).join("");
    }
    icones(chipsEl);
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

  // ⚠️ SEM A BOLINHA DE CANAL EM TODA LINHA (27/11/2026). Era o mesmo envelope
  // cinza em quase todos os itens, ou seja, não dizia nada. O ícone só aparece,
  // pequeno e ao lado do prédio, quando o canal informa: WhatsApp, sensor,
  // preventiva. E só o P1 é preenchido de vermelho: com tudo gritando, o
  // crítico de verdade não se destacava.
  function itemChamado(ch) {
    const [cls, ic, nome] = canal(ch);
    const sel = st.sel?.tipo === "ch" && st.sel.id === ch.id;
    const p = String(ch.prioridade || "p3").toLowerCase();
    let estado;
    if (ch.status === "fechado") estado = `<span class="at-estado is-ok">resolvido${ch.fechado_em ? ` há ${rel(ch.fechado_em)}` : ""}</span>`;
    else if (ch.status === "cancelado") estado = `<span class="at-estado">cancelado</span>`;
    else if (foraPrazo(ch)) estado = `<span class="at-estado is-ri">${ico("clock")}fora do prazo</span>`;
    else if (ch.tecnico_chegou_em) estado = `<span class="at-estado is-info">técnico no local</span>`;
    else if (ch.tecnico_a_caminho_em) estado = `<span class="at-estado is-info">técnico a caminho</span>`;
    else estado = `<span class="at-estado">aberto</span>`;
    return `<div class="at-item${sel ? " is-sel" : ""}" role="option" aria-selected="${sel}" tabindex="0" data-at-ch="${ch.id}">
      <div class="at-item-txt">
        <div class="at-l1"><span class="at-predio">${cls ? `<span class="at-canal-ic ${cls}" title="${nome}">${ico(ic)}</span>` : ""}<span>${esc(ch.condominio_nome || "Sem condomínio")}</span></span><time>${rel(ch.criado_em)}</time></div>
        <span class="at-titulo">${esc(ch.titulo || "Sem título")}</span>
        <div class="at-l3"><span class="at-prio is-${p}">${p.toUpperCase()}</span>${estado}<span class="at-esp"></span>
          ${ch.tecnico_nome ? `<span class="at-tec" title="${esc(ch.tecnico_nome)}">${esc(nomeCurto(ch.tecnico_nome))}</span>` : aberto(ch) ? `<span class="at-semtec">sem técnico</span>` : ""}</div>
      </div>
    </div>`;
  }

  function itemConversa(cv) {
    const sel = st.sel?.tipo === "wa" && st.sel.id === cv.id;
    const classe = waClasse(cv);
    return `<div class="at-item${sel ? " is-sel" : ""}${cv.unread_count ? " is-nao-lido" : ""}" role="option" aria-selected="${sel}" tabindex="0" data-at-wa="${cv.id}">
      <div class="at-item-txt">
        <div class="at-l1"><span class="at-predio">${esc(cv.cliente_nome || cv.telefone || "Contato")}</span><time>${rel(cv.ultima_mensagem_em || cv.atualizado_em || cv.criado_em)}</time></div>
        <span class="at-titulo">${esc(cv.ultima_mensagem || "Conversa sem mensagens")}</span>
        <div class="at-l3">
          <span class="at-estado${classe === "naoresp" ? " is-at" : ""}">${classe === "naoresp" ? "sem resposta" : classe === "atend" ? "em atendimento" : "encerrada"}</span>
          ${cv.condominio_nome ? `<span class="at-esp"></span><span class="at-semtec">${esc(cv.condominio_nome)}</span>` : ""}
          ${cv.unread_count ? `<span class="at-n">${cv.unread_count}</span>` : ""}</div>
      </div>
    </div>`;
  }

  // ===== O CHAMADO, DESENHADO PARA ESTA TELA (27/11/2026) =====
  //
  // ⚠️ ATÉ AQUI O PALCO MOSTRAVA O PAINEL DA TELA CHAMADOS, TRANSPLANTADO: outra
  // língua visual (selos chapados, botão em toda linha, seções em caixa alta,
  // uma linha do tempo de meia tela) ao lado da fila nova, e o Pedro sentia
  // que eram dois produtos. Maquete aprovada: /dev/_atendimento-preview.html.
  //
  // O `#chDetailCol` continua sendo o bloco hospedado, e `renderChDetalhe`
  // (admin.js) continua sendo quem desenha. Quando o bloco está no palco, ela
  // chama esta função em vez do desenho antigo. Por isso tudo que grava
  // continua igual: os mesmos `data-action` (fechar, reabrir, cancelar,
  // vincular técnico/condomínio, ver-condo), os mesmos ids de linha que o
  // "Trocar" substitui por um seletor (`chTecnicoRow-N`, `chCondoRow-N`), o
  // histórico que se redesenha sozinho (`chHistSec-N`) e as marcas do turno
  // (`data-ch-esc`). Mudou o desenho, não a lógica.
  function limite(min) {
    if (min == null) return "";
    return min % 60 === 0 ? `${min / 60} h` : `${min} min`;
  }
  function telemetria(ch) {
    if (!ch.condominio_id || typeof _statusData === "undefined") return "";
    const item = (_statusData || []).find(g => Number(g.condominio?.id) === Number(ch.condominio_id));
    const reservs = item?.reservatorios?.slice(0, 6) || [];
    if (!reservs.length) return "";
    const cor = { alto: "is-ok", medio: "is-ok", baixo: "is-at", muito_baixo: "is-ri" };
    return `<div class="atc-sec"><h3>O prédio agora</h3><div class="atc-res">${reservs.map(r => {
      const u = r.ultima_leitura;
      const pct = u?.nivel_pct ?? null;
      const bomba = u?.bomba_ligada === true ? "bomba ligada" : u?.bomba_ligada === false ? "bomba desligada" : "";
      return `<div><span>${esc(r.nome || "Reservatório")}</span><b>${pct != null ? pct + "%" : "—"}</b>
        <i class="${cor[String(u?.nivel || "").toLowerCase()] || ""}"><i style="width:${pct ?? 0}%"></i></i>${bomba ? `<small>${bomba}</small>` : ""}</div>`;
    }).join("")}</div>
      <button type="button" class="atc-link" data-action="ver-condo" data-id="${ch.condominio_id}">Abrir a ficha do condomínio →</button></div>`;
  }
  function faixa(ch) {
    const fechado = ch.status === "fechado", cancelado = ch.status === "cancelado";
    if (fechado) return `<div class="atc-faixa is-ok">${ico("circle-check")}<div><b>Resolvido${ch.fechado_em ? ` em ${fmtData(ch.fechado_em)}` : ""}</b>${ch.tecnico_nome ? ` <span>· ${esc(ch.tecnico_nome)}</span>` : ""}</div></div>`;
    if (cancelado) return `<div class="atc-faixa">${ico("circle-slash")}<div><b>Cancelado${ch.cancelado_em ? ` em ${fmtData(ch.cancelado_em)}` : ""}.</b>${ch.cancelado_motivo ? ` <span>${esc(ch.cancelado_motivo)}</span>` : ""}</div></div>`;
    const semTec = !ch.tecnico_id && !preventiva(ch);
    const resto = semTec ? " E ninguém está com ele ainda." : "";
    // O prazo num lugar só (antes: dois selos dentro de "Quem está com ele").
    if (ch.sla_ttfr_estourado) return `<div class="atc-faixa is-ri">${ico("clock")}<div><b>Sem primeira resposta.</b> <span>Aberto há ${rel(ch.criado_em)}; o limite era ${limite(ch.sla_ttfr_min)}.${resto}</span></div></div>`;
    if (foraPrazo(ch)) return `<div class="atc-faixa is-ri">${ico("clock")}<div><b>Fora do prazo de solução.</b> <span>Aberto há ${rel(ch.criado_em)}${ch.sla_ttr_min ? `; o limite era ${limite(ch.sla_ttr_min)}` : ""}.${resto}</span></div></div>`;
    if (semTec) return `<div class="atc-faixa is-at">${ico("user-x")}<div><b>Ninguém está com ele.</b> <span>Atribua um técnico na coluna ao lado.</span></div></div>`;
    return "";
  }
  function linhaTempo(ch) {
    const fechado = ch.status === "fechado", cancelado = ch.status === "cancelado";
    const etapas = [
      ["Aberto", ch.criado_em], ["Técnico a caminho", ch.tecnico_a_caminho_em], ["Técnico chegou", ch.tecnico_chegou_em],
      // ⚠️ Reabrir não apaga o `fechado_em` no banco: a etapa final só conta
      // com o chamado de fato fechado/cancelado (achado no teste de 27/11).
      cancelado ? ["Cancelado", ch.cancelado_em] : ["Resolvido", fechado ? ch.fechado_em : null],
    ];
    const atual = (fechado || cancelado) ? -1 : etapas.findIndex(e => !e[1]);
    return `<ol class="atc-tempo" aria-label="Andamento do chamado">${etapas.map(([rot, em], i) => {
      const cls = em ? "is-feito" : i === atual ? "is-atual" : "";
      const q = em ? fmtData(em) : (fechado || cancelado) ? "não registrado" : i === atual ? "a seguir" : "";
      return `<li class="${cls}"><b>${rot}</b><span>${q}</span></li>`;
    }).join("")}</ol>`;
  }
  function turno(ch) {
    if (typeof _isOperador !== "undefined" && _isOperador) return "";
    // Já tem marca (do turno ou do escritório): o bloco de sempre, que mostra
    // o motivo e tem "Pedido atendido" / "Retirar".
    if (ch.escritorio_motivo || ch.pede_escritorio_motivo) return typeof _chRenderEscritorio === "function" ? _chRenderEscritorio(ch) : "";
    if (!(ch.status === "aberto" || ch.status === "em_atendimento")) return "";
    // Sem marca: o campo fica escondido e abre pelo "Marcar para o turno" do ⋯.
    return `<div class="ch-esc-novo atc-turno-form" data-ch-esc-form="${ch.id}" hidden>
      <button type="button" class="btn btn-sm" data-ch-esc="abrir" data-ch-id="${ch.id}" hidden>Marcar para o turno</button>
      <div class="ch-esc-campo">
        <b>Marcar para o turno</b>
        <textarea class="input" rows="2" maxlength="300" placeholder="O que o turno precisa saber? Ex.: cliente reclamou, ir hoje"></textarea>
        <div class="ch-esc-acoes">
          <button type="button" class="at-bt" data-ch-esc="cancelar" data-ch-id="${ch.id}">Cancelar</button>
          <button type="button" class="at-bt is-pri" data-ch-esc="marcar" data-ch-id="${ch.id}">Marcar</button>
        </div>
        <small class="ch-esc-nota">Aparece como selo no item e na ficha do painel do turno. Não muda a ordem da fila, que é pelo prazo.</small>
      </div>
    </div>`;
  }
  function detalheChamado(ch) {
    const fechado = ch.status === "fechado", cancelado = ch.status === "cancelado";
    const operador = typeof _isOperador !== "undefined" && _isOperador;
    const [, ic, nomeCanal] = canal(ch);
    const p = String(ch.prioridade || "p3").toLowerCase();
    const prioNome = (typeof _chPrioNome !== "undefined" && _chPrioNome[ch.prioridade]) || p.toUpperCase();
    const catNome = ch.categoria ? ((typeof _chCatNome !== "undefined" && _chCatNome[ch.categoria]) || ch.categoria) : "";
    const cv = waLigada() ? conversaDoChamado(ch) : null;
    const podeTurno = !operador && !fechado && !cancelado && !ch.escritorio_motivo;

    const acao = (fechado || cancelado)
      ? `<button type="button" class="at-bt viewer-only-hide" data-action="reabrir-chamado" data-id="${ch.id}">${ico("rotate-ccw")}Reabrir</button>`
      : `<button type="button" class="at-bt is-pri viewer-only-hide" data-action="fechar-chamado" data-id="${ch.id}">${ico("check")}Marcar como resolvido</button>`;
    // ⚠️ Cancelar continua longe do verde e por último (ver renderChDetalhe):
    // aqui, no fim do ⋯, separado por um fio. Escondido para o operador (403).
    const menu = `<div class="atc-menu" role="menu" hidden>
      <button type="button" role="menuitem" data-ch-abrir-pagina="${ch.id}">${ico("external-link")}Abrir em página própria</button>
      ${podeTurno ? `<button type="button" role="menuitem" class="viewer-only-hide" data-at-turno>${ico("flag")}Marcar para o turno</button>` : ""}
      ${(!operador && !fechado && !cancelado) ? `<hr><button type="button" role="menuitem" class="is-perigo viewer-only-hide" data-action="cancelar-chamado" data-id="${ch.id}">${ico("x")}Cancelar chamado</button>` : ""}
    </div>`;

    const tecDd = ch.tecnico_nome
      ? `<dd><span class="atc-av">${esc(iniciais(ch.tecnico_nome))}</span>${esc(ch.tecnico_nome)}</dd>`
      : (fechado || cancelado)
        ? `<dd>—<button type="button" class="atc-link viewer-only-hide" data-action="vincular-ch-tecnico" data-ch-id="${ch.id}">Registrar</button></dd>`
        : `<dd><span class="atc-ninguem">Ninguém ainda</span></dd><dd><button type="button" class="at-bt viewer-only-hide" data-action="vincular-ch-tecnico" data-ch-id="${ch.id}">${ico("user-plus")}Atribuir técnico</button></dd>`;
    const condoDd = ch.condominio_nome
      ? `<dd>${esc(ch.condominio_nome)}</dd>`
      : `<dd><button type="button" class="at-bt viewer-only-hide" data-action="vincular-ch-condo" data-ch-id="${ch.id}">${ico("building-2")}Vincular condomínio</button></dd>`;
    let resposta = "";
    if (ch.primeira_resposta_em) {
      const min = Math.max(0, Math.round((new Date(ch.primeira_resposta_em) - new Date(ch.criado_em)) / 60000));
      resposta = `em ${min < 60 ? min + " min" : min < 2880 ? Math.round(min / 60) + " h" : Math.round(min / 1440) + " d"}`;
    } else if (!fechado && !cancelado && ch.sla_ttfr_min != null) {
      resposta = `<span class="${ch.sla_ttfr_estourado ? "atc-ri" : ""}">aguardando · limite ${limite(ch.sla_ttfr_min)}</span>`;
    }

    return `<div class="atc">
      <div class="atc-corpo">
        <div>
          <div class="atc-cab">
            <div class="atc-id"><code>CH-${String(ch.id).padStart(4, "0")}</code>·<span>${ico(ic)}${nomeCanal}</span>·<span>aberto há ${rel(ch.criado_em)}</span></div>
            <div class="atc-menu-wrap"><button type="button" class="at-bt is-ico" data-at-menu aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações">${ico("ellipsis")}</button>${menu}</div>
          </div>
          <h2 class="atc-titulo">${esc(ch.titulo || "Sem título")}</h2>
          <div class="atc-sub">
            <span class="at-prio is-${p}">${esc(prioNome)}</span>
            ${ch.condominio_id ? `<button type="button" class="atc-link" data-action="ver-condo" data-id="${ch.condominio_id}">${esc(ch.condominio_nome || "Condomínio")}</button>` : `<span>sem condomínio</span>`}
            ${catNome ? `<span>${esc(catNome)}</span>` : ""}
          </div>
          <div class="atc-acoes">${acao}</div>
        </div>
        ${faixa(ch)}
        ${linhaTempo(ch)}
        ${turno(ch)}
        ${ch.descricao ? `<div class="atc-sec"><h3>O que está acontecendo</h3><p>${esc(ch.descricao)}</p></div>` : ""}
        ${cv ? `<div class="atc-sec"><h3>Como chegou</h3><div class="atc-wa">${ico("message-circle")}<span>Pelo WhatsApp${ch.cliente_nome ? `, com ${esc(ch.cliente_nome)}` : ""}.</span><button type="button" class="atc-link" data-at-aba="conversa">Ver a conversa →</button></div></div>` : ""}
        ${typeof _chRenderAvaliacaoCard === "function" ? _chRenderAvaliacaoCard(ch) : ""}
        ${typeof _chRenderHistoricoCard === "function" ? _chRenderHistoricoCard(ch.id) : ""}
      </div>
      <aside class="atc-lado">
        <dl class="atc-dl">
          <div id="chTecnicoRow-${ch.id}"><dt>Técnico${ch.tecnico_nome ? `<button type="button" class="atc-link viewer-only-hide" data-action="vincular-ch-tecnico" data-ch-id="${ch.id}">Trocar</button>` : ""}</dt>${tecDd}</div>
          <div id="chCondoRow-${ch.id}"><dt>Condomínio${ch.condominio_nome ? `<button type="button" class="atc-link viewer-only-hide" data-action="vincular-ch-condo" data-ch-id="${ch.id}">Trocar</button>` : ""}</dt>${condoDd}</div>
          ${ch.responsavel_nome ? `<div><dt>Responsável</dt><dd>${esc(ch.responsavel_nome)}</dd></div>` : ""}
          ${ch.cliente_nome || ch.cliente_telefone ? `<div><dt>Quem pediu</dt><dd>${esc([ch.cliente_nome, ch.cliente_telefone].filter(Boolean).join(" · "))}</dd></div>` : ""}
          ${resposta ? `<div><dt>Primeira resposta</dt><dd>${resposta}</dd></div>` : ""}
        </dl>
        ${telemetria(ch)}
      </aside>
    </div>`;
  }
  window.gbAtChDetalhe = detalheChamado;

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
    // Menus que abrem por cima: qualquer clique fora fecha.
    const maisEl = document.getElementById("atMais");
    const menuEl = document.querySelector(".atc-menu");
    if ((el = t.closest("[data-at-mais]"))) {
      if (maisEl) { maisEl.hidden = !maisEl.hidden; el.setAttribute("aria-expanded", String(!maisEl.hidden)); }
      return;
    }
    if ((el = t.closest("[data-at-menu]"))) {
      if (menuEl) { menuEl.hidden = !menuEl.hidden; el.setAttribute("aria-expanded", String(!menuEl.hidden)); }
      return;
    }
    if (maisEl && !maisEl.hidden && !t.closest("#atMais")) maisEl.hidden = true;
    if (menuEl && !menuEl.hidden) menuEl.hidden = true;
    if ((el = t.closest("[data-at-turno]"))) {
      const form = document.querySelector(".atc-turno-form");
      if (form) { form.hidden = false; form.querySelector("textarea")?.focus(); }
      return;
    }
    // O "Cancelar" do campo é tratado no admin.js (data-ch-esc); aqui só some
    // com a caixa inteira, que no Atendimento abre pelo menu ⋯.
    if (t.closest('.atc-turno-form [data-ch-esc="cancelar"]')) {
      const form = t.closest(".atc-turno-form");
      setTimeout(() => {
        form.hidden = true;
        const c = form.querySelector(".ch-esc-campo"); if (c) c.hidden = false;
        const a = form.querySelector('[data-ch-esc="abrir"]'); if (a) a.hidden = true;
      }, 0);
      return;
    }
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
