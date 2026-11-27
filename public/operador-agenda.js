// operador-agenda.js — Agenda do turno (/operador/painel/agenda), 27/11/2026.
//
// A quarta tela do operador. Pedido do Pedro: o turno agenda os chamados nos
// técnicos, e para isso precisa da agenda — "mas só com as visitas" e os
// chamados. É a MESMA agenda do admin (GET /agenda), que a rota filtra para o
// operador: visita ligada a chamado e retorno pedido na O.S. Reunião,
// pagamento, Omie e contrato não chegam aqui (quem barra é o servidor).
//
// O que a tela faz, no molde do Quadro do admin (admin-despacho.js):
//   · técnicos nas linhas, dias da semana nas colunas;
//   · à esquerda, a fila: chamados esperando alguém (sem técnico e sem
//     visita — a rede de segurança, ver abaixo) e o que
//     passou do dia sem ser feito (Atrasados);
//   · arrastar chamado → técnico/dia agenda a visita e atribui o técnico;
//     arrastar a visita remarca; soltar na fila desmarca. Tudo com Desfazer;
//   · círculo de feito em cada visita (a O.S. fechada no dia marca sozinha);
//   · no celular, uma lista por dia, com "Agendar" em cada chamado.
//
// ⚠️ NÃO importa nada do admin nem das telas irmãs. Mesma regra e mesmo
// motivo das outras telas do operador: compartilhar helper foi o que fez o
// painel do cliente virar refém do admin até 13/08/2026. O que se repete com
// o admin é o CONTRATO com a rota /agenda, não o código.
//
// ⚠️ DATAS EM SÃO PAULO (-03:00 fixo desde 2019), como a rota.

/* ── Sessão ──────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem("token"); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}
if (!getToken()) window.location.href = "/login";

// 401 desloga; 403 NÃO — tratar os dois igual produz o loop silencioso que
// derrubou o painel do cliente em 30/07/2026.
(function _redirectSessaoExpirada() {
  const nativo = window.fetch.bind(window);
  let indo = false;
  window.fetch = async function (input, init) {
    const r = await nativo(input, init);
    if (r.status === 401 && init?.headers?.Authorization && !indo) {
      indo = true;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("userRole");
      window.location.href = "/login?motivo=expirado";
    }
    return r;
  };
})();

// Resposta em HTML (413, 404, 502 do proxy) estoura "Unexpected token" no
// .json() e esconde o erro real. Ver CLAUDE.md.
async function lerJson(resp, contexto) {
  const txt = await resp.text();
  try { return txt ? JSON.parse(txt) : {}; }
  catch {
    console.error(`[${contexto}] resposta não-JSON (${resp.status}):`, txt.slice(0, 300));
    return { error: `O servidor respondeu ${resp.status} em vez de dados.` };
  }
}
async function api(url, metodo = "GET", corpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { ...authHeaders(), ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await lerJson(r, `${metodo} ${url}`);
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── Datas ───────────────────────────────────────────────────────────── */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
               "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DOW_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
