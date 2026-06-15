// Geração de PDF de Contrato de Prestação de Serviços
// HTML+CSS → Puppeteer → Buffer (enviado ao ZapSign ou download direto)
// Visual: mesmo papel timbrado dos orçamentos (papel-timbrado.png)
// Tipos suportados: 'bombas' | 'piscina'

const fs   = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { pool } = require("../db");

const PUBLIC_ROOT = path.join(__dirname, "../../public");

const PUPPETEER_ARGS = [
  "--no-sandbox", "--disable-setuid-sandbox",
  "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote",
];

let _browser = null;
async function getBrowser() {
  if (_browser) {
    try { await _browser.version(); return _browser; } catch { _browser = null; }
  }
  _browser = await puppeteer.launch({ args: PUPPETEER_ARGS, headless: true });
  return _browser;
}

function escHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function fmtBR(iso) {
  if (!iso) return "___/___/______";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day:"2-digit", month:"2-digit", year:"numeric" });
}

function fmtMoeda(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timbradoBase64() {
  try {
    const buf = fs.readFileSync(path.join(PUBLIC_ROOT, "papel-timbrado.png"));
    return "data:image/png;base64," + buf.toString("base64");
  } catch { return null; }
}

async function buscarDados(contratoId) {
  const r = await pool.query(
    `SELECT ct.*,
            COALESCE(c.nome_fantasia, c.nome) AS cliente_nome,
            c.cnpj     AS cliente_cnpj,
            c.endereco AS cliente_endereco,
            c.bairro   AS cliente_bairro,
            c.cidade   AS cliente_cidade,
            c.cep      AS cliente_cep
     FROM contratos ct
     JOIN condominios c ON c.id = ct.condominio_id
     WHERE ct.id = $1`,
    [contratoId]
  );
  if (!r.rows.length) throw new Error("Contrato não encontrado");
  return r.rows[0];
}

// ─── Cláusulas por tipo ──────────────────────────────────────────────────────

function clausulasBombas(ct) {
  const qtd = ct.qtd_bombas;
  const qtdStr = qtd ? `${qtd} (${_numExtenso(qtd)}) ` : "";
  const descServ = escHtml(
    ct.descricao_servico ||
    `Manutenção preventiva e corretiva das ${qtdStr}motobombas hidráulicas e seus sistemas de automatização e abastecimento.`
  );
  const formaStr = _formaStr(ct.forma_pagamento);
  const diaVenc  = ct.dia_vencimento ? `todo dia ${ct.dia_vencimento}` : "a combinar";
  const valorMensal = fmtMoeda(ct.valor_mensal);
  const fimEm    = ct.fim_em ? fmtBR(ct.fim_em) : "indeterminado";

  return `
<div class="clausula">
  <div class="clausula-titulo">Cláusula Primeira – Objeto do Contrato</div>
  <p><strong>1.1</strong> – Prestar serviços de manutenção preventiva e corretiva com mão de obra especializada ao "CONTRATANTE", no que tange à conservação das ${qtdStr}motobombas hidráulicas e seus sistemas de automatizações e abastecimentos.</p>
  <p><strong>1.2</strong> – ${descServ}</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Segunda – Obrigações e Responsabilidades da CONTRATADA</div>
  <p><strong>2.1</strong> – Realizar visitas mensais, preferencialmente na primeira quinzena de cada mês, para verificações, revisões e testes nas casas de bombas.</p>
  <p><strong>2.1.1</strong> – Quando houver qualquer anormalidade no funcionamento, deverão ser acionados chamados emergenciais para verificação mais detalhada.</p>
  <p><strong>2.1.2</strong> – Os atendimentos emergenciais (24 horas) deverão ser realizados dentro de 3 (três) horas, salvo por motivo de força maior, devendo ser avisado via telefone.</p>
  <p><strong>2.1.3</strong> – Os acionamentos deverão ser feitos pelos telefones <strong>(11) 2038-8679</strong> (horário comercial) ou de plantão <strong>(11) 9 6653-6110</strong>, sem custo para o CONTRATANTE.</p>
  <p><strong>2.1.4</strong> – <strong>Os serviços descritos neste contrato não abrangem cobertura de peças. Em casos de queima de equipamento, a reposição e reparo são de responsabilidade do CONTRATANTE, com custo adicional, mediante orçamento prévio e aprovação.</strong></p>
  <p><strong>2.2</strong> – Eventuais problemas detectados durante a vistoria técnica mensal serão prontamente sanados (os possíveis), executando limpezas e ajustes para o bom funcionamento dos equipamentos.</p>
  <p><strong>2.3</strong> – Fornecer orientações quanto à melhor operação das bombas reservas, visando o pleno uso e prevenção de defeitos.</p>
  <p><strong>2.4</strong> – Garantir abastecimento de água ou drenagem ao condomínio com empréstimos por até 03 dias, quando necessário.</p>
  <p><strong>2.5</strong> – Às motobombas que apresentarem desgaste natural ou falta de peças, será emitido orçamento de novos equipamentos, e a compra/ajuste somente será realizada após aprovação do CONTRATANTE.</p>
  <p><strong>2.6</strong> – Caberá à CONTRATADA indenizar o CONTRATANTE e/ou terceiros por danos causados por si ou por seus prepostos que estiverem sob sua responsabilidade.</p>
  <p><strong>2.7</strong> – Manter sempre preços compatíveis ao mercado e flexibilidade nos pagamentos.</p>
  <p><strong>2.8</strong> – Diligenciar e supervisionar seus funcionários para evitar danos ao CONTRATANTE, substituindo aquele que entender mais adequado.</p>
  <p><strong>2.9</strong> – Arcar com todos os tributos e encargos que incidam sobre os serviços, inclusive os trabalhistas, sociais, securitários e previdenciários.</p>
  <p><strong>2.10</strong> – Não emitir, sacar nem negociar títulos de crédito decorrentes de eventuais créditos contra o CONTRATANTE.</p>
  <p><strong>2.11</strong> – Na eventualidade do CONTRATANTE ser condenado ao pagamento de indenização relativa aos funcionários da CONTRATADA, esta deverá ressarcir todos os valores em até 48 horas, sob pena de multa de 2%, juros de 1% ao mês e correção monetária.</p>
  <p><strong>2.12</strong> – A CONTRATADA não poderá ceder ou transferir as obrigações pactuadas, salvo anuência expressa do CONTRATANTE.</p>
  <p><strong>2.13</strong> – Fornecer todos os EPIs e EPCs aos seus empregados.</p>
  <p><strong>2.14</strong> – Corrigir, às suas expensas, qualquer vício ou defeito nos serviços prestados, desmanchando e refazendo quantas vezes forem necessárias.</p>
  <p><strong>2.15</strong> – Todos os profissionais deverão executar os serviços devidamente uniformizados e portando identificação fornecida pela CONTRATADA.</p>
  <p><strong>2.16</strong> – Responsabilizar-se pelo fornecimento de equipamentos e ferramentas necessários à execução dos serviços.</p>
  <p><strong>2.17</strong> – Manter à disposição do CONTRATANTE dados sobre as visitas realizadas e problemas encontrados por meio de Ordens de Serviço e relatórios mensais.</p>
  <p><strong>2.18</strong> – Utilizar peças de reposição novas e originais, ou de fabricantes conhecidos e de boa qualidade técnica, desde que haja anuência do CONTRATANTE, em conformidade com as Normas Técnicas (ABNT).</p>
  <p><strong>2.19</strong> – Indicar preposto e/ou responsável técnico pela execução dos serviços, cumprindo as disposições do Regimento Interno do CONTRATANTE durante a vigência do contrato.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Terceira – Obrigações e Responsabilidades do CONTRATANTE</div>
  <p><strong>3.1</strong> – Manter os pagamentos das faturas em dia, tanto as de conservação mensal quanto as dos orçamentos/serviços executados devidamente autorizados.</p>
  <p><strong>3.2</strong> – Dar a necessária atenção às solicitações e orçamentos emitidos pela CONTRATADA, a fim de sanar o mais breve possível qualquer problema detectado.</p>
  <p><strong>3.3</strong> – Poderá destinar um responsável para acompanhar os técnicos da CONTRATADA, para tomar ciência antecipada dos problemas e soluções desenvolvidas nos atendimentos.</p>
  <p class="paragrafo-unico">Parágrafo Único: O CONTRATANTE não terá qualquer responsabilidade sobre a guarda de materiais e equipamentos da CONTRATADA, não sendo obrigado a indenizá-la por eventuais danos, roubos ou furtos.</p>
  <p><strong>3.4</strong> – O contrato não cobre as peças relacionadas ao complexo de Bombas. <strong>Todos os itens que não sejam mecanismo/maquinário das bombas serão orçados com prévio aviso e consentimento do condomínio.</strong></p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Quarta – Exclusões de Cobertura</div>
  <p><strong>4.1</strong> – Incêndio: rede, válvulas, hidrantes, botoeiras, mangueiras, sistema elétrico e teste da rede de incêndio.</p>
  <p><strong>4.2</strong> – Reservatórios de água inferiores e superiores, seus pontos de escoamento, na ocorrência de falha ou defeito de qualquer natureza.</p>
  <p><strong>4.3</strong> – Pontos de escoamento de água nos barriletes, casa das bombas, terraço e local onde se encontram as bombas de pressurização e incêndio, em casos de vazamentos.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Quinta – Valor e Formas de Pagamento</div>
  <p>O valor mensal do contrato é de <strong>${valorMensal}</strong>, com pagamento ${diaVenc} de cada mês.</p>
  <p><strong>5.1</strong> – Os pagamentos deverão ser efetuados através de <strong>${formaStr}</strong>, com pelo menos 10 dias de antecedência.</p>
  <p><strong>5.2</strong> – No atraso do pagamento, sem motivo justificado, será devida multa moratória de <strong>2% (dois por cento)</strong> e juros de <strong>1% (um por cento) ao mês</strong>.</p>
  <p><strong>5.3</strong> – O valor deverá ser pago somente após a entrega da nota fiscal, com todos os impostos, taxas e encargos recolhidos.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Sexta – Reajuste e Vigência</div>
  <p><strong>6.1</strong> – O prazo de vigência deste contrato é de <strong>12 (doze) meses</strong>, com início em <strong>${fmtBR(ct.inicio_em)}</strong> e término em <strong>${fimEm}</strong>, podendo ser prorrogado por igual período mediante termo aditivo, caso o CONTRATANTE não se manifeste de forma contrária no prazo de 30 (trinta) dias antes da data final.</p>
  <p><strong>6.2</strong> – Os valores serão reajustados anualmente pelo <strong>IPCA</strong>, acumulado do período.</p>
  <p><strong>6.3</strong> – Caso os valores estejam defasados em relação ao mercado, a CONTRATADA poderá propor readequação, a ser efetivada somente mediante anuência do CONTRATANTE após negociação.</p>
</div>`;
}

function clausulasPiscina(ct) {
  const descServ = escHtml(
    ct.descricao_servico ||
    "Manutenção preventiva e corretiva da(s) piscina(s), compreendendo tratamento químico da água, limpeza (aspiração, escovação e retirada de detritos), verificação e manutenção dos equipamentos hidráulicos (bombas, filtros e acessórios) e controle do nível da água."
  );
  const formaStr = _formaStr(ct.forma_pagamento);
  const diaVenc  = ct.dia_vencimento ? `todo dia ${ct.dia_vencimento}` : "a combinar";
  const valorMensal = fmtMoeda(ct.valor_mensal);
  const fimEm    = ct.fim_em ? fmtBR(ct.fim_em) : "indeterminado";

  return `
<div class="clausula">
  <div class="clausula-titulo">Cláusula Primeira – Objeto do Contrato</div>
  <p><strong>1.1</strong> – Prestar serviços de manutenção preventiva e corretiva com mão de obra especializada ao "CONTRATANTE", no que tange à conservação e tratamento da(s) piscina(s) do CONTRATANTE.</p>
  <p><strong>1.2</strong> – ${descServ}</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Segunda – Obrigações e Responsabilidades da CONTRATADA</div>
  <p><strong>2.1</strong> – Realizar visitas periódicas conforme frequência acordada entre as partes, para verificação e correção dos parâmetros da água (pH, cloro livre, alcalinidade, dureza e turbidez), limpeza da piscina e vistoria dos equipamentos.</p>
  <p><strong>2.1.1</strong> – Cada visita compreenderá: análise e correção química da água; aspiração do fundo; escovação das paredes e borda; retirada de detritos da superfície; verificação e limpeza do pré-filtro da bomba; limpeza ou retrolavagem do filtro quando necessário.</p>
  <p><strong>2.1.2</strong> – Quando houver qualquer anormalidade no funcionamento dos equipamentos ou na qualidade da água, será acionado chamado emergencial para verificação mais detalhada.</p>
  <p><strong>2.1.3</strong> – Os atendimentos emergenciais deverão ser realizados dentro de 24 (vinte e quatro) horas úteis, salvo motivo de força maior, devendo ser avisado via telefone.</p>
  <p><strong>2.1.4</strong> – Os acionamentos deverão ser feitos pelos telefones <strong>(11) 2038-8679</strong> (horário comercial) ou de plantão <strong>(11) 9 6653-6110</strong>, sem custo para o CONTRATANTE.</p>
  <p><strong>2.1.5</strong> – <strong>Os serviços descritos neste contrato não abrangem cobertura de peças ou produtos químicos. A reposição de equipamentos e o fornecimento de insumos são de responsabilidade do CONTRATANTE, com custo adicional, mediante orçamento prévio e aprovação.</strong></p>
  <p><strong>2.2</strong> – Fornecer orientações quanto à melhor operação e conservação da piscina nos períodos entre as visitas.</p>
  <p><strong>2.3</strong> – Emitir relatório de vistoria após cada visita, registrando os parâmetros medidos e os serviços executados.</p>
  <p><strong>2.4</strong> – Caberá à CONTRATADA indenizar o CONTRATANTE e/ou terceiros por danos causados por si ou por seus prepostos que estiverem sob sua responsabilidade.</p>
  <p><strong>2.5</strong> – Manter sempre preços compatíveis ao mercado e flexibilidade nos pagamentos.</p>
  <p><strong>2.6</strong> – Diligenciar e supervisionar seus funcionários para evitar danos ao CONTRATANTE, substituindo aquele que entender mais adequado.</p>
  <p><strong>2.7</strong> – Arcar com todos os tributos e encargos que incidam sobre os serviços, inclusive os trabalhistas, sociais, securitários e previdenciários.</p>
  <p><strong>2.8</strong> – A CONTRATADA não poderá ceder ou transferir as obrigações pactuadas, salvo anuência expressa do CONTRATANTE.</p>
  <p><strong>2.9</strong> – Fornecer todos os EPIs e EPCs aos seus empregados.</p>
  <p><strong>2.10</strong> – Todos os profissionais deverão executar os serviços devidamente uniformizados e portando identificação fornecida pela CONTRATADA.</p>
  <p><strong>2.11</strong> – Indicar preposto e/ou responsável técnico pela execução dos serviços, cumprindo as disposições do Regimento Interno do CONTRATANTE durante a vigência do contrato.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Terceira – Obrigações e Responsabilidades do CONTRATANTE</div>
  <p><strong>3.1</strong> – Manter os pagamentos das faturas em dia, tanto as de manutenção periódica quanto as dos orçamentos/serviços executados devidamente autorizados.</p>
  <p><strong>3.2</strong> – Garantir acesso à(s) piscina(s) e casa de máquinas nas datas e horários previamente agendados.</p>
  <p><strong>3.3</strong> – Comunicar à CONTRATADA, com a maior brevidade possível, qualquer anormalidade observada na piscina ou nos equipamentos entre as visitas programadas.</p>
  <p><strong>3.4</strong> – Dar a necessária atenção às solicitações e orçamentos emitidos pela CONTRATADA, a fim de sanar o mais breve possível qualquer problema detectado.</p>
  <p class="paragrafo-unico">Parágrafo Único: O CONTRATANTE não terá qualquer responsabilidade sobre a guarda de materiais e equipamentos da CONTRATADA, não sendo obrigado a indenizá-la por eventuais danos, roubos ou furtos.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Quarta – Exclusões de Cobertura</div>
  <p><strong>4.1</strong> – Reforma, impermeabilização ou revestimento da piscina (azulejos, pastilhas, pintura).</p>
  <p><strong>4.2</strong> – Substituição de equipamentos (bombas, filtros, aquecedores, quadros elétricos) — estes serão orçados à parte e executados somente após aprovação do CONTRATANTE.</p>
  <p><strong>4.3</strong> – Fornecimento de produtos químicos (cloro, pH menos, algicida, floculante etc.) — itens de consumo são de responsabilidade do CONTRATANTE.</p>
  <p><strong>4.4</strong> – Recuperação de água fortemente contaminada por algas ou turbidez decorrente de período prolongado sem manutenção; nesses casos, será emitido orçamento específico.</p>
  <p><strong>4.5</strong> – Redes hidráulicas de interligação externas à piscina, casa de máquinas e barriletes.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Quinta – Valor e Formas de Pagamento</div>
  <p>O valor mensal do contrato é de <strong>${valorMensal}</strong>, com pagamento ${diaVenc} de cada mês.</p>
  <p><strong>5.1</strong> – Os pagamentos deverão ser efetuados através de <strong>${formaStr}</strong>, com pelo menos 10 dias de antecedência.</p>
  <p><strong>5.2</strong> – No atraso do pagamento, sem motivo justificado, será devida multa moratória de <strong>2% (dois por cento)</strong> e juros de <strong>1% (um por cento) ao mês</strong>.</p>
  <p><strong>5.3</strong> – O valor deverá ser pago somente após a entrega da nota fiscal, com todos os impostos, taxas e encargos recolhidos.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Sexta – Reajuste e Vigência</div>
  <p><strong>6.1</strong> – O prazo de vigência deste contrato é de <strong>12 (doze) meses</strong>, com início em <strong>${fmtBR(ct.inicio_em)}</strong> e término em <strong>${fimEm}</strong>, podendo ser prorrogado por igual período mediante termo aditivo, caso o CONTRATANTE não se manifeste de forma contrária no prazo de 30 (trinta) dias antes da data final.</p>
  <p><strong>6.2</strong> – Os valores serão reajustados anualmente pelo <strong>IPCA</strong>, acumulado do período.</p>
  <p><strong>6.3</strong> – Caso os valores estejam defasados em relação ao mercado, a CONTRATADA poderá propor readequação, a ser efetivada somente mediante anuência do CONTRATANTE após negociação.</p>
</div>`;
}

// Cláusulas comuns (Rescisão, Tolerância, Disposições Gerais, Penalidades, Foro)
function clausulasComuns(ct) {
  const valorAnual = ct.valor_mensal ? fmtMoeda(Number(ct.valor_mensal) * 12) : "—";
  return `
<div class="clausula">
  <div class="clausula-titulo">Cláusula Sétima – Rescisão</div>
  <p><strong>7.1</strong> – Este contrato poderá ser rescindido por qualquer das partes mediante solicitação por escrito, com antecedência mínima de <strong>30 (trinta) dias</strong>, sem ônus para as partes, sem prejuízo da prestação dos serviços pela CONTRATADA e do pagamento proporcional pela CONTRATANTE durante o aviso prévio.</p>
  <p><strong>7.2</strong> – Será considerada rescisão motivada, entre outros, os seguintes casos:</p>
  <ul>
    <li>Transferência ou cessão dos serviços pela CONTRATADA sem prévia concordância por escrito do CONTRATANTE;</li>
    <li>Falência, liquidação judicial ou extrajudicial ou recuperação judicial;</li>
    <li>Interrupção injustificada dos serviços por período superior a 10 (dez) dias corridos;</li>
    <li>Negligência na execução dos serviços;</li>
    <li>Utilização de material diferente do especificado em orçamento ou pela legislação vigente;</li>
    <li>Falta de recolhimento de encargos fiscais, tributários, previdenciários ou atraso no pagamento de funcionários.</li>
  </ul>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Oitava – Tolerância</div>
  <p><strong>8.1</strong> – O descumprimento de qualquer condição pactuada e não sanado no prazo concedido implicará em rescisão contratual, sem prévio aviso. A tolerância das partes sobre eventual descumprimento não implicará aceitação, novação ou renúncia de direitos, mas mera liberalidade da parte prejudicada.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Nona – Disposições Gerais</div>
  <p><strong>9.1</strong> – Não se estabelecerá, por força deste Contrato, qualquer vínculo empregatício de responsabilidade do CONTRATANTE com relação ao pessoal empregado pela CONTRATADA.</p>
  <p><strong>9.2</strong> – Todos os profissionais deverão ser devidamente registrados pela CONTRATADA, a qual recolherá todos os impostos, tributos e encargos trabalhistas, securitários e previdenciários.</p>
  <p><strong>9.3</strong> – A CONTRATADA substituirá imediatamente profissionais cuja habilitação, conduta ou experiência sejam julgadas inadequadas pelo CONTRATANTE.</p>
  <p><strong>9.4</strong> – A CONTRATADA não poderá utilizar funcionários do CONTRATANTE para a execução dos serviços.</p>
  <p><strong>9.5</strong> – As disposições deste contrato poderão ser alteradas apenas mediante celebração de termo aditivo.</p>
  <p><strong>9.6</strong> – A CONTRATADA declara estar devidamente habilitada, legal e tecnicamente, a firmar e executar o presente contrato.</p>
  <p><strong>9.7</strong> – As partes declaram que cumprirão integralmente a <strong>Lei Geral de Proteção de Dados (LGPD – Lei Federal nº 13.709/2018)</strong> e todas as demais leis e regulamentos aplicáveis ao tratamento de dados pessoais.</p>
  <p><strong>9.8</strong> – O presente instrumento constitui a integralidade dos entendimentos entre as Partes sobre os assuntos aqui previstos, revogando todo e qualquer ajuste, acordo ou correspondência anterior.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Décima – Das Penalidades</div>
  <p><strong>10.1</strong> – O descumprimento de quaisquer cláusulas contratuais acarretará multa equivalente a <strong>2% (dois por cento) do valor anual do contrato</strong> (${valorAnual}), se a parte infratora, após notificada, não adimplir com sua obrigação em 10 (dez) dias, sem prejuízo de eventual indenização por perdas e danos.</p>
  <p><strong>10.2</strong> – As multas têm caráter moratório e não compensatório, não eximindo a parte infratora da reparação de eventuais danos.</p>
</div>

<div class="clausula">
  <div class="clausula-titulo">Cláusula Décima Primeira – Foro</div>
  <p><strong>11.1</strong> – Para dirimir eventuais dúvidas decorrentes deste contrato, fica eleito o <strong>Foro da Comarca da Capital do Estado de São Paulo</strong>, com exclusão de qualquer outro, por mais privilegiado que seja.</p>
</div>`;
}

function _formaStr(forma) {
  return { boleto:"boleto bancário", pix:"PIX", transferencia:"transferência bancária", cartao:"cartão", outro:"a definir" }[forma] || "a definir";
}

function _numExtenso(n) {
  const ex = ["","uma","duas","três","quatro","cinco","seis","sete","oito","nove","dez",
               "onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte"];
  return ex[n] || String(n);
}

// ─── Renderização principal ──────────────────────────────────────────────────

function renderHTML(ct) {
  const timbrado = timbradoBase64();
  const timbradoTag = timbrado
    ? `<div class="timbrado-bg" style="background-image:url('${timbrado}');"></div>`
    : "";

  const tipo     = ct.servico_tipo || "bombas";
  const numero   = escHtml(ct.numero || String(ct.id));
  const dataDoc  = fmtBR(ct.inicio_em || ct.criado_em);
  const sigNome  = escHtml(ct.signatario_nome || "");
  const geralNome = escHtml(ct.signatario_geral_nome || "Ana Paula Martins Lima");

  const endParts = [ct.cliente_endereco, ct.cliente_bairro, ct.cliente_cidade, ct.cliente_cep ? `CEP: ${ct.cliente_cep}` : ""].filter(Boolean);
  const endStr   = endParts.join(", ");

  const clausulasEspecificas = tipo === "piscina" ? clausulasPiscina(ct) : clausulasBombas(ct);
  const tipoLabel = tipo === "piscina" ? "Piscina" : "Motobombas Hidráulicas";

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>Contrato ${numero}</title>
<style>
* { box-sizing:border-box; }
html, body { margin:0; padding:0; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1.55;
  color: #1a1f2e;
}
/* Mesmo padrão do orçamento: fixed cobre a página física inteira em todas as páginas.
   Margens por página vêm do parâmetro margin do Puppeteer (não de body padding ou @page). */
.timbrado-bg {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: -1;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: top left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Título do documento */
.doc-titulo {
  text-align: center;
  margin-bottom: 16px;
}
.doc-titulo h1 {
  margin: 0;
  font-size: 13px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #1a1f2e;
}
.doc-titulo .doc-sub {
  font-size: 10px;
  color: #6b7280;
  margin-top: 4px;
}

/* Intro */
.intro {
  text-align: justify;
  margin-bottom: 16px;
  font-size: 11px;
  line-height: 1.6;
}

/* Caixa de dados do cliente */
.partes-box {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 18px;
  background: rgba(248,250,252,0.92);
}
.partes-title {
  font-size: 9.5px;
  font-weight: bold;
  color: #1e3a5f;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1.5px solid #f0b014;
}
.partes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 20px;
}
.partes-row { font-size: 10.5px; }
.partes-key { color: #4a5568; font-weight: bold; font-size: 9.5px; }
.partes-val { color: #1a1f2e; }
.partes-full { grid-column: 1 / -1; }

/* Cláusulas — sem page-break-inside para não deixar buracos */
.clausula { margin-bottom: 14px; }
.clausula-titulo {
  font-size: 11px;
  font-weight: bold;
  color: #1a1f2e;
  margin-bottom: 6px;
  text-decoration: underline;
  /* título não fica órfão no fim da página */
  page-break-after: avoid;
}
.clausula p {
  margin: 0 0 5px 0;
  text-align: justify;
}
.clausula ul {
  margin: 4px 0 4px 20px;
  padding: 0;
}
.clausula ul li { margin-bottom: 3px; }
.paragrafo-unico { font-weight: bold; margin-top: 4px; }

/* Página de assinaturas */
.assinaturas-page {
  page-break-before: always;
  padding-top: 10mm;
  text-align: center;
}
.assinaturas-intro {
  font-size: 11px;
  text-align: justify;
  margin-bottom: 60px;
}
.assinaturas-grid {
  display: flex;
  justify-content: space-around;
  gap: 40px;
  margin-top: 30px;
}
.assinatura-bloco { flex: 1; text-align: center; }
.assinatura-linha {
  border-top: 1px solid #1a1f2e;
  margin: 0 10px 8px 10px;
  padding-top: 6px;
}
.assinatura-nome { font-size: 10.5px; font-weight: bold; color: #1a1f2e; }
.assinatura-papel { font-size: 9.5px; color: #4a5568; margin-top: 2px; }
.data-local { margin-top: 40px; font-size: 10.5px; color: #4a5568; text-align: right; }
</style>
</head>
<body>

${timbradoTag}

<div class="doc-titulo">
  <h1>Contrato de Prestação de Serviços</h1>
  <div class="doc-sub">Nº ${numero} &nbsp;·&nbsp; ${tipoLabel} &nbsp;·&nbsp; São Paulo, ${dataDoc}</div>
</div>

<p class="intro">
  Pelo presente Contrato de Prestação de Serviços de Manutenção, de um lado a
  <strong>GENERAL BOMBAS, ENGENHARIA DA MANUTENÇÃO E SERVIÇOS LTDA.</strong>, firma sediada na
  R. Serra de Botucatu, 1268, Vila Gomes Cardim, CEP 03317-001 – São Paulo/SP,
  telefone (11) 2038-8679, CNPJ 26.427.361/0001-02,
  e-mail <strong>comercial@generalbombas.com.br</strong>,
  neste ato representada por <strong>${geralNome}</strong>,
  doravante denominada simplesmente <strong>"CONTRATADA"</strong>,
  e de outro lado o <strong>CONTRATANTE</strong> abaixo qualificado, têm entre si justo e
  contratado o seguinte:
</p>

<div class="partes-box">
  <div class="partes-title">Dados do Contratante</div>
  <div class="partes-grid">
    <div class="partes-row partes-full">
      <span class="partes-key">Cliente: </span>
      <span class="partes-val">${escHtml(ct.cliente_nome)}</span>
    </div>
    ${ct.cliente_cnpj ? `<div class="partes-row"><span class="partes-key">CNPJ: </span><span class="partes-val">${escHtml(ct.cliente_cnpj)}</span></div>` : ""}
    ${ct.cliente_cidade ? `<div class="partes-row"><span class="partes-key">Cidade: </span><span class="partes-val">${escHtml(ct.cliente_cidade)}</span></div>` : ""}
    ${endStr ? `<div class="partes-row partes-full"><span class="partes-key">Endereço: </span><span class="partes-val">${escHtml(endStr)}</span></div>` : ""}
  </div>
</div>

${clausulasEspecificas}
${clausulasComuns(ct)}

<div class="assinaturas-page">
  <p class="assinaturas-intro">
    E, por estarem assim ajustadas e contratadas, as partes assinam o presente instrumento
    em 02 (duas) vias de igual teor e forma, para um mesmo fim, para que produza os devidos efeitos legais.
  </p>

  <div class="assinaturas-grid">
    <div class="assinatura-bloco">
      <br><br><br><br>
      <div class="assinatura-linha"></div>
      <div class="assinatura-nome">${escHtml(ct.cliente_nome)}</div>
      <div class="assinatura-papel">CONTRATANTE</div>
      ${sigNome ? `<div class="assinatura-papel">${sigNome}</div>` : ""}
    </div>
    <div class="assinatura-bloco">
      <br><br><br><br>
      <div class="assinatura-linha"></div>
      <div class="assinatura-nome">GENERAL BOMBAS, ENGENHARIA DA MANUTENÇÃO E SERVIÇOS LTDA.</div>
      <div class="assinatura-papel">CONTRATADA</div>
      <div class="assinatura-papel">${geralNome}</div>
    </div>
  </div>

  <div class="data-local">São Paulo, ${dataDoc}</div>
</div>

</body></html>`;
}

async function gerarPdfBuffer(contratoId) {
  const ct  = await buscarDados(contratoId);
  const html = renderHTML(ct);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "42mm", right: "22mm", bottom: "22mm", left: "22mm" },
      displayHeaderFooter: false,
    });
    return { buf: Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf), ct };
  } finally {
    await page.close();
  }
}

module.exports = { gerarPdfBuffer };
