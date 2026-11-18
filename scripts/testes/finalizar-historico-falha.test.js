// O histórico que falha não pode desfazer calado a finalização.
//
//   node scripts/testes/finalizar-historico-falha.test.js
//
// O caso (achado em 05/10/2026, corrigido em 18/11/2026): o POST
// /ordens-servico/:id/finalizar grava o historico_chamados DENTRO da
// transação, e o registrarMudancas engolia o próprio erro ("audit log não
// bloqueia a operação"). Só que no Postgres um comando que falha aborta a
// transação inteira: os comandos seguintes falham, e o COMMIT do fim vira
// ROLLBACK sem levantar erro. A rota respondia 200, o app tirava a O.S. da
// fila, e nada tinha sido gravado. A O.S. sumia.
//
// Para fazer o histórico falhar de verdade: o JWT de um usuário que não
// existe. A FK de alterado_por recusa o INSERT do histórico.
//
// ⚠️ ROTA DE VERDADE, não UPDATE direto no banco: o defeito só existe na
// sequência BEGIN → falha engolida → COMMIT.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config({ quiet: true });
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "teste-sem-envio";
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { registrarMudancas, registrarCriacao } = require("../../src/services/chamado-historico.service");
const { ASSINATURA_OK } = require("./_assinatura-fixture");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use("/ordens-servico", require("../../src/routes/ordens-servico.routes").ordensServicoRouter);

