// src/routes/jobs.routes.js
const express = require("express");
const { authRequired } = require("../middleware/authRequired");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const { jobVerificarOffline } = require("../jobs/offline.job");

const router = express.Router();

// Disparo manual do job de OFFLINE. `masterAdminOnly` desde 27/08/2026, junto
// com os outros três em `/admin/jobs/*/run` — rodar job é manutenção, e não
// havia razão para este ser o único da família ao alcance do operador. O botão
// que o chamava (`rodarJobOffline`) já era código morto no `admin.js`.
router.post("/verificar-offline", authRequired, masterAdminOnly, async (req, res) => {
  try {
    const resultado = await jobVerificarOffline();
    return res.json(resultado);
  } catch (error) {
    console.error("Erro ao verificar offline:", error);
    return res.status(500).json({ error: "Erro ao verificar offline" });
  }
});

module.exports = { jobsRouter: router };