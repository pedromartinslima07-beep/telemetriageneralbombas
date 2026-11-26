-- Migration 108 — Método da limpeza de reservatório (manual ou robô aspirador)
--
-- O modelo de limpeza de reservatório (060) descrevia só a limpeza manual:
-- esvaziamento total, escovação, lavagem. A General também faz a limpeza com
-- robô aspirador subaquático, sem esvaziar e sem cortar o abastecimento, e o
-- orçamento precisava sair com as cláusulas desse serviço.
--
-- Não é um tipo novo de orçamento: o serviço é o mesmo, muda o método. Por
-- isso fica numa coluna à parte, e vale tanto para 'limpeza_reservatorio'
-- quanto para 'limpeza_dedetizacao'. Nos outros tipos a coluna é ignorada.
--
-- Idempotente.

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS metodo_reservatorio VARCHAR(10) NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orcamentos_metodo_reservatorio_check'
  ) THEN
    ALTER TABLE orcamentos
      ADD CONSTRAINT orcamentos_metodo_reservatorio_check
      CHECK (metodo_reservatorio IN ('manual', 'robo'));
  END IF;
END $$;
