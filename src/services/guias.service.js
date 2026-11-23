// src/services/guias.service.js
//
// Guias de tributos → contas a pagar no Omie (migration 100,
// docs/modulos/guias-tributos.md).
//
// O caminho: o PDF que o contador publica no Onvio entra aqui
// (`receber`), o leitor (guia-leitura.service.js) tira tipo, valor,
// vencimento e código de barras, a regra do tipo (`guias_regras`) põe
// fornecedor, categoria e conta, alguém confere na tela e "Lançar no Omie"
// (`lancar`) cria a conta a pagar com o PDF anexado.
//
// ⚠️ AS TRAVAS CONTRA CONTA A PAGAR EM DOBRO (o Omie não tem ambiente de
// teste, e hoje as guias são lançadas à mão lá):
//   1. código de barras único entre as guias vivas (índice da 100): a mesma
//      guia subida duas vezes é a mesma linha;
//   2. código de integração fixo por guia (GB-GUIA-<id>): antes de incluir, o
//      sistema pergunta ao Omie se ele já existe (ConsultarContaPagar). Queda
//      sem resposta vira `incerto`, e mandar de novo só consulta;
//   3. antes de incluir, os títulos do fornecedor no Omie são comparados com
//      a guia (mesmo código de barras, ou mesmo valor e vencimento): achou,
//      volta 409 com a lista, e só "lançar mesmo assim" passa;
//   4. uma guia por vez (`status = 'enviando'` atômico + fila no processo).
//
// Exige OMIE_EMISSAO=1 (a mesma chave das notas e do lote).

const { pool } = require("../db");
const crypto = require("crypto");
const omie = require("./omie.service");
const leitura = require("./guia-leitura.service");

class GuiaErro extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}

const TIPOS = ["das", "darf", "fgts", "dae", "gps", "parcelamento", "municipal", "outro"];
const VIVAS = ["conferir", "erro", "incerto"]; // as que ainda podem ir ao Omie
const MAX_PDF = 4 * 1024 * 1024;

