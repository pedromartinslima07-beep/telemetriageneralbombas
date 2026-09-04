/* ════════════════════════════════════════════════════════════════════════
   cliente.js — Painel do síndico (/cliente/painel) · v3
   ────────────────────────────────────────────────────────────────────────
   "A resposta, não o painel." A primeira tela inteira é uma frase, com os
   reservatórios ao lado como prova e UMA ação. Abaixo, a história do
   prédio. NÃO EXISTEM SEÇÕES: alertas e chamados deixaram de ser lugares
   para onde navegar — o detalhe abre como ficha por cima.

   ⚠️ Nenhuma frase desta tela pode afirmar mais do que o dado sustenta.
   "Parou de enviar leitura" NÃO é "está sem água", e essa distinção é
   literalmente o produto. Não trocar por texto mais tranquilizador.

   ⚠️ O backend não mudou para viabilizar este desenho. Endpoints usados:
     GET  /cliente/status          · reservatórios + alertas abertos
     GET  /cliente/chamados        · lista
     GET  /cliente/chamados/:id    · detalhe (é quem traz `ja_avaliado`)
     GET  /cliente/chamados/:id/mensagens   · conversa
     POST /cliente/chamados/:id/mensagens   · responder
     POST /cliente/chamados/:id/avaliar     · nota + comentário
     POST /cliente/chamados        · abrir (categoria + descrição)
     GET  /cliente/historico       · gráfico da ficha do reservatório
     GET  /relatorio/pdf           · ⚠️ exige device_id
   ════════════════════════════════════════════════════════════════════════ */

/* ── Sessão ─────────────────────────────────────────────────────────────── */

function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}
if (!getToken()) window.location.href = "/login";

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function usuarioLocal() {
  try { return JSON.parse(localStorage.getItem("user")) || {}; } catch { return {}; }
}

/* ── Faixas de alerta ───────────────────────────────────────────────────
   ⚠️ São as MESMAS do backend (`nivelFromPct`) e as mesmas desenhadas na
   coluna d'água da landing. Se mudarem lá, mudam nos três. */
const LIMIARES = { critico: 20, baixo: 45 };

/* ── Estado ─────────────────────────────────────────────────────────────── */

let _status    = null;   // último payload de /cliente/status
let _chamados  = [];     // último /cliente/chamados
let _avaliado  = {};     // id do chamado -> ja_avaliado (cache, ver _lerAvaliacoes)
let _primeiraCarga = true;

/* ── Utilidades ─────────────────────────────────────────────────────────── */

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const $ = id => document.getElementById(id);

function hora(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function dataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// "agora mesmo" / "há 12 min" / "há 3h" / "há 2 dias"
// ⚠️ piso, não arredondamento: com `round`, uma leitura de 40 segundos atrás
// virava "há 1 min" — e o número que mais importa nesta tela é justamente o
// que diz que a medição está viva agora.
function desdeQuando(iso) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1)    return "agora mesmo";
  if (mins < 60)   return `há ${mins} min`;
  if (mins < 1440) return `há ${Math.round(mins / 60)}h`;
  const d = Math.round(mins / 1440);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

/* O mesmo relógio do `desdeQuando`, partido em número e unidade.
   No instrumento o tempo sem resposta é MEDIÇÃO — recebe o tratamento do
   nível (mono grande + unidade pequena), não o de frase. É o único número
   honesto que sobra quando o sensor calou: o nível a gente não sabe, mas há
   quanto tempo não sabe a gente sabe com precisão. */
function semSinalHa(iso) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 60)   return { n: mins, u: "min" };
  if (mins < 1440) return { n: Math.round(mins / 60), u: "h" };
  const d = Math.round(mins / 1440);
  return { n: d, u: d > 1 ? "dias" : "dia" };
}

async function pedir(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  if (r.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login?motivo=expirado";
    throw new Error("sessão expirada");
  }
  return r;
}

// Todo handler do backend responde JSON. Cai pro texto cru se não for —
// ex.: página HTML de erro do proxy, que é a origem clássica do
// "Unexpected token '<'".
async function erroDe(r) {
  const txt = await r.text().catch(() => "");
  try { return JSON.parse(txt).error || txt; } catch { return txt || `erro ${r.status}`; }
}

