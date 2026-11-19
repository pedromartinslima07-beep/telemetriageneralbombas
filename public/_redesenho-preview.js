/* MAQUETE DO REDESENHO ESTRUTURAL DO ADMIN (19/11/2026) — dados de exemplo.
   Nada aqui chama a API. Sem handler inline (CSP): tudo por delegação. */
(function () {
  "use strict";

  // ═══ DADOS DE EXEMPLO ═════════════════════════════════════════════════
  const TECNICOS = [
    { id: 1, nome: "Carlos Souza", ini: "CS" },
    { id: 2, nome: "Marcos Lima", ini: "ML" },
    { id: 3, nome: "João Pereira", ini: "JP" },
  ];

  const CONDOS = [
    { id: 1, nome: "Ed. Monte Verde", bairro: "Vila Mariana", lat: -23.5889, lng: -46.6388 },
    { id: 2, nome: "Cond. Parque das Águas", bairro: "Butantã", lat: -23.5712, lng: -46.7085 },
    { id: 3, nome: "Res. Vila Rica", bairro: "Tatuapé", lat: -23.5401, lng: -46.5762 },
    { id: 4, nome: "Ed. Solar do Ipiranga", bairro: "Ipiranga", lat: -23.5869, lng: -46.6097 },
    { id: 5, nome: "Cond. Jardim Europa", bairro: "Jardim Europa", lat: -23.5786, lng: -46.6812 },
    { id: 6, nome: "Ed. Bela Vista", bairro: "Bela Vista", lat: -23.5614, lng: -46.6487 },
    { id: 7, nome: "Cond. Alto da Lapa", bairro: "Lapa", lat: -23.5302, lng: -46.7121 },
    { id: 8, nome: "Ed. Aurora", bairro: "Santana", lat: -23.5016, lng: -46.6268 },
    { id: 9, nome: "Res. Mooca Park", bairro: "Mooca", lat: -23.5568, lng: -46.5987 },
    { id: 10, nome: "Ed. Pinheiros Office", bairro: "Pinheiros", lat: -23.5651, lng: -46.6923 },
  ];
  const condo = id => CONDOS.find(c => c.id === id);

  // sit: ri (crítico / sem sinal), at (baixo), ok
  const RES = [
    { id: 11, c: 1, nome: "Caixa superior", nivel: 14, tend: -9, bomba: "parada", sinal: "há 12 s", sit: "ri", motivo: "Nível muito baixo" },
    { id: 12, c: 1, nome: "Cisterna", nivel: 71, tend: -2, bomba: "—", sinal: "há 9 s", sit: "ok" },
    { id: 21, c: 2, nome: "Cisterna", nivel: 61, tend: 0, bomba: "sem dados", sinal: "há 3 h 04 min", sit: "ri", motivo: "Sem sinal", mudo: true },
    { id: 22, c: 2, nome: "Caixa torre A", nivel: 58, tend: -1, bomba: "ligada", sinal: "há 15 s", sit: "ok" },
    { id: 31, c: 3, nome: "Caixa superior", nivel: 38, tend: -4, bomba: "ligada", sinal: "há 6 s", sit: "at", motivo: "Nível baixo" },
    { id: 41, c: 4, nome: "Caixa superior", nivel: 83, tend: 1, bomba: "desligada", sinal: "há 11 s", sit: "ok" },
    { id: 51, c: 5, nome: "Cisterna", nivel: 42, tend: -3, bomba: "ligada", sinal: "há 8 s", sit: "at", motivo: "Nível baixo" },
    { id: 52, c: 5, nome: "Caixa superior", nivel: 77, tend: 0, bomba: "desligada", sinal: "há 10 s", sit: "ok" },
    { id: 61, c: 6, nome: "Caixa superior", nivel: 66, tend: 2, bomba: "ligada", sinal: "há 7 s", sit: "ok" },
    { id: 71, c: 7, nome: "Cisterna", nivel: 0, tend: 0, bomba: "sem dados", sinal: "há 2 dias", sit: "ri", motivo: "Sem sinal", mudo: true },
    { id: 81, c: 8, nome: "Caixa superior", nivel: 91, tend: 0, bomba: "desligada", sinal: "há 14 s", sit: "ok" },
    { id: 82, c: 8, nome: "Cisterna", nivel: 88, tend: -1, bomba: "—", sinal: "há 14 s", sit: "ok" },
    { id: 91, c: 9, nome: "Caixa superior", nivel: 74, tend: -1, bomba: "ligada", sinal: "há 5 s", sit: "ok" },
    { id: 101, c: 10, nome: "Caixa superior", nivel: 69, tend: 0, bomba: "desligada", sinal: "há 9 s", sit: "ok" },
  ];
  const SIT_ORD = { ri: 0, at: 1, ok: 2 };

  const FILA = [
    { id: "f1", g: "agora", tipo: "agua", ic: "droplet", cor: "ri", c: 1, t: "Caixa superior em 14% e caindo",
      m: "Bomba de recalque parada desde 06:40 · chamado CH-0231 aberto, sem técnico", idade: "38 min", acao: "Atribuir técnico", faz: "atribuir" },
    { id: "f2", g: "agora", tipo: "agua", ic: "wifi-off", cor: "ri", c: 2, t: "Cisterna sem sinal há 3 h",
      m: "Última leitura às 07:12, em 61% · nenhum chamado aberto", idade: "3 h", acao: "Abrir chamado", faz: "resolver", msg: "Chamado CH-0232 aberto para Cond. Parque das Águas" },
    { id: "f3", g: "agora", tipo: "clientes", ic: "clock", cor: "at", c: 3, t: "CH-0228 vence o prazo em 40 min",
      m: "P2 · Vazamento no barrilete · Carlos Souza em atendimento", idade: "3 h 20 min", acao: "Ver chamado", faz: "chamado", ch: 228 },
    { id: "f4", g: "agora", tipo: "clientes", ic: "message-circle", cor: "info", c: 5, t: "WhatsApp sem resposta há 25 min",
      m: "“A bomba está fazendo um barulho estranho desde ontem à noite…”", idade: "25 min", acao: "Responder", faz: "chamado", ch: 233 },
    { id: "f5", g: "hoje", tipo: "clientes", ic: "circle-check", cor: "at", c: 4, t: "Síndica aprovou o ORC-0142",
      m: "R$ 4.380,00 · troca da bomba pressurizadora · falta dar baixa", idade: "1 h", acao: "Dar baixa", faz: "resolver", msg: "Baixa dada no ORC-0142" },
    { id: "f6", g: "hoje", tipo: "faturamento", ic: "receipt", cor: "cz", c: 1, t: "ORC-0139 aprovado, sem nota fiscal",
      m: "R$ 1.920,00 · aprovado em 14/11", idade: "5 dias", acao: "Emitir nota", faz: "resolver", msg: "NFS-e do ORC-0139 enviada ao Omie" },
    { id: "f7", g: "hoje", tipo: "faturamento", ic: "file-warning", cor: "ri", c: 6, t: "Nota do ORC-0136 voltou com erro",
      m: "Omie: CNPJ do tomador inválido", idade: "2 dias", acao: "Corrigir", faz: "resolver", msg: "Cadastro corrigido · nota reenviada" },
    { id: "f8", g: "hoje", tipo: "clientes", ic: "send", cor: "cz", c: 3, t: "O.S. 0412 finalizada, não enviada",
      m: "Finalizada ontem às 17:20 por Marcos Lima", idade: "16 h", acao: "Enviar ao cliente", faz: "resolver", msg: "O.S. 0412 enviada à síndica por e-mail" },
    { id: "f9", g: "semana", tipo: "contratos", ic: "file-text", cor: "cz", c: 7, t: "Contrato vence em 12 dias",
      m: "CT-2024/00091 · R$ 890,00 por mês · 01/12/2026", idade: "", acao: "Renovar", faz: "resolver", msg: "Renovação do CT-2024/00091 em rascunho" },
  ];
  const FILA_G = { agora: "Agora", hoje: "Hoje", semana: "Nos próximos dias" };
  const FILA_F = [
    ["tudo", "Tudo"], ["agua", "Água e bombas"], ["clientes", "Clientes e chamados"],
    ["faturamento", "Faturamento"], ["contratos", "Contratos"],
  ];

  // quadro do dia: horas decimais entre 8 e 18
  const CAMPO = [
    { t: 1, st: "Em atendimento · Res. Vila Rica", vis: [
      { a: 8, b: 9, c: 6, k: "feita" }, { a: 9.2, b: 11.5, c: 3, k: "agora" }, { a: 13.5, b: 14.5, c: 5 }, { a: 15, b: 16.5, c: 8, k: "prev" } ] },
    { t: 2, st: "A caminho do Ed. Monte Verde · 18 min", vis: [
      { a: 8.5, b: 10, c: 9, k: "feita" }, { a: 10.8, b: 12.5, c: 1 }, { a: 14, b: 15.5, c: 10, k: "prev" } ] },
    { t: 3, st: "Livre a partir das 14 h", vis: [
      { a: 8, b: 10.5, c: 2, k: "feita" }, { a: 11, b: 13.5, c: 4 } ] },
  ];
  const AGORA_H = 10.35;

  const ATIV = [
    { ic: "circle-check", h: "10:02", t: "<b>Síndica do Ed. Solar do Ipiranga</b> aprovou o ORC-0142" },
    { ic: "clipboard-check", h: "09:47", t: "<b>Carlos Souza</b> chegou ao Res. Vila Rica (CH-0228)" },
    { ic: "droplet", h: "09:41", t: "<b>Ed. Monte Verde</b>: caixa superior passou de 20%" },
    { ic: "message-circle", h: "09:35", t: "<b>Cond. Jardim Europa</b> mandou mensagem no WhatsApp" },
    { ic: "receipt", h: "09:10", t: "Nota do <b>ORC-0137</b> autorizada pelo Omie" },
    { ic: "repeat", h: "08:58", t: "Preventiva do <b>Ed. Bela Vista</b> concluída por Carlos Souza" },
  ];

  const CHAMADOS = [
    { id: 231, c: 1, canal: "sensor", t: "Caixa superior em nível muito baixo", p: 1, prazo: { txt: "vence em 1 h 22 min", cor: "at", pct: 66 }, tec: null, st: "aberto", h: "09:24", novo: false },
    { id: 233, c: 5, canal: "wa", t: "Bomba fazendo barulho estranho", p: 3, prazo: { txt: "vence em 23 h", cor: "ok", pct: 4 }, tec: null, st: "aberto", h: "09:35", novo: true },
    { id: 228, c: 3, canal: "fone", t: "Vazamento no barrilete", p: 2, prazo: { txt: "vence em 40 min", cor: "ri", pct: 88 }, tec: 1, st: "atendimento", h: "07:02" },
    { id: 230, c: 2, canal: "wa", t: "Falta d'água no bloco B", p: 2, prazo: { txt: "vence em 3 h", cor: "ok", pct: 40 }, tec: 3, st: "atendimento", h: "08:15", novo: true },
    { id: 229, c: 8, canal: "prev", t: "Preventiva mensal · limpeza de caixa", p: 4, prazo: { txt: "até 30/11", cor: "ok", pct: 10 }, tec: 1, st: "aberto", h: "ontem" },
    { id: 226, c: 10, canal: "fone", t: "Quadro de comando desarmando", p: 3, prazo: { txt: "vence amanhã", cor: "ok", pct: 30 }, tec: 2, st: "atendimento", h: "ontem" },
    { id: 224, c: 7, canal: "sensor", t: "Cisterna sem sinal", p: 3, prazo: { txt: "fora do prazo há 2 h", cor: "ri", pct: 100 }, tec: null, st: "aberto", h: "17/11" },
    { id: 221, c: 6, canal: "wa", t: "Pedido de orçamento: nova bomba", p: 4, prazo: { txt: "até 22/11", cor: "ok", pct: 20 }, tec: 2, st: "atendimento", h: "16/11" },
    { id: 219, c: 4, canal: "fone", t: "Ruído na pressurizadora", p: 3, prazo: { txt: "resolvido 17/11", cor: "ok", pct: 0 }, tec: 1, st: "resolvido", h: "15/11" },
  ];
  const CANAL = {
    wa: { ic: "message-circle", nome: "WhatsApp" }, fone: { ic: "phone", nome: "Telefone" },
    sensor: { ic: "radio-tower", nome: "Alerta da telemetria" }, prev: { ic: "repeat", nome: "Preventiva" },
  };
  const VISOES_AT = [
    ["abertos", "Abertos", c => c.st !== "resolvido"],
    ["sem-tec", "Sem técnico", c => c.st !== "resolvido" && !c.tec],
    ["prazo", "Fora ou perto do prazo", c => c.st !== "resolvido" && c.prazo.cor === "ri"],
    ["wa", "WhatsApp", c => c.st !== "resolvido" && c.canal === "wa"],
    ["resolvidos", "Resolvidos", c => c.st === "resolvido"],
  ];

  const THREADS = {
    233: [
      { k: "evento", ic: "message-circle", t: "Conversa no WhatsApp virou o <b>CH-0233</b> · IA classificou como P3" },
      { k: "cli", de: "Sr. Antônio · síndico", h: "09:35", t: "Bom dia. A bomba está fazendo um barulho estranho desde ontem à noite, tipo um chiado. A água está chegando normal." },
      { k: "nos", de: "Assistente (IA)", h: "09:35", t: "Bom dia, Sr. Antônio! Registrei o chamado CH-0233. O nível da cisterna está em 42% e a bomba está ligando normalmente. Um técnico vai entrar em contato hoje." },
      { k: "cli", de: "Sr. Antônio · síndico", h: "09:52", t: "Ok, obrigado. Alguém consegue vir antes das 17h? O zelador sai nesse horário." },
    ],
    231: [
      { k: "evento", ic: "radio-tower", t: "Alerta <b>Nível muito baixo</b> (14%) abriu este chamado · P1" },
      { k: "evento", ic: "zap", t: "Bomba de recalque sem corrente desde <b>06:40</b>" },
      { k: "nota", de: "Nota interna · Pedro", h: "09:30", t: "Liguei para o zelador, disse que o disjuntor está ligado. Provável boia ou contator. Mandar alguém com contator reserva." },
    ],
    228: [
      { k: "cli", de: "Dona Marta · zeladora (telefone)", h: "07:02", t: "Vazamento forte no barrilete da cobertura, molhando o hall do último andar." },
      { k: "evento", ic: "user-plus", t: "<b>Carlos Souza</b> assumiu o chamado · 07:20" },
      { k: "evento", ic: "map", t: "Carlos Souza chegou ao local · 09:47" },
      { k: "nota", de: "Nota interna · Carlos Souza", h: "10:05", t: "Registro de gaveta de 2\" com a haste rompida. Fechei a prumada. Vou precisar de orçamento para troca do registro e de dois metros de tubo." },
    ],
  };

  // ═══ UTILITÁRIOS ══════════════════════════════════════════════════════
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const ico = (n, cls = "") => `<i data-lucide="${n}"${cls ? ` class="${cls}"` : ""}></i>`;
  const icones = () => window.lucide && window.lucide.createIcons();
  const corNivel = n => (n < 20 ? "var(--ri-m)" : n < 45 ? "var(--at-m)" : "var(--ok-m)");
  const sitTxt = r => (r.sit === "ok" ? "Normal" : r.motivo);

  let toastT;
  function toast(msg, desfazer) {
    const el = $("#toast");
    el.innerHTML = `<span>${esc(msg)}</span>${desfazer ? `<button type="button" data-desfazer>${"Desfazer"}</button>` : ""}`;
    el.hidden = false;
    el._desfazer = desfazer || null;
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, 4500);
  }
  $("#toast").addEventListener("click", e => {
    if (e.target.closest("[data-desfazer]")) {
      const f = $("#toast")._desfazer; $("#toast").hidden = true; if (f) f();
    }
  });

  // popover genérico
  const pop = $("#pop");
  function abrirPop(ancora, html, onEscolha) {
    pop.innerHTML = html; pop.hidden = false;
    const r = ancora.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(r.right - w, innerWidth - w - 8); left = Math.max(8, left);
    let top = r.bottom + 6; if (top + h > innerHeight - 8) top = r.top - h - 6;
    pop.style.left = left + "px"; pop.style.top = top + "px";
    pop._onEscolha = onEscolha; icones();
  }
  pop.addEventListener("click", e => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    pop.hidden = true; pop._onEscolha && pop._onEscolha(b.dataset.v);
  });
  document.addEventListener("mousedown", e => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("[data-pop]")) pop.hidden = true;
    const um = $("#sbUserMenu");
    if (!um.hidden && !um.contains(e.target) && !e.target.closest("#sbUser")) { um.hidden = true; $("#sbUser").setAttribute("aria-expanded", "false"); }
  });

  // Ponte para a segunda parte da maquete (_redesenho-preview-2.js).
  const MAQ = window.MAQ = { telas: {}, cliques: [], limpar: null, TECNICOS, CONDOS, RES, CHAMADOS, condo,
    $, esc, ico, icones, toast, abrirPop, corNivel, sitTxt };

  // ═══ ROTEADOR ═════════════════════════════════════════════════════════
  const TITULOS = {
    hoje: "Hoje", monitoramento: "Monitoramento", atendimento: "Atendimento", agenda: "Agenda",
    os: "Ordens de serviço", orcamentos: "Orçamentos", financeiro: "Financeiro", condominios: "Condomínios",
    preventivas: "Preventivas", equipamentos: "Equipamentos", relatorios: "Relatórios",
    config: "Configurações", colaboradores: "Colaboradores",
  };
  const estado = { filaF: "tudo", feitos: new Set(), monModo: "lista", monF: "problema", monSel: 11, monBusca: "",
    atVisao: "abertos", atSel: 231, atBusca: "", compor: "wa" };
  let mapa = null;

  function rota() {
    const [pg, arg] = (location.hash.replace(/^#\//, "") || "hoje").split("/");
    const nome = TITULOS[pg] ? pg : "hoje";
    if (nome === "atendimento" && arg) estado.atSel = Number(arg);
    if (nome === "monitoramento" && arg) estado.monSel = Number(arg);
    document.querySelectorAll(".sb-item").forEach(a => a.classList.toggle("is-on", a.dataset.pg === nome));
    $("#mobTitulo").textContent = TITULOS[nome];
    document.title = `GENERAL • ${TITULOS[nome]} (maquete)`;
    $("#app").classList.remove("sb-aberta");
    if (mapa) { mapa.remove(); mapa = null; }
    if (MAQ.limpar) { MAQ.limpar(); MAQ.limpar = null; }
    (MAQ.telas[nome] || { hoje: telaHoje, monitoramento: telaMon, atendimento: telaAt }[nome] || telaPendente)(nome, arg);
    icones();
  }
  window.addEventListener("hashchange", rota);
  const ir = h => { if (location.hash === h) rota(); else location.hash = h; };
  MAQ.ir = ir; MAQ.rota = rota;

  // ═══ HOJE ═════════════════════════════════════════════════════════════
  function telaHoje() {
    const total = RES.length, ok = RES.filter(r => r.sit === "ok").length;
    const mudo = RES.filter(r => r.mudo).length, baixo = RES.filter(r => !r.mudo && r.sit !== "ok").length;
    const dt = new Date(2026, 10, 19).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    $("#pagina").innerHTML = `
      <header class="pg-cab">
        <h1>Hoje</h1><span class="pg-sub">${dt}</span>
        <span class="esp"></span>
        <button class="bt pri" type="button" data-pop="novo">${ico("plus")}Novo ${ico("chevron-down")}</button>
      </header>
      <div class="hoje"><div class="hoje-corpo">

        <section class="carteira" aria-label="Situação da carteira">
          <div class="carteira-frase">
            <span><b>${ok} de ${total}</b> reservatórios normais</span>
            <span><i class="pt ri"></i><b>${mudo}</b> sem sinal</span>
            <span><i class="pt at"></i><b>${baixo}</b> com nível baixo</span>
          </div>
          <div class="barra-carteira" aria-hidden="true">
            <i style="flex:${ok};background:var(--ok-m)"></i>
            <i style="flex:${baixo};background:var(--at-m)"></i>
            <i style="flex:${mudo};background:var(--ri-m)"></i>
          </div>
          <a href="#/monitoramento">Ver monitoramento ${ico("arrow-right")}</a>
        </section>

        <div class="hoje-grade">
          <section class="bloco" aria-labelledby="hFila">
            <div class="bloco-cab"><h2 id="hFila">Precisa de você</h2><span class="n" id="filaN"></span></div>
            <div class="bloco-chips chips" id="filaChips"></div>
            <div id="fila"></div>
          </section>

          <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
            <section class="bloco" aria-labelledby="hCampo">
              <div class="bloco-cab"><h2 id="hCampo">Em campo hoje</h2><span class="esp"></span><a class="bt sm ghost" href="#/agenda">Agenda ${ico("arrow-right")}</a></div>
              ${quadroCampo()}
            </section>
            <section class="bloco" aria-labelledby="hAtiv">
              <div class="bloco-cab"><h2 id="hAtiv">Aconteceu agora há pouco</h2></div>
              <ul class="ativ">${ATIV.map(a => `<li>${ico(a.ic)}<span>${a.t}</span><time>${a.h}</time></li>`).join("")}</ul>
            </section>
          </div>
        </div>
      </div></div>`;
    desenhaFila();
  }

  function desenhaFila() {
    const vivos = FILA.filter(f => !estado.feitos.has(f.id));
    const cont = k => (k === "tudo" ? vivos.length : vivos.filter(f => f.tipo === k).length);
    $("#filaN").textContent = vivos.length;
    $("#filaChips").innerHTML = FILA_F.filter(([k]) => k === "tudo" || cont(k)).map(([k, n]) =>
      `<button class="chip${estado.filaF === k ? " is-on" : ""}" type="button" data-fila-f="${k}">${n} <span class="n">${cont(k)}</span></button>`).join("");
    const lista = vivos.filter(f => estado.filaF === "tudo" || f.tipo === estado.filaF);
    if (!lista.length) {
      $("#fila").innerHTML = `<div class="fila-vazia"><b>Nada esperando por você aqui.</b>Quando um prédio pedir atenção, ele aparece nesta fila.</div>`;
      atualizaBadge(); return;
    }
    let html = "", g = "";
    for (const f of lista) {
      if (f.g !== g) { g = f.g; html += `<div class="fila-grupo">${FILA_G[g]}</div>`; }
      const c = condo(f.c);
      html += `
        <div class="fila-item" data-fila="${f.id}">
          <span class="fila-ic ${f.cor}">${ico(f.ic)}</span>
          <span class="fila-txt">
            <span class="t"><a href="#/condominios/${c.id}">${esc(c.nome)}</a> · ${esc(f.t)}</span>
            <span class="m">${esc(f.m)}</span>
          </span>
          <span class="fila-idade">${f.idade}</span>
          <button class="bt sm" type="button" data-fazer="${f.id}" ${f.faz === "atribuir" ? 'data-pop="tec"' : ""}>${esc(f.acao)}</button>
        </div>`;
    }
    $("#fila").innerHTML = html; icones(); atualizaBadge();
  }

  function concluiFila(id, msg) {
    const el = document.querySelector(`[data-fila="${id}"]`);
    if (el) el.classList.add("sai");
    setTimeout(() => {
      estado.feitos.add(id); desenhaFila();
      toast(msg, () => { estado.feitos.delete(id); desenhaFila(); });
    }, 220);
  }

  function atualizaBadge() {
    const n = FILA.filter(f => !estado.feitos.has(f.id)).length;
    const b = document.querySelector('[data-n="hoje"]'); b.textContent = n; b.hidden = !n;
  }

  function quadroCampo() {
    const pos = h => ((h - 8) / 10) * 100;
    const eixo = [8, 10, 12, 14, 16, 18].map(h => `<span style="left:${pos(h)}%">${h}h</span>`).join("");
    const linhas = CAMPO.map(l => {
      const t = TECNICOS.find(x => x.id === l.t);
      return `<div class="tec">
        <span class="tec-nome"><b>${esc(t.nome)}</b><small>${esc(l.st)}</small></span>
        <div class="trilho-dia">
          ${l.vis.map(v => `<span class="visita ${v.k || ""}" style="left:${pos(v.a)}%;width:${pos(v.b) - pos(v.a)}%"
              title="${esc(condo(v.c).nome)}">${esc(condo(v.c).nome.replace(/^(Ed\.|Cond\.|Res\.) /, ""))}</span>`).join("")}
          <i class="agora-linha" style="left:${pos(AGORA_H)}%"></i>
        </div></div>`;
    }).join("");
    return `<div class="campo-eixo"><div class="horas">${eixo}</div></div>${linhas}
      <div class="campo-legenda">
        <span><i style="background:var(--mar-700)"></i>agora</span>
        <span><i style="background:var(--info-f);border:1px solid rgba(13,39,117,.22)"></i>chamado</span>
        <span><i style="background:var(--ok-f);border:1px solid rgba(16,92,49,.25)"></i>preventiva</span>
        <span><i style="background:var(--cinza-f);border:1px solid var(--fio)"></i>feito</span>
      </div>`;
  }

  // ═══ MONITORAMENTO ════════════════════════════════════════════════════
  const MON_F = [
    ["problema", "Pede atenção", r => r.sit !== "ok"],
    ["mudo", "Sem sinal", r => r.mudo],
    ["baixo", "Nível baixo", r => !r.mudo && r.sit !== "ok"],
    ["todos", "Todos", () => true],
  ];

  function telaMon() {
    $("#pagina").innerHTML = `
      <header class="pg-cab">
        <h1>Monitoramento</h1>
        <span class="pg-sub"><i class="pt ok" style="margin-right:6px"></i>Leituras ao vivo · atualizado há 4 s</span>
        <span class="esp"></span>
        <div class="seg" role="group" aria-label="Modo de ver">
          <button type="button" data-mon-modo="lista" class="${estado.monModo === "lista" ? "is-on" : ""}">${ico("list")}Lista</button>
          <button type="button" data-mon-modo="mapa" class="${estado.monModo === "mapa" ? "is-on" : ""}">${ico("map")}Mapa</button>
        </div>
      </header>
      <div class="pg-barra">
        <div class="chips" id="monChips"></div>
        <span style="flex:1"></span>
        <label class="busca-l">${ico("search")}<input id="monBusca" type="search" placeholder="Filtrar por prédio ou reservatório" value="${esc(estado.monBusca)}"></label>
      </div>
      <div class="dividido${matchMedia("(max-width:860px)").matches && estado.monAbriu ? " com-detalhe" : ""}" id="monDiv">
        <div class="dividido-lista" id="monLista"></div>
        <aside class="painel-lado" id="monLado" aria-label="Reservatório escolhido"></aside>
      </div>`;
    desenhaMon();
  }

  function monFiltrados() {
    const f = MON_F.find(x => x[0] === estado.monF)[2];
    const q = estado.monBusca.trim().toLowerCase();
    return RES.filter(f).filter(r => !q || (condo(r.c).nome + " " + r.nome).toLowerCase().includes(q))
      .sort((a, b) => SIT_ORD[a.sit] - SIT_ORD[b.sit] || a.nivel - b.nivel);
  }

  function desenhaMon() {
    $("#monChips").innerHTML = MON_F.map(([k, n, f]) => {
      const c = RES.filter(f).length;
      const pt = k === "mudo" ? '<i class="pt ri"></i>' : k === "baixo" ? '<i class="pt at"></i>' : "";
      return `<button class="chip${estado.monF === k ? " is-on" : ""}" type="button" data-mon-f="${k}">${pt}${n} <span class="n">${c}</span></button>`;
    }).join("");
    const lista = monFiltrados();
    if (estado.monModo === "lista") {
      $("#monLista").innerHTML = lista.length ? `
        <table class="tab cartoes">
          <thead><tr><th>Reservatório</th><th>Nível</th><th>Última hora</th><th>Bomba</th><th>Último sinal</th><th>Situação</th></tr></thead>
          <tbody>${lista.map(r => {
            const c = condo(r.c);
            return `<tr data-res="${r.id}" class="${r.id === estado.monSel ? "is-sel" : ""}" tabindex="0">
              <td><b>${esc(c.nome)}</b><span class="sub">${esc(r.nome)} · ${esc(c.bairro)}</span></td>
              <td class="c-nivel">${r.mudo ? `<span class="muted">última: ${r.nivel}%</span>` : `<span class="nivel"><span class="nivel-barra"><i style="width:${r.nivel}%;background:${corNivel(r.nivel)}"></i></span><b>${r.nivel}%</b></span>`}</td>
              <td class="c-tend"><span class="tend${r.tend <= -3 ? " cai" : ""}">${r.mudo ? "—" : r.tend === 0 ? "estável" : (r.tend > 0 ? "subiu " : "caiu ") + Math.abs(r.tend) + " pts"}</span></td>
              <td class="c-om">${esc(r.bomba)}</td>
              <td class="c-om"><span class="${r.mudo ? "" : "muted"}" style="${r.mudo ? "color:var(--ri-t);font-weight:600" : ""}">${esc(r.sinal)}</span></td>
              <td class="c-sit"><span class="selo ${r.sit}">${esc(sitTxt(r))}</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table>` : `<div class="ld-vazio">Nenhum reservatório neste filtro. ${estado.monF !== "todos" ? "Isso é bom." : ""}</div>`;
    } else {
      $("#monLista").innerHTML = `<div id="monMapa"></div>`;
      montaMapa(lista);
    }
    desenhaLado();
    icones();
  }

  function montaMapa(lista) {
    if (!window.L) { $("#monMapa").innerHTML = '<div class="ld-vazio">Mapa indisponível.</div>'; return; }
    if (mapa) mapa.remove();
    mapa = L.map("monMapa", { zoomControl: true, attributionControl: true }).setView([-23.555, -46.645], 12);
    L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "© Esri · © OpenStreetMap" }).addTo(mapa);
    const porCondo = new Map();
    for (const r of lista) {
      const atual = porCondo.get(r.c);
      if (!atual || SIT_ORD[r.sit] < SIT_ORD[atual.sit]) porCondo.set(r.c, r);
    }
    const cores = { ri: "#d23a2c", at: "#d99411", ok: "#1f9d57" };
    porCondo.forEach((r, cid) => {
      const c = condo(cid);
      const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${cores[r.sit]}${r.id === estado.monSel ? ";outline:3px solid #071b5c" : ""}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
      L.marker([c.lat, c.lng], { icon, title: c.nome }).addTo(mapa).on("click", () => { selRes(r.id); });
    });
    setTimeout(() => mapa && mapa.invalidateSize(), 50);
  }

  function selRes(id) {
    estado.monSel = id; estado.monAbriu = true;
    history.replaceState(null, "", `#/monitoramento/${id}`);
    document.querySelectorAll("[data-res]").forEach(tr => tr.classList.toggle("is-sel", Number(tr.dataset.res) === id));
    if (estado.monModo === "mapa") montaMapa(monFiltrados());
    $("#monDiv").classList.add("com-detalhe");
    desenhaLado(); icones();
  }

  function grafico(r) {
    // 24 h de leitura sintética, coerente com o nível atual e a tendência
    const n = 48, W = 360, H = 150, pad = { l: 26, r: 6, t: 8, b: 18 };
    const pts = [];
    let v = Math.min(96, r.nivel + 34);
    for (let i = 0; i < n; i++) {
      const fase = i / n;
      const alvo = r.nivel + (1 - fase) * 30 + Math.sin(i / 3.2) * 7;
      v = v * 0.55 + alvo * 0.45;
      pts.push(i === n - 1 ? r.nivel : Math.max(2, Math.min(99, v)));
    }
    if (r.mudo) pts.splice(Math.floor(n * 0.86));
    const x = i => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const y = p => pad.t + (1 - p / 100) * (H - pad.t - pad.b);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
    const area = `${d}L${x(pts.length - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
    const ult = pts.length - 1;
    return `<svg class="graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Nível nas últimas 24 horas">
      <rect x="${pad.l}" y="${y(45)}" width="${W - pad.l - pad.r}" height="${y(20) - y(45)}" fill="rgba(217,148,17,.08)"/>
      <rect x="${pad.l}" y="${y(20)}" width="${W - pad.l - pad.r}" height="${y(0) - y(20)}" fill="rgba(210,58,44,.08)"/>
      ${[0, 20, 45, 100].map(p => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(p)}" y2="${y(p)}" stroke="rgba(6,16,51,${p === 0 || p === 100 ? ".1" : ".2"})" ${p === 20 || p === 45 ? 'stroke-dasharray="3 3"' : ""}/>
        <text x="${pad.l - 4}" y="${y(p) + 3}" text-anchor="end">${p}</text>`).join("")}
      <path d="${area}" fill="rgba(13,39,117,.07)"/>
      <path d="${d}" fill="none" stroke="#0d2775" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(ult)}" cy="${y(pts[ult])}" r="3.5" fill="${r.mudo ? "#a9b2c9" : corNivel(r.nivel)}" stroke="#fff" stroke-width="1.5"/>
      <text x="${pad.l}" y="${H - 4}">ontem 10h</text><text x="${W - pad.r}" y="${H - 4}" text-anchor="end">agora</text>
    </svg>`;
  }

  function desenhaLado() {
    const r = RES.find(x => x.id === estado.monSel);
    const lado = $("#monLado");
    if (!r) { lado.innerHTML = `<div class="ld-vazio">Escolha um reservatório na lista ou no mapa.</div>`; return; }
    const c = condo(r.c);
    const ch = CHAMADOS.find(x => x.c === r.c && x.st !== "resolvido");
    const alertas = r.sit === "ok" ? [] : [{ cor: r.sit, t: r.motivo, s: r.mudo ? `desde ${r.sinal.replace("há ", "")} sem leitura` : `aberto às 09:24 · ${r.nivel}% agora` }];
    lado.innerHTML = `
      <div class="ld-cab">
        <button class="bt sm ghost ld-voltar" type="button" data-mon-voltar style="margin:-4px 0 8px -8px">${ico("arrow-left")}Lista</button>
        <div class="cond">${ico("building-2")}<a href="#/condominios/${c.id}">${esc(c.nome)}</a><span>· ${esc(c.bairro)}</span></div>
        <h2>${esc(r.nome)}</h2>
        <div class="ld-leitura">
          <span class="grande" style="color:${r.mudo ? "var(--muted-2)" : "inherit"}">${r.nivel}%</span>
          <span class="selo ${r.sit}">${esc(sitTxt(r))}</span>
          <span class="muted">${r.mudo ? "última leitura " : "leitura "}${esc(r.sinal)}</span>
        </div>
      </div>
      <div class="ld-sec">
        <h3>Últimas 24 horas<span class="esp"></span><span class="seg"><button class="is-on" type="button">24 h</button><button type="button">7 dias</button><button type="button">30 dias</button></span></h3>
        ${grafico(r)}
      </div>
      <div class="ld-sec">
        <h3>Alertas abertos <span class="n mono muted">${alertas.length}</span></h3>
        ${alertas.length ? alertas.map(a => `<div class="alerta-l"><i class="pt ${a.cor}"></i><div><b>${esc(a.t)}</b><small>${esc(a.s)}</small></div><span></span></div>`).join("") +
          `<div class="acoes" style="margin-top:10px">${ch ? `<a class="bt sm" href="#/atendimento/${ch.id}">${ico("inbox")}Ver CH-0${ch.id}</a>` : `<button class="bt sm pri" type="button" data-mon-chamado>${ico("plus")}Abrir chamado</button>`}<button class="bt sm" type="button" data-mon-resolver>Marcar como resolvido</button></div>`
          : `<p class="muted" style="margin:0">Nenhum alerta. Faixas: baixo abaixo de 45%, crítico abaixo de 20%.</p>`}
      </div>
      <div class="ld-sec">
        <h3>Equipamento</h3>
        <dl class="fatos">
          <div><dt>Bomba</dt><dd>${esc(r.bomba)}</dd></div>
          <div><dt>Sonda</dt><dd>4–20 mA · calibrada</dd></div>
          <div><dt>Aparelho</dt><dd class="mono">GB-${String(r.id).padStart(4, "0")}</dd></div>
          <div><dt>Leitura</dt><dd>a cada 10 s</dd></div>
        </dl>
      </div>
      <div class="ld-sec">
        <h3>Histórico de alertas</h3>
        <div class="alerta-l"><i class="pt cz"></i><div>Nível baixo<small>12/11 · resolvido em 2 h 10 min</small></div><span></span></div>
        <div class="alerta-l"><i class="pt cz"></i><div>Sem sinal<small>03/11 · resolvido em 40 min</small></div><span></span></div>
      </div>`;
  }

  // ═══ ATENDIMENTO ══════════════════════════════════════════════════════
  function telaAt() {
    $("#pagina").innerHTML = `
      <header class="pg-cab">
        <h1>Atendimento</h1><span class="pg-sub">Chamados e conversas do WhatsApp numa caixa só</span>
        <span class="esp"></span>
        <button class="bt pri" type="button" data-novo-chamado>${ico("plus")}Novo chamado</button>
      </header>
      <div class="caixa" id="cx">
        <div class="cx-lista">
          <div class="cx-filtros">
            <label class="busca-l">${ico("search")}<input id="atBusca" type="search" placeholder="Buscar prédio, assunto ou número" value="${esc(estado.atBusca)}"></label>
            <div class="chips" id="atChips"></div>
          </div>
          <div class="cx-itens" id="atItens"></div>
        </div>
        <section class="cx-conversa" id="atConv" aria-label="Chamado aberto"></section>
        <aside class="cx-props" id="atProps" aria-label="Dados do chamado"></aside>
      </div>`;
    desenhaAt();
    if (estado.atAbriu && matchMedia("(max-width:860px)").matches) $("#cx").classList.add("com-detalhe");
  }

  function desenhaAt() {
    $("#atChips").innerHTML = VISOES_AT.map(([k, n, f]) =>
      `<button class="chip${estado.atVisao === k ? " is-on" : ""}" type="button" data-at-v="${k}">${n} <span class="n">${CHAMADOS.filter(f).length}</span></button>`).join("");
    const f = VISOES_AT.find(v => v[0] === estado.atVisao)[2];
    const q = estado.atBusca.trim().toLowerCase();
    const lista = CHAMADOS.filter(f).filter(c => !q || (condo(c.c).nome + " " + c.t + " ch-0" + c.id).toLowerCase().includes(q))
      .sort((a, b) => a.p - b.p || b.prazo.pct - a.prazo.pct);
    $("#atItens").innerHTML = lista.length ? lista.map(c => {
      const tec = TECNICOS.find(t => t.id === c.tec);
      return `<div class="cx-item${c.id === estado.atSel ? " is-sel" : ""}${c.novo ? " nao-lido" : ""}" data-ch="${c.id}" tabindex="0">
        <span class="cx-canal ${c.canal}" title="${CANAL[c.canal].nome}">${ico(CANAL[c.canal].ic)}</span>
        <div style="min-width:0">
          <div class="cx-l1"><span class="cx-cond">${esc(condo(c.c).nome)}</span><time>${c.h}</time></div>
          <span class="cx-t">${esc(c.t)}</span>
          <div class="cx-l3"><span class="prio p${c.p}">P${c.p}</span><span class="prazo ${c.prazo.cor}">${c.prazo.cor !== "ok" ? ico("clock") : ""}${esc(c.prazo.txt)}</span>
            <span style="flex:1"></span>${tec ? `<span class="av is-claro" style="width:22px;height:22px;font-size:9.5px" title="${esc(tec.nome)}">${tec.ini}</span>` : `<span class="muted" style="font-size:12px">sem técnico</span>`}</div>
        </div></div>`;
    }).join("") : `<div class="ld-vazio">Nenhum chamado nesta visão.</div>`;
    desenhaConversa();
    icones();
  }

  function threadDe(c) {
    if (THREADS[c.id]) return THREADS[c.id];
    return [
      { k: "evento", ic: CANAL[c.canal].ic, t: `Chamado aberto por <b>${CANAL[c.canal].nome.toLowerCase()}</b> · P${c.p}` },
      { k: "cli", de: "Zeladoria", h: c.h, t: c.t + "." },
    ];
  }

  function desenhaConversa() {
    const c = CHAMADOS.find(x => x.id === estado.atSel);
    if (!c) { $("#atConv").innerHTML = `<div class="ld-vazio">Escolha um chamado.</div>`; $("#atProps").innerHTML = ""; return; }
    const cd = condo(c.c), tec = TECNICOS.find(t => t.id === c.tec);
    const ord = ["aberto", "atendimento", "resolvido"], at = ord.indexOf(c.st);
    const etapa = (i, n) => `<span class="etapa ${i < at ? "feita" : i === at ? "atual" : ""}"><i class="pt"></i>${n}</span>`;
    const temWa = c.canal === "wa";
    $("#atConv").innerHTML = `
      <div class="cv-cab">
        <button class="ib cv-voltar" type="button" data-at-voltar aria-label="Voltar à lista">${ico("arrow-left")}</button>
        <div style="min-width:0;flex:1">
          <h2>${esc(c.t)}</h2>
          <span class="sub"><span class="mono">CH-0${c.id}</span> · <a href="#/condominios/${cd.id}" style="color:var(--mar-600);font-weight:600">${esc(cd.nome)}</a> · ${CANAL[c.canal].nome}</span>
        </div>
        <button class="bt sm cv-props-bt" type="button" data-at-props>${ico("settings")}Dados</button>
        ${c.st !== "resolvido" ? `<button class="bt sm" type="button" data-pop="os">${ico("clipboard-check")}Gerar O.S.</button>
        <button class="bt sm" type="button" data-at-resolver>${ico("check")}Resolver</button>` : ""}
      </div>
      <div class="etapas">${etapa(0, "Aberto")}${etapa(1, tec ? "Em atendimento · " + tec.nome.split(" ")[0] : "Em atendimento")}${etapa(2, "Resolvido")}</div>
      <div class="fio-conv" id="fioConv">
        ${threadDe(c).map(m => m.k === "evento"
          ? `<span class="evento">${ico(m.ic)}<span>${m.t}</span></span>`
          : `<div class="msg ${m.k === "nos" ? "nos" : m.k === "nota" ? "nota" : ""}"><small>${esc(m.de)} · ${m.h}</small>${esc(m.t)}</div>`).join("")}
      </div>
      ${c.st !== "resolvido" ? `<div class="compor">
        <div class="compor-abas">
          ${temWa ? `<button type="button" data-compor="wa" class="${estado.compor === "wa" ? "is-on" : ""}">Responder no WhatsApp</button>` : ""}
          <button type="button" data-compor="nota" class="${!temWa || estado.compor === "nota" ? "is-on" : ""}">Nota interna</button>
        </div>
        <div class="compor-caixa${!temWa || estado.compor === "nota" ? " is-nota" : ""}">
          <textarea id="composer" rows="2" placeholder="${temWa && estado.compor === "wa" ? "Escreva para o síndico…" : "Só a equipe vê esta nota…"}"></textarea>
          <div class="compor-pe"><button class="ib" type="button" aria-label="Anexar">${ico("paperclip")}</button><span class="esp"></span>
            <button class="bt sm pri" type="button" data-enviar>${ico("send")}${temWa && estado.compor === "wa" ? "Enviar" : "Salvar nota"}</button></div>
        </div></div>` : ""}`;
    const fio = $("#fioConv"); fio.scrollTop = fio.scrollHeight;

    const r = RES.filter(x => x.c === cd.id).sort((a, b) => a.nivel - b.nivel)[0];
    $("#atProps").innerHTML = `
      <div class="prop-sec">
        <h3>Chamado</h3>
        <div class="prop"><span>Prioridade</span><select aria-label="Prioridade">${[1, 2, 3, 4].map(p => `<option ${p === c.p ? "selected" : ""}>P${p} · ${["Crítico", "Alta", "Controlado", "Agendado"][p - 1]}</option>`).join("")}</select></div>
        <div class="prop"><span>Técnico</span><select aria-label="Técnico"><option>Ninguém ainda</option>${TECNICOS.map(t => `<option ${t.id === c.tec ? "selected" : ""}>${t.nome}</option>`).join("")}</select></div>
        <div class="prop" style="align-items:start"><span>Prazo</span><div><span class="prazo ${c.prazo.cor}">${esc(c.prazo.txt)}</span>
          <div class="sla-barra"><i style="width:${c.prazo.pct}%;background:${c.prazo.cor === "ri" ? "var(--ri-m)" : c.prazo.cor === "at" ? "var(--at-m)" : "var(--ok-m)"}"></i></div></div></div>
      </div>
      <div class="prop-sec">
        <h3>Condomínio</h3>
        <div class="mini-condo">
          <a href="#/condominios/${cd.id}">${esc(cd.nome)} ${ico("arrow-right")}</a>
          <span class="muted">${esc(cd.bairro)} · São Paulo</span>
          ${r ? `<span style="display:flex;align-items:center;gap:8px">${esc(r.nome)}: <b class="mono">${r.nivel}%</b><span class="selo ${r.sit}">${esc(sitTxt(r))}</span></span>` : ""}
          <span class="muted">Contrato ativo · preventiva mensal</span>
        </div>
      </div>
      <div class="prop-sec">
        <h3>Ligado a este chamado</h3>
        ${c.id === 228 ? `<div class="ligado">${ico("clipboard-check")}<a href="#/os">O.S. 0415</a><span class="esp"></span><span class="selo info">em andamento</span></div>
          <div class="ligado">${ico("file-text")}<a href="#/orcamentos">Pedir orçamento</a><span class="esp"></span><span class="muted">solicitado pelo técnico</span></div>`
          : `<p class="muted" style="margin:0">Nada ainda. “Gerar O.S.” liga a ordem aqui.</p>`}
      </div>
      ${c.st !== "resolvido" ? `<div class="prop-sec"><button class="bt sm ghost" type="button" style="color:var(--ri-t);margin-left:-8px" data-at-cancelar>Cancelar chamado</button></div>` : ""}`;
  }

  // ═══ TELAS AINDA NÃO DESENHADAS ═══════════════════════════════════════
  const PEND = {
    agenda: ["Quadro de despacho", "Junta a Agenda de hoje, a posição dos técnicos (que hoje mora no Mapa) e a carga por técnico (que hoje mora em Relatórios).",
      ["Semana por técnico, com chamados, preventivas e compromissos da empresa", "Coluna “a agendar”: chamados sem técnico e preventivas do mês", "Mapa com a posição dos técnicos ao lado da grade"]],
    os: ["Lista de ordens de serviço", "Fica como tela própria, com o cabeçalho, os filtros em chip e a lista com detalhe ao lado deste molde.",
      ["Filtros: em andamento, a enviar ao cliente, finalizadas", "O detalhe abre ao lado; a página inteira da O.S. continua para o documento completo"]],
    orcamentos: ["Lista de orçamentos", "Os avulsos e os pedidos dos técnicos viram uma lista só. “Solicitado” passa a ser um estado, não uma aba.",
      ["Estados: solicitado, rascunho, enviado, aprovado, recusado", "A lista termina no “aprovado”; dali em diante é o Financeiro"]],
    financeiro: ["Faturamento", "Junta Notas fiscais, Contratos, a receita mensal (que hoje mora no Painel) e o faturamento das preventivas pelo Omie.",
      ["Aprovados sem nota, notas processando ou com erro, emitidas", "Contratos: ativos, vencendo, vencidos, receita por mês"]],
    condominios: ["Condomínios e a ficha do prédio", "Continua como o eixo: a lista e a ficha com tudo do prédio. Ganha o cabeçalho e os filtros deste molde.", []],
    preventivas: ["Manutenção preventiva", "Continua tela própria, com o cadastro e o acompanhamento do mês juntos, como foi decidido em 04/09.", []],
    equipamentos: ["Equipamentos", "Continua tela própria (oficina, etiquetas QR, devolução), no molde novo.", []],
    relatorios: ["Relatórios", "Fica como está até virar o dashboard. Exportar CSV passa para dentro de cada lista.", []],
    config: ["Configurações", "Sai do menu lateral e vai para o menu do usuário. Na tela, as abas viram um menu à esquerda.", []],
    colaboradores: ["Colaboradores", "Sai do menu lateral e vai para o menu do usuário, ao lado de Configurações.", []],
  };
  function telaPendente(nome) {
    const [t, p, l] = PEND[nome];
    $("#pagina").innerHTML = `
      <header class="pg-cab"><h1>${TITULOS[nome]}</h1><span class="pg-sub">fora desta maquete</span></header>
      <div class="pendente"><div class="pendente-corpo">
        <h2>${esc(t)}</h2><p>${esc(p)}</p>
        ${l.length ? `<ul>${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <p style="margin-top:18px"><a class="bt sm" href="#/hoje">${ico("arrow-left")}Voltar para Hoje</a></p>
      </div></div>`;
  }

  // ═══ BUSCA GLOBAL (Ctrl K) ════════════════════════════════════════════
  const INDICE = [
    ...CONDOS.map(c => ({ g: "Condomínios", ic: "building-2", t: c.nome, s: c.bairro, h: `#/condominios/${c.id}` })),
    ...CHAMADOS.map(c => ({ g: "Chamados", ic: "inbox", t: `CH-0${c.id} · ${c.t}`, s: condo(c.c).nome, h: `#/atendimento/${c.id}` })),
    ...RES.map(r => ({ g: "Reservatórios", ic: "droplet", t: `${condo(r.c).nome} · ${r.nome}`, s: `${r.nivel}%`, h: `#/monitoramento/${r.id}` })),
    { g: "Documentos", ic: "clipboard-check", t: "O.S. 0412", s: "Res. Vila Rica · finalizada", h: "#/os" },
    { g: "Documentos", ic: "file-text", t: "ORC-0142", s: "Ed. Solar do Ipiranga · aprovado", h: "#/orcamentos" },
    { g: "Documentos", ic: "receipt", t: "ORC-0139 · nota fiscal", s: "Ed. Monte Verde · sem nota", h: "#/financeiro" },
    { g: "Ações", ic: "plus", t: "Novo chamado", s: "", h: "#/atendimento", a: "novo-chamado" },
    { g: "Ações", ic: "plus", t: "Novo orçamento", s: "", h: "#/orcamentos" },
    { g: "Ações", ic: "plus", t: "Nova O.S.", s: "", h: "#/os" },
    { g: "Ir para", ic: "sun", t: "Hoje", s: "", h: "#/hoje" },
    { g: "Ir para", ic: "activity", t: "Monitoramento", s: "", h: "#/monitoramento" },
    { g: "Ir para", ic: "settings", t: "Configurações", s: "", h: "#/config" },
  ];
  let cmdkSel = 0, cmdkRes = [];
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function abreCmdk() {
    $("#cmdk").hidden = false; $("#cmdkInput").value = ""; desenhaCmdk(); $("#cmdkInput").focus();
  }
  function fechaCmdk() { $("#cmdk").hidden = true; }
  function desenhaCmdk() {
    const q = norm($("#cmdkInput").value.trim());
    cmdkRes = q ? INDICE.filter(i => norm(i.t + " " + i.s).includes(q)).slice(0, 14)
      : INDICE.filter(i => i.g === "Ações" || i.g === "Ir para" || (i.g === "Chamados" && /231|228|233/.test(i.t)));
    cmdkSel = 0;
    if (!cmdkRes.length) { $("#cmdkLista").innerHTML = `<div class="cmdk-nada">Nada encontrado para “${esc($("#cmdkInput").value)}”.</div>`; return; }
    const realce = t => {
      if (!q) return esc(t);
      const i = norm(t).indexOf(q); if (i < 0) return esc(t);
      return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length));
    };
    let g = "", html = "";
    cmdkRes.forEach((i, n) => {
      if (i.g !== g) { g = i.g; html += `<div class="cmdk-g">${q ? g : g === "Chamados" ? "Recentes" : g}</div>`; }
      html += `<div class="cmdk-it${n === 0 ? " is-on" : ""}" role="option" data-cmdk="${n}">${ico(i.ic)}<span>${realce(i.t)}</span><small>${esc(i.s)}</small></div>`;
    });
    $("#cmdkLista").innerHTML = html; icones();
  }
  function marcaCmdk() {
    document.querySelectorAll(".cmdk-it").forEach(el => el.classList.toggle("is-on", Number(el.dataset.cmdk) === cmdkSel));
    const on = $(".cmdk-it.is-on"); on && on.scrollIntoView({ block: "nearest" });
  }
  function vaiCmdk(n) {
    const i = cmdkRes[n]; if (!i) return; fechaCmdk();
    if (i.h.startsWith("#/monitoramento/")) { estado.monModo = "lista"; estado.monF = "todos"; }
    if (i.h.startsWith("#/atendimento/")) estado.atVisao = CHAMADOS.find(c => c.id === Number(i.h.split("/")[2])).st === "resolvido" ? "resolvidos" : "abertos";
    ir(i.h);
  }
  $("#cmdkInput").addEventListener("input", desenhaCmdk);
  $("#cmdkInput").addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); cmdkSel = Math.min(cmdkRes.length - 1, cmdkSel + 1); marcaCmdk(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cmdkSel = Math.max(0, cmdkSel - 1); marcaCmdk(); }
    else if (e.key === "Enter") { e.preventDefault(); vaiCmdk(cmdkSel); }
  });
  $("#cmdk").addEventListener("click", e => {
    const it = e.target.closest("[data-cmdk]"); if (it) return vaiCmdk(Number(it.dataset.cmdk));
    if (e.target === $("#cmdk")) fechaCmdk();
  });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#cmdk").hidden ? abreCmdk() : fechaCmdk(); }
    else if (e.key === "Escape") { if (!$("#cmdk").hidden) fechaCmdk(); pop.hidden = true; $("#app").classList.remove("sb-aberta"); }
    else if (e.key === "Enter" && e.target.matches("[data-res],[data-ch]")) e.target.click();
  });

  // ═══ EVENTOS (delegação) ══════════════════════════════════════════════
  document.addEventListener("click", e => {
    const t = e.target;
    let el;
    if (t.closest("#sbBusca, #mobBusca")) return abreCmdk();
    if (t.closest("#mobMenu")) return $("#app").classList.add("sb-aberta");
    if (t.closest("#sbFechar, #sbVeu")) return $("#app").classList.remove("sb-aberta");
    if ((el = t.closest("#sbUser"))) {
      const m = $("#sbUserMenu"); m.hidden = !m.hidden; el.setAttribute("aria-expanded", String(!m.hidden)); return;
    }
    if (t.closest("#sbUserMenu a")) { $("#sbUserMenu").hidden = true; }

    // Hoje
    if ((el = t.closest("[data-fila-f]"))) { estado.filaF = el.dataset.filaF; return desenhaFila(); }
    if ((el = t.closest("[data-fazer]"))) {
      const f = FILA.find(x => x.id === el.dataset.fazer);
      if (f.faz === "atribuir") {
        return abrirPop(el, TECNICOS.map((tc, i) => `<button type="button" data-v="${tc.id}"><span class="av is-claro" style="width:22px;height:22px;font-size:9.5px">${tc.ini}</span>${tc.nome}<small>${["em atendimento", "a 18 min", "livre às 14 h"][i]}</small></button>`).join(""),
          v => concluiFila(f.id, `${TECNICOS.find(x => x.id === Number(v)).nome} atribuído ao CH-0231`));
      }
      if (f.faz === "chamado") { estado.atVisao = "abertos"; estado.atAbriu = true; return ir(`#/atendimento/${f.ch}`); }
      return concluiFila(f.id, f.msg);
    }
    if ((el = t.closest('[data-pop="novo"]'))) {
      return abrirPop(el, `<button type="button" data-v="ch">${ico("inbox")}Chamado<small>C</small></button>
        <button type="button" data-v="os">${ico("clipboard-check")}Ordem de serviço</button>
        <button type="button" data-v="orc">${ico("file-text")}Orçamento</button>`,
        v => ir({ ch: "#/atendimento", os: "#/os", orc: "#/orcamentos" }[v]));
    }

    // Monitoramento
    if ((el = t.closest("[data-mon-modo]"))) { estado.monModo = el.dataset.monModo; return telaMon(); }
    if ((el = t.closest("[data-mon-f]"))) { estado.monF = el.dataset.monF; return desenhaMon(); }
    if ((el = t.closest("[data-res]"))) return selRes(Number(el.dataset.res));
    if (t.closest("[data-mon-voltar]")) { estado.monAbriu = false; return $("#monDiv").classList.remove("com-detalhe"); }
    if (t.closest("[data-mon-chamado]")) return toast("Chamado aberto com o prédio e o alerta já preenchidos");
    if (t.closest("[data-mon-resolver]")) return toast("Alerta marcado como resolvido", () => {});

    // Atendimento
    if ((el = t.closest("[data-at-v]"))) {
      estado.atVisao = el.dataset.atV;
      const f = VISOES_AT.find(v => v[0] === estado.atVisao)[2];
      const prim = CHAMADOS.filter(f).sort((a, b) => a.p - b.p)[0];
      if (prim && !f(CHAMADOS.find(c => c.id === estado.atSel))) estado.atSel = prim.id;
      return desenhaAt();
    }
    if ((el = t.closest("[data-ch]"))) {
      const id = Number(el.dataset.ch);
      estado.atSel = id; estado.atAbriu = true;
      const c = CHAMADOS.find(x => x.id === id); c.novo = false;
      history.replaceState(null, "", `#/atendimento/${id}`);
      desenhaAt(); $("#cx").classList.add("com-detalhe"); return;
    }
    if (t.closest("[data-at-voltar]")) { estado.atAbriu = false; return $("#cx").classList.remove("com-detalhe", "com-props"); }
    if (t.closest("[data-at-props]")) return $("#cx").classList.toggle("com-props");
    if ((el = t.closest("[data-compor]"))) { estado.compor = el.dataset.compor; return desenhaConversa(), icones(); }
    if (t.closest("[data-enviar]")) {
      const v = $("#composer").value.trim();
      if (!v) return $("#composer").focus();
      const c = CHAMADOS.find(x => x.id === estado.atSel);
      (THREADS[c.id] = THREADS[c.id] || threadDe(c)).push({ k: c.canal === "wa" && estado.compor === "wa" ? "nos" : "nota",
        de: c.canal === "wa" && estado.compor === "wa" ? "Pedro" : "Nota interna · Pedro", h: "10:21", t: v });
      desenhaConversa(); icones(); return;
    }
    if ((el = t.closest('[data-pop="os"]'))) {
      return abrirPop(el, TECNICOS.map(tc => `<button type="button" data-v="${tc.id}">${ico("clipboard-check")}O.S. para ${tc.nome}</button>`).join(""),
        v => toast(`O.S. 0416 criada para ${TECNICOS.find(x => x.id === Number(v)).nome} e ligada ao chamado`));
    }
    if (t.closest("[data-at-resolver]")) {
      const c = CHAMADOS.find(x => x.id === estado.atSel), antes = c.st;
      c.st = "resolvido"; desenhaAt();
      return toast(`CH-0${c.id} resolvido`, () => { c.st = antes; desenhaAt(); });
    }
    if (t.closest("[data-at-cancelar]")) return toast("Pede o motivo antes de cancelar (como hoje)");
    if (t.closest("[data-novo-chamado]")) return toast("Abre o formulário de novo chamado ao lado da lista");
  });

  document.addEventListener("input", e => {
    if (e.target.id === "monBusca") { estado.monBusca = e.target.value; const pos = e.target.selectionStart; desenhaMon(); const i = $("#monBusca"); i.focus(); i.setSelectionRange(pos, pos); }
    if (e.target.id === "atBusca") { estado.atBusca = e.target.value; const pos = e.target.selectionStart; desenhaAt(); const i = $("#atBusca"); i.focus(); i.setSelectionRange(pos, pos); }
  });

  MAQ.INDICE = INDICE;
  document.addEventListener("DOMContentLoaded", rota);
})();
