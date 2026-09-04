// operador-preventivas.js — Preventivas do mês (/operador/painel/preventivas).
//
// A terceira tela do operador. O contrato obriga a visita mensal a cada prédio
// (cláusula de preventiva das minutas); esta tela é o instrumento de cobrança:
// o que falta fazer no mês, quem vai, e o que já saiu.
//
// ⚠️ NÃO importa nada de `admin.js`, `operador.js` nem `operador-orcamentos.js`.
// Mesma regra das telas irmãs, e o mesmo motivo: foi compartilhando helper que
// o painel do cliente virou refém do admin até 13/08/2026. Os helpers de sessão
// abaixo são cópia deliberada, não descuido.
//
// ⚠️ A TELA LISTA PLANOS, NÃO CHAMADOS. O chamado P4 da preventiva só nasce
// quando o técnico chega no prédio e toca "Iniciar" no app — listar chamados
// mostraria só o que já começou, e o que esta tela precisa responder é o que
// FALTA. Ver `GET /operador/preventivas`.

/* ── Sessão ──────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}
if (!getToken()) window.location.href = "/login";

// 401 desloga; 403 NÃO — tratar os dois igual produz o loop silencioso que
// derrubou o painel do cliente em 30/07/2026.
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

// Resposta em HTML (413, 404, 502 do proxy) estoura `Unexpected token '<'` no
// `.json()` e esconde o erro real. Ver CLAUDE.md.
async function lerJson(resp, contexto) {
  const txt = await resp.text();
  try { return txt ? JSON.parse(txt) : {}; }
  catch {
    console.error(`[${contexto}] resposta não-JSON (${resp.status}):`, txt.slice(0, 300));
    return { error: `O servidor respondeu ${resp.status} em vez de dados.` };
  }
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// `proxima_em` é DATE (YYYY-MM-DD), sem fuso. Passar por `new Date()`
// interpreta como meia-noite UTC e mostra um dia a menos no Brasil — a mesma
// razão pela qual o `_pmFmtData` do admin fatia a string em vez de parsear.
function dia(iso) {
  if (!iso) return null;
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
               "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function mesPorExtenso(mes) {
  const [a, m] = String(mes).split("-");
  return `${MESES[Number(m) - 1]} de ${a}`;
}

/* ── A tela ──────────────────────────────────────────────────────────── */
let DADOS = { mes: null, planos: [], tecnicos: [] };
let MES = null;                 // YYYY-MM sendo exibido
let SEL = new Set();            // ids marcados para o despacho em lote
let VER_FEITAS = false;

// ⚠️ O QUE JÁ FOI FEITO SAI DA LISTA, e recolhe para uma linha no fim — mesma
// decisão de Aprovados (31/08, "se não vai ficar pra sempre e vai ficar tudo
// poluído"). A tela responde "o que falta", e uma preventiva feita não responde
// mais nada. Mas não some: o operador precisa poder conferir o mês inteiro no
// dia 30, e é a linha "N já feitas · mostrar" que devolve.

const ESTADO_ROT = {
  a_fazer:  "A fazer",
  escalada: "Escalada",
  em_campo: "Em campo",
  feita:    "Feita",
};

function feita(p) { return p.estado === "feita"; }

async function carregar(mes) {
  const q = mes ? "?mes=" + encodeURIComponent(mes) : "";
  const r = await fetch("/operador/preventivas" + q, { headers: authHeaders() });
  const d = await lerJson(r, "Preventivas");
  if (!r.ok) throw new Error(d.error || "Erro ao carregar as preventivas");
  DADOS = d;
  MES = d.mes;
  // ⚠️ A SELEÇÃO NÃO SOBREVIVE À TROCA DE MÊS. Ids marcados em agosto
  // despachados como se fossem de setembro é exatamente o erro que a
  // competência existe para impedir.
  SEL = new Set();
  return d;
}

