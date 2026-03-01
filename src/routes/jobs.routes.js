// src/routes/jobs.routes.js
const express = require("express");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { jobVerificarOffline } = require("../jobs/offline.job");

const router = express.Router();

router.post("/verificar-offline", authRequired, adminOnly, async (req, res) => {
  try {
    const resultado = await jobVerificarOffline();
    return res.json(resultado);
  } catch (error) {
    console.error("Erro ao verificar offline:", error);
    return res.status(500).json({ error: "Erro ao verificar offline" });
  }
});

module.exports = { jobsRouter: router };