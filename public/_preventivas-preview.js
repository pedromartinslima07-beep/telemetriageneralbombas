// Ver o cabeçalho de `_preventivas-preview.html`.
//
// ⚠️ ARQUIVO SEPARADO POR CAUSA DA CSP: o helmet usa `script-src 'self'`, então
// `<script>` embutido na página NÃO EXECUTA — e sem erro visível, que é o que
// engana. Mesmo motivo de `_aprovados-preview.js` e `_orcamentos-preview.js`.
(function () {
  "use strict";

  function d(dia) {
    const h = new Date();
    const dt = new Date(h.getFullYear(), h.getMonth(), dia);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  const hoje = new Date();
  const MES = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  // ⚠️ A FIXTURE COBRE OS QUATRO ESTADOS E AS DUAS ORIGENS de responsável, mais
  // o prédio sem zona e o prédio sem técnico nenhum — que é o caso REAL em
  // produção (11 técnicos ativos, uma zona com responsável). Fixture só com o
  // caminho feliz desenha uma tela que a operação não tem.
  const P = (id, nome, zona, extra) => Object.assign({
    id, titulo: "Preventiva mensal", descricao: null, periodicidade_dias: 30,
    proxima_em: d(12), ultima_em: null,
    condominio_id: id * 10, condominio_nome: nome, condominio_razao_social: nome,
    bairro: null, cidade: "São Paulo", zona,
    atrasada: false,
    atribuido_tecnico_id: null, atribuido_tecnico_nome: null,
    atribuido_em: null, atribuido_por_nome: null,
    zona_tecnico_id: null, zona_tecnico_nome: null,
    chamado_aberto_id: null, chamado_aberto_status: null,
    chamado_fechado_id: null, fechado_em: null, feita_no_mes: false,
    estado: "a_fazer", tecnico_id: null, tecnico_nome: null, tecnico_origem: null,
  }, extra);

  const PLANOS = [
    // Zona Leste — a que tem atraso, e por isso sobe na lista
    P(1, "Ed. Vila Formosa", "Zona Leste", {
      proxima_em: d(1), atrasada: true,
      zona_tecnico_id: 2, zona_tecnico_nome: "Cleber Nogueira",
      tecnico_id: 2, tecnico_nome: "Cleber Nogueira", tecnico_origem: "zona" }),
    P(2, "Res. Tatuapé Park", "Zona Leste", {
      proxima_em: d(3), atrasada: true,
      zona_tecnico_id: 2, zona_tecnico_nome: "Cleber Nogueira",
      tecnico_id: 2, tecnico_nome: "Cleber Nogueira", tecnico_origem: "zona" }),
    // Escalada à mão para alguém que NÃO é o da zona — o caso que a tela criou
    P(3, "Ed. Anália Franco", "Zona Leste", {
      estado: "escalada",
      atribuido_tecnico_id: 5, atribuido_tecnico_nome: "Wesley Antunes",
      atribuido_por_nome: "Marcelo (Gestor)", atribuido_em: new Date().toISOString(),
      zona_tecnico_id: 2, zona_tecnico_nome: "Cleber Nogueira",
      tecnico_id: 5, tecnico_nome: "Wesley Antunes", tecnico_origem: "escala" }),

    // Zona Sul — a maior em produção (24 planos), aqui com o técnico em campo
    P(4, "Res. Saint Antoine", "Zona Sul", {
      estado: "em_campo", chamado_aberto_id: 73, chamado_aberto_status: "em_atendimento",
      zona_tecnico_id: 1, zona_tecnico_nome: "Marcos Ribeiro",
      tecnico_id: 1, tecnico_nome: "Marcos Ribeiro", tecnico_origem: "zona" }),
    P(5, "Ed. Moema Prime", "Zona Sul", {
      zona_tecnico_id: 1, zona_tecnico_nome: "Marcos Ribeiro",
      tecnico_id: 1, tecnico_nome: "Marcos Ribeiro", tecnico_origem: "zona" }),
    // ⚠️ Zona SEM responsável: o normal em produção, e a linha que a tela
    // precisa saber dizer sem parecer defeito.
    P(6, "Ed. Campo Belo", "Zona Sul", { proxima_em: d(20) }),

    // Sem zona nenhuma — 4 prédios estão assim em produção
    P(7, "Ed. Guarulhos Centro", null, { proxima_em: d(22) }),

    // Feitas: uma pelo chamado fechado, outra pelo `ultima_em` (execução antiga)
    P(8, "Res. Aurora", "Zona Oeste", {
      estado: "feita", chamado_fechado_id: 61,
      fechado_em: new Date(hoje.getFullYear(), hoje.getMonth(), 2).toISOString(),
      zona_tecnico_id: 1, zona_tecnico_nome: "Marcos Ribeiro",
      tecnico_id: 1, tecnico_nome: "Marcos Ribeiro", tecnico_origem: "zona" }),
    P(9, "Ed. Pinheiros 400", "Zona Oeste", {
      estado: "feita", feita_no_mes: true, ultima_em: d(1),
      zona_tecnico_id: 1, zona_tecnico_nome: "Marcos Ribeiro",
      tecnico_id: 1, tecnico_nome: "Marcos Ribeiro", tecnico_origem: "zona" }),
  ];

  const TECNICOS = [
    { id: 1, nome: "Marcos Ribeiro", abertos: 3 },
    { id: 2, nome: "Cleber Nogueira", abertos: 1 },
    { id: 5, nome: "Wesley Antunes", abertos: 0 },
    { id: 7, nome: "Jonas Prado", abertos: 5 },
  ];

  // ── A rede ────────────────────────────────────────────────────────────
  const nativo = window.fetch.bind(window);
  const ok = (o) => Promise.resolve(new Response(JSON.stringify(o), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));

  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";

    // O despacho MEXE na fixture, para o ciclo inteiro ser testável: marcar,
    // enviar, e ver o estado e o responsável mudarem na volta.
    if (url.indexOf("/operador/preventivas/atribuir") === 0 && init && init.method === "POST") {
      const body = JSON.parse(init.body);
      const tec = TECNICOS.find((t) => t.id === Number(body.tecnico_id));
      for (const id of body.plano_ids) {
        const p = PLANOS.find((x) => x.id === id);
        if (!p) continue;
        if (tec) {
          p.atribuido_tecnico_id = tec.id; p.atribuido_tecnico_nome = tec.nome;
          p.atribuido_por_nome = "Prévia"; p.atribuido_em = new Date().toISOString();
          p.estado = "escalada"; p.tecnico_id = tec.id;
          p.tecnico_nome = tec.nome; p.tecnico_origem = "escala";
        } else {
          p.atribuido_tecnico_id = null; p.atribuido_tecnico_nome = null;
          p.estado = "a_fazer"; p.tecnico_id = p.zona_tecnico_id;
          p.tecnico_nome = p.zona_tecnico_nome;
          p.tecnico_origem = p.zona_tecnico_id ? "zona" : null;
        }
      }
      return ok({ ok: true, mes: MES, atribuidos: body.plano_ids.length, ignorados: [], tecnico_id: body.tecnico_id });
    }

    if (url.indexOf("/operador/preventivas") === 0) {
      // ⚠️ O mês pedido é respeitado, para a navegação ← → não mentir: só o mês
      // corrente tem fixture, os outros vêm vazios — que é o estado vazio real
      // de um mês sem plano vencendo, e vale a pena poder olhar para ele.
      const m = new URL(url, location.origin).searchParams.get("mes") || MES;
      return ok({
        mes: m, competencia: m + "-01",
        planos: m === MES ? PLANOS : [],
        tecnicos: TECNICOS,
      });
    }
    if (url.indexOf("/static/") === 0 || url.indexOf("http") === 0) return nativo(input, init);
    return ok([]);
  };

  // ⚠️ A PRÉVIA EMPRESTA O `localStorage`, NÃO O TOMA. Sem token o
  // `operador-preventivas.js` manda para o `/login` no boot; deixar
  // `token = "preview"` para trás desloga o painel de verdade no clique
  // seguinte. Mesma pegadinha já registrada nas prévias irmãs.
  const CHAVES = ["token", "user", "userRole"];
  const guardado = {};
  CHAVES.forEach((k) => { guardado[k] = localStorage.getItem(k); });
  localStorage.setItem("token", "preview");
  localStorage.setItem("userRole", "operador");
  localStorage.setItem("user", JSON.stringify({ nome: "Prévia", role: "operador" }));
  window.addEventListener("pagehide", function () {
    CHAVES.forEach((k) => {
      if (guardado[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, guardado[k]);
    });
  });
})();
