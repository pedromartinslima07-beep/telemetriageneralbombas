/* ═══════════════════════════════════════════════════════════════════════
   ORÇAMENTOS DO CLIENTE — /cliente/orcamentos
   ───────────────────────────────────────────────────────────────────────
   Antes o orçamento chegava por e-mail com o PDF anexado e a resposta
   voltava por telefone ou WhatsApp. Quem registrava o "aprovado" era alguém
   do escritório, no admin — não havia registro de que o síndico, ele mesmo,
   tinha dito sim. Esta tela é esse registro.

   ⚠️ PÁGINA, NÃO FICHA. A v1 vivia em modais abertos por um card no meio do
   painel e foi recusada. Aqui lista e detalhe são dois estados da MESMA
   página, trocados por `history.pushState` — o voltar do navegador e o
   gesto de voltar do celular funcionam, que é o que a pessoa faz.

   ⚠️ SÓ CONDOMÍNIO. Orçamento avulso de pessoa física não passa por aqui:
   quem não tem condomínio não tem login. Ver migration 074.

   Endpoints (src/routes/cliente.routes.js):
     GET  /cliente/orcamentos            · lista, escopada pelo condominio_id
   (a PÁGINA é /cliente/painel/orcamentos — ver o porquê em src/app.js)
     GET  /cliente/orcamentos/:id        · o documento + linhas
     POST /cliente/orcamentos/:id/responder
     GET  /cliente/orcamentos/:id/pdf
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Sessão ─────────────────────────────────────────────────────────────
   Mesmas chaves do painel: é a mesma sessão, não um login à parte. */
function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}
// ⚠️ O `next` não é conveniência: este é o destino de um link de e-mail, e
// quem clica quase nunca tem sessão aberta no celular. Sem isso ele entra e
// cai no painel, tendo que caçar o orçamento que o e-mail já apontava.
// O login só aceita `next` que estejam na allowlist dele — ver login.js.
function _paraLogin() {
  window.location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
}
if (!getToken()) _paraLogin();

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const ROTULO = {
  enviado:   "Aguardando você",
  aprovado:  "Aprovado",
  rejeitado: "Recusado",
};

// Mesmos rótulos do admin (tipoLabels em admin.js) — o síndico e o escritório
// precisam chamar a mesma coisa pelo mesmo nome ao telefone.
const TIPO = {
  pecas: "Peças e serviço",
  limpeza_reservatorio: "Limpeza de reservatório",
  dedetizacao: "Dedetização",
  limpeza_dedetizacao: "Limpeza e dedetização",
};

const moeda = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data  = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

const elLista    = document.getElementById("orcsLista");
const elDetalhe  = document.getElementById("orcDetalhe");
const elTitulo   = document.getElementById("orcsTitulo");
const elApoio    = document.getElementById("orcsApoio");
const elPredio   = document.getElementById("nomePredio");

let ORCS = [];
let PREDIO = "";

/* ── Lista ─────────────────────────────────────────────────────────────── */

async function carregar() {
  try {
    const r = await fetch("/cliente/orcamentos", { headers: authHeaders() });
    if (r.status === 401) { _paraLogin(); return; }
    if (!r.ok) throw new Error();
    const j = await r.json();
    ORCS = j.orcamentos || [];
    PREDIO = j.condominio || "";
  } catch (_) {
    elApoio.textContent = "Não conseguimos carregar seus orçamentos agora. Recarregue a página em instantes.";
    return;
  }
  pintarAbertura();
  pintarLista();
}

/* O título diz o que a tela quer da pessoa. Com pendência ele pergunta; sem
   pendência ele só nomeia o lugar — inventar urgência onde não há gasta o
   único amarelo da tela. */
function pintarAbertura() {
  const pend = ORCS.filter(o => o.status === "enviado").length;
  if (pend === 1) {
    elTitulo.innerHTML = "Um orçamento <em>aguarda</em> sua resposta";
    elApoio.textContent = "Leia, veja os itens e responda por aqui. Se aprovar, a General agenda o serviço.";
  } else if (pend > 1) {
    elTitulo.innerHTML = `${pend} orçamentos <em>aguardam</em> sua resposta`;
    elApoio.textContent = "Leia, veja os itens e responda por aqui. Se aprovar, a General agenda o serviço.";
  } else {
    elTitulo.textContent = "Orçamentos";
    elApoio.textContent = ORCS.length
      ? "Nenhum aguardando resposta. Abaixo está o histórico do que já foi enviado ao seu prédio."
      : "Tudo o que a General orçar para o seu prédio aparece aqui.";
  }

  elPredio.textContent = PREDIO || "Meu prédio";
}

