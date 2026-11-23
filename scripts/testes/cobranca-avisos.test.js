// O e-mail da nota pelo Omie e os avisos de cobrança (migration 102).
//
//   node scripts/testes/cobranca-avisos.test.js
//
// ⚠️ O QUE ELE PROVA (banco de teste + router + JWT; o Omie e o envio de
// e-mail SIMULADOS — nenhuma chamada sai daqui):
//   A. a nota: a O.S. leva o bloco Email (link + boleto + destinatários) e o
//      pedido leva enviar_email/utilizar_emails; sem boleto, cEnvBoleto N; os
//      destinatários vêm da O.S. mais recente NÃO cancelada do cliente, senão
//      do pedido, senão do cadastro, e ficam guardados (a segunda leitura não
//      chama o Omie); nota já emitida mostra os que foram; e-mail inválido na
//      emissão é 400 antes de qualquer coisa;
//   B. a cobrança: a sincronização copia os títulos do sistema a vencer (o
//      de fora não); a etapa de cada dia (antes, dia, atraso1, atraso2, nada
//      fora das janelas); a fila usa os e-mails da nota; sem e-mail fica em
//      "sem_email"; pago à mão não entra; montar de novo não duplica; mudou a
//      etapa, o pendente expira; sem COBRANCA_EMAIL é 503; com ela, manda com
//      o PDF do boleto anexado, para os destinatários certos, uma vez só;
//      prévia, ignorar, trocar destinatário; regras; 403 para gerente e para
//      admin fora do painel novo.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e apaga o que criou (códigos acima de 9,2e14,
// orçamentos "TESTE-AVI%"). A cópia de atrasados/a vencer é refeita pelo job.
require("dotenv").config({ quiet: true });
process.env.PAINEL_NOVO = "teste-painel@exemplo.invalid";
const express = require("express");
const jwt = require("jsonwebtoken");
const { resolverDatabaseUrl } = require("../../src/db-url");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const { pool } = require("../../src/db");
const omie = require("../../src/services/omie.service");
const email = require("../../src/services/email");
const nota = require("../../src/services/nota-fiscal.service");
const emailsOmie = require("../../src/services/omie-emails.service");
const cob = require("../../src/services/omie-receber.service");
const avisos = require("../../src/services/cobranca-avisos.service");

const r = [];
const ok = (nome, cond, extra) => { r.push({ nome, cond: !!cond }); console.log((cond ? "✓ " : "✗ ") + nome + (cond || extra === undefined ? "" : "  → " + JSON.stringify(extra))); };

const B = 920000000000001;
const CLI = { orc: B, ctr: B + 1, sem: B + 2, cad: B + 3 };
const OS = { orc: B + 10, orc2: B + 11, sem: B + 12 };
const TIT = { antes: B + 20, dia: B + 21, atraso: B + 22, sem: B + 23, fora: B + 24, pago: B + 25 };
const hojeSP = avisos._t._hojeSP();
const mais = n => { const d = new Date(Date.parse(hojeSP + "T12:00:00Z") + n * 86400e3); return d.toISOString().slice(0, 10); };
const br = iso => iso.split("-").reverse().join("/");

async function limpar() {
  const tits = Object.values(TIT);
  await pool.query(`DELETE FROM cobranca_avisos WHERE omie_titulo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_receber_avencer WHERE omie_codigo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_receber_atrasados WHERE omie_codigo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_receber_pagos WHERE omie_titulo = ANY($1::bigint[])`, [tits]);
  await pool.query(`DELETE FROM omie_cliente_emails WHERE omie_cliente = ANY($1::bigint[])`, [Object.values(CLI)]);
  await pool.query(`DELETE FROM omie_clientes WHERE omie_codigo = ANY($1::bigint[])`, [Object.values(CLI)]);
  await pool.query(`DELETE FROM orcamentos WHERE numero LIKE 'TESTE-AVI%'`);
  await pool.query(`DELETE FROM configuracoes WHERE chave LIKE 'cobranca.%'`);
}

