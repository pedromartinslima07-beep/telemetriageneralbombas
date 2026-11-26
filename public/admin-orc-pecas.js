// ============================================================
// PEÇAS NO ORÇAMENTO, fase A (20/11/2026)
// ============================================================
//
// A linha de peça do orçamento nasce ligada ao produto do Omie, quando é
// digitada, e não só no modal da nota. Desenho completo em
// docs/modulos/pecas-no-orcamento.md.
//
// O que faz, no editor de itens do orçamento (tipo "Peças e serviços"):
//   - ao digitar a descrição (de uma linha ou do item novo), abre a lista de
//     produtos do catálogo do Omie: código, NCM, preço do Omie, quantas vezes
//     a General faturou, e "a última vez" (o preço cobrado num orçamento
//     aprovado). O produto "usado da última vez" para aquele texto vem em
//     cima. ↑/↓ e Enter escolhem; Esc fecha e deixa como texto;
//   - escolher liga a linha (omie_produto_codigo, natureza = peça) e preenche
//     o valor unitário SÓ se estiver vazio. A descrição fica a digitada (é o
//     que o síndico lê no PDF); o nome do Omie aparece embaixo;
//   - em cada linha: Peça | Serviço, o produto com "trocar" e "tirar", ou
//     "sem produto do Omie · escolher";
//   - embaixo da tabela: qual nota vai sair (DANFE com peça, NFS-e só com
//     serviço), pela regra da nota fiscal.
//
// ⚠️ O EDITOR NÃO FOI REESCRITO. _avRenderLinhas (admin.js) desenha a tabela
// como sempre; o embrulho no fim deste arquivo decora o que ela desenhou.
// Linha sem produto continua valendo para o cliente: nada aqui bloqueia o
// envio. Só a NOTA (DANFE) exige o produto: o modal de emissão lista a peça
// sem produto em "Antes de emitir" e traz de volta para cá.
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = v => v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dois = v => Math.round(Number(v) * 100) / 100;
  const linhas = () => (typeof _avLinhas !== "undefined" && Array.isArray(_avLinhas) ? _avLinhas : []);
  const orc = () => (typeof _avSelecionado !== "undefined" ? _avSelecionado : null);
  const tipo = () => document.getElementById("avInputTipo")?.value || orc()?.tipo || "pecas";
  const ehPecas = () => tipo() === "pecas";
  const travado = () => ["emitida", "processando"].includes(orc()?.nota_status);
  const podeGravar = () => typeof _myRole === "undefined" || _myRole === "admin";

  // O item novo (ainda sem linha no banco) guarda a escolha aqui até o
  // "+ Adicionar". O admin.js lê por _avPecaPendente() no POST.
  let pendente = null;
  window._avPecaPendente = () => (pendente ? { omie_produto_codigo: pendente.codigo_produto, natureza: "peca" } : {});
  window._avPecaLimpar = () => { pendente = null; desenharPendente(); };

  // ===== a lista de sugestões =====
  const drop = { el: null, input: null, itens: [], ativo: -1, timer: null, seq: 0, linhaId: null, estado: null };

  function garantirDrop() {
    if (drop.el) return drop.el;
    const el = document.createElement("div");
    el.className = "av-pc-drop";
    el.setAttribute("role", "listbox");
    el.hidden = true;
    document.body.appendChild(el);
    // mousedown, não click: o clique tiraria o foco do campo antes (e o
    // "change" do campo gravaria só o texto).
    el.addEventListener("mousedown", e => {
      const it = e.target.closest("[data-pc-i]");
      if (!it) return;
      e.preventDefault();
      escolher(Number(it.dataset.pcI));
    });
    drop.el = el;
    return el;
  }

  function posicionar() {
    if (!drop.el || drop.el.hidden || !drop.input) return;
    const r = drop.input.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { fechar(); return; }
    const largura = Math.max(r.width, 460);
    drop.el.style.width = Math.min(largura, innerWidth - 24) + "px";
    drop.el.style.left = Math.max(12, Math.min(r.left, innerWidth - 12 - Math.min(largura, innerWidth - 24))) + "px";
    const embaixo = innerHeight - r.bottom;
    if (embaixo < 260 && r.top > embaixo) { drop.el.style.top = ""; drop.el.style.bottom = (innerHeight - r.top + 4) + "px"; }
    else { drop.el.style.bottom = ""; drop.el.style.top = (r.bottom + 4) + "px"; }
  }

  function fechar() {
    if (drop.el) drop.el.hidden = true;
    drop.itens = []; drop.ativo = -1; drop.input = null; drop.linhaId = null;
    clearTimeout(drop.timer);
  }

  function desenharDrop(carregando) {
    const el = garantirDrop();
    const q = drop.input?.value.trim() || "";
    let html;
    if (carregando && !drop.itens.length) {
      html = `<div class="av-pc-msg">Procurando no catálogo do Omie…</div>`;
    } else if (drop.estado && !drop.estado.total && drop.estado.sincronizando) {
      html = `<div class="av-pc-msg">Copiando o catálogo do Omie para cá (cerca de 1 minuto). Enquanto isso o item fica como texto; depois é só digitar de novo.</div>`;
    } else if (drop.estado && !drop.estado.total) {
      html = `<div class="av-pc-msg">O catálogo do Omie ainda não foi copiado para cá. O item fica como texto; escolha o produto antes de emitir a nota.</div>`;
    } else if (!drop.itens.length) {
      html = `<div class="av-pc-msg">Nada parecido com "${esc(q)}" no catálogo do Omie. Fica como texto; para a nota (DANFE), cadastre a peça no Omie.</div>`;
    } else {
      html = drop.itens.map((p, i) => {
        const uv = p.ultima_vez;
        return `<div class="av-pc-it${i === drop.ativo ? " is-ativo" : ""}" role="option" aria-selected="${i === drop.ativo}" data-pc-i="${i}">
          <div class="av-pc-l1"><span class="av-pc-cod">${esc(p.codigo || p.codigo_produto)}</span><span class="av-pc-nome">${esc(p.descricao)}</span><b>${moeda(p.valor_unitario)}</b></div>
          <div class="av-pc-l2">
            <span>NCM ${esc(p.ncm || "—")} · ${p.vezes_faturado ? "faturado " + p.vezes_faturado + "×" : "nunca faturado"}</span>
            ${p.lembrado ? `<span class="av-pc-lemb">usado da última vez</span>` : ""}
            <span class="av-pc-esp"></span>
            ${uv && uv.valor != null ? `<span class="av-pc-uv">última vez ${moeda(uv.valor)}${uv.numero ? " · " + esc(uv.numero) : ""}</span>` : ""}
          </div>
        </div>`;
      }).join("") + `<div class="av-pc-pe"><span>↑↓ e Enter escolhem</span><span>Esc deixa como texto</span></div>`;
    }
    el.innerHTML = html;
    el.hidden = false;
    posicionar();
  }

  async function buscar(input) {
    const q = input.value.trim();
    if (q.length < 3) { fechar(); return; }
    const seq = ++drop.seq;
    drop.input = input;
    drop.linhaId = input.id === "avNewDesc" ? null : Number(input.dataset.avLinhaId) || null;
    desenharDrop(true);
    try {
      const o = orc();
      const r = await fetch(`/admin/omie/produtos?historico=1&limite=6&q=${encodeURIComponent(q)}${o?.id ? "&orcamento_id=" + o.id : ""}`, { headers: authHeaders() });
      if (seq !== drop.seq || drop.input !== input) return; // chegou outra tecla
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      drop.itens = j.produtos || [];
      drop.estado = j.catalogo || null;
      drop.ativo = drop.itens.length ? 0 : -1;
    } catch (_) {
      if (seq !== drop.seq) return;
      drop.itens = []; drop.estado = { total: 1 };
    }
    desenharDrop(false);
  }

  // O preço que entra quando o campo está vazio: o da última vez; senão o do Omie.
  const precoSugerido = p => (p.ultima_vez && p.ultima_vez.valor != null ? dois(p.ultima_vez.valor) : (p.valor_unitario != null ? dois(p.valor_unitario) : null));

  async function escolher(i) {
    const p = drop.itens[i];
    const input = drop.input;
    if (!p || !input) return;
    const linhaId = drop.linhaId;
    fechar();
    if (!linhaId) {
      pendente = p;
      const val = document.getElementById("avNewVal");
      const sug = precoSugerido(p);
      if (val && val.value === "" && sug != null) val.value = sug;
      desenharPendente();
      input.focus();
      return;
    }
    const l = linhas().find(x => x.id === linhaId);
    const corpo = { omie_produto_codigo: p.codigo_produto, natureza: "peca" };
    const desc = input.value.trim();
    if (desc && l && desc !== l.descricao) corpo.descricao = desc;
    if (l && (l.valor_unitario == null || l.valor_unitario === "")) {
      const sug = precoSugerido(p);
      if (sug != null) corpo.valor_unitario = sug;
    }
    // O "change" do campo ainda vai disparar com o mesmo texto: gravamos a
    // descrição aqui e marcamos para ele não gravar de novo.
    input.dataset.pcGravado = "1";
    await gravar(linhaId, corpo);
  }

  async function gravar(linhaId, corpo) {
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/linhas/${linhaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j.error || "Não foi possível atualizar o item."); return; }
      const L = linhas();
      const idx = L.findIndex(x => x.id === linhaId);
      if (idx !== -1) L[idx] = j;
      const o = orc();
      if (typeof _avData !== "undefined" && o) {
        const oi = _avData.findIndex(x => x.id === o.id);
        if (oi !== -1 && typeof _avComputeTotal === "function") _avData[oi].valor_total = _avComputeTotal(_avData[oi], L);
      }
      _avRenderLinhas();
      if (typeof _avRenderTudo === "function") _avRenderTudo();
    } catch (e) { alert("Erro: " + e.message); }
  }

  // ===== a decoração da tabela =====
  function chipLinha(l) {
    const g = podeGravar() && !travado();
    const nat = l.natureza;
    const seg = `<span class="av-pc-seg${g ? "" : " is-so-ler"}" role="group" aria-label="Peça ou serviço">
        <button type="button" class="${nat === "peca" ? "is-on" : ""}" data-pc-nat="peca" data-pc-linha="${l.id}" ${g ? "" : "disabled"} aria-pressed="${nat === "peca"}">Peça</button>
        <button type="button" class="${nat === "servico" ? "is-on" : ""}" data-pc-nat="servico" data-pc-linha="${l.id}" ${g ? "" : "disabled"} aria-pressed="${nat === "servico"}">Serviço</button>
      </span>`;
    let prod;
    if (l.omie_produto_codigo) {
      prod = `<span class="av-pc-cod">${esc(l.produto_codigo || l.omie_produto_codigo)}</span>
        <span class="av-pc-prod" title="${esc(l.produto_descricao || "")}">${esc(l.produto_descricao || "produto do Omie")}${l.produto_ncm ? " · NCM " + esc(l.produto_ncm) : ""}</span>
        ${l.produto_inativo ? `<span class="av-pc-aviso">inativo no Omie</span>` : ""}
        ${g ? `<span class="av-pc-acoes"><button type="button" class="av-pc-lk" data-pc-trocar="${l.id}">trocar</button>
        ${l.produto_descricao && l.produto_descricao !== l.descricao ? `<button type="button" class="av-pc-lk" data-pc-nome="${l.id}" title="Trocar a descrição pelo nome do Omie">usar o nome do Omie</button>` : ""}
        <button type="button" class="av-pc-lk is-fraco" data-pc-tirar="${l.id}">tirar</button></span>` : ""}`;
    } else if (nat === "servico") {
      prod = `<span class="av-pc-fraco">entra como serviço na nota</span>`;
    } else {
      prod = `<span class="av-pc-fraco">sem produto do Omie</span>${g ? ` · <button type="button" class="av-pc-lk" data-pc-trocar="${l.id}">escolher</button>` : ""}`;
    }
    // Fase B: a linha de peça diz se a peça já foi usada na visita (vai no
    // bloco "Peças utilizadas na visita" do PDF). Não trava com a nota.
    const usada = nat === "peca" || l.omie_produto_codigo || l.peca_usada
      ? `<button type="button" class="av-pc-usada${l.peca_usada ? " is-on" : ""}" data-pc-usada="${l.id}" ${podeGravar() ? "" : "disabled"} aria-pressed="${!!l.peca_usada}" title="Peça já trocada na visita: sai no bloco &quot;Peças utilizadas na visita&quot; do PDF">${l.peca_usada ? "usada na visita" : "a instalar"}</button>`
      : "";
    return `<div class="av-pc" data-pc-chip="${l.id}">${seg}${usada}${prod}</div>`;
  }

  function rodapeNota() {
    const L = linhas().filter(l => !l.tipo_servico);
    if (!L.length) return "";
    const pecas = L.filter(l => l.natureza === "peca" || l.omie_produto_codigo).length;
    const semMarca = L.filter(l => !l.natureza && !l.omie_produto_codigo).length;
    const semProduto = L.filter(l => l.natureza === "peca" && !l.omie_produto_codigo).length;
    let txt;
    if (pecas) {
      txt = `Tem peça: a nota sai em <b>DANFE</b>, com o serviço embutido no preço das peças.`;
      if (semProduto) txt += ` ${semProduto} ${semProduto === 1 ? "peça ainda sem produto do Omie" : "peças ainda sem produto do Omie"}: escolha antes de emitir a nota.`;
    } else if (!semMarca) {
      txt = `Só serviço: a nota sai em <b>NFS-e</b>.`;
    } else {
      txt = `Marque Peça ou Serviço ${semMarca === 1 ? "na linha" : "nas " + semMarca + " linhas"} para saber qual nota sai (com peça, DANFE; só serviço, NFS-e).`;
    }
    return `<div class="av-pc-nota"><span>${txt}</span></div>`;
  }

  function desenharPendente() {
    const form = document.getElementById("avAddLinhaForm");
    if (!form) return;
    let box = form.querySelector(".av-pc-pend");
    if (!pendente) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.className = "av-pc av-pc-pend"; form.appendChild(box); }
    box.innerHTML = `<span class="av-pc-tag">Vai ligado a</span><span class="av-pc-cod">${esc(pendente.codigo || pendente.codigo_produto)}</span>
      <span class="av-pc-prod">${esc(pendente.descricao)}${pendente.ncm ? " · NCM " + esc(pendente.ncm) : ""}</span>
      <button type="button" class="av-pc-lk is-fraco" data-pc-pend-tirar>tirar</button>`;
  }

  // ===== Fase B: as peças da O.S. (usadas e a orçar) =====
  // O bloco em cima dos itens, quando o orçamento é de uma O.S. que tem peças.
  // "Trazer" cria as linhas pela rota (que trava a peça já orçada); marcar
  // "usada" / "a orçar" grava na peça da O.S.
  const osBloco = { orcId: null, dados: null, carregando: false, erro: false };
  const SIT_PECA = { usada: "Usadas na visita", a_orcar: "Falta, precisa orçar", "": "Sem marcação (registradas antes)" };
  const qtd = p => `${p.quantidade || 1}×`;

  function estadoPeca(p) {
    if (p.orcada) return `<span class="av-pc-ok">orçada no ${esc(p.orcamento_numero || "outro orçamento")}</span>`;
    if (p.orcamento_id && p.orcamento_status === "rejeitado") return `<span class="av-pc-fraco">recusada no ${esc(p.orcamento_numero || "orçamento")} · pode trazer de novo</span>`;
    return `<span class="av-pc-fraco">ainda não orçada</span>`;
  }

  function blocoOsHtml() {
    const d = osBloco.dados;
    if (!d || !d.os || !d.pecas.length) return "";
    const g = podeGravar() && !travado();
    const marcadasLivres = d.pecas.filter(p => p.situacao && !p.orcada);
    const grupos = ["usada", "a_orcar", ""].map(k => [k, d.pecas.filter(p => (p.situacao || "") === k)]).filter(([, l]) => l.length);
    const visita = d.os.chegada_em || d.os.finalizada_em;
    return `<div class="av-pc-os" data-pc-os>
      <div class="av-pc-os-cab">
        <b>Peças da ${esc(d.os.numero || "O.S.")}</b>
        <span class="av-pc-fraco">${[d.os.tecnico_nome, visita ? new Date(visita).toLocaleDateString("pt-BR") : ""].filter(Boolean).map(esc).join(" · ")}</span>
        <span class="av-pc-esp"></span>
        ${g && marcadasLivres.length ? `<button type="button" class="av-pc-bt" data-pc-trazer="${marcadasLivres.map(p => p.id).join(",")}">Trazer ${marcadasLivres.length === 1 ? "a peça que falta" : "as " + marcadasLivres.length + " que faltam"}</button>` : ""}
      </div>
      ${grupos.map(([k, lista]) => `<div class="av-pc-os-g">
        <div class="av-pc-os-gt"><span class="av-pc-sit is-${k || "sem"}">${SIT_PECA[k]}</span></div>
        ${lista.map(p => `<div class="av-pc-os-p">
          <span class="av-pc-os-d">${qtd(p)} ${esc(p.descricao)}${p.observacao ? ` <span class="av-pc-fraco">· ${esc(p.observacao)}</span>` : ""}</span>
          ${k ? estadoPeca(p) : ""}
          ${g && !k ? `<button type="button" class="av-pc-bt is-p" data-pc-sit="usada" data-pc-peca="${p.id}">Foi usada</button><button type="button" class="av-pc-bt is-p" data-pc-sit="a_orcar" data-pc-peca="${p.id}">A orçar</button>` : ""}
          ${g && k && !p.orcada ? `<button type="button" class="av-pc-lk" data-pc-trazer="${p.id}">trazer</button>` : ""}
          ${g && k && !p.orcada ? `<button type="button" class="av-pc-lk is-fraco" data-pc-sit="" data-pc-peca="${p.id}" title="Desfazer a marcação">desmarcar</button>` : ""}
        </div>`).join("")}
      </div>`).join("")}
      ${osBloco.erro ? `<div class="av-pc-fraco">Não consegui ler as peças da O.S.</div>` : ""}
    </div>`;
  }

  async function carregarPecasOs(forcar) {
    const o = orc();
    if (!o || !o.id || !o.os_id) { osBloco.orcId = o?.id ?? null; osBloco.dados = null; return; }
    if (!forcar && osBloco.orcId === o.id && (osBloco.dados || osBloco.carregando)) return;
    osBloco.orcId = o.id; osBloco.carregando = true; osBloco.erro = false;
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${o.id}/pecas-da-os`, { headers: authHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (orc()?.id === o.id) osBloco.dados = j;
    } catch (_) { osBloco.erro = true; }
    finally { osBloco.carregando = false; }
    desenharBlocoOs();
  }

  function desenharBlocoOs() {
    const wrap = document.getElementById("avItensWrap");
    if (!wrap || !ehPecas()) return;
    wrap.querySelector("[data-pc-os]")?.remove();
    const html = blocoOsHtml();
    if (html) wrap.insertAdjacentHTML("afterbegin", html);
  }

  async function trazerPecas(ids) {
    const o = orc();
    if (!o?.id) return;
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${o.id}/linhas/da-os`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ pecas: ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j.error || "Não foi possível trazer as peças."); await carregarPecasOs(true); return; }
      const L = linhas();
      for (const l of j.linhas || []) L.push(l);
      if (typeof _avData !== "undefined") {
        const oi = _avData.findIndex(x => x.id === o.id);
        if (oi !== -1 && typeof _avComputeTotal === "function") _avData[oi].valor_total = _avComputeTotal(_avData[oi], L);
      }
      await carregarPecasOs(true);
      _avRenderLinhas();
      if (typeof _avRenderTudo === "function") _avRenderTudo();
    } catch (e) { alert("Erro: " + e.message); }
  }

  async function marcarPeca(pecaId, situacao) {
    const d = osBloco.dados;
    if (!d?.os) return;
    try {
      const r = await fetch(`/ordens-servico/${d.os.id}/pecas/${pecaId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ situacao }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j.error || "Não foi possível marcar a peça."); return; }
      await carregarPecasOs(true);
    } catch (e) { alert("Erro: " + e.message); }
  }

  function decorar() {
    const wrap = document.getElementById("avItensWrap");
    if (!wrap || !ehPecas()) { fechar(); return; }
    if (orc()?.id !== osBloco.orcId) { osBloco.dados = null; carregarPecasOs(); }
    else desenharBlocoOs();
    for (const tr of wrap.querySelectorAll("tr[data-av-linha-id]")) {
      const l = linhas().find(x => x.id === Number(tr.dataset.avLinhaId));
      const inp = tr.querySelector('input[data-av-linha-field="descricao"]');
      if (!l || !inp || tr.querySelector("[data-pc-chip]")) continue;
      inp.setAttribute("autocomplete", "off");
      inp.setAttribute("aria-autocomplete", "list");
      inp.insertAdjacentHTML("afterend", chipLinha(l));
    }
    const nova = document.getElementById("avNewDesc");
    if (nova) { nova.setAttribute("autocomplete", "off"); nova.placeholder = "Adicionar item: digite a descrição ou busque no Omie"; }
    const velho = wrap.querySelector(".av-pc-nota");
    if (velho) velho.remove();
    const form = document.getElementById("avAddLinhaForm");
    const nota = rodapeNota();
    // Depois do formulário do item novo: ele gruda no pé da caixa e cobriria a frase.
    if (nota) (form || wrap.lastElementChild)?.insertAdjacentHTML("afterend", nota);
    desenharPendente();
  }

  // ===== eventos =====
  const campoBusca = el => el && el.matches && (el.matches('#avItensWrap input[data-av-linha-field="descricao"]') || el.id === "avNewDesc");

  document.addEventListener("input", e => {
    if (!campoBusca(e.target) || !ehPecas() || travado() || !podeGravar()) return;
    delete e.target.dataset.pcGravado;
    clearTimeout(drop.timer);
    const alvo = e.target;
    drop.timer = setTimeout(() => buscar(alvo), 220);
  });

  document.addEventListener("keydown", e => {
    if (!drop.el || drop.el.hidden || e.target !== drop.input) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!drop.itens.length) return;
      e.preventDefault();
      drop.ativo = (drop.ativo + (e.key === "ArrowDown" ? 1 : -1) + drop.itens.length) % drop.itens.length;
      desenharDrop(false);
    } else if (e.key === "Enter" && drop.ativo >= 0 && drop.itens.length) {
      e.preventDefault(); e.stopPropagation();
      escolher(drop.ativo);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      fechar();
    }
  }, true);

  document.addEventListener("focusout", e => {
    if (e.target === drop.input) setTimeout(() => { if (document.activeElement !== drop.input) fechar(); }, 120);
  });
  addEventListener("scroll", posicionar, true);
  addEventListener("resize", posicionar);

  // O "change" do campo depois de escolher um produto já foi gravado junto.
  document.addEventListener("change", e => {
    if (campoBusca(e.target) && e.target.dataset.pcGravado === "1") {
      delete e.target.dataset.pcGravado;
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("click", e => {
    let el;
    if ((el = e.target.closest("[data-pc-nat]"))) {
      const id = Number(el.dataset.pcLinha);
      const l = linhas().find(x => x.id === id);
      if (!l) return;
      const nat = el.dataset.pcNat;
      // Clicar no que já está marcado desmarca. Serviço não tem produto.
      const corpo = l.natureza === nat ? { natureza: "" } : { natureza: nat };
      if (nat === "servico" && l.omie_produto_codigo && corpo.natureza === "servico") corpo.omie_produto_codigo = null;
      gravar(id, corpo);
      return;
    }
    if ((el = e.target.closest("[data-pc-tirar]"))) { gravar(Number(el.dataset.pcTirar), { omie_produto_codigo: null }); return; }
    if ((el = e.target.closest("[data-pc-nome]"))) {
      const l = linhas().find(x => x.id === Number(el.dataset.pcNome));
      if (l && l.produto_descricao) gravar(l.id, { descricao: l.produto_descricao.slice(0, 500) });
      return;
    }
    if ((el = e.target.closest("[data-pc-trocar]"))) {
      const tr = el.closest("tr[data-av-linha-id]");
      const inp = tr && tr.querySelector('input[data-av-linha-field="descricao"]');
      if (inp) { inp.focus(); inp.select(); buscar(inp); }
      return;
    }
    if (e.target.closest("[data-pc-pend-tirar]")) { pendente = null; desenharPendente(); return; }
    if ((el = e.target.closest("[data-pc-usada]"))) {
      const l = linhas().find(x => x.id === Number(el.dataset.pcUsada));
      if (l) gravar(l.id, { peca_usada: !l.peca_usada });
      return;
    }
    if ((el = e.target.closest("[data-pc-trazer]"))) {
      el.disabled = true;
      trazerPecas(el.dataset.pcTrazer.split(",").map(Number).filter(Boolean));
      return;
    }
    if ((el = e.target.closest("[data-pc-sit]"))) { marcarPeca(Number(el.dataset.pcPeca), el.dataset.pcSit); return; }
  });

  // ===== gancho =====
  const orig = window._avRenderLinhas;
  if (typeof orig === "function") {
    // ⚠️ O REDESENHO RECRIA O FORMULÁRIO DO ITEM NOVO. Uma gravação que chega
    // enquanto a pessoa digita o item novo (o Serviço de outra linha, o
    // produto escolhido) apagava o texto e tirava o foco — e agora é nesse
    // campo que se busca no Omie. O que estava digitado volta, com o cursor.
    window._avRenderLinhas = function (...a) {
      const ids = ["avNewDesc", "avNewQtd", "avNewVal"];
      const antes = Object.fromEntries(ids.map(id => [id, document.getElementById(id)?.value]));
      const foco = document.activeElement && ids.includes(document.activeElement.id) ? document.activeElement : null;
      const cursor = foco && typeof foco.selectionStart === "number" ? [foco.selectionStart, foco.selectionEnd] : null;
      const focoId = foco && foco.id;
      const r = orig.apply(this, a);
      try {
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el && antes[id] != null && el.value !== antes[id]) el.value = antes[id];
        }
        if (focoId) {
          const el = document.getElementById(focoId);
          if (el && document.activeElement !== el) { el.focus(); if (cursor) try { el.setSelectionRange(cursor[0], cursor[1]); } catch (_) {} }
          if (drop.input && drop.input.id === focoId) drop.input = el;
        }
        decorar();
      } catch (err) { console.error("[pecas] decorar:", err); }
      return r;
    };
  }
  // Trocou de orçamento: a escolha do item novo não vai junto.
  const origPainel = window._avRenderPainel;
  if (typeof origPainel === "function") {
    // Abriu (ou reabriu) um orçamento: as peças da O.S. são lidas de novo.
    window._avRenderPainel = function (...a) { pendente = null; fechar(); osBloco.orcId = null; osBloco.dados = null; return origPainel.apply(this, a); };
  }
})();
