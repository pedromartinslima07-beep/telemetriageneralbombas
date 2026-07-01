-- Migration 061 — Data do documento no orçamento (editável)
--
-- A "Data" mostrada no PDF do orçamento sempre veio de `criado_em`
-- (timestamp automático de quando o registro foi criado no banco),
-- sem forma de ajustar manualmente. Esta coluna permite o admin
-- definir/corrigir a data que aparece no documento sem mexer em
-- `criado_em` (que é auditoria, não deve ser editado).

BEGIN;

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS data_documento DATE;

COMMIT;
