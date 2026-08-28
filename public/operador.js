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
  // Os dois do botão de tela cheia do mapa. Mesmas setas do `mp-fs-btn` do
  // admin, redesenhadas no traço desta folha: ponta quadrada e junta em
  // esquadro, nunca arredondada.
  expandir: `<svg class="ico-entra" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
  recolher: `<svg class="ico-sai" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`,
};

const ORIGEM = {
  telemetria: { ico: I.sensor, rot: "Telemetria" },
  whatsapp:   { ico: I.balao,  rot: "WhatsApp · IA" },
  preventiva: { ico: I.agenda, rot: "Plano de manutenção" },
  manual:     { ico: I.mao,    rot: "Aberto no painel" },
};

/* ⚠️ A PRIORIDADE MANTÉM A SIGLA E GANHA A PALAVRA — decisão do Pedro em
   28/08/2026 (docs/vocabulario.md): "P1" é vocabulário do ramo, a equipe fala
   assim, então trocar por "Crítico" puro tiraria a referência que eles usam.
   Mas sozinha ela não diz nada a quem é novo. Os nomes são os mesmos do
   `_chPrioNome` do admin — as duas telas mostram os mesmos chamados e não
   podem chamar a mesma coisa de dois jeitos. */
const PRIO_ROT = { p1: "Crítico", p2: "Alta", p3: "Controlado", p4: "Agendado" };

function prioRot(p) {
  const k = String(p || "").toLowerCase();
  return PRIO_ROT[k] ? `${k.toUpperCase()} ${PRIO_ROT[k]}` : String(p || "").toUpperCase();
}

const STATUS_ROT = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  fechado: "Fechado",
};

/* ⚠️ A ficha mostrava a CHAVE DO BANCO ("nivel_baixo", "bomba_falha") no
   campo Categoria — e no mesmo arquivo, o `<select>` de "Novo chamado" já
   escrevia "Nível baixo" e "Falha de bomba". A mesma tela dizia o valor de
   dois jeitos: o humano quando o operador digita, o cru quando ele lê.
   Os rótulos são os do `_chCatNome` do admin, acrescidos das duas variantes
   que a API devolve e que lá não estão mapeadas.
   A saída sem correspondência não fica crua: `_` vira espaço e a primeira
   letra sobe — categoria nova no backend aparece legível antes de alguém
   lembrar de vir aqui. */
const CATEGORIA_ROT = {
  vazamento: "Vazamento",
  bomba_falha: "Falha de bomba",
  bomba: "Bomba",
  nivel_baixo: "Nível baixo",
  sem_agua: "Sem água",
  hidraulica: "Hidráulica",
  eletrica: "Elétrica",
  ruido: "Ruído",
  manutencao: "Manutenção",
  preventiva: "Preventiva",
  outro: "Outro",
};

function categoriaRot(c) {
  if (!c) return "—";
  if (CATEGORIA_ROT[c]) return CATEGORIA_ROT[c];
  const t = String(c).replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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
  if (!sla) return { txt: "—", rot: "sem prazo definido", grau: "semsla" };
  const min = sla.resta_min;
  const abs = Math.abs(min);
  const txt = abs >= 1440 ? Math.round(abs / 1440) + "d"
            : abs >= 60 ? Math.floor(abs / 60) + "h" + (abs % 60 ? String(abs % 60).padStart(2, "0") : "")
            : abs + "min";
  // ⚠️ AS PALAVRAS DA RÉGUA saem do glossário (docs/vocabulario.md): quem
  // está nesta tela não é do ramo de software. "estourado" é gíria de sistema
  // de chamado; "atrasado" qualquer pessoa entende. E "até estourar" virou
  // "para vencer", que é como se fala de prazo em português.
  if (min < 0) return { txt: txt, rot: "atrasado", grau: "estourado" };
  return {
    txt,
    rot: sla.relogio === "chegada" ? "para o técnico chegar"
       : sla.relogio === "primeira resposta" ? "para responder"
       : "para vencer",
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
  // ⚠️ UMA AÇÃO EM DESTAQUE, NÃO DUAS. Até 28/08 o item tinha "Despachar" e
  // "Abrir ficha" com o mesmo peso e o mesmo tamanho, lado a lado: cinco itens
  // na tela viravam DEZ botões, e cada um pedia uma escolha antes da decisão
  // de verdade. Quem opera aqui tem pouca familiaridade com computador, e dois
  // botões iguais são duas perguntas.
  // A ficha continua a um clique — vira LINK, não botão. Nada foi removido:
  // mudou o peso, que é o que diz qual das duas coisas é a ação.
  const acoes = c.tecnico
    ? `<span class="emrota">${I.rota}<span><b>${escapar(c.tecnico.nome)}</b>${
         c.chegou_em ? " · no local" : c.a_caminho_em ? " · a caminho" : " · atribuído"}</span></span>
       <button class="link-ficha" data-acao="ficha" data-id="${c.id}">Ver detalhes</button>`
    : `<button class="btn" data-acao="despacho" data-id="${c.id}">Despachar</button>
       <button class="link-ficha" data-acao="ficha" data-id="${c.id}">Ver detalhes</button>`;

  return `
  <article class="item${nova ? " nova" : ""}" data-sla="${r.grau}" data-andando="${c.tecnico ? 1 : 0}">
    <!-- ⚠️ A PRIORIDADE MORA NA RÉGUA, junto do relógio. As duas dizem a mesma
         coisa — QUÃO URGENTE É — e estavam em lugares diferentes: o tempo à
         esquerda, o selo no meio da linha do título, empurrando o título para a
         direita e fazendo cada item começar num x diferente. Juntas, a coluna
         da esquerda responde "urgência" sozinha e o título passa a abrir a
         linha, sempre no mesmo lugar. -->
    <div class="relogio-sla">
      <span class="sla-n">${r.txt}</span>
      <span class="sla-rot">${r.rot}</span>
      <span class="selo" data-s="${c.prioridade}">${prioRot(c.prioridade)}</span>
    </div>
    <div class="item-corpo">
      <!-- O TÍTULO ABRE O ITEM. Antes vinha depois do número do chamado e do
           selo de prioridade; era a terceira coisa da linha sendo a primeira em
           importância. -->
      <h3 class="titulo">${escapar(c.titulo)}</h3>
      <!-- ⚠️ SAÍRAM DA FACE DO ITEM (e continuam na ficha, todos): o selo de
           status, a origem e o bairro. O status era ruído puro — nesta seção
           TODO item está "Aberto", e na de baixo o nome do técnico já diz mais.
           A origem e o bairro são contexto, não decisão. O número do chamado
           ficou, porque é por ele que se acha o item quando o técnico liga —
           mas no fim da linha, não na frente do título. -->
      <div class="onde">
        <b class="onde-nome">${condo ? escapar(condo.nome) : "Sem condomínio vinculado"}</b>
        <span class="num">#${c.id} · ${haQuanto(c.minutos_abertos)}</span>
      </div>
      ${prova}
      <div class="item-acoes">${acoes}</div>
    </div>
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
  // ⚠️ NO DIA CALMO A CHAPA TEM UMA COLUNA, não três. O grid é fixo em
  // `repeat(3,1fr)`, então a célula única caía no primeiro terço e sobravam
  // 2/3 de chapa vazia atravessando a tela — 96% de vazio, medido. `data-so`
  // é o que a folha usa para fechar a placa no tamanho do que ela tem a
  // dizer.
  document.getElementById("placar").innerHTML = DADOS.fila.length === 0
    ? `<div class="placar-in" data-so="1"><div class="placar-i" data-t="rota">
         <span class="placar-n">0</span><em>chamados abertos</em></div></div>`
    : `<div class="placar-in">
         <div class="placar-i" data-t="estourado"><span class="placar-n">${estourados}</span><em>fora do prazo</em></div>
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

  // ⚠️ O MAPA ENTRA DEPOIS, E POR MOVIMENTO, NÃO POR HTML. A linha acima
  // acabou de destruir tudo que havia no `#tela`; o mapa sobrevive porque
  // nunca esteve lá dentro. `replaceWith` move o nó guardado para o lugar do
  // slot, preservando a instância do Leaflet, o zoom e o pan.
  const slot = document.getElementById("slotMapa");
  if (slot) slot.replaceWith(mapaTurnoNo());
  montarMapaTurno();
}

