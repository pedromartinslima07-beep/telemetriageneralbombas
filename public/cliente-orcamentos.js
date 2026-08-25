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
/* ── A entrada ──────────────────────────────────────────────────────────
   ⚠️ NÃO REDIRECIONA PARA /login. Até 25/08/2026 esta página mandava quem
   chegasse sem sessão para `/login?next=…`. Funcionava, mas trocava o
   documento que a pessoa veio ver por um formulário em outra página — e o
   link do e-mail é justamente de quem quase nunca tem sessão aberta. Agora
   o login acontece POR CIMA da própria página: a URL com `?orc=N` continua
   na barra, e fechar o cartão já é estar no documento.

   ⚠️ SEM SENHA (25/08/2026). O síndico não tem senha: quem cria o acesso é o
   escritório, no admin, com o e-mail dele. Daqui em diante o e-mail é a
   credencial — POST /auth/codigo manda os 6 dígitos e POST /auth/verify-otp
   (o mesmo do login com senha) troca o código pelo JWT. O aparelho confiável
   viaja em cookie de mesma origem: no aparelho lembrado, o /auth/codigo já
   devolve a sessão e o cartão nem chega a pedir o código. */

let _entradaAberta = false;
let _otpToken = null;

function _el(id) { return document.getElementById(id); }

// ⚠️ O `<form>` da entrada tem `novalidate`, e isso desliga a validação nativa
// do navegador — o `type="email"` do campo passa a ser só o teclado do celular,
// não uma regra. Sem esta checagem, qualquer palavra vira "e-mail": o
// `/auth/codigo` responde neutro por design (é o que impede a tela de virar um
// verificador de quem tem conta) e a tela anunciava, confiante, "Enviamos um
// código de 6 dígitos para comer".
//
// Mesmo padrão do `/auth/registrar` no backend. Não é validação de verdade —
// e-mail só se valida entregando — mas separa "isto é um endereço" de "isto é
// uma palavra".
const _RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function _entradaMsg(texto, ehErro) {
  const msg = _el("entradaMsg");
  if (!msg) return;
  msg.className = ehErro ? "orc-msg is-erro" : "orc-msg";
  msg.textContent = texto || "";
}

function _entradaPasso(qual) {
  _el("entradaForm").hidden    = qual !== "email";
  _el("entradaOtpForm").hidden = qual !== "codigo";
}

// `motivo` só é preenchido quando a sessão MORREU no meio do caminho: quem
// chega direto do e-mail não fez nada errado e não deve levar aviso.
function pedirEntrada(motivo) {
  const fundo = _el("entradaFundo");
  if (!fundo) return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  if (!_entradaAberta) {
    _entradaAberta = true;
    fundo.hidden = false;
    document.body.classList.add("com-ficha");
    // Atrás do véu, "Carregando…" ficaria para sempre — e é o texto que
    // aparece se a pessoa fechar o teclado e olhar a página por baixo.
    if (elApoio) elApoio.textContent = "Entre para ver o orçamento do seu prédio.";
    setTimeout(() => _el("entradaEmail")?.focus(), 60);
  }
  _entradaPasso("email");
  _otpToken = null;
  _entradaMsg(motivo || "", Boolean(motivo));
}

function _fecharEntrada() {
  _entradaAberta = false;
  _el("entradaFundo").hidden = true;
  document.body.classList.remove("com-ficha");
  _entradaMsg("");
}

// Só o síndico tem o que ver aqui. Uma conta do escritório passa no login e
// tomaria 403 no primeiro fetch — dizer isso no cartão é melhor que deixar a
// tela vazia com "não conseguimos carregar".
async function _concluirEntrada(data) {
  const user = data.user || {};
  if (user.role !== "cliente") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    _entradaMsg("Esta conta é do painel interno da General, não do seu prédio. Entre com o acesso do condomínio.", true);
    _entradaPasso("email");
    return;
  }
  if (!user.condominio_id) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    _entradaMsg("Seu usuário ainda não está vinculado a um prédio. Fale com a gente que liberamos.", true);
    _entradaPasso("email");
    return;
  }
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  _fecharEntrada();
  await carregar();
  sincronizar();
}

