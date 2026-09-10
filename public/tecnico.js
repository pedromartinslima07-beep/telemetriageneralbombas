// tecnico.js — Equipamentos (/tecnico/painel).
//
// A tela do técnico no NAVEGADOR. Até 10/09/2026 o login com role `tecnico`
// mandava para `/tecnico/painel`, que não existia no Express: a pessoa
// digitava a senha certa e caía num 404. O app tinha painel; o site, não.
//
// ⚠️ O CELULAR É A CENA PRINCIPAL — "o foco desse login é 100% mobile".
// Uma coluna, alvo grande, nada que dependa de hover.
//
// ⚠️ ESTA TELA NÃO AGE, ELA ACHA. Quem registra retirada, conserto, devolução
// e orçamento é a ficha da etiqueta (`/e/:codigo`), que já existe e é a mesma
// que o QR abre. Repetir aqui as ações de lá criaria dois lugares para dizer
// a mesma coisa sobre a mesma bomba.
//
// ⚠️ NÃO importa nada do `admin.js` nem das telas do operador. Os helpers de
// sessão abaixo são cópia deliberada, como nas telas irmãs.

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

/* ── Os estados ──────────────────────────────────────────────────────────
   Os mesmos oito do CHECK da migration 070, com as palavras da oficina. A
   ORDEM É A DO CICLO (chega → espera → conserta → sai), não alfabética: é
   assim que a lista conta o caminho da bomba. */
const ESTADOS = [
  { chave: "oficina",              rot: "Na oficina" },
  { chave: "aguardando_orcamento", rot: "Aguardando orçamento" },
  { chave: "aguardando_peca",      rot: "Aguardando peça" },
  { chave: "em_conserto",          rot: "Em conserto" },
  { chave: "pronto",               rot: "Pronta para devolver" },
  { chave: "instalado",            rot: "No prédio" },
  { chave: "baixado",              rot: "Baixada" },
];

// ⚠️ ETIQUETA EM BRANCO NÃO ENTRA NA LISTA (10/09/2026, pedido do Pedro).
// `etiqueta_livre` é papel impresso esperando uma bomba: não tem prédio, nem
// apelido, nem defeito — a linha nasce com o código e a palavra "sem
// cadastro", e são dezenas delas por lote. Numa tela que responde "onde está
// esta peça", isso é estoque de adesivo ocupando a resposta.
// Elas continuam alcançáveis pelo caminho que a operação usa de verdade:
// escanear a etiqueta abre a ficha, e ali é onde o cadastro acontece.
const FORA_DA_LISTA = ["etiqueta_livre"];
const ROT = Object.fromEntries(ESTADOS.map((e) => [e.chave, e.rot]));

// ⚠️ "NA OFICINA" É UM FILTRO, NÃO UM ESTADO. Quatro estados do banco querem
// dizer "a bomba está parada aqui dentro" — e é essa a pergunta do técnico
// quando ele abre a tela, não em qual dos quatro ela está.
const NA_OFICINA = ["oficina", "aguardando_orcamento", "aguardando_peca", "em_conserto"];

const FILTROS = [
  { id: "oficina", rot: "Na oficina", estados: NA_OFICINA },
  { id: "predio",  rot: "No prédio",  estados: ["pronto", "instalado"] },
  { id: "tudo",    rot: "Tudo",       estados: null },
];

/* ── A tela ──────────────────────────────────────────────────────────── */
let DADOS = [];
let FILTRO = "oficina";
let BUSCA = "";

async function carregar() {
  // ⚠️ UMA REQUEST, SEM FILTRO NO SERVIDOR. O parque inteiro cabe numa
  // resposta (o `limit` do endpoint é 200) e o filtro daqui é de leitura —
  // ir ao servidor a cada toque de chip custaria uma espera em rede 3G para
  // reordenar o que já está na mão.
  const r = await fetch("/equipamentos", { headers: authHeaders() });
  const d = await lerJson(r, "Equipamentos");
  if (!r.ok) throw new Error(d.error || "Erro ao carregar os equipamentos");
  // ⚠️ O CORTE É NA CARGA, não na hora de desenhar: assim a manchete, a
  // contagem de cada grupo e o filtro "Tudo" falam todos do mesmo conjunto.
  // Filtrar só no render deixaria "Tudo" mostrando um número que a lista não
  // tem.
  DADOS = (Array.isArray(d) ? d : []).filter((e) => !FORA_DA_LISTA.includes(e.status));
  return DADOS;
}

