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
  // O prédio do pino do mapa — o MESMO desenho do `_mcPinIcon` do admin
  // (mesma caixa, mesmas janelas, mesma porta), redesenhado no traço desta
  // folha: ponta quadrada e junta em esquadro, nunca arredondada. Ele existe
  // porque prédio e técnico dividem o mesmo mapa: enquanto os dois eram
  // quadrados chanfrados com texto dentro, distinguir um do outro dependia de
  // ler a cor. Forma separa mais rápido que cor — e mais rápido que ler.
  predio: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><rect x="4" y="3" width="16" height="18"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M16 15h.01"/><path d="M10 21v-4h4v4"/></svg>`,
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

  // ⚠️ RESERVATÓRIO MUDO NÃO DESENHA TUBO (31/08/2026, pedido do Pedro).
  // Até aqui todo reservatório virava uma barra: os que tinham leitura
  // mostravam a lâmina d'água, e os mudos mostravam a MESMA barra hachurada,
  // do mesmo tamanho, dizendo "—". Num prédio de quatro caixas sem sensor
  // vivo isso empilhava quatro placeholders idênticos — 76px de hachura e
  // 130px de item para não informar nada. Medido em 31/08 no chamado #9 da
  // produção: item de 222px, com a trilha de tanques 100% vazia.
  //
  // Desenho de ausência ocupa o tamanho do instrumento e não é instrumento.
  // Agora o tubo é para quem TEM medição; quem não tem cabe numa linha, com
  // todos os nomes preservados — nada saiu da tela, mudou o tamanho do que
  // não tem o que mostrar. É a mesma leitura que o painel do cliente já faz
  // ("Sem leitura de X e Y", ver `cliente.js`).
  const comLeitura = c.reservatorios.filter((res) => !res.mudo && res.nivel_pct != null);
  const mudos = c.reservatorios.filter((res) => res.mudo || res.nivel_pct == null);
  const linhaMudos = mudos.length
    ? `<p class="mudos">${I.semsensor}<span>Sem leitura de ${
        mudos.map((res) => escapar(res.nome)).join(" · ")}</span></p>`
    : "";

  const prova = comLeitura.length
    ? `<div class="prova">
         <div class="prova-tanques">${comLeitura.map((res) =>
           `<div class="tanque">${coluna(res)}</div>`).join("")}${linhaMudos}</div>
         ${corpoProva}
       </div>`
    : `<div class="prova" data-sem="1">
         <div>
           ${corpoProva}
           ${linhaMudos || `<p class="semtel">${I.semsensor}Prédio sem telemetria instalada</p>`}
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
    <!-- ⚠️ A FAIXA EXISTE PARA O CAMPO CHEIO NÃO ESTICAR. O vermelho do item
         estourado pintava a COLUNA inteira, e a coluna estica até a altura do
         item — que é decidida pelo lado direito, ou seja, por quantos
         reservatórios o prédio tem. Medido em 31/08 com 6 chamados
         estourados: réguas de 214 a 304px com 83 a 101px de conteúdo, ou
         seja **53% a 73% de vermelho saturado vazio**, e o prédio de 4 caixas
         d'água ganhando 43% mais alarme que o de 1 com o mesmo atraso.
         Alarme é o ESTADO, não a área: agora o campo cheio é esta faixa, do
         tamanho do que ela diz, igual em todo item que estourou. -->
    <div class="relogio-sla">
      <div class="sla-faixa">
        <span class="sla-n">${r.txt}</span>
        <span class="sla-rot">${r.rot}</span>
        <span class="selo" data-s="${c.prioridade}">${prioRot(c.prioridade)}</span>
      </div>
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
  const novos = _vistos === null
    ? new Set()
    : new Set(DADOS.fila.map((c) => c.id).filter((id) => !_vistos.has(id)));
  _vistos = new Set(DADOS.fila.map((c) => c.id));

  // ⚠️ O PLACAR DE TRÊS NÚMEROS SAIU (31/08/2026), e o motivo não é estética:
  // ele DIZIA O QUE A TELA JÁ DIZ, a 40px de distância. "4 esperando alguém"
  // e "1 com técnico" eram as mesmas palavras e os mesmos números dos dois
  // cabeçalhos de seção logo abaixo, e no dia calmo "0 chamados abertos"
  // repetia, em miniatura, o "Nenhum chamado aberto." que vem em seguida em
  // corpo de manchete. Contar uma fila que está inteira na tela, ordenada
  // pelo que estoura primeiro, é uma segunda representação do mesmo dado.
  //
  // Dos três números, só "fora do prazo" não estava repetido em lugar
  // nenhum — e esse desceu para o cabeçalho da seção, que é onde um número
  // fica legível: colado na lista que ele conta. Ele também ficou MAIS
  // preciso ali: o placar somava a fila inteira, e agora cada seção conta os
  // seus (um chamado estourado que já tem técnico não é pendência de
  // despacho). Nenhuma palavra nova entrou na tela — "fora do prazo" é o
  // rótulo que o placar já usava.
  const foraEspera = espera.filter((c) => c.sla?.estourado).length;
  const foraAndando = andando.filter((c) => c.sla?.estourado).length;
  const fora = (n) => n ? ` · <b class="cab-fora">${n} fora do prazo</b>` : "";

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
        <span>${espera.length} chamado${espera.length > 1 ? "s" : ""}${fora(foraEspera)} · ordenados pelo que estoura primeiro</span></div>
      <div class="fila">${espera.map((c) => item(c, novos.has(c.id))).join("")}</div>` : ""}
    ${andando.length && espera.length ? `<div class="fita" aria-hidden="true"></div>` : ""}
    ${andando.length ? `
      <div class="andando-cab"><h2>Já tem técnico</h2>
        <span>${andando.length} chamado${andando.length > 1 ? "s" : ""}${fora(foraAndando)}</span></div>
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
    <!-- ⚠️ DUAS PEÇAS POR LINHA, e o motivo é a pergunta que o trilho responde:
         QUEM PODE IR. Nome e estado respondem; o selo de iniciais e a nota de
         GPS não. O selo não identifica ninguém que o operador já não reconheça
         pelo nome (e ele reconhece — é a equipe dele), e "no mapa" repetido em
         quase toda linha fica logo abaixo do mapa que já mostra o pino. Restou
         só a EXCEÇÃO: quando falta posição, isso se diz. Ver mais em
         active-work, item 1 do corte do operador. -->
    <div>
      <h2>Equipe agora</h2>
      ${t.length ? `<div class="chapa">${t.map((x) => `
        <div class="tec" data-liv="${x.disponivel && !x.abertos ? 1 : 0}">
          <div class="tec-nome">${escapar(x.nome)}</div>
          <div class="tec-est">${x.disponivel
            ? (x.abertos ? `${x.abertos} chamado${x.abertos > 1 ? "s" : ""}` : "Livre agora")
            : "Ocupado"}${x.lat == null ? ` <span class="tec-sp">· sem posição</span>` : ""}</div>
        </div>`).join("")}</div>` : `<p class="vazio-lado">Nenhum técnico ativo.</p>`}
    </div>
    <div>
      <h2>Despachados hoje</h2>
      ${emRota.length ? `<div class="chapa">${emRota.map((c) => `
        <div class="tec">
          <div class="tec-nome">${escapar(c.condominio?.nome || "—")}</div>
          <div class="tec-est">#${c.id} · ${escapar(c.tecnico.nome.split(" ")[0])}</div>
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
  // `close()` antes de remover: é o que tira o diálogo do top layer. Remover
  // o nó sem fechar deixa o navegador achando que ainda há um modal aberto —
  // e o próximo `showModal()` de uma tela de turno que abre diálogo o dia
  // inteiro passa a falhar.
  if (typeof f.close === "function" && f.open) f.close();
  f.remove();
  document.body.classList.remove("com-ficha");
  if (_focoAnterior && _focoAnterior.isConnected) _focoAnterior.focus();
  _focoAnterior = null;
}

const FOCAVEIS = 'button:not([disabled]),select,input,textarea,a[href],[tabindex]:not([tabindex="-1"])';

function abrirFundo(html) {
  _focoAnterior = document.activeElement;
  fechar();
  // ⚠️ `<dialog>` COM `showModal()`, NÃO UMA `<div>` COM z-index — e isto é
  // consequência de um bug que z-index nenhum resolvia.
  //
  // O sintoma: com o mapa do turno em TELA CHEIA, clicar num pino "não fazia
  // nada", e o diálogo só aparecia depois de sair da tela cheia. A causa é a
  // Fullscreen API nativa: o navegador desenha somente a subárvore do
  // elemento em tela cheia, e o diálogo era pendurado no `<body>`, fora dela.
  //
  // Tentei antes criar o diálogo DENTRO do elemento em tela cheia. Não
  // bastou. `showModal()` basta porque o navegador põe o diálogo no
  // **top layer** — a mesma camada em que o elemento em tela cheia vive, e
  // pintada depois dele. Deixa de haver "quem está por cima de quem":
  // por especificação, o último a entrar no top layer é o que se vê.
  // É o mecanismo do navegador para exatamente este caso.
  //
  // ⚠️ Não volte para `<div>` + z-index. E cuidado ao "testar" isto por
  // código: `requestFullscreen()` exige gesto do usuário, então uma
  // verificação automatizada cai no fallback por CLASSE — que sempre
  // funcionou — e passa verde com o bug de pé. Foi o que aconteceu comigo
  // duas vezes. `elementFromPoint` também não serve de prova aqui: ele
  // responde pela árvore de layout, e o que falha é a PINTURA.
  // Tela cheia nativa só se testa com clique de verdade.
  document.body.insertAdjacentHTML("beforeend",
    `<dialog class="fundo" id="fundo">${html}</dialog>`);
  const dlg = document.getElementById("fundo");
  dlg.showModal();
  // O Esc é do navegador quando o diálogo é nativo; `fechar()` faz a limpeza
  // (classe do body, devolução do foco) tanto no Esc quanto no nosso botão.
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
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
    // ⚠️ `zIndexOffset` ALTO, e isto é correção de um defeito real, não
    // preferência: o Leaflet empilha por latitude, então um técnico ao norte
    // de um prédio ficava POR CIMA dele. Medido na prévia: 3 dos 8 pinos
    // estavam cobertos, e o pino de técnico não tem handler de clique —
    // então clicar no prédio "não fazia nada", que foi exatamente o sintoma
    // relatado. O pino de chamado é o ÚNICO que abre alguma coisa: cobrir um
    // chamado esconde uma decisão, cobrir um técnico não esconde nada.
    L.marker(p, { zIndexOffset: 1000,
      icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
        html: `<div class="pin pin-ch" data-g="${r.grau}">${I.predio}</div>` }) })
      // A prioridade saiu da FACE do pino e vive na legenda — a face agora é
      // o ícone de prédio. Nada se perdeu: cor continua sendo o relógio, e a
      // legenda ganhou a prioridade que a face deixou de escrever.
      .bindTooltip(
        `${escapar(c.condominio.nome || "—")} <b>${prioRot(c.prioridade)}</b> <b>${r.txt}</b>`,
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
  // ⚠️ NADA de mover o diálogo entrando/saindo da tela cheia. Foi a tentativa
  // anterior e além de não resolver, com `<dialog>` ela QUEBRA: mover um
  // diálogo aberto no DOM o tira do top layer. Ele já está na camada certa,
  // seja qual for o estado da tela cheia — ver `abrirFundo`.
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
    // ⚠️ O MESMO prédio do mapa do turno, e `zIndexOffset` pelo mesmo motivo:
    // aqui ele é o ALVO da decisão, e um técnico ao norte dele o cobria.
    // Dois marcadores de prédio diferentes na mesma tela seria a divergência
    // mais visível que esta folha poderia ter.
    L.marker(alvo, { zIndexOffset: 1000,
      icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="pin pin-predio">${I.predio}</div>` }) })
      .bindTooltip(`${escapar(c.condominio?.nome || "—")} <b>${prioRot(c.prioridade)}</b>`,
                   { className: "pin-rot", direction: "top", offset: [0, -13] })
      .addTo(_mapa);
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
      <!-- ⚠️ OS NÚMEROS SAÍRAM DAQUI (31/08). Esta dica dizia "P2 24–48h" e
           "P4 conforme agenda"; no banco, o ttr_min de P2 é 1440 (24h) e o de
           P4 é 14400 (10 dias). Eram prazos escritos à mão que envelheceram em
           silêncio — e sla_definicoes é editável pelo admin, então qualquer
           número fixo aqui volta a mentir na próxima mudança. A tabela de
           verdade vive na Ajuda, e ela vem do banco.
           (Sem crase neste comentário: ele vive dentro de um template
            literal, e crase aqui FECHA o template. Ver CLAUDE.md.) -->
      <p class="dica">A prioridade define o prazo. Na dúvida entre dois níveis,
        prevalece o maior — e o botão <b>Ajuda</b>, no alto da tela, mostra a
        tabela completa de prazos.</p>
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
  // ⚠️ A FAIXA VAI PARA DENTRO DO DIÁLOGO QUANDO HÁ UM, e o `z-index` dela
  // não tem nada a ver com isso. Desde que o diálogo virou `<dialog>` com
  // `showModal()`, ele vive no TOP LAYER — que é pintado acima de toda a
  // página, por especificação e não por número. Uma faixa pendurada no
  // `<body>` ficaria por baixo dele por mais alto que fosse o z-index.
  // Isso importa aqui mais que em qualquer outro lugar da tela: o erro que
  // esta faixa carrega é justamente o do despacho que falhou — a mensagem
  // que o operador precisa ler está sempre com um diálogo aberto na frente.
  (document.getElementById("fundo") || document.body).insertAdjacentHTML("beforeend",
    `<div class="aviso" id="aviso" role="alert">${escapar(texto)}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), 6000);
}


/* ── A AJUDA ──────────────────────────────────────────────────────────
   Pedido do Pedro em 31/08: *"tem como colocar um botão de ajuda em algum
   canto explicando o que é P1, P2 etc, quanto tempo essas coisas têm... quem
   vai usar são pessoas que não são tão entendidas"*.

   ⚠️ OS PRAZOS VÊM DO BANCO, sempre (`GET /operador/prazos`). Escritos à mão
   aqui, eles viram documentação que envelhece em silêncio — e isso JÁ tinha
   acontecido: a dica do "Novo chamado" dizia "P2 24–48h" quando o `ttr_min`
   de P2 é 1440 (24h), e "P4 conforme agenda" quando P4 tem 14400 (10 dias).
   Se o admin mudar um prazo em `sla_definicoes`, a ajuda muda junto na
   próxima vez que alguém a abrir. Ajuda errada é pior que ajuda nenhuma,
   ainda mais para quem a abriu justamente por não saber.

   ⚠️ A busca é PREGUIÇOSA — só quando o diálogo abre. A tese da superfície
   ("uma request monta a tela inteira") é sobre montar a tela; um diálogo que
   a maioria dos turnos nunca abre não entra no caminho crítico da fila. */

const PRIO_AJUDA = [
  { p: "p1", rot: "Crítico" },
  { p: "p2", rot: "Alta" },
  { p: "p3", rot: "Controlado" },
  { p: "p4", rot: "Agendado" },
];

// Prazo em palavra de gente. ⚠️ 1440 sai como "24h", não "1 dia": prazo de
// chegada se fala em horas até o fim do primeiro dia, e "1 dia" ao lado de
// "3 dias" faz o operador comparar dia com hora de cabeça.
function prazoTxt(min) {
  if (min == null) return "—";
  if (min < 60) return min + " min";
  if (min <= 1440) return Math.round(min / 60) + "h";
  const d = min / 1440;
  const n = Number.isInteger(d) ? d : Math.round(d * 10) / 10;
  return String(n).replace(".", ",") + (n > 1 ? " dias" : " dia");
}

// A tabela de prazos. É a MESMA nas duas telas, e de propósito: o operador
// que abre a ajuda em Aprovados está escolhendo prioridade num diálogo, e
// precisa da mesma referência que a fila dá.
function tabelaPrazos(prazos) {
  const porPrio = new Map((prazos || []).map((x) => [x.prioridade, x]));
  const linhas = PRIO_AJUDA.map(({ p, rot }) => {
    const s = porPrio.get(p) || {};
    return `<tr>
      <td><span class="ajuda-prio"><span class="selo" data-s="${p}">${p.toUpperCase()}</span>${rot}</span></td>
      <td>${prazoTxt(s.ttfr_min)}</td>
      <td>${prazoTxt(s.sla_chegada_min)}</td>
      <td>${prazoTxt(s.ttr_min)}</td>
    </tr>`;
  }).join("");
  // ⚠️ O `overflow-x` é do INVÓLUCRO, não da tabela: no celular a tabela
  // rola sozinha em vez de esticar o diálogo e a página inteira junto.
  return `<div class="ajuda-rolagem"><table class="ajuda-tab">
    <thead><tr><th>Prioridade</th><th>Responder</th><th>Técnico chegar</th><th>Resolver</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>`;
}

// Abre o diálogo já com a moldura e troca só o miolo quando os prazos
// chegam: abrir instantâneo e preencher é melhor que um botão que não
// responde enquanto a rede pensa.
async function dlgAjuda() {
  abrirFundo(`<div class="ficha" style="width:min(760px,100%)" role="dialog" aria-label="Ajuda">
    <div class="ficha-cab">
      ${/* ⚠️ A SUBLINHA SAIU junto com o bloco "O que é esta tela". Ela dizia
             "os prazos abaixo são os que estão valendo no sistema agora" — uma
             garantia sobre a PROCEDÊNCIA do dado, que é assunto de quem
             mantém, não de quem opera. Para quem abre a ajuda, ela era mais
             uma linha antes da resposta. */""}
      <div><h2>Como esta tela funciona</h2></div>
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar">${I.x}</button>
    </div>
    <div class="ajuda" id="ajudaCorpo"><p class="ajuda-carregando">Carregando os prazos…</p></div>
    <div class="ficha-pe"><button class="btn" data-acao="fechar">Entendi</button></div>
  </div>`);
  let d = {};
  try {
    const r = await fetch("/operador/prazos", { headers: authHeaders() });
    d = await lerJson(r, "Prazos");
    if (!r.ok) throw new Error(d.error || "Erro ao carregar os prazos");
  } catch (e) {
    d = { erro: e.message };
  }
  const alvo = document.getElementById("ajudaCorpo");
  // O diálogo pode ter sido fechado enquanto a resposta vinha.
  if (alvo) alvo.innerHTML = ajudaCorpo(d);
}

// ⚠️ TEXTO CURTO É REQUISITO, NÃO ESTILO (31/08). A primeira versão desta
// ajuda explicava certo e explicava demais: frases de três orações, travessão
// no meio, e o "porquê" de cada regra junto com o "o quê". O Pedro pediu "da
// maneira mais simples possível", e o público é o mesmo de 28/08 — gente com
// pouca familiaridade com computador, lendo com o telefone tocando.
// A regra aqui: **uma ideia por frase, e nada que não sirva para usar a
// tela**. Se a frase explica por que o sistema é assim, ela não é ajuda: é
// documentação, e o lugar dela é o docs/.
function ajudaCorpo(d) {
  if (d.erro) return `<p class="ajuda-carregando">${escapar(d.erro)}</p>`;
  const baixo = d.limiares?.baixo ?? 45;
  const critico = d.limiares?.critico ?? 20;
  const mudo = d.offline_min ?? 10;
  return `
  <section>
    <h3>A ordem da lista</h3>
    <p>O primeiro da lista é o mais urgente.</p>
    <p>A ordem não é a prioridade. É o tempo: quem vence antes, aparece antes.</p>
    <p>O número grande da esquerda é <b>quanto tempo falta</b>. Em vermelho, o
      prazo já passou.</p>
  </section>
  <section>
    <h3>As prioridades e os prazos</h3>
    ${tabelaPrazos(d.prazos)}
    <p>Cada chamado tem três prazos correndo. A tela mostra o que está mais
      perto de acabar.</p>
    <ul class="ajuda-lista">
      <li><b>Responder</b>: para quando você despacha alguém.</li>
      <li><b>Técnico chegar</b>: para quando o técnico chega no prédio.</li>
      <li><b>Resolver</b>: para quando o chamado fecha.</li>
    </ul>
    <p>P4 não tem prazo de chegada. É serviço agendado.</p>
  </section>
  <section>
    <h3>As barras de água</h3>
    <p>Cada barra é uma caixa d’água do prédio. A parte cheia é a água que tem.</p>
    <ul class="ajuda-lista">
      <li>Menos de <b>${baixo}%</b>: nível baixo.</li>
      <li>Menos de <b>${critico}%</b>: crítico.</li>
    </ul>
    <p>Se o sensor fica <b>${mudo} minutos</b> sem mandar leitura, a barra some.
      No lugar dela aparece <b>“Sem leitura de…”</b>.</p>
    <p>Isso não quer dizer que falta água. Quer dizer que ninguém está
      conseguindo medir.</p>
    <p>Prédio sem sensor não tem barra. No lugar fica o que a pessoa contou
      quando ligou.</p>
  </section>
  <section>
    <h3>Os botões</h3>
    <ul class="ajuda-lista">
      <li><b>Despachar</b>: abre o mapa para você escolher o técnico.</li>
      <li><b>Ver detalhes</b>: mostra tudo que já foi feito no chamado.</li>
      <li><b>Novo chamado</b>: para o que chega por telefone.</li>
      <li><b>Aprovados</b>: os orçamentos que o cliente já aceitou.</li>
    </ul>
  </section>
  <section>
    <h3>A tela se atualiza sozinha</h3>
    <p>A cada 30 segundos.</p>
    <p>Se ela parar de atualizar, aparece uma <b>faixa vermelha</b> no alto da
      tela dizendo desde que horas.</p>
  </section>`;
}

/* ── Eventos ─────────────────────────────────────────────────────────── */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-acao]");
  if (b) {
    const a = b.dataset.acao;
    if (a === "fechar") return fechar();
    if (a === "novo") return dlgNovo();
    if (a === "ajuda") return dlgAjuda();
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
  // ⚠️ E O DIÁLOGO VEM ANTES DOS DOIS. Com o mapa em tela cheia e um despacho
  // aberto por cima, o Esc precisa fechar o DESPACHO — sair da tela cheia ali
  // é descartar a decisão em andamento e ainda tirar o operador do mapa que
  // ele estava usando. Fecha-se de dentro para fora.
  if (e.key === "Escape" && document.getElementById("fundo")) return fechar();
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
  // A faixa de "parou de atualizar". Ver o comentário no operador.html.
  //
  // ⚠️ TRÊS ESTADOS VIRARAM DOIS, e o terceiro sumiu de propósito: "está
  // recebendo" não é notícia. O que o operador precisa saber é quando PAROU —
  // e antes da primeira carga não parou nada, então a faixa também não
  // aparece (era o alarme falso do boot, corrigido em 27/08 e preservado
  // aqui).
  const el = document.getElementById("parado");
  if (!el) return;
  const parado = _ultimoOk !== null && (Date.now() - _ultimoOk) > INTERVALO_MS * 3;
  el.hidden = !parado;
  if (parado) {
    const d = new Date(_ultimoOk);
    const h = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    // ⚠️ A HORA É A DA ÚLTIMA ATUALIZAÇÃO, não a do computador. Era esse o
    // dado útil o tempo todo, e era justamente o que o relógio da barra NÃO
    // mostrava. Frase curta e em caixa normal: caixa alta é para etiqueta de
    // uma ou duas palavras (docs/vocabulario.md).
    el.textContent = `A lista não atualiza desde as ${h}. Verifique a conexão.`;
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
