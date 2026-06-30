// scripts/auto-zona-condominios.js
// Preenche automaticamente o campo `zona` de todos os condomínios sem zona,
// usando a mesma lógica do mapa: bairro tem prioridade; fallback por lat/lng
// relativo à Praça da Sé.
//
// Uso: node scripts/auto-zona-condominios.js [--dry-run]
//   --dry-run  mostra o que faria, sem alterar o banco

require("dotenv").config();
const { pool } = require("../src/db");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Mesma tabela de bairros do admin.js ──────────────────────────────────────
const BAIRROS_ZONA = {
  // Centro
  "se": "Centro", "republica": "Centro", "liberdade": "Centro",
  "bela vista": "Centro", "consolacao": "Centro", "santa cecilia": "Centro",
  "cambuci": "Centro", "bom retiro": "Centro",

  // Zona Norte
  "santana": "Zona Norte", "tucuruvi": "Zona Norte", "tremembe": "Zona Norte",
  "jacana": "Zona Norte", "vila guilherme": "Zona Norte", "vila maria": "Zona Norte",
  "casa verde": "Zona Norte", "limao": "Zona Norte", "freguesia do o": "Zona Norte",
  "pirituba": "Zona Norte", "jaragua": "Zona Norte", "perus": "Zona Norte",
  "brasilandia": "Zona Norte", "mandaqui": "Zona Norte", "cachoeirinha": "Zona Norte",
  "vila nova cachoeirinha": "Zona Norte", "vila medeiros": "Zona Norte",

  // Zona Sul
  "vila mariana": "Zona Sul", "saude": "Zona Sul", "ipiranga": "Zona Sul",
  "jabaquara": "Zona Sul", "santo amaro": "Zona Sul", "brooklin": "Zona Sul",
  "campo belo": "Zona Sul", "moema": "Zona Sul", "vila olimpia": "Zona Sul",
  "campo limpo": "Zona Sul", "capao redondo": "Zona Sul", "jardim sao luis": "Zona Sul",
  "jardim angela": "Zona Sul", "mboi mirim": "Zona Sul", "m'boi mirim": "Zona Sul",
  "cidade ademar": "Zona Sul", "pedreira": "Zona Sul", "cidade dutra": "Zona Sul",
  "socorro": "Zona Sul", "capela do socorro": "Zona Sul", "grajau": "Zona Sul",
  "parelheiros": "Zona Sul", "marsilac": "Zona Sul", "interlagos": "Zona Sul",
  "morumbi": "Zona Sul", "vila andrade": "Zona Sul", "real parque": "Zona Sul",
  "veleiros": "Zona Sul", "americanopolis": "Zona Sul",

  // Zona Leste
  "mooca": "Zona Leste", "tatuape": "Zona Leste", "penha": "Zona Leste",
  "belem": "Zona Leste", "bras": "Zona Leste", "itaquera": "Zona Leste",
  "sao miguel": "Zona Leste", "itaim paulista": "Zona Leste",
  "cidade tiradentes": "Zona Leste", "vila prudente": "Zona Leste",
  "aricanduva": "Zona Leste", "vila formosa": "Zona Leste", "vila carrao": "Zona Leste",
  "ermelino matarazzo": "Zona Leste", "guaianases": "Zona Leste",
  "sao mateus": "Zona Leste", "sapopemba": "Zona Leste", "cangaiba": "Zona Leste",
  "vila matilde": "Zona Leste", "artur alvim": "Zona Leste", "carrao": "Zona Leste",

  // Zona Oeste
  "butanta": "Zona Oeste", "pinheiros": "Zona Oeste", "lapa": "Zona Oeste",
  "vila madalena": "Zona Oeste", "perdizes": "Zona Oeste", "pompeia": "Zona Oeste",
  "barra funda": "Zona Oeste", "alto de pinheiros": "Zona Oeste",
  "itaim bibi": "Zona Sul", "vila leopoldina": "Zona Oeste",
  "jaguare": "Zona Oeste", "rio pequeno": "Zona Oeste",
  "raposo tavares": "Zona Oeste", "vila sonia": "Zona Oeste",
  "jardim paulista": "Zona Oeste", "jardins": "Zona Oeste",
};

// Praça da Sé — referência geográfica
const SE = { lat: -23.5505, lng: -46.6333 };

function normalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

const SP_VARIANTES = ["sao paulo", "são paulo", "s. paulo", "s.paulo", "sp"];

function ehSaoPaulo(cidade) {
  return SP_VARIANTES.includes(normalizar(cidade));
}

function zonaPara(c) {
  // 1) Bairro no mapa (só aplica se for SP)
  const bairroNorm = normalizar(c.bairro);
  if (bairroNorm && BAIRROS_ZONA[bairroNorm]) return BAIRROS_ZONA[bairroNorm];

  // 2) Cidade fora de SP → usa o nome da cidade como zona (Title Case)
  if (c.cidade && !ehSaoPaulo(c.cidade)) {
    return c.cidade.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  // 3) Fallback geográfico por lat/lng (SP com bairro desconhecido)
  if (c.lat == null || c.lng == null) return null; // sem coordenada → não preenche
  const dLat = Number(c.lat) - SE.lat;
  const dLng = Number(c.lng) - SE.lng;
  const distKm = Math.sqrt((dLat * 111) ** 2 + (dLng * 102) ** 2);
  if (distKm <= 3)       return "Centro";
  if (dLat < -0.032)    return "Zona Sul";  // ~3.5km cobre Moema, Brooklin, Vila Mariana
  if (dLat >  0.032)    return "Zona Norte";
  return dLng > 0 ? "Zona Leste" : "Zona Oeste";
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
