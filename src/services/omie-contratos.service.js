// src/services/omie-contratos.service.js
//
// Os contratos do Omie ligados ao prédio (integração com o Omie, fase 1 —
// docs/modulos/omie-integracao.md). Só lê a cópia do banco (`omie_contratos`,
// `omie_clientes`, `omie_contrato_notas`), refeita pelo job do faturamento;
// nada aqui chama a API do Omie nem grava lá.
//
// ⚠️ DE QUAL PRÉDIO É O CONTRATO, NESTA ORDEM:
//   1. o elo feito à mão (`omie_cliente_vinculos`) — vale sobre tudo;
//   2. o CNPJ do cliente do Omie igual ao `condominios.cnpj` (os dois só em
//      dígitos), quando bate com UM prédio só;
//   3. nada. CNPJ que bate com dois prédios, cliente sem CNPJ, CNPJ que não
//      bate com ninguém: vai para a fila "sem prédio", com o motivo. Nunca se
//      adivinha por nome — um contrato no prédio errado é cobrança no lugar
//      errado.

const { pool } = require("../db");

// Os rótulos de `cCodSit`. Só o "10" (ativo) foi confirmado; os outros vêm da
// contagem de 18/11/2026 (ver agenda.md) e ficam marcados como tal na tela.
const SITUACAO = {
  "10": { rotulo: "Ativo", ativo: true },
  "00": { rotulo: "Em elaboração", ativo: false },
  "90": { rotulo: "Suspenso", ativo: false },
  "99": { rotulo: "Encerrado", ativo: false },
};

async function listar() {
  const r = await pool.query(`
    SELECT oc.omie_codigo, oc.numero, oc.omie_cliente, oc.situacao, oc.valor_mensal,
           oc.dia_faturamento, oc.vigencia_inicio, oc.vigencia_fim, oc.atualizado_em,
           cl.documento, cl.razao_social, cl.nome_fantasia, cl.email AS cliente_email, cl.cidade AS cliente_cidade,
           (cl.omie_codigo IS NOT NULL) AS tem_cliente,
           v.condominio_id AS condo_manual, v.ligado_em,
           auto.condominio_id AS condo_cnpj, auto.n AS cnpj_n,
           nt.numero_nfse AS ultima_nota, nt.competencia AS ultima_competencia,
           nt.emitida_em AS ultima_emitida_em, nt.valor AS ultima_valor
      FROM omie_contratos oc
      LEFT JOIN omie_clientes cl ON cl.omie_codigo = oc.omie_cliente
      LEFT JOIN omie_cliente_vinculos v ON v.omie_cliente = oc.omie_cliente
      LEFT JOIN LATERAL (
        SELECT MIN(c.id) AS condominio_id, COUNT(*)::int AS n
          FROM condominios c
         WHERE cl.documento IS NOT NULL AND cl.documento <> ''
           AND regexp_replace(COALESCE(c.cnpj, ''), '[^0-9]', '', 'g') = cl.documento
      ) auto ON TRUE
      LEFT JOIN LATERAL (
        SELECT n.numero_nfse, n.competencia, n.emitida_em, n.valor
          FROM omie_contrato_notas n
         WHERE n.omie_contrato = oc.omie_codigo
         ORDER BY n.emitida_em DESC
         LIMIT 1
      ) nt ON TRUE
     ORDER BY oc.numero`);

  const ids = new Set();
  const linhas = r.rows.map(x => {
    let condominio_id = null, ligacao;
    if (x.condo_manual) { condominio_id = x.condo_manual; ligacao = "manual"; }
    else if (!x.tem_cliente) ligacao = "sem-cliente";
    else if (!x.documento) ligacao = "sem-cnpj";
    else if (x.cnpj_n === 1) { condominio_id = x.condo_cnpj; ligacao = "cnpj"; }
    else if (x.cnpj_n > 1) ligacao = "cnpj-repetido";
    else ligacao = "cnpj-sem-predio";
    if (condominio_id) ids.add(condominio_id);
    const sit = SITUACAO[x.situacao] || { rotulo: `Situação ${x.situacao || "?"}`, ativo: false };
    const vencida = sit.ativo && x.vigencia_fim && new Date(x.vigencia_fim) < new Date(new Date().toDateString());
    return {
      omie_codigo: Number(x.omie_codigo),
      numero: x.numero,
      situacao: x.situacao,
      situacao_rotulo: sit.rotulo,
      ativo: sit.ativo,
      valor_mensal: x.valor_mensal == null ? null : Number(x.valor_mensal),
      dia_faturamento: x.dia_faturamento,
      vigencia_inicio: x.vigencia_inicio,
      vigencia_fim: x.vigencia_fim,
      vigencia_vencida: Boolean(vencida),
      omie_cliente: x.omie_cliente == null ? null : Number(x.omie_cliente),
      cliente: x.tem_cliente ? {
        documento: x.documento, razao_social: x.razao_social, nome_fantasia: x.nome_fantasia,
        email: x.cliente_email, cidade: x.cliente_cidade,
      } : null,
      condominio_id,
      ligacao,
      ligado_em: x.ligado_em,
      ultima_nota: x.ultima_nota ? {
        numero: x.ultima_nota, competencia: x.ultima_competencia,
        emitida_em: x.ultima_emitida_em, valor: x.ultima_valor == null ? null : Number(x.ultima_valor),
      } : null,
      atualizado_em: x.atualizado_em,
    };
  });

  if (ids.size) {
    const c = await pool.query(
      `SELECT id, COALESCE(NULLIF(nome_fantasia, ''), nome) AS nome, ativo FROM condominios WHERE id = ANY($1::int[])`,
      [[...ids]]);
    const porId = new Map(c.rows.map(x => [x.id, x]));
    for (const l of linhas) {
      const c2 = l.condominio_id ? porId.get(l.condominio_id) : null;
      l.condominio_nome = c2 ? c2.nome : null;
      l.condominio_ativo = c2 ? c2.ativo : null;
    }
  }

  await _resolverPlanos(linhas);

  const s = await pool.query(`SELECT ultima_em, ultimo_erro, detalhe FROM omie_sincronizacoes WHERE nome = 'faturamento_contratos'`);
  return { contratos: linhas, sincronizacao: s.rows[0] || null };
}

