// ============================================================
// BUSCA GLOBAL — Ctrl+K  (redesenho estrutural, 19/11/2026)
// ============================================================
//
// Substitui o campo de busca do topo (`#topbarSearch`, admin.js "BUSCA
// GLOBAL (topbar)") por uma paleta de comandos, como Linear e GitHub. Procura
// no que o painel JÁ CARREGOU — nenhuma rota nova, nenhum fetch:
//   condomínios (_condominios), reservatórios (_statusData), chamados
//   (_chamadosData), O.S. (_osData), orçamentos e notas (_avData),
//   pessoas (_tecnicosData), e as telas e ações do menu.
// O que o perfil não carrega (operador: O.S., orçamentos) simplesmente não
// aparece, porque a coleção está vazia para ele.
//
// ⚠️ O Ctrl+K do admin.js (que focava o campo antigo) continua registrado no
// `document`. Este escuta na CAPTURA da `window` e para a propagação, então
// só a paleta abre.

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const arr = v => (Array.isArray(v) ? v : []);
  // ⚠️ As coleções são `let` no topo do admin.js: existem no escopo global,
  // mas NÃO como propriedade da window. Por isso o acesso direto, com typeof.
  const col = {
    condominios: () => (typeof _condominios !== "undefined" ? _condominios : []),
    status:      () => (typeof _statusData !== "undefined" ? _statusData : []),
    chamados:    () => (typeof _chamadosData !== "undefined" ? _chamadosData : []),
    os:          () => (typeof _osData !== "undefined" ? _osData : []),
    orcamentos:  () => (typeof _avData !== "undefined" ? _avData : []),
    tecnicos:    () => (typeof _tecnicosData !== "undefined" ? _tecnicosData : []),
  };
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;

  let veu = null, campo = null, lista = null;
  let resultados = [], sel = 0, voltarFoco = null;

  function montar() {
    if (veu) return;
    veu = document.createElement("div");
    veu.className = "gb-cmdk-veu";
    veu.hidden = true;
    veu.innerHTML = `
      <div class="gb-cmdk" role="dialog" aria-modal="true" aria-label="Buscar no sistema">
        <div class="gb-cmdk-campo">
          ${ico("search")}
          <input type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true"
                 aria-controls="gbCmdkLista" aria-autocomplete="list"
                 placeholder="Condomínio, chamado, O.S., orçamento, pessoa ou ação…">
          <kbd>Esc</kbd>
        </div>
        <div class="gb-cmdk-lista" id="gbCmdkLista" role="listbox"></div>
        <div class="gb-cmdk-pe"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
      </div>`;
    document.body.appendChild(veu);
    campo = veu.querySelector("input");
    lista = veu.querySelector(".gb-cmdk-lista");
    campo.addEventListener("input", desenhar);
    campo.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); marcar(Math.min(resultados.length - 1, sel + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); marcar(Math.max(0, sel - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); ir(sel); }
      else if (e.key === "Escape") { e.preventDefault(); fechar(); }
      else if (e.key === "Tab") { e.preventDefault(); } // foco preso na paleta
    });
    lista.addEventListener("mousemove", (e) => {
      const it = e.target.closest("[data-i]");
      if (it && Number(it.dataset.i) !== sel) marcar(Number(it.dataset.i), false);
    });
    lista.addEventListener("click", (e) => {
      const it = e.target.closest("[data-i]");
      if (it) ir(Number(it.dataset.i));
    });
    veu.addEventListener("mousedown", (e) => { if (e.target === veu) fechar(); });
    window.lucide?.createIcons?.({ root: veu });
  }

  // ===== O ÍNDICE: montado na hora, do que está carregado =====
  function indice() {
    const out = [];
    const nomeCondo = id => {
      const c = arr(col.condominios()).find(x => Number(x.id) === Number(id));
      return c ? (c.nome_fantasia || c.nome) : "";
    };
    for (const c of arr(col.condominios())) {
      out.push({ g: "Condomínios", ic: "building-2", t: c.nome_fantasia || c.nome, s: [c.bairro, c.cidade].filter(Boolean).join(" · "),
        extra: `${c.nome || ""} ${c.cnpj || ""} ${c.responsavel || ""}`, abrir: () => abrirFichaCondominio(c.id) });
    }
    for (const g of arr(col.status())) {
      for (const r of arr(g.reservatorios)) {
        const pct = r.ultima_leitura?.nivel_pct;
        const cn = g.condominio?.nome_fantasia || g.condominio?.nome || "";
        out.push({ g: "Reservatórios", ic: "droplet", t: `${cn} · ${r.nome || r.device_id}`,
          s: r.offline ? "sem sinal" : (pct != null ? `${Math.round(pct)}%` : ""), extra: r.device_id,
          abrir: () => (typeof gbMonEscolher === "function" ? gbMonEscolher(r.id) : abrirFichaCondominio(g.condominio?.id, "telemetria")) });
      }
    }
    for (const ch of arr(col.chamados())) {
      out.push({ g: "Chamados", ic: "inbox", t: `#${ch.id} · ${ch.titulo || "Sem título"}`,
        s: [ch.condominio_nome, typeof _chEmAberto === "function" && !_chEmAberto(ch.status) ? (ch.status === "cancelado" ? "cancelado" : "resolvido") : "em aberto"].filter(Boolean).join(" · "),
        extra: `${ch.tecnico_nome || ""} ${ch.categoria || ""}`, recente: ch.criado_em, aberto: typeof _chEmAberto === "function" && _chEmAberto(ch.status),
        abrir: () => (typeof gbAtEscolher === "function" ? gbAtEscolher(ch.id) : _chAbrirPagina(ch.id)) });
    }
    for (const o of arr(col.os())) {
      out.push({ g: "Ordens de serviço", ic: "clipboard-check", t: `${o.numero || "O.S. #" + o.id}${o.tipo_servico ? " · " + o.tipo_servico : ""}`,
        s: [o.condominio_nome || nomeCondo(o.condominio_id), o.tecnico_nome].filter(Boolean).join(" · "),
        abrir: () => abrirOSDetalhe(o.id) });
    }
    for (const o of arr(col.orcamentos())) {
      out.push({ g: "Orçamentos", ic: "file-text", t: `${o.numero || "Orçamento #" + o.id}${o.titulo ? " · " + o.titulo : ""}`,
        s: [o.condominio_nome || nomeCondo(o.condominio_id) || o.cliente_nome, typeof _avStatusLabel === "function" ? _avStatusLabel(o.status) : o.status].filter(Boolean).join(" · "),
        extra: `${o.nota_numero || ""}`, abrir: () => _cfAbrirOrcamento(o.id) });
    }
    for (const t of arr(col.tecnicos())) {
      if (t.ativo === false) continue;
      out.push({ g: "Pessoas", ic: "user", t: t.nome, s: (typeof _tecCargoLabel !== "undefined" && _tecCargoLabel[t.cargo]) || t.cargo || "",
        // Abre a tela já com a pessoa no painel (admin-colab-lista.js, 20/11/2026).
        extra: `${t.email || ""} ${t.telefone || ""}`, abrir: () => { if (window.GBColab) window.GBColab.abrir(t.id); else showSection("tecnicos"); } });
    }
    // Telas e ações: só as que o perfil vê.
    const vis = s => typeof _navSecaoVisivel !== "function" || _navSecaoVisivel(s);
    for (const item of (typeof _NAV_GRUPOS !== "undefined" ? _NAV_GRUPOS : [])) {
      const s = item.membros.find(([x]) => vis(x))?.[0];
      if (s) out.push({ g: "Ir para", ic: item.icone, t: item.rotulo, s: "", abrir: () => showSection(s), tela: true });
    }
    for (const [s, n, ic] of (typeof _NAV_USUARIO !== "undefined" ? _NAV_USUARIO : [])) {
      if (vis(s)) out.push({ g: "Ir para", ic, t: n, s: "", abrir: () => showSection(s), tela: true });
    }
    if (vis("chamados") && document.getElementById("btnNovoChamado"))
      out.push({ g: "Ações", ic: "plus", t: "Novo chamado", s: "", abrir: () => document.getElementById("btnNovoChamado").click(), acao: true });
    if (vis("orcamentos") && typeof _avAcao === "function")
      out.push({ g: "Ações", ic: "plus", t: "Novo orçamento", s: "", abrir: () => { showSection("orcamentos"); setTimeout(() => _avAcao("novo"), 60); }, acao: true });
    if (vis("cadastros"))
      out.push({ g: "Ações", ic: "plus", t: "Novo condomínio", s: "", abrir: () => { showSection("cadastros"); setTimeout(() => document.querySelector('[data-action="novo-cliente"]')?.click(), 60); }, acao: true });
    return out;
  }

  function desenhar() {
    const q = norm(campo.value.trim());
    const todos = indice();
    if (!q) {
      // Sem texto: ações, chamados em aberto mais recentes, e as telas.
      const recentes = todos.filter(i => i.g === "Chamados" && i.aberto)
        .sort((a, b) => new Date(b.recente || 0) - new Date(a.recente || 0)).slice(0, 4)
        .map(i => ({ ...i, g: "Chamados em aberto" }));
      resultados = [...todos.filter(i => i.acao), ...recentes, ...todos.filter(i => i.tela)];
    } else {
      const termos = q.split(/\s+/);
      resultados = todos
        .map(i => {
          const alvo = norm(`${i.t} ${i.s} ${i.extra || ""}`);
          if (!termos.every(t => alvo.includes(t))) return null;
          const tt = norm(i.t);
          const nota = tt.startsWith(q) ? 0 : tt.includes(q) ? 1 : 2;
          return { ...i, nota };
        })
        .filter(Boolean)
        .sort((a, b) => a.nota - b.nota);
      // No máximo 6 por grupo, 40 no total: a paleta é para ir, não para listar.
      const porGrupo = {};
      resultados = resultados.filter(i => (porGrupo[i.g] = (porGrupo[i.g] || 0) + 1) <= 6).slice(0, 40);
      // Mantém os grupos juntos, na ordem em que o primeiro de cada apareceu.
      const ordem = [...new Set(resultados.map(i => i.g))];
      resultados.sort((a, b) => ordem.indexOf(a.g) - ordem.indexOf(b.g));
    }
    sel = 0;
    if (!resultados.length) {
      lista.innerHTML = `<div class="gb-cmdk-nada"><b>Nada encontrado para “${esc(campo.value)}”.</b>
        <span>A busca olha condomínios, reservatórios, chamados, O.S., orçamentos e pessoas.</span></div>`;
      return;
    }
    const realce = (t) => {
      if (!q) return esc(t);
      const i = norm(t).indexOf(q);
      if (i < 0) return esc(t);
      return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length));
    };
    let g = "", html = "";
    resultados.forEach((it, i) => {
      if (it.g !== g) { g = it.g; html += `<div class="gb-cmdk-g" role="presentation">${esc(g)}</div>`; }
      html += `<div class="gb-cmdk-it${i === 0 ? " is-on" : ""}" role="option" id="gbCmdk${i}" aria-selected="${i === 0}" data-i="${i}">
        ${ico(it.ic)}<span>${realce(it.t)}</span>${it.s ? `<small>${esc(it.s)}</small>` : ""}</div>`;
    });
    lista.innerHTML = html;
    campo.setAttribute("aria-activedescendant", "gbCmdk0");
    window.lucide?.createIcons?.({ root: lista });
  }

  function marcar(i, rolar = true) {
    sel = i;
    lista.querySelectorAll("[data-i]").forEach(el => {
      const on = Number(el.dataset.i) === i;
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-selected", String(on));
    });
    campo.setAttribute("aria-activedescendant", `gbCmdk${i}`);
    if (rolar) lista.querySelector(".is-on")?.scrollIntoView({ block: "nearest" });
  }

  function ir(i) {
    const it = resultados[i];
    if (!it) return;
    fechar(false);
    try { it.abrir(); } catch (e) { console.error("Busca: não abriu", e); }
  }

  function abrir() {
    montar();
    voltarFoco = document.activeElement;
    veu.hidden = false;
    document.body.classList.add("gb-cmdk-aberta");
    campo.value = "";
    desenhar();
    campo.focus();
  }

  function fechar(devolverFoco = true) {
    if (!veu || veu.hidden) return;
    veu.hidden = true;
    document.body.classList.remove("gb-cmdk-aberta");
    if (devolverFoco && voltarFoco?.focus) voltarFoco.focus();
  }

  window.gbBuscaAbrir = abrir;

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (veu && !veu.hidden) fechar(); else abrir();
    }
  }, true);

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-busca-abrir]")) { e.preventDefault(); abrir(); }
  });

  // O campo antigo do topo vira um botão que abre a paleta.
  document.addEventListener("DOMContentLoaded", () => {
    const antigo = document.querySelector(".content-header .topbar-search");
    if (!antigo || antigo.dataset.gbTrocado) return;
    antigo.dataset.gbTrocado = "1";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gb-topo-busca";
    b.dataset.buscaAbrir = "";
    b.innerHTML = `${ico("search")}<span>Buscar condomínio, chamado, O.S…</span><kbd>Ctrl K</kbd>`;
    antigo.after(b);
    antigo.hidden = true;
    window.lucide?.createIcons?.({ root: b });
  });
})();
