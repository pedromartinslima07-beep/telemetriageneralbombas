require("dotenv").config();

const URL = process.env.SIM_API_URL || "http://localhost:3001/telemetria";
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS || 5000);

// Configure seus dispositivos aqui:
const DEVICES = [
  {
    device_id: "COND001",
    device_key: process.env.DEVICE_KEY_1,
  },
  {
    device_id: "COND002",
    device_key: process.env.DEVICE_KEY_2,
  },
  {
    device_id: "COND003",
    device_key: process.env.DEVICE_KEY_3,
  },
];

const niveis = ["alto", "medio", "baixo", "muito_baixo"];

function criarSimulador(device) {
  if (!device.device_key) {
    console.error(`❌ DEVICE_KEY não definida para ${device.device_id}`);
    return;
  }

  let i = 0;

  async function enviar() {
    const nivel = niveis[i % niveis.length];
    const bomba_ligada = nivel === "baixo" || nivel === "muito_baixo";

    const payload = {
      device_id: device.device_id,
      nivel,
      bomba_ligada,
    };

    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": device.device_key,
        },
        body: JSON.stringify(payload),
      });

      const ok = r.ok ? "✅" : "❌";

      console.log(
        `${ok} ${device.device_id} ->`,
        payload.nivel,
        "bomba:",
        payload.bomba_ligada
      );

    } catch (e) {
      console.log(`❌ ${device.device_id} erro:`, e.message);
    }

    i++;
  }

  enviar();
  setInterval(enviar, INTERVAL_MS);
}

console.log("🧪 Simulador multi-device iniciado");

DEVICES.forEach(criarSimulador);