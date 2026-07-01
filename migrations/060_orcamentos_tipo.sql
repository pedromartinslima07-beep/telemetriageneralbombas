-- Migration 060 — Tipo do orçamento (peças/serviço, limpeza de reservatório,
-- dedetização, ou os dois combinados)
--
-- O modelo de orçamento era único e fixo, pensado pra peças/produtos técnicos
-- (ficha_tecnica com marca/potência etc.). Esta coluna permite oferecer
-- modelos de orçamento de serviço (limpeza de reservatório de água potável e
-- dedetização) reaproveitando a mesma tabela, mesmo PDF e mesmo timbrado —
-- só muda o título do documento e os itens pré-preenchidos no admin.

BEGIN;

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'pecas'
    CHECK (tipo IN ('pecas','limpeza_reservatorio','dedetizacao','limpeza_dedetizacao'));

COMMIT;
