// ============================================================
// PÁGINA DA NOTA FISCAL (23/11/2026, migration 104)
// ============================================================
//
// Opção B da maquete /dev/_nota-preview.html, escolhida pelo Pedro: a nota é
// um DOCUMENTO com endereço próprio (#/orcamentos/<id>/nota), no molde dos
// ERPs (Omie, Bling, Tiny), e não mais um modal por cima do orçamento.
// Desenho e porquê em docs/modulos/nota-fiscal.md, seção "A página da nota".
//
//   antes de emitir   rascunho salvo sozinho (cobrança, e-mails, informações
//                     adicionais), impostos conferidos no Omie (DANFE), o que
//                     falta no orçamento com o atalho, espelho da nota
//   depois            número, situação, PDF, boletos, histórico
//
// Peça/Serviço e o produto do Omie de cada peça continuam sendo do ORÇAMENTO:
// aqui só aparecem como pendência, com o atalho que grava na linha (mesma
// rota do editor) ou que leva até ela.
//
// ⚠️ NADA DE CRASE DENTRO DOS TEMPLATES (ver CLAUDE.md).

let _nfpId = null;        // orçamento da página aberta
let _nfpDados = null;     // a prévia do servidor (GET /nota)
let _nfpPag = null;       // a cobrança na tela
let _nfpOcupado = false;  // gravando, conferindo ou emitindo
let _nfpAviso = null;     // { txt, erro }
let _nfpSalvoEm = null;   // hora do último rascunho salvo
let _nfpSalvando = null;  // timer do salvar
let _nfpImpErro = null;   // por que os impostos não vieram
let _nfpCarregando = null; // id sendo carregado agora (trava pedido repetido)

const _NFP_STATUS = {
  processando: ["Processando", "is-proc"],
  emitida: ["Autorizada", "is-ok"],
  erro: ["Falhou", "is-erro"],
  cancelada: ["Cancelada no Omie", "is-erro"],
};

function _nfpEsc(s) { return _waEscaparHtml(s == null ? "" : String(s)); }
const _nfpMoeda = (v) => _orcFmtValor(v);
const _nfpDataBr = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "";
const _nfpHora = (d) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

function _nfpNaPagina() {
  return Boolean(document.querySelector('.section[data-section="nota-detalhe"].is-active'));
}

// Abre a página (de um botão ou do endereço).
async function _nfAbrirPagina(orcId, { daRota = false } = {}) {
  orcId = Number(orcId);
  if (!Number.isInteger(orcId) || orcId <= 0) return;
  const destino = `#/orcamentos/${orcId}/nota`;
  if (!_nfpNaPagina()) {
    _rotaAplicando = true;
    try { showSection("nota-detalhe"); } finally { _rotaAplicando = false; }
    document.querySelector(".content")?.scrollTo?.(0, 0);
    window.scrollTo?.(0, 0);
  }
  if (!daRota && location.hash !== destino) history.pushState(null, "", destino);
  // O roteador pode chamar de novo para o mesmo endereço (boot, hashchange):
  // a mesma nota já aberta ou a caminho não é pedida outra vez.
  if (daRota && _nfpId === orcId && (_nfpDados || _nfpCarregando === orcId)) return;
  if (_nfpId !== orcId) { _nfpDados = null; _nfpPag = null; _nfpAviso = null; _nfpImpErro = null; _nfpSalvoEm = null; }
  _nfpId = orcId;
  const raiz = document.getElementById("nfPagina");
  if (raiz && !_nfpDados) raiz.innerHTML = `<div class="nfp-carregando">Carregando a nota…</div>`;
  await _nfpCarregar();
}

