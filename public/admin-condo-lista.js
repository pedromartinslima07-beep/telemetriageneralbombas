// ============================================================
// CONDOMÍNIOS no molde de lista (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A tela #/cadastros como a maquete desenhou (HubSpot Companies): visões em
// chip (Ativos · Água pede atenção · Com chamado aberto · Sem contrato ·
// Inativos · Todos), busca, Exportar, ordem pela coluna, paginação. A linha
// abre a PÁGINA do prédio (#/condominios/<id>) — aqui não há painel ao lado:
// o prédio tem página própria em três colunas (admin-condominio.js).
//
// ⚠️ NENHUMA REGRA NOVA. Os dados e as leituras são os do admin.js:
// _condominios (cadastro), _cliAgua (água, do _statusData do mapa),
// _cliChamados (abertos e urgentes), _contratosByCondoId e _ctrStatusVisual
// (contrato vigente), _pmData e _pmBaldeDoMes (preventiva do mês, a mesma
// leitura da tela Preventivas). A lista antiga continua no HTML, escondida
// (.cli-antigo[hidden]), porque o boot e o _carregarContratosMetricas ainda
// desenham nela; os ganchos no fim redesenham esta junto.

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const st = { planosPedidos: false };
  // A ordem de trabalho é por nome, como a lista antiga (_cliFiltrados): o
  // servidor devolve na ordem do cadastro.
  let _ordemCache = { fonte: null, lista: [] };
  const dados = () => {
    const f = typeof _condominios !== "undefined" && Array.isArray(_condominios) ? _condominios : [];
    if (_ordemCache.fonte !== f || _ordemCache.lista.length !== f.length) {
      _ordemCache = { fonte: f, lista: [...f].sort((a, b) => (a.nome_fantasia || a.nome || "").localeCompare(b.nome_fantasia || b.nome || "", "pt-BR", { sensitivity: "base" })) };
    }
    return _ordemCache.lista;
  };
  const gestao = () => typeof _isOperador === "undefined" || !_isOperador;
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const nome = c => c.nome_fantasia || c.nome || "Sem nome";
  const cnpj = c => c.cnpj ? String(c.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
  const local = c => [c.bairro, c.cidade && (c.cidade + (c.uf ? "/" + c.uf : ""))].filter(Boolean).join(" · ");
  const moeda = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ===== leituras (as do admin.js) =====
  const agua = c => (typeof _cliAgua === "function" ? _cliAgua(c.id) : { txt: "—", sub: "", cls: "nada", peso: 4 });
  const AGUA_SELO = { bad: "ri", warn: "at", ok: "ok", nada: "cz" };
  const chamados = c => (typeof _cliChamados === "function" ? _cliChamados(c.id) : { abertos: 0, urgentes: 0 });
  const contrato = c => (typeof _contratosByCondoId !== "undefined" ? _contratosByCondoId.get(Number(c.id)) : null) || null;
  const planos = () => (typeof _pmData !== "undefined" && Array.isArray(_pmData) ? _pmData : []);
  const planoDe = c => planos().filter(p => Number(p.condominio_id) === Number(c.id) && p.ativo)
    .sort((a, b) => new Date(a.proxima_em || 0) - new Date(b.proxima_em || 0))[0] || null;
  const pedeAgua = c => agua(c).cls === "bad" || agua(c).cls === "warn";

  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mesRot = iso => { if (!iso) return ""; const [a, m] = String(iso).slice(0, 7).split("-").map(Number); return `${MESES[m - 1]}${a !== new Date().getFullYear() ? "/" + String(a).slice(2) : ""}`; };
  // A preventiva do mês, na mesma régua da tela Preventivas.
  function prev(c) {
    const p = planoDe(c);
    if (!p) return null;
    const balde = typeof _pmBaldeDoMes === "function" ? _pmBaldeDoMes(p) : "";
    const atrasada = typeof _pmAtrasada === "function" && _pmAtrasada(p);
    if (atrasada) return { cls: "ri", txt: "atrasada", sub: p.titulo || "", peso: 0 };
    if (balde === "feitas") return { cls: "ok", txt: "feita no mês", sub: `próxima em ${mesRot(p.proxima_em)}`, peso: 4 };
    if (balde === "em-campo") return { cls: "info", txt: "em campo", sub: p.tecnico_nome || "", peso: 2 };
    if (balde === "com-dono") return { cls: "at", txt: "a fazer no mês", sub: p.tecnico_nome || "", peso: 1 };
    if (balde === "sem-dono") return { cls: "at", txt: "a fazer no mês", sub: "sem responsável", peso: 1 };
    return { cls: "cz", txt: `em ${mesRot(p.proxima_em)}`, sub: p.titulo || "", peso: 3 };
  }

  function ctrCel(c) {
    const k = contrato(c);
    if (!k) return `<span class="ls-mudo">sem contrato</span>`;
    const s = typeof _ctrStatusVisual === "function" ? _ctrStatusVisual(k) : { texto: "Ativo", cls: "ok" };
    const sel = s.cls === "bad" ? "ri" : s.cls === "warn" ? "at" : "ok";
    return `<span class="ls-mono">${moeda(k.valor_mensal)}</span> por mês<span class="ls-sub">${s.cls === "ok" ? (k.fim_em ? "até " + new Date(k.fim_em).toLocaleDateString("pt-BR") : "sem fim") : `<span class="ls-selo is-${sel}">${esc(s.texto)}</span>`}</span>`;
  }

  const lista = window.GBLista.criar({
    id: "condominios",
    raiz: "cliLsRoot",
    titulo: "Condomínios",
    nomePlural: "os condomínios",
    buscaDica: "Nome, bairro, cidade, síndico ou CNPJ",
    dados,
    chave: c => c.id,
    texto: c => `${c.nome || ""} ${c.nome_fantasia || ""} ${c.bairro || ""} ${c.cidade || ""} ${c.responsavel || ""} ${c.cnpj || ""} ${cnpj(c)}`,
    estado: () => (dados().length ? "pronto" : "carregando"),
    recarregar: () => { if (typeof carregarTudo === "function") carregarTudo(); },
    visoes: [
      ["ativos", "Ativos", c => c.ativo !== false],
      ["agua", "Água pede atenção", c => c.ativo !== false && pedeAgua(c), "ri", d => d.some(c => c.ativo !== false && pedeAgua(c))],
      ["chamados", "Com chamado aberto", c => c.ativo !== false && chamados(c).abertos > 0, "at", d => d.some(c => chamados(c).abertos > 0)],
      ["semct", "Sem contrato", c => c.ativo !== false && !contrato(c), "cz", () => gestao()],
      ["inativos", "Inativos", c => c.ativo === false, null, d => d.some(c => c.ativo === false)],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      ativos: "Nenhum condomínio ativo.",
      agua: "Nenhum prédio com a água pedindo atenção.",
      chamados: "Nenhum prédio com chamado em aberto.",
      semct: "Todo prédio ativo tem contrato.",
      inativos: "Nenhum condomínio inativo.",
      todos: "Nenhum condomínio cadastrado ainda.",
    },
    icVazio: "building-2",
    frase: (d, estado) => {
      if (estado !== "pronto") return "Os prédios da carteira, cada um com a sua página.";
      const ativos = d.filter(c => c.ativo !== false).length, inativos = d.length - ativos;
      const ch = (typeof _chamadosData !== "undefined" && Array.isArray(_chamadosData) ? _chamadosData : []).filter(x => typeof _chEmAberto === "function" && _chEmAberto(x.status)).length;
      const m = (typeof _contratosMetricas !== "undefined" && _contratosMetricas?.total) || null;
      const partes = [
        `<b>${pl(ativos, "condomínio ativo", "condomínios ativos")}</b>${inativos ? ` (${pl(inativos, "inativo", "inativos")})` : ""}`,
        `<b>${ch}</b> ${ch === 1 ? "chamado em aberto" : "chamados em aberto"}`,
        gestao() && m ? `<b>${moeda(m.mrr)}</b> por mês em contratos` : "",
      ].filter(Boolean);
      let acao = "";
      if (gestao() && m?.vencidos > 0) acao = ` <button type="button" class="ls-lk is-forte" data-cli-ir-contratos="vencido">${pl(m.vencidos, "contrato vencido", "contratos vencidos")} →</button>`;
      else if (gestao() && m?.vencendo_30d > 0) acao = ` <button type="button" class="ls-lk is-forte" data-cli-ir-contratos="vencendo">${pl(m.vencendo_30d, "contrato vence", "contratos vencem")} em 30 dias →</button>`;
      return partes.join(" · ") + acao;
    },
    acoes: () => gestao()
      ? `<button type="button" class="ls-bt is-pri viewer-only-hide" data-action="novo-cliente">${ico("plus")}Novo condomínio</button>`
      : "",
    colunas: [
      { chave: "nome", h: "Condomínio", ord: c => nome(c).toLowerCase(),
        td: c => `<b>${esc(nome(c))}</b>${c.ativo === false ? ` <span class="ls-selo is-cz">inativo</span>` : ""}<span class="ls-sub">${[local(c), c.responsavel, cnpj(c)].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</span>` },
      { chave: "agua", h: "Água", cls: "ls-c-sit", w: "210px", ord: c => agua(c).peso,
        td: c => { const a = agua(c); return `<span class="ls-selo is-${AGUA_SELO[a.cls] || "cz"}">${esc(a.txt)}</span>${a.sub ? `<span class="ls-sub">${esc(a.sub)}</span>` : ""}`; } },
      { chave: "chamados", h: "Chamados", cls: "ls-c-om", w: "150px", dir: "desc", ord: c => chamados(c).abertos,
        td: c => { const x = chamados(c); return x.abertos ? `<b>${x.abertos} em aberto</b>${x.urgentes ? `<span class="ls-sub ls-txt-ri">${pl(x.urgentes, "urgente", "urgentes")}</span>` : ""}` : `<span class="ls-mudo">nenhum</span>`; } },
      { chave: "contrato", h: "Contrato", cls: "ls-c-om", w: "180px",
        ord: c => (typeof _cliContratoPeso === "function" ? _cliContratoPeso(contrato(c)) : null), td: ctrCel },
      { chave: "prev", h: "Preventiva", cls: "ls-c-om", w: "170px", ord: c => prev(c)?.peso ?? null,
        td: c => { const p = prev(c); return p ? `<span class="ls-selo is-${p.cls}">${esc(p.txt)}</span>${p.sub ? `<span class="ls-sub">${esc(p.sub)}</span>` : ""}` : `<span class="ls-mudo">${st.planosPedidos || !gestao() ? "sem preventiva" : "—"}</span>`; } },
    ],
    classeLinha: c => (c.ativo === false ? "is-inativo" : ""),
    exportar: [
      ["Condomínio", nome],
      ["Razão social", c => c.nome],
      ["CNPJ", cnpj],
      ["Síndico / responsável", c => c.responsavel],
      ["Telefone", c => c.telefone],
      ["E-mail", c => c.email],
      ["Endereço", c => c.endereco],
      ["Bairro", c => c.bairro],
      ["Cidade", c => c.cidade && (c.cidade + (c.uf ? "/" + c.uf : ""))],
      ["Situação", c => (c.ativo === false ? "Inativo" : "Ativo")],
      ["Água", c => agua(c).txt],
      ["Chamados em aberto", c => chamados(c).abertos],
      ["Contrato por mês", c => contrato(c)?.valor_mensal ?? ""],
      ["Contrato até", c => contrato(c)?.fim_em ? new Date(contrato(c).fim_em).toLocaleDateString("pt-BR") : ""],
      ["Preventiva", c => prev(c)?.txt || ""],
    ],
    // O lote: aviso por e-mail aos síndicos (só a gestão; rota gestaoOnly).
    podeMarcar: () => gestao(),
    selecionados: n => (n === 1 ? "selecionado" : "selecionados"),
    lote: sel => [["aviso", "Mandar aviso aos síndicos", "megaphone", sel.length]],
    aoLote: (k, sel, limpar) => { if (k === "aviso") abrirAviso(sel, limpar); },
    aoAbrir: id => abrirFichaCondominio(Number(id)),
    aoClicar: e => {
      const b = e.target.closest("[data-cli-ir-contratos]");
      if (!b) return false;
      showSection("contratos");
      setTimeout(() => document.querySelector(`[data-ctrs-tab="${b.dataset.cliIrContratos}"]`)?.click(), 60);
      return true;
    },
  });

  const ativa = () => document.querySelector('.section[data-section="cadastros"]')?.classList.contains("is-active");

  // ===== aviso aos síndicos =====
  // O mesmo desenho do envio de O.S. em lote: o modal MOSTRA para onde vai
  // cada e-mail (o do cadastro), o prédio sem e-mail aparece riscado e não
  // trava o resto, e o resultado nomeia o que falhou.
  const RE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const destinos = c => String(c.email || "").split(/[,;]/).map(s => s.trim()).filter(s => RE_EMAIL.test(s));

  function abrirAviso(sel, limpar) {
    if (!sel.length) return;
    const com = sel.filter(c => destinos(c).length), sem = sel.filter(c => !destinos(c).length);
    const linhas = sel.map(c => `<tr${destinos(c).length ? "" : ` style="color:var(--tinta-2);"`}>
        <td style="padding:6px 8px 6px 0;"><b>${esc(nome(c))}</b></td>
        <td style="padding:6px 0;color:var(--tinta-2);">${destinos(c).length ? esc(destinos(c).join(", ")) : "<i>sem e-mail no cadastro: não recebe</i>"}</td>
      </tr>`).join("");
    const ov = document.createElement("div");
    ov.className = "modalOverlay";
    ov.style.display = "flex";
    ov.innerHTML = `
      <div class="modalBox" style="max-width:680px;" role="dialog" aria-modal="true" aria-labelledby="cliAvisoTit">
        <div class="modalHead">
          <div>
            <div class="modalTitle" id="cliAvisoTit">Aviso a ${pl(com.length, "síndico", "síndicos")}</div>
            <div class="modalSub">Um e-mail por prédio, para o e-mail do cadastro</div>
          </div>
          <button class="btn btn-sm" type="button" data-aviso-fechar>Fechar</button>
        </div>
        <div class="modalBody">
          <div class="modalTools"><div class="modalCount" data-aviso-msg>${sem.length ? `${pl(sem.length, "prédio sem e-mail fica", "prédios sem e-mail ficam")} de fora.` : ""}</div></div>
          <form class="formGrid" style="grid-template-columns:1fr;" data-sem-envio>
            <div class="f">
              <span>Vai para</span>
              <div style="max-height:220px;overflow:auto;border:1px solid var(--fio-esc);padding:8px 12px;">
                <table style="width:100%;border-collapse:collapse;font-size:12.5px;">${linhas}</table>
              </div>
            </div>
            <label class="f">
              <span>Assunto</span>
              <input class="input" data-aviso-assunto maxlength="200" placeholder="Ex.: Manutenção programada na rede de água">
            </label>
            <label class="f">
              <span>Mensagem</span>
              <textarea class="input" data-aviso-texto rows="6" maxlength="5000" style="resize:vertical;" placeholder="Prezado(a) síndico(a), …"></textarea>
            </label>
            <div class="hint" style="line-height:1.6;">
              A mesma mensagem vai a todos, com o nome do prédio no rodapé do e-mail. Cada envio fica
              registrado no histórico do prédio, em "Anotações e avisos".
            </div>
            <div class="formActions">
              <button class="btn" type="button" data-aviso-fechar>Cancelar</button>
              <button class="btn btnAccent" type="button" data-aviso-enviar ${com.length ? "" : "disabled"}>Enviar ${com.length}</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s);
    const fechar = () => { ov.remove(); document.removeEventListener("keydown", esc_); };
    const esc_ = e => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", esc_);
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-aviso-fechar]")) fechar(); });
    $("[data-aviso-assunto]").focus();

    $("[data-aviso-enviar]").addEventListener("click", async () => {
      const msg = $("[data-aviso-msg]"), bt = $("[data-aviso-enviar]");
      const assunto = $("[data-aviso-assunto]").value.trim(), mensagem = $("[data-aviso-texto]").value.trim();
      if (!assunto || !mensagem) { msg.style.color = "var(--danger)"; msg.textContent = !assunto ? "Escreva o assunto." : "Escreva a mensagem."; return; }
      // ⚠️ O BOTÃO AVISA QUE VAI DEMORAR: um e-mail por prédio, um de cada
      // vez. Tela parada faz clicar de novo — que mandaria tudo duas vezes.
      msg.style.color = "var(--tinta-2)"; msg.textContent = `Enviando ${com.length}… isso leva alguns segundos.`;
      bt.disabled = true; bt.textContent = "Enviando…";
      try {
        const r = await fetch("/admin/condominios/aviso", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ condominio_ids: com.map(c => c.id), assunto, mensagem }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
        const falhas = j.falhas || [];
        if (!falhas.length) {
          fechar(); limpar();
          alert(`✓ Aviso enviado a ${pl((j.enviados || []).length, "prédio", "prédios")}.${sem.length ? ` ${pl(sem.length, "ficou", "ficaram")} de fora por não ter e-mail no cadastro.` : ""}`);
          return;
        }
        const nEnv = (j.enviados || []).length;
        msg.style.color = "var(--danger)";
        msg.innerHTML = `${nEnv ? pl(nEnv, "enviado", "enviados") + "; " : "Nenhum enviado: "}<b>${pl(falhas.length, "falhou", "falharam")}</b> — ${falhas.map(f => esc(f.nome) + " (" + esc(f.erro) + ")").join("; ")}`;
        // Nada saiu: dá para tentar de novo. Saiu parte: reenviar duplicaria
        // para quem já recebeu, então o botão para (os que falharam se mandam
        // de novo escolhendo só eles na lista).
        if (!nEnv) { bt.disabled = false; bt.textContent = "Tentar de novo"; }
        else { bt.textContent = pl(nEnv, "enviado", "enviados"); limpar(); }
      } catch (e) {
        msg.style.color = "var(--danger)"; msg.textContent = "Não consegui enviar: " + e.message;
        bt.disabled = false; bt.textContent = `Enviar ${com.length}`;
      }
    });
  }

  // A coluna Preventiva lê o _pmData, que só a tela Preventivas buscava.
  function garantirPlanos() {
    if (st.planosPedidos || !gestao() || typeof carregarPlanos !== "function") return;
    st.planosPedidos = true;
    if (!planos().length) Promise.resolve(carregarPlanos()).finally(() => { if (ativa()) lista.desenhar(); });
  }

  // ===== ganchos =====
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    const r = origShow.call(this, name, ...resto);
    // garantirPlanos antes: com os planos já carregados (vindo de Preventivas)
    // ela não redesenha, e a coluna sairia "—" em vez de "sem preventiva".
    if (name === "cadastros") { garantirPlanos(); lista.montar(); }
    return r;
  };
  for (const nomeFn of ["renderCliTabela", "_pmRenderTudo"]) {
    const orig = window[nomeFn];
    if (typeof orig !== "function") continue;
    window[nomeFn] = function (...a) {
      const r = orig.apply(this, a);
      if (ativa()) lista.desenhar();
      return r;
    };
  }
  // Boot já na tela (F5 em #/cadastros).
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => { if (ativa()) { lista.montar(); garantirPlanos(); } }, 0));
})();