const ligado = () => String(process.env.OMIE_EMISSAO || "").trim() === "1";
const integracao = id => `GB-GUIA-${id}`;
const digitos = s => String(s || "").replace(/\D/g, "");
const br = iso => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const isoDeBr = s => { const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const diaIso = d => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

// ── Leitura das tabelas ─────────────────────────────────────────────────────

const COLUNAS = `g.id, g.tipo, g.descricao, g.competencia, g.vencimento, g.valor, g.linha_digitavel,
  g.codigo_barras, g.numero_documento, g.cnpj, g.leitura, g.arquivo_nome, g.arquivo_md5,
  (g.arquivo IS NOT NULL) AS tem_pdf, g.omie_fornecedor, g.omie_categoria, g.omie_conta, g.status,
  g.omie_codigo, g.omie_erro, g.anexo_ok, g.anexo_erro, g.enviado_em, g.criado_em, g.atualizado_em,
  f.razao_social AS fornecedor_nome, f.nome_fantasia AS fornecedor_fantasia,
  ue.nome AS enviado_por_nome, uc.nome AS criado_por_nome`;
const DE = `FROM guias_tributos g
  LEFT JOIN omie_clientes f ON f.omie_codigo = g.omie_fornecedor
  LEFT JOIN usuarios ue ON ue.id = g.enviado_por
  LEFT JOIN usuarios uc ON uc.id = g.criado_por`;

function formatar(r) {
  return {
    id: r.id,
    tipo: r.tipo,
    descricao: r.descricao,
    competencia: r.competencia,
    vencimento: diaIso(r.vencimento),
    valor: r.valor == null ? null : Number(r.valor),
    linha_digitavel: r.linha_digitavel,
    linha_formatada: r.linha_digitavel ? leitura.linhaFormatada(r.linha_digitavel) : null,
    codigo_barras: r.codigo_barras,
    numero_documento: r.numero_documento,
    cnpj: r.cnpj,
    avisos: (r.leitura && r.leitura.avisos) || [],
    leitura: r.leitura || {},
    arquivo_nome: r.arquivo_nome,
    tem_pdf: !!r.tem_pdf,
    omie: {
      fornecedor: r.omie_fornecedor == null ? null : Number(r.omie_fornecedor),
      fornecedor_nome: r.fornecedor_fantasia && r.fornecedor_fantasia !== r.fornecedor_nome
        ? `${r.fornecedor_nome} (${r.fornecedor_fantasia})` : r.fornecedor_nome || null,
      categoria: r.omie_categoria,
      conta: r.omie_conta == null ? null : Number(r.omie_conta),
      codigo: r.omie_codigo == null ? null : Number(r.omie_codigo),
      erro: r.omie_erro,
      anexo_ok: r.anexo_ok,
      anexo_erro: r.anexo_erro,
    },
    status: r.status,
    enviado_em: r.enviado_em,
    enviado_por: r.enviado_por_nome || null,
    criado_em: r.criado_em,
    criado_por: r.criado_por_nome || null,
  };
}

async function _uma(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUNAS} ${DE} WHERE g.id = $1`, [id]);
  if (!rows[0]) throw new GuiaErro(404, "Guia não encontrada.");
  return formatar(rows[0]);
}

async function listar() {
  const { rows } = await pool.query(`SELECT ${COLUNAS} ${DE} ORDER BY g.vencimento NULLS FIRST, g.id DESC`);
  const regras = (await pool.query(`SELECT tipo, omie_fornecedor, omie_categoria, omie_conta FROM guias_regras`)).rows;
  return {
    guias: rows.map(formatar),
    regras: Object.fromEntries(regras.map(r => [r.tipo, {
      fornecedor: r.omie_fornecedor == null ? null : Number(r.omie_fornecedor),
      categoria: r.omie_categoria,
      conta: r.omie_conta == null ? null : Number(r.omie_conta),
    }])),
    envio_ligado: ligado(),
    hoje: diaIso(new Date()),
  };
}

async function pdf(id) {
  const { rows } = await pool.query(`SELECT arquivo, arquivo_nome FROM guias_tributos WHERE id = $1`, [id]);
  if (!rows[0]) throw new GuiaErro(404, "Guia não encontrada.");
  if (!rows[0].arquivo) throw new GuiaErro(404, "Esta guia foi digitada, não tem PDF.");
  return { buffer: rows[0].arquivo, nome: rows[0].arquivo_nome || `guia-${id}.pdf` };
}

async function _regra(tipo, db = pool) {
  const { rows } = await db.query(`SELECT omie_fornecedor, omie_categoria, omie_conta FROM guias_regras WHERE tipo = $1`, [tipo]);
  return rows[0] || { omie_fornecedor: null, omie_categoria: null, omie_conta: null };
}

// ── Entrada do PDF ──────────────────────────────────────────────────────────

// Devolve { guias: [...], repetidas: [...], sem_codigo: bool, erro? }.
async function receber(buffer, nomeArquivo, usuarioId) {
  if (!buffer || !buffer.length) throw new GuiaErro(400, "Arquivo vazio.");
  if (buffer.length > MAX_PDF) throw new GuiaErro(413, "PDF acima de 4 MB: uma guia tem dezenas de KB. Confira se é o arquivo certo.");
  const nome = String(nomeArquivo || "guia.pdf").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 200);
  const lido = await leitura.lerPdf(buffer);
  if (lido.erro) throw new GuiaErro(400, lido.erro);

  const criadas = [], repetidas = [];
  const linhas = lido.guias.length ? lido.guias : [{
    ...(lido.rascunho || { tipo: "outro", descricao: leitura.NOMES.outro }),
    linha_digitavel: null, codigo_barras: null,
    leitura: {
      avisos: [lido.texto
        ? "Não achei o código de barras no PDF: digite a linha digitável."
        : "O PDF não tem texto (parece escaneado): digite os dados da guia."],
    },
  }];

  for (const g of linhas) {
    if (g.codigo_barras) {
      const ja = await pool.query(
        `SELECT id FROM guias_tributos WHERE codigo_barras = $1 AND status <> 'descartada'`, [g.codigo_barras]);
      if (ja.rows[0]) { repetidas.push(await _uma(ja.rows[0].id)); continue; }
    }
    const regra = await _regra(g.tipo);
    try {
      const { rows } = await pool.query(
        `INSERT INTO guias_tributos (tipo, descricao, competencia, vencimento, valor, linha_digitavel, codigo_barras,
           numero_documento, cnpj, leitura, arquivo_nome, arquivo, arquivo_md5,
           omie_fornecedor, omie_categoria, omie_conta, criado_por)
         VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [g.tipo, g.descricao, g.competencia, g.vencimento, g.valor, g.linha_digitavel, g.codigo_barras,
          g.numero_documento, g.cnpj, JSON.stringify(g.leitura || {}), nome, buffer, lido.md5,
          regra.omie_fornecedor, regra.omie_categoria, regra.omie_conta, usuarioId || null]);
      criadas.push(await _uma(rows[0].id));
    } catch (e) {
      // Duas abas mandando o mesmo PDF ao mesmo tempo: o índice segura.
      if (e.code === "23505" && g.codigo_barras) {
        const ja = await pool.query(`SELECT id FROM guias_tributos WHERE codigo_barras = $1 AND status <> 'descartada'`, [g.codigo_barras]);
        if (ja.rows[0]) { repetidas.push(await _uma(ja.rows[0].id)); continue; }
      }
      throw e;
    }
  }
  return { guias: criadas, repetidas, sem_codigo: !lido.guias.length };
}

