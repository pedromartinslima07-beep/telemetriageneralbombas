-- Migration 050: template de e-mail pessoal por usuário
-- Permite que cada usuário salve sua mensagem padrão e assinatura visual.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_mensagem TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_email_url TEXT;
