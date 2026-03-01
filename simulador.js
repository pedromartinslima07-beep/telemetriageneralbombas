require("dotenv").config();

const URL = process.env.SIM_URL || "http://localhost:3001/telemetria";
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS || 5000);

const IDS = String(process.env.SIM_DEVICE_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const KEYS = String(process.env.SIM_DEVICE_KEYS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (IDS.length === 0 || KEYS.length === 0) {
  console.error("❌ Defina SIM_DEVICE_IDS e SIM_DEVICE_KEYS no .env");
  console.error("Ex: SIM_DEVICE_IDS=COND001,COND002,COND003");
  console.error("Ex: SIM_DEVICE_KEYS=key1,key2,key3");
  process.exit(1);
}

if (IDS.length !== KEYS.length) {
  console.error("❌ Quantidade de IDs e KEYS não bate.");
  console.error("IDs:", IDS.length, "KEYS:", KEYS.length);
  process.exit(1);
}

const niveis = ["alto", "medio", "baixo", "muito_baixo"];

function makeDeviceSender(device_id, device_key) {
  let i = 0;

  return async function enviar() {
    const nivel = niveis[i % niveis.length];
    const bomba_ligada = (nivel === "baixo" || nivel === "muito_baixo");

    const payload = { device_id, nivel, bomba_ligada };

    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": device_key,
        },
        body: JSON.stringify(payload),
      });

      const txt = await r.text();
      const ok = r.ok ? "✅" : "❌";

      console.log(`${ok} [${device_id}] ${new Date().toLocaleTimeString()} -> ${nivel} bomba=${bomba_ligada} -> ${r.status} ${txt}`);
    } catch (e) {
      console.log(`❌ [${device_id}] erro de conexão:`, e.message);
    }

    i++;
  };
}

console.log("Simulador MULTI rodando:", { URL, INTERVAL_MS, devices: IDS });

const senders = IDS.map((id, idx) => makeDeviceSender(id, KEYS[idx]));

// dispara 1 vez cada, com pequeno atraso pra não mandar tudo no mesmo ms
senders.forEach((fn, idx) => setTimeout(fn, idx * 300));

// loop
setInterval(() => {
  senders.forEach(fn => fn());
}, INTERVAL_MS);