function trilho() {
  const t = DADOS.tecnicos || [];
  const emRota = DADOS.fila.filter((c) => c.tecnico);
  return `
  <aside class="trilho">
    <!-- O slot do mapa. O elemento de verdade e persistente e vive fora do
         ciclo de render (ver mapaTurnoNo); aqui fica so o lugar dele, que o
         render troca pelo no guardado. Sem isso o mapa seria recriado a cada
         30 segundos e perderia o enquadramento do operador. -->
    <div id="slotMapa"></div>
    <div class="trilho-listas">
    <!-- ⚠️ NUNCA use crase dentro deste template literal, nem em comentário:
         a crase FECHA a string e o que vem depois vira tagged template. Foi
         o que aconteceu aqui em 28/08 e o sintoma engana — "X is not a
         function", sem erro de sintaxe, com node --check passando limpo, e a
         tela parada em "Carregando a fila do turno...". Nomes de classe aqui
         vão sem marcação.
         ⚠️ A div.chapa NÃO é um card a mais: é o que faz os cartõezinhos
         PARAREM de existir. Cada técnico era uma caixa própria, com fio de
         1px e 6px de respiro, sobre um fundo quase da mesma cor — quatro
         retângulos pálidos empilhados, que é exatamente a "parede de cards"
         que o DESIGN.md recusa como estrutura. Agora é UMA chapa, com a
         mesma construção da placa do turno e do instrumento da landing
         (anel de 1,5px + gradiente), dividida por cortes gravados. Mesmo
         conteúdo, mesmas palavras: o que mudou é que virou uma peça só. -->
    <div>
      <h2>Equipe agora</h2>
      ${t.length ? `<div class="chapa">${t.map((x) => `
        <div class="tec" data-liv="${x.disponivel && !x.abertos ? 1 : 0}">
          <div class="tec-av">${iniciais(x.nome)}</div>
          <div><div class="tec-nome">${escapar(x.nome)}</div>
            <div class="tec-est">${x.disponivel
              ? (x.abertos ? `${x.abertos} chamado${x.abertos > 1 ? "s" : ""}` : "Livre agora")
              : "Ocupado"}</div></div>
          <span class="tec-dist">${x.lat != null ? "no mapa" : "sem posição"}</span>
        </div>`).join("")}</div>` : `<p class="vazio-lado">Nenhum técnico ativo.</p>`}
    </div>
    <div>
      <h2>Despachados hoje</h2>
      ${emRota.length ? `<div class="chapa">${emRota.map((c) => `
        <div class="tec">
          <div class="tec-av">${I.rota}</div>
          <div><div class="tec-nome">${escapar(c.condominio?.nome || "—")}</div>
            <div class="tec-est">#${c.id} · ${escapar(c.tecnico.nome.split(" ")[0])}</div></div>
        </div>`).join("")}</div>` : `<p class="vazio-lado">Ninguém despachado ainda.</p>`}
    </div>
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
      <span class="selo" data-s="${c.prioridade}">${prioRot(c.prioridade)}</span>
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
                ? "Livre agora" + (t.lat != null ? " · no mapa" : " · sem posição")
                : "Ocupado"}</div></div>
            <div class="cand-eta"><b>${t.abertos}</b><span>${
              t.abertos === 1 ? "chamado" : "chamados"}</span></div>
          </button>`).join("") : `<p class="vazio-lado">Nenhum técnico ativo para despachar.</p>`}
      </div>
    </div>
    <div class="ficha-pe">
      <p>Atribuir o técnico marca a primeira resposta e para esse relógio.
         <b>“Em atendimento” não é daqui</b> — só o app do técnico seta esse
         status, com GPS.</p>
      <button class="btn btn-fio" data-acao="fechar">Cancelar</button>
    </div>
  </div>`);

  montarMapa(c);
}

/* ── A camada de tiles ───────────────────────────────────────────────────
   Compartilhada pelos DOIS mapas da tela (o do turno, no trilho, e o do
   diálogo de despacho). Estava escrita uma vez só porque só havia um mapa;
   com dois, copiar seria garantir que divergissem no primeiro ajuste — e o
   ajuste que existe aqui (reenvio de tile) foi caro de descobrir.
   Tiles direto do OSM, como no admin: o proxy `/tiles` do backend dava
   rate-limit no IP da Railway (ver `_criarTileLayer`, admin.js). */
function camadaTiles(mapa) {
  const camada = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { subdomains: "abc", maxZoom: 19, className: "map-tiles-dark",
      attribution: "© OpenStreetMap" }).addTo(mapa);
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
  return camada;
}

/* ── O mapa do turno (no trilho) ─────────────────────────────────────────
   ⚠️ O NÓ É PERSISTENTE, e essa é a parte que não dá para improvisar.
   `render()` reescreve o `innerHTML` do `#tela` inteiro a cada 30 segundos.
   Se o mapa morasse dentro desse HTML, ele seria DESTRUÍDO E RECRIADO a cada
   ciclo: perderia o pan e o zoom que o operador acabou de fazer, e baixaria
   os tiles de novo. Então o elemento vive fora do ciclo, guardado aqui, e o
   `render()` só o encaixa no lugar do `#slotMapa`. Mover um nó no DOM
   preserva o Leaflet; o que ele precisa depois é de `invalidateSize()`. */
