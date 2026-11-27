// src/services/orcamento-vencimento.service.js
//
// O orçamento que vence (migration 103, docs/modulos/orcamentos-vencimento.md).
// Pedido do Pedro em 23/11/2026: a lista tinha 126 "pede ação", 111 deles
// orçamentos enviados cuja validade passou sem resposta.
//
// Três coisas, todas rodadas pelo job orcamento-vencimento.job.js:
//
//  1. LEMBRETE — `orcamento.lembrete_dias` (padrão 5) antes de vencer, um
//     e-mail perguntando se podemos seguir, para os MESMOS e-mails para os
//     quais o orçamento foi enviado (`orcamentos.enviado_para`). Uma linha por
//     (orçamento, validade) em `orcamento_lembretes`: o mesmo lembrete nunca
//     sai duas vezes; estender a validade dá direito a um novo. Só sai em dia
//     útil e horário comercial (o job decide) e só se o servidor tiver
//     ORCAMENTO_LEMBRETE_EMAIL=1 — o banco de teste tem e-mails de cliente de
//     verdade, e um `npm run dev` não pode escrever para eles.
//     Não sai para orçamento enviado há menos de 2 dias: quem mandou ontem um
//     orçamento de validade curta não quer um "vai vencer!" logo atrás.
//     Leva o PDF do orçamento anexado (pedido do Pedro, 27/11/2026), gerado
//     pelo mesmo `gerarPdfAvulso` do envio e com o mesmo nome de arquivo. Se o
//     PDF falhar, o lembrete sai sem anexo e o log diz por quê — o lembrete é
//     o que importa, o anexo é cortesia.
//
//  2. ARQUIVAR — enviado, sem resposta, validade já passou (dia de São Paulo):
//     `arquivado_em = NOW()`. O status continua 'enviado' (ver a migration).
//
//  3. APAGAR — arquivado há mais de `orcamento.apagar_dias` dias. Padrão 90
//     (decisão do Pedro, 23/11/2026); 0 = não apaga. O DELETE passa pela
//     lixeira da 089 (trigger, com `app.contexto` dizendo por quê), e fica de
//     fora quem tem chamado ou movimentação de equipamento ligada, nota, ou
//     resposta do cliente. O pedido do técnico que originou o orçamento sai da
//     fila junto (mesma regra do DELETE /admin/orcamentos/:os_id): sem isso o
//     pedido voltaria como "Pedido do técnico" e alguém faria outro orçamento.

const { pool } = require("../db");
const email = require("./email");
const { getConfigInt } = require("./config.service");
const { gerarPdfAvulso } = require("./orcamento-pdf.service");

const MAX_TENTATIVAS = 3;
const _EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const ligado = () => String(process.env.ORCAMENTO_LEMBRETE_EMAIL || "").trim() === "1";

function _hojeSP() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function regras() {
  const [lembrete, apagar, intervalo] = await Promise.all([
    getConfigInt("orcamento.lembrete_dias", 5),
    getConfigInt("orcamento.apagar_dias", 90),
    getConfigInt("orcamento.vencimento_intervalo_min", 60),
  ]);
  return { lembrete_dias: lembrete, apagar_dias: apagar, intervalo_min: intervalo };
}

function separar(txt) {
  return [...new Set(String(txt || "").split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => _EMAIL_RE.test(s)))];
}

function _linkPainelLigado() {
  const v = String(process.env.ORCAMENTO_LINK_PAINEL ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "nao" || v === "não");
}
function _baseUrl() {
  const env = process.env.APP_URL || process.env.PUBLIC_BASE_URL;
  return env ? String(env).replace(/\/+$/, "") : null;
}

// ── 2. Arquivar ──────────────────────────────────────────────────────────────

// `gravar: false` só conta (é o que o script mostra antes de gravar em prod).
// `soIds` restringe a alguns orçamentos (é o que o teste usa para não mexer no resto).
async function arquivarVencidos({ hoje = _hojeSP(), gravar = true, soIds = null, db = pool } = {}) {
  const onde = `status = 'enviado' AND arquivado_em IS NULL AND respondido_em IS NULL
                AND valido_ate IS NOT NULL AND valido_ate < $1::date
                AND ($2::int[] IS NULL OR id = ANY($2::int[]))`;
  const p = [hoje, soIds];
  if (!gravar) {
    const r = await db.query(`SELECT id, numero, valido_ate FROM orcamentos WHERE ${onde} ORDER BY valido_ate, id`, p);
    return { arquivados: 0, vencidos: r.rowCount, ids: r.rows.map(x => x.id) };
  }
  const r = await db.query(`UPDATE orcamentos SET arquivado_em = NOW(), arquivado_por = NULL WHERE ${onde} RETURNING id`, p);
  return { arquivados: r.rowCount, ids: r.rows.map(x => x.id) };
}

