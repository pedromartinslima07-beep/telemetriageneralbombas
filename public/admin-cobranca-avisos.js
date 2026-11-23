// ============================================================
// AVISOS DE COBRANÇA POR E-MAIL (migration 102, 23/11/2026)
// ============================================================
//
// A aba "Avisos" do Financeiro, no molde de lista (admin-lista.js). Ver
// docs/modulos/cobranca-avisos.md.
//
// A fila do dia: os títulos que o sistema emitiu ganham um aviso por etapa
// (lembrete antes do vencimento, vence hoje, 1ª e 2ª cobrança). O servidor
// refaz a fila quando a tela abre. Aqui se confere o e-mail ("Ver o e-mail"),
// troca o destinatário, tira da fila, e aprova o envio — um por um ou em
// lote. Quando o Pedro confiar, "Regras" liga o envio automático.
//
// ⚠️ "ENVIAR" MANDA E-MAIL AO CLIENTE. O servidor exige COBRANCA_EMAIL=1.
//
// O que expõe: window.GBAvisos = { montar, carregar, resumo, doTitulo }.
//
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md).

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { dados: null, regras: null, ligado: false, hoje: null, erro: null, pedido: null, gravando: false, regrasAbertas: false };
  const admin = () => typeof _myRole !== "undefined" && _myRole === "admin";
  const lista0 = () => st.dados || [];
  const moeda = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const dataBr = s => {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString("pt-BR");
  };
  const quando = s => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const nome = a => a.cliente?.nome || `Cliente ${a.cliente?.omie_codigo ?? "?"} do Omie`;
  const naFila = a => ["pendente", "erro", "sem_email"].includes(a.status);
  const podeEnviar = a => a.status === "pendente" || a.status === "erro";
  const SELO = {
    pendente: ["at", "para enviar"], enviando: ["info", "enviando…"], enviado: ["ok", "enviado"], erro: ["ri", "falhou"],
    sem_email: ["at", "sem e-mail"], expirado: ["cz", "não foi (passou)"], ignorado: ["cz", "tirado da fila"],
  };
  const selo = a => { const [c, t] = SELO[a.status] || ["cz", a.status]; return `<span class="ls-selo is-${c}">${t}</span>`; };
  const ETAPA_IC = { antes: "bell", dia: "calendar-clock", atraso1: "alarm-clock", atraso2: "siren" };
  const prazo = a => (a.etapa === "antes" ? `vence em ${dataBr(a.vencimento)}` : a.etapa === "dia" ? "vence hoje" : `venceu em ${dataBr(a.vencimento)}`);
  const origem = a => (a.origem === "contrato" ? `Contrato ${a.contrato_numero || ""}`.trim() : `Orçamento ${a.orcamento_numero || (a.orcamento_id ? "#" + a.orcamento_id : "")}`.trim());

  async function json(r, n) { return typeof lerRespostaJson === "function" ? lerRespostaJson(r, n) : r.json(); }

  // ===== carga =====
  async function carregar() {
    if (!admin()) return;
    if (st.pedido) return st.pedido;
    st.erro = null;
    if (ativa()) lista.desenhar();
    st.pedido = (async () => {
      try {
        const r = await fetch("/admin/cobranca/avisos", { headers: authHeaders() });
        const j = await json(r, "Avisos de cobrança");
        if (!r.ok) throw new Error(j.error || "Erro ao listar os avisos");
        st.dados = j.avisos || [];
        st.regras = j.regras || null;
        st.ligado = !!j.envio_ligado;
        st.hoje = j.hoje || null;
      } catch (e) { st.erro = e.message; }
      finally { st.pedido = null; }
      if (ativa()) lista.desenhar();
      document.dispatchEvent(new CustomEvent("gb:avisos"));
    })();
    return st.pedido;
  }

  // ===== ações =====
  async function enviar(ids) {
    const alvo = lista0().filter(a => ids.includes(a.id) && podeEnviar(a));
    if (!alvo.length) return;
    const linhas = alvo.slice(0, 8).map(a => `• ${nome(a)} — ${a.etapa_nome.toLowerCase()} (${prazo(a)})`);
    if (alvo.length > 8) linhas.push(`• e mais ${alvo.length - 8}`);
    if (!confirm([`Enviar ${pl(alvo.length, "aviso", "avisos")} de cobrança por e-mail?`, "", ...linhas, "", "Vai para o e-mail do cliente, com o boleto em anexo."].join("\n"))) return;
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch("/admin/cobranca/avisos/enviar", {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ ids: alvo.map(a => a.id) }),
      });
      const j = await json(r, "Enviar avisos");
      if (!r.ok) throw new Error(j.error || "Não consegui enviar");
      const falhas = (j.falhas || []).filter(f => f.motivo !== "não está pendente");
      if (falhas.length) alert(`${pl(j.enviados, "enviado", "enviados")}. ${pl(falhas.length, "não foi", "não foram")}:\n` + falhas.map(f => "• " + f.motivo).join("\n"));
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  async function ignorar(a) {
    if (!confirm(`Tirar da fila o aviso de "${nome(a)}"? Ele não será enviado.`)) return;
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/cobranca/avisos/${a.id}/ignorar`, { method: "POST", headers: authHeaders() });
      const j = await json(r, "Tirar da fila");
      if (!r.ok) throw new Error(j.error || "Não consegui");
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  async function trocarPara(a) {
    const v = document.getElementById("caPara")?.value || "";
    st.gravando = true; lista.desenharLado();
    try {
      const r = await fetch(`/admin/cobranca/avisos/${a.id}/para`, {
        method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ destinatarios: v }),
      });
      const j = await json(r, "Trocar destinatário");
      if (!r.ok) throw new Error(j.error || "Não consegui");
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  async function verEmail(a, el) {
    const w = window.open("", "_blank");
    el.disabled = true;
    try {
      const r = await fetch(`/admin/cobranca/avisos/${a.id}/email`, { headers: authHeaders() });
      const j = await json(r, "Prévia do e-mail");
      if (!r.ok) throw new Error(j.error || "Não consegui montar o e-mail");
      const cab = `<div style="font:13px Arial;padding:10px 16px;background:#fff8e1;border-bottom:1px solid #e9d38a">`
        + `<b>Prévia.</b> Para: ${esc((j.para || []).join(", ") || "(sem e-mail)")} · Assunto: ${esc(j.assunto)}${j.anexo ? " · Anexo: " + esc(j.anexo) : ""}</div>`;
      const url = URL.createObjectURL(new Blob(["<!doctype html><meta charset=utf-8><title>" + esc(j.assunto) + "</title>" + cab + j.html], { type: "text/html" }));
      if (w) w.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { if (w) w.close(); alert(e.message); }
    finally { el.disabled = false; }
  }

  async function salvarRegras() {
    const n = id => Number(document.getElementById(id)?.value || 0);
    const corpo = { dias_antes: n("caRegAntes"), atraso_1: n("caRegA1"), atraso_2: n("caRegA2"), automatico: !!document.getElementById("caRegAuto")?.checked };
    if (corpo.automatico && !st.regras?.automatico && !confirm("Ligar o envio automático? Os avisos passam a sair sozinhos, em dia útil, das 8h às 18h, sem passar por aqui.")) return;
    st.gravando = true; lista.desenhar();
    try {
      const r = await fetch("/admin/cobranca/avisos/regras", {
        method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const j = await json(r, "Regras dos avisos");
      if (!r.ok) throw new Error(j.error || "Não consegui salvar as regras");
      st.regrasAbertas = false;
    } catch (e) { alert(e.message); }
    finally { st.gravando = false; }
    await carregar();
  }

  // ===== regras (caixa acima da lista) =====
  function regrasHtml() {
    if (!st.regrasAbertas || !st.regras) return "";
    const g = st.regras;
    const dis = st.gravando ? "disabled" : "";
    return `<div class="ca-regras">
        <div class="ca-regras-l">
          <label><span>Lembrete antes do vencimento</span><span class="ca-num"><input type="number" id="caRegAntes" min="0" max="15" value="${g.dias_antes}" ${dis}> dias antes</span></label>
          <label><span>Primeira cobrança</span><span class="ca-num"><input type="number" id="caRegA1" min="0" max="60" value="${g.atraso_1}" ${dis}> dias de atraso</span></label>
          <label><span>Segunda cobrança</span><span class="ca-num"><input type="number" id="caRegA2" min="0" max="90" value="${g.atraso_2}" ${dis}> dias de atraso</span></label>
        </div>
        <p class="ls-nada">No dia do vencimento sai o "vence hoje". 0 desliga a etapa. Depois da segunda cobrança o sistema para: o título segue em "Em atraso".</p>
        <label class="ca-auto"><input type="checkbox" id="caRegAuto" ${g.automatico ? "checked" : ""} ${dis}><span><b>Enviar sozinho</b> — sem passar por aqui, em dia útil, das 8h às 18h.${st.ligado ? "" : " (O servidor está com o envio desligado: COBRANCA_EMAIL.)"}</span></label>
        <div class="oc-bts"><button type="button" class="ls-bt is-p is-pri" data-ca-regras-salvar ${dis}>${ico("check")}Salvar regras</button>
          <button type="button" class="ls-bt is-p is-ghost" data-ca-regras-fechar>Fechar</button></div>
      </div>`;
  }

  // ===== o painel =====
  const sec = (t, html) => `<section class="ls-sec"><h3>${t}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  function detalhe(a) {
    const naFilaAgora = naFila(a);
    const dis = st.gravando ? "disabled" : "";
    const para = naFilaAgora
      ? `<div class="cb-form"><label><span>Para (só neste aviso)</span>
          <input type="text" id="caPara" value="${esc(a.destinatarios.join(", "))}" placeholder="sindico@exemplo.com" ${dis}></label></div>
         <div class="oc-bts"><button type="button" class="ls-bt is-p" data-ca-para ${dis}>Salvar destinatário</button></div>
         <p class="ls-nada">Vêm dos e-mails para os quais o Omie mandou a nota${a.origem === "contrato" ? " (a nota mais recente do cliente lá)" : ""}.</p>`
      : fatos([["Para", esc(a.destinatarios.join(", ") || "—"), true]]);
    return `
      <div class="ls-l-cab">
        <div class="ls-l-sup">${ico(ETAPA_IC[a.etapa] || "mail")}<span>${esc(a.etapa_nome)}</span></div>
        <h2>${esc(nome(a))}</h2>
        <div class="ls-l-selo">${selo(a)}<span class="ls-mudo">${esc(prazo(a))}</span></div>
        <div class="oc-bts"><button type="button" class="ls-bt is-p" data-ca-email>${ico("eye")}Ver o e-mail</button></div>
      </div>
      ${a.status === "erro" && a.erro ? `<div class="gu-alerta is-ri">${ico("circle-x")}<div><b>Não foi</b><span>${esc(a.erro)}</span></div></div>` : ""}
      ${a.status === "sem_email" ? `<div class="gu-alerta is-at">${ico("mail-x")}<div><b>Sem e-mail para este cliente.</b><span>O Omie não tem destinatário na nota dele. Digite abaixo para mandar este aviso.</span></div></div>` : ""}
      ${!a.boleto && naFilaAgora ? `<div class="gu-alerta is-at">${ico("file-x")}<div><span>O título não tem boleto gerado no Omie: o e-mail sai sem anexo.</span></div></div>` : ""}
      ${sec("Para quem", para)}
      ${sec("Título", fatos([
        ["Nota fiscal", esc(a.numero_nf || "—")],
        ["Vencimento", dataBr(a.vencimento)],
        ["Valor", `<span class="ls-mono">${moeda(a.valor)}</span>`],
        ["Origem", a.origem === "orcamento" && a.orcamento_id ? `<a class="ls-lk is-forte" href="#/orcamentos/${a.orcamento_id}">${esc(origem(a))}</a>` : esc(origem(a))],
        ["Boleto", a.boleto ? "vai em anexo (PDF do Omie)" : `<span class="ls-mudo">sem boleto</span>`, true],
      ]))}
      ${a.status === "enviado" ? sec("Envio", fatos([["Enviado", `${quando(a.enviado_em)}${a.enviado_por ? " · " + esc(a.enviado_por) : ""}`, true]])) : ""}
      ${naFilaAgora ? `<div class="oc-bts">
          ${podeEnviar(a) ? `<button type="button" class="ls-bt is-p is-pri" data-ca-enviar ${dis || (!st.ligado ? "disabled" : "")}>${ico("send")}${st.gravando ? "Aguarde…" : "Enviar este"}</button>` : ""}
          <button type="button" class="ls-bt is-p is-ghost" data-ca-ignorar ${dis}>Tirar da fila</button></div>
          ${!st.ligado ? `<p class="ls-nada">Envio desligado neste ambiente (COBRANCA_EMAIL): dá para conferir, não para enviar.</p>` : ""}` : ""}
      <p class="ls-nada">Entrou na fila em ${quando(a.criado_em)}.</p>`;
  }

  // ===== a lista =====
  const ORDEM_ETAPA = { atraso2: 0, atraso1: 1, dia: 2, antes: 3 };
  const ordem = () => [...lista0()].sort((a, b) => (naFila(b) - naFila(a)) || ((ORDEM_ETAPA[a.etapa] ?? 9) - (ORDEM_ETAPA[b.etapa] ?? 9)) || String(b.criado_em).localeCompare(String(a.criado_em)));
  const lista = window.GBLista.criar({
    id: "cobranca-avisos",
    raiz: "caLsRoot",
    titulo: "Avisos de cobrança",
    nomePlural: "os avisos",
    buscaDica: "Cliente, nota ou e-mail",
    dados: ordem,
    chave: a => a.id,
    texto: a => `${nome(a)} ${a.cliente?.razao_social || ""} ${a.numero_nf || ""} ${a.destinatarios.join(" ")} ${a.etapa_nome} ${origem(a)}`,
    estado: () => (st.erro && !st.dados ? "erro" : !st.dados ? "carregando" : "pronto"),
    recarregar: () => carregar(),
    visoes: [
      ["enviar", "Para enviar", podeEnviar],
      ["sem", "Sem e-mail", a => a.status === "sem_email", "at", d => d.some(a => a.status === "sem_email")],
      ["enviados", "Enviados", a => a.status === "enviado", "ok"],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      enviar: "Nenhum aviso para enviar hoje.",
      sem: "Nenhum aviso sem e-mail.",
      enviados: "Nenhum aviso enviado ainda.",
      todos: "Nenhum aviso ainda. Entram aqui os títulos das notas emitidas pelo sistema, nos dias das regras.",
    },
    icVazio: "mail-check",
    frase: (d, estado) => {
      if (estado !== "pronto") return "Lembretes e cobranças por e-mail, com o boleto.";
      const p = d.filter(podeEnviar).length, s = d.filter(a => a.status === "sem_email").length;
      const g = st.regras;
      const regra = g ? `<span class="ls-mudo"> · ${g.dias_antes ? g.dias_antes + " dias antes, " : ""}no dia${g.atraso_1 ? ", " + g.atraso_1 : ""}${g.atraso_2 ? " e " + g.atraso_2 : ""}${g.atraso_1 || g.atraso_2 ? " dias de atraso" : ""} · ${g.automatico ? "<b>envio automático</b>" : "com aprovação"}</span>` : "";
      return (p ? `<b>${pl(p, "aviso", "avisos")}</b> para enviar` : "Nada para enviar agora") + (s ? ` · <span class="ls-txt-at">${pl(s, "sem e-mail", "sem e-mail")}</span>` : "") + regra;
    },
    acoes: (d) => {
      const p = d.filter(podeEnviar).length;
      return `<button type="button" class="ls-bt viewer-only-hide" data-ca-regras>${ico("sliders-horizontal")}Regras</button>`
        + (p ? `<button type="button" class="ls-bt is-pri viewer-only-hide" data-ca-todos ${st.gravando || !st.ligado ? "disabled" : ""} title="${st.ligado ? "" : "Envio desligado neste ambiente (COBRANCA_EMAIL)"}">${ico("send")}Enviar ${pl(p, "aviso", "avisos")}</button>` : "")
        + regrasHtml();
    },
    colunas: [
      { chave: "cliente", h: "Cliente", ord: a => nome(a).toLowerCase(),
        td: a => `<b>${esc(nome(a))}</b><span class="ls-sub">${esc(a.destinatarios.join(", ") || "sem e-mail")}</span>` },
      { chave: "aviso", h: "Aviso", w: "190px", ord: a => ORDEM_ETAPA[a.etapa] ?? 9,
        td: a => `${esc(a.etapa_nome)}<span class="ls-sub">${esc(prazo(a))}${a.numero_nf ? " · NF " + esc(a.numero_nf) : ""}</span>` },
      { chave: "valor", h: "Valor", cls: "ls-num ls-c-om", w: "110px", dir: "desc", ord: a => a.valor, td: a => `<span class="ls-mono">${moeda(a.valor)}</span>` },
      { chave: "sit", h: "Situação", w: "140px", ord: a => a.status,
        td: a => `${selo(a)}${a.status === "enviado" ? `<span class="ls-sub">${esc(quando(a.enviado_em))}</span>` : ""}` },
    ],
    classeLinha: a => (["expirado", "ignorado"].includes(a.status) ? "is-inativo" : a.status === "erro" ? "is-risco" : ""),
    lote: marcados => [["enviar", "Enviar", "send", marcados.filter(podeEnviar).length]],
    podeMarcar: podeEnviar,
    selecionados: n => (n === 1 ? "aviso marcado" : "avisos marcados"),
    aoLote: (acao, marcados, limpar) => { if (acao === "enviar") enviar(marcados.map(a => a.id)).then(limpar); },
    exportar: [
      ["Cliente", nome], ["Aviso", a => a.etapa_nome], ["Vencimento", a => dataBr(a.vencimento)], ["Nota fiscal", a => a.numero_nf || ""],
      ["Valor", a => a.valor ?? ""], ["Para", a => a.destinatarios.join(", ")], ["Situação", a => (SELO[a.status] || [0, a.status])[1]],
      ["Enviado em", a => quando(a.enviado_em)], ["Origem", origem],
    ],
    detalhe,
    icLado: "mail",
    ladoVazio: "Escolha um aviso na lista.",
    aoClicar: e => {
      let el;
      const sel = () => lista0().find(x => String(x.id) === String(lista.estado.sel));
      if ((el = e.target.closest("[data-ca-email]"))) { const a = sel(); if (a) verEmail(a, el); return true; }
      if (e.target.closest("[data-ca-enviar]")) { const a = sel(); if (a) enviar([a.id]); return true; }
      if (e.target.closest("[data-ca-ignorar]")) { const a = sel(); if (a) ignorar(a); return true; }
      if (e.target.closest("[data-ca-para]")) { const a = sel(); if (a) trocarPara(a); return true; }
      if (e.target.closest("[data-ca-todos]")) { enviar(lista0().filter(podeEnviar).map(a => a.id)); return true; }
      if (e.target.closest("[data-ca-regras]")) { st.regrasAbertas = !st.regrasAbertas; lista.desenhar(); return true; }
      if (e.target.closest("[data-ca-regras-fechar]")) { st.regrasAbertas = false; lista.desenhar(); return true; }
      if (e.target.closest("[data-ca-regras-salvar]")) { salvarRegras(); return true; }
      return false;
    },
  });

  const ativa = () => !!document.getElementById("caLsRoot");

  window.GBAvisos = {
    montar() { lista.montar(); carregar(); },
    carregar,
    resumo() {
      if (!st.dados) return null;
      return { n: lista0().filter(podeEnviar).length, sem: lista0().filter(a => a.status === "sem_email").length };
    },
    // Os avisos de um título (o painel do "Em atraso" mostra o histórico).
    doTitulo(cod) { return lista0().filter(a => a.omie_titulo === Number(cod)); },
  };
})();
