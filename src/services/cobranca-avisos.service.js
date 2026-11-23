// src/services/cobranca-avisos.service.js
//
// Os avisos de cobrança por e-mail (migration 102,
// docs/modulos/cobranca-avisos.md). Pedido do Pedro em 23/11/2026.
//
// A FILA DO DIA. A cada volta do job (e quando alguém abre a tela), cada
// título do sistema em aberto ganha no máximo UM aviso pendente — o da etapa
// em que ele está hoje:
//   antes    · faltam de 1 a `cobranca.dias_antes` dias (padrão 3)
//   dia      · o Omie diz "VENCE HOJE" (inclui o que venceu no fim de semana)
//   atraso1  · de `cobranca.atraso_1` (3) até antes de `atraso_2` dias de atraso
//   atraso2  · de `cobranca.atraso_2` (10) até 7 dias depois disso
// Passou da janela, o sistema para: o título segue em "Em atraso" para ligar.
// `UNIQUE (omie_titulo, etapa, vencimento)`: o mesmo aviso nunca vai duas
// vezes. Pendente cuja etapa já passou (ou cujo título foi pago, ou marcado
// pago aqui) vira `expirado` — não sai atrasado.
//
// SÓ OS TÍTULOS QUE O SISTEMA EMITIU (a mesma regra da aba "Em atraso"): as
// cópias `omie_receber_avencer` e `omie_receber_atrasados`.
//
// PARA QUEM: os mesmos e-mails para os quais o Omie mandou a nota (decisão do
// Pedro, 23/11/2026) — `orcamentos.nota_emails` na nota de orçamento; nos
// contratos, os da nota mais recente do cliente no Omie
// (omie-emails.service.js; em 2026 é o cliente + uma cópia da General).
//
// ENVIO: aprovado na tela, até alguém ligar `cobranca.avisos_automatico`.
// ⚠️ EXIGE COBRANCA_EMAIL=1 NO SERVIDOR, para os dois jeitos. O banco de
// teste recebe a cópia real do Omie quando o servidor local roda com as
// chaves: sem a trava, um `npm run dev` mandaria cobrança a cliente de
// verdade.

const { pool } = require("../db");
const omie = require("./omie.service");
const emailsOmie = require("./omie-emails.service");
const email = require("./email");
const { getConfigInt, getConfigBool } = require("./config.service");

class AvisoErro extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const ETAPAS = {
  antes: "Lembrete antes do vencimento",
  dia: "Vence hoje",
  atraso1: "Primeira cobrança",
  atraso2: "Segunda cobrança",
};

const ligado = () => String(process.env.COBRANCA_EMAIL || "").trim() === "1";

function _hojeSP() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const _dias = (de, ate) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 86400e3);
const _iso = d => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));

async function regras() {
  const [antes, a1, a2, auto, intervalo] = await Promise.all([
    getConfigInt("cobranca.dias_antes", 3), getConfigInt("cobranca.atraso_1", 3),
    getConfigInt("cobranca.atraso_2", 10), getConfigBool("cobranca.avisos_automatico", false),
    getConfigInt("cobranca.avisos_intervalo_min", 30),
  ]);
  return { dias_antes: antes, atraso_1: a1, atraso_2: a2, automatico: !!auto, intervalo_min: intervalo };
}

// A etapa de hoje de um título, ou null. `t` = { vencimento, vence_hoje, atrasado }.
function etapaDe(t, hoje, r) {
  const venc = _iso(t.vencimento);
  if (t.atrasado) {
    const a = _dias(venc, hoje);
    if (r.atraso_2 > 0 && a >= r.atraso_2 && a <= r.atraso_2 + 7) return "atraso2";
    if (r.atraso_1 > 0 && a >= r.atraso_1 && (r.atraso_2 <= 0 || a < r.atraso_2)) return "atraso1";
    return null;
  }
  if (t.vence_hoje) return "dia";
  const d = _dias(hoje, venc);
  if (d === 0) return "dia";
  if (r.dias_antes > 0 && d >= 1 && d <= r.dias_antes) return "antes";
  return null;
}

