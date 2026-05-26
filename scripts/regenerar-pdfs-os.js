// Regenera os PDFs de todas as OS finalizadas usando o template atual.
// Uso: node scripts/regenerar-pdfs-os.js
// Sobrescreve os arquivos existentes em uploads/os/{id}/.

require("dotenv").config();
const { pool } = require("../src/db");
const { gerarPdfOS } = require("../src/services/os-pdf.service");

async function main() {
  const { rows } = await pool.query(
    `SELECT id, numero FROM ordens_servico WHERE finalizada_em IS NOT NULL ORDER BY id ASC`
  );

  if (rows.length === 0) {
    console.log("Nenhuma O.S. finalizada encontrada.");
    await pool.end();
    return;
  }

  console.log(`Regenerando PDF de ${rows.length} O.S. finalizadas...\n`);

  let ok = 0, erros = 0;

  for (const os of rows) {
    try {
      await gerarPdfOS(os.id);
      console.log(`  ✓ OS#${os.id} (${os.numero})`);
      ok++;
    } catch (err) {
      console.error(`  ✗ OS#${os.id} (${os.numero}): ${err.message}`);
      erros++;
    }
  }

  console.log(`\nConcluído: ${ok} ok, ${erros} erro(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
