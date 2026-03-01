function clienteOnly(req, res, next) {
  if (req.user?.role !== "cliente") {
    return res.status(403).json({ error: "Acesso restrito (cliente)" });
  }
  next();
}

module.exports = { clienteOnly };