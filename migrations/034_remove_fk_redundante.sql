-- Migration 034 — Remove FK bidirecional redundante chamados↔ordens_servico
--
-- Antes existiam DUAS FKs pra ligar chamado e O.S.:
--   chamados.ordem_servico_id → ordens_servico (criada em 015)
--   ordens_servico.chamado_id → chamados        (criada em 015)
--
-- Manter as duas tinha 2 custos: (1) escritas precisavam sincronizar as duas
-- pontas, criando risco de inconsistência; (2) confusão sobre qual é a "fonte
-- da verdade". Ficamos só com ordens_servico.chamado_id (direção natural —
-- a O.S. nasce vinculada a um chamado).
--
-- Adiciona UNIQUE pra garantir que a inversão preserve a semântica 1:1 do
-- chamados.ordem_servico_id antigo (1 chamado → no máximo 1 O.S.).
--
-- Pré-requisitos checados no banco antes desta migration:
--   - 0 chamados com >1 O.S. (não tem duplicata pra falhar o UNIQUE)
--   - 0 inconsistências entre as duas FKs

BEGIN;

-- Garante 1 O.S. por chamado (alinha com a semântica antiga da FK que vai sair)
ALTER TABLE ordens_servico
  ADD CONSTRAINT ordens_servico_chamado_id_uniq UNIQUE (chamado_id);

-- Remove a FK redundante
ALTER TABLE chamados DROP COLUMN IF EXISTS ordem_servico_id;

COMMIT;
