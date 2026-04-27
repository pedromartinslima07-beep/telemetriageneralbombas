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

// Deriva nivel (string) a partir de nivel_pct (0-100)
const nivelFromPct = (pct) => {
  if (pct >= 70) return "alto";
  if (pct >= 45) return "medio";
  if (pct >= 20) return "baixo";
  return "muito_baixo";
};

// Calcula nivel_pct a partir do valor ADC bruto + calibração do reservatório
const calcularNivelPct = (adcRaw, calibracao) => {
  const { adc_zero, adc_por_metro, altura_total_m } = calibracao;
  const alturaAgua = (adcRaw - adc_zero) / adc_por_metro;
  const pct = (alturaAgua / altura_total_m) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
};

router.post("/", telemetriaLimiter, async (req, res) => {
  const { device_id, adc_raw: adcRawInput, bomba_ligada } = req.body;

  // ── device_id ──
  if (typeof device_id !== "string" || device_id.trim().length < 3) {
    return res.status(400).json({ error: "device_id inválido" });
  }

  // ── bomba_ligada ──
  if (typeof bomba_ligada !== "boolean") {
    return res.status(400).json({ error: "bomba_ligada deve ser boolean (true/false)" });
  }

  // ── adc_raw ──
  const adcRaw = Number(adcRawInput);
  if (!Number.isInteger(adcRaw) || adcRaw < 0) {
    return res.status(400).json({ error: "adc_raw deve ser inteiro >= 0" });
  }

  // ── chave do device ──
  const deviceKeyHeader = req.headers["x-device-key"];
  if (!deviceKeyHeader) {
    return res.status(401).json({ error: "Chave do dispositivo ausente (X-Device-Key)" });
  }

  try {
    // 1 query: reservatório + última leitura (substitui 2 round-trips)
    const rRes = await pool.query(
      `SELECT r.id, r.condominio_id, r.device_id, r.device_key,
              r.altura_total_m, r.adc_zero, r.adc_por_metro,
              ul.nivel       AS last_nivel,
              ul.nivel_pct   AS last_nivel_pct,
              ul.criado_em   AS last_criado_em
       FROM reservatorios r
       LEFT JOIN LATERAL (
         SELECT nivel, nivel_pct, criado_em
         FROM leituras
         WHERE device_id = r.device_id
         ORDER BY criado_em DESC
         LIMIT 1
       ) ul ON true
       WHERE r.device_id = $1
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

    // ── Calibração ──
    if (!reservatorio.altura_total_m || !reservatorio.adc_zero || !reservatorio.adc_por_metro) {
      return res.status(422).json({
        error: "Reservatório sem calibração configurada. Configure altura_total_m, adc_zero e adc_por_metro no painel admin.",
      });
    }

    const nivelPct = calcularNivelPct(adcRaw, reservatorio);
    const nivelNormalizado = nivelFromPct(nivelPct);

    // ── Threshold: só grava leitura se nivel_pct mudou ≥ X% ou passou ≥ N min ──
    const pctThreshold = Number(process.env.TELEMETRIA_PCT_THRESHOLD ?? 5);
    const heartbeatMin = Number(process.env.TELEMETRIA_HEARTBEAT_MIN ?? 10);

    let deveGravar = true;
    if (reservatorio.last_criado_em != null) {
      const diffPct = Math.abs(nivelPct - (reservatorio.last_nivel_pct ?? 0));
      const minutosSemGravar = (Date.now() - new Date(reservatorio.last_criado_em).getTime()) / 60000;
      deveGravar = diffPct >= pctThreshold || minutosSemGravar >= heartbeatMin;
    }

    // CTE única: INSERT (condicional) + UPDATE last_seen + resolve alerta offline
    if (deveGravar) {
      await pool.query(
        `WITH ins AS (
           INSERT INTO leituras (device_id, nivel, bomba_ligada, nivel_pct, adc_raw)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING device_id
         ),
         upd_res AS (
           UPDATE reservatorios SET last_seen = NOW() WHERE device_id = $1 RETURNING device_id
         )
         UPDATE alertas SET status = 'resolvido'
         WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'`,
        [device_id, nivelNormalizado, bomba_ligada, nivelPct, adcRaw]
      );
    } else {
      await pool.query(
        `WITH upd_res AS (
           UPDATE reservatorios SET last_seen = NOW() WHERE device_id = $1 RETURNING device_id
         )
         UPDATE alertas SET status = 'resolvido'
         WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'`,
        [device_id]
      );
    }

    // ── Alertas de nível ──
    // Pula UPDATEs de "resolvido" quando o nível não mudou (são no-op nesse caso).
    // upsertAlertaAberto roda sempre que nivel é baixo/muito_baixo, preservando
    // a auto-reabertura caso um admin tenha fechado o alerta manualmente.
    const nivelMudou = reservatorio.last_nivel !== nivelNormalizado;

    if (nivelMudou) {
      if (nivelNormalizado === "medio" || nivelNormalizado === "alto") {
        await pool.query(
          "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo IN ('nivel_baixo','nivel_muito_baixo') AND status = 'aberto'",
          [device_id]
        );
      } else if (nivelNormalizado === "baixo") {
        await pool.query(
          "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'nivel_muito_baixo' AND status = 'aberto'",
          [device_id]
        );
      } else if (nivelNormalizado === "muito_baixo") {
        await pool.query(
          "UPDATE alertas SET status = 'resolvido' WHERE device_id = $1 AND tipo = 'nivel_baixo' AND status = 'aberto'",
          [device_id]
        );
      }
    }

    if (nivelNormalizado === "baixo") {
      await upsertAlertaAberto(
        device_id,
        "nivel_baixo",
        `Nível baixo detectado no dispositivo ${device_id}`
      );
    } else if (nivelNormalizado === "muito_baixo") {
      await upsertAlertaAberto(
        device_id,
        "nivel_muito_baixo",
        `NÍVEL MUITO BAIXO detectado no dispositivo ${device_id}`
      );
    }

    return res.json({
      status: "Dados salvos com sucesso",
      gravado: deveGravar,
      nivel_pct: nivelPct,
      nivel: nivelNormalizado,
    });
  } catch (error) {
    console.error("Erro no /telemetria:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco" });
  }
});

module.exports = { telemetriaRouter: router };
