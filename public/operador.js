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

/* ── O dia calmo ─────────────────────────────────────────────────────
   ⚠️ ERA TEXTO CENTRADO NO VÁZIO; virou PLACA (31/08, pedido do Pedro, com
   os dois prints do painel do cliente ao lado). A gramática é a de lá,
   elemento por elemento: manchete branca com uma palavra em âmbar, lede em
   `--sobre-2`, e uma segunda coluna com etiqueta mono e linhas separadas
   por fio.

   ⚠️ SEM PLACA, e isto é uma correção sobre o mesmo dia. Eu tinha construído
   uma chapa de duas camadas com anel, gradiente e segunda coluna dividida por
   corte gravado. O Pedro: *"não quero esse bloco que você está fazendo, faça
   algo realmente igual esse texto, livre"*. Ele está certo e o print prova:
   no painel do cliente a manchete e a lede pousam DIRETO no campo marinho —
   quem tem placa ali são os CARTÕES, que são o conteúdo. Numa tela sem
   conteúdo, embrulhar o aviso numa peça é dar corpo justamente ao que não
   tem.

   ⚠️ O texto antigo dizia TRÊS VEZES a mesma coisa: o título "Nenhum chamado
   aberto", o parágrafo abrindo com "A fila está vazia" e a etiqueta
   "NADA PEDE ALGUÉM AGORA". Três formas de dizer que não há nada e nenhuma
   de dizer o que há — que é a pergunta que uma tela vazia levanta sozinha.
   É por isso que os números ficaram, mesmo sem a coluna.

   ⚠️ A MANCHETE É ESCOLHA DO PEDRO. Eu tinha promovido a antiga etiqueta a
   título; ele trocou por "Nenhum chamado esperando", e a razão vale:
   "esperando" já está na tela, no cabeçalho da fila, e reaproveitar a palavra
   que a pessoa acabou de ler custa menos que ensinar uma construção nova.
   Descartada também "Tudo em dia por aqui" — numa tela de turno, afirmar
   calma que ninguém verificou é o pior erro possível.

   ⚠️ OS NÚMEROS SÃO OS DA TELA, não frases de efeito: os prédios são os
   pinos do mapa e os técnicos são os do trilho. Se algum dia deixarem de
   bater com o que está ao lado, é aqui que a mentira aparece primeiro.
   ⚠️ E "prédios no mapa", não "prédios monitorados": a carteira é quem tem
   COORDENADA, não quem tem sensor — em produção não há reservatório
   cadastrado, e "monitorados" seria promessa que o dado não sustenta. */
function calmo() {
  const predios = (DADOS.condominios || []).length;
  const livres = (DADOS.tecnicos || []).filter((t) => t.disponivel && !t.abertos).length;
  const equipe = (DADOS.tecnicos || []).length;

  // ⚠️ TEXTO CORRIDO, NÃO UMA COLUNA DE FATOS. A versão anterior punha isto
  // numa segunda coluna com etiqueta e fios — e virou o "bloco" que o Pedro
  // recusou. Livre, os mesmos números continuam respondendo "então o que esta
  // tela está fazendo?" sem construir uma peça para dizer isso.
  const linhas = [];
  if (predios) linhas.push(`<b>${predios}</b> ${predios > 1 ? "prédios" : "prédio"} no mapa`);
  if (equipe) {
    linhas.push(livres
      ? `<b>${livres}</b> ${livres > 1 ? "técnicos livres" : "técnico livre"} agora`
      : `toda a equipe em atendimento`);
  }

  return `
  <section class="calmo">
    <h1>Nenhum chamado <b>esperando</b>.</h1>
    ${/* ⚠️ A LEDE NÃO CITA MAIS A TELEMETRIA (31/08, correção do Pedro: "tire
          o foco da palavra telemetria aí, são chamados no geral"). Ela dizia
          "Quando a telemetria abrir um chamado, ou alguém ligar relatando
          alguma coisa" — e isso põe UMA das cinco origens na frente das
          outras quatro. Um chamado nasce da telemetria, do WhatsApp com IA,
          do plano de preventiva, do painel do cliente ou de alguém digitando
          (ver `origemDe` no operador.routes.js). A frase agora vale para
          todas, e é mais curta por consequência. */""}
    <p class="calmo-lede">Assim que um chamado for aberto, ele entra aqui no
      topo — com o prazo já contando.</p>
    ${linhas.length ? `<p class="calmo-agora">${linhas.join(" · ")}</p>` : ""}
    <p class="calmo-nota">A lista se atualiza sozinha a cada 30 segundos.</p>
  </section>`;
}

