-- Fase 10: flag para pausar a IA quando ela decide escalar para atendente humano.
-- Diferente de assumida_por_id (que exige um usuário admin), essa flag é setada
-- pela própria IA via tool escalar_para_atendente — sem precisar de intervenção humana.
-- Limpa automaticamente quando um atendente clica em "Assumir".
ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS aguardando_atendente BOOLEAN NOT NULL DEFAULT FALSE;
