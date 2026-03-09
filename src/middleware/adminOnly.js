function adminOnly(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "admin_viewer") {
    return res.status(403).json({ error: "Acesso restrito (admin)" });
  }
  next();
}

module.exports = { adminOnly };