// Painel novo só para os logins da PAINEL_NOVO (20/11/2026).
// Uso: node scripts/testes/painel-novo.test.js
//
// Não toca no banco: o que se testa aqui (cookie, escolha da página e o 403
// das rotas que gravam no Omie) responde antes de qualquer consulta. Monta um
// Express com os routers de verdade, mas sem subir o src/app.js (que liga os
// jobs, inclusive a cópia do Omie).
require("dotenv").config({ quiet: true });
process.env.PAINEL_NOVO = "Liberado@Exemplo.invalid, outro@exemplo.invalid";
process.env.OMIE_EMISSAO = "";

const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const pn = require("../../src/services/painel-novo.service");
const { enviarHtml } = require("../../src/html-limpo");
const { authRouter } = require("../../src/routes/auth.routes");
const agendaRouter = require("../../src/routes/agenda.routes");
const { notaFiscalRouter } = require("../../src/routes/nota-fiscal.routes");
const { pool } = require("../../src/db");

let ok = 0, falhou = 0;
function t(nome, cond, extra) {
  if (cond) { ok++; console.log("  ✓", nome); }
  else { falhou++; console.log("  ✗", nome, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const tk = (email, role = "admin") =>
  jwt.sign({ id: 1, role, email }, process.env.JWT_SECRET, { expiresIn: "5m" });

(async () => {
  console.log("lista e cookie");
  t("e-mail da lista, sem diferença de maiúscula", pn.liberado("liberado@exemplo.INVALID"));
  t("segundo e-mail da lista", pn.liberado("outro@exemplo.invalid"));
  t("fora da lista", !pn.liberado("fora@exemplo.invalid"));
  t("sem e-mail", !pn.liberado(undefined) && !pn.liberado(""));
  const v = pn.valorCookie("liberado@exemplo.invalid");
  t("cookie volta o e-mail", pn.emailDoCookie(v) === "liberado@exemplo.invalid");
  const [b64, ass] = v.split(".");
  const outro = Buffer.from("fora@exemplo.invalid").toString("base64url");
  t("cookie com e-mail trocado não vale", pn.emailDoCookie(outro + "." + ass) === null);
  t("cookie com assinatura mexida não vale", pn.emailDoCookie(b64 + "." + ass.replace(/.$/, ass.endsWith("0") ? "1" : "0")) === null);
  t("cookie lixo não vale", pn.emailDoCookie("abc") === null && pn.emailDoCookie("") === null);
  t("gerente liberado vê o novo", pn.painelDoUsuario({ role: "gerente", email: "outro@exemplo.invalid" }) === "novo");
  t("operador liberado continua no antigo", pn.painelDoUsuario({ role: "operador", email: "outro@exemplo.invalid" }) === "antigo");
  const antes = process.env.PAINEL_NOVO;
  process.env.PAINEL_NOVO = "*";
  t("asterisco libera todo mundo", pn.liberado("qualquer@exemplo.invalid"));
  process.env.PAINEL_NOVO = "";
  t("lista vazia não libera ninguém", !pn.liberado("liberado@exemplo.invalid"));
  process.env.PAINEL_NOVO = antes;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.get("/admin/painel", (req, res) => { res.setHeader("Vary", "Cookie"); enviarHtml(res, pn.paginaDoPainel(req)); });
  app.use("/auth", authRouter);
  app.use("/agenda", agendaRouter);
  app.use("/admin", notaFiscalRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;

  try {
    console.log("GET /auth/painel");
    let r = await fetch(base + "/auth/painel");
    t("sem token: 401", r.status === 401, r.status);

    r = await fetch(base + "/auth/painel", { headers: { Authorization: "Bearer " + tk("liberado@exemplo.invalid") } });
    let j = await r.json();
    const setCookie = r.headers.get("set-cookie") || "";
    t("liberado: painel novo", j.painel === "novo", j);
    t("liberado: grava o cookie httpOnly", /gb_painel=[^;]+/.test(setCookie) && /HttpOnly/i.test(setCookie), setCookie);
    const cookieNovo = (setCookie.match(/gb_painel=[^;]+/) || [""])[0];

    r = await fetch(base + "/auth/painel", { headers: { Authorization: "Bearer " + tk("fora@exemplo.invalid") } });
    j = await r.json();
    const limpa = r.headers.get("set-cookie") || "";
    t("fora da lista: painel antigo", j.painel === "antigo", j);
    t("fora da lista: apaga o cookie", /gb_painel=;/.test(limpa), limpa);

    r = await fetch(base + "/auth/painel", { headers: { Authorization: "Bearer " + tk("liberado@exemplo.invalid", "cliente") } });
    j = await r.json();
    t("cliente com e-mail liberado: antigo", j.painel === "antigo", j);

    console.log("GET /admin/painel");
    const pagina = async (cookie) => {
      const rr = await fetch(base + "/admin/painel", { headers: cookie ? { Cookie: cookie } : {} });
      return { html: await rr.text(), vary: rr.headers.get("vary") };
    };
    let p = await pagina();
    t("sem cookie: painel antigo", p.html.includes('data-painel="antigo"'));
    t("o antigo carrega a cópia congelada", p.html.includes("/static/legado/admin.js?v=") && p.html.includes("/static/legado/admin.css?v="));
    t("Vary: Cookie", /cookie/i.test(p.vary || ""), p.vary);
    p = await pagina(cookieNovo);
    t("cookie do liberado: painel novo", p.html.includes('data-painel="novo"') && p.html.includes("/static/admin.js?v="));
    p = await pagina("gb_painel=" + Buffer.from("liberado@exemplo.invalid").toString("base64url") + ".deadbeef");
    t("cookie forjado: antigo", p.html.includes('data-painel="antigo"'));
    process.env.PAINEL_NOVO = "outro@exemplo.invalid";
    p = await pagina(cookieNovo);
    t("e-mail tirado da lista: antigo com o mesmo cookie", p.html.includes('data-painel="antigo"'));
    process.env.PAINEL_NOVO = antes;

    console.log("rotas que gravam no Omie");
    const post = (url, email, body = {}) => fetch(base + url, {
      method: "POST",
      headers: { Authorization: "Bearer " + tk(email), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    for (const rota of ["tirar", "confirmar", "boleto", "liberar"]) {
      r = await post("/agenda/faturamento/lote/" + rota, "fora@exemplo.invalid");
      t(`lote/${rota} fora da lista: 403`, r.status === 403, r.status);
    }
    r = await fetch(base + "/agenda/faturamento/lote?competencia=2026-11", { headers: { Authorization: "Bearer " + tk("fora@exemplo.invalid") } });
    t("GET lote fora da lista: 403", r.status === 403, r.status);
    r = await post("/admin/orcamentos/avulsos/1/nota/emitir", "fora@exemplo.invalid");
    j = await r.json();
    t("emitir nota fora da lista: 403", r.status === 403, r.status);
    t("a mensagem diz o motivo", /painel novo/.test(j.error || ""), j);
    // Liberado passa da trava e chega à regra seguinte (OMIE_EMISSAO desligado → 503).
    r = await post("/agenda/faturamento/lote/confirmar", "liberado@exemplo.invalid", { competencia: "2026-11", contratos: [], valor_total: 0 });
    t("lote liberado passa da trava (503 sem OMIE_EMISSAO)", r.status === 503, r.status);
  } finally {
    srv.close();
  }

  console.log("arquivos");
  const raiz = path.join(__dirname, "../..");
  const ler = (f) => fs.readFileSync(path.join(raiz, f), "utf8");
  t("a cópia do admin.js existe", fs.existsSync(path.join(raiz, "public/legado/admin.js")));
  t("a cópia do admin.css existe", fs.existsSync(path.join(raiz, "public/legado/admin.css")));
  t("as duas páginas carregam o painel-escolha.js", ler("public/admin.html").includes("/static/painel-escolha.js") && ler("public/legado/admin.html").includes("/static/painel-escolha.js"));

  await pool.end().catch(() => {});
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
