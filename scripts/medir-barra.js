// Mede a barra das telas do operador em larguras de celular real.
//
//   node scripts/medir-barra.js
//   CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" node scripts/medir-barra.js
//
// Para que serve: a barra dessas telas é a peça mais apertada do sistema —
// marca + até três links de texto + duas ações de 44px numa largura de
// telefone. Toda vez que alguém mexeu no que há dentro dela, a conta foi
// refeita À MÃO num comentário do `operador.css`, e em 10/09/2026 ficou claro
// que NENHUMA das contas anotadas batia: a de 08/09 dizia "6px de sobreposição
// a 390" (na verdade sobravam 12), e a que a substituiu dizia "a barra pede
// 417,1px" (somava os recuos laterais duas vezes). Uma delas mandava, na linha
// seguinte, "MEÇA, não deduza".
//
// A moral não é que as pessoas erram conta — é que **medir precisa ser mais
// barato do que estimar**, senão ninguém mede. É isto aqui.
//
// O que ele faz: monta o `<header class="barra">` REAL de cada tela — lido do
// próprio HTML, não copiado — com o `operador.css` REAL, num Chrome, e
// pergunta ao layout quanto cada peça ocupa em cada largura. Não inventa
// markup e não tem número escrito à mão.
//
// ⚠️ NÃO PRECISA DO SERVIDOR NEM DE LOGIN. As requests de `/static/**` são
// interceptadas e respondidas direto do `public/`, então ele roda com o repo
// parado. É de propósito: a barra é CSS, e subir o Express + assinar um JWT
// para medir largura seria cerimônia sem retorno.
//
// ⚠️ O CHROME EMPACOTADO DO PUPPETEER NÃO SOBE NESTA MÁQUINA (mesma pegadinha
// registrada no `gerar-logo-marca.js`): "Timed out after 30000 ms while
// waiting for the WS endpoint URL". `CHROME_PATH` aponta para o Chrome do
// sistema; sem a variável, segue o padrão, que é o que funciona no servidor.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "tmp-barra");

// As quatro telas que dividem o `operador.css`, com a classe de `<body>` que
// cada uma usa — `sem-trilho` e `tela-equip` mudam regras da barra.
const TELAS = [
  { rot: "painel",      arq: "public/operador.html",             cls: "" },
  { rot: "aprovados",   arq: "public/operador-orcamentos.html",  cls: "sem-trilho" },
  { rot: "preventivas", arq: "public/operador-preventivas.html", cls: "sem-trilho" },
  { rot: "tecnico",     arq: "public/tecnico.html",              cls: "sem-trilho tela-equip" },
];

// Larguras de telefone real, em CSS px. 320 é o piso histórico (iPhone SE 1ª
// geração); 430 é o iPhone Pro Max, já acima do limiar de 420 da folha.
const LARGURAS = [320, 360, 375, 376, 390, 412, 430];

const RETRATOS = Number(process.env.RETRATOS ?? 1);

function cabecalho(arq) {
  const html = fs.readFileSync(path.join(RAIZ, arq), "utf8");
  const i = html.indexOf('<header class="barra">');
  const j = html.indexOf("</header>");
  if (i < 0 || j < 0) throw new Error(`sem <header class="barra"> em ${arq}`);
  return html.slice(i, j + "</header>".length);
}

const pagina = (cls, header) => `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/static/operador.css">
</head><body class="${cls}" data-corte="nunca">${header}
<div id="tela" style="height:900px;padding:16px 13px;color:#8ea0c8">conteúdo da tela</div>
</body></html>`;

