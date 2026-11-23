// Teste do orçamento que vence (migration 103,
// docs/modulos/orcamentos-vencimento.md): arquivar, desarquivar pelas rotas,
// lembrete 5 dias antes e apagar depois do prazo.
// Roda com `node scripts/testes/orcamento-vencimento.test.js`.
//
// ⚠️ ROTA DE VERDADE para o que grava: o desarquivar usa o MESMO parâmetro da
// validade duas vezes (valor de coluna e comparação), que é o formato do
// 42P08 do CLAUDE.md. Só sobe um Express e bate no endpoint que pega isso.
//
// ⚠️ NENHUM E-MAIL SAI: o envio do orçamento e o do lembrete são dublês.
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa o que criou no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error(`Recusando rodar: o banco resolvido é ${alvo}, não TESTE.`);
  process.exit(1);
}

// Dublê do envio do orçamento ANTES de carregar as rotas (elas desestruturam
// o require). E uma chave falsa: a rota recusa sem RESEND_API_KEY.
const email = require("../../src/services/email");
const enviadosOrc = [];
email.sendOrcamentoCliente = async (d) => { enviadosOrc.push(d); };
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_teste_falsa";
delete process.env.ORCAMENTO_LEMBRETE_EMAIL; // o "desligado" é o padrão

const venc = require("../../src/services/orcamento-vencimento.service");

const app = express();
app.use(express.json());
app.use("/admin", require("../../src/routes/admin.routes").adminRouter);

