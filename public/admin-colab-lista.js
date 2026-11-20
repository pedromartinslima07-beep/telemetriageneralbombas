// ============================================================
// COLABORADORES no molde de lista (redesenho estrutural, 20/11/2026)
// ============================================================
//
// A tela #/tecnicos ("Colaboradores") como a maquete desenhou: visões em
// chip (Ativos · Técnicos · Escritório · Inativos · Todos), busca, Exportar,
// ordem pela coluna, e a pessoa escolhida no PAINEL AO LADO: contato,
// documentos, observações e, para técnico, o agora (GPS, disponível ou
// ocupado) e os chamados com ele.
//
// ⚠️ NENHUMA REGRA NOVA. Dados e ações são os do admin.js: _tecnicosData
// (carregarTecnicos), _tecLocs/_tecStale (o GPS do mapa), _tecCargoLabel,
// _tecIniciais; Novo, Editar, Marcar disponível/ocupado e Excluir são os
// data-action de sempre (novo-tecnico, editar-tecnico, toggle-tec-disp,
// excluir-tecnico), tratados pela delegação do body no admin.js. O layout
// antigo fica escondido (.tec-antigo[hidden]); o embrulho de renderTecnicos
// redesenha esta tela junto.

(function () {
  if (!window.GBLista) return;
  const { esc, ico } = window.GBLista;

  const dados = () => (typeof _tecnicosData !== "undefined" && Array.isArray(_tecnicosData) ? _tecnicosData : []);
  const cargo = t => t.cargo || "tecnico";
  const CARGO = c => (typeof _tecCargoLabel !== "undefined" && _tecCargoLabel[c]) || c;
  const ini = n => (typeof _tecIniciais === "function" ? _tecIniciais(n) : String(n || "?").slice(0, 2).toUpperCase());
  const tecnico = t => cargo(t) === "tecnico";
  const ativo = t => t.ativo !== false;
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const rel = iso => (typeof _tempoRelativo === "function" ? _tempoRelativo(iso) : "");

  // O agora do técnico, do mesmo _tecLocs do mapa.
  function gps(t) {
    const loc = (typeof _tecLocs !== "undefined" && Array.isArray(_tecLocs) ? _tecLocs : []).find(l => Number(l.tecnico_id) === Number(t.id));
    if (!loc) return { cls: "cz", txt: "Offline", sub: "", peso: 2 };
    const velho = typeof _tecStale === "function" && _tecStale(loc.capturada_em);
    return velho ? { cls: "at", txt: "Sem sinal", sub: rel(loc.capturada_em), peso: 1 } : { cls: "ok", txt: "Online agora", sub: "", peso: 0 };
  }
  const chamados = t => (typeof _chamadosData !== "undefined" && Array.isArray(_chamadosData) ? _chamadosData : []).filter(ch => Number(ch.tecnico_id) === Number(t.id));
  const abertos = t => chamados(t).filter(ch => typeof _chEmAberto === "function" && _chEmAberto(ch.status));

  const avatar = (t, grande) => `<span class="cb-av${grande ? " is-grande" : ""}">${t.foto_url ? `<img src="${esc(t.foto_url)}" alt="">` : esc(ini(t.nome))}</span>`;

  // ===== o painel =====
  const sec = (tt, html) => `<section class="ls-sec"><h3>${tt}</h3>${html}</section>`;
  const fatos = arr => `<dl class="ls-fatos">${arr.filter(Boolean).map(([k, v, largo]) => `<div${largo ? ` class="is-largo"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const nasc = n => { if (!n) return null; const d = new Date(n); return isNaN(d) ? null : d.toLocaleDateString("pt-BR", { timeZone: "UTC" }); };
  const data = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d.toLocaleDateString("pt-BR"); };

  function detalhe(t) {
    const g = tecnico(t) ? gps(t) : null;
    const ab = tecnico(t) ? abertos(t) : [];
    const resolvidos = tecnico(t) ? chamados(t).filter(ch => ch.status === "fechado").length : 0;
    const acoes = [
      `<button type="button" class="ls-bt is-p is-pri viewer-only-hide" data-action="editar-tecnico" data-id="${t.id}">${ico("pencil")}Editar</button>`,
      tecnico(t) ? `<button type="button" class="ls-bt is-p viewer-only-hide" data-action="toggle-tec-disp" data-id="${t.id}" data-disp="${t.disponivel ? "1" : "0"}">${t.disponivel ? "Marcar ocupado" : "Marcar disponível"}</button>` : "",
      tecnico(t) ? `<button type="button" class="ls-bt is-p is-ghost" data-cb-agenda>${ico("calendar-days")}Ver na agenda</button>` : "",
      `<button type="button" class="ls-bt is-p is-ghost is-perigo viewer-only-hide" data-action="excluir-tecnico" data-id="${t.id}" data-nome="${esc(t.nome)}">Excluir</button>`,
    ].join("");
    return `
      <div class="ls-l-cab cb-cab">
        ${avatar(t, true)}
        <div class="cb-cab-txt">
          <div class="ls-l-sup">${ico("user")}<span>${esc(CARGO(cargo(t)))}</span>${t.especialidade ? `<span>·</span><span>${esc(t.especialidade)}</span>` : ""}</div>
          <h2>${esc(t.nome || "—")}</h2>
          <div class="ls-l-selo">
            ${!ativo(t) ? `<span class="ls-selo is-cz">inativo</span>` : ""}
            ${g ? `<span class="ls-selo is-${g.cls}">${esc(g.txt)}</span>${g.sub ? `<span class="ls-mudo">${esc(g.sub)}</span>` : ""}` : ""}
            ${tecnico(t) ? `<span class="ls-selo is-${t.disponivel ? "ok" : "at"}">${t.disponivel ? "Disponível" : "Ocupado"}</span>` : ""}
          </div>
        </div>
        <div class="ls-l-acoes">${acoes}</div>
      </div>
      ${tecnico(t) ? sec("Chamados", `${fatos([
          ["Em aberto", ab.length ? `<b>${ab.length}</b>` : "nenhum"],
          ["Resolvidos", String(resolvidos)],
        ])}${ab.length ? `<div class="cb-chs">${ab.slice(0, 8).map(ch => `<div class="ls-ligado">${ico("inbox")}<button type="button" class="ls-lk" data-cb-chamado="${ch.id}">#${ch.id}</button><span class="cb-ch-t">${esc(ch.titulo || "Chamado")}</span><span class="ls-esp"></span><span class="ls-mudo">${esc(ch.condominio_nome || "")}</span></div>`).join("")}${ab.length > 8 ? `<p class="ls-nada">e mais ${ab.length - 8}.</p>` : ""}</div>` : ""}`) : ""}
      ${sec("Contato", fatos([
        ["Telefone", t.telefone ? esc(t.telefone) : `<span class="ls-mudo">—</span>`],
        ["E-mail", t.email ? esc(t.email) : `<span class="ls-mudo">—</span>`],
        tecnico(t) ? ["Login do app", t.tem_login ? "tem" : `<span class="ls-txt-at">não tem — crie em Editar</span>`] : null,
        t.endereco ? ["Endereço", esc(t.endereco), true] : null,
      ]))}
      ${sec("Documentos", fatos([
        ["CPF", t.cpf ? esc(t.cpf) : `<span class="ls-mudo">—</span>`],
        ["RG", t.rg ? esc(t.rg) : `<span class="ls-mudo">—</span>`],
        nasc(t.data_nascimento) ? ["Nascimento", nasc(t.data_nascimento)] : null,
        data(t.criado_em) ? ["Cadastrado em", data(t.criado_em)] : null,
      ]))}
      ${t.observacoes ? sec("Observações", `<p class="cb-obs">${esc(t.observacoes)}</p>`) : ""}`;
  }

  // ===== a lista =====
  const lista = window.GBLista.criar({
    id: "colaboradores",
    raiz: "cbLsRoot",
    titulo: "Colaboradores",
    nomePlural: "os colaboradores",
    buscaDica: "Nome, função, especialidade, telefone ou e-mail",
    dados: () => [...dados()].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")),
    chave: t => t.id,
    texto: t => `${t.nome || ""} ${CARGO(cargo(t))} ${t.especialidade || ""} ${t.telefone || ""} ${t.email || ""}`,
    estado: () => (dados().length ? "pronto" : "carregando"),
    recarregar: () => { if (typeof carregarTecnicos === "function") carregarTecnicos().then(() => renderTecnicos()); },
    visoes: [
      ["ativos", "Ativos", ativo],
      ["tecnicos", "Técnicos", t => ativo(t) && tecnico(t)],
      ["escritorio", "Escritório", t => ativo(t) && !tecnico(t)],
      ["inativos", "Inativos", t => !ativo(t), null, d => d.some(t => !ativo(t))],
      ["todos", "Todos", () => true],
    ],
    vazios: {
      ativos: "Ninguém cadastrado ainda. Use \"Novo colaborador\".",
      tecnicos: "Nenhum técnico ativo.",
      escritorio: "Ninguém do escritório cadastrado.",
      inativos: "Nenhum colaborador inativo.",
      todos: "Ninguém cadastrado ainda.",
    },
    icVazio: "users",
    frase: (d, estado) => {
      if (estado !== "pronto") return "Quem usa o sistema e o app.";
      const at = d.filter(ativo), tecs = at.filter(tecnico);
      const online = tecs.filter(t => gps(t).peso === 0).length;
      const livres = tecs.filter(t => t.disponivel).length;
      const ab = tecs.reduce((s, t) => s + abertos(t).length, 0);
      return [
        `<b>${pl(at.length, "pessoa", "pessoas")}</b>`,
        `<b>${tecs.length}</b> ${tecs.length === 1 ? "técnico" : "técnicos"}${tecs.length ? ` (${online} online, ${pl(livres, "disponível", "disponíveis")})` : ""}`,
        ab ? `<b>${ab}</b> ${ab === 1 ? "chamado aberto" : "chamados abertos"} com eles` : "",
      ].filter(Boolean).join(" · ");
    },
    acoes: () => `<button type="button" class="ls-bt is-pri viewer-only-hide" data-action="novo-tecnico">${ico("user-plus")}Novo colaborador</button>`,
    colunas: [
      { chave: "nome", h: "Nome", ord: t => String(t.nome || "").toLowerCase(),
        td: t => `<span class="cb-pessoa">${avatar(t)}<span><b>${esc(t.nome || "—")}</b>${!ativo(t) ? ` <span class="ls-selo is-cz">inativo</span>` : ""}<span class="ls-sub">${esc(t.telefone || t.email || "")}</span></span></span>` },
      { chave: "funcao", h: "Função", w: "200px", ord: t => CARGO(cargo(t)),
        td: t => `${esc(CARGO(cargo(t)))}<span class="ls-sub">${esc(t.especialidade || "")}</span>` },
      { chave: "agora", h: "Agora", cls: "ls-c-sit", w: "230px", ord: t => (tecnico(t) ? gps(t).peso : 9),
        td: t => {
          if (!tecnico(t)) return `<span class="ls-mudo">—</span>`;
          const g = gps(t);
          return `<span class="ls-selo is-${g.cls}">${esc(g.txt)}</span><span class="ls-sub">${t.disponivel ? "disponível" : "ocupado"}${g.sub ? " · " + esc(g.sub) : ""}</span>`;
        } },
      { chave: "chamados", h: "Chamados abertos", cls: "ls-c-om ls-num", w: "150px", dir: "desc", ord: t => (tecnico(t) ? abertos(t).length : null),
        td: t => (tecnico(t) ? `<span class="ls-mono">${abertos(t).length}</span>` : `<span class="ls-mudo">—</span>`) },
    ],
    exportar: [
      ["Nome", t => t.nome],
      ["Função", t => CARGO(cargo(t))],
      ["Especialidade", t => t.especialidade || ""],
      ["Telefone", t => t.telefone || ""],
      ["E-mail", t => t.email || ""],
      ["Situação", t => (ativo(t) ? "Ativo" : "Inativo")],
      ["Disponível", t => (tecnico(t) ? (t.disponivel ? "sim" : "não") : "")],
      ["Chamados abertos", t => (tecnico(t) ? abertos(t).length : "")],
    ],
    detalhe,
    icLado: "user",
    ladoVazio: "Escolha uma pessoa na lista.",
    aoAbrir: id => { const t = dados().find(x => String(x.id) === String(id)); if (t && typeof abrirModalTecnico === "function") abrirModalTecnico(t); },
    aoClicar: e => {
      let el;
      if ((el = e.target.closest("[data-cb-chamado]"))) { _chAbrirPagina(Number(el.dataset.cbChamado)); return true; }
      if (e.target.closest("[data-cb-agenda]")) { showSection("agenda"); return true; }
      return false;
    },
  });

  const ativa = () => document.querySelector('.section[data-section="tecnicos"]')?.classList.contains("is-active");

  // Abrir uma pessoa de fora (Ctrl+K): a tela, com ela escolhida no painel.
  window.GBColab = {
    abrir(id) {
      showSection("tecnicos");
      lista.montar();
      lista.selecionar(Number(id));
    },
  };

  // ===== ganchos =====
  const origShow = window.showSection;
  window.showSection = function (name, ...resto) {
    const r = origShow.call(this, name, ...resto);
    if (name === "tecnicos") lista.montar();
    return r;
  };
  // Quem grava (novo, editar, disponível, excluir) e o boot redesenham por
  // renderTecnicos; o GPS chega pelo polling do mapa.
  for (const nomeFn of ["renderTecnicos", "renderTecTabela"]) {
    const orig = window[nomeFn];
    if (typeof orig !== "function") continue;
    window[nomeFn] = function (...a) {
      const r = orig.apply(this, a);
      if (ativa()) lista.desenhar();
      return r;
    };
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => { if (ativa()) lista.montar(); }, 0));
})();
