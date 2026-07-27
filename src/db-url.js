// Regra única de qual banco usar — compartilhada pelo servidor (src/db.js) e
// pelos scripts de migration, pra não existir a situação em que o app está
// lendo o banco de teste e a migration está escrevendo no de produção.
//
//   NODE_ENV=production           → DATABASE_URL          (Railway)
//   dev + DATABASE_URL_TESTE      → DATABASE_URL_TESTE    (banco de teste)
//   dev sem DATABASE_URL_TESTE    → DATABASE_URL          (comportamento antigo)

function resolverDatabaseUrl({ forcarProducao = false } = {}) {
  const emProducao = forcarProducao || process.env.NODE_ENV === "production";
  if (!emProducao && process.env.DATABASE_URL_TESTE) {
    return { url: process.env.DATABASE_URL_TESTE, alvo: "TESTE" };
  }
  return { url: process.env.DATABASE_URL, alvo: "PRODUÇÃO" };
}

// "host:porta/banco" — o que de fato identifica o alvo (na Railway o nome do
// banco é sempre "railway", então só ele não distingue nada).
function descreverAlvo(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "(URL inválida)";
  }
}

module.exports = { resolverDatabaseUrl, descreverAlvo };
