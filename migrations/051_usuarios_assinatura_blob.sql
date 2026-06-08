-- Migration 051: guarda imagem de assinatura no banco (bytea) em vez do filesystem
-- Filesystem do Railway é efêmero; banco persiste.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS assinatura_blob    BYTEA,
  ADD COLUMN IF NOT EXISTS assinatura_mimetype VARCHAR(50);
