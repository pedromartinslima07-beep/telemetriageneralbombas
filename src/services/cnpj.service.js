// src/services/cnpj.service.js
//
// **De quem é este CNPJ?** — consulta pública, com fontes de reserva.
//
// ⚠️ POR QUE PASSA PELO BACKEND (01/10/2026). Até aqui o admin chamava a
// BrasilAPI direto do navegador. Do servidor ela respondia 200 em 0,1 s, mas no
// navegador da operação o botão "Buscar" dava "Erro ao consultar CNPJ. Verifique
// a conexão." — o `catch` que pega tanto falha de rede quanto resposta que não é
// JSON (anti-bot / limite de requisições da BrasilAPI devolvem HTML). Uma fonte
// só, chamada do browser, é um ponto único de falha que o usuário não tem como
// contornar.
//
// Ordem das fontes: BrasilAPI → OpenCNPJ → CNPJ.ws (pública, 3 req/min).
// Todas devolvem dado da Receita; a resposta sai **no formato da BrasilAPI**
// (os nomes de campo que o front já lia), mais `fonte` dizendo quem respondeu.
//
// Regras de fallback:
//   - CNPJ inválido (400 da BrasilAPI) → para na hora, não adianta perguntar a
//     outra fonte;
//   - 404 → tenta as outras (base de uma pode estar atrás da de outra);
//   - rede / timeout / 5xx / 429 / corpo não-JSON → tenta a próxima.

const TIMEOUT_MS = 8000;

class CnpjErro extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function _getJson(url) {
  let r;
  try {
    r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "telemetria-general-bombas/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, status: 0, data: null, motivo: e.name === "TimeoutError" ? "timeout" : "rede" };
  }
  const texto = await r.text();
  let data = null;
  try { data = JSON.parse(texto); } catch { /* HTML de anti-bot / rate limit */ }
  return { ok: r.ok && data !== null, status: r.status, data, motivo: data === null ? "nao-json" : null };
}

const _soDigitos = (v) => String(v || "").replace(/\D/g, "");

function _deOpenCnpj(d) {
  const fone = (d.telefones || []).find((t) => !t.is_fax) || (d.telefones || [])[0];
  return {
    razao_social: d.razao_social || "",
    nome_fantasia: d.nome_fantasia || "",
    logradouro: d.logradouro || "",
    numero: d.numero || "",
    complemento: d.complemento || "",
    bairro: d.bairro || "",
    municipio: d.municipio || "",
    uf: d.uf || "",
    cep: _soDigitos(d.cep),
    ddd_telefone_1: fone ? `${fone.ddd || ""}${fone.numero || ""}` : "",
    descricao_situacao_cadastral: String(d.situacao_cadastral || "").toUpperCase(),
  };
}

function _deCnpjWs(d) {
  const e = d.estabelecimento || {};
  return {
    razao_social: d.razao_social || "",
    nome_fantasia: e.nome_fantasia || "",
    logradouro: e.logradouro || "",
    numero: e.numero || "",
    complemento: (e.complemento || "").replace(/\s+/g, " ").trim(),
    bairro: e.bairro || "",
    municipio: e.cidade?.nome || "",
    uf: e.estado?.sigla || "",
    cep: _soDigitos(e.cep),
    ddd_telefone_1: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : "",
    descricao_situacao_cadastral: String(e.situacao_cadastral || "").toUpperCase(),
  };
}

function _deBrasilApi(d) {
  return {
    razao_social: d.razao_social || "",
    nome_fantasia: d.nome_fantasia || "",
    logradouro: d.logradouro || "",
    numero: d.numero || "",
    complemento: d.complemento || "",
    bairro: d.bairro || "",
    municipio: d.municipio || "",
    uf: d.uf || "",
    cep: _soDigitos(d.cep),
    ddd_telefone_1: _soDigitos(d.ddd_telefone_1),
    descricao_situacao_cadastral: d.descricao_situacao_cadastral || "",
  };
}

const FONTES = [
  { nome: "BrasilAPI", url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`, map: _deBrasilApi },
  { nome: "OpenCNPJ",  url: (c) => `https://api.opencnpj.org/${c}`,             map: _deOpenCnpj },
  { nome: "CNPJ.ws",   url: (c) => `https://publica.cnpj.ws/cnpj/${c}`,         map: _deCnpjWs },
];

/**
 * Consulta o CNPJ nas fontes públicas, na ordem de FONTES.
 * @returns {Promise<object>} dados no formato da BrasilAPI + `fonte`
 * @throws {CnpjErro} com `status` 400 (inválido), 404 (não encontrado) ou 502
 */
async function consultarCnpj(cnpjBruto) {
  const cnpj = _soDigitos(cnpjBruto);
  if (cnpj.length !== 14) throw new CnpjErro(400, "CNPJ deve ter 14 dígitos.");

  let viuNaoEncontrado = false;
  const falhas = [];
  for (const fonte of FONTES) {
    const r = await _getJson(fonte.url(cnpj));
    if (r.ok) return { ...fonte.map(r.data), fonte: fonte.nome };
    if (fonte.nome === "BrasilAPI" && r.status === 400 && r.data) {
      throw new CnpjErro(400, r.data.message || "CNPJ inválido.");
    }
    if (r.status === 404) viuNaoEncontrado = true;
    falhas.push(`${fonte.nome}: ${r.status || r.motivo}${r.motivo && r.status ? "/" + r.motivo : ""}`);
  }

  console.warn(`[cnpj] ${cnpj} sem resposta útil — ${falhas.join(" · ")}`);
  if (viuNaoEncontrado) throw new CnpjErro(404, "CNPJ não encontrado na base da Receita.");
  throw new CnpjErro(502, "Os serviços de consulta de CNPJ não responderam. Tente de novo em alguns minutos.");
}

module.exports = { consultarCnpj, CnpjErro };
