// O que a preventiva cobre (migration 110).
//
//   node scripts/testes/plano-sistemas.test.js
//
// O QUE ELE PROVA (rotas de /planos-manutencao, banco de teste):
//   - GET /sistemas devolve a lista fixa, na ordem;
//   - POST grava as chaves na ordem da lista (não na ordem mandada) e sem
//     repetição; sem sistemas, nasce vazio;
//   - chave desconhecida é recusada (400) e não grava nada;
//   - PATCH troca o escopo; PATCH sem o campo não apaga o que estava;
//   - o GET da lista traz `sistemas`;
//   - o leitor do texto do Omie reconhece os casos reais (sem bomba, gerador,
//     reservatórios, "FOTOVOTAICO" com o erro de digitação de lá).
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou.
require("dotenv").config({ quiet: true });
const express = require("express");
const jwt = require("jsonwebtoken");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const { pool } = require("../../src/db");
const { sistemasDoTexto } = require("../escopo-preventivas-omie");

const r = [];
const ok = (nome, cond) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome); };
const NOME = "TESTE plano-sistemas";
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function limpar() {
  await pool.query(`DELETE FROM condominios WHERE nome = $1`, [NOME]);
}

async function main() {
  await limpar();
  const cid = (await pool.query(`INSERT INTO condominios (nome, ativo) VALUES ($1, TRUE) RETURNING id`, [NOME])).rows[0].id;
  const admin = (await pool.query(`SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0]?.id || 1;

  const app = express();
  app.use(express.json());
  app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/planos-manutencao`;
  const H = { Authorization: "Bearer " + jwt.sign({ id: admin, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" }), "Content-Type": "application/json" };
  const req = async (m, p, corpo) => { const x = await fetch(url + p, { method: m, headers: H, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: x.status, j: await x.json().catch(() => ({})) }; };
  const base = { condominio_id: cid, titulo: "Preventiva", periodicidade_dias: 30, proxima_em: "2026-12-01" };

  try {
    const s = await req("GET", "/sistemas");
    ok("GET /sistemas devolve a lista fixa", s.status === 200 && s.j.sistemas.length >= 12 && s.j.sistemas[0].chave === "bombas");

    const a = await req("POST", "", { ...base, sistemas: ["quadro", "bombas", "quadro"] });
    ok("POST grava na ordem da lista e sem repetir", a.status === 201 && igual(a.j.sistemas, ["bombas", "quadro"]));
    const b = await req("POST", "", base);
    ok("sem sistemas, nasce vazio", b.status === 201 && igual(b.j.sistemas, []));

    const ruim = await req("POST", "", { ...base, sistemas: ["bombas", "foguete"] });
    ok("chave desconhecida: 400 com o nome dela", ruim.status === 400 && /foguete/.test(ruim.j.error || ""));
    ok("e não grava nada", (await pool.query(`SELECT COUNT(*)::int n FROM planos_manutencao WHERE condominio_id = $1`, [cid])).rows[0].n === 2);
    ok("sistemas que não é lista: 400", (await req("PATCH", `/${a.j.id}`, { sistemas: "bombas" })).status === 400);

    const p = await req("PATCH", `/${a.j.id}`, { sistemas: ["exaustao_piscina"] });
    ok("PATCH troca o escopo", p.status === 200 && igual(p.j.sistemas, ["exaustao_piscina"]));
    const p2 = await req("PATCH", `/${a.j.id}`, { titulo: "Exaustão" });
    ok("PATCH sem o campo não apaga o escopo", p2.status === 200 && igual(p2.j.sistemas, ["exaustao_piscina"]));

    const l = await req("GET", `?condominio_id=${cid}`);
    const doA = (Array.isArray(l.j) ? l.j : l.j.planos || []).find(x => x.id === a.j.id);
    ok("o GET da lista traz os sistemas", !!doA && igual(doA.sistemas, ["exaustao_piscina"]));
  } finally {
    srv.close();
  }

  // O leitor do texto da nota do Omie (casos reais de outubro/novembro de 2026).
  ok("bombas + quadro", igual(sistemasDoTexto("SERVIÇOS DE MANUTENÇÃO E CONSERVAÇÃO PREVENTIVA MENSAL:||**SISTEMA DE BOMBAS|**QUADRO DE COMANDO ELÉTRICO|"), ["bombas", "quadro"]));
  ok("Malbec, sem bomba", igual(sistemasDoTexto("* SISTEMA DE EXAUSTÃO DA CHURRASQUEIRA|* SISTEMA DOS MOTORES DE PRESSURIZAÇÃO DE ESCADAS"), ["exaustao_churrasqueira", "pressurizacao_escadas"]));
  ok("Habita, com o erro de digitação do Omie", igual(sistemasDoTexto("SISTEMA DE ENERGIA FOTOVOTAICO"), ["fotovoltaico"]));
  ok("Videre, com gerador", sistemasDoTexto("SISTEMA DE BOMBAS|QUADRO DE COMANDO ELÉTRICO|GRUPO GERADOR|VALOR GERADOR: R$ 560,00").includes("gerador"));
  ok("Air Club 990, reservatórios (e não ralos e caixas)", igual(sistemasDoTexto("SISTEMA DOS RESERVATÓRIOS DE ÁGUA POTÁVEL, CAIXA DE INSPEÇÃO, RALOS E PRUMADAS PLUVIAIS."), ["reservatorios_prumadas"]));
  ok("Atua 1600, caixa coletora", igual(sistemasDoTexto("CAIXA DE PASSAGEM COLETORA INFERIOR E SUPERIOR"), ["caixa_coletora"]));
}

main()
  .catch(e => { console.error(e); r.push({ nome: "exceção", cond: false }); })
  .finally(async () => {
    await limpar().catch(e => console.error("limpeza:", e.message));
    await pool.end();
    const falhas = r.filter(x => !x.cond).length;
    console.log(`\n${r.length - falhas}/${r.length} passaram`);
    process.exit(falhas ? 1 : 0);
  });
