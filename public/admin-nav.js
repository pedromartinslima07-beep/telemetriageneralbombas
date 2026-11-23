// ============================================================
// CASCA DO ADMIN — menu lateral (redesenho estrutural, 19/11/2026)
// ============================================================
//
// Plano em docs/modulos/redesenho-admin.md, seção "Redesenho estrutural".
// Roda depois do admin.js e do admin-condominio.js.
//
// O menu é um <aside class="gb-sb"> NOVO, montado aqui. O <aside class="sidebar">
// antigo continua no HTML, escondido, e continua sendo A FONTE DA VERDADE de
// três coisas que o admin.js escreve nele e que não mudaram:
//   - o perfil operador esconde item da nav antiga por `style.display = "none"`;
//   - os badges (`navBadgeAlertas` etc.) moram dentro desses itens;
//   - nome e papel do usuário (`sidebarUserLabel`, `sidebarUserRole`).
// Um MutationObserver no aside antigo ressincroniza o novo (o item do WhatsApp,
// por exemplo, aparece depois do boot quando a integração está ligada).
//
// ⚠️ Item com mais de uma seção (Monitoramento, Atendimento, Financeiro)
// mostra subabas no topo do conteúdo. É TRANSIÇÃO: cada um vira uma tela só
// nas próximas etapas do redesenho. Nenhuma tela foi retirada.

const _NAV_ITENS = [
  { id: "hoje", rotulo: "Hoje", icone: "sun", membros: [["inicio", "Hoje"]] },
  // Etapa 2 (19/11/2026): uma tela só. As antigas continuam alcançáveis por
  // link (Histórico e PDF, comentários do alerta) e acendem este item.
  { id: "monitoramento", rotulo: "Monitoramento", icone: "activity",
    membros: [["monitoramento", "Monitoramento"]], tambem: ["telemetria", "mapa", "alertas", "dashboard"],
    badgeDe: ["alertas"] },
  // Etapa 3 (19/11/2026): caixa de entrada única. As telas antigas seguem
  // alcançáveis por endereço e acendem este item.
  { id: "atendimento", rotulo: "Atendimento", icone: "inbox",
    membros: [["atendimento", "Atendimento"]], tambem: ["chamados", "whatsapp", "chamado-detalhe"],
    badgeDe: ["chamados", "whatsapp"] },
  { id: "agenda", rotulo: "Agenda", icone: "calendar-days", membros: [["agenda", "Agenda"]] },
  { grupo: "Documentos" },
  { id: "os", rotulo: "Ordens de serviço", icone: "clipboard-check", membros: [["ordens-servico", "O.S."]], tambem: ["os-detalhe"] },
  { id: "orcamentos", rotulo: "Orçamentos", icone: "file-text", membros: [["orcamentos", "Orçamentos"]], tambem: ["orcamento-detalhe", "nota-detalhe"] },
  // Etapa 5 (19/11/2026): tela única. Notas segue alcançável por endereço e
  // acende este item.
  { id: "financeiro", rotulo: "Financeiro", icone: "landmark",
    membros: [["financeiro", "Financeiro"]], tambem: ["notas"] },
  { grupo: "Carteira" },
  { id: "condominios", rotulo: "Condomínios", icone: "building-2", membros: [["cadastros", "Condomínios"]], tambem: ["condominio"] },
  // 20/11/2026: Contratos saiu de dentro do Financeiro (era a troca "Notas
  // fiscais | Contratos", e o bloco "Contratos no Omie" nem ia junto). O
  // contrato diz o que o prédio tem (prioridade, preventiva, se é cliente de
  // contrato): fica na Carteira, ao lado do prédio. O Financeiro só leva para cá.
  { id: "contratos", rotulo: "Contratos", icone: "file-signature", membros: [["contratos", "Contratos"]], tambem: ["contrato-detalhe"] },
  { id: "preventivas", rotulo: "Preventivas", icone: "repeat", membros: [["planos", "Preventivas"]] },
  { id: "equipamentos", rotulo: "Equipamentos", icone: "package", membros: [["equipamentos", "Equipamentos"]] },
  { id: "relatorios", rotulo: "Relatórios", icone: "chart-column", membros: [["relatorios", "Relatórios"]] },
];
// Saem do menu e vão para o menu do usuário (decisão de 19/11/2026).
const _NAV_USUARIO = [["config", "Configurações", "settings"], ["tecnicos", "Colaboradores", "users"]];

const _NAV_GRUPOS = _NAV_ITENS.filter(i => i.id); // compat: admin-condominio.js e afins leem por id
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
  const b = _navItemAntigo(secao)?.querySelector(".nav-badge");
  if (!b || b.style.display === "none") return 0;
  const n = parseInt(b.textContent, 10);
  return Number.isFinite(n) ? n : 0;
}

