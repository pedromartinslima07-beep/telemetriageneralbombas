// src/services/omie-lote.service.js
//
// O lote do faturamento dos contratos (integração com o Omie, fase 2 —
// docs/modulos/omie-integracao.md; migration 097).
//
// ⚠️ O SISTEMA NUNCA FATURA SOZINHO (decisão do Pedro, 20/11/2026). Ele
// prepara o lote do mês (quem entra, quem fica de fora e por quê); o Pedro
// confere, tira quem quiser e confirma. Só a confirmação chama o Omie.
// Nenhum job daqui fatura nada: o job do faturamento só COPIA e, na volta,
// devolve a nota e o boleto ao item (`conciliar`).
//
// ⚠️ AS TRÊS TRAVAS CONTRA NOTA EM DOBRO:
//   1. `omie_faturamento_itens` tem UMA linha por (competência, contrato), e o
//      envio só "pega" a linha que não existe ou que está em `erro`;
//   2. o contrato que já tem nota do mês na cópia do Omie fica de fora;
//   3. antes de enviar, o Omie diz quem ele considera pendente no mês
//      (`ObterContratos cEtapa 20`); quem não está lá não vai. É o que segura
//      o caso de alguém ter faturado pela tela do Omie depois da cópia.
// E a quarta, de bom senso: chamada que caiu sem resposta vira `incerto` e
// NÃO vai de novo sozinha. Só volta a `erro` (e ao lote) quando a
// sincronização não acha nota e o Pedro libera à mão.
//
// ⚠️ OMIE_EMISSAO=1 É OBRIGATÓRIO para confirmar (a mesma chave das notas
// avulsas). O Omie não tem ambiente de teste: um servidor local com as chaves
// faturaria de verdade. Preparar, tirar e conferir funcionam sem ela.

const { pool } = require("../db");
const omie = require("./omie.service");
const { getConfigInt } = require("./config.service");
const { emissaoLigada } = require("./nota-fiscal.service");
const omieContratos = require("./omie-contratos.service");

// As contas que cobram (lidas pela API em 20/11/2026). Os 81 contratos ativos
// cobram no Sicredi; o Bradesco é o das OS faturadas pelo sistema. Contrato em
// outra conta fica fora do lote, com o motivo.
const CONTAS = {
  5960922842: "Sicredi",
  6109178168: "Bradesco",
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PAUSA_MS = 600;           // entre um FaturarContrato e outro
const SINCRONIZAR_DEPOIS_MS = 3 * 60 * 1000; // a NFS-e leva uns minutos na prefeitura

let _rodando = null; // { competencia, total, feitos, inicio }

// ── Datas ───────────────────────────────────────────────────────────────────

const _iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _br = d => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

// Domingo de Páscoa (algoritmo de Meeus/Butcher).
function _pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12);
}

// Os dias em que banco não abre: feriados nacionais, Carnaval, Sexta-feira
// Santa e Corpus Christi. Feriado municipal não entra (a General fatura em SP,
// mas o dia proposto é só proposta — o Pedro confirma quando quiser).
function feriados(ano) {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(x => `${ano}-${x}`);
  const p = _pascoa(ano);
  const desloc = n => { const d = new Date(p); d.setDate(d.getDate() + n); return _iso(d); };
  return new Set([...fixos, desloc(-48), desloc(-47), desloc(-2), desloc(60)]);
}

function diaUtil(d) {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6 && !feriados(d.getFullYear()).has(_iso(d));
}

// O dia em que o lote de 'AAAA-MM' é proposto: o dia configurado (padrão 1)
// ou o próximo dia útil depois dele.
async function diaProposto(competencia, dia = null) {
  const cfg = dia || await getConfigInt("omie.faturamento_dia", 1).catch(() => 1);
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(ano, mes - 1, Math.min(Math.max(cfg, 1), 28), 12);
  for (let i = 0; i < 15 && !diaUtil(d); i++) d.setDate(d.getDate() + 1);
  return { data: _iso(d), dia_configurado: cfg };
}

