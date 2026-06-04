-- Envio de orçamento por e-mail ao cliente.
-- Rastreio de quando/para quem o orçamento foi enviado + e-mail do condomínio
-- passa a aceitar múltiplos endereços (separados por vírgula).

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS enviado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviado_para TEXT;

-- múltiplos e-mails podem ultrapassar 255 chars
ALTER TABLE condominios ALTER COLUMN email TYPE TEXT;