const NUM = ["nenhum", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
const porExtenso = n => NUM[n] || String(n);

/* ── Leitura de um reservatório ─────────────────────────────────────────── */

function estadoDo(r) {
  if (r.offline) return "mudo";
  const pct = r.ultima_leitura?.nivel_pct;
  if (pct == null) return "mudo";
  if (pct < LIMIARES.critico) return "critico";
  if (pct < LIMIARES.baixo)   return "baixo";
  return "ok";
}

function reservatorios() {
  return Array.isArray(_status?.reservatorios) ? _status.reservatorios : [];
}
function alertasAbertos() {
  return Array.isArray(_status?.alertas_abertos) ? _status.alertas_abertos : [];
}
function chamadosAbertos() {
  return _chamados.filter(c => c.status === "aberto" || c.status === "em_atendimento");
}

// leitura normalizada, do jeito que a prova e a lista consomem
function leituras() {
  return reservatorios().map(r => {
    const e = estadoDo(r);
    return {
      device_id: r.device_id,
      nome: r.nome || "Reservatório",
      tipo: r.tipo || "",
      estado: e,
      cls: e === "ok" ? "" : e,
      n: e === "mudo" ? 0 : Math.max(0, Math.min(100, Math.round(r.ultima_leitura?.nivel_pct ?? 0))),
      quando: r.ultima_leitura?.criado_em || null,
      /* ⚠️ `?? null`, não `|| false`: "desligada" e "não informou" são
         coisas diferentes, e a prova só mostra a linha da bomba quando o
         reservatório de fato reportou. Num painel cujo produto é medir,
         inventar um "desligada" que ninguém mediu é o pior erro possível. */
      bomba: e === "mudo" ? null : (r.ultima_leitura?.bomba_ligada ?? null),
    };
  });
}

/* ════════════════════════════════════════════════════════════════════════
   1. A RESPOSTA
   ════════════════════════════════════════════════════════════════════════ */

/* ─── O veredito ─────────────────────────────────────────────────────────
   Os ramos são os de prioridade do painel: crítico > sem sinal > atenção >
   normal — com o ramo "normal" PARTIDO EM DOIS. Antes, o dia calmo e o dia
   com técnico no prédio recebiam a mesma frase gigante ("Tudo normal") e a
   única diferença ficava escondida na nota de apoio; agora o atendimento
   em curso é um objeto clicável na primeira tela.

   ⚠️ A frase do dia normal está FECHADA: "Seu prédio está abastecido."
   Não reabrir frase a frase — se mudar, muda por mudança de produto (um
   ramo novo aqui), não por preferência de redação. */
function veredito(lst) {
  const abertos = chamadosAbertos();
  const nomeacao = r => `A <em>${esc(r.nome)}</em> está em ${r.n}%.`;

  /* ⚠️ O apoio é texto de APOIO, e no celular ele empurra a única ação do
     painel para baixo da dobra. Medido a 390px: com o apoio longo, "Preciso
     de ajuda" começava a 787px no estado sem sinal — abaixo da dobra
     justamente no estado em que o síndico está aflito.

     Por isso a nota sobre atendimento só entra QUANDO NÃO HÁ CHAMADO ABERTO:
     havendo, a linha de atendimento logo abaixo já diz quem está cuidando, e
     repetir custava duas linhas em cima do botão. */
  const notaSemChamado = abertos.length ? "" : " ";

  const criticos = lst.filter(r => r.estado === "critico");
  const mudos    = lst.filter(r => r.estado === "mudo");
  const baixos   = lst.filter(r => r.estado === "baixo");

  /* ⚠️ ESTE RAMO É O ÚNICO QUE ANUNCIA, e a regra dele é NOMEAR, não
     convencer (25/08/2026, decisão do Pedro).

     A versão anterior abria com "Ainda não medimos o seu prédio." — uma
     negação sobre a NOSSA ausência, que informava uma lacuna administrativa
     em vez de dizer o que existe para ele. Eu propus trocar por manchete de
     dor ("se faltar água amanhã, você descobre pelo interfone") e o Pedro
     recusou na hora: *"a landing já está cheia dessas frasesinhas de
     impacto"*. Aqui o síndico tem segundos antes de fechar a página, e o que
     ele precisa nesses segundos é saber O QUE É — não sentir alguma coisa.

     Por isso a manchete é o nome do produto aplicado ao que ele tem, e o
     apoio diz o que o produto faz. Nada de retórica, nada de pergunta, nada
     de cenário hipotético. Se for reescrever: o teste é "em três segundos,
     sem ler o apoio, dá para dizer o que a General está oferecendo?".

     ⚠️ NADA DE "MAIS NOVO", "LANÇAMENTO", "AGORA" ou "NOVIDADE" (o Pedro
     pegou isso na primeira versão: o apoio dizia "nosso produto mais novo").
     São datas disfarçadas de adjetivo — envelhecem sozinhas no dia em que
     existir um produto mais novo que este, e ninguém vai lembrar de vir aqui
     trocar. O convite vive no BOTÃO, que não precisa de adjetivo temporal
     para convidar. */
  if (!lst.length) {
    return {
      chave: "semtel", risco: false,
      frase: "<em>Telemetria</em> para o seu reservatório.",
      apoio: "Um sensor mede o nível o tempo todo e avisa antes de faltar água.",
      desde: "",
    };
  }

  if (criticos.length) {
    return {
      chave: "critico", risco: true,
      frase: criticos.length === 1
        ? nomeacao(criticos[0])
        : `<em>${criticos.length} reservatórios</em> estão abaixo de ${LIMIARES.critico}%.`,
      apoio: `Abaixo de ${LIMIARES.critico}% tratamos como urgência.` + notaSemChamado +
        (abertos.length ? "" : "Nossa equipe é avisada automaticamente quando o nível chega aqui."),
      desde: ultimaLeituraTxt(lst),
    };
  }

  if (mudos.length) {
    // ⚠️ "Não sei" é diferente de "está vazio", e essa diferença é o
    // produto. A frase não promete que alguém já está indo cuidar DESTE
    // sensor: o técnico designado quase sempre está num chamado de outro
    // reservatório, e dizer o contrário faria o síndico entender errado.
    const nomes = mudos.slice(0, 2).map(r => esc(r.nome)).join(" e ");
    const quais = mudos.length > 2 ? `${nomes} e mais ${mudos.length - 2}` : nomes;
    // ⚠️ A frase nega a INFERÊNCIA ("não quer dizer que falta água"), nunca o
    // fato — não sabemos se há água, e afirmar que há seria pior que o defeito
    // que este ramo existe para evitar.
    return {
      chave: "mudo", risco: true,
      frase: mudos.length === 1
        ? "Um sensor parou de responder."
        : `${porExtenso(mudos.length)} sensores pararam de responder.`,
      apoio: `Sem leitura de ${quais}. Isso não quer dizer que falta água — quer dizer que não estamos conseguindo medir.` + notaSemChamado +
        (abertos.length ? "" : "Nossa equipe é avisada automaticamente."),
      /* ⚠️ Com UM sensor mudo esta linha some: o instrumento passou a dizer
         "SEM RESPOSTA HÁ 3h", e ela repetia o mesmo dado a dois palmos de
         distância, do outro lado da placa. Com DOIS ou mais ela volta —
         aí o instrumento mostra só o pior, e ela é a única que fala do
         conjunto. */
      desde: mudos.length > 1 ? semLeituraTxt(mudos) : "",
    };
  }

  if (baixos.length) {
    return {
      chave: "baixo", risco: false,
      frase: baixos.length === 1
        ? nomeacao(baixos[0])
        : `<em>${baixos.length} reservatórios</em> estão abaixo de ${LIMIARES.baixo}%.`,
      apoio: `Abaixo de ${LIMIARES.baixo}% a bomba costuma repor sozinha, e acompanhamos de perto.` + notaSemChamado +
        (abertos.length ? "" : "Nossa equipe é avisada automaticamente quando o nível chega aqui."),
      desde: ultimaLeituraTxt(lst),
    };
  }

  // 4a e 4b: mesma frase de água (é verdade nos dois), mas só o 4b é um dia
  // sem nada acontecendo. O que separa os dois é a linha de atendimento.
  return {
    chave: abertos.length ? "atendimento" : "ok", risco: false,
    frase: "Seu prédio está abastecido.",
    apoio: lst.length === 1
      ? "O reservatório está dentro do esperado e o sensor continua medindo."
      : `Os ${porExtenso(lst.length)} reservatórios estão dentro do esperado e os sensores continuam medindo.`,
    desde: ultimaLeituraTxt(lst),
  };
}

function ultimaLeituraTxt(lst) {
  let ultima = null;
  for (const r of lst) {
    if (!r.quando) continue;
    if (!ultima || new Date(r.quando) > new Date(ultima)) ultima = r.quando;
  }
  return ultima ? `Última leitura ${desdeQuando(ultima)}` : "Sem leitura registrada ainda";
}

function semLeituraTxt(mudos) {
  const com = mudos.filter(r => r.quando);
  if (!com.length) return "Esse sensor nunca enviou leitura";
  let ultima = com[0].quando;
  for (const r of com) if (new Date(r.quando) > new Date(ultima)) ultima = r.quando;
  return `Última leitura desse sensor ${desdeQuando(ultima)}`;
}

/* ─── A linha de atendimento ─────────────────────────────────────────────
   ⚠️ Ela cita o TÍTULO do chamado, não só quem atende. Sem isso, num
   prédio com sensor mudo e um chamado aberto sobre outra coisa, "Marcos
   está atendendo" seria lido como "alguém já está cuidando do sensor" —
   que é justamente a leitura errada que este painel existe para evitar. */
function atendimento() {
  const abertos = chamadosAbertos();
  if (!abertos.length) return null;

  /* ⚠️ Duas linhas, não uma frase corrida. Com o título do chamado emendado no
     texto principal, ela quebrava em 3–4 linhas no celular e gastava 127px em
     cima do botão. Título em cima, referência embaixo: menos altura e mais
     fácil de varrer com o olho. */
  if (abertos.length > 1) {
    return {
      titulo: `Há ${porExtenso(abertos.length)} chamados em andamento`,
      sub: "Toque para ver o mais recente",
      id: abertos[0].id,
    };
  }
  const c = abertos[0];
  const titulo = (c.status === "em_atendimento" && c.tecnico_nome)
    ? `${esc(c.tecnico_nome)} está atendendo`
    : "Chamado aberto, aguardando atendimento";
  return {
    titulo,
    sub: `Nº ${c.id}${c.titulo ? ` — ${esc(c.titulo)}` : ""}`,
    id: c.id,
  };
}

/* O selo de SEM SINAL, carimbado no meio do tubo mudo.

   ⚠️ A GEOMETRIA É A DO `wifi-off` DO LUCIDE (`public/lucide.min.js`), não
   desenho meu — e isso é a correção de dois desenhos meus que saíram tortos:

   1. **Três barrinhas cortadas.** O corte tem de DESCER (subindo, acompanha
      as barras e o conjunto lê como seta de crescimento — visto ampliando a
      5×). Só que, descendo, nenhuma reta cruza as três: ela passa POR CIMA
      da barra baixa sem tocá-la e retalha as outras duas em alturas
      diferentes. A 8×, o que sobrava eram tocos soltos. É impossível de
      acertar, não é questão de ajuste fino.
   2. **Triângulo cheio com uma vala.** O corte de 45° cai exatamente no
      eixo de simetria do triângulo retângulo e o parte em duas metades
      espelhadas: vira gravata-borboleta, não medidor cancelado.

   O Lucide resolve o mesmo problema do jeito certo: os arcos são
   **interrompidos** onde o corte passa — os vãos fazem parte do desenho, em
   vez de serem abertos por cima com um traço grosso na cor do fundo.
   ⚠️ Não "arrumar" os arcos fechando os vãos: eles são o motivo de o corte
   ficar limpo.

   O leque de wi-fi é literal aqui: o ESP32 fala por wi-fi, e o que parou foi
   o rádio dele — não a água. As curvas são a exceção assumida ao "traço
   sempre esquadrado" (o ícone de conta, na barra, já tem círculo e arco); a
   alternativa toda reta (o `antenna` do Lucide) não aceita corte sem cair no
   problema 1.
   ⚠️ `stroke-linecap: square` é o que faz o ponto de baixo (`M12 20h.01`,
   subcaminho de comprimento zero) existir: com `butt` ele simplesmente NÃO
   é desenhado, e some sem erro nenhum no console.
   ⚠️ Isto NÃO é a régua que a decisão de 14/08 baniu do tanque: aquilo eram
   marcas de limiar, que sugerem valor. Um selo centralizado não tem altura
   nenhuma para ser confundida com nível — e neste estado não há nível. */
const ICO_SEM_SINAL = `<span class="selo-mudo" aria-hidden="true">
            <svg viewBox="0 0 24 24" stroke-linecap="square">
              <path d="M12 20h.01"/>
              <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
              <path d="M5 12.859a10 10 0 0 1 5.17-2.69"/>
              <path d="M19 12.859a10 10 0 0 0-2.007-1.523"/>
              <path d="M2 8.82a15 15 0 0 1 4.177-2.643"/>
              <path d="M22 8.82a15 15 0 0 0-11.288-3.764"/>
              <path d="m2 2 20 20"/>
            </svg>
          </span>`;

/* ─── A PROVA É UMA SÓ ───────────────────────────────────────────────────
   Quem aparece: O PIOR reservatório do prédio, pela MESMA prioridade que o
   veredito usa — crítico (<20%) → sem sinal → atenção (<45%) → e, com tudo
   normal, o mais baixo. Isso amarra a prova à frase: antes a frase nomeava
   um reservatório e a prova mostrava três, e nem sempre o citado estava
   entre eles.

   ⚠️ Não voltar a mostrar N. Três objetos idênticos lado a lado leem como
   gráfico de barras — o vício que derrubou a v1 e que sobreviveu ao corte
   de onze para três. Os outros vivem na ficha `#fTodos`, atrás do botão. */
const ORDEM_PIOR = { critico: 0, mudo: 1, baixo: 2, ok: 3 };

function oPior(todas) {
  if (!todas.length) return null;
  return [...todas].sort((a, b) =>
    (ORDEM_PIOR[a.estado] ?? 9) - (ORDEM_PIOR[b.estado] ?? 9) || a.n - b.n
  )[0];
}

/* Por que ESTE está na tela. É subtítulo do nome, nunca etiqueta acima
   dele — e some quando o prédio só tem um reservatório, porque aí não há
   escolha nenhuma para justificar. */
function motivoDoPior(r, todas) {
  if (todas.length < 2) return "";
  if (r.estado === "critico") return "abaixo de 20% — o mais urgente do prédio";
  if (r.estado === "mudo")    return "sem leitura — por isso está na tela";
  if (r.estado === "baixo")   return "abaixo de 45% — o que pede atenção";
  return `o mais baixo dos ${todas.length}`;
}

function provaHTML(r, todas) {
  const mudo = r.estado === "mudo";
  const bomba = r.bomba == null ? "" : `
      <div>
        <dt>Bomba</dt>
        <dd class="bomba${r.bomba ? "" : " off"}">
          <span class="lamp" aria-hidden="true"></span>${r.bomba ? "Ligada" : "Desligada"}
        </dd>
      </div>`;

  /* ⚠️ A SEGUNDA LEITURA DO ESTADO MUDO. Sem ela a coluna do instrumento
     colapsava para "NÍVEL —": um traço solto ao lado de um tubo hachurado,
     que é o desenho de uma tela inacabada, não o de um estado. A anatomia
     de duas leituras vale para TODOS os estados — o que muda é o que a
     segunda mede. Aqui ela mede o tempo, que é o dado que sobra e o que o
     síndico de fato quer ("desde quando estamos cegos?").
     Não é leitura inventada: sai de `ultima_leitura.criado_em`, o mesmo
     carimbo que alimenta a linha ao lado do botão. */
  const ha = mudo ? semSinalHa(r.quando) : null;
  const semSinal = !mudo ? "" : `
      <div>
        <dt>${ha ? "Sem resposta há" : "Sensor"}</dt>
        ${ha
          ? `<dd class="mudo-tempo">${ha.n}<i>${ha.u}</i></dd>`
          : `<dd class="bomba off"><span class="lamp" aria-hidden="true"></span>Nunca respondeu</dd>`}
      </div>`;

  return `<div class="prova-in">
      <button class="res ${r.cls}" type="button"
          data-abrir="reservatorio" data-device="${esc(r.device_id)}"
          aria-label="${esc(r.nome)}: ${mudo ? "sem leitura" : r.n + " por cento"}. Ver histórico.">
        <span class="tubo" aria-hidden="true">
          <span class="faixa faixa-baixo"></span>
          <span class="faixa faixa-critico"></span>
          <span class="agua" style="--n:0%"><span class="crista"></span></span>
          <span class="limiar limiar-baixo"><i>45</i></span>
          <span class="limiar limiar-critico"><i>20</i></span>
          ${mudo ? ICO_SEM_SINAL : ""}
        </span>
      </button>
      <dl class="leituras res-estado ${r.cls}">
        <div>
          <dt>Nível</dt>
          <dd>${mudo ? `<span class="num">—</span>` : `<span class="num">${r.n}</span><i>%</i>`}</dd>
        </div>${bomba}${semSinal}
      </dl>
    </div>
    <p class="qual">
      <b>${esc(r.nome)}</b>
      ${motivoDoPior(r, todas) ? `<small>${motivoDoPior(r, todas)}</small>` : ""}
    </p>`;
}

/* O botão dos outros. Não existe quando não há outros — um botão que abre
   uma lista de um item só é mobília. */
function restoHTML(todas) {
  const n = todas.length - 1;
  if (n < 1) return "";
  return `<button class="resto" type="button" data-abrir="todos">` +
    `Ver os outros ${n} reservatóri${n > 1 ? "os" : "o"}</button>`;
}

/* na ficha a leitura é barra horizontal, não tubo: ali não é prova, é
   inventário — e inventário se varre de cima para baixo */
function listaHTML(todas, modo) {
  return todas.map(r => `<li><button class="res-item ${r.cls}" type="button"
      data-lista-device="${esc(r.device_id)}" data-lista-modo="${modo}">
      <span class="nm">${esc(r.nome)}${r.tipo ? `<small>${esc(r.tipo)}</small>` : ""}</span>
      <span class="brr"><i style="width:${r.estado === "mudo" ? 0 : r.n}%"></i></span>
      <span class="vl">${r.estado === "mudo" ? "—" : r.n + "%"}</span>
    </button></li>`).join("");
}

/* ⚠️ A prova NÃO pode ser reconstruída a cada tick de 10 s. O `innerHTML`
   volta a lâmina para 0% e ela sobe de novo: o síndico veria os tanques
   esvaziando e enchendo sozinhos a cada dez segundos, o que num painel de
   nível de água é exatamente a leitura errada. Só redesenhamos quando a
   leitura de fato mudou; caso contrário, atualizamos os valores no lugar. */
let _assinaturaProva = null;

function renderResposta() {
  const todas = leituras();
  const v = veredito(todas);
  const at = atendimento();

  document.body.dataset.estado = v.chave;
  document.body.dataset.atend  = at ? "sim" : "nao";

  const f = $("frase");
  f.innerHTML = v.frase;
  f.classList.toggle("risco", v.risco);
  $("apoio").textContent = v.apoio;
  $("desde").textContent = v.desde;

  if (at) {
    $("atendTxt").innerHTML = `${at.titulo}<small>${at.sub}</small>`;
    $("linhaAtend").dataset.chamado = at.id;
  }

  const box = $("prova");
  const pior = oPior(todas);
  const assinatura = pior
    ? `${pior.device_id}:${pior.estado}:${pior.n}:${pior.bomba}/${todas.length}`
    : `vazio/${todas.length}`;

  if (pior && assinatura !== _assinaturaProva) {
    _assinaturaProva = assinatura;
    box.innerHTML = provaHTML(pior, todas) + restoHTML(todas);

    /* A água sobe uma vez, na chegada — o único momento autoral da tela.
       ⚠️ O rAF é só o GATILHO da animação, nunca a fonte do dado: ele não
       dispara em aba invisível, e quem abrisse o painel numa aba de fundo
       veria o tubo vazio. O setTimeout garante o valor final mesmo sem
       quadro; os dois escrevem a mesma coisa, então rodar duas vezes é
       inofensivo. Vale como regra: nada de correção de dado pendurada em
       quadro de animação. */
    const encher = () => {
      box.querySelector(".agua")?.style.setProperty("--n", (pior.estado === "mudo" ? 0 : pior.n) + "%");
    };
    requestAnimationFrame(() => requestAnimationFrame(encher));
    setTimeout(encher, 80);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   2. A HISTÓRIA
   ────────────────────────────────────────────────────────────────────────
   Material real, sem inventar nada: os alertas abertos (que trazem
   `criado_em`) e o ciclo completo dos chamados.

   ⚠️ Alerta RESOLVIDO não entra: `/cliente/status` só devolve os abertos,
   então o alerta abre e nunca fecha na história. Preferimos o buraco
   honesto ao evento fabricado. Se um dia o endpoint devolver os resolvidos
   (`alertas_recentes`), é aqui que eles entram — é aditivo e não exige rota
   nova, logo NÃO mexe no sw.js.
   ════════════════════════════════════════════════════════════════════════ */

const MAX_EVENTOS = 40;

function nomeDoDevice(deviceId) {
  return reservatorios().find(r => r.device_id === deviceId)?.nome || "um reservatório";
}

function eventoDeAlerta(a) {
  const nome = esc(nomeDoDevice(a.device_id));
  if (a.tipo === "nivel_muito_baixo") {
    return { tom: "grave",  oque: `${nome} passou abaixo de ${LIMIARES.critico}%`, sub: "Alerta ainda aberto" };
  }
  if (a.tipo === "nivel_baixo") {
    return { tom: "alerta", oque: `${nome} passou abaixo de ${LIMIARES.baixo}%`,  sub: "Alerta ainda aberto" };
  }
  if (a.tipo === "dispositivo_offline") {
    return { tom: "alerta", oque: `${nome} parou de enviar leitura`, sub: "Alerta ainda aberto" };
  }
  return { tom: "alerta", oque: `${nome}: ${esc(String(a.tipo || "").replaceAll("_", " "))}`, sub: "Alerta ainda aberto" };
}

function montarEventos() {
  const ev = [];

  for (const a of alertasAbertos()) {
    if (!a.criado_em) continue;
    const e = eventoDeAlerta(a);
    // clicar leva ao histórico do reservatório de que o alerta fala
    ev.push({ ts: a.criado_em, ...e, device: a.device_id });
  }

  for (const c of _chamados) {
    const ref = `Chamado nº ${c.id}${c.titulo ? ` — ${esc(c.titulo)}` : ""}`;

    if (c.criado_em) {
      ev.push({ ts: c.criado_em, tom: "", oque: "Um chamado foi aberto", sub: ref, chamado: c.id });
    }

    if (c.status === "em_atendimento" || c.status === "fechado") {
      const quando = c.status === "em_atendimento" ? (c.atualizado_em || c.criado_em) : null;
      if (quando) {
        ev.push({
          ts: quando, tom: "",
          oque: c.tecnico_nome ? `${esc(c.tecnico_nome)} ficou responsável pelo atendimento` : "O atendimento começou",
          sub: ref, chamado: c.id,
        });
      }
    }

    if (c.status === "fechado" && c.fechado_em) {
      ev.push({
        ts: c.fechado_em, tom: "",
        oque: c.os_finalizada_em ? "Serviço concluído e assinado" : "Serviço concluído",
        sub: ref, chamado: c.id, avaliar: c.id,
      });
    } else if (c.os_finalizada_em) {
      ev.push({ ts: c.os_finalizada_em, tom: "", oque: "Ordem de serviço finalizada", sub: ref, chamado: c.id });
    }
  }

  ev.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return ev.slice(0, MAX_EVENTOS);
}

function rotuloDoDia(iso) {
  const hoje = new Date();  hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  if (d.getTime() === hoje.getTime())  return { rot: "Hoje",  hoje: true };
  if (d.getTime() === ontem.getTime()) return { rot: "Ontem", hoje: false };
  return { rot: new Date(iso).toLocaleDateString("pt-BR", { month: "long" }), hoje: false };
}

const ICO_SETA = `<svg class="seta" viewBox="0 0 24 24" stroke-linecap="square" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
const ICO_ESTRELA = `<svg viewBox="0 0 24 24" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/></svg>`;

// mesma razão da prova: a cada 10 s não se reconstrói o que não mudou
let _assinaturaHistoria = null;

function renderHistoria() {
  const wrap = $("historia");
  const ev = montarEventos();

  const assinatura = ev.map(e => `${e.ts}${e.oque}${e.avaliar ? _avaliado[e.avaliar] : ""}`).join("|");
  if (assinatura === _assinaturaHistoria) return;
  _assinaturaHistoria = assinatura;

  if (!ev.length) {
    wrap.innerHTML = `<p class="historia-vazio">Nada registrado ainda. Conforme o prédio for sendo monitorado e atendido, o que acontecer aparece aqui.</p>`;
    return;
  }

  let html = "";
  let diaAberto = null;

  for (const e of ev) {
    const { rot, hoje } = rotuloDoDia(e.ts);
    const chaveDia = new Date(e.ts).toDateString();
    if (chaveDia !== diaAberto) {
      if (diaAberto !== null) html += `</div></div>`;
      diaAberto = chaveDia;
      html += `<div class="dia-bloco${hoje ? " is-hoje" : ""}">
        <div class="dia-marca"><span class="dia-num">${new Date(e.ts).getDate()}</span><span class="dia-rot">${rot}</span></div>
        <div>`;
    }

    // o convite a avaliar mora na linha do serviço concluído — e só aparece
    // quando o detalhe já disse que este chamado não foi avaliado
    const convite = (e.avaliar && _avaliado[e.avaliar] === false)
      ? `<span class="pede-nota">${ICO_ESTRELA} Você ainda não avaliou este atendimento</span>`
      : "";

    const alvo = e.chamado ? `data-abrir="chamado" data-chamado="${e.chamado}"`
               : e.device  ? `data-abrir="reservatorio" data-device="${esc(e.device)}"` : "";

    html += `<button class="ev ${e.tom}" type="button" ${alvo}>
        <span class="quando">${hora(e.ts)}</span>
        <span class="oque">${e.oque}<small>${e.sub}</small>${convite}</span>
        ${ICO_SETA}
      </button>`;
  }
  html += `</div></div>`;
  wrap.innerHTML = html;
}

/* ⚠️ `/cliente/chamados` (lista) NÃO devolve `ja_avaliado` — só o detalhe
   devolve. Em vez de N requisições a cada tick, buscamos o detalhe dos 3
   chamados fechados mais recentes uma única vez e guardamos a resposta:
   é onde o convite a avaliar realmente importa, e o custo fica fixo. */
async function lerAvaliacoes() {
  const fechados = _chamados.filter(c => c.status === "fechado").slice(0, 3);
  const faltando = fechados.filter(c => _avaliado[c.id] === undefined);
  if (!faltando.length) return;
  await Promise.all(faltando.map(async c => {
    try {
      const r = await pedir(`/cliente/chamados/${c.id}`);
      if (!r.ok) { _avaliado[c.id] = true; return; }  // na dúvida, não convida
      const d = await r.json();
      _avaliado[c.id] = !!d.ja_avaliado;
    } catch { _avaliado[c.id] = true; }
  }));
}

/* ════════════════════════════════════════════════════════════════════════
   3. AS FICHAS — tudo que abre por cima
   ────────────────────────────────────────────────────────────────────────
   ⚠️ NUNCA duas fichas abertas. "Ver todos" → tocar um reservatório
   empilhava dois diálogos e o X fechava os dois de uma vez, devolvendo o
   síndico ao painel em vez da lista. É o vício de modal-sobre-modal do
   admin. Uma pilha de UM nível resolve: a ficha de origem é lembrada e o X
   devolve para ela.
   ════════════════════════════════════════════════════════════════════════ */

// ⚠️ `conta: "fConta"` saiu em 25/08/2026 — a ficha "Sua conta" deixou de
// existir: o nome de quem está logado e o "Sair" foram para a barra do topo.
const FICHAS = {
  ajuda: "fAjuda", chamado: "fChamado", todos: "fTodos",
  reservatorio: "fReservatorio",
};

let _origem = null;
let _focoAnterior = null;

function fichaAberta() {
  return Object.values(FICHAS).map(id => $(id)).find(n => n && !n.hidden) || null;
}

function abrir(chave, ctx = {}) {
  const el = $(FICHAS[chave]);
  if (!el) return;

  const ja = fichaAberta();
  if (ja && ja !== el) { _origem = { id: ja.id, ctx: ja._ctx }; ja.hidden = true; }
  else if (!ja) { _origem = null; _focoAnterior = document.activeElement; }

  el._ctx = ctx;
  el.hidden = false;
  document.body.classList.add("com-ficha");
  el.querySelector(".ficha")?.focus();

  if (chave === "ajuda")        prepararAjuda();
  if (chave === "chamado")      abrirChamado(ctx.chamado);
  if (chave === "todos")        prepararTodos(ctx.modo || "ver");
  if (chave === "reservatorio") abrirReservatorio(ctx.device);
}

function esconderTodas() {
  Object.values(FICHAS).forEach(id => { const n = $(id); if (n) n.hidden = true; });
}

function fecharTudo() {
  esconderTodas();
  _origem = null;
  document.body.classList.remove("com-ficha");
  _focoAnterior?.focus?.();
  _focoAnterior = null;
}

// o X volta para a ficha de origem quando ela existe
function voltar() {
  const de = _origem;
  esconderTodas();
  if (de) {
    _origem = null;
    const el = $(de.id);
    el.hidden = false;
    el.querySelector(".ficha")?.focus();
  } else {
    fecharTudo();
  }
}

/* ─── Ficha: pedir ajuda (POST /cliente/chamados) ────────────────────── */

let _motivo = null;

function prepararAjuda() {
  _motivo = null;
  document.querySelectorAll("#motivos .motivo").forEach(b => b.setAttribute("aria-pressed", "false"));
  $("ajudaTexto").value = "";
  $("ajudaMsg").textContent = "";
  $("ajudaMsg").className = "ficha-msg";
  $("fAjudaId").textContent = _status?.condominio?.nome || "Seu prédio";
}

async function enviarAjuda() {
  const msg = $("ajudaMsg");
  const btn = $("ajudaEnviar");
  const descricao = ($("ajudaTexto").value || "").trim();

  msg.className = "ficha-msg ruim";
  if (!_motivo)             { msg.textContent = "Escolha o que está acontecendo acima."; return; }
  if (descricao.length < 5) { msg.textContent = "Conte um pouco mais — pelo menos 5 caracteres."; return; }

  btn.disabled = true;
  msg.className = "ficha-msg";
  msg.textContent = "Abrindo o chamado…";
  try {
    const r = await pedir("/cliente/chamados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoria: _motivo, descricao }),
    });
    if (!r.ok) throw new Error(await erroDe(r));
    const novo = await r.json();
    await carregar();
    _origem = null;
    if (novo?.id) abrir("chamado", { chamado: novo.id });
    else fecharTudo();
  } catch (e) {
    msg.className = "ficha-msg ruim";
    msg.textContent = "Não deu para abrir o chamado: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

/* ─── Ficha: chamado ──────────────────────────────────────────────────────
   Uma ficha só para aberto e fechado. O compositor existe apenas com o
   chamado aberto (é o que o backend aceita); o chamado fechado diz por que
   não dá para responder e aponta para um novo pedido. A avaliação mora no
   PÉ desta ficha — nada de modal sobre modal, que era o vício do admin. */

let _chamadoAtual = null;
let _nota = 0;

async function abrirChamado(id) {
  const corpo = $("fChamadoCorpo");
  $("fChamadoId").textContent = `Chamado nº ${id}`;
  $("fChamadoT").textContent = "Carregando…";
  corpo.innerHTML = `<p class="ficha-intro">Buscando o atendimento…</p>`;
  _chamadoAtual = null;
  _nota = 0;

  try {
    const [dR, mR] = await Promise.all([
      pedir(`/cliente/chamados/${id}`),
      pedir(`/cliente/chamados/${id}/mensagens`),
    ]);
    if (!dR.ok) throw new Error(await erroDe(dR));
    const ch = await dR.json();
    const msgs = mR.ok ? await mR.json() : [];
    _chamadoAtual = ch;
    _avaliado[ch.id] = !!ch.ja_avaliado;
    renderChamado(ch, msgs);
  } catch (e) {
    corpo.innerHTML = `<p class="ficha-msg ruim">Não deu para abrir este chamado: ${esc(e.message)}</p>`;
  }
}

function passosDoChamado(ch) {
  const p = [];
  if (ch.criado_em) p.push({ q: dataHora(ch.criado_em), t: "O chamado foi aberto", s: ch.descricao ? `“${esc(ch.descricao)}”` : "" });
  if (ch.status === "em_atendimento" || ch.status === "fechado") {
    p.push({
      q: dataHora(ch.atualizado_em || ch.criado_em),
      t: ch.tecnico_nome ? `${esc(ch.tecnico_nome)} ficou responsável pelo atendimento` : "O atendimento começou",
      s: "",
    });
  }
  if (ch.status === "fechado" && ch.fechado_em) {
    p.push({
      q: dataHora(ch.fechado_em),
      t: ch.os_finalizada_em ? "Serviço concluído e assinado" : "Serviço concluído",
      s: ch.servico_realizado ? esc(ch.servico_realizado) : (ch.os_numero ? `Ordem de serviço ${esc(ch.os_numero)}` : ""),
    });
  }
  if (ch.status === "cancelado" && ch.cancelado_em) {
    p.push({
      q: dataHora(ch.cancelado_em),
      t: "O chamado foi cancelado",
      s: ch.cancelado_motivo ? esc(ch.cancelado_motivo) : "",
    });
  }
  return p.reverse();
}

function renderChamado(ch, msgs) {
  $("fChamadoId").textContent = `Chamado nº ${ch.id} · ${new Date(ch.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;
  $("fChamadoT").textContent = ch.titulo || "Atendimento";

  // ⚠️ "CANCELADO" É PALAVRA DA EQUIPE, NÃO DO SÍNDICO (04/09/2026,
  // migration 083). Para quem pediu ajuda, o que importa é que ninguém vai
  // aparecer — e o motivo, que a equipe escreveu ao cancelar. Dizer só
  // "Cancelado" deixaria o pedido sumir sem explicação nenhuma na tela de quem
  // abriu, que é o começo de um telefonema.
  const estadoTxt = ch.status === "cancelado"
    ? "Cancelado pela equipe"
    : ch.status === "fechado"
    ? (ch.os_finalizada_em ? "Concluído e assinado" : "Concluído")
    : ch.status === "em_atendimento"
      ? `Em atendimento${ch.tecnico_nome ? " — " + esc(ch.tecnico_nome) : ""}`
      : "Aberto, aguardando atendimento";
  // ⚠️ ponto azul, não âmbar: âmbar neste sistema significa ATENÇÃO, e
  // chamado em curso não é alarme. O painel já errou isso uma vez pintando
  // "Em atendimento" de vermelho.
  const pontoCls = (ch.status === "fechado" || ch.status === "cancelado") ? "" : "aberto";

  const meuId = usuarioLocal().id;
  const conversa = msgs.length
    ? `<div class="conversa">${msgs.map(m => {
        const meu = meuId && m.autor_id === meuId;
        const quem = meu ? "Você" : esc(m.autor_nome || (m.autor_role === "tecnico" ? "Técnico" : "Equipe"));
        const foto = m.foto_url ? `<img src="${esc(m.foto_url)}" alt="Foto enviada no atendimento">` : "";
        return `<div class="fala${meu ? " minha" : ""}">
          <span class="quem">${quem} · ${dataHora(m.criado_em)}</span>${esc(m.texto || "")}${foto}
        </div>`;
      }).join("")}</div>`
    : `<p class="conversa-vazia">Ainda não há mensagens neste chamado.</p>`;

  const composer = (ch.status !== "fechado" && ch.status !== "cancelado")
    ? `<label class="campo"><span>Responder</span>
         <textarea id="chatTexto" rows="3" maxlength="2000" placeholder="Escreva aqui…"></textarea></label>
       <div class="acoes"><button class="btn-fio" id="chatEnviar" type="button">Enviar</button></div>
       <p class="ficha-msg" id="chatMsg" role="status"></p>`
    : ch.status === "cancelado"
      ? `<p class="fechado-aviso">Este chamado foi cancelado${
          ch.cancelado_motivo ? ": " + esc(ch.cancelado_motivo) : ""
        }. Se ainda precisa do serviço, abra um novo pedido de ajuda.</p>`
      : `<p class="fechado-aviso">Este chamado foi fechado. Para falar de novo com a equipe, abra um novo pedido de ajuda.</p>`;

  const avaliacao = (ch.status === "fechado" && !ch.ja_avaliado)
    ? `<div class="bloco">
         <h4>Como foi esse atendimento?</h4>
         <p>Sua resposta vai direto para quem cuida da manutenção do prédio.</p>
         <div class="estrelas" id="estrelas" role="radiogroup" aria-label="Nota do atendimento">
           ${[1, 2, 3, 4, 5].map(n => `<button data-nota="${n}" role="radio" aria-checked="false" aria-label="${n} de 5" type="button">${ICO_ESTRELA}</button>`).join("")}
         </div>
         <label class="campo"><span>Quer contar alguma coisa? (opcional)</span>
           <textarea id="avalTexto" rows="2" maxlength="1000" placeholder="O que foi bom, o que pode melhorar…"></textarea></label>
         <div class="acoes"><button class="btn-fio" id="avalEnviar" type="button">Enviar avaliação</button></div>
         <p class="ficha-msg" id="avalMsg" role="status"></p>
       </div>`
    : ch.ja_avaliado
      ? `<div class="bloco"><h4>Obrigado pela avaliação</h4><p>Ela já chegou a quem cuida da manutenção do prédio.</p></div>`
      : "";

  $("fChamadoCorpo").innerHTML = `
    <div class="estado-linha"><span class="ponto ${pontoCls}"></span> ${estadoTxt}</div>
    <ul class="passos">${passosDoChamado(ch).map(p =>
      `<li><span class="quando">${p.q}</span><span>${p.t}${p.s ? `<small>${p.s}</small>` : ""}</span></li>`).join("")}</ul>
    <div class="bloco">
      <h4>A conversa</h4>
      ${conversa}
      ${composer}
    </div>
    ${avaliacao}`;
}

async function enviarMensagem() {
  const inp = $("chatTexto"), btn = $("chatEnviar"), msg = $("chatMsg");
  const texto = (inp?.value || "").trim();
  if (!texto || !_chamadoAtual) return;

  btn.disabled = true;
  msg.className = "ficha-msg";
  msg.textContent = "Enviando…";
  try {
    const r = await pedir(`/cliente/chamados/${_chamadoAtual.id}/mensagens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!r.ok) throw new Error(await erroDe(r));
    await abrirChamado(_chamadoAtual.id);
  } catch (e) {
    msg.className = "ficha-msg ruim";
    msg.textContent = "Não deu para enviar: " + e.message;
    btn.disabled = false;
  }
}

async function enviarAvaliacao() {
  const msg = $("avalMsg"), btn = $("avalEnviar");
  if (!_chamadoAtual) return;
  if (!_nota) {
    msg.className = "ficha-msg ruim";
    msg.textContent = "Escolha de 1 a 5 estrelas.";
    return;
  }
  const comentario = ($("avalTexto").value || "").trim();
  btn.disabled = true;
  msg.className = "ficha-msg";
  msg.textContent = "Enviando…";
  try {
    const r = await pedir(`/cliente/chamados/${_chamadoAtual.id}/avaliar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota: _nota, comentario: comentario || undefined }),
    });
    if (!r.ok) throw new Error(await erroDe(r));
    _avaliado[_chamadoAtual.id] = true;
    await abrirChamado(_chamadoAtual.id);
    renderHistoria();
  } catch (e) {
    msg.className = "ficha-msg ruim";
    msg.textContent = "Não deu para enviar a avaliação: " + e.message;
    btn.disabled = false;
  }
}

/* ─── Ficha: todos os reservatórios ───────────────────────────────────────
   Serve em dois modos. "ver" é o inventário; "pdf" é a escolha de qual
   reservatório vai no relatório — porque `/relatorio/pdf` exige um
   `device_id` e a história fala do prédio inteiro. */
function prepararTodos(modo) {
  const todas = leituras();
  $("resLista").innerHTML = listaHTML(todas, modo);
  const intro = $("fTodosIntro");
  $("fTodosId").textContent = _status?.condominio?.nome || "Seu prédio";
  if (modo === "pdf") {
    $("fTodosT").textContent = "Relatório em PDF";
    intro.hidden = false;
    intro.textContent = "O relatório é de um reservatório por vez. Escolha qual: baixamos os últimos 30 dias dele.";
  } else {
    $("fTodosT").textContent = "Todos os reservatórios";
    intro.hidden = true;
  }
}

/* ─── Ficha: reservatório (histórico + PDF) ───────────────────────────── */

let _resDevice = null;
let _resDias = 7;

function abrirReservatorio(deviceId) {
  _resDevice = deviceId;
  const r = leituras().find(x => x.device_id === deviceId);
  $("fResT").textContent = r?.nome || "Reservatório";
  $("fResId").textContent = r?.tipo ? `Reservatório · ${r.tipo}` : "Reservatório";
  $("fResMsg").textContent = "";
  $("fResMsg").className = "ficha-msg";

  const est = $("fResEstado");
  est.querySelector(".ponto").className = "ponto" +
    (r?.estado === "critico" ? " risco" : r?.estado === "baixo" ? " atencao" : r?.estado === "mudo" ? " aberto" : "");
  $("fResEstadoTxt").textContent = !r ? "—"
    : r.estado === "mudo"    ? "Sem leitura — o sensor parou de responder"
    : r.estado === "critico" ? `${r.n}% agora — abaixo de ${LIMIARES.critico}%, tratamos como urgência`
    : r.estado === "baixo"   ? `${r.n}% agora — abaixo de ${LIMIARES.baixo}%, acompanhando`
    : `${r.n}% agora — dentro do esperado`;

  aplicarPeriodo(_resDias);
  carregarGrafico();
}

function aplicarPeriodo(dias) {
  _resDias = dias;
  document.querySelectorAll("#fResPeriodos button").forEach(b =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.dias) === dias)));
  const rot = { 1: "24 horas", 7: "7 dias", 30: "30 dias", 90: "90 dias" }[dias];
  $("fResPdf").textContent = `Baixar PDF de ${rot}`;
}

