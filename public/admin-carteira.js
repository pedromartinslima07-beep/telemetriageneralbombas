// ============================================================
// INÍCIO (o que pede ação) + NOTAS FISCAIS  (redesenho, fase 3 — 18/11/2026)
// ============================================================
//
// As duas telas olham a CARTEIRA INTEIRA; a ficha do condomínio
// (admin-condominio.js) olha um prédio. As regras de "pede ação" são as
// mesmas da ficha, e os helpers de lá são reaproveitados (_cfSelo, _cfEsc,
// _cfData, _cfMoeda, _cfAbrirOrcamento, _cfAbrirChamado).
//
// ⚠️ Nenhuma regra nova de negócio nasce aqui. "Chamado urgente" é
// _chamadosAlertaAbertos (a mesma pergunta da tela Alertas), "resposta sem
// baixa" é _avPendente, "O.S. a enviar" é _osFaltaEnviar. Se uma dessas
// regras mudar no admin.js, esta tela muda junto.
//
// Perfil operador não vê nenhuma das duas (admin-nav.js esconde): elas leem
// orçamentos, O.S. e contratos, que respondem 403 para ele.

let _icContratosVencendo = null;   // null = ainda não buscou
let _icPecasSemCobranca = null;    // O.S. com peça usada fora de orçamento (fase C das peças)
let _icBuscando = false;
let _icBuscadoEm = 0;

function _icNomeCondo(id, fallback) {
  const c = (Array.isArray(_condominios) ? _condominios : []).find(x => Number(x.id) === Number(id));
  return c ? (c.nome_fantasia || c.nome) : (fallback || "Sem condomínio");
}

async function _icGarantirDados({ forcar = false } = {}) {
  if (_icBuscando) return;
  const velho = Date.now() - _icBuscadoEm > 60000;
  if (!forcar && !velho && _icContratosVencendo && _osLoaded && Array.isArray(_avData) && _avData.length && _icAgendaHoje !== null && _icPecasSemCobranca !== null) return;
  _icBuscando = true;
  const falhou = (fonte) => () => { _icErros.add(fonte); };
  const ok = (fonte) => { _icErros.delete(fonte); };
  try {
    const tarefas = [];
    if (!_osLoaded || forcar) tarefas.push(Promise.resolve(carregarOrdensServico()).then(() => ok("os"), falhou("os")));
    if (!Array.isArray(_avData) || !_avData.length || forcar) tarefas.push(Promise.resolve(carregarAvulsos()).then(() => ok("orcamentos"), falhou("orcamentos")));
    tarefas.push((async () => {
      const r = await fetch("/contratos?vencendo_em_dias=30", { headers: authHeaders() });
      if (!r.ok) throw new Error("contratos " + r.status);
      _icContratosVencendo = await r.json();
      ok("contratos");
    })().catch(() => { _icContratosVencendo = _icContratosVencendo || []; _icErros.add("contratos"); }));
    tarefas.push((async () => {
      const r = await fetch("/admin/orcamentos/pecas-sem-cobranca", { headers: authHeaders() });
      if (!r.ok) throw new Error("pecas " + r.status);
      _icPecasSemCobranca = await r.json();
      ok("pecas");
    })().catch(() => { _icPecasSemCobranca = _icPecasSemCobranca || []; _icErros.add("pecas"); }));
    if (typeof _navSecaoVisivel !== "function" || _navSecaoVisivel("agenda")) {
      tarefas.push((async () => {
        const d = _icHojeISO();
        const r = await fetch(`/agenda?de=${d}&ate=${d}`, { headers: authHeaders() });
        if (!r.ok) throw new Error("agenda " + r.status);
        const j = await r.json();
        _icAgendaHoje = (j.itens || []).sort((a, b) => new Date(a.inicio || 0) - new Date(b.inicio || 0));
        ok("agenda");
      })().catch(() => { _icAgendaHoje = _icAgendaHoje || []; _icErros.add("agenda"); }));
    }
    await Promise.all(tarefas);
    _icBuscadoEm = Date.now();
  } finally {
    _icBuscando = false;
  }
  _icRenderSeAtiva();
}

function _icRenderSeAtiva() {
  const ativa = document.querySelector(".section.is-active")?.dataset.section;
  if (ativa === "inicio") renderInicio();
  if (ativa === "notas") renderNotas();
}

// Valor só quando há valor: orçamento sem item mostraria "· —".
function _icValor(o) { return Number(o?.valor_total) ? " · " + _cfMoeda(o.valor_total) : ""; }

// ===== HOJE (redesenho estrutural, 19/11/2026) =====
//
// Uma página, sem subaba: a frase da carteira, UMA fila do que pede ação
// (o mais urgente primeiro, a ação com nome na própria linha), quem está em
// campo agora, a agenda de hoje e o que acabou de acontecer.
//
// ⚠️ As ações da fila LEVAM ao lugar onde a coisa é feita (a página do
// orçamento, da O.S., do chamado); não gravam nada daqui. "Emitir nota" abre o
// orçamento, onde a nota é emitida. Assim nenhuma regra de gravação nasce
// nesta tela, e a confirmação de cada ação continua onde sempre esteve.