const _navEsc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const _navIco = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
function _navIcones(raiz) {
  if (window.lucide?.createIcons) window.lucide.createIcons({ root: raiz || document, attrs: { "stroke-width": 1.9 } });
}

// ===== MONTAGEM =====

function _navMontar() {
  const antigo = document.getElementById("sidebar");
  const navAntiga = antigo?.querySelector(".nav");
  if (!antigo || !navAntiga || document.querySelector(".gb-sb")) return;
  navAntiga.classList.add("nav-antiga");
  antigo.classList.add("sidebar-antiga");
  antigo.setAttribute("aria-hidden", "true");

  const sb = document.createElement("aside");
  sb.className = "gb-sb";
  sb.id = "gbSb";
  sb.setAttribute("aria-label", "Menu principal");
  sb.innerHTML = `
    <div class="gb-sb-topo">
      <a class="gb-sb-marca" href="#/inicio" aria-label="General · Hoje">
        <img class="gb-sb-logo-full" src="/static/logo-topo.png" alt="GENERAL">
        <img class="gb-sb-logo-mini" src="/static/logo-menu.png" alt="">
      </a>
      <!-- ⚠️ O recolher saiu daqui (20/11/2026, pedido do Pedro): mora na
           faixa de cima (#btnSidebarToggleIn), ao lado do título. A logo é a
           da faixa de cima da landing (logo-topo.png). -->
      <button class="gb-sb-fechar" type="button" data-sb-fechar aria-label="Fechar menu">${_navIco("x")}</button>
    </div>
    <nav class="gb-sb-nav" aria-label="Telas">
      ${_NAV_ITENS.map(i => i.grupo
        ? `<div class="gb-sb-grupo"><span class="gb-sb-txt">${i.grupo}</span></div>`
        : `<button class="gb-sb-item" type="button" data-grupo="${i.id}" data-dica="${_navEsc(i.rotulo)}">
            ${_navIco(i.icone)}<span class="gb-sb-txt">${i.rotulo}</span><b class="gb-sb-n" hidden></b>
          </button>`).join("")}
    </nav>
    <div class="gb-sb-pe">
      <button class="gb-sb-user" type="button" data-sb-user aria-haspopup="menu" aria-expanded="false" data-dica="Sua conta">
        <span class="gb-sb-av" id="gbSbAv"></span>
        <span class="gb-sb-user-txt gb-sb-txt"><b id="gbSbNome">—</b><small id="gbSbPapel"></small></span>
        ${_navIco("chevrons-up-down")}
      </button>
      <div class="gb-menu gb-sb-user-menu" role="menu" hidden>
        ${_NAV_USUARIO.map(([s, n, ic]) => `<button type="button" role="menuitem" data-sb-secao="${s}">${_navIco(ic)}${n}</button>`).join("")}
        <hr>
        <button type="button" role="menuitem" data-sb-sair>${_navIco("log-out")}Sair</button>
      </div>
    </div>`;
  antigo.before(sb);

  const veu = document.createElement("div");
  veu.className = "gb-sb-veu";
  veu.dataset.sbFechar = "";
  sb.after(veu);

  // Recolhido: preferência salva (a mesma chave do menu antigo).
  _navRecolher(localStorage.getItem("sidebarCollapsed") === "true", { salvar: false });

  sb.addEventListener("click", (e) => {
    const t = e.target;
    const item = t.closest("[data-grupo]");
    if (item) {
      const g = _NAV_GRUPOS.find(x => x.id === item.dataset.grupo);
      const vis = _navMembrosVisiveis(g).map(([s]) => s);
      const alvo = vis.includes(_navUltima[g.id]) ? _navUltima[g.id] : vis[0];
      if (alvo) showSection(alvo);
      _navGaveta(false);
      return;
    }
    if (t.closest("[data-sb-recolher]")) return _navRecolher(!sb.classList.contains("is-recolhido"));
    if (t.closest("[data-sb-user]")) return _navMenuUsuario();
    const sec = t.closest("[data-sb-secao]");
    if (sec) { _navMenuUsuario(false); _navGaveta(false); showSection(sec.dataset.sbSecao); return; }
    if (t.closest("[data-sb-sair]")) { if (typeof logout === "function") logout(); return; }
    if (t.closest("[data-sb-fechar]")) return _navGaveta(false);
  });
  veu.addEventListener("click", () => _navGaveta(false));
  document.addEventListener("mousedown", (e) => {
    const m = sb.querySelector(".gb-sb-user-menu");
    if (!m.hidden && !m.contains(e.target) && !e.target.closest("[data-sb-user]")) _navMenuUsuario(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    _navMenuUsuario(false);
    _navGaveta(false);
  });

  // Celular: o botão de menu entra no começo da barra de cima e abre o menu
  // como gaveta. A barra de baixo (mob-nav) continua.
  const topoMob = document.querySelector(".mob-topbar");
  if (topoMob && !topoMob.querySelector("[data-sb-abrir]")) {
    const b = document.createElement("button");
    b.className = "mob-top-btn gb-mob-menu";
    b.type = "button";
    b.dataset.sbAbrir = "";
    b.setAttribute("aria-label", "Abrir menu");
    b.innerHTML = _navIco("menu");
    b.addEventListener("click", () => _navGaveta(true));
    topoMob.prepend(b);
    const busca = document.createElement("button");
    busca.className = "mob-top-btn";
    busca.type = "button";
    busca.dataset.buscaAbrir = "";
    busca.setAttribute("aria-label", "Buscar");
    busca.innerHTML = _navIco("search");
    topoMob.querySelector("#mobBtnOffline")?.before(busca);
  }

  // O botão de menu do topo (desktop) passa a recolher o menu novo. Ele
  // escutava o antigo pelo admin.js; o clique é interceptado na captura.
  // ⚠️ É O ÚNICO BOTÃO DE RECOLHER desde 20/11/2026: o que ficava dentro do
  // menu saiu, a pedido do Pedro. Ícone de painel (não o hambúrguer antigo),
  // trocado por _navRecolher conforme o estado.
  const toggleTopo = document.getElementById("btnSidebarToggleIn");
  toggleTopo?.addEventListener("click", (e) => {
    e.stopImmediatePropagation();
    _navRecolher(!sb.classList.contains("is-recolhido"));
  }, true);
  _navToggleTopo(sb.classList.contains("is-recolhido"));

  new MutationObserver(() => _navSincronizar()).observe(antigo, {
    subtree: true, attributes: true, attributeFilter: ["style", "class"], characterData: true, childList: true,
  });

  // Subabas no topo do conteúdo (transição, ver o cabeçalho deste arquivo).
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

  _navIcones(sb);
  if (topoMob) _navIcones(topoMob);
}

// O botão da faixa de cima diz o que vai acontecer: abrir ou recolher.
function _navToggleTopo(recolhido) {
  const b = document.getElementById("btnSidebarToggleIn");
  if (!b) return;
  b.setAttribute("aria-label", recolhido ? "Abrir menu" : "Recolher menu");
  b.title = recolhido ? "Abrir menu" : "Recolher menu";
  b.innerHTML = _navIco(recolhido ? "panel-left-open" : "panel-left-close");
  _navIcones(b);
}

function _navRecolher(recolher, { salvar = true } = {}) {
  const sb = document.getElementById("gbSb");
  if (!sb) return;
  sb.classList.toggle("is-recolhido", recolher);
  document.body.classList.toggle("gb-sb-recolhido", recolher);
  _navToggleTopo(recolher);
  if (salvar) localStorage.setItem("sidebarCollapsed", String(recolher));
  // Mapas e gráficos medem o contêiner: avisa que a largura mudou.
  setTimeout(() => window.dispatchEvent(new Event("resize")), 220);
}

function _navGaveta(abrir) {
  document.body.classList.toggle("gb-sb-gaveta", !!abrir);
}

function _navMenuUsuario(abrir) {
  const sb = document.getElementById("gbSb");
  const m = sb?.querySelector(".gb-sb-user-menu");
  const b = sb?.querySelector("[data-sb-user]");
  if (!m) return;
  const vai = abrir ?? m.hidden;
  m.hidden = !vai;
  b.setAttribute("aria-expanded", String(vai));
}

function _navSincronizar() {
  const sb = document.getElementById("gbSb");
  if (!sb) return;
  const g = _navAtual ? _navGrupoDe(_navAtual) : null;

  for (const item of _NAV_GRUPOS) {
    const btn = sb.querySelector(`[data-grupo="${item.id}"]`);
    if (!btn) continue;
    const vis = _navMembrosVisiveis(item);
    btn.hidden = !vis.length;
    const on = item === g;
    btn.classList.toggle("is-on", on);
    if (on) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    const total = (item.badgeDe || vis.map(([sec]) => sec)).reduce((s, sec) => s + _navBadgeDe(sec), 0);
    const badge = btn.querySelector(".gb-sb-n");
    badge.textContent = total > 99 ? "99+" : String(total);
    badge.hidden = !total;
    // Monitoramento e Atendimento: contador vermelho (é alarme). O resto, neutro.
    badge.classList.toggle("is-alarme", item.id === "monitoramento" || item.id === "atendimento");
    btn.dataset.dica = total ? `${item.rotulo} · ${total}` : item.rotulo;
  }
  // Rótulo de grupo sem item visível embaixo (operador) some.
  sb.querySelectorAll(".gb-sb-grupo").forEach(rot => {
    let algum = false;
    for (let n = rot.nextElementSibling; n && !n.classList.contains("gb-sb-grupo"); n = n.nextElementSibling) {
      if (!n.hidden) { algum = true; break; }
    }
    rot.hidden = !algum;
  });
  // Menu do usuário: Configurações e Colaboradores obedecem o perfil.
  for (const [s] of _NAV_USUARIO) {
    const b = sb.querySelector(`[data-sb-secao="${s}"]`);
    if (b) b.hidden = !_navSecaoVisivel(s);
  }
  const userOn = _NAV_USUARIO.some(([s]) => s === _navAtual);
  sb.querySelector("[data-sb-user]")?.classList.toggle("is-on", userOn);

  // Nome e papel: o admin.js escreve no aside antigo.
  const nome = document.getElementById("sidebarUserLabel")?.textContent?.trim() || "";
  const papel = document.getElementById("sidebarUserRole")?.textContent?.trim() || "";
  const elNome = document.getElementById("gbSbNome");
  if (elNome && nome && elNome.textContent !== nome) {
    elNome.textContent = nome;
    const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
    document.getElementById("gbSbAv").textContent = ini || "?";
  }
  const elPapel = document.getElementById("gbSbPapel");
  if (elPapel && elPapel.textContent !== papel) elPapel.textContent = papel;

  const sub = document.getElementById("navSub");
  if (!sub) return;
  const vis = g ? _navMembrosVisiveis(g) : [];
  // Subaba só quando há o que escolher, e nunca por cima das páginas de
  // documento (O.S., orçamento, contrato, chamado, ficha): elas têm o Voltar.
  const naPaginaDoc = _navAtual === "condominio" || /-detalhe$/.test(_navAtual || "");
  if (vis.length < 2 || naPaginaDoc) { sub.hidden = true; sub.innerHTML = ""; return; }
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
  const pagina = (n) => n === "condominio" || /-detalhe$/.test(n);
  window.showSection = function (name, ...resto) {
    // Sair da página do orçamento com alteração não salva pergunta antes.
    if (typeof _avPodeSair === "function" && !_avPodeSair(name)) return;
    if (typeof _ctrPodeSair === "function") _ctrPodeSair(name);
    if (typeof _chPodeSair === "function") _chPodeSair(name);
    if (!pagina(name) && document.getElementById("gbSb") && !_navSecaoVisivel(name)) {
      const g = _navGrupoDe(name);
      const sub = g && _navMembrosVisiveis(g)[0]?.[0];
      const primeira = sub || _NAV_GRUPOS.map(x => _navMembrosVisiveis(x)[0]?.[0]).find(Boolean);
      if (primeira && primeira !== name) return window.showSection(primeira, ...resto);
    }
    const r = orig.call(this, name, ...resto);
    _navAtual = name;
    const g = _navGrupoDe(name);
    if (g && !pagina(name)) _navUltima[g.id] = name;
    _navSincronizar();
    // Menu mobile acompanha: acende o item da própria tela quando ele existe;
    // senão, o do grupo.
    const mob = [...document.querySelectorAll(".mob-nav-item[data-mob-section]")];
    const acender = mob.find(b => b.dataset.mobSection === name)
                 || mob.find(b => g && _navGrupoDe(b.dataset.mobSection) === g);
    mob.forEach(b => b.classList.toggle("active", b === acender));
    return r;
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  // As seções que não existem para o operador: Hoje, Notas e Financeiro leem
  // orçamentos, O.S. e contratos, que respondem 403 para ele; a Agenda é
  // `gestaoOnly` na rota (src/routes/agenda.routes.js).
  if (typeof _isOperador !== "undefined" && _isOperador) {
    ["inicio", "notas", "agenda", "financeiro"].forEach(s => {
      const el = _navItemAntigo(s) || document.querySelector(`.nav-item[data-section="${s}"]`);
      if (el) el.style.display = "none";
    });
  }
  _navMontar();
  // Menu do celular: "Início" virou "Hoje".
  const mobHoje = document.querySelector('.mob-nav-item[data-mob-section="inicio"] span');
  if (mobHoje) mobHoje.textContent = "Hoje";
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
