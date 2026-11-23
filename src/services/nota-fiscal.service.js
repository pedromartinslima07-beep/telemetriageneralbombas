// src/services/nota-fiscal.service.js
//
// Emissão da nota do orçamento aprovado, pelo Omie.
//
// REGRA (Pedro, 17/11/2026): UMA nota por orçamento.
//   • só serviço    → NFS-e: OS no Omie + FaturarOS
//   • qualquer peça → só DANFE: pedido de venda + FaturarPedidoVenda, com o
//                     serviço embutido no preço das peças (rateio)
//
// NA DANFE CADA LINHA DE PEÇA PRECISA SER UM PRODUTO DO OMIE. A linha do
// orçamento é texto livre; quem emite escolhe o produto no modal (com
// sugestão — ver omie-produtos.service.js) e a escolha fica em
// `orcamento_linhas.omie_produto_codigo` (migration 091).
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
const catalogo = require("./omie-produtos.service");

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

// Molde do pedido de venda (DANFE), copiado dos 77 pedidos faturados à mão
// lidos em 18/11/2026: o MESMO cenário fiscal em todos (o Omie calcula o
// imposto a partir dele — aqui não se calcula nada), categoria 1.01.02, a
// conta e o vendedor dos pedidos recentes, sem frete, sem baixar estoque.
// CFOP: 5.102 (venda dentro de SP) salvo o produto ter saído da última vez
// com outro — os itens com ST saem 5.405. Ver `ultimo_cfop` na migration 091.
const MOLDE_NFE = Object.freeze({
  cenario: 5961933817,
  cCodCateg: "1.01.02",
  nCodCC: 6109178168,
  codVend: 6103322480,
  cCodParc: "000",
  cfopPadrao: "5.102",
  freteModalidade: "9",        // sem frete
});

// ── Banco do boleto (23/11/2026, migration 101) ─────────────────────────────
// Quem emite escolhe. As duas contas que cobram no Omie (lidas pela API em
// 20/11/2026, docs/modulos/omie-integracao.md). Sicredi registra o boleto no
// banco sozinho (integração por API no Omie); Bradesco só depois da remessa,
// que o Pedro tira no Omie e sobe no Net Empresa — o sistema não gera remessa.
// Padrão Bradesco: é a conta das notas avulsas feitas à mão (o molde).
const BANCOS = Object.freeze({
  bradesco: { conta: 6109178168, nome: "Bradesco", remessa: true },
  sicredi:  { conta: 5960922842, nome: "Sicredi",  remessa: false },
});
const BANCO_PADRAO = "bradesco";
const bancoDaConta = (cc) => Object.keys(BANCOS).find(k => BANCOS[k].conta === Number(cc)) || null;

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
//
// ⚠️ QUEM DECIDE É O COMEÇO DA LINHA, não uma palavra em qualquer lugar.
// Até 18/11/2026 bastava "limpeza" aparecer: "Zeolita Areia Limpeza E
// Filtragem De Piscina - Pct 25kg" (OR-000201) saía como serviço, quando é um
// saco de areia. A linha de serviço começa pelo serviço ("Conserto de…",
// "Mão de obra…", "Limpeza e regulagem…"); a de peça, pela peça. O que vem
// antes da primeira palavra ("Opção 01:", "01", "-") é pulado.
//
// "Pressostato — reparo" é serviço: depois de um travessão, o serviço pode
// vir no fim. "Fornecimento de…" é peça (é o material); "Fornecimento e
// instalação de…" é misto, e a sugestão diz peça — quem emite confirma.
// Testado contra as 507 linhas de orçamento de produção em 18/11/2026.
//
// ⚠️ "USINAGEM DO EIXO" NÃO entra: no Omie ela é produto (PRD00449) e sai
// em DANFE junto com rolamento e selo, como a General fatura hoje.
const _RX_SERVICO = /^(conserto|m[ãa]o\s+de\s+obra|manuten[çc][ãa]o|instala[çc][ãa]o|servi[çc]o|limpeza|higieniza|dedetiza|restaura|reparo|recupera|rebobina|visita|diagn[óo]stic|desentup|substitui[çc][ãa]o|troca\b|retirada|montagem|desmontagem|regulagem|ajuste|teste\s+d[eao]|calibra|vistoria|inspe[çc][ãa]o|laudo|nivelamento|despressuriza|repressuriza|drenagem|isolamento\s+e\s+despressuriza|emiss[ãa]o\s+de\s+art\b)/i;
const _RX_PREFIXO = /^(\s*(op[çc][ãa]o|item)\s*\d*\s*[:.\-–]?|\s*\d+\s*[-–.)]?\s+|\s*[-–•*]\s*)+/i;