/* ── O agrupamento ───────────────────────────────────────────────────── */
// ⚠️ POR ZONA, e isso não é organização: é a pergunta que a tela responde. O
// despacho da preventiva é regional — "a Zona Leste vai com o Cleber" — e o
// Pedro pediu as duas formas, região e prédio a prédio. Agrupar por zona faz a
// primeira ser um clique e não atrapalha a segunda.
function agrupar(lista) {
  const grupos = new Map();
  for (const p of lista) {
    const chave = p.zona || "Sem zona";
    if (!grupos.has(chave)) grupos.set(chave, { zona: chave, itens: [] });
    grupos.get(chave).itens.push(p);
  }
  // ⚠️ QUEM TEM MAIS ATRASO SOBE. A lista é fila de trabalho, não cadastro: a
  // tela responde "por onde começo".
  return [...grupos.values()].sort((a, b) => {
    const ax = a.itens.filter((p) => p.atrasada && !feita(p)).length;
    const bx = b.itens.filter((p) => p.atrasada && !feita(p)).length;
    if (ax !== bx) return bx - ax;
    return b.itens.length - a.itens.length;
  });
}

/* ── As peças ────────────────────────────────────────────────────────── */
function selo(p) {
  if (feita(p)) {
    const quando = p.fechado_em ? dia(p.fechado_em) : (p.ultima_em ? dia(p.ultima_em) : null);
    return `<span class="pv-selo" data-e="feita">Feita${quando ? " · " + escapar(quando) : ""}</span>`;
  }
  if (p.estado === "em_campo") {
    return `<span class="pv-selo" data-e="campo">Em campo · chamado #${p.chamado_aberto_id}</span>`;
  }
  // ⚠️ O ATRASO GANHA DO "A FAZER" NO SELO. Uma preventiva de agosto ainda
  // aberta em setembro não é "a fazer" — é dívida, e a tela tem de dizer isso
  // com a palavra que cobra.
  if (p.atrasada) return `<span class="pv-selo" data-e="atrasada">Atrasada · venceu ${escapar(dia(p.proxima_em))}</span>`;
  if (p.estado === "escalada") return `<span class="pv-selo" data-e="escalada">Escalada</span>`;
  return `<span class="pv-selo" data-e="afazer">Vence ${escapar(dia(p.proxima_em))}</span>`;
}

/* ⚠️ UMA FRASE, NUNCA UMA PILHA DE METADADOS — a regra que Aprovados aprendeu
   em 31/08: "a coluna de quatro linhas em mono mandava na altura de toda
   linha". A primeira versão desta tela tinha o serviço numa linha e o
   responsável em outra, e o rodapé media 136ch contra os 88 da irmã.

   ⚠️ MAS A ORIGEM CONTINUA ETIQUETA. "Escalado" é decisão de alguém neste mês;
   "pela zona" é o padrão da região — e sem a distinção o operador não sabe o
   que ele mesmo já despachou. Etiqueta dentro da frase, não outra linha. */
function rodape(p) {
  const partes = [escapar(p.titulo)];
  if (p.bairro) partes.push(escapar(p.bairro));

  let quem;
  if (!p.tecnico_nome) {
    quem = `<b class="pv-sem">sem técnico definido</b>`;
  } else {
    const origem = p.tecnico_origem === "escala"
      ? `<span class="pv-origem">escalado</span>`
      : `<span class="pv-origem is-zona">pela zona</span>`;
    quem = `<b class="pv-quem">${escapar(p.tecnico_nome)}</b> ${origem}`;
  }
  return `<p class="pv-meta">${partes.join(" · ")} · ${quem}</p>`;
}

