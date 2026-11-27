// ============================================================
// O LOTE DO FATURAMENTO DOS CONTRATOS (Omie, fase 2 — 20/11/2026)
// ============================================================
//
// ⚠️ O SISTEMA NUNCA FATURA SOZINHO (decisão do Pedro). Esta tela mostra o
// lote do mês que o servidor monta (GET /agenda/faturamento/lote): quem
// entra, quem ficou de fora e por quê, quem já foi faturado. O Pedro marca
// quem vai agora, tira quem quiser e confirma; só o "Sim, faturar" chama o
// Omie (POST /confirmar, com a lista e o total que a tela mostrou — se o
// lote mudou no meio, o servidor recusa e nada sai).
//
// Substitui o painel "Faturamento dos contratos" da Agenda
// (_agAbrirFaturamento agora abre isto), e continua mostrando o que ele
// mostrava: faturados de esperados, o que falta, a cópia e "Atualizar".
// Só o admin (as rotas são masterAdminOnly).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const dataBr = v => { if (!v) return "—"; const d = new Date(String(v).slice(0, 10) + "T12:00:00"); return d.toLocaleDateString("pt-BR"); };
  const diaSemana = v => { const d = new Date(String(v).slice(0, 10) + "T12:00:00"); return `${SEMANA[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`; };
  const json = async r => r.json().catch(() => ({}));
  const post = (url, corpo) => fetch(url, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

  let st = null; // { comp, dados, marcados:Set, confirmando, msg, erro, timer, mudandoDia }

  function fechar() {
    if (st?.timer) clearTimeout(st.timer);
    st = null;
    document.getElementById("agOverlay")?.remove();
  }

  function nome(i) {
    const n = i.condominio_nome || i.cliente || `Contrato ${i.numero}`;
    return i.condominio_id
      ? `<button type="button" class="fl-nome" data-fl-predio="${i.condominio_id}">${esc(n)}</button>`
      : `<button type="button" class="fl-nome" data-fl-contrato="${i.omie_codigo}">${esc(n)}</button>`;
  }
  const contrato = i => `<span class="fl-sub">${esc(i.numero || "")}${i.banco ? " · " + esc(i.banco) : ""}</span>`;
  // Os avisos do servidor (migration 109). Nota em dobro em vermelho; o resto
  // (preventiva faltando ou por escolher, sem prédio) em âmbar. Aviso não tira
  // ninguém do lote: quem decide é o Pedro.
  const avisosDe = i => (i.avisos || []).map(a => `<span class="${a.tipo === "dobro" ? "fl-msg" : "fl-av"}">${esc(a.texto)}</span>`).join("");

  function linhasLote(lista) {
    return lista.map(i => `<tr class="${i.estado === "erro" ? "is-erro" : ""}">
      <td class="fl-ck"><input type="checkbox" data-fl-marca="${i.omie_codigo}" ${st.marcados.has(i.omie_codigo) ? "checked" : ""} ${st.confirmando || st.dados.rodando ? "disabled" : ""} aria-label="Faturar agora"></td>
      <td>${nome(i)}${contrato(i)}${i.estado === "erro" && i.mensagem ? `<span class="fl-msg">Da última vez: ${esc(i.mensagem)}</span>` : ""}${avisosDe(i)}</td>
      <td class="fl-num">${moeda(i.valor)}</td>
      <td class="fl-acao"><button type="button" class="btn btn-sm" data-fl-tirar="${i.omie_codigo}" ${st.dados.rodando ? "disabled" : ""}>Tirar do lote</button></td>
    </tr>`).join("");
  }

  // A coluna Boleto dos faturados: o boleto, ou o aviso "sem boleto" com o
  // botão (que pede confirmação e só então chama o Omie).
  function boletoHtml(i) {
    const t = i.titulo;
    if (!t) return `<span class="fl-sub">${i.nfse ? "aguardando a cópia" : "—"}</span>`;
    const venc = `vence ${esc(dataBr(t.vencimento))}`;
    const sit = t.status ? `<span class="fl-sub">${esc(t.status.toLowerCase())}</span>` : "";
    if (t.pode_gerar_boleto) {
      const pedido = t.boleto_pedido_em && Date.now() - new Date(t.boleto_pedido_em).getTime() < 10 * 60 * 1000;
      return `${venc}<span class="fl-msg">Sem boleto no Omie.</span>${sit}
        ${pedido ? `<span class="fl-sub">boleto pedido às ${esc(new Date(t.boleto_pedido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}, aguardando o Omie</span>`
          : `<button type="button" class="btn btn-sm fl-bt-boleto" data-fl-boleto="${i.omie_codigo}" ${st.dados.emissao_ligada ? "" : "disabled title=\"Desligado neste ambiente (OMIE_EMISSAO)\""}>Gerar boleto</button>`}`;
    }
    return `${venc}${t.nosso_numero ? `<span class="fl-sub">nosso nº ${esc(t.nosso_numero)}</span>` : ""}${sit}`;
  }

  function corpoHtml() {
    const d = st.dados;
    const [ano, mes] = d.competencia.split("-").map(Number);
    const de = e => d.itens.filter(i => e.includes(i.estado));
    const lote = de(["entra", "erro"]), atencao = de(["incerto", "enviando"]), tirados = de(["tirado"]), feitos = de(["faturado"]);
    const fora = de(["fora"]).filter(i => i.motivo_tipo !== "nota"), noOmie = de(["fora"]).filter(i => i.motivo_tipo === "nota");
    const marc = lote.filter(i => st.marcados.has(i.omie_codigo));
    const totalMarc = Math.round(marc.reduce((s, i) => s + (i.valor || 0), 0) * 100) / 100;
    const marcAviso = marc.filter(i => i.avisos?.length), marcDobro = marc.filter(i => i.avisos?.some(a => a.tipo === "dobro"));
    const semContrato = d.preventivas_sem_contrato || [];
    const comNota = d.resumo.faturados + d.resumo.com_nota_omie;
    const sinc = d.sincronizacao?.ultima_em ? new Date(d.sincronizacao.ultima_em).toLocaleString("pt-BR") : "nunca";
    const bancos = [...new Set(marc.map(i => i.banco).filter(Boolean))].join(" e ");

    const avisos = [];
    if (!d.emissao_ligada) avisos.push(`<div class="fl-aviso">O faturamento está desligado neste ambiente (OMIE_EMISSAO). Dá para conferir e montar o lote; confirmar não envia nada.</div>`);
    if (!d.competencia_atual) avisos.push(`<div class="fl-aviso">Este não é o mês corrente. O Omie fatura o contrato no mês em que é chamado, então daqui só se acompanha.</div>`);
    if (st.erro) avisos.push(`<div class="fl-aviso is-risco" role="alert">${esc(st.erro)}</div>`);
    if (st.ok) avisos.push(`<div class="fl-aviso is-ok" role="status">${esc(st.ok)}</div>`);
    const comAviso = lote.filter(i => i.avisos?.length), dobro = lote.filter(i => i.avisos?.some(a => a.tipo === "dobro"));
    if (comAviso.length) avisos.push(`<div class="fl-aviso${dobro.length ? " is-risco" : ""}"><b>${comAviso.length} contrato${comAviso.length === 1 ? "" : "s"} do lote com aviso${dobro.length ? `, ${dobro.length} de possível nota em dobro` : ""}.</b> O aviso está na linha de cada um. Ninguém sai do lote sozinho: confira e tire quem não deve ir.</div>`);
    if (d.resumo.sem_boleto) avisos.push(`<div class="fl-aviso is-risco"><b>${d.resumo.sem_boleto} nota${d.resumo.sem_boleto === 1 ? "" : "s"} sem boleto.</b> O Omie gerou a nota e o título, mas não o boleto. Veja em "Faturados pelo sistema" e use "Gerar boleto".</div>`);

    const rodando = d.rodando
      ? `<div class="fl-rodando" role="status">Enviando ao Omie: ${d.rodando.feitos} de ${d.rodando.total}. Pode deixar a tela aberta; a lista se atualiza sozinha.</div>` : "";

    const pode = d.emissao_ligada && d.competencia_atual && !d.rodando;
    const pe = st.confirmando
      ? `<div class="fl-confirma" role="alertdialog" aria-labelledby="flConfTit">
          <p id="flConfTit"><b>Faturar ${marc.length} contrato${marc.length === 1 ? "" : "s"} no Omie, total ${moeda(totalMarc)}${bancos ? `, cobrando no ${esc(bancos)}` : ""}?</b></p>
          ${marcAviso.length ? `<p class="${marcDobro.length ? "fl-msg" : "fl-av"}"><b>${marcAviso.length} dos marcados ${marcAviso.length === 1 ? "tem" : "têm"} aviso${marcDobro.length ? `, ${marcDobro.length} de possível nota em dobro` : ""}.</b> Volte e confira se não tiver certeza.</p>` : ""}
          <p>O Omie gera a nota de cada um na prefeitura e o boleto do cliente. Isso não se desfaz por aqui: cancelar nota é no Omie.</p>
          <div class="fl-bts"><button type="button" class="btn btn-sm" data-fl="voltar">Voltar</button>
            <button type="button" class="btn btnAccent" data-fl="faturar">Sim, faturar ${marc.length}</button></div>
        </div>`
      : `<div class="fl-pe">
          <span class="fl-sinc">Copiado do Omie em ${esc(sinc)}${d.sincronizacao?.ultimo_erro ? ` · último erro: ${esc(d.sincronizacao.ultimo_erro)}` : ""}</span>
          <div class="fl-bts"><button type="button" class="btn btn-sm" data-fl="baixar">Baixar a lista do mês</button>
            <button type="button" class="btn btn-sm" data-fl="atualizar">Atualizar do Omie</button>
            ${lote.length ? `<button type="button" class="btn btnAccent" data-fl="confirmar" ${pode && marc.length ? "" : "disabled"}>Faturar ${marc.length} · ${moeda(totalMarc)}</button>` : ""}</div>
        </div>`;

    return `
      ${avisos.join("")}
      <div class="fl-faixa">
        <div><span>No lote</span><b>${lote.length}</b><small>${moeda(d.resumo.valor_lote)}</small></div>
        <div><span>Com nota no mês</span><b>${comNota} de ${d.resumo.esperados}</b><small>${d.resumo.faturados} pelo sistema · ${d.resumo.com_nota_omie} pela tela do Omie</small></div>
        <div><span>Tirados</span><b>${tirados.length}</b><small>não vão neste mês</small></div>
        <div><span>Fora do lote</span><b>${fora.length}</b><small>ver o motivo abaixo</small></div>
      </div>
      ${rodando}
      ${atencao.length ? `<h3 class="fl-h is-risco">Envio sem resposta (${atencao.length})</h3>
        <p class="fl-exp">A chamada ao Omie caiu sem resposta, então não dá para saber se a nota saiu. Nenhum destes vai de novo sozinho. Se a nota saiu, a próxima cópia do Omie resolve. Se você conferiu no Omie e não saiu, libere para o lote.</p>
        <table class="fl-tab"><tbody>${atencao.map(i => `<tr><td>${nome(i)}${contrato(i)}${i.mensagem ? `<span class="fl-msg">${esc(i.mensagem)}</span>` : ""}</td>
          <td class="fl-num">${moeda(i.valor)}</td>
          <td class="fl-acao">${d.rodando ? "" : `<button type="button" class="btn btn-sm" data-fl-liberar="${i.omie_codigo}">Não saiu, liberar</button>`}</td></tr>`).join("")}</tbody></table>` : ""}
      <h3 class="fl-h">No lote de ${MESES[mes - 1]} (${lote.length})</h3>
      ${lote.length ? `<p class="fl-exp">Marque quem vai agora. Na primeira vez, vale faturar um só e conferir a nota e o boleto no Omie antes de mandar o resto.
          <button type="button" class="fl-link" data-fl="todos">Marcar todos</button> · <button type="button" class="fl-link" data-fl="nenhum">Desmarcar todos</button></p>
        <table class="fl-tab"><tbody>${linhasLote(lote)}</tbody></table>`
        : `<p class="fl-vazio">${feitos.length ? "Todos os contratos do mês já foram faturados ou estão fora do lote." : "Nenhum contrato para faturar."}</p>`}
      ${tirados.length ? `<h3 class="fl-h">Tirados do lote (${tirados.length})</h3>
        <table class="fl-tab"><tbody>${tirados.map(i => `<tr><td>${nome(i)}${contrato(i)}${avisosDe(i)}</td><td class="fl-num">${moeda(i.valor)}</td>
          <td class="fl-acao"><button type="button" class="btn btn-sm" data-fl-devolver="${i.omie_codigo}" ${d.rodando ? "disabled" : ""}>Devolver</button></td></tr>`).join("")}</tbody></table>` : ""}
      ${fora.length ? `<h3 class="fl-h">Fora do lote (${fora.length})</h3>
        <table class="fl-tab"><tbody>${fora.map(i => `<tr><td>${nome(i)}${contrato(i)}<span class="fl-msg">${esc(i.motivo)}</span></td><td class="fl-num">${moeda(i.valor)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${noOmie.length ? `<details class="fl-det"><summary class="fl-h">Já faturados pela tela do Omie (${noOmie.length})</summary>
        <p class="fl-exp">Têm nota do mês feita direto no Omie. Ficam fora do lote para não sair nota em dobro.</p>
        <table class="fl-tab"><tbody>${noOmie.map(i => `<tr><td>${nome(i)}${contrato(i)}<span class="fl-sub">${esc(i.motivo)}</span>${avisosDe(i)}</td><td class="fl-num">${moeda(i.valor)}</td></tr>`).join("")}</tbody></table></details>` : ""}
      ${semContrato.length ? `<details class="fl-det"><summary class="fl-h">Preventivas sem contrato no Omie (${semContrato.length})</summary>
        <p class="fl-exp">Preventiva ativa no sistema que nenhum contrato em vigor neste mês paga: o técnico vai e ninguém cobra. Ou o contrato acabou e a preventiva ficou ligada, ou o contrato está no Omie e não foi ligado ao prédio (veja em Contratos).</p>
        <table class="fl-tab"><tbody>${semContrato.map(p => `<tr><td><button type="button" class="fl-nome" data-fl-predio="${p.condominio_id}">${esc(p.condominio_nome)}</button><span class="fl-sub">${esc(p.titulo)} · preventiva nº ${p.plano_id}</span></td></tr>`).join("")}</tbody></table></details>` : ""}
      ${feitos.length ? `<h3 class="fl-h is-ok">Faturados pelo sistema (${feitos.length})</h3>
        <table class="fl-tab"><thead><tr><th>Prédio</th><th>Nota</th><th>Boleto</th><th class="fl-num">Valor</th></tr></thead>
        <tbody>${feitos.map(i => `<tr><td>${nome(i)}${contrato(i)}<span class="fl-sub">${i.enviado_em ? "em " + esc(new Date(i.enviado_em).toLocaleString("pt-BR")) : ""}${i.por ? " · " + esc(i.por) : ""}</span>${avisosDe(i)}</td>
          <td>${i.nfse ? `NFS-e ${esc(i.nfse)}` : `<span class="fl-sub">aguardando a prefeitura (OS ${esc(i.omie_os || "")})</span>`}</td>
          <td>${boletoHtml(i)}</td>
          <td class="fl-num">${moeda(i.valor)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${pe}`;
  }

  function cabecalhoSub() {
    const d = st.dados;
    if (!d) return "Carregando…";
    if (st.mudandoDia) return `<label class="fl-dia">Propor o lote todo dia <input type="number" min="1" max="28" value="${d.dia_configurado}" data-fl-dia> do mês
      <button type="button" class="btn btn-sm" data-fl="salvar-dia">Salvar</button> <button type="button" class="fl-link" data-fl="cancelar-dia">cancelar</button></label>
      <span class="fl-sub">Se cair em fim de semana ou feriado, passa para o próximo dia útil.</span>`;
    return `Dia proposto: ${esc(diaSemana(d.dia_proposto))} (todo dia ${d.dia_configurado}, ou o próximo dia útil) · <button type="button" class="fl-link" data-fl="mudar-dia">mudar o dia</button>
      <br>Nada sai sem a sua confirmação. Dá para faturar antes ou depois do dia proposto, dentro do mês.`;
  }

  function desenhar() {
    const ov = document.getElementById("agOverlay");
    if (!ov || !st) return;
    ov.querySelector("#flSub").innerHTML = cabecalhoSub();
    ov.querySelector("#flCorpo").innerHTML = st.dados ? corpoHtml() : `<p class="fl-vazio">Carregando…</p>`;
  }

  async function carregar({ manterMarcas = true } = {}) {
    if (!st) return;
    // Fechado por fora (Esc da Agenda remove o #agOverlay): para de acompanhar.
    if (!document.getElementById("agOverlay")) { fechar(); return; }
    const r = await fetch(`/agenda/faturamento/lote?competencia=${st.comp}`, { headers: authHeaders() });
    const j = await json(r);
    if (!st) return;
    if (!r.ok) { st.erro = j.error || "Não consegui montar o lote."; st.dados = st.dados || null; desenhar(); return; }
    const antes = st.dados;
    st.dados = j;
    const noLote = j.itens.filter(i => i.estado === "entra" || i.estado === "erro").map(i => i.omie_codigo);
    // Primeira carga: todos marcados. Depois: mantém as marcas de quem segue no lote.
    st.marcados = !antes || !manterMarcas ? new Set(noLote) : new Set(noLote.filter(c => st.marcados.has(c) || !antes.itens.some(i => i.omie_codigo === c && (i.estado === "entra" || i.estado === "erro"))));
    desenhar();
    if (st.timer) clearTimeout(st.timer);
    if (j.rodando) st.timer = setTimeout(() => carregar(), 2000);
    else if (antes?.rodando && typeof _agInvalidar === "function") { _agInvalidar(); if (typeof _agCarregar === "function") _agCarregar(); }
  }

  async function acao(b) {
    const qual = b.dataset.fl;
    const d = st.dados;
    st.erro = null; st.ok = null;
    if (qual === "todos" || qual === "nenhum") {
      st.marcados = new Set(qual === "todos" ? d.itens.filter(i => i.estado === "entra" || i.estado === "erro").map(i => i.omie_codigo) : []);
      return desenhar();
    }
    if (qual === "baixar") return baixar();
    if (qual === "mudar-dia") { st.mudandoDia = true; return desenhar(); }
    if (qual === "cancelar-dia") { st.mudandoDia = false; return desenhar(); }
    if (qual === "salvar-dia") {
      const v = Number(document.querySelector("[data-fl-dia]")?.value);
      if (!Number.isInteger(v) || v < 1 || v > 28) { st.erro = "O dia vai de 1 a 28."; return desenhar(); }
      b.disabled = true;
      const r = await fetch("/admin/configuracoes", { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ "omie.faturamento_dia": v }) });
      const j = await json(r);
      if (!r.ok) { st.erro = j.error || "Não consegui salvar o dia."; return desenhar(); }
      st.mudandoDia = false;
      if (typeof _agInvalidar === "function") { _agInvalidar(); if (typeof _agCarregar === "function") _agCarregar(); }
      return carregar();
    }
    if (qual === "atualizar") {
      b.disabled = true; b.textContent = "Atualizando…";
      const r = await post("/agenda/faturamento/atualizar", {});
      const j = await json(r);
      if (!r.ok) st.erro = j.error || "Não consegui atualizar do Omie.";
      return carregar();
    }
    if (qual === "confirmar") { st.confirmando = true; return desenhar(); }
    if (qual === "voltar") { st.confirmando = false; return desenhar(); }
    if (qual === "faturar") {
      const lote = d.itens.filter(i => (i.estado === "entra" || i.estado === "erro") && st.marcados.has(i.omie_codigo));
      const total = Math.round(lote.reduce((s, i) => s + (i.valor || 0), 0) * 100) / 100;
      b.disabled = true; b.textContent = "Enviando…";
      const r = await post("/agenda/faturamento/lote/confirmar", { competencia: st.comp, contratos: lote.map(i => i.omie_codigo), valor_total: total });
      const j = await json(r);
      st.confirmando = false;
      if (!r.ok) st.erro = j.error || "O Omie não foi chamado.";
      return carregar();
    }
  }

  // A lista do mês em planilha (27/11/2026): o que era a "NF PREV <MÊS>" feita
  // à mão no Dropbox, agora tirada do que o sistema já sabe — cada contrato,
  // o valor, o que aconteceu no mês e os avisos. CSV com ";" e vírgula decimal,
  // com BOM, para o Excel em português abrir direto.
  function baixar() {
    const d = st.dados;
    if (!d) return;
    const SIT = { entra: "No lote", erro: "No lote (erro da última vez)", tirado: "Tirado do lote", enviando: "Enviando", incerto: "Envio sem resposta" };
    const sit = i => i.estado === "faturado" ? `Faturado pelo sistema${i.nfse ? ` (NFS-e ${i.nfse})` : ""}`
      : i.motivo_tipo === "nota" ? `Nota pela tela do Omie: ${i.motivo}` : i.estado === "fora" ? `Fora do lote: ${i.motivo}` : SIT[i.estado] || i.estado;
    const cel = v => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = v => (v == null ? "" : Number(v).toFixed(2).replace(".", ","));
    const linhas = [["Prédio", "Cliente no Omie", "Contrato", "Valor", "No mês", "Preventiva", "Avisos"]];
    for (const i of d.itens) {
      linhas.push([i.condominio_nome || "", i.cliente || "", i.numero || "", num(i.valor), sit(i),
        i.plano_id ? `${i.plano_titulo || "Preventiva"} nº ${i.plano_id}` : "", (i.avisos || []).map(a => a.texto).join(" | ")]);
    }
    for (const p of d.preventivas_sem_contrato || []) linhas.push([p.condominio_nome, "", "", "", "Preventiva sem contrato no Omie", `${p.titulo} nº ${p.plano_id}`, ""]);
    const csv = "﻿" + linhas.map(l => l.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `contratos-${d.competencia}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function porItem(url, corpo) {
    st.erro = null;
    const r = await post(url, corpo);
    const j = await json(r);
    if (!r.ok) st.erro = j.error || "Não deu certo.";
    return carregar();
  }

  function abrir(comp) {
    if (typeof _agFecharForm === "function") _agFecharForm();
    fechar();
    const d = new Date();
    comp = comp || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const [ano, mes] = comp.split("-").map(Number);
    st = { comp, dados: null, marcados: new Set(), confirmando: false, erro: null, timer: null, mudandoDia: false };
    const ov = document.createElement("div");
    ov.id = "agOverlay";
    ov.className = "modalOverlay";
    ov.style.display = "flex";
    ov.innerHTML = `<div class="modalBox ag-fat fl" role="dialog" aria-labelledby="flTit">
      <div class="modalHead"><div><div class="modalTitle" id="flTit">Faturamento dos contratos: ${MESES[mes - 1]} de ${ano}</div>
        <div class="modalSub" id="flSub">Carregando…</div></div>
        <button class="btn btn-sm" type="button" data-fl="fechar">Fechar</button></div>
      <div class="modalBody" id="flCorpo"><p class="fl-vazio">Carregando…</p></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", async (e) => {
      if (e.target === ov) return st?.confirmando || st?.dados?.rodando ? null : fechar();
      const t = e.target;
      const b = t.closest("[data-fl]");
      if (b) { if (b.dataset.fl === "fechar") return fechar(); return acao(b); }
      const marca = t.closest("[data-fl-marca]");
      if (marca) {
        const c = Number(marca.dataset.flMarca);
        if (marca.checked) st.marcados.add(c); else st.marcados.delete(c);
        return desenhar();
      }
      const tirar = t.closest("[data-fl-tirar]");
      if (tirar) { tirar.disabled = true; return porItem("/agenda/faturamento/lote/tirar", { competencia: st.comp, omie_contrato: Number(tirar.dataset.flTirar), tirar: true }); }
      const dev = t.closest("[data-fl-devolver]");
      if (dev) { dev.disabled = true; return porItem("/agenda/faturamento/lote/tirar", { competencia: st.comp, omie_contrato: Number(dev.dataset.flDevolver), tirar: false }); }
      const bol = t.closest("[data-fl-boleto]");
      if (bol) {
        const it = st.dados.itens.find(x => x.omie_codigo === Number(bol.dataset.flBoleto));
        const quem = it ? (it.condominio_nome || it.cliente || "contrato " + it.numero) : "este contrato";
        const valor = it?.titulo?.valor != null ? moeda(it.titulo.valor) : moeda(it?.valor);
        if (!confirm(`Gerar no Omie o boleto de ${quem}, ${valor}, vencimento ${it?.titulo ? dataBr(it.titulo.vencimento) : "—"}, ${it?.banco ? "no " + it.banco : "na conta do contrato"}? O boleto fica registrado no banco.`)) return;
        bol.disabled = true; bol.textContent = "Gerando…";
        st.erro = null; st.ok = null;
        const r = await post("/agenda/faturamento/lote/boleto", { competencia: st.comp, omie_contrato: it.omie_codigo });
        const j = await json(r);
        if (!r.ok) st.erro = j.error || "O boleto não foi gerado.";
        else st.ok = j.ja_tinha ? `O título de ${quem} já tinha boleto no Omie (nosso nº ${j.nosso_numero || "—"}). Nada foi gerado.` : `Boleto de ${quem} gerado (nosso nº ${j.nosso_numero || "—"}).`;
        return carregar();
      }
      const lib = t.closest("[data-fl-liberar]");
      if (lib) {
        if (!confirm("Você conferiu no Omie que a nota deste contrato NÃO saiu? Ele volta para o lote e pode ser faturado de novo.")) return;
        lib.disabled = true;
        return porItem("/agenda/faturamento/lote/liberar", { competencia: st.comp, omie_contrato: Number(lib.dataset.flLiberar) });
      }
      const pr = t.closest("[data-fl-predio]");
      if (pr && typeof abrirFichaCondominio === "function") { fechar(); return abrirFichaCondominio(Number(pr.dataset.flPredio), "contrato"); }
      const ct = t.closest("[data-fl-contrato]");
      if (ct && window.GBOmie?.abrir) { fechar(); return window.GBOmie.abrir(Number(ct.dataset.flContrato)); }
    });
    carregar({ manterMarcas: false });
  }

  window.GBLote = { abrir, fechar };
})();