/* O gráfico é SVG desenhado aqui, não uma biblioteca: são oito linhas de
   path para um traçado que o síndico olha por três segundos, e a página
   deixou de carregar os ~200 KB do ApexCharts por causa disso.
   ⚠️ O rótulo do limiar é HTML posicionado por cima, não `<text>` dentro
   do viewBox: lá dentro ele encolhe junto com o gráfico e vira borrão no
   celular. E a malha e o limiar são desenhados DEPOIS da área, senão ela
   os cobre. */
function graficoSVG(pontos, dias) {
  const W = 600, H = 190;
  const x = i => pontos.length === 1 ? W / 2 : (i / (pontos.length - 1)) * W;
  const y = p => H - (Math.max(0, Math.min(100, p)) / 100) * H;

  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const min = Math.min(...pontos), max = Math.max(...pontos);
  const rot = { 1: "24 HORAS ATRÁS", 7: "7 DIAS ATRÁS", 30: "30 DIAS ATRÁS", 90: "90 DIAS ATRÁS" }[dias];

  return `
    <div class="grafico-caixa">
      <svg class="grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
           aria-label="Nível nos últimos ${rot.toLowerCase()}, entre ${Math.round(min)}% e ${Math.round(max)}%">
        <path class="area" d="${area}"/>
        <line class="malha" x1="0" y1="${y(75)}" x2="${W}" y2="${y(75)}"/>
        <line class="malha" x1="0" y1="${y(50)}" x2="${W}" y2="${y(50)}"/>
        <line class="limiar" x1="0" y1="${y(LIMIARES.baixo)}" x2="${W}" y2="${y(LIMIARES.baixo)}"/>
        <path class="linha" d="${d}"/>
      </svg>
      <span class="rot-limiar">${LIMIARES.baixo}% — LIMIAR</span>
    </div>
    <div class="eixo"><span>${rot}</span><span>AGORA</span></div>`;
}