let _icFiltro = "tudo";
let _icMostrarTudo = false;
let _icAgendaHoje = null;      // null = ainda não buscou; [] = vazia
let _icErros = new Set();      // "contratos", "agenda", "os", "orcamentos", "pecas"

const _IC_TIPOS = [
  ["tudo", "Tudo"], ["agua", "Água"], ["chamados", "Chamados"],
  ["faturamento", "Orçamentos e notas"], ["os", "O.S."], ["contratos", "Contratos"],
];
const _IC_QUANDO = { agora: "Agora", hoje: "Hoje", depois: "Nos próximos dias" };

// Tempo curto e no plural certo ("1 dia", não "1 dias"); passou de 30
// dias, a data.
function _icRel(iso) {
  if (!iso) return "";
  const seg = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seg < 60) return "agora";
  if (seg < 3600) return `${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `${Math.floor(seg / 3600)} h`;
  const d = Math.floor(seg / 86400);
  if (d <= 30) return `${d} dia${d === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d > 300 ? "2-digit" : undefined });
}

function _icHa(iso) { const r = _icRel(iso); return r === "agora" || /\//.test(r) ? (r === "agora" ? "agora" : "em " + r) : "há " + r; }

function _icIco(n) { return `<i data-lucide="${n}" aria-hidden="true"></i>`; }
function _icHojeISO() {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // São Paulo (-03:00 fixo desde 2019)
  return d.toISOString().slice(0, 10);
}

// A fila: as mesmas regras do resto do admin, numa lista só.
function _icFila() {
  const itens = [];
  const temChamadoAberto = new Set((_chamadosData || []).filter(ch => _chEmAberto(ch.status)).map(ch => Number(ch.condominio_id)));

  for (const g of (_statusData || [])) {
    const cid = g.condominio?.id;
    const cn = g.condominio?.nome_fantasia || g.condominio?.nome || "Condomínio";
    for (const r of (g.reservatorios || [])) {
      const pct = r.ultima_leitura?.nivel_pct;
      const quando = r.ultima_leitura?.criado_em;
      if (r.offline) {
        itens.push({ tipo: "agua", q: "agora", cor: "ri", ic: "wifi-off", ord: 0, condo: cid, condoNome: cn,
          t: `${r.nome || "Reservatório"} sem sinal`,
          m: `${quando ? "Última leitura " + _icHa(quando) : "Nunca enviou leitura"}${temChamadoAberto.has(Number(cid)) ? " · há chamado aberto no prédio" : " · nenhum chamado aberto"}`,
          quando, acao: "Ver água", attr: `data-ic-condo="${cid}" data-ic-aba="telemetria"` });
      } else if (pct != null && pct < 20) {
        itens.push({ tipo: "agua", q: "agora", cor: "ri", ic: "droplet", ord: 0, condo: cid, condoNome: cn,
          t: `${r.nome || "Reservatório"} em ${Math.round(pct)}%`,
          m: `Abaixo do crítico (20%)${temChamadoAberto.has(Number(cid)) ? " · há chamado aberto no prédio" : " · nenhum chamado aberto"}`,
          quando, acao: "Ver água", attr: `data-ic-condo="${cid}" data-ic-aba="telemetria"` });
      }
    }
  }

  const urgentes = (typeof _chamadosAlertaAbertos === "function" ? _chamadosAlertaAbertos() : []).filter(ch => _chEmAberto(ch.status));
  for (const ch of urgentes) {
    const fora = _chamadoSlaEstourado(ch);
    const p1 = String(ch.prioridade).toLowerCase() === "p1";
    itens.push({ tipo: "chamados", q: "agora", cor: fora || p1 ? "ri" : "at", ic: fora ? "clock" : "inbox", ord: p1 ? 1 : 2,
      condo: ch.condominio_id, condoNome: _icNomeCondo(ch.condominio_id, ch.condominio_nome),
      t: `${ch.titulo || "Chamado #" + ch.id}`,
      m: `${_CF_PRIO[ch.prioridade] || "Chamado"} · #${ch.id}${fora ? " · fora do prazo" : ""} · ${ch.tecnico_nome ? ch.tecnico_nome : "sem técnico"}`,
      quando: ch.criado_em, acao: ch.tecnico_nome ? "Abrir chamado" : "Atribuir técnico", attr: `data-ic-chamado="${ch.id}"` });
  }

  // O turno pediu o escritório (migration 098): fica aqui até alguém dar
  // como resolvido na página do chamado.
  for (const ch of (_chamadosData || []).filter(ch => ch.pede_escritorio_em && _chEmAberto(ch.status))) {
    itens.push({ tipo: "chamados", q: "agora", cor: "at", ic: "hand-helping", ord: 1,
      condo: ch.condominio_id, condoNome: _icNomeCondo(ch.condominio_id, ch.condominio_nome),
      t: `O turno pediu: ${ch.pede_escritorio_motivo || "veja o chamado"}`,
      m: `#${ch.id} · ${ch.titulo || "Chamado"}${ch.pede_escritorio_por_nome ? " · por " + ch.pede_escritorio_por_nome : ""}`,
      quando: ch.pede_escritorio_em, acao: "Abrir chamado", attr: `data-ic-chamado="${ch.id}"` });
  }

  const av = Array.isArray(_avData) ? _avData : [];
  for (const o of av.filter(o => o.nota_status === "erro")) {
    itens.push({ tipo: "faturamento", q: "agora", cor: "ri", ic: "file-warning", ord: 3,
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      t: `Nota de ${o.numero || "orçamento"} voltou com erro`,
      m: `${o.nota_tipo === "nfe" ? "DANFE" : "NFS-e"}${o.nota_erro ? " · " + o.nota_erro : ""}`,
      quando: o.nota_solicitada_em, acao: "Corrigir", attr: `data-ic-orc="${o.id}"` });
  }
  for (const o of av.filter(_avPendente)) {
    const recusou = o.status === "rejeitado";
    itens.push({ tipo: "faturamento", q: "hoje", cor: recusou ? "cz" : "at", ic: recusou ? "circle-x" : "circle-check", ord: 4,
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      t: `Cliente ${recusou ? "recusou" : "aprovou"} ${o.numero || "o orçamento"}`,
      m: `${_icValor(o).replace(/^ · /, "") || "sem valor"} · falta dar baixa`,
      quando: o.respondido_em, acao: "Dar baixa", attr: `data-ic-orc="${o.id}"` });
  }
  for (const o of av.filter(o => o.status === "aprovado" && !o.nota_status)) {
    itens.push({ tipo: "faturamento", q: "hoje", cor: "cz", ic: "receipt", ord: 5,
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      t: `${o.numero || "Orçamento"} aprovado, sem nota fiscal`,
      m: `${_icValor(o).replace(/^ · /, "") || "sem valor"}${o.respondido_em ? " · aprovado " + _icHa(o.respondido_em) : ""}`,
      quando: o.respondido_em || o.criado_em, acao: "Emitir nota", attr: `data-ic-orc="${o.id}"` });
  }

  // Peça usada na visita que não entrou em orçamento (fase C das peças): a
  // ação abre a O.S., onde fica o "Cobrar as N peças usadas".
  for (const x of (_icPecasSemCobranca || [])) {
    const n = Number(x.pecas) || 0;
    const nomes = (x.descricoes || []).filter(Boolean);
    itens.push({ tipo: "faturamento", q: "hoje", cor: "at", ic: "package", ord: 5,
      condo: x.condominio_id, condoNome: x.condominio_nome || _icNomeCondo(x.condominio_id),
      t: `${x.numero || "O.S. #" + x.os_id}: ${n} peça${n === 1 ? "" : "s"} usada${n === 1 ? "" : "s"} sem cobrança`,
      m: `${nomes.join(", ")}${n > nomes.length ? ` e mais ${n - nomes.length}` : ""}${x.tecnico_nome ? " · " + x.tecnico_nome : ""}`,
      quando: x.finalizada_em || x.chegada_em, acao: "Cobrar", attr: `data-ic-os="${x.os_id}"` });
  }

  const os = Array.isArray(_osData) ? _osData : [];
  for (const o of os.filter(_osFaltaEnviar)) {
    itens.push({ tipo: "os", q: "hoje", cor: "cz", ic: "send", ord: 6,
      condo: o.condominio_id, condoNome: o.condominio_nome || _icNomeCondo(o.condominio_id),
      t: `${o.numero || "O.S. #" + o.id} finalizada, não enviada`,
      m: `${o.tecnico_nome ? "Por " + o.tecnico_nome : "Finalizada"}${o.finalizada_em ? " · " + _icHa(o.finalizada_em) : ""}`,
      quando: o.finalizada_em, acao: "Enviar ao cliente", attr: `data-ic-os="${o.id}"` });
  }

  for (const ct of (_icContratosVencendo || [])) {
    const venceu = ct.dias_para_vencer < 0;
    itens.push({ tipo: "contratos", q: venceu ? "hoje" : "depois", cor: venceu ? "ri" : "cz", ic: "file-signature", ord: 7,
      condo: ct.condominio_id, condoNome: _icNomeCondo(ct.condominio_id, ct.condominio_nome),
      t: venceu ? `Contrato vencido há ${-ct.dias_para_vencer} dia${ct.dias_para_vencer === -1 ? "" : "s"}` : `Contrato vence em ${ct.dias_para_vencer} dia${ct.dias_para_vencer === 1 ? "" : "s"}`,
      m: `${ct.numero || "Contrato"}${ct.valor_mensal ? " · " + _cfMoeda(ct.valor_mensal) + " por mês" : ""} · ${_cfData(ct.fim_em)}`,
      quando: ct.fim_em, dias: ct.dias_para_vencer, acao: venceu ? "Ver contrato" : "Renovar",
      attr: `data-ic-contrato="${ct.id}" data-ic-contrato-condo="${ct.condominio_id}"` });
  }

  const pesoQ = { agora: 0, hoje: 1, depois: 2 };
  itens.sort((a, b) => pesoQ[a.q] - pesoQ[b.q] || a.ord - b.ord
    || (a.tipo === "contratos" ? a.dias - b.dias : new Date(a.quando || 0) - new Date(b.quando || 0)));
  return itens;
}

function _icDadosProntos() {
  // O status (telemetria) e os chamados chegam no boot; O.S., orçamentos e
  // contratos são buscados ao abrir a tela.
  return Array.isArray(_statusData) && _statusData.length > 0 && _icContratosVencendo !== null && _osLoaded;
}

function renderInicio() {
  const root = document.getElementById("icRoot");
  if (!root) return;
  // Preserva a rolagem da coluna: o polling redesenha a cada 7 s.
  const pronto = _icDadosProntos();
  const fila = pronto ? _icFila() : [];
  const cont = k => (k === "tudo" ? fila.length : fila.filter(i => i.tipo === k).length);
  if (_icFiltro !== "tudo" && !cont(_icFiltro)) _icFiltro = "tudo";
  const visiveis = fila.filter(i => _icFiltro === "tudo" || i.tipo === _icFiltro);
  const LIM = 14;
  const mostrar = _icMostrarTudo ? visiveis : visiveis.slice(0, LIM);

  const dataTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const hora = new Date().getHours();
  const nome = (document.getElementById("sidebarUserLabel")?.textContent || "").trim().split(/\s+/)[0];
  const saud = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  let filaHtml;
  if (!pronto) {
    filaHtml = `<div class="hj-esq" aria-busy="true" aria-label="Carregando">${Array.from({ length: 5 }, () => `
      <div class="hj-esq-linha"><span class="hj-esq-ic"></span><span class="hj-esq-txt"><i></i><i></i></span><span class="hj-esq-bt"></span></div>`).join("")}</div>`;
  } else if (!fila.length) {
    filaHtml = `<div class="hj-vazio">${_icIco("circle-check")}<b>Nada esperando por você.</b>
      <span>Quando um reservatório cair, um chamado apertar o prazo ou um cliente responder, aparece aqui.</span></div>`;
  } else {
    let q = "", html = "";
    for (const it of mostrar) {
      if (it.q !== q) { q = it.q; html += `<div class="hj-fila-grupo">${_IC_QUANDO[q]}</div>`; }
      html += `
        <div class="hj-item">
          <span class="hj-item-ic is-${it.cor}">${_icIco(it.ic)}</span>
          <span class="hj-item-txt">
            <span class="hj-item-t"><button type="button" class="hj-predio" data-ic-condo="${it.condo}">${_cfEsc(it.condoNome || "—")}</button><span class="hj-item-sep">·</span>${_cfEsc(it.t)}</span>
            <span class="hj-item-m">${_cfEsc(it.m)}</span>
          </span>
          <span class="hj-item-idade">${it.quando && it.tipo !== "contratos" ? _icRel(it.quando) : ""}</span>
          <button type="button" class="hj-bt" ${it.attr}>${_cfEsc(it.acao)}</button>
        </div>`;
    }
    if (visiveis.length > LIM) {
      html += `<button type="button" class="hj-mais" data-ic-mais>${_icMostrarTudo ? "Mostrar menos" : `Mostrar mais ${visiveis.length - LIM}`}</button>`;
    }
    filaHtml = html;
  }

  const erros = [..._icErros];
  const avisoErro = erros.length ? `<div class="hj-erro" role="alert">${_icIco("triangle-alert")}
      <span>Não consegui carregar ${erros.map(e => ({ contratos: "os contratos", agenda: "a agenda", os: "as O.S.", orcamentos: "os orçamentos", pecas: "as peças sem cobrança" }[e])).join(" e ")}. O resto da fila está certo.</span>
      <button type="button" class="hj-bt" data-ic-tentar>Tentar de novo</button></div>` : "";

  root.innerHTML = `
    <div class="hj">
      <header class="hj-cab">
        <div>
          <h2 class="hj-ola">${saud}${nome && nome !== "—" ? ", " + _cfEsc(nome) : ""}</h2>
          <p class="hj-data">${dataTxt}</p>
        </div>
        <div class="hj-cab-acoes">
          <button type="button" class="hj-bt is-pri" data-ic-novo aria-haspopup="menu">${_icIco("plus")}Novo${_icIco("chevron-down")}</button>
          <div class="gb-menu hj-novo-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-ic-novo-tipo="chamado">${_icIco("inbox")}Chamado</button>
            <button type="button" role="menuitem" data-ic-novo-tipo="orcamento">${_icIco("file-text")}Orçamento</button>
            <button type="button" role="menuitem" data-ic-novo-tipo="condominio">${_icIco("building-2")}Condomínio</button>
          </div>
        </div>
      </header>
      ${_icCarteiraHtml()}
      <div class="hj-grade">
        <section class="hj-bloco hj-fila" aria-labelledby="hjFilaT">
          <div class="hj-bloco-cab">
            <h3 id="hjFilaT">Precisa de você</h3>
            ${pronto ? `<span class="hj-n">${fila.length}</span>` : ""}
          </div>
          ${pronto && fila.length ? `<div class="hj-chips" role="group" aria-label="Filtrar a fila">${_IC_TIPOS.filter(([k]) => k === "tudo" || cont(k)).map(([k, n]) =>
            `<button type="button" class="hj-chip${_icFiltro === k ? " is-on" : ""}" data-ic-f="${k}" aria-pressed="${_icFiltro === k}">${n}<span>${cont(k)}</span></button>`).join("")}</div>` : ""}
          ${avisoErro}
          <div class="hj-fila-lista">${filaHtml}</div>
        </section>
        <div class="hj-lado">
          ${_icCampoHtml()}
          ${_icAgendaHtml()}
          ${_icAtividadeHtml()}
        </div>
      </div>
    </div>`;
  window.lucide?.createIcons?.({ root });
}

function _icCarteiraHtml() {
  const rs = [];
  for (const g of (_statusData || [])) for (const r of (g.reservatorios || [])) rs.push(r);
  if (!rs.length) {
    return `<section class="hj-carteira is-carregando" aria-busy="true"><span class="hj-esq-barra"></span></section>`;
  }
  const mudo = rs.filter(r => r.offline).length;
  const crit = rs.filter(r => !r.offline && r.ultima_leitura?.nivel_pct != null && r.ultima_leitura.nivel_pct < 20).length;
  const baixo = rs.filter(r => !r.offline && r.ultima_leitura?.nivel_pct != null && r.ultima_leitura.nivel_pct >= 20 && r.ultima_leitura.nivel_pct < 45).length;
  const ok = rs.length - mudo - crit - baixo;
  const seg = (n, cor) => n ? `<i style="flex:${n};background:${cor}"></i>` : "";
  return `<section class="hj-carteira" aria-label="Situação da água na carteira">
      <div class="hj-carteira-frase">
        <span><b>${ok} de ${rs.length}</b> reservatórios normais</span>
        ${crit ? `<span><i class="hj-pt is-ri"></i><b>${crit}</b> abaixo de 20%</span>` : ""}
        ${baixo ? `<span><i class="hj-pt is-at"></i><b>${baixo}</b> com nível baixo</span>` : ""}
        ${mudo ? `<span><i class="hj-pt is-cz"></i><b>${mudo}</b> sem sinal</span>` : ""}
      </div>
      <div class="hj-barra" role="img" aria-label="${ok} normais, ${baixo} baixos, ${crit} críticos, ${mudo} sem sinal">
        ${seg(ok, "var(--hj-ok)")}${seg(baixo, "var(--hj-at)")}${seg(crit, "var(--hj-ri)")}${seg(mudo, "#a9b2c9")}
      </div>
      <button type="button" class="hj-link" data-ic-secao="monitoramento">Ver monitoramento${_icIco("arrow-right")}</button>
    </section>`;
}

function _icCampoHtml() {
  const tecs = (Array.isArray(_tecnicosData) ? _tecnicosData : []).filter(t => t.cargo === "tecnico" && t.ativo !== false);
  if (!tecs.length) return "";
  const abertos = (_chamadosData || []).filter(ch => _chEmAberto(ch.status) && !(typeof _chEhPreventiva === "function" && _chEhPreventiva(ch)));
  const linhas = tecs.map(t => {
    const meus = abertos.filter(ch => Number(ch.tecnico_id) === Number(t.id));
    const agora = meus.find(ch => ch.tecnico_chegou_em) || meus.find(ch => ch.tecnico_a_caminho_em);
    const loc = (Array.isArray(_tecLocs) ? _tecLocs : []).find(l => Number(l.tecnico_id) === Number(t.id));
    let estado, cor;
    if (agora?.tecnico_chegou_em) { estado = `Em atendimento · ${agora.condominio_nome || "prédio"}`; cor = "info"; }
    else if (agora) { estado = `A caminho · ${agora.condominio_nome || "prédio"}`; cor = "at"; }
    else if (meus.length) { estado = `${meus.length} chamado${meus.length === 1 ? "" : "s"} com ele`; cor = "cz"; }
    else { estado = "Livre"; cor = "ok"; }
    const ini = String(t.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
    return `<div class="hj-tec">
        <span class="hj-av">${_cfEsc(ini)}</span>
        <span class="hj-tec-txt"><b>${_cfEsc(t.nome)}</b><small><i class="hj-pt is-${cor}"></i>${_cfEsc(estado)}</small></span>
        <span class="hj-tec-loc">${loc?.capturada_em ? "visto " + _icHa(loc.capturada_em) : "sem GPS"}</span>
      </div>`;
  }).join("");
  return `<section class="hj-bloco" aria-labelledby="hjCampoT">
      <div class="hj-bloco-cab"><h3 id="hjCampoT">Em campo agora</h3><button type="button" class="hj-link" data-ic-secao="mapa">Mapa${_icIco("arrow-right")}</button></div>
      <div class="hj-tecs">${linhas}</div>
    </section>`;
}

function _icAgendaHtml() {
  if (typeof _navSecaoVisivel === "function" && !_navSecaoVisivel("agenda")) return "";
  let corpo;
  if (_icAgendaHoje === null && !_icErros.has("agenda")) {
    corpo = `<div class="hj-esq is-curto" aria-busy="true"><div class="hj-esq-linha"><span class="hj-esq-txt"><i></i><i></i></span></div><div class="hj-esq-linha"><span class="hj-esq-txt"><i></i></span></div></div>`;
  } else if (_icErros.has("agenda")) {
    corpo = `<p class="hj-nada">Não consegui carregar a agenda.</p>`;
  } else if (!_icAgendaHoje.length) {
    corpo = `<p class="hj-nada">Nada marcado para hoje.</p>`;
  } else {
    const hm = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    corpo = `<ul class="hj-agenda">${_icAgendaHoje.slice(0, 6).map(it => `
      <li><time>${it.dia_inteiro || !it.inicio ? "dia" : hm(it.inicio)}</time>
        <span><b>${_cfEsc(String(it.titulo || "").replace(/^\[exemplo\]\s*/i, ""))}</b>${it.condominio_nome || it.responsavel_nome ? `<small>${_cfEsc([it.condominio_nome, it.responsavel_nome].filter(Boolean).join(" · "))}</small>` : ""}</span></li>`).join("")}</ul>`;
  }
  return `<section class="hj-bloco" aria-labelledby="hjAgT">
      <div class="hj-bloco-cab"><h3 id="hjAgT">Agenda de hoje</h3><button type="button" class="hj-link" data-ic-secao="agenda">Agenda${_icIco("arrow-right")}</button></div>
      ${corpo}
    </section>`;
}

function _icAtividadeHtml() {
  const ev = [];
  for (const ch of (_chamadosData || [])) {
    if (ch.criado_em) ev.push({ ts: ch.criado_em, ic: "inbox", txt: `Chamado aberto em <b>${_cfEsc(ch.condominio_nome || "—")}</b>: ${_cfEsc(ch.titulo || "#" + ch.id)}`, attr: `data-ic-chamado="${ch.id}"` });
    if (ch.fechado_em) ev.push({ ts: ch.fechado_em, ic: "check", txt: `Chamado #${ch.id} resolvido em <b>${_cfEsc(ch.condominio_nome || "—")}</b>`, attr: `data-ic-chamado="${ch.id}"` });
  }
  for (const o of (Array.isArray(_avData) ? _avData : [])) {
    if (o.respondido_em) ev.push({ ts: o.respondido_em, ic: o.status === "rejeitado" ? "circle-x" : "circle-check", txt: `Cliente ${o.status === "rejeitado" ? "recusou" : "aprovou"} <b>${_cfEsc(o.numero || "orçamento")}</b>`, attr: `data-ic-orc="${o.id}"` });
  }
  for (const o of (Array.isArray(_osData) ? _osData : [])) {
    if (o.finalizada_em) ev.push({ ts: o.finalizada_em, ic: "clipboard-check", txt: `<b>${_cfEsc(o.numero || "O.S.")}</b> finalizada${o.tecnico_nome ? " por " + _cfEsc(o.tecnico_nome) : ""}`, attr: `data-ic-os="${o.id}"` });
  }
  for (const a of (_alertasAbertos || [])) {
    ev.push({ ts: a.criado_em, ic: a.tipo === "dispositivo_offline" ? "wifi-off" : "droplet", txt: `Alerta: ${_cfEsc(String(a.tipo || "").replaceAll("_", " "))}${typeof _mcDeviceCondoName === "function" ? " · <b>" + _cfEsc(_mcDeviceCondoName(a.device_id)) + "</b>" : ""}`, attr: `data-ic-secao="alertas"` });
  }
  ev.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const top = ev.filter(e => e.ts).slice(0, 7);
  return `<section class="hj-bloco" aria-labelledby="hjAtT">
      <div class="hj-bloco-cab"><h3 id="hjAtT">Aconteceu há pouco</h3></div>
      ${top.length ? `<ul class="hj-ativ">${top.map(e => `<li><button type="button" ${e.attr}>${_icIco(e.ic)}<span>${e.txt}</span><time>${_icRel(e.ts)}</time></button></li>`).join("")}</ul>`
        : `<p class="hj-nada">Nada novo por enquanto.</p>`}
    </section>`;
}

// ===== NOTAS FISCAIS (a carteira inteira; a nota mora no orçamento) =====

let _nfAba = "todas";
let _nfBusca = "";

function _nfLinhas() {
  const av = Array.isArray(_avData) ? _avData : [];
  const comNota = av.filter(o => o.nota_status);
  const semNota = av.filter(o => o.status === "aprovado" && !o.nota_status);
  return { comNota, semNota };
}

function renderNotas() {
  const root = document.getElementById("nfRoot");
  if (!root) return;
  const { comNota, semNota } = _nfLinhas();
  const conta = (st) => comNota.filter(o => o.nota_status === st).length;
  const abas = [
    ["todas", "Emitidas e em andamento", comNota.length],
    ["emitida", "Emitidas", conta("emitida")],
    ["processando", "Processando", conta("processando")],
    ["erro", "Com erro", conta("erro")],
    ["sem", "Aprovados sem nota", semNota.length],
  ];
  let lista = _nfAba === "sem" ? semNota : _nfAba === "todas" ? comNota : comNota.filter(o => o.nota_status === _nfAba);
  const q = _nfBusca.trim().toLowerCase();
  if (q) {
    lista = lista.filter(o => [o.nota_numero, o.numero, _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome)]
      .some(v => String(v || "").toLowerCase().includes(q)));
  }
  const quandoDe = (o) => o.nota_emitida_em || o.nota_solicitada_em || o.respondido_em || o.criado_em;
  lista = [...lista].sort((a, b) => new Date(quandoDe(b)) - new Date(quandoDe(a)));
  // Ordem pela coluna (ver _ordenar em admin.js). Situação: erro primeiro.
  const rank = { erro: 0, processando: 1, emitida: 3, cancelada: 4 };
  lista = _ordenar("notas", lista, {
    nota:     o => _ordemData(quandoDe(o)),
    predio:   o => _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome) || null,
    situacao: o => o.nota_status ? (rank[o.nota_status] ?? 5) : 2,
    valor:    o => Number(o.nota_valor || o.valor_total) || 0,
  });

  // ⚠️ A FRASE (molde da O.S., 18/11/2026). Esta tela não tinha resumo
  // nenhum. Erro do Omie ganha de "sem nota" no atalho: é nota que alguém
  // pediu e não saiu.
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const emitidas = comNota.filter(o => o.nota_status === "emitida");
  const faturado = emitidas.reduce((s, o) => s + (Number(o.nota_valor || o.valor_total) || 0), 0);
  const partes = [
    emitidas.length ? `${pl(emitidas.length, "nota emitida", "notas emitidas")}, ${_cfMoeda(faturado)}` : "Nenhuma nota emitida",
    conta("processando") ? `${conta("processando")} processando` : "",
  ].filter(Boolean).join(" · ");
  const acao = conta("erro")
    ? `<button type="button" class="os-resumo-acao" data-nf-aba="erro">${pl(conta("erro"), "nota com erro", "notas com erro")} →</button>`
    : semNota.length
      ? `<button type="button" class="os-resumo-acao" data-nf-aba="sem">${pl(semNota.length, "orçamento aprovado", "orçamentos aprovados")} sem nota →</button>`
      : "";

  const stTxt = { processando: ["Processando", "atencao"], emitida: ["Emitida", "ok"], erro: ["Erro na emissão", "risco"], cancelada: ["Cancelada", "neutro"] };
  const linhas = lista.map(o => {
    const [t, tom] = o.nota_status ? (stTxt[o.nota_status] || [o.nota_status, "neutro"]) : ["Sem nota", "neutro"];
    const quando = o.nota_emitida_em || o.nota_solicitada_em || o.respondido_em;
    const tipo = o.nota_status ? (o.nota_tipo === "nfe" ? "DANFE" : "NFS-e") : "";
    const nome = _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome);
    const predio = o.condominio_id
      ? `<button type="button" class="os-link" data-ic-condo="${o.condominio_id}" data-ic-aba="notas" title="Abrir a ficha do condomínio">${_cfEsc(nome || "—")}</button>`
      : _cfEsc(nome || "—");
    const sub = o.nota_status === "erro" && o.nota_erro
      ? `<span class="os-sub os-sub-atencao">${_cfEsc(o.nota_erro)}</span>`
      : !o.nota_status && o.respondido_em ? `<span class="os-sub">aprovado em ${_cfData(o.respondido_em)}</span>` : "";
    return `<tr class="pro-row" data-ic-orc="${o.id}" tabindex="0">
      <td class="pro-id"><span class="mono">${_cfEsc(o.nota_numero || "—")}</span>
        <span class="os-sub">${o.nota_status ? [tipo, quando ? _cfData(quando) : ""].filter(Boolean).join(" · ") : ""}</span></td>
      <td class="pro-cli"><span class="pro-cli-nome">${predio}</span>
        <span class="os-sub">${_cfEsc(o.numero || "")}</span></td>
      <td class="pro-sit"><span class="os-sit-linha">${_cfSelo(t, tom)}</span>${sub}</td>
      <td class="pro-val">${_cfMoeda(o.nota_valor || o.valor_total)}</td>
    </tr>`;
  });

  root.innerHTML = `
    <section class="card nf-card">
      <div class="cardHead"><h3>Notas fiscais</h3></div>
      <p class="os-resumo nf-resumo"><span>${partes}.</span>${acao ? " " + acao : ""}</p>
      <div class="nf-barra">
        <div class="wa-tabs" role="tablist">${abas.map(([id, rot, n]) =>
          `<button class="wa-tab${id === _nfAba ? " is-active" : ""}" role="tab" aria-selected="${id === _nfAba}" data-nf-aba="${id}">${rot}${n ? ` <span class="wa-count">${n}</span>` : ""}</button>`).join("")}</div>
        <input type="search" class="input nf-busca" id="nfBusca" placeholder="Buscar nota, orçamento ou prédio…" value="${_cfEsc(_nfBusca)}" aria-label="Buscar nota fiscal">
      </div>
      ${lista.length
        ? `<div class="tableWrap"><table class="orc-table pro-table">
            <thead><tr>
              ${_ordemTh("notas", "nota", "Nota", { padrao: "desc", style: "width:170px" })}
              ${_ordemTh("notas", "predio", "Prédio e orçamento")}
              ${_ordemTh("notas", "situacao", "Situação", { style: "width:300px" })}
              ${_ordemTh("notas", "valor", "Valor", { padrao: "desc", cls: "pro-val", style: "width:140px" })}
            </tr></thead>
            <tbody>${linhas.join("")}</tbody></table></div>`
        : `<div class="cf-vazio"><p>${q ? "Nada encontrado com essa busca." : _nfAba === "sem" ? "Todo orçamento aprovado já tem nota." : "Nenhuma nota nesta situação."}</p></div>`}
      <p class="cf-nota nf-rodape">A nota é emitida e acompanhada na página do orçamento. Clique na linha para abrir.</p>
    </section>`;
}

