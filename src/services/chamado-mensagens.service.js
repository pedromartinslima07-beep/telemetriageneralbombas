// src/services/chamado-mensagens.service.js
//
// Helpers usados pelas rotas que recebem mensagens em um chamado
// (cliente.routes.js e chamados.routes.js, ambos via app mobile).
//
// As mensagens são persistidas em alerta_comentarios com
// alerta_origem='chamado' e foto_url quando houver imagem.

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "../../uploads/chamados");

const MIME_TO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_B64_BYTES = 6 * 1024 * 1024; // ~4 MB de arquivo decodificado

/**
 * Decodifica base64 (com ou sem prefixo data URL) e salva em
 * uploads/chamados/<chamadoId>/<random>.<ext>.
 *
 * @param  {number} chamadoId
 * @param  {string} imageBase64
 * @return {Promise<{url:string}>}  caminho público p/ salvar em foto_url
 * @throws Error  ("invalido", "muito_grande") quando o input não passa.
 */
async function salvarFotoMensagemChamado(chamadoId, imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== "string") {
    const e = new Error("foto_base64 inválido"); e.code = "invalido"; throw e;
  }

  let mime = "image/jpeg";
  let b64 = imageBase64;
  const m = imageBase64.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/i);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[3];
  }

  if (b64.length > MAX_B64_BYTES) {
    const e = new Error("Foto muito grande (limite ~4 MB)"); e.code = "muito_grande"; throw e;
  }

  let buf;
  try {
    buf = Buffer.from(b64, "base64");
    if (buf.length < 1024) throw new Error("imagem inválida ou muito pequena");
  } catch (_) {
    const e = new Error("foto_base64 inválido"); e.code = "invalido"; throw e;
  }

  const ext = MIME_TO_EXT[mime] || "jpg";
  const dir = path.join(UPLOAD_ROOT, String(chamadoId));
  const fname = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const fpath = path.join(dir, fname);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fpath, buf);

  return { url: `/uploads/chamados/${chamadoId}/${fname}` };
}

module.exports = { salvarFotoMensagemChamado };