// ── Conferência ─────────────────────────────────────────────────────────────

// Campos que a tela edita. Só enquanto a guia não foi ao Omie.
async function atualizar(id, dados, usuarioId) {
  const atual = (await pool.query(`SELECT * FROM guias_tributos WHERE id = $1`, [id])).rows[0];
  if (!atual) throw new GuiaErro(404, "Guia não encontrada.");
  if (!["conferir", "erro"].includes(atual.status)) {
    throw new GuiaErro(409, atual.status === "lancada" ? "Esta guia já está no Omie: mude lá." : "Esta guia não pode ser editada agora.");
  }
  const d = dados || {};
  const novo = {
    tipo: atual.tipo, descricao: atual.descricao, competencia: atual.competencia, vencimento: diaIso(atual.vencimento),
    valor: atual.valor == null ? null : Number(atual.valor), linha_digitavel: atual.linha_digitavel,
    codigo_barras: atual.codigo_barras, numero_documento: atual.numero_documento,
    omie_fornecedor: atual.omie_fornecedor, omie_categoria: atual.omie_categoria, omie_conta: atual.omie_conta,
  };
  const leit = { ...(atual.leitura || {}) };

  if (d.tipo !== undefined) {
    if (!TIPOS.includes(d.tipo)) throw new GuiaErro(400, "Tipo de guia inválido.");
    if (d.tipo !== novo.tipo) {
      novo.tipo = d.tipo;
      novo.descricao = leitura.NOMES[d.tipo];
      // Trocou o tipo: o destino no Omie vem da regra do tipo novo, a não ser
      // que a tela mande o destino junto.
      const r = await _regra(d.tipo);
      novo.omie_fornecedor = r.omie_fornecedor; novo.omie_categoria = r.omie_categoria; novo.omie_conta = r.omie_conta;
    }
  }
  if (d.competencia !== undefined) {
    if (d.competencia && !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.competencia)) throw new GuiaErro(400, "Competência inválida (AAAA-MM).");
    novo.competencia = d.competencia || null;
  }
  if (d.vencimento !== undefined) {
    if (d.vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento)) throw new GuiaErro(400, "Vencimento inválido.");
    novo.vencimento = d.vencimento || null;
  }
  if (d.numero_documento !== undefined) novo.numero_documento = String(d.numero_documento || "").trim().slice(0, 40) || null;
  if (d.linha_digitavel !== undefined) {
    const l = digitos(d.linha_digitavel);
    if (!l) { novo.linha_digitavel = null; novo.codigo_barras = null; }
    else {
      const c = leitura.lerLinhaDigitavel(l);
      if (!c) throw new GuiaErro(400, "Linha digitável inválida: os dígitos verificadores não batem. Confira a digitação.");
      novo.linha_digitavel = c.linha; novo.codigo_barras = c.barras;
      if (c.valor != null && d.valor === undefined) novo.valor = c.valor;
      if (c.vencimento && !novo.vencimento) novo.vencimento = c.vencimento;
      leit.especie = c.especie;
    }
  }
  if (d.valor !== undefined) {
    const v = d.valor === null || d.valor === "" ? null : Number(d.valor);
    if (v != null && (!Number.isFinite(v) || v <= 0 || v > 10000000)) throw new GuiaErro(400, "Valor inválido.");
    novo.valor = v == null ? null : Math.round(v * 100) / 100;
  }
  if (d.omie_fornecedor !== undefined) novo.omie_fornecedor = d.omie_fornecedor ? Number(d.omie_fornecedor) : null;
  if (d.omie_categoria !== undefined) novo.omie_categoria = String(d.omie_categoria || "").trim().slice(0, 20) || null;
  if (d.omie_conta !== undefined) novo.omie_conta = d.omie_conta ? Number(d.omie_conta) : null;

  // O valor digitado contra o do código de barras: vale o código.
  if (novo.codigo_barras && novo.codigo_barras[0] === "8" && ["6", "8"].includes(novo.codigo_barras[2])) {
    const vc = Number(novo.codigo_barras.slice(4, 15)) / 100;
    if (novo.valor != null && Math.abs(vc - novo.valor) > 0.009) {
      throw new GuiaErro(400, `O código de barras é de ${vc.toFixed(2).replace(".", ",")}: o banco vai cobrar esse valor. Corrija o valor ou a linha digitável.`);
    }
  }
  // A tela conferiu: os avisos da leitura ficam para trás.
  leit.avisos = [];
  leit.conferido_em = new Date().toISOString();

  try {
    await pool.query(
      `UPDATE guias_tributos SET tipo=$2, descricao=$3, competencia=$4, vencimento=$5::date, valor=$6, linha_digitavel=$7,
         codigo_barras=$8, numero_documento=$9, omie_fornecedor=$10, omie_categoria=$11, omie_conta=$12,
         leitura=$13::jsonb, atualizado_em=NOW()
       WHERE id=$1`,
      [id, novo.tipo, novo.descricao, novo.competencia, novo.vencimento, novo.valor, novo.linha_digitavel,
        novo.codigo_barras, novo.numero_documento, novo.omie_fornecedor, novo.omie_categoria, novo.omie_conta,
        JSON.stringify(leit)]);
  } catch (e) {
    if (e.code === "23505") throw new GuiaErro(409, "Já existe outra guia com este código de barras.");
    throw e;
  }

  // "Usar sempre para este tipo": grava a regra.
  if (d.lembrar) {
    await pool.query(
      `INSERT INTO guias_regras (tipo, omie_fornecedor, omie_categoria, omie_conta, atualizado_por, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (tipo) DO UPDATE SET omie_fornecedor=EXCLUDED.omie_fornecedor, omie_categoria=EXCLUDED.omie_categoria,
         omie_conta=EXCLUDED.omie_conta, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=NOW()`,
      [novo.tipo, novo.omie_fornecedor, novo.omie_categoria, novo.omie_conta, usuarioId || null]);
  }
  return _uma(id);
}

