// src/jobs/cobranca-avisos.job.js — avisos de cobrança por e-mail (migration 102)
//
// A cada volta monta a fila do dia (cobranca-avisos.service.js). Se
// `cobranca.avisos_automatico` estiver ligado E o servidor tiver
// COBRANCA_EMAIL=1, manda os pendentes — só em horário comercial (8h–18h de
// São Paulo, dia útil): cobrança às 3h da manhã ou no domingo não é bom tom.
// Sem isso, a fila espera a aprovação na tela.
//
// Padrão do projeto: setTimeout recursivo, intervalo lido do config a cada
// volta (`cobranca.avisos_intervalo_min`, padrão 30).

const { getConfigInt } = require("../services/config.service");
const avisos = require("../services/cobranca-avisos.service");

let _running = false;
let _lastRun = null;
let _lastResult = null;

function getCobrancaAvisosStatus() {
  return { ultima_execucao: _lastRun, ultimo_resultado: _lastResult };
}

function _horarioComercial(agora = new Date()) {
  const sp = new Date(agora.getTime() - 3 * 3600e3);
  const dia = sp.getUTCDay(), h = sp.getUTCHours();
  return dia >= 1 && dia <= 5 && h >= 8 && h < 18;
}

function startCobrancaAvisosScheduler() {
  async function tick() {
    if (_running) return agendar();
    _running = true;
    try {
      const fila = await avisos.montarFila();
      let envio = null;
      const r = await avisos.regras();
      if (r.automatico && avisos.ligado() && _horarioComercial()) {
        envio = await avisos.enviar(null, { automatico: true });
      }
      _lastResult = { ...fila, envio: envio ? { enviados: envio.enviados, falhas: envio.falhas.length } : null };
      _lastRun = new Date().toISOString();
      if (fila.novos || fila.expirados || (envio && (envio.enviados || envio.falhas.length))) console.log("📨 Job avisos de cobrança:", _lastResult);
    } catch (e) {
      _lastResult = { ok: false, erro: e.message };
      // Sem a migration 102 a tabela não existe: avisa, não derruba.
      console.error("❌ Job avisos de cobrança falhou:", e.message);
    } finally {
      _running = false;
      agendar();
    }
  }
  async function agendar() {
    const min = await getConfigInt("cobranca.avisos_intervalo_min", 30).catch(() => 30);
    setTimeout(tick, Math.max(10, min) * 60 * 1000);
  }
  // Primeira volta 8 min depois do boot: depois da primeira cópia do Omie (3 min).
  setTimeout(tick, 8 * 60 * 1000);
}

module.exports = { startCobrancaAvisosScheduler, getCobrancaAvisosStatus, _horarioComercial };
