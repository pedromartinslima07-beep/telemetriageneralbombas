// operador.js — Painel do operador (/operador/painel), a fila do turno.
//
// Direção e comp: docs/comps/painel-operador-v2.html · fluxo do módulo em
// docs/modulos/painel-operador.md.
//
// ⚠️ NÃO importa nada de `admin.js`. As duas telas mostram os mesmos
// chamados, e a tentação de compartilhar helpers é real — mas foi
// exatamente assim que o painel do cliente virou refém do admin até
// 13/08/2026. Aqui é folha própria, arquivo próprio, ciclo próprio.

/* ── Sessão ──────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}
if (!getToken()) window.location.href = "/login";

// 401 desloga; 403 NÃO. Tratar os dois igual produz o loop silencioso que
// derrubou o painel do cliente em 30/07/2026: o painel abre, a primeira
// chamada leva 403, o front manda pro /login, o login autentica e devolve
// pro mesmo painel — sem nunca mostrar uma mensagem.
(function _redirectSessaoExpirada() {
  const nativo = window.fetch.bind(window);
  let indo = false;
  window.fetch = async function (input, init) {
    const r = await nativo(input, init);
    if (r.status === 401 && init?.headers?.Authorization && !indo) {
      indo = true;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("userRole");
      window.location.href = "/login?motivo=expirado";
    }
    return r;
  };
})();

// Resposta que vem em HTML (413 do body-parser, 404, 502 do proxy) estoura
// `Unexpected token '<'` no `.json()` e esconde o erro real. Aqui a mensagem
// devolvida diz o que de fato aconteceu — mesma função do admin, copiada de
// propósito (ver o aviso no topo).
async function lerJson(resp, contexto) {
  const txt = await resp.text();
  try { return txt ? JSON.parse(txt) : {}; }
  catch {
    const porStatus = {
      403: "Sem permissão para esta ação.",
      404: "Endpoint não encontrado no servidor.",
      413: "Conteúdo grande demais para o servidor.",
      502: "Servidor indisponível no momento.",
      504: "O servidor demorou demais para responder.",
    };
    const base = porStatus[resp.status] || `Resposta inesperada do servidor (HTTP ${resp.status}).`;
    throw new Error(contexto ? `${contexto}: ${base}` : base);
  }
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── Ícones: SVG autoral, um traço só ──────────────────────────────────
   ⚠️ PONTA ESQUADRADA, sempre: `stroke-linecap="square"` e
   `stroke-linejoin="miter"`. O sistema não tem curva fora da lâmpada de
   estado e das engrenagens da marca — o DESIGN.md diz isso em "Shapes", a
   landing declara em CSS e os ícones do `cliente.html` já vinham assim.
   Estes catorze nasceram com `round`, o que arredondava a ponta de todo
   ícone da tela: um traço macio dentro de um mundo de chapa cortada. */
const I = {
  sensor: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/><circle cx="12" cy="12" r="3"/></svg>`,
  balao: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>`,
  agenda: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>`,
  mao: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M12 19V6M12 6 7 11M12 6l5 5"/></svg>`,
  semsensor: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>`,
  rota: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>`,
  mais: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M12 5v14M5 12h14"/></svg>`,
  x: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
};

const ORIGEM = {
  telemetria: { ico: I.sensor, rot: "Telemetria" },
  whatsapp:   { ico: I.balao,  rot: "WhatsApp · IA" },
  preventiva: { ico: I.agenda, rot: "Plano de manutenção" },
  manual:     { ico: I.mao,    rot: "Aberto no painel" },
};

const STATUS_ROT = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  fechado: "Fechado",
};

/* ── A coluna d'água ─────────────────────────────────────────────────────
   A peça é CSS, não SVG — é assim na landing e no painel do cliente, e as
   `defs` do cilindro foram removidas de lá justamente por isso. Cada regra
   do desenho tem par em `landing.css` e `cliente.css`. */
function coluna(r) {
  const mudo = r.mudo || r.nivel_pct == null;
  const est = mudo ? "mudo" : r.banda === "ok" ? "" : r.banda;
  return `<div class="res ${est}">
    <span class="tubo">
      ${mudo ? `<span class="selo-mudo">${I.semsensor}</span>` : `
      <i class="faixa faixa-baixo"></i>
      <i class="faixa faixa-critico"></i>
      <i class="agua" style="--n:${Math.max(0, Math.min(100, r.nivel_pct))}%"><i class="crista"></i></i>
      <i class="limiar limiar-baixo"></i>
      <i class="limiar limiar-critico"></i>`}
    </span>
    <div class="res-num">${mudo ? "—" : Math.round(r.nivel_pct) + "%"}</div>
    <div class="tanque-lbl">${escapar(r.nome)}</div>
  </div>`;
}

