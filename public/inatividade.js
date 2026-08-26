// Logout automático por inatividade.
//
// ⚠️ O TEMPO CORRE COM O NAVEGADOR FECHADO (25/08/2026).
//
// A versão anterior era só um `setTimeout` em memória: o contador morria junto
// com a aba. Quem fechava o navegador e voltava dois dias depois entrava
// direto, porque o timer nunca chegou a disparar — o "30 minutos" valia apenas
// para quem deixava a tela aberta e parada. O Pedro pediu o contrário: 30
// minutos de inatividade REAL, aba aberta ou não.
//
// Por isso o instante da última atividade é gravado em `localStorage`, e a
// checagem acontece também no carregamento. Fechou às 14h, voltou às 15h?
// Passou de 30 minutos: sessão encerrada antes de a tela pintar qualquer dado.
//
// ⚠️ ISTO É CONVENIÊNCIA, NÃO BARREIRA. O JWT continua válido no servidor pelos
// 7 dias de `JWT_EXPIRES_IN` — apagar o token do navegador não o invalida do
// outro lado. Serve para o aparelho compartilhado (a máquina da portaria, o
// computador da sala), não contra quem já copiou o token. Encerrar sessão de
// verdade exigiria revogação no backend, que não existe hoje.
(function () {
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
  const CHAVE = "tg_ultima_atividade";

  // ⚠️ `mousemove` dispara dezenas de vezes por segundo. Gravar no
  // localStorage a cada evento é escrita síncrona no disco no meio da rolagem
  // — o suficiente para travar a tela em máquina fraca, que é justamente a da
  // portaria. Uma escrita a cada 15s basta: a folga é 120x menor que o teto.
  const GRAVAR_A_CADA_MS = 15 * 1000;

  let _timer = null;
  let _ultimaGravacao = 0;
  let _corteAgendado = false;

  function agora() { return Date.now(); }

  function ler() {
    try {
      const v = Number(localStorage.getItem(CHAVE));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch (_) {
      return null; // modo privado / storage bloqueado: cai no comportamento antigo
    }
  }

  function gravar(t) {
    try { localStorage.setItem(CHAVE, String(t)); } catch (_) {}
  }

  function limparSessao() {
    try {
      localStorage.removeItem("token");
      // ⚠️ O `user` sai junto. A versão anterior removia só o `token`, e o
      // `user` órfão fazia a tela seguinte mostrar o nome de quem já não está
      // logado até o primeiro 401.
      localStorage.removeItem("user");
      localStorage.removeItem(CHAVE);
    } catch (_) {}
  }

  // ⚠️ A TELA DE ORÇAMENTOS NÃO REDIRECIONA PARA /login, e isso é decisão
  // registrada: quem chega ali veio de um link sobre UM documento, e trocar
  // a página por um formulário perde o documento. Lá o login abre por cima.
  // Por isso a página pode declarar o que fazer; sem declaração, o padrão
  // continua sendo mandar para /login.
  function aplicarCorte() {
    _corteAgendado = false;
    if (typeof window.aoExpirarInatividade === "function") {
      try { window.aoExpirarInatividade(); return; } catch (_) {}
    }
    window.location.href = "/login?motivo=inatividade";
  }

  function encerrar() {
    limparSessao();

    // ⚠️ O HOOK PODE AINDA NÃO TER SIDO DECLARADO (26/08/2026).
    //
    // Este arquivo entra com `defer`, e o script que declara o
    // `aoExpirarInatividade` também — no `cliente-orcamentos.html` ele vem
    // DEPOIS deste. No corte de carregamento (o de quem volta com o tempo já
    // estourado) a função ainda não existe, e aí a decisão da página era
    // ignorada: quem clicava no link do orçamento no e-mail caía em /login com
    // "sessão expirada" — exatamente a tela que aquela página existe para não
    // mostrar.
    //
    // Adiar um tique resolve sem depender da ordem das tags: a fila de timers
    // só roda depois que TODO script `defer` executou. Para quem vai mesmo para
    // /login o atraso é invisível, e a sessão já foi apagada acima.
    if (typeof window.aoExpirarInatividade === "function") { aplicarCorte(); return; }
    if (_corteAgendado) return;
    _corteAgendado = true;
    setTimeout(aplicarCorte, 0);
  }

  function expirou() {
    const ultima = ler();
    return ultima !== null && agora() - ultima > TIMEOUT_MS;
  }

  function registrarAtividade() {
    const t = agora();
    if (t - _ultimaGravacao >= GRAVAR_A_CADA_MS) {
      _ultimaGravacao = t;
      gravar(t);
    }
    clearTimeout(_timer);
    _timer = setTimeout(encerrar, TIMEOUT_MS);
  }

  // Só faz sentido para quem está logado: sem token, o timer marcaria o tempo
  // de alguém que já está na tela de login.
  function temSessao() {
    try { return !!localStorage.getItem("token"); } catch (_) { return false; }
  }

  if (!temSessao()) return;

  // 1) Passou do tempo enquanto estava fechado? Encerra antes de tudo.
  if (expirou()) { encerrar(); return; }

  // 2) Aba aberta: qualquer sinal de vida adia o corte e renova o carimbo.
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(
    (ev) => document.addEventListener(ev, registrarAtividade, { passive: true })
  );

  // 3) Voltar de outra aba, de outro app ou de tela bloqueada é o momento em
  // que o tempo pode ter estourado sem nenhum evento acontecer aqui.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (expirou()) encerrar(); else registrarAtividade();
  });

  // Primeira marcação já vale como atividade — a pessoa acabou de abrir.
  _ultimaGravacao = 0;
  registrarAtividade();
})();
