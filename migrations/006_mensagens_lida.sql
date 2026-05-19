-- Rastreia quando cada mensagem de entrada foi lida pelo painel admin.
-- Mensagens de saída ficam com lida_em NULL (não se aplica).
ALTER TABLE mensagens_whatsapp ADD COLUMN IF NOT EXISTS lida_em TIMESTAMPTZ;
