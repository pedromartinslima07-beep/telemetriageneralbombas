// Cofre dos tokens de WhatsApp de cada número conectado (migration 108).
//
// AES-256-GCM com a chave WHATSAPP_TOKENS_CHAVE (32 bytes em base64:
// `openssl rand -base64 32`). O phone_number_id entra como dado autenticado:
// um segredo copiado para a linha de outro número não abre.
//
// Formato guardado: "v1:<iv>:<tag>:<cifrado>", tudo base64.
//
// ⚠️ Nunca logar o que sai daqui. Guardar uma cópia da chave fora do Railway:
// perdida, todos os números precisam reconectar.
const crypto = require("crypto");

function _chave() {
  const bruta = String(process.env.WHATSAPP_TOKENS_CHAVE || "").trim();
  if (!bruta) throw new Error("WHATSAPP_TOKENS_CHAVE não configurada");
  const chave = Buffer.from(bruta, "base64");
  if (chave.length !== 32) throw new Error("WHATSAPP_TOKENS_CHAVE precisa ter 32 bytes em base64");
  return chave;
}

function cofreConfigurado() {
  try { _chave(); return true; } catch (_) { return false; }
}

function cifrar(segredo, phoneNumberId) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", _chave(), iv);
  c.setAAD(Buffer.from(String(phoneNumberId)));
  const cifrado = Buffer.concat([c.update(JSON.stringify(segredo), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(":");
}

function decifrar(texto, phoneNumberId) {
  const [versao, iv, tag, cifrado] = String(texto || "").split(":");
  if (versao !== "v1" || !iv || !tag || !cifrado) throw new Error("segredo em formato desconhecido");
  const d = crypto.createDecipheriv("aes-256-gcm", _chave(), Buffer.from(iv, "base64"));
  d.setAAD(Buffer.from(String(phoneNumberId)));
  d.setAuthTag(Buffer.from(tag, "base64"));
  const claro = Buffer.concat([d.update(Buffer.from(cifrado, "base64")), d.final()]).toString("utf8");
  return JSON.parse(claro);
}

module.exports = { cifrar, decifrar, cofreConfigurado };