function render() {
  const espera = DADOS.fila.filter((c) => !c.tecnico);
  const andando = DADOS.fila.filter((c) => c.tecnico);
  const novos = _vistos === null
    ? new Set()
    : new Set(DADOS.fila.map((c) => c.id).filter((id) => !_vistos.has(id)));
  _vistos = new Set(DADOS.fila.map((c) => c.id));
  // O mesmo conjunto que destaca o item na fila leva o mapa até o prédio.
  // `montarMapaTurno` roda logo abaixo, no mesmo ciclo, e lê daqui — passar
  // por argumento obrigaria a mudar a assinatura de uma função que o resto do
  // arquivo chama sem nada.
  _novos = novos;

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
    ? calmo()
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
      attribution: "© OpenStreetMap",
      // ⚠️ OS TRÊS DO ADMIN (`_criarTileLayer`, admin.js), que faltavam aqui.
      // `keepBuffer` guarda um anel de tiles fora da vista, então arrastar o
      // mapa não abre buraco cinza na direção do gesto; `updateWhenIdle:false`
      // + `updateInterval:100` pedem tile DURANTE o arrasto em vez de só no
      // fim dele. Num mapa que existe para uma decisão de despacho, o operador
      // arrasta para ver o que tem em volta do chamado — que é exatamente o
      // momento em que o padrão do Leaflet mostra vazio.
      keepBuffer: 4,
      updateWhenIdle: false,
      updateInterval: 100 }).addTo(mapa);
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
// O centro da carteira, quando não há decisão na tela. `null` quando há.
let _centroCarteira = null;
let _carteiraPts = [];
// ⚠️ 12, e não os 11 do admin. Lá o mapa é a tela inteira; aqui ele mora numa
// coluna de 400px, e um zoom a menos na mesma altura mostra o dobro de área
// com metade da legibilidade. Medido na coluna, não deduzido do admin.
const ZOOM_CARTEIRA = 12;
// Já houve um primeiro enquadramento nesta instância do mapa.
let _mapaEnquadrado = false;
/* ⚠️ O QUE TRAVA O ENQUADRAMENTO AUTOMÁTICO É O GESTO DO OPERADOR, e não o
   primeiro ciclo — a correção de 01/09/2026.

   Isto era `if (!_mapaEnquadrado)`: o mapa enquadrava UMA VEZ por carregamento
   de página e nunca mais. O motivo era bom (não arrancar a vista da mão de
   quem acabou de dar zoom num bairro), mas o gatilho era o errado, e numa tela
   que fica aberta o turno inteiro isso significava que o enquadramento era
   decidido pelo estado do sistema às 8h da manhã.

   O caso real, medido em produção: turno calmo, zero chamado, nenhum técnico
   com GPS. `_pontos` vazio, então o mapa centrou na MEDIANA DA CARTEIRA
   (-23,5567 / -46,6571) em zoom 12 — numa coluna de 400px isso alcança ±7,01 km.
   Às 12h53 um técnico ligou o app em -23,5350 / -46,5803, **7,84 km a leste**:
   830 m além da borda direita. O ciclo de 30s desenhava o pino dele a cada
   volta, o trilho listava o nome, e a vista nunca mais foi recalculada — ele
   aparecia no mapa do admin e "sumia" no do operador. Só F5 ou o botão de tela
   cheia (que chama `enquadrarMapa` de novo) traziam ele de volta.

   Agora: enquanto NINGUÉM tocou no mapa, ele é automático e se reenquadra
   quando um ponto cai fora da vista; no instante em que o operador arrasta,
   rola, dá duplo clique, usa o teclado ou pinça, congela para sempre naquela
   sessão. O motivo original fica intacto — só passou a ser disparado por quem
   ele sempre quis proteger. */
let _operadorMexeu = false;

/* Só GESTO conta. `zoomstart`/`movestart` do Leaflet NÃO servem: o próprio
   `fitBounds` os dispara, e o mapa se travaria sozinho no primeiro
   enquadramento — de volta ao bug, por um caminho mais difícil de enxergar.
   Estes cinco só existem quando a mão do operador está no mapa.
   `zoomControl` é `false` nesta tela, então não há botão +/- a escutar. */
function _ouvirGestos(mapa) {
  const marcar = () => { _operadorMexeu = true; };
  mapa.on("dragstart", marcar);
  const el = mapa.getContainer();
  el.addEventListener("wheel", marcar, { passive: true });
  el.addEventListener("dblclick", marcar);
  el.addEventListener("keydown", marcar);
  el.addEventListener("touchstart",
    (e) => { if (e.touches.length > 1) marcar(); }, { passive: true });
}

/* ⚠️ FORA DA VISTA, e não "mudou de lugar". Reenquadrar a cada ciclo faria o
   mapa dar um tranco de 30 em 30 segundos enquanto um técnico anda pela mesma
   quadra — movimento que não informa nada e que ninguém pediu. O que precisa
   de correção é o ponto que o operador NÃO CONSEGUE VER; enquanto todos cabem
   na vista, a vista está certa e fica quieta. */
function _precisaEnquadrar(pontos) {
  if (_operadorMexeu) return false;
  if (!_mapaEnquadrado) return true;
  if (!pontos.length) return false;
  const vista = _mapaTurno.getBounds();
  return pontos.some((p) => !vista.contains(p));
}