async function _nfpCarregar() {
  const id = _nfpId;
  _nfpCarregando = id;
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${id}/nota`, { headers: authHeaders() });
    const j = await lerRespostaJson(r, "Nota fiscal");
    if (!r.ok) throw new Error(j.error || "Erro ao abrir a nota");
    if (id !== _nfpId) return;
    _nfpDados = j;
    _nfpSincPag();
    _nfpSalvoEm = j.rascunho?.salvo_em || null;
    _nfpRender();
    _nfpConferirSozinho();
  } catch (e) {
    const raiz = document.getElementById("nfPagina");
    if (raiz) raiz.innerHTML = `<div class="nfp-carregando nfp-erro">${_nfpEsc(e.message)} <a href="#/orcamentos/${id}">Voltar ao orçamento</a></div>`;
  } finally { if (_nfpCarregando === id) _nfpCarregando = null; }
}

function _nfpSincPag() {
  const p = _nfpDados?.pagamento;
  _nfpPag = p ? { parcelas: p.parcelas, vencimentos: p.lista.map(x => x.vencimento), banco: p.banco, boleto: p.boleto } : null;
}

// ── Estado derivado ────────────────────────────────────────────────────────
function _nfpEstado() {
  const st = _nfpDados?.nota?.nota_status || null;
  return { st, editavel: !st || st === "erro" };
}

function _nfpPendencias() {
  const p = _nfpDados;
  const efetiva = l => l.natureza || l.natureza_sugerida;
  const out = [];
  const cob = p.linhas.filter(l => l.cobravel);
  const semMarca = cob.filter(l => !l.natureza);
  if (semMarca.length) out.push({ tipo: "marca", linhas: semMarca });
  if (p.tipo === "nfe") {
    for (const l of cob) {
      if (efetiva(l) !== "peca") continue;
      if (!l.omie_produto_codigo) out.push({ tipo: "produto", linha: l, lembrado: (l.sugestoes || []).find(s => s.lembrado) || null });
      else if (l.produto?.inativo) out.push({ tipo: "inativo", linha: l });
    }
  }
  return out;
}

// Bloqueio que não é pendência do orçamento (status, CNPJ, UF…).
function _nfpBloqueio(pend) {
  const p = _nfpDados;
  if (!p.bloqueio) return null;
  if (pend.length && p.bloqueio_pendencia) return null;
  if (p.nota?.nota_status === "emitida" || p.nota?.nota_status === "processando") return null;
  return p.bloqueio;
}

// ── Desenho ────────────────────────────────────────────────────────────────
function _nfpRender() {
  const raiz = document.getElementById("nfPagina");
  const p = _nfpDados;
  if (!raiz || !p) return;
  const { st, editavel } = _nfpEstado();
  const nfe = p.tipo === "nfe";
  const pend = editavel ? _nfpPendencias() : [];
  const bloq = editavel ? _nfpBloqueio(pend) : null;
  const n = p.nota || {};
  const tipoNome = nfe ? "DANFE · NF-e de produto" : "NFS-e · nota de serviço";
  const rotEmitir = nfe ? "Emitir DANFE" : "Emitir NFS-e";
  const [stRot, stCls] = st ? (_NFP_STATUS[st] || [st, ""]) : ["Rascunho", "is-rasc"];
  const podeEmitir = editavel && !bloq && !pend.length && p.emissao_ligada && !_nfpOcupado;
  const orcNum = p.orcamento?.numero || ("#" + _nfpId);

  let sub;
  if (st === "emitida") sub = `Nº ${_nfpEsc(n.nota_numero || "—")} · autorizada${n.nota_emitida_em ? " em " + _nfpHora(n.nota_emitida_em) : ""}${n.nota_emitida_por_nome ? " · pedida por " + _nfpEsc(n.nota_emitida_por_nome) : ""}`;
  else if (st === "processando") sub = `Pedida ao Omie${n.nota_solicitada_em ? " em " + _nfpHora(n.nota_solicitada_em) : ""}. ${nfe ? "A SEFAZ" : "A prefeitura"} está processando.`;
  else if (st === "cancelada") sub = "Cancelada no Omie. Uma nota nova para este orçamento precisa ser emitida por lá.";
  else sub = `Do ${_nfpEsc(orcNum)} · ${_nfpEsc(p.cliente?.nome || "—")} · ${_nfpSalvoEm ? "rascunho salvo " + _nfpHora(_nfpSalvoEm) + (p.rascunho?.salvo_por_nome ? " por " + _nfpEsc(p.rascunho.salvo_por_nome) : "") : "nada alterado ainda"}`;

  let acoes = "";
  if (editavel) {
    acoes = `
      ${p.rascunho?.salvo_em ? `<button class="btn" type="button" data-nfp="descartar">Descartar rascunho</button>` : ""}
      <button class="btn" type="button" data-nfp="espelho">Espelho da nota</button>
      <button class="btn btnAccent" type="button" data-nfp="emitir"${podeEmitir ? "" : " disabled"}>${_nfpOcupado === "emitindo" ? "Emitindo…" : (st === "erro" ? "Tentar de novo" : rotEmitir)}</button>`;
  } else {
    acoes = `
      ${n.nota_url ? `<a class="btn" href="${_nfpEsc(n.nota_url)}" target="_blank" rel="noopener">${nfe ? "DANFE (PDF)" : "Ver a NFS-e"}</a>` : ""}
      <button class="btn" type="button" data-nfp="espelho">Espelho</button>
      ${st === "processando" || st === "emitida" ? `<button class="btn" type="button" data-nfp="atualizar">Atualizar</button>` : ""}`;
  }

  const temBoleto = !!(_nfpPag ? _nfpPag.boleto : n.boleto_status);
  const passos = [
    ["Rascunho", true],
    ["Impostos conferidos", Boolean(p.impostos) || st === "emitida" || st === "processando"],
    [nfe ? "Autorizada pela SEFAZ" : "Autorizada pela prefeitura", st === "emitida"],
    ...(temBoleto || n.boleto_status ? [["Boletos gerados", n.boleto_status === "gerado"]] : []),
  ];

  raiz.innerHTML = `
    <nav class="nfp-migalha" aria-label="Caminho">
      <a href="#/orcamentos">Orçamentos</a> › <a href="#/orcamentos/${_nfpId}">${_nfpEsc(orcNum)}</a> › <b>Nota fiscal</b>
    </nav>
    <header class="nfp-cab">
      <div class="nfp-cab-txt">
        <h1 class="nfp-t">${tipoNome} <span class="nfp-selo ${stCls}">${_nfpEsc(stRot)}</span></h1>
        <p class="nfp-sub">${sub}</p>
      </div>
      <div class="nfp-acoes">${acoes}</div>
    </header>
    ${_nfpAviso ? `<div class="nfp-aviso${_nfpAviso.erro ? " is-erro" : ""}" role="status">${_nfpEsc(_nfpAviso.txt)}</div>` : ""}
    <ol class="nfp-passos" aria-label="Situação da nota">
      ${passos.map(([t, ok]) => `<li class="${ok ? "is-feito" : ""}">${t}</li>`).join("")}
    </ol>
    <div class="nfp-grade">
      <div class="nfp-col">
        ${st === "erro" && n.nota_erro ? `<div class="nfp-caixa is-erro"><b>A última tentativa falhou</b><span>${_nfpEsc(n.nota_erro)}</span></div>` : ""}
        ${bloq ? _nfpBloqHtml(bloq) : ""}
        ${editavel && !p.emissao_ligada && !bloq ? `<div class="nfp-caixa is-info">Emissão desligada neste ambiente (OMIE_EMISSAO). Dá para preparar e conferir tudo; o botão não emite.</div>` : ""}
        ${pend.length ? _nfpPendHtml(pend) : ""}
        ${_nfpDestHtml()}
        ${_nfpItensHtml()}
        ${_nfpInfoHtml(editavel)}
        ${_nfpHistHtml()}
      </div>
      <aside class="nfp-trilho">
        ${_nfpResumoHtml()}
        ${_nfpImpostosHtml(editavel, pend)}
        ${_nfpCobrancaHtml(editavel)}
        ${_nfpEnvioHtml(editavel)}
        ${st === "emitida" ? `<div class="card nfp-card"><h3 class="nfp-h">Corrigir ou cancelar</h3><p class="nfp-nota">Carta de correção e cancelamento são feitos no Omie. Depois, use Atualizar aqui.</p></div>` : ""}
      </aside>
    </div>`;
}

function _nfpBloqHtml(bloq) {
  const p = _nfpDados;
  const cadastro = /CNPJ|cadastro/i.test(bloq) && p.destinatario?.condominio_id
    ? `<a class="nfp-lk" href="#/condominios/${p.destinatario.condominio_id}">Abrir o cadastro do prédio</a>` : "";
  return `<div class="nfp-caixa is-erro" role="alert"><b>Não dá para emitir</b><span>${_nfpEsc(bloq)}</span>${cadastro}</div>`;
}

function _nfpPendHtml(pend) {
  const ROT = { peca: "peça", servico: "serviço" };
  const itens = pend.map(x => {
    if (x.tipo === "marca") {
      const k = x.linhas.length;
      return `
        <li class="nfp-pend-it">
          <div class="nfp-pend-txt">
            <b>Peça ou serviço?</b>
            <span>${k === 1 ? "Uma linha do orçamento está" : k + " linhas do orçamento estão"} sem marcação. Pelo texto, o sistema sugere:</span>
            <ul class="nfp-sug">${x.linhas.map(l => `
              <li><span>${_nfpEsc(l.descricao)}</span><b>${ROT[l.natureza_sugerida] || "—"}</b>
                <button type="button" class="nfp-lk" data-nfp-linha="${l.id}">corrigir</button></li>`).join("")}
            </ul>
          </div>
          <div class="nfp-pend-acoes"><button type="button" class="btn btn-sm" data-nfp="confirmar">${k === 1 ? "Confirmar a sugestão" : "Confirmar as " + k + " sugestões"}</button></div>
        </li>`;
    }
    const l = x.linha;
    if (x.tipo === "produto") {
      const s = x.lembrado;
      return `
        <li class="nfp-pend-it">
          <div class="nfp-pend-txt">
            <b>Qual produto do Omie é esta peça?</b>
            <span>${_nfpEsc(l.descricao)}</span>
            ${s ? `<span>Da última vez foi <span class="nfp-cod">${_nfpEsc(s.codigo || s.codigo_produto)}</span> ${_nfpEsc(s.descricao || "")}${s.ncm ? " · NCM " + _nfpEsc(s.ncm) : ""}</span>` : ""}
          </div>
          <div class="nfp-pend-acoes">
            ${s ? `<button type="button" class="btn btn-sm" data-nfp-usar="${l.id}" data-cod="${_nfpEsc(s.codigo_produto)}">Usar este</button>` : ""}
            <button type="button" class="btn btn-sm" data-nfp-linha="${l.id}" data-buscar>${s ? "Escolher outro" : "Escolher no orçamento"}</button>
          </div>
        </li>`;
    }
    return `
      <li class="nfp-pend-it">
        <div class="nfp-pend-txt"><b>Produto inativo no Omie</b><span>${_nfpEsc(l.descricao)} · <span class="nfp-cod">${_nfpEsc(l.produto?.codigo || l.omie_produto_codigo)}</span></span></div>
        <div class="nfp-pend-acoes"><button type="button" class="btn btn-sm" data-nfp-linha="${l.id}" data-buscar>Trocar no orçamento</button></div>
      </li>`;
  }).join("");
  const cat = _nfpDados.catalogo;
  const catTxt = pend.some(x => x.tipo !== "marca") && cat
    ? `<p class="nfp-nota nfp-cat">${cat.sincronizando ? "Atualizando o catálogo do Omie (cerca de 1 min)…" : `Peça nova no Omie? Cadastre lá e atualize a cópia do catálogo${cat.atualizado_em ? " (de " + _nfpHora(cat.atualizado_em) + ")" : ""}.`}
        ${cat.sincronizando ? "" : `<button type="button" class="nfp-lk" data-nfp="catalogo">Atualizar catálogo</button>`}</p>` : "";
  return `
    <section class="card nfp-card nfp-pend" aria-labelledby="nfpPendT">
      <h3 class="nfp-h" id="nfpPendT">Antes de emitir</h3>
      <p class="nfp-nota nfp-pend-sub">${pend.length === 1 ? "Falta 1 coisa" : "Faltam " + pend.length + " coisas"} no orçamento. O que for resolvido aqui fica gravado nele.</p>
      <ul class="nfp-pend-lista">${itens}</ul>
      ${catTxt}
    </section>`;
}

function _nfpDestHtml() {
  const d = _nfpDados.destinatario || {};
  const end = [d.endereco, d.bairro, d.cidade && d.uf ? d.cidade + "/" + d.uf : d.cidade, d.cep].filter(Boolean).join(" · ");
  return `
    <section class="card nfp-card">
      <div class="nfp-card-cab"><h3 class="nfp-h">Destinatário</h3>
        ${d.condominio_id ? `<a class="nfp-lk" href="#/condominios/${d.condominio_id}">Abrir o cadastro</a>` : ""}</div>
      <dl class="nfp-dl">
        <div><dt>Razão social</dt><dd>${_nfpEsc(d.nome || "—")}${d.fantasia && d.fantasia !== d.nome ? `<small>${_nfpEsc(d.fantasia)}</small>` : ""}</dd></div>
        <div><dt>CPF/CNPJ</dt><dd class="nfp-num">${_nfpEsc(d.documento || "—")}</dd></div>
        <div><dt>No Omie</dt><dd>${d.omie_codigo ? "já cadastrado" : "cadastrado na emissão"}</dd></div>
        <div class="is-larga"><dt>Endereço</dt><dd>${_nfpEsc(end || "—")}</dd></div>
      </dl>
    </section>`;
}

function _nfpItensHtml() {
  const p = _nfpDados;
  const nfe = p.tipo === "nfe";
  const imp = p.impostos && p.impostos.tipo === "nfe" ? p.impostos : null;
  const tribDe = (i, k) => {
    if (!imp) return "";
    const x = imp.itens.find(t => t.item === `${i.linha_id}-${k + 1}`) || imp.itens[k];
    return x ? (x.icms_cst || "") : "";
  };
  const linhas = (p.itens || []).map((i, k) => `
    <tr>
      ${nfe ? `<td class="nfp-cod">${_nfpEsc(i.codigo || "—")}</td>` : ""}
      <td>${_nfpEsc(i.descricao)}${i.ficha_tecnica ? `<div class="nfp-ficha">${_nfpEsc(i.ficha_tecnica)}</div>` : ""}</td>
      ${nfe ? `<td class="nfp-num">${_nfpEsc(i.ncm || "—")}</td><td class="nfp-num">${_nfpEsc(i.cfop || "")}</td>` : ""}
      <td class="n">${_nfpEsc(i.quantidade)}</td>
      <td class="n">${_nfpMoeda(i.valor_unitario)}</td>
      <td class="n"><b>${_nfpMoeda(i.total)}</b></td>
      ${imp ? `<td class="nfp-num">${_nfpEsc(tribDe(i, k))}</td>` : ""}
    </tr>`).join("");
  const notas = [];
  if (nfe && p.servico_embutido > 0) notas.push(`O serviço (${_nfpMoeda(p.servico_embutido)}) não sai como linha: entra no preço das peças, na proporção de cada uma.`);
  if (p.rateado && !(nfe && p.servico_embutido > 0)) notas.push(`O orçamento tem valor total manual: ele foi distribuído entre ${nfe ? "as peças" : "as linhas"}, na proporção de cada uma.`);
  if (p.linhas.some(l => !l.cobravel)) notas.push("Linhas sem valor não entram na nota.");
  if (!nfe) notas.push("Serviço 14.01 (conserto e manutenção de máquinas e equipamentos), código municipal 140101.");
  const { editavel } = _nfpEstado();
  return `
    <section class="card nfp-card">
      <div class="nfp-card-cab"><h3 class="nfp-h">Itens</h3>
        ${editavel ? `<a class="nfp-lk" href="#/orcamentos/${_nfpId}">Editar no orçamento</a>` : ""}</div>
      ${linhas ? `
        <div class="nfp-tab-wrap"><table class="nfp-tab">
          <thead><tr>${nfe ? "<th>Código</th>" : ""}<th>Descrição</th>${nfe ? "<th>NCM</th><th>CFOP</th>" : ""}<th class="n">Qtd</th><th class="n">Unitário</th><th class="n">Total</th>${imp ? "<th>ICMS</th>" : ""}</tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>`
        : `<p class="nfp-nota">Os itens aparecem aqui quando o que falta no orçamento for resolvido.</p>`}
      ${notas.map(t => `<p class="nfp-nota">${t}</p>`).join("")}
    </section>`;
}

function _nfpInfoHtml(editavel) {
  const p = _nfpDados;
  const v = p.rascunho?.info_adicional ?? p.info_adicional_padrao ?? "";
  return `
    <section class="card nfp-card">
      <h3 class="nfp-h"><label for="nfpInfo">Informações adicionais</label></h3>
      <textarea id="nfpInfo" class="input nfp-larga" rows="3" maxlength="1500" data-nfp-info${editavel ? "" : " readonly"}>${_nfpEsc(v)}</textarea>
      <p class="nfp-nota">Vai no campo de informações complementares da nota${p.tipo === "nfe" ? " (DANFE)" : ""}.</p>
    </section>`;
}

function _nfpHistHtml() {
  const p = _nfpDados;
  const n = p.nota || {};
  const ev = [];
  if (p.rascunho?.salvo_em) ev.push([p.rascunho.salvo_em, `Rascunho salvo${p.rascunho.salvo_por_nome ? " por " + _nfpEsc(p.rascunho.salvo_por_nome) : ""}`]);
  if (p.impostos?.em) ev.push([p.impostos.em, p.impostos.tipo === "nfe" ? "Impostos simulados no Omie" : "Tributação conferida"]);
  if (n.nota_solicitada_em) ev.push([n.nota_solicitada_em, `Nota pedida ao Omie${n.nota_emitida_por_nome ? " por " + _nfpEsc(n.nota_emitida_por_nome) : ""}`]);
  if (n.nota_emitida_em) ev.push([n.nota_emitida_em, `Autorizada${n.nota_numero ? " · nº " + _nfpEsc(n.nota_numero) : ""}${n.nota_emails ? " · enviada para " + _nfpEsc(n.nota_emails) : ""}`]);
  if (n.boleto_status === "gerado") ev.push([null, `Boletos gerados${n.banco ? " no " + _nfpEsc(n.banco) : ""}`]);
  if (ev.length < 2) return "";
  ev.sort((a, b) => (a[0] ? new Date(a[0]) : Infinity) - (b[0] ? new Date(b[0]) : Infinity));
  return `
    <section class="card nfp-card">
      <h3 class="nfp-h">Histórico</h3>
      <ul class="nfp-hist">${ev.map(([d, t]) => `<li><span class="nfp-hora">${d ? _nfpHora(d) : ""}</span>${t}</li>`).join("")}</ul>
    </section>`;
}

function _nfpResumoHtml() {
  const p = _nfpDados;
  const soma = (p.itens || []).reduce((a, i) => a + Number(i.total || 0), 0);
  return `
    <section class="card nfp-card">
      <h3 class="nfp-h">Resumo</h3>
      <ul class="nfp-kv">
        <li><span>${p.tipo === "nfe" ? "Produtos" : "Serviços"}</span><b>${_nfpMoeda(soma || p.total)}</b></li>
        ${p.tipo === "nfe" ? `<li><span>Frete</span><b>${_nfpMoeda(0)}</b></li>` : ""}
        <li class="is-total"><span>Total da nota</span><b>${_nfpMoeda(p.nota?.nota_valor || p.total)}</b></li>
      </ul>
    </section>`;
}

function _nfpImpostosHtml(editavel, pend) {
  const p = _nfpDados;
  const imp = p.impostos;
  if (p.tipo !== "nfe") {
    return `
      <section class="card nfp-card">
        <h3 class="nfp-h">Impostos</h3>
        <ul class="nfp-kv">
          <li><span>Serviço</span><b>14.01 · 140101</b></li>
          <li><span>ISS</span><b>não retido</b></li>
        </ul>
        <p class="nfp-nota">O Omie não simula a O.S.: o valor do ISS sai com a nota, pela tributação cadastrada lá.</p>
      </section>`;
  }
  let corpo;
  if (imp) {
    const t = imp.totais || {};
    const pis = imp.itens?.[0]?.pis_cst, cof = imp.itens?.[0]?.cofins_cst;
    corpo = `
      ${imp.simples_nacional ? `<p class="nfp-regime">Simples Nacional · ${_nfpEsc(imp.itens?.[0]?.icms_cst || "")}</p>` : ""}
      <ul class="nfp-kv">
        <li><span>ICMS</span><b>${_nfpMoeda(t.icms)}</b></li>
        ${t.icms_st ? `<li><span>ICMS-ST</span><b>${_nfpMoeda(t.icms_st)}</b></li>` : ""}
        <li><span>IPI</span><b>${_nfpMoeda(t.ipi)}</b></li>
        <li><span>PIS${pis ? " · CST " + _nfpEsc(pis) : ""}</span><b>${_nfpMoeda(t.pis)}</b></li>
        <li><span>COFINS${cof ? " · CST " + _nfpEsc(cof) : ""}</span><b>${_nfpMoeda(t.cofins)}</b></li>
        <li class="is-sep"><span>Destacado na nota</span><b>${_nfpMoeda(t.destacado)}</b></li>
      </ul>
      <p class="nfp-nota">${imp.simples_nacional && !t.destacado ? "Do Simples Nacional: a nota não destaca imposto. " : ""}Simulado pelo Omie ${_nfpHora(imp.em)}, com o cenário fiscal das notas feitas à mão.</p>`;
  } else if (_nfpOcupado === "conferindo") {
    corpo = `<p class="nfp-nota">Conferindo no Omie…</p>`;
  } else if (pend.some(x => x.tipo !== "marca")) {
    corpo = `<p class="nfp-nota">A simulação do Omie roda quando cada peça tiver o produto escolhido.</p>`;
  } else {
    corpo = `
      ${_nfpImpErro ? `<p class="nfp-nota nfp-erro">${_nfpEsc(_nfpImpErro)}</p>` : `<p class="nfp-nota">${p.impostos_vencidos ? "Os itens mudaram desde a última simulação." : "Ainda não conferidos."}</p>`}
      ${editavel ? `<button type="button" class="btn btn-sm" data-nfp="impostos">Conferir impostos no Omie</button>` : ""}`;
  }
  return `<section class="card nfp-card"><h3 class="nfp-h">Impostos</h3>${corpo}</section>`;
}

function _nfpCobrancaHtml(editavel) {
  const p = _nfpDados;
  const n = p.nota || {};
  if (!editavel) {
    const bol = (n.boletos || []).map(b => `
      <li><span>${_nfpEsc(b.parcela || "")}${b.vencimento ? " · " + _nfpDataBr(b.vencimento) : ""}</span>
        <b>${b.valor != null ? _nfpMoeda(b.valor) : ""}</b>
        ${b.gerado ? `<button type="button" class="btn btn-sm" data-nfp-boleto="${_nfpEsc(b.omie_titulo)}">Boleto</button>` : `<i class="nfp-erro">${_nfpEsc(b.erro || "sem boleto")}</i>`}</li>`).join("");
    const pedir = n.nota_status === "emitida" && (n.boleto_status === "pendente" || n.boleto_status === "erro");
    return `
      <section class="card nfp-card">
        <h3 class="nfp-h">Cobrança${n.banco ? " · " + _nfpEsc(n.banco) : ""}</h3>
        ${bol ? `<ul class="nfp-parc">${bol}</ul>` : `<p class="nfp-nota">${n.boleto_status === "pendente" ? "O boleto sai quando a nota for autorizada." : "Sem boleto pedido junto com a nota."}</p>`}
        ${n.boleto_erro ? `<p class="nfp-nota nfp-erro">${_nfpEsc(n.boleto_erro)}</p>` : ""}
        ${n.boleto_status === "gerado" && n.remessa ? `<p class="nfp-nota">Falta a remessa: gere no Omie e suba no Net Empresa.</p>` : ""}
        ${pedir ? `<button type="button" class="btn btn-sm" data-nfp="boletos">Gerar boletos</button>` : ""}
      </section>`;
  }
  const pg = p.pagamento;
  if (!pg) return "";
  const opcoes = Array.from({ length: 12 }, (_, k) => k + 1)
    .map(q => `<option value="${q}"${q === pg.parcelas ? " selected" : ""}>${q === 1 ? "À vista" : q + "x no boleto"}</option>`).join("");
  const bancos = (pg.bancos || []).map(b => `<option value="${_nfpEsc(b.id)}"${b.id === pg.banco ? " selected" : ""}>${_nfpEsc(b.nome)}</option>`).join("");
  const nomeBanco = (pg.bancos || []).find(b => b.id === pg.banco)?.nome || "";
  const doOrc = pg.forma_pagamento ? `No orçamento: "${_nfpEsc(pg.forma_pagamento)}"${pg.parcelas !== pg.do_orcamento ? " (alterado aqui)" : ""}` : "O orçamento não diz a forma de pagamento.";
  const dica = !pg.boleto ? "Sem boleto: a nota sai com as parcelas, e o boleto fica para gerar depois."
    : pg.remessa ? `No ${_nfpEsc(nomeBanco)} o boleto só vale depois da remessa, tirada no Omie.`
    : `O ${_nfpEsc(nomeBanco)} registra o boleto sozinho.`;
  return `
    <section class="card nfp-card">
      <h3 class="nfp-h">Cobrança</h3>
      <label class="nfp-campo"><span>Condição</span><select class="select" data-nfp-qtd>${opcoes}</select><small>${doOrc}</small></label>
      <label class="nfp-campo"><span>Banco do boleto</span><select class="select" data-nfp-banco>${bancos}</select></label>
      <label class="nfp-chk"><input type="checkbox" data-nfp-boleto-chk${pg.boleto ? " checked" : ""}> gerar o boleto junto com a nota</label>
      <ul class="nfp-parc">
        ${pg.lista.map(x => `
          <li><span>${pg.parcelas === 1 ? "Vencimento" : x.numero + "ª"}</span>
            <input class="input" type="date" data-nfp-venc="${x.numero - 1}" value="${_nfpEsc(x.vencimento || "")}" aria-label="Vencimento${pg.parcelas === 1 ? "" : " da parcela " + x.numero}">
            <b>${_nfpMoeda(x.valor)}</b></li>`).join("")}
      </ul>
      <p class="nfp-nota">${dica}</p>
    </section>`;
}

function _nfpEnvioHtml(editavel) {
  const p = _nfpDados;
  const n = p.nota || {};
  if (!editavel) {
    return `
      <section class="card nfp-card">
        <h3 class="nfp-h">Envio</h3>
        <p class="nfp-nota">${n.nota_emails ? "O Omie mandou para " + _nfpEsc(n.nota_emails) + "." : "Nenhum e-mail na emissão: o Omie não mandou a nota ao cliente."}</p>
      </section>`;
  }
  const em = p.emails || { lista: [] };
  const valor = p.rascunho?.emails ?? (em.lista || []).join(", ");
  const fonte = em.fonte === "os" ? `Os mesmos da O.S.${em.numero ? " " + _nfpEsc(em.numero) : ""}${em.data ? " de " + _nfpDataBr(em.data) : ""} no Omie`
    : em.fonte === "pedido" ? `Os mesmos do pedido${em.numero ? " " + _nfpEsc(em.numero) : ""}${em.data ? " de " + _nfpDataBr(em.data) : ""} no Omie`
    : em.fonte === "cadastro" ? "Do cadastro do cliente no Omie"
    : em.fonte === "predio" ? "Do cadastro do prédio aqui (o cliente ainda não tem nota no Omie)" : "";
  const alterado = p.rascunho?.emails != null && p.rascunho.emails !== (em.lista || []).join(", ");
  return `
    <section class="card nfp-card">
      <h3 class="nfp-h"><label for="nfpEmails">Envio</label></h3>
      <label class="nfp-campo"><span>O Omie manda a nota${p.pagamento?.boleto ? " e o boleto" : ""} para</span>
        <textarea id="nfpEmails" class="input" rows="3" data-nfp-emails placeholder="sindico@exemplo.com, financeiro@exemplo.com">${_nfpEsc(valor)}</textarea>
        <small>${alterado ? "Alterados aqui." : fonte ? fonte + "." : "Nenhum e-mail achado no Omie nem no cadastro."}</small>
        <small class="nfp-erro" data-nfp-sem-email${String(valor).trim() ? " hidden" : ""}>Sem e-mail, o Omie não manda nada ao cliente.</small>
        ${em.erro ? `<small class="nfp-erro">Não consegui ler o Omie agora: ${_nfpEsc(em.erro)}</small>` : ""}
      </label>
    </section>`;
}

// ── Espelho da nota (gerado aqui, sem valor fiscal) ────────────────────────
function _nfpEspelho() {
  const p = _nfpDados;
  const nfe = p.tipo === "nfe";
  const d = p.destinatario || {};
  const n = p.nota || {};
  const info = document.querySelector("[data-nfp-info]")?.value ?? p.rascunho?.info_adicional ?? p.info_adicional_padrao ?? "";
  const imp = p.impostos?.totais || {};
  const parcelas = (p.pagamento?.lista || []).map(x => `<div class="df-c"><span>${String(x.numero).padStart(3, "0")} · ${_nfpDataBr(x.vencimento)}</span><b>${_nfpMoeda(x.valor)}</b></div>`).join("");
  const itens = (p.itens || []).map(i => `<tr>${nfe ? `<td>${_nfpEsc(i.codigo || "")}</td>` : ""}<td>${_nfpEsc(i.descricao)}${i.ficha_tecnica ? `<div class="nfp-ficha">${_nfpEsc(i.ficha_tecnica)}</div>` : ""}</td>${nfe ? `<td>${_nfpEsc(String(i.ncm || "").replace(/\D/g, ""))}</td><td>${_nfpEsc(String(i.cfop || "").replace(/\D/g, ""))}</td>` : ""}<td>${_nfpEsc(i.quantidade)}</td><td>${_nfpMoeda(i.valor_unitario)}</td><td>${_nfpMoeda(i.total)}</td></tr>`).join("");
  const ov = document.createElement("div");
  ov.className = "modalOverlay nfp-esp-veu";
  ov.style.display = "flex";
  ov.innerHTML = `
    <div class="modalBox nfp-esp-box" role="dialog" aria-modal="true" aria-labelledby="nfpEspT">
      <div class="modalHead">
        <div><div class="modalTitle" id="nfpEspT">Espelho da nota</div><div class="modalSub">Gerado pelo sistema com os dados da tela · sem valor fiscal${n.nota_url ? " · o documento oficial é o PDF do Omie" : ""}</div></div>
        <button class="btn btn-sm" type="button" data-esp-fechar>Fechar</button>
      </div>
      <div class="modalBody">
        <div class="df">
          <div class="df-l df-cab">
            <div class="df-c df-2"><b class="df-emit">GENERAL BOMBAS</b><span>Emitente</span></div>
            <div class="df-c df-tit"><b>${nfe ? "DANFE" : "NFS-e"}</b><span>${nfe ? "Documento auxiliar da NF-e · 1 - saída" : "Nota fiscal de serviço eletrônica"}</span><span>${n.nota_numero ? "Nº " + _nfpEsc(n.nota_numero) : "Número na emissão"}</span></div>
            <div class="df-c df-2"><span>SITUAÇÃO</span><b>${n.nota_status === "emitida" ? "AUTORIZADA" : "ESPELHO · SEM VALOR FISCAL"}</b></div>
          </div>
          <div class="df-l"><div class="df-c df-2"><span>${nfe ? "NATUREZA DA OPERAÇÃO" : "SERVIÇO"}</span><b>${nfe ? "VENDA DE MERCADORIA" : "14.01 · CONSERTO E MANUTENÇÃO DE MÁQUINAS E EQUIPAMENTOS"}</b></div><div class="df-c"><span>EMISSÃO</span><b>${n.nota_emitida_em ? _nfpDataBr(String(n.nota_emitida_em).slice(0, 10)) : new Date().toLocaleDateString("pt-BR")}</b></div></div>
          <div class="df-tt">${nfe ? "DESTINATÁRIO" : "TOMADOR"}</div>
          <div class="df-l"><div class="df-c df-2"><span>NOME / RAZÃO SOCIAL</span><b>${_nfpEsc((d.nome || "").toUpperCase())}</b></div><div class="df-c"><span>CPF/CNPJ</span><b>${_nfpEsc(d.documento || "")}</b></div></div>
          <div class="df-l"><div class="df-c df-2"><span>ENDEREÇO</span><b>${_nfpEsc([d.endereco, d.bairro].filter(Boolean).join(" · "))}</b></div><div class="df-c"><span>MUNICÍPIO / UF</span><b>${_nfpEsc([d.cidade, d.uf].filter(Boolean).join(" / "))}</b></div></div>
          ${parcelas ? `<div class="df-tt">FATURA</div><div class="df-l">${parcelas}</div>` : ""}
          ${nfe ? `<div class="df-tt">CÁLCULO DO IMPOSTO</div><div class="df-l"><div class="df-c"><span>VALOR ICMS</span><b>${_nfpMoeda(imp.icms || 0)}</b></div><div class="df-c"><span>VALOR IPI</span><b>${_nfpMoeda(imp.ipi || 0)}</b></div><div class="df-c"><span>TOTAL PRODUTOS</span><b>${_nfpMoeda(p.total)}</b></div><div class="df-c"><span>TOTAL DA NOTA</span><b>${_nfpMoeda(p.nota?.nota_valor || p.total)}</b></div></div>`
            : `<div class="df-tt">VALORES</div><div class="df-l"><div class="df-c"><span>VALOR DOS SERVIÇOS</span><b>${_nfpMoeda(p.total)}</b></div><div class="df-c"><span>ISS RETIDO</span><b>NÃO</b></div><div class="df-c"><span>VALOR LÍQUIDO</span><b>${_nfpMoeda(p.total)}</b></div></div>`}
          <div class="df-tt">${nfe ? "DADOS DOS PRODUTOS" : "DISCRIMINAÇÃO DOS SERVIÇOS"}</div>
          <table class="df-tab"><thead><tr>${nfe ? "<th>CÓDIGO</th>" : ""}<th>DESCRIÇÃO</th>${nfe ? "<th>NCM</th><th>CFOP</th>" : ""}<th>QTD</th><th>V. UNIT</th><th>V. TOTAL</th></tr></thead><tbody>${itens}</tbody></table>
          <div class="df-tt">DADOS ADICIONAIS</div>
          <div class="df-l"><div class="df-c df-adic"><span>INFORMAÇÕES COMPLEMENTARES</span><b>${_nfpEsc(info)}</b></div></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const fechar = () => { document.removeEventListener("keydown", onKey, true); ov.remove(); };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); fechar(); } };
  document.addEventListener("keydown", onKey, true);
  ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-esp-fechar]")) fechar(); });
}

