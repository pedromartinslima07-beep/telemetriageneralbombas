const https = require("https");

function _configurado() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function enviarMensagem(telefone, texto) {
  return _postar({ messaging_product: "whatsapp", to: telefone, type: "text", text: { body: texto } });
}

// Mensagem por MODELO aprovado na Meta. ⚠️ É o único jeito de falar com quem
// não mandou mensagem ao número nas últimas 24h: texto livre fora dessa janela
// a Meta recusa (erro 131047). `parametros` preenchem {{1}}, {{2}}… do corpo,
// na ordem; o nome e a quantidade têm de bater com o modelo cadastrado.
async function enviarTemplate(telefone, nome, idioma, parametros = []) {
  return _postar({
    messaging_product: "whatsapp",
    to: telefone,
    type: "template",
    template: {
      name: nome,
      language: { code: idioma || "pt_BR" },
      components: parametros.length
        ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t) })) }]
        : [],
    },
  });
}

// Uma porta de saída para os dois tipos. Resolve com o corpo da resposta
// mesmo em erro HTTP (como sempre foi: quem chama não para por isso), e
// devolve `ok` para quem quiser saber. Com tempo-limite: sem ele, a Meta
// lenta segurava o job e a conversa sem prazo.
function _postar(payload) {
  if (!_configurado()) {
    console.warn("[meta-wa] variáveis não configuradas — mensagem não enviada");
    return Promise.resolve({ ok: false, configurado: false });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token         = process.env.WHATSAPP_ACCESS_TOKEN;
  const body = JSON.stringify(payload);

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
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const ok = res.statusCode < 400;
          if (!ok) console.error("[meta-wa] erro ao enviar:", res.statusCode, data);
          resolve({ ok, http: res.statusCode, data });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado falando com a Meta")));
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

module.exports = { enviarMensagem, enviarTemplate, checarStatusConexao };
