// Extravasamento pelo nível (migration 106).
//
//   node scripts/testes/extravasamento.test.js
//
// Duas partes:
//   1. A regra pura (`extravasor.service.js`) — tempo, histerese, lacuna, bomba.
//   2. As rotas de verdade contra o banco de TESTE: POST /telemetria abrindo,
//      escalando e fechando o alerta + o chamado [AUTO], e PATCH /reservatorios
//      com a altura do ladrão (o `$n` repetido no CASE — 42P08 só aparece
//      exercitando a rota, ver CLAUDE.md).
//
// ⚠️ ESCREVE NO BANCO DE TESTE num condomínio criado aqui (o chamado automático
// deduplica por condomínio+categoria e escalaria um chamado de verdade de outro
// prédio). Tudo é apagado no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { avaliarExtravasor } = require("../../src/services/extravasor.service");

const r = [];
const ok = (nome, cond) => r.push([nome, !!cond]);

// ── 1. Regra pura ─────────────────────────────────────────────────────────
{
  const agora = new Date("2026-11-24T12:00:00Z");
  const min = (n) => new Date(agora - n * 60000);
  const cfg = { minutos: 10, bombaMinutos: 3, toleranciaCm: 2, histereseCm: 3 };
  const base = { ladrao: 1.9, bombaLigada: false, desde: null, bombaDesde: null, lastSeen: min(0.2), agora, cfg };
  const av = (o) => avaliarExtravasor({ ...base, ...o });

  let x = av({ alturaAgua: 1.89 });
  ok("entra a 1 cm do ladrão e liga o relógio", x.noLadrao && +x.desde === +agora && !x.disparo);

  x = av({ alturaAgua: 1.80 });
  ok("boia fechada 10 cm abaixo não conta", !x.noLadrao && x.desde === null);

  x = av({ alturaAgua: 1.90, desde: min(9) });
  ok("9 min no ladrão ainda não dispara", x.noLadrao && !x.disparo);

  x = av({ alturaAgua: 1.90, desde: min(10) });
  ok("10 min no ladrão dispara 'nivel'", x.disparo === "nivel");

  x = av({ alturaAgua: 1.86, desde: min(5) });
  ok("faixa morta (1.86) mantém o relógio que já corria", x.noLadrao && +x.desde === +min(5));

  x = av({ alturaAgua: 1.86, desde: null });
  ok("faixa morta sem relógio não liga", !x.noLadrao && x.desde === null);

  x = av({ alturaAgua: 1.84, desde: min(30) });
  ok("abaixo da histerese (1.84) sai e zera", !x.noLadrao && x.desde === null && !x.disparo);

  x = av({ alturaAgua: 1.95, desde: min(1), bombaDesde: min(3), bombaLigada: true });
  ok("bomba ligada no ladrão por 3 min dispara 'bomba' antes da regra do nível", x.disparo === "bomba");

  x = av({ alturaAgua: 1.95, desde: min(20), bombaDesde: min(20), bombaLigada: false });
  ok("bomba desligou: zera o relógio da bomba, fica o do nível", x.bombaDesde === null && x.disparo === "nivel");

  x = av({ alturaAgua: 1.95, desde: min(30), lastSeen: min(10) });
  ok("lacuna de 10 min nas leituras reinicia o relógio", +x.desde === +agora && !x.disparo);

  x = av({ alturaAgua: 1.95, desde: min(30), lastSeen: null });
  ok("primeira leitura da vida (last_seen null) não herda relógio", +x.desde === +agora);

  x = av({ alturaAgua: 1.99, ladrao: null, desde: min(30) });
  ok("sem ladrão cadastrado: detecção desligada", x.desde === null && !x.disparo && !x.noLadrao);

  x = av({ alturaAgua: 1.95, desde: min(12), cfg: {} });
  ok("cfg vazio cai nos padrões (10 min)", x.disparo === "nivel");
}

// ── 2. Rotas contra o banco de teste ──────────────────────────────────────
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");

