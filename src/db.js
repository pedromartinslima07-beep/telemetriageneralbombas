const { Pool } = require("pg");

const poolConfig = {
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

function _buildPoolConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
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