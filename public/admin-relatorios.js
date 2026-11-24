// ============================================================
// RELATÓRIOS — o dashboard de gestão (redesenho do admin, 20/11/2026)
// ============================================================
//
// Maquete aprovada pelo Pedro em 20/11/2026 (/dev/_redesenho-preview.html
// #/relatorios). Quem olha é ele, toda semana ou mês: abre no mês corrente
// contra o anterior, em quatro áreas — atendimento e prazo, dinheiro,
// técnicos, prédios e equipamentos. Os números vêm prontos de
// GET /relatorios/dashboard; as réguas de cada um estão na rota e em
// docs/modulos/relatorios-dashboard.md.
//
// ⚠️ EXPORTAR SAIU DAQUI (decisão do Pedro, 20/11/2026): cada lista tem o
// seu botão, com o filtro da tela. A seção antiga (painel ao vivo + exportar)
// segue só no painel de antes (public/legado/).
//
// Gráficos em SVG na própria página, sem biblioteca: uma série é uma cor só,
// com o mês atual cheio e só ele com rótulo; contratos e O.S. são duas cores
// com legenda (par validado para daltonismo, ΔE 33). Todo número leva à lista.
// Sem crase dentro dos templates abaixo (CLAUDE.md).

(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icones = raiz => window.lucide?.createIcons?.({ root: raiz });
  const MES_C = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MES_L = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const PERIODOS = [["mes", "Este mês"], ["ant", "Mês passado"], ["tri", "Trimestre"], ["ano", "12 meses"]];
  const TIPO_ALERTA = { nivel_muito_baixo: "nível muito baixo", nivel_baixo: "nível baixo", dispositivo_offline: "sem sinal", extravasamento: "extravasamento" };

  const st = { periodo: "mes", dados: null, carregando: false, erro: false, pedido: 0 };

  // ===== formatos =====
  const num = v => Number(v || 0).toLocaleString("pt-BR");
  const mil = v => {
    const n = Number(v || 0);
    if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
    if (n >= 1e3) return `R$ ${(n / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };
  const milCurto = v => (Number(v || 0) / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const duracao = min => {
    if (min == null) return "—";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    if (h >= 48) return `${Math.round(min / 1440)} dias`;
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  };
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const dataBR = iso => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d }; };
  const menosUmDia = iso => { const [y, m, d] = iso.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d - 1)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };

  // "novembro de 2026", "1 a 20 de outubro", "set a nov de 2026"
  function rotulo(ini, fimExcl) {
    const a = dataBR(ini), b = menosUmDia(fimExcl);
    const mesInteiro = a.d === 1 && menosUmDia(fimExcl).d === new Date(Date.UTC(b.y, b.m, 0)).getUTCDate();
    if (a.y === b.y && a.m === b.m) return mesInteiro ? `${MES_L[a.m - 1]} de ${a.y}` : `${a.d} a ${b.d} de ${MES_L[a.m - 1]}`;
    const fimTxt = mesInteiro ? MES_C[b.m - 1] : `${b.d} de ${MES_C[b.m - 1]}`;
    return a.y === b.y ? `${MES_C[a.m - 1]} a ${fimTxt} de ${b.y}` : `${MES_C[a.m - 1]}/${String(a.y).slice(2)} a ${fimTxt}/${String(b.y).slice(2)}`;
  }

  // variação: em contagem e dinheiro, %; em taxa, pontos percentuais
  function delta(atual, antes, { menorMelhor = false, pp = false } = {}) {
    if (atual == null || antes == null) return `<span class="rd-kd">sem base</span>`;
    let v;
    if (pp) v = Math.round(atual - antes);
    else { if (!antes) return atual ? `<span class="rd-kd">sem base</span>` : `<span class="rd-kd">igual</span>`; v = Math.round((100 * (atual - antes)) / antes); }
    if (!v) return `<span class="rd-kd">igual</span>`;
    const bom = menorMelhor ? v < 0 : v > 0;
    return `<span class="rd-kd ${bom ? "is-bom" : "is-mau"}">${ico(v > 0 ? "arrow-up-right" : "arrow-down-right")}${Math.abs(v)}${pp ? " p.p." : "%"}</span>`;
  }

  // ===== gráficos =====
  const coluna = (x, base, h, w) => h <= 0 ? "" : h < 4
    ? `M${x},${base} v${-h} h${w} v${h} z`
    : `M${x},${base} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z`;
  const mesDe = s => MES_C[Number(s.slice(5, 7)) - 1];

  function barras(serie, alto = 120) {
    const w = 600, vals = serie.map(s => s.chamados), max = Math.max(1, ...vals) * 1.15, bw = w / vals.length, bwi = bw * .56;
    return `<svg class="rd-gf" viewBox="0 0 ${w} ${alto + 22}" role="img" aria-label="Chamados abertos nos últimos 12 meses">
      <line x1="0" x2="${w}" y1="${alto / 2}" y2="${alto / 2}" class="rd-gl"/>
      <line x1="0" x2="${w}" y1="${alto}" y2="${alto}" class="rd-base"/>
      ${serie.map((s, i) => { const h = (alto * s.chamados) / max, x = i * bw + bw * .22, ult = i === serie.length - 1;
        return `<g class="rd-m"><rect x="${i * bw}" y="0" width="${bw}" height="${alto + 22}" class="rd-alvo"><title>${mesDe(s.mes)}/${s.mes.slice(2, 4)}: ${s.chamados} chamado${s.chamados === 1 ? "" : "s"}${s.prazo_pct != null ? ` · ${s.prazo_pct}% no prazo` : ""}</title></rect>
          <path d="${coluna(x, alto, h, bwi)}" class="rd-b${ult ? " is-ult" : ""}"/>
          ${ult ? `<text x="${x + bwi / 2}" y="${alto - h - 6}" class="rd-v">${s.chamados}</text>` : ""}
          <text x="${i * bw + bw / 2}" y="${alto + 16}" class="rd-x">${mesDe(s.mes)}</text></g>`; }).join("")}
    </svg>`;
  }

  function empilhado(serie, alto = 120) {
    const w = 600, tot = serie.map(s => s.fat_contratos + s.fat_os), max = Math.max(1, ...tot) * 1.12, bw = w / serie.length, bwi = bw * .56;
    return `<svg class="rd-gf" viewBox="0 0 ${w} ${alto + 22}" role="img" aria-label="Faturado por mês, contratos e O.S.">
      <line x1="0" x2="${w}" y1="${alto}" y2="${alto}" class="rd-base"/>
      ${serie.map((s, i) => { const ha = (alto * s.fat_contratos) / max, hb = (alto * s.fat_os) / max, x = i * bw + bw * .22, ult = i === serie.length - 1;
        return `<g class="rd-m"><rect x="${i * bw}" y="0" width="${bw}" height="${alto + 22}" class="rd-alvo"><title>${mesDe(s.mes)}/${s.mes.slice(2, 4)}: ${mil(tot[i])} (contratos ${mil(s.fat_contratos)} · O.S. ${mil(s.fat_os)})</title></rect>
          ${hb > 0 ? `<rect x="${x}" y="${alto - ha}" width="${bwi}" height="${ha}" class="rd-s1"/><path d="${coluna(x, alto - ha - (ha > 0 ? 2 : 0), Math.max(0, hb - (ha > 0 ? 2 : 0)), bwi)}" class="rd-s2"/>`
            : `<path d="${coluna(x, alto, ha, bwi)}" class="rd-s1"/>`}
          ${ult && tot[i] ? `<text x="${x + bwi / 2}" y="${alto - ha - hb - 6}" class="rd-v">${milCurto(tot[i])}</text>` : ""}
          <text x="${i * bw + bw / 2}" y="${alto + 16}" class="rd-x">${mesDe(s.mes)}</text></g>`; }).join("")}
    </svg>`;
  }

  const medidor = (f, p) => `<span class="rd-med"><span style="width:${p ? Math.round((100 * f) / p) : 0}%"></span></span>`;
  const linkCondo = (id, nome) => `<a class="rd-lk" href="#/condominios/${id}">${esc(nome)}</a>`;
  const vazio = t => `<p class="rd-vazio">${t}</p>`;
  const bloco = (t, sub, corpo, link) => `<section class="rd-bl"><header><h2>${t}</h2>${sub ? `<span class="rd-sub">${sub}</span>` : ""}<span class="rd-esp"></span>${link ? `<a class="rd-lk rd-ir" href="${link[1]}">${link[0]}${ico("arrow-right")}</a>` : ""}</header>${corpo}</section>`;

  // ===== blocos =====
  function faixa(d) {
    const a = d.atual, b = d.anterior, antTxt = rotulo(d.periodo.antIni, d.periodo.antFim);
    const pa = pct(a.prazo_ok, a.prazo_decididos), pb = pct(b.prazo_ok, b.prazo_decididos);
    const oa = pct(a.orc_aprovados, a.orc_enviados), ob = pct(b.orc_aprovados, b.orc_enviados);
    const va = pct(a.prev_feitas, a.prev_previstas), vb = pct(b.prev_feitas, b.prev_previstas);
    const k = [
      ["Chamados abertos", num(a.chamados), delta(a.chamados, b.chamados, { menorMelhor: true }), `${num(b.chamados)} em ${antTxt}`, "#/atendimento", "Chamados corretivos abertos no período (preventiva e cancelado não entram)"],
      ["Tempo até atender", duracao(a.atender_min), delta(a.atender_min, b.atender_min, { menorMelhor: true }), `${duracao(b.atender_min)} em ${antTxt}`, "#/atendimento", "Mediana, do chamado aberto ao técnico no local"],
      ["Dentro do prazo", pa == null ? "—" : `${pa}%`, delta(pa, pb, { pp: true }), `${a.prazo_ok} de ${a.prazo_decididos} · ${pb == null ? "—" : pb + "%"} antes`, "#/atendimento", "Chegada do técnico dentro do prazo da prioridade (cláusula 7)"],
    ];
    if (d.dinheiro) {
      const fa = a.fat_contratos + a.fat_os, fb = b.fat_contratos + b.fat_os;
      k.push(["Faturado", mil(fa), delta(fa, fb), `${mil(fb)} em ${antTxt}`, "#/financeiro", "Notas de contrato (Omie) e de orçamento emitidas no período"]);
    }
    k.push(
      ["Orçamentos aprovados", oa == null ? "—" : `${oa}%`, delta(oa, ob, { pp: true }), `${a.orc_aprovados} de ${a.orc_enviados} enviados`, "#/orcamentos", "Dos orçamentos enviados no período, quantos o cliente aprovou"],
      ["Preventivas feitas", va == null ? "—" : `${va}%`, delta(va, vb, { pp: true }), `${a.prev_feitas} de ${a.prev_previstas} previstas`, "#/planos", "Preventivas do mês com o chamado fechado ou baixa à mão"],
    );
    return `<div class="rd-kpi${k.length === 5 ? " is-5" : ""}">${k.map(([n, v, dl, ant, h, dica]) => `
      <a class="rd-k" href="${h}" title="${esc(dica)}"><span class="rd-kn">${n}</span><b class="rd-kv">${v}</b>
        <span class="rd-kc">${dl}<span class="rd-sub">${ant}</span></span></a>`).join("")}</div>`;
  }

  function blocoAtendimento(d) {
    const ult6 = d.serie.slice(-6);
    const fora = d.fora_prazo.length
      ? `<table class="rd-tb"><tbody>${d.fora_prazo.map(f => `<tr><td>${linkCondo(f.condominio_id, f.nome)}</td><td class="num">${f.n} chamado${f.n === 1 ? "" : "s"}</td><td class="rd-sub">pior: ${duracao(f.pior_min)}${f.pior_titulo ? `, ${esc(f.pior_titulo)}` : ""}</td></tr>`).join("")}</tbody></table>`
      : vazio("Nenhum chamado fora do prazo de chegada no período.");
    return bloco("Atendimento e prazo", "chamados abertos por mês", `
      ${barras(d.serie)}
      <div class="rd-linha"><span class="rd-sub">Dentro do prazo</span>${ult6.map(s => `<span class="rd-pp${s.prazo_pct == null ? "" : s.prazo_pct >= 85 ? " is-ok" : s.prazo_pct < 75 ? " is-ri" : ""}"><small>${mesDe(s.mes)}</small>${s.prazo_pct == null ? "—" : s.prazo_pct + "%"}</span>`).join("")}</div>
      <h3>Fora do prazo · ${rotulo(d.periodo.ini, d.periodo.fim)}</h3>${fora}`, ["Ver no Atendimento", "#/atendimento"]);
  }

  function blocoDinheiro(d) {
    const a = d.atual, f = d.financeiro || {};
    return bloco("Dinheiro", "faturado por mês, em R$ mil", `
      <div class="rd-leg"><span><i class="rd-lg1"></i>Contratos</span><span><i class="rd-lg2"></i>O.S. e orçamentos</span></div>
      ${empilhado(d.serie)}
      <dl class="rd-fatos">
        <div><dt>Contratos</dt><dd>${mil(a.fat_contratos)} <span class="rd-sub">· ${a.fat_contratos_n} nota${a.fat_contratos_n === 1 ? "" : "s"} · ${f.contratos_ativos ?? "—"} ativos no Omie</span></dd></div>
        <div><dt>O.S. e orçamentos</dt><dd>${mil(a.fat_os)} <span class="rd-sub">· ${a.fat_os_n} nota${a.fat_os_n === 1 ? "" : "s"} pelo sistema</span></dd></div>
        <div><dt>Orçamentos</dt><dd>${a.orc_enviados} enviados, ${a.orc_aprovados} aprovados <span class="rd-sub">· ${mil(a.orc_aprovado_valor)} aprovados no período</span></dd></div>
        <div><dt>Falta faturar</dt><dd>${f.sem_nota ? `<a class="rd-lk rd-atr" href="#/financeiro">${f.sem_nota} aprovado${f.sem_nota === 1 ? "" : "s"} sem nota · ${mil(f.sem_nota_valor)}</a>` : "nada"}${f.nota_erro ? ` <span class="rd-sub">·</span> <a class="rd-lk rd-atr" href="#/financeiro">${f.nota_erro} com erro</a>` : ""}</dd></div>
      </dl>`, ["Ver no Financeiro", "#/financeiro"]);
  }

  function blocoTecnicos(d) {
    if (!d.tecnicos.length) return bloco("Técnicos", rotulo(d.periodo.ini, d.periodo.fim), vazio("Nenhuma O.S., preventiva ou retrabalho no período."), ["Ver na Agenda", "#/agenda"]);
    const pior = d.tecnicos.filter(t => t.ret).sort((x, y) => y.ret - x.ret)[0];
    return bloco("Técnicos", rotulo(d.periodo.ini, d.periodo.fim), `
      <table class="rd-tb is-cab"><thead><tr><th>Técnico</th><th class="num">O.S.</th><th class="num rd-so-desk">Em campo</th><th class="num" title="Chamado que volta até 30 dias depois, no mesmo equipamento">Retrabalho</th><th>Preventivas</th></tr></thead><tbody>
        ${d.tecnicos.map(t => `<tr><td>${esc(t.nome)}</td><td class="num">${t.os}</td><td class="num rd-so-desk">${t.horas ? t.horas + " h" : "—"}</td>
          <td class="num">${t.ret >= 3 ? `<span class="rd-selo">${t.ret}</span>` : t.ret || `<span class="rd-sub">0</span>`}</td>
          <td>${t.prev_previstas ? `<span class="rd-prev">${medidor(t.prev_feitas, t.prev_previstas)}<span>${t.prev_feitas} de ${t.prev_previstas}</span></span>` : `<span class="rd-sub">—</span>`}</td></tr>`).join("")}
      </tbody></table>
      <p class="rd-nota">${ico("info")}<span>Retrabalho é o chamado que volta até 30 dias depois no mesmo equipamento (sem equipamento ligado, no mesmo prédio e categoria), e conta para quem atendeu antes.${pior ? ` Os ${pior.ret} de ${esc(pior.nome.split(" ")[0])} são em ${pior.ret_predios} prédio${pior.ret_predios === 1 ? "" : "s"}.` : ""} Em campo soma da chegada ao fim de cada O.S.</span></p>`, ["Ver na Agenda", "#/agenda"]);
  }

  function blocoPredios(d) {
    const maxP = Math.max(1, ...d.predios.map(p => p.n));
    const predios = d.predios.length
      ? `<div class="rd-hbar">${d.predios.map(p => `<div class="rd-hl"><span class="rd-hn">${linkCondo(p.condominio_id, p.nome)}</span><span class="rd-ht"><span style="width:${(100 * p.n) / maxP}%"></span></span><span class="rd-hv">${p.n}${p.fora ? `<small class="rd-sub"> · ${p.fora} fora do prazo</small>` : ""}</span></div>`).join("")}</div>`
      : vazio("Nenhum chamado ligado a prédio no período.");
    const se = d.chamados_sem_equipamento || { total: 0, sem: 0 };
    const equip = d.equipamentos.length
      ? `<table class="rd-tb"><tbody>${d.equipamentos.map(e => `<tr><td>${esc(e.tipo || "Equipamento")} <span class="rd-sub">${esc(e.modelo || "")}</span></td><td class="num">${e.n >= 3 ? `<span class="rd-selo">${e.n} chamados</span>` : `${e.n} chamado${e.n === 1 ? "" : "s"}`}</td><td class="rd-sub">${e.predios} prédio${e.predios === 1 ? "" : "s"}</td></tr>`).join("")}</tbody></table>`
      : vazio("Nenhum chamado do período tem equipamento ligado.");
    const notaEq = se.sem ? `<p class="rd-nota">${ico("info")}<span>${se.sem} de ${se.total} chamados do período não têm equipamento ligado e ficam fora desta conta.</span></p>` : "";
    const res = d.reservatorios.length
      ? `<table class="rd-tb"><tbody>${d.reservatorios.map(r => `<tr><td>${linkCondo(r.condominio_id, r.condominio_nome)} <span class="rd-sub">${esc(r.nome)}</span></td><td class="num">${r.n} alerta${r.n === 1 ? "" : "s"}</td><td class="rd-sub">mais comum: ${esc(TIPO_ALERTA[r.tipo] || r.tipo)}</td></tr>`).join("")}</tbody></table>`
      : vazio("Nenhum alerta de reservatório no período.");
    return bloco("Prédios e equipamentos", rotulo(d.periodo.ini, d.periodo.fim), `
      <h3 class="is-pri">Prédios com mais chamados</h3>${predios}
      <h3>Equipamentos que mais quebram</h3>${equip}${notaEq}
      <h3>Reservatórios com mais alertas</h3>${res}`, ["Ver no Monitoramento", "#/monitoramento"]);
  }

  // ===== tela =====
  function render() {
    const root = document.getElementById("relDash");
    if (!root) return;
    const d = st.dados;
    const sub = d ? `${rotulo(d.periodo.ini, d.periodo.fim)}${d.periodo.parcial ? " até hoje" : ""} · comparado com ${rotulo(d.periodo.antIni, d.periodo.antFim)}` : "";
    const seg = `<div class="rd-seg" role="group" aria-label="Período">${PERIODOS.map(([k, n]) => `<button type="button" class="${st.periodo === k ? "is-on" : ""}" data-rd-per="${k}"${st.carregando ? " disabled" : ""}>${n}</button>`).join("")}</div>`;
    let corpo;
    if (st.erro) corpo = `<div class="rd-bl rd-msg">${ico("triangle-alert")}<span>Não consegui montar o dashboard.</span><button type="button" class="btn btn-sm" data-rd-tentar>Tentar de novo</button></div>`;
    else if (!d) corpo = `<div class="rd-bl rd-msg is-carregando"><span>Carregando os números…</span></div>`;
    else corpo = `${faixa(d)}
      <div class="rd-grade">${blocoAtendimento(d)}${d.dinheiro ? blocoDinheiro(d) : ""}${blocoTecnicos(d)}${blocoPredios(d)}</div>`;
    root.innerHTML = `<header class="rd-cab"><p class="rd-titulo">${esc(sub)}</p><span class="rd-esp"></span>${seg}</header>${corpo}`;
    root.classList.toggle("is-carregando", st.carregando);
    icones(root);
  }

  async function carregar() {
    const meu = ++st.pedido;
    st.carregando = true; st.erro = false; render();
    try {
      const r = await fetch(`/relatorios/dashboard?periodo=${st.periodo}`, { headers: authHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      if (meu !== st.pedido) return;
      st.dados = d;
    } catch (e) {
      if (meu !== st.pedido) return;
      console.error("[relatorios] dashboard:", e);
      st.erro = true;
    }
    st.carregando = false; render();
  }

  document.addEventListener("click", e => {
    if (!e.target.closest("#relDash")) return;
    const per = e.target.closest("[data-rd-per]");
    if (per && !per.disabled) { if (per.dataset.rdPer !== st.periodo) { st.periodo = per.dataset.rdPer; carregar(); } return; }
    if (e.target.closest("[data-rd-tentar]")) carregar();
  });

  window.GBRelatorios = { abrir: carregar };

  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    const r = origShow.call(this, name, ...resto);
    if (name === "relatorios") carregar();
    return r;
  };
})();
