const { Pool } = require("pg");

// ⚠️ CONEXÃO OCIOSA FICA ABERTA 10 MIN, NÃO 30 S (19/11/2026). Abrir conexão
// com o Postgres remoto custa ~2,4 s medidos daqui até o banco de teste (TLS
// pelo proxy do Railway), contra ~0,34 s de uma consulta. Com 30 s, toda tela
// que dispara várias consultas juntas depois de meio minuto parada (a Agenda
// dispara 5–6) pagava a abertura de novo: a Agenda abria em "Carregando…" por
// 2–3 s. O pool só cresce até o que a tela pede de uma vez (máx. 20), e
// conexão derrubada pelo servidor sai sozinha (pool.on("error") abaixo).
// keepAlive mantém o TCP vivo através do proxy. Ajustável por PG_IDLE_MS.
const poolConfig = {
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_MS || 600_000),
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
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