function linha(p) {
  const marcavel = !feita(p) && p.estado !== "em_campo";
  const marcado = SEL.has(p.id);
  return `
  <article class="pv-item${p.atrasada && !feita(p) ? " is-atrasada" : ""}${marcado ? " is-marcada" : ""}"
           data-pv-id="${p.id}">
    ${marcavel ? `
    <label class="pv-check">
      ${/* ⚠️ O `input` fica, e some visualmente: teclado, leitor de tela e o
           estado `:checked` continuam sendo dele. Quem desenha é o `.pv-caixa`
           ao lado — o checkbox nativo com `accent-color` é peça do SISTEMA
           OPERACIONAL, e as telas irmãs não têm nenhuma. Numa folha que corta
           toda peça com chanfro, o quadradinho arredondado do Windows era o
           único elemento que não era da casa. */""}
      <input type="checkbox" data-pv-marcar="${p.id}" ${marcado ? "checked" : ""}
        aria-label="Escolher ${escapar(p.condominio_nome)} para despachar">
      <span class="pv-caixa" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"
             stroke-linecap="square" stroke-linejoin="miter"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
      </span>
    </label>` : `<span class="pv-check is-off" aria-hidden="true"></span>`}
    <div class="pv-item-main">
      <div class="pv-item-topo">
        ${/* ⚠️ O PRÉDIO É A LEITURA GRANDE desta placa — o lugar que em
             Aprovados é do serviço aprovado, e no print do painel do cliente
             era do "R$ 2.332,00". Medido antes deste passe: 16,3px/700 aqui
             contra 21,6px/800 na irmã, e a placa lia plana. É por ele que se
             acha o item quando o técnico liga, e a brief da superfície já
             registrava isso sobre a fila. */""}
        <h3 class="pv-nome">${escapar(p.condominio_nome)}</h3>
        ${selo(p)}
      </div>
      ${rodape(p)}
    </div>
  </article>`;
}

function grupo(g) {
  const abertas = g.itens.filter((p) => !feita(p));
  const atrasadas = abertas.filter((p) => p.atrasada).length;
  // "A fazer" aqui é o que ainda espera despacho — escalada e em campo já
  // têm dono, e contá-las faria o número não descer conforme o operador
  // trabalha, que é justamente o que ele precisa ver acontecer.
  const aFazer = abertas.filter((p) => p.estado === "a_fazer").length;
  // ⚠️ O BOTÃO DA ZONA SÓ EXISTE COM O QUE DESPACHAR. "Escalar a zona toda"
  // numa zona já resolvida é um botão que não faz nada — e botão que não faz
  // nada é pior que nenhum botão (a mesma regra do estado "andando" em
  // Aprovados).
  const despachaveis = abertas.filter((p) => p.estado !== "em_campo");
  return `
  <section class="pv-zona">
    <div class="pv-zona-cab">
      <div class="pv-zona-id">
        <h2>${escapar(g.zona)}</h2>
        ${/* ⚠️ É AQUI QUE O ÂMBAR DA CASA ENTRA NA LISTA, e não no selo de cada
             linha. Medido antes deste passe: a tela inteira tinha âmbar em UMA
             peça (a manchete) contra três em Aprovados — o "monocromático" que
             o Pedro nomeou em 31/08. Mas selo âmbar por item viraria textura:
             no dia 1 do mês TODAS as preventivas estão a fazer, e 72 selos
             acesos não sinalizam nada. No cabeçalho da zona ele acende uma vez
             por região — que é onde a decisão de despacho se toma — e APAGA
             conforme o mês é resolvido. */""}
        ${/* ⚠️ "TUDO DESPACHADO · 2 ATRASADAS" SE CONTRADIZIA — visto no print
             do refino. "Despachado" lê como resolvido, e atrasada é dívida:
             a zona podia ter dono para tudo e ainda assim dever duas visitas.
             "Todas com responsável" diz o que de fato aconteceu (a escala está
             feita) e
             convive com o atraso sem prometer que ele sumiu. */""}
        <span class="pv-zona-sub">${
          aFazer ? `<b class="pv-conta">${aFazer} a fazer</b>` : "todas com responsável"}${
          atrasadas ? ` · <b class="pv-conta-atraso">${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}</b>` : ""}</span>
      </div>
      ${despachaveis.length ? `
      <button type="button" class="pv-zona-btn" data-acao="marcar-zona" data-zona="${escapar(g.zona)}">
        Escolher as ${despachaveis.length}
      </button>` : ""}
    </div>
    ${g.itens.map(linha).join("")}
  </section>`;
}

