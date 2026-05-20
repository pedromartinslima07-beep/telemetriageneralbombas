// General Bombas — App mobile (Capacitor)
// Fase 7A: estrutura inicial. Login, chamados, O.S. e GPS vem nas proximas fases.

// API base — detecta o ambiente:
//   capacitor:// (Android/iOS empacotado) → URL de producao
//   http(s):// (browser dev) → mesmo origin (Express serve /app/* + APIs)
const API_BASE = (() => {
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "file:") {
    return window.GB_API_BASE || "https://general-bombas.app";
  }
  return window.location.origin;
})();

const IS_CAPACITOR = window.location.protocol === "capacitor:";

document.getElementById("apiBase").textContent = API_BASE;
document.getElementById("envInfo").textContent = IS_CAPACITOR ? "Capacitor (nativo)" : "Browser (dev)";

// Relogio no rodape
function atualizarRelogio() {
  const now = new Date();
  const hora = now.toLocaleTimeString("pt-BR");
  const data = now.toLocaleDateString("pt-BR");
  document.getElementById("now").textContent = `${data} ${hora}`;
}
atualizarRelogio();
setInterval(atualizarRelogio, 1000);

// Botao "Verificar conexao"
document.getElementById("btnPing").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const status = document.getElementById("pingStatus");

  btn.disabled = true;
  status.className = "ping-status show loading";
  status.textContent = "Verificando…";

  const inicio = Date.now();
  try {
    const r = await fetch(`${API_BASE}/health`, {
      headers: { "Accept": "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const ms = Date.now() - inicio;
    status.className = "ping-status show success";
    status.textContent = `✓ Servidor respondeu em ${ms}ms — ${JSON.stringify(data)}`;
  } catch (err) {
    status.className = "ping-status show error";
    status.textContent = `✗ ${err.message}. Backend rodando em ${API_BASE}?`;
  } finally {
    btn.disabled = false;
  }
});
