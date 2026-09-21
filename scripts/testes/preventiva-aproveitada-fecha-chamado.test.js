// A preventiva aproveitada fecha o chamado do mês — mesmo sem baixa.
//
//   node scripts/testes/preventiva-aproveitada-fecha-chamado.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: a correção de 21/09/2026 vive dentro da
// transação de `POST /ordens-servico/:id/finalizar` e depende de uma query com
// parâmetro repetido. O CLAUDE.md registra que isso só se prova exercitando o
// endpoint — `node --check` e UPDATE no banco passam por cima.
//
// O defeito medido em produção: RESIDENCIAL CANADIAN VILLAGE, plano 43. O job
// abriu o chamado #102 em 04/09 e já empurrou `proxima_em` para 04/10. Em 21/09
// o técnico foi ao prédio por OUTRO chamado, marcou `preventiva_mensal` na
// OS-2026-0069 — e `darBaixaPorOS` saiu por "nenhum plano devendo o mês" sem
// fechar nada. A tela do operador cobrou o mês por 17 dias.
//
// Os dois lados da correção, e o segundo importa tanto quanto o primeiro:
//   1. o chamado do mês FECHA (era o defeito);
//   2. as datas do plano NÃO se mexem (quem as moveu foi a abertura; mexer de
//      novo pularia um mês inteiro — é a guarda que já existia e continua).
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config({ quiet: true });
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
app.use("/ordens-servico", require("../../src/routes/ordens-servico.routes").ordensServicoRouter);

const r = [];
const ok = (nome, cond, extra) => {
  r.push([nome, cond]);
  console.log((cond ? "OK  " : "FALHOU  ") + nome + (extra ? "  — " + extra : ""));
};