/* ── Redesenho parcial ───────────────────────────────────────────────── */
// ⚠️ DUAS PEÇAS MUDAM QUANDO SE MARCA UMA LINHA: a linha (a borda) e a barra
// do pé (a contagem, e a própria existência dela). O resto da tela é o mesmo,
// e reconstruí-lo custa o foco de quem está marcando.
function _pintarMarcada(id) {
  const el = document.querySelector(`.pv-item[data-pv-id="${id}"]`);
  if (el) el.classList.toggle("is-marcada", SEL.has(id));
}

function _atualizarBarra() {
  const antiga = document.querySelector(".pv-barra");
  const html = barraDespacho();
  if (!html) { antiga?.remove(); return; }
  if (!antiga) {
    document.getElementById("tela").insertAdjacentHTML("beforeend", html);
    return;
  }
  // ⚠️ SÓ O NÚMERO, não a barra inteira: recriar o `<select>` a cada clique
  // apagaria o técnico que a pessoa já escolheu antes de terminar de marcar.
  const n = antiga.querySelector(".pv-barra-n");
  if (n) n.textContent = `${SEL.size} ${SEL.size === 1 ? "escolhida" : "escolhidas"}`;
}

/* ── A barra de despacho ─────────────────────────────────────────────── */
// ⚠️ ELA SÓ APARECE COM ALGO MARCADO, e fica FIXA no pé. O operador marca
// rolando a lista; uma barra que vive no topo obrigaria a voltar até ela para
// despachar o que acabou de escolher lá embaixo.
function barraDespacho() {
  if (!SEL.size) return "";
  const nomes = DADOS.tecnicos.map((t) =>
    `<option value="${t.id}">${escapar(t.nome)}${t.abertos ? ` (${t.abertos} em aberto)` : ""}</option>`
  ).join("");
  // ⚠️ O CONTEÚDO VAI DENTRO DE `.pv-barra-in`, e isso não é invólucro à toa:
  // a barra sangra de ponta a ponta (o fundo e o fio), mas o que se lê tem de
  // cair na MESMA coluna da lista. Medido a 1920px antes disto: a lista
  // começava em x=455 e o "2 escolhidas" em x=32.
  //
  // ⚠️ A SETA É DESENHADA, como a caixa de marcar. `appearance:none` tira a
  // do sistema operacional; sem repor uma, o select vira um retângulo mudo.
  return `
  <div class="pv-barra" role="region" aria-label="Despachar preventivas">
    <div class="pv-barra-in">
      <span class="pv-barra-n">${SEL.size} ${SEL.size === 1 ? "escolhida" : "escolhidas"}</span>
      <label class="pv-barra-sel">
        <span class="sr-only">Técnico</span>
        <select id="pvTecnico">
          <option value="">Escolha o técnico…</option>
          ${nomes}
        </select>
        <svg class="pv-barra-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"
             aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>
      </label>
      ${/* ⚠️ "LIMPAR" VEM ANTES DE "ENVIAR" NO DOM, e o par encosta na
           direita da coluna. É a gramática do pé da placa de Aprovados —
           link discreto ("Já foi feito") e então a chapa âmbar ("Abrir
           chamado") —, e ela resolve dois defeitos de uma vez: a ação
           primária passa a terminar no MESMO x em que a placa do prédio
           termina, e o "Limpar" deixa de ser vizinho de 76px do botão que
           ele desfaz. No celular a `order` da folha devolve o "Enviar"
           para antes dele. */""}
      <button type="button" class="pv-barra-limpa" data-acao="limpar">Limpar</button>
      <button type="button" class="btn" data-acao="despachar">Enviar</button>
    </div>
  </div>`;
}

