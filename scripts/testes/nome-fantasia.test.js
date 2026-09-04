// O prédio aparece pelo nome que a operação usa, não pela razão social.
//
//   node scripts/testes/nome-fantasia.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE. Relato do Pedro em 04/09/2026: *"a O.S. do Auri
// Faria Lima está vindo como Elvira Ferraz etc"*. O condomínio tem
// `nome` = "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA" (a razão social) e
// `nome_fantasia` = "AURI FARIA LIMA" — e o PDF da O.S. imprimia o primeiro,
// num documento que o síndico assina.
//
// ⚠️ NÃO ERA UM CASO ISOLADO: **73 dos 89 condomínios ativos** têm os dois
// campos diferentes, e havia **20 lugares** no backend selecionando `c.nome`
// cru — a lista de chamados, os alertas, os relatórios, o WhatsApp, a lista de
// O.S. O projeto já tinha decidido isso em 12 outros lugares
// (`COALESCE(NULLIF(nome_fantasia,''), nome)`); os 20 eram a deriva.
//
// ⚠️ O DEFEITO É INVISÍVEL EM TESTE COM DADO INVENTADO: fixture cujo nome e
// nome_fantasia são iguais passa dos dois jeitos. Por isso este teste cria um
// prédio em que eles DIFEREM — é a única forma de a asserção significar algo.
//
// ⚠️ NÃO ESCREVE fora do que cria e apaga no `finally`.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

// A assinatura do defeito: `c.nome AS condominio_nome` — o alias cru.
// ⚠️ Sem a flag /g no `test()`, e recriada a cada uso no matchAll, porque
// RegExp com /g guarda `lastIndex` entre chamadas e pularia ocorrências.
const RE_CRU = /(?:^|[\s,(])(c|co|cond)\.nome\s+AS\s+condominio_nome/i;

const RAZAO = "TESTE EMPREENDIMENTOS IMOBILIARIOS LTDA";
const FANTASIA = "PREDIO DO TESTE";

async function main() {
  const lixo = [];
  try {
    // ── A varredura: nenhum SELECT pode voltar a usar o nome cru ─────────────
    // ⚠️ Esta é a asserção que impede a regressão. Um `c.nome AS
    // condominio_nome` novo não quebra nada, não aparece no console e volta a
    // imprimir a razão social no papel que vai para o cliente.
    const arquivos = [];
    const varrer = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) varrer(p);
        else if (f.name.endsWith(".js")) arquivos.push(p);
      }
    };
    varrer(path.join(__dirname, "../../src"));

    // ⚠️ CONTRATO E ASSINATURA SÃO A EXCEÇÃO, E É DELIBERADA. Ali o nome que
    // vale é a RAZÃO SOCIAL: é ela que assina, é ela que responde
    // juridicamente, e trocá-la pelo apelido do prédio faria o documento
    // nomear alguém que não é parte do contrato. "AURI FARIA LIMA" não assina
    // nada; "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA" assina.
    //
    // A regra do projeto é sobre o nome de EXIBIÇÃO — a lista, o alerta, a
    // O.S., o relatório —, não sobre o instrumento jurídico.
    const EXCECOES = ["contratos.routes.js", "assinatura.routes.js"];

    const crus = [];
    for (const p of arquivos) {
      if (EXCECOES.includes(path.basename(p))) continue;
      const txt = fs.readFileSync(p, "utf8");
      for (const m of txt.matchAll(new RegExp(RE_CRU.source, "gi"))) {
        crus.push(path.basename(p) + ":" + (txt.slice(0, m.index).split("\n").length));
      }
    }
    ok("nenhum SELECT de exibição usa o nome cru", crus.length === 0, crus.join(", "));

    // E a exceção precisa continuar existindo: se alguém "consertar" o contrato
    // com o COALESCE, o documento passa a nomear quem não assina.
    const contrato = fs.readFileSync(
      path.join(__dirname, "../../src/routes/contratos.routes.js"), "utf8");
    ok("o contrato segue usando a RAZÃO SOCIAL (é quem assina)",
       RE_CRU.test(contrato));

    // ── E o comportamento, com um prédio em que os dois campos DIFEREM ───────
    const c = await pool.query(
      `INSERT INTO condominios (nome, nome_fantasia, ativo, cidade, bairro)
       VALUES ($1, $2, TRUE, 'São Paulo', 'Moema') RETURNING id`,
      [RAZAO + " " + Date.now(), FANTASIA]);
    const condo = c.rows[0].id;
    lixo.push(condo);

    const um = await pool.query(
      `SELECT COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome, c.nome AS razao
         FROM condominios c WHERE c.id = $1`, [condo]);
    ok("o padrão do projeto devolve o nome fantasia",
       um.rows[0].condominio_nome === FANTASIA, um.rows[0].condominio_nome);
    ok("e a razão social continua acessível", um.rows[0].razao.startsWith(RAZAO));

    // ⚠️ SEM nome_fantasia, o nome vale — o COALESCE não pode devolver vazio
    // num prédio que só tem razão social cadastrada.
    const c2 = await pool.query(
      `INSERT INTO condominios (nome, nome_fantasia, ativo, cidade)
       VALUES ($1, '', TRUE, 'São Paulo') RETURNING id`, ["SEM FANTASIA " + Date.now()]);
    lixo.push(c2.rows[0].id);
    const dois = await pool.query(
      `SELECT COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome
         FROM condominios c WHERE c.id = $1`, [c2.rows[0].id]);
    ok("prédio sem nome fantasia cai no nome, não em vazio",
       dois.rows[0].condominio_nome.startsWith("SEM FANTASIA"));

    // ── O PDF da O.S., que foi o relato ──────────────────────────────────────
    const pdfSrc = fs.readFileSync(
      path.join(__dirname, "../../src/services/os-pdf.service.js"), "utf8");
    ok("o PDF da O.S. usa o nome fantasia",
       /COALESCE\(NULLIF\(c\.nome_fantasia/.test(pdfSrc));
    // A razão social fica disponível para um documento fiscal um dia.
    ok("e mantém a razão social no payload",
       /c\.nome\s+AS condominio_razao_social/.test(pdfSrc));
  } finally {
    for (const id of lixo) await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
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