function _bindEntrada() {
  const form    = _el("entradaForm");
  const otpForm = _el("entradaOtpForm");
  if (!form || !otpForm) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = _el("entradaEmail").value.trim();
    const btn   = _el("entradaBtn");
    if (!email) { _entradaMsg("Digite o seu e-mail.", true); return; }
    // Diz o que está errado com o que a PESSOA escreveu, sem falar de conta
    // nenhuma — a resposta continua neutra quanto a existir ou não cadastro.
    if (!_RE_EMAIL.test(email)) {
      _entradaMsg("Isso não parece um e-mail. Confira e tente de novo.", true);
      _el("entradaEmail").focus();
      return;
    }

    btn.disabled = true;
    _entradaMsg("Enviando o código…");
    try {
      const r = await fetch("/auth/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { _entradaMsg(data.error || "Não consegui enviar o código.", true); return; }

      // Aparelho já lembrado: o servidor devolve a sessão direto.
      if (data.token) { await _concluirEntrada(data); return; }

      if (data.pending) {
        _otpToken = data.otp_token;
        _entradaPasso("codigo");
        // ⚠️ A resposta é neutra: e-mail não cadastrado recebe o mesmo
        // "enviamos". Dizer "esse e-mail não existe" transformaria a tela num
        // verificador de quem é cliente da casa. Quem errou o e-mail descobre
        // no passo seguinte, e a linha do WhatsApp está logo abaixo.
        const intro = _el("entradaOtpIntro");
        if (intro) intro.textContent = `Enviamos um código de 6 dígitos para ${email}.`;
        _entradaMsg("");
        const campo = _el("entradaOtpCode");
        campo.value = "";
        setTimeout(() => campo.focus(), 60);
        return;
      }
      _entradaMsg("Não consegui entrar. Tente de novo.", true);
    } catch (_) {
      _entradaMsg("Erro de conexão. Verifique a internet e tente de novo.", true);
    } finally {
      btn.disabled = false;
    }
  });

  otpForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = _el("entradaOtpCode").value.trim();
    const btn  = _el("entradaOtpBtn");
    if (code.length !== 6) { _entradaMsg("Digite os 6 dígitos do código.", true); return; }
    btn.disabled = true;
    _entradaMsg("Conferindo o código…");
    try {
      const r = await fetch("/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp_token: _otpToken, code, confiar: _el("entradaOtpConfiar").checked }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { _entradaMsg(data.error || "Código inválido.", true); return; }
      await _concluirEntrada(data);
    } catch (_) {
      _entradaMsg("Erro de conexão. Verifique a internet e tente de novo.", true);
    } finally {
      btn.disabled = false;
    }
  });

  // Voltar serve para corrigir o e-mail digitado errado — que é o motivo nº 1
  // de o código "não chegar".
  _el("entradaOtpVoltar").addEventListener("click", () => {
    _otpToken = null;
    _entradaPasso("email");
    _entradaMsg("");
    setTimeout(() => _el("entradaEmail").focus(), 60);
  });
}

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
    if (r.status === 401) { pedirEntrada("Sua sessão expirou. Entre de novo para ver o orçamento."); return; }
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
    elApoio.textContent = "Leia, veja os itens e responda por aqui. Se aprovar, agendamos o serviço.";
  } else if (pend > 1) {
    elTitulo.innerHTML = `${pend} orçamentos <em>aguardam</em> sua resposta`;
    elApoio.textContent = "Leia, veja os itens e responda por aqui. Se aprovar, agendamos o serviço.";
  } else {
    elTitulo.textContent = "Orçamentos";
    elApoio.textContent = ORCS.length
      ? "Nenhum aguardando resposta. Abaixo está o histórico do que já foi enviado ao seu prédio."
      : "Todo orçamento que fizermos para o seu prédio aparece aqui.";
  }

  elPredio.textContent = PREDIO || "Meu prédio";
}

