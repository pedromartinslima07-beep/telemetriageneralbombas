// operador-orcamentos.js — Aprovados (/operador/painel/orcamentos).
//
// A tela do operador para os orçamentos JÁ APROVADOS: o que foi autorizado,
// em qual prédio. Fluxo do módulo em docs/modulos/painel-operador.md.
//
// ⚠️ NÃO importa nada de `admin.js` nem de `operador.js`. É a mesma regra do
// painel do turno, e o motivo é o mesmo: foi compartilhando helper que o
// painel do cliente virou refém do admin até 13/08/2026. Os quatro helpers
// abaixo são cópia deliberada, não descuido.
//
// ⚠️ E NÃO EXISTE VALOR AQUI. Não é que a tela esconda o preço — o endpoint
// não devolve. Se um dia alguém precisar do valor nesta tela, a mudança é no
// backend e é uma decisão do Pedro, não um `display:none`.

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

/* ── Vocabulário ─────────────────────────────────────────────────────── */

// ⚠️ Os rótulos são os MESMOS do admin e do PDF. Um orçamento de limpeza que
// aparece como "Limpeza de reservatório" no documento assinado e como outra
// coisa aqui obriga o operador a traduzir no telefone.
const TIPO_ROT = {
  pecas: "Peças e serviços",
  limpeza_reservatorio: "Limpeza de reservatório",
  dedetizacao: "Dedetização",
  limpeza_dedetizacao: "Limpeza e dedetização",
};