let _mapaTurnoNo = null;
let _mapaTurno = null;
let _pinos = null;
let _pontos = [];
let _mapaEnquadrado = false;

/* ⚠️ RE-ENQUADRAR NA TROCA DE TAMANHO NÃO CONTRADIZ o "enquadra uma vez só"
   lá embaixo — são dois gatilhos diferentes, e a diferença é quem pediu.
   O ciclo de 30s é do sistema: mexer no mapa ali arrancaria da mão de quem
   acabou de dar zoom num bairro. Entrar em tela cheia é do OPERADOR, e aí
   manter o enquadramento é que fica errado: o `fitBounds` tinha sido
   calculado numa coluna de 368px, então a mesma escala num viewport de 1920
   mostrava de Cabreúva a Cubatão com os pinos espremidos no meio (medido).
   Quem muda o tamanho da janela espera ver o conteúdo, não mais moldura. */
function enquadrarMapa() {
  if (!_mapaTurno || !_pontos.length) return;
  _mapaTurno.fitBounds(L.latLngBounds(_pontos), { padding: [40, 40], maxZoom: 14 });
}

function mapaTurnoNo() {
  if (_mapaTurnoNo) return _mapaTurnoNo;
  const el = document.createElement("section");
  el.className = "mapa-turno";
  el.id = "mapaTurno";
  el.innerHTML =
    '<div class="mapa-cab"><h2>Mapa</h2>' +
    '<button class="mapa-fs" data-acao="mapa-fs" aria-label="Tela cheia" title="Tela cheia (Esc para sair)">' +
    I.expandir + I.recolher + "</button></div>" +
    '<div class="mapa-tela" id="mapaTela"></div>';
  _mapaTurnoNo = el;
  return el;
}

