-- Migration 064 — Contratos: remove nome fixo de "representante da General
-- Bombas" pré-preenchido por default (migration 054)
--
-- O DEFAULT 'Ana Paula Martins Lima' em signatario_geral_nome fazia todo
-- contrato novo nascer com esse nome, mesmo sem ninguém ter escolhido isso.
-- Nenhum contrato foi de fato assinado sob esse nome (assinatura_geral_nome
-- continua NULL em todos), então é seguro limpar os valores existentes que
-- ainda carregam o default sem confirmação de assinatura.
-- (signatario_geral_email mantém o default — é o e-mail real da empresa,
-- não um nome de pessoa.)

BEGIN;

ALTER TABLE contratos
  ALTER COLUMN signatario_geral_nome DROP DEFAULT;

UPDATE contratos
SET signatario_geral_nome = NULL
WHERE signatario_geral_nome = 'Ana Paula Martins Lima'
  AND assinatura_geral_em IS NULL;

COMMIT;
