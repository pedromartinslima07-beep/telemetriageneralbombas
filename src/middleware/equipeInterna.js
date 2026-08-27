// Nível transversal: quem mexe em equipamento — gestão + técnico de campo.
// NÃO é um degrau da escada de privilégio: cruza `adminOnly` (o operador está
// fora daqui de propósito, desde 27/08/2026) e alcança o técnico, que está
// fora de `adminOnly`.
//
// Os níveis do painel (ver adminOnly.js / gestaoOnly.js):
//   equipeInterna   → admin, gerente, tecnico
//   adminOnly       → admin, gerente, operador
//   gestaoOnly      → admin, gerente
//   masterAdminOnly → admin
//
// O `operador` saiu quando a restrição do perfil deixou de ser só de UI: a
// oficina não é tela dele, e `equipeInterna` era o último caminho por onde
// ele ainda alcançava equipamento pela API.
//
// Existe por causa da ficha do equipamento (`/e/:codigo`): quem escaneia a
// etiqueta na bancada é o técnico, que NÃO passa em `adminOnly`. E `cliente`
// não pode passar de jeito nenhum — a ficha mostra endereço e histórico de
// outro condomínio que não o dele. Por isso é uma allowlist explícita, não um
// "authRequired sem guard".
const EQUIPE_ROLES = ["admin", "gerente", "tecnico"];

function equipeInterna(req, res, next) {
  if (!EQUIPE_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Acesso restrito à equipe" });
  }
  next();
}

module.exports = { equipeInterna, EQUIPE_ROLES };
