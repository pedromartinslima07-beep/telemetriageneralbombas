// src/services/nota-fiscal.service.js
//
// Emissão da nota do orçamento aprovado, pelo Omie.
//
// REGRA (Pedro, 17/11/2026): UMA nota por orçamento.
//   • só serviço    → NFS-e: OS no Omie + FaturarOS            (implementado)
//   • qualquer peça → só DANFE, serviço embutido nas peças      (etapa 3 — ainda não)
//
// O MOLDE DA OS NÃO FOI INVENTADO: é cópia das OS que a General fatura à mão
// (levantadas pela API em 17/11/2026). A linha de serviço NÃO aponta para o
// cadastro de serviços do Omie (`nCodServico: 0` em 7 de 10 OS recentes) — vai
// com os códigos direto. Seguir o cadastro (há três serviços com 140101 lá)
// mudaria o que sai na nota em relação ao que já sai hoje.
//
// O Omie calcula CBS/IBS sozinho na OS (0,9% / 0,1% em 2026); aqui não se
// calcula imposto nenhum.

const { pool } = require("../db");
const omie = require("./omie.service");

// ── Molde (copiado das OS reais) ────────────────────────────────────────────
const MOLDE_NFSE = Object.freeze({
  cCodServMun: "140101",       // LC 116 item 14.01 — conserto/manutenção de máquinas e equipamentos
  cCodServLC116: "14.01",
  cTribServ: "01",
  cNbs: "120029000",
  cRetemISS: "N",
  cCodCateg: "1.01.02",
  nCodCC: 6109178168,          // conta corrente usada nas OS faturadas
  cCodParc: "000",             // à vista, 1 parcela
});

// ── Kill-switch ─────────────────────────────────────────────────────────────
// ⚠️ O Omie NÃO TEM AMBIENTE DE TESTE. Com as chaves no .env, um servidor
// local apontando para o banco de teste emitiria nota REAL na prefeitura para
// um orçamento de mentira. Por isso emitir exige OMIE_EMISSAO=1 explícito;
// preparar, conferir e atualizar continuam funcionando sem ele.
function emissaoLigada() {
  return String(process.env.OMIE_EMISSAO || "").trim() === "1";
}

class NotaErro extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// ── Classificação peça × serviço ────────────────────────────────────────────
// Só SUGESTÃO para o modal; o que vale é o que quem emite confirma e fica
// gravado em `orcamento_linhas.natureza` (migration 090).
const _RX_SERVICO = /\b(conserto|m[ãa]o\s+de\s+obra|manuten[çc][ãa]o|instala[çc][ãa]o|servi[çc]o|limpeza|higieniza|dedetiza|restaura|reparo|recupera|rebobina|visita|diagn[óo]stic|desentup|substitui[çc][ãa]o|troca\s+d[eao]|retirada|montagem|desmontagem|regulagem|ajuste|teste)/i;

function sugerirNatureza(linha) {
  if (linha.tipo_servico) return "servico";
  return _RX_SERVICO.test(String(linha.descricao || "")) ? "servico" : "peca";
}

// ── Valores ─────────────────────────────────────────────────────────────────
const _cent = (v) => Math.round(Number(v) * 100);

// Linhas que entram na nota: com preço e quantidade. Linha sem preço
// (valor_unitario NULL, migration 062) não é cobrada no orçamento e não pode
// ir para a nota com R$ 0,00.
function linhasCobraveis(linhas) {
  return linhas.filter(l => l.valor_unitario != null && Number(l.valor_unitario) > 0 && Number(l.quantidade) > 0);
}