function sugerirNatureza(linha) {
  if (linha.tipo_servico) return "servico";
  const partes = String(linha.descricao || "").split(/\s+[—–-]\s+/).map(p => p.replace(_RX_PREFIXO, "").trim());
  return partes.some(p => _RX_SERVICO.test(p)) ? "servico" : "peca";
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
function _distribuir(itens, totalCent) {
  const base = itens.map(i => _cent(i.valor_unitario) * Number(i.quantidade));
  const soma = base.reduce((a, b) => a + b, 0);
  if (soma <= 0) throw new NotaErro(422, "Nenhuma linha com valor para a nota.");
  const linhaCent = base.map(b => Math.floor((b * totalCent) / soma));
  const resto = totalCent - linhaCent.reduce((a, b) => a + b, 0);
  linhaCent[linhaCent.length - 1] += resto;
  return linhaCent;
}

function ratear(itens, totalCent) {
  const linhaCent = _distribuir(itens, totalCent);
  return itens.map((i, k) => {
    const q = Number(i.quantidade);
    const tot = linhaCent[k];
    if (tot % q === 0) return { ...i, quantidade: q, unitCent: tot / q, totalCent: tot };
    return { ...i, descricao: `${q} un. — ${i.descricao}`, quantidade: 1, unitCent: tot, totalCent: tot };
  });
}

// Rateio da DANFE: o total do orçamento (peças + serviço) é distribuído SÓ
// entre as peças, na proporção do valor de cada uma — é o "serviço embutido".
//
// ⚠️ A QUANTIDADE NÃO PODE VIRAR 1 AQUI, como na NFS-e: na NF-e o item é o
// produto do cadastro (a descrição é a dele, não a nossa), e 26 válvulas
// precisam sair como 26. Quando o total da linha não divide pela quantidade
// em centavos, a linha vira DOIS itens do mesmo produto: (q−1) a u e 1 a
// u + o resto. Ex.: 26 válvulas por R$ 6.690,00 → 25 × 257,30 + 1 × 257,50.
// Unitário com centavo fracionado dependeria da configuração de casas
// decimais do Omie, que não dá para conferir sem emitir.
function ratearNfe(itens, totalCent) {
  const linhaCent = _distribuir(itens, totalCent);
  const out = [];
  itens.forEach((i, k) => {
    const q = Number(i.quantidade);
    const tot = linhaCent[k];
    if (tot % q === 0) { out.push({ ...i, quantidade: q, unitCent: tot / q, totalCent: tot }); return; }
    const u = Math.floor(tot / q);
    out.push({ ...i, quantidade: q - 1, unitCent: u, totalCent: u * (q - 1) });
    out.push({ ...i, quantidade: 1, unitCent: tot - u * (q - 1), totalCent: tot - u * (q - 1) });
  });
  return out;
}

// ── Parcelas ────────────────────────────────────────────────────────────────
// A quantidade vem do texto livre do orçamento ("Via boleto bancário
// parcelado em 2x", "em 02 vezes", "em duas vezes", "até 03 vezes" — os que
// existem em produção em 18/11/2026). É só o ponto de partida: o modal deixa
// mudar a quantidade e cada vencimento.
//
// O CALENDÁRIO PADRÃO É O DAS NOTAS FEITAS À MÃO (OS 3198–3207 e pedidos
// 854–864): 1ª parcela 5 dias depois da emissão; as seguintes, uma por mês
// no dia da emissão. Valores iguais, o centavo que sobra na última. Boleto.
//
// Parcela única segue à vista (`000`), como até aqui. Mais de uma vai com o
// código `999`, o único que o Omie aceita com a lista de vencimentos.
const MAX_PARCELAS = 12;
const _NUM_EXTENSO = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

function parcelasDoTexto(txt) {
  const s = String(txt || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let m = s.match(/(\d{1,2})\s*(x\b|vezes|parcelas)/);
  let n = m ? Number(m[1]) : null;
  if (!n) {
    m = s.match(/\b(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(vezes|parcelas)/);
    n = m ? _NUM_EXTENSO[m[1]] : null;
  }
  return n && n >= 1 && n <= MAX_PARCELAS ? n : 1;
}

function _hojeIso() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function _isoMaisDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}
// Mesmo dia, N meses depois; dia que não existe no mês cai no último (31/01 → 28/02).
function _isoMaisMeses(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate();
  const x = new Date(Date.UTC(a, m - 1 + n, Math.min(d, ultimo)));
  return x.toISOString().slice(0, 10);
}
const _isoBR = (iso) => iso.split("-").reverse().join("/");

function vencimentosPadrao(n, hoje = _hojeIso()) {
  return Array.from({ length: n }, (_, k) => (k === 0 ? _isoMaisDias(hoje, 5) : _isoMaisMeses(hoje, k)));
}

// `pedido` = { parcelas, vencimentos?, banco?, boleto? } do modal, ou nada
// (vale o texto do orçamento, o calendário padrão, o Bradesco e o boleto
// ligado). Devolve a lista pronta e, se houver, o erro que bloqueia a emissão.
//
// ⚠️ A PARCELA ÚNICA TAMBÉM TEM VENCIMENTO (23/11/2026). Antes, à vista ia
// com `000` e o Omie decidia a data; com o boleto junto, quem emite escolhe
// (padrão: 5 dias, como a 1ª parcela das notas feitas à mão) e ela vai com
// `999` e uma parcela só. A primeira nota à vista em produção confirma.
function montarPagamento(orc, totalCent, pedido, hoje = _hojeIso()) {
  const doOrcamento = parcelasDoTexto(orc.forma_pagamento);
  let n = Number(pedido?.parcelas);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) n = doOrcamento;
  const veio = Array.isArray(pedido?.vencimentos) && pedido.vencimentos.length === n ? pedido.vencimentos.map(String) : null;
  const venc = veio || vencimentosPadrao(n, hoje);
  const banco = BANCOS[pedido?.banco] ? pedido.banco : BANCO_PADRAO;
  const boleto = pedido?.boleto !== false;

  let erro = null;
  for (let k = 0; k < n && !erro; k++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc[k]) || Number.isNaN(Date.parse(venc[k]))) erro = `Vencimento da parcela ${k + 1} inválido.`;
    else if (venc[k] < hoje) erro = n === 1 ? "O vencimento é antes de hoje." : `A parcela ${k + 1} vence antes de hoje.`;
    else if (k > 0 && venc[k] <= venc[k - 1]) erro = `A parcela ${k + 1} precisa vencer depois da ${k}.`;
  }

  const base = Math.floor(Math.max(totalCent, 0) / n);
  const lista = Array.from({ length: n }, (_, k) => ({
    numero: k + 1,
    vencimento: venc[k],
    valorCent: k === n - 1 ? Math.max(totalCent, 0) - base * (n - 1) : base,
  }));
  // Percentual com 4 casas; o da última fecha 100 exato.
  let acum = 0;
  for (const p of lista) {
    if (p.numero < n) { p.percentual = totalCent > 0 ? Math.round((p.valorCent / totalCent) * 1e6) / 1e4 : 0; acum += p.percentual; }
    else p.percentual = Math.round((100 - acum) * 1e4) / 1e4;
  }
  return {
    parcelas: n,
    do_orcamento: doOrcamento,
    banco,
    conta: BANCOS[banco].conta,
    boleto,
    erro,
    lista: lista.map(p => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valorCent / 100, percentual: p.percentual })),
  };
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
    `SELECT id, descricao, quantidade, valor_unitario, tipo_servico, natureza, omie_produto_codigo
       FROM orcamento_linhas WHERE orcamento_id = $1 ORDER BY id`,
    [orcId]
  );
  const b = await db.query(
    `SELECT omie_titulo, parcela, to_char(vencimento, 'YYYY-MM-DD') AS vencimento, valor, nosso_numero, gerado, erro
       FROM orcamento_boletos WHERE orcamento_id = $1 ORDER BY parcela, omie_titulo`,
    [orcId]
  );
  r.rows[0]._boletos = b.rows;
  return { orc: r.rows[0], linhas: l.rows };
}