// ── Ações ──────────────────────────────────────────────────────────────────
// O rascunho salva sozinho, um instante depois da última mudança.
function _nfpSalvarDepois(campos, { recarregar = false } = {}) {
  _nfpSalvarDepois._pend = { ...(_nfpSalvarDepois._pend || {}), ...campos };
  _nfpSalvarDepois._recarregar = _nfpSalvarDepois._recarregar || recarregar;
  clearTimeout(_nfpSalvando);
  _nfpSalvando = setTimeout(_nfpSalvarAgora, recarregar ? 150 : 700);
}

async function _nfpSalvarAgora() {
  const campos = _nfpSalvarDepois._pend;
  const recarregar = _nfpSalvarDepois._recarregar;
  _nfpSalvarDepois._pend = null; _nfpSalvarDepois._recarregar = false;
  if (!campos) return;
  const id = _nfpId;
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${id}/nota/rascunho`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(campos),
    });
    const j = await lerRespostaJson(r, "Salvar rascunho");
    if (!r.ok) throw new Error(j.error || "Não consegui salvar o rascunho");
    if (id !== _nfpId) return;
    _nfpSalvoEm = j.salvo_em;
    if (_nfpDados) {
      _nfpDados.rascunho = { ...(_nfpDados.rascunho || {}), ...("emails" in campos ? { emails: campos.emails } : {}),
        ...("info_adicional" in campos ? { info_adicional: campos.info_adicional } : {}), salvo_em: j.salvo_em, salvo_por_nome: j.salvo_por_nome };
    }
    if (recarregar) await _nfpCarregar();
    else {
      const sub = document.querySelector(".nfp-sub");
      if (sub && _nfpDados && _nfpEstado().editavel) {
        sub.textContent = `Do ${_nfpDados.orcamento?.numero || ""} · ${_nfpDados.cliente?.nome || "—"} · rascunho salvo ${_nfpHora(j.salvo_em)}${j.salvo_por_nome ? " por " + j.salvo_por_nome : ""}`;
      }
    }
  } catch (e) {
    _nfpAviso = { txt: e.message, erro: true };
    _nfpRender();
  }
}

// DANFE sem impostos para a versão atual: confere sozinho ao abrir (uma
// consulta; o servidor guarda e não repete para os mesmos itens).
function _nfpConferirSozinho() {
  const p = _nfpDados;
  if (!p || p.tipo !== "nfe" || p.impostos || _nfpImpErro || _nfpOcupado) return;
  if (!_nfpEstado().editavel) return;
  if (_nfpPendencias().some(x => x.tipo !== "marca")) return;
  if (!(p.itens || []).length || (p.itens || []).some(i => !i.codigo_produto)) return;
  _nfpConferir();
}

async function _nfpConferir() {
  const id = _nfpId;
  _nfpOcupado = "conferindo"; _nfpImpErro = null; _nfpRender();
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${id}/nota/impostos`, { method: "POST", headers: authHeaders() });
    const j = await lerRespostaJson(r, "Impostos");
    if (!r.ok) throw new Error(j.error || "Não consegui conferir os impostos");
    if (id !== _nfpId) return;
    _nfpDados.impostos = j; _nfpDados.impostos_vencidos = false;
  } catch (e) { _nfpImpErro = e.message; }
  finally { _nfpOcupado = false; _nfpRender(); }
}