/* ── O relógio de SLA ──────────────────────────────────────────────────
   O número vem do SERVIDOR (`resta_min`), não do relógio do navegador: a
   fila é ordenada por ele, e um cliente com a hora errada reordenaria o
   turno inteiro. Aqui só se decide como escrever. */
function relogio(sla) {
  if (!sla) return { txt: "—", rot: "sem SLA", grau: "semsla" };
  const min = sla.resta_min;
  const abs = Math.abs(min);
  const txt = abs >= 1440 ? Math.round(abs / 1440) + "d"
            : abs >= 60 ? Math.floor(abs / 60) + "h" + (abs % 60 ? String(abs % 60).padStart(2, "0") : "")
            : abs + "min";
  if (min < 0) return { txt: "+" + txt, rot: "estourado", grau: "estourado" };
  return {
    txt,
    rot: "até " + (sla.relogio === "chegada" ? "a chegada" : sla.relogio === "primeira resposta" ? "responder" : "estourar"),
    grau: min <= 30 ? "apertado" : min <= 120 ? "atencao" : "folgado",
  };
}

function haQuanto(min) {
  if (min == null) return "";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  const d = Math.round(min / 1440);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

/* ── O item da fila ──────────────────────────────────────────────────── */
function item(c, nova) {
  const r = relogio(c.sla);
  const o = ORIGEM[c.origem] || ORIGEM.manual;
  const condo = c.condominio;

  // A evidência. Com sensor, as colunas d'água. Sem sensor, a descrição —
  // que é a fala de quem relatou — com o mesmo peso visual. Um prédio sem
  // telemetria não é um item pobre: é um item com outra prova.
  //
  // ⚠️ RELATO vs. TEXTO DE MÁQUINA. Origem `manual` e `whatsapp` são conta
  // de gente: alguém digitou (síndico pelo painel dele, ou o operador ao
  // telefone) ou a IA registrou o que foi dito na conversa. Esse texto vai
  // no bloco de fala. `telemetria` e `preventiva` são frases que o sistema
  // escreveu sobre si mesmo — citar isso como se fosse alguém falando seria
  // atribuir fala a ninguém. Por isso as duas formas.
  const relato = c.origem === "manual" || c.origem === "whatsapp";
  const texto = escapar(c.descricao || c.titulo);
  const corpoProva = relato
    ? `<p class="fala">${texto}</p>`
    : `<p class="prova-txt">${texto}</p>`;

  const prova = c.tem_telemetria
    ? `<div class="prova">
         <div class="prova-tanques">${c.reservatorios.map((res) =>
           `<div class="tanque">${coluna(res)}</div>`).join("")}</div>
         ${corpoProva}
       </div>`
    : `<div class="prova" data-sem="1">
         <div>
           ${corpoProva}
           <p class="semtel">${I.semsensor}Prédio sem telemetria instalada</p>
         </div>
       </div>`;

  // As ações ficam em COLUNA PRÓPRIA, no mesmo x em toda a fila. Antes eram
  // o fim de uma linha que variava com o texto, e o operador tinha de
  // procurar o botão em cada item — numa tela de turno isso é o contrário do
  // que se quer. O que despacha vem primeiro porque é a decisão da tela.
  const acoes = c.tecnico
    ? `<span class="emrota">${I.rota}<span><b>${escapar(c.tecnico.nome)}</b>${
         c.chegou_em ? " · no local" : c.a_caminho_em ? " · a caminho" : " · atribuído"}</span></span>
       <button class="btn btn-fio" data-acao="ficha" data-id="${c.id}">Abrir ficha</button>`
    : `<button class="btn" data-acao="despacho" data-id="${c.id}">Despachar</button>
       <button class="btn btn-fio" data-acao="ficha" data-id="${c.id}">Abrir ficha</button>`;

  return `
  <article class="item${nova ? " nova" : ""}" data-sla="${r.grau}" data-andando="${c.tecnico ? 1 : 0}">
    <div class="relogio-sla">
      <span class="sla-n">${r.txt}</span>
      <span class="sla-rot">${r.rot}</span>
    </div>
    <div class="item-corpo">
      <div class="item-topo">
        <span class="num">#${c.id}</span>
        <span class="selo" data-s="${c.prioridade}">${String(c.prioridade).toUpperCase()}</span>
        <h3 class="titulo">${escapar(c.titulo)}</h3>
        <span class="selo selo-fio">${STATUS_ROT[c.status] || c.status}</span>
      </div>
      <div class="onde">
        <b class="onde-nome">${condo ? escapar(condo.nome) : "Sem condomínio vinculado"}</b>${
        condo?.bairro ? `<i></i><span class="onde-bairro">${escapar(condo.bairro)}</span>` : ""}
      </div>
      ${prova}
      <div class="item-pe">
        <span class="origem">${o.ico}${o.rot}<i></i>${haQuanto(c.minutos_abertos)}</span>
      </div>
    </div>
    <div class="item-acoes">${acoes}</div>
  </article>`;
}

/* ── Estado e carga ──────────────────────────────────────────────────── */
let DADOS = { fila: [], tecnicos: [] };
let _ultimoOk = null;

async function carregar() {
  const r = await fetch("/operador/fila", { headers: authHeaders() });
  const d = await lerJson(r, "Fila do turno");
  if (!r.ok) throw new Error(d.error || "Erro ao carregar a fila");
  DADOS = d;
  _ultimoOk = Date.now();
  render();
}

// Quais chamados esta tela já viu. Serve à chegada: item que aparece numa
// recarga acende uma vez. `null` enquanto não houve primeira carga — na
// estreia NADA é novidade, senão a fila inteira pisca ao abrir o painel.
let _vistos = null;

function render() {
  const espera = DADOS.fila.filter((c) => !c.tecnico);
  const andando = DADOS.fila.filter((c) => c.tecnico);
  const estourados = DADOS.fila.filter((c) => c.sla?.estourado).length;
  const novos = _vistos === null
    ? new Set()
    : new Set(DADOS.fila.map((c) => c.id).filter((id) => !_vistos.has(id)));
  _vistos = new Set(DADOS.fila.map((c) => c.id));

  // ⚠️ UMA PLACA dividida por cortes gravados, não três cartões nem uma
  // fileira de KPI. É a resposta do sistema para "três coisas paralelas"
  // (ver `.vigia` na landing): um objeto usinado, com o par `--rasgo` +
  // `--luz` fazendo a divisão. Os rótulos são os mesmos de antes.
  document.getElementById("placar").innerHTML = DADOS.fila.length === 0
    ? `<div class="placar-in"><div class="placar-i" data-t="rota">
         <span class="placar-n">0</span><em>chamados abertos</em></div></div>`
    : `<div class="placar-in">
         <div class="placar-i" data-t="estourado"><span class="placar-n">${estourados}</span><em>com SLA estourado</em></div>
         <div class="placar-i" data-t="fila"><span class="placar-n">${espera.length}</span><em>esperando alguém</em></div>
         <div class="placar-i" data-t="rota"><span class="placar-n">${andando.length}</span><em>com técnico</em></div>
       </div>`;

  const tela = document.getElementById("tela");

  // ⚠️ O dia calmo MANTÉM o trilho da equipe. Ele saía junto com a fila, e a
  // tela virava um cartaz: quem está de turno perdia de vista quem está em
  // campo justamente no momento em que dá para planejar. Fila vazia não é
  // tela vazia.
  const miolo = DADOS.fila.length === 0
    ? `<section class="calmo">
         <h1>Nenhum chamado aberto.</h1>
         <p>A fila está vazia. Quando a telemetria abrir um chamado, ou alguém
            relatar alguma coisa, aparece aqui.</p>
         <div class="calmo-marca"><i></i>Nada pede alguém agora</div>
       </section>`
    : `
    ${espera.length ? `
      <div class="fila-cab"><h2>Esperando alguém</h2>
        <span>${espera.length} chamado${espera.length > 1 ? "s" : ""} · ordenados pelo que estoura primeiro</span></div>
      <div class="fila">${espera.map((c) => item(c, novos.has(c.id))).join("")}</div>` : ""}
    ${andando.length && espera.length ? `<div class="fita" aria-hidden="true"></div>` : ""}
    ${andando.length ? `
      <div class="andando-cab"><h2>Já tem técnico</h2>
        <span>${andando.length} chamado${andando.length > 1 ? "s" : ""}</span></div>
      <div class="fila">${andando.map((c) => item(c, novos.has(c.id))).join("")}</div>` : ""}`;

  tela.innerHTML = `<div class="comB"><div>${miolo}</div>${trilho()}</div>`;
}

function trilho() {
  const t = DADOS.tecnicos || [];
  const emRota = DADOS.fila.filter((c) => c.tecnico);
  return `
  <aside class="trilho">
    <div>
      <h2>Equipe agora</h2>
      ${t.length ? t.map((x) => `
        <div class="tec" data-liv="${x.disponivel && !x.abertos ? 1 : 0}">
          <div class="tec-av">${iniciais(x.nome)}</div>
          <div><div class="tec-nome">${escapar(x.nome)}</div>
            <div class="tec-est">${x.disponivel
              ? (x.abertos ? `${x.abertos} chamado${x.abertos > 1 ? "s" : ""}` : "Disponível")
              : "Indisponível"}</div></div>
          <span class="tec-dist">${x.lat != null ? "no mapa" : "sem GPS"}</span>
        </div>`).join("") : `<p class="vazio-lado">Nenhum técnico ativo.</p>`}
    </div>
    <div>
      <h2>Despachados hoje</h2>
      ${emRota.length ? emRota.map((c) => `
        <div class="tec">
          <div class="tec-av">${I.rota}</div>
          <div><div class="tec-nome">${escapar(c.condominio?.nome || "—")}</div>
            <div class="tec-est">#${c.id} · ${escapar(c.tecnico.nome.split(" ")[0])}</div></div>
        </div>`).join("") : `<p class="vazio-lado">Ninguém despachado ainda.</p>`}
    </div>
  </aside>`;
}

function iniciais(nome) {
  return String(nome || "").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
}

/* ── Os diálogos ─────────────────────────────────────────────────────── */
// De onde o diálogo foi aberto. Sem isto, fechar devolve o foco ao <body> e
// quem navega por teclado recomeça do topo da fila a cada despacho — numa
// tela de turno, é perder o lugar na lista toda vez.
let _focoAnterior = null;

function fechar() {
  const f = document.getElementById("fundo");
  if (!f) return;
  f.remove();
  document.body.classList.remove("com-ficha");
  if (_focoAnterior && _focoAnterior.isConnected) _focoAnterior.focus();
  _focoAnterior = null;
}

const FOCAVEIS = 'button:not([disabled]),select,input,textarea,a[href],[tabindex]:not([tabindex="-1"])';

function abrirFundo(html) {
  _focoAnterior = document.activeElement;
  fechar();
  document.body.insertAdjacentHTML("beforeend",
    `<div class="fundo" id="fundo">${html}</div>`);
  // Trava a fila atrás do diálogo — mesma classe do painel do cliente.
  document.body.classList.add("com-ficha");
  const cx = document.querySelector("#fundo .ficha");
  if (cx) {
    cx.setAttribute("aria-modal", "true");
    cx.tabIndex = -1;
    // O primeiro foco vai para o diálogo, não para o primeiro botão: ler o
    // cabeçalho antes de ouvir "Fechar" é a ordem que faz sentido.
    cx.focus({ preventScroll: true });
  }
}

// Prende o Tab dentro do diálogo enquanto ele estiver aberto.
function _prenderFoco(e) {
  const cx = document.querySelector("#fundo .ficha");
  if (!cx || e.key !== "Tab") return;
  const alvos = [...cx.querySelectorAll(FOCAVEIS)].filter((x) => x.offsetParent !== null);
  if (!alvos.length) return;
  const primeiro = alvos[0], ultimo = alvos[alvos.length - 1];
  if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === cx)) {
    e.preventDefault(); ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault(); primeiro.focus();
  }
}