/* ── O CHAMADO NOVO LEVA O MAPA ATÉ ELE ──────────────────────────────────
   Pedido do Pedro (01/09): quando aparece uma questão num condomínio, além do
   pino mudar de cor, a tela vai até ele e abre um balão com o que é.

   ⚠️ ISTO PASSA POR CIMA DO `_operadorMexeu`, e é a ÚNICA coisa que passa.
   O gesto do operador trava o reenquadramento do ciclo de 30s porque aquilo é
   ruído do sistema; um chamado NOVO é o evento mais importante que esta tela
   tem, e ela existe para não deixá-lo passar. A concessão é a de sempre:
   interrompe uma vez, no momento em que o chamado nasce, e nunca mais.

   ⚠️ E SÓ NA PRIMEIRA APARIÇÃO. O gatilho é o `_novos` do `render()` — o mesmo
   conjunto que destaca o item na fila —, então o ciclo seguinte já não o
   considera novo: o mapa não volta a saltar, e um balão que o operador fechou
   fica fechado. Na abertura da tela `_vistos` é `null` e `novos` sai vazio, de
   propósito: um painel que acabou de carregar com cinco chamados abertos não
   pode dar zoom em coisa velha antes de o operador olhar a fila. */
let _novos = null;
let _balao = null;
let _balaoId = null;
// O mesmo teto do `enquadrarMapa`. Um zoom a mais cola no prédio e varre a
// vizinhança da tela — e a pergunta que o mapa responde ("quem pode ir") é
// justamente sobre o que está em volta.
const ZOOM_FOCO = 13;

// O mais urgente entre os que acabaram de chegar. `DADOS.fila` já vem
// ordenada pelo SLA que estoura primeiro, então o primeiro que casar é ele.
// ⚠️ Focar em três é não focar em nenhum: se entram vários no mesmo ciclo, os
// outros continuam pinados e na fila, que é onde eles já eram visíveis.
function _chamadoParaFocar(chamados) {
  if (!_novos || !_novos.size) return null;
  return chamados.find((c) => _novos.has(c.id)) || null;
}

function _focarChamado(c) {
  const p = [c.condominio.lat, c.condominio.lng];
  // O balão abre ANTES do voo, ancorado na coordenada, e viaja junto. Abrir no
  // `moveend` teria um buraco: `flyTo` para um ponto onde o mapa já está não
  // dispara evento nenhum, e o balão simplesmente não apareceria.
  // `autoPan:false` porque quem enquadra aqui é o voo — os dois juntos brigam
  // pelo centro, e o popup cabe de sobra acima de um ponto centrado.
  _balao = L.popup({ className: "balao-pop", maxWidth: 268, minWidth: 214,
                     autoPan: false, closeButton: true })
    .setLatLng(p).setContent(_balaoChamado(c)).openOn(_mapaTurno);
  _balaoId = c.id;
  // O voo é o que faz o operador PERCEBER que a tela se moveu; um salto
  // instantâneo desorienta em quem estava olhando outra região.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    _mapaTurno.setView(p, ZOOM_FOCO);
  } else {
    _mapaTurno.flyTo(p, ZOOM_FOCO, { duration: .8 });
  }
}

/* O balão sobrevive ao ciclo de 30s de propósito — ele não vive no `_pinos`,
   que é limpo a cada volta. Mas sobreviver não é congelar: o relógio dentro
   dele continua correndo, e um chamado que saiu da fila (fechado por outro
   operador, por exemplo) não pode continuar oferecendo "Despachar". */
function _sincronizarBalao() {
  if (_balaoId == null || !_mapaTurno) return;
  const atual = DADOS.fila.find((c) => c.id === _balaoId);
  if (!atual) {
    _mapaTurno.closePopup();
    _balao = null; _balaoId = null;
    return;
  }
  if (_balao && _balao.isOpen()) _balao.setContent(_balaoChamado(atual));
}

/* ⚠️ NENHUMA CRASE AQUI DENTRO, nem em comentário — ver CLAUDE.md. O conteúdo
   é o do item da fila, sem a prova: quem está olhando o mapa quer saber ONDE,
   QUÃO URGENTE e O QUE FAZER. As colunas d'água ficam na fila, que é onde há
   espaço para lê-las. */
function _balaoChamado(c) {
  const r = relogio(c.sla);
  const condo = c.condominio || {};
  const onde = [condo.bairro, condo.cidade].filter(Boolean).map(escapar).join(" · ");
  const acao = c.tecnico
    ? `<span class="balao-tec">${I.rota}<span>${escapar(c.tecnico.nome)}</span></span>`
    : `<button class="btn" data-acao="despacho" data-id="${c.id}">Despachar</button>`;
  return `
    <div class="balao" data-g="${r.grau}">
      <div class="balao-cab">
        <span class="selo" data-s="${c.prioridade}">${prioRot(c.prioridade)}</span>
        <span class="balao-rel"><b>${r.txt}</b> ${escapar(r.rot)}</span>
      </div>
      <h3 class="balao-nome">${escapar(condo.nome || "Prédio sem cadastro")}</h3>
      ${onde ? `<p class="balao-onde">${onde}</p>` : ""}
      <p class="balao-txt">${escapar(c.descricao || c.titulo)}</p>
      <div class="balao-pe">
        ${acao}
        <button class="link-ficha" data-acao="ficha" data-id="${c.id}">Ver detalhes</button>
      </div>
    </div>`;
}

