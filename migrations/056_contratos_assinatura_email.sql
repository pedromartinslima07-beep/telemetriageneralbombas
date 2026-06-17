-- Migration 056 — Contratos: tokens e dados de assinatura por e-mail
--
-- Substitui a dependência de plataformas externas (ZapSign/D4Sign) por um
-- fluxo próprio: tokens únicos por signatário, confirmação via link no e-mail,
-- registro de nome + IP + timestamp como evidência.

BEGIN;

ALTER TABLE contratos
  -- Tokens únicos que formam os links de assinatura enviados por e-mail
  ADD COLUMN IF NOT EXISTS assinatura_token_cliente VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS assinatura_token_geral   VARCHAR(64) UNIQUE,
  -- Dados registrados no momento em que cada parte confirma
  ADD COLUMN IF NOT EXISTS assinatura_cliente_nome  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS assinatura_cliente_ip    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assinatura_cliente_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_geral_nome    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS assinatura_geral_ip      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assinatura_geral_em      TIMESTAMPTZ;

COMMIT;