/* ── O desenho ───────────────────────────────────────────────────────── */
function render() {
  const tela = document.getElementById("tela");
  const abertas = DADOS.planos.filter((p) => !feita(p));
  const feitas  = DADOS.planos.filter(feita);

  const troca = `
    <div class="pv-mes">
      <button type="button" class="pv-mes-nav" data-acao="mes-ant" aria-label="Mês anterior">←</button>
      <span class="pv-mes-rot">${escapar(mesPorExtenso(MES))}</span>
      <button type="button" class="pv-mes-nav" data-acao="mes-prox" aria-label="Mês seguinte">→</button>
    </div>`;

  if (!DADOS.planos.length) {
    // ⚠️ ESTADO VAZIO É ESTADO, não ausência de peça — mesma regra do dia calmo
    // no painel do turno. E aqui ele tem uma causa provável que vale nomear: em
    // produção os planos estão inativos, e sem plano ativo não há preventiva.
    tela.innerHTML = `
      ${troca}
      <section class="calmo">
        <h1>Nenhuma preventiva em ${escapar(mesPorExtenso(MES))}.</h1>
        <p>Ou não há plano de manutenção vencendo neste mês, ou os planos estão
           inativos. Quem cadastra e reativa plano é o painel do admin, em
           <b>Planos</b>.</p>
      </section>`;
    return;
  }

  const atrasadas = abertas.filter((p) => p.atrasada).length;
  const semQuem = abertas.filter((p) => !p.tecnico_nome).length;

  const manchete = abertas.length
    ? `<h1>${abertas.length} preventiva${abertas.length > 1 ? "s" : ""} <b>a fazer</b>
         em ${escapar(mesPorExtenso(MES))}</h1>
       <p class="pv-lede">${
         atrasadas ? `<b class="pv-alerta">${atrasadas} já passou do vencimento.</b> ` : ""}${
         semQuem ? `${semQuem} sem técnico definido. ` : ""}Marque os prédios e
         envie para um técnico — a zona inteira ou um a um.</p>`
    : `<h1>O mês de ${escapar(mesPorExtenso(MES))} está <b>fechado</b>.</h1>
       <p class="pv-lede">Todas as preventivas deste mês já foram feitas.</p>`;

  const linhaFeitas = feitas.length ? `
    <div class="pv-feitas-cab">
      <span>${feitas.length} já ${feitas.length > 1 ? "feitas" : "feita"}</span>
      <button type="button" class="pv-verfeitas" data-acao="ver-feitas"
        aria-expanded="${VER_FEITAS ? "true" : "false"}">${
        VER_FEITAS ? "esconder" : "mostrar"}</button>
    </div>
    ${VER_FEITAS ? `<div class="pv-lista pv-lista-feitas">${
      agrupar(feitas).map(grupo).join("")}</div>` : ""}` : "";

  tela.innerHTML = `
    ${troca}
    <header class="pv-topo">${manchete}</header>
    <div class="pv-lista">${agrupar(abertas).map(grupo).join("")}</div>
    ${linhaFeitas}
    ${barraDespacho()}`;
}