// Data curta, como a barra do turno: o operador lê hora o dia inteiro e a
// data por extenso rouba a linha.
function dia(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ⚠️ TRÊS DATAS, NESTA ORDEM, e isso é dado de produção e não paranoia: dos
// aprovados no banco, a maioria tem `aprovado_em` NULO — a coluna só passou a
// ser preenchida quando a resposta pelo painel do cliente entrou (074).
// Ordenar ou exibir só por ela deixaria a maior parte da tela sem data.
function quando(o) {
  return dia(o.aprovado_em) || dia(o.respondido_em) || dia(o.criado_em);
}

/* ── A tela ──────────────────────────────────────────────────────────── */
let DADOS = [];

// ⚠️ O QUE JÁ FOI FEITO SAI DA LISTA (31/08, decisão do Pedro: "se não vai
// ficar pra sempre e vai ficar tudo poluído"). Ele está certo — a tela
// responde "o que a gente pode executar aqui", e um orçamento executado não
// responde mais nada. Sem isso a lista vira um cemitério que o operador
// aprende a ignorar, que é o começo de não ler a tela.
//
// ⚠️ MAS NÃO SOME PARA SEMPRE, e essa é a parte que não pode ser cortada:
// a marcação é de UM CLIQUE e sem confirmação. Se o que sai não tem volta, o
// erro de clique só se conserta no banco. São duas saídas, e as duas moram
// nesta tela:
//   1. a faixa que aparece na hora, com "Desfazer" dentro dela;
//   2. a linha "N já feitos · mostrar" no fim da lista, que é permanente.
let VER_FEITOS = false;

async function carregar() {
  const r = await fetch("/operador/orcamentos", { headers: authHeaders() });
  const d = await lerJson(r, "Orçamentos aprovados");
  if (!r.ok) throw new Error(d.error || "Erro ao carregar os orçamentos");
  DADOS = Array.isArray(d) ? d : [];
  render();
}

/* ══════════════════════════════════════════════════════════════════
   A PLACA DO ORÇAMENTO — registro de LEITURA, não de operação (31/08/2026)

   ⚠️ ESTA TELA SAIU DO REGISTRO DA FILA, e a decisão é do Pedro. Ele pôs
   lado a lado o print da lista de orçamentos do painel do CLIENTE
   (`/cliente/painel/orcamentos`) e esta, e a diferença de acabamento era
   gritante. Medido antes: a tela inteira vivia numa faixa de 12 a 17px, o
   maior tipo dela era o nome do prédio, e não havia UMA superfície clara —
   marinho sobre marinho sobre marinho, num painel de 7 itens que não tem a
   densidade da fila para justificar isso.

   A gramática agora é a daquele print, elemento por elemento:

     manchete branca com UMA palavra em âmbar   →  o "aguardam" de lá
     lede em --sobre-2, duas linhas curtas      →  idem
     placa CLARA (--chapa) por orçamento        →  o cartão de lá
     a leitura grande dentro da placa           →  o "R$ 2.332,00" de lá
     selo preenchido só quando pede ação        →  o "AGUARDANDO VOCÊ" de lá
     ação em âmbar cheio sobre a placa clara    →  o "Aprovar orçamento"

   ⚠️ E POR QUE ISSO NÃO QUEBRA "A REGRA DA SUPERFÍCIE" do DESIGN.md
   ("placa clara é o que ABRE POR CIMA"). A regra existe para impedir uma
   COLUNA clara permanente ao lado de conteúdo escuro — duas metades que
   competem, e nenhuma vence. Aqui não há lado a lado: a placa clara É o
   conteúdo da tela, com o marinho de campo em volta, que é exatamente o
   arranjo do painel do cliente e da landing. O que continua marinho é a
   fila do turno, que é tabela.

   ⚠️ SOBRE A PLACA CLARA O ÂMBAR NUNCA É TEXTO (Regra do Amarelo Cego,
   ~2:1). Ele entra só como PREENCHIMENTO com tinta marinho por cima — o
   botão e o selo. A palavra âmbar da manchete vive no campo marinho, acima
   das placas, que é onde o print de referência a põe também. */

/* ⚠️ A HIERARQUIA ESTAVA INVERTIDA (31/08, apontado pelo Pedro: "a
   visualização do orçamento em si não está tão boa do jeito que você está
   mostrando as informações").

   O que a placa mostrava como LEITURA GRANDE era "Peças e serviços" — rótulo
   de categoria do banco, que não informa nada — enquanto o texto mais útil
   da tela ficava no fim, em itálico cinza:

     "Bomba 3 — recalque. Faz barulho alto e desarma o disjuntor depois de
      10 minutos."

   Essa frase diz o EQUIPAMENTO, o DEFEITO e o SINTOMA. É por ela que o
   operador entende o serviço e é o que ele repete ao telefone. Estava
   tratada como nota de rodapé.

   A ordem agora é a da pergunta que a tela responde:

     1. o que foi diagnosticado  → a constatação, na leitura grande
     2. o que foi autorizado     → os itens, sob a etiqueta ITENS
     3. quando e por quem        → o rodapé

   ⚠️ SEM CONSTATAÇÃO, a leitura grande volta a ser o serviço: em orçamento
   por cláusula o próprio tipo informa ("Limpeza de reservatório"), e em
   orçamento de peças com uma linha só a peça É o serviço. O genérico "Peças
   e serviços" só aparece quando não há nem constatação nem uma peça única —
   ou seja, quando não existe frase melhor no banco. */

// Os ITENS aprovados. Em orçamento por cláusula não há lista: quem responde
// é o tipo, e ele já está no título.
//
// ⚠️ A LISTA APARECE MESMO COM UMA LINHA SÓ quando a constatação ocupou o
// título. Antes ela sumia abaixo de dois itens porque a peça virava o
// título; com o diagnóstico em cima, esconder a única peça aprovada
// esconderia justamente o que foi autorizado.
function itens(o) {
  const linhas = Array.isArray(o.linhas) ? o.linhas : [];
  if (o.tipo && o.tipo !== "pecas") return "";
  if (!linhas.length) return "";
  // Com a peça única no título, não repetir embaixo.
  if (linhas.length === 1 && !o.constatacao) return "";
  // ⚠️ A quantidade aparece só quando é MAIOR QUE UM. "1× Selo mecânico" põe
  // um número na frente de toda linha para não informar nada, e numa lista
  // inteira isso vira uma coluna de "1×" que o olho tem de pular.
  return `<div class="orc-aprov">
    <span class="orc-aprov-rot">Itens</span>
    <ul class="orc-itens">${linhas.map((l) => `
      <li>${l.quantidade > 1 ? `<b>${escapar(l.quantidade)}×</b> ` : ""}${escapar(l.descricao || "—")}</li>`).join("")}</ul>
  </div>`;
}

// A LEITURA GRANDE da placa. Ver o bloco acima para a ordem e o porquê.
function titulo(o) {
  if (o.constatacao) return o.constatacao;
  if (o.tipo && o.tipo !== "pecas") return TIPO_ROT[o.tipo] || o.tipo;
  const linhas = Array.isArray(o.linhas) ? o.linhas : [];
  if (linhas.length === 1) return linhas[0].descricao || TIPO_ROT.pecas;
  return TIPO_ROT.pecas;
}

/* ── O chamado que executa o orçamento ───────────────────────
   Migration 079: `chamados.orcamento_id`. O `GET /operador/orcamentos`
   devolve o chamado mais recente de cada orçamento, quando existe. */
const ABERTO = new Set(["aberto", "em_atendimento"]);

// O estado do orçamento diante da execução. QUATRO, e cada um pede uma placa
// diferente — é o que decide se há botão e o que o selo diz.
//
// ⚠️ "MARCADO À MÃO" VEM PRIMEIRO, antes de olhar chamado. Alguém disse, com
// nome e hora, que o serviço foi feito; isso é afirmação de gente e ganha de
// qualquer dedução a partir do estado de um chamado. O caso concreto: o
// operador marca como feito e, semanas depois, abre um chamado novo do mesmo
// orçamento porque o serviço voltou — com a ordem invertida, a placa
// esqueceria que a primeira execução aconteceu.
function execucao(o) {
  if (o.executado_em) {
    return { chave: "marcado", quando: dia(o.executado_em), quem: o.executado_por_nome };
  }
  if (!o.chamado_id) return { chave: "livre" };
  return ABERTO.has(o.chamado_status)
    ? { chave: "andando", id: o.chamado_id }
    : { chave: "feito", id: o.chamado_id };
}

// O texto do serviço em UMA linha, para o título do chamado e o cabeçalho do
// diálogo. Diferente de `titulo()`: aqui o operador precisa saber que há mais
// de uma peça, porque é o que ele vai mandar o técnico fazer.
function servicoTxt(o) {
  if (o.tipo && o.tipo !== "pecas") return TIPO_ROT[o.tipo] || o.tipo;
  const linhas = Array.isArray(o.linhas) ? o.linhas : [];
  if (!linhas.length) return TIPO_ROT.pecas;
  const p = linhas[0].descricao || TIPO_ROT.pecas;
  return linhas.length > 1 ? `${p} e mais ${linhas.length - 1}` : p;
}

// A linha de rodapé da placa — o "1 item · enviado em 26/08/2026" do print,
// com o que esta tela tem a mais: quem assumiu a decisão e a O.S. de origem.
// ⚠️ Uma FRASE, não uma pilha de metadados: era uma coluna de quatro linhas
// em mono à direita, e ela mandava na altura de toda a linha.
function rodape(o) {
  const linhas = Array.isArray(o.linhas) ? o.linhas : [];
  const partes = [];
  // ⚠️ "itens", não "items". O plural saía em inglês desde que esta linha
  // nasceu — `item` + `s`. Ninguém lê "2 items" e entende outra coisa, mas
  // é a tela de um produto em português e o erro estava em toda placa.
  if (linhas.length) partes.push(`${linhas.length} ${linhas.length > 1 ? "itens" : "item"}`);
  const q = quando(o);
  if (q) partes.push(`aprovado em ${q}`);
  if (o.aprovado_por_nome) {
    partes.push(`por ${o.aprovado_por_nome}${
      o.respondido_cargo ? ` · ${o.respondido_cargo}` : ""}`);
  }
  if (o.os_numero) partes.push(`O.S. ${o.os_numero}`);
  // Quem marcou como feito entra na MESMA frase, no fim: é o dado mais
  // recente da linha do tempo do orçamento, e o operador que abre a tela
  // amanhã precisa saber que foi alguém que disse, não o sistema que deduziu.
  if (o.executado_em && o.executado_por_nome) {
    partes.push(`marcado como feito por ${o.executado_por_nome}`);
  }
  return escapar(partes.join(" · "));
}

// UMA PLACA CLARA por orçamento — o cartão do print de referência.
//
// ⚠️ A PLACA NÃO É UM `<button>`, e isto é uma correção sobre o mesmo dia.
// A linha inteira virou botão de manhã; à tarde a placa ganhou a ação em
// âmbar cheio dentro dela, e botão dentro de botão é HTML inválido — o
// navegador desmonta a árvore. Não é perda: um botão âmbar escrito
// "Abrir chamado" é MAIS claro para quem tem pouca familiaridade do que uma
// área grande que reage ao clique sem dizer onde começa.
function placa(o) {
  const ex = execucao(o);
  const t = titulo(o);

  // O selo de estado. Regra do Selo: preenchido pede ação, de fio em
  // repouso — e sobre placa clara o preenchimento usa o token CRU
  // (`--amarelo`) com tinta marinho por cima, nunca o semântico, que ali
  // vira tinta escura e daria escuro sobre escuro.
  const selo = ex.chave === "marcado"
    ? `<span class="orc-selo" data-e="marcado">Feito${ex.quando ? " em " + escapar(ex.quando) : ""}</span>`
    : ex.chave === "andando"
      ? `<span class="orc-selo" data-e="andando">Chamado #${ex.id} aberto</span>`
      : ex.chave === "feito"
        ? `<span class="orc-selo" data-e="feito">Chamado #${ex.id} fechado</span>`
        : `<span class="orc-selo" data-e="livre">Pode executar</span>`;

  // As ações de cada estado:
  //
  //   livre    → abrir chamado (âmbar) + "Já foi feito" (link)
  //   andando  → NENHUMA. Não há segundo chamado para abrir, e um botão que
  //              não faz nada é pior que nenhum botão. Quem encerra é o
  //              chamado, na fila do turno — dois lugares para dizer a mesma
  //              coisa é o começo de dois estados divergentes.
  //   feito    → abrir de novo, de fio: o serviço pode voltar, mas não é o
  //              que a tela está pedindo.
  //   marcado  → só "Desfazer".
  //
  // ⚠️ "JÁ FOI FEITO" SÓ APARECE NO ESTADO LIVRE. Com chamado aberto, quem
  // conclui é o chamado; oferecer os dois caminhos criaria duas verdades
  // sobre o mesmo serviço.
  const acao =
    ex.chave === "marcado"
      ? `<button type="button" class="orc-desfaz" data-acao="desfazer-feito" data-id="${o.id}">Desfazer</button>`
    : ex.chave === "andando" ? ""
    : ex.chave === "feito"
      ? `<button type="button" class="btn btn-fio" data-acao="chamado" data-id="${o.id}">Abrir de novo</button>`
      : `<button type="button" class="orc-jafoi" data-acao="feito" data-id="${o.id}">Já foi feito</button>
         <button type="button" class="btn" data-acao="chamado" data-id="${o.id}">Abrir chamado</button>`;

  return `
  <article class="orc" data-e="${ex.chave}">
    <div class="orc-cab">
      <span class="orc-num">${escapar(o.numero || ("#" + o.id))}</span>
      ${selo}
    </div>
    <h3 class="orc-t">${escapar(t)}</h3>
    ${itens(o)}
    <div class="orc-pe">
      <span class="orc-meta">${rodape(o)}</span>
      ${acao}
    </div>
  </article>`;
}

// ⚠️ AGRUPADO POR PRÉDIO, e isso não é organização: é a pergunta que a tela
// responde. O operador é cobrado por prédio ao telefone — "o que foi aprovado
// no Bosque Verde?" —, nunca por número de orçamento. Numa lista plana, dois
// orçamentos do mesmo prédio escreviam o nome dele duas vezes seguidas.
//
// A ordem dos grupos é a do orçamento mais recente de cada prédio — a
// resposta chega ordenada por data, então basta preservar a ordem de chegada.
function agrupar(lista) {
  const grupos = new Map();
  for (const o of lista) {
    const chave = o.condominio_nome || "—";
    if (!grupos.has(chave)) {
      grupos.set(chave, { nome: chave, bairro: o.bairro, cidade: o.cidade, itens: [] });
    }
    grupos.get(chave).itens.push(o);
  }
  return [...grupos.values()];
}

// O prédio é CABEÇALHO no campo marinho, acima das placas — nunca título de
// cartão. É a mesma relação do print: o texto vive no escuro, o que se lê
// vive no claro.
function grupo(g) {
  const onde = [g.bairro, g.cidade].filter(Boolean).map(escapar).join(" · ");
  return `
  <section class="orc-grupo">
    <div class="orc-predio-cab">
      <h2 class="orc-predio">${escapar(g.nome)}</h2>
      ${onde ? `<span class="orc-onde">${onde}</span>` : ""}
    </div>
    ${g.itens.map(placa).join("")}
  </section>`;
}

function render() {
  const tela = document.getElementById("tela");
  const feitos = DADOS.filter((o) => o.executado_em);
  const abertos = DADOS.filter((o) => !o.executado_em);

  if (!DADOS.length) {
    // Estado vazio é estado, não ausência de peça — a mesma regra do dia
    // calmo no painel do turno.
    tela.innerHTML = `
      <section class="calmo">
        <h1>Nenhum orçamento aprovado ainda.</h1>
        <p>Quando um orçamento for aprovado, ele aparece aqui com o prédio e o
           serviço autorizado.</p>
      </section>`;
    return;
  }

  const grupos = agrupar(abertos);
  const n = abertos.length, p = grupos.length;

  // ⚠️ A MANCHETE CONTA O QUE ESTÁ NA TELA, não o total do banco. Ela dizia
  // "7 orçamentos aprovados" enquanto a lista mostrava 5 — número que não
  // bate com o que se vê embaixo dele é pior que número nenhum.
  // A palavra âmbar é "aprovados": é o assunto da tela, não realce
  // decorativo. É o "aguardam" do print de referência.
  const manchete = n
    ? `<h1>${n} orçamento${n > 1 ? "s" : ""} <b>aprovado${n > 1 ? "s" : ""}</b>
         em ${p} prédio${p > 1 ? "s" : ""}</h1>
       <p class="orc-lede">Do mais recente para o mais antigo. O chamado que
         executa o serviço abre por aqui.</p>`
    : `<h1>Nada <b>esperando</b> execução.</h1>
       <p class="orc-lede">Todo orçamento aprovado já virou chamado ou já foi
         marcado como feito.</p>`;

  // A linha dos que saíram. Só existe a partir de um, e é o caminho de volta
  // permanente — ver o comentário em VER_FEITOS.
  const linhaFeitos = feitos.length ? `
    <div class="orc-feitos-cab">
      <span>${feitos.length} já ${feitos.length > 1 ? "feitos" : "feito"}</span>
      <button type="button" class="orc-verfeitos" data-acao="ver-feitos"
        aria-expanded="${VER_FEITOS ? "true" : "false"}">${
        VER_FEITOS ? "esconder" : "mostrar"}</button>
    </div>
    ${VER_FEITOS ? `<div class="orc-lista orc-lista-feitos">${
      agrupar(feitos).map(grupo).join("")}</div>` : ""}` : "";

  tela.innerHTML = `
    <header class="orc-topo">${manchete}</header>
    <div class="orc-lista">${grupos.map(grupo).join("")}</div>
    ${linhaFeitos}`;
}

/* ── O diálogo ────────────────────────────────────────────────────────
   ⚠️ CÓPIA DELIBERADA do `operador.js`, como os helpers de sessão lá em
   cima e pela mesma razão registrada no topo deste arquivo. As regras
   valem inteiras e não podem divergir: `<dialog>` com `showModal()` (top
   layer), `cancel` tratado à mão para o Esc passar pela mesma limpeza,
   `body.com-ficha` travando a rolagem de trás, o foco entrando no diálogo
   (não no primeiro botão) e VOLTANDO para quem o abriu — sem isso, quem
   navega por teclado recomeça do topo da lista a cada chamado aberto. */
let _focoAnterior = null;
const FOCAVEIS = 'button:not([disabled]),select,input,textarea,a[href],[tabindex]:not([tabindex="-1"])';

function fechar() {
  const f = document.getElementById("fundo");
  if (!f) return;
  // `close()` antes de remover: é o que tira o diálogo do top layer. Remover
  // o nó sem fechar deixa o navegador achando que ainda há um modal aberto.
  if (typeof f.close === "function" && f.open) f.close();
  f.remove();
  document.body.classList.remove("com-ficha");
  if (_focoAnterior && _focoAnterior.isConnected) _focoAnterior.focus();
  _focoAnterior = null;
}

function abrirFundo(html) {
  _focoAnterior = document.activeElement;
  fechar();
  document.body.insertAdjacentHTML("beforeend",
    `<dialog class="fundo" id="fundo">${html}</dialog>`);
  const dlg = document.getElementById("fundo");
  dlg.showModal();
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
  document.body.classList.add("com-ficha");
  const cx = document.querySelector("#fundo .ficha");
  if (cx) {
    cx.setAttribute("aria-modal", "true");
    cx.tabIndex = -1;
    cx.focus({ preventScroll: true });
  }
}

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

// Faixa de erro, nunca `alert()` — a mesma regra do painel do turno, e o
// mesmo motivo de ela ir para DENTRO do diálogo quando há um: o `<dialog>`
// vive no top layer, e nenhum `z-index` põe algo do `<body>` acima dele.
// ⚠️ A FAIXA ACEITA UMA AÇÃO (31/08), e ela existe para um caso só: desfazer
// a marcação de "já foi feito", que tira a placa da tela. Ação destrutiva de
// um clique precisa da volta no MESMO lugar e no mesmo instante — mandar
// procurar no fim da lista é pedir que a pessoa saiba de algo que ela não tem
// como saber.
// ⚠️ 10s quando há ação, 6 quando não há: ler a frase é rápido, decidir que
// clicou errado e mirar num botão não é.
function avisar(texto, acao) {
  document.getElementById("aviso")?.remove();
  const botao = acao
    ? `<button type="button" class="aviso-acao" data-acao="desfazer-feito"
         data-id="${acao.id}">${escapar(acao.rot)}</button>` : "";
  (document.getElementById("fundo") || document.body).insertAdjacentHTML("beforeend",
    // ⚠️ `data-t` separa CONFIRMAÇÃO de ERRO. A faixa era vermelha sempre; com
    // a confirmação do "já foi feito" o vermelho passaria a significar duas
    // coisas opostas, e ensinaria a não olhar para ele. Ver `.aviso[data-t]`.
    // `status` e não `alert` quando é confirmação: leitor de tela não deve
    // interromper quem está lendo para dizer que deu certo.
    `<div class="aviso" id="aviso" data-t="${acao ? "ok" : "erro"}"
       role="${acao ? "status" : "alert"}">${escapar(texto)}${botao}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), acao ? 10000 : 6000);
}

/* ── Abrir o chamado do orçamento ─────────────────────────────────────
   ⚠️ O DIÁLOGO NÃO PERGUNTA O PRÉDIO. Ele vem do orçamento, e o backend
   nem aceita outro (ver `POST /operador/orcamentos/:id/chamado`): abrir,
   a partir do orçamento do Bosque Verde, um chamado em outro prédio faria
   o vínculo mentir. O que o operador edita é o que o técnico vai LER. */

// O texto que o técnico recebe. Sai todo de dado real do orçamento — número,
// constatação e itens aprovados —, e é editável antes de gravar.
function descricaoPadrao(o) {
  const partes = [
    `Serviço aprovado no orçamento ${o.numero || "#" + o.id}${
      o.aprovado_por_nome ? `, por ${o.aprovado_por_nome}` : ""}.`,
  ];
  if (o.constatacao) partes.push(`O que foi constatado: ${o.constatacao}`);
  const linhas = Array.isArray(o.linhas) ? o.linhas : [];
  if (linhas.length) {
    partes.push("Itens aprovados:\n" + linhas
      .map((l) => `- ${l.quantidade > 1 ? l.quantidade + "x " : ""}${l.descricao || "—"}`)
      .join("\n"));
  }
  return partes.join("\n\n");
}

function dlgChamado(id) {
  const o = DADOS.find((x) => x.id === id);
  if (!o) return;
  const serv = servicoTxt(o);
  const ex = execucao(o);

  abrirFundo(`<div class="ficha" style="width:min(660px,100%)" role="dialog" aria-label="Abrir chamado do orçamento">
    <div class="ficha-cab">
      <div><h2>Abrir chamado</h2>
        <div class="onde" style="margin-top:7px">
          <b class="onde-nome">${escapar(o.condominio_nome || "Sem prédio vinculado")}</b>
          <span class="num">${escapar(o.numero || "#" + o.id)}</span>
        </div></div>
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>
      </button>
    </div>
    <form class="form" id="formChamado">
      <div class="campo largo">
        <label for="cmTitulo">Título</label>
        <input id="cmTitulo" required maxlength="120" value="${escapar(serv)}">
      </div>
      <div class="campo">
        <label for="cmCat">Categoria</label>
        <select id="cmCat">
          <option value="manutencao" selected>Manutenção</option>
          <option value="vazamento">Vazamento</option>
          <option value="bomba_falha">Falha de bomba</option>
          <option value="nivel_baixo">Nível baixo</option>
          <option value="sem_agua">Sem água</option>
          <option value="ruido">Ruído</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <div class="campo">
        <label>Prioridade</label>
        ${/* ⚠️ P4 É O PADRÃO AQUI, e não o P2 do "novo chamado". Serviço
              aprovado é trabalho AGENDADO, não incidente: entrando como P2
              ele passaria na frente de bomba parada na fila do turno, que é
              ordenada pelo prazo que estoura primeiro. */""}
        <div class="prio-fila" id="cmPrio">
          <button type="button" class="prio" data-p="p1" aria-pressed="false">P1</button>
          <button type="button" class="prio" data-p="p2" aria-pressed="false">P2</button>
          <button type="button" class="prio" data-p="p3" aria-pressed="false">P3</button>
          <button type="button" class="prio" data-p="p4" aria-pressed="true">P4</button>
        </div>
      </div>
      <div class="campo largo">
        <label for="cmDesc">O que o técnico precisa saber</label>
        <textarea id="cmDesc" rows="7">${escapar(descricaoPadrao(o))}</textarea>
      </div>
      <!-- Serviço aprovado quase sempre JÁ TEM DONO — foi combinado com
           alguém antes de o síndico aprovar. Ter de abrir o chamado aqui e
           depois procurá-lo na fila do turno para despachar era o passo a
           mais que este seletor tira.
           (Sem crase neste comentario: template literal. Ver CLAUDE.md.) -->
      <div class="campo largo">
        <label for="cmTec">Técnico</label>
        <select id="cmTec"><option value="">Despachar depois</option></select>
      </div>
      ${ex.chave === "feito" ? `<p class="dica">Este orçamento já teve o chamado
        <b>#${ex.id}</b>, que está fechado. Abrir outro registra um novo atendimento
        no mesmo prédio, ligado ao mesmo orçamento.</p>` : `<p class="dica">O chamado
        nasce <b>aberto</b> e aparece na fila do turno. A prioridade define o prazo —
        o botão <b>Ajuda</b>, no alto da tela, mostra a tabela completa. O técnico é
        opcional: sem ele, o chamado espera despacho na fila.</p>`}
    </form>
    <div class="ficha-pe">
      <p id="cmMsg"></p>
      <button class="btn btn-fio" data-acao="fechar">Cancelar</button>
      <button class="btn" data-acao="salvar-chamado" data-id="${o.id}">Abrir chamado</button>
    </div>
  </div>`);

  carregarTecnicos();
}

/* A equipe, buscada QUANDO O DIÁLOGO ABRE e não na carga da tela — mesmo
   raciocínio do `/operador/prazos`: esta lista serve a um diálogo, e diálogo
   não entra no caminho crítico da tela que o operador vê primeiro.

   ⚠️ `/operador/tecnicos` e NÃO `/tecnicos`: o segundo devolve a ficha inteira
   do funcionário (CPF, RG, endereço) porque serve o cadastro do admin. Uma
   tela que só precisa de nomes não tem por que receber isso.

   ⚠️ Falhando, o seletor DIZ que falhou e o resto do diálogo continua
   funcionando — abrir o chamado sem técnico é um caminho legítimo, e travar o
   formulário inteiro por causa da lista seria transformar um extra em
   requisito.

   ⚠️ Helpers duplicados do `operador.js` de propósito: esta superfície não
   importa nada de lá (ver o comentário no topo do arquivo). O que não pode
   divergir — quem entra na lista e em que ordem — é decidido pelo SERVIDOR, no
   `SQL_EQUIPE`, que é a mesma consulta das duas telas. */
function tecEstado(t) {
  const n = t.abertos || 0;
  const carga = n === 1 ? "1 chamado" : n + " chamados";
  if (!t.disponivel) return n ? "ocupado · " + carga : "ocupado";
  return n ? carga : "livre agora";
}
async function carregarTecnicos() {
  const sel = document.getElementById("cmTec");
  if (!sel) return;
  try {
    const r = await fetch("/operador/tecnicos", { headers: authHeaders() });
    const d = await lerJson(r, "Equipe");
    if (!r.ok) throw new Error(d.error || "Erro ao buscar a equipe");
    const arr = (Array.isArray(d) ? d : []).sort(
      (a, b) => (b.disponivel - a.disponivel) || (a.abertos - b.abertos));
    // O diálogo pode ter fechado durante a espera.
    if (!document.getElementById("cmTec")) return;
    sel.innerHTML = `<option value="">Despachar depois</option>` + arr
      .map((t) => `<option value="${t.id}">${escapar(t.nome)} · ${tecEstado(t)}</option>`)
      .join("");
  } catch {
    if (document.getElementById("cmTec"))
      sel.innerHTML = `<option value="">Não consegui carregar a equipe — abra sem técnico</option>`;
  }
}

async function salvarChamado(id) {
  const titulo = document.getElementById("cmTitulo")?.value.trim();
  const descricao = document.getElementById("cmDesc")?.value.trim();
  const categoria = document.getElementById("cmCat")?.value;
  const prioridade = document.querySelector('#cmPrio .prio[aria-pressed="true"]')?.dataset.p || "p4";
  const tecnico_id = Number(document.getElementById("cmTec")?.value) || null;
  // O nome é lido AGORA porque a faixa de confirmação aparece depois de
  // `fechar()`, quando o seletor já não existe. A opção é "Nome · livre";
  // para a frase, o que serve é o nome.
  const tecNome = (document.getElementById("cmTec")?.selectedOptions[0]?.textContent || "")
    .split(" · ")[0].trim();
  const msg = document.getElementById("cmMsg");
  const btn = document.querySelector('[data-acao="salvar-chamado"]');

  if (!titulo) { if (msg) msg.textContent = "Escreva um título."; return; }
  if (!descricao || descricao.length < 5) {
    if (msg) msg.textContent = "Escreva o que o técnico precisa saber."; return;
  }

  // Trava o botão enquanto grava: sem isto, dois cliques na mesma linha
  // disparam duas requisições, e a segunda só é barrada porque o endpoint
  // devolve o chamado que a primeira criou. Depender disso seria contar com
  // a rede para não duplicar.
  if (btn) { btn.disabled = true; btn.textContent = "Abrindo…"; }
  if (msg) msg.textContent = "";
  try {
    const r = await fetch(`/operador/orcamentos/${id}/chamado`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, descricao, categoria, prioridade, tecnico_id }),
    });
    const d = await lerJson(r, "Chamado do orçamento");
    if (!r.ok) throw new Error(d.error || "Erro ao abrir o chamado");
    fechar();

    // ⚠️ A PLACA VIRA NA HORA, e não quando a lista voltar do servidor.
    // A primeira versão fazia `await carregar()` e só então avisava: entre o
    // clique e a troca havia o tempo inteiro da consulta — medido em 31/08
    // contra o banco de teste (Railway, via proxy), **mais de 2,5s** com o
    // diálogo já fechado e a placa ainda dizendo "Abrir chamado". Do lado de
    // quem clicou, o botão simplesmente não fez nada.
    // O dado para virar já está aqui: o endpoint devolve o id do chamado.
    const alvo = DADOS.find((x) => x.id === id);
    if (alvo) { alvo.chamado_id = d.id; alvo.chamado_status = "aberto"; render(); }
    // ⚠️ A FAIXA CONTA O QUE FOI FEITO COM A ESCOLHA, inclusive quando ela não
    // foi usada. O clique duplo é o caso normal aqui, e o segundo clique pode
    // trazer um técnico para um chamado que já tem outro — dizer só "já tinha
    // o chamado #N" deixaria o operador achando que despachou quem escolheu.
    avisar(d.ja_existia
      ? (d.tecnico_atribuido
          ? `Este orçamento já tinha o chamado #${d.id} aberto — ${tecNome} foi despachado para ele.`
          : tecnico_id
            ? `Este orçamento já tinha o chamado #${d.id} aberto, e ele já tem técnico. Nada foi trocado.`
            : `Este orçamento já tinha o chamado #${d.id} aberto.`)
      : (d.tecnico_id
          ? `Chamado #${d.id} aberto com ${tecNome}. Ele já está na fila do turno.`
          : `Chamado #${d.id} aberto. Ele já está na fila do turno.`));

    // E a recarga de verdade vai atrás, para reconciliar (outro operador pode
    // ter mexido na lista enquanto este diálogo estava aberto).
    // ⚠️ `.catch` OBRIGATÓRIO aqui: o diálogo já fechou, então o `catch` lá
    // embaixo escreveria em `#cmMsg`, que não existe mais — a falha sumiria
    // sem deixar rastro. Foi exatamente o que aconteceu na primeira versão.
    carregar().catch(() => avisar(
      "O chamado foi aberto, mas não consegui atualizar a lista. Recarregue a página."));
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Abrir chamado"; }
    // Se o diálogo já não existe, a faixa é o único lugar que sobrou.
    if (msg) msg.textContent = e.message; else avisar(e.message);
  }
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
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
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
//
// ⚠️ O BLOCO "O QUE É ESTA TELA" SAIU, a pedido do Pedro. Quem abre a ajuda
// já está olhando a tela; descrevê-la de volta gasta a primeira dobra do
// diálogo com o que a pessoa não veio buscar. A ajuda começa no que ela não
// consegue deduzir sozinha: o que os selos querem dizer.
function ajudaCorpo(d) {
  if (d.erro) return `<p class="ajuda-carregando">${escapar(d.erro)}</p>`;
  return `
  <section>
    <h3>O selo do canto direito</h3>
    <ul class="ajuda-lista">
      <li><span class="selo" data-s="p2">Pode executar</span> ninguém abriu
        chamado ainda.</li>
      <li><b>Chamado #N aberto</b>: já tem chamado. Não precisa abrir outro.</li>
      <li><b>Chamado #N fechado</b>: o serviço já foi feito. Se voltar, dá para
        abrir de novo.</li>
      <li><b>Feito em DD/MM</b>: alguém marcou à mão que o serviço já foi
        feito, sem abrir chamado.</li>
    </ul>
  </section>
  <section>
    <h3>Já foi feito</h3>
    <p>Use quando o serviço já foi executado e não teve chamado. Acontece
      quando o técnico resolveu na hora, no mesmo dia da visita.</p>
    <p>O orçamento <b>sai da lista</b>. A tela mostra o que ainda falta fazer.</p>
    <p>Marcou errado? Aparece um <b>Desfazer</b> na faixa, na hora. Depois, use
      a linha <b>“já feitos”</b> no fim da lista.</p>
  </section>
  <section>
    <h3>Abrir chamado</h3>
    <p>O botão abre um chamado para fazer o serviço.</p>
    <p>O título e o texto já vêm prontos, com o que está no orçamento. Dá para
      mudar antes de salvar.</p>
    <p>O chamado entra na fila do turno, aberto e sem técnico.</p>
  </section>
  <section>
    <h3>As prioridades e os prazos</h3>
    ${tabelaPrazos(d.prazos)}
    <p>Aqui o normal é <b>P4</b>. Serviço aprovado é trabalho agendado, não é
      urgência.</p>
    <p>Se você subir a prioridade, ele passa na frente da fila do turno.</p>
  </section>`;
}

