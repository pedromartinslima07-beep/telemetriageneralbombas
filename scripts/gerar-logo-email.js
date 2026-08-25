// Gera public/logo-email.png — a versão reduzida do logo que vai EMBUTIDA
// (data URI) no e-mail de orçamento.
//
//   node scripts/gerar-logo-email.js
//
// Por que não usar o public/logo-topo.png direto: ele tem 826x180 e 68 KB,
// que viram ~91 KB em base64. O Gmail APARA a mensagem (aquele "[Mensagem
// aparada]" com link "ver mensagem inteira") acima de ~102 KB de corpo — o
// anexo não conta, o data URI sim. Com 91 KB de logo o e-mail nasceria a um
// palmo do corte, e qualquer texto a mais o empurraria pra dentro dele.
// A mesma lição do _avPrepararAssinatura em public/admin.js: reduzir a imagem
// antes de embutir, não aumentar o limite do outro lado.
//
// Rode de novo sempre que o logo mudar, e faça commit do PNG gerado — o envio
// de e-mail lê o arquivo pronto, não redimensiona em tempo de execução.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const RAIZ    = path.resolve(__dirname, "..");
const ORIGEM  = path.join(RAIZ, "public", "logo-topo.png");
const DESTINO = path.join(RAIZ, "public", "logo-email.png");
const LARGURA = 380; // 190 CSS px em telas 2x

(async () => {
  const base64 = fs.readFileSync(ORIGEM).toString("base64");
  const navegador = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const pagina = await navegador.newPage();
    await pagina.setViewport({ width: LARGURA, height: 200, deviceScaleFactor: 1 });
    await pagina.setContent(
      `<body style="margin:0;background:transparent;">
         <img id="l" src="data:image/png;base64,${base64}" style="display:block;width:${LARGURA}px;height:auto;">
       </body>`,
      { waitUntil: "load" }
    );
    const alvo = await pagina.$("#l");
    // omitBackground mantém a transparência: o logo é branco e âmbar, e vai
    // pousar sobre a faixa marinho do cabeçalho do e-mail.
    const buf = await alvo.screenshot({ type: "png", omitBackground: true });
    fs.writeFileSync(DESTINO, buf);
    const kb = n => Math.round(n / 1024);
    console.log(`origem : ${path.relative(RAIZ, ORIGEM)} — ${kb(fs.statSync(ORIGEM).size)} KB`);
    console.log(`gerado : ${path.relative(RAIZ, DESTINO)} — ${kb(buf.length)} KB ` +
                `(${kb(Buffer.from(buf).toString("base64").length)} KB em base64)`);
  } finally {
    await navegador.close();
  }
})().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