/* ══════════════════════════════════════════════════════════════════════════
   QUAL PREVENTIVA O CONTRATO PAGA (migration 109, 27/11/2026)
   ──────────────────────────────────────────────────────────────────────────
   Nesta ordem:
     1. a escolha feita à mão (`plano_contratos_omie`): um plano, ou "não é de
        preventiva" (plano_id nulo);
     2. a preventiva ativa do prédio, quando o prédio tem exatamente UMA — é o
        caso de quase todos, e os setores (Bem Moema, Maison) caem juntos nela;
     3. nada, com o motivo: o prédio não tem preventiva ativa, ou tem mais de
        uma e ninguém disse qual.
   `plano_ligacao`: manual · predio · nenhum (não é de preventiva) ·
   escolher (2+ no prédio) · sem-plano · sem-predio.
   ══════════════════════════════════════════════════════════════════════════ */
async function _resolverPlanos(linhas) {
  const [ligs, planos] = await Promise.all([
    pool.query(`SELECT omie_contrato, plano_id, ligado_em FROM plano_contratos_omie`),
    pool.query(`SELECT id, condominio_id, titulo, ativo FROM planos_manutencao`),
  ]);
  const lig = new Map(ligs.rows.map(x => [Number(x.omie_contrato), x]));
  const porId = new Map(planos.rows.map(p => [p.id, p]));
  const ativosDo = new Map();
  for (const p of planos.rows) {
    if (!p.ativo) continue;
    if (!ativosDo.has(p.condominio_id)) ativosDo.set(p.condominio_id, []);
    ativosDo.get(p.condominio_id).push(p);
  }
  for (const l of linhas) {
    const m = lig.get(l.omie_codigo);
    let plano = null, ligacao;
    if (m) {
      plano = m.plano_id ? porId.get(m.plano_id) || null : null;
      ligacao = m.plano_id ? "manual" : "nenhum";
      l.plano_ligado_em = m.ligado_em;
    } else if (!l.condominio_id) ligacao = "sem-predio";
    else {
      const at = ativosDo.get(l.condominio_id) || [];
      if (at.length === 1) { plano = at[0]; ligacao = "predio"; }
      else ligacao = at.length ? "escolher" : "sem-plano";
    }
    l.plano_id = plano ? plano.id : null;
    l.plano_titulo = plano ? plano.titulo : null;
    l.plano_ativo = plano ? plano.ativo : null;
    l.plano_ligacao = ligacao;
    // As preventivas ativas do prédio, para a tela oferecer a escolha.
    l.planos_do_predio = (ativosDo.get(l.condominio_id) || []).map(p => ({ id: p.id, titulo: p.titulo }));
  }
}