// "AAAA-MM-DD" de um instante, no relógio de SP.
const diaSP = (d) => new Date(new Date(d).getTime() - 3 * 3600000).toISOString().slice(0, 10);
const horaSP = (d) => new Date(new Date(d).getTime() - 3 * 3600000).toISOString().slice(11, 16);
const instante = (dia, hora) => new Date(`${dia}T${hora || "00:00"}:00-03:00`).toISOString();
const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowDe = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const HOJE = () => diaSP(new Date());
const segundaDe = (iso) => somaDias(iso, -((dowDe(iso) + 6) % 7));
function rotDia(iso) {
  if (iso === HOJE()) return "hoje";
  if (iso === somaDias(HOJE(), 1)) return "amanhã";
  const [, m, d] = iso.split("-");
  return `${DOW[dowDe(iso)]} ${d}/${m}`;
}
function rotLongo(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${DOW_LONGO[dowDe(iso)]}, ${d} de ${MESES[m - 1]}`;
}
function rotSemana(ini) {
  const fim = somaDias(ini, 6);
  const [, mi, di] = ini.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  return mi === mf ? `${di} a ${df} de ${MESES[mf - 1]}` : `${di} de ${MESES[mi - 1]} a ${df} de ${MESES[mf - 1]} de ${af}`;
}

/* ── Estado ──────────────────────────────────────────────────────────── */
let SEMANA = segundaDe(HOJE());
let ITENS = [];        // GET /agenda da semana (já filtrado para o operador)
let ATRAS = [];        // o que passou sem ser feito (30 dias)
let VISITAS = {};      // chamado_id → próxima visita marcada
let FILA = [];         // chamados em aberto do turno (GET /operador/fila)
let TECS = [];
let filaAba = "agendar";
let carregou = false;
const celular = () => window.innerWidth < 900;

const feito = (it) => !!it.concluido || !!(it.chamado_id && ["fechado", "cancelado"].includes(it.chamado_status));
const marcavel = (it) => (it.fonte === "compromisso" || it.fonte === "os") && !it.concluido_auto
  && !(it.chamado_id && !it.concluido && feito(it));
const atrasado = (it) => !feito(it) && diaSP(it.inicio) < HOJE();
const repete = (it) => it.repeticao && it.repeticao !== "nenhuma";
const nomeTec = (id) => TECS.find((t) => t.id === id)?.nome || null;
// A linha da visita: o técnico do chamado; sem ele, o técnico cujo usuário é o
// responsável do compromisso (a mesma regra do Quadro do admin).
function linhaDe(it) {
  if (it.chamado_tecnico_id && TECS.some((t) => t.id === it.chamado_tecnico_id)) return it.chamado_tecnico_id;
  const t = it.responsavel_id && TECS.find((x) => x.usuario_id && Number(x.usuario_id) === Number(it.responsavel_id));
  return t ? t.id : 0;
}
// ⚠️ A FILA DAQUI É REDE DE SEGURANÇA, NÃO O CAMINHO (27/11/2026). Pedido do
// Pedro: abrir o chamado no Turno e depois vir aqui agendar era redundante. O
// caminho normal agora é o "Despachar" (e o "Novo chamado") do Turno, com
// "Quando: Agora / Outro dia". Aqui só aparece o que ficou SEM NINGUÉM: sem
// técnico e sem visita — o mesmo "Esperando alguém" do Turno. Chamado
// despachado agora, com técnico, não precisa de visita e não entra.
// Visita que passou sem ser feita também conta como "tem visita": ela está em
// Atrasados, e aparecer nas duas listas era o mesmo chamado duas vezes.
const aAgendar = () => FILA.filter((c) => !c.tecnico && !c.visita && !VISITAS[c.id]
  && !ATRAS.some((it) => it.chamado_id === c.id) && !ITENS.some((it) => it.chamado_id === c.id));
const acharItem = (id) => ITENS.find((x) => x.id === id) || ATRAS.find((x) => x.id === id);

async function carregar() {
  const ontem = somaDias(HOJE(), -1);
  const [sem, pas, fila] = await Promise.all([
    api(`/agenda?de=${SEMANA}&ate=${somaDias(SEMANA, 6)}`),
    api(`/agenda?de=${somaDias(ontem, -29)}&ate=${ontem}`),
    api("/operador/fila"),
  ]);
  ITENS = sem.itens || [];
  VISITAS = sem.visitas_chamados || {};
  ATRAS = (pas.itens || []).filter(atrasado).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  FILA = fila.fila || [];
  TECS = fila.tecnicos || [];
  carregou = true;
}

/* ── Desenho ─────────────────────────────────────────────────────────── */
const SVG_CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function circulo(it, grande = false) {
  const f = feito(it);
  const dica = it.concluido_auto ? `Feito pela ${it.concluido_os || "O.S."}` : f ? (marcavel(it) ? "Feito. Toque para reabrir" : "O chamado já foi resolvido") : "Marcar como feito";
  return `<button type="button" class="oa-ck${grande ? " is-g" : ""}${marcavel(it) ? "" : " is-auto"}"
    ${marcavel(it) ? `data-acao="feito" data-id="${escapar(it.id)}"` : 'tabindex="-1"'} aria-label="${escapar(dica)}" title="${escapar(dica)}">${SVG_CK}</button>`;
}

function chip(it) {
  const f = feito(it), at = atrasado(it);
  const arrasta = it.fonte === "compromisso" && !repete(it) && !f;
  return `<div class="oa-it${f ? " is-feito" : ""}${at ? " is-atrasado" : ""}${it.fonte === "os" ? " is-retorno" : ""}"
      data-acao="cartao" data-id="${escapar(it.id)}" role="button" tabindex="0"
      ${arrasta ? `draggable="true" data-arrasta="it:${escapar(it.id)}"` : ""}>
    ${circulo(it)}
    <span class="oa-it-corpo">
      ${it.dia_inteiro ? "" : `<span class="oa-h">${horaSP(it.inicio)}</span>`}<span class="oa-it-tit">${escapar(it.titulo)}</span>
      ${it.condominio_nome ? `<small>${escapar(it.condominio_nome)}</small>` : ""}
      ${at ? `<span class="oa-atr">Atrasado</span>` : ""}
    </span>
  </div>`;
}

function cartaoFila(c) {
  const p = String(c.prioridade || "p3").toLowerCase();
  return `<div class="oa-ch" draggable="true" data-arrasta="ch:${c.id}">
    <div class="oa-ch-l1"><span class="oa-prio is-${p}">${p.toUpperCase()}</span>${c.sla?.estourado ? `<span class="oa-fora">fora do prazo</span>` : ""}<span class="oa-esp"></span><span class="oa-num">#${c.id}</span></div>
    <b>${escapar(c.titulo || "Sem título")}</b>
    <small>${escapar(c.condominio?.nome || "Sem prédio")}${c.tecnico ? " · " + escapar(c.tecnico.nome) : " · sem técnico"}</small>
    <button type="button" class="oa-bt" data-acao="agendar" data-ch="${c.id}">Agendar</button>
  </div>`;
}

function cartaoAtrasado(it) {
  return `<div class="oa-ch is-atr" data-acao="cartao" data-id="${escapar(it.id)}" role="button" tabindex="0">
    <div class="oa-ch-l1"><span class="oa-quando">${escapar(rotDia(diaSP(it.inicio)))}${it.dia_inteiro ? "" : " · " + horaSP(it.inicio)}</span><span class="oa-esp"></span>${it.chamado_id ? `<span class="oa-num">#${it.chamado_id}</span>` : ""}</div>
    <b>${escapar(it.titulo)}</b>
    <small>${escapar([it.condominio_nome, nomeTec(linhaDe(it))].filter(Boolean).join(" · ") || "—")}</small>
    <div class="oa-ch-acoes">
      ${marcavel(it) ? `<button type="button" class="oa-bt is-ok" data-acao="feito" data-id="${escapar(it.id)}">Foi feito</button>` : ""}
      ${it.fonte === "compromisso" ? `<button type="button" class="oa-bt" data-acao="remarcar" data-id="${escapar(it.id)}">Remarcar</button>` : ""}
    </div>
  </div>`;
}

function render() {
  const tela = document.getElementById("tela");
  if (!carregou) return;
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(SEMANA, i));
  const comDom = ITENS.some((it) => diaSP(it.inicio) === dias[6]);
  const visiveis = comDom ? dias : dias.slice(0, 6);
  const visitas = ITENS.filter((it) => it.fonte === "compromisso");
  const feitas = visitas.filter(feito).length;
  const fila = aAgendar();

  const topo = `
    <div class="oa-topo">
      <h1>Agenda <b>da semana</b></h1>
      <p class="oa-lede">${visitas.length ? `${visitas.length} visita${visitas.length > 1 ? "s" : ""} marcada${visitas.length > 1 ? "s" : ""}, ${feitas} feita${feitas === 1 ? "" : "s"}.` : "Nenhuma visita marcada nesta semana."}
        ${fila.length ? ` ${fila.length} chamado${fila.length > 1 ? "s" : ""} esperando alguém.` : ""}
        ${ATRAS.length ? ` <span class="oa-alerta">${ATRAS.length > 1 ? `${ATRAS.length} passaram da data sem ser feitos.` : "1 passou da data sem ser feito."}</span>` : ""}</p>
    </div>
    <div class="oa-semana">
      <button type="button" class="oa-nav" data-acao="semana" data-passo="-1" aria-label="Semana anterior">‹</button>
      <span class="oa-semana-rot">${escapar(rotSemana(SEMANA))}</span>
      <button type="button" class="oa-nav" data-acao="semana" data-passo="1" aria-label="Próxima semana">›</button>
      ${SEMANA !== segundaDe(HOJE()) ? `<button type="button" class="oa-hoje" data-acao="semana" data-passo="0">Voltar para hoje</button>` : ""}
    </div>`;

  if (celular()) {
    tela.innerHTML = topo + renderLista(dias, fila);
    return;
  }
  const linhas = [...TECS.map((t) => ({ id: t.id, nome: t.nome })), { id: 0, nome: "Sem técnico", sub: "retornos de O.S. e visitas sem técnico" }];
  const porCel = new Map();
  for (const it of ITENS) {
    const k = `${linhaDe(it)}|${diaSP(it.inicio)}`;
    if (!porCel.has(k)) porCel.set(k, []);
    porCel.get(k).push(it);
  }
  const hoje = HOJE();
  const lista = filaAba === "atrasados" ? ATRAS.map(cartaoAtrasado) : fila.map(cartaoFila);
  tela.innerHTML = topo + `
    <div class="oa-corpo">
      <aside class="oa-fila" data-solta="fila" aria-label="${filaAba === "atrasados" ? "Passou da data" : "Chamados esperando alguém"}">
        <div class="oa-abas" role="group">
          <button type="button" data-acao="aba" data-aba="agendar" class="${filaAba === "agendar" ? "is-on" : ""}">Esperando alguém <span>${fila.length}</span></button>
          <button type="button" data-acao="aba" data-aba="atrasados" class="is-atr${filaAba === "atrasados" ? " is-on" : ""}">Atrasados <span>${ATRAS.length}</span></button>
        </div>
        ${filaAba === "atrasados" ? `<p class="oa-dica">O que passou do dia sem ser marcado como feito. Marque ou remarque: nada some sozinho.</p>` : ""}
        <div class="oa-fila-lista">${lista.length ? lista.join("") : `<p class="oa-vazio">${filaAba === "atrasados" ? "Nada atrasado." : "Nenhum chamado esperando alguém."}</p>`}</div>
      </aside>
      <div class="oa-grade-wrap">
        <div class="oa-grade" style="grid-template-columns: 170px repeat(${visiveis.length}, minmax(124px, 1fr))">
          <div class="oa-gcab oa-canto"></div>
          ${visiveis.map((d) => `<div class="oa-gcab${d === hoje ? " is-hoje" : ""}"><span>${DOW[dowDe(d)]}</span><b>${Number(d.slice(8))}</b>${d === hoje ? "<em>hoje</em>" : ""}</div>`).join("")}
          ${linhas.map((l) => {
            const meus = l.id ? visitas.filter((it) => linhaDe(it) === l.id) : [];
            return `<div class="oa-tec${l.id ? "" : " is-sem"}"><b>${escapar(l.nome)}</b><small>${l.id ? (meus.length ? `${meus.filter(feito).length} de ${meus.length} feita${meus.length > 1 ? "s" : ""}` : "nada na semana") : escapar(l.sub)}</small></div>
              ${visiveis.map((d) => {
                const its = (porCel.get(`${l.id}|${d}`) || []).sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || new Date(a.inicio) - new Date(b.inicio));
                return `<div class="oa-cel${d === hoje ? " is-hoje" : ""}${l.id ? "" : " is-sem"}" data-solta="${l.id}|${d}">${its.map(chip).join("")}</div>`;
              }).join("")}`;
          }).join("")}
        </div>
        ${!TECS.length ? `<p class="oa-vazio">Nenhum técnico ativo.</p>` : ""}
      </div>
    </div>`;
}

function renderLista(dias, fila) {
  const hoje = HOJE();
  const linha = (it, comDia) => `
    <div class="oa-li${feito(it) ? " is-feito" : ""}${atrasado(it) ? " is-atrasado" : ""}" data-acao="cartao" data-id="${escapar(it.id)}" role="button" tabindex="0">
      ${circulo(it, true)}
      <span class="oa-li-h">${comDia ? escapar(rotDia(diaSP(it.inicio))) : it.dia_inteiro ? "dia todo" : horaSP(it.inicio)}</span>
      <span class="oa-li-corpo"><b>${escapar(it.titulo)}</b>
        <small>${escapar([it.condominio_nome, nomeTec(linhaDe(it))].filter(Boolean).join(" · "))}</small></span>
    </div>`;
  const dDias = dias.filter((d) => d >= hoje || SEMANA !== segundaDe(hoje));
  return `<div class="oa-lista">
    ${ATRAS.length && SEMANA === segundaDe(hoje) ? `<section class="oa-dia is-atr"><h2>Passou da data <span>${ATRAS.length}</span></h2>${ATRAS.map((it) => linha(it, true)).join("")}</section>` : ""}
    ${fila.length ? `<section class="oa-dia"><h2>Esperando alguém <span>${fila.length}</span></h2><div class="oa-fila-cel">${fila.map(cartaoFila).join("")}</div></section>` : ""}
    ${dDias.map((d) => {
      const its = ITENS.filter((it) => diaSP(it.inicio) === d).sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || new Date(a.inicio) - new Date(b.inicio));
      const rot = d === hoje ? "Hoje" : d === somaDias(hoje, 1) ? "Amanhã" : rotLongo(d);
      return `<section class="oa-dia${d === hoje ? " is-hoje" : ""}"><h2>${escapar(rot)}${its.length ? ` <span>${its.filter(feito).length} de ${its.length} feitos</span>` : ""}</h2>
        ${its.length ? its.map((it) => linha(it, false)).join("") : `<p class="oa-vazio">Nenhuma visita.</p>`}</section>`;
    }).join("")}
  </div>`;
}

/* ── Aviso com Desfazer ──────────────────────────────────────────────── */
let _desfazer = null;
function avisar(texto, ok, desfazer) {
  document.getElementById("aviso")?.remove();
  _desfazer = desfazer || null;
  document.body.insertAdjacentHTML("beforeend",
    `<div class="aviso" id="aviso" data-t="${ok ? "ok" : "erro"}" role="${ok ? "status" : "alert"}">${escapar(texto)}${desfazer ? `<button type="button" class="aviso-acao" data-acao="desfazer">Desfazer</button>` : ""}</div>`);
  setTimeout(() => document.getElementById("aviso")?.remove(), desfazer ? 10000 : (ok ? 6000 : 8000));
}

async function recarregar() {
  try { await carregar(); } catch (e) { avisar(e.message); }
  render();
}

/* ── Gravações ───────────────────────────────────────────────────────── */
async function marcarFeito(it, valor) {
  if (it.fonte === "os") return api("/agenda/feitos", "POST", { fonte: "retorno", ref_id: it.os_id, concluido: valor });
  return api(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, concluido: valor });
}
async function alternarFeito(id) {
  const it = acharItem(id);
  if (!it || !marcavel(it)) return;
  const novo = !it.concluido;
  try { await marcarFeito(it, novo); } catch (e) { avisar(e.message); return; }
  await recarregar();
  avisar(novo ? (it.chamado_id ? `Visita feita. O #${it.chamado_id} continua aberto até a O.S.` : `Feito: ${it.titulo}`) : `Reaberto: ${it.titulo}`, true, async () => {
    try { await marcarFeito(it, !novo); } catch (e) { avisar(e.message); }
    await recarregar();
  });
}