function _resumoNota(orc) {
  const banco = bancoDaConta(orc.nota_conta_corrente);
  return {
    nota_tipo: orc.nota_tipo, nota_status: orc.nota_status, nota_numero: orc.nota_numero,
    nota_url: orc.nota_url, nota_valor: orc.nota_valor, nota_erro: orc.nota_erro,
    nota_solicitada_em: orc.nota_solicitada_em, nota_emitida_em: orc.nota_emitida_em,
    nota_emitida_por_nome: orc.nota_emitida_por_nome || null, omie_os_codigo: orc.omie_os_codigo,
    omie_pedido_codigo: orc.omie_pedido_codigo || null,
    nota_conta_corrente: orc.nota_conta_corrente || null,
    banco: banco ? BANCOS[banco].nome : null,
    remessa: banco ? BANCOS[banco].remessa : null,
    boleto_status: orc.boleto_status || null, boleto_erro: orc.boleto_erro || null,
    boletos: (orc._boletos || []).map(b => ({
      omie_titulo: String(b.omie_titulo), parcela: b.parcela, vencimento: b.vencimento, valor: b.valor == null ? null : Number(b.valor),
      nosso_numero: b.nosso_numero, gerado: b.gerado, erro: b.erro,
    })),
  };
}

// Tudo o que o modal precisa para mostrar a prévia, SEM falar com o Omie.
// `bloqueio` é a frase que explica por que não dá para emitir — o modal
// mostra e desabilita o botão; a rota de emitir repete a mesma checagem.
//
// `naturezas` e `escolhas` ({ [linha_id]: ... }) são o que está marcado no
// modal e ainda não foi gravado; sem eles vale o que está no banco.
// `prodInfo` = Map codigo_produto → produto do catálogo (para a prévia mostrar
// o que é e o CFOP); a função é síncrona e não consulta nada.
// `pagamento` = { parcelas, vencimentos? } marcado no modal (ver montarPagamento).
function _conferir(orc, linhas, naturezas, escolhas, prodInfo = new Map(), pagamento = null) {
  const comNatureza = linhas.map(l => {
    const escolhido = escolhas && Object.prototype.hasOwnProperty.call(escolhas, l.id) ? escolhas[l.id] : l.omie_produto_codigo;
    const cod = escolhido ? Number(escolhido) : null;
    return {
      ...l,
      natureza: naturezas?.[l.id] || l.natureza || null,
      natureza_sugerida: sugerirNatureza(l),
      omie_produto_codigo: cod,
      produto: cod ? prodInfo.get(cod) || { codigo_produto: cod, descricao: null } : null,
    };
  });
  const cobraveis = linhasCobraveis(comNatureza);
  const totalCent = totalDoOrcamentoCent(orc, cobraveis);
  const efetiva = (l) => l.natureza || l.natureza_sugerida;
  const pecas = cobraveis.filter(l => efetiva(l) === "peca");
  const temPeca = pecas.length > 0;
  const tipo = temPeca ? "nfe" : "nfse";

  let bloqueio = null;
  if (orc.status !== "aprovado") bloqueio = "Só orçamento aprovado vira nota.";
  else if (orc.nota_status === "emitida") bloqueio = "Este orçamento já tem nota emitida.";
  // O código de integração ORC-<id> já pertence à OS/pedido cancelado no
  // Omie; reemitir pelo sistema acharia ele de novo. Nota nova é no Omie.
  else if (orc.nota_status === "cancelada") bloqueio = "A nota deste orçamento foi cancelada no Omie — uma nova precisa ser emitida por lá.";
  else if (orc.nota_status === "processando") bloqueio = "A nota deste orçamento está sendo processada — use Atualizar.";
  else if ((orc.tipo || "pecas") !== "pecas") bloqueio = "Limpeza de reservatório e dedetização usam outro código de serviço na nota — por enquanto, emita no Omie.";
  else if (!cobraveis.length || totalCent <= 0) bloqueio = "Nenhuma linha com valor para a nota.";
  // Uma tentativa anterior que falhou deixou uma OS (ou um pedido) no Omie, e
  // agora a classificação pede a outra nota. Seguir criaria o segundo
  // documento para o mesmo orçamento — duas notas.
  else if (tipo === "nfe" && orc.omie_os_codigo) bloqueio = "Uma tentativa anterior já criou uma OS (NFS-e) no Omie para este orçamento. Confira no Omie antes de emitir como DANFE.";
  else if (tipo === "nfse" && orc.omie_pedido_codigo) bloqueio = "Uma tentativa anterior já criou um pedido de venda (DANFE) no Omie para este orçamento. Confira no Omie antes de emitir como NFS-e.";
  else if (!orc.condominio_id && !String(orc.cliente_documento || "").replace(/\D/g, "")) bloqueio = "Cliente sem CPF/CNPJ.";
  else if (orc.condominio_id && !String(orc.condo_cnpj || "").replace(/\D/g, "")) bloqueio = "Condomínio sem CNPJ no cadastro.";
  // CFOP 5.xxx é venda dentro do estado. Fora de SP seria 6.xxx, com outra
  // tributação — não está no molde, e errar isso é nota errada.
  else if (tipo === "nfe" && orc.condominio_id && orc.condo_uf && String(orc.condo_uf).toUpperCase() !== "SP") bloqueio = "Cliente fora de SP: a DANFE muda de CFOP (6.xxx) — por enquanto, emita no Omie.";
  else if (tipo === "nfe" && pecas.some(l => !l.omie_produto_codigo)) bloqueio = "Escolha o produto do Omie de cada peça.";
  else if (tipo === "nfe" && pecas.some(l => l.produto?.inativo)) bloqueio = "Um dos produtos escolhidos está inativo no Omie — escolha outro.";

  const pag = montarPagamento(orc, totalCent, pagamento);
  if (!bloqueio && pag.erro) bloqueio = pag.erro;

  let itens = [];
  if (totalCent > 0) {
    if (tipo === "nfe") itens = ratearNfe(pecas, totalCent);
    else if (cobraveis.length) itens = ratear(cobraveis, totalCent);
  }
  const base = (ls) => ls.reduce((a, l) => a + _cent(l.valor_unitario) * Number(l.quantidade), 0);
  const somaLinhasCent = base(cobraveis);
  const servicoCent = tipo === "nfe" ? base(cobraveis.filter(l => efetiva(l) !== "peca")) : 0;

  return {
    tipo,
    bloqueio,
    linhas: comNatureza.map(l => ({
      id: l.id, descricao: l.descricao, quantidade: l.quantidade, valor_unitario: l.valor_unitario,
      natureza: l.natureza, natureza_sugerida: l.natureza_sugerida,
      cobravel: cobraveis.some(c => c.id === l.id),
      omie_produto_codigo: l.omie_produto_codigo, produto: l.produto,
    })),
    itens: itens.map(i => ({
      linha_id: i.id, descricao: tipo === "nfe" && i.produto?.descricao ? i.produto.descricao : i.descricao,
      quantidade: i.quantidade, valor_unitario: i.unitCent / 100, total: i.totalCent / 100,
      ...(tipo === "nfe" ? {
        codigo_produto: i.omie_produto_codigo || null, codigo: i.produto?.codigo || null,
        ncm: i.produto?.ncm || null, cfop: i.produto?.cfop || MOLDE_NFE.cfopPadrao,
      } : {}),
    })),
    total: totalCent / 100,
    // NFS-e: o valor manual do orçamento sobrepõe a soma. DANFE: além disso,
    // o serviço some como linha e entra no preço das peças.
    rateado: tipo === "nfe" ? totalCent !== base(pecas) : orc.valor != null && somaLinhasCent !== totalCent,
    servico_embutido: servicoCent / 100,
    pagamento: {
      parcelas: pag.parcelas, do_orcamento: pag.do_orcamento, forma_pagamento: orc.forma_pagamento || null, lista: pag.lista,
      banco: pag.banco, conta: pag.conta, boleto: pag.boleto, remessa: BANCOS[pag.banco].remessa,
      bancos: Object.entries(BANCOS).map(([k, b]) => ({ id: k, nome: b.nome, remessa: b.remessa })),
    },
    cliente: orc.condominio_id
      ? { nome: orc.condo_fantasia || orc.condo_nome, documento: orc.condo_cnpj, omie_codigo: orc.omie_cliente_codigo || null }
      : { nome: orc.cliente_nome, documento: orc.cliente_documento, omie_codigo: null },
    emissao_ligada: emissaoLigada(),
    nota: _resumoNota(orc),
  };
}