/* ── As ações ────────────────────────────────────────────────────────── */
function avisar(texto, ok) {
  document.getElementById("aviso")?.remove();
  document.body.insertAdjacentHTML("beforeend",
    `<div class="aviso" id="aviso" data-t="${ok ? "ok" : "erro"}"
       role="${ok ? "status" : "alert"}">${escapar(texto)}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), ok ? 6000 : 8000);
}

function mesVizinho(passo) {
  const [a, m] = MES.split("-").map(Number);
  const d = new Date(a, m - 1 + passo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function trocarMes(passo) {
  try {
    await carregar(mesVizinho(passo));
    render();
  } catch (e) { avisar(e.message); }
}

async function despachar() {
  const sel = document.getElementById("pvTecnico");
  const tecnico = sel ? sel.value : "";
  if (!tecnico) { avisar("Escolha para qual técnico enviar."); sel?.focus(); return; }
  if (!SEL.size) return;

  const ids = [...SEL];
  const nome = sel.options[sel.selectedIndex].text.replace(/\s*\(\d+ em aberto\)$/, "");
  const btn = document.querySelector('[data-acao="despachar"]');
  if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }

  try {
    const r = await fetch("/operador/preventivas/atribuir", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ plano_ids: ids, tecnico_id: Number(tecnico), mes: MES }),
    });
    const d = await lerJson(r, "Despachar preventivas");
    if (!r.ok) { avisar(d.error || "Não foi possível enviar."); return; }

    // ⚠️ RECARREGA DO SERVIDOR em vez de remendar a lista local. A escala muda
    // estado, responsável e origem de cada linha; refazer isso à mão aqui é
    // criar uma segunda verdade sobre o mesmo mês.
    await carregar(MES);
    render();
    avisar(`${d.atribuidos} ${d.atribuidos === 1 ? "preventiva enviada" : "preventivas enviadas"} para ${nome}.`, true);
  } catch (e) {
    avisar("Erro ao enviar: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
  }
}

document.addEventListener("click", (e) => {
  if (e.target.closest("#btnSair")) return logout();

  const marcar = e.target.closest("[data-pv-marcar]");
  if (marcar) {
    const id = Number(marcar.dataset.pvMarcar);
    if (marcar.checked) SEL.add(id); else SEL.delete(id);
    // ⚠️ NÃO CHAMA `render()`. Redesenhar a lista inteira a cada caixinha
    // destrói o `<input>` que acabou de receber o clique — o foco vai para o
    // `body`, o Tab recomeça do topo, e quem marca vários seguidos com o
    // teclado perde o lugar a cada um. Também pisca a lista toda para mudar
    // uma borda. Aqui só a linha e a barra do pé mudam.
    _pintarMarcada(id);
    _atualizarBarra();
    return;
  }

  const b = e.target.closest("[data-acao]");
  if (!b) return;
  const a = b.dataset.acao;

  if (a === "mes-ant")  return trocarMes(-1);
  if (a === "mes-prox") return trocarMes(1);
  if (a === "despachar") return despachar();
  if (a === "limpar")   { SEL = new Set(); return render(); }   // some tudo: vale redesenhar
  if (a === "ver-feitas") { VER_FEITAS = !VER_FEITAS; return render(); }
  if (a === "ajuda")    return dlgAjuda();
  if (a === "marcar-zona") {
    // ⚠️ ALTERNA A ZONA INTEIRA. Marcada toda, o mesmo botão desmarca — sem
    // isso, escolher a zona errada obriga a desmarcar prédio a prédio.
    const zona = b.dataset.zona;
    const daZona = DADOS.planos.filter(
      (p) => (p.zona || "Sem zona") === zona && !feita(p) && p.estado !== "em_campo");
    const todosMarcados = daZona.length > 0 && daZona.every((p) => SEL.has(p.id));
    for (const p of daZona) { if (todosMarcados) SEL.delete(p.id); else SEL.add(p.id); }
    return render();
  }
});

/* ── Ajuda ───────────────────────────────────────────────────────────── */
// ⚠️ AS CLASSES SÃO AS DA FOLHA (`.fundo` + `.ficha`), e o diálogo é um
// `<dialog>` com `showModal()` — o mesmo de Aprovados. A primeira versão desta
// tela inventou `.dlg` e um fundo próprio: classes que não existem no
// `operador.css` renderizam sem estilo nenhum, e o diálogo abriria como um
// bloco de texto solto no fim da página.
//
// ⚠️ TEXTO CURTO É REQUISITO, não estilo (31/08, pedido do Pedro): uma ideia
// por frase, e nada que não sirva para USAR a tela. O porquê das regras é
// documentação, e o lugar dela é o `docs/`.
let _focoAnterior = null;

function fecharFundo() {
  const d = document.getElementById("fundo");
  if (d) { try { d.close(); } catch { /* já fechado */ } d.remove(); }
  document.body.classList.remove("com-ficha");
  if (_focoAnterior && _focoAnterior.isConnected) _focoAnterior.focus();
  _focoAnterior = null;
}

function dlgAjuda() {
  _focoAnterior = document.activeElement;
  fecharFundo();
  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="fundo" id="fundo">
      <div class="ficha" style="width:min(680px,100%)" role="dialog" aria-label="Como esta tela funciona">
        <div class="ficha-cab">
          <div><h2>Como esta tela funciona</h2></div>
          <button class="ficha-x" data-acao="fechar-ajuda" aria-label="Fechar"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="ajuda">
          <h3>Quem vai ao prédio</h3>
          <p>Sem escala, vale o responsável da zona.</p>
          <p>Ao enviar para um técnico aqui, o prédio passa a ser dele neste mês.
             E <b>sai do roteiro dos outros</b> — inclusive de quem responde pela
             zona. Assim dois técnicos não vão ao mesmo lugar.</p>
          <h3>Quando conta como feita</h3>
          <p>Quando o chamado da preventiva é fechado.</p>
          <p>Isso acontece quando o técnico finaliza a O.S. no prédio. Começar e
             não terminar não fecha o mês.</p>
          <h3>Atrasada</h3>
          <p>Venceu em mês anterior e ainda não foi feita. Ela continua aparecendo
             até sair.</p>
        </div>
        <div class="ficha-pe"><button class="btn" data-acao="fechar-ajuda">Entendi</button></div>
      </div>
    </dialog>`);
  const d = document.getElementById("fundo");
  d.showModal();
  d.addEventListener("cancel", (e) => { e.preventDefault(); fecharFundo(); });
  document.body.classList.add("com-ficha");
  const cx = d.querySelector(".ficha");
  if (cx) { cx.tabIndex = -1; cx.focus({ preventScroll: true }); }
}

