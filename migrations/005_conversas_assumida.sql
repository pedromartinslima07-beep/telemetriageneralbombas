-- Permite um atendente humano "assumir" uma conversa do WhatsApp.
-- Quando assumida_por_id != NULL, a IA para de responder automaticamente
-- (a verificacao é feita no whatsapp.controller antes de chamar a IA).
--
-- Devolver pra IA = limpa os dois campos (UPDATE SET assumida_por_id = NULL,
-- assumida_em = NULL).

ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS assumida_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assumida_em     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversas_assumida
  ON conversas_whatsapp (assumida_por_id)
  WHERE assumida_por_id IS NOT NULL;
