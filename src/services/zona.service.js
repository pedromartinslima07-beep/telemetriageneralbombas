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
// ⚠️ A ORDEM DAS QUATRO REGRAS IMPORTA e não é gosto:
//   1. cidade fora de SP → a própria cidade é a zona (é como a operação fala:
//      "os de Barueri", "o de Atibaia");
//   2. CEP de prefixo inequívoco (02 Norte, 03 Leste, 04 Sul, 08 Leste);
//   3. bairro conhecido;
//   4. coordenada → a zona do bairro de referência mais próximo.
// Cada uma é mais confiável que a seguinte. Inverter faria o chute ganhar do
// dado bom.
//
// ⚠️ O CEP GANHA DO BAIRRO PORQUE SP TEM BAIRRO COM NOME REPETIDO (01/10/2026).
// O Atua Parque Ecológico 1 estava na Zona Norte das preventivas: o cadastro
// dizia "JARDIM SAO FRANCISCO (ZONA LESTE)", a normalização joga fora o
// parêntese, e a tabela só conhecia o Jardim São Francisco da Zona Norte. O
// Praça das Águas, mesma coisa com a Chácara Santo Antônio: há uma na Sul
// (Santo Amaro) e outra na Leste (Tatuapé), e ele estava na Sul. O CEP vem do
// ViaCEP e não tem essa ambiguidade. Medido em produção: os prefixos 02/03/04/08
// batiam com a zona gravada em 55 de 57 prédios, e as duas exceções eram estes
// dois erros. Os prefixos 01 e 05 NÃO entram: 014xx são os Jardins (que a casa
// chama de Zona Oeste), 056xx–058xx são Morumbi/Vila Suzana/Campo Limpo (que a
// casa chama de Zona Sul) e Pirituba/Perus são 05xxx e Zona Norte.
//
// ⚠️ O FALLBACK POR COORDENADA ERA UM QUADRANTE (até 01/10/2026). Ele perguntava
// "está ~3,5 km ao norte da Sé?" ANTES de olhar a longitude — todo o nordeste
// virava Zona Norte e todo o sudeste, Zona Sul. A divisão de SP não é simétrica
// (a Sul engole o sudoeste; a Norte vai até a Vila Maria, a leste da Sé), então
// a fronteira agora vem de pontos reais. E coordenada é o último recurso por um
// motivo: há prédios com o pino no centro geográfico da cidade (geocoding que
// não achou o endereço), e o CEP e o bairro deles são melhores que o pino.

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

  // ── Trazidos da cópia do mapa do admin + periferia (01/10/2026) ───────────
  // O `_MP_BAIRROS_ZONA` do admin.js conhecia alguns que esta tabela não; ele
  // saiu de lá e o mapa passou a ler a zona gravada.
  "belem": "Zona Leste", "bras": "Zona Leste", "sao miguel": "Zona Leste",
  "sao mateus": "Zona Leste", "engenheiro goulart": "Zona Leste",
  "ponte rasa": "Zona Leste", "vila jacui": "Zona Leste", "jardim helena": "Zona Leste",
  "vila curuca": "Zona Leste", "cidade patriarca": "Zona Leste",
  "parque do carmo": "Zona Leste", "jose bonifacio": "Zona Leste",
  "vila esperanca": "Zona Leste", "penha de franca": "Zona Leste",
  "vila re": "Zona Leste", "lajeado": "Zona Leste", "iguatemi": "Zona Leste",
  "parque novo mundo": "Zona Norte", "vila ede": "Zona Norte",
  "campo limpo": "Zona Sul", "jardim sao luis": "Zona Sul", "jardim angela": "Zona Sul",
  "mboi mirim": "Zona Sul", "m'boi mirim": "Zona Sul", "cidade ademar": "Zona Sul",
  "pedreira": "Zona Sul", "cidade dutra": "Zona Sul", "capela do socorro": "Zona Sul",
  "parelheiros": "Zona Sul", "marsilac": "Zona Sul", "real parque": "Zona Sul",
  "veleiros": "Zona Sul", "americanopolis": "Zona Sul",
  "vila madalena": "Zona Oeste", "alto de pinheiros": "Zona Oeste",
};