async function carregarGrafico() {
  const alvo = $("fResGrafico");
  if (!_resDevice) return;
  alvo.innerHTML = `<p class="grafico-vazio">Carregando as leituras…</p>`;
  try {
    const r = await pedir(`/cliente/historico?device_id=${encodeURIComponent(_resDevice)}&dias=${_resDias}`);
    if (!r.ok) throw new Error(await erroDe(r));
    const data = await r.json();
    const pontos = (Array.isArray(data.leituras) ? data.leituras : [])
      .map(l => Number(l.nivel_pct_avg))
      .filter(n => Number.isFinite(n));
    alvo.innerHTML = pontos.length
      ? graficoSVG(pontos, _resDias)
      : `<p class="grafico-vazio">Sem leituras registradas neste período.</p>`;
  } catch (e) {
    alvo.innerHTML = `<p class="grafico-vazio">Não deu para carregar o histórico: ${esc(e.message)}</p>`;
  }
}

async function baixarPDF(deviceId, dias, btn, msgEl) {
  const rotulo = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Gerando PDF…"; }
  if (msgEl) { msgEl.className = "ficha-msg"; msgEl.textContent = ""; }
  try {
    const r = await pedir(`/relatorio/pdf?device_id=${encodeURIComponent(deviceId)}&dias=${dias}`);
    if (!r.ok) throw new Error(await erroDe(r));
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const cd = r.headers.get("Content-Disposition") || "";
    a.download = (cd.match(/filename="?([^"]+)"?/) || [])[1] || "relatorio.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    if (msgEl) { msgEl.className = "ficha-msg ruim"; msgEl.textContent = "Não deu para gerar o PDF: " + e.message; }
    else alert("Não deu para gerar o PDF: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = rotulo; }
  }
}


/* ════════════════════════════════════════════════════════════════════════
   4. CARGA
   ════════════════════════════════════════════════════════════════════════ */

function identidade() {
  const u = usuarioLocal();
  $("nomePredio").textContent = _status?.condominio?.nome || "Meu prédio";
  // Só o nome: o "— sua conta" era o rótulo de um botão que abria a ficha, e
  // a ficha não existe mais. Aqui isto é identificação, não caminho.
  $("nomeSindico").textContent = u.nome || "";
  $("rodapeLinha").textContent = _status?.condominio?.nome
    ? `Painel do síndico · ${_status.condominio.nome}`
    : "Painel do síndico";
  $("rodapeAno").textContent = String(new Date().getFullYear());
}

function mostrarAviso(txt) {
  const el = $("aviso");
  if (!txt) { el.hidden = true; return; }
  $("avisoTxt").innerHTML = txt;
  el.hidden = false;
}

async function carregar() {
  try {
    const [sR, cR] = await Promise.all([
      pedir("/cliente/status"),
      pedir("/cliente/chamados").catch(() => null),
    ]);

    if (!sR.ok) {
      // 403 NÃO é sessão inválida: é role diferente de 'cliente' ou cliente
      // sem condominio_id vinculado. Mandar 403 pro login criava um
      // vai-e-vem silencioso (login → painel → login) sem mensagem nenhuma.
      const detalhe = await erroDe(sR);
      mostrarAviso(`<b>Não consegui ler os sensores agora.</b> ${esc(detalhe)}`);
      if (_primeiraCarga) {
        $("frase").textContent = "Não consegui ler os sensores.";
        $("apoio").textContent = "A leitura não chegou até aqui. Tente de novo em instantes — se continuar, ligue para (11) 2038-8679.";
        document.body.dataset.estado = "erro";
      }
      return;
    }

    mostrarAviso(null);
    _status = await sR.json();
    if (cR?.ok) _chamados = await cR.json();

    identidade();
    renderResposta();
    renderHistoria();
    _primeiraCarga = false;

    await lerAvaliacoes();
    renderHistoria();
  } catch (e) {
    if (String(e.message).includes("sessão")) return;
    mostrarAviso(`<b>Sem conexão com o servidor.</b> ${esc(e.message)}`);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   5. LIGAÇÕES
   ════════════════════════════════════════════════════════════════════════ */

document.addEventListener("click", ev => {
  // qualquer coisa que abre ficha
  const alvo = ev.target.closest("[data-abrir]");
  if (alvo) {
    abrir(alvo.dataset.abrir, {
      chamado: alvo.dataset.chamado ? Number(alvo.dataset.chamado) : undefined,
      device: alvo.dataset.device,
    });
    return;
  }
  if (ev.target.closest("[data-fechar]")) { voltar(); return; }
  // clique no fundo fecha (no celular a folha cobre o fundo e isso não existe
  // — por isso o X tem 48px lá)
  if (ev.target.classList.contains("ficha-fundo")) { voltar(); return; }

  const atend = ev.target.closest("#linhaAtend");
  if (atend) { abrir("chamado", { chamado: Number(atend.dataset.chamado) }); return; }

  const motivo = ev.target.closest("#motivos .motivo");
  if (motivo) {
    document.querySelectorAll("#motivos .motivo").forEach(b => b.setAttribute("aria-pressed", "false"));
    motivo.setAttribute("aria-pressed", "true");
    _motivo = motivo.dataset.cat;
    return;
  }

  const item = ev.target.closest("[data-lista-device]");
  if (item) {
    if (item.dataset.listaModo === "pdf") baixarPDF(item.dataset.listaDevice, 30, null, null);
    else abrir("reservatorio", { device: item.dataset.listaDevice });
    return;
  }

  const per = ev.target.closest("#fResPeriodos button");
  if (per) { aplicarPeriodo(Number(per.dataset.dias)); carregarGrafico(); return; }

  const estrela = ev.target.closest("#estrelas button");
  if (estrela) {
    _nota = Number(estrela.dataset.nota);
    document.querySelectorAll("#estrelas button").forEach(b => {
      const n = Number(b.dataset.nota);
      b.classList.toggle("on", n <= _nota);
      b.setAttribute("aria-checked", String(n === _nota));
    });
    return;
  }

  if (ev.target.closest("#ajudaEnviar")) { enviarAjuda(); return; }
  if (ev.target.closest("#chatEnviar"))  { enviarMensagem(); return; }
  if (ev.target.closest("#avalEnviar"))  { enviarAvaliacao(); return; }
  if (ev.target.closest("#btnSair"))     { logout(); return; }
  if (ev.target.closest("#avisoBtn"))    { carregar(); return; }

  if (ev.target.closest("#btnPdf")) {
    const todas = leituras();
    if (todas.length === 1) baixarPDF(todas[0].device_id, 30, $("btnPdf"), null);
    else if (todas.length) abrir("todos", { modo: "pdf" });
    return;
  }
});

document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && fichaAberta()) voltar();
});

