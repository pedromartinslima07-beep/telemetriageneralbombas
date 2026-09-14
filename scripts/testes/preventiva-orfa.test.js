// O chamado órfão do mês: o técnico consegue começar sozinho?
//
//   node scripts/testes/preventiva-orfa.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: as duas correções de 14/09/2026 são guards e
// escritas dentro de rotas — o CLAUDE.md registra que isso só se prova
// exercitando o endpoint.
//
// O beco que motivou, medido rota a rota antes do conserto:
//   Iniciar (executar-agora) → 200 {duplicado:true}, o chamado seguia sem dono
//   iniciar-atendimento      → 403 "não está atribuído a você"
//   GET /chamados/meus/:id   → 404
//   GET /chamados/meus       → não listava
// O prédio é da zona dele, o serviço é dele, e não havia caminho pelo app.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config({ quiet: true });
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

if (resolverDatabaseUrl().alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido não é TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);
app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);

const r = [];
const ok = (nome, cond, extra) => {
  r.push([nome, cond]);
  console.log((cond ? "OK  " : "FALHOU  ") + nome + (extra ? "  — " + extra : ""));
};

(async () => {
  const server = app.listen(0);
  const lixo = { ch: [], pl: [] };
  try {
    const base = "http://127.0.0.1:" + server.address().port;

    const tec = (await pool.query(
      `SELECT id, usuario_id, nome FROM tecnicos
        WHERE usuario_id IS NOT NULL AND ativo = true ORDER BY id LIMIT 1`)).rows[0];
    if (!tec) throw new Error("preciso de 1 técnico ativo com usuario_id");
    // A zona de que ele é responsável é o que põe o plano no roteiro dele — e é
    // o mesmo direito que a rota `executar-agora` valida.
    const zona = (await pool.query(
      "SELECT zona FROM planos_zona_responsavel WHERE tecnico_id = $1 LIMIT 1", [tec.id])).rows[0];
    if (!zona) throw new Error("preciso do técnico como responsável de alguma zona");
    const condo = (await pool.query(
      "SELECT id FROM condominios WHERE zona = $1 AND ativo ORDER BY id LIMIT 1", [zona.zona])).rows[0];

    const outro = (await pool.query(
      `SELECT id FROM tecnicos WHERE ativo = true AND id <> $1 ORDER BY id LIMIT 1`, [tec.id])).rows[0];

    const H = { Authorization: "Bearer " + jwt.sign(
      { id: tec.usuario_id, role: "tecnico" }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json" };

    const novoPlanoComChamado = async (titulo, donoDoChamado) => {
      const pl = (await pool.query(
        `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em)
         VALUES ($1, $2, 30, CURRENT_DATE) RETURNING id`, [condo.id, titulo])).rows[0];
      lixo.pl.push(pl.id);
      // Como o JOB deixa: chamado aberto, vinculado ao plano, sem técnico —
      // a atribuição automática só acontece com UM responsável na zona.
      const ch = (await pool.query(
        `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status,
                               plano_manutencao_id, tecnico_id)
         VALUES ($1, $2, 'gerado pelo plano (fixture)', 'p4', 'manutencao', 'aberto', $3, $4)
         RETURNING id`, [condo.id, titulo, pl.id, donoDoChamado || null])).rows[0];
      lixo.ch.push(ch.id);
      return { plano: pl.id, chamado: ch.id };
    };

    // ── 1. O órfão é ADOTADO pelo "Iniciar" ──────────────────────────────
    const a = await novoPlanoComChamado("Preventiva orfa (teste)", null);
    const ex = await fetch(base + "/planos-manutencao/" + a.plano + "/executar-agora",
      { method: "POST", headers: H, body: "{}" });
    const exBody = await ex.json();
    ok("Iniciar num plano com chamado órfão responde 200", ex.status === 200, "status=" + ex.status);
    ok("e diz que ADOTOU em vez de só duplicado", exBody.adotado === true, JSON.stringify(exBody));
    ok("não cria um segundo chamado", exBody.chamado_id === a.chamado);
    const dono = await pool.query("SELECT tecnico_id FROM chamados WHERE id = $1", [a.chamado]);
    ok("o chamado passou a ser dele", dono.rows[0].tecnico_id === tec.id);
    const hist = await pool.query(
      `SELECT valor_novo FROM historico_chamados
        WHERE chamado_id = $1 AND campo_alterado = 'tecnico_id' ORDER BY id DESC LIMIT 1`, [a.chamado]);
    ok("e a adoção ficou no histórico", hist.rows[0] && hist.rows[0].valor_novo === String(tec.id));

    // ── 2. E aí o app destrava de verdade ────────────────────────────────
    ok("agora a ficha abre (era 404)",
       (await fetch(base + "/chamados/meus/" + a.chamado, { headers: H })).status === 200);
    ok("e o A caminho é aceito",
       (await fetch(base + "/chamados/" + a.chamado + "/a-caminho",
         { method: "POST", headers: H, body: "{}" })).status === 200);

    // ── 3. Chamado de OUTRO técnico não é adotado ────────────────────────
    // ⚠️ Roubar serviço alheio pelo botão "Iniciar" seria pior que o beco.
    if (outro) {
      const b = await novoPlanoComChamado("Preventiva de outro (teste)", outro.id);
      const ex2 = await fetch(base + "/planos-manutencao/" + b.plano + "/executar-agora",
        { method: "POST", headers: H, body: "{}" });
      const b2 = await ex2.json();
      ok("plano com chamado de OUTRO técnico não é adotado", b2.adotado !== true, JSON.stringify(b2));
      const dono2 = await pool.query("SELECT tecnico_id FROM chamados WHERE id = $1", [b.chamado]);
      ok("e o dono continua sendo o outro", dono2.rows[0].tecnico_id === outro.id);

      // ── 4. O guard de dono do /a-caminho ───────────────────────────────
      // ⚠️ ERA A ÚNICA ROTA DA FAMÍLIA SEM ELE: respondia 200 e carimbava
      // `tecnico_a_caminho_em` no chamado de qualquer um.
      const cam = await fetch(base + "/chamados/" + b.chamado + "/a-caminho",
        { method: "POST", headers: H, body: "{}" });
      ok("A caminho no chamado de outro técnico é 403", cam.status === 403, "status=" + cam.status);
      const carimbo = await pool.query(
        "SELECT tecnico_a_caminho_em FROM chamados WHERE id = $1", [b.chamado]);
      ok("e nada foi carimbado nele", carimbo.rows[0].tecnico_a_caminho_em === null);
    }
  } catch (e) {
    console.error("ERRO:", e.message);
    r.push(["sem exceção", false]);
  } finally {
    if (lixo.ch.length) {
      await pool.query("DELETE FROM ordens_servico WHERE chamado_id = ANY($1)", [lixo.ch]);
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1)", [lixo.ch]);
      await pool.query("DELETE FROM chamados WHERE id = ANY($1)", [lixo.ch]);
    }
    if (lixo.pl.length) await pool.query("DELETE FROM planos_manutencao WHERE id = ANY($1)", [lixo.pl]);
    server.close();
    await pool.end();
  }
  const passou = r.filter(([, c]) => c).length;
  console.log("\n" + passou + "/" + r.length + " passaram");
  process.exit(passou === r.length ? 0 : 1);
})();
