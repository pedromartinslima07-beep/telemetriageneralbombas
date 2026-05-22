require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    // 1. Colunas da tabela tecnicos (confirma migration 016)
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='tecnicos' ORDER BY ordinal_position"
    );
    console.log("Colunas de tecnicos:");
    cols.rows.forEach(r => console.log("  •", r.column_name));

    // 2. Conteúdo bruto da tabela tecnicos
    console.log("\nLinhas em tecnicos:");
    const rows = await pool.query("SELECT id, nome, email, ativo, usuario_id FROM tecnicos ORDER BY id");
    if (rows.rows.length === 0) console.log("  (vazia)");
    rows.rows.forEach(r => console.log(" ", r));

    // 3. Tenta executar a MESMA query do GET /tecnicos pra ver se ela quebra
    console.log("\nExecutando query do GET /tecnicos…");
    const test = await pool.query(`
      SELECT
        t.id, t.nome, t.email, t.telefone, t.especialidade,
        t.disponivel, t.ativo, t.criado_em, t.usuario_id,
        (t.usuario_id IS NOT NULL) AS tem_login,
        COUNT(ch.id) FILTER (WHERE ch.status != 'fechado') AS chamados_abertos,
        COUNT(ch.id) AS chamados_total
      FROM tecnicos t
      LEFT JOIN chamados ch ON ch.tecnico_id = t.id
      GROUP BY t.id
      ORDER BY t.nome ASC
    `);
    console.log(`  Query OK — retornou ${test.rows.length} linha(s)`);
    test.rows.forEach(r => console.log("   ", { id: r.id, nome: r.nome, tem_login: r.tem_login, ativo: r.ativo }));
  } catch (err) {
    console.error("ERRO:", err.message);
    if (err.position) console.error("posição:", err.position);
  } finally {
    await pool.end();
  }
}
main();