(async () => {
  const { alvo } = resolverDatabaseUrl();
  if (alvo !== "TESTE") {
    console.error("Recusando rodar a parte de banco: o alvo é " + alvo + ", não TESTE.");
    process.exit(1);
  }

  const app = express();
  app.use(express.json());
  app.use("/telemetria", require("../../src/routes/telemetria.routes").telemetriaRouter);
  app.use("/reservatorios", require("../../src/routes/reservatorios.routes").reservatoriosRouter);
  const server = app.listen(0);
  const baseUrl = "http://127.0.0.1:" + server.address().port;

  const device = "TESTE-EXTRAV-" + Date.now();
  const key = "k" + Date.now();
  let condoId = null, resId = null;

  // adc_zero 100, 1000 por metro → altura h vira adc 100 + h*1000.
  const adc = (h) => Math.round(100 + h * 1000);
  const ler = (h, rms) => fetch(baseUrl + "/telemetria", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Key": key },
    body: JSON.stringify({ device_id: device, adc_raw: adc(h), bomba_rms: rms }),
  }).then(async (x) => ({ status: x.status, body: await x.json() }));
  const estado = async () => (await pool.query(
    `SELECT extravasor_desde, extravasor_bomba_desde, altura_extravasor_m FROM reservatorios WHERE id = $1`, [resId])).rows[0];
  const alerta = async () => (await pool.query(
    `SELECT status, mensagem FROM alertas WHERE device_id = $1 AND tipo = 'extravasamento' ORDER BY id DESC LIMIT 1`, [device])).rows[0];
  const chamado = async () => (await pool.query(
    `SELECT id, prioridade, categoria, titulo FROM chamados WHERE condominio_id = $1 AND categoria = 'vazamento' ORDER BY id DESC LIMIT 1`, [condoId])).rows[0];
  // abrirChamadoAuto roda sem await na rota (fire-and-forget).
  const espera = () => new Promise((s) => setTimeout(s, 600));

  try {
    condoId = (await pool.query(
      `INSERT INTO condominios (nome) VALUES ('TESTE extravasamento') RETURNING id`)).rows[0].id;
    resId = (await pool.query(
      `INSERT INTO reservatorios (condominio_id, nome, tipo, device_id, device_key,
                                  altura_total_m, adc_zero, adc_por_metro, limiar_bomba)
       VALUES ($1, 'Caixa superior teste', 'superior', $2, $3, 2, 100, 1000, 50) RETURNING id`,
      [condoId, device, key])).rows[0].id;

    // PATCH com a altura do ladrão — o CASE com $n repetido.
    const tok = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const patch = (body) => fetch(baseUrl + "/reservatorios/" + resId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify(body),
    }).then(async (x) => ({ status: x.status, body: await x.json() }));

    let p = await patch({ altura_extravasor_m: 1.9 });
    ok("PATCH grava altura_extravasor_m (sem 42P08)", p.status === 200 && Number(p.body.altura_extravasor_m) === 1.9);
    p = await patch({ altura_extravasor_m: -1 });
    ok("PATCH recusa altura negativa", p.status === 400);

    // 1ª leitura no ladrão, bomba parada: liga o relógio, sem alerta.
    let l = await ler(1.9, 0);
    let e = await estado();
    ok("POST /telemetria 200 no ladrão", l.status === 200);
    ok("relógio do nível ligado", e.extravasor_desde != null && e.extravasor_bomba_desde == null);
    ok("ainda sem alerta", !(await alerta()));

    // PATCH com o MESMO valor não zera o relógio; com outro, zera.
    await patch({ altura_extravasor_m: 1.9, nome: "Caixa superior teste" });
    ok("PATCH com a mesma altura mantém o relógio", (await estado()).extravasor_desde != null);

    // Simula 11 min no ladrão.
    await pool.query(`UPDATE reservatorios SET extravasor_desde = NOW() - interval '11 minutes', last_seen = NOW() WHERE id = $1`, [resId]);
    l = await ler(1.91, 0);
    await espera();
    let a = await alerta();
    let c = await chamado();
    ok("alerta 'extravasamento' aberto pela regra do nível", a && a.status === "aberto" && /^Extravasamento/.test(a.mensagem));
    ok("chamado [AUTO] vazamento P3 aberto", c && c.prioridade === "p3" && /^\[AUTO\]/.test(c.titulo));

    // Bomba ligada no ladrão há 3,5 min → escala para P2.
    await pool.query(`UPDATE reservatorios SET extravasor_bomba_desde = NOW() - interval '210 seconds', last_seen = NOW() WHERE id = $1`, [resId]);
    l = await ler(1.92, 200);
    await espera();
    a = await alerta();
    const c2 = await chamado();
    ok("mensagem passa a citar a bomba", a && /bomba ligada/.test(a.mensagem));
    ok("mesmo chamado, escalado para P2", c2 && c2.id === c.id && c2.prioridade === "p2");

    // Desce para 1,80 m: sai do ladrão, fecha o alerta e zera os relógios.
    l = await ler(1.8, 0);
    e = await estado();
    ok("alerta resolvido ao descer", (await alerta()).status === "resolvido");
    ok("relógios zerados", e.extravasor_desde == null && e.extravasor_bomba_desde == null);

    // Lacuna: device sumiu 10 min com relógio velho → recomeça do zero.
    await pool.query(`UPDATE reservatorios SET extravasor_desde = NOW() - interval '30 minutes', last_seen = NOW() - interval '10 minutes' WHERE id = $1`, [resId]);
    l = await ler(1.95, 0);
    e = await estado();
    ok("depois de lacuna, relógio recomeça e não dispara",
      Date.now() - new Date(e.extravasor_desde) < 60000 && (await alerta()).status === "resolvido");

    // Trocar a altura do ladrão zera o relógio.
    p = await patch({ altura_extravasor_m: 1.95 });
    e = await estado();
    ok("PATCH com altura nova zera o relógio", p.status === 200 && e.extravasor_desde == null);

    // Apagar o ladrão desliga a detecção.
    p = await patch({ altura_extravasor_m: null });
    l = await ler(1.99, 0);
    e = await estado();
    ok("sem ladrão: nada liga", p.status === 200 && e.altura_extravasor_m == null && e.extravasor_desde == null);
  } catch (err) {
    ok("sem exceção: " + err.message, false);
  } finally {
    await pool.query(`DELETE FROM alertas WHERE device_id = $1`, [device]).catch(() => {});
    await pool.query(`DELETE FROM leituras WHERE device_id = $1`, [device]).catch(() => {});
    if (condoId) {
      await pool.query(`DELETE FROM chamados WHERE condominio_id = $1`, [condoId]).catch(() => {});
      await pool.query(`DELETE FROM reservatorios WHERE condominio_id = $1`, [condoId]).catch(() => {});
      await pool.query(`DELETE FROM condominios WHERE id = $1`, [condoId]).catch((e) => console.error("limpeza condomínio:", e.message));
    }
    server.close();
    await pool.end();
  }

  let falhas = 0;
  for (const [nome, cond] of r) {
    console.log((cond ? "✓ " : "✗ ") + nome);
    if (!cond) falhas++;
  }
  console.log(`\n${r.length - falhas}/${r.length}`);
  process.exit(falhas ? 1 : 0);
})();
