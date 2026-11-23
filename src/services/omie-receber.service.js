// src/services/omie-receber.service.js
//
// Cobrança: os títulos a receber EM ATRASO que o sistema emitiu (integração
// com o Omie, fase 3 — docs/modulos/omie-integracao.md, migration 099).
//
// ⚠️ SÓ O QUE O SISTEMA EMITIU (decisão do Pedro, 20/11 e 23/11/2026). O
// Omie lista 190 títulos atrasados, muitos já pagos e nunca baixados pela
// pessoa anterior: mostrar tudo seria ligar para quem já pagou. Entra aqui só
// o título cuja nota saiu pelo sistema:
//   · orçamento avulso: nCodOS = orcamentos.omie_os_codigo (NFS-e) ou
//     nCodPedido = orcamentos.omie_pedido_codigo (DANFE);
//   · contrato do lote: nCodOS = omie_faturamento_itens.omie_os, ou o próprio
//     título já casado pela conciliação (titulo_omie).
//
// Quem diz que o título foi pago é o OMIE (Sicredi baixa sozinho pela API; o
// Bradesco quando o arquivo de retorno é importado lá) — ou alguém aqui, com
// "Marcar como pago", que só vale no sistema (decisão de 20/11/2026: nada é
// gravado no Omie). Nada neste arquivo grava no Omie.
//
// ⚠️ "CONSUMO REDUNDANTE": a cópia é feita pela sincronização de hora em hora
// (omie-faturamento.service chama `sincronizar` depois dos contratos); a tela
// só lê o banco. A única chamada a partir de um clique é o link do boleto
// (ObterBoleto), uma por título e guardada depois.

const { pool } = require("../db");
const omie = require("./omie.service");

const NOME = "receber_atrasados";

// As contas que cobram (as mesmas do lote, ver omie-lote.service.js). O resto
// aparece pelo código.
const CONTAS = { 5960922842: "Sicredi", 6109178168: "Bradesco" };

