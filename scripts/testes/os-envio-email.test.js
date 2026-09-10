// O envio da O.S. por e-mail ao cliente (10/09/2026).
//
//   node scripts/testes/os-envio-email.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE: a rota grava e manda e-mail, e o CLAUDE.md é
// explícito — rota que grava só se testa exercitando a rota. `node --check`
// não pega parâmetro repetido em SQL, e um erro no `UPDATE` final apareceria
// só depois de o e-mail ter saído, com o operador vendo "erro" para algo que
// o cliente já recebeu.
//
// ⚠️ NADA SAI PARA NINGUÉM: o SDK do Resend é substituído por um dublê que
// guarda o payload, e o PDF é um arquivo falso escrito no caminho que a rota
// procura — assim o Puppeteer nem é chamado.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa no `finally`.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Module = require("module");

// O dublê precisa entrar ANTES do require do router, que carrega o email.js.
let ultimoPayload = null;
// No lote interessa a sequência inteira, não só o último: é comparando os dois
// e-mails que se prova que cada prédio recebeu só o documento dele.
let acumulador = null;
const capturarTodos = (arr) => { acumulador = arr; };
const _load = Module._load;
Module._load = function (pedido) {
  if (pedido === "resend") {
    return { Resend: class {
      constructor() {
        this.emails = { send: async (p) => {
          ultimoPayload = p;
          if (acumulador) acumulador.push(p);
          return { data: { id: "teste" }, error: null };
        } };
      }
    } };
  }
  return _load.apply(this, arguments);
};
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "teste-sem-envio";

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
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  let osId = null, condoId = null, emailAntes = null, pdfPath = null;
  let os2Id = null, os3Id = null, condo2Id = null, email2Antes = null;

  try {
    const condo = (await pool.query("SELECT id, email FROM condominios ORDER BY id LIMIT 1")).rows[0];
    condoId = condo.id;
    emailAntes = condo.email;
    await pool.query("UPDATE condominios SET email = $2 WHERE id = $1", [condoId, "sindico@teste.local, zelador@teste.local"]);

    const numero = "OS-T-" + String(Date.now()).slice(-9);
    osId = (await pool.query(
      `INSERT INTO ordens_servico (numero, condominio_id) VALUES ($1, $2) RETURNING id`,
      [numero, condoId]
    )).rows[0].id;

    const tk = (role) => jwt.sign({ id: 999999, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const bater = (role, metodo, caminho, corpo) => fetch(base + "/ordens-servico/" + osId + caminho, {
      method: metodo,
      headers: { Authorization: "Bearer " + tk(role), "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

    // ── Quem pode chegar aqui ─────────────────────────────────────────────
    ok("técnico NÃO envia (403)", (await bater("tecnico", "POST", "/enviar-email", { emails: "a@b.com" })).status === 403);
    ok("cliente NÃO envia (403)", (await bater("cliente", "POST", "/enviar-email", { emails: "a@b.com" })).status === 403);
    ok("operador NÃO envia (403)", (await bater("operador", "POST", "/enviar-email", { emails: "a@b.com" })).status === 403);

    // ── Destinatários vêm do cadastro do condomínio ───────────────────────
    const rDest = await bater("admin", "GET", "/destinatarios");
    const dest = await rDest.json();
    ok("destinatários saem de condominios.email",
      rDest.status === 200 && dest.cadastrados.join(",") === "sindico@teste.local,zelador@teste.local");
    ok("e dizem que há condomínio", dest.tem_condominio === true);

    // ── Rascunho não vira documento ───────────────────────────────────────
    // ⚠️ Esta é a asserção que não pode cair: sem a assinatura do responsável
    // o papel não vale como comprovante do atendimento.
    const rRasc = await bater("admin", "POST", "/enviar-email", { emails: "a@b.com" });
    ok("O.S. não finalizada é recusada (400)", rRasc.status === 400);
    ok("e o motivo é a finalização", /finalizada/i.test((await rRasc.json()).error || ""));
    ok("nada foi enviado", ultimoPayload === null);

    // ── Finaliza (na marra, sem passar pelo Puppeteer) e planta o PDF ─────
    await pool.query("UPDATE ordens_servico SET finalizada_em = NOW(), chegada_em = NOW() WHERE id = $1", [osId]);
    const dir = path.join(__dirname, "../../uploads/os", String(osId));
    fs.mkdirSync(dir, { recursive: true });
    pdfPath = path.join(dir, "os-" + numero + ".pdf");
    fs.writeFileSync(pdfPath, "%PDF-1.4 teste");

    // ── Validação da lista ────────────────────────────────────────────────
    ok("lista vazia é recusada (400)", (await bater("admin", "POST", "/enviar-email", { emails: "  " })).status === 400);
    const rInv = await bater("admin", "POST", "/enviar-email", { emails: "sindico@teste.local, nao-e-email" });
    ok("endereço inválido é recusado (400)", rInv.status === 400);
    ok("e o erro nomeia o endereço", /nao-e-email/.test((await rInv.json()).error || ""));
    ok("nada foi enviado ainda", ultimoPayload === null);

    // ── Caminho feliz ─────────────────────────────────────────────────────
    const rEnv = await bater("admin", "POST", "/enviar-email", { emails: "Sindico@Teste.local , zelador@teste.local" });
    const env = await rEnv.json();
    ok("envio responde 200", rEnv.status === 200);
    ok("e-mail foi montado", ultimoPayload !== null);
    ok("assunto nomeia a O.S.", (ultimoPayload?.subject || "").includes(numero));
    ok("vai com o PDF em anexo", ultimoPayload?.attachments?.length === 1);
    ok("endereços normalizados para minúsculo",
      JSON.stringify(ultimoPayload?.to) === JSON.stringify(["sindico@teste.local", "zelador@teste.local"]));

    // A moldura é a compartilhada, e é o pedido original: o mesmo desenho do
    // e-mail de orçamento, com a sobrancelha trocada.
    ok("usa a moldura estruturada", /background:#030a26/.test(ultimoPayload?.html || ""));
    ok("sobrancelha é da O.S.", /Ordem de serviço/.test(ultimoPayload?.html || ""));
    ok("e não a do orçamento", !/Orçamento comercial/.test(ultimoPayload?.html || ""));
    ok("caixa de informações traz o número", (ultimoPayload?.html || "").includes(numero));
    ok("tem versão em texto puro", (ultimoPayload?.text || "").includes(numero));

    // ⚠️ O registro do envio: é o que faz o modal dizer "já enviada em ...".
    const banco = (await pool.query("SELECT enviado_em, enviado_para FROM ordens_servico WHERE id=$1", [osId])).rows[0];
    ok("gravou enviado_em", Boolean(banco.enviado_em));
    ok("gravou a lista em enviado_para", banco.enviado_para === "sindico@teste.local, zelador@teste.local");
    ok("e a resposta devolve o mesmo", env.enviado_para === banco.enviado_para);

    // ══════════════════════════════════════════════════════════════════════
    // LOTE — várias O.S., de prédios diferentes, cada uma para o SEU destino
    // ══════════════════════════════════════════════════════════════════════
    // ⚠️ ESTA É A ASSERÇÃO QUE IMPORTA: o documento de um cliente não pode
    // chegar na caixa de entrada de outro. O teste monta dois condomínios com
    // e-mails distintos e confere PARA ONDE cada e-mail foi.
    const outro = (await pool.query("SELECT id, email FROM condominios WHERE id <> $1 ORDER BY id LIMIT 1", [condoId])).rows[0];
    if (outro) {
      condo2Id = outro.id;
      email2Antes = outro.email;
      await pool.query("UPDATE condominios SET email = $2 WHERE id = $1", [condo2Id, "outro-predio@teste.local"]);

      const n2 = "OS-T2-" + String(Date.now()).slice(-9);
      os2Id = (await pool.query(
        `INSERT INTO ordens_servico (numero, condominio_id, finalizada_em, chegada_em)
         VALUES ($1, $2, NOW(), NOW()) RETURNING id`, [n2, condo2Id]
      )).rows[0].id;
      const dir2 = path.join(__dirname, "../../uploads/os", String(os2Id));
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir2, "os-" + n2 + ".pdf"), "%PDF-1.4 teste");

      // Uma terceira, de propósito impossível: rascunho. O lote não pode
      // derrubar tudo por causa dela.
      const n3 = "OS-T3-" + String(Date.now()).slice(-9);
      os3Id = (await pool.query(
        `INSERT INTO ordens_servico (numero, condominio_id) VALUES ($1, $2) RETURNING id`, [n3, condoId]
      )).rows[0].id;

      const enviados = [];
      capturarTodos(enviados);
      const rLote = await fetch(base + "/ordens-servico/enviar-email-lote", {
        method: "POST",
        headers: { Authorization: "Bearer " + tk("admin"), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [osId, os2Id, os3Id] }),
      });
      const lote = await rLote.json();

      ok("lote responde 200 mesmo com uma impossível", rLote.status === 200);
      ok("duas enviadas", (lote.enviadas || []).length === 2);
      ok("uma falha, e é o rascunho", (lote.falhas || []).length === 1 && lote.falhas[0].id === os3Id);
      ok("a falha diz o motivo", /finalizada/i.test(lote.falhas[0].erro || ""));

      ok("saíram DOIS e-mails, um por O.S.", enviados.length === 2);
      const doPredio1 = enviados.find(p => (p.subject || "").includes(numero));
      const doPredio2 = enviados.find(p => (p.subject || "").includes(n2));
      ok("cada e-mail leva uma O.S. só",
        doPredio1?.attachments?.length === 1 && doPredio2?.attachments?.length === 1);
      // O coração do teste.
      ok("o prédio 1 recebeu só o dele",
        JSON.stringify(doPredio1?.to) === JSON.stringify(["sindico@teste.local", "zelador@teste.local"]));
      ok("o prédio 2 recebeu só o dele",
        JSON.stringify(doPredio2?.to) === JSON.stringify(["outro-predio@teste.local"]));
      ok("e nenhum viu o documento do outro",
        !(doPredio1?.html || "").includes(n2) && !(doPredio2?.html || "").includes(numero));

      const b2 = (await pool.query("SELECT enviado_em, enviado_para FROM ordens_servico WHERE id=$1", [os2Id])).rows[0];
      ok("a segunda ficou registrada com o destino dela", b2.enviado_para === "outro-predio@teste.local");
      const b3 = (await pool.query("SELECT enviado_em FROM ordens_servico WHERE id=$1", [os3Id])).rows[0];
      ok("o rascunho não foi marcado como enviado", b3.enviado_em === null);
    }

    // ── A lista traz o estado do envio, que é o que a tela mostra ─────────
    const rLista = await fetch(base + "/ordens-servico", { headers: { Authorization: "Bearer " + tk("admin") } });
    const lista = await rLista.json();
    const naLista = lista.find(o => o.id === osId);
    ok("a lista devolve enviado_em", Boolean(naLista && naLista.enviado_em));
    ok("e o e-mail do cadastro, que decide se dá para enviar em lote",
      Boolean(naLista && naLista.condominio_email));
  } catch (e) {
    console.error("ERRO:", e.stack);
    process.exitCode = 1;
  } finally {
    for (const id of [osId, os2Id, os3Id]) {
      if (id) await pool.query("DELETE FROM ordens_servico WHERE id=$1", [id]).catch(() => {});
    }
    if (condoId) await pool.query("UPDATE condominios SET email=$2 WHERE id=$1", [condoId, emailAntes]).catch(() => {});
    if (condo2Id) await pool.query("UPDATE condominios SET email=$2 WHERE id=$1", [condo2Id, email2Antes]).catch(() => {});
    for (const id of [osId, os2Id]) {
      if (id) { try { fs.rmSync(path.join(__dirname, "../../uploads/os", String(id)), { recursive: true, force: true }); } catch {} }
    }
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