// Os títulos do sistema em aberto agora (a cópia; não chama o Omie). Os
// marcados como pagos aqui ficam de fora.
async function _abertos(db = pool) {
  const q = (tab, atrasado) => `
    SELECT t.omie_codigo, t.omie_cliente, t.origem, t.orcamento_id, t.omie_contrato, t.parcela, t.numero_nf,
           t.valor, t.vencimento, ${atrasado ? "FALSE" : "t.vence_hoje"} AS vence_hoje, ${atrasado} AS atrasado,
           t.boleto_numero, t.conta_corrente
      FROM ${tab} t
     WHERE NOT EXISTS (SELECT 1 FROM omie_receber_pagos p WHERE p.omie_titulo = t.omie_codigo)`;
  const [a, b] = await Promise.all([db.query(q("omie_receber_avencer", false)), db.query(q("omie_receber_atrasados", true))]);
  return [...a.rows, ...b.rows];
}

// Os destinatários de um título. Não lança: sem lista, devolve [].
async function destinatariosDe(t, { leitor } = {}) {
  if (t.origem === "orcamento" && t.orcamento_id) {
    const o = (await pool.query(`SELECT nota_emails FROM orcamentos WHERE id = $1`, [t.orcamento_id])).rows[0];
    const l = emailsOmie.separar(o && o.nota_emails);
    if (l.length) return l;
  }
  if (!t.omie_cliente) return [];
  const r = await emailsOmie.doCliente(Number(t.omie_cliente), { maxIdadeH: 24 * 7, ...(leitor ? { leitor } : {}) });
  return r.emails;
}

// Monta (e limpa) a fila de hoje. Devolve { novos, expirados }.
async function montarFila({ hoje = _hojeSP(), leitor } = {}) {
  const r = await regras();
  const abertos = await _abertos();
  const etapaHoje = new Map();
  let novos = 0;
  for (const t of abertos) {
    const etapa = etapaDe(t, hoje, r);
    if (!etapa) continue;
    etapaHoje.set(String(t.omie_codigo), etapa);
    const ja = await pool.query(
      `SELECT 1 FROM cobranca_avisos WHERE omie_titulo = $1 AND etapa = $2 AND vencimento = $3::date`, [t.omie_codigo, etapa, _iso(t.vencimento)]);
    if (ja.rowCount) continue;
    let para = [];
    try { para = await destinatariosDe(t, { leitor }); } catch (_) { para = []; }
    const ins = await pool.query(
      `INSERT INTO cobranca_avisos (omie_titulo, etapa, vencimento, dias, omie_cliente, origem, orcamento_id, valor, numero_nf,
         destinatarios, status)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (omie_titulo, etapa, vencimento) DO NOTHING`,
      [t.omie_codigo, etapa, _iso(t.vencimento), _dias(hoje, _iso(t.vencimento)), t.omie_cliente, t.origem, t.orcamento_id,
        t.valor, t.numero_nf, para.length ? para.join(", ") : null, para.length ? "pendente" : "sem_email"]);
    novos += ins.rowCount;
  }
  // O que esperava aprovação e deixou de valer hoje: não sai mais.
  const pend = await pool.query(`SELECT id, omie_titulo, etapa FROM cobranca_avisos WHERE status IN ('pendente', 'sem_email', 'erro')`);
  const expirar = pend.rows.filter(a => etapaHoje.get(String(a.omie_titulo)) !== a.etapa).map(a => a.id);
  if (expirar.length) await pool.query(`UPDATE cobranca_avisos SET status = 'expirado' WHERE id = ANY($1::int[])`, [expirar]);
  return { novos, expirados: expirar.length };
}

// ── A tela ──────────────────────────────────────────────────────────────────

