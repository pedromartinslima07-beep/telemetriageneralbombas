// src/services/zona.service.js
//
// **De que zona é este endereço?** — uma pergunta, uma resposta, um lugar.
//
// ⚠️ A ZONA É DERIVADA NO CADASTRO, NÃO DIGITADA (04/09/2026). Até aqui ela era
// só o que o cliente mandasse: `POST /condominios` gravava `zona` cru e, se o
// formulário não mandasse nada, o prédio nascia sem zona **em silêncio**.
// Resultado medido em produção: **14 de 90 condomínios ativos sem zona**, todos
// com bairro E coordenada preenchidos — ou seja, o dado para derivar sempre
// esteve lá e ninguém o usava. Um deles é a própria General.
//
// Isso não é cosmético: **sem zona o prédio não cai no roteiro de ninguém**. A
// régua de `planos_zona_responsavel` é por zona, então ele só chega a um técnico
// se alguém escalar à mão — e 6 dos 14 nem plano tinham.
//
// O Pedro, ao pedir o conserto: *"solução não é você preencher por mim, solução
// é consertar para que nos próximos cadastros a zona seja cadastrada"*.
//
// ⚠️ ESTA TABELA ESTAVA DUPLICADA em `scripts/auto-zona-condominios.js` e em
// `public/admin.js` (`_MP_BAIRROS_ZONA`), e as duas já divergiam: nenhuma
// conhecia Anália Franco, Higienópolis, Indianópolis ou Alto da Mooca — bairros
// que existem na carteira HOJE. Este módulo é a fonte; o script importa daqui.
//
// ⚠️ A ORDEM DAS TRÊS REGRAS IMPORTA e não é gosto:
//   1. bairro conhecido → a resposta mais precisa que existe;
//   2. cidade fora de SP → a própria cidade é a zona (é como a operação fala:
//      "os de Barueri", "o de Atibaia");
//   3. coordenada → o chute geográfico, que erra em bairro de fronteira mas
//      nunca devolve nulo.
// Inverter 1 e 3 faria o chute ganhar do dado bom.

// Praça da Sé — a referência do fallback geográfico.
const SE = { lat: -23.5505, lng: -46.6333 };

function normalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "CHACARA SANTO ANTONIO (ZONA LESTE)" → "chacara santo antonio". O
    // parêntese do cadastro costuma trazer anotação de quem digitou, não bairro.
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim().replace(/\s+/g, " ");
}

const SP_VARIANTES = ["sao paulo", "s. paulo", "s.paulo", "sp"];
function ehSaoPaulo(cidade) {
  return SP_VARIANTES.includes(normalizar(cidade));
}

