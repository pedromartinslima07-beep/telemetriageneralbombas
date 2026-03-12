(function () {
  // Só executa em mobile
  if (window.innerWidth > 768) return;

  // ── Navegação pelo bottom nav ──
  var mobItems = document.querySelectorAll('.mob-nav-item[data-mob-section]');

  mobItems.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var section = btn.dataset.mobSection;

      // Chama showSection definido em admin.js / cliente.js
      if (typeof showSection === 'function') showSection(section);

      // Atualiza active no bottom nav
      mobItems.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // ── Botão de refresh mobile → dispara o botão desktop ──
  var mobRefresh = document.getElementById('mobBtnAtualizar');
  if (mobRefresh) {
    mobRefresh.addEventListener('click', function () {
      var desktop = document.getElementById('btnAtualizar') ||
                    document.getElementById('btnAtualizarCliente');
      if (desktop) desktop.click();

      // Animação de rotação no ícone
      var svg = mobRefresh.querySelector('svg');
      if (svg) {
        svg.style.transition = 'transform .6s ease';
        svg.style.transform  = 'rotate(360deg)';
        setTimeout(function () {
          svg.style.transition = 'none';
          svg.style.transform  = 'none';
        }, 650);
      }
    });
  }

  // ── Admin: Verificar Offline mobile ──
  var mobOffline = document.getElementById('mobBtnOffline');
  if (mobOffline) {
    mobOffline.addEventListener('click', function () {
      var desktop = document.getElementById('btnOffline');
      if (desktop) desktop.click();
    });
  }

  // ── Cliente: Alterar senha mobile ──
  var mobSenha = document.getElementById('mobBtnSenha');
  if (mobSenha) {
    mobSenha.addEventListener('click', function () {
      if (typeof abrirModalSenha === 'function') abrirModalSenha();
    });
  }

  // ── Botão Sair ──
  var mobSair = document.getElementById('mobBtnSair');
  if (mobSair) {
    mobSair.addEventListener('click', function () {
      if (typeof logout === 'function') logout();
    });
  }

  // ── Sincroniza badge de alertas (sidebar → bottom nav) ──
  var srcBadge = document.getElementById('navBadgeAlertas');
  var dstBadge = document.getElementById('mobBadgeAlertas');

  if (srcBadge && dstBadge) {
    function syncBadge() {
      var visible = srcBadge.style.display !== 'none';
      dstBadge.textContent = srcBadge.textContent;
      dstBadge.classList.toggle('is-visible', visible);
    }
    new MutationObserver(syncBadge).observe(srcBadge, {
      attributes: true, childList: true, characterData: true, subtree: true,
    });
    syncBadge();
  }

  // ── Sincroniza título do topbar com a seção ativa ──
  // O admin.js/cliente.js já atualiza #topbarTitle via showSection(),
  // então basta garantir que o título inicial está correto
  var activeItem = document.querySelector('.mob-nav-item.active[data-mob-section]');
  if (activeItem) {
    var titles = { dashboard: 'Dashboard', alertas: 'Alertas', cadastros: 'Cadastros', historico: 'Histórico' };
    var titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = titles[activeItem.dataset.mobSection] || 'Dashboard';
  }
}());
