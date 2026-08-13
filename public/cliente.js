function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}

if (!getToken()) {
  window.location.href = "/login";
}

// ===== NAVEGAÇÃO POR SEÇÕES =====
// Três seções. "Dashboard" e "Telemetria" eram DUAS telas mostrando os mesmos
// reservatórios — herança do admin, que tem as duas porque olha N condomínios.
// Aqui viraram "Meu prédio".
const _sectionTitles = { predio: "Meu prédio", alertas: "Alertas", chamados: "Chamados" };

// ── Estado do histórico ──
let _reservatorios = [];
let _histDias = 1;

// ── Estado dos alertas ──
let _alAlertas = [];
let _alTabAtiva = "todos";
let _alBindFeito = false;
let _alSelecionadoId = null;

// ── Estado de "Meu prédio" ──
let _telCliUltimoStatus = null; // último payload de /cliente/status
let _telCliHistChart   = null;  // ApexCharts (histórico - area)
let _relogioTimer      = null;

// Faixas de alerta. ⚠️ São as MESMAS do backend (`nivelFromPct`) e as mesmas
// desenhadas na coluna d'água da landing. Se mudarem lá, mudam nos três.
const LIMIARES = { critico: 20, baixo: 45 };

function _telCliTemReservatorios() {
  const list = Array.isArray(_telCliUltimoStatus?.reservatorios) ? _telCliUltimoStatus.reservatorios : [];
  return list.length > 0;
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("is-active"));
  document.querySelector(`.section[data-section="${name}"]`)?.classList.add("is-active");
  document.querySelectorAll(".nav-item[data-section]").forEach(n => n.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add("active");
  const title = _sectionTitles[name] || name;
  const t1 = document.getElementById("topbarTitle");        // mobile
  const t2 = document.getElementById("topbarTitleDesktop"); // desktop
  if (t1) t1.textContent = title;
  if (t2) t2.textContent = title;

  if (name === "chamados" && typeof renderSecaoChCli === "function") {
    renderSecaoChCli();
  }
  if (name === "predio") {
    _predioAtualizar(_telCliUltimoStatus);
    if (_telCliTemReservatorios()) carregarHistorico();
  }
}

function abrirModalSenha() {
  document.getElementById("senhaMsg").textContent = "";
  document.getElementById("senhaAtual").value = "";
  document.getElementById("senhaNova").value = "";
  document.getElementById("senhaNova2").value = "";
  document.getElementById("senhaOverlay").style.display = "flex";
}

function fecharModalSenha() {
  document.getElementById("senhaOverlay").style.display = "none";
  document.getElementById("senhaMsg").textContent = "";
}

