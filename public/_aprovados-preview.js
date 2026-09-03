// Ver o cabeçalho de `_aprovados-preview.html`.
//
// ⚠️ ARQUIVO SEPARADO POR CAUSA DA CSP, não por organização: o helmet usa
// `script-src 'self'`, então `<script>` embutido na página NÃO EXECUTA — e
// sem erro visível, que é o que engana. Mesmo motivo de
// `_operador-preview.js` e `_orcamentos-preview.js` existirem.
(function () {
  "use strict";

  function d(diasAtras) {
    var t = new Date();
    t.setDate(t.getDate() - diasAtras);
    return t.toISOString();
  }

  // Os CINCO estados da placa, um por linha, na ordem em que a tela os
  // desenha. É a fixture inteira desta prévia — se um estado sumir do
  // produto, a linha correspondente aqui fica órfã e aparece.
  var DADOS = [
    // livre — nada aconteceu ainda
    { id: 1, numero: "ORC-2026-0301", tipo: "pecas", status: "aprovado",
      condominio_nome: "Residencial Aurora", bairro: "Perdizes", cidade: "São Paulo",
      aprovado_em: d(1), aprovado_por_nome: "Edmilson Rocha", respondido_cargo: "Síndico",
      os_numero: "OS-2026-0038", os_id: 38,
      linhas: [{ descricao: "Selo mecânico 1.1/4\" em carbono/cerâmica", quantidade: 2 },
               { descricao: "Rolamento blindado 6206 ZZ", quantidade: 4 }],
      chamado_id: null, chamado_status: null,
      exec_os_id: null, exec_os_numero: null, exec_os_finalizada_em: null,
      executado_em: null, executado_por_nome: null },

    // andando — chamado aberto, sem ação na placa
    { id: 2, numero: "ORC-2026-0298", tipo: "limpeza_reservatorio", status: "aprovado",
      condominio_nome: "Residencial Aurora", bairro: "Perdizes", cidade: "São Paulo",
      aprovado_em: d(3), aprovado_por_nome: "Marta Lima", respondido_cargo: "Administradora",
      os_numero: null, os_id: null, linhas: [],
      chamado_id: 73, chamado_status: "em_atendimento",
      exec_os_id: null, exec_os_numero: null, exec_os_finalizada_em: null,
      executado_em: null, executado_por_nome: null },

    // ⚠️ EXECUTADO — o estado que nasceu em 03/09. Selo com O.S. e data, mais
    // o "Ver O.S." ao lado do "Abrir de novo". É a linha que esta prévia
    // existe para olhar: o selo ficou mais comprido que todos os outros.
    { id: 3, numero: "ORC-2026-0295", tipo: "pecas", status: "aprovado",
      condominio_nome: "Edifício Mont Blanc", bairro: "Moema", cidade: "São Paulo",
      aprovado_em: d(9), aprovado_por_nome: "Wesley Antunes", respondido_cargo: "Zelador",
      os_numero: "OS-2026-0031", os_id: 31,
      linhas: [{ descricao: "Motor 3 CV trifásico com retífica do eixo", quantidade: 1 }],
      chamado_id: 68, chamado_status: "fechado",
      exec_os_id: 51, exec_os_numero: "OS-2026-0051", exec_os_finalizada_em: d(2),
      executado_em: null, executado_por_nome: null },

    // feito sem O.S. — chamado fechado à mão, sem O.S. por trás
    // ⚠️ `dedetizacao` e não um tipo inventado: os únicos quatro válidos são
    // os do CHECK da migration 060. Fixture com valor fora do CHECK desenha
    // uma tela que o banco não produz — e foi assim que o rótulo cru
    // "desinfeccao" apareceu no primeiro screenshot desta prévia.
    { id: 4, numero: "ORC-2026-0290", tipo: "dedetizacao", status: "aprovado",
      condominio_nome: "Edifício Mont Blanc", bairro: "Moema", cidade: "São Paulo",
      aprovado_em: d(14), aprovado_por_nome: "Jonas Prado", respondido_cargo: null,
      os_numero: null, os_id: null, linhas: [],
      chamado_id: 61, chamado_status: "fechado",
      exec_os_id: null, exec_os_numero: null, exec_os_finalizada_em: null,
      executado_em: null, executado_por_nome: null },

    // marcado à mão — o de 080, que ganha de todos
    { id: 5, numero: "ORC-2026-0284", tipo: "pecas", status: "aprovado",
      condominio_nome: "Condomínio Parque das Nações", bairro: "Santana", cidade: "São Paulo",
      aprovado_em: d(22), aprovado_por_nome: "Cleber Nogueira", respondido_cargo: null,
      os_numero: null, os_id: null,
      linhas: [{ descricao: "Boia elétrica de nível", quantidade: 2 }],
      chamado_id: null, chamado_status: null,
      exec_os_id: null, exec_os_numero: null, exec_os_finalizada_em: null,
      executado_em: d(5), executado_por_nome: "Marcelo (Gestor)" },
  ];

  // ── A rede ──────────────────────────────────────────────────────────
  // Só duas rotas interessam. O resto responde vazio para o console ficar
  // limpo — é nele que se vê se a tela quebrou.
  var nativo = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf("/operador/orcamentos") === 0) return resp(DADOS);
    if (url.indexOf("/operador/tecnicos") === 0) {
      return resp([{ id: 1, nome: "Marcos Ribeiro", livre: true, abertos: 0 },
                   { id: 2, nome: "Cleber Nogueira", livre: false, abertos: 2 }]);
    }
    // ⚠️ O PDF NÃO SAI AQUI, e é intencional: a prévia é para olhar a placa,
    // não para provar o download. O botão avisa em vez de abrir aba em branco.
    if (/\/ordens-servico\/\d+\/pdf/.test(url)) {
      return Promise.resolve(new Response(
        JSON.stringify({ error: "Prévia: o PDF só sai no sistema de verdade." }),
        { status: 403, headers: { "Content-Type": "application/json" } }));
    }
    if (url.indexOf("/static/") === 0 || url.indexOf("http") === 0) return nativo(input, init);
    return resp([]);
  };
  function resp(obj) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  // ⚠️ A PRÉVIA EMPRESTA O `localStorage`, NÃO O TOMA. Sem token o
  // `operador-orcamentos.js` manda para o `/login` no boot; deixar
  // `token = "preview"` para trás desloga o painel de verdade no clique
  // seguinte. Mesma pegadinha já registrada no `_operador-preview.js`.
  var CHAVES = ["token", "user", "userRole"];
  var guardado = {};
  CHAVES.forEach(function (k) { guardado[k] = localStorage.getItem(k); });
  localStorage.setItem("token", "preview");
  localStorage.setItem("userRole", "operador");
  localStorage.setItem("user", JSON.stringify({ nome: "Prévia", role: "operador" }));
  window.addEventListener("pagehide", function () {
    CHAVES.forEach(function (k) {
      if (guardado[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, guardado[k]);
    });
  });
})();
