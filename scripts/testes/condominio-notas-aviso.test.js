// Teste da página do prédio, etapa 8 do redesenho (20/11/2026, migration 095):
// as notas e os avisos do prédio, e a tira dos 12 meses da preventiva. Roda com
// `node scripts/testes/condominio-notas-aviso.test.js`.
//
// O que prova:
//   NOTAS  — o escritório inteiro (operador inclusive) escreve e lê; vazia e
//            longa demais → 400; prédio inexistente → 404; operador NÃO apaga
//            a nota de outro (403), o autor e a gestão apagam.
//   AVISO  — só a gestão manda (operador 403); assunto, mensagem e lista são
//            obrigatórios; um e-mail por prédio para o e-mail do cadastro;
//            prédio sem e-mail volta em sem_email e não trava o lote; falha do
//            provedor volta em falhas, nomeada; cada envio vira uma linha
//            'aviso' no histórico; aviso NÃO se apaga (409).
//   MESES  — feita (chamado fechado na competência, baixa à mão), andamento
//            (chamado aberto), nao_feita (cancelado), antes (antes do plano),
//            sem (nada); 12 meses, o corrente por último; operador 403.
//
// O provedor de e-mail é DUBLÊ (nada sai): o módulo "resend" é trocado antes
// do require do router. ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do
// `.env`) e limpa o que criou no `finally`.
require("dotenv").config({ quiet: true });
const Module = require("module");

const enviados = [];
let falharPara = null;
const _load = Module._load;
Module._load = function (pedido) {
  if (pedido === "resend") {
    return { Resend: class {
      constructor() {
        this.emails = { send: async (p) => {
          if (falharPara && p.to.includes(falharPara)) return { data: null, error: { name: "validation_error", message: "endereço recusado" } };
          enviados.push(p);
          return { data: { id: "teste" }, error: null };
        } };
      }
    } };
  }
  return _load.apply(this, arguments);
};
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "teste-dubl";