// ── 3. Apagar ────────────────────────────────────────────────────────────────

async function apagarArquivados({ dias, gravar = true, soIds = null } = {}) {
  if (dias == null) dias = (await regras()).apagar_dias;
  dias = Number(dias);
  if (!Number.isInteger(dias) || dias <= 0) return { apagados: 0, ids: [], desligado: true };
  const onde = `o.status = 'enviado' AND o.respondido_em IS NULL AND o.nota_status IS NULL
                AND o.arquivado_em IS NOT NULL AND o.arquivado_em < NOW() - make_interval(days => $1::int)
                AND NOT EXISTS (SELECT 1 FROM chamados ch WHERE ch.orcamento_id = o.id)
                AND NOT EXISTS (SELECT 1 FROM equipamento_movimentacoes em WHERE em.orcamento_id = o.id)
                AND ($2::int[] IS NULL OR o.id = ANY($2::int[]))`;
  if (!gravar) {
    const r = await pool.query(`SELECT o.id FROM orcamentos o WHERE ${onde} ORDER BY o.id`, [dias, soIds]);
    return { apagados: 0, candidatos: r.rowCount, ids: r.rows.map(x => x.id) };
  }
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.contexto', $1, true)`,
      [`orçamento vencido, arquivado há mais de ${dias} dias (job orcamento-vencimento)`]);
    const alvo = await c.query(`SELECT o.id, o.os_id FROM orcamentos o WHERE ${onde} FOR UPDATE OF o`, [dias, soIds]);
    const ids = alvo.rows.map(x => x.id);
    if (ids.length) {
      // O pedido do técnico sai da fila, se nenhum outro orçamento da mesma
      // O.S. continuar existindo.
      const osIds = [...new Set(alvo.rows.map(x => x.os_id).filter(Boolean))];
      if (osIds.length) {
        await c.query(
          `UPDATE ordens_servico os SET orcamento_necessario = FALSE
            WHERE os.id = ANY($1::int[])
              AND NOT EXISTS (SELECT 1 FROM orcamentos o2 WHERE o2.os_id = os.id AND NOT (o2.id = ANY($2::int[])))`,
          [osIds, ids]);
      }
      await c.query(`DELETE FROM orcamentos WHERE id = ANY($1::int[])`, [ids]);
    }
    await c.query("COMMIT");
    return { apagados: ids.length, ids };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ── 1. Lembrete ──────────────────────────────────────────────────────────────

// Os orçamentos que pedem lembrete hoje (com ou sem linha de erro a repetir).
async function devidos({ hoje = _hojeSP(), dias, soIds = null } = {}) {
  if (dias == null) dias = (await regras()).lembrete_dias;
  if (!Number.isInteger(Number(dias)) || Number(dias) <= 0) return [];
  const r = await pool.query(
    `SELECT o.id, o.numero, o.condominio_id, o.enviado_para, o.enviado_em,
            to_char(o.valido_ate, 'YYYY-MM-DD') AS validade,
            (o.valido_ate - $1::date) AS faltam,
            COALESCE(NULLIF(c.nome_fantasia, ''), c.nome, o.cliente_nome) AS condominio_nome
       FROM orcamentos o
       LEFT JOIN condominios c ON c.id = o.condominio_id
      WHERE o.status = 'enviado' AND o.arquivado_em IS NULL AND o.respondido_em IS NULL
        AND o.valido_ate IS NOT NULL
        AND o.valido_ate > $1::date AND o.valido_ate <= $1::date + $2::int
        AND (o.enviado_em IS NULL OR o.enviado_em <= NOW() - INTERVAL '2 days')
        AND ($3::int[] IS NULL OR o.id = ANY($3::int[]))
        AND NOT EXISTS (
          SELECT 1 FROM orcamento_lembretes l
           WHERE l.orcamento_id = o.id AND l.valido_ate = o.valido_ate
             AND (l.status <> 'erro' OR l.tentativas >= ${MAX_TENTATIVAS}))
      ORDER BY o.valido_ate, o.id`,
    [hoje, Number(dias), soIds]);
  return r.rows;
}

