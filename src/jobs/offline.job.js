// src/jobs/offline.job.js
const { pool } = require("../db");
const { upsertAlertaAberto } = require("../services/alertas.service");

async function jobVerificarOffline() {
  const limiteMinutos = Number(process.env.OFFLINE_MINUTES || 10);

  // 1 query: usa last_seen (atualizado em toda telemetria, mesmo sem gravar leitura)
  const res = await pool.query(
    `SELECT id, nome, tipo, device_id, last_seen,
       FLOOR(EXTRACT(EPOCH FROM (NOW() - last_seen)) / 60)::int AS minutos_sem_atualizar
     FROM reservatorios
     ORDER BY id ASC`
  );

  let criados = 0;
  let ja_existia = 0;
  let ignorados_sem_leitura = 0;

  for (const r of res.rows) {
    if (!r.last_seen) {
      ignorados_sem_leitura++;
      continue;
    }

    if (r.minutos_sem_atualizar <= limiteMinutos) continue;

    const nomeReservatorio = r.nome || "Reservatório";
    const tipoReservatorio = r.tipo ? ` (${r.tipo})` : "";

    const resultado = await upsertAlertaAberto(
      r.device_id,
      "dispositivo_offline",
      `${nomeReservatorio}${tipoReservatorio} (${r.device_id}) está OFFLINE há ${r.minutos_sem_atualizar} minutos`
    );

    if (resultado.action === "inserted") criados++;
    else ja_existia++;
  }

  return { ok: true, limiteMinutos, criados, ja_existia, ignorados_sem_leitura };
}

let _jobRunning = false;

function startOfflineScheduler({ intervalMs = 60_000 } = {}) {
  setInterval(async () => {
    if (_jobRunning) return;
    _jobRunning = true;
    try {
      const r = await jobVerificarOffline();
      console.log("🛰️ Job OFFLINE automático:", r);
    } catch (e) {
      console.error("❌ Job OFFLINE automático falhou:", e);
    } finally {
      _jobRunning = false;
    }
  }, intervalMs);
}

module.exports = { jobVerificarOffline, startOfflineScheduler };