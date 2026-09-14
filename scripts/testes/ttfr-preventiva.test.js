// TTFR não corre para preventiva: o relógio da resposta precisa de uma pergunta.
//
//   node scripts/testes/ttfr-preventiva.test.js
//
// ⚠️ POR QUE ROTA DE VERDADE: a flag `sla_ttfr_estourado` nasce dentro de um
// CASE no SELECT de `GET /chamados`, e o CLAUDE.md registra que SQL montado
// assim só se prova exercitando o endpoint — `node --check` passa limpo com a
// condição errada, e a tela mostra um selo a mais sem erro nenhum.
//
// O que se afirma aqui:
//   1. chamado avulso sem resposta e fora do prazo ACENDE o TTFR;
//   2. o mesmo chamado, nascido de plano de manutenção, NÃO acende;
//   3. o TTR continua acendendo para os dois — "ninguém foi" segue sendo alerta.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
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
app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);

const r = [];
const ok = (nome, cond, extra) => {
  r.push([nome, cond]);
  console.log((cond ? "OK  " : "FALHOU  ") + nome + (extra ? "  — " + extra : ""));
};

(async () => {
  const server = app.listen(0);
  const lixo = { chamados: [], planos: [] };

  try {
    const base = "http://127.0.0.1:" + server.address().port;

    const condos = await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1");
    if (!condos.rows.length) throw new Error("preciso de 1 condomínio no banco de teste");
    const condoId = condos.rows[0].id;

    const gestor = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!gestor.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const H = {
      Authorization: "Bearer " + jwt.sign(
        { id: gestor.rows[0].id, role: gestor.rows[0].role },
        process.env.JWT_SECRET, { expiresIn: "10m" }
      ),
      "Content-Type": "application/json",
    };

    // O prazo que a régua promete para o P4. Lido do banco, nunca fixo aqui:
    // ele é editável em /admin/sla, e um número escrito à mão neste teste
    // passaria a medir a minha lembrança em vez da configuração.
    const sla = await pool.query(
      "SELECT ttfr_min, ttr_min FROM sla_definicoes WHERE prioridade = 'p4'"
    );
    const { ttfr_min, ttr_min } = sla.rows[0];

    const plano = await pool.query(
      `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em)
       VALUES ($1, 'Plano de teste TTFR', 30, CURRENT_DATE) RETURNING id`,
      [condoId]
    );
    lixo.planos.push(plano.rows[0].id);

    const criar = async (titulo) => {
      const res = await fetch(base + "/chamados", {
        method: "POST", headers: H,
        body: JSON.stringify({
          condominio_id: condoId, titulo, categoria: "manutencao",
          descricao: "fixture do teste de TTFR", prioridade: "p4",
        }),
      });
      const body = await res.json();
      const id = body.chamado ? body.chamado.id : body.id;
      lixo.chamados.push(id);
      return id;
    };

    const avulso = await criar("TTFR avulso (teste)");
    const preventiva = await criar("TTFR preventiva (teste)");

    // Envelhece os dois além do TTR (que é o maior dos dois prazos) e amarra um
    // deles ao plano. É o estado que o job deixa: aberto, sem resposta, vencido.
    // ⚠️ `primeira_resposta_em` é zerado de propósito — abrir pelo painel não
    // marca TTFR, mas um hook futuro poderia, e o teste ficaria verde à toa.
    await pool.query(
      `UPDATE chamados
          SET criado_em = NOW() - ($2 || ' minutes')::interval,
              primeira_resposta_em = NULL
        WHERE id = ANY($1)`,
      [[avulso, preventiva], String(ttr_min + 60)]
    );
    await pool.query("UPDATE chamados SET plano_manutencao_id = $2 WHERE id = $1",
      [preventiva, plano.rows[0].id]);

    const lista = await (await fetch(base + "/chamados", { headers: H })).json();
    const linhas = Array.isArray(lista) ? lista : lista.chamados;
    const achar = (id) => linhas.find((c) => c.id === id);

    const a = achar(avulso);
    const p = achar(preventiva);

    ok("os dois chamados vieram na lista", !!a && !!p);
    ok("avulso vencido ACENDE o TTFR", a.sla_ttfr_estourado === true,
       "ttfr_min=" + ttfr_min);
    ok("preventiva vencida NÃO acende o TTFR", p.sla_ttfr_estourado === false,
       "mesma idade, mesma prioridade, só muda a origem");
    ok("o TTR do avulso continua acendendo", a.sla_ttr_risco === true);
    ok("o TTR da preventiva TAMBÉM acende", p.sla_ttr_risco === true,
       "ninguém foi segue sendo alerta");
    ok("a preventiva é mesmo a que tem plano", p.plano_manutencao_id === plano.rows[0].id);

    // ⚠️ O corte é pela ORIGEM, não pela prioridade: os dois são P4.
    ok("os dois são P4 (o corte não foi pelo peso)",
       a.prioridade === "p4" && p.prioridade === "p4");

    // Responder não muda nada para a preventiva, mas apaga o TTFR do avulso —
    // é a prova de que a condição nova não substituiu a antiga, só somou.
    await pool.query("UPDATE chamados SET primeira_resposta_em = NOW() WHERE id = $1", [avulso]);
    const lista2 = await (await fetch(base + "/chamados", { headers: H })).json();
    const a2 = (Array.isArray(lista2) ? lista2 : lista2.chamados).find((c) => c.id === avulso);
    ok("respondido, o avulso apaga o TTFR", a2.sla_ttfr_estourado === false);
  } catch (e) {
    console.error("ERRO:", e.message);
    r.push(["sem exceção", false]);
  } finally {
    if (lixo.chamados.length) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1)", [lixo.chamados]);
      await pool.query("DELETE FROM chamados WHERE id = ANY($1)", [lixo.chamados]);
    }
    if (lixo.planos.length) {
      await pool.query("DELETE FROM planos_manutencao WHERE id = ANY($1)", [lixo.planos]);
    }
    server.close();
    await pool.end();
  }

  const passou = r.filter(([, c]) => c).length;
  console.log("\n" + passou + "/" + r.length + " passaram");
  process.exit(passou === r.length ? 0 : 1);
})();
