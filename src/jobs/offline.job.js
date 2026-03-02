// src/jobs/offline.job.js
const { pool } = require("../db");
const { upsertAlertaAberto } = require("../services/alertas.service");

async function jobVerificarOffline() {
  const reservatoriosRes = await pool.query(
    `SELECT id, condominio_id, nome, tipo, device_id
     FROM reservatorios
     ORDER BY id ASC`
  );

  const reservatorios = reservatoriosRes.rows;

  const limiteMinutos = 10;
  const agora = new Date();

  let criados = 0;
  let ja_existia = 0;
  let ignorados_sem_leitura = 0;

  for (const r of reservatorios) {
    const ultimaLeituraResult = await pool.query(
      "SELECT criado_em FROM leituras WHERE device_id = $1 ORDER BY criado_em DESC LIMIT 1",
      [r.device_id]
    );

    if (ultimaLeituraResult.rows.length === 0) {
      ignorados_sem_leitura++;
      continue;
    }

    const ultima = new Date(ultimaLeituraResult.rows[0].criado_em);
    const diffMs = agora - ultima;
    const minutos_sem_atualizar = Math.floor(diffMs / 60000);

    const offline = minutos_sem_atualizar > limiteMinutos;
    if (!offline) continue;

    const nomeReservatorio = r.nome || "Reservatório";
    const tipoReservatorio = r.tipo ? ` (${r.tipo})` : "";

    const resultado = await upsertAlertaAberto(
      r.device_id,
      "dispositivo_offline",
      `${nomeReservatorio}${tipoReservatorio} (${r.device_id}) está OFFLINE há ${minutos_sem_atualizar} minutos`
    );

    if (resultado.action === "inserted") criados++;
    else ja_existia++;
  }

  return { ok: true, limiteMinutos, criados, ja_existia, ignorados_sem_leitura };
}

function startOfflineScheduler({ intervalMs = 60_000 } = {}) {
  setInterval(async () => {
    const client = await pool.connect();
    try {
      const lockResult = await client.query(
        "SELECT pg_try_advisory_lock(987654321) AS locked"
      );
      if (!lockResult.rows[0].locked) return;

      const r = await jobVerificarOffline();
      console.log("🛰️ Job OFFLINE automático:", r);
    } catch (e) {
      console.error("❌ Job OFFLINE automático falhou:", e);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(987654321)");
      } catch {}
      client.release();
    }
  }, intervalMs);
}

module.exports = { jobVerificarOffline, startOfflineScheduler };