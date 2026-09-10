// "Já foi feita": a baixa da preventiva marcada à mão na tela do operador.
//
//   node scripts/testes/preventiva-feita-a-mao.test.js
//
// ⚠️ O QUE ELE PROVA de mais importante é que MARCAR ROLA O CICLO e DESFAZER
// DEVOLVE O CICLO EXATO. A marcação é de um clique e sem confirmação; se o
// desfazer não devolver `proxima_em` e `ultima_em` ao que eram, um clique
// errado empurra o prédio para o mês seguinte e ninguém percebe até a visita
// não acontecer.
//
// ⚠️ E QUE A ROTA NÃO ACEITA "EM CAMPO". Chamado aberto com técnico dentro é
// serviço andando, e quem o encerra é a O.S. que ele assina no prédio.
//
// ⚠️ ROTA COM `$n` REPETIDO SÓ SE TESTA EXERCITANDO A ROTA (CLAUDE.md): o
// `POST` daqui usa a competência em cinco lugares da mesma query. `node
// --check` e `UPDATE` no banco não pegam 42P08.
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

const app = express();
app.use(express.json());
app.use("/operador", require("../../src/routes/operador.routes").operadorRouter);
app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = { planos: [], condos: [], chamados: [], tecnicos: [], os: [] };

  try {
    const u = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!u.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const token = jwt.sign({ id: u.rows[0].id, role: u.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

    const sufixo = String(Date.now()).slice(-8);
    const hoje = new Date();
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const dia1 = comp + "-01";

    const t = await pool.query(
      "INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", ["Téc " + sufixo]
    );
    lixo.tecnicos.push(t.rows[0].id);
    const tecnico = t.rows[0].id;

    const novoPlano = async (rot) => {
      const c = await pool.query(
        `INSERT INTO condominios (nome, nome_fantasia, zona, ativo)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ["COND " + rot + " " + sufixo, "Ed. " + rot, "ZBaixa" + sufixo]
      );
      lixo.condos.push(c.rows[0].id);
      const pl = await pool.query(
        `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
         VALUES ($1, $2, 30, $3::date, TRUE) RETURNING id`,
        [c.rows[0].id, "Preventiva mensal " + rot, dia1]
      );
      lixo.planos.push(pl.rows[0].id);
      return { plano: pl.rows[0].id, condo: c.rows[0].id };
    };

    const a = await novoPlano("A");  // marcada e desfeita
    const b = await novoPlano("B");  // marcada com o chamado órfão do job
    const c = await novoPlano("C");  // em campo: a rota tem de recusar

    const tela = async () => (await (await fetch(base + "/operador/preventivas?mes=" + comp, { headers: H })).json());
    const doPlano = (dados, id) => dados.planos.find((p) => p.id === id);
    const marcar = (id) => fetch(base + `/operador/preventivas/${id}/feita`, {
      method: "POST", headers: H, body: JSON.stringify({ mes: comp }),
    });
    const desfazer = (id) => fetch(base + `/operador/preventivas/${id}/feita?mes=` + comp, {
      method: "DELETE", headers: H,
    });
    // ⚠️ `::text` NAS DATAS. `DATE` volta do pg como objeto Date, e comparar
    // `String(date)` compara "Thu Oct 01 2026 ..." — texto que ordena pelo dia
    // da semana. A primeira versao deste teste caiu nisso e acusou a rota de
    // nao rolar o ciclo quando ela rolava.
    const planoNoBanco = async (id) => (await pool.query(
      `SELECT proxima_em::text AS proxima_em, ultima_em::text AS ultima_em, ultima_os_id
         FROM planos_manutencao WHERE id = $1`, [id]
    )).rows[0];

    // ── O caso simples: sem chamado nenhum ───────────────────────────────
    let d = await tela();
    ok("antes de marcar, a preventiva está a fazer", doPlano(d, a.plano).estado === "a_fazer");

    const antesA = await planoNoBanco(a.plano);
    const resp = await marcar(a.plano);
    const jResp = await resp.json();
    ok("marcar responde 200", resp.status === 200 && jResp.ok === true);
    ok("e a resposta carimba quem marcou", !!jResp.baixa_manual_em);

    d = await tela();
    ok("a preventiva passa a feita", doPlano(d, a.plano).estado === "feita");
    ok("e a tela diz que a baixa foi à mão", !!doPlano(d, a.plano).baixa_manual_em);
    ok("com o nome de quem marcou", !!doPlano(d, a.plano).baixa_manual_por_nome);

    // ⚠️ O CICLO ROLA. Sem isto o job reabriria o chamado do mês na madrugada
    // seguinte e a preventiva marcada voltaria como "em campo".
    const depoisA = await planoNoBanco(a.plano);
    ok("marcar rola proxima_em para o ciclo seguinte",
       depoisA.proxima_em > antesA.proxima_em);
    ok("e grava ultima_em dentro da competência marcada",
       String(depoisA.ultima_em).slice(0, 7) === comp);

    // Marcar duas vezes não pode reescrever as datas guardadas.
    const dobro = await marcar(a.plano);
    ok("marcar de novo não estoura na chave primária", dobro.status === 200);
    const guardado = await pool.query(
      `SELECT proxima_em_anterior::text AS proxima_em_anterior
         FROM planos_baixas_manuais WHERE plano_id = $1 AND competencia = $2::date`,
      [a.plano, dia1]
    );
    ok("e a data guardada continua sendo a de ANTES da primeira baixa",
       guardado.rows[0].proxima_em_anterior === antesA.proxima_em);

    // ── Desfazer devolve o plano exato ───────────────────────────────────
    const des = await desfazer(a.plano);
    ok("desfazer responde 200", des.status === 200);
    const voltouA = await planoNoBanco(a.plano);
    ok("e proxima_em volta ao que era", voltouA.proxima_em === antesA.proxima_em);
    ok("e ultima_em também", voltouA.ultima_em === antesA.ultima_em);
    d = await tela();
    ok("a preventiva volta a cobrar o mês", doPlano(d, a.plano).estado === "a_fazer");
    ok("desfazer o que não foi marcado responde 404", (await desfazer(a.plano)).status === 404);

    // ── O chamado órfão do job sai junto ─────────────────────────────────
    const chOrfao = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id)
       VALUES ($1, 'Preventiva B', 'orfao', 'p4', 'manutencao', 'aberto', $2) RETURNING id`,
      [b.condo, b.plano]
    );
    lixo.chamados.push(chOrfao.rows[0].id);

    const respB = await marcar(b.plano);
    const jB = await respB.json();
    ok("marcar com chamado órfão responde 200", respB.status === 200);
    ok("e diz qual chamado cancelou", jB.chamado_cancelado_id === chOrfao.rows[0].id);
    const st = async (id) => (await pool.query("SELECT status FROM chamados WHERE id = $1", [id])).rows[0].status;
    ok("o chamado do mês fica cancelado", (await st(chOrfao.rows[0].id)) === "cancelado");
    // O histórico é a memória de quem mexeu no chamado.
    const hist = await pool.query(
      `SELECT count(*)::int AS n FROM historico_chamados
        WHERE chamado_id = $1 AND campo_alterado = 'status'`,
      [chOrfao.rows[0].id]
    );
    ok("e o cancelamento entra no histórico do chamado", hist.rows[0].n >= 1);

    const desB = await desfazer(b.plano);
    const jDesB = await desB.json();
    ok("desfazer reabre o chamado que a baixa cancelou",
       desB.status === 200 && jDesB.chamado_reaberto_id === chOrfao.rows[0].id);
    ok("e ele volta a aberto", (await st(chOrfao.rows[0].id)) === "aberto");

    // ── A O.S. da preventiva feita (10/09/2026) ──────────────────────────
    // ⚠️ O CAMINHO NORMAL, e é o que faltava na tela: o técnico finaliza a O.S.
    // no prédio, ela FECHA o chamado do plano, e a placa passa a poder abrir o
    // documento que prova a visita. O vínculo é
    // planos_manutencao <- chamados.plano_manutencao_id <- ordens_servico.chamado_id.
    const dOs = await novoPlano("D");
    const chFechado = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, fechado_em)
       VALUES ($1, 'Preventiva D', 'feita', 'p4', 'manutencao', 'fechado', $2, NOW()) RETURNING id`,
      [dOs.condo, dOs.plano]
    );
    lixo.chamados.push(chFechado.rows[0].id);
    const osFin = await pool.query(
      `INSERT INTO ordens_servico (numero, chamado_id, condominio_id, tipos_servico, itens_verificados,
                                   necessario_retorno, orcamento_necessario, finalizada_em)
       VALUES ($1, $2, $3, ARRAY['preventiva_mensal'], '{}'::jsonb, FALSE, FALSE, NOW()) RETURNING id`,
      ["OS-TESTE-" + sufixo, chFechado.rows[0].id, dOs.condo]
    );
    lixo.os.push(osFin.rows[0].id);

    d = await tela();
    const pD = doPlano(d, dOs.plano);
    ok("chamado fechado no mês → feita", pD.estado === "feita");
    ok("e a tela traz a O.S. que executou a preventiva", pD.exec_os_id === osFin.rows[0].id);
    ok("com o número, que é o que o operador cita ao telefone",
       pD.exec_os_numero === "OS-TESTE-" + sufixo);

    // ⚠️ E NÃO NA PREVENTIVA AINDA ABERTA: `ultima_os_id` de um plano em aberto
    // é a O.S. do mês PASSADO, e mostrá-la diria que a visita deste mês já
    // aconteceu. Quem segura essa regra é o front (`osDaPlaca`), mas a coluna
    // da execução tem de vir vazia aqui.
    ok("preventiva ainda aberta não tem O.S. de execução",
       doPlano(d, a.plano).exec_os_id === null);

    // ── Em campo: a rota recusa ──────────────────────────────────────────
    const chCampo = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, tecnico_id)
       VALUES ($1, 'Preventiva C', 'em campo', 'p4', 'manutencao', 'aberto', $2, $3) RETURNING id`,
      [c.condo, c.plano, tecnico]
    );
    lixo.chamados.push(chCampo.rows[0].id);

    d = await tela();
    ok("(controle) o plano C está em campo", doPlano(d, c.plano).estado === "em_campo");
    const respC = await marcar(c.plano);
    ok("marcar uma preventiva em campo responde 409", respC.status === 409);
    ok("e não cria baixa nenhuma", (await pool.query(
      "SELECT count(*)::int AS n FROM planos_baixas_manuais WHERE plano_id = $1", [c.plano]
    )).rows[0].n === 0);
    ok("nem cancela o chamado de quem está no prédio",
       (await st(chCampo.rows[0].id)) === "aberto");

    // ── Entradas inválidas ───────────────────────────────────────────────
    ok("mês inválido responde 400", (await fetch(base + `/operador/preventivas/${a.plano}/feita`, {
      method: "POST", headers: H, body: JSON.stringify({ mes: "2026-13" }),
    })).status === 400);
    ok("plano inexistente responde 404", (await marcar(999999999)).status === 404);
    ok("sem token responde 401", (await fetch(base + `/operador/preventivas/${a.plano}/feita`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    })).status === 401);

  } finally {
    // ⚠️ A ORDEM IMPORTA: as baixas apontam para chamados e para o plano.
    await pool.query("DELETE FROM planos_baixas_manuais WHERE plano_id = ANY($1::int[])", [lixo.planos]).catch(() => {});
    await pool.query("DELETE FROM ordens_servico WHERE id = ANY($1::int[])", [lixo.os]).catch(() => {});
    await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1::int[])", [lixo.chamados]).catch(() => {});
    await pool.query("DELETE FROM chamados WHERE id = ANY($1::int[])", [lixo.chamados]).catch(() => {});
    await pool.query("DELETE FROM planos_manutencao WHERE id = ANY($1::int[])", [lixo.planos]).catch(() => {});
    await pool.query("DELETE FROM condominios WHERE id = ANY($1::int[])", [lixo.condos]).catch(() => {});
    await pool.query("DELETE FROM tecnicos WHERE id = ANY($1::int[])", [lixo.tecnicos]).catch(() => {});
    server.close();
    await pool.end();

    const falhas = r.filter(([, c]) => !c);
    for (const [nome, cond] of r) console.log((cond ? "  ok  " : "FALHA ") + nome);
    console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
    process.exit(falhas.length ? 1 : 0);
  }
})();
