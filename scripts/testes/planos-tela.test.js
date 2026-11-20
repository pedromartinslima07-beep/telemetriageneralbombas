// A tela de Planos do admin: a rota e as leituras do mês que a lista lê.
//
//   node scripts/testes/planos-tela.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE. Em 04/09/2026 a tela foi reformulada e subiu
// para produção com um erro que nenhuma verificação estática pega: o bloco da
// aba "Sem plano" chamava `linhaSemPlano` ANTES da linha em que ela é
// declarada, e `const` dentro de um bloco vive em temporal dead zone até lá.
// O clique na aba lançava `ReferenceError`, o `_pmRenderTudo` morria no meio, e
// a tabela ficava exatamente como estava. O Pedro: *"eu clico e nada
// acontece"*. `node --check` passa limpo, o detector da skill passa limpo, e a
// tela está quebrada — é a mesma família do `42P08` do CLAUDE.md: só se pega
// EXERCITANDO.
//
// ⚠️ O ERRO É SILENCIOSO. O handler da aba não tem try/catch, então nada
// aparece na tela — só no console, que ninguém abre. Uma aba que não faz nada
// parece uma aba vazia.
//
// Ele recorta as funções REAIS do `public/admin.js` e passa cada plano do
// banco de teste pelas leituras do mês que a lista nova (admin-prev-lista.js)
// usa. Até 20/11/2026 chamava o `_pmRenderTudo()` antigo aba por aba; a
// tabela dele saiu do HTML e a função virou gancho. Não substitui olhar a
// tela — substitui o "achei que estava bom".
//
// ⚠️ NÃO ESCREVE NADA. Lê o banco de TESTE pelo mesmo endpoint que o front usa.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const r = [];
const ok = (nome, cond) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome); };

