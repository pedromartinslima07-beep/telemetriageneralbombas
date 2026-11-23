// src/services/omie-faturamento.service.js
//
// Acompanhamento do faturamento dos contratos de serviço do Omie, para a
// agenda (migration 092). SÓ LEITURA: nenhuma chamada daqui inclui, altera ou
// fatura nada no Omie.
//
// ⚠️ ESTE SERVIÇO SÓ COPIA. Até novembro/2026 o faturamento dos contratos
// era feito à mão na tela do Omie, em lote (71 em 03/11/2026). Desde a fase 2
// (migration 097) o lote pode sair pelo sistema, com a confirmação do Pedro:
// isso mora em omie-lote.service.js. Aqui se copiam os contratos e as NFS-e
// que cada um gerou, para a agenda dizer "78 de 81 faturados".
//
// ⚠️ "CONSUMO REDUNDANTE": o Omie recusa a mesma consulta repetida em menos
// de ~1 min (`REDUNDANT`, "Aguarde N segundos"). Por isso a cópia vive no
// banco e é atualizada pelo job (src/jobs/omie-faturamento.job.js) ou pelo
// botão "Atualizar agora", que respeita um intervalo mínimo.

const { pool } = require("../db");
const omie = require("./omie.service");
const { telefoneOmie } = require("./omie-receber.service");

const NOME = "faturamento_contratos";
const INTERVALO_MINIMO_MS = 2 * 60 * 1000;

