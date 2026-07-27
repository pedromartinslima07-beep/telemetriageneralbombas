const { Pool } = require("pg");

const poolConfig = {
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

// Fora de produção o servidor usa o banco de TESTE (ver src/db-url.js).
const { resolverDatabaseUrl, descreverAlvo } = require("./db-url");

function _buildPoolConfig() {
  const { url, alvo } = resolverDatabaseUrl();
  if (url) {
    // Log explícito no boot: o custo de não saber em qual banco você está
    // mexendo é alto demais pra deixar implícito.
    console.log(`🗄️  Banco: ${alvo} — ${descreverAlvo(url)}`);
    // Extrai componentes da URL para evitar que pg leia PGPASSWORD do ambiente
    const u = new URL(url);
    return {
      host:     u.hostname,
      port:     Number(u.port) || 5432,
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1),
      ssl:      { rejectUnauthorized: false },
      ...poolConfig,
    };
  }
  return {
    host:     process.env.PGHOST,
    port:     Number(process.env.PGPORT || 5432),
    user:     process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl:      process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
    ...poolConfig,
  };
}

const pool = new Pool(_buildPoolConfig());

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

module.exports = { pool };