function montarMapaTurno() {
  const no = _mapaTurnoNo;
  if (!no) return;
  const tela = no.querySelector("#mapaTela");

  if (typeof L === "undefined") {
    tela.innerHTML = '<p class="mapa-vazio">O mapa não carregou. A fila ao lado continua valendo.</p>';
    return;
  }

  // Um ponto por chamado com prédio localizado, mais os técnicos com GPS.
  const chamados = DADOS.fila.filter((c) => c.condominio?.lat != null && c.condominio?.lng != null);
  const equipe = (DADOS.tecnicos || []).filter((t) => t.lat != null && t.lng != null);

  // Leaflet centrado no oceano é pior que uma frase.
  if (!chamados.length && !equipe.length) {
    if (_mapaTurno) { _mapaTurno.remove(); _mapaTurno = null; _mapaEnquadrado = false; }
    tela.innerHTML = '<p class="mapa-vazio">Nenhum chamado localizado e nenhum técnico com GPS ativo agora.</p>';
    return;
  }

  if (!_mapaTurno) {
    tela.innerHTML = "";
    _mapaTurno = L.map(tela, { zoomControl: false, attributionControl: true });
    camadaTiles(_mapaTurno);
    _pinos = L.layerGroup().addTo(_mapaTurno);
  }

  _pinos.clearLayers();
  const pontos = [];

  chamados.forEach((c) => {
    const r = relogio(c.sla);
    const p = [c.condominio.lat, c.condominio.lng];
    pontos.push(p);
    L.marker(p, { icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div class="pin pin-ch" data-g="${r.grau}">${String(c.prioridade).toUpperCase()}</div>` }) })
      .bindTooltip(`${escapar(c.condominio.nome || "—")} <b>${r.txt}</b>`,
                   { className: "pin-rot", direction: "top", offset: [0, -12] })
      // Clicar num pino abre o MESMO diálogo de despacho do botão da fila —
      // o mapa é outra porta para a decisão que já existe, não um destino novo.
      .on("click", () => dlgDespacho(c.id))
      .addTo(_pinos);
  });

  equipe.forEach((t) => {
    const p = [t.lat, t.lng];
    pontos.push(p);
    L.marker(p, { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="pin pin-tec" data-liv="${t.disponivel && !t.abertos ? 1 : 0}">${iniciais(t.nome)}</div>` }) })
      .bindTooltip(`${escapar(t.nome)} <b>${t.abertos || 0}</b>`,
                   { className: "pin-rot", direction: "top", offset: [0, -11] })
      .addTo(_pinos);
  });

  _pontos = pontos;
  // ⚠️ ENQUADRA UMA VEZ SÓ. Refazer o `fitBounds` a cada recarga de 30s
  // arrancaria o mapa da mão de quem acabou de dar zoom num bairro — a tela
  // se atualiza sozinha, e o enquadramento é do operador, não do ciclo.
  if (!_mapaEnquadrado) {
    enquadrarMapa();
    _mapaEnquadrado = true;
  }
  // O contêiner acabou de ser movido para dentro do trilho recém-montado:
  // sem isto o Leaflet ainda acredita no tamanho que media antes da mudança.
  _mapaTurno.invalidateSize();
}

