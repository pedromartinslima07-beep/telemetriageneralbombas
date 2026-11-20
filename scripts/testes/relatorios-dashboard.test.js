// O dashboard de Relatórios (GET /relatorios/dashboard), rota de verdade
// contra o banco de teste.
//
//   node scripts/testes/relatorios-dashboard.test.js
//
// ⚠️ POR QUE EXISTE (20/11/2026). A rota tem uma dúzia de consultas com $1/$2
// repetidos como data e como hora de São Paulo: é o terreno do 42P08 do
// CLAUDE.md, que nem node --check nem uma consulta solta pegam. Aqui cada
// período é pedido de verdade, e as réguas que o Pedro aprovou são provadas
// com um caso montado:
//   - chamado P1 sem ninguém ter ido e prazo vencido   → fora do prazo
//   - chamado no mesmo equipamento até 30 dias depois  → retrabalho, contado
//     para o técnico do chamado ANTERIOR
//   - chamado de preventiva                            → não conta como chamado
//   - gerente                                          → sem o bloco do dinheiro
//
// ⚠️ NÃO ESCREVE NADA fora do que cria e apaga no finally.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { criarTecnicoDeTeste, apagarTecnicoDeTeste } = require("./_tecnico-fixture");

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
  app.use("/relatorios", require("../../src/routes/relatorios.routes").relatoriosRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const tok = role => ({ Authorization: "Bearer " + jwt.sign({ id: 1, role }, process.env.JWT_SECRET, { expiresIn: "10m" }) });
  const pegar = async (q, role = "admin") => {
    const res = await fetch(base + "/relatorios/dashboard" + q, { headers: tok(role) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const lixo = { chamados: [], planos: [], condos: [], equip: [] };
  let tec = null;

  try {
    // 1. todo período responde, e a forma é a que a tela lê
    for (const per of ["mes", "ant", "tri", "ano"]) {
      const x = await pegar("?periodo=" + per);
      ok(`período ${per} responde 200`, x.status === 200, x.status !== 200 ? JSON.stringify(x.body) : "");
      if (x.status === 200) {
        ok(`  ${per}: série de 12 meses`, x.body.serie.length === 12, x.body.serie.map(s => s.mes).join(","));
        ok(`  ${per}: o último mês da série é o do fim do período`,
          x.body.serie[11].mes === new Date(Date.parse(x.body.periodo.fim + "T12:00:00Z") - 864e5).toISOString().slice(0, 7));
      }
    }
    ok("período inválido dá 400", (await pegar("?periodo=xyz")).status === 400);
    ok("operador não entra (403)", (await pegar("?periodo=mes", "operador")).status === 403);

    const ger = await pegar("?periodo=mes", "gerente");
    ok("gerente entra", ger.status === 200);
    ok("gerente não recebe o dinheiro", ger.body && ger.body.dinheiro === false && ger.body.financeiro === undefined
      && ger.body.atual.fat_contratos === undefined && ger.body.serie[0].fat_contratos === undefined);

    // 2. o caso montado
    const antes = (await pegar("?periodo=mes")).body;
    const suf = String(Date.now()).slice(-8);
    const condo = (await pool.query(
      `INSERT INTO condominios (nome, ativo, cidade) VALUES ($1, TRUE, 'São Paulo') RETURNING id`, ["Dash " + suf])).rows[0].id;
    lixo.condos.push(condo);
    tec = await criarTecnicoDeTeste(pool, "dashboard");
    const eq = (await pool.query(
      `INSERT INTO equipamentos (codigo, status, condominio_id, tipo, marca, modelo)
       VALUES ($1, 'instalado', $2, 'bomba', 'MarcaDash', $3) RETURNING id`, ["DSH" + suf, condo, "M" + suf])).rows[0].id;
    lixo.equip.push(eq);
    // o que voltou abre 30 min depois de vencer o prazo de chegada do P1
    const sla = (await pool.query(`SELECT sla_chegada_min FROM sla_definicoes WHERE prioridade = 'p1'`)).rows[0];
    const p1Vence = !!(sla && sla.sla_chegada_min != null);
    const atrasoMin = (p1Vence ? sla.sla_chegada_min : 90) + 30;
    // chamado anterior: fechado há 3 h pelo técnico de teste, no equipamento
    const a = (await pool.query(
      `INSERT INTO chamados (condominio_id, status, prioridade, titulo, tecnico_id, equipamento_id, criado_em, fechado_em)
       VALUES ($1, 'fechado', 'p3', 'Dash anterior', $2, $3, NOW() - make_interval(mins => $4::int + 300), NOW() - make_interval(mins => $4::int + 60)) RETURNING id`,
      [condo, tec.id, eq, atrasoMin])).rows[0].id;
    lixo.chamados.push(a);
    // o que voltou: P1 aberto depois do anterior fechar, ninguém foi, prazo vencido
    const b = (await pool.query(
      `INSERT INTO chamados (condominio_id, status, prioridade, titulo, equipamento_id, criado_em)
       VALUES ($1, 'aberto', 'p1', 'Dash voltou', $2, NOW() - make_interval(mins => $3::int)) RETURNING id`, [condo, eq, atrasoMin])).rows[0].id;
    lixo.chamados.push(b);
    // preventiva do mês: não pode contar como chamado
    const pl = (await pool.query(
      `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
       VALUES ($1, 'Preventiva dash', 30, CURRENT_DATE, TRUE) RETURNING id`, [condo])).rows[0].id;
    lixo.planos.push(pl);
    const c = (await pool.query(
      `INSERT INTO chamados (condominio_id, status, prioridade, titulo, plano_manutencao_id, competencia, tecnico_id)
       VALUES ($1, 'fechado', 'p4', 'Preventiva dash', $2, date_trunc('month', CURRENT_DATE)::date, $3) RETURNING id`,
      [condo, pl, tec.id])).rows[0].id;
    lixo.chamados.push(c);


    const depois = (await pegar("?periodo=mes")).body;
    ok("os dois corretivos contam como chamado, a preventiva não",
      depois.atual.chamados - antes.atual.chamados === 2, `antes=${antes.atual.chamados} depois=${depois.atual.chamados}`);
    ok("a preventiva entra nas previstas e nas feitas",
      depois.atual.prev_previstas - antes.atual.prev_previstas === 1 && depois.atual.prev_feitas - antes.atual.prev_feitas === 1);
    const predio = depois.predios.find(x => x.condominio_id === condo);
    ok("o prédio aparece com 2 chamados", predio && predio.n === 2, JSON.stringify(predio));
    if (p1Vence) {
      const fp = depois.fora_prazo.find(x => x.condominio_id === condo);
      ok("o P1 sem chegada entra em fora do prazo", fp && fp.n === 1 && fp.pior_titulo === "Dash voltou", JSON.stringify(fp));
      ok("e o prazo decidido sobe 1", depois.atual.prazo_decididos - antes.atual.prazo_decididos === 1);
    } else {
      ok("(P1 sem prazo de chegada no banco de teste: fora do prazo não conferido)", true);
    }
    const t = depois.tecnicos.find(x => x.id === tec.id);
    ok("o retrabalho conta para o técnico do chamado anterior", t && t.ret === 1 && t.ret_predios === 1, JSON.stringify(t));
    ok("e as preventivas dele: 1 de 1", t && t.prev_feitas === 1 && t.prev_previstas === 1);
    const e = depois.equipamentos.find(x => x.modelo === "MarcaDash M" + suf);
    ok("o equipamento aparece com 2 chamados em 1 prédio", e && e.n === 2 && e.predios === 1, JSON.stringify(depois.equipamentos.slice(0, 3)));
    ok("a série do mês atual soma os mesmos 2", depois.serie[11].chamados - antes.serie[11].chamados === 2);
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.planos) await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.equip) await pool.query("DELETE FROM equipamentos WHERE id=$1", [id]).catch(() => {});
    await apagarTecnicoDeTeste(pool, tec);
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
    srv.closeAllConnections?.();
    await new Promise(res => srv.close(res));
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter(x => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exitCode = bons === r.length ? 0 : 1;
  })
  .catch(e => { console.error("ERRO:", e); process.exitCode = 1; });