/* ── Marcar como feito, e desfazer ───────────────────────────────────
   O quarto estado (migration 080): o serviço foi executado SEM chamado
   nenhum — o técnico já estava no prédio, ou o orçamento é anterior a esta
   tela existir. Sem isso a placa fica dizendo "Pode executar" para sempre.

   ⚠️ SEM CONFIRMAÇÃO, COM DESFAZER — e a troca é deliberada. Uma caixa de
   "tem certeza?" a cada marcação cobra de todo mundo o preço do erro de
   alguns; o desfazer cobra só de quem errou. E o desfazer fica na própria
   placa, visível, não escondido num menu.

   ⚠️ A PLACA VIRA NA HORA, como no "Abrir chamado" — pelo mesmo motivo
   medido em 31/08: a lista leva mais de 2,5s para voltar do servidor, e
   até lá o botão parece não ter feito nada. */
async function marcarFeito(id, feito) {
  const o = DADOS.find((x) => x.id === id);
  if (!o) return;
  const antes = { em: o.executado_em, quem: o.executado_por_nome };
  // Otimista: escreve, desenha, e só então fala com o servidor.
  o.executado_em = feito ? new Date().toISOString() : null;
  o.executado_por_nome = feito ? (meuNome() || null) : null;
  render();
  try {
    const r = await fetch(`/operador/orcamentos/${id}/executado`, {
      method: feito ? "POST" : "DELETE",
      headers: authHeaders(),
    });
    const d = await lerJson(r, "Marcar como feito");
    if (!r.ok) throw new Error(d.error || "Não foi possível salvar");
    // A data boa é a do servidor, não a do relógio deste navegador.
    if (feito && d.executado_em) { o.executado_em = d.executado_em; render(); }
    // ⚠️ O DESFAZER VIAJA NA FAIXA, não num menu. A placa acabou de sair da
    // tela: sem isto, a única pista de que dá para voltar seria a linha no
    // fim da lista, e quem clicou errado não sabe que ela existe.
    if (feito) {
      avisar(`${o.numero || "#" + o.id} saiu da lista.`,
        { rot: "Desfazer", id: o.id });
    }
  } catch (e) {
    // ⚠️ DESFAZ O OTIMISMO. Sem isto a placa fica dizendo "Feito" com o banco
    // dizendo o contrário, e ninguém descobre até a próxima recarga.
    o.executado_em = antes.em;
    o.executado_por_nome = antes.quem;
    render();
    avisar(e.message);
  }
}