/* ⚠️ RE-ENQUADRAR NA TROCA DE TAMANHO NÃO CONTRADIZ o "enquadra uma vez só"
   lá embaixo — são dois gatilhos diferentes, e a diferença é quem pediu.
   O ciclo de 30s é do sistema: mexer no mapa ali arrancaria da mão de quem
   acabou de dar zoom num bairro. Entrar em tela cheia é do OPERADOR, e aí
   manter o enquadramento é que fica errado: o `fitBounds` tinha sido
   calculado numa coluna de 368px, então a mesma escala num viewport de 1920
   mostrava de Cabreúva a Cubatão com os pinos espremidos no meio (medido).
   Quem muda o tamanho da janela espera ver o conteúdo, não mais moldura. */
/* ⚠️ MAPA LARGO É UM CONCEITO SÓ NESTA TELA, e agora dois comportamentos
   dependem dele: COMO enquadrar (abaixo) e QUANTO medem os pinos
   (`escalaPinos`). Se um dia o limiar mudar, muda para os dois — mapa que
   abre a carteira inteira e mostra pino de confete é a combinação ruim. */
const MAPA_LARGO = 800;

/* A escala dos pinos segue o TAMANHO DO MAPA, não o da janela — o `data-esc`
   é lido pelo `operador.css`, onde está a prosa do porquê. Aqui só a
   medição, e ela tem de vir DEPOIS de `invalidateSize()`: antes disso o
   Leaflet ainda responde com a caixa antiga (é o mesmo motivo dos dois
   `requestAnimationFrame` do `mapaFsAplicar`). */
function escalaPinos() {
  if (!_mapaTurno || !_mapaTurnoNo) return;
  const tela = _mapaTurnoNo.querySelector("#mapaTela");
  if (tela) tela.dataset.esc = _mapaTurno.getSize().x > MAPA_LARGO ? "g" : "p";
}