async function descartar(id) {
  const { rowCount } = await pool.query(
    `UPDATE guias_tributos SET status='descartada', atualizado_em=NOW() WHERE id=$1 AND status IN ('conferir','erro')`, [id]);
  if (!rowCount) throw new GuiaErro(409, "Só dá para descartar guia que ainda não foi ao Omie.");
  return _uma(id);
}

async function restaurar(id) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE guias_tributos SET status='conferir', atualizado_em=NOW() WHERE id=$1 AND status='descartada'`, [id]);
    if (!rowCount) throw new GuiaErro(409, "Esta guia não está descartada.");
  } catch (e) {
    if (e.code === "23505") throw new GuiaErro(409, "Outra guia com o mesmo código de barras já entrou depois desta.");
    throw e;
  }
  return _uma(id);
}

// ── Opções da tela (categorias e contas do Omie, fornecedores da cópia) ─────

// Categorias e contas mudam quase nunca: lidas do Omie uma vez a cada 6 h
// (ninguém na tela chama o Omie a cada clique; e a mesma chamada em < 60 s
// é recusada como "consumo redundante").
const _cache = { categorias: null, contas: null, em: 0, pedido: null };
async function opcoes() {
  if (_cache.categorias && Date.now() - _cache.em < 6 * 3600e3) return _opcoesDe();
  if (!_cache.pedido) {
    _cache.pedido = (async () => {
      try {
        const cats = await omie.listarCategorias();
        const contas = await omie.listarContasCorrentes();
        _cache.categorias = cats
          .filter(c => /^2\./.test(c.codigo || "") && c.conta_inativa !== "S" && c.totalizadora !== "S")
          .map(c => ({ codigo: c.codigo, descricao: _txt(c.descricao) }))
          .filter(c => c.codigo.split(".").length >= 3 && !/dispon[ií]vel/i.test(c.descricao));
        _cache.contas = contas.filter(c => c.inativo !== "S")
          .map(c => ({ codigo: Number(c.nCodCC), descricao: _txt(c.descricao), banco: c.codigo_banco, tipo: c.tipo }));
        _cache.em = Date.now();
        _cache.erro = null;
      } catch (e) {
        _cache.erro = e.message;
      } finally {
        _cache.pedido = null;
      }
    })();
  }
  await _cache.pedido;
  return _opcoesDe();
}
const _txt = s => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&");
function _opcoesDe() {
  return { categorias: _cache.categorias || [], contas: _cache.contas || [], erro: _cache.categorias ? null : (_cache.erro || null) };
}

// Fornecedores: a cópia dos cadastros do Omie (omie_clientes traz clientes E
// fornecedores — a Receita Federal e a Prefeitura estão lá). Não chama o Omie.
async function fornecedores(q) {
  const t = String(q || "").trim();
  const d = digitos(t);
  const { rows } = await pool.query(
    `SELECT omie_codigo, razao_social, nome_fantasia, documento FROM omie_clientes
      WHERE NOT inativo AND ($1 = '' OR razao_social ILIKE '%' || $1 || '%' OR nome_fantasia ILIKE '%' || $1 || '%'
            OR ($2 <> '' AND documento LIKE $2 || '%') OR omie_codigo::text = $2)
      ORDER BY (omie_codigo IN (SELECT omie_fornecedor FROM guias_regras WHERE omie_fornecedor IS NOT NULL)) DESC, razao_social
      LIMIT 20`, [t.slice(0, 60), d.slice(0, 14)]);
  return rows.map(r => ({ codigo: Number(r.omie_codigo), nome: r.razao_social, fantasia: r.nome_fantasia, documento: r.documento }));
}

// ── Lançar no Omie ──────────────────────────────────────────────────────────

// Um zip de um arquivo só, sem compressão (método 0). É o que o IncluirAnexo
// pede ("compactado (zip)"); PDF já vem comprimido por dentro.
const _crcTab = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function _crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = _crcTab[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipUmArquivo(nome, dados) {
  const n = Buffer.from(nome, "utf8");
  const crc = _crc32(dados);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(dados.length, 20); central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const fim = Buffer.alloc(22);
  const tamCentral = central.length + n.length;
  const iniCentral = local.length + n.length + dados.length;
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(1, 8); fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(tamCentral, 12); fim.writeUInt32LE(iniCentral, 16);
  return Buffer.concat([local, n, dados, central, n, fim]);
}

// O Omie atende um método por vez: os lançamentos vão em fila.
let _fila = Promise.resolve();
function _naFila(fn) {
  const p = _fila.then(fn, fn);
  _fila = p.catch(() => {});
  return p;
}

// Títulos do fornecedor guardados 3 min: a mesma consulta repetida em < 60 s
// é recusada pelo Omie, e quem lança três DAS seguidos consultaria três vezes.
const _titulosForn = new Map();
async function _titulosDoFornecedor(forn) {
  const c = _titulosForn.get(forn);
  if (c && Date.now() - c.em < 180e3) return c.lista;
  const lista = await omie.listarContasPagarDoFornecedor(forn, { maxPaginas: 6 });
  _titulosForn.set(forn, { em: Date.now(), lista });
  return lista;
}

function _parecidas(g, titulos) {
  const barras = digitos(g.linha_digitavel);
  const venc = br(diaIso(g.vencimento));
  return titulos.filter(t => {
    if (String(t.status_titulo || "").toUpperCase() === "CANCELADO") return false;
    const tb = digitos(t.codigo_barras_ficha_compensacao);
    if (barras && tb && tb === barras) return true;
    return Math.abs(Number(t.valor_documento) - Number(g.valor)) < 0.009 && t.data_vencimento === venc;
  }).map(t => ({
    codigo: Number(t.codigo_lancamento_omie), valor: Number(t.valor_documento),
    vencimento: isoDeBr(t.data_vencimento), status: t.status_titulo || null,
    mesmo_codigo: !!(barras && digitos(t.codigo_barras_ficha_compensacao) === barras),
    integracao: t.codigo_lancamento_integracao || null,
  }));
}

function _payload(g) {
  const comp = g.competencia ? g.competencia.split("-").reverse().join("/") : "";
  const obs = [`${g.descricao || "Guia"}${comp ? " " + comp : ""}`, `Guia lida pelo sistema (#${g.id})`];
  if (g.numero_documento) obs.push(`Documento ${g.numero_documento}`);
  const p = {
    codigo_lancamento_integracao: integracao(g.id),
    codigo_cliente_fornecedor: Number(g.omie_fornecedor),
    data_vencimento: br(diaIso(g.vencimento)),
    data_previsao: br(diaIso(g.vencimento)),
    valor_documento: Number(g.valor),
    codigo_categoria: g.omie_categoria,
    id_conta_corrente: Number(g.omie_conta),
    codigo_tipo_documento: "BOL",
    observacao: obs.join("|"),
  };
  const nd = digitos(g.numero_documento).slice(-20);
  if (nd) p.numero_documento = nd;
  if (g.linha_digitavel) p.codigo_barras_ficha_compensacao = leitura.linhaFormatada(g.linha_digitavel).slice(0, 70);
  return p;
}

