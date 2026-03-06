const rateLimit = require("express-rate-limit");
const express = require("express");
const { pool } = require("../db");
const { upsertAlertaAberto } = require("../services/alertas.service");

const router = express.Router();

const telemetriaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // 120 req/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Reduza a frequência da telemetria." },
});

// Converte string de nível para enum normalizado
const normalizeNivel = (raw) => {
  if (typeof raw !== "string") return null;
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  const map = {
    alto: "alto", cheia: "alto",
    medio: "medio", meia: "medio",
    baixo: "baixo",
    muito_baixo: "muito_baixo", muitobaixo: "muito_baixo",
    critico: "muito_baixo", minimo: "muito_baixo",
  };
  return map[s] || null;
};

// Deriva nivel (string) a partir de nivel_pct (0-100)
const nivelFromPct = (pct) => {
  if (pct >= 70) return "alto";
  if (pct >= 45) return "medio";
  if (pct >= 20) return "baixo";
  return "muito_baixo";
};

// Deriva nivel_pct aproximado a partir de nivel (string) — para dispositivos legados
const pctFromNivel = (nivel) => {
  const map = { alto: 85, medio: 60, baixo: 30, muito_baixo: 10 };
  return map[nivel] ?? null;
};

router.post("/", telemetriaLimiter, async (req, res) => {
  const { device_id, nivel: nivelRaw, nivel_pct: nivelPctRaw, bomba_ligada } = req.body;

  // ── device_id ──
  if (typeof device_id !== "string" || device_id.trim().length < 3) {
    return res.status(400).json({ error: "device_id inválido" });
  }

  // ── bomba_ligada ──
  if (typeof bomba_ligada !== "boolean") {
    return res.status(400).json({ error: "bomba_ligada deve ser boolean (true/false)" });
  }

  // ── nivel / nivel_pct — aceita qualquer um dos dois ──
  let nivelNormalizado = null;
  let nivelPct = null;

  const pctProvided = nivelPctRaw !== undefined && nivelPctRaw !== null;
  const nivelProvided = nivelRaw !== undefined && nivelRaw !== null;

  if (pctProvided) {
    const pct = Number(nivelPctRaw);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "nivel_pct deve ser inteiro entre 0 e 100" });
    }
    nivelPct = pct;
    nivelNormalizado = nivelFromPct(pct);
  } else if (nivelProvided) {
    nivelNormalizado = normalizeNivel(nivelRaw);
    if (!nivelNormalizado) {
      return res.status(400).json({
        error: "nivel inválido. Use: alto, medio, baixo, muito_baixo — ou envie nivel_pct (0-100)",
      });
    }
    nivelPct = pctFromNivel(nivelNormalizado);
  } else {
    return res.status(400).json({ error: "Envie nivel (string) ou nivel_pct (0-100)" });
  }

  // ── chave do device ──
  const deviceKeyHeader = req.headers["x-device-key"];
  if (!deviceKeyHeader) {
    return res.status(401).json({ error: "Chave do dispositivo ausente (X-Device-Key)" });
  }

  try {
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

    // ── Threshold: só grava leitura se nivel_pct mudou ≥ X% ou passou ≥ N min ──
    const pctThreshold   = Number(process.env.TELEMETRIA_PCT_THRESHOLD  ?? 5);
    const heartbeatMin   = Number(process.env.TELEMETRIA_HEARTBEAT_MIN  ?? 10);

    const lastRes = await pool.query(
      `SELECT nivel_pct, criado_em FROM leituras
       WHERE device_id = $1
       ORDER BY criado_em DESC
       LIMIT 1`,
      [device_id]
    );

    let deveGravar = true;
    if (lastRes.rows.length > 0) {
      const last = lastRes.rows[0];
      const diffPct      = Math.abs((nivelPct ?? 0) - (last.nivel_pct ?? 0));
      const minutosSemGravar = (Date.now() - new Date(last.criado_em).getTime()) / 60000;
      deveGravar = diffPct >= pctThreshold || minutosSemGravar >= heartbeatMin;
    }

    if (deveGravar) {
      await pool.query(
        "INSERT INTO leituras (device_id, nivel, bomba_ligada, nivel_pct) VALUES ($1, $2, $3, $4)",
        [device_id, nivelNormalizado, bomba_ligada, nivelPct]
      );
    }

    // Atualiza last_seen (sempre, independente de gravar)
    await pool.query(
      "UPDATE reservatorios SET last_seen = NOW() WHERE device_id = $1",
      [device_id]
    );

    // Fecha alerta offline se existir (sempre)
    await pool.query(
      "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'",
      [device_id]
    );

    // ── Alertas de nível (sempre) ──
    if (nivelNormalizado === "medio" || nivelNormalizado === "alto") {
      await pool.query(
        "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo IN ('nivel_baixo','nivel_muito_baixo') AND status = 'aberto'",
        [device_id]
      );
    }

    if (nivelNormalizado === "baixo") {
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

    if (nivelNormalizado === "muito_baixo") {
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

    return res.json({ status: "Dados salvos com sucesso", gravado: deveGravar });
  } catch (error) {
    console.error("Erro no /telemetria:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco" });
  }
});

module.exports = { telemetriaRouter: router };