function enquadrarMapa() {
  if (!_mapaTurno) return;
  // Sem chamado nem técnico, quem enquadra é a carteira — e COMO ela enquadra
  // depende do tamanho do mapa, que nesta tela muda de verdade: 400px na
  // coluna do trilho, a largura da janela em tela cheia e abaixo de 1080.
  //
  // ⚠️ O MESMO ZOOM EM CAIXAS DE TAMANHOS DIFERENTES MOSTRA ÁREAS DIFERENTES,
  // e foi isso que o print do Pedro pegou: com `fitBounds` sobre os 86 prédios
  // reais, a tela cheia abria de Barueri a Mauá e os pontos viravam sujeira
  // de mapa. Trocar por um zoom fixo consertou a coluna e não a tela cheia —
  // lá o mesmo 12 continua mostrando a região metropolitana.
  //
  // Na caixa pequena o que serve é escala de bairro (centro na MEDIANA da
  // carteira, e não na média: um prédio no litoral puxaria a média para o
  // mar). Na caixa grande, quem abriu a tela cheia abriu para ver geografia —
  // ali a carteira inteira, enquadrada com respiro, é a resposta.
  if (!_pontos.length) {
    if (!_carteiraPts.length) return;
    if (_mapaTurno.getSize().x > MAPA_LARGO) {
      _mapaTurno.fitBounds(L.latLngBounds(_carteiraPts), { padding: [60, 60], maxZoom: 13 });
    } else if (_centroCarteira) {
      _mapaTurno.setView(_centroCarteira, ZOOM_CARTEIRA);
    }
    return;
  }
  // ⚠️ `maxZoom` 13, era 14 — e o motivo nasceu com a carteira. Com UM
  // chamado, o 14 colava o mapa nele e varria toda a vizinhança da tela:
  // o operador via o prédio e mais nada, quando a pergunta que o mapa
  // responde ("quem pode ir") é justamente sobre o que está em volta.
  _mapaTurno.fitBounds(L.latLngBounds(_pontos), { padding: [40, 40], maxZoom: 13 });
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

/* ── "Sem sinal": a posição existe, mas envelheceu ───────────────────────
   ⚠️ 10 MINUTOS, o mesmo do `_tecStale` do admin, e o número é do Android:
   fabricante que otimiza bateria atrasa o callback do serviço de GPS, então
   um intervalo curto acusaria "sem sinal" em técnico que está mandando
   posição normalmente.
   ⚠️ E ISTO NÃO É A JANELA DE 30 MINUTOS DO BACKEND. Lá, passados 30 min, a
   posição some da consulta e o pino deixa de existir; aqui é a faixa ENTRE as
   duas — a posição ainda vem, mas já não é "agora". Era justamente essa faixa
   que a tela não distinguia: um GPS parado há 25 minutos pulsava igual a quem
   acabou de mandar. */
const GPS_PARADO_MIN = 10;

function _minDesde(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}
function _gpsParado(iso) {
  const m = _minDesde(iso);
  return m === null || m >= GPS_PARADO_MIN;
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
  // ⚠️ A CARTEIRA É FUNDO, e os prédios que já estão na fila saem dela: um
  // ponto pequeno debaixo do pino do chamado não acrescenta nada e ainda faz
  // o pino grande parecer ter uma sombra.
  const naFila = new Set(chamados.map((c) => c.condominio.id));
  const carteira = (DADOS.condominios || []).filter((c) => !naFila.has(c.id));

  // Leaflet centrado no oceano é pior que uma frase — mas agora isto só
  // acontece num sistema sem NENHUM prédio geocodificado.
  if (!chamados.length && !equipe.length && !carteira.length) {
    // O mapa vai embora inteiro, e com ele os listeners de gesto: a próxima
    // instância nasce em modo automático de novo.
    if (_mapaTurno) {
      _mapaTurno.remove(); _mapaTurno = null;
      _mapaEnquadrado = false; _operadorMexeu = false;
      _balao = null; _balaoId = null;
    }
    tela.innerHTML = '<p class="mapa-vazio">Nenhum prédio com endereço no mapa ainda.</p>';
    return;
  }

  if (!_mapaTurno) {
    tela.innerHTML = "";
    _mapaTurno = L.map(tela, { zoomControl: false, attributionControl: true });
    camadaTiles(_mapaTurno);
    _pinos = L.layerGroup().addTo(_mapaTurno);
    _ouvirGestos(_mapaTurno);
  }

  _pinos.clearLayers();
  const pontos = [];

  // ⚠️ O FUNDO ENTRA PRIMEIRO, e a ordem é a que importa: o Leaflet empilha
  // na ordem de inserção, então desenhar a carteira depois poria pontinhos
  // por cima dos pinos que se clicam. É o mesmo defeito que o
  // `zIndexOffset` do pino de chamado corrigiu com os técnicos.
  //
  // ⚠️ SEM CLIQUE, de propósito. Prédio sem chamado não tem o que abrir
  // nesta tela — um pino que reage e não faz nada ensina a não clicar em
  // pino. O nome vem no tooltip, que é o que responde "que prédio é aquele
  // ali do lado".
  //
  // ⚠️ E NÃO ENTRA EM `pontos`: o enquadramento é da DECISÃO. Com a carteira
  // dentro, o mapa abriria na Grande São Paulo inteira e o chamado que
  // estoura viraria um ponto de 3px.
  // ⚠️ O PINO DA CARTEIRA É O PINO DO ADMIN (31/08, terceira tentativa e a
  // que o Pedro pediu desde o começo: "olha o painel de admin, ícones de
  // condomínios coloridos... aqui no operador é tudo quadradinho
  // transparente"). Ele estava certo e eu insisti duas vezes num ponto
  // neutro, argumentando que cor de carteira competiria com a cor do
  // relógio. Competir era hipótese minha; um mapa que não se lê é fato.
  //
  // O que veio de lá: ícone de prédio branco sobre campo colorido pelo
  // estado. O que NÃO veio: o `border-radius: 7px` — esta folha é de raio
  // zero, então o campo é a placa chanfrada da casa.
  //
  // ⚠️ VERDE É "NADA ERRADO AQUI", inclusive para prédio sem telemetria — é o
  // que o `_mcStatusKind` do admin faz (sem alerta e sem chamado → `ok`), e é
  // o que faz o mapa parecer um mapa em vez de um erro de carregamento.
  const ROT_BANDA = { critico: "nível crítico", baixo: "nível baixo", mudo: "sem leitura" };
  carteira.forEach((c) => {
    const b = c.banda && c.banda !== "ok" ? c.banda : "ok";
    const rot = ROT_BANDA[b];
    L.marker([c.lat, c.lng], { interactive: true, keyboard: false,
      // O que pede atenção sobe: num mapa de 87 prédios, um crítico atrás de
      // um vizinho em ordem desaparece — e é o único que não pode sumir.
      zIndexOffset: b === "ok" ? 0 : 400,
      icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<div class="pin pin-base" data-b="${b}">${I.predio}</div>` }) })
      .bindTooltip(`${escapar(c.nome || "—")}${c.bairro ? ` · ${escapar(c.bairro)}` : ""}${
        rot ? ` <b>${rot}</b>` : ""}`,
                   { className: "pin-rot", direction: "top", offset: [0, -13] })
      .addTo(_pinos);
  });

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
    // ⚠️ `zIndexOffset` 500 — entre a carteira (0/400) e o chamado (1000).
    // O Leaflet empilha por latitude, então sem isto um prédio de fundo ao sul
    // cobria o técnico, e o técnico é a peça que a tela precisa que seja
    // achada. Continua ABAIXO do chamado, que é o único que abre alguma coisa
    // no clique (o mesmo motivo que deu 1000 a ele).
    const parado = _gpsParado(t.gps_em);
    const desde = _minDesde(t.gps_em);
    L.marker(p, { zIndexOffset: 500,
      icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<div class="pin pin-tec${parado ? " is-stale" : ""}" data-liv="${
          t.disponivel && !t.abertos ? 1 : 0}">${iniciais(t.nome)}</div>` }) })
      // A legenda diz o que o pino não cabe: quantos chamados, e — quando o
      // GPS parou — há quanto tempo aquela posição está velha. Sem o segundo,
      // o operador despacha para onde o técnico ESTAVA.
      .bindTooltip(`${escapar(t.nome)} <b>${t.abertos || 0}</b>${
        parado ? ` <b>sem sinal ${haQuanto(desde)}</b>` : ""}`,
                   { className: "pin-rot", direction: "top", offset: [0, -11] })
      .addTo(_pinos);
  });

  _pontos = pontos;
  // ⚠️ SEM DECISÃO NA TELA, o mapa NÃO faz `fitBounds` na carteira — ele
  // CENTRA nela. A diferença apareceu com os 86 prédios reais: enquadrar
  // todos abre a Grande São Paulo inteira, de Barueri a Mauá, e o mapa vira
  // uma foto de satélite com pontinhos. É o mesmo motivo pelo qual o admin
  // usa `_mcCentroMediano` + `MC_ZOOM_INICIAL` em vez de `fitBounds`, e o
  // comentário está lá desde sempre — eu é que não fui ler antes.
  // Mediana e não média: um prédio no Guarujá puxaria a média para o mar.
  _carteiraPts = carteira.map((c) => [c.lat, c.lng]);
  if (!pontos.length && carteira.length) {
    const med = (ns) => { const s = [...ns].sort((a, b) => a - b); const i = s.length >> 1;
      return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
    _centroCarteira = [med(carteira.map((c) => c.lat)), med(carteira.map((c) => c.lng))];
  } else {
    _centroCarteira = null;
  }
  // ⚠️ ENQUADRA ATÉ O OPERADOR MEXER — ver `_precisaEnquadrar` e o comentário
  // de `_operadorMexeu`. O que não pode acontecer é o `fitBounds` do ciclo de
  // 30s arrancar o mapa da mão de quem acabou de dar zoom num bairro; enquanto
  // essa mão não chegou, um ponto fora da vista é defeito, não preferência.
  // ⚠️ O FOCO NO CHAMADO NOVO SUBSTITUI O ENQUADRAMENTO DESTE CICLO, não se
  // soma a ele. Os dois mexem na vista: enquadrar e depois voar são dois
  // movimentos seguidos na mesma tela, e o primeiro é descartado antes de
  // alguém conseguir lê-lo.
  const alvo = _chamadoParaFocar(chamados);
  if (!alvo && _precisaEnquadrar(pontos)) {
    enquadrarMapa();
    _mapaEnquadrado = true;
  }
  // O contêiner acabou de ser movido para dentro do trilho recém-montado:
  // sem isto o Leaflet ainda acredita no tamanho que media antes da mudança.
  _mapaTurno.invalidateSize();
  // E é aqui que o ciclo de 30s pega a mudança de largura da janela, que não
  // tem listener próprio: a caixa recém-medida decide a escala dos pinos.
  escalaPinos();
  // ⚠️ DEPOIS do `invalidateSize`, e isso não é ordem por acaso: o `flyTo`
  // calcula o destino a partir do tamanho da caixa, e a caixa acabou de mudar
  // de lugar no DOM. Voar antes de medir centra no lugar errado.
  if (alvo) {
    _focarChamado(alvo);
    _mapaEnquadrado = true;
  } else {
    _sincronizarBalao();
  }
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
  //
  // ⚠️ DOIS `requestAnimationFrame`, e o segundo não é paranoia. A classe
  // acabou de ser trocada nesta linha; no PRIMEIRO quadro o navegador ainda
  // pode não ter recalculado o estilo, e o `invalidateSize()` mede a caixa
  // ANTIGA — o Leaflet guarda esse valor em `_size` e passa a responder com
  // ele. Medido em 31/08: 368px de largura logo depois de entrar em tela
  // cheia, quando a caixa real já era 1910.
  // Isso não incomodava enquanto o enquadramento era sempre `fitBounds`; com
  // a regra que ESCOLHE pelo tamanho (coluna → escala de bairro, tela cheia →
  // carteira inteira), medir errado escolhe errado.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _mapaTurno?.invalidateSize();
    enquadrarMapa();
    escalaPinos();
  }));
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

