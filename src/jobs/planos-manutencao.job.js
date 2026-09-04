// src/jobs/planos-manutencao.job.js
//
// `executarPlano(id)` é o ATO de pôr uma preventiva em execução:
//   1. Abre um chamado P4 (categoria 'manutencao') vinculado ao plano via
//      `chamados.plano_manutencao_id`.
//   2. Grava `ultima_em = hoje` e joga `proxima_em` para o dia 1 do próximo
//      ciclo, contado em MESES DE CALENDÁRIO (ver a nota longa lá embaixo).
//
// Quem chama: o despacho da tela de Preventivas do operador, o ▶ "Executar
// agora" do admin, e — só se alguém religar a chave — o job automático.
//
// ⚠️ O JOB AUTOMÁTICO NASCE DESLIGADO desde 03/09/2026
// (`planos.geracao_enabled`, default `true` na main — ver a nota na função).
// `jobGerarChamadosPreventivos`. O código dele continua inteiro.
//
// ⚠️ `proxima_em` NÃO É MAIS UM VENCIMENTO. Com o ciclo em meses, ele é o
// rótulo da COMPETÊNCIA em que o plano está devendo visita — o dia não
// significa nada, e a rota do operador já o lia assim (`proxima_em < dia 1 da
// competência` = atrasada). O "antes do dia 10" é meta de equipe, vive em
// `preventivas.dia_meta` e não toca esta tabela.
//
// Anti-duplicidade: pula se o plano já tem chamado aberto vinculado
// (alguém pode ter chamado /executar-agora ou o admin pode ter aberto manualmente).

const { pool } = require("../db");
const { getConfigBool } = require("../services/config.service");
const { registrarCriacao } = require("../services/chamado-historico.service");

const INTERVALO_MS = 24 * 60 * 60 * 1000; // 1 dia
const PRIMEIRA_EXECUCAO_MS = 30 * 60 * 1000; // 30 min após boot

let _lastRun = null;
let _lastResult = null;
let _running = false;