// A escolha à mão. `planoId` nulo = "não é de preventiva". O plano tem de ser
// do prédio do contrato: ligar contrato a preventiva de outro prédio é a
// cobrança no lugar errado.
async function ligarPlano(omieContrato, planoId, usuarioId) {
  const { contratos } = await listar();
  const k = contratos.find(c => c.omie_codigo === Number(omieContrato));
  if (!k) return { erro: "Contrato do Omie não encontrado", status: 404 };
  if (planoId != null) {
    const p = await pool.query(`SELECT condominio_id FROM planos_manutencao WHERE id = $1`, [planoId]);
    if (!p.rows.length) return { erro: "Preventiva não encontrada", status: 404 };
    if (!k.condominio_id) return { erro: "Ligue o contrato a um prédio antes de escolher a preventiva", status: 409 };
    if (p.rows[0].condominio_id !== k.condominio_id) return { erro: "A preventiva é de outro prédio", status: 409 };
  }
  await pool.query(
    `INSERT INTO plano_contratos_omie (omie_contrato, plano_id, ligado_por, ligado_em)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (omie_contrato) DO UPDATE SET plano_id = EXCLUDED.plano_id,
       ligado_por = EXCLUDED.ligado_por, ligado_em = NOW()`,
    [Number(omieContrato), planoId, usuarioId || null]);
  return { ok: true };
}

async function desligarPlano(omieContrato) {
  const r = await pool.query(`DELETE FROM plano_contratos_omie WHERE omie_contrato = $1`, [Number(omieContrato)]);
  return { ok: true, removido: r.rowCount > 0 };
}

// O elo à mão: vale para TODOS os contratos desse cliente do Omie.
async function ligar(omieCliente, condominioId, usuarioId) {
  const c = await pool.query(`SELECT id FROM condominios WHERE id = $1`, [condominioId]);
  if (!c.rows.length) return { erro: "Condomínio não encontrado", status: 404 };
  const k = await pool.query(`SELECT 1 FROM omie_contratos WHERE omie_cliente = $1 LIMIT 1`, [omieCliente]);
  if (!k.rows.length) return { erro: "Nenhum contrato do Omie com esse cliente", status: 404 };
  await pool.query(
    `INSERT INTO omie_cliente_vinculos (omie_cliente, condominio_id, ligado_por, ligado_em)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (omie_cliente) DO UPDATE SET condominio_id = EXCLUDED.condominio_id,
       ligado_por = EXCLUDED.ligado_por, ligado_em = NOW()`,
    [omieCliente, condominioId, usuarioId || null]);
  return { ok: true };
}

async function desligar(omieCliente) {
  const r = await pool.query(`DELETE FROM omie_cliente_vinculos WHERE omie_cliente = $1`, [omieCliente]);
  return { ok: true, removido: r.rowCount > 0 };
}

module.exports = { listar, ligar, desligar, ligarPlano, desligarPlano, SITUACAO };
