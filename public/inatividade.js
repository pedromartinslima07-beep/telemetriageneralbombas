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

  // ⚠️ O PULSO DA TELA DE PLANTÃO (02/09/2026) — e ele é o conserto de um
  // defeito que o `data-corte="nunca"` sozinho NÃO resolvia.
  //
  // `localStorage` é do NAVEGADOR, não da aba. A tela de plantão parou de
  // cortar, mas qualquer OUTRA aba aberta no mesmo sistema — o admin, a tela
  // de Aprovados, o painel do cliente — continua com o timer de 30 min. Quando
  // ele dispara, o `limparSessao()` daquela aba apaga o token COMPARTILHADO. O
  // operador não corta, mas a chamada seguinte dele leva 401 e o
  // `_redirectSessaoExpirada` do `operador.js` manda para /login — desconexão
  // por inatividade, com outro nome e vindo de outra janela.
  //
  // Reproduzido em `scripts/testes/inatividade.test.js`: duas execuções contra
  // um `localStorage` só, o timer do admin disparando, e o token some.
  //
  // O conserto trata a tela de plantão como o que ela é: ALGUÉM OLHANDO. Ela
  // carimba sozinha, e o carimbo é o mesmo que as outras abas leem — então
  // ninguém mais vê inatividade enquanto ela estiver aberta. Fechou a aba, o
  // pulso para e o tempo volta a correr normalmente, inclusive com o navegador
  // fechado (que é a garantia de 25/08 e continua de pé).
  //
  // ⚠️ ISTO ENFRAQUECE O CORTE NAS OUTRAS ABAS, de propósito e por pedido: a
  // sessão passa a durar enquanto o mapa estiver aberto, na máquina inteira. É
  // a consequência de "o objetivo é deixar o mapa aberto", e ela precisa ser
  // dita — em máquina compartilhada, fechar o plantão volta a ser o que
  // encerra o expediente.
  //
  // 60s com teto de 30 min é folga de 30x. Navegador estrangula `setInterval`
  // de aba em segundo plano para ~1/min; mesmo estrangulado, sobra.
  const PULSO_PLANTAO_MS = 60 * 1000;

  let _timer = null;
  let _ultimaGravacao = 0;

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

  // ⚠️ TELA QUE NÃO CORTA — `data-corte="nunca"` no <body> (02/09/2026).
  //
  // O painel do operador existe para ficar ABERTO: o mapa do turno é
  // instrumento de plantão, e o operador passa longos trechos olhando para
  // ele sem tocar em nada. Trinta minutos sem mouse ali não é ausência, é o
  // uso normal — e cair no /login jogava fora o enquadramento do mapa, os
  // chamados que já tinham sido vistos e o balão aberto.
  //
  // ⚠️ O CARIMBO CONTINUA SENDO GRAVADO, e isso não é sobra. Ele é
  // compartilhado entre as telas: se esta parasse de carimbar, um dia de
  // trabalho no operador deixaria o carimbo velho, e abrir o /admin/painel
  // na mesma máquina cortaria a sessão no ato — o corte de carregamento
  // dispara antes de a tela pintar. Aqui só o CORTE é dispensado; a marca de
  // vida continua valendo para quem corta.
  //
  // Mesmo mecanismo do `data-corte="cartao"` (ver `aplicarCorte`): atributo
  // no <body>, que já está no DOM quando este `defer` roda e não esbarra na
  // CSP `script-src 'self'` desta casa.
  function nuncaCorta() {
    try { return document.body && document.body.dataset.corte === "nunca"; }
    catch (_) { return false; }
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
    // 1) Página já aberta: o hook existe (todo `defer` da página rodou) e sabe
    // o que fazer. É o corte do timer de 30 min e o do `visibilitychange`.
    if (typeof window.aoExpirarInatividade === "function") {
      try { window.aoExpirarInatividade(); return; } catch (_) {}
    }
    // 2) Corte de CARREGAMENTO: o hook ainda não existe (ver `encerrar`). A
    // página declara a intenção por ATRIBUTO, que já está no DOM quando este
    // `defer` roda — nada de script inline, que a CSP desta casa
    // (`script-src 'self'`) bloqueia em silêncio. Aqui só fica a marca; quem
    // abre o cartão é o script da página, ao carregar.
    try {
      if (document.body && document.body.dataset.corte === "cartao") {
        window._tgCorteAoCarregar = true;
        return;
      }
    } catch (_) {}
    // 3) Padrão de todas as outras telas.
    window.location.href = "/login?motivo=inatividade";
  }

  function encerrar() {
    limparSessao();

    // ⚠️ NO CORTE DE CARREGAMENTO NÃO DÁ PARA ESPERAR PELO HOOK (28/08/2026).
    //
    // O corte de carregamento — o de quem volta com o tempo já estourado —
    // acontece AQUI DENTRO, durante a execução deste `defer`. Uma página que
    // declare o `aoExpirarInatividade` num `defer` posterior chega tarde: a
    // decisão dela é ignorada e a pessoa cai em /login.
    //
    // Duas tentativas de adiar o corte para esperar o hook fracassaram, e o
    // registro das duas está aqui porque as duas parecem certas:
    //
    // 1. `setTimeout(…, 0)` (26/08) apostava que "a fila de timers só roda
    //    depois que TODO script `defer` executou". Não roda: os `defer`
    //    executam em ordem, mas o navegador ainda precisa BAIXAR o próximo, e
    //    nessa espera o laço de eventos está livre. Este arquivo é pequeno e
    //    vem do cache, o `cliente-orcamentos.js` tem 800 linhas — o timer
    //    ganhava em 100% das cargas medidas.
    //
    // 2. Esperar o `DOMContentLoaded` corrigia a tela de orçamentos e QUEBRAVA
    //    o painel: com o corte adiado, o `cliente.js` rodava antes, pedia sem
    //    token, tomava 401 e mandava para /login?motivo=**expirado** — mesmo
    //    destino, motivo errado na tela. Trocar uma corrida por outra não é
    //    conserto.
    //
    // Então o corte volta a ser SÍNCRONO, e a página declara a intenção por
    // ATRIBUTO em vez de por função — `data-corte="cartao"` no <body>, lido
    // no `aplicarCorte` acima. Atributo já está no DOM quando este `defer`
    // roda, não custa requisição e não esbarra na CSP. (Um `<script>` inline
    // também resolveria a ordem, e foi a terceira tentativa: morre em
    // `script-src 'self'` sem nonce, e morre calado.)
    aplicarCorte();
  }

  // ⚠️ O CARIMBO SOBREVIVE À SESSÃO QUE O CRIOU (28/08/2026).
  //
  // `limparSessao` apaga os três, mas ele é o ÚNICO que apaga o carimbo: o
  // `logout()` do painel e o `pedirEntrada()` dos orçamentos removem só
  // `token` e `user`. E do outro lado nenhum caminho de LOGIN carimba — nem o
  // `login.js`, nem o `_concluirEntrada` do cartão de orçamentos.
  //
  // Resultado: quem saiu ontem e entra hoje traz o carimbo de ontem, e a
  // primeira tela que carregar este arquivo mata a sessão recém-criada antes
  // de pintar qualquer dado. No painel isso vira um salto para /login; na
  // página de orçamentos vira o cartão pedindo o e-mail logo depois de a
  // pessoa ter entrado — que foi o sintoma relatado.
  //
  // O conserto mora aqui, e não nos 13 pontos que gravam ou apagam sessão: o
  // `iat` do JWT diz QUANDO esta sessão nasceu, então carimbo anterior ao
  // nascimento é carimbo de sessão morta e não vale como inatividade. Vale
  // para todo caminho de entrada que existe e para os que ainda vão existir.
  function nascimentoDaSessao() {
    try {
      const payload = (localStorage.getItem("token") || "").split(".")[1];
      if (!payload) return null;
      // base64url → base64. Bytes não-ASCII do `atob` (acento no nome, no
      // e-mail) atravessam o JSON.parse intactos: só o `iat` é lido daqui.
      const iat = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).iat;
      return Number.isFinite(iat) ? iat * 1000 : null;
    } catch (_) {
      return null; // token que não é JWT (harness) / storage bloqueado
    }
  }

  function expirou() {
    const ultima = ler();
    if (ultima === null) return false;
    const nascimento = nascimentoDaSessao();
    if (nascimento !== null && ultima < nascimento) return false;
    return agora() - ultima > TIMEOUT_MS;
  }

  // ⚠️ O TIMER DESTA ABA NÃO SABE DA ATIVIDADE DAS OUTRAS, e é por isso que
  // ele CONFERE o carimbo antes de cortar (02/09/2026).
  //
  // O timer é de memória, e a memória é da aba. O carimbo é que é do
  // navegador. Sem esta conferência, uma aba parada corta a sessão de todas
  // as outras depois de 30 minutos — mesmo que a pessoa esteja trabalhando na
  // aba do lado, mesmo que a tela de plantão esteja aberta e pulsando. Era o
  // que fazia o painel do operador continuar caindo depois do
  // `data-corte="nunca"`: ele não cortava, morria no 401 da chamada seguinte,
  // com o token apagado por uma janela que ele nem sabia que existia.
  //
  // Sobrou tempo no carimbo? Rearma pelo que falta, em vez de cortar. O corte
  // acontece quando o RELÓGIO COMPARTILHADO estourou, não quando este timer
  // chegou ao fim.
  function talvezEncerrar() {
    const ultima = ler();
    // Sem carimbo (storage bloqueado, aba anônima): o timer é o único sinal
    // que existe, e vale como antes.
    if (ultima === null) return encerrar();
    // Carimbo de sessão que já morreu não estende nada — mesma regra do
    // `expirou()`, e pelo mesmo motivo.
    const nascimento = nascimentoDaSessao();
    if (nascimento !== null && ultima < nascimento) return encerrar();
    const restante = ultima + TIMEOUT_MS - agora();
    if (restante > 0) { _timer = setTimeout(talvezEncerrar, restante); return; }
    encerrar();
  }

  function registrarAtividade() {
    const t = agora();
    if (t - _ultimaGravacao >= GRAVAR_A_CADA_MS) {
      _ultimaGravacao = t;
      gravar(t);
    }
    clearTimeout(_timer);
    // Na tela que não corta, a atividade só CARIMBA — ver `nuncaCorta`.
    if (nuncaCorta()) return;
    _timer = setTimeout(talvezEncerrar, TIMEOUT_MS);
  }

  // Só faz sentido para quem está logado: sem token, o timer marcaria o tempo
  // de alguém que já está na tela de login.
  function temSessao() {
    try { return !!localStorage.getItem("token"); } catch (_) { return false; }
  }

  if (!temSessao()) return;

  // 1) Passou do tempo enquanto estava fechado? Encerra antes de tudo.
  // ⚠️ A tela que não corta também não corta AQUI. Sem esta linha, deixar o
  // painel do operador aberto e voltar no dia seguinte cairia no /login no
  // carregamento — o caminho que o timer removido acima já não percorre.
  if (!nuncaCorta() && expirou()) { encerrar(); return; }

  // 2) Aba aberta: qualquer sinal de vida adia o corte e renova o carimbo.
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(
    (ev) => document.addEventListener(ev, registrarAtividade, { passive: true })
  );

  // 3) Voltar de outra aba, de outro app ou de tela bloqueada é o momento em
  // que o tempo pode ter estourado sem nenhum evento acontecer aqui.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!nuncaCorta() && expirou()) encerrar(); else registrarAtividade();
  });

  // 4) A tela de plantão carimba sozinha — ver `PULSO_PLANTAO_MS`. É o que
  // impede que o timer de OUTRA aba apague o token compartilhado embaixo dela.
  if (nuncaCorta()) {
    setInterval(function () { gravar(agora()); }, PULSO_PLANTAO_MS);
  }

  // Primeira marcação já vale como atividade — a pessoa acabou de abrir.
  _ultimaGravacao = 0;
  registrarAtividade();
})();
