// scripts/auto-zona-condominios.js
// Preenche automaticamente o campo `zona` de todos os condomínios sem zona,
// usando a mesma lógica do mapa: bairro tem prioridade; fallback por lat/lng
// relativo à Praça da Sé.
//
// Uso: node scripts/auto-zona-condominios.js [--dry-run] [--prod]
//   --dry-run  mostra o que faria, sem alterar o banco
//   --prod     roda contra PRODUÇÃO (sem ele, o banco de teste)
//
// ⚠️ O `--prod` CHEGOU EM 04/09/2026, e a falta dele era o motivo de este
// script nunca ter rodado onde precisava. Ele usava o `pool` do `src/db`, que
// em dev resolve para o banco de TESTE — então quem o rodasse para "consertar
// as zonas" via "Atualizados: 1" e ia embora achando que tinha consertado
// produção. Mesma convenção do `scripts/migrate.js`, de propósito.

require("dotenv").config();
const { Pool } = require("pg");
const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");

const DRY_RUN = process.argv.includes("--dry-run");
const PROD    = process.argv.includes("--prod");

const { url, alvo } = resolverDatabaseUrl({ forcarProducao: PROD });
const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
console.log(`🗄️  Banco: ${alvo} — ${descreverAlvo(url)}`);

// ⚠️ A TABELA SAIU DAQUI (04/09/2026). Ela vivia duplicada neste script e em
// `public/admin.js` (`_MP_BAIRROS_ZONA`), e as duas JÁ DIVERGIAM da realidade:
// nenhuma conhecia Anália Franco, Higienópolis, Indianópolis, Alto da Mooca —
// bairros que existem na carteira hoje. Levantado do banco: 65 bairros
// distintos, e a tabela cobria uma fração.
//
// Hoje a regra mora no `src/services/zona.service.js` e o CADASTRO já a aplica
// sozinho (`POST`/`PATCH /condominios`), então este script deixou de ser o
// conserto e virou o que sempre deveria ter sido: a varredura do que ficou
// para trás.
const { zonaDe } = require("../src/services/zona.service");

function zonaPara(c) {
  return zonaDe(c);
}

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — nenhuma alteração será feita\n" : "✏️  Modo real — banco será atualizado\n");

  const { rows } = await pool.query(
    `SELECT id, nome, nome_fantasia, bairro, cidade, uf, lat, lng, zona
     FROM condominios
     ORDER BY id`
  );

  console.log(`${rows.length} condomínio(s) encontrado(s)\n`);

  if (!rows.length) {
    console.log("Nada a fazer.");
    await pool.end();
    return;
  }

  let atualizados = 0, semDados = 0;

  for (const c of rows) {
    const zona = zonaPara(c);
    const nome = c.nome_fantasia || c.nome;
    if (!zona) {
      console.log(`  ⚠  [${c.id}] ${nome} (${c.cidade || "?"}/${c.uf || "?"}) — sem bairro nem coordenada, pulando`);
      semDados++;
      continue;
    }

    const mudou = zona !== c.zona;
    const tag = mudou ? (c.zona ? `${c.zona} → ${zona}` : zona) : `${zona} (sem mudança)`;
    console.log(`  ${mudou ? "✓" : "·"}  [${c.id}] ${nome} — ${tag}`);
    if (!DRY_RUN && mudou) {
      await pool.query(`UPDATE condominios SET zona = $1 WHERE id = $2`, [zona, c.id]);
    }
    if (mudou) atualizados++;
  }

  console.log(`\n${DRY_RUN ? "Seriam atualizados" : "Atualizados"}: ${atualizados}`);
  if (semDados) console.log(`Sem dados suficientes (sem bairro e sem coordenada): ${semDados}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