async function _nfpGravarLinhas(mudancas) {
  _nfpOcupado = "gravando"; _nfpAviso = { txt: "Gravando no orçamento…" }; _nfpRender();
  try {
    for (const [id, corpo] of mudancas) {
      const r = await fetch(`/admin/orcamentos/avulsos/linhas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(corpo),
      });
      const j = await lerRespostaJson(r, "Atualizar item");
      if (!r.ok) throw new Error(j.error || "Não foi possível atualizar o item.");
    }
    _nfpAviso = null;
  } catch (e) { _nfpAviso = { txt: e.message, erro: true }; }
  _nfpOcupado = false;
  await _nfpCarregar();
}

// Vai ao orçamento, destaca a linha e (buscar) abre a busca do Omie dela.
function _nfpIrParaLinha(linhaId, buscar) {
  const orcId = _nfpId;
  location.hash = `#/orcamentos/${orcId}`;
  let tentativas = 0;
  const achar = () => {
    const tr = document.querySelector(`#avItensWrap tr[data-av-linha-id="${linhaId}"]`);
    if (!tr) { if (++tentativas < 40) setTimeout(achar, 100); return; }
    tr.scrollIntoView({ block: "center", behavior: "smooth" });
    tr.classList.add("nf-alvo");
    setTimeout(() => tr.classList.remove("nf-alvo"), 2600);
    const bt = buscar ? tr.querySelector("[data-pc-trocar]") : null;
    if (bt) bt.click();
    else tr.querySelector('input[data-av-linha-field="descricao"]')?.focus({ preventScroll: true });
  };
  setTimeout(achar, 150);
}

async function _nfpEmitir() {
  const p = _nfpDados;
  const nfe = p.tipo === "nfe";
  const emails = document.querySelector("[data-nfp-emails]")?.value ?? p.rascunho?.emails ?? (p.emails?.lista || []).join(", ");
  const info = document.querySelector("[data-nfp-info]")?.value ?? null;
  const quem = p.cliente?.nome || "o cliente";
  let msg = `Emitir ${nfe ? "a DANFE" : "a NFS-e"} de ${_nfpMoeda(p.total)} para ${quem}?\n\nGera uma nota real ${nfe ? "na SEFAZ" : "na prefeitura"}. Depois de emitida, cancelar é no Omie.`;
  if (!String(emails).trim()) msg += "\n\nSem e-mail: o Omie não vai mandar a nota ao cliente.";
  if (!confirm(msg)) return;
  clearTimeout(_nfpSalvando);
  _nfpOcupado = "emitindo"; _nfpAviso = { txt: "Emitindo no Omie… pode levar alguns segundos." }; _nfpRender();
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${_nfpId}/nota/emitir`, {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ pagamento: _nfpPag, emails, info_adicional: info }),
    });
    const j = await lerRespostaJson(r, "Emitir nota");
    if (!r.ok) {
      console.error(`[nota] FALHA orcamento=${_nfpId} call=${j.call || "-"}\n${j.error || "sem detalhe"}`);
      _nfpAviso = { txt: j.error || "Erro ao emitir", erro: true };
    } else {
      _nfpAviso = { txt: j.nota_status === "emitida" ? `${nfe ? "DANFE" : "NFS-e"} nº ${j.nota_numero} autorizada.` : `Enviada ao Omie. ${nfe ? "A SEFAZ" : "A prefeitura"} está processando: use Atualizar em instantes.` };
    }
  } catch (e) { _nfpAviso = { txt: "Erro: " + e.message, erro: true }; }
  _nfpOcupado = false;
  await _nfpCarregar();
  _nfpSincronizarOrcamento();
}

// A lista de orçamentos (e o trilho dele) leem nota_* de _avData.
function _nfpSincronizarOrcamento() {
  const n = _nfpDados?.nota;
  if (!n || typeof _avData === "undefined" || !Array.isArray(_avData)) return;
  const o = _avData.find(x => x.id === _nfpId);
  if (o) Object.assign(o, n);
}

async function _nfpAtualizar() {
  _nfpOcupado = "atualizando"; _nfpAviso = { txt: "Consultando o Omie…" }; _nfpRender();
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${_nfpId}/nota/atualizar`, { method: "POST", headers: authHeaders() });
    const j = await lerRespostaJson(r, "Atualizar nota");
    if (!r.ok) throw new Error(j.error || "Erro ao consultar o Omie");
    _nfpAviso = null;
  } catch (e) { _nfpAviso = { txt: e.message, erro: true }; }
  _nfpOcupado = false;
  await _nfpCarregar();
  _nfpSincronizarOrcamento();
}

async function _nfpGerarBoletos() {
  _nfpOcupado = "boletos"; _nfpAviso = { txt: "Pedindo o boleto ao Omie…" }; _nfpRender();
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${_nfpId}/nota/boletos`, { method: "POST", headers: authHeaders() });
    const j = await lerRespostaJson(r, "Gerar boletos");
    if (!r.ok) throw new Error(j.error || "Erro ao gerar o boleto");
    _nfpAviso = null;
  } catch (e) { _nfpAviso = { txt: e.message, erro: true }; }
  _nfpOcupado = false;
  await _nfpCarregar();
}

async function _nfpAbrirBoleto(titulo, el) {
  const w = window.open("", "_blank");
  if (el) el.disabled = true;
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${_nfpId}/nota/boletos/${encodeURIComponent(titulo)}/link`, { headers: authHeaders() });
    const j = await lerRespostaJson(r, "Boleto");
    if (!r.ok) throw new Error(j.error || "Não consegui o link do boleto");
    if (w) w.location.href = j.link; else window.open(j.link, "_blank", "noopener");
  } catch (e) { if (w) w.close(); alert(e.message); }
  finally { if (el) el.disabled = false; }
}