// ⚠️ PONTOS DE REFERÊNCIA DO FALLBACK GEOGRÁFICO: o centro aproximado de
// bairros conhecidos, cobrindo a capital inteira. Coordenada sem bairro
// conhecido ganha a zona do ponto mais próximo — a fronteira entre zonas
// sai daqui, não de uma reta. A zona de cada ponto tem de bater com a de
// `BAIRROS_ZONA` (o teste confere). Buraco no mapa → acrescente um ponto.
const REFERENCIAS = [
  // Centro
  [-23.5505, -46.6340, "Centro"],     // Sé
  [-23.5430, -46.6420, "Centro"],     // República
  [-23.5580, -46.6480, "Centro"],     // Bela Vista
  [-23.5580, -46.6350, "Centro"],     // Liberdade
  [-23.5270, -46.6400, "Centro"],     // Bom Retiro
  [-23.5370, -46.6520, "Centro"],     // Santa Cecília
  [-23.5660, -46.6200, "Centro"],     // Cambuci
  [-23.5720, -46.6300, "Centro"],     // Aclimação
  [-23.5530, -46.6600, "Centro"],     // Consolação
  // Zona Norte
  [-23.5020, -46.6250, "Zona Norte"], // Santana
  [-23.4800, -46.6040, "Zona Norte"], // Tucuruvi
  [-23.4550, -46.6100, "Zona Norte"], // Tremembé
  [-23.4620, -46.5800, "Zona Norte"], // Jaçanã
  [-23.5110, -46.6050, "Zona Norte"], // Vila Guilherme
  [-23.5150, -46.5800, "Zona Norte"], // Vila Maria
  [-23.5180, -46.5650, "Zona Norte"], // Parque Novo Mundo
  [-23.4920, -46.5830, "Zona Norte"], // Vila Medeiros
  [-23.5080, -46.6600, "Zona Norte"], // Casa Verde
  [-23.5050, -46.6760, "Zona Norte"], // Limão
  [-23.4970, -46.6970, "Zona Norte"], // Freguesia do Ó
  [-23.4670, -46.6880, "Zona Norte"], // Brasilândia
  [-23.4700, -46.6650, "Zona Norte"], // Cachoeirinha
  [-23.4820, -46.6330, "Zona Norte"], // Mandaqui
  [-23.4870, -46.7270, "Zona Norte"], // Pirituba
  [-23.4550, -46.7450, "Zona Norte"], // Jaraguá
  [-23.4050, -46.7520, "Zona Norte"], // Perus
  // Zona Leste
  [-23.5450, -46.6150, "Zona Leste"], // Brás
  [-23.5400, -46.5940, "Zona Leste"], // Belém
  [-23.5600, -46.5980, "Zona Leste"], // Mooca
  [-23.5400, -46.5750, "Zona Leste"], // Tatuapé
  [-23.5650, -46.5750, "Zona Leste"], // Água Rasa
  [-23.5850, -46.5800, "Zona Leste"], // Vila Prudente
  [-23.6050, -46.5150, "Zona Leste"], // Sapopemba
  [-23.5230, -46.5430, "Zona Leste"], // Penha
  [-23.5050, -46.5280, "Zona Leste"], // Cangaíba
  [-23.4900, -46.5220, "Zona Leste"], // Engenheiro Goulart
  [-23.5080, -46.5050, "Zona Leste"], // Ponte Rasa
  [-23.5000, -46.4800, "Zona Leste"], // Ermelino Matarazzo
  [-23.4970, -46.4600, "Zona Leste"], // Vila Jacuí
  [-23.4970, -46.4450, "Zona Leste"], // São Miguel
  [-23.4800, -46.4200, "Zona Leste"], // Jardim Helena
  [-23.5000, -46.4000, "Zona Leste"], // Itaim Paulista
  [-23.5400, -46.4570, "Zona Leste"], // Itaquera
  [-23.5430, -46.4100, "Zona Leste"], // Guaianases
  [-23.5830, -46.4050, "Zona Leste"], // Cidade Tiradentes
  [-23.6050, -46.4750, "Zona Leste"], // São Mateus
  [-23.5670, -46.5450, "Zona Leste"], // Vila Formosa
  [-23.5700, -46.5150, "Zona Leste"], // Aricanduva
  [-23.5380, -46.5270, "Zona Leste"], // Vila Matilde
  [-23.5400, -46.4850, "Zona Leste"], // Artur Alvim
  [-23.5500, -46.5400, "Zona Leste"], // Carrão
  // Zona Sul
  [-23.5890, -46.6350, "Zona Sul"],   // Vila Mariana
  [-23.6170, -46.6380, "Zona Sul"],   // Saúde
  [-23.5900, -46.6050, "Zona Sul"],   // Ipiranga
  [-23.6050, -46.6000, "Zona Sul"],   // Sacomã
  [-23.6150, -46.6200, "Zona Sul"],   // Cursino
  [-23.6400, -46.6450, "Zona Sul"],   // Jabaquara
  [-23.6000, -46.6650, "Zona Sul"],   // Moema
  [-23.6250, -46.6700, "Zona Sul"],   // Campo Belo
  [-23.6150, -46.6900, "Zona Sul"],   // Brooklin
  [-23.5850, -46.6800, "Zona Sul"],   // Itaim Bibi
  [-23.5960, -46.6860, "Zona Sul"],   // Vila Olímpia
  [-23.6500, -46.7050, "Zona Sul"],   // Santo Amaro
  [-23.6000, -46.7200, "Zona Sul"],   // Morumbi
  [-23.6300, -46.7350, "Zona Sul"],   // Vila Andrade
  [-23.6400, -46.7600, "Zona Sul"],   // Campo Limpo
  [-23.6650, -46.7750, "Zona Sul"],   // Capão Redondo
  [-23.6650, -46.7350, "Zona Sul"],   // Jardim São Luís
  [-23.7050, -46.7700, "Zona Sul"],   // Jardim Ângela
  [-23.6700, -46.6550, "Zona Sul"],   // Cidade Ademar
  [-23.6950, -46.6700, "Zona Sul"],   // Pedreira
  [-23.6800, -46.7000, "Zona Sul"],   // Socorro
  [-23.7000, -46.6900, "Zona Sul"],   // Interlagos
  [-23.7150, -46.7000, "Zona Sul"],   // Cidade Dutra
  [-23.7600, -46.6900, "Zona Sul"],   // Grajaú
  [-23.8300, -46.7300, "Zona Sul"],   // Parelheiros
  // Zona Oeste
  [-23.5670, -46.6920, "Zona Oeste"], // Pinheiros
  [-23.5530, -46.6900, "Zona Oeste"], // Vila Madalena
  [-23.5700, -46.6600, "Zona Oeste"], // Jardim Paulista
  [-23.5370, -46.6780, "Zona Oeste"], // Perdizes
  [-23.5300, -46.6850, "Zona Oeste"], // Pompeia
  [-23.5250, -46.6650, "Zona Oeste"], // Barra Funda
  [-23.5200, -46.6900, "Zona Oeste"], // Água Branca
  [-23.5220, -46.7050, "Zona Oeste"], // Lapa
  [-23.5280, -46.7320, "Zona Oeste"], // Vila Leopoldina
  [-23.5500, -46.7120, "Zona Oeste"], // Alto de Pinheiros
  [-23.5700, -46.7200, "Zona Oeste"], // Butantã
  [-23.5650, -46.7500, "Zona Oeste"], // Rio Pequeno
  [-23.5450, -46.7500, "Zona Oeste"], // Jaguaré
  [-23.5950, -46.7400, "Zona Oeste"], // Vila Sônia
  [-23.5900, -46.7850, "Zona Oeste"], // Raposo Tavares
];

