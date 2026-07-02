-- Migration 062 — Valor unitário opcional em itens de orçamento (peças)
--
-- Antes, `valor_unitario` era NOT NULL DEFAULT 0: item sem preço lançado
-- virava "R$ 0,00" no PDF, indistinguível de um item realmente gratuito.
-- Agora aceita NULL — item sem valor unitário lançado tem a coluna de
-- valor omitida no PDF (ver orcamento-pdf.service.js).
--
-- `orcamentos.valor` já existia (herdado do fluxo antigo de aprovação por
-- O.S.) e passa a servir também como override manual do total exibido no
-- PDF de orçamentos avulsos — útil quando nem todo item tem preço
-- unitário e a soma automática não reflete o total real.

ALTER TABLE orcamento_linhas ALTER COLUMN valor_unitario DROP NOT NULL;
ALTER TABLE orcamento_linhas ALTER COLUMN valor_unitario DROP DEFAULT;
