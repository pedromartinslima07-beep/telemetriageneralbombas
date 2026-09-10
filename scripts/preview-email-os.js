// Pré-visualização do e-mail da O.S., SEM banco, SEM Resend e SEM enviar nada.
//
//   node scripts/preview-email-os.js
//   → public/_preview-email-os.html, aberto em /dev/_preview-email-os.html
//
// Ao contrário do orçamento, aqui não há variante: a O.S. sempre vai com o PDF
// em anexo, porque o painel do cliente não tem tela de ordem de serviço para
// onde mandar quem recebe.
//
// Como funciona: o SDK do Resend é substituído por um dublê que, em vez de
// enviar, guarda o payload. O que aparece na tela é o `sendOrdemServicoCliente`
// de verdade, com o logo de verdade embutido — não uma cópia do template, que
// envelheceria sozinha. A barra escura do topo é do preview, não do e-mail.
//
// ⚠️ Grava um arquivo em vez de subir servidor: o preview do modal de envio
// (`preview-modal-envio.js`) faz o mesmo, e o arquivo pode ser aberto direto no
// navegador sem nada rodando.
//
// Este arquivo é ferramenta de desenvolvimento. Pode apagar sem dó.
const fs = require("fs");
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

const { sendOrdemServicoCliente } = require(CAMINHO_EMAIL);

const CENA = {
  to: ["sindico@residencialaurora.com.br"],
  numero: "OS-2026-0184",
  condominioNome: "Residencial Aurora",
  tecnicoNome: "Carlos Ferreira",
  atendimentoEm: "2026-09-08T13:20:00Z",
  finalizadaEm: "2026-09-08T16:05:00Z",
  filename: "os-OS-2026-0184.pdf",
  pdfBuffer: Buffer.from("%PDF-1.4 preview"),
};

(async () => {
  await sendOrdemServicoCliente(CENA);
  const p = ultimoPayload;
  const kb = Math.round(Buffer.byteLength(p.html, "utf8") / 1024);
  const anexo = p.attachments?.[0]?.filename || "sem anexo";

  const barra = `
    <div style="font:13px/1.6 system-ui,sans-serif;background:#111827;color:#e5e7eb;padding:10px 16px;">
      <b>${p.subject}</b> — de ${p.from} · anexo ${anexo} ·
      corpo HTML <b style="color:${kb > 95 ? "#f87171" : "#4ade80"};">${kb} KB</b>
      (o Gmail apara acima de ~102 KB)
    </div>
    <pre style="font:12px/1.6 ui-monospace,monospace;background:#1f2937;color:#d1d5db;margin:0;padding:12px 16px;white-space:pre-wrap;">${
      p.text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
    }</pre>`;

  const destino = path.resolve(__dirname, "..", "public", "_preview-email-os.html");
  fs.writeFileSync(
    destino,
    `<!doctype html><meta charset="utf-8"><title>E-mail da O.S.</title><body style="margin:0;">${barra}${p.html}</body>`,
    "utf8"
  );
  console.log("→ " + destino);
  console.log("   abra em /dev/_preview-email-os.html (ou direto no navegador)");
})().catch(e => { console.error(e); process.exit(1); });
