// ============================================================
// GUIAS DE TRIBUTOS — do PDF do Onvio ao contas a pagar do Omie (23/11/2026)
// ============================================================
//
// A aba "Guias" do Financeiro, no molde de lista (admin-lista.js). Ver
// docs/modulos/guias-tributos.md.
//
// O caminho: "Enviar PDF" (ou arrastar os PDFs para a tela) → o servidor lê
// tipo, valor, vencimento e código de barras e já põe fornecedor, categoria e
// conta da regra do tipo → alguém confere no painel → "Lançar no Omie" cria a
// conta a pagar com o PDF anexado.
//
// ⚠️ O VALOR VEM DO CÓDIGO DE BARRAS. Se o valor digitado não bate com o do
// código, o servidor recusa: é o código que o banco cobra.
//
// ⚠️ "LANÇAR" GRAVA NO OMIE (sem ambiente de teste lá). Antes de incluir, o
// servidor procura a mesma guia entre os títulos do fornecedor no Omie (hoje
// as guias são lançadas à mão): achou, a tela mostra quais e só "Lançar mesmo
// assim" passa.
//
// Só o admin (a rota devolve 403 aos outros).
//
// O que expõe: window.GBGuias = { montar, carregar, resumo } — o Financeiro
// monta a lista no palco dele e põe "N guias a lançar" no "Pede ação".
//
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md).

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = {
    dados: null, regras: {}, ligado: false, hoje: null, erro: null, pedido: null,
    opcoes: null, opcoesPedido: null, gravando: false, subindo: null,
    parecidas: {},            // id → lista do 409
    fornBusca: "", fornRes: null, fornTimer: null,
  };
  const admin = () => typeof _myRole !== "undefined" && _myRole === "admin";
  const lista0 = () => st.dados || [];
  const moeda = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const dataBr = s => {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString("pt-BR");
  };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const compTxt = c => { const m = String(c || "").match(/^(\d{4})-(\d{2})$/); return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : ""; };
  const TIPOS = [
    ["das", "DAS · Simples Nacional"], ["darf", "DARF"], ["fgts", "FGTS Digital"], ["dae", "DAE · eSocial"],
    ["gps", "GPS · INSS"], ["parcelamento", "Parcelamento"], ["municipal", "Guia municipal"], ["outro", "Outra guia"],
  ];
  const tipoNome = t => (TIPOS.find(x => x[0] === t) || [t, "Guia"])[1];
  const aLancar = g => ["conferir", "erro", "incerto"].includes(g.status);
  const dias = g => {
    if (!g.vencimento) return null;
    const h = new Date((st.hoje || new Date().toISOString().slice(0, 10)) + "T12:00:00");
    return Math.round((new Date(g.vencimento + "T12:00:00") - h) / 86400e3);
  };
  const urgente = g => aLancar(g) && dias(g) != null && dias(g) <= 5;
  const prazoTxt = g => {
    const d = dias(g);
    if (d == null) return `<span class="ls-txt-at">sem vencimento</span>`;
    if (g.status === "lancada") return "no Omie";
    if (d < 0) return `<span class="ls-txt-ri">venceu há ${pl(-d, "dia", "dias")}</span>`;
    if (d === 0) return `<span class="ls-txt-ri">vence hoje</span>`;
    return d <= 5 ? `<span class="ls-txt-at">em ${pl(d, "dia", "dias")}</span>` : `em ${pl(d, "dia", "dias")}`;
  };
  const SELO = {
    conferir: ["at", "a conferir"], erro: ["ri", "o Omie recusou"], incerto: ["at", "sem resposta do Omie"],
    enviando: ["info", "lançando…"], lancada: ["ok", "no Omie"], descartada: ["cz", "descartada"],
  };
  const selo = g => { const [c, t] = SELO[g.status] || ["cz", g.status]; return `<span class="ls-selo is-${c}">${t}</span>`; };
  const titulo = g => `${g.descricao || tipoNome(g.tipo)}${g.competencia ? " · " + compTxt(g.competencia) : ""}`;

  async function json(r, nome) { return typeof lerRespostaJson === "function" ? lerRespostaJson(r, nome) : r.json(); }

  // ===== carga =====
  async function carregar() {
    if (!admin()) return;
    if (st.pedido) return st.pedido;
    st.erro = null;
    if (ativa()) lista.desenhar();
    st.pedido = (async () => {
      try {
        const r = await fetch("/admin/guias", { headers: authHeaders() });
        const j = await json(r, "Guias");
        if (!r.ok) throw new Error(j.error || "Erro ao listar as guias");
        st.dados = j.guias || [];
        st.regras = j.regras || {};
        st.ligado = !!j.envio_ligado;
        st.hoje = j.hoje || null;
      } catch (e) {
        st.erro = e.message;
      } finally {
        st.pedido = null;
      }
      if (ativa()) lista.desenhar();
      document.dispatchEvent(new CustomEvent("gb:guias"));
    })();
    return st.pedido;
  }

  // Categorias e contas do Omie (o servidor guarda 6 h).
  function garantirOpcoes() {
    if (st.opcoes || st.opcoesPedido) return;
    st.opcoesPedido = fetch("/admin/guias/opcoes", { headers: authHeaders() })
      .then(r => json(r, "Opções do Omie"))
      .then(j => { st.opcoes = { categorias: j.categorias || [], contas: j.contas || [], erro: j.erro || null }; })
      .catch(e => { st.opcoes = { categorias: [], contas: [], erro: e.message }; })
      .finally(() => { st.opcoesPedido = null; if (ativa()) lista.desenharLado(); });
  }

  // ===== subir PDFs =====
  const lerBase64 = f => new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ""));
    fr.onerror = () => falha(new Error("Não consegui ler " + f.name));
    fr.readAsDataURL(f);
  });
  async function subir(arquivos) {
    const pdfs = [...arquivos].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!pdfs.length) { alert("Mande o PDF da guia (o arquivo que o contador publica no Onvio)."); return; }
    const resumo = { novas: [], repetidas: 0, semCodigo: 0, erros: [] };
    for (let i = 0; i < pdfs.length; i++) {
      st.subindo = `Lendo ${i + 1} de ${pdfs.length}…`;
      if (ativa()) lista.desenhar();
      const f = pdfs[i];
      try {
        if (f.size > 4 * 1024 * 1024) throw new Error("acima de 4 MB");
        const r = await fetch("/admin/guias", {
          method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ nome: f.name, pdf_base64: await lerBase64(f) }),
        });
        const j = await json(r, "Enviar guia");
        if (!r.ok) throw new Error(j.error || "não consegui ler");
        resumo.novas.push(...(j.guias || []));
        resumo.repetidas += (j.repetidas || []).length;
        if (j.sem_codigo) resumo.semCodigo++;
      } catch (e) { resumo.erros.push(`${f.name}: ${e.message}`); }
    }
    st.subindo = null;
    await carregar();
    if (resumo.novas.length) lista.selecionar(resumo.novas[0].id);
    const partes = [];
    if (resumo.novas.length) partes.push(pl(resumo.novas.length, "guia nova", "guias novas") + " para conferir");
    if (resumo.repetidas) partes.push(pl(resumo.repetidas, "já estava aqui", "já estavam aqui"));
    if (resumo.semCodigo) partes.push(pl(resumo.semCodigo, "PDF sem código de barras", "PDFs sem código de barras") + " (digite a linha)");
    if (resumo.erros.length || resumo.repetidas || resumo.semCodigo) alert([partes.join(" · "), ...resumo.erros].filter(Boolean).join("\n"));
  }

  // ===== ações do painel =====
  const val = id => document.getElementById(id)?.value ?? "";
  // "17.199,44", "17199,44" e "17199.44" valem o mesmo. Com vírgula, ponto é
  // milhar; sem vírgula, ponto seguido de 1–2 dígitos no fim é decimal.
  const numeroDigitado = s => {
    const t = String(s || "").trim().replace(/[R$\s]/g, "");
    if (!t) return null;
    if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
    return Number(t);
  };
  function camposDoForm() {
    return {
      tipo: val("guTipo"),
      competencia: val("guComp") || null,
      vencimento: val("guVenc") || null,
      valor: numeroDigitado(val("guValor")),
      linha_digitavel: val("guLinha"),
      numero_documento: val("guDoc"),
      omie_fornecedor: val("guForn") ? Number(val("guForn")) : null,
      omie_categoria: val("guCat") || null,
      omie_conta: val("guConta") ? Number(val("guConta")) : null,
      lembrar: !!document.getElementById("guLembrar")?.checked,
    };
  }
  async function salvar(g, { calado = false } = {}) {
    const corpo = camposDoForm();
    // Trocar o tipo traz a regra do tipo novo: o servidor só aplica se o
    // destino não vier junto, então manda sem ele.
    if (corpo.tipo !== g.tipo && !corpo.lembrar) { delete corpo.omie_fornecedor; delete corpo.omie_categoria; delete corpo.omie_conta; }
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/guias/${g.id}`, {
        method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const j = await json(r, "Salvar guia");
      if (!r.ok) throw new Error(j.error || "Não consegui salvar");
      const i = lista0().findIndex(x => x.id === g.id);
      if (i >= 0) st.dados[i] = j.guia;
      if (corpo.lembrar) st.regras[j.guia.tipo] = { fornecedor: j.guia.omie.fornecedor, categoria: j.guia.omie.categoria, conta: j.guia.omie.conta };
      return j.guia;
    } catch (e) {
      alert(e.message);
      return null;
    } finally {
      st.gravando = false;
      if (!calado) lista.desenhar();
    }
  }

  async function lancar(g, forcar) {
    // Salva o que está no formulário antes: lança o que a tela mostra.
    const atual = ["conferir", "erro"].includes(g.status) ? await salvar(g, { calado: true }) : g;
    if (!atual) { lista.desenhar(); return; }
    const forn = atual.omie.fornecedor_nome || "?";
    const cat = (st.opcoes?.categorias || []).find(c => c.codigo === atual.omie.categoria);
    const conta = (st.opcoes?.contas || []).find(c => c.codigo === atual.omie.conta);
    const msg = [
      forcar ? "Lançar MESMO ASSIM? O Omie já tem uma conta a pagar parecida." : "Lançar no contas a pagar do Omie?",
      "",
      `${titulo(atual)} · ${moeda(atual.valor)}`,
      `Vence em ${dataBr(atual.vencimento)}`,
      `Fornecedor: ${forn}`,
      `Categoria: ${atual.omie.categoria || "?"}${cat ? " " + cat.descricao : ""}`,
      `Conta: ${conta ? conta.descricao : atual.omie.conta || "?"}`,
      "",
      "Isto grava no Omie (não tem ambiente de teste lá).",
    ].join("\n");
    if (!confirm(msg)) { lista.desenhar(); return; }
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/guias/${g.id}/lancar`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ forcar: !!forcar }),
      });
      const j = await json(r, "Lançar no Omie");
      if (r.status === 409 && j.parecidas) { st.parecidas[g.id] = j.parecidas; }
      else if (!r.ok) throw new Error(j.error || "Não consegui lançar");
      else {
        delete st.parecidas[g.id];
        if (j.anexo && !j.anexo.ok) alert("Lançado no Omie, mas o PDF não foi anexado: " + (j.anexo.motivo || "erro") + ". Dá para tentar de novo no painel.");
      }
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  async function acao(g, caminho, nome) {
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/guias/${g.id}/${caminho}`, { method: "POST", headers: authHeaders() });
      const j = await json(r, nome);
      if (!r.ok) throw new Error(j.error || "Não consegui");
      if (j.anexo && !j.anexo.ok) alert("O Omie recusou o anexo de novo: " + (j.anexo.motivo || "erro"));
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  async function verPdf(g, el) {
    const w = window.open("", "_blank");
    el.disabled = true;
    try {
      const r = await fetch(`/admin/guias/${g.id}/pdf`, { headers: authHeaders() });
      if (!r.ok) { const j = await json(r, "PDF"); throw new Error(j.error || "Não consegui abrir o PDF"); }
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { if (w) w.close(); alert(e.message); }
    finally { el.disabled = false; }
  }

  function buscarFornecedor(q) {
    clearTimeout(st.fornTimer);
    st.fornBusca = q;
    st.fornTimer = setTimeout(async () => {
      try {
        const r = await fetch("/admin/guias/fornecedores?q=" + encodeURIComponent(q), { headers: authHeaders() });
        const j = await json(r, "Fornecedores");
        st.fornRes = j.fornecedores || [];
      } catch (_) { st.fornRes = []; }
      const box = document.getElementById("guFornRes");
      if (box) box.innerHTML = fornResHtml();
    }, 250);
  }
  const fornResHtml = () => (st.fornRes || []).length
    ? st.fornRes.map(f => `<button type="button" class="gu-forn-op" data-gu-forn="${f.codigo}" data-gu-forn-nome="${esc(f.nome)}"><b>${esc(f.nome)}</b>${f.fantasia && f.fantasia !== f.nome ? `<span class="ls-sub">${esc(f.fantasia)}</span>` : ""}</button>`).join("")
    : (st.fornRes ? `<p class="ls-nada">Nada com esse nome na cópia do Omie.</p>` : "");

  // ===== o painel =====
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const opt = (v, t, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? "") ? " selected" : ""}>${esc(t)}</option>`;

  function formConferir(g) {
    const ops = st.opcoes;
    const cats = ops?.categorias || [];
    const contas = ops?.contas || [];
    const catAtual = g.omie.categoria && !cats.some(c => c.codigo === g.omie.categoria) ? [{ codigo: g.omie.categoria, descricao: "(código guardado)" }] : [];
    const contaAtual = g.omie.conta && !contas.some(c => c.codigo === g.omie.conta) ? [{ codigo: g.omie.conta, descricao: "(conta " + g.omie.conta + ")" }] : [];
    const dis = st.gravando ? "disabled" : "";
    return `
      <div class="cb-form gu-form">
        <label><span>Tipo</span><select id="guTipo" ${dis}>${TIPOS.map(([k, t]) => opt(k, t, g.tipo)).join("")}</select></label>
        <div class="gu-duas">
          <label><span>Competência</span><input type="month" id="guComp" value="${esc(g.competencia || "")}" ${dis}></label>
          <label><span>Vencimento</span><input type="date" id="guVenc" value="${esc(g.vencimento || "")}" ${dis}></label>
        </div>
        <div class="gu-duas">
          <label><span>Valor (R$)</span><input type="text" inputmode="decimal" id="guValor" value="${g.valor == null ? "" : esc(Number(g.valor).toFixed(2).replace(".", ","))}" ${dis}></label>
          <label><span>Nº do documento</span><input type="text" id="guDoc" maxlength="40" value="${esc(g.numero_documento || "")}" ${dis}></label>
        </div>
        <label><span>Linha digitável</span><input type="text" id="guLinha" class="ls-mono" inputmode="numeric" value="${esc(g.linha_formatada || "")}" placeholder="Os 48 números embaixo do código de barras" ${dis}></label>
      </div>
      ${sec("No Omie", `
        <div class="cb-form gu-form">
          <label><span>Fornecedor</span>
            <input type="hidden" id="guForn" value="${esc(g.omie.fornecedor || "")}">
            <span class="gu-forn-atual">${g.omie.fornecedor ? esc(g.omie.fornecedor_nome || "Fornecedor " + g.omie.fornecedor) : `<span class="ls-txt-at">escolha o fornecedor</span>`}</span>
            <input type="search" id="guFornQ" placeholder="Trocar: busque pelo nome (ex.: Receita)" value="${esc(st.fornBusca)}" ${dis}>
            <div id="guFornRes" class="gu-forn-res">${st.fornBusca ? fornResHtml() : ""}</div>
          </label>
          <label><span>Categoria</span><select id="guCat" ${dis}>${opt("", ops ? "Escolha a categoria" : "Carregando do Omie…", g.omie.categoria || "")}${[...catAtual, ...cats].map(c => opt(c.codigo, `${c.codigo} · ${c.descricao}`, g.omie.categoria)).join("")}</select></label>
          <label><span>Conta</span><select id="guConta" ${dis}>${opt("", ops ? "Escolha a conta" : "Carregando do Omie…", g.omie.conta || "")}${[...contaAtual, ...contas].map(c => opt(c.codigo, c.descricao, g.omie.conta)).join("")}</select></label>
          ${ops && ops.erro ? `<p class="ls-txt-ri">Não consegui ler categorias e contas do Omie: ${esc(ops.erro)}</p>` : ""}
          <label class="gu-lembrar"><input type="checkbox" id="guLembrar" ${dis}><span>Usar este fornecedor, categoria e conta sempre para ${esc(tipoNome(g.tipo))}</span></label>
        </div>`)}`;
  }

  function blocoParecidas(g) {
    const p = st.parecidas[g.id];
    if (!p || !p.length) return "";
    return `<div class="gu-alerta is-ri">${ico("copy")}<div>
        <b>${p.some(x => x.mesmo_codigo) ? "Esta guia já está no Omie." : "O Omie já tem uma conta a pagar deste fornecedor com o mesmo valor e vencimento."}</b>
        <ul>${p.map(x => `<li><span class="ls-mono">#${x.codigo}</span> · ${moeda(x.valor)} · vence ${dataBr(x.vencimento)}${x.status ? " · " + esc(String(x.status).toLowerCase()) : ""}${x.mesmo_codigo ? " · mesmo código de barras" : ""}</li>`).join("")}</ul>
        <span>Provavelmente alguém lançou à mão. Se for outra guia mesmo, dá para lançar assim mesmo.</span>
        <div class="oc-bts"><button type="button" class="ls-bt is-p" data-gu-forcar ${st.gravando ? "disabled" : ""}>Lançar mesmo assim</button>
        <button type="button" class="ls-bt is-p is-ghost" data-gu-descartar ${st.gravando ? "disabled" : ""}>Descartar esta guia</button></div>
      </div></div>`;
  }

  function detalhe(g) {
    const editavel = ["conferir", "erro"].includes(g.status);
    const avisos = (g.avisos || []).length ? `<div class="gu-alerta is-at">${ico("triangle-alert")}<div>${g.avisos.map(a => `<span>${esc(a)}</span>`).join("")}</div></div>` : "";
    const erro = g.status === "erro" && g.omie.erro ? `<div class="gu-alerta is-ri">${ico("circle-x")}<div><b>O Omie recusou</b><span>${esc(g.omie.erro)}</span></div></div>` : "";
    const incerto = g.status === "incerto" ? `<div class="gu-alerta is-at">${ico("cloud-off")}<div><b>O Omie não respondeu da última vez.</b><span>A conta a pagar pode ter sido criada. "Conferir e lançar" pergunta ao Omie antes e não cria duas.</span></div></div>` : "";
    const desligado = aLancar(g) && !st.ligado ? `<p class="ls-nada">Envio ao Omie desligado neste ambiente (OMIE_EMISSAO): dá para conferir, não para lançar.</p>` : "";
    const botoes = aLancar(g) ? `<div class="oc-bts">
        <button type="button" class="ls-bt is-p is-pri" data-gu-lancar ${st.gravando || !st.ligado ? "disabled" : ""}>${ico("send")}${st.gravando ? "Aguarde…" : g.status === "incerto" ? "Conferir e lançar" : "Lançar no Omie"}</button>
        ${editavel ? `<button type="button" class="ls-bt is-p" data-gu-salvar ${st.gravando ? "disabled" : ""}>${ico("check")}Salvar</button>` : ""}
        ${editavel ? `<button type="button" class="ls-bt is-p is-ghost" data-gu-descartar ${st.gravando ? "disabled" : ""}>Descartar</button>` : ""}
      </div>${desligado}` : "";

    const noOmie = g.status === "lancada" ? sec("No Omie", fatos([
      ["Conta a pagar", `<span class="ls-mono">#${g.omie.codigo}</span>`],
      ["Lançada", `${dataBr(g.enviado_em)}${g.enviado_por ? " · " + esc(g.enviado_por) : ""}`],
      ["Fornecedor", esc(g.omie.fornecedor_nome || "—"), true],
      ["Categoria", esc(g.omie.categoria || "—")],
      ["Conta", esc(((st.opcoes?.contas || []).find(c => c.codigo === g.omie.conta) || {}).descricao || g.omie.conta || "—")],
      ["PDF anexado", g.omie.anexo_ok ? `${ico("circle-check")} sim`
        : `<span class="ls-txt-at">não${g.omie.anexo_erro ? " · " + esc(g.omie.anexo_erro) : ""}</span> <button type="button" class="ls-bt is-p" data-gu-anexo ${st.gravando ? "disabled" : ""}>Anexar de novo</button>`, true],
    ])) : "";

    const guia = editavel
      ? sec("Guia", formConferir(g))
      : sec("Guia", fatos([
        ["Tipo", esc(tipoNome(g.tipo))],
        ["Competência", esc(compTxt(g.competencia) || "—")],
        ["Vencimento", dataBr(g.vencimento) || "—"],
        ["Valor", `<span class="ls-mono">${moeda(g.valor)}</span>`],
        ["Nº do documento", esc(g.numero_documento || "—"), true],
        ["Linha digitável", `<span class="ls-mono gu-linha">${esc(g.linha_formatada || "—")}</span>`, true],
      ]));

    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico("landmark")}<span>${esc(tipoNome(g.tipo))}${g.cnpj ? " · CNPJ " + esc(g.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")) : ""}</span></div>
        <h2>${esc(titulo(g))}</h2>
        <div class="ls-l-selo">${selo(g)}<span class="ls-mudo">${moeda(g.valor)} · vence ${dataBr(g.vencimento) || "?"}</span></div>
        <div class="oc-bts">${g.tem_pdf ? `<button type="button" class="ls-bt is-p" data-gu-pdf>${ico("file-text")}Ver PDF</button>` : ""}
          ${g.status === "descartada" ? `<button type="button" class="ls-bt is-p" data-gu-restaurar ${st.gravando ? "disabled" : ""}>Voltar para a conferência</button>` : ""}</div>
      </div>
      ${blocoParecidas(g)}${avisos}${erro}${incerto}
      ${guia}
      ${noOmie}
      ${botoes}
      <p class="ls-nada">${g.arquivo_nome ? esc(g.arquivo_nome) + " · " : ""}entrou em ${dataBr(g.criado_em)}${g.criado_por ? " por " + esc(g.criado_por) : ""}</p>`;
  }

  // ===== a lista =====
  const ordem = () => [...lista0()].sort((a, b) => {
    const pa = aLancar(a) ? 0 : 1, pb = aLancar(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(a.vencimento || "0000").localeCompare(String(b.vencimento || "0000")) * (pa ? -1 : 1) || b.id - a.id;
  });
  const lista = window.GBLista.criar({
    id: "guias",
    raiz: "guLsRoot",
    titulo: "Guias de tributos",
    nomePlural: "as guias",
    buscaDica: "Tipo, competência, valor ou documento",
    dados: ordem,
    chave: g => g.id,
    texto: g => `${titulo(g)} ${tipoNome(g.tipo)} ${g.numero_documento || ""} ${g.omie.fornecedor_nome || ""} ${moeda(g.valor)} ${dataBr(g.vencimento)} ${g.arquivo_nome || ""}`,
    estado: () => (st.erro && !st.dados ? "erro" : !st.dados ? "carregando" : "pronto"),
    recarregar: () => carregar(),
    visoes: [
      ["lancar", "A lançar", aLancar],
      ["urgente", "Vencendo", urgente, "ri", d => d.some(urgente)],
      ["omie", "No Omie", g => g.status === "lancada", "ok"],
      ["descartadas", "Descartadas", g => g.status === "descartada", "", d => d.some(g => g.status === "descartada")],
      ["todas", "Todas", () => true],
    ],
    vazios: {
      lancar: "Nenhuma guia esperando. Mande os PDFs que o contador publicou no Onvio.",
      urgente: "Nenhuma guia a lançar vencendo nos próximos 5 dias.",
      omie: "Nenhuma guia lançada pelo sistema ainda.",
      descartadas: "Nenhuma guia descartada.",
      todas: "Nenhuma guia ainda. Arraste os PDFs das guias (DAS, DARF, FGTS…) para esta tela.",
    },
    icVazio: "file-up",
    frase: (d, estado) => {
      if (st.subindo) return `<span class="ls-txt-in">${esc(st.subindo)}</span>`;
      if (estado !== "pronto") return "Do PDF do Onvio ao contas a pagar do Omie.";
      const a = d.filter(aLancar);
      const soma = a.reduce((s, g) => s + (Number(g.valor) || 0), 0);
      const urg = a.filter(urgente).length;
      return a.length
        ? [`<b>${pl(a.length, "guia", "guias")}</b> a lançar`, `<b>${moeda(soma)}</b>`, urg ? `<span class="ls-txt-ri">${pl(urg, "vence", "vencem")} em até 5 dias</span>` : ""].filter(Boolean).join(" · ")
        : "Nada a lançar. Arraste os PDFs das guias para cá.";
    },
    acoes: () => `<label class="ls-bt is-pri gu-subir">${ico("file-up")}Enviar PDF<input type="file" accept="application/pdf,.pdf" multiple data-gu-arquivo hidden></label>`,
    colunas: [
      { chave: "guia", h: "Guia", ord: g => titulo(g).toLowerCase(),
        td: g => `<b>${esc(titulo(g))}</b><span class="ls-sub">${esc(g.omie.fornecedor_nome || "sem fornecedor")}${(g.avisos || []).length ? " · " : ""}</span>${(g.avisos || []).length ? `<span class="ls-sub ls-txt-at">${pl(g.avisos.length, "aviso", "avisos")}</span>` : ""}` },
      { chave: "venc", h: "Vence", w: "130px", ord: g => g.vencimento || null,
        td: g => `${dataBr(g.vencimento) || "—"}<span class="ls-sub">${prazoTxt(g)}</span>` },
      { chave: "valor", h: "Valor", cls: "ls-num", w: "120px", dir: "desc", ord: g => g.valor,
        td: g => `<span class="ls-mono">${moeda(g.valor)}</span>` },
      { chave: "sit", h: "Situação", cls: "ls-c-om", w: "150px", ord: g => g.status,
        td: g => selo(g) },
    ],
    classeLinha: g => (g.status === "descartada" ? "is-inativo" : g.status === "erro" ? "is-risco" : urgente(g) ? "is-pede" : ""),
    exportar: [
      ["Guia", titulo],
      ["Tipo", g => tipoNome(g.tipo)],
      ["Competência", g => g.competencia || ""],
      ["Vencimento", g => dataBr(g.vencimento)],
      ["Valor", g => g.valor ?? ""],
      ["Nº do documento", g => g.numero_documento || ""],
      ["Linha digitável", g => g.linha_formatada || ""],
      ["Fornecedor no Omie", g => g.omie.fornecedor_nome || ""],
      ["Categoria", g => g.omie.categoria || ""],
      ["Situação", g => (SELO[g.status] || [0, g.status])[1]],
      ["Conta a pagar no Omie", g => g.omie.codigo || ""],
    ],
    detalhe,
    icLado: "landmark",
    ladoVazio: "Escolha uma guia na lista.",
    aoSelecionar: () => { garantirOpcoes(); },
    aoClicar: e => {
      let el;
      const sel = () => lista0().find(x => String(x.id) === String(lista.estado.sel));
      if ((el = e.target.closest("[data-gu-pdf]"))) { const g = sel(); if (g) verPdf(g, el); return true; }
      if (e.target.closest("[data-gu-salvar]")) { const g = sel(); if (g) salvar(g); return true; }
      if (e.target.closest("[data-gu-lancar]")) { const g = sel(); if (g) lancar(g, false); return true; }
      if (e.target.closest("[data-gu-forcar]")) { const g = sel(); if (g) lancar(g, true); return true; }
      if (e.target.closest("[data-gu-descartar]")) {
        const g = sel();
        if (g && confirm(`Descartar "${titulo(g)}"? Ela sai da fila; nada é mudado no Omie.`)) { delete st.parecidas[g.id]; acao(g, "descartar", "Descartar"); }
        return true;
      }
      if (e.target.closest("[data-gu-restaurar]")) { const g = sel(); if (g) acao(g, "restaurar", "Restaurar"); return true; }
      if (e.target.closest("[data-gu-anexo]")) { const g = sel(); if (g) acao(g, "anexo", "Anexar de novo"); return true; }
      if ((el = e.target.closest("[data-gu-forn]"))) {
        const h = document.getElementById("guForn");
        if (h) h.value = el.dataset.guForn;
        const at = document.querySelector("#guLsRoot .gu-forn-atual");
        if (at) at.textContent = el.dataset.guFornNome;
        st.fornBusca = ""; st.fornRes = null;
        const q = document.getElementById("guFornQ"); if (q) q.value = "";
        const box = document.getElementById("guFornRes"); if (box) box.innerHTML = "";
        return true;
      }
      return false;
    },
  });

  // Busca de fornecedor e o seletor de arquivo (eventos fora do clique).
  document.addEventListener("input", e => {
    if (e.target.id === "guFornQ") buscarFornecedor(e.target.value.trim());
  });
  document.addEventListener("change", e => {
    if (e.target.matches?.("[data-gu-arquivo]")) { const fs = e.target.files; if (fs && fs.length) subir(fs); e.target.value = ""; }
  });
  // Arrastar os PDFs para qualquer ponto da tela de guias.
  document.addEventListener("dragover", e => {
    const r = document.getElementById("guLsRoot");
    if (!r || !r.contains(e.target) || ![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    r.classList.add("gu-arrastando");
  });
  document.addEventListener("dragleave", e => {
    const r = document.getElementById("guLsRoot");
    if (r && (!e.relatedTarget || !r.contains(e.relatedTarget))) r.classList.remove("gu-arrastando");
  });
  document.addEventListener("drop", e => {
    const r = document.getElementById("guLsRoot");
    if (!r || !r.contains(e.target)) return;
    e.preventDefault();
    r.classList.remove("gu-arrastando");
    if (e.dataTransfer?.files?.length) subir(e.dataTransfer.files);
  });

  const ativa = () => !!document.getElementById("guLsRoot");

  window.GBGuias = {
    montar() { lista.montar(); carregar(); },
    carregar,
    // O que a faixa do Financeiro mostra no "Pede ação".
    resumo() {
      if (!st.dados) return null;
      const a = lista0().filter(aLancar);
      return { n: a.length, urgentes: a.filter(urgente).length, valor: a.reduce((s, g) => s + (Number(g.valor) || 0), 0) };
    },
  };
})();
