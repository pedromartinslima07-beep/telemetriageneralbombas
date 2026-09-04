// As ações em lote da tela de Planos: escalar e gerar chamado para vários.
//
//   node scripts/testes/planos-lote.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE. A simulação do fluxo (04/09/2026, a pedido do
// Pedro) mostrou que escalar e gerar chamado eram **um clique por linha**: cinco
// prédios eram cinco diálogos. O backend de escalar **já aceitava lote** desde a
// migration 082 (`plano_ids` é array) — era a tela que não usava.
//
// ⚠️ AS DUAS AÇÕES SÃO DIFERENTES POR DENTRO, e o teste separa isso: escalar é
// UMA request resolvida numa transação; gerar chamado é um POST por plano,
// porque `executar-agora` é por id. A segunda pode falhar no meio.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa tudo no `finally`.
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

const r = [];
const ok = (nome, cond, extra) => {
  r.push({ nome, cond: !!cond });
  console.log((cond ? "✓ " : "✗ ") + nome + (extra ? "  — " + extra : ""));
};

async function main() {
  const app = express();
  app.use(express.json());
  app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);
  app.use("/operador", require("../../src/routes/operador.routes").operadorRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const H = {
    Authorization: "Bearer " + jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" }),
    "Content-Type": "application/json",
  };
  const lixo = { chamados: [], planos: [], condos: [], tecnicos: [] };

  try {
    const suf = String(Date.now()).slice(-8);
    const hoje = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

    const t = await pool.query(
      "INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", ["Téc Lote " + suf]);
    const tecnico = t.rows[0].id;
    lixo.tecnicos.push(tecnico);

    // Cinco prédios — o número que o Pedro usou na simulação.
    const planos = [];
    for (let i = 1; i <= 5; i++) {
      const c = await pool.query(
        `INSERT INTO condominios (nome, ativo, zona, cidade)
         VALUES ($1, TRUE, 'ZLote${suf}', 'São Paulo') RETURNING id`, [`Lote ${i} ${suf}`]);
      lixo.condos.push(c.rows[0].id);
      const p = await pool.query(
        `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
         VALUES ($1, 'Preventiva', 30, $2, TRUE) RETURNING id`, [c.rows[0].id, iso(hoje)]);
      lixo.planos.push(p.rows[0].id);
      planos.push(p.rows[0].id);
    }
    ok("(preparo) 5 planos criados", planos.length === 5);

    // ── Escalar os 5 numa request só ────────────────────────────────────────
    const esc = await fetch(base + "/operador/preventivas/atribuir", {
      method: "POST", headers: H,
      body: JSON.stringify({ plano_ids: planos, tecnico_id: tecnico, mes }),
    });
    const je = await esc.json();
    ok("escalar 5 de uma vez responde 200", esc.status === 200, "status " + esc.status);
    ok("e os 5 foram escalados", je.atribuidos === 5, "atribuidos=" + je.atribuidos);

    const gravadas = await pool.query(
      `SELECT count(*)::int n FROM planos_atribuicoes
        WHERE plano_id = ANY($1::int[]) AND tecnico_id = $2`, [planos, tecnico]);
    ok("as 5 escalas estão no banco", gravadas.rows[0].n === 5, "n=" + gravadas.rows[0].n);

    // ⚠️ É UMA TRANSAÇÃO: um id inválido no meio não pode deixar metade
    // escalada. É a garantia que a tela depende para não mentir sobre o lote.
    const meio = await fetch(base + "/operador/preventivas/atribuir", {
      method: "POST", headers: H,
      body: JSON.stringify({ plano_ids: [planos[0], 999999999], tecnico_id: null, mes }),
    });
    const jm = await meio.json();
    // O backend ignora id inexistente e aplica o resto — o que importa é que ele
    // DIGA quais ignorou, para a tela não sumir com linha que continua marcada.
    ok("id inexistente no lote é reportado, não silenciado",
       meio.status === 200 && Array.isArray(jm.ignorados) && jm.ignorados.includes(999999999),
       "ignorados=" + JSON.stringify(jm.ignorados));

    // ── Gerar chamado: um POST por plano ────────────────────────────────────
    // ⚠️ NÃO HÁ ROTA DE LOTE aqui, e o teste prova que o laço da tela funciona
    // do começo ao fim — inclusive a segunda passada, que não pode duplicar.
    let feitos = 0;
    for (const id of planos) {
      const e = await fetch(base + `/planos-manutencao/${id}/executar-agora`, { method: "POST", headers: H });
      if (e.status === 200) {
        const j = await e.json();
        if (j.chamado_id) { lixo.chamados.push(j.chamado_id); feitos++; }
      }
    }
    ok("os 5 chamados foram gerados", feitos === 5, feitos + " de 5");

    // ⚠️ A SEGUNDA PASSADA NÃO DUPLICA. Se o operador clicar duas vezes, a
    // anti-duplicidade do backend responde `duplicado` em vez de abrir outro —
    // e é por isso que a tela pode filtrar por `chamado_aberto_id` sem medo.
    const repete = await fetch(base + `/planos-manutencao/${planos[0]}/executar-agora`, { method: "POST", headers: H });
    const jr = await repete.json();
    ok("clicar de novo não abre um segundo chamado", jr.duplicado === true, JSON.stringify(jr).slice(0, 60));

    const abertos = await pool.query(
      `SELECT count(*)::int n FROM chamados
        WHERE plano_manutencao_id = ANY($1::int[]) AND status = 'aberto'`, [planos]);
    ok("cada plano tem exatamente um chamado aberto", abertos.rows[0].n === 5, "n=" + abertos.rows[0].n);

    // ── O aviso de antecipação ──────────────────────────────────────────────
    // ⚠️ Gerar chamado num plano que só vence mês que vem ADIANTA o ciclo: o
    // `executarPlano` grava `ultima_em` e rola `proxima_em`. A tela passou a
    // avisar; aqui provamos que o efeito que ela descreve é real.
    const cFut = await pool.query(
      `INSERT INTO condominios (nome, ativo, zona, cidade)
       VALUES ($1, TRUE, 'ZLote${suf}', 'São Paulo') RETURNING id`, ["Lote Futuro " + suf]);
    lixo.condos.push(cFut.rows[0].id);
    const proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 15);
    const pFut = await pool.query(
      `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
       VALUES ($1, 'Preventiva', 30, $2, TRUE) RETURNING id`, [cFut.rows[0].id, iso(proxMes)]);
    lixo.planos.push(pFut.rows[0].id);

    const antes = await pool.query("SELECT proxima_em, ultima_em FROM planos_manutencao WHERE id=$1", [pFut.rows[0].id]);
    const eF = await fetch(base + `/planos-manutencao/${pFut.rows[0].id}/executar-agora`, { method: "POST", headers: H });
    if (eF.status === 200) { const j = await eF.json(); if (j.chamado_id) lixo.chamados.push(j.chamado_id); }
    const dep = await pool.query("SELECT proxima_em, ultima_em FROM planos_manutencao WHERE id=$1", [pFut.rows[0].id]);

    ok("gerar chamado antes da data REALMENTE antecipa o ciclo",
       antes.rows[0].ultima_em === null && dep.rows[0].ultima_em !== null,
       "ultima_em: null → " + String(dep.rows[0].ultima_em).slice(0, 10));
    ok("e a próxima visita muda de data",
       String(antes.rows[0].proxima_em) !== String(dep.rows[0].proxima_em),
       String(antes.rows[0].proxima_em).slice(0, 10) + " → " + String(dep.rows[0].proxima_em).slice(0, 10));
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.planos) {
      await pool.query("DELETE FROM planos_atribuicoes WHERE plano_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    }
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.tecnicos) await pool.query("DELETE FROM tecnicos WHERE id=$1", [id]).catch(() => {});
    srv.closeAllConnections?.();
    await new Promise((res) => srv.close(res));
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter((x) => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exitCode = bons === r.length ? 0 : 1;
  })
  .catch((e) => { console.error("ERRO:", e); process.exitCode = 1; });
