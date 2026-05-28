-- Canal de origem da conversa: 'whatsapp' (externo) ou 'app' (chat interno do app do cliente).
-- Permite que a central de atendimento atenda os dois canais com a mesma infraestrutura.
ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS canal VARCHAR(20) NOT NULL DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_conversas_canal ON conversas_whatsapp(canal);