/* Tela cheia: a API nativa quando existe, com a classe como plano B — o
   mesmo caminho do `_mpToggleFullscreen` do admin, inclusive o
   `fullscreenchange`, que é o que mantém o botão certo quando o usuário sai
   pelo Esc do navegador em vez de pelo nosso botão. */
function mapaFs(forcar) {
  const no = _mapaTurnoNo;
  if (!no) return;
  const estaEm = no.classList.contains("is-fs") || document.fullscreenElement === no;
  const ativar = forcar != null ? forcar : !estaEm;
  if (ativar) {
    if (no.requestFullscreen) no.requestFullscreen().catch(() => mapaFsAplicar(true));
    else mapaFsAplicar(true);
  } else if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    mapaFsAplicar(false);
  }
}
function mapaFsAplicar(ligar) {
  const no = _mapaTurnoNo;
  if (!no) return;
  no.classList.toggle("is-fs", ligar);
  // A classe no body é o que sobe o contexto de empilhamento do `#tela` acima
  // da barra e trava a rolagem atrás — ver o comentário no `operador.css`.
  document.body.classList.toggle("com-mapa-fs", ligar);
  no.querySelector(".mapa-fs")?.setAttribute("aria-label", ligar ? "Sair da tela cheia" : "Tela cheia");
  // O mapa mudou de tamanho por CSS, e o Leaflet não observa isso sozinho.
  // Depois do próximo quadro, para medir o layout já aplicado.
  requestAnimationFrame(() => {
    _mapaTurno?.invalidateSize();
    enquadrarMapa();
  });
}
document.addEventListener("fullscreenchange", () => {
  const no = _mapaTurnoNo;
  if (!no) return;
  const api = document.fullscreenElement === no;
  if (api !== no.classList.contains("is-fs")) mapaFsAplicar(api);
});

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
  camadaTiles(_mapa);

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
        <span class="selo" data-s="${c.prioridade}">${prioRot(c.prioridade)}</span>
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
            <div class="dado"><span>Categoria</span><b>${escapar(categoriaRot(c.categoria))}</b></div>
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
      <p class="dica">A prioridade define o prazo: <b>P1 ≤ 3h</b> de chegada, P2 24–48h,
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
    if (a === "mapa-fs") return mapaFs();
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
  // ⚠️ ORDEM IMPORTA: o Esc do mapa em tela cheia vem ANTES do `fechar()`.
  // Quando a tela cheia veio pelo caminho de classe (navegador sem a API
  // nativa), o Esc não tem quem o trate, e cair no `fechar()` deixaria o
  // operador preso num mapa que ocupa a tela inteira. Quando veio pela API
  // nativa, o navegador já saiu sozinho e a classe nem está mais aqui.
  if (e.key === "Escape" && _mapaTurnoNo?.classList.contains("is-fs")) return mapaFs(false);
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