// Executa um plano específico (criando o chamado P4 + atualizando datas).
// Usado pelo job (em loop) e pelo endpoint POST /:id/executar-agora.
//
// `tecnicoId` = quem está de fato assumindo o serviço (o técnico que tocou
// "Iniciar" no roteiro). Quando não vem — job automático ou ▶ do admin — cai no
// responsável da zona, e só se houver exatamente um: desde a migration 066 a
// zona pode ter vários, e escolher um deles no chute colocaria o chamado no app
// da pessoa errada. Com mais de um, nasce sem técnico e o admin distribui.
//
// Retorna { ok, plano_id, chamado_id, duplicado? }.
async function executarPlano(planoId, { tecnicoId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planoRes = await client.query(
      `SELECT pm.id, pm.condominio_id, pm.titulo, pm.descricao, pm.periodicidade_dias, pm.proxima_em,
              c.zona AS condominio_zona
       FROM planos_manutencao pm
       JOIN condominios c ON c.id = pm.condominio_id
       WHERE pm.id = $1 AND pm.ativo = TRUE
       FOR UPDATE OF pm`,
      [planoId]
    );
    if (!planoRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Plano não encontrado ou inativo"), { status: 404 });
    }
    const plano = planoRes.rows[0];

    // Anti-duplicidade: já existe chamado aberto vinculado?
    const dupRes = await client.query(
      `SELECT id FROM chamados
       WHERE plano_manutencao_id = $1
         AND status NOT IN ('fechado', 'cancelado')
       LIMIT 1`,
      [planoId]
    );
    if (dupRes.rows.length) {
      await client.query("ROLLBACK");
      return {
        ok: true,
        plano_id: planoId,
        chamado_id: dupRes.rows[0].id,
        duplicado: true,
      };
    }

    const descricao = [
      plano.descricao ? plano.descricao.trim() : null,
      `Gerado automaticamente pelo plano de manutenção #${planoId}.`,
    ].filter(Boolean).join("\n\n");

    // Quem assume: o técnico que iniciou o serviço tem precedência. Sem ele,
    // só atribui automaticamente quando a zona tem um único responsável.
    let atribuidoA = tecnicoId;
    if (!atribuidoA && plano.condominio_zona) {
      const zr = await client.query(
        `SELECT tecnico_id FROM planos_zona_responsavel WHERE zona = $1`,
        [plano.condominio_zona]
      );
      if (zr.rows.length === 1) atribuidoA = zr.rows[0].tecnico_id;
    }

    const chamadoRes = await client.query(
      `INSERT INTO chamados
         (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, tecnico_id)
       VALUES ($1, $2, $3, 'p4', 'manutencao', 'aberto', $4, $5)
       RETURNING id`,
      [plano.condominio_id, plano.titulo, descricao, planoId, atribuidoA]
    );

    await registrarCriacao({
      client,
      chamadoId: chamadoRes.rows[0].id,
      alteradoPor: null,
    });

    // ⚠️ REAGENDAMENTO POR MÊS DE CALENDÁRIO, NÃO POR "+N DIAS" (03/09/2026).
    //
    // O contrato promete UMA VISITA POR MÊS. O código prometia "a cada 30
    // dias", e as duas coisas não são a mesma: 30 dias andam para trás no
    // calendário ~5 dias por ano, e uma hora dois ciclos caem no mesmo mês.
    //
    // Não é hipótese. Medido nos 69 planos ativos, que estão TODOS no dia 4 e
    // caminham em bloco (foram cadastrados juntos):
    //
    //   04/09/26 · 04/10 · 03/11 · 03/12 · 02/01/27 · 01/02 · 03/03 · 02/04
    //   · 02/05 · 01/06 · 01/07 · 31/07 ← DUAS EM JULHO/2027, 138 chamados
    //
    // ⚠️ E a data por prédio nunca foi real. Os 69 vencem no mesmo dia; a
    // equipe faz todas até o dia 10. "O dia 4 do Ed. Vila Formosa" nunca
    // significou nada — era precisão inventada, e o Pedro nomeou isso:
    // "não tem isso de tem que fazer especificamente no dia X".
    //
    // Agora `proxima_em` é o DIA 1 DO PRÓXIMO CICLO, contado em meses de
    // calendário. Ele deixa de ser um vencimento e passa a ser o rótulo da
    // COMPETÊNCIA em que o plano está devendo visita — que é como a rota do
    // operador já o lia (`proxima_em < dia 1 da competência` = atrasada).
    //
    // ⚠️ Meses, não dias, para as periodicidades não-mensais também: 90 dias
    // vira 3 meses, 180 vira 6, 365 vira 12. `date_trunc` + `INTERVAL` faz o
    // Postgres respeitar mês curto (31/01 + 1 mês = 28/02, não 03/03).
    // Hoje os 72 planos são mensais — nenhum 90/180/365 em produção —, mas o
    // seletor do admin os oferece e eles não podem herdar a deriva antiga.
    const meses = Math.max(1, Math.round(plano.periodicidade_dias / 30));
    await client.query(
      `UPDATE planos_manutencao
       SET ultima_em  = CURRENT_DATE,
           proxima_em = (date_trunc('month', CURRENT_DATE) + ($1::int * INTERVAL '1 month'))::date
       WHERE id = $2`,
      [meses, planoId]
    );

    await client.query("COMMIT");

    return {
      ok: true,
      plano_id: planoId,
      chamado_id: chamadoRes.rows[0].id,
      duplicado: false,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ⚠️ O PADRÃO VIROU `false` EM 03/09/2026 — decisão do Pedro, com a tela de
// Preventivas já no ar: "não abrir sozinho; o operador despacha".
//
// O motivo é o mesmo do reagendamento acima. Com o mês como unidade, todo
// plano ativo está devendo visita TODO mês; um job que abre chamado assim que
// a data chega despejaria os 69 P4 de uma vez na fila do turno, e a fila é
// ordenada por prazo — 69 preventivas sem urgência empurrariam para baixo o
// que de fato estoura primeiro.
//
// ⚠️ NADA FOI REMOVIDO. `jobGerarChamadosPreventivos` e o scheduler continuam
// inteiros, e ligar de volta é um `PATCH /admin/configuracoes` com
// `planos.geracao_enabled = true` — sem deploy, como todo job deste projeto.
// O caminho que passou a valer é o despacho da tela (`POST
// /operador/preventivas/atribuir`) e o ▶ do admin, os dois pelo mesmo
// `executarPlano`.
async function jobGerarChamadosPreventivos() {
  // ⚠️ DEFAULT `true`, E ISSO DIVERGE DA BRANCH DE ORIGEM (04/09/2026). Lá o
  // job nascia DESLIGADO, com o argumento de que "com o mês como unidade ele
  // despejaria 69 P4 numa fila ordenada por prazo". Esse motivo deixou de
  // existir na `main`: a fila do turno passou a excluir preventiva enquanto
  // ninguém começou (`GET /operador/fila`), então os 69 não poluem mais nada.
  //
  // Desligar a geração é decisão de operação, não efeito colateral de um porte
  // — o Pedro viu o job rodar hoje e tratou como normal. O interruptor existe
  // (`PATCH /admin/configuracoes`, chave `planos.geracao_enabled`) e é dele.
  const enabled = await getConfigBool("planos.geracao_enabled", true);
  if (!enabled) {
    return { ok: true, enabled: false, gerados: 0, duplicados: 0, candidatos: 0 };
  }

  const r = await pool.query(
    `SELECT id FROM planos_manutencao
     WHERE ativo = TRUE AND proxima_em <= CURRENT_DATE
     ORDER BY proxima_em ASC`
  );

  let gerados = 0, duplicados = 0, erros = 0;
  for (const row of r.rows) {
    try {
      const result = await executarPlano(row.id);
      if (result.duplicado) duplicados++;
      else gerados++;
    } catch (e) {
      erros++;
      console.error(`[planos-manutencao] erro no plano ${row.id}:`, e.message);
    }
  }

  return {
    ok: true,
    enabled: true,
    candidatos: r.rows.length,
    gerados,
    duplicados,
    erros,
  };
}

function getPlanosManutencaoStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function startPlanosManutencaoScheduler() {
  async function tick() {
    if (_running) return scheduleProximo();
    _running = true;
    try {
      _lastResult = await jobGerarChamadosPreventivos();
      _lastRun = new Date().toISOString();
      console.log("📅 Job planos-manutencao:", _lastResult);
    } catch (e) {
      console.error("❌ Job planos-manutencao falhou:", e);
    } finally {
      _running = false;
      scheduleProximo();
    }
  }
  function scheduleProximo() {
    setTimeout(tick, INTERVALO_MS);
  }
  // Primeira execução 30 min após boot (escalonado depois dos outros jobs).
  setTimeout(tick, PRIMEIRA_EXECUCAO_MS);
}

module.exports = {
  executarPlano,
  jobGerarChamadosPreventivos,
  startPlanosManutencaoScheduler,
  getPlanosManutencaoStatus,
};
