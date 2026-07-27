// src/jobs/planos-manutencao.job.js
//
// Roda 1×/dia. Para cada plano ativo cujo `proxima_em <= hoje`:
//   1. Abre um chamado P4 (categoria 'manutencao', sem técnico atribuído)
//      vinculado ao plano via `chamados.plano_manutencao_id`.
//   2. Atualiza `ultima_em = hoje` e `proxima_em = hoje + periodicidade_dias`.
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

    // Reagendamento ancorado no calendário do plano, não no dia em que o job
    // rodou. Antes era `CURRENT_DATE + periodicidade`, o que fazia todo atraso
    // virar deslocamento permanente (uma semestral gerada 4 dias atrasada
    // passava a vencer 4 dias depois, pra sempre — e a tela mostrava "em dia",
    // porque medía contra a data já escorregada).
    //
    //   k = menor inteiro >= 1 tal que proxima_em + k*periodicidade > hoje
    //
    // O LEAST cobre a execução antecipada (▶ Executar agora com proxima_em no
    // futuro): aí o serviço aconteceu HOJE, então o próximo tem que sair de
    // hoje — senão o intervalo real entre execuções fica maior que a
    // periodicidade contratada. Nos demais casos o LEAST não tem efeito, já
    // que a data ancorada nunca passa de hoje + periodicidade.
    await client.query(
      `UPDATE planos_manutencao
       SET ultima_em  = CURRENT_DATE,
           proxima_em = LEAST(
             proxima_em + (
               GREATEST(1, FLOOR((CURRENT_DATE - proxima_em)::numeric / $1::int) + 1) * $1::int
             )::int,
             CURRENT_DATE + $1::int
           )
       WHERE id = $2`,
      [plano.periodicidade_dias, planoId]
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

async function jobGerarChamadosPreventivos() {
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
