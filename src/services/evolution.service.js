const https = require("https");
const http = require("http");
const { URL } = require("url");

async function enviarMensagem(telefone, texto) {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    console.warn("[evolution] variáveis não configuradas — mensagem não enviada");
    return;
  }

  const url = new URL(`/message/sendText/${instance}`, baseUrl);
  const body = JSON.stringify({
    number: telefone,
    text: texto,
  });

  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          apikey: apiKey,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );

    req.on("error", (err) => {
      console.error("[evolution] erro ao enviar mensagem:", err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// Checa estado de conexão da instância via GET /instance/connectionState/:instance
// Usado em /admin/integracoes/status pra mostrar cor verde/amarelo/vermelho no painel.
async function checarStatusConexao() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    return { ok: false, configurado: false, mensagem: "Variáveis EVOLUTION_* não configuradas" };
  }

  const url = new URL(`/instance/connectionState/${instance}`, baseUrl);
  return new Promise((resolve) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "GET",
        headers: { apikey: apiKey },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const state = json?.instance?.state || json?.state || "unknown";
            resolve({ ok: state === "open", configurado: true, estado: state, http: res.statusCode });
          } catch (_) {
            resolve({ ok: false, configurado: true, mensagem: "Resposta inválida da Evolution API", http: res.statusCode });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, configurado: true, mensagem: err.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, configurado: true, mensagem: "Timeout" }); });
    req.end();
  });
}

module.exports = { enviarMensagem, checarStatusConexao };
