// A tela de chamados do admin separa preventiva do resto.
//
//   node scripts/testes/chamados-preventiva-separada.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE. Pedido do Pedro em 04/09/2026: *"na tela de
// chamados do admin separe preventiva do restante, porque hoje está poluindo"*.
// O job gera uma preventiva por prédio por mês — **69 de uma vez em 04/09** —, e
// elas afogavam os chamados que alguém abriu de fato: o painel mostrava 82
// abertos quando 4 pediam alguém.
//
// ⚠️ O CORTE É PELA ORIGEM, NUNCA PELA PRIORIDADE. Preventiva é P4, mas nem todo
// P4 é preventiva; filtrar por peso esconderia serviço avulso de baixa urgência,
// que o admin precisa ver. É a mesma decisão do filtro da fila do turno.
//
// ⚠️ E O CAMPO PRECISAVA CHEGAR NA LISTAGEM. `plano_manutencao_id` existe na
// tabela e no `GET /chamados/:id` desde sempre — era a LISTA que não o trazia,
// então o front não tinha como distinguir. Se ele sumir do SELECT, o filtro
// silenciosamente para de separar: nada quebra, tudo volta a poluir.
//
// ⚠️ NÃO ESCREVE NADA fora do que cria e apaga no `finally`.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
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
  app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const H = { Authorization: "Bearer " + jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
  const lixo = { chamados: [], planos: [], condos: [] };

  try {
    const suf = String(Date.now()).slice(-8);
    const c = await pool.query(
      `INSERT INTO condominios (nome, ativo, cidade) VALUES ($1, TRUE, 'São Paulo') RETURNING id`,
      ["Sep Chamados " + suf]);
    const condo = c.rows[0].id;
    lixo.condos.push(condo);

    const pl = await pool.query(
      `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
       VALUES ($1, 'Preventiva', 30, CURRENT_DATE, TRUE) RETURNING id`, [condo]);
    lixo.planos.push(pl.rows[0].id);

    const novoChamado = async (titulo, prio, plano) => {
      const q = await pool.query(
        `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id)
         VALUES ($1, $2, 'teste', $3, 'manutencao', 'aberto', $4) RETURNING id`,
        [condo, titulo, prio, plano]);
      lixo.chamados.push(q.rows[0].id);
      return q.rows[0].id;
    };
    const idPreventiva = await novoChamado("Preventiva " + suf, "p4", pl.rows[0].id);
    // ⚠️ O avulso é P4 DE PROPÓSITO: é ele que prova que o corte não é por
    // prioridade. Se alguém trocar o filtro para `prioridade === "p4"`, esta
    // asserção cai.
    const idAvulsoP4 = await novoChamado("Avulso P4 " + suf, "p4", null);
    const idUrgente = await novoChamado("Vazamento " + suf, "p1", null);

    // ── O endpoint precisa entregar a origem ────────────────────────────────
    const resp = await fetch(base + "/chamados", { headers: H });
    const lista = await resp.json();
    ok("GET /chamados responde 200", resp.status === 200);
    const arr = Array.isArray(lista) ? lista : (lista.chamados || []);
    const prev = arr.find((x) => x.id === idPreventiva);
    const avul = arr.find((x) => x.id === idAvulsoP4);
    ok("a LISTAGEM traz plano_manutencao_id", prev && "plano_manutencao_id" in prev);
    ok("preenchido na preventiva", prev && prev.plano_manutencao_id === pl.rows[0].id);
    ok("e nulo no avulso", avul && avul.plano_manutencao_id === null);

    // ── O filtro da tela, com as funções REAIS do admin.js ──────────────────
    const js = fs.readFileSync(path.join(__dirname, "../../public/admin.js"), "utf8");
    const ini = js.indexOf("const _chEmAberto");
    const fim = js.indexOf("function _chFmtDataCurta");
    ok("achei o bloco do filtro no admin.js", ini >= 0 && fim > ini);

    global._chamadosData = arr;
    global._chFiltros = { tab: "todos", busca: "" };
    // eslint-disable-next-line no-eval
    eval(js.slice(ini, fim));

    const ids = (tab, busca = "") => {
      _chFiltros = { tab, busca };
      return _chFiltrados().map((x) => x.id);
    };

    ok('"Todos" NÃO mostra preventiva', !ids("todos").includes(idPreventiva));
    ok("mas mostra o resto",
       ids("todos").includes(idAvulsoP4) && ids("todos").includes(idUrgente));
    ok('"Abertos" também esconde a preventiva', !ids("aberto").includes(idPreventiva));
    ok('a aba "Preventivas" mostra SÓ ela',
       ids("preventiva").includes(idPreventiva) && !ids("preventiva").includes(idAvulsoP4));

    // ⚠️ A prova de que o corte é pela ORIGEM: os dois são P4, e só um sai.
    ok("avulso P4 continua na lista principal", ids("todos").includes(idAvulsoP4));
    ok('e a aba "P1 Crítico" segue funcionando', ids("p1").includes(idUrgente));

    // A busca vale nas duas listas — a aba nova não pode ser a única sem ela.
    ok("a busca funciona na aba de preventivas",
       ids("preventiva", suf).includes(idPreventiva));
    ok("e não traz o que não casa", ids("preventiva", "zzz-nao-existe").length === 0);

    // ⚠️ O CONTADOR TEM DE BATER COM A LISTA. Se "Abertos" contasse as
    // preventivas e a lista mostrasse 4, a aba mentiria.
    const abertosNaLista = ids("aberto").length;
    const semPrev = arr.filter((x) => x.plano_manutencao_id == null);
    ok("o contador de abertos ignora preventiva",
       semPrev.filter((x) => x.status === "aberto").length === abertosNaLista,
       `contador=${semPrev.filter((x) => x.status === "aberto").length} lista=${abertosNaLista}`);
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.planos) await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
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
