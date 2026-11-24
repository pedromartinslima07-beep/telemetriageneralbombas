// A resposta do cliente a "Posso abrir o chamado?" — sim, não, ou outra coisa.
// docs/modulos/whatsapp-ia.md, seção "Backend é o juiz final".
//
// ⚠️ ACEITE TEM DE SER INEQUÍVOCO. A versão antiga procurava palavras soltas
// ("pode", "quero", "ok", "preciso"…) em qualquer lugar da frase, e conferia o
// SIM antes do NÃO. Resultado: "não, pode deixar" e "não quero" ABRIAM o
// chamado. Agora:
//
//   1. Qualquer negação na frase → recusa. Vem primeiro: na dúvida entre abrir
//      e não abrir, não abrir (a IA continua a conversa e pode perguntar de novo).
//   2. Aceite só quando a frase INTEIRA é um aceite ("sim", "pode abrir", "ok,
//      por favor", "sim 👍"). "Sim, mas antes me diz o nível" não é aceite: é
//      pergunta, e vai para a IA com a ação ainda pendente.
//   3. O resto → null: a IA responde e a ação continua esperando.
//
// Ideia trazida do `aceiteInequivoco` do Petzu (src/propostas.js lá).

const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Limpa pontuação, emoji e espaços repetidos: "Sim!! 👍" → "sim".
function normalizar(texto) {
  return semAcento(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NEGACAO = /\b(nao|n|nem|cancela|cancelar|cancele|deixa|deixe|ignora|ignore|esquece|esqueca|desisto|desiste|negativo|nunca|pare)\b/;
// ("para" ficou de fora: em "pode abrir para mim" é preposição, não "pare".)

// Peças que, juntas, formam um aceite. A frase inteira tem de ser feita só
// delas: "sim pode abrir por favor", "ok obrigado", "isso mesmo".
const PECAS_ACEITE = new Set([
  "sim", "s", "ss", "pode", "podem", "ok", "okay", "blz", "beleza", "certo", "claro",
  "isso", "mesmo", "exato", "confirmo", "confirma", "confirmado", "confirmar",
  "quero", "queremos", "favor", "por", "obrigado", "obrigada", "valeu", "grato", "grata",
  "abre", "abra", "abrir", "abram", "registra", "registre", "registrar", "manda", "mande",
  "pfv", "pf", "pls", "vai", "bora", "fechado", "perfeito", "com", "certeza", "ser",
  "o", "a", "chamado", "pedido", "orcamento", "uhum", "aham", "positivo", "e",
  "para", "pra", "mim", "nos", "agora", "ja",
]);
// Pelo menos uma destas tem de estar lá — "por favor" sozinho, ou "o chamado",
// não é resposta de sim.
const NUCLEO_ACEITE = new Set([
  "sim", "s", "ss", "pode", "podem", "ok", "okay", "blz", "beleza", "certo", "claro",
  "isso", "exato", "confirmo", "confirma", "confirmado", "confirmar", "quero", "queremos",
  "abre", "abra", "abrir", "abram", "registra", "registre", "registrar", "manda", "mande",
  "vai", "bora", "fechado", "perfeito", "uhum", "aham", "positivo",
]);

const MAX_PALAVRAS_ACEITE = 8;

/**
 * @returns {"aceite"|"recusa"|null}
 */
function classificarResposta(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  if (NEGACAO.test(t)) return "recusa";
  const palavras = t.split(" ");
  if (palavras.length > MAX_PALAVRAS_ACEITE) return null;
  if (!palavras.every((p) => PECAS_ACEITE.has(p))) return null;
  return palavras.some((p) => NUCLEO_ACEITE.has(p)) ? "aceite" : null;
}

module.exports = { classificarResposta, normalizar };