(async () => {
  const executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const navegador = await puppeteer.launch({
    headless: "new",
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--disable-gpu", "--no-zygote"],
  });
  let falhas = 0;
  try {
    const p = await navegador.newPage();
    let atual = { cls: "", header: "" };

    await p.setRequestInterception(true);
    p.on("request", (req) => {
      const u = new URL(req.url());
      if (u.hostname !== "medir.local") return req.continue();
      if (u.pathname === "/") {
        return req.respond({ contentType: "text/html; charset=utf-8", body: pagina(atual.cls, atual.header) });
      }
      const arq = path.join(RAIZ, u.pathname.replace(/^\/static/, "public"));
      if (!fs.existsSync(arq)) return req.respond({ status: 404, body: "" });
      const tipo = { css: "text/css", png: "image/png", svg: "image/svg+xml",
                     woff2: "font/woff2", js: "text/javascript" }[path.extname(arq).slice(1)]
                   || "application/octet-stream";
      req.respond({ contentType: tipo, body: fs.readFileSync(arq) });
    });

    if (RETRATOS) fs.mkdirSync(SAIDA, { recursive: true });

    for (const tela of TELAS) {
      atual = { cls: tela.cls, header: cabecalho(tela.arq) };
      console.log(`\n╔═ ${tela.rot.toUpperCase()} — ${tela.arq} ${"═".repeat(Math.max(0, 34 - tela.rot.length))}`);

      for (const w of LARGURAS) {
        await p.setViewport({ width: w, height: 420, deviceScaleFactor: 2 });
        await p.goto("http://medir.local/", { waitUntil: "networkidle0" });
        await p.evaluate(() => document.fonts.ready);

        const r = await p.evaluate(() => {
          const q = (s) => document.querySelector(s);
          const barra = q(".barra");
          const img = q(".marca img");
          const pic = q(".marca picture");
          const cx = img ? img.getBoundingClientRect() : null;
          // Todo alvo de toque da barra, com a medida que o dedo encontra.
          const alvos = [...document.querySelectorAll(
            ".barra-nav a,.barra-nav button,.barra-acoes .btn,.conta-eu"
          )].map((e) => {
            const b = e.getBoundingClientRect();
            // O `::before` da nav alarga a área de clique sem ocupar layout:
            // quem responde pelo alvo é ele, não a caixa do texto.
            const antes = getComputedStyle(e, "::before");
            const folga = antes.content !== "none"
              ? Math.abs(parseFloat(antes.left) || 0) + Math.abs(parseFloat(antes.right) || 0) : 0;
            return {
              t: (e.innerText || e.getAttribute("aria-label") || "conta").trim().split("\n")[0],
              w: +b.width.toFixed(0), h: +b.height.toFixed(0), alvo: +(b.width + folga).toFixed(0),
            };
          });
          return {
            estouro: +(document.documentElement.scrollWidth - innerWidth).toFixed(1),
            barraH: +barra.getBoundingClientRect().height.toFixed(1),
            logo: cx && pic && getComputedStyle(pic).display !== "none" && cx.width > 0
              ? { w: +cx.width.toFixed(0), h: +cx.height.toFixed(0), x: +cx.left.toFixed(0),
                  src: img.currentSrc.split("/").pop() }
              : null,
            alvos,
          };
        });

        const magro = r.alvos.filter((a) => a.alvo < 44 || a.h < 44);
        const ok = r.estouro <= 0 && r.logo && magro.length === 0;
        if (!ok) falhas++;

        console.log(`  ${String(w).padStart(3)}px  ${ok ? "✓" : "✗"}  estouro ${r.estouro <= 0 ? "0" : r.estouro}  ·  barra ${r.barraH}px  ·  logo ${
          r.logo ? `${r.logo.w}x${r.logo.h} em x=${r.logo.x} (${r.logo.src})` : "AUSENTE"}`);
        console.log(`         ${r.alvos.map((a) => `${a.t} ${a.alvo}x${a.h}`).join(" · ") || "—"}${
          magro.length ? `\n         ⚠ alvo abaixo de 44px: ${magro.map((a) => a.t).join(", ")}` : ""}`);

        if (RETRATOS) {
          await p.screenshot({
            path: path.join(SAIDA, `${tela.rot}-${w}.png`),
            clip: { x: 0, y: 0, width: w, height: 160 },
          });
        }
      }
    }
    if (RETRATOS) console.log(`\nretratos em ${path.relative(RAIZ, SAIDA)}/ (RETRATOS=0 desliga)`);
    console.log(falhas ? `\n${falhas} largura(s) com problema.` : "\nTodas as larguras fecham.");
  } finally {
    await navegador.close();
  }
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
