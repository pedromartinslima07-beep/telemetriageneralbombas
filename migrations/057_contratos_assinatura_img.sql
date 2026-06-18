-- Migration 057 — Contratos: imagem da assinatura (canvas PNG base64)
BEGIN;

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS assinatura_cliente_img TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_geral_img   TEXT;

COMMIT;