// Distribui `totalCent` entre as linhas na proporção do valor de cada uma.
// O centavo que sobra do arredondamento vai para a ÚLTIMA linha, e a soma
// fecha exata. Serve aos dois casos: o valor manual do orçamento (`o.valor`,
// que sobrepõe a soma dos itens no PDF) e, na etapa 3, embutir o serviço
// nas peças.
//
// ⚠️ QUANTIDADE > 1: nota tem `qtd × unitário`, e um total rateado nem sempre
// divide pela quantidade em centavos. Quando não divide, a linha vai com
// quantidade 1 e a quantidade escrita na descrição — o valor da linha é o
// que importa e ele fecha exato; um unitário de 3 casas viraria centavo
// fantasma na soma da nota.
function ratear(itens, totalCent) {
  const base = itens.map(i => _cent(i.valor_unitario) * Number(i.quantidade));
  const soma = base.reduce((a, b) => a + b, 0);
  if (soma <= 0) throw new NotaErro(422, "Nenhuma linha com valor para a nota.");
  const linhaCent = base.map(b => Math.floor((b * totalCent) / soma));
  const resto = totalCent - linhaCent.reduce((a, b) => a + b, 0);
  linhaCent[linhaCent.length - 1] += resto;
  return itens.map((i, k) => {
    const q = Number(i.quantidade);
    const tot = linhaCent[k];
    if (tot % q === 0) return { ...i, quantidade: q, unitCent: tot / q, totalCent: tot };
    return { ...i, descricao: `${q} un. — ${i.descricao}`, quantidade: 1, unitCent: tot, totalCent: tot };
  });
}

function totalDoOrcamentoCent(orc, cobraveis) {
  if (orc.valor != null) return _cent(orc.valor);
  return cobraveis.reduce((a, l) => a + _cent(l.valor_unitario) * Number(l.quantidade), 0);
}

// ── Carregar e conferir ─────────────────────────────────────────────────────
async function _carregar(orcId, db = pool) {
  const r = await db.query(
    `SELECT o.*, c.nome AS condo_nome, c.nome_fantasia AS condo_fantasia, c.cnpj AS condo_cnpj,
            c.endereco AS condo_endereco, c.bairro AS condo_bairro, c.cidade AS condo_cidade,
            c.uf AS condo_uf, c.cep AS condo_cep, c.email AS condo_email,
            c.omie_cliente_codigo, u.nome AS nota_emitida_por_nome
       FROM orcamentos o
       LEFT JOIN condominios c ON c.id = o.condominio_id
       LEFT JOIN usuarios u ON u.id = o.nota_emitida_por
      WHERE o.id = $1`,
    [orcId]
  );
  if (!r.rowCount) throw new NotaErro(404, "Orçamento não encontrado.");
  const l = await db.query(
    `SELECT id, descricao, quantidade, valor_unitario, tipo_servico, natureza
       FROM orcamento_linhas WHERE orcamento_id = $1 ORDER BY id`,
    [orcId]
  );
  return { orc: r.rows[0], linhas: l.rows };
}

function _resumoNota(orc) {
  return {
    nota_tipo: orc.nota_tipo, nota_status: orc.nota_status, nota_numero: orc.nota_numero,
    nota_url: orc.nota_url, nota_valor: orc.nota_valor, nota_erro: orc.nota_erro,
    nota_solicitada_em: orc.nota_solicitada_em, nota_emitida_em: orc.nota_emitida_em,
    nota_emitida_por_nome: orc.nota_emitida_por_nome || null, omie_os_codigo: orc.omie_os_codigo,
  };
}

