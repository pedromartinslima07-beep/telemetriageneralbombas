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
let _icAvBuscado = false;          // os orçamentos já vieram uma vez

function _icNomeCondo(id, fallback) {
  const c = (Array.isArray(_condominios) ? _condominios : []).find(x => Number(x.id) === Number(id));
  return c ? (c.nome_fantasia || c.nome) : (fallback || "Sem condomínio");
}

async function _icGarantirDados({ forcar = false } = {}) {
  if (_icBuscando) return;
  const velho = Date.now() - _icBuscadoEm > 60000;
  // ⚠️ Pelo flag, não por `_avData.length`: carteira sem orçamento nenhum
  // rebuscava tudo a cada abertura da tela (27/11/2026).
  if (!forcar && !velho && _icContratosVencendo && _osLoaded && _icAvBuscado && _icAgendaHoje !== null && _icPecasSemCobranca !== null) return;
  _icBuscando = true;
  const falhou = (fonte) => () => { _icErros.add(fonte); };
  const ok = (fonte) => { _icErros.delete(fonte); };
  try {
    const tarefas = [];
    if (!_osLoaded || forcar) tarefas.push(Promise.resolve(carregarOrdensServico()).then(() => ok("os"), falhou("os")));
    if (!_icAvBuscado || forcar) tarefas.push(Promise.resolve(carregarAvulsos()).then(() => { _icAvBuscado = true; ok("orcamentos"); }, falhou("orcamentos")));
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

// ===== HOJE (redesenho estrutural, 19/11/2026; revisão 27/11/2026) =====
//
// Uma página, sem subaba: a frase da carteira, UMA fila do que pede ação
// (o mais urgente primeiro, a ação com nome na própria linha), a equipe do
// dia (onde cada técnico está e o que tem marcado) e o que acabou de acontecer.
//
// ⚠️ As ações da fila LEVAM ao lugar onde a coisa é feita (a página do
// orçamento, da O.S., do chamado); não gravam nada daqui. "Emitir nota" abre o
// orçamento, onde a nota é emitida. Assim nenhuma regra de gravação nasce
// nesta tela, e a confirmação de cada ação continua onde sempre esteve.
//
// Revisão de 27/11/2026 (pedido do Pedro, "resolve tudo"):
// - UM PROBLEMA, UMA LINHA. A água entra por PRÉDIO: 4 caixas sem sinal no
//   mesmo prédio são um gateway caído, não 4 problemas. O chamado [AUTO] que
//   a telemetria abriu para aquele prédio entra na mesma linha, em vez de
//   aparecer de novo como chamado. A atividade junta os alertas iguais do
//   mesmo prédio pelo mesmo motivo.
// - OS GRUPOS DIZEM A VERDADE SOBRE O TEMPO. Antes eram prioridade com nome
//   de prazo: chamado de julho em "Agora", aprovado de agosto em "Hoje". Agora
//   o que tem mais de 30 dias vai para "Parado há mais de 30 dias" (a água
//   nunca: é estado de agora), e a idade tem um formato só ("4 meses", não
//   "30/07" ao lado de "3 dias").
// - A tela SÓ É REDESENHADA QUANDO O QUE ELA MOSTRA MUDOU. O polling (7 s)
//   trocava o HTML inteiro: fechava o menu Novo e tirava o foco do teclado.
// - "Em campo agora" e "Agenda de hoje" viraram um bloco só, "Equipe hoje":
//   o técnico com as visitas dele embaixo (o "quadro do dia por técnico" da
//   arquitetura de 19/11). Antes o técnico com visita marcada aparecia "Livre".
//
// ⚠️ Preventiva não entra na fila: `_chamadosAlertaAbertos` já corta pelo
// `plano_manutencao_id` (ver `_alContaComoAlerta` em admin.js). Chamado com
// título "Preventiva mensal" que aparece aqui é chamado SEM preventiva ligada.

let _icFiltro = "tudo";
let _icMostrarTudo = false;
let _icAgendaHoje = null;      // null = ainda não buscou; [] = vazia
let _icErros = new Set();      // "contratos", "agenda", "os", "orcamentos", "pecas"
let _icUltimoHtml = "";        // o HTML do último desenho (antes do lucide trocar os ícones)
let _icRedesenhoPendente = false;

const _IC_TIPOS = [
  ["tudo", "Tudo"], ["agua", "Água"], ["chamados", "Chamados"],
  ["faturamento", "Orçamentos e notas"], ["os", "O.S."], ["contratos", "Contratos"],
];
const _IC_QUANDO = {
  agora: "Agora", resolver: "Para resolver",
  parado: "Parado há mais de 30 dias", depois: "Nos próximos dias",
};
const _IC_PESO_Q = { agora: 0, resolver: 1, parado: 2, depois: 3 };
const _IC_PARADO_DIAS = 30;

// Tempo curto e no plural certo ("1 dia", não "1 dias"; "1 mês", "4 meses").
// Um formato só na coluna de idade: antes passava de 30 dias e virava data.
function _icRel(iso) {
  if (!iso) return "";
  const seg = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seg < 60) return "agora";
  if (seg < 3600) return `${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `${Math.floor(seg / 3600)} h`;
  const d = Math.floor(seg / 86400);
  if (d < 31) return `${d} dia${d === 1 ? "" : "s"}`;
  const m = Math.floor(d / 30.44);
  if (m < 12) return `${m} ${m === 1 ? "mês" : "meses"}`;
  const a = Math.floor(d / 365.25);
  return `${a} ano${a === 1 ? "" : "s"}`;
}

function _icHa(iso) { const r = _icRel(iso); return r === "agora" ? "agora" : "há " + r; }

// O grupo de um item que não é água: passou de 30 dias, é "parado".
function _icGrupo(base, iso) {
  if (base === "depois" || !iso) return base;
  return (Date.now() - new Date(iso).getTime()) / 86400000 > _IC_PARADO_DIAS ? "parado" : base;
}

function _icIco(n) { return `<i data-lucide="${n}" aria-hidden="true"></i>`; }
function _icHojeISO() {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // São Paulo (-03:00 fixo desde 2019)
  return d.toISOString().slice(0, 10);
}

// "Cisterna, Caixa 1 e Caixa 2"
function _icListaNomes(nomes) {
  if (nomes.length <= 1) return nomes.join("");
  return nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
}

// A água de um prédio numa linha só.
function _icAguaDoPredio(g, autos, temChamadoAberto) {
  const cid = g.condominio?.id;
  const cn = g.condominio?.nome_fantasia || g.condominio?.nome || "Condomínio";
  const mudos = [], crits = [], extr = [];
  for (const r of (g.reservatorios || [])) {
    if (r.offline) { mudos.push(r); continue; }
    const s = _situacaoAgua(r);
    if (s === "critico") crits.push(r);
    else if (s === "extravasando") extr.push(r);
  }
  if (!mudos.length && !crits.length && !extr.length) return null;

  const nome = r => r.nome || "Reservatório";
  const pct = r => Math.round(r.ultima_leitura?.nivel_pct);
  const leitura = r => r.ultima_leitura?.criado_em || null;
  const t = [];
  if (crits.length) t.push(crits.length === 1 ? `${nome(crits[0])} em ${pct(crits[0])}%` : `${crits.length} reservatórios em nível crítico`);
  if (mudos.length) t.push(mudos.length === 1 ? `${nome(mudos[0])} sem sinal` : `${mudos.length} reservatórios sem sinal`);
  if (extr.length) t.push(extr.length === 1 ? `${nome(extr[0])} no nível do ladrão` : `${extr.length} reservatórios no nível do ladrão`);

  const m = [];
  if (crits.length === 1) {
    // Pela situação (número + alerta aberto, admin.js): com o alerta ainda
    // aberto o número pode já ter passado de 20% e voltado a subir.
    const p = crits[0].ultima_leitura?.nivel_pct;
    m.push(p < _FAIXA_NIVEL.critico ? `Abaixo do crítico (${_FAIXA_NIVEL.critico}%)` : "Voltando a subir, alerta crítico ainda aberto");
  }
  // Sem sinal: desde quando o prédio todo calou (a leitura mais recente).
  const ultMudo = mudos.map(leitura).filter(Boolean).sort().pop() || null;
  if (mudos.length) {
    if (mudos.length > 1) m.push(_icListaNomes(mudos.map(nome)));
    m.push(ultMudo ? "Última leitura " + _icHa(ultMudo) : "Nunca enviou leitura");
  }
  if (extr.length && !crits.length && !mudos.length) m.push("Pode estar extravasando");
  const ch = autos[0];
  if (ch) m.push(`chamado #${ch.id} aberto · ${ch.tecnico_nome || "sem técnico"}`);
  else m.push(temChamadoAberto ? "há chamado aberto no prédio" : "nenhum chamado aberto");

  const grave = crits.length || mudos.length;
  return {
    tipo: "agua", q: "agora", cor: grave ? "ri" : "at", ic: crits.length ? "droplet" : mudos.length ? "wifi-off" : "droplets",
    ord: grave ? 0 : 1, condo: cid, condoNome: cn, t: t.join(" · "), m: m.join(" · "),
    quando: crits.length ? leitura(crits[0]) : mudos.length ? ultMudo : leitura(extr[0]),
    // Chamado da telemetria sem ninguém: o próximo passo é mandar alguém.
    acao: ch && !ch.tecnico_nome ? "Atribuir técnico" : "Ver água",
    attr: ch && !ch.tecnico_nome ? `data-ic-chamado="${ch.id}"` : `data-ic-condo="${cid}" data-ic-aba="telemetria"`,
  };
}

// A fila: as mesmas regras do resto do admin, numa lista só.
function _icFila() {
  const itens = [];
  const temChamadoAberto = new Set((_chamadosData || []).filter(ch => _chEmAberto(ch.status)).map(ch => Number(ch.condominio_id)));
  const urgentes = (typeof _chamadosAlertaAbertos === "function" ? _chamadosAlertaAbertos() : []).filter(ch => _chEmAberto(ch.status));

  // Os [AUTO] que a telemetria abriu, por prédio: entram na linha da água.
  const autosPorCondo = new Map();
  for (const ch of urgentes) {
    if (!String(ch.titulo || "").startsWith("[AUTO]")) continue;
    const k = Number(ch.condominio_id);
    if (!autosPorCondo.has(k)) autosPorCondo.set(k, []);
    autosPorCondo.get(k).push(ch);
  }
  const absorvidos = new Set();
  for (const g of (_statusData || [])) {
    const k = Number(g.condominio?.id);
    const autos = autosPorCondo.get(k) || [];
    const it = _icAguaDoPredio(g, autos, temChamadoAberto.has(k));
    if (!it) continue;
    autos.forEach(ch => absorvidos.add(ch.id));
    itens.push(it);
  }

  for (const ch of urgentes) {
    if (absorvidos.has(ch.id)) continue;
    const fora = _chamadoSlaEstourado(ch);
    const p1 = String(ch.prioridade).toLowerCase() === "p1";
    itens.push({ tipo: "chamados", q: _icGrupo("agora", ch.criado_em), cor: fora || p1 ? "ri" : "at", ic: fora ? "clock" : "inbox", ord: p1 ? 1 : 2,
      condo: ch.condominio_id, condoNome: _icNomeCondo(ch.condominio_id, ch.condominio_nome),
      t: `${ch.titulo || "Chamado #" + ch.id}`,
      m: `${_CF_PRIO[ch.prioridade] || "Chamado"} · #${ch.id}${fora ? " · fora do prazo" : ""} · ${ch.tecnico_nome ? ch.tecnico_nome : "sem técnico"}`,
      quando: ch.criado_em, acao: ch.tecnico_nome ? "Abrir chamado" : "Atribuir técnico", attr: `data-ic-chamado="${ch.id}"` });
  }

  // O turno pediu o escritório (migration 098): fica aqui até alguém dar
  // como resolvido na página do chamado.
  for (const ch of (_chamadosData || []).filter(ch => ch.pede_escritorio_em && _chEmAberto(ch.status))) {
    itens.push({ tipo: "chamados", q: _icGrupo("agora", ch.pede_escritorio_em), cor: "at", ic: "hand-helping", ord: 1,
      condo: ch.condominio_id, condoNome: _icNomeCondo(ch.condominio_id, ch.condominio_nome),
      t: `O turno pediu: ${ch.pede_escritorio_motivo || "veja o chamado"}`,
      m: `#${ch.id} · ${ch.titulo || "Chamado"}${ch.pede_escritorio_por_nome ? " · por " + ch.pede_escritorio_por_nome : ""}`,
      quando: ch.pede_escritorio_em, acao: "Abrir chamado", attr: `data-ic-chamado="${ch.id}"` });
  }

  const av = Array.isArray(_avData) ? _avData : [];
  for (const o of av.filter(o => o.nota_status === "erro")) {
    itens.push({ tipo: "faturamento", q: _icGrupo("agora", o.nota_solicitada_em), cor: "ri", ic: "file-warning", ord: 3,
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      t: `Nota de ${o.numero || "orçamento"} voltou com erro`,
      m: `${o.nota_tipo === "nfe" ? "DANFE" : "NFS-e"}${o.nota_erro ? " · " + o.nota_erro : ""}`,
      quando: o.nota_solicitada_em, acao: "Corrigir", attr: `data-ic-orc="${o.id}"` });
  }
  for (const o of av.filter(_avPendente)) {
    const recusou = o.status === "rejeitado";
    itens.push({ tipo: "faturamento", q: _icGrupo("resolver", o.respondido_em), cor: recusou ? "cz" : "at", ic: recusou ? "circle-x" : "circle-check", ord: 4,
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      t: `Cliente ${recusou ? "recusou" : "aprovou"} ${o.numero || "o orçamento"}`,
      m: `${_icValor(o).replace(/^ · /, "") || "sem valor"} · falta dar baixa`,
      quando: o.respondido_em, acao: "Dar baixa", attr: `data-ic-orc="${o.id}"` });
  }
  for (const o of av.filter(o => o.status === "aprovado" && !o.nota_status)) {
    const quando = o.respondido_em || o.criado_em;
    itens.push({ tipo: "faturamento", q: _icGrupo("resolver", quando), cor: "cz", ic: "receipt", ord: 5,
      condo: o.condominio_id, condoNome: _icNomeCondo(o.condominio_id, o.condominio_nome || o.cliente_nome),
      t: `${o.numero || "Orçamento"} aprovado, sem nota fiscal`,
      m: `${_icValor(o).replace(/^ · /, "") || "sem valor"}${o.respondido_em ? " · aprovado " + _icHa(o.respondido_em) : ""}`,
      quando, acao: "Emitir nota", attr: `data-nf-orc="${o.id}"` });
  }

  // Peça usada na visita que não entrou em orçamento (fase C das peças): a
  // ação abre a O.S., onde fica o "Cobrar as N peças usadas".
  for (const x of (_icPecasSemCobranca || [])) {
    const n = Number(x.pecas) || 0;
    const nomes = (x.descricoes || []).filter(Boolean);
    const quando = x.finalizada_em || x.chegada_em;
    itens.push({ tipo: "faturamento", q: _icGrupo("resolver", quando), cor: "at", ic: "package", ord: 5,
      condo: x.condominio_id, condoNome: x.condominio_nome || _icNomeCondo(x.condominio_id),
      t: `${x.numero || "O.S. #" + x.os_id}: ${n} peça${n === 1 ? "" : "s"} usada${n === 1 ? "" : "s"} sem cobrança`,
      m: `${nomes.join(", ")}${n > nomes.length ? ` e mais ${n - nomes.length}` : ""}${x.tecnico_nome ? " · " + x.tecnico_nome : ""}`,
      quando, acao: "Cobrar", attr: `data-ic-os="${x.os_id}"` });
  }

  const os = Array.isArray(_osData) ? _osData : [];
  for (const o of os.filter(_osFaltaEnviar)) {
    itens.push({ tipo: "os", q: _icGrupo("resolver", o.finalizada_em), cor: "cz", ic: "send", ord: 6,
      condo: o.condominio_id, condoNome: o.condominio_nome || _icNomeCondo(o.condominio_id),
      t: `${o.numero || "O.S. #" + o.id} finalizada, não enviada`,
      m: `${o.tecnico_nome ? "Por " + o.tecnico_nome : "Finalizada"}${o.finalizada_em ? " · " + _icHa(o.finalizada_em) : ""}`,
      quando: o.finalizada_em, acao: "Enviar ao cliente", attr: `data-ic-os="${o.id}"` });
  }

  for (const ct of (_icContratosVencendo || [])) {
    const venceu = ct.dias_para_vencer < 0;
    itens.push({ tipo: "contratos", q: venceu ? _icGrupo("resolver", ct.fim_em) : "depois", cor: venceu ? "ri" : "cz", ic: "file-signature", ord: 7,
      condo: ct.condominio_id, condoNome: _icNomeCondo(ct.condominio_id, ct.condominio_nome),
      t: venceu ? `Contrato vencido há ${-ct.dias_para_vencer} dia${ct.dias_para_vencer === -1 ? "" : "s"}` : `Contrato vence em ${ct.dias_para_vencer} dia${ct.dias_para_vencer === 1 ? "" : "s"}`,
      m: `${ct.numero || "Contrato"}${ct.valor_mensal ? " · " + _cfMoeda(ct.valor_mensal) + " por mês" : ""} · ${_cfData(ct.fim_em)}`,
      quando: ct.fim_em, dias: ct.dias_para_vencer, acao: venceu ? "Ver contrato" : "Renovar",
      attr: `data-ic-contrato="${ct.id}" data-ic-contrato-condo="${ct.condominio_id}"` });
  }

  itens.sort((a, b) => _IC_PESO_Q[a.q] - _IC_PESO_Q[b.q] || a.ord - b.ord
    || (a.tipo === "contratos" ? a.dias - b.dias : new Date(a.quando || 0) - new Date(b.quando || 0)));
  return itens;
}

function _icDadosProntos() {
  // O status (telemetria) e os chamados chegam no boot; O.S., orçamentos e
  // contratos são buscados ao abrir a tela.
  return Array.isArray(_statusData) && _statusData.length > 0 && _icContratosVencendo !== null && _osLoaded;
}

// O elemento com foco, como seletor, para devolver o foco depois de redesenhar.
function _icChaveFoco(root) {
  const el = document.activeElement;
  if (!el || el === root || !root.contains(el)) return null;
  const attrs = [...el.attributes].filter(a => /^data-(ic|nf)-/.test(a.name));
  if (!attrs.length) return null;
  return attrs.map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
}

// `forcar`: desenha mesmo com o menu Novo aberto (quem chama é o clique).
function renderInicio({ forcar = false } = {}) {
  const root = document.getElementById("icRoot");
  if (!root) return;
  const pronto = _icDadosProntos();
  const fila = pronto ? _icFila() : [];
  const cont = k => (k === "tudo" ? fila.length : fila.filter(i => i.tipo === k).length);
  if (_icFiltro !== "tudo" && !cont(_icFiltro)) _icFiltro = "tudo";
  const visiveis = fila.filter(i => _icFiltro === "tudo" || i.tipo === _icFiltro);
  // No celular cada linha ocupa três ou quatro: corta antes.
  const LIM = window.matchMedia?.("(max-width: 768px)").matches ? 8 : 14;
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
      if (it.q !== q) { q = it.q; html += `<div class="hj-fila-grupo${q === "parado" ? " is-parado" : ""}">${_IC_QUANDO[q]}</div>`; }
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

  const html = `
    <div class="hj">
      <header class="hj-cab">
        <div>
          <h2 class="hj-ola">${saud}${nome && nome !== "—" ? ", " + _cfEsc(nome) : ""}</h2>
          <p class="hj-data">${dataTxt}</p>
        </div>
        <div class="hj-cab-acoes">
          <button type="button" class="hj-bt is-pri" data-ic-novo aria-haspopup="menu" aria-expanded="false">${_icIco("plus")}Novo${_icIco("chevron-down")}</button>
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
          ${_icEquipeHtml()}
          ${_icAtividadeHtml()}
        </div>
      </div>
    </div>`;

  // ⚠️ O polling chama esta função a cada 7 s. Trocar o HTML sem necessidade
  // fechava o menu Novo e jogava o foco do teclado para o começo da página.
  if (html === _icUltimoHtml && root.querySelector(".hj")) return;
  if (!forcar && root.querySelector(".hj-novo-menu:not([hidden])")) { _icRedesenhoPendente = true; return; }
  const foco = _icChaveFoco(root);
  root.innerHTML = html;
  _icUltimoHtml = html;
  _icRedesenhoPendente = false;
  window.lucide?.createIcons?.({ root });
  if (foco) root.querySelector(foco)?.focus({ preventScroll: true });
}

function _icFecharNovo() {
  const m = document.querySelector(".hj-novo-menu");
  if (!m || m.hidden) return;
  m.hidden = true;
  document.querySelector("[data-ic-novo]")?.setAttribute("aria-expanded", "false");
  if (_icRedesenhoPendente) renderInicio();
}

function _icCarteiraHtml() {
  const rs = [];
  for (const g of (_statusData || [])) for (const r of (g.reservatorios || [])) rs.push(r);
  if (!rs.length) {
    return `<section class="hj-carteira is-carregando" aria-busy="true"><span class="hj-esq-barra"></span></section>`;
  }
  // Pela situação (número + alerta aberto, `_situacaoAgua` em admin.js).
  const sits = rs.map(_situacaoAgua);
  const mudo = rs.filter(r => r.offline).length;
  const crit = sits.filter(s => s === "critico").length;
  const baixo = sits.filter(s => s === "baixo").length;
  const extrav = sits.filter(s => s === "extravasando").length;
  const ok = rs.length - mudo - crit - baixo - extrav;
  const seg = (n, cor) => n ? `<i style="flex:${n};background:${cor}"></i>` : "";
  return `<section class="hj-carteira" aria-label="Situação da água na carteira">
      <div class="hj-carteira-frase">
        <span><b>${ok} de ${rs.length}</b> reservatórios normais</span>
        ${crit ? `<span><i class="hj-pt is-ri"></i><b>${crit}</b> em nível crítico</span>` : ""}
        ${baixo ? `<span><i class="hj-pt is-at"></i><b>${baixo}</b> com nível baixo</span>` : ""}
        ${extrav ? `<span><i class="hj-pt is-at"></i><b>${extrav}</b> extravasando</span>` : ""}
        ${mudo ? `<span><i class="hj-pt is-cz"></i><b>${mudo}</b> sem sinal</span>` : ""}
      </div>
      <div class="hj-barra" role="img" aria-label="${ok} normais, ${baixo} baixos, ${extrav} extravasando, ${crit} críticos, ${mudo} sem sinal">
        ${seg(ok, "var(--hj-ok)")}${seg(baixo + extrav, "var(--hj-at)")}${seg(crit, "var(--hj-ri)")}${seg(mudo, "#a9b2c9")}
      </div>
      <button type="button" class="hj-link" data-ic-secao="monitoramento">Ver monitoramento${_icIco("arrow-right")}</button>
    </section>`;
}

// EQUIPE HOJE: cada técnico, onde está agora e o que tem marcado no dia; o que
// é da agenda sem técnico (escritório, faturamento, resumo das preventivas)
// fica embaixo. Junta os antigos "Em campo agora" e "Agenda de hoje".
function _icEquipeHtml() {
  const tecs = (Array.isArray(_tecnicosData) ? _tecnicosData : []).filter(t => t.cargo === "tecnico" && t.ativo !== false);
  const verAgenda = typeof _navSecaoVisivel !== "function" || _navSecaoVisivel("agenda");
  if (!tecs.length && !verAgenda) return "";
  const agenda = verAgenda && Array.isArray(_icAgendaHoje) ? _icAgendaHoje : [];
  const abertos = (_chamadosData || []).filter(ch => _chEmAberto(ch.status) && !(typeof _chEhPreventiva === "function" && _chEhPreventiva(ch)));
  const hm = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const itemAg = it => `<li><button type="button" data-ic-secao="agenda"><time>${it.dia_inteiro || !it.inicio ? "dia" : hm(it.inicio)}</time>
      <span>${_cfEsc(String(it.titulo || "").replace(/^\[exemplo\]\s*/i, ""))}${it.condominio_nome ? `<small>${_cfEsc(it.condominio_nome)}</small>` : ""}</span></button></li>`;
  const listaAg = (lista, max) => lista.length ? `<ul class="hj-tec-ag">${lista.slice(0, max).map(itemAg).join("")}${lista.length > max
    ? `<li><button type="button" class="hj-tec-ag-mais" data-ic-secao="agenda">e mais ${lista.length - max} na agenda</button></li>` : ""}</ul>` : "";

  const usados = new Set();
  const linhas = tecs.map(t => {
    const meus = abertos.filter(ch => Number(ch.tecnico_id) === Number(t.id));
    const agora = meus.find(ch => ch.tecnico_chegou_em) || meus.find(ch => ch.tecnico_a_caminho_em);
    const loc = (Array.isArray(_tecLocs) ? _tecLocs : []).find(l => Number(l.tecnico_id) === Number(t.id));
    const ag = agenda.filter(it => !usados.has(it) && (
      (it.chamado_tecnico_id != null && Number(it.chamado_tecnico_id) === Number(t.id))
      || (t.usuario_id != null && it.responsavel_id != null && Number(it.responsavel_id) === Number(t.usuario_id))));
    ag.forEach(it => usados.add(it));
    let estado, cor;
    if (agora?.tecnico_chegou_em) { estado = `Em atendimento · ${agora.condominio_nome || "prédio"}`; cor = "info"; }
    else if (agora) { estado = `A caminho · ${agora.condominio_nome || "prédio"}`; cor = "at"; }
    else if (meus.length) { estado = `${meus.length} chamado${meus.length === 1 ? "" : "s"} com ele`; cor = "cz"; }
    else { estado = ag.length ? "Livre agora" : "Livre"; cor = "ok"; }
    const ini = String(t.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
    return `<div class="hj-tec">
        <span class="hj-av">${_cfEsc(ini)}</span>
        <span class="hj-tec-txt"><b>${_cfEsc(t.nome)}</b><small><i class="hj-pt is-${cor}"></i>${_cfEsc(estado)}</small></span>
        <span class="hj-tec-loc">${loc?.capturada_em ? "visto " + _icHa(loc.capturada_em) : ""}</span>
        ${listaAg(ag, 3)}
      </div>`;
  }).join("");

  let rodape = "";
  if (verAgenda) {
    if (_icAgendaHoje === null && !_icErros.has("agenda")) {
      rodape = `<div class="hj-esq is-curto" aria-busy="true"><div class="hj-esq-linha"><span class="hj-esq-txt"><i></i><i></i></span></div></div>`;
    } else if (_icErros.has("agenda")) {
      rodape = `<p class="hj-nada">Não consegui carregar a agenda.</p>`;
    } else {
      const resto = agenda.filter(it => !usados.has(it));
      if (resto.length) rodape = `<div class="hj-eq-resto"><span class="hj-eq-rot">Sem técnico na agenda</span>${listaAg(resto, 4)}</div>`;
      else if (!agenda.length) rodape = `<p class="hj-nada">Nada marcado na agenda para hoje.</p>`;
    }
  }
  return `<section class="hj-bloco" aria-labelledby="hjEqT">
      <div class="hj-bloco-cab"><h3 id="hjEqT">Equipe hoje</h3>
        <button type="button" class="hj-link" data-ic-secao="mapa">Mapa${_icIco("arrow-right")}</button>
        ${verAgenda ? `<button type="button" class="hj-link" data-ic-secao="agenda">Agenda${_icIco("arrow-right")}</button>` : ""}</div>
      ${linhas ? `<div class="hj-tecs">${linhas}</div>` : ""}
      ${rodape}
    </section>`;
}

// O que aconteceu nos últimos 7 dias. Alertas iguais (mesmo prédio, mesmo
// motivo) viram uma linha: um gateway caído abria um alerta por caixa.
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
  const alertas = new Map();
  for (const a of (_alertasAbertos || [])) {
    if (!a.criado_em) continue;
    const predio = typeof _mcDeviceCondoName === "function" ? _mcDeviceCondoName(a.device_id) : "";
    const k = `${predio}|${a.tipo}`;
    const g = alertas.get(k) || { ts: a.criado_em, n: 0, tipo: a.tipo, predio };
    g.n++;
    if (new Date(a.criado_em) > new Date(g.ts)) g.ts = a.criado_em;
    alertas.set(k, g);
  }
  for (const g of alertas.values()) {
    ev.push({ ts: g.ts, ic: g.tipo === "dispositivo_offline" ? "wifi-off" : "droplet",
      txt: `Alerta: ${_cfEsc(String(g.tipo || "").replaceAll("_", " "))}${g.n > 1 ? ` em ${g.n} reservatórios` : ""}${g.predio ? " · <b>" + _cfEsc(g.predio) + "</b>" : ""}`,
      attr: `data-ic-secao="alertas"` });
  }
  const corte = Date.now() - 7 * 86400000;
  const top = ev.filter(e => e.ts && new Date(e.ts).getTime() >= corte)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 7);
  return `<section class="hj-bloco" aria-labelledby="hjAtT">
      <div class="hj-bloco-cab"><h3 id="hjAtT">Aconteceu há pouco</h3></div>
      ${top.length ? `<ul class="hj-ativ">${top.map(e => `<li><button type="button" ${e.attr}>${_icIco(e.ic)}<span>${e.txt}</span><time>${_icRel(e.ts)}</time></button></li>`).join("")}</ul>`
        : `<p class="hj-nada">Nada nos últimos 7 dias.</p>`}
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
    return `<tr class="pro-row" data-nf-orc="${o.id}" tabindex="0">
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
      <p class="cf-nota nf-rodape">Clique na linha para abrir a página da nota (rascunho, impostos, boletos).</p>
    </section>`;
}

// ===== CLIQUES =====

document.addEventListener("DOMContentLoaded", () => {
  const agir = (e) => {
    const alvo = e.target.closest("[data-nf-orc],[data-ic-chamado],[data-ic-orc],[data-ic-os],[data-ic-contrato],[data-ic-condo],[data-ic-secao],[data-nf-aba],[data-ic-f],[data-ic-mais],[data-ic-novo],[data-ic-novo-tipo],[data-ic-tentar]");
    if (!alvo) return;
    const ds = alvo.dataset;
    if (ds.icF)        { _icFiltro = ds.icF; _icMostrarTudo = false; renderInicio(); return; }
    if ("icMais" in ds) { _icMostrarTudo = !_icMostrarTudo; renderInicio(); return; }
    if ("icTentar" in ds) { _icErros.clear(); _icGarantirDados({ forcar: true }); return; }
    if ("icNovo" in ds) {
      const m = alvo.parentElement.querySelector(".hj-novo-menu");
      if (m && !m.hidden) { _icFecharNovo(); return; }
      if (m) { m.hidden = false; alvo.setAttribute("aria-expanded", "true"); m.querySelector("button")?.focus(); }
      return;
    }
    if (ds.icNovoTipo) {
      _icFecharNovo();
      if (ds.icNovoTipo === "chamado") document.getElementById("btnNovoChamado")?.click();
      if (ds.icNovoTipo === "orcamento") { showSection("orcamentos"); setTimeout(() => { if (typeof _avAcao === "function") _avAcao("novo"); }, 60); }
      if (ds.icNovoTipo === "condominio") { showSection("cadastros"); setTimeout(() => document.querySelector('[data-action="novo-cliente"]')?.click(), 60); }
      return;
    }
    if (ds.nfAba)      { _nfAba = ds.nfAba; renderNotas(); return; }
    if (ds.icSecao)    { showSection(ds.icSecao); return; }
    if (ds.icChamado)  { if (typeof gbAtEscolher === "function") gbAtEscolher(Number(ds.icChamado)); else _cfAbrirChamado(Number(ds.icChamado)); return; }
    if (ds.nfOrc)      { _nfAbrirPagina(Number(ds.nfOrc)); return; }
    if (ds.icOrc)      { _cfAbrirOrcamento(Number(ds.icOrc)); return; }
    if (ds.icOs)       { abrirOSDetalhe(Number(ds.icOs)); return; }
    if (ds.icContrato) { _ctrAbrirModal({ condoId: Number(ds.icContratoCondo), contratoId: Number(ds.icContrato) }); return; }
    if (ds.icCondo)    { abrirFichaCondominio(Number(ds.icCondo), ds.icAba || "resumo"); return; }
  };
  // ⚠️ As notas escutam no próprio #nfRoot, não na seção Notas: o Financeiro
  // (admin-financeiro.js) MOVE o #nfRoot para dentro dele, e preso à seção os
  // cliques nas abas, na busca e nas linhas não chegavam (20/11/2026).
  for (const sel of ['.section[data-section="inicio"]', '#nfRoot']) {
    const sec = document.querySelector(sel);
    if (!sec) continue;
    sec.addEventListener("click", agir);
    sec.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches?.(".cf-linha, .pro-row")) { e.preventDefault(); agir(e); }
    });
  }
  document.getElementById("nfRoot")?.addEventListener("input", (e) => {
    if (e.target.id !== "nfBusca") return;
    _nfBusca = e.target.value;
    const pos = e.target.selectionStart;
    renderNotas();
    const campo = document.getElementById("nfBusca");
    campo?.focus(); campo?.setSelectionRange(pos, pos);
  });
});

// Fecha o menu Novo ao clicar fora (no clique, não no mousedown: o redesenho
// que esperava o menu fechar trocaria o botão clicado antes do clique chegar)
// e com Esc, devolvendo o foco ao botão.
document.addEventListener("click", (e) => {
  const m = document.querySelector(".hj-novo-menu");
  if (m && !m.hidden && !m.contains(e.target) && !e.target.closest("[data-ic-novo]")) {
    m.hidden = true;
    document.querySelector("[data-ic-novo]")?.setAttribute("aria-expanded", "false");
    if (_icRedesenhoPendente) setTimeout(() => renderInicio(), 0);
  }
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const m = document.querySelector(".hj-novo-menu");
  if (!m || m.hidden) return;
  _icFecharNovo();
  document.querySelector("[data-ic-novo]")?.focus();
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