// O mês de hoje em São Paulo ('AAAA-MM').
function competenciaAtual() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${p.find(x => x.type === "year").value}-${p.find(x => x.type === "month").value}`;
}

// ── O lote ──────────────────────────────────────────────────────────────────

class LoteErro extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

const _data = v => (v ? new Date(typeof v === "string" ? v.slice(0, 10) + "T12:00:00" : v) : null);
const _dataBr = v => { const d = _data(v); return d ? _br(d) : ""; };

// O lote de uma competência, montado na hora a partir da cópia do Omie e dos
// itens já gravados. `estado` de cada contrato:
//   entra · tirado · fora (com `motivo`) · enviando · faturado · erro (entra
//   de novo, com a mensagem do Omie) · incerto
async function montar(competencia) {
  if (!/^\d{4}-\d{2}$/.test(String(competencia || ""))) throw new LoteErro(400, "Competência inválida (AAAA-MM).");
  const [ano, mes] = competencia.split("-").map(Number);
  const inicioMes = new Date(ano, mes - 1, 1, 12);
  // ⚠️ O ESTADO DO ENVIO É LIDO UMA VEZ, ANTES DAS CONSULTAS. Lido depois, o
  // lote podia acabar no meio: a resposta saía com "rodando: null" e um item
  // ainda "enviando" — a tela parava de se atualizar e o teste falhava 1 em 4.
  const rodando = _rodando && _rodando.competencia === competencia ? { total: _rodando.total, feitos: _rodando.feitos } : null;
  const algumRodando = !!_rodando;

  const [{ contratos, sincronizacao }, r] = await Promise.all([
    omieContratos.listar(),
    pool.query(
      `SELECT oc.omie_codigo, oc.conta_corrente,
              i.status AS item_status, i.valor AS item_valor, i.omie_os, i.omie_status, i.omie_mensagem,
              i.nfse_numero, i.titulo_omie, i.titulo_vencimento, i.titulo_valor, i.titulo_status,
              i.boleto_numero, i.boleto_bancario, i.boleto_gerado, i.boleto_pedido_em, i.enviado_em, i.atualizado_em AS item_em,
              u.nome AS por_nome,
              nt.numero_nfse AS nota_mes, nt.emitida_em AS nota_mes_em
         FROM omie_contratos oc
         LEFT JOIN omie_faturamento_itens i ON i.omie_contrato = oc.omie_codigo AND i.competencia = $1
         LEFT JOIN usuarios u ON u.id = i.por_usuario
         LEFT JOIN LATERAL (
           SELECT n.numero_nfse, n.emitida_em FROM omie_contrato_notas n
            WHERE n.omie_contrato = oc.omie_codigo AND n.competencia = $1 AND COALESCE(n.status, '') <> 'C'
            ORDER BY n.emitida_em LIMIT 1
         ) nt ON TRUE`,
      [competencia]),
  ]);
  const extra = new Map(r.rows.map(x => [Number(x.omie_codigo), x]));

  const itens = [];
  for (const c of contratos) {
    const x = extra.get(c.omie_codigo) || {};
    if (!c.ativo && !x.item_status) continue; // só os ativos, e quem já tem item no mês
    const conta = x.conta_corrente == null ? null : Number(x.conta_corrente);
    const base = {
      omie_codigo: c.omie_codigo,
      numero: c.numero,
      valor: c.valor_mensal,
      condominio_id: c.condominio_id,
      condominio_nome: c.condominio_nome || null,
      cliente: c.cliente ? (c.cliente.nome_fantasia || c.cliente.razao_social) : null,
      ligacao: c.ligacao,
      conta_corrente: conta,
      banco: conta && CONTAS[conta] ? CONTAS[conta] : null,
      vigencia_fim: c.vigencia_fim,
      omie_os: x.omie_os ? Number(x.omie_os) : null,
      mensagem: x.omie_mensagem || null,
      nfse: x.nfse_numero || null,
      titulo: x.titulo_omie ? {
        vencimento: x.titulo_vencimento, valor: x.titulo_valor == null ? null : Number(x.titulo_valor),
        status: x.titulo_status, boleto: x.boleto_numero, nosso_numero: x.boleto_bancario,
        // false = o título existe e o Omie não gerou boleto: o painel avisa.
        boleto_gerado: x.boleto_gerado == null ? null : x.boleto_gerado,
        boleto_pedido_em: x.boleto_pedido_em || null,
        pode_gerar_boleto: x.boleto_gerado === false && !["RECEBIDO", "CANCELADO"].includes(String(x.titulo_status || "").toUpperCase()),
      } : null,
      enviado_em: x.enviado_em || null,
      por: x.por_nome || null,
    };

    let estado, motivo = null, tipo = null;
    // `enviando` sem lote rodando = o servidor caiu no meio da chamada: é incerto.
    const st = x.item_status === "enviando" && !algumRodando ? "incerto" : x.item_status;
    if (st === "faturado" || st === "enviando" || st === "incerto") estado = st;
    else if (x.nota_mes) { estado = "fora"; tipo = "nota"; motivo = `Já tem nota de ${MESES[mes - 1]} no Omie (nº ${x.nota_mes}, ${_dataBr(x.nota_mes_em)}).`; }
    else if (!c.ativo) { estado = "fora"; tipo = "situacao"; motivo = `Contrato ${c.situacao_rotulo.toLowerCase()} no Omie.`; }
    else if (c.vigencia_fim && _data(c.vigencia_fim) < inicioMes) { estado = "fora"; motivo = `A vigência acabou em ${_dataBr(c.vigencia_fim)}. Renove no Omie antes de faturar.`; }
    else if (conta == null) { estado = "fora"; motivo = "A conta de cobrança do contrato ainda não foi copiada. Use \"Atualizar do Omie\"."; }
    else if (!CONTAS[conta]) { estado = "fora"; motivo = `Cobra na conta ${conta} do Omie, fora do Sicredi e do Bradesco.`; }
    else if (!(c.valor_mensal > 0)) { estado = "fora"; motivo = "Valor mensal zerado no Omie."; }
    else if (st === "tirado") estado = "tirado";
    else estado = st === "erro" ? "erro" : "entra";

    itens.push({ ...base, estado, motivo, motivo_tipo: tipo });
  }

  const ORDEM = { incerto: 0, erro: 1, enviando: 2, entra: 3, tirado: 4, fora: 5, faturado: 6 };
  itens.sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado] || String(a.condominio_nome || a.cliente || a.numero).localeCompare(String(b.condominio_nome || b.cliente || b.numero), "pt-BR"));

  const soma = l => Math.round(l.reduce((s, i) => s + (i.valor || 0), 0) * 100) / 100;
  const de = e => itens.filter(i => e.includes(i.estado));
  const vaoNoLote = de(["entra", "erro"]);
  const prop = await diaProposto(competencia);
  return {
    competencia,
    competencia_atual: competencia === competenciaAtual(),
    dia_proposto: prop.data,
    dia_configurado: prop.dia_configurado,
    emissao_ligada: emissaoLigada(),
    rodando,
    resumo: {
      no_lote: vaoNoLote.length, valor_lote: soma(vaoNoLote),
      faturados: de(["faturado"]).length, valor_faturado: soma(de(["faturado"])),
      tirados: de(["tirado"]).length, fora: de(["fora"]).filter(i => i.motivo_tipo !== "nota").length,
      // A nota do mês feita pela tela do Omie (fora do sistema) também conta como faturado.
      com_nota_omie: itens.filter(i => i.motivo_tipo === "nota").length,
      esperados: itens.filter(i => i.motivo_tipo !== "situacao").length,
      incertos: de(["incerto"]).length, enviando: de(["enviando"]).length,
      sem_boleto: itens.filter(i => i.titulo?.pode_gerar_boleto).length,
    },
    contas: CONTAS,
    itens,
    sincronizacao,
  };
}

// Tirar do lote (ou devolver). Só mexe em quem está para entrar: o que já foi
// enviado não se tira.
async function tirar(competencia, omieContrato, tirarDoLote, usuarioId) {
  const cod = Number(omieContrato);
  if (!Number.isSafeInteger(cod) || cod <= 0) throw new LoteErro(400, "Contrato inválido.");
  if (tirarDoLote) {
    const r = await pool.query(
      `INSERT INTO omie_faturamento_itens (competencia, omie_contrato, status, por_usuario)
       VALUES ($1, $2, 'tirado', $3)
       ON CONFLICT (competencia, omie_contrato) DO UPDATE SET status = 'tirado', por_usuario = EXCLUDED.por_usuario, atualizado_em = NOW()
         WHERE omie_faturamento_itens.status IN ('tirado', 'erro')
       RETURNING id`,
      [competencia, cod, usuarioId || null]);
    if (!r.rows.length) throw new LoteErro(409, "Esse contrato já foi enviado ao Omie neste mês; não dá para tirar.");
  } else {
    await pool.query(`DELETE FROM omie_faturamento_itens WHERE competencia = $1 AND omie_contrato = $2 AND status = 'tirado'`, [competencia, cod]);
  }
  return { ok: true };
}

// ⚠️ GRAVA NO OMIE. `contratos` = os códigos que o Pedro viu na tela e
// confirmou; `valorTotal` = o total que a tela mostrou. Se a lista ou o total
// não baterem com o lote de agora (alguém mexeu, a cópia mudou), nada sai.
async function confirmar(competencia, contratos, valorTotal, usuarioId) {
  if (!emissaoLigada()) throw new LoteErro(503, "Faturamento desligado neste ambiente (OMIE_EMISSAO). Nada foi enviado.");
  if (_rodando) throw new LoteErro(409, "Já há um lote sendo enviado ao Omie. Espere terminar.");
  if (competencia !== competenciaAtual()) throw new LoteErro(400, "Só se fatura o mês corrente: o Omie fatura o contrato no mês em que é chamado.");
  const pedidos = [...new Set((Array.isArray(contratos) ? contratos : []).map(Number))].filter(n => Number.isSafeInteger(n) && n > 0);
  if (!pedidos.length) throw new LoteErro(400, "Nenhum contrato para faturar.");

  const lote = await montar(competencia);
  const porCodigo = new Map(lote.itens.map(i => [i.omie_codigo, i]));
  const fora = pedidos.filter(c => !["entra", "erro"].includes(porCodigo.get(c)?.estado));
  if (fora.length) throw new LoteErro(409, "O lote mudou desde que a tela foi aberta. Confira de novo antes de confirmar.", { contratos: fora });
  const total = Math.round(pedidos.reduce((s, c) => s + (porCodigo.get(c).valor || 0), 0) * 100) / 100;
  if (Math.abs(total - Number(valorTotal)) > 0.009) throw new LoteErro(409, `O total mudou (agora ${total.toFixed(2)}). Confira de novo antes de confirmar.`);

  // A trava do próprio Omie: quem ele considera pendente no mês.
  let pendentes;
  try { pendentes = new Set(await omie.contratosPendentesDeFaturar()); }
  catch (e) { throw new LoteErro(502, `Não consegui perguntar ao Omie quem está pendente (${e.message}). Nada foi enviado.`); }

  _rodando = { competencia, total: pedidos.length, feitos: 0, inicio: new Date() };
  // Responde já; o envio segue em série e a tela acompanha pelo GET.
  setImmediate(() => _enviar(competencia, pedidos, porCodigo, pendentes, usuarioId)
    .catch(e => console.error("[lote] envio falhou:", e))
    .finally(() => {
      _rodando = null;
      setTimeout(() => require("./omie-faturamento.service").sincronizar({ forcar: true })
        .catch(e => console.error("[lote] sincronização depois do lote:", e.message)), SINCRONIZAR_DEPOIS_MS).unref?.();
    }));
  return { ok: true, enviando: pedidos.length, valor: total };
}

async function _enviar(competencia, pedidos, porCodigo, pendentes, usuarioId) {
  for (const cod of pedidos) {
    const it = porCodigo.get(cod);
    try {
      if (!pendentes.has(cod)) {
        await _gravar(competencia, cod, it, "erro", { omie_status: "NAO-PENDENTE",
          omie_mensagem: "O Omie não lista este contrato como pendente no mês (já faturado lá, fora da vigência ou antes do dia de faturamento). Nada foi enviado." }, usuarioId, false);
        continue;
      }
      // Pega a linha: só se ela não existe ou está em erro. Senão, outro envio
      // já passou por aqui, e este não vai.
      const pega = await pool.query(
        `INSERT INTO omie_faturamento_itens (competencia, omie_contrato, status, valor, conta_corrente, por_usuario, enviado_em)
         VALUES ($1, $2, 'enviando', $3, $4, $5, NOW())
         ON CONFLICT (competencia, omie_contrato) DO UPDATE SET status = 'enviando', valor = EXCLUDED.valor,
           conta_corrente = EXCLUDED.conta_corrente, por_usuario = EXCLUDED.por_usuario, enviado_em = NOW(),
           omie_status = NULL, omie_mensagem = NULL, atualizado_em = NOW()
           WHERE omie_faturamento_itens.status = 'erro'
         RETURNING id`,
        [competencia, cod, it.valor, it.conta_corrente, usuarioId || null]);
      if (!pega.rows.length) continue;

      let resp;
      try { resp = await omie.faturarContrato(cod); }
      catch (e) {
        // Recusa do Omie (faultstring) = não faturou. Rede/tempo = não se sabe.
        const semResposta = e instanceof omie.OmieErro ? e.status === 504 : true;
        await _gravar(competencia, cod, it, semResposta ? "incerto" : "erro",
          { omie_status: e.faultcode ? String(e.faultcode).slice(0, 40) : null, omie_mensagem: String(e.message).slice(0, 500) }, usuarioId, true);
        continue;
      }
      const okOmie = String(resp?.cCodStatus ?? "0") === "0" && Number(resp?.nCodOS) > 0;
      await _gravar(competencia, cod, it, okOmie ? "faturado" : "erro", {
        omie_os: Number(resp?.nCodOS) || null, omie_status: resp?.cCodStatus == null ? null : String(resp.cCodStatus),
        omie_mensagem: resp?.cDescStatus ? String(resp.cDescStatus).slice(0, 500) : null,
      }, usuarioId, true);
    } catch (e) {
      console.error(`[lote] contrato ${cod}:`, e.message);
    } finally {
      if (_rodando) _rodando.feitos++;
      await new Promise(r => setTimeout(r, PAUSA_MS));
    }
  }
}

async function _gravar(competencia, cod, it, status, campos, usuarioId, enviado) {
  await pool.query(
    `INSERT INTO omie_faturamento_itens (competencia, omie_contrato, status, valor, conta_corrente, omie_os, omie_status, omie_mensagem, por_usuario, enviado_em)
     VALUES ($1, $2, $3::varchar, $4, $5, $6, $7, $8, $9, CASE WHEN $10::boolean THEN NOW() END)
     ON CONFLICT (competencia, omie_contrato) DO UPDATE SET status = $3::varchar, omie_os = COALESCE(EXCLUDED.omie_os, omie_faturamento_itens.omie_os),
       omie_status = EXCLUDED.omie_status, omie_mensagem = EXCLUDED.omie_mensagem, atualizado_em = NOW()`,
    [competencia, cod, status, it.valor, it.conta_corrente, campos.omie_os || null, campos.omie_status || null,
     campos.omie_mensagem || null, usuarioId || null, enviado]);
}

// O `incerto` volta ao lote só pela mão do Pedro, depois de conferir no Omie
// que a nota não saiu — e só se a cópia também não tem nota do mês.
async function liberar(competencia, omieContrato, usuarioId) {
  const cod = Number(omieContrato);
  const n = await pool.query(
    `SELECT 1 FROM omie_contrato_notas WHERE omie_contrato = $1 AND competencia = $2 AND COALESCE(status, '') <> 'C' LIMIT 1`,
    [cod, competencia]);
  if (n.rows.length) throw new LoteErro(409, "A cópia do Omie já tem nota deste contrato no mês: ele foi faturado.");
  const r = await pool.query(
    `UPDATE omie_faturamento_itens SET status = 'erro', omie_status = 'LIBERADO',
       omie_mensagem = 'Liberado à mão depois de conferir no Omie que a nota não saiu.', por_usuario = $3, atualizado_em = NOW()
     WHERE competencia = $1 AND omie_contrato = $2 AND (status = 'incerto' OR (status = 'enviando' AND $4::boolean)) RETURNING id`,
    [competencia, cod, usuarioId || null, !_rodando]);
  if (!r.rows.length) throw new LoteErro(409, "Só se libera contrato com envio incerto.");
  return { ok: true };
}

// Chamado pela sincronização (omie-faturamento.service), depois de copiar as
// notas: a nota volta ao item pela OS; o `incerto` vira `faturado` se a nota
// do mês apareceu; e o título a receber (com o boleto) volta pela nota.
async function conciliar() {
  const a = await pool.query(
    `UPDATE omie_faturamento_itens i SET nfse_numero = n.numero_nfse, atualizado_em = NOW()
       FROM omie_contrato_notas n
      WHERE i.status = 'faturado' AND i.nfse_numero IS NULL AND i.omie_os IS NOT NULL
        AND n.omie_os = i.omie_os AND COALESCE(n.status, '') <> 'C'`);
  const b = await pool.query(
    `UPDATE omie_faturamento_itens i SET status = 'faturado', nfse_numero = n.numero_nfse,
            omie_os = COALESCE(i.omie_os, n.omie_os), omie_mensagem = 'A nota apareceu no Omie depois do envio sem resposta.', atualizado_em = NOW()
       FROM omie_contrato_notas n
      WHERE i.status IN ('incerto', 'enviando') AND n.omie_contrato = i.omie_contrato AND n.competencia = i.competencia
        AND COALESCE(n.status, '') <> 'C' AND n.emitida_em >= (i.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date`);

  // Os títulos: dos itens faturados nos últimos 60 dias, lidos de uma vez.
  const t = await pool.query(
    `SELECT i.id, i.nfse_numero, oc.omie_cliente, i.enviado_em
       FROM omie_faturamento_itens i JOIN omie_contratos oc ON oc.omie_codigo = i.omie_contrato
      WHERE i.status = 'faturado' AND i.nfse_numero IS NOT NULL AND i.enviado_em > NOW() - INTERVAL '60 days'`);
  let titulos = 0;
  if (t.rows.length) {
    const de = new Date(Math.min(...t.rows.map(x => new Date(x.enviado_em).getTime())));
    de.setDate(de.getDate() - 1);
    const lista = await omie.listarContasReceber({ de: _br(de), ate: _br(new Date()) });
    const semZero = s => String(s || "").replace(/^0+/, "");
    for (const it of t.rows) {
      const tit = lista.find(x => semZero(x.numero_documento_fiscal) === semZero(it.nfse_numero)
        && Number(x.codigo_cliente_fornecedor) === Number(it.omie_cliente) && x.status_titulo !== "CANCELADO");
      if (!tit) continue;
      const venc = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(tit.data_vencimento || "");
      await pool.query(
        `UPDATE omie_faturamento_itens SET titulo_omie = $2, titulo_vencimento = $3, titulo_valor = $4, titulo_status = $5,
                boleto_numero = COALESCE($6, boleto_numero), boleto_bancario = COALESCE($7, boleto_bancario),
                boleto_gerado = (COALESCE(boleto_gerado, FALSE) OR $8::boolean), atualizado_em = NOW() WHERE id = $1`,
        [it.id, tit.codigo_lancamento_omie, venc ? `${venc[3]}-${venc[2]}-${venc[1]}` : null, Number(tit.valor_documento || 0),
         tit.status_titulo || null, tit.boleto?.cNumBoleto || null, tit.boleto?.cNumBancario || null,
         tit.boleto?.cGerado === "S" || !!tit.boleto?.cNumBancario]);
      titulos++;
    }
  }
  return { notas: a.rowCount, incertos_resolvidos: b.rowCount, titulos };
}

// ⚠️ GRAVA NO OMIE. O boleto de um título que o Omie não gerou junto com a
// nota (o painel avisa "nota sem boleto"). Pedido pelo Pedro, com
// confirmação na tela; nunca sozinho. Antes de gerar, pergunta ao Omie se o
// título já tem boleto (alguém pode ter gerado pela tela de lá): se tem, só
// guarda o que veio. Pedido em andamento (há menos de 10 min, sem resposta)
// não vai de novo.
async function gerarBoleto(competencia, omieContrato, usuarioId) {
  if (!emissaoLigada()) throw new LoteErro(503, "Geração de boleto desligada neste ambiente (OMIE_EMISSAO). Nada foi enviado.");
  const cod = Number(omieContrato);
  const r = await pool.query(
    `UPDATE omie_faturamento_itens SET boleto_pedido_em = NOW(), atualizado_em = NOW()
      WHERE competencia = $1 AND omie_contrato = $2 AND status = 'faturado' AND titulo_omie IS NOT NULL
        AND boleto_gerado IS FALSE AND UPPER(COALESCE(titulo_status, '')) NOT IN ('RECEBIDO', 'CANCELADO')
        AND (boleto_pedido_em IS NULL OR boleto_pedido_em < NOW() - INTERVAL '10 minutes')
      RETURNING id, titulo_omie`,
    [competencia, cod]);
  if (!r.rows.length) {
    throw new LoteErro(409, "Este contrato não tem título sem boleto (já tem boleto, foi pago ou cancelado, ainda não tem título, ou o pedido está em andamento).");
  }
  const { id, titulo_omie } = r.rows[0];
  const salvar = (b, origem) => pool.query(
    `UPDATE omie_faturamento_itens SET boleto_gerado = TRUE, boleto_numero = COALESCE($2, boleto_numero),
            boleto_bancario = COALESCE($3, boleto_bancario), boleto_pedido_em = NULL, por_usuario = COALESCE($4, por_usuario),
            omie_mensagem = $5, atualizado_em = NOW() WHERE id = $1`,
    [id, b.cNumBoleto || null, b.cNumBancario || null, usuarioId || null, origem]);
  try {
    const ja = await omie.obterBoleto(Number(titulo_omie));
    if (ja) { await salvar(ja, "O título já tinha boleto no Omie; nada foi gerado."); return { ok: true, gerado: false, ja_tinha: true, nosso_numero: ja.cNumBancario || null }; }
    const b = await omie.gerarBoleto(Number(titulo_omie));
    await salvar(b, "Boleto gerado pelo sistema.");
    return { ok: true, gerado: true, nosso_numero: b.cNumBancario || null, vencimento_boleto: b.dDtEmBol || null };
  } catch (e) {
    // Recusa do Omie: libera para pedir de novo. Queda sem resposta: fica
    // travado 10 min (o boleto pode ter saído; a próxima cópia mostra).
    const semResposta = e instanceof omie.OmieErro ? e.status === 504 : true;
    await pool.query(
      `UPDATE omie_faturamento_itens SET boleto_pedido_em = CASE WHEN $2::boolean THEN boleto_pedido_em END,
              omie_mensagem = $3, atualizado_em = NOW() WHERE id = $1`,
      [id, semResposta, (semResposta ? "Boleto pedido, o Omie não respondeu: " : "O Omie recusou o boleto: ") + String(e.message).slice(0, 400)]);
    throw new LoteErro(semResposta ? 504 : 502, semResposta
      ? "O Omie não respondeu. O boleto pode ter saído: confira na próxima cópia antes de pedir de novo (liberado em 10 min)."
      : `O Omie recusou o boleto: ${e.message}`);
  }
}

module.exports = { gerarBoleto, montar, tirar, confirmar, liberar, conciliar, diaProposto, diaUtil, feriados, competenciaAtual, LoteErro, CONTAS };
