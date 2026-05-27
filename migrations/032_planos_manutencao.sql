-- Migration 032 — Planos de manutenção preventiva
--
-- Toda condomínio tem contrato preventivo (limpeza de caixa, revisão de bomba,
-- inspeção elétrica, etc) mas até agora não havia gestão disso no banco —
-- ficava na cabeça da equipe ou em planilha.
--
-- Cada plano dispara um chamado P4 (agendado) automaticamente quando vence,
-- via job diário (src/jobs/planos-manutencao.job.js). O chamado nasce sem
-- técnico atribuído — o admin escolhe quem executa.

BEGIN;

CREATE TABLE IF NOT EXISTS planos_manutencao (
  id                  SERIAL PRIMARY KEY,
  condominio_id       INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  titulo              VARCHAR(255) NOT NULL,
  descricao           TEXT,
  periodicidade_dias  INTEGER NOT NULL CHECK (periodicidade_dias > 0),
  proxima_em          DATE NOT NULL,
  ultima_em           DATE,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por          INTEGER REFERENCES usuarios(id)
);

-- Index parcial cobrindo a query do job (planos ativos vencidos/a vencer)
CREATE INDEX IF NOT EXISTS idx_planos_manut_due
  ON planos_manutencao (proxima_em)
  WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_planos_manut_condo
  ON planos_manutencao (condominio_id);

-- Vínculo do chamado gerado de volta ao plano (pra anti-duplicidade no job
-- e badge "Preventiva" na UI)
ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS plano_manutencao_id INTEGER
  REFERENCES planos_manutencao(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chamados_plano
  ON chamados (plano_manutencao_id)
  WHERE plano_manutencao_id IS NOT NULL;

COMMIT;
