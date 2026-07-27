-- Migration 066 — Vários técnicos responsáveis por zona
--
-- `planos_zona_responsavel` tinha `zona` como PRIMARY KEY, o que limitava a
-- um técnico por zona. Na operação real dois ou mais saem juntos para rodar as
-- preventivas de uma região — e quem não era "o responsável" abria o app e não
-- via nada, nem em Meus Chamados nem no Roteiro.
--
-- A chave passa a ser composta (zona, tecnico_id): a mesma zona aceita N
-- técnicos, e o mesmo técnico pode responder por várias zonas.

BEGIN;

-- Linhas com tecnico_id nulo nunca deveriam existir (a rota apagava a linha ao
-- remover o responsável), mas a coluna permitia — limpa antes de exigir NOT NULL.
DELETE FROM planos_zona_responsavel WHERE tecnico_id IS NULL;

ALTER TABLE planos_zona_responsavel
  DROP CONSTRAINT IF EXISTS planos_zona_responsavel_pkey;

ALTER TABLE planos_zona_responsavel
  ALTER COLUMN tecnico_id SET NOT NULL;

ALTER TABLE planos_zona_responsavel
  ADD CONSTRAINT planos_zona_responsavel_pkey PRIMARY KEY (zona, tecnico_id);

-- O roteiro do app busca "as zonas deste técnico" — este índice cobre esse lado.
CREATE INDEX IF NOT EXISTS idx_pzr_tecnico
  ON planos_zona_responsavel (tecnico_id);

COMMIT;