function visiveis() {
  const f = FILTROS.find((x) => x.id === FILTRO) || FILTROS[0];
  const termo = BUSCA.trim().toLowerCase();
  return DADOS.filter((e) => {
    if (f.estados && !f.estados.includes(e.status)) return false;
    if (!termo) return true;
    return [e.codigo, e.apelido, e.marca, e.modelo, e.numero_serie, e.condominio_nome]
      .some((v) => v && String(v).toLowerCase().includes(termo));
  });
}

/* ── As peças ────────────────────────────────────────────────────────── */
// A leitura grande da placa é o APELIDO ("Bomba 2 — recalque"), que é como a
// equipe chama a peça. Sem apelido, o tipo e a marca respondem — e sem nada
// disso sobra a etiqueta em branco, que ainda não é uma bomba.
function nomeDe(e) {
  if (e.apelido) return e.apelido;
  const partes = [e.tipo, e.marca, e.modelo].filter(Boolean);
  if (partes.length) return partes.join(" · ");
  // Cadastrada e ainda sem apelido nem dados de placa — acontece quando o
  // técnico registra a retirada com a bomba na mão e preenche o resto depois.
  return "Sem identificação";
}

// ⚠️ A PLACA NÃO REPETE O ESTADO. Ele é o cabeçalho do grupo em que a peça
// está, e escrevê-lo de novo em cada linha era a mesma palavra duas vezes na
// mesma tela — que a 320px ainda estourava a placa ("AGUARDANDO ORÇAMENT…").
function item(e) {
  const meta = [];
  if (e.condominio_nome) meta.push(`<b>${escapar(e.condominio_nome)}</b>`);
  if (e.apelido && e.marca) meta.push(escapar([e.marca, e.modelo].filter(Boolean).join(" ")));
  if (e.defeito_relatado) meta.push(escapar(e.defeito_relatado));
  return `
  <a class="eq-item" href="/e/${encodeURIComponent(e.codigo)}">
    <span class="eq-cod">${escapar(e.codigo)}</span>
    <span class="eq-item-main">
      <h3 class="eq-nome">${escapar(nomeDe(e))}</h3>
      ${meta.length ? `<p class="eq-meta">${meta.join(" · ")}</p>` : ""}
    </span>
  </a>`;
}

// Agrupa pelo estado, na ordem do ciclo. Estado sem nenhuma peça não desenha
// cabeçalho: prateleira vazia é ruído numa tela de celular.
function grupos(lista) {
  return ESTADOS
    .map((e) => ({ ...e, itens: lista.filter((x) => x.status === e.chave) }))
    .filter((g) => g.itens.length);
}

function ferramentas() {
  const chips = FILTROS.map((f) => `
    <button type="button" class="eq-chip" data-filtro="${f.id}"
      aria-pressed="${FILTRO === f.id ? "true" : "false"}">${escapar(f.rot)}</button>`).join("");
  return `
  <div class="eq-ferramentas">
    ${/* ⚠️ ESCANEAR VEM ANTES DA BUSCA, e é a única ação âmbar da tela. No
         celular, que é a cena principal, ler a etiqueta é o caminho normal de
         chegar numa peça — digitar oito caracteres de código é o plano B de
         quando o QR está sujo. A ordem na tela é a ordem do trabalho. */""}
    <button type="button" class="btn eq-scan-btn" data-acao="escanear">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
        <path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4"/><path d="M7 12h10"/>
      </svg>
      Escanear etiqueta
    </button>
    <label class="sr-only" for="eqBusca">Procurar equipamento</label>
    <input class="eq-busca" id="eqBusca" type="search" inputmode="search"
      placeholder="Código, apelido ou prédio" value="${escapar(BUSCA)}"
      autocomplete="off" autocapitalize="characters" spellcheck="false">
    <div class="eq-filtros">${chips}</div>
  </div>`;
}