// Prévia completa: a conferência + o que só o catálogo sabe (o produto
// escolhido e as sugestões de cada peça). Ainda não fala com o Omie — o
// catálogo é a cópia local; se passou de 24 h, ela se atualiza por trás.
async function preparar(orcId, naturezas, escolhas, pagamento) {
  const { orc, linhas } = await _carregar(orcId);
  const cods = linhas.map(l => (escolhas && escolhas[l.id]) || l.omie_produto_codigo).filter(Boolean);
  let prodInfo = new Map();
  let cat = null;
  try {
    cat = await catalogo.sincronizarSeVelho();
    prodInfo = await catalogo.porCodigos(cods);
  } catch (e) {
    // Sem a tabela (091 não aplicada) ou sem Omie, a NFS-e continua.
    console.error("[nota] catálogo indisponível:", e.message);
  }
  const conf = _conferir(orc, linhas, naturezas, escolhas, prodInfo, pagamento);

  // Sugestões só para as linhas que hoje contam como peça.
  const pecas = conf.linhas.filter(l => l.cobravel && (l.natureza || l.natureza_sugerida) === "peca");
  if (cat && pecas.length) {
    try {
      const sug = await catalogo.sugerir(pecas.map(l => l.descricao));
      for (const l of pecas) l.sugestoes = sug[l.descricao] || [];
    } catch (e) {
      console.error("[nota] sugestão falhou:", e.message);
    }
  }
  conf.catalogo = cat;
  return conf;
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

// Parcelas: com a lista de vencimentos (1 ou mais) = 999 com a lista, boleto
// (meio 15), como nas OS parceladas feitas à mão. Sem lista = 000 (o Omie
// preenche) — só acontece em quem chama sem passar pelo montarPagamento.
// A conta corrente é a do banco escolhido (BANCOS); sem ela, a do molde.
function montarOs({ orc, itens, nCodCli, pagamento }) {
  const parc = pagamento && pagamento.lista?.length && pagamento.lista.every(p => p.vencimento) ? pagamento : null;
  return {
    Cabecalho: {
      cCodIntOS: `ORC-${orc.id}`,
      nCodCli,
      cEtapa: "50",
      dDtPrevisao: _hojeBR(),
      cCodParc: parc ? "999" : MOLDE_NFSE.cCodParc,
      nQtdeParc: parc ? parc.parcelas : 1,
    },
    ...(parc ? {
      Parcelas: parc.lista.map(p => ({
        nParcela: p.numero, dDtVenc: _isoBR(p.vencimento), nValor: p.valor, nPercentual: p.percentual,
        tipo_documento: "BOL", meio_pagamento: "15",
      })),
    } : {}),
    InformacoesAdicionais: {
      cCodCateg: MOLDE_NFSE.cCodCateg,
      nCodCC: pagamento?.conta || MOLDE_NFSE.nCodCC,
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

// ── Pedido de venda no molde (vira DANFE) ───────────────────────────────────
// `itens` = os itens da prévia (já rateados, com o produto e o CFOP).
// O código de item é `<linha>-<seq>`: a mesma linha pode virar dois itens
// (ver ratearNfe), e o Omie limita o campo a 30 caracteres.
function montarPedido({ orc, itens, nCodCli, pagamento }) {
  const parc = pagamento && pagamento.lista?.length && pagamento.lista.every(p => p.vencimento) ? pagamento : null;
  return {
    cabecalho: {
      codigo_pedido_integracao: `ORC-${orc.id}`,
      codigo_cliente: nCodCli,
      data_previsao: _hojeBR(),
      etapa: "50",                       // "Faturar", como o cEtapa 50 da OS
      codigo_parcela: parc ? "999" : MOLDE_NFE.cCodParc,
      qtde_parcelas: parc ? parc.parcelas : 1,
      codigo_cenario_impostos: MOLDE_NFE.cenario,
      quantidade_itens: itens.length,
    },
    det: itens.map((i, k) => ({
      ide: { codigo_item_integracao: `${i.linha_id}-${k + 1}` },
      produto: {
        codigo_produto: Number(i.codigo_produto),
        cfop: i.cfop || MOLDE_NFE.cfopPadrao,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
      },
      inf_adic: {
        codigo_categoria_item: MOLDE_NFE.cCodCateg,
        codigo_cenario_impostos_item: MOLDE_NFE.cenario,
        nao_movimentar_estoque: "S",
      },
    })),
    ...(parc ? {
      lista_parcelas: {
        parcela: parc.lista.map(p => ({
          numero_parcela: p.numero, data_vencimento: _isoBR(p.vencimento), valor: p.valor, percentual: p.percentual,
          tipo_documento: "BOL", meio_pagamento: "15",
        })),
      },
    } : {}),
    frete: { modalidade: MOLDE_NFE.freteModalidade },
    informacoes_adicionais: {
      codigo_categoria: MOLDE_NFE.cCodCateg,
      codigo_conta_corrente: pagamento?.conta || MOLDE_NFE.nCodCC,
      codVend: MOLDE_NFE.codVend,
      consumidor_final: "S",
      dados_adicionais_nf: orc.numero ? `Orçamento ${orc.numero}` : "",
    },
  };
}

// ── Emitir ──────────────────────────────────────────────────────────────────
// `naturezas` = { [linha_id]: 'servico'|'peca' } e `escolhas` =
// { [linha_id]: codigo_produto } confirmados no modal. Gravados ANTES de
// tudo: a classificação e a escolha do produto são trabalho de quem emitiu e
// valem mesmo que a emissão falhe adiante.
// `pagamento` = { parcelas, vencimentos } do modal; não é gravado (a retomada
// acha a OS/pedido já criado, com as parcelas que foram).
async function emitir(orcId, usuarioId, naturezas = {}, escolhas = {}, pagamento = null) {
  for (const [id, nat] of Object.entries(naturezas || {})) {
    if (nat !== "servico" && nat !== "peca") continue;
    await pool.query(`UPDATE orcamento_linhas SET natureza = $3 WHERE id = $1 AND orcamento_id = $2`, [Number(id), orcId, nat]);
  }
  const codsEscolhidos = Object.values(escolhas || {}).map(Number).filter(c => Number.isSafeInteger(c) && c > 0);
  const validos = codsEscolhidos.length ? await catalogo.porCodigos(codsEscolhidos) : new Map();
  for (const [id, cod] of Object.entries(escolhas || {})) {
    const c = cod == null || cod === "" ? null : Number(cod);
    if (c != null && !validos.has(c)) throw new NotaErro(422, "Produto escolhido não está no catálogo do Omie — atualize o catálogo e escolha de novo.");
    await pool.query(`UPDATE orcamento_linhas SET omie_produto_codigo = $3 WHERE id = $1 AND orcamento_id = $2`, [Number(id), orcId, c]);
  }

  const { orc, linhas } = await _carregar(orcId);
  const prodInfo = await catalogo.porCodigos(linhas.map(l => l.omie_produto_codigo).filter(Boolean));
  const conf = _conferir(orc, linhas, null, null, prodInfo, pagamento);
  // Toda linha cobrável precisa estar CONFIRMADA — sugestão não emite nota.
  const semConfirmar = conf.linhas.filter(l => l.cobravel && !l.natureza);
  if (semConfirmar.length) throw new NotaErro(422, "Confirme se cada linha é serviço ou peça antes de emitir.");
  if (conf.bloqueio) throw new NotaErro(409, conf.bloqueio);
  if (!emissaoLigada()) throw new NotaErro(503, "Emissão de nota desligada neste ambiente (OMIE_EMISSAO).");

  // Trava contra clique duplo / duas abas. "processando" sem OS/pedido e
  // parado há mais de 5 min é emissão que morreu no meio (deploy, queda) —
  // pode retomar.
  const trava = await pool.query(
    `UPDATE orcamentos
        SET nota_tipo = $3, nota_status = 'processando', nota_erro = NULL,
            nota_solicitada_em = now(), nota_emitida_por = $2,
            nota_conta_corrente = $4, boleto_status = $5, boleto_erro = NULL
      WHERE id = $1
        AND (nota_status IS NULL OR nota_status = 'erro'
             OR (nota_status = 'processando' AND omie_os_codigo IS NULL AND omie_pedido_codigo IS NULL
                 AND nota_solicitada_em < now() - interval '5 minutes'))
      RETURNING id`,
    [orcId, usuarioId, conf.tipo, conf.pagamento.conta, conf.pagamento.boleto ? "pendente" : null]
  );
  if (!trava.rowCount) throw new NotaErro(409, "Já existe uma emissão em andamento para este orçamento.");

  try {
    const nCodCli = await _garantirCliente(orc);
    if (conf.tipo === "nfe") await _emitirDanfe(orc, conf, nCodCli, linhas);
    else await _emitirNfse(orc, conf, nCodCli);
    return await atualizar(orcId);
  } catch (e) {
    const msg = e.message || "Falha ao emitir.";
    await pool.query(`UPDATE orcamentos SET nota_status = 'erro', nota_erro = $2 WHERE id = $1`, [orcId, msg.slice(0, 1000)]);
    console.error(`[nota] orcamento=${orcId} FALHA call=${e.call || "-"} code=${e.faultcode || "-"}: ${msg}`);
    throw e instanceof NotaErro || e instanceof omie.OmieErro ? e : new NotaErro(500, msg);
  }
}

async function _emitirNfse(orc, conf, nCodCli) {
  // Retomável: o código de integração é determinístico, então uma OS criada
  // numa tentativa que caiu é ACHADA aqui em vez de duplicada.
  const os = await omie.consultarOsPorIntegracao(`ORC-${orc.id}`);
  let nCodOS = os?.Cabecalho?.nCodOS || null;
  if (!nCodOS) {
    // Os itens são OS MESMOS da prévia que quem emitiu viu e confirmou.
    const itens = conf.itens.map(i => ({ descricao: i.descricao, quantidade: i.quantidade, unitCent: Math.round(i.valor_unitario * 100) }));
    const novo = await omie.incluirOs(montarOs({ orc, itens, nCodCli, pagamento: conf.pagamento }));
    nCodOS = novo.nCodOS;
    if (!nCodOS) throw new NotaErro(502, "O Omie não devolveu o código da OS criada.");
  }
  await pool.query(`UPDATE orcamentos SET omie_os_codigo = $2, nota_valor = $3 WHERE id = $1`, [orc.id, nCodOS, conf.total]);

  const st0 = await omie.statusOs(nCodOS);
  if (st0.cFaturada !== "S") await omie.faturarOs(nCodOS);
}

async function _emitirDanfe(orc, conf, nCodCli, linhas) {
  // Mesma retomada da OS: ORC-<id> acha o pedido de uma tentativa que caiu.
  const ped = await omie.consultarPedidoPorIntegracao(`ORC-${orc.id}`);
  let nCodPed = ped?.cabecalho?.codigo_pedido || null;
  let etapa = ped?.cabecalho?.etapa || null;
  if (!nCodPed) {
    // Condomínio tem UF no cadastro e a prévia já barrou fora de SP. O
    // avulso só tem endereço em texto: a UF vem do cadastro dele no Omie.
    if (!orc.condominio_id) {
      const cli = await omie.acharClientePorDocumento(orc.cliente_documento);
      if (cli?.estado && String(cli.estado).toUpperCase() !== "SP") {
        throw new NotaErro(409, "Cliente fora de SP: a DANFE muda de CFOP (6.xxx) — por enquanto, emita no Omie.");
      }
    }
    const novo = await omie.incluirPedido(montarPedido({ orc, itens: conf.itens, nCodCli, pagamento: conf.pagamento }));
    nCodPed = novo.codigo_pedido;
    if (!nCodPed) throw new NotaErro(502, "O Omie não devolveu o código do pedido criado.");
    // O Omie aceitou estes produtos para estas descrições: aprende.
    await catalogo.lembrar(
      linhas.filter(l => l.omie_produto_codigo && conf.itens.some(i => i.linha_id === l.id))
        .map(l => ({ descricao: l.descricao, codigo_produto: l.omie_produto_codigo }))
    ).catch(e => console.error("[nota] não gravou o vínculo de produto:", e.message));
  }
  await pool.query(`UPDATE orcamentos SET omie_pedido_codigo = $2, nota_valor = $3 WHERE id = $1`, [orc.id, nCodPed, conf.total]);

  // Etapa 60 = faturado (o pedido de uma tentativa anterior pode já estar).
  if (etapa !== "60") await omie.faturarPedido(nCodPed);
}

// ── Atualizar (consulta o Omie, não muda nada lá) ───────────────────────────
// A prefeitura (NFS-e) e a SEFAZ (DANFE) processam depois do faturamento,
// então o número pode chegar minutos depois. Lê e grava o que tiver.
async function atualizar(orcId) {
  const { orc } = await _carregar(orcId);
  let r;
  if (orc.nota_tipo === "nfe") {
    if (!orc.omie_pedido_codigo) return _resumoNota(orc);
    r = await _lerDanfe(orc);
  } else {
    if (!orc.omie_os_codigo) return _resumoNota(orc);
    r = await _lerNfse(orc);
  }

  // ⚠️ $2 aparece duas vezes no UPDATE abaixo (valor e comparação): cast
  // explícito nos dois, senão 42P08 no parse (ver CLAUDE.md).
  await pool.query(
    `UPDATE orcamentos
        SET nota_status = $2::varchar, nota_numero = COALESCE($3, nota_numero), nota_url = COALESCE($4, nota_url),
            nota_erro = $5, omie_nf_codigo = COALESCE($6, omie_nf_codigo),
            nota_emitida_em = CASE WHEN $2::varchar = 'emitida' AND nota_emitida_em IS NULL THEN now() ELSE nota_emitida_em END
      WHERE id = $1`,
    [orcId, r.status, r.numero, r.url, r.status === "erro" ? (r.erro || "").slice(0, 1000) : null, r.nfCodigo || null]
  );
  console.log(`[nota] orcamento=${orcId} tipo=${orc.nota_tipo || "nfse"} status=${r.status} numero=${r.numero || "-"}`);

  // O boleto pedido junto com a nota sai quando a nota existe: antes disso o
  // Omie ainda não criou os títulos. Falha aqui não derruba a nota — fica
  // registrada no boleto, e o botão "Gerar boletos" tenta de novo.
  if (r.status === "emitida" && orc.boleto_status === "pendente" && emissaoLigada()) {
    try { await gerarBoletos(orcId, { automatico: true }); }
    catch (e) { console.error(`[nota] orcamento=${orcId} boleto automático: ${e.message}`); }
  }
  const { orc: depois } = await _carregar(orcId);
  return _resumoNota(depois);
}

// ── Boleto das parcelas (23/11/2026, migration 101) ─────────────────────────
// ⚠️ GRAVA NO OMIE (GerarBoleto). Acha os títulos que o faturamento criou
// (ListarContasReceber pela data de emissão, casados pelo nCodOS / nCodPedido
// — o mesmo casamento da cobrança) e gera o boleto de cada um que ainda não
// tem. Título que já tem boleto (o Omie pode ter gerado sozinho, ou alguém
// pela tela de lá) só é guardado: nunca se pede duas vezes.
//
// No Bradesco o boleto existe no Omie mas só vale no banco depois da remessa,
// que o Pedro tira no Omie (o sistema não gera remessa — decisão de 23/11).
//
// Trava de 70 s: o Omie recusa a mesma chamada repetida em menos de 60 s
// ("Consumo redundante") e o clique duplo pediria o boleto em dobro.
const _brData = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const _isoDeBr = (s) => { const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

async function gerarBoletos(orcId, { automatico = false } = {}) {
  const { orc } = await _carregar(orcId);
  if (orc.nota_status !== "emitida") throw new NotaErro(409, "O boleto sai depois que a nota é emitida. Use Atualizar na nota antes.");
  if (!orc.omie_os_codigo && !orc.omie_pedido_codigo) throw new NotaErro(409, "A nota deste orçamento não tem OS nem pedido no Omie.");
  if (orc.boleto_status === "gerado") return _resumoNota(orc);
  if (!emissaoLigada()) throw new NotaErro(503, "Geração de boleto desligada neste ambiente (OMIE_EMISSAO). Nada foi enviado.");

  const trava = await pool.query(
    `UPDATE orcamentos SET boleto_atualizado_em = now()
      WHERE id = $1 AND (boleto_atualizado_em IS NULL OR boleto_atualizado_em < now() - interval '70 seconds')
      RETURNING id`,
    [orcId]
  );
  if (!trava.rowCount) {
    if (automatico) return _resumoNota(orc);
    throw new NotaErro(409, "O Omie foi consultado há menos de um minuto. Espere um pouco e tente de novo.");
  }

  const marcar = (status, erro) => pool.query(
    `UPDATE orcamentos SET boleto_status = $2, boleto_erro = $3 WHERE id = $1`, [orcId, status, erro ? String(erro).slice(0, 1000) : null]);

  // Um dia antes da solicitação: a virada da meia-noite não esconde o título.
  const de = _brData(new Date(new Date(orc.nota_solicitada_em || Date.now()).getTime() - 86400000));
  const ate = _brData(Date.now());
  let titulos;
  try {
    titulos = await omie.listarContasReceber({ de, ate });
  } catch (e) {
    await marcar("pendente", `Não consegui ler os títulos no Omie: ${e.message}`);
    throw e instanceof NotaErro || e instanceof omie.OmieErro ? e : new NotaErro(502, e.message);
  }
  const nossos = titulos.filter(t =>
    (orc.omie_os_codigo && String(t.nCodOS || "") === String(orc.omie_os_codigo)) ||
    (orc.omie_pedido_codigo && String(t.nCodPedido || "") === String(orc.omie_pedido_codigo)))
    .filter(t => !["CANCELADO"].includes(String(t.status_titulo || "").toUpperCase()))
    .sort((a, b) => String(a.numero_parcela || "").localeCompare(String(b.numero_parcela || "")));

  if (!nossos.length) {
    await marcar("pendente", "Os títulos da nota ainda não apareceram no Omie. Tente de novo em alguns minutos.");
    console.log(`[nota] orcamento=${orcId} boleto: títulos ainda não apareceram`);
    const { orc: o2 } = await _carregar(orcId);
    return _resumoNota(o2);
  }

  const guardar = (t, { gerado, nosso, erro }) => pool.query(
    `INSERT INTO orcamento_boletos (omie_titulo, orcamento_id, parcela, vencimento, valor, conta_corrente, nosso_numero, gerado, erro, gerado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::boolean, $9, CASE WHEN $8::boolean THEN now() END)
     ON CONFLICT (omie_titulo) DO UPDATE SET
       parcela = EXCLUDED.parcela, vencimento = EXCLUDED.vencimento, valor = EXCLUDED.valor,
       conta_corrente = EXCLUDED.conta_corrente, nosso_numero = COALESCE(EXCLUDED.nosso_numero, orcamento_boletos.nosso_numero),
       gerado = orcamento_boletos.gerado OR EXCLUDED.gerado, erro = EXCLUDED.erro,
       gerado_em = COALESCE(orcamento_boletos.gerado_em, EXCLUDED.gerado_em), atualizado_em = now()`,
    [t.codigo_lancamento_omie, orcId, t.numero_parcela || null, _isoDeBr(t.data_vencimento), t.valor_documento ?? null,
     t.id_conta_corrente || null, nosso || null, !!gerado, erro ? String(erro).slice(0, 500) : null]);

  // O que este sistema já gerou vale mesmo que a listagem do Omie ainda não
  // mostre o boleto: nunca pedir duas vezes o mesmo título.
  const jaGerados = new Map((orc._boletos || []).filter(b => b.gerado).map(b => [String(b.omie_titulo), b.nosso_numero]));
  const falhas = [];
  for (const t of nossos) {
    const jaTem = t.boleto?.cGerado === "S" || !!t.boleto?.cNumBancario;
    if (jaTem) { await guardar(t, { gerado: true, nosso: t.boleto.cNumBancario || t.boleto.cNumBoleto }); continue; }
    if (jaGerados.has(String(t.codigo_lancamento_omie))) { await guardar(t, { gerado: true, nosso: jaGerados.get(String(t.codigo_lancamento_omie)) }); continue; }
    if (String(t.status_titulo || "").toUpperCase() === "RECEBIDO") { await guardar(t, { gerado: false, erro: "Título já recebido: sem boleto." }); continue; }
    try {
      const b = await omie.gerarBoleto(Number(t.codigo_lancamento_omie));
      await guardar(t, { gerado: true, nosso: b.cNumBancario || b.cNumBoleto || null });
      console.log(`[nota] orcamento=${orcId} boleto gerado titulo=${t.codigo_lancamento_omie} nosso=${b.cNumBancario || "-"}`);
    } catch (e) {
      // Sem resposta, o boleto pode ter saído: a próxima volta lê o título e,
      // se ele já tiver boleto, só guarda. Recusa fica com o motivo do Omie.
      const msg = e.status === 504 ? "O Omie não respondeu — o boleto pode ter saído; a próxima tentativa confere antes." : `O Omie recusou: ${e.message}`;
      await guardar(t, { gerado: false, erro: msg });
      falhas.push(`parcela ${t.numero_parcela || t.codigo_lancamento_omie}: ${msg}`);
      console.error(`[nota] orcamento=${orcId} boleto FALHA titulo=${t.codigo_lancamento_omie}: ${e.message}`);
    }
  }
  await marcar(falhas.length ? "erro" : "gerado", falhas.length ? falhas.join(" · ") : null);
  const { orc: depois } = await _carregar(orcId);
  return _resumoNota(depois);
}

// O PDF do boleto de uma parcela (ObterBoleto; o link vale 24 h, então não
// se guarda). Só leitura no Omie.
async function linkBoleto(orcId, omieTitulo) {
  const r = await pool.query(`SELECT gerado FROM orcamento_boletos WHERE orcamento_id = $1 AND omie_titulo = $2`, [orcId, omieTitulo]);
  if (!r.rowCount) throw new NotaErro(404, "Esta parcela não é deste orçamento.");
  const b = await omie.obterBoleto(Number(omieTitulo));
  if (!b || !b.cLinkBoleto) throw new NotaErro(404, "O Omie não devolveu o link do boleto desta parcela.");
  return { link: b.cLinkBoleto };
}

async function _lerNfse(orc) {
  const st = await omie.statusOs(Number(orc.omie_os_codigo));
  const rps = (st.ListaRpsNfse || [])[0] || {};
  const numero = rps.nNfse ? String(Number(rps.nNfse)) : null;
  const msgs = (rps.mensagens || []).map(m => m.cMensagem || m.mensagem || JSON.stringify(m)).filter(Boolean).join(" · ");
  let status = "processando";
  if (st.cCancelada === "S") status = "cancelada";
  else if (st.cFaturada === "S" && numero) status = "emitida";
  else if (msgs && !numero) status = "erro";
  return { status, numero, url: rps.cUrlNfse || null, erro: msgs };
}

// DANFE: a NF-e existe depois que o faturamento gera a nota. Antes disso o
// ConsultarNF responde "NF não cadastrada para o pedido" → processando.
// Com a nota, ObterNfe dá o PDF; `cCodStatus` "0" = documentos gerados
// (lido em 18/11/2026 na NF 794 do pedido 879).
async function _lerDanfe(orc) {
  const nf = await omie.nfPorPedido(Number(orc.omie_pedido_codigo));
  if (!nf) return { status: "processando", numero: null, url: null };
  const ide = nf.ide || {};
  const numero = ide.nNF ? String(Number(ide.nNF)) : null;
  const nfCodigo = nf.compl?.nIdNF || null;
  if (ide.dCan) return { status: "cancelada", numero, url: null, nfCodigo };
  if (ide.cDeneg === "S") return { status: "erro", numero, url: null, nfCodigo, erro: "NF-e denegada pela SEFAZ — confira no Omie." };
  let url = null;
  let status = "processando";
  if (nfCodigo) {
    try {
      const docs = await omie.documentosNfe(Number(nfCodigo));
      url = docs.cPdf || docs.cLinkPortal || null;
      if (String(docs.cCodStatus) === "0" && numero) status = "emitida";
    } catch (e) {
      // Sem os documentos ainda: a nota existe mas a SEFAZ não devolveu. Fica
      // processando e o Atualizar tenta de novo.
      console.error(`[nota] orcamento=${orc.id} ObterNfe: ${e.message}`);
    }
  }
  return { status, numero, url, nfCodigo };
}

module.exports = {
  NotaErro,
  MOLDE_NFSE,
  MOLDE_NFE,
  emissaoLigada,
  sugerirNatureza,
  linhasCobraveis,
  ratear,
  ratearNfe,
  parcelasDoTexto,
  vencimentosPadrao,
  montarPagamento,
  montarOs,
  montarPedido,
  preparar,
  emitir,
  atualizar,
  gerarBoletos,
  linkBoleto,
  BANCOS,
  _conferir,
  _separarEndereco,
};
