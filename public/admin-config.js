// ============================================================
// CONFIGURAÇÕES com o menu à esquerda (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A casca da tela #/config como a maquete desenhou: as seções num menu à
// esquerda (com ícone e nome), o título e a frase da seção em cima do
// conteúdo. ⚠️ SÓ A CASCA. Os itens do menu são os mesmos botões das abas de
// antes (#cfgTabs .wa-tab[data-cfg-tab]); quem troca de seção, carrega e
// salva continua sendo o admin.js (_cfgMostrarTab, _CFG_TABS, os
// data-cfg-action). Este arquivo só desenha o ícone de cada item e escreve o
// título e a frase da seção escolhida, embrulhando o _cfgMostrarTab.

(function () {
  function prepararMenu() {
    const nav = document.getElementById("cfgTabs");
    if (!nav || nav.dataset.cfxPronto) return;
    nav.dataset.cfxPronto = "1";
    nav.querySelectorAll(".cfx-item").forEach(bt => {
      const nome = bt.textContent.trim();
      bt.setAttribute("role", "tab");
      bt.innerHTML = `<i data-lucide="${bt.dataset.ic || "settings"}" aria-hidden="true"></i><span>${nome}</span>`;
    });
    window.lucide?.createIcons?.({ root: nav });
  }

  function escreverTitulo(tab) {
    const bt = document.querySelector(`#cfgTabs [data-cfg-tab="${tab}"]`);
    if (!bt) return;
    const t = document.getElementById("cfxTit"), d = document.getElementById("cfxDesc");
    if (t) t.textContent = bt.textContent.trim();
    if (d) d.textContent = bt.dataset.desc || "";
    document.querySelectorAll("#cfgTabs .cfx-item").forEach(b => b.setAttribute("aria-selected", String(b === bt)));
    // No celular o menu é uma faixa que rola de lado: o item escolhido à vista.
    bt.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  const orig = window._cfgMostrarTab;
  if (typeof orig === "function") {
    window._cfgMostrarTab = function (tab, ...resto) {
      const r = orig.call(this, tab, ...resto);
      prepararMenu();
      escreverTitulo(tab);
      return r;
    };
  }
  document.addEventListener("DOMContentLoaded", prepararMenu);
})();
