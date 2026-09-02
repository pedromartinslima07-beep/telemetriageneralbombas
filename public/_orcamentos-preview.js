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
  var HOJE = new Date();
  var d = function (dias) {
    var x = new Date(HOJE); x.setDate(x.getDate() - dias); return x.toISOString();
  };
  var FILA = [
    { id: 101, numero: "OS-2026-0042", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações",
      tecnico_nome: "Marcos Ribeiro", chamado_id: 73, finalizada_em: d(0), criado_em: d(0),
      orcamento_necessario: true,
      orcamento_observacoes: "Bomba 1 com vedação danificada e vazamento pelo selo mecânico. Precisa trocar o pressostato e o selo. Sugiro substituição completa do conjunto — tempo estimado 4h.",
      orcamento_id: null, orcamento_status: null, orcamento_valor: null, orcamento_numero: null },
    { id: 102, numero: "OS-2026-0041", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações",
      tecnico_nome: "Cleber Nogueira", chamado_id: null, finalizada_em: d(1), criado_em: d(1),
      orcamento_necessario: true,
      orcamento_observacoes: "Quadro de comando com contatora chiando. Trocar antes que trave a bomba de recalque.",
      orcamento_id: 501, orcamento_status: "rascunho", orcamento_valor: 1840, orcamento_numero: "OR-000501" },
    { id: 103, numero: "OS-2026-0038", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações",
      tecnico_nome: "Marcos Ribeiro", chamado_id: 68, finalizada_em: d(9), criado_em: d(9),
      orcamento_necessario: true, orcamento_observacoes: "Boia da cisterna travando. Substituir.",
      orcamento_id: 498, orcamento_status: "aprovado", orcamento_valor: 620, orcamento_numero: "OR-000498",
      orcamento_aprovado_em: d(6), aprovado_por_nome: "Marcelo (Gestor)" },
    { id: 104, numero: "OS-2026-0040", condominio_id: 2, condominio_nome: "Edifício Aurora Paulista",
      tecnico_nome: "Wesley Antunes", chamado_id: 71, finalizada_em: d(2), criado_em: d(2),
      orcamento_necessario: true, orcamento_observacoes: "",
      orcamento_id: null, orcamento_status: null, orcamento_valor: null, orcamento_numero: null },
    { id: 105, numero: "OS-2026-0035", condominio_id: 3, condominio_nome: "Residencial Vila Mariana",
      tecnico_nome: "Jonas Prado", chamado_id: null, finalizada_em: d(14), criado_em: d(14),
      orcamento_necessario: true,
      orcamento_observacoes: "Motor da pressurizadora com rolamento gasto. Orçamento de retífica ou troca.",
      orcamento_id: 495, orcamento_status: "enviado", orcamento_valor: 3250, orcamento_numero: "OR-000495" },
    { id: 106, numero: "OS-2026-0031", condominio_id: 4, condominio_nome: "Edifício Mont Blanc",
      tecnico_nome: "Cleber Nogueira", chamado_id: null, finalizada_em: d(22), criado_em: d(22),
      orcamento_necessario: true, orcamento_observacoes: "Troca do painel inteiro — cliente achou caro.",
      orcamento_id: 490, orcamento_status: "rejeitado", orcamento_valor: 8900, orcamento_numero: "OR-000490",
      orcamento_motivo_rejeicao: "Síndico pediu para reavaliar só a contatora." },
  ];

  var AVULSOS = [
    { id: 601, numero: "OR-000601", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações",
      status: "rascunho", origem: "admin", tipo: "pecas", valor_total: 1840, criado_em: d(1) },
    { id: 602, numero: "OR-000602", condominio_id: 1, condominio_nome: "Condomínio Parque das Nações",
      status: "enviado", origem: "admin", tipo: "limpeza_reservatorio", valor_total: 2200, criado_em: d(4) },
    { id: 603, numero: "OR-000603", condominio_id: 2, condominio_nome: "Edifício Aurora Paulista",
      status: "aprovado", origem: "ia", tipo: "pecas", valor_total: 980, criado_em: d(7),
      respondido_em: d(2), respondido_nome: "Marcelo", resposta_tratada_em: null },
    { id: 604, numero: "OR-000604", condominio_id: 3, condominio_nome: "Residencial Vila Mariana",
      status: "rascunho", origem: "admin", tipo: "dedetizacao", valor_total: 0, criado_em: d(11) },
  ];

  // ── A rede ────────────────────────────────────────────────────────────
  // Qualquer endpoint que não seja o da aba responde vazio: o boot do
  // admin.js chama uma dezena deles e todos têm .catch, então falhar em
  // silêncio bastaria — mas vazio deixa o console limpo, que é o que a
  // verificação precisa enxergar.
  var nativo = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    // A aba irmã ganha fixture também: sem ela não dá para comparar as duas
    // lado a lado, que é o ponto do redesenho.
    if (url.indexOf("/admin/orcamentos/avulsos") === 0) return resp(AVULSOS);
    if (url.indexOf("/admin/orcamentos") === 0 && url.indexOf("/itens") > -1) return resp([]);
    if (url.indexOf("/admin/orcamentos") === 0) return resp(FILA);
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