/* ⚠️ "CLIQUEI E NADA ACONTECEU" — corrigido em 31/08, e não era um erro: era
   a soma de duas esperas silenciosas, medidas nesta tela.

   1. O PATCH levou **3,8 s** contra o banco de teste (Railway, via proxy).
      Nesse tempo o único sinal era o cartão do técnico com `opacity: .5` —
      que parece um botão desabilitado, não um botão trabalhando.
   2. Despachado, o chamado TROCA DE SEÇÃO: sai de "Esperando alguém" e vai
      para "Já tem técnico". Medido no caso real: o item foi parar em
      **y = 1258 numa janela de 709px** — duas dobras abaixo. Da cadeira de
      quem clicou, o item simplesmente sumiu da tela.

   Juntas: quase quatro segundos de nada, o diálogo fecha, e o item
   desaparece de onde a pessoa estava olhando. "Nada aconteceu" é a leitura
   correta do que a tela mostrava.

   As três correções abaixo não mexem no backend — o despacho sempre
   funcionou. O que faltava era a tela CONTAR o que fez. */
async function despachar(chamadoId, tecnicoId) {
  const btn = document.querySelector(`[data-acao="escolher"][data-tec="${tecnicoId}"]`);
  // 1. O botão DIZ que está trabalhando, em vez de só apagar. `data-ocupado`
  //    e não uma troca de texto: o cartão tem nome, estado e contagem, e
  //    reescrever tudo isso perderia a informação de quem foi escolhido.
  if (btn) { btn.disabled = true; btn.dataset.ocupado = "1"; }
  const tec = (DADOS.tecnicos || []).find((t) => t.id === tecnicoId);
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
    // 2. A faixa conta o que aconteceu E PARA ONDE O ITEM FOI. Sem a segunda
    //    metade, quem procura o chamado no lugar de antes não acha.
    avisar(`Chamado #${chamadoId} com ${tec ? tec.nome : "o técnico"}. Ele foi para “Já tem técnico”.`, true);
    // 3. E o olho vai atrás dele. `block:"center"` porque o item pode estar
    //    tanto abaixo quanto acima; `smooth` para a pessoa VER o percurso —
    //    um salto instantâneo não ensina onde a lista o pôs.
    // ⚠️ `setTimeout`, NÃO `requestAnimationFrame`. O rAF não dispara em aba
    //    em segundo plano, e este trecho roda depois de um `await` que pode
    //    levar segundos — tempo de sobra para alguém trocar de aba enquanto
    //    espera o despacho. É a mesma armadilha que deixou os tiles do mapa
    //    do admin invisíveis (ver `fadeAnimation: false` no admin.js), e ela
    //    custou uma investigação inteira aqui: com a aba fora de foco o
    //    scroll simplesmente nunca acontecia, sem erro nenhum no console.
    setTimeout(() => {
      const el = document.querySelector(`.item [data-acao="ficha"][data-id="${chamadoId}"]`)?.closest(".item");
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("nova");
    }, 0);
  } catch (e) {
    avisar(e.message);
    if (btn) { btn.disabled = false; delete btn.dataset.ocupado; }
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

/* As opções do seletor de técnico, com o MESMO estado que o cartão do diálogo
   de despacho escreve — livre, ocupado, quantos chamados carrega. Um nome só
   não é escolha informada: numa lista de nove, quem decide precisa saber quem
   está livre sem abrir outra tela.

   ⚠️ A ORDEM É A DO DESPACHO (livre primeiro, depois menos carregado), e não
   alfabética. As duas telas respondem à mesma pergunta — "quem pode ir" —, e
   uma ordem diferente em cada uma ensinaria que a primeira posição não quer
   dizer nada.

   ⚠️ O VAZIO VEM PRIMEIRO E É O PADRÃO. Formulário que já vem com alguém
   escolhido atribui por inércia: o operador confirma sem ler, e o chamado sai
   com um técnico que ninguém decidiu mandar. */
function tecEstado(t) {
  const n = t.abertos || 0;
  const carga = n === 1 ? "1 chamado" : n + " chamados";
  if (!t.disponivel) return n ? "ocupado · " + carga : "ocupado";
  return n ? carga : "livre agora";
}
function opcoesTecnico(lista) {
  const arr = [...(lista || [])].sort(
    (a, b) => (b.disponivel - a.disponivel) || (a.abertos - b.abertos));
  return `<option value="">Despachar depois</option>` + arr
    .map((t) => `<option value="${t.id}">${escapar(t.nome)} · ${tecEstado(t)}</option>`)
    .join("");
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
        <div class="onde" style="margin-top:7px">Nasce aberto, na fila do turno</div></div>
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
      <!-- ⚠️ O TÉCNICO VEM DEPOIS DA DESCRIÇÃO, e a ordem é a da conversa ao
           telefone: onde, o que, quanto corre, o que foi dito — e só então
           quem vai. Escolher antes de escrever o relato seria escolher sem o
           que a decisão precisa.
           ⚠️ E é OPCIONAL, sempre: a fila continua sendo o lugar de despachar
           o que chega sem dono. O padrao e "despachar depois" e nao o primeiro
           tecnico da lista — abrir um chamado nao pode atribuir alguem por
           inercia de formulario.
           (Sem crase neste comentario: ele vive dentro de um template literal,
            e crase aqui FECHA o template. Ver CLAUDE.md.) -->
      <div class="campo largo">
        <label for="nvTec">Técnico</label>
        <select id="nvTec">${opcoesTecnico(DADOS.tecnicos)}</select>
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
        tabela completa de prazos. Escolher o técnico aqui já <b>para o relógio
        da primeira resposta</b>; sem ele, o chamado entra em “Esperando
        alguém”.</p>
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
  const tecnico_id = Number(document.getElementById("nvTec")?.value) || null;
  const msg = document.getElementById("nvMsg");

  if (!condominio_id) { if (msg) msg.textContent = "Escolha o prédio."; return; }
  if (!titulo) { if (msg) msg.textContent = "Escreva um título."; return; }

  try {
    const r = await fetch("/chamados", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ condominio_id, titulo, descricao, categoria, prioridade, tecnico_id }),
    });
    const d = await lerJson(r, "Novo chamado");
    if (!r.ok) throw new Error(d.error || "Erro ao abrir o chamado");
    fechar();
    await carregar();
    // ⚠️ A FAIXA DIZ PARA QUAL SEÇÃO O CHAMADO FOI, e é a mesma correção do
    // despacho: a fila tem duas seções, o item novo cai numa delas conforme a
    // escolha do técnico, e pode nascer abaixo da dobra. Sem esta linha, quem
    // abriu o chamado procura na seção errada e conclui que não salvou.
    const tec = (DADOS.tecnicos || []).find((t) => t.id === d.tecnico_id);
    avisar(tec
      ? `Chamado #${d.id} aberto com ${tec.nome}. Ele está em “Já tem técnico”.`
      : `Chamado #${d.id} aberto. Ele está em “Esperando alguém”.`, true);
  } catch (e) {
    if (msg) msg.textContent = e.message;
  }
}