// Enter envia a mensagem do chamado; Shift+Enter quebra linha
document.addEventListener("keydown", ev => {
  if (ev.target?.id === "chatTexto" && ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    enviarMensagem();
  }
});

/* a barra ganha fundo e fio ao rolar — em repouso ela não pesa sobre o
   campo. O limiar é o MESMO da landing (`landing.js`): as duas barras
   trocam de estado na mesma rolagem. */
addEventListener("scroll", () => {
  $("barra").classList.toggle("is-rolada", scrollY > 12);
}, { passive: true });

/* ── Selo de orçamento aguardando ────────────────────────────────────────
   Conta só os `enviado` — os já respondidos não pedem nada de ninguém.

   Request própria, e não um campo no payload do painel, porque a lista de
   orçamentos tem escopo e regra de visibilidade próprios no backend
   (`_ORC_VISIVEIS_AO_CLIENTE`), e duplicar isso no endpoint do painel seria
   duas fontes da mesma verdade. Roda uma vez na carga: orçamento não chega
   de minuto em minuto como leitura de sensor, então não entra no ciclo de
   10s do `carregar()`.

   Falha em silêncio de propósito — se a lista não vier, o cabeçalho fica sem
   selo e o link continua funcionando. Não há nada que o síndico possa fazer
   com uma mensagem de erro aqui. */
async function pintarSeloOrc() {
  const selo = $("orcSelo");
  if (!selo) return;
  try {
    const r = await pedir("/cliente/orcamentos");
    if (!r.ok) return;
    const j = await r.json();
    const pend = (j.orcamentos || []).filter(o => o.status === "enviado").length;
    if (!pend) return;
    selo.textContent = pend;
    selo.hidden = false;
    // O alvo é o link inteiro: quem usa leitor de tela ouve o motivo de o
    // selo estar aceso, não só o número solto.
    selo.closest(".conta-orc")?.setAttribute(
      "aria-label",
      pend === 1 ? "Orçamentos — 1 aguardando sua resposta"
                 : `Orçamentos — ${pend} aguardando sua resposta`
    );
  } catch (_) { /* silêncio proposital, ver acima */ }
}

carregar();
setInterval(carregar, 10000);
pintarSeloOrc();
