-- State machine formal da conversa (Prioridade 4)
-- estado_conversa: triagem → aguardando_confirmacao → chamado_aberto | escalado | finalizado
--
-- pendente_acao: armazena os params do chamado que a IA quer abrir mas
-- o backend retém até o cliente confirmar (Prioridade 3 — backend como juiz final).
-- P1 bypassa este mecanismo (emergência = ação imediata).
ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS estado_conversa VARCHAR(30) NOT NULL DEFAULT 'triagem',
  ADD COLUMN IF NOT EXISTS pendente_acao   JSONB;
