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
// ⚠️ "EM CAMPO" É CHAMADO ABERTO **COM TÉCNICO** (04/09/2026), e a palavra que
// faltava era essa. O job cria o chamado do mês sozinho, de madrugada, sem
// responsável nenhum — e a versão anterior lia qualquer chamado aberto como
// "em campo". Resultado medido em produção no dia em que o mês virou: **69
// planos em "em campo" com ZERO técnico**, e a tela de Preventivas esconde a
// caixa de marcar, o botão da zona e a barra de despacho nesse estado.
//
// O operador ficou sem a única ação que a tela tem, no dia em que ela mais
// importa. O Pedro: "por que não está aparecendo para atribuir técnico?".
//
// Chamado aberto SEM técnico não é serviço andando: é serviço esperando alguém,
// que é exatamente o que "a fazer" (ou "escalada") já diz. O chamado continua
// existindo — quem despacha o adota, em vez de criar um segundo.
function estadoDa(linha) {
  if (linha.chamado_fechado_id) return "feita";
  if (!linha.chamado_aberto_id && linha.feita_no_mes) return "feita";
  if (linha.chamado_aberto_id && linha.chamado_aberto_tecnico_id) return "em_campo";
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

/* ══════════════════════════════════════════════════════════════════════════
   A PREVENTIVA APROVEITADA (04/09/2026)
   ──────────────────────────────────────────────────────────────────────────
   "Se o técnico for a um condomínio por outro chamado mas quiser aproveitar e
   fazer a preventiva, ele marca essa opção na O.S. e o sistema conta como
   preventiva realizada" — pedido do Pedro.

   A caixa já existia (`preventiva_mensal` em `tipos_servico`, migration 015) e
   não fazia nada. Isto é a ligação, e ela roda DENTRO da transação de
   `POST /ordens-servico/:id/finalizar`.

   ⚠️ SÓ QUANDO HÁ EXATAMENTE UM PLANO DEVENDO VISITA. Decisão do Pedro: "em
   teoria era para cada condomínio ter só um plano". Ele está certo — o único
   caso com dois em produção (CONNECT BUTANTA, planos 22 e 23) é DUPLICATA
   EXATA: mesmo título, mesma periodicidade, mesmas datas, criados no mesmo dia.
   Com dois planos elegíveis esta função não dá baixa em nenhum, porque dar
   baixa nos dois marcaria como feito um serviço que talvez não tenha sido —
   e o operador ainda tem a tela para resolver à mão.

   ⚠️ E SÓ QUANDO O PLANO AINDA DEVE O MÊS. Sem esta guarda, marcar a caixa
   numa O.S. cujo chamado JÁ É o da preventiva adiantaria o ciclo duas vezes
   (o `executarPlano` já mexeu nas datas quando o chamado ABRIU) e o prédio
   pularia um mês inteiro.
   ══════════════════════════════════════════════════════════════════════════ */

const MARCA_PREVENTIVA = "preventiva_mensal";

// `client` é a conexão da transação de quem chama — nunca abra outra aqui:
// a baixa da preventiva tem de nascer e morrer junto com a finalização da O.S.
async function darBaixaPorOS(client, { osId, condominioId, quando }) {
  if (!condominioId) return { baixou: false, motivo: "sem condomínio" };

  // O primeiro dia do mês em que a O.S. foi finalizada — a competência que ela
  // fecha. Usa a data da O.S., não NOW(): uma O.S. sincronizada no dia 1 de
  // outubro sobre um serviço feito em 30 de setembro fecha SETEMBRO.
  const compRes = await client.query(
    `SELECT date_trunc('month', COALESCE($1::timestamptz, NOW()))::date AS competencia`,
    [quando]
  );
  const competencia = compRes.rows[0].competencia;

  // Elegível = ativo, ainda devendo esta competência (proxima_em não passou do
  // fim do mês) e sem baixa já dada neste mês.
  const elegiveis = await client.query(
    `SELECT pm.id, pm.periodicidade_dias,
            (SELECT ch.id FROM chamados ch
              WHERE ch.plano_manutencao_id = pm.id
                AND ch.status NOT IN ('fechado','cancelado')
              LIMIT 1) AS chamado_aberto_id
       FROM planos_manutencao pm
      WHERE pm.condominio_id = $1
        AND pm.ativo = TRUE
        AND pm.proxima_em < ($2::date + INTERVAL '1 month')
        AND (pm.ultima_em IS NULL
             OR pm.ultima_em < $2::date
             OR pm.ultima_em >= ($2::date + INTERVAL '1 month'))
      FOR UPDATE OF pm`,
    [condominioId, competencia]
  );

  if (elegiveis.rows.length === 0) return { baixou: false, motivo: "nenhum plano devendo o mês" };
  if (elegiveis.rows.length > 1) {
    // Não é erro do técnico — é cadastro. Fica no log para virar limpeza.
    console.warn(
      `[preventivas] condomínio ${condominioId} tem ${elegiveis.rows.length} planos ` +
      `devendo ${String(competencia).slice(0, 10)}; a O.S. ${osId} não deu baixa em nenhum.`
    );
    return { baixou: false, motivo: "mais de um plano elegível", planos: elegiveis.rows.map((p) => p.id) };
  }

  const plano = elegiveis.rows[0];
  const meses = Math.max(1, Math.round(plano.periodicidade_dias / 30));

  // A mesma aritmética do `executarPlano`: meses de calendário, ancorada na
  // data em que o serviço aconteceu.
  await client.query(
    `UPDATE planos_manutencao
        SET ultima_em    = COALESCE($1::timestamptz, NOW())::date,
            ultima_os_id = $2,
            proxima_em   = (date_trunc('month', COALESCE($1::timestamptz, NOW())::date)
                            + ($3::int * INTERVAL '1 month'))::date
      WHERE id = $4`,
    [quando, osId, meses, plano.id]
  );

  return {
    baixou: true,
    planoId: plano.id,
    competencia: String(competencia).slice(0, 10),
    chamadoPreventivaAberto: plano.chamado_aberto_id || null,
  };
}

module.exports = {
  ESTADOS,
  MARCA_PREVENTIVA,
  darBaixaPorOS,
  competenciaValida,
  competenciaDe,
  mesDe,
  estadoDa,
  origemDoTecnico,
};
