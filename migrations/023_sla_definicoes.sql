-- Migration 023 — SLA configurável por prioridade (Fase 8B)
-- Tabela com os limites de tempo de primeira resposta (TTFR) e resolução
-- (TTR) por prioridade de chamado. Editável pelo master admin via
-- Configurações > SLA. Os valores são em minutos.

CREATE TABLE IF NOT EXISTS sla_definicoes (
  prioridade    VARCHAR(20) PRIMARY KEY,  -- 'baixa' | 'media' | 'alta' | 'emergencia'
  ttfr_min      INTEGER NOT NULL CHECK (ttfr_min > 0),   -- Tempo até 1ª resposta (minutos)
  ttr_min       INTEGER NOT NULL CHECK (ttr_min > 0),    -- Tempo até resolução (minutos)
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por INTEGER REFERENCES usuarios(id)
);

-- Seeds com valores padrão razoáveis para uma empresa de manutenção predial
INSERT INTO sla_definicoes (prioridade, ttfr_min, ttr_min) VALUES
  ('emergencia', 5,   30),
  ('alta',       15,  120),
  ('media',      60,  480),
  ('baixa',      240, 1440)
ON CONFLICT (prioridade) DO NOTHING;
