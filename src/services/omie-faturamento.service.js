// src/services/omie-faturamento.service.js
//
// Acompanhamento do faturamento dos contratos de serviço do Omie, para a
// agenda (migration 092). SÓ LEITURA: nenhuma chamada daqui inclui, altera ou
// fatura nada no Omie.
//
// ⚠️ AS NOTAS DAS PREVENTIVAS SAEM PELO OMIE, NÃO POR NÓS. O faturamento de
// contratos do Omie emite todas de uma vez no começo do mês (71 em
// 03/11/2026). O que este serviço faz é copiar os contratos e as NFS-e que
// cada um gerou, para a agenda dizer "78 de 81 faturados" e listar o que
// falta. Emitir daqui daria nota em dobro.
//
// ⚠️ "CONSUMO REDUNDANTE": o Omie recusa a mesma consulta repetida em menos
// de ~1 min (`REDUNDANT`, "Aguarde N segundos"). Por isso a cópia vive no
// banco e é atualizada pelo job (src/jobs/omie-faturamento.job.js) ou pelo
// botão "Atualizar agora", que respeita um intervalo mínimo.

const { pool } = require("../db");
const omie = require("./omie.service");

const NOME = "faturamento_contratos";
const INTERVALO_MINIMO_MS = 2 * 60 * 1000;

