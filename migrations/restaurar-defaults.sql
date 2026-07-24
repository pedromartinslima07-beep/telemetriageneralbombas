-- ============================================================
-- restaurar-defaults.sql
-- Reinsere SLAs e configurações padrão após limpeza
-- ============================================================

BEGIN;

-- SLA P1-P4
INSERT INTO sla_definicoes (prioridade, ttfr_min, ttr_min, sla_chegada_min) VALUES
  ('p1', 15,   240,   180),
  ('p2', 60,   1440,  1440),
  ('p3', 240,  4320,  4320),
  ('p4', 1440, 14400, NULL)
ON CONFLICT (prioridade) DO UPDATE
  SET ttfr_min = EXCLUDED.ttfr_min,
      ttr_min  = EXCLUDED.ttr_min,
      sla_chegada_min = EXCLUDED.sla_chegada_min;

-- Configurações padrão
INSERT INTO configuracoes (chave, valor) VALUES
  ('ia.enabled',                   'true'),
  ('ia.modelo',                    'gpt-4o-mini'),
  ('ia.system_prompt',             ''),
  ('alertas.email_destinatario',   ''),
  ('jobs.offline_intervalo_min',   '1'),
  ('gps.retencao_horas',           '72'),
  ('gps.frequencia_segundos',      '60'),
  ('leituras.retencao_dias',       '60'),
  ('leituras.cleanup_dry_run',     'false'),
  ('alertas.retencao_dias',        '365'),
  ('alertas.cleanup_dry_run',      'false'),
  ('conversas.retencao_dias',      '365'),
  ('conversas.cleanup_dry_run',    'false'),
  ('planos.geracao_enabled',          'true'),
  ('whatsapp.sessao_timeout_horas',   '8')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

COMMIT;
