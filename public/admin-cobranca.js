// ============================================================
// COBRANÇA — os títulos em atraso que o sistema emitiu (Omie, fase 3, 23/11/2026)
// ============================================================
//
// A aba "Em atraso" do Financeiro, no molde de lista (admin-lista.js). Ver
// docs/modulos/omie-integracao.md.
//
// ⚠️ SÓ O QUE O SISTEMA EMITIU (decisão do Pedro, 20/11 e 23/11/2026): o
// título que nasceu de uma nota de orçamento emitida aqui ou de um contrato
// faturado pelo lote. A herança de títulos sem baixa no Omie não aparece.
//
// De onde vem: GET /admin/cobranca (a cópia do banco, refeita de hora em hora
// com a sincronização do Omie; nada aqui chama o Omie, a não ser o link do
// boleto, pedido no clique). Quem tira o título da lista é a baixa no Omie
// (Sicredi sozinho; Bradesco ao importar o retorno lá) — ou "Marcar como
// pago", que só vale no sistema.
//
// Só o admin (a rota devolve 403 aos outros).
//
// O que expõe: window.GBCobranca = { montar, carregar, resumo } — o
// Financeiro monta a lista no palco dele e põe o total no "Pede ação".
//
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md).

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { dados: null, sinc: null, hoje: null, erro: null, pedido: null, gravando: false, boleto: null };
  const admin = () => typeof _myRole !== "undefined" && _myRole === "admin";
  const lista0 = () => st.dados || [];
  const moeda = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const dataBr = s => {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString("pt-BR");
  };
  const doc = d => {
    const x = String(d || "");
    if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    return x;
  };
  const nome = t => t.cliente?.nome || t.condominio?.nome || `Cliente ${t.cliente?.omie_codigo ?? "?"} do Omie`;
  const aCobrar = t => !t.pago;
  const atraso = t => (t.dias === 1 ? "1 dia" : `${t.dias} dias`);
  const nivel = t => (t.dias > 90 ? "ri" : t.dias > 30 ? "at" : "info");
  const origemTxt = t => t.origem === "contrato"
    ? `Contrato ${t.contrato?.numero || ""}${t.contrato?.competencia ? " · " + t.contrato.competencia : ""}`.trim()
    : `Orçamento ${t.orcamento_id ? "#" + t.orcamento_id : ""}`.trim();
  const tituloTxt = t => [t.numero_nf ? "NF " + t.numero_nf : t.documento, t.parcela && t.parcela !== "001/001" ? "parcela " + t.parcela : ""].filter(Boolean).join(" · ");

  // ===== carga =====
  async function carregar() {
    if (!admin()) return;
    if (st.pedido) return st.pedido;
    st.erro = null;
    if (ativa()) lista.desenhar();
    st.pedido = (async () => {
      try {
        const r = await fetch("/admin/cobranca", { headers: authHeaders() });
        const j = await lerRespostaJson(r, "Cobrança");
        if (!r.ok) throw new Error(j.error || "Erro ao listar os títulos em atraso");
        st.dados = j.titulos || [];
        st.sinc = j.sincronizacao || null;
        st.hoje = j.hoje || null;
      } catch (e) {
        st.erro = e.message;
      } finally {
        st.pedido = null;
      }
      if (ativa()) lista.desenhar();
      document.dispatchEvent(new CustomEvent("gb:cobranca"));
    })();
    return st.pedido;
  }

  // ===== ações =====
  async function abrirBoleto(t, el) {
    // A janela abre já no clique (senão o bloqueador de pop-up segura) e
    // recebe o endereço quando o servidor responde.
    const w = window.open("", "_blank");
    el.disabled = true;
    try {
      const r = await fetch(`/admin/cobranca/${t.omie_codigo}/boleto`, { headers: authHeaders() });
      const j = await lerRespostaJson(r, "Boleto");
      if (!r.ok) throw new Error(j.error || "Não consegui o link do boleto");
      if (w) w.location.href = j.link; else window.open(j.link, "_blank", "noopener");
    } catch (e) {
      if (w) w.close();
      alert(e.message);
    } finally { el.disabled = false; }
  }

  async function marcarPago(t) {
    const dia = document.getElementById("cbPagoEm")?.value || "";
    const obs = document.getElementById("cbPagoObs")?.value || "";
    if (!dia) { alert("Informe a data em que o cliente pagou."); return; }
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/cobranca/${t.omie_codigo}/pago`, {
        method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ pago_em: dia, observacao: obs }),
      });
      const j = await lerRespostaJson(r, "Marcar como pago");
      if (!r.ok) throw new Error(j.error || "Não consegui marcar como pago");
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  async function desmarcar(t) {
    if (!confirm(`Desfazer a marca de pago de "${nome(t)}"? O título volta para a lista de cobrança.`)) return;
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/cobranca/${t.omie_codigo}/pago`, { method: "DELETE", headers: authHeaders() });
      const j = await lerRespostaJson(r, "Desfazer pago");
      if (!r.ok) throw new Error(j.error || "Não consegui desfazer");
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  // ===== o painel =====
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const digitos = s => String(s || "").replace(/\D/g, "");
  function telefone(tel) {
    if (!tel) return "";
    const d = digitos(tel);
    // WhatsApp: celular brasileiro (DDD + 9 dígitos começando em 9).
    const zap = /^\d{2}9\d{8}$/.test(d) ? `<a class="ls-bt is-p is-ghost" href="https://wa.me/55${d}" target="_blank" rel="noopener">${ico("message-circle")}WhatsApp</a>` : "";
    return `<span class="cb-tel"><a class="ls-lk is-forte" href="tel:${d}">${esc(tel)}</a>${zap}</span>`;
  }
  function blocoContato(t) {
    const c = t.cliente || {}, p = t.condominio;
    const linhas = [
      ["Cliente no Omie", esc(c.razao_social || c.nome || "—") + (c.documento ? `<span class="ls-sub ls-mono">${esc(doc(c.documento))}</span>` : ""), true],
      c.contato ? ["Contato", esc(c.contato)] : null,
      ["Telefone", c.telefone ? telefone(c.telefone) + (c.telefone2 ? telefone(c.telefone2) : "") : `<span class="ls-mudo">sem telefone no Omie</span>`, true],
      c.email ? ["E-mail", `<a class="ls-lk" href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, true] : null,
      p ? ["Prédio", `<button type="button" class="ls-lk is-forte" data-cb-condo="${p.id}">${esc(p.nome)}</button>`
        + (p.responsavel ? `<span class="ls-sub">${esc(p.responsavel)}</span>` : ""), true] : null,
      p && p.telefone && digitos(p.telefone) !== digitos(c.telefone) ? ["Telefone do prédio", telefone(p.telefone), true] : null,
    ];
    return fatos(linhas);
  }
  function blocoPago(t) {
    if (t.pago) {
      return `<p class="cb-pago-ok">${ico("circle-check")}<span>Marcado como pago em <b>${dataBr(t.pago.em)}</b>${t.pago.por ? " por " + esc(t.pago.por) : ""}.${t.pago.observacao ? `<span class="ls-sub">${esc(t.pago.observacao)}</span>` : ""}</span></p>
        <p class="ls-nada">Vale só no sistema: o título continua em aberto no Omie até ser baixado lá.</p>
        <div class="oc-bts"><button type="button" class="ls-bt is-p is-ghost" data-cb-desmarcar ${st.gravando ? "disabled" : ""}>Desfazer</button></div>`;
    }
    const hoje = st.hoje || new Date().toISOString().slice(0, 10);
    return `<div class="cb-form">
        <label><span>Pago em</span><input type="date" id="cbPagoEm" value="${esc(hoje)}" max="${esc(hoje)}"></label>
        <label><span>Observação (opcional)</span><input type="text" id="cbPagoObs" maxlength="500" placeholder="Ex.: PIX direto na conta, comprovante no WhatsApp"></label>
      </div>
      <div class="oc-bts"><button type="button" class="ls-bt is-p is-pri" data-cb-pago ${st.gravando ? "disabled" : ""}>${ico("check")}${st.gravando ? "Gravando…" : "Marcar como pago"}</button></div>
      <p class="ls-nada">Só no sistema: tira o título da cobrança. Nada é gravado no Omie.</p>`;
  }
  function outrosDoCliente(t) {
    const outros = lista0().filter(x => x !== t && aCobrar(x) && x.cliente?.omie_codigo && x.cliente.omie_codigo === t.cliente?.omie_codigo);
    if (!outros.length) return "";
    const soma = outros.reduce((s, x) => s + x.valor, 0);
    return sec(`Outros em atraso deste cliente · ${moeda(soma)}`, `<ul class="cb-outros">${outros.map(x =>
      `<li><button type="button" class="ls-lk" data-cb-ir="${x.omie_codigo}">${esc(tituloTxt(x) || origemTxt(x))}</button><span class="ls-mono">${moeda(x.valor)}</span><span class="ls-mudo">venceu ${dataBr(x.vencimento)}</span></li>`).join("")}</ul>`);
  }

  function detalhe(t) {
    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico("receipt")}<span>${esc(origemTxt(t))}</span></div>
        <h2>${esc(nome(t))}</h2>
        <div class="ls-l-selo">${t.pago ? `<span class="ls-selo is-ok">pago (marcado aqui)</span>` : `<span class="ls-selo is-${nivel(t)}">${atraso(t)} em atraso</span>`}<span class="ls-mudo">${moeda(t.valor)}</span></div>
      </div>
      ${sec("Cobrar", blocoContato(t))}
      ${sec("Título", fatos([
        ["Valor", `<span class="ls-mono">${moeda(t.valor)}</span>`],
        ["Venceu em", dataBr(t.vencimento)],
        ["Documento", esc(t.documento || "—")],
        ["Parcela", esc(t.parcela || "—")],
        t.numero_nf ? ["Nota fiscal", `<span class="ls-mono">${esc(t.numero_nf)}</span>`] : null,
        ["Emitido em", dataBr(t.emissao) || "—"],
        ["Banco", esc(t.banco || "—")],
        ["Boleto", t.boleto_numero
          ? `<span class="ls-mono">${esc(t.boleto_numero)}</span> <button type="button" class="ls-bt is-p" data-cb-boleto>${ico("file-down")}Abrir boleto</button>`
          : `<span class="ls-mudo">sem boleto gerado no Omie</span>`, true],
        ["Origem", t.origem === "contrato"
          ? `<button type="button" class="ls-lk is-forte" data-cb-contrato="${t.contrato?.omie_codigo || ""}">${esc(origemTxt(t))}</button>`
          : t.orcamento_id ? `<a class="ls-lk is-forte" href="#/orcamentos/${t.orcamento_id}">${esc(origemTxt(t))}</a>` : "—", true],
      ]))}
      ${outrosDoCliente(t)}
      ${avisosDoTitulo(t)}
      ${sec("Já pagou?", blocoPago(t))}`;
  }

  // Os avisos por e-mail deste título (admin-cobranca-avisos.js, migration 102).
  function avisosDoTitulo(t) {
    const l = window.GBAvisos?.doTitulo?.(t.omie_codigo) || [];
    if (!l.length) return "";
    const txt = a => a.status === "enviado"
      ? `enviado ${new Date(a.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
      : a.status === "pendente" ? "na fila para enviar" : a.status === "sem_email" ? "sem e-mail" : a.status === "erro" ? "falhou" : "não foi";
    return sec("Avisos por e-mail", `<ul class="cb-outros">${l.map(a =>
      `<li><span>${esc(a.etapa_nome)}</span><span class="ls-mudo">${esc(txt(a))}</span></li>`).join("")}</ul>`);
  }

  // ===== a lista =====
  const ordem = () => [...lista0()].sort((a, b) => (b.dias - a.dias) || (b.valor - a.valor));
  const lista = window.GBLista.criar({
    id: "cobranca",
    raiz: "cobLsRoot",
    titulo: "Em atraso",
    nomePlural: "os títulos em atraso",
    buscaDica: "Cliente, prédio, nota ou documento",
    dados: ordem,
    chave: t => t.omie_codigo,
    texto: t => `${nome(t)} ${t.cliente?.razao_social || ""} ${t.condominio?.nome || ""} ${t.documento || ""} ${t.numero_nf || ""} ${t.contrato?.numero || ""} ${doc(t.cliente?.documento)} ${t.banco || ""}`,
    estado: () => (st.erro && !st.dados ? "erro" : !st.dados ? "carregando" : "pronto"),
    recarregar: () => carregar(),
    visoes: [
      ["cobrar", "A cobrar", aCobrar],
      ["ate30", "Até 30 dias", t => aCobrar(t) && t.dias <= 30],
      ["ate90", "31 a 90 dias", t => aCobrar(t) && t.dias > 30 && t.dias <= 90, "at", d => d.some(t => aCobrar(t) && t.dias > 30 && t.dias <= 90)],
      ["mais90", "Mais de 90 dias", t => aCobrar(t) && t.dias > 90, "ri", d => d.some(t => aCobrar(t) && t.dias > 90)],
      ["pagos", "Marcados como pagos", t => !!t.pago, "ok", d => d.some(t => t.pago)],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      cobrar: "Nenhum título do sistema em atraso.",
      ate30: "Nenhum título com até 30 dias de atraso.",
      ate90: "Nenhum título entre 31 e 90 dias de atraso.",
      mais90: "Nenhum título com mais de 90 dias de atraso.",
      pagos: "Nenhum título marcado como pago aqui.",
      todos: "Nenhum título do sistema em atraso. Entram aqui só as notas emitidas pelo sistema (orçamentos e o lote dos contratos).",
    },
    icVazio: "circle-check",
    frase: (d, estado) => {
      if (estado !== "pronto") return "Os títulos vencidos das notas que o sistema emitiu.";
      const a = d.filter(aCobrar);
      const soma = a.reduce((s, t) => s + t.valor, 0);
      const clientes = new Set(a.map(t => t.cliente?.omie_codigo || nome(t))).size;
      const quando = st.sinc?.ultima_em ? ` <span class="ls-mudo">· copiado do Omie ${typeof _tempoRelativo === "function" ? _tempoRelativo(st.sinc.ultima_em) : dataBr(st.sinc.ultima_em)}</span>` : "";
      const erro = st.sinc?.ultimo_erro ? ` <span class="ls-txt-ri">· a última cópia falhou</span>` : "";
      return (a.length
        ? [`<b>${pl(a.length, "título", "títulos")}</b>`, `<b>${moeda(soma)}</b> em atraso`, pl(clientes, "cliente", "clientes")].join(" · ")
        : "Nenhum título do sistema em atraso") + quando + erro;
    },
    acoes: () => `<button type="button" class="ls-bt viewer-only-hide" data-cb-atualizar>${ico("refresh-cw")}Atualizar do Omie</button>`,
    colunas: [
      { chave: "cliente", h: "Cliente", ord: t => nome(t).toLowerCase(),
        td: t => `<b>${esc(nome(t))}</b><span class="ls-sub">${esc([t.condominio && t.condominio.nome !== nome(t) ? t.condominio.nome : "", tituloTxt(t)].filter(Boolean).join(" · "))}</span>` },
      { chave: "venc", h: "Venceu", w: "120px", dir: "desc", ord: t => t.dias,
        td: t => `${dataBr(t.vencimento)}<span class="ls-sub">${t.pago ? "pago em " + dataBr(t.pago.em) : `<span class="ls-txt-${nivel(t) === "info" ? "at" : nivel(t)}">há ${atraso(t)}</span>`}</span>` },
      { chave: "valor", h: "Valor", cls: "ls-num", w: "120px", dir: "desc", ord: t => t.valor,
        td: t => `<span class="ls-mono">${moeda(t.valor)}</span>` },
      { chave: "banco", h: "Banco", cls: "ls-c-om", w: "100px", ord: t => t.banco || null,
        td: t => `${esc(t.banco || "—")}<span class="ls-sub">${t.boleto_numero ? "com boleto" : "sem boleto"}</span>` },
      { chave: "origem", h: "Origem", cls: "ls-c-om", w: "120px", ord: t => origemTxt(t),
        td: t => `${esc(t.origem === "contrato" ? "Contrato" : "Orçamento")}<span class="ls-sub">${esc(origemTxt(t).replace(/^(Contrato|Orçamento)\s*/, ""))}</span>` },
    ],
    classeLinha: t => (t.pago ? "is-inativo" : t.dias > 90 ? "is-risco" : t.dias > 30 ? "is-pede" : ""),
    exportar: [
      ["Cliente", nome],
      ["Razão social", t => t.cliente?.razao_social || ""],
      ["CNPJ/CPF", t => doc(t.cliente?.documento)],
      ["Telefone", t => t.cliente?.telefone || ""],
      ["E-mail", t => t.cliente?.email || ""],
      ["Prédio", t => t.condominio?.nome || ""],
      ["Documento", t => t.documento || ""],
      ["Nota fiscal", t => t.numero_nf || ""],
      ["Parcela", t => t.parcela || ""],
      ["Valor", t => t.valor],
      ["Vencimento", t => dataBr(t.vencimento)],
      ["Dias de atraso", t => t.dias],
      ["Banco", t => t.banco || ""],
      ["Nosso número", t => t.boleto_numero || ""],
      ["Origem", origemTxt],
      ["Marcado como pago em", t => (t.pago ? dataBr(t.pago.em) : "")],
    ],
    detalhe,
    icLado: "receipt",
    ladoVazio: "Escolha um título na lista.",
    aoClicar: e => {
      let el;
      const sel = () => lista0().find(x => String(x.omie_codigo) === String(lista.estado.sel));
      if ((el = e.target.closest("[data-cb-boleto]"))) { const t = sel(); if (t) abrirBoleto(t, el); return true; }
      if (e.target.closest("[data-cb-pago]")) { const t = sel(); if (t) marcarPago(t); return true; }
      if (e.target.closest("[data-cb-desmarcar]")) { const t = sel(); if (t) desmarcar(t); return true; }
      if ((el = e.target.closest("[data-cb-ir]"))) { lista.selecionar(Number(el.dataset.cbIr)); return true; }
      if ((el = e.target.closest("[data-cb-condo]"))) { if (typeof abrirFichaCondominio === "function") abrirFichaCondominio(Number(el.dataset.cbCondo)); return true; }
      if ((el = e.target.closest("[data-cb-contrato]"))) { if (el.dataset.cbContrato && window.GBOmie) window.GBOmie.abrir(Number(el.dataset.cbContrato)); return true; }
      if ((el = e.target.closest("[data-cb-atualizar]"))) {
        el.disabled = true;
        fetch("/admin/cobranca/atualizar", { method: "POST", headers: authHeaders() })
          .then(r => lerRespostaJson(r, "Atualizar do Omie").then(j => { if (!r.ok) throw new Error(j.error || "Não consegui atualizar do Omie"); if (j.pulado) alert("Já foi atualizado há menos de 2 minutos."); }))
          .catch(err => alert(err.message))
          .finally(() => { el.disabled = false; carregar(); });
        return true;
      }
      return false;
    },
  });

  const ativa = () => !!document.getElementById("cobLsRoot");

  window.GBCobranca = {
    montar() { lista.montar(); carregar(); },
    carregar,
    // O que a faixa do Financeiro mostra no "Pede ação".
    resumo() {
      if (!st.dados) return null;
      const a = lista0().filter(aCobrar);
      return { n: a.length, valor: a.reduce((s, t) => s + t.valor, 0) };
    },
  };
})();
