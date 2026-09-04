// O roteiro do técnico enxerga o trabalho DO MÊS, não só a janela de dias.
//
//   node scripts/testes/roteiro-competencia.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE. O job ROLA `proxima_em` para o ciclo seguinte no
// instante em que abre o chamado. Medido em produção em 04/09/2026: **77 planos
// ativos, 76 com `proxima_em` em 04/10, e 77 chamados de preventiva ABERTOS** —
// a janela de 7 dias do roteiro alcançava **UM**. O trabalho do mês estava todo
// lá e a data de todos já apontava para o mês seguinte.
//
// É o mesmo defeito que esvaziou a tela de Preventivas do operador no mesmo dia
// ("na página do operador está tudo no mês de outubro"), e o mesmo conserto:
// duas portas — ou o plano VENCE na janela, ou ele JÁ RODOU neste mês.
//
// ⚠️ E SÓ ENQUANTO O SERVIÇO NÃO FECHOU. Sem essa condição a preventiva já feita
// voltaria ao roteiro pelo resto do mês, e o técnico veria de novo o prédio de
// onde acabou de sair.
//
// ⚠️ A JANELA NÃO ERA A ÚNICA COISA VAZIA. Quando o Pedro perguntou "você tem
// certeza disso?", a query real mostrou que `planos_zona_responsavel` e
// `planos_atribuicoes` estavam AMBAS vazias em produção — sem dono, o roteiro
// devolve zero com qualquer janela. A janela é defeito real, mas reaparece só
// depois que alguém é designado. Por isso este teste cria o dono.
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
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const lixo = { chamados: [], planos: [], condos: [], tecnicos: [], usuarios: [], zonas: [] };

  try {
    const suf = String(Date.now()).slice(-8);
    const ZONA = "ZRot" + suf;

    const t = await pool.query(
      "INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", ["Téc Roteiro " + suf]);
    const tecnico = t.rows[0].id;
    lixo.tecnicos.push(tecnico);

    const u = await pool.query(
      `INSERT INTO usuarios (nome, email, role, senha_hash)
       VALUES ($1, $2, 'tecnico', 'x') RETURNING id`,
      ["Téc Roteiro " + suf, "rot" + suf + "@teste.local"]);
    lixo.usuarios.push(u.rows[0].id);
    await pool.query("UPDATE tecnicos SET usuario_id = $1 WHERE id = $2", [u.rows[0].id, tecnico]);
    const H = { Authorization: "Bearer " + jwt.sign({ id: u.rows[0].id, role: "tecnico" }, process.env.JWT_SECRET, { expiresIn: "10m" }) };

    // ⚠️ O DONO PRECISA EXISTIR — sem responsável de zona nem escala, o roteiro
    // devolve zero com qualquer janela, e o teste mediria a coisa errada.
    await pool.query(
      "INSERT INTO planos_zona_responsavel (zona, tecnico_id) VALUES ($1, $2)", [ZONA, tecnico]);
    lixo.zonas.push(ZONA);

    const novoPredio = async (nome) => {
      const c = await pool.query(
        `INSERT INTO condominios (nome, ativo, zona, bairro, cidade)
         VALUES ($1, TRUE, $2, 'Bairro', 'São Paulo') RETURNING id`, [nome, ZONA]);
      lixo.condos.push(c.rows[0].id);
      return c.rows[0].id;
    };
    const novoPlano = async (condo, proxima) => {
      const p = await pool.query(
        `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
         VALUES ($1, 'Preventiva', 30, $2, TRUE) RETURNING id`, [condo, proxima]);
      lixo.planos.push(p.rows[0].id);
      return p.rows[0].id;
    };
    const roteiro = async () => {
      const resp = await fetch(base + "/planos-manutencao/meu-roteiro", { headers: H });
      const d = await resp.json();
      return { status: resp.status, ids: (d.planos || []).map((x) => x.id) };
    };

    const hoje = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const daquiA = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return iso(d); };

    // ── 1. O caso normal: vence dentro da janela ────────────────────────────
    const pDentro = await novoPlano(await novoPredio("Rot Dentro " + suf), daquiA(3));
    let rt = await roteiro();
    ok("responde 200", rt.status === 200, "status " + rt.status);
    ok("plano que vence em 3 dias entra", rt.ids.includes(pDentro));

    // ── 2. O caso do defeito: rolado para o mês que vem, chamado ABERTO ─────
    // É o estado em que o job deixa TODO plano do mês assim que roda.
    const cRolado = await novoPredio("Rot Rolado " + suf);
    const pRolado = await novoPlano(cRolado, daquiA(3));
    await pool.query(
      `UPDATE planos_manutencao SET proxima_em = (CURRENT_DATE + INTERVAL '1 month')::date,
              ultima_em = CURRENT_DATE WHERE id = $1`, [pRolado]);
    const ch = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id)
       VALUES ($1, 'Preventiva', 'do mês', 'p4', 'manutencao', 'aberto', $2) RETURNING id`,
      [cRolado, pRolado]);
    lixo.chamados.push(ch.rows[0].id);

    rt = await roteiro();
    ok("plano rolado para o mês que vem, com chamado ABERTO, continua no roteiro",
       rt.ids.includes(pRolado), "ids=" + rt.ids.join(","));

    // ── 3. E some quando o serviço fecha ────────────────────────────────────
    // ⚠️ Sem isto o técnico veria pelo resto do mês o prédio de onde saiu.
    await pool.query("UPDATE chamados SET status='fechado', fechado_em=NOW() WHERE id=$1", [ch.rows[0].id]);
    rt = await roteiro();
    ok("mas SAI quando o chamado fecha", !rt.ids.includes(pRolado));

    // ── 4. E não traz o que é de outro mês ──────────────────────────────────
    // Rolado, sem chamado aberto e com `ultima_em` do mês passado: é trabalho de
    // outra competência, e trazê-lo seria o oposto do defeito.
    const cVelho = await novoPredio("Rot Velho " + suf);
    const pVelho = await novoPlano(cVelho, daquiA(3));
    await pool.query(
      `UPDATE planos_manutencao
          SET proxima_em = (CURRENT_DATE + INTERVAL '2 months')::date,
              ultima_em  = (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date
        WHERE id = $1`, [pVelho]);
    rt = await roteiro();
    ok("plano do mês PASSADO não entra", !rt.ids.includes(pVelho));

    // ── 5. A regra de dono continua valendo ─────────────────────────────────
    // ⚠️ O conserto da janela não pode abrir o roteiro para prédio de outro.
    const outro = await pool.query(
      "INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", ["Téc Outro " + suf]);
    lixo.tecnicos.push(outro.rows[0].id);
    await pool.query(
      `INSERT INTO planos_atribuicoes (plano_id, competencia, tecnico_id)
       VALUES ($1, date_trunc('month', CURRENT_DATE)::date, $2)`, [pDentro, outro.rows[0].id]);
    rt = await roteiro();
    ok("prédio escalado para OUTRO sai do meu roteiro", !rt.ids.includes(pDentro));
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.planos) {
      await pool.query("DELETE FROM planos_atribuicoes WHERE plano_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    }
    for (const z of lixo.zonas) await pool.query("DELETE FROM planos_zona_responsavel WHERE zona=$1", [z]).catch(() => {});
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.tecnicos) await pool.query("UPDATE tecnicos SET usuario_id=NULL WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.usuarios) await pool.query("DELETE FROM usuarios WHERE id=$1", [id]).catch(() => {});
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
