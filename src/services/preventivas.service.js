// As preventivas de um mês: quem faz, e o que já foi feito.
//
// ⚠️ ESTE ARQUIVO É A ÚNICA DEFINIÇÃO DE "FEITA" E DE "DE QUEM É". A tela do
// operador, o roteiro do app e os testes leem daqui — três leituras diferentes
// do mesmo mês seria a receita para o operador achar que sobrou serviço e o
// técnico achar que não.

// ── A competência ───────────────────────────────────────────────────────────
//
// ⚠️ SEMPRE O DIA 1, e o CHECK da migration 082 recusa outro dia. "2026-09" e
// "2026-09-15" apontariam para o mesmo mês e criariam duas atribuições para o
// mesmo plano — dois técnicos no mesmo prédio.
//
// ⚠️ E SEMPRE COMO STRING `YYYY-MM-DD`, nunca `new Date()`. `DATE` no Postgres
// não tem fuso; passar por Date interpreta como meia-noite UTC e no Brasil
// devolve o dia anterior — em dia 1, o mês anterior inteiro. É a mesma
// pegadinha que o `_pmFmtData` do admin.js já contorna fatiando a string.
const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

function competenciaValida(mes) {
  return typeof mes === "string" && RE_COMPETENCIA.test(mes);
}

// "2026-09" → "2026-09-01". Sem argumento, o mês corrente do servidor.
function competenciaDe(mes) {
  if (competenciaValida(mes)) return `${mes}-01`;
  const agora = new Date();
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  return `${agora.getFullYear()}-${mm}-01`;
}

// "2026-09-01" → "2026-09", para devolver ao front no mesmo formato que ele manda.
function mesDe(competencia) {
  return String(competencia).slice(0, 7);
}

// ── Os estados ──────────────────────────────────────────────────────────────
//
// ⚠️ "FEITA" É O CHAMADO FECHADO, não `ultima_em`. Elas parecem a mesma coisa e
// não são: `executarPlano` grava `ultima_em = CURRENT_DATE` no instante em que
// ABRE o chamado — quando o técnico toca "Iniciar" no prédio. Uma preventiva
// iniciada às 9h e abandonada às 9h05 tem `ultima_em` de hoje e não foi feita.
// O que fecha o chamado é a O.S. finalizada (`ordens-servico.routes.js`), e é
// isso que significa serviço entregue.
//
// ⚠️ MAS `ultima_em` NO MÊS TAMBÉM CONTA, quando não há chamado nenhum. É o
// caso da execução anterior a este módulo e do plano marcado à mão: ignorar
// faria a tela cobrar de novo um serviço que a equipe sabe ter sido feito.
const ESTADOS = ["a_fazer", "escalada", "em_campo", "feita"];

// ⚠️ "ESCALADA" É A ATRIBUIÇÃO EXPLÍCITA, não "tem técnico". A primeira versão
// lia `linha.tecnico_id` — que a linha do SQL nem tem (lá a coluna se chama
// `atribuido_tecnico_id`; `tecnico_id` só passa a existir depois do `map` da
// rota, já com o fallback da zona aplicado). Resultado: NENHUM plano entrava
// em "escalada", e se entrasse seria pelo motivo errado — todo prédio de zona
// com responsável apareceria como escalado sem ninguém ter escalado nada.
function estadoDa(linha) {
  if (linha.chamado_fechado_id) return "feita";
  if (!linha.chamado_aberto_id && linha.feita_no_mes) return "feita";
  if (linha.chamado_aberto_id) return "em_campo";
  if (linha.atribuido_tecnico_id) return "escalada";
  return "a_fazer";
}

// ── De quem é ───────────────────────────────────────────────────────────────
//
// ⚠️ A ATRIBUIÇÃO EXPLÍCITA GANHA DA ZONA, e isso é a regra inteira. Se o
// operador escalou o plano para alguém neste ciclo, é dele — e **some do
// roteiro dos outros**, inclusive de quem responde pela zona. Somar as duas
// origens seria pior que não ter atribuição: dois técnicos veem o mesmo prédio
// no app, os dois vão, e um perdeu a manhã.
//
// Sem atribuição no ciclo, vale a zona — que é o comportamento que existia
// antes e continua sendo o padrão de quem responde pela região.
//
// O SQL disto vive nas queries (é um LEFT JOIN + COALESCE), mas a regra é esta
// e está aqui para ter um lugar só onde ela se lê.
function origemDoTecnico(linha) {
  if (linha.atribuido_tecnico_id) return "escala";
  if (linha.zona_tecnico_id) return "zona";
  return null;
}

module.exports = {
  ESTADOS,
  competenciaValida,
  competenciaDe,
  mesDe,
  estadoDa,
  origemDoTecnico,
};
