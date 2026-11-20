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

// ── Faturamento de contrato (fase 2 da integração) ──────────────────────────

// ⚠️ MORA EM /servicos/contratofat/, não em /servicos/contrato/ (a mesma
// armadilha do FaturarOS). Lido na doc em 20/11/2026.
//
// Os contratos que o Omie considera PENDENTES no mês: ativos, na vigência,
// com o dia de faturamento já alcançado e AINDA NÃO FATURADOS neste mês
// (`cEtapa "20"`). É a última trava contra nota em dobro: quem não está aqui
// não vai. Só leitura.
async function contratosPendentesDeFaturar() {
  const j = await chamar("servicos/contratofat/", "ObterContratos", { cEtapa: "20" });
  return (j.listaContratos || []).map(c => Number(c.nCodCtr)).filter(Boolean);
}

// ⚠️ GRAVA NO OMIE: gera a OS do mês, que vira NFS-e, conta a receber e
// boleto (pela regra de vencimento e pela conta do contrato). Só recebe o
// código; não há data, competência nem vencimento para passar. Devolve
// `{ nCodOS, cCodStatus, cDescStatus }`; status diferente de "0" é recusa.
async function faturarContrato(nCodCtr) {
  return chamar("servicos/contratofat/", "FaturarContrato", { nCodCtr });
}

// ── Boleto do título (financas/contareceberboleto/, lido na doc 20/11/2026) ──
// `nCodTitulo` = codigo_lancamento_omie do ListarContasReceber. A resposta
// traz cNumBoleto, cNumBancario (o nosso número), dDtEmBol, cCodBarras e
// cLinkBoleto (o PDF, que VALE 24 H: não se guarda o link). O status é
// `cDesStatus` (sem "c"), diferente do contrato; "0" é sucesso.

// Só leitura: o boleto que o título já tem, ou null.
async function obterBoleto(nCodTitulo) {
  try {
    const j = await chamar("financas/contareceberboleto/", "ObterBoleto", { nCodTitulo });
    if (j && j.cCodStatus != null && String(j.cCodStatus) !== "0") return null;
    return j && (j.cNumBancario || j.cNumBoleto) ? j : null;
  } catch (e) {
    if (e.naoEncontrado) return null;
    throw e;
  }
}

// ⚠️ GRAVA NO OMIE: registra o boleto do título no banco da conta.
async function gerarBoleto(nCodTitulo) {
  const j = await chamar("financas/contareceberboleto/", "GerarBoleto", { nCodTitulo });
  if (j && j.cCodStatus != null && String(j.cCodStatus) !== "0") {
    throw new OmieErro(String(j.cDesStatus || `GerarBoleto recusou (status ${j.cCodStatus}).`).trim(), { call: "GerarBoleto" });
  }
  return j;
}

// Títulos a receber incluídos num intervalo (ListarContasReceber, 100 por
// página). `de`/`ate` em "dd/mm/aaaa".
async function listarContasReceber({ de, ate }) {
  const todos = [];
  for (let p = 1; p <= 30; p++) {
    let j;
    try {
      j = await chamar("financas/contareceber/", "ListarContasReceber", {
        pagina: p, registros_por_pagina: 100, apenas_importado_api: "N",
        filtrar_por_emissao_de: de, filtrar_por_emissao_ate: ate,
      });
    } catch (e) {
      if (e.naoEncontrado) break;
      throw e;
    }
    todos.push(...(j.conta_receber_cadastro || []));
    if (p >= (j.total_de_paginas || 1)) break;
  }
  return todos;
}

// ── Produtos (catálogo para a DANFE) ────────────────────────────────────────

// O Omie corta em 100 por página mesmo pedindo mais: ~1.300 itens
// (18/11/2026) = 14 chamadas de ~1 s. A descrição vem com entidade HTML
// (`&quot;`, `&apos;`) — quem consome decodifica.
async function listarProdutos(pagina) {
  return chamar("geral/produtos/", "ListarProdutos", {
    pagina, registros_por_pagina: 100, apenas_importado_api: "N", filtrar_apenas_omiepdv: "N",
  });
}

// ── Pedido de venda (vira NF-e / DANFE) ─────────────────────────────────────

// Só os faturados (etapa 60), 50 por página: cada página leva ~3,5 s (vem
// com os itens), e 100 por página encosta no timeout. Medido em 18/11/2026:
// 773 pedidos, 16 páginas. ⚠️ O Omie aceita UMA requisição por método de cada
// vez ("Já existe uma requisição desse método sendo executada") e recusa a
// mesma chamada repetida em menos de 60 s ("Consumo redundante") — por isso
// a paginação é em série e a sincronização roda uma de cada vez.
async function listarPedidos(pagina) {
  return chamar("produtos/pedido/", "ListarPedidos", { pagina, registros_por_pagina: 50, apenas_importado_api: "N", etapa: "60" });
}

async function consultarPedidoPorIntegracao(codigo_pedido_integracao) {
  try {
    const j = await chamar("produtos/pedido/", "ConsultarPedido", { codigo_pedido_integracao });
    return j.pedido_venda_produto || null;
  } catch (e) {
    if (e.naoEncontrado) return null;
    throw e;
  }
}

async function incluirPedido(payload) {
  return chamar("produtos/pedido/", "IncluirPedido", payload);
}

// ⚠️ FATURAR MORA EM OUTRO ENDPOINT (de novo): /produtos/pedidovendafat/,
// com os nomes de campo curtos (`nCodPed`), e não os longos do /pedido/.
// Responde 200 com `cCodStatus`; diferente de "0" é recusa.
async function faturarPedido(nCodPed) {
  const j = await chamar("produtos/pedidovendafat/", "FaturarPedidoVenda", { nCodPed });
  if (j && j.cCodStatus != null && String(j.cCodStatus) !== "0") {
    throw new OmieErro(String(j.cDescStatus || `FaturarPedidoVenda recusou (status ${j.cCodStatus}).`).trim(), { call: "FaturarPedidoVenda" });
  }
  return j;
}

// A NF-e do pedido. Não existe até o faturamento gerar a nota — aí o Omie
// responde Client-107 "NF não cadastrada para o pedido", que é resposta, não
// falha. `nIdPedido` só existe no ConsultarNF; o ListarNF não filtra por
// pedido (lido em 18/11/2026 contra o pedido 879 → NF 794).
async function nfPorPedido(nIdPedido) {
  try {
    return await chamar("produtos/nfconsultar/", "ConsultarNF", { nIdPedido });
  } catch (e) {
    if (e.naoEncontrado) return null;
    throw e;
  }
}

// `cPdf` = link da DANFE; `cLinkPortal` = página pública da nota.
async function documentosNfe(nIdNfe) {
  return chamar("produtos/dfedocs/", "ObterNfe", { nIdNfe });
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
  contratosPendentesDeFaturar,
  faturarContrato,
  listarContasReceber,
  obterBoleto,
  gerarBoleto,
  listarProdutos,
  listarPedidos,
  consultarPedidoPorIntegracao,
  incluirPedido,
  faturarPedido,
  nfPorPedido,
  documentosNfe,
};
