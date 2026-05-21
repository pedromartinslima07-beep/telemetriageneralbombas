-- Migration 018 — Orçamento na Ordem de Serviço (Fase 7E refinamento)
-- Quando o técnico identifica que o reparo precisa de orçamento (peça cara,
-- intervenção fora do escopo, etc), ele preenche uma explicação que o admin
-- vai usar pra montar o orçamento formal numa página dedicada (futuro).

ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS orcamento_necessario  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orcamento_observacoes TEXT;

-- Index parcial: facilita futura página "Orçamentos pendentes"
CREATE INDEX IF NOT EXISTS idx_os_orcamento_necessario
  ON ordens_servico(criado_em DESC)
  WHERE orcamento_necessario = true;