const r = [];
const ok = (nome, cond, extra) => { r.push([nome, !!cond]); if (!cond && extra !== undefined) console.log("   ↳", extra); };
const hoje = venc._t._hojeSP();
const dia = (n) => new Date(Date.parse(hoje + "T12:00:00Z") + n * 86400e3).toISOString().slice(0, 10);

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const criados = [], osCriadas = [], chamadosCriados = [];
  let userCliId = null;

  try {
    const u = (await pool.query("SELECT id, role, email FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1")).rows[0];
    if (!u) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const token = jwt.sign({ id: u.id, role: u.role, email: u.email }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const condoId = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0].id;
    const suf = String(Date.now()).slice(-7);

    const novo = async (campos) => {
      const c = { status: "enviado", enviado_para: "sindico-teste@example.com, adm-teste@example.com", enviado_dias: -10, ...campos };
      const id = (await pool.query(
        `INSERT INTO orcamentos (numero, condominio_id, status, valido_ate, enviado_em, enviado_para, os_id, criado_por)
         VALUES ($1, $2, $3, $4::date, NOW() + make_interval(days => $5::int), $6, $7, $8) RETURNING id`,
        [`T-${suf}-${criados.length}`, condoId, c.status, c.valido_ate, c.enviado_dias, c.enviado_para, c.os_id || null, u.id])).rows[0].id;
      criados.push(id);
      return id;
    };
    const linha = async (id) => (await pool.query(`SELECT * FROM orcamentos WHERE id = $1`, [id])).rows[0];

    // ── 1. Arquivar ─────────────────────────────────────────────────────────
    const vencido = await novo({ valido_ate: dia(-3) });
    const emDia = await novo({ valido_ate: dia(10) });
    const respondido = await novo({ valido_ate: dia(-3) });
    await pool.query(`UPDATE orcamentos SET respondido_em = NOW() WHERE id = $1`, [respondido]);
    const rascunho = await novo({ valido_ate: dia(-3), status: "rascunho" });
    const amostra = [vencido, emDia, respondido, rascunho];

    const conta = await venc.arquivarVencidos({ gravar: false, soIds: amostra });
    ok("a contagem (sem gravar) acha só o vencido sem resposta", conta.vencidos === 1 && conta.ids[0] === vencido, conta);
    ok("a contagem não grava", (await linha(vencido)).arquivado_em === null);
    const arq = await venc.arquivarVencidos({ soIds: amostra });
    ok("arquiva o vencido sem resposta", arq.arquivados === 1 && (await linha(vencido)).arquivado_em !== null, arq);
    ok("não arquiva o em dia, o respondido nem o rascunho",
      [(await linha(emDia)), (await linha(respondido)), (await linha(rascunho))].every(x => x.arquivado_em === null));
    ok("o status continua 'enviado'", (await linha(vencido)).status === "enviado");
    ok("arquivar de novo não faz nada", (await venc.arquivarVencidos({ soIds: amostra })).arquivados === 0);

    const lista = await fetch(`${base}/admin/orcamentos/avulsos?limit=500`, { headers: H });
    const corpo = await lista.json();
    const naLista = Array.isArray(corpo) ? corpo.find(x => x.id === vencido) : null;
    ok("GET /admin/orcamentos/avulsos responde 200", lista.status === 200, lista.status);
    ok("a lista traz arquivado_em e lembrete_em", naLista && naLista.arquivado_em && "lembrete_em" in naLista, naLista);

    // ── 2. Desarquivar pelas rotas que gravam ───────────────────────────────
    let p = await fetch(`${base}/admin/orcamentos/avulsos/${vencido}`, { method: "PATCH", headers: H, body: JSON.stringify({ valido_ate: dia(-1) }) });
    ok("PATCH avulso com validade ainda passada: 200 (o 42P08 apareceria aqui)", p.status === 200, await p.text());
    ok("…e continua arquivado", (await linha(vencido)).arquivado_em !== null);
    p = await fetch(`${base}/admin/orcamentos/avulsos/${vencido}`, { method: "PATCH", headers: H, body: JSON.stringify({ valido_ate: dia(15) }) });
    ok("PATCH avulso com validade nova: 200", p.status === 200, await p.text());
    ok("…desarquiva", (await linha(vencido)).arquivado_em === null);
    await pool.query(`UPDATE orcamentos SET valido_ate = $2::date, arquivado_em = NOW() WHERE id = $1`, [vencido, dia(-2)]);
    p = await fetch(`${base}/admin/orcamentos/avulsos/${vencido}`, { method: "PATCH", headers: H, body: JSON.stringify({ valido_ate: "" }) });
    ok("PATCH avulso tirando a validade: 200 e desarquiva", p.status === 200 && (await linha(vencido)).arquivado_em === null);
    p = await fetch(`${base}/admin/orcamentos/avulsos/${emDia}`, { method: "PATCH", headers: H, body: JSON.stringify({ constatacao: "sem mexer na validade" }) });
    ok("PATCH avulso sem validade no corpo continua funcionando", p.status === 200, await p.text());

    // A rota do orçamento de O.S. (PATCH /admin/orcamentos/:os_id, acao salvar).
    const osId = (await pool.query(
      `INSERT INTO ordens_servico (numero, condominio_id, orcamento_necessario) VALUES ($1, $2, TRUE) RETURNING id`,
      [`OS-V-${suf}`, condoId])).rows[0].id;
    osCriadas.push(osId);
    const daOs = await novo({ valido_ate: dia(-5), os_id: osId });
    await venc.arquivarVencidos({ soIds: [daOs] });
    p = await fetch(`${base}/admin/orcamentos/${osId}`, { method: "PATCH", headers: H, body: JSON.stringify({ acao: "salvar", valido_ate: dia(20) }) });
    ok("PATCH /admin/orcamentos/:os_id (salvar) com validade nova: 200", p.status === 200, await p.text());
    ok("…desarquiva", (await linha(daOs)).arquivado_em === null);

    // Reenviar (dublê do e-mail, modo painel: precisa de um usuário cliente).
    userCliId = (await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, condominio_id) VALUES ('Cliente teste venc', $1, 'x', 'cliente', $2) RETURNING id`,
      [`cli-venc-${suf}@example.com`, condoId])).rows[0].id;
    await pool.query(`UPDATE orcamentos SET valido_ate = $2::date, arquivado_em = NOW() WHERE id = $1`, [vencido, dia(-2)]);
    p = await fetch(`${base}/admin/orcamentos/avulsos/${vencido}/enviar-email`, { method: "POST", headers: H, body: JSON.stringify({ modo: "painel" }) });
    ok("reenviar documento vencido: 200", p.status === 200, await p.text());
    ok("…não desarquiva (validade passada)", (await linha(vencido)).arquivado_em !== null);
    await pool.query(`UPDATE orcamentos SET valido_ate = $2::date WHERE id = $1`, [vencido, dia(30)]);
    p = await fetch(`${base}/admin/orcamentos/avulsos/${vencido}/enviar-email`, { method: "POST", headers: H, body: JSON.stringify({ modo: "painel" }) });
    ok("reenviar com validade em dia: 200 e desarquiva", p.status === 200 && (await linha(vencido)).arquivado_em === null);
    ok("o envio passou pelo dublê (nenhum e-mail real)", enviadosOrc.length === 2);

    // ── 3. Lembrete ─────────────────────────────────────────────────────────
    const chamadas = [];
    const dubleOk = async (d) => { chamadas.push(d); return "id-falso"; };
    const lemb = await novo({ valido_ate: dia(5), enviado_dias: -10 });
    const recente = await novo({ valido_ate: dia(4), enviado_dias: -1 });
    const longe = await novo({ valido_ate: dia(6), enviado_dias: -10 });
    const semPara = await novo({ valido_ate: dia(3), enviado_dias: -10, enviado_para: null });
    const falha = await novo({ valido_ate: dia(2), enviado_dias: -10 });
    const amL = [lemb, recente, longe, semPara, falha];

    const desl = await venc.enviarLembretes({ soIds: amL, enviar: dubleOk });
    ok("sem ORCAMENTO_LEMBRETE_EMAIL=1 não manda nada", desl.desligado && chamadas.length === 0, desl);

    const dub = async (d) => { if (d.numero === `T-${suf}-${criados.indexOf(falha)}`) throw new Error("falha de teste"); return dubleOk(d); };
    const l1 = await venc.enviarLembretes({ soIds: amL, enviar: dub, forcar: true, dias: 5 });
    ok("manda o lembrete do que vence em 5 dias", chamadas.some(c => c.numero === `T-${suf}-${criados.indexOf(lemb)}`), chamadas.map(c => c.numero));
    const c1 = chamadas.find(c => c.numero === `T-${suf}-${criados.indexOf(lemb)}`);
    ok("…para os mesmos e-mails do envio", c1 && c1.to.join(",") === "sindico-teste@example.com,adm-teste@example.com", c1 && c1.to);
    ok("…com dias = 5 e a validade certa", c1 && c1.dias === 5 && c1.validoAte === dia(5), c1);
    ok("não manda o enviado há menos de 2 dias", !chamadas.some(c => c.numero === `T-${suf}-${criados.indexOf(recente)}`));
    ok("não manda o que vence em 6 dias", !chamadas.some(c => c.numero === `T-${suf}-${criados.indexOf(longe)}`));
    ok("conta 1 enviado, 1 falha, 1 sem e-mail", l1.enviados === 1 && l1.falhas === 1 && l1.sem_email === 1, l1);
    const st = async (id) => (await pool.query(`SELECT status, tentativas, destinatarios FROM orcamento_lembretes WHERE orcamento_id = $1`, [id])).rows;
    ok("o lembrete fica 'enviado' na fila", (await st(lemb))[0]?.status === "enviado");
    ok("o sem destinatário fica 'sem_email'", (await st(semPara))[0]?.status === "sem_email");
    ok("a falha fica 'erro'", (await st(falha))[0]?.status === "erro");

    const antes = chamadas.length;
    await venc.enviarLembretes({ soIds: amL, enviar: dub, forcar: true, dias: 5 });
    await venc.enviarLembretes({ soIds: amL, enviar: dub, forcar: true, dias: 5 });
    await venc.enviarLembretes({ soIds: amL, enviar: dub, forcar: true, dias: 5 });
    ok("o mesmo lembrete nunca sai duas vezes", chamadas.filter(c => c.numero === `T-${suf}-${criados.indexOf(lemb)}`).length === 1);
    ok("o sem e-mail não é tentado de novo", chamadas.length === antes);
    ok("a falha é repetida até 3 tentativas e para", (await st(falha))[0]?.tentativas === 3, await st(falha));

    const lista2 = await (await fetch(`${base}/admin/orcamentos/avulsos?limit=500`, { headers: H })).json();
    ok("a lista mostra quando o lembrete saiu", !!(lista2.find(x => x.id === lemb) || {}).lembrete_em);

    await pool.query(`UPDATE orcamentos SET valido_ate = $2::date WHERE id = $1`, [lemb, dia(4)]);
    await venc.enviarLembretes({ soIds: amL, enviar: dub, forcar: true, dias: 5 });
    ok("validade nova ganha lembrete novo", chamadas.filter(c => c.numero === `T-${suf}-${criados.indexOf(lemb)}`).length === 2);

    const m = email.montarLembreteOrcamento({ numero: "OR-1", condominioNome: "Ed. Teste", validoAte: "2026-12-01", enviadoEm: new Date(), dias: 5, linkPainel: "https://x.test/cliente/painel/orcamentos?orc=1" });
    ok("o e-mail diz a validade e pergunta se podemos seguir", m.html.includes("01/12/2026") && /podemos seguir/.test(m.html) && /podemos seguir/.test(m.subject));
    ok("o e-mail com painel leva o botão; sem painel, não", m.html.includes("orc=1") && !email.montarLembreteOrcamento({ numero: "OR-1", validoAte: "2026-12-01", dias: 5 }).html.includes("Ver o orçamento e responder"));
    ok("o e-mail não traz valor", !/R\$/.test(m.html + m.text));

    // ── 4. Apagar ───────────────────────────────────────────────────────────
    const os2 = (await pool.query(
      `INSERT INTO ordens_servico (numero, condominio_id, orcamento_necessario) VALUES ($1, $2, TRUE) RETURNING id`,
      [`OS-W-${suf}`, condoId])).rows[0].id;
    osCriadas.push(os2);
    const velho = await novo({ valido_ate: dia(-130), os_id: os2 });
    const novoArq = await novo({ valido_ate: dia(-20) });
    const comChamado = await novo({ valido_ate: dia(-130) });
    await pool.query(`UPDATE orcamentos SET arquivado_em = NOW() - INTERVAL '100 days' WHERE id = ANY($1::int[])`, [[velho, comChamado]]);
    await pool.query(`UPDATE orcamentos SET arquivado_em = NOW() - INTERVAL '10 days' WHERE id = $1`, [novoArq]);
    chamadosCriados.push((await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, status, categoria, prioridade, orcamento_id) VALUES ($1, 'chamado de teste venc', 'aberto', 'manutencao', 'p4', $2) RETURNING id`,
      [condoId, comChamado])).rows[0].id);
    const amA = [velho, novoArq, comChamado];

    ok("prazo 0 não apaga nada", (await venc.apagarArquivados({ dias: 0, soIds: amA })).desligado === true);
    const prev = await venc.apagarArquivados({ dias: 90, soIds: amA, gravar: false });
    ok("a contagem acha só o arquivado há mais de 90 dias sem chamado", prev.candidatos === 1 && prev.ids[0] === velho, prev);
    const ap = await venc.apagarArquivados({ dias: 90, soIds: amA });
    ok("apaga o arquivado há mais de 90 dias", ap.apagados === 1 && !(await linha(velho)), ap);
    ok("não apaga o arquivado há 10 dias nem o que tem chamado", !!(await linha(novoArq)) && !!(await linha(comChamado)));
    const lix = (await pool.query(
      `SELECT contexto FROM registros_apagados WHERE tabela = 'orcamentos' AND registro_id = $1 ORDER BY id DESC LIMIT 1`, [String(velho)])).rows[0];
    ok("a cópia fica na lixeira, com o motivo", lix && /arquivado há mais de 90 dias/.test(lix.contexto || ""), lix);
    ok("o pedido do técnico sai da fila junto", (await pool.query(`SELECT orcamento_necessario FROM ordens_servico WHERE id = $1`, [os2])).rows[0].orcamento_necessario === false);
  } catch (e) {
    console.error("ERRO:", e);
    r.push(["sem exceção", false]);
  } finally {
    if (chamadosCriados.length) await pool.query(`DELETE FROM chamados WHERE id = ANY($1::int[])`, [chamadosCriados]).catch(e => console.error(e.message));
    await pool.query(`DELETE FROM orcamentos WHERE id = ANY($1::int[])`, [criados]).catch(e => console.error(e.message));
    if (osCriadas.length) await pool.query(`DELETE FROM ordens_servico WHERE id = ANY($1::int[])`, [osCriadas]).catch(e => console.error(e.message));
    if (userCliId) await pool.query(`DELETE FROM usuarios WHERE id = $1`, [userCliId]).catch(e => console.error(e.message));
    server.close();
    await pool.end();
    for (const [n, c] of r) console.log(`${c ? "✅" : "❌"} ${n}`);
    const falhas = r.filter(([, c]) => !c).length;
    console.log(falhas ? `\n${falhas} falha(s)` : `\nTudo certo (${r.length})`);
    process.exit(falhas ? 1 : 0);
  }
})();