// Primeira hora cheia livre do técnico no dia, das 8h às 17h.
function horaLivre(tecId, dia) {
  const usadas = new Set(ITENS.filter((it) => !it.dia_inteiro && linhaDe(it) === tecId && diaSP(it.inicio) === dia).map((it) => horaSP(it.inicio).slice(0, 2)));
  for (let h = 8; h <= 17; h++) { const hh = String(h).padStart(2, "0"); if (!usadas.has(hh)) return `${hh}:00`; }
  return "08:00";
}

async function agendar(chId, tecId, dia, hora) {
  const c = FILA.find((x) => x.id === chId);
  const tec = TECS.find((t) => t.id === tecId);
  if (!c) return;
  if (!tec) { avisar("Escolha a linha de um técnico para agendar o chamado."); return; }
  hora = hora || horaLivre(tecId, dia);
  const antes = c.tecnico?.id || null;
  let criado;
  try {
    criado = await api("/agenda/compromissos", "POST", {
      titulo: `#${c.id} · ${c.titulo || "Chamado"}`.slice(0, 160), tipo: "visita", inicio: instante(dia, hora),
      condominio_id: c.condominio?.id || null, chamado_id: c.id, descricao: `Visita do chamado #${c.id}`,
    });
    if (antes !== tec.id) await api(`/chamados/${c.id}`, "PATCH", { tecnico_id: tec.id });
  } catch (e) { avisar(e.message); await recarregar(); return; }
  await recarregar();
  avisar(`#${c.id} com ${tec.nome.split(" ")[0]}, ${rotDia(dia)} às ${hora}${antes !== tec.id ? ". Técnico atribuído." : ""}`, true, async () => {
    try {
      await api(`/agenda/compromissos/${criado.id}`, "DELETE");
      if (antes !== tec.id) await api(`/chamados/${c.id}`, "PATCH", { tecnico_id: antes });
    } catch (e) { avisar(e.message); }
    await recarregar();
  });
}

