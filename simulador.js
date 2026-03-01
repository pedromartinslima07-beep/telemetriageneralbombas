require("dotenv").config();

// Configuráveis via .env
const DEVICE_ID = process.env.SIM_DEVICE_ID || "TESTE001";
const DEVICE_KEY = process.env.DEVICE_KEY;
const URL = process.env.SIM_API_URL || "http://localhost:3001/telemetria";
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS || 5000);

if (!DEVICE_KEY) {
  console.error("❌ Defina DEVICE_KEY no .env ou via terminal.");
  console.error("Ex: $env:DEVICE_KEY='xxxx'  (PowerShell)");
  process.exit(1);
}

if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 500) {
  console.error("❌ SIM_INTERVAL_MS inválido. Use >= 500");
  process.exit(1);
}

const niveis = ["alto", "medio", "baixo", "muito_baixo"];
let i = 0;

async function enviar() {
  const nivel = niveis[i % niveis.length];
  const bomba_ligada = (nivel === "baixo" || nivel === "muito_baixo");

  const payload = {
    device_id: DEVICE_ID,
    nivel,
    bomba_ligada
  };

  try {
    const r = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": DEVICE_KEY,
      },
      body: JSON.stringify(payload),
    });

    const txt = await r.text();
    const ok = r.ok ? "✅" : "❌";

    console.log(
      `${ok} ${new Date().toLocaleTimeString()} ->`,
      payload,
      "->",
      r.status,
      txt
    );

  } catch (e) {
    console.log("❌ erro de conexão:", e.message);
  }

  i++;
}

console.log("🧪 Simulador iniciado com:");
console.log({
  DEVICE_ID,
  URL,
  INTERVAL_MS
});

setInterval(enviar, INTERVAL_MS);
enviar();