// fecha clicando fora
document.addEventListener("click", (e) => {
  const ov = document.getElementById("senhaOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModalSenha();
});

// ESC fecha
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalSenha();
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function fmtData(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function setStatusMsg(msg) {
  const el = document.getElementById("statusMsg");
  if (el) el.textContent = msg || "";
}

// Troca o placeholder "Cliente / Meu Condomínio" pelos dados reais. O nome do
// usuário vem do localStorage (gravado no login) e o do condomínio do
// /cliente/status — o JWT só carrega o id.
function _aplicarIdentidade(condominio) {
  let usuario = {};
  try { usuario = JSON.parse(localStorage.getItem("user")) || {}; } catch {}

  const nomeUsuario = usuario.nome || "Cliente";
  const nomeCondo   = condominio?.nome || "Meu Condomínio";
  const local       = [condominio?.bairro, condominio?.cidade].filter(Boolean).join(" · ");

  const set = (sel, txt, title) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.textContent = txt;
    if (title) el.title = title;           // nome longo fica acessível no hover
  };

  set(".topbar-user-name", nomeUsuario);
  set(".topbar-user-role", nomeCondo, nomeCondo);
  set(".sidebar-user-role", nomeUsuario);
  set(".sidebar-user-label", nomeCondo, local ? `${nomeCondo} — ${local}` : nomeCondo);
}

// Extrai o campo `error` do corpo da resposta (todo handler do backend responde
// JSON). Cai pro texto cru se não for JSON — ex.: página HTML de erro do proxy.
async function _erroDaResposta(r) {
  const txt = await r.text().catch(() => "");
  try { return JSON.parse(txt).error || txt; } catch { return txt; }
}

// ============================================================
// MEU PRÉDIO — o instrumento e o trilho
// ------------------------------------------------------------
// A estrutura desta seção é uma LINHA DO TEMPO: o AGORA no topo e o passado
// descendo. Substituiu a grade de cards que o painel herdou do admin.
//
// O instrumento (.agora) é o MESMO objeto da landing pública — cabeçalho,
// veredito, colunas d'água, nota — só que ligado no sensor de verdade. É
// deliberado: o síndico reconhece a peça que viu antes de contratar. Se
// mexer na anatomia aqui, olhar `.instr` em landing.css antes.
//
// ⚠️ Não voltar a desenhar o tanque cilíndrico em SVG. Ele veio do admin.js
// (`_telTanqueSVG`), era duplicado lá e aqui, e é justamente a herança que
// este redesenho existe para desfazer.
// ============================================================

function _estadoDoReservatorio(r) {
  if (r.offline) return "offline";
  const pct = r.ultima_leitura?.nivel_pct;
  if (pct == null) return "offline";
  if (pct < LIMIARES.critico) return "critico";
  if (pct < LIMIARES.baixo)   return "atencao";
  return "normal";
}

// "há Xmin" / "há Xh" / data
function _telAtualizadoTxt(u) {
  if (!u?.criado_em) return "sem leitura";
  const mins = Math.round((Date.now() - new Date(u.criado_em)) / 60000);
  if (mins < 1)    return "agora mesmo";
  if (mins < 60)   return `há ${mins} min`;
  if (mins < 1440) return `há ${Math.round(mins / 60)}h`;
  return new Date(u.criado_em).toLocaleDateString("pt-BR");
}

// ─── O veredito ──────────────────────────────────────────────────────────
// A frase que responde a visita de 5 segundos. Fica em prosa normal e
// grande, fora do mono: quem chega aflito não deve ter que ler instrumento
// para saber se pode dormir.
//
// ⚠️ Nenhuma frase aqui pode afirmar mais do que o dado sustenta. "Parou de
// enviar leitura" não é "está sem água" — e essa distinção é literalmente o
// produto. Não trocar por texto mais tranquilizador.
function _predioVeredito(list, chamados) {
  const nome  = r => _telCliEscapar(r.nome || "Um reservatório");
  const pctDe = r => Math.round(r.ultima_leitura?.nivel_pct ?? 0);

  const offline  = list.filter(r => r.offline || r.ultima_leitura?.nivel_pct == null);
  const criticos = list.filter(r => _estadoDoReservatorio(r) === "critico");
  const atencao  = list.filter(r => _estadoDoReservatorio(r) === "atencao");

  const abertos = chamados.filter(c => c.status === "aberto" || c.status === "em_atendimento");
  const comTecnico = chamados.find(c => c.status === "em_atendimento" && c.tecnico_nome);

  const notaAtendimento = comTecnico
    ? `${_telCliEscapar(comTecnico.tecnico_nome)} está designado para o atendimento.`
    : abertos.length
      ? "Já existe um chamado aberto para isso."
      : "Nossa equipe é avisada automaticamente quando o nível chega aqui.";

  if (criticos.length) {
    return {
      estado: "critico",
      titulo: criticos.length === 1
        ? `<strong>${nome(criticos[0])}</strong> está em ${pctDe(criticos[0])}%.`
        : `<strong>${criticos.length} reservatórios</strong> estão abaixo de ${LIMIARES.critico}%.`,
      nota: notaAtendimento,
    };
  }

  if (offline.length) {
    // ⚠️ Aqui NÃO entra o `notaAtendimento`: o técnico designado quase sempre
    // está num chamado de OUTRO reservatório, e citá-lo nesta frase faz o
    // síndico entender que alguém já está indo cuidar deste sensor. Não está.
    return {
      estado: "atencao",
      titulo: offline.length === 1
        ? `<strong>${nome(offline[0])}</strong> parou de enviar leitura.`
        : `<strong>${offline.length} reservatórios</strong> pararam de enviar leitura.`,
      nota: "Isso não quer dizer que falta água — quer dizer que não estamos conseguindo medir. Nossa equipe é avisada automaticamente quando um sensor para de responder.",
    };
  }

  if (atencao.length) {
    return {
      estado: "atencao",
      titulo: atencao.length === 1
        ? `<strong>${nome(atencao[0])}</strong> está em ${pctDe(atencao[0])}%.`
        : `<strong>${atencao.length} reservatórios</strong> estão abaixo de ${LIMIARES.baixo}%.`,
      nota: `Abaixo de ${LIMIARES.baixo}% acompanhamos de perto. ` + notaAtendimento,
    };
  }

  return {
    estado: "normal",
    titulo: "Tudo normal no seu prédio.",
    nota: abertos.length
      ? "Os níveis estão dentro do esperado. Há atendimento em andamento — acompanhe em Chamados."
      : "Os níveis estão dentro do esperado e os sensores continuam medindo.",
  };
}

// ─── Uma coluna d'água ───────────────────────────────────────────────────
function _agoraColuna(r) {
  const u       = r.ultima_leitura;
  const pct     = u?.nivel_pct;
  const estado  = _estadoDoReservatorio(r);
  const nome    = _telCliEscapar(r.nome || "Reservatório");
  const tipo    = _telCliEscapar(r.tipo || "Reservatório");

  // A lâmina desce por transform a partir de --n. O número e a coluna saem
  // da MESMA variável, no mesmo render — coluna e leitura discordando é o
  // que destrói um instrumento.
  const n       = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const pctTxt  = estado === "offline" ? "—" : `${Math.round(n)}<small>%</small>`;

  const bomba   = u?.bomba_ligada;
  const bombaCls = bomba === true ? "on" : bomba === false ? "off" : "uk";
  const bombaTxt = bomba === true ? "Bomba ligada" : bomba === false ? "Bomba desligada" : "Bomba sem informação";

  const semLeitura = estado === "offline" && r.minutos_sem_atualizar == null;

  return `
    <div class="agora-cel" data-estado="${estado}">
      <div class="agora-cel-nome" title="${nome}">${nome}</div>
      <div class="agora-cel-tipo">${tipo}</div>
      <div class="agora-cel-corpo">
        <div class="coluna-tubo" role="img" aria-label="Nível ${estado === "offline" ? "sem leitura" : Math.round(n) + " por cento"}">
          <span class="coluna-faixa coluna-faixa-baixo"></span>
          <span class="coluna-faixa coluna-faixa-critico"></span>
          <div class="coluna-agua" style="--n:${n}%"><span class="coluna-crista"></span></div>
          <span class="coluna-marca coluna-marca-baixo"><span>${LIMIARES.baixo}</span></span>
          <span class="coluna-marca coluna-marca-critico"><span>${LIMIARES.critico}</span></span>
        </div>
        <div class="agora-leituras">
          <div>
            <div class="agora-leitura-rot">Nível</div>
            <div class="agora-leitura-val">${pctTxt}</div>
          </div>
          <div class="agora-bomba ${bombaCls}"><span class="agora-lamp"></span>${bombaTxt}</div>
          <div class="agora-leitura-rot">${semLeitura ? "Nunca enviou leitura" : _telAtualizadoTxt(u)}</div>
        </div>
      </div>
    </div>`;
}

// ─── A estação AGORA ─────────────────────────────────────────────────────
function _agoraRender(list, chamados) {
  const instr    = document.getElementById("agoraInstr");
  const colunas  = document.getElementById("agoraColunas");
  const veredito = document.getElementById("agoraVeredito");
  const nota     = document.getElementById("agoraNota");
  const idEl     = document.getElementById("agoraId");
  if (!instr || !colunas) return;

  const reservs = [...list].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const v = _predioVeredito(reservs, chamados);

  instr.dataset.estado = v.estado;
  if (veredito) veredito.innerHTML = `${v.titulo}<small>${v.nota}</small>`;
  colunas.innerHTML = reservs.map(_agoraColuna).join("");

  if (idEl) {
    idEl.textContent = reservs.length === 1
      ? "1 reservatório monitorado"
      : `${reservs.length} reservatórios monitorados`;
  }

  if (nota) {
    const ligadas = reservs.filter(r => r.ultima_leitura?.bomba_ligada === true).length;
    let ultimaIso = null;
    for (const r of reservs) {
      const c = r.ultima_leitura?.criado_em;
      if (c && (!ultimaIso || new Date(c) > new Date(ultimaIso))) ultimaIso = c;
    }
    nota.innerHTML =
      `<span>Última leitura ${ultimaIso ? _telAtualizadoTxt({ criado_em: ultimaIso }) : "—"}</span>` +
      `<span>${ligadas === 0 ? "Nenhuma bomba ligada agora" : ligadas === 1 ? "1 bomba ligada agora" : `${ligadas} bombas ligadas agora`}</span>`;
  }
}

// Relógio do instrumento. Fora do render porque é evento, não medição —
// chaveia a cada segundo e não pode arrastar o resto do painel junto.
function _agoraRelogio() {
  const el = document.getElementById("agoraRelogio");
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString("pt-BR");
}

// ─── As estações de evento ───────────────────────────────────────────────
// Material real, sem inventar nada: alertas abertos (que trazem `criado_em`)
// e o ciclo completo dos chamados (aberto → técnico → concluído).
//
// ⚠️ Alerta RESOLVIDO não entra: `/cliente/status` só devolve os abertos, e
// a linha prefere um buraco honesto a um evento fabricado. Se um dia o
// endpoint passar a devolver os resolvidos, é aqui que eles entram.
function _linhaRender(alertas, chamados, reservatorios) {
  const wrap = document.getElementById("linhaEventos");
  if (!wrap) return;

  const nomeDoDevice = d =>
    reservatorios.find(r => r.device_id === d)?.nome || d || "reservatório";

  const ev = [];

  for (const a of alertas || []) {
    const grave = a.tipo === "nivel_muito_baixo" || a.tipo === "dispositivo_offline";
    ev.push({
      ts: a.criado_em,
      tom: grave ? "critico" : "atencao",
      titulo: _alTipoLabel(a.tipo),
      sub: `${_telCliEscapar(nomeDoDevice(a.device_id))} · ainda aberto`,
    });
  }

  for (const c of chamados || []) {
    const ref = `#${c.id} — ${_telCliEscapar(c.titulo || "Chamado")}`;
    ev.push({ ts: c.criado_em, tom: "atencao", titulo: "Chamado aberto", sub: ref, ir: c.id });

    if (c.status === "fechado" && c.fechado_em) {
      ev.push({ ts: c.fechado_em, tom: "ok", titulo: "Atendimento concluído", sub: ref, ir: c.id });
    } else if (c.status === "em_atendimento") {
      ev.push({
        ts: c.atualizado_em || c.criado_em,
        tom: "atencao",
        titulo: c.tecnico_nome ? `Técnico designado — ${_telCliEscapar(c.tecnico_nome)}` : "Atendimento iniciado",
        sub: ref,
        ir: c.id,
      });
    }
    if (c.os_finalizada_em) {
      ev.push({ ts: c.os_finalizada_em, tom: "ok", titulo: "Ordem de serviço finalizada", sub: ref, ir: c.id });
    }
  }

  ev.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (!ev.length) {
    wrap.innerHTML = `<div class="linha-fim">Nada registrado ainda. Conforme o prédio for sendo monitorado e atendido, o histórico aparece aqui.</div>`;
    return;
  }

  // Agrupa por dia. O rótulo do dia é o que transforma uma lista em linha
  // do tempo — sem ele o síndico lê "há 3 dias" e não sabe qual dia foi.
  const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);

  const rotuloDoDia = (d) => {
    const dia = new Date(d); dia.setHours(0, 0, 0, 0);
    if (dia.getTime() === hoje.getTime())  return "Hoje";
    if (dia.getTime() === ontem.getTime()) return "Ontem";
    return dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  };

  const hora = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let html = "";
  let diaAtual = null;

  for (const e of ev.slice(0, 40)) {
    if (!e.ts) continue;
    const rot = rotuloDoDia(e.ts);
    if (rot !== diaAtual) {
      diaAtual = rot;
      html += `<div class="linha-dia">${rot}</div>`;
    }
    const clicavel = e.ir ? ` data-ch-ir="${e.ir}" style="cursor:pointer"` : "";
    html += `
      <div class="linha-evento is-${e.tom}"${clicavel}>
        <span class="linha-evento-titulo">${e.titulo}</span>
        <span class="linha-evento-sub">${e.sub}</span>
        <span class="linha-evento-hora">${hora(e.ts)}</span>
      </div>`;
  }

  html += `<div class="linha-fim">${ev.length > 40 ? "Mostrando os 40 registros mais recentes." : "Começo do histórico disponível."}</div>`;
  wrap.innerHTML = html;
}