const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
if (resolverDatabaseUrl().alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido não é o de TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/admin", require("../../src/routes/admin.routes").adminRouter);
app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, !!cond]);

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const lixo = { condos: [], planos: [], chamados: [] };

  try {
    const admin = (await pool.query("SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0];
    const token = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { admin: token(admin.id, "admin"), operador: token(admin.id + 900000, "operador"), operadorAutor: token(admin.id, "operador") };
    const req = async (quem, metodo, url, body) => {
      const resp = await fetch(base + url, { method: metodo, headers: { Authorization: "Bearer " + H[quem], "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { st: resp.status, j: await resp.json().catch(() => ({})) };
    };
    const suf = String(Date.now()).slice(-8);
    const novoCondo = async (nome, email) => {
      const id = (await pool.query("INSERT INTO condominios (nome, ativo, cidade, email) VALUES ($1, TRUE, 'São Paulo', $2) RETURNING id", [`${nome} ${suf}`, email])).rows[0].id;
      lixo.condos.push(id);
      return id;
    };
    const cA = await novoCondo("Notas A", "Sindico@Teste.local, zelador@teste.local");
    const cB = await novoCondo("Notas B", null);
    const cC = await novoCondo("Notas C", "falha@teste.local");

    // ── NOTAS ─────────────────────────────────────────────────────────
    ok("nota vazia → 400", (await req("admin", "POST", `/admin/condominios/${cA}/notas`, { texto: "   " })).st === 400);
    ok("nota longa demais → 400", (await req("admin", "POST", `/admin/condominios/${cA}/notas`, { texto: "x".repeat(4001) })).st === 400);
    ok("prédio inexistente → 404", (await req("admin", "POST", `/admin/condominios/999999999/notas`, { texto: "oi" })).st === 404);
    const n1 = await req("admin", "POST", `/admin/condominios/${cA}/notas`, { texto: "Chave da casa de bombas com o zelador.\nLigar antes." });
    ok("admin escreve nota → 201, tipo nota, autor", n1.st === 201 && n1.j.tipo === "nota" && n1.j.autor_id === admin.id && n1.j.texto.includes("\n"));
    const n2 = await req("operadorAutor", "POST", `/admin/condominios/${cA}/notas`, { texto: "Síndico atende só à tarde." });
    ok("operador também escreve → 201", n2.st === 201);
    const lista = await req("operador", "GET", `/admin/condominios/${cA}/notas`);
    ok("operador lê as notas, a mais nova primeiro", lista.st === 200 && lista.j.length === 2 && lista.j[0].id === n2.j.id);
    ok("operador NÃO apaga nota de outro → 403", (await req("operador", "DELETE", `/admin/condominios/notas/${n1.j.id}`)).st === 403);
    ok("o autor (mesmo operador) apaga a dele", (await req("operadorAutor", "DELETE", `/admin/condominios/notas/${n2.j.id}`)).st === 200);
    ok("a gestão apaga a de qualquer um", (await req("admin", "DELETE", `/admin/condominios/notas/${n1.j.id}`)).st === 200);
    ok("apagar de novo → 404", (await req("admin", "DELETE", `/admin/condominios/notas/${n1.j.id}`)).st === 404);

    // ── AVISO ─────────────────────────────────────────────────────────
    const corpo = { condominio_ids: [cA, cB, cC], assunto: "Manutenção na rede", mensagem: "Prezado(a),\n\nAmanhã cedo.\nObrigado." };
    ok("operador NÃO manda aviso → 403", (await req("operador", "POST", "/admin/condominios/aviso", corpo)).st === 403);
    ok("sem prédio → 400", (await req("admin", "POST", "/admin/condominios/aviso", { ...corpo, condominio_ids: [] })).st === 400);
    ok("sem assunto → 400", (await req("admin", "POST", "/admin/condominios/aviso", { ...corpo, assunto: " " })).st === 400);
    ok("sem mensagem → 400", (await req("admin", "POST", "/admin/condominios/aviso", { ...corpo, mensagem: "" })).st === 400);
    ok("prédio inexistente na lista → 400", (await req("admin", "POST", "/admin/condominios/aviso", { ...corpo, condominio_ids: [cA, 999999999] })).st === 400);
    falharPara = "falha@teste.local";
    const av = await req("admin", "POST", "/admin/condominios/aviso", corpo);
    falharPara = null;
    ok("aviso → 200", av.st === 200);
    ok("A recebeu, nos dois e-mails do cadastro (minúsculos)", av.j.enviados?.length === 1 && av.j.enviados[0].condominio_id === cA && av.j.enviados[0].para === "sindico@teste.local, zelador@teste.local");
    ok("B (sem e-mail) volta em sem_email e não trava", av.j.sem_email?.length === 1 && av.j.sem_email[0].condominio_id === cB);
    ok("C (provedor recusou) volta em falhas, nomeado", av.j.falhas?.length === 1 && av.j.falhas[0].condominio_id === cC && /recusado/.test(av.j.falhas[0].erro));
    const p = enviados[enviados.length - 1];
    ok("o e-mail tem o assunto e o nome do prédio", p && p.subject === "Manutenção na rede — General Bombas" && p.html.includes(`Notas A ${suf}`) && p.text.includes("Amanhã cedo."));
    ok("o parágrafo vira <p> e a quebra vira <br />", p && /<p[^>]*>Prezado\(a\),<\/p>/.test(p.html) && p.html.includes("Amanhã cedo.<br />Obrigado."));
    const hist = await req("admin", "GET", `/admin/condominios/${cA}/notas`);
    const reg = (hist.j || []).find(n => n.tipo === "aviso");
    ok("o envio virou 'aviso' no histórico de A, com assunto e destino", reg && reg.assunto === "Manutenção na rede" && reg.enviado_para === "sindico@teste.local, zelador@teste.local");
    ok("B e C não ganharam registro", (await req("admin", "GET", `/admin/condominios/${cB}/notas`)).j.length === 0 && (await req("admin", "GET", `/admin/condominios/${cC}/notas`)).j.length === 0);
    ok("aviso não se apaga → 409", reg && (await req("admin", "DELETE", `/admin/condominios/notas/${reg.id}`)).st === 409);

    // ── MESES ─────────────────────────────────────────────────────────
    const plano = (await pool.query(
      `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo, criado_em)
       VALUES ($1, 'Preventiva', 30, CURRENT_DATE, TRUE, date_trunc('month', CURRENT_DATE) - INTERVAL '5 months') RETURNING id`, [cA])).rows[0].id;
    lixo.planos.push(plano);
    const comp = n => `(date_trunc('month', CURRENT_DATE) - INTERVAL '${n} months')::date`;
    const chamado = async (n, status) => {
      const id = (await pool.query(
        `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, competencia, fechado_em)
         VALUES ($1, 'Preventiva teste', 'teste', 'p4', 'manutencao', $2::varchar, $3, ${comp(n)}, CASE WHEN $2::varchar = 'fechado' THEN ${comp(n)} + INTERVAL '10 days' END) RETURNING id`,
        [cA, status, plano])).rows[0].id;
      lixo.chamados.push(id);
    };
    await chamado(4, "fechado");      // feita
    await chamado(3, "cancelado");    // não realizada
    await chamado(0, "aberto");       // em andamento (mês corrente)
    await pool.query(`INSERT INTO planos_baixas_manuais (plano_id, competencia, marcada_em) VALUES ($1, ${comp(1)}, now())`, [plano]);
    const m = await req("admin", "GET", `/planos-manutencao/meses?condominio_id=${cA}`);
    const est = m.j.planos?.[plano] || [];
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    ok("12 meses, o corrente por último", m.st === 200 && m.j.meses?.length === 12 && m.j.meses[11] === mesAtual && est.length === 12);
    ok("antes da criação do plano → antes", est.slice(0, 6).every(e => e === "antes"));
    ok("chamado fechado na competência → feita", est[7] === "feita");
    ok("chamado cancelado → nao_feita", est[8] === "nao_feita");
    ok("mês sem nada → sem (não é falta)", est[9] === "sem" && est[6] === "sem");
    ok("baixa à mão → feita", est[10] === "feita");
    ok("chamado aberto no mês corrente → andamento", est[11] === "andamento");
    ok("operador NÃO lê os meses → 403", (await req("operador", "GET", `/planos-manutencao/meses?condominio_id=${cA}`)).st === 403);
    ok("condominio_id inválido → 400", (await req("admin", "GET", "/planos-manutencao/meses?condominio_id=abc")).st === 400);
  } catch (e) {
    ok("sem exceção: " + e.message, false);
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id = $1", [id]).catch(() => {});
    for (const id of lixo.planos) {
      await pool.query("DELETE FROM planos_baixas_manuais WHERE plano_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM planos_manutencao WHERE id = $1", [id]).catch(() => {});
    }
    for (const id of lixo.condos) await pool.query("DELETE FROM condominios WHERE id = $1", [id]).catch(() => {});
    server.close();
    await pool.end();
  }

  for (const [nome, c] of r) console.log(`${c ? "✓" : "✗"} ${nome}`);
  const passou = r.filter(x => x[1]).length;
  console.log(`\n${passou}/${r.length} passaram`);
  process.exit(passou === r.length ? 0 : 1);
})();
