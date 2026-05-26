-- Migration 028 — Política de Criticidade P1-P4
-- Renomeia prioridades: emergencia→p1, alta→p2, media→p3, baixa→p4
-- Adiciona sla_chegada_min (SLA de chegada do técnico) e campos de tracking

-- 1. Remove CHECK constraint antiga
ALTER TABLE chamados DROP CONSTRAINT IF EXISTS chamados_prioridade_check;

-- 2. Renomeia valores existentes
UPDATE chamados SET prioridade = 'p1' WHERE prioridade = 'emergencia';
UPDATE chamados SET prioridade = 'p2' WHERE prioridade = 'alta';
UPDATE chamados SET prioridade = 'p3' WHERE prioridade = 'media';
UPDATE chamados SET prioridade = 'p4' WHERE prioridade = 'baixa';

-- 3. Aplica nova CHECK constraint
ALTER TABLE chamados
  ALTER COLUMN prioridade SET DEFAULT 'p3',
  ADD CONSTRAINT chamados_prioridade_check
    CHECK (prioridade IN ('p1', 'p2', 'p3', 'p4'));

-- 4. Campos de tracking de chegada do técnico
ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS tecnico_a_caminho_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_chegou_em    TIMESTAMPTZ;

-- 5. Adiciona coluna sla_chegada_min em sla_definicoes
ALTER TABLE sla_definicoes
  ADD COLUMN IF NOT EXISTS sla_chegada_min INTEGER;

-- 6. Renomeia linhas e atualiza valores em sla_definicoes
--    SLA de chegada: P1=3h, P2=24h, P3=72h, P4=NULL (agenda)
--    TTFR/TTR: mantidos como métricas operacionais internas

UPDATE sla_definicoes SET
  prioridade      = 'p1',
  ttfr_min        = 15,
  ttr_min         = 240,
  sla_chegada_min = 180
WHERE prioridade = 'emergencia';

UPDATE sla_definicoes SET
  prioridade      = 'p2',
  ttfr_min        = 60,
  ttr_min         = 1440,
  sla_chegada_min = 1440
WHERE prioridade = 'alta';

UPDATE sla_definicoes SET
  prioridade      = 'p3',
  ttfr_min        = 240,
  ttr_min         = 4320,
  sla_chegada_min = 4320
WHERE prioridade = 'media';

UPDATE sla_definicoes SET
  prioridade      = 'p4',
  ttfr_min        = 1440,
  ttr_min         = 14400,
  sla_chegada_min = NULL
WHERE prioridade = 'baixa';

-- 7. Garante que linhas existam (caso banco ainda não tenha rodado migration 023)
INSERT INTO sla_definicoes (prioridade, ttfr_min, ttr_min, sla_chegada_min) VALUES
  ('p1', 15,   240,   180),
  ('p2', 60,   1440,  1440),
  ('p3', 240,  4320,  4320),
  ('p4', 1440, 14400, NULL)
ON CONFLICT (prioridade) DO NOTHING;
