-- Migration 063 — Contratos: código de verificação por e-mail + protocolo de assinatura
--
-- Reforça o fluxo próprio de assinatura (migration 056): antes de assinar, o
-- signatário precisa confirmar um código de 6 dígitos enviado ao e-mail
-- cadastrado (mesmo princípio do 2FA de login). Isso fecha a brecha de
-- "quem tiver o link assina" — o link sozinho deixa de ser suficiente.
--
-- Também adiciona um "protocolo de assinatura" (hash com contrato+papel+
-- nome+doc+ip+timestamp) gravado no momento da confirmação, pra ser impresso
-- no PDF final como evidência auditável (ver contrato-pdf.service.js).

BEGIN;

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS assinatura_cliente_codigo            VARCHAR(6),
  ADD COLUMN IF NOT EXISTS assinatura_cliente_codigo_expira      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_cliente_codigo_tentativas  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assinatura_cliente_codigo_enviado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_geral_codigo               VARCHAR(6),
  ADD COLUMN IF NOT EXISTS assinatura_geral_codigo_expira        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_geral_codigo_tentativas    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assinatura_geral_codigo_enviado_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_cliente_protocolo          VARCHAR(40),
  ADD COLUMN IF NOT EXISTS assinatura_geral_protocolo            VARCHAR(40);

COMMIT;
