// A régua de prioridade dos chamados — categoria, enquadramento e P1–P4.
//
// ⚠️ ELA VEM DO CONTRATO, não do gosto de quem abre o chamado. A cláusula 7 da
// minuta ("DOS CHAMADOS E SLA P1-P4") define o enquadramento de cada
// prioridade e o prazo que a General se obriga a cumprir. Os textos de
// `ENQUADRAMENTO` abaixo são o resumo fiel daquela tabela, e é por isso que
// eles aparecem na tela: quem classifica precisa ler o critério, não adivinhá-lo.
//
// ⚠️ E A MINUTA AUTORIZA A RECLASSIFICAÇÃO — cláusula 7.1.c: "A prioridade
// poderá ser reclassificada tecnicamente após a triagem ou chegada ao local,
// com justificativa". É o que separa SUGERIR de TRAVAR: no painel do admin a
// categoria move o seletor e a pessoa pode mudar; no painel do cliente ela
// decide sozinha, porque cliente marca tudo como emergência.
//
// ⚠️ ESTE ARQUIVO É A ÚNICA CÓPIA DA LISTA DE CATEGORIAS. Ela vivia repetida em
// `chamados.routes.js`, `cliente.routes.js`, `operador.routes.js` e
// `ia.service.js` — quatro lugares para acrescentar uma categoria, e o quinto
// (o `enum` da função da IA) calado quando alguém esquecesse.

// As categorias de chamado, na ordem em que a tela as oferece.
const CATEGORIAS = [
  "vazamento", "bomba_falha", "nivel_baixo", "sem_agua",
  "ruido", "manutencao", "melhoria", "outro",
];

// O rótulo de cada uma, para tela e para o prompt da IA falarem igual.
const CATEGORIA_ROTULO = {
  vazamento:   "Vazamento",
  bomba_falha: "Falha de bomba",
  nivel_baixo: "Nível baixo",
  sem_agua:    "Sem água",
  ruido:       "Ruído",
  manutencao:  "Manutenção",
  melhoria:    "Melhoria / levantamento",
  outro:       "Outro",
};

// Categoria → prioridade. Cada linha traz a cláusula que a sustenta.
//
// ⚠️ MUDAR UMA LINHA DAQUI MUDA UM COMPROMISSO CONTRATUAL, não uma preferência
// de tela: a prioridade escolhe o prazo de comparecimento em `sla_definicoes`.
// Subir uma categoria encurta o prazo que a General se obriga a cumprir.
const CATEGORIA_PRIORIDADE = {
  // "Risco imediato de desabastecimento relevante" — o exemplo do P1.
  sem_agua:    "p1",
  // "Falha relevante, mas com condição provisória". Sobe a P1 na triagem quando
  // for poço/área crítica com risco de inundação, que a cláusula nomeia.
  vazamento:   "p2",
  // Idem: falha relevante. P1 quando não houver redundância.
  bomba_falha: "p2",
  // Ainda não é desabastecimento — é o aviso antes dele.
  nivel_baixo: "p3",
  // "Anomalia sem risco imediato".
  ruido:       "p3",
  // ⚠️ P4 POR DECISÃO EXPRESSA (Pedro, 03/09/2026), não por herança. A cláusula
  // 7 daria margem para P3 ("ajuste ou corretiva não crítica"), e a régua nasceu
  // em P4 copiando o mapa do painel do cliente — mas subir encurtaria o prazo de
  // 'agendamento' para 72 horas de COMPARECIMENTO em todo chamado de manutenção.
  // É obrigação contratual, não preferência de tela. Ver decisions.md.
  manutencao:  "p4",
  // "Melhorias, levantamentos, adequações, solicitações estéticas ou serviços
  // que dependam de planejamento/orçamento" — o texto do P4 na minuta.
  melhoria:    "p4",
  // O default histórico. Sem informação para triar, o meio da tabela.
  outro:       "p3",
};

const PRIORIDADES = ["p1", "p2", "p3", "p4"];

// O que a minuta diz sobre cada prioridade. `rotulo` e `enquadramento` são da
// cláusula 7; `prazo` NÃO está aqui de propósito — ele vive em
// `sla_definicoes`, é editável em Configurações, e escrever o número em dois
// lugares é como a tela passou a prometer "24–48h" onde o contrato diz "até 48".
const ENQUADRAMENTO = {
  p1: {
    rotulo: "Crítico",
    enquadramento: "Risco imediato de desabastecimento relevante; poço ou área " +
      "crítica com risco de inundação; falha crítica de sistema essencial.",
    // Cláusula 8.1: a cobertura 24 horas é só para P1.
    plantao: true,
  },
  p2: {
    rotulo: "Alto",
    enquadramento: "Falha relevante, mas com condição provisória, redundância " +
      "parcial ou sem risco imediato à segurança e ao abastecimento geral.",
    plantao: false,
  },
  p3: {
    rotulo: "Programável",
    enquadramento: "Anomalia sem risco imediato; equipamento reserva indisponível " +
      "sem perda da função principal; ajuste ou corretiva não crítica.",
    plantao: false,
  },
  p4: {
    rotulo: "Baixa criticidade",
    enquadramento: "Melhorias, levantamentos, adequações, solicitações estéticas " +
      "ou serviços que dependam de planejamento e orçamento.",
    plantao: false,
  },
};

// A prioridade que a categoria pede. Categoria desconhecida cai no meio da
// tabela, nunca em P1: errar para cima enche o plantão de coisa que não é
// plantão, e a cláusula 8.1 reserva as 24 horas ao P1.
function prioridadeSugerida(categoria) {
  return CATEGORIA_PRIORIDADE[categoria] || "p3";
}

// Sobe um nível, com teto em P1. Usado pela regra de recorrência.
function subirUmNivel(prioridade) {
  const i = PRIORIDADES.indexOf(prioridade);
  return i > 0 ? PRIORIDADES[i - 1] : (i === 0 ? "p1" : prioridade);
}

module.exports = {
  CATEGORIAS,
  CATEGORIA_ROTULO,
  CATEGORIA_PRIORIDADE,
  PRIORIDADES,
  ENQUADRAMENTO,
  prioridadeSugerida,
  subirUmNivel,
};
