// Cancelar chamado: o estado que NÃO conta como serviço prestado.
//
//   node scripts/testes/cancelar-chamado.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que rota que GRAVA só se
// prova exercitando o endpoint — nem `node --check` nem `UPDATE` direto no
// banco pegam o CHECK recusando o valor novo ou `$n` mal tipado. O `SET` desta
// rota é montado dinamicamente e ganhou dois campos nesta mudança.
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
    const tokenGestor = jwt.sign(
      { id: gestor.rows[0].id, role: gestor.rows[0].role },
      process.env.JWT_SECRET, { expiresIn: "10m" }
    );
    // O operador não precisa existir na tabela: `adminOnly` e `GESTAO_ROLES`
    // leem só o `role` do JWT. O que se testa aqui é a régua, não o cadastro.
    const tokenOperador = jwt.sign(
      { id: gestor.rows[0].id, role: "operador" },
      process.env.JWT_SECRET, { expiresIn: "10m" }
    );

    const H  = { Authorization: "Bearer " + tokenGestor,   "Content-Type": "application/json" };
    const HO = { Authorization: "Bearer " + tokenOperador, "Content-Type": "application/json" };

    const criar = async (titulo, categoria) => {
      const res = await fetch(base + "/chamados", {
        method: "POST", headers: H,
        body: JSON.stringify({
          condominio_id: condoId, titulo, categoria: categoria || "outro", prioridade: "p3",
          descricao: "chamado de teste do cancelamento",
        }),
      });
      const ch = await res.json();
      if (!ch.id) throw new Error("POST /chamados falhou: " + JSON.stringify(ch));
      lixo.chamados.push(ch.id);
      return ch;
    };

    const patch = (id, body, headers) => fetch(base + "/chamados/" + id, {
      method: "PATCH", headers: headers || H, body: JSON.stringify(body),
    });

    // ── O caminho feliz ───────────────────────────────────────────────────
    const ch = await criar("Cancelamento · caminho feliz");
    const res1 = await patch(ch.id, { status: "cancelado", motivo: "duplicado do CH-0001" });
    const dep1 = await res1.json();

    ok("gestor cancela (200)", res1.status === 200);
    ok("status vira cancelado", dep1.status === "cancelado");
    ok("grava cancelado_em", !!dep1.cancelado_em);
    ok("grava o motivo", dep1.cancelado_motivo === "duplicado do CH-0001");

    // O ponto inteiro da mudança: cancelar não é resolver.
    ok("NAO grava fechado_em", dep1.fechado_em === null);
    ok("NAO grava tempo_resolucao_seg", dep1.tempo_resolucao_seg === null);
    ok("NAO marca primeira_resposta_em (TTFR)", dep1.primeira_resposta_em === null);

    // ── O motivo é obrigatório ────────────────────────────────────────────
    const ch2 = await criar("Cancelamento · sem motivo");
    ok("sem motivo devolve 400",  (await patch(ch2.id, { status: "cancelado" })).status === 400);
    ok("motivo curto devolve 400", (await patch(ch2.id, { status: "cancelado", motivo: "oi" })).status === 400);
    const aindaAberto = await pool.query("SELECT status FROM chamados WHERE id=$1", [ch2.id]);
    ok("e o chamado continua aberto", aindaAberto.rows[0].status === "aberto");

    // ── Quem pode ─────────────────────────────────────────────────────────
    ok("operador é recusado (403)",
       (await patch(ch2.id, { status: "cancelado", motivo: "tentando pelo operador" }, HO)).status === 403);
    ok("mas o operador ainda fecha (200)",
       (await patch(ch2.id, { status: "fechado" }, HO)).status === 200);

    // ── Fechado não se cancela ────────────────────────────────────────────
    ok("cancelar chamado fechado devolve 409",
       (await patch(ch2.id, { status: "cancelado", motivo: "depois de fechado" })).status === 409);

    // ── Reabrir o cancelado ───────────────────────────────────────────────
    const res2 = await patch(ch.id, { status: "aberto" });
    const dep2 = await res2.json();
    ok("cancelado reabre (200)", res2.status === 200 && dep2.status === "aberto");
    ok("o cancelamento fica na memória", !!dep2.cancelado_em && !!dep2.cancelado_motivo);

    // ── O histórico registrou ─────────────────────────────────────────────
    const hist = await pool.query(
      `SELECT valor_anterior, valor_novo FROM historico_chamados
        WHERE chamado_id = $1 AND campo_alterado = 'status' ORDER BY id`,
      [ch.id]
    );
    ok("histórico tem aberto para cancelado",
       hist.rows.some(h => h.valor_anterior === "aberto" && h.valor_novo === "cancelado"));
    ok("histórico tem cancelado para aberto",
       hist.rows.some(h => h.valor_anterior === "cancelado" && h.valor_novo === "aberto"));

    // ── A lista do painel ─────────────────────────────────────────────────
    const ch3 = await criar("Cancelamento · some da fila");
    await patch(ch3.id, { status: "cancelado", motivo: "cliente desistiu do serviço" });
    const lista = await (await fetch(base + "/chamados", { headers: H })).json();
    const naLista = lista.find(c => c.id === ch3.id);
    ok("GET /chamados devolve o cancelado (aba Cancelados)", !!naLista);
    ok("com as colunas novas", !!naLista && naLista.cancelado_motivo === "cliente desistiu do serviço");
    ok("e sem flag de SLA estourado", !!naLista && naLista.sla_ttfr_estourado === false && naLista.sla_ttr_risco === false);

    // ── A fila do técnico (GET /chamados/meus?abertos=1) ──────────────────
    // ⚠️ `?abertos=1` é do `/meus`, NÃO do `/chamados` do painel — a primeira
    // versão deste teste bateu no endpoint errado e passou por engano, porque
    // `GET /chamados` simplesmente ignora o parâmetro.
    const tec = await pool.query(
      `SELECT t.id, t.usuario_id FROM tecnicos t
        JOIN usuarios u ON u.id = t.usuario_id AND u.role = 'tecnico'
       WHERE t.ativo = true LIMIT 1`
    );
    if (tec.rows.length) {
      await pool.query("UPDATE chamados SET tecnico_id = $1 WHERE id = ANY($2::int[])",
        [tec.rows[0].id, [ch3.id, ch.id]]);
      const HT = { Authorization: "Bearer " + jwt.sign(
        { id: tec.rows[0].usuario_id, role: "tecnico" }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
      const fila = await (await fetch(base + "/chamados/meus?abertos=1", { headers: HT })).json();
      ok("?abertos=1 esconde o cancelado do técnico",
         Array.isArray(fila) && !fila.some(c => c.id === ch3.id));
      ok("mas mantém o que está aberto",
         Array.isArray(fila) && fila.some(c => c.id === ch.id));
    } else {
      console.log("(pulado: nenhum técnico com login no banco de teste)");
    }

    // ── E o dedup automático volta a abrir ────────────────────────────────
    // `abrirChamadoAuto` reaproveita chamado aberto da mesma dupla
    // condomínio+categoria. Cancelado não é aberto: tem de nascer outro.
    const { abrirChamadoAuto } = require("../../src/services/chamados.service");
    const ch4 = await criar("Cancelamento · dedup", "ruido");
    await patch(ch4.id, { status: "cancelado", motivo: "engano na triagem do turno" });
    const novoId = await abrirChamadoAuto({
      condominio_id: condoId, titulo: "auto ruído", descricao: "gerado pelo teste",
      prioridade: "p3", categoria: "ruido",
    });
    if (novoId) lixo.chamados.push(novoId);
    ok("chamado cancelado não bloqueia a abertura automática", !!novoId && novoId !== ch4.id);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of lixo.chamados) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id=$1", [id]).catch(() => {});
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