async function _nfpDescartar() {
  if (!confirm("Descartar o rascunho desta nota? Cobrança, e-mails e informações adicionais voltam ao padrão do orçamento.")) return;
  try {
    const r = await fetch(`/admin/orcamentos/avulsos/${_nfpId}/nota/rascunho`, { method: "DELETE", headers: authHeaders() });
    const j = await lerRespostaJson(r, "Descartar rascunho");
    if (!r.ok) throw new Error(j.error || "Não consegui descartar");
    _nfpDados = j; _nfpSincPag(); _nfpSalvoEm = null; _nfpImpErro = null; _nfpAviso = { txt: "Rascunho descartado." };
    _nfpRender();
  } catch (e) { _nfpAviso = { txt: e.message, erro: true }; _nfpRender(); }
}

async function _nfpCatalogo(bt) {
  bt.disabled = true; bt.textContent = "Atualizando… (cerca de 1 min)";
  try {
    const r = await fetch(`/admin/omie/produtos/sincronizar`, { method: "POST", headers: authHeaders() });
    const j = await lerRespostaJson(r, "Atualizar catálogo");
    if (!r.ok) throw new Error(j.error || "Erro ao atualizar o catálogo");
    await _nfpCarregar();
  } catch (e) { _nfpAviso = { txt: e.message, erro: true }; _nfpRender(); }
}