const r = [];
const ok = (nome, cond, extra) => {
  r.push([nome, cond]);
  if (!cond && extra !== undefined) console.log("   ↳", extra);
};

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = { os: [], ch: [] };

  try {
    const condo = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0];
    if (!condo) throw new Error("preciso de 1 condomínio no banco de teste");
    const tec = (await pool.query(
      `SELECT t.id FROM tecnicos t WHERE t.ativo = true ORDER BY t.id LIMIT 1`)).rows[0];
    if (!tec) throw new Error("preciso de 1 técnico no banco de teste");
    const gestor = (await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1")).rows[0];
    if (!gestor) throw new Error("preciso de 1 admin/gerente no banco de teste");

    // Um id que com certeza não existe em usuarios.
    const fantasma = Number((await pool.query("SELECT COALESCE(MAX(id), 0) + 100000 AS id FROM usuarios")).rows[0].id);

    const tk = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const bater = async (token, caminho) => {
      const res = await fetch(base + caminho, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: "{}",
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };

    const sufixo = String(Date.now()).slice(-8);
    const novaOS = async () => {
      const ch = (await pool.query(
        `INSERT INTO chamados (condominio_id, tecnico_id, status, prioridade, categoria, titulo, descricao)
         VALUES ($1, $2, 'em_atendimento', 'p3', 'manutencao', $3, 'teste do histórico que falha')
         RETURNING id`, [condo.id, tec.id, "Historico TESTE " + sufixo])).rows[0];
      lixo.ch.push(ch.id);
      const os = (await pool.query(
        `INSERT INTO ordens_servico
           (numero, chamado_id, condominio_id, tecnico_id, tipos_servico, servico_realizado,
            recebido_nome, chegada_em, assinatura_b64)
         VALUES ($1, $2, $3, $4, ARRAY['visita_tecnica']::text[], 'resolvido', 'Zelador TESTE', NOW(), $5)
         RETURNING id`,
        ["OS-HF-" + sufixo + "-" + lixo.os.length, ch.id, condo.id, tec.id, ASSINATURA_OK])).rows[0];
      lixo.os.push(os.id);
      return { id: os.id, chamadoId: ch.id };
    };
    const estado = async (o) => ({
      fin: (await pool.query("SELECT finalizada_em FROM ordens_servico WHERE id=$1", [o.id])).rows[0].finalizada_em,
      ch:  (await pool.query("SELECT status FROM chamados WHERE id=$1", [o.chamadoId])).rows[0].status,
      hist: (await pool.query(
        "SELECT COUNT(*)::int AS n FROM historico_chamados WHERE chamado_id=$1 AND campo_alterado='status'",
        [o.chamadoId])).rows[0].n,
    });

    // ── O caso: o histórico falha dentro da transação ─────────────────────
    const a = await novaOS();
    const fa = await bater(tk(fantasma, "admin"), `/ordens-servico/${a.id}/finalizar`);
    const ea = await estado(a);
    // A regra: se a rota disse 200, a O.S. TEM de estar finalizada.
    ok("se respondeu 200, a O.S. está finalizada de fato",
      fa.status !== 200 || !!ea.fin, `status ${fa.status}, finalizada_em ${ea.fin}`);
    ok("o histórico falhar não impede a finalização (200)", fa.status === 200, fa.status + " " + JSON.stringify(fa.body));
    ok("a O.S. foi finalizada", !!ea.fin);
    ok("o chamado fechou junto", ea.ch === "fechado", ea.ch);
    ok("e o histórico que falhou não ficou pela metade", ea.hist === 0, ea.hist);

    // ── O caminho normal continua gravando o histórico ────────────────────
    const b = await novaOS();
    const fb = await bater(tk(gestor.id, gestor.role), `/ordens-servico/${b.id}/finalizar`);
    const eb = await estado(b);
    ok("com usuário de verdade: 200", fb.status === 200, fb.status);
    ok("finalizada", !!eb.fin);
    ok("e o histórico registra a mudança de status", eb.hist === 1, eb.hist);

    // ── O serviço, direto: savepoint dentro, nada fora ────────────────────
    // Dentro de transação: a falha do histórico não envenena o resto.
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await registrarMudancas({
        client: c, chamadoId: b.chamadoId,
        antes: { status: "aberto" }, depois: { status: "fechado" }, alteradoPor: fantasma,
      });
      const viva = await c.query("SELECT 1 AS um").then(x => x.rows[0].um === 1, () => false);
      ok("depois da falha engolida, a transação continua viva", viva);
      const fim = await c.query("ROLLBACK");
      void fim;
    } finally { c.release(); }

    // Fora de transação (client avulso, sem BEGIN): o savepoint não pode
    // quebrar quem chama sem transação.
    const c2 = await pool.connect();
    try {
      let erro = null;
      await registrarCriacao({ client: c2, chamadoId: b.chamadoId, alteradoPor: gestor.id }).catch(e => { erro = e; });
      ok("client sem transação: registrarCriacao funciona", !erro, erro && erro.message);
      const n = (await c2.query(
        "SELECT COUNT(*)::int AS n FROM historico_chamados WHERE chamado_id=$1 AND campo_alterado='criado'",
        [b.chamadoId])).rows[0].n;
      ok("e grava a linha", n === 1, n);
    } finally { c2.release(); }

    // E com o pool (o padrão): segue gravando.
    await registrarCriacao({ chamadoId: a.chamadoId, alteradoPor: gestor.id });
    ok("com o pool: registrarCriacao grava",
      (await pool.query(
        "SELECT COUNT(*)::int AS n FROM historico_chamados WHERE chamado_id=$1 AND campo_alterado='criado'",
        [a.chamadoId])).rows[0].n === 1);
  } catch (e) {
    console.error("ERRO NO TESTE:", e);
    r.push(["o teste rodou até o fim", false]);
  } finally {
    try {
      if (lixo.ch.length) await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1)", [lixo.ch]);
      if (lixo.os.length) await pool.query("DELETE FROM ordens_servico WHERE id = ANY($1)", [lixo.os]);
      if (lixo.ch.length) await pool.query("DELETE FROM chamados WHERE id = ANY($1)", [lixo.ch]);
    } catch (e) { console.error("limpeza falhou:", e.message); }
    server.close();
    await pool.end();
    const falhas = r.filter(([, c]) => !c).length;
    for (const [n, c] of r) console.log((c ? "✓ " : "✗ ") + n);
    console.log(`\n${r.length - falhas}/${r.length}`);
    process.exit(falhas ? 1 : 0);
  }
})();
