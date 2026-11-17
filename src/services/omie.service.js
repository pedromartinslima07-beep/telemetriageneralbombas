// src/services/omie.service.js
//
// Cliente da API do Omie — o ERP onde a General já emite as notas à mão.
// Só transporte e os poucos métodos que a emissão usa; a regra de negócio
// (quais linhas, rateio, molde da OS) mora em nota-fiscal.service.js.
//
// ⚠️ A API É ADDON PAGO (contratado em 17/11/2026, R$ 49,90/mês). Sem ele
// toda chamada — inclusive leitura — volta "Para consumir a API Omie é
// necessário ativar um addon na Omie Store". Se isso aparecer em produção,
// o addon foi pausado (atraso de pagamento pausa o serviço).
//
// ⚠️ ERRO DO OMIE VEM COM HTTP 500 E JSON. O corpo é
// `{ faultstring, faultcode }` — inclusive para "não encontrado"
// (`SOAP-ENV:Client-103`, "OS não cadastrada para o Código de Integração").
// Por isso o `ok` do fetch não diz nada: quem decide é o `faultstring`.
//
// Credenciais: OMIE_APP_KEY / OMIE_APP_SECRET (Railway + .env local). Ficam
// no developer.omie.com.br → Aplicativos, não nas Configurações do ERP.

const BASE = "https://app.omie.com.br/api/v1/";
const TIMEOUT_MS = 30000;

class OmieErro extends Error {
  constructor(message, { call, faultcode, status } = {}) {
    super(message);
    this.call = call;
    this.faultcode = faultcode || null;
    this.status = status || 502;
    // Client-103 = registro não encontrado. Quem consulta "existe?" trata
    // isso como resposta, não como falha.
    this.naoEncontrado = /Client-103/.test(faultcode || "") || /n[ãa]o cadastrad|n[ãa]o encontrad|n[ãa]o existem registros/i.test(message);
  }
}

function credenciais() {
  const app_key = (process.env.OMIE_APP_KEY || "").trim();
  const app_secret = (process.env.OMIE_APP_SECRET || "").trim();
  if (!app_key || !app_secret) {
    throw new OmieErro("Integração com o Omie não configurada (OMIE_APP_KEY/OMIE_APP_SECRET).", { status: 503 });
  }
  return { app_key, app_secret };
}

async function chamar(rota, call, param) {
  const { app_key, app_secret } = credenciais();
  let r;
  try {
    r = await fetch(BASE + rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key, app_secret, param: [param] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new OmieErro(
      e.name === "TimeoutError" ? `Omie não respondeu em ${TIMEOUT_MS / 1000}s (${call}).` : `Falha de rede ao chamar o Omie (${call}).`,
      { call, status: 504 }
    );
  }
  let j;
  try {
    j = await r.json();
  } catch (_) {
    throw new OmieErro(`Omie respondeu algo que não é JSON (${call}, HTTP ${r.status}).`, { call });
  }
  if (j && j.faultstring) {
    throw new OmieErro(String(j.faultstring).trim(), { call, faultcode: j.faultcode });
  }
  return j;
}

// ── Clientes ────────────────────────────────────────────────────────────────

// O filtro aceita o documento formatado ou só dígitos (testado 17/11/2026).
async function acharClientePorDocumento(documento) {
  const doc = String(documento || "").replace(/\D/g, "");
  if (!doc) return null;
  try {
    const j = await chamar("geral/clientes/", "ListarClientes", {
      pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N",
      clientesFiltro: { cnpj_cpf: doc },
    });
    const achado = (j.clientes_cadastro || []).find(c => String(c.cnpj_cpf || "").replace(/\D/g, "") === doc);
    return achado || null;
  } catch (e) {
    if (e.naoEncontrado) return null;
    throw e;
  }
}

async function upsertCliente(dados) {
  return chamar("geral/clientes/", "UpsertCliente", dados);
}

// ── Ordem de serviço (vira NFS-e) ───────────────────────────────────────────

async function consultarOsPorIntegracao(cCodIntOS) {
  try {
    return await chamar("servicos/os/", "ConsultarOS", { cCodIntOS });
  } catch (e) {
    if (e.naoEncontrado) return null;
    throw e;
  }
}

async function incluirOs(payload) {
  return chamar("servicos/os/", "IncluirOS", payload);
}

// ⚠️ FATURAR MORA EM OUTRO ENDPOINT: /servicos/osp/, não /servicos/os/.
// Procurar `FaturarOS` só na página da OS faz parecer que ele não existe.
async function faturarOs(nCodOS) {
  return chamar("servicos/osp/", "FaturarOS", { nCodOS });
}

// Devolve, entre outras coisas, `ListaRpsNfse` com `cUrlNfse`.
async function statusOs(nCodOS) {
  return chamar("servicos/os/", "StatusOS", { nCodOS });
}

// Número e situação da NFS-e gerada pela OS (`cStatusNFSe`: F/C/N).
async function nfsePorOs(nCodigoOS) {
  try {
    const j = await chamar("servicos/nfse/", "ListarNFSEs", { nPagina: 1, nRegPorPagina: 5, nCodigoOS });
    return (j.nfseEncontradas || [])[0] || null;
  } catch (e) {
    if (e.naoEncontrado) return null;
    throw e;
  }
}

module.exports = {
  OmieErro,
  chamar,
  acharClientePorDocumento,
  upsertCliente,
  consultarOsPorIntegracao,
  incluirOs,
  faturarOs,
  statusOs,
  nfsePorOs,
};
