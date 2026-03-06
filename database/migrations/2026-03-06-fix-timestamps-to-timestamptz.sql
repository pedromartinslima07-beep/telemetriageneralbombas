-- Migração: converte todas as colunas timestamp without time zone para timestamptz
-- Motivo: EXTRACT(EPOCH FROM timestamp_without_timezone) ignora o session timezone
--         e trata o valor como UTC, causando deslocamento de 3h (UTC-3 Brasil).
-- Valores existentes são interpretados como America/Sao_Paulo (timezone do DB).

BEGIN;

-- leituras.criado_em
ALTER TABLE leituras
  ALTER COLUMN criado_em TYPE timestamp with time zone
  USING criado_em AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE leituras
  ALTER COLUMN criado_em SET DEFAULT now();

-- alertas.criado_em
ALTER TABLE alertas
  ALTER COLUMN criado_em TYPE timestamp with time zone
  USING criado_em AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE alertas
  ALTER COLUMN criado_em SET DEFAULT now();

-- alertas.atualizado_em
ALTER TABLE alertas
  ALTER COLUMN atualizado_em TYPE timestamp with time zone
  USING atualizado_em AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE alertas
  ALTER COLUMN atualizado_em SET DEFAULT now();

-- reservatorios.criado_em
ALTER TABLE reservatorios
  ALTER COLUMN criado_em TYPE timestamp with time zone
  USING criado_em AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE reservatorios
  ALTER COLUMN criado_em SET DEFAULT now();

-- reservatorios.last_seen
ALTER TABLE reservatorios
  ALTER COLUMN last_seen TYPE timestamp with time zone
  USING last_seen AT TIME ZONE 'America/Sao_Paulo';

-- usuarios.criado_em
ALTER TABLE usuarios
  ALTER COLUMN criado_em TYPE timestamp with time zone
  USING criado_em AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE usuarios
  ALTER COLUMN criado_em SET DEFAULT now();

COMMIT;