function render() {
  const tela = document.getElementById("tela");
  const lista = visiveis();
  const naOficina = DADOS.filter((e) => NA_OFICINA.includes(e.status)).length;

  const manchete = naOficina
    ? `<h1><b>${naOficina}</b> ${naOficina > 1 ? "peças paradas" : "peça parada"} na oficina</h1>
       <p class="eq-lede">Toque numa peça para abrir a ficha dela — a mesma que a
          etiqueta abre.</p>`
    : `<h1>Nenhuma peça <b>parada</b> na oficina.</h1>
       <p class="eq-lede">O que já voltou para o prédio continua aqui, em
          <b>No prédio</b>.</p>`;

  const corpo = lista.length
    ? grupos(lista).map((g) => `
      <section class="eq-grupo">
        <div class="eq-grupo-cab">
          <h2>${escapar(g.rot)}</h2>
          <span>${g.itens.length}</span>
        </div>
        ${g.itens.map(item).join("")}
      </section>`).join("")
    // ⚠️ VAZIO É ESTADO, e o texto diz qual dos dois vazios é: não achou nada
    // com a busca, ou não há nada neste filtro. Mesma regra das telas irmãs.
    : `<section class="calmo">
         <h1>${BUSCA ? "Nada encontrado." : "Nada aqui."}</h1>
         <p>${BUSCA
             ? `Nenhum equipamento com <b>${escapar(BUSCA)}</b> no código, no apelido ou no prédio.`
             : "Nenhum equipamento neste filtro. Toque em <b>Tudo</b> para ver o parque inteiro."}</p>
       </section>`;

  tela.innerHTML = `
    <header class="eq-topo">${manchete}</header>
    ${ferramentas()}
    <div class="eq-lista">${corpo}</div>`;
}

// ⚠️ REDESENHA SÓ A LISTA ao digitar. `render()` inteiro recria o `<input>`,
// e no celular isso FECHA O TECLADO a cada letra — o campo que recebeu o
// toque deixa de existir no meio da digitação.
function _pintarLista() {
  const alvo = document.querySelector(".eq-lista");
  if (!alvo) return render();
  const lista = visiveis();
  alvo.innerHTML = lista.length
    ? grupos(lista).map((g) => `
      <section class="eq-grupo">
        <div class="eq-grupo-cab">
          <h2>${escapar(g.rot)}</h2>
          <span>${g.itens.length}</span>
        </div>
        ${g.itens.map(item).join("")}
      </section>`).join("")
    : `<section class="calmo">
         <h1>${BUSCA ? "Nada encontrado." : "Nada aqui."}</h1>
         <p>${BUSCA
             ? `Nenhum equipamento com <b>${escapar(BUSCA)}</b> no código, no apelido ou no prédio.`
             : "Nenhum equipamento neste filtro. Toque em <b>Tudo</b> para ver o parque inteiro."}</p>
       </section>`;
}

/* ── O leitor de etiqueta ────────────────────────────────────────────────
   Pedido do Pedro (10/09/2026): *"coloque uma parte para abrir a câmera e
   escanear o qr code para cadastro"*.

   ⚠️ SEM BIBLIOTECA, e não é economia: a CSP do helmet é `script-src 'self'`,
   então script de CDN não executa — e sem erro visível, que é o que engana.
   Quem lê o código é o `BarcodeDetector` do próprio navegador.

   ⚠️ E SEM PLUGIN, que é o outro lado da mesma decisão. O módulo registra que
   scanner NO APP mexeria no build Android (ver `docs/modulos/equipamentos.md`);
   aqui não há build nenhum — é o navegador do celular pedindo a câmera.

   ⚠️ O QR NÃO GUARDA O CÓDIGO, GUARDA A URL (`<base>/e/CODIGO`). Ler o texto
   cru e mandar para a ficha daria `/e/https://...`. Por isso o `codigoDe`
   separa a última parte da URL — e tolera o hífen do código impresso, que
   existe só para leitura humana e não está no banco.

   ⚠️ NÃO HÁ CAMPO PARA DIGITAR O CÓDIGO AQUI, e ele existiu por um tempo:
   entrou como plano B do QR sujo e o Pedro o tirou em 10/09/2026. O diálogo é
   de uma coisa só — apontar a câmera. Quem precisa achar uma peça sem
   escanear usa a BUSCA DA TELA, que já procura por código, apelido e prédio;
   duas portas para a mesma coisa, uma delas dentro de um diálogo de câmera,
   é o tipo de acúmulo que esta tela existe para não ter.

   ⚠️ A CÂMERA PRECISA DE CONTEXTO SEGURO. Em `http://` que não seja
   localhost, `navigator.mediaDevices` nem existe: o diálogo diz isso em vez
   de ficar preto para sempre. */
const RE_CODIGO = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

// "AB7K-2M9X", "ab7k2m9x" ou "https://host/e/AB7K2M9X" → "AB7K2M9X".
function codigoDe(texto) {
  let t = String(texto || "").trim();
  const barra = t.lastIndexOf("/");
  if (barra >= 0) t = t.slice(barra + 1);
  t = t.replace(/[-\s]/g, "").toUpperCase();
  return RE_CODIGO.test(t) ? t : null;
}

let _stream = null;
let _lendo = false;
let _focoAnterior = null;

