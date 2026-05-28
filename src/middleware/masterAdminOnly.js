function masterAdminOnly(req, res, next) {
  const r = req.user?.role;
  if (r !== "admin") {
    return res.status(403).json({ error: "Acesso restrito (admin master)" });
  }
  next();
}

module.exports = { masterAdminOnly };
