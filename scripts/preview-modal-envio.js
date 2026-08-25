// Gera um preview estático do modal "Enviar orçamento por e-mail".
//
// ⚠️ A FUNÇÃO É RECORTADA DO `public/admin.js` EM TEMPO DE GERAÇÃO, nunca
// copiada à mão. Um preview com markup duplicado começa fiel e mente na
// primeira edição — e aí ele passa a atestar uma tela que não existe mais.
//
// O modal exige sessão de admin para abrir no sistema de verdade, e o envio
// dispara e-mail real; este preview existe para olhar composição e texto sem
// nenhuma das duas coisas. `fetch` é dublê e devolve dados de exemplo.
//
// Uso: node scripts/preview-modal-envio.js  →  public/_preview-envio.html

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const admin = fs.readFileSync(path.join(RAIZ, "public/admin.js"), "utf8");

const INICIO = "async function _avAbrirEnvioEmail() {";
const i = admin.indexOf(INICIO);
if (i === -1) throw new Error("_avAbrirEnvioEmail não encontrada em public/admin.js");

// A função termina na primeira linha que é só "}" na coluna 0.
const resto = admin.slice(i);
const fim = resto.search(/\n\}\n/);
if (fim === -1) throw new Error("fim da função não encontrado");
const funcao = resto.slice(0, fim + 3);

const CENARIOS = {
  painel: {
    rotulo: "Condomínio com dois usuários no painel (e um e-mail só no cadastro)",
    dest: {
      usuarios: [
        { nome: "Edmilson Rocha", email: "sindico@edificiosolar.com.br" },
        { nome: "Marta Lima", email: "administracao@edificiosolar.com.br" },
      ],
      cadastrados: ["sindico@edificiosolar.com.br", "portaria@edificiosolar.com.br"],
      tem_condominio: true,
    },
  },
  semLogin: {
    rotulo: "Condomínio sem nenhum usuário — só resta a carta",
    dest: { usuarios: [], cadastrados: ["contato@residencialaurora.com.br"], tem_condominio: true },
  },
};

const html = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Preview · modal de envio</title>
<link rel="stylesheet" href="/static/admin.css" />
<style>
  body { margin:0; padding:18px; font-family:system-ui, sans-serif; }
  .previewBarra { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
  .previewBarra b { font-size:13px; opacity:.75; }
  .modalOverlay { position:static !important; inset:auto !important; background:none !important; padding:0 !important; }
</style>
</head>
<body>
  <div class="previewBarra">
    <b>Cenário:</b>
    <button class="btn" data-cen="painel">Com usuários no painel</button>
    <button class="btn" data-cen="semLogin">Sem usuários</button>
    <span id="previewRot" style="font-size:12px;opacity:.6;"></span>
  </div>
  <div id="palco"></div>

<script src="/static/_preview-envio.js"></script>
</body>
</html>`;

// ⚠️ O JS VAI EM ARQUIVO SEPARADO, NÃO INLINE.
// O helmet do app manda `script-src 'self'`: script inline é bloqueado sem
// aviso no console, e a página abre vazia como se nada tivesse acontecido.
// `/static` serve `.js` normalmente — quem está bloqueado ali é `.html`.
const js = `const CENARIOS = ${JSON.stringify(CENARIOS, null, 2)};
let _cenario = "painel";

// ── dublês do que o admin.js real fornece ───────────────────────────────
const _avSelecionado = { id: 123, numero: "OR-000123", condominio_nome: "Edifício Solar" };
const _avData = [];
function authHeaders() { return {}; }
function _avRenderTudo() {}
function _avRenderPainel() {}
function lerRespostaJson(r) { return r.json(); }
function _waEscaparHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function _avPrepararAssinatura() { return Promise.resolve(""); }

// O envio nunca acontece aqui: é preview, e o endpoint manda e-mail de verdade.
window.fetch = async (url) => {
  if (String(url).includes("/destinatarios")) {
    return { ok: true, json: async () => CENARIOS[_cenario].dest };
  }
  if (String(url).includes("/me/email-template")) {
    return { ok: true, json: async () => ({
      email_mensagem: "Prezado(a),\\n\\nSegue em anexo o orçamento referente ao seu condomínio.\\n\\nQualquer dúvida, estamos à disposição.",
      assinatura_email_url: "",
    }) };
  }
  return { ok: false, json: async () => ({ error: "preview: envio desativado" }) };
};

${funcao}

async function montar() {
  document.querySelectorAll(".modalOverlay").forEach(n => n.remove());
  document.getElementById("previewRot").textContent = CENARIOS[_cenario].rotulo;
  await _avAbrirEnvioEmail();
  // Tira o overlay do fixed e encaixa no palco, para caber no screenshot.
  const ov = document.querySelector(".modalOverlay");
  if (ov) document.getElementById("palco").appendChild(ov);
}
document.querySelectorAll("[data-cen]").forEach(b =>
  b.addEventListener("click", () => { _cenario = b.dataset.cen; montar(); }));
montar();
`;

fs.writeFileSync(path.join(RAIZ, "public/_preview-envio.html"), html, "utf8");
fs.writeFileSync(path.join(RAIZ, "public/_preview-envio.js"), js, "utf8");
console.log("gerado: public/_preview-envio.html + .js");
console.log("função recortada:", funcao.split("\n").length, "linhas");
