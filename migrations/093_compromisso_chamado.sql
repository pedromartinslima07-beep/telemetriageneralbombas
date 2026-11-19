-- 093 — A visita da agenda sabe de que chamado ela é (19/11/2026)
--
-- Redesenho estrutural do admin, etapa 4: a Agenda virou quadro de despacho
-- (técnicos nas linhas, dias nas colunas) e o Pedro pediu arrastar e soltar.
-- Arrastar um chamado para um técnico num dia cria um compromisso tipo
-- "visita" LIGADO ao chamado e atribui o técnico ao chamado (rota de sempre,
-- PATCH /chamados/:id). Sem esta coluna a ligação ficaria só no título, e o
-- quadro não saberia tirar o chamado da coluna "a agendar".
--
-- Aditiva e idempotente: compromisso antigo fica com chamado_id NULL.
-- ⚠️ O código da agenda lê esta coluna: rodar em PRODUÇÃO ANTES do push
-- (push na main = deploy), junto com 090, 091 e 092.

ALTER TABLE compromissos
  ADD COLUMN IF NOT EXISTS chamado_id INTEGER REFERENCES chamados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS compromissos_chamado_idx
  ON compromissos (chamado_id) WHERE chamado_id IS NOT NULL AND apagado_em IS NULL;
