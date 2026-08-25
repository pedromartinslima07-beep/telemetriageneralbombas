// Registra o service worker e mantém ele atualizado de forma agressiva.
// Sem isso, o navegador pode demorar até 24h pra detectar nova versão e o
// usuário fica preso em uma versão antiga do app cacheada pelo SW.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // 1) Força check de update a cada carregamento da página
    reg.update().catch(() => {});

    // 2) Quando uma versão nova é instalada e fica em "waiting",
    // recarrega automaticamente pra ela assumir o controle.
    //
    // ⚠️ MAS NÃO NA PRIMEIRA INSTALAÇÃO (25/08/2026).
    //
    // O `sw.js` faz `clients.claim()` no activate, então numa aba que ainda
    // não tinha service worker nenhum ele toma o controle na hora — e isso
    // dispara `controllerchange` igualzinho a uma troca de versão. Resultado:
    // TODO PRIMEIRO ACESSO num navegador recarregava a página sozinho, e era
    // exatamente o "pisca e reseta tudo" que o Pedro relatou como pior "no
    // primeiro momento que você entra". Também pegava quem limpa dados do
    // site, quem usa janela anônima e quem troca de navegador.
    //
    // Recarregar ali nunca fez sentido: não havia versão anterior para
    // substituir. A página já está rodando o código mais novo — o reload joga
    // fora o que estiver na tela e não melhora nada.
    //
    // `navigator.serviceWorker.controller` é lido AGORA, antes de qualquer
    // ativação: nulo aqui = esta aba nasceu sem controlador = primeira
    // instalação.
    const tinhaControlador = !!navigator.serviceWorker.controller;

    const recarregarSeTrocou = () => {
      // controllerchange dispara quando o SW novo assume o controle
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!tinhaControlador) return;
        if (window._tgRecarregando) return;
        window._tgRecarregando = true;
        window.location.reload();
      });
    };
    recarregarSeTrocou();

    // 3) Se já existe um SW esperando, ativa imediatamente
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          // Há uma versão nova instalada e uma antiga ainda controlando
          novo.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => {});
}