// Remarcar a visita (dia, hora, técnico). Visita que repete muda só esta vez.
async function remarcar(it, tecId, dia, hora) {
  const tecNovo = TECS.find((t) => t.id === tecId) || null;
  if (it.chamado_id && !tecNovo) { avisar("A visita de um chamado fica na linha de um técnico."); return; }
  const ini = it.dia_inteiro ? instante(dia, "00:00") : instante(dia, hora || horaSP(it.inicio));
  const corpo = { inicio: ini };
  if (it.fim) corpo.fim = new Date(new Date(ini).getTime() + (new Date(it.fim) - new Date(it.inicio))).toISOString();
  const tecAntes = it.chamado_tecnico_id || null;
  const antes = { inicio: it.inicio, fim: it.fim || null };
  if (ini === it.inicio && (!tecNovo || tecNovo.id === tecAntes)) return;
  try {
    if (repete(it)) await api(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, ...corpo });
    else await api(`/agenda/compromissos/${it.compromisso_id}`, "PATCH", corpo);
    if (it.chamado_id && tecNovo && tecNovo.id !== tecAntes) await api(`/chamados/${it.chamado_id}`, "PATCH", { tecnico_id: tecNovo.id });
  } catch (e) { avisar(e.message); await recarregar(); return; }
  await recarregar();
  avisar(`Remarcado: ${tecNovo ? tecNovo.nome.split(" ")[0] + ", " : ""}${rotDia(dia)}${it.dia_inteiro ? "" : " às " + (hora || horaSP(it.inicio))}`, true, async () => {
    try {
      const volta = { inicio: antes.inicio, ...(antes.fim ? { fim: antes.fim } : {}) };
      if (repete(it)) await api(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, ...volta });
      else await api(`/agenda/compromissos/${it.compromisso_id}`, "PATCH", volta);
      if (it.chamado_id && tecNovo && tecNovo.id !== tecAntes) await api(`/chamados/${it.chamado_id}`, "PATCH", { tecnico_id: tecAntes });
    } catch (e) { avisar(e.message); }
    await recarregar();
  });
}

