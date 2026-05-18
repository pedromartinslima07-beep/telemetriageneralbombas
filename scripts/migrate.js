// Script de migration — roda um arquivo .sql contra o DATABASE_URL do .env
// Uso:  node scripts/migrate.js 002_mapa_categoria.sql
//       (procura em ./migrations/ por padrão)

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Uso: node scripts/migrate.js <arquivo.sql>");
    console.error("Ex.: node scripts/migrate.js 002_mapa_categoria.sql");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no .env");
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
  const urlMasked = process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@");

  console.log(`→ Migration: ${candidate}`);
  console.log(`→ DATABASE_URL: ${urlMasked}`);
  console.log(`→ ${sql.split("\n").length} linhas\n`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const info = await pool.query("SELECT current_database() AS db, current_user AS usr");
    console.log(`✓ Conectado em "${info.rows[0].db}" como "${info.rows[0].usr}"\n`);

    await pool.query(sql);
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
