// A zona é derivada no cadastro — nenhum condomínio nasce órfão.
//
//   node scripts/testes/zona-cadastro.test.js
//
// ⚠️ POR QUE ESTE TESTE EXISTE. Até 04/09/2026 o `POST /condominios` gravava o
// campo `zona` cru: se o formulário não mandasse nada, o prédio nascia SEM ZONA,
// em silêncio. Medido em produção: **14 de 90 condomínios ativos** assim —
// todos com bairro E coordenada preenchidos, ou seja, o dado para derivar sempre
// esteve lá e ninguém o usava. Um deles é a própria General.
//
// ⚠️ E NÃO É COSMÉTICO: sem zona o prédio **não cai no roteiro de ninguém**,
// porque a régua de `planos_zona_responsavel` é por zona. Ele só chega a um
// técnico se alguém escalar à mão — e 6 dos 14 nem plano tinham.
//
// O Pedro, ao pedir o conserto: *"solução não é você preencher por mim, solução
// é consertar para que nos próximos cadastros a zona seja cadastrada"*. Este
// teste é a prova de que o cadastro conserta sozinho daqui para frente.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa tudo no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { zonaDe } = require("../../src/services/zona.service");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const r = [];
const ok = (nome, cond, extra) => {
  r.push({ nome, cond: !!cond });
  console.log((cond ? "✓ " : "✗ ") + nome + (extra ? "  — " + extra : ""));
};