document.addEventListener("click", (e) => {
  if (e.target.closest('[data-acao="fechar-ajuda"]')) return fecharFundo();
  // Clique no backdrop: o alvo é o próprio <dialog>, nunca a ficha dentro dele.
  if (e.target.id === "fundo") return fecharFundo();
});

/* ── Sair ────────────────────────────────────────────────────────────── */
// ⚠️ `userRole` VAI JUNTO — deixado para trás, o próximo a entrar nesta
// máquina começa com a role de quem saiu. Mesma regra das telas irmãs.
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userRole");
  window.location.href = "/login";
}

/* ⚠️ A BARRA ENDURECE AO ROLAR — e ISTO FALTAVA AQUI (04/09). A folha
   define `.barra` translúcida (`--mar-900` a 88% + `blur(14px)`) e
   `.barra.is-rolada` sólida com fio inferior; quem troca a classe é este
   listener, que existe no `operador.js` e no `operador-orcamentos.js` e
   nunca foi copiado para cá — a mesma omissão que Aprovados teve em 31/08.
   O efeito: a barra desta tela ficava translúcida PARA SEMPRE, e as placas
   claras dos prédios passavam por baixo dela borrando o cabeçalho.
   Mesmo limiar (12px) e mesma classe das três irmãs. */
// ⚠️ E O ESTADO INICIAL, não só o listener. O navegador RESTAURA a posição
// de rolagem ao recarregar: quem dá F5 no meio da lista volta com a página
// rolada e um `scroll` que nunca aconteceu.
function _barraRolada() {
  document.querySelector(".barra")?.classList.toggle("is-rolada", scrollY > 12);
}
addEventListener("scroll", _barraRolada, { passive: true });
_barraRolada();

/* ── Boot ────────────────────────────────────────────────────────────── */
(async () => {
  try {
    const eu = JSON.parse(localStorage.getItem("user") || "{}");
    const alvo = document.getElementById("barraEu");
    if (alvo && eu.nome) alvo.textContent = eu.nome;
  } catch { /* nome é enfeite; a tela não depende dele */ }

  try {
    await carregar();
    render();
  } catch (e) {
    document.getElementById("tela").innerHTML =
      `<section class="calmo"><h1>Não deu para carregar.</h1><p>${escapar(e.message)}</p></section>`;
  }
})();
