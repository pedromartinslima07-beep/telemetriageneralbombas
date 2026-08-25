// Pré-visualização do TRILHO do modal de orçamento (admin), SEM banco e SEM login.
//
//   node scripts/preview-total-orcamento.js
//   → http://localhost:4601/
//
// Serve public/ de verdade e monta só o trilho da direita. O CSS é o
// `public/admin.css` real; as duas funções que interessam (`_orcFmtValor` e
// `_avAtualizarTotalRail`) são EXTRAÍDAS do `public/admin.js` real em tempo de
// execução — fatiadas por contagem de chaves e avaliadas soltas — em vez de
// copiadas aqui. Copiar era o jeito de a pré-visualização continuar bonita
// depois de o painel quebrar.
//
// Serve pra ver desenho e medir layout (foi assim que apareceram os 6px de
// pulo do trilho ao alternar entre o total e o campo manual). NÃO prova nada
// sobre salvamento, backend ou o resto do modal.
//
// Este arquivo é ferramenta de desenvolvimento. Pode apagar sem dó.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PUB = path.resolve(__dirname, "..", "public");
const PORTA = Number(process.argv[2]) || 4601;

const TIPO = {
  ".css": "text/css", ".js": "text/javascript", ".html": "text/html",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Trilho do orçamento — pré-visualização</title>
<link rel="stylesheet" href="/static/admin.css">
<style>
  body { margin: 0; background: var(--bg, #030a26); }
  .hz { padding: 14px 20px; color: var(--muted); font: 600 12px/1.6 system-ui, sans-serif; }
  .hz b { color: var(--text); }
</style>
</head><body>
<div class="hz">
  <b>Trilho do orçamento</b> — CSS e <code>_avAtualizarTotalRail</code> vindos dos arquivos reais.
  Clique em "definir manualmente": o campo troca de lugar com o número, e nada abaixo se mexe.
</div>
<div id="avModal" class="av-modal" style="display:block;">
  <div class="av-modal-dialog">
    <div id="avModalBody">
      <div class="av-modal-head">
        <div class="av-modal-head-info"><div><div class="av-modal-num">ORC-2026-0184</div></div></div>
      </div>
      <div class="av-layout">
        <div class="av-col-form"><div class="ap-section-title">(coluna do formulário)</div></div>
        <aside class="av-rail">
          <div>
            <div class="av-total-lbl">Total do orçamento</div>
            <div class="av-total" id="avRailTotal">—</div>
            <div class="av-total-edit" id="avValorManualWrap" style="display:none;">
              <span class="av-total-cifrao" aria-hidden="true">R$</span>
              <input id="avInputValorManual" class="av-total-input" type="number" min="0" step="0.01"
                inputmode="decimal" placeholder="0,00" aria-label="Valor total do orçamento" value="">
            </div>
            <div class="av-total-sub" id="avRailTotalSub"></div>
          </div>
          <input type="checkbox" id="avToggleValorManual" class="av-hidden-ctl" tabindex="-1" aria-hidden="true">
          <div class="av-rail-hr"></div>
          <div class="av-rail-kv"><span>Validade</span><b>19/09/2026</b></div>
        </aside>
      </div>
    </div>
  </div>
</div>
<script>
// Fatia uma função do fonte por contagem de chaves. Só serve pra função
// declarada com "function nome(" e sem chave solta dentro de string.
function fatiar(src, nome) {
  const i = src.indexOf("function " + nome + "(");
  if (i < 0) throw new Error("não achei " + nome + " no admin.js");
  let d = 0, dentro = false;
  for (let j = src.indexOf("{", i); j < src.length; j++) {
    if (src[j] === "{") { d++; dentro = true; }
    else if (src[j] === "}") { d--; if (dentro && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error("chave não fechou em " + nome);
}
fetch("/static/admin.js").then(r => r.text()).then(src => {
  // Os 4 itens do cenário "completo" do preview-orcamentos.js: soma R$ 6.460,00.
  window._avLinhas = [
    { valor_unitario: 780,  quantidade: 2 },
    { valor_unitario: 165,  quantidade: 4 },
    { valor_unitario: 3200, quantidade: 1 },
    { valor_unitario: 130,  quantidade: 8 },
  ];
  window._avLinhasId = 1;
  window._avSelecionado = { id: 1 };
  (0, eval)(fatiar(src, "_orcFmtValor") + " " + fatiar(src, "_avAtualizarTotalRail"));

  // Mesma fiação do modal real: o link do sub é injetado a cada render, então
  // a delegação fica no documento e não no botão.
  const chk = document.getElementById("avToggleValorManual");
  const inp = document.getElementById("avInputValorManual");
  document.body.addEventListener("click", e => {
    if (!e.target.closest("[data-av-total-manual]")) return;
    chk.checked = !chk.checked;
    if (!chk.checked) inp.value = "";
    _avAtualizarTotalRail();
    if (chk.checked) inp.focus();
  });
  inp.addEventListener("input", () => _avAtualizarTotalRail());
  _avAtualizarTotalRail();
  window.__pronto = true;
});
</script>
</body></html>`;

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(PAGINA);
  }
  // /static/x e /x apontam pro mesmo public/, como o Express faz em produção.
  const rel = url.startsWith("/static/") ? url.slice(8) : url.slice(1);
  const arquivo = path.join(PUB, rel);
  if (!arquivo.startsWith(PUB)) { res.writeHead(403); return res.end("403"); }
  fs.readFile(arquivo, (e, buf) => {
    if (e) { res.writeHead(404); return res.end("404 " + rel); }
    res.writeHead(200, {
      "content-type": (TIPO[path.extname(arquivo)] || "application/octet-stream") + "; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(buf);
  });
}).listen(PORTA, () => console.log("http://localhost:" + PORTA + "/"));