// Despacho — o mapa é a ferramenta de UMA decisão: quem vai. Aberto o turno
// inteiro seria papel de parede; aberto aqui, é o que responde a pergunta,
// porque a resposta é geográfica.
let _mapa = null;
function dlgDespacho(id) {
  const c = DADOS.fila.find((x) => x.id === id);
  if (!c) return;
  const r = relogio(c.sla);
  const cands = [...DADOS.tecnicos].sort(
    (a, b) => (b.disponivel - a.disponivel) || (a.abertos - b.abertos));

  abrirFundo(`<div class="ficha" role="dialog" aria-label="Despachar técnico">
    <div class="ficha-cab">
      <div>
        <h2>#${c.id} · ${escapar(c.titulo)}</h2>
        <div class="onde" style="margin-top:7px">${escapar(c.condominio?.nome || "—")}<i></i>${r.txt} ${r.rot}</div>
      </div>
      <span class="selo" data-s="${c.prioridade}">${String(c.prioridade).toUpperCase()}</span>
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar">${I.x}</button>
    </div>
    <div class="ficha-corpo">
      <div class="mapa" id="mapa"></div>
      <div class="escolha">
        <h3>Quem pode ir</h3>
        ${cands.length ? cands.map((t) => `
          <button class="cand" data-liv="${t.disponivel && !t.abertos ? 1 : 0}"
                  data-acao="escolher" data-tec="${t.id}" data-chamado="${c.id}">
            <div class="tec-av">${iniciais(t.nome)}</div>
            <div class="cand-quem"><div class="cand-nome">${escapar(t.nome)}</div>
              <div class="cand-est">${t.disponivel
                ? "Disponível" + (t.lat != null ? " · no mapa" : " · sem GPS")
                : "Indisponível"}</div></div>
            <div class="cand-eta"><b>${t.abertos}</b><span>${
              t.abertos === 1 ? "chamado" : "chamados"}</span></div>
          </button>`).join("") : `<p class="vazio-lado">Nenhum técnico ativo para despachar.</p>`}
      </div>
    </div>
    <div class="ficha-pe">
      <p>Atribuir o técnico marca a primeira resposta e para o relógio do TTFR.
         <b>“Em atendimento” não é daqui</b> — só o app do técnico seta esse
         status, com GPS.</p>
      <button class="btn btn-fio" data-acao="fechar">Cancelar</button>
    </div>
  </div>`);

  montarMapa(c);
}

