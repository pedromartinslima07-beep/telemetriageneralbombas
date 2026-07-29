// Nível intermediário de acesso: admin master + gerente, SEM operador.
//
// Os três níveis do painel:
//   adminOnly       → admin, gerente, operador  (entrar no painel, monitorar, chamados)
//   gestaoOnly      → admin, gerente            (operação do negócio: planos, contratos)
//   masterAdminOnly → admin                     (irreversível: apagar cliente, mexer em
//                                                reservatório, usuários, config, jobs)
//
// Existe porque `adminOnly` também deixa o operador passar — usar `adminOnly`
// para "liberar pro gerente" libera pro operador junto.
const GESTAO_ROLES = ["admin", "gerente"];

function gestaoOnly(req, res, next) {
  if (!GESTAO_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Acesso restrito (gestão)" });
  }
  next();
}

module.exports = { gestaoOnly, GESTAO_ROLES };
