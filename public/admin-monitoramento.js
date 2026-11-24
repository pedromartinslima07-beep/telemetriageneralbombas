// ============================================================
// MONITORAMENTO — uma tela só (redesenho estrutural, etapa 2, 19/11/2026)
// ============================================================
//
// Junta o que estava em quatro telas: Telemetria (os reservatórios), Mapa (os
// prédios no mapa e os técnicos), Alertas (os de telemetria) e o lado ao vivo
// do Painel. É o mesmo dado (`_statusData` e `_alertasAbertos`) desenhado UMA
// vez: lista ou mapa, filtro em chip, e o reservatório escolhido no painel ao
// lado, com o gráfico, os alertas abertos e o histórico.
//
// Nenhuma regra nova: faixas iguais ao backend (baixo < 45 %, crítico < 20 %),
// "sem sinal" = `offline` que vem do /admin/status. Fechar alerta usa a mesma
// rota de sempre (PATCH /alertas/:id/fechar).
//
// ⚠️ As telas antigas (telemetria, mapa, alertas, dashboard) continuam no HTML
// e alcançáveis: o "Histórico completo e PDF" abre o modal da Telemetria, e
// "Comentários e análise" abre o alerta na tela Alertas, que é quem tem essas
// duas funções. Chamado que vira alerta (P1/P2, fora do prazo) é do
// Atendimento, não daqui.
//
// Roda depois do admin.js (lê os globais dele).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });

  const st = {
    modo: "lista",          // lista | mapa
    filtro: "atencao",      // atencao | mudo | baixo | todos
    condo: "",              // id do condomínio ("" = todos)
    busca: "",
    sel: null,              // id do reservatório escolhido
    horas: 24,
    hist: new Map(),        // `${device}:${horas}` → { ts, pontos } | { erro }
    histAlertas: new Map(), // device → { ts, itens } | { erro }
    mapa: null, camada: null,
    painelAberto: false,    // celular: o painel cobre a lista
  };

  // ===== DADOS =====
  function reservatorios() {
    const out = [];
    for (const g of (typeof _statusData !== "undefined" && Array.isArray(_statusData) ? _statusData : [])) {
      for (const r of (g.reservatorios || [])) {
        const pct = r.ultima_leitura?.nivel_pct;
        const nivel = pct != null ? Math.round(Number(pct)) : null;
        let sit = "ok", motivo = "Normal";
        if (r.offline) { sit = "mudo"; motivo = "Sem sinal"; }
        else if (nivel == null) { sit = "mudo"; motivo = "Sem leitura"; }
        else if (nivel < 20) { sit = "ri"; motivo = "Nível crítico"; }
        else if (nivel < 45) { sit = "at"; motivo = "Nível baixo"; }
        out.push({
          ...r, nivel, sit, motivo,
          condoId: g.condominio?.id,
          condoNome: g.condominio?.nome_fantasia || g.condominio?.nome || "Condomínio",
          bairro: [g.condominio?.bairro, g.condominio?.cidade].filter(Boolean).join(" · "),
          lat: g.condominio?.lat, lng: g.condominio?.lng,
        });
      }
    }
    return out;
  }
  const PESO = { mudo: 0, ri: 0, at: 1, ok: 2 };
  const FILTROS = [
    ["atencao", "Pede atenção", r => r.sit !== "ok"],
    ["mudo", "Sem sinal", r => r.sit === "mudo", "cz"],
    ["baixo", "Nível baixo ou crítico", r => r.sit === "ri" || r.sit === "at", "at"],
    ["todos", "Todos", () => true],
  ];
  function filtrados(lista) {
    const f = FILTROS.find(x => x[0] === st.filtro)[2];
    const q = norm(st.busca.trim());
    return lista
      .filter(f)
      .filter(r => !st.condo || String(r.condoId) === String(st.condo))
      .filter(r => !q || norm(`${r.condoNome} ${r.nome} ${r.device_id} ${r.bairro}`).includes(q))
      .sort((a, b) => PESO[a.sit] - PESO[b.sit] || (a.nivel ?? 999) - (b.nivel ?? 999) || a.condoNome.localeCompare(b.condoNome));
  }
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const alertasDe = device => (typeof _alertasAbertos !== "undefined" ? _alertasAbertos || [] : []).filter(a => a.device_id === device);

  function rel(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "agora";
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400);
    if (d <= 30) return `há ${d} dia${d === 1 ? "" : "s"}`;
    return "em " + new Date(iso).toLocaleDateString("pt-BR");
  }
  const TIPO_ALERTA = {
    dispositivo_offline: "Sem sinal", nivel_baixo: "Nível baixo", nivel_muito_baixo: "Nível muito baixo",
    extravasamento: "Extravasamento",
    bomba_desligada: "Bomba parada", bomba_ligada_continuo: "Bomba ligada sem parar",
  };
  const tipoAlerta = t => TIPO_ALERTA[t] || String(t || "Alerta").replaceAll("_", " ");
  const corNivel = n => (n == null ? "#a9b2c9" : n < 20 ? "var(--mn-ri)" : n < 45 ? "var(--mn-at)" : "var(--mn-ok)");
  const selo = r => `<span class="mn-selo is-${r.sit}">${esc(r.motivo)}</span>`;
  const bomba = r => {
    const b = r.ultima_leitura?.bomba_ligada;
    if (r.offline || b == null) return `<span class="mn-mudo">—</span>`;
    return b ? `<span class="mn-bomba is-on"><i></i>ligada</span>` : `<span class="mn-bomba"><i></i>desligada</span>`;
  };

  // ===== TELA =====
  function render() {
    const root = document.getElementById("monRoot");
    if (!root) return;
    const todos = reservatorios();
    const carregando = typeof _statusData === "undefined" || !Array.isArray(_statusData) || !_statusData.length;
    const conds = [...new Map(todos.map(r => [r.condoId, r.condoNome])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const btnNovo = document.getElementById("btnNovoReservatorio");
    const podeNovo = btnNovo && btnNovo.style.display !== "none";

    root.innerHTML = `
      <header class="mn-cab">
        <span class="mn-vivo" id="monVivo"><i></i><span>Ao vivo</span></span>
        <span class="mn-resumo" id="monResumo"></span>
        <span class="mn-esp"></span>
        <div class="mn-seg" role="group" aria-label="Modo de ver">
          <button type="button" data-mn-modo="lista" class="${st.modo === "lista" ? "is-on" : ""}" aria-pressed="${st.modo === "lista"}">${ico("list")}Lista</button>
          <button type="button" data-mn-modo="mapa" class="${st.modo === "mapa" ? "is-on" : ""}" aria-pressed="${st.modo === "mapa"}">${ico("map")}Mapa</button>
        </div>
        ${podeNovo ? `<button type="button" class="mn-bt" data-mn-novo>${ico("plus")}Reservatório</button>` : ""}
      </header>
      <div class="mn-barra">
        <div class="mn-chips" id="monChips" role="group" aria-label="Filtrar"></div>
        <span class="mn-esp"></span>
        <select class="mn-select" id="monCondo" aria-label="Condomínio">
          <option value="">Todos os condomínios</option>
          ${conds.map(([id, n]) => `<option value="${id}" ${String(st.condo) === String(id) ? "selected" : ""}>${esc(n)}</option>`).join("")}
        </select>
        <label class="mn-busca">${ico("search")}<input type="search" id="monBusca" placeholder="Prédio, reservatório ou aparelho" value="${esc(st.busca)}"></label>
      </div>
      <div class="mn-corpo${st.painelAberto ? " com-painel" : ""}" id="monCorpo">
        <div class="mn-lista" id="monLista">${carregando ? esqueleto() : ""}</div>
        <aside class="mn-lado" id="monLado" aria-label="Reservatório escolhido"></aside>
      </div>`;
    icones(root);
    if (!carregando) { desenharLista(); desenharLado(true); }
  }

  function esqueleto() {
    return `<div class="mn-esq" aria-busy="true" aria-label="Carregando">${Array.from({ length: 6 }, () =>
      `<div class="mn-esq-l"><i></i><i></i><i></i></div>`).join("")}</div>`;
  }

  // Partes que o polling redesenha (sem refazer o gráfico nem o mapa).
  function desenharLista() {
    const todos = reservatorios();
    const lista = filtrados(todos);
    const chips = document.getElementById("monChips");
    if (chips) {
      chips.innerHTML = FILTROS.map(([k, n, f, pt]) => {
        const c = todos.filter(f).filter(r => !st.condo || String(r.condoId) === String(st.condo)).length;
        return `<button type="button" class="mn-chip${st.filtro === k ? " is-on" : ""}" data-mn-f="${k}" aria-pressed="${st.filtro === k}">${pt ? `<i class="mn-pt is-${pt}"></i>` : ""}${n}<span>${c}</span></button>`;
      }).join("");
    }
    const mudos = todos.filter(r => r.sit === "mudo").length;
    const baixos = todos.filter(r => r.sit === "ri" || r.sit === "at").length;
    const resumo = document.getElementById("monResumo");
    if (resumo) resumo.innerHTML = todos.length
      ? `<b>${todos.length - mudos - baixos} de ${todos.length}</b> normais${baixos ? ` · <b>${baixos}</b> com nível baixo` : ""}${mudos ? ` · <b>${mudos}</b> sem sinal` : ""}`
      : "";
    const vivo = document.getElementById("monVivo");
    if (vivo) vivo.querySelector("span").textContent = `Ao vivo · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

    // Sem escolha ainda: o primeiro que pede atenção (no desktop).
    if (st.sel == null && lista.length && !matchMedia("(max-width: 900px)").matches) st.sel = lista[0].id;

    if (st.modo === "mapa") { desenharMapa(lista); return; }
    const alvo = document.getElementById("monLista");
    if (!alvo) return;
    if (!todos.length) {
      alvo.innerHTML = `<div class="mn-vazio">${ico("radio-tower")}<b>Nenhum reservatório monitorado ainda.</b>
        <span>Quando um aparelho for instalado e cadastrado, ele aparece aqui com o nível ao vivo.</span></div>`;
      icones(alvo); return;
    }
    if (!lista.length) {
      const bom = st.filtro !== "todos" && !st.busca && !st.condo;
      alvo.innerHTML = `<div class="mn-vazio">${ico(bom ? "circle-check" : "search")}<b>${bom ? "Nada pedindo atenção agora." : "Nenhum reservatório com esse filtro."}</b>
        <span>${bom ? "Todos os reservatórios estão com sinal e acima de 45%." : "Mude o filtro ou a busca."}</span>
        ${bom ? "" : `<button type="button" class="mn-bt" data-mn-limpar>Limpar filtros</button>`}</div>`;
      icones(alvo); return;
    }
    alvo.innerHTML = `
      <table class="mn-tab">
        <thead><tr><th>Reservatório</th><th>Nível</th><th class="mn-om">Bomba</th><th class="mn-om">Último sinal</th><th>Situação</th></tr></thead>
        <tbody>${lista.map(r => {
          const al = r.alertas_abertos_count || 0;
          return `<tr data-mn-res="${r.id}" tabindex="0" class="${r.id === st.sel ? "is-sel" : ""}${r.sit !== "ok" ? " is-" + r.sit : ""}" aria-selected="${r.id === st.sel}">
            <td><b>${esc(r.condoNome)}</b><span class="mn-sub">${esc(r.nome || r.device_id)}${r.bairro ? " · " + esc(r.bairro) : ""}</span></td>
            <td class="mn-c-nivel">${r.nivel == null ? `<span class="mn-mudo">sem leitura</span>`
              : `<span class="mn-nivel${r.offline ? " is-velho" : ""}"><span class="mn-nivel-barra"><i style="width:${Math.max(2, r.nivel)}%;background:${corNivel(r.offline ? null : r.nivel)}"></i></span><b>${r.nivel}%</b></span>`}</td>
            <td class="mn-om">${bomba(r)}</td>
            <td class="mn-om"><span class="${r.offline ? "mn-sinal-mudo" : "mn-sub0"}">${r.ultima_leitura?.criado_em ? rel(r.ultima_leitura.criado_em) : "nunca"}</span></td>
            <td class="mn-c-sit">${selo(r)}${al ? `<span class="mn-al">${al} alerta${al === 1 ? "" : "s"}</span>` : ""}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  }

  function desenharMapa(lista) {
    const alvo = document.getElementById("monLista");
    if (!alvo || typeof L === "undefined") return;
    if (!st.mapa || !document.getElementById("monMapa")) {
      alvo.innerHTML = `<div class="mn-mapa-wrap"><div id="monMapa" class="mn-mapa"></div><div class="mn-mapa-nota" id="monMapaNota" hidden></div>
        <div class="mn-legenda"><span><i class="mn-pt is-ok"></i>normal</span><span><i class="mn-pt is-at"></i>baixo</span><span><i class="mn-pt is-ri"></i>crítico</span><span><i class="mn-pt is-cz"></i>sem sinal</span><span><i class="mn-pin-tec-leg">T</i>técnico</span></div></div>`;
      st.mapa = L.map("monMapa", { zoomControl: true }).setView([-23.55, -46.64], 11);
      const url = typeof TILE_URL !== "undefined" ? TILE_URL : "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
      L.tileLayer(url, { maxZoom: 19, attribution: typeof TILE_ATTR !== "undefined" ? TILE_ATTR : "© Esri · © OpenStreetMap" }).addTo(st.mapa);
      st.camada = L.layerGroup().addTo(st.mapa);
      st.primeiroAjuste = true;
      setTimeout(() => st.mapa?.invalidateSize(), 60);
    }
    st.camada.clearLayers();
    // Um pino por prédio, na cor do pior reservatório dele.
    const porCondo = new Map();
    for (const r of lista) {
      const atual = porCondo.get(r.condoId);
      if (!atual || PESO[r.sit] < PESO[atual.sit]) porCondo.set(r.condoId, r);
    }
    const cor = { ok: "#1f9d57", at: "#d99411", ri: "#d23a2c", mudo: "#8a94ad" };
    const pontos = [];
    let semLocal = 0;
    porCondo.forEach(r => {
      if (!Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)) || r.lat == null) { semLocal++; return; }
      const ll = [Number(r.lat), Number(r.lng)];
      pontos.push(ll);
      const sel = lista.some(x => x.id === st.sel && x.condoId === r.condoId);
      const m = L.marker(ll, {
        icon: L.divIcon({ className: "", html: `<span class="mn-pino${sel ? " is-sel" : ""}" style="background:${cor[r.sit]}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
        title: r.condoNome, keyboard: true,
      }).addTo(st.camada);
      m.bindTooltip(`<b>${esc(r.condoNome)}</b><br>${esc(r.motivo)}${r.nivel != null ? " · " + r.nivel + "%" : ""}`, { direction: "top", offset: [0, -8] });
      m.on("click", () => escolher(r.id));
    });
    for (const t of (typeof _tecLocs !== "undefined" && Array.isArray(_tecLocs) ? _tecLocs : [])) {
      const lat = Number(t.lat), lng = Number(t.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const ini = String(t.nome || "T").split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
      L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<span class="mn-pino-tec">${esc(ini)}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })
        .addTo(st.camada).bindTooltip(`${esc(t.nome || "Técnico")} · visto ${rel(t.capturada_em)}`, { direction: "top" });
    }
    const nota = document.getElementById("monMapaNota");
    if (nota) {
      nota.hidden = !semLocal;
      nota.textContent = `${semLocal} ${semLocal === 1 ? "prédio sem localização cadastrada não aparece" : "prédios sem localização cadastrada não aparecem"} no mapa.`;
    }
    if (st.primeiroAjuste && pontos.length) {
      st.mapa.fitBounds(pontos, { padding: [40, 40], maxZoom: 14 });
      st.primeiroAjuste = false;
    }
  }

  // ===== PAINEL DO RESERVATÓRIO =====
  function desenharLado(completo) {
    const lado = document.getElementById("monLado");
    if (!lado) return;
    const r = reservatorios().find(x => x.id === st.sel);
    if (!r) {
      lado.innerHTML = `<div class="mn-lado-vazio">${ico("mouse-pointer-click")}<b>Escolha um reservatório</b><span>O nível das últimas horas, os alertas e o histórico aparecem aqui.</span></div>`;
      icones(lado); return;
    }
    const abertos = alertasDe(r.device_id);
    const cabeca = `
      <div class="mn-l-cab">
        <button type="button" class="mn-voltar" data-mn-voltar>${ico("arrow-left")}Lista</button>
        <button type="button" class="mn-l-predio" data-mn-predio="${r.condoId}">${ico("building-2")}${esc(r.condoNome)}${ico("chevron-right")}</button>
        <h2>${esc(r.nome || r.device_id)}</h2>
        <div class="mn-l-leitura">
          <span class="mn-l-pct" style="color:${r.offline || r.nivel == null ? "var(--muted)" : "inherit"}">${r.nivel == null ? "—" : r.nivel + "%"}</span>
          ${selo(r)}
          <span class="mn-l-quando">${r.ultima_leitura?.criado_em ? (r.offline ? "última leitura " : "leitura ") + rel(r.ultima_leitura.criado_em) : "nunca enviou leitura"}</span>
        </div>
        <div class="mn-l-acoes">
          <button type="button" class="mn-bt is-pri" data-mn-chamado="${r.condoId}">${ico("plus")}Abrir chamado</button>
          <button type="button" class="mn-bt" data-mn-hist-completo="${r.condoId}:${r.id}">${ico("history")}Histórico e PDF</button>
        </div>
      </div>`;
    if (!completo && lado.dataset.res === String(r.id)) {
      // Polling: troca só a cabeça e os alertas; o gráfico fica.
      lado.querySelector(".mn-l-cab").outerHTML = cabeca;
      const sec = lado.querySelector("[data-mn-sec-alertas]");
      if (sec) sec.outerHTML = secAlertas(r, abertos);
      icones(lado);
      return;
    }
    lado.dataset.res = String(r.id);
    lado.innerHTML = `${cabeca}
      <section class="mn-l-sec">
        <h3>Nível
          <span class="mn-seg mn-seg-p" role="group" aria-label="Período">
            ${[[24, "24 h"], [168, "7 dias"], [720, "30 dias"]].map(([h, n]) => `<button type="button" data-mn-horas="${h}" class="${st.horas === h ? "is-on" : ""}">${n}</button>`).join("")}
          </span>
        </h3>
        <div class="mn-graf" id="monGraf"><div class="mn-graf-esq"></div></div>
      </section>
      ${secAlertas(r, abertos)}
      <section class="mn-l-sec">
        <h3>Aparelho</h3>
        <dl class="mn-fatos">
          <div><dt>Código</dt><dd class="mn-mono">${esc(r.device_id || "—")}</dd></div>
          <div><dt>Tipo</dt><dd>${esc(r.tipo === "caixa" ? "Caixa d'água" : r.tipo === "cisterna" ? "Cisterna" : r.tipo || "—")}</dd></div>
          <div><dt>Bomba</dt><dd>${bomba(r)}</dd></div>
          <div><dt>Sem atualizar</dt><dd>${r.minutos_sem_atualizar == null ? "nunca atualizou" : r.minutos_sem_atualizar < 60 ? r.minutos_sem_atualizar + " min" : rel(new Date(Date.now() - r.minutos_sem_atualizar * 60000).toISOString()).replace(/^há /, "").replace(/^em /, "desde ")}</dd></div>
        </dl>
      </section>
      <section class="mn-l-sec" id="monHistAl"><h3>Histórico de alertas</h3><div class="mn-graf-esq is-baixo"></div></section>`;
    icones(lado);
    carregarGrafico(r);
    carregarHistAlertas(r);
  }

  function secAlertas(r, abertos) {
    return `<section class="mn-l-sec" data-mn-sec-alertas>
      <h3>Alertas abertos <span class="mn-n">${abertos.length}</span></h3>
      ${abertos.length ? abertos.map(a => `
        <div class="mn-alerta">
          <i class="mn-pt is-${a.tipo === "dispositivo_offline" ? "cz" : a.tipo === "nivel_muito_baixo" ? "ri" : "at"}"></i>
          <div><b>${esc(tipoAlerta(a.tipo))}</b><small>aberto ${rel(a.criado_em)}</small></div>
          <div class="mn-alerta-acoes">
            <button type="button" class="mn-bt is-p" data-mn-resolver="${a.id}">Resolver</button>
            <button type="button" class="mn-bt is-p is-ghost" data-mn-comentar="${a.id}" title="Comentários e análise por IA">${ico("message-square")}</button>
          </div>
        </div>`).join("")
        : `<p class="mn-nada">Nenhum alerta aberto. Faixas: baixo abaixo de 45%, crítico abaixo de 20%.</p>`}
    </section>`;
  }

  async function carregarGrafico(r) {
    const alvo = document.getElementById("monGraf");
    if (!alvo) return;
    const chave = `${r.device_id}:${st.horas}`;
    let c = st.hist.get(chave);
    if (!c || c.erro || Date.now() - c.ts > 60000) {
      alvo.innerHTML = `<div class="mn-graf-esq"></div>`;
      try {
        const resp = await fetch(`/admin/historico?device_ids=${encodeURIComponent(r.device_id)}&horas=${st.horas}`, { headers: authHeaders() });
        if (!resp.ok) throw new Error(String(resp.status));
        const j = await resp.json();
        c = { ts: Date.now(), pontos: (j[r.device_id] || []).map(p => ({ t: new Date(p.bucket).getTime(), v: p.nivel_pct_avg })).filter(p => p.v != null) };
      } catch (e) {
        c = { erro: true, ts: Date.now() };
      }
      st.hist.set(chave, c);
    }
    const agora = document.getElementById("monGraf");
    if (!agora || document.getElementById("monLado")?.dataset.res !== String(r.id)) return; // trocou de reservatório no meio
    if (c.erro) {
      agora.innerHTML = `<div class="mn-graf-msg">Não consegui carregar o histórico. <button type="button" class="mn-link" data-mn-graf-tentar>Tentar de novo</button></div>`;
      return;
    }
    if (c.pontos.length < 2) {
      agora.innerHTML = `<div class="mn-graf-msg">Sem leituras nas últimas ${st.horas === 24 ? "24 horas" : st.horas === 168 ? "semana" : "30 dias"}.</div>`;
      return;
    }
    agora.innerHTML = svgGrafico(c.pontos);
  }

  function svgGrafico(pts) {
    const W = 360, H = 160, pl = 28, pr = 8, pt = 8, pb = 20;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    const x = t => pl + ((t - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
    const y = v => pt + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - pt - pb);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${d}L${x(pts[pts.length - 1].t).toFixed(1)},${y(0)}L${x(pts[0].t).toFixed(1)},${y(0)}Z`;
    const ult = pts[pts.length - 1];
    const fmt = t => {
      const dt = new Date(t);
      return st.horas <= 24 ? dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    };
    const min = Math.round(Math.min(...pts.map(p => p.v))), max = Math.round(Math.max(...pts.map(p => p.v)));
    return `<svg class="mn-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Nível no período: mínimo ${min}%, máximo ${max}%, agora ${Math.round(ult.v)}%">
      <rect x="${pl}" y="${y(45)}" width="${W - pl - pr}" height="${y(20) - y(45)}" fill="rgba(217,148,17,.09)"/>
      <rect x="${pl}" y="${y(20)}" width="${W - pl - pr}" height="${y(0) - y(20)}" fill="rgba(210,58,44,.08)"/>
      ${[0, 20, 45, 100].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(6,16,51,${v === 20 || v === 45 ? ".22" : ".1"})" ${v === 20 || v === 45 ? 'stroke-dasharray="3 3"' : ""} vector-effect="non-scaling-stroke"/>
        <text x="${pl - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("")}
      <path d="${area}" fill="rgba(13,39,117,.08)"/>
      <path d="${d}" fill="none" stroke="#0d2775" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(ult.t)}" cy="${y(ult.v)}" r="3.5" fill="${corNivel(ult.v).startsWith("var") ? (ult.v < 20 ? "#d23a2c" : ult.v < 45 ? "#d99411" : "#1f9d57") : "#a9b2c9"}" stroke="#fff" stroke-width="1.5"/>
      <text x="${pl}" y="${H - 5}">${fmt(t0)}</text><text x="${W - pr}" y="${H - 5}" text-anchor="end">${fmt(t1)}</text>
    </svg>
    <p class="mn-graf-rodape">Mínimo <b>${min}%</b> · máximo <b>${max}%</b> no período</p>`;
  }

  async function carregarHistAlertas(r) {
    const alvo = document.getElementById("monHistAl");
    if (!alvo) return;
    let c = st.histAlertas.get(r.device_id);
    if (!c || c.erro || Date.now() - c.ts > 60000) {
      try {
        const resp = await fetch(`/alertas/${encodeURIComponent(r.device_id)}`, { headers: authHeaders() });
        if (!resp.ok) throw new Error(String(resp.status));
        c = { ts: Date.now(), itens: await resp.json() };
      } catch (e) { c = { erro: true, ts: Date.now() }; }
      st.histAlertas.set(r.device_id, c);
    }
    const agora = document.getElementById("monHistAl");
    if (!agora || document.getElementById("monLado")?.dataset.res !== String(r.id)) return;
    const fechados = c.erro ? [] : c.itens.filter(a => a.status !== "aberto").slice(0, 8);
    agora.innerHTML = `<h3>Histórico de alertas</h3>${c.erro ? `<p class="mn-nada">Não consegui carregar o histórico de alertas.</p>`
      : fechados.length ? `<ul class="mn-hist">${fechados.map(a => {
          const dur = a.atualizado_em && a.criado_em ? Math.max(0, (new Date(a.atualizado_em) - new Date(a.criado_em)) / 60000) : null;
          const durTxt = dur == null ? "" : dur < 60 ? `${Math.round(dur)} min` : dur < 1440 ? `${Math.round(dur / 60)} h` : `${Math.round(dur / 1440)} dias`;
          return `<li><i class="mn-pt is-cz"></i><span>${esc(tipoAlerta(a.tipo))}<small>${new Date(a.criado_em).toLocaleDateString("pt-BR")}${durTxt ? " · resolvido em " + durTxt : ""}</small></span></li>`;
        }).join("")}</ul>`
      : `<p class="mn-nada">Nenhum alerta resolvido neste aparelho.</p>`}`;
  }

  function escolher(id) {
    st.sel = id;
    st.painelAberto = true;
    history.replaceState(null, "", `#/monitoramento/${id}`);
    document.querySelectorAll("[data-mn-res]").forEach(tr => {
      const on = Number(tr.dataset.mnRes) === id;
      tr.classList.toggle("is-sel", on);
      tr.setAttribute("aria-selected", String(on));
    });
    document.getElementById("monCorpo")?.classList.add("com-painel");
    if (st.modo === "mapa") desenharMapa(filtrados(reservatorios()));
    desenharLado(true);
  }

  function ativa() { return document.querySelector('.section[data-section="monitoramento"]')?.classList.contains("is-active"); }

  // ===== EVENTOS =====
  document.addEventListener("click", async (e) => {
    const sec = e.target.closest('.section[data-section="monitoramento"]');
    if (!sec) return;
    const t = e.target;
    let el;
    if ((el = t.closest("[data-mn-modo]"))) {
      if (st.modo === el.dataset.mnModo) return;
      st.modo = el.dataset.mnModo;
      if (st.mapa) { st.mapa.remove(); st.mapa = null; }
      render();
      return;
    }
    if ((el = t.closest("[data-mn-f]"))) { st.filtro = el.dataset.mnF; desenharLista(); icones(document.getElementById("monRoot")); return; }
    if (t.closest("[data-mn-limpar]")) { st.filtro = "todos"; st.busca = ""; st.condo = ""; render(); return; }
    if ((el = t.closest("[data-mn-res]"))) { escolher(Number(el.dataset.mnRes)); return; }
    if (t.closest("[data-mn-voltar]")) { st.painelAberto = false; document.getElementById("monCorpo")?.classList.remove("com-painel"); return; }
    if ((el = t.closest("[data-mn-predio]"))) { abrirFichaCondominio(Number(el.dataset.mnPredio), "telemetria"); return; }
    if ((el = t.closest("[data-mn-horas]"))) {
      st.horas = Number(el.dataset.mnHoras);
      el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("is-on", b === el));
      const r = reservatorios().find(x => x.id === st.sel);
      if (r) carregarGrafico(r);
      return;
    }
    if (t.closest("[data-mn-graf-tentar]")) { const r = reservatorios().find(x => x.id === st.sel); if (r) { st.hist.delete(`${r.device_id}:${st.horas}`); carregarGrafico(r); } return; }
    if ((el = t.closest("[data-mn-hist-completo]"))) {
      const [c, r] = el.dataset.mnHistCompleto.split(":");
      if (typeof _telSelecionarNoHistorico === "function") _telSelecionarNoHistorico(c, r);
      return;
    }
    if ((el = t.closest("[data-mn-chamado]"))) {
      const btn = document.getElementById("btnNovoChamado");
      if (!btn) { showSection("chamados"); return; }
      btn.click();
      window.CondoPicker?.montar({ campo: "ncCondo", itens: (typeof _condominios !== "undefined" ? _condominios : []) })?.definir(Number(el.dataset.mnChamado));
      return;
    }
    if ((el = t.closest("[data-mn-resolver]"))) {
      const id = Number(el.dataset.mnResolver);
      if (!confirm("Marcar este alerta como resolvido?")) return;
      el.disabled = true;
      el.textContent = "Resolvendo…";
      try {
        const r = await fetch(`/alertas/${id}/fechar`, { method: "PATCH", headers: authHeaders() });
        if (!r.ok) throw new Error(await r.text());
        const rs = reservatorios().find(x => x.id === st.sel);
        if (rs) st.histAlertas.delete(rs.device_id);
        await carregarTelemetria();
      } catch (err) {
        el.disabled = false;
        el.textContent = "Resolver";
        alert("Não consegui resolver o alerta. Tente de novo.");
      }
      return;
    }
    if ((el = t.closest("[data-mn-comentar]"))) {
      showSection("alertas");
      if (typeof _alSelecionadoKey !== "undefined") {
        _alSelecionadoKey = `al-${el.dataset.mnComentar}`;
        if (typeof renderAlertas === "function") renderAlertas();
      }
      return;
    }
    if (t.closest("[data-mn-novo]")) { document.getElementById("btnNovoReservatorio")?.click(); return; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("[data-mn-res]")) { e.preventDefault(); e.target.click(); }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.matches?.("[data-mn-res]")) {
      e.preventDefault();
      const prox = e.key === "ArrowDown" ? e.target.nextElementSibling : e.target.previousElementSibling;
      if (prox) { prox.focus(); prox.click(); }
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "monBusca") { st.busca = e.target.value; desenharLista(); icones(document.getElementById("monLista")); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "monCondo") { st.condo = e.target.value; st.primeiroAjuste = true; desenharLista(); icones(document.getElementById("monLista")); }
  });

  // ===== GANCHOS =====
  // Abrir a tela desenha; o polling da telemetria (7 s) redesenha a lista e a
  // cabeça do painel, sem refazer o gráfico.
  (function () {
    const origShow = window.showSection;
    window.showSection = function (name, ...resto) {
      // Lido ANTES: o showSection reescreve o endereço para "#/monitoramento"
      // e o F5 em "#/monitoramento/5" perderia o reservatório.
      const partes = location.hash.replace(/^#\/?/, "").split("/");
      const id = partes[0] === "monitoramento" ? Number(partes[1]) : NaN;
      const r = origShow.call(this, name, ...resto);
      if (name === "monitoramento") {
        if (Number.isInteger(id) && id > 0) { st.sel = id; st.painelAberto = true; }
        render();
        if (st.sel != null) history.replaceState(null, "", `#/monitoramento/${st.sel}`);
      } else if (st.mapa) {
        st.mapa.remove(); st.mapa = null;
      }
      return r;
    };
    // carregarTudo é a carga do boot (e do botão Atualizar); carregarTelemetria
    // é o polling. Os dois trazem o _statusData.
    for (const nome of ["carregarTudo", "carregarTelemetria"]) {
      const orig = window[nome];
      if (typeof orig !== "function") continue;
      window[nome] = function (...a) {
        const p = orig.apply(this, a);
        Promise.resolve(p).then(() => {
          if (!ativa()) return;
          if (!document.querySelector("#monLista .mn-tab, #monLista .mn-mapa-wrap, #monLista .mn-vazio")) { render(); return; }
          desenharLista(); desenharLado(false); icones(document.getElementById("monRoot"));
        });
        return p;
      };
    }
  })();

  // Celular/janela: o mapa mede o contêiner.
  window.addEventListener("resize", () => { if (st.mapa) st.mapa.invalidateSize(); });

  window.gbMonEscolher = (id) => { showSection("monitoramento"); escolher(Number(id)); };
})();