// "dd/mm/aaaa" → "aaaa-mm-dd" (ou null)
// ⚠️ O OMIE DEVOLVE TEXTO COM ENTIDADE HTML (20/11/2026). O nome do cliente
// vem "AIR CLUB &amp; RESIDENCES", e a tela, que escapa o que mostra, exibia
// "&amp;amp;". Desfaz as entidades na cópia; o escape fica só na tela.
function _texto(s) {
  if (s == null || s === "") return null;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e]);
}

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
      // ⚠️ UMA GRAVAÇÃO POR TABELA (unnest), não uma por linha (20/11/2026):
      // com os clientes da 096 eram ~800 idas ao banco dentro da transação, e
      // contra o banco de teste remoto a cópia passava de 4 minutos. Cada lista
      // sai sem chave repetida, senão o ON CONFLICT recusa o lote inteiro.
      const unicos = (lista, chave) => [...new Map(lista.map(x => [String(chave(x)), x])).values()];
      const ks = unicos(contratos.map(c => ({ k: c.cabecalho || {}, cc: c.infAdic?.nCodCC || null })).filter(x => x.k.nCodCtr), x => x.k.nCodCtr);
      if (ks.length) await client.query(
        `INSERT INTO omie_contratos (omie_codigo, numero, omie_cliente, situacao, valor_mensal, dia_faturamento, vigencia_inicio, vigencia_fim, conta_corrente, atualizado_em)
         SELECT *, NOW() FROM unnest($1::bigint[], $2::text[], $3::bigint[], $4::text[], $5::numeric[], $6::int[], $7::date[], $8::date[], $9::bigint[])
         ON CONFLICT (omie_codigo) DO UPDATE SET numero = EXCLUDED.numero, omie_cliente = EXCLUDED.omie_cliente,
           situacao = EXCLUDED.situacao, valor_mensal = EXCLUDED.valor_mensal, dia_faturamento = EXCLUDED.dia_faturamento,
           vigencia_inicio = EXCLUDED.vigencia_inicio, vigencia_fim = EXCLUDED.vigencia_fim,
           conta_corrente = EXCLUDED.conta_corrente, atualizado_em = NOW()`,
        [ks.map(x => x.k.nCodCtr), ks.map(x => x.k.cNumCtr || null), ks.map(x => x.k.nCodCli || null), ks.map(x => x.k.cCodSit || null),
         ks.map(x => Number(x.k.nValTotMes || 0)), ks.map(x => x.k.nDiaFat || null), ks.map(x => _data(x.k.dVigInicial)),
         ks.map(x => _data(x.k.dVigFinal)), ks.map(x => x.cc)]
      );
      const ns = unicos(notas.map(n => ({ n, ctr: n.OrdemServico?.nCodigoContrato, emitida: _data(n.Emissao?.cDataEmissao) }))
        .filter(x => x.ctr && x.emitida && x.n.Cabecalho?.nCodNF), x => x.n.Cabecalho.nCodNF); // sem contrato = nota avulsa
      nNotas = ns.length;
      if (ns.length) await client.query(
        `INSERT INTO omie_contrato_notas (omie_nfse, omie_contrato, numero_nfse, competencia, emitida_em, valor, status, omie_os, atualizado_em)
         SELECT *, NOW() FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::date[], $6::numeric[], $7::text[], $8::bigint[])
         ON CONFLICT (omie_nfse) DO UPDATE SET status = EXCLUDED.status, valor = EXCLUDED.valor,
           omie_os = COALESCE(EXCLUDED.omie_os, omie_contrato_notas.omie_os), atualizado_em = NOW()`,
        [ns.map(x => x.n.Cabecalho.nCodNF), ns.map(x => x.ctr), ns.map(x => String(x.n.Cabecalho?.nNumeroNFSe || "")),
         ns.map(x => x.emitida.slice(0, 7)), ns.map(x => x.emitida),
         ns.map(x => Number(x.n.Cabecalho?.nValorNFSe || x.n.OrdemServico?.nValorOS || 0)),
         ns.map(x => x.n.Cabecalho?.cStatusNFSe || null), ns.map(x => x.n.OrdemServico?.nCodigoOS || null)]
      );
      const cs = unicos((clientes || []).filter(c => c.codigo_cliente_omie), c => c.codigo_cliente_omie);
      if (cs.length) await client.query(
        // Telefone e contato (migration 099): é com eles que a cobrança liga.
        `INSERT INTO omie_clientes (omie_codigo, documento, razao_social, nome_fantasia, email, cidade, inativo,
                                    telefone, telefone2, contato, atualizado_em)
         SELECT *, NOW() FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[],
                                     $8::text[], $9::text[], $10::text[])
         ON CONFLICT (omie_codigo) DO UPDATE SET documento = EXCLUDED.documento, razao_social = EXCLUDED.razao_social,
           nome_fantasia = EXCLUDED.nome_fantasia, email = EXCLUDED.email, cidade = EXCLUDED.cidade,
           inativo = EXCLUDED.inativo, telefone = EXCLUDED.telefone, telefone2 = EXCLUDED.telefone2,
           contato = EXCLUDED.contato, atualizado_em = NOW()`,
        [cs.map(c => c.codigo_cliente_omie), cs.map(c => String(c.cnpj_cpf || "").replace(/\D/g, "").slice(0, 14) || null),
         cs.map(c => _texto(c.razao_social)), cs.map(c => _texto(c.nome_fantasia)), cs.map(c => c.email || null),
         cs.map(c => _texto(c.cidade)), cs.map(c => c.inativo === "S"),
         cs.map(c => telefoneOmie(c.telefone1_ddd, c.telefone1_numero)), cs.map(c => telefoneOmie(c.telefone2_ddd, c.telefone2_numero)),
         cs.map(c => _texto(c.contato) || null)]
      );
      const detalhe = { contratos: contratos.length, notas_de_contrato: nNotas, notas_lidas: notas.length,
                        clientes: clientes ? clientes.length : null, erro_clientes: erroClientes };
      await client.query(
        `INSERT INTO omie_sincronizacoes (nome, ultima_em, ultimo_erro, detalhe) VALUES ($1, NOW(), NULL, $2)
         ON CONFLICT (nome) DO UPDATE SET ultima_em = NOW(), ultimo_erro = NULL, detalhe = EXCLUDED.detalhe`,
        [NOME, detalhe]
      );
      await client.query("COMMIT");
      // O lote do faturamento (fase 2): a nota e o boleto de cada contrato que
      // o sistema faturou voltam ao item. Falha aqui não desfaz a cópia.
      try { detalhe.lote = await require("./omie-lote.service").conciliar(); }
      catch (e) { detalhe.erro_lote = String(e.message).slice(0, 300); }
      // A cobrança (fase 3): os títulos em atraso do que o sistema emitiu.
      // Depois da conciliação, que é quem liga o título do lote ao contrato.
      // Falha aqui também não desfaz a cópia (o erro fica na linha
      // `receber_atrasados` de omie_sincronizacoes).
      try { detalhe.cobranca = await require("./omie-receber.service").sincronizar(); }
      catch (e) { detalhe.erro_cobranca = String(e.message).slice(0, 300); }
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