// ─── As contagens do que está aberto agora ───────────────────────────────
function _predioKpis(list) {
  const el = document.getElementById("resumoGrid");
  if (!el) return;

  const offline  = list.filter(r => r.offline).length;
  const online   = list.length - offline;
  const alertas  = list.reduce((s, r) => s + (Number(r.alertas_abertos_count) || 0), 0);
  const chamados = Array.isArray(_chCliData) ? _chCliData : [];
  const abertos  = chamados.filter(c => c.status === "aberto").length;
  const emAtend  = chamados.filter(c => c.status === "em_atendimento").length;

  const kpi = (icon, val, rotulo, kindCls, irPara) => `
    <${irPara ? "button" : "div"} class="rc ${kindCls}${irPara ? "" : " rc-static"}"${irPara ? ` type="button" data-section-go="${irPara}"` : ""}>
      <div class="rc-head"><div class="rc-icon">${icon}</div><div class="rc-label">${rotulo}</div></div>
      <div class="rc-value">${val}</div>
    </${irPara ? "button" : "div"}>`;

  const ICO_WIFI  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
  const ICO_BELL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const ICO_FILE  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  const ICO_TOOL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  const ICO_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  // Sem telemetria contratada, "0 online" em verde e "0 alertas" não querem
  // dizer nada — são zeros de quem não tem o produto, não de quem está bem.
  if (list.length === 0) {
    const resolvidos = chamados.filter(c => c.status === "fechado").length;
    el.innerHTML =
      kpi(ICO_FILE,  abertos,    "Chamados abertos", abertos === 0 ? "rc-ok" : "rc-warn", "chamados") +
      kpi(ICO_TOOL,  emAtend,    "Em atendimento",   emAtend > 0 ? "rc-cyan" : "rc-neutral", "chamados") +
      kpi(ICO_CHECK, resolvidos, "Já resolvidos",    "rc-ok", "chamados");
    return;
  }

  el.innerHTML =
    kpi(ICO_WIFI, `${online}<span class="rc-sub">/${list.length}</span>`, "Reservatórios respondendo",
        offline === 0 ? "rc-ok" : (online > 0 ? "rc-warn" : "rc-bad")) +
    kpi(ICO_BELL, alertas, "Alertas ativos",   alertas === 0 ? "rc-ok" : "rc-bad", "alertas") +
    kpi(ICO_FILE, abertos, "Chamados abertos", abertos === 0 ? "rc-ok" : "rc-warn", "chamados") +
    kpi(ICO_TOOL, emAtend, "Em atendimento",   emAtend > 0 ? "rc-cyan" : "rc-neutral", "chamados");
}

// ─── Orquestrador da seção ───────────────────────────────────────────────
function _predioAtualizar(data) {
  const semTel = document.getElementById("semTelemetria");
  const linha  = document.getElementById("predioLinha");
  if (!linha || !semTel) return;

  const list     = Array.isArray(data?.reservatorios) ? data.reservatorios : [];
  const alertas  = Array.isArray(data?.alertas_abertos) ? data.alertas_abertos : [];
  const chamados = Array.isArray(_chCliData) ? _chCliData : [];

  // Quem não tem o produto ainda vê os chamados e as contagens — o painel
  // não pode virar um anúncio para quem já paga manutenção.
  const temTelemetria = list.length > 0;
  semTel.hidden = temTelemetria;
  linha.hidden  = false;

  const estAgora = document.querySelector(".linha-estacao.is-agora .agora");
  const estHist  = document.getElementById("estHistorico");
  if (estAgora) estAgora.hidden = !temTelemetria;
  if (estHist)  estHist.hidden  = !temTelemetria;

  _predioKpis(list);

  if (temTelemetria) {
    _agoraRender(list, chamados);
    _agoraRelogio();
    if (!_relogioTimer) _relogioTimer = setInterval(_agoraRelogio, 1000);
  }

  _linhaRender(alertas, chamados, list);
}
// ============================================================
// TELEMETRIA — página combinada (reservatórios + histórico)
// ============================================================

