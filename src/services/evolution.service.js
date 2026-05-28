const https = require("https");

function _configurado() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function enviarMensagem(telefone, texto) {
  if (!_configurado()) {
    console.warn("[meta-wa] variáveis não configuradas — mensagem não enviada");
    return;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token         = process.env.WHATSAPP_ACCESS_TOKEN;
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    to:   telefone,
    type: "text",
    text: { body: texto },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "graph.facebook.com",
        path:     `/v20.0/${phoneNumberId}/messages`,
        method:   "POST",
        headers: {
          "Content-Type":  "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Authorization": `Bearer ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            console.error("[meta-wa] erro ao enviar:", res.statusCode, data);
          }
          resolve(data);
        });
      }
    );
    req.on("error", (err) => {
      console.error("[meta-wa] erro ao enviar mensagem:", err.message);
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

async function checarStatusConexao() {
  if (!_configurado()) {
    return { ok: false, configurado: false, mensagem: "Variáveis WHATSAPP_* não configuradas" };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token         = process.env.WHATSAPP_ACCESS_TOKEN;

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "graph.facebook.com",
        path:     `/v20.0/${phoneNumberId}?fields=verified_name,status`,
        method:   "GET",
        headers:  { "Authorization": `Bearer ${token}` },
        timeout:  5000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const ok = res.statusCode === 200 && !!json.verified_name;
            resolve({ ok, configurado: true, estado: ok ? "open" : "error", http: res.statusCode });
          } catch (_) {
            resolve({ ok: false, configurado: true, mensagem: "Resposta inválida", http: res.statusCode });
          }
        });
      }
    );
    req.on("error",   (err) => resolve({ ok: false, configurado: true, mensagem: err.message }));
    req.on("timeout", ()    => { req.destroy(); resolve({ ok: false, configurado: true, mensagem: "Timeout" }); });
    req.end();
  });
}

module.exports = { enviarMensagem, checarStatusConexao };
