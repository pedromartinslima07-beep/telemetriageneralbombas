// _orcamentos-preview.js — a rede de mentira da prévia sem login.
//
// ⚠️ ARQUIVO DE PRÉVIA, TEMPORÁRIO. Alcançável só por
// /dev/_orcamentos-preview.html, rota que NÃO existe em produção. Serve para
// olhar a aba "Solicitados pelos técnicos" sem sessão — o /admin/painel de
// verdade cai no /login, e o login é handoff pro Pedro.
//
// Não duplica CSS nem JS: a página carrega o /static/admin.css e o
// /static/admin.js de verdade. Aqui só se troca o fetch e se planta a fixture.
//
// ⚠️ A PRÉVIA EMPRESTA O localStorage, NÃO O TOMA. Mesma pegadinha registrada
// no _operador-preview.js: escrever `token = "preview"` e ir embora deixa o
// valor valendo para o painel de verdade, que na request seguinte toma 401 e
// desloga o Pedro — efeito longe da causa. As três chaves são devolvidas no
// `pagehide` (o evento certo: `beforeunload` não dispara em navegação por link
// no iOS, e `unload` já não é garantido em navegador nenhum).
(function () {
  var CHAVES = ["token", "user", "userRole"];
  var ANTES = {};
  CHAVES.forEach(function (k) { ANTES[k] = localStorage.getItem(k); });
  window.addEventListener("pagehide", function () {
    CHAVES.forEach(function (k) {
      if (ANTES[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, ANTES[k]);
    });
  });

  localStorage.setItem("token", "preview");
  localStorage.setItem("user", JSON.stringify({ id: 0, nome: "Prévia", role: "admin" }));
  localStorage.setItem("userRole", "admin");

  // ── A fixture ────────────────────────────────────────────────────────
  // Cobre os cinco estados que a aba precisa distinguir, e de propósito põe
  // TRÊS pedidos no mesmo condomínio: é o caso que a tabela antiga espalhava
  // em três linhas soltas e que o agrupamento existe para juntar.
  //
  // `condominio_razao_social` é `condominios.nome` cru; `condominio_nome` é o
  // nome de exibição (fantasia). Aurora Paulista tem os dois IGUAIS de
  // propósito: é o condomínio sem fantasia cadastrado, e nele a linha "Razão
  // social:" do cabeçalho não deve aparecer. Nos outros três eles divergem,
  // como em 71 dos 86 cadastros de produção.
  var HOJE = new Date();
  var d = function (dias) {
    var x = new Date(HOJE); x.setDate(x.getDate() - dias); return x.toISOString();
  };
  var FILA = [
    { id: 101, numero: "OS-2026-0042", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações", condominio_razao_social: "PARQUE DAS NACOES EMPREENDIMENTOS IMOBILIARIOS LTDA",
      tecnico_nome: "Marcos Ribeiro", chamado_id: 73, finalizada_em: d(0), criado_em: d(0),
      orcamento_necessario: true,
      orcamento_observacoes: "Bomba 1 com vedação danificada e vazamento pelo selo mecânico. Precisa trocar o pressostato e o selo. Sugiro substituição completa do conjunto — tempo estimado 4h.",
      orcamento_id: null, orcamento_status: null, orcamento_valor: null, orcamento_numero: null },
    { id: 102, numero: "OS-2026-0041", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações", condominio_razao_social: "PARQUE DAS NACOES EMPREENDIMENTOS IMOBILIARIOS LTDA",
      tecnico_nome: "Cleber Nogueira", chamado_id: null, finalizada_em: d(1), criado_em: d(1),
      orcamento_necessario: true,
      orcamento_observacoes: "Quadro de comando com contatora chiando. Trocar antes que trave a bomba de recalque.",
      orcamento_id: 601, orcamento_status: "rascunho", orcamento_valor: 1840, orcamento_numero: "OR-000501" },
    { id: 103, numero: "OS-2026-0038", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações", condominio_razao_social: "PARQUE DAS NACOES EMPREENDIMENTOS IMOBILIARIOS LTDA",
      tecnico_nome: "Marcos Ribeiro", chamado_id: 68, finalizada_em: d(9), criado_em: d(9),
      orcamento_necessario: true, orcamento_observacoes: "Boia da cisterna travando. Substituir.",
      orcamento_id: 498, orcamento_status: "aprovado", orcamento_valor: 620, orcamento_numero: "OR-000498",
      orcamento_aprovado_em: d(6), aprovado_por_nome: "Marcelo (Gestor)" },
    { id: 104, numero: "OS-2026-0040", condominio_id: 2, condominio_nome: "Edifício Aurora Paulista", condominio_razao_social: "Edifício Aurora Paulista",
      tecnico_nome: "Wesley Antunes", chamado_id: 71, finalizada_em: d(2), criado_em: d(2),
      orcamento_necessario: true, orcamento_observacoes: "",
      orcamento_id: null, orcamento_status: null, orcamento_valor: null, orcamento_numero: null },
    { id: 105, numero: "OS-2026-0035", condominio_id: 3, condominio_nome: "Residencial Vila Mariana", condominio_razao_social: "CONDOMINIO EDIFICIO VILA MARIANA",
      tecnico_nome: "Jonas Prado", chamado_id: null, finalizada_em: d(14), criado_em: d(14),
      orcamento_necessario: true,
      orcamento_observacoes: "Motor da pressurizadora com rolamento gasto. Orçamento de retífica ou troca.",
      orcamento_id: 495, orcamento_status: "enviado", orcamento_valor: 3250, orcamento_numero: "OR-000495" },
    { id: 106, numero: "OS-2026-0031", condominio_id: 4, condominio_nome: "Edifício Mont Blanc", condominio_razao_social: "MONT BLANC ADMINISTRADORA DE BENS LTDA",
      tecnico_nome: "Cleber Nogueira", chamado_id: null, finalizada_em: d(22), criado_em: d(22),
      orcamento_necessario: true, orcamento_observacoes: "Troca do painel inteiro — cliente achou caro.",
      orcamento_id: 490, orcamento_status: "rejeitado", orcamento_valor: 8900, orcamento_numero: "OR-000490",
      orcamento_motivo_rejeicao: "Síndico pediu para reavaliar só a contatora." },
  ];

  var AVULSOS = [
    // ⚠️ ESTE NASCEU DE UMA O.S. (`os_id`), e é o caso que o modal único
    // precisa cobrir: o trilho tem de mostrar o pedido do técnico. Os campos
    // `os_*` vêm do GET /admin/orcamentos/avulsos, que faz o LEFT JOIN.
    { id: 601, numero: "OR-000501", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações", condominio_razao_social: "PARQUE DAS NACOES EMPREENDIMENTOS IMOBILIARIOS LTDA",
      status: "rascunho", origem: "os", tipo: "pecas", valor_total: 1840, criado_em: d(1),
      os_id: 102, os_numero: "OS-2026-0041", os_tecnico_nome: "Cleber Nogueira",
      os_chamado_id: null, os_finalizada_em: d(1),
      orcamento_observacoes: "Quadro de comando com contatora chiando. Trocar antes que trave a bomba de recalque." },
    { id: 602, numero: "OR-000602", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações", condominio_razao_social: "PARQUE DAS NACOES EMPREENDIMENTOS IMOBILIARIOS LTDA",
      status: "enviado", origem: "admin", tipo: "limpeza_reservatorio", valor_total: 2200, criado_em: d(4) },
    { id: 603, numero: "OR-000603", condominio_id: 2, condominio_nome: "Edifício Aurora Paulista", condominio_razao_social: "Edifício Aurora Paulista",
      status: "aprovado", origem: "ia", tipo: "pecas", valor_total: 980, criado_em: d(7),
      respondido_em: d(2), respondido_nome: "Marcelo", resposta_tratada_em: null },
    { id: 604, numero: "OR-000604", condominio_id: 3, condominio_nome: "Residencial Vila Mariana", condominio_razao_social: "CONDOMINIO EDIFICIO VILA MARIANA",
      status: "rascunho", origem: "admin", tipo: "dedetizacao", valor_total: 0, criado_em: d(11) },
  ];

  var LINHAS = [
    { id: 91, orcamento_id: 601, descricao: "Contatora Weg CWM-25", ficha_tecnica: "Bobina 220V",
      quantidade: 1, valor_unitario: 640, ordem: 1 },
    { id: 92, orcamento_id: 601, descricao: "Mão de obra — troca no quadro (2h)", ficha_tecnica: "",
      quantidade: 1, valor_unitario: 1200, ordem: 2 },
  ];

  // ── A rede ────────────────────────────────────────────────────────────
  // Qualquer endpoint que não seja o da aba responde vazio: o boot do
  // admin.js chama uma dezena deles e todos têm .catch, então falhar em
  // silêncio bastaria — mas vazio deixa o console limpo, que é o que a
  // verificação precisa enxergar.
  var nativo = window.fetch.bind(window);
  var PROX_ORC = 700;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    // O PATCH que MATERIALIZA o pedido ainda sem orçamento. No servidor quem
    // cria é `_garantirOrcamentoDaOs`; aqui a fixture faz o equivalente, para
    // que o fluxo inteiro (clicar em SOLICITADO → modal único) seja testável.
    var mPatch = /\/admin\/orcamentos\/(\d+)$/.exec(url);
    if (mPatch && init && init.method === "PATCH") {
      var osId = Number(mPatch[1]);
      var os = FILA.find(function (o) { return o.id === osId; });
      if (os && !os.orcamento_id) {
        var novo = PROX_ORC++;
        var num = "OR-000" + novo;
        os.orcamento_id = novo; os.orcamento_status = "rascunho"; os.orcamento_numero = num;
        AVULSOS.unshift({ id: novo, numero: num, condominio_id: os.condominio_id,
          condominio_nome: os.condominio_nome, status: "rascunho", origem: "os",
          tipo: "pecas", valor_total: 0, criado_em: new Date().toISOString(),
          os_id: os.id, os_numero: os.numero, os_tecnico_nome: os.tecnico_nome,
          os_chamado_id: os.chamado_id, os_finalizada_em: os.finalizada_em,
          orcamento_observacoes: os.orcamento_observacoes });
      }
      return resp({ orcamento_id: os && os.orcamento_id, orcamento_numero: os && os.orcamento_numero,
                    orcamento_status: "rascunho", orcamento_valor: null });
    }
    // O DELETE do PEDIDO (03/09/2026): desliga a flag e apaga o orçamento
    // vinculado. Na fixture isso é tirar a O.S. da FILA e o documento dos
    // AVULSOS — as duas metades, como na CTE do servidor.
    var mDel = /\/admin\/orcamentos\/(\d+)$/.exec(url);
    if (mDel && init && init.method === "DELETE") {
      var idDel = Number(mDel[1]);
      var iFila = FILA.findIndex(function (o) { return o.id === idDel; });
      if (iFila < 0) {
        return Promise.resolve(new Response(JSON.stringify({ error: "O.S. não encontrada" }),
          { status: 404, headers: { "Content-Type": "application/json" } }));
      }
      var orcDel = FILA[iFila].orcamento_id;
      FILA.splice(iFila, 1);
      var nApagados = 0;
      if (orcDel) {
        var iAv = AVULSOS.findIndex(function (a) { return a.id === orcDel; });
        if (iAv > -1) { AVULSOS.splice(iAv, 1); nApagados = 1; }
      }
      return resp({ ok: true, orcamentos_apagados: nApagados });
    }
    // A aba irmã ganha fixture também: sem ela não dá para comparar as duas
    // lado a lado, que é o ponto do redesenho.
    // As linhas de um avulso (o modal dele não abre sem).
    if (/\/admin\/orcamentos\/avulsos\/\d+\/linhas/.test(url)) return resp(LINHAS);
    if (/\/admin\/orcamentos\/avulsos\/\d+\/destinatarios/.test(url)) return resp([]);
    if (url.indexOf("/admin/orcamentos/avulsos") === 0) return resp(AVULSOS);
    if (url.indexOf("/admin/orcamentos") === 0 && url.indexOf("/itens") > -1) return resp([]);
    if (url.indexOf("/admin/orcamentos") === 0) return resp(FILA);
    // ⚠️ Esta rota devolve um OBJETO, não lista. Devolvendo [] o
    // `_avCarregarOsDoModal` desestrutura `{ os }` como undefined e estoura
    // no forEach — erro no console que é da prévia, não do produto.
    if (/\/admin\/condominios\/\d+\/historico/.test(url)) return resp({ os: [], orcamentos: [] });
    if (url.indexOf("/admin/condominios/lista") === 0) {
      return resp(FILA.map(function (o) { return { id: o.condominio_id, nome: o.condominio_nome }; }));
    }
    if (url.indexOf("/static/") === 0 || url.indexOf("http") === 0) return nativo(input, init);
    return resp([]);
  };
  function resp(obj) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  // ── Depois que o admin.js terminou de subir ───────────────────────────
  // `load` e não `DOMContentLoaded`: o admin.js é `defer` e registra o dele
  // primeiro, então correr no mesmo evento é corrida.
  window.addEventListener("load", function () {
    setTimeout(function () {
      try {
        _orcModoBindEventos();
        _orcBindEventos();
        // ⚠️ ESTE FALTAVA. Sem ele o clique no item da aba irmã não tem
        // handler, e o modal do avulso simplesmente não abria — o que me fez
        // dizer ao Pedro que a prévia não cobria as rotas dele. Cobria; era o
        // bind.
        _avBindEventos();
        _avData = AVULSOS;
        _avRenderTudo();
        _orcData = FILA;
        _orcRenderTudo();
        _orcAtualizarBadge();
        // Entra direto na aba que se quer olhar.
        var btn = document.querySelector('[data-orc-modo="os"]');
        if (btn) btn.click();
      } catch (e) {
        console.error("[prévia] falhou:", e);
      }
    }, 60);
  });
})();
