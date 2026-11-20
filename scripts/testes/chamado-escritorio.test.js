// O escritório e o turno conversando pelo chamado (migration 098, 20/11/2026).
//
//   node scripts/testes/chamado-escritorio.test.js
//
// Cobre: "Pedido do escritório" (PUT/DELETE /chamados/:id/escritorio, só
// gestão), "Precisa do escritório" (PUT/DELETE /chamados/:id/pede-escritorio,
// o turno marca), o histórico das duas, o 409 em chamado fechado, e a fila do
// turno (GET /operador/fila) com as marcas e a agenda de hoje (compromisso
// comum entra, so_admin não, apagado não).
//
// ⚠️ ROTA DE VERDADE (CLAUDE.md: query com parâmetro repetido só se testa
// exercitando a rota). ⚠️ ESCREVE NO BANCO DE TESTE e limpa no finally.
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
app.use("/chamados", require("../../src/routes/chamados.routes").chamadosRouter);
app.use("/operador", require("../../src/routes/operador.routes").operadorRouter);

let ok = 0, falhou = 0;
const t = (nome, cond, extra) => {
  if (cond) { ok++; console.log("  ✓", nome); }
  else { falhou++; console.log("  ✗", nome, extra !== undefined ? JSON.stringify(extra) : ""); }
};

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = { chamados: [], compromissos: [] };
  try {
    const condoId = (await pool.query("SELECT id FROM condominios WHERE ativo ORDER BY id LIMIT 1")).rows[0].id;
    const g = (await pool.query("SELECT id, nome, role FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0];
    const tk = role => jwt.sign({ id: g.id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = role => ({ Authorization: "Bearer " + tk(role), "Content-Type": "application/json" });
    const req = async (method, url, role, body) => {
      const r = await fetch(base + url, { method, headers: H(role), body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = await r.json(); } catch {}
      return [r.status, j];
    };

    const novo = async (status = "aberto") => {
      const r = await pool.query(
        `INSERT INTO chamados (condominio_id, titulo, descricao, categoria, prioridade, status)
         VALUES ($1, 'TESTE-098 escritorio', 'teste', 'outro', 'p3', $2) RETURNING id`, [condoId, status]);
      lixo.chamados.push(r.rows[0].id);
      return r.rows[0].id;
    };
    const id = await novo();
    const fechado = await novo("fechado");

    console.log("Pedido do escritório");
    let [s, j] = await req("PUT", `/chamados/${id}/escritorio`, "operador", { motivo: "x" });
    t("operador não marca o pedido do escritório: 403", s === 403, s);
    [s, j] = await req("PUT", `/chamados/${id}/escritorio`, "admin", { motivo: "   " });
    t("sem motivo: 400", s === 400, s);
    [s, j] = await req("PUT", `/chamados/${id}/escritorio`, "admin", { motivo: "x".repeat(301) });
    t("motivo de 301 caracteres: 400", s === 400, s);
    [s, j] = await req("PUT", `/chamados/${id}/escritorio`, "gerente", { motivo: "Cliente reclamou, ir hoje" });
    t("gerente marca: 200", s === 200, [s, j]);
    [s, j] = await req("PUT", `/chamados/${fechado}/escritorio`, "admin", { motivo: "x" });
    t("chamado fechado: 409", s === 409, s);
    [s, j] = await req("GET", `/chamados/${id}`, "admin");
    t("o detalhe traz o motivo e quem marcou",
      j && j.escritorio_motivo === "Cliente reclamou, ir hoje" && j.escritorio_por_nome === g.nome && j.escritorio_em, j && j.escritorio_motivo);

    console.log("Precisa do escritório");
    [s, j] = await req("PUT", `/chamados/${id}/pede-escritorio`, "operador", { motivo: "Síndico quer orçamento" });
    t("operador marca: 200", s === 200, [s, j]);
    [s, j] = await req("GET", `/chamados`, "admin");
    const naLista = Array.isArray(j) && j.find(c => c.id === id);
    t("a lista do admin traz as duas marcas (o Hoje lê daqui)",
      naLista && naLista.pede_escritorio_motivo === "Síndico quer orçamento" && naLista.pede_escritorio_em
        && naLista.escritorio_motivo === "Cliente reclamou, ir hoje" && naLista.pede_escritorio_por_nome === g.nome, naLista);

    console.log("A agenda de hoje");
    const agora = new Date();
    const ins = async (titulo, soAdmin, apagado) => {
      const r = await pool.query(
        `INSERT INTO compromissos (titulo, tipo, inicio, so_admin, condominio_id, responsavel_id, apagado_em)
         VALUES ($1, 'visita', $2, $3, $4, $5, $6) RETURNING id`,
        [titulo, agora.toISOString(), soAdmin, condoId, g.id, apagado ? agora.toISOString() : null]);
      lixo.compromissos.push(r.rows[0].id);
    };
    await ins("TESTE-098 visita do turno", false, false);
    await ins("TESTE-098 reunião interna", true, false);
    await ins("TESTE-098 apagado", false, true);

    [s, j] = await req("GET", `/operador/fila`, "operador");
    t("fila do turno: 200", s === 200, s);
    const item = j && j.fila && j.fila.find(c => c.id === id);
    t("o item leva o pedido do escritório",
      item && item.escritorio && item.escritorio.motivo === "Cliente reclamou, ir hoje" && item.escritorio.por === g.nome, item && item.escritorio);
    t("o item leva o precisa do escritório",
      item && item.pede_escritorio && item.pede_escritorio.motivo === "Síndico quer orçamento", item && item.pede_escritorio);
    const ag = (j && j.agenda_hoje) || [];
    t("agenda_hoje é lista", Array.isArray(j && j.agenda_hoje), j && j.agenda_hoje);
    const visita = ag.find(x => x.titulo === "TESTE-098 visita do turno");
    t("o compromisso de hoje entra, com prédio e responsável", visita && visita.condominio && visita.condominio.id === condoId && visita.quem === g.nome, visita);
    t("o que é só do admin não entra", !ag.some(x => x.titulo === "TESTE-098 reunião interna"));
    t("o apagado não entra", !ag.some(x => x.titulo === "TESTE-098 apagado"));

    console.log("Desfazer e histórico");
    [s, j] = await req("DELETE", `/chamados/${id}/pede-escritorio`, "admin");
    t("o escritório dá como resolvido: 200", s === 200, s);
    [s, j] = await req("DELETE", `/chamados/${id}/pede-escritorio`, "admin");
    t("resolver de novo não erra (ja_estava)", s === 200 && j && j.ja_estava, j);
    [s, j] = await req("DELETE", `/chamados/${id}/escritorio`, "operador");
    t("operador não retira o pedido do escritório: 403", s === 403, s);
    [s, j] = await req("DELETE", `/chamados/${id}/escritorio`, "admin");
    t("admin retira o pedido: 200", s === 200, s);
    const d = (await pool.query(
      "SELECT escritorio_motivo, escritorio_por, escritorio_em, pede_escritorio_motivo, pede_escritorio_em FROM chamados WHERE id = $1", [id])).rows[0];
    t("as colunas voltam a nulo", Object.values(d).every(v => v == null), d);
    const h = (await pool.query(
      "SELECT campo_alterado, valor_anterior, valor_novo FROM historico_chamados WHERE chamado_id = $1 ORDER BY id", [id])).rows;
    const campos = h.map(x => `${x.campo_alterado}:${x.valor_novo ? "liga" : "desliga"}`);
    t("o histórico guarda as quatro mudanças, na ordem",
      JSON.stringify(campos) === JSON.stringify(["pedido_escritorio:liga", "precisa_escritorio:liga", "precisa_escritorio:desliga", "pedido_escritorio:desliga"]), campos);
    t("ao desmarcar, o motivo fica no valor_anterior", h[2] && h[2].valor_anterior === "Síndico quer orçamento", h[2]);
  } catch (e) {
    falhou++;
    console.error(e);
  } finally {
    if (lixo.compromissos.length) await pool.query("DELETE FROM compromissos WHERE id = ANY($1::int[])", [lixo.compromissos]);
    if (lixo.chamados.length) {
      await pool.query("DELETE FROM historico_chamados WHERE chamado_id = ANY($1::int[])", [lixo.chamados]);
      await pool.query("DELETE FROM chamados WHERE id = ANY($1::int[])", [lixo.chamados]);
    }
    server.close();
    await pool.end();
    console.log(`\n${ok} ok, ${falhou} falhou`);
    process.exit(falhou ? 1 : 0);
  }
})();