// O nome de quem está logado, para a placa não ficar sem autor até a
// próxima recarga. Só enfeite otimista: quem manda é o servidor.
function meuNome() {
  try { return JSON.parse(localStorage.getItem("user") || "{}").nome || null; }
  catch { return null; }
}

/* ── Eventos ─────────────────────────────────────────────────────────── */
document.addEventListener("click", (e) => {
  if (e.target.closest("#btnSair")) return logout();
  const b = e.target.closest("[data-acao]");
  if (b) {
    const a = b.dataset.acao;
    if (a === "fechar") return fechar();
    if (a === "ajuda") return dlgAjuda();
    if (a === "feito") return marcarFeito(Number(b.dataset.id), true);
    if (a === "desfazer-feito") {
      document.getElementById("aviso")?.remove();
      return marcarFeito(Number(b.dataset.id), false);
    }
    if (a === "ver-feitos") { VER_FEITOS = !VER_FEITOS; return render(); }
    if (a === "chamado") return dlgChamado(Number(b.dataset.id));
    if (a === "salvar-chamado") return salvarChamado(Number(b.dataset.id));
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
  if (e.key === "Escape" && document.getElementById("fundo")) return fechar();
  _prenderFoco(e);
});

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

/* Quem está na barra — primeiro nome, como no painel do turno. */
(function nomeNaBarra() {
  const el = document.getElementById("barraEu");
  if (!el) return;
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (u.nome) { el.textContent = String(u.nome).trim().split(/\s+/)[0]; el.title = u.nome; }
  } catch { /* localStorage pode estourar em aba anônima; a barra sem nome não quebra a tela */ }
})();