// Tudo o que o modal precisa para mostrar a prévia, SEM falar com o Omie.
// `bloqueio` é a frase que explica por que não dá para emitir — o modal
// mostra e desabilita o botão; a rota de emitir repete a mesma checagem.
function _conferir(orc, linhas, naturezas) {
  const comNatureza = linhas.map(l => ({
    ...l,
    natureza: naturezas?.[l.id] || l.natureza || null,
    natureza_sugerida: sugerirNatureza(l),
  }));
  const cobraveis = linhasCobraveis(comNatureza);
  const totalCent = totalDoOrcamentoCent(orc, cobraveis);

  let bloqueio = null;
  const temPeca = cobraveis.some(l => (l.natureza || l.natureza_sugerida) === "peca");
  if (orc.status !== "aprovado") bloqueio = "Só orçamento aprovado vira nota.";
  else if (orc.nota_status === "emitida") bloqueio = "Este orçamento já tem nota emitida.";
  // O código de integração ORC-<id> já pertence à OS cancelada no Omie;
  // reemitir pelo sistema acharia ela de novo. Nota nova é no Omie.
  else if (orc.nota_status === "cancelada") bloqueio = "A nota deste orçamento foi cancelada no Omie — uma nova precisa ser emitida por lá.";
  else if (orc.nota_status === "processando") bloqueio = "A nota deste orçamento está sendo processada — use Atualizar.";
  else if ((orc.tipo || "pecas") !== "pecas") bloqueio = "Limpeza de reservatório e dedetização usam outro código de serviço na nota — por enquanto, emita no Omie.";
  else if (!cobraveis.length || totalCent <= 0) bloqueio = "Nenhuma linha com valor para a nota.";
  else if (temPeca) bloqueio = "Orçamento com peça sai em DANFE (nota de produto), que ainda não está no sistema — por enquanto, emita no Omie.";
  else if (!orc.condominio_id && !String(orc.cliente_documento || "").replace(/\D/g, "")) bloqueio = "Cliente sem CPF/CNPJ.";
  else if (orc.condominio_id && !String(orc.condo_cnpj || "").replace(/\D/g, "")) bloqueio = "Condomínio sem CNPJ no cadastro.";

  let itens = [];
  if (cobraveis.length && totalCent > 0) itens = ratear(cobraveis, totalCent);
  const somaLinhasCent = cobraveis.reduce((a, l) => a + _cent(l.valor_unitario) * Number(l.quantidade), 0);

  return {
    tipo: temPeca ? "nfe" : "nfse",
    bloqueio,
    linhas: comNatureza.map(l => ({
      id: l.id, descricao: l.descricao, quantidade: l.quantidade, valor_unitario: l.valor_unitario,
      natureza: l.natureza, natureza_sugerida: l.natureza_sugerida,
      cobravel: cobraveis.some(c => c.id === l.id),
    })),
    itens: itens.map(i => ({ linha_id: i.id, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.unitCent / 100, total: i.totalCent / 100 })),
    total: totalCent / 100,
    // O valor manual do orçamento sobrepõe a soma; a prévia diz que houve rateio.
    rateado: orc.valor != null && somaLinhasCent !== totalCent,
    cliente: orc.condominio_id
      ? { nome: orc.condo_fantasia || orc.condo_nome, documento: orc.condo_cnpj, omie_codigo: orc.omie_cliente_codigo || null }
      : { nome: orc.cliente_nome, documento: orc.cliente_documento, omie_codigo: null },
    emissao_ligada: emissaoLigada(),
    nota: _resumoNota(orc),
  };
}

async function preparar(orcId) {
  const { orc, linhas } = await _carregar(orcId);
  return _conferir(orc, linhas);
}

// ── Cliente no Omie ─────────────────────────────────────────────────────────
function _separarEndereco(txt) {
  const s = String(txt || "").trim();
  const m = s.match(/^(.*?)[,\s]+(n[º°o.]?\s*)?(\d+[A-Za-z]?|s\/?n)\b\s*[,\-–]?\s*(.*)$/i);
  if (!m) return { endereco: s.slice(0, 60) || "Não informado", numero: "S/N", complemento: "" };
  return { endereco: m[1].trim().slice(0, 60), numero: m[3].toUpperCase(), complemento: (m[4] || "").trim().slice(0, 60) };
}

