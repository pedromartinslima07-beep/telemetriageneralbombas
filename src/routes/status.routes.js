const express = require("express");
const router = express.Router();
const db = require("../db");

// Ajuste aqui o “tempo sem sinal” que você considera offline:
const OFFLINE_MINUTES = Number(process.env.OFFLINE_MINUTES || 15);

router.get("/:device_id", async (req, res) => {
  const { device_id } = req.params;

  try {
    // 1) Busca o reservatório pelo device_id
    const r = await db.query(
      `
      SELECT
        id,
        device_id,
        nome,
        condominio_id,
        last_seen
      FROM reservatorios
      WHERE device_id = $1
      LIMIT 1
      `,
      [device_id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Reservatório não encontrado" });
    }

    const reservatorio = r.rows[0];

    // 2) Última leitura (se existir)
    const l = await db.query(
      `
      SELECT
        id,
        nivel,
        bomba_ligada,
        created_at
      FROM leituras
      WHERE reservatorio_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [reservatorio.id]
    );

    const ultimaLeitura = l.rows[0] || null;

    // 3) Alerta aberto (se existir)
    const a = await db.query(
      `
      SELECT
        id,
        tipo,
        status,
        mensagem,
        created_at,
        updated_at
      FROM alertas
      WHERE reservatorio_id = $1
        AND status = 'ABERTO'
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [reservatorio.id]
    );

    const alertaAberto = a.rows[0] || null;

    // 4) Determina lastSeen:
    // - Se tiver reservatorios.last_seen, usa ele
    // - Senão, usa a data da última leitura
    const lastSeen =
      reservatorio.last_seen ||
      (ultimaLeitura ? ultimaLeitura.created_at : null);

    // 5) Calcula offline
    let offline = true;
    let offline_minutes = null;

    if (lastSeen) {
      const diffMs = Date.now() - new Date(lastSeen).getTime();
      offline_minutes = Math.floor(diffMs / 60000);
      offline = offline_minutes >= OFFLINE_MINUTES;
    }

    return res.json({
      device_id: reservatorio.device_id,
      reservatorio: {
        id: reservatorio.id,
        nome: reservatorio.nome,
        condominio_id: reservatorio.condominio_id,
      },
      ultima_leitura: ultimaLeitura,
      alerta_aberto: alertaAberto,
      last_seen: lastSeen,
      offline,
      offline_minutes,
      offline_threshold_minutes: OFFLINE_MINUTES,
    });
  } catch (err) {
    console.error("GET /status/:device_id error", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = { statusRouter: router };