// Nomes que existem em mais de uma zona de SP. A tabela guarda o mais comum na
// carteira, mas sem CEP o nome sozinho não decide — vai para a coordenada.
const BAIRROS_AMBIGUOS = new Set([
  "jardim sao francisco",   // Zona Norte e Zona Leste (CEP 037xx)
  "chacara santo antonio",  // Zona Sul (Santo Amaro) e Zona Leste (CEP 034xx)
]);

/**
 * A zona pelo CEP da capital, só nos prefixos sem ambiguidade; senão `null`.
 */
function zonaPorCep(cep) {
  const d = String(cep || "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  const n = Number(d);
  if (n >= 2000000 && n <= 2999999) return "Zona Norte";
  if (n >= 3000000 && n <= 3999999) return "Zona Leste";
  if (n >= 4000000 && n <= 4999999) return "Zona Sul";
  if (n >= 8000000 && n <= 8499999) return "Zona Leste";
  return null;
}

/**
 * A zona do ponto de referência mais próximo, ou `null` sem coordenada válida.
 */
function zonaPorCoordenada(lat, lng) {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  // Na latitude de SP, 1° de longitude ≈ 102 km e 1° de latitude ≈ 111 km.
  let melhor = null, menor = Infinity;
  for (const [rLat, rLng, zona] of REFERENCIAS) {
    const d = ((la - rLat) * 111) ** 2 + ((lo - rLng) * 102) ** 2;
    if (d < menor) { menor = d; melhor = zona; }
  }
  return melhor;
}

/**
 * A zona de um endereço, ou `null` quando não há dado nenhum para decidir.
 *
 * @param {{bairro?: string, cidade?: string, cep?: string, lat?: number|string, lng?: number|string}} end
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

  // 2) CEP de prefixo inequívoco — resolve bairro de nome repetido.
  const porCep = zonaPorCep(end.cep);
  if (porCep) return porCep;

  // 3) Bairro conhecido, a não ser que o nome exista em mais de uma zona.
  const bairro = normalizar(end.bairro);
  if (bairro && BAIRROS_ZONA[bairro] && !BAIRROS_AMBIGUOS.has(bairro)) {
    return BAIRROS_ZONA[bairro];
  }

  // 4) Coordenada: a zona do bairro de referência mais próximo. É melhor que
  //    nulo — sem zona o prédio não entra no roteiro de ninguém.
  return zonaPorCoordenada(end.lat, end.lng);
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

module.exports = {
  zonaDe, zonaParaGravar, zonaPorCep, zonaPorCoordenada,
  BAIRROS_ZONA, BAIRROS_AMBIGUOS, REFERENCIAS, normalizar,
};