class CobrancaErro extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// "dd/mm/aaaa" → "aaaa-mm-dd" (ou null)
function _data(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// "AAAA-MM-DD" de hoje em São Paulo (o servidor roda em UTC).
function _hojeSP() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ddd + número do Omie → "(11) 9930-9966". Sem número, null.
function telefoneOmie(ddd, numero) {
  const n = String(numero || "").trim();
  if (!n) return null;
  const d = String(ddd || "").replace(/\D/g, "");
  return (d ? `(${d}) ` : "") + n;
}

async function _listarPorStatus(status) {
  const todos = [];
  for (let p = 1; p <= 30; p++) {
    let j;
    try {
      j = await omie.chamar("financas/contareceber/", "ListarContasReceber", {
        pagina: p, registros_por_pagina: 100, apenas_importado_api: "N", filtrar_por_status: status,
      });
    } catch (e) {
      if (e.naoEncontrado) break; // nenhum atrasado
      throw e;
    }
    todos.push(...(j.conta_receber_cadastro || []));
    if (p >= (j.total_de_paginas || 1)) break;
  }
  return todos;
}
const _listarAtrasadosOmie = () => _listarPorStatus("ATRASADO");

// Os avisos de cobrança (migration 102) precisam também do que ainda não
// venceu. ⚠️ O filtro é "AVENCER"/"VENCEHOJE", mas o título volta com o status
// escrito com espaço: "A VENCER", "VENCE HOJE" (lido em 23/11/2026: 24 e 6
// títulos). E "VENCE HOJE" inclui o que venceu no fim de semana — o Omie
// conta o próximo dia útil. Em série: o Omie atende um método por vez.
async function _listarAVencerOmie() {
  const aVencer = await _listarPorStatus("AVENCER");
  const hoje = await _listarPorStatus("VENCEHOJE");
  return [...aVencer.map(t => ({ ...t, _vence_hoje: false })), ...hoje.map(t => ({ ...t, _vence_hoje: true }))];
}

// O que o sistema emitiu: de qual OS / pedido / título nasceu cada nota.
async function _doSistema(db = pool) {
  const [o, f] = await Promise.all([
    db.query(`SELECT id, omie_os_codigo, omie_pedido_codigo FROM orcamentos
               WHERE omie_os_codigo IS NOT NULL OR omie_pedido_codigo IS NOT NULL`),
    db.query(`SELECT omie_contrato, competencia, omie_os, titulo_omie FROM omie_faturamento_itens
               WHERE status = 'faturado' AND (omie_os IS NOT NULL OR titulo_omie IS NOT NULL)`),
  ]);
  const porOs = new Map(), porPedido = new Map(), porTitulo = new Map();
  for (const x of o.rows) {
    const v = { origem: "orcamento", orcamento_id: x.id };
    if (x.omie_os_codigo) porOs.set(String(x.omie_os_codigo), v);
    if (x.omie_pedido_codigo) porPedido.set(String(x.omie_pedido_codigo), v);
  }
  for (const x of f.rows) {
    const v = { origem: "contrato", omie_contrato: Number(x.omie_contrato), competencia: x.competencia };
    if (x.omie_os) porOs.set(String(x.omie_os), v);
    if (x.titulo_omie) porTitulo.set(String(x.titulo_omie), v);
  }
  return { porOs, porPedido, porTitulo };
}

// De onde veio o título no sistema, ou null (não foi o sistema que emitiu).
function origemDo(t, mapas) {
  return mapas.porTitulo.get(String(t.codigo_lancamento_omie))
    || (t.nCodOS ? mapas.porOs.get(String(t.nCodOS)) : null)
    || (t.nCodPedido ? mapas.porPedido.get(String(t.nCodPedido)) : null)
    || null;
}

async function ultimaSincronizacao() {
  const r = await pool.query(`SELECT ultima_em, ultimo_erro, detalhe FROM omie_sincronizacoes WHERE nome = $1`, [NOME]);
  return r.rows[0] || null;
}

// Troca a cópia inteira pelos atrasados de agora que o sistema emitiu.
// `listar` existe para o teste trocar o Omie por um simulado.
async function sincronizar({ listar = _listarAtrasadosOmie, listarAVencer = _listarAVencerOmie } = {}) {
  try {
    const atrasados = await listar();
    // A vencer: se a leitura falhar (ou a 102 não existir), os atrasados
    // seguem copiados — é deles que a aba "Em atraso" depende.
    let aVencer = null, erroAVencer = null;
    try { aVencer = await listarAVencer(); } catch (e) { erroAVencer = e.message; }
    const mapas = await _doSistema();
    const nossos = [];
    for (const t of atrasados) {
      if (t.status_titulo && t.status_titulo !== "ATRASADO") continue;
      const o = origemDo(t, mapas);
      const venc = _data(t.data_vencimento);
      if (!o || !venc || !t.codigo_lancamento_omie) continue;
      nossos.push({ t, o, venc });
    }
    const unicos = [...new Map(nossos.map(x => [String(x.t.codigo_lancamento_omie), x])).values()];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM omie_receber_atrasados");
      if (unicos.length) await client.query(
        `INSERT INTO omie_receber_atrasados (omie_codigo, omie_cliente, origem, orcamento_id, omie_contrato, competencia,
           documento, parcela, numero_nf, valor, emissao, vencimento, conta_corrente, boleto_numero, atualizado_em)
         SELECT *, NOW() FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::int[], $5::bigint[], $6::text[],
           $7::text[], $8::text[], $9::text[], $10::numeric[], $11::date[], $12::date[], $13::bigint[], $14::text[])`,
        [unicos.map(x => x.t.codigo_lancamento_omie), unicos.map(x => x.t.codigo_cliente_fornecedor || null),
         unicos.map(x => x.o.origem), unicos.map(x => x.o.orcamento_id || null), unicos.map(x => x.o.omie_contrato || null),
         unicos.map(x => x.o.competencia || null), unicos.map(x => x.t.numero_documento || null),
         unicos.map(x => x.t.numero_parcela || null), unicos.map(x => x.t.numero_documento_fiscal || null),
         unicos.map(x => Number(x.t.valor_documento || 0)), unicos.map(x => _data(x.t.data_emissao)), unicos.map(x => x.venc),
         unicos.map(x => x.t.id_conta_corrente || null),
         unicos.map(x => (x.t.boleto?.cGerado === "S" || x.t.boleto?.cNumBancario) ? String(x.t.boleto.cNumBancario || x.t.boleto.cNumBoleto || "") || null : null)]
      );
      let avencerDoSistema = null;
      if (aVencer) {
        const av = [...new Map(aVencer.map(t => ({ t, o: origemDo(t, mapas), venc: _data(t.data_vencimento) }))
          .filter(x => x.o && x.venc && x.t.codigo_lancamento_omie && !/ATRASADO/.test(String(x.t.status_titulo || "")))
          .map(x => [String(x.t.codigo_lancamento_omie), x])).values()];
        await client.query("SAVEPOINT avencer");
        try {
          await client.query("DELETE FROM omie_receber_avencer");
          if (av.length) await client.query(
            `INSERT INTO omie_receber_avencer (omie_codigo, omie_cliente, origem, orcamento_id, omie_contrato, competencia,
               documento, parcela, numero_nf, valor, emissao, vencimento, vence_hoje, conta_corrente, boleto_numero, atualizado_em)
             SELECT *, NOW() FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::int[], $5::bigint[], $6::text[],
               $7::text[], $8::text[], $9::text[], $10::numeric[], $11::date[], $12::date[], $13::boolean[], $14::bigint[], $15::text[])`,
            [av.map(x => x.t.codigo_lancamento_omie), av.map(x => x.t.codigo_cliente_fornecedor || null),
             av.map(x => x.o.origem), av.map(x => x.o.orcamento_id || null), av.map(x => x.o.omie_contrato || null),
             av.map(x => x.o.competencia || null), av.map(x => x.t.numero_documento || null),
             av.map(x => x.t.numero_parcela || null), av.map(x => x.t.numero_documento_fiscal || null),
             av.map(x => Number(x.t.valor_documento || 0)), av.map(x => _data(x.t.data_emissao)), av.map(x => x.venc),
             av.map(x => !!x.t._vence_hoje || /HOJE/.test(String(x.t.status_titulo || ""))),
             av.map(x => x.t.id_conta_corrente || null),
             av.map(x => (x.t.boleto?.cGerado === "S" || x.t.boleto?.cNumBancario) ? String(x.t.boleto.cNumBancario || x.t.boleto.cNumBoleto || "") || null : null)]);
          await client.query("RELEASE SAVEPOINT avencer");
          avencerDoSistema = av.length;
        } catch (e) {
          await client.query("ROLLBACK TO SAVEPOINT avencer");
          erroAVencer = e.message;
        }
      }
      const detalhe = { atrasados_no_omie: atrasados.length, do_sistema: unicos.length,
        a_vencer_no_omie: aVencer ? aVencer.length : null, a_vencer_do_sistema: avencerDoSistema, erro_a_vencer: erroAVencer };
      await client.query(
        `INSERT INTO omie_sincronizacoes (nome, ultima_em, ultimo_erro, detalhe) VALUES ($1, NOW(), NULL, $2)
         ON CONFLICT (nome) DO UPDATE SET ultima_em = NOW(), ultimo_erro = NULL, detalhe = EXCLUDED.detalhe`,
        [NOME, detalhe]);
      await client.query("COMMIT");
      return { ok: true, ...detalhe };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    await pool.query(
      `INSERT INTO omie_sincronizacoes (nome, ultimo_erro) VALUES ($1, $2)
       ON CONFLICT (nome) DO UPDATE SET ultimo_erro = EXCLUDED.ultimo_erro`,
      [NOME, String(e.message).slice(0, 500)]).catch(() => {});
    throw e;
  }
}

// A lista da tela, a partir da cópia. O prédio: o do orçamento; no contrato,
// o elo à mão ou o CNPJ que bate com um prédio só (a regra de
// omie-contratos.service.js).
async function listar() {
  const hoje = _hojeSP();
  const [r, sinc] = await Promise.all([pool.query(`
    SELECT a.*, ($1::date - a.vencimento)::int AS dias,
           -- ⚠️ "documento" já é coluna do título (a.*): o CNPJ do cliente vem
           -- com outro nome, senão um apaga o outro na linha.
           cl.razao_social, cl.nome_fantasia, cl.documento AS cliente_documento, cl.email, cl.telefone, cl.telefone2, cl.contato,
           ct.numero AS contrato_numero,
           p.pago_em AS marcado_pago_em, p.observacao AS marcado_obs, p.marcado_em, u.nome AS marcado_por_nome,
           COALESCE(o.condominio_id, v.condominio_id, CASE WHEN auto.n = 1 THEN auto.condominio_id END) AS condominio_id
      FROM omie_receber_atrasados a
      LEFT JOIN omie_clientes cl ON cl.omie_codigo = a.omie_cliente
      LEFT JOIN omie_contratos ct ON ct.omie_codigo = a.omie_contrato
      LEFT JOIN orcamentos o ON o.id = a.orcamento_id
      LEFT JOIN omie_cliente_vinculos v ON v.omie_cliente = a.omie_cliente
      LEFT JOIN LATERAL (
        SELECT MIN(c.id) AS condominio_id, COUNT(*)::int AS n FROM condominios c
         WHERE cl.documento IS NOT NULL AND cl.documento <> ''
           AND regexp_replace(COALESCE(c.cnpj, ''), '[^0-9]', '', 'g') = cl.documento
      ) auto ON TRUE
      LEFT JOIN omie_receber_pagos p ON p.omie_titulo = a.omie_codigo
      LEFT JOIN usuarios u ON u.id = p.marcado_por
     ORDER BY a.vencimento, a.omie_codigo`, [hoje]), ultimaSincronizacao()]);

  const ids = [...new Set(r.rows.map(x => x.condominio_id).filter(Boolean))];
  const condos = ids.length
    ? new Map((await pool.query(`SELECT id, COALESCE(NULLIF(nome_fantasia, ''), nome) AS nome, telefone, responsavel FROM condominios WHERE id = ANY($1::int[])`, [ids])).rows.map(c => [c.id, c]))
    : new Map();

  const titulos = r.rows.map(x => {
    const c = x.condominio_id ? condos.get(x.condominio_id) : null;
    return {
      omie_codigo: Number(x.omie_codigo),
      origem: x.origem,
      orcamento_id: x.orcamento_id,
      contrato: x.omie_contrato ? { omie_codigo: Number(x.omie_contrato), numero: x.contrato_numero || null, competencia: x.competencia } : null,
      documento: x.documento, parcela: x.parcela, numero_nf: x.numero_nf,
      valor: Number(x.valor),
      emissao: x.emissao, vencimento: x.vencimento, dias: x.dias,
      banco: CONTAS[x.conta_corrente] || (x.conta_corrente ? `Conta ${x.conta_corrente}` : null),
      boleto_numero: x.boleto_numero,
      cliente: {
        omie_codigo: x.omie_cliente == null ? null : Number(x.omie_cliente),
        nome: x.nome_fantasia || x.razao_social || null,
        razao_social: x.razao_social, documento: x.cliente_documento, email: x.email,
        telefone: x.telefone, telefone2: x.telefone2, contato: x.contato,
      },
      condominio: c ? { id: c.id, nome: c.nome, telefone: c.telefone, responsavel: c.responsavel } : null,
      pago: x.marcado_pago_em ? {
        em: x.marcado_pago_em, observacao: x.marcado_obs, marcado_em: x.marcado_em, por: x.marcado_por_nome || null,
      } : null,
    };
  });
  return { titulos, sincronizacao: sinc, hoje };
}

async function _titulo(codigo) {
  const r = await pool.query(`SELECT omie_codigo, boleto_numero FROM omie_receber_atrasados WHERE omie_codigo = $1`, [codigo]);
  if (!r.rowCount) throw new CobrancaErro(404, "Título não está na lista de cobrança (pode ter sido pago no Omie).");
  return r.rows[0];
}

// O link do PDF do boleto. Guardado depois da primeira leitura; só lê.
async function boleto(codigo) {
  const t = await _titulo(codigo);
  const g = await pool.query(`SELECT link FROM omie_boleto_links WHERE omie_titulo = $1`, [codigo]);
  if (g.rowCount) return { link: g.rows[0].link };
  if (!t.boleto_numero) throw new CobrancaErro(404, "Este título não tem boleto gerado no Omie.");
  const b = await omie.obterBoleto(Number(codigo));
  if (!b || !b.cLinkBoleto) throw new CobrancaErro(404, "O Omie não devolveu o link do boleto deste título.");
  await pool.query(
    `INSERT INTO omie_boleto_links (omie_titulo, link) VALUES ($1, $2)
     ON CONFLICT (omie_titulo) DO UPDATE SET link = EXCLUDED.link, lido_em = NOW()`,
    [codigo, b.cLinkBoleto]);
  return { link: b.cLinkBoleto };
}

// "Já pagou", só no sistema. `pagoEm` em "AAAA-MM-DD", não depois de hoje.
async function marcarPago(codigo, { pago_em, observacao } = {}, usuarioId) {
  await _titulo(codigo);
  const dia = String(pago_em || _hojeSP()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(dia))) throw new CobrancaErro(400, "Data do pagamento inválida.");
  if (dia > _hojeSP()) throw new CobrancaErro(400, "A data do pagamento não pode ser depois de hoje.");
  const obs = String(observacao || "").trim().slice(0, 500) || null;
  await pool.query(
    `INSERT INTO omie_receber_pagos (omie_titulo, pago_em, observacao, marcado_por) VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (omie_titulo) DO UPDATE SET pago_em = EXCLUDED.pago_em, observacao = EXCLUDED.observacao,
       marcado_por = EXCLUDED.marcado_por, marcado_em = NOW()`,
    [codigo, dia, obs, usuarioId || null]);
  return { ok: true };
}

async function desmarcarPago(codigo) {
  const r = await pool.query(`DELETE FROM omie_receber_pagos WHERE omie_titulo = $1`, [codigo]);
  if (!r.rowCount) throw new CobrancaErro(404, "Este título não estava marcado como pago.");
  return { ok: true };
}

module.exports = { sincronizar, listar, boleto, marcarPago, desmarcarPago, ultimaSincronizacao, telefoneOmie, origemDo, CobrancaErro, NOME };