function montarMapa(c) {
  const el = document.getElementById("mapa");
  if (!el) return;
  // Leaflet fora do ar (arquivo não carregou, rede bloqueada) deixava 326px
  // de buraco preto sem uma palavra. Diz o que houve, como qualquer outro
  // estado desta tela.
  if (typeof L === "undefined") {
    el.innerHTML = `<p class="mapa-vazio">O mapa não carregou. A escolha do técnico ao lado continua valendo.</p>`;
    return;
  }
  const alvo = c.condominio?.lat != null && c.condominio?.lng != null
    ? [c.condominio.lat, c.condominio.lng] : null;
  const comGps = DADOS.tecnicos.filter((t) => t.lat != null && t.lng != null);

  // Sem coordenada do prédio E sem ninguém no mapa não há mapa a desenhar:
  // um Leaflet centrado no oceano é pior que uma frase.
  if (!alvo && !comGps.length) {
    el.innerHTML = `<p class="mapa-vazio">Sem posição do prédio e sem técnico com GPS ativo agora.</p>`;
    return;
  }

  _mapa = L.map(el, { zoomControl: false })
    .setView(alvo || [comGps[0].lat, comGps[0].lng], 12);
  // Tiles direto do OSM, como no admin: o proxy do backend dava rate-limit no
  // IP da Railway (ver o comentário em `_criarTileLayer`, admin.js).
  const camada = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { subdomains: "abc", maxZoom: 19, className: "map-tiles-dark",
      attribution: "© OpenStreetMap" }).addTo(_mapa);
  // Tile que falha fica PRETA para sempre — o Leaflet não repete o pedido.
  // Mesma correção do admin, e aqui pesa mais: o mapa existe para uma decisão
  // de despacho, e um buraco preto pode ser exatamente onde está o técnico.
  camada.on("tileerror", (e) => {
    const img = e.tile;
    if (!img || !img.src) return;
    const n = (Number(img.dataset.tentativa) || 0) + 1;
    if (n > 3) return;
    img.dataset.tentativa = String(n);
    const base = img.src.split("?")[0];
    setTimeout(() => { if (img.isConnected) img.src = `${base}?r=${n}`; }, 400 * n);
  });

  const pontos = [];
  if (alvo) {
    pontos.push(alvo);
    L.marker(alvo, { icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div class="pin pin-predio">${String(c.prioridade).toUpperCase()}</div>` }) }).addTo(_mapa);
  }
  comGps.forEach((t) => {
    pontos.push([t.lat, t.lng]);
    L.marker([t.lat, t.lng], { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="pin pin-tec" data-liv="${t.disponivel && !t.abertos ? 1 : 0}">${iniciais(t.nome)}</div>` }) })
      .addTo(_mapa);
    // A linha do candidato livre até o prédio: a decisão desenhada.
    if (alvo && t.disponivel && !t.abertos) {
      // A cor sai da folha, não de um hex repetido aqui: `--ok` mudou de valor
      // uma vez no sistema e o mapa é o tipo de lugar onde a cópia sobrevive.
      const verde = getComputedStyle(document.documentElement)
        .getPropertyValue("--ok").trim() || "#63d8a0";
      L.polyline([[t.lat, t.lng], alvo],
        { color: verde, weight: 1.5, opacity: .5, dashArray: "4 5" }).addTo(_mapa);
    }
  });
  if (pontos.length > 1) _mapa.fitBounds(L.latLngBounds(pontos).pad(.26));
}

