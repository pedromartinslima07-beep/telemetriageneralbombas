-- Contador de trocas consecutivas onde a IA não avançou (não abriu chamado,
-- orçamento, vinculou cliente ou escalou). Ao atingir 3 → escalação automática.
-- Reseta quando qualquer ferramenta de progresso é chamada.
ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS ia_sem_avanco SMALLINT NOT NULL DEFAULT 0;