function _telCliEscapar(s) {
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function populateHistSelect() {
  const sel = document.getElementById("histReservatorio");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  _reservatorios.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.device_id;
    opt.textContent = `${r.nome} (${r.tipo || r.device_id})`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

async function carregarHistorico() {
  const sel    = document.getElementById("histReservatorio");
  const wrapEl = document.getElementById("telCliHistChart");
  const semEl  = document.getElementById("telCliHistEmpty");
  const btnPdf = document.getElementById("btnExportarPDF");
  if (!sel || !sel.value || !wrapEl) return;

  const device_id = sel.value;
  if (semEl) semEl.style.display = "none";
  if (btnPdf) btnPdf.disabled = true;

  try {
    const r = await fetch(`/cliente/historico?device_id=${encodeURIComponent(device_id)}&dias=${_histDias}`, {
      headers: authHeaders(),
    });
    if (!r.ok) {
      if (r.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login?motivo=expirado";
        return;
      }
      if (semEl) {
        semEl.style.display = "block";
        semEl.textContent = "Erro ao carregar histórico (" + r.status + "): " + await _erroDaResposta(r);
      }
      return;
    }

    const data = await r.json();
    const leituras = Array.isArray(data.leituras) ? data.leituras : [];

    if (leituras.length === 0) {
      if (semEl) { semEl.style.display = "block"; semEl.textContent = "Sem dados de histórico no período."; }
      if (_telCliHistChart) { try { _telCliHistChart.destroy(); } catch (_) {} _telCliHistChart = null; }
      wrapEl.innerHTML = "";
      return;
    }
    if (semEl) semEl.style.display = "none";
    if (btnPdf) btnPdf.disabled = false;

    // Nome do reservatório selecionado pra título da série
    const reservNome = (sel.options[sel.selectedIndex]?.text || "Nível").split(" (")[0];

    const series = [{
      name: reservNome,
      data: leituras.map(l => ({ x: new Date(l.bucket).getTime(), y: Math.round(Number(l.nivel_pct_avg)) })),
    }];

    // ⚠️ O gráfico agora vive dentro de PLACA CLARA, não mais no fundo escuro
    // do Mission Control. Eixos, grade e tooltip são de tema claro; a série
    // usa o marinho da lâmina d'água, e as linhas de limiar usam as tintas
    // escuras — amarelo sobre claro reprova contraste (Regra do Amarelo Cego).
    const opts = {
      chart: { type: "area", height: 300, toolbar: { show: false }, background: "transparent", animations: { speed: 300 }, zoom: { enabled: false }, fontFamily: "Archivo, sans-serif" },
      series,
      colors: ["#1a3a9e"],
      stroke: { curve: "smooth", width: 2.4 },
      fill: {
        type: "gradient",
        gradient: { shade: "light", type: "vertical", shadeIntensity: .2, opacityFrom: .34, opacityTo: 0, stops: [0, 92] },
      },
      dataLabels: { enabled: false },
      grid: { borderColor: "rgba(6,16,51,.12)", strokeDashArray: 3 },
      xaxis: {
        type: "datetime",
        labels: { style: { colors: "#414f74", fontSize: "11px" }, datetimeUTC: false },
        axisBorder: { color: "rgba(6,16,51,.16)" },
        axisTicks:  { color: "rgba(6,16,51,.16)" },
      },
      yaxis: {
        min: 0, max: 100,
        labels: { style: { colors: "#414f74", fontSize: "11px" }, formatter: (v) => v + "%" },
      },
      legend: { show: false },
      annotations: {
        yaxis: [
          { y: LIMIARES.baixo,   borderColor: "#8a5300", strokeDashArray: 4, label: { borderColor: "#8a5300", style: { color: "#fff", background: "#8a5300", fontSize: "10px" }, text: `Atenção ${LIMIARES.baixo}%` } },
          { y: LIMIARES.critico, borderColor: "#b3241a", strokeDashArray: 4, label: { borderColor: "#b3241a", style: { color: "#fff", background: "#b3241a", fontSize: "10px" }, text: `Crítico ${LIMIARES.critico}%` } },
        ],
      },
      tooltip: {
        theme: "light",
        x: { format: _histDias <= 1 ? "HH:mm" : "dd MMM HH:mm" },
        y: { formatter: (v) => v + "%" },
      },
      markers: { size: 0, hover: { size: 5 } },
    };

    if (_telCliHistChart) {
      _telCliHistChart.updateOptions(opts, false, true);
    } else {
      wrapEl.innerHTML = "";
      _telCliHistChart = new ApexCharts(wrapEl, opts);
      _telCliHistChart.render();
    }
  } catch (e) {
    console.error("carregarHistorico:", e);
    if (semEl) { semEl.style.display = "block"; semEl.textContent = "Erro: " + e.message; }
  }
}

async function carregar() {
  setStatusMsg("Carregando...");

  // Carrega status e chamados em paralelo para o dashboard ter ambos disponíveis
  const [r] = await Promise.all([
    fetch("/cliente/status",   { headers: authHeaders() }),
    carregarChamadosCli().catch(() => {}),
  ]);

  if (!r.ok) {
    // 401 = sessão expirada/inválida → volta pro login.
    // 403 NÃO é sessão inválida: é role diferente de 'cliente' ou cliente sem
    // condominio_id vinculado. Mandar 403 pro login criava um vai-e-volta
    // silencioso (login → painel → login) sem nenhuma mensagem na tela.
    if (r.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login?motivo=expirado";
      return;
    }
    setStatusMsg("Erro no /cliente/status (" + r.status + "): " + await _erroDaResposta(r));
    return;
  }

  const data = await r.json();

  
  const reservatorios = Array.isArray(data.reservatorios) ? data.reservatorios : [];
  _reservatorios = reservatorios;
  populateHistSelect();

  // ===== Alertas =====
  _alAlertas = Array.isArray(data.alertas_abertos) ? data.alertas_abertos : [];

  // Nome real do condomínio no topo e na sidebar — antes ficava o placeholder
  // "Cliente / Meu Condomínio" fixo no HTML, igual pra todo mundo.
  _aplicarIdentidade(data.condominio);

  // ===== Meu prédio =====
  // Uma seção só. O `_predioAtualizar` decide entre o trilho com instrumento
  // e o bloco de quem ainda não tem monitoramento instalado.
  _telCliUltimoStatus = data;
  _predioAtualizar(data);

  // atualiza badge da sidebar
  const navBadge = document.getElementById("navBadgeAlertas");
  if (navBadge) {
    navBadge.textContent = _alAlertas.length;
    navBadge.style.display = _alAlertas.length > 0 ? "inline-flex" : "none";
  }

  _alBindEventos();
  _alRender();

  setStatusMsg("Atualizado às " + new Date().toLocaleTimeString());
}

// ============================================================
// ALERTAS (modelo novo Mission Control)
// ============================================================

function _alSeveridade(tipo) {
  if (tipo === "nivel_muito_baixo" || tipo === "dispositivo_offline") return "critico";
  if (tipo === "nivel_baixo") return "atencao";
  return "normal";
}

function _alSeveridadeLabel(sev) {
  if (sev === "critico") return "Crítico";
  if (sev === "atencao") return "Atenção";
  return "Normal";
}

function _alTipoLabel(tipo) {
  if (tipo === "nivel_muito_baixo")   return "Nível muito baixo";
  if (tipo === "nivel_baixo")         return "Nível baixo";
  if (tipo === "dispositivo_offline") return "Dispositivo offline";
  return String(tipo || "").replaceAll("_", " ");
}

function _alTempoAberto(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "—";
  const min = Math.floor(diff / 60000);
  if (min < 60)   return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

function _alFiltrados() {
  const q = (document.getElementById("alBusca")?.value || "").trim().toLowerCase();
  let lista = [..._alAlertas];

  if (_alTabAtiva !== "todos") {
    lista = lista.filter(a => _alSeveridade(a.tipo) === _alTabAtiva);
  }
  if (q) {
    lista = lista.filter(a => {
      const blob = `${_alTipoLabel(a.tipo)} ${a.mensagem || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }
  return lista;
}

function _alRender() {
  const tbody = document.getElementById("tbodyAlertasCliente");
  const sem   = document.getElementById("semAlertas");
  if (!tbody) return;

  // KPIs
  const criticos = _alAlertas.filter(a => _alSeveridade(a.tipo) === "critico").length;
  const atencao  = _alAlertas.filter(a => _alSeveridade(a.tipo) === "atencao").length;
  const total    = _alAlertas.length;

  const kpiGrid = document.getElementById("alKpiGrid");
  if (kpiGrid) kpiGrid.innerHTML = `
    <div class="rc rc-bad rc-static">
      <div class="rc-head"><div class="rc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><div class="rc-label">Críticos</div></div>
      <div class="rc-value">${criticos}</div><div class="rc-hint">Ativos agora</div>
    </div>
    <div class="rc rc-warn rc-static">
      <div class="rc-head"><div class="rc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></div><div class="rc-label">Atenção</div></div>
      <div class="rc-value">${atencao}</div><div class="rc-hint">Ativos agora</div>
    </div>
    <div class="rc rc-neutral rc-static">
      <div class="rc-head"><div class="rc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="rc-label">Total</div></div>
      <div class="rc-value">${total}</div><div class="rc-hint">Abertos no momento</div>
    </div>`;

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("alCountTodos",    total);
  set("alCountCritico",  criticos);
  set("alCountAtencao",  atencao);

  // Tabela
  const lista = _alFiltrados();
  if (lista.length === 0) {
    tbody.innerHTML = "";
    if (sem) sem.style.display = "flex";
    return;
  }
  if (sem) sem.style.display = "none";

  tbody.innerHTML = lista.map(a => {
    const sev = _alSeveridade(a.tipo);
    const sel = _alSelecionadoId === a.id ? " is-selected" : "";
    return `<tr class="${sel.trim()}" data-al-id="${a.id}" style="cursor:pointer;">
      <td><strong>${_alTipoLabel(a.tipo)}</strong></td>
      <td>${a.mensagem ? a.mensagem.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])) : "—"}</td>
      <td><span class="al-sev ${sev}">${_alSeveridadeLabel(sev)}</span></td>
      <td class="al-tempo">${_alTempoAberto(a.criado_em)}</td>
      <td class="al-data">${fmtData(a.atualizado_em)}</td>
    </tr>`;
  }).join("");

  // Mantém o painel em sincronia (alerta selecionado pode ter sumido)
  _alRenderPainel();
}

function _alAchaPorId(id) {
  return _alAlertas.find(a => a.id === id) || null;
}

function _alReservatorioPorDevice(deviceId) {
  if (!deviceId || !Array.isArray(_reservatorios)) return null;
  return _reservatorios.find(r => r.device_id === deviceId) || null;
}

function _alRenderPainel() {
  const wrap = document.getElementById("alPainel");
  if (!wrap) return;

  wrap.classList.toggle("is-open", _alSelecionadoId != null);

  if (_alSelecionadoId == null) {
    wrap.innerHTML = `
      <div class="al-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Clique numa linha pra ver os detalhes</p>
      </div>`;
    return;
  }

  const a = _alAchaPorId(_alSelecionadoId);
  if (!a) {
    _alSelecionadoId = null;
    return _alRenderPainel();
  }

  const sev = _alSeveridade(a.tipo);
  const sevLabel = _alSeveridadeLabel(sev);
  const reserv = _alReservatorioPorDevice(a.device_id);
  const pct = reserv?.ultima_leitura?.nivel_pct;

  const kv = (k, v) => `<div><span class="k">${k}</span><span class="v">${v != null && v !== "" ? v : "—"}</span></div>`;

  const banner = reserv ? `
    <div class="ap-banner ${sev}">
      <div class="ap-banner-row">
        ${pct != null ? `
        <div class="ap-gauge-mini">
          <svg viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
            <circle cx="30" cy="30" r="26" fill="none"
              stroke="${sev === "critico" ? "#ef4444" : sev === "atencao" ? "#f59e0b" : "#10b981"}"
              stroke-width="6" stroke-linecap="round"
              stroke-dasharray="${(Math.max(0, Math.min(100, pct)) / 100 * 163.36).toFixed(1)} 163.36"
              transform="rotate(-90 30 30)"/>
          </svg>
          <div class="ap-gauge-mini-val"><div>${Math.round(pct)}%</div><small>Nível</small></div>
        </div>` : ""}
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;">Reservatório</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${reserv.nome || "—"}</div>
          ${reserv.tipo ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">${reserv.tipo}</div>` : ""}
        </div>
      </div>
    </div>` : "";

  const tempoStr = `Aberto há ${_alTempoAberto(a.criado_em)}`;

  wrap.innerHTML = `
    <div class="ap-head">
      <div>
        <div class="ap-title">${_alTipoLabel(a.tipo)}</div>
        <div class="ap-sub">Alerta #${a.id}${reserv?.nome ? ` • ${reserv.nome}` : ""}</div>
      </div>
      <button class="ap-close" data-al-action="fechar-painel" title="Fechar">×</button>
    </div>
    ${banner}
    <div class="ap-section">
      <div class="ap-section-title">Detalhes</div>
      <div class="ap-kv">
        ${kv("Severidade", `<span class="al-sev ${sev}" style="font-size:10.5px;">${sevLabel}</span>`)}
        ${kv("Tipo", _alTipoLabel(a.tipo))}
        ${kv("Device", a.device_id || "—")}
        ${kv("Status", "Aberto")}
      </div>
      ${a.mensagem ? `<div style="margin-top:10px;font-size:11.5px;color:var(--muted);">${a.mensagem.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</div>` : ""}
    </div>
    <div class="ap-section">
      <div class="ap-section-title">Linha do tempo</div>
      <div style="font-size:11.5px;color:var(--text);">Criado em ${fmtData(a.criado_em)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">${tempoStr}</div>
      ${a.atualizado_em && a.atualizado_em !== a.criado_em ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;">Última atualização: ${fmtData(a.atualizado_em)}</div>` : ""}
    </div>`;
}

function _alBindEventos() {
  if (_alBindFeito) return;
  _alBindFeito = true;

  // Tabs
  document.querySelectorAll(".al-tab[data-al-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      _alTabAtiva = tab.dataset.alTab;
      document.querySelectorAll(".al-tab[data-al-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      _alRender();
    });
  });

  // KPI cards clicáveis filtram a tab
  document.querySelectorAll(".al-kpis .rc[data-al-kpi-tab]").forEach(card => {
    card.addEventListener("click", () => {
      const target = card.dataset.alKpiTab;
      const tab = document.querySelector(`.al-tab[data-al-tab="${target}"]`);
      if (tab) tab.click();
    });
  });

  // Busca
  document.getElementById("alBusca")?.addEventListener("input", _alRender);
  document.getElementById("alBusca")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.target.value = ""; _alRender(); }
  });

  // Click na linha → seleciona e mostra painel
  document.getElementById("tbodyAlertasCliente")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-al-id]");
    if (!row) return;
    const id = Number(row.dataset.alId);
    _alSelecionadoId = (_alSelecionadoId === id) ? null : id; // toggle
    _alRender();
    if (_alSelecionadoId && window.innerWidth <= 768) {
      setTimeout(() => document.getElementById("alPainel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  });

  // Fechar painel
  document.getElementById("alPainel")?.addEventListener("click", (e) => {
    const close = e.target.closest('[data-al-action="fechar-painel"]');
    if (close) {
      _alSelecionadoId = null;
      _alRender();
    }
  });
}

async function trocarSenha(event) {
  event.preventDefault();

  const msg = document.getElementById("senhaMsg");
  msg.textContent = "";

  const senha_atual = (document.getElementById("senhaAtual").value || "").trim();
  const senha_nova = (document.getElementById("senhaNova").value || "").trim();
  const senha_nova2 = (document.getElementById("senhaNova2").value || "").trim();

  if (!senha_atual || !senha_nova || !senha_nova2) {
    msg.textContent = "Preencha todos os campos.";
    return;
  }
  if (senha_nova.length < 6) {
    msg.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
    return;
  }
  if (senha_nova !== senha_nova2) {
    msg.textContent = "A confirmação não confere.";
    return;
  }

  try {
    msg.textContent = "Salvando...";

    const r = await fetch("/cliente/trocar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ senha_atual, senha_nova }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      msg.textContent = data.error || ("Erro ao trocar senha (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Senha alterada com sucesso!";
    setTimeout(fecharModalSenha, 600);
  } catch (e) {
    msg.textContent = "Erro: " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // nav sections
  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    item.addEventListener("click", () => showSection(item.dataset.section));
  });

  // links internos data-section-go (ex: "Ver alertas →" no dashboard)
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-section-go]");
    if (btn) showSection(btn.dataset.sectionGo);
  });

  document.getElementById("btnAtualizarCliente")?.addEventListener("click", carregar);

  document.getElementById("btnExportarPDF")?.addEventListener("click", async () => {
    const sel = document.getElementById("histReservatorio");
    if (!sel || !sel.value) return;
    const btn = document.getElementById("btnExportarPDF");
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Gerando PDF...";
    try {
      const url = `/relatorio/pdf?device_id=${encodeURIComponent(sel.value)}&dias=${_histDias}`;
      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        alert("Erro ao gerar PDF: " + txt);
        return;
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const cd = r.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : "relatorio.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Erro ao gerar PDF: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });
  document.getElementById("btnAbrirSenha")?.addEventListener("click", abrirModalSenha);
  document.getElementById("btnSairCliente")?.addEventListener("click", logout);

  // ===== SIDEBAR TOGGLE =====
  const _sidebar = document.getElementById("sidebar");

  function _applySidebar(collapsed) {
    _sidebar.classList.toggle("collapsed", collapsed);
  }

  // Começa aberta por padrão; mantém fechada só se o usuário fechou antes
  _applySidebar(localStorage.getItem("sidebarCollapsed") === "true");

  function _onToggle() {
    const next = !_sidebar.classList.contains("collapsed");
    _applySidebar(next);
    localStorage.setItem("sidebarCollapsed", next);
  }

  document.getElementById("btnSidebarToggleIn")?.addEventListener("click", _onToggle);
  document.getElementById("btnSidebarToggleOut")?.addEventListener("click", _onToggle);

  // modal senha
  document.getElementById("btnFecharSenhaTop")?.addEventListener("click", fecharModalSenha);
  document.getElementById("btnCancelarSenha")?.addEventListener("click", fecharModalSenha);

  // submit do form (precisa ter id="formTrocarSenha")
  document.getElementById("formTrocarSenha")?.addEventListener("submit", trocarSenha);

  // Histórico: troca de reservatório
  document.getElementById("histReservatorio")?.addEventListener("change", carregarHistorico);

  // Histórico: botões de período. O rótulo da estação no trilho acompanha —
  // é ele que diz a que trecho do tempo aquela placa se refere.
  const _HIST_ROTULO = { 1: "Últimas 24 horas", 7: "Últimos 7 dias", 30: "Últimos 30 dias", 90: "Últimos 90 dias" };
  document.querySelectorAll(".tel-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tel-range-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      _histDias = Number(btn.dataset.dias);
      const rot = document.getElementById("histRotulo");
      if (rot) rot.textContent = _HIST_ROTULO[_histDias] || "Histórico";
      carregarHistorico();
    });
  });

  // Ir do evento do trilho direto para o chamado que ele conta.
  document.getElementById("linhaEventos")?.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-ch-ir]");
    if (!alvo) return;
    showSection("chamados");
    document.querySelectorAll(".mob-nav-item[data-mob-section]").forEach(b =>
      b.classList.toggle("active", b.dataset.mobSection === "chamados"));
    _chCliSelecionar(Number(alvo.dataset.chIr));
  });

  // primeira carga + auto refresh
  carregar();
  setInterval(() => {
    carregar();
    const secAtiva = document.querySelector(".section.is-active");
    if (secAtiva?.dataset.section === "predio")   carregarHistorico();
    if (secAtiva?.dataset.section === "chamados") carregarChamadosCli();
  }, 10000);
});

// ============================================================
// CHAMADOS — seção do cliente desktop
// ============================================================

let _chCliData = [];
let _chCliSelecionadoId = null;
let _chCliSelecionado = null;
let _chCliMensagens = [];
let _chCliTabAtiva = "todos";
let _chCliBindFeito = false;
let _chCliAvalNotaSelecionada = 0;

const _chCliCatNome = {
  vazamento:  "Vazamento",
  bomba_falha:"Bomba",
  nivel_baixo:"Nível baixo",
  sem_agua:   "Sem água",
  ruido:      "Ruído",
  manutencao: "Manutenção",
  outro:      "Outro",
};
const _chCliPrioNome = { baixa:"Baixa", media:"Média", alta:"Alta", emergencia:"Emergência" };
const _chCliStNome   = { aberto:"Aberto", em_atendimento:"Em atend.", fechado:"Resolvido" };

function _chCliEscapar(s) {
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function _chCliFmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function _chCliFmtDataCurta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
}

async function carregarChamadosCli() {
  try {
    const r = await fetch("/cliente/chamados", { headers: authHeaders() });
    if (!r.ok) return;
    _chCliData = await r.json();
    // Mantém detalhe sincronizado se houver selecionado
    if (_chCliSelecionadoId != null) {
      const existe = _chCliData.find(c => c.id === _chCliSelecionadoId);
      if (!existe) {
        _chCliSelecionadoId = null;
        _chCliSelecionado = null;
        _chCliMensagens = [];
      }
    }
    _chCliRender();
  } catch (e) {
    console.warn("[cli-chamados] carregar:", e.message);
  }
}

async function renderSecaoChCli() {
  if (!_chCliData.length) {
    await carregarChamadosCli();
  } else {
    _chCliRender();
  }
  _chCliBindEventos();
}

function _chCliFiltrados() {
  const q = (document.getElementById("chCliBusca")?.value || "").trim().toLowerCase();
  let lista = Array.isArray(_chCliData) ? [..._chCliData] : [];
  if (_chCliTabAtiva !== "todos") lista = lista.filter(c => c.status === _chCliTabAtiva);
  if (q) {
    lista = lista.filter(c => {
      const blob = `${c.id} ${c.titulo||""} ${c.categoria||""} ${c.descricao||""}`.toLowerCase();
      return blob.includes(q);
    });
  }
  return lista;
}

function _chCliRender() {
  const data = _chCliData;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

  const abertos  = data.filter(c => c.status === "aberto").length;
  const atend    = data.filter(c => c.status === "em_atendimento").length;
  const fechados = data.filter(c => c.status === "fechado").length;

  const kpiGrid = document.getElementById("chCliKpiGrid");
  if (kpiGrid) {
    const kpis = [
      { cls: "rc-warn", icon: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`, label: "Abertos", value: abertos, hint: "Aguardando atendimento" },
      // ⚠️ "Em atendimento" NÃO é `rc-bad`. Chamado com técnico designado é
      // boa notícia — pintá-lo de vermelho ensina o síndico a se assustar com
      // o próprio serviço funcionando.
      { cls: "rc-cyan", icon: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`, label: "Em atendimento", value: atend, hint: "Técnico designado" },
      { cls: "rc-ok",   icon: `<polyline points="20 6 9 17 4 12"/>`, label: "Resolvidos", value: fechados, hint: "Histórico" },
    ];
    kpiGrid.innerHTML = kpis.map(k => `
      <div class="rc ${k.cls} rc-static">
        <div class="rc-head">
          <div class="rc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${k.icon}</svg></div>
          <div class="rc-label">${k.label}</div>
        </div>
        <div class="rc-value">${k.value}</div>
        <div class="rc-hint">${k.hint}</div>
      </div>`).join("");
  }

  set("chCliCtTodos",    data.length);
  set("chCliCtAbertos",  abertos);
  set("chCliCtAtend",    atend);
  set("chCliCtFechados", fechados);

  // Badge na sidebar
  const navBadge = document.getElementById("navBadgeChamados");
  if (navBadge) {
    const ativos = abertos + atend;
    navBadge.textContent = ativos;
    navBadge.style.display = ativos > 0 ? "inline-flex" : "none";
  }

  const tbody = document.getElementById("chCliTableBody");
  const empty = document.getElementById("chCliEmpty");
  if (!tbody) return;
  const tableWrap = tbody.closest(".tableWrap");

  const lista = _chCliFiltrados();
  if (lista.length === 0) {
    tbody.innerHTML = "";
    if (data.length === 0) {
      if (empty) empty.style.display = "flex";
      if (tableWrap) tableWrap.style.display = "none";
    } else {
      if (empty) empty.style.display = "none";
      if (tableWrap) tableWrap.style.display = "";
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">Nenhum chamado nesse filtro.</td></tr>`;
    }
  } else {
    if (empty) empty.style.display = "none";
    if (tableWrap) tableWrap.style.display = "";
    tbody.innerHTML = lista.map(c => {
      const sel = _chCliSelecionadoId === c.id ? " is-selected" : "";
      return `<tr class="ch-row${sel}" data-ch-cli-id="${c.id}">
        <td class="ch-id-cell">#${c.id}</td>
        <td class="ch-titulo-cell"><div class="ch-titulo-text">${_chCliEscapar(c.titulo || "—")}</div></td>
        <td><span class="ch-cat-badge">${_chCliCatNome[c.categoria] || c.categoria || "—"}</span></td>
        <td><span class="ch-st ch-st-${c.status||"aberto"}">${_chCliStNome[c.status] || c.status || "—"}</span></td>
        <td class="ch-data-cell">${_chCliFmtDataCurta(c.criado_em)}</td>
      </tr>`;
    }).join("");
  }

  _chCliRenderDetalhe();
}

async function _chCliSelecionar(id) {
  _chCliSelecionadoId = id;
  _chCliSelecionado = null;
  _chCliMensagens = [];

  // Re-render lista pra marcar selecionado
  _chCliRender();

  // Busca detalhe + mensagens em paralelo
  try {
    const [chR, msR] = await Promise.all([
      fetch(`/cliente/chamados/${id}`,           { headers: authHeaders() }),
      fetch(`/cliente/chamados/${id}/mensagens`, { headers: authHeaders() }),
    ]);
    if (chR.ok) _chCliSelecionado = await chR.json();
    if (msR.ok) _chCliMensagens   = await msR.json();
  } catch (e) {
    console.warn("[cli-chamados] selecionar:", e.message);
  }
  _chCliRenderDetalhe();
}

function _chCliRenderDetalhe() {
  const col = document.getElementById("chCliDetailCol");
  if (!col) return;

  col.classList.toggle("is-open", _chCliSelecionadoId != null);

  if (_chCliSelecionadoId == null) {
    col.innerHTML = `<div class="ch-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      <p>Selecione um chamado para ver os detalhes</p>
    </div>`;
    return;
  }
  const ch = _chCliSelecionado;
  if (!ch) {
    col.innerHTML = `<div class="ch-detail-empty"><p>Carregando…</p></div>`;
    return;
  }

  // Timeline 3 passos
  const passos = ["aberto", "em_atendimento", "fechado"];
  const idx = passos.indexOf(ch.status);
  const labels = {
    aberto:         { titulo: "Chamado registrado",      data: ch.criado_em },
    em_atendimento: { titulo: ch.tecnico_nome ? `Em atendimento — ${ch.tecnico_nome}` : "Em atendimento", data: ch.atualizado_em },
    fechado:        { titulo: "Atendimento concluído",   data: ch.fechado_em },
  };
  const timelineHtml = passos.map((p, i) => {
    const ativo = i <= idx;
    const atual = i === idx && ch.status !== "fechado";
    const cls = ativo ? (atual ? "ch-tl-step-curr" : "ch-tl-step-done") : "ch-tl-step-pending";
    const lbl = labels[p];
    return `<li class="ch-tl-step ${cls}">
      <div class="ch-tl-dot"></div>
      <div class="ch-tl-content">
        <div class="ch-tl-title">${lbl.titulo}</div>
        <div class="ch-tl-data">${ativo && lbl.data ? _chCliFmtData(lbl.data) : ""}</div>
      </div>
    </li>`;
  }).join("");

  // Mensagens
  const userId = JSON.parse(localStorage.getItem("user") || "{}")?.id;
  const mensagensHtml = _chCliMensagens.length === 0
    ? `<div class="ch-chat-empty">Nenhuma mensagem ainda. Envie a primeira.</div>`
    : _chCliMensagens.map(m => {
        const mine = userId && m.autor_id === userId;
        const sideCls = mine ? "is-mine" : "is-other";
        const author = mine ? "Você" : (m.autor_nome || (m.autor_role === "tecnico" ? "Técnico" : "—"));
        const foto = m.foto_url ? `<div class="ch-chat-photo"><img src="${_chCliEscapar(m.foto_url)}" alt="Foto" /></div>` : "";
        const texto = m.texto ? `<div class="ch-chat-text">${_chCliEscapar(m.texto)}</div>` : "";
        return `<div class="ch-chat-item ${sideCls}">
          <div class="ch-chat-bubble">
            <div class="ch-chat-header">
              <span class="ch-chat-author">${_chCliEscapar(author)}</span>
              <span class="ch-chat-time">${_chCliFmtData(m.criado_em)}</span>
            </div>
            ${foto}
            ${texto}
          </div>
        </div>`;
      }).join("");

  // Bloco de avaliação (só se fechado E não avaliado)
  const podeAvaliar = ch.status === "fechado" && !ch.ja_avaliado;
  const avalBlock = podeAvaliar
    ? `<div class="ch-aval-cta">
         <div>Como foi o atendimento? Sua avaliação ajuda a melhorar o serviço.</div>
         <button class="btn btnAccent" id="chCliBtnAvaliar" type="button">Avaliar agora</button>
       </div>`
    : ch.ja_avaliado
      ? `<div class="ch-aval-cta ch-aval-done">✓ Atendimento avaliado. Obrigado!</div>`
      : "";

  // OS finalizada → mostra info
  const osBlock = ch.os_numero
    ? `<div class="ch-os-info">
         <span class="hint">Ordem de serviço:</span>
         <strong>${_chCliEscapar(ch.os_numero)}</strong>
         ${ch.os_finalizada_em ? `<small style="color:var(--muted);">Finalizada em ${_chCliFmtData(ch.os_finalizada_em)}</small>` : ""}
       </div>`
    : "";

  col.innerHTML = `
    <div class="ch-detail-head">
      <div>
        <div class="ch-detail-title">#${ch.id} — ${_chCliEscapar(ch.titulo || "—")}</div>
        <div class="ch-detail-sub">
          <span class="ch-cat-badge">${_chCliCatNome[ch.categoria] || ch.categoria || "—"}</span>
          <span class="ch-st ch-st-${ch.status||"aberto"}">${_chCliStNome[ch.status] || ch.status || "—"}</span>
        </div>
      </div>
    </div>

    <div class="ch-detail-body">
      <div class="ch-detail-section">
        <div class="ch-detail-sec-title">Descrição</div>
        <p class="ch-detail-desc">${_chCliEscapar(ch.descricao || "Sem descrição")}</p>
      </div>

      ${osBlock}

      <div class="ch-detail-section">
        <div class="ch-detail-sec-title">Linha do tempo</div>
        <ol class="ch-timeline">${timelineHtml}</ol>
      </div>

      ${avalBlock}

      <div class="ch-detail-section ch-chat-section">
        <div class="ch-detail-sec-title">Mensagens</div>
        <div class="ch-chat-list" id="chCliChatList">${mensagensHtml}</div>
        ${ch.status !== "fechado" ? `
          <div class="ch-chat-composer">
            <textarea id="chCliChatInput" class="input" rows="2" placeholder="Escreva uma mensagem para o técnico…" maxlength="2000"></textarea>
            <button class="btn btnAccent" id="chCliChatEnviar" type="button">Enviar</button>
          </div>` : ""}
      </div>
    </div>`;

  // Scroll do chat pro fim
  const list = document.getElementById("chCliChatList");
  if (list) list.scrollTop = list.scrollHeight;

  _chCliBindDetalheEventos();
}

function _chCliBindDetalheEventos() {
  document.getElementById("chCliChatEnviar")?.addEventListener("click", _chCliEnviarMensagem);
  document.getElementById("chCliChatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _chCliEnviarMensagem();
    }
  });
  document.getElementById("chCliBtnAvaliar")?.addEventListener("click", _chCliAbrirModalAvaliacao);
}

async function _chCliEnviarMensagem() {
  const inp = document.getElementById("chCliChatInput");
  const btn = document.getElementById("chCliChatEnviar");
  if (!inp || !_chCliSelecionadoId) return;
  const texto = (inp.value || "").trim();
  if (!texto) return;

  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const r = await fetch(`/cliente/chamados/${_chCliSelecionadoId}/mensagens`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro ao enviar");
    }
    inp.value = "";
    // Refetch só as mensagens
    const msR = await fetch(`/cliente/chamados/${_chCliSelecionadoId}/mensagens`, { headers: authHeaders() });
    if (msR.ok) _chCliMensagens = await msR.json();
    _chCliRenderDetalhe();
  } catch (err) {
    alert("Erro: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
  }
}

// ----- Avaliação -----
function _chCliAbrirModalAvaliacao() {
  if (!_chCliSelecionado) return;
  _chCliAvalNotaSelecionada = 0;
  document.getElementById("chCliAvalSub").textContent = `Chamado #${_chCliSelecionado.id} — ${_chCliSelecionado.titulo || ""}`;
  document.getElementById("chCliAvalComentario").value = "";
  document.getElementById("chCliAvalMsg").textContent = "";
  _chCliAtualizarEstrelas(0);
  document.getElementById("chCliAvalOverlay").style.display = "flex";
}

function _chCliFecharModalAvaliacao() {
  document.getElementById("chCliAvalOverlay").style.display = "none";
}

function _chCliAtualizarEstrelas(nota) {
  document.querySelectorAll("#chCliAvalStars .ch-star-btn").forEach(btn => {
    const n = Number(btn.dataset.nota);
    btn.classList.toggle("is-active", n <= nota);
  });
}

async function _chCliSubmitAvaliacao(event) {
  event.preventDefault();
  const msg = document.getElementById("chCliAvalMsg");
  if (!_chCliSelecionadoId) return;
  if (!_chCliAvalNotaSelecionada || _chCliAvalNotaSelecionada < 1 || _chCliAvalNotaSelecionada > 5) {
    msg.textContent = "Escolha uma nota de 1 a 5.";
    return;
  }
  const comentario = (document.getElementById("chCliAvalComentario").value || "").trim();
  msg.textContent = "Enviando…";

  try {
    const r = await fetch(`/cliente/chamados/${_chCliSelecionadoId}/avaliar`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ nota: _chCliAvalNotaSelecionada, comentario: comentario || undefined }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro ao avaliar");
    }
    _chCliFecharModalAvaliacao();
    // Refetch detalhe pro `ja_avaliado` virar true
    await _chCliSelecionar(_chCliSelecionadoId);
  } catch (err) {
    msg.textContent = "Erro: " + err.message;
  }
}

// ----- Abrir novo chamado -----
function _chCliAbrirModalNovo() {
  document.getElementById("chCliNovoCategoria").value = "";
  document.getElementById("chCliNovoDescricao").value = "";
  document.getElementById("chCliNovoMsg").textContent = "";
  document.getElementById("chCliNovoOverlay").style.display = "flex";
}

function _chCliFecharModalNovo() {
  document.getElementById("chCliNovoOverlay").style.display = "none";
}

async function _chCliSubmitNovo(event) {
  event.preventDefault();
  const msg = document.getElementById("chCliNovoMsg");
  const categoria = document.getElementById("chCliNovoCategoria").value;
  const descricao = (document.getElementById("chCliNovoDescricao").value || "").trim();

  if (!categoria) { msg.textContent = "Selecione uma categoria."; return; }
  if (descricao.length < 5) { msg.textContent = "Descreva o problema com pelo menos 5 caracteres."; return; }

  msg.textContent = "Abrindo chamado…";
  try {
    const r = await fetch("/cliente/chamados", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ categoria, descricao }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Erro ao abrir chamado");
    }
    _chCliFecharModalNovo();
    await carregarChamadosCli();
    // Vai pra tab "Abertos" e seleciona o novo
    const novo = await r.json();
    if (novo?.id) {
      _chCliTabAtiva = "aberto";
      document.querySelectorAll(".wa-tab[data-ch-cli-tab]").forEach(t => t.classList.toggle("is-active", t.dataset.chCliTab === "aberto"));
      _chCliSelecionar(novo.id);
    }
  } catch (err) {
    msg.textContent = "Erro: " + err.message;
  }
}