function pararCamera() {
  _lendo = false;
  // ⚠️ PARAR AS TRILHAS À MÃO. Só remover o <video> do DOM deixa a câmera
  // LIGADA — a luz do aparelho fica acesa e o técnico acha que a tela está
  // gravando. Vale para o fechar, para o Esc e para a saída da página.
  if (_stream) { for (const t of _stream.getTracks()) t.stop(); _stream = null; }
}

function fecharFundo() {
  pararCamera();
  const d = document.getElementById("fundo");
  if (d) { try { d.close(); } catch { /* já fechado */ } d.remove(); }
  document.body.classList.remove("com-ficha");
  if (_focoAnterior && _focoAnterior.isConnected) _focoAnterior.focus();
  _focoAnterior = null;
}

// ⚠️ CADA FRASE NOMEIA O PROBLEMA E A SAÍDA. Sem o campo de digitar, uma
// mensagem que só diz "não deu" deixa o técnico parado na casa de máquinas —
// e a saída, em toda falha de câmera, é a mesma que ele já usa hoje: o app de
// câmera do próprio celular lê a etiqueta e abre a ficha sozinho.
const SAIDA = " O app de câmera do celular também lê a etiqueta e abre a ficha.";

function _erroCamera(e) {
  const nome = e && e.name;
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "Você recusou o acesso à câmera. Libere nas permissões do site e toque de novo." + SAIDA;
  }
  if (nome === "NotFoundError" || nome === "OverconstrainedError") {
    return "Nenhuma câmera encontrada neste aparelho." + SAIDA;
  }
  if (nome === "NotReadableError") {
    return "A câmera está ocupada por outro aplicativo. Feche o outro e toque de novo.";
  }
  return "Não deu para abrir a câmera." + SAIDA;
}

function _dizer(texto) {
  const el = document.getElementById("scanNota");
  if (el) el.textContent = texto;
}

// ⚠️ SEM IMAGEM, O QUADRO SAI. Ele é uma praça preta no meio do diálogo:
// mantido quando a câmera falhou, empurra para fora da tela do celular
// justamente a frase que explica o que houve.
// ⚠️ E APARECE "TENTAR DE NOVO". Quase toda falha daqui é recuperável — a
// permissão foi recusada sem querer, outro aplicativo estava com a câmera —,
// e sem botão o único caminho seria fechar o diálogo e abrir outra vez, que é
// exatamente o que o botão faz sem obrigar ninguém a descobrir.
function _semCamera(texto) {
  const cx = document.querySelector(".eq-scan");
  cx?.classList.add("is-sem-camera");
  _dizer(texto);
  const btn = document.getElementById("scanRetry");
  if (btn) { btn.hidden = false; btn.focus(); }
}

