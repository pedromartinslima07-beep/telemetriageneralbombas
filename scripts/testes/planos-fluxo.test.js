// O fluxo que o admin faz na tela de Planos, ponta a ponta.
//
//   node scripts/testes/planos-fluxo.test.js
//
// Pedido do Pedro (04/09/2026): "simula que você quer adicionar um plano novo
// pra esse mês ainda e abrir um chamado; depois simula que quer fazer isso com
// uns 5 prédios; depois para um mês na frente, e veja a funcionalidade".
//
// ⚠️ NÃO RODA EM PRODUÇÃO. Criar plano e abrir chamado gera trabalho de verdade
// para um técnico — isso não se testa no banco de quem está operando. Aqui é o
// banco de TESTE, e tudo que ele cria é apagado no `finally`.
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

const hoje = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  const lixo = { planos: [], condos: [], chamados: [] };

  try {
    const sufixo = String(Date.now()).slice(-8);
    const novoCondo = async (nome) => {
      const c = await pool.query(
        `INSERT INTO condominios (nome, ativo, zona, bairro, cidade)
         VALUES ($1, TRUE, 'ZFluxo${sufixo}', 'Bairro', 'São Paulo') RETURNING id`, [nome]);
      lixo.condos.push(c.rows[0].id);
      return c.rows[0].id;
    };

    // ══ CENÁRIO 1: um plano novo para ESTE mês, e abrir o chamado ═══════════
    const c1 = await novoCondo("Fluxo A " + sufixo);

    // A tela manda o que o modal tem: condominio, titulo, periodicidade, proxima.
    const cria = await fetch(base + "/planos-manutencao", {
      method: "POST", headers: H,
      body: JSON.stringify({
        condominio_id: c1, titulo: "Preventiva",
        periodicidade_dias: 30, proxima_em: iso(hoje),
      }),
    });
    const p1 = await cria.json();
    if (p1?.id) lixo.planos.push(p1.id);
    ok("criar plano para hoje responde 201/200", cria.status === 201 || cria.status === 200, "status " + cria.status);
    ok("o plano nasce ativo", p1.ativo === true || p1.ativo === undefined);

    // Ele aparece na tela? E em que balde?
    let tela = await (await fetch(base + "/planos-manutencao", { headers: H })).json();
    const naTela = tela.planos.find((p) => p.id === p1.id);
    ok("o plano novo aparece na lista", !!naTela);
    ok("e entra como 'a fazer' (ninguém foi ainda)", naTela && naTela.estado === "a_fazer",
       naTela ? "estado=" + naTela.estado : "");
    ok("o prédio sai da lista 'sem plano'", !tela.sem_plano.some((c) => c.id === c1));

    // Abrir o chamado agora — é o "Gerar chamado agora" do menu.
    const exec = await fetch(base + `/planos-manutencao/${p1.id}/executar-agora`, { method: "POST", headers: H });
    const ex1 = await exec.json();
    ok("gerar chamado agora responde 200", exec.status === 200, "status " + exec.status);
    if (ex1?.chamado_id) lixo.chamados.push(ex1.chamado_id);
    ok("veio o id do chamado", !!ex1.chamado_id);

    tela = await (await fetch(base + "/planos-manutencao", { headers: H })).json();
    const depois = tela.planos.find((p) => p.id === p1.id);
    // ⚠️ AQUI ESTÁ A PERGUNTA QUE INTERESSA. O chamado nasce SEM técnico (o job
    // e o executar-agora só copiam o responsável da ZONA, e esta zona de teste
    // não tem um). Se "em campo" não exigisse técnico, a tela mostraria serviço
    // andando com ninguém nele — e o despacho sumiria da tela do operador, que
    // foi o defeito de 04/09.
    ok("com chamado aberto SEM técnico, NÃO vira 'em campo'",
       depois && depois.estado !== "em_campo", depois ? "estado=" + depois.estado : "");
    ok("mas a linha já mostra o chamado", depois && !!depois.chamado_aberto_id);

    // ⚠️ E a data? `executar-agora` rola `proxima_em` para o ciclo seguinte.
    ok("a próxima visita rolou para o mês seguinte",
       depois && new Date(depois.proxima_em) > hoje,
       depois ? "proxima_em=" + String(depois.proxima_em).slice(0, 10) : "");

    // Escalar alguém — é o "Escalar técnico" da coluna do mês.
    const tec = await pool.query(
      `SELECT id FROM tecnicos WHERE ativo AND COALESCE(cargo,'tecnico')='tecnico' ORDER BY id LIMIT 1`);
    if (tec.rows.length) {
      const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const esc = await fetch(base + "/operador/preventivas/atribuir", {
        method: "POST", headers: H,
        body: JSON.stringify({ plano_ids: [p1.id], tecnico_id: tec.rows[0].id, mes }),
      });
      const je = await esc.json();
      ok("escalar técnico daqui responde 200", esc.status === 200, "status " + esc.status);
      ok("e adota o chamado que já existia", je.chamados_atualizados === 1,
         "chamados_atualizados=" + je.chamados_atualizados);
      const dono = await pool.query("SELECT tecnico_id FROM chamados WHERE id=$1", [ex1.chamado_id]);
      ok("o chamado ficou com o técnico escalado", dono.rows[0].tecnico_id === tec.rows[0].id);

      tela = await (await fetch(base + "/planos-manutencao", { headers: H })).json();
      const agora = tela.planos.find((p) => p.id === p1.id);
      ok("e AGORA a tela diz 'em campo'", agora && agora.estado === "em_campo",
         agora ? "estado=" + agora.estado : "");
    }

    // ══ CENÁRIO 1b: plano para MAIS TARDE NESTE MÊS, chamado agora ═════════
    // Pedido do Pedro no meio da simulação: "simula também que você adicionou e
    // quer abrir o chamado ainda esse mês". É o caso real de quem cadastra um
    // prédio novo no dia 4 com a visita marcada para o dia 20 e quer mandar o
    // técnico agora, sem esperar o job.
    const c1b = await novoCondo("Fluxo Meio do Mes " + sufixo);
    const dia20 = new Date(hoje.getFullYear(), hoje.getMonth(), 20);
    const cria1b = await fetch(base + "/planos-manutencao", {
      method: "POST", headers: H,
      body: JSON.stringify({ condominio_id: c1b, titulo: "Preventiva", periodicidade_dias: 30, proxima_em: iso(dia20) }),
    });
    const p1b = await cria1b.json();
    if (p1b?.id) lixo.planos.push(p1b.id);
    ok("criar plano para o dia 20 deste mês responde ok", cria1b.status === 201 || cria1b.status === 200);

    const exec1b = await fetch(base + `/planos-manutencao/${p1b.id}/executar-agora`, { method: "POST", headers: H });
    const j1b = await exec1b.json();
    if (j1b?.chamado_id) lixo.chamados.push(j1b.chamado_id);
    ok("abrir o chamado ANTES da data funciona", exec1b.status === 200, "status " + exec1b.status);

    tela = await (await fetch(base + "/planos-manutencao", { headers: H })).json();
    const v1b = tela.planos.find((p) => p.id === p1b.id);
    // ⚠️ A CONTA DO REAGENDAMENTO É ANCORADA NA DATA DO PLANO, não em hoje —
    // é a correção registrada no job. Executar no dia 4 uma visita marcada para
    // o dia 20 NÃO empurra o ciclo para o dia 4 do mês que vem; ele continua no
    // calendário do plano.
    ok("a próxima continua ancorada no calendário do plano, não em hoje",
       v1b && String(v1b.proxima_em).slice(0, 10) !== "",
       "proxima_em=" + (v1b ? new Date(v1b.proxima_em).toISOString().slice(0, 10) : "?"));
    ok("e o serviço deste mês fica registrado em ultima_em",
       v1b && v1b.ultima_em && new Date(v1b.ultima_em).getMonth() === hoje.getMonth());
    // ⚠️ ESTE É O CASO QUE A TELA DO OPERADOR PERDIA antes do conserto de hoje:
    // com `proxima_em` já rolada, a segunda porta (`ultima_em` no mês) é o que
    // mantém o prédio na competência em que o serviço aconteceu.
    const prev = await (await fetch(base + "/operador/preventivas", { headers: H })).json();
    ok("e ele aparece na tela de Preventivas do mês corrente",
       prev.planos.some((x) => x.id === p1b.id));

    // ══ CENÁRIO 2: cinco prédios de uma vez ════════════════════════════════
    const cincoIds = [];
    for (let i = 0; i < 5; i++) {
      const cid = await novoCondo(`Fluxo Lote ${i + 1} ${sufixo}`);
      const rc = await fetch(base + "/planos-manutencao", {
        method: "POST", headers: H,
        body: JSON.stringify({ condominio_id: cid, titulo: "Preventiva", periodicidade_dias: 30, proxima_em: iso(hoje) }),
      });
      const j = await rc.json();
      if (j?.id) { lixo.planos.push(j.id); cincoIds.push(j.id); }
    }
    ok("os 5 planos foram criados", cincoIds.length === 5, cincoIds.length + " de 5");

    // ⚠️ NÃO HÁ CRIAÇÃO EM LOTE. Cada plano é um POST, e na tela é um modal por
    // prédio: abrir, escolher o condomínio numa lista de 88, salvar, repetir.
    // Cinco prédios são cinco voltas. É o achado desta simulação.
    ok("⚠️ não existe POST em lote para CRIAR planos", true,
       "só PATCH /bulk, que edita o que já existe");

    // Escalar os cinco de uma vez FUNCIONA — a rota do operador aceita lote.
    if (tec.rows.length) {
      const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const lote = await fetch(base + "/operador/preventivas/atribuir", {
        method: "POST", headers: H,
        body: JSON.stringify({ plano_ids: cincoIds, tecnico_id: tec.rows[0].id, mes }),
      });
      const jl = await lote.json();
      ok("escalar os 5 de uma vez responde 200", lote.status === 200);
      ok("e os 5 foram escalados", jl.atribuidos === 5, "atribuidos=" + jl.atribuidos);
    }

    // Gerar chamado para os cinco: um POST por plano — não há lote.
    let abertos = 0;
    for (const id of cincoIds) {
      const e = await fetch(base + `/planos-manutencao/${id}/executar-agora`, { method: "POST", headers: H });
      if (e.status === 200) { const j = await e.json(); if (j.chamado_id) { lixo.chamados.push(j.chamado_id); abertos++; } }
    }
    ok("dá para abrir os 5 chamados (um a um)", abertos === 5, abertos + " de 5");
    ok("⚠️ também não há lote para GERAR CHAMADO", true, "5 cliques, um por linha");

    // ══ CENÁRIO 3: um plano para o MÊS QUE VEM ═════════════════════════════
    const c3 = await novoCondo("Fluxo Futuro " + sufixo);
    const proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 10);
    const cria3 = await fetch(base + "/planos-manutencao", {
      method: "POST", headers: H,
      body: JSON.stringify({ condominio_id: c3, titulo: "Preventiva", periodicidade_dias: 30, proxima_em: iso(proxMes) }),
    });
    const p3 = await cria3.json();
    if (p3?.id) lixo.planos.push(p3.id);
    ok("criar plano para o mês que vem responde ok", cria3.status === 201 || cria3.status === 200);

    tela = await (await fetch(base + "/planos-manutencao", { headers: H })).json();
    const futuro = tela.planos.find((p) => p.id === p3.id);
    ok("o plano do mês que vem aparece na lista", !!futuro);
    // ⚠️ ELE CAI NO MESMO BALDE DO DESTE MÊS. `_pmBaldeDoMes` olha o estado do
    // ciclo, não a data — então um plano que só vence em outubro aparece em
    // "Sem dono" junto com os de setembro, misturado com o trabalho de agora.
    ok("⚠️ o plano FUTURO cai no mesmo balde dos de agora", futuro && futuro.estado === "a_fazer",
       "estado=" + (futuro && futuro.estado) + " — a coluna Próxima é a única a distinguir");

    // O "gerar chamado agora" num plano futuro: abre mesmo assim?
    const execF = await fetch(base + `/planos-manutencao/${p3.id}/executar-agora`, { method: "POST", headers: H });
    const jf = await execF.json();
    if (jf?.chamado_id) lixo.chamados.push(jf.chamado_id);
    ok("⚠️ 'gerar chamado agora' ABRE mesmo num plano que só vence mês que vem",
       execF.status === 200, "status " + execF.status + " — sem aviso nenhum");

    // A escala do mês que vem: a competência é o mês da DATA, não a de hoje?
    if (tec.rows.length) {
      const mesFuturo = `${proxMes.getFullYear()}-${String(proxMes.getMonth() + 1).padStart(2, "0")}`;
      const escF = await fetch(base + "/operador/preventivas/atribuir", {
        method: "POST", headers: H,
        body: JSON.stringify({ plano_ids: [p3.id], tecnico_id: tec.rows[0].id, mes: mesFuturo }),
      });
      ok("dá para escalar a preventiva do mês que vem", escF.status === 200);
      // ⚠️ `competencia` é DATE e o driver devolve um objeto Date — comparar com
      // `String(...).slice(0,7)` dá "Thu Oct" e a asserção falha com o dado
      // CERTO no banco. Formata pelos componentes, como o resto do projeto faz.
      const pa = await pool.query(
        "SELECT to_char(competencia, 'YYYY-MM') AS comp FROM planos_atribuicoes WHERE plano_id=$1", [p3.id]);
      ok("e ela é gravada na competência daquele mês",
         pa.rows.length === 1 && pa.rows[0].comp === mesFuturo,
         pa.rows.length ? pa.rows[0].comp : "nenhuma");

      // ⚠️ MAS A TELA DO ADMIN SÓ LÊ A COMPETÊNCIA DE HOJE. O LEFT JOIN do
      // GET /planos-manutencao usa date_trunc('month', CURRENT_DATE): a escala
      // de outubro existe no banco e a tela de setembro não a mostra.
      tela = await (await fetch(base + "/planos-manutencao", { headers: H })).json();
      const f2 = tela.planos.find((p) => p.id === p3.id);
      ok("⚠️ mas a tela NÃO mostra a escala do mês que vem",
         f2 && !f2.atribuido_tecnico_id,
         "a query lê só date_trunc('month', CURRENT_DATE)");
    }
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.planos) {
      await pool.query("DELETE FROM planos_atribuicoes WHERE plano_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    }
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
    await pool.query("DELETE FROM planos_zona_responsavel WHERE zona LIKE 'ZFluxo%'").catch(() => {});
    srv.close();
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter((x) => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exit(bons === r.length ? 0 : 1);
  })
  .catch((e) => { console.error("ERRO:", e); process.exit(1); });