async function main() {
  await limpar();
  const adm = (await pool.query(`SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0].id;

  // ── A. o bloco de e-mail da nota ──────────────────────────────────────────
  const orcFake = { id: 1, numero: "X", condo_cidade: "SAO PAULO", condo_uf: "SP" };
  const itens = [{ descricao: "Serviço", quantidade: 1, unitCent: 10000 }];
  const os1 = nota.montarOs({ orc: orcFake, itens, nCodCli: 1, pagamento: { boleto: true }, emails: ["a@x.com", "b@y.com"] });
  ok("O.S. leva o bloco Email com link, boleto e destinatários", os1.Email && os1.Email.cEnvLink === "S" && os1.Email.cEnvBoleto === "S" && os1.Email.cEnviarPara === "a@x.com, b@y.com", os1.Email);
  const os2 = nota.montarOs({ orc: orcFake, itens, nCodCli: 1, pagamento: { boleto: false }, emails: ["a@x.com"] });
  ok("sem boleto: cEnvBoleto N, link segue", os2.Email.cEnvBoleto === "N" && os2.Email.cEnvLink === "S");
  ok("sem e-mail: sem bloco", !("Email" in nota.montarOs({ orc: orcFake, itens, nCodCli: 1, pagamento: null, emails: [] })));
  const ped = nota.montarPedido({ orc: orcFake, itens: [{ linha_id: 1, codigo_produto: 1, quantidade: 1, valor_unitario: 1 }], nCodCli: 1, pagamento: null, emails: ["a@x.com", "b@y.com"] });
  ok("pedido (DANFE) leva enviar_email e utilizar_emails", ped.informacoes_adicionais.enviar_email === "S" && ped.informacoes_adicionais.utilizar_emails === "a@x.com,b@y.com", ped.informacoes_adicionais);
  ok("separar: tira inválido e repetido, junta ; e ,", emailsOmie.separar("A@x.com; b@y.com , a@x.com, nada") .join() === "a@x.com,b@y.com");
  ok("invalidos: aponta o errado", emailsOmie.invalidos("a@x.com, sem-arroba").join() === "sem-arroba");

  // Os destinatários do cliente no Omie (o Omie simulado por omie.chamar).
  const origChamar = omie.chamar;
  const chamadas = [];
  omie.chamar = async (rota, call, param) => {
    chamadas.push([call, param.filtrar_por_cliente || param.codigo_cliente_omie]);
    const cli = param.filtrar_por_cliente || param.codigo_cliente_omie;
    if (call === "ListarOS") {
      if (cli === CLI.orc) return { osCadastro: [
        { Cabecalho: { nCodOS: 3, cNumOS: "300" }, InfoCadastro: { cCancelada: "S", dDtFat: "20/11/2026" }, Email: { cEnviarPara: "cancelada@x.com" } },
        { Cabecalho: { nCodOS: 2, cNumOS: "200" }, InfoCadastro: { cCancelada: "N", dDtFat: "10/11/2026" }, Email: { cEnviarPara: "sindico@predio.com, copia@generalbombas.com" } },
      ] };
      const e = new Error("Não existem registros"); e.naoEncontrado = true; throw e;
    }
    if (call === "ListarPedidos") {
      if (cli === CLI.ctr) return { pedido_venda_produto: [{ cabecalho: { codigo_pedido: 9, numero_pedido: "55" }, infoCadastro: { dFat: "01/10/2026" }, informacoes_adicionais: { utilizar_emails: "compras@ctr.com" } }] };
      const e = new Error("Não existem registros"); e.naoEncontrado = true; throw e;
    }
    if (call === "ConsultarCliente") {
      if (cli === CLI.cad) return { email: "cadastro@cli.com" };
      return { email: "" };
    }
    throw new Error("chamada inesperada: " + call);
  };
  try {
    const d1 = await emailsOmie.doCliente(CLI.orc);
    ok("da O.S. mais recente NÃO cancelada, com número e data", d1.fonte === "os" && d1.emails.join() === "sindico@predio.com,copia@generalbombas.com" && d1.numero === "200" && d1.data === "2026-11-10", d1);
    const n0 = chamadas.length;
    const d1b = await emailsOmie.doCliente(CLI.orc);
    ok("segunda leitura vem da cópia, sem chamar o Omie", chamadas.length === n0 && d1b.emails.length === 2 && d1b.numero === "200");
    const d2 = await emailsOmie.doCliente(CLI.ctr);
    ok("sem O.S.: do pedido", d2.fonte === "pedido" && d2.emails.join() === "compras@ctr.com", d2);
    const d3 = await emailsOmie.doCliente(CLI.cad);
    ok("sem nota nenhuma: do cadastro", d3.fonte === "cadastro" && d3.emails.join() === "cadastro@cli.com", d3);
    const d4 = await emailsOmie.doCliente(CLI.sem);
    ok("sem nada: lista vazia, guardada", d4.emails.length === 0 && (await pool.query(`SELECT 1 FROM omie_cliente_emails WHERE omie_cliente = $1`, [CLI.sem])).rowCount === 1);
  } finally { omie.chamar = origChamar; }

  // ── B. os títulos do sistema ───────────────────────────────────────────────
  const orc = (await pool.query(`INSERT INTO orcamentos (numero, status, criado_por, omie_os_codigo, nota_emails, nota_url)
      VALUES ('TESTE-AVI-1', 'aprovado', $1, $2, 'sindico@predio.com, copia@generalbombas.com', 'https://nfse.exemplo/nota') RETURNING id`, [adm, OS.orc])).rows[0].id;
  await pool.query(`INSERT INTO orcamentos (numero, status, criado_por, omie_os_codigo) VALUES ('TESTE-AVI-2', 'aprovado', $1, $2)`, [adm, OS.sem]);
  await pool.query(`INSERT INTO omie_clientes (omie_codigo, razao_social, nome_fantasia) VALUES ($1, 'COND TESTE AVISO', 'Condomínio Aviso'), ($2, 'SEM EMAIL LTDA', NULL)
      ON CONFLICT (omie_codigo) DO NOTHING`, [CLI.orc, CLI.sem]);

  const tit = (cod, extra) => ({ codigo_lancamento_omie: cod, codigo_cliente_fornecedor: CLI.orc, nCodOS: OS.orc, numero_parcela: "001/001",
    numero_documento_fiscal: "777", valor_documento: 150, data_emissao: br(mais(-20)), id_conta_corrente: 6109178168, boleto: { cGerado: "S", cNumBancario: "123" }, ...extra });
  const aVencer = [
    tit(TIT.antes, { data_vencimento: br(mais(2)), status_titulo: "A VENCER" }),
    tit(TIT.dia, { data_vencimento: br(mais(-1)), status_titulo: "VENCE HOJE", _vence_hoje: true }),
    tit(TIT.sem, { data_vencimento: br(mais(1)), status_titulo: "A VENCER", nCodOS: OS.sem, codigo_cliente_fornecedor: CLI.sem }),
    tit(TIT.fora, { data_vencimento: br(mais(2)), status_titulo: "A VENCER", nCodOS: B + 99 }),
    tit(TIT.pago, { data_vencimento: br(mais(3)), status_titulo: "A VENCER" }),
  ];
  const atrasados = [tit(TIT.atraso, { data_vencimento: br(mais(-4)), status_titulo: "ATRASADO" })];
  const s = await cob.sincronizar({ listar: async () => atrasados, listarAVencer: async () => aVencer });
  const av = (await pool.query(`SELECT omie_codigo, vence_hoje FROM omie_receber_avencer WHERE omie_codigo = ANY($1::bigint[])`, [Object.values(TIT)])).rows;
  ok("a sincronização copia os a vencer do sistema (o de fora não)", s.a_vencer_do_sistema >= 4 && av.length === 4 && !av.some(x => Number(x.omie_codigo) === TIT.fora), { s, av });
  ok("'VENCE HOJE' fica marcado", av.find(x => Number(x.omie_codigo) === TIT.dia)?.vence_hoje === true);
  await pool.query(`INSERT INTO omie_receber_pagos (omie_titulo, pago_em) VALUES ($1, CURRENT_DATE)`, [TIT.pago]);

  // As etapas (regras padrão: 3 antes, 3 e 10 de atraso).
  const R = { dias_antes: 3, atraso_1: 3, atraso_2: 10 };
  const E = (venc, extra = {}) => avisos.etapaDe({ vencimento: venc, ...extra }, hojeSP, R);
  ok("etapas: 3 dias antes, 1 dia antes, 4 antes = nada",
    E(mais(3)) === "antes" && E(mais(1)) === "antes" && E(mais(4)) === null);
  ok("etapas: no dia, e 'vence hoje' do Omie", E(hojeSP) === "dia" && E(mais(-2), { vence_hoje: true }) === "dia");
  ok("etapas: atraso 2 = nada, 3 = 1ª, 9 = 1ª, 10 = 2ª, 17 = 2ª, 18 = nada",
    E(mais(-2), { atrasado: true }) === null && E(mais(-3), { atrasado: true }) === "atraso1" && E(mais(-9), { atrasado: true }) === "atraso1"
    && E(mais(-10), { atrasado: true }) === "atraso2" && E(mais(-17), { atrasado: true }) === "atraso2" && E(mais(-18), { atrasado: true }) === null);

  // A fila (os destinatários sem nota_emails vêm do Omie simulado: vazio).
  const leitorVazio = async () => ({ emails: [], fonte: null });
  const f1 = await avisos.montarFila({ leitor: leitorVazio });
  const fila = async () => (await pool.query(`SELECT omie_titulo, etapa, status, destinatarios FROM cobranca_avisos WHERE omie_titulo = ANY($1::bigint[]) ORDER BY omie_titulo`, [Object.values(TIT)])).rows;
  let q = await fila();
  const de = cod => q.find(x => Number(x.omie_titulo) === cod);
  ok("fila: antes, dia e 1ª cobrança entram", de(TIT.antes)?.etapa === "antes" && de(TIT.dia)?.etapa === "dia" && de(TIT.atraso)?.etapa === "atraso1", q);
  ok("fila: para os e-mails da nota", de(TIT.antes)?.destinatarios === "sindico@predio.com, copia@generalbombas.com" && de(TIT.antes)?.status === "pendente");
  ok("fila: sem e-mail fica em sem_email; pago e de fora não entram", de(TIT.sem)?.status === "sem_email" && !de(TIT.pago) && !de(TIT.fora));
  const f2 = await avisos.montarFila({ leitor: leitorVazio });
  ok("montar de novo não duplica", f2.novos === 0 && (await fila()).length === q.length, f2);
  // Daqui a 2 dias o "antes" vira "dia": o pendente de antes expira.
  const f3 = await avisos.montarFila({ hoje: mais(2), leitor: leitorVazio });
  q = await fila();
  ok("mudou a etapa: o pendente expira", de(TIT.antes)?.etapa === "dia" || q.some(x => Number(x.omie_titulo) === TIT.antes && x.status === "expirado"), { f3, q });
  // volta ao estado de hoje para as rotas
  await pool.query(`DELETE FROM cobranca_avisos WHERE omie_titulo = ANY($1::bigint[])`, [Object.values(TIT)]);
  await avisos.montarFila({ leitor: leitorVazio });

  // ── As rotas ───────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.get("/boleto-teste.pdf", (req, res) => { res.type("application/pdf").send(Buffer.from("%PDF-1.4 boleto de teste")); });
  app.use("/admin", require("../../src/routes/cobranca.routes"));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const tok = (role, em = "teste-painel@exemplo.invalid") => ({ Authorization: "Bearer " + jwt.sign({ id: adm, role, email: em }, process.env.JWT_SECRET, { expiresIn: "10m" }), "Content-Type": "application/json" });
  const ADM = tok("admin"), GER = tok("gerente"), ANT = tok("admin", "fora@exemplo.invalid");
  const chama = async (m, p, h, body) => { const res = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }); return { s: res.status, j: await res.json().catch(() => ({})) }; };

  const origSend = email.sendCobrancaCliente, origObter = omie.obterBoleto;
  const enviados = [];
  email.sendCobrancaCliente = async d => { enviados.push(d); return "re_" + enviados.length; };
  omie.obterBoleto = async () => ({ cLinkBoleto: base + "/boleto-teste.pdf" });
  const antesEnv = process.env.COBRANCA_EMAIL;
  try {
    ok("gerente: 403", (await chama("GET", "/admin/cobranca/avisos", GER)).s === 403);
    ok("admin fora do painel novo: 403", (await chama("GET", "/admin/cobranca/avisos", ANT)).s === 403);
    let l = await chama("GET", "/admin/cobranca/avisos", ADM);
    const meu = cod => (l.j.avisos || []).find(a => a.omie_titulo === cod);
    ok("lista: o aviso com cliente, etapa e destinatários", l.s === 200 && meu(TIT.atraso)?.etapa === "atraso1" && meu(TIT.atraso).cliente.nome === "Condomínio Aviso" && meu(TIT.atraso).destinatarios.length === 2, l.j.avisos && meu(TIT.atraso));
    ok("lista: regras padrão e envio desligado", l.j.regras.dias_antes === 3 && l.j.regras.atraso_2 === 10 && l.j.regras.automatico === false && l.j.envio_ligado === false);
    const idA = meu(TIT.atraso).id, idSem = meu(TIT.sem).id, idDia = meu(TIT.dia).id;

    const pv = await chama("GET", `/admin/cobranca/avisos/${idA}/email`, ADM);
    ok("prévia: assunto de atraso, NF, link da nota, sem valor no corpo", pv.s === 200 && /Boleto em aberto/.test(pv.j.assunto) && /777/.test(pv.j.html) && /nfse\.exemplo/.test(pv.j.html) && !/150,00/.test(pv.j.html) && pv.j.anexo, pv.j.assunto);

    delete process.env.COBRANCA_EMAIL;
    ok("sem COBRANCA_EMAIL: 503 e nada sai", (await chama("POST", "/admin/cobranca/avisos/enviar", ADM, { ids: [idA] })).s === 503 && enviados.length === 0);
    process.env.COBRANCA_EMAIL = "1";
    const e1 = await chama("POST", "/admin/cobranca/avisos/enviar", ADM, { ids: [idA] });
    const ult = enviados[0];
    ok("envia: um e-mail, para os da nota, com o PDF do boleto", e1.s === 200 && e1.j.enviados === 1 && ult && ult.to.join() === "sindico@predio.com,copia@generalbombas.com"
      && ult.boletoPdf && ult.boletoPdf.toString().startsWith("%PDF") && ult.etapa === "atraso1" && ult.diasAtraso === 4, { j: e1.j, ult: ult && { ...ult, boletoPdf: !!ult.boletoPdf } });
    const st = (await pool.query(`SELECT status, email_id, enviado_por FROM cobranca_avisos WHERE id = $1`, [idA])).rows[0];
    ok("registrado: enviado, id do e-mail e quem aprovou", st.status === "enviado" && st.email_id === "re_1" && st.enviado_por === adm, st);
    const e2 = await chama("POST", "/admin/cobranca/avisos/enviar", ADM, { ids: [idA] });
    ok("mandar de novo o mesmo: não sai outro", e2.j.enviados === 0 && enviados.length === 1);
    ok("sem e-mail não sai", (await chama("POST", "/admin/cobranca/avisos/enviar", ADM, { ids: [idSem] })).j.enviados === 0 && enviados.length === 1);
    ok("trocar destinatário inválido: 400", (await chama("PUT", `/admin/cobranca/avisos/${idSem}/para`, ADM, { destinatarios: "x" })).s === 400);
    const tp = await chama("PUT", `/admin/cobranca/avisos/${idSem}/para`, ADM, { destinatarios: "novo@cliente.com" });
    const st2 = (await pool.query(`SELECT status, destinatarios FROM cobranca_avisos WHERE id = $1`, [idSem])).rows[0];
    ok("trocar destinatário: volta a pendente", tp.s === 200 && st2.status === "pendente" && st2.destinatarios === "novo@cliente.com", st2);
    ok("ignorar tira da fila", (await chama("POST", `/admin/cobranca/avisos/${idDia}/ignorar`, ADM)).s === 200
      && (await pool.query(`SELECT status FROM cobranca_avisos WHERE id = $1`, [idDia])).rows[0].status === "ignorado");
    // Pago no meio do caminho: não sai.
    await pool.query(`INSERT INTO omie_receber_pagos (omie_titulo, pago_em) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING`, [TIT.sem]);
    const e3 = await chama("POST", "/admin/cobranca/avisos/enviar", ADM, { ids: [idSem] });
    ok("marcado pago antes do envio: não sai", e3.j.enviados === 0 && enviados.length === 1, e3.j);

    ok("regras: segunda antes da primeira é 400", (await chama("PUT", "/admin/cobranca/avisos/regras", ADM, { atraso_1: 10, atraso_2: 5 })).s === 400);
    const rg = await chama("PUT", "/admin/cobranca/avisos/regras", ADM, { dias_antes: 5, atraso_1: 2, atraso_2: 15, automatico: true });
    ok("regras: grava e devolve", rg.s === 200 && rg.j.regras.dias_antes === 5 && rg.j.regras.atraso_2 === 15 && rg.j.regras.automatico === true, rg.j);
  } finally {
    email.sendCobrancaCliente = origSend; omie.obterBoleto = origObter;
    if (antesEnv === undefined) delete process.env.COBRANCA_EMAIL; else process.env.COBRANCA_EMAIL = antesEnv;
    server.close();
  }

  // A nota emitida mostra os e-mails que foram; e-mail inválido na emissão é 400.
  const dest = await nota.destinatarios({ nota_emails: "sindico@predio.com, copia@generalbombas.com" });
  ok("nota emitida: os destinatários que foram", dest.fonte === "emitida" && dest.lista.length === 2, dest);
  let erro = null;
  try { await nota.emitir(orc, adm, {}, {}, null, "bom@x.com, ruim"); } catch (e) { erro = e; }
  ok("emitir com e-mail inválido: 400 antes de tudo", erro && erro.status === 400 && /ruim/.test(erro.message), erro && erro.message);

  // O e-mail montado (texto) de cada etapa.
  const m = email.montarCobranca({ etapa: "antes", clienteNome: "Cond", numeroNf: "1", vencimento: "2026-12-01", boletoPdf: Buffer.from("x") });
  ok("e-mail antes: assunto com o vencimento e o anexo", /vence em 01\/12\/2026/.test(m.subject) && m.attachments.length === 1);
}

main()
  .catch(e => { console.error(e); r.push({ nome: "exceção", cond: false }); })
  .finally(async () => {
    try { await limpar(); } catch (e) { console.error("limpeza:", e.message); }
    const f = r.filter(x => !x.cond).length;
    console.log(`\n${r.length - f}/${r.length} ${f ? "— FALHOU" : "ok"}`);
    await pool.end();
    process.exit(f ? 1 : 0);
  });
