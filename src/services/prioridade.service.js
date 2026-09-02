// src/services/prioridade.service.js
//
// A regra de classificação P1-P4, escrita a partir da CLÁUSULA 7 da minuta de
// contrato. Fonte única: antes desta data a mesma tabela existia em
// `src/routes/cliente.routes.js`, em `app/public/app.js` e, em prosa, dentro
// do prompt da IA — três cópias que já discordavam entre si.
//
// ⚠️ O QUE A MINUTA CLASSIFICA É IMPACTO, NÃO TIPO DE PROBLEMA. É o ponto que
// muda o desenho inteiro:
//
//   P1  risco imediato de desabastecimento relevante; poço/área crítica com
//       risco de inundação; falha crítica de sistema essencial      → 3h
//   P2  falha relevante, MAS com condição provisória, redundância
//       parcial ou sem risco imediato                               → 48h
//   P3  anomalia sem risco imediato; equipamento reserva indisponível
//       sem perda da função principal; corretiva não crítica        → 72h
//   P4  melhorias, levantamentos, adequações, solicitações estéticas
//       ou serviços que dependam de planejamento/orçamento          → agendamento
//
// Um "vazamento" pode ser P1 (alagando a casa de bombas) ou P3 (gotejando numa
// gaxeta com a bomba reserva rodando). Por isso a categoria sozinha NÃO
// classifica: quem classifica são as duas perguntas de triagem abaixo, e a
// categoria só entra como piso conservador quando ninguém respondeu.
//
// ⚠️ E NÃO É TRAVA, É PISO. A própria minuta manda deixar reclassificar —
// 7.1.c: "a prioridade poderá ser reclassificada tecnicamente após a triagem
// ou chegada ao local, com justificativa". Subir do piso é livre; descer exige
// motivo, e o motivo é gravado. Travar de vez violaria a cláusula.

const PRIORIDADES = ["p1", "p2", "p3", "p4"];

// Ordem de severidade: índice menor = mais grave. Usada para comparar, nunca
// para iterar com aritmética solta.
const _RANK = { p1: 0, p2: 1, p3: 2, p4: 3 };

// Prazo de comparecimento da cláusula 7, em minutos. É a referência
// CONTRATUAL — o valor que vale em runtime vem de `sla_definicoes`, que o
// admin edita. Serve para rotular a tela e para conferir o banco contra o
// contrato (a migration 082 corrigiu o P2, que estava em 24h).
const SLA_CONTRATUAL_MIN = { p1: 180, p2: 2880, p3: 4320, p4: null };

const LABEL = {
  p1: "P1 · Crítico",
  p2: "P2 · Alto",
  p3: "P3 · Programável",
  p4: "P4 · Baixa criticidade",
};

// ⚠️ PISO POR CATEGORIA — o caminho de quem NÃO responde a triagem.
// O painel do síndico e o app do cliente mandam só a categoria (decisão de
// produto antiga, mantida: cliente que escolhe prioridade marca tudo como
// emergência e inviabiliza a fila). Estes valores são exatamente os que já
// valiam antes desta mudança, de propósito — o síndico não pode ver o
// atendimento dele mudar de faixa porque o escritório ganhou um formulário.
const PISO_POR_CATEGORIA = {
  sem_agua:    "p1", // desabastecimento é o exemplo literal de P1 na cláusula 7
  vazamento:   "p2",
  bomba_falha: "p2",
  nivel_baixo: "p3",
  ruido:       "p3",
  outro:       "p3",
  manutencao:  "p4", // "melhorias, levantamentos, adequações" — P4 na cláusula 7
};

// Categorias que a minuta põe em P4 por natureza: são planejamento, não falha.
// Nem risco imediato as tira daqui sem alguém dizer por quê — se a "manutenção
// preventiva" virou emergência, o que mudou foi o problema, não o pedido, e
// quem abre deve trocar a categoria.
const CATEGORIAS_PLANEJAMENTO = new Set(["manutencao"]);

