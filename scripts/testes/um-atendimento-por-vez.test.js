// Um atendimento por vez: o técnico não sai para o segundo prédio estando no primeiro.
//
//   node scripts/testes/um-atendimento-por-vez.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: a trava é um guard dentro de duas rotas que
// GRAVAM, e o CLAUDE.md registra que isso só se prova exercitando o endpoint.
// O risco específico aqui não é a trava não travar — é ela travar DEMAIS:
// `iniciar-atendimento` é idempotente (o app reenvia em reconexão) e não pode
// virar 409 no chamado que o próprio técnico já está atendendo.
//
// A premissa que justifica a regra: `POST /ordens-servico/:id/finalizar` recusa
// sem assinatura e nome de quem recebeu, colhidos no local. Enquanto o chamado
// está `em_atendimento`, o técnico está FISICAMENTE no prédio.
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
const ok = (nome, cond, extra) => {
  r.push([nome, cond]);
  console.log((cond ? "OK  " : "FALHOU  ") + nome + (extra ? "  — " + extra : ""));
};

(async () => {
  const server = app.listen(0);
  const lixo = { chamados: [] };

  try {
    const base = "http://127.0.0.1:" + server.address().port;

    const condos = await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1");
    if (!condos.rows.length) throw new Error("preciso de 1 condomínio no banco de teste");
    const condoId = condos.rows[0].id;

    const tec = await pool.query(
      `SELECT id, usuario_id FROM tecnicos
        WHERE usuario_id IS NOT NULL AND ativo = true ORDER BY id LIMIT 1`
    );
    if (!tec.rows.length) throw new Error("preciso de 1 técnico ativo com usuario_id (scripts/seed-teste.js)");
    const tecnicoId = tec.rows[0].id;

    const gestor = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    const H = {
      Authorization: "Bearer " + jwt.sign(
        { id: gestor.rows[0].id, role: gestor.rows[0].role },
        process.env.JWT_SECRET, { expiresIn: "10m" }
      ),
      "Content-Type": "application/json",
    };
    const HT = {
      Authorization: "Bearer " + jwt.sign(
        { id: tec.rows[0].usuario_id, role: "tecnico" },
        process.env.JWT_SECRET, { expiresIn: "10m" }
      ),
      "Content-Type": "application/json",
    };

    // Dois chamados atribuídos AO MESMO técnico — a gestão pode enfileirar
    // quantos quiser, e é isso que o teste também afirma: a trava é no aceitar.
    const criar = async (titulo) => {
      const res = await fetch(base + "/chamados", {
        method: "POST", headers: H,
        body: JSON.stringify({
          condominio_id: condoId, titulo, categoria: "manutencao",
          descricao: "fixture da trava de um por vez", prioridade: "p3",
          tecnico_id: tecnicoId,
        }),
      });
      const body = await res.json();
      const id = body.chamado ? body.chamado.id : body.id;
      if (!id) throw new Error("não criou o chamado: " + JSON.stringify(body));
      lixo.chamados.push(id);
      return id;
    };

    const primeiro = await criar("Trava por vez — prédio A (teste)");
    const segundo  = await criar("Trava por vez — prédio B (teste)");

    const atribuidos = await pool.query(
      "SELECT COUNT(*)::int AS n FROM chamados WHERE id = ANY($1) AND tecnico_id = $2",
      [[primeiro, segundo], tecnicoId]
    );
    ok("a gestão pode atribuir DOIS ao mesmo técnico (despacho é planejamento)",
       atribuidos.rows[0].n === 2);

    const post = async (id, rota, headers = HT) =>
      fetch(base + "/chamados/" + id + "/" + rota, { method: "POST", headers, body: "{}" });

    // Livre: aceita o primeiro normalmente.
    ok("livre, o técnico marca A caminho no primeiro",
       (await post(primeiro, "a-caminho")).status === 200);

    // ⚠️ O BURACO QUE O PEDRO ACHOU TESTANDO À MÃO (14/09/2026): `a-caminho` não
    // muda o status do chamado, então a primeira versão do guard (que só olhava
    // `em_atendimento`) deixava sair para dois prédios ao mesmo tempo.
    //
    // ⚠️ E OS DOIS ERAM NO MESMO CONDOMÍNIO — um chamado e a preventiva do mês.
    // Continua sendo 409 de propósito: a preventiva do prédio onde ele já está
    // se resolve marcando `preventiva_mensal` na O.S. (04/09), que dá baixa no
    // plano e fecha o chamado dela. Aceitar os dois seria o mesmo trabalho
    // contado duas vezes. Por isso ESTE teste usa o mesmo `condoId` nos dois.
    const cam2Antes = await post(segundo, "a-caminho");
    const bodyAntes = await cam2Antes.json();
    ok("a caminho de um NÃO deixa marcar A caminho de outro", cam2Antes.status === 409,
       "status=" + cam2Antes.status);
    ok("e a mensagem diz 'a caminho', não 'em atendimento'",
       /a caminho de/i.test(bodyAntes.error || ""), bodyAntes.error);
    ok("mesmo sendo o MESMO condomínio (chamado + preventiva)",
       cam2Antes.status === 409);
    ok("nem deixa iniciar atendimento no segundo",
       (await post(segundo, "iniciar-atendimento")).status === 409);
    const ini1 = await post(primeiro, "iniciar-atendimento");
    ok("e inicia o atendimento nele", ini1.status === 200, "status=" + ini1.status);

    // Ocupado: as duas portas do segundo chamado fecham.
    const cam2 = await post(segundo, "a-caminho");
    const body2 = await cam2.json();
    ok("em atendimento, NÃO marca A caminho de outro", cam2.status === 409,
       "status=" + cam2.status);
    ok("e o erro diz ONDE ele está preso",
       !!body2.chamado_em_atendimento && body2.chamado_em_atendimento.id === primeiro,
       body2.error);
    ok("nem inicia atendimento no outro",
       (await post(segundo, "iniciar-atendimento")).status === 409);

    // ⚠️ O que o guard NÃO pode quebrar: reenviar no mesmo chamado.
    const ini1b = await post(primeiro, "iniciar-atendimento");
    ok("reenviar no MESMO chamado segue 200 (idempotência do app em reconexão)",
       ini1b.status === 200, "status=" + ini1b.status);

    // A válvula de escape: devolver destrava, e é por isso que P1 não precisa
    // de exceção na trava.
    const dev = await fetch(base + "/chamados/" + primeiro + "/devolver", {
      method: "POST", headers: HT,
      body: JSON.stringify({ motivo: "teste da trava de um por vez" }),
    });
    ok("devolver o primeiro é aceito", dev.status === 200, "status=" + dev.status);
    ok("e aí o segundo destrava", (await post(segundo, "a-caminho")).status === 200);

    // O admin registrando pela gestão não é quem está na rua: não se trava.
    await pool.query("UPDATE chamados SET status = 'em_atendimento' WHERE id = $1", [segundo]);
    const camAdmin = await post(primeiro, "a-caminho", H);
    ok("admin registra A caminho mesmo com o técnico ocupado", camAdmin.status === 200,
       "status=" + camAdmin.status);
  } catch (e) {
    console.error("ERRO:", e.message);
    r.push(["sem exceção", false]);
  } finally {
    if (lixo.chamados.length) {
      await pool.query("DELETE FROM ordens_servico WHERE chamado_id = ANY($1)", [lixo.chamados]);
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1)", [lixo.chamados]);
      await pool.query("DELETE FROM chamados WHERE id = ANY($1)", [lixo.chamados]);
    }
    server.close();
    await pool.end();
  }

  const passou = r.filter(([, c]) => c).length;
  console.log("\n" + passou + "/" + r.length + " passaram");
  process.exit(passou === r.length ? 0 : 1);
})();