// Desmarcar a visita: o chamado volta para "a agendar". Visita que repete:
// some só esta vez.
async function desmarcar(it) {
  try {
    if (repete(it)) await api(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, cancelada: true });
    else await api(`/agenda/compromissos/${it.compromisso_id}`, "DELETE");
  } catch (e) { avisar(e.message); return; }
  await recarregar();
  avisar(it.chamado_id ? `Visita desmarcada. O #${it.chamado_id} voltou para "a agendar".` : "Visita desmarcada.", true, async () => {
    try {
      if (repete(it)) await api(`/agenda/compromissos/${it.compromisso_id}/ocorrencia`, "POST", { ocorrencia: it.ocorrencia, cancelada: false });
      else await api("/agenda/compromissos", "POST", {
        titulo: it.titulo, tipo: "visita", inicio: it.inicio, fim: it.fim || null, dia_inteiro: !!it.dia_inteiro,
        condominio_id: it.condominio_id || null, responsavel_id: it.responsavel_id || null, chamado_id: it.chamado_id, descricao: it.descricao || null,
      });
    } catch (e) { avisar(e.message); }
    await recarregar();
  });
}

/* ── O cartão e o formulário curto ──────────────────────────────────── */
function fecharPop() { document.getElementById("oaPop")?.remove(); }
function abrirPop(html, ancora) {
  fecharPop();
  const p = document.createElement("div");
  p.id = "oaPop";
  p.className = "oa-pop";
  p.setAttribute("role", "dialog");
  p.innerHTML = html;
  document.body.appendChild(p);
  if (!ancora?.isConnected) {
    const id = ancora?.dataset?.id;
    ancora = id ? document.querySelector(`#tela [data-acao="cartao"][data-id="${CSS.escape(id)}"]`) : null;
  }
  const w = p.offsetWidth, h = p.offsetHeight;
  if (celular() || !ancora) {
    p.classList.add("is-baixo");
  } else {
    const r = ancora.getBoundingClientRect();
    let left = r.right + 8;
    if (left + w > innerWidth - 8) left = Math.max(8, r.left - w - 8);
    p.style.left = left + "px";
    p.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 8)) + "px";
  }
  p.querySelector("button, select, input")?.focus();
  return p;
}