async function despachar(chamadoId, tecnicoId) {
  const btn = document.querySelector(`[data-acao="escolher"][data-tec="${tecnicoId}"]`);
  if (btn) { btn.disabled = true; btn.style.opacity = ".5"; }
  try {
    const r = await fetch(`/chamados/${chamadoId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ tecnico_id: tecnicoId }),
    });
    const d = await lerJson(r, "Despachar");
    if (!r.ok) throw new Error(d.error || "Erro ao despachar");
    fechar();
    await carregar();
  } catch (e) {
    avisar(e.message);
    if (btn) { btn.disabled = false; btn.style.opacity = ""; }
  }
}

// Ficha do chamado: a linha do tempo completa. É o que o operador lê antes
// de ligar para o técnico — o que já foi tentado e por quem.
async function dlgFicha(id) {
  abrirFundo(`<div class="ficha" role="dialog" aria-label="Ficha do chamado">
    <div class="ficha-cab"><div><h2>Carregando…</h2></div>
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar">${I.x}</button></div></div>`);
  try {
    const [rc, rh] = await Promise.all([
      fetch(`/chamados/${id}`, { headers: authHeaders() }),
      fetch(`/chamados/${id}/historico`, { headers: authHeaders() }),
    ]);
    const c = await lerJson(rc, "Chamado");
    if (!rc.ok) throw new Error(c.error || "Erro ao carregar o chamado");
    const hist = rh.ok ? await lerJson(rh, "Histórico") : [];
    const naFila = DADOS.fila.find((x) => x.id === id);

    abrirFundo(`<div class="ficha" role="dialog" aria-label="Ficha do chamado">
      <div class="ficha-cab">
        <div>
          <h2>#${c.id} · ${escapar(c.titulo)}</h2>
          <div class="onde" style="margin-top:7px">${escapar(c.condominio_nome || naFila?.condominio?.nome || "—")}</div>
        </div>
        <span class="selo" data-s="${c.prioridade}">${String(c.prioridade).toUpperCase()}</span>
        <span class="selo selo-fio">${STATUS_ROT[c.status] || c.status}</span>
        <button class="ficha-x" data-acao="fechar" aria-label="Fechar">${I.x}</button>
      </div>
      <div class="ficha-pane">
        <div class="linha-tempo">
          ${(Array.isArray(hist) && hist.length) ? hist.map((h) => `
            <div class="ev">
              <span class="ev-h">${hora(h.criado_em)}</span>
              <span class="ev-t">${escapar(h.descricao || h.campo || "alteração")}</span>
            </div>`).join("") : `<p class="vazio-lado">Nada registrado além da abertura.</p>`}
        </div>
        <div class="ficha-lado">
          <div>
            <h4>O chamado</h4>
            <div class="dado"><span>Origem</span><b>${(ORIGEM[naFila?.origem] || ORIGEM.manual).rot}</b></div>
            <div class="dado"><span>Categoria</span><b>${escapar(c.categoria || "—")}</b></div>
            <div class="dado"><span>Aberto</span><b>${hora(c.criado_em)} · ${haQuanto(naFila?.minutos_abertos)}</b></div>
            <div class="dado"><span>Técnico</span><b>${escapar(c.tecnico_nome || "sem técnico")}</b></div>
          </div>
          <div>
            <h4>O prédio</h4>
            <div class="dado"><span>Telemetria</span><b>${naFila?.tem_telemetria ? "Instalada" : "Não instalada"}</b></div>
            ${(naFila?.reservatorios || []).map((r) => `
              <div class="dado"><span>${escapar(r.nome)}</span><b>${r.mudo ? "sem leitura" : Math.round(r.nivel_pct) + "%"}</b></div>`).join("")}
          </div>
        </div>
      </div>
      <div class="ficha-pe">
        <p>${escapar(c.descricao || "")}</p>
        <button class="btn btn-fio" data-acao="fechar">Fechar</button>
      </div>
    </div>`);
  } catch (e) {
    avisar(e.message);
    fechar();
  }
}

function hora(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// Novo chamado: o que chega por telefone precisa de porta de entrada. O
// operador passa em `adminOnly`, que cobre POST /chamados.
function dlgNovo() {
  const condos = [...new Map(DADOS.fila
    .filter((c) => c.condominio)
    .map((c) => [c.condominio.id, c.condominio])).values()];

  abrirFundo(`<div class="ficha" style="width:min(660px,100%)" role="dialog" aria-label="Novo chamado">
    <div class="ficha-cab">
      <div><h2>Novo chamado</h2>
        <div class="onde" style="margin-top:7px">Nasce aberto, sem técnico</div></div>
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar">${I.x}</button>
    </div>
    <form class="form" id="formNovo">
      <div class="campo largo">
        <label for="nvCondo">Prédio</label>
        <select id="nvCondo" required>
          <option value="">Carregando…</option>
        </select>
      </div>
      <div class="campo">
        <label for="nvCat">Categoria</label>
        <select id="nvCat">
          <option value="vazamento">Vazamento</option>
          <option value="bomba_falha">Falha de bomba</option>
          <option value="nivel_baixo">Nível baixo</option>
          <option value="sem_agua">Sem água</option>
          <option value="ruido">Ruído</option>
          <option value="manutencao">Manutenção</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <div class="campo">
        <label>Prioridade</label>
        <div class="prio-fila" id="nvPrio">
          <button type="button" class="prio" data-p="p1" aria-pressed="false">P1</button>
          <button type="button" class="prio" data-p="p2" aria-pressed="true">P2</button>
          <button type="button" class="prio" data-p="p3" aria-pressed="false">P3</button>
          <button type="button" class="prio" data-p="p4" aria-pressed="false">P4</button>
        </div>
      </div>
      <div class="campo largo">
        <label for="nvTitulo">Título</label>
        <input id="nvTitulo" required maxlength="120" placeholder="Uma linha que o técnico lê na lista dele">
      </div>
      <div class="campo largo">
        <label for="nvDesc">O que foi relatado</label>
        <textarea id="nvDesc" placeholder="Escreva com as palavras de quem ligou. O técnico lê isto antes de sair."></textarea>
      </div>
      <p class="dica">A prioridade define o SLA: <b>P1 ≤ 3h</b> de chegada, P2 24–48h,
        P3 ≤ 72h, P4 conforme agenda. Na dúvida entre dois níveis, prevalece o maior.</p>
    </form>
    <div class="ficha-pe">
      <p id="nvMsg"></p>
      <button class="btn btn-fio" data-acao="fechar">Cancelar</button>
      <button class="btn" data-acao="salvar-novo">Abrir chamado</button>
    </div>
  </div>`);

  // A lista de prédios não pode sair só da fila: um chamado novo costuma ser
  // num prédio que NÃO tem chamado aberto — que é justamente o que não está
  // na fila. Busca a lista completa.
  fetch("/condominios", { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : condos))
    .then((lista) => {
      const sel = document.getElementById("nvCondo");
      if (!sel) return;
      const arr = Array.isArray(lista) ? lista : condos;
      sel.innerHTML = `<option value="">Selecione o prédio…</option>` + arr
        .map((c) => `<option value="${c.id}">${escapar(c.nome_fantasia || c.nome)}</option>`)
        .join("");
    })
    .catch(() => {
      const sel = document.getElementById("nvCondo");
      if (sel) sel.innerHTML = `<option value="">Não foi possível carregar os prédios</option>`;
    });
}

async function salvarNovo() {
  const condominio_id = Number(document.getElementById("nvCondo")?.value);
  const titulo = document.getElementById("nvTitulo")?.value.trim();
  const descricao = document.getElementById("nvDesc")?.value.trim();
  const categoria = document.getElementById("nvCat")?.value;
  const prioridade = document.querySelector('#nvPrio .prio[aria-pressed="true"]')?.dataset.p || "p2";
  const msg = document.getElementById("nvMsg");

  if (!condominio_id) { if (msg) msg.textContent = "Escolha o prédio."; return; }
  if (!titulo) { if (msg) msg.textContent = "Escreva um título."; return; }

  try {
    const r = await fetch("/chamados", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ condominio_id, titulo, descricao, categoria, prioridade }),
    });
    const d = await lerJson(r, "Novo chamado");
    if (!r.ok) throw new Error(d.error || "Erro ao abrir o chamado");
    fechar();
    await carregar();
  } catch (e) {
    if (msg) msg.textContent = e.message;
  }
}

