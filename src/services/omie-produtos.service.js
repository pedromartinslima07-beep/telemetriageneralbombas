// src/services/omie-produtos.service.js
//
// Catálogo de produtos do Omie para a DANFE: cópia local (tabela
// omie_produtos, migration 091), busca, sugestão por descrição e memória das
// escolhas (omie_produto_vinculos).
//
// POR QUE SUGERIR E NÃO CASAR SOZINHO: a linha do orçamento é texto livre e o
// nome genérico casa com vários produtos. No levantamento de 18/11/2026,
// "Adaptador com rosca" bateu 100% com três adaptadores diferentes, de NCM
// diferentes — e o NCM vai para a nota. Quem emite escolhe; o sistema só põe
// os candidatos certos no topo e lembra a escolha para a próxima vez.
//
// Só LÊ do Omie (ListarProdutos, ListarPedidos). Nada aqui escreve lá.

const { pool } = require("../db");
const omie = require("./omie.service");

const VALIDADE_MS = 24 * 60 * 60 * 1000;

// ── Normalização (a mesma para a busca, a sugestão e a memória) ─────────────
function _decodificar(s) {
  return String(s || "")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function normalizar(s) {
  return _decodificar(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")                       // 1,5cv → 1.5cv
    .replace(/\b(\d+(?:\.\d+)?)\s*(cv|hp)\b/g, "$1cv")    // 1HP / 1 cv → 1cv (a General usa os dois)
    .replace(/\b(\d+)\s*mm\b/g, "$1mm")                   // 60 mm → 60mm
    .replace(/["”¨]/g, "pol")                   // 2" → 2pol
    .replace(/\s+/g, " ").trim();
}

const _STOP = new Set("de da do das dos com para e a o em sem 01 mod un tipo".split(" "));
// Abreviações que o cadastro do Omie usa ("CONJUNTO VAL SELETORA", "TIGRE
// UNIAO SOLD."): sem isto "válvula" não casa com "val".
const _ABREV = { val: "valvula", valv: "valvula", conj: "conjunto", reg: "registro", disj: "disjuntor", sold: "soldavel", hidr: "hidrante", reduc: "reducao", pressuriz: "pressurizacao" };
// Plural fora: "JUNTAS DE VEDAÇÃO" tem de casar com "Junta de vedação",
// "TERMINAIS" com "terminal", "CONEXÕES" com "conexão".
function _singular(t) {
  if (t.length <= 3 || !/^[a-z]+$/.test(t)) return t;
  if (t.endsWith("oes")) return t.slice(0, -3) + "ao";
  if (t.endsWith("ais")) return t.slice(0, -3) + "al";
  if (t.endsWith("eis")) return t.slice(0, -3) + "el";
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}
function _tokens(s) {
  return normalizar(s).split(/[^a-z0-9.]+/).filter(t => t && t.length > 1 && !_STOP.has(t)).map(t => _singular(_ABREV[t] || t));
}

// O que a peça É: a primeira palavra da linha. "Cola para tubo pvc" é cola,
// não tubo; "Junta de vedação para tubulação de bomba de recalque" é junta,
// não bomba. Palavras de embalagem/quantidade antes dela são puladas
// ("Kit terminais…" → terminais; "1 Metro de tubo…" → tubo).
const _NAO_NUCLEO = new Set("kit conjunto jogo par pct pacote metro barra unidade peca nova novo".split(" "));
// No cadastro do Omie a marca costuma vir antes ("AMANCO LUVA PPR 75MM",
// "Deca Torneira De Boia"): para achar o que o PRODUTO é, ela é pulada.
const _MARCAS = new Set("amanco tigre deca krona henkel loctite tramontina schneider tupy mipel weg thebe jacuzzi dancor sodramar claw lepono grundfos steck coel anauger rayma bermad caleffi albacete nautilu".split(" "));
function _nucleo(tokens, pularMarca = false) {
  return tokens.find(t => /^[a-z]/.test(t) && !_NAO_NUCLEO.has(t) && !(pularMarca && _MARCAS.has(t))) || null;
}

// ── Catálogo em memória ─────────────────────────────────────────────────────
// ~1.300 linhas: cabe em memória com folga. Recarrega do banco quando a
// sincronização muda o `atualizado_em`.
let _cache = null;          // { carimbo, itens: [{ row, tokens:Set }], df, porCodigo:Map }
let _sincronizando = null;  // Promise em andamento (uma por processo)

async function _carregarCatalogo() {
  const m = await pool.query(`SELECT max(atualizado_em) AS carimbo, count(*)::int AS n FROM omie_produtos`);
  const carimbo = m.rows[0].carimbo ? new Date(m.rows[0].carimbo).getTime() : 0;
  if (_cache && _cache.carimbo === carimbo) return _cache;
  const r = await pool.query(
    `SELECT codigo_produto, codigo, descricao, ncm, unidade, valor_unitario, vezes_faturado, ultimo_cfop
       FROM omie_produtos WHERE NOT inativo`
  );
  const itens = r.rows.map(row => ({
    row: { ...row, codigo_produto: Number(row.codigo_produto), valor_unitario: row.valor_unitario == null ? null : Number(row.valor_unitario) },
    tokens: new Set(_tokens(`${row.descricao} ${row.codigo || ""}`)),
    nucleo: _nucleo(_tokens(row.descricao), true),
  }));
  const df = {};
  for (const i of itens) for (const t of i.tokens) df[t] = (df[t] || 0) + 1;
  _cache = { carimbo, itens, df, porCodigo: new Map(itens.map(i => [i.row.codigo_produto, i.row])) };
  return _cache;
}

async function estado() {
  const r = await pool.query(`SELECT count(*)::int AS total, max(atualizado_em) AS atualizado_em FROM omie_produtos`);
  return { total: r.rows[0].total, atualizado_em: r.rows[0].atualizado_em, sincronizando: Boolean(_sincronizando) };
}

// ── Sincronizar (Omie → banco) ──────────────────────────────────────────────
// ⚠️ EM SÉRIE DE PROPÓSITO. O Omie aceita uma requisição por método de cada
// vez — paralelizar as páginas devolve "Já existe uma requisição desse
// método sendo executada" (tentado em 18/11/2026). Produtos (~14 páginas de
// 100, ~1 s cada) + pedidos faturados (~16 páginas de 50, ~3,5 s cada) dão
// por volta de 1 minuto e 10 s. Por isso roda em segundo plano, uma vez por dia.
async function _todasPaginas(fn, campo) {
  const out = [];
  for (let pag = 1, tot = 1; pag <= tot; pag++) {
    const j = await fn(pag);
    tot = j.total_de_paginas || 1;
    out.push(...(j[campo] || []));
  }
  return out;
}

async function _sincronizar() {
  // 1. Produtos
  const produtos = await _todasPaginas(omie.listarProdutos, "produto_servico_cadastro");
  if (!produtos.length) throw new Error("O Omie devolveu o catálogo vazio — nada foi alterado.");

  // 2. Uso real: pedidos faturados (etapa 60). Conta e guarda o último CFOP.
  const uso = new Map(); // codigo_produto → { vezes, cfop, data }
  const pedidos = await _todasPaginas(omie.listarPedidos, "pedido_venda_produto");
  {
    for (const p of pedidos) {
      if (p.cabecalho?.etapa !== "60") continue;
      const [d, m, a] = String(p.cabecalho.data_previsao || "").split("/");
      const data = a ? `${a}-${m}-${d}` : null;
      for (const it of p.det || []) {
        const cod = Number(it.produto?.codigo_produto);
        if (!cod) continue;
        const u = uso.get(cod) || { vezes: 0, cfop: null, data: null };
        u.vezes++;
        if (!u.data || (data && data >= u.data)) { u.data = data; u.cfop = it.produto.cfop || u.cfop; }
        uso.set(cod, u);
      }
    }
  }

  // 3. Grava tudo numa transação: quem busca no meio vê o catálogo velho
  //    inteiro, nunca a metade.
  const cli = await pool.connect();
  try {
    await cli.query("BEGIN");
    const agora = new Date();
    // Em lotes de 500 via jsonb: 1.300 INSERTs um a um contra o Railway levam
    // dezenas de segundos; 3 lotes, menos de um.
    // Sem repetidos no mesmo lote (ON CONFLICT não toca a mesma linha duas vezes).
    const unicos = [...new Map(produtos.map(p => [Number(p.codigo_produto), p])).values()];
    const linhas = unicos.map(p => {
      const u = uso.get(Number(p.codigo_produto)) || {};
      return {
        codigo_produto: Number(p.codigo_produto), codigo: String(p.codigo || "").slice(0, 60),
        descricao: _decodificar(p.descricao).trim() || "(sem descrição)",
        ncm: p.ncm || null, unidade: String(p.unidade || "").slice(0, 10) || null,
        valor_unitario: p.valor_unitario == null ? null : Number(p.valor_unitario),
        inativo: p.inativo === "S" || p.bloqueado === "S",
        vezes_faturado: u.vezes || 0, ultimo_cfop: u.cfop || null, ultimo_faturado_em: u.data || null,
      };
    });
    for (let k = 0; k < linhas.length; k += 500) {
      await cli.query(
        `INSERT INTO omie_produtos (codigo_produto, codigo, descricao, ncm, unidade, valor_unitario, inativo,
                                    vezes_faturado, ultimo_cfop, ultimo_faturado_em, atualizado_em)
         SELECT codigo_produto, codigo, descricao, ncm, unidade, valor_unitario, inativo,
                vezes_faturado, ultimo_cfop, ultimo_faturado_em, $2
           FROM jsonb_to_recordset($1::jsonb) AS x(
                codigo_produto BIGINT, codigo VARCHAR, descricao TEXT, ncm VARCHAR, unidade VARCHAR,
                valor_unitario NUMERIC, inativo BOOLEAN, vezes_faturado INTEGER, ultimo_cfop VARCHAR,
                ultimo_faturado_em DATE)
         ON CONFLICT (codigo_produto) DO UPDATE SET
           codigo = EXCLUDED.codigo, descricao = EXCLUDED.descricao, ncm = EXCLUDED.ncm,
           unidade = EXCLUDED.unidade, valor_unitario = EXCLUDED.valor_unitario, inativo = EXCLUDED.inativo,
           vezes_faturado = EXCLUDED.vezes_faturado, ultimo_cfop = EXCLUDED.ultimo_cfop,
           ultimo_faturado_em = EXCLUDED.ultimo_faturado_em, atualizado_em = EXCLUDED.atualizado_em`,
        [JSON.stringify(linhas.slice(k, k + 500)), agora]
      );
    }
    // Produto que sumiu do Omie (excluído) fica inativo, não é apagado: uma
    // linha de orçamento antiga pode apontar para ele.
    await cli.query(`UPDATE omie_produtos SET inativo = true WHERE atualizado_em < $1`, [agora]);
    await cli.query("COMMIT");
  } catch (e) {
    await cli.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
  console.log(`[omie-produtos] catálogo sincronizado: ${produtos.length} produtos, ${uso.size} já faturados`);
  return { ...(await estado()), sincronizando: false };
}

function sincronizar() {
  if (!_sincronizando) {
    _sincronizando = _sincronizar().finally(() => { _sincronizando = null; });
  }
  return _sincronizando;
}

// Dispara a sincronização em segundo plano se o catálogo passou de 24 h.
// Não espera: o modal abre com o que tem.
async function sincronizarSeVelho() {
  const e = await estado();
  const velho = !e.atualizado_em || Date.now() - new Date(e.atualizado_em).getTime() > VALIDADE_MS;
  if (velho && !_sincronizando) {
    sincronizar().catch(err => console.error("[omie-produtos] sincronização falhou:", err.message));
  }
  return { ...e, sincronizando: Boolean(_sincronizando) };
}

// ── Busca e sugestão ────────────────────────────────────────────────────────
// Pontuação: fração do "peso" do texto procurado (IDF — palavra rara vale
// mais que "bomba") que aparece no produto. Desempate e empurrão pequeno para
// o que a General já faturou: entre três adaptadores, o que ela vende sobe.
// ⚠️ MEDIDA É O QUE MAIS ERRA. "Cotovelo 60mm" casava 100% com "COTOVELO CB
// 75MM": "cotovelo" é raro e pesa mais que "60mm" (18/11/2026). Produto que
// traz medida da MESMA unidade mas nenhuma igual à pedida é outro produto —
// perde metade da pontuação e cai para baixo dos que batem a medida.
const _RX_MEDIDA = /^(\d+(?:\.\d+)?)(mm|cv|pol)$/;
function _medidas(tokens) {
  const m = new Map(); // unidade → Set(valores)
  for (const t of tokens) {
    const x = _RX_MEDIDA.exec(t);
    if (!x) continue;
    if (!m.has(x[2])) m.set(x[2], new Set());
    m.get(x[2]).add(x[1]);
  }
  return m;
}

function _pontuar(cat, texto) {
  const tks = _tokens(texto);
  if (!tks.length) return [];
  const N = cat.itens.length;
  // O núcleo pesa o triplo: até 18/11/2026 "Cola para tubo pvc" sugeria três
  // tubos, porque "tubo" + "pvc" somavam mais que "cola" sozinha.
  const nucleo = _nucleo(tks);
  const idf = t => Math.log((N + 1) / ((cat.df[t] || 0) + 1)) * (t === nucleo ? 3 : 1);
  const unicos = [...new Set(tks)];
  const peso = unicos.reduce((a, t) => a + idf(t), 0) || 1;
  const pedidas = _medidas(tks);
  const out = [];
  for (const i of cat.itens) {
    let s = 0;
    for (const t of unicos) if (i.tokens.has(t)) s += idf(t);
    if (s <= 0) continue;
    let base = s / peso;
    // "ROTOR BOMBA 3CV" é rotor, "BRACKET DA BOMBA" é bracket, "TAMPA
    // REGISTRO GLOBO" é tampa: contêm a palavra pedida, mas como peça DE
    // outra coisa. Produto cujo núcleo é outro perde 40%.
    if (nucleo && i.nucleo && i.nucleo !== nucleo) base *= 0.6;
    if (pedidas.size) {
      const doProduto = _medidas(i.tokens);
      for (const [un, vals] of pedidas) {
        const tem = doProduto.get(un);
        if (tem && ![...vals].some(v => tem.has(v))) { base *= 0.5; break; }
      }
    }
    out.push({ row: i.row, score: base + Math.min(0.08, Math.log1p(i.row.vezes_faturado || 0) * 0.02) });
  }
  return out.sort((a, b) => b.score - a.score || (b.row.vezes_faturado || 0) - (a.row.vezes_faturado || 0));
}

function _publico(row, extra = {}) {
  return {
    codigo_produto: row.codigo_produto, codigo: row.codigo, descricao: row.descricao, ncm: row.ncm,
    unidade: row.unidade, valor_unitario: row.valor_unitario, vezes_faturado: row.vezes_faturado || 0,
    cfop: row.ultimo_cfop || null, ...extra,
  };
}

async function buscar(q, limite = 15) {
  let cat = await _carregarCatalogo();
  if (!cat.itens.length) { await sincronizar(); cat = await _carregarCatalogo(); }
  const termo = String(q || "").trim();
  if (!termo) return [];
  // Código exato (PRD00268, 01580…) vem primeiro.
  const porCodigo = cat.itens.filter(i => String(i.row.codigo || "").toLowerCase() === termo.toLowerCase()).map(i => i.row);
  const resto = _pontuar(cat, termo).map(x => x.row).filter(r => !porCodigo.includes(r));
  return [...porCodigo, ...resto].slice(0, limite).map(r => _publico(r));
}

async function _lembrados(descricoes) {
  const chaves = [...new Set(descricoes.map(normalizar).filter(Boolean))];
  if (!chaves.length) return new Map();
  const r = await pool.query(`SELECT descricao_norm, codigo_produto FROM omie_produto_vinculos WHERE descricao_norm = ANY($1::text[])`, [chaves]);
  return new Map(r.rows.map(x => [x.descricao_norm, Number(x.codigo_produto)]));
}

// Para cada descrição: até 3 candidatos, com o lembrado (se houver) no topo
// marcado `lembrado: true`.
async function sugerir(descricoes) {
  const cat = await _carregarCatalogo();
  const lemb = await _lembrados(descricoes);
  const out = {};
  for (const d of descricoes) {
    const cod = lemb.get(normalizar(d));
    const lembrado = cod && cat.porCodigo.get(cod);
    const cands = _pontuar(cat, d).filter(x => !lembrado || x.row.codigo_produto !== cod).slice(0, lembrado ? 2 : 3);
    out[d] = [
      ...(lembrado ? [_publico(lembrado, { lembrado: true })] : []),
      ...cands.map(x => _publico(x.row, { score: Math.round(Math.min(1, x.score) * 100) })),
    ];
  }
  return out;
}

async function porCodigos(codigos) {
  if (!codigos.length) return new Map();
  const cat = await _carregarCatalogo();
  const m = new Map();
  for (const c of codigos) {
    const row = cat.porCodigo.get(Number(c));
    if (row) m.set(Number(c), _publico(row));
  }
  // Produto que ficou inativo depois de escolhido: busca no banco para a
  // prévia mostrar o que é (e o bloqueio dizer por quê).
  const faltam = codigos.map(Number).filter(c => c && !m.has(c));
  if (faltam.length) {
    const r = await pool.query(`SELECT * FROM omie_produtos WHERE codigo_produto = ANY($1::bigint[])`, [faltam]);
    for (const row of r.rows) m.set(Number(row.codigo_produto), _publico({ ...row, codigo_produto: Number(row.codigo_produto) }, { inativo: row.inativo }));
  }
  return m;
}

async function lembrar(pares, db = pool) {
  for (const { descricao, codigo_produto } of pares) {
    const k = normalizar(descricao);
    if (!k || !codigo_produto) continue;
    await db.query(
      `INSERT INTO omie_produto_vinculos (descricao_norm, codigo_produto) VALUES ($1, $2)
       ON CONFLICT (descricao_norm) DO UPDATE SET
         vezes = CASE WHEN omie_produto_vinculos.codigo_produto = EXCLUDED.codigo_produto THEN omie_produto_vinculos.vezes + 1 ELSE 1 END,
         codigo_produto = EXCLUDED.codigo_produto, atualizado_em = now()`,
      [k, Number(codigo_produto)]
    );
  }
}

module.exports = {
  normalizar,
  estado,
  sincronizar,
  sincronizarSeVelho,
  buscar,
  sugerir,
  porCodigos,
  lembrar,
  _pontuar,
  _tokens,
  _resetCache: () => { _cache = null; },
};