function abrirCartao(id, ancora) {
  const it = acharItem(id);
  if (!it) return;
  const f = feito(it);
  const tec = nomeTec(linhaDe(it));
  const feitoTxt = it.concluido
    ? `${it.concluido_por_nome ? "Feito por " + escapar(it.concluido_por_nome) : "Feito"}${it.concluido_os ? " · " + escapar(it.concluido_os) : ""}`
    : f ? `O chamado #${it.chamado_id} já foi ${it.chamado_status === "cancelado" ? "cancelado" : "resolvido"}.` : "";
  abrirPop(`
    <div class="oa-pop-cab"><b>${escapar(it.titulo)}</b>${atrasado(it) ? `<span class="oa-atr">Atrasado</span>` : ""}</div>
    <dl class="oa-pop-dl">
      <dt>Quando</dt><dd>${escapar(rotLongo(diaSP(it.inicio)))}${it.dia_inteiro ? ", dia todo" : ", " + horaSP(it.inicio)}${repete(it) ? " · repete" : ""}</dd>
      ${it.condominio_nome ? `<dt>Prédio</dt><dd>${escapar(it.condominio_nome)}</dd>` : ""}
      ${it.fonte === "compromisso" ? `<dt>Técnico</dt><dd>${escapar(tec || "sem técnico")}</dd>` : ""}
    </dl>
    ${feitoTxt ? `<p class="oa-pop-feito">${feitoTxt}</p>` : ""}
    <div class="oa-pop-pe">
      ${marcavel(it) ? `<button type="button" class="oa-bt ${it.concluido ? "" : "is-ok"}" data-acao="feito" data-id="${escapar(it.id)}">${it.concluido ? "Reabrir" : "Marcar como feito"}</button>` : ""}
      ${it.fonte === "compromisso" ? `<button type="button" class="oa-bt" data-acao="remarcar" data-id="${escapar(it.id)}">Remarcar</button>` : ""}
      <span class="oa-esp"></span>
      ${it.fonte === "compromisso" ? `<button type="button" class="oa-bt is-perigo" data-acao="desmarcar" data-id="${escapar(it.id)}">Desmarcar</button>` : ""}
      <button type="button" class="oa-bt" data-acao="fechar">Fechar</button>
    </div>`, ancora);
}

