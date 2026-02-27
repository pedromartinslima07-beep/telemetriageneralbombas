// simulador.js
const DEVICE_ID = "TESTE001";
const DEVICE_KEY = process.env.DEVICE_KEY; // vamos passar no comando
const URL = "http://localhost:3001/telemetria";

if (!DEVICE_KEY) {
  console.error("❌ Defina DEVICE_KEY antes. Ex: set DEVICE_KEY=xxxx (Windows) ou $env:DEVICE_KEY='xxxx'");
  process.exit(1);
}

const niveis = ["alto", "medio", "baixo", "muito_baixo"];
let i = 0;

async function enviar() {
  const nivel = niveis[i % niveis.length];
  const bomba_ligada = (nivel === "baixo" || nivel === "muito_baixo");

  const payload = { device_id: DEVICE_ID, nivel, bomba_ligada };

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
    console.log(`${ok} ${new Date().toLocaleTimeString()} ->`, payload, "->", r.status, txt);
  } catch (e) {
    console.log("❌ erro de conexão:", e.message);
  }

  i++;
}

console.log("Simulador rodando:", { DEVICE_ID, URL });
setInterval(enviar, 5000); // a cada 5s (troca se quiser)
enviar();