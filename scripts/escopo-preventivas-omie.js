// O escopo de cada preventiva, tirado do texto das notas do Omie
// (migration 110, 27/11/2026).
//
//   node scripts/escopo-preventivas-omie.js [--prod] [--gravar]
//
// Sem --gravar só MOSTRA a proposta (prédio, preventiva, o que o texto da nota
// diz e os sistemas que sairiam). Com --gravar, grava `sistemas` apenas nas
// preventivas que ainda estão VAZIAS — o que alguém já conferiu à mão não é
// sobrescrito.
//
// De onde vem o texto: o item do contrato no Omie diz "CONSERTO" em quase
// todos; o que diz o serviço é o campo "dados adicionais da NF" da O.S. que o
// Omie gera a cada faturamento (`ConsultarOS` → `cDadosAdicNF`). Lê a nota mais
// recente de cada contrato dos últimos ~60 dias e a O.S. dela. Só leitura no
// Omie (`ListarNFSEs`, `ConsultarOS`), com pausa entre as chamadas.
//
// ⚠️ É PONTO DE PARTIDA, NÃO REGRA. O texto do Omie é digitado à mão; depois do
// primeiro preenchimento quem manda é o cadastro da preventiva (Editar, no
// admin). Por isso o script não mexe em preventiva já preenchida.
//
// ⚠️ PRÉDIO COM DOIS SERVIÇOS (Air Club, Atua): os dois contratos caem na mesma
// preventiva enquanto o prédio tiver uma só, e o script avisa. O certo é criar
// a segunda preventiva e escolher em Contratos qual contrato paga qual.
require("dotenv").config({ quiet: true });
if (process.argv.includes("--prod")) process.env.NODE_ENV = "production";
const GRAVAR = process.argv.includes("--gravar");

const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");
const omie = require("../src/services/omie.service");
const { pool } = require("../src/db");
const omieContratos = require("../src/services/omie-contratos.service");
const { rotulosSistemas } = require("../src/services/preventivas.service");

// Texto da nota → chaves da lista fixa. Sem acento e em maiúsculas.
const REGRAS = [
  [/SISTEMA DE BOMBAS/, "bombas"],
  [/QUADRO DE COMANDO/, "quadro"],
  [/VALVULA REDUTORA/, "valvula_redutora"],
  [/GERADOR/, "gerador"],
  [/TROCADOR DE CALOR/, "trocador_calor"],
  [/EXAUSTAO DA CHURRASQUEIRA/, "exaustao_churrasqueira"],
  [/EXAUSTAO DA PISCINA/, "exaustao_piscina"],
  [/PRESSURIZACAO/, "pressurizacao_escadas"],
  [/FOTOVO[L]?TAICO/, "fotovoltaico"],
  [/RESERVATORIOS/, "reservatorios_prumadas"],
  [/RALOS E CAIXAS/, "ralos_caixas"],
  [/CAIXA DE PASSAGEM COLETORA/, "caixa_coletora"],
];
function sistemasDoTexto(t) {
  const n = String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return REGRAS.filter(([re]) => re.test(n)).map(([, k]) => k);
}

const br = d => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const { url, alvo } = resolverDatabaseUrl();
  console.log(`Banco: ${alvo} — ${descreverAlvo(url)} · ${GRAVAR ? "GRAVANDO" : "só mostrando (use --gravar)"}`);

  // A nota mais recente de cada contrato, nos últimos 60 dias.
  const ate = new Date(), de = new Date(); de.setDate(de.getDate() - 60);
  const notas = [];
  for (let p = 1; p <= 40; p++) {
    let j;
    try { j = await omie.chamar("servicos/nfse/", "ListarNFSEs", { nPagina: p, nRegPorPagina: 100, dEmiInicial: br(de), dEmiFinal: br(ate) }); }
    catch (e) { if (e.naoEncontrado) break; throw e; }
    const l = j.nfseEncontradas || [];
    notas.push(...l);
    const t = j.nTotPaginas || j.total_de_paginas;
    if (l.length < 100 || (t && p >= t)) break;
  }
  const ultima = new Map(); // nCodigoContrato → { os, data }
  for (const n of notas) {
    const ctr = Number(n.OrdemServico?.nCodigoContrato);
    if (!ctr || n.Cabecalho?.cStatusNFSe === "C") continue;
    const d = String(n.Emissao?.cDataEmissao || "").split("/").reverse().join("-");
    if (!ultima.has(ctr) || ultima.get(ctr).data < d) ultima.set(ctr, { os: Number(n.OrdemServico.nCodigoOS), data: d });
  }

  const { contratos } = await omieContratos.listar();
  const porPlano = new Map(); // plano_id → { sistemas:Set, contratos:[], textos:[] }
  const avisos = [];
  for (const k of contratos.filter(c => c.ativo && !c.vigencia_vencida)) {
    const u = ultima.get(k.omie_codigo);
    if (!u) { avisos.push(`${k.numero} ${k.cliente?.nome_fantasia || ""}: sem nota nos últimos 60 dias`); continue; }
    if (!k.plano_id) { avisos.push(`${k.numero} ${k.condominio_nome || k.cliente?.nome_fantasia || ""}: sem preventiva resolvida (${k.plano_ligacao})`); continue; }
    let texto = "";
    try { texto = (await omie.chamar("servicos/os/", "ConsultarOS", { nCodOS: u.os })).InformacoesAdicionais?.cDadosAdicNF || ""; }
    catch (e) { avisos.push(`${k.numero}: ConsultarOS falhou (${e.message})`); continue; }
    await pausa(400);
    const g = porPlano.get(k.plano_id) || { sistemas: new Set(), contratos: [], predio: k.condominio_nome };
    sistemasDoTexto(texto).forEach(s => g.sistemas.add(s));
    g.contratos.push(`${k.numero} (R$ ${k.valor_mensal})`);
    porPlano.set(k.plano_id, g);
  }

  const atuais = await pool.query(`SELECT id, sistemas FROM planos_manutencao WHERE id = ANY($1::int[])`, [[...porPlano.keys()]]);
  const jaTem = new Map(atuais.rows.map(r => [r.id, r.sistemas || []]));
  let gravados = 0;
  for (const [planoId, g] of [...porPlano].sort((a, b) => String(a[1].predio).localeCompare(String(b[1].predio), "pt-BR"))) {
    const lista = [...g.sistemas];
    const tem = jaTem.get(planoId) || [];
    const marca = tem.length ? "já preenchida, não mexe" : lista.length ? (GRAVAR ? "gravada" : "a gravar") : "texto sem sistema conhecido";
    if (g.contratos.length > 1) avisos.push(`${g.predio}: ${g.contratos.length} contratos na mesma preventiva (${g.contratos.join(", ")}). Setores, ou dois serviços?`);
    console.log(`${g.predio} · preventiva nº ${planoId}: ${rotulosSistemas(lista).join(", ") || "—"}  [${marca}]`);
    if (GRAVAR && !tem.length && lista.length) {
      await pool.query(`UPDATE planos_manutencao SET sistemas = $2::text[] WHERE id = $1 AND sistemas = '{}'`, [planoId, lista]);
      gravados++;
    }
  }
  if (avisos.length) console.log("\nConferir:\n  " + avisos.join("\n  "));
  console.log(`\n${porPlano.size} preventivas lidas${GRAVAR ? `, ${gravados} gravadas` : ""}.`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
}

module.exports = { sistemasDoTexto };