async function main() {
  const app = express();
  app.use(express.json());
  app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const H = { Authorization: "Bearer " + jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" }) };

  try {
    // ── O contrato do endpoint ───────────────────────────────────────────────
    const resp = await fetch(base + "/planos-manutencao", { headers: H });
    const dados = await resp.json();
    ok("GET /planos-manutencao responde 200", resp.status === 200);
    ok("devolve { planos, sem_plano }", Array.isArray(dados.planos) && Array.isArray(dados.sem_plano));
    ok("cada plano traz o estado do mês",
       dados.planos.every((p) => ["a_fazer", "escalada", "em_campo", "feita"].includes(p.estado)));
    // ⚠️ Nenhum condomínio pode estar nas DUAS listas: quem tem plano ativo não
    // é "sem plano". Se isso quebrar, a tela conta o mesmo prédio duas vezes.
    const comPlano = new Set(dados.planos.filter((p) => p.ativo).map((p) => p.condominio_id));
    ok("nenhum prédio está nas duas listas",
       !dados.sem_plano.some((c) => comPlano.has(c.id)));

    // ── Comentário HTML órfão vira TEXTO NA TELA ─────────────────────────────
    // ⚠️ ACONTECEU EM 04/09/2026, e o Pedro viu antes de mim: ao ancorar um
    // patch no `<!-- ⚠️ AS ABAS FALAM DO MÊS`, eu consumi o `<!--` e não o
    // reemiti — o corpo inteiro do comentário passou a ser desenhado como texto
    // no meio da barra de abas. O navegador não reclama, o `node --check` não
    // olha HTML, e o detector da skill não pega: só se vê OLHANDO.
    //
    // A conta é simples: todo `-->` precisa de um `<!--` aberto antes dele.
    const html = fs.readFileSync(path.join(__dirname, "../../public/admin.html"), "utf8");
    let prof = 0; const orfaos = [];
    for (const m of html.matchAll(/<!--|-->/g)) {
      if (m[0] === "<!--") prof++;
      else if (--prof < 0) { orfaos.push(html.slice(0, m.index).split("\n").length); prof = 0; }
    }
    ok("admin.html não tem comentário órfão virando texto na tela",
       orfaos.length === 0 && prof === 0);
    if (orfaos.length) console.log("    → `-->` sem abertura nas linhas:", orfaos.join(", "));
    if (prof > 0) console.log("    →", prof, "comentário(s) sem fechar");

    // ── As leituras do mês, plano por plano ─────────────────────────────────
    // ⚠️ DESDE 20/11/2026 A TELA É O MOLDE (admin-prev-lista.js). O cartão
    // antigo com as abas e a tabela por zona saiu do HTML, e `_pmRenderTudo`
    // virou um gancho vazio que o molde embrulha. O que a tela nova lê do
    // admin.js são estas funções — se uma delas estourar num plano real, a
    // lista morre no meio, do mesmo jeito silencioso de 04/09.
    const js = fs.readFileSync(path.join(__dirname, "../../public/admin.js"), "utf8");
    const ini = js.indexOf("function _pmFmtData");
    const fim = js.indexOf("function _pmSelecionadosDespachaveis");
    ok("achei o bloco _pm* no admin.js", ini >= 0 && fim > ini);

    const rede = global.fetch.bind(global);
    global.fetch = async () => { throw new Error("as leituras não devem fazer request"); };
    global.authHeaders = () => ({});
    global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    global.PM_PERIOD_PRESETS = [
      { dias: 30, label: "Mensal" }, { dias: 90, label: "Trimestral" },
      { dias: 180, label: "Semestral" }, { dias: 365, label: "Anual" },
    ];

    // eslint-disable-next-line no-eval
    eval(js.slice(ini, fim));
    // Estado que o bloco recortado não declara (vive acima dele no arquivo).
    _pmData = dados.planos;
    _pmSemPlano = dados.sem_plano;
    _pmMes = null;

    const BALDES = ["sem-dono", "com-dono", "em-campo", "feitas", "fora-do-mes"];
    let erro = null;
    try {
      for (const p of dados.planos) {
        if (p.ativo && !BALDES.includes(_pmBaldeDoMes(p))) throw new Error(`plano ${p.id}: balde "${_pmBaldeDoMes(p)}"`);
        if (typeof _pmAtrasada(p) !== "boolean") throw new Error(`plano ${p.id}: _pmAtrasada não é booleano`);
        const s = _pmStatus(p);
        if (!s || typeof s !== "object") throw new Error(`plano ${p.id}: _pmStatus vazio`);
        _pmPeriodLabel(p.periodicidade_dias);
        _pmFmtData(p.proxima_em);
      }
    } catch (e) { erro = e; }
    ok(`as leituras do mês funcionam em todos os ${dados.planos.length} planos`, !erro);
    if (erro) console.log("    " + erro.constructor.name + ": " + erro.message);
    ok("o mês por extenso e os vizinhos", _pmMesPorExtenso("2026-10") === "outubro de 2026"
       && _pmMesVizinho("2026-12", 1) === "2027-01" && _pmMesVizinho("2026-01", -1) === "2025-12");

    // O gancho: quem grava chama `_pmRenderTudo`, e a lista nova (e a coluna
    // de preventiva dos Condomínios) redesenha porque embrulha esta função.
    ok("_pmRenderTudo existe e não estoura", (() => { try { _pmRenderTudo(); return true; } catch { return false; } })());
    const molde = fs.readFileSync(path.join(__dirname, "../../public/admin-prev-lista.js"), "utf8");
    ok("a tela nova embrulha _pmRenderTudo", molde.includes("window._pmRenderTudo = function"));

    // ── O seletor de mês ─────────────────────────────────────────────────────
    // ⚠️ Sem ele, escalar para outubro gravava certo e a tela dizia "Sem dono".
    const outubro = await (await rede(base + "/planos-manutencao?mes=2026-10", { headers: H })).json();
    ok("o endpoint aceita ?mes e devolve qual resolveu", outubro.mes === "2026-10");
    ok("e recusa mês malformado",
       (await rede(base + "/planos-manutencao?mes=setembro", { headers: H })).status === 400);
    ok("cada plano diz se é trabalho DAQUELA competência",
       outubro.planos.every((p) => typeof p.do_mes === "boolean"));

    // ⚠️ O plano fora da competência sai dos baldes do mês (as visões Sem
    // responsável, Com responsável, Em campo e Feitas da tela nova), mas fica
    // em "Todas" — a visão de cadastro.
    _pmData = outubro.planos; _pmMes = "2026-10";
    const fora = outubro.planos.filter((p) => p.ativo && p.do_mes === false);
    if (fora.length) {
      ok("plano fora da competência não entra nos baldes do mês",
         fora.every((p) => _pmBaldeDoMes(p) === "fora-do-mes"));
    } else {
      ok("(sem plano fora da competência no banco de teste — pulei 1)", true);
    }
    _pmData = dados.planos; _pmMes = null;
  } finally {
    // ⚠️ FECHA DE VERDADE ANTES DE SAIR. Com `srv.close()` solto seguido de
    // `process.exit()`, o Node saía com **127** e a assertion do libuv
    // ("UV_HANDLE_CLOSING") — o teste imprimia 23/23 e o CI lia falha. O
    // `fetch` do Node mantém a conexão viva (keep-alive), então o close espera
    // por um socket que ninguém vai fechar: `closeAllConnections` é quem
    // destrava.
    srv.closeAllConnections?.();
    await new Promise((r) => srv.close(r));
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter((x) => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    // ⚠️ `exitCode`, NAO `process.exit()`. Sair na marra logo depois do
    // teardown fazia o Node estourar a assertion do libuv
    // ("UV_HANDLE_CLOSING", src/win/async.c) e SAIR COM 127 — o teste
    // imprimia 23/23 e um CI leria falha. Com o codigo ja definido, o
    // processo termina sozinho e limpo.
    process.exitCode = bons === r.length ? 0 : 1;
  })
  .catch((e) => { console.error("ERRO:", e); process.exitCode = 1; });
