// Painel novo só para alguns logins (20/11/2026).
//
// O redesenho do admin (branch feature/admin-condominio) e a emissão pelo Omie
// sobem para produção liberados só para os e-mails da variável PAINEL_NOVO
// (lista separada por vírgula; "*" = todo mundo). Quem não está na lista
// continua no painel de antes, servido da cópia congelada em public/legado/
// (é o admin da main em 288abad). Ver docs/modulos/painel-novo.md.
//
// Como a página sabe quem é: o token mora no localStorage, então o GET
// /admin/painel não traz login nenhum. Quem traz é o cookie `gb_painel`, que
// o GET /auth/painel grava (com o token) e que leva o e-mail assinado com o
// JWT_SECRET. O servidor confere a assinatura E a lista a cada pedido da
// página: tirar o e-mail da PAINEL_NOVO devolve a pessoa ao painel antigo no
// próximo carregamento, sem precisar sair e entrar.
//
// ⚠️ O cookie só escolhe a TELA. O que grava no Omie é barrado no servidor
// pelo `painelNovoOnly`, que lê o e-mail do token, não o cookie.
const crypto = require("crypto");
const path = require("path");

const COOKIE = "gb_painel";

function lista() {
  return String(process.env.PAINEL_NOVO || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function liberado(email) {
  const l = lista();
  if (l.includes("*")) return true;
  const e = String(email || "").trim().toLowerCase();
  return !!e && l.includes(e);
}

function _assinatura(email) {
  return crypto
    .createHmac("sha256", String(process.env.JWT_SECRET || ""))
    .update("painel-novo:" + email)
    .digest("hex")
    .slice(0, 32);
}

function valorCookie(email) {
  const e = String(email || "").trim().toLowerCase();
  return Buffer.from(e, "utf8").toString("base64url") + "." + _assinatura(e);
}

function emailDoCookie(valor) {
  if (!valor || typeof valor !== "string") return null;
  const [b64, ass] = valor.split(".");
  if (!b64 || !ass) return null;
  let email;
  try { email = Buffer.from(b64, "base64url").toString("utf8"); } catch { return null; }
  const certa = Buffer.from(_assinatura(email));
  const veio = Buffer.from(ass);
  if (certa.length !== veio.length || !crypto.timingSafeEqual(certa, veio)) return null;
  return email;
}

// "novo" | "antigo" para o pedido da página (lê o cookie).
function painelDaRequisicao(req) {
  const email = emailDoCookie(req.cookies?.[COOKIE]);
  return email && liberado(email) ? "novo" : "antigo";
}

// O arquivo que o GET /admin/painel entrega para este pedido.
function paginaDoPainel(req) {
  return painelDaRequisicao(req) === "novo"
    ? path.join(__dirname, "../../public/admin.html")
    : path.join(__dirname, "../../public/legado/admin.html");
}

// Só o painel do admin muda; as outras roles não têm painel novo.
function painelDoUsuario(user) {
  if (!user || !["admin", "gerente"].includes(user.role)) return "antigo";
  return liberado(user.email) ? "novo" : "antigo";
}

function painelNovoOnly(req, res, next) {
  if (!liberado(req.user?.email)) {
    return res.status(403).json({
      error: "Disponível só no painel novo (este login não está liberado).",
    });
  }
  next();
}

module.exports = {
  COOKIE,
  lista,
  liberado,
  valorCookie,
  emailDoCookie,
  painelDaRequisicao,
  paginaDoPainel,
  painelDoUsuario,
  painelNovoOnly,
};
