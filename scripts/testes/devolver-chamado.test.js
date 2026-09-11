// Devolver chamado: o técnico aceitou, não conseguiu concluir, e a fila recebe
// o chamado de volta.
//
//   node scripts/testes/devolver-chamado.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que rota que GRAVA só se
// prova exercitando o endpoint. Aqui são três escritas numa transação só
// (DELETE da O.S. + UPDATE do chamado + INSERT no histórico) e um DELETE que
// depende de CASCADE/SET NULL de outras tabelas — nada disso `node --check`
// enxerga.
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

    const criar = async (titulo) => {
      const res = await fetch(base + "/chamados", {
        method: "POST", headers: H,
        body: JSON.stringify({
          condominio_id: condoId, titulo, categoria: "outro", prioridade: "p3",
          descricao: "chamado de teste da devolução", tecnico_id: tecnicoId,
        }),
      });
      const ch = await res.json();
      if (!ch.id) throw new Error("POST /chamados falhou: " + JSON.stringify(ch));
      lixo.chamados.push(ch.id);
      return ch;
    };

    const devolver = (id, body, headers) => fetch(base + "/chamados/" + id + "/devolver", {
      method: "POST", headers: headers || HT, body: JSON.stringify(body || {}),
    });

    // ── Caminho completo: aceitou, chegou, começou e devolveu ─────────────
    const ch = await criar("Devolução · caminho completo");
    await fetch(base + "/chamados/" + ch.id + "/a-caminho", { method: "POST", headers: HT });
    // ⚠️ A MESMA SEQUÊNCIA DO APP: `iniciarAtendimento` em `app/public/app.js`
    // bate em `/chegou` ANTES de `/iniciar-atendimento` — quem grava
    // `tecnico_chegou_em` (o SLA de chegada) é aquela rota, não esta.
    await fetch(base + "/chamados/" + ch.id + "/chegou", { method: "POST", headers: HT });
    const ini = await fetch(base + "/chamados/" + ch.id + "/iniciar-atendimento", {
      method: "POST", headers: HT,
      body: JSON.stringify({ lat: -23.55, lng: -46.63, precisao_m: 12 }),
    });
    const iniJson = await ini.json();
    ok("iniciar-atendimento cria a O.S. (200)", ini.status === 200 && !!iniJson.ordem_servico?.id);
    const osId = iniJson.ordem_servico?.id;

    // O motivo é obrigatório — e o chamado não pode escapar no erro.
    ok("sem motivo devolve 400", (await devolver(ch.id, {})).status === 400);
    ok("motivo curto devolve 400", (await devolver(ch.id, { motivo: "oi" })).status === 400);
    const meio = await pool.query("SELECT status FROM chamados WHERE id=$1", [ch.id]);
    ok("e o chamado segue em atendimento", meio.rows[0].status === "em_atendimento");

    const res = await devolver(ch.id, { motivo: "portaria não liberou o acesso ao barrilete" });
    const dep = await res.json();
    ok("devolve (200)", res.status === 200);
    ok("responde o número da O.S. descartada", typeof dep.os_descartada === "string");

    const depois = await pool.query(
      `SELECT status, tecnico_id, tecnico_a_caminho_em, tecnico_chegou_em, primeira_resposta_em
         FROM chamados WHERE id=$1`, [ch.id]
    );
    const d = depois.rows[0];
    ok("status volta para aberto", d.status === "aberto");
    ok("solta o técnico", d.tecnico_id === null);
    ok("limpa tecnico_a_caminho_em", d.tecnico_a_caminho_em === null);
    // O SLA de chegada é um fato: aquele técnico chegou de verdade.
    ok("MANTEM tecnico_chegou_em", d.tecnico_chegou_em !== null);
    ok("MANTEM primeira_resposta_em (TTFR)", d.primeira_resposta_em !== null);

    const os = await pool.query("SELECT id FROM ordens_servico WHERE id=$1", [osId]);
    ok("a O.S. rascunho foi apagada", os.rows.length === 0);

    const hist = await pool.query(
      `SELECT valor_anterior, valor_novo FROM historico_chamados
        WHERE chamado_id=$1 AND campo_alterado='devolvido'`, [ch.id]
    );
    ok("o histórico grava a devolução", hist.rows.length === 1);
    ok("com o motivo", hist.rows[0]?.valor_novo === "portaria não liberou o acesso ao barrilete");
    ok("e com a O.S. descartada", !!hist.rows[0]?.valor_anterior);

    const histStatus = await pool.query(
      `SELECT valor_anterior, valor_novo FROM historico_chamados
        WHERE chamado_id=$1 AND campo_alterado='status' ORDER BY id`, [ch.id]
    );
    ok("histórico tem em_atendimento para aberto",
       histStatus.rows.some((h) => h.valor_anterior === "em_atendimento" && h.valor_novo === "aberto"));

    // Devolvido, o chamado não é mais dele.
    ok("devolver de novo devolve 403", (await devolver(ch.id, { motivo: "tentando de novo" })).status === 403);

    // ── Devolver ainda a caminho, antes de iniciar ────────────────────────
    const ch2 = await criar("Devolução · ainda a caminho");
    await fetch(base + "/chamados/" + ch2.id + "/a-caminho", { method: "POST", headers: HT });
    const res2 = await devolver(ch2.id, { motivo: "emergência P1 em outro prédio" });
    const dep2 = await res2.json();
    ok("devolve antes de iniciar (200)", res2.status === 200);
    ok("sem O.S. para descartar", dep2.os_descartada === null);
    const d2 = await pool.query(
      "SELECT status, tecnico_id, tecnico_a_caminho_em FROM chamados WHERE id=$1", [ch2.id]
    );
    ok("volta para a fila", d2.rows[0].status === "aberto" && d2.rows[0].tecnico_id === null);
    ok("e o próximo técnico começa do zero", d2.rows[0].tecnico_a_caminho_em === null);

    // ── Fechado não se devolve ────────────────────────────────────────────
    const ch3 = await criar("Devolução · já fechado");
    await fetch(base + "/chamados/" + ch3.id, {
      method: "PATCH", headers: H, body: JSON.stringify({ status: "fechado" }),
    });
    await pool.query("UPDATE chamados SET tecnico_id=$1 WHERE id=$2", [tecnicoId, ch3.id]);
    ok("devolver chamado fechado devolve 409",
       (await devolver(ch3.id, { motivo: "depois de fechado" })).status === 409);

    // ── Só o dono devolve ─────────────────────────────────────────────────
    const ch4 = await criar("Devolução · de outro técnico");
    await pool.query("UPDATE chamados SET tecnico_id = NULL WHERE id=$1", [ch4.id]);
    ok("chamado sem técnico devolve 403",
       (await devolver(ch4.id, { motivo: "não é meu chamado" })).status === 403);

    // ── Gestão não usa esta porta ─────────────────────────────────────────
    ok("admin é recusado (403)",
       (await devolver(ch2.id, { motivo: "pelo painel do admin" }, H)).status === 403);
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
