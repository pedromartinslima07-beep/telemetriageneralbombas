// Quarto nível de acesso: qualquer pessoa da empresa, técnico incluído.
//
// Os níveis do painel (ver adminOnly.js / gestaoOnly.js):
//   equipeInterna   → admin, gerente, operador, tecnico
//   adminOnly       → admin, gerente, operador
//   gestaoOnly      → admin, gerente
//   masterAdminOnly → admin
//
// Existe por causa da ficha do equipamento (`/e/:codigo`): quem escaneia a
// etiqueta na bancada é o técnico, que NÃO passa em `adminOnly`. E `cliente`
// não pode passar de jeito nenhum — a ficha mostra endereço e histórico de
// outro condomínio que não o dele. Por isso é uma allowlist explícita, não um
// "authRequired sem guard".
const EQUIPE_ROLES = ["admin", "gerente", "operador", "tecnico"];

function equipeInterna(req, res, next) {
  if (!EQUIPE_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Acesso restrito à equipe" });
  }
  next();
}

module.exports = { equipeInterna, EQUIPE_ROLES };
