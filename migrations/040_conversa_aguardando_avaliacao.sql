-- Flag setada pelo job de timeout ao fechar uma conversa onde a IA respondeu.
-- Quando o cliente manda a nota (1-4), o webhook captura, salva a qualidade
-- na conversa fechada e limpa a flag — sem abrir nova conversa.
ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS aguardando_avaliacao BOOLEAN NOT NULL DEFAULT FALSE;