// ⚠️ TODOS OS BAIRROS DA CARTEIRA ESTÃO AQUI, e isso foi levantado do banco de
// produção em 04/09/2026 (65 bairros distintos), não de memória. Os marcados
// com ← eram os que faltavam e mantinham prédios sem zona.
const BAIRROS_ZONA = {
  // ── Centro ────────────────────────────────────────────────────────────────
  "se": "Centro", "republica": "Centro", "liberdade": "Centro",
  "bela vista": "Centro", "consolacao": "Centro", "santa cecilia": "Centro",
  "cambuci": "Centro", "bom retiro": "Centro", "aclimacao": "Centro",
  "higienopolis": "Centro",              // ←
  "campos eliseos": "Centro", "vila buarque": "Centro",
  // "Centro" é o que a pessoa digita; o distrito oficial é Sé/República.
  // Cadastro segue a boca, não o mapa da prefeitura.
  "centro": "Centro",

  // ── Zona Norte ────────────────────────────────────────────────────────────
  "santana": "Zona Norte", "tucuruvi": "Zona Norte", "tremembe": "Zona Norte",
  "jacana": "Zona Norte", "vila guilherme": "Zona Norte", "vila maria": "Zona Norte",
  "casa verde": "Zona Norte", "limao": "Zona Norte", "freguesia do o": "Zona Norte",
  "pirituba": "Zona Norte", "jaragua": "Zona Norte", "perus": "Zona Norte",
  "brasilandia": "Zona Norte", "mandaqui": "Zona Norte", "cachoeirinha": "Zona Norte",
  "vila nova cachoeirinha": "Zona Norte", "vila medeiros": "Zona Norte",
  "lauzane paulista": "Zona Norte", "jardim sao francisco": "Zona Norte",
  "vila dom pedro ii": "Zona Norte", "vila mangalot": "Zona Norte",
  "vila sabrina": "Zona Norte", "imirim": "Zona Norte", "horto florestal": "Zona Norte",

  // ── Zona Sul ──────────────────────────────────────────────────────────────
  "vila mariana": "Zona Sul", "saude": "Zona Sul", "ipiranga": "Zona Sul",
  "moema": "Zona Sul", "campo belo": "Zona Sul", "brooklin": "Zona Sul",
  "brooklin novo": "Zona Sul", "santo amaro": "Zona Sul", "sto amaro": "Zona Sul",
  "morumbi": "Zona Sul", "itaim bibi": "Zona Sul", "vila olimpia": "Zona Sul",
  "chacara itaim": "Zona Sul", "vila nova conceicao": "Zona Sul",
  "vila clementino": "Zona Sul", "mirandopolis": "Zona Sul", "indianopolis": "Zona Sul",
  "vila andrade": "Zona Sul", "vila mascote": "Zona Sul", "vila cruzeiro": "Zona Sul",
  "parque imperial": "Zona Sul", "jd. taboao": "Zona Sul", "jd taboao": "Zona Sul",
  "jardim taboao": "Zona Sul", "capao redondo": "Zona Sul", "grajau": "Zona Sul",
  "interlagos": "Zona Sul", "socorro": "Zona Sul", "jabaquara": "Zona Sul",
  "cursino": "Zona Sul", "sacoma": "Zona Sul",
  "chacara santo antonio": "Zona Sul",   // ←
  "planalto paulista": "Zona Sul",       // ←
  "vila suzana": "Zona Sul",             // ←
  "campo grande": "Zona Sul", "santo amaro ": "Zona Sul",

  // ── Zona Leste ────────────────────────────────────────────────────────────
  "tatuape": "Zona Leste", "mooca": "Zona Leste", "penha": "Zona Leste",
  "itaquera": "Zona Leste", "sao miguel paulista": "Zona Leste",
  "guaianases": "Zona Leste", "cidade tiradentes": "Zona Leste",
  "belenzinho": "Zona Leste", "catumbi": "Zona Leste", "vila formosa": "Zona Leste",
  "vila carrao": "Zona Leste", "vila prudente": "Zona Leste",
  "vila regente feijo": "Zona Leste", "vila gomes cardim": "Zona Leste",
  "jardim america da penha": "Zona Leste", "jardim norma": "Zona Leste",
  "jd cotinha": "Zona Leste", "artur alvim": "Zona Leste", "sapopemba": "Zona Leste",
  "aricanduva": "Zona Leste", "carrao": "Zona Leste", "agua rasa": "Zona Leste",
  "alto da mooca": "Zona Leste",         // ←
  "analia franco": "Zona Leste",         // ←
  "vila antonieta": "Zona Leste",        // ←
  "parada xv de novembro": "Zona Leste", // ←
  "parada xv": "Zona Leste", "vila matilde": "Zona Leste", "cangaiba": "Zona Leste",
  "ermelino matarazzo": "Zona Leste", "itaim paulista": "Zona Leste",

  // ── Zona Oeste ────────────────────────────────────────────────────────────
  "pinheiros": "Zona Oeste", "perdizes": "Zona Oeste", "lapa": "Zona Oeste",
  "butanta": "Zona Oeste", "vila leopoldina": "Zona Oeste", "barra funda": "Zona Oeste",
  "agua branca": "Zona Oeste", "alto da lapa": "Zona Oeste",
  "cerqueira cesar": "Zona Oeste", "vila pompeia": "Zona Oeste", "pompeia": "Zona Oeste",
  "vila ipojuca": "Zona Oeste",          // ←
  "sumare": "Zona Oeste", "jardim paulista": "Zona Oeste", "jardins": "Zona Oeste",
  "rio pequeno": "Zona Oeste", "raposo tavares": "Zona Oeste", "vila sonia": "Zona Oeste",
  "jaguare": "Zona Oeste", "city america": "Zona Oeste",
};

/**
 * A zona de um endereço, ou `null` quando não há dado nenhum para decidir.
 *
 * @param {{bairro?: string, cidade?: string, lat?: number|string, lng?: number|string}} end
 * @returns {string|null}
 */
function zonaDe(end) {
  if (!end) return null;

  // 1) Fora de Sao Paulo: a cidade E a zona. E como a operacao fala, e e o que
  //    ja esta gravado nos de Barueri, Guarulhos, Osasco, Atibaia e Santo Andre.
  //    ⚠️ ANTES DO BAIRRO: a tabela acima e de bairros DA CAPITAL.
  if (end.cidade && !ehSaoPaulo(end.cidade)) {
    return String(end.cidade).trim().toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // 2) Bairro conhecido — a resposta mais precisa dentro de Sao Paulo.
  const bairro = normalizar(end.bairro);
  if (bairro && BAIRROS_ZONA[bairro]) return BAIRROS_ZONA[bairro];

  // 3) Coordenada: o chute geográfico. Erra em bairro de fronteira, e é melhor
  //    que nulo — sem zona o prédio não entra no roteiro de ninguém.
  if (end.lat == null || end.lng == null) return null;
  const lat = Number(end.lat), lng = Number(end.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const dLat = lat - SE.lat;
  const dLng = lng - SE.lng;
  const distKm = Math.sqrt((dLat * 111) ** 2 + (dLng * 102) ** 2);
  if (distKm <= 3) return "Centro";
  if (dLat < -0.032) return "Zona Sul";
  if (dLat > 0.032) return "Zona Norte";
  return dLng > 0 ? "Zona Leste" : "Zona Oeste";
}

/**
 * A zona a gravar, dado o que veio do formulário e o endereço.
 *
 * ⚠️ O QUE A PESSOA DIGITOU GANHA SEMPRE. A derivação preenche o vazio; ela não
 * corrige ninguém. Um prédio na divisa que a equipe atende como Zona Sul é Zona
 * Sul, mesmo que o CEP diga outra coisa — quem conhece a rota é quem digitou.
 *
 * @returns {string|null}
 */
function zonaParaGravar(zonaInformada, end) {
  const informada = zonaInformada == null ? "" : String(zonaInformada).trim();
  if (informada) return informada;
  return zonaDe(end);
}

module.exports = { zonaDe, zonaParaGravar, BAIRROS_ZONA, normalizar };