function _chCliBindEventos() {
  if (_chCliBindFeito) return;
  _chCliBindFeito = true;

  // Tabs
  document.querySelectorAll(".wa-tab[data-ch-cli-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      _chCliTabAtiva = tab.dataset.chCliTab;
      document.querySelectorAll(".wa-tab[data-ch-cli-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      _chCliRender();
    });
  });

  // Busca
  document.getElementById("chCliBusca")?.addEventListener("input", _chCliRender);

  // Click na linha da tabela
  document.getElementById("chCliTableBody")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-ch-cli-id]");
    if (!row) return;
    const id = Number(row.dataset.chCliId);
    _chCliSelecionar(id);
    if (window.innerWidth <= 768) {
      setTimeout(() => document.getElementById("chCliDetailCol")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  });

  // Modal abrir chamado
  document.getElementById("chCliBtnNovo")?.addEventListener("click", _chCliAbrirModalNovo);
  document.getElementById("chCliNovoFechar")?.addEventListener("click", _chCliFecharModalNovo);
  document.getElementById("chCliNovoCancelar")?.addEventListener("click", _chCliFecharModalNovo);
  document.getElementById("chCliNovoForm")?.addEventListener("submit", _chCliSubmitNovo);
  document.getElementById("chCliNovoOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "chCliNovoOverlay") _chCliFecharModalNovo();
  });

  // Modal avaliação
  document.getElementById("chCliAvalFechar")?.addEventListener("click", _chCliFecharModalAvaliacao);
  document.getElementById("chCliAvalCancelar")?.addEventListener("click", _chCliFecharModalAvaliacao);
  document.getElementById("chCliAvalForm")?.addEventListener("submit", _chCliSubmitAvaliacao);
  document.getElementById("chCliAvalOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "chCliAvalOverlay") _chCliFecharModalAvaliacao();
  });
  document.querySelectorAll("#chCliAvalStars .ch-star-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _chCliAvalNotaSelecionada = Number(btn.dataset.nota);
      _chCliAtualizarEstrelas(_chCliAvalNotaSelecionada);
    });
  });

  // Esc fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ov1 = document.getElementById("chCliNovoOverlay");
    const ov2 = document.getElementById("chCliAvalOverlay");
    if (ov1 && ov1.style.display !== "none") _chCliFecharModalNovo();
    if (ov2 && ov2.style.display !== "none") _chCliFecharModalAvaliacao();
  });
}