async function abrirLeitor() {
  // ⚠️ SÓ GUARDA O FOCO NA PRIMEIRA ABERTURA. O "Tentar de novo" vive DENTRO
  // do diálogo e reabre por aqui: guardar de novo salvaria um botão que a
  // linha seguinte destrói, e ao fechar o foco não teria para onde voltar.
  if (!document.getElementById("fundo")) _focoAnterior = document.activeElement;
  fecharFundo();
  // ⚠️ AS CLASSES SÃO AS DA FOLHA (`.fundo` + `.ficha`), e o diálogo é um
  // `<dialog>` com `showModal()`. Classe inventada aqui renderiza SEM ESTILO
  // NENHUM — a armadilha que o `operador-preventivas.js` já registra.
  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="fundo" id="fundo">
      <div class="ficha" style="width:min(520px,100%)" role="dialog" aria-label="Escanear a etiqueta">
        <div class="ficha-cab">
          <div><h2>Escanear etiqueta</h2></div>
          <button class="ficha-x" data-acao="fechar-scan" aria-label="Fechar"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="eq-scan">
          <div class="eq-scan-quadro">
            <video id="scanVideo" playsinline muted autoplay></video>
            <span class="eq-scan-mira" aria-hidden="true"></span>
          </div>
          <p class="eq-scan-nota" id="scanNota" role="status">Aponte para o QR da etiqueta.</p>
          <button type="button" class="btn eq-scan-retry" id="scanRetry"
            data-acao="escanear" hidden>Tentar de novo</button>
        </div>
      </div>
    </dialog>`);
  const d = document.getElementById("fundo");
  d.showModal();
  d.addEventListener("cancel", (e) => { e.preventDefault(); fecharFundo(); });
  document.body.classList.add("com-ficha");

  const video = document.getElementById("scanVideo");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    _semCamera("A câmera só abre em endereço seguro (https)." + SAIDA);
    return;
  }
  // ⚠️ `BarcodeDetector` é nativo do Chrome (Android inclusive) e NÃO existe
  // no Safari nem no Firefox. Sem ele a câmera até abriria, e ficaria um vídeo
  // bonito que nunca reconhece nada — pior que não abrir. Ali o caminho é o
  // app de câmera do próprio celular, que já lê o QR e abre a ficha sozinho.
  const temDetector = "BarcodeDetector" in window;

  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    });
  } catch (e) {
    _semCamera(_erroCamera(e));
    return;
  }
  // Fechou o diálogo enquanto a permissão estava na tela: a câmera abriu para
  // ninguém, e sem isto ela ficaria ligada.
  if (!document.getElementById("fundo")) { pararCamera(); return; }
  video.srcObject = _stream;
  try { await video.play(); } catch { /* alguns navegadores só tocam no gesto */ }

  if (!temDetector) {
    // ⚠️ AQUI A CÂMERA JÁ ESTÁ ABERTA e o vídeo aparece — mas nada nele será
    // reconhecido nunca. Deixar a imagem rodando seria a pior versão do erro:
    // a tela parece funcionar. O quadro sai junto com a explicação.
    pararCamera();
    _semCamera("Este navegador não lê QR." + SAIDA);
    return;
  }

  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  _lendo = true;
  // ⚠️ `setTimeout`, NÃO `requestAnimationFrame` — e a diferença é de
  // funcionamento, não de gosto. O rAF é o laço padrão para isto, mas ele NÃO
  // DISPARA em aba de segundo plano nem em janela sem foco: medido aqui, o
  // vídeo tocando, `_lendo` verdadeiro e ZERO chamadas ao detector. Numa tela
  // que existe para ler um QR, um laço que pode nunca rodar é um retângulo
  // preto que o técnico fica encarando sem entender.
  // 150ms é folgado para QR (o rAF daria ~16) e poupa bateria em aparelho no
  // meio da casa de máquinas.
  const tique = async () => {
    if (!_lendo || !document.getElementById("fundo")) return;
    try {
      const achados = await detector.detect(video);
      for (const a of achados) {
        const cod = codigoDe(a.rawValue);
        if (cod) {
          _lendo = false;
          _dizer("Etiqueta " + cod + " — abrindo…");
          pararCamera();
          window.location.href = "/e/" + encodeURIComponent(cod);
          return;
        }
      }
      // QR que não é de etiqueta: diz o que houve em vez de ficar mudo.
      if (achados.length) _dizer("Este QR não é de uma etiqueta da General.");
    } catch { /* quadro perdido não é erro: o próximo vem em 150ms */ }
    if (_lendo) setTimeout(tique, 150);
  };
  setTimeout(tique, 150);
}

/* ── As ações ────────────────────────────────────────────────────────── */
document.addEventListener("input", (e) => {
  if (e.target.id !== "eqBusca") return;
  BUSCA = e.target.value;
  _pintarLista();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("fundo")) fecharFundo();
});

// A câmera não pode sobreviver à saída da página — nem por "voltar".
addEventListener("pagehide", pararCamera);

document.addEventListener("click", (e) => {
  if (e.target.closest("#btnSair")) return logout();
  if (e.target.closest('[data-acao="escanear"]')) return abrirLeitor();
  if (e.target.closest('[data-acao="fechar-scan"]')) return fecharFundo();
  // Clique no fundo: o alvo é o próprio <dialog>, nunca a ficha dentro dele.
  if (e.target.id === "fundo") return fecharFundo();
  const chip = e.target.closest("[data-filtro]");
  if (!chip) return;
  FILTRO = chip.dataset.filtro;
  for (const b of document.querySelectorAll("[data-filtro]")) {
    b.setAttribute("aria-pressed", b.dataset.filtro === FILTRO ? "true" : "false");
  }
  _pintarLista();
});

/* ── Sair ────────────────────────────────────────────────────────────── */
// ⚠️ `userRole` VAI JUNTO — deixado para trás, o próximo a entrar neste
// aparelho começa com a role de quem saiu. Mesma regra das telas irmãs.
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userRole");
  window.location.href = "/login";
}

/* A barra endurece ao rolar — a classe `is-rolada` mora no JS de cada tela
   desta folha, nunca na própria folha. E o estado inicial também: quem dá F5
   no meio da lista volta com a página rolada e um `scroll` que não aconteceu. */
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