// ── Eventos (um ouvinte na raiz, que nunca é recriada) ─────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const raiz = document.getElementById("nfPagina");
  if (!raiz) return;

  raiz.addEventListener("click", e => {
    if (_nfpOcupado) return;
    let el;
    if ((el = e.target.closest("[data-nfp]"))) {
      const a = el.dataset.nfp;
      if (a === "emitir") _nfpEmitir();
      else if (a === "espelho") _nfpEspelho();
      else if (a === "descartar") _nfpDescartar();
      else if (a === "atualizar") _nfpAtualizar();
      else if (a === "boletos") _nfpGerarBoletos();
      else if (a === "impostos") _nfpConferir();
      else if (a === "catalogo") _nfpCatalogo(el);
      else if (a === "confirmar") {
        const sem = _nfpDados.linhas.filter(l => l.cobravel && !l.natureza && l.natureza_sugerida);
        _nfpGravarLinhas(sem.map(l => [l.id, { natureza: l.natureza_sugerida }]));
      }
      return;
    }
    if ((el = e.target.closest("[data-nfp-usar]"))) {
      _nfpGravarLinhas([[el.dataset.nfpUsar, { natureza: "peca", omie_produto_codigo: Number(el.dataset.cod) }]]);
      return;
    }
    if ((el = e.target.closest("[data-nfp-linha]"))) { _nfpIrParaLinha(el.dataset.nfpLinha, el.hasAttribute("data-buscar")); return; }
    if ((el = e.target.closest("[data-nfp-boleto]"))) { _nfpAbrirBoleto(el.dataset.nfpBoleto, el); return; }
  });

  raiz.addEventListener("change", e => {
    if (!_nfpPag) return;
    let el;
    if ((el = e.target.closest("[data-nfp-qtd]"))) {
      // Outra quantidade: o servidor refaz o calendário padrão.
      _nfpPag = { ..._nfpPag, parcelas: Number(el.value), vencimentos: null };
    } else if ((el = e.target.closest("[data-nfp-banco]"))) {
      _nfpPag = { ..._nfpPag, banco: el.value };
    } else if ((el = e.target.closest("[data-nfp-boleto-chk]"))) {
      _nfpPag = { ..._nfpPag, boleto: el.checked };
    } else if ((el = e.target.closest("[data-nfp-venc]"))) {
      const v = [...(_nfpPag.vencimentos || [])];
      v[Number(el.dataset.nfpVenc)] = el.value;
      _nfpPag = { ..._nfpPag, vencimentos: v };
    } else return;
    _nfpSalvarDepois({ pagamento: _nfpPag }, { recarregar: true });
  });

  raiz.addEventListener("input", e => {
    let el;
    if ((el = e.target.closest("[data-nfp-emails]"))) {
      const av = raiz.querySelector("[data-nfp-sem-email]");
      if (av) av.hidden = Boolean(el.value.trim());
      _nfpSalvarDepois({ emails: el.value });
    } else if ((el = e.target.closest("[data-nfp-info]"))) {
      _nfpSalvarDepois({ info_adicional: el.value });
    }
  });
});
