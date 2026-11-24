// ============================================================
// ORÇAMENTO COMO DOCUMENTO + FOTOS (23/11/2026, migration 105)
// ============================================================
//
// Itens 6 e 8 da comparação com os sistemas profissionais (Jobber,
// ServiceTitan, Housecall Pro, Omie). Desenho em
// docs/modulos/orcamento-documento.md.
//
//  - DOCUMENTO (8): orçamento que já saiu do rascunho abre como DOCUMENTO,
//    só leitura, no desenho do que o cliente recebe (cliente, constatação,
//    itens, subtotal/desconto/total, fotos, condições). "Editar" troca para o
//    formulário de sempre; no aprovado, pede confirmação antes, porque mexe
//    no que o cliente aprovou. Salvar volta ao documento. Rascunho e
//    orçamento novo abrem direto no formulário.
//  - FOTOS (6): seção no formulário para pôr foto no orçamento: as da O.S.
//    vinculada (um clique, sem copiar o arquivo) ou do computador (reduzida
//    aqui para 1600 px antes de subir). Vão no PDF e no painel do cliente.
//
// ⚠️ O FORMULÁRIO NÃO FOI REESCRITO. _avRenderPainel (admin.js) desenha tudo
// como sempre; o embrulho no fim deste arquivo acrescenta a coluna do
// documento, a seção de fotos e os botões, e troca o modo por uma classe.
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = v => (typeof _orcFmtValor === "function" ? _orcFmtValor(v) : Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const orc = () => (typeof _avSelecionado !== "undefined" ? _avSelecionado : null);
  const linhas = () => (typeof _avLinhas !== "undefined" && _avLinhasId === orc()?.id ? _avLinhas : null);
  const dataBr = v => {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(v).toLocaleDateString("pt-BR");
  };

  let editandoId = null;   // orçamento aberto no formulário (fora do rascunho)
  let ultimoId = undefined;
  const fotos = { orcId: null, dados: null, carregando: false, erro: null, subindo: 0 };

  const modoDoc = o => !!o && o.id != null && o.status !== "rascunho" && editandoId !== o.id;

  // ── Fotos: dados ─────────────────────────────────────────────────────────
  async function carregarFotos(forcar) {
    const o = orc();
    if (!o || o.id == null) { fotos.orcId = o ? o.id : null; fotos.dados = null; return; }
    if (!forcar && fotos.orcId === o.id && (fotos.dados || fotos.carregando)) return;
    fotos.orcId = o.id; fotos.carregando = true; fotos.erro = null;
    try {
      const r = await fetch(`/admin/orcamentos/avulsos/${o.id}/fotos`, { headers: authHeaders() });
      const j = await lerRespostaJson(r, "Fotos");
      if (!r.ok) throw new Error(j.error || "Erro ao carregar as fotos");
      if (orc()?.id === o.id) fotos.dados = j;
    } catch (e) { fotos.erro = e.message; }
    finally { fotos.carregando = false; }
    desenharFotos();
    if (modoDoc(orc())) desenharDoc();
  }

  async function chamarFotos(url, opts, rotulo) {
    const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders() } });
    const j = await lerRespostaJson(r, rotulo);
    if (!r.ok) throw new Error(j.error || "Não deu certo");
    fotos.dados = j;
    desenharFotos();
  }

  // Lê a foto e reduz para 1600 px no maior lado (JPEG 0,82). As fotos de
  // celular têm 4 a 8 MB; em base64 estourariam o limite do body (CLAUDE.md).
  function reduzir(file) {
    return new Promise((ok, falha) => {
      const fr = new FileReader();
      fr.onerror = () => falha(new Error("Não consegui ler a foto."));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => falha(new Error("Arquivo não é uma imagem que o navegador abre."));
        img.onload = () => {
          const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.82));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  async function subir(files) {
    let id;
    try { id = await _avGarantirRegistro(); }
    catch (e) { alert(e.message); return; }
    fotos.orcId = id;
    for (const f of files) {
      fotos.subindo++; desenharFotos();
      try {
        const b64 = await reduzir(f);
        await chamarFotos(`/admin/orcamentos/avulsos/${id}/fotos`, { method: "POST", body: JSON.stringify({ image_base64: b64 }) }, "Adicionar foto");
      } catch (e) { alert(e.message); }
      finally { fotos.subindo--; desenharFotos(); }
    }
  }

  // ── Fotos: a seção do formulário ─────────────────────────────────────────
  function fotosEdicaoHtml() {
    const d = fotos.dados;
    const lista = d?.fotos || [];
    const daOs = (d?.os_fotos || []);
    const cheio = d && lista.length >= (d.max || 12);
    const grade = lista.map(f => `
      <figure class="av-foto">
        <a class="av-foto-img" href="${esc(f.url)}" target="_blank" rel="noopener" title="Abrir a foto"><img src="${esc(f.url)}" alt="" loading="lazy"></a>
        <input class="input av-foto-leg" type="text" maxlength="255" placeholder="Legenda (opcional)" value="${esc(f.legenda || "")}" data-od-legenda="${f.id}" aria-label="Legenda da foto">
        <button type="button" class="av-foto-tirar" data-od-tirar="${f.id}">tirar</button>
      </figure>`).join("");
    const subindo = fotos.subindo ? `<figure class="av-foto is-subindo"><div class="av-foto-img"><span>Reduzindo e enviando…</span></div></figure>` : "";
    return `
      <div class="av-fotos-cab">
        <span class="ap-section-title">Fotos</span>
        <span class="av-fotos-dica">Vão no PDF e no painel do cliente.</span>
        <label class="btn btn-sm av-fotos-add${cheio ? " is-off" : ""}">Adicionar foto
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-od-arquivo${cheio ? " disabled" : ""}>
        </label>
      </div>
      ${fotos.erro ? `<p class="av-fotos-vazio av-fotos-erro">${esc(fotos.erro)}</p>` : ""}
      ${lista.length || fotos.subindo ? `<div class="av-fotos-grade">${grade}${subindo}</div>`
        : `<p class="av-fotos-vazio">${fotos.carregando ? "Carregando…" : "Nenhuma foto. Foto da peça quebrada ou do problema ajuda o síndico a aprovar."}</p>`}
      ${daOs.length ? `
        <div class="av-fotos-os">
          <span class="av-fotos-os-t">Fotos da ${esc(d.os_numero || "O.S.")}</span>
          <div class="av-fotos-os-lista">${daOs.map(f => `
            <button type="button" class="av-foto-os${f.incluida ? " is-on" : ""}" ${f.incluida || cheio ? "disabled" : ""} data-od-incluir="${f.id}" title="${esc(f.legenda || "")}">
              <img src="${esc(f.url)}" alt="" loading="lazy"><span>${f.incluida ? "no orçamento" : "+ incluir"}</span>
            </button>`).join("")}
          </div>
        </div>` : ""}`;
  }

  function desenharFotos() {
    const z = document.getElementById("avFotos");
    if (!z) return;
    // O foco numa legenda sobrevive ao redesenho.
    const ativo = document.activeElement?.dataset?.odLegenda;
    z.innerHTML = fotosEdicaoHtml();
    if (ativo) z.querySelector(`[data-od-legenda="${ativo}"]`)?.focus();
  }

  // ── O documento ──────────────────────────────────────────────────────────
  function clienteHtml(o) {
    if (o.condominio_id) {
      const c = (typeof _avCondos !== "undefined" ? _avCondos : []).find(x => String(x.id) === String(o.condominio_id)) || {};
      const end = [c.endereco, c.bairro, c.cidade && c.uf ? c.cidade + "/" + c.uf : c.cidade].filter(Boolean).join(" · ");
      return `
        <div class="od-cli-nome">${esc(c.nome || o.condominio_nome || "—")}</div>
        ${c.razao_social && c.razao_social !== c.nome ? `<div class="od-cli-det">${esc(c.razao_social)}</div>` : ""}
        ${c.cnpj ? `<div class="od-cli-det">CNPJ <span class="od-num">${esc(c.cnpj)}</span></div>` : ""}
        ${end ? `<div class="od-cli-det">${esc(end)}</div>` : ""}`;
    }
    return `
      <div class="od-cli-nome">${esc(o.cliente_nome || "—")}</div>
      ${o.cliente_documento ? `<div class="od-cli-det">CPF/CNPJ <span class="od-num">${esc(o.cliente_documento)}</span></div>` : ""}
      ${o.cliente_endereco ? `<div class="od-cli-det">${esc(o.cliente_endereco)}</div>` : ""}
      ${o.cliente_email ? `<div class="od-cli-det">${esc(o.cliente_email)}</div>` : ""}`;
  }

  function itensHtml(o, ls) {
    if (!ls) return `<p class="od-vazio">Carregando os itens…</p>`;
    if (!ls.length) return `<p class="od-vazio">Nenhum item no orçamento.</p>`;
    const servico = (o.tipo || "pecas") !== "pecas";
    const manual = _avTotalManual(o);
    const comPreco = !manual;
    const soma = ls.reduce((s, l) => s + Number(l.valor_unitario || 0) * Number(l.quantidade), 0);
    const desc = o.desconto_tipo ? _avDescontoCalc(soma, o.desconto_tipo, Number(o.desconto_valor)) : 0;
    const total = _avComputeTotal(o, ls);
    const corpo = ls.map((l, k) => {
      const unit = l.valor_unitario == null ? null : Number(l.valor_unitario);
      const tot = unit == null ? null : unit * Number(l.quantidade);
      return `<tr>
        <td class="od-idx">${k + 1}</td>
        <td class="od-desc"><div class="od-desc-t">${esc(l.descricao)}</div>${l.ficha_tecnica ? `<div class="od-ficha">${esc(l.ficha_tecnica)}</div>` : ""}</td>
        ${servico ? "" : `<td class="n">${esc(l.quantidade)}</td>`}
        ${comPreco && !servico ? `<td class="n">${unit == null ? "—" : moeda(unit)}</td>` : ""}
        ${comPreco ? `<td class="n"><b>${tot == null ? "—" : moeda(tot)}</b></td>` : ""}
      </tr>`;
    }).join("");
    const pct = o.desconto_tipo === "percentual" ? ` (${String(Number(o.desconto_valor)).replace(".", ",")}%)` : "";
    return `
      <table class="od-tab">
        <thead><tr><th class="od-idx">#</th><th>Descrição</th>${servico ? "" : `<th class="n">Qtd</th>`}${comPreco && !servico ? `<th class="n">Unitário</th>` : ""}${comPreco ? `<th class="n">${servico ? "Valor" : "Total"}</th>` : ""}</tr></thead>
        <tbody>${corpo}</tbody>
      </table>
      <div class="od-totais">
        ${o.desconto_tipo ? `
          <div class="od-tot-l"><span>Subtotal</span><b>${moeda(soma)}</b></div>
          <div class="od-tot-l od-tot-desc"><span>Desconto${pct}</span><b>− ${moeda(desc)}</b></div>` : ""}
        ${manual ? `<div class="od-tot-l"><span>Valor fechado (sem preço por item)</span><b></b></div>` : ""}
        <div class="od-tot-l od-tot-final"><span>Total</span><b>${moeda(total)}</b></div>
      </div>`;
  }

  function fotosDocHtml() {
    const lista = fotos.dados?.fotos || [];
    if (!lista.length) return "";
    return `
      <section class="od-sec">
        <h3 class="od-h">Fotos</h3>
        <div class="od-fotos">${lista.map(f => `
          <figure class="od-foto"><a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="" loading="lazy"></a>
            ${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ""}</figure>`).join("")}
        </div>
      </section>`;
  }

  function docHtml(o) {
    const ls = linhas();
    const semGar = typeof _avEhSemGarantia === "function" && _avEhSemGarantia(o.garantia);
    const tipos = { pecas: "Peças e serviços", limpeza_reservatorio: "Limpeza de reservatório", dedetizacao: "Dedetização", limpeza_dedetizacao: "Limpeza + dedetização" };
    const cond = [
      ["Forma de pagamento", o.forma_pagamento || "Via boleto bancário"],
      ["Prazo de entrega", o.prazo_entrega || "5 dias úteis após aprovação"],
      ...(semGar ? [] : [["Garantia", o.garantia || "12 meses por defeito de fabricação"]]),
      ["Validade", o.valido_ate ? "até " + dataBr(o.valido_ate) : "sem validade"],
    ];
    return `
      <article class="od-folha" aria-label="Orçamento como o cliente recebe">
        <header class="od-cab">
          <div>
            <div class="od-rot">Orçamento</div>
            <div class="od-num-doc">${esc(o.numero || "—")}</div>
            <div class="od-cab-det">${esc(tipos[o.tipo || "pecas"] || "")} · ${esc(dataBr(o.data_documento || o.criado_em))}</div>
          </div>
          <img class="od-logo" src="/static/logo-azul.png" alt="General Bombas">
        </header>

        <section class="od-sec od-cli">
          <h3 class="od-h">Cliente</h3>
          ${clienteHtml(o)}
        </section>

        ${o.constatacao ? `
        <section class="od-sec">
          <h3 class="od-h">Constatação</h3>
          <p class="od-texto">${esc(o.constatacao)}</p>
        </section>` : ""}

        <section class="od-sec">
          <h3 class="od-h">${(o.tipo || "pecas") !== "pecas" ? "Valores dos serviços" : "Itens"}</h3>
          ${itensHtml(o, ls)}
        </section>

        ${fotosDocHtml()}

        <section class="od-sec">
          <h3 class="od-h">Condições comerciais</h3>
          <dl class="od-cond">${cond.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        </section>
      </article>
      <p class="od-pe">É o que o cliente vê no painel e no PDF. Para mudar, use Editar.</p>`;
  }

  function desenharDoc() {
    const el = document.getElementById("avDoc");
    const o = orc();
    if (!el || !o) return;
    el.innerHTML = docHtml(o);
  }

  // ── Modo e botões ────────────────────────────────────────────────────────
  function aplicarModo() {
    const o = orc();
    const layout = document.querySelector("#avModalBody .av-layout");
    if (!layout || !o) return;
    const doc = modoDoc(o);
    layout.classList.toggle("is-doc", doc);
    for (const id of ["avInputStatus", "avInputTipo"]) {
      const s = document.getElementById(id);
      if (s) s.disabled = doc;
    }
    const head = document.querySelector("#avModalBody .av-modal-head");
    if (head) {
      let box = head.querySelector(".av-head-acoes");
      if (!box) {
        box = document.createElement("div");
        box.className = "av-head-acoes";
        head.querySelector(".av-voltar")?.before(box);
      }
      box.innerHTML = o.id == null || o.status === "rascunho" ? ""
        : doc
          ? `<button type="button" class="btn btn-sm" data-od="editar">Editar</button>`
          : `<span class="av-head-modo">Editando</span><button type="button" class="btn btn-sm" data-od="documento">Ver documento</button>`;
    }
    if (doc) desenharDoc();
  }

  function editar() {
    const o = orc();
    if (!o) return;
    if (o.status === "aprovado") {
      const quem = o.respondido_nome ? ` por ${o.respondido_nome}` : "";
      const quando = o.respondido_em ? ` em ${new Date(o.respondido_em).toLocaleDateString("pt-BR")}` : "";
      if (!confirm(`Este orçamento foi aprovado${quem}${quando}.\n\nAlterar agora muda o documento que o cliente aprovou: o painel e o PDF dele passam a mostrar a versão nova.\n\nEditar mesmo assim?`)) return;
    }
    editandoId = o.id;
    aplicarModo();
    document.querySelector(".content")?.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function verDocumento() {
    const o = orc();
    if (!o) return;
    if (typeof _avSujo !== "undefined" && _avSujo) {
      if (!confirm("Descartar as alterações não salvas?\n\nItens e fotos já foram gravados na hora; o que se perde é o resto do formulário (cliente, constatação, condições, total).")) return;
      editandoId = null;
      _avRenderPainel();   // redesenha a partir do que está salvo
      return;
    }
    editandoId = null;
    aplicarModo();
  }

  window._odAposSalvar = () => { editandoId = null; };

  // ── Montagem (depois de cada _avRenderPainel) ────────────────────────────
  function montar() {
    const o = orc();
    const wrap = document.getElementById("avModalBody");
    if (!o || !wrap) return;
    if (o.id !== ultimoId) { editandoId = null; ultimoId = o.id; fotos.dados = null; fotos.orcId = null; }

    const layout = wrap.querySelector(".av-layout");
    const form = wrap.querySelector(".av-col-form");
    if (!layout || !form) return;

    if (!wrap.querySelector("#avDoc")) form.insertAdjacentHTML("beforebegin", `<div class="av-col-doc" id="avDoc"></div>`);

    if (!wrap.querySelector("#avFotos")) {
      const zona = document.getElementById("avItensZone");
      const sec = document.createElement("section");
      sec.className = "av-fotos";
      sec.id = "avFotos";
      (zona || form.lastElementChild).after(sec);
      // Foto grava na hora (como os itens): mexer aqui não deixa o
      // formulário "com alteração não salva".
      for (const ev of ["input", "change"]) sec.addEventListener(ev, e => e.stopPropagation());
      sec.addEventListener("change", async e => {
        const arq = e.target.closest("[data-od-arquivo]");
        if (arq && arq.files?.length) { const fs = [...arq.files]; arq.value = ""; await subir(fs); return; }
        const leg = e.target.closest("[data-od-legenda]");
        if (leg) {
          try { await chamarFotos(`/admin/orcamentos/avulsos/fotos/${leg.dataset.odLegenda}`, { method: "PATCH", body: JSON.stringify({ legenda: leg.value }) }, "Legenda"); }
          catch (err) { alert(err.message); }
        }
      });
      sec.addEventListener("click", async e => {
        let el;
        if ((el = e.target.closest("[data-od-tirar]"))) {
          if (!confirm("Tirar esta foto do orçamento? (A foto da O.S., se for uma, continua na O.S.)")) return;
          try { await chamarFotos(`/admin/orcamentos/avulsos/fotos/${el.dataset.odTirar}`, { method: "DELETE" }, "Tirar foto"); }
          catch (err) { alert(err.message); }
          return;
        }
        if ((el = e.target.closest("[data-od-incluir]"))) {
          el.disabled = true;
          try { await chamarFotos(`/admin/orcamentos/avulsos/${orc().id}/fotos`, { method: "POST", body: JSON.stringify({ os_foto_id: Number(el.dataset.odIncluir) }) }, "Incluir foto"); }
          catch (err) { alert(err.message); el.disabled = false; }
        }
      });
    }

    desenharFotos();
    carregarFotos();
    aplicarModo();
  }

  // Botões do cabeçalho (Editar / Ver documento): delegação no documento,
  // porque o cabeçalho é recriado a cada render.
  document.addEventListener("click", e => {
    const b = e.target.closest("#avModalBody [data-od]");
    if (!b) return;
    if (b.dataset.od === "editar") editar();
    else if (b.dataset.od === "documento") verDocumento();
  });

  // ── Ganchos ──────────────────────────────────────────────────────────────
  const origPainel = window._avRenderPainel;
  if (typeof origPainel === "function") {
    window._avRenderPainel = function (...a) {
      const r = origPainel.apply(this, a);
      try { montar(); } catch (err) { console.error("[orc-doc] montar:", err); }
      return r;
    };
  }
  const origLinhas = window._avRenderLinhas;
  if (typeof origLinhas === "function") {
    window._avRenderLinhas = function (...a) {
      const r = origLinhas.apply(this, a);
      try { if (modoDoc(orc())) desenharDoc(); } catch (err) { console.error("[orc-doc] doc:", err); }
      return r;
    };
  }
})();