// Aviso de erro: uma faixa, não um alert(). `alert` trava a tela inteira, e
// numa tela de turno isso significa parar de receber.
function avisar(texto, ok) {
  document.getElementById("aviso")?.remove();
  // ⚠️ A FAIXA VAI PARA DENTRO DO DIÁLOGO QUANDO HÁ UM, e o `z-index` dela
  // não tem nada a ver com isso. Desde que o diálogo virou `<dialog>` com
  // `showModal()`, ele vive no TOP LAYER — que é pintado acima de toda a
  // página, por especificação e não por número. Uma faixa pendurada no
  // `<body>` ficaria por baixo dele por mais alto que fosse o z-index.
  // Isso importa aqui mais que em qualquer outro lugar da tela: o erro que
  // esta faixa carrega é justamente o do despacho que falhou — a mensagem
  // que o operador precisa ler está sempre com um diálogo aberto na frente.
  // ⚠️ `data-t` separa CONFIRMAÇÃO de ERRO (31/08). A faixa era vermelha
  // sempre, porque só existia para erro; usar o mesmo vermelho para dizer
  // "despachado com sucesso" ensina o operador a não olhar para o vermelho —
  // e `--risco` nesta folha é estado crítico, que não aparece por outro
  // motivo (A Regra do Crítico Silencioso).
  // `status` e não `alert` na confirmação: leitor de tela não deve
  // interromper quem está lendo para dizer que deu certo.
  (document.getElementById("fundo") || document.body).insertAdjacentHTML("beforeend",
    `<div class="aviso" id="aviso" data-t="${ok ? "ok" : "erro"}"
       role="${ok ? "status" : "alert"}">${escapar(texto)}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), ok ? 7000 : 6000);
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
  // O "Sair" é identificado por id, não por `data-acao`: ele é o mesmo botão
  // das telas irmãs, e lá o seletor é o id. Manter o mesmo contrato evita que
  // a peça compartilhada precise de um atributo só nesta folha.
  if (e.target.closest("#btnSair")) return logout();
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

/* ── Sair ────────────────────────────────────────────────────────────
   ⚠️ O MESMO `logout()` das telas irmãs (`cliente.js`, `admin.js`): apaga o
   que identifica a sessão e manda para o `/login`. Sem `confirm()` — sair
   não destrói nada e desfazer é entrar de novo; perguntar "tem certeza?"
   numa ação reversível gasta a pergunta que devia ficar guardada para as
   irreversíveis.
   ⚠️ `userRole` VAI JUNTO. O `cliente.js` só limpa token e user porque nunca
   grava a role; aqui ela é gravada no login e, deixada para trás, o próximo
   a entrar nesta máquina começa com a role de quem saiu. */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userRole");
  window.location.href = "/login";
}

/* Quem está na barra. ⚠️ O NOME AGORA VEM DO `localStorage` PRIMEIRO e só
   depois é confirmado pelo servidor: o `/admin/me` leva o mesmo tempo das
   outras chamadas contra o banco via proxy, e a barra ficava sem nome nesse
   intervalo. O primeiro nome é sempre o certo — quem o gravou foi o login. */
(function nomeNaBarra() {
  const el = document.getElementById("barraEu");
  if (!el) return;
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (u.nome) el.textContent = primeiroNome(u.nome);
  } catch { /* localStorage pode estourar em aba anônima; a barra sem nome não quebra o turno */ }
  fetch("/admin/me", { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => { if (me?.nome) { el.textContent = primeiroNome(me.nome); el.title = me.nome; } })
    .catch(() => { /* idem */ });
})();

/* ⚠️ PRIMEIRO NOME, não o nome inteiro. A barra desta tela já carrega marca,
   rótulo do turno, três botões e o Sair; "Marina Aparecida da Silva Técnica"
   comeria o espaço dos alvos que a pessoa veio usar. Quem está logado sabe o
   próprio sobrenome — o nome completo fica no `title`. */
function primeiroNome(n) {
  return String(n).trim().split(/\s+/)[0] || n;
}

/* A barra ganha fundo sólido e fio ao rolar; em repouso ela não pesa sobre o
   campo. Mesmo limiar (12px) e mesma classe da landing e do painel do
   cliente — as três barras trocam de estado na mesma rolagem. Aqui faltava,
   e a barra vivia opaca com o fio já desenhado. */
// ⚠️ E O ESTADO INICIAL, não só o listener. O navegador RESTAURA a posição
// de rolagem ao recarregar: quem dá F5 no meio da lista volta com a página
// rolada e um `scroll` que nunca aconteceu — a barra nascia translúcida,
// com o conteúdo passando por baixo dela, até a pessoa rolar de novo.
function _barraRolada() {
  document.querySelector(".barra")?.classList.toggle("is-rolada", scrollY > 12);
}
addEventListener("scroll", _barraRolada, { passive: true });
_barraRolada();

tique();
setInterval(tique, 20000);
laco();
