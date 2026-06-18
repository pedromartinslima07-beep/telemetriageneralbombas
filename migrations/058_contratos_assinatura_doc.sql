-- Migration 058 — Contratos: documento (CPF/RG) do signatário
BEGIN;

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS assinatura_cliente_doc TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_geral_doc   TEXT;

COMMIT;
