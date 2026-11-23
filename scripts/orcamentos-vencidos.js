// Arquiva de uma vez os orçamentos enviados que venceram sem resposta
// (migration 103, docs/modulos/orcamentos-vencimento.md). É o que o job
// orcamento-vencimento faz a cada volta; este script serve para fazer AGORA,
// mostrando a contagem antes.
//
// Uso:  node scripts/orcamentos-vencidos.js                    ← conta no TESTE
//       node scripts/orcamentos-vencidos.js --prod             ← conta em PRODUÇÃO
//       node scripts/orcamentos-vencidos.js --prod --gravar    ← arquiva em PRODUÇÃO
//
// Sem --gravar não escreve nada. Precisa da migration 103 no banco alvo.
require("dotenv").config({ quiet: true });
const args = process.argv.slice(2);
if (args.includes("--prod")) process.env.NODE_ENV = "production"; // antes de carregar o pool
const gravar = args.includes("--gravar");

const { pool } = require("../src/db");
const venc = require("../src/services/orcamento-vencimento.service");

(async () => {
  const hoje = venc._t._hojeSP();
  const c = await venc.arquivarVencidos({ gravar: false });
  const meses = await pool.query(
    `SELECT to_char(valido_ate, 'YYYY-MM') AS mes, COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE enviado_para IS NULL)::int AS sem_para
       FROM orcamentos WHERE id = ANY($1::int[]) GROUP BY 1 ORDER BY 1`, [c.ids]);
  console.log(`Hoje (São Paulo): ${hoje}. Enviados vencidos sem resposta e ainda não arquivados: ${c.vencidos}`);
  console.table(meses.rows);
  if (!gravar) {
    console.log("Nada gravado. Para arquivar: --gravar");
  } else {
    const r = await venc.arquivarVencidos();
    console.log(`Arquivados: ${r.arquivados}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
