// ============================================================
// O MOLDE DE LISTA (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A peça que a maquete chama de lista() (public/_redesenho-preview-2.js),
// agora de verdade. Toda lista que falta no redesenho (O.S., Orçamentos,
// Preventivas, Equipamentos, Colaboradores) é UMA configuração deste molde:
//
//   cabeçalho (título · frase · uma ação primária)
//   → barra (visões em chip com contador · busca · Exportar)
//   → tabela (seleção em lote · ordem pela coluna · paginação)
//   → o item escolhido no painel ao lado.
//
// Quem usa: GBLista.criar({ id, raiz, ... }) devolve { desenhar, desenharLado,
// selecionar, estado }. Os dados continuam morando onde já moravam (as `let`
// do admin.js); o molde só lê pela função `dados()` da configuração.
//
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md): uma crase num
// comentário HTML fecha a string e vira "X is not a function" em runtime.
//
// Estados que toda lista tem, de graça: carregando (esqueleto), vazio da
// visão, erro com "Tentar de novo". No celular a tabela vira cartões e o
// painel cobre a lista, com "Lista" para voltar.

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = (n, cls) => `<i data-lucide="${n}" aria-hidden="true"${cls ? ` class="${cls}"` : ""}></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const celular = () => matchMedia("(max-width: 768px)").matches;
  const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch (_) { return padrao; } };
  const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* navegador sem storage: só não lembra */ } };

  // Vazio vai para o fim nas duas direções; empate mantém a ordem de trabalho.
  // O mesmo contrato do _ordenar do admin.js (18/11/2026).
  function ordenar(itens, f, dir) {
    const m = dir === "desc" ? -1 : 1;
    const vazio = v => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
    return itens.map((x, i) => [x, i, f(x)]).sort((a, b) => {
      const va = a[2], vb = b[2];
      if (vazio(va) || vazio(vb)) return vazio(va) === vazio(vb) ? a[1] - b[1] : (vazio(va) ? 1 : -1);
      const c = (typeof va === "number" && typeof vb === "number") ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });
      return c * m || a[1] - b[1];
    }).map(p => p[0]);
  }

  // CSV com ";" e BOM: o Excel em português abre direto, com acento.
  function baixarCsv(nome, colunas, linhas) {
    const c = v => { const s = v == null ? "" : String(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = [colunas.map(x => c(x[0])).join(";"), ...linhas.map(r => colunas.map(x => c(x[1](r))).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  function criar(cfg) {
    const id = cfg.id;
    const salvo = ler("lista:" + id, {}) || {};
    const ordSalva = ler("ordem:" + id, null);
    const st = {
      visao: cfg.visoes.some(v => v[0] === salvo.visao) ? salvo.visao : cfg.visoes[0][0],
      busca: "",
      pagina: 1,
      porPagina: [25, 50, 100].includes(salvo.porPagina) ? salvo.porPagina : 50,
      ord: ordSalva && cfg.colunas.some(c => c.chave === ordSalva.chave) ? ordSalva : null,
      sel: null,
      marc: new Set(),
      ladoAberto: false,
    };
    const raiz = () => document.getElementById(cfg.raiz);
    const $ = s => raiz()?.querySelector(s);

    function guardar() { gravar("lista:" + id, { visao: st.visao, porPagina: st.porPagina }); }

    // ===== dados =====
    const todos = () => { try { return cfg.dados() || []; } catch (_) { return []; } };
    const visaoFn = k => (cfg.visoes.find(v => v[0] === k) || cfg.visoes[0])[2];
    function filtrados() {
      const q = norm(st.busca.trim());
      let d = todos().filter(visaoFn(st.visao));
      if (q) d = d.filter(r => norm(cfg.texto(r)).includes(q));
      if (st.ord) {
        const col = cfg.colunas.find(c => c.chave === st.ord.chave);
        if (col && col.ord) d = ordenar(d, col.ord, st.ord.dir);
      }
      return d;
    }

    // ===== esqueleto da tela (uma vez por entrada) =====
    function montar() {
      const r = raiz();
      if (!r) return;
      r.innerHTML = `
        <header class="ls-cab">
          <div class="ls-tit">
            <h1>${esc(cfg.titulo)}</h1>
            <p class="ls-frase" data-ls-frase></p>
          </div>
          <span class="ls-esp"></span>
          <div class="ls-cab-acoes" data-ls-acoes></div>
        </header>
        <div class="ls-placa">
          <div class="ls-barra">
            <div class="ls-chips" role="group" aria-label="Visões" data-ls-chips></div>
            <span class="ls-esp"></span>
            <label class="ls-busca">${ico("search")}<input type="search" data-ls-busca placeholder="${esc(cfg.buscaDica || "Buscar")}" aria-label="Buscar"></label>
            ${cfg.exportar ? `<button type="button" class="ls-bt" data-ls-exportar title="Exporta em CSV o que está filtrado na tela">${ico("download")}<span class="ls-so-desk">Exportar</span></button>` : ""}
          </div>
          <div class="ls-dividido${cfg.detalhe ? "" : " sem-painel"}" data-ls-div>
            <div class="ls-lista" data-ls-lista></div>
            ${cfg.detalhe ? `<aside class="ls-lado" data-ls-lado aria-label="Detalhe"></aside>` : ""}
          </div>
        </div>`;
      const b = $("[data-ls-busca]");
      if (b) b.value = st.busca;
      desenhar();
    }

    // ===== a lista =====
    function desenhar() {
      const r = raiz();
      if (!r) return;
      if (!r.querySelector("[data-ls-lista]")) return montar();
      const estado = cfg.estado ? cfg.estado() : "pronto"; // carregando | erro | pronto

      // frase e ação primária do cabeçalho
      const fr = $("[data-ls-frase]");
      if (fr) fr.innerHTML = cfg.frase ? cfg.frase(todos(), estado) : "";
      const ac = $("[data-ls-acoes]");
      if (ac) ac.innerHTML = cfg.acoes ? cfg.acoes(todos(), estado) : "";

      // chips (contador sobre o conjunto inteiro, sem a busca)
      const ch = $("[data-ls-chips]");
      if (ch) {
        const base = todos();
        ch.innerHTML = cfg.visoes.filter(v => !v[4] || v[4](base)).map(([k, nome, f, pt]) => {
          const n = estado === "pronto" ? base.filter(f).length : "";
          return `<button type="button" class="ls-chip${st.visao === k ? " is-on" : ""}" data-ls-visao="${k}" aria-pressed="${st.visao === k}">${pt ? `<i class="ls-pt is-${pt}"></i>` : ""}${esc(nome)}${n !== "" ? ` <span class="ls-n">${n}</span>` : ""}</button>`;
        }).join("");
      }

      const alvo = $("[data-ls-lista]");
      if (estado === "carregando") {
        alvo.innerHTML = `<div class="ls-esq" aria-busy="true" aria-label="Carregando">${Array.from({ length: 8 }, () => `<div class="ls-esq-l"><i></i><i></i><i></i><i></i></div>`).join("")}</div>`;
        desenharLado();
        return;
      }
      if (estado === "erro") {
        alvo.innerHTML = `<div class="ls-vazio is-erro">${ico("cloud-off")}<b>Não consegui carregar ${esc(cfg.nomePlural || "a lista")}.</b><span>Pode ser a conexão. O que já estava na tela não foi apagado.</span><button type="button" class="ls-bt" data-ls-recarregar>${ico("rotate-cw")}Tentar de novo</button></div>`;
        icones(alvo);
        desenharLado();
        return;
      }

      const d = filtrados();
      const total = d.length;
      const maxPag = Math.max(1, Math.ceil(total / st.porPagina));
      if (st.pagina > maxPag) st.pagina = maxPag;
      const ini = (st.pagina - 1) * st.porPagina;
      const pag = d.slice(ini, ini + st.porPagina);

      // A seleção vale para o que está na visão; o que saiu dela sai da seleção
      // (contador falando de item que ninguém vê é mandar às cegas).
      const ids = new Set(d.map(cfg.chave));
      for (const m of st.marc) if (!ids.has(m)) st.marc.delete(m);

      const lote = cfg.lote && cfg.podeMarcar;
      const marcaveis = lote ? pag.filter(cfg.podeMarcar) : [];
      const todosMarc = marcaveis.length > 0 && marcaveis.every(x => st.marc.has(cfg.chave(x)));
      const algumMarc = marcaveis.some(x => st.marc.has(cfg.chave(x)));

      const barraLote = lote && st.marc.size ? `<div class="ls-lote" role="region" aria-label="Ações em lote">
          <b>${st.marc.size} ${cfg.selecionados ? cfg.selecionados(st.marc.size) : (st.marc.size === 1 ? "selecionada" : "selecionadas")}</b>
          ${cfg.lote(marcados()).map(([k, nome, ic, n]) => `<button type="button" class="ls-bt is-p is-lote" data-ls-lote="${k}" ${n === 0 ? "disabled" : ""}>${ic ? ico(ic) : ""}${esc(nome)}</button>`).join("")}
          <span class="ls-esp"></span>
          <button type="button" class="ls-bt is-p is-lote is-ghost" data-ls-lote="limpar">Limpar seleção</button>
        </div>` : "";

      const th = cfg.colunas.map(c => {
        const ativo = st.ord && st.ord.chave === c.chave;
        const aria = ativo ? (st.ord.dir === "asc" ? "ascending" : "descending") : "none";
        const conteudo = c.ord
          ? `<button type="button" class="ls-th-ord${ativo ? " is-on" : ""}" data-ls-ord="${c.chave}" title="Ordenar por ${esc(c.h.toLowerCase())}">${esc(c.h)}${ativo ? ico(st.ord.dir === "asc" ? "arrow-up" : "arrow-down") : ico("chevrons-up-down", "ls-th-ic")}</button>`
          : (c.h ? esc(c.h) : `<span class="sr-only">${esc(c.rotulo || "Ação")}</span>`);
        return `<th class="${c.cls || ""}"${c.w ? ` style="width:${c.w}"` : ""}${c.ord ? ` aria-sort="${aria}"` : ""}>${conteudo}</th>`;
      }).join("");

      const linhas = pag.map(x => {
        const k = cfg.chave(x);
        const pode = lote && cfg.podeMarcar(x);
        return `<tr data-ls-linha="${esc(k)}" class="${String(k) === String(st.sel) ? "is-sel" : ""} ${cfg.classeLinha ? cfg.classeLinha(x) : ""}" tabindex="0">
          ${lote ? `<td class="ls-c-cx">${pode ? `<input type="checkbox" data-ls-marca="${esc(k)}" aria-label="Selecionar" ${st.marc.has(k) ? "checked" : ""}>` : ""}</td>` : ""}
          ${cfg.colunas.map(c => `<td class="${c.cls || ""}">${c.td(x)}</td>`).join("")}
        </tr>`;
      }).join("");

      const vazio = !total ? `<div class="ls-vazio">${ico(st.busca ? "search-x" : (cfg.icVazio || "circle-check"))}
          <b>${st.busca ? "Nada com essa busca nesta visão." : esc((cfg.vazios || {})[st.visao] || "Nada nesta visão.")}</b>
          ${st.busca ? `<button type="button" class="ls-bt is-p" data-ls-limpar-busca>Limpar busca</button>` : (st.visao !== cfg.visoes[cfg.visoes.length - 1][0] ? `<button type="button" class="ls-bt is-p" data-ls-visao="${cfg.visoes[cfg.visoes.length - 1][0]}">Ver ${esc(cfg.visoes[cfg.visoes.length - 1][1].toLowerCase())}</button>` : "")}
        </div>` : "";

      alvo.innerHTML = barraLote + (total ? `
        <div class="ls-rolagem">
          <table class="ls-tab">
            <thead><tr>${lote ? `<th class="ls-c-cx">${marcaveis.length ? `<input type="checkbox" data-ls-marca-todos aria-label="Selecionar as desta página" ${todosMarc ? "checked" : ""}>` : ""}</th>` : ""}${th}</tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        <div class="ls-pe">
          <span>${ini + 1}–${ini + pag.length} de ${total}</span>
          <span class="ls-esp"></span>
          <label class="ls-pp"><span class="ls-so-desk">Por página</span>
            <select data-ls-por-pagina aria-label="Itens por página">${[25, 50, 100].map(n => `<option value="${n}" ${n === st.porPagina ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <button type="button" class="ls-ib" data-ls-pag="-1" ${st.pagina <= 1 ? "disabled" : ""} aria-label="Página anterior">${ico("chevron-left")}</button>
          <span class="ls-pag-n">${st.pagina} / ${maxPag}</span>
          <button type="button" class="ls-ib" data-ls-pag="1" ${st.pagina >= maxPag ? "disabled" : ""} aria-label="Próxima página">${ico("chevron-right")}</button>
        </div>` : vazio);

      const ct = alvo.querySelector("[data-ls-marca-todos]");
      if (ct) ct.indeterminate = !todosMarc && algumMarc;

      // Sem nada escolhido, o computador abre o primeiro da visão no painel —
      // painel vazio ao lado de uma lista cheia é espaço jogado fora.
      if (cfg.detalhe && !celular() && (st.sel == null || !d.some(x => String(cfg.chave(x)) === String(st.sel))) && pag.length) {
        st.sel = cfg.chave(pag[0]);
        alvo.querySelector("tbody tr")?.classList.add("is-sel");
      }
      icones(r);
      desenharLado();
    }

    function marcados() {
      const ids = st.marc;
      return todos().filter(x => ids.has(cfg.chave(x)));
    }

    // ===== o painel ao lado =====
    function desenharLado() {
      const lado = $("[data-ls-lado]");
      if (!lado || !cfg.detalhe) return;
      const item = st.sel == null ? null : todos().find(x => String(cfg.chave(x)) === String(st.sel));
      lado.innerHTML = item
        ? `<button type="button" class="ls-voltar" data-ls-fechar-lado>${ico("arrow-left")}Lista</button>${cfg.detalhe(item)}`
        : `<div class="ls-lado-vazio">${ico(cfg.icLado || "mouse-pointer-click")}<b>${esc(cfg.ladoVazio || "Escolha um item na lista.")}</b></div>`;
      $("[data-ls-div]")?.classList.toggle("com-detalhe", !!item && st.ladoAberto);
      icones(lado);
      if (item && cfg.aoSelecionar) cfg.aoSelecionar(item);
    }

    function selecionar(k, { abrir = true } = {}) {
      st.sel = k;
      st.ladoAberto = abrir;
      raiz()?.querySelectorAll("[data-ls-linha]").forEach(tr => tr.classList.toggle("is-sel", tr.dataset.lsLinha === String(k)));
      desenharLado();
    }

    // ===== eventos (delegados na raiz, ligados uma vez) =====
    let ligado = false;
    function ligar() {
      if (ligado) return;
      ligado = true;
      document.addEventListener("click", e => {
        const r = raiz();
        if (!r || !r.contains(e.target)) return;
        let el;
        if ((el = e.target.closest("[data-ls-visao]"))) {
          st.visao = el.dataset.lsVisao; st.pagina = 1; guardar(); desenhar(); return;
        }
        if ((el = e.target.closest("[data-ls-ord]"))) {
          const k = el.dataset.lsOrd, col = cfg.colunas.find(c => c.chave === k);
          const natural = col.dir || "asc", inv = natural === "asc" ? "desc" : "asc";
          if (!st.ord || st.ord.chave !== k) st.ord = { chave: k, dir: natural };
          else if (st.ord.dir === natural) st.ord = { chave: k, dir: inv };
          else st.ord = null; // terceiro clique: volta à ordem de trabalho
          gravar("ordem:" + id, st.ord);
          st.pagina = 1; desenhar(); return;
        }
        if ((el = e.target.closest("[data-ls-pag]"))) { st.pagina += Number(el.dataset.lsPag); desenhar(); r.querySelector(".ls-rolagem")?.scrollTo(0, 0); return; }
        if (e.target.closest("[data-ls-limpar-busca]")) { st.busca = ""; const b = $("[data-ls-busca]"); if (b) b.value = ""; desenhar(); return; }
        if (e.target.closest("[data-ls-recarregar]")) { cfg.recarregar?.(); return; }
        if (e.target.closest("[data-ls-exportar]")) {
          const d = filtrados();
          const visao = (cfg.visoes.find(v => v[0] === st.visao) || [])[1] || "";
          const dia = new Date().toISOString().slice(0, 10);
          baixarCsv(`${id}-${norm(visao).replace(/[^a-z0-9]+/g, "-")}-${dia}.csv`, cfg.exportar, d);
          return;
        }
        if ((el = e.target.closest("[data-ls-marca-todos]"))) {
          const d = filtrados(), ini = (st.pagina - 1) * st.porPagina;
          const alvo = d.slice(ini, ini + st.porPagina).filter(cfg.podeMarcar);
          if (el.checked) alvo.forEach(x => st.marc.add(cfg.chave(x))); else alvo.forEach(x => st.marc.delete(cfg.chave(x)));
          desenhar(); return;
        }
        if ((el = e.target.closest("[data-ls-marca]"))) {
          // A caixa mora dentro da linha: marcar não abre o item.
          const k = todos().map(cfg.chave).find(x => String(x) === el.dataset.lsMarca);
          if (el.checked) st.marc.add(k); else st.marc.delete(k);
          desenhar(); return;
        }
        if ((el = e.target.closest("[data-ls-lote]"))) {
          if (el.dataset.lsLote === "limpar") { st.marc.clear(); desenhar(); return; }
          cfg.aoLote?.(el.dataset.lsLote, marcados(), () => { st.marc.clear(); desenhar(); });
          return;
        }
        if (e.target.closest("[data-ls-fechar-lado]")) { st.ladoAberto = false; $("[data-ls-div]")?.classList.remove("com-detalhe"); return; }
        if (cfg.aoClicar && cfg.aoClicar(e)) return;
        if ((el = e.target.closest("[data-ls-linha]")) && !e.target.closest("a, button, input, select, label")) {
          const k = todos().map(cfg.chave).find(x => String(x) === el.dataset.lsLinha);
          if (!cfg.detalhe) { cfg.aoAbrir?.(k); return; }
          selecionar(k);
        }
      });
      document.addEventListener("dblclick", e => {
        const r = raiz();
        if (!r || !r.contains(e.target) || e.target.closest("a, button, input, select, label")) return;
        const el = e.target.closest("[data-ls-linha]");
        if (el && cfg.aoAbrir) cfg.aoAbrir(todos().map(cfg.chave).find(x => String(x) === el.dataset.lsLinha));
      });
      document.addEventListener("input", e => {
        if (!e.target.matches?.("[data-ls-busca]") || !raiz()?.contains(e.target)) return;
        st.busca = e.target.value; st.pagina = 1; desenhar();
      });
      document.addEventListener("change", e => {
        if (!e.target.matches?.("[data-ls-por-pagina]") || !raiz()?.contains(e.target)) return;
        st.porPagina = Number(e.target.value) || 50; st.pagina = 1; guardar(); desenhar();
      });
      document.addEventListener("keydown", e => {
        const r = raiz();
        if (!r || !r.contains(e.target)) return;
        const tr = e.target.closest?.("[data-ls-linha]");
        if (tr && e.target === tr) {
          if (e.key === "Enter") { e.preventDefault(); tr.click(); }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const prox = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
            if (prox) { prox.focus(); if (!celular()) prox.click(); }
          }
        }
        if (e.key === "Escape" && $("[data-ls-div]")?.classList.contains("com-detalhe")) {
          st.ladoAberto = false; $("[data-ls-div]").classList.remove("com-detalhe");
        }
      });
    }
    ligar();

    return { montar, desenhar, desenharLado, selecionar, estado: st, filtrados };
  }

  window.GBLista = { criar, esc, ico, icones };
})();