/**
 * Calcula o piso de prioridade de um chamado.
 *
 * @param {object} o
 * @param {string} [o.categoria]        uma das chaves de PISO_POR_CATEGORIA
 * @param {boolean|null} [o.riscoImediato]  há risco imediato de desabastecimento,
 *   inundação de área crítica ou falha de sistema essencial? (null = não perguntado)
 * @param {boolean|null} [o.redundancia]    a reserva assumiu / há condição
 *   provisória? (null = não perguntado)
 * @returns {{prioridade: string, origem: string, criterio: string}}
 */
function calcularPiso({ categoria, riscoImediato = null, redundancia = null } = {}) {
  const cat = PISO_POR_CATEGORIA[categoria] ? categoria : "outro";

  // Sem triagem: cai no piso conservador da categoria. É o caminho do painel
  // do síndico, do app e de qualquer chamado antigo.
  if (riscoImediato == null && redundancia == null) {
    return {
      prioridade: PISO_POR_CATEGORIA[cat],
      origem: "categoria",
      criterio: `Piso da categoria "${cat}" (triagem não respondida)`,
    };
  }

  // Planejamento é P4 mesmo com as respostas preenchidas: quem marca
  // "manutenção" está pedindo agenda, não socorro.
  if (CATEGORIAS_PLANEJAMENTO.has(cat)) {
    return {
      prioridade: "p4",
      origem: "categoria",
      criterio: 'Cláusula 7, P4 — "melhorias, levantamentos, adequações […] planejamento/orçamento"',
    };
  }

  if (riscoImediato === true) {
    return {
      prioridade: "p1",
      origem: "triagem",
      criterio: 'Cláusula 7, P1 — "risco imediato de desabastecimento relevante; ' +
                'poço/área crítica com risco de inundação; falha crítica de sistema essencial"',
    };
  }

  if (redundancia === true) {
    return {
      prioridade: "p3",
      origem: "triagem",
      criterio: 'Cláusula 7, P3 — "anomalia sem risco imediato; equipamento reserva ' +
                'indisponível sem perda da função principal"',
    };
  }

  // Sem risco imediato e sem redundância: falha relevante que já dói, mas não
  // é emergência. É a definição literal de P2.
  return {
    prioridade: "p2",
    origem: "triagem",
    criterio: 'Cláusula 7, P2 — "falha relevante, mas com condição provisória, ' +
              'redundância parcial ou sem risco imediato"',
  };
}

/** true se `a` é mais grave que `b` (p1 é o mais grave). */
function maisGraveQue(a, b) {
  return (_RANK[a] ?? 9) < (_RANK[b] ?? 9);
}

/** true se a prioridade escolhida é MENOS grave que o piso — o caso que exige motivo. */
function abaixoDoPiso(escolhida, piso) {
  if (!escolhida || !piso) return false;
  return (_RANK[escolhida] ?? 9) > (_RANK[piso] ?? 9);
}

/** Sobe um nível de severidade (p4→p3→p2→p1). `teto` limita até onde pode subir. */
function subirUmNivel(prioridade, teto = "p1") {
  const i = _RANK[prioridade];
  if (i == null) return prioridade;
  const alvo = PRIORIDADES[Math.max(0, i - 1)];
  return maisGraveQue(alvo, teto) ? teto : alvo;
}

/** Normaliza "sim"/"não"/true/false/"true"/1 vindos de body JSON. NULL preservado. */
function normalizarBooleano(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "sim", "s", "yes"].includes(s)) return true;
  if (["false", "0", "nao", "não", "n", "no"].includes(s)) return false;
  return null;
}

module.exports = {
  PRIORIDADES,
  PISO_POR_CATEGORIA,
  SLA_CONTRATUAL_MIN,
  LABEL,
  calcularPiso,
  maisGraveQue,
  abaixoDoPiso,
  subirUmNivel,
  normalizarBooleano,
};
