-- Migration 082 — Triagem de prioridade conforme a cláusula 7 da minuta
--
-- A minuta de contrato (Guarulhos Office Tower, 02/09/2026) define P1-P4 por
-- IMPACTO, não por tipo de problema:
--
--   P1  risco imediato de desabastecimento relevante, risco de inundação de
--       poço/área crítica, falha crítica de sistema essencial      → 3h
--   P2  falha relevante COM condição provisória, redundância parcial
--       ou sem risco imediato                                      → 48h
--   P3  anomalia sem risco imediato; reserva indisponível sem perda
--       da função principal; corretiva não crítica                 → 72h
--   P4  melhorias, levantamentos, adequações, estética, o que
--       depende de planejamento/orçamento                          → agendamento
--
-- Um "vazamento" pode ser P1 (alagando a casa de bombas) ou P3 (gotejando com
-- a reserva rodando): a categoria sozinha não classifica. Estas colunas
-- guardam as DUAS respostas de triagem que faltavam, o piso que elas
-- produziram e a justificativa de quem escolheu abaixo dele — que a cláusula
-- 7.1.c exige ("a prioridade poderá ser reclassificada tecnicamente após a
-- triagem ou chegada ao local, com justificativa").
--
-- Tudo NULLable: chamado antigo não tem triagem, e a ausência não é "não".

BEGIN;

-- As duas perguntas. NULL = não perguntado (chamado antigo, ou porta de
-- entrada que só informa categoria, como o painel do síndico).
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS triagem_risco_imediato BOOLEAN;
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS triagem_redundancia    BOOLEAN;

-- O piso calculado na abertura. Guardado (e não recalculado na leitura)
-- porque é o que permite dizer depois "este chamado NASCEU como P2 e alguém
-- baixou": recalcular usaria a regra de hoje, não a que valia na abertura.
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS prioridade_piso VARCHAR(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chamados_prioridade_piso_check'
  ) THEN
    ALTER TABLE chamados
      ADD CONSTRAINT chamados_prioridade_piso_check
      CHECK (prioridade_piso IS NULL OR prioridade_piso IN ('p1','p2','p3','p4'));
  END IF;
END $$;

-- A justificativa da cláusula 7.1.c, para a reclassificação feita NA ABERTURA.
-- Reclassificação posterior vai em historico_chamados.motivo (abaixo).
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS prioridade_motivo TEXT;

-- Justificativa das mudanças posteriores. O histórico já auditava o campo
-- `prioridade` (033), mas só o de/para — "P1 → P3" sem dizer por quê não
-- atende o contrato.
ALTER TABLE historico_chamados ADD COLUMN IF NOT EXISTS motivo TEXT;

-- ── SLA de P2: 24h → 48h ────────────────────────────────────────────────
-- A minuta fecha 48 horas para P2. O banco estava em 1440 min (24h) desde a
-- migration 028, cobrando a equipe mais cedo do que o contrato exige.
-- P1 (180 = 3h), P3 (4320 = 72h) e P4 (NULL = agendamento) já batiam.
UPDATE sla_definicoes SET sla_chegada_min = 2880
 WHERE prioridade = 'p2' AND sla_chegada_min = 1440;

COMMIT;