/* ⚠️ A BARRA ENDURECE AO ROLAR — e ISTO FALTAVA AQUI (31/08). A folha define
   `.barra` translúcida (`--mar-900` a 88% + `blur(14px)`) e `.barra.is-rolada`
   sólida com fio inferior; quem troca a classe é este listener, que existia no
   `operador.js` e nunca foi copiado para cá.
   O efeito: a barra desta tela ficava translúcida PARA SEMPRE. Com as placas
   claras passando por baixo — que é o que esta tela tem e o painel do turno
   não —, o texto do cabeçalho ficava sobre um borrão claro, e o topo da placa
   aparecia atravessando a marca.
   Mesmo limiar (12px) e mesma classe das três irmãs: as barras da landing, do
   painel do cliente e daqui trocam de estado na mesma rolagem. */
// ⚠️ E O ESTADO INICIAL, não só o listener. O navegador RESTAURA a posição
// de rolagem ao recarregar: quem dá F5 no meio da lista volta com a página
// rolada e um `scroll` que nunca aconteceu — a barra nascia translúcida,
// com o conteúdo passando por baixo dela, até a pessoa rolar de novo.
function _barraRolada() {
  document.querySelector(".barra")?.classList.toggle("is-rolada", scrollY > 12);
}
addEventListener("scroll", _barraRolada, { passive: true });
_barraRolada();

/* ── Boot ────────────────────────────────────────────────────────────── */
// ⚠️ SEM RECARGA PERIÓDICA, ao contrário do painel do turno. Lá o ciclo de
// 30s existe porque a fila muda sozinha e atrasar é perder prazo; aqui a
// lista só muda quando alguém aprova um orçamento, e uma tela que se redesenha
// sob a mão de quem está lendo é ruído, não frescor.
carregar().catch((e) => {
  document.getElementById("tela").innerHTML =
    `<div class="carregando">${escapar(e.message || "Erro ao carregar.")}</div>`;
});
