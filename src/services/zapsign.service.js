// Integração com ZapSign — assinatura digital de contratos
// Docs: https://docs.zapsign.com.br/
// Env: ZAPSIGN_API_TOKEN

const https = require("https");

const BASE_URL = "api.zapsign.com.br";

function token() {
  const t = process.env.ZAPSIGN_API_TOKEN;
  if (!t) throw new Error("ZAPSIGN_API_TOKEN não configurado");
  return t;
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE_URL,
      path,
      method,
      headers: {
        "Authorization": `Bearer ${token()}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`ZapSign ${res.statusCode}: ${data}`));
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Cria um documento no ZapSign e retorna token + links de assinatura.
// pdfBase64: string base64 do PDF
// signatarios: [{ nome, email, papel }]  (papel = label exibido no documento)
async function criarDocumento({ nome, pdfBase64, signatarios, externalId }) {
  const signers = signatarios.map((s) => ({
    name:          s.nome,
    email:         s.email,
    send_automatic_email: true,
    // ZapSign não tem campo "papel" na criação — enviamos como "auth_mode"
  }));

  const body = {
    name:        nome,
    url_pdf:     undefined,
    base64_pdf:  pdfBase64,
    signers,
    external_id: externalId || undefined,
    lang:        "pt-br",
  };

  const resp = await request("POST", "/api/v1/docs/", body);

  return {
    docToken:    resp.token,
    signatarios: (resp.signers || []).map((s) => ({
      email:    s.email,
      nome:     s.name,
      signUrl:  s.sign_url,
      token:    s.token,
    })),
    status: resp.status || "pending",
  };
}

// Busca status atual de um documento pelo token.
async function buscarDocumento(docToken) {
  const resp = await request("GET", `/api/v1/docs/${docToken}/`, null);
  return {
    status:     resp.status,           // "pending" | "signed" | "refused" | "cancelled"
    assinadoEm: resp.signed_at || null,
    docUrl:     resp.signed_file || null,
    signatarios: (resp.signers || []).map((s) => ({
      email:     s.email,
      nome:      s.name,
      status:    s.status,
      assinadoEm: s.signed_at || null,
    })),
  };
}

// Mapeia status ZapSign → status interno
function mapStatus(zapsignStatus) {
  const map = { pending: "aguardando", signed: "assinado", refused: "recusado", cancelled: "cancelado" };
  return map[zapsignStatus] || "aguardando";
}

module.exports = { criarDocumento, buscarDocumento, mapStatus };