// O link do painel vai só quando algum destinatário entra no painel daquele
// prédio — a mesma regra do envio: botão que leva a um login onde ninguém
// entra é pior que botão nenhum.
async function _linkPara(o, para) {
  const base = _baseUrl();
  if (!base || !_linkPainelLigado() || !o.condominio_id) return null;
  const u = await pool.query(
    `SELECT 1 FROM usuarios WHERE condominio_id = $1 AND role = 'cliente' AND lower(email) = ANY($2::text[]) LIMIT 1`,
    [o.condominio_id, para]);
  return u.rowCount ? `${base}/cliente/painel/orcamentos?orc=${o.id}` : null;
}

// O PDF do orçamento, como o envio gera (POST /admin/orcamentos/avulsos/:id/
// enviar-email). Nunca lança: sem PDF o lembrete sai sem anexo.
async function _pdfDoOrcamento(o, gerarPdf) {
  try {
    const { fpath } = await gerarPdf(o.id);
    const fs = require("fs");
    if (!fpath || !fs.existsSync(fpath)) throw new Error("PDF não encontrado após a geração");
    return { pdfBuffer: fs.readFileSync(fpath), filename: `orcamento-${o.numero || o.id}.pdf` };
  } catch (e) {
    console.error(`[orcamento-lembrete] FALHA=pdf orcamento=${o.id} motivo=${e.message} — vai sem anexo`);
    return { pdfBuffer: null, filename: null };
  }
}

// Manda os lembretes devidos. `enviar` e `gerarPdf` são injetáveis (o teste
// não manda nada e não precisa do Puppeteer).
async function enviarLembretes({ hoje = _hojeSP(), dias, enviar = email.sendOrcamentoLembrete, gerarPdf = gerarPdfAvulso, forcar = false, soIds = null } = {}) {
  if (!forcar && !ligado()) return { enviados: 0, falhas: 0, sem_email: 0, desligado: true };
  const lista = await devidos({ hoje, dias, soIds });
  let enviados = 0, falhas = 0, semEmail = 0;
  for (const o of lista) {
    const para = separar(o.enviado_para);
    // Trava: a linha nasce 'enviando'; uma linha em 'erro' é retomada (até
    // MAX_TENTATIVAS). Duas voltas ao mesmo tempo não pegam a mesma.
    const trava = await pool.query(
      `INSERT INTO orcamento_lembretes (orcamento_id, valido_ate, dias, destinatarios, status, tentativas)
       VALUES ($1, $2::date, $3, $4, $5::varchar, 1)
       ON CONFLICT (orcamento_id, valido_ate) DO UPDATE
          SET status = EXCLUDED.status, tentativas = orcamento_lembretes.tentativas + 1,
              destinatarios = EXCLUDED.destinatarios, dias = EXCLUDED.dias
        WHERE orcamento_lembretes.status = 'erro' AND orcamento_lembretes.tentativas < ${MAX_TENTATIVAS}
       RETURNING id`,
      [o.id, o.validade, o.faltam, para.length ? para.join(", ") : null, para.length ? "enviando" : "sem_email"]);
    if (!trava.rowCount) continue;
    const id = trava.rows[0].id;
    if (!para.length) { semEmail++; continue; }
    try {
      const { pdfBuffer, filename } = await _pdfDoOrcamento(o, gerarPdf);
      const emailId = await enviar({
        to: para, numero: o.numero || `#${o.id}`, condominioNome: o.condominio_nome,
        validoAte: o.validade, enviadoEm: o.enviado_em, dias: o.faltam,
        linkPainel: await _linkPara(o, para),
        pdfBuffer, filename,
      });
      console.log(`[orcamento-lembrete] OK orcamento=${o.id} destinos=${para.length} anexo_kb=${pdfBuffer ? Math.round(pdfBuffer.length / 1024) : 0}`);
      await pool.query(
        `UPDATE orcamento_lembretes SET status = 'enviado', erro = NULL, email_id = $2, enviado_em = NOW() WHERE id = $1`,
        [id, emailId || null]);
      enviados++;
    } catch (e) {
      await pool.query(`UPDATE orcamento_lembretes SET status = 'erro', erro = $2 WHERE id = $1`, [id, String(e.message).slice(0, 500)]);
      falhas++;
    }
  }
  return { enviados, falhas, sem_email: semEmail };
}

module.exports = { ligado, regras, separar, arquivarVencidos, apagarArquivados, devidos, enviarLembretes, _t: { _hojeSP } };
