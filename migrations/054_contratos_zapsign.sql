-- Migration 054 — Contratos: campos para assinatura digital via ZapSign
--
-- Adiciona: signatários (cliente + General Bombas), status ZapSign,
-- token do documento, URLs de assinatura e download, timestamps.

BEGIN;

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS signatario_nome       VARCHAR(200),
  ADD COLUMN IF NOT EXISTS signatario_email      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS signatario_geral_nome  VARCHAR(200) DEFAULT 'Ana Paula Martins Lima',
  ADD COLUMN IF NOT EXISTS signatario_geral_email VARCHAR(200) DEFAULT 'comercial@generalbombas.com',
  ADD COLUMN IF NOT EXISTS descricao_servico     TEXT,
  ADD COLUMN IF NOT EXISTS zapsign_token         VARCHAR(200),
  ADD COLUMN IF NOT EXISTS zapsign_status        VARCHAR(30)  NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS zapsign_url_cliente   TEXT,
  ADD COLUMN IF NOT EXISTS zapsign_url_geral     TEXT,
  ADD COLUMN IF NOT EXISTS zapsign_doc_url       TEXT,
  ADD COLUMN IF NOT EXISTS enviado_assinatura_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinado_em           TIMESTAMPTZ;

-- zapsign_status: rascunho | aguardando | assinado | recusado | cancelado
CREATE INDEX IF NOT EXISTS idx_contratos_zapsign_status
  ON contratos (zapsign_status)
  WHERE zapsign_status <> 'rascunho';

COMMIT;