// "dd/mm/aaaa" → "aaaa-mm-dd" (ou null)
function _data(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function _br(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function competenciaDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function _listarContratos() {
  const todos = [];
  for (let p = 1; p <= 40; p++) {
    const j = await omie.chamar("servicos/contrato/", "ListarContratos",
      { pagina: p, registros_por_pagina: 50, apenas_importado_api: "N" });
    todos.push(...(j.contratoCadastro || []));
    if (p >= (j.total_de_paginas || 1)) break;
  }
  return todos;
}

// Os clientes do Omie (migration 096): é pelo CNPJ deles que o contrato acha
// o prédio. A lista inteira, de 50 em 50 (o Omie não filtra "só quem tem
// contrato").
async function _listarClientes() {
  const todos = [];
  for (let p = 1; p <= 80; p++) {
    const j = await omie.chamar("geral/clientes/", "ListarClientes",
      { pagina: p, registros_por_pagina: 50, apenas_importado_api: "N" });
    todos.push(...(j.clientes_cadastro || []));
    if (p >= (j.total_de_paginas || 1)) break;
  }
  return todos;
}

async function _listarNotas(de, ate) {
  const todas = [];
  for (let p = 1; p <= 40; p++) {
    let j;
    try {
      j = await omie.chamar("servicos/nfse/", "ListarNFSEs",
        { nPagina: p, nRegPorPagina: 100, dEmiInicial: _br(de), dEmiFinal: _br(ate) });
    } catch (e) {
      if (e.naoEncontrado) break; // mês sem nota nenhuma
      throw e;
    }
    const lista = j.nfseEncontradas || [];
    todas.push(...lista);
    const totPag = j.nTotPaginas || j.total_de_paginas;
    if (lista.length < 100 || (totPag && p >= totPag)) break;
  }
  return todas;
}

async function ultimaSincronizacao() {
  const r = await pool.query(`SELECT ultima_em, ultimo_erro, detalhe FROM omie_sincronizacoes WHERE nome = $1`, [NOME]);
  return r.rows[0] || null;
}

// Copia contratos e as notas do mês atual e do anterior. `forcar` ignora o
// intervalo mínimo (o job usa; o botão não).
async function sincronizar({ forcar = false } = {}) {
  const ult = await ultimaSincronizacao();
  if (!forcar && ult?.ultima_em && Date.now() - new Date(ult.ultima_em).getTime() < INTERVALO_MINIMO_MS) {
    return { ok: true, pulado: true, motivo: "atualizado há menos de 2 minutos", ultima_em: ult.ultima_em };
  }
  try {
    const contratos = await _listarContratos();
    const hoje = new Date();
    const inicioAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const notas = await _listarNotas(inicioAnterior, hoje);
    // ⚠️ OS CLIENTES NÃO TRAVAM O RESTO. Se a leitura deles falhar, contratos e
    // notas seguem copiados (é o que a Agenda usa no dia 1) e o erro fica no
    // `detalhe` da sincronização; a tela de contratos mostra a cópia anterior.
    let clientes = null, erroClientes = null;
    try { clientes = await _listarClientes(); }
    catch (e) { erroClientes = String(e.message).slice(0, 300); }

    const client = await pool.connect();
    let nNotas = 0;
    try {
      await client.query("BEGIN");
      for (const c of contratos) {
        const k = c.cabecalho || {};
        await client.query(
          `INSERT INTO omie_contratos (omie_codigo, numero, omie_cliente, situacao, valor_mensal, dia_faturamento, vigencia_inicio, vigencia_fim, atualizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
           ON CONFLICT (omie_codigo) DO UPDATE SET numero = EXCLUDED.numero, omie_cliente = EXCLUDED.omie_cliente,
             situacao = EXCLUDED.situacao, valor_mensal = EXCLUDED.valor_mensal, dia_faturamento = EXCLUDED.dia_faturamento,
             vigencia_inicio = EXCLUDED.vigencia_inicio, vigencia_fim = EXCLUDED.vigencia_fim, atualizado_em = NOW()`,
          [k.nCodCtr, k.cNumCtr || null, k.nCodCli || null, k.cCodSit || null, Number(k.nValTotMes || 0),
           k.nDiaFat || null, _data(k.dVigInicial), _data(k.dVigFinal)]
        );
      }
      for (const n of notas) {
        const ctr = n.OrdemServico?.nCodigoContrato;
        if (!ctr) continue; // nota avulsa, não é de contrato
        const emitida = _data(n.Emissao?.cDataEmissao);
        if (!emitida) continue;
        await client.query(
          `INSERT INTO omie_contrato_notas (omie_nfse, omie_contrato, numero_nfse, competencia, emitida_em, valor, status, atualizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (omie_nfse) DO UPDATE SET status = EXCLUDED.status, valor = EXCLUDED.valor, atualizado_em = NOW()`,
          [n.Cabecalho?.nCodNF, ctr, String(n.Cabecalho?.nNumeroNFSe || ""), emitida.slice(0, 7), emitida,
           Number(n.Cabecalho?.nValorNFSe || n.OrdemServico?.nValorOS || 0), n.Cabecalho?.cStatusNFSe || null]
        );
        nNotas++;
      }
      for (const c of clientes || []) {
        if (!c.codigo_cliente_omie) continue;
        const doc = String(c.cnpj_cpf || "").replace(/\D/g, "").slice(0, 14) || null;
        await client.query(
          `INSERT INTO omie_clientes (omie_codigo, documento, razao_social, nome_fantasia, email, cidade, inativo, atualizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (omie_codigo) DO UPDATE SET documento = EXCLUDED.documento, razao_social = EXCLUDED.razao_social,
             nome_fantasia = EXCLUDED.nome_fantasia, email = EXCLUDED.email, cidade = EXCLUDED.cidade,
             inativo = EXCLUDED.inativo, atualizado_em = NOW()`,
          [c.codigo_cliente_omie, doc, c.razao_social || null, c.nome_fantasia || null,
           c.email || null, c.cidade || null, c.inativo === "S"]
        );
      }
      const detalhe = { contratos: contratos.length, notas_de_contrato: nNotas, notas_lidas: notas.length,
                        clientes: clientes ? clientes.length : null, erro_clientes: erroClientes };
      await client.query(
        `INSERT INTO omie_sincronizacoes (nome, ultima_em, ultimo_erro, detalhe) VALUES ($1, NOW(), NULL, $2)
         ON CONFLICT (nome) DO UPDATE SET ultima_em = NOW(), ultimo_erro = NULL, detalhe = EXCLUDED.detalhe`,
        [NOME, detalhe]
      );
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
      [NOME, String(e.message).slice(0, 500)]
    ).catch(() => {});
    throw e;
  }
}

// O retrato do faturamento de uma competência ('AAAA-MM'), a partir da cópia.
// "Esperado" = contrato ativo (situação 10) cujo dia de faturamento já cabe no
// mês. Cada um vem com a nota do mês, ou sem ela — e, sem ela, o motivo
// provável quando dá para ver (vigência já acabou).
async function retratoDoMes(competencia) {
  const [ano, mes] = competencia.split("-").map(Number);
  const fimMes = new Date(ano, mes, 0);
  // As duas consultas saem juntas (19/11/2026): em sequência eram duas idas ao
  // banco por mês da Agenda, e nenhuma depende da outra.
  const [r, sincronizacao] = await Promise.all([pool.query(
    `SELECT c.omie_codigo, c.numero, c.valor_mensal, c.dia_faturamento, c.vigencia_fim,
            n.numero_nfse, n.emitida_em, n.status
       FROM omie_contratos c
       LEFT JOIN LATERAL (
         SELECT numero_nfse, emitida_em, status FROM omie_contrato_notas x
          WHERE x.omie_contrato = c.omie_codigo AND x.competencia = $1 AND COALESCE(x.status, '') <> 'C'
          ORDER BY emitida_em LIMIT 1
       ) n ON TRUE
      WHERE c.situacao = '10'
      ORDER BY (n.numero_nfse IS NULL) DESC, c.numero`,
    [competencia]
  ), ultimaSincronizacao()]);
  const contratos = r.rows.map(x => ({
    numero: x.numero,
    valor_mensal: Number(x.valor_mensal || 0),
    dia_faturamento: x.dia_faturamento,
    vigencia_fim: x.vigencia_fim,
    nfse: x.numero_nfse || null,
    emitida_em: x.emitida_em || null,
    vigencia_vencida: !!(x.vigencia_fim && new Date(x.vigencia_fim) < new Date(ano, mes - 1, 1)),
  }));
  const faturados = contratos.filter(c => c.nfse);
  const dia = Math.min(...contratos.map(c => c.dia_faturamento || 1), 28) || 1;
  return {
    competencia,
    dia_faturamento: Number.isFinite(dia) ? dia : 1,
    esperados: contratos.length,
    faturados: faturados.length,
    valor_faturado: faturados.reduce((s, c) => s + c.valor_mensal, 0),
    valor_esperado: contratos.reduce((s, c) => s + c.valor_mensal, 0),
    pendentes: contratos.filter(c => !c.nfse),
    fim_mes: fimMes.toISOString().slice(0, 10),
    sincronizacao,
  };
}

module.exports = { sincronizar, retratoDoMes, ultimaSincronizacao, competenciaDe };