async function listar() {
  const [rs, r] = await Promise.all([
    pool.query(`
      SELECT a.*, to_char(a.vencimento, 'YYYY-MM-DD') AS venc, cl.razao_social, cl.nome_fantasia, cl.documento AS cliente_documento,
             u.nome AS enviado_por_nome, o.numero AS orcamento_numero, ct.numero AS contrato_numero,
             COALESCE(av.valor, at.valor) AS valor_agora,
             (av.omie_codigo IS NOT NULL OR at.omie_codigo IS NOT NULL) AS aberto,
             COALESCE(av.boleto_numero, at.boleto_numero) AS boleto_numero
        FROM cobranca_avisos a
        LEFT JOIN omie_clientes cl ON cl.omie_codigo = a.omie_cliente
        LEFT JOIN usuarios u ON u.id = a.enviado_por
        LEFT JOIN orcamentos o ON o.id = a.orcamento_id
        LEFT JOIN omie_receber_avencer av ON av.omie_codigo = a.omie_titulo
        LEFT JOIN omie_receber_atrasados at ON at.omie_codigo = a.omie_titulo
        LEFT JOIN omie_contratos ct ON ct.omie_codigo = COALESCE(av.omie_contrato, at.omie_contrato)
       WHERE a.criado_em > NOW() - INTERVAL '90 days' OR a.status IN ('pendente', 'erro', 'sem_email')
       ORDER BY a.criado_em DESC, a.id DESC`),
    regras(),
  ]);
  return {
    avisos: rs.rows.map(x => ({
      id: x.id, omie_titulo: Number(x.omie_titulo), etapa: x.etapa, etapa_nome: ETAPAS[x.etapa] || x.etapa,
      vencimento: x.venc, dias: x.dias, origem: x.origem, orcamento_id: x.orcamento_id,
      orcamento_numero: x.orcamento_numero || null, contrato_numero: x.contrato_numero || null,
      valor: x.valor == null ? null : Number(x.valor), numero_nf: x.numero_nf,
      cliente: { omie_codigo: x.omie_cliente == null ? null : Number(x.omie_cliente), nome: x.nome_fantasia || x.razao_social || null, razao_social: x.razao_social, documento: x.cliente_documento },
      destinatarios: emailsOmie.separar(x.destinatarios),
      status: x.status, erro: x.erro, aberto: !!x.aberto, boleto: !!x.boleto_numero,
      criado_em: x.criado_em, enviado_em: x.enviado_em, enviado_por: x.enviado_por_nome || (x.automatico && x.enviado_em ? "envio automático" : null),
      automatico: x.automatico,
    })),
    regras: r,
    envio_ligado: ligado(),
    hoje: _hojeSP(),
  };
}

async function _aviso(id) {
  const { rows } = await pool.query(`
    SELECT a.*, to_char(a.vencimento, 'YYYY-MM-DD') AS venc, cl.razao_social, cl.nome_fantasia,
           o.nota_url, COALESCE(av.parcela, at.parcela) AS parcela,
           COALESCE(av.boleto_numero, at.boleto_numero) AS boleto_numero,
           (av.omie_codigo IS NOT NULL OR at.omie_codigo IS NOT NULL) AS aberto
      FROM cobranca_avisos a
      LEFT JOIN omie_clientes cl ON cl.omie_codigo = a.omie_cliente
      LEFT JOIN orcamentos o ON o.id = a.orcamento_id
      LEFT JOIN omie_receber_avencer av ON av.omie_codigo = a.omie_titulo
      LEFT JOIN omie_receber_atrasados at ON at.omie_codigo = a.omie_titulo
     WHERE a.id = $1`, [id]);
  if (!rows[0]) throw new AvisoErro(404, "Aviso não encontrado.");
  return rows[0];
}

function _dadosEmail(a, hoje = _hojeSP()) {
  return {
    etapa: a.etapa,
    clienteNome: a.nome_fantasia || a.razao_social || "Cliente",
    numeroNf: a.numero_nf || null,
    parcela: a.parcela || null,
    vencimento: a.venc,
    diasAtraso: a.etapa.startsWith("atraso") ? Math.max(0, _dias(a.venc, hoje)) : null,
    linkNota: a.nota_url || null,
  };
}

// O e-mail como vai sair (sem o anexo): a tela mostra antes de aprovar.
async function previa(id) {
  const a = await _aviso(id);
  const m = email.montarCobranca({ ..._dadosEmail(a), boletoPdf: a.boleto_numero ? Buffer.from("x") : null });
  return { assunto: m.subject, html: m.html, para: emailsOmie.separar(a.destinatarios), anexo: a.boleto_numero ? "boleto em PDF" : null };
}

