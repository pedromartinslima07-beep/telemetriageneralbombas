// Script de migration — roda um arquivo .sql contra o banco resolvido em
// src/db-url.js (o mesmo que o servidor usa: TESTE em dev, produção só com
// --prod ou NODE_ENV=production).
//
// Uso:  node scripts/migrate.js 002_mapa_categoria.sql
//       node scripts/migrate.js 002_mapa_categoria.sql --prod   ← produção
//       (procura em ./migrations/ por padrão)

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");

async function main() {
  const args = process.argv.slice(2);
  const forcarProducao = args.includes("--prod");
  const arg = args.find(a => !a.startsWith("--"));
  if (!arg) {
    console.error("Uso: node scripts/migrate.js <arquivo.sql> [--prod]");
    console.error("Ex.: node scripts/migrate.js 002_mapa_categoria.sql");
    process.exit(1);
  }

  const { url: databaseUrl, alvo } = resolverDatabaseUrl({ forcarProducao });
  if (!databaseUrl) {
    console.error("Nenhum banco resolvido — confira DATABASE_URL/DATABASE_URL_TESTE no .env");
    process.exit(1);
  }

  // resolve caminho — aceita "002_xxx.sql", "migrations/002_xxx.sql" ou caminho absoluto
  let candidate;
  if (path.isAbsolute(arg))                          candidate = arg;
  else if (arg.includes("/") || arg.includes("\\")) candidate = path.resolve(arg);
  else                                              candidate = path.resolve("migrations", arg);

  if (!fs.existsSync(candidate)) {
    console.error("Arquivo não encontrado:", candidate);
    process.exit(1);
  }

  const sql = fs.readFileSync(candidate, "utf8");

  console.log(`→ Migration: ${candidate}`);
  console.log(`→ Banco: ${alvo} — ${descreverAlvo(databaseUrl)}`);
  console.log(`→ ${sql.split("\n").length} linhas\n`);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const info = await pool.query("SELECT current_database() AS db, current_user AS usr");
    console.log(`✓ Conectado em "${info.rows[0].db}" como "${info.rows[0].usr}"\n`);

    // ⚠️ Client dedicado, e não pool.query, só para poder ouvir `notice`.
    // Migration que trabalha dentro de um bloco DO $$ (a 073, por exemplo) não
    // altera nada que a listagem de colunas abaixo capture: ela reporta o que
    // fez por RAISE NOTICE. Sem este listener a saída era "aplicada com
    // sucesso" e mais nada — não dava para saber se converteu 5 FKs ou zero.
    const client = await pool.connect();
    let notices = 0;
    client.on("notice", n => { notices++; console.log(`  ⓘ ${n.message}`); });
    try {
      await client.query(sql);
    } finally {
      client.removeAllListeners("notice");
      client.release();
    }
    if (notices) console.log();
    console.log("✓ Migration aplicada com sucesso\n");

    // Lista colunas das tabelas alteradas para confirmação visual
    const tables = [...new Set(
      [...sql.matchAll(/ALTER\s+TABLE\s+(\w+)/gi)].map(m => m[1].toLowerCase())
    )];

    for (const t of tables) {
      const r = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position",
        [t]
      );
      console.log(`  Colunas de "${t}":`);
      for (const row of r.rows) console.log(`   • ${row.column_name}`);
      console.log();
    }
  } catch (err) {
    console.error("✗ Erro:", err.message);
    if (err.position) console.error("  posição:", err.position);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