async function _anexar(id, omieCodigo) {
  const { rows } = await pool.query(`SELECT arquivo, arquivo_nome FROM guias_tributos WHERE id=$1`, [id]);
  const a = rows[0];
  if (!a || !a.arquivo) return { ok: false, motivo: "sem PDF" };
  try {
    const nome = (a.arquivo_nome || `guia-${id}.pdf`).replace(/[^\w.\-]+/g, "_").slice(0, 90);
    const zip = zipUmArquivo(/\.pdf$/i.test(nome) ? nome : nome + ".pdf", a.arquivo);
    await omie.incluirAnexo({
      cCodIntAnexo: `GBGUIA${id}`.slice(0, 20), cTabela: "conta-pagar", nId: Number(omieCodigo),
      cNomeArquivo: /\.pdf$/i.test(nome) ? nome : nome + ".pdf", cTipoArquivo: "pdf",
      cArquivo: zip.toString("base64"), cMd5: crypto.createHash("md5").update(zip).digest("hex"),
    });
    await pool.query(`UPDATE guias_tributos SET anexo_ok=TRUE, anexo_erro=NULL, atualizado_em=NOW() WHERE id=$1`, [id]);
    return { ok: true };
  } catch (e) {
    await pool.query(`UPDATE guias_tributos SET anexo_ok=FALSE, anexo_erro=$2, atualizado_em=NOW() WHERE id=$1`, [id, String(e.message).slice(0, 500)]);
    return { ok: false, motivo: e.message };
  }
}

