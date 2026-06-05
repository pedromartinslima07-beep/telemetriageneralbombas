const ADMIN_ROLES = ["admin", "gerente", "operador"];

function adminOnly(req, res, next) {
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Acesso restrito (admin)" });
  }
  next();
}

module.exports.ADMIN_ROLES = ADMIN_ROLES;

module.exports = { adminOnly };