// O PDF do boleto do título: o link do Omie vale 24 h, então é lido na hora.
async function _boletoPdf(omieTitulo) {
  const b = await omie.obterBoleto(Number(omieTitulo));
  if (!b || !b.cLinkBoleto) return null;
  const r = await fetch(b.cLinkBoleto, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`o link do boleto respondeu HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.slice(0, 5).toString("latin1") !== "%PDF-") throw new Error("o link do boleto não devolveu um PDF");
  return buf;
}

// Um aviso. Trava atômica: duas abas, ou a tela e o job, não mandam o mesmo.
async function _enviarUm(id, { usuarioId = null, automatico = false, boletoPdf = _boletoPdf } = {}) {
  const trava = await pool.query(
    `UPDATE cobranca_avisos SET status = 'enviando' WHERE id = $1 AND status IN ('pendente', 'erro') RETURNING id`, [id]);
  if (!trava.rowCount) return { id, ok: false, motivo: "não está pendente" };
  const a = await _aviso(id);
  const volta = (status, erro) => pool.query(`UPDATE cobranca_avisos SET status = $2, erro = $3 WHERE id = $1`, [id, status, erro ? String(erro).slice(0, 500) : null]);
  try {
    // Pago no meio do caminho (o Omie baixou, ou marcaram aqui): não manda.
    const pago = (await pool.query(`SELECT 1 FROM omie_receber_pagos WHERE omie_titulo = $1`, [a.omie_titulo])).rowCount;
    if (!a.aberto || pago) { await volta("expirado", "o título não está mais em aberto"); return { id, ok: false, motivo: "título pago" }; }
    const para = emailsOmie.separar(a.destinatarios);
    if (!para.length) { await volta("sem_email", null); return { id, ok: false, motivo: "sem e-mail" }; }
    let pdf = null;
    if (a.boleto_numero) {
      try { pdf = await boletoPdf(a.omie_titulo); }
      catch (e) { await volta("erro", "Não consegui o PDF do boleto no Omie: " + e.message); return { id, ok: false, motivo: e.message }; }
    }
    const dados = _dadosEmail(a);
    const emailId = await email.sendCobrancaCliente({
      ...dados, to: para, boletoPdf: pdf, boletoNome: `boleto${a.numero_nf ? "-nf-" + a.numero_nf : ""}${a.parcela && a.parcela !== "001/001" ? "-" + a.parcela.replace(/\D+/g, "-") : ""}.pdf`,
    });
    await pool.query(
      `UPDATE cobranca_avisos SET status = 'enviado', erro = NULL, email_id = $2, enviado_em = NOW(), enviado_por = $3, automatico = $4 WHERE id = $1`,
      [id, emailId, usuarioId, !!automatico]);
    return { id, ok: true };
  } catch (e) {
    await volta("erro", e.message);
    return { id, ok: false, motivo: e.message };
  }
}

// `ids` = os aprovados na tela; sem ids = todos os pendentes de hoje.
async function enviar(ids, { usuarioId = null, automatico = false, boletoPdf } = {}) {
  if (!ligado()) throw new AvisoErro(503, "Envio de cobrança desligado neste ambiente (COBRANCA_EMAIL). Nada foi enviado.");
  // Antes de mandar, a fila é refeita: o que pagou ou mudou de etapa sai.
  await montarFila();
  const alvo = Array.isArray(ids) && ids.length
    ? ids.map(Number).filter(n => Number.isInteger(n) && n > 0)
    : (await pool.query(`SELECT id FROM cobranca_avisos WHERE status = 'pendente' ORDER BY id`)).rows.map(r => r.id);
  const resultados = [];
  // Um por vez: o ObterBoleto do Omie atende um pedido por vez.
  for (const id of alvo) resultados.push(await _enviarUm(id, { usuarioId, automatico, ...(boletoPdf ? { boletoPdf } : {}) }));
  return { enviados: resultados.filter(r => r.ok).length, falhas: resultados.filter(r => !r.ok), resultados };
}

async function ignorar(id) {
  const r = await pool.query(`UPDATE cobranca_avisos SET status = 'ignorado' WHERE id = $1 AND status IN ('pendente', 'erro', 'sem_email') RETURNING id`, [id]);
  if (!r.rowCount) throw new AvisoErro(409, "Este aviso não está na fila.");
  return { ok: true };
}

// Destinatários trocados à mão (sem e-mail, ou errado). Vale só para este aviso.
async function trocarDestinatarios(id, txt) {
  const ruins = emailsOmie.invalidos(txt);
  if (ruins.length) throw new AvisoErro(400, `E-mail inválido: ${ruins.join(", ")}`);
  const l = emailsOmie.separar(txt);
  const r = await pool.query(
    `UPDATE cobranca_avisos SET destinatarios = $2, status = CASE WHEN $3::boolean THEN 'pendente' ELSE 'sem_email' END
      WHERE id = $1 AND status IN ('pendente', 'erro', 'sem_email') RETURNING id`, [id, l.length ? l.join(", ") : null, l.length > 0]);
  if (!r.rowCount) throw new AvisoErro(409, "Este aviso não está na fila.");
  return { ok: true };
}

module.exports = { AvisoErro, ETAPAS, ligado, regras, etapaDe, montarFila, listar, previa, enviar, ignorar, trocarDestinatarios, destinatariosDe, _t: { _hojeSP, _dias } };
