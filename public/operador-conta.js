/* ════════════════════════════════════════════════════════════════════════
   operador-conta.js — A GAVETA DE CONTA DAS TRÊS TELAS DO OPERADOR
   ────────────────────────────────────────────────────────────────────────
   O nome de quem está logado abre "Trocar senha" e "Sair". O porquê do
   desenho (e a conta de largura de celular que o motivou) está no
   `operador.html`, onde a peça nasceu em 03/09/2026.

   ⚠️ POR QUE UM ARQUIVO COMPARTILHADO, se o `operador.js` dizia o contrário.
   O comentário do `dlgSenha` decidia assim: "são 20 linhas contra um arquivo
   compartilhado a mais **para uma tela só**". A premissa caiu no dia seguinte
   — a gaveta passou a ser das TRÊS telas, e triplicar significa que a próxima
   correção de senha conserta um terço do painel. Mesmo precedente do
   `condo-picker.js` e do `inatividade.js`, que já são compartilhados.

   ⚠️ O QUE ELE ESPERA DO FRONT HOSPEDEIRO: `abrirFundo(html)` e `fechar()`.
   As três folhas têm os dois com a mesma assinatura — foi o que a unificação
   do diálogo de Preventivas fechou. NÃO depende de `avisar`, cuja assinatura
   diverge entre as telas (`(texto, ok)` aqui, `(texto, acao)` em Aprovados):
   passar `true` onde a irmã espera um objeto renderiza `data-id="undefined"`
   e um botão quebrado. A faixa daqui é própria, logo abaixo.

   ⚠️ CARREGAR ANTES DO FRONT (os dois com `defer`, este primeiro). Scripts
   `defer` executam na ordem do documento, então os listeners daqui entram
   antes — e é isso que preserva a regra que o `operador.js` já registrava:
   "A GAVETA VEM ANTES DE TUDO". Clique DENTRO dela fecha a gaveta ANTES de a
   ação rodar, para o `abrirFundo` guardar o BOTÃO como foco de origem, e não
   uma linha de gaveta já escondida.

   ⚠️ NÃO É `<dialog>`. Gaveta ancorada: fecha no Esc, no clique fora e ao
   escolher. Modal para decidir entre dois itens interrompe um turno e prende
   o foco numa tela que fica aberta o dia inteiro.
   ════════════════════════════════════════════════════════════════════════ */

/* ── A gaveta ────────────────────────────────────────────────────────── */
function contaGaveta(abrir) {
  const b = document.getElementById("btnEu");
  const g = document.getElementById("euGaveta");
  if (!b || !g) return;
  const aberta = b.getAttribute("aria-expanded") === "true";
  const alvo = abrir === undefined ? !aberta : abrir;
  if (alvo === aberta) return;
  b.setAttribute("aria-expanded", alvo ? "true" : "false");
  g.hidden = !alvo;
  // Ao abrir por TECLADO o foco entra na primeira linha; ao abrir por clique
  // ele fica no botão. Quem clicou vai clicar de novo — mover o foco faria a
  // primeira linha acender sozinha e parecer já escolhida.
  if (!alvo) return;
  if (b.matches(":focus-visible")) g.querySelector(".eu-item")?.focus();
}

// Fecha e devolve o foco ao botão. Chamado antes de qualquer ação da gaveta.
function contaGavetaFecha(devolver) {
  const b = document.getElementById("btnEu");
  if (!b || b.getAttribute("aria-expanded") !== "true") return;
  contaGaveta(false);
  if (devolver) b.focus();
}

// Seta ↓/↑ percorre as linhas; Home/End vão às pontas. É o que `role="menu"`
// promete a quem navega por teclado.
function contaGavetaTeclas(e) {
  const g = document.getElementById("euGaveta");
  if (!g || g.hidden) return false;
  const itens = [...g.querySelectorAll(".eu-item")];
  const i = itens.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); itens[i < 0 ? 0 : (i + 1) % itens.length].focus(); return true; }
  if (e.key === "ArrowUp")   { e.preventDefault(); itens[i <= 0 ? itens.length - 1 : i - 1].focus(); return true; }
  if (e.key === "Home")      { e.preventDefault(); itens[0].focus(); return true; }
  if (e.key === "End")       { e.preventDefault(); itens[itens.length - 1].focus(); return true; }
  // Tab sai da gaveta: fechar sem devolver o foco deixa o Tab seguir seu
  // caminho natural, que é o que se espera de um menu.
  if (e.key === "Tab") { contaGaveta(false); return false; }
  return false;
}

/* ── Trocar a própria senha ──────────────────────────────────────────────
   Antes disto, operador com senha esquecida dependia de pedir ao admin um
   `reset-senha`, que gera uma senha temporária e a devolve em texto puro para
   alguém repassar. Trocar a própria senha é o caminho que não passa a senha
   por ninguém. */
