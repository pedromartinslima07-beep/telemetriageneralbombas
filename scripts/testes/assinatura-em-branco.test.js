// Assinatura em branco não vira documento, e a nova assinatura se recolhe.
//
//   node scripts/testes/assinatura-em-branco.test.js
//
// O caso (05/10/2026): a OS-2026-0139 foi finalizada com um PNG transparente
// no lugar da assinatura; a 0069, com um ponto. `assinatura_b64 IS NOT NULL`
// era toda a checagem, e o PDF saiu com o quadro vazio. O app gravava o quadro
// limpo por cima da assinatura verdadeira (ver `_assinaturaTemTinta` em
// app/public/app.js); este teste cobre a segunda trava, a do servidor, e a
// porta para recolher a assinatura de O.S. já finalizada (migration 088).
//
// ⚠️ POR QUE ROTA DE VERDADE: o PUT e o pedido gravam numa O.S. FINALIZADA,
// atravessando um guard que existe para impedir isso. Só exercitando a rota
// com o papel certo dá para provar que a porta é estreita.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config({ quiet: true });
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "teste-sem-envio";
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { assinaturaTemTinta } = require("../../src/services/assinatura-tinta.service");
const { ASSINATURA_OK, ASSINATURA_VAZIA, ASSINATURA_PONTO } = require("./_assinatura-fixture");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use("/ordens-servico", require("../../src/routes/ordens-servico.routes").ordensServicoRouter);
app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);

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
    // ── A régua ───────────────────────────────────────────────────────────
    ok("rabisco que atravessa o quadro tem tinta", assinaturaTemTinta(ASSINATURA_OK));
    ok("quadro vazio (OS-2026-0139) não tem", !assinaturaTemTinta(ASSINATURA_VAZIA));
    ok("um ponto (OS-2026-0069) não tem", !assinaturaTemTinta(ASSINATURA_PONTO));
    ok("o PNG truncado dos testes antigos não tem", !assinaturaTemTinta("data:image/png;base64,iVBORw0KGgo="));
    ok("nulo não tem", !assinaturaTemTinta(null));

    // ── Personagens ───────────────────────────────────────────────────────
    const condo = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0];
    if (!condo) throw new Error("preciso de 1 condomínio no banco de teste");
    const tec = (await pool.query(
      `SELECT t.id, t.usuario_id FROM tecnicos t
         JOIN usuarios u ON u.id = t.usuario_id AND u.role = 'tecnico'
        WHERE t.ativo = true ORDER BY t.id LIMIT 1`)).rows[0];
    if (!tec) throw new Error("preciso de 1 técnico com login no banco de teste");

    // ⚠️ ADMIN DE VERDADE, não um id inventado. O /finalizar grava o
    // historico_chamados com alterado_por = quem chamou; com um id que não
    // existe a FK falha, o registrarMudancas engole o erro, a transação fica
    // abortada — e o COMMIT dela vira ROLLBACK calado: a rota diz 200 e não
    // finalizou nada. Foi assim que este teste mostrou, na primeira versão,
    // um "200" com a O.S. ainda aberta.
    const gestor = (await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1")).rows[0];
    if (!gestor) throw new Error("preciso de 1 admin/gerente no banco de teste");

    const tk = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const T = { admin: tk(gestor.id, gestor.role), operador: tk(999998, "operador"), tecnico: tk(tec.usuario_id, "tecnico") };
    const bater = async (quem, metodo, caminho, corpo) => {
      const res = await fetch(base + caminho, {
        method: metodo,
        headers: { Authorization: "Bearer " + T[quem], "Content-Type": "application/json" },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };

    const sufixo = String(Date.now()).slice(-8);
    const novaOS = async (extra = {}) => {
      const ch = (await pool.query(
        `INSERT INTO chamados (condominio_id, tecnico_id, status, prioridade, categoria, titulo, descricao)
         VALUES ($1, $2, 'em_atendimento', 'p3', 'manutencao', $3, 'teste de assinatura')
         RETURNING id`, [condo.id, tec.id, "Assinatura TESTE " + sufixo])).rows[0];
      lixo.ch.push(ch.id);
      const os = (await pool.query(
        `INSERT INTO ordens_servico
           (numero, chamado_id, condominio_id, tecnico_id, tipos_servico, servico_realizado,
            recebido_nome, chegada_em, assinatura_b64)
         VALUES ($1, $2, $3, $4, ARRAY['visita_tecnica']::text[], 'resolvido', 'Zelador TESTE', NOW(), $5)
         RETURNING id, numero`,
        ["OS-AS-" + sufixo + "-" + lixo.os.length, ch.id, condo.id, tec.id, extra.assinatura ?? null])).rows[0];
      lixo.os.push(os.id);
      return { ...os, chamadoId: ch.id };
    };

    // ── PATCH: quadro sem tinta vira NULL, não 400 ────────────────────────
    // (400 travaria o formulário inteiro de APK antigo — ver a rota.)
    const os1 = await novaOS();
    const p1 = await bater("admin", "PATCH", `/ordens-servico/${os1.id}`, { assinatura_b64: ASSINATURA_VAZIA, observacoes: "obs junto" });
    const b1 = (await pool.query("SELECT assinatura_b64, observacoes FROM ordens_servico WHERE id=$1", [os1.id])).rows[0];
    ok("PATCH com quadro vazio responde 200", p1.status === 200, p1.status);
    ok("e grava a assinatura como NULL", b1.assinatura_b64 === null);
    ok("sem perder o resto do patch", b1.observacoes === "obs junto");
    await bater("admin", "PATCH", `/ordens-servico/${os1.id}`, { assinatura_b64: ASSINATURA_PONTO });
    ok("o ponto também vira NULL",
      (await pool.query("SELECT assinatura_b64 FROM ordens_servico WHERE id=$1", [os1.id])).rows[0].assinatura_b64 === null);
    await bater("admin", "PATCH", `/ordens-servico/${os1.id}`, { assinatura_b64: ASSINATURA_OK });
    ok("assinatura de verdade é gravada",
      (await pool.query("SELECT assinatura_b64 FROM ordens_servico WHERE id=$1", [os1.id])).rows[0].assinatura_b64 === ASSINATURA_OK);

    // ── /finalizar recusa o quadro vazio ──────────────────────────────────
    // Gravado direto no banco: é o estado em que as O.S. antigas estão.
    const os2 = await novaOS({ assinatura: ASSINATURA_VAZIA });
    const f2 = await bater("admin", "POST", `/ordens-servico/${os2.id}/finalizar`, {});
    ok("finalizar com assinatura vazia dá 400", f2.status === 400, f2.status);
    ok("e diz que veio em branco", /em branco/i.test(f2.body.error || ""), f2.body.error);
    ok("a O.S. continua aberta",
      (await pool.query("SELECT finalizada_em FROM ordens_servico WHERE id=$1", [os2.id])).rows[0].finalizada_em === null);

    const os3 = await novaOS({ assinatura: ASSINATURA_OK });
    const f3 = await bater("admin", "POST", `/ordens-servico/${os3.id}/finalizar`, {});
    ok("finalizar com assinatura de verdade dá 200", f3.status === 200, f3.status + " " + JSON.stringify(f3.body));
    ok("e a finalização foi gravada de fato",
      !!(await pool.query("SELECT finalizada_em FROM ordens_servico WHERE id=$1", [os3.id])).rows[0].finalizada_em);

    // ── O caso real: finalizada e em branco ───────────────────────────────
    await pool.query("UPDATE ordens_servico SET finalizada_em = NOW() WHERE id = $1", [os2.id]);
    await pool.query("UPDATE chamados SET status = 'fechado', fechado_em = NOW() WHERE id = $1", [os2.chamadoId]);

    const g2 = await bater("admin", "GET", `/ordens-servico/${os2.id}`);
    ok("o detalhe acusa assinatura_em_branco", g2.body.assinatura_em_branco === true);
    ok("e não vaza a imagem no detalhe", g2.body.assinatura_b64 === undefined && g2.body._assinatura_final === undefined);
    const g3 = await bater("admin", "GET", `/ordens-servico/${os3.id}`);
    ok("a O.S. assinada não acusa nada", g3.body.assinatura_em_branco === false);

    const e2 = await bater("admin", "POST", `/ordens-servico/${os2.id}/enviar-email`, { emails: "a@teste.local" });
    ok("e-mail de O.S. com assinatura em branco é recusado", e2.status === 400 && /em branco/i.test(e2.body.error || ""), e2.body.error);

    // ── Pedir nova assinatura ─────────────────────────────────────────────
    ok("técnico não grava sem pedido (403)",
      (await bater("tecnico", "PUT", `/ordens-servico/${os2.id}/assinatura`, { assinatura_b64: ASSINATURA_OK, recebido_nome: "Fábio" })).status === 403);
    ok("operador não pede (403)",
      (await bater("operador", "POST", `/ordens-servico/${os2.id}/pedir-assinatura`)).status === 403);
    ok("O.S. em preenchimento não aceita pedido (400)",
      (await bater("admin", "POST", `/ordens-servico/${os1.id}/pedir-assinatura`)).status === 400);

    const ped = await bater("admin", "POST", `/ordens-servico/${os2.id}/pedir-assinatura`);
    ok("admin pede (200)", ped.status === 200 && !!ped.body.assinatura_refazer_em, ped.status);

    const e2b = await bater("admin", "POST", `/ordens-servico/${os2.id}/enviar-email`, { emails: "a@teste.local" });
    ok("com pedido aberto o e-mail também espera", e2b.status === 400 && /pedida/i.test(e2b.body.error || ""), e2b.body.error);

    // O app do técnico: o chamado FECHADO aparece com o pedido.
    const meus = await bater("tecnico", "GET", "/chamados/meus");
    const naLista = (meus.body || []).find((c) => c.id === os2.chamadoId);
    ok("a lista do técnico traz o pedido", !!naLista && !!naLista.os_assinatura_refazer_em);
    const det = await bater("tecnico", "GET", `/chamados/meus/${os2.chamadoId}`);
    ok("e o detalhe também, com o nome atual",
      !!det.body.ordem_servico?.assinatura_refazer_em && det.body.ordem_servico?.recebido_nome === "Zelador TESTE");

    // ── O técnico recolhe ─────────────────────────────────────────────────
    const v1 = await bater("tecnico", "PUT", `/ordens-servico/${os2.id}/assinatura`, { assinatura_b64: ASSINATURA_VAZIA, recebido_nome: "Fábio" });
    ok("quadro vazio é recusado no PUT (400)", v1.status === 400);
    const v2 = await bater("tecnico", "PUT", `/ordens-servico/${os2.id}/assinatura`, { assinatura_b64: ASSINATURA_OK, recebido_nome: "  " });
    ok("sem nome é recusado (400)", v2.status === 400);
    const opPut = await bater("operador", "PUT", `/ordens-servico/${os2.id}/assinatura`, { assinatura_b64: ASSINATURA_OK, recebido_nome: "Fábio" });
    ok("operador não grava (403)", opPut.status === 403);

    const v3 = await bater("tecnico", "PUT", `/ordens-servico/${os2.id}/assinatura`, { assinatura_b64: ASSINATURA_OK, recebido_nome: " Fábio " });
    ok("o técnico grava com pedido aberto (200)", v3.status === 200, v3.status + " " + JSON.stringify(v3.body));
    const b2 = (await pool.query(
      `SELECT assinatura_b64, recebido_nome, recebido_tipo, assinatura_refazer_em, assinatura_refeita_em,
              finalizada_em, servico_realizado
         FROM ordens_servico WHERE id=$1`, [os2.id])).rows[0];
    ok("a assinatura nova está no banco", b2.assinatura_b64 === ASSINATURA_OK);
    ok("o nome foi trocado (aparado)", b2.recebido_nome === "Fábio");
    ok("o pedido foi consumido", b2.assinatura_refazer_em === null);
    ok("e a data da recolha ficou registrada", !!b2.assinatura_refeita_em);
    ok("a O.S. continua finalizada, e o resto intacto", !!b2.finalizada_em && b2.servico_realizado === "resolvido");

    ok("um segundo PUT do técnico já não passa (403)",
      (await bater("tecnico", "PUT", `/ordens-servico/${os2.id}/assinatura`, { assinatura_b64: ASSINATURA_OK, recebido_nome: "Outro" })).status === 403);

    const g2b = await bater("admin", "GET", `/ordens-servico/${os2.id}`);
    ok("o detalhe deixa de acusar o branco", g2b.body.assinatura_em_branco === false && !!g2b.body.assinatura_refeita_em);
    const meus2 = await bater("tecnico", "GET", "/chamados/meus");
    ok("e o chamado sai da pendência do técnico",
      !(meus2.body || []).find((c) => c.id === os2.chamadoId)?.os_assinatura_refazer_em);

    // ── Cancelar o pedido ─────────────────────────────────────────────────
    await bater("admin", "POST", `/ordens-servico/${os3.id}/pedir-assinatura`);
    const can = await bater("admin", "DELETE", `/ordens-servico/${os3.id}/pedir-assinatura`);
    ok("admin cancela o pedido", can.status === 200 &&
      (await pool.query("SELECT assinatura_refazer_em FROM ordens_servico WHERE id=$1", [os3.id])).rows[0].assinatura_refazer_em === null);
  } catch (e) {
    console.error("ERRO:", e.stack);
    process.exitCode = 1;
  } finally {
    for (const id of lixo.os) await pool.query("DELETE FROM ordens_servico WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.ch) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    }
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