function pintarLista() {
  if (!ORCS.length) {
    elLista.innerHTML = `
      <div class="orcs-vazio">
        <h2>Nenhum orçamento por aqui</h2>
        <p>Quando um serviço precisar de orçamento, mandamos por e-mail
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

/* Quantidade vem do banco como NUMERIC e chega "1.00". Item de orçamento é
   contado em peça inteira quase sempre; mostrar "1,00" faz o documento
   parecer nota fiscal de indústria. Só mostra decimal quando existe um. */
const qtd = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v == null ? "—" : v);
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

/* Uma célula rotulada da faixa de metadados. Devolve "" quando não há valor:
   célula vazia com rótulo é pior que célula ausente — ela promete um dado que
   o documento não tem e faz a pessoa procurar o que não existe. */
const celula = (rotulo, valor) =>
  valor ? `<div><dt>${esc(rotulo)}</dt><dd>${valor}</dd></div>` : "";

async function abrir(id) {
  elLista.hidden = true;
  document.querySelector(".orcs-abre").hidden = true;
  elDetalhe.hidden = false;
  elDetalhe.innerHTML = `<p class="nota">Carregando…</p>`;
  window.scrollTo({ top: 0 });

  let o;
  try {
    const r = await fetch(`/cliente/orcamentos/${id}`, { headers: authHeaders() });
    if (r.status === 401) { pedirEntrada("Sua sessão expirou. Entre de novo para ver o orçamento."); return; }
    o = await r.json();
    if (!r.ok) throw new Error(o.error || "Não foi possível abrir este orçamento.");
  } catch (e) {
    elDetalhe.innerHTML = `${voltarHtml()}<div class="orc-doc"><p>${esc(e.message)}</p></div>`;
    return;
  }

  /* ── Itens ──────────────────────────────────────────────────────────────
     Quatro colunas, não três: sem o total por linha a pessoa precisa
     multiplicar de cabeça para conferir a soma — que é exatamente o que ela
     está tentando fazer ao abrir um orçamento.

     A ficha técnica entra debaixo da descrição quando existe. É o texto que
     vira cláusula no PDF (ver orcamento_linhas.tipo_servico): quem lê na tela
     merece a mesma especificação de quem lê no documento. */
  const linhas = o.linhas || [];

  // ⚠️ ITEM SEM PREÇO É CASO LEGÍTIMO, não dado faltando: a migration 062
  // tornou `valor_unitario` nullable justamente para que item sem valor
  // lançado ficasse NULL de verdade em vez de zero. Quando NENHUM item tem
  // preço, o orçamento é fechado no total e a lista é só descritiva.
  //
  // Nesse caso as duas colunas de dinheiro SOMEM, em vez de virarem uma
  // coluna inteira de travessões — é o mesmo que o orcamento-pdf.service já
  // faz no documento, e a tela não deveria discordar do PDF que ela oferece
  // logo abaixo.
  const comPreco = linhas.filter(l => l.valor_unitario != null).length;
  const temValor = comPreco > 0;
  const somaParcial = temValor && comPreco < linhas.length;

  let soma = 0;
  const corpoItens = linhas.map(l => {
    const unit = l.valor_unitario == null ? null : Number(l.valor_unitario);
    const tot  = unit == null ? null : unit * Number(l.quantidade || 0);
    if (tot != null) soma += tot;
    return `
    <tr>
      <td data-rot="Descrição">
        ${esc(l.descricao || "—")}
        ${l.ficha_tecnica ? `<small>${esc(l.ficha_tecnica)}</small>` : ""}
      </td>
      <td class="n" data-rot="Qtd">${qtd(l.quantidade)}</td>
      ${temValor ? `
      <td class="n" data-rot="Valor unitário">${unit == null ? "—" : moeda(unit)}</td>
      <td class="n" data-rot="Total">${tot == null ? "—" : moeda(tot)}</td>` : ""}
    </tr>`;
  }).join("");

  // A divergência entre a soma e o total só é afirmável quando a soma cobre
  // TODOS os itens. Com soma parcial ela é esperada, e apontá-la seria alarme
  // falso num documento que a pessoa está decidindo se aprova.
  const divergem = temValor && !somaParcial
    && Math.abs(soma - Number(o.valor_total || 0)) > 0.005;

  const rotSoma = somaParcial ? "Soma dos itens com valor" : "Soma dos itens";

  const secItens = !linhas.length ? "" : `
    <section class="orc-sec">
      <h3>Itens</h3>
      <p class="orc-sec-apoio">${linhas.length} ${linhas.length === 1 ? "item" : "itens"} neste orçamento.${
        temValor ? "" : " O valor é fechado no total, sem preço por item."}</p>
      <table class="orc-tabela">
        <thead><tr>
          <th>Descrição</th><th class="n">Qtd</th>
          ${temValor ? `<th class="n">Valor unitário</th><th class="n">Total</th>` : ""}
        </tr></thead>
        <tbody>${corpoItens}</tbody>
        ${temValor ? `
        <tfoot><tr>
          <td colspan="3">${rotSoma}</td>
          <td class="n" data-rot="${rotSoma}">${moeda(soma)}</td>
        </tr></tfoot>` : ""}
      </table>
      ${divergem ? `<p class="orc-nota">O valor fechado deste orçamento é ${moeda(o.valor_total)}, no topo da página — é ele que vale.</p>` : ""}
    </section>`;
  /* ── Condições ──────────────────────────────────────────────────────────
     Eram uma frase corrida com "·" separando três coisas diferentes, e um
     travessão no lugar do que faltava. Agora cada uma é um dado com nome, e o
     que não existe simplesmente não aparece. */
  const cond = [
    celula("Forma de pagamento", esc(o.forma_pagamento)),
    celula("Prazo de execução", esc(o.prazo_entrega)),
    celula("Garantia", esc(o.garantia)),
  ].join("");

  const secCond = !cond ? "" : `
    <section class="orc-sec">
      <h3>Condições</h3>
      <dl class="orc-meta">${cond}</dl>
    </section>`;

  /* ── A resposta ─────────────────────────────────────────────────────────
     Só existe enquanto está pendente. Depois de respondido o que aparece é o
     registro do que foi decidido — sem botão para "mudar de ideia", porque
     mudar de ideia é conversa com a gente, não um clique. */
  const podeResponder = o.status === "enviado";
  const comentario = o.cliente_comentario || (o.status === "rejeitado" ? o.motivo_rejeicao : "");

  const jaRespondido = podeResponder ? "" : `
    <section class="orc-sec orc-resposta-dada">
      <h3>${o.status === "aprovado" ? "Você aprovou este orçamento" : "Você recusou este orçamento"}</h3>
      <p class="orc-sec-apoio">${o.respondido_em ? `Registrado em ${data(o.respondido_em)}. ` : ""}${
        o.status === "aprovado"
          ? "Entramos em contato para agendar o serviço."
          : "Podemos revisar e enviar um novo orçamento."}</p>
      ${comentario ? `<blockquote>${esc(comentario)}</blockquote>` : ""}
    </section>`;

  const formulario = !podeResponder ? "" : `
    <section class="orc-sec orc-responder">
      <h3>Sua resposta</h3>
      <p class="orc-sec-apoio">Se aprovar, agendamos o serviço. Se recusar, diga o motivo — dá para revisar e enviar outro.</p>
      <!-- ⚠️ QUEM ASSUMIU A DECISÃO, e não qual conta clicou (25/08/2026).
           A conta é do CONDOMÍNIO: quem responde pode ser o síndico, o
           subsíndico ou quem estiver com o e-mail aberto naquele dia. O
           escritório precisa saber quem autorizou o serviço — e o síndico
           precisa que fique registrado que foi ele, não "o condomínio".
           Vale para a recusa também: saber quem recusou vale tanto quanto. -->
      <label class="campo">
        <span>Seu nome</span>
        <input type="text" id="orcNome" maxlength="120" autocomplete="name" />
      </label>
      <label class="campo">
        <span>Seu cargo</span>
        <!-- Lista, não texto livre: no celular é um toque em vez de digitação,
             e o dado agrupa depois em vez de virar dez grafias da mesma coisa.
             "Outro" abre o campo abaixo — a lista fechada sem escape excluiria
             quem não se encaixa. -->
        <select id="orcCargo">
          <option value="">Selecione…</option>
          ${CARGOS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          <option value="__outro">Outro…</option>
        </select>
      </label>
      <label class="campo" id="orcCargoOutroCampo" hidden>
        <span>Qual?</span>
        <input type="text" id="orcCargoOutro" maxlength="60" />
      </label>
      <label class="campo">
        <span>Comentário <small>(obrigatório para recusar)</small></span>
        <textarea id="orcComentario" rows="3" maxlength="2000"></textarea>
      </label>
      <div class="acoes">
        <button class="orc-btn orc-btn-sim" type="button" data-responder="aprovar" data-orc="${o.id}">Aprovar orçamento</button>
        <button class="orc-btn orc-btn-nao" type="button" data-responder="recusar" data-orc="${o.id}">Recusar</button>
      </div>
      <p class="orc-msg" id="orcMsg" role="status"></p>
    </section>`;

  elDetalhe.innerHTML = `
    ${voltarHtml()}
    <article class="orc-doc">

      <header class="orc-cab">
        <div>
          <h2>Orçamento ${esc(o.numero || id)}</h2>
          <p class="orc-cab-tipo">${esc(TIPO[o.tipo] || "Serviço")}</p>
        </div>
        <span class="orc-selo orc-selo-${esc(o.status)}">${ROTULO[o.status] || esc(o.status)}</span>
      </header>

      <div class="orc-total">
        <span class="orc-total-rot">Total do orçamento</span>
        <span class="orc-total-val">${moeda(o.valor_total)}</span>
      </div>

      <!-- A faixa de metadados. Nenhum dado solto: tudo com nome em cima. As
           linhas entre as células são o gap da grade pintado de --fio-esc, e
           não borda por célula — assim continuam retas quando a grade quebra
           em duas fileiras no celular. -->
      <dl class="orc-meta orc-meta-topo">
        ${celula("Prédio", esc(PREDIO))}
        ${celula("Enviado em", data(o.enviado_em))}
        ${celula("Válido até", data(o.valido_ate))}
      </dl>

      <!-- ⚠️ DUAS COLUNAS A PARTIR DE 1000px, e o motivo é medido: em coluna
           única o documento vira uma tira de 780px numa tela de 1900, com
           metade do campo vazio à direita e tudo empilhado. A tela de
           referência (a NF-e do Omie) também não é coluna única — ela põe o
           que se LÊ de um lado e o que se FAZ do outro.

           A divisão segue esse critério, não o tamanho dos blocos:
           esquerda é leitura (o que foi constatado, os itens, a conta);
           direita é o que a pessoa precisa ter à mão para decidir
           (condições, o PDF, e a resposta). Por isso a direita acompanha a rolagem:
           num orçamento de 20 itens, a decisão não pode ficar a três telas
           de distância do que a justifica. -->
      <div class="orc-corpo">
        <div class="orc-col-ler">
          ${o.constatacao ? `
            <section class="orc-sec">
              <h3>O que foi constatado</h3>
              <p>${esc(o.constatacao)}</p>
            </section>` : ""}
          ${secItens}
        </div>

        <aside class="orc-col-agir">
          ${secCond}

          <!-- O painel de documentos. Antes o PDF era um botão solto no fim das
               "Condições", que não têm nada a ver com ele. Agrupar a ação num
               bloco com nome é o que a tela de referência faz de mais útil: quem
               procura o arquivo procura um lugar, não um botão. -->
          <section class="orc-sec">
            <h3>Documentos</h3>
            <!-- ⚠️ NÃO DIZER "o mesmo que foi anexado no e-mail" (era o texto
                 até 25/08/2026). Desde que o e-mail passou a levar o link em
                 vez do anexo, o PDF só existe aqui — a frase mandava a pessoa
                 procurar na caixa de entrada um arquivo que não foi. -->
            <p class="orc-sec-apoio">O orçamento completo, com timbrado, para guardar ou imprimir.</p>
            <button class="orc-doclinha" type="button" data-pdf="${o.id}">
              <svg viewBox="0 0 24 24" stroke-linecap="square" aria-hidden="true"><path d="M14 3H7v18h11V7l-4-4z"/><path d="M14 3v4h4"/></svg>
              <span>
                <strong>Baixar o PDF</strong>
                <small>Com o timbrado e as cláusulas completas</small>
              </span>
              <svg class="orc-doclinha-fim" viewBox="0 0 24 24" stroke-linecap="square" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>
            </button>
            <p class="orc-msg" id="orcPdfMsg" role="status"></p>
          </section>

          ${jaRespondido}
          ${formulario}
        </aside>
      </div>
    </article>`;
}
function voltarHtml() {
  return `
    <button class="orc-voltar" type="button" data-voltar>
      <svg viewBox="0 0 24 24" stroke-linecap="square" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      Todos os orçamentos
    </button>`;
}

/* ⚠️ A LISTA É FECHADA, com "Outro" como escape.
   Texto livre viraria "sindico", "Síndico", "SÍNDICO" e "sindico do bloco B" —
   quatro grafias da mesma coisa, e nenhum agrupamento possível depois. A ordem
   não é alfabética: é de frequência esperada, porque quem responde orçamento
   é quase sempre o síndico. */
const CARGOS = ["Síndico", "Subsíndico", "Conselheiro", "Zelador", "Administradora", "Gerente predial"];

/* ── Responder ─────────────────────────────────────────────────────────── */

function _erroResposta(msg, texto, foco) {
  msg.className = "orc-msg is-erro";
  msg.textContent = texto;
  foco?.focus();
}

async function responder(id, decisao) {
  const msg = document.getElementById("orcMsg");
  const campo = document.getElementById("orcComentario");
  const comentario = (campo?.value || "").trim();

  const elNome  = document.getElementById("orcNome");
  const elCargo = document.getElementById("orcCargo");
  const elOutro = document.getElementById("orcCargoOutro");
  const nome = (elNome?.value || "").trim();
  const cargoBruto = elCargo?.value || "";
  const cargo = cargoBruto === "__outro" ? (elOutro?.value || "").trim() : cargoBruto;

  // O backend valida os três de novo — isto aqui é só para a pessoa não
  // perder o clique e descobrir o problema depois de uma ida ao servidor.
  if (!nome) {
    return _erroResposta(msg, "Diga o seu nome para registrarmos quem respondeu.", elNome);
  }
  if (!cargo) {
    return _erroResposta(msg, "Escolha o seu cargo no condomínio.",
      cargoBruto === "__outro" ? elOutro : elCargo);
  }
  if (decisao === "recusar" && !comentario) {
    return _erroResposta(msg, "Escreva o motivo da recusa para a gente poder revisar.", campo);
  }

  const botoes = elDetalhe.querySelectorAll("[data-responder]");
  botoes.forEach(b => { b.disabled = true; });
  msg.className = "orc-msg";
  msg.textContent = "Registrando sua resposta…";

  try {
    const r = await fetch(`/cliente/orcamentos/${id}/responder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ decisao, comentario, nome, cargo }),
    });
    // ⚠️ 401 aqui é o pior momento para trocar de página: a pessoa acabou de
    // decidir. O cartão reabre por cima, e a resposta é dada de novo com um
    // clique — sem perder o documento nem a URL.
    if (r.status === 401) {
      botoes.forEach(b => { b.disabled = false; });
      msg.className = "orc-msg";
      msg.textContent = "";
      pedirEntrada("Sua sessão expirou antes de registrar a resposta. Entre de novo e responda.");
      return;
    }
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

