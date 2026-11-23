// src/jobs/orcamento-vencimento.job.js — orçamento que vence (migration 103)
//
// A cada volta (orcamento-vencimento.service.js):
//   1. arquiva os enviados sem resposta cuja validade passou (sempre);
//   2. apaga os arquivados há mais de `orcamento.apagar_dias` (padrão 90; 0 = não apaga);
//   3. manda o lembrete de `orcamento.lembrete_dias` antes de vencer — só em
//      horário comercial (8h–18h de São Paulo, dia útil) e só com
//      ORCAMENTO_LEMBRETE_EMAIL=1 no servidor.
//
// Padrão do projeto: setTimeout recursivo, intervalo lido do config a cada
// volta (`orcamento.vencimento_intervalo_min`, padrão 60).

const { getConfigInt } = require("../services/config.service");
const venc = require("../services/orcamento-vencimento.service");
const { _horarioComercial } = require("./cobranca-avisos.job");

let _running = false;
let _lastRun = null;
let _lastResult = null;

function getOrcamentoVencimentoStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

async function rodarUmaVolta({ agora = new Date() } = {}) {
  const arquivo = await venc.arquivarVencidos();
  const apagar = await venc.apagarArquivados();
  const lembrete = _horarioComercial(agora) ? await venc.enviarLembretes() : null;
  return { arquivados: arquivo.arquivados, apagados: apagar.apagados, lembretes: lembrete };
}

function startOrcamentoVencimentoScheduler() {
  async function tick() {
    if (_running) return agendar();
    _running = true;
    try {
      _lastResult = await rodarUmaVolta();
      _lastRun = new Date().toISOString();
      const l = _lastResult.lembretes;
      if (_lastResult.arquivados || _lastResult.apagados || (l && (l.enviados || l.falhas || l.sem_email))) {
        console.log("📄 Job vencimento de orçamentos:", _lastResult);
      }
    } catch (e) {
      _lastResult = { ok: false, erro: e.message };
      // Sem a migration 103 a coluna não existe: avisa, não derruba.
      console.error("❌ Job vencimento de orçamentos falhou:", e.message);
    } finally {
      _running = false;
      agendar();
    }
  }
  async function agendar() {
    const min = await getConfigInt("orcamento.vencimento_intervalo_min", 60).catch(() => 60);
    setTimeout(tick, Math.max(10, min) * 60 * 1000);
  }
  setTimeout(tick, 5 * 60 * 1000);
}

module.exports = { startOrcamentoVencimentoScheduler, getOrcamentoVencimentoStatus, rodarUmaVolta };
