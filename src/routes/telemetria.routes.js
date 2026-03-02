const rateLimit = require("express-rate-limit");
const express = require("express");
const { pool } = require("../db"); // vem do src/db.js
const { upsertAlertaAberto } = require("../services/alertas.service");

const router = express.Router();

const telemetriaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // 120 req/min por IP (ajuste se precisar)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Reduza a frequência da telemetria." },
});

router.post("/", telemetriaLimiter, async (req, res) => {
  const { device_id, nivel, bomba_ligada } = req.body;

  // === Validação de payload (telemetria) ===
  const normalizeNivel = (raw) => {
    if (typeof raw !== "string") return null;

    const s = raw
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_");

    const map = {
      alto: "alto",
      cheia: "alto",
      medio: "medio",
      meia: "medio",
      baixo: "baixo",
      muito_baixo: "muito_baixo",
      muitobaixo: "muito_baixo",
      critico: "muito_baixo",
      minimo: "muito_baixo",
    };

    return map[s] || null;
  };

  const niveisPermitidos = ["alto", "medio", "baixo", "muito_baixo"];

  if (typeof device_id !== "string" || device_id.trim().length < 3) {
    return res.status(400).json({ error: "device_id inválido" });
  }

  if (typeof bomba_ligada !== "boolean") {
    return res
      .status(400)
      .json({ error: "bomba_ligada deve ser boolean (true/false)" });
  }

  const nivelNormalizado = normalizeNivel(nivel);
  if (!nivelNormalizado) {
    return res.status(400).json({
      error: `nivel inválido. Use: ${niveisPermitidos.join(", ")}`,
    });
  }

  const n = nivelNormalizado;

  // ✅ chave do device vem no header
  const deviceKeyHeader = req.headers["x-device-key"];
  if (!deviceKeyHeader) {
    return res
      .status(401)
      .json({ error: "Chave do dispositivo ausente (X-Device-Key)" });
  }

  try {
    // ✅ Agora valida em RESERVATORIOS (multi-reservatório)
    const rRes = await pool.query(
      `SELECT id, condominio_id, device_id, device_key
       FROM reservatorios
       WHERE device_id = $1
       LIMIT 1`,
      [device_id]
    );

    if (rRes.rows.length === 0) {
      return res.status(403).json({ error: "Dispositivo não autorizado" });
    }

    const reservatorio = rRes.rows[0];

    if (
      !reservatorio.device_key ||
      String(reservatorio.device_key) !== String(deviceKeyHeader)
    ) {
      return res.status(403).json({ error: "Chave do dispositivo inválida" });
    }

    // ✅ salva leitura (device_id = do reservatório)
    await pool.query(
      "INSERT INTO leituras (device_id, nivel, bomba_ligada) VALUES ($1, $2, $3)",
      [device_id, n, bomba_ligada]
    );

    // ✅ fecha alerta offline se existir (voltou a mandar dados)
    await pool.query(
      "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'",
      [device_id]
    );

    // ===== ALERTAS DE NÍVEL (anti-duplicação + auto-fechamento) =====
    if (n === "medio" || n === "alto") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo IN ('nivel_baixo','nivel_muito_baixo') AND status = 'aberto'",
        [device_id]
      );
    }

    if (n === "baixo") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'nivel_muito_baixo' AND status = 'aberto'",
        [device_id]
      );

      await upsertAlertaAberto(
        device_id,
        "nivel_baixo",
        `Nível baixo detectado no dispositivo ${device_id}`
      );
    }

    if (n === "muito_baixo") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'nivel_baixo' AND status = 'aberto'",
        [device_id]
      );

      await upsertAlertaAberto(
        device_id,
        "nivel_muito_baixo",
        `NÍVEL MUITO BAIXO detectado no dispositivo ${device_id}`
      );
    }

    return res.json({ status: "Dados salvos com sucesso" });
  } catch (error) {
    console.error("Erro no /telemetria:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco" });
  }
});

module.exports = { telemetriaRouter: router };