function abrirForm({ chId, itemId }, ancora) {
  const it = itemId ? acharItem(itemId) : null;
  const c = chId ? FILA.find((x) => x.id === chId) : null;
  const tecAtual = it ? linhaDe(it) : (c?.tecnico?.id || TECS[0]?.id || 0);
  const hoje = HOJE();
  const dia = it ? diaSP(it.inicio) : (SEMANA > hoje ? SEMANA : hoje);
  const hora = it && !it.dia_inteiro ? horaSP(it.inicio) : horaLivre(tecAtual, dia);
  const p = abrirPop(`
    <div class="oa-pop-cab"><b>${c ? `Agendar o #${c.id}` : "Remarcar a visita"}</b></div>
    <p class="oa-pop-sub">${escapar(c ? c.titulo : it.titulo)}</p>
    <label class="oa-f">Técnico<select data-f="tec">${TECS.map((t) => `<option value="${t.id}" ${t.id === tecAtual ? "selected" : ""}>${escapar(t.nome)}</option>`).join("")}</select></label>
    <div class="oa-f2">
      <label class="oa-f">Dia<input type="date" data-f="dia" value="${dia}"></label>
      <label class="oa-f">Hora<input type="time" data-f="hora" value="${hora}" step="900" ${it?.dia_inteiro ? "disabled" : ""}></label>
    </div>
    <div class="oa-pop-pe"><span class="oa-esp"></span>
      <button type="button" class="oa-bt" data-acao="fechar">Cancelar</button>
      <button type="button" class="btn" data-acao="salvar-form">${c ? "Agendar" : "Salvar"}</button></div>`, ancora);
  p._salvar = () => {
    const tecId = Number(p.querySelector('[data-f="tec"]').value);
    const d = p.querySelector('[data-f="dia"]').value;
    const h = p.querySelector('[data-f="hora"]').value || "08:00";
    if (!d) return;
    fecharPop();
    if (c) return agendar(c.id, tecId, d, h);
    return remarcar(it, tecId, d, h);
  };
}

function abrirAjuda(ancora) {
  abrirPop(`
    <div class="oa-pop-cab"><b>Como usar a agenda</b></div>
    <ul class="oa-ajuda">
      <li><b>Agendar</b>: no Turno, ao despachar ou abrir um chamado, escolha <b>Outro dia</b>: a visita já entra aqui. O que ficou sem ninguém aparece em "Esperando alguém": arraste para o técnico e o dia, ou toque em "Agendar".</li>
      <li><b>Remarcar</b>: arraste a visita para outro dia ou técnico. Ou toque na visita.</li>
      <li><b>Feito</b>: toque no círculo. Quando o técnico fecha a O.S. no dia, ela se marca sozinha.</li>
      <li><b>Atrasados</b>: o que passou do dia sem ser feito. Marque ou remarque.</li>
      <li>Errou? Toda ação mostra "Desfazer" embaixo, por alguns segundos.</li>
    </ul>
    <div class="oa-pop-pe"><span class="oa-esp"></span><button type="button" class="oa-bt" data-acao="fechar">Entendi</button></div>`, ancora);
}

/* ── Eventos ─────────────────────────────────────────────────────────── */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-acao]");
  if (!el) {
    if (!e.target.closest("#oaPop")) fecharPop();
    return;
  }
  const acao = el.dataset.acao;
  if (acao === "feito") { e.stopPropagation(); fecharPop(); return alternarFeito(el.dataset.id); }
  if (acao === "cartao") return abrirCartao(el.dataset.id, el);
  if (acao === "fechar") return fecharPop();
  if (acao === "desfazer") { document.getElementById("aviso")?.remove(); const f = _desfazer; _desfazer = null; return f && f(); }
  if (acao === "aba") { filaAba = el.dataset.aba; return render(); }
  if (acao === "agendar") { e.stopPropagation(); return abrirForm({ chId: Number(el.dataset.ch) }, el); }
  if (acao === "remarcar") { e.stopPropagation(); return abrirForm({ itemId: el.dataset.id }, el.closest("[data-acao=cartao]") || el); }
  if (acao === "desmarcar") { fecharPop(); const it = acharItem(el.dataset.id); return it && desmarcar(it); }
  if (acao === "salvar-form") return document.getElementById("oaPop")?._salvar?.();
  if (acao === "ajuda") return abrirAjuda(el);
  if (acao === "semana") {
    const n = Number(el.dataset.passo);
    SEMANA = n === 0 ? segundaDe(HOJE()) : somaDias(SEMANA, 7 * n);
    try { await carregar(); } catch (err) { avisar(err.message); }
    return render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return fecharPop();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[data-acao="cartao"]')) { e.preventDefault(); e.target.click(); }
});

// Arrastar e soltar (só no computador; no celular o "Agendar" e o cartão
// fazem o mesmo).
let arrastando = null;
document.addEventListener("dragstart", (e) => {
  const el = e.target.closest?.("[data-arrasta]");
  if (!el) return;
  arrastando = el.dataset.arrasta;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", arrastando);
  el.classList.add("is-arrastando");
  fecharPop();
});
document.addEventListener("dragend", (e) => {
  e.target.closest?.("[data-arrasta]")?.classList.remove("is-arrastando");
  document.querySelectorAll(".is-sobre").forEach((x) => x.classList.remove("is-sobre"));
  arrastando = null;
});
document.addEventListener("dragover", (e) => {
  const alvo = e.target.closest?.("[data-solta]");
  if (!alvo || !arrastando) return;
  const d = alvo.dataset.solta;
  // Chamado não volta para a fila nem cai na linha "Sem técnico"; visita não
  // vai para "Sem técnico" (ficaria sem quem vá).
  if (d.startsWith("0|") || (arrastando.startsWith("ch:") && d === "fila")) return;
  e.preventDefault();
  document.querySelectorAll(".is-sobre").forEach((x) => x !== alvo && x.classList.remove("is-sobre"));
  alvo.classList.add("is-sobre");
});
document.addEventListener("dragleave", (e) => {
  const alvo = e.target.closest?.("[data-solta]");
  if (alvo && !alvo.contains(e.relatedTarget)) alvo.classList.remove("is-sobre");
});
document.addEventListener("drop", (e) => {
  const alvo = e.target.closest?.("[data-solta]");
  if (!alvo || !arrastando) return;
  e.preventDefault();
  alvo.classList.remove("is-sobre");
  const quem = arrastando;
  arrastando = null;
  const d = alvo.dataset.solta;
  if (quem.startsWith("ch:")) {
    const [tec, dia] = d.split("|");
    return agendar(Number(quem.slice(3)), Number(tec), dia);
  }
  const it = acharItem(quem.slice(3));
  if (!it) return;
  if (d === "fila") return desmarcar(it);
  const [tec, dia] = d.split("|");
  if (dia === diaSP(it.inicio) && Number(tec) === linhaDe(it)) return;
  return remarcar(it, Number(tec), dia, null);
});

// Celular ↔ computador: a tela troca de forma ao girar ou redimensionar.
let _eraCelular = celular();
window.addEventListener("resize", () => { if (celular() !== _eraCelular) { _eraCelular = celular(); render(); } });

// A barra endurece ao rolar: mesmo limiar (12px) e mesma classe das irmãs.
function _barraRolada() {
  document.querySelector(".barra")?.classList.toggle("is-rolada", window.scrollY > 12);
}
addEventListener("scroll", _barraRolada, { passive: true });
_barraRolada();

/* ── Início ──────────────────────────────────────────────────────────── */
(async function iniciar() {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const eu = document.getElementById("barraEu");
    if (eu && u.nome) eu.textContent = u.nome;
  } catch { /* nome é enfeite; a tela não depende dele */ }
  document.getElementById("btnSair")?.addEventListener("click", () => {
    localStorage.removeItem("token"); localStorage.removeItem("user"); localStorage.removeItem("userRole");
    window.location.href = "/login";
  });
  try {
    await carregar();
    render();
  } catch (e) {
    document.getElementById("tela").innerHTML = `<div class="carregando">Não consegui carregar a agenda: ${escapar(e.message)}</div>`;
  }
  // A agenda muda pelo escritório e pelo app do técnico: atualiza a cada 60 s,
  // sem atropelar quem está com um cartão aberto ou arrastando.
  setInterval(async () => {
    if (document.hidden || arrastando || document.getElementById("oaPop")) return;
    try { await carregar(); render(); } catch { /* a próxima volta tenta de novo */ }
  }, 60000);
})();
