// Webhook do WhatsApp: só aceita POST assinado pela Meta.
//
//   node scripts/testes/whatsapp-assinatura.test.js
//
// Trava (24/11/2026): o POST /whatsapp/webhook confere X-Hub-Signature-256
// (HMAC-SHA256 do corpo CRU com WHATSAPP_APP_SECRET). Sem a chave, sem
// assinatura, com assinatura errada ou com o corpo mexido depois de assinado,
// responde 403 e não processa nada. Assinado certo, 200.
//
// Sobe só o parser de JSON igual ao de src/app.js e o router do WhatsApp numa
// porta local. O payload é de status (sem mensagem), então nada chega à IA,
// à Meta ou ao banco.
const crypto = require("crypto");
const express = require("express");

const SEGREDO = "segredo-de-teste-" + Date.now();
process.env.WHATSAPP_APP_SECRET = SEGREDO;

const { whatsappRouter } = require("../../src/routes/whatsapp.routes");

const app = express();
app.use(express.json({
  limit: "8mb",
  verify: (req, _res, buf) => {
    if (req.originalUrl.startsWith("/whatsapp/webhook")) req.rawBody = buf;
  },
}));
app.use("/whatsapp", whatsappRouter);

const corpo = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "0", changes: [{ field: "messages", value: { statuses: [{ id: "x", status: "delivered" }] } }] }],
});
const assinar = (txt, chave = SEGREDO) => "sha256=" + crypto.createHmac("sha256", chave).update(txt).digest("hex");

let ok = 0, falhas = 0;
function confere(nome, obtido, esperado) {
  if (obtido === esperado) { ok++; console.log(`  ok  ${nome}`); }
  else { falhas++; console.log(`  XX  ${nome}: esperado ${esperado}, veio ${obtido}`); }
}

const server = app.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/whatsapp/webhook`;
  const post = (body, assinatura) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(assinatura ? { "X-Hub-Signature-256": assinatura } : {}) },
    body,
  }).then(r => r.status);

  try {
    confere("assinado certo → 200", await post(corpo, assinar(corpo)), 200);
    confere("sem assinatura → 403", await post(corpo), 403);
    confere("assinado com outra chave → 403", await post(corpo, assinar(corpo, "chave-errada")), 403);
    confere("corpo mexido depois de assinado → 403", await post(corpo.replace("delivered", "read"), assinar(corpo)), 403);
    confere("assinatura sem prefixo sha256= → 403", await post(corpo, assinar(corpo).slice(7)), 403);
    confere("assinatura de tamanho errado → 403", await post(corpo, "sha256=abc"), 403);

    // Espaço extra no JSON muda o HMAC: prova que a conta é sobre os bytes crus.
    const comEspaco = corpo.replace("{", "{ ");
    confere("corpo cru com espaços, assinado → 200", await post(comEspaco, assinar(comEspaco)), 200);

    delete process.env.WHATSAPP_APP_SECRET;
    confere("sem WHATSAPP_APP_SECRET → 403", await post(corpo, assinar(corpo)), 403);
  } finally {
    console.log(`\n${ok}/${ok + falhas} ok`);
    process.exitCode = falhas ? 1 : 0;
    // Sai sozinho quando o servidor fecha: process.exit() com o fetch do Node
    // ainda soltando a conexão derruba o processo no Windows (libuv).
    server.closeAllConnections();
    server.close();
  }
});
