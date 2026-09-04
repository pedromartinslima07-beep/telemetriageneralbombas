// A tela de Planos do admin renderiza — todas as abas, com dados de verdade.
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
// Ele monta um DOM de mentira (o mínimo que o render toca), recorta as funções
// REAIS do `public/admin.js` e chama `_pmRenderTudo()` uma vez por aba. Não
// substitui olhar a tela — substitui o "achei que estava bom".
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

// ── O DOM de mentira ────────────────────────────────────────────────────────
// Só o que o `_pmRenderTudo` toca. Um elemento que ele peça e não exista tem de
// devolver algo com as mesmas formas, senão o teste falha por causa do dublê e
// não do código.
function montarDom() {
  const feitos = {};
  const el = (id) => (feitos[id] ||= {
    id, innerHTML: "", textContent: "", style: {}, value: "",
    querySelector: () => ({ textContent: "" }),
    querySelectorAll: () => [],
    addEventListener() {},
  });
  global.document = {
    getElementById: el,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
  };
  return { el, feitos };
}

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

    // ── O render, aba por aba ────────────────────────────────────────────────
    const js = fs.readFileSync(path.join(__dirname, "../../public/admin.js"), "utf8");
    const ini = js.indexOf("function _pmFmtData");
    const fim = js.indexOf("function _pmAtualizarBulkBar");
    ok("achei o bloco _pm* no admin.js", ini >= 0 && fim > ini);

    const { el } = montarDom();
    global.fetch = async () => { throw new Error("sem rede no harness"); };
    global.authHeaders = () => ({});
    global.alert = () => {}; global.confirm = () => false; global.prompt = () => null;
    global._waEscaparHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    global.kpiCard = (ico, val, label) => `[${label}=${val}]`;
    global.PM_PERIOD_PRESETS = [
      { dias: 30, label: "Mensal" }, { dias: 90, label: "Trimestral" },
      { dias: 180, label: "Semestral" }, { dias: 365, label: "Anual" },
    ];

    // eslint-disable-next-line no-eval
    eval(js.slice(ini, fim));
    // Estado que o bloco recortado não declara (vive acima dele no arquivo).
    _pmData = dados.planos;
    _pmSemPlano = dados.sem_plano;
    _pmSelecionados = new Set();
    _pmZonasCache = [];
    _pmTecnicosCache = [];
    _pmZonaEditando = null;
    _pmMenuAberto = null;
    _pmAtualizarBulkBar = () => {};

    const ABAS = ["todos", "sem-dono", "com-dono", "em-campo", "feitas", "sem-plano", "inativos"];
    for (const aba of ABAS) {
      _pmTabAtiva = aba;
      let erro = null;
      try { _pmRenderTudo(); } catch (e) { erro = e; }
      ok(`aba "${aba}" renderiza sem estourar`, !erro);
      if (erro) console.log("    " + erro.constructor.name + ": " + erro.message);
    }

    // ⚠️ A ABA "SEM PLANO" TEM DE DESENHAR LINHA — foi ela que quebrou. Contar
    // "renderizou sem estourar" não bastaria: com o `return` cedo demais ela
    // desenharia zero linha e passaria verde.
    _pmTabAtiva = "sem-plano";
    _pmRenderTudo();
    const htmlSemPlano = el("pmTableBody").innerHTML;
    ok("a aba \"Sem plano\" desenha uma linha por prédio",
       (htmlSemPlano.match(/<tr/g) || []).length === dados.sem_plano.length);
    ok("e a linha dela oferece criar o plano", htmlSemPlano.includes("criar-para"));

    // O menu "⋯" é outro caminho de render, e só existe com um id aberto.
    const ativo = dados.planos.find((p) => p.ativo);
    if (ativo) {
      _pmTabAtiva = "todos"; _pmMenuAberto = ativo.id;
      _pmRenderTudo();
      ok("o menu de ações desenha quando aberto",
         el("pmTableBody").innerHTML.includes('class="pm-menu"'));
      _pmMenuAberto = null;
    }

    // O prédio é o sujeito da linha — se `.pm-predio` sumir, a hierarquia que
    // custou este passe voltou ao que era.
    _pmTabAtiva = "todos";
    _pmRenderTudo();
    ok("a linha do plano tem o prédio como sujeito",
       el("pmTableBody").innerHTML.includes('class="pm-predio"'));
    ok("e a coluna do mês desenha o selo de estado",
       el("pmTableBody").innerHTML.includes('class="pm-selo"'));
  } finally {
    srv.close();
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter((x) => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exit(bons === r.length ? 0 : 1);
  })
  .catch((e) => { console.error("ERRO:", e); process.exit(1); });
