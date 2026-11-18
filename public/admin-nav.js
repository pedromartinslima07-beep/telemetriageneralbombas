// ============================================================
// MENU EM 9 GRUPOS + SUBABAS  (redesenho, fase 3 — 18/11/2026)
// ============================================================
//
// Plano em docs/modulos/redesenho-admin.md. Roda depois do admin.js e do
// admin-condominio.js.
//
// ⚠️ OS 15 ITENS ANTIGOS CONTINUAM NO HTML, ESCONDIDOS, E SÃO A FONTE DA
// VERDADE. Três coisas do admin.js leem e escrevem neles e não mudaram:
//   - o perfil operador esconde item por `style.display = "none"`;
//   - os badges (`navBadgeAlertas` etc.) moram dentro deles;
//   - o `showSection` marca `.active` neles.
// Este arquivo só LÊ esses itens e desenha o menu novo por cima. Um
// MutationObserver ressincroniza quando algum deles muda (o item de WhatsApp,
// por exemplo, aparece depois do boot quando a integração está ligada).
//
// ⚠️ Nenhuma tela foi retirada. As que dividem um grupo viram subabas no
// topo do conteúdo. Retirar tela é a fase 5, e só com autorização.

const _NAV_GRUPOS = [
  { id: "inicio", rotulo: "Início",
    icone: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    membros: [["inicio", "Pede ação"], ["dashboard", "Painel"], ["alertas", "Alertas"], ["telemetria", "Telemetria"]] },
  { id: "agenda", rotulo: "Agenda",
    icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    membros: [["mapa", "Mapa"], ["planos", "Preventivas"]] },
  { id: "condominios", rotulo: "Condomínios",
    icone: '<rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M10 22v-4h4v4"/>',
    membros: [["cadastros", "Condomínios"], ["equipamentos", "Equipamentos"]],
    // a ficha não é subaba, mas acende o grupo
    tambem: ["condominio"] },
  { id: "chamados", rotulo: "Chamados",
    icone: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    membros: [["chamados", "Chamados"], ["whatsapp", "WhatsApp"]] },
  { id: "os", rotulo: "O.S.",
    icone: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    membros: [["ordens-servico", "O.S."]] },
  { id: "orcamentos", rotulo: "Orçamentos",
    icone: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    membros: [["orcamentos", "Orçamentos"]] },
  { id: "financeiro", rotulo: "Financeiro",
    icone: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
    membros: [["notas", "Notas fiscais"], ["contratos", "Contratos"]] },
  { id: "relatorios", rotulo: "Relatórios",
    icone: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    membros: [["relatorios", "Relatórios"]] },
  { id: "config", rotulo: "Configurações",
    icone: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    membros: [["config", "Configurações"], ["tecnicos", "Colaboradores"]] },
];

// Última subaba usada em cada grupo: voltar ao grupo devolve a pessoa onde ela
// estava, não à primeira subaba.
const _navUltima = {};
let _navAtual = null;

function _navItemAntigo(secao) {
  return document.querySelector(`.nav-antiga .nav-item[data-section="${secao}"]`);
}

// Visível = o item antigo existe e não foi escondido (perfil, integração).
function _navSecaoVisivel(secao) {
  const el = _navItemAntigo(secao);
  return !!el && el.style.display !== "none";
}

function _navGrupoDe(secao) {
  return _NAV_GRUPOS.find(g => g.membros.some(([s]) => s === secao) || (g.tambem || []).includes(secao)) || null;
}

function _navMembrosVisiveis(g) {
  return g.membros.filter(([s]) => _navSecaoVisivel(s));
}

function _navBadgeDe(secao) {
  const el = _navItemAntigo(secao);
  const b = el?.querySelector(".nav-badge");
  if (!b || b.style.display === "none") return 0;
  const n = parseInt(b.textContent, 10);
  return Number.isFinite(n) ? n : 0;
}

function _navMontar() {
  const antiga = document.querySelector(".sidebar .nav");
  if (!antiga || document.querySelector(".nav-grupos")) return;
  antiga.classList.add("nav-antiga");
  antiga.hidden = true;

  const nova = document.createElement("nav");
  nova.className = "nav nav-grupos";
  nova.setAttribute("aria-label", "Menu principal");
  nova.innerHTML = _NAV_GRUPOS.map(g => `
    <button class="nav-item" data-grupo="${g.id}" data-label="${g.rotulo}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${g.icone}</svg>
      <span class="nav-item-label">${g.rotulo}</span>
      <span class="nav-badge" style="display:none;">0</span>
    </button>`).join("");
  antiga.after(nova);

  nova.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-grupo]");
    if (!btn) return;
    const g = _NAV_GRUPOS.find(x => x.id === btn.dataset.grupo);
    const vis = _navMembrosVisiveis(g).map(([s]) => s);
    const alvo = vis.includes(_navUltima[g.id]) ? _navUltima[g.id] : vis[0];
    if (alvo) showSection(alvo);
  });

  // Subabas no topo do conteúdo, acima das seções.
  const content = document.querySelector(".main .content");
  if (content && !document.getElementById("navSub")) {
    const sub = document.createElement("div");
    sub.id = "navSub";
    sub.className = "nav-sub wa-tabs";
    sub.setAttribute("role", "tablist");
    sub.hidden = true;
    content.prepend(sub);
    sub.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sub]");
      if (b) showSection(b.dataset.sub);
    });
  }

  new MutationObserver(() => _navSincronizar()).observe(antiga, {
    subtree: true, attributes: true, attributeFilter: ["style", "class"], characterData: true, childList: true,
  });
}

