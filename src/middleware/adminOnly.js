function adminOnly(req, res, next) {
  const r = req.user?.role;
  if (r !== "admin" && r !== "admin_viewer") {
    return res.status(403).json({ error: "Acesso restrito (admin)" });
  }
  next();
}

module.exports = { adminOnly };