// ===== CLIQUES =====

document.addEventListener("DOMContentLoaded", () => {
  const agir = (e) => {
    const alvo = e.target.closest("[data-ic-chamado],[data-ic-orc],[data-ic-os],[data-ic-contrato],[data-ic-condo],[data-ic-secao],[data-nf-aba],[data-ic-f],[data-ic-mais],[data-ic-novo],[data-ic-novo-tipo],[data-ic-tentar]");
    if (!alvo) return;
    const ds = alvo.dataset;
    if (ds.icF)        { _icFiltro = ds.icF; _icMostrarTudo = false; renderInicio(); return; }
    if ("icMais" in ds) { _icMostrarTudo = !_icMostrarTudo; renderInicio(); return; }
    if ("icTentar" in ds) { _icErros.clear(); _icGarantirDados({ forcar: true }); return; }
    if ("icNovo" in ds) {
      const m = alvo.parentElement.querySelector(".hj-novo-menu");
      if (m) { m.hidden = !m.hidden; alvo.setAttribute("aria-expanded", String(!m.hidden)); }
      return;
    }
    if (ds.icNovoTipo) {
      alvo.closest(".hj-novo-menu").hidden = true;
      if (ds.icNovoTipo === "chamado") document.getElementById("btnNovoChamado")?.click();
      if (ds.icNovoTipo === "orcamento") { showSection("orcamentos"); setTimeout(() => { if (typeof _avAcao === "function") _avAcao("novo"); }, 60); }
      if (ds.icNovoTipo === "condominio") { showSection("cadastros"); setTimeout(() => document.querySelector('[data-action="novo-cliente"]')?.click(), 60); }
      return;
    }
    if (ds.nfAba)      { _nfAba = ds.nfAba; renderNotas(); return; }
    if (ds.icSecao)    { showSection(ds.icSecao); return; }
    if (ds.icChamado)  { if (typeof gbAtEscolher === "function") gbAtEscolher(Number(ds.icChamado)); else _cfAbrirChamado(Number(ds.icChamado)); return; }
    if (ds.icOrc)      { _cfAbrirOrcamento(Number(ds.icOrc)); return; }
    if (ds.icOs)       { abrirOSDetalhe(Number(ds.icOs)); return; }
    if (ds.icContrato) { _ctrAbrirModal({ condoId: Number(ds.icContratoCondo), contratoId: Number(ds.icContrato) }); return; }
    if (ds.icCondo)    { abrirFichaCondominio(Number(ds.icCondo), ds.icAba || "resumo"); return; }
  };
  for (const sel of ['.section[data-section="inicio"]', '.section[data-section="notas"]']) {
    const sec = document.querySelector(sel);
    if (!sec) continue;
    sec.addEventListener("click", agir);
    sec.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches?.(".cf-linha, .pro-row")) { e.preventDefault(); agir(e); }
    });
  }
  document.querySelector('.section[data-section="notas"]')?.addEventListener("input", (e) => {
    if (e.target.id !== "nfBusca") return;
    _nfBusca = e.target.value;
    const pos = e.target.selectionStart;
    renderNotas();
    const campo = document.getElementById("nfBusca");
    campo?.focus(); campo?.setSelectionRange(pos, pos);
  });
});

