// Registra o service worker e mantém ele atualizado de forma agressiva.
// Sem isso, o navegador pode demorar até 24h pra detectar nova versão e o
// usuário fica preso em uma versão antiga do app cacheada pelo SW.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // 1) Força check de update a cada carregamento da página
    reg.update().catch(() => {});

    // 2) Quando uma versão nova é instalada e fica em "waiting",
    // recarrega automaticamente pra ela assumir o controle.
    const recarregarSeTrocou = () => {
      // controllerchange dispara quando o SW novo assume o controle
      navigator.serviceWorker.addEventListener('controllerchange', () => {
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
