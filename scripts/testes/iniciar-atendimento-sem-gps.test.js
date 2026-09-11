// Iniciar atendimento sem GPS: o técnico está no subsolo, o sinal não chega, e
// o atendimento começa assim mesmo.
//
//   node scripts/testes/iniciar-atendimento-sem-gps.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que rota que GRAVA só se
// prova exercitando o endpoint. Aqui a mudança é justamente um NULL viajando
// por três escritas numa transação (INSERT da O.S. + UPDATE do chamado +
// INSERT em tecnico_localizacoes) — e `tecnico_localizacoes.lat` é NOT NULL,
// então a versão errada deste código não falha na validação: falha no banco,
// dá ROLLBACK e leva junto a O.S. que tinha acabado de nascer. `node --check`
// não enxerga nada disso.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

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

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = { chamados: [] };

  try {
    const condos = await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1");
    if (!condos.rows.length) throw new Error("preciso de 1 condomínio no banco de teste");
    const condoId = condos.rows[0].id;

    const gestor = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!gestor.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const H = {
      Authorization: "Bearer " + jwt.sign(
        { id: gestor.rows[0].id, role: gestor.rows[0].role },
        process.env.JWT_SECRET, { expiresIn: "10m" }
      ),
      "Content-Type": "application/json",
    };

    const tec = await pool.query(
      `SELECT t.id, t.usuario_id FROM tecnicos t
        JOIN usuarios u ON u.id = t.usuario_id AND u.role = 'tecnico'
       WHERE t.ativo = true LIMIT 1`
    );
    if (!tec.rows.length) {
      console.log("(pulado: nenhum técnico com login no banco de teste)");
      server.close();
      await pool.end();
      return;
    }
    const tecnicoId = tec.rows[0].id;
    const HT = {
      Authorization: "Bearer " + jwt.sign(
        { id: tec.rows[0].usuario_id, role: "tecnico" },
        process.env.JWT_SECRET, { expiresIn: "10m" }
      ),
      "Content-Type": "application/json",
    };

    // A posição anterior do técnico. Ela precisa continuar de pé depois de um
    // atendimento sem GPS: "não sei onde ele está agora" não pode ser gravado
    // como "ele não está em lugar nenhum".
    const posAntes = await pool.query(
      "SELECT lat, lng FROM tecnico_localizacoes WHERE tecnico_id=$1", [tecnicoId]
    );

    const criar = async (titulo) => {
      const res = await fetch(base + "/chamados", {
        method: "POST", headers: H,
        body: JSON.stringify({
          condominio_id: condoId, titulo, categoria: "outro", prioridade: "p3",
          descricao: "chamado de teste do inicio sem GPS", tecnico_id: tecnicoId,
        }),
      });
      const ch = await res.json();
      if (!ch.id) throw new Error("POST /chamados falhou: " + JSON.stringify(ch));
      lixo.chamados.push(ch.id);
      return ch;
    };

    const iniciar = (id, body) => fetch(base + "/chamados/" + id + "/iniciar-atendimento", {
      method: "POST",
      headers: body === undefined ? { Authorization: HT.Authorization } : HT,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // ── Subsolo: corpo vazio, nenhuma coordenada ──────────────────────────
    // É exatamente o que o app manda agora quando o GPS não responde:
    // body: geo || {} em iniciarAtendimento (app/public/app.js).
    const ch = await criar("Inicio sem GPS · corpo vazio");
    const res1 = await iniciar(ch.id, {});
    const j1 = await res1.json();
    ok("inicia sem coordenada (200)", res1.status === 200);
    ok("e a O.S. nasce mesmo assim", !!j1.ordem_servico?.id);
    ok("com o chamado em atendimento", j1.status === "em_atendimento");

    const os1 = await pool.query(
      "SELECT chegada_em, chegada_lat, chegada_lng FROM ordens_servico WHERE chamado_id=$1", [ch.id]
    );
    ok("chegada_em é gravada (a hora é fato, o lugar não)", os1.rows[0]?.chegada_em !== null);
    ok("chegada_lat fica NULL", os1.rows[0]?.chegada_lat === null);
    ok("chegada_lng fica NULL", os1.rows[0]?.chegada_lng === null);

    const chDb = await pool.query("SELECT status FROM chamados WHERE id=$1", [ch.id]);
    ok("o chamado ficou mesmo em_atendimento no banco", chDb.rows[0].status === "em_atendimento");

    // ⚠️ A escrita acessória não pode ter derrubado a transação nem apagado o
    // rastro anterior do técnico.
    const posDepois = await pool.query(
      "SELECT lat, lng FROM tecnico_localizacoes WHERE tecnico_id=$1", [tecnicoId]
    );
    ok("sem GPS não mexe em tecnico_localizacoes",
       posDepois.rows.length === posAntes.rows.length &&
       String(posDepois.rows[0]?.lat) === String(posAntes.rows[0]?.lat));

    // ── Sem corpo nenhum: nem Content-Type ────────────────────────────────
    const ch2 = await criar("Inicio sem GPS · sem corpo");
    const res2 = await iniciar(ch2.id, undefined);
    ok("sem corpo algum também inicia (200)", res2.status === 200);

    // ── Com GPS: o caminho normal não pode ter regredido ──────────────────
    const ch3 = await criar("Inicio sem GPS · com coordenada");
    const res3 = await iniciar(ch3.id, { lat: -23.55, lng: -46.63, precisao_m: 12 });
    ok("com coordenada continua 200", res3.status === 200);
    const os3 = await pool.query(
      "SELECT chegada_lat, chegada_lng FROM ordens_servico WHERE chamado_id=$1", [ch3.id]
    );
    ok("e a coordenada é gravada", Number(os3.rows[0]?.chegada_lat).toFixed(2) === "-23.55");
    const pos3 = await pool.query(
      "SELECT lat FROM tecnico_localizacoes WHERE tecnico_id=$1", [tecnicoId]
    );
    ok("com coordenada, o mapa do técnico é atualizado",
       Number(pos3.rows[0]?.lat).toFixed(2) === "-23.55");

    // ── Meia coordenada é payload quebrado, não "sem GPS" ─────────────────
    const ch4 = await criar("Inicio sem GPS · so lat");
    ok("lat sem lng devolve 400", (await iniciar(ch4.id, { lat: -23.55 })).status === 400);
    ok("lng sem lat devolve 400", (await iniciar(ch4.id, { lng: -46.63 })).status === 400);
    ok("lat não-numérica devolve 400",
       (await iniciar(ch4.id, { lat: "aqui", lng: "ali" })).status === 400);
    ok("fora de range devolve 400", (await iniciar(ch4.id, { lat: 200, lng: -46.63 })).status === 400);
    const ch4Db = await pool.query("SELECT status FROM chamados WHERE id=$1", [ch4.id]);
    ok("e nenhum deles iniciou o atendimento", ch4Db.rows[0].status !== "em_atendimento");
    const os4 = await pool.query("SELECT id FROM ordens_servico WHERE chamado_id=$1", [ch4.id]);
    ok("nem criou O.S.", os4.rows.length === 0);

    // ── Idempotência preservada ───────────────────────────────────────────
    const res5 = await iniciar(ch.id, {});
    const j5 = await res5.json();
    ok("iniciar de novo devolve a mesma O.S.", j5.ordem_servico?.id === j1.ordem_servico?.id);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of lixo.chamados) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM ordens_servico WHERE chamado_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    }
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "OK  " : "FALHOU  ") + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