document.addEventListener("mousedown", (e) => {
  const m = document.querySelector(".hj-novo-menu");
  if (m && !m.hidden && !m.contains(e.target) && !e.target.closest("[data-ic-novo]")) m.hidden = true;
});

// ===== GANCHOS =====
// Mesma técnica da ficha (ver o fim de admin-condominio.js): quando o admin
// redesenha uma lista depois de gravar, estas telas redesenham junto.

(function _icLigarGanchos() {
  let agendado = false;
  const redesenhar = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; _icRenderSeAtiva(); });
  };
  // carregarTelemetria (7 s) e carregarAtendimento (20 s) são o polling: são
  // async, então o redesenho espera a promessa, senão desenharia o dado velho.
  for (const nome of ["_osRenderTabela", "_avRenderTudo", "renderChamados", "_ctrRefrescarListas", "carregarTelemetria", "carregarAtendimento"]) {
    const orig = window[nome];
    if (typeof orig !== "function") continue;
    window[nome] = function (...args) {
      if (nome === "_ctrRefrescarListas") _icBuscadoEm = 0; // contrato mudou: rebusca os que vencem
      if (nome === "_avRenderTudo" || nome === "_osRenderTabela") _icBuscadoEm = 0; // orçamento ou O.S. mudou: as peças sem cobrança também
      const r = orig.apply(this, args);
      Promise.resolve(r).then(redesenhar, redesenhar);
      return r;
    };
  }
  // Abrir a tela busca o que falta.
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    const r = origShow.call(this, name, ...resto);
    if (name === "inicio" || name === "notas") {
      _icRenderSeAtiva();
      _icGarantirDados();
    }
    return r;
  };
})();