function pintarLista() {
  if (!ORCS.length) {
    elLista.innerHTML = `
      <div class="orcs-vazio">
        <h2>Nenhum orçamento por aqui</h2>
        <p>Quando um serviço precisar de orçamento, a General envia por e-mail
           e ele aparece nesta tela para você aprovar ou recusar.</p>
      </div>`;
    return;
  }

  elLista.innerHTML = ORCS.map(o => `
    <button class="orc-item${o.status === "enviado" ? " is-pendente" : ""}" type="button" data-orc="${o.id}">
      <span class="orc-item-topo">
        <span class="orc-item-num">${esc(o.numero || "Orçamento")}</span>
        <span class="orc-selo orc-selo-${esc(o.status)}">${ROTULO[o.status] || esc(o.status)}</span>
      </span>
      <span class="orc-item-valor">${moeda(o.valor_total)}</span>
      <span class="orc-item-sub">${o.itens} ${o.itens === 1 ? "item" : "itens"}${o.enviado_em ? ` · enviado em ${data(o.enviado_em)}` : ""}</span>
    </button>`).join("");
}

/* ── Detalhe ───────────────────────────────────────────────────────────── */

function mostrarLista() {
  elDetalhe.hidden = true;
  elDetalhe.innerHTML = "";
  elLista.hidden = false;
  document.querySelector(".orcs-abre").hidden = false;
  window.scrollTo({ top: 0 });
}

async function abrir(id) {
  elLista.hidden = true;
  document.querySelector(".orcs-abre").hidden = true;
  elDetalhe.hidden = false;
  elDetalhe.innerHTML = `<p class="nota">Carregando…</p>`;
  window.scrollTo({ top: 0 });

  let o;
  try {
    const r = await fetch(`/cliente/orcamentos/${id}`, { headers: authHeaders() });
    o = await r.json();
    if (!r.ok) throw new Error(o.error || "Não foi possível abrir este orçamento.");
  } catch (e) {
    elDetalhe.innerHTML = `${voltarHtml()}<div class="orc-doc"><p>${esc(e.message)}</p></div>`;
    return;
  }

  const linhas = (o.linhas || []).map(l => `
    <tr>
      <td>${esc(l.descricao || "—")}</td>
      <td class="q">${esc(l.quantidade)}</td>
      <td class="v">${l.valor_unitario == null ? "—" : moeda(l.valor_unitario)}</td>
    </tr>`).join("");

  // A resposta só existe enquanto está pendente. Depois de respondido, o que
  // aparece é o registro do que foi decidido — sem botão para "mudar de
  // ideia", porque mudar de ideia é conversa com a General, não um clique.
  const podeResponder = o.status === "enviado";

  const jaRespondido = podeResponder ? "" : `
    <div class="bloco orc-resposta-dada">
      <h4>${o.status === "aprovado" ? "Você aprovou este orçamento" : "Você recusou este orçamento"}</h4>
      <p>${o.respondido_em ? `Registrado em ${data(o.respondido_em)}.` : ""} ${
        o.status === "aprovado"
          ? "A General entra em contato para agendar o serviço."
          : "A General pode revisar e enviar um novo orçamento."}</p>
      ${o.cliente_comentario ? `<blockquote>${esc(o.cliente_comentario)}</blockquote>` : ""}
    </div>`;

  const formulario = !podeResponder ? "" : `
    <div class="bloco orc-responder">
      <h4>Sua resposta</h4>
      <p>Se aprovar, a General agenda o serviço. Se recusar, diga o motivo — dá para revisar e enviar outro.</p>
      <label class="campo">
        <span>Comentário <small>(obrigatório para recusar)</small></span>
        <textarea id="orcComentario" rows="3" maxlength="2000" placeholder="Ex.: pode fazer, mas só depois do dia 10."></textarea>
      </label>
      <div class="acoes">
        <button class="orc-btn orc-btn-sim" type="button" data-responder="aprovar" data-orc="${o.id}">Aprovar orçamento</button>
        <button class="orc-btn orc-btn-nao" type="button" data-responder="recusar" data-orc="${o.id}">Recusar</button>
      </div>
      <p class="orc-msg" id="orcMsg" role="status"></p>
    </div>`;

  elDetalhe.innerHTML = `
    ${voltarHtml()}
    <article class="orc-doc">
      <header class="orc-doc-topo">
        <div>
          <span class="orc-item-num">${esc(o.numero || "Orçamento")}</span>
          <h2>${esc(TIPO[o.tipo] || "Orçamento de serviço")}</h2>
        </div>
        <span class="orc-selo orc-selo-${esc(o.status)}">${ROTULO[o.status] || esc(o.status)}</span>
      </header>

      <div class="orc-total">
        <span class="orc-total-rot">Total do orçamento</span>
        <span class="orc-total-val">${moeda(o.valor_total)}</span>
        ${o.valido_ate ? `<span class="orc-total-sub">Válido até ${data(o.valido_ate)}</span>` : ""}
      </div>

      ${o.constatacao ? `<div class="bloco"><h4>O que foi constatado</h4><p>${esc(o.constatacao)}</p></div>` : ""}

      ${linhas ? `
        <div class="bloco">
          <h4>Itens</h4>
          <table class="orc-tabela">
            <thead><tr><th>Descrição</th><th class="q">Qtd</th><th class="v">Valor</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>` : ""}

      <div class="bloco">
        <h4>Condições</h4>
        <p>${esc(o.forma_pagamento || "—")} · ${esc(o.prazo_entrega || "—")}${o.garantia ? ` · garantia de ${esc(o.garantia)}` : ""}</p>
        <a class="orc-pdf" href="/cliente/orcamentos/${o.id}/pdf" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" stroke-linecap="square" aria-hidden="true"><path d="M14 3H7v18h11V7l-4-4z"/><path d="M14 3v4h4"/></svg>
          Abrir o PDF
        </a>
      </div>

      ${jaRespondido}
      ${formulario}
    </article>`;
}

