// A régua de prioridade contra a MINUTA — cláusula 7 ("DOS CHAMADOS E SLA
// P1-P4") e cláusula 8 ("DO ATENDIMENTO 24 HORAS").
//
//   node scripts/testes/prioridade-minuta.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE: prioridade escolhe prazo de comparecimento, e
// prazo de comparecimento é obrigação contratual. Uma linha trocada em
// `CATEGORIA_PRIORIDADE` ou um número editado em `sla_definicoes` muda o que a
// General se obriga a cumprir, sem nada na tela denunciando. Este arquivo é a
// cópia executável da tabela do contrato: se o banco divergir da minuta, ele
// falha nomeando a cláusula.
//
// ⚠️ Os prazos são lidos do BANCO DE TESTE, não de um mock. É o banco que a
// tela consulta.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const P = require("../../src/services/prioridade.service");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

// A tabela da cláusula 7, em minutos de comparecimento. `null` é "Agendamento".
const MINUTA = {
  p1: { prazo: 3 * 60,  rotulo: "Crítico",          plantao: true  },
  p2: { prazo: 48 * 60, rotulo: "Alto",             plantao: false },
  p3: { prazo: 72 * 60, rotulo: "Programável",      plantao: false },
  p4: { prazo: null,    rotulo: "Baixa criticidade", plantao: false },
};

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = [];

  try {
    const u = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!u.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const token = jwt.sign({ id: u.rows[0].id, role: u.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

    // ── A tabela da cláusula 7 ────────────────────────────────────────────
    const regua = await (await fetch(base + "/chamados/prioridades", { headers: H })).json();
    const porId = Object.fromEntries(regua.prioridades.map((p) => [p.id, p]));

    for (const [id, esperado] of Object.entries(MINUTA)) {
      const p = porId[id];
      ok(`cláusula 7: ${id.toUpperCase()} comparece em ${esperado.prazo === null ? "agendamento" : esperado.prazo / 60 + "h"}`,
         !!p && p.sla_chegada_min === esperado.prazo);
      ok(`cláusula 7: ${id.toUpperCase()} se chama "${esperado.rotulo}"`, !!p && p.rotulo === esperado.rotulo);
      ok(`cláusula 8.1: plantão 24h ${esperado.plantao ? "cobre" : "não cobre"} ${id.toUpperCase()}`,
         !!p && p.plantao === esperado.plantao);
      ok(`${id.toUpperCase()} traz o enquadramento para a tela`,
         !!p && typeof p.enquadramento === "string" && p.enquadramento.length > 40);
    }

    // ── O mapa categoria → prioridade ─────────────────────────────────────
    // ⚠️ Estes pares são o contrato lido: mudar um deles aqui sem mudar a
    // minuta é o teste avisando que alguém mexeu num prazo por engano.
    const ESPERADO = {
      sem_agua: "p1", vazamento: "p2", bomba_falha: "p2",
      nivel_baixo: "p3", ruido: "p3", outro: "p3",
      manutencao: "p4", melhoria: "p4",
    };
    for (const [cat, prio] of Object.entries(ESPERADO)) {
      ok(`"${cat}" sugere ${prio.toUpperCase()}`, P.prioridadeSugerida(cat) === prio);
    }
    ok("categoria desconhecida cai em P3, nunca em P1",
       P.prioridadeSugerida("inexistente") === "p3" && P.prioridadeSugerida(undefined) === "p3");
    ok("a régua da rota bate com o service",
       regua.categorias.every((c) => c.prioridade === P.prioridadeSugerida(c.id)));
    ok("toda categoria tem rótulo para a tela",
       regua.categorias.every((c) => typeof c.rotulo === "string" && c.rotulo.length > 2));
    ok("«melhoria» existe — é o que faz P4 ser sugerível",
       P.CATEGORIAS.includes("melhoria"));

    // ── O default do POST vem da categoria, não de um "p3" fixo ───────────
    const condo = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0];
    const abrir = async (corpo) => {
      const resp = await fetch(base + "/chamados", { method: "POST", headers: H, body: JSON.stringify(corpo) });
      const j = await resp.json();
      if (j.id) lixo.push(j.id);
      return { status: resp.status, j };
    };

    // Prédio sem histórico da categoria, para a recorrência não interferir.
    const semHistorico = await pool.query(
      `SELECT c.id FROM condominios c
        WHERE NOT EXISTS (SELECT 1 FROM chamados ch
                           WHERE ch.condominio_id = c.id AND ch.categoria = 'melhoria'
                             AND ch.criado_em >= NOW() - INTERVAL '30 days')
        ORDER BY c.id LIMIT 1`
    );
    const condoLimpo = semHistorico.rows[0] ? semHistorico.rows[0].id : condo.id;

    const semPrio = await abrir({
      titulo: "Levantamento do barrilete", descricao: "medir e propor adequação",
      condominio_id: condoLimpo, categoria: "melhoria",
    });
    ok("sem prioridade no corpo, a categoria decide (melhoria → P4)",
       semPrio.status === 201 && semPrio.j.prioridade === "p4");

    // ── A recorrência sobe um nível, e agora DIZ que subiu ────────────────
    const seg = await abrir({
      titulo: "Outro levantamento", descricao: "segundo pedido do mesmo tipo",
      condominio_id: condoLimpo, categoria: "melhoria",
    });
    // O primeiro chamado é P4 e a regra ignora P4 no histórico — então o
    // segundo também nasce P4, sem ajuste. É o comportamento da regra, e o
    // teste existe para que mudá-la seja uma decisão, não um efeito colateral.
    ok("P4 no histórico não dispara a recorrência",
       seg.status === 201 && seg.j.prioridade === "p4" && !seg.j.prioridade_ajustada);

    const p2a = await abrir({
      titulo: "Vazamento no barrilete", descricao: "pingando sobre o quadro",
      condominio_id: condoLimpo, categoria: "vazamento",
    });
    ok("vazamento sem histórico nasce P2", p2a.status === 201 && p2a.j.prioridade === "p2");
    ok("e sem aviso de ajuste", !p2a.j.prioridade_ajustada);

    const p2b = await abrir({
      titulo: "Vazamento de novo", descricao: "voltou no mesmo lugar",
      condominio_id: condoLimpo, categoria: "vazamento",
    });
    ok("o segundo vazamento em 30 dias sobe para P1",
       p2b.status === 201 && p2b.j.prioridade === "p1");
    ok("e a resposta CONTA que subiu — não é mais mudo",
       !!p2b.j.prioridade_ajustada &&
       p2b.j.prioridade_ajustada.de === "p2" &&
       p2b.j.prioridade_ajustada.para === "p1" &&
       p2b.j.prioridade_ajustada.motivo === "recorrencia_30_dias" &&
       typeof p2b.j.prioridade_ajustada.texto === "string");

    // ⚠️ P1 é teto: a recorrência não inventa um P0.
    ok("subirUmNivel tem teto em P1", P.subirUmNivel("p1") === "p1");
    ok("e sobe um de cada vez", P.subirUmNivel("p4") === "p3" && P.subirUmNivel("p3") === "p2");

    // ── A escolha explícita continua mandando ─────────────────────────────
    const forcado = await abrir({
      titulo: "Ruído tratado como crítico", descricao: "bomba com barulho e sem reserva",
      condominio_id: condoLimpo, categoria: "ruido", prioridade: "p1",
    });
    ok("cláusula 7.1.c: a triagem pode classificar acima da sugestão",
       forcado.status === 201 && forcado.j.prioridade === "p1");

    // ── A categoria nova é aceita pelas rotas ─────────────────────────────
    const cat = await abrir({
      titulo: "Adequação estética do quadro", descricao: "pintura e identificação",
      condominio_id: condoLimpo, categoria: "melhoria",
    });
    ok("«melhoria» passa na validação de categoria", cat.status === 201);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of lixo) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