(async () => {
  const server = app.listen(0);
  const lixo = { os: [], ch: [], pl: [] };
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const sufixo = Date.now().toString().slice(-6);

    const adm = (await pool.query(
      `SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0];
    if (!adm) throw new Error("preciso de 1 usuário admin");
    // ⚠️ UM PRÉDIO SEM PREVENTIVA ABERTA NENHUMA. A correção só fecha quando há
    // exatamente UM chamado de preventiva aberto no condomínio, e o banco de
    // teste tem prédios que já chegam aqui com o chamado do mês de pé — pegar o
    // primeiro `ativo` fazia o teste medir a guarda em vez do conserto.
    const condo = (await pool.query(
      `SELECT c.id FROM condominios c
        WHERE c.ativo
          AND NOT EXISTS (
            SELECT 1 FROM planos_manutencao pm
              JOIN chamados ch ON ch.plano_manutencao_id = pm.id
             WHERE pm.condominio_id = c.id
               AND ch.status NOT IN ('fechado','cancelado'))
        ORDER BY c.id LIMIT 1`)).rows[0];
    if (!condo) throw new Error("preciso de 1 condomínio sem chamado de preventiva aberto");
    const tec = (await pool.query(
      `SELECT id FROM tecnicos WHERE ativo = true ORDER BY id LIMIT 1`)).rows[0];

    const H = {
      Authorization: "Bearer " + jwt.sign(
        { id: adm.id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json",
    };

    // ── O prédio como o job o deixa no dia 4 ────────────────────────────────
    // `executarPlano` grava as datas ao ABRIR: o plano já se considera feito
    // este mês, e mesmo assim tem um chamado aberto esperando alguém.
    const plano = (await pool.query(
      `INSERT INTO planos_manutencao
         (condominio_id, titulo, periodicidade_dias, ultima_em, proxima_em, ativo)
       VALUES ($1, $2, 30, date_trunc('month', CURRENT_DATE)::date,
               (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month 3 days')::date, TRUE)
       RETURNING id, ultima_em, proxima_em`,
      [condo.id, "Preventiva TESTE " + sufixo])).rows[0];
    lixo.pl.push(plano.id);

    const chPrev = (await pool.query(
      `INSERT INTO chamados (titulo, condominio_id, status, prioridade, plano_manutencao_id, criado_em)
       VALUES ($1, $2, 'aberto', 'p4', $3, date_trunc('month', CURRENT_DATE))
       RETURNING id`,
      ["Preventiva TESTE " + sufixo, condo.id, plano.id])).rows[0];
    lixo.ch.push(chPrev.id);

    // ── O outro chamado, o de verdade, com a O.S. pronta para finalizar ─────
    const chOutro = (await pool.query(
      `INSERT INTO chamados (titulo, condominio_id, status, prioridade, tecnico_id)
       VALUES ($1, $2, 'em_atendimento', 'p2', $3) RETURNING id`,
      ["Vazamento TESTE " + sufixo, condo.id, tec ? tec.id : null])).rows[0];
    lixo.ch.push(chOutro.id);

    const os = (await pool.query(
      `INSERT INTO ordens_servico
         (numero, chamado_id, condominio_id, tipos_servico, servico_realizado,
          assinatura_b64, recebido_nome, chegada_em)
       VALUES ($1, $2, $3, ARRAY['visita_tecnica','preventiva_mensal']::text[],
               'resolvido', 'data:image/png;base64,iVBORw0KGgo=', 'Zelador TESTE', NOW())
       RETURNING id`,
      ["OS-T-" + sufixo, chOutro.id, condo.id])).rows[0];
    lixo.os.push(os.id);

    // ── A finalização ───────────────────────────────────────────────────────
    const res = await fetch(base + "/ordens-servico/" + os.id + "/finalizar", {
      method: "POST", headers: H, body: JSON.stringify({}),
    });
    ok("a O.S. finaliza (a query do parâmetro repetido passa no parse)",
      res.status === 200, "status " + res.status);

    const depoisPrev = (await pool.query(
      `SELECT status, fechado_em, tempo_resolucao_seg FROM chamados WHERE id = $1`,
      [chPrev.id])).rows[0];
    ok("o chamado da preventiva FECHA (era o defeito)",
      depoisPrev.status === "fechado", "status " + depoisPrev.status);
    ok("com carimbo de fechamento", !!depoisPrev.fechado_em);
    ok("e o SLA não fica negativo", depoisPrev.tempo_resolucao_seg >= 0,
      String(depoisPrev.tempo_resolucao_seg));

    const depoisPl = (await pool.query(
      `SELECT ultima_em, proxima_em, ultima_os_id FROM planos_manutencao WHERE id = $1`,
      [plano.id])).rows[0];
    ok("as datas do plano NÃO se mexem — quem as moveu foi a abertura",
      String(depoisPl.proxima_em) === String(plano.proxima_em) &&
      String(depoisPl.ultima_em) === String(plano.ultima_em));
    ok("e nenhuma baixa é creditada (ultima_os_id segue vazio)",
      depoisPl.ultima_os_id === null);

    const depoisOutro = (await pool.query(
      `SELECT status FROM chamados WHERE id = $1`, [chOutro.id])).rows[0];
    ok("o chamado da própria O.S. fecha como sempre",
      depoisOutro.status === "fechado", "status " + depoisOutro.status);

    // ── E com DOIS chamados de preventiva abertos, ninguém é fechado ────────
    // Fechar o errado é pior que não fechar: o operador ainda tem o "Já foi
    // feita" para resolver à mão.
    const plano2 = (await pool.query(
      `INSERT INTO planos_manutencao
         (condominio_id, titulo, periodicidade_dias, ultima_em, proxima_em, ativo)
       VALUES ($1, $2, 30, date_trunc('month', CURRENT_DATE)::date,
               (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month 3 days')::date, TRUE)
       RETURNING id`,
      [condo.id, "Preventiva TESTE B " + sufixo])).rows[0];
    lixo.pl.push(plano2.id);

    const chPrevA = (await pool.query(
      `INSERT INTO chamados (titulo, condominio_id, status, prioridade, plano_manutencao_id)
       VALUES ($1, $2, 'aberto', 'p4', $3) RETURNING id`,
      ["Preventiva TESTE A2 " + sufixo, condo.id, plano.id])).rows[0];
    lixo.ch.push(chPrevA.id);
    const chPrevB = (await pool.query(
      `INSERT INTO chamados (titulo, condominio_id, status, prioridade, plano_manutencao_id)
       VALUES ($1, $2, 'aberto', 'p4', $3) RETURNING id`,
      ["Preventiva TESTE B2 " + sufixo, condo.id, plano2.id])).rows[0];
    lixo.ch.push(chPrevB.id);

    const chOutro2 = (await pool.query(
      `INSERT INTO chamados (titulo, condominio_id, status, prioridade, tecnico_id)
       VALUES ($1, $2, 'em_atendimento', 'p2', $3) RETURNING id`,
      ["Vazamento TESTE 2 " + sufixo, condo.id, tec ? tec.id : null])).rows[0];
    lixo.ch.push(chOutro2.id);

    const os2 = (await pool.query(
      `INSERT INTO ordens_servico
         (numero, chamado_id, condominio_id, tipos_servico, servico_realizado,
          assinatura_b64, recebido_nome, chegada_em)
       VALUES ($1, $2, $3, ARRAY['visita_tecnica','preventiva_mensal']::text[],
               'resolvido', 'data:image/png;base64,iVBORw0KGgo=', 'Zelador TESTE', NOW())
       RETURNING id`,
      ["OS-T2-" + sufixo, chOutro2.id, condo.id])).rows[0];
    lixo.os.push(os2.id);

    const res2 = await fetch(base + "/ordens-servico/" + os2.id + "/finalizar", {
      method: "POST", headers: H, body: JSON.stringify({}),
    });
    ok("a segunda O.S. também finaliza", res2.status === 200, "status " + res2.status);

    const dois = (await pool.query(
      `SELECT id, status FROM chamados WHERE id = ANY($1::int[])`,
      [[chPrevA.id, chPrevB.id]])).rows;
    ok("com DOIS chamados de preventiva abertos, nenhum é fechado",
      dois.every((c) => c.status === "aberto"),
      dois.map((c) => c.id + ":" + c.status).join(" "));
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of lixo.os) await pool.query("DELETE FROM ordens_servico WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.ch) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    }
    for (const id of lixo.pl) await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    server.close();
    await pool.end();
    const falhas = r.filter(([, c]) => !c).length;
    console.log("\n" + (r.length - falhas) + "/" + r.length + " checagens.");
    if (falhas) process.exitCode = 1;
  }
})();
