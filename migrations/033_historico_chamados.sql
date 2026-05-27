-- Migration 033 — Audit log de mudanças nos chamados
--
-- Hoje só o estado atual do chamado é salvo; não dá pra ver quem alterou
-- prioridade/status nem quanto tempo cada fase durou. Esta tabela registra
-- cada mudança de campo relevante: status, prioridade, categoria,
-- responsavel_id, tecnico_id, condominio_id.
--
-- Append-only. Preenchida pelo service src/services/chamado-historico.service.js,
-- que é chamado pelos hooks de criação/atualização nos endpoints.

BEGIN;

CREATE TABLE IF NOT EXISTS historico_chamados (
  id              BIGSERIAL PRIMARY KEY,
  chamado_id      INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  campo_alterado  VARCHAR(40) NOT NULL,
  valor_anterior  TEXT,
  valor_novo      TEXT,
  alterado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  alterado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice principal: timeline por chamado em ordem cronológica
CREATE INDEX IF NOT EXISTS idx_hist_chamado_id_em
  ON historico_chamados (chamado_id, alterado_em DESC);

-- Índice para a métrica de reabertos (Fase 8A): conta chamados que tiveram
-- pelo menos uma transição saindo de 'fechado'.
CREATE INDEX IF NOT EXISTS idx_hist_status_reabert
  ON historico_chamados (chamado_id)
  WHERE campo_alterado = 'status' AND valor_anterior = 'fechado';

COMMIT;
