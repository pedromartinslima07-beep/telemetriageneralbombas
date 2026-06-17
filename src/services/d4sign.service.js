// Integração D4Sign — assinatura digital de contratos
// Docs: https://docapi.d4sign.com.br/
// Env: D4SIGN_TOKEN_API, D4SIGN_CRYPT_KEY, D4SIGN_SAFE_UUID, APP_URL

const https = require("https");

const BASE      = "secure.d4sign.com.br";
const BASE_PATH = "/api/v1";

// Status D4Sign → interno
const _STATUS_MAP = {
  "1": "aguardando",  // Processando
  "2": "aguardando",  // Aguardando assinaturas
  "3": "assinado",    // Assinado por todos
  "4": "cancelado",   // Cancelado
  "7": "recusado",    // Recusado por algum signatário
};

function _creds() {
  const tokenAPI = process.env.D4SIGN_TOKEN_API;
  const cryptKey = process.env.D4SIGN_CRYPT_KEY;
  if (!tokenAPI || !cryptKey) throw new Error("D4SIGN_TOKEN_API ou D4SIGN_CRYPT_KEY não configurados");
  return { tokenAPI, cryptKey };
}

function _qs() {
  const { tokenAPI, cryptKey } = _creds();
  return `tokenAPI=${encodeURIComponent(tokenAPI)}&cryptKey=${encodeURIComponent(cryptKey)}`;
}

// Requisição JSON genérica
function _request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE,
      path:     `${BASE_PATH}${path}?${_qs()}`,
      method,
      headers: {
        "Accept":       "application/json",
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`D4Sign ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Upload multipart (D4Sign exige form-data, não base64)
function _uploadMultipart(safeUuid, pdfBuffer, filename) {
  const boundary = "----D4SignBoundary" + Date.now().toString(16);
  const part1 = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`
  );
  const part2 = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([part1, pdfBuffer, part2]);

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE,
      path:     `${BASE_PATH}/documents/${safeUuid}/upload?${_qs()}`,
      method:   "POST",
      headers: {
        "Accept":         "application/json",
        "Content-Type":   `multipart/form-data; boundary=${boundary}`,
        "Content-Length": payload.length,
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`D4Sign upload ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Cria documento, adiciona signatários e envia para assinatura.
// pdfBuffer: Buffer do PDF gerado
// signatarios: [{ nome, email }]
async function criarDocumento({ nome, pdfBuffer, signatarios, externalId }) {
  const safeUuid = process.env.D4SIGN_SAFE_UUID;
  if (!safeUuid) throw new Error("D4SIGN_SAFE_UUID não configurado");

  // 1. Upload do PDF
  const filename   = `${(externalId || "contrato").replace(/[^a-z0-9-]/gi, "-")}.pdf`;
  const uploadResp = await _uploadMultipart(safeUuid, pdfBuffer, filename);
  const docUuid    = uploadResp.uuid;
  if (!docUuid) throw new Error(`D4Sign não retornou UUID do documento. Resposta: ${JSON.stringify(uploadResp)}`);

  // 2. Registrar webhook (se APP_URL estiver configurado)
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    await _request("POST", `/documents/${docUuid}/webhooks`, {
      url: `${appUrl}/contratos/webhook/d4sign`,
    }).catch((e) => console.error("[d4sign] webhook registro falhou:", e.message));
  }

  // 3. Adicionar signatários
  const signers = signatarios.map((s) => ({
    email:                 s.email,
    act:                   "1",   // 1 = assinar
    foreign:               "0",
    certificadoicpbr:      "0",
    assinatura_presencial: "0",
    docauth:               "0",
    docauthandselfie:      "0",
    embed_methodauth:      "email",
    upload_allow:          "0",
    upload_obs:            "",
  }));
  await _request("POST", `/documents/${docUuid}/createlist`, { signers });

  // 4. Enviar para assinatura (dispara e-mails)
  await _request("POST", `/documents/${docUuid}/sendtosigner`, {
    message:   "Por favor, assine o contrato de prestação de serviços.",
    workflow:  "0",
    skip_email: "0",
  });

  // 5. Buscar links de assinatura
  const docInfo     = await _request("GET", `/documents/${docUuid}`, null);
  const signersInfo = docInfo.signers || [];

  return {
    docToken:    docUuid,
    signatarios: signatarios.map((s, i) => ({
      email:   s.email,
      nome:    s.nome,
      signUrl: signersInfo[i]?.link || null,
      token:   signersInfo[i]?.key_signer || null,
    })),
    status: "aguardando",
  };
}

// Busca status atual de um documento pelo UUID.
async function buscarDocumento(docUuid) {
  const resp = await _request("GET", `/documents/${docUuid}`, null);
  return {
    status:      String(resp.statusId || resp.status || "2"),
    assinadoEm:  resp.updated_at || null,
    docUrl:      resp.signed_file || resp.url_signed || null,
    signatarios: (resp.signers || []).map((s) => ({
      email:      s.email,
      nome:       s.name || s.email,
      status:     s.signed ? "signed" : "pending",
      assinadoEm: s.signed_at || null,
    })),
  };
}

// Mapeia status D4Sign → status interno
function mapStatus(d4signStatus) {
  return _STATUS_MAP[String(d4signStatus)] || "aguardando";
}

module.exports = { criarDocumento, buscarDocumento, mapStatus };