function contaDlgSenha() {
  // O X da folha, desenhado aqui: o `I.x` do `operador.js` não existe nas
  // irmãs, e depender dele devolveria "undefined" no cabeçalho em duas telas.
  const x = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  abrirFundo(`<div class="ficha" style="width:min(480px,100%)" role="dialog" aria-label="Trocar minha senha">
    <div class="ficha-cab">
      <div><h2>Minha senha</h2>
        <div class="onde" style="margin-top:7px">Só você digita a nova — ninguém precisa repassá-la</div></div>
      <button class="ficha-x" data-acao="fechar" aria-label="Fechar">${x}</button>
    </div>
    <form class="form" id="formSenha">
      <div class="campo largo">
        <label for="sfAtual">Senha atual</label>
        <input id="sfAtual" type="password" autocomplete="current-password" required>
      </div>
      <div class="campo largo">
        <label for="sfNova">Senha nova</label>
        <input id="sfNova" type="password" autocomplete="new-password" minlength="6" required>
      </div>
      <div class="campo largo">
        <label for="sfConf">Repita a senha nova</label>
        <input id="sfConf" type="password" autocomplete="new-password" minlength="6" required>
      </div>
      <!-- A regra que o backend aplica, dita ANTES de o campo recusar: o
           mínimo é 6, e a nova precisa ser diferente da atual. (Sem crase
           neste comentario: ele vive dentro de template literal.) -->
      <p class="dica">Mínimo de <b>6 caracteres</b>, e diferente da senha atual.
        Depois de trocar, a sessão aberta continua valendo — quem pede senha de
        novo é o próximo login.</p>
    </form>
    <div class="ficha-pe">
      <p id="sfMsg"></p>
      <button class="btn btn-fio" data-acao="fechar">Cancelar</button>
      <button class="btn" data-acao="salvar-senha">Trocar senha</button>
    </div>
  </div>`);

  // Enter no formulário salva, como no Novo chamado.
  document.getElementById("formSenha")?.addEventListener("submit", (e) => {
    e.preventDefault();
    contaSalvarSenha();
  });
  document.getElementById("sfAtual")?.focus();
}

// A faixa daqui, e não a do front: ver a nota do cabeçalho sobre as
// assinaturas divergentes de `avisar`.
// ⚠️ ELA VAI PARA DENTRO DO `#fundo` QUANDO HÁ UM. O `<dialog>` vive no top
// layer, e nenhum `z-index` põe algo do `<body>` acima dele — a faixa
// apareceria atrás do diálogo, que é o mesmo que não aparecer.
function _contaFaixa(texto, ok) {
  document.getElementById("aviso")?.remove();
  const alvo = document.getElementById("fundo") || document.body;
  const t = String(texto).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  alvo.insertAdjacentHTML("beforeend",
    `<div class="aviso" id="aviso" data-t="${ok ? "ok" : "erro"}"
       role="${ok ? "status" : "alert"}">${t}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), ok ? 6000 : 8000);
}

async function contaSalvarSenha() {
  const atual = document.getElementById("sfAtual")?.value || "";
  const nova  = document.getElementById("sfNova")?.value || "";
  const conf  = document.getElementById("sfConf")?.value || "";
  const msg   = document.getElementById("sfMsg");
  const dizer = (t) => { if (msg) msg.textContent = t; };

  // ⚠️ AS QUATRO CHECAGENS DE TELA EXISTEM PARA NÃO GASTAR UMA IDA AO SERVIDOR
  // com o que já se sabe daqui. As do servidor continuam valendo — e a de
  // senha atual errada só ele pode fazer.
  if (!atual || !nova || !conf) return dizer("Preencha os três campos.");
  if (nova !== conf)   return dizer("A senha nova e a repetição não conferem.");
  if (nova.length < 6) return dizer("A senha nova precisa de 6 caracteres ou mais.");
  if (nova === atual)  return dizer("A senha nova precisa ser diferente da atual.");

  const btn = document.querySelector('[data-acao="salvar-senha"]');
  if (btn) { btn.disabled = true; btn.textContent = "Trocando…"; }
  try {
    const tk = localStorage.getItem("token");
    const r = await fetch("/auth/trocar-senha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tk ? { Authorization: "Bearer " + tk } : {}),
      },
      body: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return dizer(d.error || "Não foi possível trocar a senha.");
    fechar();
    // ⚠️ A CONFIRMAÇÃO VAI NA FAIXA, não num texto que morre com o diálogo:
    // fechar a folha e não dizer nada deixa a dúvida de se trocou mesmo.
    _contaFaixa("Senha trocada.", true);
  } catch (e) {
    dizer("Erro de conexão: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Trocar senha"; }
  }
}

/* ── Eventos ─────────────────────────────────────────────────────────────
   ⚠️ Registrados no carregamento, e este arquivo vem ANTES do front — é o que
   mantém a gaveta respondendo primeiro. Nada aqui usa `stopPropagation`: o
   "Sair" continua sendo tratado pelo front (por `#btnSair`, o contrato que as
   três telas já compartilham), e ele precisa receber o clique. */
document.addEventListener("click", (e) => {
  if (e.target.closest("#btnEu")) { contaGaveta(); return; }
  const naGaveta = e.target.closest("#euGaveta");
  if (!naGaveta) contaGavetaFecha(false);
  else contaGavetaFecha(true);

  const b = e.target.closest("[data-acao]");
  if (!b) return;
  if (b.dataset.acao === "senha") return contaDlgSenha();
  if (b.dataset.acao === "salvar-senha") return contaSalvarSenha();
});

document.addEventListener("keydown", (e) => {
  // A gaveta é a peça mais interna quando está aberta, e responde primeiro —
  // a mesma ordem "de dentro para fora" que os handlers das três telas seguem.
  if (contaGavetaTeclas(e)) return;
  if (e.key === "Escape" && document.getElementById("euGaveta")?.hidden === false) {
    return contaGavetaFecha(true);
  }
});