function _navSincronizar() {
  const nova = document.querySelector(".nav-grupos");
  if (!nova) return;
  const g = _navAtual ? _navGrupoDe(_navAtual) : null;

  for (const grupo of _NAV_GRUPOS) {
    const btn = nova.querySelector(`[data-grupo="${grupo.id}"]`);
    if (!btn) continue;
    const vis = _navMembrosVisiveis(grupo);
    btn.style.display = vis.length ? "" : "none";
    btn.classList.toggle("active", grupo === g);
    const total = vis.reduce((s, [sec]) => s + _navBadgeDe(sec), 0);
    const badge = btn.querySelector(".nav-badge");
    badge.textContent = total > 99 ? "99+" : String(total);
    badge.style.display = total ? "" : "none";
  }

  const sub = document.getElementById("navSub");
  if (!sub) return;
  const vis = g ? _navMembrosVisiveis(g) : [];
  // Subaba só quando há o que escolher, e nunca por cima da ficha (ela tem as
  // abas dela).
  if (vis.length < 2 || _navAtual === "condominio") { sub.hidden = true; sub.innerHTML = ""; return; }
  sub.hidden = false;
  sub.innerHTML = vis.map(([s, rot]) => {
    const n = _navBadgeDe(s);
    const ativo = s === _navAtual;
    return `<button class="wa-tab${ativo ? " is-active" : ""}" role="tab" aria-selected="${ativo}" data-sub="${s}">${rot}${n ? ` <span class="wa-count">${n}</span>` : ""}</button>`;
  }).join("");
}

// O showSection é a porta de toda troca de tela. Embrulhado aqui para:
// 1) trocar uma seção que o perfil não vê pela primeira visível do grupo
//    (o menu mobile manda "inicio" para o operador, que não tem essa tela);
// 2) lembrar a subaba e redesenhar o menu.
(function _navEmbrulharShowSection() {
  const orig = window.showSection;
  if (typeof orig !== "function") return;
  window.showSection = function (name, ...resto) {
    if (name !== "condominio" && document.querySelector(".nav-grupos") && !_navSecaoVisivel(name)) {
      const g = _navGrupoDe(name);
      const sub = g && _navMembrosVisiveis(g)[0]?.[0];
      const primeira = sub || _NAV_GRUPOS.map(x => _navMembrosVisiveis(x)[0]?.[0]).find(Boolean);
      if (primeira && primeira !== name) return window.showSection(primeira, ...resto);
    }
    const r = orig.call(this, name, ...resto);
    _navAtual = name;
    const g = _navGrupoDe(name);
    if (g && name !== "condominio") _navUltima[g.id] = name;
    _navSincronizar();
    // Menu mobile acompanha: acende o item da própria tela quando ele existe
    // (Alertas tem botão próprio lá embaixo); senão, o do grupo.
    const mob = [...document.querySelectorAll(".mob-nav-item[data-mob-section]")];
    const acender = mob.find(b => b.dataset.mobSection === name)
                 || mob.find(b => g && _navGrupoDe(b.dataset.mobSection) === g);
    mob.forEach(b => b.classList.toggle("active", b === acender));
    return r;
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  // As duas seções novas não existem para o operador: Início e Notas leem
  // orçamentos, O.S. e contratos, que respondem 403 para ele.
  if (typeof _isOperador !== "undefined" && _isOperador) {
    ["inicio", "notas"].forEach(s => { const el = _navItemAntigo(s) || document.querySelector(`.nav-item[data-section="${s}"]`); if (el) el.style.display = "none"; });
  }
  _navMontar();
  // A tela de abertura passa a ser o Início (o HTML ainda nasce no Dashboard).
  // Sem endereço na URL; com endereço, o roteador da ficha decide.
  _navAtual = document.querySelector(".section.is-active")?.dataset.section || null;
  if (!location.hash) {
    const abertura = _navSecaoVisivel("inicio") ? "inicio" : (_navAtual || "alertas");
    // Abrir o painel não é navegação: o endereço é SUBSTITUÍDO, não empilhado,
    // senão o primeiro "voltar" levaria a uma página sem tela nenhuma.
    _rotaAplicando = true;
    try { showSection(abertura); } finally { _rotaAplicando = false; }
    history.replaceState(null, "", `#/${_navAtual || abertura}`);
  } else {
    _navSincronizar();
  }
});
