// Gera public/logo-marca.png — a MARCA SEM O WORDMARK, no tamanho de barra.
//
//   node scripts/gerar-logo-marca.js
//
// Para que serve: no celular a barra do operador não tem largura para o
// `logo-topo.png` (o wordmark inteiro) ao lado de três links de navegação e
// duas ações — medido em 08/09/2026, o wordmark pintava 77px por cima de
// "Aprovados" a 390px. A marca sozinha resolve sem tirar uma palavra da tela.
//
// ⚠️ POR QUE NÃO USAR O `logo-menu.png` DIRETO: ele tem 1024x1024 e **1,15 MB**.
// O admin o serve assim na sidebar recolhida (dívida conhecida), mas ali é
// desktop; aqui o alvo é justamente o celular, que é o caso de banda ruim.
// 1,15 MB para desenhar 34px é a mesma lição do `gerar-logo-email.js` e do
// `_avPrepararAssinatura`: **reduzir a imagem antes de embutir, não aumentar o
// limite do outro lado.**
//
// ⚠️ E POR QUE APARAR AS BORDAS: o `logo-menu.png` traz um halo difuso e uma
// margem transparente larga em volta do desenho. Numa barra de 60px o halo
// vira uma mancha clara sobre o marinho — e este sistema não tem sombra
// projetada em lugar nenhum (DESIGN.md, "Elevation & Depth"). O corte é feito
// pelo conteúdo opaco de verdade, medido pixel a pixel, não por um número
// escrito à mão.
//
// Rode de novo se a marca mudar, e faça commit do PNG gerado — a barra lê o
// arquivo pronto, não redimensiona em tempo de execução.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const RAIZ    = path.resolve(__dirname, "..");
const ORIGEM  = path.join(RAIZ, "public", "logo-menu.png");
const DESTINO = path.join(RAIZ, "public", "logo-marca.png");
// ⚠️ SIZED PELA ALTURA, NÃO NUM QUADRADO. O desenho tem 886x566 (razão 1,57):
// forçá-lo num quadrado devolveria uma peça com tarja transparente em cima e
// embaixo e desperdiçaria justamente a LARGURA que este arquivo existe para
// economizar. 102px = 34 CSS px em tela 3x, a altura que a barra desenha.
const ALTURA = 102;
// Abaixo disto o pixel é halo, não desenho. O halo do `logo-menu.png` é suave
// e chega perto de 0.35 de alfa nas pontas; 0.6 pega só o traço.
const ALFA_MIN = 0.6;

(async () => {
  const base64 = fs.readFileSync(ORIGEM).toString("base64");
  // ⚠️ O CHROME EMPACOTADO DO PUPPETEER NÃO SOBE NESTA MÁQUINA (08/09/2026):
  // "Timed out after 30000 ms while waiting for the WS endpoint URL". O Chrome
  // do sistema sobe na hora. `CHROME_PATH` (ou `PUPPETEER_EXECUTABLE_PATH`)
  // aponta para ele; sem a variável, segue o comportamento padrão, que é o que
  // funciona no servidor.
  //   CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" node scripts/gerar-logo-marca.js
  const executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const navegador = await puppeteer.launch({
    headless: "new",
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--disable-gpu", "--no-zygote"],
  });
  try {
    const pagina = await navegador.newPage();
    await pagina.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

    // 1. Descobre a caixa do desenho OPACO dentro do PNG de origem.
    await pagina.setContent(
      `<body style="margin:0"><canvas id="c" width="1024" height="1024"></canvas>
       <img id="l" src="data:image/png;base64,${base64}" style="display:none"></body>`,
      { waitUntil: "load" }
    );
    const caixa = await pagina.evaluate(async (alfaMin) => {
      const img = document.getElementById("l");
      await img.decode();
      const c = document.getElementById("c");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const corte = Math.round(alfaMin * 255);
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] >= corte) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      return { x0, y0, x1, y1, w: c.width, h: c.height };
    }, ALFA_MIN);
    if (caixa.x1 < 0) throw new Error("nenhum pixel opaco encontrado na origem");

    const larg = caixa.x1 - caixa.x0 + 1;
    const alt  = caixa.y1 - caixa.y0 + 1;
    const escala = ALTURA / alt;
    const LARGURA = Math.round(larg * escala);

    // 2. Redesenha só a caixa, no tamanho de destino.
    await pagina.setViewport({ width: LARGURA, height: ALTURA, deviceScaleFactor: 1 });
    await pagina.setContent(
      `<body style="margin:0;background:transparent;">
         <div id="a" style="width:${LARGURA}px;height:${ALTURA}px;overflow:hidden;position:relative">
           <img src="data:image/png;base64,${base64}" style="
             position:absolute;
             width:${caixa.w * escala}px;height:${caixa.h * escala}px;
             left:${-caixa.x0 * escala}px;
             top:${-caixa.y0 * escala}px;">
         </div>
       </body>`,
      { waitUntil: "load" }
    );
    const alvo = await pagina.$("#a");
    // omitBackground preserva a transparência: a marca pousa sobre o marinho.
    const buf = await alvo.screenshot({ type: "png", omitBackground: true });
    fs.writeFileSync(DESTINO, buf);

    const kb = (n) => Math.round(n / 1024);
    console.log(`origem  : ${path.relative(RAIZ, ORIGEM)} — ${caixa.w}x${caixa.h}, ${kb(fs.statSync(ORIGEM).size)} KB`);
    console.log(`desenho : ${larg}x${alt} dentro dela (alfa >= ${ALFA_MIN})`);
    console.log(`gerado  : ${path.relative(RAIZ, DESTINO)} — ${LARGURA}x${ALTURA}, ${kb(buf.length)} KB`);
  } finally {
    await navegador.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
