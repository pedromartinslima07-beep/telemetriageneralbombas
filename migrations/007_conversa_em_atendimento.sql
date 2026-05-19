-- Expande o check constraint para permitir o novo status em_atendimento.
ALTER TABLE conversas_whatsapp DROP CONSTRAINT IF EXISTS conversas_whatsapp_status_check;
ALTER TABLE conversas_whatsapp ADD CONSTRAINT conversas_whatsapp_status_check
  CHECK (status IN ('aberta', 'em_atendimento', 'fechada'));

-- Migra conversas já assumidas para o novo status.
UPDATE conversas_whatsapp
SET status = 'em_atendimento'
WHERE assumida_por_id IS NOT NULL AND status = 'aberta';