function _fmtDoc(d) {
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

async function _garantirCliente(orc) {
  if (orc.condominio_id && orc.omie_cliente_codigo) return Number(orc.omie_cliente_codigo);

  const doc = String(orc.condominio_id ? orc.condo_cnpj : orc.cliente_documento || "").replace(/\D/g, "");
  const achado = await omie.acharClientePorDocumento(doc);
  let codigo = achado?.codigo_cliente_omie || null;

  if (!codigo) {
    // ⚠️ SÓ CONDOMÍNIO É CRIADO AUTOMATICAMENTE. O cadastro tem endereço em
    // campos (bairro, cidade, UF, CEP), que a prefeitura exige na nota. O
    // cliente avulso tem endereço em texto livre; inventar bairro e CEP a
    // partir dele seria pôr dado errado em documento fiscal.
    if (!orc.condominio_id) {
      throw new NotaErro(422, "Cliente avulso não encontrado no Omie pelo CPF/CNPJ. Cadastre-o no Omie e tente de novo.");
    }
    const end = _separarEndereco(orc.condo_endereco);
    const r = await omie.upsertCliente({
      codigo_cliente_integracao: `COND-${orc.condominio_id}`,
      razao_social: String(orc.condo_nome || "").slice(0, 60),
      nome_fantasia: String(orc.condo_fantasia || orc.condo_nome || "").slice(0, 100),
      cnpj_cpf: _fmtDoc(doc),
      pessoa_fisica: doc.length === 11 ? "S" : "N",
      email: String(orc.condo_email || "").split(/[,;\s]+/).filter(Boolean)[0] || "",
      endereco: end.endereco,
      endereco_numero: end.numero,
      complemento: end.complemento,
      bairro: orc.condo_bairro || "",
      cidade: orc.condo_cidade || "",
      estado: orc.condo_uf || "",
      cep: String(orc.condo_cep || "").replace(/\D/g, ""),
    });
    codigo = r.codigo_cliente_omie;
    if (!codigo) throw new NotaErro(502, "O Omie não devolveu o código do cliente criado.");
  }

  if (orc.condominio_id) {
    await pool.query(`UPDATE condominios SET omie_cliente_codigo = $2 WHERE id = $1`, [orc.condominio_id, codigo]);
  }
  return Number(codigo);
}

// ── OS no molde ─────────────────────────────────────────────────────────────
function _hojeBR() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function montarOs({ orc, itens, nCodCli }) {
  return {
    Cabecalho: {
      cCodIntOS: `ORC-${orc.id}`,
      nCodCli,
      cEtapa: "50",
      dDtPrevisao: _hojeBR(),
      cCodParc: MOLDE_NFSE.cCodParc,
      nQtdeParc: 1,
    },
    InformacoesAdicionais: {
      cCodCateg: MOLDE_NFSE.cCodCateg,
      nCodCC: MOLDE_NFSE.nCodCC,
      cCidPrestServ: orc.condo_cidade && orc.condo_uf ? `${String(orc.condo_cidade).toUpperCase()} (${orc.condo_uf})` : "SAO PAULO (SP)",
      cDadosAdicNF: orc.numero ? `Orçamento ${orc.numero}` : "",
    },
    ServicosPrestados: itens.map((i, k) => ({
      nSeqItem: k + 1,
      cCodServMun: MOLDE_NFSE.cCodServMun,
      cCodServLC116: MOLDE_NFSE.cCodServLC116,
      cTribServ: MOLDE_NFSE.cTribServ,
      cNbs: MOLDE_NFSE.cNbs,
      cRetemISS: MOLDE_NFSE.cRetemISS,
      cDescServ: String(i.descricao || "").trim().toUpperCase(),
      nQtde: i.quantidade,
      nValUnit: i.unitCent / 100,
    })),
  };
}

// ── Emitir ──────────────────────────────────────────────────────────────────
// `naturezas` = { [linha_id]: 'servico'|'peca' } confirmado no modal. Grava
// ANTES de tudo: a classificação é trabalho de quem emitiu e vale mesmo que a
// emissão falhe adiante.
async function emitir(orcId, usuarioId, naturezas = {}) {
  for (const [id, nat] of Object.entries(naturezas || {})) {
    if (nat !== "servico" && nat !== "peca") continue;
    await pool.query(`UPDATE orcamento_linhas SET natureza = $3 WHERE id = $1 AND orcamento_id = $2`, [Number(id), orcId, nat]);
  }

  const { orc, linhas } = await _carregar(orcId);
  const conf = _conferir(orc, linhas);
  // Toda linha cobrável precisa estar CONFIRMADA — sugestão não emite nota.
  const semConfirmar = conf.linhas.filter(l => l.cobravel && !l.natureza);
  if (semConfirmar.length) throw new NotaErro(422, "Confirme se cada linha é serviço ou peça antes de emitir.");
  if (conf.bloqueio) throw new NotaErro(409, conf.bloqueio);
  if (!emissaoLigada()) throw new NotaErro(503, "Emissão de nota desligada neste ambiente (OMIE_EMISSAO).");

  // Trava contra clique duplo / duas abas. "processando" sem OS e parado há
  // mais de 5 min é emissão que morreu no meio (deploy, queda) — pode retomar.
  const trava = await pool.query(
    `UPDATE orcamentos
        SET nota_tipo = 'nfse', nota_status = 'processando', nota_erro = NULL,
            nota_solicitada_em = now(), nota_emitida_por = $2
      WHERE id = $1
        AND (nota_status IS NULL OR nota_status = 'erro'
             OR (nota_status = 'processando' AND omie_os_codigo IS NULL
                 AND nota_solicitada_em < now() - interval '5 minutes'))
      RETURNING id`,
    [orcId, usuarioId]
  );
  if (!trava.rowCount) throw new NotaErro(409, "Já existe uma emissão em andamento para este orçamento.");

  try {
    const nCodCli = await _garantirCliente(orc);

    // Retomável: o código de integração é determinístico, então uma OS criada
    // numa tentativa que caiu é ACHADA aqui em vez de duplicada.
    let os = await omie.consultarOsPorIntegracao(`ORC-${orc.id}`);
    let nCodOS = os?.Cabecalho?.nCodOS || null;
    if (!nCodOS) {
      // Os itens são OS MESMOS da prévia que quem emitiu viu e confirmou.
      const itens = conf.itens.map(i => ({ descricao: i.descricao, quantidade: i.quantidade, unitCent: Math.round(i.valor_unitario * 100) }));
      const novo = await omie.incluirOs(montarOs({ orc, itens, nCodCli }));
      nCodOS = novo.nCodOS;
      if (!nCodOS) throw new NotaErro(502, "O Omie não devolveu o código da OS criada.");
    }
    await pool.query(`UPDATE orcamentos SET omie_os_codigo = $2, nota_valor = $3 WHERE id = $1`, [orcId, nCodOS, conf.total]);

    const st0 = await omie.statusOs(nCodOS);
    if (st0.cFaturada !== "S") await omie.faturarOs(nCodOS);

    return await atualizar(orcId);
  } catch (e) {
    const msg = e.message || "Falha ao emitir.";
    await pool.query(`UPDATE orcamentos SET nota_status = 'erro', nota_erro = $2 WHERE id = $1`, [orcId, msg.slice(0, 1000)]);
    console.error(`[nota] orcamento=${orcId} FALHA call=${e.call || "-"} code=${e.faultcode || "-"}: ${msg}`);
    throw e instanceof NotaErro || e instanceof omie.OmieErro ? e : new NotaErro(500, msg);
  }
}

// ── Atualizar (consulta o Omie, não muda nada lá) ───────────────────────────
// A prefeitura processa o RPS depois do faturamento, então o número pode
// chegar minutos depois. Lê o StatusOS e grava o que tiver.
async function atualizar(orcId) {
  const { orc } = await _carregar(orcId);
  if (!orc.omie_os_codigo) return _resumoNota(orc);

  const st = await omie.statusOs(Number(orc.omie_os_codigo));
  const rps = (st.ListaRpsNfse || [])[0] || {};
  const numero = rps.nNfse ? String(Number(rps.nNfse)) : null;
  const msgs = (rps.mensagens || []).map(m => m.cMensagem || m.mensagem || JSON.stringify(m)).filter(Boolean).join(" · ");

  // ⚠️ $2 aparece duas vezes no UPDATE abaixo (valor e comparação): cast
  // explícito nos dois, senão 42P08 no parse (ver CLAUDE.md).
  let status = "processando";
  if (st.cCancelada === "S") status = "cancelada";
  else if (st.cFaturada === "S" && numero) status = "emitida";
  else if (msgs && !numero) status = "erro";

  await pool.query(
    `UPDATE orcamentos
        SET nota_status = $2::varchar, nota_numero = COALESCE($3, nota_numero), nota_url = COALESCE($4, nota_url),
            nota_erro = $5,
            nota_emitida_em = CASE WHEN $2::varchar = 'emitida' AND nota_emitida_em IS NULL THEN now() ELSE nota_emitida_em END
      WHERE id = $1`,
    [orcId, status, numero, rps.cUrlNfse || null, status === "erro" ? msgs.slice(0, 1000) : null]
  );
  console.log(`[nota] orcamento=${orcId} os=${orc.omie_os_codigo} status=${status} numero=${numero || "-"}`);
  const { orc: depois } = await _carregar(orcId);
  return _resumoNota(depois);
}

module.exports = {
  NotaErro,
  MOLDE_NFSE,
  emissaoLigada,
  sugerirNatureza,
  linhasCobraveis,
  ratear,
  montarOs,
  preparar,
  emitir,
  atualizar,
  _conferir,
  _separarEndereco,
};