// Aviso de erro: uma faixa, não um alert(). `alert` trava a tela inteira, e
// numa tela de turno isso significa parar de receber.
function avisar(texto) {
  document.getElementById("aviso")?.remove();
  document.body.insertAdjacentHTML("beforeend",
    `<div class="aviso" id="aviso" role="alert">${escapar(texto)}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), 6000);
}

/* ── Eventos ─────────────────────────────────────────────────────────── */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-acao]");
  if (b) {
    const a = b.dataset.acao;
    if (a === "fechar") return fechar();
    if (a === "novo") return dlgNovo();
    if (a === "ficha") return dlgFicha(Number(b.dataset.id));
    if (a === "despacho") return dlgDespacho(Number(b.dataset.id));
    if (a === "salvar-novo") return salvarNovo();
    if (a === "escolher") return despachar(Number(b.dataset.chamado), Number(b.dataset.tec));
  }
  const prio = e.target.closest(".prio");
  if (prio) {
    prio.parentElement.querySelectorAll(".prio").forEach((x) => x.setAttribute("aria-pressed", "false"));
    prio.setAttribute("aria-pressed", "true");
    return;
  }
  if (e.target.id === "fundo") fechar();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return fechar();
  _prenderFoco(e);
});

/* ── Boot e o relógio da barra ───────────────────────────────────────────
   ⚠️ `setTimeout` recursivo, não `setInterval` — o padrão do projeto. Com
   `setInterval`, uma request lenta empilha a próxima e o painel passa a
   disparar em rajada. */
const INTERVALO_MS = 30000;

function tique() {
  const el = document.getElementById("relogio");
  if (el) {
    const d = new Date();
    el.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  // O pulso é a prova de que a tela está viva. Se a última carga falhou, ele
  // deixa de ser verde — numa tela de turno, silêncio e falha não podem se
  // parecer.
  const p = document.getElementById("pulso");
  if (p) {
    // ⚠️ Três estados, não dois. Antes da PRIMEIRA resposta o pulso é neutro:
    // ele nascia vermelho e ficava assim até a carga chegar, então todo boot
    // abria com "verifique a conexão" aceso — alarme falso na tela cuja única
    // função é avisar de verdade.
    const estado = _ultimoOk === null ? "esperando"
      : (Date.now() - _ultimoOk) > INTERVALO_MS * 3 ? "parado" : "vivo";
    const rot = { esperando: "Buscando a fila…", parado: "Sem atualizar — verifique a conexão", vivo: "Recebendo" }[estado];
    p.dataset.estado = estado;
    p.title = rot;
    p.setAttribute("aria-label", rot);
  }
}

async function laco() {
  try { await carregar(); }
  catch (e) { avisar(e.message); }
  // O pulso reflete a carga que acabou de acontecer, não a de 20s atrás: sem
  // isto o painel abre e fica até 20 segundos mostrando o estado anterior.
  finally { tique(); setTimeout(laco, INTERVALO_MS); }
}

(async () => {
  try {
    const r = await fetch("/admin/me", { headers: authHeaders() });
    if (r.ok) {
      const me = await r.json();
      const c = document.getElementById("conta");
      if (c) { c.textContent = iniciais(me.nome || "?"); c.title = me.nome || ""; }
    }
  } catch { /* a conta é enfeite da barra; não bloqueia o turno */ }
})();

/* A barra ganha fundo sólido e fio ao rolar; em repouso ela não pesa sobre o
   campo. Mesmo limiar (12px) e mesma classe da landing e do painel do
   cliente — as três barras trocam de estado na mesma rolagem. Aqui faltava,
   e a barra vivia opaca com o fio já desenhado. */
addEventListener("scroll", () => {
  document.querySelector(".barra")?.classList.toggle("is-rolada", scrollY > 12);
}, { passive: true });

tique();
setInterval(tique, 20000);
laco();