/* ── PDF ────────────────────────────────────────────────────────────────
   O orçamento completo em PDF — que desde 25/08/2026 NÃO vai mais anexado no
   e-mail: o e-mail leva o link para cá, e o documento é gerado sob demanda
   nesta tela. Vem por fetch porque a rota
   exige o Bearer; o blob é entregue como download, e não em aba nova, porque
   `window.open` depois de um `await` cai no bloqueador de pop-up do celular
   — que é justamente onde o link do e-mail costuma ser aberto. */

async function baixarPdf(id, btn) {
  const msg = document.getElementById("orcPdfMsg");
  const rotulo = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Gerando o PDF…";
  if (msg) { msg.className = "orc-msg"; msg.textContent = ""; }

  try {
    const r = await fetch(`/cliente/orcamentos/${id}/pdf`, { headers: authHeaders() });
    if (r.status === 401) { pedirEntrada("Sua sessão expirou. Entre de novo para ver o orçamento."); return; }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || "Não foi possível gerar o PDF.");
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const cd = r.headers.get("Content-Disposition") || "";
    a.download = (cd.match(/filename="?([^"]+)"?/) || [])[1] || `orcamento-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    if (msg) { msg.className = "orc-msg is-erro"; msg.textContent = e.message; }
  } finally {
    btn.disabled = false;
    btn.innerHTML = rotulo;
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

// "Outro…" abre o campo livre. Fica aqui, no listener global de change, e não
// num `onchange` inline: o formulário é remontado a cada `abrir(id)`, e
// listener preso ao elemento morreria junto com ele.
document.addEventListener("change", ev => {
  const sel = ev.target.closest("#orcCargo");
  if (!sel) return;
  const campo = document.getElementById("orcCargoOutroCampo");
  if (!campo) return;
  const ehOutro = sel.value === "__outro";
  campo.hidden = !ehOutro;
  if (ehOutro) document.getElementById("orcCargoOutro")?.focus();
});

document.addEventListener("click", ev => {
  const pdf = ev.target.closest("[data-pdf]");
  if (pdf) { baixarPdf(Number(pdf.dataset.pdf), pdf); return; }

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

_bindEntrada();
// Sem sessão, a página não tenta carregar nada: pedir e levar 401 de volta
// só serviria para piscar uma mensagem de erro atrás do cartão.
if (getToken()) carregar().then(sincronizar);
else pedirEntrada();