async function main() {
  const app = express();
  app.use(express.json());
  app.use("/condominios", require("../../src/routes/condominios.routes").condominiosRouter);
  const srv = app.listen(0);
  const base = "http://127.0.0.1:" + srv.address().port;
  const H = {
    Authorization: "Bearer " + jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" }),
    "Content-Type": "application/json",
  };
  const lixo = [];
  const criar = async (corpo) => {
    const resp = await fetch(base + "/condominios", { method: "POST", headers: H, body: JSON.stringify(corpo) });
    const j = await resp.json();
    if (j?.id) lixo.push(j.id);
    return { status: resp.status, j };
  };

  try {
    const suf = String(Date.now()).slice(-8);

    // ── A regra pura, sem HTTP ───────────────────────────────────────────────
    // Os quatro bairros que estavam FORA da tabela antiga e mantinham prédios
    // reais sem zona em produção.
    ok("bairro conhecido → zona certa", zonaDe({ bairro: "Anália Franco", cidade: "SAO PAULO" }) === "Zona Leste");
    ok("e os que faltavam na tabela antiga",
       zonaDe({ bairro: "HIGIENOPOLIS", cidade: "SAO PAULO" }) === "Centro" &&
       zonaDe({ bairro: "Indianópolis", cidade: "SAO PAULO" }) === "Zona Sul" &&
       zonaDe({ bairro: "ALTO DA MOOCA", cidade: "SAO PAULO" }) === "Zona Leste" &&
       zonaDe({ bairro: "VILA IPOJUCA", cidade: "SAO PAULO" }) === "Zona Oeste");
    // O parêntese é anotação de quem digitou; a normalização o ignora.
    ok("parêntese do cadastro é ignorado",
       zonaDe({ bairro: "VILA MARIANA (PERTO DO METRO)", cidade: "SAO PAULO" }) === "Zona Sul");
    // ⚠️ BAIRRO DE NOME REPETIDO (01/10/2026). Este teste afirmava que
    // "CHACARA SANTO ANTONIO (ZONA LESTE)" é Zona Sul, e a anotação estava
    // CERTA: há uma Chácara Santo Antônio na Sul e outra na Leste (CEP 034xx).
    // Mesma coisa com o Jardim São Francisco do Atua Parque Ecológico 1, que
    // estava na Zona Norte. O CEP desempata; sem CEP, a coordenada.
    ok("CEP desempata bairro de nome repetido",
       zonaDe({ bairro: "JARDIM SAO FRANCISCO (ZONA LESTE)", cidade: "SAO PAULO", cep: "03718090" }) === "Zona Leste" &&
       zonaDe({ bairro: "CHACARA SANTO ANTONIO (ZONA LESTE)", cidade: "SAO PAULO", cep: "03408000" }) === "Zona Leste" &&
       zonaDe({ bairro: "CHACARA SANTO ANTONIO", cidade: "SAO PAULO", cep: "04707000" }) === "Zona Sul");
    ok("sem CEP, bairro ambíguo vai para a coordenada",
       zonaDe({ bairro: "JARDIM SAO FRANCISCO", cidade: "SAO PAULO", lat: -23.4986, lng: -46.5274 }) === "Zona Leste");
    // 01 e 05 ficam de fora: Jardins (014xx) e Morumbi/Vila Suzana (056xx) têm
    // convenção da casa diferente do prefixo, e Pirituba é 05xxx na Zona Norte.
    ok("CEP 01/05 não decide — o bairro decide",
       zonaDe({ bairro: "JARDIM PAULISTA", cidade: "SAO PAULO", cep: "01415000" }) === "Zona Oeste" &&
       zonaDe({ bairro: "VILA SUZANA", cidade: "SAO PAULO", cep: "05641030" }) === "Zona Sul" &&
       zonaDe({ bairro: "PIRITUBA", cidade: "SAO PAULO", cep: "05144000" }) === "Zona Norte");
    ok("acento e caixa não importam",
       zonaDe({ bairro: "perdizes" }) === zonaDe({ bairro: "PERDIZES" }));
    // Fora de SP a cidade É a zona — é como a operação fala, e é o que já está
    // gravado nos de Barueri, Guarulhos, Osasco, Atibaia e Santo André.
    ok("fora de São Paulo, a cidade vira a zona",
       zonaDe({ bairro: "Centro", cidade: "Barueri" }) === "Barueri");
    // O chute geográfico é o último recurso, e existe para nunca devolver nulo
    // quando há coordenada.
    ok("sem bairro conhecido, a coordenada decide",
       zonaDe({ bairro: "Rua Que Não Existe", cidade: "SAO PAULO", lat: -23.65, lng: -46.70 }) === "Zona Sul");
    // ⚠️ O QUADRANTE ANTIGO (01/10/2026) perguntava "ao norte da Sé?" antes de
    // olhar a longitude, e o Atua Parque Ecológico (Parque Ecológico do Tietê,
    // Zona Leste) caía na Zona Norte. Nordeste não é Norte, sudeste não é Sul.
    ok("nordeste da Sé não vira Zona Norte",
       zonaDe({ cidade: "SAO PAULO", lat: -23.487, lng: -46.515 }) === "Zona Leste" &&
       zonaDe({ cidade: "SAO PAULO", lat: -23.525, lng: -46.545 }) === "Zona Leste");
    ok("e a Vila Maria, a leste da Sé, continua Zona Norte",
       zonaDe({ cidade: "SAO PAULO", lat: -23.515, lng: -46.580 }) === "Zona Norte");
    ok("noroeste da Sé não vira Zona Norte",
       zonaDe({ cidade: "SAO PAULO", lat: -23.523, lng: -46.700 }) === "Zona Oeste");
    ok("sem nada, devolve null (e o cadastro não inventa)",
       zonaDe({ bairro: null, cidade: "SAO PAULO" }) === null);

    // ── O cadastro: é AQUI que o defeito morava ──────────────────────────────
    const semZona = await criar({ nome: "Zona Auto " + suf, bairro: "Anália Franco", cidade: "SAO PAULO" });
    ok("criar SEM mandar zona responde 201", semZona.status === 201, "status " + semZona.status);
    ok("e o prédio NÃO nasce órfão", semZona.j.zona === "Zona Leste",
       "zona=" + JSON.stringify(semZona.j.zona));

    const zonaVazia = await criar({ nome: "Zona Vazia " + suf, bairro: "Perdizes", cidade: "SAO PAULO", zona: "" });
    ok("zona em branco também deriva", zonaVazia.j.zona === "Zona Oeste",
       "zona=" + JSON.stringify(zonaVazia.j.zona));

    const comCep = await criar({ nome: "Zona Cep " + suf, bairro: "JARDIM SAO FRANCISCO (ZONA LESTE)",
                                 cidade: "SAO PAULO", cep: "03718-090" });
    ok("o cadastro passa o CEP para a derivação", comCep.j.zona === "Zona Leste",
       "zona=" + JSON.stringify(comCep.j.zona));

    // ⚠️ QUEM DIGITOU GANHA. Um prédio na divisa que a equipe atende como Zona
    // Sul é Zona Sul, mesmo que o bairro diga outra coisa — a derivação
    // preenche o vazio, não corrige ninguém.
    const comZona = await criar({ nome: "Zona Manual " + suf, bairro: "Perdizes", cidade: "SAO PAULO", zona: "Zona Sul" });
    ok("mas a zona digitada à mão GANHA da derivada", comZona.j.zona === "Zona Sul",
       "zona=" + JSON.stringify(comZona.j.zona));

    const soCoord = await criar({ nome: "Zona Coord " + suf, cidade: "SAO PAULO", lat: -23.48, lng: -46.62 });
    ok("só com coordenada, ainda assim tem zona", !!soCoord.j.zona,
       "zona=" + JSON.stringify(soCoord.j.zona));

    // ── A edição: o caminho de volta que precisava fechar junto ──────────────
    const orfao = await criar({ nome: "Zona Orfa " + suf, cidade: "SAO PAULO" });
    ok("(preparo) sem bairro e sem coordenada, nasce sem zona", orfao.j.zona === null);

    // Preencher o bairro depois é exatamente quando a derivação passa a ser
    // possível — ignorar isso deixaria o cadastro consertado e o dado velho
    // intacto.
    const pat = await fetch(base + "/condominios/" + orfao.j.id, {
      method: "PATCH", headers: H, body: JSON.stringify({ bairro: "Itaquera" }),
    });
    const jp = await pat.json();
    ok("editar o BAIRRO preenche a zona que faltava", jp.zona === "Zona Leste",
       "zona=" + JSON.stringify(jp.zona));

    // ⚠️ E não reescreve zona existente: quem já tem dono fica como está.
    const pat2 = await fetch(base + "/condominios/" + comZona.j.id, {
      method: "PATCH", headers: H, body: JSON.stringify({ bairro: "Moema" }),
    });
    const jp2 = await pat2.json();
    ok("mas NÃO reescreve a zona de quem já tem uma", jp2.zona === "Zona Sul",
       "zona=" + JSON.stringify(jp2.zona));

    // Esvaziar a zona é pedir "descubra por mim", não "deixe sem".
    const pat3 = await fetch(base + "/condominios/" + comZona.j.id, {
      method: "PATCH", headers: H, body: JSON.stringify({ zona: "" }),
    });
    const jp3 = await pat3.json();
    ok("esvaziar a zona faz derivar de novo, não deixar vazia", !!jp3.zona,
       "zona=" + JSON.stringify(jp3.zona));

    // ── A carteira real ──────────────────────────────────────────────────────
    // ⚠️ Todo bairro que existe HOJE na carteira precisa resolver. Se um novo
    // aparecer e cair no chute geográfico, este teste avisa antes de virar
    // prédio órfão.
    // Endereço inteiro, não só o bairro: bairro de nome repetido só resolve
    // com o CEP (ou a coordenada) junto.
    const carteira = await pool.query(
      "SELECT bairro, cidade, cep, lat, lng FROM condominios WHERE ativo AND bairro IS NOT NULL AND bairro <> ''"
    );
    const semResolver = carteira.rows.filter((c) => !zonaDe(c));
    ok("todo bairro da carteira de teste resolve", semResolver.length === 0,
       semResolver.length ? semResolver.map((c) => c.bairro).join(", ") : "");
  } finally {
    for (const id of lixo) await pool.query("DELETE FROM condominios WHERE id = $1", [id]).catch(() => {});
    srv.closeAllConnections?.();
    await new Promise((res) => srv.close(res));
    await pool.end();
  }
}

main()
  .then(() => {
    const bons = r.filter((x) => x.cond).length;
    console.log(`\n${bons}/${r.length} passaram`);
    process.exitCode = bons === r.length ? 0 : 1;
  })
  .catch((e) => { console.error("ERRO:", e); process.exitCode = 1; });