function voltarHtml() {
  return `
    <button class="orc-voltar" type="button" data-voltar>
      <svg viewBox="0 0 24 24" stroke-linecap="square" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      Todos os orçamentos
    </button>`;
}

/* ── Responder ─────────────────────────────────────────────────────────── */

async function responder(id, decisao) {
  const msg = document.getElementById("orcMsg");
  const campo = document.getElementById("orcComentario");
  const comentario = (campo?.value || "").trim();

  if (decisao === "recusar" && !comentario) {
    msg.className = "orc-msg is-erro";
    msg.textContent = "Escreva o motivo da recusa para a gente poder revisar.";
    campo?.focus();
    return;
  }

  const botoes = elDetalhe.querySelectorAll("[data-responder]");
  botoes.forEach(b => { b.disabled = true; });
  msg.className = "orc-msg";
  msg.textContent = "Registrando sua resposta…";

  try {
    const r = await fetch(`/cliente/orcamentos/${id}/responder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ decisao, comentario }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      msg.className = "orc-msg is-erro";
      msg.textContent = j.error || "Não foi possível registrar sua resposta.";
      botoes.forEach(b => { b.disabled = false; });
      return;
    }
    await carregar();       // o selo da lista e o título acompanham
    await abrir(id);        // e o documento se repinta no estado "respondido"
  } catch (_) {
    msg.className = "orc-msg is-erro";
    msg.textContent = "Erro de conexão. Tente de novo.";
    botoes.forEach(b => { b.disabled = false; });
  }
}

/* ── Navegação ──────────────────────────────────────────────────────────
   O detalhe é um estado da URL (`?orc=12`), não um modal. Assim o voltar do
   navegador sai do documento em vez de sair do sistema, e um orçamento pode
   ser reaberto pelo mesmo link. */

function idDaUrl() {
  const v = new URLSearchParams(location.search).get("orc");
  return v ? Number(v) : null;
}

function sincronizar() {
  const id = idDaUrl();
  if (id) abrir(id); else mostrarLista();
}

document.addEventListener("click", ev => {
  const item = ev.target.closest("[data-orc]:not([data-responder])");
  if (item && !ev.target.closest("[data-responder]")) {
    const id = Number(item.dataset.orc);
    history.pushState({ orc: id }, "", `/cliente/painel/orcamentos?orc=${id}`);
    abrir(id);
    return;
  }

  if (ev.target.closest("[data-voltar]")) {
    history.pushState({}, "", "/cliente/painel/orcamentos");
    mostrarLista();
    return;
  }

  const resp = ev.target.closest("[data-responder]");
  if (resp) responder(Number(resp.dataset.orc), resp.dataset.responder);
});

window.addEventListener("popstate", sincronizar);

/* a barra ganha o fio quando a página rola — igual à do painel e à da landing */
const barra = document.getElementById("barra");
addEventListener("scroll", () => {
  barra.classList.toggle("is-rolada", scrollY > 8);
}, { passive: true });

document.getElementById("rodapeAno").textContent = new Date().getFullYear();

carregar().then(sincronizar);
