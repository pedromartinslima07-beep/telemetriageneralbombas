// Pré-visualização do e-mail de orçamento, SEM banco, SEM Resend e SEM enviar
// nada para ninguém.
//
//   node scripts/preview-email-orcamento.js
//   → http://localhost:4602/            (com o botão do painel do cliente)
//   → http://localhost:4602/?link=0     (sem o botão — pessoa física)
//   → http://localhost:4602/texto       (a versão em texto puro)
//
// Como funciona: o SDK do Resend é substituído por um dublê que, em vez de
// enviar, guarda o payload. O que aparece na tela é o `sendOrcamentoCliente`
// de verdade, com o logo de verdade embutido — não uma cópia do template que
// envelhece sozinha. A barra escura do topo é do preview, não do e-mail.
//
// Este arquivo é ferramenta de desenvolvimento. Pode apagar sem dó.
const http = require("http");
const path = require("path");
const Module = require("module");

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "preview-sem-envio";

const CAMINHO_EMAIL = require.resolve(path.resolve(__dirname, "..", "src", "services", "email.js"));
let ultimoPayload = null;

// Dois dublês, os dois no require: o SDK (para não enviar) e o
// config.service (que abre pool do Postgres ao ser carregado).
const _load = Module._load;
Module._load = function (pedido, pai) {
  if (pedido === "resend") {
    return { Resend: class {
      constructor() {
        this.emails = { send: async (p) => { ultimoPayload = p; return { data: { id: "preview" }, error: null }; } };
      }
    } };
  }
  if (pedido === "./config.service" && pai && pai.filename === CAMINHO_EMAIL) {
    return { getConfig: async (_chave, padrao) => padrao };
  }
  return _load.apply(this, arguments);
};

const { sendOrcamentoCliente } = require(CAMINHO_EMAIL);

const CENA = {
  to: ["sindico@residencialaurora.com.br"],
  numero: "OR-000164",
  condominioNome: "Residencial Aurora",
  dataDocumento: "2026-08-21",   // DATE — não pode andar um dia pra trás
  criadoEm: "2026-08-21T13:00:00Z",
  validoAte: "2026-09-19",       // DATE
  pdfBuffer: Buffer.from("%PDF-1.4 preview"),
  filename: "orcamento-OR-000164.pdf",
};

async function montar(comLink) {
  ultimoPayload = null;
  await sendOrcamentoCliente({
    ...CENA,
    linkPainel: comLink
      ? "https://telemetria.generalbombas.com/cliente/painel/orcamentos?orc=175"
      : null,
  });
  return ultimoPayload;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const comLink = url.searchParams.get("link") !== "0";
  try {
    const p = await montar(comLink);
    if (url.pathname === "/texto") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return res.end(
        `De: ${p.from}\nPara: ${p.to.join(", ")}\nAssunto: ${p.subject}\n` +
        `Anexo: ${p.attachments[0].filename}\n\n${p.text}`
      );
    }
    const kb = Math.round(Buffer.byteLength(p.html, "utf8") / 1024);
    const barra = `
      <div style="font:13px/1.6 system-ui,sans-serif;background:#111827;color:#e5e7eb;padding:10px 16px;">
        <b>${p.subject}</b> — de ${p.from} · anexo ${p.attachments[0].filename} ·
        corpo HTML <b style="color:${kb > 95 ? "#f87171" : "#4ade80"};">${kb} KB</b>
        (o Gmail apara acima de ~102 KB) ·
        <a href="?link=${comLink ? 0 : 1}" style="color:#fbbf24;">${comLink ? "ver sem o botão" : "ver com o botão"}</a> ·
        <a href="/texto${comLink ? "" : "?link=0"}" style="color:#fbbf24;">ver o texto puro</a>
      </div>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(`<!doctype html><meta charset="utf-8"><title>E-mail do orçamento</title><body style="margin:0;">${barra}${p.html}</body>`);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("ERRO: " + e.stack);
  }
}).listen(4602, () => console.log("http://localhost:4602/"));