async function _marcarLancada(id, omieCodigo, usuarioId) {
  await pool.query(
    `UPDATE guias_tributos SET status='lancada', omie_codigo=$2, omie_erro=NULL, enviado_em=NOW(), enviado_por=$3, atualizado_em=NOW()
      WHERE id=$1`, [id, omieCodigo, usuarioId || null]);
}

function lancar(id, { forcar = false } = {}, usuarioId) {
  return _naFila(() => _lancar(id, { forcar }, usuarioId));
}

async function _lancar(id, { forcar }, usuarioId) {
  if (!ligado()) throw new GuiaErro(503, "Envio ao Omie desligado neste ambiente (OMIE_EMISSAO). Nada foi enviado.");
  // Trava atômica: duas abas, um clique duplo — só uma passa.
  // (Em READ COMMITTED, quem esperou o FOR UPDATE relê a linha já em
  // 'enviando' e não passa.)
  const { rows } = await pool.query(
    `WITH a AS (SELECT id, status AS antes FROM guias_tributos WHERE id=$1 FOR UPDATE)
     UPDATE guias_tributos g SET status='enviando', atualizado_em=NOW()
       FROM a
      WHERE g.id=a.id AND a.antes = ANY($2::varchar[])
      RETURNING g.*, a.antes`, [id, VIVAS]);
  const g = rows[0];
  if (!g) {
    const ex = (await pool.query(`SELECT status FROM guias_tributos WHERE id=$1`, [id])).rows[0];
    if (!ex) throw new GuiaErro(404, "Guia não encontrada.");
    throw new GuiaErro(409, ex.status === "lancada" ? "Esta guia já está no Omie." : ex.status === "enviando" ? "Esta guia já está sendo lançada." : "Esta guia foi descartada.");
  }
  const voltar = async (status, erro) => {
    await pool.query(`UPDATE guias_tributos SET status=$2, omie_erro=$3, atualizado_em=NOW() WHERE id=$1`, [id, status, erro || null]);
  };

  // O que falta para lançar volta ao estado de antes, sem chamar o Omie.
  const faltas = [];
  if (!(Number(g.valor) > 0)) faltas.push("valor");
  if (!g.vencimento) faltas.push("vencimento");
  if (!g.omie_fornecedor) faltas.push("fornecedor");
  if (!g.omie_categoria) faltas.push("categoria");
  if (!g.omie_conta) faltas.push("conta");
  if (faltas.length) {
    await voltar(g.antes === "incerto" ? "incerto" : g.antes, g.omie_erro);
    throw new GuiaErro(400, `Falta ${faltas.join(", ")} para lançar.`);
  }

  try {
    // 1. Já existe no Omie com o nosso código? (queda de uma vez anterior)
    const ja = await omie.consultarContaPagarPorIntegracao(integracao(id));
    if (ja) {
      await _marcarLancada(id, Number(ja.codigo_lancamento_omie), usuarioId);
      const anexo = await _anexar(id, ja.codigo_lancamento_omie);
      return { guia: await _uma(id), ja_existia: true, anexo };
    }
    // 2. A mesma guia lançada à mão no Omie?
    if (!forcar) {
      const parecidas = _parecidas(g, await _titulosDoFornecedor(Number(g.omie_fornecedor)));
      if (parecidas.length) {
        await voltar(g.antes === "incerto" ? "conferir" : g.antes, g.omie_erro);
        throw new GuiaErro(409, parecidas.some(p => p.mesmo_codigo)
          ? "Esta guia já está no Omie (mesmo código de barras)."
          : "Já existe no Omie uma conta a pagar deste fornecedor com o mesmo valor e vencimento.", { parecidas });
      }
    }
  } catch (e) {
    if (e instanceof GuiaErro) throw e;
    // Nem a consulta passou: nada foi incluído, volta como estava.
    await voltar(g.antes, `O Omie não respondeu à consulta: ${e.message}`);
    throw new GuiaErro(502, `O Omie não respondeu à consulta antes do lançamento (${e.message}). Nada foi enviado.`);
  }

  // 3. Incluir.
  let resp;
  try {
    resp = await omie.incluirContaPagar(_payload(g));
  } catch (e) {
    const semResposta = e.status === 504 || /n[ãa]o respondeu|rede|timeout/i.test(e.message);
    if (semResposta) {
      await voltar("incerto", e.message);
      throw new GuiaErro(504, "O Omie não respondeu. A conta a pagar pode ter sido criada: tente de novo, que o sistema confere antes de mandar outra vez.");
    }
    // Recusa por código repetido: alguém criou com este código. Confirma.
    if (/integra[çc][ãa]o|j[áa] (est[áa] )?cadastrad|j[áa] existe/i.test(e.message)) {
      try {
        const ja = await omie.consultarContaPagarPorIntegracao(integracao(id));
        if (ja) {
          await _marcarLancada(id, Number(ja.codigo_lancamento_omie), usuarioId);
          return { guia: await _uma(id), ja_existia: true, anexo: await _anexar(id, ja.codigo_lancamento_omie) };
        }
      } catch (_) { /* cai no erro abaixo */ }
    }
    await voltar("erro", e.message);
    throw new GuiaErro(502, "O Omie recusou: " + e.message);
  }
  const codigo = Number(resp.codigo_lancamento_omie);
  await _marcarLancada(id, codigo, usuarioId);
  const c = _titulosForn.get(Number(g.omie_fornecedor));
  if (c) c.lista.unshift({ ..._payload(g), codigo_lancamento_omie: codigo, status_titulo: "AVENCER" });

  // 4. O PDF anexado (falha aqui não desfaz a conta a pagar).
  const anexo = await _anexar(id, codigo);
  return { guia: await _uma(id), anexo };
}

async function anexarDeNovo(id) {
  if (!ligado()) throw new GuiaErro(503, "Envio ao Omie desligado neste ambiente (OMIE_EMISSAO).");
  const g = (await pool.query(`SELECT status, omie_codigo FROM guias_tributos WHERE id=$1`, [id])).rows[0];
  if (!g) throw new GuiaErro(404, "Guia não encontrada.");
  if (g.status !== "lancada" || !g.omie_codigo) throw new GuiaErro(409, "A guia ainda não está no Omie.");
  const anexo = await _naFila(() => _anexar(id, g.omie_codigo));
  return { guia: await _uma(id), anexo };
}

module.exports = {
  GuiaErro, TIPOS, listar, pdf, receber, atualizar, descartar, restaurar, opcoes, fornecedores, lancar, anexarDeNovo,
  _t: { zipUmArquivo, _crc32, _parecidas, _payload, _cache, _titulosForn },
};
