// src/services/omie-emails.service.js
//
// Para quem o Omie manda a nota de cada cliente (migration 102,
// docs/modulos/cobranca-avisos.md).
//
// ⚠️ NÃO É O E-MAIL DO CADASTRO DO CLIENTE. Lido em 23/11/2026: das 300 O.S.
// mais recentes do Omie, todas têm destinatário no bloco Email
// (`cEnviarPara`), e em nenhum dos clientes conferidos ele era o `email` do
// cadastro (lá costuma estar um e-mail da própria General). A lista mora em
// cada O.S. (e em cada pedido, `utilizar_emails`), e em 40 de 59 clientes ela
// mudou de uma nota para outra. Por isso a regra é "os destinatários da nota
// mais recente do cliente", mostrados no modal para conferir.
//
// Guardado em `omie_cliente_emails` (12 h): o modal da nota pede a prévia a
// cada mudança, e o Omie recusa a mesma consulta repetida em < 60 s.
// Só leitura no Omie.

const { pool } = require("../db");
const omie = require("./omie.service");

const _iso = br => { const m = String(br || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const VALIDO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

// "a@x.com; b@y.com,  c@z" → ["a@x.com", "b@y.com"] (só os válidos, sem repetir).
function separar(txt) {
  const vistos = new Set();
  return String(txt || "").split(/[,;\s]+/).map(s => s.trim().toLowerCase())
    .filter(s => VALIDO.test(s) && !vistos.has(s) && vistos.add(s));
}

// Os inválidos de uma lista digitada (para a tela dizer qual está errado).
function invalidos(txt) {
  return String(txt || "").split(/[,;\s]+/).map(s => s.trim()).filter(s => s && !VALIDO.test(s));
}

// Lê no Omie: a O.S. mais recente do cliente com destinatário, senão o pedido
// mais recente, senão o e-mail do cadastro. Em série (um método por vez).
async function _lerNoOmie(nCodCli) {
  try {
    const j = await omie.chamar("servicos/os/", "ListarOS", {
      pagina: 1, registros_por_pagina: 10, apenas_importado_api: "N",
      filtrar_por_cliente: Number(nCodCli), ordem_decrescente: "S",
    });
    // Cancelada não conta: em 2023 havia O.S. cancelada com o síndico e a que
    // valeu com outro destinatário.
    const os = (j.osCadastro || []).find(o => (o.InfoCadastro || {}).cCancelada !== "S" && separar(o.Email && o.Email.cEnviarPara).length);
    if (os) return {
      emails: separar(os.Email.cEnviarPara), fonte: "os", referencia: os.Cabecalho && os.Cabecalho.nCodOS,
      numero: os.Cabecalho && os.Cabecalho.cNumOS ? String(os.Cabecalho.cNumOS) : null,
      data: _iso((os.InfoCadastro || {}).dDtFat || (os.Cabecalho || {}).dDtPrevisao || (os.InfoCadastro || {}).dDtInc),
    };
  } catch (e) {
    if (!e.naoEncontrado) throw e;
  }
  try {
    const j = await omie.chamar("produtos/pedido/", "ListarPedidos", {
      pagina: 1, registros_por_pagina: 10, apenas_importado_api: "N", filtrar_por_cliente: Number(nCodCli),
    });
    const peds = (j.pedido_venda_produto || []).slice().sort((a, b) => Number(b.cabecalho?.codigo_pedido || 0) - Number(a.cabecalho?.codigo_pedido || 0));
    const p = peds.find(x => (x.infoCadastro || {}).cancelado !== "S" && separar(x.informacoes_adicionais && x.informacoes_adicionais.utilizar_emails).length);
    if (p) return {
      emails: separar(p.informacoes_adicionais.utilizar_emails), fonte: "pedido", referencia: p.cabecalho && p.cabecalho.codigo_pedido,
      numero: p.cabecalho && p.cabecalho.numero_pedido ? String(p.cabecalho.numero_pedido) : null,
      data: _iso((p.infoCadastro || {}).dFat || (p.cabecalho || {}).data_previsao || (p.infoCadastro || {}).dInc),
    };
  } catch (e) {
    if (!e.naoEncontrado) throw e;
  }
  try {
    const c = await omie.chamar("geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: Number(nCodCli) });
    const l = separar(c && c.email);
    if (l.length) return { emails: l, fonte: "cadastro", referencia: null };
  } catch (e) {
    if (!e.naoEncontrado) throw e;
  }
  return { emails: [], fonte: null, referencia: null };
}

// { emails: [...], fonte, lido_em, erro? }. `maxIdadeH` = idade máxima da
// cópia guardada. Falha do Omie com cópia guardada devolve a cópia.
async function doCliente(nCodCli, { maxIdadeH = 12, leitor = _lerNoOmie } = {}) {
  if (!nCodCli) return { emails: [], fonte: null, lido_em: null };
  const g = (await pool.query(
    `SELECT emails, fonte, lido_em, referencia_numero, to_char(referencia_data, 'YYYY-MM-DD') AS referencia_data
       FROM omie_cliente_emails WHERE omie_cliente = $1`, [nCodCli])).rows[0];
  const daCopia = () => ({ emails: separar(g.emails), fonte: g.fonte, lido_em: g.lido_em, numero: g.referencia_numero, data: g.referencia_data });
  if (g && Date.now() - new Date(g.lido_em).getTime() < maxIdadeH * 3600e3) return daCopia();
  try {
    const r = await leitor(nCodCli);
    await pool.query(
      `INSERT INTO omie_cliente_emails (omie_cliente, emails, fonte, referencia, referencia_numero, referencia_data, lido_em)
       VALUES ($1, $2, $3, $4, $5, $6::date, NOW())
       ON CONFLICT (omie_cliente) DO UPDATE SET emails = EXCLUDED.emails, fonte = EXCLUDED.fonte,
         referencia = EXCLUDED.referencia, referencia_numero = EXCLUDED.referencia_numero,
         referencia_data = EXCLUDED.referencia_data, lido_em = NOW()`,
      [nCodCli, r.emails.length ? r.emails.join(", ") : null, r.fonte, r.referencia || null, r.numero || null, r.data || null]);
    return { emails: r.emails, fonte: r.fonte, lido_em: new Date().toISOString(), numero: r.numero || null, data: r.data || null };
  } catch (e) {
    if (g) return { ...daCopia(), erro: e.message };
    return { emails: [], fonte: null, lido_em: null, erro: e.message };
  }
}

module.exports = { doCliente, separar, invalidos, _lerNoOmie };
