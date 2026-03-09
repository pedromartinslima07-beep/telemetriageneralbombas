function masterAdminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito (admin master)" });
  }
  next();
}

module.exports = { masterAdminOnly };
