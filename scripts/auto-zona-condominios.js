// scripts/auto-zona-condominios.js
// Varre os condomínios e acerta o campo `zona` com a regra do
// `src/services/zona.service.js` (bairro → cidade fora de SP → coordenada).
//
// Uso: node scripts/auto-zona-condominios.js [--dry-run] [--prod] [--incluir-manuais]
//   --dry-run          mostra o que faria, sem alterar o banco
//   --prod             roda contra PRODUÇÃO (sem ele, o banco de teste)
//   --incluir-manuais  também reescreve as zonas que PARECEM digitadas à mão
//                      (só depois de olhar a lista do --dry-run)
//
// ⚠️ O `--prod` CHEGOU EM 04/09/2026, e a falta dele era o motivo de este
// script nunca ter rodado onde precisava. Ele usava o `pool` do `src/db`, que
// em dev resolve para o banco de TESTE — então quem o rodasse para "consertar
// as zonas" via "Atualizados: 1" e ia embora achando que tinha consertado
// produção. Mesma convenção do `scripts/migrate.js`, de propósito.
//
// ⚠️ NÃO REESCREVE TUDO ÀS CEGAS (01/10/2026). A regra do cadastro é "o que a
// pessoa digitou ganha" (`zonaParaGravar`), e o banco não guarda se uma zona
// foi digitada ou derivada. Então cada condomínio cai em um de quatro grupos:
//   · vazia            → preenche;
//   · já certa         → nada;
//   · feita por máquina → a zona gravada é exatamente o que o código ANTIGO
//                        (tabela de bairros ou quadrante a partir da Sé) daria
//                        — foi ele que gravou: corrige;
//   · parece manual    → difere da regra nova E da antiga — alguém escolheu.
//                        Só lista; reescreve apenas com --incluir-manuais.
// Foi a tabela (bairro de nome repetido) que pôs o Atua Parque Ecológico 1 na
// Zona Norte e o Praça das Águas na Zona Sul — os dois são Zona Leste.

require("dotenv").config();
const { Pool } = require("pg");
const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");
const { zonaDe, BAIRROS_ZONA, normalizar } = require("../src/services/zona.service");

const DRY_RUN = process.argv.includes("--dry-run");
const PROD    = process.argv.includes("--prod");
const MANUAIS = process.argv.includes("--incluir-manuais");

const { url, alvo } = resolverDatabaseUrl({ forcarProducao: PROD });
const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
console.log(`🗄️  Banco: ${alvo} — ${descreverAlvo(url)}`);

// O fallback geográfico de antes de 01/10/2026, guardado só para reconhecer o
// que ele gravou. Não usar para decidir zona nenhuma.
function quadranteAntigo(lat, lng) {
  if (lat == null || lng == null) return null;
  const dLat = Number(lat) - -23.5505;
  const dLng = Number(lng) - -46.6333;
  if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null;
  if (Math.sqrt((dLat * 111) ** 2 + (dLng * 102) ** 2) <= 3) return "Centro";
  if (dLat < -0.032) return "Zona Sul";
  if (dLat > 0.032) return "Zona Norte";
  return dLng > 0 ? "Zona Leste" : "Zona Oeste";
}

function feitaPorMaquina(c) {
  const atual = String(c.zona).trim();
  if (atual === quadranteAntigo(c.lat, c.lng)) return true;
  return atual === BAIRROS_ZONA[normalizar(c.bairro)];
}

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — nenhuma alteração será feita\n" : "✏️  Modo real — banco será atualizado\n");

  const { rows } = await pool.query(
    `SELECT id, nome, nome_fantasia, bairro, cidade, uf, cep, lat, lng, zona, ativo
     FROM condominios
     ORDER BY id`
  );
  console.log(`${rows.length} condomínio(s) encontrado(s)\n`);

  let atualizados = 0, semDados = 0;
  const manuais = [];

  for (const c of rows) {
    const nova = zonaDe(c);
    const nome = (c.nome_fantasia || c.nome) + (c.ativo ? "" : " (inativo)");
    const local = `${c.bairro || "sem bairro"}, ${c.cidade || "?"}`;
    if (!nova) {
      console.log(`  ⚠  [${c.id}] ${nome} (${local}) — sem bairro nem coordenada, pulando`);
      semDados++;
      continue;
    }
    const atual = c.zona ? String(c.zona).trim() : "";
    if (atual === nova) continue;

    let motivo;
    if (!atual) motivo = "vazia";
    else if (feitaPorMaquina(c)) motivo = "código antigo";
    else {
      manuais.push({ c, nome, local, nova });
      if (!MANUAIS) continue;
      motivo = "manual, --incluir-manuais";
    }

    console.log(`  ✓  [${c.id}] ${nome} (${local}) — ${atual || "∅"} → ${nova}  [${motivo}]`);
    if (!DRY_RUN) {
      await pool.query(`UPDATE condominios SET zona = $1 WHERE id = $2`, [nova, c.id]);
    }
    atualizados++;
  }

  if (manuais.length && !MANUAIS) {
    console.log(`\nZonas que parecem digitadas à mão e divergem da regra (NÃO alteradas):`);
    for (const { c, nome, local, nova } of manuais) {
      console.log(`  ?  [${c.id}] ${nome} (${local}) — gravada ${c.zona}, a regra diria ${nova}`);
    }
    console.log(`Para reescrevê-las também: --incluir-manuais`);
  }

  console.log(`\n${DRY_RUN ? "Seriam atualizados" : "Atualizados"}: ${atualizados}`);
  if (semDados) console.log(`Sem dados suficientes (sem bairro e sem coordenada): ${semDados}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
